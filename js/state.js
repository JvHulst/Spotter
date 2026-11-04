// Application state, loaded once at start-up and saved piecewise when it changes.

import { kv, sessionStore } from "./db.js";
import { loadLibrary } from "./library.js";
import { indexByExercise, lastBySlot, usageCounts, sessionRecords } from "./history.js";
import { builtinDays, defaultProgram, migrateProgram } from "./program.js";
import { splitWeighted } from "./strong.js";
import { SOUNDS, DEFAULT_SOUND } from "./sounds.js";

/**
 * The training values of each category of exercise (see exerciseCategory in program.js): rep
 * range, target reps in reserve (RIR), rest after a working set in seconds, and whether working
 * sets get warm-up sets. Settings changes them per category and an exercise's page per exercise.
 *
 * Heavy loads build more maximal strength while growth is similar across loads when sets end
 * near failure (Schoenfeld et al. 2017, J. Strength Cond. Res. 31:3508), so only barbell
 * compounds use low reps. Sets closer to failure add growth but not strength (Robinson et al.
 * 2024, Sports Med. 54:2209), and failure costs little on a machine or an isolation exercise but
 * much fatigue and risk under a heavy bar, so only barbell compounds stop short of it. Rest beyond
 * about 90 s shows no detectable extra growth (Singer et al. 2024, Front. Sports Act. Living
 * 6:1429789); compound lifts get a little more. Isolation loads are too light to need warm-ups.
 */
export const CATEGORY_DEFAULTS = {
  heavy: { reps: [5, 8], rir: [1, 2], rest: 120, warmup: true },
  compound: { reps: [8, 12], rir: [0, 1], rest: 120, warmup: true },
  isolation: { reps: [10, 20], rir: [0, 1], rest: 90, warmup: false },
};

/** Settings that differ from these defaults are stored; the others follow the defaults, also when
 *  a release changes them. `categories` holds the user's own values per category, keyed as in
 *  CATEGORY_DEFAULTS. `restSquatHinge` is the rest after a working set of a squat or deadlift
 *  variation or a leg press, which takes the place of its category's rest: these lifts tire the
 *  whole body most, and longer rests between multi-joint sets gave more strength and growth in
 *  trained men (Schoenfeld et al. 2016, J. Strength Cond. Res. 30:1805). `accent` is a key of
 *  ACCENTS in views/settings.js and `sound` a key of SOUNDS in sounds.js or "off". */
export const DEFAULT_SETTINGS = {
  restSquatHinge: 150, restSuperset: 45, restWarmup: 60, theme: "dark", accent: "red", sound: DEFAULT_SOUND, bodyweight: 80,
  categories: { heavy: {}, compound: {}, isolation: {} },
};

const pair = (v, [min, max]) => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x) && x >= min && x <= max) && v[0] <= v[1];
const VALID = {
  reps: (v) => pair(v, [1, 50]), rir: (v) => pair(v, [0, 5]),
  rest: (v) => Number.isInteger(v) && v >= 0 && v <= 900, warmup: (v) => typeof v === "boolean",
};
/** The valid training values among v (see CATEGORY_DEFAULTS), leaving out those equal to `defaults`. */
export function cleanValues(v, defaults = {}) {
  return Object.fromEntries(Object.keys(VALID).filter((k) => VALID[k](v?.[k]) && JSON.stringify(v[k]) !== JSON.stringify(defaults[k]))
    .map((k) => [k, v[k]]));
}

/** Settings from outside the app: known keys with values of the default's type, and valid
 *  training values per category. Settings saved as `ranges`, `restCompound` and `restIsolation`
 *  read as category values. */
export function cleanSettings(s = {}) {
  const out = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, typeof s?.[k] === typeof v ? s[k] : v]));
  if (out.sound !== "off" && !Object.hasOwn(SOUNDS, out.sound)) out.sound = DEFAULT_SOUND;
  out.categories = Object.fromEntries(Object.entries(CATEGORY_DEFAULTS).map(([c, d]) => [c, cleanValues({
    ...s?.ranges?.[c], rest: c === "isolation" ? s?.restIsolation : s?.restCompound, ...s?.categories?.[c] }, d)]));
  return Number.isFinite(s?.updatedAt) ? { ...out, updatedAt: s.updatedAt } : out;
}
/** Settings as stored and synced: only those that differ from DEFAULT_SETTINGS. */
export const storedSettings = (s) => Object.fromEntries(Object.entries(s)
  .filter(([k, v]) => k === "updatedAt" || k === "categories" || (k in DEFAULT_SETTINGS && v !== DEFAULT_SETTINGS[k])));
