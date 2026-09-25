// Perception. facts() turns the live game into one structured object every
// other module reasons over — no module touches window.game directly except
// through this file and the movement primitives. buildState() serializes the
// same perception into the JSON the LayA bridge is trained to read.

import { SKILLS, MAPS } from "../data.js";
import { game } from "./state.js";

export function facts() {
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

export function questTargets(f) {
  const out = [];
  for (const [mapId, m] of Object.entries(MAPS)) {
    const q = f.p.quests[m.quest.id];
    if (q && q.done && !q.turnedIn) out.push(m.quest.npc);
  }
  return out;
}

// The exact JSON the LayA bridge scores (see bridge/matrix.py questions).
export function buildState(f) {
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
