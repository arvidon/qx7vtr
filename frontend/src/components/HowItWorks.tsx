import { api, useApi, type Meta, type Mode } from "../api";
import { mw, ukDateTime } from "../format";
import { Async, Panel } from "./common";

interface Props {
  meta: Meta;
  date: string;
  mode: Mode;
}

const METRICS: [string, string][] = [
  ["Error", "Forecast − actual, per hour. Positive means wind was over-forecast, so you are short and top up at short notice."],
  ["MAE", "Mean absolute error: the typical size of a miss, in MW. Easy to read and robust."],
  ["RMSE", "Root mean squared error: like MAE but big misses count more. RMSE well above MAE means occasional large misses."],
  ["Bias", "Mean error. A large, steady bias is a systematic offset you can correct, not random weather error."],
  ["P10–P90", "80% of hourly errors fall in this range. Used as the planning band on Decision day."],
  ["Bias-corrected", "Forecast minus the mean error of the past 7 days, using only actuals already published at the decision time."],
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
        title="The one rule: no look-ahead"
        sub={
          <>
            For each hour of delivery day D we use the newest forecast published at or before the decision time (by
            default {meta.default_cutoff} UK time on D‑1). Anything published later was not available when you bid, so it
            never counts. Forecasts more than {meta.max_forecast_age_h} h old at decision time are not used either.
          </>
        }
      >
        <Async q={v} height={120}>
          {(vin) => (
            <>
              <p className="sub">
                Real example: every forecast for {ukDateTime(target)}. Actual output was {vin.actual_mw != null ? mw(vin.actual_mw) : "n/a"}.
              </p>
              <ol className="timeline">
                {around(vin.vintages, used?.publish_time).map((x) => {
                  const state =
                    used && x.publish_time === used.publish_time ? "used" : used && x.publish_time > used.decision_time ? "late" : "old";
                  return (
                    <li key={x.publish_time} className={`tl-${state}`}>
                      <b>{ukDateTime(x.publish_time)}</b>
                      <span>
                        {mw(x.forecast_mw)} · {x.horizon_h} h ahead ·{" "}
                        {state === "used" ? "used for the bid" : state === "late" ? "published after the decision, ignored" : "superseded"}
                      </span>
                    </li>
                  );
                })}
              </ol>
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
          <div className="box"><b>React</b><span>these three tabs</span></div>
        </div>
        <ul className="notes">
          <li>Delivery days {meta.first_delivery_day} to {meta.last_delivery_day}: every purchase decision made in January 2026.</li>
          <li>WINDFOR is hourly; it is scored against the FUELHH half-hour starting at the same time. The chart shows all half-hours.</li>
          <li>Times are stored in UTC and converted to UK time for the cutoff and for display.</li>
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
