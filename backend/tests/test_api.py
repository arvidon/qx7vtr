"""API tests over the precomputed store, via httpx's ASGI transport (no starlette TestClient)."""
import asyncio
import subprocess
import sys

import httpx

from app.main import app


def get(path: str) -> httpx.Response:
    async def go():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            return await c.get(path)
    return asyncio.run(go())


def test_health_and_meta():
    assert get("/api/health").json()["mode"] == "precomputed"
    assert get("/api/meta").json()["default_cutoff"] == "09:20"


def test_day_and_metrics_default_cutoff():
    d = get("/api/day?date=2026-01-15").json()
    assert len(d["points"]) == 24 and len(d["actual_halfhourly"]) == 48
    assert all(p["publish_time"] <= p["decision_time"] for p in d["points"])
    assert get("/api/metrics").json()["summary"]["n"] == 744


def test_errors():
    assert get("/api/day?date=2026-03-01").status_code == 404
    assert get("/api/metrics?cutoff=bad").status_code == 422
    assert get("/api/metrics?cutoff=09:25").status_code == 404  # off the precomputed grid
    assert get("/api/horizon-curve").status_code == 200


def test_deployed_path_does_not_import_pandas():
    code = "import sys, app.main; app.main.store().meta(); assert 'pandas' not in sys.modules"
    subprocess.run([sys.executable, "-c", code], check=True)
