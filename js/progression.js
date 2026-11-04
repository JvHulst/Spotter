// Load and rep predictions for double progression with reps in reserve (RIR).
//
// Strength is summarized by the Epley estimate of the one-rep max, in which the reps left
// in reserve count as reps that could still have been done:
//     e1RM = load * (1 + (reps + rir) / 30).
// All functions here are pure, so they can be tested without the app (see tests/).

/** Days away from an exercise after which its load is predicted from estimated strength. */
export const RETURN_AFTER_DAYS = 21;
/** Fraction of estimated strength assumed lost per week beyond RETURN_AFTER_DAYS, and its cap.
 *  Strength is largely retained for about three weeks without training and declines after. */
export const DECAY_PER_WEEK = 0.0125;
export const MAX_DECAY = 0.15;
/** RIR assumed for logged sets without one, such as sets imported from Strong. */
export const ASSUMED_RIR = 1;

const DAY_MS = 86400000;

export const e1rm = (load, reps, rir) => load * (1 + (reps + rir) / 30);
export const loadFor = (oneRm, reps, rir) => oneRm / (1 + (reps + rir) / 30);
export const repsFor = (oneRm, load, rir) => 30 * (oneRm / load - 1) - rir;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = (x) => Math.round(x * 100) / 100;
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Load moved in a set: the logged weight, with bodyweight added or minus the logged assistance. */
export function effectiveLoad(kg, ex, bodyweight) {
  if (ex.load === "add") return bodyweight + kg;
  if (ex.load === "subtract") return bodyweight - kg;
  return kg;
}

/** +1 when a higher logged weight is heavier, -1 for assisted exercises where it is lighter. */
const heavier = (ex) => (ex.load === "subtract" ? -1 : 1);

/**
 * Move from a logged weight toward a target effective load in whole load increments, so the
 * result stays on the weights available for the exercise. `round` decides how a partial step
 * is resolved and `maxSteps` limits how far the weight may move.
 */
export function snapToGrid(fromKg, targetLoad, ex, bodyweight, { round = Math.round, maxSteps = Infinity } = {}) {
  if (!ex.increment) return fromKg;
  const steps = round((targetLoad - effectiveLoad(fromKg, ex, bodyweight)) / ex.increment + 1e-9);
  const k = clamp(steps, -maxSteps, maxSteps);
  return Math.max(0, round2(fromKg + heavier(ex) * k * ex.increment));
}

/**
 * Plan today's working sets for one exercise.
 *
 * history: earlier sessions with this exercise, oldest first, as {date, sets} with working
 * sets only. target: {reps: [low, high], rir: [low, high]}. bodyweight is in kg.
 * Returns {mode, sets: [{kg, reps}], rir, reason}; kg is null when there is no history.
 * Modes: "new" (no history), "return" (long gap), "up" (add load), "reps" (add reps at the
 * same load), and "down" (below the rep range last time). An exercise without a load increment
 * progresses by reps only, beyond the range.
 */
