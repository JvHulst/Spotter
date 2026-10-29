// The workout screen: one card per exercise with its sets, its alternatives and any proposed
// change, and below the cards an exercise for the muscle furthest behind this week. The focused
// set opens an editor with steppers for weight and reps and chips for RIR.

import { state, exercise, saveActive, saveProgram } from "../state.js";
import { template, targetFor, alternatives, proposeChange, plainBodyweight, allowsFinisher, FINISHERS, FINISHER_LABEL } from "../program.js";
import { muscleStats, muscleShares } from "../history.js";
import { MUSCLES } from "../library.js";
import { WEEKLY_SETS_GUIDE } from "./muscles.js";
import { logSet, undoSet, setEdited, addSet, removeSet, removeExercise, swapExercise, addExercise, toggleSuperset,
  saveAsTemplate, updateTemplate, setFinisher, finishWorkout, discardWorkout } from "../workout.js";
import { actions, ask, esc, fmtKg, ago, setsText, icon, toast, plural } from "../ui.js";
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
    ${list.length ? cards : `<div class="empty">Add the exercises of this workout as you go.</div>`}
    ${gapCard()}
    <button class="btn block ${list.length ? "" : "primary"}" style="margin-top:12px" data-action="add-exercise">+ Add exercise</button>
    ${!list.length ? "" : template(a.template)?.custom
      ? `<button class="btn block" style="margin-top:8px" data-action="update-template">Update template</button>`
      : `<button class="btn block" style="margin-top:8px" data-action="save-template">Save as template</button>`}
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
  const work = entry.sets.filter((s) => !s.warmup && !s.type).length;
  const last = state.index.get(entry.ex)?.at(-1);
  const started = entry.sets.some((s) => s.done && !s.warmup);
  let n = 0;
  const rows = entry.sets.map((set, s) => {
    const label = set.warmup ? "W" : set.type === "drop" ? "D" : set.type === "myo" ? "M" : ++n;
    const focused = state.active.focus?.e === e && state.active.focus?.s === s;
    return `
      <div class="set ${set.warmup ? "warm" : ""} ${set.type ? "fin" : ""} ${set.done ? "done" : ""}">
        <button class="set-main" data-action="focus" data-e="${e}" data-s="${s}">
          <span class="idx">${label}</span>
          <span class="val num">${fmtKg(set.kg)} kg × ${set.reps}</span>
          <span class="rir">${!set.warmup && set.rir != null ? `RIR ${set.rir}${set.rir === 4 ? "+" : ""}` : ""}</span>
        </button>
        <button class="tick" data-action="tick" data-e="${e}" data-s="${s}" aria-label="${set.done ? "Undo set" : "Log set as shown"}">${set.done ? icon.check : ""}</button>
      </div>${focused ? editor(set, e, s) : ""}`;
  }).join("");
  return `
    <section class="ex-card ${entry.superset || state.active.exercises[e - 1]?.superset ? "superset" : ""}">
      <div class="ex-head">
        <div class="eyebrow">${esc(slot?.name ?? ex.muscle)} · ${work} sets · ${target.reps.join("–")} reps @ RIR ${target.rir.join("–")}</div>
        <button class="name" data-action="swap" data-e="${e}">${esc(ex.name)} ${icon.swap}</button>
        <div class="last">${last ? `${ago(last.date)}: ${esc(setsText(last.sets))}` : "No history yet"}</div>
        <div class="reason mode-${entry.plan.mode}">${esc(entry.plan.reason)}</div>
        ${started ? "" : changeHint(entry, e, slot) + altChips(entry, e, slot)}
      </div>
      ${rows}
      <div class="ex-foot">
        <button class="btn small" data-action="add-set" data-e="${e}">+ Set</button>
        ${allowsFinisher(entry.ex) ? `<button class="btn small" data-action="finisher" data-e="${e}">${FINISHER_LABEL[entry.finisher ?? ""]}</button>` : ""}
        <button class="btn small" data-action="note" data-e="${e}">${entry.note ? "Edit note" : "Note"}</button>
        <span class="grow"></span>
        <button class="btn small" data-action="remove-exercise" data-e="${e}">Remove</button>
      </div>
      ${entry.note ? `<div class="small muted" style="padding:0 16px 14px">${esc(entry.note)}</div>` : ""}
    </section>`;
}

const inWorkout = () => state.active.exercises.map((x) => x.ex);
const bodyweightOnly = () => state.active.exercises.length > 0 && state.active.exercises.every((x) => plainBodyweight(x.ex));

/** One-tap swaps to the slot's other exercises, shown until the first working set is logged. */
function altChips(entry, e, slot) {
  const others = alternatives(entry.ex, slot, inWorkout());
  if (!others.length) return "";
  const chips = others.map((id) =>
    `<button class="chip" data-action="alt" data-e="${e}" data-id="${id}">${esc(exercise(id).name)}</button>`).join("");
  return `<div class="chips alts">${chips}<button class="chip" data-action="swap" data-e="${e}">More…</button></div>`;
}

/** A proposed change of exercise (see proposeChange) with Switch and Keep. A workout of plain
 *  bodyweight exercises counts as training at home. */
function changeHint(entry, e, slot) {
  const change = proposeChange(entry.ex, slot, inWorkout(), { bodyweightOnly: bodyweightOnly() });
  if (!change) return "";
  return `
    <div class="proposal">
      <div class="small">${esc(change.why)}. Try <b>${esc(exercise(change.to).name)}</b>?</div>
      <div class="row"><button class="btn small primary" data-action="alt" data-e="${e}" data-id="${change.to}">Switch</button>
        <button class="btn small" data-action="keep" data-e="${e}">Keep</button></div>
    </div>`;
}

