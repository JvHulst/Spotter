// Queries on the training log. Sessions are kept sorted by start time, and only working sets
// (sets not marked as warm-ups) count toward records, volume and weekly sets.

import { e1rm, effectiveLoad, ASSUMED_RIR, RETURN_AFTER_DAYS, daysBetween } from "./progression.js";

const DAY_MS = 86400000;
export const working = (sets) => sets.filter((s) => !s.warmup);
export const volumeOf = (sets) => sets.reduce((v, s) => v + (s.kg ?? 0) * s.reps, 0);

const ID = /^[\w.:-]{1,80}$/;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * A session from outside the app, such as a backup file, with every field checked and
 * converted to its type; null when it is not a session. Ids may only hold letters, digits and
 * . : _ -, since they appear in links and attributes.
 */
export function cleanSession(s) {
  if (!ID.test(s?.id) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?$/.test(s.start) || !Array.isArray(s.exercises)) return null;
  const exercises = s.exercises.filter((e) => ID.test(e?.ex) && Array.isArray(e.sets)).map((e) => ({
    ex: e.ex, ...(ID.test(e.slot) ? { slot: e.slot } : {}), ...(text(e.note) ? { note: text(e.note) } : {}),
    sets: e.sets.map((x) => ({
      kg: num(x?.kg), reps: Math.round(num(x?.reps)),
      ...(x?.rir != null ? { rir: Math.round(num(x.rir)) } : {}), ...(x?.warmup ? { warmup: true } : {}),
      ...(num(x?.sec) ? { sec: num(x.sec) } : {}), ...(num(x?.dist) ? { dist: num(x.dist) } : {}),
    })),
  }));
  return {
    id: s.id, start: s.start, name: text(s.name, 80) || "Workout", template: ID.test(s.template) ? s.template : null,
    durationMin: num(s.durationMin) || null, source: s.source === "strong" ? "strong" : "app",
    ...(num(s.editedAt) ? { editedAt: num(s.editedAt) } : {}), exercises,
  };
}

/** Map each exercise id to its sessions, oldest first, as {date, sessionId, sets} with working sets only. */
export function indexByExercise(sessions) {
  const index = new Map();
  for (const s of sessions) {
    const date = new Date(s.start);
    for (const e of s.exercises) {
      const sets = working(e.sets);
      if (!sets.length) continue;
      if (!index.has(e.ex)) index.set(e.ex, []);
      index.get(e.ex).push({ date, sessionId: s.id, sets });
    }
  }
  return index;
}

/** Map each slot id to the exercise last logged in that slot. */
export function lastBySlot(sessions) {
  const last = new Map();
  for (const s of sessions) for (const e of s.exercises) if (e.slot) last.set(e.slot, e.ex);
  return last;
}

/** Sessions per exercise in the last 26 weeks (`recent`) and in the whole log (`total`). */
export function usageCounts(sessions, today) {
  const usage = new Map();
  for (const s of sessions) {
    const recent = (today - new Date(s.start)) / DAY_MS <= 182;
    for (const e of s.exercises) {
      const u = usage.get(e.ex) ?? { recent: 0, total: 0 };
      u.total += 1;
      u.recent += recent;
      usage.set(e.ex, u);
    }
  }
  return usage;
}

/** Estimated one-rep max of a set. Sets without RIR count as ending at ASSUMED_RIR. */
export const setE1rm = (s, ex, bodyweight) => e1rm(effectiveLoad(s.kg ?? 0, ex, bodyweight), s.reps, s.rir ?? ASSUMED_RIR);

/** The set with the highest estimated one-rep max. */
export const bestSet = (sets, ex, bodyweight) =>
  sets.reduce((best, s) => (!best || setE1rm(s, ex, bodyweight) > setE1rm(best, ex, bodyweight) ? s : best), null);

/** Per session of an exercise: its best estimated one-rep max, heaviest weight and volume. */
export function exerciseSeries(entries, ex, bodyweight) {
  return entries.map(({ date, sessionId, sets }) => ({
    date, sessionId,
    e1rm: Math.max(...sets.map((s) => setE1rm(s, ex, bodyweight))),
    top: Math.max(...sets.map((s) => s.kg ?? 0)),
    volume: volumeOf(sets),
  }));
}

/**
 * Records of an exercise: the best estimated one-rep max, the heaviest weight, the set and the
 * session with the most volume, and per rep count r from 1 to 12 the heaviest weight lifted for
 * at least r reps. Each record holds the date it was set.
 */
export function records(entries, ex, bodyweight) {
  const out = { e1rm: null, heaviest: null, bestSet: null, session: null, reps: new Map() };
  const better = (cur, value) => !cur || value > cur.value;
  for (const { date, sets } of entries) {
    for (const s of sets) {
      const est = setE1rm(s, ex, bodyweight);
      if (better(out.e1rm, est)) out.e1rm = { value: est, set: s, date };
      if (better(out.heaviest, s.kg)) out.heaviest = { value: s.kg, set: s, date };
      if (better(out.bestSet, s.kg * s.reps)) out.bestSet = { value: s.kg * s.reps, set: s, date };
      for (let r = 1; r <= Math.min(12, s.reps); r++) if (better(out.reps.get(r), s.kg)) out.reps.set(r, { value: s.kg, date });
    }
    if (better(out.session, volumeOf(sets))) out.session = { value: volumeOf(sets), date };
  }
  return out;
}

