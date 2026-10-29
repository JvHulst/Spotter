// The program: the built-in splits of data/splits.json, the user's own templates, and the
// settings per slot and per exercise.
//
// A training day is a list of slots. A slot has a movement pattern and a number of sets. Its
// exercise is the one last logged in the slot, else its preferred exercise, else the most used
// exercise of its pattern. Exercises of the pattern's group (data/patterns.csv) are the slot's
// alternatives, ranked by how often they were logged.
//
// The stored program holds only what the user chose: the active split, their own templates
// (`custom`), superset links of built-in slots (`slots`), per-exercise targets (`exercises`),
// exercises added outside the library (`extra`), and exercises kept despite a proposed change,
// with the time of that choice (`keep`).

import { state, exercise, pattern, bodyweight } from "./state.js";
import { exerciseSeries, stalled, runWeeks } from "./history.js";
import { daysBetween } from "./progression.js";
import { WEIGHTED } from "./strong.js";

/** Squat, bench press and deadlift are trained for strength as well as size. Heavy loads build
 *  more one-rep-max strength than light ones, while growth is similar across loads when sets end
 *  near failure (Schoenfeld et al. 2017, J. Strength Cond. Res. 31:3508). */
export const STRENGTH_LIFTS = new Set(["squat-barbell", "bench-press-barbell", "deadlift-barbell"]);
const STRENGTH_REPS = [4, 6];
/** Target RIR by pattern kind. Sets closer to failure add growth but not strength (Robinson et al.
 *  2024, Sports Med. 54:2209), and isolation sets can end closer to failure at little cost. */
const RIR_BY_KIND = { compound: [1, 2], isolation: [0, 1] };

const HOME = { id: "home", name: "Home", slots: [
  ["pull-up", 4], ["push-up", 4], ["dip", 3], ["inverted-row-bodyweight", 3], ["bulgarian-split-squat-bodyweight", 3],
].map(([ex, sets]) => ({ id: `home-${ex}`, ex, sets })) };

export const defaultProgram = () => ({ version: 3, split: "full-body", custom: [structuredClone(HOME)], slots: {}, exercises: {}, extra: [], keep: {} });

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
const pair = (v) => (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? v : undefined);

/** A program from outside the app, such as a backup file, in the current form with every
 *  field checked; ids may only hold letters, digits and . : _ -. */
export function cleanProgram(raw) {
  const p = migrateProgram(raw ?? {});
  const name = (v) => (typeof v === "string" && v.trim() ? v.slice(0, 80) : "Template");
  const exercises = {};
  for (const [id, t] of Object.entries(p.exercises ?? {})) {
    if (!ID.test(id) || !t) continue;
    exercises[id] = Object.fromEntries(Object.entries({ reps: pair(t.reps), rir: pair(t.rir),
      increment: Number.isFinite(t.increment) ? t.increment : undefined, restSec: Number.isFinite(t.restSec) ? t.restSec : undefined })
      .filter(([, v]) => v !== undefined));
  }
  return {
    version: 3, split: typeof p.split === "string" ? p.split : "full-body",
    custom: (p.custom ?? []).filter((t) => ID.test(t?.id) && Array.isArray(t.slots)).map((t) => ({
      id: t.id, name: name(t.name),
      slots: t.slots.filter((s) => ID.test(s?.id) && ID.test(s.ex)).map((s) => ({ id: s.id, ex: s.ex, sets: Math.min(10, Math.max(1, Math.round(Number(s.sets)) || 3)),
        superset: Boolean(s.superset), finisher: finisher(s.finisher), ...(s.warmup === false ? { warmup: false } : {}) })),
    })),
    slots: Object.fromEntries(Object.entries(p.slots ?? {}).filter(([id]) => ID.test(id)).map(([id, v]) => [id, {
      ...(v?.superset != null ? { superset: Boolean(v.superset) } : {}), ...(v?.finisher != null ? { finisher: finisher(v.finisher) } : {}),
      ...(v?.warmup != null ? { warmup: Boolean(v.warmup) } : {}) }])),
    exercises,
    extra: (p.extra ?? []).filter((e) => ID.test(e?.id)).map((e) => ({ id: e.id, name: name(e.name), muscle: "other", pattern: "other",
      equipment: "other", load: "none", increment: Number.isFinite(e.increment) ? e.increment : 2.5, aliases: "" })),
    keep: Object.fromEntries(Object.entries(p.keep ?? {}).filter(([id, at]) => ID.test(id) && Number.isFinite(at))),
    ...(Number.isFinite(p.updatedAt) ? { updatedAt: p.updatedAt } : {}),
  };
}

