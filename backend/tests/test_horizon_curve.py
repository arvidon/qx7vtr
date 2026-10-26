import pandas as pd

from app import service
from app.config import ACTUALS_FILE, FORECASTS_FILE


def test_every_horizon_scored_on_same_targets():
    actuals, forecasts = pd.read_parquet(ACTUALS_FILE), pd.read_parquet(FORECASTS_FILE)
    curve = service.horizon_curve(actuals, forecasts, horizons=[1, 6, 24, 48])
    sizes = {r["n"] for r in curve}
    assert len(sizes) == 1 and sizes.pop() > 0
