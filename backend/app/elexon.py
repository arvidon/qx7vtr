"""Thin client for the two Elexon BMRS stream endpoints we use."""
from datetime import UTC, datetime, timedelta

import httpx
import pandas as pd

from .config import ELEXON_BASE

CHUNK = timedelta(days=7)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _stream(client: httpx.Client, dataset: str, start: datetime, end: datetime, **params) -> list[dict]:
    """Fetch a dataset by publish time, in weekly chunks to keep responses small."""
    rows: list[dict] = []
    cursor = start
    while cursor < end:
        upper = min(cursor + CHUNK, end)
        resp = client.get(
            f"{ELEXON_BASE}/{dataset}/stream",
            params={"publishDateTimeFrom": _iso(cursor), "publishDateTimeTo": _iso(upper), **params},
        )
        resp.raise_for_status()
        rows.extend(resp.json())
        cursor = upper
    return rows


def fetch_actuals(client: httpx.Client, start: datetime, end: datetime) -> pd.DataFrame:
    """Half-hourly national wind generation (FUELHH, fuelType=WIND)."""
    rows = _stream(client, "FUELHH", start, end, fuelType="WIND")
    df = pd.DataFrame(rows)
    df = df[df["fuelType"] == "WIND"]  # defensive: the filter is server side too
    out = pd.DataFrame({
        "start_time": pd.to_datetime(df["startTime"], utc=True),
        "generation_mw": df["generation"].astype(float),
    })
    # A period can be republished; keep the last value per start time.
    return out.drop_duplicates("start_time", keep="last").sort_values("start_time").reset_index(drop=True)


def fetch_forecasts(client: httpx.Client, start: datetime, end: datetime) -> pd.DataFrame:
    """Every published wind forecast vintage (WINDFOR)."""
    df = pd.DataFrame(_stream(client, "WINDFOR", start, end))
    out = pd.DataFrame({
        "publish_time": pd.to_datetime(df["publishTime"], utc=True),
        "start_time": pd.to_datetime(df["startTime"], utc=True),
        "generation_mw": df["generation"].astype(float),
    })
    return (
        out.drop_duplicates(["publish_time", "start_time"], keep="last")
        .sort_values(["start_time", "publish_time"])
        .reset_index(drop=True)
    )
