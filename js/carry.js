// Carrying a typed value down an exercise's working sets.
//
// A set field (weight or reps) is untouched until it is typed in or its set is logged, and the
// workout screen shows untouched fields in gray. A value typed into a working set is carried to
// the untouched fields of the working sets after it, so one edit of the first set changes the
// whole exercise and the later sets stay gray. Warm-ups and finisher sets are not part of the
// chain, and a field that was typed in keeps its value.

/** Per field: the name of the value, of its plan, and of the flag that marks it as typed in. */
export const FIELDS = {
  kg: { plan: "planKg", touched: "edited" },
  reps: { plan: "planReps", touched: "repsEdited" },
};

const isWorking = (set) => !set.warmup && !set.type;

/** Whether a field is untouched: not typed in, and its set not logged. */
export const isUntouched = (set, field) => !set.done && !set[FIELDS[field].touched];

/** Store value in the field of set i as typed in, and carry it to the untouched later working sets. */
export function carryDown(sets, i, field, value) {
  const { plan, touched } = FIELDS[field];
  sets[i][field] = value;
  sets[i][touched] = true;
  if (!sets[i].done) sets[i][plan] = value;
  if (value == null || !isWorking(sets[i])) return;
  for (const later of sets.slice(i + 1)) {
    if (isWorking(later) && !later.done && !later[touched]) Object.assign(later, { [field]: value, [plan]: value });
  }
}
