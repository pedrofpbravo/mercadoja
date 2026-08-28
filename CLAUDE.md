# CLAUDE.md — Build Spec: "MercadoJá" (Household Grocery Inventory PWA)

You are building a small, production-quality Progressive Web App for exactly 2 users (a couple) to track household grocery stock and generate a shopping list from it. Follow this spec closely. Where the spec is silent, choose the simplest option that satisfies the acceptance criteria.

---

## 1. Product summary

A single shared household inventory ("Lista Padrão") of grocery items organized by supermarket section. Each item has a **max expected stock** (set once) and a **current stock** (updated frequently). The app computes a stock level — **Muito / Médio / Pouco** — from the ratio `currentStock / maxStock` and shows a color indicator. Users filter low-stock items and push them to a **Lista de Compras**, check items off in the store, and on finishing the trip the app updates current stock (default = max, adjustable).

- UI language: **Portuguese (pt-BR)**. All labels, buttons, and empty states in Portuguese.
- Users: 2 people sharing one account. No multi-household support.
- Mobile-first: this will be used on iPhones via Safari, added to the home screen as a PWA.

## 2. Tech stack (fixed — do not substitute)

- **React 18 + TypeScript + Vite**
- **Tailwind CSS** for styling
- **vite-plugin-pwa** for installability + offline app shell (service worker, manifest, icons)
- **Firebase**:
  - **Auth** — email/password, one shared account for both users
  - **Firestore** — data store, with `persistentLocalCache` (multi-tab) enabled for offline reads/writes and automatic sync on reconnect
  - **Hosting** — deployment target (include `firebase.json` and deploy instructions in README)
- No other backend, no server code, no additional state libraries beyond React state/context (Zustand allowed only if genuinely needed).

Firebase config comes from environment variables (`.env.local`, `VITE_FIREBASE_*`). Never hardcode keys. Include `.env.example`.

## 3. Auth model

- Single shared account (one email + password created manually in the Firebase console by the owner).
- App shows a minimal login screen ("Entrar") with email + password; session persists (`browserLocalPersistence`) so login is effectively one-time per device.
- No sign-up flow, no password reset UI (console-managed), no user profiles.
- Firestore security rules: all reads/writes require `request.auth != null`. Provide the rules file.

## 4. Data model (Firestore)

Root collection per concept (single household, so no household nesting needed):

```
/settings/thresholds        { muitoMin: 0.66, poucoMax: 0.33 }   // editable in Settings screen
/sections/{sectionId}       { name: string, order: number }
/items/{itemId}             { name, nameLower, sectionId, maxStock: number,
                              currentStock: number, unit?: string,
                              createdAt, updatedAt }
/shoppingList/{entryId}     { itemId: string | null,              // null = item avulso
                              name, sectionId, checked: boolean,
                              addedAt, checkedAt? }
/archive/{tripId}           { finishedAt, entries: [...] }        // snapshot on "Finalizar compra"
```

Rules and derivations:
- **Level is computed client-side, never stored.** `ratio = currentStock / maxStock`:
  - `ratio > muitoMin` → **Muito** (green)
  - `poucoMax ≤ ratio ≤ muitoMin` → **Médio** (yellow)
  - `ratio < poucoMax` → **Pouco** (red)
- `nameLower` supports case/accent-insensitive search (normalize accents client-side too).
- Seed default sections on first run if `/sections` is empty: Hortifruti, Laticínios, Mercearia, Padaria, Congelados, Bebidas, Limpeza, Higiene. Sections are fully editable (add, rename, reorder, delete — deleting a section with items requires reassigning or blocking with a message).
- All timestamps via `serverTimestamp()`.

## 5. Screens & features

### 5.1 Lista Padrão (home screen)
- Items grouped under **collapsible section headers**, ordered by section `order`.
- Each item row shows: color dot (level), name, `currentStock / maxStock`, and an **inline stepper (− / +)** to edit current stock **without opening a detail screen** — max 1–2 taps, level color recalculates instantly (optimistic UI).
- Tapping the row opens an edit sheet: name, section, maxStock, unit, delete.
- **Search bar** (accent-insensitive, filters across all sections).
- **Filter chips**: Pouco / Médio / Muito — multi-select (e.g., Pouco + Médio together).
- When a filter is active, show a selection mode: checkboxes per item, "Selecionar todos", and a primary action **"Adicionar à lista de compras"** (batch). Adding an item already on the shopping list is a no-op (dedupe by `itemId`).
- FAB "＋ Novo item": requires name, section, and **maxStock (mandatory at creation)**; currentStock defaults to maxStock.

