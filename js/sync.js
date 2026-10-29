// End-to-end encrypted sync through a private GitHub repository.
//
// The repository holds program.bin (program, settings, weigh-ins and deleted session ids) and one
// sessions-YYYY.bin per year of sessions. Each file is compressed and then encrypted on the
// device with AES-GCM, under a key derived from a passphrase with PBKDF2. The passphrase and
// the key never leave the device. spotter.json holds the salt and an encrypted check value, so
// another device derives the same key from the same passphrase and can verify it.
//
// A sync downloads the files that changed on GitHub since the last sync, merges them with the
// local data, and uploads every file whose merged content differs from the one on GitHub.
// Sessions merge by id and weigh-ins by date, the later edit winning, and deleted ids stay
// deleted; the program and the settings each take the more recently saved version.

import { kv, sessionStore } from "./db.js";
import { state, hooks, reindex, addCustomExercises, cleanSettings, cleanDeleted, cleanWeights, storeWeights } from "./state.js";
import { cleanProgram } from "./program.js";
import { cleanSession } from "./history.js";

const API = "https://api.github.com";
const HEADER = "spotter.json";
/** PBKDF2-HMAC-SHA256 iterations recommended by the OWASP Password Storage Cheat Sheet. */
const ITERATIONS = 600000;
const CHECK = "spotter";

// --- Encoding and encryption -------------------------------------------------------------

/** JSON with object keys sorted, so equal data always gives equal text. */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

const utf8 = new TextEncoder();
const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const sha256 = async (text) => toBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(text))));

export async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", utf8.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Text to bytes: a format byte (1: gzip, 0: none), a 12-byte IV, then the ciphertext. */
export async function encrypt(key, text) {
  const gzip = typeof CompressionStream === "function";
  const plain = gzip ? await pipe(utf8.encode(text), new CompressionStream("gzip")) : utf8.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return new Uint8Array([gzip ? 1 : 0, ...iv, ...cipher]);
}

export async function decrypt(key, bytes) {
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(1, 13) }, key, bytes.subarray(13)));
  return new TextDecoder().decode(bytes[0] === 1 ? await pipe(plain, new DecompressionStream("gzip")) : plain);
}

// --- GitHub ------------------------------------------------------------------------------

