import base64
import binascii
import os
import re
from decimal import Decimal
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app.extensions import db
from app.models.models import MenuItem, Station, SubCategory, Category, User
from app.services.cloud_sync import queue_cloud_sync_delete
from app.services.waiter_profiles import waiter_allowed_station_ids
from app.utils.decorators import roles_required, extract_roles_from_claims
from sqlalchemy import func
import logging

menu_items_bp = Blueprint("menu_items_bp", __name__, url_prefix="/menu-items")

# Logging setup
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


ALLOWED_QUANTITY_STEPS = {Decimal("0.5"), Decimal("1.0")}
LOCAL_MENU_IMAGE_PREFIX = "/api/menu-items/images/"
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
DATA_URL_PATTERN = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,(.+)$", re.IGNORECASE)

# Consistent error response function
def error_response(message: str, status_code: int):
    logger.error(f"Error in menu_items endpoint: {message}")
    return jsonify({"error": message}), status_code


def _menu_image_dir():
    upload_dir = current_app.config.get("MENU_IMAGE_UPLOAD_DIR")
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def _is_local_menu_image(url):
    return isinstance(url, str) and url.startswith(LOCAL_MENU_IMAGE_PREFIX)


def _delete_menu_image_if_local(url):
    if not _is_local_menu_image(url):
        return
    filename = os.path.basename(url)
    if not filename:
        return
    path = os.path.join(_menu_image_dir(), filename)
    if os.path.exists(path):
        os.remove(path)


def _save_raw_image_bytes(image_bytes: bytes, ext: str) -> str:
    filename = f"menu_{uuid4().hex}.{ext.lower()}"
    path = os.path.join(_menu_image_dir(), filename)
    with open(path, "wb") as f:
        f.write(image_bytes)
    return f"{LOCAL_MENU_IMAGE_PREFIX}{filename}"


def _save_uploaded_image_file(file_storage):
    if not file_storage or not file_storage.filename:
        return None
    extension = file_storage.filename.rsplit(".", 1)[-1].lower() if "." in file_storage.filename else ""
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Unsupported image extension. Use PNG, JPG, JPEG, or WEBP.")
    max_size = int(current_app.config.get("MENU_IMAGE_MAX_UPLOAD_BYTES", 3 * 1024 * 1024))
    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size > max_size:
        raise ValueError("Image exceeds max upload size.")
    return _save_raw_image_bytes(file_storage.read(), extension)


def _save_data_url_image(data_url: str):
    if not data_url:
        return None
    match = DATA_URL_PATTERN.match(data_url.strip())
    if not match:
        raise ValueError("Image data must be a valid base64 data URL.")
    ext = match.group(1).lower()
    payload = match.group(2)
    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Invalid base64 image payload.") from exc
    max_size = int(current_app.config.get("MENU_IMAGE_MAX_UPLOAD_BYTES", 3 * 1024 * 1024))
    if len(image_bytes) > max_size:
        raise ValueError("Image exceeds max upload size.")
    return _save_raw_image_bytes(image_bytes, ext)


def _coerce_bool(value, field_name):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        norm = value.strip().lower()
        if norm in {"true", "1", "yes", "on"}:
            return True
        if norm in {"false", "0", "no", "off"}:
            return False
    raise ValueError(f"{field_name} must be a boolean")


def _coerce_int(value, field_name):
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    raise ValueError(f"{field_name} must be an integer")


def _coerce_decimal_or_none(value, field_name):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float, Decimal, str)):
        try:
            parsed = Decimal(str(value))
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"{field_name} must be a non-negative number or null") from exc
        if parsed < 0:
            raise ValueError(f"{field_name} must be a non-negative number or null")
        return parsed
    raise ValueError(f"{field_name} must be a non-negative number or null")


def _validate_at_least_one_price(price: Decimal | None, vip_price: Decimal | None):
    if price is None and vip_price is None:
        raise ValueError("Provide at least one price: Normal Price and/or VIP Price.")


def _parse_menu_payload():
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        data = request.form.to_dict()
        image_file = request.files.get("image_file")
    else:
        data = request.get_json() or {}
        image_file = None
    return data, image_file

