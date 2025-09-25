# app/routes/inventory/inventory.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StationStock, StockPurchase, StockTransfer
from app.models import MenuItem, Station , OrderItem

inventory_bp = Blueprint("inventory_bp", __name__, url_prefix="/inventory")

# --------------------- CREATE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase", methods=["POST"])
@jwt_required()
def add_purchase():
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
        db.session.commit()  # Get inventory_item.id

    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=quantity)
        db.session.add(store_stock)

    purchase = StockPurchase(
        inventory_item_id=inventory_item.id,
        quantity=quantity,
        unit_price=unit_price,
        status="Purchased"
    )
    db.session.add(purchase)
    db.session.commit()

    return jsonify({"msg": "Stock purchased successfully", "purchase_id": purchase.id}), 201

# --------------------- UPDATE STOCK PURCHASE --------------------- #
@inventory_bp.route("/purchase/<int:purchase_id>", methods=["PUT"])
@jwt_required()
def update_purchase(purchase_id):
    data = request.get_json()
    new_quantity = data.get("quantity")
    new_unit_price = data.get("unit_price", None)

    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    inventory_item = purchase.inventory_item
    if not inventory_item.store_stock:
        return jsonify({"msg": "Store stock not found"}), 404

    # Reverse old purchase
    inventory_item.store_stock.quantity -= purchase.quantity

    # Apply new values
    quantity = new_quantity if new_quantity is not None else purchase.quantity
    inventory_item.store_stock.quantity += quantity
    purchase.quantity = quantity

    if new_unit_price is not None:
        purchase.unit_price = new_unit_price

    purchase.status = "Updated"
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
        if purchase.inventory_item.store_stock.quantity < 0:
            purchase.inventory_item.store_stock.quantity = 0

    # Soft delete: update status instead of removing row
    purchase.status = "Deleted"
    db.session.commit()
    return jsonify({"msg": "Purchase deleted successfully"}), 200

# --------------------- CREATE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer", methods=["POST"])
@jwt_required()
def transfer_stock():
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
        quantity=quantity,
        status="Transferred"
    )
    db.session.add(transfer)
    db.session.commit()

    return jsonify({"msg": "Stock transferred successfully", "transfer_id": transfer.id}), 201

# --------------------- UPDATE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer/<int:transfer_id>", methods=["PUT"])
@jwt_required()
def update_transfer(transfer_id):
    data = request.get_json()
    new_quantity = data.get("quantity")
    new_station_id = data.get("station_id")

    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    inventory_item = transfer.inventory_item

    # Reverse old transfer
    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += transfer.quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=transfer.quantity)
        db.session.add(store_stock)

    old_station_stock = StationStock.query.filter_by(
        station_id=transfer.station_id,
        inventory_item_id=inventory_item.id
    ).first()
    if old_station_stock:
        old_station_stock.quantity -= transfer.quantity
        if old_station_stock.quantity < 0:
            old_station_stock.quantity = 0

    # Apply new transfer
    quantity = new_quantity if new_quantity is not None else transfer.quantity
    station_id = new_station_id if new_station_id is not None else transfer.station_id

    if not inventory_item.store_stock or inventory_item.store_stock.quantity < quantity:
        db.session.rollback()
        return jsonify({"msg": "Insufficient store stock"}), 400

    inventory_item.store_stock.quantity -= quantity

    new_station = Station.query.get(station_id)
    if not new_station:
        db.session.rollback()
        return jsonify({"msg": "New station not found"}), 404

    new_station_stock = StationStock.query.filter_by(
        inventory_item_id=inventory_item.id, station_id=station_id
    ).first()
    if new_station_stock:
        new_station_stock.quantity += quantity
    else:
        new_station_stock = StationStock(
            inventory_item_id=inventory_item.id, station_id=station_id, quantity=quantity
        )
        db.session.add(new_station_stock)

    transfer.quantity = quantity
    transfer.station_id = station_id
    transfer.status = "Updated"
    db.session.commit()
    return jsonify({"msg": "Transfer updated successfully"}), 200

