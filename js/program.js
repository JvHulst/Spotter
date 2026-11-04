// The program: the built-in splits of data/splits.json, the user's own templates, and the
// settings per slot and per exercise.
//
// A training day is a list of slots. A slot has a movement pattern and a number of sets. Its
// exercise is the one last logged in the slot, else its preferred exercise, else the most used
// exercise of its pattern. Exercises of the pattern's group (data/patterns.csv) are the slot's
// alternatives, ranked by how often they were logged.
//
// The stored program holds only what the user chose: the active split, their own templates and
// their edited versions of built-in days (`custom`, the latter marked `fork`), superset links of
// built-in slots (`slots`), per-exercise exceptions to the training values of their category and
// weight steps (`exercises`, see trainingValue),
// exercises added outside the library (`extra`), exercises kept despite a proposed change,
// with the time of that choice (`keep`), diet phases with their start dates (`phases`), and the
// exercises chosen for the one-rep-max dashboard (`tracked`).

import { state, exercise, pattern, bodyweight, saveSettings, saveProgram, cleanValues, CATEGORY_DEFAULTS } from "./state.js";
import { exerciseSeries, stalled, runWeeks, muscleStats } from "./history.js";
import { MUSCLES, MINOR_MUSCLES } from "./library.js";
import { daysBetween } from "./progression.js";
import { WEIGHTED } from "./strong.js";

/** The favorites until the user stars exercises of their own: squat, bench press and deadlift. */
export const DEFAULT_FAVORITES = ["squat-barbell", "bench-press-barbell", "deadlift-barbell"];

/**
 * The user's favorite exercises, in the order they were starred. A favorite takes the slot of a
 * built-in day that has its movement pattern, a built-in day starts with a favorite when one
 * fits it (see dayPlan), a favorite never rotates (see proposeChange), and Progress shows the
 * favorites first.
 */
export const favorites = () => state.program?.favorites ?? DEFAULT_FAVORITES;

/** Star or unstar an exercise. */
export function toggleFavorite(id) {
  const list = favorites();
  state.program.favorites = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return saveProgram();
}

/** The category of an exercise, which sets its training values (see CATEGORY_DEFAULTS in
 *  state.js): compounds with a barbell, other compounds (machines, cables, dumbbells, bodyweight),
 *  and isolations. */
export function exerciseCategory(id) {
  const ex = exercise(id);
  if (pattern(id).kind === "isolation") return "isolation";
  return ex.equipment === "barbell" && ex.load === "none" ? "heavy" : "compound";
}
export const CATEGORY_LABEL = { heavy: "Barbell compounds", compound: "Other compounds", isolation: "Isolations" };

/** Movement patterns of squat and deadlift variations, leg press included, which rest
 *  settings.restSquatHinge. */
const SQUAT_HINGE = new Set(["squat", "leg-press", "hinge"]);

/**
 * A training value of an exercise ("reps", "rir", "rest" or "warmup", see CATEGORY_DEFAULTS) and
 * where it comes from: the exercise's own exception ("exercise"), a setting of Settings
 * ("category": the user's value for its category, or the rest of squat and deadlift variations)
 * or the default of its category ("default").
 */
export function trainingValue(id, key) {
  const category = exerciseCategory(id);
  const own = state.program?.exercises?.[id]?.[key];
  if (own != null) return { value: own, from: "exercise" };
  if (key === "rest" && SQUAT_HINGE.has(exercise(id).pattern)) return { value: state.settings.restSquatHinge, from: "category" };
  const mine = state.settings.categories[category][key];
  return mine != null ? { value: mine, from: "category" } : { value: CATEGORY_DEFAULTS[category][key], from: "default" };
}
/** Rep range and target RIR of an exercise. */
export const targetFor = (id) => ({ reps: trainingValue(id, "reps").value, rir: trainingValue(id, "rir").value });
/** Rest after a working set of an exercise, in seconds. */
export const restFor = (id) => trainingValue(id, "rest").value;
/** Whether the working sets of an exercise get warm-up sets. */
export const warmupFor = (id) => trainingValue(id, "warmup").value;

/**
 * Set a training value of a category (scope "category", id a key of CATEGORY_DEFAULTS) or an
 * exception for one exercise (scope "exercise"), or remove it when value is null. A value equal to
 * the one that applies without it is removed as well, so that it follows that value again.
 */
