// Firebase layer (same architecture as 01. app: one thin module, CDN SDK,
// no build step). Auth = one shared email/password account. Firestore with
// persistent local cache (multi-tab) so everything works offline and syncs
// on reconnect. All reads flow through onSnapshot listeners; all writes are
// small targeted sets/updates so the UI can stay optimistic.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  increment,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./config.js";
import {
  normalize,
  DEFAULT_SECTIONS,
  DEFAULT_THRESHOLDS,
  DEFAULT_ITEMS,
  UNCAT_ID,
  UNCAT_NAME,
} from "./logic.js";

let app = null;
let auth = null;
let fs = null;

export function isConfigured() {
  return (
    firebaseConfig &&
    firebaseConfig.apiKey &&
    !/PASTE/.test(firebaseConfig.apiKey) &&
    firebaseConfig.projectId &&
    !/PASTE/.test(firebaseConfig.projectId)
  );
}

export function init() {
  if (app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  fs = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}

// ---------- auth ----------

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function login(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

// ---------- listeners (one per collection) ----------

export function listenSettings(cb, errCb) {
  return onSnapshot(doc(fs, "settings", "thresholds"), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  }, errCb);
}

export function listenSections(cb, errCb) {
  return onSnapshot(collection(fs, "sections"), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snap);
  }, errCb);
}

export function listenItems(cb, errCb) {
  return onSnapshot(collection(fs, "items"), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snap);
  }, errCb);
}

export function listenRecipes(cb, errCb) {
  return onSnapshot(collection(fs, "recipes"), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snap);
  }, errCb);
}

export function listenShoppingList(cb, errCb) {
  return onSnapshot(collection(fs, "shoppingList"), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })), snap);
  }, errCb);
}

// ---------- first-run seeding (fixed doc IDs make it idempotent even if
// both phones seed at the same time) ----------

export async function seedDefaults({ seedSections, seedThresholds }) {
  const batch = writeBatch(fs);
  if (seedThresholds) {
    batch.set(doc(fs, "settings", "thresholds"), DEFAULT_THRESHOLDS);
  }
  if (seedSections) {
    DEFAULT_SECTIONS.forEach((name, i) => {
      batch.set(doc(fs, "sections", `sec-${normalize(name).replace(/\s+/g, "-")}`), {
        name,
        order: i,
      });
    });
  }
  return batch.commit();
}

