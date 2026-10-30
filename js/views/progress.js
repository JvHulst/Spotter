// Progress: workouts per week, estimated one-rep max per exercise, weekly sets per muscle,
// weekly volume and recent records.

import { state, exercise, bodyweight, weighIns, setWeight, saveProgram } from "../state.js";
import { STRENGTH_LIFTS } from "../program.js";
import { weeklyStats, exerciseSeries, weightTrend } from "../history.js";
import { PHASES } from "../program.js";
import { openSheet, closeSheet } from "./sheet.js";
import { MUSCLES, MINOR_MUSCLES } from "../library.js";
import { lineChart, weightChart, barChart, sparkline, heatmap, compact, rangeStart, rangeChips } from "../charts.js";
import { actions, esc, fmtDate, fmtKg, plural, toast, RECORD_LABEL } from "../ui.js";
import { localIso } from "../workout.js";

const DAY_MS = 86400000;

export function progressView() {
  if (!state.sessions.length) return { title: "Progress", tab: "progress", body: `<div class="empty">Log a workout to see your progress</div>` };
  const now = new Date();
  const weeks = weeklyStats(state.sessions, state.library, now, 26);
  const thisWeek = weeks.at(-1);
  const avg12 = weeks.slice(-13, -1).reduce((n, w) => n + w.workouts, 0) / 12;
  let streak = 0;
  for (let i = weeks.length - (thisWeek.workouts ? 1 : 2); i >= 0 && weeks[i].workouts; i--) streak++;
  const recent = [...state.records.entries()].flatMap(([id, list]) => list.map((r) => ({ ...r, session: state.sessions.find((s) => s.id === id) })))
    .filter((r) => r.session && (now - new Date(r.session.start)) / DAY_MS <= 30);

  const weekLabel = (w) => fmtDate(w.start, { day: "numeric", month: "short" });
  const body = `
    <div class="stats">
      <div class="stat"><b>${thisWeek.workouts}</b><span>${thisWeek.workouts === 1 ? "workout" : "workouts"} this week, avg ${avg12.toFixed(1)}</span></div>
      <div class="stat"><b>${streak}</b><span>${streak === 1 ? "week" : "weeks"} in a row with a workout</span></div>
      <div class="stat"><b>${recent.length}</b><span>records in the last 30 days</span></div>
    </div>

    <section class="card">
      <div class="eyebrow">Workouts per week</div>
      ${barChart(weeks.map((w) => ({ label: weekLabel(w), value: w.workouts, tip: `Week of ${weekLabel(w)}: ${plural(w.workouts, "workout")}` })))}
    </section>

    ${strengthSection(now)}

    ${bodyweightCard(now)}

    <section class="card">
      <div class="eyebrow">Weekly sets per muscle</div>
      <p class="small muted" style="margin:4px 0 10px">Last 12 weeks, this week on the right. Sets for an exercise's main muscle
        count fully and sets for its secondary muscles count half.</p>
      ${heatmap([...MUSCLES, ...MINOR_MUSCLES].map((m) => ({
        label: m,
        cells: weeks.slice(-12).map((w) => {
          const v = w.muscles.get(m) ?? 0;
          return { value: v, tip: `${m}, week of ${weekLabel(w)}: ${fmtKg(v)} sets` };
        }),
      })))}
      <div class="hm-legend small muted"><span>0</span><i class="hm-cell s1"></i><i class="hm-cell s2"></i><i class="hm-cell s3"></i><i class="hm-cell s4"></i><span>10+ sets</span></div>
    </section>

    <section class="card">
      <div class="eyebrow">Weekly volume</div>
      <p class="small muted" style="margin:4px 0 6px">Weight × reps of all working sets, in kg</p>
      ${barChart(weeks.map((w) => ({ label: weekLabel(w), value: w.volume, tip: `Week of ${weekLabel(w)}: ${Math.round(w.volume).toLocaleString()} kg` })))}
    </section>

    <div class="eyebrow section-title">Records in the last 30 days</div>
    ${recent.length ? `<div class="list">${recent.reverse().slice(0, 20).map((r) => `
      <a href="#session-${encodeURIComponent(r.session.id)}">
        <div class="grow"><div class="title ellipsis">${esc(exercise(r.ex)?.name ?? r.ex)}</div>
          <div class="small muted">${RECORD_LABEL[r.kind]} · ${fmtDate(new Date(r.session.start))}</div></div>
        <b class="num">${r.kind === "volume" ? compact(r.value) : fmtKg(Math.round(r.value * 10) / 10)} kg</b>
      </a>`).join("")}</div>` : `<div class="empty small">No records in the last 30 days</div>`}`;
  return { title: "Progress", tab: "progress", body };
}