async function github(cfg, path, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(`${API}/repos/${cfg.repo}${path}`, {
    method, cache: "no-store", body: body && JSON.stringify(body),
    headers: { Authorization: `Bearer ${cfg.token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json" },
  });
  if (!res.ok) {
    const err = new Error(res.status === 401 ? "The token is invalid or expired"
      : res.status === 404 ? "Repository not found, or the token has no access to it" : `GitHub error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
}

/** The repository's top-level files as a map from name to blob sha; empty for an empty repository. */
async function listing(cfg) {
  try {
    return new Map((await github(cfg, "/contents")).map((f) => [f.name, f.sha]));
  } catch (err) {
    if (err.status === 404) return new Map();
    throw err;
  }
}

const download = (cfg, sha) => github(cfg, `/git/blobs/${sha}`, { raw: true });

async function upload(cfg, name, bytes, sha) {
  const res = await github(cfg, `/contents/${name}`, { method: "PUT", body: { message: `Update ${name}`, content: toBase64(bytes), ...(sha ? { sha } : {}) } });
  return res.content.sha;
}

// --- Connecting ------------------------------------------------------------------------

/**
 * Connect to a private repository with a fine-grained token and a passphrase. On an empty
 * repository the passphrase sets a new key; otherwise it must match the key already in use.
 */
export async function connect({ repo, token, passphrase }) {
  const cfg = { repo: repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/(\.git)?\/?$/, ""), token: token.trim(), files: {} };
  const info = await github(cfg, "");
  if (!info.private) throw new Error("The repository is public. Use a private repository.");
  const files = await listing(cfg);
  if (files.has(HEADER)) {
    const header = JSON.parse(new TextDecoder().decode(await download(cfg, files.get(HEADER))));
    cfg.salt = header.kdf.salt;
    cfg.key = await deriveKey(passphrase, fromBase64(cfg.salt));
    try {
      if (await decrypt(cfg.key, fromBase64(header.check)) !== CHECK) throw new Error();
    } catch {
      throw new Error("Wrong passphrase for the data in this repository");
    }
    // A device joining existing data takes over its program and settings.
    delete state.program.updatedAt;
    delete state.settings.updatedAt;
  } else {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    cfg.salt = toBase64(salt);
    cfg.key = await deriveKey(passphrase, salt);
    const header = { format: "spotter-sync", version: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: cfg.salt },
      check: toBase64(await encrypt(cfg.key, CHECK)) };
    await upload(cfg, HEADER, utf8.encode(JSON.stringify(header, null, 2)));
  }
  await kv.set("sync", cfg);
  return sync();
}

export const disconnect = () => kv.delete("sync");
export const syncStatus = () => kv.get("sync").then((cfg) => cfg && { repo: cfg.repo, last: cfg.last ?? null, error: cfg.error ?? null });

// --- Syncing -----------------------------------------------------------------------------

const yearOf = (s) => s.start.slice(0, 4);

function localDoc(name) {
  if (name === "program.bin") return { program: state.program, settings: state.settings, deleted: state.deleted, weights: state.weights };
  const year = name.slice(9, 13);
  return { sessions: state.sessions.filter((s) => yearOf(s) === year) };
}

const newer = (mine, theirs) => ((theirs?.updatedAt ?? 0) >= (mine?.updatedAt ?? 0) ? theirs : mine);

/** Merge a downloaded document into the local one. Downloaded data passes the same checks as
 *  a backup file. A session edited into another year stays where its newest version is. */
function merge(name, mine, theirs) {
  if (name === "program.bin") {
    const deleted = cleanDeleted(theirs.deleted);
    for (const [id, at] of Object.entries(mine.deleted ?? {})) deleted[id] = Math.max(at, deleted[id] ?? 0);
    const weights = { ...mine.weights };
    for (const [date, w] of Object.entries(cleanWeights(theirs.weights))) if (w.at > (weights[date]?.at ?? -1)) weights[date] = w;
    return { program: newer(mine.program, cleanProgram(theirs.program)), settings: newer(mine.settings, cleanSettings(theirs.settings)), deleted, weights };
  }
  const local = new Map(state.sessions.map((s) => [s.id, s]));
  const byId = new Map(mine.sessions.map((s) => [s.id, s]));
  for (const s of (theirs.sessions ?? []).map(cleanSession).filter(Boolean)) {
    const own = local.get(s.id);
    if (!own || (s.editedAt ?? 0) > (own.editedAt ?? 0)) byId.set(s.id, s);
  }
  return { sessions: [...byId.values()].filter((s) => yearOf(s) === name.slice(9, 13) && !state.deleted[s.id]) };
}

/** Store a merged document on this device. */
async function apply(name, doc) {
  if (name === "program.bin") {
    Object.assign(state, { program: doc.program, settings: doc.settings, deleted: doc.deleted });
    addCustomExercises(doc.program.extra);
    await Promise.all([kv.set("program", doc.program), kv.set("settings", doc.settings), kv.set("deleted", doc.deleted), storeWeights(doc.weights)]);
    const gone = state.sessions.filter((s) => doc.deleted[s.id]);
    await Promise.all(gone.map((s) => sessionStore.delete(s.id)));
    state.sessions = state.sessions.filter((s) => !doc.deleted[s.id]);
  } else {
    const year = name.slice(9, 13);
    const ids = new Set(doc.sessions.map((s) => s.id));
    const gone = state.sessions.filter((s) => yearOf(s) === year && !ids.has(s.id));
    await Promise.all([sessionStore.putMany(doc.sessions), ...gone.map((s) => sessionStore.delete(s.id))]);
    state.sessions = [...state.sessions.filter((s) => yearOf(s) !== year && !ids.has(s.id)), ...doc.sessions].sort((a, b) => a.start.localeCompare(b.start));
  }
}

async function run(cfg) {
  const remote = await listing(cfg);
  const years = new Set([...state.sessions.map(yearOf), ...[...remote.keys()].filter((n) => /^sessions-\d{4}\.bin$/.test(n)).map((n) => n.slice(9, 13))]);
  let changed = false;
  for (const name of ["program.bin", ...[...years].sort().map((y) => `sessions-${y}.bin`)]) {
    const sha = remote.get(name);
    const known = cfg.files[name];
    let doc = localDoc(name);
    let remoteHash = sha && sha === known?.sha ? known.hash : null;
    if (sha && sha !== known?.sha) {
      const text = await decrypt(cfg.key, await download(cfg, sha));
      remoteHash = await sha256(text);
      const merged = merge(name, doc, JSON.parse(text));
      if (stable(merged) !== stable(doc)) {
        await apply(name, merged);
        changed = true;
      }
      doc = merged;
    }
    const text = stable(doc);
    const hash = await sha256(text);
    cfg.files[name] = { sha: hash === remoteHash ? sha : await upload(cfg, name, await encrypt(cfg.key, text), sha), hash };
  }
  if (changed) {
    reindex();
    window.dispatchEvent(new Event("spotter-synced"));
  }
}

let running = null;
let again = false;

/** Sync now. A sync requested while one runs follows it. */
export function sync() {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const cfg = await kv.get("sync");
    if (!cfg) return;
    try {
      await run(cfg).catch((err) => (err.status === 409 || err.status === 422 ? run(cfg) : Promise.reject(err)));
      Object.assign(cfg, { last: Date.now(), error: null });
    } catch (err) {
      cfg.error = navigator.onLine === false ? "Offline" : err.message;
    }
    await kv.set("sync", cfg);
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      sync();
    }
  });
  return running;
}

let timer;
/** Sync at start-up, a few seconds after each change, and when the app returns to the screen. */
export function startSync() {
  hooks.changed = () => {
    clearTimeout(timer);
    timer = setTimeout(sync, 3000);
  };
  sync();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
  window.addEventListener("online", () => sync());
}
