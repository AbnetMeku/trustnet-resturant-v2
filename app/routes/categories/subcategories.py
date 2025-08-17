# app/routes/subcategories.py
from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import SubCategory, Category
from app.utils.decorators import roles_required

subcategories_bp = Blueprint("subcategories_bp", __name__, url_prefix="/subcategories")

# Helper to serialize subcategory
def subcategory_to_dict(sc):
    return {
        "id": sc.id,
        "name": sc.name,
        "category_id": sc.category_id,
        "category_name": sc.category.name if sc.category else None,
    }

# ------------------ GET ALL SUBCATEGORIES ------------------
@subcategories_bp.route("/", methods=["GET"])
@jwt_required()
def get_subcategories():
    subcategories = SubCategory.query.all()
    return jsonify([subcategory_to_dict(sc) for sc in subcategories])

# ------------------ GET SUBCATEGORY BY ID ------------------
@subcategories_bp.route("/<int:sub_id>", methods=["GET"])
@jwt_required()
def get_subcategory(sub_id):
    subcategory = db.session.get(SubCategory, sub_id)
    if not subcategory:
        abort(404, "Subcategory not found")
    return jsonify(subcategory_to_dict(subcategory))


# ------------------ CREATE SUBCATEGORY ------------------
@subcategories_bp.route("/", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_subcategory():
    data = request.get_json()
    name = data.get("name")
    category_id = data.get("category_id")

    if not all([name, category_id]):
        abort(400, "Missing subcategory name or category_id")

    if not Category.query.get(category_id):
        abort(400, "Category does not exist")

    if SubCategory.query.filter_by(name=name, category_id=category_id).first():
        abort(400, "Subcategory already exists in this category")

    subcategory = SubCategory(name=name, category_id=category_id)
    db.session.add(subcategory)
    db.session.commit()
    return jsonify(subcategory_to_dict(subcategory)), 201

# ------------------ UPDATE SUBCATEGORY ------------------
@subcategories_bp.route("/<int:sub_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_subcategory(sub_id):
    subcategory = db.session.get(SubCategory, sub_id)
    if not subcategory:
        abort(404, "Subcategory not found")

    data = request.get_json()
    name = data.get("name")
    category_id = data.get("category_id")

    if name:
        subcategory.name = name
    if category_id:
        if not Category.query.get(category_id):
            abort(400, "Category does not exist")
        subcategory.category_id = category_id

    db.session.commit()
    return jsonify(subcategory_to_dict(subcategory))

# ------------------ DELETE SUBCATEGORY ------------------
@subcategories_bp.route("/<int:sub_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_subcategory(sub_id):
    subcategory = db.session.get(SubCategory, sub_id)
    if not subcategory:
        abort(404, "Subcategory not found")
    db.session.delete(subcategory)
    db.session.commit()
    return jsonify({"message": "Subcategory deleted"})
