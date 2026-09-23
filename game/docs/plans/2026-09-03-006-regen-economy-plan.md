# S6 - Regen economy: out-of-combat HP tick, no mana trickle

Status: done | Owner: agent | Blockers: none
Owning component: src/
Observable outcome: standing idle out of combat slowly heals; mana never rises
except via potion, inn rest, or level-up; no refund exploit on failed casts.
Cost tier: 2 (endTurn hook + buffs already exist in core; numbers from research
note convention). Ruled out tier 3-4: none needed - no new mechanism.
Model tier: small. Exact contract:
- Edit site 1: src/core.js constructor/start - add `p.turnsSinceDamage = 0`.
- Edit site 2: `monsterAttack` - set `p.turnsSinceDamage = 0` on hit.
- Edit site 3: `endTurn` - increment turnsSinceDamage; every 5th increment
  with no monsters within dist<=7, heal +1 HP (capped). Remove the
  `if (p.mapKey === TOWN_KEY) mp+1` town trickle entirely.
- Edit site 4: `doSkill` failure paths - currently refund mp and zero cooldown;
  instead set cooldown to 1 on failed cast and do NOT refund mp (charge for
  fumbles), or keep refund but always cooldown 2 - choose refund-keeps-fair:
  final rule: keep mp refund, set `p.cooldowns[id] = 2` on all failure paths
  so no spam-retry exploit exists.
- Expected observable: verify: after cast with no target, mp returns to prior
  value but skill cd >= 2 next turn (can't loop-farm); 20 idle turns out of
  combat (town, no monsters) => hp increases by >= 3 with mp unchanged; in
  dungeon within aggro range, idle 20 turns => hp unchanged while undamaged,
  then damaged => still no regen for <5 turns after the hit.
- Proof command: node scripts/verify.mjs
Escalation triggers: if "no monsters within 7" proves too strict to ever regen
in dungeons, that is balance tuning - adjust radius to nearest-monster
line-of-sight only if verify scenario demands; otherwise keep.
Token budget: ~3k. model requirements: precise edits + deterministic tests.
Test level: unit-level via core harness + verify | functional_risk: medium
execution_class: autonomous
Expected files: src/core.js, scripts/verify.mjs.
Acceptance: above; prior 22+ checks pass.
Scope boundary: no new items/spells; inn still full-restores.
