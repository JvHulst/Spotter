// Today: the active split with its suggested training day, the user's own templates, and the
// plan of the chosen day with each exercise's planned load. Also the template editor.

import { state, exercise, saveProgram } from "../state.js";
import { template, splits, activeSplit, rotation, ownTemplate, createTemplate, addTemplateSlot, replaceTemplateSlot } from "../program.js";
import { suggestedTemplateId, dayPlan, planFor, startWorkout } from "../workout.js";
import { sessionsWithin } from "../history.js";
import { actions, ask, esc, fmtKg, since, modeBadge, icon } from "../ui.js";
import { openSheet, closeSheet } from "./sheet.js";

export function today() {
  const suggested = suggestedTemplateId();
  const own = state.program.custom;
  const chosen = [...rotation(), ...own.map((t) => t.id)].includes(state.ui.day) ? state.ui.day : suggested;
  const t = template(chosen);
  const last = state.sessions.at(-1);
  const perWeek = sessionsWithin(state.sessions, new Date(), 28) / 4;
  const split = activeSplit();

  const resume = state.active ? `
    <a class="card row" href="#workout" style="text-decoration:none;color:inherit">
      <div class="grow"><div class="eyebrow">In progress</div><h2>${esc(state.active.name)}</h2></div>
      <span class="btn primary">Resume</span>
    </a>` : "";

  const rows = dayPlan(t).map(({ slot, id }) => {
    const plan = planFor(id, slot.sets);
    const first = plan.sets[0];
    const load = first.kg == null ? "choose" : `${fmtKg(first.kg)} kg`;
    return `
      <div class="plan-row">
        <div class="grow"><div class="eyebrow">${esc(slot.name ?? exercise(id).muscle)}</div><div class="ellipsis">${esc(exercise(id).name)}</div></div>
        <div class="target num">${load}<div class="small muted">${slot.sets} × ${first.reps}</div></div>
        <div>${modeBadge(plan.mode)}</div>
      </div>`;
  }).join("");

  const chip = (id, label) => `<button class="chip ${id === t.id ? "on" : ""}" data-action="pick-day" data-id="${id}">${esc(label)}</button>`;
  const days = rotation().map((id) => chip(id, `${template(id).name}${id === suggested ? " · next" : ""}`)).join("");
  const mine = own.map((x) => chip(x.id, x.name)).join("");

  const welcome = state.sessions.length ? "" : `
    <section class="card">
      <h2>Welcome to Spotter</h2>
      <p class="muted" style="margin:4px 0 0">Pick a training day and start. To bring in your history from the Strong app,
      export it there as CSV and import the file in <a href="#setup">Settings</a>.</p>
    </section>`;

  const body = `
    ${resume}${welcome}
    <div class="stats">
      <div class="stat"><b class="num">${!last ? "–" : since(new Date(last.start)) === "0 d" ? "today" : `${since(new Date(last.start))} ago`}</b><span>last workout</span></div>
      <div class="stat"><b class="num">${perWeek.toFixed(1)}</b><span>workouts per week, last 4 weeks</span></div>
      <div class="stat"><b class="num">${state.sessions.length}</b><span>workouts logged</span></div>
    </div>
    <button class="card row split-row" data-action="toggle-splits">
      <div class="grow"><div class="eyebrow">Split</div><b>${esc(split.name)}</b>
        <span class="small muted"> · ${esc(split.perWeek)} a week</span></div>
      <span class="small muted">${state.ui.showSplits ? "Close" : "Change"}</span>
    </button>
    ${state.ui.showSplits ? splitList() : ""}
    <div class="chips">${days}<span class="chip-gap"></span>${mine}<button class="chip" data-action="new-template">+ Template</button></div>
    <section class="card">
      <div class="row">
        <div class="grow">
          <div class="eyebrow">${t.custom ? "Your template" : t.id === suggested ? "Next up" : "Chosen day"}</div>
          <h2>${esc(t.name)}</h2>
        </div>
        ${t.custom ? `<a class="btn small" href="#template-${t.id}">Edit</a>` : ""}
      </div>
      <div class="small muted">${t.slots.length} exercises · ${t.slots.reduce((n, s) => n + s.sets, 0)} working sets</div>
      <div style="margin-top:8px">${rows || `<div class="empty">No exercises yet</div>`}</div>
      ${state.active ? "" : `<button class="btn primary block" style="margin-top:12px" data-action="start" data-id="${t.id}">Start workout</button>`}
    </section>
    ${state.active ? "" : `<button class="btn block" data-action="start-empty">Start an empty workout</button>`}`;
  return { title: "Today", tab: "today", body };
}

export const settingsLink = () => `<a class="icon-btn" href="#setup" aria-label="Settings">${icon.settings}</a>`;

