# Explorers & Pirates — Land Ho! step 2a (fixed start + general rules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a Land Ho! game each player starts on a fixed spot with 1 settlement, 1 road, 1 harbor settlement and 1 ship carrying a settler, and the game skips the placement rounds. The general E&P rules apply: no robber, no development cards, no cities, no Longest Road; bank trades are 3:1; gold (1 gold for an empty roll, 2 gold → 1 resource twice a turn, 3 cards → 1 gold); harbor settlements (2 wheat + 2 ore, 2 VP); no building next to face-down hexes. Bots play by these rules and the human can use them from the HUD. Ships still don't move (step 2b).

**Architecture:** New engine files `js/engine/explorersPirates/setup.js` (fixed starts) and `js/engine/explorersPirates/rules.js` (constants + small rule helpers). Hooks in `game.js`, `board.js` and `bot.js` sit behind `s.explorers` / `explorersPiratesOn`. Gold reuses the Rivers gold box (`Rivers.goldBox`) and `riversUI.goldModal`. New UI file `js/ui/explorersUI.js` holds the buttons and the click interaction; `gameView.js` and `boardView.js` only call into it.

**Tech Stack:** Vanilla ES modules, `tests/rules.mjs`, `tests/sim.mjs`, `tools/i18n.mjs`, python playwright for the headless 2D check.

**Spec:** Project doc `claude/explorers-pirates-architecture.md` (approved 2026-11-25). The user chose **A: fixed start positions** (2026-11-25).

## Global Constraints

- With every expansion off the engine must behave exactly as before. Every hook runs only behind `s.explorers` / `explorersPiratesOn(...)`. The fingerprint (`node /home/claude/scripts/fingerprint.mjs . | diff - /home/claude/scripts/before.txt`) must stay empty after every task. Regenerate `before.txt` from `2942a8e` first if the script is missing.
- Seafarers, C&K and T&B behaviour is unchanged: `node tests/sim.mjs 150` all finish.
- Spanish source strings in `t()` / `msg()`, with vi + en entries; `node tools/i18n.mjs check` 0 missing. English identifiers and comments.
- Pieces per player: settlements 5, roads 15, harbor settlements 4, ships 3, settlers 2. `HARBOR_COST = { wheat: 2, ore: 2 }`, `HARBOR_VP = 2`. Ship cost `{ wood: 1, sheep: 1 }` and settler cost (= settlement) are constants only in this step.
- Do not add keys to `COSTS` in `constants.js`; E&P costs live in `explorersPirates/rules.js`.

## Review Focus

1. **Building type `'harbor'` reaching code that only knows `'settlement' | 'city'`**: production, VP, renderers (2D/3D), stats table, Harbormaster `harborPoints`, fog `viewFor`. Each must treat a harbor as a 2-VP, 1-production building and must not crash. → tests in Task 3, check in Task 5.
2. **A roll of 7 in E&P**: players over the hand limit discard, then play goes straight on to `main`. No robber phase, no `moveRobber` from bots. → test in Task 3.
3. **2 and 3 players** get their own seat subsets, and the seats still follow the distance rule. → test in Task 2.
4. **Gold edge cases**: a third buy in a turn is refused; selling at 3:1; the bank is out of a resource; a player who got nothing on a 7 gets no gold (the rule says "except a 7"). → tests in Task 3.
5. **Modes with fixed starts**: "Casas secretas" (blindfold), "Blindfold: tablero volteado" (flipped), "Ciudad inicial" (setupCity), `setupRounds` 1–3 and `startBonus`. Placement is skipped, so none of them may hang the game or place extra pieces. flipped must still reveal the start island at the first turn; `startBonus` still applies. → test in Task 2.

---

### Task 2: Fixed start positions

(Task 1 = fingerprint baseline, as in the previous plan.)

