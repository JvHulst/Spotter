// History: logged sessions by month with their exercises and best sets, and the page of one
// session, which can also be edited.

import { state, exercise, bodyweight, saveSessions, deleteSession } from "../state.js";
import { working, volumeOf, bestSet, setCount, setE1rm, sessionBest } from "../history.js";
import { actions, ask, choose, esc, fmtDate, fmtKg, plural, ordinal, toast, RECORD_LABEL } from "../ui.js";
import { setTypes, SET_TYPE_LABEL } from "../program.js";
import { openSheet, closeSheet } from "./sheet.js";

const PAGE = 30;
/** "W", "D" or "M" for warm-ups, drop sets and myo-reps mini-sets; working sets are numbered. */
const setLabel = (x) => (x.warmup ? "W" : x.type === "drop" ? "D" : x.type === "myo" ? "M" : null);
const time = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** A set in words: "100 kg × 5", "+10 kg × 8" for added weight, "12 reps" without weight. */
function setText(s, ex) {
  if (!s) return "";
  if (!s.kg) return `${s.reps} reps`;
  return `${ex?.load === "add" ? "+" : ex?.load === "subtract" ? "−" : ""}${fmtKg(s.kg)} kg × ${s.reps}`;
}

export function historyView() {
  const shown = state.sessions.slice().reverse().slice(0, state.ui.historyLimit ?? PAGE);
  if (!shown.length) return { title: "History", tab: "log", body: `<div class="empty">No workouts yet</div>` };
  let month = "";
  const parts = [];
  for (const s of shown) {
    const date = new Date(s.start);
    const m = fmtDate(date, { month: "long", year: "numeric" });
    if (m !== month) {
      parts.push(`<div class="eyebrow section-title">${esc(m)}</div>`);
      month = m;
    }
    const sets = s.exercises.flatMap((e) => working(e.sets));
    const prs = state.records.get(s.id)?.length ?? 0;
    const lines = s.exercises.map((e) => {
      const ex = exercise(e.ex);
      const work = working(e.sets);
      const extra = work.some((x) => x.type === "drop") ? " + drop" : work.some((x) => x.type === "myo") ? " + myo" : "";
      return `<div class="hist-line"><span class="ellipsis">${work.filter((x) => !x.type).length} × ${esc(ex?.name ?? e.ex)}${extra}</span>
        <span class="num muted">${esc(setText(ex && bestSet(work, ex, bodyweight()), ex))}</span></div>`;
    }).join("");
    parts.push(`
      <a class="card hist" href="#session-${encodeURIComponent(s.id)}">
        <div class="row">
          <div class="grow"><b>${esc(s.name)}</b>
            <div class="small muted">${fmtDate(date)} · ${time(date)}${s.durationMin ? ` · ${s.durationMin} min` : ""}</div></div>
          ${prs ? `<span class="pr-badge">${plural(prs, "PR")}</span>` : ""}
        </div>
        <div class="small muted hist-meta">${plural(setCount(sets), "working set")} · ${Math.round(volumeOf(sets)).toLocaleString()} kg</div>
        ${lines}
      </a>`);
  }
  const more = state.sessions.length > shown.length ? `<button class="btn block" data-action="more-history">Show more</button>` : "";
  return { title: "History", tab: "log", body: parts.join("") + more };
}

/** The screen after finishing a workout: its number, its stats and its records. */
export function summaryView(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return sessionView(id);
  const work = s.exercises.flatMap((e) => working(e.sets));
  const prs = state.records.get(id) ?? [];
  const unit = (r) => `${Math.round(r.value).toLocaleString()} kg`;
  const lines = prs.map((r) => `<div class="plan-row"><span>${esc(exercise(r.ex)?.name ?? r.ex)}</span><b class="num pr-val">${RECORD_LABEL[r.kind]} ${unit(r)}</b></div>`).join("");
  return {
    title: "Workout done",
    body: `
      <div class="well-done">
        <h2>Well done!</h2>
        <p>You completed your ${ordinal(state.sessions.findIndex((x) => x.id === id) + 1)} workout.</p>
      </div>
      <div class="stats">
        <div class="stat"><b class="num">${s.durationMin ?? "–"}</b><span>minutes</span></div>
        <div class="stat"><b class="num">${setCount(work)}</b><span>working sets</span></div>
        <div class="stat"><b class="num">${Math.round(volumeOf(work)).toLocaleString()}</b><span>kg volume</span></div>
      </div>
      ${prs.length ? `<section class="card"><div class="eyebrow">${plural(prs.length, "personal record")}</div>${lines}</section>` : ""}
      <a class="btn block primary" href="#today">Done</a>
      <a class="btn block" style="margin-top:8px" href="#session-${encodeURIComponent(id)}">View workout</a>`,
  };
}

