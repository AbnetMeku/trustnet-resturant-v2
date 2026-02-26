from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func, case, and_
from sqlalchemy.orm import aliased
from datetime import datetime, timedelta
from app.models.models import db, Order, OrderItem, MenuItem, SubCategory, Category, Table
from app.utils.decorators import roles_required
from app.utils.timezone import get_business_day_bounds

reports_bp = Blueprint('reports_bp', __name__, url_prefix='/reports')

@reports_bp.route('/sales-summary', methods=['GET', 'OPTIONS'])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def sales_summary():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    waiter_id = request.args.get('waiter_id', type=int)
    vip_only = request.args.get('vip_only', default=None)

    if not start_date or not end_date:
        return jsonify({'error': 'start_date and end_date query params are required (format YYYY-MM-DD)'}), 400

    try:
        start_day = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_day = datetime.strptime(end_date, '%Y-%m-%d').date()
        start_dt, _ = get_business_day_bounds(start_day)
        _, end_dt = get_business_day_bounds(end_day)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    vip_status = case(
        (Table.is_vip == True, "VIP"), else_="Normal"
    ).label('vip_status')

    MenuItemAlias = aliased(MenuItem)

    price_field = case(
        (and_(Table.is_vip == True, OrderItem.vip_price != None), OrderItem.vip_price),
        else_=OrderItem.price
    ).label("unit_price")

    # Include voids for visualization, but we’ll group them separately in Python
    base_query = (
        db.session.query(
            Category.name.label('category'),
            SubCategory.name.label('sub_category'),
            MenuItemAlias.id.label('menu_item_id'),
            MenuItemAlias.name.label('menu_item_name'),
            vip_status,
            OrderItem.status.label("item_status"),
            func.sum(OrderItem.quantity).label('quantity_sold'),
            func.avg(price_field).label('average_price'),
            func.sum(price_field * OrderItem.quantity).label('total_amount'),
        )
        .join(OrderItem.order)
        .join(Order.table)
        .join(OrderItem.menu_item.of_type(MenuItemAlias))
        .join(MenuItemAlias.subcategory)
        .join(SubCategory.category)
        .filter(
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
        )
    )

    if waiter_id:
        base_query = base_query.filter(Order.user_id == waiter_id)

    if vip_only is not None:
        if vip_only.lower() in ['true', '1', 'yes']:
            base_query = base_query.filter(Table.is_vip == True)
        elif vip_only.lower() in ['false', '0', 'no']:
            base_query = base_query.filter(Table.is_vip == False)

    base_query = base_query.group_by(
        Category.name, SubCategory.name,
        MenuItemAlias.id, MenuItemAlias.name,
        vip_status, OrderItem.status
    ).order_by(
        Category.name, SubCategory.name, vip_status, MenuItemAlias.name
    )

    results = base_query.all()

    grouped = {}
    grand_total_qty = 0
    grand_total_amount = 0

    for row in results:
        c, sc, vip, status = row.category, row.sub_category, row.vip_status, row.item_status
        if c not in grouped:
            grouped[c] = {}
        if sc not in grouped[c]:
            grouped[c][sc] = {
                "items": {},
                "sub_category_total_qty": 0,
                "sub_category_total_amount": 0,
                "void_items": [],
            }

        item_key = (row.menu_item_id, vip)

        # Separate void items instead of merging
        if status == "void":
            grouped[c][sc]["void_items"].append({
                "menu_item_id": row.menu_item_id,
                "name": row.menu_item_name,
                "vip_status": vip,
                "status": status,
                "quantity": float(row.quantity_sold or 0),
                "average_price": float(row.average_price or 0),
                "total_amount": float(row.total_amount or 0),
                "is_voided": True,
            })
            continue

        # Merge same non-void items
        if item_key not in grouped[c][sc]["items"]:
            grouped[c][sc]["items"][item_key] = {
                "menu_item_id": row.menu_item_id,
                "name": row.menu_item_name,
                "vip_status": vip,
                "status": status,
                "quantity": 0,
                "average_price": float(row.average_price or 0),
                "total_amount": 0,
                "is_voided": False,
            }

        item_entry = grouped[c][sc]["items"][item_key]
        item_entry["quantity"] += float(row.quantity_sold or 0)
        item_entry["total_amount"] += float(row.total_amount or 0)

        grouped[c][sc]["sub_category_total_qty"] += float(row.quantity_sold or 0)
        grouped[c][sc]["sub_category_total_amount"] += float(row.total_amount or 0)
        grand_total_qty += float(row.quantity_sold or 0)
        grand_total_amount += float(row.total_amount or 0)

    # --- FINAL STRUCTURE ---
    report = []
    for category, subcats in grouped.items():
        cat_total_qty = 0
        cat_total_amount = 0
        subcategories_list = []

        for subcat, data in subcats.items():
            cat_total_qty += data["sub_category_total_qty"]
            cat_total_amount += data["sub_category_total_amount"]

            merged_items = list(data["items"].values()) + data["void_items"]
            subcategories_list.append({
                "name": subcat,
                "total_qty": data["sub_category_total_qty"],
                "total_amount": data["sub_category_total_amount"],
                "items": merged_items,
            })

        report.append({
            "category": category,
            "total_qty": cat_total_qty,
            "total_amount": cat_total_amount,
            "subcategories": subcategories_list,
        })

    return jsonify({
        "from": start_date,
        "to": end_date,
        "grand_totals": {
            "total_amount": grand_total_amount,
        },
        "report": report,
    }), 200


