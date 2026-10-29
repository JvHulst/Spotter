// The workout screen: one card per exercise with its sets, its alternatives and any proposed
// change, and below the cards an exercise for the muscle furthest behind this week.
//
// A set row shows its type (W, a number, D or M; tapping it changes the type), its weight and reps
// as fields to type in, its RIR (tapping it steps through 0 to 4+), and a check mark that logs or
// undoes the set. Swiping a row to the left reveals Delete. Nothing in a card expands or
// collapses while you train, so rows stay where they are. Everything else about an exercise sits
// in its ⋯ menu.

import { state, exercise, bodyweight, setWeight, saveActive, saveProgram } from "../state.js";
import { template, targetFor, alternatives, proposeChange, plainBodyweight, allowsFinisher, setTypes, FINISHER_LABEL } from "../program.js";
import { muscleStats, muscleShares } from "../history.js";
import { MUSCLES } from "../library.js";
import { WEEKLY_SETS_GUIDE } from "./muscles.js";
import { logSet, undoSet, setEdited, setType, setWarmups, addSet, removeSet, removeExercise, swapExercise, addExercise, toggleSuperset,
  saveAsTemplate, updateTemplate, setFinisher, finishWorkout, discardWorkout, localIso } from "../workout.js";
import { actions, ask, choose, esc, fmtKg, ago, setsText, icon, toast, plural } from "../ui.js";
import { openSheet, closeSheet } from "./sheet.js";

const today = () => localIso(new Date()).slice(0, 10);

export function workoutView() {
  const a = state.active;
  if (!a) {
    location.hash = "#today";
    return { title: "", body: "" };
  }
  const list = a.exercises;
  const cards = list.map((entry, e) => card(entry, e) + (e < list.length - 1 ? linkButton(e) : "")).join("");
  const weighed = state.weights[today()]?.kg;
  const body = `
    <label class="bw-row">
      <span class="grow small muted">Bodyweight today (optional)</span>
      <input class="num" inputmode="decimal" placeholder="${fmtKg(bodyweight())}" value="${weighed ?? ""}" data-change="bw-today">
      <span class="small muted">kg</span>
    </label>
    ${list.length ? cards : `<div class="empty">Add the exercises of this workout as you go.</div>`}
    ${gapCard()}
    <button class="btn block ${list.length ? "" : "primary"}" style="margin-top:12px" data-action="add-exercise">+ Add exercise</button>
    <div class="row text-actions">
      ${!list.length ? "" : template(a.template)?.custom
        ? `<button class="link" data-action="update-template">Update template</button>`
        : `<button class="link" data-action="save-template">Save as template</button>`}
      <span class="grow"></span>
      <button class="link danger" data-action="discard">Discard workout</button>
    </div>`;
  return {
    title: a.name, mainClass: "workout", body,
    right: `<span class="small muted num" id="elapsed"></span><button class="btn small primary" data-action="finish">Finish</button>`,
  };
}

const LABEL = { warmup: "W", drop: "D", myo: "M" };
const typeOf = (set) => (set.warmup ? "warmup" : set.type ?? "");

