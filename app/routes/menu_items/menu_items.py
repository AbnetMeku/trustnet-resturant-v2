from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import MenuItem, Station, SubCategory
from app.utils.decorators import roles_required

menu_items_bp = Blueprint("menu_items_bp", __name__, url_prefix="/menu-items")

# ------------------ Helper ------------------
def menu_item_to_dict(item: MenuItem):
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price) if item.price is not None else None,
        "is_available": item.is_available,
        "image_url": item.image_url,
        "station_id": item.station_id,
        "station_name": item.station_rel.name if item.station_rel else None,
        "subcategory_id": item.subcategory_id,
        "subcategory_name": item.subcategory.name if item.subcategory else None,
        "category_id": item.subcategory.category_id if item.subcategory else None,
        "category_name": item.subcategory.category.name if item.subcategory else None,
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
    return jsonify([menu_item_to_dict(i) for i in items]), 200

# ------------------ GET BY ID ------------------
@menu_items_bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "butcher", "bar", "cashier")
def get_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        return jsonify({"error": "Menu item not found"}), 404
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
    station_id = data.get("station_id")
    subcategory_id = data.get("subcategory_id")
    is_available = data.get("is_available", True)
    image_url = data.get("image_url")

    # Required fields validation
    if not name or price is None or not station_id or not subcategory_id:
        return jsonify({"error": "name, price, station_id, and subcategory_id are required."}), 400

    # Validate station
    station = db.session.get(Station, station_id)
    if not station:
        return jsonify({"error": "Station not found."}), 400

    # Validate subcategory
    subcategory = db.session.get(SubCategory, subcategory_id)
    if not subcategory:
        return jsonify({"error": "Subcategory not found."}), 400

    # Check uniqueness within subcategory
    if MenuItem.query.filter_by(name=name, subcategory_id=subcategory_id).first():
        return jsonify({"error": "Menu item with this name already exists in this subcategory."}), 400

    item = MenuItem(
        name=name,
        description=description,
        price=price,
        station_id=station_id,
        subcategory_id=subcategory_id,
        is_available=is_available,
        image_url=image_url,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(menu_item_to_dict(item)), 201

# ------------------ UPDATE ------------------
@menu_items_bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        return jsonify({"error": "Menu item not found"}), 404

    data = request.get_json() or {}

    # Update station
    if "station_id" in data:
        station = db.session.get(Station, data["station_id"])
        if not station:
            return jsonify({"error": "Station not found."}), 400
        item.station_id = station.id

    # Update subcategory
    if "subcategory_id" in data:
        subcategory = db.session.get(SubCategory, data["subcategory_id"])
        if not subcategory:
            return jsonify({"error": "Subcategory not found."}), 400
        # Check uniqueness
        if MenuItem.query.filter_by(name=data.get("name", item.name), subcategory_id=subcategory.id).filter(MenuItem.id != item.id).first():
            return jsonify({"error": "Menu item with this name already exists in this subcategory."}), 400
        item.subcategory_id = subcategory.id

    item.name = data.get("name", item.name)
    item.description = data.get("description", item.description)
    item.price = data.get("price", item.price)
    item.is_available = data.get("is_available", item.is_available)
    item.image_url = data.get("image_url", item.image_url)

    db.session.commit()
    return jsonify(menu_item_to_dict(item)), 200

# ------------------ DELETE ------------------
@menu_items_bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        return jsonify({"error": "Menu item not found"}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Menu item deleted"}), 200
