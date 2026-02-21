import os
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.models import BrandingSettings
from app.utils.decorators import roles_required

branding_bp = Blueprint("branding_bp", __name__, url_prefix="/branding")

DEFAULT_LOGO_URL = "/logo.png"
DEFAULT_BACKGROUND_URL = "/Background.jpeg"
MAX_URL_LENGTH = 2000
LOCAL_ASSET_PREFIX = "/api/branding/assets/"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


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


def _upload_dir():
    upload_dir = current_app.config.get("BRANDING_UPLOAD_DIR")
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def _is_local_asset_url(url):
    return isinstance(url, str) and url.startswith(LOCAL_ASSET_PREFIX)


def _delete_local_asset(url):
    if not _is_local_asset_url(url):
        return

    filename = os.path.basename(url)
    if not filename:
        return

    path = os.path.join(_upload_dir(), filename)
    if os.path.exists(path):
        os.remove(path)


def _validate_image_file(file_storage):
    if file_storage is None or not file_storage.filename:
        raise ValueError("Image file is required")

    filename = secure_filename(file_storage.filename)
    if "." not in filename:
        raise ValueError("File must have an extension")

    extension = filename.rsplit(".", 1)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported image extension")

    if file_storage.mimetype not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Unsupported image content type")

    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)

    max_size = int(current_app.config.get("BRANDING_MAX_UPLOAD_BYTES", 5 * 1024 * 1024))
    if size > max_size:
        raise ValueError("Image exceeds max upload size")

    return extension


def _save_uploaded_image(file_storage, asset_type):
    extension = _validate_image_file(file_storage)
    filename = f"{asset_type}_{uuid4().hex}.{extension}"
    target_path = os.path.join(_upload_dir(), filename)
    file_storage.save(target_path)
    return f"{LOCAL_ASSET_PREFIX}{filename}"


@branding_bp.route("", methods=["OPTIONS"])
@branding_bp.route("/", methods=["OPTIONS"])
def branding_options():
    return jsonify({"status": "ok"}), 200


@branding_bp.route("/assets/<path:filename>", methods=["GET"])
def branding_asset(filename):
    return send_from_directory(_upload_dir(), filename)


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
            next_logo = _normalize_nullable_url(data.get("logo_url"), "logo_url")
            if next_logo != settings.logo_url:
                _delete_local_asset(settings.logo_url)
                settings.logo_url = next_logo
        if "background_url" in data:
            next_background = _normalize_nullable_url(data.get("background_url"), "background_url")
            if next_background != settings.background_url:
                _delete_local_asset(settings.background_url)
                settings.background_url = next_background
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    db.session.commit()
    return jsonify(_serialize_branding(settings)), 200


@branding_bp.route("/upload/<asset_type>", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def upload_branding_asset(asset_type):
    if asset_type not in {"logo", "background"}:
        return jsonify({"error": "asset_type must be 'logo' or 'background'"}), 400

    settings = db.session.get(BrandingSettings, 1)
    if settings is None:
        settings = BrandingSettings(id=1)
        db.session.add(settings)

    image_file = request.files.get("file")
    try:
        saved_url = _save_uploaded_image(image_file, asset_type)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if asset_type == "logo":
        _delete_local_asset(settings.logo_url)
        settings.logo_url = saved_url
    else:
        _delete_local_asset(settings.background_url)
        settings.background_url = saved_url

    db.session.commit()
    return jsonify(_serialize_branding(settings)), 200
