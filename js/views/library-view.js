// The exercise library and the detail page of one exercise: its targets, its strength trend
// and its recent sessions.

import { state, exercise, pattern, targetFor, restFor, updateTarget } from "../state.js";
import { strengthTrend } from "../history.js";
import { MUSCLES } from "../library.js";
import { actions, esc, ago, fmtDate, fmtKg, fmtClock, setsText } from "../ui.js";

export function libraryView() {
  const muscles = ["all", ...MUSCLES];
  const chips = muscles.map((m) => `<button class="chip ${(state.ui.muscle ?? "all") === m ? "on" : ""}" data-action="lib-muscle" data-m="${m}" style="text-transform:capitalize">${m}</button>`).join("");
  const body = `
    <input class="search" type="search" placeholder="Search exercises" value="${esc(state.ui.libQuery ?? "")}" data-input="lib-search">
    <div class="chips" style="margin-top:10px">${chips}</div>
    <div id="lib-list">${libraryList()}</div>`;
  return { title: "Library", tab: "library", body };
}

function libraryList() {
  const q = (state.ui.libQuery ?? "").trim().toLowerCase();
  const m = state.ui.muscle ?? "all";
  const list = [...state.library.exercises.values()]
    .filter((e) => (m === "all" || e.muscle === m) && (!q || e.name.toLowerCase().includes(q)))
    .map((e) => ({ e, last: state.index.get(e.id)?.at(-1)?.date ?? null }))
    .sort((a, b) => (b.last ?? 0) - (a.last ?? 0) || a.e.name.localeCompare(b.e.name));
  if (!list.length) return `<div class="empty">No exercises found</div>`;
  return `<div class="list">${list.map(({ e, last }) => `
    <a href="#exercise-${e.id}">
      <div class="grow"><div class="title ellipsis">${esc(e.name)}</div>
        <div class="small muted">${esc(e.muscle)} · ${esc(e.equipment)}</div></div>
      <div class="small muted">${last ? ago(last) : ""}</div>
    </a>`).join("")}</div>`;
}

export function exerciseView(id) {
  const e = exercise(id);
  if (!e) return { title: "Exercise", back: "#library", body: `<div class="empty">Unknown exercise</div>` };
  const t = targetFor(id);
  const entries = state.index.get(id) ?? [];
  const trend = strengthTrend(entries.slice(-40), e, state.bodyweightAt);
  const stepper = (key, value, label) => `
    <div><div class="field-label">${label}</div><div class="stepper">
      <button data-action="target-step" data-id="${id}" data-key="${key}" data-d="-1">−</button>
      <div class="num" style="text-align:center;font-weight:700;font-size:18px">${value}</div>
      <button data-action="target-step" data-id="${id}" data-key="${key}" data-d="1">+</button></div></div>`;
  const recent = entries.slice(-8).reverse().map((x) => `
    <div><div class="grow"><div class="title">${fmtDate(x.date)}</div><div class="small muted">${esc(setsText(x.sets))}</div></div></div>`).join("");
  const body = `
    <div class="small muted" style="text-transform:capitalize">${esc(e.muscle)} · ${esc(pattern(id).label)} · ${esc(e.equipment)}</div>
    <section class="card">
      <div class="eyebrow">Estimated one-rep max</div>
      ${trend.length > 1 ? spark(trend) : `<div class="empty">Log at least two sessions to see a trend</div>`}
    </section>
    <section class="card">
      <div class="eyebrow">Targets</div>
      <div class="target-grid">
        ${stepper("repsLo", t.reps[0], "Reps from")}${stepper("repsHi", t.reps[1], "Reps to")}
        ${stepper("rirLo", t.rir[0], "RIR from")}${stepper("rirHi", t.rir[1], "RIR to")}
        ${stepper("increment", fmtKg(e.increment), "Step (kg)")}
        ${stepper("rest", fmtClock(restFor(id)), "Rest")}
      </div>
      ${e.equipment === "dumbbell" ? `<div class="small muted" style="margin-top:8px">Dumbbell weights are the total of both dumbbells.</div>` : ""}
    </section>
    ${recent ? `<div class="eyebrow section-title">Recent sessions</div><div class="list">${recent}</div>` : ""}`;
  return { title: e.name, back: "#library", body };
}

/** A filled line chart of estimated one-rep max per session. */
function spark(trend) {
  const w = 320, h = 120, pad = 6;
  const ys = trend.map((p) => p.e1rm);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const t0 = trend[0].date.getTime(), t1 = trend.at(-1).date.getTime();
  const x = (d) => pad + ((d.getTime() - t0) / Math.max(1, t1 - t0)) * (w - 2 * pad);
  const y = (v) => h - pad - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - 2 * pad - 14);
  const line = trend.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.e1rm).toFixed(1)}`).join("");
  const area = `${line}L${x(trend.at(-1).date).toFixed(1)},${h}L${x(trend[0].date).toFixed(1)},${h}Z`;
  return `
    <div class="row" style="justify-content:space-between;margin-top:4px">
      <b class="num" style="font-size:22px">${fmtKg(Math.round(ys.at(-1)))} kg</b>
      <span class="small muted num">best ${fmtKg(Math.round(hi))} kg</span>
    </div>
    <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Estimated one-rep max over time">
      <path class="area" d="${area}"/><path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="row small muted" style="justify-content:space-between"><span>${fmtDate(trend[0].date, { month: "short", year: "2-digit" })}</span><span>${fmtDate(trend.at(-1).date, { month: "short", year: "2-digit" })}</span></div>`;
}

actions["lib-muscle"] = ({ m }) => { state.ui.muscle = m; };
actions["lib-search"] = (_, el) => {
  state.ui.libQuery = el.value;
  document.getElementById("lib-list").innerHTML = libraryList();
  return "keep";
};
actions["target-step"] = ({ id, key, d }) => {
  if (!state.program) return;
  const t = targetFor(id);
  const step = +d;
  const [rLo, rHi] = t.reps, [iLo, iHi] = t.rir;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (key === "repsLo") return updateTarget(id, { reps: [clamp(rLo + step, 1, rHi - 1), rHi] });
  if (key === "repsHi") return updateTarget(id, { reps: [rLo, clamp(rHi + step, rLo + 1, 50)] });
  if (key === "rirLo") return updateTarget(id, { rir: [clamp(iLo + step, 0, iHi), iHi] });
  if (key === "rirHi") return updateTarget(id, { rir: [iLo, clamp(iHi + step, iLo, 5)] });
  if (key === "rest") return updateTarget(id, { restSec: clamp(restFor(id) + 15 * step, 15, 600) });
  if (key === "increment") {
    const now = exercise(id).increment;
    const steps = [0, 0.5, 1, 1.25, 2, 2.5, 4, 5, 10];
    const i = clamp(steps.findIndex((s) => s >= now) + step, 0, steps.length - 1);
    return updateTarget(id, { increment: steps[i] });
  }
};
