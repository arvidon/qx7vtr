"""Build every API payload from the Parquet snapshot (pandas path).

The deployed API serves these same payloads from precomputed JSON, so this
module is the single source of truth for what the frontend sees.
"""
from datetime import UTC, datetime, time, timedelta

import numpy as np
import pandas as pd

from . import metrics
from .config import (
    ACTUAL_PUBLISH_LAG,
    BIAS_WINDOW,
    FIRST_DELIVERY_DAY,
    HORIZON_GRID,
    LAST_DELIVERY_DAY,
    UK_TZ,
)
from .selection import add_bias_correction, select_forecasts, utc64

WINDOW_START = pd.Timestamp(datetime.combine(FIRST_DELIVERY_DAY, time(0), UK_TZ))
WINDOW_END = pd.Timestamp(datetime.combine(LAST_DELIVERY_DAY + timedelta(days=1), time(0), UK_TZ))
ISO = "%Y-%m-%dT%H:%M:%SZ"


def in_window(df: pd.DataFrame) -> pd.DataFrame:
    return df[(df.start_time >= WINDOW_START) & (df.start_time < WINDOW_END)]


def add_trailing_band(sel: pd.DataFrame, window: timedelta = BIAS_WINDOW) -> pd.DataFrame:
    """P10/P90 of errors already known at each decision, turned into an actual-output range.

    error = forecast - actual, so actual = forecast - error: the band is
    [forecast - p90, forecast - p10]. It is the same in MW for the corrected forecast.
    """
    out = sel.copy()
    starts, errs = utc64(out["start_time"]), out["error_mw"].to_numpy()
    lows, highs = [], []
    for d, f in zip(utc64(out["decision_time"]), out["forecast_mw"].to_numpy(), strict=True):
        lo = np.searchsorted(starts, d - np.timedelta64(window), "left")
        hi = np.searchsorted(starts, d - np.timedelta64(ACTUAL_PUBLISH_LAG), "right")
        if hi > lo:
            p10, p90 = np.quantile(errs[lo:hi], [0.1, 0.9])
            lows.append(f - p90)
            highs.append(f - p10)
        else:
            lows.append(np.nan)
            highs.append(np.nan)
    out["band_low_mw"], out["band_high_mw"] = lows, highs
    return out


def build_selection(actuals, forecasts, cutoff: time | None, horizon: int | None) -> pd.DataFrame:
    sel = select_forecasts(forecasts, actuals, cutoff=cutoff, horizon_hours=horizon)
    sel = add_trailing_band(add_bias_correction(sel))
    return in_window(sel).reset_index(drop=True)


def _round(v):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 1)


def day_payloads(sel: pd.DataFrame, actuals: pd.DataFrame) -> dict[str, dict]:
    """One payload per UK delivery day."""
    out = {}
    local_day = sel["start_time"].dt.tz_convert(UK_TZ).dt.date
    act_day = actuals["start_time"].dt.tz_convert(UK_TZ).dt.date
    for d, rows in sel.groupby(local_day):
        hh = actuals[act_day == d]
        out[d.isoformat()] = {
            "date": d.isoformat(),
            "points": [
                {
                    "start_time": r.start_time.strftime(ISO),
                    "decision_time": r.decision_time.strftime(ISO),
                    "publish_time": r.publish_time.strftime(ISO),
                    "horizon_h": _round(r.horizon_h),
                    "forecast_mw": _round(r.forecast_mw),
                    "forecast_corrected_mw": _round(r.forecast_corrected_mw),
                    "bias_est_mw": _round(r.bias_est_mw),
                    "band_low_mw": _round(r.band_low_mw),
                    "band_high_mw": _round(r.band_high_mw),
                    "actual_mw": _round(r.actual_mw),
                }
                for r in rows.itertuples()
            ],
            "actual_halfhourly": [
                {"start_time": t.strftime(ISO), "actual_mw": _round(g)}
                for t, g in zip(hh.start_time, hh.generation_mw, strict=True)
            ],
            "summary": metrics.summary(rows),
            "summary_corrected": metrics.summary(rows, "error_corrected_mw"),
            # Hourly points, so summing MW gives MWh.
            "forecast_mwh": _round(rows["forecast_mw"].sum()),
            "forecast_corrected_mwh": _round(rows["forecast_corrected_mw"].sum()),
            "band_low_mwh": _round(rows["band_low_mw"].sum(min_count=1)),
            "band_high_mwh": _round(rows["band_high_mw"].sum(min_count=1)),
            "actual_mwh": _round(hh["generation_mw"].sum() / 2),
        }
    return out


