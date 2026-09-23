# S3 - Outdoors: Greenhills village exterior with dungeon entrance

Status: done | Owner: agent | Blockers: S2
Owning component: src/, assets/
Observable outcome: stepping on the Greenhills gate in town now lands the hero
in an open outdoor village map (grass, scattered tree/rock props, sun/sky
lighting); a door prop on the cellar building is the only way into the 10-tier
dungeon ladder; stairs cycle dungeon tiers as before; return gate exits to town.
Cost tier: 6 (new outdoor generator). Ruled out tier 2: reusing caverns/
chessboard grids with grass texture - rejected because corridor density is the
exact "dungeon-y" feel the user rejected for outdoors.
Model tier: large (new map kind touches gen, core travel/entry semantics,
renderer lighting, verify flow rewire; product shape approved in research note).
Model requirements: cross-subsystem architecture, generator tuning to evidence
(connectivity), playwright rewire.
Escalation triggers: if dungeon-ladder semantics (stairs chaining, unlocks)
conflict with entrance-based entry, stop and return the design question rather
than silently changing tier progression.
Token budget: ~14k output.
Test level: functional | functional_risk: high | execution_class: autonomous
Expected files: src/gen.js (outdoor layout: border trees, clearing clusters,
connectivity guaranteed), src/core.js (kind "outdoor", entrance entity, travel
greenhills -> outdoor; door interact/steps into "greenhills:N" dungeon),
src/game.js (outdoor lighting: hemisphere sun + sky fog color per kind; tree/
rock props from tinted boxes or icons), src/data.js (icons for tree/rock/door:
game-icons delapouite/tree, lorc/rocking-stone or reuse coal-pile, door prop -
download via scripts/fetch-assets.mjs ICONS list), scripts/verify.mjs.

Acceptance: verify asserts (a) travel("greenhills") yields kind==="outdoor"
with open floor ratio >= 0.5 of a rooms map, (b) monsters quest loop still
completes via entrance -> dungeon -> stairs -> outdoor -> entrance at next tier,
(c) all 22 prior checks still pass, (d) shot 03-greenhills shows sky-lit outdoor.
Scope boundary: Darkfang/Ashfall stay dungeon-direct until S4; town unchanged.
