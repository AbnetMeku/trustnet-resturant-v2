import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app.extensions import db
from app.models.models import PrintJob, Order, Station, OrderItem
from app.services.cloud_sync import queue_cloud_sync_delete, queue_cloud_sync_upsert
from app.utils.decorators import extract_roles_from_claims
from app.utils.timezone import eat_now_naive

print_jobs_bp = Blueprint("print_jobs", __name__, url_prefix="/print-jobs")


def _safe_int_identity():
    ident = get_jwt_identity()
    try:
        return int(ident)
    except (TypeError, ValueError):
        return None


def _current_roles():
    return extract_roles_from_claims(get_jwt())


def _is_admin_or_manager(roles):
    return "admin" in roles or "manager" in roles


def _can_access_job(job: PrintJob, user_id: int, roles: set, claims: dict):
    if _is_admin_or_manager(roles):
        return True

    if "waiter" in roles:
        return job.order and job.order.user_id == user_id

    if "station" in roles:
        return job.station_id == claims.get("station_id")

    if "cashier" in roles:
        return job.type == "cashier"

    return False

# -----------------------------
# Utility: Convert order item to dict for print
# -----------------------------
def order_item_to_dict(item: OrderItem):
    """Prepare order item dict for printing."""
    return {
        "item_id": item.id,
        "name": item.menu_item.name if item.menu_item else None,
        "quantity": float(item.quantity),
        "price": float(item.price) if item.price is not None else 0.0,
        "vip_price": float(item.vip_price) if item.vip_price is not None else None,
        "notes": item.notes,
        "station": item.station,
        "status": item.status,
        "prep_tag": getattr(item, "prep_tag", None),
        "table": item.order.table.number if item.order and item.order.table else "Unknown",
        "waiter": item.order.user.username if item.order and item.order.user else "Unknown",
    }

# -----------------------------
# Create station print jobs
# -----------------------------
def create_station_print_jobs(order: Order, only_new_items=True, item_ids=None):
    stations = Station.query.all()
    item_ids = set(item_ids or [])
    created_jobs = []

    table_number = order.table.number if order.table else "Unknown"
    waiter_name = order.user.username if order.user else "Unknown"

    target_items = []
    for item in order.items:
        if item.status in {"ready", "void"}:
            continue
        if not item.menu_item:
            continue
        if only_new_items and item_ids and item.id not in item_ids:
            continue
        target_items.append(item)

    for station in stations:
        if not station.printer_identifier:
            continue

        station_items = [
            order_item_to_dict(item)
            for item in target_items
            if item.menu_item.station_id == station.id
        ]

        if not station_items:
            continue

        if (station.print_mode or "grouped") == "separate":
            for it in station_items:
                job = PrintJob(
                    order_id=order.id,
                    station_id=station.id,
                    type="station",
                    items_data={
                        "order_id": order.id,
                        "table": table_number,
                        "waiter": waiter_name,
                        "items": [it],
                    }
                )
                db.session.add(job)
                created_jobs.append(job)
        else:
            job = PrintJob(
                order_id=order.id,
                station_id=station.id,
                type="station",
                items_data={
                    "order_id": order.id,
                    "table": table_number,
                    "waiter": waiter_name,
                    "items": station_items,
                }
            )
            db.session.add(job)
            created_jobs.append(job)

    db.session.commit()
    for job in created_jobs:
        queue_cloud_sync_upsert("print_job", job)

# -----------------------------
# Mark order items as 'ready' after print
# -----------------------------
def mark_items_ready_after_print(job: PrintJob):
    for item_dict in job.items_data.get("items", []):
        item_id = item_dict.get("item_id")
        if item_id:
            order_item = OrderItem.query.get(item_id)
            if order_item:
                order_item.status = "ready"
    db.session.commit()

