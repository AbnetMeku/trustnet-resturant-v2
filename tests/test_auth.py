import pytest
from app import create_app, db
from app.models.models import User
from werkzeug.security import generate_password_hash
from flask_jwt_extended import decode_token


@pytest.fixture
def client():
    app = create_app("testing")
    with app.app_context():
        db.drop_all()
        db.create_all()
        admin = User(username="admin", password_hash=generate_password_hash("adminpass"), role="admin")
        waiter = User(username="waiter", pin_hash="1234", role="waiter")
        db.session.add_all([admin, waiter])
        db.session.commit()

    with app.test_client() as client:
        yield client

    with app.app_context():
        db.session.remove()
        db.drop_all()


def test_login_success(client):
    res = client.post("/api/auth/login", json={"username": "admin", "password": "adminpass"})
    assert res.status_code == 200
    data = res.get_json()
    assert "access_token" in data
    token_data = decode_token(data["access_token"])
    assert token_data["role"] == "admin"


def test_login_fail_wrong_password(client):
    res = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpass"})
    assert res.status_code == 401


def test_login_fail_no_user(client):
    res = client.post("/api/auth/login", json={"username": "nouser", "password": "pass"})
    assert res.status_code == 401


def test_waiter_pin_login_success(client):
    res = client.post("/api/auth/pin/waiter", json={"pin": "1234"})
    assert res.status_code == 200
    data = res.get_json()
    assert "access_token" in data
    assert data["user"]["role"] == "waiter"


def test_waiter_pin_login_fail(client):
    res = client.post("/api/auth/pin/waiter", json={"pin": "9999"})
    assert res.status_code == 401
