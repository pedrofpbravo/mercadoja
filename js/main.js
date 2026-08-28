// MercadoJá — UI layer. Same architecture as 01. app: one main module,
// direct DOM, hash-free tab navigation, optimistic writes through db.js.
// Firestore's local cache gives latency compensation: every write below
// fires the relevant onSnapshot immediately, so the UI re-renders from a
// single source of truth and still feels instant (and works offline).

// Open the app with #debug to preview every screen and flow with sample
// in-memory data, no Firebase needed (same trick as 01. app).
import * as realDb from "./db.js";
import * as fakeDb from "./fakedb.js";
const db = location.hash === "#debug" ? fakeDb : realDb;
import {
  DEFAULT_THRESHOLDS,
  levelOf,
  normalize,
  qtyLabel,
  sortSections,
  sortItems,
  sortEntries,
  validThresholds,
} from "./logic.js";

// Shown in Ajustes so anyone can tell which deploy a phone is running.
// Keep in sync with CACHE in sw.js.
const APP_VERSION = "v4";

const $ = (id) => document.getElementById(id);

// ---------- state ----------

const state = {
  thresholds: DEFAULT_THRESHOLDS,
  sections: [], // sorted by order
  items: [],
  itemsById: new Map(),
  entries: [],
  tab: "estoque",
  search: "",
  filters: new Set(), // subset of {pouco, medio, muito}
  selected: new Set(), // itemIds while in selection mode
  collapsed: new Set(JSON.parse(localStorage.getItem("mj:collapsed") || "[]")),
  editingItemId: null,
  seededSections: false,
  seededThresholds: false,
  listenersStarted: false,
};

const itemRowEls = new Map(); // itemId -> <li>, for cheap stepper updates

// ---------- tiny UI helpers ----------

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

function openSheet(id) {
  $("sheet-backdrop").hidden = false;
  $(id).hidden = false;
}

function closeSheets() {
  $("sheet-backdrop").hidden = true;
  document.querySelectorAll(".sheet").forEach((s) => (s.hidden = true));
}

