// What follows a logged set in a workout: the set to log next and the rest before it. The
// functions take plain data, so that tests can run them without the app's state.

/** Rest before a finisher set, in seconds: a drop set follows once the weight is changed, and a
 *  myo-reps mini-set after about five deep breaths. */
export const FINISHER_REST = { drop: 10, myo: 15 };

const isOpen = (x) => !x.done;
const hasOpenWork = (entry) => entry.sets.some((x) => isOpen(x) && !x.warmup);

/** The first open set at or after entry `from`, wrapping around, as {e, s}, or null. */
export function firstOpen(list, from = 0) {
  for (let k = 0; k < list.length; k++) {
    const e = (from + k) % list.length;
    const s = list[e].sets.findIndex(isOpen);
    if (s >= 0) return { e, s };
  }
  return null;
}

/** Index of the entry paired with entry e in a superset, or -1. */
export function partnerIn(list, e) {
  if (list[e]?.superset && list[e + 1]) return e + 1;
  if (list[e - 1]?.superset) return e - 1;
  return -1;
}

/**
 * The set to log after set s of entry e (already marked done) and the rest before it, as
 * {focus, rest} with rest in seconds, or null when nothing is left. The rest follows the set that
 * comes next:
 *  - a finisher set follows its set directly, also inside a superset;
 *  - after a working or finisher set of a superset, the other exercise is next while it has open
 *    working sets, whatever its warm-ups: the short superset rest when going to the second
 *    exercise, and the longer of the two exercises' rests when returning to the first. Warm-ups
 *    of the other exercise before its first working set get the warm-up rest instead;
 *  - otherwise the next open set of this exercise, or of the following ones: the warm-up rest
 *    before a warm-up, else the exercise's own rest, so also after its last warm-up.
 * `rests` is {warmup, superset, of(id)}.
 */
export function afterSet(list, e, s, rests) {
  const entry = list[e];
  const set = entry.sets[s];
  const next = entry.sets[s + 1];
  if (next && isOpen(next) && next.type) return { focus: { e, s: s + 1 }, rest: FINISHER_REST[next.type] };

  const partner = partnerIn(list, e);
  if (!set.warmup && partner >= 0 && hasOpenWork(list[partner])) {
    const focus = { e: partner, s: list[partner].sets.findIndex(isOpen) };
    const warming = list[partner].sets[focus.s].warmup;
    const rest = warming ? rests.warmup : partner > e ? rests.superset : Math.max(rests.of(entry.ex), rests.of(list[partner].ex));
    return { focus, rest };
  }

  const focus = firstOpen(list, e);
  if (!focus) return null;
  return { focus, rest: list[focus.e].sets[focus.s].warmup ? rests.warmup : rests.of(entry.ex) };
}
