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


def test_summary_range_excludes_voided_items_from_totals_and_item_summary(app, client):
    with app.app_context():
        admin = User(username="admin_stats", password_hash="x", role="admin")
        table = Table(number="11", is_vip=False)
        station = Station(name="grill_stats", password_hash="x")
        category = Category(name="Food Stats", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Mains Stats", category=category)
        item = MenuItem(
            name="Kitfo Stats",
            price=Decimal("10.00"),
            is_available=True,
            station_rel=station,
            subcategory=subcategory,
        )
        db.session.add_all([admin, table, station, category, subcategory, item])
        db.session.flush()

        order = Order(
            table_id=table.id,
            user_id=admin.id,
            status="open",
            total_amount=Decimal("10.00"),
            created_at=eat_now_naive(),
        )
        db.session.add(order)
        db.session.flush()

        db.session.add_all(
            [
                OrderItem(
                    order_id=order.id,
                    menu_item_id=item.id,
                    quantity=Decimal("1.00"),
                    price=Decimal("10.00"),
                    status="pending",
                    station=station.name,
                ),
                OrderItem(
                    order_id=order.id,
                    menu_item_id=item.id,
                    quantity=Decimal("2.00"),
                    price=Decimal("10.00"),
                    status="void",
                    station=station.name,
                ),
            ]
        )
        db.session.commit()

        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"role": "admin", "username": admin.username},
        )

    day = eat_now_naive().date().isoformat()
    response = client.get(
        f"/api/order-history/summary-range?start_date={day}&end_date={day}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.get_json()

    # Only the non-voided quantity should be counted in item summaries.
    assert payload["totalItems"] == 1.0
    assert payload["dailyItemsSummary"] == [{"name": "Kitfo Stats", "quantity": 1.0}]
    assert payload["waiterSummary"][0]["totalItems"] == 1.0

    # Order amount/status math remains based on order totals.
    assert payload["openAmount"] == 10.0
    assert payload["totalOrders"] == 1


def test_summary_range_end_to_end_counts_and_amounts_for_overview(app, client):
    with app.app_context():
        admin = User(username="admin_e2e", password_hash="x", role="admin")
        waiter = User(username="waiter_e2e", password_hash="x", role="waiter")
        table = Table(number="21", is_vip=False)
        station = Station(name="grill_e2e", password_hash="x")
        category = Category(name="Food E2E", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Mains E2E", category=category)
        item = MenuItem(
            name="Shiro E2E",
            price=Decimal("12.00"),
            is_available=True,
            station_rel=station,
            subcategory=subcategory,
        )
        db.session.add_all([admin, waiter, table, station, category, subcategory, item])
        db.session.flush()

        today = eat_now_naive().replace(hour=12, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        eight_days_ago = today - timedelta(days=8)

        open_order = Order(
            table_id=table.id,
            user_id=waiter.id,
            status="open",
            total_amount=Decimal("24.00"),
            created_at=today,
        )
        closed_order = Order(
            table_id=table.id,
            user_id=waiter.id,
            status="closed",
            total_amount=Decimal("12.00"),
            created_at=yesterday,
        )
        paid_order_outside_last7 = Order(
            table_id=table.id,
            user_id=waiter.id,
            status="paid",
            total_amount=Decimal("12.00"),
            created_at=eight_days_ago,
        )
        db.session.add_all([open_order, closed_order, paid_order_outside_last7])
        db.session.flush()

        db.session.add_all(
            [
                OrderItem(
                    order_id=open_order.id,
                    menu_item_id=item.id,
                    quantity=Decimal("2.00"),
                    price=Decimal("12.00"),
                    status="pending",
                    station=station.name,
                ),
                OrderItem(
                    order_id=closed_order.id,
                    menu_item_id=item.id,
                    quantity=Decimal("1.00"),
                    price=Decimal("12.00"),
                    status="ready",
                    station=station.name,
                ),
                OrderItem(
                    order_id=paid_order_outside_last7.id,
                    menu_item_id=item.id,
                    quantity=Decimal("1.00"),
                    price=Decimal("12.00"),
                    status="ready",
                    station=station.name,
                ),
            ]
        )
        db.session.commit()

        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"role": "admin", "username": admin.username},
        )

    start = (eat_now_naive().date() - timedelta(days=6)).isoformat()
    end = eat_now_naive().date().isoformat()
    response = client.get(
        f"/api/order-history/summary-range?start_date={start}&end_date={end}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.get_json()

    # Overview core KPIs
    assert payload["totalOrders"] == 2
    assert payload["openAmount"] == 24.0
    assert payload["closedAmount"] == 12.0
    assert payload["paidAmount"] == 0.0

    # Overview status cards are derived from waiterSummary counts
    waiter_summary = payload["waiterSummary"][0]
    assert waiter_summary["openOrders"] == 1
    assert waiter_summary["closedOrders"] == 1
    assert waiter_summary["paidOrders"] == 0

    # Overview Top Selling Items source
    assert payload["dailyItemsSummary"] == [{"name": "Shiro E2E", "quantity": 3.0}]