# ------------------ Helper ------------------
def menu_item_to_dict(item: MenuItem):
    # Safely access category and subcategory names
    category = item.subcategory.category if item.subcategory else None
    category_step = Decimal(str(category.quantity_step)) if category and category.quantity_step is not None else Decimal("1.0")
    menu_step = Decimal(str(item.quantity_step)) if item.quantity_step is not None else None
    effective_step = menu_step if menu_step is not None else category_step
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price) if item.price is not None else None,
        "vip_price": float(item.vip_price) if item.vip_price is not None else None,
        # Backward-compatible field: effective step used by waiter flows.
        "quantity_step": float(effective_step),
        # Explicit step fields for admin/edit flows.
        "menu_quantity_step": float(menu_step) if menu_step is not None else None,
        "category_quantity_step": float(category_step),
        "is_available": item.is_available,
        "image_url": item.image_url,
        "station_id": item.station_id,
        "station_name": item.station_rel.name if item.station_rel else None,
        "subcategory_id": item.subcategory_id,
        "subcategory_name": item.subcategory.name if item.subcategory else None,
        "category_id": category.id if category else None,
        "category_name": category.name if category else None,
    }

# ------------------ Preflight ------------------
@menu_items_bp.route("", methods=["OPTIONS"])
@menu_items_bp.route("/", methods=["OPTIONS"])
@menu_items_bp.route("/<int:item_id>", methods=["OPTIONS"])
def menu_items_options(item_id=None):
    return jsonify({"status": "ok"}), 200


@menu_items_bp.route("/images/<path:filename>", methods=["GET"])
def menu_item_image(filename):
    return send_from_directory(_menu_image_dir(), filename)

# ------------------ GET ALL ------------------
@menu_items_bp.route("", methods=["GET"])
@menu_items_bp.route("/", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "butcher", "bar", "cashier")
def get_menu_items():
    station_id = request.args.get("station_id", type=int)
    subcategory_id = request.args.get("subcategory_id", type=int)
    query = MenuItem.query
    claims = get_jwt()
    roles = extract_roles_from_claims(claims)

    if "waiter" in roles:
        user = db.session.get(User, int(get_jwt_identity()))
        if user and user.waiter_profile:
            allowed_station_ids = waiter_allowed_station_ids(user)
            if allowed_station_ids:
                query = query.filter(MenuItem.station_id.in_(allowed_station_ids))
            else:
                return jsonify([]), 200

    if station_id:
        query = query.filter_by(station_id=station_id)
    if subcategory_id:
        query = query.filter_by(subcategory_id=subcategory_id)

    items = query.all()
    logger.debug(f"Retrieved {len(items)} menu items")
    return jsonify([menu_item_to_dict(i) for i in items]), 200

# ------------------ GET BY ID ------------------
@menu_items_bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "butcher", "bar", "cashier")
def get_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        return error_response("Menu item not found", 404)
    logger.debug(f"Retrieved menu item {item_id}: {item.name}")
    return jsonify(menu_item_to_dict(item)), 200

