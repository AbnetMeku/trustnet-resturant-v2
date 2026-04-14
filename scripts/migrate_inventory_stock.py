import argparse
import getpass
import os
import re
import sys
from datetime import date, datetime
from typing import Any

from sqlalchemy import create_engine, text

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_inventory_app, db
from app.models import InventoryMenuLink, MenuItem, Station, StationStock, StationStockSnapshot, StoreStock


def _prompt_if_missing(value: str | None, label: str, secret: bool = False) -> str:
    if value:
        return value
    if secret:
        return getpass.getpass(f"{label}: ")
    return input(f"{label}: ").strip()


def _safe_identifier(name: str) -> str:
    if not re.match(r"^[A-Za-z0-9_]+$", name):
        raise ValueError(f"Invalid identifier: {name}")
    return name


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value if text_value else None


def _normalize_name(value: Any) -> str | None:
    cleaned = _clean_text(value)
    return cleaned.casefold() if cleaned else None


def _as_float(value: Any) -> float:
    return float(value or 0)


def _max_datetime(current: datetime | None, candidate: Any) -> datetime | None:
    if candidate is None:
        return current
    if isinstance(candidate, date) and not isinstance(candidate, datetime):
        candidate = datetime.combine(candidate, datetime.min.time())
    if current is None or candidate > current:
        return candidate
    return current


def _min_datetime(current: datetime | None, candidate: Any) -> datetime | None:
    if candidate is None:
        return current
    if isinstance(candidate, date) and not isinstance(candidate, datetime):
        candidate = datetime.combine(candidate, datetime.min.time())
    if current is None or candidate < current:
        return candidate
    return current


def _ensure_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raise ValueError(f"Invalid snapshot_date: {value!r}")


def _connect_old_db(
    host: str,
    port: int,
    name: str,
    user: str,
    password: str,
):
    url = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}"
    return create_engine(url)


def _load_rows(conn, schema: str, table: str) -> list[dict[str, Any]]:
    safe_schema = _safe_identifier(schema)
    safe_table = _safe_identifier(table)
    sql = text(f'SELECT * FROM "{safe_schema}"."{safe_table}"')
    result = conn.execute(sql)
    return [dict(row._mapping) for row in result]


def _build_new_menu_inventory_map() -> tuple[dict[str, int], set[str]]:
    rows = (
        db.session.query(MenuItem.name, InventoryMenuLink.inventory_item_id)
        .join(InventoryMenuLink, InventoryMenuLink.menu_item_id == MenuItem.id)
        .all()
    )

    menu_name_to_inventory_id: dict[str, int] = {}
    ambiguous_names: set[str] = set()

    for menu_name, inventory_item_id in rows:
        key = _normalize_name(menu_name)
        if not key:
            continue
        existing_inventory_id = menu_name_to_inventory_id.get(key)
        if existing_inventory_id is not None and existing_inventory_id != inventory_item_id:
            ambiguous_names.add(key)
            continue
        menu_name_to_inventory_id[key] = inventory_item_id

    for key in ambiguous_names:
        menu_name_to_inventory_id.pop(key, None)

    return menu_name_to_inventory_id, ambiguous_names


def _build_station_name_map() -> dict[str, Station]:
    stations = Station.query.order_by(Station.id.asc()).all()
    station_map: dict[str, Station] = {}
    for station in stations:
        key = _normalize_name(station.name)
        if key:
            station_map[key] = station
    return station_map


def _resolve_target_inventory_id(
    old_inventory_item_id: int,
    old_inventory_items_by_id: dict[int, dict[str, Any]],
    old_menu_names_by_id: dict[int, str],
    new_inventory_by_menu_name: dict[str, int],
    ambiguous_menu_names: set[str],
) -> int:
    old_inventory_item = old_inventory_items_by_id.get(old_inventory_item_id)
    if not old_inventory_item:
        raise ValueError(f"inventory_item_id {old_inventory_item_id} not found in old inventory_items")

    menu_item_id = old_inventory_item.get("menu_item_id")
    menu_name = old_menu_names_by_id.get(menu_item_id)
    if not menu_name:
        raise ValueError(f"menu_item_id {menu_item_id} not found for old inventory_item {old_inventory_item_id}")

    normalized_menu_name = _normalize_name(menu_name)
    if normalized_menu_name in ambiguous_menu_names:
        raise ValueError(f"menu item '{menu_name}' maps to multiple new inventory items")

    target_inventory_id = new_inventory_by_menu_name.get(normalized_menu_name)
    if target_inventory_id is None:
        raise ValueError(
            f"no new inventory link found for menu item '{menu_name}'. "
            "Run the inventory register migration and ensure menu links exist first."
        )

    return target_inventory_id


