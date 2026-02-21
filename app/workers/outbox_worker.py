import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.services.inventory_integration import process_inventory_outbox_batch

logger = logging.getLogger(__name__)
_scheduler = None


def start_inventory_outbox_worker(app):
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    interval = int(app.config.get("INVENTORY_OUTBOX_RETRY_INTERVAL_SECONDS", 10))

    scheduler = BackgroundScheduler(daemon=True)

    def _job():
        with app.app_context():
            processed = process_inventory_outbox_batch()
            if processed:
                logger.info("Inventory outbox worker processed %s event(s)", processed)

    scheduler.add_job(_job, "interval", seconds=interval, id="inventory_outbox_retry")
    scheduler.start()
    _scheduler = scheduler
    return scheduler
