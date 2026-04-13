from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from sqlalchemy.orm import joinedload
from sqlalchemy import delete
from app.extensions import db
from app.models.models import BrandingSettings, Order, OrderItem, PrintJob, Table, User
from app.routes.orders.order import order_to_dict, error_response
from app.utils.decorators import roles_required, extract_roles_from_claims
from datetime import datetime, timedelta
from app.utils.timezone import get_business_day_bounds, get_eat_today, eat_now_naive
from app.services.cloud_sync import _upsert_outbox_event, _timestamp_suffix

order_history_bp = Blueprint("order_history_bp", __name__, url_prefix="/order-history")


def _current_waiter_from_jwt():
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return None
    return db.session.get(User, user_id)


def _parse_history_range(start_date_str, end_date_str):
    if not start_date_str or not end_date_str:
        return None, None, error_response("start_date and end_date are required.", 400)

    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    except ValueError:
        return None, None, error_response("Invalid date format. Use YYYY-MM-DD.", 400)

    if start_date > end_date:
        return None, None, error_response("start_date cannot be after end_date.", 400)

    start_dt, _ = get_business_day_bounds(start_date)
    _, end_dt = get_business_day_bounds(end_date)
    return start_dt, end_dt, None


def _waiter_day_status(waiter: User):
    today = get_eat_today()
    open_orders_count = (
        Order.query.filter(Order.user_id == waiter.id, Order.status == "open").count()
    )
    is_closed_for_today = waiter.waiter_day_closed_on == today
    return today, open_orders_count, is_closed_for_today


def _waiter_shift_close_enabled() -> bool:
    settings = db.session.get(BrandingSettings, 1)
    return bool(settings and settings.waiter_shift_close_enabled)

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
            start_dt, end_dt = get_business_day_bounds(day)
            query = query.filter(Order.created_at >= start_dt, Order.created_at < end_dt)
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
    roles = extract_roles_from_claims(jwt_data)
    if "waiter" in roles:
        query = query.filter(Order.user_id == int(jwt_data["sub"]))

    orders = query.order_by(Order.created_at.desc()).all()
    return jsonify([order_to_dict(o) for o in orders]), 200


@order_history_bp.route("/waiter/day-close-status", methods=["GET"])
@jwt_required()
@roles_required("waiter")
def waiter_day_close_status():
    waiter = _current_waiter_from_jwt()
    if not waiter:
        return error_response("Invalid token identity.", 401)

    today, open_orders_count, is_closed_for_today = _waiter_day_status(waiter)
    allow_waiter_close = _waiter_shift_close_enabled()

    return jsonify(
        {
            "date": today.isoformat(),
            "isClosedForToday": is_closed_for_today,
            "openOrdersCount": open_orders_count,
            "canCloseForToday": (allow_waiter_close and open_orders_count == 0 and not is_closed_for_today),
            "waiterCloseEnabled": allow_waiter_close,
        }
    ), 200


