from __future__ import annotations

from app.models import Table, User


def waiter_allowed_station_ids(user: User) -> set[int]:
    if not user or user.role != "waiter":
        return set()
    profile = user.waiter_profile
    if not profile:
        return set()
    return {station.id for station in profile.stations}


def waiter_can_access_table(user: User, table: Table) -> bool:
    if not user or not table or user.role != "waiter":
        return False
    if table not in user.tables:
        return False
    profile = user.waiter_profile
    if not profile:
        return True
    if table.is_vip and not profile.allow_vip:
        return False
    return True


def auto_assign_tables_for_waiter(user: User, replace_existing: bool = False) -> list[Table]:
    if not user or user.role != "waiter" or not user.waiter_profile:
        return []

    profile = user.waiter_profile
    max_tables = max(int(profile.max_tables or 0), 0)
    if max_tables == 0:
        if replace_existing:
            user.tables = []
        return []

    existing: list[Table] = list(user.tables)
    if replace_existing:
        existing = []
        user.tables = []

    remaining_slots = max_tables - len(existing)
    if remaining_slots <= 0:
        return existing[:max_tables]

    target_is_vip = bool(profile.allow_vip)
    candidates = (
        Table.query.filter_by(status="available")
        .filter(Table.is_vip.is_(target_is_vip))
        .order_by(Table.id.asc())
        .all()
    )

    already_assigned_ids = {t.id for t in user.tables}
    for table in candidates:
        if remaining_slots <= 0:
            break
        if table.id in already_assigned_ids:
            continue
        user.tables.append(table)
        already_assigned_ids.add(table.id)
        remaining_slots -= 1

    return list(user.tables)
