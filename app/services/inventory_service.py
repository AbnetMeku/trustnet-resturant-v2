from app.extensions import db
from app.models import (
    InventoryMenuLink,
    Station,
    StationStock,
    StationStockSnapshot,
    StoreStock,
    StoreStockSnapshot,
)
from app.utils.timezone import get_eat_today
from datetime import timedelta


def resolve_link_deduction_amount(link, quantity):
    inventory_item = link.inventory_item
    container_size_ml = float(getattr(inventory_item, "container_size_ml", 0) or 0)
    default_shot_ml = float(getattr(inventory_item, "default_shot_ml", 0) or 0)
    shots_per_bottle = float(getattr(inventory_item, "shots_per_bottle", 0) or 0)
    serving_type = str(getattr(link, "serving_type", "") or "").strip().lower()
    serving_value = float(getattr(link, "serving_value", 0) or 0)

    if shots_per_bottle > 0:
        if serving_type == "bottle":
            return max(serving_value, 0) * shots_per_bottle * float(quantity)
        if serving_type in {"shot", "custom_ml"}:
            return max(serving_value, 0) * float(quantity)

    if serving_type == "shot" and container_size_ml > 0 and default_shot_ml > 0:
        return (default_shot_ml * max(serving_value, 0)) / container_size_ml * float(quantity)

    if serving_type == "bottle":
        return max(serving_value, 0) * float(quantity)

    if serving_type == "custom_ml" and container_size_ml > 0:
        return max(serving_value, 0) / container_size_ml * float(quantity)

    return float(link.deduction_ratio or 0) * float(quantity)


def _station_from_name(station_name):
    return Station.query.filter_by(name=station_name).first()


def get_or_create_store_snapshot(inventory_item_id, snapshot_date=None, opening_quantity=None):
    target_date = snapshot_date or get_eat_today()
    snapshot = StoreStockSnapshot.query.filter_by(
        inventory_item_id=inventory_item_id,
        snapshot_date=target_date,
    ).first()
    if snapshot:
        return snapshot

    if opening_quantity is None:
        stock = StoreStock.query.filter_by(inventory_item_id=inventory_item_id).first()
        opening_quantity = float(stock.quantity or 0) if stock else 0.0

    snapshot = StoreStockSnapshot(
        inventory_item_id=inventory_item_id,
        snapshot_date=target_date,
        opening_quantity=float(opening_quantity or 0),
        purchased_quantity=0.0,
        transferred_out_quantity=0.0,
        closing_quantity=float(opening_quantity or 0),
    )
    db.session.add(snapshot)
    db.session.flush()
    return snapshot


def get_or_create_station_snapshot(station_id, inventory_item_id, snapshot_date=None, opening_quantity=None):
    target_date = snapshot_date or get_eat_today()
    snapshot = StationStockSnapshot.query.filter_by(
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=target_date,
    ).first()
    if snapshot:
        return snapshot

    if opening_quantity is None:
        stock = StationStock.query.filter_by(
            station_id=station_id,
            inventory_item_id=inventory_item_id,
        ).first()
        opening_quantity = float(stock.quantity or 0) if stock else 0.0

    snapshot = StationStockSnapshot(
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=target_date,
        start_of_day_quantity=float(opening_quantity or 0),
        added_quantity=0.0,
        sold_quantity=0.0,
        void_quantity=0.0,
        remaining_quantity=float(opening_quantity or 0),
    )
    db.session.add(snapshot)
    db.session.flush()
    return snapshot


def get_or_create_today_snapshot(station_name, inventory_item_id):
    station = _station_from_name(station_name)
    if not station:
        return None
    return get_or_create_station_snapshot(station.id, inventory_item_id, snapshot_date=get_eat_today())


def _sync_future_station_openings(station_id, inventory_item_id, start_date, end_date):
    """
    Align next-day opening quantities to previous-day closing quantities.
    Stops if a day has a manual opening adjustment.
    """
    if start_date >= end_date:
        return

    previous_snapshot = StationStockSnapshot.query.filter_by(
        station_id=station_id,
        inventory_item_id=inventory_item_id,
        snapshot_date=start_date,
    ).first()
    if not previous_snapshot:
        return

    previous_remaining = float(previous_snapshot.remaining_quantity or 0)
    day = start_date + timedelta(days=1)

    while day <= end_date:
        snapshot = StationStockSnapshot.query.filter_by(
            station_id=station_id,
            inventory_item_id=inventory_item_id,
            snapshot_date=day,
        ).first()

        if snapshot is None:
            snapshot = get_or_create_station_snapshot(
                station_id=station_id,
                inventory_item_id=inventory_item_id,
                snapshot_date=day,
                opening_quantity=previous_remaining,
            )
        elif snapshot.opening_adjusted:
            break
        else:
            snapshot.start_of_day_quantity = previous_remaining

        snapshot.remaining_quantity = (
            float(snapshot.start_of_day_quantity or 0)
            + float(snapshot.added_quantity or 0)
            - float(snapshot.sold_quantity or 0)
            + float(snapshot.void_quantity or 0)
        )
        previous_remaining = float(snapshot.remaining_quantity or 0)
        day = day + timedelta(days=1)


