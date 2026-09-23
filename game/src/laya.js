// LayA decision-matrix wrapper + long-run macro for RogueRNG.
//
// Architecture (System 1 / System 2):
//   - LayA bridge answers 7 typed questions in ONE forward pass per turn
//     (11-intent choice, threat score, 5 noul axes). Advisory + calibrated.
//   - A deterministic macro state machine owns the action space: every
//     Core.act() type is mapped and gated by real facts (mana, cooldowns,
//     adjacency, vendors, gold). LayA picks BETWEEN options; facts decide
//     what is EXECUTABLE; safety rules cannot be overridden.
//
// Press P to toggle the autopilot + live decision panel. ?laya=1 autostarts.
// window.layaPilot API: setOn, tick, macroState(), emergencyUnstuck().

import { SKILLS, MAPS, SPELLBOOKS, SHOP } from "./data.js";

const BRIDGE = "http://" + (location.hostname || "127.0.0.1") + ":8732";
const CONFIDENCE_FLOOR = 0.15;
const TICK_MS = 110;
const IDENT_PRICE = 25;

const pilot = { on: false, last: null, history: [], fallbacks: 0, decisions: 0, deaths: 0,
  sid: Math.random().toString(36).slice(2, 8) };
const macro = { mode: "idle", errand: "", errandGoal: null, diveZone: null, stuckTicks: 0, lastPos: "",
  visitKey: "", visits: new Set(), frontier: null, frontierAge: 0, lootFails: {}, goal: null };

// ---------- goal commitment: knows its spot, notices it isn't progressing ----------

function noteGoal(f, kind, x, y) {
  const g = macro.goal;
  if (g && g.kind === kind && g.x === x && g.y === y) return; // keep commitment
  macro.goal = { kind, x, y, best: f.man(x, y, f.p.x, f.p.y), age: 0 };
}