# --------------------- DELETE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer/<int:transfer_id>", methods=["DELETE"])
@jwt_required()
def delete_transfer(transfer_id):
    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    inventory_item = transfer.inventory_item

    # Restore to store
    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += transfer.quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=transfer.quantity)
        db.session.add(store_stock)

    # Remove from station
    station_stock = StationStock.query.filter_by(
        station_id=transfer.station_id,
        inventory_item_id=transfer.inventory_item_id
    ).first()
    if station_stock:
        station_stock.quantity -= transfer.quantity
        if station_stock.quantity < 0:
            station_stock.quantity = 0

    # Soft delete
    transfer.status = "Deleted"
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
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "status": p.status
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
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "status": t.status
        })
    return jsonify(result), 200

# --------------------- GET AVAILABLE ITEMS (WITH STOCK) --------------------- #
@inventory_bp.route("/available-items", methods=["GET"])
@jwt_required()
def get_available_items():
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

def deduct_station_stock(order_item: OrderItem):
    """Deduct inventory when an order item is ready. Allows negative stock and never blocks status change."""
    try:
        station_name = order_item.station
        menu_item_id = order_item.menu_item_id

        # Get the inventory item (log if missing, but don't block)
        inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
        if not inventory_item:
            # Optional: log warning
            print(f"Warning: Inventory not found for menu_item_id {menu_item_id}")
            return {"msg": "Inventory not found, skipping stock deduction"}, 200

        # Get the station
        station = Station.query.filter_by(name=station_name).first()
        if not station:
            print(f"Warning: Station '{station_name}' not found")
            return {"msg": "Station not found, skipping stock deduction"}, 200

        # Get the station stock
        station_stock = StationStock.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id
        ).first()

        if not station_stock:
            print(f"Warning: StationStock missing for menu_item_id {menu_item_id} at station '{station_name}'")
            return {"msg": "Station stock missing, skipping deduction"}, 200

        # Deduct quantity (allow negative)
        station_stock.quantity -= float(order_item.quantity)
        db.session.commit()
        return {"msg": "Stock deducted successfully"}, 200

    except Exception as e:
        # Never block; just log errors
        print(f"Error deducting stock: {str(e)}")
        db.session.rollback()
        return {"msg": "Error during stock deduction, skipping"}, 200

# --------------------- GET OVERALL STOCK --------------------- #

@inventory_bp.route("/overall-stock", methods=["GET"])
@jwt_required()
def get_overall_stock():
    inventory_items = InventoryItem.query.join(MenuItem).all()
    result = []
    for i in inventory_items:
        store_qty = i.store_stock.quantity if i.store_stock else 0
        station_qty = sum(s.quantity for s in i.station_stocks)
        result.append({
            "menu_item": i.menu_item.name,
            "store_quantity": store_qty,
            "station_quantity": station_qty,
            "total_quantity": store_qty + station_qty
        })
    return jsonify(result), 200

# --------------------- GET STATION STOCK --------------------- #

@inventory_bp.route("/station-stock", methods=["GET"])
@jwt_required()
def get_station_stock():
    items = StationStock.query.join(InventoryItem).join(MenuItem).join(Station).all()
    result = []
    for s in items:
        result.append({
            "menu_item": s.inventory_item.menu_item.name,
            "menu_item_id": s.inventory_item.menu_item.id,
            "station": s.station.name,
            "quantity": s.quantity
        })
    return jsonify(result), 200

# --------------------- GET STORE STOCK --------------------- #

@inventory_bp.route("/store-stock", methods=["GET"])
@jwt_required()
def get_store_stock():
    items = StoreStock.query.join(InventoryItem).join(MenuItem).all()
    result = []
    for s in items:
        result.append({
            "menu_item_id": s.inventory_item.menu_item.id,
            "menu_item": s.inventory_item.menu_item.name,
            "quantity": s.quantity
        })
    return jsonify(result), 200
