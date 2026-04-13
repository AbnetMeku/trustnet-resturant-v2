from flask import Blueprint, jsonify, abort, request
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app.models.models import OrderItem, Station, Order
from app.extensions import db
from sqlalchemy import asc, desc
from datetime import datetime
from app.routes.orders.order import recalc_order_total
from app.services.inventory_integration import send_inventory_adjustment_or_queue
from app.utils.timezone import eat_now_naive, get_business_day_bounds, get_business_day_date
stations_kds_bp = Blueprint("stations_kds_bp", __name__, url_prefix="/stations/kds")

def parse_station_identity(identity):
    """
    Accept either an int or a string like 'station:2' and return int id.
    Return None if cannot parse.
    """
    if identity is None:
        return None
    try:
        if isinstance(identity, int):
            return identity
        if isinstance(identity, str):
            if identity.startswith("station:"):
                _, _, sid = identity.partition(":")
                return int(sid)
            return int(identity)
    except (ValueError, TypeError):
        return None
    return None


def ensure_station_claims():
    claims = get_jwt() or {}
    role = claims.get("role")
    if role != "station":
        abort(403, "Station token required")

# ---- GET PENDING ORDERS FOR STATION ----
@stations_kds_bp.route("/orders", methods=["GET"])
@jwt_required()
def get_pending_orders():
    ensure_station_claims()
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
                "station_id": station.id,
                "station_name": station.name,
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
            "updated_at": item.updated_at.isoformat() if getattr(item, "updated_at", None) else None,
        })

    return jsonify(list(orders_dict.values())), 200


# ---- UPDATE ORDER ITEM STATUS TO READY OR VOID ----
@stations_kds_bp.route("/orders/<int:order_item_id>/status", methods=["PUT"])
@jwt_required()
def update_order_item_status(order_item_id):
    ensure_station_claims()
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

    if item.station != station.name:
        abort(403, "Order item does not belong to your station")

    # Accept new status from request JSON
    data = request.get_json() or {}
    new_status = data.get("status", "ready").lower()
    if new_status not in ["ready", "void"]:
        abort(400, "Invalid status. Must be 'ready' or 'void'")

    prev_status = item.status
    item.status = new_status
    item.updated_at = eat_now_naive()

    snapshot_date = None
    if getattr(item, "created_at", None):
        snapshot_date = get_business_day_date(item.created_at).isoformat()

    if prev_status != "ready" and new_status == "ready":
        # Deduct inventory
        send_inventory_adjustment_or_queue(
            station_name=item.station,
            menu_item_id=item.menu_item_id,
            quantity=float(item.quantity),
            snapshot_date=snapshot_date,
        )
    elif prev_status == "ready" and new_status == "void":
        # Revert inventory for voided item
        send_inventory_adjustment_or_queue(
            station_name=item.station,
            menu_item_id=item.menu_item_id,
            quantity=float(item.quantity),
            reverse=True,
            snapshot_date=snapshot_date,
        )

    # Recalculate order totals after status change (ready or void)
    recalc_order_total(item.order)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        abort(500, f"Failed to update item status: {str(e)}")

    return jsonify({
        "message": f"Item {item.id} marked as {new_status}",
        "item": {
            "item_id": item.id,
            "order_id": item.order_id,
            "menu_item_id": item.menu_item_id,
            "status": item.status,
            "updated_at": item.updated_at.isoformat() if getattr(item, "updated_at", None) else None
        }
    }), 200

# ---- GET READY ITEMS HISTORY FOR STATION ----
@stations_kds_bp.route("/orders/history", methods=["GET"])
@jwt_required()
def get_ready_orders_history():
    ensure_station_claims()
    identity = get_jwt_identity()
    station_id = parse_station_identity(identity)
    if station_id is None:
        abort(400, "Invalid station identity in token")

    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")

    # Optional query params
    waiter_id = request.args.get("waiter_id", type=int)
    table_number = request.args.get("table_number", type=int)
    date_filter = request.args.get("date")  # Date filter (YYYY-MM-DD)

    # Base query: include ready and void items in history
    query = (
        db.session.query(OrderItem)
        .join(Order)
        .join(Order.table)
        .join(Order.user)
        .filter(
            OrderItem.station == station.name,
            OrderItem.status.in_(["ready", "void"]),
        )
    )

    # Apply date filter if provided
    if date_filter:
        try:
            selected_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
            date_start, date_end = get_business_day_bounds(selected_date)
            query = query.filter(OrderItem.created_at >= date_start, OrderItem.created_at < date_end)
        except ValueError:
            abort(400, "Invalid date format. Use YYYY-MM-DD")

    if waiter_id:
        query = query.filter(Order.user_id == waiter_id)

    if table_number:
        query = query.filter(Order.table.has(number=table_number))

    ready_items = query.order_by(desc(OrderItem.created_at)).all()

    orders_dict = {}
    for item in ready_items:
        order_obj = item.order
        order_id = item.order_id
        table = getattr(order_obj, "table", None)
        waiter = getattr(order_obj, "user", None)

        menu_item = getattr(item, "menu_item", None)
        item_name = menu_item.name if menu_item else None

        if order_id not in orders_dict:
            orders_dict[order_id] = {
                "order_id": order_id,
                "station_id": station.id,
                "station_name": station.name,
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
            "updated_at": item.updated_at.isoformat() if getattr(item, "updated_at", None) else None,
        })

    return jsonify(list(orders_dict.values())), 200