def _resolve_target_station_id(
    old_station_id: int,
    old_station_names_by_id: dict[int, str],
    new_stations_by_name: dict[str, Station],
) -> int:
    station_name = old_station_names_by_id.get(old_station_id)
    if not station_name:
        raise ValueError(f"station_id {old_station_id} not found in old stations")

    target_station = new_stations_by_name.get(_normalize_name(station_name))
    if not target_station:
        raise ValueError(f"station '{station_name}' not found in new database")

    return target_station.id


def _aggregate_store_stock(
    old_rows: list[dict[str, Any]],
    old_inventory_items_by_id: dict[int, dict[str, Any]],
    old_menu_names_by_id: dict[int, str],
    new_inventory_by_menu_name: dict[str, int],
    ambiguous_menu_names: set[str],
) -> tuple[dict[int, dict[str, Any]], int]:
    aggregated: dict[int, dict[str, Any]] = {}
    failed = 0

    for row in old_rows:
        try:
            target_inventory_id = _resolve_target_inventory_id(
                old_inventory_item_id=row["inventory_item_id"],
                old_inventory_items_by_id=old_inventory_items_by_id,
                old_menu_names_by_id=old_menu_names_by_id,
                new_inventory_by_menu_name=new_inventory_by_menu_name,
                ambiguous_menu_names=ambiguous_menu_names,
            )

            current = aggregated.setdefault(
                target_inventory_id,
                {
                    "quantity": 0.0,
                    "updated_at": None,
                },
            )
            current["quantity"] += _as_float(row.get("quantity"))
            current["updated_at"] = _max_datetime(current["updated_at"], row.get("updated_at"))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"Store stock {row.get('id')}: {exc}")

    return aggregated, failed


def _aggregate_station_stock(
    old_rows: list[dict[str, Any]],
    old_inventory_items_by_id: dict[int, dict[str, Any]],
    old_menu_names_by_id: dict[int, str],
    old_station_names_by_id: dict[int, str],
    new_inventory_by_menu_name: dict[str, int],
    new_stations_by_name: dict[str, Station],
    ambiguous_menu_names: set[str],
) -> tuple[dict[tuple[int, int], dict[str, Any]], int]:
    aggregated: dict[tuple[int, int], dict[str, Any]] = {}
    failed = 0

    for row in old_rows:
        try:
            target_inventory_id = _resolve_target_inventory_id(
                old_inventory_item_id=row["inventory_item_id"],
                old_inventory_items_by_id=old_inventory_items_by_id,
                old_menu_names_by_id=old_menu_names_by_id,
                new_inventory_by_menu_name=new_inventory_by_menu_name,
                ambiguous_menu_names=ambiguous_menu_names,
            )
            target_station_id = _resolve_target_station_id(
                old_station_id=row["station_id"],
                old_station_names_by_id=old_station_names_by_id,
                new_stations_by_name=new_stations_by_name,
            )

            key = (target_station_id, target_inventory_id)
            current = aggregated.setdefault(
                key,
                {
                    "quantity": 0.0,
                    "updated_at": None,
                },
            )
            current["quantity"] += _as_float(row.get("quantity"))
            current["updated_at"] = _max_datetime(current["updated_at"], row.get("updated_at"))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"Station stock {row.get('id')}: {exc}")

    return aggregated, failed


