"""FastAPI app. Serves precomputed JSON by default; set WINDBOOK_LIVE=1 to compute with pandas."""
import os
from datetime import UTC, date, datetime
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .modes import ModeError, parse_mode
from .store import LiveStore, NotFound, StaticStore

app = FastAPI(title="Windbook API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@lru_cache(maxsize=1)
def store():
    return LiveStore() if os.getenv("WINDBOOK_LIVE") == "1" else StaticStore()


CutoffQ = Query(None, description="Decision time on D-1, UK local, HH:MM. Default 09:20.")
HorizonQ = Query(None, ge=1, le=48, description="Use the newest forecast published at least this many hours ahead.")


def _call(fn, *args):
    try:
        return fn(*args)
    except ModeError as e:
        raise HTTPException(422, str(e)) from e
    except NotFound as e:
        raise HTTPException(404, str(e)) from e


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "live" if os.getenv("WINDBOOK_LIVE") == "1" else "precomputed"}


@app.get("/api/meta")
def meta():
    return _call(store().meta)


@app.get("/api/day")
def day(date_: date = Query(..., alias="date"), cutoff: str | None = CutoffQ, horizon: int | None = HorizonQ):
    """Forecast used vs actual for one UK delivery day, with trailing error band and bias correction."""
    return _call(lambda: store().day(date_.isoformat(), *parse_mode(cutoff, horizon)))


@app.get("/api/metrics")
def accuracy(cutoff: str | None = CutoffQ, horizon: int | None = HorizonQ):
    return _call(lambda: store().metrics(*parse_mode(cutoff, horizon)))


@app.get("/api/horizon-curve")
def horizon_curve():
    """MAE by horizon on a common set of target hours: the price of deciding earlier."""
    return _call(store().horizon_curve)


@app.get("/api/vintages")
def vintages(target: datetime):
    """Every forecast published for one target hour, oldest first."""
    t = target if target.tzinfo else target.replace(tzinfo=UTC)
    return _call(store().vintages, t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"))