**Files:**
- Modify: `js/engine/explorersPirates/maps.js` (`EP_MAPS.landHo.starts`, `EP_MAPS.landHo.seatsFor`)
- Create: `js/engine/explorersPirates/setup.js`
- Modify: `js/engine/game.js` (`createGame`: after `Explore.initExplorers(s)`, when `s.explorers`, call `EpSetup.placeStarts(s)` and go straight to `beginTurns(s)`)
- Test: `tests/rules.mjs`

**Interfaces:**
- Data: `starts: [{ settlement: {x, y}, road: {x, y}, harbor: {x, y} }]` × 4, using vertex coordinates in hex units (`board.vertices[i].x / .y`, rounded to 2 decimals). `road` is the far end of the road leaving `settlement`. `seatsFor: { 2: [i, j], 3: [i, j, k], 4: [0, 1, 2, 3] }`.
- Produces: `placeStarts(s)`. It resolves the coordinates to vertex/edge ids (nearest vertex within 0.05, else throw). For each player it sets `buildings[settlement] = {owner, type: 'settlement'}`, `buildings[harbor] = {owner, type: 'harbor'}` and `roads[road edge] = pid`. It adds a ship `s.epShips.push({ id, owner, edge, cargo: ['settler'] })` on the lowest-id edge at the harbor vertex whose `kind` is `'coast'` or `'sea'` and which is not already holding a ship. It sets piece counters `settlementsLeft 4, roadsLeft 14, harborsLeft 3, shipsLeft 2, settlersLeft 1, citiesLeft 0`, and gives the resources of the hexes around the **settlement** only (rulebook), not the harbor.
- `s.epShips` and `p.harborsLeft / shipsLeft / settlersLeft` exist only in E&P games.

**Choosing the seats** (a one-off script, not committed; record the result in `starts`): harbor vertex on the start island's coast with `x ≥ −4.5` (the side facing the unexplored areas); settlement on any start-island vertex. All 8 buildings follow the distance rule, and road ends do not touch another seat's building. Each seat reaches ≥ 4 different resources. Maximise the lowest seat pip total (pips = 6 − |7 − n| over the hexes of both buildings), then minimise the spread (target spread ≤ 2). For `seatsFor[2]` pick the two seats with the closest totals whose harbors are far apart; for `[3]` drop the seat that leaves the smallest spread. To keep it fast, prefilter settlement candidates to the 16 highest-pip vertices.

- [ ] **Step 1: Write failing tests:**
  - `'E&P salida fija: cada jugador recibe sus piezas'`: 4-bot E&P game straight from `createGame`. Expect `phase === 'roll'`, and per player exactly 1 settlement, 1 harbor and 1 road. Expect `s.epShips.length === 4`, each ship with `cargo` `['settler']` on a non-land edge touching its harbor. Counters as above. Each player's hand equals the resources around its settlement. `victoryPoints` = 3 each.
  - `'E&P salida fija: siempre los mismos sitios'`: seeds 1 and 2 give the same building vertices.
  - `'E&P salida fija: 2 y 3 jugadores'`: players 2 and 3 use `seatsFor`; the distance rule holds (no two buildings on adjacent vertices).
  - `'E&P salida fija y modos de colocación'`: with each of `modes.blindfold`, `modes.flipped`, `rules.setupCity`, `setupRounds: 3`, `startBonus: 1` the game starts in `roll` with the same pieces. flipped: the start island is `revealed` at turn 1 and the fog tiles are not. startBonus: +1 of every resource on top.
- [ ] **Step 2:** Run `node tests/rules.mjs`. Expected: the 4 new tests fail.
- [ ] **Step 3:** Run the seat script, write `starts` / `seatsFor`, implement `setup.js` and the `createGame` hook. With fixed starts the setup queue is never used, so set `s.setup = { queue: [], idx: 0, step: 'settlement', lastVid: null, blindActive: false, lastRound: 0, fixing: false }`.
- [ ] **Step 4:** Run rules (all pass), the fingerprint (empty diff) and `node tests/sim.mjs 150` (all finish).
- [ ] **Step 5:** Commit `E&P: fixed start positions for Land Ho!`.

