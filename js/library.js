// The exercise library and the built-in splits: data/exercises.csv, data/patterns.csv and
// data/splits.json. CSV fields contain no commas, so each line splits on commas directly.

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);

async function readCsv(name) {
  const [header, ...lines] = (await (await fetch(dataUrl(name))).text()).trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])));
}

/** Exercises and patterns by id, and the built-in splits. Patterns in one `group` can stand in
 *  for each other in a slot; `secondary` lists the muscles a pattern trains indirectly. */
export async function loadLibrary() {
  const [exercises, patterns, splits] = await Promise.all([
    readCsv("exercises.csv"), readCsv("patterns.csv"), fetch(dataUrl("splits.json")).then((r) => r.json())]);
  return {
    exercises: new Map(exercises.map((e) => [e.id, { ...e, increment: Number(e.increment) }])),
    patterns: new Map(patterns.map((p) => [p.pattern, {
      ...p, reps: [Number(p.reps_low), Number(p.reps_high)], group: p.group || p.pattern,
      secondary: p.secondary ? p.secondary.split("|") : [],
    }])),
    splits,
  };
}

export const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes"];
/** Muscles that the built-in days train only indirectly or not at all; direct work is optional. */
export const MINOR_MUSCLES = ["calves", "abs", "traps"];
