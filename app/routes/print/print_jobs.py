import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.models import PrintJob, Order, Station, OrderItem, User

print_jobs_bp = Blueprint("print_jobs", __name__, url_prefix="/print-jobs")

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
def create_station_print_jobs(order: Order, only_new_items=True):
    stations = Station.query.all()

    table_number = order.table.number if order.table else "Unknown"
    waiter_name = order.user.username if order.user else "Unknown"

    for station in stations:
        if not station.printer_identifier:
            continue

        station_items = [
            order_item_to_dict(item)
            for item in order.items
            if item.menu_item.station_id == station.id
            and item.status != "ready"
        ]

        if not station_items:
            continue

        if station.name.lower() == "butcher":
            db.session.add(PrintJob(
                order_id=order.id,
                station_id=station.id,
                type="station",
                items_data={
                    "copy": "customer",
                    "order_id": order.id,
                    "table": table_number,
                    "waiter": waiter_name,
                    "items": station_items,
                }
            ))
            for it in station_items:
                db.session.add(PrintJob(
                    order_id=order.id,
                    station_id=station.id,
                    type="station",
                    items_data={
                        "copy": "kitchen",
                        "order_id": order.id,
                        "table": table_number,
                        "waiter": waiter_name,
                        "item": it,
                        "prep_tag": it.get("prep_tag"),
                    }
                ))
        else:
            db.session.add(PrintJob(
                order_id=order.id,
                station_id=station.id,
                type="station",
                items_data={
                    "order_id": order.id,
                    "table": table_number,
                    "waiter": waiter_name,
                    "items": station_items,
                }
            ))

    db.session.commit()

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

    job = PrintJob(
        order_id=order.id,
        station_id=None,
        type="cashier",
        items_data={
            "order_id": order.id,
            "table": table_number,
            "waiter": waiter_name,
            "items": items_data,
            "total": float(order.total_amount),
            "closed_at": datetime.utcnow().isoformat(),
        },
    )
    db.session.add(job)
    db.session.commit()
    return job

# -----------------------------
# Mark print job as printed
# -----------------------------
@print_jobs_bp.route("/<int:job_id>/printed", methods=["POST"])
@jwt_required()
def mark_job_printed(job_id: int):
    job = PrintJob.query.get_or_404(job_id)
    job.status = "printed"
    job.printed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": f"Print job {job.id} marked as printed"}), 200

# -----------------------------
# Get pending jobs for a station
# -----------------------------
@print_jobs_bp.route("/station/<int:station_id>/pending", methods=["GET"])
@jwt_required()
def get_pending_jobs(station_id: int):
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
        }
        for job in jobs
    ])

# -----------------------------
# Retry a failed print job
# -----------------------------
@print_jobs_bp.route("/<int:job_id>/retry", methods=["POST"])
@jwt_required()
def retry_failed_job(job_id: int):
    user_id = get_jwt_identity()
    job = PrintJob.query.get_or_404(job_id)

    # Only failed jobs can be retried
    if job.status != "failed":
        return jsonify({"error": "Job not failed"}), 403

    # Fetch user and check permissions
    user = User.query.get(user_id)
    if job.order.user_id != user_id and user.role not in ["admin", "manager"]:
        return jsonify({"error": "Unauthorized"}), 403

    # Retry the job
    job.status = "pending"
    job.attempts = (job.attempts or 0) + 1
    db.session.commit()

    return jsonify({"message": f"Print job {job.id} set to pending for retry"}), 200


# -----------------------------
# Manual creation of station print job
# -----------------------------
@print_jobs_bp.route("/station/manual", methods=["POST"])
@jwt_required()
def manual_station_print():
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
    return jsonify({"message": f"Manual station print job {job.id} created"}), 201

# -----------------------------
# Manual creation of cashier print job
# -----------------------------
@print_jobs_bp.route("/cashier/manual", methods=["POST"])
@jwt_required()
def print_cashier_manual():
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
    job = PrintJob(
        order_id=order.id,
        station_id=None,
        type="cashier",
        items_data={
            "order_id": order.id,
            "table": table_number,
            "waiter": waiter_name,
            "items": items_data,
            "total": float(order.total_amount) if order.total_amount else 0.0,
            "closed_at": datetime.utcnow().isoformat(),
        },
        status="pending",
    )

    db.session.add(job)
    db.session.commit()

    return jsonify({"message": f"Cashier receipt print job created for order {order.id}"}), 201
# -----------------------------
# Get all print jobs (with optional status filter)
# -----------------------------
@print_jobs_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_print_jobs():
    status = request.args.get("status")  # optional query param
    query = PrintJob.query

    if status:
        query = query.filter_by(status=status)

    jobs = query.order_by(PrintJob.created_at.desc()).all()

    result = []
    for job in jobs:
        result.append({
            "id": job.id,
            "order_id": job.order_id,
            "station_id": job.station_id,
            "type": job.type,
            "items_data": job.items_data,
            "status": job.status,
            "error_message": job.error_message,
            "attempts": job.attempts,
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
        })

    return jsonify(result), 200
# Delete a print job
@print_jobs_bp.route("/<int:job_id>", methods=["DELETE"])
@jwt_required()
def delete_print_job(job_id: int):
    job = PrintJob.query.get_or_404(job_id)
    user_id = get_jwt_identity()

    # Only admin, manager, or creator of the order can delete
    if job.order.user_id != user_id and not current_user_is_admin_or_manager(user_id):
        return jsonify({"error": "Unauthorized"}), 403

    db.session.delete(job)
    db.session.commit()
    return jsonify({"message": f"Print job {job.id} deleted"}), 200


# Utility function to check role
def current_user_is_admin_or_manager(user_id):
    user = User.query.get(user_id)
    return user and user.role.lower() in ["admin", "manager"]
