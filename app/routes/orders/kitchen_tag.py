from app.models.models import KitchenTagCounter, db
import logging
from app.utils.timezone import get_eat_today

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_kitchen_tag() -> str:
    """
    Generates a 4-digit kitchen tag that resets daily.
    Format: '0001', '0002', ..., '9999'
    """
    today = get_eat_today()

    try:
        # Lock the counter record to prevent race conditions
        counter = (
            db.session.query(KitchenTagCounter)
            .filter_by(date=today)
            .with_for_update()
            .first()
        )

        if not counter:
            counter = KitchenTagCounter(date=today, last_number=1)
            db.session.add(counter)
            logger.info(f"Created new KitchenTagCounter for {today}")
        else:
            counter.last_number += 1
            if counter.last_number > 9999:
                logger.warning(
                    f"Kitchen tag limit reached for {today}. Resetting to 1."
                )
                counter.last_number = 1  # Reset after 9999

        tag = f"{counter.last_number:04d}"
        logger.debug(f"Generated kitchen tag {tag} for {today}")
        return tag

    except Exception as e:
        logger.error(f"Failed to generate kitchen tag for {today}: {str(e)}")
        raise