export const splits = () => state.library.splits;
export const activeSplit = () => splits().find((s) => s.id === state.program.split) ?? splits()[0];
/** The training days of the active split, in rotation order. */
export const rotation = () => activeSplit().days.map((d) => d.ref ?? d.id);

/** A built-in day or one of the user's templates, as {id, name, custom, slots}. */
export function template(id) {
  const own = state.program.custom.find((t) => t.id === id);
  if (own) {
    return { id, name: own.name, custom: true, slots: own.slots.filter((s) => exercise(s.ex)).map((s) => ({
      id: s.id, name: null, pattern: exercise(s.ex).pattern, prefer: [s.ex], sets: s.sets, superset: Boolean(s.superset),
      finisher: s.finisher ?? "", warmup: s.warmup !== false })) };
  }
  const day = state.days.get(id);
  if (!day) return null;
  return { ...day, custom: false, slots: day.slots.map((s) => {
    const own = state.program.slots[s.id] ?? {};
    return { ...s, superset: own.superset ?? Boolean(s.superset), finisher: own.finisher ?? s.finisher ?? "", warmup: own.warmup ?? true };
  }) };
}

/** Exercises that can fill a slot of this pattern: the preferred ones, then the group's
 *  exercises by sessions in the last half year, then over the whole log, then by name. */
export function slotOptions({ pattern: p, prefer = [] }) {
  const group = state.library.patterns.get(p).group;
  const use = (id) => state.usage.get(id) ?? { recent: 0, total: 0 };
  const pool = [...state.library.exercises.values()]
    .filter((e) => state.library.patterns.get(e.pattern)?.group === group && !prefer.includes(e.id))
    .sort((a, b) => use(b.id).recent - use(a.id).recent || use(b.id).total - use(a.id).total
      || (b.pattern === p) - (a.pattern === p) || a.name.localeCompare(b.name));
  return [...prefer.filter((id) => exercise(id)), ...pool.map((e) => e.id)];
}

/** A slot's exercise: the one last logged in it, else its preferred one, else the most used
 *  exercise of its own pattern. */
export function slotChoice(slot) {
  const options = slotOptions(slot);
  return state.slotLast.get(slot.id) ?? options.find((id) => slot.prefer?.includes(id) || exercise(id).pattern === slot.pattern) ?? options[0];
}

/** Up to n alternatives for an exercise in a slot, leaving out the exercises in `exclude`. */
export function alternatives(ex, slot, exclude, n = 3) {
  const options = slotOptions(slot ?? { pattern: exercise(ex).pattern });
  return options.filter((id) => id !== ex && !exclude.includes(id)).slice(0, n);
}

/** An exercise that needs no equipment and no added weight, for workouts at home. */
export const plainBodyweight = (id) => exercise(id).equipment === "bodyweight" && !exercise(id).increment;

/** Weeks on one exercise after which Spotter proposes another, and for which Keep silences it. */
const ROTATE_WEEKS = 8;

/**
 * A proposed change of exercise, as {to, why}, or null. A plain bodyweight exercise whose sets
 * all reached the top of the rep range moves on to its weighted variant, except in a workout of
 * bodyweight exercises only. Otherwise Spotter proposes a change when the exercise stalls, or
 * when an exercise other than squat, bench press and deadlift has run for ROTATE_WEEKS without a
 * break. The proposal is an alternative you know but have not done for ROTATE_WEEKS, of the same
 * pattern where possible, so that its plan starts from your own history.
 */
