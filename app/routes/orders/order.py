from decimal import Decimal
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app.extensions import db
from app.models.models import Order, OrderItem, MenuItem, Table, User, Station, PrintJob
from app.utils.decorators import roles_required, extract_roles_from_claims
from app.routes.orders.kitchen_tag import generate_kitchen_tag, should_generate_kitchen_tag
from collections import defaultdict
import logging
from app.routes.print.print_jobs import create_station_print_jobs, create_cashier_print_job 
from sqlalchemy.exc import IntegrityError
from app.services.inventory_integration import send_inventory_adjustment_or_queue
from app.services.waiter_profiles import waiter_allowed_station_ids, waiter_can_access_table
from app.utils.timezone import get_eat_today, eat_now_naive
from app.services.cloud_sync import _upsert_outbox_event, _timestamp_suffix, queue_cloud_sync_upsert


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
        raise ValueError("Invalid token identity.")


def jwt_roles(claims=None):
    if claims is None:
        claims = get_jwt()
    return extract_roles_from_claims(claims)

def error_response(message: str, status_code: int):
    return jsonify({"error": message}), status_code


def _current_waiter_or_none(user_id: int, roles: set[str]) -> User | None:
    if "waiter" not in roles:
        return None
    return db.session.get(User, user_id)


def _ensure_waiter_can_access_table(waiter: User | None, table: Table):
    if not waiter:
        return None
    if not waiter_can_access_table(waiter, table):
        return error_response("You are not allowed to access this table.", 403)
    return None


def _waiter_accessible_table_ids(waiter: User | None) -> set[int]:
    if not waiter:
        return set()
    return {table.id for table in waiter.tables if waiter_can_access_table(waiter, table)}


def _ensure_waiter_can_order_station(waiter: User | None, menu_item: MenuItem):
    if not waiter:
        return None
    if not waiter.waiter_profile:
        return None
    allowed_station_ids = waiter_allowed_station_ids(waiter)
    if not allowed_station_ids or menu_item.station_id not in allowed_station_ids:
        return error_response(
            f"You are not allowed to order items from station '{menu_item.station_rel.name}'.",
            403,
        )
    return None


def _is_waiter_closed_for_day(waiter: User | None) -> bool:
    if not waiter:
        return False
    return waiter.waiter_day_closed_on == get_eat_today()


