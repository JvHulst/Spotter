// The workout screen: one card per exercise with its sets. The focused set opens an editor
// with steppers for weight and reps and chips for RIR.

import { state, exercise, pattern, template, targetFor, saveActive } from "../state.js";
import { logSet, addSet, removeExercise, swapExercise, addExercise, toggleSuperset, finishWorkout, discardWorkout } from "../workout.js";
import { actions, ask, esc, fmtKg, ago, setsText, icon, toast } from "../ui.js";
import { openSheet, closeSheet } from "./sheet.js";

export function workoutView() {
  const a = state.active;
  if (!a) {
    location.hash = "#today";
    return { title: "", body: "" };
  }
  const list = a.exercises;
  const cards = list.map((entry, e) => card(entry, e) + (e < list.length - 1 ? linkButton(e) : "")).join("");
  const body = `
    ${cards}
    <button class="btn block" style="margin-top:12px" data-action="add-exercise">+ Add exercise</button>
    <button class="btn block danger" style="margin-top:8px" data-action="discard">Discard workout</button>`;
  return {
    title: a.name, mainClass: "workout", body,
    right: `<span class="small muted num" id="elapsed"></span><button class="btn small primary" data-action="finish">Finish</button>`,
  };
}

function card(entry, e) {
  const ex = exercise(entry.ex);
  const target = targetFor(entry.ex);
  const slot = template(state.active.template)?.slots.find((s) => s.id === entry.slot);
  const work = entry.sets.filter((s) => !s.warmup).length;
  const last = state.index.get(entry.ex)?.at(-1);
  let n = 0;
  const rows = entry.sets.map((set, s) => {
    const label = set.warmup ? "W" : ++n;
    const focused = state.active.focus?.e === e && state.active.focus?.s === s;
    return `
      <div class="set ${set.warmup ? "warm" : ""} ${set.done ? "done" : ""}">
        <button class="set-main" data-action="focus" data-e="${e}" data-s="${s}">
          <span class="idx">${label}</span>
          <span class="val num">${fmtKg(set.kg)} kg × ${set.reps}</span>
          <span class="rir">${!set.warmup && set.rir != null ? `RIR ${set.rir}${set.rir === 4 ? "+" : ""}` : ""}</span>
        </button>
        <button class="tick" data-action="tick" data-e="${e}" data-s="${s}" aria-label="${set.done ? "Edit set" : "Log set as shown"}">${set.done ? icon.check : ""}</button>
      </div>${focused ? editor(entry, set, e, s) : ""}`;
  }).join("");
  return `
    <section class="ex-card ${entry.superset || state.active.exercises[e - 1]?.superset ? "superset" : ""}">
      <div class="ex-head">
        <div class="eyebrow">${esc(slot?.name ?? ex.muscle)} · ${work} sets · ${target.reps.join("–")} reps @ RIR ${target.rir.join("–")}</div>
        <button class="name" data-action="swap" data-e="${e}">${esc(ex.name)} ${icon.swap}</button>
        <div class="last">${last ? `${ago(last.date)}: ${esc(setsText(last.sets))}` : "No history yet"}</div>
        <div class="reason mode-${entry.plan.mode}">${esc(entry.plan.reason)}</div>
      </div>
      ${rows}
      <div class="ex-foot">
        <button class="btn small" data-action="add-set" data-e="${e}">+ Set</button>
        <button class="btn small" data-action="note" data-e="${e}">${entry.note ? "Edit note" : "Note"}</button>
        <span class="grow"></span>
        <button class="btn small" data-action="remove-exercise" data-e="${e}">Remove</button>
      </div>
      ${entry.note ? `<div class="small muted" style="padding:0 16px 14px">${esc(entry.note)}</div>` : ""}
    </section>`;
}

