import type { ReactNode } from "react";

import type { Loaded } from "../api";

export interface Stat {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}

/** One horizontal strip of label-over-value stats separated by thin dividers. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="stats">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <div className="lbl">{s.label}</div>
          <div className="val">{s.value}</div>
          {s.note && <div className="note">{s.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      {children}
    </section>
  );
}

/** Renders loading / error states, then children once data is in. Keeps stale data visible while refetching. */
export function Async<T>({ q, children, height = 240 }: { q: Loaded<T>; children: (d: T) => ReactNode; height?: number }) {
  if (q.error && !q.data)
    return (
      <div className="state error" role="alert">
        <span>Could not load data ({q.error}).</span>
        <button onClick={q.retry}>Retry</button>
      </div>
    );
  if (!q.data) return <div className="state" style={{ minHeight: height }} aria-busy="true">Loading…</div>;
  return <div className={q.loading ? "refreshing" : undefined}>{children(q.data)}</div>;
}

// Shared chart styling: colours come from CSS tokens so both themes work.
export const axis = {
  stroke: "var(--line)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
} as const;
export const grid = { stroke: "var(--grid)", vertical: false } as const;
export const tooltip = {
  contentStyle: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 0, fontSize: 12 },
  labelStyle: { color: "var(--fg)", fontWeight: 600 },
  itemStyle: { color: "var(--fg)" },
  cursor: { stroke: "var(--muted)", strokeWidth: 1 },
} as const;
export const legend = { wrapperStyle: { fontSize: 12 }, iconSize: 10, formatter: (v: string) => legendText(v) } as const;

/** Y domain in MW whose max is a multiple of 4 x `stepMw`, so 5 ticks land on round GW values. */
export const niceMw = (stepMw = 500) =>
  [0, (max: number) => Math.max(4 * stepMw, Math.ceil(max / (4 * stepMw)) * 4 * stepMw)] as [number, (m: number) => number];

/** Legend labels in the muted text colour, so a pale series (the band) stays readable. */
export const legendText = (v: string) => <span style={{ color: "var(--muted)" }}>{v}</span>;
