from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, StoreStock, StockPurchase
from app.utils.timezone import eat_now_naive

inventory_purchase_bp = Blueprint("inventory_purchase_bp", __name__, url_prefix="/inventory/purchases")

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

    item = InventoryItem.query.get(inventory_item_id)
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
    if store_stock:
        store_stock.quantity += quantity
    else:
        store_stock = StoreStock(inventory_item_id=inventory_item_id, quantity=quantity)
        db.session.add(store_stock)

    db.session.commit()

    return jsonify({"msg": "Purchase recorded successfully", "purchase_id": purchase.id}), 201


# --------------------- GET ALL PURCHASES --------------------- #
@inventory_purchase_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_purchases():
    purchases = StockPurchase.query.order_by(StockPurchase.created_at.desc()).all()
    result = [
        {
            "id": p.id,
            "inventory_item_id": p.inventory_item_id,
            "inventory_item_name": p.inventory_item.name if p.inventory_item else None,
            "quantity": p.quantity,
            "unit_price": p.unit_price,
            "status": p.status,
            "created_at": p.created_at,
        }
        for p in purchases
    ]
    return jsonify(result), 200


# --------------------- GET SINGLE PURCHASE --------------------- #
@inventory_purchase_bp.route("/<int:purchase_id>", methods=["GET"])
@jwt_required()
def get_single_purchase(purchase_id):
    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    result = {
        "id": purchase.id,
        "inventory_item_id": purchase.inventory_item_id,
        "inventory_item_name": purchase.inventory_item.name if purchase.inventory_item else None,
        "quantity": purchase.quantity,
        "unit_price": purchase.unit_price,
        "status": purchase.status,
        "created_at": purchase.created_at,
    }
    return jsonify(result), 200


# --------------------- UPDATE PURCHASE --------------------- #
@inventory_purchase_bp.route("/<int:purchase_id>", methods=["PUT"])
@jwt_required()
def update_purchase(purchase_id):
    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    data = request.get_json()
    new_quantity = data.get("quantity", purchase.quantity)
    new_unit_price = data.get("unit_price", purchase.unit_price)

    # Adjust store stock quantity difference
    stock = StoreStock.query.filter_by(inventory_item_id=purchase.inventory_item_id).first()
    if stock:
        quantity_diff = new_quantity - purchase.quantity
        stock.quantity += quantity_diff

    purchase.quantity = new_quantity
    purchase.unit_price = new_unit_price
    purchase.status = "Updated"
    db.session.commit()

    return jsonify({"msg": "Purchase updated successfully"}), 200


# --------------------- DELETE PURCHASE --------------------- #
@inventory_purchase_bp.route("/<int:purchase_id>", methods=["DELETE"])
@jwt_required()
def delete_purchase(purchase_id):
    purchase = StockPurchase.query.get(purchase_id)
    if not purchase:
        return jsonify({"msg": "Purchase not found"}), 404

    # Adjust stock before deleting
    stock = StoreStock.query.filter_by(inventory_item_id=purchase.inventory_item_id).first()
    if stock and stock.quantity >= purchase.quantity:
        stock.quantity -= purchase.quantity

    purchase.status = "Deleted"
    db.session.delete(purchase)
    db.session.commit()

    return jsonify({"msg": "Purchase deleted and store stock adjusted"}), 200
