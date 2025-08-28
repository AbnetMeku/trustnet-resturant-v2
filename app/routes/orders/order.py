from decimal import Decimal
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app.extensions import db
from app.models.models import Order, OrderItem, MenuItem, Table, User, Station, PrintJob
from app.utils.decorators import roles_required
from app.routes.orders.kitchen_tag import generate_kitchen_tag
from collections import defaultdict
import logging

orders_bp = Blueprint("orders_bp", __name__, url_prefix="/orders")

# ---------------- Logging Setup ----------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------- Utilities ----------------
def safe_int_identity() -> int:
    ident = get_jwt_identity()
    try:
        return int(ident)
    except (TypeError, ValueError):
        return error_response("Invalid token identity.", 401)

def error_response(message: str, status_code: int):
    return jsonify({"error": message}), status_code

# ---------------- Preflight ----------------
@orders_bp.route("", methods=["OPTIONS"])
@orders_bp.route("/", methods=["OPTIONS"])
@orders_bp.route("/<int:order_id>", methods=["OPTIONS"])
@orders_bp.route("/<int:order_id>/items", methods=["OPTIONS"])
@orders_bp.route("/<int:order_id>/items/<int:item_id>", methods=["OPTIONS"])
def orders_options(order_id=None, item_id=None):
    return jsonify({"status": "ok"}), 200

# ---------------- Serializers ----------------
def order_item_to_dict(item: OrderItem):
    return {
        "id": item.id,
        "menu_item_id": item.menu_item_id,
        "name": item.menu_item.name if item.menu_item else None,
        "quantity": float(item.quantity),
        "price": float(item.price) if item.price is not None else 0.0,
        "vip_price": float(item.vip_price) if item.vip_price is not None else None,
        "notes": item.notes,
        "station": item.station,
        "status": item.status,
        "prep_tag": item.prep_tag,
    }

def order_to_dict(order: Order):
    """
    Returns order dict with aggregated items by menu_item_id
    """
    aggregated_items = {}
    table = db.session.get(Table, order.table_id)
    for item in order.items:
        key = item.menu_item_id
        if key not in aggregated_items:
            aggregated_items[key] = {
                "id": item.id,
                "menu_item_id": item.menu_item_id,
                "name": item.menu_item.name if item.menu_item else None,
                "quantity": 0,
                "price": float(item.price) if item.price is not None else 0.0,
                "vip_price": float(item.vip_price) if item.vip_price is not None else None,
                "notes": [],
                "station": item.station,
                "status": set(),
                "prep_tag": set(),
            }
        agg = aggregated_items[key]
        agg["quantity"] += float(item.quantity)
        if item.notes:
            agg["notes"].append(item.notes)
        if item.status:
            agg["status"].add(item.status)
        if item.prep_tag:
            agg["prep_tag"].add(item.prep_tag)

    # Convert sets to list or comma-separated strings
    for agg in aggregated_items.values():
        agg["status"] = list(agg["status"])
        agg["prep_tag"] = list(agg["prep_tag"])
        agg["notes"] = "; ".join(agg["notes"]) if agg["notes"] else None

    return {
        "id": order.id,
        "table_id": order.table_id,
        "table": {
            "id": order.table.id,
            "number": order.table.number,
            "is_vip": order.table.is_vip,
        },
        "user_id": order.user_id,
        "status": order.status,
        "total_amount": float(order.total_amount) if order.total_amount else 0.0,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
        "items": list(aggregated_items.values()),
    }


def recalc_order_total(order: Order) -> None:
    total = Decimal("0.00")
    table = db.session.get(Table, order.table_id)
    for i in order.items:
        price = i.vip_price if table.is_vip and i.vip_price is not None else i.price
        if price is None:
            continue
        total += Decimal(price) * Decimal(i.quantity)
    order.total_amount = total

# ---------------- Print Job Utilities ----------------
def group_items_by_station_id(items):
    grouped = defaultdict(list)
    for item in items:
        station_id = item.menu_item.station_id if item.menu_item else None
        if station_id is not None:
            grouped[station_id].append(item)
    return dict(grouped)