/**
 * The major muscle with the fewest sets in the last 7 days and today's plan together, when it is
 * below half the weekly guide, with an exercise for it: the one you used most lately, and in a
 * workout of bodyweight exercises only, a bodyweight exercise.
 */
function gapCard() {
  const stats = muscleStats(state.sessions, state.library, new Date());
  const today = new Map();
  for (const x of state.active.exercises) {
    for (const [m, share] of muscleShares(x.ex, state.library)) today.set(m, (today.get(m) ?? 0) + share * x.sets.filter((s) => !s.warmup).length);
  }
  const [muscle, sets] = MUSCLES.map((m) => [m, (stats.get(m)?.sets7 ?? 0) + (today.get(m) ?? 0)]).sort((a, b) => a[1] - b[1])[0];
  if (sets >= WEEKLY_SETS_GUIDE / 2) return "";
  const use = (id) => state.usage.get(id) ?? { recent: 0, total: 0 };
  const pick = [...state.library.exercises.values()]
    .filter((x) => x.muscle === muscle && !inWorkout().includes(x.id) && (!bodyweightOnly() || plainBodyweight(x.id)))
    .sort((a, b) => use(b.id).recent - use(a.id).recent || use(b.id).total - use(a.id).total)[0];
  if (!pick) return "";
  return `
    <section class="card proposal row">
      <div class="grow small">Your <b>${esc(muscle)}</b> got ${fmtKg(sets)} sets in the last 7 days, counting today. Add ${esc(pick.name)}?</div>
      <button class="btn small primary" data-action="add-gap" data-id="${pick.id}">Add</button>
    </section>`;
}

function editor(set, e, s) {
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
      ${set.warmup || set.type ? "" : `<div class="field-label">Reps in reserve</div><div class="rir-chips">${rir}</div>`}
      <div class="row" style="margin-top:12px">
        <button class="btn small" data-action="remove-set" data-e="${e}" data-s="${s}">Remove set</button>
        <button class="btn primary grow" data-action="log" data-e="${e}" data-s="${s}">${set.done ? "Save changes" : set.warmup ? "Done" : "Log set"}</button>
      </div>
    </div>`;
}

function linkButton(e) {
  const on = state.active.exercises[e].superset;
  return `<div class="link-btn"><button class="${on ? "on" : ""}" data-action="superset" data-e="${e}">${icon.link.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')} ${on ? "Superset" : "Make superset"}</button></div>`;
}

const setAt = ({ e, s }) => state.active.exercises[+e].sets[+s];

actions.focus = ({ e, s }) => {
  const same = state.active.focus?.e === +e && state.active.focus?.s === +s;
  state.active.focus = same && setAt({ e, s }).done ? null : { e: +e, s: +s };
  return saveActive();
};
// The tick logs a set with the values shown in one tap, and a second tap undoes it. A set still
// without a weight opens in the editor instead.
actions.tick = (d) => {
  const set = setAt(d);
  if (set.done) return undoSet(+d.e, +d.s);
  if (set.kg == null) return actions.focus(d);
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
    return setEdited(+d.e);
  }
  return logSet(+d.e, +d.s);
};
actions["remove-set"] = ({ e, s }) => removeSet(+e, +s);
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
actions.alt = ({ e, id }) => swapExercise(+e, id);
actions.keep = ({ e }) => {
  state.program.keep ??= {};
  state.program.keep[state.active.exercises[+e].ex] = Date.now();
  return saveProgram();
};
actions["add-gap"] = ({ id }) => addExercise(id);
actions.finisher = ({ e }) => {
  const now = state.active.exercises[+e].finisher ?? "";
  return setFinisher(+e, FINISHERS[(FINISHERS.indexOf(now) + 1) % FINISHERS.length]);
};
actions.swap = ({ e }) => {
  const entry = state.active.exercises[+e];
  const slot = template(state.active.template)?.slots.find((s) => s.id === entry.slot);
  const inWorkout = state.active.exercises.map((x) => x.ex);
  openSheet({
    title: "Swap exercise",
    first: alternatives(entry.ex, slot, inWorkout, 12),
    firstTitle: "Alternatives",
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
  title: "Add exercise", first: [], exclude: state.active.exercises.map((x) => x.ex),
  pick: async (id) => { await addExercise(id); closeSheet(); },
});
actions["save-template"] = async () => {
  const name = await ask("Name of the new template", { ok: "Save", text: state.active.template ? `${state.active.name} (copy)` : "My workout" });
  if (!name?.trim()) return;
  await saveAsTemplate(name.trim());
  toast(`Saved as template "${name.trim()}"`);
};
actions["update-template"] = async () => {
  if (!(await ask(`Make the template "${state.active.name}" match this workout's exercises and sets?`, { ok: "Update" }))) return;
  await updateTemplate();
  toast("Template updated");
};
actions.finish = async () => {
  if (!(await ask("Finish and save this workout?", { ok: "Finish" }))) return;
  const session = await finishWorkout();
  const prs = session ? state.records.get(session.id)?.length ?? 0 : 0;
  toast(!session ? "Nothing logged, workout closed" : prs ? `Workout saved with ${plural(prs, "record")}` : "Workout saved");
  location.hash = session ? `#session-${session.id}` : "#today";
};
actions.discard = async () => {
  if (!(await ask("Discard this workout? Logged sets are lost.", { ok: "Discard", danger: true }))) return;
  await discardWorkout();
  location.hash = "#today";
};
