# Explorers & Pirates — Pirate Lairs step 1 (board data + lobby) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the lobby, "Guaridas piratas" can be picked and starts a 12-VP game on Claude's Pirate Lairs map. The map has the Land Ho! starting island and fixed starts, and two larger face-down areas, each holding 3 gold fields. Discovering a gold field pays 2 gold and puts an (uncapturable for now) pirate lair on it. The lair blocks building and production. Players start with 2 gold and a stock of 9 crews (crews are not usable yet).

**Architecture:** `EP_SCENARIOS` gains per-scenario flags (`startGold`, `crews`, `lairs`) so later scenarios switch the same rules on. The map lives in `EP_MAPS.pirateLairs`. A new `explorersPirates/lairs.js` holds the lair state and the one question the engine asks in this step ("does a lair block this hex/vertex/edge?"). Capturing comes in step 4. Land Ho! must not change at all.

**Tech Stack:** Vanilla ES modules; Node test scripts `tests/rules.mjs`, `tests/sim.mjs`; `tools/i18n.mjs`.

**Spec:** Project doc `claude/pirate-lairs-design.md` (approved 2026-11-28); Task 6 copies it to `docs/superpowers/specs/2026-11-28-pirate-lairs-design.md`.

## Global Constraints

- Base, Seafarers and **Land Ho!** games must behave exactly as before (same RNG draws, logs and final state). Proven by the fingerprint (Task 1) staying IDENTICAL after every task.
- Pirate Lairs code runs only when `s.explorers` exists and the scenario's flag is set (`epFlag(s, 'lairs')` etc.), never for `landHo`.
- Source language is Spanish. Every new string goes inside `t()` / `msg()` or a data file, with entries in `js/i18n/vi.js` and `js/i18n/en.js`. `node tools/i18n.mjs check` reports no missing keys.
- Identifiers and comments in English. Do not touch `LICENSE`.
- Values from the spec: win at 12 VP; players 2–4; start gold 2; per-player crews 9; 6 lairs (3 north, 3 south); discovering a gold field = 2 gold; a lair holds at most 3 crews (state only in this step).

## Review Focus

1. **A gold field discovered from a ship that also turns over a land or sea hex** on the same edge: both are paid, the gold field gets a lair, its number stays hidden. → test in Task 4.
2. **Fog of war ("Niebla de guerra") with Pirate Lairs:** `viewFor` must not throw; a discovered lair hex stays visible as discovered for everyone; its number stays hidden. → test in Task 4.
3. **The bank has no "gold" resource card:** discovering a gold field must never call `giveFromBank(…, 'gold', …)` or touch `s.bank.gold`. → assertion in the Task 4 test.
4. **Old saves of Land Ho! games** (no `lairs` key, no `crewsLeft`): loading and playing them must not throw. `lairBlocks` returns false when `s.explorers.lairs` is missing. → test in Task 3.
5. **Bots in a Pirate Lairs game** (they still play by Land Ho! rules): 2–4 bots must play 60 rounds without an illegal action and never build next to a lair. → test in Task 5.

---

### Task 1: Baseline fingerprint (not committed)

**Files:**
- Create: `/home/claude/scripts/fingerprint.mjs` (outside the repo), `/home/claude/scripts/before.txt`

- [ ] **Step 1:** Write `fingerprint.mjs <repoPath>`, which runs three groups. The loop is taken from `tests/sim.mjs` (`pendingActors` → `botAct` → `applyAction`, no admin actions) and stops at `gameOver` or turn 1500.
  - 40 base games: `defaultConfig()`, `seed = 1000 + i`, `rules.randomStart = false`, 4 bots.
  - 10 Seafarers games: one per scenario in turn.
  - 20 Land Ho! games: `makeExplorersConfig`-style, 2–4 players, `seed = 2000 + i`.

  For each game print `group i winner turn VPs sha1(JSON.stringify(s.log))`. For Land Ho! games also print `sha1(JSON.stringify(s))` of the final state.
- [ ] **Step 2:** Run it at the current HEAD and save the output to `before.txt`. Expected: 70 lines.
- [ ] **Step 3:** Run it again and `diff` against `before.txt`. Expected: no output.