function editor(entry, set, e, s) {
  const rir = [0, 1, 2, 3, 4].map((r) =>
    `<button class="${set.rir === r ? "on" : ""}" data-action="rir" data-e="${e}" data-s="${s}" data-r="${r}">${r === 4 ? "4+" : r}</button>`).join("");
  const stepper = (field, value) => `
    <div class="stepper">
      <button data-action="step" data-e="${e}" data-s="${s}" data-field="${field}" data-d="-1" aria-label="Decrease">−</button>
      <input class="num" inputmode="decimal" value="${value ?? ""}" placeholder="–" data-change="set-field" data-e="${e}" data-s="${s}" data-field="${field}">
      <button data-action="step" data-e="${e}" data-s="${s}" data-field="${field}" data-d="1" aria-label="Increase">+</button>
    </div>`;
  return `
    <div class="editor">
      <div class="fields">
        <div><div class="field-label">kg</div>${stepper("kg", set.kg == null ? null : fmtKg(set.kg))}</div>
        <div><div class="field-label">Reps</div>${stepper("reps", set.reps)}</div>
      </div>
      ${set.warmup ? "" : `<div class="field-label">Reps in reserve</div><div class="rir-chips">${rir}</div>`}
      <button class="btn primary block" data-action="log" data-e="${e}" data-s="${s}">${set.done ? "Save changes" : set.warmup ? "Done" : "Log set"}</button>
    </div>`;
}

function linkButton(e) {
  const on = state.active.exercises[e].superset;
  return `<div class="link-btn"><button class="${on ? "on" : ""}" data-action="superset" data-e="${e}">${icon.link.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')} ${on ? "Superset" : "Make superset"}</button></div>`;
}

const setAt = ({ e, s }) => state.active.exercises[+e].sets[+s];

actions.focus = ({ e, s }) => { state.active.focus = { e: +e, s: +s }; return saveActive(); };
// The tick logs a set with the values shown in one tap. A logged set, or a set still
// without a weight, opens in the editor instead.
actions.tick = (d) => {
  const set = setAt(d);
  if (set.done || set.kg == null) return actions.focus(d);
  return logSet(+d.e, +d.s);
};
actions.step = (d) => {
  const set = setAt(d);
  const ex = exercise(state.active.exercises[+d.e].ex);
  if (d.field === "kg") {
    set.kg = Math.max(0, Math.round(((set.kg ?? 0) + +d.d * (ex.increment || 1)) * 100) / 100);
    set.edited = true;
  } else set.reps = Math.max(0, set.reps + +d.d);
  return saveActive();
};
actions["set-field"] = (d, el) => {
  const value = parseFloat(el.value.replace(",", "."));
  const set = setAt(d);
  if (d.field === "kg") Object.assign(set, { kg: Number.isFinite(value) ? value : null, edited: true });
  else if (Number.isFinite(value)) set.reps = Math.round(value);
  return saveActive();
};
actions.rir = (d) => { setAt(d).rir = +d.r; return saveActive(); };
actions.log = async (d) => {
  if (setAt(d).done) {
    state.active.focus = null;
    return saveActive();
  }
  return logSet(+d.e, +d.s);
};
actions["add-set"] = ({ e }) => addSet(+e);
actions["remove-exercise"] = async ({ e }) => {
  if (await ask("Remove this exercise from today's workout?", { ok: "Remove", danger: true })) return removeExercise(+e);
};
actions.superset = ({ e }) => toggleSuperset(+e);
actions.note = async ({ e }) => {
  const entry = state.active.exercises[+e];
  const note = await ask("Note for this exercise", { ok: "Save", text: entry.note });
  if (note == null) return;
  entry.note = note.trim();
  return saveActive();
};
actions.swap = ({ e }) => {
  const entry = state.active.exercises[+e];
  const slot = template(state.active.template)?.slots.find((s) => s.id === entry.slot);
  openSheet({
    title: "Swap exercise",
    first: (slot?.options ?? []).filter((id) => id !== entry.ex),
    firstTitle: "Used in this slot",
    pattern: pattern(entry.ex).label, patternId: exercise(entry.ex).pattern,
    exclude: [entry.ex],
    pick: async (id) => {
      if (entry.sets.some((s) => s.done && !s.warmup)
        && !(await ask("Logged sets of this exercise will be discarded. Swap anyway?", { ok: "Swap", danger: true }))) return;
      await swapExercise(+e, id);
      closeSheet();
    },
  });
};
actions["add-exercise"] = () => openSheet({
  title: "Add exercise", first: [], exclude: [],
  pick: async (id) => { await addExercise(id); closeSheet(); },
});
actions.finish = async () => {
  if (!(await ask("Finish and save this workout?", { ok: "Finish" }))) return;
  const session = await finishWorkout();
  toast(session ? "Workout saved" : "Nothing logged, workout closed");
  location.hash = session ? `#session-${session.id}` : "#today";
};
actions.discard = async () => {
  if (!(await ask("Discard this workout? Logged sets are lost.", { ok: "Discard", danger: true }))) return;
  await discardWorkout();
  location.hash = "#today";
};
