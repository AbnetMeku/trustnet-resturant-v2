# app/routes/orders/order.py
from decimal import Decimal
from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import distinct
from app.extensions import db
from app.models.models import Order, OrderItem, MenuItem, Table
from app.routes.orders.kitchen_tag import generate_kitchen_tag
from app.utils.decorators import roles_required

orders_bp = Blueprint("orders_bp", __name__, url_prefix="/orders")

# ---------------- Utilities ----------------
KITCHEN_STATION_KEYS = {"tibs_kitchen", "kitfo_kitchen"}

def normalize_station_key(name: str) -> str:
    """Convert display name like 'Kitfo Kitchen' -> 'kitfo_kitchen'."""
    return name.lower().replace(" ", "_")

def is_kitchen_station(display_name: str) -> bool:
    return normalize_station_key(display_name) in KITCHEN_STATION_KEYS

def safe_int_identity() -> int:
    ident = get_jwt_identity()
    try:
        return int(ident)
    except (TypeError, ValueError):
        abort(401, "Invalid token identity.")

# ---------------- Serializers ----------------
def order_item_to_dict(item: OrderItem):
    return {
        "id": item.id,
        "menu_item_id": item.menu_item_id,
        "name": item.menu_item.name if item.menu_item else None,
        "quantity": item.quantity,
        "price": float(item.price),
        "notes": item.notes,
        "station": item.station,     # display name (e.g., "Kitfo Kitchen")
        "status": item.status,       # "pending" | "ready"
        "prep_tag": item.prep_tag,   # e.g., "0001" (kitchen only)
    }

def order_to_dict(order: Order):
    return {
        "id": order.id,
        "table_id": order.table_id,
        "user_id": order.user_id,
        "status": order.status,  # "open" | "closed" | "paid"
        "total_amount": float(order.total_amount) if order.total_amount else 0.0,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
        "items": [order_item_to_dict(i) for i in order.items],
    }

def recalc_order_total(order: Order) -> None:
    total = Decimal("0.00")
    for i in order.items:
        # i.price may already be Decimal depending on dialect
        total += Decimal(str(i.price)) * int(i.quantity)
    order.total_amount = total

# ---------------- Orders: Create ----------------
@orders_bp.route("/", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def create_order():
    data = request.get_json() or {}
    table_id = data.get("table_id")
    items_data = data.get("items", [])

    if not table_id or not items_data:
        abort(400, "Table ID and items are required.")

    table = db.session.get(Table, table_id)
    if not table:
        abort(404, f"Table {table_id} not found.")

    user_id = safe_int_identity()

    order = Order(table_id=table_id, user_id=user_id, status="open", total_amount=Decimal("0.00"))
    db.session.add(order)
    db.session.flush()  # obtain order.id

    for payload in items_data:
        menu_item_id = payload.get("menu_item_id")
        if not menu_item_id:
            abort(400, "menu_item_id is required for each item.")

        menu_item = db.session.get(MenuItem, menu_item_id)
        if not menu_item:
            abort(404, f"MenuItem {menu_item_id} not found.")

        display_station = menu_item.station_rel.name if menu_item.station_rel else "Unknown"
        prep_tag = generate_kitchen_tag() if is_kitchen_station(display_station) else None

        quantity = int(payload.get("quantity", 1))
        notes = payload.get("notes")

        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=quantity,
            price=menu_item.price,  # Numeric/Decimal in DB
            notes=notes,
            station=display_station,  # store display name for FE
            prep_tag=prep_tag,
            status="pending",
        )
        db.session.add(order_item)

    # compute total after all items added
    recalc_order_total(order)
    db.session.commit()

    return jsonify(order_to_dict(order)), 201

