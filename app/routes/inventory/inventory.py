# app/routes/inventory/inventory.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StationStock, StockPurchase, StockTransfer
from app.models import MenuItem, Station

inventory_bp = Blueprint("inventory_bp", __name__, url_prefix="/inventory")

# --------------------- CREATE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase", methods=["POST"])
@jwt_required()
def add_purchase():
    """
    Add new stock to the store.
    Payload: { "menu_item_id": int, "quantity": float, "unit_price": float (optional) }
    """
    data = request.get_json()
    menu_item_id = data.get("menu_item_id")
    quantity = data.get("quantity")
    unit_price = data.get("unit_price", None)

    if not menu_item_id or quantity is None:
        return jsonify({"msg": "menu_item_id and quantity are required"}), 400

    menu_item = MenuItem.query.get(menu_item_id)
    if not menu_item:
        return jsonify({"msg": "Menu item not found"}), 404

    inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
    if not inventory_item:
        inventory_item = InventoryItem(menu_item_id=menu_item_id)
        db.session.add(inventory_item)
        db.session.commit()  # Commit to get inventory_item.id for store stock

    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=quantity)
        db.session.add(store_stock)

    purchase = StockPurchase(
        inventory_item_id=inventory_item.id,
        quantity=quantity,
        unit_price=unit_price
    )
    db.session.add(purchase)
    db.session.commit()

    return jsonify({"msg": "Stock purchased successfully", "purchase_id": purchase.id}), 201

# --------------------- UPDATE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase/<int:purchase_id>", methods=["PUT"])
@jwt_required()
def update_purchase(purchase_id):
    """
    Update an existing stock purchase
    Payload: { "quantity": float, "unit_price": float (optional) }
    """
    data = request.get_json()
    quantity = data.get("quantity")
    unit_price = data.get("unit_price", None)

    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    inventory_item = purchase.inventory_item
    if not inventory_item.store_stock:
        return jsonify({"msg": "Store stock not found"}), 404

    if quantity is not None:
        inventory_item.store_stock.quantity -= purchase.quantity
        inventory_item.store_stock.quantity += quantity
        purchase.quantity = quantity

    if unit_price is not None:
        purchase.unit_price = unit_price

    db.session.commit()
    return jsonify({"msg": "Purchase updated successfully"}), 200

# --------------------- DELETE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase/<int:purchase_id>", methods=["DELETE"])
@jwt_required()
def delete_purchase(purchase_id):
    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    if purchase.inventory_item.store_stock:
        purchase.inventory_item.store_stock.quantity -= purchase.quantity

    db.session.delete(purchase)
    db.session.commit()
    return jsonify({"msg": "Purchase deleted successfully"}), 200

# --------------------- CREATE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer", methods=["POST"])
@jwt_required()
def transfer_stock():
    """
    Transfer stock from store to station.
    Payload: { "menu_item_id": int, "station_id": int, "quantity": float }
    """
    data = request.get_json()
    menu_item_id = data.get("menu_item_id")
    station_id = data.get("station_id")
    quantity = data.get("quantity")

    if not menu_item_id or not station_id or quantity is None:
        return jsonify({"msg": "menu_item_id, station_id, and quantity are required"}), 400

    inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
    station = Station.query.get(station_id)
    if not inventory_item or not station:
        return jsonify({"msg": "Inventory item or station not found"}), 404

    if not inventory_item.store_stock or inventory_item.store_stock.quantity < quantity:
        return jsonify({"msg": "Insufficient store stock"}), 400

    inventory_item.store_stock.quantity -= quantity

    station_stock = StationStock.query.filter_by(
        station_id=station.id, inventory_item_id=inventory_item.id
    ).first()
    if station_stock:
        station_stock.quantity += quantity
    else:
        station_stock = StationStock(
            station_id=station.id, inventory_item_id=inventory_item.id, quantity=quantity
        )
        db.session.add(station_stock)

    transfer = StockTransfer(
        inventory_item_id=inventory_item.id,
        station_id=station.id,
        quantity=quantity
    )
    db.session.add(transfer)
    db.session.commit()

    return jsonify({"msg": "Stock transferred successfully", "transfer_id": transfer.id}), 201

