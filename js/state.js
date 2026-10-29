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
};

/** Settings from outside the app: known keys with values of the default's type. */
export function cleanSettings(s = {}) {
  const out = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, typeof s?.[k] === typeof v ? s[k] : v]));
  return Number.isFinite(s?.updatedAt) ? { ...out, updatedAt: s.updatedAt } : out;
}
/** Deleted session ids from outside the app, as a map from id to the time of deletion. */
export const cleanDeleted = (d) => Object.fromEntries(Object.entries(d ?? {}).filter(([id, at]) => /^[\w.:-]{1,80}$/.test(id) && Number.isFinite(at)));

export const state = {
  library: null,
  days: new Map(),
  program: null,
  sessions: [],
  deleted: {},
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
  const [library, program, body, settings, active, sessions, deleted] = await Promise.all([
    loadLibrary(), kv.get("program"), kv.get("body"), kv.get("settings"), kv.get("active"), sessionStore.all(), kv.get("deleted"),
  ]);
  Object.assign(state, { library, days: builtinDays(library), active: active ?? null, sessions, deleted: deleted ?? {} });
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  addCustomExercises(program?.extra);
  state.program = program ? migrateProgram(program) : defaultProgram();
  // A stored list of weigh-ins ("body") sets the bodyweight from its last weight and is then removed.
  if (body) {
    const last = body.findLast((d) => d.weightKg);
    if (last && !settings?.bodyweight) state.settings.bodyweight = last.weightKg;
    await Promise.all([kv.delete("body"), saveSettings()]);
  }
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
export const bodyweight = () => state.settings.bodyweight;