export function setTrainingValue(scope, id, key, value) {
  if (scope === "category") {
    const own = { ...state.settings.categories[id], [key]: value };
    state.settings.categories = { ...state.settings.categories, [id]: cleanValues(own, CATEGORY_DEFAULTS[id]) };
    return saveSettings();
  }
  const { [key]: _, ...rest } = state.program.exercises[id] ?? {};
  state.program.exercises[id] = rest;
  if (value != null && JSON.stringify(value) !== JSON.stringify(trainingValue(id, key).value)) rest[key] = value;
  if (!Object.keys(rest).length) delete state.program.exercises[id];
  return saveProgram();
}

const HOME = { id: "home", name: "Home", slots: [
  ["pull-up", 4], ["push-up", 4], ["dip", 3], ["inverted-row-bodyweight", 3], ["bulgarian-split-squat-bodyweight", 3],
].map(([ex, sets]) => ({ id: `home-${ex}`, ex, sets })) };

export const defaultProgram = () => ({ version: 3, split: "full-body", custom: [structuredClone(HOME)], slots: {}, exercises: {}, extra: [], keep: {},
  favorites: [...DEFAULT_FAVORITES], phases: [] });

/** Diet phases, each from its date until the next one. */
export const PHASES = { maintain: "Maintain", bulk: "Bulk", cut: "Cut" };

/** Built-in training days by id, with slot ids made of the day id and the slot's pattern. */
export function builtinDays(library) {
  const days = new Map();
  for (const split of library.splits) {
    for (const day of split.days.filter((d) => !d.ref)) {
      const seen = new Map();
      const slots = day.slots.map((s) => {
        const n = (seen.get(s.pattern) ?? 0) + 1;
        seen.set(s.pattern, n);
        return { ...s, id: `${day.id}-${s.pattern}${n > 1 ? `-${n}` : ""}`,
          name: s.name ?? library.patterns.get(s.pattern).label, prefer: s.prefer ?? [] };
      });
      days.set(day.id, { id: day.id, name: day.name, slots });
    }
  }
  return days;
}

/**
 * A program in the current form (version 3). A program without a version holds the built-in
 * days itself, and of it only the active split and the exercise targets carry over. Version 2
 * also held routines derived from Strong among the user's templates, which version 3 leaves out:
 * the templates made in the app have ids starting with "t-".
 */
export function migrateProgram(p) {
  if (p.version === 3) return p;
  if (p.version === 2) return { ...p, version: 3, custom: p.custom.filter((t) => t.id === "home" || t.id.startsWith("t-")) };
  if (!p.templates) return defaultProgram();
  const split = p.splits?.some((s) => s.id === p.split && s.id !== "strong") ? p.split : "full-body";
  return { ...defaultProgram(), split, exercises: p.exercises ?? {} };
}

const ID = /^[\w.:-]{1,80}$/;
const finisher = (v) => (v === "drop" || v === "myo" ? v : "");

/** A program from outside the app, such as a backup file, in the current form with every
 *  field checked; ids may only hold letters, digits and . : _ -. */
export function cleanProgram(raw) {
  const p = migrateProgram(raw ?? {});
  const name = (v) => (typeof v === "string" && v.trim() ? v.slice(0, 80) : "Template");
  const exercises = {};
  for (const [id, t] of Object.entries(p.exercises ?? {})) {
    if (!ID.test(id) || !t) continue;
    exercises[id] = { ...cleanValues({ rest: t.restSec, ...t }), ...(Number.isFinite(t.increment) ? { increment: t.increment } : {}) };
  }
  return {
    version: 3, split: typeof p.split === "string" ? p.split : "full-body",
    custom: (p.custom ?? []).filter((t) => ID.test(t?.id) && Array.isArray(t.slots)).map((t) => ({
      id: t.id, name: name(t.name), ...(t.fork ? { fork: true } : {}),
      slots: t.slots.filter((s) => ID.test(s?.id) && ID.test(s.ex)).map((s) => ({ id: s.id, ex: s.ex, sets: Math.min(10, Math.max(1, Math.round(Number(s.sets)) || 3)),
        superset: Boolean(s.superset), finisher: finisher(s.finisher),
        ...(typeof s.name === "string" ? { name: s.name.slice(0, 40) } : {}) })),
    })),
    slots: Object.fromEntries(Object.entries(p.slots ?? {}).filter(([id]) => ID.test(id)).map(([id, v]) => [id, {
      ...(v?.superset != null ? { superset: Boolean(v.superset) } : {}), ...(v?.finisher != null ? { finisher: finisher(v.finisher) } : {}) }])),
    exercises,
    extra: (p.extra ?? []).filter((e) => ID.test(e?.id)).map((e) => ({ id: e.id, name: name(e.name), muscle: "other", pattern: "other",
      equipment: "other", load: "none", increment: Number.isFinite(e.increment) ? e.increment : 2.5, aliases: "" })),
    keep: Object.fromEntries(Object.entries(p.keep ?? {}).filter(([id, at]) => ID.test(id) && Number.isFinite(at))),
    favorites: Array.isArray(p.favorites) ? [...new Set(p.favorites.filter((id) => ID.test(id)))].slice(0, 20) : [...DEFAULT_FAVORITES],
    ...(Array.isArray(p.tracked) ? { tracked: p.tracked.filter((id) => ID.test(id)).slice(0, 20) } : {}),
    phases: (Array.isArray(p.phases) ? p.phases : []).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x?.date) && PHASES[x.phase])
      .map((x) => ({ date: x.date, phase: x.phase })),
    ...(Number.isFinite(p.updatedAt) ? { updatedAt: p.updatedAt } : {}),
  };
}

