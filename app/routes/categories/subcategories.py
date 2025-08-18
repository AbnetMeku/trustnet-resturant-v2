from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import SubCategory, Category
from app.utils.decorators import roles_required

subcategories_bp = Blueprint("subcategories_bp", __name__, url_prefix="/subcategories")

# Helper
def subcategory_to_dict(sc):
    return {
        "id": sc.id,
        "name": sc.name,
        "category_id": sc.category_id,
        "category_name": sc.category.name if sc.category else None,
    }

# Preflight
@subcategories_bp.route("", methods=["OPTIONS"])
@subcategories_bp.route("/", methods=["OPTIONS"])
@subcategories_bp.route("/<int:sc_id>", methods=["OPTIONS"])
def subcategories_options(sc_id=None):
    return jsonify({"status": "ok"}), 200

# GET ALL
@subcategories_bp.route("", methods=["GET", "OPTIONS"])
@subcategories_bp.route("/", methods=["GET", "OPTIONS"])
@jwt_required()
def get_subcategories():
    subcategories = SubCategory.query.all()
    return jsonify([subcategory_to_dict(sc) for sc in subcategories]), 200

# GET BY ID
@subcategories_bp.route("/<int:sc_id>", methods=["GET", "OPTIONS"])
@jwt_required()
def get_subcategory(sc_id):
    sc = db.session.get(SubCategory, sc_id)
    if not sc:
        return jsonify({"error": "Subcategory not found"}), 404
    return jsonify(subcategory_to_dict(sc)), 200

# CREATE
@subcategories_bp.route("", methods=["POST", "OPTIONS"])
@subcategories_bp.route("/", methods=["POST", "OPTIONS"])
@jwt_required()
@roles_required("admin", "manager")
def create_subcategory():
    data = request.get_json() or {}
    name = data.get("name")
    category_id = data.get("category_id")

    if not name or not category_id:
        return jsonify({"error": "Name and category_id required"}), 400

    category = db.session.get(Category, category_id)
    if not category:
        return jsonify({"error": "Category not found"}), 400

    if SubCategory.query.filter_by(name=name, category_id=category_id).first():
        return jsonify({"error": "Subcategory already exists in this category"}), 400

    sc = SubCategory(name=name, category_id=category_id)
    db.session.add(sc)
    db.session.commit()
    return jsonify(subcategory_to_dict(sc)), 201

# UPDATE
@subcategories_bp.route("/<int:sc_id>", methods=["PUT", "OPTIONS"])
@jwt_required()
@roles_required("admin", "manager")
def update_subcategory(sc_id):
    sc = db.session.get(SubCategory, sc_id)
    if not sc:
        return jsonify({"error": "Subcategory not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        sc.name = data["name"]
    if "category_id" in data:
        category = db.session.get(Category, data["category_id"])
        if not category:
            return jsonify({"error": "Category not found"}), 400
        sc.category_id = category.id

    db.session.commit()
    return jsonify(subcategory_to_dict(sc)), 200

# DELETE
@subcategories_bp.route("/<int:sc_id>", methods=["DELETE", "OPTIONS"])
@jwt_required()
@roles_required("admin", "manager")
def delete_subcategory(sc_id):
    sc = db.session.get(SubCategory, sc_id)
    if not sc:
        return jsonify({"error": "Subcategory not found"}), 404
    db.session.delete(sc)
    db.session.commit()
    return jsonify({"message": "Subcategory deleted"}), 200
