// Local storage in IndexedDB. The "sessions" store holds one record per session; the "kv"
// store holds single documents: program, body, settings and the active workout.

const DB_NAME = "spotter";
let opened;

function open() {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
      req.result.createObjectStore("sessions", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opened;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(tx.error);
  });
}

export const kv = {
  get: (key) => run("kv", "readonly", (s) => s.get(key)),
  set: (key, value) => run("kv", "readwrite", (s) => s.put(value, key)),
  delete: (key) => run("kv", "readwrite", (s) => s.delete(key)),
};

export const sessionStore = {
  all: async () => (await run("sessions", "readonly", (s) => s.getAll())).sort((a, b) => a.start.localeCompare(b.start)),
  put: (session) => run("sessions", "readwrite", (s) => s.put(session)),
  putMany: (list) => run("sessions", "readwrite", (s) => list.forEach((x) => s.put(x))),
  delete: (id) => run("sessions", "readwrite", (s) => s.delete(id)),
};

export async function clearAll() {
  await run("kv", "readwrite", (s) => s.clear());
  await run("sessions", "readwrite", (s) => s.clear());
}

/** Ask the browser not to evict the data under storage pressure. */
export const persist = () => navigator.storage?.persist?.().catch(() => false);

/**
 * Sort the contents of data-repository files or a backup into {program, body, sessions, settings}.
 * A file is recognized by its shape: program.json has templates, sessions files are arrays of
 * sessions, body.json is an array of dated rows, and a backup holds all of them.
 */
export function classifyImport(docs) {
  const found = { sessions: [] };
  for (const doc of docs) {
    if (doc?.format === "spotter-backup") {
      Object.assign(found, { program: doc.program, body: doc.body, settings: doc.settings });
      found.sessions.push(...doc.sessions);
    } else if (doc?.templates) found.program = doc;
    else if (Array.isArray(doc) && doc[0]?.exercises) found.sessions.push(...doc);
    else if (Array.isArray(doc) && doc[0]?.date) found.body = doc;
    else if (!(Array.isArray(doc) && !doc.length)) throw new Error("Unrecognized file");
  }
  return found;
}

export function backup({ program, body, sessions, settings }) {
  return { format: "spotter-backup", version: 1, exported: new Date().toISOString(), program, body, settings, sessions };
}
