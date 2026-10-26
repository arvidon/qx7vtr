"""Two interchangeable data sources behind the API.

StaticStore reads precomputed JSON (deployed; no pandas).
LiveStore computes on request from Parquet (local and Docker; WINDBOOK_LIVE=1).
"""
import json
from datetime import time
from functools import cache, lru_cache

from .config import PRECOMPUTED_DIR
from .modes import mode_key


class NotFound(LookupError):
    pass


class StaticStore:
    @cache
    def _file(self, name: str):
        path = PRECOMPUTED_DIR / f"{name}.json"
        if not path.exists():
            raise NotFound(name)
        return json.loads(path.read_text())

    def _mode(self, cutoff: time | None, horizon: int | None) -> dict:
        try:
            return self._file(mode_key(cutoff, horizon))
        except NotFound:
            raise NotFound("only cutoffs 06:00-12:00 in 20-minute steps and horizons 1-48h are available") from None

    def meta(self):
        return self._file("meta")

    def metrics(self, cutoff, horizon):
        return self._mode(cutoff, horizon)["metrics"]

    def day(self, date: str, cutoff, horizon):
        days = self._mode(cutoff, horizon)["days"]
        if date not in days:
            raise NotFound(f"no data for {date}")
        return days[date]

    def horizon_curve(self):
        return self._file("horizon-curve")

    def vintages(self, target: str):
        v = self._file("vintages")
        if target not in v:
            raise NotFound("no forecasts for that target hour")
        return v[target]


class LiveStore:
    def __init__(self):
        import pandas as pd

        from . import service
        from .config import ACTUALS_FILE, FORECASTS_FILE

        self._svc = service
        self._a = pd.read_parquet(ACTUALS_FILE)
        self._f = pd.read_parquet(FORECASTS_FILE)

    @lru_cache(maxsize=64)
    def _sel(self, cutoff, horizon):
        return self._svc.build_selection(self._a, self._f, cutoff, horizon)

    @lru_cache(maxsize=64)
    def _days(self, cutoff, horizon):
        return self._svc.day_payloads(self._sel(cutoff, horizon), self._a)

    def meta(self):
        return self._svc.meta(self._a, self._f)

    def metrics(self, cutoff, horizon):
        return self._svc.metrics_payload(self._sel(cutoff, horizon))

    def day(self, date, cutoff, horizon):
        days = self._days(cutoff, horizon)
        if date not in days:
            raise NotFound(f"no data for {date}")
        return days[date]

    @lru_cache(maxsize=1)
    def horizon_curve(self):
        return self._svc.horizon_curve(self._a, self._f)

    @lru_cache(maxsize=1)
    def _vintages(self):
        return self._svc.vintages(self._a, self._f)

    def vintages(self, target):
        v = self._vintages()
        if target not in v:
            raise NotFound("no forecasts for that target hour")
        return v[target]
