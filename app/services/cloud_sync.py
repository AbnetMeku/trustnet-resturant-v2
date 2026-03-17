import hashlib
import json
import logging
import socket
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta
from typing import Iterable

import requests
from flask import current_app
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.inventory_models import (
    InventoryItem,
    InventoryMenuLink,
    StationStock,
    StationStockSnapshot,
    StockPurchase,
    StockTransfer,
    StoreStock,
    StoreStockSnapshot,
)
from app.models.models import (
    BrandingSettings,
    Category,
    CloudInstanceConfig,
    CloudSyncIdMap,
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
    WaiterProfile,
)
from app.utils.timezone import eat_now_naive
from werkzeug.security import generate_password_hash

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
    return current_app.config.get("CLOUD_BASE_URL", "https://rms.trustnetsolution.com")


def _timeout() -> float:
    return float(current_app.config.get("CLOUD_SYNC_TIMEOUT_SECONDS", 5))


def _flag_enabled(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


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


def _should_full_replace(state: CloudSyncState) -> bool:
    if _flag_enabled(current_app.config.get("CLOUD_SYNC_FULL_REPLACE_FORCE")):
        return True
    if not _flag_enabled(current_app.config.get("CLOUD_SYNC_FULL_REPLACE")):
        return False
    return state.last_full_replace_at is None


def reset_cloud_tenant() -> None:
    cfg = _ensure_instance_config()
    if not all([cfg.tenant_id, cfg.store_id, cfg.device_id]):
        raise RuntimeError("Cloud sync reset skipped: tenant/store/device config missing")

    response = requests.post(
        f"{_base_url()}/api/sync/reset",
        json={
            "tenant_id": cfg.tenant_id,
            "store_id": cfg.store_id,
            "device_id": cfg.device_id,
            "confirm": True,
        },
        timeout=_timeout(),
    )
    response.raise_for_status()


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


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None
    return None


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _coerce_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _get_mapped_local_id(entity_type: str, cloud_id: str | int | None) -> int | None:
    if cloud_id is None:
        return None
    row = CloudSyncIdMap.query.filter_by(entity_type=entity_type, cloud_id=str(cloud_id)).first()
    if row is None:
        return None
    return _coerce_int(row.local_id)


def _ensure_mapping(entity_type: str, cloud_id: str | int, local_id: int) -> None:
    row = CloudSyncIdMap.query.filter_by(entity_type=entity_type, cloud_id=str(cloud_id)).first()
    if row is None:
        db.session.add(
            CloudSyncIdMap(
                entity_type=entity_type,
                cloud_id=str(cloud_id),
                local_id=str(local_id),
            )
        )
    elif row.local_id != str(local_id):
        row.local_id = str(local_id)


def _delete_mapping(entity_type: str, cloud_id: str | int | None) -> None:
    if cloud_id is None:
        return
    CloudSyncIdMap.query.filter_by(entity_type=entity_type, cloud_id=str(cloud_id)).delete(synchronize_session=False)


def _resolve_entity_id(entity_type: str, cloud_id: str | int | None) -> int | None:
    if cloud_id is None:
        return None
    return _get_mapped_local_id(entity_type, cloud_id)


def _find_station_by_name(name: str | None):
    if not name:
        return None
    return Station.query.filter_by(name=name).first()


def _find_waiter_profile_by_name(name: str | None):
    if not name:
        return None
    return WaiterProfile.query.filter_by(name=name).first()


def _find_user_by_username(username: str | None):
    if not username:
        return None
    return User.query.filter_by(username=username).first()


def _find_table_by_number(number: str | None):
    if not number:
        return None
    return Table.query.filter_by(number=number).first()


def _find_category_by_name(name: str | None):
    if not name:
        return None
    return Category.query.filter_by(name=name).first()


def _find_subcategory_by_name(name: str | None, category_id: int | None):
    if not name:
        return None
    query = SubCategory.query.filter_by(name=name)
    if category_id is None:
        query = query.filter(SubCategory.category_id.is_(None))
    else:
        query = query.filter_by(category_id=category_id)
    return query.first()


def _find_menu_item_by_name(name: str | None):
    if not name:
        return None
    return MenuItem.query.filter_by(name=name).first()


def _find_inventory_item_by_name(name: str | None):
    if not name:
        return None
    return InventoryItem.query.filter_by(name=name).first()


def _ensure_station_for_cloud_id(cloud_id: str | int | None, name: str | None = None) -> Station | None:
    local_id = _resolve_entity_id("station", cloud_id)
    if local_id:
        return db.session.get(Station, local_id)
    station = _find_station_by_name(name) if name else None
    if station is None:
        fallback_name = name or f"Station-{cloud_id}"
        station = Station(
            name=fallback_name,
            password_hash=generate_password_hash("0000"),
            print_mode="grouped",
            cashier_printer=False,
        )
        db.session.add(station)
        db.session.flush()
    _ensure_mapping("station", cloud_id, station.id)
    return station


def _ensure_inventory_item_for_cloud_id(cloud_id: str | int | None, name: str | None = None) -> InventoryItem | None:
    local_id = _resolve_entity_id("inventory_item", cloud_id)
    if local_id:
        return db.session.get(InventoryItem, local_id)
    item = _find_inventory_item_by_name(name) if name else None
    if item is None:
        fallback_name = name or f"Item-{cloud_id}"
        item = InventoryItem(
            name=fallback_name,
            unit="Bottle",
            serving_unit="unit",
            servings_per_unit=1.0,
            container_size_ml=1.0,
            default_shot_ml=1.0,
            is_active=True,
        )
        db.session.add(item)
        db.session.flush()
    _ensure_mapping("inventory_item", cloud_id, item.id)
    return item


def _upsert_user(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("user", cloud_id)
    row = db.session.get(User, local_id) if local_id else None
    if row is None:
        row = _find_user_by_username(payload.get("username")) or User()
        if row.id is None:
            db.session.add(row)

    username = (payload.get("username") or "").strip()
    if not username:
        username = f"user-{cloud_id}"
    row.username = username
    row.role = (payload.get("role") or row.role or "waiter").strip()
    if row.password_hash is None:
        row.password_hash = generate_password_hash("change-me")

    waiter_profile_id = payload.get("waiter_profile_id")
    with db.session.no_autoflush:
        mapped_profile_id = _resolve_entity_id("waiter_profile", waiter_profile_id)
    row.waiter_profile_id = mapped_profile_id
    db.session.flush()
    _ensure_mapping("user", cloud_id, row.id)


def _upsert_station(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("station", cloud_id)
    row = db.session.get(Station, local_id) if local_id else None
    if row is None:
        row = _find_station_by_name(payload.get("name")) or Station()
        if row.id is None:
            row.password_hash = generate_password_hash("0000")
            db.session.add(row)

    name = (payload.get("name") or row.name or "").strip()
    if not name:
        name = f"Station-{cloud_id}"
    row.name = name
    row.print_mode = (payload.get("print_mode") or row.print_mode or "grouped").strip()
    row.cashier_printer = bool(payload.get("cashier_printer", False))
    row.printer_identifier = payload.get("printer_identifier") or row.printer_identifier
    if not row.password_hash:
        row.password_hash = generate_password_hash("0000")
    db.session.flush()
    _ensure_mapping("station", cloud_id, row.id)


def _upsert_waiter_profile(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("waiter_profile", cloud_id)
    row = db.session.get(WaiterProfile, local_id) if local_id else None
    if row is None:
        row = _find_waiter_profile_by_name(payload.get("name")) or WaiterProfile()
        if row.id is None:
            db.session.add(row)

    name = (payload.get("name") or row.name or "").strip()
    if not name:
        name = f"Waiter-{cloud_id}"
    row.name = name
    row.max_tables = int(payload.get("max_tables") or row.max_tables or 5)
    row.allow_vip = bool(payload.get("allow_vip", row.allow_vip if row.allow_vip is not None else True))

    station_ids = payload.get("station_ids") or []
    mapped_stations = []
    for station_id in station_ids:
        station = _ensure_station_for_cloud_id(station_id)
        if station:
            mapped_stations.append(station)
    row.stations = mapped_stations
    db.session.flush()
    _ensure_mapping("waiter_profile", cloud_id, row.id)


def _upsert_table(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("table", cloud_id)
    row = db.session.get(Table, local_id) if local_id else None
    if row is None:
        row = _find_table_by_number(payload.get("number")) or Table()
        if row.id is None:
            db.session.add(row)

    number = str(payload.get("number") or row.number or "").strip()
    if not number:
        number = f"Table-{cloud_id}"
    row.number = number
    row.status = (payload.get("status") or row.status or "available").strip().lower()
    row.is_vip = bool(payload.get("is_vip", row.is_vip or False))

    waiter_ids = payload.get("waiter_ids") or []
    mapped_waiters = []
    for waiter_id in waiter_ids:
        mapped_id = _resolve_entity_id("user", waiter_id)
        if mapped_id:
            waiter = db.session.get(User, mapped_id)
            if waiter:
                mapped_waiters.append(waiter)
    row.waiters = mapped_waiters
    db.session.flush()
    _ensure_mapping("table", cloud_id, row.id)


def _upsert_category(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("category", cloud_id)
    row = db.session.get(Category, local_id) if local_id else None
    if row is None:
        row = _find_category_by_name(payload.get("name")) or Category()
        if row.id is None:
            db.session.add(row)

    name = (payload.get("name") or row.name or "").strip()
    if not name:
        name = f"Category-{cloud_id}"
    row.name = name
    row.quantity_step = payload.get("quantity_step") or row.quantity_step or 1
    db.session.flush()
    _ensure_mapping("category", cloud_id, row.id)


def _upsert_subcategory(payload: dict) -> None:
    cloud_id = payload.get("id")
    category_id = payload.get("category_id")
    mapped_category_id = _resolve_entity_id("category", category_id)
    local_id = _resolve_entity_id("subcategory", cloud_id)
    row = db.session.get(SubCategory, local_id) if local_id else None
    if row is None:
        row = _find_subcategory_by_name(payload.get("name"), mapped_category_id) or SubCategory()
        if row.id is None:
            db.session.add(row)

    name = (payload.get("name") or row.name or "").strip()
    if not name:
        name = f"Subcategory-{cloud_id}"
    row.name = name
    row.category_id = mapped_category_id
    db.session.flush()
    _ensure_mapping("subcategory", cloud_id, row.id)


def _upsert_menu_item(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("menu_item", cloud_id)
    row = db.session.get(MenuItem, local_id) if local_id else None
    if row is None:
        row = _find_menu_item_by_name(payload.get("name")) or MenuItem()
        if row.id is None:
            db.session.add(row)

    name = (payload.get("name") or row.name or "").strip()
    if not name:
        name = f"Menu-{cloud_id}"
    row.name = name
    row.description = payload.get("description")
    row.price = payload.get("price")
    row.vip_price = payload.get("vip_price")
    row.quantity_step = payload.get("quantity_step")
    row.is_available = bool(payload.get("is_available", True))
    row.image_url = payload.get("image_url")

    station_id = payload.get("station_id")
    station = _ensure_station_for_cloud_id(station_id)
    if station is None:
        return
    row.station_id = station.id

    subcategory_id = payload.get("subcategory_id")
    row.subcategory_id = _resolve_entity_id("subcategory", subcategory_id)

    db.session.flush()
    _ensure_mapping("menu_item", cloud_id, row.id)


def _upsert_branding(payload: dict) -> None:
    row = BrandingSettings.query.first()
    if row is None:
        row = BrandingSettings()
        db.session.add(row)

    if "business_day_start_time" in payload:
        row.business_day_start_time = payload.get("business_day_start_time") or row.business_day_start_time
    if "print_preview_enabled" in payload:
        row.print_preview_enabled = bool(payload.get("print_preview_enabled", row.print_preview_enabled))
    if "kds_mark_unavailable_enabled" in payload:
        row.kds_mark_unavailable_enabled = bool(payload.get("kds_mark_unavailable_enabled", row.kds_mark_unavailable_enabled))
    db.session.flush()


def _upsert_inventory_item(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("inventory_item", cloud_id)
    row = db.session.get(InventoryItem, local_id) if local_id else None
    if row is None:
        row = _find_inventory_item_by_name(payload.get("name")) or InventoryItem()
        if row.id is None:
            db.session.add(row)

    name = (payload.get("name") or row.name or "").strip()
    if not name:
        name = f"Item-{cloud_id}"
    row.name = name
    row.unit = payload.get("unit") or row.unit or "Bottle"
    row.serving_unit = payload.get("serving_unit") or row.serving_unit or "unit"
    row.servings_per_unit = payload.get("servings_per_unit") or row.servings_per_unit or 1.0
    row.container_size_ml = payload.get("container_size_ml") or row.container_size_ml or 1.0
    row.default_shot_ml = payload.get("default_shot_ml") or row.default_shot_ml or 1.0
    row.is_active = bool(payload.get("is_active", True))
    db.session.flush()
    _ensure_mapping("inventory_item", cloud_id, row.id)


def _upsert_inventory_menu_link(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("inventory_menu_link", cloud_id)
    row = db.session.get(InventoryMenuLink, local_id) if local_id else None

    inventory_item = _ensure_inventory_item_for_cloud_id(payload.get("inventory_item_id"))
    menu_item_id = _resolve_entity_id("menu_item", payload.get("menu_item_id"))
    if inventory_item is None or menu_item_id is None:
        return

    if row is None:
        row = InventoryMenuLink.query.filter_by(inventory_item_id=inventory_item.id, menu_item_id=menu_item_id).first()
    if row is None:
        row = InventoryMenuLink(inventory_item_id=inventory_item.id, menu_item_id=menu_item_id)
        db.session.add(row)

    row.deduction_ratio = payload.get("deduction_ratio") or row.deduction_ratio or 1.0
    row.serving_type = payload.get("serving_type") or row.serving_type or "custom_ml"
    row.serving_value = payload.get("serving_value") or row.serving_value or 1.0
    db.session.flush()
    _ensure_mapping("inventory_menu_link", cloud_id, row.id)


def _upsert_store_stock(payload: dict) -> None:
    inventory_item = _ensure_inventory_item_for_cloud_id(payload.get("inventory_item_id"))
    if inventory_item is None:
        return
    row = StoreStock.query.filter_by(inventory_item_id=inventory_item.id).first()
    if row is None:
        row = StoreStock(inventory_item_id=inventory_item.id)
        db.session.add(row)
    row.quantity = float(payload.get("quantity") or 0)
    db.session.flush()


def _upsert_station_stock(payload: dict) -> None:
    station = _ensure_station_for_cloud_id(payload.get("station_id"))
    inventory_item = _ensure_inventory_item_for_cloud_id(payload.get("inventory_item_id"))
    if station is None or inventory_item is None:
        return
    row = StationStock.query.filter_by(station_id=station.id, inventory_item_id=inventory_item.id).first()
    if row is None:
        row = StationStock(station_id=station.id, inventory_item_id=inventory_item.id)
        db.session.add(row)
    row.quantity = float(payload.get("quantity") or 0)
    db.session.flush()


def _upsert_stock_purchase(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("stock_purchase", cloud_id)
    row = db.session.get(StockPurchase, local_id) if local_id else None

    inventory_item = _ensure_inventory_item_for_cloud_id(payload.get("inventory_item_id"))
    if inventory_item is None:
        return

    if row is None:
        row = StockPurchase()
        db.session.add(row)

    row.inventory_item_id = inventory_item.id
    row.quantity = float(payload.get("quantity") or 0)
    row.unit_price = payload.get("unit_price")
    row.status = payload.get("status") or row.status or "Purchased"
    created_at = _parse_datetime(payload.get("created_at"))
    if created_at:
        row.created_at = created_at
    db.session.flush()
    _ensure_mapping("stock_purchase", cloud_id, row.id)


def _upsert_stock_transfer(payload: dict) -> None:
    cloud_id = payload.get("id")
    local_id = _resolve_entity_id("stock_transfer", cloud_id)
    row = db.session.get(StockTransfer, local_id) if local_id else None

    inventory_item = _ensure_inventory_item_for_cloud_id(payload.get("inventory_item_id"))
    station = _ensure_station_for_cloud_id(payload.get("station_id"))
    if inventory_item is None or station is None:
        return

    if row is None:
        row = StockTransfer()
        db.session.add(row)

    row.inventory_item_id = inventory_item.id
    row.station_id = station.id
    row.quantity = float(payload.get("quantity") or 0)
    row.status = payload.get("status") or row.status or "Transferred"
    created_at = _parse_datetime(payload.get("created_at"))
    if created_at:
        row.created_at = created_at
    db.session.flush()
    _ensure_mapping("stock_transfer", cloud_id, row.id)


def _upsert_station_stock_snapshot(payload: dict) -> None:
    station = _ensure_station_for_cloud_id(payload.get("station_id"))
    inventory_item = _ensure_inventory_item_for_cloud_id(payload.get("inventory_item_id"))
    snapshot_date = _parse_date(payload.get("snapshot_date"))
    if station is None or inventory_item is None or snapshot_date is None:
        return

    row = StationStockSnapshot.query.filter_by(
        station_id=station.id,
        inventory_item_id=inventory_item.id,
        snapshot_date=snapshot_date,
    ).first()
    if row is None:
        row = StationStockSnapshot(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
            snapshot_date=snapshot_date,
        )
        db.session.add(row)

    row.start_of_day_quantity = float(payload.get("start_of_day_quantity") or 0)
    row.added_quantity = float(payload.get("added_quantity") or 0)
    row.sold_quantity = float(payload.get("sold_quantity") or 0)
    row.void_quantity = float(payload.get("void_quantity") or 0)
    row.remaining_quantity = float(payload.get("remaining_quantity") or 0)
    db.session.flush()


def _upsert_store_stock_snapshot(payload: dict) -> None:
    inventory_item = _ensure_inventory_item_for_cloud_id(payload.get("inventory_item_id"))
    snapshot_date = _parse_date(payload.get("snapshot_date"))
    if inventory_item is None or snapshot_date is None:
        return

    row = StoreStockSnapshot.query.filter_by(
        inventory_item_id=inventory_item.id,
        snapshot_date=snapshot_date,
    ).first()
    if row is None:
        row = StoreStockSnapshot(
            inventory_item_id=inventory_item.id,
            snapshot_date=snapshot_date,
        )
        db.session.add(row)

    row.opening_quantity = float(payload.get("opening_quantity") or 0)
    row.purchased_quantity = float(payload.get("purchased_quantity") or 0)
    row.transferred_out_quantity = float(payload.get("transferred_out_quantity") or 0)
    row.closing_quantity = float(payload.get("closing_quantity") or 0)
    db.session.flush()


def _apply_cloud_event(entity_type: str, operation: str, payload: dict) -> None:
    if operation == "delete":
        cloud_id = payload.get("id") or payload.get("cloud_id") or payload.get("entity_id")
        local_id = _resolve_entity_id(entity_type, cloud_id)
        if local_id:
            if entity_type == "user":
                row = db.session.get(User, local_id)
            elif entity_type == "station":
                row = db.session.get(Station, local_id)
            elif entity_type == "waiter_profile":
                row = db.session.get(WaiterProfile, local_id)
            elif entity_type == "table":
                row = db.session.get(Table, local_id)
            elif entity_type == "category":
                row = db.session.get(Category, local_id)
            elif entity_type == "subcategory":
                row = db.session.get(SubCategory, local_id)
            elif entity_type == "menu_item":
                row = db.session.get(MenuItem, local_id)
            elif entity_type == "inventory_item":
                row = db.session.get(InventoryItem, local_id)
            elif entity_type == "inventory_menu_link":
                row = db.session.get(InventoryMenuLink, local_id)
            elif entity_type == "stock_purchase":
                row = db.session.get(StockPurchase, local_id)
            elif entity_type == "stock_transfer":
                row = db.session.get(StockTransfer, local_id)
            else:
                row = None
            if row is not None:
                db.session.delete(row)
        _delete_mapping(entity_type, cloud_id)
        return

    if entity_type == "user":
        _upsert_user(payload)
    elif entity_type == "station":
        _upsert_station(payload)
    elif entity_type == "waiter_profile":
        _upsert_waiter_profile(payload)
    elif entity_type == "table":
        _upsert_table(payload)
    elif entity_type == "category":
        _upsert_category(payload)
    elif entity_type == "subcategory":
        _upsert_subcategory(payload)
    elif entity_type == "menu_item":
        _upsert_menu_item(payload)
    elif entity_type == "branding":
        _upsert_branding(payload)
    elif entity_type == "inventory_item":
        _upsert_inventory_item(payload)
    elif entity_type == "inventory_menu_link":
        _upsert_inventory_menu_link(payload)
    elif entity_type == "store_stock":
        _upsert_store_stock(payload)
    elif entity_type == "station_stock":
        _upsert_station_stock(payload)
    elif entity_type == "stock_purchase":
        _upsert_stock_purchase(payload)
    elif entity_type == "stock_transfer":
        _upsert_stock_transfer(payload)
    elif entity_type == "station_stock_snapshot":
        _upsert_station_stock_snapshot(payload)
    elif entity_type == "store_stock_snapshot":
        _upsert_store_stock_snapshot(payload)
    else:
        logger.info("Cloud sync: ignoring unsupported entity_type=%s", entity_type)


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
        payload_changed = existing.payload != payload or existing.operation != operation
        if payload_changed:
            existing.payload = payload
            existing.operation = operation
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


def _payload_fingerprint(payload: dict) -> str:
    try:
        encoded = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    except Exception:
        encoded = str(payload).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:12]


def _event_suffix(updated_at, payload: dict) -> str:
    if updated_at is None:
        return _payload_fingerprint(payload)
    return _timestamp_suffix(updated_at)


def _build_sync_payload(entity_type: str, row) -> dict | None:
    if row is None:
        return None
    if entity_type == "station":
        return {
            "id": row.id,
            "name": row.name,
            "print_mode": row.print_mode,
            "cashier_printer": row.cashier_printer,
        }
    if entity_type == "waiter_profile":
        return {
            "id": row.id,
            "name": row.name,
            "max_tables": row.max_tables,
            "allow_vip": row.allow_vip,
            "station_ids": [station.id for station in (row.stations or [])],
        }
    if entity_type == "user":
        return {
            "id": row.id,
            "username": row.username,
            "role": row.role,
            "waiter_profile_id": row.waiter_profile_id,
        }
    if entity_type == "table":
        return {
            "id": row.id,
            "number": row.number,
            "status": row.status,
            "is_vip": row.is_vip,
            "waiter_ids": [waiter.id for waiter in (row.waiters or [])],
        }
    if entity_type == "category":
        return {
            "id": row.id,
            "name": row.name,
            "quantity_step": float(row.quantity_step or 1),
        }
    if entity_type == "subcategory":
        return {
            "id": row.id,
            "name": row.name,
            "category_id": row.category_id,
        }
    if entity_type == "menu_item":
        return {
            "id": row.id,
            "name": row.name,
            "description": row.description,
            "price": float(row.price) if row.price is not None else None,
            "vip_price": float(row.vip_price) if row.vip_price is not None else None,
            "quantity_step": float(row.quantity_step) if row.quantity_step is not None else None,
            "is_available": row.is_available,
            "station_id": row.station_id,
            "subcategory_id": row.subcategory_id,
            "image_url": row.image_url,
        }
    if entity_type == "branding":
        return {
            "business_day_start_time": row.business_day_start_time,
            "print_preview_enabled": row.print_preview_enabled,
            "kds_mark_unavailable_enabled": row.kds_mark_unavailable_enabled,
        }
    if entity_type == "inventory_item":
        return {
            "id": row.id,
            "name": row.name,
            "unit": row.unit,
            "serving_unit": row.serving_unit,
            "servings_per_unit": row.servings_per_unit,
            "container_size_ml": row.container_size_ml,
            "default_shot_ml": row.default_shot_ml,
            "is_active": row.is_active,
        }
    if entity_type == "inventory_menu_link":
        return {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "menu_item_id": row.menu_item_id,
            "deduction_ratio": row.deduction_ratio,
            "serving_type": row.serving_type,
            "serving_value": row.serving_value,
        }
    if entity_type == "store_stock":
        return {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "quantity": row.quantity,
        }
    if entity_type == "station_stock":
        return {
            "id": row.id,
            "station_id": row.station_id,
            "inventory_item_id": row.inventory_item_id,
            "quantity": row.quantity,
        }
    if entity_type == "stock_purchase":
        return {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "quantity": row.quantity,
            "unit_price": row.unit_price,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
    if entity_type == "stock_transfer":
        return {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "station_id": row.station_id,
            "quantity": row.quantity,
            "status": row.status,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
    if entity_type == "station_stock_snapshot":
        return {
            "id": row.id,
            "station_id": row.station_id,
            "inventory_item_id": row.inventory_item_id,
            "snapshot_date": row.snapshot_date.isoformat() if row.snapshot_date else None,
            "start_of_day_quantity": row.start_of_day_quantity,
            "added_quantity": row.added_quantity,
            "sold_quantity": row.sold_quantity,
            "void_quantity": row.void_quantity,
            "remaining_quantity": row.remaining_quantity,
        }
    if entity_type == "store_stock_snapshot":
        return {
            "id": row.id,
            "inventory_item_id": row.inventory_item_id,
            "snapshot_date": row.snapshot_date.isoformat() if row.snapshot_date else None,
            "opening_quantity": row.opening_quantity,
            "purchased_quantity": row.purchased_quantity,
            "transferred_out_quantity": row.transferred_out_quantity,
            "closing_quantity": row.closing_quantity,
        }
    if entity_type == "order":
        return {
            "order_id": row.id,
            "status": row.status,
            "total_amount": float(row.total_amount or 0),
            "table_number": row.table.number if row.table else None,
            "user_name": row.user.username if row.user else None,
        }
    return None


def queue_cloud_sync_upsert(entity_type: str, row) -> None:
    payload = _build_sync_payload(entity_type, row)
    if not payload:
        return
    entity_id = payload.get("id") or payload.get("order_id") or getattr(row, "id", None)
    if entity_id is None:
        return
    event_id = f"{entity_type}-{entity_id}-{_timestamp_suffix(eat_now_naive())}"
    _upsert_outbox_event(event_id, entity_type, str(entity_id), "upsert", payload)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise


def queue_cloud_sync_delete(entity_type: str, entity_id: int | str) -> None:
    if entity_id is None:
        return
    payload = {"id": entity_id}
    if entity_type == "order":
        payload["order_id"] = entity_id
    event_id = f"{entity_type}-{entity_id}-delete-{_timestamp_suffix(eat_now_naive())}"
    _upsert_outbox_event(event_id, entity_type, str(entity_id), "delete", payload)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise


def seed_cloud_sync_outbox() -> int:
    created = 0

    entities: Iterable[tuple[str, Iterable]] = (
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
            "waiter_profile",
            (
                (
                    row.id,
                    row.updated_at if hasattr(row, "updated_at") else None,
                    {
                        "id": row.id,
                        "name": row.name,
                        "max_tables": row.max_tables,
                        "allow_vip": row.allow_vip,
                        "station_ids": [station.id for station in (row.stations or [])],
                    },
                )
                for row in WaiterProfile.query.order_by(WaiterProfile.id.asc()).all()
            ),
        ),
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
                        "waiter_profile_id": row.waiter_profile_id,
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
                    {
                        "id": row.id,
                        "number": row.number,
                        "status": row.status,
                        "is_vip": row.is_vip,
                        "waiter_ids": [waiter.id for waiter in (row.waiters or [])],
                    },
                )
                for row in Table.query.order_by(Table.id.asc()).all()
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
                        "description": row.description,
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
            "inventory_item",
            (
                (
                    row.id,
                    row.created_at,
                    {
                        "id": row.id,
                        "name": row.name,
                        "unit": row.unit,
                        "serving_unit": row.serving_unit,
                        "servings_per_unit": row.servings_per_unit,
                        "container_size_ml": row.container_size_ml,
                        "default_shot_ml": row.default_shot_ml,
                        "is_active": row.is_active,
                    },
                )
                for row in InventoryItem.query.order_by(InventoryItem.id.asc()).all()
            ),
        ),
        (
            "inventory_menu_link",
            (
                (
                    row.id,
                    row.created_at,
                    {
                        "id": row.id,
                        "inventory_item_id": row.inventory_item_id,
                        "menu_item_id": row.menu_item_id,
                        "deduction_ratio": row.deduction_ratio,
                        "serving_type": row.serving_type,
                        "serving_value": row.serving_value,
                    },
                )
                for row in InventoryMenuLink.query.order_by(InventoryMenuLink.id.asc()).all()
            ),
        ),
        (
            "store_stock",
            (
                (
                    row.id,
                    row.updated_at,
                    {
                        "inventory_item_id": row.inventory_item_id,
                        "quantity": row.quantity,
                    },
                )
                for row in StoreStock.query.order_by(StoreStock.id.asc()).all()
            ),
        ),
        (
            "station_stock",
            (
                (
                    row.id,
                    row.updated_at,
                    {
                        "station_id": row.station_id,
                        "inventory_item_id": row.inventory_item_id,
                        "quantity": row.quantity,
                    },
                )
                for row in StationStock.query.order_by(StationStock.id.asc()).all()
            ),
        ),
        (
            "stock_purchase",
            (
                (
                    row.id,
                    row.created_at,
                    {
                        "id": row.id,
                        "inventory_item_id": row.inventory_item_id,
                        "quantity": row.quantity,
                        "unit_price": row.unit_price,
                        "status": row.status,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                    },
                )
                for row in StockPurchase.query.order_by(StockPurchase.id.asc()).all()
            ),
        ),
        (
            "stock_transfer",
            (
                (
                    row.id,
                    row.created_at,
                    {
                        "id": row.id,
                        "inventory_item_id": row.inventory_item_id,
                        "station_id": row.station_id,
                        "quantity": row.quantity,
                        "status": row.status,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                    },
                )
                for row in StockTransfer.query.order_by(StockTransfer.id.asc()).all()
            ),
        ),
        (
            "station_stock_snapshot",
            (
                (
                    row.id,
                    row.created_at,
                    {
                        "station_id": row.station_id,
                        "inventory_item_id": row.inventory_item_id,
                        "snapshot_date": row.snapshot_date.isoformat(),
                        "start_of_day_quantity": row.start_of_day_quantity,
                        "added_quantity": row.added_quantity,
                        "sold_quantity": row.sold_quantity,
                        "void_quantity": row.void_quantity,
                        "remaining_quantity": row.remaining_quantity,
                    },
                )
                for row in StationStockSnapshot.query.order_by(StationStockSnapshot.id.asc()).all()
            ),
        ),
        (
            "store_stock_snapshot",
            (
                (
                    row.id,
                    row.created_at,
                    {
                        "inventory_item_id": row.inventory_item_id,
                        "snapshot_date": row.snapshot_date.isoformat(),
                        "opening_quantity": row.opening_quantity,
                        "purchased_quantity": row.purchased_quantity,
                        "transferred_out_quantity": row.transferred_out_quantity,
                        "closing_quantity": row.closing_quantity,
                    },
                )
                for row in StoreStockSnapshot.query.order_by(StoreStockSnapshot.id.asc()).all()
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
                event_id = f"{entity_type}-{entity_id}-{_event_suffix(updated_at, payload)}"
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
    events = data.get("events") or []
    last_applied_id = state.last_pulled_event_id or 0
    applied = 0

    for event in events:
        event_id = int(event.get("id") or 0)
        event_device_id = event.get("device_id")
        if event_device_id and event_device_id == cfg.device_id:
            last_applied_id = max(last_applied_id, event_id)
            continue

        entity_type = (event.get("entity_type") or "").strip()
        operation = (event.get("operation") or "").strip().lower()
        payload = event.get("payload") or {}

        if not entity_type or not operation or not isinstance(payload, dict):
            last_applied_id = max(last_applied_id, event_id)
            continue

        try:
            with db.session.begin_nested():
                _apply_cloud_event(entity_type, operation, payload)
            last_applied_id = max(last_applied_id, event_id)
            applied += 1
        except Exception:
            logger.exception("Cloud sync apply failed for event=%s type=%s", event.get("event_id"), entity_type)
            break

    state.last_pulled_event_id = int(last_applied_id)
    state.last_synced_at = eat_now_naive()
    state.last_sync_error = None
    db.session.commit()
    return applied


def run_cloud_sync_cycle() -> dict:
    result = {"activated": False, "validated": False, "full_replaced": False, "seeded": 0, "pushed": 0, "pulled": 0}
    license_state = _ensure_license_state()

    try:
        if not license_state.activated_at:
            activate_cloud_device()
            result["activated"] = True
            license_state = _ensure_license_state()

        if _should_validate_license(license_state):
            validate_cloud_license()
            result["validated"] = True

        state = _ensure_sync_state()
        if _should_full_replace(state):
            reset_cloud_tenant()
            state.last_pulled_event_id = 0
            state.last_full_replace_at = eat_now_naive()
            state.last_sync_error = None
            db.session.commit()
            result["full_replaced"] = True

        result["pulled"] = pull_cloud_updates()
        result["seeded"] = seed_cloud_sync_outbox()
        result["pushed"] = process_cloud_sync_outbox_batch()
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
