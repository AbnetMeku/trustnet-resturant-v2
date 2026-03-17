import argparse
import csv
import os
import sys
from decimal import Decimal, InvalidOperation
from typing import Any

from werkzeug.security import generate_password_hash

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app, db
from app.models.models import Category, MenuItem, Station, SubCategory
from sqlalchemy import func

ALLOWED_QUANTITY_STEPS = {Decimal("0.5"), Decimal("1.0")}
# Supported CSV headers (case-insensitive):
# name, price, vip_price, description, quantity_step, is_available, image_url,
# station or station_id, category/category_name, subcategory/subcategory_name, subcategory_id


def _clean_value(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text != "" else None


def _parse_decimal(value: Any, field_name: str) -> Decimal | None:
    raw = _clean_value(value)
    if raw is None:
        return None
    try:
        parsed = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError(f"{field_name} must be a number or blank") from exc
    if parsed < 0:
        raise ValueError(f"{field_name} must be a non-negative number or blank")
    return parsed


def _parse_int(value: Any, field_name: str) -> int | None:
    raw = _clean_value(value)
    if raw is None:
        return None
    if raw.isdigit():
        return int(raw)
    raise ValueError(f"{field_name} must be an integer")


def _parse_bool(value: Any, default: bool = True) -> bool:
    raw = _clean_value(value)
    if raw is None:
        return default
    lowered = raw.lower()
    if lowered in {"true", "1", "yes", "y", "on"}:
        return True
    if lowered in {"false", "0", "no", "n", "off"}:
        return False
    raise ValueError("is_available must be true/false")


def _get_row_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row:
            value = row[key]
            if _clean_value(value) is not None:
                return value
    return None


def _get_or_create_station(name: str, create_missing: bool) -> Station:
    station = Station.query.filter_by(name=name).first()
    if station:
        return station
    if not create_missing:
        raise ValueError(f"Station '{name}' not found")
    station = Station(name=name, password_hash=generate_password_hash("1234"))
    db.session.add(station)
    db.session.flush()
    return station


def _get_or_create_category(name: str, create_missing: bool) -> Category:
    category = Category.query.filter_by(name=name).first()
    if category:
        return category
    if not create_missing:
        raise ValueError(f"Category '{name}' not found")
    category = Category(name=name, quantity_step=Decimal("1.0"))
    db.session.add(category)
    db.session.flush()
    return category


def _get_or_create_subcategory(name: str, category: Category, create_missing: bool) -> SubCategory:
    subcategory = SubCategory.query.filter_by(name=name, category_id=category.id).first()
    if subcategory:
        return subcategory
    if not create_missing:
        raise ValueError(f"Subcategory '{name}' not found in category '{category.name}'")
    subcategory = SubCategory(name=name, category=category)
    db.session.add(subcategory)
    db.session.flush()
    return subcategory


def _resolve_subcategory(
    row: dict[str, Any],
    create_missing: bool,
) -> SubCategory | None:
    subcategory_id = _parse_int(_get_row_value(row, "subcategory_id"), "subcategory_id")
    if subcategory_id is not None:
        subcategory = db.session.get(SubCategory, subcategory_id)
        if not subcategory:
            raise ValueError(f"Subcategory id {subcategory_id} not found")
        return subcategory

    subcategory_name = _clean_value(_get_row_value(row, "subcategory", "subcategory_name"))
    if not subcategory_name:
        return None

    category_name = _clean_value(_get_row_value(row, "category", "category_name"))
    if not category_name:
        raise ValueError("subcategory provided without category; use subcategory_id or add category")

    category = _get_or_create_category(category_name, create_missing)
    return _get_or_create_subcategory(subcategory_name, category, create_missing)


def _resolve_station(row: dict[str, Any], create_missing: bool) -> Station:
    station_id = _parse_int(_get_row_value(row, "station_id"), "station_id")
    if station_id is not None:
        station = db.session.get(Station, station_id)
        if not station:
            raise ValueError(f"Station id {station_id} not found")
        return station

    station_name = _clean_value(_get_row_value(row, "station", "station_name"))
    if not station_name:
        raise ValueError("station or station_id is required")
    return _get_or_create_station(station_name, create_missing)


def _find_menu_item_by_name(name: str) -> MenuItem | None:
    return MenuItem.query.filter(func.lower(MenuItem.name) == name.lower()).first()


def import_csv(
    path: str,
    mode: str,
    create_missing: bool,
    dry_run: bool,
    encoding: str,
) -> dict[str, int]:
    created = 0
    updated = 0
    skipped = 0
    failed = 0

    with open(path, "r", encoding=encoding, newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row")

        for index, raw_row in enumerate(reader, start=2):
            row = {str(k).strip().lower(): v for k, v in raw_row.items() if k is not None}
            try:
                with db.session.begin_nested():
                    name = _clean_value(_get_row_value(row, "name"))
                    if not name:
                        raise ValueError("name is required")

                    station = _resolve_station(row, create_missing)
                    subcategory = _resolve_subcategory(row, create_missing)

                    price = _parse_decimal(_get_row_value(row, "price"), "price")
                    vip_price = _parse_decimal(_get_row_value(row, "vip_price"), "vip_price")
                    if price is None and vip_price is None:
                        raise ValueError("Provide at least one price: price or vip_price")

                    quantity_step = _parse_decimal(_get_row_value(row, "quantity_step"), "quantity_step")
                    if quantity_step is not None and quantity_step not in ALLOWED_QUANTITY_STEPS:
                        raise ValueError("quantity_step must be 0.5, 1.0, or blank")

                    is_available = _parse_bool(_get_row_value(row, "is_available"), default=True)
                    description = _clean_value(_get_row_value(row, "description"))
                    image_url = _clean_value(_get_row_value(row, "image_url"))

                    existing = _find_menu_item_by_name(name)
                    if existing and mode == "create":
                        skipped += 1
                        continue

                    item = existing or MenuItem(name=name)
                    if not existing:
                        db.session.add(item)

                    item.description = description
                    item.price = price
                    item.vip_price = vip_price
                    item.quantity_step = quantity_step
                    item.is_available = is_available
                    item.image_url = image_url
                    item.station_rel = station
                    item.subcategory = subcategory

                    db.session.flush()

                if existing:
                    updated += 1
                elif not (existing and mode == "create"):
                    created += 1

            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f"Row {index}: {exc}")

    if dry_run:
        db.session.rollback()
    else:
        db.session.commit()

    return {"created": created, "updated": updated, "skipped": skipped, "failed": failed}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import menu items from a CSV file.")
    parser.add_argument("--file", required=True, help="Path to CSV file")
    parser.add_argument(
        "--mode",
        choices=["create", "upsert"],
        default="create",
        help="create = skip existing, upsert = update existing",
    )
    parser.add_argument(
        "--create-missing",
        action="store_true",
        help="Create missing stations/categories/subcategories",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate only; do not write changes")
    parser.add_argument(
        "--encoding",
        default="utf-8-sig",
        help="CSV encoding (default: utf-8-sig)",
    )

    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        stats = import_csv(
            path=args.file,
            mode=args.mode,
            create_missing=args.create_missing,
            dry_run=args.dry_run,
            encoding=args.encoding,
        )

    print(
        "Import complete: "
        f"created={stats['created']}, updated={stats['updated']}, "
        f"skipped={stats['skipped']}, failed={stats['failed']}"
    )


if __name__ == "__main__":
    main()
