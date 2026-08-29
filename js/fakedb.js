// In-memory stand-in for db.js, used when the page is opened with #debug
// (same idea as 01. app's #debug-* screens): lets both lists and the whole
// finalizar-compra flow be exercised locally with sample data, no Firebase.

import { DEFAULT_SECTIONS, DEFAULT_THRESHOLDS, normalize } from "./logic.js";

const ts = () => ({ toMillis: () => Date.now() });
let nextId = 1;
const id = (p) => `${p}-${nextId++}`;

const store = {
  thresholds: { ...DEFAULT_THRESHOLDS },
  sections: DEFAULT_SECTIONS.map((name, i) => ({ id: id("sec"), name, order: i })),
  items: [],
  entries: [],
  archive: [],
};

// sample items across levels
const S = store.sections;
[
  ["Banana", S[0].id, 6, 1, "un"],
  ["Tomate", S[0].id, 8, 3, "un"],
  ["Leite integral", S[1].id, 6, 6, "L"],
  ["Queijo mussarela", S[1].id, 2, 1, "kg"],
  ["Arroz", S[2].id, 4, 0, "kg"],
  ["Feijão", S[2].id, 4, 2, "kg"],
  ["Pão de forma", S[3].id, 2, 2, "un"],
  ["Detergente", S[6].id, 3, 1, "un"],
].forEach(([name, sectionId, maxStock, currentStock, unit]) => {
  store.items.push({
    id: id("item"), name, nameLower: normalize(name),
    sectionId, maxStock, currentStock, unit, createdAt: ts(), updatedAt: ts(),
  });
});

const listeners = { settings: [], sections: [], items: [], entries: [] };
const emit = {
  settings: () => listeners.settings.forEach((cb) => cb({ ...store.thresholds })),
  sections: () => listeners.sections.forEach((cb) => cb(store.sections.map((s) => ({ ...s })))),
  items: () => listeners.items.forEach((cb) => cb(store.items.map((i) => ({ ...i })))),
  entries: () => listeners.entries.forEach((cb) => cb(store.entries.map((e) => ({ ...e })))),
};

export const isConfigured = () => true;
export const init = () => {};
export const watchAuth = (cb) => cb({ uid: "debug" });
export const login = async () => {};
export const logout = async () => location.reload();

export function listenSettings(cb) { listeners.settings.push(cb); cb({ ...store.thresholds }); }
export function listenSections(cb) { listeners.sections.push(cb); cb(store.sections.map((s) => ({ ...s }))); }
export function listenItems(cb) { listeners.items.push(cb); cb(store.items.map((i) => ({ ...i }))); }
export function listenShoppingList(cb) { listeners.entries.push(cb); cb(store.entries.map((e) => ({ ...e }))); }

export async function seedDefaults() {}
export async function seedDefaultItems() {}

export async function saveThresholds(muitoMin, poucoMax) {
  store.thresholds = { muitoMin, poucoMax };
  emit.settings();
}

export async function addSection(name, order) {
  store.sections.push({ id: id("sec"), name, order });
  emit.sections();
}
export async function renameSection(sid, name) {
  store.sections.find((s) => s.id === sid).name = name;
  emit.sections();
}
export async function swapSectionOrder(a, b) {
  const sa = store.sections.find((s) => s.id === a.id);
  const sb = store.sections.find((s) => s.id === b.id);
  [sa.order, sb.order] = [b.order, a.order];
  emit.sections();
}
export async function deleteSection(sid) {
  store.sections = store.sections.filter((s) => s.id !== sid);
  emit.sections();
}

export async function createItem(data) {
  store.items.push({
    id: id("item"), ...data, nameLower: normalize(data.name),
    unit: data.unit || null, createdAt: ts(), updatedAt: ts(),
  });
  emit.items();
}
export async function updateItem(iid, data) {
  Object.assign(store.items.find((i) => i.id === iid), data, {
    nameLower: normalize(data.name), unit: data.unit || null, updatedAt: ts(),
  });
  emit.items();
}
export async function bumpStock(iid, delta) {
  const item = store.items.find((i) => i.id === iid);
  item.currentStock = Number(item.currentStock) + delta;
  item.updatedAt = ts();
  emit.items();
}
export async function zeroAllStocks(itemIds) {
  store.items.forEach((i) => {
    if (itemIds.includes(i.id)) { i.currentStock = 0; i.updatedAt = ts(); }
  });
  emit.items();
}
export async function deleteItem(iid) {
  store.items = store.items.filter((i) => i.id !== iid);
  emit.items();
}

export async function addEntriesForItems(items) {
  items.forEach((item) => {
    const existing = store.entries.find((e) => e.id === item.id);
    if (existing) return;
    store.entries.push({
      id: item.id, itemId: item.id, name: item.name, note: item.note || null,
      sectionId: item.sectionId, checked: false, addedAt: ts(),
    });
  });
  emit.entries();
}
export async function addLooseEntry(name, sectionId) {
  store.entries.push({
    id: id("entry"), itemId: null, name, sectionId, checked: false, addedAt: ts(),
  });
  emit.entries();
}
export async function setEntryChecked(eid, checked) {
  const e = store.entries.find((x) => x.id === eid);
  e.checked = checked;
  e.checkedAt = checked ? ts() : null;
  emit.entries();
}
export async function removeEntry(eid) {
  store.entries = store.entries.filter((e) => e.id !== eid);
  emit.entries();
}

export async function importBackup(data) {
  if (data.thresholds) store.thresholds = { ...data.thresholds };
  (data.sections || []).forEach((s) => {
    const cur = store.sections.find((x) => x.id === s.id);
    if (cur) Object.assign(cur, { name: s.name, order: s.order ?? 0 });
    else store.sections.push({ id: s.id, name: s.name, order: s.order ?? 0 });
  });
  (data.items || []).forEach((i) => {
    const d = { ...i, nameLower: normalize(i.name), createdAt: ts(), updatedAt: ts() };
    const cur = store.items.find((x) => x.id === i.id);
    if (cur) Object.assign(cur, d);
    else store.items.push(d);
  });
  emit.settings(); emit.sections(); emit.items(); emit.entries();
}

export async function finishTrip({ stockUpdates, promotions, archiveEntries, removeEntryIds }) {
  stockUpdates.forEach(({ itemId, newStock }) => {
    const item = store.items.find((i) => i.id === itemId);
    if (item) { item.currentStock = newStock; item.updatedAt = ts(); }
  });
  promotions.forEach((p) => {
    store.items.push({
      id: id("item"), ...p, nameLower: normalize(p.name),
      createdAt: ts(), updatedAt: ts(),
    });
  });
  store.archive.push({ id: id("trip"), finishedAt: ts(), entries: archiveEntries });
  store.entries = store.entries.filter((e) => !removeEntryIds.includes(e.id));
  emit.items();
  emit.entries();
}
