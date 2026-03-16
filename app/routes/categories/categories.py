from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import Category
from app.utils.decorators import roles_required
from app.services.cloud_sync import queue_cloud_sync_delete
from decimal import Decimal

categories_bp = Blueprint("categories_bp", __name__, url_prefix="/categories")

ALLOWED_QUANTITY_STEPS = {Decimal("0.5"), Decimal("1.0")}

# ------------------ Helper ------------------
def category_to_dict(cat):
    return {
        "id": cat.id,
        "name": cat.name,
        "quantity_step": float(cat.quantity_step) if cat.quantity_step is not None else 1.0,
        "subcategories": [{"id": sc.id, "name": sc.name} for sc in cat.subcategories],
    }

# ------------------ Preflight ------------------
@categories_bp.route("", methods=["OPTIONS"])
@categories_bp.route("/", methods=["OPTIONS"])
@categories_bp.route("/<int:cat_id>", methods=["OPTIONS"])
def categories_options(cat_id=None):
    return jsonify({"status": "ok"}), 200

# ------------------ GET ALL ------------------
@categories_bp.route("", methods=["GET", "OPTIONS"])
@categories_bp.route("/", methods=["GET", "OPTIONS"])
@jwt_required()
def get_categories():
    categories = Category.query.all()
    return jsonify([category_to_dict(c) for c in categories]), 200

# ------------------ GET BY ID ------------------
@categories_bp.route("/<int:cat_id>", methods=["GET", "OPTIONS"])
@jwt_required()
def get_category(cat_id):
    category = db.session.get(Category, cat_id)
    if not category:
        return jsonify({"error": "Category not found"}), 404
    return jsonify(category_to_dict(category)), 200

# ------------------ CREATE ------------------
@categories_bp.route("", methods=["POST", "OPTIONS"])
@categories_bp.route("/", methods=["POST", "OPTIONS"])
@jwt_required()
@roles_required("admin", "manager")
def create_category():
    data = request.get_json() or {}
    name = data.get("name")
    quantity_step = data.get("quantity_step", 1.0)

    if not name:
        return jsonify({"error": "Missing category name"}), 400

    if not isinstance(quantity_step, (int, float, Decimal)):
        return jsonify({"error": "quantity_step must be a number"}), 400

    quantity_step = Decimal(str(quantity_step))
    if quantity_step not in ALLOWED_QUANTITY_STEPS:
        return jsonify({"error": "quantity_step must be 0.5 or 1.0"}), 400

    if Category.query.filter_by(name=name).first():
        return jsonify({"error": "Category already exists"}), 400

    category = Category(name=name, quantity_step=quantity_step)
    db.session.add(category)
    db.session.commit()
    return jsonify(category_to_dict(category)), 201

# ------------------ UPDATE ------------------
@categories_bp.route("/<int:cat_id>", methods=["PUT", "OPTIONS"])
@jwt_required()
@roles_required("admin", "manager")
def update_category(cat_id):
    category = db.session.get(Category, cat_id)
    if not category:
        return jsonify({"error": "Category not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        category.name = data["name"]
    if "quantity_step" in data:
        quantity_step = data["quantity_step"]
        if not isinstance(quantity_step, (int, float, Decimal)):
            return jsonify({"error": "quantity_step must be a number"}), 400
        quantity_step = Decimal(str(quantity_step))
        if quantity_step not in ALLOWED_QUANTITY_STEPS:
            return jsonify({"error": "quantity_step must be 0.5 or 1.0"}), 400
        category.quantity_step = quantity_step

    db.session.commit()
    return jsonify(category_to_dict(category)), 200

# ------------------ DELETE ------------------
@categories_bp.route("/<int:cat_id>", methods=["DELETE", "OPTIONS"])
@jwt_required()
@roles_required("admin", "manager")
def delete_category(cat_id):
    category = db.session.get(Category, cat_id)
    if not category:
        return jsonify({"error": "Category not found"}), 404

    # ✅ Block delete if subcategories exist
    if category.subcategories and len(category.subcategories) > 0:
        return jsonify({"error": "Cannot delete category because it has subcategories."}), 400

    db.session.delete(category)
    queue_cloud_sync_delete("category", cat_id)
    db.session.commit()
    return jsonify({"message": "Category deleted successfully"}), 200
