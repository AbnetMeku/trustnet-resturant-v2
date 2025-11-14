from datetime import datetime, date
import pytz

EAT_TZ = pytz.timezone("Africa/Addis_Ababa")

def get_eat_today():
    """Return today's date in East Africa Time."""
    return datetime.now(EAT_TZ).date()

def parse_date_or_today(date_str: str = None) -> date:
    """
    Parse a YYYY-MM-DD string to a date, or return EAT today if None.
    Raises ValueError if format is invalid.
    """
    if date_str:
        return datetime.fromisoformat(date_str).date()
    return get_eat_today()

def eat_date(func_created_at):
    """
    Wrap a datetime column to convert to EAT date for queries.
    Usage in SQLAlchemy: db.func.date(eat_date(Model.created_at))
    """
    from sqlalchemy import func
    # PostgreSQL example: convert UTC to EAT
    return func.timezone("Africa/Addis_Ababa", func_created_at)
