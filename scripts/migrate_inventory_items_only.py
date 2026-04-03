import argparse
import getpass
import os
import re
import sys
from typing import Any

from sqlalchemy import create_engine, func, text

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app, db
from app.models.inventory_models import InventoryItem


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
    rows = [dict(row._mapping) for row in result]
    return rows


def migrate_inventory_items(
    old_engine,
    schema: str,
    mode: str,
    dry_run: bool,
):
    created = 0
    updated = 0
    skipped = 0
    failed = 0

    with old_engine.connect() as conn:
        old_inventory_items = _load_rows(conn, schema, "inventory_items")

    for row in old_inventory_items:
        try:
            name = _clean_text(row.get("name"))
            if not name:
                continue

            existing = _get_by_name_case_insensitive(InventoryItem, name)
            if existing and mode == "create":
                skipped += 1
                continue

            item = existing or InventoryItem(name=name)
            if not existing:
                db.session.add(item)

            unit = _clean_text(row.get("unit"))
            if unit:
                item.unit = unit
            if row.get("is_active") is not None:
                item.is_active = bool(row.get("is_active"))
            if row.get("created_at"):
                item.created_at = row.get("created_at")

            if existing:
                updated += 1
            else:
                created += 1
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
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate inventory items from old Postgres data into the new schema.")
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

    app = create_app()
    with app.app_context():
        stats = migrate_inventory_items(
            old_engine=old_engine,
            schema=args.old_db_schema,
            mode=args.mode,
            dry_run=args.dry_run,
        )

    print(
        "Inventory migration complete: "
        f"created={stats['created']}, updated={stats['updated']}, "
        f"skipped={stats['skipped']}, failed={stats['failed']}"
    )


if __name__ == "__main__":
    main()
