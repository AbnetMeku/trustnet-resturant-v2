from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func, case, and_
from sqlalchemy.orm import aliased
from datetime import datetime, timedelta
from app.models.models import db, Order, OrderItem, MenuItem, SubCategory, Category, Table
from app.utils.decorators import roles_required

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
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    vip_status = case((Table.is_vip == True, "VIP"), else_="Normal").label('vip_status')

    MenuItemAlias = aliased(MenuItem)

    price_field = case(
        (and_(Table.is_vip == True, OrderItem.vip_price != None), OrderItem.vip_price),
        else_=OrderItem.price
    ).label("unit_price")

    query = (
    db.session.query(
        Category.name.label('category'),
        SubCategory.name.label('sub_category'),
        MenuItemAlias.id.label('menu_item_id'),
        MenuItemAlias.name.label('menu_item_name'),
        vip_status,
        func.sum(OrderItem.quantity).label('quantity_sold'),
        func.avg(price_field).label('average_price'),
        func.sum(price_field * OrderItem.quantity).label('total_amount'),
    )
    .join(OrderItem.order)
    .join(Order.table)
    .join(OrderItem.menu_item.of_type(MenuItemAlias))  # Use aliased MenuItem here
    .join(MenuItemAlias.subcategory)
    .join(SubCategory.category)
    .filter(
        and_(
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
            # Order.status == 'paid',
        )
    )
    # apply filters and group_by etc.
)

    if waiter_id:
        query = query.filter(Order.user_id == waiter_id)

    if vip_only is not None:
        if vip_only.lower() in ['true', '1', 'yes']:
            query = query.filter(Table.is_vip == True)
        elif vip_only.lower() in ['false', '0', 'no']:
            query = query.filter(Table.is_vip == False)

    query = query.group_by(
        Category.name, SubCategory.name,
        MenuItemAlias.id, MenuItemAlias.name, vip_status
    ).order_by(
        Category.name, SubCategory.name, vip_status, MenuItemAlias.name
    )

    results = query.all()

    grouped = {}
    grand_total_qty = 0
    grand_total_amount = 0

    for row in results:
        c = row.category
        sc = row.sub_category
        vip = row.vip_status
        if c not in grouped:
            grouped[c] = {}
        if sc not in grouped[c]:
            grouped[c][sc] = {
                "items": [],
                "sub_category_total_qty": 0,
                "sub_category_total_amount": 0,
            }
        item_entry = {
            "menu_item_id": row.menu_item_id,
            "name": row.menu_item_name,
            "vip_status": vip,
            "quantity": float(row.quantity_sold),
            "average_price": float(row.average_price),
            "total_amount": float(row.total_amount),
        }
        grouped[c][sc]["items"].append(item_entry)
        grouped[c][sc]["sub_category_total_qty"] += float(row.quantity_sold)
        grouped[c][sc]["sub_category_total_amount"] += float(row.total_amount)
        grand_total_qty += float(row.quantity_sold)
        grand_total_amount += float(row.total_amount)

    report = []
    for category, subcats in grouped.items():
        cat_total_qty = 0
        cat_total_amount = 0
        subcategories_list = []
        for subcat, data in subcats.items():
            cat_total_qty += data["sub_category_total_qty"]
            cat_total_amount += data["sub_category_total_amount"]
            subcategories_list.append({
                "name": subcat,
                "total_qty": data["sub_category_total_qty"],
                "total_amount": data["sub_category_total_amount"],
                "items": data["items"],
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
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    # Price field considering VIP pricing
    price_field = case(
        (and_(Table.is_vip == True, OrderItem.vip_price != None), OrderItem.vip_price),
        else_=OrderItem.price
    )

    from app.models.models import User

    # Query: sum totals per waiter
    query = (
        db.session.query(
            Order.user_id.label("waiter_id"),
            User.username.label("waiter_name"),
            func.sum(price_field * OrderItem.quantity).label("total_sales")
        )
        .join(OrderItem.order)                   # OrderItem -> Order
        .join(Order.table)                       # Order -> Table
        .join(User, User.id == Order.user_id)    # Join to User table
        .filter(
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
            # Remove OrderItem.status filter temporarily if data missing
        )
        .group_by(Order.user_id, User.username)
        .order_by(User.username)
    )

    results = query.all()

    # Transform results into list
    report = [
        {
            "waiter_id": row.waiter_id,
            "waiter_name": row.waiter_name,
            "total_sales": float(row.total_sales or 0)
        }
        for row in results
    ]

    grand_total = sum(r["total_sales"] for r in report)

    return jsonify({
        "from": start_date,
        "to": end_date,
        "grand_total": grand_total,
        "report": report
    }), 200



@reports_bp.route('/waiter/<int:waiter_id>/details', methods=['GET'])
@jwt_required()
@roles_required("admin", "manager", "cashier")
def waiter_details(waiter_id):
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if not start_date or not end_date:
        return jsonify({'error': 'start_date and end_date query params are required (format YYYY-MM-DD)'}), 400

    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    # Price field considering VIP pricing
    price_field = case(
        (and_(Table.is_vip == True, OrderItem.vip_price != None), OrderItem.vip_price),
        else_=OrderItem.price
    )

    # Query items sold by this waiter in the range
    query = (
        db.session.query(
            MenuItem.name.label("item_name"),
            func.sum(OrderItem.quantity).label("quantity_sold"),
            func.sum(price_field * OrderItem.quantity).label("total_amount")
        )
        .join(OrderItem.order)
        .join(Order.table)
        .join(Order.user)
        .join(OrderItem.menu_item)
        .filter(
            Order.user_id == waiter_id,
            Order.created_at >= start_dt,
            Order.created_at < end_dt,
            OrderItem.status == "paid"
        )
        .group_by(MenuItem.id, MenuItem.name)
        .order_by(MenuItem.name)
    )

    results = query.all()

    details = [
        {
            "item_name": row.item_name,
            "quantity_sold": float(row.quantity_sold),
            "total_amount": float(row.total_amount)
        }
        for row in results
    ]

    grand_total = sum(d["total_amount"] for d in details)

    return jsonify({
        "waiter_id": waiter_id,
        "from": start_date,
        "to": end_date,
        "grand_total": grand_total,
        "details": details
    }), 200
