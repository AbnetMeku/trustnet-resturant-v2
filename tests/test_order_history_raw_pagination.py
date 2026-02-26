from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import Category, MenuItem, Order, OrderItem, Station, SubCategory, Table, User
from app.utils.timezone import eat_now_naive


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


def test_order_history_raw_returns_paginated_response(client, app):
    with app.app_context():
        admin = User(username="admin_raw_page", password_hash="h", role="admin")
        waiter = User(username="waiter_raw_page", password_hash="h", role="waiter")
        table = Table(number="701")
        table.waiters.append(waiter)
        station = Station(name="raw_station", password_hash="hash")
        category = Category(name="Raw Cat", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Raw Sub", category=category)
        item = MenuItem(
            name="Raw Item",
            price=Decimal("7.00"),
            station_rel=station,
            subcategory=subcategory,
            is_available=True,
        )
        db.session.add_all([admin, waiter, table, station, category, subcategory, item])
        db.session.flush()

        day = eat_now_naive().replace(hour=12, minute=0, second=0, microsecond=0)
        for i in range(5):
            order = Order(
                table_id=table.id,
                user_id=waiter.id,
                status="open",
                total_amount=Decimal("7.00"),
                created_at=day - timedelta(minutes=i),
            )
            db.session.add(order)
            db.session.flush()
            db.session.add(
                OrderItem(
                    order_id=order.id,
                    menu_item_id=item.id,
                    quantity=Decimal("1.00"),
                    price=Decimal("7.00"),
                    status="pending",
                    station=station.name,
                )
            )

        db.session.commit()

        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"role": "admin", "username": admin.username},
        )
        day_str = day.date().isoformat()

    response = client.get(
        f"/api/order-history/raw?date={day_str}&page=2&page_size=2",
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    payload = response.get_json()

    assert "orders" in payload
    assert "pagination" in payload
    assert len(payload["orders"]) == 2
    assert payload["pagination"]["page"] == 2
    assert payload["pagination"]["page_size"] == 2
    assert payload["pagination"]["total"] == 5
    assert payload["pagination"]["total_pages"] == 3
    assert payload["pagination"]["has_next"] is True
    assert payload["pagination"]["has_prev"] is True


def test_order_history_raw_rejects_bad_pagination_params(client, app):
    with app.app_context():
        admin = User(username="admin_raw_bad_page", password_hash="h", role="admin")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"role": "admin", "username": admin.username},
        )

    day_str = eat_now_naive().date().isoformat()
    response = client.get(
        f"/api/order-history/raw?date={day_str}&page=abc&page_size=2",
        headers=_auth_headers(token),
    )
    assert response.status_code == 400


def test_order_history_raw_filters_by_table_number(client, app):
    with app.app_context():
        admin = User(username="admin_raw_table_filter", password_hash="h", role="admin")
        waiter = User(username="waiter_raw_table_filter", password_hash="h", role="waiter")
        table_a = Table(number="801")
        table_b = Table(number="901")
        table_a.waiters.append(waiter)
        table_b.waiters.append(waiter)
        station = Station(name="raw_station_tf", password_hash="hash")
        category = Category(name="Raw Cat TF", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Raw Sub TF", category=category)
        item = MenuItem(
            name="Raw Item TF",
            price=Decimal("7.00"),
            station_rel=station,
            subcategory=subcategory,
            is_available=True,
        )
        db.session.add_all(
            [admin, waiter, table_a, table_b, station, category, subcategory, item]
        )
        db.session.flush()

        day = eat_now_naive().replace(hour=12, minute=0, second=0, microsecond=0)
        order_a = Order(
            table_id=table_a.id,
            user_id=waiter.id,
            status="open",
            total_amount=Decimal("7.00"),
            created_at=day,
        )
        order_b = Order(
            table_id=table_b.id,
            user_id=waiter.id,
            status="open",
            total_amount=Decimal("7.00"),
            created_at=day - timedelta(minutes=1),
        )
        db.session.add_all([order_a, order_b])
        db.session.flush()
        db.session.add_all(
            [
                OrderItem(
                    order_id=order_a.id,
                    menu_item_id=item.id,
                    quantity=Decimal("1.00"),
                    price=Decimal("7.00"),
                    status="pending",
                    station=station.name,
                ),
                OrderItem(
                    order_id=order_b.id,
                    menu_item_id=item.id,
                    quantity=Decimal("1.00"),
                    price=Decimal("7.00"),
                    status="pending",
                    station=station.name,
                ),
            ]
        )
        db.session.commit()

        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"role": "admin", "username": admin.username},
        )
        day_str = day.date().isoformat()

    response = client.get(
        f"/api/order-history/raw?date={day_str}&table=80&page=1&page_size=10",
        headers=_auth_headers(token),
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["pagination"]["total"] == 1
    assert len(payload["orders"]) == 1
    assert payload["orders"][0]["table"]["number"] == "801"
