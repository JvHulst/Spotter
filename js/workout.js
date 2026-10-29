// The active workout: planning its exercises, logging sets, rest periods and finishing.
//
// An active workout holds one entry per exercise, each with its planned sets. Warm-up sets
// come first and are excluded from progression. `focus` is the set being logged next.

import { planExercise, nextSetWeight, warmupSets, nextTemplateId } from "./progression.js";
import { state, exercise, pattern, bodyweight, saveActive, saveProgram, saveSessions } from "./state.js";
import { template, rotation, slotChoice, slotOptions, targetFor, restFor, ownTemplate, createTemplate, setTemplateSlots } from "./program.js";

export const suggestedTemplateId = () => nextTemplateId(rotation(), state.sessions);

/** Today's plan for an exercise, with nSets working sets. */
export function planFor(id, nSets) {
  return planExercise({
    ex: exercise(id), target: targetFor(id), history: state.index.get(id) ?? [],
    nSets, today: new Date(), bodyweight: bodyweight(),
  });
}

/** The exercise of each slot of a training day, with no exercise in two slots. */
export function dayPlan(t) {
  const taken = [];
  return t.slots.map((slot) => {
    const choice = slotChoice(slot);
    const id = taken.includes(choice) ? slotOptions(slot).find((x) => !taken.includes(x)) : choice;
    taken.push(id);
    return { slot, id };
  });
}

function entryFor(id, slot, nSets = slot?.sets ?? 3) {
  const plan = planFor(id, nSets);
  const warmups = warmupSets(plan.sets[0].kg, exercise(id), pattern(id).kind);
  return {
    ex: id, slot: slot?.id ?? null, superset: Boolean(slot?.superset), note: "",
    plan: { mode: plan.mode, reason: plan.reason },
    sets: [
      ...warmups.map((w) => ({ warmup: true, kg: w.kg, reps: w.reps, rir: null, done: false })),
      ...plan.sets.map((s) => ({ kg: s.kg, planKg: s.kg, reps: s.reps, planReps: s.reps, rir: plan.rir, done: false })),
    ],
  };
}

/** Start a training day or template, or an empty workout when templateId is null. */
export async function startWorkout(templateId) {
  const t = templateId ? template(templateId) : null;
  state.active = {
    id: `app-${Date.now().toString(36)}`, start: localIso(new Date()), template: t?.id ?? null, name: t?.name ?? "Workout",
    exercises: t ? dayPlan(t).map(({ slot, id }) => entryFor(id, slot)) : [],
    rest: null,
  };
  state.active.focus = firstOpen();
  await saveActive();
}

/** The first set not yet logged, scanning entries from `from` onward and wrapping around. */
function firstOpen(from = 0) {
  const list = state.active.exercises;
  for (let k = 0; k < list.length; k++) {
    const e = (from + k) % list.length;
    const s = list[e].sets.findIndex((x) => !x.done);
    if (s >= 0) return { e, s };
  }
  return null;
}

/** Index of the entry paired with entry e in a superset, or -1. */
export function partnerOf(e) {
  const list = state.active.exercises;
  if (list[e]?.superset && list[e + 1]) return e + 1;
  if (list[e - 1]?.superset) return e - 1;
  return -1;
}

/**
 * Set the weights of an entry's open working sets from its plan and its logged sets. Each logged
 * set with RIR adjusts the open sets after it (see nextSetWeight), in order, so logging and
 * undoing sets give the same weights. Sets whose weight was edited keep it.
 */
function replan(entry) {
  const ex = exercise(entry.ex);
  const target = targetFor(entry.ex);
  const work = entry.sets.filter((x) => !x.warmup);
  for (const s of work) if (!s.done && !s.edited) s.kg = s.planKg ?? s.kg;
  work.forEach((done, i) => {
    if (!done.done) return;
    for (const later of work.slice(i + 1)) {
      if (later.done || later.edited) continue;
      later.kg = nextSetWeight({ ex, target, done, plannedReps: done.planReps ?? done.reps, next: later, bodyweight: bodyweight() });
    }
  });
}

/**
 * Log set s of entry e with the shown values, adjust the remaining sets, choose the next set
 * and start the rest period. In a superset the focus alternates between the two exercises,
 * with a short rest inside a round and the full rest after it.
 */
export async function logSet(e, s) {
  const entry = state.active.exercises[e];
  const set = entry.sets[s];
  set.done = true;
  replan(entry);

  const partner = partnerOf(e);
  const partnerOpen = partner >= 0 && state.active.exercises[partner].sets.some((x) => !x.done && !x.warmup);
  let rest;
  if (set.warmup) {
    state.active.focus = firstOpen(e);
    rest = state.settings.restWarmup;
  } else if (partnerOpen) {
    state.active.focus = { e: partner, s: state.active.exercises[partner].sets.findIndex((x) => !x.done) };
    rest = partner > e ? state.settings.restSuperset : Math.max(restFor(entry.ex), restFor(state.active.exercises[partner].ex));
  } else {
    state.active.focus = firstOpen(e);
    rest = restFor(entry.ex);
  }
  state.active.rest = state.active.focus ? { endsAt: Date.now() + rest * 1000, total: rest } : null;
  await saveActive();
}

