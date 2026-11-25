# Explorers & Pirates — Land Ho! step 1 (board data + lobby) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turning on "Exploradores y Piratas" in the lobby and picking "¡Tierra a la vista!" starts a game on Claude's Land Ho! map: a fixed starting island, two face-down unexplored areas, real sea tiles, no harbours. Nothing else about the rules changes yet.

**Architecture:** New module `js/engine/explorersPirates/` (scenarios + map builder). `generateBoard` builds the board from it the way it does for Seafarers (fixed tiles + `makeSea`/`addSeaGraph`), but without `board.islands`, so no Seafarers rule switches on. `createGame` hides the face-down tiles. The lobby gets a scenario picker modelled on `tbScenarioPicker`. Renderers draw the face-down sea through the existing Seafarers fog drawing.

**Tech Stack:** Vanilla ES modules, Node test scripts (`tests/rules.mjs`, `tests/sim.mjs`), `tools/i18n.mjs`.

**Spec:** Project doc `claude/explorers-pirates-architecture.md` (approved 2026-11-25).

## Global Constraints

- With every expansion off the engine must behave exactly as before: same board, same RNG draws, same state. Expansion code runs only behind `explorersPiratesOn(...)`. Proven by the fingerprint (Task 1) staying IDENTICAL.
- One expansion at a time. Priority Seafarers > Cities & Knights > Traders & Barbarians > Explorers & Pirates.
- The game's source language is Spanish. Every new UI or data string is Spanish inside `t()` / data files, with entries added to `js/i18n/vi.js` and `js/i18n/en.js`. `node tools/i18n.mjs check` must report no missing keys.
- Identifiers and comments in English. Do not touch `LICENSE`.
- Config keys: `config.expansions.explorersPirates` (default `false`), `config.expansions.epScenario` (default `'landHo'`).
- Scenario ids and VP: `landHo` 8, `pirateLairs` 12, `fishForCatan` 15, `spicesForCatan` 15, `explorersPirates` 17. Only `landHo` is `ready: true`. Players `[2, 4]` for all.

## Review Focus

1. **Old saves and online hosts** whose `config.expansions` has no `explorersPirates` / `epScenario` key: normalize to off / `landHo`. A not-ready id such as `'fishForCatan'` falls back to `landHo`. → test in Task 2.
2. **Turning E&P on while another expansion is on**, or the reverse: only one stays on, and `vpTarget` follows the expansion that was just switched on. → test in Task 2.
3. **2-, 3- and 4-player games and many seeds** all build a valid E&P board: same tile counts, nothing face-down on the starting island. → test in Task 3.
4. **"Niebla de guerra" mode together with E&P**: creating the game and calling `viewFor` must not throw, and face-down tiles stay hidden. → test in Task 4.
5. **Bots in the setup of an E&P game** (not restricted yet): a 4-bot game must reach `main` without an illegal action. Placing on face-down hexes is a known limitation of this step; the rules step fixes it. → test in Task 4.

---

### Task 1: Baseline fingerprint (not committed)

**Files:**
- Create: `/home/claude/scripts/fingerprint.mjs` (outside the repo)
- Create: `/home/claude/scripts/before.txt`

- [ ] **Step 1:** Write `fingerprint.mjs <repoPath>`. It runs 40 deterministic base games: `defaultConfig()`, `seed = 1000 + i`, `rules.randomStart = false`, all 4 players `kind: 'bot'`. Use the loop from `tests/sim.mjs` (`pendingActors` → `botAct` → `applyAction`) with no admin actions, and stop at `gameOver` or turn 1500. For each game print one line: `i winner turn VPs sha1(JSON.stringify(s.log.map(l => l.text ?? l)))`.
- [ ] **Step 2:** Run `node /home/claude/scripts/fingerprint.mjs /home/claude/kaakataaan > /home/claude/scripts/before.txt`. Expected: 40 lines, each with a winner.
- [ ] **Step 3:** Run it a second time and `diff` against `before.txt`. Expected: no output (the script is deterministic).

