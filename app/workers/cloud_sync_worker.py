import logging
import time

from app.pos_app import create_pos_app
from app.services.cloud_sync import run_cloud_sync_cycle, sleep_seconds

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cloud_sync_worker")


def main():
    app = create_pos_app("production")
    with app.app_context():
        logger.info("Cloud sync worker started")
        while True:
            try:
                result = run_cloud_sync_cycle()
                logger.info("Cloud sync cycle completed: %s", result)
            except Exception:
                logger.exception("Cloud sync cycle failed")
            time.sleep(sleep_seconds())


if __name__ == "__main__":
    main()
