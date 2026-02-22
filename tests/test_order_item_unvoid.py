from decimal import Decimal

import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import MenuItem, Order, OrderItem, Station, SubCategory, Category, Table, User


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


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_unvoid_recalculates_total_and_returns_order_payload(client, app):
    with app.app_context():
        waiter = User(username="waiter_unvoid", password_hash="h", role="waiter")
        table = Table(number="901")
        table.waiters.append(waiter)
        station = Station(name="unvoid_station", password_hash="hash")
        category = Category(name="Unvoid Cat", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Unvoid Sub", category=category)
        menu_item = MenuItem(
            name="Unvoid Item",
            price=Decimal("12.00"),
            station_rel=station,
            subcategory=subcategory,
            is_available=True,
        )
        db.session.add_all([waiter, table, station, category, subcategory, menu_item])
        db.session.flush()

        order = Order(table_id=table.id, user_id=waiter.id, status="open", total_amount=Decimal("0.00"))
        db.session.add(order)
        db.session.flush()

        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=Decimal("2.00"),
            price=Decimal("12.00"),
            status="void",
            station=station.name,
        )
        db.session.add(order_item)
        db.session.commit()
        order_id = order.id
        order_item_id = order_item.id
        menu_item_id = menu_item.id

        waiter_token = create_access_token(
            identity=str(waiter.id),
            additional_claims={"role": "waiter", "username": waiter.username},
        )

    response = client.patch(
        f"/api/orders/{order_id}/items/{order_item_id}/unvoid",
        headers=_auth_headers(waiter_token),
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert "total_amount" in payload
    assert payload["total_amount"] == 24.0
    assert any(item["menu_item_id"] == menu_item_id for item in payload["active_items"])


def test_unvoid_requires_allowed_role(client, app):
    with app.app_context():
        cashier = User(username="cashier_unvoid", password_hash="h", role="cashier")
        waiter = User(username="waiter_unvoid_2", password_hash="h", role="waiter")
        table = Table(number="902")
        table.waiters.append(waiter)
        station = Station(name="unvoid_station_2", password_hash="hash")
        category = Category(name="Unvoid Cat 2", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Unvoid Sub 2", category=category)
        menu_item = MenuItem(
            name="Unvoid Item 2",
            price=Decimal("8.00"),
            station_rel=station,
            subcategory=subcategory,
            is_available=True,
        )
        db.session.add_all([cashier, waiter, table, station, category, subcategory, menu_item])
        db.session.flush()

        order = Order(table_id=table.id, user_id=waiter.id, status="open", total_amount=Decimal("0.00"))
        db.session.add(order)
        db.session.flush()

        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=Decimal("1.00"),
            price=Decimal("8.00"),
            status="void",
            station=station.name,
        )
        db.session.add(order_item)
        db.session.commit()
        order_id = order.id
        order_item_id = order_item.id

        cashier_token = create_access_token(
            identity=str(cashier.id),
            additional_claims={"role": "cashier", "username": cashier.username},
        )

    response = client.patch(
        f"/api/orders/{order_id}/items/{order_item_id}/unvoid",
        headers=_auth_headers(cashier_token),
    )
    assert response.status_code == 403
