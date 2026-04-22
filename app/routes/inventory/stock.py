from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from sqlalchemy import func

from app.extensions import db
from app.models import (
    InventoryItem,
    InventoryMenuLink,
    MenuItem,
    Station,
    StationStock,
    StationStockSnapshot,
    StockPurchase,
    StockTransfer,
    StoreStock,
    StoreStockSnapshot,
)
from app.utils.timezone import get_business_day_bounds, get_eat_today
from app.utils.decorators import roles_required
from app.services.inventory_service import get_or_create_station_snapshot, get_or_create_store_snapshot
from app.services.cloud_sync import queue_cloud_sync_delete, queue_cloud_sync_upsert

inventory_stock_bp = Blueprint("inventory_stock_bp", __name__, url_prefix="/inventory/stock")


def _as_float(value):
    return float(value or 0)


def _parse_business_date():
    date_str = request.args.get("date")
    try:
        return datetime.fromisoformat(date_str).date() if date_str else get_eat_today()
    except ValueError:
        return None


def _parse_non_negative_float(value, field_name):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")
    if parsed < 0:
        raise ValueError(f"{field_name} must be zero or greater")
    return parsed


def _map_sum_by_inventory_item(model, quantity_column, *filters):
    return {
        inventory_item_id: _as_float(quantity)
        for inventory_item_id, quantity in (
            db.session.query(
                model.inventory_item_id,
                func.coalesce(func.sum(quantity_column), 0),
            )
            .filter(*filters)
            .group_by(model.inventory_item_id)
            .all()
        )
    }


def _serialize_store_stock(stock):
    return {
        "id": stock.id,
        "inventory_item_id": stock.inventory_item_id,
        "inventory_item_name": stock.inventory_item.name if stock.inventory_item else None,
        "quantity": stock.quantity,
        "updated_at": stock.updated_at,
    }


def _serialize_station_stock(stock):
    return {
        "id": stock.id,
        "station_id": stock.station_id,
        "station_name": stock.station.name if stock.station else None,
        "inventory_item_id": stock.inventory_item_id,
        "inventory_item_name": stock.inventory_item.name if stock.inventory_item else None,
        "quantity": stock.quantity,
        "updated_at": stock.updated_at,
    }


def _station_id_from_token():
    claims = get_jwt() or {}
    station_id = claims.get("station_id")
    if station_id is not None:
        try:
            return int(station_id)
        except (TypeError, ValueError):
            return None
    identity = get_jwt_identity()
    try:
        return int(identity)
    except (TypeError, ValueError):
        return None


