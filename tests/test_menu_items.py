import pytest
from flask_jwt_extended import create_access_token
from werkzeug.security import generate_password_hash

from app import create_app, db
from app.models.models import Category, MenuItem, Station, SubCategory, User


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


@pytest.fixture
def admin_headers(app):
    with app.app_context():
        admin = User(
            username="admin_menu_tests",
            password_hash=generate_password_hash("admin123"),
            role="admin",
        )
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})
        return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def menu_seed(app):
    with app.app_context():
        bar = Station(name="bar", password_hash="hash")
        kitchen = Station(name="kitchen", password_hash="hash")
        db.session.add_all([bar, kitchen])
        db.session.flush()

        cat = Category(name="Food", quantity_step=1.0)
        db.session.add(cat)
        db.session.flush()

        sub1 = SubCategory(name="Main", category_id=cat.id)
        sub2 = SubCategory(name="Special", category_id=cat.id)
        db.session.add_all([sub1, sub2])
        db.session.flush()

        items = [
            MenuItem(name="Whiskey Shot", description="Premium whiskey", price=5.5, station_id=bar.id, subcategory_id=sub1.id, is_available=True),
            MenuItem(name="VIP Champagne", description="Champagne bottle", price=120.0, station_id=bar.id, subcategory_id=sub2.id, is_available=True),
            MenuItem(name="Tibs Special", description="Spicy tibs", price=15.0, station_id=kitchen.id, subcategory_id=sub1.id, is_available=True),
            MenuItem(name="Kitfo Deluxe", description="Traditional kitfo", price=18.0, station_id=kitchen.id, subcategory_id=sub2.id, is_available=False),
            MenuItem(name="Premium Beef Cut", description="Fresh beef", price=25.0, station_id=kitchen.id, subcategory_id=sub1.id, is_available=True),
        ]
        db.session.add_all(items)
        db.session.commit()

        return {
            "bar_id": bar.id,
            "kitchen_id": kitchen.id,
            "sub1_id": sub1.id,
            "sub2_id": sub2.id,
            "item_ids": [i.id for i in items],
        }


def test_create_menu_item(client, admin_headers, menu_seed):
    payload = {
        "name": "New Dish",
        "description": "Tasty and fresh",
        "price": 12.5,
        "station_id": menu_seed["kitchen_id"],
        "subcategory_id": menu_seed["sub1_id"],
        "is_available": True,
        "image_url": "",
    }
    resp = client.post("/api/menu-items/", json=payload, headers=admin_headers)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] == "New Dish"
    assert data["station_id"] == menu_seed["kitchen_id"]


def test_create_menu_item_missing_required(client, admin_headers, menu_seed):
    payload = {
        "description": "Missing name",
        "station_id": menu_seed["bar_id"],
        "subcategory_id": menu_seed["sub1_id"],
    }
    resp = client.post("/api/menu-items/", json=payload, headers=admin_headers)
    assert resp.status_code == 400


def test_get_all_menu_items(client, admin_headers, menu_seed):
    resp = client.get("/api/menu-items/", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) >= 5


def test_filter_menu_items_by_station(client, admin_headers, menu_seed):
    resp = client.get(f"/api/menu-items/?station_id={menu_seed['bar_id']}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert all(item["station_id"] == menu_seed["bar_id"] for item in data)


def test_update_menu_item(client, admin_headers, menu_seed):
    target_id = menu_seed["item_ids"][0]
    payload = {"price": 6.0, "station_id": menu_seed["kitchen_id"]}
    resp = client.put(f"/api/menu-items/{target_id}", json=payload, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["price"] == 6.0
    assert data["station_id"] == menu_seed["kitchen_id"]


def test_update_menu_item_not_found(client, admin_headers):
    payload = {"price": 10.0}
    resp = client.put("/api/menu-items/9999", json=payload, headers=admin_headers)
    assert resp.status_code == 404


def test_create_duplicate_menu_item(client, admin_headers, menu_seed):
    payload = {
        "name": "Whiskey Shot",
        "description": "Duplicate",
        "price": 10.0,
        "station_id": menu_seed["bar_id"],
        "subcategory_id": menu_seed["sub1_id"],
    }
    resp = client.post("/api/menu-items/", json=payload, headers=admin_headers)
    assert resp.status_code == 400


def test_get_menu_items_unauthorized(client):
    resp = client.get("/api/menu-items/")
    assert resp.status_code == 401
