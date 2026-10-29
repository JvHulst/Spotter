// Settings: sync, import and backup, bodyweight, rest timer defaults and theme.

import { state, saveSettings, saveProgram, saveSessions, addCustomExercises, reindex, cleanSettings, cleanDeleted, DEFAULT_SETTINGS } from "../state.js";
import { kv, backup, clearAll } from "../db.js";
import { defaultProgram, cleanProgram } from "../program.js";
import { cleanSession } from "../history.js";
import { parseCsv, strongSessions } from "../strong.js";
import { connect, disconnect, sync, syncStatus } from "../sync.js";
import { actions, ask, esc, fmtClock, fmtKg, plural, toast, ago } from "../ui.js";

let status = null;

export function settingsView() {
  syncStatus().then((s) => {
    if (JSON.stringify(s) !== JSON.stringify(status)) {
      status = s;
      const el = document.getElementById("sync-card");
      if (el) el.innerHTML = syncCard();
    }
  });
  const s = state.settings;
  const rest = (key, label) => `
    <div class="row" style="padding:6px 0">
      <div class="grow">${label}</div>
      <button class="btn small" data-action="rest-step" data-key="${key}" data-d="-1">−15 s</button>
      <b class="num" style="min-width:48px;text-align:center">${fmtClock(s[key])}</b>
      <button class="btn small" data-action="rest-step" data-key="${key}" data-d="1">+15 s</button>
    </div>`;
  const first = state.sessions[0]?.start.slice(0, 10), last = state.sessions.at(-1)?.start.slice(0, 10);
  const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  const theme = s.theme ?? "system";
  const body = `
    ${standalone ? "" : `<section class="card"><b>Install on iPhone</b><p class="small muted" style="margin:4px 0 0">In Safari, tap Share, then Add to Home Screen. The app then opens full screen and works offline.</p></section>`}
    <section class="card" id="sync-card">${syncCard()}</section>
    <section class="card">
      <div class="eyebrow">Data</div>
      <p class="small muted">${plural(state.sessions.length, "workout")}${first ? ` from ${first} to ${last}` : ""} on this device.</p>
      <label class="btn primary block">Import
        <input type="file" accept=".csv,text/csv,.json,application/json" multiple hidden data-change="import"></label>
      <p class="small muted">A Strong export (in Strong: Settings, Export Strong Data) adds its workouts; importing it again
        updates them. A Spotter backup restores everything it holds.</p>
      <button class="btn block" data-action="export">Export backup</button>
    </section>
    <section class="card">
      <div class="eyebrow">Bodyweight</div>
      <div class="row" style="padding:6px 0">
        <div class="grow small muted">For pull-ups, dips and other bodyweight exercises</div>
        <button class="btn small" data-action="bw-step" data-d="-1">−</button>
        <b class="num" style="min-width:64px;text-align:center">${fmtKg(s.bodyweight)} kg</b>
        <button class="btn small" data-action="bw-step" data-d="1">+</button>
      </div>
    </section>
    <section class="card">
      <div class="eyebrow">Rest timer</div>
      ${rest("restCompound", "Compound")}${rest("restIsolation", "Isolation")}
      ${rest("restSuperset", "Superset")}${rest("restWarmup", "Warm-up")}
    </section>
    <section class="card">
      <div class="eyebrow">Appearance</div>
      <div class="chips" style="margin-top:8px">${["system", "dark", "light"].map((t) =>
        `<button class="chip ${theme === t ? "on" : ""}" data-action="theme" data-t="${t}" style="text-transform:capitalize">${t}</button>`).join("")}</div>
    </section>
    <button class="btn block danger" data-action="wipe">Delete all data on this device</button>`;
  return { title: "Settings", back: "#today", body };
}

