// Push server for Spotter's rest alerts: a Cloudflare Worker with one Durable Object, deployed
// with push/deploy.py.
//
// The app asks for an alert at a time, with a message it encrypted for the device (RFC 8291),
// and may cancel it. At that time the Durable Object's alarm sends the message to the device's
// push endpoint, signed with this server's VAPID key (RFC 8292), which it creates on first use.
// It keeps one pending alert per endpoint and nothing once the alert is sent.
//
//   GET  /key       {key}: the public VAPID key, for PushManager.subscribe
//   POST /schedule  {endpoint, at, body}: send body (base64url) to endpoint at `at` (ms since 1970)
//   POST /cancel    {endpoint}: drop the pending alert of endpoint
//
// POST bodies are JSON sent as text/plain, the way navigator.sendBeacon sends them.

const CONTACT = "https://jvhulst.github.io/Spotter/";
/** Hosts of the browsers' push services; other endpoints are refused, so the server cannot be
 *  used to send requests elsewhere. */
const PUSH_HOSTS = /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+\.notify\.windows\.com)$/;
const MAX_AHEAD = 2 * 3600 * 1000;
const MAX_BODY = 5000;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    const scheduler = env.SCHEDULER.get(env.SCHEDULER.idFromName("main"));
    return cors(await scheduler.fetch(request));
  },
};

const cors = (response) => {
  const out = new Response(response.body, response);
  out.headers.set("Access-Control-Allow-Origin", "*");
  out.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return out;
};
const status = (code) => new Response(null, { status: code });

function validEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.test(url.hostname) && endpoint.length <= 1000;
  } catch {
    return false;
  }
}

export class Scheduler {
  constructor(ctx) {
    this.ctx = ctx;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/key") return Response.json({ key: (await this.keys()).publicKey });
    if (request.method !== "POST") return status(404);
    let job;
    try {
      job = JSON.parse(await request.text());
    } catch {
      return status(400);
    }
    if (!validEndpoint(job?.endpoint)) return status(400);
    const name = `job:${job.endpoint}`;
    if (pathname === "/cancel") {
      await this.storage.delete(name);
    } else if (pathname === "/schedule" && Number.isFinite(job.at) && job.at - Date.now() < MAX_AHEAD
      && typeof job.body === "string" && job.body.length <= MAX_BODY) {
      await this.storage.put(name, { endpoint: job.endpoint, at: job.at, body: job.body });
    } else {
      return status(400);
    }
    await this.rearm();
    return status(204);
  }

  /** Send the alerts that are due, then wait for the next one. */
  async alarm() {
    const keys = await this.keys();
    for (const [name, job] of await this.storage.list({ prefix: "job:" })) {
      if (job.at > Date.now() + 500) continue;
      await this.storage.delete(name);
      await send(job, keys).catch(() => {});
    }
    await this.rearm();
  }

  /** Set the alarm to the earliest pending alert, or remove it when there is none. */
  async rearm() {
    const jobs = [...(await this.storage.list({ prefix: "job:" })).values()];
    if (jobs.length) await this.storage.setAlarm(Math.min(...jobs.map((j) => j.at)));
    else await this.storage.deleteAlarm();
  }

  /** The VAPID key pair as {publicKey (base64url, raw), privateKey (JWK)}, created once. */
  keys() {
    this.vapid ??= this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.storage.get("vapid");
      if (stored) return stored;
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
      const vapid = {
        publicKey: toBase64(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
        privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
      };
      await this.storage.put("vapid", vapid);
      return vapid;
    });
    return this.vapid;
  }
}

/** Send an alert to its push endpoint (RFC 8030), authorized by a VAPID token (RFC 8292). */
export async function send(job, { publicKey, privateKey }) {
  const key = await crypto.subtle.importKey("jwk", privateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const token = await signJwt({ aud: new URL(job.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 1800, sub: CONTACT }, key);
  return fetch(job.endpoint, {
    method: "POST",
    headers: {
      TTL: "120", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${token}, k=${publicKey}`,
    },
    body: fromBase64(job.body),
  });
}

/** A JSON Web Token signed with ES256; WebCrypto's ECDSA signature is the r‖s form JWT needs. */
async function signJwt(claims, key) {
  const part = (value) => toBase64(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part(claims)}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${toBase64(new Uint8Array(signature))}`;
}

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64 = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
