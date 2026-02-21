import logging
from typing import Optional

import requests
from flask import current_app
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models.models import InventoryOutbox

logger = logging.getLogger(__name__)


def _inventory_adjust_url() -> str:
    base = current_app.config.get("INVENTORY_BASE_URL", "http://127.0.0.1:5001").rstrip("/")
    return f"{base}/api/inventory/internal/adjust"


def _service_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "X-Service-Key": current_app.config.get("INVENTORY_SERVICE_KEY", ""),
    }


def _queue_outbox_event(event_type: str, payload: dict, error_message: Optional[str] = None) -> None:
    try:
        event = InventoryOutbox(
            event_type=event_type,
            payload=payload,
            status="pending",
            retry_count=0,
            last_error=error_message,
        )
        db.session.add(event)
        db.session.commit()
    except SQLAlchemyError as exc:
        db.session.rollback()
        logger.error("Failed to queue inventory outbox event: %s", exc)


def send_inventory_adjustment_or_queue(
    station_name: str,
    menu_item_id: int,
    quantity: float,
    reverse: bool = False,
) -> None:
    """
    Best-effort synchronous push to inventory service.
    If inventory is down/unreachable, queue to outbox and continue POS flow.
    """
    payload = {
        "event_type": "adjust_inventory",
        "station_name": station_name,
        "menu_item_id": int(menu_item_id),
        "quantity": float(quantity),
        "reverse": bool(reverse),
    }

    timeout = current_app.config.get("INVENTORY_SYNC_TIMEOUT_SECONDS", 2)
    url = _inventory_adjust_url()
    try:
        resp = requests.post(
            url,
            json=payload,
            headers=_service_headers(),
            timeout=timeout,
        )
        if 200 <= resp.status_code < 300:
            return
        _queue_outbox_event(
            event_type="adjust_inventory",
            payload=payload,
            error_message=f"Inventory service returned {resp.status_code}",
        )
    except Exception as exc:
        _queue_outbox_event(
            event_type="adjust_inventory",
            payload=payload,
            error_message=str(exc),
        )


def process_inventory_outbox_batch() -> int:
    """
    Retry pending outbox events.
    Returns processed row count.
    """
    batch_size = int(current_app.config.get("INVENTORY_OUTBOX_BATCH_SIZE", 50))
    timeout = current_app.config.get("INVENTORY_SYNC_TIMEOUT_SECONDS", 2)

    try:
        pending = (
            InventoryOutbox.query.filter_by(status="pending")
            .order_by(InventoryOutbox.created_at.asc())
            .limit(batch_size)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.warning("Inventory outbox unavailable, skipping retry batch: %s", exc)
        db.session.rollback()
        return 0
    processed = 0
    for event in pending:
        try:
            if event.event_type != "adjust_inventory":
                event.status = "failed"
                event.last_error = f"Unsupported event_type: {event.event_type}"
                db.session.commit()
                processed += 1
                continue

            resp = requests.post(
                _inventory_adjust_url(),
                json=event.payload,
                headers=_service_headers(),
                timeout=timeout,
            )
            if 200 <= resp.status_code < 300:
                event.status = "sent"
                event.last_error = None
            else:
                event.retry_count = (event.retry_count or 0) + 1
                event.last_error = f"HTTP {resp.status_code}"
            db.session.commit()
            processed += 1
        except Exception as exc:
            event.retry_count = (event.retry_count or 0) + 1
            event.last_error = str(exc)
            db.session.commit()
            processed += 1

    return processed