/** The automatic choice of exercises to track: squat, bench press and deadlift when ever logged,
 *  then the most used exercises of the last half year, eight at most. */
function automaticTracked() {
  const used = [...state.usage.entries()].filter(([id, u]) => u.recent >= 3 && exercise(id)?.increment > 0)
    .sort((a, b) => b[1].recent - a[1].recent).map(([id]) => id);
  return [...new Set([...[...STRENGTH_LIFTS].filter((id) => state.index.has(id)), ...used])].slice(0, 8);
}

/** The exercises on the dashboard: the user's choice (`tracked` in the program), else the automatic one. */
const chosenTracked = () => (state.program.tracked ?? automaticTracked()).filter((id) => exercise(id));

function strengthSection(now) {
  const tracked = chosenTracked().filter((id) => state.index.has(id));
  if (!tracked.length) return "";
  const pick = tracked.includes(state.ui.progressEx) ? state.ui.progressEx : tracked[0];
  const range = state.ui.progressRange ?? "1Y";
  const series = (id) => exerciseSeries(state.index.get(id), exercise(id), bodyweight());
  const tiles = tracked.map((id) => {
    const s = series(id);
    const last = s.at(-1);
    const before = s.findLast((p) => (now - p.date) / DAY_MS >= 91);
    const change = before ? Math.round((last.e1rm / before.e1rm - 1) * 100) : null;
    return `
      <button class="tile ${id === pick ? "on" : ""}" data-action="progress-ex" data-id="${id}">
        <div class="small ellipsis tile-name">${esc(exercise(id).name)}</div>
        <div class="row" style="gap:6px;align-items:baseline"><b class="tile-value">${fmtKg(Math.round(last.e1rm))}</b><span class="small muted">kg</span>
          ${change == null ? "" : `<span class="small ${change > 0 ? "mode-up" : change < 0 ? "mode-down" : "muted"}">${change > 0 ? "+" : ""}${change}% 3 mo</span>`}</div>
        ${sparkline(s.slice(-12).map((p) => p.e1rm))}
      </button>`;
  }).join("");
  const from = rangeStart(range, now);
  const points = series(pick).filter((p) => !from || p.date >= from)
    .map((p) => ({ date: p.date, value: p.e1rm, tip: `${fmtDate(p.date)}: ${fmtKg(Math.round(p.e1rm * 10) / 10)} kg` }));
  return `
    <section class="card">
      <div class="row"><div class="eyebrow grow">Estimated one-rep max</div><a class="small link-text" href="#tracked">Edit ›</a></div>
      <div class="tiles">${tiles}</div>
      <div class="row" style="margin-top:12px">
        <b class="grow ellipsis">${esc(exercise(pick).name)}</b>
        <div class="chips">${rangeChips("progress-range", range)}</div>
      </div>
      ${lineChart(points, { from: from && points.length ? from : null })}
      <a class="small" href="#exercise-${pick}" style="color:var(--accent-text)">Records and history ›</a>
    </section>`;
}

