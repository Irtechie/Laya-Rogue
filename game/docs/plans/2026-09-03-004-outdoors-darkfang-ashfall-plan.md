# S4 - Outdoors for Darkfang and Ashfall

Status: done | Owner: agent | Blockers: S3
Owning component: src/
Observable outcome: Darkfang gate lands in a forest-clearing outdoor map with
its own door -> dungeon ladder; Ashfall gate lands on a scorched slope outdoor
map with mine-entry door; both persist via S2 save.
Cost tier: 2 (S3's outdoor generator + entrance machinery reused; theme params
only). Ruled out: separate hand-built maps (tier 6) - unnecessary.
Model tier: medium. Ordered steps:
1. Map outdoor theme params (tree density/prop colors/fog) per mapId.
   Pass: darkfang outdoor avg floor ratio within S3's generator bounds.
2. Travel + entrance wiring identical pattern to Greenhills.
   Pass: verify: travel("darkfang") -> outdoor; door -> darkfang:1 dungeon;
   same for ashfall at Lv8; quest loop completes for darkfang at Lv>=4.
3. Screens refresh for all outdoor maps. Pass: check-shots PASS.
Escalation triggers: if Darkfang's monster pool forces outdoor-combat aggro
changes, escalate - outdoor combat balance is unplanned product intent.
Token budget: ~8k. functional_risk: medium | execution_class: autonomous
Expected files: src/gen.js, src/core.js, src/data.js, scripts/verify.mjs.
Acceptance: verify covers both maps end-to-end; 22+ checks pass.
Scope boundary: no new monsters, no combat rule changes.
