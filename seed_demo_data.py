import argparse
import random
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from werkzeug.security import generate_password_hash

from app import create_app, db
from app.models.models import (
    BrandingSettings,
    Category,
    MenuItem,
    Order,
    OrderItem,
    PrintJob,
    Station,
    SubCategory,
    Table,
    User,
)


def to_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_or_create_user(username: str, role: str, password: str, pin: str | None = None) -> User:
    user = User.query.filter_by(username=username).first()
    if not user:
        user = User(username=username, role=role)
        db.session.add(user)
    user.role = role
    if role in {"admin", "manager", "cashier"}:
        user.password_hash = generate_password_hash(password)
        user.pin_hash = None
    else:
        user.password_hash = generate_password_hash(password)
        user.pin_hash = pin
    return user


def get_or_create_station(name: str, printer_identifier: str) -> Station:
    station = Station.query.filter_by(name=name).first()
    if not station:
        station = Station(name=name, password_hash=generate_password_hash("1234"))
        db.session.add(station)
    station.printer_identifier = printer_identifier
    return station


def get_or_create_table(number: str, is_vip: bool) -> Table:
    table = Table.query.filter_by(number=number).first()
    if not table:
        table = Table(number=number, is_vip=is_vip)
        db.session.add(table)
    table.is_vip = is_vip
    table.status = "available"
    return table


def get_or_create_category(name: str, quantity_step: Decimal) -> Category:
    cat = Category.query.filter_by(name=name).first()
    if not cat:
        cat = Category(name=name, quantity_step=quantity_step)
        db.session.add(cat)
    cat.quantity_step = quantity_step
    return cat


def get_or_create_subcategory(name: str, category: Category) -> SubCategory:
    sub = SubCategory.query.filter_by(name=name, category_id=category.id).first()
    if not sub:
        sub = SubCategory(name=name, category=category)
        db.session.add(sub)
    return sub


def get_or_create_menu_item(
    name: str,
    price: Decimal,
    vip_price: Decimal | None,
    quantity_step: Decimal | None,
    station: Station,
    subcategory: SubCategory,
) -> MenuItem:
    item = MenuItem.query.filter_by(name=name).first()
    if not item:
        item = MenuItem(name=name, station_rel=station, subcategory=subcategory)
        db.session.add(item)
    item.price = price
    item.vip_price = vip_price
    item.quantity_step = quantity_step
    item.is_available = True
    return item