/** Mark a logged set as not done again; the open sets after it return to their plan. */
export function undoSet(e, s) {
  const entry = state.active.exercises[e];
  entry.sets[s].done = false;
  replan(entry);
  Object.assign(state.active, { focus: { e, s }, rest: null });
  return saveActive();
}

/** Recompute the open sets after an edit of a logged set. */
export function setEdited(e) {
  replan(state.active.exercises[e]);
  return saveActive();
}

export function swapExercise(e, id) {
  const old = state.active.exercises[e];
  const slot = template(state.active.template)?.slots.find((x) => x.id === old.slot);
  state.active.exercises[e] = { ...entryFor(id, slot, old.sets.filter((x) => !x.warmup).length), slot: old.slot, superset: old.superset };
  state.active.focus = firstOpen(e);
  return saveActive();
}

export function addExercise(id) {
  state.active.exercises.push(entryFor(id, null));
  state.active.focus ??= firstOpen(state.active.exercises.length - 1);
  return saveActive();
}

export function removeExercise(e) {
  const list = state.active.exercises;
  if (list[e - 1]?.superset && !list[e].superset) list[e - 1].superset = false;
  list.splice(e, 1);
  state.active.focus = list.length ? firstOpen(Math.min(e, list.length - 1)) : null;
  return saveActive();
}

export function addSet(e) {
  const sets = state.active.exercises[e].sets;
  const last = sets.findLast((x) => !x.warmup) ?? sets.at(-1);
  const kg = last?.kg ?? null, reps = last?.reps ?? 8;
  sets.push({ kg, planKg: kg, reps, planReps: reps, rir: last?.rir ?? 1, done: false });
  state.active.focus = firstOpen(e);
  return saveActive();
}

export function removeSet(e, s) {
  const entry = state.active.exercises[e];
  entry.sets.splice(s, 1);
  replan(entry);
  state.active.focus = firstOpen(e);
  return saveActive();
}

/**
 * Link entry e with the next entry as a superset, or unlink it. A superset is a pair, so links
 * touching either exercise are removed first. The link is stored in the training day too.
 */
export async function toggleSuperset(e) {
  const list = state.active.exercises;
  const on = !list[e].superset;
  if (on) {
    if (list[e - 1]) list[e - 1].superset = false;
    if (list[e + 1]) list[e + 1].superset = false;
  }
  list[e].superset = on;
  const t = state.active.template && template(state.active.template);
  if (t) {
    const own = ownTemplate(t.id);
    for (const slot of t.slots) {
      const linked = list.some((x) => x.slot === slot.id && x.superset);
      if (own) own.slots.find((x) => x.id === slot.id).superset = linked;
      else state.program.slots[slot.id] = { superset: linked };
    }
    await saveProgram();
  }
  await saveActive();
}

const templateItems = () => state.active.exercises.map((x) => ({ ex: x.ex, sets: x.sets.filter((s) => !s.warmup).length, superset: x.superset, slot: x.slot }));

/** Save the current exercises as a new template and continue the workout as that template. */
export async function saveAsTemplate(name) {
  const a = state.active;
  const id = createTemplate(name, templateItems());
  ownTemplate(id).slots.forEach((slot, i) => { a.exercises[i].slot = slot.id; });
  Object.assign(a, { template: id, name });
  await saveProgram();
  await saveActive();
}

/** Make the user's template of this workout match its current exercises and sets. */
export async function updateTemplate() {
  const own = ownTemplate(state.active.template);
  setTemplateSlots(own, templateItems());
  own.slots.forEach((slot, i) => { state.active.exercises[i].slot = slot.id; });
  await saveProgram();
  await saveActive();
}

/** Store the logged sets as a session. */
export async function finishWorkout() {
  const a = state.active;
  const exercises = a.exercises
    .map((x) => ({ ex: x.ex, slot: x.slot, ...(x.note ? { note: x.note } : {}),
      sets: x.sets.filter((s) => s.done).map(({ kg, reps, rir, warmup }) => ({
        kg: kg ?? 0, reps, ...(rir != null && !warmup ? { rir } : {}), ...(warmup ? { warmup } : {}) })) }))
    .filter((x) => x.sets.length);
  const session = { id: a.id, start: a.start, name: a.name, template: a.template,
    durationMin: Math.round((Date.now() - new Date(a.start)) / 60000), source: "app", exercises };

  if (exercises.length) await saveSessions([session]);
  state.active = null;
  await saveActive();
  return exercises.length ? session : null;
}

export async function discardWorkout() {
  state.active = null;
  await saveActive();
}

/** Local time as an ISO string without zone, matching the imported sessions. */
export const localIso = (d) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
