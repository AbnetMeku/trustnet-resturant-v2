from __future__ import annotations

from sqlalchemy import inspect

from app.extensions import db
from app.models.models import Table, TableNumberCounter


def ensure_table_number_counter() -> None:
    inspector = inspect(db.engine)
    if inspector.has_table(TableNumberCounter.__tablename__):
        return

    TableNumberCounter.__table__.create(bind=db.engine)
    max_existing = 0
    for table in Table.query.all():
        value = str(table.number or "").strip()
        if value.isdigit():
            max_existing = max(max_existing, int(value))

    db.session.add(TableNumberCounter(id=1, last_number=max_existing))
    db.session.flush()


def allocate_next_table_number() -> str:
    ensure_table_number_counter()
    counter = db.session.get(TableNumberCounter, 1)
    if not counter:
        max_existing = 0
        for table in Table.query.all():
            value = str(table.number or "").strip()
            if value.isdigit():
                max_existing = max(max_existing, int(value))
        counter = TableNumberCounter(id=1, last_number=max_existing)
        db.session.add(counter)
        db.session.flush()

    # If tables were created without updating the counter, resync to avoid duplicates.
    max_existing = counter.last_number or 0
    for table in Table.query.all():
        value = str(table.number or "").strip()
        if value.isdigit():
            max_existing = max(max_existing, int(value))
    if max_existing > (counter.last_number or 0):
        counter.last_number = max_existing

    counter.last_number += 1
    return str(counter.last_number)