def _aggregate_station_snapshots(
    old_rows: list[dict[str, Any]],
    old_inventory_items_by_id: dict[int, dict[str, Any]],
    old_menu_names_by_id: dict[int, str],
    old_station_names_by_id: dict[int, str],
    new_inventory_by_menu_name: dict[str, int],
    new_stations_by_name: dict[str, Station],
    ambiguous_menu_names: set[str],
) -> tuple[dict[tuple[int, int, date], dict[str, Any]], int]:
    aggregated: dict[tuple[int, int, date], dict[str, Any]] = {}
    failed = 0

    for row in old_rows:
        try:
            target_inventory_id = _resolve_target_inventory_id(
                old_inventory_item_id=row["inventory_item_id"],
                old_inventory_items_by_id=old_inventory_items_by_id,
                old_menu_names_by_id=old_menu_names_by_id,
                new_inventory_by_menu_name=new_inventory_by_menu_name,
                ambiguous_menu_names=ambiguous_menu_names,
            )
            target_station_id = _resolve_target_station_id(
                old_station_id=row["station_id"],
                old_station_names_by_id=old_station_names_by_id,
                new_stations_by_name=new_stations_by_name,
            )
            snapshot_date = _ensure_date(row.get("snapshot_date"))

            key = (target_station_id, target_inventory_id, snapshot_date)
            current = aggregated.setdefault(
                key,
                {
                    "start_of_day_quantity": 0.0,
                    "added_quantity": 0.0,
                    "sold_quantity": 0.0,
                    "remaining_quantity": 0.0,
                    "created_at": None,
                },
            )
            current["start_of_day_quantity"] += _as_float(row.get("start_of_day_quantity"))
            current["added_quantity"] += _as_float(row.get("added_quantity"))
            current["sold_quantity"] += _as_float(row.get("sold_quantity"))
            current["remaining_quantity"] += _as_float(row.get("remaining_quantity"))
            current["created_at"] = _min_datetime(current["created_at"], row.get("created_at"))
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"Station snapshot {row.get('id')}: {exc}")

    return aggregated, failed


def _upsert_store_stock(rows: dict[int, dict[str, Any]], mode: str) -> dict[str, int]:
    stats = {"created": 0, "updated": 0, "skipped": 0, "failed": 0}

    for inventory_item_id, payload in rows.items():
        try:
            with db.session.begin_nested():
                existing = StoreStock.query.filter_by(inventory_item_id=inventory_item_id).first()
                if existing and mode == "create":
                    stats["skipped"] += 1
                    continue

                row = existing or StoreStock(inventory_item_id=inventory_item_id)
                if not existing:
                    db.session.add(row)

                row.quantity = payload["quantity"]
                if payload.get("updated_at"):
                    row.updated_at = payload["updated_at"]

                db.session.flush()

            if existing:
                stats["updated"] += 1
            else:
                stats["created"] += 1
        except Exception as exc:  # noqa: BLE001
            stats["failed"] += 1
            print(f"Store stock target inventory_item_id={inventory_item_id}: {exc}")

    return stats


def _upsert_station_stock(rows: dict[tuple[int, int], dict[str, Any]], mode: str) -> dict[str, int]:
    stats = {"created": 0, "updated": 0, "skipped": 0, "failed": 0}

    for (station_id, inventory_item_id), payload in rows.items():
        try:
            with db.session.begin_nested():
                existing = StationStock.query.filter_by(
                    station_id=station_id,
                    inventory_item_id=inventory_item_id,
                ).first()
                if existing and mode == "create":
                    stats["skipped"] += 1
                    continue

                row = existing or StationStock(
                    station_id=station_id,
                    inventory_item_id=inventory_item_id,
                )
                if not existing:
                    db.session.add(row)

                row.quantity = payload["quantity"]
                if payload.get("updated_at"):
                    row.updated_at = payload["updated_at"]

                db.session.flush()

            if existing:
                stats["updated"] += 1
            else:
                stats["created"] += 1
        except Exception as exc:  # noqa: BLE001
            stats["failed"] += 1
            print(
                "Station stock target "
                f"station_id={station_id}, inventory_item_id={inventory_item_id}: {exc}"
            )

    return stats