### Task 2: Scenario flags + Pirate Lairs selectable

**Files:**
- Modify: `js/engine/explorersPirates/scenarios.js`
- Modify: `js/i18n/vi.js`, `js/i18n/en.js` (new `pirateLairs.desc`)
- Test: `tests/rules.mjs`

**Interfaces:**
- Produces:
  - `EP_SCENARIOS.pirateLairs` = `{ icon: '🏴‍☠️', name: 'Guaridas piratas', vp: 12, players: [2, 4], ready: true, startGold: 2, crews: true, lairs: true, desc }`
  - `EP_SCENARIOS.landHo` gets `startGold: 0` (no other flags)
  - `epFlag(s, name) -> boolean` in `scenarios.js`: true when `s.explorers` exists and `EP_SCENARIOS[s.explorers.scenario][name]` is truthy

`pirateLairs.desc` (Spanish source): `'Descubre los campos de oro, construye tripulaciones y llévalas en barco para conquistar las guaridas piratas. Se juega a 12 puntos.'` In vi: `'Tìm các mỏ vàng, lập thủy thủ và chở họ bằng tàu đi chiếm hang cướp biển. Chơi tới 12 điểm.'` In en: `'Find the gold fields, build crews and ship them out to capture the pirate lairs. Played to 12 points.'` Remove the old `pirateLairs` desc keys if `tools/i18n.mjs check` reports them as unused.

- [ ] **Step 1: Failing tests** in `tests/rules.mjs`:
  - `'E&P Guaridas: se puede elegir'`: `epScenarioId('pirateLairs') === 'pirateLairs'`; `normalizeExpansions({ expansions: { explorersPirates: true, epScenario: 'pirateLairs' } }).epScenario === 'pirateLairs'`; `'fishForCatan'` still falls back to `'landHo'`.
  - `'E&P: epFlag'`: on a created `landHo` game, `epFlag(s, 'lairs') === false`; on a `pirateLairs` game, `epFlag(s, 'lairs') === true` and `epFlag(s, 'crews') === true`; on a base game, `epFlag(s, 'lairs') === false`.
- [ ] **Step 2:** Run `node tests/rules.mjs`. Expected: the new tests fail. (The `pirateLairs` game test can only pass after Task 3, so leave that assertion to Task 3 if creating the game throws here.)
- [ ] **Step 3:** Implement the data and `epFlag`, and add the i18n entries.
- [ ] **Step 4:** Run `node tests/rules.mjs` and `node tools/i18n.mjs check`. Expected: all pass, no missing keys.
- [ ] **Step 5:** Fingerprint `diff` is empty. Commit `E&P Pirate Lairs: scenario flags, selectable in the lobby`.

### Task 3: Pirate Lairs map + start state

**Files:**
- Modify: `js/engine/explorersPirates/maps.js` (add `EP_MAPS.pirateLairs`)
- Create: `js/engine/explorersPirates/lairs.js`
- Modify: `js/engine/explorersPirates/rules.js` (`CREW_PIECES = 9`, `LAIR_MAX_CREWS = 3`, `DISCOVER_GOLD_FIELD = 2`)
- Modify: `js/engine/explorersPirates/explore.js` (`initExplorers`)
- Modify: `js/engine/explorersPirates/setup.js` (`placeStarts`: `p.crewsLeft`)
- Test: `tests/rules.mjs`

**Interfaces:**
- Consumes: `epFlag` (Task 2).
- Produces:
  - `EP_MAPS.pirateLairs` (same shape as `landHo`: `layout`, `startNums`, `areas.north/south {slot, tiles, nums}`, `starts`, `seatsFor`)
  - `s.explorers.lairs = {}` (only when `epFlag(s, 'lairs')`), keyed by tile id: `{ crews: [], captured: false }`
  - `p.gold = EP_SCENARIOS[scenario].startGold`
  - `p.crewsLeft = CREW_PIECES` (only when `epFlag(s, 'crews')`)
  - In `lairs.js`: `addLair(s, tileId)` and `lairBlocks(s, kind, id) -> boolean` (`kind` is `'vertex' | 'edge' | 'tile'`; true when the id touches, or is, a tile with an uncaptured lair; false when `s.explorers?.lairs` is missing)

