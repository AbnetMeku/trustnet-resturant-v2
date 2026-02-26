from datetime import datetime, date, time, timedelta
import pytz
from flask import has_app_context, has_request_context, g
from sqlalchemy import text

EAT_TZ = pytz.timezone("Africa/Addis_Ababa")
DEFAULT_BUSINESS_DAY_START = "06:00"


def eat_now() -> datetime:
    """Timezone-aware current datetime in East Africa Time."""
    return datetime.now(EAT_TZ)


def eat_now_naive() -> datetime:
    """Naive datetime normalized to East Africa wall-clock time."""
    return eat_now().replace(tzinfo=None)


def _parse_hhmm(value: str) -> time:
    if not isinstance(value, str):
        raise ValueError("Expected HH:MM string")
    parsed = value.strip()
    hour_str, minute_str = parsed.split(":")
    hour = int(hour_str)
    minute = int(minute_str)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("Invalid HH:MM")
    return time(hour=hour, minute=minute)


def get_business_day_start_time_str() -> str:
    """Configured business-day start time (HH:MM). Defaults to 06:00."""
    if not has_app_context():
        return DEFAULT_BUSINESS_DAY_START
    if has_request_context() and hasattr(g, "_business_day_start_time"):
        return g._business_day_start_time

    try:
        from app.extensions import db

        raw = db.session.execute(
            text("SELECT business_day_start_time FROM branding_settings WHERE id = 1")
        ).scalar_one_or_none()
    except Exception:
        return DEFAULT_BUSINESS_DAY_START

    candidate = (raw or DEFAULT_BUSINESS_DAY_START).strip()
    try:
        _parse_hhmm(candidate)
    except Exception:
        return DEFAULT_BUSINESS_DAY_START
    if has_request_context():
        g._business_day_start_time = candidate
    return candidate


def get_business_day_start_time() -> time:
    return _parse_hhmm(get_business_day_start_time_str())


def get_business_day_date(dt: datetime | None = None) -> date:
    """
    Returns the business date in EAT using configured reset time.
    Example: with 06:00 reset, 2026-02-25 01:30 is treated as 2026-02-24.
    """
    if dt is None:
        local_dt = eat_now()
    elif dt.tzinfo is None:
        local_dt = EAT_TZ.localize(dt)
    else:
        local_dt = dt.astimezone(EAT_TZ)

    reset_time = get_business_day_start_time()
    if local_dt.time() < reset_time:
        return (local_dt - timedelta(days=1)).date()
    return local_dt.date()


def get_eat_today() -> date:
    """Current business date in East Africa Time (using configured reset hour)."""
    return get_business_day_date()


def get_business_day_bounds(target_day: date) -> tuple[datetime, datetime]:
    """
    Returns [start, end) naive datetime bounds for a business day in EAT.
    """
    start = datetime.combine(target_day, get_business_day_start_time())
    end = start + timedelta(days=1)
    return start, end


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
    return func.timezone("Africa/Addis_Ababa", func_created_at)
