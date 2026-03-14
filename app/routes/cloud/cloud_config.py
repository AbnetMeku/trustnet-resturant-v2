from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.models import CloudLicenseState
from app.services.cloud_sync import _ensure_instance_config
from app.utils.decorators import roles_required

cloud_bp = Blueprint("cloud_bp", __name__, url_prefix="/cloud")


def _serialize_config(cfg):
    return {
        "tenant_id": cfg.tenant_id,
        "store_id": cfg.store_id,
        "device_id": cfg.device_id,
        "device_name": cfg.device_name,
        "machine_fingerprint": cfg.machine_fingerprint,
        "cloud_base_url": cfg.cloud_base_url,
        "license_key": cfg.license_key,
    }


@cloud_bp.route("/config", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager")
def get_cloud_config():
    cfg = _ensure_instance_config()
    return jsonify(_serialize_config(cfg)), 200


@cloud_bp.route("/config", methods=["PUT"])
@jwt_required()
@roles_required("admin", "manager")
def update_cloud_config():
    data = request.get_json(silent=True) or {}

    if "license_key" not in data:
        return jsonify({"error": "license_key is required"}), 400

    license_key = (data.get("license_key") or "").strip() or None
    cfg = _ensure_instance_config()
    previous_key = cfg.license_key
    cfg.license_key = license_key
    db.session.commit()

    if license_key != previous_key:
        state = db.session.get(CloudLicenseState, 1)
        if state:
            state.status = "unknown"
            state.is_valid = False
            state.activated_at = None
            state.last_validated_at = None
            state.expires_at = None
            state.grace_until = None
            state.last_error = None
            db.session.commit()

    return jsonify(_serialize_config(cfg)), 200