export function proposeChange(id, slot, exclude, { bodyweightOnly = false } = {}) {
  const today = new Date();
  const entries = state.index.get(id) ?? [];
  if (!entries.length || today - (state.program.keep?.[id] ?? 0) < ROTATE_WEEKS * 7 * 86400000) return null;
  const twin = WEIGHTED[id];
  if (twin && !bodyweightOnly && !exclude.includes(twin) && entries.at(-1).sets.every((s) => s.reps >= targetFor(id).reps[1])) {
    return { to: twin, why: "Every set reached the top of the rep range, so add weight" };
  }
  const stall = stalled(exerciseSeries(entries, exercise(id), bodyweight()));
  const weeks = Math.floor(runWeeks(entries, today));
  if (!stall && (STRENGTH_LIFTS.has(id) || weeks < ROTATE_WEEKS)) return null;
  const options = alternatives(id, slot, exclude, Infinity).filter((x) => !bodyweightOnly || plainBodyweight(x));
  const rested = (x) => {
    const last = state.index.get(x)?.at(-1)?.date;
    return last && daysBetween(last, today) >= ROTATE_WEEKS * 7;
  };
  const same = (x) => exercise(x).pattern === exercise(id).pattern;
  const to = options.find((x) => rested(x) && same(x)) ?? options.find(rested) ?? options.find(same) ?? options[0];
  return to ? { to, why: stall ? "No new best in 4 workouts" : `${weeks} weeks on this exercise` } : null;
}

/** Finishers only go on isolation exercises, where a set to failure costs little recovery. */
export const allowsFinisher = (id) => pattern(id).kind === "isolation";
export const FINISHERS = ["", "drop", "myo"];

/** The set types that can follow each other when a set's label is tapped: working set, warm-up,
 *  drop set, and for isolation exercises a myo-reps mini-set. */
export const setTypes = (id) => ["", "warmup", "drop", ...(allowsFinisher(id) ? ["myo"] : [])];

/** Store a choice for a slot of a workout: in the user's template, or as an override of a
 *  built-in slot. */
export function setSlotOption(templateId, slotId, key, value) {
  const own = ownTemplate(templateId);
  if (own) {
    const slot = own.slots.find((x) => x.id === slotId);
    if (slot) slot[key] = value;
  } else if (slotId) {
    state.program.slots[slotId] = { ...state.program.slots[slotId], [key]: value };
  }
}
export const FINISHER_LABEL = { "": "No finisher", drop: "Drop set", myo: "Myo-reps" };

/** Rep range and target RIR of an exercise: its program entry, else the defaults above. */
export function targetFor(id) {
  const own = state.program?.exercises?.[id];
  const p = pattern(id);
  return { reps: own?.reps ?? (STRENGTH_LIFTS.has(id) ? STRENGTH_REPS : p.reps), rir: own?.rir ?? RIR_BY_KIND[p.kind] };
}

/** Rest after a working set of an exercise, in seconds. */
export function restFor(id) {
  const own = state.program?.exercises?.[id]?.restSec;
  return own ?? (pattern(id).kind === "compound" ? state.settings.restCompound : state.settings.restIsolation);
}

// --- The user's own templates --------------------------------------------------------------

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A new template from a list of {ex, sets, superset, finisher, warmup}. Returns its id. */
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
/** Replace a template's exercises by [{ex, sets, superset, finisher, warmup, slot}]. An exercise that stays in its
 *  slot keeps the slot's id, and with it the slot's history. */
export function setTemplateSlots(t, items) {
  t.slots = items.map((x) => {
    const same = t.slots.find((s) => s.id === x.slot && s.ex === x.ex);
    return { id: same?.id ?? newId(t.id), ex: x.ex, sets: x.sets, superset: Boolean(x.superset), finisher: x.finisher ?? "",
      ...(x.warmup === false ? { warmup: false } : {}) };
  });
}
export function replaceTemplateSlot(t, i, ex) {
  t.slots[i] = { ...t.slots[i], id: newId(t.id), ex };
}
