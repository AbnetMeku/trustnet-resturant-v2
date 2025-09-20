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
    If InventoryItem does not exist for the menu_item, it will be created automatically.
    Payload: { "menu_item_id": int, "quantity": float, "unit_price": float (optional) }
    """
    data = request.get_json()
    menu_item_id = data.get("menu_item_id")
    quantity = data.get("quantity")
    unit_price = data.get("unit_price", None)

    if not menu_item_id or quantity is None:
        return jsonify({"msg": "menu_item_id and quantity are required"}), 400

    # Ensure the menu item exists
    menu_item = MenuItem.query.get(menu_item_id)
    if not menu_item:
        return jsonify({"msg": "Menu item not found"}), 404

    # Check if inventory item exists, otherwise create it
    inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
    if not inventory_item:
        inventory_item = InventoryItem(menu_item_id=menu_item_id)
        db.session.add(inventory_item)
        db.session.commit()  # Commit to get inventory_item.id for store stock

    # Update or create store stock
    if inventory_item.store_stock:
        inventory_item.store_stock.quantity += quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item.id, quantity=quantity)
        db.session.add(store_stock)

    # Create purchase log
    purchase = StockPurchase(
        inventory_item_id=inventory_item.id,
        quantity=quantity,
        unit_price=unit_price
    )
    db.session.add(purchase)
    db.session.commit()

    return jsonify({"msg": "Stock purchased successfully"}), 201

# --------------------- CREATE STOCK TRANSFER --------------------- #
@inventory_bp.route("/transfer", methods=["POST"])
@jwt_required()
def transfer_stock():
    """
    Transfer stock from store to station
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

    # Check store stock
    if not inventory_item.store_stock or inventory_item.store_stock.quantity < quantity:
        return jsonify({"msg": "Insufficient store stock"}), 400

    # Deduct from store
    inventory_item.store_stock.quantity -= quantity

    # Add to station stock
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

    # Log the transfer
    transfer = StockTransfer(
        inventory_item_id=inventory_item.id,
        station_id=station.id,
        quantity=quantity
    )
    db.session.add(transfer)
    db.session.commit()

    return jsonify({"msg": "Stock transferred successfully"}), 201

# --------------------- READ STOCK --------------------- #
@inventory_bp.route("/stock", methods=["GET"])
@jwt_required()
def view_stock():
    """
    View all store and station stock
    Optional query: ?station_id=1
    """
    station_id = request.args.get("station_id")
    result = []

    if station_id:
        station_stocks = StationStock.query.filter_by(station_id=station_id).all()
        for s in station_stocks:
            result.append({
                "menu_item": s.inventory_item.menu_item.name,
                "station": s.station.name,
                "quantity": s.quantity
            })
    else:
        store_stocks = StoreStock.query.all()
        for s in store_stocks:
            result.append({
                "menu_item": s.inventory_item.menu_item.name,
                "store_quantity": s.quantity
            })

    return jsonify(result), 200

# --------------------- UPDATE STOCK --------------------- #
@inventory_bp.route("/stock/update", methods=["PUT"])
@jwt_required()
def update_stock():
    """
    Update stock quantity manually
    Payload: { "menu_item_id": int, "station_id": int (optional), "quantity": float }
    """
    data = request.get_json()
    menu_item_id = data.get("menu_item_id")
    station_id = data.get("station_id")
    quantity = data.get("quantity")

    if not menu_item_id or quantity is None:
        return jsonify({"msg": "menu_item_id and quantity are required"}), 400

    inventory_item = InventoryItem.query.filter_by(menu_item_id=menu_item_id).first()
    if not inventory_item:
        return jsonify({"msg": "Inventory item not found"}), 404

    if station_id:  # Update station stock
        station_stock = StationStock.query.filter_by(
            inventory_item_id=inventory_item.id, station_id=station_id
        ).first()
        if not station_stock:
            return jsonify({"msg": "Station stock not found"}), 404
        station_stock.quantity = quantity
    else:  # Update store stock
        if not inventory_item.store_stock:
            return jsonify({"msg": "Store stock not found"}), 404
        inventory_item.store_stock.quantity = quantity

    db.session.commit()
    return jsonify({"msg": "Stock updated successfully"}), 200

# --------------------- DELETE PURCHASE --------------------- #
@inventory_bp.route("/purchase/<int:purchase_id>", methods=["DELETE"])
@jwt_required()
def delete_purchase(purchase_id):
    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    # Reduce store stock if exists
    if purchase.inventory_item.store_stock:
        purchase.inventory_item.store_stock.quantity -= purchase.quantity

    db.session.delete(purchase)
    db.session.commit()
    return jsonify({"msg": "Purchase deleted successfully"}), 200

# --------------------- DELETE TRANSFER --------------------- #
@inventory_bp.route("/transfer/<int:transfer_id>", methods=["DELETE"])
@jwt_required()
def delete_transfer(transfer_id):
    transfer = StockTransfer.query.get(transfer_id)
    if not transfer:
        return jsonify({"msg": "Transfer not found"}), 404

    # Reduce station stock if exists
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
            "menu_item": p.inventory_item.menu_item.name,
            "quantity": p.quantity,
            "unit_price": p.unit_price,
            "created_at": p.created_at.isoformat() if hasattr(p, "created_at") else None
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
            "menu_item": t.inventory_item.menu_item.name,
            "station": t.station.name,
            "quantity": t.quantity,
            "created_at": t.created_at.isoformat() if hasattr(t, "created_at") else None
        })
    return jsonify(result), 200
