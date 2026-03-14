import hashlib
import logging
import socket
import subprocess
import sys
import time
import uuid
from datetime import timedelta
from typing import Iterable

import requests
from flask import current_app
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.models import (
    BrandingSettings,
    Category,
    CloudInstanceConfig,
    CloudLicenseState,
    CloudLicensePolicy,
    CloudSyncOutbox,
    CloudSyncState,
    MenuItem,
    Order,
    Station,
    SubCategory,
    Table,
    User,
)
from app.utils.timezone import eat_now_naive

logger = logging.getLogger(__name__)


def _generate_device_id() -> str:
    return uuid.uuid4().hex


def _read_file(path: str) -> str | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return None


def _run_command(command: list[str]) -> str | None:
    try:
        return subprocess.check_output(command, stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return None


def _normalize_id(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().strip('"').strip().upper()
    if not normalized:
        return None
    if normalized in {
        "00000000-0000-0000-0000-000000000000",
        "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
    }:
        return None
    return normalized


def _get_os_machine_id() -> str | None:
    if sys.platform.startswith("win"):
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
            )
            value, _ = winreg.QueryValueEx(key, "MachineGuid")
            return _normalize_id(value)
        except Exception:
            return None

    if sys.platform.startswith("linux"):
        return _normalize_id(_read_file("/etc/machine-id") or _read_file("/var/lib/dbus/machine-id"))

    if sys.platform == "darwin":
        output = _run_command(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"])
        if not output:
            return None
        for line in output.splitlines():
            if "IOPlatformUUID" in line:
                return _normalize_id(line.split("=", 1)[1].strip())
    return None


def _get_bios_uuid() -> str | None:
    if sys.platform.startswith("win"):
        output = _run_command(["wmic", "csproduct", "get", "uuid"])
        if not output:
            return None
        for line in output.splitlines():
            value = _normalize_id(line)
            if value and value != "UUID":
                return value
        return None

    if sys.platform.startswith("linux"):
        return _normalize_id(_read_file("/sys/class/dmi/id/product_uuid"))

    if sys.platform == "darwin":
        return None

    return None


def _get_mac_address() -> str | None:
    node = uuid.getnode()
    if (node >> 40) & 1:
        return None
    return ":".join(f"{(node >> shift) & 0xFF:02x}" for shift in range(40, -1, -8))


def _generate_machine_fingerprint() -> str:
    parts = []
    machine_id = _get_os_machine_id()
    bios_uuid = _get_bios_uuid()
    hostname = socket.gethostname()
    mac_address = _get_mac_address()

    if machine_id:
        parts.append(f"machine_id:{machine_id}")
    if bios_uuid:
        parts.append(f"bios_uuid:{bios_uuid}")
    if hostname:
        parts.append(f"hostname:{hostname}")
    if mac_address:
        parts.append(f"mac:{mac_address}")

    if not parts:
        parts = [f"fallback:{uuid.uuid4().hex}"]

    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return digest


def _base_url() -> str:
    return "https://restaurant.trustnetsolution.com"


def _timeout() -> float:
    return float(current_app.config.get("CLOUD_SYNC_TIMEOUT_SECONDS", 5))


def _ensure_instance_config() -> CloudInstanceConfig:
    row = db.session.get(CloudInstanceConfig, 1)
    if row is None:
        row = CloudInstanceConfig(id=1)
        db.session.add(row)

    row.tenant_id = int(current_app.config["CLOUD_TENANT_ID"]) if current_app.config.get("CLOUD_TENANT_ID") else row.tenant_id
    row.store_id = int(current_app.config["CLOUD_STORE_ID"]) if current_app.config.get("CLOUD_STORE_ID") else row.store_id

    device_id = row.device_id or _generate_device_id()
    device_name = row.device_name or socket.gethostname()
    machine_fingerprint = row.machine_fingerprint or _generate_machine_fingerprint()

    row.device_id = device_id
    row.device_name = device_name
    row.machine_fingerprint = machine_fingerprint
    row.cloud_base_url = _base_url()
    row.license_key = current_app.config.get("CLOUD_LICENSE_KEY") or row.license_key
    db.session.commit()
    return row


def _ensure_license_state() -> CloudLicenseState:
    row = db.session.get(CloudLicenseState, 1)
    if row is None:
        row = CloudLicenseState(id=1)
        db.session.add(row)
        db.session.commit()
    return row


def _ensure_license_policy() -> CloudLicensePolicy:
    row = db.session.get(CloudLicensePolicy, 1)
    if row is None:
        row = CloudLicensePolicy(id=1)
        db.session.add(row)
        db.session.commit()
    return row


def _policy_defaults() -> dict:
    return {
        "validation_interval_days": 7,
        "grace_period_days": 15,
        "lock_mode": "full",
    }


def _apply_policy_payload(payload: dict | None) -> None:
    if not payload:
        return
    row = _ensure_license_policy()
    defaults = _policy_defaults()
    try:
        row.validation_interval_days = int(payload.get("validation_interval_days") or defaults["validation_interval_days"])
    except (TypeError, ValueError):
        row.validation_interval_days = defaults["validation_interval_days"]
    try:
        row.grace_period_days = int(payload.get("grace_period_days") or defaults["grace_period_days"])
    except (TypeError, ValueError):
        row.grace_period_days = defaults["grace_period_days"]
    lock_mode = (payload.get("lock_mode") or defaults["lock_mode"]).strip().lower()
    row.lock_mode = lock_mode if lock_mode in {"full", "none"} else defaults["lock_mode"]
    row.last_fetched_at = eat_now_naive()
    db.session.commit()


def _get_effective_policy() -> dict:
    row = _ensure_license_policy()
    defaults = _policy_defaults()
    return {
        "validation_interval_days": int(row.validation_interval_days or defaults["validation_interval_days"]),
        "grace_period_days": int(row.grace_period_days or defaults["grace_period_days"]),
        "lock_mode": (row.lock_mode or defaults["lock_mode"]).strip().lower(),
    }


def _ensure_sync_state() -> CloudSyncState:
    row = db.session.get(CloudSyncState, 1)
    if row is None:
        row = CloudSyncState(id=1, last_pulled_event_id=0)
        db.session.add(row)
        db.session.commit()
    return row


def _instance_payload() -> dict:
    cfg = _ensure_instance_config()
    return {
        "tenant_id": cfg.tenant_id,
        "store_id": cfg.store_id,
        "device_id": cfg.device_id,
        "device_name": cfg.device_name,
        "machine_fingerprint": cfg.machine_fingerprint,
        "license_key": cfg.license_key,
    }


def activate_cloud_device() -> dict:
    payload = _instance_payload()
    required = ["tenant_id", "store_id", "device_id", "machine_fingerprint", "license_key"]
    missing = [key for key in required if not payload.get(key)]
    if missing:
        raise ValueError(f"Missing cloud instance config values: {', '.join(missing)}")

    state = _ensure_license_state()
    try:
        response = requests.post(
            f"{_base_url()}/api/devices/activate",
            json=payload,
            timeout=_timeout(),
        )
    except Exception as exc:
        _apply_validation_failure(state, f"Activation failed: {exc}")
        raise

    if response.status_code >= 400:
        _apply_validation_failure(state, _extract_error_message(response, "Activation rejected"))
        response.raise_for_status()

    data = response.json()
    _apply_policy_payload(data.get("policy"))
    state.tenant_id = data.get("tenant_id")
    state.store_id = data.get("store_id")
    state.device_id = data.get("device_id")
    state.license_key = payload["license_key"]
    state.status = data.get("license_status") or state.status
    state.is_valid = data.get("license_status") in {"active", "trial"}
    state.activated_at = eat_now_naive()
    state.last_validated_at = eat_now_naive()
    state.expires_at = None
    state.grace_until = None
    state.last_error = None
    db.session.commit()
    return data


def validate_cloud_license() -> dict:
    payload = _instance_payload()
    state = _ensure_license_state()
    try:
        response = requests.post(
            f"{_base_url()}/api/licenses/validate",
            json={
                "tenant_id": payload["tenant_id"],
                "store_id": payload["store_id"],
                "device_id": payload["device_id"],
                "license_key": payload["license_key"],
            },
            timeout=_timeout(),
        )
    except Exception as exc:
        _apply_validation_failure(state, f"Validation failed: {exc}")
        raise

    if response.status_code >= 400:
        _apply_validation_failure(state, _extract_error_message(response, "License validation rejected"))
        response.raise_for_status()

    data = response.json()
    _apply_policy_payload(data.get("policy"))
    state.tenant_id = data.get("tenant_id")
    state.store_id = data.get("store_id")
    state.device_id = data.get("device_id")
    state.license_key = payload["license_key"]
    state.status = data.get("license_status") or state.status
    state.is_valid = bool(data.get("is_valid"))
    state.last_validated_at = eat_now_naive()
    state.last_error = None
    if state.is_valid:
        state.grace_until = None
    else:
        _ensure_grace_period(state)
    db.session.commit()
    return data


def _extract_error_message(response: requests.Response, fallback: str) -> str:
    try:
        payload = response.json() or {}
    except Exception:
        payload = {}
    return payload.get("error") or payload.get("msg") or fallback


def _ensure_grace_period(state: CloudLicenseState) -> None:
    now = eat_now_naive()
    policy = _get_effective_policy()
    grace_hours = int(policy.get("grace_period_days", 15)) * 24
    if grace_hours <= 0:
        state.grace_until = None
        return
    if not state.grace_until or state.grace_until < now:
        state.grace_until = now + timedelta(hours=grace_hours)


def _apply_validation_failure(state: CloudLicenseState, error_message: str) -> None:
    state.is_valid = False
    state.status = state.status or "unknown"
    state.last_error = error_message
    _ensure_grace_period(state)
    db.session.commit()


def _validate_before_sync() -> bool:
    try:
        validate_cloud_license()
        return True
    except Exception:
        return False


def _should_validate_license(license_state: CloudLicenseState) -> bool:
    policy = _get_effective_policy()
    interval = int(policy.get("validation_interval_days", 7)) * 24 * 3600
    if interval <= 0:
        return True
    if not license_state.last_validated_at:
        return True
    elapsed = (eat_now_naive() - license_state.last_validated_at).total_seconds()
    return elapsed >= interval


def _upsert_outbox_event(event_id: str, entity_type: str, entity_id: str, operation: str, payload: dict) -> None:
    existing = CloudSyncOutbox.query.filter_by(event_id=event_id).first()
    if existing:
        existing.payload = payload
        existing.operation = operation
        if existing.status == "sent":
            existing.status = "pending"
            existing.sent_at = None
        return

    db.session.add(
        CloudSyncOutbox(
            event_id=event_id,
            entity_type=entity_type,
            entity_id=str(entity_id),
            operation=operation,
            payload=payload,
            status="pending",
            retry_count=0,
        )
    )


def _timestamp_suffix(value) -> str:
    if value is None:
        return "na"
    return value.strftime("%Y%m%d%H%M%S")


def seed_cloud_sync_outbox() -> int:
    created = 0

    entities: Iterable[tuple[str, Iterable]] = (
        (
            "user",
            (
                (
                    row.id,
                    row.updated_at if hasattr(row, "updated_at") else None,
                    {
                        "id": row.id,
                        "username": row.username,
                        "role": row.role,
                    },
                )
                for row in User.query.order_by(User.id.asc()).all()
            ),
        ),
        (
            "table",
            (
                (
                    row.id,
                    None,
                    {"id": row.id, "number": row.number, "status": row.status, "is_vip": row.is_vip},
                )
                for row in Table.query.order_by(Table.id.asc()).all()
            ),
        ),
        (
            "station",
            (
                (
                    row.id,
                    None,
                    {
                        "id": row.id,
                        "name": row.name,
                        "print_mode": row.print_mode,
                        "cashier_printer": row.cashier_printer,
                    },
                )
                for row in Station.query.order_by(Station.id.asc()).all()
            ),
        ),
        (
            "category",
            (
                (
                    row.id,
                    None,
                    {"id": row.id, "name": row.name, "quantity_step": float(row.quantity_step or 1)},
                )
                for row in Category.query.order_by(Category.id.asc()).all()
            ),
        ),
        (
            "subcategory",
            (
                (
                    row.id,
                    None,
                    {"id": row.id, "name": row.name, "category_id": row.category_id},
                )
                for row in SubCategory.query.order_by(SubCategory.id.asc()).all()
            ),
        ),
        (
            "menu_item",
            (
                (
                    row.id,
                    None,
                    {
                        "id": row.id,
                        "name": row.name,
                        "price": float(row.price) if row.price is not None else None,
                        "vip_price": float(row.vip_price) if row.vip_price is not None else None,
                        "quantity_step": float(row.quantity_step) if row.quantity_step is not None else None,
                        "is_available": row.is_available,
                        "station_id": row.station_id,
                        "subcategory_id": row.subcategory_id,
                        "image_url": row.image_url,
                    },
                )
                for row in MenuItem.query.order_by(MenuItem.id.asc()).all()
            ),
        ),
        (
            "branding",
            (
                (
                    row.id,
                    row.updated_at,
                    {
                        "business_day_start_time": row.business_day_start_time,
                        "print_preview_enabled": row.print_preview_enabled,
                        "kds_mark_unavailable_enabled": row.kds_mark_unavailable_enabled,
                    },
                )
                for row in BrandingSettings.query.order_by(BrandingSettings.id.asc()).all()
            ),
        ),
        (
            "order",
            (
                (
                    row.id,
                    row.updated_at,
                    {
                        "order_id": row.id,
                        "status": row.status,
                        "total_amount": float(row.total_amount or 0),
                        "table_number": row.table.number if row.table else None,
                        "user_name": row.user.username if row.user else None,
                    },
                )
                for row in Order.query.order_by(Order.id.asc()).all()
            ),
        ),
    )

    try:
        for entity_type, rows in entities:
            for entity_id, updated_at, payload in rows:
                event_id = f"{entity_type}-{entity_id}-{_timestamp_suffix(updated_at)}"
                before = CloudSyncOutbox.query.filter_by(event_id=event_id).first()
                _upsert_outbox_event(event_id, entity_type, str(entity_id), "upsert", payload)
                if before is None:
                    created += 1
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise

    return created


def process_cloud_sync_outbox_batch() -> int:
    cfg = _ensure_instance_config()
    if not all([cfg.tenant_id, cfg.store_id, cfg.device_id]):
        logger.warning("Cloud sync skipped: tenant/store/device config missing")
        return 0

    if not _validate_before_sync():
        return 0

    batch_size = int(current_app.config.get("CLOUD_SYNC_BATCH_SIZE", 100))
    rows = (
        CloudSyncOutbox.query.filter_by(status="pending")
        .order_by(CloudSyncOutbox.created_at.asc())
        .limit(batch_size)
        .all()
    )
    if not rows:
        return 0

    payload = {
        "tenant_id": cfg.tenant_id,
        "store_id": cfg.store_id,
        "device_id": cfg.device_id,
        "events": [
            {
                "event_id": row.event_id,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "operation": row.operation,
                "payload": row.payload,
            }
            for row in rows
        ],
    }

    response = requests.post(
        f"{_base_url()}/api/sync/push",
        json=payload,
        timeout=_timeout(),
    )
    response.raise_for_status()
    accepted = set((response.json() or {}).get("accepted_event_ids") or [])

    processed = 0
    for row in rows:
        if row.event_id in accepted:
            row.status = "sent"
            row.sent_at = eat_now_naive()
            row.last_error = None
        else:
            row.retry_count = int(row.retry_count or 0) + 1
            row.last_error = "Cloud did not accept event"
        processed += 1

    state = _ensure_sync_state()
    state.last_synced_at = eat_now_naive()
    state.last_sync_error = None
    db.session.commit()
    return processed


def pull_cloud_updates() -> int:
    cfg = _ensure_instance_config()
    if not all([cfg.tenant_id, cfg.store_id, cfg.device_id]):
        return 0

    if not _validate_before_sync():
        return 0

    state = _ensure_sync_state()
    response = requests.get(
        f"{_base_url()}/api/sync/pull",
        params={
            "tenant_id": cfg.tenant_id,
            "store_id": cfg.store_id,
            "device_id": cfg.device_id,
            "since_id": state.last_pulled_event_id or 0,
        },
        timeout=_timeout(),
    )
    response.raise_for_status()
    data = response.json() or {}
    state.last_pulled_event_id = int(data.get("next_since_id") or state.last_pulled_event_id or 0)
    state.last_synced_at = eat_now_naive()
    state.last_sync_error = None
    db.session.commit()
    return len(data.get("events") or [])


def run_cloud_sync_cycle() -> dict:
    result = {"activated": False, "validated": False, "seeded": 0, "pushed": 0, "pulled": 0}
    license_state = _ensure_license_state()

    try:
        if not license_state.activated_at:
            activate_cloud_device()
            result["activated"] = True
            license_state = _ensure_license_state()

        if _should_validate_license(license_state):
            validate_cloud_license()
            result["validated"] = True

        result["seeded"] = seed_cloud_sync_outbox()
        result["pushed"] = process_cloud_sync_outbox_batch()
        result["pulled"] = pull_cloud_updates()
    except Exception as exc:
        logger.warning("Cloud sync cycle failed: %s", exc)
        state = _ensure_sync_state()
        state.last_sync_error = str(exc)
        license_state.last_error = str(exc)
        db.session.commit()
        raise

    return result


def sleep_seconds() -> int:
    return int(current_app.config.get("CLOUD_SYNC_INTERVAL_SECONDS", "600"))
