import type { ReactNode } from "react";

import type { Loaded } from "../api";

export function Kpi({ value, label, extra }: { value: ReactNode; label: ReactNode; extra?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-v">
        {value} {extra}
      </div>
      <div className="kpi-l">{label}</div>
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
        <span>Couldn't load data ({q.error}).</span>
        <button onClick={q.retry}>Try again</button>
      </div>
    );
  if (!q.data) return <div className="state skeleton" style={{ height }} aria-busy="true">Loading…</div>;
  return <div className={q.loading ? "refreshing" : undefined}>{children(q.data)}</div>;
}

// Shared chart styling: colours come from CSS tokens so both themes work.
export const axis = { stroke: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)", tickLine: false } as const;
export const grid = { stroke: "var(--line)", vertical: false } as const;
export const tooltip = {
  contentStyle: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "var(--fg)" },
} as const;
