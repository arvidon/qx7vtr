import { api, useApi, type Meta, type Mode } from "../api";
import { mw, settlementPeriod, signedMw, ukDateTime } from "../format";
import { Async, Panel } from "./common";

interface Props {
  meta: Meta;
  date: string;
  mode: Mode;
}

const METRICS: [string, string][] = [
  ["Error", "Forecast − actual, in MW, per hour. Positive: wind over-forecast, so the position is short."],
  ["MAE", "Mean absolute error, in MW. The typical size of a miss."],
  ["RMSE", "Root mean squared error, in MW. Weights large misses more than MAE."],
  ["Bias", "Mean error, in MW. A steady bias is a systematic offset and can be corrected."],
  ["P10–P90", "80% of hourly errors fall in this range. The day chart band uses the past 7 days."],
  ["Bias-corrected", "Forecast minus the mean error over the past 7 days, using only actuals published before the cutoff."],
];

/** A few versions before the one used, and the ones published after it. */
function around<T extends { publish_time: string }>(list: T[], usedTime?: string): T[] {
  const i = list.findIndex((x) => x.publish_time === usedTime);
  return i < 0 ? list.slice(-8) : list.slice(Math.max(0, i - 2), i + 6);
}

export function HowItWorks({ meta, date, mode }: Props) {
  // A real example: every forecast published for 12:00 UTC on the selected day.
  const target = `${date}T12:00:00Z`;
  const v = useApi(() => api.vintages(target), target);
  const dayQ = useApi(() => api.day(date, mode), `${date}|${JSON.stringify(mode)}`);
  const used = dayQ.data?.points.find((p) => p.start_time === target);

  return (
    <div className="stack">
      <Panel
        title="Forecast selection: no look-ahead"
        sub={
          <>
            For each hour of delivery day D, the app uses the latest forecast published at or before the cutoff
            ({meta.default_cutoff} UK time on D‑1 by default). Later forecasts are never used. Forecasts more than{" "}
            {meta.max_forecast_age_h} h old at the cutoff are not used.
          </>
        }
      >
        <Async q={v} height={120}>
          {(vin) => (
            <>
              <p className="sub">
                Example: all forecasts for {ukDateTime(target)} (SP{settlementPeriod(target)}). Actual: {vin.actual_mw != null ? mw(vin.actual_mw) : "n/a"}.
              </p>
              <div className="table-wrap">
                <table className="vt">
                  <thead>
                    <tr>
                      <th>Published (UK)</th>
                      <th className="r">Hours ahead</th>
                      <th className="r">Forecast</th>
                      <th className="r">Error</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {around(vin.vintages, used?.publish_time).map((x) => {
                      const state =
                        used && x.publish_time === used.publish_time ? "used" : used && x.publish_time > used.decision_time ? "late" : "old";
                      const err = vin.actual_mw != null ? x.forecast_mw - vin.actual_mw : null;
                      return (
                        <tr key={x.publish_time} className={state}>
                          <td>{ukDateTime(x.publish_time)}</td>
                          <td className="r">{x.horizon_h} h</td>
                          <td className="r">{mw(x.forecast_mw)}</td>
                          <td className={`r ${err == null ? "" : err > 0 ? "short" : "long"}`}>{err != null ? signedMw(err) : "–"}</td>
                          <td>{state === "used" ? "Used" : state === "late" ? "After cutoff, not used" : "Superseded"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Async>
      </Panel>

      <Panel title="Architecture">
        <div className="flow">
          <div className="box"><b>Elexon BMRS API</b><span>FUELHH (WIND actuals), WINDFOR (forecasts)</span></div>
          <div className="box"><b>Python pipeline</b><span>fetch → UTC → Parquet; {meta.forecast_vintages} forecast versions</span></div>
          <div className="box"><b>Precompute</b><span>every cutoff and horizon → JSON</span></div>
          <div className="box"><b>FastAPI</b><span>/api/day, /api/metrics, /api/horizon-curve</span></div>
          <div className="box"><b>React</b><span>Decision day, accuracy, this page</span></div>
        </div>
        <ul className="notes">
          <li>Delivery days {meta.first_delivery_day} to {meta.last_delivery_day}, covering every decision made in January 2026.</li>
          <li>WINDFOR is hourly. Each hour is scored against the FUELHH settlement period starting at the same time. The day chart shows all 48 periods.</li>
          <li>Times are stored in UTC and shown in UK time.</li>
        </ul>
      </Panel>

      <Panel title="What the numbers mean">
        <dl className="defs">
          {METRICS.map(([k, d]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