### Task 2: Expansion switch + scenario list

**Files:**
- Create: `js/engine/explorersPirates/scenarios.js`
- Modify: `js/engine/expansions.js`
- Modify: `tools/i18n.mjs` (`DATA_FILES` += `'engine/explorersPirates/scenarios.js'`)
- Test: `tests/rules.mjs`

**Interfaces:**
- Produces: `EP_SCENARIOS` (`{ [id]: { icon, name, desc, vp, players: [2, 4], ready } }`), `DEFAULT_EP_SCENARIO = 'landHo'`, `epScenarioOf(id)`, `epScenarioId(id)` (same fallback semantics as `tbScenarioOf` / `tbScenarioId`). From `expansions.js`: `explorersPiratesOn(x)` and `epScenarioOn(x)` (`''` when off).

Scenario data (Spanish source):

| id | icon | name | vp |
|---|---|---|---|
| landHo | 🧭 | ¡Tierra a la vista! | 8 |
| pirateLairs | 🏴‍☠️ | Guaridas piratas | 12 |
| fishForCatan | 🐟 | Pescado para Catán | 15 |
| spicesForCatan | 🌶️ | Especias para Catán | 15 |
| explorersPirates | ⚓ | Exploradores y piratas | 17 |

`landHo.desc`: `'Explora el mar con tus barcos, descubre dos tierras nuevas y lleva colonos para fundar poblados. Se juega a 8 puntos.'` The other four use one-line descriptions of their mission.

- [ ] **Step 1: Write failing tests** in `tests/rules.mjs`:
  - `'E&P: apagada por defecto y normaliza configs viejas'`: `defaultConfig().expansions.explorersPirates === false` and `epScenario === 'landHo'`. `normalizeExpansions({ expansions: { seafarers: false } })` gives `explorersPirates: false`, `epScenario: 'landHo'`. `{ epScenario: 'fishForCatan' }` normalizes to `'landHo'`.
  - `'E&P: solo una expansión a la vez'`: on a config with Seafarers on, call `EXPANSIONS.find(e => e.id === 'explorersPirates').set(c, true)`. Expect seafarers, citiesKnights and tradersBarbarians false, and `c.rules.vpTarget === 8`. Then switch Seafarers on with its `set`: E&P becomes false. A config with both `seafarers` and `explorersPirates` true normalizes to E&P off.
  - `'E&P: epScenarioOn'`: `''` when off, `'landHo'` when on.
- [ ] **Step 2:** Run `node tests/rules.mjs`. Expected: the 3 new tests fail.
- [ ] **Step 3: Implement.** Add the `EXPANSIONS` entry `{ id: 'explorersPirates', icon: '🧭', name: 'Exploradores y Piratas', desc: 'Barcos que transportan colonos, tierras por descubrir, piratas y misiones. Cinco escenarios que se juegan uno a uno.' }`; its `set` turns the others off and sets `vpTarget` to `epScenarioOf(ex.epScenario).vp` (10 when off). Each existing `set` also clears `ex.explorersPirates`. Extend `defaultExpansions()`. In `normalizeExpansions`, any of the other three on clears E&P, and `ex.epScenario = epScenarioId(ex.epScenario)`.
- [ ] **Step 4:** Run `node tests/rules.mjs`. Expected: all pass (139 + 3).
- [ ] **Step 5:** Fingerprint → `diff` against `before.txt` is empty. Commit `E&P: expansion switch and scenario list (only Land Ho! playable)`.

### Task 3: Land Ho! map builder

**Files:**
- Create: `js/engine/explorersPirates/maps.js`
- Test: `tests/rules.mjs`

**Interfaces:**
- Produces: `EP_MAPS.landHo` and `buildEpMap(id, rng) -> { land: [{ q, r, res, num, area, fog }], sea: [{ q, r, fog, area }] }`. `area` is `'start' | 'north' | 'south'` for land and fog sea, `null` for open sea. Coordinates use the same odd-r → axial centring as `buildScenario` in `seafarers/scenarios.js`; reuse that conversion and do not duplicate it.

