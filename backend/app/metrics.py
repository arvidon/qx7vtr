"""Error statistics on a selection from selection.select_forecasts.

Sign convention: error = forecast - actual. Positive means wind was
over-forecast, so the buyer ends up short and must top up at short notice.
Every function takes `col` so the same stats work on the bias-corrected error.
"""
import numpy as np
import pandas as pd

from .config import UK_TZ


def summary(sel: pd.DataFrame, col: str = "error_mw") -> dict:
    e = sel[col]
    if e.empty:
        return {"n": 0}
    return {
        "n": int(e.size),
        "mae_mw": float(e.abs().mean()),
        "rmse_mw": float(np.sqrt((e**2).mean())),
        "bias_mw": float(e.mean()),
        "p10_mw": float(e.quantile(0.10)),
        "p50_mw": float(e.quantile(0.50)),
        "p90_mw": float(e.quantile(0.90)),
        "max_abs_mw": float(e.abs().max()),
        # MAE relative to mean actual output; avoids MAPE blowing up at low wind.
        "nmae_pct": float(100 * e.abs().mean() / sel["actual_mw"].mean()),
        "mean_horizon_h": float(sel["horizon_h"].mean()),
    }


def by_hour_of_day(sel: pd.DataFrame, col: str = "error_mw") -> list[dict]:
    hour = sel["start_time"].dt.tz_convert(UK_TZ).dt.hour
    return [
        {"hour": int(h), "mae_mw": float(v.abs().mean()), "bias_mw": float(v.mean()), "n": int(v.size)}
        for h, v in sel.groupby(hour)[col]
    ]


def by_day(sel: pd.DataFrame, col: str = "error_mw") -> list[dict]:
    day = sel["start_time"].dt.tz_convert(UK_TZ).dt.date
    return [
        {
            "date": d.isoformat(),
            "mae_mw": float(v[col].abs().mean()),
            "bias_mw": float(v[col].mean()),
            "actual_mwh": float(v["actual_mw"].sum()),  # hourly points, so MW x 1h
            "forecast_mwh": float(v["forecast_mw"].sum()),
        }
        for d, v in sel.groupby(day)
    ]


def histogram(sel: pd.DataFrame, col: str = "error_mw", bin_mw: int = 500) -> list[dict]:
    e = sel[col]
    if e.empty:
        return []
    lo = int(np.floor(e.min() / bin_mw) * bin_mw)
    hi = int(np.ceil(e.max() / bin_mw) * bin_mw) + bin_mw
    counts, edges = np.histogram(e, bins=np.arange(lo, hi, bin_mw))
    return [{"from_mw": int(a), "to_mw": int(b), "count": int(c)} for a, b, c in zip(edges[:-1], edges[1:], counts)]


def bias_by_horizon(per_horizon: dict[int, pd.DataFrame]) -> list[dict]:
    return [
        {"horizon_h": h, "bias_mw": float(s["error_mw"].mean()), "mae_mw": float(s["error_mw"].abs().mean()), "n": len(s)}
        for h, s in per_horizon.items()
    ]
