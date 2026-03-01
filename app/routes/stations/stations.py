# src/app/routes/stations.py
from flask import Blueprint, request, jsonify, abort
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models.models import Station
from app.utils.decorators import roles_required

stations_bp = Blueprint("stations_bp", __name__, url_prefix="/stations")


def station_to_dict(station: Station):
    return {
        "id": station.id,
        "name": station.name,
        "printer_identifier": station.printer_identifier,
        "print_mode": station.print_mode or "grouped",
        "cashier_printer": bool(station.cashier_printer),
        "pin": "****"  # never return plain PIN, frontend can enter for validation
    }


# ---- GET ALL STATIONS ----
@stations_bp.route("/", methods=["GET"])
@stations_bp.route("", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager")
def get_stations():
    stations = Station.query.all()
    return jsonify([station_to_dict(s) for s in stations]), 200


# ---- CREATE STATION ----
@stations_bp.route("/", methods=["POST"])
@stations_bp.route("", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_station():
    data = request.get_json() or {}
    name = data.get("name")
    password = data.get("password")  # the 4-digit PIN
    printer_identifier = data.get("printer_identifier")
    print_mode = (data.get("print_mode") or "grouped").strip().lower()
    cashier_printer = bool(data.get("cashier_printer", False))

    if not name or not password:
        abort(400, "Name and PIN are required")

    if len(password) != 4 or not password.isdigit():
        abort(400, "PIN must be exactly 4 digits")
    if print_mode not in {"grouped", "separate"}:
        abort(400, "print_mode must be 'grouped' or 'separate'")
    if cashier_printer and not printer_identifier:
        abort(400, "cashier_printer requires printer_identifier")

    if Station.query.filter_by(name=name).first():
        abort(400, "Station with this name already exists")

    # Check unique PIN
    existing_stations = Station.query.all()
    for s in existing_stations:
        if check_password_hash(s.password_hash, password):
            abort(400, "This PIN is already taken by another station")

    station = Station(
        name=name,
        password_hash=generate_password_hash(password),
        printer_identifier=printer_identifier,
        print_mode=print_mode,
        cashier_printer=cashier_printer,
    )
    db.session.add(station)
    db.session.flush()
    if cashier_printer:
        Station.query.filter(Station.id != station.id).update({"cashier_printer": False})
    db.session.commit()

    return jsonify(station_to_dict(station)), 201


# ---- GET SINGLE STATION ----
@stations_bp.route("/<int:station_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager")
def get_station(station_id):
    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")
    return jsonify(station_to_dict(station)), 200


# ---- UPDATE STATION ----
@stations_bp.route("/<int:station_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_station(station_id):
    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")

    data = request.get_json() or {}
    station.name = data.get("name", station.name)
    if "print_mode" in data:
        next_mode = (data.get("print_mode") or "").strip().lower()
        if next_mode not in {"grouped", "separate"}:
            abort(400, "print_mode must be 'grouped' or 'separate'")
        station.print_mode = next_mode
    if "password" in data:
        password = data["password"]
        if len(password) != 4 or not password.isdigit():
            abort(400, "PIN must be exactly 4 digits")
        # Ensure unique PIN
        existing_stations = Station.query.filter(Station.id != station.id).all()
        for s in existing_stations:
            if check_password_hash(s.password_hash, password):
                abort(400, "This PIN is already taken by another station")
        station.password_hash = generate_password_hash(password)

    station.printer_identifier = data.get("printer_identifier", station.printer_identifier)
    if "cashier_printer" in data:
        next_cashier = bool(data.get("cashier_printer"))
        if next_cashier and not station.printer_identifier:
            abort(400, "cashier_printer requires printer_identifier")
        station.cashier_printer = next_cashier
        if next_cashier:
            Station.query.filter(Station.id != station.id).update({"cashier_printer": False})
    db.session.commit()
    return jsonify(station_to_dict(station)), 200


# ---- DELETE STATION ----
@stations_bp.route("/<int:station_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_station(station_id):
    station = db.session.get(Station, station_id)
    if not station:
        abort(404, "Station not found")

    db.session.delete(station)
    db.session.commit()
    return jsonify({"message": "Station deleted"}), 200