@inventory_stock_bp.route("/store", methods=["POST"])
@jwt_required()
def create_store_stock():
    data = request.get_json() or {}
    inventory_item_id = data.get("inventory_item_id")
    quantity = float(data.get("quantity", 0) or 0)

    if not inventory_item_id:
        return jsonify({"msg": "inventory_item_id is required"}), 400

    item = db.session.get(InventoryItem, inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    existing_stock = StoreStock.query.filter_by(inventory_item_id=inventory_item_id).first()
    if existing_stock:
        existing_stock.quantity = _as_float(existing_stock.quantity) + quantity
        db.session.commit()
        queue_cloud_sync_upsert("store_stock", existing_stock)
        return jsonify({"msg": "Store stock updated", "quantity": existing_stock.quantity}), 200

    stock = StoreStock(inventory_item_id=inventory_item_id, quantity=quantity)
    db.session.add(stock)
    db.session.commit()
    queue_cloud_sync_upsert("store_stock", stock)
    return jsonify({"msg": "Store stock created", "id": stock.id}), 201


@inventory_stock_bp.route("/store", methods=["GET"])
@jwt_required()
def get_all_store_stock():
    stocks = StoreStock.query.order_by(StoreStock.updated_at.desc()).all()
    return jsonify([_serialize_store_stock(stock) for stock in stocks]), 200


@inventory_stock_bp.route("/store/<int:stock_id>", methods=["PUT"])
@jwt_required()
def update_store_stock(stock_id):
    stock = db.session.get(StoreStock, stock_id)
    if not stock:
        return jsonify({"msg": "Store stock not found"}), 404

    data = request.get_json() or {}
    stock.quantity = data.get("quantity", stock.quantity)
    db.session.commit()
    queue_cloud_sync_upsert("store_stock", stock)
    return jsonify({"msg": "Store stock updated successfully"}), 200


@inventory_stock_bp.route("/store/<int:stock_id>", methods=["DELETE"])
@jwt_required()
def delete_store_stock(stock_id):
    stock = db.session.get(StoreStock, stock_id)
    if not stock:
        return jsonify({"msg": "Store stock not found"}), 404

    db.session.delete(stock)
    queue_cloud_sync_delete("store_stock", stock_id)
    db.session.commit()
    return jsonify({"msg": "Store stock deleted"}), 200


@inventory_stock_bp.route("/station", methods=["POST"])
@jwt_required()
def create_station_stock():
    data = request.get_json() or {}
    inventory_item_id = data.get("inventory_item_id")
    station_id = data.get("station_id")
    quantity = float(data.get("quantity", 0) or 0)

    if not inventory_item_id or not station_id:
        return jsonify({"msg": "inventory_item_id and station_id are required"}), 400

    item = db.session.get(InventoryItem, inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    station = db.session.get(Station, station_id)
    if not station:
        return jsonify({"msg": "Station not found"}), 404

    existing_stock = StationStock.query.filter_by(
        inventory_item_id=inventory_item_id,
        station_id=station_id,
    ).first()
    if existing_stock:
        existing_stock.quantity = _as_float(existing_stock.quantity) + quantity
        db.session.commit()
        queue_cloud_sync_upsert("station_stock", existing_stock)
        return jsonify({"msg": "Station stock updated", "quantity": existing_stock.quantity}), 200

    stock = StationStock(inventory_item_id=inventory_item_id, station_id=station_id, quantity=quantity)
    db.session.add(stock)
    db.session.commit()
    queue_cloud_sync_upsert("station_stock", stock)
    return jsonify({"msg": "Station stock created", "id": stock.id}), 201


@inventory_stock_bp.route("/station", methods=["GET"])
@jwt_required()
def get_all_station_stock():
    station_id = request.args.get("station_id")
    query = StationStock.query
    if station_id:
        query = query.filter_by(station_id=station_id)
    stocks = query.order_by(StationStock.updated_at.desc()).all()
    return jsonify([_serialize_station_stock(stock) for stock in stocks]), 200


@inventory_stock_bp.route("/station/<int:stock_id>", methods=["PUT"])
@jwt_required()
def update_station_stock(stock_id):
    stock = db.session.get(StationStock, stock_id)
    if not stock:
        return jsonify({"msg": "Station stock not found"}), 404

    data = request.get_json() or {}
    stock.quantity = data.get("quantity", stock.quantity)
    db.session.commit()
    queue_cloud_sync_upsert("station_stock", stock)
    return jsonify({"msg": "Station stock updated successfully"}), 200


@inventory_stock_bp.route("/station/<int:stock_id>", methods=["DELETE"])
@jwt_required()
def delete_station_stock(stock_id):
    stock = db.session.get(StationStock, stock_id)
    if not stock:
        return jsonify({"msg": "Station stock not found"}), 404

    db.session.delete(stock)
    queue_cloud_sync_delete("station_stock", stock_id)
    db.session.commit()
    return jsonify({"msg": "Station stock deleted"}), 200


@inventory_stock_bp.route("/overall", methods=["GET"])
@jwt_required()
def get_overall_stock():
    items = InventoryItem.query.order_by(InventoryItem.name.asc()).all()
    store_totals = _map_sum_by_inventory_item(StoreStock, StoreStock.quantity)
    station_totals = _map_sum_by_inventory_item(StationStock, StationStock.quantity)
    result = []

    for item in items:
        store_qty = store_totals.get(item.id, 0.0)
        station_qty = station_totals.get(item.id, 0.0)
        result.append(
            {
                "inventory_item_id": item.id,
                "menu_item": item.name,
                "store_quantity": store_qty,
                "station_quantity": station_qty,
                "total_quantity": store_qty + station_qty,
            }
        )

    return jsonify(result), 200


@inventory_stock_bp.route("/overview", methods=["GET"])
@jwt_required()
def get_stock_overview():
    items = InventoryItem.query.order_by(InventoryItem.name.asc()).all()
    stations = Station.query.order_by(Station.name.asc()).all()
    store_rows = StoreStock.query.all()
    station_rows = StationStock.query.all()

    store_map = {row.inventory_item_id: _as_float(row.quantity) for row in store_rows}
    station_map = {}
    for row in station_rows:
        station_map[(row.station_id, row.inventory_item_id)] = _as_float(row.quantity)

    payload_rows = []
    for item in items:
        station_values = []
        total_station_quantity = 0.0
        for station in stations:
            qty = station_map.get((station.id, item.id), 0.0)
            total_station_quantity += qty
            station_values.append(
                {
                    "station_id": station.id,
                    "station_name": station.name,
                    "quantity": qty,
                }
            )

        store_quantity = store_map.get(item.id, 0.0)
        payload_rows.append(
            {
                "inventory_item_id": item.id,
                "inventory_item_name": item.name,
                "container_size_ml": _as_float(item.container_size_ml),
                "default_shot_ml": _as_float(item.default_shot_ml),
                "shots_per_bottle": _as_float(getattr(item, "shots_per_bottle", 0) or 0),
                "store_quantity": store_quantity,
                "total_station_quantity": total_station_quantity,
                "total_quantity": store_quantity + total_station_quantity,
                "stations": station_values,
            }
        )

    return (
        jsonify(
            {
                "stations": [{"id": station.id, "name": station.name} for station in stations],
                "rows": payload_rows,
                "generated_for": get_eat_today().isoformat(),
            }
        ),
        200,
    )


def _store_row_for_date(
    item,
    query_date,
    current_store_map,
    snapshot_map,
    previous_snapshot_map,
    purchase_totals,
    transfer_totals,
    historical_purchase_totals,
    historical_transfer_totals,
    today,
):
    purchased = purchase_totals.get(item.id, 0.0)
    transferred_out = transfer_totals.get(item.id, 0.0)
    current_quantity = current_store_map.get(item.id, 0.0)
    snapshot = snapshot_map.get(item.id)
    opening_adjusted = bool(snapshot and snapshot.opening_adjusted)

    if query_date == today:
        if snapshot:
            opening = _as_float(snapshot.opening_quantity)
            purchased = _as_float(snapshot.purchased_quantity)
            transferred_out = _as_float(snapshot.transferred_out_quantity)
        elif previous_snapshot_map.get(item.id):
            opening = _as_float(previous_snapshot_map[item.id].closing_quantity)
        else:
            opening = current_quantity - purchased + transferred_out
        closing = _as_float(snapshot.closing_quantity) if snapshot and snapshot.opening_adjusted else current_quantity
    elif snapshot:
        opening = _as_float(snapshot.opening_quantity)
        closing = _as_float(snapshot.closing_quantity)
        purchased = _as_float(snapshot.purchased_quantity)
        transferred_out = _as_float(snapshot.transferred_out_quantity)
    elif previous_snapshot_map.get(item.id):
        opening = _as_float(previous_snapshot_map[item.id].closing_quantity)
        closing = opening + purchased - transferred_out
    else:
        opening = historical_purchase_totals.get(item.id, 0.0) - historical_transfer_totals.get(item.id, 0.0)
        closing = opening + purchased - transferred_out

    return {
        "scope_type": "store",
        "scope_id": None,
        "scope_name": "Store",
        "inventory_item_id": item.id,
        "inventory_item_name": item.name,
        "shots_per_bottle": _as_float(getattr(item, "shots_per_bottle", 0) or 0),
        "opening_adjusted": opening_adjusted,
        "opening_quantity": opening,
        "purchased_quantity": purchased,
        "transferred_out_quantity": transferred_out,
        "transferred_in_quantity": 0.0,
        "sold_quantity": 0.0,
        "void_quantity": 0.0,
        "closing_quantity": closing,
    }


def _station_row_for_date(
    station,
    item,
    query_date,
    today,
    current_station_map,
    transfer_in_totals,
    snapshot_map,
    previous_snapshot_map,
):
    transfer_in = transfer_in_totals.get((station.id, item.id), 0.0)
    current_quantity = current_station_map.get((station.id, item.id), 0.0)
    snapshot = snapshot_map.get((station.id, item.id))
    opening_adjusted = bool(snapshot and snapshot.opening_adjusted)

    if query_date == today:
        sold = _as_float(snapshot.sold_quantity) if snapshot else 0.0
        void_qty = _as_float(snapshot.void_quantity) if snapshot else 0.0
        if snapshot:
            transfer_in = _as_float(snapshot.added_quantity)
        if snapshot and snapshot.opening_adjusted:
            opening = _as_float(snapshot.start_of_day_quantity)
            closing = _as_float(snapshot.remaining_quantity)
        elif previous_snapshot_map.get((station.id, item.id)):
            opening = _as_float(previous_snapshot_map[(station.id, item.id)].remaining_quantity)
            closing = current_quantity
        else:
            opening = current_quantity - transfer_in + sold - void_qty
            closing = current_quantity
    elif snapshot:
        opening = _as_float(snapshot.start_of_day_quantity)
        transfer_in = _as_float(snapshot.added_quantity)
        sold = _as_float(snapshot.sold_quantity)
        void_qty = _as_float(snapshot.void_quantity)
        closing = _as_float(snapshot.remaining_quantity)
    elif previous_snapshot_map.get((station.id, item.id)):
        opening = _as_float(previous_snapshot_map[(station.id, item.id)].remaining_quantity)
        sold = 0.0
        void_qty = 0.0
        closing = opening + transfer_in
    else:
        opening = 0.0
        sold = 0.0
        void_qty = 0.0
        closing = opening + transfer_in

    return {
        "scope_type": "station",
        "scope_id": station.id,
        "scope_name": station.name,
        "inventory_item_id": item.id,
        "inventory_item_name": item.name,
        "shots_per_bottle": _as_float(getattr(item, "shots_per_bottle", 0) or 0),
        "opening_adjusted": opening_adjusted,
        "opening_quantity": opening,
        "purchased_quantity": 0.0,
        "transferred_out_quantity": 0.0,
        "transferred_in_quantity": transfer_in,
        "sold_quantity": sold,
        "void_quantity": void_qty,
        "closing_quantity": closing,
    }


@inventory_stock_bp.route("/daily-history", methods=["GET"])
@jwt_required()
def get_daily_stock_history():
    query_date = _parse_business_date()
    if query_date is None:
        return jsonify({"msg": "Invalid date format, use YYYY-MM-DD"}), 400

    scope = (request.args.get("scope") or "all").strip().lower()
    station_id = request.args.get("station_id", type=int)
    today = get_eat_today()
    start_dt, end_dt = get_business_day_bounds(query_date)
    previous_start_dt = get_business_day_bounds(query_date)[0]

    items = InventoryItem.query.order_by(InventoryItem.name.asc()).all()
    stations_query = Station.query.order_by(Station.name.asc())
    if station_id:
        stations_query = stations_query.filter(Station.id == station_id)
    stations = stations_query.all()

    current_store_map = {
        row.inventory_item_id: _as_float(row.quantity)
        for row in StoreStock.query.all()
    }
    current_station_map = {
        (row.station_id, row.inventory_item_id): _as_float(row.quantity)
        for row in StationStock.query.all()
    }

    store_snapshots = {
        row.inventory_item_id: row
        for row in StoreStockSnapshot.query.filter_by(snapshot_date=query_date).all()
    }
    previous_store_snapshots = {
        row.inventory_item_id: row
        for row in StoreStockSnapshot.query.filter_by(snapshot_date=query_date - timedelta(days=1)).all()
    }
    station_snapshots = {
        (row.station_id, row.inventory_item_id): row
        for row in StationStockSnapshot.query.filter_by(snapshot_date=query_date).all()
    }
    previous_station_snapshots = {
        (row.station_id, row.inventory_item_id): row
        for row in StationStockSnapshot.query.filter_by(snapshot_date=query_date - timedelta(days=1)).all()
    }

    purchase_totals = {
        inventory_item_id: _as_float(quantity)
        for inventory_item_id, quantity in (
            db.session.query(
                StockPurchase.inventory_item_id,
                func.coalesce(func.sum(StockPurchase.quantity), 0),
            )
            .filter(
                StockPurchase.status != "Deleted",
                StockPurchase.created_at >= start_dt,
                StockPurchase.created_at < end_dt,
            )
            .group_by(StockPurchase.inventory_item_id)
            .all()
        )
    }
    transfer_totals = {
        inventory_item_id: _as_float(quantity)
        for inventory_item_id, quantity in (
            db.session.query(
                StockTransfer.inventory_item_id,
                func.coalesce(func.sum(StockTransfer.quantity), 0),
            )
            .filter(
                StockTransfer.status != "Deleted",
                StockTransfer.created_at >= start_dt,
                StockTransfer.created_at < end_dt,
            )
            .group_by(StockTransfer.inventory_item_id)
            .all()
        )
    }
    historical_purchase_totals = _map_sum_by_inventory_item(
        StockPurchase,
        StockPurchase.quantity,
        StockPurchase.status != "Deleted",
        StockPurchase.created_at < previous_start_dt,
    )
    historical_transfer_totals = _map_sum_by_inventory_item(
        StockTransfer,
        StockTransfer.quantity,
        StockTransfer.status != "Deleted",
        StockTransfer.created_at < previous_start_dt,
    )
    transfer_in_totals = {
        (station_id_value, inventory_item_id): _as_float(quantity)
        for station_id_value, inventory_item_id, quantity in (
            db.session.query(
                StockTransfer.station_id,
                StockTransfer.inventory_item_id,
                func.coalesce(func.sum(StockTransfer.quantity), 0),
            )
            .filter(
                StockTransfer.status != "Deleted",
                StockTransfer.created_at >= start_dt,
                StockTransfer.created_at < end_dt,
            )
            .group_by(StockTransfer.station_id, StockTransfer.inventory_item_id)
            .all()
        )
    }

    rows = []
    if scope in {"all", "store"}:
        for item in items:
            row = _store_row_for_date(
                item,
                query_date,
                current_store_map,
                store_snapshots,
                previous_store_snapshots,
                purchase_totals,
                transfer_totals,
                historical_purchase_totals,
                historical_transfer_totals,
                today,
            )
            if any(_as_float(row[key]) != 0.0 for key in ("opening_quantity", "purchased_quantity", "transferred_out_quantity", "closing_quantity")):
                rows.append(row)

    if scope in {"all", "station"}:
        for station in stations:
            for item in items:
                row = _station_row_for_date(
                    station,
                    item,
                    query_date,
                    today,
                    current_station_map,
                    transfer_in_totals,
                    station_snapshots,
                    previous_station_snapshots,
                )
                if any(
                    _as_float(row[key]) != 0.0
                    for key in ("opening_quantity", "transferred_in_quantity", "sold_quantity", "void_quantity", "closing_quantity")
                ):
                    rows.append(row)

    return (
        jsonify(
            {
                "business_date": query_date.isoformat(),
                "business_day_start": start_dt.isoformat(),
                "business_day_end": end_dt.isoformat(),
                "scope": scope,
                "stations": [{"id": station.id, "name": station.name} for station in stations],
                "rows": rows,
            }
        ),
        200,
    )


@inventory_stock_bp.route("/station/daily", methods=["GET"])
@roles_required("station")
def get_station_daily_stock():
    query_date = _parse_business_date()
    if query_date is None:
        return jsonify({"msg": "Invalid date format, use YYYY-MM-DD"}), 400

    station_id = _station_id_from_token()
    if not station_id:
        return jsonify({"msg": "Invalid station token"}), 400

    station = Station.query.get(station_id)
    if not station:
        return jsonify({"msg": "Station not found"}), 404

    today = get_eat_today()
    start_dt, end_dt = get_business_day_bounds(query_date)
    stock_item_ids = (
        db.session.query(StationStock.inventory_item_id)
        .filter(StationStock.station_id == station.id)
        .distinct()
        .all()
    )
    snapshot_item_ids = (
        db.session.query(StationStockSnapshot.inventory_item_id)
        .filter(StationStockSnapshot.station_id == station.id)
        .distinct()
        .all()
    )
    item_ids = {
        *[row[0] for row in stock_item_ids],
        *[row[0] for row in snapshot_item_ids],
    }
    items = (
        InventoryItem.query.filter(InventoryItem.id.in_(item_ids))
        .order_by(InventoryItem.name.asc())
        .all()
        if item_ids
        else []
    )

    current_station_map = {
        (row.station_id, row.inventory_item_id): _as_float(row.quantity)
        for row in StationStock.query.filter_by(station_id=station.id).all()
    }
    station_snapshots = {
        (row.station_id, row.inventory_item_id): row
        for row in StationStockSnapshot.query.filter_by(snapshot_date=query_date, station_id=station.id).all()
    }
    previous_station_snapshots = {
        (row.station_id, row.inventory_item_id): row
        for row in StationStockSnapshot.query.filter_by(
            snapshot_date=query_date - timedelta(days=1),
            station_id=station.id,
        ).all()
    }
    transfer_in_totals = {
        (station_id_value, inventory_item_id): _as_float(quantity)
        for station_id_value, inventory_item_id, quantity in (
            db.session.query(
                StockTransfer.station_id,
                StockTransfer.inventory_item_id,
                func.coalesce(func.sum(StockTransfer.quantity), 0),
            )
            .filter(
                StockTransfer.status != "Deleted",
                StockTransfer.created_at >= start_dt,
                StockTransfer.created_at < end_dt,
                StockTransfer.station_id == station.id,
            )
            .group_by(StockTransfer.station_id, StockTransfer.inventory_item_id)
            .all()
        )
    }

    rows = []
    for item in items:
        row = _station_row_for_date(
            station,
            item,
            query_date,
            today,
            current_station_map,
            transfer_in_totals,
            station_snapshots,
            previous_station_snapshots,
        )
        rows.append(row)

    return (
        jsonify(
            {
                "business_date": query_date.isoformat(),
                "station": {"id": station.id, "name": station.name},
                "rows": rows,
            }
        ),
        200,
    )


@inventory_stock_bp.route("/opening-adjustment", methods=["PATCH"])
@roles_required("admin")
def adjust_opening_stock():
    data = request.get_json() or {}
    scope = (data.get("scope") or "").strip().lower()
    inventory_item_id = data.get("inventory_item_id")
    station_id = data.get("station_id")

    if scope not in {"store", "station"}:
        return jsonify({"msg": "scope must be either 'store' or 'station'"}), 400
    if inventory_item_id is None:
        return jsonify({"msg": "inventory_item_id is required"}), 400
    try:
        inventory_item_id = int(inventory_item_id)
    except (TypeError, ValueError):
        return jsonify({"msg": "inventory_item_id must be a number"}), 400

    try:
        opening_quantity = _parse_non_negative_float(data.get("opening_quantity"), "opening_quantity")
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400

    today = get_eat_today()

    item = InventoryItem.query.get(inventory_item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    if scope == "store":
        snapshot = get_or_create_store_snapshot(
            inventory_item_id=item.id,
            snapshot_date=today,
            opening_quantity=opening_quantity,
        )
        snapshot.opening_quantity = opening_quantity
        snapshot.opening_adjusted = True
        snapshot.closing_quantity = (
            float(snapshot.opening_quantity or 0)
            + float(snapshot.purchased_quantity or 0)
            - float(snapshot.transferred_out_quantity or 0)
        )
        store_stock = StoreStock.query.filter_by(inventory_item_id=item.id).first()
        if store_stock is None:
            store_stock = StoreStock(inventory_item_id=item.id, quantity=0.0)
            db.session.add(store_stock)
        store_stock.quantity = float(snapshot.closing_quantity or 0)
        db.session.commit()
        queue_cloud_sync_upsert("store_stock_snapshot", snapshot)
        queue_cloud_sync_upsert("store_stock", store_stock)
        return jsonify({"msg": "Store opening stock updated"}), 200

    if station_id is None:
        return jsonify({"msg": "station_id is required for station scope"}), 400
    try:
        station_id = int(station_id)
    except (TypeError, ValueError):
        return jsonify({"msg": "station_id must be a number"}), 400

    station = Station.query.get(station_id)
    if not station:
        return jsonify({"msg": "Station not found"}), 404

    snapshot = get_or_create_station_snapshot(
        station_id=station.id,
        inventory_item_id=item.id,
        snapshot_date=today,
        opening_quantity=opening_quantity,
    )
    snapshot.start_of_day_quantity = opening_quantity
    snapshot.opening_adjusted = True
    snapshot.remaining_quantity = (
        float(snapshot.start_of_day_quantity or 0)
        + float(snapshot.added_quantity or 0)
        - float(snapshot.sold_quantity or 0)
        + float(snapshot.void_quantity or 0)
    )
    station_stock = StationStock.query.filter_by(
        station_id=station.id,
        inventory_item_id=item.id,
    ).first()
    if station_stock is None:
        station_stock = StationStock(
            station_id=station.id,
            inventory_item_id=item.id,
            quantity=0.0,
        )
        db.session.add(station_stock)
    station_stock.quantity = float(snapshot.remaining_quantity or 0)
    db.session.commit()
    queue_cloud_sync_upsert("station_stock_snapshot", snapshot)
    queue_cloud_sync_upsert("station_stock", station_stock)
    return jsonify({"msg": "Station opening stock updated"}), 200