export function planExercise({ ex, target, history, nSets, today, bodyweight: bw }) {
  const [lo, hi] = target.reps;
  const [rirLo, rirHi] = target.rir;
  const mid = Math.floor((lo + hi) / 2);
  const sets = (kg, reps) => Array.from({ length: nSets }, (_, i) => ({ kg, reps: Array.isArray(reps) ? reps[i] : reps }));

  const last = history.at(-1);
  if (!last || !last.sets.length) {
    return { mode: "new", sets: sets(null, mid), rir: rirLo,
      reason: `New exercise: choose a weight for ${mid} reps with ${rirHi} in reserve` };
  }

  // Finisher sets (drop sets, myo-reps) are extra work beyond the plan and do not steer it.
  const logged = last.sets.some((s) => !s.type) ? last.sets.filter((s) => !s.type) : last.sets;
  const loads = logged.map((s) => effectiveLoad(s.kg, ex, bw));
  const topLoad = Math.max(...loads);
  const top = logged.filter((_, i) => loads[i] >= topLoad - 1e-9);
  const topKg = top[0].kg;
  const strength = Math.max(...logged.map((s, i) => e1rm(loads[i], s.reps, s.rir ?? ASSUMED_RIR)));
  const gap = daysBetween(last.date, today);

  if (gap > RETURN_AFTER_DAYS) {
    // Back after a break: aim for the middle of the rep range at the upper target RIR with
    // strength reduced for the time away, and never above the last load.
    const decay = Math.min(MAX_DECAY, (DECAY_PER_WEEK * (gap - RETURN_AFTER_DAYS)) / 7);
    const now = strength * (1 - decay);
    const kg = snapToGrid(topKg, Math.min(topLoad, loadFor(now, mid, rirHi)), ex, bw, { round: Math.floor });
    const reps = clamp(Math.floor(repsFor(now, effectiveLoad(kg, ex, bw), rirHi)), lo, hi);
    const change = Math.round((1 - effectiveLoad(kg, ex, bw) / topLoad) * 100);
    return { mode: "return", sets: sets(kg, reps), rir: rirHi,
      reason: `Back after a break: ${change > 0 ? `${change}% lighter` : "same weight"}, ${reps} reps at RIR ${rirHi}` };
  }

  const byLoad = ex.increment > 0;
  const qualifies = (s) => s.reps >= hi && (s.rir == null || s.rir >= rirLo);
  if (byLoad && top.every(qualifies)) {
    const kg = round2(topKg + heavier(ex) * ex.increment);
    const reps = clamp(Math.floor(repsFor(strength, effectiveLoad(kg, ex, bw), rirLo)), lo, hi);
    const withRir = top.some((s) => s.rir != null) ? ` with RIR ≥ ${rirLo}` : "";
    return { mode: "up", sets: sets(kg, reps), rir: rirLo,
      reason: `${heavier(ex) > 0 ? "+" : "−"}${ex.increment} kg: every set reached ${hi} reps${withRir}` };
  }

  if (byLoad && Math.max(...top.map((s) => s.reps)) < lo) {
    const kg = Math.max(0, round2(topKg - heavier(ex) * ex.increment));
    return { mode: "down", sets: sets(kg, lo), rir: rirLo,
      reason: `Below ${lo} reps last time: ${ex.increment} kg lighter` };
  }

  // Same load: one more rep per set, except after a set that went past the target RIR.
  const reps = Array.from({ length: nSets }, (_, i) => {
    const s = top[Math.min(i, top.length - 1)];
    const next = s.reps + (s.rir != null && s.rir < rirLo ? 0 : 1);
    return byLoad ? Math.min(hi, next) : next;
  });
  const reason = !byLoad ? "Same load: one more rep per set"
    : top.every((s) => s.reps >= hi) ? `Same weight: reach ${hi} reps with RIR ≥ ${rirLo} before adding load`
    : `Same weight: one more rep per set, up to ${hi}`;
  return { mode: "reps", sets: sets(topKg, reps), rir: rirLo, reason };
}

/**
 * Weight of a remaining set after a set logged with its RIR.
 *
 * The logged set's estimate is compared with the range that its plan expected: the estimate
 * at the logged weight for the planned reps with the target RIR range left. Inside that range
 * the remaining set keeps its weight. Outside it, the remaining set's weight scales by the
 * ratio to the nearer end of the range, so its own planned reps (often fewer in later sets)
 * still apply, and moves by at most maxSteps increments. A remaining set without a weight,
 * as for an exercise without history, gets the weight at which the estimate leaves the middle
 * of the target RIR at its planned reps.
 */
export function nextSetWeight({ ex, target, done, plannedReps, next, bodyweight, maxSteps = 1 }) {
  if (done.rir == null || done.kg == null || !ex.increment) return next.kg;
  const [rirLo, rirHi] = target.rir;
  const load = effectiveLoad(done.kg, ex, bodyweight);
  const actual = e1rm(load, done.reps, done.rir);
  if (next.kg == null) {
    return snapToGrid(done.kg, loadFor(actual, next.reps, (rirLo + rirHi) / 2), ex, bodyweight, { maxSteps: Infinity });
  }
  const low = e1rm(load, plannedReps, rirLo);
  const high = e1rm(load, plannedReps, rirHi);
  const ratio = actual < low ? actual / low : actual > high ? actual / high : 1;
  if (ratio === 1) return next.kg;
  return snapToGrid(next.kg, effectiveLoad(next.kg, ex, bodyweight) * ratio, ex, bodyweight, { maxSteps });
}