def metrics_payload(sel: pd.DataFrame) -> dict:
    c = "error_corrected_mw"
    return {
        "summary": metrics.summary(sel),
        "summary_corrected": metrics.summary(sel, c),
        "by_hour": metrics.by_hour_of_day(sel),
        "by_hour_corrected": metrics.by_hour_of_day(sel, c),
        "by_day": metrics.by_day(sel),
        "by_day_corrected": metrics.by_day(sel, c),
        "histogram": metrics.histogram(sel),
        "histogram_corrected": metrics.histogram(sel, c),
    }


def horizon_curve(actuals, forecasts, horizons=HORIZON_GRID) -> list[dict]:
    """Score every horizon on the same target hours: those with a forecast at all of them."""
    per_h = {h: build_selection(actuals, forecasts, None, h) for h in horizons}
    common = set.intersection(*(set(s["start_time"]) for s in per_h.values()))
    out = []
    for h, s in per_h.items():
        s = s[s["start_time"].isin(common)]
        out.append({
            "horizon_h": h,
            "n": len(s),
            "mae_mw": _round(s["error_mw"].abs().mean()),
            "rmse_mw": _round(np.sqrt((s["error_mw"] ** 2).mean())),
            "bias_mw": _round(s["error_mw"].mean()),
            "mae_corrected_mw": _round(s["error_corrected_mw"].abs().mean()),
        })
    return out


def vintages(actuals: pd.DataFrame, forecasts: pd.DataFrame) -> dict[str, dict]:
    f = in_window(forecasts).sort_values(["start_time", "publish_time"])
    act = dict(zip(actuals["start_time"], actuals["generation_mw"], strict=True))
    out = {}
    for t, g in f.groupby("start_time"):
        out[t.strftime(ISO)] = {
            "target": t.strftime(ISO),
            "actual_mw": _round(act.get(t)),
            "vintages": [
                {
                    "publish_time": p.strftime(ISO),
                    "horizon_h": _round((t - p).total_seconds() / 3600),
                    "forecast_mw": _round(v),
                }
                for p, v in zip(g["publish_time"], g["generation_mw"], strict=True)
            ],
        }
    return out


def meta(actuals: pd.DataFrame, forecasts: pd.DataFrame) -> dict:
    from .config import CUTOFF_GRID, DEFAULT_CUTOFF, MAX_FORECAST_AGE_H

    return {
        "first_delivery_day": FIRST_DELIVERY_DAY.isoformat(),
        "last_delivery_day": LAST_DELIVERY_DAY.isoformat(),
        "default_cutoff": DEFAULT_CUTOFF.strftime("%H:%M"),
        "cutoff_grid": [c.strftime("%H:%M") for c in CUTOFF_GRID],
        "horizon_grid": list(HORIZON_GRID),
        "max_forecast_age_h": MAX_FORECAST_AGE_H,
        "bias_window_days": BIAS_WINDOW.days,
        "actual_rows": len(in_window(actuals)),
        "forecast_rows": len(in_window(forecasts)),
        "forecast_vintages": int(in_window(forecasts)["publish_time"].nunique()),
        "snapshot_at": snapshot_time().strftime(ISO),
    }


def snapshot_time() -> datetime:
    """When the pipeline last wrote the Parquet snapshot."""

    from .config import FORECASTS_FILE

    return datetime.fromtimestamp(FORECASTS_FILE.stat().st_mtime, tz=UTC)