function fillSectionSelect(select, selectedId) {
  select.innerHTML = "";
  state.sections.forEach((sec) => {
    const opt = document.createElement("option");
    opt.value = sec.id;
    opt.textContent = sec.name;
    if (sec.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
}

function sectionName(id) {
  const sec = state.sections.find((s) => s.id === id);
  return sec ? sec.name : "Outros";
}

// ---------- filtering ----------

function matchesSearch(item) {
  const q = normalize(state.search);
  if (!q) return true;
  return (item.nameLower || normalize(item.name)).includes(q);
}

function matchesFilters(item) {
  if (state.filters.size === 0) return true;
  return state.filters.has(levelOf(item, state.thresholds));
}

function isVisible(item) {
  return matchesSearch(item) && matchesFilters(item);
}

function selectionMode() {
  return state.filters.size > 0;
}

// ---------- stock list rendering ----------

// Quantity line, with the item's comment (brand, size, etc.) appended.
function qtyText(item) {
  return qtyLabel(item) + (item.note ? ` · ${item.note}` : "");
}

function buildItemRow(item) {
  const li = document.createElement("li");
  li.className = "item-row";
  li.dataset.id = item.id;

  const sel = document.createElement("label");
  sel.className = "sel";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = state.selected.has(item.id);
  cb.addEventListener("change", () => {
    if (cb.checked) state.selected.add(item.id);
    else state.selected.delete(item.id);
    updateSelectionBar();
  });
  sel.appendChild(cb);
  sel.addEventListener("click", (e) => e.stopPropagation());

  const dot = document.createElement("span");
  dot.className = `dot ${levelOf(item, state.thresholds)}`;

  const main = document.createElement("div");
  main.className = "item-main";
  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = item.name;
  const qty = document.createElement("span");
  qty.className = "item-qty";
  qty.textContent = qtyText(item);
  main.append(name, qty);

  const stepper = document.createElement("div");
  stepper.className = "stepper";
  const dec = document.createElement("button");
  dec.textContent = "−";
  dec.disabled = Number(item.currentStock) <= 0;
  const inc = document.createElement("button");
  inc.textContent = "＋";
  dec.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = Number(state.itemsById.get(item.id)?.currentStock || 0);
    if (cur > 0) db.bumpStock(item.id, -1).catch(() => toast("Erro ao salvar."));
  });
  inc.addEventListener("click", (e) => {
    e.stopPropagation();
    db.bumpStock(item.id, 1).catch(() => toast("Erro ao salvar."));
  });
  stepper.append(dec, inc);

  li.addEventListener("click", () => {
    if (selectionMode()) {
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    } else {
      openItemSheet(item.id);
    }
  });

  li.append(sel, dot, main, stepper);
  return li;
}

// Patch a single existing row in place (stepper tap, remote stock change).
function patchItemRow(item) {
  const li = itemRowEls.get(item.id);
  if (!li) return;
  li.querySelector(".dot").className = `dot ${levelOf(item, state.thresholds)}`;
  li.querySelector(".item-qty").textContent = qtyText(item);
  li.querySelector(".stepper button").disabled = Number(item.currentStock) <= 0;
}

function renderStock() {
  const listEl = $("stock-list");
  listEl.innerHTML = "";
  itemRowEls.clear();

  const searching = !!state.search || selectionMode();
  listEl.classList.toggle("selecting", selectionMode());

  const visible = sortItems(state.items.filter(isVisible));
  const bySection = new Map();
  visible.forEach((item) => {
    if (!bySection.has(item.sectionId)) bySection.set(item.sectionId, []);
    bySection.get(item.sectionId).push(item);
  });

  const orderedIds = [
    ...state.sections.map((s) => s.id),
    ...[...bySection.keys()].filter((id) => !state.sections.some((s) => s.id === id)),
  ];

  orderedIds.forEach((secId) => {
    const items = bySection.get(secId);
    if (!items || items.length === 0) return;

    const group = document.createElement("section");
    group.className = "group";
    const collapsed = !searching && state.collapsed.has(secId);
    if (collapsed) group.classList.add("collapsed");

    const head = document.createElement("button");
    head.className = "group-head";
    head.type = "button";
    head.innerHTML = `<span class="chev">▼</span><span>${sectionName(secId)}</span><span class="count">${items.length}</span>`;
    head.addEventListener("click", () => {
      if (state.collapsed.has(secId)) state.collapsed.delete(secId);
      else state.collapsed.add(secId);
      localStorage.setItem("mj:collapsed", JSON.stringify([...state.collapsed]));
      group.classList.toggle("collapsed");
    });

    const ul = document.createElement("ul");
    ul.className = "group-items";
    items.forEach((item) => {
      const li = buildItemRow(item);
      itemRowEls.set(item.id, li);
      ul.appendChild(li);
    });

    group.append(head, ul);
    listEl.appendChild(group);
  });

  $("stock-empty").hidden = state.items.length > 0;
  $("stock-no-results").hidden = !(state.items.length > 0 && visible.length === 0);

  updateSelectionBar();
}

function updateSelectionBar() {
  const bar = $("selection-bar");
  bar.hidden = !selectionMode();
  if (bar.hidden) return;

  // Drop selections that are no longer visible (filter changed underneath).
  const visibleIds = new Set(state.items.filter(isVisible).map((i) => i.id));
  [...state.selected].forEach((id) => {
    if (!visibleIds.has(id)) state.selected.delete(id);
  });

  const btn = $("btn-add-selected");
  const n = state.selected.size;
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? `Adicionar à lista de compras (${n})` : "Adicionar à lista de compras";
  $("select-all").checked = visibleIds.size > 0 && n === visibleIds.size;
}

// ---------- shopping list rendering ----------

function renderShop() {
  const listEl = $("shop-list");
  listEl.innerHTML = "";

  const bySection = new Map();
  state.entries.forEach((e) => {
    if (!bySection.has(e.sectionId)) bySection.set(e.sectionId, []);
    bySection.get(e.sectionId).push(e);
  });

  const orderedIds = [
    ...state.sections.map((s) => s.id),
    ...[...bySection.keys()].filter((id) => !state.sections.some((s) => s.id === id)),
  ];

  orderedIds.forEach((secId) => {
    const entries = bySection.get(secId);
    if (!entries || entries.length === 0) return;

    const group = document.createElement("section");
    group.className = "group";
    const head = document.createElement("div");
    head.className = "group-head";
    head.innerHTML = `<span>${sectionName(secId)}</span><span class="count">${entries.length}</span>`;

    const ul = document.createElement("ul");
    ul.className = "group-items";
    sortEntries(entries).forEach((entry) => {
      const li = document.createElement("li");
      li.className = "shop-row" + (entry.checked ? " checked" : "");

      const check = document.createElement("button");
      check.className = "shop-check";
      check.textContent = "✓";
      check.setAttribute("aria-label", entry.checked ? "Desmarcar" : "Marcar");

      const main = document.createElement("div");
      main.className = "shop-main";
      const name = document.createElement("span");
      name.className = "shop-name";
      name.textContent = entry.name;
      main.appendChild(name);
      if (!entry.itemId) {
        const tag = document.createElement("span");
        tag.className = "shop-tag";
        tag.textContent = "avulso";
        main.appendChild(tag);
      }
      if (entry.note) {
        const note = document.createElement("span");
        note.className = "shop-note";
        note.textContent = entry.note;
        main.appendChild(note);
      }

      const remove = document.createElement("button");
      remove.className = "shop-remove";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", "Remover da lista");
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        db.removeEntry(entry.id).catch(() => toast("Erro ao remover."));
      });

      const toggle = () => {
        li.classList.toggle("checked"); // optimistic; snapshot confirms
        db.setEntryChecked(entry.id, !entry.checked).catch(() => toast("Erro ao salvar."));
      };
      check.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
      li.addEventListener("click", toggle);

      li.append(check, main, remove);
      ul.appendChild(li);
    });

    group.append(head, ul);
    listEl.appendChild(group);
  });

  $("shop-empty").hidden = state.entries.length > 0;

  const unchecked = state.entries.filter((e) => !e.checked).length;
  const checked = state.entries.length - unchecked;
  const badge = $("shop-badge");
  badge.hidden = unchecked === 0;
  badge.textContent = unchecked;
  $("btn-finish").hidden = checked === 0;
}

