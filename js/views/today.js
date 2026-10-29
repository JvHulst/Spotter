// Today: the suggested training day with each slot's planned load, and recent activity.

import { state, template, exercise } from "../state.js";
import { suggestedTemplateId, planFor, startWorkout } from "../workout.js";
import { slotChoice, sessionsWithin } from "../history.js";
import { actions, esc, fmtKg, since, modeBadge } from "../ui.js";

export function today() {
  if (!state.program) return { title: "Overload", tab: "today", body: onboarding() };
  const suggested = suggestedTemplateId();
  const t = template(state.ui.day) ?? template(suggested);
  const last = state.sessions.at(-1);
  const perWeek = sessionsWithin(state.sessions, new Date(), 28) / 4;

  const resume = state.active ? `
    <a class="card row" href="#workout" style="text-decoration:none;color:inherit">
      <div class="grow"><div class="eyebrow">In progress</div><h2>${esc(state.active.name)}</h2></div>
      <span class="btn primary">Resume</span>
    </a>` : "";

  const rows = t.slots.map((slot) => {
    const id = slotChoice(slot, state.index);
    const plan = planFor(id, slot.sets);
    const first = plan.sets[0];
    const load = first.kg == null ? "choose" : `${fmtKg(first.kg)} kg`;
    return `
      <div class="plan-row">
        <div class="grow"><div class="eyebrow">${esc(slot.name)}</div><div class="ellipsis">${esc(exercise(id).name)}</div></div>
        <div class="target num">${load}<div class="small muted">${slot.sets} × ${first.reps}</div></div>
        <div>${modeBadge(plan.mode)}</div>
      </div>`;
  }).join("");

  const days = state.program.templates.map((x) => `
    <button class="chip ${x.id === t.id ? "on" : ""}" data-action="pick-day" data-id="${x.id}">
      ${esc(x.name)}${x.id === suggested ? " ·  next" : ""}</button>`).join("");

  const body = `
    ${resume}
    <div class="stats">
      <div class="stat"><b class="num">${!last ? "–" : since(new Date(last.start)) === "0 d" ? "today" : `${since(new Date(last.start))} ago`}</b><span>last workout</span></div>
      <div class="stat"><b class="num">${perWeek.toFixed(1)}</b><span>workouts per week, last 4 weeks</span></div>
      <div class="stat"><b class="num">${state.sessions.length}</b><span>workouts logged</span></div>
    </div>
    <div class="chips">${days}</div>
    <section class="card">
      <div class="eyebrow">${t.id === suggested ? "Next up" : "Chosen day"}</div>
      <h2>${esc(t.name)}</h2>
      <div class="small muted">${t.slots.reduce((n, s) => n + s.sets, 0)} working sets</div>
      <div style="margin-top:8px">${rows}</div>
      ${state.active ? "" : `<button class="btn primary block" style="margin-top:12px" data-action="start" data-id="${t.id}">Start workout</button>`}
    </section>`;
  return { title: "Today", tab: "today", body };
}

function onboarding() {
  return `
    <section class="card">
      <h2>Welcome to Overload</h2>
      <p class="muted">Load your program and training history to get started. In Settings, choose
      <b>Import files</b> and select <code>program.json</code>, <code>body.json</code> and the files in
      <code>sessions/</code> from your data folder.</p>
      <a class="btn primary block" href="#setup">Go to Settings</a>
    </section>`;
}

actions["pick-day"] = ({ id }) => { state.ui.day = id; };
actions.start = async ({ id }) => {
  await startWorkout(id);
  state.ui.day = null;
  location.hash = "#workout";
};
