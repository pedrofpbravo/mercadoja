# MercadoJá

Estoque da casa e lista de compras, para duas pessoas.

A single shared household inventory ("Lista Padrão") organized by supermarket section. Each item has a max expected stock and a current stock; the app computes a level — **Muito** (green), **Médio** (yellow), **Pouco** (red) — from `current / max`. Filter the low items, push them to the **Lista de Compras**, check them off in the store (works fully offline), and on "Finalizar compra" the stocks are updated (default = max, adjustable per item) and the trip is archived. Both phones stay in sync in near real time.

Same architecture as `01. app`: no build step, plain JS modules, Firebase SDK from the CDN, one config file, installable iPhone PWA.

## How it works day to day

1. **Estoque** — items grouped by section, each with a color dot and a − / + stepper. Update stock in one tap; the other phone sees it seconds later.
2. Filter **Pouco** (and **Médio** if you want), tap **Selecionar todos**, then **Adicionar à lista de compras**.
3. **Compras** — in the store, tap items to check them off. Airplane mode is fine; everything syncs when you're back online.
4. **Finalizar compra** — confirm the new stock per item (pre-filled with the max), the list clears, and the trip is archived. Itens avulsos can be promoted to the Lista Padrão (you'll be asked for their max stock).
5. **Ajustes** — edit the Muito/Pouco thresholds, manage sections, log out.

## One-time setup

All keys go in one file: `js/config.js`.

### 1. Firebase project (~10 min)

1. Go to console.firebase.google.com and create a project (e.g. `mercadoja`). Google Analytics can be disabled.
2. **Authentication**: Build > Authentication > Get started > enable **Email/Password**. Then in the Users tab, click **Add user** and create the one shared account (e.g. `casa@exemplo.com` + a password). Both phones log in with this same account, once per device.
3. **Firestore**: Build > Firestore Database > Create database. Pick a region near you (e.g. `southamerica-east1`). Start in **production mode**.
4. **Rules**: open the Rules tab, replace the contents with the contents of `firestore.rules` from this repo, and click **Publish**.
5. **Config**: Project Overview > web icon (`</>`) > register an app (no hosting needed) > copy the `firebaseConfig` values into `js/config.js`.

There is no sign-up screen and no password reset in the app; both are managed in the Firebase console. Default sections (Hortifruti, Laticínios, …) and level thresholds are seeded automatically on first login.

### 2. Hosting

**Option A — GitHub Pages (like 01. app, ~5 min):**

1. Create a public repository and push this folder's files to `main`.
2. Repo Settings > Pages > Deploy from a branch > `main`, `/ (root)` > Save.
3. The app goes live at `https://<user>.github.io/<repo>/`. Every push redeploys.

**Option B — Firebase Hosting** (needs Node.js on some machine):

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>
firebase deploy
```

`firebase.json` is already set up (hosting root = this folder, plus the Firestore rules, so `firebase deploy` publishes both).

## Install on iPhone

Open the live URL in Safari, tap the Share button, then **Adicionar à Tela de Início**. Log in once; the session persists on the device.

## Deploying changes

1. Bump the cache version in `sw.js` (`mj-v1` to `mj-v2`, and so on).
2. Push (or `firebase deploy`). On the phones, force-close and reopen the app once.

## Local development

Serve the folder and open http://localhost:8123:

```bash
python -m http.server 8123
```

Open http://localhost:8123/#debug to preview every screen and flow with in-memory sample data, no Firebase keys needed.

## Notes on keys and offline behavior

- The Firebase web config in `js/config.js` is visible in the browser and in a public repo. That is by design for Firebase web apps: access control lives in `firestore.rules`, which denies everything to anyone not logged into the shared account.
- Offline: the app shell is cached by the service worker and the data by Firestore's persistent local cache, so browsing, checking items off, editing stock, and even finishing a trip all work with no connection and sync on reconnect. A banner at the top shows when you're offline.
