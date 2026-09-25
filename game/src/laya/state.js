// Shared state for the LayA autopilot. Everything mutable lives here.
//
//   pilot  - what the agent observed/decided (history, counters, session id)
//   macro  - the agent's working memory (mode, active plan, spatial memory)
//
// The game itself is reached through game() -> window.game; the core is
// never modified — the autopilot only reads state and calls Core.act().

export const BRIDGE = "http://" + (location.hostname || "127.0.0.1") + ":8732";
export const CONFIDENCE_FLOOR = 0.15; // below this, a LayA intent is noise -> reflex
export const TICK_MS = 110;
export const IDENT_PRICE = 25;

export const pilot = {
  on: false, last: null, history: [], fallbacks: 0, decisions: 0, deaths: 0,
  sid: Math.random().toString(36).slice(2, 8), lastCommitAt: Date.now()
};

export const macro = {
  mode: "idle", errand: "", errandGoal: null, diveZone: null,
  stuckTicks: 0, lastPos: "", hist: [], oscTicks: 0, engageCoolUntil: 0,
  clearedZones: {}, travelCool: {},
  visitKey: "", visits: new Set(), frontier: null, frontierAge: 0,
  lootFails: {}, goal: null, plan: null
};

export function game() { return window.game; }