**Map data.** Reuse the Land Ho! starting island, `startNums`, `starts` and `seatsFor` unchanged (copy by reference from `EP_MAPS.landHo`, so the starts stay balanced until the step 4 re-balance). Widen the layout to 14 columns so the bigger areas keep a sea border. Each area has 12 slots:

```
'..............',
'..WS....1111..',
'.HOBW...1111..',
'..SDWH...1111.',
'.BHOS.........',
'.........2222.',
'........2222..',
'.........2222.',
'..............',
```

- north tiles: `['wood','wood','brick','sheep','wheat','wheat','ore','gold','gold','gold','sea','sea']`, nums `[3,4,5,6,8,9,10,11,5,9]`
- south tiles: `['wood','brick','brick','sheep','sheep','wheat','ore','gold','gold','gold','sea','sea']`, nums `[2,4,5,6,8,9,10,12,4,10]`

(The layout may be adjusted if `tests` show the areas touching each other or the starting island. The counts must not change.)

- [ ] **Step 1: Failing tests:**
  - `'E&P mapa Guaridas: forma y montones'`, modelled on `'E&P mapa Tierra a la vista: forma y montones'`: start island 14 tiles, not face-down; per area `[land, sea] = [10, 2]`, 3 of the land tiles are `gold`, everything face-down, resources and numbers match the stacks.
  - `'E&P mapa Guaridas: tierras nuevas separadas'` (same check as Land Ho!).
  - `'E&P Guaridas: arranque'`: `createGame` with `epScenario: 'pirateLairs'`, 2/3/4 players, seeds 1–20. Each game is in phase `roll`; each player has `gold === 2` and `crewsLeft === 9`; `s.explorers.lairs` deep-equals `{}`; there are 6 face-down `gold` tiles; the start buildings sit at the same coordinates as in a Land Ho! game with the same player count.
  - `'E&P Tierra a la vista: sin claves de Guaridas'`: a `landHo` game has no `lairs` key, no `crewsLeft`, and `gold === 0`. Also, `lairBlocks(s, 'vertex', 0) === false` holds both for that game and for a copy with `delete s.explorers.lairs`.
- [ ] **Step 2:** Run the tests. Expected: they fail.
- [ ] **Step 3:** Implement as in Interfaces. `buildEpMap` already handles any `res` string, so `gold` needs no change there. Check that `generateBoard` leaves fixed `gold` tiles alone (`gold = 0` for `ep`).
- [ ] **Step 4:** Run `node tests/rules.mjs`. Expected: all pass.
- [ ] **Step 5:** Fingerprint `diff` is empty. Commit `E&P Pirate Lairs: map with 6 gold fields, start gold and crew stock`.

### Task 4: Discovering a gold field → lair; lairs block building and production

**Files:**
- Modify: `js/engine/explorersPirates/explore.js` (`discover`)
- Modify: `js/engine/game.js`: legal road (~l.364), legal settlement (~l.381), harbor and ship building if they check vertices/edges, production loop (~l.660), discovery log (~l.2861)
- Modify: `js/i18n/vi.js`, `js/i18n/en.js`
- Test: `tests/rules.mjs`

**Interfaces:**
- Consumes: `addLair`, `lairBlocks`, `DISCOVER_GOLD_FIELD`.
- Produces: `discover` returns, for a gold field, `{ tile, res: 'gold', gold: 2, lair: true, got: false }`. In that case it sets `t.revealed = true`, keeps `t.numRevealed = false`, adds `p.gold += 2`, calls `addLair`, and never calls `give`.

Engine rules in this step: a road, settlement, harbor upgrade or settler founding is illegal when `lairBlocks(s, 'edge'|'vertex', id)` is true. A tile with `lairBlocks(s, 'tile', id)` produces nothing. Its number stays hidden (`numRevealed` is not set by production either). Ships may still sail past lairs. Log line (Spanish source): `msg('🏴‍☠️ @{p} encuentra una guarida pirata en un campo de oro: +{n} de oro.', { p, n })`, logged once per gold field.

