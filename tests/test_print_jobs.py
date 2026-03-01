import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import MenuItem, Order, OrderItem, PrintJob, Station, Table, User
from app.routes.print.print_jobs import create_cashier_print_job, create_station_print_jobs


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
        assert "copy" not in jobs[0].items_data


def test_create_station_print_jobs_separate_mode_creates_one_job_per_item(app):
    with app.app_context():
        waiter = User(username="print_waiter_sep", password_hash="h", role="waiter")
        table = Table(number="T-3B")
        station = Station(
            name="split-station",
            password_hash="hash",
            printer_identifier="192.168.1.101",
            print_mode="separate",
        )
        db.session.add_all([waiter, table, station])
        db.session.commit()

        item_a = MenuItem(name="Split A", price=10, station_id=station.id, is_available=True)
        item_b = MenuItem(name="Split B", price=12, station_id=station.id, is_available=True)
        db.session.add_all([item_a, item_b])
        db.session.commit()

        order = Order(table_id=table.id, user_id=waiter.id, status="open", total_amount=22)
        db.session.add(order)
        db.session.commit()

        order_item_a = OrderItem(
            order_id=order.id,
            menu_item_id=item_a.id,
            quantity=1,
            price=10,
            station="split-station",
            status="pending",
        )
        order_item_b = OrderItem(
            order_id=order.id,
            menu_item_id=item_b.id,
            quantity=1,
            price=12,
            station="split-station",
            status="pending",
        )
        db.session.add_all([order_item_a, order_item_b])
        db.session.commit()

        create_station_print_jobs(order, only_new_items=True, item_ids=[order_item_a.id, order_item_b.id])

        jobs = PrintJob.query.filter_by(order_id=order.id, station_id=station.id).order_by(PrintJob.id.asc()).all()
        assert len(jobs) == 2
        for job in jobs:
            payload_items = job.items_data.get("items", [])
            assert len(payload_items) == 1
            assert "copy" not in job.items_data


def test_admin_print_jobs_end_to_end_list_mark_retry_delete(client, app):
    with app.app_context():
        admin = User(username="admin_jobs", password_hash="h", role="admin")
        waiter = User(username="waiter_jobs", password_hash="h", role="waiter")
        table = Table(number="T-4")
        station = Station(name="kitchen_jobs", password_hash="hash", printer_identifier="10.0.0.5")
        db.session.add_all([admin, waiter, table, station])
        db.session.flush()
        menu_item = MenuItem(name="Doro", price=15, station_id=station.id, is_available=True)
        db.session.add(menu_item)
        db.session.commit()

        order = Order(table_id=table.id, user_id=waiter.id, status="open", total_amount=30)
        db.session.add(order)
        db.session.commit()

        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=2,
            price=15,
            station=station.name,
            status="pending",
            prep_tag="0007",
        )
        db.session.add(order_item)
        db.session.commit()

        pending_job = PrintJob(
            order_id=order.id,
            station_id=station.id,
            type="station",
            status="pending",
            items_data={
                "order_id": order.id,
                "table": table.number,
                "waiter": waiter.username,
                "items": [
                    {
                        "item_id": order_item.id,
                        "name": menu_item.name,
                        "quantity": 2,
                        "station": station.name,
                        "prep_tag": "0007",
                    }
                ],
            },
        )
        failed_job = PrintJob(
            order_id=order.id,
            station_id=station.id,
            type="station",
            status="failed",
            items_data={
                "order_id": order.id,
                "table": table.number,
                "waiter": waiter.username,
                "items": [{"item_id": order_item.id, "name": menu_item.name}],
            },
        )
        db.session.add_all([pending_job, failed_job])
        db.session.commit()

        admin_token = _make_token(admin.id, "admin")
        pending_job_id = pending_job.id
        failed_job_id = failed_job.id

    # list jobs (UI depends on this payload shape)
    list_response = client.get("/api/print-jobs", headers=_auth_headers(admin_token))
    assert list_response.status_code == 200
    jobs = list_response.get_json()
    assert any(j["id"] == pending_job_id for j in jobs)
    matched = next(j for j in jobs if j["id"] == pending_job_id)
    assert matched["items_data"]["waiter"] == "waiter_jobs"
    assert matched["items_data"]["items"][0]["name"] == "Doro"

    # mark pending job printed
    printed_response = client.post(
        f"/api/print-jobs/{pending_job_id}/printed",
        headers=_auth_headers(admin_token),
    )
    assert printed_response.status_code == 200

    # retry failed job
    retry_response = client.post(
        f"/api/print-jobs/{failed_job_id}/retry",
        headers=_auth_headers(admin_token),
    )
    assert retry_response.status_code == 200

    # delete pending/failed(retried) job
    delete_response = client.delete(
        f"/api/print-jobs/{pending_job_id}",
        headers=_auth_headers(admin_token),
    )
    assert delete_response.status_code == 200


def test_create_cashier_print_job_uses_cashier_flagged_station(app):
    with app.app_context():
        waiter = User(username="cash_waiter", password_hash="h", role="waiter")
        table = Table(number="T-CASH")
        kitchen_station = Station(name="KitchenX", password_hash="hash", printer_identifier="10.0.0.10")
        cashier_station = Station(
            name="CashierPrinterStation",
            password_hash="hash",
            printer_identifier="10.0.0.20",
            cashier_printer=True,
        )
        db.session.add_all([waiter, table, kitchen_station, cashier_station])
        db.session.flush()

        menu_item = MenuItem(name="Cash Item", price=20, station_id=kitchen_station.id, is_available=True)
        db.session.add(menu_item)
        db.session.flush()

        order = Order(table_id=table.id, user_id=waiter.id, status="closed", total_amount=20)
        db.session.add(order)
        db.session.flush()

        db.session.add(
            OrderItem(
                order_id=order.id,
                menu_item_id=menu_item.id,
                quantity=1,
                price=20,
                station=kitchen_station.name,
                status="ready",
            )
        )
        db.session.commit()

        job = create_cashier_print_job(order.id)
        assert job.type == "cashier"
        assert job.station_id == cashier_station.id


def test_create_cashier_print_job_requires_flagged_cashier_station(app):
    with app.app_context():
        waiter = User(username="cash_waiter_missing", password_hash="h", role="waiter")
        table = Table(number="T-CASH-ERR")
        kitchen_station = Station(name="KitchenOnly", password_hash="hash", printer_identifier="10.0.0.10")
        db.session.add_all([waiter, table, kitchen_station])
        db.session.flush()

        menu_item = MenuItem(name="Cash Item Missing", price=20, station_id=kitchen_station.id, is_available=True)
        db.session.add(menu_item)
        db.session.flush()

        order = Order(table_id=table.id, user_id=waiter.id, status="closed", total_amount=20)
        db.session.add(order)
        db.session.flush()

        db.session.add(
            OrderItem(
                order_id=order.id,
                menu_item_id=menu_item.id,
                quantity=1,
                price=20,
                station=kitchen_station.name,
                status="ready",
            )
        )
        db.session.commit()

        with pytest.raises(ValueError, match="No cashier printer station configured"):
            create_cashier_print_job(order.id)
