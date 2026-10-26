import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api, useApi, type Day, type Mode } from "../api";
import { gw, gwh, mw, settlementPeriod, signedMw, ukDateTime, ukTime } from "../format";
import { Async, axis, grid, legend, niceMw, Panel, StatStrip } from "./common";

interface Props {
  date: string;
  mode: Mode;
  demandGw: number;
  corrected: boolean;
}

interface Row {
  t: string;
  sp: number;
  actual: number;
  forecast?: number;
  corrected?: number;
  band?: [number, number];
}

/** Merge hourly forecasts and half-hourly actuals onto one half-hourly time axis. */
function chartRows(day: Day): Row[] {
  const byTime = new Map(day.points.map((p) => [p.start_time, p]));
  return day.actual_halfhourly.map((a) => {
    const p = byTime.get(a.start_time);
    return {
      t: ukTime(a.start_time),
      sp: settlementPeriod(a.start_time),
      actual: a.actual_mw,
      forecast: p?.forecast_mw,
      corrected: p?.forecast_corrected_mw,
      band: p && p.band_low_mw != null && p.band_high_mw != null ? [p.band_low_mw, p.band_high_mw] : undefined,
    };
  });
}

function DayTooltip({ active, payload, corrected }: { active?: boolean; payload?: { payload: Row }[]; corrected: boolean }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const fc = corrected ? r.corrected : r.forecast;
  const err = fc != null ? fc - r.actual : null;
  return (
    <div className="tip">
      <div className="tip-head">SP{r.sp} · {r.t}</div>
      <table>
        <tbody>
          <tr><td>Forecast{corrected ? " (corr.)" : ""}</td><td>{fc != null ? mw(fc) : "–"}</td></tr>
          <tr><td>Actual</td><td>{mw(r.actual)}</td></tr>
          <tr>
            <td>Error</td>
            <td className={err == null ? undefined : err > 0 ? "short" : "long"}>{err != null ? signedMw(err) : "–"}</td>
          </tr>
          {r.band && <tr><td>P10–P90 range</td><td>{gw(r.band[0])}–{gw(r.band[1])} GW</td></tr>}
        </tbody>
      </table>
    </div>
  );
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
  // If wind comes in at the low end of the band (P90 error), you need this much more.
  const margin = day.band_low_mwh != null ? forecastMwh - day.band_low_mwh : null;
  const miss = forecastMwh - day.actual_mwh;
  const first = day.points[0];
  const s = corrected ? day.summary_corrected : day.summary;
  const hours = day.points.map((p) => p.horizon_h);

  return (
    <div className="stack">
      <StatStrip
        stats={[
          { label: `Forecast wind${corrected ? " (bias-corrected)" : ""}`, value: gwh(forecastMwh), note: `${day.points.length} hours` },
          { label: "To buy beyond wind", value: gwh(demandMwh - forecastMwh), note: `At ${demandGw} GW assumed demand` },
          {
            label: "Safety margin (P90)",
            value: margin != null ? `+${gwh(margin)}` : "n/a",
            note: "Extra to buy if wind is as low as in the worst 10% of the past 7 days",
          },
          {
            label: "Actual wind",
            value: gwh(day.actual_mwh),
            note: <span className={miss > 0 ? "short" : "long"}>{miss > 0 ? "Short" : "Long"} {gwh(Math.abs(miss))}</span>,
          },
        ]}
      />

      <Panel
        title="Forecast at decision time vs actual"
        sub={
          mode.kind === "cutoff" ? (
            <>
              Forecast published {ukDateTime(first.publish_time)}, latest before the {ukDateTime(first.decision_time)} cutoff ·{" "}
              {Math.min(...hours)}–{Math.max(...hours)} h ahead · day MAE {mw(s.mae_mw)}, bias {signedMw(s.bias_mw)}
            </>
          ) : (
            <>Latest forecast published at least {mode.horizon} h before each hour · day MAE {mw(s.mae_mw)}, bias {signedMw(s.bias_mw)}</>
          )
        }
      >
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartRows(day)} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="t" {...axis} interval={5} />
              <YAxis {...axis} domain={niceMw(1000)} tickCount={5} tickFormatter={(v) => `${v / 1000}`} width={40}
                label={{ value: "GW", position: "top", offset: 6, fill: "var(--muted)", fontSize: 11 }} />
              <Tooltip content={<DayTooltip corrected={corrected} />} cursor={{ stroke: "var(--muted)", strokeWidth: 1 }} />
              <Legend {...legend} />
              <Area dataKey="band" name="P10–P90 range (past 7 days)" legendType="square" fill="var(--band)" fillOpacity={1} stroke="none" connectNulls isAnimationActive={false} />
              <Line dataKey="actual" name="Actual (FUELHH)" stroke="var(--actual)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
              <Line dataKey="forecast" name="Forecast (WINDFOR)" stroke="var(--fc)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
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