### 5.2 Lista de Compras
- Entries grouped by section, same ordering as home.
- Tap to **check off** (strikethrough, moves to bottom of its section). Unchecking allowed.
- Add **item avulso** (free-text, pick a section) not present in Lista Padrão; after the trip, offer "Salvar na lista padrão?" (then require maxStock).
- Swipe or button to remove an entry.
- **"Finalizar compra"** button:
  1. Shows a confirmation sheet listing checked items, each with a pre-filled new `currentStock = maxStock`, individually adjustable before confirming.
  2. On confirm: updates each linked item's `currentStock`, archives the trip to `/archive`, clears checked entries. Unchecked entries: ask "Manter na lista?" (keep or clear).

### 5.3 Ajustes (settings)
- Edit thresholds (two sliders/percent inputs; validate `poucoMax < muitoMin`).
- Manage sections (add / rename / reorder / delete).
- Logout.

### 5.4 Navigation
Bottom tab bar: **Estoque** | **Compras** (with badge = unchecked count) | **Ajustes**.

## 6. Key flows (must work end-to-end)

- **Fluxo A — Update stock**: open app → find item (section or search) → tap −/+ → color updates instantly → syncs to the other phone within seconds.
- **Fluxo B — Build list**: filter "Pouco" (+ "Médio") → select all → "Adicionar à lista de compras" → list is populated, grouped by section.
- **Fluxo C — In the store (possibly offline)**: open Lista de Compras → check items while shopping → "Finalizar compra" → stocks updated (default max, adjusted where needed) → list cleared → changes sync when back online.

## 7. Non-functional requirements

- **Offline-first**: Firestore persistent cache + PWA service worker. The full app (both lists, checking items, editing stock, finishing a trip) must work with airplane mode on, syncing on reconnect. Show a subtle offline indicator.
- **Real-time sync**: use `onSnapshot` listeners so both phones reflect changes in near real-time.
- **Performance**: smooth with 200+ items; avoid re-rendering the full list on a single stepper tap.
- **PWA**: valid manifest (name "MercadoJá", pt-BR, standalone display, theme color), iOS meta tags, 192/512 icons (generate simple placeholder icons).
- Optimistic updates everywhere; no blocking spinners for writes.

## 8. Out of scope (do NOT build)

Prices/spend tracking, barcode/receipt scanning, AI suggestions or consumption forecasting, multiple households/lists, push notifications, Android/iOS native code, sign-up flows.

## 9. Suggested build order

1. Scaffold (Vite + TS + Tailwind + PWA plugin), Firebase init, auth screen, security rules, seed sections.
2. Lista Padrão: item CRUD, grouping, inline stepper, level computation, search.
3. Filter chips + batch add → Lista de Compras with check-off.
4. "Finalizar compra" flow (stock update sheet + archive) + item avulso.
5. Settings (thresholds, sections), offline polish, PWA install experience, README.

## 10. Acceptance criteria (verify before declaring done)

- [ ] Both flows A, B, C work end-to-end, including fully offline in Fluxo C.
- [ ] Stock edit is ≤ 2 taps from the home screen; level color recalculates immediately.
- [ ] Level thresholds are editable and take effect without reload.
- [ ] New item cannot be created without maxStock; item avulso can be promoted to Lista Padrão.
- [ ] Changes on one logged-in device appear on the other within seconds when online.
- [ ] Batch "Adicionar à lista de compras" dedupes correctly.
- [ ] "Finalizar compra" pre-fills currentStock = maxStock, allows per-item adjustment, archives the trip, and clears the list.
- [ ] Firestore rules deny unauthenticated access; keys only via env vars.
- [ ] All UI text in pt-BR; app installable to iOS home screen and opens standalone.

## 11. README must include

Firebase project setup steps (enable email/password auth, create the shared user, create Firestore DB, paste config into `.env.local`), local dev commands, and `firebase deploy` instructions for Hosting.
