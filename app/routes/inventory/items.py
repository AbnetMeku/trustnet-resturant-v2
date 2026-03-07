from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import InventoryItem, InventoryMenuLink, MenuItem
from app.services.inventory_service import resolve_link_deduction_amount

inventory_items_bp = Blueprint("inventory_items_bp", __name__, url_prefix="/inventory/items")

VALID_SERVING_TYPES = {"shot", "bottle", "custom_ml"}


def _parse_positive_float(value, field_name):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")
    if parsed <= 0:
        raise ValueError(f"{field_name} must be greater than zero")
    return parsed


def _default_shot_ratio(item):
    container_size_ml = float(item.container_size_ml or 0)
    default_shot_ml = float(item.default_shot_ml or 0)
    if container_size_ml <= 0 or default_shot_ml <= 0:
        return 1.0
    return default_shot_ml / container_size_ml


def _parse_link_rule(data, inventory_item):
    serving_type = str(data.get("serving_type", "shot") or "shot").strip().lower()
    if serving_type not in VALID_SERVING_TYPES:
        raise ValueError("serving_type must be one of: shot, bottle, custom_ml")

    raw_value = data.get("serving_value")
    if raw_value in (None, ""):
        serving_value = 1.0 if serving_type != "custom_ml" else float(inventory_item.default_shot_ml or 1.0)
    else:
        serving_value = _parse_positive_float(raw_value, "serving_value")

    if serving_type == "custom_ml":
        deduction_ratio = serving_value / float(inventory_item.container_size_ml)
    elif serving_type == "shot":
        deduction_ratio = (float(inventory_item.default_shot_ml) * serving_value) / float(
            inventory_item.container_size_ml
        )
    else:
        deduction_ratio = serving_value

    return serving_type, serving_value, deduction_ratio


def _serialize_link(link):
    deduction_ratio = resolve_link_deduction_amount(link, 1.0)
    return {
        "id": link.id,
        "menu_item_id": link.menu_item_id,
        "menu_item_name": link.menu_item.name if link.menu_item else None,
        "serving_type": link.serving_type or "custom_ml",
        "serving_value": link.serving_value,
        "deduction_ratio": deduction_ratio,
    }


def _serialize_inventory_item(item):
    return {
        "id": item.id,
        "name": item.name,
        "unit": item.unit,
        "container_size_ml": item.container_size_ml,
        "default_shot_ml": item.default_shot_ml,
        "default_shot_deduction_ratio": _default_shot_ratio(item),
        "is_active": item.is_active,
        "created_at": item.created_at,
    }


def check_existing_links(menu_item_ids):
    existing_links = InventoryMenuLink.query.filter(InventoryMenuLink.menu_item_id.in_(menu_item_ids)).all()
    return [
        {
            "menu_item_id": link.menu_item_id,
            "menu_item_name": link.menu_item.name if link.menu_item else "Unknown",
            "linked_inventory_item": link.inventory_item.name if link.inventory_item else "Unknown",
        }
        for link in existing_links
    ]


