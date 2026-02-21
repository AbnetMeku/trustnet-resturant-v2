from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.models import BrandingSettings
from app.utils.decorators import roles_required

branding_bp = Blueprint("branding_bp", __name__, url_prefix="/branding")

DEFAULT_LOGO_URL = "/logo.png"
DEFAULT_BACKGROUND_URL = "/Background.jpeg"
MAX_URL_LENGTH = 2000


def _serialize_branding(settings):
    custom_logo = settings.logo_url if settings else None
    custom_background = settings.background_url if settings else None

    return {
        "logo_url": custom_logo or DEFAULT_LOGO_URL,
        "background_url": custom_background or DEFAULT_BACKGROUND_URL,
        "custom_logo_url": custom_logo,
        "custom_background_url": custom_background,
    }


def _normalize_nullable_url(value, field_name):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")

    normalized = value.strip()
    if not normalized:
        return None

    if len(normalized) > MAX_URL_LENGTH:
        raise ValueError(f"{field_name} is too long")

    return normalized


@branding_bp.route("", methods=["OPTIONS"])
@branding_bp.route("/", methods=["OPTIONS"])
def branding_options():
    return jsonify({"status": "ok"}), 200


@branding_bp.route("", methods=["GET"])
@branding_bp.route("/", methods=["GET"])
def get_branding():
    settings = db.session.get(BrandingSettings, 1)
    return jsonify(_serialize_branding(settings)), 200


@branding_bp.route("", methods=["PUT"])
@branding_bp.route("/", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_branding():
    data = request.get_json() or {}

    if "logo_url" not in data and "background_url" not in data:
        return jsonify({"error": "Provide logo_url and/or background_url"}), 400

    settings = db.session.get(BrandingSettings, 1)
    if settings is None:
        settings = BrandingSettings(id=1)
        db.session.add(settings)

    try:
        if "logo_url" in data:
            settings.logo_url = _normalize_nullable_url(data.get("logo_url"), "logo_url")
        if "background_url" in data:
            settings.background_url = _normalize_nullable_url(data.get("background_url"), "background_url")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    db.session.commit()
    return jsonify(_serialize_branding(settings)), 200
