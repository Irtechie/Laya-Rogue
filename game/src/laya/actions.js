// Primitives: the agent's hands and feet. Everything here returns a single
// Core.act() action for ONE tick — movement (BFS toward a target, preferring
// never-seen tiles), attacking with the best available weapon, healing, and
// fleeing (maximize distance from the nearest monster).

import { game, macro } from "./state.js";

export function walkable(dx, dy) {
  const core = game().core, p = core.player;
  const nx = p.x + dx, ny = p.y + dy;
  if (core.blocked(nx, ny)) return false;
  const occ = core.entityAt(nx, ny);
  return !occ || occ.type === "item" || occ.type === "monster" || occ.type === "chest" || occ.type === "door";
}

function freshFirst(opts) {
  // Among equally-valid steps, prefer tiles we have never stood on; if every
  // option is old ground (backtracking is fine, just not first choice) keep all.
  const p = game().core.player;
  if (macro.visitKey !== p.mapKey || !macro.visits.size) return opts;
  const fresh = opts.filter(([dx, dy]) => !macro.visits.has((p.x + dx) + "," + (p.y + dy)));
  return fresh.length ? fresh : opts;
}

export function randomStep() {
  const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => walkable(dx, dy));
  if (!opts.length) return { type: "move", dx: 0, dy: 0 };
  const pool = freshFirst(opts);
  const [dx, dy] = pool[Math.floor(Math.random() * pool.length)];
  return { type: "move", dx, dy };
}

export function goalField(tx, ty) {
  // BFS distance field FROM the target, so at each step we can choose between
  // all cells that make progress (core.bfsStep always replays the same path).
  const core = game().core;
  const key = (x, y) => x + "," + y;
  const d = new Map([[key(tx, ty), 0]]);
  const q = [[tx, ty]];
  while (q.length) {
    const [cx, cy] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
      if (d.has(k) || core.blocked(nx, ny)) continue;
      const occ = core.entityAt(nx, ny);
      if (occ && (occ.type === "npc" || occ.type === "portal")) continue;
      d.set(k, d.get(key(cx, cy)) + 1);
      q.push([nx, ny]);
    }
  }
  return d;
}

export function stepToward(x, y) {
  const p = game().core.player;
  const field = goalField(x, y);
  const cur = field.get(p.x + "," + p.y);
  if (cur === undefined || cur === 0) return null;
  const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .filter(([dx, dy]) => field.get((p.x + dx) + "," + (p.y + dy)) === cur - 1 && walkable(dx, dy));
  if (!opts.length) return null;
  const pool = freshFirst(opts);
  const [dx, dy] = pool[Math.floor(Math.random() * pool.length)];
  return { type: "move", dx, dy };
}

export function walkTo(f, x, y, adjDist) {
  // returns action to approach; when already within adjDist, returns null
  const d = f.man(x, y, f.p.x, f.p.y);
  if (d <= (adjDist === undefined ? 1 : adjDist)) return null;
  return stepToward(x, y) || randomStep();
}

export function bestAttack(f) {
  if (f.multiSlot >= 0) return { type: "skill", slot: f.multiSlot };
  if (f.boltSlot >= 0) return { type: "skill", slot: f.boltSlot };
  if (f.adj.length && f.meleeSlot >= 0) return { type: "skill", slot: f.meleeSlot };
  const m = f.adj[0] || (f.nearest && f.nearest.d === 1 ? f.nearest.m : null);
  if (m) return { type: "move", dx: Math.sign(m.x - f.p.x), dy: Math.sign(m.y - f.p.y) };
  return null;
}

export function healAction(f) {
  if (f.potion) return { type: "useItem", uid: f.potion.uid };
  if (f.selfHealSlot >= 0) return { type: "skill", slot: f.selfHealSlot };
  return null;
}

export function fleeAction(f) {
  const p = f.p, core = game().core;
  if (f.onStairs) return f.mapKind === "dungeon" ? { type: "ascend" } : { type: "interact" };
  const ref = f.nearest ? f.nearest.m : null;
  const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ dx, dy, nx: p.x + dx, ny: p.y + dy }))
    .filter(o => {
      if (core.blocked(o.nx, o.ny)) return false;
      const occ = core.entityAt(o.nx, o.ny);
      return !occ || occ.type === "item";
    });
  if (!options.length) return randomStep();
  const score = o => (ref ? Math.abs(ref.x - o.nx) + Math.abs(ref.y - o.ny)
    - Math.abs(ref.x - p.x) - Math.abs(ref.y - p.y) : 1);
  const best = options.sort((a, b) => score(b) - score(a))[0];
  return { type: "move", dx: best.dx, dy: best.dy };
}
