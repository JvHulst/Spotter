// Small SVG charts in the app's accent color. Above each line or column chart, a readout shows
// the value under the finger and its date, and the latest value otherwise. Every mark carries
// its value and date as data-v and data-l (see markPoint in ui.js); heatmap cells carry a
// `data-tip` that a tap shows as a tooltip. Charts draw in a fixed
// viewBox and scale to the card width, so text keeps its proportions.

import { esc, fmtDate } from "./ui.js";

const W = 320;

/** The value and date of a tip "date: value", for a mark's data-v and data-l. */
const parts = (tip) => {
  const i = tip.indexOf(": ");
  return i < 0 ? [tip, ""] : [tip.slice(i + 2), tip.slice(0, i)];
};
const marks = (tip) => {
  const [v, l] = parts(tip);
  return `data-v="${esc(v)}" data-l="${esc(l)}"`;
};
/** A chart with its readout, which shows `latest` until a value is marked. */
const boxed = (svg, latest) => {
  const [v, l] = parts(latest);
  return `<div class="chart-box"><div class="readout"><b>${esc(v)}</b><span>${esc(l)}</span></div>${svg}</div>`;
};

/** Time ranges of the charts, in days. */
export const RANGES = { "3M": 91, "1Y": 365, All: Infinity };
/** The first date of a time range, or null for all time. */
export const rangeStart = (range, now = Date.now()) => (RANGES[range] === Infinity ? null : new Date(now - RANGES[range] * 86400000));
/** Chips that pick a time range; the chosen range arrives as data-v of the action. */
export const rangeChips = (action, current) => Object.keys(RANGES)
  .map((r) => `<button class="chip small ${r === current ? "on" : ""}" data-action="${action}" data-v="${r}">${r}</button>`).join("");

/** Up to four round tick values covering lo..hi. */
function ticks(lo, hi) {
  const span = hi - lo || Math.abs(hi) || 1;
  const step = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(span / 3))).find((s) => span / s <= 4);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export const compact = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}K`.replace(".0K", "K") : String(Math.round(v)));

/**
 * A line over time with a light area wash, an end dot labeled with the last value, and a
 * tappable point per value. points: [{date, value, tip}], oldest first.
 */
export function lineChart(points, { height = 150, unit = "kg", from = null } = {}) {
  if (points.length < 2) return `<div class="empty small">Not enough data in this range</div>`;
  const left = 34, right = 40, top = 10, bottom = 22;
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
  lo -= pad; hi += pad;
  const t0 = (from ?? points[0].date).getTime(), t1 = points.at(-1).date.getTime();
  const x = (d) => left + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * (W - left - right);
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (height - top - bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const base = height - bottom;
  const area = `${line}L${x(points.at(-1).date).toFixed(1)},${base}L${x(points[0].date).toFixed(1)},${base}Z`;
  const grid = ticks(lo, hi).map((v) => `
    <line class="grid" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${left - 6}" y="${y(v) + 3.5}" text-anchor="end">${compact(v)}</text>`).join("");
  const end = points.at(-1);
  const hits = points.map((p) => `<circle class="hit" cx="${x(p.date)}" cy="${y(p.value)}" r="10" ${marks(p.tip)}/>`).join("");
  const fmt = (d) => fmtDate(d, { month: "short", year: "2-digit" });
  return boxed(`
    <svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Line chart, last value ${Math.round(end.value)} ${unit}">
      ${grid}
      <path class="area" d="${area}"/>
      <path class="line" d="${line}"/>
      <circle class="dot" cx="${x(end.date)}" cy="${y(end.value)}" r="4"/>
      <text class="label" x="${x(end.date) + 8}" y="${y(end.value) + 4}">${compact(end.value)}</text>
      <text class="axis" x="${left}" y="${height - 6}">${fmt(new Date(t0))}</text>
      <text class="axis" x="${W - right}" y="${height - 6}" text-anchor="end">${fmt(end.date)}</text>
      ${hits}
    </svg>`, end.tip);
}

/**
 * Bodyweight: each weigh-in as a dot, the trend as a line ending in a labeled dot, and behind
 * them a light tint for each bulk or cut phase. points: [{date, kg, trend, tip}], oldest first;
 * phases: [{from, to, phase}] with dates.
 */
