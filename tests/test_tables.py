import json
import pytest
from sqlalchemy import text
from app import create_app, db
from app.models.models import User, Table
from werkzeug.security import generate_password_hash
from flask_jwt_extended import create_access_token


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


def create_user_and_token(role, db_session, username="testuser"):
    user = User(
        username=username,
        password_hash=generate_password_hash("password123"),
        role=role,
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(identity=str(user.id), additional_claims={"role": role})
    return user, token


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_create_table(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin1")
        response = client.post(
            "/api/tables/",
            data=json.dumps({"status": "available", "is_vip": False}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["number"] == "1"
        assert data["is_vip"] is False


def test_manager_can_create_table(client, app):
    with app.app_context():
        _, token = create_user_and_token("manager", db.session, "manager1")
        response = client.post(
            "/api/tables/",
            data=json.dumps({"status": "available"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert response.status_code == 201
        data = response.get_json()
        assert data["number"] == "1"


def test_waiter_cannot_create_table(client, app):
    with app.app_context():
        _, token = create_user_and_token("waiter", db.session, "waiter1")
        response = client.post(
            "/api/tables/",
            data=json.dumps({"number": "T3"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert response.status_code == 403


def test_get_all_tables(client, app):
    with app.app_context():
        _, admin_token = create_user_and_token("admin", db.session, "admin2")
        table = Table(number="T4", status="available")
        db.session.add(table)
        db.session.commit()
        response = client.get("/api/tables/", headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.get_json()
        assert isinstance(data, list)
        assert any(t["number"] == "T4" for t in data)


def test_update_table(client, app):
    with app.app_context():
        _, admin_token = create_user_and_token("admin", db.session, "admin3")
        table = Table(number="T5", status="available", is_vip=False)
        db.session.add(table)
        db.session.commit()
        response = client.put(
            f"/api/tables/{table.id}",
            data=json.dumps({"status": "occupied", "is_vip": True}),
            headers={**auth_headers(admin_token), "Content-Type": "application/json"},
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "occupied"
        assert data["is_vip"] is True


def test_delete_table(client, app):
    with app.app_context():
        _, admin_token = create_user_and_token("admin", db.session, "admin4")
        table = Table(number="T6")
        db.session.add(table)
        db.session.commit()
        response = client.delete(f"/api/tables/{table.id}", headers=auth_headers(admin_token))
        assert response.status_code == 200
        data = response.get_json()
        assert data["message"] == "Table deleted"
        t = db.session.get(Table, table.id)
        assert t is None


def test_table_number_keeps_incrementing_after_delete(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin5")

        first = client.post(
            "/api/tables/",
            data=json.dumps({"status": "available"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert first.status_code == 201
        first_number = first.get_json()["number"]
        first_id = first.get_json()["id"]
        assert first_number == "1"

        deleted = client.delete(f"/api/tables/{first_id}", headers=auth_headers(token))
        assert deleted.status_code == 200

        second = client.post(
            "/api/tables/",
            data=json.dumps({"status": "available"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert second.status_code == 201
        second_number = second.get_json()["number"]
        assert second_number == "2"


def test_manual_table_number_must_continue_from_last(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin6")

        auto_first = client.post(
            "/api/tables/",
            data=json.dumps({"status": "available"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert auto_first.status_code == 201
        assert auto_first.get_json()["number"] == "1"

        invalid_manual = client.post(
            "/api/tables/",
            data=json.dumps({"number": "1", "status": "available"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert invalid_manual.status_code == 400

        valid_manual = client.post(
            "/api/tables/",
            data=json.dumps({"number": "10", "status": "available"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert valid_manual.status_code == 201
        assert valid_manual.get_json()["number"] == "10"

        auto_after_manual = client.post(
            "/api/tables/",
            data=json.dumps({"status": "available"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert auto_after_manual.status_code == 201
        assert auto_after_manual.get_json()["number"] == "11"


def test_create_table_recovers_when_counter_table_missing(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin7")

        db.session.execute(text("DROP TABLE IF EXISTS table_number_counter"))
        db.session.commit()

        response = client.post(
            "/api/tables/",
            data=json.dumps({"status": "available", "is_vip": False}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert response.status_code == 201
        assert response.get_json()["number"] == "1"
