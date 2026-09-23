# S5 - Physical stairs marker (3D structure, not a card)

Status: done | Owner: agent | Blockers: none
Owning component: src/
Observable outcome: at stairs cells a small raised stair-run mesh with a warm
glow exists in the scene; visible when the cell is in view, in screenshots.
Cost tier: 5 (THREE.BoxGeometry/InstancedMesh + PointLight from existing three
dependency). Ruled out tier 2: the existing tinted `3d-stairs` sprite card -
that is precisely what the user rejected.
Model tier: small. Exact contract:
- Edit site 1: src/game.js `buildMapMeshes` - after floor/wall meshes, if
  `map.stairs`, add `stairsGroup`: 3 ascending BoxGeometry steps (0.8x0.8x0.15,
  heights 0.15/0.3/0.45) at world position of stairs cell, material
  MeshStandardMaterial color 0x6a5f4a; plus one PointLight(0xffb060, 4, 4) at
  +0.8 z above the cell.
- Edit site 2: same function - expose `mapGroup.userData.stairsGroup =
  stairsGroup` and `window.game.debugScene = () => mapGroup` (single line,
  additive) so verify can assert existence.
- Expected observable: `window.game.debugScene().userData.stairsGroup` is a
  THREE.Group with >= 3 children when on a dungeon map with visible stairs.
- Proof command (one): node scripts/verify.mjs (assertion step appended there).
Escalation triggers: none expected; if stairs can be unexplored-but-saved,
place group unconditionally (mesh hidden by FOV via parent group scale rule of
refreshFov - if FOV hiding conflicts, note it, do not redesign FOV).
Token budget: ~3k. model requirements: precise small edit + playwright assert.
Test level: functional (rendered UI proof) | functional_risk: low
execution_class: autonomous
Expected files: src/game.js, scripts/verify.mjs, scripts/check-shots.mjs (none
or trivial).
Acceptance: verify asserts stairsGroup children >= 3 on a dungeon map; new
shot-stairs capture passes pixel check.
Scope boundary: no new assets, no changes to stairs gameplay.
