// Application state, loaded once at start-up and saved piecewise when it changes.

import { kv, sessionStore } from "./db.js";
import { loadLibrary } from "./library.js";
import { indexByExercise, bodyweightLookup } from "./history.js";

/** Rest in seconds. Rest beyond about 90 s shows no detectable extra hypertrophy (Singer et al.
 *  2024, Front. Sports Act. Living 6:1429789); heavy compound lifts get a little more. */
export const DEFAULT_SETTINGS = { restCompound: 120, restIsolation: 90, restSuperset: 45, restWarmup: 60 };
const DEFAULT_RIR = [1, 2];

export const state = {
  library: null,
  program: null,
  body: [],
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
  active: null,
  index: new Map(),
  bodyweightAt: () => 80,
  ui: {},
};

export async function loadState() {
  const [library, program, body, settings, active, sessions] = await Promise.all([
    loadLibrary(), kv.get("program"), kv.get("body"), kv.get("settings"), kv.get("active"), sessionStore.all(),
  ]);
  Object.assign(state, { library, program: program ?? null, body: body ?? [], active: active ?? null, sessions });
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  reindex();
}

/** Rebuild the lookups derived from sessions and body data. */
export function reindex() {
  state.index = indexByExercise(state.sessions);
  state.bodyweightAt = bodyweightLookup(state.body);
}

export const saveProgram = () => kv.set("program", state.program);
export const saveSettings = () => kv.set("settings", state.settings);
export const saveActive = () => (state.active ? kv.set("active", state.active) : kv.delete("active"));

/** A library exercise, with the load increment set in the program when there is one. */
export function exercise(id) {
  const ex = state.library.exercises.get(id);
  const increment = state.program?.exercises?.[id]?.increment;
  return ex && increment != null ? { ...ex, increment } : ex;
}
export const pattern = (id) => state.library.patterns.get(exercise(id).pattern);
export const template = (id) => state.program.templates.find((t) => t.id === id);

/** Rep range and target RIR of an exercise: its program entry, else its pattern's default. */
export function targetFor(id) {
  const t = state.program?.exercises?.[id];
  return { reps: t?.reps ?? pattern(id).reps, rir: t?.rir ?? DEFAULT_RIR };
}

/** Rest after a working set of an exercise, in seconds. */
export function restFor(id) {
  const own = state.program?.exercises?.[id]?.restSec;
  return own ?? (pattern(id).kind === "compound" ? state.settings.restCompound : state.settings.restIsolation);
}

/** Store a change to an exercise's program entry, creating the entry from its defaults if needed. */
export function updateTarget(id, change) {
  state.program.exercises ??= {};
  state.program.exercises[id] = { ...targetFor(id), ...state.program.exercises[id], ...change };
  return saveProgram();
}
