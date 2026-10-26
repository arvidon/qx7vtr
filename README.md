# Windbook

Windbook helps a GB day-ahead power desk see the national wind forecast that was available at bid time and how accurate that forecast has been. It covers every purchase decision made in January 2026, using Elexon BMRS data (FUELHH wind actuals and WINDFOR forecasts).

**Live app:** https://qx7vtr.vercel.app

## What it shows

| Tab | What it shows |
|---|---|
| Decision day | For one delivery day: the forecast that was available at the D‑1 cutoff, half-hourly actuals, a P10–P90 band from the past 7 days of errors, energy to buy beyond wind at an assumed demand, and a P90 safety margin. Optional bias-corrected forecast. |
| Forecast accuracy | MAE, RMSE, bias and the P10–P90 error over January; error against forecast horizon; error by hour of day; error histogram; daily MAE (click a bar to open that day). |
| How it works | The no-look-ahead rule shown on a real example, the architecture, and a definition of each metric. |

## Repository layout

```
.
├── backend/                     Python: data pipeline, analysis, API
│   ├── app/
│   │   ├── config.py            Data window, cutoff default, max forecast age, file paths
│   │   ├── elexon.py            Client for the FUELHH and WINDFOR /stream endpoints
│   │   ├── pipeline.py          Fetches January data and writes the Parquet snapshot
│   │   ├── selection.py         Picks the forecast available at each decision (no look-ahead); bias correction
│   │   ├── metrics.py           MAE, RMSE, bias, quantiles, breakdowns by hour/day, histogram
│   │   ├── service.py           Builds every API payload from the snapshot (pandas)
│   │   ├── precompute.py        Writes all payloads for the cutoff/horizon grid to JSON
│   │   ├── modes.py             Parses the cutoff / horizon query parameters (no pandas)
│   │   ├── store.py             StaticStore (reads JSON) and LiveStore (computes with pandas)
│   │   └── main.py              FastAPI routes under /api
│   ├── data/
│   │   ├── actuals.parquet      FUELHH WIND, half-hourly, 26 Dec 2025 – 1 Feb 2026
│   │   ├── forecasts.parquet    Every WINDFOR forecast published in the window
│   │   └── precomputed/         JSON served by the deployed API
│   ├── tests/                   pytest: selection rules, bias correction, horizon sample, API
│   ├── requirements.txt         Deployed API only (FastAPI)
│   ├── requirements-live.txt    Full stack: pandas, pyarrow, httpx, uvicorn
│   ├── requirements-dev.txt     Full stack plus pytest and ruff
│   ├── ruff.toml
│   └── Dockerfile               API image (live pandas mode)
├── frontend/                    React + Vite + TypeScript + Recharts
│   ├── src/
│   │   ├── App.tsx              Top bar, tabs, toolbar and shared state
│   │   ├── api.ts               Typed API client and useApi hook
│   │   ├── format.ts            Units, UK time and settlement period helpers
│   │   ├── styles.css           Theme tokens (light and dark) and layout
│   │   └── components/          DecisionDay, Accuracy, HowItWorks, common (stat strip, panels, loading/error states)
│   ├── nginx.conf               Serves the build and proxies /api to the backend container
│   ├── Dockerfile               Builds the app, then serves it with nginx
│   └── .env.example             VITE_API_BASE_URL
├── docker-compose.yml           Runs the API and the web app together
├── vercel.json                  Vercel Services: frontend (static) + backend (FastAPI)
└── .github/workflows/ci.yml     ruff, pytest, precompute check, frontend build
```

## Running it

### With Docker

```bash
docker compose up --build
```

Open http://localhost:8080. The API runs in live mode: it computes each response from the Parquet snapshot with pandas.

### Without Docker

Backend (Python 3.12 or later):

```bash
python -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cd backend
WINDBOOK_LIVE=1 ../.venv/bin/uvicorn app.main:app --reload   # live mode
# or omit WINDBOOK_LIVE to serve the precomputed JSON, as production does
```

