# tests/test_orders.py
import pytest
from datetime import date, timedelta
from app import create_app, db
from app.models.models import User, Table, MenuItem, Order, OrderItem, KitchenTagCounter, Station
from app.routes.orders.kitchen_tag import generate_kitchen_tag

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

@pytest.fixture
def sample_user(app):
    user = User(username="testuser", password_hash="pass", role="waiter")
    db.session.add(user)
    db.session.commit()
    return user

@pytest.fixture
def sample_table(app):
    table = Table(number="1")
    db.session.add(table)
    db.session.commit()
    return table

@pytest.fixture
def sample_station(app):
    station = Station(name="butchery", password_hash="hash")
    db.session.add(station)
    db.session.commit()
    return station

@pytest.fixture
def sample_menu_item(app, sample_station):
    item = MenuItem(
        name="Steak",
        price=10.0,
        is_available=True,
        station_id=sample_station.id,
    )
    db.session.add(item)
    db.session.commit()
    return item

def test_kitchen_tag_counter_simple(app):
    # Generate first tag today
    tag1 = generate_kitchen_tag()
    assert tag1 == "0001"

    # Generate second tag today
    tag2 = generate_kitchen_tag()
    assert tag2 == "0002"

    # Simulate next day
    tomorrow = date.today() + timedelta(days=1)
    counter = KitchenTagCounter.query.filter_by(date=tomorrow).first()
    assert counter is None  # Should not exist yet

def test_create_order_and_add_item(app, sample_user, sample_table, sample_menu_item):
    # Create Order
    order = Order(table_id=sample_table.id, user_id=sample_user.id, status="open", total_amount=0)
    db.session.add(order)
    db.session.commit()

    assert order.id is not None
    assert order.status == "open"

    # Add OrderItem
    kitchen_tag = generate_kitchen_tag()
    item = OrderItem(
        order_id=order.id,
        menu_item_id=sample_menu_item.id,
        quantity=2,
        price=sample_menu_item.price,
        status="pending",
        station="butchery",
        prep_tag=kitchen_tag
    )
    db.session.add(item)
    order.total_amount = (order.total_amount or 0) + (item.price * item.quantity)
    db.session.commit()

    assert item.id is not None
    assert item.prep_tag == "0003" or int(item.prep_tag) >= 1
    assert order.total_amount == 20.0

def test_order_item_status_update(app, sample_user, sample_table, sample_menu_item):
    order = Order(table_id=sample_table.id, user_id=sample_user.id, status="open", total_amount=0)
    db.session.add(order)
    db.session.commit()

    item = OrderItem(
        order_id=order.id,
        menu_item_id=sample_menu_item.id,
        quantity=1,
        price=sample_menu_item.price,
        status="pending",
        station="butchery",
        prep_tag=generate_kitchen_tag()
    )
    db.session.add(item)
    db.session.commit()

    # Update status
    item.status = "ready"
    db.session.commit()

    updated_item = OrderItem.query.get(item.id)
    assert updated_item.status == "ready"
