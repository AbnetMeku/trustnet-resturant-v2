from flask import Blueprint, request, jsonify, abort
from werkzeug.security import check_password_hash
from flask_jwt_extended import create_access_token
from app.models.models import Station, db

stations_auth_bp = Blueprint("stations_auth_bp", __name__, url_prefix="/stations/auth")

# ---- LOGIN STATION ----
@stations_auth_bp.route("/login", methods=["POST"])
def login_station():
    data = request.get_json() or {}
    name = data.get("name")
    password = data.get("password")

    if not name or not password:
        abort(400, "Name and password are required.")

    station = Station.query.filter_by(name=name).first()
    if not station or not check_password_hash(station.password_hash, password):
        abort(401, "Invalid station name or password.")

    access_token = create_access_token(identity=station.id)
    return jsonify({"access_token": access_token, "station": station.name}), 200
