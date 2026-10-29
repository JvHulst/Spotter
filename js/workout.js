// The active workout: planning its exercises, logging sets, rest periods and finishing.
//
// An active workout holds one entry per exercise, each with its planned sets. Warm-up sets
// come first and are excluded from progression. `focus` is the set being logged next.

import { planExercise, nextSetWeight, warmupSets, nextTemplateId } from "./progression.js";
import { slotChoice } from "./history.js";
import { sessionStore } from "./db.js";
import { state, exercise, pattern, template, rotation, targetFor, restFor, saveActive, saveProgram, reindex } from "./state.js";

export const suggestedTemplateId = () => nextTemplateId(rotation(), state.sessions);

/** Today's plan for an exercise, with nSets working sets. */
export function planFor(id, nSets) {
  return planExercise({
    ex: exercise(id), target: targetFor(id), history: state.index.get(id) ?? [],
    nSets, today: new Date(), bodyweightAt: state.bodyweightAt,
  });
}

function entryFor(id, slot) {
  const plan = planFor(id, slot?.sets ?? 3);
  const warmups = warmupSets(plan.sets[0].kg, exercise(id), pattern(id).kind);
  return {
    ex: id, slot: slot?.id ?? null, superset: Boolean(slot?.superset), note: "",
    plan: { mode: plan.mode, reason: plan.reason },
    sets: [
      ...warmups.map((w) => ({ warmup: true, kg: w.kg, reps: w.reps, rir: null, done: false })),
      ...plan.sets.map((s) => ({ kg: s.kg, reps: s.reps, planReps: s.reps, rir: plan.rir, done: false })),
    ],
  };
}

export async function startWorkout(templateId) {
  const t = template(templateId);
  state.active = {
    id: `app-${Date.now().toString(36)}`, start: localIso(new Date()), template: t.id, name: t.name,
    exercises: t.slots.map((slot) => entryFor(slotChoice(slot, state.slotLast), slot)),
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
 * Log set s of entry e with the shown values, adjust the remaining sets, choose the next set
 * and start the rest period. In a superset the focus alternates between the two exercises,
 * with a short rest inside a round and the full rest after it.
 */
export async function logSet(e, s) {
  const entry = state.active.exercises[e];
  const set = entry.sets[s];
  set.done = true;

  if (!set.warmup) {
    const id = entry.ex;
    for (const later of entry.sets.slice(s + 1)) {
      if (later.done || later.warmup || later.edited) continue;
      later.kg = nextSetWeight({ ex: exercise(id), target: targetFor(id), done: set, plannedReps: set.planReps ?? set.reps,
        next: later, bodyweight: state.bodyweightAt(new Date()) });
    }
  }

  const partner = partnerOf(e);
  const partnerOpen = partner >= 0 && state.active.exercises[partner].sets.some((x) => !x.done && !x.warmup);
  let rest;
  if (set.warmup) {
    state.active.focus = firstOpen(e);
    rest = state.settings.restWarmup;
  } else if (partnerOpen && partner > e) {
    state.active.focus = { e: partner, s: state.active.exercises[partner].sets.findIndex((x) => !x.done) };
    rest = state.settings.restSuperset;
  } else if (partnerOpen) {
    state.active.focus = { e: partner, s: state.active.exercises[partner].sets.findIndex((x) => !x.done) };
    rest = Math.max(restFor(entry.ex), restFor(state.active.exercises[partner].ex));
  } else {
    state.active.focus = firstOpen(e);
    rest = restFor(entry.ex);
  }
  state.active.rest = state.active.focus ? { endsAt: Date.now() + rest * 1000, total: rest } : null;
  await saveActive();
}

export function swapExercise(e, id) {
  const old = state.active.exercises[e];
  const slot = template(state.active.template)?.slots.find((x) => x.id === old.slot);
  state.active.exercises[e] = { ...entryFor(id, slot ?? { sets: old.sets.filter((x) => !x.warmup).length }), superset: old.superset };
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
  sets.push({ kg: last?.kg ?? null, reps: last?.reps ?? 8, rir: last?.rir ?? 1, done: false });
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
  const t = template(state.active.template);
  if (t) {
    for (const slot of t.slots) slot.superset = list.some((x) => x.slot === slot.id && x.superset);
    await saveProgram();
  }
  await saveActive();
}

/** Store the logged sets as a session and remember the chosen exercises in their slots. */
export async function finishWorkout() {
  const a = state.active;
  const exercises = a.exercises
    .map((x) => ({ ex: x.ex, slot: x.slot, ...(x.note ? { note: x.note } : {}),
      sets: x.sets.filter((s) => s.done).map(({ kg, reps, rir, warmup }) => ({
        kg: kg ?? 0, reps, ...(rir != null && !warmup ? { rir } : {}), ...(warmup ? { warmup } : {}) })) }))
    .filter((x) => x.sets.length);
  const session = { id: a.id, start: a.start, name: a.name, template: a.template,
    durationMin: Math.round((Date.now() - new Date(a.start)) / 60000), source: "app", exercises };

  if (exercises.length) {
    state.sessions.push(session);
    await sessionStore.put(session);
    reindex();
    const t = template(a.template);
    for (const x of exercises) {
      const slot = t?.slots.find((s) => s.id === x.slot);
      if (slot && !slot.options.includes(x.ex)) slot.options.unshift(x.ex);
    }
    await saveProgram();
  }
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
