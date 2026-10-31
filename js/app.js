// Start-up, routing, event dispatch, the rest timer and screen wake lock.

import { state, loadState, saveActive } from "./state.js";
import { persist } from "./db.js";
import { actions, esc, icon, fmtClock, markPoint } from "./ui.js";
import { today, templateView, settingsLink } from "./views/today.js";
import { workoutView } from "./views/workout-view.js";
import { historyView, sessionView, summaryView } from "./views/log.js";
import { libraryView, exerciseView, exerciseOrigin } from "./views/library-view.js";
import { musclesView } from "./views/muscles.js";
import { progressView, bodyView, trackedView } from "./views/progress.js";
import { settingsView, applyAppearance } from "./views/settings.js";
import { startSync } from "./sync.js";
import { sheetHtml } from "./views/sheet.js";
import { playSound, unlockAudio } from "./sounds.js";
import { beginReorder } from "./reorder.js";

const root = document.getElementById("app");
const TABS = [["today", "#today", "Today"], ["log", "#history", "History"], ["progress", "#progress", "Progress"],
  ["muscles", "#muscles", "Muscles"], ["library", "#library", "Library"]];

// Routes are plain names such as #history, or a name and an id such as #session-<id>.
function route() {
  const [, page, id] = location.hash.match(/^#([a-z]+)(?:-(.+))?$/) ?? [];
  if (page !== "exercise") exerciseOrigin.back = null;
  switch (page) {
    case "workout": return workoutView();
    case "history": return historyView();
    case "session": return sessionView(decodeURIComponent(id));
    case "done": return summaryView(decodeURIComponent(id));
    case "library": return libraryView();
    case "exercise": return exerciseView(id);
    case "muscles": return musclesView();
    case "progress": return progressView();
    case "body": return bodyView();
    case "tracked": return trackedView();
    case "template": return templateView(id);
    case "setup": return settingsView();
    default: return today();
  }
}

export function render() {
  const view = route();
  const workout = location.hash === "#workout";
  const minimized = Boolean(state.active) && !workout;
  const nav = workout ? "" : `<nav class="tabs">${TABS.map(([tab, href, label]) =>
    `<a href="${href}" class="${view.tab === tab ? "on" : ""}">${icon[tab]}${label}</a>`).join("")}</nav>`;
  document.querySelector(".tip")?.remove();
  root.classList.toggle("has-mini", minimized);
  root.innerHTML = `
    <header class="top">
      ${view.back ? `<a class="back" href="${view.back}">‹ Back</a>` : ""}
      <h1 class="ellipsis">${esc(view.title)}</h1>${view.right ?? (view.tab ? settingsLink() : "")}
    </header>
    <main class="${view.mainClass ?? ""}">${view.body}</main>
    ${minimized ? miniBar() : ""}
    ${nav}
    ${workout ? timerHtml() : ""}
    ${sheetHtml()}`;
  tick();
}

/** The bar above the tabs that stands in for a workout in progress while the user browses. */
const miniBar = () => `
  <a class="mini" href="#workout">
    <div class="grow">
      <b class="ellipsis">${esc(state.active.name)}</b>
      <div class="small muted num"><span id="mini-elapsed"></span><span id="mini-rest"></span></div>
    </div>
    <span class="btn small primary">Resume</span>
  </a>`;

// --- Events -----------------------------------------------------------------------------

async function dispatch(name, el, event) {
  const handler = actions[name];
  if (!handler) return;
  const result = await handler({ ...el.dataset }, el, event);
  if (result !== "keep") render();
}

// A grip (data-drag) starts a drag; its data-drag-action receives the old and new position and
// runs only when the item moved.
document.addEventListener("pointerdown", (event) => {
  const grip = event.target.closest("[data-drag]");
  if (!grip || (event.pointerType === "mouse" && event.button !== 0)) return;
  beginReorder(event, grip, (from, to) => {
    if (from === to) return;
    Object.assign(grip.dataset, { from, to });
    return dispatch(grip.dataset.dragAction, grip, event);
  });
});

document.addEventListener("click", (event) => {
  unlockAudio();
  document.querySelector(".tip")?.remove();
  // A click that ends a swipe does nothing, and a tap on a swiped row closes it, except on its
  // delete button.
  const row = event.target.closest("[data-swipe]");
  const onDelete = event.target.closest(".swipe-del");
  if (row && !onDelete && Date.now() - Number(row.dataset.swiped ?? 0) < 400) return event.preventDefault();
  if (row?.classList.contains("swiped") && !onDelete) {
    row.classList.remove("swiped");
    return event.preventDefault();
  }
  closeSwipes();
  const tip = event.target.closest("[data-tip], svg.chart [data-v]");
  if (tip) return markPoint(tip);
  const el = event.target.closest("[data-action]");
  if (!el || (el.dataset.self && event.target !== el)) return;
  event.preventDefault();
  dispatch(el.dataset.action, el, event);
});
document.addEventListener("change", (event) => {
  const el = event.target.closest("[data-change]");
  if (el) dispatch(el.dataset.change, el, event);
});
document.addEventListener("input", (event) => {
  const el = event.target.closest("[data-input]");
  if (el) dispatch(el.dataset.input, el, event);
});
// Tapping a number field selects its whole value, so typing replaces it. The delay lets iOS
// finish placing the cursor first.
document.addEventListener("focusin", (event) => {
  const el = event.target;
  if (el.matches?.('input[inputmode="decimal"]')) setTimeout(() => el.setSelectionRange(0, el.value.length), 0);
});
// While a dialog, sheet or dropdown is open, its backdrop does not scroll the page behind it.
document.addEventListener("touchmove", (event) => {
  if (event.target.matches?.(".sheet-bg, .dropdown-bg")) event.preventDefault();
}, { passive: false });
// Data from another device arrived; redraw unless the user is typing, dragging or in a workout.
window.addEventListener("spotter-synced", () => {
  applyAppearance();
  if (location.hash !== "#workout" && !document.activeElement?.matches("input, textarea") && !document.querySelector(".reordering")) render();
});
window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  render();
});

