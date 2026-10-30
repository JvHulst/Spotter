// Application state, loaded once at start-up and saved piecewise when it changes.

import { kv, sessionStore } from "./db.js";
import { loadLibrary } from "./library.js";
import { indexByExercise, lastBySlot, usageCounts, sessionRecords } from "./history.js";
import { builtinDays, defaultProgram, migrateProgram } from "./program.js";
import { splitWeighted } from "./strong.js";

/** Rest in seconds. Rest beyond about 90 s shows no detectable extra hypertrophy (Singer et al.
 *  2024, Front. Sports Act. Living 6:1429789); heavy compound lifts get a little more. */
export const DEFAULT_SETTINGS = {
  restCompound: 120, restIsolation: 90, restSuperset: 45, restWarmup: 60, theme: "dark", bodyweight: 80,
  ranges: {
    heavy: { reps: [5, 8], rir: [1, 2] },
    compound: { reps: [8, 12], rir: [0, 1] },
    isolation: { reps: [10, 20], rir: [0, 1] },
  },
};

/** Settings from outside the app: known keys with values of the default's type, and for each
 *  category of `ranges` a rep range and an RIR range of two whole numbers. */
export function cleanSettings(s = {}) {
  const out = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, typeof s?.[k] === typeof v ? s[k] : v]));
  const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isInteger) && v[0] <= v[1];
  out.ranges = Object.fromEntries(Object.entries(DEFAULT_SETTINGS.ranges).map(([k, d]) => {
    const r = s?.ranges?.[k];
    return [k, pair(r?.reps) && pair(r?.rir) ? { reps: r.reps, rir: r.rir } : d];
  }));
  return Number.isFinite(s?.updatedAt) ? { ...out, updatedAt: s.updatedAt } : out;
}
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
  settings: { ...DEFAULT_SETTINGS },
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
  await kv.set("settings", state.settings);
  hooks.changed();
}
export const saveActive = () => (state.active ? kv.set("active", state.active) : kv.delete("active"));

/** Store sessions (new or replacing those with the same id) and keep the list sorted. */
export async function saveSessions(list) {
  await sessionStore.putMany(list);
  const ids = new Set(list.map((s) => s.id));
  state.sessions = [...state.sessions.filter((s) => !ids.has(s.id)), ...list].sort((a, b) => a.start.localeCompare(b.start));
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
