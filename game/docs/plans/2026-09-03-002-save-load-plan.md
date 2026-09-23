# S2 - Save/load (localStorage, Save button, autosave)

Status: done | Owner: agent | Blockers: S1
Owning component: src/, scripts/
Observable outcome: player kills a monster, clicks Save, reloads the page,
sees the same hero (position, xp, bag, seed, visited dungeon layouts) and can
also Continue from a fresh boot.
Cost tier: 4 (browser localStorage; no new dependency).
Ruled out: server-side save (tier 6 + infra; multiplayer is a later goal),
file download (worse UX for a phone target).
Model tier: medium.
Model requirements: serialization design, playwright-driven reload testing.
Escalation triggers: if core state proves non-serializable (functions/DOM refs
leaked), fix core purity rather than hacking JSON - escalate if that grows
beyond state-shape fixes.
Token budget: ~8k output.
Test level: functional (browser journey) | functional_risk: high | execution_class: autonomous
Expected files: src/core.js (serialize/deserialize + version field),
src/game.js (Save/Continue UI + autosave hooks), scripts/verify.mjs.

Steps and pass criteria:
1. `core.toJSON()/Core.fromJSON()` covering: version, seed, player (attrs, hp,
   mp, xp, level, bag, equipment, quests, unlocks, worldSeed, cooldowns),
   maps (grid, entities incl. hp, stairs, spawn, monsterKinds, archetype).
   Pass: node round-trip equality on sampled fields.
2. Save button in HUD; autosave on descend, level-up, quest turn-in, portal use.
   Pass: after each hook, localStorage["roguerng-save-v1"] JSON changes.
3. Boot screen offers Continue when a save exists; Continue restores play state.
   Pass: reload -> Continue -> same player.x/y/mapKey/kills.
4. verify: kill monster -> save -> `page.reload()` -> Continue -> assert hp/xp/
   mapKey/bag/kill-progress state and grid hash of visited dungeon unchanged;
   assert save version field present.
   Pass: `node scripts/verify.mjs` exits 0.
Acceptance: above; old saves from wrong version are rejected gracefully (fresh
start message, no crash).
Scope boundary: no cloud sync, no multi-slot saves.