# ---------------- Orders: List ----------------
@orders_bp.route("/", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier", "kitchen", "bar", "butcher")
def list_orders():
    query = Order.query
    table_id = request.args.get("table_id")
    status = request.args.get("status")
    station = request.args.get("station")  # can be "Kitfo Kitchen" or "kitfo_kitchen"

    if table_id:
        query = query.filter_by(table_id=table_id)
    if status:
        query = query.filter_by(status=status)
    if station:
        # Accept both display ("Kitfo Kitchen") and snake ("kitfo_kitchen")
        station_display = station.replace("_", " ").strip()
        query = (
            query.join(OrderItem)
                 .filter(OrderItem.station.ilike(station_display))
                 .distinct(Order.id)
        )

    orders = query.order_by(Order.created_at.desc()).all()
    return jsonify([order_to_dict(o) for o in orders]), 200

# ---------------- Orders: Get Single ----------------
@orders_bp.route("/<int:order_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier", "kitchen", "bar", "butcher")
def get_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        abort(404, "Order not found")
    return jsonify(order_to_dict(order)), 200

# ---------------- Orders: Update (status) ----------------
@orders_bp.route("/<int:order_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def update_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        abort(404, "Order not found")

    data = request.get_json() or {}
    status = data.get("status")
    if status not in {"open", "closed", "paid"}:
        abort(400, "Invalid status. Allowed: open, closed, paid.")
    order.status = status
    db.session.commit()
    return jsonify(order_to_dict(order)), 200

# ---------------- Orders: Delete ----------------
@orders_bp.route("/<int:order_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        abort(404, "Order not found")
    db.session.delete(order)
    db.session.commit()
    return jsonify({"message": "Order deleted"}), 200

# ---------------- OrderItems: Add to existing order ----------------
@orders_bp.route("/<int:order_id>/items", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def add_order_item(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        abort(404, "Order not found")

    data = request.get_json() or {}
    items_data = data.get("items", [])
    if not items_data:
        abort(400, "No items provided")

    for payload in items_data:
        menu_item_id = payload.get("menu_item_id")
        if not menu_item_id:
            abort(400, "menu_item_id is required for each item.")

        menu_item = db.session.get(MenuItem, menu_item_id)
        if not menu_item:
            abort(404, f"MenuItem {menu_item_id} not found")

        display_station = menu_item.station_rel.name if menu_item.station_rel else "Unknown"
        prep_tag = generate_kitchen_tag() if is_kitchen_station(display_station) else None

        quantity = int(payload.get("quantity", 1))
        notes = payload.get("notes")

        oi = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=quantity,
            price=menu_item.price,
            notes=notes,
            station=display_station,
            prep_tag=prep_tag,
            status="pending",
        )
        db.session.add(oi)

    recalc_order_total(order)
    db.session.commit()
    return jsonify(order_to_dict(order)), 201

# ---------------- OrderItems: Update one item ----------------
@orders_bp.route("/<int:order_id>/items/<int:item_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "kitchen", "bar", "butcher")
def update_order_item(order_id, item_id):
    order_item = db.session.get(OrderItem, item_id)
    if not order_item or order_item.order_id != order_id:
        abort(404, "Order item not found")

    data = request.get_json() or {}

    # Update fields
    if "quantity" in data:
        order_item.quantity = int(data["quantity"])
    if "notes" in data:
        order_item.notes = data["notes"]
    if "status" in data:
        if data["status"] not in {"pending", "ready"}:
            abort(400, "Invalid item status. Allowed: pending, ready.")
        order_item.status = data["status"]

    # Recalc parent order total if quantity changed
    order = db.session.get(Order, order_id)
    recalc_order_total(order)

    db.session.commit()
    return jsonify(order_to_dict(order)), 200

# ---------------- OrderItems: Delete one item ----------------
@orders_bp.route("/<int:order_id>/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def delete_order_item(order_id, item_id):
    order_item = db.session.get(OrderItem, item_id)
    if not order_item or order_item.order_id != order_id:
        abort(404, "Order item not found")

    order = db.session.get(Order, order_id)
    db.session.delete(order_item)
    db.session.flush()

    recalc_order_total(order)
    db.session.commit()
    return jsonify(order_to_dict(order)), 200
