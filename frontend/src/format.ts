const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const mw = (v: number) => `${nf0.format(v)} MW`;
export const signedMw = (v: number) => `${v > 0 ? "+" : ""}${nf0.format(v)} MW`;
export const gwh = (mwh: number) => `${nf1.format(mwh / 1000)} GWh`;
export const gw = (v: number) => nf1.format(v / 1000);

const UK = "Europe/London";
export const ukTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: UK });
export const ukDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: UK,
  });
export const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });

/** Every ISO date from first to last inclusive. */
export function dateRange(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${first}T00:00:00Z`); d <= new Date(`${last}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** GB settlement period (1-based, half-hours from UK local midnight). */
export function settlementPeriod(iso: string): number {
  const t = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(t);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 2 + (m >= 30 ? 1 : 0) + 1;
}
export const ukDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: UK });
