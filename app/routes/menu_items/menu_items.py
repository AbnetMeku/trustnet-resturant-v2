from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import MenuItem, Station, SubCategory
from app.utils.decorators import roles_required
from sqlalchemy import func
import logging
from decimal import Decimal

menu_items_bp = Blueprint("menu_items_bp", __name__, url_prefix="/menu-items")

# Logging setup
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Consistent error response function
def error_response(message: str, status_code: int):
    logger.error(f"Error in menu_items endpoint: {message}")
    return jsonify({"error": message}), status_code

# ------------------ Helper ------------------
def menu_item_to_dict(item: MenuItem):
    # Safely access category and subcategory names
    category = item.subcategory.category if item.subcategory else None
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price) if item.price is not None else None,
        "vip_price": float(item.vip_price) if item.vip_price is not None else None,
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

# ------------------ GET ALL ------------------
@menu_items_bp.route("", methods=["GET"])
@menu_items_bp.route("/", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "butcher", "bar", "cashier")
def get_menu_items():
    station_id = request.args.get("station_id", type=int)
    subcategory_id = request.args.get("subcategory_id", type=int)
    query = MenuItem.query

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
    data = request.get_json() or {}
    name = data.get("name")
    description = data.get("description")
    price = data.get("price")
    vip_price = data.get("vip_price")
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
    if price is not None and (not isinstance(price, (int, float, Decimal)) or price < 0):
        return error_response("Price must be a non-negative number or null", 400)
    if vip_price is not None and (not isinstance(vip_price, (int, float, Decimal)) or vip_price < 0):
        return error_response("VIP price must be a non-negative number or null", 400)
    if not isinstance(station_id, int):
        return error_response("Station ID must be an integer", 400)
    if not isinstance(subcategory_id, int):
        return error_response("Subcategory ID must be an integer", 400)
    if not isinstance(is_available, bool):
        return error_response("is_available must be a boolean", 400)
    if image_url and not image_url.startswith("data:image/"):
        return error_response("Image URL must be a base64 data URL or empty", 400)

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

    item = MenuItem(
        name=name,
        description=description,
        price=Decimal(str(price)) if price is not None else None,
        vip_price=Decimal(str(vip_price)) if vip_price is not None else None,
        station_id=station_id,
        subcategory_id=subcategory_id,
        is_available=is_available,
        image_url=image_url,
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

    data = request.get_json() or {}

    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip():
            return error_response("Name must be a non-empty string", 400)
        name = name.strip()
        if len(name) > 120:
            return error_response("Name exceeds 120 characters", 400)
        # Use current subcategory_id if not updating it
        subcategory_id = data.get("subcategory_id", item.subcategory_id)
        # Case-insensitive duplicate check
        if MenuItem.query.filter(func.lower(MenuItem.name) == name.lower(), MenuItem.subcategory_id == subcategory_id)\
                         .filter(MenuItem.id != item.id).first():
            return error_response("Menu item with this name already exists in this subcategory", 400)
        item.name = name

    if "station_id" in data:
        if not isinstance(data["station_id"], int):
            return error_response("Station ID must be an integer", 400)
        station = db.session.get(Station, data["station_id"])
        if not station:
            return error_response("Station not found", 400)
        if len(station.name) > 20:
            return error_response("Station name exceeds 20 characters, incompatible with order items", 400)
        item.station_id = station.id

    if "subcategory_id" in data:
        if not isinstance(data["subcategory_id"], int):
            return error_response("Subcategory ID must be an integer", 400)
        subcategory = db.session.get(SubCategory, data["subcategory_id"])
        if not subcategory:
            return error_response("Subcategory not found", 400)
        # Use new name if provided, else current name
        name_to_check = data.get("name", item.name)
        if MenuItem.query.filter(func.lower(MenuItem.name) == name_to_check.lower(), MenuItem.subcategory_id == subcategory.id)\
                         .filter(MenuItem.id != item.id).first():
            return error_response("Menu item with this name already exists in this subcategory", 400)
        item.subcategory_id = subcategory.id

    if "price" in data:
        if data["price"] is not None and (not isinstance(data["price"], (int, float, Decimal)) or data["price"] < 0):
            return error_response("Price must be a non-negative number or null", 400)
        item.price = Decimal(str(data["price"])) if data["price"] is not None else None

    if "vip_price" in data:
        if data["vip_price"] is not None and (not isinstance(data["vip_price"], (int, float, Decimal)) or data["vip_price"] < 0):
            return error_response("VIP price must be a non-negative number or null", 400)
        item.vip_price = Decimal(str(data["vip_price"])) if data["vip_price"] is not None else None

    if "is_available" in data:
        if not isinstance(data["is_available"], bool):
            return error_response("is_available must be a boolean", 400)
        item.is_available = data["is_available"]

    if "description" in data:
        if data["description"] is not None and not isinstance(data["description"], str):
            return error_response("Description must be a string or null", 400)
        item.description = data["description"]

    if "image_url" in data:
        image_url = data["image_url"]
        if image_url and not image_url.startswith("data:image/"):
            return error_response("Image URL must be a base64 data URL or empty", 400)
        item.image_url = image_url if image_url else None

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
        db.session.delete(item)
        db.session.commit()
        logger.info(f"Deleted menu item {item_id}: {item.name}")
        return jsonify({"message": "Menu item deleted"}), 200
    except Exception as e:
        db.session.rollback()
        return error_response(f"Failed to delete menu item: {str(e)}", 500)