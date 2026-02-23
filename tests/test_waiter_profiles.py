import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import Category, MenuItem, Station, SubCategory, Table, User


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


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _token_for(user_id, role):
    return create_access_token(identity=str(user_id), additional_claims={"role": role})


def test_profile_create_and_waiter_auto_assign_tables(client, app):
    with app.app_context():
        admin = User(username="admin", password_hash="x", role="admin")
        station_food = Station(name="Kitchen", password_hash="1111")
        station_bar = Station(name="Bar", password_hash="2222")
        tables = [
            Table(number="1", status="available", is_vip=False),
            Table(number="2", status="available", is_vip=False),
            Table(number="3", status="available", is_vip=False),
            Table(number="4", status="available", is_vip=True),
        ]
        db.session.add_all([admin, station_food, station_bar, *tables])
        db.session.commit()
        admin_token = _token_for(admin.id, "admin")
        food_station_id = station_food.id

    profile_resp = client.post(
        "/api/waiter-profiles",
        json={
            "name": "Junior",
            "max_tables": 2,
            "allow_vip": False,
            "station_ids": [food_station_id],
        },
        headers=_auth_headers(admin_token),
    )
    assert profile_resp.status_code == 201
    profile_id = profile_resp.get_json()["id"]

    waiter_resp = client.post(
        "/api/users",
        json={
            "username": "waiter_profiled",
            "pin": "1234",
            "role": "waiter",
            "waiter_profile_id": profile_id,
            "auto_assign_tables": True,
        },
        headers=_auth_headers(admin_token),
    )
    assert waiter_resp.status_code == 201
    waiter_id = waiter_resp.get_json()["id"]

    with app.app_context():
        waiter = db.session.get(User, waiter_id)
        assert waiter.waiter_profile_id == profile_id
        assert len(waiter.tables) == 2
        assert all(not t.is_vip for t in waiter.tables)
        waiter_token = _token_for(waiter.id, "waiter")

    table_resp = client.get("/api/tables", headers=_auth_headers(waiter_token))
    assert table_resp.status_code == 200
    data = table_resp.get_json()
    assert len(data) == 2
    assert all(not table["is_vip"] for table in data)


def test_waiter_profile_restricts_menu_and_order_stations(client, app):
    with app.app_context():
        admin = User(username="admin2", password_hash="x", role="admin")
        waiter = User(username="waiter_station", pin_hash="1235", role="waiter")
        station_food = Station(name="Kitchen2", password_hash="1111")
        station_bar = Station(name="Bar2", password_hash="2222")
        category = Category(name="Food", quantity_step=1.0)
        sub = SubCategory(name="Mains", category=category)
        table = Table(number="10", status="available", is_vip=False)
        table.waiters.append(waiter)
        item_food = MenuItem(name="Pasta", price=10, station_rel=station_food, subcategory=sub, is_available=True)
        item_bar = MenuItem(name="WineGlass", price=8, station_rel=station_bar, subcategory=sub, is_available=True)
        db.session.add_all([admin, waiter, station_food, station_bar, category, sub, table, item_food, item_bar])
        db.session.commit()
        admin_token = _token_for(admin.id, "admin")
        waiter_id = waiter.id
        food_station_id = station_food.id

    profile_resp = client.post(
        "/api/waiter-profiles",
        json={
            "name": "Kitchen Only",
            "max_tables": 5,
            "allow_vip": True,
            "station_ids": [food_station_id],
        },
        headers=_auth_headers(admin_token),
    )
    assert profile_resp.status_code == 201
    profile_id = profile_resp.get_json()["id"]

    assign_resp = client.put(
        f"/api/users/{waiter_id}",
        json={"waiter_profile_id": profile_id},
        headers=_auth_headers(admin_token),
    )
    assert assign_resp.status_code == 200

    with app.app_context():
        waiter_token = _token_for(waiter_id, "waiter")
        table_id = Table.query.filter_by(number="10").first().id
        food_item_id = MenuItem.query.filter_by(name="Pasta").first().id
        bar_item_id = MenuItem.query.filter_by(name="WineGlass").first().id

    menu_resp = client.get("/api/menu-items", headers=_auth_headers(waiter_token))
    assert menu_resp.status_code == 200
    menu_names = {item["name"] for item in menu_resp.get_json()}
    assert "Pasta" in menu_names
    assert "WineGlass" not in menu_names

    denied_resp = client.post(
        "/api/orders/",
        json={"table_id": table_id, "items": [{"menu_item_id": bar_item_id, "quantity": 1}]},
        headers=_auth_headers(waiter_token),
    )
    assert denied_resp.status_code == 403

    allowed_resp = client.post(
        "/api/orders/",
        json={"table_id": table_id, "items": [{"menu_item_id": food_item_id, "quantity": 1}]},
        headers=_auth_headers(waiter_token),
    )
    assert allowed_resp.status_code == 201


def test_waiter_without_profile_keeps_legacy_menu_access(client, app):
    with app.app_context():
        waiter = User(username="legacy_waiter", pin_hash="7777", role="waiter")
        station = Station(name="LegacyKitchen", password_hash="1111")
        category = Category(name="Drinks", quantity_step=1.0)
        sub = SubCategory(name="Cold", category=category)
        item = MenuItem(name="LegacyTea", price=4, station_rel=station, subcategory=sub, is_available=True)
        db.session.add_all([waiter, station, category, sub, item])
        db.session.commit()
        waiter_token = _token_for(waiter.id, "waiter")

    menu_resp = client.get("/api/menu-items", headers=_auth_headers(waiter_token))
    assert menu_resp.status_code == 200
    names = {row["name"] for row in menu_resp.get_json()}
    assert "LegacyTea" in names


def test_vip_profile_auto_assigns_all_vip_tables(client, app):
    with app.app_context():
        admin = User(username="admin_vip_assign", password_hash="x", role="admin")
        station = Station(name="VIPKitchen", password_hash="1111")
        tables = [
            Table(number="21", status="available", is_vip=True),
            Table(number="22", status="available", is_vip=True),
            Table(number="23", status="available", is_vip=False),
            Table(number="24", status="available", is_vip=False),
        ]
        db.session.add_all([admin, station, *tables])
        db.session.commit()
        admin_token = _token_for(admin.id, "admin")
        station_id = station.id

    profile_resp = client.post(
        "/api/waiter-profiles",
        json={
            "name": "VIP Enabled",
            "max_tables": 5,
            "allow_vip": True,
            "station_ids": [station_id],
        },
        headers=_auth_headers(admin_token),
    )
    assert profile_resp.status_code == 201
    profile_id = profile_resp.get_json()["id"]

    waiter_resp = client.post(
        "/api/users",
        json={
            "username": "vip_waiter",
            "pin": "4321",
            "role": "waiter",
            "waiter_profile_id": profile_id,
            "auto_assign_tables": True,
        },
        headers=_auth_headers(admin_token),
    )
    assert waiter_resp.status_code == 201
    waiter_id = waiter_resp.get_json()["id"]

    with app.app_context():
        waiter = db.session.get(User, waiter_id)
        assigned_numbers = {table.number for table in waiter.tables}
        assert assigned_numbers == {"21", "22"}
        assert all(table.is_vip for table in waiter.tables)
