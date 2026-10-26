"""Write every API payload for the cutoff/horizon grids to JSON.

Run with:  python -m app.precompute   (after app.pipeline)
The deployed API reads only these files and never imports pandas.
"""
import json

import pandas as pd

from . import service
from .config import ACTUALS_FILE, CUTOFF_GRID, FORECASTS_FILE, HORIZON_GRID, PRECOMPUTED_DIR
from .modes import mode_key


def _dump(name: str, obj) -> None:
    (PRECOMPUTED_DIR / name).write_text(json.dumps(obj, separators=(",", ":"), default=str))


def run() -> None:
    actuals, forecasts = pd.read_parquet(ACTUALS_FILE), pd.read_parquet(FORECASTS_FILE)
    PRECOMPUTED_DIR.mkdir(parents=True, exist_ok=True)
    modes = [(c, None) for c in CUTOFF_GRID] + [(None, h) for h in HORIZON_GRID]
    for cutoff, horizon in modes:
        sel = service.build_selection(actuals, forecasts, cutoff, horizon)
        _dump(f"{mode_key(cutoff, horizon)}.json", {
            "metrics": service.metrics_payload(sel),
            "days": service.day_payloads(sel, actuals),
        })
    _dump("horizon-curve.json", service.horizon_curve(actuals, forecasts))
    _dump("vintages.json", service.vintages(actuals, forecasts))
    _dump("meta.json", service.meta(actuals, forecasts))
    size = sum(p.stat().st_size for p in PRECOMPUTED_DIR.iterdir())
    print(f"wrote {len(modes)} modes + curve, vintages, meta: {size / 1e6:.1f} MB")


if __name__ == "__main__":
    run()
