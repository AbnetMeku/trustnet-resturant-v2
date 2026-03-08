import os
import re
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models.models import BrandingSettings, Category, SubCategory
from app.utils.decorators import roles_required

branding_bp = Blueprint("branding_bp", __name__, url_prefix="/branding")

DEFAULT_LOGO_URL = "/logo.png"
DEFAULT_BACKGROUND_URL = "/Background.png"
MAX_URL_LENGTH = 2000
LOCAL_ASSET_PREFIX = "/api/branding/assets/"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
DEFAULT_BUSINESS_DAY_START = "06:00"
TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _serialize_branding(settings):
    custom_logo = settings.logo_url if settings else None
    custom_background = settings.background_url if settings else None
    kitchen_tag_category = settings.kitchen_tag_category if settings else None
    kitchen_tag_subcategory = settings.kitchen_tag_subcategory if settings else None
    kitchen_tag_subcategory_ids = []
    kitchen_tag_subcategory_names = []
    if settings:
        raw_ids = settings.kitchen_tag_subcategory_ids or []
        if not raw_ids and settings.kitchen_tag_subcategory_id is not None:
            raw_ids = [settings.kitchen_tag_subcategory_id]
        if isinstance(raw_ids, list):
            kitchen_tag_subcategory_ids = [int(value) for value in raw_ids if isinstance(value, int) or (isinstance(value, str) and value.isdigit())]
        if kitchen_tag_subcategory_ids:
            subcategories = (
                db.session.query(SubCategory)
                .filter(SubCategory.id.in_(kitchen_tag_subcategory_ids))
                .all()
            )
            by_id = {item.id: item for item in subcategories}
            kitchen_tag_subcategory_names = [
                by_id[item_id].name for item_id in kitchen_tag_subcategory_ids if item_id in by_id
            ]

    return {
        "logo_url": custom_logo or DEFAULT_LOGO_URL,
        "background_url": custom_background or DEFAULT_BACKGROUND_URL,
        "custom_logo_url": custom_logo,
        "custom_background_url": custom_background,
        "business_day_start_time": (
            settings.business_day_start_time if settings and settings.business_day_start_time else DEFAULT_BUSINESS_DAY_START
        ),
        "print_preview_enabled": bool(settings.print_preview_enabled) if settings else False,
        "kds_mark_unavailable_enabled": bool(settings.kds_mark_unavailable_enabled) if settings else False,
        "kitchen_tag_category_id": settings.kitchen_tag_category_id if settings else None,
        "kitchen_tag_subcategory_id": settings.kitchen_tag_subcategory_id if settings else None,
        "kitchen_tag_subcategory_ids": kitchen_tag_subcategory_ids,
        "kitchen_tag_category_name": kitchen_tag_category.name if kitchen_tag_category else None,
        "kitchen_tag_subcategory_name": kitchen_tag_subcategory.name if kitchen_tag_subcategory else None,
        "kitchen_tag_subcategory_names": kitchen_tag_subcategory_names,
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


def _normalize_business_day_start_time(value):
    if value is None:
        return DEFAULT_BUSINESS_DAY_START
    if not isinstance(value, str):
        raise ValueError("business_day_start_time must be a string in HH:MM format")

    normalized = value.strip()
    if not TIME_PATTERN.match(normalized):
        raise ValueError("business_day_start_time must be in HH:MM format (24h)")
    return normalized


def _normalize_print_preview_enabled(value):
    if isinstance(value, bool):
        return value
    raise ValueError("print_preview_enabled must be a boolean")


def _normalize_kds_mark_unavailable_enabled(value):
    if isinstance(value, bool):
        return value
    raise ValueError("kds_mark_unavailable_enabled must be a boolean")


def _normalize_nullable_fk(value, field_name, model_cls):
    if value in (None, "", 0, "0"):
        return None
    try:
        normalized_id = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be an integer or null")

    instance = db.session.get(model_cls, normalized_id)
    if instance is None:
        raise ValueError(f"{field_name} references a missing record")
    return normalized_id


def _normalize_nullable_fk_list(value, field_name, model_cls):
    if value in (None, "", []):
        return []
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be a list of integers")

    normalized_ids = []
    for item in value:
        normalized_id = _normalize_nullable_fk(item, field_name, model_cls)
        if normalized_id is not None and normalized_id not in normalized_ids:
            normalized_ids.append(normalized_id)
    return normalized_ids


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
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValueError(f"Unsupported image extension '{extension}'. Allowed: {allowed}.")

    mimetype = (file_storage.mimetype or "").lower()
    if mimetype and mimetype not in ALLOWED_CONTENT_TYPES and mimetype not in {"application/octet-stream", "binary/octet-stream"}:
        allowed = ", ".join(sorted(ALLOWED_CONTENT_TYPES))
        raise ValueError(f"Unsupported image content type '{mimetype}'. Allowed: {allowed}.")

    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)

    max_size = int(current_app.config.get("BRANDING_MAX_UPLOAD_BYTES", 5 * 1024 * 1024))
    if size > max_size:
        raise ValueError(f"Image exceeds max upload size ({max_size // (1024 * 1024)} MB).")

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

    if (
        "logo_url" not in data
        and "background_url" not in data
        and "business_day_start_time" not in data
        and "print_preview_enabled" not in data
        and "kds_mark_unavailable_enabled" not in data
        and "kitchen_tag_category_id" not in data
        and "kitchen_tag_subcategory_id" not in data
        and "kitchen_tag_subcategory_ids" not in data
    ):
        return jsonify(
            {
                "error": "Provide logo_url, background_url, business_day_start_time, print_preview_enabled, kds_mark_unavailable_enabled, kitchen_tag_category_id, kitchen_tag_subcategory_id, and/or kitchen_tag_subcategory_ids"
            }
        ), 400

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
        if "business_day_start_time" in data:
            settings.business_day_start_time = _normalize_business_day_start_time(data.get("business_day_start_time"))
        if "print_preview_enabled" in data:
            settings.print_preview_enabled = _normalize_print_preview_enabled(data.get("print_preview_enabled"))
        if "kds_mark_unavailable_enabled" in data:
            settings.kds_mark_unavailable_enabled = _normalize_kds_mark_unavailable_enabled(
                data.get("kds_mark_unavailable_enabled")
            )
        if "kitchen_tag_category_id" in data:
            settings.kitchen_tag_category_id = _normalize_nullable_fk(
                data.get("kitchen_tag_category_id"),
                "kitchen_tag_category_id",
                Category,
            )
            if settings.kitchen_tag_category_id is not None:
                settings.kitchen_tag_subcategory_id = None
        if "kitchen_tag_subcategory_id" in data:
            next_subcategory_id = _normalize_nullable_fk(
                data.get("kitchen_tag_subcategory_id"),
                "kitchen_tag_subcategory_id",
                SubCategory,
            )
            settings.kitchen_tag_subcategory_id = next_subcategory_id
            if next_subcategory_id is not None:
                subcategory = db.session.get(SubCategory, next_subcategory_id)
                settings.kitchen_tag_category_id = subcategory.category_id if subcategory else None
                settings.kitchen_tag_subcategory_ids = [next_subcategory_id]
        if "kitchen_tag_subcategory_ids" in data:
            next_subcategory_ids = _normalize_nullable_fk_list(
                data.get("kitchen_tag_subcategory_ids"),
                "kitchen_tag_subcategory_ids",
                SubCategory,
            )
            settings.kitchen_tag_subcategory_ids = next_subcategory_ids
            settings.kitchen_tag_subcategory_id = next_subcategory_ids[0] if next_subcategory_ids else None
            settings.kitchen_tag_category_id = None
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