// ---------- item sheet (new / edit) ----------

function openItemSheet(itemId) {
  state.editingItemId = itemId || null;
  const item = itemId ? state.itemsById.get(itemId) : null;

  $("sheet-item-title").textContent = item ? "Editar item" : "Novo item";
  fillSectionSelect($("item-section"), item ? item.sectionId : state.sections[0]?.id);
  $("item-name").value = item ? item.name : "";
  $("item-max").value = item ? item.maxStock : "";
  $("item-current").value = item ? item.currentStock : "";
  $("item-unit").value = item ? item.unit || "" : "";
  $("item-note").value = item ? item.note || "" : "";
  $("item-error").hidden = true;
  $("btn-item-delete").hidden = !item;

  openSheet("sheet-item");
}

function submitItemForm(e) {
  e.preventDefault();
  const name = $("item-name").value.trim();
  const sectionId = $("item-section").value;
  const maxStock = Math.floor(Number($("item-max").value));
  const curRaw = $("item-current").value.trim();
  const errEl = $("item-error");

  if (!name || !sectionId || !Number.isFinite(maxStock) || maxStock < 1) {
    errEl.textContent = "Preencha nome, seção e estoque máximo (mínimo 1).";
    errEl.hidden = false;
    return;
  }
  const currentStock = curRaw === "" ? maxStock : Math.max(0, Math.floor(Number(curRaw)) || 0);

  const data = {
    name,
    sectionId,
    maxStock,
    currentStock,
    unit: $("item-unit").value.trim(),
    note: $("item-note").value.trim(),
  };
  const op = state.editingItemId
    ? db.updateItem(state.editingItemId, data)
    : db.createItem(data);
  op.catch(() => toast("Erro ao salvar item."));

  closeSheets();
}

