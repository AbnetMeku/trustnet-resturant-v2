from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app.extensions import db
from app.models.models import Order, OrderItem, User
from app.routes.orders.order import order_to_dict, error_response
from app.utils.decorators import roles_required
from datetime import datetime

order_history_bp = Blueprint("order_history_bp", __name__, url_prefix="/order-history")

# ---------------------- GET /order-history ---------------------- #
@order_history_bp.route("/", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def get_order_history():
    query = Order.query

    date_str = request.args.get("date")
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d").date()
            query = query.filter(db.func.date(Order.created_at) == day)
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD.", 400)

    status = request.args.get("status")
    if status:
        if status not in {"open", "closed", "paid"}:
            return error_response("Invalid status filter.", 400)
        query = query.filter(Order.status == status)

    user_id = request.args.get("user_id")
    if user_id:
        try:
            query = query.filter(Order.user_id == int(user_id))
        except ValueError:
            return error_response("Invalid user_id.", 400)

    jwt_data = get_jwt()
    roles = jwt_data.get("roles", [])
    if "waiter" in roles:
        query = query.filter(Order.user_id == int(jwt_data["sub"]))

    orders = query.order_by(Order.created_at.desc()).all()
    return jsonify([order_to_dict(o) for o in orders]), 200


# ---------------------- GET /order-history/summary ---------------------- #
@order_history_bp.route("/summary", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def get_order_summary():
    query = Order.query

    date_str = request.args.get("date")
    if not date_str:
        return error_response("date query param is required", 400)

    try:
        day = datetime.strptime(date_str, "%Y-%m-%d").date()
        query = query.filter(db.func.date(Order.created_at) == day)
    except ValueError:
        return error_response("Invalid date format. Use YYYY-MM-DD.", 400)

    status = request.args.get("status")
    if status:
        query = query.filter(Order.status == status)

    user_id = request.args.get("user_id")
    if user_id:
        query = query.filter(Order.user_id == int(user_id))

    jwt_data = get_jwt()
    roles = jwt_data.get("roles", [])
    if "waiter" in roles:
        query = query.filter(Order.user_id == int(jwt_data["sub"]))

    orders = query.all()

    paid_amount = 0.0
    pending_amount = 0.0
    total_items = 0.0
    item_map = {}
    voided_items_map = {}

    waiter_map = {}

    for order in orders:
        # Calculate totals for paid/pending orders (exclude voided items)
        order_total = 0.0
        for item in order.items:
            qty = float(item.quantity or 0)
            price = float(item.price or 0.0)

            if item.status == "void":
                # Track voided items separately
                voided_items_map[item.menu_item.name] = voided_items_map.get(item.menu_item.name, 0) + qty
                continue  # Skip voided items from totals

            order_total += price * qty

            # Accumulate item quantities
            item_map[item.menu_item.name] = item_map.get(item.menu_item.name, 0) + qty
            total_items += qty

        # Totals per order
        if order.status == "paid":
            paid_amount += order_total
        else:
            pending_amount += order_total

        # Waiter aggregation
        if order.user:
            waiter_id = order.user.id
            if waiter_id not in waiter_map:
                waiter_map[waiter_id] = {
                    "waiterId": waiter_id,
                    "waiterName": order.user.username or f"User {waiter_id}",
                    "orders": 0,
                    "paidAmount": 0.0,
                    "pendingAmount": 0.0,
                    "totalItems": 0.0,
                }

            waiter_map[waiter_id]["orders"] += 1
            if order.status == "paid":
                waiter_map[waiter_id]["paidAmount"] += order_total
            else:
                waiter_map[waiter_id]["pendingAmount"] += order_total

            # Waiter item totals (exclude voided)
            for item in order.items:
                if item.status != "void":
                    waiter_map[waiter_id]["totalItems"] += float(item.quantity or 0)

    # Build summaries
    daily_items_summary = [{"name": name, "quantity": qty} for name, qty in item_map.items()]
    daily_voided_items_summary = [{"name": name, "quantity": qty} for name, qty in voided_items_map.items()]
    waiter_summary = list(waiter_map.values())

    summary = {
        "totalOrders": len(orders),
        "paidAmount": round(paid_amount, 2),
        "pendingAmount": round(pending_amount, 2),
        "totalItems": total_items,
        "dailyItemsSummary": daily_items_summary,
        "dailyVoidedItemsSummary": daily_voided_items_summary,  # ✅ new field for front end
        "waiterSummary": waiter_summary,
    }

    return jsonify(summary), 200

# ---------------------- GET /order-history/summary-range ---------------------- #
@order_history_bp.route("/summary-range", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def get_order_summary_range():
    """
    Aggregated summary of orders between start_date and end_date (inclusive).
    Params: start_date, end_date (YYYY-MM-DD), user_id (optional)
    """
    query = Order.query

    # --- Parse dates ---
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")

    if not start_date_str or not end_date_str:
        return error_response("start_date and end_date query params are required", 400)

    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        query = query.filter(db.func.date(Order.created_at) >= start_date)
        query = query.filter(db.func.date(Order.created_at) <= end_date)
    except ValueError:
        return error_response("Invalid date format. Use YYYY-MM-DD.", 400)

    # --- Optional filters ---
    user_id = request.args.get("user_id")
    if user_id:
        query = query.filter(Order.user_id == int(user_id))

    jwt_data = get_jwt()
    roles = jwt_data.get("roles", [])
    if "waiter" in roles:
        query = query.filter(Order.user_id == int(jwt_data["sub"]))

    orders = query.all()

    # --- Initialize accumulators ---
    total_items = 0
    total_orders = len(orders)
    open_amount = 0.0
    closed_amount = 0.0
    paid_amount = 0.0
    item_map = {}
    waiter_map = {}

    # --- Process orders ---
    for order in orders:
        order_total = float(order.total_amount or 0)

        # Track amounts per status
        if order.status == "paid":
            paid_amount += order_total
        elif order.status == "closed":
            closed_amount += order_total
        elif order.status == "open":
            open_amount += order_total

        # Accumulate items
        for item in order.items:
            qty = float(item.quantity or 0)
            total_items += qty
            item_name = item.menu_item.name
            item_map[item_name] = item_map.get(item_name, 0) + qty

        # Accumulate per waiter
        if order.user:
            waiter_id = order.user.id
            if waiter_id not in waiter_map:
                waiter_map[waiter_id] = {
                    "waiterId": waiter_id,
                    "waiterName": order.user.username or f"User {waiter_id}",
                    "orders": 0,
                    "openOrders": 0,
                    "closedOrders": 0,
                    "paidOrders": 0,
                    "totalItems": 0.0,
                    "openAmount": 0.0,
                    "closedAmount": 0.0,
                    "paidAmount": 0.0,
                }

            waiter_map[waiter_id]["orders"] += 1
            if order.status == "paid":
                waiter_map[waiter_id]["paidOrders"] += 1
                waiter_map[waiter_id]["paidAmount"] += order_total
            elif order.status == "closed":
                waiter_map[waiter_id]["closedOrders"] += 1
                waiter_map[waiter_id]["closedAmount"] += order_total
            elif order.status == "open":
                waiter_map[waiter_id]["openOrders"] += 1
                waiter_map[waiter_id]["openAmount"] += order_total

            for item in order.items:
                waiter_map[waiter_id]["totalItems"] += float(item.quantity or 0)

    # --- Build summaries ---
    daily_items_summary = [{"name": name, "quantity": qty} for name, qty in item_map.items()]
    waiter_summary = list(waiter_map.values())

    summary = {
        "totalOrders": total_orders,
        "openAmount": round(open_amount, 2),
        "closedAmount": round(closed_amount, 2),
        "paidAmount": round(paid_amount, 2),
        "totalItems": total_items,
        "dailyItemsSummary": daily_items_summary,
        "waiterSummary": waiter_summary,
    }

    return jsonify(summary), 200

# ---------------------- GET /order-history/raw ---------------------- #
@order_history_bp.route("/raw", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def get_order_history_raw():
    """
    Returns all orders with each OrderItem separately (no aggregation),
    preserving OrderItem IDs for frontend edits/deletes.
    Optional filters: date, status, user_id
    """
    query = Order.query

    # --- Date filter (required for day view) ---
    date_str = request.args.get("date")
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d").date()
            query = query.filter(db.func.date(Order.created_at) == day)
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD.", 400)
    else:
        return error_response("date query param is required", 400)

    # --- Status filter (optional) ---
    status = request.args.get("status")
    if status:
        if status not in {"open", "closed", "paid"}:
            return error_response("Invalid status filter.", 400)
        query = query.filter(Order.status == status)

    # --- User filter (optional) ---
    user_id = request.args.get("user_id")
    if user_id:
        try:
            query = query.filter(Order.user_id == int(user_id))
        except ValueError:
            return error_response("Invalid user_id.", 400)

    # --- Waiter restriction (if role is waiter) ---
    jwt_data = get_jwt()
    roles = jwt_data.get("roles", [])
    if "waiter" in roles:
        query = query.filter(Order.user_id == int(jwt_data["sub"]))

    # --- Fetch orders ---
    orders = query.order_by(Order.created_at.desc()).all()

    # --- Serialize orders without aggregating items ---
    def order_to_dict_raw(order: Order):
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
                "role": order.user.role if order.user else None,
            },
            "status": order.status,
            "total_amount": float(order.total_amount or 0.0),
            "created_at": order.created_at.isoformat(),
            "updated_at": order.updated_at.isoformat(),
            "items": [
                {
                    "id": item.id,
                    "name": item.menu_item.name if item.menu_item else None,
                    "quantity": float(item.quantity or 0),
                    "price": float(item.price or 0.0),
                    "status": item.status,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "prep_tag": item.prep_tag,
                }
                for item in order.items
            ],
        }

    return jsonify([order_to_dict_raw(o) for o in orders]), 200
