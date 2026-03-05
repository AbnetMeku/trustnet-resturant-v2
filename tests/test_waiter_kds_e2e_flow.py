from decimal import Decimal

import pytest
from werkzeug.security import generate_password_hash

from app import create_app, db
from app.models.models import Category, MenuItem, Station, SubCategory, Table, User
from app.utils.timezone import get_eat_today


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


def _auth_headers(token: str):
    return {"Authorization": f"Bearer {token}"}


def test_waiter_to_kds_end_to_end_flow(client, app):
    with app.app_context():
        waiter = User(username="waiter_kds_e2e", password_hash="x", pin_hash="1234", role="waiter")
        table = Table(number="KDS-E2E-1")
        table.waiters.append(waiter)

        station = Station(name="Kitchen", password_hash=generate_password_hash("4321"))
        category = Category(name="Food", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Main", category=category)
        menu_item = MenuItem(
            name="Doro Wat",
            price=Decimal("20.00"),
            is_available=True,
            station_rel=station,
            subcategory=subcategory,
        )
        db.session.add_all([waiter, table, station, category, subcategory, menu_item])
        db.session.commit()

        table_id = table.id
        menu_item_id = menu_item.id

    waiter_login = client.post("/api/auth/pin/waiter", json={"pin": "1234"})
    assert waiter_login.status_code == 200
    waiter_token = waiter_login.get_json()["access_token"]

    create_order = client.post(
        "/api/orders/",
        json={
            "table_id": table_id,
            "items": [{"menu_item_id": menu_item_id, "quantity": 2, "notes": "extra spicy"}],
        },
        headers=_auth_headers(waiter_token),
    )
    assert create_order.status_code == 201
    order_payload = create_order.get_json()
    assert order_payload["table_id"] == table_id
    assert order_payload["status"] == "open"
    assert any(item["menu_item_id"] == menu_item_id for item in order_payload["active_items"])

    station_login = client.post("/api/auth/pin/station", json={"pin": "4321"})
    assert station_login.status_code == 200
    station_token = station_login.get_json()["access_token"]

    pending_orders = client.get("/api/stations/kds/orders", headers=_auth_headers(station_token))
    assert pending_orders.status_code == 200
    pending_payload = pending_orders.get_json()
    assert len(pending_payload) >= 1

    target_item = None
    target_order = None
    for order in pending_payload:
        for item in order["items"]:
            if item["menu_item_id"] == menu_item_id and item["status"] == "pending":
                target_item = item
                target_order = order
                break
        if target_item:
            break

    assert target_item is not None
    assert target_order is not None
    assert target_item["prep_tag"] is not None

    update_status = client.put(
        f"/api/stations/kds/orders/{target_item['item_id']}/status",
        json={"status": "ready"},
        headers=_auth_headers(station_token),
    )
    assert update_status.status_code == 200
    assert update_status.get_json()["item"]["status"] == "ready"

    pending_after_ready = client.get("/api/stations/kds/orders", headers=_auth_headers(station_token))
    assert pending_after_ready.status_code == 200
    for order in pending_after_ready.get_json():
        for item in order["items"]:
            assert not (item["item_id"] == target_item["item_id"] and item["status"] == "pending")

    history = client.get(
        f"/api/stations/kds/orders/history?date={get_eat_today().isoformat()}",
        headers=_auth_headers(station_token),
    )
    assert history.status_code == 200
    history_payload = history.get_json()
    assert len(history_payload) >= 1
    assert any(
        any(i["item_id"] == target_item["item_id"] and i["status"] == "ready" for i in order["items"])
        for order in history_payload
    )

    waiter_on_kds = client.get("/api/stations/kds/orders", headers=_auth_headers(waiter_token))
    assert waiter_on_kds.status_code == 403