export function weightChart(points, phases, { height = 160, from = null } = {}) {
  if (points.length < 2) return `<div class="empty small">Not enough data in this range</div>`;
  const left = 34, right = 40, top = 10, bottom = 22;
  const vals = points.flatMap((p) => [p.kg, p.trend]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad; hi += pad;
  const t0 = (from ?? points[0].date).getTime(), t1 = Math.max(points.at(-1).date.getTime(), ...phases.map((b) => b.to.getTime()));
  const x = (d) => left + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * (W - left - right);
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (height - top - bottom);
  const base = height - bottom;
  const bands = phases.filter((b) => b.to > new Date(t0)).map((b) => {
    const x0 = x(new Date(Math.max(b.from, t0))), x1 = x(b.to);
    return `<rect class="phase ${b.phase}" x="${x0.toFixed(1)}" y="${top}" width="${Math.max(0, x1 - x0).toFixed(1)}" height="${base - top}"/>`;
  }).join("");
  const grid = ticks(lo, hi).map((v) => `
    <line class="grid" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${left - 6}" y="${y(v) + 3.5}" text-anchor="end">${compact(v)}</text>`).join("");
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join("");
  const dots = points.map((p) => `<circle class="raw" cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="2.5"/>`).join("");
  const hits = points.map((p) => `<circle class="hit" cx="${x(p.date)}" cy="${y(p.kg)}" r="10" ${marks(p.tip)}/>`).join("");
  const end = points.at(-1);
  const fmt = (d) => fmtDate(d, { month: "short", year: "2-digit" });
  return boxed(`
    <svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Bodyweight with trend, last trend ${end.trend.toFixed(1)} kg">
      ${bands}${grid}${dots}
      <path class="line" d="${line}"/>
      <circle class="dot" cx="${x(end.date)}" cy="${y(end.trend)}" r="4"/>
      <text class="label" x="${x(end.date) + 8}" y="${y(end.trend) + 4}">${end.trend.toFixed(1)}</text>
      <text class="axis" x="${left}" y="${height - 6}">${fmt(new Date(t0))}</text>
      <text class="axis" x="${W - right}" y="${height - 6}" text-anchor="end">${fmt(new Date(t1))}</text>
      ${hits}
    </svg>`, end.tip);
}

/** Columns from one baseline, labeled every `every` columns, the last one highlighted.
 *  bars: [{label, value, tip}], oldest first. */
export function barChart(bars, { height = 130, every = 4 } = {}) {
  const left = 26, right = 6, top = 12, bottom = 20;
  const hi = Math.max(1, ...bars.map((b) => b.value));
  const band = (W - left - right) / bars.length;
  const bw = Math.min(24, band - 2);
  const y = (v) => top + (1 - v / hi) * (height - top - bottom);
  const base = height - bottom;
  const grid = ticks(0, hi).map((v) => `
    <line class="grid" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="axis" x="${left - 6}" y="${y(v) + 3.5}" text-anchor="end">${compact(v)}</text>`).join("");
  const cols = bars.map((b, i) => {
    const x0 = left + i * band + (band - bw) / 2;
    const h = base - y(b.value);
    const r = Math.min(4, h / 2, bw / 2);
    const shape = h <= 0 ? "" : `<path class="${i === bars.length - 1 ? "bar now" : "bar"}" d="M${x0},${base}V${base - h + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${base}Z"/>`;
    const label = (bars.length - 1 - i) % every === 0 ? `<text class="axis" x="${x0 + bw / 2}" y="${height - 6}" text-anchor="middle">${esc(b.label)}</text>` : "";
    return `${shape}${label}<rect class="hit" x="${left + i * band}" y="${top}" width="${band}" height="${base - top}" ${marks(b.tip)}/>`;
  }).join("");
  return boxed(`<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="Column chart">${grid}${cols}</svg>`, bars.at(-1).tip);
}

/** A small trend line without axes, for tiles. values: numbers, oldest first. */
export function sparkline(values, { width = 120, height = 32 } = {}) {
  if (values.length < 2) return "";
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = (i) => 2 + (i / (values.length - 1)) * (width - 6);
  const y = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path class="line" d="${d}"/>
    <circle class="dot" cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="3"/></svg>`;
}

/**
 * A grid of cells shaded by value in five steps of the accent color. rows: [{label, cells:
 * [{value, tip}]}]; `steps` are the lower bounds of shades 1 to 4 (shade 0 is below the first).
 */
export function heatmap(rows, { steps = [0.5, 3, 6, 10], columns = [] } = {}) {
  const shade = (v) => steps.filter((s) => v >= s).length;
  const head = columns.length ? `<div></div>${columns.map((c) => `<div class="hm-col">${esc(c)}</div>`).join("")}` : "";
  const body = rows.map((r) => `
    <div class="hm-label">${esc(r.label)}</div>
    ${r.cells.map((c) => `<div class="hm-cell s${shade(c.value)}" data-tip="${esc(c.tip)}"></div>`).join("")}`).join("");
  return `<div class="heatmap" style="grid-template-columns: 84px repeat(${rows[0]?.cells.length ?? 0}, 1fr)">${head}${body}</div>`;
}
