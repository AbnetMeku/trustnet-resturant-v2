import io
import os

import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import BrandingSettings, User


@pytest.fixture
def app(tmp_path):
    app = create_app("testing")
    app.config["BRANDING_UPLOAD_DIR"] = str(tmp_path / "branding")
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
    assert data["print_preview_enabled"] is False


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
            "print_preview_enabled": True,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["logo_url"] == "https://example.com/logo.png"
    assert data["background_url"] == "https://example.com/bg.jpg"
    assert data["print_preview_enabled"] is True

    with app.app_context():
        saved = db.session.get(BrandingSettings, 1)
        assert saved is not None
        assert saved.logo_url == "https://example.com/logo.png"
        assert saved.print_preview_enabled is True


def test_update_branding_rejects_non_boolean_print_preview(client, app):
    with app.app_context():
        admin = User(username="admin_brand_bool", password_hash="hash", role="admin")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})

    response = client.put(
        "/api/branding",
        json={"print_preview_enabled": "yes"},
        headers=auth_headers(token),
    )
    assert response.status_code == 400
    data = response.get_json()
    assert "print_preview_enabled must be a boolean" in data["error"]


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


def test_admin_can_upload_logo_asset(client, app):
    with app.app_context():
        admin = User(username="admin_upload_brand", password_hash="hash", role="admin")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(identity=str(admin.id), additional_claims={"role": "admin"})

    response = client.post(
        "/api/branding/upload/logo",
        data={"file": (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "logo.png", "image/png")},
        headers=auth_headers(token),
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["custom_logo_url"].startswith("/api/branding/assets/logo_")

    asset_response = client.get(data["custom_logo_url"])
    assert asset_response.status_code == 200
    assert asset_response.data.startswith(b"\x89PNG")

    saved_name = os.path.basename(data["custom_logo_url"])
    expected_path = os.path.join(app.config["BRANDING_UPLOAD_DIR"], saved_name)
    assert os.path.exists(expected_path)
