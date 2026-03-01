import json
import pytest
from app import create_app, db
from app.models.models import User, Station
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


def test_admin_can_create_station(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin_station")
        response = client.post(
            "/api/stations/",
            data=json.dumps(
                {
                    "name": "Grill",
                    "password": "1234",
                    "printer_identifier": "PRN-GRILL-01",
                    "print_mode": "separate",
                    "cashier_printer": True,
                }
            ),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert response.status_code == 201
        payload = response.get_json()
        assert payload["name"] == "Grill"
        assert payload["pin"] == "****"
        assert payload["print_mode"] == "separate"
        assert payload["cashier_printer"] is True


def test_waiter_cannot_create_station(client, app):
    with app.app_context():
        _, token = create_user_and_token("waiter", db.session, "waiter_station")
        response = client.post(
            "/api/stations/",
            data=json.dumps({"name": "Bar", "password": "2222"}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert response.status_code == 403


def test_get_stations(client, app):
    with app.app_context():
        _, token = create_user_and_token("manager", db.session, "manager_station")
        station = Station(name="Kitchen", password_hash=generate_password_hash("5555"), printer_identifier="PRN-KITCH-01")
        db.session.add(station)
        db.session.commit()
        response = client.get("/api/stations/", headers=auth_headers(token))
        assert response.status_code == 200
        data = response.get_json()
        assert any(s["name"] == "Kitchen" for s in data)


def test_update_station(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin_station_update")
        station = Station(name="Pastry", password_hash=generate_password_hash("7777"), printer_identifier="OLD-PRN")
        db.session.add(station)
        db.session.commit()
        response = client.put(
            f"/api/stations/{station.id}",
            data=json.dumps(
                {
                    "printer_identifier": "NEW-PRN",
                    "password": "8888",
                    "print_mode": "separate",
                    "cashier_printer": True,
                }
            ),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert response.status_code == 200
        updated = response.get_json()
        assert updated["printer_identifier"] == "NEW-PRN"
        assert updated["print_mode"] == "separate"
        assert updated["cashier_printer"] is True


def test_cashier_printer_flag_is_unique(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin_cashier_flag")
        s1 = Station(name="S1", password_hash=generate_password_hash("1234"), printer_identifier="10.0.0.1")
        s2 = Station(name="S2", password_hash=generate_password_hash("5678"), printer_identifier="10.0.0.2")
        db.session.add_all([s1, s2])
        db.session.commit()

        resp1 = client.put(
            f"/api/stations/{s1.id}",
            data=json.dumps({"cashier_printer": True}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert resp1.status_code == 200

        resp2 = client.put(
            f"/api/stations/{s2.id}",
            data=json.dumps({"cashier_printer": True}),
            headers={**auth_headers(token), "Content-Type": "application/json"},
        )
        assert resp2.status_code == 200

        db.session.refresh(s1)
        db.session.refresh(s2)
        assert s1.cashier_printer is False
        assert s2.cashier_printer is True


def test_delete_station(client, app):
    with app.app_context():
        _, token = create_user_and_token("admin", db.session, "admin_station_delete")
        station = Station(name="Bar", password_hash=generate_password_hash("1212"), printer_identifier="PRN-BAR-01")
        db.session.add(station)
        db.session.commit()
        response = client.delete(f"/api/stations/{station.id}", headers=auth_headers(token))
        assert response.status_code == 200
        assert response.get_json()["message"] == "Station deleted"
        assert db.session.get(Station, station.id) is None
