import pytest
from app.models.models import MenuItem
from app.extensions import db


@pytest.fixture
def sample_menu_items():
    items = [
        MenuItem(
            name="Whiskey Shot",
            description="A single shot of premium whiskey",
            price=5.50,
            station="bar",
            is_available=True,
        ),
        MenuItem(
            name="VIP Champagne",
            description="Exclusive champagne bottle",
            price=120.00,
            station="vip_bar",
            is_available=True,
        ),
        MenuItem(
            name="Tibs Special",
            description="Beef tibs with spice",
            price=15.00,
            station="tibs_kitchen",
            is_available=True,
        ),
        MenuItem(
            name="Kitfo Deluxe",
            description="Traditional kitfo",
            price=18.00,
            station="kitfo_kitchen",
            is_available=False,
        ),
        MenuItem(
            name="Premium Beef Cut",
            description="Freshly butchered beef",
            price=25.00,
            station="butcher",
            is_available=True,
        ),
    ]
    db.session.bulk_save_objects(items)
    db.session.commit()
    return items


def test_create_menu_item(client, admin_headers):
    payload = {
        "name": "New Dish",
        "description": "Tasty and fresh",
        "price": 12.50,
        "station": "tibs_kitchen",
        "is_available": True,
        "image_url": "http://example.com/image.jpg",
    }
    resp = client.post("/menu-items/", json=payload, headers=admin_headers)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] == "New Dish"
    assert data["station"] == "tibs_kitchen"


def test_create_menu_item_missing_required(client, admin_headers):
    payload = {
        "description": "Missing name and price",
        "station": "bar"
    }
    resp = client.post("/menu-items/", json=payload, headers=admin_headers)
    assert resp.status_code == 400


def test_get_all_menu_items(client, admin_headers, sample_menu_items):
    resp = client.get("/menu-items/", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 5


def test_filter_menu_items_by_station(client, admin_headers, sample_menu_items):
    resp = client.get("/menu-items/?station=bar", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert all(item["station"] == "bar" for item in data)
    assert len(data) == 1


def test_update_menu_item(client, admin_headers, sample_menu_items):
    item = sample_menu_items[0]
    payload = {"price": 6.00, "station": "vip_bar"}
    resp = client.put(f"/menu-items/{item.id}", json=payload, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["price"] == 6.00
    assert data["station"] == "vip_bar"


def test_update_menu_item_not_found(client, admin_headers):
    payload = {"price": 10.00}
    resp = client.put("/menu-items/9999", json=payload, headers=admin_headers)
    assert resp.status_code == 404


def test_create_duplicate_menu_item(client, admin_headers, sample_menu_items):
    payload = {
        "name": sample_menu_items[0].name,
        "description": "Duplicate",
        "price": 10.00,
        "station": "bar"
    }
    resp = client.post("/menu-items/", json=payload, headers=admin_headers)
    assert resp.status_code == 400


def test_get_menu_items_unauthorized(client):
    resp = client.get("/menu-items/")
    assert resp.status_code == 401
