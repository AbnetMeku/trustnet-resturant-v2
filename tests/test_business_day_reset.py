from datetime import date, datetime, timezone

import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models.models import BrandingSettings, User
from app.utils.timezone import (
    get_business_day_bounds,
    get_business_day_date,
    get_business_day_start_time_str,
)


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


def _save_reset_time(value: str):
    settings = db.session.get(BrandingSettings, 1)
    if settings is None:
        settings = BrandingSettings(id=1)
        db.session.add(settings)
    settings.business_day_start_time = value
    db.session.commit()


def test_business_day_date_respects_custom_reset_time_for_naive_datetime(app):
    with app.app_context():
        _save_reset_time("04:30")

        before_reset = datetime(2026, 2, 25, 4, 29, 0)
        at_reset = datetime(2026, 2, 25, 4, 30, 0)

        assert get_business_day_date(before_reset) == date(2026, 2, 24)
        assert get_business_day_date(at_reset) == date(2026, 2, 25)


def test_business_day_date_respects_custom_reset_time_for_utc_datetime(app):
    with app.app_context():
        _save_reset_time("04:30")

        before_reset_utc = datetime(2026, 2, 25, 1, 29, 0, tzinfo=timezone.utc)  # 04:29 EAT
        at_reset_utc = datetime(2026, 2, 25, 1, 30, 0, tzinfo=timezone.utc)  # 04:30 EAT

        assert get_business_day_date(before_reset_utc) == date(2026, 2, 24)
        assert get_business_day_date(at_reset_utc) == date(2026, 2, 25)


def test_business_day_bounds_use_custom_reset_time(app):
    with app.app_context():
        _save_reset_time("04:30")

        start_dt, end_dt = get_business_day_bounds(date(2026, 2, 25))

        assert start_dt == datetime(2026, 2, 25, 4, 30, 0)
        assert end_dt == datetime(2026, 2, 26, 4, 30, 0)


def test_branding_api_update_changes_effective_reset_time(client, app):
    with app.app_context():
        admin = User(username="admin_reset_test", password_hash="hash", role="admin")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"role": "admin"},
        )

    response = client.put(
        "/api/branding",
        json={"business_day_start_time": "04:30"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["business_day_start_time"] == "04:30"

    with app.app_context():
        assert get_business_day_start_time_str() == "04:30"

