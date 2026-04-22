import pytest
from app import create_app, db
from app.models.models import User
from werkzeug.security import generate_password_hash
from flask_jwt_extended import create_access_token


@pytest.fixture(scope="module")
def app():
    app = create_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()
        users = [
            User(username="admin", password_hash=generate_password_hash("adminpass"), role="admin"),
            User(username="manager", password_hash=generate_password_hash("managerpass"), role="manager"),
            User(username="waiter", pin_hash="1111", role="waiter"),
        ]
        db.session.add_all(users)
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def get_auth_headers(user_id, role, app):
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_get_all_users(client, app):
    headers = get_auth_headers(1, "admin", app)
    res = client.get("/api/users/", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert any(u["username"] == "admin" for u in data)


def test_manager_can_create_waiter_with_pin(client, app):
    headers = get_auth_headers(2, "manager", app)
    new_user = {"username": "newwaiter", "pin": "2222", "role": "waiter"}
    res = client.post("/api/users/", headers=headers, json=new_user)
    assert res.status_code == 201
    data = res.get_json()
    assert data["username"] == "newwaiter"
    assert data["role"] == "waiter"


def test_manager_cannot_create_waiter_with_duplicate_pin(client, app):
    headers = get_auth_headers(2, "manager", app)
    duplicate_user = {"username": "dupwaiter", "pin": "1111", "role": "waiter"}
    res = client.post("/api/users/", headers=headers, json=duplicate_user)
    assert res.status_code == 400
    assert "already taken" in res.get_data(as_text=True).lower()


def test_waiter_cannot_create_user(client, app):
    headers = get_auth_headers(3, "waiter", app)
    new_user = {"username": "baduser", "password": "badpass", "role": "cashier"}
    res = client.post("/api/users/", headers=headers, json=new_user)
    assert res.status_code == 403


def test_user_can_get_own_details(client, app):
    headers = get_auth_headers(3, "waiter", app)
    res = client.get("/api/users/3", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert data["id"] == 3


def test_user_cannot_get_other_user_details(client, app):
    headers = get_auth_headers(3, "waiter", app)
    res = client.get("/api/users/1", headers=headers)
    assert res.status_code == 403


def test_admin_can_update_user_role_with_required_password(client, app):
    headers = get_auth_headers(1, "admin", app)
    update_data = {"role": "cashier", "password": "cashpass1"}
    res = client.put("/api/users/3", headers=headers, json=update_data)
    assert res.status_code == 200
    data = res.get_json()
    assert data["role"] == "cashier"


def test_manager_cannot_delete_admin(client, app):
    headers = get_auth_headers(2, "manager", app)
    res = client.delete("/api/users/1", headers=headers)
    assert res.status_code == 403


def test_manager_can_delete_waiter(client, app):
    headers = get_auth_headers(2, "manager", app)
    # ID 4 was created in test_manager_can_create_waiter_with_pin
    res = client.delete("/api/users/4", headers=headers)
    assert res.status_code == 200
    assert res.get_json()["message"] == "User deleted"


def test_auth_login_success(client):
    res = client.post("/api/auth/login", json={"username": "admin", "password": "adminpass"})
    assert res.status_code == 200
    data = res.get_json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"


def test_auth_login_fail(client):
    res = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpass"})
    assert res.status_code == 401
    data = res.get_json()
    assert data["msg"] == "Invalid username or password"
