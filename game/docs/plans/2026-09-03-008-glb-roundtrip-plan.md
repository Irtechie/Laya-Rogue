# S8 - GLB import path (vendored loaders + export/import round-trip)

Status: done | Owner: agent | Blockers: S7
Owning component: vendor/, src/, scripts/
Observable outcome: a voxel monster exported to GLB re-imports at runtime and
replaces its voxel body in-scene; dropping any CC0 .glb into assets/models/
keyed by monster id swaps that monster's look; verify proves the round-trip.
Cost tier: 5 (GLTFLoader + GLTFExporter are the already-vendored three
project's own examples; jsDelivr fetch of three@0.185 verified in research
note). Ruled out: "new dependency" framing ruled out - same library, examples
path; user-facing CC0 pack download is out-of-scope HITL (user may drop files;
not gating this slice).
Model tier: medium. Ordered steps:
1. scripts/vendor-gltf.mjs downloads GLTFLoader.js + GLTFExporter.js (+ any
   sibling imports they need) from cdn.jsdelivr.net three@0.185.0 into
   vendor/ with importmap additions in index.html. Pass: page imports both
   without network beyond localhost (verify offline-asset check).
2. Client: `models.load(modelKey)` -> optional GLTF scene node per entity;
   GLTF replaces the voxel group when assets/models/<key>.glb exists (HEAD
   404-guard). Pass: missing file -> voxel body still renders.
3. Round-trip proof: dev-only button/console API `window.game.exportDemoGlb()`
   uses GLTFExporter on a voxel imp, writes bytes; verify captures bytes via
   evaluate, serves them back by writing into the page's fetch stub OR place
   into assets/models/imp.glb and reload. Pass: after reload, imp entity scene
   node originates from GLTF (tag userData.fromGlb=true set by loader path)
   and count of voxel groups decreases accordingly.
4. Screens: regenerated shot with the imported imp visibly rendered. Pass:
   check-shots PASS + entity assertion.
Escalation triggers: if GLTFExporter's sibling imports snowball, vendor only
what's required and note file list; do not add external npm deps.
Token budget: ~10k. test_level: integration + functional rendered proof
functional_risk: medium | execution_class: autonomous (asset-drop is HITL-
optional, not required for proof).
Expected files: vendor/GLTFLoader.js, vendor/GLTFExporter.js, index.html
(importmap), src/game.js, scripts/vendor-gltf.mjs, scripts/verify.mjs.
Acceptance: round-trip assertion + all prior checks pass.
Scope boundary: no third-party CC0 pack committing (license review per pack is
user's call); no animation/skinning import.
