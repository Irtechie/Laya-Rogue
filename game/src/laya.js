// LayA decision-matrix wrapper + long-run macro for RogueRNG.
//
// Architecture (System 1 / System 2), one module per concern:
//   facts.js    perception: live game -> structured facts -> bridge JSON
//   actions.js  primitives: step/attack/heal/flee (one Core.act() per tick)
//   memory.js   spatial memory: visited tiles, frontier, goal commitment
//   town.js     town errand machine (rest/quest/identify/equip/sell/buy)
//   planner.js  HTN goals -> merged shared task plan (long-horizon behavior)
//   policy.js   per-tick arbiter: safety > plan > laya intent > reflex
//   bridge.js   the only network code: /decide + /event, fails silently
//   panel.js    in-game overlay of the model's mind
//   this file   the tick loop, watchdog, telemetry, key bindings
//
// Press P to toggle the autopilot + live decision panel. ?laya=1 autostarts.
// window.layaPilot API: setOn, tick, macroState(), emergencyUnstuck().

import { game, macro, pilot, TICK_MS } from "./laya/state.js";
import { facts, buildState } from "./laya/facts.js";
import { randomStep } from "./laya/actions.js";
import { frontierGoal, goalProgress, exploredPct } from "./laya/memory.js";
import { plannerTick } from "./laya/planner.js";
import { macroDecision } from "./laya/policy.js";
import { askBridge, sendTelemetry } from "./laya/bridge.js";
import { panel, renderPanel } from "./laya/panel.js";

let busy = false, bridgeFails = 0, bridgeSkipTicks = 0, failStreak = 0;
let sessionStart = Date.now();

async function tick() {
  if (busy || !pilot.on || !game() || !game().ready) return;
  const core = game().core;
  if (core.screen !== "play") return;
  if (core.dead) {
    core.act({ type: "revive" }); pilot.deaths++; game().afterAction();
  }
  busy = true;
  try {
    const f = facts();
    // stall watchdog: if position hasn't changed for many ticks, bail to town
    const pos = f.p.mapKey + ":" + f.p.x + "," + f.p.y;
    macro.stuckTicks = pos === macro.lastPos ? macro.stuckTicks + 1 : 0;
    macro.lastPos = pos;
    // oscillation watchdog: position KEEPS CHANGING but only between a couple
    // of tiles (rejected bump-attacks, engage jitter) - stuckTicks never fires,
    // so count distinct tiles in the recent window instead.
    macro.hist.push(pos);
    if (macro.hist.length > 16) macro.hist.shift();
    const recent = macro.hist.slice(-8);
    if (macro.hist.length >= 10 && new Set(recent).size <= 2) {
      macro.oscTicks++;
      macro.goal = null;
      macro.engageCoolUntil = Date.now() + 5000; // stop re-walking into the same monster
      macro.frontier = null;                      // retake the explore target too
      if (macro.oscTicks > 12 && f.mapKind !== "dungeon") {
        macro.oscTicks = 0;
        return commit({ type: "travel", target: "town" }, "watchdog:town-osc", f);
      }
      if (macro.oscTicks > 25 && f.mapKind === "dungeon") {
        // cooldowns did not untangle it - the LEVEL geometry is the trap: leave it
        macro.oscTicks = 0; macro.plan = null;
        return commit({ type: "ascend" }, "watchdog:osc-ascend", f);
      }
    } else {
      macro.oscTicks = 0;
    }
    // cycle detector: last ~10 moves repeat with period 2..5 (enter/exit circles
    // at entrances, A-B-A-B loops). Deterministic n-gram match, no ML needed.
    const h = macro.hist, n = h.length;
    for (let k = 2; k <= 5; k++) {
      if (n < k * 3) continue;
      let cyc = true;
      for (let i = n - k * 2; i < n - k; i++) if (h[i] !== h[i + k]) { cyc = false; break; }
      if (cyc) {
        // attribute ONLY from the repeated cycle entries themselves: the zone
        // is whichever dungeon map actually appears in the loop, same spots.
        let zone = null;
        for (let i = n - k * 2; i < n; i++) {
          const mzn = h[i].match(/^([^:]+):d\d+:/);
          if (mzn) zone = mzn[1];
        }
        if (zone) {
          macro.travelCool[zone] = Date.now() + 20000; // stop re-dropping into this zone
          macro.cycleZone = zone;                      // telemetry marker for the dashboard
        }
        macro.goal = null; macro.frontier = null;
        macro.engageCoolUntil = Date.now() + 5000;
        macro.cycleStrikes = (macro.cycleStrikes || 0) + 1;
        macro.hist = []; // fresh window so the next detection takes a full loop
        if (macro.cycleStrikes >= 3 && f.mapKind === "dungeon") {
          // three loops on one level = the geometry itself traps us: leave it
          macro.cycleStrikes = 0; macro.plan = null;
          return commit({ type: "ascend" }, "watchdog:cycle-ascend", f);
        }
        break;
      }
    }
    if (macro.stuckTicks > 15) macro.goal = null; // bumped/walled: drop the plan
    if (macro.stuckTicks > 30) {
      macro.stuckTicks = 0;
      if (f.mapKind === "dungeon") return commit({ type: "ascend" }, "watchdog:ascend", f);
      if (f.mapKind !== "town") return commit({ type: "travel", target: "town" }, "watchdog:town", f);
      macro.errand = "stuck-in-town";
    }

    if (f.mapKind === "dungeon") { macro.frontier = frontierGoal(f); goalProgress(f); }

    let payload = null, bridgeNote = "";
    const cheapErrand = f.mapKind !== "dungeon"; // town/outdoor: macro-owned; still ask at low cadence
    const askNow = f.mapKind === "dungeon" || (cheapErrand && pilot.decisions % 8 === 0);
    if (!askNow) bridgeNote = "macro-mode (bridge at low cadence)";
    else if (bridgeSkipTicks > 0) { bridgeSkipTicks--; bridgeNote = "bridge backoff (" + bridgeSkipTicks + ")"; }
    else {
      payload = await askBridge(buildState(f));
      if (payload) bridgeFails = 0;
      else { bridgeNote = "bridge unreachable"; if (++bridgeFails >= 3) { bridgeSkipTicks = 40; bridgeFails = 0; } }
    }
    if (!pilot.on) return; // unpaused/unloaded while we were asking the bridge
    if (payload) pilot.decisions++; else if (askNow) pilot.fallbacks++;
    const decision = payload && payload.decision;
    plannerTick(f, decision);
    const { act, why } = macroDecision(f, decision);
    const expl = exploredPct(f);
    macro.mode = f.mapKind === "dungeon" ? "DIVE " + f.mapId + " t" + f.tier + (expl != null ? " · " + expl + "% mapped" : "")
      : f.mapKind === "town" ? "TOWN" : "OUT " + (f.mapId || "");
    macro.errand = why;
    commit(act || { type: "move", dx: 0, dy: 0 }, why, f, decision, payload, bridgeNote, askNow);
  } finally {
    busy = false;
  }
}