def create_print_jobs(order: Order, only_new_items=False):
    items = [
    item for item in order.items
    if ( (item.status == "pending" and (item.quantity - item.printed_quantity) > 0) if only_new_items else True )
]


    """
    Creates print jobs per station.
    If only_new_items=True, only includes items with status "pending".
    """
    

    # items = [i for i in order.items if (i.status == "pending" if only_new_items else True)]
    grouped = group_items_by_station_id(items)
    for station_id, items_group in grouped.items():
        job_data = {
            "order_id": order.id,
            "station_id": station_id,
            "items_data": [order_item_to_dict(i) for i in items_group],
            "status": "pending",
        }
        print_job = PrintJob(**job_data)
        db.session.add(print_job)
    db.session.commit()
    logger.info(f"Created print jobs for order {order.id}")

def create_cashier_print_job(order: Order):
    """
    Creates a print job for the cashier with full order summary.
    """
    items_data = [order_item_to_dict(i) for i in order.items]
    cashier_station = db.session.query(Station).filter_by(name="Cashier").first()
    if not cashier_station:
        logger.warning("No Cashier station found, skipping cashier print job.")
        return
    print_job = PrintJob(
        order_id=order.id,
        station_id=cashier_station.id,
        items_data=items_data,
        status="pending"
    )
    db.session.add(print_job)
    db.session.commit()
    logger.info(f"Created cashier print job for order {order.id}")
# ---------------- Orders: Create ----------------
@orders_bp.route("/", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def create_order():
    data = request.get_json() or {}
    table_id = data.get("table_id")
    items_data = data.get("items", [])

    if not table_id or not isinstance(items_data, list):
        return error_response("Table ID and items (as a list) are required.", 400)

    table = db.session.get(Table, table_id)
    if not table:
        return error_response(f"Table {table_id} not found.", 404)

    user_id = safe_int_identity()
    if "waiter" in get_jwt().get("roles", []):
        user = db.session.get(User, user_id)
        if table not in user.tables:
            return error_response("You are not assigned to this table.", 403)

    order = Order(table_id=table_id, user_id=user_id, status="open", total_amount=Decimal("0.00"))
    db.session.add(order)
    db.session.flush()

    menu_item_ids = [payload.get("menu_item_id") for payload in items_data]
    menu_items = {mi.id: mi for mi in db.session.query(MenuItem).filter(MenuItem.id.in_(menu_item_ids)).all()}

    for payload in items_data:
        menu_item_id = payload.get("menu_item_id")
        if not isinstance(payload, dict) or not menu_item_id:
            return error_response("Each item must be a dictionary with a menu_item_id.", 400)

        menu_item = menu_items.get(menu_item_id)
        if not menu_item:
            return error_response(f"MenuItem {menu_item_id} not found.", 404)
        if not menu_item.station_rel:
            return error_response(f"Menu item {menu_item_id} is not assigned to a station.", 400)

        price_to_use = Decimal(str(menu_item.vip_price)) if table.is_vip and menu_item.vip_price is not None else menu_item.price
        category_name = menu_item.subcategory.category.name if menu_item.subcategory and menu_item.subcategory.category else ""
        subcategory_name = menu_item.subcategory.name if menu_item.subcategory else ""
        station = menu_item.station_rel.name
        if len(station) > 20:
            return error_response(f"Station name '{station}' exceeds 20 characters.", 400)

        default_increment = Decimal("0.5") if category_name.lower() == "alcohol" or subcategory_name.lower() == "butchery" else Decimal("1.0")
        quantity_to_add = Decimal(str(payload.get("quantity", default_increment)))

        # Always create a new OrderItem row here   
        try:
            prep_tag = generate_kitchen_tag() if category_name.lower() == "food" else None
        except Exception as e:
            return error_response(f"Failed to generate kitchen tag: {str(e)}", 500)
        status = "pending"
        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=quantity_to_add,
            price=price_to_use,
            vip_price=Decimal(str(menu_item.vip_price)) if menu_item.vip_price is not None else None,
            notes=payload.get("notes"),
            station=station,
            prep_tag=prep_tag,
            status=status,
        )
        db.session.add(order_item)

    recalc_order_total(order)
    try:
        db.session.commit()
        create_print_jobs(order)  # enqueue print jobs per station
        logger.info(f"Created order {order.id} for table {table_id} by user {user_id}")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)
    return jsonify(order_to_dict(order)), 201