function splitList() {
  return `<div class="list">${splits().map((s) => `
    <button data-action="pick-split" data-id="${s.id}">
      <div class="grow">
        <div class="title">${esc(s.name)} <span class="small muted">· ${esc(s.perWeek)}</span></div>
        <div class="small muted">${esc(s.about)}</div>
      </div>
      ${s.id === activeSplit().id ? `<span class="badge mode-up">Active</span>` : ""}
    </button>`).join("")}</div>`;
}

/** Editor of one of the user's templates: name, exercises with their sets, and order. */
export function templateView(id) {
  const t = ownTemplate(id);
  if (!t) return { title: "Template", back: "#today", body: `<div class="empty">Template not found</div>` };
  const rows = t.slots.map((slot, i) => `
    <div class="tpl-row">
      <button class="grow ellipsis tpl-name" data-action="tpl-swap" data-id="${id}" data-i="${i}">${esc(exercise(slot.ex)?.name ?? slot.ex)}</button>
      <div class="mini-stepper">
        <button data-action="tpl-sets" data-id="${id}" data-i="${i}" data-d="-1" aria-label="Fewer sets">−</button>
        <span class="num">${slot.sets}</span>
        <button data-action="tpl-sets" data-id="${id}" data-i="${i}" data-d="1" aria-label="More sets">+</button>
      </div>
      <button class="icon-btn" data-action="tpl-move" data-id="${id}" data-i="${i}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button>
      <button class="icon-btn" data-action="tpl-remove" data-id="${id}" data-i="${i}" aria-label="Remove">✕</button>
    </div>`).join("");
  const body = `
    <div class="field-label">Name</div>
    <input class="search" value="${esc(t.name)}" data-change="tpl-name" data-id="${id}">
    <div class="field-label" style="margin-top:16px">Exercises and working sets</div>
    <div class="list">${rows || `<div class="empty">No exercises yet</div>`}</div>
    <button class="btn block primary" data-action="tpl-add" data-id="${id}">+ Add exercise</button>
    <button class="btn block" style="margin-top:8px" data-action="start" data-id="${id}" ${state.active ? "disabled" : ""}>Start workout</button>
    <button class="btn block danger" style="margin-top:8px" data-action="tpl-delete" data-id="${id}">Delete template</button>`;
  return { title: t.name, back: "#today", body };
}

actions["pick-day"] = ({ id }) => { state.ui.day = id; };
actions["toggle-splits"] = () => { state.ui.showSplits = !state.ui.showSplits; };
actions["pick-split"] = async ({ id }) => {
  state.program.split = id;
  Object.assign(state.ui, { showSplits: false, day: null });
  await saveProgram();
};
actions.start = async ({ id }) => {
  await startWorkout(id);
  state.ui.day = null;
  location.hash = "#workout";
};
actions["start-empty"] = async () => {
  await startWorkout(null);
  location.hash = "#workout";
};
actions["new-template"] = async () => {
  const id = createTemplate("New template");
  await saveProgram();
  state.ui.day = id;
  location.hash = `#template-${id}`;
};
actions["tpl-name"] = (d, el) => {
  ownTemplate(d.id).name = el.value.trim() || "Template";
  return saveProgram();
};
actions["tpl-sets"] = ({ id, i, d }) => {
  const slot = ownTemplate(id).slots[+i];
  slot.sets = Math.min(10, Math.max(1, slot.sets + +d));
  return saveProgram();
};
actions["tpl-move"] = ({ id, i }) => {
  const slots = ownTemplate(id).slots;
  [slots[+i - 1], slots[+i]] = [slots[+i], slots[+i - 1]];
  return saveProgram();
};
actions["tpl-remove"] = ({ id, i }) => {
  ownTemplate(id).slots.splice(+i, 1);
  return saveProgram();
};
actions["tpl-add"] = ({ id }) => openSheet({
  title: "Add exercise", first: [], exclude: ownTemplate(id).slots.map((s) => s.ex),
  pick: async (ex) => { addTemplateSlot(ownTemplate(id), ex); await saveProgram(); closeSheet(); },
});
actions["tpl-swap"] = ({ id, i }) => {
  const t = ownTemplate(id);
  const ex = exercise(t.slots[+i].ex);
  openSheet({
    title: "Replace exercise", first: [], exclude: t.slots.map((s) => s.ex), patternId: ex?.pattern,
    pattern: state.library.patterns.get(ex?.pattern)?.label ?? "",
    pick: async (next) => { replaceTemplateSlot(t, +i, next); await saveProgram(); closeSheet(); },
  });
};
actions["tpl-delete"] = async ({ id }) => {
  if (!(await ask("Delete this template? Logged workouts are kept.", { ok: "Delete", danger: true }))) return;
  state.program.custom = state.program.custom.filter((t) => t.id !== id);
  state.ui.day = null;
  await saveProgram();
  location.hash = "#today";
};