function card(entry, e) {
  const ex = exercise(entry.ex);
  const target = targetFor(entry.ex);
  const slot = template(state.active.template)?.slots.find((s) => s.id === entry.slot);
  const work = entry.sets.filter((s) => !s.warmup && !s.type).length;
  const last = state.index.get(entry.ex)?.at(-1);
  let n = 0;
  const rows = entry.sets.map((set, s) => {
    const type = typeOf(set);
    const next = state.active.focus?.e === e && state.active.focus?.s === s;
    const field = (name, value, label) => `<input class="cell num" inputmode="decimal" enterkeyhint="done" value="${value ?? ""}"
      placeholder="${name === "kg" ? "kg" : "reps"}" aria-label="${label}" data-change="set-field" data-e="${e}" data-s="${s}" data-field="${name}">`;
    return `
      <div class="set ${type ? `t-${type}` : ""} ${set.done ? "done" : ""} ${next ? "next" : ""}" data-swipe>
        <button class="set-type" data-action="set-type" data-e="${e}" data-s="${s}" aria-label="Change set type">${LABEL[type] ?? ++n}</button>
        ${field("kg", set.kg == null ? null : fmtKg(set.kg), "Weight in kg")}<span class="times">×</span>${field("reps", set.reps, "Reps")}
        ${type ? "<span></span>" : `<button class="rir-btn" data-action="rir-step" data-e="${e}" data-s="${s}">RIR ${set.rir ?? "–"}${set.rir === 4 ? "+" : ""}</button>`}
        <button class="tick" data-action="tick" data-e="${e}" data-s="${s}" aria-label="${set.done ? "Undo set" : "Log set"}">${set.done ? icon.check : ""}</button>
        <button class="swipe-del" data-action="remove-set" data-e="${e}" data-s="${s}">Delete</button>
      </div>`;
  }).join("");
  return `
    <section class="ex-card ${entry.superset || state.active.exercises[e - 1]?.superset ? "superset" : ""}">
      <div class="ex-head">
        <div class="row" style="gap:8px">
          <div class="eyebrow grow">${esc(slot?.name ?? ex.muscle)} · ${work} sets · ${target.reps.join("–")} reps @ RIR ${target.rir.join("–")}</div>
          <button class="icon-btn" data-action="ex-menu" data-e="${e}" aria-label="Exercise options">${icon.more}</button>
        </div>
        <button class="name" data-action="swap" data-e="${e}">${esc(ex.name)} ${icon.swap}</button>
        <div class="last">${last ? `${ago(last.date)}: ${esc(setsText(last.sets))}` : "No history yet"}</div>
        <div class="reason mode-${entry.plan.mode}">${esc(entry.plan.reason)}</div>
        ${changeHint(entry, e, slot)}${altChips(entry, e, slot)}
      </div>
      ${rows}
      <button class="add-set" data-action="add-set" data-e="${e}">+ Set</button>
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
  const planned = new Map();
  for (const x of state.active.exercises) {
    for (const [m, share] of muscleShares(x.ex, state.library)) planned.set(m, (planned.get(m) ?? 0) + share * x.sets.filter((s) => !s.warmup).length);
  }
  const [muscle, sets] = MUSCLES.map((m) => [m, (stats.get(m)?.sets7 ?? 0) + (planned.get(m) ?? 0)]).sort((a, b) => a[1] - b[1])[0];
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

function linkButton(e) {
  const on = state.active.exercises[e].superset;
  return `<div class="link-btn"><button class="${on ? "on" : ""}" data-action="superset" data-e="${e}">${icon.link.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')} ${on ? "Superset" : "Make superset"}</button></div>`;
}

const setAt = ({ e, s }) => state.active.exercises[+e].sets[+s];
/** Save an edit of a set; an edit of a logged set also replans the open sets after it. */
const saved = (d) => (setAt(d).done ? setEdited(+d.e) : saveActive());
const input = (e, s, field) => document.querySelector(`[data-change="set-field"][data-e="${e}"][data-s="${s}"][data-field="${field}"]`);

/** Show the weights and reps of an exercise's sets in their fields without redrawing the screen,
 *  so the field being typed in keeps the keyboard. */
function showValues(e) {
  state.active.exercises[e].sets.forEach((set, s) => {
    for (const [field, value] of [["kg", set.kg == null ? "" : fmtKg(set.kg)], ["reps", set.reps]]) {
      const el = input(e, s, field);
      if (el && el !== document.activeElement) el.value = value;
    }
  });
}

// The check mark logs a set with the values shown, and a second tap undoes it. A set still
// without a weight puts the cursor in its weight field instead.
actions.tick = (d) => {
  const set = setAt(d);
  if (set.done) return undoSet(+d.e, +d.s);
  if (set.kg == null) {
    input(d.e, d.s, "kg")?.focus();
    return "keep";
  }
  return logSet(+d.e, +d.s);
};
actions["set-type"] = (d) => {
  const types = setTypes(state.active.exercises[+d.e].ex);
  return setType(+d.e, +d.s, types[(types.indexOf(typeOf(setAt(d))) + 1) % types.length]);
};
actions["set-field"] = async (d, el) => {
  const value = parseFloat(el.value.replace(",", "."));
  const set = setAt(d);
  if (d.field === "kg") Object.assign(set, { kg: Number.isFinite(value) ? Math.max(0, value) : null, edited: true });
  else if (Number.isFinite(value)) set.reps = Math.max(0, Math.round(value));
  await saved(d);
  showValues(+d.e);
  return "keep";
};
actions["rir-step"] = (d) => {
  const set = setAt(d);
  set.rir = ((set.rir ?? -1) + 1) % 5;
  return saved(d);
};
actions["remove-set"] = ({ e, s }) => removeSet(+e, +s);
actions["add-set"] = ({ e }) => addSet(+e);
actions.superset = ({ e }) => toggleSuperset(+e);
actions["bw-today"] = (_, el) => {
  const kg = parseFloat(el.value.replace(",", "."));
  return setWeight(today(), Number.isFinite(kg) && kg > 0 ? kg : null);
};

/** The ⋯ menu of an exercise: swap, warm-up sets, finisher, note and remove. */
actions["ex-menu"] = async ({ e }) => {
  const entry = state.active.exercises[+e];
  const options = [
    { key: "swap", label: "Swap exercise" },
    { key: "warmup", label: entry.warmup === false ? "Warm-up sets: off" : "Warm-up sets: on", on: entry.warmup !== false },
    ...(allowsFinisher(entry.ex) ? ["", "drop", "myo"].map((f) => ({ key: `fin-${f}`, label: FINISHER_LABEL[f], on: (entry.finisher ?? "") === f })) : []),
    { key: "note", label: entry.note ? "Edit note" : "Add note" },
    { key: "remove", label: "Remove exercise", danger: true },
  ];
  const pick = await choose(exercise(entry.ex).name, options);
  if (pick === "swap") return actions.swap({ e });
  if (pick === "warmup") return setWarmups(+e, entry.warmup === false);
  if (pick?.startsWith("fin-")) return setFinisher(+e, pick.slice(4));
  if (pick === "note") {
    const note = await ask("Note for this exercise", { ok: "Save", text: entry.note });
    if (note == null) return;
    entry.note = note.trim();
    return saveActive();
  }
  if (pick === "remove" && await ask("Remove this exercise from today's workout?", { ok: "Remove", danger: true })) return removeExercise(+e);
};
actions.alt = ({ e, id }) => swapExercise(+e, id);
actions.keep = ({ e }) => {
  state.program.keep ??= {};
  state.program.keep[state.active.exercises[+e].ex] = Date.now();
  return saveProgram();
};
actions["add-gap"] = ({ id }) => addExercise(id);
actions.swap = ({ e }) => {
  const entry = state.active.exercises[+e];
  const slot = template(state.active.template)?.slots.find((s) => s.id === entry.slot);
  openSheet({
    title: "Swap exercise",
    first: alternatives(entry.ex, slot, inWorkout(), 12),
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
  title: "Add exercise", first: [], exclude: inWorkout(),
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