# -----------------------------
# Create cashier print job
# -----------------------------
def create_cashier_print_job(order_id: int):
    order = Order.query.get(order_id)
    if not order:
        raise ValueError("Order not found")

    table_number = order.table.number if order.table else "Unknown"
    waiter_name = order.user.username if order.user else "Unknown"

    # Group items by id
    grouped_items = {}
    for item in order.items:
        item_id = item.id
        if item_id not in grouped_items:
            grouped_items[item_id] = {
                "id": item.id,
                "name": item.menu_item.name if item.menu_item else None,
                "quantity": 0.0,
                "price": float(item.price) if item.price else 0.0,
                "total": 0.0,
                "table": table_number,
                "waiter": waiter_name,
                "notes": item.notes
            }
        grouped_items[item_id]["quantity"] += float(item.quantity)
        grouped_items[item_id]["total"] += float(item.price) * float(item.quantity) if item.price else 0.0

    items_data = list(grouped_items.values())
    cashier_station = (
        Station.query.filter_by(cashier_printer=True)
        .filter(Station.printer_identifier.isnot(None))
        .first()
    )
    if not cashier_station:
        raise ValueError("No cashier printer station configured")

    job = PrintJob(
        order_id=order.id,
        station_id=cashier_station.id if cashier_station else None,
        type="cashier",
        items_data={
            "order_id": order.id,
            "table": table_number,
            "waiter": waiter_name,
            "items": items_data,
            "total": float(order.total_amount),
            "closed_at": eat_now_naive().isoformat(),
        },
    )
    db.session.add(job)
    db.session.commit()
    queue_cloud_sync_upsert("print_job", job)
    return job

# -----------------------------
# Mark print job as printed
# -----------------------------
@print_jobs_bp.route("/<int:job_id>/printed", methods=["POST"])
@jwt_required()
def mark_job_printed(job_id: int):
    job = PrintJob.query.get_or_404(job_id)
    user_id = _safe_int_identity()
    claims = get_jwt()
    roles = extract_roles_from_claims(claims)
    if not _can_access_job(job, user_id, roles, claims):
        return jsonify({"error": "Unauthorized"}), 403

    job.status = "printed"
    job.printed_at = eat_now_naive()
    job.retry_after = None
    job.error_message = None
    db.session.commit()
    queue_cloud_sync_upsert("print_job", job)
    return jsonify({"message": f"Print job {job.id} marked as printed"}), 200

# -----------------------------
# Get pending jobs for a station
# -----------------------------
@print_jobs_bp.route("/station/<int:station_id>/pending", methods=["GET"])
@jwt_required()
def get_pending_jobs(station_id: int):
    claims = get_jwt()
    roles = extract_roles_from_claims(claims)
    if not _is_admin_or_manager(roles):
        if "station" not in roles or claims.get("station_id") != station_id:
            return jsonify({"error": "Unauthorized"}), 403

    jobs = PrintJob.query.filter_by(station_id=station_id, status="pending").all()
    return jsonify([
        {
            "id": job.id,
            "order_id": job.order_id,
            "type": job.type,
            "items_data": job.items_data,
            "status": job.status,
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
            "retry_after": job.retry_after.isoformat() if job.retry_after else None,
        }
        for job in jobs
    ])

# -----------------------------
# Retry a failed print job
# -----------------------------
@print_jobs_bp.route("/<int:job_id>/retry", methods=["POST"])
@jwt_required()
def retry_failed_job(job_id: int):
    user_id = _safe_int_identity()
    claims = get_jwt()
    roles = extract_roles_from_claims(claims)
    job = PrintJob.query.get_or_404(job_id)

    # Only failed jobs can be retried
    if job.status != "failed":
        return jsonify({"error": "Job not failed"}), 403

    if not _can_access_job(job, user_id, roles, claims):
        return jsonify({"error": "Unauthorized"}), 403

    # Retry the job
    job.status = "pending"
    job.retry_after = None
    job.error_message = None
    db.session.commit()
    queue_cloud_sync_upsert("print_job", job)

    return jsonify({"message": f"Print job {job.id} set to pending for retry"}), 200


# -----------------------------
# Manual creation of station print job
# -----------------------------
@print_jobs_bp.route("/station/manual", methods=["POST"])
@jwt_required()
def manual_station_print():
    roles = _current_roles()
    if not (_is_admin_or_manager(roles) or "cashier" in roles):
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    order_id = data.get("order_id")
    station_id = data.get("station_id")

    order = Order.query.get_or_404(order_id)
    station = Station.query.get_or_404(station_id)

    table_number = order.table.number if order.table else "Unknown"
    waiter_name = order.user.username if order.user else "Unknown"

    station_items = [
        order_item_to_dict(item)
        for item in order.items
        if item.menu_item.station_id == station.id
    ]

    if not station_items:
        return jsonify({"error": "No items for this station"}), 400

    job = PrintJob(
        order_id=order.id,
        station_id=station.id,
        type="station",
        items_data={
            "order_id": order.id,
            "table": table_number,
            "waiter": waiter_name,
            "items": station_items,
        },
    )
    db.session.add(job)
    db.session.commit()
    queue_cloud_sync_upsert("print_job", job)
    return jsonify({"message": f"Manual station print job {job.id} created"}), 201