function commit(action, why, f, decision, payload, bridgeNote, asked) {
  pilot.lastCommitAt = Date.now(); // supervisor heartbeat
  // log-based spam detector: 4 identical item/shop actions in a row = the game
  // keeps refusing (level/class/gold gates) - cool that signature for 30 s
  const sig = action.type + ":" + (action.uid !== undefined ? action.uid : action.key || "");
  if (sig === (pilot.lastSig || "") && sig !== action.type + ":") {
    pilot.sigStreak = (pilot.sigStreak || 0) + 1;
  } else {
    pilot.lastSig = sig; pilot.sigStreak = 1;
  }
  if (pilot.sigStreak >= 4 && (action.uid !== undefined || action.key)) {
    macro.rejCool[sig] = Date.now() + 30000; pilot.sigStreak = 0;
  }
  if (action.type === "move" && action.dx === 0 && action.dy === 0 && f.mapKind === "dungeon") {
    action = randomStep(); why += "+unstuck";
  }
  const took = game().core.act(action);
  if (!took) {
    if (action.type === "travel" && action.target) {
      // "the way back is sealed" (stale cameFrom / layout drift): do not
      // re-issue this trip - diveChoice skips cooled zones, we route around it
      macro.travelCool[action.target] = Date.now() + 30000;
      macro.errand = why + "+sealed";
    } else if (["move", "skill"].includes(action.type) && ++failStreak >= 2) {
      game().core.act(randomStep()); failStreak = 0; why += "+unstuck";
    }
  } else failStreak = 0;
  game().afterAction();
  const t = Math.round((Date.now() - sessionStart) / 1000);
  const actionLabel = action.type + (action.slot !== undefined ? " #" + action.slot
    : action.key ? " " + action.key : action.uid !== undefined ? " item" : action.target ? " " + action.target + (action.tier ? ":" + action.tier : "") : "");
  pilot.history.unshift({ t, intent: decision ? decision.intent : "macro", conf: decision ? decision.confidence : null, action: actionLabel });
  pilot.history = pilot.history.slice(0, 30);
  pilot.last = { decision, action, via: why, latencyMs: payload && payload.latencyMs, t };
  const s = f.status;
  sendTelemetry({
    sid: pilot.sid, t, mode: macro.mode, via: why,
    intent: decision && asked ? decision.intent : null,
    conf: decision && asked ? decision.confidence : null,
    threat: decision && asked ? decision.threat : null,
    action: actionLabel, hp: Math.round(s.player.hp), hpRatio: f.hpRatio, mpRatio: f.mpRatio,
    gold: s.player.gold, level: s.player.level, kills: s.kills, deaths: pilot.deaths,
    bag: f.bag.length, map: s.map.key, dead: s.dead, explored: exploredPct(f),
    goal: macro.goal ? macro.goal.kind + "(" + macro.goal.x + "," + macro.goal.y + ")" : null,
    cycle: macro.cycleZone && macro.travelCool[macro.cycleZone] > Date.now() ? macro.cycleZone : null,
    plan: macro.plan ? macro.plan.source + ":" + macro.plan.steps[macro.plan.i].name +
      " " + (macro.plan.i + 1) + "/" + macro.plan.steps.length : null,
    latencyMs: (payload && payload.latencyMs) || null,
    rid: (payload && payload.rid) || null,
    decisions: pilot.decisions, fallbacks: pilot.fallbacks
  });
  renderPanel({
    decision: asked ? decision : null, actionLabel, via: why,
    latency: payload && payload.latencyMs, bridgeNote: bridgeNote || "",
    kills: s.kills, level: s.player.level, gold: s.player.gold, dead: s.dead
  });
}

