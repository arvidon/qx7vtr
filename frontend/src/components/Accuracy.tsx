import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { api, useApi, type HorizonPoint, type Metrics, type Mode } from "../api";
import { dayLabel, gw, mw, signedMw } from "../format";
import { Async, axis, grid, Kpi, Panel, tooltip } from "./common";

interface Props {
  mode: Mode;
  corrected: boolean;
  selectedDate: string;
  onOpenDay: (date: string) => void;
}

export function Accuracy({ mode, corrected, selectedDate, onOpenDay }: Props) {
  const m = useApi(() => api.metrics(mode), JSON.stringify(mode));
  const curve = useApi(api.horizonCurve, "curve");
  return (
    <div className="stack">
      <Async q={m} height={90}>{(d) => <Kpis m={d} corrected={corrected} />}</Async>
      <div className="grid2">
        <Panel title="Error grows with forecast horizon" sub="MAE in GW by hours between publication and delivery, all horizons scored on the same hours">
          <Async q={curve}>
            {(c) => <HorizonChart curve={c} marker={mode.kind === "horizon" ? mode.horizon : m.data?.summary.mean_horizon_h} />}
          </Async>
        </Panel>
        <Panel title="Error by hour of day" sub="MAE (bars) and bias (line) in GW, UK time">
          <Async q={m}>{(d) => <HourChart rows={corrected ? d.by_hour_corrected : d.by_hour} />}</Async>
        </Panel>
        <Panel title="Error distribution" sub="Forecast − actual in GW, count of hours. Right of zero: wind over-forecast, you end up short.">
          <Async q={m}>{(d) => <Histogram rows={corrected ? d.histogram_corrected : d.histogram} />}</Async>
        </Panel>
        <Panel title="Daily MAE" sub="MAE in GW. Click a day to open it in Decision day.">
          <Async q={m}>
            {(d) => <DailyChart rows={corrected ? d.by_day_corrected : d.by_day} selected={selectedDate} onOpen={onOpenDay} />}
          </Async>
        </Panel>
      </div>
    </div>
  );
}

function Kpis({ m, corrected }: { m: Metrics; corrected: boolean }) {
  const s = corrected ? m.summary_corrected : m.summary;
  const other = corrected ? m.summary : m.summary_corrected;
  const tag = corrected ? "raw" : "corrected";
  return (
    <div className="kpis">
      <Kpi value={mw(s.mae_mw)} label={<>MAE · typical miss ({s.nmae_pct.toFixed(0)}% of mean output) · {tag} {mw(other.mae_mw)}</>} />
      <Kpi value={mw(s.rmse_mw)} label={<>RMSE · weights big misses · {tag} {mw(other.rmse_mw)}</>} />
      <Kpi
        value={signedMw(s.bias_mw)}
        label={<>Bias · + means over-forecast · {tag} {signedMw(other.bias_mw)}</>}
        extra={Math.abs(s.bias_mw) > 500 ? <span className="pill warn">systematic</span> : <span className="pill good">small</span>}
      />
      <Kpi value={`${gw(s.p10_mw)} … ${gw(s.p90_mw)} GW`} label={<>P10–P90 error over {s.n} hours</>} />
    </div>
  );
}

function HorizonChart({ curve, marker }: { curve: HorizonPoint[]; marker?: number }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="horizon_h" {...axis} type="number" domain={[1, 48]} ticks={[1, 12, 24, 36, 48]} tickFormatter={(h) => `${h}h`} />
          <YAxis {...axis} width={56} tickFormatter={(v) => gw(v)} domain={[0, "auto"]} />
          <Tooltip {...tooltip} labelFormatter={(h) => `${h} h ahead`} formatter={(v) => mw(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {marker != null && <ReferenceLine x={Math.round(marker)} stroke="var(--fg)" strokeDasharray="3 3" label={{ value: "your setting", fill: "var(--fg)", fontSize: 11, position: "insideTopRight" }} />}
          <Line dataKey="mae_mw" name="MAE raw (GW)" stroke="var(--fc)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="mae_corrected_mw" name="MAE bias-corrected (GW)" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HourChart({ rows }: { rows: Metrics["by_hour"] }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="hour" {...axis} ticks={[0, 6, 12, 18, 23]} tickFormatter={(h) => `${h}:00`} />
          <YAxis {...axis} width={56} tickFormatter={(v) => gw(v)} />
          <Tooltip {...tooltip} labelFormatter={(h) => `${h}:00`} formatter={(v) => mw(Number(v))} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <Bar dataKey="mae_mw" name="MAE" fill="var(--fc)" fillOpacity={0.75} isAnimationActive={false} />
          <Line dataKey="bias_mw" name="Bias" stroke="var(--actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function Histogram({ rows }: { rows: Metrics["histogram"] }) {
  const data = rows.map((r) => ({ ...r, mid: (r.from_mw + r.to_mw) / 2 }));
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={1}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mid" {...axis} interval={3} tickFormatter={(v) => `${gw(v)}`} />
          <YAxis {...axis} width={40} allowDecimals={false} />
          <Tooltip {...tooltip} labelFormatter={(v) => `${gw(Number(v) - 250)} to ${gw(Number(v) + 250)} GW`} />
          <Bar dataKey="count" name="Hours" isAnimationActive={false}>
            {data.map((r) => (
              <Cell key={r.mid} fill={r.mid < 0 ? "var(--actual)" : "var(--fc)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyChart({ rows, selected, onOpen }: { rows: Metrics["by_day"]; selected: string; onOpen: (d: string) => void }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="date" {...axis} tickFormatter={(d) => dayLabel(d).split(" ").slice(1).join(" ")} interval={6} />
          <YAxis {...axis} width={56} tickFormatter={(v) => gw(v)} />
          <Tooltip {...tooltip} labelFormatter={(d) => dayLabel(String(d))} formatter={(v) => mw(Number(v))} />
          <Bar dataKey="mae_mw" name="MAE" cursor="pointer" isAnimationActive={false} onClick={(d) => onOpen((d as { date: string }).date)}>
            {rows.map((r) => (
              <Cell key={r.date} fill={r.date === selected ? "var(--fg)" : "var(--fc)"} fillOpacity={r.date === selected ? 1 : 0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
