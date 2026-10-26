import { useEffect, useState } from "react";

import { api, useApi, type Meta, type Mode } from "./api";
import { Accuracy } from "./components/Accuracy";
import { Async } from "./components/common";
import { DecisionDay } from "./components/DecisionDay";
import { HowItWorks } from "./components/HowItWorks";
import { dateRange, dayLabel, ukDate } from "./format";

type Tab = "decide" | "accuracy" | "how";
const TABS: [Tab, string][] = [
  ["decide", "Decision day"],
  ["accuracy", "Forecast accuracy"],
  ["how", "How it works"],
];

/** Each tab has a linkable #hash so it can be bookmarked or shared. */
function tabFromHash(): Tab {
  const h = window.location.hash.slice(1);
  return TABS.some(([id]) => id === h) ? (h as Tab) : "decide";
}

export function App() {
  const meta = useApi(api.meta, "meta");
  return (
    <>
      <header className="topbar">
        <h1>Windbook</h1>
        <span className="src">
          Data: Elexon BMRS · FUELHH, WINDFOR{meta.data ? ` · snapshot ${ukDate(meta.data.snapshot_at)}` : ""}
        </span>
      </header>
      <main className="wrap">
        <Async q={meta} height={480}>{(m) => <Workspace meta={m} />}</Async>
      </main>
    </>
  );
}

function Workspace({ meta }: { meta: Meta }) {
  const days = dateRange(meta.first_delivery_day, meta.last_delivery_day);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `#${t}`);
  };
  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [date, setDate] = useState("2026-01-15");
  const [kind, setKind] = useState<Mode["kind"]>("cutoff");
  const [cutoffIdx, setCutoffIdx] = useState(Math.max(0, meta.cutoff_grid.indexOf(meta.default_cutoff)));
  const [horizon, setHorizon] = useState(24);
  const [demand, setDemand] = useState(32);
  const [corrected, setCorrected] = useState(false);

  const mode: Mode = kind === "cutoff" ? { kind, cutoff: meta.cutoff_grid[cutoffIdx] } : { kind, horizon };
  const openDay = (d: string) => {
    setDate(d);
    setTab("decide");
  };

  return (
    <>
      <nav className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="toolbar">
        {tab !== "accuracy" && (
          <label className="field">
            <span className="lbl">Delivery day</span>
            <select id="day" value={date} onChange={(e) => setDate(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>{dayLabel(d)}</option>
              ))}
            </select>
          </label>
        )}
        <div className="field">
          <span className="lbl">Forecast used</span>
          <div className="seg" role="group" aria-label="Forecast selection rule">
            <button className={kind === "cutoff" ? "on" : ""} onClick={() => setKind("cutoff")}>D‑1 cutoff</button>
            <button className={kind === "horizon" ? "on" : ""} onClick={() => setKind("horizon")}>Fixed horizon</button>
          </div>
        </div>
        {kind === "cutoff" ? (
          <label className="field">
            <span className="lbl">Cutoff on D‑1 (UK): <b>{meta.cutoff_grid[cutoffIdx]}</b></span>
            <input id="cutoff" type="range" min={0} max={meta.cutoff_grid.length - 1} value={cutoffIdx}
              onChange={(e) => setCutoffIdx(Number(e.target.value))} />
          </label>
        ) : (
          <label className="field">
            <span className="lbl">Hours ahead: <b>{horizon} h</b></span>
            <input id="horizon" type="range" min={meta.horizon_grid[0]} max={meta.horizon_grid.at(-1)} value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))} />
          </label>
        )}
        {tab === "decide" && (
          <label className="field">
            <span className="lbl">Demand, GW <span className="hint">(assumed)</span></span>
            <input id="demand" type="number" min={10} max={60} step={1} value={demand}
              onChange={(e) => setDemand(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        )}
        {tab !== "how" && (
          <label className="field inline">
            <input id="corrected" type="checkbox" checked={corrected} onChange={(e) => setCorrected(e.target.checked)} />
            <span className="lbl">Bias-corrected ({meta.bias_window_days}-day trailing)</span>
          </label>
        )}
      </div>

      {tab === "decide" && <DecisionDay date={date} mode={mode} demandGw={demand} corrected={corrected} />}
      {tab === "accuracy" && <Accuracy mode={mode} corrected={corrected} selectedDate={date} onOpenDay={openDay} />}
      {tab === "how" && <HowItWorks meta={meta} date={date} mode={mode} />}
    </>
  );
}