// ---------- finalizar compra ----------

function openFinishSheet() {
  const checked = state.entries.filter((e) => e.checked);
  if (checked.length === 0) return;
  const unchecked = state.entries.filter((e) => !e.checked);

  const list = $("finish-list");
  list.innerHTML = "";

  checked.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "finish-row";
    row.dataset.entryId = entry.id;

    const nameEl = document.createElement("div");
    nameEl.className = "finish-name";
    nameEl.textContent = entry.name;

    const item = entry.itemId ? state.itemsById.get(entry.itemId) : null;

    if (item) {
      const small = document.createElement("small");
      small.textContent = `novo estoque (máx. ${item.maxStock})`;
      nameEl.appendChild(small);

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.inputMode = "numeric";
      input.value = item.maxStock; // pre-fill = max, adjustable
      input.className = "finish-stock";
      row.dataset.itemId = item.id;
      row.append(nameEl, input);
    } else {
      // avulso (or the linked item was deleted meanwhile)
      const save = document.createElement("label");
      save.className = "finish-save";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      save.append(cb, document.createTextNode("Salvar na lista padrão"));

      const maxInput = document.createElement("input");
      maxInput.type = "number";
      maxInput.min = "1";
      maxInput.step = "1";
      maxInput.inputMode = "numeric";
      maxInput.placeholder = "máx.";
      maxInput.className = "finish-max";
      maxInput.hidden = true;
      cb.addEventListener("change", () => {
        maxInput.hidden = !cb.checked;
        if (cb.checked) maxInput.focus();
      });

      row.dataset.loose = "1";
      row.append(nameEl, save, maxInput);
    }

    list.appendChild(row);
  });

  const unWrap = $("finish-unchecked");
  unWrap.hidden = unchecked.length === 0;
  if (unchecked.length > 0) {
    $("finish-unchecked-count").textContent =
      unchecked.length === 1 ? "1 item" : `${unchecked.length} itens`;
    unWrap.querySelector('input[value="keep"]').checked = true;
  }

  openSheet("sheet-finish");
}

function confirmFinish() {
  const checked = state.entries.filter((e) => e.checked);
  const unchecked = state.entries.filter((e) => !e.checked);
  const entryById = new Map(state.entries.map((e) => [e.id, e]));

  const stockUpdates = [];
  const promotions = [];
  const archiveEntries = [];

  for (const row of $("finish-list").querySelectorAll(".finish-row")) {
    const entry = entryById.get(row.dataset.entryId);
    if (!entry) continue;

    if (row.dataset.itemId) {
      const raw = row.querySelector(".finish-stock").value;
      const newStock = Math.max(0, Math.floor(Number(raw)) || 0);
      stockUpdates.push({ itemId: row.dataset.itemId, newStock });
      archiveEntries.push({
        itemId: entry.itemId,
        name: entry.name,
        sectionId: entry.sectionId,
        checked: true,
        newStock,
      });
    } else {
      const wantsSave = row.querySelector(".finish-save input").checked;
      if (wantsSave) {
        const maxStock = Math.floor(Number(row.querySelector(".finish-max").value));
        if (!Number.isFinite(maxStock) || maxStock < 1) {
          toast(`Informe o estoque máximo de "${entry.name}".`);
          row.querySelector(".finish-max").focus();
          return;
        }
        promotions.push({
          name: entry.name,
          sectionId: entry.sectionId,
          maxStock,
          currentStock: maxStock,
        });
      }
      archiveEntries.push({
        itemId: null,
        name: entry.name,
        sectionId: entry.sectionId,
        checked: true,
        newStock: null,
      });
    }
  }

  const clearUnchecked =
    unchecked.length > 0 &&
    $("finish-unchecked").querySelector('input[name="keep-unchecked"]:checked')?.value === "clear";

  unchecked.forEach((e) => {
    archiveEntries.push({
      itemId: e.itemId || null,
      name: e.name,
      sectionId: e.sectionId,
      checked: false,
      newStock: null,
    });
  });

  const removeEntryIds = [
    ...checked.map((e) => e.id),
    ...(clearUnchecked ? unchecked.map((e) => e.id) : []),
  ];

  db.finishTrip({ stockUpdates, promotions, archiveEntries, removeEntryIds }).catch(() =>
    toast("Erro ao finalizar a compra.")
  );

  closeSheets();
  toast("Compra finalizada. Estoque atualizado.");
}

