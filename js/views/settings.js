// Settings: importing data files, backup, rest timer defaults and theme.

import { state, saveSettings, saveProgram, reindex, DEFAULT_SETTINGS } from "../state.js";
import { kv, sessionStore, classifyImport, backup, clearAll } from "../db.js";
import { actions, ask, fmtClock, plural, toast } from "../ui.js";

export function settingsView() {
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
    <section class="card">
      <div class="eyebrow">Data</div>
      <p class="small muted">${plural(state.sessions.length, "workout")}${first ? ` from ${first} to ${last}` : ""},
        ${plural(state.body.length, "day")} of body data, ${state.program ? "program loaded" : "no program"}.</p>
      <label class="btn primary block">Import files
        <input type="file" accept=".json,application/json" multiple hidden data-change="import"></label>
      <p class="small muted">Select <code>program.json</code>, <code>body.json</code> and the month files in <code>sessions/</code>
        from your data folder, or a backup. Imported sessions replace sessions with the same id.</p>
      <button class="btn block" data-action="export">Export backup</button>
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
  return { title: "Settings", tab: "settings", body };
}

actions.import = async (_, input) => {
  try {
    const docs = await Promise.all([...input.files].map(async (f) => JSON.parse(await f.text())));
    const found = classifyImport(docs);
    const parts = [];
    if (found.program) {
      if (state.program && !(await ask("Replace the current program with the imported one?", { ok: "Replace" }))) delete found.program;
      else {
        state.program = found.program;
        await saveProgram();
        parts.push("program");
      }
    }
    if (found.body) {
      state.body = found.body;
      await kv.set("body", state.body);
      parts.push(plural(found.body.length, "day"));
    }
    if (found.settings) {
      state.settings = { ...DEFAULT_SETTINGS, ...found.settings };
      await saveSettings();
    }
    if (found.sessions.length) {
      await sessionStore.putMany(found.sessions);
      state.sessions = await sessionStore.all();
      parts.push(plural(found.sessions.length, "workout"));
    }
    reindex();
    toast(parts.length ? `Imported ${parts.join(", ")}` : "Nothing imported");
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
  input.value = "";
};

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
  if (!(await ask("Delete all workouts, the program and body data from this device?", { ok: "Delete", danger: true }))) return;
  await clearAll();
  Object.assign(state, { program: null, body: [], sessions: [], active: null, settings: { ...DEFAULT_SETTINGS } });
  reindex();
  applyTheme();
  toast("All data deleted");
};