# --------------------- UPDATE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer/<int:transfer_id>", methods=["PUT"])
@jwt_required()
def update_transfer(transfer_id):
    """
    Update an existing stock transfer
    Payload: { "quantity": float, "station_id": int (optional) }
    """
    data = request.get_json()
    quantity = data.get("quantity")
    station_id = data.get("station_id")

    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    inventory_item = transfer.inventory_item
    old_quantity = transfer.quantity
    old_station = transfer.station

    if quantity is not None:
        if old_station.id == (station_id or old_station.id):
            diff = quantity - old_quantity
            if inventory_item.store_stock.quantity < max(diff, 0):
                return jsonify({"msg": "Insufficient store stock"}), 400
            inventory_item.store_stock.quantity -= diff
            station_stock = StationStock.query.filter_by(
                inventory_item_id=inventory_item.id, station_id=old_station.id
            ).first()
            station_stock.quantity += diff
            transfer.quantity = quantity
        else:
            old_station_stock = StationStock.query.filter_by(
                inventory_item_id=inventory_item.id, station_id=old_station.id
            ).first()
            if old_station_stock.quantity < old_quantity:
                return jsonify({"msg": "Insufficient stock at old station"}), 400
            old_station_stock.quantity -= old_quantity

            new_station = Station.query.get(station_id)
            if not new_station:
                return jsonify({"msg": "New station not found"}), 404

            new_station_stock = StationStock.query.filter_by(
                inventory_item_id=inventory_item.id, station_id=new_station.id
            ).first()
            if new_station_stock:
                new_station_stock.quantity += quantity
            else:
                new_station_stock = StationStock(
                    inventory_item_id=inventory_item.id, station_id=new_station.id, quantity=quantity
                )
                db.session.add(new_station_stock)
            transfer.station_id = station_id
            transfer.quantity = quantity

    db.session.commit()
    return jsonify({"msg": "Transfer updated successfully"}), 200

# --------------------- DELETE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer/<int:transfer_id>", methods=["DELETE"])
@jwt_required()
def delete_transfer(transfer_id):
    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    station_stock = StationStock.query.filter_by(
        station_id=transfer.station_id,
        inventory_item_id=transfer.inventory_item_id
    ).first()
    if station_stock:
        station_stock.quantity -= transfer.quantity

    db.session.delete(transfer)
    db.session.commit()
    return jsonify({"msg": "Transfer deleted successfully"}), 200

# --------------------- GET ALL PURCHASES --------------------- #
@inventory_bp.route("/purchases", methods=["GET"])
@jwt_required()
def get_all_purchases():
    purchases = StockPurchase.query.all()
    result = []
    for p in purchases:
        result.append({
            "id": p.id,
            "menu_item_id": p.inventory_item.menu_item.id,
            "menu_item": p.inventory_item.menu_item.name,
            "quantity": p.quantity,
            "unit_price": p.unit_price,
            "created_at": p.created_at.isoformat() if p.created_at else None
        })
    return jsonify(result), 200

# --------------------- GET ALL TRANSFERS --------------------- #
@inventory_bp.route("/transfers", methods=["GET"])
@jwt_required()
def get_all_transfers():
    transfers = StockTransfer.query.all()
    result = []
    for t in transfers:
        result.append({
            "id": t.id,
            "menu_item_id": t.inventory_item.menu_item.id,
            "menu_item": t.inventory_item.menu_item.name,
            "station_id": t.station.id,
            "station": t.station.name,
            "quantity": t.quantity,
            "created_at": t.created_at.isoformat() if t.created_at else None
        })
    return jsonify(result), 200

# --------------------- GET AVAILABLE ITEMS (WITH STOCK) --------------------- #
@inventory_bp.route("/available-items", methods=["GET"])
@jwt_required()
def get_available_items():
    """
    Returns all menu items that currently have positive stock in the store.
    """
    items = (
        InventoryItem.query
        .join(StoreStock)
        .join(MenuItem)
        .filter(StoreStock.quantity > 0)
        .all()
    )

    result = []
    for i in items:
        result.append({
            "menu_item_id": i.menu_item.id,
            "menu_item": i.menu_item.name,
            "available_quantity": i.store_stock.quantity
        })

    return jsonify(result), 200
