const STORAGE_KEY = 'tanweer-html-viewer-snapshots';
const MAX_SNAPSHOTS = 10;

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { snapshots: [], counter: 0 };
  } catch {
    return { snapshots: [], counter: 0 };
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listSnapshots() {
  return loadStore().snapshots.sort((a, b) => b.createdAt - a.createdAt);
}

export function createSnapshot(html, name) {
  const store = loadStore();
  store.counter += 1;
  const snapshot = {
    id: `snap-${Date.now()}-${store.counter}`,
    name: name?.trim() || `Snapshot ${store.counter}`,
    html,
    createdAt: Date.now(),
  };

  store.snapshots.unshift(snapshot);
  if (store.snapshots.length > MAX_SNAPSHOTS) {
    store.snapshots = store.snapshots.slice(0, MAX_SNAPSHOTS);
  }

  saveStore(store);
  return snapshot;
}

export function renameSnapshot(id, name) {
  const store = loadStore();
  const snap = store.snapshots.find((s) => s.id === id);
  if (!snap || !name?.trim()) return null;
  snap.name = name.trim();
  saveStore(store);
  return snap;
}

export function deleteSnapshot(id) {
  const store = loadStore();
  store.snapshots = store.snapshots.filter((s) => s.id !== id);
  saveStore(store);
}

export function getSnapshot(id) {
  return loadStore().snapshots.find((s) => s.id === id) ?? null;
}