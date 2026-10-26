import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, useApi, type Day, type Mode } from "../api";
import { gw, gwh, mw, signedMw, ukDateTime, ukTime } from "../format";
import { Async, axis, grid, Kpi, Panel, tooltip } from "./common";

interface Props {
  date: string;
  mode: Mode;
  demandGw: number;
  corrected: boolean;
}

/** Merge hourly forecasts and half-hourly actuals onto one half-hourly time axis. */
function chartRows(day: Day) {
  const byTime = new Map(day.points.map((p) => [p.start_time, p]));
  return day.actual_halfhourly.map((a) => {
    const p = byTime.get(a.start_time);
    return {
      t: ukTime(a.start_time),
      actual: a.actual_mw,
      forecast: p?.forecast_mw,
      corrected: p?.forecast_corrected_mw,
      band: p && p.band_low_mw != null && p.band_high_mw != null ? [p.band_low_mw, p.band_high_mw] : undefined,
    };
  });
}

export function DecisionDay({ date, mode, demandGw, corrected }: Props) {
  const q = useApi(() => api.day(date, mode), `${date}|${JSON.stringify(mode)}`);
  return (
    <Async q={q} height={420}>
      {(d) => <DayView day={d} demandGw={demandGw} corrected={corrected} mode={mode} />}
    </Async>
  );
}

function DayView({ day, demandGw, corrected, mode }: { day: Day; demandGw: number; corrected: boolean; mode: Mode }) {
  const forecastMwh = corrected ? day.forecast_corrected_mwh : day.forecast_mwh;
  const demandMwh = demandGw * 1000 * day.points.length; // hourly points
  const toBuy = demandMwh - forecastMwh;
  // The band is a range for actual wind; if wind lands at its low end you need this much more.
  const extraLow = day.band_low_mwh != null ? forecastMwh - day.band_low_mwh : null;
  const extraHigh = day.band_high_mwh != null ? day.band_high_mwh - forecastMwh : null;
  const miss = forecastMwh - day.actual_mwh;
  const first = day.points[0];
  const s = corrected ? day.summary_corrected : day.summary;

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi value={gwh(forecastMwh)} label={`Forecast wind energy${corrected ? " (bias-corrected)" : ""}`} />
        <Kpi value={gwh(toBuy)} label={`To buy beyond wind, at the assumed ${demandGw} GW demand`} />
        <Kpi
          value={extraLow != null && extraHigh != null ? `+${gw(extraLow)} / −${gw(extraHigh)} GWh` : "n/a"}
          label="Extra buy if wind lands at P10 / could buy less at P90"
        />
        <Kpi
          value={gwh(day.actual_mwh)}
          label={<>Actual wind · forecast was {miss > 0 ? "over" : "under"} by {gwh(Math.abs(miss))}</>}
          extra={<span className={`pill ${miss > 0 ? "bad" : "good"}`}>{miss > 0 ? "short" : "long"}</span>}
        />
      </div>

      <Panel
        title="Wind forecast available at decision time vs what actually happened"
        sub={
          mode.kind === "cutoff" ? (
            <>
              Newest forecast published by {ukDateTime(first.decision_time)} (used: {ukDateTime(first.publish_time)}).
              Hours ahead: {Math.min(...day.points.map((p) => p.horizon_h))}–{Math.max(...day.points.map((p) => p.horizon_h))}.
              Day MAE {mw(s.mae_mw)}, bias {signedMw(s.bias_mw)}.
            </>
          ) : (
            <>
              Newest forecast published at least {mode.horizon} h before each hour. Day MAE {mw(s.mae_mw)}, bias{" "}
              {signedMw(s.bias_mw)}.
            </>
          )
        }
      >
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartRows(day)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="t" {...axis} interval={5} />
              <YAxis {...axis} tickFormatter={(v) => `${gw(v)} GW`} width={64} />
              <Tooltip {...tooltip} formatter={(v) => (Array.isArray(v) ? `${mw(Number(v[0]))} – ${mw(Number(v[1]))}` : mw(Number(v)))} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "var(--muted)" }}>{v}</span>} />
              <Area dataKey="band" name="P10–P90 range (past 7 days of errors)" legendType="square" fill="var(--band)" stroke="none" connectNulls isAnimationActive={false} />
              <Line dataKey="actual" name="Actual (FUELHH)" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="forecast" name="Forecast used" stroke="var(--fc)" strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} />
              {corrected && (
                <Line dataKey="corrected" name="Bias-corrected forecast" stroke="var(--fc)" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
