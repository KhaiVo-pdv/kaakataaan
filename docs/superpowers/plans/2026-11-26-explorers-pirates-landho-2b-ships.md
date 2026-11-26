# Explorers & Pirates — Land Ho! step 2b (ships + discovery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ships can be built next to your harbor settlements and sailed in a third turn phase. A ship that reaches an edge touching face-down hexes turns them over: land gives 1 resource of its type, sea gives 2 gold, and the ship stops there. Bots explore. Online guests see sea reveals. Settlers come in 2c.

**Spec:** Project doc `claude/explorers-pirates-architecture.md` + the 2b proposal the user approved on 2026-11-26. Change from the earlier note: **every** face-down hex touching the arrival edge flips (max 2).

## Global Constraints
- Base untouched: fingerprint diff empty, `tests/sim.mjs 150` all finish, every hook behind `s.explorers`.
- Spanish source strings + vi/en, `tools/i18n.mjs check` 0 missing; English identifiers.
- Values: `SHIP_COST` wood+sheep, `SHIP_MP = 4`, `BOOST_MP = 2` (1 sheep, once per ship per turn), `MAX_SHIPS_PER_EDGE = 2`, `DISCOVER_LAND = 1 resource`, `DISCOVER_SEA_GOLD = 2`. Ships sail on edges with `kind` `'sea'` or `'coast'` only.

## Review Focus
1. **A full edge** (2 ships) can be sailed through but not stopped on; a new ship can't be built on it. → Task 2 test.
2. **Discovery when the bank is out** of that resource: nothing is given, no crash. → Task 2 test.
3. **Two ships**: moving a second ship ends the first one's movement for the turn; MP resets next turn (lazy reset by `ship.turn`). → Task 2 test.
4. **`endTurn` from `epMove`**, and no build/trade/gold in `epMove`. → Task 2 test.
5. **Online**: a sea reveal reaches guests (`board.sea` is static in net.js). → Task 2 helper test + net.js wiring.

### Task 2: Engine
**Files:** create `js/engine/explorersPirates/ships.js`; modify `explore.js`, `rules.js`, `game.js`, `seafarers/board.js` (helpers `seaRevealKey(sea)` / `applySeaReveal(sea, key)`), `js/net.js`; tests in `tests/rules.mjs`.
**Interfaces (ships.js):** `sailable(bd, e)`, `shipsOn(s, e)`, `shipBuildEdges(s, pid)`, `shipMp(s, ship)` (lazy reset when `ship.turn !== s.turn`: `mpLeft = SHIP_MP, boosted = false`), `discoveryEdge(s, e)` (any face-down hex on the edge), `reachable(s, ship) -> Map<edge, cost>` (BFS through sailable edges, cost ≤ mp, never expands past a discovery edge, never stops on an edge with 2 other ships). `explore.js`: `discover(s, pid, e) -> [{ tile | sea, res | gold }]`.
**Actions:** `build { what: 'epShip', at }` (main), `epSail` (main → `epMove`), `epMove { ship, to }`, `epBoost { ship }` (epMove only), `endTurn` also allowed in `epMove`. Fx: `epDiscover`, `gold { what: 'discover' }`. `s.explorers.activeShip`.
- [ ] Tests (fail first): building (cost, harbor-adjacent, max 3, full edge), sailing (costs, 4 MP, boost once, land blocked, through-not-onto a full edge, second ship ends the first, reset next turn), discovery (flip all on the edge, resource/gold, bank empty, ship stops), phase rules (`epSail`, no build/trade/goldBuy in `epMove`, `endTurn` ok), `seaRevealKey`/`applySeaReveal` round trip.
- [ ] Implement, run rules / fingerprint / sim, commit.

### Task 3: Bots
- [ ] Test (fail first): `'E&P: los bots exploran'`: 4-bot games, seeds 1–4, 600 actions, all ok, never > 2 ships on an edge, and at least 6 face-down hexes flipped on average.
- [ ] Implement: build a ship when there are face-down hexes left and fewer than 2 own ships (after harbor/settlement priorities); at the end of `main` go to `epSail` when an own ship has MP and a target exists; in `epMove`, sail each ship towards the nearest discovery edge (boost when it makes the target reachable this turn), else `endTurn`. Commit.

### Task 4: Board + HUD
- [ ] `js/ui/explorers2d.js` `drawEpShips` (Seafarers `shipShape`, player colour, 👤 when carrying a settler, the second ship on an edge offset). board3d: `makeShip` + `shipPose` with the same offset, 👤 tag.
- [ ] `explorersUI.js`: buttons ⛵ Barco (`ep-ship`, pick → highlighted build edges), ⛵ Mover barcos (`ep-sail`); in `epMove` a bar with 🐑 +2 (`ep-boost`) and Terminar; interaction: tap your ship, then a highlighted edge. `PHASE_TEXT.epMove`, banner, `describe`.
- [ ] i18n, headless check (build a ship, sail, a tile flips, no page errors), full checks, commit, final review, push.