def seed_base_entities():
    admin = get_or_create_user("admin_demo", "admin", "admin123")
    manager = get_or_create_user("manager_demo", "manager", "manager123")
    cashier = get_or_create_user("cashier_demo", "cashier", "cashier123")

    waiters = []
    for idx in range(1, 9):
        waiters.append(
            get_or_create_user(
                f"waiter_demo_{idx}",
                "waiter",
                "waiter123",
                pin=f"{1000 + idx}",
            )
        )

    stations = [
        get_or_create_station("Hot Kitchen", "KITCHEN_HP_01"),
        get_or_create_station("Grill", "GRILL_EPSON_02"),
        get_or_create_station("Bar", "BAR_EPSON_03"),
        get_or_create_station("Pastry", "PASTRY_EPSON_04"),
    ]

    tables = []
    for n in range(1, 31):
        tables.append(get_or_create_table(str(n), is_vip=(n % 7 == 0)))

    db.session.flush()

    # Assign waiters across tables in round-robin.
    for t in tables:
        t.waiters = [waiters[(int(t.number) - 1) % len(waiters)]]

    food = get_or_create_category("Food", Decimal("1.00"))
    drinks = get_or_create_category("Drinks", Decimal("1.00"))
    specials = get_or_create_category("Specials", Decimal("0.50"))
    db.session.flush()

    mains = get_or_create_subcategory("Mains", food)
    tibs = get_or_create_subcategory("Tibs", food)
    soft = get_or_create_subcategory("Soft Drinks", drinks)
    hot = get_or_create_subcategory("Hot Drinks", drinks)
    chef = get_or_create_subcategory("Chef Specials", specials)
    db.session.flush()

    menu_specs = [
        ("Kitfo", Decimal("14.00"), Decimal("16.00"), Decimal("1.00"), "Hot Kitchen", mains),
        ("Shiro", Decimal("9.00"), Decimal("10.50"), Decimal("1.00"), "Hot Kitchen", mains),
        ("Doro Wot", Decimal("13.50"), Decimal("15.00"), Decimal("1.00"), "Hot Kitchen", mains),
        ("Special Tibs", Decimal("15.00"), Decimal("17.00"), Decimal("1.00"), "Grill", tibs),
        ("Awaze Tibs", Decimal("14.50"), Decimal("16.50"), Decimal("1.00"), "Grill", tibs),
        ("Macchiato", Decimal("3.00"), Decimal("3.50"), Decimal("1.00"), "Bar", hot),
        ("Tea", Decimal("2.50"), Decimal("3.00"), Decimal("1.00"), "Bar", hot),
        ("Soda", Decimal("2.00"), Decimal("2.50"), Decimal("1.00"), "Bar", soft),
        ("Fresh Juice", Decimal("4.50"), Decimal("5.50"), Decimal("1.00"), "Bar", soft),
        ("Chef Platter", Decimal("22.00"), Decimal("25.00"), Decimal("0.50"), "Pastry", chef),
        ("Seasonal Dessert", Decimal("6.00"), Decimal("7.00"), Decimal("0.50"), "Pastry", chef),
    ]

    station_by_name = {s.name: s for s in stations}
    menu_items = []
    for name, price, vip_price, step, station_name, subcat in menu_specs:
        menu_items.append(
            get_or_create_menu_item(
                name,
                price,
                vip_price,
                step,
                station_by_name[station_name],
                subcat,
            )
        )

    branding = BrandingSettings.query.get(1)
    if not branding:
        branding = BrandingSettings(id=1)
        db.session.add(branding)

    db.session.commit()
    return {
        "admin": admin,
        "manager": manager,
        "cashier": cashier,
        "waiters": waiters,
        "stations": stations,
        "tables": tables,
        "menu_items": menu_items,
    }


def choose_item_status(order_status: str) -> str:
    r = random.random()
    if order_status == "open":
        if r < 0.58:
            return "pending"
        if r < 0.90:
            return "ready"
        return "void"
    if r < 0.85:
        return "ready"
    return "void"


def choose_job_status(order_status: str) -> str:
    r = random.random()
    if order_status == "open":
        if r < 0.65:
            return "pending"
        if r < 0.88:
            return "failed"
        return "printed"
    if r < 0.72:
        return "printed"
    if r < 0.90:
        return "failed"
    return "pending"


