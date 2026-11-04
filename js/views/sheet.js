// A bottom sheet for picking an exercise, used for swaps and for adding exercises.

import { state, exercise } from "../state.js";
import { actions, esc, ago } from "../ui.js";

let current = null;

/** opts: {title, first: ids listed on top, firstTitle, patternId, pattern (label), exclude: ids, pick(id)} */
export function openSheet(opts) {
  current = { query: "", ...opts };
}
export function closeSheet() {
  current = null;
}

export function sheetHtml() {
  if (!current) return "";
  return `
    <div class="sheet-bg" data-action="sheet-close" data-self="1">
      <div class="sheet">
        <div class="grabber"></div>
        <div class="row"><h2 class="grow" style="margin:0">${esc(current.title)}</h2>
          <button class="btn small" data-action="sheet-close">Cancel</button></div>
        <input class="search" style="margin:12px 0 4px" type="search" placeholder="Search all exercises" data-input="sheet-search">
        <div id="sheet-list">${listHtml()}</div>
      </div>
    </div>`;
}

function listHtml() {
  const q = current.query.trim().toLowerCase();
  const all = [...state.library.exercises.values()]
    .filter((e) => !current.exclude.includes(e.id) && e.muscle !== "other")
    .sort((a, b) => a.name.localeCompare(b.name));
  const sections = [];
  if (q) {
    sections.push(["Results", all.filter((e) => e.name.toLowerCase().includes(q) || e.muscle.includes(q))]);
  } else {
    if (current.first.length) sections.push([current.firstTitle, current.first.map(exercise)]);
    if (current.patternId) {
      sections.push([`Other ${current.pattern.toLowerCase()} exercises`,
        all.filter((e) => e.pattern === current.patternId && !current.first.includes(e.id))]);
    } else {
      for (const muscle of [...new Set(all.map((e) => e.muscle))].sort()) sections.push([muscle, all.filter((e) => e.muscle === muscle)]);
    }
  }
  return sections.filter(([, list]) => list.length).map(([title, list]) => `
    <div class="eyebrow section-title">${esc(title)}</div>
    <div class="list">${list.map(row).join("")}</div>`).join("") || `<div class="empty">No exercises found</div>`;
}

function row(e) {
  const last = state.index.get(e.id)?.at(-1)?.date;
  return `
    <button data-action="sheet-pick" data-id="${e.id}">
      <div class="grow"><div class="title ellipsis">${esc(e.name)}</div>
        <div class="small muted">${esc(e.muscle)} · ${esc(e.equipment)}${last ? ` · ${ago(last)}` : ""}</div></div>
    </button>`;
}

actions["sheet-close"] = () => closeSheet();
actions["sheet-pick"] = ({ id }) => current.pick(id);
actions["sheet-search"] = (_, el) => {
  current.query = el.value;
  document.getElementById("sheet-list").innerHTML = listHtml();
  return "keep";
};