/** The diet phases as dated bands from each phase's start to the next one's, the last until now. */
function phaseBands(now) {
  const list = (state.program.phases ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  return list.map((p, i) => ({ phase: p.phase, from: new Date(`${p.date}T00:00:00`), to: list[i + 1] ? new Date(`${list[i + 1].date}T00:00:00`) : now }))
    .filter((b) => b.phase !== "maintain");
}
const currentPhase = () => (state.program.phases ?? []).slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1);

/**
 * Bodyweight: the weigh-ins as dots, their trend as a line (see weightTrend), and the bulk and
 * cut phases as tinted bands. Above the chart: the trend now and its change per week over the
 * 4 weeks before the latest weigh-in.
 */
function bodyweightCard(now) {
  const all = weightTrend(weighIns());
  const range = state.ui.bwRange ?? "1Y";
  const from = rangeStart(range, now);
  const points = all.filter((p) => !from || p.date >= from)
    .map((p) => ({ ...p, tip: `${fmtDate(p.date)}: ${fmtKg(p.kg)} kg, trend ${p.trend.toFixed(1)}` }));
  const last = all.at(-1);
  const before = last && all.findLast((p) => (last.date - p.date) / DAY_MS >= 28);
  const perWeek = before ? ((last.trend - before.trend) / ((last.date - before.date) / DAY_MS)) * 7 : null;
  const phase = currentPhase();
  const bands = phaseBands(now);
  return `
    <section class="card">
      <div class="row"><div class="eyebrow grow">Bodyweight${phase && phase.phase !== "maintain" ? ` · ${PHASES[phase.phase]}` : ""}</div>
        <a class="small link-text" href="#body">Weigh-ins ›</a></div>
      ${last ? `<div class="row" style="gap:8px;align-items:baseline;margin-top:6px"><b class="tile-value">${last.trend.toFixed(1)}</b><span class="small muted">kg trend</span>
        ${perWeek == null ? "" : `<span class="small muted">${perWeek >= 0 ? "+" : "−"}${Math.abs(perWeek).toFixed(2)} kg per week</span>`}</div>
        <div class="legend"><span><i class="raw"></i>Weigh-ins</span><span><i class="trend"></i>Trend</span>
          ${bands.some((b) => b.phase === "bulk") ? `<span><i class="bulk"></i>Bulk</span>` : ""}${bands.some((b) => b.phase === "cut") ? `<span><i class="cut"></i>Cut</span>` : ""}</div>
        ${weightChart(points, bands, { from: from && points.length ? from : null })}
        <div class="chips">${rangeChips("bw-range", range)}</div>`
        : `<p class="small muted" style="margin:6px 0 0">No weigh-ins yet. Log one at the top of a workout or under Weigh-ins.</p>`}
    </section>`;
}

/** The weigh-ins: a form to add one, and the list, newest first. Swiping a weigh-in to the left
 *  reveals Delete. */
export function bodyView() {
  const list = weighIns().reverse();
  const today = localIso(new Date()).slice(0, 10);
  const body = `
    <section class="card">
      <div class="eyebrow">Add a weigh-in</div>
      <div class="weigh-form" style="margin-top:8px">
        <input class="search" type="date" id="weigh-date" value="${today}" max="${today}">
        <input class="search num" id="weigh-kg" inputmode="decimal" placeholder="${fmtKg(bodyweight())} kg">
        <button class="btn small primary" data-action="weigh-add">Add</button>
      </div>
      <p class="small muted" style="margin:8px 0 0">The latest weigh-in is the bodyweight for pull-ups, dips and other bodyweight exercises.</p>
    </section>
    <section class="card">
      <div class="eyebrow">Phase from today</div>
      <div class="chips" style="margin-top:8px">${Object.entries(PHASES).map(([key, label]) =>
        `<button class="chip ${(currentPhase()?.phase ?? "maintain") === key ? "on" : ""}" data-action="phase" data-p="${key}">${label}</button>`).join("")}</div>
      ${(state.program.phases ?? []).length ? `<div class="list" style="margin-bottom:0">${(state.program.phases ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)).map((p) => `
        <div class="weigh" data-swipe>
          <span class="grow">${PHASES[p.phase]} from ${fmtDate(new Date(`${p.date}T12:00:00`), { day: "numeric", month: "short", year: "numeric" })}</span>
          <button class="swipe-del" data-action="phase-del" data-date="${p.date}">Delete</button>
        </div>`).join("")}</div>` : ""}
    </section>
    ${list.length ? `<div class="eyebrow section-title">${plural(list.length, "weigh-in")} · swipe left to delete</div>
    <div class="list">${list.map((w) => `
      <div class="weigh" data-swipe>
        <span class="grow">${fmtDate(new Date(`${w.date}T12:00:00`), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        <b class="num">${fmtKg(w.kg)} kg</b>
        <button class="swipe-del" data-action="weigh-del" data-date="${w.date}">Delete</button>
      </div>`).join("")}</div>` : ""}`;
  return { title: "Bodyweight", back: "#progress", body };
}