def _upsert_station_snapshots(rows: dict[tuple[int, int, date], dict[str, Any]], mode: str) -> dict[str, int]:
    stats = {"created": 0, "updated": 0, "skipped": 0, "failed": 0}

    for (station_id, inventory_item_id, snapshot_date), payload in rows.items():
        try:
            with db.session.begin_nested():
                existing = StationStockSnapshot.query.filter_by(
                    station_id=station_id,
                    inventory_item_id=inventory_item_id,
                    snapshot_date=snapshot_date,
                ).first()
                if existing and mode == "create":
                    stats["skipped"] += 1
                    continue

                row = existing or StationStockSnapshot(
                    station_id=station_id,
                    inventory_item_id=inventory_item_id,
                    snapshot_date=snapshot_date,
                )
                if not existing:
                    db.session.add(row)

                row.start_of_day_quantity = payload["start_of_day_quantity"]
                row.added_quantity = payload["added_quantity"]
                row.sold_quantity = payload["sold_quantity"]
                row.remaining_quantity = payload["remaining_quantity"]
                row.void_quantity = 0.0
                row.opening_adjusted = False
                if payload.get("created_at"):
                    row.created_at = payload["created_at"]

                db.session.flush()

            if existing:
                stats["updated"] += 1
            else:
                stats["created"] += 1
        except Exception as exc:  # noqa: BLE001
            stats["failed"] += 1
            print(
                "Station snapshot target "
                f"station_id={station_id}, inventory_item_id={inventory_item_id}, snapshot_date={snapshot_date}: {exc}"
            )

    return stats