# ---------------------- WAITER SUMMARY ----------------------
@reports_bp.route('/waiter-summary', methods=['GET', 'OPTIONS'])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def waiter_summary():
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date or not end_date:
        return jsonify({'error': 'start_date and end_date query params are required (format YYYY-MM-DD)'}), 400

    try:
        start_day = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_day = datetime.strptime(end_date, '%Y-%m-%d').date()
        start_dt, _ = get_business_day_bounds(start_day)
        _, end_dt = get_business_day_bounds(end_day)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    price_field = case(
        (and_(Table.is_vip == True, OrderItem.vip_price != None), OrderItem.vip_price),
        else_=OrderItem.price
    )

    from app.models.models import User

    # Include voided items in results, but we’ll exclude them from totals
    query = (
        db.session.query(
            Order.user_id.label("waiter_id"),
            User.username.label("waiter_name"),
            func.sum(price_field * OrderItem.quantity).label("total_sales"),
            OrderItem.status.label("item_status")
        )
        .join(OrderItem.order)
        .join(Order.table)
        .join(User, User.id == Order.user_id)
        .filter(
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
        )
        .group_by(Order.user_id, User.username, OrderItem.status)
        .order_by(User.username)
    )

    results = query.all()

    # Build report including voids, but exclude voids from totals
    report_dict = {}
    grand_total = 0
    for row in results:
        if row.waiter_id not in report_dict:
            report_dict[row.waiter_id] = {
                "waiter_id": row.waiter_id,
                "waiter_name": row.waiter_name,
                "total_sales": 0,
                "items_status": []
            }
        # track void status for frontend
        is_void = row.item_status == "void"
        report_dict[row.waiter_id]["items_status"].append({
            "status": row.item_status,
            "amount": float(row.total_sales or 0),
            "is_voided": is_void
        })
        # sum only non-voided items
        if not is_void:
            report_dict[row.waiter_id]["total_sales"] += float(row.total_sales or 0)
            grand_total += float(row.total_sales or 0)

    report = list(report_dict.values())

    return jsonify({
        "from": start_date,
        "to": end_date,
        "grand_total": grand_total,
        "report": report
    }), 200

# ---------------------- WAITER DETAILS ----------------------
@reports_bp.route('/waiter/<int:waiter_id>/details', methods=['GET'])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def waiter_details(waiter_id):
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date or not end_date:
        return jsonify({'error': 'start_date and end_date query params are required (format YYYY-MM-DD)'}), 400

    try:
        start_day = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_day = datetime.strptime(end_date, '%Y-%m-%d').date()
        start_dt, _ = get_business_day_bounds(start_day)
        _, end_dt = get_business_day_bounds(end_day)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    price_field = case(
        (and_(Table.is_vip == True, OrderItem.vip_price != None), OrderItem.vip_price),
        else_=OrderItem.price
    )

    query = (
        db.session.query(
            MenuItem.name.label("item_name"),
            func.sum(OrderItem.quantity).label("quantity_sold"),
            func.sum(price_field * OrderItem.quantity).label("total_amount"),
            OrderItem.status.label("item_status")
        )
        .join(OrderItem.order)
        .join(Order.table)
        .join(Order.user)
        .join(OrderItem.menu_item)
        .filter(
            Order.user_id == waiter_id,
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
        )
        .group_by(MenuItem.id, MenuItem.name, OrderItem.status)
        .order_by(MenuItem.name)
    )

    results = query.all()

    details = []
    grand_total = 0
    for row in results:
        is_void = row.item_status == "void"
        details.append({
            "item_name": row.item_name,
            "quantity_sold": float(row.quantity_sold or 0),
            "total_amount": float(row.total_amount or 0),
            "is_voided": is_void
        })
        if not is_void:
            grand_total += float(row.total_amount or 0)

    return jsonify({
        "waiter_id": waiter_id,
        "from": start_date,
        "to": end_date,
        "grand_total": grand_total,
        "details": details
    }), 200
