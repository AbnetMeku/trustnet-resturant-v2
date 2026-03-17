from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StockPurchase
from app.services.inventory_service import update_store_snapshot_purchase
from app.utils.timezone import eat_now_naive
from app.services.cloud_sync import queue_cloud_sync_upsert

inventory_purchase_bp = Blueprint("inventory_purchase_bp", __name__, url_prefix="/inventory/purchases")


def _serialize_purchase(purchase):
    return {
        "id": purchase.id,
        "inventory_item_id": purchase.inventory_item_id,
        "inventory_item_name": purchase.inventory_item.name if purchase.inventory_item else None,
        "quantity": purchase.quantity,
        "unit_price": purchase.unit_price,
        "status": purchase.status,
        "created_at": purchase.created_at,
    }

# ============================================================
# 🧾 STOCK PURCHASE MANAGEMENT
# ============================================================

# --------------------- CREATE PURCHASE --------------------- #
@inventory_purchase_bp.route("/", methods=["POST"])
@jwt_required()
def create_stock_purchase():
    data = request.get_json()
    inventory_item_id = data.get("inventory_item_id")
    quantity = data.get("quantity", 0)
    unit_price = data.get("unit_price")

    if not inventory_item_id or quantity <= 0:
        return jsonify({"msg": "inventory_item_id and valid quantity are required"}), 400

    item = db.session.get(InventoryItem, inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    # Record purchase
    purchase = StockPurchase(
        inventory_item_id=inventory_item_id,
        quantity=quantity,
        unit_price=unit_price,
        status="Purchased",
        created_at=eat_now_naive(),
    )
    db.session.add(purchase)

    # Update or create store stock
    store_stock = StoreStock.query.filter_by(inventory_item_id=inventory_item_id).first()
    opening_quantity = float(store_stock.quantity or 0) if store_stock else 0.0
    if store_stock:
        store_stock.quantity += quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item_id, quantity=quantity)
        db.session.add(store_stock)

    update_store_snapshot_purchase(inventory_item_id, quantity, opening_quantity=opening_quantity)
    db.session.commit()
    queue_cloud_sync_upsert("stock_purchase", purchase)
    queue_cloud_sync_upsert("store_stock", store_stock)

    return jsonify({"msg": "Purchase recorded successfully", "purchase_id": purchase.id}), 201


# --------------------- GET ALL PURCHASES --------------------- #
@inventory_purchase_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_purchases():
    purchases = StockPurchase.query.order_by(StockPurchase.created_at.desc()).all()
    result = [_serialize_purchase(p) for p in purchases]
    return jsonify(result), 200


# --------------------- GET SINGLE PURCHASE --------------------- #
@inventory_purchase_bp.route("/<int:purchase_id>", methods=["GET"])
@jwt_required()
def get_single_purchase(purchase_id):
    purchase = db.session.get(StockPurchase, purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    return jsonify(_serialize_purchase(purchase)), 200


# --------------------- UPDATE PURCHASE --------------------- #
@inventory_purchase_bp.route("/<int:purchase_id>", methods=["PUT"])
@jwt_required()
def update_purchase(purchase_id):
    purchase = db.session.get(StockPurchase, purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404
    if purchase.status == "Deleted":
        return jsonify({"msg": "Deleted purchases cannot be edited"}), 400

    data = request.get_json() or {}
    new_quantity = data.get("quantity", purchase.quantity)
    new_unit_price = data.get("unit_price", purchase.unit_price)
    try:
        new_quantity = float(new_quantity)
    except (TypeError, ValueError):
        return jsonify({"msg": "Quantity must be a number"}), 400
    if new_quantity <= 0:
        return jsonify({"msg": "Quantity must be greater than zero"}), 400

    # Adjust store stock quantity difference
    stock = StoreStock.query.filter_by(inventory_item_id=purchase.inventory_item_id).first()
    if not stock:
        stock = StoreStock(inventory_item_id=purchase.inventory_item_id, quantity=0)
        db.session.add(stock)
        db.session.flush()

    quantity_diff = new_quantity - float(purchase.quantity or 0)
    updated_stock_quantity = float(stock.quantity or 0) + quantity_diff
    if updated_stock_quantity < 0:
        return jsonify({"msg": "Cannot reduce purchase below remaining store stock"}), 400
    opening_quantity = float(stock.quantity or 0)
    stock.quantity = updated_stock_quantity

    purchase.quantity = new_quantity
    purchase.unit_price = new_unit_price
    purchase.status = "Updated"
    update_store_snapshot_purchase(purchase.inventory_item_id, quantity_diff, opening_quantity=opening_quantity)
    db.session.commit()
    queue_cloud_sync_upsert("stock_purchase", purchase)
    queue_cloud_sync_upsert("store_stock", stock)

    return jsonify({"msg": "Purchase updated successfully"}), 200


# --------------------- DELETE PURCHASE --------------------- #
@inventory_purchase_bp.route("/<int:purchase_id>", methods=["DELETE"])
@jwt_required()
def delete_purchase(purchase_id):
    purchase = db.session.get(StockPurchase, purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404
    if purchase.status == "Deleted":
        return jsonify({"msg": "Purchase already deleted"}), 400

    # Adjust stock before deleting
    stock = StoreStock.query.filter_by(inventory_item_id=purchase.inventory_item_id).first()
    if not stock or float(stock.quantity or 0) < float(purchase.quantity or 0):
        return jsonify({"msg": "Cannot delete purchase because stock has already been used"}), 400

    opening_quantity = float(stock.quantity or 0)
    stock.quantity = float(stock.quantity or 0) - float(purchase.quantity or 0)

    purchase.status = "Deleted"
    update_store_snapshot_purchase(
        purchase.inventory_item_id,
        -float(purchase.quantity or 0),
        opening_quantity=opening_quantity,
    )
    db.session.commit()
    queue_cloud_sync_upsert("stock_purchase", purchase)
    queue_cloud_sync_upsert("store_stock", stock)

    return jsonify({"msg": "Purchase deleted and store stock adjusted"}), 200