- [ ] **Step 1: Failing tests** (build the state by hand, like the existing `'E&P: nada junto a casillas boca abajo'` test):
  - `'E&P Guaridas: descubrir campo de oro'`: take a ship next to a face-down gold tile and call `discover` through an `epMove` action. Then: `p.gold` +2, `s.explorers.lairs[tile]` deep-equals `{ crews: [], captured: false }`, `t.revealed === true`, `t.numRevealed === false`, and `s.bank` is unchanged apart from any land hex on the same edge (Review Focus 1, 3).
  - `'E&P Guaridas: la guarida bloquea'`: with a lair on tile T, `legalSettlement` / `legalRoad` (whatever names the engine uses) return false for every vertex/edge of T, and true again after setting `captured = true`.
  - `'E&P Guaridas: la guarida no produce'`: give a player a settlement on a lair tile's vertex directly, roll its number (use the existing forced-roll helper the tests use), and expect no resource and no gold from that tile.
  - `'E&P Guaridas + niebla'`: with `config.modes.fog = true`, after discovering a gold field `viewFor(s, otherPid)` does not throw, shows the tile as revealed and hides its number.
- [ ] **Step 2:** Run the tests. Expected: they fail.
- [ ] **Step 3:** Implement. Put the gold branch first in `discover`'s tile loop. For the production check, add `if (s.explorers && EpLairs.lairBlocks(s, 'tile', t.id)) continue;` next to the fog check.
- [ ] **Step 4:** Run `node tests/rules.mjs` and `node tools/i18n.mjs check`. Expected: all pass.
- [ ] **Step 5:** Fingerprint `diff` is empty. Commit `E&P Pirate Lairs: gold fields hide pirate lairs that block building and production`.

### Task 5: Bots and simulation

**Files:**
- Modify: `js/engine/bot.js` (only if bots try illegal moves near lairs: skip vertices/edges where `lairBlocks` is true in their target lists, e.g. `epFoundTargets`)
- Modify: `tests/sim.mjs`
- Test: `tests/sim.mjs`, `tests/rules.mjs`

**Interfaces:**
- Consumes: `lairBlocks`.

- [ ] **Step 1: Failing test** in `tests/rules.mjs`: `'E&P Guaridas: bots juegan 60 rondas'`. For 2, 3 and 4 bots × seeds 1–5, run the bot loop for 60 rounds. Expect no thrown action, no building on a vertex where `lairBlocks` is true, and every player's `gold >= 0`.
- [ ] **Step 2:** Run it. Expected: it fails, or passes already. If it passes, keep the test and skip Step 3.
- [ ] **Step 3:** Filter the bot target lists with `lairBlocks`.
- [ ] **Step 4:** In `tests/sim.mjs`, make the E&P games alternate `landHo` / `pirateLairs` by `i % 2`, with a `vpTarget` from `EP_SCENARIOS`. Pirate Lairs games may hit the round cap in this step (lairs can't be captured yet). Report them as `capped`, but don't count them as failures. Land Ho! games must still end.
- [ ] **Step 5:** Run `node tests/rules.mjs && node tests/sim.mjs 300`. Expected: everything passes; the summary shows the Pirate Lairs games.
- [ ] **Step 6:** Fingerprint `diff` is empty. Commit `E&P Pirate Lairs: bots avoid lairs, sim plays the scenario`.

### Task 6: Lobby check + project doc

**Files:**
- Modify: `claude/explorers-pirates-architecture.md` (Project doc): status line → "Pirate Lairs bước 1 xong"
- Test: manual / headless

- [ ] **Step 1:** Headless 2D check (python playwright + chromium, as in the architecture doc §7). Open the lobby, turn on E&P, click `[data-testid=ep-scenario-pirateLairs]`, and check that the VP target shows 12. Start a 2-bot game and check that the board renders with 24 face-down hexes and no console errors.
- [ ] **Step 2:** Copy the Project doc `claude/pirate-lairs-design.md` to `docs/superpowers/specs/2026-11-28-pirate-lairs-design.md`. Update the architecture doc's status, and write the known limitations: lairs can't be captured; no pirate ship; crews can't be built; the help screen has no Pirate Lairs section yet.
- [ ] **Step 3:** Final full run: `node tests/rules.mjs && node tests/sim.mjs 300 && node tools/i18n.mjs check`, then fingerprint `diff` empty.