/**
 * Finisher sets after an exercise's last working set, all taken to failure: a drop set ("drop")
 * 25% lighter, rounded down to the increment, for the same reps, or myo-reps ("myo"), three
 * mini-sets of a third of the reps at the same weight.
 */
export function finisherSets(kind, kg, reps, ex) {
  if (kind === "drop") {
    const drop = kg == null || !ex.increment ? kg : Math.max(0, round2(Math.floor((kg * 0.75) / ex.increment + 1e-9) * ex.increment));
    return [{ type: "drop", kg: drop, reps, rir: 0 }];
  }
  if (kind === "myo") return Array.from({ length: 3 }, () => ({ type: "myo", kg, reps: Math.max(3, Math.round(reps / 3)), rir: 0 }));
  return [];
}

/** Fractions of the working weight that warm-up sets of a compound exercise aim for. */
const WARMUP_STEPS = [0.5, 0.7, 0.85];
/** Reps of a warm-up set by its fraction of the working weight: more reps when lighter. */
const warmupReps = (fraction) => (fraction < 0.6 ? 8 : fraction < 0.8 ? 5 : 3);
const BAR = 20;
const PLATES = [20, 10, 5, 2.5, 1.25];

/**
 * Ways to load a barbell to `kg`, as the plates on one side, largest first: the fewest plates,
 * and the same with pairs of 10 kg plates in place of some 20 kg plates.
 */
function plateLoadings(kg) {
  let side = (kg - BAR) / 2;
  const fewest = [];
  for (const p of PLATES) {
    while (side >= p - 1e-9) {
      fewest.push(p);
      side -= p;
    }
  }
  if (side > 1e-6) return [];
  const twenties = fewest.filter((p) => p === 20).length;
  const rest = fewest.filter((p) => p !== 20);
  return Array.from({ length: twenties + 1 }, (_, k) => [...Array(twenties - k).fill(20), ...Array(2 * k).fill(10), ...rest]);
}

/**
 * Ramp-up sets before the working sets of a compound exercise. Isolation exercises get none,
 * since their loads are too light to need a ramp.
 *
 * A barbell exercise starts with the empty bar. The next warm-ups are the loads on the way to
 * the working weight when its plates go on largest first, so each warm-up only adds plates. Of
 * the ways to load the working weight (see plateLoadings), the one whose intermediate loads lie
 * closest to WARMUP_STEPS is used. Other exercises get the WARMUP_STEPS loads rounded down to
 * their increment.
 */
export function warmupSets(workKg, ex, kind) {
  if (kind !== "compound" || !workKg || ex.load !== "none" || !ex.increment) return [];
  const targets = WARMUP_STEPS.map((f) => f * workKg);
  let loads;
  if (ex.equipment === "barbell") {
    if (workKg <= BAR) return [];
    const options = plateLoadings(workKg).map((plates) => {
      const steps = plates.slice(0, -1).map((_, i) => BAR + 2 * plates.slice(0, i + 1).reduce((a, b) => a + b, 0)).filter((kg) => kg < workKg);
      const nearest = (t) => steps.reduce((best, kg) => (best == null || Math.abs(kg - t) < Math.abs(best - t) ? kg : best), null);
      const chosen = targets.map(nearest).filter((kg) => kg != null);
      const miss = targets.reduce((sum, t) => sum + Math.min(Math.abs((nearest(t) ?? BAR) - t), Math.abs(BAR - t)), 0);
      return { loads: [BAR, ...new Set(chosen)].sort((a, b) => a - b), miss };
    });
    loads = options.reduce((best, o) => (!best || o.miss < best.miss - 1e-9 ? o : best), null)?.loads ?? [BAR];
  } else {
    loads = [...new Set(targets.map((t) => round2(Math.floor(t / ex.increment) * ex.increment)))].filter((kg) => kg >= ex.increment && kg < workKg);
  }
  return loads.map((kg, i) => ({ kg, reps: ex.equipment === "barbell" && i === 0 ? 10 : warmupReps(kg / workKg) }));
}

/** The training day after the most recent session from the rotation, or the first one. */
export function nextTemplateId(rotation, sessions) {
  const last = sessions.findLast((s) => rotation.includes(s.template));
  return last ? rotation[(rotation.indexOf(last.template) + 1) % rotation.length] : rotation[0];
}