export const splits = () => state.library.splits;
export const activeSplit = () => splits().find((s) => s.id === state.program.split) ?? splits()[0];
/** The training days of the active split, in rotation order. */
export const rotation = () => activeSplit().days.map((d) => d.ref ?? d.id);

/** A built-in day, the user's edited version of one, or one of their templates, as {id, name,
 *  custom, fork, slots}. */
export function template(id) {
  const own = state.program.custom.find((t) => t.id === id);
  if (own) {
    return { id, name: own.name, custom: true, fork: Boolean(own.fork), slots: own.slots.filter((s) => exercise(s.ex)).map((s) => ({
      id: s.id, name: s.name ?? null, pattern: exercise(s.ex).pattern, prefer: [s.ex], sets: s.sets, superset: Boolean(s.superset),
      finisher: s.finisher ?? "" })) };
  }
  const day = state.days.get(id);
  if (!day) return null;
  return { ...day, custom: false, slots: day.slots.map((s) => {
    const own = state.program.slots[s.id] ?? {};
    return { ...s, superset: own.superset ?? Boolean(s.superset), finisher: own.finisher ?? s.finisher ?? "" };
  }) };
}

/**
 * Order of exercises by use: sessions in the last half year, then over the whole log, then the
 * order of the library, which lists the common variant of each movement first.
 */
function byUse() {
  const use = (id) => state.usage.get(id) ?? { recent: 0, total: 0 };
  const order = new Map([...state.library.exercises.keys()].map((id, i) => [id, i]));
  return (a, b) => use(b).recent - use(a).recent || use(b).total - use(a).total || order.get(a) - order.get(b);
}
const groupOf = (id) => state.library.patterns.get(exercise(id)?.pattern)?.group;

/** Exercises that can fill a slot of this pattern: the preferred ones, then the group's exercises by use. */
export function slotOptions({ pattern: p, prefer = [] }) {
  const group = state.library.patterns.get(p).group;
  const pool = [...state.library.exercises.keys()].filter((id) => groupOf(id) === group && !prefer.includes(id)).sort(byUse());
  return [...prefer.filter((id) => exercise(id)), ...pool];
}

/**
 * The exercise of each slot of a training day, as {slot, id}, in the order of the workout. A
 * template of the user's own is fixed: each slot is the exercise saved in it, in its order.
 *
 * A built-in day is adaptive. A slot gets a favorite of its movement pattern, the one last logged
 * in it if there are several and else the one starred last, or without a favorite the exercise
 * last logged in it, with no exercise in two slots. It then rotates to another exercise when a change is due (see proposeChange); such a
 * slot also has `rotated`, {from, why}. The day starts with a favorite when one fits it, another
 * one than the first exercise of the last workout when it can; a slot that pairs with a
 * neighbor in a superset keeps its place.
 */