def _ensure_waiter_shift_open(waiter: User | None):
    if _is_waiter_closed_for_day(waiter):
        return error_response("Your shift is closed for today. You cannot open or modify orders until next day.", 403)
    return None

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
    Returns order dict with aggregated items by menu_item_id, 
    separated into active and voided for frontend highlighting
    """
    table = db.session.get(Table, order.table_id)

    active_items = {}
    voided_items = {}

    for item in order.items:
        target_dict = voided_items if item.status == "void" else active_items
        key = item.menu_item_id
        if key not in target_dict:
            target_dict[key] = {
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
        agg = target_dict[key]
        agg["quantity"] += float(item.quantity)
        if item.notes:
            agg["notes"].append(item.notes)
        if item.status:
            agg["status"].add(item.status)
        if item.prep_tag:
            agg["prep_tag"].add(item.prep_tag)

    # Convert sets to list / join notes
    def finalize(items_dict):
        for agg in items_dict.values():
            agg["status"] = list(agg["status"])
            agg["prep_tag"] = list(agg["prep_tag"])
            agg["notes"] = "; ".join(agg["notes"]) if agg["notes"] else None
        return list(items_dict.values())

    return {
        "id": order.id,
        "table_id": order.table_id,
        "table": {
            "id": order.table.id,
            "number": order.table.number,
            "is_vip": order.table.is_vip,
        },
        "user_id": order.user_id,
        "user": {
            "id": order.user.id if order.user else None,
            "username": order.user.username if order.user else None,
            "role": order.user.role if order.user else None
        },
        "status": order.status,
        "total_amount": float(order.total_amount) if order.total_amount else 0.0,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
        "active_items": finalize(active_items),
        "voided_items": finalize(voided_items),
    }


# def recalc_order_total(order: Order) -> None:
#     total = Decimal("0.00")
#     table = db.session.get(Table, order.table_id)
#     for i in order.items:
#         price = i.vip_price if table.is_vip and i.vip_price is not None else i.price
#         if price is None:
#             continue
#         total += Decimal(price) * Decimal(i.quantity)
#     order.total_amount = total
# from decimal import Decimal

def recalc_order_total(order: Order) -> None:
    """Recalculate the total amount of an order, excluding voided items."""
    total = Decimal("0.00")
    table = db.session.get(Table, order.table_id)
    for i in order.items:
        # 🚫 Skip voided items
        if i.status == "void":
            continue
        # Choose VIP or regular price
        price = i.vip_price if table.is_vip and i.vip_price is not None else i.price
        if price is None:
            continue
        total += Decimal(price) * Decimal(i.quantity)
    order.total_amount = total
    db.session.flush()  # ensure it's updated in the current session

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

    # Lock the table row to prevent race conditions
    try:
        table = db.session.query(Table).filter(Table.id == table_id).with_for_update().one_or_none()
    except Exception as e:
        return error_response(f"Database error locking table: {str(e)}", 500)

    if not table:
        return error_response(f"Table {table_id} not found.", 404)

    # 🚨 Prevent duplicate open orders
    existing_order = (
        db.session.query(Order)
        .filter(Order.table_id == table_id, Order.status == "open")
        .first()
    )
    if existing_order:
        return error_response(f"Table {table.number} already has an active order.", 409)

    try:
        user_id = safe_int_identity()
    except ValueError:
        return error_response("Invalid token identity.", 401)

    roles = jwt_roles()
    waiter = _current_waiter_or_none(user_id, roles)
    shift_error = _ensure_waiter_shift_open(waiter)
    if shift_error:
        return shift_error
    table_error = _ensure_waiter_can_access_table(waiter, table)
    if table_error:
        return table_error

    # Mark the table as occupied immediately
    table.status = "occupied"

    # Create the order
    order = Order(table_id=table_id, user_id=user_id, status="open", total_amount=Decimal("0.00"))
    db.session.add(order)
    db.session.flush()

    def rollback_error(message: str, status_code: int):
        db.session.rollback()
        return error_response(message, status_code)

    # Prepare menu items
    menu_item_ids = [payload.get("menu_item_id") for payload in items_data]
    menu_items = {
        mi.id: mi for mi in db.session.query(MenuItem).filter(MenuItem.id.in_(menu_item_ids)).all()
    }
    created_item_ids = []

    for payload in items_data:
        menu_item_id = payload.get("menu_item_id")
        if not isinstance(payload, dict) or not menu_item_id:
            return rollback_error("Each item must be a dictionary with a menu_item_id.", 400)

        menu_item = menu_items.get(menu_item_id)
        if not menu_item:
            return rollback_error(f"MenuItem {menu_item_id} not found.", 404)
        if not menu_item.station_rel:
            return rollback_error(f"Menu item {menu_item_id} is not assigned to a station.", 400)
        station_error = _ensure_waiter_can_order_station(waiter, menu_item)
        if station_error:
            db.session.rollback()
            return station_error

        price_to_use = (
            Decimal(str(menu_item.vip_price))
            if table.is_vip and menu_item.vip_price is not None
            else menu_item.price
        )
        category_name = menu_item.subcategory.category.name if menu_item.subcategory and menu_item.subcategory.category else ""
        subcategory_name = menu_item.subcategory.name if menu_item.subcategory else ""
        station = menu_item.station_rel.name
        if len(station) > 20:
            return rollback_error(f"Station name '{station}' exceeds 20 characters.", 400)

        if menu_item.quantity_step is not None:
            default_increment = Decimal(str(menu_item.quantity_step))
        elif menu_item.subcategory and menu_item.subcategory.category and menu_item.subcategory.category.quantity_step is not None:
            default_increment = Decimal(str(menu_item.subcategory.category.quantity_step))
        else:
            default_increment = Decimal("1.0")
        quantity_to_add = Decimal(str(payload.get("quantity", default_increment)))

        try:
            prep_tag = generate_kitchen_tag() if should_generate_kitchen_tag(menu_item) else None
        except Exception as e:
            return rollback_error(f"Failed to generate kitchen tag: {str(e)}", 500)

        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=quantity_to_add,
            price=price_to_use,
            vip_price=Decimal(str(menu_item.vip_price)) if menu_item.vip_price is not None else None,
            notes=payload.get("notes"),
            station=station,
            prep_tag=prep_tag,
            status="pending",
        )
        db.session.add(order_item)
        db.session.flush()
        created_item_ids.append(order_item.id)

    recalc_order_total(order)
    try:
        db.session.commit()
        queue_cloud_sync_upsert("order", order)
        create_station_print_jobs(order, only_new_items=True, item_ids=created_item_ids)
        logger.info(f"Created order {order.id} for table {table_id} by user {user_id}")
    except IntegrityError:
        db.session.rollback()
        return error_response("Table already has an active order (race condition).", 409)
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
    try:
        user_id = safe_int_identity()
    except ValueError:
        return error_response("Invalid token identity.", 401)

    roles = jwt_roles()
    waiter = _current_waiter_or_none(user_id, roles)
    shift_error = _ensure_waiter_shift_open(waiter)
    if shift_error:
        return shift_error
    table_error = _ensure_waiter_can_access_table(waiter, table)
    if table_error:
        return table_error

    data = request.get_json() or {}
    items_data = data.get("items", [])
    if not isinstance(items_data, list):
        return error_response("Items must be a list.", 400)

    menu_item_ids = [payload.get("menu_item_id") for payload in items_data]
    menu_items = {mi.id: mi for mi in db.session.query(MenuItem).filter(MenuItem.id.in_(menu_item_ids)).all()}
    created_item_ids = []

    def rollback_error(message: str, status_code: int):
        db.session.rollback()
        return error_response(message, status_code)

    for payload in items_data:
        menu_item_id = payload.get("menu_item_id")
        if not isinstance(payload, dict) or not menu_item_id:
            return rollback_error("Each item must be a dictionary with a menu_item_id.", 400)

        menu_item = menu_items.get(menu_item_id)
        if not menu_item:
            return rollback_error(f"MenuItem {menu_item_id} not found.", 404)
        if not menu_item.station_rel:
            return rollback_error(f"Menu item {menu_item_id} is not assigned to a station.", 400)
        station_error = _ensure_waiter_can_order_station(waiter, menu_item)
        if station_error:
            db.session.rollback()
            return station_error

        price_to_use = Decimal(str(menu_item.vip_price)) if table.is_vip and menu_item.vip_price is not None else menu_item.price
        category_name = menu_item.subcategory.category.name if menu_item.subcategory and menu_item.subcategory.category else ""
        subcategory_name = menu_item.subcategory.name if menu_item.subcategory else ""
        station = menu_item.station_rel.name
        if len(station) > 20:
            return rollback_error(f"Station name '{station}' exceeds 20 characters.", 400)

        if menu_item.quantity_step is not None:
            default_increment = Decimal(str(menu_item.quantity_step))
        elif menu_item.subcategory and menu_item.subcategory.category and menu_item.subcategory.category.quantity_step is not None:
            default_increment = Decimal(str(menu_item.subcategory.category.quantity_step))
        else:
            default_increment = Decimal("1.0")
        quantity_to_add = Decimal(str(payload.get("quantity", default_increment)))

        # Create a new OrderItem row instead of updating existing one
        try:
            prep_tag = generate_kitchen_tag() if should_generate_kitchen_tag(menu_item) else None
        except Exception as e:
            return rollback_error(f"Failed to generate kitchen tag: {str(e)}", 500)
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
        db.session.flush()
        created_item_ids.append(order_item.id)

    recalc_order_total(order)
    try:
        db.session.commit()
        queue_cloud_sync_upsert("order", order)
        create_station_print_jobs(order, only_new_items=True, item_ids=created_item_ids)
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

    try:
        user_id = safe_int_identity()
    except ValueError:
        return error_response("Invalid token identity.", 401)

    table = db.session.get(Table, order.table_id)
    waiter = _current_waiter_or_none(user_id, jwt_roles())
    table_error = _ensure_waiter_can_access_table(waiter, table)
    if table_error:
        return table_error

    data = request.get_json() or {}
    status = data.get("status")
    if status not in {"open", "closed", "paid"}:
        return error_response("Invalid status. Allowed: open, closed, paid.", 400)
    if status == "open":
        shift_error = _ensure_waiter_shift_open(waiter)
        if shift_error:
            return shift_error

    order.status = status
    # Keep table occupancy in sync with order lifecycle.
    if status == "open":
        table.status = "occupied"
    elif status in {"closed", "paid"}:
        table.status = "available"

    try:
        db.session.commit()
        queue_cloud_sync_upsert("order", order)
        logger.info(f"Updated order {order_id} status to {status} by user {user_id}")

    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)
    return jsonify(order_to_dict(order)), 200

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
    roles = jwt_roles(jwt_data)

    if "waiter" in roles:
        try:
            user_id = safe_int_identity()
        except ValueError:
            return error_response("Invalid token identity.", 401)
        waiter = db.session.get(User, user_id)
        allowed_table_ids = _waiter_accessible_table_ids(waiter)
        if not allowed_table_ids:
            return jsonify([]), 200
        query = query.filter(Order.table_id.in_(allowed_table_ids))

    orders = query.order_by(Order.created_at.desc()).all()

    # ---------------- Station restriction ----------------
    if "station" in roles:
        station_name = jwt_data.get("station_name")
        if not station_name:
            return error_response("Missing station_name claim.", 401)
        # keep only items from this station
        filtered_orders = []
        for order in orders:
            station_items = [i for i in order.items if i.station == station_name]
            if station_items:  # only include orders that have at least one item for this station
                o = order_to_dict(order)
                o["items"] = [order_item_to_dict(i) for i in station_items]
                filtered_orders.append(o)
        return jsonify(filtered_orders), 200

    return jsonify([order_to_dict(o) for o in orders]), 200

# ---------------- Orders: Get Single ----------------
@orders_bp.route("/<int:order_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier", "station")
def get_order(order_id):
    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)

    jwt_data = get_jwt()
    roles = jwt_roles(jwt_data)

    if "waiter" in roles:
        try:
            user_id = safe_int_identity()
        except ValueError:
            return error_response("Invalid token identity.", 401)
        waiter = db.session.get(User, user_id)
        table_error = _ensure_waiter_can_access_table(waiter, order.table)
        if table_error:
            return table_error

    if "station" in roles:
        station_name = jwt_data.get("station_name")
        if not station_name:
            return error_response("Missing station_name claim.", 401)
        station_items = [i for i in order.items if i.station == station_name]
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
    try:
        user_id = safe_int_identity()
    except ValueError:
        return error_response("Invalid token identity.", 401)
    jwt_data = get_jwt()
    roles = jwt_roles(jwt_data)

    # ---------------- Waiter restriction ----------------
    waiter = _current_waiter_or_none(user_id, roles)
    table = db.session.get(Table, order.table_id)
    table_error = _ensure_waiter_can_access_table(waiter, table)
    if table_error:
        return table_error

    # ---------------- Station restriction ----------------
    if "station" in roles:
        station_name = jwt_data.get("station_name")
        if not station_name:
            return error_response("Missing station_name claim.", 401)
        if order_item.station != station_name:
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

# ---------------- Deduct or revert stock ----------------
    if "status" in data:
        if data["status"] not in {"pending", "ready", "void"}:
            return error_response("Invalid item status. Allowed: pending, ready, void.", 400)
        
        prev_status = order_item.status
        order_item.status = data["status"]

        # ---------------- Deduct stock if status changed to ready ---------------- #
        if prev_status != "ready" and data["status"] == "ready":
                send_inventory_adjustment_or_queue(
                    station_name=order_item.station,
                    menu_item_id=order_item.menu_item_id,
                    quantity=float(order_item.quantity),
                )
            # Revert inventory if moving from ready to void
        elif prev_status == "ready" and data["status"] == "void":
                send_inventory_adjustment_or_queue(
                    station_name=order_item.station,
                    menu_item_id=order_item.menu_item_id,
                    quantity=float(order_item.quantity),
                    reverse=True,
                )
            # Optional: handle unvoid back to ready
        elif prev_status == "void" and data["status"] == "ready":
                send_inventory_adjustment_or_queue(
                    station_name=order_item.station,
                    menu_item_id=order_item.menu_item_id,
                    quantity=float(order_item.quantity),
                )
                
    # ---------------- Commit ----------------
    recalc_order_total(order)
    try:
        db.session.commit()
        queue_cloud_sync_upsert("order", order)
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

    try:
        user_id = safe_int_identity()
    except ValueError:
        return error_response("Invalid token identity.", 401)
    try:
        event_id = f"order-{order_id}-delete-{_timestamp_suffix(eat_now_naive())}"
        payload = {"id": order_id, "order_id": order_id}
        _upsert_outbox_event(event_id, "order", str(order_id), "delete", payload)
        OrderItem.query.filter_by(order_id=order_id).delete(synchronize_session=False)
        PrintJob.query.filter_by(order_id=order_id).delete(synchronize_session=False)
        db.session.delete(order)
        db.session.commit()
        logger.info(f"Deleted order {order_id} by user {user_id}")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)
    return jsonify({"message": "Order deleted"}), 200

# ---------------- OrderItems: Delete(void) one item ----------------
@orders_bp.route("/<int:order_id>/items/<int:item_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def void_order_item(order_id, item_id):
    order_item = db.session.get(OrderItem, item_id)
    if not order_item or order_item.order_id != order_id:
        return error_response("Order item not found.", 404)

    order = db.session.get(Order, order_id)
    try:
        user_id = safe_int_identity()
    except ValueError:
        return error_response("Invalid token identity.", 401)

    table = db.session.get(Table, order.table_id)
    waiter = _current_waiter_or_none(user_id, jwt_roles())
    table_error = _ensure_waiter_can_access_table(waiter, table)
    if table_error:
        return table_error

    try:
        prev_status = order_item.status
        order_item.status = "void"

        # Adjust inventory if item was previously ready
        if prev_status == "ready":
            send_inventory_adjustment_or_queue(
                station_name=order_item.station,
                menu_item_id=order_item.menu_item_id,
                quantity=float(order_item.quantity),
                reverse=True,  # return stock
            )

        # Recalculate order total (excluding voided)
        recalc_order_total(order)

        db.session.commit()
        queue_cloud_sync_upsert("order", order)
        logger.info(f"Voided order item {item_id} from order {order_id} by user {user_id}")
    except Exception as e:
        db.session.rollback()
        return error_response(f"Database error: {str(e)}", 500)

    return jsonify(order_to_dict(order)), 200

# ------------------- OrderItems: unvoid ----------------------

@orders_bp.route("/<int:order_id>/items/<int:item_id>/unvoid", methods=["PATCH"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def unvoid_order_item(order_id, item_id):
    item = OrderItem.query.filter_by(order_id=order_id, id=item_id).first()
    if not item:
        return error_response("Item not found", 404)

    order = db.session.get(Order, order_id)
    if not order:
        return error_response("Order not found.", 404)

    # Waiter restriction: can only modify items on assigned tables
    try:
        user_id = safe_int_identity()
    except ValueError:
        return error_response("Invalid token identity.", 401)

    table = db.session.get(Table, order.table_id)
    waiter = _current_waiter_or_none(user_id, jwt_roles())
    table_error = _ensure_waiter_can_access_table(waiter, table)
    if table_error:
        return table_error

    prev_status = item.status
    item.status = "ready"  # default back to ready

    # Adjust inventory if previously voided
    if prev_status == "void":
        send_inventory_adjustment_or_queue(
            station_name=item.station,
            menu_item_id=item.menu_item_id,
            quantity=float(item.quantity),  # deduct stock
        )

    # Keep order totals in sync after status changes.
    recalc_order_total(order)
    db.session.commit()
    queue_cloud_sync_upsert("order", order)
    logger.info(f"Unvoided order item {item.id} in order {order_id}")
    return jsonify(order_to_dict(order)), 200
