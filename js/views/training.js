// Rows that show and change training values: rep range, reps in reserve, rest and warm-up sets.
// Settings shows them per category of exercise, and an exercise's page shows its own. A value
// set there is marked Custom and has its own Reset, which returns it to the value it follows:
// the default of the category, or for an exercise the value of its category.

import { state, CATEGORY_DEFAULTS } from "../state.js";
import { trainingValue, setTrainingValue } from "../program.js";
import { actions, fmtClock } from "../ui.js";

const ROWS = [["reps", "Reps"], ["rir", "RIR"], ["rest", "Rest"], ["warmup", "Warm-up sets"]];
const LIMITS = { reps: [1, 50], rir: [0, 5], rest: [0, 600] };
const REST_STEP = 15;

/** The value of key in scope "category" (id a category) or "exercise" (id an exercise), and whether it is the scope's own. */
function valueOf(scope, id, key) {
  if (scope === "exercise") {
    const t = trainingValue(id, key);
    return { value: t.value, custom: t.from === "exercise" };
  }
  const own = state.settings.categories[id][key];
  return { value: own ?? CATEGORY_DEFAULTS[id][key], custom: own != null };
}

/** The rows of training values of a category or an exercise. */
export function trainingRows(scope, id) {
  return ROWS.map(([key, label]) => {
    const { value, custom } = valueOf(scope, id, key);
    const data = `data-scope="${scope}" data-id="${id}" data-k="${key}"`;
    const step = (end, d) => `<button data-action="tv-step" ${data} data-end="${end}" data-d="${d}" aria-label="${d < 0 ? "Lower" : "Raise"}">${d < 0 ? "−" : "+"}</button>`;
    const stepper = (end, text) => `<div class="mini-stepper">${step(end, -1)}<span class="num">${text}</span>${step(end, 1)}</div>`;
    const control = key === "warmup" ? `<button class="chip small ${value ? "on" : ""}" data-action="tv-toggle" ${data}>${value ? "On" : "Off"}</button>`
      : key === "rest" ? stepper(0, fmtClock(value))
      : `${stepper(0, value[0])}<span class="muted">–</span>${stepper(1, value[1])}`;
    return `
      <div class="tv-row">
        <div class="grow">${label}${custom ? `<button class="tv-reset" data-action="tv-reset" ${data}>Custom · Reset</button>` : ""}</div>
        ${control}
      </div>`;
  }).join("");
}

actions["tv-step"] = ({ scope, id, k, end, d }) => {
  const { value } = valueOf(scope, id, k);
  const [min, max] = LIMITS[k];
  const clamp = (v) => Math.min(max, Math.max(min, v));
  if (k === "rest") return setTrainingValue(scope, id, k, clamp(value + REST_STEP * d));
  const range = [...value];
  range[+end] = clamp(range[+end] + +d);
  return range[0] > range[1] ? "keep" : setTrainingValue(scope, id, k, range);
};
actions["tv-toggle"] = ({ scope, id, k }) => setTrainingValue(scope, id, k, !valueOf(scope, id, k).value);
actions["tv-reset"] = ({ scope, id, k }) => setTrainingValue(scope, id, k, null);