/** The exercises of the one-rep-max dashboard: reorder, remove, add, or return to the automatic choice. */
export function trackedView() {
  const list = chosenTracked();
  const own = Boolean(state.program.tracked);
  const body = `
    <p class="small muted" style="margin:4px 4px 0">${own ? "Your choice of exercises for the dashboard." : "Chosen automatically: squat, bench press and deadlift, then the exercises you logged most in the last half year. Any change here makes it your own choice."}</p>
    <div class="list">${list.map((id, i) => `
      <div class="tpl-row"><div class="row">
        <span class="grow ellipsis tpl-name">${esc(exercise(id).name)}</span>
        <button class="icon-btn" data-action="tracked-move" data-i="${i}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button>
        <button class="icon-btn" data-action="tracked-remove" data-i="${i}" aria-label="Remove">✕</button>
      </div></div>`).join("") || `<div class="empty">No exercises</div>`}</div>
    <button class="btn block primary" data-action="tracked-add">+ Add exercise</button>
    ${own ? `<button class="btn block" style="margin-top:8px" data-action="tracked-auto">Use the automatic choice</button>` : ""}`;
  return { title: "Dashboard exercises", back: "#progress", body };
}

/** Change the user's list, starting from the automatic one on the first change. */
function changeTracked(change) {
  const list = chosenTracked();
  change(list);
  state.program.tracked = list;
  return saveProgram();
}
actions["tracked-move"] = ({ i }) => changeTracked((list) => { [list[+i - 1], list[+i]] = [list[+i], list[+i - 1]]; });
actions["tracked-remove"] = ({ i }) => changeTracked((list) => { list.splice(+i, 1); });
actions["tracked-add"] = () => openSheet({
  title: "Add to the dashboard", first: [], exclude: chosenTracked(),
  pick: async (id) => { await changeTracked((list) => { list.push(id); }); closeSheet(); },
});
actions["tracked-auto"] = () => {
  delete state.program.tracked;
  return saveProgram();
};

actions["bw-range"] = ({ v }) => { state.ui.bwRange = v; };
/** Start a phase today, replacing a phase change made earlier today. */
actions.phase = ({ p }) => {
  const today = localIso(new Date()).slice(0, 10);
  state.program.phases = [...(state.program.phases ?? []).filter((x) => x.date !== today), { date: today, phase: p }];
  return saveProgram();
};
actions["phase-del"] = ({ date }) => {
  state.program.phases = (state.program.phases ?? []).filter((x) => x.date !== date);
  return saveProgram();
};
actions["weigh-add"] = () => {
  const date = document.getElementById("weigh-date").value;
  const kg = parseFloat(document.getElementById("weigh-kg").value.replace(",", "."));
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || !(kg > 0)) {
    toast("Enter a date and a weight");
    return "keep";
  }
  return setWeight(date, Math.round(kg * 10) / 10);
};
actions["weigh-del"] = ({ date }) => setWeight(date, null);

actions["progress-ex"] = ({ id }) => { state.ui.progressEx = id; };
actions["progress-range"] = ({ v }) => { state.ui.progressRange = v; };
