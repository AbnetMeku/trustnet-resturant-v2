import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import MenuItem, Order, OrderItem, PrintJob, Station, Table, User
from app.routes.print.print_jobs import create_station_print_jobs


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def _make_token(user_id, role):
    return create_access_token(identity=str(user_id), additional_claims={"role": role})


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_waiter_can_only_see_own_failed_jobs(client, app):
    with app.app_context():
        waiter_one = User(username="w_one", password_hash="h", role="waiter")
        waiter_two = User(username="w_two", password_hash="h", role="waiter")
        table = Table(number="T-1")
        db.session.add_all([waiter_one, waiter_two, table])
        db.session.commit()

        order_one = Order(table_id=table.id, user_id=waiter_one.id, status="open", total_amount=0)
        order_two = Order(table_id=table.id, user_id=waiter_two.id, status="open", total_amount=0)
        db.session.add_all([order_one, order_two])
        db.session.commit()

        job_one = PrintJob(order_id=order_one.id, station_id=None, type="station", items_data={"items": []}, status="failed")
        job_two = PrintJob(order_id=order_two.id, station_id=None, type="station", items_data={"items": []}, status="failed")
        db.session.add_all([job_one, job_two])
        db.session.commit()
        job_one_order_id = job_one.order_id

        token = _make_token(waiter_one.id, "waiter")

    response = client.get("/api/print-jobs?status=failed", headers=_auth_headers(token))
    assert response.status_code == 200
    data = response.get_json()
    assert len(data) == 1
    assert data[0]["order_id"] == job_one_order_id


def test_waiter_retry_allowed_only_on_own_failed_job(client, app):
    with app.app_context():
        waiter_one = User(username="rw_one", password_hash="h", role="waiter")
        waiter_two = User(username="rw_two", password_hash="h", role="waiter")
        table = Table(number="T-2")
        db.session.add_all([waiter_one, waiter_two, table])
        db.session.commit()

        order_one = Order(table_id=table.id, user_id=waiter_one.id, status="open", total_amount=0)
        order_two = Order(table_id=table.id, user_id=waiter_two.id, status="open", total_amount=0)
        db.session.add_all([order_one, order_two])
        db.session.commit()

        own_job = PrintJob(order_id=order_one.id, station_id=None, type="station", items_data={"items": []}, status="failed")
        other_job = PrintJob(order_id=order_two.id, station_id=None, type="station", items_data={"items": []}, status="failed")
        db.session.add_all([own_job, other_job])
        db.session.commit()
        own_job_id = own_job.id
        other_job_id = other_job.id

        waiter_token = _make_token(waiter_one.id, "waiter")

    own_response = client.post(f"/api/print-jobs/{own_job_id}/retry", headers=_auth_headers(waiter_token))
    assert own_response.status_code == 200

    other_response = client.post(f"/api/print-jobs/{other_job_id}/retry", headers=_auth_headers(waiter_token))
    assert other_response.status_code == 403


def test_create_station_print_jobs_only_new_item_ids(app):
    with app.app_context():
        waiter = User(username="print_waiter", password_hash="h", role="waiter")
        table = Table(number="T-3")
        station = Station(name="main-station", password_hash="hash", printer_identifier="192.168.1.100")
        db.session.add_all([waiter, table, station])
        db.session.commit()

        old_item = MenuItem(name="Old Soup", price=10, station_id=station.id, is_available=True)
        new_item = MenuItem(name="New Soup", price=12, station_id=station.id, is_available=True)
        db.session.add_all([old_item, new_item])
        db.session.commit()

        order = Order(table_id=table.id, user_id=waiter.id, status="open", total_amount=22)
        db.session.add(order)
        db.session.commit()

        old_order_item = OrderItem(
            order_id=order.id,
            menu_item_id=old_item.id,
            quantity=1,
            price=10,
            station="main-station",
            status="pending",
        )
        new_order_item = OrderItem(
            order_id=order.id,
            menu_item_id=new_item.id,
            quantity=1,
            price=12,
            station="main-station",
            status="pending",
        )
        db.session.add_all([old_order_item, new_order_item])
        db.session.commit()

        create_station_print_jobs(order, only_new_items=True, item_ids=[new_order_item.id])

        jobs = PrintJob.query.filter_by(order_id=order.id).all()
        assert len(jobs) == 1
        items = jobs[0].items_data.get("items", [])
        assert len(items) == 1
        assert items[0]["item_id"] == new_order_item.id
