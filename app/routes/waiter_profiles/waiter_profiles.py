from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models import Station, User, WaiterProfile
from app.services.waiter_profiles import auto_assign_tables_for_waiter
from app.utils.decorators import roles_required

waiter_profiles_bp = Blueprint("waiter_profiles_bp", __name__, url_prefix="/waiter-profiles")


def _profile_to_dict(profile: WaiterProfile) -> dict:
    return {
        "id": profile.id,
        "name": profile.name,
        "max_tables": int(profile.max_tables),
        "allow_vip": bool(profile.allow_vip),
        "stations": [{"id": station.id, "name": station.name} for station in profile.stations],
        "waiter_count": len(profile.waiters),
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def _validate_profile_payload(data: dict, is_update: bool = False) -> tuple[dict, str | None]:
    payload = {}

    if not is_update or "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return {}, "name is required"
        if len(name) > 80:
            return {}, "name must be 80 characters or fewer"
        payload["name"] = name

    if not is_update or "max_tables" in data:
        max_tables = data.get("max_tables")
        if not isinstance(max_tables, int) or max_tables < 0:
            return {}, "max_tables must be a non-negative integer"
        payload["max_tables"] = max_tables

    if not is_update or "allow_vip" in data:
        allow_vip = data.get("allow_vip")
        if not isinstance(allow_vip, bool):
            return {}, "allow_vip must be a boolean"
        payload["allow_vip"] = allow_vip

    if "station_ids" in data:
        station_ids = data.get("station_ids")
        if not isinstance(station_ids, list) or any(not isinstance(value, int) for value in station_ids):
            return {}, "station_ids must be a list of integers"
        payload["station_ids"] = station_ids

    return payload, None


@waiter_profiles_bp.route("/", methods=["GET"])
@waiter_profiles_bp.route("", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager")
def list_waiter_profiles():
    profiles = WaiterProfile.query.order_by(WaiterProfile.name.asc()).all()
    return jsonify([_profile_to_dict(profile) for profile in profiles]), 200


@waiter_profiles_bp.route("/", methods=["POST"])
@waiter_profiles_bp.route("", methods=["POST"])
@jwt_required()
@roles_required("admin", "manager")
def create_waiter_profile():
    data = request.get_json() or {}
    payload, error = _validate_profile_payload(data, is_update=False)
    if error:
        return jsonify({"error": error}), 400

    existing = WaiterProfile.query.filter(db.func.lower(WaiterProfile.name) == payload["name"].lower()).first()
    if existing:
        return jsonify({"error": "Profile name already exists"}), 400

    profile = WaiterProfile(
        name=payload["name"],
        max_tables=payload["max_tables"],
        allow_vip=payload["allow_vip"],
    )

    station_ids = payload.get("station_ids", [])
    if station_ids:
        stations = Station.query.filter(Station.id.in_(station_ids)).all()
        if len(stations) != len(set(station_ids)):
            return jsonify({"error": "One or more station_ids are invalid"}), 400
        profile.stations = stations

    db.session.add(profile)
    db.session.commit()
    return jsonify(_profile_to_dict(profile)), 201


@waiter_profiles_bp.route("/<int:profile_id>", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager")
def get_waiter_profile(profile_id: int):
    profile = db.session.get(WaiterProfile, profile_id)
    if not profile:
        return jsonify({"error": "Profile not found"}), 404
    return jsonify(_profile_to_dict(profile)), 200


@waiter_profiles_bp.route("/<int:profile_id>", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_waiter_profile(profile_id: int):
    profile = db.session.get(WaiterProfile, profile_id)
    if not profile:
        return jsonify({"error": "Profile not found"}), 404

    data = request.get_json() or {}
    payload, error = _validate_profile_payload(data, is_update=True)
    if error:
        return jsonify({"error": error}), 400

    if "name" in payload:
        existing = (
            WaiterProfile.query.filter(db.func.lower(WaiterProfile.name) == payload["name"].lower())
            .filter(WaiterProfile.id != profile.id)
            .first()
        )
        if existing:
            return jsonify({"error": "Profile name already exists"}), 400
        profile.name = payload["name"]

    if "max_tables" in payload:
        profile.max_tables = payload["max_tables"]
    if "allow_vip" in payload:
        profile.allow_vip = payload["allow_vip"]

    if "station_ids" in payload:
        station_ids = payload["station_ids"]
        if station_ids:
            stations = Station.query.filter(Station.id.in_(station_ids)).all()
            if len(stations) != len(set(station_ids)):
                return jsonify({"error": "One or more station_ids are invalid"}), 400
            profile.stations = stations
        else:
            profile.stations = []

    if data.get("reassign_tables_for_waiters") is True:
        for waiter in profile.waiters:
            auto_assign_tables_for_waiter(waiter, replace_existing=True)

    db.session.commit()
    return jsonify(_profile_to_dict(profile)), 200


@waiter_profiles_bp.route("/<int:profile_id>", methods=["DELETE"])
@jwt_required()
@roles_required("admin", "manager")
def delete_waiter_profile(profile_id: int):
    profile = db.session.get(WaiterProfile, profile_id)
    if not profile:
        return jsonify({"error": "Profile not found"}), 404

    for waiter in profile.waiters:
        waiter.waiter_profile = None

    db.session.delete(profile)
    db.session.commit()
    return jsonify({"message": "Profile deleted"}), 200

