// The exercise library and the page of one exercise: its records, its progress over time, its
// targets and its recent sessions.

import { state, exercise, pattern, bodyweight, saveProgram } from "../state.js";
import { exerciseCategory, CATEGORY_LABEL, favorites } from "../program.js";
import { star, starMark } from "./star.js";
import { trainingRows } from "./training.js";
import { exerciseSeries, records } from "../history.js";
import { loadFor } from "../progression.js";
import { MUSCLES, MINOR_MUSCLES } from "../library.js";
import { lineChart, compact, rangeStart, rangeChips } from "../charts.js";
import { actions, esc, ago, cap, fmtDate, fmtKg, setsText } from "../ui.js";

const METRICS = { e1rm: "Est. 1RM", top: "Heaviest", volume: "Volume" };

/** Where the Back link of an exercise page leads when the page was opened from the workout. */
export const exerciseOrigin = { back: null };

export function libraryView() {
  const muscles = ["all", ...MUSCLES, ...MINOR_MUSCLES];
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
    .map((e) => ({ e, entries: state.index.get(e.id) }))
    .sort((a, b) => (b.entries?.at(-1).date ?? 0) - (a.entries?.at(-1).date ?? 0) || a.e.name.localeCompare(b.e.name));
  if (!list.length) return `<div class="empty">No exercises found</div>`;
  const favorite = list.filter(({ e }) => favorites().includes(e.id));
  const other = list.filter(({ e }) => !favorites().includes(e.id));
  const section = (title, items) => (items.length ? `${title ? `<div class="eyebrow section-title">${title}</div>` : ""}<div class="list">${items.map(libraryRow).join("")}</div>` : "");
  return favorite.length ? section("Favorites", favorite) + section("Other exercises", other) : section("", other);
}

/** A row of the Library: star, name, muscle, equipment and last session, and the estimated 1RM of that session. */
function libraryRow({ e, entries }) {
  const last = entries?.at(-1);
  const est = last && e.increment > 0 ? exerciseSeries([last], exercise(e.id), bodyweight())[0].e1rm : 0;
  return `
    <a href="#exercise-${e.id}">
      <div class="grow"><div class="title ellipsis">${starMark(e.id)} ${esc(e.name)}</div>
        <div class="small muted">${esc(cap(e.muscle))} · ${esc(e.equipment)}${last ? ` · ${ago(last.date)}` : ""}</div></div>
      ${est ? `<div class="num" style="text-align:right"><b>${fmtKg(Math.round(est))} kg</b><div class="small muted">Est. 1RM</div></div>` : ""}
    </a>`;
}

export function exerciseView(id) {
  const e = exercise(id);
  if (!e) return { title: "Exercise", back: "#library", body: `<div class="empty">Unknown exercise</div>` };
  const entries = state.index.get(id) ?? [];
  const head = `
    <div class="row" style="justify-content:space-between;gap:8px">
      <div class="small muted">${esc(cap(e.muscle))} · ${esc(pattern(id).label.toLowerCase())} · ${esc(e.equipment)}</div>
      ${star(id)}
    </div>${cuesCard(id)}`;
  const body = entries.length ? head + recordsCard(entries, e) + chartCard(entries, e) + repTable(entries, e) + targetsCard(id, e) + recentList(entries)
    : head + `<div class="empty">No sessions with this exercise yet</div>` + targetsCard(id, e);
  return { title: e.name, back: exerciseOrigin.back ?? "#library", body };
}

/** The exercise's two reference photos (start and end position) and its execution steps. The
 *  steps are collapsed so the records stay in view. */
function cuesCard(id) {
  const cue = state.library.cues.get(id);
  if (!cue) return "";
  const photos = cue.images.map((p) => `<img src="img/ex/${encodeURI(p)}" alt="" loading="lazy">`).join("");
  return `
    <section class="card cues">
      <div class="cue-photos">${photos}</div>
      <details><summary>How to perform</summary>
        <ol>${cue.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      </details>
    </section>`;
}

/** Stat tiles of the exercise's records, each with the date it was set. */
function recordsCard(entries, e) {
  const r = records(entries, e, bodyweight());
  const current = exerciseSeries(entries.slice(-1), e, bodyweight())[0].e1rm;
  const tile = (label, value, sub) => `<div class="stat"><span>${label}</span><b>${value}</b><span>${sub}</span></div>`;
  const when = (rec) => fmtDate(rec.date, { day: "numeric", month: "short", year: "2-digit" });
  const bw = e.load === "add" ? " (with bodyweight)" : e.load === "subtract" ? " (bodyweight minus assistance)" : "";
  return `
    <div class="stats two">
      ${tile(`Est. 1RM now${bw}`, `${fmtKg(Math.round(current))} kg`, `last session, ${ago(entries.at(-1).date)}`)}
      ${tile("Best est. 1RM", `${fmtKg(Math.round(r.e1rm.value))} kg`, `${fmtKg(r.e1rm.set.kg)} × ${r.e1rm.set.reps} · ${when(r.e1rm)}`)}
      ${e.load === "subtract" ? "" : tile("Heaviest weight", `${fmtKg(r.heaviest.value)} kg`, `× ${r.heaviest.set.reps} · ${when(r.heaviest)}`)}
      ${tile("Best set volume", `${compact(r.bestSet.value)} kg`, `${fmtKg(r.bestSet.set.kg)} × ${r.bestSet.set.reps} · ${when(r.bestSet)}`)}
      ${tile("Best session volume", `${compact(r.session.value)} kg`, when(r.session))}
      ${tile("Sessions", entries.length, `since ${fmtDate(entries[0].date, { month: "short", year: "numeric" })}`)}
    </div>`;
}

