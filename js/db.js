// Minimal promise wrapper around IndexedDB.
const DB_NAME = 'gymlog';
const VERSION = 1;
let db;
const writeListeners = [];

/** Called after every committed write to a data store (writes to 'meta' are ignored). */
export function onWrite(fn) { writeListeners.push(fn); }

export function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('measurements', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('exercises', { keyPath: 'name' });
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function run(stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => {
      resolve(result);
      if (mode === 'readwrite' && [].concat(stores).some((s) => s !== 'meta')) for (const fn of writeListeners) fn();
    };
    tx.onerror = tx.onabort = () => reject(tx.error);
    result = fn(tx);
  });
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const getAll = (store) => run(store, 'readonly', (tx) => wrap(tx.objectStore(store).getAll())).then(async (r) => r);

export function put(store, obj) {
  let key;
  return run(store, 'readwrite', (tx) => {
    const req = tx.objectStore(store).put(obj);
    req.onsuccess = () => { key = req.result; };
  }).then(() => key);
}

export function putMany(store, objs) {
  return run(store, 'readwrite', (tx) => {
    const os = tx.objectStore(store);
    for (const o of objs) {
      const req = os.put(o);
      req.onsuccess = () => { if (o.id == null && os.keyPath === 'id') o.id = req.result; };
    }
  });
}

export const del = (store, key) => run(store, 'readwrite', (tx) => { tx.objectStore(store).delete(key); });
export const clearStore = (store) => run(store, 'readwrite', (tx) => { tx.objectStore(store).clear(); });