// ---------- ajustes ----------

function renderSettings() {
  const muitoEl = $("th-muito");
  const poucoEl = $("th-pouco");
  if (document.activeElement !== muitoEl) {
    muitoEl.value = Math.round(state.thresholds.muitoMin * 100);
  }
  if (document.activeElement !== poucoEl) {
    poucoEl.value = Math.round(state.thresholds.poucoMax * 100);
  }
  renderSectionsManager();
}

function saveThresholdsFromInputs() {
  const muito = Number($("th-muito").value) / 100;
  const pouco = Number($("th-pouco").value) / 100;
  const ok = validThresholds(muito, pouco);
  $("th-error").hidden = ok;
  if (!ok) return;
  db.saveThresholds(muito, pouco).catch(() => toast("Erro ao salvar níveis."));
}

function renderSectionsManager() {
  const ul = $("sections-list");
  ul.innerHTML = "";

  state.sections.forEach((sec, idx) => {
    const li = document.createElement("li");
    li.className = "section-row";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = sec.name;
    nameInput.maxLength = 40;
    nameInput.addEventListener("change", () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.value = sec.name;
        return;
      }
      db.renameSection(sec.id, name).catch(() => toast("Erro ao renomear."));
    });

    const up = document.createElement("button");
    up.className = "icon-btn";
    up.textContent = "▲";
    up.disabled = idx === 0;
    up.setAttribute("aria-label", "Mover para cima");
    up.addEventListener("click", () =>
      db.swapSectionOrder(sec, state.sections[idx - 1]).catch(() => toast("Erro ao reordenar."))
    );

    const down = document.createElement("button");
    down.className = "icon-btn";
    down.textContent = "▼";
    down.disabled = idx === state.sections.length - 1;
    down.setAttribute("aria-label", "Mover para baixo");
    down.addEventListener("click", () =>
      db.swapSectionOrder(sec, state.sections[idx + 1]).catch(() => toast("Erro ao reordenar."))
    );

    const del = document.createElement("button");
    del.className = "icon-btn del";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Excluir seção");
    del.addEventListener("click", () => {
      const count = state.items.filter((i) => i.sectionId === sec.id).length;
      if (count > 0) {
        toast(`"${sec.name}" tem ${count} ${count === 1 ? "item" : "itens"}. Mova-os para outra seção antes de excluir.`);
        return;
      }
      if (confirm(`Excluir a seção "${sec.name}"?`)) {
        db.deleteSection(sec.id).catch(() => toast("Erro ao excluir."));
      }
    });

    li.append(nameInput, up, down, del);
    ul.appendChild(li);
  });
}

// ---------- snapshot handlers ----------

