from flask import Blueprint, current_app, jsonify, request

from app.services.inventory_service import adjust_inventory_for_order_item

inventory_internal_bp = Blueprint(
    "inventory_internal_bp",
    __name__,
    url_prefix="/inventory/internal",
)


def _is_authorized_service_request() -> bool:
    request_key = request.headers.get("X-Service-Key")
    expected_key = current_app.config.get("INVENTORY_SERVICE_KEY", "")
    return bool(expected_key) and request_key == expected_key


@inventory_internal_bp.route("/adjust", methods=["POST"])
def adjust_inventory_internal():
    if not _is_authorized_service_request():
        return jsonify({"error": "Unauthorized service request"}), 401

    data = request.get_json() or {}
    station_name = data.get("station_name")
    menu_item_id = data.get("menu_item_id")
    quantity = data.get("quantity")
    reverse = bool(data.get("reverse", False))

    if not station_name or menu_item_id is None or quantity is None:
        return jsonify({"error": "station_name, menu_item_id, and quantity are required"}), 400

    try:
        adjust_inventory_for_order_item(
            station_name=station_name,
            menu_item_id=int(menu_item_id),
            quantity=float(quantity),
            reverse=reverse,
        )
        return jsonify({"message": "Inventory adjusted"}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
