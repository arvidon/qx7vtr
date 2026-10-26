"""Ingest pipeline: pull January 2026 data from Elexon and save Parquet snapshots.

Run with:  python -m app.pipeline
"""
from datetime import timedelta

import httpx

from .config import (
    ACTUALS_FILE, DATA_DIR, DATA_END, DATA_START, FORECAST_PUBLISH_FROM,
    FORECAST_PUBLISH_TO, FORECASTS_FILE,
)
from .elexon import fetch_actuals, fetch_forecasts


def run() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60) as client:
        # FUELHH is published at the end of each half-hour, so pad by one hour.
        actuals = fetch_actuals(client, DATA_START, DATA_END + timedelta(hours=1))
        actuals = actuals[(actuals.start_time >= DATA_START) & (actuals.start_time < DATA_END)]

        forecasts = fetch_forecasts(client, FORECAST_PUBLISH_FROM, FORECAST_PUBLISH_TO)
        forecasts = forecasts[(forecasts.start_time >= DATA_START) & (forecasts.start_time < DATA_END)]

    actuals.to_parquet(ACTUALS_FILE, index=False)
    forecasts.to_parquet(FORECASTS_FILE, index=False)
    print(f"actuals:   {len(actuals):>6} rows  {actuals.start_time.min()} .. {actuals.start_time.max()}")
    print(f"forecasts: {len(forecasts):>6} rows  {forecasts.publish_time.nunique()} vintages, "
          f"published {forecasts.publish_time.min()} .. {forecasts.publish_time.max()}")


if __name__ == "__main__":
    run()
