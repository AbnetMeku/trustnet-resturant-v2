import json
from flask import Blueprint, request, jsonify, abort, current_app
from sqlalchemy import text
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app.extensions import db
from app.models.models import Table, TableNumberCounter, User, waiter_table_assoc
from app.services.cloud_sync import _timestamp_suffix, queue_cloud_sync_upsert
from app.utils.timezone import eat_now_naive
from app.services.waiter_profiles import waiter_can_access_table
from app.services.table_numbers import ensure_table_number_counter
from app.utils.decorators import roles_required
from app.utils.decorators import extract_roles_from_claims

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


def allocate_table_number(requested_number: str | None) -> str:
    ensure_table_number_counter()
    counter = db.session.get(TableNumberCounter, 1)
    if not counter:
        counter = TableNumberCounter(id=1, last_number=0)
        db.session.add(counter)
        db.session.flush()

    if requested_number is None or str(requested_number).strip() == "":
        counter.last_number += 1
        return str(counter.last_number)

    candidate = str(requested_number).strip()
    if not candidate.isdigit() or int(candidate) <= 0:
        abort(400, "Table number must be a positive integer")

    numeric_candidate = int(candidate)
    if numeric_candidate <= counter.last_number:
        abort(400, f"Table number must continue from the last number ({counter.last_number})")
    if Table.query.filter_by(number=str(numeric_candidate)).first():
        abort(400, "Table number already exists")

    counter.last_number = numeric_candidate
    return str(numeric_candidate)

# ---- GET ALL TABLES ----
@tables_bp.route("/", methods=["GET"])
@tables_bp.route("", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def get_tables():
    jwt_data = get_jwt()
    roles = extract_roles_from_claims(jwt_data)

    if "waiter" in roles:
        user = db.session.get(User, int(get_jwt_identity()))
        tables = [
            table
            for table in user.tables
            if waiter_can_access_table(user, table) and table.status != "deleted"
        ]
    else:
        tables = Table.query.filter(Table.status != "deleted").all()
    return jsonify([table_to_dict(t) for t in tables]), 200

# ---- CREATE TABLE ----
@tables_bp.route("/", methods=["POST"])
@tables_bp.route("", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_table():
    data = request.get_json() or {}
    status = data.get("status", "available")
    is_vip = data.get("is_vip", False)
    waiter_ids = data.get("waiter_ids", [])
    requested_number = data.get("number")

    number = allocate_table_number(requested_number)

    table = Table(number=number, status=status, is_vip=is_vip)

    if waiter_ids:
        waiters = User.query.filter(User.id.in_(waiter_ids), User.role=="waiter").all()
        table.waiters = waiters

    db.session.add(table)
    db.session.commit()
    queue_cloud_sync_upsert("table", table)
    return jsonify(table_to_dict(table)), 201

# ---- GET SINGLE TABLE ----
@tables_bp.route("/<int:table_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter")
def get_table(table_id):
    table = db.session.get(Table, table_id)
    if not table:
        abort(404)

    jwt_data = get_jwt()
    roles = extract_roles_from_claims(jwt_data)
    if "waiter" in roles:
        user = db.session.get(User, int(get_jwt_identity()))
        if not waiter_can_access_table(user, table):
            abort(403, "You are not allowed to access this table")

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
    table.status = data.get("status", table.status)
    table.is_vip = data.get("is_vip", table.is_vip)

    waiter_ids = data.get("waiter_ids")
    if waiter_ids is not None:
        waiters = User.query.filter(User.id.in_(waiter_ids), User.role=="waiter").all()
        table.waiters = waiters

    db.session.commit()
    queue_cloud_sync_upsert("table", table)
    return jsonify(table_to_dict(table)), 200

# ---- DELETE TABLE ----
@tables_bp.route("/<int:table_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_table(table_id):
    if current_app.config.get("TESTING"):
        table = db.session.get(Table, table_id)
        if not table:
            abort(404)
        db.session.delete(table)
        db.session.commit()
        return jsonify({"message": "Table deleted"}), 200
    # Use a direct transaction to avoid ORM side effects on orders.
    now = eat_now_naive()
    payload = {"id": table_id}
    event_id = f"table-{table_id}-delete-{_timestamp_suffix(now)}"
    with db.engine.begin() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM tables WHERE id = :table_id"),
            {"table_id": table_id},
        ).scalar()
        if not exists:
            abort(404)
        # Soft-delete to preserve order history that references this table.
        conn.execute(
            text("DELETE FROM waiter_table_assoc WHERE table_id = :table_id"),
            {"table_id": table_id},
        )
        conn.execute(
            text("UPDATE tables SET status = 'deleted' WHERE id = :table_id"),
            {"table_id": table_id},
        )
        conn.execute(
            text(
                """
                INSERT INTO cloud_sync_outbox
                    (event_id, entity_type, entity_id, operation, payload, status, retry_count, created_at, updated_at)
                VALUES
                    (:event_id, 'table', :entity_id, 'delete', CAST(:payload AS JSON), 'pending', 0, :now, :now)
                ON CONFLICT (event_id)
                DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "event_id": event_id,
                "entity_id": str(table_id),
                "payload": json.dumps(payload),
                "now": now,
            },
        )
    return jsonify({"message": "Table deleted"}), 200
