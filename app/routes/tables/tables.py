from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import Table, User
from app.utils.decorators import roles_required

tables_bp = Blueprint("tables_bp", __name__, url_prefix="/tables")

def table_to_dict(table):
    """Convert Table model to dict including assigned waiters info."""
    return {
        "id": table.id,
        "number": table.number,
        "status": table.status,
        "is_vip": table.is_vip,
        "waiters": [{"id": w.id, "username": w.username} for w in table.waiters]
    }

# ---- GET ALL TABLES ----
@tables_bp.route("/", methods=["GET"])
@tables_bp.route("", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def get_tables():
    tables = Table.query.all()
    return jsonify([table_to_dict(t) for t in tables]), 200

# ---- CREATE TABLE ----
@tables_bp.route("/", methods=["POST"])
@tables_bp.route("", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_table():
    data = request.get_json()
    number = data.get("number")
    status = data.get("status", "available")
    is_vip = data.get("is_vip", False)
    waiter_ids = data.get("waiter_ids", [])

    if not number:
        abort(400, "Table number is required")
    if Table.query.filter_by(number=number).first():
        abort(400, "Table number already exists")

    table = Table(number=number, status=status, is_vip=is_vip)

    if waiter_ids:
        waiters = User.query.filter(User.id.in_(waiter_ids), User.role=="waiter").all()
        table.waiters = waiters

    db.session.add(table)
    db.session.commit()
    return jsonify(table_to_dict(table)), 201

# ---- GET SINGLE TABLE ----
@tables_bp.route("/<int:table_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def get_table(table_id):
    table = db.session.get(Table, table_id)
    if not table:
        abort(404)
    return jsonify(table_to_dict(table)), 200

# ---- UPDATE TABLE ----
@tables_bp.route("/<int:table_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_table(table_id):
    table = db.session.get(Table, table_id)
    if not table:
        abort(404)
    data = request.get_json()
    table.number = data.get("number", table.number)
    table.status = data.get("status", table.status)
    table.is_vip = data.get("is_vip", table.is_vip)

    waiter_ids = data.get("waiter_ids")
    if waiter_ids is not None:
        waiters = User.query.filter(User.id.in_(waiter_ids), User.role=="waiter").all()
        table.waiters = waiters

    db.session.commit()
    return jsonify(table_to_dict(table)), 200

# ---- DELETE TABLE ----
@tables_bp.route("/<int:table_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_table(table_id):
    table = db.session.get(Table, table_id)
    if not table:
        abort(404)
    db.session.delete(table)
    db.session.commit()
    return jsonify({"message": "Table deleted"}), 200