function pauseChip(on) {
  let chip = document.getElementById("layaChip");
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "layaChip";
    chip.style.cssText = "position:fixed;top:8px;right:8px;z-index:60;padding:4px 10px;" +
      "background:rgba(6,10,14,.9);border:1px solid #556;border-radius:6px;" +
      "font:12px monospace;color:#aab;cursor:pointer";
    chip.textContent = "LayA OFF \u00b7 press P or click";
    chip.addEventListener("click", () => setOn(true));
    document.body.appendChild(chip);
  }
  chip.style.display = on ? "none" : "block";
}

function setOn(on) {
  pilot.on = on;
  panel().style.display = on ? "block" : "none";
  pauseChip(on);
  try { window.parent.postMessage("laya-state:" + (on ? "on" : "off"), "*"); } catch (e) {}
  if (on) {
    busy = false; // never inherit a stuck tick from before a pause
    sessionStart = Date.now();
    pilot.lastCommitAt = Date.now();
    if (!pilot.timer) pilot.timer = setInterval(() => {
      tick().catch(e => {
        pilot.tickError = String((e && e.stack) || e); // never swallow silently
        console.error("[laya] tick error:", e);
      });
    }, TICK_MS);
  }
}

function emergencyUnstuck() {
  const core = game().core;
  if (!core || !core.player) return false;
  const map = core.getMap(core.player.mapKey);
  if (map.kind === "dungeon") core.act({ type: "ascend" });
  else core.act({ type: "travel", target: "town" });
  game().afterAction();
  return true;
}

function toggle() {
  if (!window.game || !window.game.core || window.game.core.screen !== "play") return;
  setOn(!pilot.on);
}

window.addEventListener("keydown", e => {
  if (e.key === "p" || e.key === "P") {
    toggle();
    e.preventDefault();
  }
});

// Dashboard (or anything hosting us in an iframe) can toggle reliably with a
// postMessage \u2014 immune to which window currently has keyboard focus.
window.addEventListener("message", e => { if (e.data === "laya-toggle") toggle(); });

// Supervisor: while ON, the agent must commit something regularly. A stuck
// await freezes busy=true silently; release it, and if the freeze persists,
// reload \u2014 the autosave + Continue button resumes the exact same world.
let errStrike = 0, lastError = null, lastReload = 0;
setInterval(() => {
  const g = game();
  if (!pilot.on || !g || !g.ready || !g.core || g.core.screen !== "play" || g.core.dead) return;
  if (pilot.tickError && pilot.tickError !== lastError) { errStrike++; lastError = pilot.tickError; }
  const staleMs = Date.now() - pilot.lastCommitAt;
  if (staleMs > 12000) busy = false;
  // repeated tick errors OR a long freeze: reload once per 2 min; autosave resumes
  if ((errStrike >= 8 || staleMs > 30000) && Date.now() - lastReload > 120000) {
    errStrike = 0; lastReload = Date.now();
    try { sessionStorage.setItem("layaResume", "1"); } catch (e) {} // tell autostart to walk back in via Continue
    location.reload();
  }
}, 3000);

if (new URLSearchParams(location.search).get("laya") === "1") {
  let resume = false;
  try { resume = sessionStorage.getItem("layaResume") === "1"; sessionStorage.removeItem("layaResume"); } catch (e) {}
  const autostart = setInterval(() => {
    const g = window.game;
    if (!g || !g.ready) return;
    if (g.core.screen !== "play") {
      // only auto-Continue after a supervisor crash-reload; a NEW RUN stays on
      // the create screen so the operator can click Begin with a fresh world
      if (resume) {
        const c = document.getElementById("continue");
        if (c && c.style.display !== "none") c.click();
      }
      return;
    }
    if (g.core.player && !pilot.on) {
      setOn(true);
      clearInterval(autostart);
    }
  }, 500);
}

Object.assign(pilot, { setOn, tick, facts, buildState, macroDecision, macroState: () => ({ ...macro }), emergencyUnstuck });
window.layaPilot = pilot;
