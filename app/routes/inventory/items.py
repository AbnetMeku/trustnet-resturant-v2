from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.models import InventoryItem, InventoryMenuLink, MenuItem
from datetime import datetime
from sqlalchemy.exc import IntegrityError

inventory_items_bp = Blueprint("inventory_items_bp", __name__, url_prefix="/inventory/items")

# --------------------- HELPER: CHECK EXISTING LINKS --------------------- #
def check_existing_links(menu_item_ids):
    """Return a list of menu items that are already linked."""
    existing_links = InventoryMenuLink.query.filter(
        InventoryMenuLink.menu_item_id.in_(menu_item_ids)
    ).all()
    conflicts = [
        {
            "menu_item_id": link.menu_item_id,
            "menu_item_name": link.menu_item.name if link.menu_item else "Unknown",
            "linked_inventory_item": link.inventory_item.name if link.inventory_item else "Unknown"
        } for link in existing_links
    ]
    return conflicts


# --------------------- CREATE INVENTORY ITEM --------------------- #
@inventory_items_bp.route("/", methods=["POST"])
@jwt_required()
def create_inventory_item():
    data = request.get_json()
    name = data.get("name")
    unit = data.get("unit", "Bottle")

    if not name:
        return jsonify({"msg": "Name is required"}), 400

    if InventoryItem.query.filter_by(name=name).first():
        return jsonify({"msg": "Inventory item already exists"}), 400

    item = InventoryItem(name=name, unit=unit)
    db.session.add(item)
    db.session.commit()

    return jsonify({"msg": "Inventory item created successfully", "id": item.id}), 201


# --------------------- GET ALL INVENTORY ITEMS --------------------- #
@inventory_items_bp.route("/", methods=["GET"])
@jwt_required()
def get_all_inventory_items():
    items = InventoryItem.query.all()
    result = []
    for i in items:
        result.append({
            "id": i.id,
            "name": i.name,
            "unit": i.unit,
            "is_active": i.is_active,
            "created_at": i.created_at,
        })
    return jsonify(result), 200