export function dayPlan(t) {
  if (t.custom) return t.slots.map((slot) => ({ slot, id: slot.prefer[0] }));
  const taken = [];
  const plan = t.slots.map((slot) => {
    const fits = favorites().filter((id) => exercise(id)?.pattern === slot.pattern && !taken.includes(id));
    const choice = fits.find((id) => id === state.slotLast.get(slot.id)) ?? fits.at(-1) ?? slotChoice(slot);
    const id = taken.includes(choice) ? slotOptions(slot).find((x) => !taken.includes(x)) : choice;
    taken.push(id);
    return { slot, id };
  });
  for (const p of plan) {
    const change = proposeChange(p.id, p.slot, plan.map((x) => x.id));
    if (change) Object.assign(p, { id: change.to, rotated: { from: p.id, why: change.why } });
  }
  const lastLead = state.sessions.at(-1)?.exercises[0]?.ex;
  const leads = plan.filter((p, i) => favorites().includes(p.id) && !p.slot.superset && !plan[i - 1]?.slot.superset)
    .sort((a, b) => favorites().indexOf(a.id) - favorites().indexOf(b.id));
  const lead = leads.find((p) => p.id !== lastLead) ?? leads[0];
  return lead ? [lead, ...plan.filter((p) => p !== lead)] : plan;
}

/**
 * The swaps for an exercise in a workout, as [[title, ids]]: exercises of the same movement
 * pattern, then of the related patterns of its group, each by use. In a home workout only plain
 * bodyweight exercises are offered; in a gym workout they come last among the same movement and
 * are left out of the related ones, where a push-up is no stand-in for a press. For an isolation
 * exercise a bonus section follows: an isolation exercise for each of the two major muscles and
 * the one optional muscle with the fewest sets in the last 7 days, among the muscles that no
 * exercise of the workout trains. Exercises in `exclude`, the rest of the workout, are left out.
 */
export function alternativeSections(ex, slot, exclude, { home = false } = {}) {
  const own = slot?.pattern ?? exercise(ex).pattern;
  const fits = (id) => id !== ex && !exclude.includes(id) && exercise(id).muscle !== "other" && (!home || plainBodyweight(id));
  const all = [...state.library.exercises.keys()].filter(fits);
  const use = byUse();
  const order = (a, b) => (home ? 0 : plainBodyweight(a) - plainBodyweight(b)) || use(a, b);
  const same = all.filter((id) => exercise(id).pattern === own).sort(order);
  const similar = all.filter((id) => exercise(id).pattern !== own && groupOf(id) === groupOf(ex) && (home || !plainBodyweight(id))).sort(order);
  const sections = [["Same movement", same], ["Similar movement", similar]];
  if (pattern(ex).kind === "isolation") {
    const stats = muscleStats(state.sessions, state.library, new Date());
    const today = new Set([ex, ...exclude].map((id) => exercise(id)?.muscle));
    const fewest = (muscles, n) => muscles.filter((m) => !today.has(m))
      .sort((a, b) => (stats.get(a)?.sets7 ?? 0) - (stats.get(b)?.sets7 ?? 0)).slice(0, n);
    const bonus = [...fewest(MUSCLES, 2), ...fewest(MINOR_MUSCLES, 1)]
      .map((m) => all.filter((id) => exercise(id).muscle === m && pattern(id).kind === "isolation").sort(order)[0]).filter(Boolean);
    sections.push(["Bonus: a muscle behind this week", bonus]);
  }
  return sections.filter(([, ids]) => ids.length);
}

/** A slot's exercise: the one last logged in it, else its preferred one, else the most used
 *  exercise of its own pattern. */
export function slotChoice(slot) {
  const options = slotOptions(slot);
  return state.slotLast.get(slot.id) ?? options.find((id) => slot.prefer?.includes(id) || exercise(id).pattern === slot.pattern) ?? options[0];
}

/** Alternatives for an exercise in a slot, best first, leaving out the exercises in `exclude`. */
function alternatives(ex, slot, exclude) {
  return slotOptions(slot ?? { pattern: exercise(ex).pattern }).filter((id) => id !== ex && !exclude.includes(id));
}

/** An exercise that needs no equipment and no added weight, for workouts at home. */
export const plainBodyweight = (id) => exercise(id).equipment === "bodyweight" && !exercise(id).increment;

/** Weeks on one exercise after which Spotter rotates to another, and for which Keep or Undo silences that. */
const ROTATE_WEEKS = 8;

/**
 * A change of exercise that is due, as {to, why}, or null; never for a favorite. A plain
 * bodyweight exercise whose sets all reached the top of the rep range moves on to its weighted
 * variant, except in a workout of bodyweight exercises only. Otherwise a change is due when the
 * exercise stalls or has run for ROTATE_WEEKS without a break: planned variation every few weeks
 * can add regional growth, while switching often can hold back gains (Kassiano et al. 2022,
 * J. Strength Cond. Res. 36:1753). The new exercise is an alternative you know but have not done
 * for ROTATE_WEEKS, of the same pattern where possible, so that its plan starts from your own
 * history.
 */