function syncCard() {
  if (status) {
    const line = status.error ? `<span class="mode-down">Not synced: ${esc(status.error)}</span>`
      : status.last ? `Synced ${ago(new Date(status.last)) === "today" ? "today" : ago(new Date(status.last))}, ${new Date(status.last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not synced yet";
    return `
      <div class="eyebrow">Sync</div>
      <p class="small" style="margin:6px 0 2px"><b>${esc(status.repo)}</b></p>
      <p class="small muted" style="margin:0 0 10px">${line}. Encrypted on this device with your passphrase.</p>
      <div class="row"><button class="btn small primary grow" data-action="sync-now">Sync now</button>
        <button class="btn small" data-action="sync-off">Disconnect</button></div>`;
  }
  return `
    <div class="eyebrow">Sync</div>
    <p class="small muted" style="margin:6px 0 10px">Keeps an encrypted copy of your data in a private GitHub repository, and keeps
      devices in step. Only your passphrase can read it: GitHub sees ciphertext.</p>
    <details class="small muted"><summary>How to set it up</summary><ol style="padding-left:18px;margin:6px 0">
      <li>On github.com, create a new <b>private</b> repository, for example <code>spotter-data</code>.</li>
      <li>Under Settings, Developer settings, Personal access tokens, Fine-grained tokens, generate a token with access to
        only that repository and the permission Contents: Read and write.</li>
      <li>Enter both below with a passphrase of at least 12 characters that you will not forget, such as four random
        words. Use the same passphrase on every device; without it the synced data cannot be read.</li>
      <li>Connect the device that holds your data first. A device that connects later takes over its program and settings.</li></ol></details>
    <input class="search" style="margin-top:8px" id="sync-repo" placeholder="owner/repository" autocapitalize="off" autocorrect="off" spellcheck="false">
    <input class="search" style="margin-top:8px" id="sync-token" placeholder="Token (github_pat_…)" autocapitalize="off" autocorrect="off" spellcheck="false">
    <input class="search" style="margin-top:8px" id="sync-pass" type="password" placeholder="Passphrase" autocomplete="current-password">
    <button class="btn primary block" style="margin-top:10px" data-action="sync-connect">Connect</button>`;
}

actions["sync-connect"] = async (_, button) => {
  const [repo, token, passphrase] = ["sync-repo", "sync-token", "sync-pass"].map((id) => document.getElementById(id).value);
  if (!repo.includes("/") || !token || passphrase.length < 12) {
    toast("Fill in owner/repository, the token, and a passphrase of at least 12 characters");
    return "keep";
  }
  Object.assign(button, { disabled: true, textContent: "Connecting…" });
  try {
    await connect({ repo, token, passphrase });
    status = await syncStatus();
    toast(status?.error ? `Connected, but sync failed: ${status.error}` : "Connected and synced");
  } catch (err) {
    toast(err.message);
    Object.assign(button, { disabled: false, textContent: "Connect" });
    return "keep";
  }
};
actions["sync-now"] = async (_, button) => {
  Object.assign(button, { disabled: true, textContent: "Syncing…" });
  await sync();
  status = await syncStatus();
  toast(status?.error ? `Sync failed: ${status.error}` : "Synced");
};
actions["sync-off"] = async () => {
  if (!(await ask("Stop syncing on this device? The data on GitHub and on this device stays.", { ok: "Disconnect" }))) return;
  await disconnect();
  status = null;
};

/** Read Strong exports (CSV) and Spotter backups (JSON). */
actions.import = async (_, input) => {
  const parts = [];
  try {
    for (const file of input.files) {
      const text = await file.text();
      if (/\.csv$/i.test(file.name) || !text.trimStart().startsWith("{")) {
        const { sessions: all, extra } = strongSessions(parseCsv(text), state.library);
        if (!all.length) throw new Error(`${file.name} holds no Strong workouts`);
        const sessions = all.filter((s) => !state.deleted[s.id]);
        if (extra.length) await addExtra(extra);
        await saveSessions(sessions);
        parts.push(`${plural(sessions.length, "workout")} from Strong${extra.length ? ` (${plural(extra.length, "new exercise")})` : ""}`);
      } else {
        parts.push(await restore(JSON.parse(text)));
      }
    }
    toast(`Imported ${parts.join(", ")}`);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
  input.value = "";
};

async function addExtra(list) {
  const known = new Set(state.program.extra.map((e) => e.id));
  state.program.extra.push(...list.filter((e) => !known.has(e.id)));
  addCustomExercises(list);
  await saveProgram();
}

/** Load a backup: its sessions are added, and its program and settings replace the current ones.
 *  Every part passes a check of its fields, since a backup file may come from anyone. */
async function restore(doc) {
  if (doc?.format !== "spotter-backup") throw new Error("Not a Strong export or Spotter backup");
  const parts = [];
  if (doc.program && await ask("Replace the program on this device with the one in the backup?", { ok: "Replace" })) {
    state.program = cleanProgram(doc.program);
    addCustomExercises(state.program.extra);
    await saveProgram();
    parts.push("program");
  }
  const weight = doc.body?.findLast?.((d) => d.weightKg)?.weightKg;
  if (doc.settings || Number.isFinite(weight)) {
    state.settings = { ...cleanSettings({ ...state.settings, ...doc.settings }), ...(Number.isFinite(weight) ? { bodyweight: weight } : {}) };
    await saveSettings();
  }
  if (doc.deleted) {
    Object.assign(state.deleted, cleanDeleted(doc.deleted));
    await kv.set("deleted", state.deleted);
  }
  const sessions = (Array.isArray(doc.sessions) ? doc.sessions : []).map(cleanSession).filter((s) => s && !state.deleted[s.id]);
  if (sessions.length) await saveSessions(sessions);
  return [...parts, plural(sessions.length, "workout")].join(" and ");
}

actions.export = async () => {
  const data = JSON.stringify(backup(state));
  const name = `spotter-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {});
  } else {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
};

actions["bw-step"] = ({ d }) => {
  state.settings.bodyweight = Math.max(30, Math.round((state.settings.bodyweight + 0.5 * +d) * 10) / 10);
  reindex();
  return saveSettings();
};

actions["rest-step"] = ({ key, d }) => {
  state.settings[key] = Math.min(600, Math.max(15, state.settings[key] + 15 * +d));
  return saveSettings();
};

actions.theme = ({ t }) => {
  state.settings.theme = t;
  applyTheme();
  return saveSettings();
};

export function applyTheme() {
  const t = state.settings.theme;
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

actions.wipe = async () => {
  if (!(await ask("Delete all workouts, the program and the settings from this device? Data synced to GitHub stays there.", { ok: "Delete", danger: true }))) return;
  await clearAll();
  Object.assign(state, { program: defaultProgram(), sessions: [], deleted: {}, active: null, settings: { ...DEFAULT_SETTINGS } });
  reindex();
  applyTheme();
  status = null;
  toast("All data deleted");
};
