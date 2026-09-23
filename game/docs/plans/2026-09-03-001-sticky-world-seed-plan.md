# S1 - Sticky per-character world seed

Status: done | Owner: agent | Blockers: none
Owning component: src/ (architecture-components.json table absent)
Observable outcome: two fresh characters see different Greenhills layouts; the
same character's dungeon is unchanged when revisited in-session.
Cost tier: 2 (prior art in repo: `hashStr`/`makeRng`/seeded `generateLayout`).
Ruled out: new seeding module (tier 6) - unnecessary, gen.js already seeded.
Model tier: medium (core+gen cross-boundary edit with verify extension).
Model requirements: multi-file edit, node + playwright run/debug, structured state reasoning.
Escalation triggers: if persistence-across-reload turns out required here,
stop - that is S2's contract.
Token budget: ~6k output.
Test level: integration | functional_risk: medium | execution_class: autonomous
Expected files: src/gen.js, src/core.js, scripts/verify.mjs.

Steps and pass criteria:
1. `generateLayout`/`layoutArchetype` accept a world-seed string key
   (pass `charSeed + ":" + mapId` where mapId was passed). Pass: same call with
   different world keys yields different grids.
2. `Core.start` draws `player.worldSeed` from `this.rng`; `buildMap` uses it for
   archetype + layout; `layoutCount` still returns >=6 with worldSeed fixed.
   Pass: node dbg check shows two cores' greenhills:1 grids differ.
3. Keep in-session cache so revisit returns the identical map object (already
   true via `this.maps`). Pass: `getMap(key)` twice returns same grid string.
4. Extend verify.mjs: assert (a) two fresh pages/cores with different seeds get
   different first-tier grids, (b) leave+return keeps grid hash identical,
   (c) existing difficulty/kind checks still PASS.
   Pass: `node scripts/verify.mjs` exits 0.
Acceptance: verify additions pass; no regressions to prior 22 checks.
Scope boundary: no localStorage, no renderer changes.