# ---------------- OrderItems: Add to existing order ----------------
@orders_bp.route("/<int:order_id>/items", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def add_order_item(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)

    table = db.session.get(Table, order.table_id)
    user_id = safe_int_identity()
    if "waiter" in get_jwt().get("roles", []):
        user = db.session.get(User, user_id)
        if table not in user.tables:
            return error_response("You are not assigned to this table.", 403)

    data = request.get_json() or {}
    items_data = data.get("items", [])
    if not isinstance(items_data, list):
        return error_response("Items must be a list.", 400)

    menu_item_ids = [payload.get("menu_item_id") for payload in items_data]
    menu_items = {mi.id: mi for mi in db.session.query(MenuItem).filter(MenuItem.id.in_(menu_item_ids)).all()}

    for payload in items_data:
        menu_item_id = payload.get("menu_item_id")
        if not isinstance(payload, dict) or not menu_item_id:
            return error_response("Each item must be a dictionary with a menu_item_id.", 400)

        menu_item = menu_items.get(menu_item_id)
        if not menu_item:
            return error_response(f"MenuItem {menu_item_id} not found.", 404)
        if not menu_item.station_rel:
            return error_response(f"Menu item {menu_item_id} is not assigned to a station.", 400)

        price_to_use = Decimal(str(menu_item.vip_price)) if table.is_vip and menu_item.vip_price is not None else menu_item.price
        category_name = menu_item.subcategory.category.name if menu_item.subcategory and menu_item.subcategory.category else ""
        subcategory_name = menu_item.subcategory.name if menu_item.subcategory else ""
        station = menu_item.station_rel.name
        if len(station) > 20:
            return error_response(f"Station name '{station}' exceeds 20 characters.", 400)

        default_increment = Decimal("0.5") if category_name.lower() == "alcohol" or subcategory_name.lower() == "butchery" else Decimal("1.0")
        quantity_to_add = Decimal(str(payload.get("quantity", default_increment)))

        # Create a new OrderItem row instead of updating existing one
        try:
            prep_tag = generate_kitchen_tag() if category_name.lower() == "food" else None
        except Exception as e:
            return error_response(f"Failed to generate kitchen tag: {str(e)}", 500)
        status = "pending"
        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=quantity_to_add,
            price=price_to_use,
            vip_price=Decimal(str(menu_item.vip_price)) if menu_item.vip_price is not None else None,
            notes=payload.get("notes"),
            station=station,
            prep_tag=prep_tag,
            status=status,
        )
        db.session.add(order_item)

    recalc_order_total(order)
    try:
        db.session.commit()
        create_print_jobs(order, only_new_items=True)  # enqueue print jobs per station for new items only
        logger.info(f"Added items to order {order.id} by user {user_id}")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)
    return jsonify(order_to_dict(order)), 201

# ---------------- Orders: Update status ----------------
@orders_bp.route("/<int:order_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def update_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)

    user_id = safe_int_identity()
    if "waiter" in get_jwt().get("roles", []):
        user = db.session.get(User, user_id)
        table = db.session.get(Table, order.table_id)
        if table not in user.tables:
            return error_response("You are not assigned to this table.", 403)

    data = request.get_json() or {}
    status = data.get("status")
    if status not in {"open", "closed", "paid"}:
        return error_response("Invalid status. Allowed: open, closed, paid.", 400)

    order.status = status
    try:
        db.session.commit()
        logger.info(f"Updated order {order_id} status to {status} by user {user_id}")

        if status == "closed":
            create_cashier_print_job(order)  # enqueue cashier print job

    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)
    return jsonify(order_to_dict(order)), 200

