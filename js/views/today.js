// Today: the plan of the next training day with each exercise's planned load, and a panel for
// every workout to choose from: the days of the active split, the user's templates and an
// empty workout. Tapping a panel offers Start, Show plan and Edit. Also the template editor,
// which edits the user's templates and their own versions of built-in days.

import { state, exercise, saveProgram } from "../state.js";
import { template, splits, activeSplit, rotation, dayPlan, ownTemplate, createTemplate, addTemplateSlot, replaceTemplateSlot,
  forkDay, resetDay, allowsFinisher, FINISHERS, FINISHER_LABEL } from "../program.js";
import { suggestedTemplateId, planFor, startWorkout } from "../workout.js";
import { sessionsWithin } from "../history.js";
import { actions, ask, choose, esc, fmtKg, since, modeBadge, icon } from "../ui.js";
import { openSheet, closeSheet } from "./sheet.js";

export function today() {
  const suggested = suggestedTemplateId();
  const own = state.program.custom.filter((x) => !x.fork);
  const chosen = [...rotation(), ...own.map((x) => x.id)].includes(state.ui.day) ? state.ui.day : suggested;
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
        <div class="target num">${load}<div class="small muted">${slot.sets} × ${first.reps}${slot.finisher && allowsFinisher(id) ? ` + ${slot.finisher === "drop" ? "drop" : "myo"}` : ""}</div></div>
        <div>${modeBadge(plan.mode)}</div>
      </div>`;
  }).join("");

  const panel = (id) => {
    const x = template(id);
    const names = dayPlan(x).slice(0, 4).map(({ id: ex }) => esc(exercise(ex).name.replace(/ \(.*\)$/, "")));
    return `
      <button class="panel ${id === t.id ? "on" : ""}" data-action="panel" data-id="${id}">
        <div class="row" style="gap:6px"><b class="grow ellipsis">${esc(x.name)}</b>${id === suggested ? `<span class="next-badge">Next</span>` : ""}</div>
        <div class="small muted">${x.slots.length} exercises · ${x.slots.reduce((n, s) => n + s.sets, 0)} sets</div>
        <div class="small panel-list">${names.join("<br>") || "No exercises yet"}</div>
      </button>`;
  };

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
      <span class="small link-text">${state.ui.showSplits ? "Close" : "Change"}</span>
    </button>
    ${state.ui.showSplits ? splitList() : ""}
    <section class="card" id="plan">
      <div class="row">
        <div class="grow">
          <div class="eyebrow">${t.id === suggested ? "Next up" : "Chosen workout"}</div>
          <h2>${esc(t.name)}</h2>
        </div>
        <button class="btn small" data-action="edit-workout" data-id="${t.id}">Edit</button>
      </div>
      <div class="small muted">${t.slots.length} exercises · ${t.slots.reduce((n, s) => n + s.sets, 0)} working sets</div>
      <div style="margin-top:8px">${rows || `<div class="empty">No exercises yet</div>`}</div>
      ${state.active ? "" : `<button class="btn primary block" style="margin-top:12px" data-action="start" data-id="${t.id}">Start workout</button>`}
    </section>
    <div class="eyebrow section-title">${esc(split.name)}</div>
    <div class="panels">${rotation().map(panel).join("")}</div>
    <div class="eyebrow section-title">Your workouts</div>
    <div class="panels">
      ${own.map((x) => panel(x.id)).join("")}
      <button class="panel add" data-action="new-template">+ New template</button>
      ${state.active ? "" : `<button class="panel add" data-action="start-empty">Empty workout<span class="small muted">Add exercises as you go</span></button>`}
    </div>`;
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

/** A tapped panel: start the workout, show its plan at the top, or edit it. */
actions.panel = async ({ id }) => {
  const pick = await choose(template(id).name, [
    state.active ? { key: "resume", label: "Resume the workout in progress" } : { key: "start", label: "Start workout" },
    { key: "plan", label: "Show the plan" },
    { key: "edit", label: "Edit" },
  ]);
  if (pick === "start") return actions.start({ id });
  if (pick === "resume") location.hash = "#workout";
  if (pick === "plan") {
    state.ui.day = id;
    window.scrollTo(0, 0);
  }
  if (pick === "edit") return actions["edit-workout"]({ id });
};

/** Edit a template, or a built-in day through the user's own version of it. */
actions["edit-workout"] = async ({ id }) => {
  if (!ownTemplate(id)) {
    forkDay(id);
    await saveProgram();
  }
  location.hash = `#template-${id}`;
};

/** Editor of one of the user's templates: name, exercises with their sets, and order. */
export function templateView(id) {
  const t = ownTemplate(id);
  if (!t) return { title: "Template", back: "#today", body: `<div class="empty">Template not found</div>` };
  const rows = t.slots.map((slot, i) => `
    <div class="tpl-row">
      <div class="row">
        <button class="grow ellipsis tpl-name" data-action="tpl-swap" data-id="${id}" data-i="${i}">${esc(exercise(slot.ex)?.name ?? slot.ex)}</button>
        <button class="icon-btn" data-action="tpl-move" data-id="${id}" data-i="${i}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button>
        <button class="icon-btn" data-action="tpl-remove" data-id="${id}" data-i="${i}" aria-label="Remove">✕</button>
      </div>
      <div class="row tpl-opts">
        <div class="mini-stepper">
          <button data-action="tpl-sets" data-id="${id}" data-i="${i}" data-d="-1" aria-label="Fewer sets">−</button>
          <span class="num">${slot.sets} sets</span>
          <button data-action="tpl-sets" data-id="${id}" data-i="${i}" data-d="1" aria-label="More sets">+</button>
        </div>
        <button class="chip small ${slot.warmup === false ? "" : "on"}" data-action="tpl-warmup" data-id="${id}" data-i="${i}">Warm-up</button>
        ${allowsFinisher(slot.ex) ? `<button class="chip small ${slot.finisher ? "on" : ""}" data-action="tpl-finisher" data-id="${id}" data-i="${i}">${slot.finisher ? FINISHER_LABEL[slot.finisher] : "No finisher"}</button>` : ""}
      </div>
    </div>`).join("");
  const body = `
    <div class="field-label">Name</div>
    <input class="search" value="${esc(t.name)}" data-change="tpl-name" data-id="${id}">
    <div class="field-label" style="margin-top:16px">Exercises and working sets</div>
    <div class="list">${rows || `<div class="empty">No exercises yet</div>`}</div>
    <button class="btn block primary" data-action="tpl-add" data-id="${id}">+ Add exercise</button>
    <button class="btn block" style="margin-top:8px" data-action="start" data-id="${id}" ${state.active ? "disabled" : ""}>Start workout</button>
    ${t.fork
      ? `<button class="btn block" style="margin-top:8px" data-action="tpl-reset" data-id="${id}">Reset to the default ${esc(t.name)}</button>`
      : `<button class="btn block danger" style="margin-top:8px" data-action="tpl-delete" data-id="${id}">Delete template</button>`}`;
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
actions["tpl-warmup"] = ({ id, i }) => {
  const slot = ownTemplate(id).slots[+i];
  if (slot.warmup === false) delete slot.warmup;
  else slot.warmup = false;
  return saveProgram();
};
actions["tpl-finisher"] = ({ id, i }) => {
  const slot = ownTemplate(id).slots[+i];
  slot.finisher = FINISHERS[(FINISHERS.indexOf(slot.finisher ?? "") + 1) % FINISHERS.length];
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
actions["tpl-reset"] = async ({ id }) => {
  if (!(await ask("Undo your changes to this training day?", { ok: "Reset" }))) return;
  resetDay(id);
  await saveProgram();
  location.hash = "#today";
};
actions["tpl-delete"] = async ({ id }) => {
  if (!(await ask("Delete this template? Logged workouts are kept.", { ok: "Delete", danger: true }))) return;
  state.program.custom = state.program.custom.filter((t) => t.id !== id);
  state.ui.day = null;
  await saveProgram();
  location.hash = "#today";
};