def seed_orders_and_print_jobs(ctx: dict, target_orders: int, days: int):
    waiter_ids = [w.id for w in ctx["waiters"]]
    tables = ctx["tables"]
    menu_items = ctx["menu_items"]

    existing_demo_orders = Order.query.filter(Order.user_id.in_(waiter_ids)).count()
    to_create = max(target_orders - existing_demo_orders, 0)
    if to_create == 0:
        return 0

    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    prep_counter = 4000

    for idx in range(to_create):
        day_offset = random.randint(0, days - 1)
        created_at = now - timedelta(days=day_offset, hours=random.randint(0, 13))

        if day_offset == 0:
            status = random.choices(["open", "closed", "paid"], weights=[0.35, 0.25, 0.40])[0]
        else:
            status = random.choices(["open", "closed", "paid"], weights=[0.10, 0.35, 0.55])[0]

        waiter = random.choice(ctx["waiters"])
        table = random.choice(tables)

        order = Order(
            table_id=table.id,
            user_id=waiter.id,
            status=status,
            total_amount=Decimal("0.00"),
            created_at=created_at,
            updated_at=created_at,
        )
        db.session.add(order)
        db.session.flush()

        item_count = random.randint(2, 6)
        total = Decimal("0.00")
        station_items_map: dict[int, list[dict]] = {}

        for _ in range(item_count):
            mi = random.choice(menu_items)
            qty_options = [Decimal("1.0"), Decimal("1.0"), Decimal("2.0"), Decimal("3.0")]
            if mi.quantity_step == Decimal("0.50"):
                qty_options.extend([Decimal("0.5"), Decimal("1.5")])
            qty = random.choice(qty_options)

            item_status = choose_item_status(status)
            price = Decimal(str(mi.vip_price if table.is_vip and mi.vip_price is not None else mi.price))
            prep_counter += 1
            prep_tag = str(prep_counter)

            oi = OrderItem(
                order_id=order.id,
                menu_item_id=mi.id,
                quantity=qty,
                printed_quantity=Decimal("0"),
                price=price,
                vip_price=mi.vip_price,
                notes=random.choice(["", "", "No onion", "Extra spicy", "Serve fast"]) or None,
                prep_tag=prep_tag,
                status=item_status,
                station=mi.station_rel.name,
                created_at=created_at,
                updated_at=created_at,
            )
            db.session.add(oi)

            if item_status != "void":
                total += price * qty

            station_items_map.setdefault(mi.station_id, []).append(
                {
                    "name": mi.name,
                    "quantity": float(qty),
                    "price": float(price),
                    "station": mi.station_rel.name,
                    "prep_tag": prep_tag,
                }
            )

        order.total_amount = to_money(total)
        table.status = "occupied" if status == "open" else table.status

        # Station print jobs.
        for station in ctx["stations"]:
            items = station_items_map.get(station.id, [])
            if not items:
                continue
            job_status = choose_job_status(status)
            job = PrintJob(
                order_id=order.id,
                station_id=station.id,
                type="station",
                items_data={
                    "order_id": order.id,
                    "table": table.number,
                    "waiter": waiter.username,
                    "items": items,
                },
                status=job_status,
                attempts=0 if job_status == "pending" else random.randint(1, 3),
                error_message="Printer offline" if job_status == "failed" else None,
                printed_at=created_at + timedelta(minutes=2) if job_status == "printed" else None,
                created_at=created_at,
                updated_at=created_at,
            )
            db.session.add(job)

        # Cashier receipt jobs for closed/paid orders.
        if status in {"closed", "paid"} and random.random() < 0.75:
            c_status = random.choices(["printed", "failed", "pending"], weights=[0.75, 0.15, 0.10])[0]
            c_job = PrintJob(
                order_id=order.id,
                station_id=None,
                type="cashier",
                items_data={
                    "order_id": order.id,
                    "table": table.number,
                    "waiter": waiter.username,
                    "items": sum(station_items_map.values(), []),
                    "total": float(order.total_amount),
                },
                status=c_status,
                attempts=0 if c_status == "pending" else random.randint(1, 2),
                error_message="Receipt printer jam" if c_status == "failed" else None,
                printed_at=created_at + timedelta(minutes=4) if c_status == "printed" else None,
                created_at=created_at,
                updated_at=created_at,
            )
            db.session.add(c_job)

        if idx > 0 and idx % 100 == 0:
            db.session.commit()

    db.session.commit()
    return to_create


def main():
    parser = argparse.ArgumentParser(description="Seed production-like demo data for TrustNet Restaurant.")
    parser.add_argument("--target-orders", type=int, default=450, help="Total demo orders to keep for demo waiters.")
    parser.add_argument("--days", type=int, default=30, help="How many days back to distribute orders.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    args = parser.parse_args()

    random.seed(args.seed)

    app = create_app("development")
    with app.app_context():
        ctx = seed_base_entities()
        created_orders = seed_orders_and_print_jobs(ctx, args.target_orders, args.days)

        stats = {
            "users": User.query.count(),
            "tables": Table.query.count(),
            "stations": Station.query.count(),
            "categories": Category.query.count(),
            "subcategories": SubCategory.query.count(),
            "menu_items": MenuItem.query.count(),
            "orders": Order.query.count(),
            "order_items": OrderItem.query.count(),
            "print_jobs": PrintJob.query.count(),
        }

        print("Seed complete.")
        print(f"Orders created this run: {created_orders}")
        for k, v in stats.items():
            print(f"{k}: {v}")


if __name__ == "__main__":
    main()
