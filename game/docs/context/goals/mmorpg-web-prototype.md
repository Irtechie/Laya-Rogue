# RogueMS Web Prototype (MMORPG foundation)

Status: active
Created: 2026-09-03
Last updated: 2026-09-04

## Objective

Build a playable Three.js web prototype of a rogue-style (glyph/tile, RNG)
multiplayer-ready RPG: town hub, village maps with 6-10 dungeon layouts each
scaling through 10 difficulty tiers, classes (fighter/mage/cleric), races with
bonuses/detriments, attributes, equipment with blessings/curses modeled as
enchantment modifiers, skills/spells/spellbooks with mana, and a
collect-quest-items-and-return loop.

## Done Criteria

- [user] Playable in a browser, rendered with Three.js, rogue-style look (not
      a dungeon-hack look).
- [user] Fighter, mage, cleric available at start; races apply
      enchantment-style bonuses/detriments.
- [user] Attributes, equipment, and enchantments (blessings and curses,
      e.g. +3 as an attached modifier) affect gameplay.
- [user] Skills grant bonuses/negatives; spells + spellbooks with mana
      (mage starts weak/small spells, fighter HP scales later).
- [user] Main town hub; leave town, fight in village maps, collect quest
      items, return and fulfill the quest.
- [user] Each map offers 6-10 dungeon layouts; up to 10 dungeon tiers per map
      with rising difficulty; leveling grants skills.
- [derived] (serves browser-playable + quest-loop criteria) Headless Playwright
      script drives the full loop (create -> dungeon -> kill -> quest item ->
      turn-in -> descend) and exits 0. Chosen because "something working" needs
      an objective, re-runnable check per goal contract.
- [user] Multiplayer phone MMORPG: explicitly deferred by user to a later
      milestone ("get something working in web first"). Single-player web
      prototype is this goal's scope; server/multiplayer becomes a successor
      goal. State kept serializable/data-driven to serve it.

## Terminal Proof

- `node scripts/verify.mjs` exits 0 (done_check below).
- Human eye check: game visually reads as rogue-style 3D glyph tiles (user).

## Done Check

- Type: command_exit
- Check: `node scripts/verify.mjs` (cmd/kbcheck not present in this repo;
  substituted project-equivalent check, per tooling-availability rule)
- Expected result: exit code 0, per-step assertions printed
- Why sufficient: proves character creation, stats/enchantments, spell mana,
  dungeon generation tiers, combat, quest loop, town hub all function.

## Current State

- Current artifact: working prototype (index.html, src/data.js, src/gen.js, src/core.js, src/game.js), canonical copy E:\roguerng, pushed to main through 7219127.
- Next allowed action: continue user visual review (play: `node scripts/serve.mjs`), then mark complete or request changes
- Last proof: `node scripts/verify.mjs` -> ALL CHECKS PASSED (65/65) 2026-09-04:
  graphics batch (pushed e356908..7219127) - facing now sticks after moves/waits for
  hero and monsters (0023013), bloom postprocessing on emissives (e356908), and real
  rigged animated GLB characters from KayKit CC0 packs via GLTFLoader + SkeletonUtils
  (hero-per-class + skeleton/orc/wraith/bandit/zombie/banshee, chest + wall-torch props,
  Idle/Walk AnimationMixer, voxel fallback) with new-game hero rebuild fix (7219127).
  2026-09-04 user visual check on live play: "better for sure" (interim positive; U3 stays open).
  Earlier verified batches (145d05c): species-shaped voxel monsters + 6 new species,
  two-way stairs (< ascend, cameFrom routing, no portal-eject), face movement
  direction, manual saves, town-only regen, M minimap, click-to-walk/use, item
  drop, 12-tier ladders with bosses, ~15% identify chance + mage Identify spell +
  scrolls, 6 classes (Fighter/Mage/Cleric/Thief/Paladin/Ranger) with weapon/armor
  restrictions + per-class spell lists, vendor shops (Pella/Dorin/Ianna) incl.
  selling, chests + iron keys + locked strongroom doors, mana potions, and a town
  that reads as a town (roofed houses, lit windows/lanterns, market stalls, grass).
- Added since U1: 54 free CC-BY game-icons (assets/, ATTRIBUTION.md), procedural tile
  textures, 3rd map Ashfall Mine (Lv8, x2.1 difficulty, loot+8), Ember Imp/Magma Slab
  monsters, Cinder Golem boss, Foreman Halla quest, screenshots in shots/

## Work Units

| Unit | Route | Artifact | Status | Proof |
|---|---|---|---|---|
| U1 prototype build | agent-owned direct build (smallest lane; greenfield single unit) | index.html, src/*.js | done | verify.mjs 19/19 PASS |
| U2 verify harness | agent-owned direct build | scripts/verify.mjs, scripts/check-shots.mjs | done | exits 0 |
| U3 human visual gate | user check | verify-shot-*.png / live play | pending | user approval |

## Blockers

| Blocker | Type | Owner | Resume Condition |
|---|---|---|---|

## Notes

- User said their full written design doc exists ("I think I have it written
  out") but was not located/provided. Parked (safe-assumption): proceed with
  this interpretation; ingest the doc later as a requirements refresh.
- Assumptions: rogue = classic Roguelike (glyph entities on tiles, turn-based,
  seeded RNG); "enchantment" = any attached +/- modifier on equipment, races,
  or skills; 3 races to start (human/elf/dwarf); turn-based bump combat.
- Earlier Pac-Man 3D demo archived under archive/pacman-demo/.
- Repo: git initialized; canonical working copy at E:\roguerng (user directive
  2026-09-04), pushed to https://github.com/Irtechie/roguerng (private, branch
  main, direct-push delivery, pushed as DeaderestPool). The OneDrive folder is a
  passive/stale mirror only - do not develop there (it silently rolled back
  src/game.js once).
