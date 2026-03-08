from datetime import timedelta
from decimal import Decimal

import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import (
    Category,
    MenuItem,
    Order,
    OrderItem,
    PrintJob,
    Station,
    SubCategory,
    Table,
    User,
)
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


def _seed_history(app):
    with app.app_context():
        admin = User(username="admin_clear", password_hash="x", role="admin")
        manager = User(username="manager_clear", password_hash="x", role="manager")
        table = Table(number="31", is_vip=False)
        station = Station(name="grill_clear", password_hash="x")
        category = Category(name="Food Clear", quantity_step=Decimal("1.00"))
        subcategory = SubCategory(name="Mains Clear", category=category)
        item = MenuItem(
            name="Doro Clear",
            price=Decimal("18.00"),
            is_available=True,
            station_rel=station,
            subcategory=subcategory,
        )
        db.session.add_all([admin, manager, table, station, category, subcategory, item])
        db.session.flush()

        today = eat_now_naive().replace(hour=12, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        next_day = today + timedelta(days=1)

        order_in_range = Order(
            table_id=table.id,
            user_id=admin.id,
            status="paid",
            total_amount=Decimal("18.00"),
            created_at=today,
        )
        order_before_range = Order(
            table_id=table.id,
            user_id=admin.id,
            status="paid",
            total_amount=Decimal("18.00"),
            created_at=yesterday,
        )
        order_after_range = Order(
            table_id=table.id,
            user_id=admin.id,
            status="paid",
            total_amount=Decimal("18.00"),
            created_at=next_day,
        )
        db.session.add_all([order_in_range, order_before_range, order_after_range])
        db.session.flush()

        for order in (order_in_range, order_before_range, order_after_range):
            db.session.add(
                OrderItem(
                    order_id=order.id,
                    menu_item_id=item.id,
                    quantity=Decimal("1.00"),
                    price=Decimal("18.00"),
                    status="ready",
                    station=station.name,
                )
            )
            db.session.add(
                PrintJob(
                    order_id=order.id,
                    station_id=station.id,
                    items_data=[{"name": item.name, "quantity": 1}],
                    status="pending",
                )
            )

        db.session.commit()

        return {
            "admin_id": admin.id,
            "admin_username": admin.username,
            "manager_id": manager.id,
            "manager_username": manager.username,
            "today": today.date().isoformat(),
            "yesterday": yesterday.date().isoformat(),
            "tomorrow": next_day.date().isoformat(),
            "order_in_range_id": order_in_range.id,
            "order_before_range_id": order_before_range.id,
            "order_after_range_id": order_after_range.id,
        }


def test_clear_range_deletes_only_selected_history_for_admin(app, client):
    seeded = _seed_history(app)

    with app.app_context():
        token = create_access_token(
            identity=str(seeded["admin_id"]),
            additional_claims={"role": "admin", "username": seeded["admin_username"]},
        )

    response = client.delete(
        "/api/order-history/clear-range",
        json={"start_date": seeded["today"], "end_date": seeded["today"]},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["deleted_orders"] == 1
    assert payload["deleted_order_items"] == 1
    assert payload["deleted_print_jobs"] == 1

    with app.app_context():
        remaining_order_ids = {order.id for order in Order.query.order_by(Order.id).all()}
        assert seeded["order_in_range_id"] not in remaining_order_ids
        assert seeded["order_before_range_id"] in remaining_order_ids
        assert seeded["order_after_range_id"] in remaining_order_ids
        assert PrintJob.query.count() == 2
        assert OrderItem.query.count() == 2


def test_clear_range_rejects_manager_even_if_authenticated(app, client):
    seeded = _seed_history(app)

    with app.app_context():
        token = create_access_token(
            identity=str(seeded["manager_id"]),
            additional_claims={"role": "manager", "username": seeded["manager_username"]},
        )

    response = client.delete(
        "/api/order-history/clear-range",
        json={"start_date": seeded["today"], "end_date": seeded["today"]},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_clear_range_validates_date_order(app, client):
    seeded = _seed_history(app)

    with app.app_context():
        token = create_access_token(
            identity=str(seeded["admin_id"]),
            additional_claims={"role": "admin", "username": seeded["admin_username"]},
        )

    response = client.delete(
        "/api/order-history/clear-range",
        json={"start_date": seeded["tomorrow"], "end_date": seeded["today"]},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "start_date cannot be after end_date."
