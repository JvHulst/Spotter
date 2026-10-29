// The exercise library: data/exercises.csv and data/patterns.csv. Fields contain no commas,
// so each line splits on commas directly.

async function readCsv(url) {
  const [header, ...lines] = (await (await fetch(url)).text()).trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])));
}

export async function loadLibrary() {
  const [exercises, patterns] = await Promise.all(
    ["exercises", "patterns"].map((name) => readCsv(new URL(`../data/${name}.csv`, import.meta.url))));
  return {
    exercises: new Map(exercises.map((e) => [e.id, { ...e, increment: Number(e.increment) }])),
    patterns: new Map(patterns.map((p) => [p.pattern, { ...p, reps: [Number(p.reps_low), Number(p.reps_high)] }])),
  };
}

export const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "abs", "traps"];