@inventory_items_bp.route("/", methods=["POST"])
@jwt_required()
def create_inventory_item():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    unit = (data.get("unit") or "Bottle").strip() or "Bottle"

    if not name:
        return jsonify({"msg": "Name is required"}), 400

    try:
        container_size_ml = _parse_positive_float(data.get("container_size_ml"), "container_size_ml")
        default_shot_ml = _parse_positive_float(data.get("default_shot_ml"), "default_shot_ml")
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400

    if default_shot_ml > container_size_ml:
        return jsonify({"msg": "default_shot_ml cannot be greater than container_size_ml"}), 400

    if InventoryItem.query.filter_by(name=name).first():
        return jsonify({"msg": "Inventory item already exists"}), 400

    item = InventoryItem(
        name=name,
        unit=unit,
        serving_unit="ml",
        servings_per_unit=container_size_ml / default_shot_ml,
        container_size_ml=container_size_ml,
        default_shot_ml=default_shot_ml,
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(item)
    db.session.commit()

    return jsonify({"msg": "Inventory item created successfully", "id": item.id}), 201


@inventory_items_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_inventory_items():
    items = InventoryItem.query.order_by(InventoryItem.name.asc()).all()
    return jsonify([_serialize_inventory_item(i) for i in items]), 200


@inventory_items_bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
def get_inventory_item(item_id):
    item = InventoryItem.query.get(item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    payload = _serialize_inventory_item(item)
    payload["menu_links"] = [_serialize_link(link) for link in item.menu_links]
    return jsonify(payload), 200


@inventory_items_bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
def update_inventory_item(item_id):
    item = InventoryItem.query.get(item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    data = request.get_json() or {}

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"msg": "Name is required"}), 400
        existing = InventoryItem.query.filter(InventoryItem.name == name, InventoryItem.id != item.id).first()
        if existing:
            return jsonify({"msg": "Inventory item already exists"}), 400
        item.name = name

    if "unit" in data:
        unit = (data.get("unit") or "").strip()
        if not unit:
            return jsonify({"msg": "unit is required"}), 400
        item.unit = unit

    try:
        container_size_ml = (
            _parse_positive_float(data["container_size_ml"], "container_size_ml")
            if "container_size_ml" in data
            else float(item.container_size_ml)
        )
        default_shot_ml = (
            _parse_positive_float(data["default_shot_ml"], "default_shot_ml")
            if "default_shot_ml" in data
            else float(item.default_shot_ml)
        )
    except ValueError as exc:
        return jsonify({"msg": str(exc)}), 400

    if default_shot_ml > container_size_ml:
        return jsonify({"msg": "default_shot_ml cannot be greater than container_size_ml"}), 400

    item.container_size_ml = container_size_ml
    item.default_shot_ml = default_shot_ml
    item.serving_unit = "ml"
    item.servings_per_unit = container_size_ml / default_shot_ml

    if "is_active" in data:
        item.is_active = bool(data.get("is_active"))

    db.session.commit()
    return jsonify({"msg": "Inventory item updated successfully"}), 200


@inventory_items_bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
def delete_inventory_item(item_id):
    item = InventoryItem.query.get(item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    db.session.delete(item)
    db.session.commit()
    return jsonify({"msg": "Inventory item deleted"}), 200


@inventory_items_bp.route("/<int:inventory_item_id>/links", methods=["POST"])
@jwt_required()
def create_inventory_links(inventory_item_id):
    data = request.get_json() or {}
    links = data.get("links", [])

    inventory_item = InventoryItem.query.get(inventory_item_id)
    if not inventory_item:
        return jsonify({"msg": "Inventory item not found"}), 404

    created_links = []
    skipped_links = []

    for group in links:
        menu_item_ids = group.get("menu_item_ids", [])
        try:
            serving_type, serving_value, deduction_ratio = _parse_link_rule(group, inventory_item)
        except ValueError as exc:
            return jsonify({"msg": str(exc)}), 400

        conflicts = check_existing_links(menu_item_ids)
        if conflicts:
            return jsonify(
                {
                    "msg": "Conflict: one or more menu items are already linked.",
                    "conflicts": [
                        f"Menu '{c['menu_item_name']}' is already linked to inventory '{c['linked_inventory_item']}'"
                        for c in conflicts
                    ],
                }
            ), 400

        for menu_item_id in menu_item_ids:
            menu_item = MenuItem.query.get(menu_item_id)
            if not menu_item:
                skipped_links.append({"menu_item_id": menu_item_id, "reason": "Menu item not found"})
                continue

            new_link = InventoryMenuLink(
                inventory_item_id=inventory_item_id,
                menu_item_id=menu_item_id,
                deduction_ratio=deduction_ratio,
                serving_type=serving_type,
                serving_value=serving_value,
            )
            db.session.add(new_link)
            created_links.append(menu_item_id)

    db.session.commit()
    return jsonify({"msg": "Menu links processed", "created": created_links, "skipped": skipped_links}), 201


@inventory_items_bp.route("/<int:inventory_item_id>/links", methods=["GET"])
@jwt_required()
def get_inventory_links(inventory_item_id):
    links = InventoryMenuLink.query.filter_by(inventory_item_id=inventory_item_id).all()
    return jsonify([_serialize_link(link) for link in links]), 200


@inventory_items_bp.route("/links/<int:link_id>", methods=["PUT"])
@jwt_required()
def update_inventory_link(link_id):
    link = InventoryMenuLink.query.get(link_id)
    if not link:
        return jsonify({"msg": "Link not found"}), 404

    data = request.get_json() or {}

    try:
        with db.session.begin_nested():
            if "menu_item_id" in data:
                new_menu_item_id = data["menu_item_id"]
                menu_item = MenuItem.query.get(new_menu_item_id)
                if not menu_item:
                    db.session.rollback()
                    return jsonify({"msg": "Menu item not found"}), 404

                existing_link = InventoryMenuLink.query.filter(
                    InventoryMenuLink.menu_item_id == new_menu_item_id,
                    InventoryMenuLink.id != link_id,
                ).first()
                if existing_link:
                    db.session.rollback()
                    return (
                        jsonify(
                            {
                                "msg": f"Conflict: Menu '{existing_link.menu_item.name}' is already linked to inventory '{existing_link.inventory_item.name}'"
                            }
                        ),
                        400,
                    )

                link.menu_item_id = new_menu_item_id

            if "inventory_item_id" in data:
                inventory_item = InventoryItem.query.get(data["inventory_item_id"])
                if not inventory_item:
                    db.session.rollback()
                    return jsonify({"msg": "Inventory item not found"}), 404
                link.inventory_item_id = data["inventory_item_id"]

            if "serving_type" in data or "serving_value" in data:
                inventory_item = link.inventory_item
                serving_type, serving_value, deduction_ratio = _parse_link_rule(
                    {
                        "serving_type": data.get("serving_type", link.serving_type),
                        "serving_value": data.get("serving_value", link.serving_value),
                    },
                    inventory_item,
                )
                link.serving_type = serving_type
                link.serving_value = serving_value
                link.deduction_ratio = deduction_ratio

            db.session.add(link)

        db.session.commit()
        return jsonify({"msg": "Link updated successfully"}), 200
    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "Conflict: this menu/inventory combination already exists"}), 400
    except Exception as exc:
        db.session.rollback()
        return jsonify({"msg": f"An unexpected error occurred: {str(exc)}"}), 500


@inventory_items_bp.route("/links/<int:link_id>", methods=["DELETE"])
@jwt_required()
def delete_inventory_link(link_id):
    link = InventoryMenuLink.query.get(link_id)
    if not link:
        return jsonify({"msg": "Link not found"}), 404

    db.session.delete(link)
    db.session.commit()
    return jsonify({"msg": "Link deleted"}), 200
