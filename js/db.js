// Local storage in IndexedDB. The "sessions" store holds one record per session; the "kv"
// store holds single documents: the program, settings, the active workout, deleted session
// ids, weigh-ins, and the sync configuration.

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
  putMany: (list) => run("sessions", "readwrite", (s) => list.forEach((x) => s.put(x))),
  delete: (id) => run("sessions", "readwrite", (s) => s.delete(id)),
};

export async function clearAll() {
  await run("kv", "readwrite", (s) => s.clear());
  await run("sessions", "readwrite", (s) => s.clear());
}

/** Ask the browser not to evict the data under storage pressure. */
export const persist = () => navigator.storage?.persist?.().catch(() => false);

/** All app data as one document, the format of Export backup. */
export function backup({ program, settings, sessions, deleted, weights }) {
  return { format: "spotter-backup", version: 2, exported: new Date().toISOString(), program, settings, sessions, deleted, weights };
}
