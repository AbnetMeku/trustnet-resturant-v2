from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StationStock, Station
from datetime import datetime

inventory_stock_bp = Blueprint("inventory_stock_bp", __name__, url_prefix="/inventory/stock")

# ============================================================
# 🏬 STORE STOCK MANAGEMENT
# ============================================================

# --------------------- CREATE STORE STOCK --------------------- #
@inventory_stock_bp.route("/store", methods=["POST"])
@jwt_required()
def create_store_stock():
    data = request.get_json()
    inventory_item_id = data.get("inventory_item_id")
    quantity = data.get("quantity", 0)

    if not inventory_item_id:
        return jsonify({"msg": "inventory_item_id is required"}), 400

    item = InventoryItem.query.get(inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    # Check if stock already exists
    existing_stock = StoreStock.query.filter_by(inventory_item_id=inventory_item_id).first()
    if existing_stock:
        existing_stock.quantity += quantity
        db.session.commit()
        return jsonify({"msg": "Store stock updated", "quantity": existing_stock.quantity}), 200

    stock = StoreStock(inventory_item_id=inventory_item_id, quantity=quantity)
    db.session.add(stock)
    db.session.commit()

    return jsonify({"msg": "Store stock created", "id": stock.id}), 201


# --------------------- GET ALL STORE STOCK --------------------- #
@inventory_stock_bp.route("/store", methods=["GET"])
@jwt_required()
def get_all_store_stock():
    stocks = StoreStock.query.all()
    result = [
        {
            "id": s.id,
            "inventory_item_id": s.inventory_item_id,
            "inventory_item_name": s.inventory_item.name if s.inventory_item else None,
            "quantity": s.quantity,
            "updated_at": s.updated_at,
        }
        for s in stocks
    ]
    return jsonify(result), 200


# --------------------- UPDATE STORE STOCK --------------------- #
@inventory_stock_bp.route("/store/<int:stock_id>", methods=["PUT"])
@jwt_required()
def update_store_stock(stock_id):
    stock = StoreStock.query.get(stock_id)
    if not stock:
        return jsonify({"msg": "Store stock not found"}), 404

    data = request.get_json()
    stock.quantity = data.get("quantity", stock.quantity)
    db.session.commit()

    return jsonify({"msg": "Store stock updated successfully"}), 200


# --------------------- DELETE STORE STOCK --------------------- #
@inventory_stock_bp.route("/store/<int:stock_id>", methods=["DELETE"])
@jwt_required()
def delete_store_stock(stock_id):
    stock = StoreStock.query.get(stock_id)
    if not stock:
        return jsonify({"msg": "Store stock not found"}), 404

    db.session.delete(stock)
    db.session.commit()
    return jsonify({"msg": "Store stock deleted"}), 200


# ============================================================
# 🧾 STATION STOCK MANAGEMENT
# ============================================================

# --------------------- CREATE STATION STOCK --------------------- #
@inventory_stock_bp.route("/station", methods=["POST"])
@jwt_required()
def create_station_stock():
    data = request.get_json()
    inventory_item_id = data.get("inventory_item_id")
    station_id = data.get("station_id")
    quantity = data.get("quantity", 0)

    if not inventory_item_id or not station_id:
        return jsonify({"msg": "inventory_item_id and station_id are required"}), 400

    item = InventoryItem.query.get(inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    station = Station.query.get(station_id)
    if not station:
        return jsonify({"msg": "Station not found"}), 404

    existing_stock = StationStock.query.filter_by(
        inventory_item_id=inventory_item_id, station_id=station_id
    ).first()

    if existing_stock:
        existing_stock.quantity += quantity
        db.session.commit()
        return jsonify({"msg": "Station stock updated", "quantity": existing_stock.quantity}), 200

    stock = StationStock(inventory_item_id=inventory_item_id, station_id=station_id, quantity=quantity)
    db.session.add(stock)
    db.session.commit()

    return jsonify({"msg": "Station stock created", "id": stock.id}), 201


# --------------------- GET ALL STATION STOCK --------------------- #
@inventory_stock_bp.route("/station", methods=["GET"])
@jwt_required()
def get_all_station_stock():
    station_id = request.args.get("station_id")
    query = StationStock.query
    if station_id:
        query = query.filter_by(station_id=station_id)

    stocks = query.all()
    result = [
        {
            "id": s.id,
            "station_id": s.station_id,
            "station_name": s.station.name if s.station else None,
            "inventory_item_id": s.inventory_item_id,
            "inventory_item_name": s.inventory_item.name if s.inventory_item else None,
            "quantity": s.quantity,
            "updated_at": s.updated_at,
        }
        for s in stocks
    ]
    return jsonify(result), 200


# --------------------- UPDATE STATION STOCK --------------------- #
@inventory_stock_bp.route("/station/<int:stock_id>", methods=["PUT"])
@jwt_required()
def update_station_stock(stock_id):
    stock = StationStock.query.get(stock_id)
    if not stock:
        return jsonify({"msg": "Station stock not found"}), 404

    data = request.get_json()
    stock.quantity = data.get("quantity", stock.quantity)
    db.session.commit()

    return jsonify({"msg": "Station stock updated successfully"}), 200


# --------------------- DELETE STATION STOCK --------------------- #
@inventory_stock_bp.route("/station/<int:stock_id>", methods=["DELETE"])
@jwt_required()
def delete_station_stock(stock_id):
    stock = StationStock.query.get(stock_id)
    if not stock:
        return jsonify({"msg": "Station stock not found"}), 404

    db.session.delete(stock)
    db.session.commit()
    return jsonify({"msg": "Station stock deleted"}), 200
