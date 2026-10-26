// Typed client for the Windbook API. Every number shown in the UI comes from here.
import { useCallback, useEffect, useState } from "react";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export type Mode = { kind: "cutoff"; cutoff: string } | { kind: "horizon"; horizon: number };

export const modeQuery = (m: Mode) =>
  m.kind === "cutoff" ? `cutoff=${m.cutoff}` : `horizon=${m.horizon}`;

export interface Summary {
  n: number;
  mae_mw: number;
  rmse_mw: number;
  bias_mw: number;
  p10_mw: number;
  p50_mw: number;
  p90_mw: number;
  max_abs_mw: number;
  nmae_pct: number;
  mean_horizon_h: number;
}

export interface Meta {
  first_delivery_day: string;
  last_delivery_day: string;
  default_cutoff: string;
  cutoff_grid: string[];
  horizon_grid: number[];
  max_forecast_age_h: number;
  bias_window_days: number;
  forecast_vintages: number;
}

export interface DayPoint {
  start_time: string;
  decision_time: string;
  publish_time: string;
  horizon_h: number;
  forecast_mw: number;
  forecast_corrected_mw: number;
  bias_est_mw: number;
  band_low_mw: number | null;
  band_high_mw: number | null;
  actual_mw: number;
}

export interface Day {
  date: string;
  points: DayPoint[];
  actual_halfhourly: { start_time: string; actual_mw: number }[];
  summary: Summary;
  summary_corrected: Summary;
  forecast_mwh: number;
  forecast_corrected_mwh: number;
  band_low_mwh: number | null;
  band_high_mwh: number | null;
  actual_mwh: number;
}

export interface Metrics {
  summary: Summary;
  summary_corrected: Summary;
  by_hour: { hour: number; mae_mw: number; bias_mw: number }[];
  by_hour_corrected: { hour: number; mae_mw: number; bias_mw: number }[];
  by_day: { date: string; mae_mw: number; bias_mw: number }[];
  by_day_corrected: { date: string; mae_mw: number; bias_mw: number }[];
  histogram: { from_mw: number; to_mw: number; count: number }[];
  histogram_corrected: { from_mw: number; to_mw: number; count: number }[];
}

export interface HorizonPoint {
  horizon_h: number;
  n: number;
  mae_mw: number;
  rmse_mw: number;
  bias_mw: number;
  mae_corrected_mw: number;
}

export interface Vintages {
  target: string;
  actual_mw: number | null;
  vintages: { publish_time: string; horizon_h: number; forecast_mw: number }[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* body was not JSON */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  day: (date: string, m: Mode) => get<Day>(`/api/day?date=${date}&${modeQuery(m)}`),
  metrics: (m: Mode) => get<Metrics>(`/api/metrics?${modeQuery(m)}`),
  horizonCurve: () => get<HorizonPoint[]>("/api/horizon-curve"),
  vintages: (target: string) => get<Vintages>(`/api/vintages?target=${encodeURIComponent(target)}`),
};

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

/** Fetch on mount and whenever `key` changes; ignores responses that arrive out of order. */
export function useApi<T>(fetcher: () => Promise<T>, key: string): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
