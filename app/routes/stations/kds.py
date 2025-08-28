from flask import Blueprint, jsonify, abort
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app.models.models import OrderItem, Station, Order
from app.extensions import db
from sqlalchemy import asc
from datetime import datetime

stations_kds_bp = Blueprint("stations_kds_bp", __name__, url_prefix="/stations/kds")


def parse_station_identity(identity):
    """
    Accept either an int or a string like 'station:2' and return int id.
    Return None if cannot parse.
    """
    if identity is None:
        return None
    try:
        # if identity already integer-like (string of digits) or int
        if isinstance(identity, int):
            return identity
        if isinstance(identity, str):
            # handle 'station:2' or just '2'
            if identity.startswith("station:"):
                _, _, sid = identity.partition(":")
                return int(sid)
            return int(identity)
    except (ValueError, TypeError):
        return None
    return None


# ---- GET PENDING ORDERS FOR STATION ----
@stations_kds_bp.route("/orders", methods=["GET"])
@jwt_required()
def get_pending_orders():
    identity = get_jwt_identity()
    station_id = parse_station_identity(identity)
    if station_id is None:
        abort(400, "Invalid station identity in token")

    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")

    pending_items = (
        db.session.query(OrderItem)
        .join(Order)
        .join(Order.table)
        .join(Order.user)
        .filter(OrderItem.station == station.name, OrderItem.status == "pending")
        .order_by(asc(OrderItem.created_at))
        .all()
    )

    orders_dict = {}
    for item in pending_items:
        order_obj = item.order
        order_id = item.order_id
        table = getattr(order_obj, "table", None)
        waiter = getattr(order_obj, "user", None)

        menu_item = getattr(item, "menu_item", None)
        item_name = menu_item.name if menu_item else None

        if order_id not in orders_dict:
            orders_dict[order_id] = {
                "order_id": order_id,
                "table_id": table.id if table else None,
                "table_number": table.number if table else None,
                "waiter_id": waiter.id if waiter else None,
                "waiter_name": waiter.username if waiter else None,
                "order_created_at": order_obj.created_at.isoformat() if order_obj and getattr(order_obj, "created_at", None) else None,
                "order_updated_at": order_obj.updated_at.isoformat() if order_obj and getattr(order_obj, "updated_at", None) else None,
                "items": [],
            }

        orders_dict[order_id]["items"].append({
            "item_id": item.id,
            "menu_item_id": item.menu_item_id,
            "name": item_name,
            "quantity": float(item.quantity) if item.quantity is not None else 0.0,
            "price": float(item.price) if item.price is not None else 0.0,
            "vip_price": float(item.vip_price) if item.vip_price is not None else None,
            "notes": item.notes,
            "prep_tag": item.prep_tag,
            "status": item.status,
            "created_at": item.created_at.isoformat() if getattr(item, "created_at", None) else None,
        })

    return jsonify(list(orders_dict.values())), 200

# ---- UPDATE ORDER ITEM STATUS TO READY ----
@stations_kds_bp.route("/orders/<int:order_item_id>/status", methods=["PUT"])
@jwt_required()
def update_order_item_status(order_item_id):
    identity = get_jwt_identity()
    station_id = parse_station_identity(identity)
    if station_id is None:
        abort(400, "Invalid station identity in token")

    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")

    item = db.session.get(OrderItem, order_item_id)
    if not item:
        abort(404, "Order item not found")

    # Ensure this order item belongs to this station
    # You store station as name on OrderItem; check that:
    if item.station != station.name:
        abort(403, "Order item does not belong to your station")

    # Update status
    item.status = "ready"
    item.updated_at = datetime.utcnow()
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        abort(500, f"Failed to update item status: {str(e)}")

    # Return a useful payload
    return jsonify({
        "message": f"Item {item.id} marked as ready",
        "item": {
            "item_id": item.id,
            "order_id": item.order_id,
            "menu_item_id": item.menu_item_id,
            "status": item.status,
            "updated_at": item.updated_at.isoformat() if getattr(item, "updated_at", None) else None
        }
    }), 200
