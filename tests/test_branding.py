import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import BrandingSettings, User


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


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_get_branding_defaults(client):
    response = client.get("/api/branding")
    assert response.status_code == 200
    data = response.get_json()
    assert data["logo_url"] == "/logo.png"
    assert data["background_url"] == "/Background.jpeg"


def test_admin_can_update_branding(client, app):
    with app.app_context():
        admin = User(username="admin_brand", password_hash="hash", role="admin")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})

    response = client.put(
        "/api/branding",
        json={
            "logo_url": "https://example.com/logo.png",
            "background_url": "https://example.com/bg.jpg",
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["logo_url"] == "https://example.com/logo.png"
    assert data["background_url"] == "https://example.com/bg.jpg"

    with app.app_context():
        saved = db.session.get(BrandingSettings, 1)
        assert saved is not None
        assert saved.logo_url == "https://example.com/logo.png"


def test_waiter_cannot_update_branding(client, app):
    with app.app_context():
        waiter = User(username="waiter_brand", password_hash="hash", role="waiter")
        db.session.add(waiter)
        db.session.commit()
        token = create_access_token(identity=str(waiter.id), additional_claims={"role": "waiter"})

    response = client.put(
        "/api/branding",
        json={"logo_url": "https://example.com/logo.png"},
        headers=auth_headers(token),
    )
    assert response.status_code == 403