def update_store_snapshot_purchase(inventory_item_id, quantity_delta, snapshot_date=None, opening_quantity=None):
    if quantity_delta == 0:
        return None
    snapshot = get_or_create_store_snapshot(
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        opening_quantity=opening_quantity,
    )
    snapshot.purchased_quantity = float(snapshot.purchased_quantity or 0) + float(quantity_delta)
    snapshot.closing_quantity = (
        float(snapshot.opening_quantity or 0)
        + float(snapshot.purchased_quantity or 0)
        - float(snapshot.transferred_out_quantity or 0)
    )
    db.session.flush()
    return snapshot


def update_store_snapshot_transfer(inventory_item_id, quantity_delta, snapshot_date=None, opening_quantity=None):
    if quantity_delta == 0:
        return None
    snapshot = get_or_create_store_snapshot(
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        opening_quantity=opening_quantity,
    )
    snapshot.transferred_out_quantity = float(snapshot.transferred_out_quantity or 0) + float(quantity_delta)
    snapshot.closing_quantity = (
        float(snapshot.opening_quantity or 0)
        + float(snapshot.purchased_quantity or 0)
        - float(snapshot.transferred_out_quantity or 0)
    )
    db.session.flush()
    return snapshot


def adjust_inventory_for_addition(station_name, inventory_item_id, quantity, snapshot_date=None, opening_quantity=None):
    if quantity == 0:
        return None

    station = _station_from_name(station_name)
    if not station:
        return None

    station_stock = StationStock.query.filter_by(
        station_id=station.id,
        inventory_item_id=inventory_item_id,
    ).first()
    if not station_stock:
        station_stock = StationStock(
            station_id=station.id,
            inventory_item_id=inventory_item_id,
            quantity=0,
        )
        db.session.add(station_stock)
        db.session.flush()

    snapshot = get_or_create_station_snapshot(
        station_id=station.id,
        inventory_item_id=inventory_item_id,
        snapshot_date=snapshot_date,
        opening_quantity=opening_quantity,
    )
    snapshot.added_quantity = float(snapshot.added_quantity or 0) + float(quantity)
    snapshot.remaining_quantity = (
        float(snapshot.start_of_day_quantity or 0)
        + float(snapshot.added_quantity or 0)
        - float(snapshot.sold_quantity or 0)
        + float(snapshot.void_quantity or 0)
    )
    db.session.flush()
    return snapshot


def adjust_inventory_for_order_item(station_name, menu_item_id, quantity, reverse=False, snapshot_date=None):
    if quantity <= 0:
        return

    station = _station_from_name(station_name)
    if not station:
        return

    links = InventoryMenuLink.query.filter_by(menu_item_id=menu_item_id).all()
    if not links:
        return

    target_date = snapshot_date or get_eat_today()

    for link in links:
        inventory_item = link.inventory_item
        deduction_amount = resolve_link_deduction_amount(link, quantity)

        station_stock = StationStock.query.filter_by(
            station_id=station.id,
            inventory_item_id=inventory_item.id,
        ).first()
        if not station_stock:
            station_stock = StationStock(
                station_id=station.id,
                inventory_item_id=inventory_item.id,
                quantity=0,
            )
            db.session.add(station_stock)
            db.session.flush()

        opening_quantity = float(station_stock.quantity or 0)
        if reverse:
            station_stock.quantity = float(station_stock.quantity or 0) + deduction_amount
        else:
            station_stock.quantity = float(station_stock.quantity or 0) - deduction_amount

        snapshot = get_or_create_station_snapshot(
            station.id,
            inventory_item.id,
            snapshot_date=target_date,
            opening_quantity=opening_quantity,
        )

        if reverse:
            snapshot.void_quantity = float(snapshot.void_quantity or 0) + deduction_amount
        else:
            snapshot.sold_quantity = float(snapshot.sold_quantity or 0) + deduction_amount

        snapshot.remaining_quantity = (
            float(snapshot.start_of_day_quantity or 0)
            + float(snapshot.added_quantity or 0)
            - float(snapshot.sold_quantity or 0)
            + float(snapshot.void_quantity or 0)
        )

        if target_date < get_eat_today():
            _sync_future_station_openings(
                station_id=station.id,
                inventory_item_id=inventory_item.id,
                start_date=target_date,
                end_date=get_eat_today(),
            )

    db.session.commit()
