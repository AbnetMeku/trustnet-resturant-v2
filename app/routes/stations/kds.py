from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.models import OrderItem, db
from app.utils.decorators import roles_required

stations_kds_bp = Blueprint("stations_kds_bp", __name__, url_prefix="/stations/kds")

# ---- GET PENDING ORDERS FOR STATION ----
@stations_kds_bp.route("/orders", methods=["GET"])
@jwt_required()
def get_pending_orders():
    station_id = get_jwt_identity()
    # Get station by ID
    from app.models.models import Station
    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")

    pending_items = (
        OrderItem.query
        .filter_by(station=station.name, status="pending")
        .order_by(OrderItem.created_at.asc())
        .all()
    )

    # Group by order
    orders_dict = {}
    for item in pending_items:
        order_id = item.order_id
        if order_id not in orders_dict:
            orders_dict[order_id] = {
                "order_id": order_id,
                "items": [],
            }
        orders_dict[order_id]["items"].append({
            "item_id": item.id,
            "name": item.name,
            "quantity": item.quantity,
            "notes": item.notes,
            "prep_tag": item.prep_tag
        })

    return jsonify(list(orders_dict.values())), 200

# ---- UPDATE ORDER ITEM STATUS TO READY ----
@stations_kds_bp.route("/orders/<int:order_item_id>/status", methods=["PUT"])
@jwt_required()
def update_order_item_status(order_item_id):
    station_id = get_jwt_identity()
    from app.models.models import Station

    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")

    item = db.session.get(OrderItem, order_item_id)
    if not item or item.station != station.name:
        abort(404, "Order item not found or does not belong to this station")

    item.status = "ready"
    db.session.commit()
    return jsonify({"message": f"Item {item.id} marked as ready"}), 200