# ------------------ CREATE ------------------
@menu_items_bp.route("", methods=["POST"])
@menu_items_bp.route("/", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_menu_item():
    data, image_file = _parse_menu_payload()
    name = data.get("name")
    price_raw = data.get("price")
    vip_price_raw = data.get("vip_price")
    quantity_step = data.get("quantity_step", None)
    station_id = data.get("station_id")
    subcategory_id = data.get("subcategory_id")
    is_available = data.get("is_available", True)
    image_url = data.get("image_url", "")

    # Validate required fields
    if not name or not isinstance(name, str) or not name.strip():
        return error_response("Name is required and must be a non-empty string", 400)
    name = name.strip()
    if len(name) > 120:
        return error_response("Name exceeds 120 characters", 400)
    try:
        price = _coerce_decimal_or_none(price_raw, "Price")
        vip_price = _coerce_decimal_or_none(vip_price_raw, "VIP price")
        _validate_at_least_one_price(price, vip_price)
    except ValueError as exc:
        return error_response(str(exc), 400)
    parsed_quantity_step = None
    if quantity_step is not None:
        if isinstance(quantity_step, str) and quantity_step.strip() == "":
            quantity_step = None
        if quantity_step is None:
            parsed_quantity_step = None
        else:
            if not isinstance(quantity_step, (int, float, Decimal)):
                if isinstance(quantity_step, str):
                    try:
                        quantity_step = Decimal(quantity_step)
                    except Exception:  # noqa: BLE001
                        return error_response("quantity_step must be a number or null", 400)
                else:
                    return error_response("quantity_step must be a number or null", 400)
            parsed_quantity_step = Decimal(str(quantity_step))
            if parsed_quantity_step not in ALLOWED_QUANTITY_STEPS:
                return error_response("quantity_step must be 0.5, 1.0, or null", 400)
    try:
        station_id = _coerce_int(station_id, "Station ID")
        subcategory_id = _coerce_int(subcategory_id, "Subcategory ID")
        is_available = _coerce_bool(is_available, "is_available")
    except ValueError as exc:
        return error_response(str(exc), 400)

    station = db.session.get(Station, station_id)
    if not station:
        return error_response("Station not found", 400)
    if len(station.name) > 20:
        return error_response("Station name exceeds 20 characters, incompatible with order items", 400)

    subcategory = db.session.get(SubCategory, subcategory_id)
    if not subcategory:
        return error_response("Subcategory not found", 400)

    # Case-insensitive duplicate check
    if MenuItem.query.filter(func.lower(MenuItem.name) == name.lower(), MenuItem.subcategory_id == subcategory_id).first():
        return error_response("Menu item with this name already exists in this subcategory", 400)

    try:
        stored_image_url = None
        if image_file:
            stored_image_url = _save_uploaded_image_file(image_file)
        elif image_url:
            if isinstance(image_url, str) and image_url.startswith("data:image/"):
                stored_image_url = _save_data_url_image(image_url)
            elif _is_local_menu_image(image_url):
                stored_image_url = image_url
            else:
                return error_response("Image must be uploaded as a file.", 400)
    except ValueError as exc:
        return error_response(str(exc), 400)

    item = MenuItem(
        name=name,
        description=None,
        price=price,
        vip_price=vip_price,
        quantity_step=parsed_quantity_step,
        station_id=station_id,
        subcategory_id=subcategory_id,
        is_available=is_available,
        image_url=stored_image_url,
    )
    db.session.add(item)
    try:
        db.session.commit()
        logger.info(f"Created menu item {item.id}: {item.name}")
        return jsonify(menu_item_to_dict(item)), 201
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to create menu item: {str(e)}", 500)

# ------------------ UPDATE ------------------
@menu_items_bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        return error_response("Menu item not found", 404)

    data, image_file = _parse_menu_payload()

    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip():
            return error_response("Name must be a non-empty string", 400)
        name = name.strip()
        if len(name) > 120:
            return error_response("Name exceeds 120 characters", 400)
        # Use current subcategory_id if not updating it
        subcategory_id = data.get("subcategory_id", item.subcategory_id)
        try:
            subcategory_id = _coerce_int(subcategory_id, "Subcategory ID")
        except ValueError as exc:
            return error_response(str(exc), 400)
        # Case-insensitive duplicate check
        if MenuItem.query.filter(func.lower(MenuItem.name) == name.lower(), MenuItem.subcategory_id == subcategory_id)\
                         .filter(MenuItem.id != item.id).first():
            return error_response("Menu item with this name already exists in this subcategory", 400)
        item.name = name

    if "station_id" in data:
        try:
            station_id = _coerce_int(data["station_id"], "Station ID")
        except ValueError as exc:
            return error_response(str(exc), 400)
        station = db.session.get(Station, station_id)
        if not station:
            return error_response("Station not found", 400)
        if len(station.name) > 20:
            return error_response("Station name exceeds 20 characters, incompatible with order items", 400)
        item.station_id = station.id

    if "subcategory_id" in data:
        try:
            next_subcategory_id = _coerce_int(data["subcategory_id"], "Subcategory ID")
        except ValueError as exc:
            return error_response(str(exc), 400)
        subcategory = db.session.get(SubCategory, next_subcategory_id)
        if not subcategory:
            return error_response("Subcategory not found", 400)
        # Use new name if provided, else current name
        name_to_check = data.get("name", item.name)
        if MenuItem.query.filter(func.lower(MenuItem.name) == name_to_check.lower(), MenuItem.subcategory_id == subcategory.id)\
                         .filter(MenuItem.id != item.id).first():
            return error_response("Menu item with this name already exists in this subcategory", 400)
        item.subcategory_id = subcategory.id

    if "price" in data:
        try:
            item.price = _coerce_decimal_or_none(data["price"], "Price")
        except ValueError as exc:
            return error_response(str(exc), 400)

    if "vip_price" in data:
        try:
            item.vip_price = _coerce_decimal_or_none(data["vip_price"], "VIP price")
        except ValueError as exc:
            return error_response(str(exc), 400)

    try:
        _validate_at_least_one_price(item.price, item.vip_price)
    except ValueError as exc:
        return error_response(str(exc), 400)

    if "quantity_step" in data:
        if data["quantity_step"] is None:
            item.quantity_step = None
        else:
            quantity_step_raw = data["quantity_step"]
            if isinstance(quantity_step_raw, str) and quantity_step_raw.strip() == "":
                item.quantity_step = None
                quantity_step_raw = None
            if quantity_step_raw is None:
                item.quantity_step = None
            else:
                if not isinstance(quantity_step_raw, (int, float, Decimal, str)):
                    return error_response("quantity_step must be a number or null", 400)
                try:
                    quantity_step = Decimal(str(quantity_step_raw))
                except Exception:  # noqa: BLE001
                    return error_response("quantity_step must be a number or null", 400)
                if quantity_step not in ALLOWED_QUANTITY_STEPS:
                    return error_response("quantity_step must be 0.5, 1.0, or null", 400)
                item.quantity_step = quantity_step

    if "is_available" in data:
        try:
            item.is_available = _coerce_bool(data["is_available"], "is_available")
        except ValueError as exc:
            return error_response(str(exc), 400)

    if "description" in data:
        item.description = None

    if image_file:
        try:
            next_url = _save_uploaded_image_file(image_file)
        except ValueError as exc:
            return error_response(str(exc), 400)
        _delete_menu_image_if_local(item.image_url)
        item.image_url = next_url
    elif "image_url" in data:
        image_url = data["image_url"]
        if not image_url:
            _delete_menu_image_if_local(item.image_url)
            item.image_url = None
        elif isinstance(image_url, str) and image_url.startswith("data:image/"):
            try:
                next_url = _save_data_url_image(image_url)
            except ValueError as exc:
                return error_response(str(exc), 400)
            _delete_menu_image_if_local(item.image_url)
            item.image_url = next_url
        elif _is_local_menu_image(image_url):
            item.image_url = image_url
        else:
            return error_response("Image must be uploaded as a file.", 400)

    try:
        db.session.commit()
        logger.info(f"Updated menu item {item_id}: {item.name}")
        return jsonify(menu_item_to_dict(item)), 200
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to update menu item: {str(e)}", 500)

# ------------------ DELETE ------------------
@menu_items_bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        return error_response("Menu item not found", 404)
    try:
        _delete_menu_image_if_local(item.image_url)
        db.session.delete(item)
        queue_cloud_sync_delete("menu_item", item_id)
        db.session.commit()
        logger.info(f"Deleted menu item {item_id}: {item.name}")
        return jsonify({"message": "Menu item deleted"}), 200
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to delete menu item: {str(e)}", 500)

# ------------------ GET MENU ITEMS BY CATEGORY ------------------ #
@menu_items_bp.route("/by-category/<int:category_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "butcher", "bar", "cashier")
def get_menu_items_by_category(category_id):
    query = (
        MenuItem.query
        .join(SubCategory, MenuItem.subcategory_id == SubCategory.id, isouter=True)
        .join(Category, SubCategory.category_id == Category.id, isouter=True)
        .filter(Category.id == category_id)
    )
    claims = get_jwt()
    roles = extract_roles_from_claims(claims)

    if "waiter" in roles:
        user = db.session.get(User, int(get_jwt_identity()))
        if user and user.waiter_profile:
            allowed_station_ids = waiter_allowed_station_ids(user)
            if allowed_station_ids:
                query = query.filter(MenuItem.station_id.in_(allowed_station_ids))
            else:
                return jsonify([]), 200

    items = query.all()
    return jsonify([menu_item_to_dict(i) for i in items]), 200

    
