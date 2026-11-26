# Explorers & Pirates — Land Ho! step 2c (settlers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Settlers (cost = settlement) board a ship next to your harbor settlement (or wait there, 1 per harbor), are loaded for free in the ship phase, and found a free settlement at either end of the coast edge the ship is on (distance rule, not next to face-down hexes); founding stops that ship for the turn. Bots use it; E&P joins `tests/sim.mjs`; ~200 bot games check balance per seat.

**Spec:** project doc + the 2c proposal approved 2026-11-26.

## Global Constraints
- Base untouched (fingerprint, sim 150), hooks behind `s.explorers`, Spanish + vi/en strings.
- `SHIP_CAPACITY = 2` settlers, harbor holds 1 waiting settler (`s.explorers.waiting[vertex] = pid`), settler supply 2 per player (incl. the starting one), founding free.

## Review Focus
1. Founding with no settlements left → refused. 2. Founding at a vertex touching a face-down hex or breaking the distance rule → refused. 3. A stopped ship can still found where it is (it arrived); a ship that founded can't sail on or boost. 4. Settler built with nowhere to go → refused, nothing paid. 5. A game must reach 8 VP for every seat count; no stalls in sim.

### Task 2: Engine (`explorersPirates/settlers.js`, `game.js`, tests)
`settlerHome(s, pid) -> {ship}|{harbor}|null`, `foundSpots(s, ship) -> vertex[]`, `loadable(s, ship) -> harbor vertex|null`. Actions `build {what:'epSettler'}` (main), `epLoad {ship}`, `epFound {ship, at}` (epMove).
### Task 3: Bots + sim (`bot.js`, `tests/sim.mjs`)
### Task 4: HUD + drawing (`explorersUI.js`, `explorers2d.js`, `board3d.js`, i18n), headless check, review, push.
