# S7 - Voxel 3D bodies (Minecraft-look, replacing card sprites)

Status: done | Owner: agent | Blockers: none
Owning component: src/
Observable outcome: hero and every monster render as small shaded voxel
figures (torso/head/distinctive head feature) with a squash/stretch walk bob;
items/stairs/NPCs keep icon cards; screenshots show real 3D shading, verify can
enumerate voxel groups.
Cost tier: 5 (BoxGeometry + InstancedMesh from the existing three dependency).
Ruled out tier 2: the current billboard cards - explicitly rejected by the
user ("better than just a card"). Ruled out tier 6 custom mesh pipeline: S8
brings GLB import; voxels must not pre-empt it.
Model tier: large (renderer architecture: body factory, per-entity cache,
animation hook, FOV visibility integration).
Model requirements: three.js scene-graph design judgment, visual coherence
across entity classes, playwright verification of scene contents.
Approach (executor may refine): factory `makeVoxel(kindId, color)` returning a
THREE.Group: torso box (0.45x0.5x0.3) at z 0.45, head box 0.38 cube at z 0.95,
plus per-class head feature (boss: horns pair; imp: single horn; rodent: ears;
skeleton: pale thin arms; mage player: hat cone via rotated box; fighter:
sword box held). Cache geometry per kind; material color per entity. Reuse the
same group across rebuilds via `entityGroup.userData` pool keyed by entity uid
to avoid per-frame allocation.
Pass criteria (verify): on a dungeon map, `window.game.debugScene()` contains
>= monsters.length voxel groups with >= 3 mesh children each; walk one step and
position updates; check-shots PASS on a new combat shot with higher lit-pixel
floor (>= 6%) proving shaded bodies light up.
Escalation triggers: if frame time degrades >16ms on 30 entities, reduce
feature detail (not architecture) and note it; if voxel look clashes with card
NPCs, raise visual-coherence question rather than half-converting NPCs.
Token budget: ~14k. test_level: functional (rendered proof)
functional_risk: medium | execution_class: autonomous
Expected files: src/game.js, scripts/verify.mjs, scripts/screens.mjs.
Acceptance: above; all gameplay verify checks unaffected (core untouched).
Scope boundary: no GLB loading (S8), no new asset downloads, no player class
animations beyond bob.
