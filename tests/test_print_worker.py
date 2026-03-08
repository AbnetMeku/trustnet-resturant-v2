from datetime import timedelta

import pytest
from PIL import Image

from app import create_app, db
from app.models.models import BrandingSettings, MenuItem, Order, OrderItem, PrintJob, Station, Table, User
from app.utils.timezone import eat_now_naive
from app.workers.PrintWorker import PrintWorker, _build_database_uri_from_env


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def worker(app):
    return PrintWorker(
        database_uri=app.config["SQLALCHEMY_DATABASE_URI"],
        check_interval_seconds=1,
        max_retries=2,
        retry_delay_seconds=10,
        default_printer_ip="127.0.0.1",
    )


def _seed_order_base():
    waiter = User(username="pw_waiter", password_hash="hash", role="waiter")
    table = Table(number="PW-T1")
    station = Station(name="PW-Station", password_hash="hash", printer_identifier="10.0.0.10")
    db.session.add_all([waiter, table, station])
    db.session.flush()
    menu_item = MenuItem(name="PW-Item", price=25, station_id=station.id, is_available=True)
    db.session.add(menu_item)
    db.session.flush()
    order = Order(table_id=table.id, user_id=waiter.id, status="open", total_amount=25)
    db.session.add(order)
    db.session.flush()
    order_item = OrderItem(
        order_id=order.id,
        menu_item_id=menu_item.id,
        quantity=1,
        price=25,
        station=station.name,
        status="pending",
    )
    db.session.add(order_item)
    db.session.commit()
    return order, order_item, station


def test_fetch_next_job_skips_future_retry_after(app, worker):
    with app.app_context():
        order, _, station = _seed_order_base()
        future_job = PrintJob(
            order_id=order.id,
            station_id=station.id,
            type="station",
            status="pending",
            retry_after=eat_now_naive() + timedelta(minutes=5),
            items_data={"items": [{"name": "late"}]},
        )
        due_job = PrintJob(
            order_id=order.id,
            station_id=station.id,
            type="station",
            status="pending",
            retry_after=eat_now_naive() - timedelta(seconds=1),
            items_data={"items": [{"name": "due"}]},
        )
        db.session.add_all([future_job, due_job])
        db.session.commit()

        session = worker.Session()
        picked = worker.fetch_next_job(session)
        session.close()

        assert picked is not None
        assert picked.id == due_job.id

        refreshed_due = db.session.get(PrintJob, due_job.id)
        refreshed_future = db.session.get(PrintJob, future_job.id)
        assert refreshed_due.status == "in_progress"
        assert refreshed_future.status == "pending"


def test_process_job_success_marks_printed_and_items_ready(app, worker, monkeypatch):
    with app.app_context():
        order, order_item, station = _seed_order_base()
        job = PrintJob(
            order_id=order.id,
            station_id=station.id,
            type="station",
            status="pending",
            items_data={
                "waiter": "pw_waiter",
                "table": "PW-T1",
                "items": [{"item_id": order_item.id, "name": "PW-Item", "quantity": 1}],
            },
        )
        db.session.add(job)
        db.session.commit()

        monkeypatch.setattr(worker, "render_ticket", lambda *_: Image.new("1", (10, 10), 1))
        monkeypatch.setattr(worker, "print_ticket_image", lambda *_: (True, None))

        session = worker.Session()
        picked = worker.fetch_next_job(session)
        session.close()
        worker.process_job(picked.id)

        saved_job = db.session.get(PrintJob, job.id)
        saved_item = db.session.get(OrderItem, order_item.id)
        assert saved_job.status == "printed"
        assert saved_job.printed_at is not None
        assert saved_job.retry_after is None
        assert saved_job.error_message is None
        assert saved_item.status == "ready"


def test_process_job_failure_retries_then_fails(app, worker, monkeypatch):
    with app.app_context():
        order, _, station = _seed_order_base()
        job = PrintJob(
            order_id=order.id,
            station_id=station.id,
            type="station",
            status="pending",
            items_data={"items": [{"name": "PW-Item", "quantity": 1}]},
        )
        db.session.add(job)
        db.session.commit()

        monkeypatch.setattr(worker, "render_ticket", lambda *_: Image.new("1", (10, 10), 1))
        monkeypatch.setattr(worker, "print_ticket_image", lambda *_: (False, "printer offline"))

        # First failure -> pending with retry_after
        session = worker.Session()
        picked = worker.fetch_next_job(session)
        session.close()
        worker.process_job(picked.id)

        first = db.session.get(PrintJob, job.id)
        assert first.status == "pending"
        assert first.attempts == 1
        assert first.retry_after is not None
        assert first.error_message == "printer offline"

        # Make it due now and fail again -> failed
        first.retry_after = eat_now_naive() - timedelta(seconds=1)
        db.session.commit()

        session = worker.Session()
        picked_again = worker.fetch_next_job(session)
        session.close()
        assert picked_again is not None
        worker.process_job(picked_again.id)

        second = db.session.get(PrintJob, job.id)
        assert second.status == "failed"
        assert second.attempts == 2
        assert second.retry_after is None
        assert second.error_message == "printer offline"


def test_process_job_shows_preview_when_enabled(app, worker, monkeypatch):
    with app.app_context():
        order, _, station = _seed_order_base()
        settings = BrandingSettings(id=1, print_preview_enabled=True)
        db.session.add(settings)

        job = PrintJob(
            order_id=order.id,
            station_id=station.id,
            type="station",
            status="pending",
            items_data={"items": [{"name": "PW-Item", "quantity": 1}]},
        )
        db.session.add(job)
        db.session.commit()

        preview_calls = []
        monkeypatch.setattr(Image.Image, "show", lambda _self, title=None: preview_calls.append(title))
        monkeypatch.setattr(worker, "render_ticket", lambda *_: Image.new("1", (10, 10), 1))
        monkeypatch.setattr(worker, "print_ticket_image", lambda *_: (True, None))

        session = worker.Session()
        picked = worker.fetch_next_job(session)
        session.close()
        worker.process_job(picked.id)

        assert len(preview_calls) == 1
        assert preview_calls[0] == f"Job {job.id} Preview"


def test_build_database_uri_from_env_prefers_explicit_uri(monkeypatch):
    monkeypatch.setenv("SQLALCHEMY_DATABASE_URI", "postgresql://explicit")
    monkeypatch.setenv("DB_USER", "user1")
    monkeypatch.setenv("DB_PASSWORD", "pass1")
    monkeypatch.setenv("DB_HOST", "localhost")
    monkeypatch.setenv("DB_PORT", "5432")
    monkeypatch.setenv("DB_NAME", "db1")

    assert _build_database_uri_from_env() == "postgresql://explicit"


def test_build_database_uri_from_env_falls_back_to_db_parts(monkeypatch):
    monkeypatch.delenv("SQLALCHEMY_DATABASE_URI", raising=False)
    monkeypatch.delenv("DATABASE_URI", raising=False)
    monkeypatch.setenv("DB_USER", "user1")
    monkeypatch.setenv("DB_PASSWORD", "pass1")
    monkeypatch.setenv("DB_HOST", "localhost")
    monkeypatch.setenv("DB_PORT", "5432")
    monkeypatch.setenv("DB_NAME", "db1")

    assert _build_database_uri_from_env() == "postgresql://user1:pass1@localhost:5432/db1"