# -----------------------------
# Manual creation of cashier print job
# -----------------------------
@print_jobs_bp.route("/cashier/manual", methods=["POST"])
@jwt_required()
def print_cashier_manual():
    roles = _current_roles()
    if not (_is_admin_or_manager(roles) or "cashier" in roles):
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    order_id = data.get("order_id")

    if not order_id:
        return jsonify({"error": "order_id is required"}), 400

    order = db.session.get(Order, order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    table_number = order.table.number if order.table else "Unknown"
    waiter_name = order.user.username if order.user else "Unknown"

    # ---------------- Group items by menu_item_id ----------------
    grouped_items = {}
    for item in order.items:
        key = item.menu_item_id
        if key not in grouped_items:
            grouped_items[key] = {
                "name": item.menu_item.name if item.menu_item else None,
                "quantity": 0,
                "price": float(item.price) if item.price else 0.0,
                "vip_price": float(item.vip_price) if item.vip_price else None,
                "notes": [],
                "prep_tag": getattr(item, "prep_tag", None),
            }
        grouped_items[key]["quantity"] += float(item.quantity)
        if item.notes:
            grouped_items[key]["notes"].append(item.notes)

    # Prepare items for the print job
    items_data = []
    for item in grouped_items.values():
        items_data.append({
            "name": item["name"],
            "quantity": item["quantity"],
            "price": item["price"],
            "vip_price": item["vip_price"],
            "notes": "; ".join(item["notes"]) if item["notes"] else None,
            "prep_tag": item["prep_tag"],
            "table": table_number,
            "waiter": waiter_name,
        })

    # Create cashier print job
    cashier_station = (
        Station.query.filter_by(cashier_printer=True)
        .filter(Station.printer_identifier.isnot(None))
        .first()
    )
    if not cashier_station:
        return jsonify({"error": "No cashier printer station configured"}), 400
    job = PrintJob(
        order_id=order.id,
        station_id=cashier_station.id if cashier_station else None,
        type="cashier",
        items_data={
            "order_id": order.id,
            "table": table_number,
            "waiter": waiter_name,
            "items": items_data,
            "total": float(order.total_amount) if order.total_amount else 0.0,
            "closed_at": eat_now_naive().isoformat(),
        },
        status="pending",
    )

    db.session.add(job)
    db.session.commit()
    queue_cloud_sync_upsert("print_job", job)

    return jsonify({"message": f"Cashier receipt print job created for order {order.id}"}), 201
# -----------------------------
# Get all print jobs (with optional status filter)
# -----------------------------
@print_jobs_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_print_jobs():
    user_id = _safe_int_identity()
    claims = get_jwt()
    roles = extract_roles_from_claims(claims)

    status = request.args.get("status")  # optional query param
    query = PrintJob.query

    if status:
        query = query.filter_by(status=status)

    if _is_admin_or_manager(roles):
        pass
    elif "waiter" in roles:
        if user_id is None:
            return jsonify({"error": "Unauthorized"}), 403
        query = query.join(Order, PrintJob.order_id == Order.id).filter(Order.user_id == user_id)
    elif "station" in roles:
        query = query.filter(PrintJob.station_id == claims.get("station_id"))
    elif "cashier" in roles:
        query = query.filter(PrintJob.type == "cashier")
    else:
        return jsonify({"error": "Unauthorized"}), 403

    jobs = query.order_by(PrintJob.created_at.desc()).all()

    result = []
    for job in jobs:
        result.append({
            "id": job.id,
            "order_id": job.order_id,
            "order_user_id": job.order.user_id if job.order else None,
            "station_id": job.station_id,
            "type": job.type,
            "items_data": job.items_data,
            "status": job.status,
            "error_message": job.error_message,
            "attempts": job.attempts,
            "retry_after": job.retry_after.isoformat() if job.retry_after else None,
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
        })

    return jsonify(result), 200
# Delete a print job
@print_jobs_bp.route("/<int:job_id>", methods=["DELETE"])
@jwt_required()
def delete_print_job(job_id: int):
    job = PrintJob.query.get_or_404(job_id)
    user_id = _safe_int_identity()
    claims = get_jwt()
    roles = extract_roles_from_claims(claims)

    if not _can_access_job(job, user_id, roles, claims):
        return jsonify({"error": "Unauthorized"}), 403

    db.session.delete(job)
    db.session.commit()
    queue_cloud_sync_delete("print_job", job.id)
    return jsonify({"message": f"Print job {job.id} deleted"}), 200
