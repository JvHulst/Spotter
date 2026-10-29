// Queries on the training log and body data. Sessions are kept sorted by start time.

import { e1rm, effectiveLoad, ASSUMED_RIR, daysBetween } from "./progression.js";

const DAY_MS = 86400000;

/** Map each exercise id to its sessions, oldest first, as {date, sessionId, sets} with working sets only. */
export function indexByExercise(sessions) {
  const index = new Map();
  for (const s of sessions) {
    const date = new Date(s.start);
    for (const e of s.exercises) {
      const sets = e.sets.filter((st) => !st.warmup);
      if (!sets.length) continue;
      if (!index.has(e.ex)) index.set(e.ex, []);
      index.get(e.ex).push({ date, sessionId: s.id, sets });
    }
  }
  return index;
}

/** Bodyweight in kg on a date: the most recent weigh-in on or before it, else the first one. */
export function bodyweightLookup(body) {
  const weights = body.filter((d) => d.weightKg).map((d) => [new Date(d.date), d.weightKg]);
  return (date) => {
    if (!weights.length) return 80;
    let kg = weights[0][1];
    for (const [d, w] of weights) {
      if (d > date) break;
      kg = w;
    }
    return kg;
  };
}

/** Map each slot id to the exercise last logged in that slot. */
export function lastBySlot(sessions) {
  const last = new Map();
  for (const s of sessions) for (const e of s.exercises) if (e.slot) last.set(e.slot, e.ex);
  return last;
}

/** The slot's exercise for today: the one last logged in this slot, else its first option. */
export const slotChoice = (slot, lastInSlot) => lastInSlot.get(slot.id) ?? slot.options[0];

/** Best estimated one-rep max of each session with the exercise, as [{date, e1rm}]. */
export function strengthTrend(entries, ex, bodyweightAt) {
  return entries.map(({ date, sets }) => ({
    date,
    e1rm: Math.max(...sets.map((s) => e1rm(effectiveLoad(s.kg, ex, bodyweightAt(date)), s.reps, s.rir ?? ASSUMED_RIR))),
  }));
}

/**
 * Per muscle: days since it was last trained, and working sets in the last 7 and 28 days.
 * A set counts for the primary muscle of its exercise.
 */
export function muscleStats(sessions, library, today) {
  const stats = new Map();
  for (const s of sessions) {
    const date = new Date(s.start);
    const age = (today - date) / DAY_MS;
    for (const e of s.exercises) {
      const muscle = library.exercises.get(e.ex)?.muscle;
      if (!muscle || muscle === "other") continue;
      const sets = e.sets.filter((st) => !st.warmup).length;
      if (!sets) continue;
      const m = stats.get(muscle) ?? { last: null, sets7: 0, sets28: 0 };
      m.last = date;
      if (age <= 7) m.sets7 += sets;
      if (age <= 28) m.sets28 += sets;
      stats.set(muscle, m);
    }
  }
  for (const m of stats.values()) m.daysSince = daysBetween(m.last, today);
  return stats;
}

/** Number of sessions in the last `days` days. */
export function sessionsWithin(sessions, today, days) {
  return sessions.filter((s) => (today - new Date(s.start)) / DAY_MS <= days).length;
}
