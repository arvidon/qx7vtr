"""Pick, for every target hour, the forecast a trader could actually have seen.

Two ways to define "available":
  * cutoff  - newest forecast published at or before HH:MM (UK time) on D-1,
              where D is the UK delivery day of the target. Mirrors a day-ahead bid.
  * horizon - newest forecast published at least `h` hours before the target.

Both are strict about look-ahead: a forecast published after the decision
moment is never used, and neither is one that was already more than
MAX_FORECAST_AGE_H old at that moment.
WINDFOR is hourly, so evaluation is on hourly targets, compared with the
FUELHH half-hour that starts on the same timestamp.
"""
from datetime import datetime, time, timedelta

import numpy as np
import pandas as pd

from .config import ACTUAL_PUBLISH_LAG, BIAS_WINDOW, MAX_FORECAST_AGE_H, UK_TZ


def decision_time_for(target: pd.Series, cutoff: time) -> pd.Series:
    """UTC decision moment (cutoff on D-1, UK local) for each UTC target time."""
    local_day = target.dt.tz_convert(UK_TZ).dt.date
    return pd.Series(
        [datetime.combine(d - timedelta(days=1), cutoff, UK_TZ) for d in local_day],
        index=target.index,
    ).pipe(pd.to_datetime, utc=True)


def _latest_before(forecasts: pd.DataFrame, targets: pd.DataFrame) -> pd.DataFrame:
    """For each (start_time, decision_time) pick the newest forecast with publish_time <= decision_time."""
    f = forecasts.rename(columns={"publish_time": "decision_time"}).assign(
        publish_time=forecasts["publish_time"]
    )
    picked = pd.merge_asof(
        targets.sort_values("decision_time"),
        f.sort_values("decision_time"),
        on="decision_time",
        by="start_time",
        direction="backward",
    )
    return picked.rename(columns={"generation_mw": "forecast_mw"})


def select_forecasts(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    *,
    cutoff: time | None = None,
    horizon_hours: float | None = None,
    max_age_h: float = MAX_FORECAST_AGE_H,
) -> pd.DataFrame:
    """Return one row per hourly target: start_time, publish_time, horizon_h, forecast_mw, actual_mw, error_mw."""
    if (cutoff is None) == (horizon_hours is None):
        raise ValueError("pass exactly one of cutoff or horizon_hours")

    targets = pd.DataFrame({"start_time": forecasts["start_time"].drop_duplicates().sort_values()})
    if cutoff is not None:
        targets["decision_time"] = decision_time_for(targets["start_time"], cutoff)
    else:
        targets["decision_time"] = targets["start_time"] - pd.Timedelta(hours=horizon_hours)

    picked = _latest_before(forecasts, targets).dropna(subset=["forecast_mw"])
    out = picked.merge(
        actuals.rename(columns={"generation_mw": "actual_mw"}), on="start_time", how="inner"
    )
    out["horizon_h"] = (out["start_time"] - out["publish_time"]).dt.total_seconds() / 3600
    # Age = how stale the forecast was when the decision was made. Too-old
    # forecasts are dropped rather than replaced: nothing newer existed in time.
    age_h = (out["decision_time"] - out["publish_time"]).dt.total_seconds() / 3600
    out = out[age_h <= max_age_h]
    out["error_mw"] = out["forecast_mw"] - out["actual_mw"]
    cols = ["start_time", "decision_time", "publish_time", "horizon_h", "forecast_mw", "actual_mw", "error_mw"]
    return out[cols].sort_values("start_time").reset_index(drop=True)


def utc64(s: pd.Series) -> np.ndarray:
    """tz-aware UTC series -> naive datetime64 array (numpy can't subtract tz-aware objects)."""
    return s.dt.tz_convert("UTC").dt.tz_localize(None).to_numpy()


def add_bias_correction(sel: pd.DataFrame, window: timedelta = BIAS_WINDOW) -> pd.DataFrame:
    """Subtract a trailing mean error that was knowable at each decision time.

    For target i, the bias estimate is the mean error of earlier targets j with
    decision_i - window <= start_j and start_j + ACTUAL_PUBLISH_LAG <= decision_i,
    i.e. their actual had been published before the decision. Rows with no
    history get no correction (bias_est_mw = 0, has_bias_history = False).
    """
    out = sel.sort_values("start_time").reset_index(drop=True)
    starts, decisions = utc64(out["start_time"]), utc64(out["decision_time"])
    csum = np.concatenate([[0.0], np.cumsum(out["error_mw"].to_numpy())])

    lo = np.searchsorted(starts, decisions - np.timedelta64(window), side="left")
    hi = np.searchsorted(starts, decisions - np.timedelta64(ACTUAL_PUBLISH_LAG), side="right")
    n = np.maximum(hi - lo, 0)
    bias = np.where(n > 0, (csum[np.maximum(hi, lo)] - csum[lo]) / np.maximum(n, 1), 0.0)

    out["bias_est_mw"] = bias
    out["has_bias_history"] = n > 0
    out["forecast_corrected_mw"] = out["forecast_mw"] - bias
    out["error_corrected_mw"] = out["forecast_corrected_mw"] - out["actual_mw"]
    return out