export function proposeChange(id, slot, exclude, { bodyweightOnly = false } = {}) {
  const today = new Date();
  const entries = state.index.get(id) ?? [];
  if (!entries.length || favorites().includes(id) || today - (state.program.keep?.[id] ?? 0) < ROTATE_WEEKS * 7 * 86400000) return null;
  const twin = WEIGHTED[id];
  if (twin && !bodyweightOnly && !exclude.includes(twin) && entries.at(-1).sets.every((s) => s.reps >= targetFor(id).reps[1])) {
    return { to: twin, why: "Every set reached the top of the rep range, so add weight" };
  }
  const stall = stalled(exerciseSeries(entries, exercise(id), bodyweight()));
  const weeks = Math.floor(runWeeks(entries, today));
  if (!stall && weeks < ROTATE_WEEKS) return null;
  const options = alternatives(id, slot, exclude).filter((x) => !bodyweightOnly || plainBodyweight(x));
  const rested = (x) => {
    const last = state.index.get(x)?.at(-1)?.date;
    return last && daysBetween(last, today) >= ROTATE_WEEKS * 7;
  };
  const same = (x) => exercise(x).pattern === exercise(id).pattern;
  const to = options.find((x) => rested(x) && same(x)) ?? options.find(rested) ?? options.find(same) ?? options[0];
  return to ? { to, why: stall ? "No new best in 4 workouts" : `${weeks} weeks in a row` } : null;
}

/** Finishers a slot can plan after its working sets. The built-in days put them on isolation
 *  exercises, where a set to failure costs little recovery, and any exercise can have one. */
export const FINISHERS = ["", "drop", "myo"];

/** The types a set can have, chosen by tapping its label: working set, warm-up, drop set and
 *  myo-reps mini-set. */
export const SET_TYPES = ["", "warmup", "drop", "myo"];
/** Names of the set types, keyed "work" for a working set (the key "" of SET_TYPES). */
export const SET_TYPE_LABEL = { work: "Working set", warmup: "Warm-up", drop: "Drop set", myo: "Myo-reps" };

/** Store a choice made in a workout as an override of a built-in slot. The user's own templates
 *  change only through Save as template and Update template, so they are left alone. */
export function setSlotOption(templateId, slotId, key, value) {
  if (slotId && !ownTemplate(templateId)) state.program.slots[slotId] = { ...state.program.slots[slotId], [key]: value };
}
export const FINISHER_LABEL = { "": "No finisher", drop: "Drop set", myo: "Myo-reps" };


// --- The user's own templates --------------------------------------------------------------

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A new template from a list of {ex, sets, superset, finisher}. Returns its id. */
export function createTemplate(name, items = []) {
  const id = newId("t");
  state.program.custom.push({ id, name, slots: [] });
  setTemplateSlots(ownTemplate(id), items);
  return id;
}

export const ownTemplate = (id) => state.program.custom.find((t) => t.id === id);

/** Add an exercise to a template. A new slot id starts the slot without history. */
export function addTemplateSlot(t, ex, sets = 3) {
  t.slots.push({ id: newId(t.id), ex, sets });
}
/** Replace a template's exercises by [{ex, sets, superset, finisher, slot}]. An exercise that stays in its
 *  slot keeps the slot's id, and with it the slot's history. */
export function setTemplateSlots(t, items) {
  t.slots = items.map((x) => {
    const same = t.slots.find((s) => s.id === x.slot && s.ex === x.ex);
    return { id: same?.id ?? newId(t.id), ex: x.ex, sets: x.sets, superset: Boolean(x.superset), finisher: x.finisher ?? "" };
  });
}
/** Make a built-in day editable: an own copy with the same id and slot ids, so that it replaces
 *  the day in its split and keeps the history of its slots. */
export function forkDay(id) {
  const day = template(id);
  state.program.custom.push({ id, name: day.name, fork: true, slots: dayPlan(day).map(({ slot, id: ex }) => ({
    id: slot.id, name: slot.name, ex, sets: slot.sets, superset: slot.superset, finisher: slot.finisher })) });
}

/** Return an edited built-in day to its definition in data/splits.json. */
export function resetDay(id) {
  state.program.custom = state.program.custom.filter((t) => t.id !== id);
}

export function replaceTemplateSlot(t, i, ex) {
  t.slots[i] = { ...t.slots[i], id: newId(t.id), ex };
}