### Task 3: General E&P rules

**Files:**
- Create: `js/engine/explorersPirates/rules.js`
- Modify: `js/engine/board.js` (`robber: -1` when E&P), `js/engine/game.js`, `js/engine/tradersBarbarians/rivers.js` (`goldBox` += `s.explorers`)
- Test: `tests/rules.mjs`

**Interfaces:**
- `rules.js` exports `HARBOR_COST`, `HARBOR_VP`, `SHIP_COST`, `SETTLER_COST`, `PIECES`, `NO_PRODUCTION_GOLD = 1`, `EP_TRADE_RATIO = 3`, `nearHidden(s, kind, id) -> bool` (kind `'vertex' | 'edge'`: true when any land tile in `hexes` or sea tile in `sea` is `fog && !revealed`), and `canBuildHarbor(s, pid, v) -> bool` (own `'settlement'`, vertex has `sea.length > 0`, `harborsLeft > 0`).
- `game.js` changes, each behind `s.explorers`:
  - `initExplorers` also sets `p.gold = 0` and `s.explorers.buys = null`.
  - `canBuildRoad` / `canBuildSettlement`: false when `nearHidden`.
  - `canBuildCity`: false. `H.build` `'city'`: fail `'En Exploradores y Piratas no hay ciudades.'`.
  - `H.build` `what: 'harbor'`: checks `canBuildHarbor` and affordability, pays `HARBOR_COST`, sets `type = 'harbor'`, `harborsLeft--`, `settlementsLeft++`, logs `msg('⚓ @{p} construye un poblado portuario.', ...)`, pushes fx `build`.
  - `H.buyDev`: fail `'En Exploradores y Piratas no hay cartas de desarrollo.'`.
  - `victoryPoints`: `'harbor'` counts `HARBOR_VP`.
  - `updateLongestRoad`: no-op (owner stays −1).
  - `tradeRatio`: starts at `EP_TRADE_RATIO` instead of 4.
  - `afterSeven`: returns `'main'`.
  - `afterRoll`, non-7 branch: every non-retired player whose gains are all 0 gets `NO_PRODUCTION_GOLD`. Push fx `{ kind: 'gold', pid, n: 1, what: 'noProduction' }`. Log once: `msg('🪙 Sin cosecha: {names} reciben 1 de oro.', ...)` (follow how the existing logs list players).
- `goldBuy` / `goldSell` work unchanged once `goldBox` includes `s.explorers`.

- [ ] **Step 1: Write failing tests** (on a main-phase E&P state built with `epConfig` + `createGame`, then `phase = 'main'`):
  - `'E&P: sin ladrón'`: `board.robber === -1`. A forced 7 with one player over the limit → `discard`, then after discarding → `main`.
  - `'E&P: sin cartas de desarrollo ni ciudades'`: `buyDev` and `build city` both fail with their messages; `legalCities` is empty.
  - `'E&P: poblado portuario'`: give 2 wheat + 2 ore → `build harbor` on own coastal settlement ok. Type `'harbor'`, VP +1 net (1 → 2), counters change, cost paid. Inland settlement and rival settlement refused. A roll on its hex gives 1 card, not 2.
  - `'E&P: comercio 3:1 y oro'`: `tradeRatio === 3`. `goldSell` 3 wood → +1 gold. `goldBuy` twice ok; a third in the same turn is refused; bank empty is refused.
  - `'E&P: oro por tirada sin cosecha'`: force a non-7 sum that pays player 0 only → others +1 gold each, player 0 none. Force a 7 → nobody gets gold.
  - `'E&P: nada junto a casillas boca abajo'`: a vertex / edge touching a face-down hex is not in `legalSettlements` / `legalRoads` even when connected. Revealing that tile (`revealed = true`) makes it legal.
  - `'E&P: sin Gran Ruta'`: 6 connected roads → `longestRoad.owner === -1`.
