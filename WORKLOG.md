# WORKLOG — MercadoJá

## 2026-09-04 — v8: adicionar à lista sem filtro + avulso vira item do estoque

### Plan (approved by user via AskUserQuestion batch)

Two adjustments requested:

1. Add stock items to the shopping list without activating a level filter.
   Decision: per-row cart button on every stock item row (1 tap adds; visual
   "on" state when the item is already on the list). Existing filter-based
   selection mode stays unchanged.
2. Items added via the shopping list ("item avulso") must be registered in
   the stock list, not just added as loose entries.
   Decisions: mandatory maxStock field (spec rule), currentStock = 0 on
   creation, typeahead against existing items to avoid duplicates (picking a
   match adds a linked entry instead of creating a new item). Legacy
   itemId:null entries still handled in Finalizar compra.

### Delegations

- [failed] Codex brief 1 (task-mtndpsey-laxc1a): both adjustments in one
  scoped brief (index.html, styles.css, js/main.js, js/db.js, js/fakedb.js;
  bump v7 to v8 in main.js APP_VERSION and sw.js CACHE). Codex executor
  rejected every command, even read-only, with CreateProcess:
  Rejected("approval request failed"). No files changed.
- [failed] Retry via --resume (task-mtndsex5-o64z9m): same blocker,
  CreateProcess: Rejected("approval request failed"). Even Codex's patch
  mechanism was refused before writing. No files changed (git status clean
  apart from pre-existing CLAUDE.md edit and this WORKLOG).
- [stopped] Escalated to the user per CLAUDE.md rule (Codex unreachable:
  do not silently do the work). Codex CLI approval/sandbox mode likely
  needs fixing; /codex:setup can diagnose. Approved scope and full brief
  are recorded above for re-delegation once Codex is functional.

- [done] User authorized bypassing the plugin: ran `codex exec` directly
  (codex-cli 0.153.2, workspace-write sandbox, brief via stdin). Codex
  implemented everything in one run: index.html, styles.css, js/main.js,
  js/db.js, js/fakedb.js, sw.js.

### Review findings / fixes

- Full diff reviewed: matches the brief. createItemWithEntry is a single
  writeBatch with entryId == itemId (dedupe convention preserved);
  addLooseEntry removed from both db layers; legacy itemId:null handling
  (avulso tag, "Salvar na lista padrão") untouched; cart state patched via
  itemRowEls in onEntries without full re-render. Codex also stripped em
  dashes from pre-existing comments (aligned with user style rules, kept).
- Verified in #debug preview, one consolidated script, 19/19 checks passed:
  cart on every row, add + dedupe + active state on/off, edit sheet stays
  closed, "Adicionar item" typeahead links existing items (no avulso tag),
  maxStock >= 1 validation, new item created with currentStock 0 (Pouco,
  "0 / 4"), exact-name submit does not duplicate, selection bar still
  filter-gated, version v8. No console errors; 375px layout fits with no
  horizontal scroll.
- Fixes needed: none.

### Open items

- Not committed (user has not asked). Firestore path (db.js) exercised in
  code review only; the batch mirrors the tested fakedb behavior.

## 2026-09-06 — v9: arrastar para a esquerda + item da lista vai para Não categorizado

### Escopo aprovado (AskUserQuestion, uma rodada)

1. Estoque: manter o botão de carrinho por linha (v8) e somar o gesto de
   arrastar para a esquerda. Passou do limite e soltou: entra na lista. Se o
   item já está na lista, o mesmo gesto remove.
2. Compras > "Adicionar item": só o campo nome. Seção fixa em Não
   categorizado (criada se faltar), estoque máximo 1, atual 0.
3. Commit único v9 juntando o v8 (nunca commitado) e o v9, depois dos testes
   e da análise do que foi removido.
4. Verificação no navegador com #debug, em um script consolidado.

### Execução (Opus direto, sem delegação, a pedido do usuário)

- index.html: sheet "Adicionar item" perdeu o select de seção e o campo de
  estoque máximo; texto de ajuda explica onde o item é cadastrado.
- styles.css: .item-row virou container (position relative, overflow hidden)
  com .row-bg (rótulo Adicionar/Remover) atrás de .row-fg (conteúdo que
  desliza). touch-action pan-y preserva a rolagem vertical. Flash verde ou
  vermelho ao concluir o gesto.
