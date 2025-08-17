from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import MenuItem, Station
from app.utils.decorators import roles_required

menu_items_bp = Blueprint("menu_items_bp", __name__, url_prefix="/menu-items")


def menu_item_to_dict(item: MenuItem):
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price) if item.price is not None else None,
        "station": item.station_rel.name if item.station_rel else None,
        "is_available": item.is_available,
        "image_url": item.image_url,
    }


# ---- GET ALL MENU ITEMS ----
@menu_items_bp.route("/", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "butcher", "bar", "cashier")
def get_menu_items():
    """Get all menu items (optionally filter by ?station_id=)."""
    station_id = request.args.get("station_id", type=int)
    query = MenuItem.query
    if station_id:
        query = query.filter_by(station_id=station_id)
    items = query.all()
    return jsonify([menu_item_to_dict(i) for i in items]), 200


# ---- GET SINGLE MENU ITEM ----
@menu_items_bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "butcher", "bar", "cashier")
def get_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        abort(404)
    return jsonify(menu_item_to_dict(item)), 200


# ---- CREATE MENU ITEM ----
@menu_items_bp.route("/", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_menu_item():
    data = request.get_json() or {}

    name = data.get("name")
    description = data.get("description")
    price = data.get("price")
    station_id = data.get("station_id")
    is_available = data.get("is_available", True)
    image_url = data.get("image_url")

    if not name or price is None or not station_id:
        abort(400, "Name, price, and station_id are required.")

    station = Station.query.get(station_id)
    if not station:
        abort(400, "Station not found.")

    if MenuItem.query.filter_by(name=name).first():
        abort(400, "Menu item with this name already exists.")

    item = MenuItem(
        name=name,
        description=description,
        price=price,
        station_id=station_id,
        is_available=is_available,
        image_url=image_url,
    )
    db.session.add(item)
    db.session.commit()

    return jsonify(menu_item_to_dict(item)), 201


# ---- UPDATE MENU ITEM ----
@menu_items_bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        abort(404)

    data = request.get_json() or {}

    if "station_id" in data:
        station = Station.query.get(data["station_id"])
        if not station:
            abort(400, "Station not found.")
        item.station_id = station.id

    item.name = data.get("name", item.name)
    item.description = data.get("description", item.description)
    item.price = data.get("price", item.price)
    item.is_available = data.get("is_available", item.is_available)
    item.image_url = data.get("image_url", item.image_url)

    db.session.commit()
    return jsonify(menu_item_to_dict(item)), 200


# ---- DELETE MENU ITEM ----
@menu_items_bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if not item:
        abort(404)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Menu item deleted"}), 200