function onSettings(data) {
  if (data === null) {
    if (!state.seededThresholds) {
      state.seededThresholds = true;
      db.seedDefaults({ seedThresholds: true, seedSections: false }).catch(() => {});
    }
    return;
  }
  state.thresholds = {
    muitoMin: Number(data.muitoMin) || DEFAULT_THRESHOLDS.muitoMin,
    poucoMax: Number(data.poucoMax) || DEFAULT_THRESHOLDS.poucoMax,
  };
  renderSettings();
  renderStock(); // levels take effect immediately, no reload
}

function onSections(sections) {
  if (sections.length === 0 && !state.seededSections) {
    state.seededSections = true;
    db.seedDefaults({ seedSections: true, seedThresholds: false }).catch(() => {});
    return;
  }
  state.sections = sortSections(sections);
  renderStock();
  renderShop();
  renderSectionsManager();
}

function onItems(items) {
  if (items.length === 0 && !state.seededItems) {
    state.seededItems = true;
    db.seedDefaultItems().catch(() => toast("Erro ao criar itens iniciais."));
    return;
  }
  const prev = state.itemsById;
  state.items = items;
  state.itemsById = new Map(items.map((i) => [i.id, i]));

  // Only currentStock changed on already-rendered rows? Patch in place and
  // skip the full re-render (keeps 200+ item lists smooth on stepper taps).
  let structural = prev.size !== state.itemsById.size || prev.size === 0;
  if (!structural) {
    for (const [id, it] of state.itemsById) {
      const old = prev.get(id);
      if (
        !old ||
        old.name !== it.name ||
        old.sectionId !== it.sectionId ||
        old.maxStock !== it.maxStock ||
        (old.unit || "") !== (it.unit || "") ||
        (old.note || "") !== (it.note || "") ||
        isVisible(old) !== isVisible(it)
      ) {
        structural = true;
        break;
      }
    }
  }

  if (structural) renderStock();
  else {
    for (const [id, it] of state.itemsById) {
      const old = prev.get(id);
      if (old && old.currentStock !== it.currentStock) patchItemRow(it);
    }
    updateSelectionBar();
  }
}

function onEntries(entries) {
  state.entries = entries;
  renderShop();
}

// ---------- tabs ----------

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  document.querySelectorAll(".tabbtn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  window.scrollTo(0, 0);
}

// ---------- auth + boot ----------

function showLogin() {
  $("screen-login").hidden = false;
  $("app-shell").hidden = true;
}

function showApp() {
  $("screen-login").hidden = true;
  $("app-shell").hidden = false;
  startListeners();
}

function startListeners() {
  if (state.listenersStarted) return;
  state.listenersStarted = true;
  const err = () => toast("Erro de conexão com o banco.");
  db.listenSettings(onSettings, err);
  db.listenSections(onSections, err);
  db.listenItems(onItems, err);
  db.listenShoppingList(onEntries, err);
}

const LOGIN_ERRORS = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco.",
  "auth/network-request-failed": "Sem conexão. Tente novamente.",
};