function chartCard(entries, e) {
  const metric = state.ui.exMetric ?? "e1rm";
  const range = state.ui.exRange ?? "1Y";
  const from = rangeStart(range);
  const points = exerciseSeries(entries, e, bodyweight()).filter((p) => !from || p.date >= from)
    .map((p) => ({ date: p.date, value: p[metric], tip: `${fmtDate(p.date)}: ${metric === "volume" ? Math.round(p.volume).toLocaleString() : fmtKg(Math.round(p[metric] * 10) / 10)} kg` }));
  const chip = (action, key, value, label) => `<button class="chip small ${key === value ? "on" : ""}" data-action="${action}" data-v="${value}">${label}</button>`;
  return `
    <section class="card">
      <div class="chips">${Object.entries(METRICS).map(([k, label]) => chip("ex-metric", metric, k, label)).join("")}</div>
      ${lineChart(points, { from: from && points.length ? from : null })}
      <div class="chips">${rangeChips("ex-range", range)}</div>
    </section>`;
}

/**
 * For each rep count from 1 to 12: the heaviest weight ever lifted for at least that many reps,
 * with its date, and the estimated maximum for exactly that many reps to failure from the best
 * estimated one-rep max, rounded to 0.5 kg. For one rep that is the estimated one-rep max itself,
 * since the Epley formula, inverted at one rep, gives a weight just below it. A rep count whose
 * best reaches the estimate is marked.
 */
function repTable(entries, e) {
  if (e.load !== "none" || !e.increment) return "";
  const r = records(entries, e, bodyweight());
  const when = (d) => fmtDate(d, { day: "numeric", month: "short", year: "2-digit" });
  const rows = Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
    const best = r.reps.get(n);
    const estimate = Math.round((n === 1 ? r.e1rm.value : loadFor(r.e1rm.value, n, 0)) * 2) / 2;
    return `
      <div class="${best && best.value >= estimate ? "at-best" : ""}"><span class="rep-n">${n}</span>
        <span class="grow num">${best ? `<b>${fmtKg(best.value)} kg</b> <span class="small muted">${when(best.date)}</span>` : `<span class="muted">–</span>`}</span>
        <span class="num muted">${fmtKg(estimate)} kg</span></div>`;
  }).join("");
  return `
    <div class="eyebrow section-title">Rep records</div>
    <p class="small muted" style="margin:0 4px 6px">Best is the heaviest weight you lifted for at least that many reps. Estimated is the maximum
      for exactly that many reps to failure from your best estimated one-rep max of ${fmtKg(Math.round(r.e1rm.value * 2) / 2)} kg
      (${fmtKg(r.e1rm.set.kg)} kg × ${r.e1rm.set.reps}, ${when(r.e1rm.date)}). Red rows are where your best has reached the estimate.</p>
    <div class="list rep-table">
      <div class="small muted"><span class="rep-n">Reps</span><span class="grow">Best</span><span>Estimated</span></div>
      ${rows}</div>`;
}

/** The exercise's training values, which follow its category until set here, and its weight step. */
function targetsCard(id, e) {
  const own = state.program.exercises[id]?.increment != null;
  const step = (d) => `<button data-action="increment-step" data-id="${id}" data-d="${d}" aria-label="${d < 0 ? "Smaller" : "Larger"} step">${d < 0 ? "−" : "+"}</button>`;
  return `
    <section class="card">
      <div class="eyebrow">Training</div>
      <p class="small muted" style="margin:6px 0 2px">Values of ${CATEGORY_LABEL[exerciseCategory(id)]} in <a class="link-text" href="#setup">Settings</a>, unless set here.</p>
      ${trainingRows("exercise", id)}
      <div class="tv-row">
        <div class="grow">Weight step${own ? `<button class="tv-reset" data-action="increment-reset" data-id="${id}">Custom · Reset</button>` : ""}</div>
        <div class="mini-stepper">${step(-1)}<span class="num">${fmtKg(e.increment)} kg</span>${step(1)}</div>
      </div>
      ${e.equipment === "dumbbell" ? `<div class="small muted" style="margin-top:8px">Dumbbell weights are the total of both dumbbells.</div>` : ""}
    </section>`;
}

function recentList(entries) {
  return `<div class="eyebrow section-title">Recent sessions</div><div class="list">${entries.slice(-8).reverse().map((x) => `
    <a href="#session-${encodeURIComponent(x.sessionId)}"><div class="grow"><div class="title">${fmtDate(x.date)}</div>
      <div class="small muted">${esc(setsText(x.sets))}</div></div></a>`).join("")}</div>`;
}


actions["lib-muscle"] = ({ m }) => { state.ui.muscle = m; };
actions["lib-search"] = (_, el) => {
  state.ui.libQuery = el.value;
  document.getElementById("lib-list").innerHTML = libraryList();
  return "keep";
};
actions["ex-metric"] = ({ v }) => { state.ui.exMetric = v; };
actions["ex-range"] = ({ v }) => { state.ui.exRange = v; };
const STEPS = [0, 0.5, 1, 1.25, 2, 2.5, 4, 5, 10];
actions["increment-step"] = ({ id, d }) => {
  const i = Math.min(STEPS.length - 1, Math.max(0, STEPS.findIndex((s) => s >= exercise(id).increment) + +d));
  state.program.exercises[id] = { ...state.program.exercises[id], increment: STEPS[i] };
  return saveProgram();
};
actions["increment-reset"] = ({ id }) => {
  const { increment: _, ...rest } = state.program.exercises[id];
  if (Object.keys(rest).length) state.program.exercises[id] = rest;
  else delete state.program.exercises[id];
  return saveProgram();
};
