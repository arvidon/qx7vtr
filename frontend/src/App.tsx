import { useEffect, useState } from "react";

import { api, useApi, type Meta, type Mode } from "./api";
import { Accuracy } from "./components/Accuracy";
import { Async } from "./components/common";
import { DecisionDay } from "./components/DecisionDay";
import { HowItWorks } from "./components/HowItWorks";
import { dateRange, dayLabel } from "./format";

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
    <div className="wrap">
      <header className="top">
        <h1>Windbook</h1>
        <span className="tag">GB day-ahead · national wind · January 2026 decisions</span>
      </header>
      <Async q={meta} height={480}>{(m) => <Workspace meta={m} />}</Async>
      <footer className="foot">Data: Elexon BMRS FUELHH (WIND) and WINDFOR.</footer>
    </div>
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

      <div className="controls">
        {tab !== "accuracy" && (
          <label className="ctl">
            <span>Delivery day</span>
            <select id="day" value={date} onChange={(e) => setDate(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>{dayLabel(d)}</option>
              ))}
            </select>
          </label>
        )}
        <div className="ctl">
          <span>Forecast chosen by</span>
          <div className="seg" role="group" aria-label="Forecast selection rule">
            <button className={kind === "cutoff" ? "on" : ""} onClick={() => setKind("cutoff")}>D‑1 cutoff</button>
            <button className={kind === "horizon" ? "on" : ""} onClick={() => setKind("horizon")}>Fixed horizon</button>
          </div>
        </div>
        {kind === "cutoff" ? (
          <label className="ctl">
            <span>Cutoff on D‑1 (UK): <b>{meta.cutoff_grid[cutoffIdx]}</b></span>
            <input id="cutoff" type="range" min={0} max={meta.cutoff_grid.length - 1} value={cutoffIdx}
              onChange={(e) => setCutoffIdx(Number(e.target.value))} />
          </label>
        ) : (
          <label className="ctl">
            <span>Hours ahead: <b>{horizon} h</b></span>
            <input id="horizon" type="range" min={meta.horizon_grid[0]} max={meta.horizon_grid.at(-1)} value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))} />
          </label>
        )}
        {tab === "decide" && (
          <label className="ctl">
            <span>Demand, GW <em>(assumption)</em></span>
            <input id="demand" type="number" min={10} max={60} step={1} value={demand}
              onChange={(e) => setDemand(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        )}
        {tab !== "how" && (
          <label className="ctl check">
            <input id="corrected" type="checkbox" checked={corrected} onChange={(e) => setCorrected(e.target.checked)} />
            <span>Bias-corrected ({meta.bias_window_days}-day trailing)</span>
          </label>
        )}
      </div>

      {tab === "decide" && <DecisionDay date={date} mode={mode} demandGw={demand} corrected={corrected} />}
      {tab === "accuracy" && <Accuracy mode={mode} corrected={corrected} selectedDate={date} onOpenDay={openDay} />}
      {tab === "how" && <HowItWorks meta={meta} date={date} mode={mode} />}
    </>
  );
}
