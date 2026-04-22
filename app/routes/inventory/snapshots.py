from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy.orm import joinedload
from app.extensions import db
from app.models import StationStockSnapshot, StationStock, InventoryItem, Station
from datetime import datetime
from app.utils.timezone import get_eat_today
from app.services.cloud_sync import queue_cloud_sync_delete, queue_cloud_sync_upsert

inventory_snapshot_bp = Blueprint("inventory_snapshot_bp", __name__, url_prefix="/inventory/snapshots")

# --------------------- CREATE SNAPSHOT --------------------- #
@inventory_snapshot_bp.route("/", methods=["POST"])
@jwt_required()
def create_snapshot():
    data = request.get_json()
    station_id = data.get("station_id")
    inventory_item_id = data.get("inventory_item_id")

    if not station_id or not inventory_item_id:
        return jsonify({"msg": "station_id and inventory_item_id are required"}), 400

    # Check station & inventory item exist
    station = Station.query.get(station_id)
    item = InventoryItem.query.get(inventory_item_id)
    if not station or not item:
        return jsonify({"msg": "Station or Inventory Item not found"}), 404

    today = get_eat_today()
    existing = StationStockSnapshot.query.filter_by(
        station_id=station_id, inventory_item_id=inventory_item_id, snapshot_date=today
    ).first()
    if existing:
        return jsonify({"msg": "Snapshot already exists for today"}), 400

    # Get current station stock quantity
    station_stock = StationStock.query.filter_by(
        station_id=station_id, inventory_item_id=inventory_item_id
    ).first()
    start_qty = station_stock.quantity if station_stock else 0

    snapshot = StationStockSnapshot(
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=today,
        start_of_day_quantity=start_qty,
        added_quantity=0,
        sold_quantity=0,
        remaining_quantity=start_qty
    )
    db.session.add(snapshot)
    db.session.commit()
    queue_cloud_sync_upsert("station_stock_snapshot", snapshot)
    return jsonify({"msg": "Snapshot created", "snapshot_id": snapshot.id}), 201


# --------------------- GET ALL SNAPSHOTS --------------------- #
@inventory_snapshot_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_snapshots():
    # Get query params
    station_id = request.args.get("station_id")
    inventory_item_id = request.args.get("inventory_item_id")
    snapshot_date = request.args.get("snapshot_date")  # optional YYYY-MM-DD

    query = StationStockSnapshot.query.options(
        joinedload(StationStockSnapshot.station),
        joinedload(StationStockSnapshot.inventory_item),
    )

    # Validate station_id
    if station_id:
        try:
            station_id = int(station_id)
            query = query.filter_by(station_id=station_id)
        except ValueError:
            return jsonify({"msg": "Invalid station_id, must be an integer"}), 422

    # Validate inventory_item_id
    if inventory_item_id:
        try:
            inventory_item_id = int(inventory_item_id)
            query = query.filter_by(inventory_item_id=inventory_item_id)
        except ValueError:
            return jsonify({"msg": "Invalid inventory_item_id, must be an integer"}), 422

    # Validate snapshot_date
    if snapshot_date:
        try:
            dt = datetime.strptime(snapshot_date, "%Y-%m-%d").date()
            query = query.filter_by(snapshot_date=dt)
        except ValueError:
            return jsonify({"msg": "Invalid snapshot_date, use YYYY-MM-DD"}), 422

    snapshots = query.order_by(StationStockSnapshot.snapshot_date.desc()).all()

    result = [
        {
            "id": s.id,
            "station_id": s.station_id,
            "station_name": s.station.name if s.station else None,
            "inventory_item_id": s.inventory_item_id,
            "inventory_item_name": s.inventory_item.name if s.inventory_item else None,
            "snapshot_date": s.snapshot_date.isoformat(),
            "start_of_day_quantity": s.start_of_day_quantity,
            "added_quantity": s.added_quantity,
            "sold_quantity": s.sold_quantity,
            "remaining_quantity": s.remaining_quantity,
            "created_at": s.created_at,
        } for s in snapshots
    ]

    return jsonify(result), 200


# --------------------- GET SINGLE SNAPSHOT --------------------- #
@inventory_snapshot_bp.route("/<int:snapshot_id>", methods=["GET"])
@jwt_required()
def get_snapshot(snapshot_id):
    snapshot = (
        StationStockSnapshot.query
        .options(
            joinedload(StationStockSnapshot.station),
            joinedload(StationStockSnapshot.inventory_item),
        )
        .filter_by(id=snapshot_id)
        .first()
    )
    if not snapshot:
        return jsonify({"msg": "Snapshot not found"}), 404

    return jsonify({
        "id": snapshot.id,
        "station_id": snapshot.station_id,
        "station_name": snapshot.station.name if snapshot.station else None,
        "inventory_item_id": snapshot.inventory_item_id,
        "inventory_item_name": snapshot.inventory_item.name if snapshot.inventory_item else None,
        "snapshot_date": snapshot.snapshot_date.isoformat(),
        "start_of_day_quantity": snapshot.start_of_day_quantity,
        "added_quantity": snapshot.added_quantity,
        "sold_quantity": snapshot.sold_quantity,
        "remaining_quantity": snapshot.remaining_quantity,
        "created_at": snapshot.created_at,
    }), 200


# --------------------- UPDATE SNAPSHOT --------------------- #
@inventory_snapshot_bp.route("/<int:snapshot_id>", methods=["PUT"])
@jwt_required()
def update_snapshot(snapshot_id):
    snapshot = StationStockSnapshot.query.get(snapshot_id)
    if not snapshot:
        return jsonify({"msg": "Snapshot not found"}), 404

    data = request.get_json()
    snapshot.added_quantity = data.get("added_quantity", snapshot.added_quantity)
    snapshot.sold_quantity = data.get("sold_quantity", snapshot.sold_quantity)
    snapshot.remaining_quantity = data.get(
        "remaining_quantity",
        snapshot.start_of_day_quantity + snapshot.added_quantity - snapshot.sold_quantity
    )
    db.session.commit()
    queue_cloud_sync_upsert("station_stock_snapshot", snapshot)
    return jsonify({"msg": "Snapshot updated successfully"}), 200


# --------------------- DELETE SNAPSHOT --------------------- #
@inventory_snapshot_bp.route("/<int:snapshot_id>", methods=["DELETE"])
@jwt_required()
def delete_snapshot(snapshot_id):
    snapshot = StationStockSnapshot.query.get(snapshot_id)
    if not snapshot:
        return jsonify({"msg": "Snapshot not found"}), 404

    db.session.delete(snapshot)
    queue_cloud_sync_delete("station_stock_snapshot", snapshot_id)
    db.session.commit()
    return jsonify({"msg": "Snapshot deleted"}), 200


# --------------------- HELPER: Initialize Snapshot for First Order --------------------- #
def init_snapshot_if_missing(station_id, inventory_item_id):
    today = get_eat_today()
    snapshot = StationStockSnapshot.query.filter_by(
        station_id=station_id, inventory_item_id=inventory_item_id, snapshot_date=today
    ).first()
    if snapshot:
        return snapshot

    # Create snapshot automatically
    station_stock = StationStock.query.filter_by(
        station_id=station_id, inventory_item_id=inventory_item_id
    ).first()
    start_qty = station_stock.quantity if station_stock else 0

    snapshot = StationStockSnapshot(
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=today,
        start_of_day_quantity=start_qty,
        added_quantity=0,
        sold_quantity=0,
        remaining_quantity=start_qty
    )
    db.session.add(snapshot)
    db.session.commit()
    return snapshot
