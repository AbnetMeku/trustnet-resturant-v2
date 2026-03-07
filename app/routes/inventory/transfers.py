from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StationStock, StockTransfer, Station
from app.services.inventory_service import (
    adjust_inventory_for_addition,
    get_or_create_today_snapshot,
    update_store_snapshot_transfer,
)
from app.utils.timezone import eat_now_naive

inventory_transfer_bp = Blueprint("inventory_transfer_bp", __name__, url_prefix="/inventory/transfers")


def _serialize_transfer(transfer):
    return {
        "id": transfer.id,
        "inventory_item_id": transfer.inventory_item_id,
        "inventory_item_name": transfer.inventory_item.name if transfer.inventory_item else None,
        "station_id": transfer.station_id,
        "station_name": transfer.station.name if transfer.station else None,
        "quantity": transfer.quantity,
        "status": transfer.status,
        "created_at": transfer.created_at,
    }

# --------------------- CREATE TRANSFER --------------------- #
@inventory_transfer_bp.route("/", methods=["POST"])
@jwt_required()
def create_transfer():
    data = request.get_json()
    inventory_item_id = data.get("inventory_item_id")
    station_id = data.get("station_id")
    quantity = data.get("quantity", 0)

    if not inventory_item_id or not station_id or quantity <= 0:
        return jsonify({"msg": "inventory_item_id, station_id and valid quantity are required"}), 400

    item = db.session.get(InventoryItem, inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    station = db.session.get(Station, station_id)
    if not station:
        return jsonify({"msg": "Station not found"}), 404

    # Check store stock availability
    store_stock = StoreStock.query.filter_by(inventory_item_id=inventory_item_id).first()
    if not store_stock or store_stock.quantity < quantity:
        return jsonify({"msg": "Insufficient store stock"}), 400

    # Ensure today's snapshot exists BEFORE modifying station stock
    get_or_create_today_snapshot(station.name, inventory_item_id)
    store_opening_quantity = float(store_stock.quantity or 0)

    # Deduct from store
    store_stock.quantity -= quantity

    # Add to station stock (create or update)
    station_stock = StationStock.query.filter_by(
        inventory_item_id=inventory_item_id,
        station_id=station_id
    ).first()

    if station_stock:
        station_stock.quantity += quantity
    else:
        station_stock = StationStock(
            inventory_item_id=inventory_item_id,
            station_id=station_id,
            quantity=quantity
        )
        db.session.add(station_stock)

    # Update snapshot's added_quantity
    update_store_snapshot_transfer(inventory_item_id, quantity, opening_quantity=store_opening_quantity)
    adjust_inventory_for_addition(station.name, inventory_item_id, quantity)

    # Record transfer
    transfer = StockTransfer(
        inventory_item_id=inventory_item_id,
        station_id=station_id,
        quantity=quantity,
        status="Transferred",
        created_at=eat_now_naive()
    )
    db.session.add(transfer)
    db.session.commit()
    return jsonify({"msg": "Stock transferred successfully", "transfer_id": transfer.id}), 201

# --------------------- GET ALL TRANSFERS --------------------- #
@inventory_transfer_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_transfers():
    station_id = request.args.get("station_id")
    query = StockTransfer.query
    if station_id:
        query = query.filter_by(station_id=station_id)

    transfers = query.order_by(StockTransfer.created_at.desc()).all()
    result = [_serialize_transfer(t) for t in transfers]
    return jsonify(result), 200


# --------------------- GET SINGLE TRANSFER --------------------- #
@inventory_transfer_bp.route("/<int:transfer_id>", methods=["GET"])
@jwt_required()
def get_single_transfer(transfer_id):
    transfer = db.session.get(StockTransfer, transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    return jsonify(_serialize_transfer(transfer)), 200


# --------------------- UPDATE TRANSFER --------------------- #
@inventory_transfer_bp.route("/<int:transfer_id>", methods=["PUT"])
@jwt_required()
def update_transfer(transfer_id):
    transfer = db.session.get(StockTransfer, transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404
    if transfer.status == "Deleted":
        return jsonify({"msg": "Deleted transfers cannot be edited"}), 400

    data = request.get_json() or {}
    new_quantity = data.get("quantity", transfer.quantity)
    try:
        new_quantity = float(new_quantity)
    except (TypeError, ValueError):
        return jsonify({"msg": "Quantity must be a number"}), 400
    if new_quantity <= 0:
        return jsonify({"msg": "Quantity must be greater than zero"}), 400

    station = transfer.station

    # Ensure snapshot exists BEFORE changing station stock
    get_or_create_today_snapshot(station.name, transfer.inventory_item_id)

    # Get or create store stock
    store_stock = StoreStock.query.filter_by(inventory_item_id=transfer.inventory_item_id).first()
    if not store_stock:
        store_stock = StoreStock(inventory_item_id=transfer.inventory_item_id, quantity=0)
        db.session.add(store_stock)
        db.session.flush()

    # Undo previous transfer
    original_quantity = float(transfer.quantity or 0)
    store_opening_quantity = float(store_stock.quantity or 0)
    store_stock.quantity += original_quantity

    # Check if store has enough for the new transfer
    if store_stock.quantity < new_quantity:
        return jsonify({"msg": "Insufficient store stock for update"}), 400

    # Deduct new transfer quantity
    store_stock.quantity -= new_quantity

    # Update station stock
    station_stock = StationStock.query.filter_by(
        inventory_item_id=transfer.inventory_item_id,
        station_id=transfer.station_id
    ).first()
    if not station_stock:
        station_stock = StationStock(
            inventory_item_id=transfer.inventory_item_id,
            station_id=transfer.station_id,
            quantity=new_quantity
        )
        db.session.add(station_stock)
    else:
        updated_station_quantity = float(station_stock.quantity or 0) + (new_quantity - original_quantity)
        if updated_station_quantity < 0:
            return jsonify({"msg": "Cannot reduce transfer below remaining station stock"}), 400
        station_stock.quantity = updated_station_quantity

    # Update snapshot added_quantity
    quantity_diff = new_quantity - original_quantity
    update_store_snapshot_transfer(
        transfer.inventory_item_id,
        quantity_diff,
        opening_quantity=store_opening_quantity,
    )
    adjust_inventory_for_addition(
        station.name,
        transfer.inventory_item_id,
        quantity_diff,
    )

    transfer.quantity = new_quantity
    transfer.status = "Updated"
    db.session.commit()
    return jsonify({"msg": "Transfer updated successfully"}), 200


# --------------------- DELETE TRANSFER --------------------- #
@inventory_transfer_bp.route("/<int:transfer_id>", methods=["DELETE"])
@jwt_required()
def delete_transfer(transfer_id):
    transfer = db.session.get(StockTransfer, transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404
    if transfer.status == "Deleted":
        return jsonify({"msg": "Transfer already deleted"}), 400

    station = transfer.station
    # Ensure snapshot exists BEFORE reversing stock
    get_or_create_today_snapshot(station.name, transfer.inventory_item_id)

    # Reverse store stock
    store_stock = StoreStock.query.filter_by(inventory_item_id=transfer.inventory_item_id).first()
    store_opening_quantity = float(store_stock.quantity or 0) if store_stock else 0.0
    if store_stock:
        store_stock.quantity += transfer.quantity

    # Reverse station stock
    station_stock = StationStock.query.filter_by(
        inventory_item_id=transfer.inventory_item_id,
        station_id=transfer.station_id
    ).first()
    if not station_stock or float(station_stock.quantity or 0) < float(transfer.quantity or 0):
        return jsonify({"msg": "Cannot delete transfer because stock has already been used at the station"}), 400
    station_stock.quantity = float(station_stock.quantity or 0) - float(transfer.quantity or 0)

    # Reverse snapshot added_quantity
    update_store_snapshot_transfer(
        transfer.inventory_item_id,
        -float(transfer.quantity or 0),
        opening_quantity=store_opening_quantity,
    )
    adjust_inventory_for_addition(station.name, transfer.inventory_item_id, -float(transfer.quantity or 0))

    transfer.status = "Deleted"
    db.session.commit()
    return jsonify({"msg": "Transfer deleted and stock quantities adjusted"}), 200
