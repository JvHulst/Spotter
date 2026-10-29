// The active workout: planning its exercises, logging sets, rest periods and finishing.
//
// An active workout holds one entry per exercise, each with its planned sets. Warm-up sets
// come first and are excluded from progression. `focus` is the set being logged next.

import { planExercise, nextSetWeight, warmupSets, finisherSets, nextTemplateId } from "./progression.js";
import { state, exercise, pattern, bodyweight, saveActive, saveProgram, saveSessions } from "./state.js";
import { splitWeighted } from "./strong.js";
import { template, rotation, slotChoice, slotOptions, targetFor, restFor, ownTemplate, createTemplate, setTemplateSlots, allowsFinisher,
  setSlotOption } from "./program.js";

/** Rest before a finisher set, in seconds: a drop set follows once the weight is changed, and a
 *  myo-reps mini-set after about five deep breaths. */
const FINISHER_REST = { drop: 10, myo: 15 };

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
  const warmup = slot?.warmup !== false;
  const warmups = warmup ? warmupSets(plan.sets[0].kg, exercise(id), pattern(id).kind) : [];
  const last = plan.sets.at(-1);
  const finisher = allowsFinisher(id) ? slot?.finisher ?? "" : "";
  return {
    ex: id, slot: slot?.id ?? null, superset: Boolean(slot?.superset), finisher, warmup, note: "",
    plan: { mode: plan.mode, reason: plan.reason },
    sets: [
      ...warmups.map((w) => ({ warmup: true, kg: w.kg, reps: w.reps, rir: null, done: false })),
      ...plan.sets.map((s) => ({ kg: s.kg, planKg: s.kg, reps: s.reps, planReps: s.reps, rir: plan.rir, done: false })),
      ...finisherSets(finisher, last.kg, last.reps, exercise(id)).map((s) => ({ ...s, done: false })),
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
 * undoing sets give the same weights. Open finisher sets follow the last working set. Sets whose
 * weight was edited keep it.
 */
function replan(entry) {
  const ex = exercise(entry.ex);
  const target = targetFor(entry.ex);
  const work = entry.sets.filter((x) => !x.warmup && !x.type);
  for (const s of work) if (!s.done && !s.edited) s.kg = s.planKg ?? s.kg;
  work.forEach((done, i) => {
    if (!done.done) return;
    for (const later of work.slice(i + 1)) {
      if (later.done || later.edited) continue;
      later.kg = nextSetWeight({ ex, target, done, plannedReps: done.planReps ?? done.reps, next: later, bodyweight: bodyweight() });
    }
  });
  const base = work.at(-1);
  if (!base) return;
  const planned = finisherSets(entry.finisher, base.kg, base.planReps ?? base.reps, ex);
  entry.sets.filter((x) => x.type).forEach((s, i) => {
    if (!s.done && !s.edited && planned[i]) s.kg = planned[i].kg;
  });
}

/** Give entry e another finisher, replacing its open finisher sets, and store it in the slot. */
export async function setFinisher(e, kind) {
  const entry = state.active.exercises[e];
  const base = entry.sets.filter((x) => !x.warmup && !x.type).at(-1);
  entry.finisher = kind;
  entry.sets = [...entry.sets.filter((x) => !x.type || x.done),
    ...(base ? finisherSets(kind, base.kg, base.planReps ?? base.reps, exercise(entry.ex)).map((s) => ({ ...s, done: false })) : [])];
  setSlotOption(state.active.template, entry.slot, "finisher", kind);
  state.active.focus = firstOpen(e);
  await saveProgram();
  await saveActive();
}

/** Turn the warm-up sets of entry e on or off, and store the choice in the slot. */
export async function setWarmups(e, on) {
  const entry = state.active.exercises[e];
  const first = entry.sets.find((x) => !x.warmup && !x.type);
  entry.warmup = on;
  entry.sets = entry.sets.filter((x) => !x.warmup || x.done);
  if (on && !entry.sets.some((x) => x.warmup)) {
    const warmups = warmupSets(first?.kg, exercise(entry.ex), pattern(entry.ex).kind);
    entry.sets.unshift(...warmups.map((w) => ({ warmup: true, kg: w.kg, reps: w.reps, rir: null, done: false })));
  }
  setSlotOption(state.active.template, entry.slot, "warmup", on);
  state.active.focus = firstOpen(e);
  await saveProgram();
  await saveActive();
}

/** Make set s of entry e a working set (""), a warm-up, a drop set or a myo-reps mini-set. */
export function setType(e, s, type) {
  const entry = state.active.exercises[e];
  const set = entry.sets[s];
  delete set.warmup;
  delete set.type;
  if (type === "warmup") Object.assign(set, { warmup: true, rir: null });
  else if (type) Object.assign(set, { type, rir: 0 });
  else set.rir ??= targetFor(entry.ex).rir[0];
  replan(entry);
  return saveActive();
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
  const next = entry.sets[s + 1];
  let rest;
  if (next && !next.done && next.type) {
    // A finisher follows its set directly, also inside a superset.
    state.active.focus = { e, s: s + 1 };
    rest = FINISHER_REST[next.type];
  } else if (set.warmup) {
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

/** Add a working set after the last one, before any finisher sets. */
export function addSet(e) {
  const sets = state.active.exercises[e].sets;
  const last = sets.findLast((x) => !x.warmup && !x.type) ?? sets.at(-1);
  const kg = last?.kg ?? null, reps = last?.reps ?? 8;
  const at = sets.findIndex((x) => x.type);
  sets.splice(at < 0 ? sets.length : at, 0, { kg, planKg: kg, reps, planReps: reps, rir: last?.rir ?? 1, done: false });
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
      else state.program.slots[slot.id] = { ...state.program.slots[slot.id], superset: linked };
    }
    await saveProgram();
  }
  await saveActive();
}

const templateItems = () => state.active.exercises.map((x) => ({
  ex: x.ex, sets: x.sets.filter((s) => !s.warmup && !s.type).length, superset: x.superset, finisher: x.finisher ?? "",
  warmup: x.warmup !== false, slot: x.slot }));

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
      sets: x.sets.filter((s) => s.done).map(({ kg, reps, rir, warmup, type }) => ({
        kg: kg ?? 0, reps, ...(rir != null && !warmup ? { rir } : {}), ...(warmup ? { warmup } : {}), ...(type ? { type } : {}) })) }))
    .filter((x) => x.sets.length);
  const session = { id: a.id, start: a.start, name: a.name, template: a.template,
    durationMin: Math.round((Date.now() - new Date(a.start)) / 60000), source: "app", exercises };

  splitWeighted([session]);
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