- [ ] **Step 2:** Run. Expected: fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rules, fingerprint and sim 150 all pass.
- [ ] **Step 5:** Commit `E&P: general rules (no robber/cards/cities, 3:1, gold, harbor settlements)`.

### Task 4: Bots

**Files:**
- Modify: `js/engine/bot.js`
- Test: `tests/rules.mjs`

**Interfaces:**
- The bot's build options gain `{ what: 'harbor', cost: HARBOR_COST, w: <same weight as city> }` when E&P and `legalHarbors` is non-empty. Export `legalHarbors(s, pid)` from `game.js`. The city and dev options are skipped in E&P.
- The Rivers gold logic at bot.js:423 already runs through `goldBox`; check that it fires in E&P. If not, enable it for `s.explorers` the way `s.barbAttack` is at bot.js:530.

- [ ] **Step 1: Write failing test** `'E&P: bots juegan sin jugadas ilegales'`: 4-bot E&P games, seeds 1–5, 400 actions each with `botAct` / `applyAction`, every action `ok`. Across the 5 games at least one `harbor` gets built and at least one `goldBuy` or `goldSell` happens (count from the log or fx).
- [ ] **Step 2:** Run. Expected: fail (bots never build a harbor).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rules, fingerprint and sim 150 all pass.
- [ ] **Step 5:** Commit `E&P: bots build harbor settlements and use gold`.

### Task 5: HUD + board drawing

**Files:**
- Create: `js/ui/explorersUI.js`
- Modify: `js/ui/gameView.js` (action bar, `affordPreview`, interaction chain, `describe` for `build harbor`), `js/ui/boardView.js` (harbor marker), `js/ui/board3d.js` (harbor renders as the house model plus a small anchor tag; final art comes in the 2D/3D step), `js/i18n/vi.js`, `js/i18n/en.js`

**Interfaces:**
- `epButtons(st, v, ui, { h, rerender, costIcons, canAfford, openGold })`: a harbor build button (testid `ep-harbor`, icon ⚓, label `t('Poblado portuario')`, cost `HARBOR_COST`, left `harborsLeft`) and a gold button (testid `gold-open`, like `baGoldButton`). Returns `[]` outside E&P.
- `epInteraction(st, v, ui, { mk, dispatch, rerender })`: when `ui.pick === 'harbor'` → `mk('city', legalHarbors, at => dispatch build harbor)`; otherwise `undefined`.
- In E&P, `gameView` hides the city button, the dev-card button and their `affordPreview` entries.
- 2D: a `'harbor'` building draws the house plus an ⚓ badge (`class: 'ep-harbor'`).

- [ ] **Step 1:** Implement the UI, then add the vi/en strings; `node tools/i18n.mjs check` → 0 missing.
- [ ] **Step 2: Headless 2D check** (`?gfx=flat`). Start an E&P Land Ho! game and assert there is no placement phase (banner is not "Place your settlement"). Expect 4 `.ep-harbor` badges, no `Ciudad` or `Carta` buttons, and an `ep-harbor` button. Give the human 2 wheat + 2 ore via `App.state` and build a harbor by clicking: 5 badges. The gold modal opens. No page errors. Save a screenshot.
- [ ] **Step 3:** rules, sim 150, fingerprint, i18n. Commit `E&P: HUD for harbor settlements and gold` and push to `main`.

**User check** (Vietnamese, in the hand-off):
1. Bật E&P → bắt đầu ván: không có vòng đặt nhà; mỗi người đã có 1 nhà, 1 đường và 1 nhà cảng ⚓ trên đảo xuất phát.
2. Nút ⚓ Poblado portuario và 🪙 Oro có mặt; không còn nút Thành phố và Thẻ phát triển; ra 7 chỉ bỏ bài, không có kẻ cướp.
3. Tắt E&P và chơi ván thường như cũ.