// --- Swipe to delete: a row with data-swipe slides left to reveal its delete button ----------

let swipe = null;
const closeSwipes = (except) => document.querySelectorAll(".swiped").forEach((row) => row !== except && row.classList.remove("swiped"));
document.addEventListener("touchstart", (event) => {
  const row = event.target.closest("[data-swipe]");
  closeSwipes(row);
  swipe = row ? { row, x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
}, { passive: true });
document.addEventListener("touchmove", (event) => {
  if (!swipe) return;
  const dx = event.touches[0].clientX - swipe.x, dy = event.touches[0].clientY - swipe.y;
  if (Math.abs(dy) > Math.abs(dx)) swipe = null;
  else if (Math.abs(dx) > 30) {
    swipe.row.classList.toggle("swiped", dx < 0);
    swipe.row.dataset.swiped = String(Date.now());
    swipe = null;
  }
}, { passive: true });

// --- Charts: touching a chart and moving sideways marks the value nearest to the finger ------

function scrub(event) {
  const chart = event.target.closest?.("svg.chart");
  if (!chart || (event.pointerType === "mouse" && !event.buttons)) return;
  let nearest = null, best = Infinity;
  for (const el of chart.querySelectorAll("[data-v]")) {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - event.clientX);
    if (d < best) [nearest, best] = [el, d];
  }
  if (nearest && !nearest.classList.contains("marked")) markPoint(nearest);
}
document.addEventListener("pointerdown", scrub);
document.addEventListener("pointermove", scrub);

// --- Rest timer ---------------------------------------------------------------------------

function timerHtml() {
  if (!state.active?.rest) return "";
  return `
    <div class="timer" id="timer">
      <div class="bar"><div id="timer-bar"></div></div>
      <div class="inner">
        <div class="clock num" id="timer-clock"></div>
        <div class="grow small muted" id="timer-label">Rest</div>
        <button class="btn small" data-action="rest-add" data-s="-15">−15</button>
        <button class="btn small" data-action="rest-add" data-s="15">+15</button>
        <button class="btn small primary" data-action="rest-skip">Skip</button>
      </div>
    </div>`;
}

let alerted = null;
function tick() {
  const a = state.active;
  if (!a) return;
  const clock = fmtClock((Date.now() - new Date(a.start)) / 1000);
  for (const id of ["elapsed", "mini-elapsed"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = clock;
  }
  const rest = a.rest;
  if (!rest) return;
  const left = (rest.endsAt - Date.now()) / 1000;
  const miniRest = document.getElementById("mini-rest");
  if (miniRest) miniRest.textContent = left > 0 ? ` · Rest ${fmtClock(Math.ceil(left))}` : "";
  const timer = document.getElementById("timer");
  if (timer) {
    document.getElementById("timer-clock").textContent = fmtClock(Math.ceil(left));
    document.getElementById("timer-bar").style.width = `${Math.max(0, Math.min(100, (left / rest.total) * 100))}%`;
    timer.classList.toggle("over", left <= 0);
    document.getElementById("timer-label").textContent = left > 0 ? "Rest" : "Rest done";
  }
  if (left <= 0 && alerted !== rest.endsAt) {
    alerted = rest.endsAt;
    if (left > -2) {
      playSound(state.settings.sound);
      timer?.classList.add("flash");
    }
  }
}
setInterval(tick, 250);

actions["rest-add"] = ({ s }) => {
  state.active.rest.endsAt += +s * 1000;
  state.active.rest.total = Math.max(1, state.active.rest.total + +s);
  return saveActive();
};
actions["rest-skip"] = () => {
  state.active.rest = null;
  return saveActive();
};

// --- Wake lock: keep the screen on during a workout so the timer stays visible ----------

let wakeLock = null;
async function updateWakeLock() {
  const want = Boolean(state.active) && document.visibilityState === "visible";
  if (want && !wakeLock && navigator.wakeLock) {
    wakeLock = await navigator.wakeLock.request("screen").catch(() => null);
    wakeLock?.addEventListener("release", () => { wakeLock = null; });
  } else if (!want && wakeLock) {
    await wakeLock.release().catch(() => {});
  }
}
document.addEventListener("visibilitychange", () => {
  updateWakeLock();
  if (document.visibilityState === "visible") render();
});
window.addEventListener("hashchange", updateWakeLock);

// --- Start --------------------------------------------------------------------------------

await loadState();
applyAppearance();
render();
updateWakeLock();
persist();
startSync();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
