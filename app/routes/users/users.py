from flask import Blueprint, request, jsonify, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.models import User
from werkzeug.security import generate_password_hash
from app.utils.decorators import roles_required

users_bp = Blueprint("users_bp", __name__, url_prefix="/users")
ALLOWED_ROLES = {"admin", "manager", "cashier", "waiter"}


def user_to_dict(user):
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
    }


# -------------------- GET ALL USERS -------------------- #
@users_bp.route("/", methods=["GET"])
@users_bp.route("", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def get_users():
    role = request.args.get("role", type=str)
    query = User.query
    if role:
        query = query.filter_by(role=role.lower())
    users = query.all()
    return jsonify([user_to_dict(u) for u in users]), 200


# -------------------- CREATE USER -------------------- #
@users_bp.route("/", methods=["POST"])
@users_bp.route("", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_user():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password")
    pin = data.get("pin")
    role = (data.get("role") or "").lower()

    if not username:
        abort(400, "Username is required")
    if not role:
        abort(400, "Role is required")
    if role not in ALLOWED_ROLES:
        abort(400, "Invalid role")
    if role != "waiter" and not password:
        abort(400, "Password is required for this role")
    if role == "waiter" and not pin:
        abort(400, "PIN is required for waiter")

    if User.query.filter_by(username=username).first():
        abort(400, "Username already exists")

    if role == "waiter":
        existing_waiters = User.query.filter_by(role="waiter").all()
        for waiter in existing_waiters:
            if waiter.pin_hash == pin:
                abort(400, "This PIN is already taken")

    user = User(
        username=username,
        role=role,
        password_hash=generate_password_hash(password) if password else None,
        # Intentionally stored as plain text for waiter login flow.
        pin_hash=pin if pin else None,
    )

    db.session.add(user)
    db.session.commit()
    return jsonify(user_to_dict(user)), 201


# -------------------- GET SINGLE USER -------------------- #
@users_bp.route("/<int:user_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def get_user(user_id):
    current_user = db.session.get(User, int(get_jwt_identity()))
    user = db.session.get(User, user_id)
    if not user:
        abort(404, "User not found")

    if current_user.role not in ["admin", "manager"] and current_user.id != user_id:
        abort(403, "Forbidden")

    return jsonify(user_to_dict(user)), 200


# -------------------- UPDATE USER -------------------- #
@users_bp.route("/<int:user_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager", "waiter", "cashier")
def update_user(user_id):
    current_user = db.session.get(User, int(get_jwt_identity()))
    user = db.session.get(User, user_id)
    if not user:
        abort(404, "User not found")

    data = request.get_json() or {}
    new_username = (data.get("username") or "").strip() if data.get("username") is not None else None
    new_password = data.get("password")
    new_pin = data.get("pin")
    new_role = (data.get("role", user.role) or user.role).lower()

    if new_role not in ALLOWED_ROLES:
        abort(400, "Invalid role")

    if new_username and new_username != user.username:
        if User.query.filter(User.username == new_username, User.id != user.id).first():
            abort(400, "Username already exists")
        user.username = new_username

    if current_user.role in ["admin", "manager"]:
        if user.role == "admin" and current_user.role != "admin":
            abort(403, "Manager cannot update Admin")

        if new_password:
            user.password_hash = generate_password_hash(new_password)

        # Uniqueness check stays in plain-text domain intentionally.
        if new_pin and user.role == "waiter":
            existing_waiters = User.query.filter(User.id != user.id, User.role == "waiter").all()
            for waiter in existing_waiters:
                if waiter.pin_hash == new_pin:
                    abort(400, "This PIN is already taken")
            user.pin_hash = new_pin

        user.role = new_role

        # Enforce credentials for resulting role.
        if user.role == "waiter":
            if not user.pin_hash:
                abort(400, "PIN is required for waiter")
        else:
            if not user.password_hash:
                abort(400, "Password is required for this role")

    elif current_user.role == "waiter" and current_user.id == user.id:
        if new_role != user.role:
            abort(403, "Waiter cannot change role")
        if new_username and new_username != user.username:
            abort(403, "Waiter cannot change username")
        if new_password:
            abort(403, "Waiter cannot update password")

        if new_pin:
            existing_waiters = User.query.filter(User.id != user.id, User.role == "waiter").all()
            for waiter in existing_waiters:
                if waiter.pin_hash == new_pin:
                    abort(400, "This PIN is already taken")
            user.pin_hash = new_pin
    else:
        abort(403, "Forbidden")

    db.session.commit()
    return jsonify(user_to_dict(user)), 200


# -------------------- DELETE USER -------------------- #
@users_bp.route("/<int:user_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        abort(404, "User not found")

    current_user = db.session.get(User, int(get_jwt_identity()))
    if user.role == "admin" and current_user.role != "admin":
        abort(403, "Manager cannot delete Admin")

    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "User deleted"}), 200