/**
 * Records set by each session: an exercise's best estimated one-rep max, heaviest weight or
 * volume above those of all its earlier sessions. The first session of an exercise sets no
 * record. Assisted exercises have no weight record, since less assistance is the harder set.
 * Returns a map from session id to [{ex, kind, value}].
 */
export function sessionRecords(sessions, exerciseOf, bodyweight) {
  const best = new Map();
  const out = new Map();
  for (const s of sessions) {
    const found = [];
    for (const e of s.exercises) {
      const ex = exerciseOf(e.ex);
      const sets = working(e.sets);
      if (!ex || !sets.length) continue;
      const now = { e1rm: Math.max(...sets.map((x) => setE1rm(x, ex, bodyweight))), weight: Math.max(...sets.map((x) => x.kg)), volume: volumeOf(sets) };
      const before = best.get(e.ex);
      if (before) {
        for (const kind of ["e1rm", "weight", "volume"]) {
          if (kind === "weight" && ex.load === "subtract") continue;
          if (now[kind] > 0 && now[kind] > before[kind] + 1e-9) found.push({ ex: e.ex, kind, value: now[kind] });
        }
      }
      best.set(e.ex, before ? Object.fromEntries(Object.keys(now).map((k) => [k, Math.max(now[k], before[k])])) : now);
    }
    if (found.length) out.set(s.id, found);
  }
  return out;
}

/**
 * True when an exercise's last n sessions brought no estimate above the best of the n sessions
 * before them, all without a break longer than RETURN_AFTER_DAYS. `series` is from exerciseSeries.
 */
export function stalled(series, n = 4) {
  if (series.length < 2 * n) return false;
  const window = series.slice(-2 * n);
  if (window.some((p, i) => i && daysBetween(window[i - 1].date, p.date) > RETURN_AFTER_DAYS)) return false;
  const best = (xs) => Math.max(...xs.map((p) => p.e1rm));
  return best(window.slice(n)) <= best(window.slice(0, n));
}

/**
 * Muscles an exercise trains, as [muscle, share]: 1 for its main muscle and 0.5 for each
 * secondary muscle of its pattern. Counting indirect sets as half a set predicted growth best
 * (Pelland et al. 2026, Sports Med. 56:481).
 */
export function muscleShares(id, library) {
  const ex = library.exercises.get(id);
  if (!ex || ex.muscle === "other") return [];
  const secondary = library.patterns.get(ex.pattern)?.secondary ?? [];
  return [[ex.muscle, 1], ...secondary.filter((m) => m !== ex.muscle).map((m) => [m, 0.5])];
}

/** Per muscle: days since it was last trained, and its sets in the last 7 and 28 days. */
export function muscleStats(sessions, library, today) {
  const stats = new Map();
  for (const s of sessions) {
    const date = new Date(s.start);
    const age = (today - date) / DAY_MS;
    for (const e of s.exercises) {
      const n = working(e.sets).length;
      if (!n) continue;
      for (const [muscle, share] of muscleShares(e.ex, library)) {
        const m = stats.get(muscle) ?? { last: null, sets7: 0, sets28: 0 };
        m.last = date;
        if (age <= 7) m.sets7 += share * n;
        if (age <= 28) m.sets28 += share * n;
        stats.set(muscle, m);
      }
    }
  }
  for (const m of stats.values()) m.daysSince = daysBetween(m.last, today);
  return stats;
}

/** Monday 00:00 of the week holding a date. */
export function weekStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** The last n weeks, oldest first, each with its workouts, working sets, volume and sets per muscle. */
export function weeklyStats(sessions, library, today, n) {
  const first = weekStart(today);
  first.setDate(first.getDate() - 7 * (n - 1));
  const weeks = Array.from({ length: n }, (_, i) => ({
    start: new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7 * i), workouts: 0, sets: 0, volume: 0, muscles: new Map(),
  }));
  for (const s of sessions) {
    const i = Math.floor(daysBetween(first, new Date(s.start)) / 7);
    if (i < 0 || i >= n) continue;
    const w = weeks[i];
    w.workouts += 1;
    for (const e of s.exercises) {
      const sets = working(e.sets);
      w.sets += sets.length;
      w.volume += volumeOf(sets);
      for (const [m, share] of muscleShares(e.ex, library)) w.muscles.set(m, (w.muscles.get(m) ?? 0) + share * sets.length);
    }
  }
  return weeks;
}

/** Number of sessions in the last `days` days. */
export function sessionsWithin(sessions, today, days) {
  return sessions.filter((s) => (today - new Date(s.start)) / DAY_MS <= days).length;
}
