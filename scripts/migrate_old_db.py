import argparse
import getpass
import os
import re
import sys
from typing import Any

from sqlalchemy import create_engine, func, text

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app, db
from app.models.models import Category, MenuItem, Station, SubCategory


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


def _upsert_category(name: str, quantity_step: Any | None) -> Category:
    category = _get_by_name_case_insensitive(Category, name)
    if not category:
        category = Category(name=name)
        db.session.add(category)
    if quantity_step is not None:
        category.quantity_step = quantity_step
    return category


def _upsert_station(name: str, password_hash: Any | None) -> Station:
    station = _get_by_name_case_insensitive(Station, name)
    if not station:
        station = Station(name=name, password_hash=password_hash or "")
        db.session.add(station)
    if password_hash:
        station.password_hash = password_hash
    return station


def _upsert_subcategory(name: str, category: Category | None) -> SubCategory:
    query = SubCategory.query.filter(SubCategory.name == name)
    if category:
        query = query.filter(SubCategory.category_id == category.id)
    subcategory = query.first()
    if not subcategory:
        subcategory = SubCategory(name=name, category=category)
        db.session.add(subcategory)
    else:
        subcategory.category = category
    return subcategory


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


def migrate(
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
        old_categories = _load_rows(conn, schema, "categories")
        old_subcategories = _load_rows(conn, schema, "subcategories")
        old_stations = _load_rows(conn, schema, "stations")
        old_menu_items = _load_rows(conn, schema, "menu_items")

    category_by_old_id: dict[int, Category] = {}
    subcategory_by_old_id: dict[int, SubCategory] = {}
    station_by_old_id: dict[int, Station] = {}

    for row in old_categories:
        name = _clean_text(row.get("name"))
        if not name:
            continue
        category = _upsert_category(name, row.get("quantity_step"))
        category_by_old_id[row["id"]] = category

    for row in old_stations:
        name = _clean_text(row.get("name"))
        if not name:
            continue
        station = _upsert_station(name, row.get("password_hash"))
        station.printer_identifier = row.get("printer_identifier")
        station_by_old_id[row["id"]] = station

    for row in old_subcategories:
        name = _clean_text(row.get("name"))
        if not name:
            continue
        category = None
        category_id = row.get("category_id")
        if category_id is not None and category_id in category_by_old_id:
            category = category_by_old_id[category_id]
        subcategory = _upsert_subcategory(name, category)
        subcategory_by_old_id[row["id"]] = subcategory

    db.session.flush()

    for row in old_menu_items:
        try:
            with db.session.begin_nested():
                name = _clean_text(row.get("name"))
                if not name:
                    raise ValueError("menu_items.name is required")

                existing = _get_by_name_case_insensitive(MenuItem, name)
                if existing and mode == "create":
                    skipped += 1
                    continue

                station_id = row.get("station_id")
                station = station_by_old_id.get(station_id)
                if not station:
                    raise ValueError(f"station_id {station_id} not found for menu item {name}")

                subcategory = None
                subcategory_id = row.get("subcategory_id")
                if subcategory_id is not None:
                    subcategory = subcategory_by_old_id.get(subcategory_id)

                item = existing or MenuItem(name=name)
                if not existing:
                    db.session.add(item)

                item.description = row.get("description")
                item.price = row.get("price")
                item.vip_price = row.get("vip_price")
                item.quantity_step = row.get("quantity_step")
                item.is_available = row.get("is_available", True)
                item.image_url = row.get("image_url")
                item.station_rel = station
                item.subcategory = subcategory

                db.session.flush()

            if existing:
                updated += 1
            else:
                created += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"Menu item {row.get('id')}: {exc}")

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
    parser = argparse.ArgumentParser(description="Migrate old Postgres data into the new schema.")
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
        stats = migrate(
            old_engine=old_engine,
            schema=args.old_db_schema,
            mode=args.mode,
            dry_run=args.dry_run,
        )

    print(
        "Migration complete: "
        f"created={stats['created']}, updated={stats['updated']}, "
        f"skipped={stats['skipped']}, failed={stats['failed']}"
    )


if __name__ == "__main__":
    main()
