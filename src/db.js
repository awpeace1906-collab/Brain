const DB_NAME = 'brain-feed';
const DB_VERSION = 1;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('timestamp', 'timestamp');
        s.createIndex('archived', 'archived');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
      }
    };
  });
}

/* ── Entries ── */

export async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readonly');
    const req = tx.objectStore('entries').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function putEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const req = tx.objectStore('entries').put(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEntry(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const req = tx.objectStore('entries').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    const req = tx.objectStore('entries').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ── Settings ── */

export async function getSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const req = tx.objectStore('settings').put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSettings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').getAll();
    req.onsuccess = () => {
      const map = {};
      (req.result || []).forEach(s => { map[s.key] = s.value; });
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ── AI Queue ── */

export async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly');
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function addToQueue(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    // Remove auto-generated key before storing
    const { qid, ...rest } = item;
    const req = tx.objectStore('queue').add(rest);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(qid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    const req = tx.objectStore('queue').delete(qid);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    const req = tx.objectStore('queue').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
