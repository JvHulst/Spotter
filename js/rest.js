// What follows a logged set in a workout: the set to log next and the rest before it. The
// functions take plain data, so that tests can run them without the app's state.

/** Rest before a finisher set, in seconds: a drop set follows once the weight is changed, and a
 *  myo-reps mini-set after about five deep breaths. */
export const FINISHER_REST = { drop: 10, myo: 15 };

const isOpen = (x) => !x.done;
const hasOpenWork = (entry) => entry.sets.some((x) => isOpen(x) && !x.warmup);
const openIn = (entry) => entry.sets.findIndex(isOpen);

/** Index of the entry paired with entry e in a superset, or -1. */
export function partnerIn(list, e) {
  if (list[e]?.superset && list[e + 1]) return e + 1;
  if (list[e - 1]?.superset) return e - 1;
  return -1;
}

/** The two entries of the superset that holds entry e, first one first, or null. */
function pairOf(list, e) {
  const partner = partnerIn(list, e);
  return partner < 0 ? null : [Math.min(e, partner), Math.max(e, partner)];
}

/** The first open warm-up of a superset, the first exercise's before the second's, as {e, s},
 *  or null. Warm-ups of an exercise that has logged a working set are skipped ones. */
function pairWarmup(list, pair) {
  for (const e of pair) {
    const sets = list[e].sets;
    const s = sets.findIndex((x) => isOpen(x) && x.warmup);
    if (s >= 0 && !sets.some((x) => x.done && !x.warmup)) return { e, s };
  }
  return null;
}

/** The first open set at or after entry `from`, wrapping around, as {e, s}, or null. In a
 *  superset the open warm-ups of both exercises come first. */
export function firstOpen(list, from = 0) {
  for (let k = 0; k < list.length; k++) {
    const e = (from + k) % list.length;
    const s = openIn(list[e]);
    if (s < 0) continue;
    const pair = pairOf(list, e);
    return (pair && pairWarmup(list, pair)) ?? { e, s };
  }
  return null;
}

/**
 * The set to log after set s of entry e (already marked done) and the rest before it, as
 * {focus, rest} with rest in seconds, or null when nothing is left. The rest follows the set that
 * comes next:
 *  - a finisher set follows its set directly, also inside a superset;
 *  - a superset starts with the warm-ups of the first exercise, then those of the second, each
 *    after the warm-up rest. The working sets then alternate between the two exercises with the
 *    superset rest at every switch, starting with the exercise that has logged fewer working
 *    sets. Once one exercise has no open sets, the other continues with its own rest between
 *    its own sets;
 *  - otherwise the next open set of this exercise, or of the following ones: the warm-up rest
 *    before a warm-up, else the exercise's own rest, so also after its last warm-up.
 * `rests` is {warmup, superset, of(id)}.
 */
export function afterSet(list, e, s, rests) {
  const entry = list[e];
  const set = entry.sets[s];
  const next = entry.sets[s + 1];
  if (next && isOpen(next) && next.type) return { focus: { e, s: s + 1 }, rest: FINISHER_REST[next.type] };

  const pair = pairOf(list, e);
  if (pair) {
    const warmup = pairWarmup(list, pair);
    if (warmup) return { focus: warmup, rest: rests.warmup };
    const open = pair.filter((i) => hasOpenWork(list[i]));
    const logged = (i) => list[i].sets.filter((x) => x.done && !x.warmup && !x.type).length;
    if (set.warmup && open.length) {
      const first = open.reduce((a, b) => (logged(b) < logged(a) ? b : a));
      return { focus: { e: first, s: openIn(list[first]) }, rest: rests.warmup };
    }
    const partner = pair[0] === e ? pair[1] : pair[0];
    if (open.includes(partner)) return { focus: { e: partner, s: openIn(list[partner]) }, rest: rests.superset };
  }

  const focus = firstOpen(list, e);
  if (!focus) return null;
  return { focus, rest: list[focus.e].sets[focus.s].warmup ? rests.warmup : rests.of(entry.ex) };
}