def migrate_inventory_stock(
    old_engine,
    schema: str,
    mode: str,
    dry_run: bool,
) -> dict[str, dict[str, int]]:
    with old_engine.connect() as conn:
        old_inventory_items = _load_rows(conn, schema, "inventory_items")
        old_menu_items = _load_rows(conn, schema, "menu_items")
        old_stations = _load_rows(conn, schema, "stations")
        old_store_stock = _load_rows(conn, schema, "store_stock")
        old_station_stock = _load_rows(conn, schema, "station_stock")
        old_station_snapshots = _load_rows(conn, schema, "station_stock_snapshots")

    old_inventory_items_by_id = {row["id"]: row for row in old_inventory_items}
    old_menu_names_by_id = {
        row["id"]: name
        for row in old_menu_items
        if (name := _clean_text(row.get("name")))
    }
    old_station_names_by_id = {
        row["id"]: name
        for row in old_stations
        if (name := _clean_text(row.get("name")))
    }

    new_inventory_by_menu_name, ambiguous_menu_names = _build_new_menu_inventory_map()
    new_stations_by_name = _build_station_name_map()

    store_stock_rows, store_mapping_failed = _aggregate_store_stock(
        old_rows=old_store_stock,
        old_inventory_items_by_id=old_inventory_items_by_id,
        old_menu_names_by_id=old_menu_names_by_id,
        new_inventory_by_menu_name=new_inventory_by_menu_name,
        ambiguous_menu_names=ambiguous_menu_names,
    )
    station_stock_rows, station_mapping_failed = _aggregate_station_stock(
        old_rows=old_station_stock,
        old_inventory_items_by_id=old_inventory_items_by_id,
        old_menu_names_by_id=old_menu_names_by_id,
        old_station_names_by_id=old_station_names_by_id,
        new_inventory_by_menu_name=new_inventory_by_menu_name,
        new_stations_by_name=new_stations_by_name,
        ambiguous_menu_names=ambiguous_menu_names,
    )
    snapshot_rows, snapshot_mapping_failed = _aggregate_station_snapshots(
        old_rows=old_station_snapshots,
        old_inventory_items_by_id=old_inventory_items_by_id,
        old_menu_names_by_id=old_menu_names_by_id,
        old_station_names_by_id=old_station_names_by_id,
        new_inventory_by_menu_name=new_inventory_by_menu_name,
        new_stations_by_name=new_stations_by_name,
        ambiguous_menu_names=ambiguous_menu_names,
    )

    store_stats = _upsert_store_stock(store_stock_rows, mode=mode)
    station_stats = _upsert_station_stock(station_stock_rows, mode=mode)
    snapshot_stats = _upsert_station_snapshots(snapshot_rows, mode=mode)

    store_stats["failed"] += store_mapping_failed
    station_stats["failed"] += station_mapping_failed
    snapshot_stats["failed"] += snapshot_mapping_failed

    if dry_run:
        db.session.rollback()
    else:
        db.session.commit()

    return {
        "store_stock": {
            **store_stats,
            "source_rows": len(old_store_stock),
            "target_rows": len(store_stock_rows),
        },
        "station_stock": {
            **station_stats,
            "source_rows": len(old_station_stock),
            "target_rows": len(station_stock_rows),
        },
        "station_stock_snapshots": {
            **snapshot_stats,
            "source_rows": len(old_station_snapshots),
            "target_rows": len(snapshot_rows),
        },
        "context": {
            "ambiguous_menu_links": len(ambiguous_menu_names),
            "new_linked_menu_items": len(new_inventory_by_menu_name),
            "new_stations": len(new_stations_by_name),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate old store stock, station stock, and station stock snapshots into the new inventory schema."
    )
    parser.add_argument("--old-db-name", help="Old DB name")
    parser.add_argument("--old-db-user", help="Old DB user")
    parser.add_argument("--old-db-password", help="Old DB password")
    parser.add_argument("--old-db-host", default="127.0.0.1", help="Old DB host")
    parser.add_argument("--old-db-port", type=int, default=5432, help="Old DB port")
    parser.add_argument("--old-db-schema", default="public", help="Old DB schema")
    parser.add_argument("--mode", choices=["create", "upsert"], default="upsert")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    old_db_name = _prompt_if_missing(args.old_db_name, "Old DB name")
    old_db_user = _prompt_if_missing(args.old_db_user, "Old DB user")
    old_db_password = _prompt_if_missing(args.old_db_password, "Old DB password", secret=True)
    old_db_host = _prompt_if_missing(args.old_db_host, "Old DB host")

    old_engine = _connect_old_db(
        host=old_db_host,
        port=args.old_db_port,
        name=old_db_name,
        user=old_db_user,
        password=old_db_password,
    )

    app = create_inventory_app()
    with app.app_context():
        stats = migrate_inventory_stock(
            old_engine=old_engine,
            schema=args.old_db_schema,
            mode=args.mode,
            dry_run=args.dry_run,
        )

    print("Inventory stock migration complete:")
    print(
        "  store_stock: "
        f"source_rows={stats['store_stock']['source_rows']}, "
        f"target_rows={stats['store_stock']['target_rows']}, "
        f"created={stats['store_stock']['created']}, "
        f"updated={stats['store_stock']['updated']}, "
        f"skipped={stats['store_stock']['skipped']}, "
        f"failed={stats['store_stock']['failed']}"
    )
    print(
        "  station_stock: "
        f"source_rows={stats['station_stock']['source_rows']}, "
        f"target_rows={stats['station_stock']['target_rows']}, "
        f"created={stats['station_stock']['created']}, "
        f"updated={stats['station_stock']['updated']}, "
        f"skipped={stats['station_stock']['skipped']}, "
        f"failed={stats['station_stock']['failed']}"
    )
    print(
        "  station_stock_snapshots: "
        f"source_rows={stats['station_stock_snapshots']['source_rows']}, "
        f"target_rows={stats['station_stock_snapshots']['target_rows']}, "
        f"created={stats['station_stock_snapshots']['created']}, "
        f"updated={stats['station_stock_snapshots']['updated']}, "
        f"skipped={stats['station_stock_snapshots']['skipped']}, "
        f"failed={stats['station_stock_snapshots']['failed']}"
    )
    print(
        "  context: "
        f"new_linked_menu_items={stats['context']['new_linked_menu_items']}, "
        f"new_stations={stats['context']['new_stations']}, "
        f"ambiguous_menu_links={stats['context']['ambiguous_menu_links']}"
    )


if __name__ == "__main__":
    main()
