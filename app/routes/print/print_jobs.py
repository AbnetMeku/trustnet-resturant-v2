from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.models import PrintJob, Order, Station, OrderItem


print_jobs_bp = Blueprint("print_jobs", __name__, url_prefix="/print-jobs")


def order_item_to_print_dict(item: OrderItem):
    quantity_to_print = item.quantity - (item.printed_quantity or 0)
    return {
        "id": item.id,
        "menu_item_id": item.menu_item_id,
        "name": item.menu_item.name if item.menu_item else None,
        "quantity": float(quantity_to_print),
        "price": float(item.price) if item.price is not None else 0.0,
        "vip_price": float(item.vip_price) if item.vip_price is not None else None,
        "notes": item.notes,
        "station": item.station,
        "status": item.status,
        "prep_tag": item.prep_tag,
    }


@print_jobs_bp.route("/", methods=["POST"])
@jwt_required()
def add_print_job():
    data = request.get_json()
    order_id = data.get("order_id")
    station_id = data.get("station_id")

    # Validate order and station
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    station = Station.query.get(station_id)
    if not station:
        return jsonify({"error": "Station not found"}), 404

    # Find order items pending and not fully printed for this station
    items_to_print = [
        item for item in order.items
        if item.status == "pending" and 
        (item.quantity - (item.printed_quantity or 0)) > 0 and 
        item.station == station.name
    ]

    if not items_to_print:
        return jsonify({"error": "No pending items to print for this station"}), 400

    items_data = [order_item_to_print_dict(i) for i in items_to_print]

    job = PrintJob(order_id=order_id, station_id=station_id, items_data=items_data, status="pending")
    db.session.add(job)
    db.session.commit()

    return jsonify({"message": "Print job created", "job_id": job.id}), 201


@print_jobs_bp.route("/<int:job_id>/printed", methods=["POST"])
@jwt_required()
def mark_job_printed(job_id):
    job = PrintJob.query.get_or_404(job_id)
    job.status = "printed"

    # Update printed_quantity and status of related order items
    order_items = OrderItem.query.filter_by(order_id=job.order_id, status="pending").all()
    station_name = job.station.name if job.station else None
    for item in order_items:
        if item.station == station_name:
            qty_to_print = item.quantity - (item.printed_quantity or 0)
            if qty_to_print > 0:
                item.printed_quantity = (item.printed_quantity or 0) + qty_to_print
            if item.printed_quantity >= item.quantity:
                item.status = "ready"

    db.session.commit()
    return jsonify({"message": "Print job marked as printed"})


@print_jobs_bp.route("/station/<int:station_id>/pending", methods=["GET"])
@jwt_required()
def get_pending_jobs(station_id):
    station = Station.query.get_or_404(station_id)
    jobs = PrintJob.query.filter_by(station_id=station.id, status="pending").all()
    return jsonify([
        {
            "id": job.id,
            "order_id": job.order_id,
            "items_data": job.items_data,
            "attempts": job.attempts,
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat()
        }
        for job in jobs
    ])


@print_jobs_bp.route("/failed", methods=["GET"])
@jwt_required()
def get_failed_jobs_for_waiter():
    user_id = get_jwt_identity()
    jobs = (
        PrintJob.query
        .join(Order)
        .filter(PrintJob.status == "failed", Order.user_id == user_id)
        .all()
    )
    return jsonify([
        {
            "id": job.id,
            "order_id": job.order_id,
            "station_id": job.station_id,
            "items_data": job.items_data,
            "attempts": job.attempts,
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat()
        }
        for job in jobs
    ])


@print_jobs_bp.route("/<int:job_id>/retry", methods=["POST"])
@jwt_required()
def retry_failed_job(job_id):
    user_id = get_jwt_identity()
    job = PrintJob.query.get_or_404(job_id)

    # Only the waiter who owns the order can retry their failed job
    if job.status != "failed" or job.order.user_id != user_id:
        return jsonify({"error": "Unauthorized or job not failed"}), 403

    job.status = "pending"
    job.attempts = (job.attempts or 0) + 1
    db.session.commit()
    return jsonify({"message": "Print job set to pending for retry"})