/** Deleted session ids from outside the app, as a map from id to the time of deletion. */
export const cleanDeleted = (d) => Object.fromEntries(Object.entries(d ?? {}).filter(([id, at]) => /^[\w.:-]{1,80}$/.test(id) && Number.isFinite(at)));
/** Weigh-ins from outside the app, as a map from date to {kg, at}. */
export const cleanWeights = (d) => Object.fromEntries(Object.entries(d ?? {})
  .filter(([date, w]) => /^\d{4}-\d\d-\d\d$/.test(date) && (w?.kg === null || Number.isFinite(w?.kg)) && Number.isFinite(w?.at)));

export const state = {
  library: null,
  days: new Map(),
  program: null,
  sessions: [],
  deleted: {},
  weights: {},
  latestWeight: null,
  settings: cleanSettings(),
  active: null,
  index: new Map(),
  slotLast: new Map(),
  usage: new Map(),
  records: new Map(),
  ui: {},
};

/** Called after every saved change to the program, settings or sessions (sync listens). */
export const hooks = { changed: () => {} };

export async function loadState() {
  const [library, program, body, settings, active, sessions, deleted, weights] = await Promise.all([
    loadLibrary(), kv.get("program"), kv.get("body"), kv.get("settings"), kv.get("active"), sessionStore.all(), kv.get("deleted"), kv.get("weights"),
  ]);
  Object.assign(state, { library, days: builtinDays(library), active: active ?? null, sessions, deleted: deleted ?? {} });
  state.settings = cleanSettings(settings ?? {});
  addCustomExercises(program?.extra);
  state.program = program ? migrateProgram(program) : defaultProgram();
  state.weights = weights ?? {};
  // A list of daily body data ("body", from a backup of the import script) becomes weigh-ins.
  if (body) {
    for (const d of body) if (d.weightKg && !state.weights[d.date]) state.weights[d.date] = { kg: d.weightKg, at: 0 };
    await Promise.all([kv.delete("body"), kv.set("weights", state.weights)]);
  }
  updateLatestWeight();
  if (state.program !== program) await kv.set("program", state.program);
  const moved = splitWeighted(state.sessions);
  if (moved.length) await sessionStore.putMany(moved);
  reindex();
}

/** Exercises that are not in the library, such as unknown names in a Strong import. */
export function addCustomExercises(list = []) {
  for (const e of list) state.library.exercises.set(e.id, e);
}

/** Rebuild the lookups derived from the sessions. */
export function reindex() {
  state.index = indexByExercise(state.sessions);
  state.slotLast = lastBySlot(state.sessions);
  state.usage = usageCounts(state.sessions, new Date());
  state.records = sessionRecords(state.sessions, exercise, bodyweight());
}

export async function saveProgram() {
  state.program.updatedAt = Date.now();
  await kv.set("program", state.program);
  hooks.changed();
}
export async function saveSettings() {
  state.settings.updatedAt = Date.now();
  await kv.set("settings", storedSettings(state.settings));
  hooks.changed();
}
export const saveActive = () => (state.active ? kv.set("active", state.active) : kv.delete("active"));

/** Store sessions (new or replacing those with the same id) and keep the list sorted. */
export async function saveSessions(list) {
  const ids = new Set(list.map((s) => s.id));
  state.sessions = [...state.sessions.filter((s) => !ids.has(s.id)), ...list].sort((a, b) => a.start.localeCompare(b.start));
  await sessionStore.putMany(list);
  reindex();
  hooks.changed();
}

/** Delete a session and remember the deletion, so that sync removes it on other devices too. */
export async function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  state.deleted[id] = Date.now();
  await Promise.all([sessionStore.delete(id), kv.set("deleted", state.deleted)]);
  reindex();
  hooks.changed();
}

/** A library exercise, with the load increment set in the program when there is one. */
export function exercise(id) {
  const ex = state.library.exercises.get(id);
  const increment = state.program?.exercises?.[id]?.increment;
  return ex && increment != null ? { ...ex, increment } : ex;
}
export const pattern = (id) => state.library.patterns.get(exercise(id)?.pattern ?? "other");

/** Weigh-ins, oldest first, as [{date, kg}]. */
export const weighIns = () => Object.entries(state.weights).filter(([, w]) => w.kg != null)
  .map(([date, w]) => ({ date, kg: w.kg })).sort((a, b) => a.date.localeCompare(b.date));
const updateLatestWeight = () => { state.latestWeight = weighIns().at(-1) ?? null; };

/** The bodyweight for loads and estimates: the latest weigh-in, else the setting's default. */
export const bodyweight = () => state.latestWeight?.kg ?? state.settings.bodyweight;

/** Log the weight of a day, or remove it with kg null. A removed weigh-in is kept as a deletion,
 *  so that sync removes it on other devices too. */
export async function setWeight(date, kg) {
  state.weights[date] = { kg, at: Date.now() };
  updateLatestWeight();
  await kv.set("weights", state.weights);
  reindex();
  hooks.changed();
}

/** Replace all weigh-ins, as after a sync. */
export async function storeWeights(weights) {
  state.weights = weights;
  updateLatestWeight();
  await kv.set("weights", weights);
}
