// Rest alerts while Spotter is in the background or the phone is locked. This device's choice
// (`alert`, not synced) is one of:
//
// - "push": when the app goes to the background during a rest, it asks the push server
//   (push/worker.js) for a push at the end of the rest, and when it comes back it cancels that
//   request. The service worker shows the push as a notification with the system sound, which
//   plays over music. The app encrypts the notification text for this device (RFC 8291), so the
//   push server and the push service see only when an alert is due.
// - "timer": each rest starts the iPhone's own timer through the shortcut named SHORTCUT, which
//   shows a countdown on the lock screen. Starting it switches to the Shortcuts app.

import { kv } from "./db.js";
import { state, exercise } from "./state.js";
import { fmtKg } from "./ui.js";

/** The push server, deployed with push/deploy.py; empty while there is none. */
export const PUSH_SERVER = "";
/** The shortcut that starts a timer for the number of seconds it receives as text. */
export const SHORTCUT = "Spotter Rest";

let device = { alert: "off", push: null };
export const alertMode = () => device.alert;
export async function loadDevice() {
  device = { ...device, ...(await kv.get("device")) };
}

/** Whether this browser can receive push: on an iPhone only in the app on the home screen. */
export const pushSupported = () => Boolean(PUSH_SERVER) && "PushManager" in window && "serviceWorker" in navigator && "Notification" in window;

/** Choose how rests end in the background. "push" asks for notification permission and
 *  subscribes this device to the push server's key; must run in the handler of a tap. */
export async function setAlertMode(mode) {
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
  if (mode === "push") {
    if (await Notification.requestPermission() !== "granted") throw new Error("Allow notifications for Spotter in the iPhone's Settings first");
    const { key } = await (await fetch(`${PUSH_SERVER}/key`)).json();
    await (await registration.pushManager.getSubscription())?.unsubscribe();
    device.push = (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64(key) })).toJSON();
  } else if (device.push) {
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
    device.push = null;
  }
  device.alert = mode;
  await kv.set("device", device);
}

/** The URL that runs the timer shortcut for `seconds`. */
export const shortcutUrl = (seconds) => `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT)}&input=text&text=${Math.round(seconds)}`;

/** A rest started: for "timer" start the iPhone's timer, which must happen in the handler of a
 *  tap, and for "push" prepare the alert. */
export function restStarted() {
  const rest = state.active?.rest;
  if (rest && device.alert === "timer") location.href = shortcutUrl((rest.endsAt - Date.now()) / 1000);
  restChanged();
}
/** The end of the rest changed: prepare the push alert for the new end. */
export function restChanged() {
  const rest = state.active?.rest;
  if (rest && device.alert === "push" && device.push) prepare(rest).catch(() => {});
}

// --- Push: an alert is requested when the app is hidden and cancelled when it is shown ---------

let prepared = null; // {at, body}: the encrypted alert for the rest ending at `at`
let requested = false;

function prepare(rest) {
  const next = state.active.focus && state.active.exercises[state.active.focus.e];
  const set = next?.sets[state.active.focus.s];
  const message = { title: "Rest is over", body: next ? `Next: ${exercise(next.ex).name}${set?.kg != null ? `, ${fmtKg(set.kg)} kg × ${set.reps}` : ""}` : "" };
  return encryptPush(new TextEncoder().encode(JSON.stringify(message)), device.push.keys)
    .then((body) => { prepared = { at: rest.endsAt, body: toBase64(body) }; });
}

const send = (path, data) => navigator.sendBeacon(`${PUSH_SERVER}/${path}`, new Blob([JSON.stringify(data)], { type: "text/plain" }));

document.addEventListener("visibilitychange", async () => {
  if (device.alert !== "push" || !device.push || !PUSH_SERVER) return;
  if (document.visibilityState === "visible") {
    if (requested) send("cancel", { endpoint: device.push.endpoint });
    requested = false;
    return;
  }
  const rest = state.active?.rest;
  if (!rest || rest.endsAt - Date.now() < 3000) return;
  if (prepared?.at !== rest.endsAt) await prepare(rest).catch(() => {});
  if (prepared?.at === rest.endsAt) requested = send("schedule", { endpoint: device.push.endpoint, at: rest.endsAt, body: prepared.body });
});

// --- Message encryption for web push (RFC 8291, aes128gcm content coding of RFC 8188) ----------

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64 = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
};
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/**
 * Encrypt a push message for the subscription keys {p256dh, auth} (base64url) as one record:
 * salt (16 bytes), record size (4), key id length (1), the sender's public key (65), and the
 * AES-GCM ciphertext of the message followed by the padding delimiter 2. `fixed` sets the salt
 * and the sender's ECDH key pair {publicKey (raw bytes), privateKey}, for tests; they are random
 * otherwise.
 */
export async function encryptPush(message, { p256dh, auth }, fixed = {}) {
  const salt = fixed.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const ecdh = { name: "ECDH", namedCurve: "P-256" };
  const own = fixed.privateKey ? fixed : await crypto.subtle.generateKey(ecdh, true, ["deriveBits"]);
  const ownPublic = fixed.publicKey ?? new Uint8Array(await crypto.subtle.exportKey("raw", own.publicKey));
  const theirPublic = fromBase64(p256dh);
  const theirKey = await crypto.subtle.importKey("raw", theirPublic, ecdh, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirKey }, own.privateKey, 256));
  const text = (s) => new TextEncoder().encode(s);
  const ikm = await hkdf(fromBase64(auth), shared, concat(text("WebPush: info\0"), theirPublic, ownPublic), 32);
  const cek = await crypto.subtle.importKey("raw", await hkdf(salt, ikm, text("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["encrypt"]);
  const nonce = await hkdf(salt, ikm, text("Content-Encoding: nonce\0"), 12);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cek, concat(message, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = ownPublic.length;
  return concat(header, ownPublic, cipher);
}