export function sessionView(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return { title: "Workout", back: "#history", body: `<div class="empty">Workout not found</div>` };
  const editing = state.ui.editing === id;
  const date = new Date(s.start);
  const work = s.exercises.flatMap((e) => working(e.sets));
  const prs = state.records.get(id) ?? [];
  const cards = s.exercises.map((e, i) => (editing ? editCard(e, i) : viewCard(e, prs))).join("");
  const header = editing ? `
    <div class="field-label">Name</div>
    <input class="search" value="${esc(s.name)}" data-change="s-field" data-f="name">
    <div class="fields" style="margin-top:4px">
      <div><div class="field-label">Start</div><input class="search" type="datetime-local" value="${s.start.slice(0, 16)}" data-change="s-field" data-f="start"></div>
      <div><div class="field-label">Minutes</div><input class="search num" inputmode="numeric" value="${s.durationMin ?? ""}" data-change="s-field" data-f="durationMin"></div>
    </div>` : `
    <div class="eyebrow" style="margin-top:8px">${fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${time(date)}</div>
    <div class="stats">
      <div class="stat"><b class="num">${s.durationMin ?? "–"}</b><span>minutes</span></div>
      <div class="stat"><b class="num">${setCount(work)}</b><span>working sets</span></div>
      <div class="stat"><b class="num">${Math.round(volumeOf(work)).toLocaleString()}</b><span>kg volume</span></div>
    </div>
    ${prs.length ? `<div class="pr-strip">${plural(prs.length, "personal record")}</div>` : ""}`;
  const footer = editing ? `
    <button class="btn block" data-action="s-add-ex">+ Add exercise</button>
    <button class="btn block danger" style="margin-top:8px" data-action="delete-session" data-id="${esc(id)}">Delete workout</button>` : "";
  return {
    title: s.name, back: "#history", body: header + cards + footer,
    right: `<button class="btn small ${editing ? "primary" : ""}" data-action="s-edit" data-id="${esc(id)}">${editing ? "Done" : "Edit"}</button>`,
  };
}

function viewCard(e, prs) {
  const ex = exercise(e.ex);
  let n = 0;
  const mine = prs.filter((r) => r.ex === e.ex);
  const isPr = (kind) => mine.some((r) => r.kind === kind);
  const best = ex && working(e.sets).length ? sessionBest(working(e.sets), ex, bodyweight()) : null;
  const rows = e.sets.map((x) => `
    <div class="set static ${x.warmup ? "warm" : ""} ${x.type ? "fin" : ""}"><div class="set-main">
      <span class="idx">${setLabel(x) ?? ++n}</span>
      <span class="val num">${fmtKg(x.kg)} kg × ${x.reps}</span>
      <span class="rir">${x.rir != null ? `RIR ${x.rir}` : ""}</span>
      <span class="e1rm num">${ex && !x.warmup && !x.type ? `1RM ${Math.round(setE1rm(x, ex, bodyweight()))}` : ""}</span>
    </div></div>`).join("");
  const stat = (label, value, kind) => `<span class="${isPr(kind) ? "pr-val" : ""}">${label} <b class="num">${value}</b>${isPr(kind) ? " PR" : ""}</span>`;
  return `<section class="ex-card"><div class="ex-head">
      <a class="name" style="color:inherit;text-decoration:none" href="#exercise-${e.ex}">${esc(ex?.name ?? e.ex)}</a>
      ${best ? `<div class="best small">${stat("Best 1RM", `${Math.round(best.e1rm)} kg`, "e1rm")}${stat("Volume", `${Math.round(best.volume).toLocaleString()} kg`, "volume")}</div>` : ""}
      ${isPr("weight") ? `<div class="pr-tags"><span class="pr-badge">${RECORD_LABEL.weight} PR</span></div>` : ""}
      ${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ""}</div>${rows}</section>`;
}