// Starter catalog, written once when /items is empty (same idempotency as
// above: fixed doc ids, so two phones seeding at once do no harm). Also
// creates the Carnes section the catalog needs.
export async function seedDefaultItems() {
  const batch = writeBatch(fs);
  batch.set(doc(fs, "sections", "sec-carnes"), { name: "Carnes", order: 8 });
  DEFAULT_ITEMS.forEach(({ name, section, maxStock, unit }) => {
    batch.set(doc(fs, "items", `item-${normalize(name).replace(/\s+/g, "-")}`), {
      name,
      nameLower: normalize(name),
      sectionId: section,
      maxStock,
      currentStock: 0, // starts empty; the couple fills in real levels
      unit,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return batch.commit();
}

// Creates the pinned fallback section when it is missing (fixed id, so
// concurrent calls from two phones are harmless). Called from the sections
// listener, never unconditionally, so a later rename sticks.
export function ensureUncategorized() {
  return setDoc(doc(fs, "sections", UNCAT_ID), { name: UNCAT_NAME, order: 9999 });
}

// ---------- settings ----------

export function saveThresholds(muitoMin, poucoMax) {
  return setDoc(doc(fs, "settings", "thresholds"), { muitoMin, poucoMax });
}

// ---------- sections ----------

export function addSection(name, order) {
  return setDoc(doc(collection(fs, "sections")), { name, order });
}

export function renameSection(id, name) {
  return updateDoc(doc(fs, "sections", id), { name });
}

// Swap the `order` of two sections in one batch (used by the up/down arrows).
export function swapSectionOrder(a, b) {
  const batch = writeBatch(fs);
  batch.update(doc(fs, "sections", a.id), { order: b.order });
  batch.update(doc(fs, "sections", b.id), { order: a.order });
  return batch.commit();
}

export function deleteSection(id) {
  return deleteDoc(doc(fs, "sections", id));
}

// ---------- items ----------

export function createItem({ name, sectionId, maxStock, currentStock, unit, note }) {
  const data = {
    name,
    nameLower: normalize(name),
    sectionId,
    maxStock,
    currentStock,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (unit) data.unit = unit;
  if (note) data.note = note;
  return setDoc(doc(collection(fs, "items")), data);
}

export function updateItem(id, { name, sectionId, maxStock, currentStock, unit, note }) {
  return updateDoc(doc(fs, "items", id), {
    name,
    nameLower: normalize(name),
    sectionId,
    maxStock,
    currentStock,
    unit: unit || null,
    note: note || null,
    updatedAt: serverTimestamp(),
  });
}

// Sets currentStock = 0 on every item (Ajustes > "Zerar todo o estoque").
// Batches cap at 500 ops, so chunk defensively.
export async function zeroAllStocks(itemIds) {
  for (let i = 0; i < itemIds.length; i += 400) {
    const batch = writeBatch(fs);
    itemIds.slice(i, i + 400).forEach((id) => {
      batch.update(doc(fs, "items", id), { currentStock: 0, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }
}

// Stepper tap: atomic increment, safe if both phones tap at once.
export function bumpStock(id, delta) {
  return updateDoc(doc(fs, "items", id), {
    currentStock: increment(delta),
    updatedAt: serverTimestamp(),
  });
}

export function deleteItem(id) {
  return deleteDoc(doc(fs, "items", id));
}

// ---------- shopping list ----------

// Linked entries use entryId = itemId, which makes "add" naturally
// deduplicated; the caller still skips ids already present so an existing
// entry's checked state is never reset.
export function addEntriesForItems(items) {
  const batch = writeBatch(fs);
  items.forEach((item) => {
    batch.set(doc(fs, "shoppingList", item.id), {
      itemId: item.id,
      name: item.name,
      note: item.note || null,
      sectionId: item.sectionId,
      checked: false,
      addedAt: serverTimestamp(),
    });
  });
  return batch.commit();
}

// Item avulso: random entry id, itemId = null.
export function addLooseEntry(name, sectionId) {
  return setDoc(doc(collection(fs, "shoppingList")), {
    itemId: null,
    name,
    sectionId,
    checked: false,
    addedAt: serverTimestamp(),
  });
}

export function setEntryChecked(entryId, checked) {
  const data = { checked };
  data.checkedAt = checked ? serverTimestamp() : null;
  return updateDoc(doc(fs, "shoppingList", entryId), data);
}

export function removeEntry(entryId) {
  return deleteDoc(doc(fs, "shoppingList", entryId));
}

// ---------- receitas ----------

export function createRecipe({ name, text }) {
  return setDoc(doc(collection(fs, "recipes")), {
    name,
    nameLower: normalize(name),
    text: text || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateRecipe(id, { name, text }) {
  return updateDoc(doc(fs, "recipes", id), {
    name,
    nameLower: normalize(name),
    text: text || "",
    updatedAt: serverTimestamp(),
  });
}

export function deleteRecipe(id) {
  return deleteDoc(doc(fs, "recipes", id));
}

// ---------- backup ----------
// Restores a backup produced by "Exportar backup". Writes preserve the
// original doc ids so sectionId/itemId references stay intact. Existing
// docs with the same id are overwritten; extra docs are left alone
// (non-destructive merge). Chunked to respect the 500-op batch limit.
export async function importBackup(data) {
  const writes = [];

  if (
    data.thresholds &&
    Number.isFinite(data.thresholds.muitoMin) &&
    Number.isFinite(data.thresholds.poucoMax)
  ) {
    writes.push([doc(fs, "settings", "thresholds"), {
      muitoMin: data.thresholds.muitoMin,
      poucoMax: data.thresholds.poucoMax,
    }]);
  }

  (data.sections || []).forEach((s) => {
    if (!s.id || !s.name) return;
    writes.push([doc(fs, "sections", s.id), { name: s.name, order: s.order ?? 0 }]);
  });

  (data.items || []).forEach((i) => {
    if (!i.id || !i.name) return;
    writes.push([doc(fs, "items", i.id), {
      name: i.name,
      nameLower: normalize(i.name),
      sectionId: i.sectionId,
      maxStock: Number(i.maxStock) || 1,
      currentStock: Number(i.currentStock) || 0,
      unit: i.unit || null,
      note: i.note || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }]);
  });

  (data.recipes || []).forEach((r) => {
    if (!r.id || !r.name) return;
    writes.push([doc(fs, "recipes", r.id), {
      name: r.name,
      nameLower: normalize(r.name),
      text: r.text || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }]);
  });

  (data.shoppingList || []).forEach((e) => {
    if (!e.id || !e.name) return;
    writes.push([doc(fs, "shoppingList", e.id), {
      itemId: e.itemId || null,
      name: e.name,
      note: e.note || null,
      sectionId: e.sectionId,
      checked: !!e.checked,
      addedAt: serverTimestamp(),
    }]);
  });

  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(fs);
    writes.slice(i, i + 400).forEach(([ref, d]) => batch.set(ref, d));
    await batch.commit();
  }
}

// ---------- finalizar compra ----------
// One batch: update stocks, optionally promote avulsos to items, archive the
// trip snapshot, clear checked entries (and unchecked too if asked).
// A batch commits atomically and works offline (syncs on reconnect).

export function finishTrip({ stockUpdates, promotions, archiveEntries, removeEntryIds }) {
  const batch = writeBatch(fs);

  stockUpdates.forEach(({ itemId, newStock }) => {
    batch.update(doc(fs, "items", itemId), {
      currentStock: newStock,
      updatedAt: serverTimestamp(),
    });
  });

  promotions.forEach(({ name, sectionId, maxStock, currentStock }) => {
    batch.set(doc(collection(fs, "items")), {
      name,
      nameLower: normalize(name),
      sectionId,
      maxStock,
      currentStock,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  batch.set(doc(collection(fs, "archive")), {
    finishedAt: serverTimestamp(),
    entries: archiveEntries,
  });

  removeEntryIds.forEach((id) => {
    batch.delete(doc(fs, "shoppingList", id));
  });

  return batch.commit();
}
