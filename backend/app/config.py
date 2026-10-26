"""Central settings: data window, decision defaults and file locations."""
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

# Purchase decisions are made on D-1 throughout January 2026,
# so delivery days run from 2 Jan to 1 Feb 2026 (inclusive).
FIRST_DELIVERY_DAY = date(2026, 1, 2)
LAST_DELIVERY_DAY = date(2026, 2, 1)

# The bias correction looks back this far, so we also pull this much
# history before the first delivery day (it is never scored).
BIAS_WINDOW = timedelta(days=7)

# FUELHH for a half-hour is published when that half-hour ends.
ACTUAL_PUBLISH_LAG = timedelta(minutes=30)

# A forecast already older than this at decision time (decision - publish) is never selected.
MAX_FORECAST_AGE_H = 48

# Fetch windows. Forecasts: early enough to cover the warm-up period at the
# longest horizon plus maximum age; late enough for 1h-ahead forecasts of the last delivery hour.
DATA_START = datetime.combine(FIRST_DELIVERY_DAY, time(0), UK_TZ) - BIAS_WINDOW
DATA_END = datetime.combine(LAST_DELIVERY_DAY + timedelta(days=1), time(0), UK_TZ)
FORECAST_PUBLISH_FROM = DATA_START - timedelta(hours=MAX_FORECAST_AGE_H + 48)
FORECAST_PUBLISH_TO = datetime.combine(LAST_DELIVERY_DAY, time(23, 0), UK_TZ)

# Assumed GB day-ahead auction gate closure on D-1 (UK local time).
DEFAULT_CUTOFF = time(9, 20)

# Grid served by the precomputed (deployed) API.
CUTOFF_GRID = [time(6, 0)] + [
    (datetime(2000, 1, 1, 6) + timedelta(minutes=20 * i)).time() for i in range(1, 19)
]
HORIZON_GRID = list(range(1, 49))

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ACTUALS_FILE = DATA_DIR / "actuals.parquet"
FORECASTS_FILE = DATA_DIR / "forecasts.parquet"
PRECOMPUTED_DIR = DATA_DIR / "precomputed"
