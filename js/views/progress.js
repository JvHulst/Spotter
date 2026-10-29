// Progress: workouts per week, estimated one-rep max per exercise, weekly sets per muscle,
// weekly volume and recent records.

import { state, exercise, bodyweight, weighIns, setWeight } from "../state.js";
import { STRENGTH_LIFTS } from "../program.js";
import { weeklyStats, exerciseSeries } from "../history.js";
import { MUSCLES, MINOR_MUSCLES } from "../library.js";
import { lineChart, barChart, sparkline, heatmap, compact, rangeStart, rangeChips } from "../charts.js";
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

/** Exercises worth tracking: squat, bench press and deadlift when ever logged, then the most
 *  used exercises of the last half year, eight at most. */
function trackedExercises() {
  const used = [...state.usage.entries()].filter(([id, u]) => u.recent >= 3 && exercise(id)?.increment > 0)
    .sort((a, b) => b[1].recent - a[1].recent).map(([id]) => id);
  return [...new Set([...[...STRENGTH_LIFTS].filter((id) => state.index.has(id)), ...used])].slice(0, 8);
}

function strengthSection(now) {
  const tracked = trackedExercises();
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
      <div class="eyebrow">Estimated one-rep max</div>
      <div class="tiles">${tiles}</div>
      <div class="row" style="margin-top:12px">
        <b class="grow ellipsis">${esc(exercise(pick).name)}</b>
        <div class="chips">${rangeChips("progress-range", range)}</div>
      </div>
      ${lineChart(points, { from: from && points.length ? from : null })}
      <a class="small" href="#exercise-${pick}" style="color:var(--accent-text)">Records and history ›</a>
    </section>`;
}

/** Bodyweight over time from the weigh-ins, with the latest one and its change over 4 weeks. */
function bodyweightCard(now) {
  const all = weighIns().map((w) => ({ date: new Date(`${w.date}T12:00:00`), value: w.kg }));
  const range = state.ui.bwRange ?? "3M";
  const from = rangeStart(range, now);
  const points = all.filter((p) => !from || p.date >= from).map((p) => ({ ...p, tip: `${fmtDate(p.date)}: ${fmtKg(p.value)} kg` }));
  const last = all.at(-1);
  const before = all.findLast((p) => (now - p.date) / DAY_MS >= 28);
  const change = last && before ? Math.round((last.value - before.value) * 10) / 10 : null;
  return `
    <section class="card">
      <div class="row"><div class="eyebrow grow">Bodyweight</div><a class="small link-text" href="#body">Weigh-ins ›</a></div>
      ${last ? `<div class="row" style="gap:8px;align-items:baseline;margin-top:6px"><b class="tile-value">${fmtKg(last.value)}</b><span class="small muted">kg</span>
        ${change == null ? "" : `<span class="small muted">${change > 0 ? "+" : ""}${fmtKg(change)} kg in 4 weeks</span>`}</div>
        ${lineChart(points, { from: from && points.length ? from : null })}
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
    ${list.length ? `<div class="eyebrow section-title">${plural(list.length, "weigh-in")} · swipe left to delete</div>
    <div class="list">${list.map((w) => `
      <div class="weigh" data-swipe>
        <span class="grow">${fmtDate(new Date(`${w.date}T12:00:00`), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        <b class="num">${fmtKg(w.kg)} kg</b>
        <button class="swipe-del" data-action="weigh-del" data-date="${w.date}">Delete</button>
      </div>`).join("")}</div>` : ""}`;
  return { title: "Bodyweight", back: "#progress", body };
}

actions["bw-range"] = ({ v }) => { state.ui.bwRange = v; };
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