Map data (legend: `.` sea; `W B S H O D` fixed starting-island land; `1` north slot; `2` south slot):

```
'.............',
'..WS....111..',
'.HOBW...1111.',
'..SDWH...111.',
'.BHOS........',
'.........222.',
'........2222.',
'.........222.',
'.............',
```

- `startNums` in reading order over the non-desert start hexes: `[9, 4, 10, 5, 8, 3, 11, 6, 9, 3, 12, 5, 10]` (13 numbers; checked: no 6/8 neighbours).
- North stack (10 slots): wood 2, brick 1, sheep 2, wheat 2, ore 1, sea 2. Numbers `[3, 4, 5, 6, 8, 9, 10, 11]`.
- South stack (10 slots): wood 1, brick 2, sheep 1, wheat 2, ore 2, sea 2. Numbers `[2, 4, 5, 6, 8, 9, 10, 12]`.
- RNG draws, in this order: shuffle the north contents, shuffle the north numbers, then the same for the south. Slots fill in reading order. Every slot is `fog: true`.

- [ ] **Step 1: Write failing tests:**
  - `'E&P mapa Tierra a la vista: forma y montones'`: `buildEpMap('landHo', { s: 7 })` (the RNG is a plain `{ s }` object, see `rng.js`). Expect 14 start land with `fog: false`, exactly one desert, and start numbers equal to `startNums`. Expect 8 + 8 fog land and 2 + 2 fog sea. Each area's land resources sorted equal its stack minus sea; each area's numbers sorted equal its number stack.
  - `'E&P mapa: determinista por semilla'`: the same seed gives a deep-equal result; seeds 1..20 do not all give the same north order.
  - `'E&P mapa: tierras nuevas separadas'`: no start hex is a neighbour of a north/south slot, and no north slot is a neighbour of a south slot.
- [ ] **Step 2:** Run. Expected: fail (module missing).
- [ ] **Step 3:** Implement `maps.js`.
- [ ] **Step 4:** Run. Expected: pass.
- [ ] **Step 5:** Commit `E&P: Land Ho! map (starting island + two unexplored stacks)`.

### Task 4: Board + game init

**Files:**
- Modify: `js/engine/board.js` (`generateBoard`)
- Create: `js/engine/explorersPirates/explore.js` (`initExplorers(s)` only, for now)
- Modify: `js/engine/game.js` (`createGame`: init + start log line)
- Test: `tests/rules.mjs`

**Interfaces:**
- Consumes: `buildEpMap`, `epScenarioOn`, `makeSea`, `addSeaGraph`.
- Produces: `board.explorers = { scenario }`; `tile.area` and `tile.fog` on land tiles; `sea[i].area` and `sea[i].fog`. Every edge gets `edge.kind` from `addSeaGraph`. `s.explorers = { scenario }`. Face-down tiles start with `revealed = numRevealed = false` (land) or `revealed = false` (sea). `board.islands` stays **undefined**.

generateBoard changes, all behind `const ep = explorersPiratesOn(config) ? buildEpMap(epScenarioOn(config), rng) : null`:
- `fixed = ep.land` (like `sf`); `deserts = gold = 0`; copy `area`/`fog` onto tiles; `nPorts = 0`.
- `sea = makeSea(tiles, ep.sea)` (copy `area` through: extend `makeSea` to keep `area` when present, with no change for Seafarers callers); `addSeaGraph(...)`; `extra.explorers = { scenario }`.
- The `ep` draw happens where `sf` is drawn, so the base path makes no extra RNG call.

Log line in `createGame`: `msg('🧭 Expansión Exploradores y Piratas activada: {n}.', { n: EP_SCENARIOS[epScenarioOn(s)].name })`.

