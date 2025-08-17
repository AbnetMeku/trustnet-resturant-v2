# app/routes/categories.py
from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import Category, SubCategory
from app.utils.decorators import roles_required

categories_bp = Blueprint("categories_bp", __name__, url_prefix="/categories")

# Helper to serialize category
def category_to_dict(cat):
    return {
        "id": cat.id,
        "name": cat.name,
        "subcategories": [{"id": sc.id, "name": sc.name} for sc in cat.subcategories],
    }

# ------------------ GET ALL CATEGORIES ------------------
@categories_bp.route("/", methods=["GET"])
@jwt_required()
def get_categories():
    categories = Category.query.all()
    return jsonify([category_to_dict(c) for c in categories])


# ------------------ GET CATEGORY BY ID ------------------
@categories_bp.route("/<int:cat_id>", methods=["GET"])
@jwt_required()
def get_category(cat_id):
    category = db.session.get(Category, cat_id)
    if not category:
        abort(404, "Category not found")
    return jsonify(category_to_dict(category))

# ------------------ CREATE CATEGORY ------------------
@categories_bp.route("/", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_category():
    data = request.get_json()
    name = data.get("name")
    if not name:
        abort(400, "Missing category name")

    if Category.query.filter_by(name=name).first():
        abort(400, "Category already exists")

    category = Category(name=name)
    db.session.add(category)
    db.session.commit()
    return jsonify(category_to_dict(category)), 201

# ------------------ UPDATE CATEGORY ------------------
@categories_bp.route("/<int:cat_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_category(cat_id):
    category = db.session.get(Category, cat_id)
    if not category:
        abort(404, "Category not found")

    data = request.get_json()
    name = data.get("name")
    if name:
        category.name = name

    db.session.commit()
    return jsonify(category_to_dict(category))

# ------------------ DELETE CATEGORY ------------------
@categories_bp.route("/<int:cat_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_category(cat_id):
    category = db.session.get(Category, cat_id)
    if not category:
        abort(404, "Category not found")
    db.session.delete(category)
    db.session.commit()
    return jsonify({"message": "Category deleted"})
