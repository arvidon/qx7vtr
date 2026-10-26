from datetime import time

import pandas as pd
import pytest

from app.metrics import summary
from app.selection import select_forecasts


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


@pytest.fixture
def data():
    target = ts("2026-01-15T12:00")
    forecasts = pd.DataFrame({
        "publish_time": [ts("2026-01-13T18:00"), ts("2026-01-14T07:30"), ts("2026-01-14T11:30")],
        "start_time": [target] * 3,
        "generation_mw": [9000.0, 10000.0, 12000.0],
    })
    actuals = pd.DataFrame({"start_time": [target], "generation_mw": [11000.0]})
    return forecasts, actuals


def test_cutoff_uses_newest_forecast_before_cutoff(data):
    sel = select_forecasts(*data, cutoff=time(9, 20))
    assert sel.loc[0, "forecast_mw"] == 10000  # 07:30 vintage, not the 11:30 one
    assert sel.loc[0, "error_mw"] == -1000


def test_never_uses_forecast_published_after_cutoff(data):
    sel = select_forecasts(*data, cutoff=time(11, 0))
    assert sel.loc[0, "publish_time"] < ts("2026-01-14T11:00")


def test_horizon_mode(data):
    sel = select_forecasts(*data, horizon_hours=30)  # must be published by 14 Jan 06:00
    assert sel.loc[0, "forecast_mw"] == 9000
    assert sel.loc[0, "horizon_h"] == 42


def test_no_forecast_available_drops_target(data):
    sel = select_forecasts(*data, horizon_hours=60)
    assert sel.empty


def test_cutoff_is_uk_local_in_summer():
    # In BST, 09:20 UK on D-1 is 08:20 UTC: an 08:30 UTC forecast must be excluded.
    target = ts("2026-07-15T12:00")
    forecasts = pd.DataFrame({
        "publish_time": [ts("2026-07-14T07:30"), ts("2026-07-14T08:30")],
        "start_time": [target] * 2,
        "generation_mw": [5000.0, 6000.0],
    })
    actuals = pd.DataFrame({"start_time": [target], "generation_mw": [5500.0]})
    sel = select_forecasts(forecasts, actuals, cutoff=time(9, 20))
    assert sel.loc[0, "forecast_mw"] == 5000


def test_requires_exactly_one_mode(data):
    with pytest.raises(ValueError):
        select_forecasts(*data)


def test_summary_metrics():
    sel = pd.DataFrame({
        "error_mw": [100.0, -300.0], "actual_mw": [1000.0, 1000.0], "horizon_h": [20.0, 30.0],
    })
    s = summary(sel)
    assert s["mae_mw"] == 200 and s["bias_mw"] == -100 and s["rmse_mw"] == pytest.approx(223.607, 1e-3)


def test_forecast_older_than_max_age_is_never_selected(data):
    # Decision 14 Jan 09:20; the only vintage was published 13 Jan 18:00, so it is 15h 20m old.
    forecasts, actuals = data
    old_only = forecasts.iloc[[0]]
    assert len(select_forecasts(old_only, actuals, cutoff=time(9, 20), max_age_h=48)) == 1
    assert select_forecasts(old_only, actuals, cutoff=time(9, 20), max_age_h=10).empty


def test_bias_correction_uses_only_published_history():
    from app.selection import add_bias_correction

    t = pd.date_range("2026-01-10", periods=72, freq="h", tz="UTC")
    sel = pd.DataFrame({
        "start_time": t,
        "decision_time": t - pd.Timedelta(hours=24),
        "forecast_mw": 1000.0,
        "actual_mw": 0.0,
    })
    sel["error_mw"] = sel["forecast_mw"] - sel["actual_mw"]
    # Make one late error huge: it must not influence anything decided before it was known.
    sel.loc[71, "error_mw"] = 1e9
    out = add_bias_correction(sel)
    # Hour 24 is decided at hour 0, before the first actual (published at 00:30) exists.
    assert not out.loc[:24, "has_bias_history"].any()
    assert (out.loc[25:, "bias_est_mw"] == 1000).all()  # only the steady 1000 MW errors were known
    assert out.loc[25:, "error_corrected_mw"].abs().max() == 0
