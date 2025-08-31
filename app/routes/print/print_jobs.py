import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.models import PrintJob, Order, Station, OrderItem

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

    items_data = [
        {
            "name": item.menu_item.name,
            "quantity": float(item.quantity),
            "price": float(item.price) if item.price else 0.0,
            "vip_price": float(item.vip_price) if item.vip_price else None,
            "notes": item.notes,
            "prep_tag": getattr(item, "prep_tag", None),
            "table": table_number,
            "waiter": waiter_name,
        }
        for item in order.items
    ]

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

    if job.status != "failed":
        return jsonify({"error": "Job not failed"}), 403

    if job.order.user_id != user_id:
        return jsonify({"error": "Unauthorized"}), 403

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
def print_cashier_receipt():
    data = request.get_json()
    order_id = data.get("order_id")

    if not order_id:
        return jsonify({"error": "order_id required"}), 400

    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404

    table_number = order.table.number if order.table else "Unknown"
    waiter_name = order.user.username if order.user else "Unknown"

    items_data = []
    for item in order.items:
        items_data.append({
            "id": item.id,
            "name": item.menu_item.name if item.menu_item else None,
            "quantity": float(item.quantity),
            "price": float(item.price) if item.price else 0.0,
            "total": float(item.price) * float(item.quantity) if item.price else 0.0,
            "table": table_number,
            "waiter": waiter_name,
        })

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
        },
        status="pending",
    )
    db.session.add(job)
    db.session.commit()

    return jsonify({"message": f"Cashier receipt print job created for order {order.id}"}), 201
