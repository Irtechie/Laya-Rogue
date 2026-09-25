// The per-tick decision policy (the "System 1" arbiter). Priority is
// deliberate and fixed:
//
//   1. safety   - cannot be overridden (heal-or-flee at low HP)
//   2. plan     - the HTN planner's current task, if any
//   3. laya     - the model's intent, IF confidence clears the floor AND the
//                 facts say the intent is actually executable
//   4. reflex   - deterministic heuristics: loot > fight > stairs > frontier
//
// LayA never acts; it votes. Facts decide what is executable; safety rules
// cannot be outvoted. This is what keeps a zero-shot encoder playable.

import { bestAttack, fleeAction, healAction, randomStep, stepToward } from "./actions.js";
import { frontierGoal, noteGoal } from "./memory.js";
import { questTargets } from "./facts.js";
import { townErrand } from "./town.js";
import { planStep } from "./planner.js";
import { macro, CONFIDENCE_FLOOR } from "./state.js";

function diveChoice(f) {
  const now = Date.now();
  let zones = f.status.travel.zones.filter(z => z.unlocked && !(macro.travelCool[z.id] > now));
  if (!zones.length) return null;
  // never re-dive a top tier that respawns empty (seeded layout, no monsters)
  const alive = zones.filter(z => !(macro.clearedZones[z.id] >= z.maxTier && z.maxTier >= z.tiers));
  const pool = alive.length ? alive : zones;
  pool.sort((a, b) => (b.maxTier - a.maxTier) || (a.unlockLevel - b.unlockLevel));
  const top = pool[0];
  let tier = Math.max(1, Math.min(top.maxTier, top.tiers));
  if (!alive.length && tier > 1 && macro.clearedZones[top.id] >= tier) tier = tier - 1; // go shallower instead of circling
  return { target: top.id, tier };
}

export function macroDecision(f, decision) {
  // ----- dungeon: LayA intent is the commander, facts keep it honest -----
  if (f.mapKind === "dungeon") {
    if (f.hpRatio < 0.35) {
      const h = healAction(f);
      if (h) return { act: h, why: "safety:heal" };
      return { act: fleeAction(f), why: "safety:flee" };
    }
    if (decision && decision.overmatched > 0.7 && f.hpRatio < 0.6 && !f.adj.length) {
      return { act: fleeAction(f), why: "laya:overmatched" };
    }
    const ps = planStep(f);
    if (ps) return ps;
    if (f.onStairs && (f.monstersNear === 0 || f.hpRatio > 0.6) &&
        f.def && f.tier < f.def.tiers) {
      return { act: { type: "descend" }, why: "macro:descend" };
    }
    if (f.def && f.tier >= f.def.tiers && f.monsterCount === 0) {
      macro.clearedZones[f.mapId] = Math.max(macro.clearedZones[f.mapId] || 0, f.tier);
      return { act: { type: "ascend" }, why: "macro:cleared-ascend" };
    }
    const intent = decision && decision.confidence >= CONFIDENCE_FLOOR ? decision.intent : null;
    if (intent === "flee") return { act: fleeAction(f), why: "laya:flee" };
    if (intent === "heal") {
      const h = healAction(f);
      if (h) return { act: h, why: "laya:heal" };
    }
    if (intent === "ascend" && decision.threat > 2.2) return { act: { type: "ascend" }, why: "laya:ascend" };
    if (intent === "descend" && f.onStairs && f.def && f.tier < f.def.tiers) {
      return { act: { type: "descend" }, why: "laya:descend" };
    }
    if (intent === "fight" || intent === "cast" || intent === "wait") {
      const a = bestAttack(f);
      if (a) return { act: a, why: "laya:" + intent };
      if (intent === "wait" && !f.nearest) return { act: { type: "move", dx: 0, dy: 0 }, why: "laya:wait" };
    }
    // explore / loot / default: stairs > loot > nearest monster
    if (f.onStairs && f.def && f.tier < f.def.tiers && f.monstersNear === 0) {
      return { act: { type: "descend" }, why: "macro:descend" };
    }
    const fails = macro.lootFails[f.p.mapKey] = macro.lootFails[f.p.mapKey] || {};
    const g = macro.goal;
    const walking = g && g.kind !== "engage";
    const loot = f.ents.filter(e => e.kind === "item" || (e.kind === "chest" && !e.locked))
      .map(e => ({ e, d: f.man(e.x, e.y, f.p.x, f.p.y) }))
      .filter(o => !fails[o.e.x + "," + o.e.y]).sort((a, b) => a.d - b.d);
    if (loot.length && loot[0].d <= 14) {
      const step = stepToward(loot[0].e.x, loot[0].e.y);
      if (step) { noteGoal(f, "loot", loot[0].e.x, loot[0].e.y); return { act: step, why: "macro:loot" }; }
      fails[loot[0].e.x + "," + loot[0].e.y] = 1; // unreachable pickup: never try again
    }
    if (f.nearest) {
      const a = bestAttack(f);
      if (a && a.type === "skill" && f.nearest.d <= 6) {
        macro.goal = null; return { act: a, why: "reflex:attack" }; // shoot in passing, plan dropped
      }
      // walk INTO a fight only if nothing is committed or it is basically on top
      // of us; the oscillation guard can cool engagement down for a few seconds
      if ((!walking || f.nearest.d <= 2) && Date.now() > (macro.engageCoolUntil || 0)) {
        const step = stepToward(f.nearest.m.x, f.nearest.m.y);
        if (step) { noteGoal(f, "engage", f.nearest.m.x, f.nearest.m.y); return { act: step, why: "macro:engage" }; }
      }
    }
    if (f.stairs) {
      const step = stepToward(f.stairs.x, f.stairs.y);
      if (step) { noteGoal(f, "stairs", f.stairs.x, f.stairs.y); return { act: step, why: "macro:stairs" }; }
    }
    const fg = macro.frontier || frontierGoal(f);
    if (fg) {
      const step = stepToward(fg[0], fg[1]);
      if (step) { noteGoal(f, "frontier", fg[0], fg[1]); return { act: step, why: "macro:frontier" }; }
      macro.visits.add(fg[0] + "," + fg[1]); macro.frontier = null; // unreachable fresh tile
    }
    return { act: randomStep(), why: "macro:wander" };
  }

  // ----- town: deterministic errand machine (an active plan drives it) -----
  if (f.mapKind === "town") {
    const ps = planStep(f);
    if (ps) return ps;
    const er = townErrand(f);
    if (er.act) return { act: er.act, why: er.why };
    const d = diveChoice(f);
    if (d) return { act: { type: "travel", target: d.target, tier: d.tier }, why: "macro:waygate-dive" };
    return { act: randomStep(), why: "macro:wander-town" };
  }

  // ----- outdoors: re-enter the dive at the chosen depth, or go home -----
  const ps = planStep(f);
  if (ps) return ps;
  const needsHome = f.hpRatio < 0.5 || f.bag.length >= 16 || questTargets(f).length > 0;
  if (needsHome) return { act: { type: "travel", target: "town" }, why: "macro:waygate-home" };
  const d = diveChoice(f);
  if (d) return { act: { type: "travel", target: d.target, tier: d.tier }, why: "macro:waygate-dive" };
  return { act: { type: "travel", target: "town" }, why: "macro:all-dived" }; // nowhere to dive: rest in town
}
