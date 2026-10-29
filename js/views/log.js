// History: logged sessions by month, and the detail of one session.

import { state, exercise, reindex } from "../state.js";
import { sessionStore } from "../db.js";
import { actions, ask, esc, fmtDate, fmtKg, plural, toast } from "../ui.js";

const PAGE = 40;

export function historyView() {
  const shown = state.sessions.slice().reverse().slice(0, state.ui.historyLimit ?? PAGE);
  if (!shown.length) return { title: "History", tab: "log", body: `<div class="empty">No workouts yet</div>` };
  let month = "";
  const parts = [];
  for (const s of shown) {
    const date = new Date(s.start);
    const m = fmtDate(date, { month: "long", year: "numeric" });
    if (m !== month) {
      if (month) parts.push("</div>");
      parts.push(`<div class="eyebrow section-title">${esc(m)}</div><div class="list">`);
      month = m;
    }
    const sets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.warmup).length, 0);
    parts.push(`
      <a href="#session-${encodeURIComponent(s.id)}">
        <div class="grow">
          <div class="title">${esc(s.name)}</div>
          <div class="small muted ellipsis">${s.exercises.map((e) => esc(exercise(e.ex)?.name ?? e.ex)).join(" · ")}</div>
        </div>
        <div class="small muted num" style="text-align:right">${fmtDate(date, { weekday: "short", day: "numeric" })}<br>${sets} sets</div>
      </a>`);
  }
  parts.push("</div>");
  const more = state.sessions.length > shown.length ? `<button class="btn block" data-action="more-history">Show more</button>` : "";
  return { title: "History", tab: "log", body: parts.join("") + more };
}

export function sessionView(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return { title: "Workout", back: "#history", body: `<div class="empty">Workout not found</div>` };
  const date = new Date(s.start);
  const work = s.exercises.flatMap((e) => e.sets.filter((x) => !x.warmup));
  const volume = work.reduce((v, x) => v + x.kg * x.reps, 0);
  const cards = s.exercises.map((e) => {
    let n = 0;
    const rows = e.sets.map((x) => `
      <div class="set ${x.warmup ? "warm" : ""}"><div class="set-main">
        <span class="idx">${x.warmup ? "W" : ++n}</span>
        <span class="val num">${fmtKg(x.kg)} kg × ${x.reps}</span>
        <span class="rir">${x.rir != null ? `RIR ${x.rir}` : ""}</span>
      </div></div>`).join("");
    return `<section class="ex-card"><div class="ex-head"><a class="name" style="color:inherit;text-decoration:none" href="#exercise-${e.ex}">${esc(exercise(e.ex)?.name ?? e.ex)}</a>
      ${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ""}</div>${rows}</section>`;
  }).join("");
  const body = `
    <div class="eyebrow" style="margin-top:8px">${fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
    <div class="stats">
      <div class="stat"><b class="num">${s.durationMin ?? "–"}</b><span>minutes</span></div>
      <div class="stat"><b class="num">${work.length}</b><span>working sets</span></div>
      <div class="stat"><b class="num">${Math.round(volume).toLocaleString()}</b><span>kg volume</span></div>
    </div>
    ${cards}
    ${s.source === "app" ? `<button class="btn block danger" data-action="delete-session" data-id="${esc(s.id)}">Delete workout</button>` : ""}`;
  return { title: s.name, back: "#history", body };
}

actions["more-history"] = () => { state.ui.historyLimit = (state.ui.historyLimit ?? PAGE) + PAGE; };
actions["delete-session"] = async ({ id }) => {
  if (!(await ask("Delete this workout?", { ok: "Delete", danger: true }))) return;
  state.sessions = state.sessions.filter((x) => x.id !== id);
  await sessionStore.delete(id);
  reindex();
  toast(`Deleted, ${plural(state.sessions.length, "workout")} left`);
  location.hash = "#history";
};