Frontend (Node 22 or later), in a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` to `localhost:8000`. To call an API on another host, set `VITE_API_BASE_URL` (see `frontend/.env.example`).

### Tests and lint

```bash
cd backend
../.venv/bin/ruff check .
../.venv/bin/python -m pytest -q
```

## Refreshing the data

```bash
cd backend
../.venv/bin/python -m app.pipeline     # fetch from Elexon and write data/*.parquet (about 20 s)
../.venv/bin/python -m app.precompute   # rebuild data/precomputed/*.json (about 5 s)
```

Commit both and push. CI fails if the precomputed JSON doesn't match the snapshot.

## Key design decisions

**No look-ahead.** For each hour of delivery day D, the app uses the latest WINDFOR forecast published at or before the decision time, never one published after it.
- **Cutoff mode:** the decision time is a cutoff on D‑1 in UK local time, so it stays correct across daylight-saving changes.
- **Horizon mode:** the decision time is the delivery hour minus N hours.
- **Stale forecasts:** a forecast that was already more than 48 h old at the decision time is dropped, not used. That limit is `MAX_FORECAST_AGE_H` in `config.py`.
- **Tests:** the test suite covers each of these rules.

**Default cutoff of 09:20 UK on D‑1.** This is an assumed gate closure for the GB day-ahead auction. The toolbar lets you choose any cutoff from 06:00 to 12:00 in 20-minute steps, or a fixed horizon from 1 to 48 h.

**Hourly scoring.**
- WINDFOR forecasts are hourly; FUELHH actuals are half-hourly.
- Each forecast hour is scored against the FUELHH settlement period that starts at the same time.
- The day chart shows all 48 settlement periods.
- Daily energy figures: forecast energy is the sum of the 24 hourly values. Actual energy uses all 48 half-hours.

**Bias.**
- At the 09:20 cutoff, the forecast is on average 1,746 MW above the actual.
- The bias is roughly the same at every horizon: +1,344 MW at 1 h, +1,800 MW at 48 h. That means it is mostly a difference in what the two datasets measure, not forecasting skill.
- It is largest at high wind output, which is consistent with curtailment showing up in the actuals but not in the forecast. Elexon's documentation doesn't confirm this.
- **Bias-corrected view:** subtracts the mean error of the previous 7 days. Only actuals published before each decision count, so the correction is also free of look-ahead.
- At the 09:20 cutoff, the correction reduces MAE from 2,022 MW to 1,552 MW.
- The P10–P90 band on the day chart uses the same trailing 7-day window.

**Fair horizon curve.** Every horizon from 1 to 48 h is scored on the same 589 delivery hours: those that have a forecast at every horizon. Comparing horizons is then not distorted by different samples.

**Precomputed deployment.** The deployed API doesn't use pandas or pyarrow.
- `precompute.py` writes every response for the cutoff and horizon grid to JSON (about 23 MB).
- `StaticStore` serves those files. A test checks that pandas is never imported on that path.
- The deploy bundle is about 38 MB.
- `WINDBOOK_LIVE=1` switches to `LiveStore`, which computes the same responses on request (used by Docker and local development).
- Both stores get their responses from `service.py`, so they return identical results.

## Deployment

The app is deployed on Vercel using Services (`vercel.json`):
- **frontend:** static Vite build, with every non-API path sent to `index.html`.
- **backend:** the FastAPI app, `app.main:app`.

Requests to `/api/*` go to the backend and everything else to the frontend. The GitHub repo is connected to the Vercel project, so every push to `main` redeploys production.

## Use of AI tools

This project was built with help from AI tools, mainly Claude (Anthropic) through Claude Code. It was used to research the Elexon datasets, write and refactor the backend, frontend, tests, Docker and Vercel configuration, and draft this README. Every number in the app and in this README was produced by the code against the live Elexon data and checked by running it.
