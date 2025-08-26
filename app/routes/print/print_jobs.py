from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.models import PrintJob, Order, Station

print_jobs_bp = Blueprint("print_jobs", __name__, url_prefix="/print-jobs")

# ------------------ Add Print Jobs ------------------ #
# This is typically called when an order is created/updated
@print_jobs_bp.route("/", methods=["POST"])
@jwt_required()
def add_print_job():
    data = request.get_json()
    order_id = data.get("order_id")
    station_id = data.get("station_id")
    items_data = data.get("items_data")  # grouped items for that station

    if not order_id or not station_id or not items_data:
        return jsonify({"error": "order_id, station_id and items_data are required"}), 400

    job = PrintJob(order_id=order_id, station_id=station_id, items_data=items_data)
    db.session.add(job)
    db.session.commit()
    return jsonify({"message": "Print job created", "job_id": job.id}), 201


# ------------------ Fetch Pending Jobs per Station ------------------ #
@print_jobs_bp.route("/station/<int:station_id>/pending", methods=["GET"])
@jwt_required()
def get_pending_jobs(station_id):
    # Check if station exists
    station = Station.query.get_or_404(station_id)
    jobs = PrintJob.query.filter_by(station_id=station.id, status="pending").all()
    return jsonify([
        {
            "id": job.id,
            "order_id": job.order_id,
            "items_data": job.items_data,
            "attempts": job.attempts,
            "created_at": job.created_at,
            "updated_at": job.updated_at
        }
        for job in jobs
    ])


# ------------------ Fetch Failed Jobs for Waiter ------------------ #
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
            "created_at": job.created_at,
            "updated_at": job.updated_at
        }
        for job in jobs
    ])


# ------------------ Retry Failed Job ------------------ #
@print_jobs_bp.route("/<int:job_id>/retry", methods=["POST"])
@jwt_required()
def retry_failed_job(job_id):
    user_id = get_jwt_identity()
    job = PrintJob.query.get_or_404(job_id)

    # Only the waiter who owns the order can retry their failed job
    if job.status != "failed" or job.order.user_id != user_id:
        return jsonify({"error": "Unauthorized or job not failed"}), 403

    job.status = "pending"
    job.attempts += 1
    db.session.commit()
    return jsonify({"message": "Print job set to pending for retry"})


# ------------------ Mark Job as Printed ------------------ #
@print_jobs_bp.route("/<int:job_id>/printed", methods=["POST"])
@jwt_required()
def mark_job_printed(job_id):
    job = PrintJob.query.get_or_404(job_id)
    job.status = "printed"
    db.session.commit()
    return jsonify({"message": "Print job marked as printed"})
