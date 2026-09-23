---
manifest_schema: 3
pre_slice_review_contract: true
objective_contract: true
model_tier_contract: true
workspace_isolation_contract: true
proof_governor_contract: true
pre_slice_review:
  status: not-required
  source: docs/context/research/graphics-and-dungeon-systems.md
  source_sha256: 0cf232bf7faf4e7ab7549089e54f586ab562c053c7c276c60f715a6e7fd20ee5
  mode: requirements-wide
  not_required_reason: >-
    The research note states explicit findings, rejection lists, and an ordered
    impact list; the user directive "lez do it big dude" approves that exact
    scope with no remaining requirement ambiguity. The one open choice (which
    CC0 GLB pack) is an asset-authority HITL item owned by slice S8, not a
    document defect. Main-agent self-check found no contradictions; all load-
    bearing premises were probed in-note on 2026-09-03 (quaternius.com,
    kenney.nl, jsDelivr GLTFLoader HTTP 200).
done_check:
  command: node scripts/verify.mjs && node scripts/check-shots.mjs
  expected: exit 0, all checks PASS
  why_sufficient: >-
    verify.mjs is extended by each slice to assert that slice's acceptance in
    the live headless game; check-shots asserts the renderer paints real
    frames. Together they prove every slice's observable outcome end to end.
workspace_isolation:
  policy: single working tree; slices serialize (all touch src/core.js or
    src/game.js); plan-run worktree not created (repo is the worktree)
delivery:
  authority: commit locally per slice; push to origin main
    (https://github.com/Irtechie/roguerng) authorized by user ("put it in git")
  git_home: E:\roguerng mirrors this tree; commit here, push via origin
model_tier_note: tiers are minimum capability; kb-work resolves live routes
---

# RogueMS big uptick manifest (world-seed, persistence, outdoors, regen, 3D look)

Objective: deliver sticky per-character dungeons, save/load, outdoor village
map kind with dungeon entrances, physical stairs/door markers, out-of-combat HP
regen + no mana trickle, voxel 3D bodies, and a GLB round-trip import path —
each as a vertical slice proven by scripts/verify.mjs.

Requirements source: docs/context/research/graphics-and-dungeon-systems.md
(all acceptance criteria trace to its "Impact On Current Project" list and the
user's message of 2026-09-03).

## Slices (execution order = DAG topological + shared-file serialization)

| ID | Slice | Blockers | Tier | Proof |
|---|---|---|---|---|
| S1 | 2026-09-03-001-sticky-world-seed-plan.md | none | medium | verify: per-char layouts differ; revisit identical |
| S2 | 2026-09-03-002-save-load-plan.md | S1 | medium | verify: kill->save->reload->state persists |
| S5 | 2026-09-03-005-physical-stairs-marker-plan.md | none | small | verify: stairs mesh present + scene shot |
| S6 | 2026-09-03-006-regen-economy-plan.md | none | small | verify: no mana trickle; idle HP tick |
| S3 | 2026-09-03-003-outdoors-greenhills-plan.md | S2 | large | verify: outdoor kind + door into dungeon ladder |
| S4 | 2026-09-03-004-outdoors-darkfang-ashfall-plan.md | S3 | medium | verify: both maps outdoor+entrance |
| S7 | 2026-09-03-007-voxel-bodies-plan.md | none | large | verify: entity meshes exist; shots non-black |
| S8 | 2026-09-03-008-glb-roundtrip-plan.md | S7 | medium | verify: exported GLB re-imports as scene node |

DAG: S2←S1, S3←S2, S4←S3, S8←S7; S5, S6, S7 independent. All slices share
src/core.js or src/game.js write paths -> strict serialization, WIP bound 1.

owning_component: repo has no config/architecture-components.json (table
absent); components named as directories: src/, scripts/, vendor/, assets/.

Gate ledger:
- brainstorm-to-plan: passed (source = research note + user directive)
- work: COMPLETE 2026-09-04 - S1..S8 all done, verify.mjs 36/36 PASS
  (seeds, saves, outdoors x3, stairs structure, regen economy, voxel bodies,
  GLB round-trip: 3 mesh parts re-imported, 5 fromGlb nodes, no page errors)
- plan-to-work: passed 2026-09-04T02:55Z
- plan-to-work: passed 2026-09-04T02:55Z
  evidence: 8 slice files present under docs/plans/; every requirement in the
    source note's Impact list maps to a slice; DAG acyclic (S2<-S1, S3<-S2,
    S4<-S3, S8<-S7); kbcheck manifest-contract unavailable in this repo -
    substituted manual traceability+DAG check, recorded here.
  allowed_next_action: kb-work docs/plans/2026-09-03-001-kb-roguerng-big-uptick-manifest.md
