import argparse
import getpass
import os
import re
import sys
from typing import Any

from sqlalchemy import create_engine, func, text

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_inventory_app, db
from app.models import InventoryItem, InventoryMenuLink, MenuItem


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


def _get_by_name_case_insensitive(model, name: str):
    return model.query.filter(func.lower(model.name) == name.lower()).first()


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


def _legacy_deduction_rule(unit: str | None) -> tuple[str, float, float]:
    normalized_unit = (unit or "").strip().lower()
    if normalized_unit == "bottle":
        return "bottle", 1.0, 1.0
    if normalized_unit == "shot":
        return "shot", 1.0, 1.0
    return "custom_ml", 1.0, 1.0


def migrate_inventory_items_with_links(
    old_engine,
    schema: str,
    mode: str,
    dry_run: bool,
):
    created = 0
    updated = 0
    skipped = 0
    failed = 0
    links_created = 0
    links_updated = 0
    links_skipped = 0

    with old_engine.connect() as conn:
        old_inventory_items = _load_rows(conn, schema, "inventory_items")
        old_menu_items = _load_rows(conn, schema, "menu_items")

    old_menu_items_by_id = {row["id"]: row for row in old_menu_items}
    new_menu_items_by_name = {
        _normalize_name(item.name): item
        for item in MenuItem.query.order_by(MenuItem.id.asc()).all()
        if _normalize_name(item.name)
    }

    for row in old_inventory_items:
        try:
            with db.session.begin_nested():
                old_menu_item_id = row.get("menu_item_id")
                if not old_menu_item_id:
                    raise ValueError("menu_item_id is missing in old inventory item")

                old_menu_item = old_menu_items_by_id.get(old_menu_item_id)
                if not old_menu_item:
                    raise ValueError(f"old menu_item_id {old_menu_item_id} not found")

                menu_name = _clean_text(old_menu_item.get("name"))
                if not menu_name:
                    raise ValueError(f"old menu item {old_menu_item_id} has no name")

                new_menu_item = new_menu_items_by_name.get(_normalize_name(menu_name))
                if not new_menu_item:
                    raise ValueError(f"new menu item '{menu_name}' not found")

                existing_link = InventoryMenuLink.query.filter_by(menu_item_id=new_menu_item.id).first()
                if existing_link and mode == "create":
                    skipped += 1
                    links_skipped += 1
                    continue

                inventory_name = menu_name
                item = existing_link.inventory_item if existing_link else _get_by_name_case_insensitive(InventoryItem, inventory_name)

                is_new_item = item is None
                if is_new_item:
                    item = InventoryItem(name=inventory_name)
                    db.session.add(item)

                unit = _clean_text(row.get("unit")) or item.unit or "Bottle"
                item.unit = unit
                item.is_active = bool(row.get("is_active", True))
                if row.get("created_at"):
                    item.created_at = row.get("created_at")

                db.session.flush()

                serving_type, serving_value, deduction_ratio = _legacy_deduction_rule(unit)

                if existing_link:
                    existing_link.inventory_item_id = item.id
                    existing_link.serving_type = serving_type
                    existing_link.serving_value = serving_value
                    existing_link.deduction_ratio = deduction_ratio
                    links_updated += 1
                    if is_new_item:
                        created += 1
                    else:
                        updated += 1
                else:
                    link = InventoryMenuLink(
                        inventory_item_id=item.id,
                        menu_item_id=new_menu_item.id,
                        deduction_ratio=deduction_ratio,
                        serving_type=serving_type,
                        serving_value=serving_value,
                    )
                    db.session.add(link)
                    links_created += 1
                    if is_new_item:
                        created += 1
                    else:
                        updated += 1

        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"Inventory item {row.get('id')}: {exc}")

    if dry_run:
        db.session.rollback()
    else:
        db.session.commit()

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "links_created": links_created,
        "links_updated": links_updated,
        "links_skipped": links_skipped,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate legacy inventory items into the new inventory schema with menu links."
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
        stats = migrate_inventory_items_with_links(
            old_engine=old_engine,
            schema=args.old_db_schema,
            mode=args.mode,
            dry_run=args.dry_run,
        )

    print(
        "Inventory link migration complete: "
        f"created={stats['created']}, updated={stats['updated']}, "
        f"skipped={stats['skipped']}, failed={stats['failed']}, "
        f"links_created={stats['links_created']}, links_updated={stats['links_updated']}, "
        f"links_skipped={stats['links_skipped']}"
    )


if __name__ == "__main__":
    main()
