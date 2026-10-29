// Start-up, routing, event dispatch, the rest timer and screen wake lock.

import { state, loadState, saveActive } from "./state.js";
import { persist } from "./db.js";
import { actions, esc, icon, fmtClock } from "./ui.js";
import { today } from "./views/today.js";
import { workoutView } from "./views/workout-view.js";
import { historyView, sessionView } from "./views/log.js";
import { libraryView, exerciseView } from "./views/library-view.js";
import { musclesView } from "./views/muscles.js";
import { settingsView, applyTheme } from "./views/settings.js";
import { sheetHtml } from "./views/sheet.js";

const root = document.getElementById("app");
const TABS = [["today", "#today", "Today"], ["log", "#history", "History"], ["library", "#library", "Library"],
  ["muscles", "#muscles", "Muscles"], ["settings", "#setup", "Settings"]];

// Routes are plain names such as #history, or a name and an id such as #session-<id>.
function route() {
  const [, page, id] = location.hash.match(/^#([a-z]+)(?:-(.+))?$/) ?? [];
  switch (page) {
    case "workout": return workoutView();
    case "history": return historyView();
    case "session": return sessionView(decodeURIComponent(id));
    case "library": return libraryView();
    case "exercise": return exerciseView(id);
    case "muscles": return musclesView();
    case "setup": return settingsView();
    default: return today();
  }
}

export function render() {
  const view = route();
  const workout = location.hash === "#workout";
  const nav = workout ? "" : `<nav class="tabs">${TABS.map(([tab, href, label]) =>
    `<a href="${href}" class="${view.tab === tab ? "on" : ""}">${icon[tab]}${label}</a>`).join("")}</nav>`;
  root.innerHTML = `
    <header class="top">
      ${view.back ? `<a class="back" href="${view.back}">‹ Back</a>` : ""}
      <h1 class="ellipsis">${esc(view.title)}</h1>${view.right ?? ""}
    </header>
    <main class="${view.mainClass ?? ""}">${view.body}</main>
    ${nav}
    ${workout ? timerHtml() : ""}
    ${sheetHtml()}`;
  tick();
}

// --- Events -----------------------------------------------------------------------------

async function dispatch(name, el, event) {
  const handler = actions[name];
  if (!handler) return;
  const result = await handler({ ...el.dataset }, el, event);
  if (result !== "keep") render();
}

document.addEventListener("click", (event) => {
  unlockAudio();
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
window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  render();
});

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
  const elapsed = document.getElementById("elapsed");
  if (a && elapsed) elapsed.textContent = fmtClock((Date.now() - new Date(a.start)) / 1000);
  const rest = a?.rest;
  const clock = document.getElementById("timer-clock");
  if (!rest || !clock) return;
  const left = (rest.endsAt - Date.now()) / 1000;
  clock.textContent = fmtClock(Math.ceil(left));
  document.getElementById("timer-bar").style.width = `${Math.max(0, Math.min(100, (left / rest.total) * 100))}%`;
  const timer = document.getElementById("timer");
  timer.classList.toggle("over", left <= 0);
  document.getElementById("timer-label").textContent = left > 0 ? "Rest" : "Rest done";
  if (left <= 0 && alerted !== rest.endsAt) {
    alerted = rest.endsAt;
    if (left > -2) {
      beep();
      timer.classList.add("flash");
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

// Sound needs an AudioContext created during a user gesture on iOS.
let audio;
function unlockAudio() {
  if (audio) return;
  try {
    if (navigator.audioSession) navigator.audioSession.type = "transient";
    audio = new AudioContext();
  } catch { audio = null; }
}
function beep() {
  if (!audio) return;
  for (const [at, freq] of [[0, 880], [0.22, 1175]]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audio.currentTime + at);
    gain.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(audio.currentTime + at);
    osc.stop(audio.currentTime + at + 0.2);
  }
}

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
applyTheme();
render();
updateWakeLock();
persist();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