function editCard(e, i) {
  const field = (s, f, value) => `<input class="cell num" inputmode="decimal" value="${value ?? ""}" placeholder="–" data-change="s-set" data-e="${i}" data-s="${s}" data-f="${f}">`;
  let n = 0;
  const rows = e.sets.map((x, s) => `
    <div class="edit-set">
      <button class="idx-btn ${x.warmup ? "warm" : ""} ${x.type ? "fin" : ""}" data-action="s-type" data-e="${i}" data-s="${s}" aria-label="Change set type">${setLabel(x) ?? ++n}</button>
      ${field(s, "kg", x.kg)}<span class="muted">kg ×</span>${field(s, "reps", x.reps)}<span class="muted">RIR</span>${field(s, "rir", x.rir)}
      <button class="icon-btn" data-action="s-del-set" data-e="${i}" data-s="${s}" aria-label="Remove set">✕</button>
    </div>`).join("");
  return `<section class="ex-card"><div class="ex-head"><div class="name">${esc(exercise(e.ex)?.name ?? e.ex)}</div></div>
    ${rows}
    <div class="ex-foot"><button class="btn small" data-action="s-add-set" data-e="${i}">+ Set</button><span class="grow"></span>
      <button class="btn small" data-action="s-del-ex" data-e="${i}">Remove</button></div></section>`;
}

/** Apply a change to the open session and save it, marking it as edited for sync. */
async function edit(change) {
  const s = structuredClone(state.sessions.find((x) => x.id === state.ui.editing));
  change(s);
  s.exercises = s.exercises.filter((e) => e.sets.length);
  s.editedAt = Date.now();
  await saveSessions([s]);
}

actions["more-history"] = () => { state.ui.historyLimit = (state.ui.historyLimit ?? PAGE) + PAGE; };
actions["s-edit"] = ({ id }) => { state.ui.editing = state.ui.editing === id ? null : id; };
actions["s-field"] = ({ f }, el) => edit((s) => {
  if (f === "name") s.name = el.value.trim() || s.name;
  if (f === "start" && el.value) s.start = `${el.value}:00`.slice(0, 19);
  if (f === "durationMin") s.durationMin = Number.parseInt(el.value, 10) || null;
});
actions["s-set"] = ({ e, s: i, f }, el) => edit((s) => {
  const set = s.exercises[+e].sets[+i];
  const v = parseFloat(el.value.replace(",", "."));
  if (f === "rir") {
    if (Number.isFinite(v)) set.rir = Math.max(0, Math.round(v));
    else delete set.rir;
  } else if (Number.isFinite(v)) set[f] = f === "reps" ? Math.round(v) : v;
});
// A tap on the set number opens a picker of the set types.
actions["s-type"] = async ({ e, s: i }) => {
  const entry = state.sessions.find((x) => x.id === state.ui.editing).exercises[+e];
  const current = entry.sets[+i].warmup ? "warmup" : entry.sets[+i].type ?? "work";
  const pick = await choose("Set type", setTypes(entry.ex).map((t) => ({ key: t || "work", label: SET_TYPE_LABEL[t || "work"], on: (t || "work") === current })));
  if (!pick || pick === current) return "keep";
  return edit((s) => {
    const target = s.exercises[+e].sets[+i];
    delete target.warmup;
    delete target.type;
    if (pick === "warmup") target.warmup = true;
    else if (pick !== "work") target.type = pick;
  });
};
actions["s-del-set"] = ({ e, s: i }) => edit((s) => { s.exercises[+e].sets.splice(+i, 1); });
actions["s-add-set"] = ({ e }) => edit((s) => {
  const sets = s.exercises[+e].sets;
  const last = sets.at(-1);
  sets.push({ kg: last?.kg ?? 0, reps: last?.reps ?? 8 });
});
actions["s-del-ex"] = async ({ e }) => {
  if (await ask("Remove this exercise and its sets from the workout?", { ok: "Remove", danger: true })) return edit((s) => { s.exercises.splice(+e, 1); });
};
actions["s-add-ex"] = () => openSheet({
  title: "Add exercise", first: [], exclude: [],
  pick: async (id) => {
    await edit((s) => { s.exercises.push({ ex: id, sets: [{ kg: 0, reps: 8 }] }); });
    closeSheet();
  },
});
actions["delete-session"] = async ({ id }) => {
  if (!(await ask("Delete this workout?", { ok: "Delete", danger: true }))) return;
  await deleteSession(id);
  state.ui.editing = null;
  toast(`Deleted, ${plural(state.sessions.length, "workout")} left`);
  location.hash = "#history";
};
