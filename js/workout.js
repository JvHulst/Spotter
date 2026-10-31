// The active workout: planning its exercises, logging sets, rest periods and finishing.
//
// An active workout holds one entry per exercise, each with its planned sets. Warm-up sets
// come first and are excluded from progression. `focus` is the set being logged next.

import { planExercise, nextSetWeight, warmupSets, finisherSets, nextTemplateId } from "./progression.js";
import { state, exercise, pattern, bodyweight, saveActive, saveProgram, saveSessions } from "./state.js";
import { splitWeighted } from "./strong.js";
import { template, rotation, dayPlan, targetFor, restFor, ownTemplate, createTemplate, setTemplateSlots, allowsFinisher,
  setSlotOption } from "./program.js";
import { afterSet, firstOpen as firstOpenIn } from "./rest.js";
import { carryDown } from "./carry.js";

export const suggestedTemplateId = () => nextTemplateId(rotation(), state.sessions);

/** Today's plan for an exercise, with nSets working sets. */
export function planFor(id, nSets) {
  return planExercise({
    ex: exercise(id), target: targetFor(id), history: state.index.get(id) ?? [],
    nSets, today: new Date(), bodyweight: bodyweight(),
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

const firstOpen = (from = 0) => firstOpenIn(state.active.exercises, from);

/** Whether the workout follows a built-in day (or none), whose choices are adaptive and whose
 *  changes are stored as per-slot overrides. A template of the user's own is stored only by
 *  Save as template and Update template. */
export const adaptive = () => !template(state.active.template)?.custom;

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

/** Turn the warm-up sets of entry e on or off, and store the choice in the slot of a built-in day. */
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

/**
 * Make set s of entry e a working set (""), a warm-up, a drop set or a myo-reps mini-set. A drop
 * set or myo-reps mini-set is the exercise's finisher: the exercise keeps the type of its first
 * such set, and a built-in day's slot stores it, so that the next workout plans the same finisher.
 */
export async function setType(e, s, type) {
  const entry = state.active.exercises[e];
  const set = entry.sets[s];
  delete set.warmup;
  delete set.type;
  if (type === "warmup") Object.assign(set, { warmup: true, rir: null });
  else if (type) Object.assign(set, { type, rir: 0 });
  else set.rir ??= targetFor(entry.ex).rir[0];
  entry.finisher = entry.sets.find((x) => x.type)?.type ?? "";
  replan(entry);
  if (allowsFinisher(entry.ex)) {
    setSlotOption(state.active.template, entry.slot, "finisher", entry.finisher);
    await saveProgram();
  }
  await saveActive();
}

/**
 * Log set s of entry e with the shown values, adjust the remaining sets, choose the next set
 * and start the rest period (see afterSet for the rules).
 */
export async function logSet(e, s) {
  const entry = state.active.exercises[e];
  entry.sets[s].done = true;
  replan(entry);
  const { settings } = state;
  const next = afterSet(state.active.exercises, e, s, { warmup: settings.restWarmup, superset: settings.restSuperset, of: restFor });
  state.active.focus = next?.focus ?? null;
  state.active.rest = next ? { endsAt: Date.now() + next.rest * 1000, total: next.rest } : null;
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

/** Type a weight or reps value into set s of entry e (see carryDown) and recompute the open sets. */
export function editSet(e, s, field, value) {
  carryDown(state.active.exercises[e].sets, s, field, value);
  return setEdited(e);
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

/** Move the exercise at position `from` to position `to`. Superset links that the move would split or tangle are cleared. */
export async function moveExercise(from, to) {
  if (from === to) return;
  const list = state.active.exercises;
  const focused = list[state.active.focus?.e];
  const [entry] = list.splice(from, 1);
  const prev = list[from - 1];
  if (prev?.superset) prev.superset = false;
  entry.superset = false;
  list.splice(to, 0, entry);
  if (list[to - 1]) list[to - 1].superset = false;
  if (focused) state.active.focus.e = list.indexOf(focused);
  await storeSupersets();
  await saveActive();
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
  await storeSupersets();
  await saveActive();
}

/** Store the supersets of the workout in the slots of a built-in day, so the next workout of
 *  that day pairs the same exercises. */
async function storeSupersets() {
  const list = state.active.exercises;
  const t = state.active.template && template(state.active.template);
  if (!t || t.custom) return;
  for (const slot of t.slots) setSlotOption(t.id, slot.id, "superset", list.some((x) => x.slot === slot.id && x.superset));
  await saveProgram();
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
