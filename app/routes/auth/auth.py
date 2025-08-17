from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash
from app.models.models import User, Station
from app.extensions import jwt
from flask_jwt_extended import create_access_token
from datetime import timedelta

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


# ----------------- Username/Password Login ----------------- #
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"msg": "Missing username or password"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
        return jsonify({"msg": "Invalid username or password"}), 401

    role_expiry_map = {
        "admin": timedelta(hours=24),
        "manager": timedelta(hours=24),
        "cashier": timedelta(hours=12),
    }
    expires = role_expiry_map.get(user.role, timedelta(hours=1))

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
        expires_delta=expires
    )
    return jsonify(access_token=access_token, user={"id": user.id, "name": user.name, "role": user.role})


# ----------------- Waiter PIN Login ----------------- #
@auth_bp.route('/pin/waiter', methods=['POST'])
def login_waiter_pin():
    data = request.get_json()
    pin = data.get('pin')
    if not pin:
        return jsonify({"msg": "Missing PIN"}), 400

    user = User.query.filter_by(role='waiter').all()
    user = next((u for u in user if u.pin_hash and check_password_hash(u.pin_hash, pin)), None)

    if not user:
        return jsonify({"msg": "Invalid PIN"}), 401

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
        expires_delta=timedelta(hours=1)
    )
    return jsonify(access_token=access_token, user={"id": user.id, "name": user.name, "role": user.role})


# ----------------- Station PIN Login ----------------- #
@auth_bp.route('/pin/station', methods=['POST'])
def login_station_pin():
    data = request.get_json()
    pin = data.get('pin')
    if not pin:
        return jsonify({"msg": "Missing PIN"}), 400

    stations = Station.query.all()
    station = next((s for s in stations if s.password_hash and check_password_hash(s.password_hash, pin)), None)

    if not station:
        return jsonify({"msg": "Invalid PIN"}), 401

    access_token = create_access_token(
        identity=str(station.id),
        additional_claims={"role": "station"},
        expires_delta=timedelta(hours=12)
    )
    return jsonify(access_token=access_token, station={"id": station.id, "name": station.name, "role": "station"})