- [ ] **Step 1: Write failing tests:**
  - `'E&P tablero: mar real, sin puertos, sin islas de Navegantes'`: `fresh(c => { c.expansions = { explorersPirates: true, epScenario: 'landHo' }; })` (use the raw `createGame` variant that keeps `setup`). Expect `board.ports.length === 0`, `board.islands === undefined`, `board.explorers.scenario === 'landHo'`, every edge has a `kind`, 16 land tiles `fog && !revealed && !numRevealed`, 4 sea tiles `fog && !revealed`, and `s.explorers` set.
  - `'E&P tablero: 2, 3 y 4 jugadores, 30 semillas'`: build without throwing; tile counts as above.
  - `'Base: sin claves de E&P'`: a default game has no `s.explorers` and no `board.explorers`.
  - `'E&P + niebla de guerra'`: `modes.fog = true` → `createGame` plus `viewFor(s, 0)` do not throw; in the view, face-down tiles have `res`/`num` hidden the same way Seafarers fog is.
  - `'E&P: bots terminan la colocación'`: a 4-bot E&P game played with `botAct`/`applyAction` reaches `phase === 'main'` in at most 200 actions, every action ok.
- [ ] **Step 2:** Run. Expected: fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `node tests/rules.mjs` (all pass) and `node tests/sim.mjs 150` (all games finish).
- [ ] **Step 5:** Fingerprint `diff` is empty. Commit `E&P: build the Land Ho! board and hide the unexplored areas`.

### Task 5: Lobby picker, rendering, translations

**Files:**
- Modify: `js/ui/lobby.js` (`epScenarioPicker()` in the expansions card, modelled on `tbScenarioPicker`; the map card shows a note instead of the shape grid when E&P is on, and hides size/deserts/gold like Seafarers)
- Modify: `js/ui/boardView.js:206` and `js/ui/board3d.js:2147` (`bd.islands` → `bd.islands || bd.explorers`)
- Modify: `js/i18n/vi.js`, `js/i18n/en.js`

**Interfaces:**
- Consumes: `EP_SCENARIOS`, `explorersPiratesOn`, `epScenarioOn`.
- Picker: testid `ep-scenarios`, cards `ep-scenario-<id>`. Not-ready scenarios use the "Próximamente" style and toast. Clicking a ready card sets `cfg.expansions.epScenario` and `cfg.rules.vpTarget = x.vp`. It shows the "Para {a}-{b} jugadores · {vp} puntos para ganar" line. No rules button yet (it comes with the illustrated rules step).
- Map-card note (Spanish): `'🧭 El mapa lo pone el escenario de Exploradores y Piratas.'`

Translations: vi uses the project's established terms; en uses "Explorers & Pirates", "Land Ho!", "Pirate Lairs", "Fish for Catan", "Spices for Catan".

- [ ] **Step 1:** Implement the picker, the map-card note and the two renderer checks.
- [ ] **Step 2:** Add vi/en strings. Run `node tools/i18n.mjs check`. Expected: vi and en each at full count, 0 missing.
- [ ] **Step 3: Headless check** (`python3 -m http.server 8765` in the repo, `?gfx=flat`, if a headless browser is available in the session): switch the expansion on, `ep-scenario-landHo` is selected, VP shows 8, start a game, the SVG has 20 `.tile.fog` groups. If no headless browser is available, say so and leave this to the user's check.
- [ ] **Step 4:** `node tests/rules.mjs`, `node tests/sim.mjs 150`, fingerprint `diff` empty. Commit `E&P: lobby picker for the scenarios, draw the unexplored areas` and push to `main`.

**User check after this task** (in Vietnamese, in the hand-off message):
1. Mở game → Chơi local → thẻ 🧩 Expansiones → bật 🧭 Exploradores y Piratas: chỉ "¡Tierra a la vista!" chọn được, điểm thắng tự thành 8.
2. Bắt đầu ván: đảo xuất phát bên trái, hai vùng mây úp bên phải (trên/dưới), không có cảng.
3. Tắt E&P và bắt đầu ván thường: mọi thứ như cũ.
