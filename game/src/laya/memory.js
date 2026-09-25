// Spatial memory. Two side-tables (never game state):
//   visits  - tiles stood on this level -> frontierGoal() explores fresh ground
//   goal    - commitment tracking: if the agent circles without getting
//             closer for ~1.4 s, the goal is abandoned (unreachable loot gets
//             blacklisted, unreachable frontier tiles marked visited).

import { game, macro } from "./state.js";

export function noteGoal(f, kind, x, y) {
  const g = macro.goal;
  if (g && g.kind === kind && g.x === x && g.y === y) return; // keep commitment
  macro.goal = { kind, x, y, best: f.man(x, y, f.p.x, f.p.y), age: 0 };
}

export function goalProgress(f) {
  const g = macro.goal;
  if (!g) return;
  if (g.kind === "engage") { macro.goal = null; return; } // roaming monster, no fixed spot
  const d = f.man(g.x, g.y, f.p.x, f.p.y);
  if (d <= 1) { macro.goal = null; return; }              // arrived
  if (d < g.best) { g.best = d; g.age = 0; }              // making progress
  else if (++g.age >= 12) {                              // ~1.4s circling -> abandon
    if (g.kind === "loot") (macro.lootFails[f.p.mapKey] = macro.lootFails[f.p.mapKey] || {})[g.x + "," + g.y] = 1;
    if (g.kind === "frontier") { macro.visits.add(g.x + "," + g.y); macro.frontier = null; }
    macro.goal = null;
  }
}

function floorsOf(map) {
  if (map.floors && map.floors.length) return map.floors.map(p => [p.x, p.y]);
  const out = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++)
    if (!"# T r".includes(map.grid[y][x])) out.push([x, y]);
  return out;
}

function floodDistances(f) {
  const core = game().core, p = f.p;
  const start = p.x + "," + p.y;
  const dist = new Map([[start, 0]]);
  const q = [[p.x, p.y]];
  while (q.length) {
    const [cx, cy] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = nx + "," + ny;
      if (dist.has(k) || core.blocked(nx, ny)) continue;
      const occ = core.entityAt(nx, ny);
      if (occ && (occ.type === "npc" || occ.type === "portal")) continue;
      dist.set(k, dist.get(cx + "," + cy) + 1);
      q.push([nx, ny]);
    }
  }
  return dist;
}

export function exploredPct(f) {
  if (f.mapKind !== "dungeon") return null;
  const total = floorsOf(f.map).length;
  return total ? Math.min(100, Math.round(100 * macro.visits.size / total)) : null;
}

// The explore target: the FARTHEST tile we have never stood on. Sticky for
// 120 ticks so the agent commits to crossing the level instead of re-targeting.
export function frontierGoal(f) {
  const key = f.p.mapKey;
  if (macro.visitKey !== key) {
    macro.visitKey = key; macro.visits = new Set(); macro.frontier = null; macro.frontierAge = 0;
  }
  macro.visits.add(f.p.x + "," + f.p.y);
  if (macro.frontier) {
    macro.frontierAge++;
    const [gx, gy] = macro.frontier;
    if (!macro.visits.has(gx + "," + gy) && macro.frontierAge < 120) return macro.frontier;
  }
  const dist = floodDistances(f);
  let best = null, bestScore = -1;
  for (const [fx, fy] of floorsOf(f.map)) {
    const k = fx + "," + fy;
    const d = dist.get(k);
    if (d === undefined) continue;
    const score = (macro.visits.has(k) ? 0 : 1000) + d;
    if (score > bestScore) { bestScore = score; best = [fx, fy]; }
  }
  macro.frontier = best; macro.frontierAge = 0;
  return bestScore >= 1000 ? best : null; // null = fully explored
}