- js/main.js: attachRowSwipe (pointer events, limiar 8px para decidir
  horizontal x vertical, gatilho em 64px, curso máximo 104px, captura de
  ponteiro best effort), toggleItemOnShoppingList, flashRow,
  suppressClickUntil para o clique pós-gesto não abrir a ficha do item.
  submitAvulsoForm agora é async: nome existente vira entrada ligada ao item,
  nome novo cria item em UNCAT_ID com maxStock 1 (garante a seção antes).
- Versão v9 em main.js e sw.js. .claude/launch.json: porta 8080 (bloqueada
  pelo Windows) trocada por 8917.

### Verificação

- Servidor local + #debug, dois scripts consolidados: 34/34 e 12/12 checks.
  Cobre estrutura das linhas, adicionar/remover por gesto, gesto curto e
  arrasto vertical sem efeito, supressão do clique, ficha abrindo no clique
  normal, botão de carrinho e dedupe, steppers, campos do avulso ausentes,
  item novo em Não categorizado 0/1 Pouco e ligado à entrada (sem tag
  avulso), nome existente sem duplicar, modo seleção por filtro, batch add,
  Finalizar compra fim a fim, sem rolagem horizontal em 375px.
- Console sem erros. Varredura estática: nenhuma função órfã em main.js,
  nenhum export de db.js sem uso, db.js e fakedb.js com a mesma API, nenhum
  id referenciado no JS ausente do HTML.

### O que foi removido desde o v7 e por quê

- addLooseEntry (db.js e fakedb.js) e o fluxo "Item avulso" com
  itemId: null. Substituído por createItemWithEntry: todo item adicionado
  pela aba Compras nasce como item do estoque. Decisão do usuário, diverge do
  CLAUDE.md 5.2 de propósito.
- O tratamento legado continua no código (tag "avulso" na linha, "Salvar na
  lista padrão" com estoque máximo em Finalizar compra, promotions em
  finishTrip). Faz sentido manter: um backup antigo importado ainda traz
  entradas com itemId nulo.
- Select de seção e campo de estoque máximo do sheet avulso. fillSectionSelect
  e defaultSectionId seguem em uso pela ficha de item, então não sobrou
  código morto.

### Riscos e itens em aberto

- Item criado pela lista nasce com máximo 1. Em Finalizar compra o estoque
  vem pré-preenchido com 1; comprando mais, é só digitar o número maior.
- Gesto testado com PointerEvent sintético no navegador do Claude, não em
  Safari de iPhone real. Vale um teste no aparelho.

## 2026-10-03: v10, receitas favoritas

### Plan (approved by user in a two-round grilling session)

- Field `favorite: boolean` on /recipes docs, shared by both phones
  (missing field = not favorite). Included in backup export and import.
- Favoriting only inside the recipe sheet: star button next to the title,
  part of the form (saved on Salvar, discarded on Cancelar), also on new
  recipes.
- Card: small amber star in the top-right corner, only on favorites, not
  interactive.
- Chip "★ Favoritas" in the Receitas header, in-memory toggle (not
  persisted), visible when at least 1 recipe exists.
- Sort: favorites first, then alphabetical inside each group, no headers.
- Filtered empty state: "Nenhuma receita favorita ainda. Toque na ☆ de uma
  receita para favoritar." (user kept this text).
- Version v9 to v10. Codex runs the tests; Claude reviews only.

### Delegations

- [done] One brief via `codex exec` (codex-cli 0.159.2, workspace-write,
  brief via stdin). Codex changed index.html, styles.css, js/main.js,
  js/db.js, js/fakedb.js, sw.js and added a debug-only
  `window.__importBackup` hook.
- Codex tests: static checks PASS (same 32 exports in db.js and fakedb.js,
  71/71 ids present, no dashes added, versions synced). Headless Edge run
  in #debug: 12/12 PASS (seed stars and order, cancel discards, save adds,
  rename keeps favorite, create with/without star, chip filter on/off,
  filtered empty state, empty state with 0 recipes, backup export/import
  incl. missing field, 375px no overflow and no star overlap, v10 label,
  zero errors).
- Caveat: the Codex sandbox had no network, so the Firebase CDN imports in
  main.js could not load. Codex ran the UI from temporary copies with only
  the unused realDb import stubbed; debug mode still used fakedb.js.

### Review findings / fixes

- Full diff reviewed against the plan: matches. Global button reset keeps the
  sheet star unstyled; `#recipe-chips[hidden]` rule needed because `.chips`
  is display:flex. updateRecipe always writes `favorite`, so edits do not
  drop it. closeSheets resets the draft.
- Fixes needed: none.

### Open items

- Firestore path (db.js) reviewed by reading only; check on the real app
  that favoriting syncs between both iPhones.
