from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StationStock, StockTransfer, Station
from app.services.inventory_service import adjust_inventory_for_addition
from datetime import datetime

inventory_transfer_bp = Blueprint("inventory_transfer_bp", __name__, url_prefix="/inventory/transfers")

# ============================================================
# 🔄 STOCK TRANSFER MANAGEMENT (Store → Station)
# ============================================================

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

    item = InventoryItem.query.get(inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    station = Station.query.get(station_id)
    if not station:
        return jsonify({"msg": "Station not found"}), 404

    # ✅ Check store stock availability
    store_stock = StoreStock.query.filter_by(inventory_item_id=inventory_item_id).first()
    if not store_stock or store_stock.quantity < quantity:
        return jsonify({"msg": "Insufficient store stock"}), 400

    # Deduct from store
    store_stock.quantity -= quantity

    # Add to station stock
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

    # ✅ Record transfer
    transfer = StockTransfer(
        inventory_item_id=inventory_item_id,
        station_id=station_id,
        quantity=quantity,
        status="Transferred",
        created_at=datetime.utcnow()
    )
    db.session.add(transfer)

    # ✅ Update today's snapshot (live tracking)
    adjust_inventory_for_addition(station.name, inventory_item_id, quantity)

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
    result = [
        {
            "id": t.id,
            "inventory_item_id": t.inventory_item_id,
            "inventory_item_name": t.inventory_item.name if t.inventory_item else None,
            "station_id": t.station_id,
            "station_name": t.station.name if t.station else None,
            "quantity": t.quantity,
            "status": t.status,
            "created_at": t.created_at,
        }
        for t in transfers
    ]
    return jsonify(result), 200


# --------------------- GET SINGLE TRANSFER --------------------- #
@inventory_transfer_bp.route("/<int:transfer_id>", methods=["GET"])
@jwt_required()
def get_single_transfer(transfer_id):
    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    result = {
        "id": transfer.id,
        "inventory_item_id": transfer.inventory_item_id,
        "inventory_item_name": transfer.inventory_item.name if transfer.inventory_item else None,
        "station_id": transfer.station_id,
        "station_name": transfer.station.name if transfer.station else None,
        "quantity": transfer.quantity,
        "status": transfer.status,
        "created_at": transfer.created_at,
    }
    return jsonify(result), 200


# --------------------- UPDATE TRANSFER --------------------- #
@inventory_transfer_bp.route("/<int:transfer_id>", methods=["PUT"])
@jwt_required()
def update_transfer(transfer_id):
    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    data = request.get_json()
    new_quantity = data.get("quantity", transfer.quantity)
    if new_quantity <= 0:
        return jsonify({"msg": "Quantity must be greater than zero"}), 400

    diff = new_quantity - transfer.quantity
    if diff == 0:
        return jsonify({"msg": "No change in quantity"}), 200

    # ✅ Update store stock
    store_stock = StoreStock.query.filter_by(inventory_item_id=transfer.inventory_item_id).first()
    if diff > 0 and (not store_stock or store_stock.quantity < diff):
        return jsonify({"msg": "Insufficient store stock for update"}), 400
    store_stock.quantity -= diff

    # ✅ Update station stock
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
        station_stock.quantity += diff

    # ✅ Update snapshot only if increased
    station = Station.query.get(transfer.station_id)
    if diff > 0:
        adjust_inventory_for_addition(station.name, transfer.inventory_item_id, diff)
    elif diff < 0:
        # Reverse (remove from added quantity)
        adjust_inventory_for_addition(station.name, transfer.inventory_item_id, diff)

    transfer.quantity = new_quantity
    transfer.status = "Updated"
    db.session.commit()

    return jsonify({"msg": "Transfer updated successfully"}), 200


# --------------------- DELETE TRANSFER --------------------- #
@inventory_transfer_bp.route("/<int:transfer_id>", methods=["DELETE"])
@jwt_required()
def delete_transfer(transfer_id):
    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    # ✅ Reverse movement
    store_stock = StoreStock.query.filter_by(inventory_item_id=transfer.inventory_item_id).first()
    if store_stock:
        store_stock.quantity += transfer.quantity

    station_stock = StationStock.query.filter_by(
        inventory_item_id=transfer.inventory_item_id,
        station_id=transfer.station_id
    ).first()
    if station_stock:
        station_stock.quantity -= transfer.quantity

    # ✅ Reverse snapshot addition (negative)
    station = Station.query.get(transfer.station_id)
    adjust_inventory_for_addition(station.name, transfer.inventory_item_id, -transfer.quantity)

    transfer.status = "Deleted"
    db.session.delete(transfer)
    db.session.commit()

    return jsonify({"msg": "Transfer deleted and stock quantities adjusted"}), 200