function goalProgress(f) {
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

function game() { return window.game; }

// ---------- facts: everything the policy needs from the real game ----------

function facts() {
  const core = game().core, p = core.player;
  const map = core.getMap(p.mapKey);
  const man = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
  const monsters = map.entities.filter(e => e.type === "monster" && e.hp > 0);
  const adj = monsters.filter(m => man(m.x, m.y, p.x, p.y) === 1);
  const nearest = monsters.map(m => ({ m, d: man(m.x, m.y, p.x, p.y) })).sort((a, b) => a.d - b.d)[0] || null;
  const ents = core.entities();
  const stairs = map.stairs || null;
  const e = core.eff();
  const bag = p.bag;
  const skillSlot = kind => p.skills.findIndex(id => {
    const s = SKILLS[id];
    return s && s.kind === kind && !(p.cooldowns[id] > 0) && p.mp >= s.cost;
  });
  const rangedInReach = kind => {
    const slot = skillSlot(kind);
    if (slot < 0) return false;
    const range = SKILLS[p.skills[slot]].range || 1;
    return nearest && nearest.d <= range;
  };
  const [mapId, tStr] = p.mapKey.split(":d");
  return {
    p, map, ents, mapId: map.mapId || mapId, tier: map.tier || 0,
    mapKind: map.kind,
    def: MAPS[map.mapId || mapId] || null,
    man,
    adj, nearest, stairs,
    monsterCount: monsters.length,
    monstersNear: monsters.filter(m => man(m.x, m.y, p.x, p.y) <= 5).length,
    onStairs: !!(stairs && man(stairs.x, stairs.y, p.x, p.y) <= 1),
    npcNear: ents.filter(e => e.kind === "npc").map(e => ({ e, d: man(e.x, e.y, p.x, p.y) })).sort((a, b) => a.d - b.d),
    adjNpc: ents.find(e => e.kind === "npc" && man(e.x, e.y, p.x, p.y) === 1),
    vendor: core.nearbyVendor(),
    bag, potion: bag.find(i => i.kind === "potion" && i.effect !== "mana"),
    manaPotion: bag.find(i => i.kind === "potion" && i.effect === "mana"),
    unidentified: bag.filter(i => ["weapon", "armor", "trinket"].includes(i.kind) && i.ident === false),
    gold: p.gold,
    selfHealSlot: skillSlot("self-heal"),
    meleeSlot: skillSlot("melee"),
    boltSlot: rangedInReach("bolt") ? skillSlot("bolt") : -1,
    multiSlot: rangedInReach("multi-bolt") ? skillSlot("multi-bolt") : -1,
    hpRatio: p.hp / e.maxHp, mpRatio: p.mp / e.maxMp,
    eff: e,
    status: core.status()
  };
}

// ---------- movement primitives ----------

function walkable(dx, dy) {
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

function randomStep() {
  const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => walkable(dx, dy));
  if (!opts.length) return { type: "move", dx: 0, dy: 0 };
  const pool = freshFirst(opts);
  const [dx, dy] = pool[Math.floor(Math.random() * pool.length)];
  return { type: "move", dx, dy };
}

function goalField(tx, ty) {
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

function stepToward(x, y) {
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

function walkTo(f, x, y, adjDist) {
  // returns action to approach; when already within adjDist, returns null
  const d = f.man(x, y, f.p.x, f.p.y);
  if (d <= (adjDist === undefined ? 1 : adjDist)) return null;
  return stepToward(x, y) || randomStep();
}

// ---------- combat primitives ----------

function bestAttack(f) {
  if (f.multiSlot >= 0) return { type: "skill", slot: f.multiSlot };
  if (f.boltSlot >= 0) return { type: "skill", slot: f.boltSlot };
  if (f.adj.length && f.meleeSlot >= 0) return { type: "skill", slot: f.meleeSlot };
  const m = f.adj[0] || (f.nearest && f.nearest.d === 1 ? f.nearest.m : null);
  if (m) return { type: "move", dx: Math.sign(m.x - f.p.x), dy: Math.sign(m.y - f.p.y) };
  return null;
}

function healAction(f) {
  if (f.potion) return { type: "useItem", uid: f.potion.uid };
  if (f.selfHealSlot >= 0) return { type: "skill", slot: f.selfHealSlot };
  return null;
}

function fleeAction(f) {
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

// ---------- spatial memory: visited tiles + frontier exploration ----------

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

function exploredPct(f) {
  if (f.mapKind !== "dungeon") return null;
  const total = floorsOf(f.map).length;
  return total ? Math.min(100, Math.round(100 * macro.visits.size / total)) : null;
}

function frontierGoal(f) {
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

// ---------- town errand machine (every town-side act() type lives here) ----------

function scoreGear(it) {
  const affix = key => (it.affixes || []).filter(a => a.key === key).reduce((s, a) => s + a.value, 0);
  if (it.kind === "weapon") return (it.dmg || 0) + affix("atk");
  if (it.kind === "armor") return (it.def || 0) + affix("def");
  if (it.kind === "trinket") return affix("atk") + affix("def") + affix("hp") + affix("mp");
  return 0;
}

function sellEstimate(it) {
  const t = it.tier || 1;
  if (it.kind === "weapon") return 20 + (it.dmg || 1) ** 2 * 4 + t * 10;
  if (it.kind === "armor") return 25 + (it.def || 1) ** 2 * 6 + t * 12;
  if (it.kind === "trinket") return 15 + t * t * 6;
  if (it.kind === "book") return 120 + (it.reqLevel || 1) * 20;
  return 5;
}

function wantedBook(f) {
  for (const [id, sb] of Object.entries(SPELLBOOKS)) {
    if (f.p.skills.includes(sb.teaches)) continue;
    if (sb.classes && !sb.classes.includes(f.p.classId)) continue;
    if (f.p.level < (sb.reqLevel || 1)) continue;
    const shop = SHOP.find(s => s.key === "book:" + id);
    if (shop && f.gold >= shop.price + 80) return { key: shop.key, price: shop.price };
  }
  return null;
}

function questTargets(f) {
  const out = [];
  for (const [mapId, m] of Object.entries(MAPS)) {
    const q = f.p.quests[m.quest.id];
    if (q && q.done && !q.turnedIn) out.push(m.quest.npc);
  }
  return out;
}

function townErrand(f) {
  const npcAt = id => f.ents.find(e => e.kind === "npc" && e.npcId === id);
  const inn = npcAt("innkeep"), mer = npcAt("merchant"), smithN = npcAt("smith"), sageN = npcAt("sage");
  const s = f.status;

  // 1. rest when hurt or out of mana (innkeep: free full heal)
  if ((f.hpRatio < 0.6 || f.mpRatio < 0.3) && inn) {
    const act = walkTo(f, inn.x, inn.y, 1);
    return { act: act || { type: "interact" }, why: "errand:rest@inn" };
  }
  // 2. quest turn-ins first (xp + reward gear)
  const turnIns = questTargets(f);
  if (turnIns.length) {
    const npc = turnIns.map(id => npcAt(id)).find(Boolean);
    if (npc) {
      const act = walkTo(f, npc.x, npc.y, 1);
      return { act: act || { type: "interact" }, why: "errand:quest-turnin" };
    }
  }
  // 3. unidentified gear: cast/scroll identify, else vendor service / buy scroll
  if (f.unidentified.length) {
    const it = f.unidentified[0];
    const knows = f.p.skills.includes("identify");
    if (knows && f.mp >= SKILLS.identify.cost) return { act: { type: "identify", uid: it.uid }, why: "errand:identify@spell" };
    if (f.bag.find(i => i.kind === "scroll-identify")) return { act: { type: "identify", uid: it.uid }, why: "errand:identify@scroll" };
    if (f.vendor && f.gold >= IDENT_PRICE) return { act: { type: "identService", uid: it.uid }, why: "errand:identify@vendor" };
    if (mer) {
      const near = f.man(mer.x, mer.y, f.p.x, f.p.y) <= 2;
      if (near && f.gold >= 30) return { act: { type: "buy", key: "scroll-identify" }, why: "errand:buy:scroll" };
      if (f.gold >= Math.max(IDENT_PRICE, 30)) {
        const act = walkTo(f, mer.x, mer.y, 2);
        return { act: act || { type: "wait" }, why: "errand:walk:merchant-ident" };
      }
    }
  }
  // 4. equip upgrades (identified gear only; class checks live in core)
  for (const slot of ["weapon", "armor", "trinket"]) {
    const cur = f.p.equipment[slot];
    const best = f.bag.filter(i => i.slot === slot && i.ident !== false)
      .sort((a, b) => scoreGear(b) - scoreGear(a))[0];
    if (best && scoreGear(best) > scoreGear(cur || {})) {
      return { act: { type: "equip", uid: best.uid }, why: "errand:equip:" + slot };
    }
  }
  // 5. study books when learnable
  const book = f.bag.find(i => i.kind === "book");
  if (book && SPELLBOOKS[book.bookId] && !f.p.skills.includes(SPELLBOOKS[book.bookId].teaches)) {
    return { act: { type: "useItem", uid: book.uid }, why: "errand:study" };
  }
  // 5b. buy a spellbook we can actually learn from Ianna, if we can afford it
  const wb = wantedBook(f);
  if (wb) {
    const sageN = npcAt("sage");
    if (sageN) {
      if (f.man(sageN.x, sageN.y, f.p.x, f.p.y) <= 2) return { act: { type: "buy", key: wb.key }, why: "errand:buy:book" };
      const act = walkTo(f, sageN.x, sageN.y, 2);
      return { act: act || { type: "wait" }, why: "errand:walk:ianna" };
    }
  }
  // 6. pack pressure: sell junk to the nearest vendor
  if (f.bag.length >= 12) {
    const v = f.npcNear.find(n => ["merchant", "smith", "sage"].includes(n.e.npcId));
    if (v) {
      if (v.d > 2) {
        const act = walkTo(f, v.e.x, v.e.y, 2);
        return { act: act || { type: "wait" }, why: "errand:walk:vendor" };
      }
      const junk = f.bag
        .filter(i => !i.quest && i.kind !== "potion" && ["weapon", "armor", "trinket", "book"].includes(i.kind))
        .map(i => ({ i, v: sellEstimate(i) * (i.ident === false ? 0.2 : i.cursed ? 0.5 : 1) }))
        .sort((a, b) => a.v - b.v)[0];
      if (junk) return { act: { type: "sell", uid: junk.i.uid }, why: "errand:sell" };
    }
  }
  // 7. supplies: keep 2+ red potions when affordable
  const potions = f.bag.filter(i => i.kind === "potion" && i.effect !== "mana").length;
  if (potions < 2 && f.gold >= 60) {
    if (mer) {
      const near = f.man(mer.x, mer.y, f.p.x, f.p.y) <= 2;
      if (near) return { act: { type: "buy", key: "potion" }, why: "errand:buy:potion" };
      const act = walkTo(f, mer.x, mer.y, 2);
      return { act: act || { type: "wait" }, why: "errand:walk:pella" };
    }
  }
  // 8. heal cheaply even at partial hp if the inn is next to us
  if (f.hpRatio < 1 && inn && f.man(inn.x, inn.y, f.p.x, f.p.y) <= 1) {
    return { act: { type: "interact" }, why: "errand:rest@inn" };
  }
  return { act: null, why: "errands:done" };
}



// ---------- event chains: trigger -> ordered multi-step plan ----------

function homeChain(f) {
  return [
    { name: "go-home", done: f2 => f2.mapKind === "town" },
    { name: "chores", done: f2 => f2.mapKind === "town" && townErrand(f2).why === "errands:done" },
    { name: "resume-dive " + f.mapId + " t" + f.tier, zone: f.mapId, tier: f.tier,
      done: (f2, st) => f2.mapKind === "dungeon" && f2.mapId === st.zone && f2.tier === st.tier }
  ];
}

const CHAIN_RULES = [
  { id: "hp-critical", when: f => f.mapKind === "dungeon" && f.hpRatio < 0.35 && !healAction(f), steps: homeChain },
  { id: "bag-full", when: f => f.mapKind === "dungeon" && f.bag.length >= 18, steps: homeChain },
  { id: "no-potions", when: f => f.mapKind === "dungeon" && !f.bag.some(i => i.kind === "potion" && i.effect !== "mana") && f.gold >= 45, steps: homeChain },
  { id: "quest-ready", when: f => f.mapKind === "dungeon" && Object.values(f.p.quests).some(q => q.done && !q.turnedIn), steps: homeChain },
  { id: "locked-treasure",
    when: f => f.mapKind === "dungeon" && f.ents.some(e => e.locked) && !f.bag.some(i => i.kind === "key") && f.gold >= 55,
    steps: f => [{ name: "go-home", done: f2 => f2.mapKind === "town" },
      { name: "buy-key", done: f2 => f2.bag.some(i => i.kind === "key") || f2.gold < 25 },
      { name: "resume-dive " + f.mapId + " t" + f.tier, zone: f.mapId, tier: f.tier,
        done: (f2, st) => f2.mapKind === "dungeon" && f2.mapId === st.zone && f2.tier === st.tier }] },
  { id: "want-book", when: f => !!wantedBook(f) && (f.mapKind !== "dungeon" || f.gold >= 220),
    steps: f => [{ name: "go-home", done: f2 => f2.mapKind === "town" },
      { name: "buy-book", done: f2 => !wantedBook(f2) || f2.bag.some(i => i.kind === "book") }]
      .concat(f.mapKind === "dungeon" ? [{ name: "resume-dive " + f.mapId + " t" + f.tier, zone: f.mapId, tier: f.tier,
        done: (f2, st) => f2.mapKind === "dungeon" && f2.mapId === st.zone && f2.tier === st.tier }] : []) },
  { id: "tier-cleared", when: f => f.mapKind === "dungeon" && f.monsterCount === 0 && f.stairs && f.def && f.tier < f.def.tiers,
    steps: f => [{ name: "descend-next", tier0: f.tier, done: (f2, st) => f2.tier > st.tier0 || f2.mapKind !== "dungeon" }] },
  { id: "laya-tending", // the model's own pack_needs_tending judgment, confidence-gated
    when: (f, d) => d && d.packNeedsTending > 0.75 && f.mapKind === "dungeon" && (f.bag.length >= 10 || f.gold >= 90),
    steps: homeChain }
];

function planAct(f, st) {
  if (f.adj.length) { const a = bestAttack(f); if (a) return a; } // fight through the plan
  if (st.name === "go-home") {
    if (f.mapKind === "outdoor") return { type: "travel", target: "town" };
    return { type: "ascend" };
  }
  if (st.name === "chores") return townErrand(f).act;
  if (st.name === "buy-key" || st.name === "buy-book") {
    const needKey = st.name === "buy-key";
    const npcId = needKey ? "merchant" : "sage";
    const shopKey = needKey ? "key" : (wantedBook(f) || {}).key;
    const price = needKey ? 25 : ((wantedBook(f) || {}).price || 999);
    if (f.gold < price) return null;
    const npc = f.ents.find(e => e.kind === "npc" && e.npcId === npcId);
    if (!npc) return randomStep();
    if (f.man(npc.x, npc.y, f.p.x, f.p.y) <= 2) return { type: "buy", key: shopKey };
    return stepToward(npc.x, npc.y) || randomStep();
  }
  if (st.name.startsWith("resume-dive")) {
    if (f.mapKind === "dungeon") return randomStep(); // wrong dungeon
    return { type: "travel", target: st.zone, tier: st.tier };
  }
  if (st.name === "descend-next") {
    if (f.onStairs) return { type: "descend" };
    return f.stairs ? (stepToward(f.stairs.x, f.stairs.y) || randomStep()) : randomStep();
  }
  return null;
}

let ruleClock = 0;
const ruleCooldown = {};

function checkChains(f, decision) {
  ruleClock++;
  if (macro.plan) {
    const st = macro.plan.steps[macro.plan.i];
    st.age = (st.age || 0) + 1;
    if (st.done(f, st) || st.age > 400) {
      macro.plan.i++;
      st.age = 0;
      if (macro.plan.i >= macro.plan.steps.length) {
        ruleCooldown[macro.plan.source] = ruleClock;
        macro.plan = null;
      }
    }
    return;
  }
  for (const r of CHAIN_RULES) {
    if (ruleClock - (ruleCooldown[r.id] || -999) < 80) continue; // don't re-arm instantly
    if (r.when(f, decision)) { macro.plan = { source: r.id, steps: r.steps(f), i: 0 }; return; }
  }
}

// ---------- dive target selection (waygate travel) ----------

function diveChoice(f) {
  const zones = f.status.travel.zones.filter(z => z.unlocked);
  if (!zones.length) return null;
  zones.sort((a, b) => (b.maxTier - a.maxTier) || (a.unlockLevel - b.unlockLevel));
  const top = zones[0];
  const tier = Math.max(1, Math.min(top.maxTier, top.tiers));
  return { target: top.id, tier };
}

// ---------- macro: one decision per tick, all act() types mapped ----------

function macroDecision(f, decision) {
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
    if (macro.plan) {
      const st = macro.plan.steps[macro.plan.i];
      const act = planAct(f, st);
      if (act) return { act, why: "plan:" + macro.plan.source + ":" + st.name.split(" ")[0] };
    }
    if (f.onStairs && (f.monstersNear === 0 || f.hpRatio > 0.6) &&
        f.def && f.tier < f.def.tiers) {
      return { act: { type: "descend" }, why: "macro:descend" };
    }
    if (f.def && f.tier >= f.def.tiers && f.monsterCount === 0) {
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
      // walk INTO a fight only if nothing is committed or it is basically on top of us
      if (!walking || f.nearest.d <= 2) {
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

  // ----- town: deterministic errand machine (an active chain plan drives it) -----
  if (f.mapKind === "town") {
    if (macro.plan) {
      const st = macro.plan.steps[macro.plan.i];
      const act = planAct(f, st);
      if (act) return { act, why: "plan:" + macro.plan.source + ":" + st.name.split(" ")[0] };
    }
    const er = townErrand(f);
    if (er.act) return { act: er.act, why: er.why };
    const d = diveChoice(f);
    if (d) return { act: { type: "travel", target: d.target, tier: d.tier }, why: "macro:waygate-dive" };
    return { act: randomStep(), why: "macro:wander-town" };
  }

  // ----- outdoors: re-enter the dive at the chosen depth, or go home -----
  if (macro.plan) {
    const st = macro.plan.steps[macro.plan.i];
    const act = planAct(f, st);
    if (act) return { act, why: "plan:" + macro.plan.source + ":" + st.name.split(" ")[0] };
  }
  const needsHome = f.hpRatio < 0.5 || f.bag.length >= 16 || questTargets(f).length > 0;
  if (needsHome) return { act: { type: "travel", target: "town" }, why: "macro:waygate-home" };
  const d = diveChoice(f);
  if (d) return { act: { type: "travel", target: d.target, tier: d.tier }, why: "macro:waygate-dive" };
  return { act: randomStep(), why: "macro:wander-out" };
}

// ---------- bridge ----------

function buildState(f) {
  const s = f.status, p = s.player;
  const rel = e => f.man(e.x, e.y, f.p.x, f.p.y);
  const withD = list => list.map(e => ({ ...e, dist: rel(e) })).sort((a, b) => a.dist - b.dist);
  return {
    scene: `${f.mapKind} ${f.mapId || ""} ${f.tier ? "tier " + f.tier : ""}, ${s.map.name}`,
    player: {
      class: p.classId, level: p.level,
      hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, atk: p.atk, def: p.def,
      potions: f.bag.filter(i => i.kind === "potion" && i.effect !== "mana").length,
      gold: f.gold, packUsed: f.bag.length,
      skills: p.skills.map(sk => ({ name: sk.name, cost: sk.cost, ready: sk.cd === 0 && p.mp >= sk.cost, desc: sk.desc }))
    },
    monsters: withD(f.ents.filter(e => e.kind === "monster")).slice(0, 6)
      .map(m => ({ name: m.name, hp: m.hp, maxHp: m.maxHp, dist: m.dist, boss: m.isBoss })),
    items: withD(f.ents.filter(e => e.kind === "item")).slice(0, 6).map(e => ({ name: e.name, dist: e.dist })),
    chests: withD(f.ents.filter(e => e.kind === "chest" && !e.locked)).slice(0, 4).map(e => ({ dist: e.dist })),
    stairs: f.stairs ? [{ dist: f.man(f.stairs.x, f.stairs.y, f.p.x, f.p.y) }] : [],
    exits: withD(f.ents.filter(e => ["portal", "entrance", "npc"].includes(e.kind))).slice(0, 4)
      .map(e => ({ kind: e.kind, name: e.name, dist: e.dist })),
    errands: {
      unidentifiedGear: f.unidentified.length,
      questReady: questTargets(f).length > 0,
      potionsLow: f.bag.filter(i => i.kind === "potion" && i.effect !== "mana").length < 2
    },
    quests: s.quests.map(q => ({ name: q.name, progress: q.progress, need: q.need, done: q.done, turnedIn: q.turnedIn }))
  };
}

function sendTelemetry(evt) {
  fetch(BRIDGE + "/event", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(evt)
  }).catch(() => {});
}

async function askBridge(state) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const res = await fetch(BRIDGE + "/decide", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }), signal: ctl.signal
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- panel ----------

const INTENT_COLORS = { fight: "#ff7a5c", cast: "#c0a0ff", flee: "#ffd76a", heal: "#7dffa0", explore: "#7ddfff", loot: "#a0ffd8", descend: "#ffb060", ascend: "#d8c0a0", travel: "#80e0ff", errand: "#ffd7a0", wait: "#667" };

function panel() {
  let el = document.getElementById("layaPanel");
  if (!el) {
    el = document.createElement("div");
    el.id = "layaPanel";
    el.style.cssText = "position:fixed;top:8px;right:8px;z-index:60;width:270px;" +
      "background:rgba(6,10,14,.92);border:1px solid #2c5;border-radius:8px;padding:10px 12px;" +
      "font:11px/1.45 monospace;color:#9fe;box-shadow:0 4px 18px rgba(0,0,0,.5);display:none;";
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<b style="color:#7dffa0;letter-spacing:1px">LayA DECISION MATRIX</b>' +
      '<button id="layaPause" style="font:10px monospace;background:#123;color:#9fe;border:1px solid #2c5;border-radius:4px;cursor:pointer;padding:1px 6px">pause</button></div>' +
      '<div id="layaMode" style="color:#ffd76a;margin-bottom:4px"></div><div id="layaIntents"></div>' +
      '<div id="layaAxes" style="margin-top:6px"></div>' +
      '<div id="layaNow" style="margin-top:6px;border-top:1px solid #234;padding-top:5px"></div>' +
      '<div id="layaHist" style="margin-top:5px;border-top:1px solid #234;padding-top:5px;color:#6a8"></div>';
    document.body.appendChild(el);
    document.getElementById("layaPause").addEventListener("click", () => setOn(false));
  }
  return el;
}

function bar(label, frac, color, extra, chosen) {
  const pct = Math.round(frac * 100);
  return '<div style="display:flex;align-items:center;gap:4px;margin:2px 0">' +
    '<span style="width:62px;color:' + (chosen ? "#fff" : "#8ab") + '">' + label + "</span>" +
    '<span style="flex:1;background:#123;height:9px;border-radius:3px;overflow:hidden">' +
    '<span style="display:block;height:100%;width:' + pct + "%;background:" + color + '"></span></span>' +
    '<span style="width:56px;text-align:right;color:' + (chosen ? "#fff" : "#8ab") + '">' + pct + "%" + (extra ? " " + extra : "") + "</span></div>";
}

function renderPanel(info) {
  const el = panel();
  el.querySelector("#layaMode").textContent = macro.mode + "  " + macro.errand;
  const d = info.decision, a = d && d.probabilities;
  const box = el.querySelector("#layaIntents");
  if (a) {
    box.innerHTML = Object.entries(a).sort((x, y) => y[1] - x[1])
      .map(([k, v]) => bar(k, v, INTENT_COLORS[k] || "#888", "", k === d.intent)).join("");
    el.querySelector("#layaAxes").innerHTML =
      bar("threat", Math.min(1, d.threat / 3), "#ff7a5c", "(" + d.threat.toFixed(1) + ")", false) +
      bar("hp-crit", d.hpCritical, "#ff7a5c", "", false) +
      bar("can-kill", d.canKill, "#7dffa0", "", false) +
      bar("overmatch", d.overmatched, "#ffb060", "", false) +
      bar("objective", d.objectiveReachable, "#7ddfff", "", false) +
      bar("pack-tend", d.packNeedsTending, "#ffd7a0", "", false);
  } else {
    box.innerHTML = '<div style="color:#a86">' + (info.bridgeNote || "no bridge data") + "</div>";
    el.querySelector("#layaAxes").innerHTML = "";
  }
  el.querySelector("#layaNow").innerHTML =
    "action <b>" + info.actionLabel + "</b> via <span style='color:" +
    (info.via.startsWith("laya") ? "#7dffa0" : info.via.startsWith("safety") ? "#ffd76a" : "#8ab") + "'>" + info.via + "</span>" +
    (info.latency != null ? ' <span style="color:#6a8">' + info.latency + "ms</span>" : "") +
    '<br><span style="color:#6a8">laya ' + pilot.decisions + " &middot; fallback " + pilot.fallbacks +
    " &middot; " + info.kills + " kills &middot; lvl " + info.level + " &middot; " + info.gold + "g" +
    (info.dead ? " &middot; DEAD" : "") + "</span>";
  el.querySelector("#layaHist").innerHTML = pilot.history.slice(0, 8).map(h =>
    "<div>" + h.t + "s " + String(h.intent).padEnd(8).slice(0, 8) + (h.conf != null ? h.conf.toFixed(2) : "  -- ") + "&rarr; " + h.action + "</div>").join("");
}

// ---------- tick loop + watchdog ----------

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
    if (payload) pilot.decisions++; else if (askNow) pilot.fallbacks++;
    const decision = payload && payload.decision;
    checkChains(f, decision);
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
  if (action.type === "move" && action.dx === 0 && action.dy === 0 && f.mapKind === "dungeon") {
    action = randomStep(); why += "+unstuck";
  }
  const took = game().core.act(action);
  if (!took && ["move", "skill"].includes(action.type) && ++failStreak >= 2) {
    game().core.act(randomStep()); failStreak = 0; why += "+unstuck";
  } else if (took) failStreak = 0;
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

function setOn(on) {
  pilot.on = on;
  panel().style.display = on ? "block" : "none";
  if (on) {
    sessionStart = Date.now();
    if (!pilot.timer) pilot.timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
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

window.addEventListener("keydown", e => {
  if (e.key === "p" || e.key === "P") {
    if (!window.game || window.game.core.screen !== "play") return;
    setOn(!pilot.on);
    e.preventDefault();
  }
});

if (new URLSearchParams(location.search).get("laya") === "1") {
  const autostart = setInterval(() => {
    const g = window.game;
    if (g && g.ready && g.core.screen === "play" && g.core.player && !pilot.on) {
      setOn(true);
      clearInterval(autostart);
    }
  }, 500);
}

Object.assign(pilot, { setOn, tick, facts, buildState, macroDecision, macroState: () => ({ ...macro }), emergencyUnstuck });
window.layaPilot = pilot;