@order_history_bp.route("/waiter/<int:waiter_id>/day-close-status", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def cashier_waiter_day_close_status(waiter_id):
    waiter = db.session.get(User, waiter_id)
    if not waiter or waiter.role != "waiter":
        return error_response("Waiter not found.", 404)

    today, open_orders_count, is_closed_for_today = _waiter_day_status(waiter)

    return jsonify(
        {
            "waiter_id": waiter.id,
            "date": today.isoformat(),
            "isClosedForToday": is_closed_for_today,
            "openOrdersCount": open_orders_count,
            "canCloseForToday": (open_orders_count == 0 and not is_closed_for_today),
        }
    ), 200


@order_history_bp.route("/waiter/close-day", methods=["POST"])
@jwt_required()
@roles_required("waiter")
def waiter_close_day():
    waiter = _current_waiter_from_jwt()
    if not waiter:
        return error_response("Invalid token identity.", 401)

    if not _waiter_shift_close_enabled():
        return error_response("Waiter shift closing is disabled. Please contact the cashier.", 403)

    today, open_orders_count, is_closed_for_today = _waiter_day_status(waiter)
    if is_closed_for_today:
        return jsonify(
            {
                "message": "Shift already closed for today.",
                "date": today.isoformat(),
                "isClosedForToday": True,
            }
        ), 200

    if open_orders_count > 0:
        return error_response(
            f"You still have {open_orders_count} open order(s). Close them before ending your day.",
            409,
        )

    waiter.waiter_day_closed_on = today
    db.session.commit()

    return jsonify(
        {
            "message": "Shift closed for today.",
            "date": today.isoformat(),
            "isClosedForToday": True,
        }
    ), 200


@order_history_bp.route("/waiter/<int:waiter_id>/close-day", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def cashier_close_waiter_day(waiter_id):
    waiter = db.session.get(User, waiter_id)
    if not waiter or waiter.role != "waiter":
        return error_response("Waiter not found.", 404)

    today, open_orders_count, is_closed_for_today = _waiter_day_status(waiter)
    if is_closed_for_today:
        return jsonify(
            {
                "message": "Shift already closed for today.",
                "waiter_id": waiter.id,
                "date": today.isoformat(),
                "isClosedForToday": True,
            }
        ), 200

    if open_orders_count > 0:
        return error_response(
            f"Waiter still has {open_orders_count} open order(s). Close them before ending the day.",
            409,
        )

    waiter.waiter_day_closed_on = today
    db.session.commit()

    return jsonify(
        {
            "message": "Waiter shift closed for today.",
            "waiter_id": waiter.id,
            "date": today.isoformat(),
            "isClosedForToday": True,
        }
    ), 200


@order_history_bp.route("/waiter/<int:waiter_id>/reopen-day", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def reopen_waiter_day(waiter_id):
    waiter = db.session.get(User, waiter_id)
    if not waiter or waiter.role != "waiter":
        return error_response("Waiter not found.", 404)

    target_date = get_eat_today()
    date_str = (request.get_json(silent=True) or {}).get("date")
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD.", 400)

    if waiter.waiter_day_closed_on != target_date:
        return jsonify(
            {
                "message": "Waiter shift is already open for that day.",
                "waiter_id": waiter.id,
                "date": target_date.isoformat(),
                "isClosedForToday": False,
            }
        ), 200

    waiter.waiter_day_closed_on = None
    db.session.commit()

    return jsonify(
        {
            "message": "Waiter shift reopened successfully.",
            "waiter_id": waiter.id,
            "date": target_date.isoformat(),
            "isClosedForToday": False,
        }
    ), 200


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
        start_dt, end_dt = get_business_day_bounds(day)
        query = query.filter(Order.created_at >= start_dt, Order.created_at < end_dt)
    except ValueError:
        return error_response("Invalid date format. Use YYYY-MM-DD.", 400)

    status = request.args.get("status")
    if status:
        query = query.filter(Order.status == status)

    user_id = request.args.get("user_id")
    if user_id:
        query = query.filter(Order.user_id == int(user_id))

    jwt_data = get_jwt()
    roles = extract_roles_from_claims(jwt_data)
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
        start_dt, _ = get_business_day_bounds(start_date)
        _, end_dt = get_business_day_bounds(end_date)
        query = query.filter(Order.created_at >= start_dt, Order.created_at < end_dt)
    except ValueError:
        return error_response("Invalid date format. Use YYYY-MM-DD.", 400)

    # --- Optional filters ---
    user_id = request.args.get("user_id")
    if user_id:
        query = query.filter(Order.user_id == int(user_id))

    jwt_data = get_jwt()
    roles = extract_roles_from_claims(jwt_data)
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

        # Accumulate non-voided items only (keeps summary aligned with order totals)
        for item in order.items:
            if item.status == "void":
                continue
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
                if item.status != "void":
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


@order_history_bp.route("/clear-range", methods=["DELETE"])
@jwt_required()
@roles_required("admin")
def clear_order_history_range():
    payload = request.get_json(silent=True) or {}
    start_dt, end_dt, error = _parse_history_range(
        payload.get("start_date"),
        payload.get("end_date"),
    )
    if error:
        return error

    order_ids_query = db.session.query(Order.id).filter(
        Order.created_at >= start_dt,
        Order.created_at < end_dt,
    )
    order_ids = [order_id for (order_id,) in order_ids_query.all()]

    if not order_ids:
        return (
            jsonify(
                {
                    "message": "No order history found in the selected date range.",
                    "deleted_orders": 0,
                    "deleted_order_items": 0,
                    "deleted_print_jobs": 0,
                    "start_date": payload.get("start_date"),
                    "end_date": payload.get("end_date"),
                }
            ),
            200,
        )

    for order_id in order_ids:
        event_id = f"order-{order_id}-delete-{_timestamp_suffix(eat_now_naive())}"
        payload = {"id": order_id, "order_id": order_id}
        _upsert_outbox_event(event_id, "order", str(order_id), "delete", payload)

    deleted_order_items = db.session.execute(
        delete(OrderItem).where(OrderItem.order_id.in_(order_ids))
    ).rowcount or 0
    deleted_print_jobs = db.session.execute(
        delete(PrintJob).where(PrintJob.order_id.in_(order_ids))
    ).rowcount or 0
    deleted_orders = db.session.execute(
        delete(Order).where(Order.id.in_(order_ids))
    ).rowcount or 0
    db.session.commit()

    return (
        jsonify(
            {
                "message": "Order history cleared successfully.",
                "deleted_orders": deleted_orders,
                "deleted_order_items": deleted_order_items,
                "deleted_print_jobs": deleted_print_jobs,
                "start_date": payload.get("start_date"),
                "end_date": payload.get("end_date"),
            }
        ),
        200,
    )

# ---------------------- GET /order-history/raw ---------------------- #
@order_history_bp.route("/raw", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def get_order_history_raw():
    """
    Returns all orders with each OrderItem separately (no aggregation),
    preserving OrderItem IDs for frontend edits/deletes.
    Optional filters: date, status, user_id, table
    """
    query = Order.query

    # --- Date filter (required for day view) ---
    date_str = request.args.get("date")
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d").date()
            start_dt, end_dt = get_business_day_bounds(day)
            query = query.filter(Order.created_at >= start_dt, Order.created_at < end_dt)
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

    # --- Table filter (optional partial table number match) --- #
    table_filter = request.args.get("table")
    if table_filter:
        query = query.join(Order.table).filter(Table.number.ilike(f"%{table_filter}%"))

    # --- Waiter restriction (if role is waiter) ---
    jwt_data = get_jwt()
    roles = extract_roles_from_claims(jwt_data)
    if "waiter" in roles:
        query = query.filter(Order.user_id == int(jwt_data["sub"]))

    # --- Pagination ---
    page_str = request.args.get("page", "1")
    page_size_str = request.args.get("page_size", "50")
    try:
        page = max(int(page_str), 1)
        page_size = int(page_size_str)
    except ValueError:
        return error_response("Invalid pagination params. page and page_size must be integers.", 400)

    # Guardrail for heavy daily datasets.
    page_size = min(max(page_size, 1), 200)

    # --- Fetch orders ---
    total = query.count()
    orders = (
        query.options(
            joinedload(Order.table),
            joinedload(Order.user),
            joinedload(Order.items).joinedload(OrderItem.menu_item),
        )
        .order_by(Order.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

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

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    return jsonify(
        {
            "orders": [order_to_dict_raw(o) for o in orders],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        }
    ), 200
