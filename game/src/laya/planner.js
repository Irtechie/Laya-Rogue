// HTN goal planner (the "System 2" layer for long tasks).
//
// Each GOAL declares WHEN it matters (real facts + LayA's noul axes used as
// soft gates) and a METHOD: an ordered list of primitive TASKS. Every tick,
// all active goals are merged into ONE plan: shared subtasks are executed
// once, and the single terminal "resume" task is hoisted to the end. That is
// what turns "bag full + out of potions + locked chest" into ONE town trip
// instead of three sequential round trips.
//
// Execution is head-first: the plan's current task runs until its done(f)
// predicate holds against live facts (or a 400-tick fuse cuts it loose),
// then already-satisfied later tasks are skipped. A completed plan cools its
// goals down for 80 ticks so a satisfied trigger can't immediately re-arm.

import { bestAttack, healAction, randomStep, stepToward } from "./actions.js";
import { townErrand, wantedBook } from "./town.js";
import { macro } from "./state.js";

// ---------- primitive task library: done(f, st) + act(f, st) ----------

export const TASKS = {
  gohome: {
    done: f => f.mapKind === "town",
    act: f => f.mapKind === "outdoor" ? { type: "travel", target: "town" } : { type: "ascend" }
  },
  chores: { // delegates to the full town errand machine
    done: f => f.mapKind === "town" && townErrand(f).why === "errands:done",
    act: f => f.mapKind === "town" ? townErrand(f).act : null
  },
  buy: {
    done: (f, st) => !st.need(f) || f.gold < st.price, // gave up: can't afford
    act: (f, st) => {
      const npc = f.ents.find(e => e.kind === "npc" && e.npcId === st.npcId);
      if (!npc) return randomStep();
      if (f.man(npc.x, npc.y, f.p.x, f.p.y) <= 2) return { type: "buy", key: st.key };
      return stepToward(npc.x, npc.y) || randomStep();
    }
  },
  resume: {
    done: (f, st) => f.mapKind === "dungeon" && f.mapId === st.zone && f.tier >= st.tier,
    act: (f, st) => f.mapKind === "dungeon" ? randomStep() : { type: "travel", target: st.zone, tier: st.tier }
  },
  descend: {
    done: (f, st) => f.tier > st.tier0 || f.mapKind !== "dungeon",
    act: f => f.onStairs ? { type: "descend" }
      : f.stairs ? (stepToward(f.stairs.x, f.stairs.y) || randomStep()) : randomStep()
  }
};

// ---------- task builders used by goal methods ----------

const tGoHome = () => ({ id: "gohome", name: "gohome" });
const tChores = () => ({ id: "chores", name: "chores" });
const tResume = f => ({ id: "resume", name: "resume " + f.mapId + ":t" + f.tier,
  zone: f.mapId, tier: f.tier, terminal: true });
const tHomeDive = f => [tGoHome(), tChores(), tResume(f)]; // the classic errand run

// ---------- goal triggers: weight decides merge order ----------

