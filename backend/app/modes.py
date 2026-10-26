"""How a request names the forecast-selection rule. Pure Python: imported by the deployed API."""
from datetime import time

from .config import DEFAULT_CUTOFF


class ModeError(ValueError):
    pass


def parse_mode(cutoff: str | None, horizon: float | None) -> tuple[time | None, int | None]:
    if horizon is not None:
        if horizon != int(horizon):
            raise ModeError("horizon must be a whole number of hours")
        return None, int(horizon)
    try:
        return (time.fromisoformat(cutoff) if cutoff else DEFAULT_CUTOFF), None
    except ValueError:
        raise ModeError("cutoff must look like HH:MM, e.g. 09:20") from None


def mode_key(cutoff: time | None, horizon: int | None) -> str:
    return f"cutoff-{cutoff.strftime('%H%M')}" if cutoff is not None else f"horizon-{horizon}"
