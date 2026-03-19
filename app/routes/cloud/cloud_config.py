from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models.models import (
    BrandingSettings,
    Category,
    CloudLicenseState,
    CloudSyncOutbox,
    CloudSyncState,
    MenuItem,
    Station,
    SubCategory,
    Table,
    User,
    WaiterProfile,
)
from app.models.inventory_models import InventoryItem
from app.services.cloud_sync import _ensure_instance_config
from app.utils.decorators import roles_required
from app.utils.timezone import eat_now_naive

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

def _serialize_license_state(state):
    if not state:
        return {
            "license_status": "unknown",
            "license_is_valid": False,
            "license_active": False,
            "license_last_validated_at": None,
            "license_expires_at": None,
            "license_grace_until": None,
            "license_last_error": None,
        }

    now = eat_now_naive()
    in_grace = bool(state.grace_until and now <= state.grace_until)
    active = bool(state.is_valid or in_grace)

    return {
        "license_status": state.status,
        "license_is_valid": bool(state.is_valid),
        "license_active": active,
        "license_last_validated_at": state.last_validated_at.isoformat() if state.last_validated_at else None,
        "license_expires_at": state.expires_at.isoformat() if state.expires_at else None,
        "license_grace_until": state.grace_until.isoformat() if state.grace_until else None,
        "license_last_error": state.last_error,
    }


def _count(model) -> int:
    try:
        return db.session.query(model).count()
    except Exception:
        return 0


@cloud_bp.route("/config", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager")
def get_cloud_config():
    cfg = _ensure_instance_config()
    state = db.session.get(CloudLicenseState, 1)
    payload = _serialize_config(cfg)
    payload.update(_serialize_license_state(state))
    return jsonify(payload), 200


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

    state = db.session.get(CloudLicenseState, 1)
    payload = _serialize_config(cfg)
    payload.update(_serialize_license_state(state))
    return jsonify(payload), 200


@cloud_bp.route("/sync/status", methods=["GET"])
@jwt_required()
@roles_required("admin", "manager")
def get_cloud_sync_status():
    state = db.session.get(CloudSyncState, 1)
    pending_outbox = CloudSyncOutbox.query.filter_by(status="pending").count()
    failed_outbox = CloudSyncOutbox.query.filter_by(status="failed").count()
    payload = {
        "sync_state": {
            "last_pulled_event_id": state.last_pulled_event_id if state else 0,
            "last_synced_at": state.last_synced_at.isoformat() if state and state.last_synced_at else None,
            "last_full_replace_at": state.last_full_replace_at.isoformat() if state and state.last_full_replace_at else None,
            "last_sync_error": state.last_sync_error if state else None,
        },
        "outbox": {
            "pending": pending_outbox,
            "failed": failed_outbox,
        },
        "local_counts": {
            "users": _count(User),
            "waiter_profiles": _count(WaiterProfile),
            "stations": _count(Station),
            "tables": _count(Table),
            "categories": _count(Category),
            "subcategories": _count(SubCategory),
            "menu_items": _count(MenuItem),
            "inventory_items": _count(InventoryItem),
            "branding_settings": _count(BrandingSettings),
        },
    }
    return jsonify(payload), 200