# --------------------- GET SINGLE INVENTORY ITEM --------------------- #
@inventory_items_bp.route("/<int:item_id>", methods=["GET"])
@jwt_required()
def get_inventory_item(item_id):
    item = InventoryItem.query.get(item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    return jsonify({
        "id": item.id,
        "name": item.name,
        "unit": item.unit,
        "is_active": item.is_active,
        "created_at": item.created_at,
        "menu_links": [
            {
                "id": link.id,
                "menu_item_id": link.menu_item_id,
                "menu_item_name": link.menu_item.name if link.menu_item else None,
                "deduction_ratio": link.deduction_ratio
            } for link in item.menu_links
        ]
    }), 200


# --------------------- UPDATE INVENTORY ITEM --------------------- #
@inventory_items_bp.route("/<int:item_id>", methods=["PUT"])
@jwt_required()
def update_inventory_item(item_id):
    item = InventoryItem.query.get(item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    data = request.get_json()
    item.name = data.get("name", item.name)
    item.unit = data.get("unit", item.unit)
    item.is_active = data.get("is_active", item.is_active)

    db.session.commit()
    return jsonify({"msg": "Inventory item updated successfully"}), 200


# --------------------- DELETE INVENTORY ITEM --------------------- #
@inventory_items_bp.route("/<int:item_id>", methods=["DELETE"])
@jwt_required()
def delete_inventory_item(item_id):
    item = InventoryItem.query.get(item_id)
    if not item:
        return jsonify({"msg": "Inventory item not found"}), 404

    db.session.delete(item)
    db.session.commit()
    return jsonify({"msg": "Inventory item deleted"}), 200


# --------------------- ADD MENU LINKS (BULK, GROUPED) --------------------- #
@inventory_items_bp.route("/<int:inventory_item_id>/links", methods=["POST"])
@jwt_required()
def create_inventory_links(inventory_item_id):
    data = request.get_json()
    links = data.get("links", [])

    inventory_item = InventoryItem.query.get(inventory_item_id)
    if not inventory_item:
        return jsonify({"msg": "Inventory item not found"}), 404

    created_links = []
    skipped_links = []

    for group in links:
        menu_item_ids = group.get("menu_item_ids", [])
        deduction_ratio = group.get("deduction_ratio", 1.0)

        # ----------------- Check conflicts first ----------------- #
        conflicts = check_existing_links(menu_item_ids)
        if conflicts:
            return jsonify({
                "msg": "Conflict: one or more menu items are already linked.",
                "conflicts": [
                    f"Menu '{c['menu_item_name']}' is already linked to inventory '{c['linked_inventory_item']}'"
                    for c in conflicts
                ]
            }), 400

        # ----------------- Create links safely ----------------- #
        for menu_item_id in menu_item_ids:
            menu_item = MenuItem.query.get(menu_item_id)
            if not menu_item:
                skipped_links.append({"menu_item_id": menu_item_id, "reason": "Menu item not found"})
                continue

            new_link = InventoryMenuLink(
                inventory_item_id=inventory_item_id,
                menu_item_id=menu_item_id,
                deduction_ratio=deduction_ratio
            )
            db.session.add(new_link)
            created_links.append(menu_item_id)

    db.session.commit()
    return jsonify({
        "msg": "Menu links processed",
        "created": created_links,
        "skipped": skipped_links
    }), 201

# --------------------- GET ALL LINKS FOR AN INVENTORY ITEM --------------------- #
@inventory_items_bp.route("/<int:inventory_item_id>/links", methods=["GET"])
@jwt_required()
def get_inventory_links(inventory_item_id):
    links = InventoryMenuLink.query.filter_by(inventory_item_id=inventory_item_id).all()
    result = [
        {
            "id": l.id,
            "menu_item_id": l.menu_item_id,
            "menu_item_name": l.menu_item.name if l.menu_item else None,
            "deduction_ratio": l.deduction_ratio
        } for l in links
    ]
    return jsonify(result), 200


# --------------------- UPDATE LINK (SAFE TRANSACTION) --------------------- #
@inventory_items_bp.route("/links/<int:link_id>", methods=["PUT"])
@jwt_required()
def update_inventory_link(link_id):
    link = InventoryMenuLink.query.get(link_id)
    if not link:
        return jsonify({"msg": "Link not found"}), 404

    data = request.get_json()

    try:
        # Begin atomic transaction
        with db.session.begin_nested():
            # Update deduction_ratio precisely
            if "deduction_ratio" in data:
                try:
                    link.deduction_ratio = float(data["deduction_ratio"])
                except ValueError:
                    db.session.rollback()
                    return jsonify({"msg": "Invalid deduction ratio"}), 400

            # Update menu_item_id safely
            if "menu_item_id" in data:
                new_menu_item_id = data["menu_item_id"]
                menu_item = MenuItem.query.get(new_menu_item_id)
                if not menu_item:
                    db.session.rollback()
                    return jsonify({"msg": "Menu item not found"}), 404

                # Check for conflicts excluding this link
                existing_link = InventoryMenuLink.query.filter(
                    InventoryMenuLink.menu_item_id == new_menu_item_id,
                    InventoryMenuLink.id != link_id
                ).first()
                if existing_link:
                    db.session.rollback()
                    return jsonify({
                        "msg": f"Conflict: Menu '{existing_link.menu_item.name}' "
                               f"is already linked to inventory '{existing_link.inventory_item.name}'"
                    }), 400

                link.menu_item_id = new_menu_item_id

            # Update inventory_item_id
            if "inventory_item_id" in data:
                inventory_item = InventoryItem.query.get(data["inventory_item_id"])
                if not inventory_item:
                    db.session.rollback()
                    return jsonify({"msg": "Inventory item not found"}), 404
                link.inventory_item_id = data["inventory_item_id"]

            db.session.add(link)

        db.session.commit()
        return jsonify({"msg": "Link updated successfully"}), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "Conflict: this menu/inventory combination already exists"}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({"msg": f"An unexpected error occurred: {str(e)}"}), 500


# --------------------- DELETE LINK --------------------- #
@inventory_items_bp.route("/links/<int:link_id>", methods=["DELETE"])
@jwt_required()
def delete_inventory_link(link_id):
    link = InventoryMenuLink.query.get(link_id)
    if not link:
        return jsonify({"msg": "Link not found"}), 404

    db.session.delete(link)
    db.session.commit()
    return jsonify({"msg": "Link deleted"}), 200