# ---------------- Orders: List ----------------
# ---------------- Orders: List ----------------
@orders_bp.route("/", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier", "station")
def list_orders():
    query = Order.query
    table_id = request.args.get("table_id")
    status = request.args.get("status")

    if table_id:
        try:
            query = query.filter_by(table_id=int(table_id))
        except ValueError:
            return error_response("Invalid table_id.", 400)

    if status:
        query = query.filter_by(status=status)

    jwt_data = get_jwt()
    roles = jwt_data.get("roles", [])

    orders = query.order_by(Order.created_at.desc()).all()

    # ---------------- Station restriction ----------------
    if "station" in roles:
        station_id = jwt_data.get("station_id")
        # keep only items from this station
        filtered_orders = []
        for order in orders:
            station_items = [i for i in order.items if i.station_id == station_id]
            if station_items:  # only include orders that have at least one item for this station
                o = order_to_dict(order)
                o["items"] = [order_item_to_dict(i) for i in station_items]
                filtered_orders.append(o)
        return jsonify(filtered_orders), 200

    return jsonify([order_to_dict(o) for o in orders]), 200


# ---------------- Orders: Get Single ----------------
# ---------------- Orders: Get Single ----------------
@orders_bp.route("/<int:order_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier", "station")
def get_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)

    jwt_data = get_jwt()
    roles = jwt_data.get("roles", [])

    if "station" in roles:
        station_id = jwt_data.get("station_id")
        station_items = [i for i in order.items if i.station_id == station_id]
        if not station_items:
            return error_response("No items for this station in this order.", 403)
        o = order_to_dict(order)
        o["items"] = [order_item_to_dict(i) for i in station_items]
        return jsonify(o), 200

    return jsonify(order_to_dict(order)), 200


# ---------------- OrderItems: Update one item ----------------
@orders_bp.route("/<int:order_id>/items/<int:item_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "station")
def update_order_item(order_id, item_id):
    order_item = db.session.get(OrderItem, item_id)
    if not order_item or order_item.order_id != order_id:
        return error_response("Order item not found.", 404)

    order = db.session.get(Order, order_id)
    user_id = safe_int_identity()
    jwt_data = get_jwt()
    roles = jwt_data.get("roles", [])

    # ---------------- Waiter restriction ----------------
    if "waiter" in roles:
        user = db.session.get(User, user_id)
        table = db.session.get(Table, order.table_id)
        if table not in user.tables:
            return error_response("You are not assigned to this table.", 403)

    # ---------------- Station restriction ----------------
    if "station" in roles:
        station_id = jwt_data.get("station_id")
        if order_item.station_id != station_id:
            return error_response("Unauthorized: Not your station item.", 403)

    # ---------------- Data update ----------------
    data = request.get_json() or {}
    if "quantity" in data:
        try:
            quantity = Decimal(str(data["quantity"]))
            if quantity <= 0:
                return error_response("Quantity must be greater than zero.", 400)
            order_item.quantity = quantity
        except (TypeError, ValueError):
            return error_response("Invalid quantity value.", 400)

    if "notes" in data:
        order_item.notes = data["notes"]

    if "status" in data:
        if data["status"] not in {"pending", "ready"}:
            return error_response("Invalid item status. Allowed: pending, ready.", 400)
        order_item.status = data["status"]

    # ---------------- Commit ----------------
    recalc_order_total(order)
    try:
        db.session.commit()
        logger.info(
            f"Updated order item {item_id} in order {order_id} by user {user_id} ({roles})"
        )
    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)

    return jsonify(order_to_dict(order_item.order)), 200


# ---------------- Orders: Delete ----------------
@orders_bp.route("/<int:order_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)

    user_id = safe_int_identity()
    try:
        db.session.delete(order)
        db.session.commit()
        logger.info(f"Deleted order {order_id} by user {user_id}")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)
    return jsonify({"message": "Order deleted"}), 200

# ---------------- OrderItems: Delete one item ----------------
@orders_bp.route("/<int:order_id>/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def delete_order_item(order_id, item_id):
    order_item = db.session.get(OrderItem, item_id)
    if not order_item or order_item.order_id != order_id:
        return error_response("Order item not found.", 404)

    order = db.session.get(Order, order_id)
    user_id = safe_int_identity()
    if "waiter" in get_jwt().get("roles", []):
        user = db.session.get(User, user_id)
        table = db.session.get(Table, order.table_id)
        if table not in user.tables:
            return error_response("You are not assigned to this table.", 403)

    try:
        db.session.delete(order_item)
        db.session.flush()
        recalc_order_total(order)
        db.session.commit()
        logger.info(f"Deleted order item {item_id} from order {order_id} by user {user_id}")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)
    return jsonify(order_to_dict(order)), 200