async function handleLogin(e) {
  e.preventDefault();
  const btn = $("btn-login");
  const errEl = $("login-error");
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = "Entrando…";
  try {
    await db.login($("login-email").value.trim(), $("login-password").value);
    // watchAuth flips the screens.
  } catch (ex) {
    errEl.textContent = LOGIN_ERRORS[ex.code] || "Não foi possível entrar. Tente novamente.";
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
}

// ---------- offline indicator ----------

function updateOnline() {
  $("offline-banner").hidden = navigator.onLine;
}

// ---------- wiring ----------

function wire() {
  // login
  $("login-form").addEventListener("submit", handleLogin);

  // tabs
  document.querySelectorAll(".tabbtn").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );

  // search
  $("search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderStock();
  });

  // filter chips
  document.querySelectorAll("#filter-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const level = chip.dataset.level;
      if (state.filters.has(level)) state.filters.delete(level);
      else state.filters.add(level);
      chip.classList.toggle("on");
      if (!selectionMode()) state.selected.clear();
      renderStock();
    });
  });

  // selection
  $("select-all").addEventListener("change", (e) => {
    const visible = state.items.filter(isVisible);
    if (e.target.checked) visible.forEach((i) => state.selected.add(i.id));
    else state.selected.clear();
    renderStock();
  });

  $("btn-add-selected").addEventListener("click", () => {
    const already = new Set(state.entries.filter((e) => e.itemId).map((e) => e.itemId));
    const toAdd = [...state.selected]
      .filter((id) => !already.has(id))
      .map((id) => state.itemsById.get(id))
      .filter(Boolean);
    const skipped = state.selected.size - toAdd.length;

    if (toAdd.length > 0) {
      db.addEntriesForItems(toAdd).catch(() => toast("Erro ao adicionar."));
    }
    toast(
      toAdd.length === 0
        ? "Todos já estavam na lista."
        : `${toAdd.length} ${toAdd.length === 1 ? "item adicionado" : "itens adicionados"}` +
          (skipped > 0 ? ` (${skipped} já na lista)` : "")
    );
    state.selected.clear();
    renderStock();
  });

  // new / edit item
  $("fab-new-item").addEventListener("click", () => openItemSheet(null));
  $("item-form").addEventListener("submit", submitItemForm);
  $("btn-item-delete").addEventListener("click", () => {
    const item = state.itemsById.get(state.editingItemId);
    if (item && confirm(`Excluir "${item.name}" da lista padrão?`)) {
      db.deleteItem(item.id).catch(() => toast("Erro ao excluir."));
      closeSheets();
    }
  });

  // item avulso
  $("btn-avulso").addEventListener("click", () => {
    fillSectionSelect($("avulso-section"), state.sections[0]?.id);
    $("avulso-name").value = "";
    openSheet("sheet-avulso");
  });
  $("avulso-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("avulso-name").value.trim();
    const sectionId = $("avulso-section").value;
    if (!name || !sectionId) return;
    db.addLooseEntry(name, sectionId).catch(() => toast("Erro ao adicionar."));
    closeSheets();
  });

  // finalizar compra
  $("btn-finish").addEventListener("click", openFinishSheet);
  $("btn-finish-confirm").addEventListener("click", confirmFinish);

  // ajustes
  $("th-muito").addEventListener("change", saveThresholdsFromInputs);
  $("th-pouco").addEventListener("change", saveThresholdsFromInputs);
  $("section-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("section-add-name").value.trim();
    if (!name) return;
    const maxOrder = state.sections.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    db.addSection(name, maxOrder + 1).catch(() => toast("Erro ao adicionar seção."));
    $("section-add-name").value = "";
  });
  $("btn-zero-stock").addEventListener("click", () => {
    const n = state.items.length;
    if (n === 0) return;
    if (!confirm(`Zerar o estoque atual de todos os ${n} itens?`)) return;
    db.zeroAllStocks(state.items.map((i) => i.id))
      .then(() => toast("Estoque zerado."))
      .catch(() => toast("Erro ao zerar o estoque."));
  });
  $("btn-logout").addEventListener("click", () => {
    if (confirm("Sair da conta neste aparelho?")) db.logout();
  });

  // sheets
  $("sheet-backdrop").addEventListener("click", closeSheets);
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", closeSheets)
  );

  // offline indicator
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  updateOnline();
}

function boot() {
  wire();
  $("app-version").textContent = `MercadoJá · ${APP_VERSION}`;

  // iOS install hint (login screen only, like 01. app)
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("install-card").hidden = !!standalone;

  if (!db.isConfigured()) {
    showLogin();
    $("setup-warning").hidden = false;
    $("login-form").querySelectorAll("input, button").forEach((el) => (el.disabled = true));
    return;
  }

  db.init();
  db.watchAuth((user) => {
    if (user) showApp();
    else showLogin();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

boot();