export const GOALS = [
  { id: "recover", weight: 100,
    trig: f => f.mapKind === "dungeon" && f.hpRatio < 0.35 && !healAction(f),
    tasks: tHomeDive },
  { id: "deeper", weight: 80, // cleared floor: commit to the next one
    trig: f => f.mapKind === "dungeon" && f.monsterCount === 0 && f.stairs && f.def && f.tier < f.def.tiers,
    tasks: f => [{ id: "descend", name: "descend", tier0: f.tier }] },
  { id: "turnin", weight: 70,
    trig: f => f.mapKind === "dungeon" && Object.values(f.p.quests).some(q => q.done && !q.turnedIn),
    tasks: tHomeDive },
  { id: "unpack", weight: 60,
    trig: f => f.mapKind === "dungeon" && f.bag.length >= 18,
    tasks: tHomeDive },
  { id: "resupply", weight: 55,
    trig: f => f.mapKind === "dungeon" && !f.bag.some(i => i.kind === "potion" && i.effect !== "mana") && f.gold >= 45,
    tasks: tHomeDive },
  { id: "tending", weight: 45, // LayA's own pack_needs_tending axis, confidence-gated
    trig: (f, d) => d && d.packNeedsTending > 0.75 && f.mapKind === "dungeon" && (f.bag.length >= 10 || f.gold >= 90),
    tasks: tHomeDive },
  { id: "haveKey", weight: 40, // locked chest spotted: buy the key before diving
    trig: f => f.mapKind === "dungeon" && f.ents.some(e => e.locked) && !f.bag.some(i => i.kind === "key") && f.gold >= 55,
    tasks: f => [tGoHome(),
      { id: "buy", name: "buy key", npcId: "merchant", key: "key", price: 25,
        need: f2 => !f2.bag.some(i => i.kind === "key") }, tResume(f)] },
  { id: "study", weight: 30,
    trig: f => !!wantedBook(f) && (f.mapKind !== "dungeon" || f.gold >= 220),
    tasks: f => {
      const wb = wantedBook(f) || {};
      const out = [tGoHome(),
        { id: "buy", name: "buy " + (wb.key || "book"), npcId: "sage", key: wb.key, price: wb.price || 999,
          need: f2 => !wantedBook(f2) ? false : !f2.bag.some(i => i.kind === "book") }];
      if (f.mapKind === "dungeon") out.push(tResume(f));
      return out;
    } }
];

// ---------- merge + execute ----------

function taskKey(st) { return st.id === "buy" ? "buy:" + st.key : st.id; }

export function mergePlans(active, f) {
  const steps = [], seen = new Set();
  let terminal = null, diving = false;
  for (const g of active) {
    for (const st of g.tasks(f)) {
      if (st.id === "descend") diving = true;
      if (st.terminal) { if (!terminal) terminal = st; continue; }
      const k = taskKey(st);
      if (seen.has(k)) continue; // shared subtask: do it once for every goal
      seen.add(k);
      steps.push(st);
    }
  }
  if (terminal && !diving) steps.push(terminal); // descending keeps us in the dive anyway
  return steps;
}

let ruleClock = 0;
const goalCooldown = {};

// done/act live in the TASKS library keyed by id, not on plan instances.
function taskDone(f, st) { return TASKS[st.id].done(f, st); }

export function plannerTick(f, decision) {
  ruleClock++;
  if (macro.plan) {
    const st = macro.plan.steps[macro.plan.i];
    st.age = (st.age || 0) + 1;
    if (taskDone(f, st) || st.age > 400) {
      macro.plan.i++;
      st.age = 0;
      while (macro.plan.i < macro.plan.steps.length) { // tasks finished en route: skip
        const nx = macro.plan.steps[macro.plan.i];
        if (!taskDone(f, nx)) break;
        macro.plan.i++;
      }
      if (macro.plan.i >= macro.plan.steps.length) {
        for (const id of macro.plan.goals) goalCooldown[id] = ruleClock;
        macro.plan = null;
      }
    }
    return;
  }
  const active = GOALS
    .filter(g => ruleClock - (goalCooldown[g.id] || -999) >= 80 && g.trig(f, decision))
    .sort((a, b) => b.weight - a.weight);
  if (!active.length) return;
  const steps = mergePlans(active, f);
  if (steps.length) macro.plan = { source: active.map(g => g.id).join("+"),
    goals: active.map(g => g.id), steps, i: 0 };
}

export function taskAct(f, st) {
  if (f.adj.length) { const a = bestAttack(f); if (a) return a; } // fight through the plan
  return TASKS[st.id].act(f, st);
}

export function planStep(f) {
  if (!macro.plan) return null;
  const st = macro.plan.steps[macro.plan.i];
  const act = taskAct(f, st);
  return act ? { act, why: "plan:" + macro.plan.source + ":" + st.name } : null;
}
