// RogueMS pure game core. No DOM, no Three.js: all rules live here so a
// future server can run the same reducer for multiplayer.

import {
  RACES, CLASSES, SKILLS, SPELLBOOKS, WEAPONS, ARMORS, TRINKETS,
  SHOP, VENDORS, ELEMENTS, WARD_ITEMS, floorElement, FAMILIES,
  BLESSINGS, CURSES, MONSTERS, BOSSES, MAPS, QUEST_ITEM_NAMES
} from "./data.js";
import { generateLayout, generateOutdoor, layoutArchetype, makeRng, hashStr } from "./gen.js";

export const TOWN_KEY = "town";
export const dungeonKey = (mapId, tier) => mapId + ":d" + tier;

function generateTown() {
  const W = 34, H = 26;
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => "#"));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) grid[y][x] = ".";
  const buildings = [
    { id: "inn", name: "The Brass Flagon", x0: 3, y0: 3, x1: 8, y1: 7, door: [5, 7], roof: "#8a5a30", wall: "#caa46a" },
    { id: "shop", name: "Pella's Trade Yard", x0: 11, y0: 2, x1: 16, y1: 6, door: [13, 6], roof: "#a04545", wall: "#c8b088" },
    { id: "temple", name: "Temple of the Dawn", x0: 24, y0: 3, x1: 30, y1: 7, door: [27, 7], roof: "#c8c2a8", wall: "#ddd6c2" },
    { id: "smithy", name: "Merrow Smithy", x0: 24, y0: 16, x1: 30, y1: 20, door: [27, 16], roof: "#5a4030", wall: "#96755a" },
    { id: "gate", name: "Gatehouse", x0: 4, y0: 17, x1: 9, y1: 21, door: [6, 17], roof: "#60687a", wall: "#9aa0ae" }
  ];
  for (const b of buildings) {
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) grid[y][x] = "#";
    grid[b.door[1]][b.door[0]] = ".";
  }
  const fountain = { x: 18, y: 11 };
  grid[fountain.y][fountain.x] = "r";
  for (const [tx, ty] of [[2, 10], [2, 14], [10, 12], [12, 12], [22, 8], [22, 10], [22, 12], [31, 12], [3, 12], [31, 22], [2, 22], [12, 18], [12, 20], [20, 2], [32, 12], [31, 4], [31, 9], [2, 4], [2, 20], [16, 22]])
    grid[ty][tx] = "T";
  for (const [rx, ry] of [[21, 20], [24, 22], [9, 14], [15, 16]])
    grid[ry][rx] = "r";
  // market square: open plaza with stalls and crates between the Trade Yard and the fountain
  const stalls = [
    { x: 15, y: 9, roof: "#b0603a" },
    { x: 20, y: 9, roof: "#3a7ab0" },
    { x: 15, y: 13, roof: "#4a9a5a" }
  ];
  for (const s of stalls) grid[s.y][s.x] = "r";
  for (const [cx, cy] of [[16, 9], [21, 9], [16, 13]]) grid[cy][cx] = "r";
  return { grid: grid.map(r => r.join("")), buildings, spawn: { x: 18, y: 14 }, fountain, stalls };
}

let uid = 1;
const nextUid = () => uid++;

export class Core {
  constructor(seed = Date.now() & 0xffffff) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.screen = "create";
    this.dead = false;
    this.log = [];
    this.maps = new Map();
    this.player = null;
    this.kills = 0;
  }

  // ---------- lifecycle ----------

  start(classId, raceId, name) {
    const cls = CLASSES[classId], race = RACES[raceId];
    if (!cls || !race) return this.say("Unknown class or race.");
    this.screen = "play";
    const attrs = {};
    for (const k of ["str", "int", "wis", "dex", "vit"])
      attrs[k] = cls.base[k] + (race.enchant[k] || 0);
    this.player = {
      name: name || "Hero", classId, raceId, level: 1, xp: 0,
      worldSeed: Math.floor(this.rng() * 1e9),
      attrs, hp: 1, mp: 0, gold: 15, turnsSinceDamage: 99,
      x: 18, y: 14, mapKey: TOWN_KEY, facing: { dx: 1, dy: 0 }, cameFrom: {},
      skills: [cls.skills[0]], cooldowns: {}, buffs: [], hotbar: Array(12).fill(null),
      equipment: { weapon: starterWeapon(classId), armor: starterArmor(classId), trinket: null },
      bag: classId === "mage" ? [makePotion(), makeManaPotion()] : [makePotion(), makePotion()],
      quests: {}, questKills: {}, unlockedTiers: {}, unlockedMaps: ["greenhills"]
    };
    for (const mapId of Object.keys(MAPS))
      this.player.quests[MAPS[mapId].quest.id] = { progress: 0, done: false, turnedIn: false };
    for (const id of this.player.skills) this.autoPlaceSkill(id);
    this.eff();
    this.player.hp = this.eff().maxHp;
    this.player.mp = this.eff().maxMp;
    this.say(`Welcome to Merrow vale, ${name || "Hero"} the ${race.name} ${cls.name}.`);
    this.say("The town is safe. Talk to Elder Marowe (step onto a gate to travel).");
    this.getMap(TOWN_KEY);
    return true;
  }

  say(text, color) {
    this.log.push({ text, color: color || "#c8c8c8" });
    if (this.log.length > 60) this.log.shift();
  }

  // ---------- maps ----------

  mapDef(key) { return key === TOWN_KEY ? null : MAPS[key.split(":")[0]]; }

  getMap(key) {
    if (key === undefined) key = this.player ? this.player.mapKey : TOWN_KEY;
    if (!this.maps.has(key)) this.maps.set(key, this.buildMap(key));
    return this.maps.get(key);
  }

  buildMap(key) {
    if (key === TOWN_KEY) {
      const town = generateTown();
      const grid = town.grid.slice();
      const map = { key, kind: "town", name: "Merrow Vale", grid, entities: [], stairs: null,
        spawn: town.spawn, buildings: town.buildings, fountain: town.fountain, stalls: town.stalls, w: grid[0].length, h: grid.length };
      map.entities.push({ uid: nextUid(), type: "npc", npcId: "innkeep", glyph: "H", color: "#ffd0a0", icon: "delapouite__beer-horn", x: 5, y: 8, name: "Innkeep Toma" });
      map.entities.push({ uid: nextUid(), type: "npc", npcId: "merchant", glyph: "$", color: "#ffd76a", icon: "delapouite__jewel-crown", x: 13, y: 8, name: "Pella the Trader" });
      map.entities.push({ uid: nextUid(), type: "npc", npcId: "elder", glyph: "E", color: "#7be07b", icon: "delapouite__dwarf-face", x: 21, y: 10, name: "Elder Marowe" });
      map.entities.push({ uid: nextUid(), type: "npc", npcId: "warden", glyph: "W", color: "#80c0ff", icon: "delapouite__archer", x: 6, y: 16, name: "Warden Bryn" });
      map.entities.push({ uid: nextUid(), type: "npc", npcId: "foreman", glyph: "F", color: "#ff9050", icon: "delapouite__miner", x: 25, y: 15, name: "Foreman Halla" });
      map.entities.push({ uid: nextUid(), type: "npc", npcId: "smith", glyph: "A", color: "#ff8060", icon: "delapouite__warhammer", x: 28, y: 15, name: "Dorin Anvil" });
      map.entities.push({ uid: nextUid(), type: "npc", npcId: "sage", glyph: "S", color: "#c0a0ff", icon: "delapouite__spell-book", x: 27, y: 8, name: "Sage Ianna" });
      map.entities.push({ uid: nextUid(), type: "portal", target: "greenhills", glyph: "G", color: "#40d040", icon: "lorc__portal", x: 14, y: 23, name: "Greenhills Gate" });
      map.entities.push({ uid: nextUid(), type: "portal", target: "darkfang", glyph: "G", color: "#a040d0", icon: "lorc__portal", x: 17, y: 23, name: "Darkfang Gate" });
      map.entities.push({ uid: nextUid(), type: "portal", target: "ashfall", glyph: "A", color: "#ff6030", icon: "lorc__portal", x: 20, y: 23, name: "Ashfall Gate" });
      return map;
    }
    if (MAPS[key]) {
      const def = MAPS[key];
      const worldKey = (this.player ? this.player.worldSeed : 0) + ":" + key;
      const { grid, floors, building } = generateOutdoor(worldKey);
      const map = { key, kind: "outdoor", mapId: key, name: def.name, grid, floors,
        entities: [], stairs: null, spawn: null, w: grid[0].length, h: grid.length };
      map.spawn = floors[Math.floor(floors.length / 2)];
      for (let best = Infinity, i = 0; i < floors.length; i++) {
        const f = floors[i];
        const d = Math.abs(f.x - 1) + Math.abs(f.y - (grid.length - 2));
        if (d < best) { best = d; map.spawn = f; }
      }
      map.entities.push({ uid: nextUid(), type: "portal", target: "town", glyph: "X", color: "#ffd24d", icon: "delapouite__exit-door", x: map.spawn.x, y: map.spawn.y, name: "Road back to Merrow Vale" });
      map.entities.push({ uid: nextUid(), type: "entrance", target: key, glyph: "!", color: "#ffb060", icon: "delapouite__door", x: building.door.x, y: building.door.y, name: def.name + " entrance" });
      return map;
    }
    const [mapId, tierStr] = key.split(":d");
    const def = MAPS[mapId], tier = Number(tierStr);
    const worldKey = (this.player ? this.player.worldSeed : 0) + ":" + mapId;
    const arch = layoutArchetype(worldKey, tier);
    const { grid, floors } = generateLayout(worldKey, tier, arch);
    const rng = makeRng(hashStr(key + ":" + this.seed));
    const map = { key, kind: "dungeon", mapId, tier, arch, element: floorElement(mapId, tier), name: def.name, grid, floors, entities: [], stairs: null, spawn: null, w: grid[0].length, h: grid.length };

    map.spawn = floors[Math.floor(rng() * floors.length)];
    let stairs = floors[0], bestD = -1;
    for (const f of floors) {
      const d = Math.abs(f.x - map.spawn.x) + Math.abs(f.y - map.spawn.y);
      if (d > bestD) { bestD = d; stairs = f; }
    }
    map.stairs = stairs;
    let portalCell = map.spawn;
    const openCell = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && grid[y][x] === ".";
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = { x: map.spawn.x + ox, y: map.spawn.y + oy };
      if (openCell(c.x, c.y)) { portalCell = c; break; }
    }
    map.entities.push({ uid: nextUid(), type: "portal", target: mapId, glyph: "X", color: "#ffd24d", icon: "delapouite__exit-door", x: portalCell.x, y: portalCell.y, name: "Return to " + def.name });

    const occupied = new Set([map.spawn.x + "," + map.spawn.y, map.stairs.x + "," + map.stairs.y, portalCell.x + "," + portalCell.y]);
    const freeCell = () => {
      for (let t = 0; t < 50; t++) {
        const f = floors[Math.floor(rng() * floors.length)];
        const dist = Math.abs(f.x - map.spawn.x) + Math.abs(f.y - map.spawn.y);
        if (dist > 4 && !occupied.has(f.x + "," + f.y)) { occupied.add(f.x + "," + f.y); return f; }
      }
      return null;
    };

    // 3-4 monster species per dungeon tier, harder tiers and maps scale up.
    const pool = def.monsters.filter(m => MONSTERS[m].minTier <= tier);
    const kinds = pick(rng, pool, Math.min(4, Math.max(3, pool.length)));
    map.monsterKinds = kinds.map(k => MONSTERS[k].name);
    const count = 4 + tier + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const cell = freeCell();
      if (cell) map.entities.push(this.makeMonster(kinds[Math.floor(rng() * kinds.length)], mapId, tier, cell.x, cell.y, rng));
    }
    if (tier === def.tiers) {
      const cell = freeCell();
      const boss = BOSSES[def.boss];
      if (cell) map.entities.push({
        uid: nextUid(), type: "monster", monsterId: def.boss, boss: true,
        name: boss.name, glyph: boss.glyph, color: boss.color, icon: boss.icon,
        hp: Math.round(boss.hp * def.difficulty), maxHp: Math.round(boss.hp * def.difficulty),
        dmg: boss.dmg + Math.floor((def.difficulty - 1) * 8), def: boss.def, xp: boss.xp,
        x: cell.x, y: cell.y, stun: 0
      });
    }
    for (let i = 0; i < 3 + Math.floor(tier / 3); i++) {
      const cell = freeCell();
      if (cell) map.entities.push({ uid: nextUid(), type: "item", item: genItem(mapId, tier, rng, false, this.player && this.player.classId), x: cell.x, y: cell.y });
    }
    // Chests hold gold and gear; locked ones bite unless you carry an iron key.
    const chestCount = 1 + (rng() < 0.55 ? 1 : 0);
    for (let i = 0; i < chestCount; i++) {
      const cell = freeCell();
      if (!cell) continue;
      const loot = [];
      const lootCount = 1 + (rng() < 0.4 ? 1 : 0);
      for (let j = 0; j < lootCount; j++) loot.push(genItem(mapId, tier, rng, false, this.player && this.player.classId));
      const locked = rng() < 0.35;
      map.entities.push({
        uid: nextUid(), type: "chest", x: cell.x, y: cell.y,
        glyph: "C", color: locked ? "#d06030" : "#d0a040",
        locked,
        gold: 8 + tier * (6 + Math.floor(rng() * 10)),
        hasKey: rng() < 0.35, loot
      });
    }
    // One locked strongroom per depth: an iron key turns its stash to loot.
    const doorCell = freeCell();
    if (doorCell) map.entities.push({
      uid: nextUid(), type: "door", x: doorCell.x, y: doorCell.y, locked: true,
      glyph: "‡", color: "#b06030",
      stash: {
        gold: 20 + tier * 18 + Math.floor(rng() * 20),
        items: [genItem(mapId, Math.min(12, tier + 2), rng, false, this.player && this.player.classId), genItem(mapId, Math.min(12, tier + 2), rng, false, this.player && this.player.classId)]
      }
    });
    return map;
  }

  makeMonster(monsterId, mapId, tier, x, y, rng) {
    const m = MONSTERS[monsterId], def = MAPS[mapId];
    const hpMult = (1 + 0.35 * (tier - 1)) * def.difficulty;
    const dmgAdd = Math.floor((tier - 1) * 0.6) + Math.floor((def.difficulty - 1) * 8);
    // Themed floors: ~70% of creatures wear the floor's element as a variant.
    const el = !m.unique ? floorElement(mapId, tier) : "none";
    const variant = el !== "none" && rng() < 0.7;
    const E = variant ? ELEMENTS[el] : null;
    const hp = Math.round(m.hp * hpMult * (E ? E.hp : 1));
    return {
      uid: nextUid(), type: "monster", monsterId, element: variant ? el : "none",
      name: (E ? E.prefix : "") + m.name, glyph: m.glyph, color: E ? E.color : m.color, icon: m.icon,
      hp, maxHp: hp, dmg: m.dmg + dmgAdd + (E ? E.bonus : 0), def: m.def + Math.floor((tier - 1) / 3),
      xp: Math.round(m.xp * (1 + 0.3 * (tier - 1)) * def.difficulty * (E ? E.xp : 1)), x, y, stun: 0
    };
  }

  // ---------- derived stats ----------

  affixSum(key) {
    let s = 0;
    for (const slot of ["weapon", "armor", "trinket"]) {
      const it = this.player.equipment[slot];
      if (it) for (const a of (it.affixes || [])) if (a.key === key) s += a.value;
    }
    return s;
  }

  buffSum(key) {
    return this.player.buffs.reduce((s, b) => s + (b[key] || 0), 0);
  }

  // Elemental protection: gear resist affixes + any allRes buff (Ward spell).
  resist(element) {
    const E = ELEMENTS[element];
    if (!E || !E.res) return 0;
    return this.affixSum(E.res) + this.buffSum("allRes");
  }

  attr(k) {
    return this.player.attrs[k] + this.affixSum(k) + this.buffSum(k);
  }

  eff() {
    const p = this.player, cls = CLASSES[p.classId];
    const mod = v => Math.floor((v - 10) / 2);
    const maxHp = 18 + this.attr("vit") * 2 + cls.hpBase + (p.level - 1) * cls.hpPer + this.affixSum("hp") * 3;
    const maxMp = 4 + Math.max(0, mod(this.attr("int"))) * 3 + Math.max(0, mod(this.attr("wis"))) * 2
      + (p.level - 1) * cls.mpPer + this.affixSum("mp") * 3;
    const atk = mod(this.attr("str")) + Math.floor(p.level / 2) + this.affixSum("atk") + this.buffSum("atk");
    const def = mod(this.attr("dex")) + (p.equipment.armor ? p.equipment.armor.def : 0)
      + this.affixSum("def") + this.buffSum("def");
    return { maxHp, maxMp, atk, def, str: this.attr("str"), int: this.attr("int"), wis: this.attr("wis"), dex: this.attr("dex"), vit: this.attr("vit") };
  }

  weaponDie() { return this.player.equipment.weapon ? this.player.equipment.weapon.dmg : 3; }

  xpNeed() { return Math.round(20 * Math.pow(this.player.level, 1.5)); }

  // ---------- actions ----------

  act(action) {
    if (this.screen !== "play" || !this.player) return false;
    if (this.dead) {
      if (action.type === "revive") this.revive();
      return false;
    }
    let tookTurn = false;
    switch (action.type) {
      case "move": tookTurn = this.doMove(action.dx, action.dy); break;
      case "skill": tookTurn = this.doSkill(action.slot, action.dir); break;
      case "bindHotbar": this.bindHotbar(action.slot, action.skillId); break;
      case "interact": tookTurn = this.doInteract(); break;
      case "descend": this.doDescend(); break;
      case "ascend": this.doAscend(); break;
      case "identify": this.doIdentify(action.uid); break;
      case "identService": this.doIdentService(action.uid); break;
      case "buy": this.doBuy(action.key); break;
      case "sell": this.doSell(action.uid); break;
      case "equip": this.doEquip(action.uid); break;
      case "drop": this.doDrop(action.uid); break;
      case "useItem": this.doUseItem(action.uid); break;
      case "travel": this.doTravel(action.target, action.tier); break;
      default: return false;
    }
    if (tookTurn) this.endTurn();
    return tookTurn;
  }

  blocked(x, y, mapKey) {
    const map = this.getMap(mapKey || this.player.mapKey);
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
    const ch = map.grid[y][x];
    return ch === "#" || ch === " " || ch === "T" || ch === "r";
  }

  entityAt(x, y, mapKey) {
    const map = this.getMap(mapKey || this.player.mapKey);
    return map.entities.find(e => e.x === x && e.y === y && !(e.type === "monster" && e.hp <= 0));
  }

  doMove(dx, dy) {
    const p = this.player;
    if (dx || dy) p.facing = { dx, dy };
    const nx = p.x + dx, ny = p.y + dy;
    const px = p.x, py = p.y;
    const e = this.entityAt(nx, ny);
    if (e && e.type === "monster") return this.playerAttack(e, 1.0) || true;
    if (e && (e.type === "npc" || (e.type === "monster" && e.hp > 0))) return false;
    if (e && e.type === "chest") return this.openChest(e);
    if (e && e.type === "door") return this.unlockDoor(e);
    if (this.blocked(nx, ny)) return false;
    p.x = nx; p.y = ny;
    const here = this.entityAt(nx, ny);
    if (here) {
      if (here.type === "item") this.pickup(here);
      else if (here.type === "portal" && (dx !== 0 || dy !== 0)) {
        if (here.target === "town") this.doTravel("town");
        else this.doTravel(here.target);
        return true;
      } else if (here.type === "entrance") {
        const def = MAPS[here.target];
        const t = Math.min(this.player.unlockedTiers[here.target] || 1, def.tiers);
        this.player.pendingReturn = { x: px, y: py };
        this.doTravel(here.target, t);
        return true;
      }
    }
    return true;
  }

  pickup(e) {
    const map = this.getMap();
    map.entities = map.entities.filter(x => x !== e);
    const it = e.item;
    const mapDef = this.mapDef(this.player.mapKey);
    if (it.quest) {
      const q = this.player.quests[it.questId];
      if (q && !q.done) {
        q.progress++;
        this.say(`Picked up ${it.name} (${q.progress}/${mapDef.quest.need}).`, it.color);
        if (q.progress >= mapDef.quest.need) { q.done = true; this.say("Quest items complete - return to town!", "#ffd700"); }
      }
      return;
    }
    if (this.player.bag.length >= 20) { this.say("Your pack is full."); return; }
    this.player.bag.push(it);
    this.say(`Picked up ${itemLabel(it)}.`, it.color);
  }

  takeKey() {
    const key = this.player.bag.find(i => i.kind === "key");
    if (key) this.player.bag.splice(this.player.bag.indexOf(key), 1);
    return key || null;
  }

  spillToFloor(map, x, y, items) {
    for (const it of items) {
      if (this.player.bag.length < 20) this.player.bag.push(it);
      else map.entities.push({ uid: nextUid(), type: "item", x, y, item: it });
    }
  }

  openChest(chest) {
    const p = this.player, map = this.getMap();
    if (chest.locked) {
      if (!p.bag.some(i => i.kind === "key")) { this.say("A padlock, green with rust. You need an iron key.", "#c0a0a0"); return false; }
      this.takeKey();
      chest.locked = false;
      this.say("The iron key turns with a stubborn grind. (-1 Iron Key)", "#c0c0d0");
    }
    map.entities = map.entities.filter(x => x !== chest);
    p.gold += chest.gold;
    this.say(`The chest yields ${chest.gold} gold.`, "#ffd76a");
    this.spillToFloor(map, chest.x, chest.y, chest.loot);
    for (const it of chest.loot) this.say(`...and ${itemLabel(it)}.`, it.color);
    if (chest.hasKey) {
      const k = makeKey();
      this.spillToFloor(map, chest.x, chest.y, [k]);
      this.say("...and an iron key on a frayed cord.", "#c0c0d0");
    }
    return true;
  }

  unlockDoor(door) {
    const p = this.player, map = this.getMap();
    if (!door.locked) { map.entities = map.entities.filter(x => x !== door); return false; }
    if (!p.bag.some(i => i.kind === "key")) { this.say("A locked strongroom door. An iron key would open it.", "#c0a0a0"); return false; }
    this.takeKey();
    map.entities = map.entities.filter(x => x !== door);
    p.gold += door.stash.gold;
    this.say(`The strongroom door swings wide: ${door.stash.gold} gold in a coin chest! (-1 Iron Key)`, "#ffd76a");
    this.spillToFloor(map, door.x, door.y, door.stash.items);
    for (const it of door.stash.items) this.say(`...and ${itemLabel(it)} on a dust-covered rack.`, it.color);
    return true;
  }

  playerAttack(monster, mult, flat = 0) {
    const p = this.player, e = this.eff();
    const crit = this.rng() < 0.08;
    let dmg = Math.round((rand1to(this.rng, this.weaponDie()) + e.atk + flat) * mult * (crit ? 2 : 1));
    dmg = Math.max(1, dmg - rand0to(this.rng, monster.def));
    monster.hp -= dmg;
    this.say(`${crit ? "CRITICAL! " : ""}You hit ${monster.name} for ${dmg}.`, "#ffe080");
    if (monster.hp <= 0) this.killMonster(monster);
    return true;
  }

  killMonster(m) {
    const map = this.getMap();
    map.entities = map.entities.filter(x => x !== m);
    this.kills++;
    this.player.xp += m.xp;
    this.say(`${m.name} dies! +${m.xp} XP`, "#90ff90");
    const p = this.player;
    const mapDef = this.mapDef(p.mapKey);
    if (mapDef) {
      const quest = mapDef.quest;
      const q = p.quests[quest.id];
      if (q && !q.done) {
        const killed = p.questKills[mapDef.name] || 0;
        p.questKills[mapDef.name] = killed + 1;
        if (killed + 1 <= quest.need || this.rng() < 0.15) {
          const cell = { x: m.x, y: m.y };
          map.entities.push({ uid: nextUid(), type: "item", x: cell.x, y: cell.y, item: {
            uid: nextUid(), kind: "quest", questId: quest.id, name: QUEST_ITEM_NAMES[quest.id] || "Quest Item",
            glyph: quest.glyph, color: quest.color, icon: quest.icon, quest: true } });
          this.say(`Something glitters on ${m.name}...`, quest.color);
        }
      }
    }
    if (this.rng() < 0.3) {
      const it = genItem(p.mapKey === TOWN_KEY ? "greenhills" : mapDef.mapId, p.mapKey === TOWN_KEY ? 1 : this.getMap().tier, this.rng, false, p.classId);
      map.entities.push({ uid: nextUid(), type: "item", x: m.x, y: m.y, item: it });
    }
    while (p.xp >= this.xpNeed()) this.levelUp();
  }

  levelUp() {
    const p = this.player, cls = CLASSES[p.classId];
    p.xp -= this.xpNeed();
    p.level++;
    for (const k of ["str", "int", "wis", "dex", "vit"]) {
      const own = cls.growth[k];
      p.attrs[k] += own ? own : (this.rng() < cls.growth.other ? 1 : 0);
    }
    for (const id of cls.skills) {
      if (!p.skills.includes(id) && SKILLS[id].level <= p.level) {
        p.skills.push(id);
        this.autoPlaceSkill(id);
        this.say(`New ability: ${SKILLS[id].name}!`, "#7ddfff");
      }
    }
    const e = this.eff();
    p.hp = e.maxHp; p.mp = e.maxMp;
    this.say(`LEVEL ${p.level}!`, "#ffd700");
  }

  doSkill(slot, dir) {
    const p = this.player, id = p.skills[slot];
    if (!id) return false;
    const s = SKILLS[id];
    if ((p.cooldowns[id] || 0) > 0) { this.say(`${s.name} is on cooldown.`); return false; }
    if (p.mp < s.cost) { this.say(`Not enough mana for ${s.name}.`); return false; }
    const e = this.eff();
    const map = this.getMap();
    const monsters = map.entities.filter(x => x.type === "monster" && x.hp > 0);
    const adjAll = monsters.filter(m => Math.abs(m.x - p.x) + Math.abs(m.y - p.y) === 1);
    const nearAll = monsters.filter(m => dist(m, p) <= (s.range || 1)).sort((a, b) => dist(a, p) - dist(b, p));
    // Directional aiming (arrow keys / click-a-direction): prefer foes along that ray.
    const aimed = !!(dir && (dir.dx || dir.dy));
    const inDir = m => (m.x - p.x) * dir.dy === (m.y - p.y) * dir.dx
      && (m.x - p.x) * dir.dx + (m.y - p.y) * dir.dy > 0;
    const adj = aimed ? adjAll.filter(inDir) : adjAll;
    const near = aimed ? nearAll.filter(inDir) : nearAll;
    const fail = aimed ? "Nothing worth striking that way." : null;
    p.mp -= s.cost;
    p.cooldowns[id] = s.cd + 1;
    switch (s.kind) {
      case "identify": {
        const target = p.bag.find(i => ["weapon", "armor", "trinket"].includes(i.kind) && i.ident === false);
        if (!target) { p.mp += s.cost; p.cooldowns[id] = 0; this.say("Nothing in your pack needs identifying."); return false; }
        target.ident = true;
        this.say(`You identify the ${itemLabel(target)}.`, "#7ddfff");
        break;
      }
      case "plunder": {
        if (!near.length) { p.mp += s.cost; p.cooldowns[id] = 2; this.say("No one close enough to pick a pocket.", "#ff9090"); return false; }
        const loot = 15 + p.level * 3 + Math.floor(this.rng() * 20);
        p.gold += loot;
        this.say(`Plunder: ${loot}g lighter-fingered from the ${near[0].name}.`, "#ffd76a");
        break;
      }
      case "melee":
        if (!adj.length) { p.mp += s.cost; p.cooldowns[id] = 2; this.say(fail || "No foe in reach.", "#ff9090"); return false; }
        this.playerAttack(adj[0], s.power || 1.8);
        break;
      case "melee-all":
        if (!adj.length) { p.mp += s.cost; p.cooldowns[id] = 2; this.say(fail || "No foes in reach.", "#ff9090"); return false; }
        for (const m of adj) this.playerAttack(m, s.power);
        break;
      case "self-heal": {
        const amount = Math.round(e.maxHp * s.power + (s.wis ? e.wis : 0));
        p.hp = Math.min(e.maxHp, p.hp + amount);
        this.say(`${s.name}: +${amount} HP.`, "#90ff90");
        break;
      }
      case "buff":
        p.buffs.push({ ...s.buff });
        this.say(`${s.name} takes hold.`, "#b0d0ff");
        break;
      case "bolt": {
        const t = near[0];
        if (!t) { p.mp += s.cost; p.cooldowns[id] = 2; this.say(fail || "No target in range.", "#ff9090"); return false; }
        const dmg = s.power + (s.dex ? e.dex : s.wis ? e.wis : e.int) + this.rng() * 3 | 0;
        t.hp -= dmg;
        this.say(`${s.name} sears ${t.name} for ${dmg}!`, "#ffb060");
        if (s.stun && t.hp > 0) t.stun = s.stun;
        if (t.hp <= 0) this.killMonster(t);
        break;
      }
      case "multi-bolt": {
        const targets = near.slice(0, s.count);
        if (!targets.length) { p.mp += s.cost; p.cooldowns[id] = 2; this.say(fail || "No targets in range.", "#ff9090"); return false; }
        for (const t of targets) {
          const dmg = s.power + (s.dex ? e.dex : s.wis ? e.wis : e.int) + this.rng() * 3 | 0;
          t.hp -= dmg;
          this.say(`${s.name} arcs through ${t.name} for ${dmg}!`, s.dex ? "#a0e0a0" : "#c0a0ff");
          if (s.stun && t.hp > 0) t.stun = s.stun;
          if (t.hp <= 0) this.killMonster(t);
        }
        break;
      }
      default: return false;
    }
    return true;
  }

  // ---------- hotbar (12 slots: 1-6 auto-filled, all rebindable) ----------

  ensureHotbar() {
    const p = this.player;
    if (!p) return [];
    if (!Array.isArray(p.hotbar) || p.hotbar.length !== 12) {
      const old = Array.isArray(p.hotbar) ? p.hotbar : [];
      p.hotbar = Array.from({ length: 12 }, (_, i) => old[i] ?? null);
    }
    // prune bindings for skills no longer known
    for (let i = 0; i < 12; i++) if (p.hotbar[i] && !p.skills.includes(p.hotbar[i])) p.hotbar[i] = null;
    return p.hotbar;
  }

  autoPlaceSkill(id) {
    const bar = this.ensureHotbar();
    if (bar.includes(id)) return;
    const free = bar.indexOf(null);
    if (free >= 0) bar[free] = id;
  }

  bindHotbar(slot, skillId) {
    const bar = this.ensureHotbar();
    if (slot < 0 || slot >= 12) return false;
    if (skillId !== null && !this.player.skills.includes(skillId)) { this.say("You have not learned that yet."); return false; }
    // if the skill is bound elsewhere, swap the two slots
    const prev = bar.indexOf(skillId);
    if (prev >= 0 && prev !== slot) bar[prev] = bar[slot];
    bar[slot] = skillId;
    return true;
  }

  doInteract() {
    const p = this.player;
    const spots = [[p.x, p.y], [p.x + p.facing.dx, p.y + p.facing.dy]];
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) spots.push([p.x + d[0], p.y + d[1]]);
    for (const [x, y] of spots) {
      const e = this.entityAt(x, y);
      if (e && e.type === "npc") return this.talkTo(e);
      if (e && e.type === "chest") return this.openChest(e);
      if (e && e.type === "door") return this.unlockDoor(e);
      if (e && e.type === "portal") {
        if (e.target === "town") this.doTravel("town");
        else this.doTravel(e.target, 1);
        return true;
      }
    }
    this.say("Nothing to interact with.");
    return false;
  }

  talkTo(npc) {
    const p = this.player;
    if (npc.npcId === "innkeep") {
      p.hp = this.eff().maxHp; p.mp = this.eff().maxMp;
      p.turnsSinceDamage = 0;
      this.say("Innkeep Toma: 'Rest a while.' You are fully rested.", "#90ff90");
      return true;
    }
    if (npc.npcId === "merchant") {
      this.say("Pella the Trader: 'Bought from Pella, sold to Pella - the goods pass honest(ish). Potions, keys, scrolls, and light blades in my ledger panel.'", "#ffd76a");
      return true;
    }
    if (npc.npcId === "smith") {
      this.say("Dorin Anvil: 'Steel shaped honest and paid in full. Blades and armor bought from Dorin keep their edges - and Dorin buys good gear back.'", "#ff8060");
      return true;
    }
    if (npc.npcId === "sage") {
      this.say("Sage Ianna: 'Every spell I sell was written by a wiser head than yours. Wards and Names are common arts, open to any reader; the rest only answer to the tradition that wrote them. Bring the book of your own kind.'", "#c0a0ff");
      return true;
    }
    const mapId = Object.keys(MAPS).find(mid => MAPS[mid].quest.npc === npc.npcId);
    const def = MAPS[mapId], quest = def.quest, q = p.quests[quest.id];
    if (p.level < def.unlockLevel)
      { this.say(`${npc.name}: 'Come back when you are stronger, friend.' (needs level ${def.unlockLevel})`); return true; }
    if (q.turnedIn) { this.say(`${npc.name}: 'The village owes you a debt.'`); return true; }
    this.say(quest.greeting, "#b0e0ff");
    if (q.done && q.progress >= quest.need) {
      q.turnedIn = true;
      p.xp += quest.rewardXp;
      const reward = genItem(mapId, Math.max(2, def.tiers / 2), this.rng, true, p.classId);
      p.bag.push(reward);
      this.say(quest.complete, "#ffd700");
      this.say(`Reward: +${quest.rewardXp} XP and ${itemLabel(reward)}!`, "#ffd700");
      while (p.xp >= this.xpNeed()) this.levelUp();
    }
    return true;
  }

  doTravel(target, tier) {
    const p = this.player;
    const oldKey = p.mapKey;
    p.cameFrom = p.cameFrom || {};
    const rec = { mapKey: oldKey, x: p.pendingReturn ? p.pendingReturn.x : p.x, y: p.pendingReturn ? p.pendingReturn.y : p.y };
    p.pendingReturn = null;
    if (target === "town") {
      p.cameFrom[TOWN_KEY] = rec;
      p.mapKey = TOWN_KEY;
      const town = this.getMap(TOWN_KEY);
      const back = p.cameFrom[oldKey];
      if (back && back.mapKey === TOWN_KEY && !this.blocked(back.x, back.y, TOWN_KEY)) { p.x = back.x; p.y = back.y; }
      else { p.x = town.spawn.x; p.y = town.spawn.y; }
      this.say("You return to Merrow Vale.");
      return;
    }
    const def = MAPS[target];
    if (!def) return;
    if (p.level < def.unlockLevel) { this.say(`${def.name} is sealed to you until level ${def.unlockLevel}.`, "#ff9090"); return; }
    if (!tier) {
      p.cameFrom[target] = rec;
      p.mapKey = target;
      const out = this.getMap(target);
      const back = p.cameFrom[oldKey];
      if (back && back.mapKey === target && !this.blocked(back.x, back.y, target)) { p.x = back.x; p.y = back.y; }
      else { p.x = out.spawn.x; p.y = out.spawn.y; }
      this.say(`You step out into the ${def.name} outdoors. Find the entrance to delve deeper.`);
      return;
    }
    const maxUnlocked = p.unlockedTiers[target] || 1;
    const t = Math.min(tier, maxUnlocked);
    const destKey = dungeonKey(target, t);
    p.cameFrom[destKey] = rec;
    p.mapKey = destKey;
    const map = this.getMap(p.mapKey);
    p.x = map.spawn.x; p.y = map.spawn.y;
    this.say(`You enter ${def.name}, dungeon level ${t} (${map.tier === def.tiers ? "final depth" : "layout " + (map.arch + 1)}).`);
  }

  doAscend() {
    const p = this.player;
    const rec = (p.cameFrom || {})[p.mapKey];
    if (!rec) { this.say("There is no way back up from here."); return; }
    let x = rec.x, y = rec.y;
    if (this.blocked(x, y, rec.mapKey)) {
      let found = null;
      for (let r = 1; r <= 3 && !found; r++)
        for (let dx = -r; dx <= r && !found; dx++)
          for (let dy = -r; dy <= r && !found; dy++)
            if (!this.blocked(rec.x + dx, rec.y + dy, rec.mapKey)) found = { x: rec.x + dx, y: rec.y + dy };
      if (!found) { this.say("The way back is sealed."); return; }
      x = found.x; y = found.y;
    }
    p.mapKey = rec.mapKey;
    p.x = x; p.y = y;
    this.say("You climb back the way you came.", "#b0d0ff");
  }

  doDescend() {
    const p = this.player;
    if (p.mapKey === TOWN_KEY) { this.say("No stairs here."); return; }
    const map = this.getMap(p.mapKey);
    const [mapId, tStr] = p.mapKey.split(":d");
    const tier = Number(tStr), def = MAPS[mapId];
    const onStairs = Math.max(Math.abs(map.stairs.x - p.x), Math.abs(map.stairs.y - p.y)) <= 1;
    if (!onStairs) { this.say("You must stand on or beside the stairs (>)."); return; }
    if (tier >= def.tiers) { this.say("You have conquered every depth of this place.", "#ffd700"); return; }
    p.unlockedTiers[mapId] = Math.max(p.unlockedTiers[mapId] || 1, tier + 1);
    const nextKey = dungeonKey(mapId, tier + 1);
    p.cameFrom = p.cameFrom || {};
    p.cameFrom[nextKey] = { mapKey: p.mapKey, x: map.stairs.x, y: map.stairs.y };
    p.mapKey = nextKey;
    const next = this.getMap(p.mapKey);
    p.x = next.spawn.x; p.y = next.spawn.y;
    this.say(`You descend to ${def.name} depth ${tier + 1}. The air grows heavier.`, "#c0a0ff");
  }

  doDrop(uid) {
    const p = this.player;
    const i = p.bag.findIndex(it => it.uid === uid);
    if (i < 0) { this.say("Nothing in the pack with that mark."); return false; }
    const it = p.bag.splice(i, 1)[0];
    const map = this.getMap(p.mapKey);
    map.entities.push({ type: "item", x: p.x, y: p.y, item: it });
    this.say(`You drop ${itemLabel(it)}.`, "#c0a0a0");
    return true;
  }

  doEquip(itemUid) {
    const p = this.player;
    const idx = p.bag.findIndex(i => i.uid === itemUid);
    if (idx < 0) return;
    const it = p.bag[idx];
    if (!["weapon", "armor", "trinket"].includes(it.kind)) { this.say("That is not equipment."); return; }
    if (it.ident === false) { this.say(`You dare not use ${it.name} unidentified - who knows what it truly is, or what curses it.`, "#c0a0a0"); return; }
    const cls = CLASSES[p.classId];
    if (it.kind === "weapon" && cls.weapons && !cls.weapons.includes(it.id)) { this.say(`A ${cls.name} cannot wield a ${it.name}.`, "#ff9090"); return; }
    if (it.kind === "armor" && cls.armors && !cls.armors.includes(it.id)) { this.say(`A ${cls.name} cannot wear ${it.name}.`, "#ff9090"); return; }
    p.bag.splice(idx, 1);
    const old = p.equipment[it.slot];
    p.equipment[it.slot] = it;
    if (old) p.bag.push(old);
    this.say(`Equipped ${itemLabel(it)}.`, it.color);
    const e = this.eff();
    p.hp = Math.min(p.hp, e.maxHp); p.mp = Math.min(p.mp, e.maxMp);
  }

  doIdentify(uid) {
    const p = this.player;
    const it = p.bag.find(i => i.uid === uid);
    if (!it) { this.say("Identify what?"); return false; }
    if (!["weapon", "armor", "trinket"].includes(it.kind) || it.ident !== false) { this.say("That item is already known to you."); return false; }
    const s = SKILLS["identify"];
    const hasScroll = p.bag.find(i => i.kind === "scroll-identify");
    const knows = p.skills.includes("identify");
    if (knows && p.mp >= s.cost) {
      p.mp -= s.cost;
    } else if (hasScroll) {
      p.bag.splice(p.bag.indexOf(hasScroll), 1);
    } else if (knows) {
      this.say("Not enough mana to Identify.", "#ff9090"); return false;
    } else {
      this.say("You have no magic for this. Buy a Scroll of Identify from Pella, or play a Mage.", "#c0a0a0"); return false;
    }
    it.ident = true;
    this.say(`You identify the ${itemLabel(it)}.`, "#7ddfff");
    return true;
  }

  nearbyVendor() {
    const p = this.player;
    if (!p) return null;
    const map = this.getMap(p.mapKey);
    if (map.kind !== "town") return null;
    const npc = map.entities.find(e => e.type === "npc" && VENDORS[e.npcId] && dist(e, p) <= 2);
    return npc || null;
  }

  doBuy(key) {
    const p = this.player;
    const entry = SHOP.find(s => s.key === key);
    if (!entry) return false;
    const vendor = this.nearbyVendor();
    if (!vendor || vendor.npcId !== entry.vendor) {
      const who = VENDORS[entry.vendor].name;
      this.say(`Only ${who} sells the ${entry.name}.`); return false;
    }
    if (p.gold < entry.price) { this.say(`${vendor.name}: 'No gold, no goods.' (${entry.price}g)`); return false; }
    if (p.bag.length >= 20) { this.say("Your pack is full."); return false; }
    const [type, id] = key.split(":");
    let item;
    if (key === "potion") item = makePotion();
    else if (key === "potion-mana") item = makeManaPotion();
    else if (key === "scroll-identify") item = makeScrollIdentify();
    else if (key === "key") item = makeKey();
    else if (type === "weapon") {
      const w = WEAPONS.find(x => x.id === id);
      item = { uid: nextUid(), kind: "weapon", slot: "weapon", id: w.id, name: w.name, dmg: w.dmg, tier: w.tier, glyph: "/", color: "#d0d0e0", icon: w.icon, affixes: [], cursed: false, ident: true };
    } else if (type === "armor") {
      const a = ARMORS.find(x => x.id === id);
      item = { uid: nextUid(), kind: "armor", slot: "armor", id: a.id, name: a.name, def: a.def, tier: a.tier, glyph: "[", color: "#c0a070", icon: a.icon, affixes: [], cursed: false, ident: true };
    } else if (type === "trinket") {
      const w = WARD_ITEMS.find(x => x.id === id);
      if (!w) return false;
      const label = (ELEMENTS[w.element]?.name || "") + " Resistance";
      item = { uid: nextUid(), kind: "trinket", slot: "trinket", id: w.id, name: w.name, tier: w.tier, glyph: "'", color: "#e0c060", icon: w.icon, affixes: [{ key: ELEMENTS[w.element].res, name: label, value: w.value }], cursed: false, ident: true };
    } else if (type === "book") {
      const b = SPELLBOOKS[id];
      item = { uid: nextUid(), kind: "book", bookId: id, name: b.name, glyph: b.glyph, color: b.color, icon: b.icon, reqLevel: b.reqLevel, ident: true };
    }
    p.gold -= entry.price;
    p.bag.push(item);
    this.say(`${vendor.name}: the ${entry.name} is yours. -${entry.price}g.`, "#ffd76a");
    return true;
  }

  doSell(uid) {
    const p = this.player;
    const idx = p.bag.findIndex(i => i.uid === uid);
    if (idx < 0) return false;
    const vendor = this.nearbyVendor();
    if (!vendor) {
      this.say("No merchant is close enough to trade - find Pella, Dorin, or Ianna in town."); return false;
    }
    const it = p.bag[idx];
    if (it.quest) { this.say("That belongs to a village, not a coin purse."); return false; }
    const price = sellPrice(it);
    p.bag.splice(idx, 1);
    p.gold += price;
    const note = it.kind !== "weapon" && it.kind !== "armor" && it.kind !== "trinket" ? "" :
      it.ident === false ? " (unidentified - a scrap)" : it.cursed ? " (cursed - below its worth)" : "";
    this.say(`${vendor.name} counts out ${price} gold for the ${itemLabel(it)}${note}.`, "#ffd76a");
    return true;
  }

  doIdentService(uid) {
    const p = this.player;
    const it = p.bag.find(i => i.uid === uid);
    if (!it || !["weapon", "armor", "trinket"].includes(it.kind) || it.ident !== false) {
      this.say("Identify what? Pick an unidentified item from your pack."); return false;
    }
    const vendor = this.nearbyVendor();
    if (!vendor) { this.say("Only a town merchant can appraise your goods."); return false; }
    if (p.gold < IDENT_SERVICE_PRICE) {
      this.say(`${vendor.name}: 'Identification costs ${IDENT_SERVICE_PRICE} gold up front.'`); return false;
    }
    p.gold -= IDENT_SERVICE_PRICE;
    it.ident = true;
    this.say(`${vendor.name} weighs it in hand... It is ${itemLabel(it)}. -${IDENT_SERVICE_PRICE}g.`, "#7ddfff");
    return true;
  }

  doUseItem(itemUid) {
    const p = this.player;
    const idx = p.bag.findIndex(i => i.uid === itemUid);
    if (idx < 0) return;
    const it = p.bag[idx];
    if (it.kind === "potion") {
      const e = this.eff();
      if (it.effect === "mana") {
        const amount = Math.round(e.maxMp * 0.5);
        p.mp = Math.min(e.maxMp, p.mp + amount);
        p.bag.splice(idx, 1);
        this.say(`You drink the blue potion: +${amount} MP.`, "#80a0ff");
      } else {
        const amount = Math.round(e.maxHp * 0.4);
        p.hp = Math.min(e.maxHp, p.hp + amount);
        p.bag.splice(idx, 1);
        this.say(`You drink the red potion: +${amount} HP.`, "#ff8080");
      }
    } else if (it.kind === "key") {
      this.say("Iron keys open locked chests and strongroom doors - just walk into them.", "#c0c0d0");
    } else if (it.kind === "scroll-identify") {
      const target = p.bag.find(i => ["weapon", "armor", "trinket"].includes(i.kind) && i.ident === false && i.uid !== itemUid);
      p.bag.splice(idx, 1);
      if (target) {
        target.ident = true;
        this.say(`The scroll whispers its name: ${itemLabel(target)}.`, "#7ddfff");
      } else {
        this.say("The scroll crumbles to dust... over an empty pack.", "#c0a0a0");
      }
    } else if (it.kind === "book") {
      const sb = SPELLBOOKS[it.bookId];
      if (p.skills.includes(sb.teaches)) { this.say("You already know that spell."); return; }
      if (sb.classes && !sb.classes.includes(p.classId)) {
        this.say(`The ${sb.name} is written in a tongue your training cannot trace.`, "#c0a0a0");
        return;
      }
      if (p.level < sb.reqLevel) { this.say(`You need level ${sb.reqLevel} to comprehend it.`); return; }
      p.skills.push(sb.teaches);
      this.autoPlaceSkill(sb.teaches);
      p.bag.splice(idx, 1);
      this.say(`You study the ${sb.name} and learn ${SKILLS[sb.teaches].name}!`, "#7ddfff");
    }
  }

  // ---------- monster turn ----------

  endTurn() {
    const p = this.player;
    for (const id of Object.keys(p.cooldowns)) if (p.cooldowns[id] > 0) p.cooldowns[id]--;
    p.buffs = p.buffs.filter(b => --b.turns > 0);
    const map = this.getMap();
    if (map.kind === "dungeon") {
      for (const m of [...map.entities]) {
        if (m.type !== "monster" || m.hp <= 0) continue;
        if (m.stun > 0) { m.stun--; continue; }
        const d = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
        if (d > 7) continue;
        if (d === 1) { this.monsterAttack(m); if (this.dead) break; continue; }
        this.monsterStep(m);
      }
    }
    const e = this.eff();
    p.hp = Math.min(p.hp, e.maxHp);
    p.turnsSinceDamage++;
    if (map.kind === "town" && p.turnsSinceDamage % 10 === 0 && p.hp < e.maxHp) p.hp++;
  }

  monsterStep(m) {
    const p = this.player;
    const dx = Math.sign(p.x - m.x), dy = Math.sign(p.y - m.y);
    const primary = Math.abs(p.x - m.x) >= Math.abs(p.y - m.y) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    const sidestep = [[-dy, dx], [dy, -dx], [-dx, 0], [0, -dy]];
    for (const [sx, sy] of [...primary, ...sidestep]) {
      if (!sx && !sy) continue;
      const nx = m.x + sx, ny = m.y + sy;
      if (this.blocked(nx, ny)) continue;
      if (nx === p.x && ny === p.y) { m.facing = { dx: sx, dy: sy }; this.monsterAttack(m); return; }
      const occ = this.entityAt(nx, ny);
      if (occ && occ !== m && occ.type !== "item") continue;
      m.x = nx; m.y = ny;
      m.facing = { dx: sx, dy: sy };
      return;
    }
  }

  monsterAttack(m) {
    const p = this.player, e = this.eff();
    m.facing = { dx: Math.sign(p.x - m.x), dy: Math.sign(p.y - m.y) };
    let dmg = Math.max(1, rand1to(this.rng, m.dmg) - rand0to(this.rng, Math.max(0, e.def)));
    const E = m.element && m.element !== "none" ? ELEMENTS[m.element] : null;
    let burn = 0;
    if (E) burn = Math.max(0, E.bonus - 2 * this.resist(m.element));
    dmg += burn;
    p.hp -= dmg;
    p.turnsSinceDamage = 0;
    this.say(`${m.name} hits you for ${dmg}.`, "#ff9090");
    if (burn > 0) this.say(`The ${E.name.toLowerCase()} sears you for ${burn}!`, E.color);
    else if (E) this.say(`Your ward smothers the ${E.name.toLowerCase()}.`, "#7be07b");
    if (p.hp <= 0) this.die(m);
  }

  die(killer) {
    this.dead = true;
    this.player.hp = 0;
    this.say(`You have fallen to ${killer ? killer.name : "the dark"}...`, "#ff4040");
  }

  revive() {
    const p = this.player;
    this.dead = false;
    p.xp = Math.max(0, Math.round(p.xp * 0.9));
    p.mapKey = TOWN_KEY;
    const home = this.getMap(TOWN_KEY).spawn;
    p.x = home.x; p.y = home.y;
    this.getMap(TOWN_KEY);
    p.hp = Math.round(this.eff().maxHp * 0.5);
    p.mp = Math.round(this.eff().maxMp * 0.5);
    this.say("Innkeep Toma: 'You wake in the inn. Rest, then rise again.'", "#90ff90");
  }

  // ---------- save/load (pure data in, pure data out) ----------

  static SAVE_KEY = "roguerng-save-v1";
  static SAVE_VERSION = 1;

  toJSON() {
    return {
      version: Core.SAVE_VERSION, seed: this.seed, kills: this.kills,
      player: this.player,
      maps: [...this.maps.values()].map(m => ({
        key: m.key, kind: m.kind, mapId: m.mapId, tier: m.tier, arch: m.arch, element: m.element,
        grid: m.grid, entities: m.entities, stairs: m.stairs, spawn: m.spawn,
        monsterKinds: m.monsterKinds, w: m.w, h: m.h
      }))
    };
  }

  loadFrom(data) {
    if (!data || data.version !== Core.SAVE_VERSION) { this.say("Old or broken save ignored - start fresh."); return false; }
    let maxUid = 1;
    const bump = v => { if (typeof v === "number" && v > maxUid) maxUid = v; };
    for (const m of data.maps || []) for (const e of m.entities || []) { bump(e.uid); bump(e.item && e.item.uid); }
    bump(data.player && data.player.equipment && data.player.equipment.weapon?.uid);
    bump(data.kills);
    uid = maxUid + 1;
    this.seed = data.seed;
    this.kills = data.kills || 0;
    this.player = data.player;
    this.ensureHotbar();
    this.screen = "play";
    this.dead = false;
    this.maps = new Map((data.maps || []).map(m => [m.key, { ...m, floors: null }]));
    if (this.player && this.eff()) { /* derived stats recompute from attrs+gear */ }
    return true;
  }

  noteSighting(monsterId, element) {
    const p = this.player;
    const m = MONSTERS[monsterId];
    if (!m) return;
    if (!p.seen) p.seen = {};
    const s = p.seen[monsterId] || (p.seen[monsterId] = { n: 0, el: {} });
    const first = s.n === 0;
    const newEl = element && element !== "none" && !s.el[element];
    if (first || newEl) s.n++;
    if (newEl) s.el[element] = 1;
    else if (element && element !== "none") s.el[element]++;
    if (first) this.say(`Bestiary: ${m.name} recorded.`, "#7be07b");
  }

  bestiary() {
    const seen = this.player?.seen || {};
    const rows = Object.keys(MONSTERS).map(id => {
      const m = MONSTERS[id], s = seen[id];
      return { id, name: m.name, minTier: m.minTier, hp: m.hp, dmg: m.dmg, xp: m.xp, unique: !!m.unique,
        family: FAMILIES[id] || "monstrosity", seen: !!s, elements: s ? Object.keys(s.el) : [] };
    });
    return { rows: rows.sort((a, b) => a.minTier - b.minTier || a.name.localeCompare(b.name)),
      total: rows.length, seenCount: rows.filter(r => r.seen).length,
      combos: rows.length * Object.keys(ELEMENTS).length };
  }

  // ---------- read models ----------

  status() {
    if (!this.player) return { screen: "create" };
    const p = this.player, e = this.eff(), map = this.getMap(p.mapKey);
    return {
      screen: this.screen, dead: this.dead, kills: this.kills,
      player: {
        name: p.name, classId: p.classId, raceId: p.raceId, level: p.level, xp: p.xp, xpNeed: this.xpNeed(),
        hp: p.hp, mp: p.mp, gold: p.gold, x: p.x, y: p.y,
        attrs: { str: e.str, int: e.int, wis: e.wis, dex: e.dex, vit: e.vit },
        maxHp: e.maxHp, maxMp: e.maxMp, atk: e.atk, def: e.def,
        skills: p.skills.map(id => ({ id, name: SKILLS[id].name, cost: SKILLS[id].cost, cd: p.cooldowns[id] || 0, desc: SKILLS[id].desc })),
        equipment: { weapon: labelOrNull(p.equipment.weapon), armor: labelOrNull(p.equipment.armor), trinket: labelOrNull(p.equipment.trinket) },
        bag: p.bag.map(describeItem)
      },
      map: { key: map.key, name: map.name, kind: map.kind, tier: map.tier || 0, layout: map.arch !== undefined ? LAYOUT_NAMES_SHORT[map.arch] : "town",
        element: map.element || "none", elementName: ELEMENTS[map.element]?.name || null, elementColor: ELEMENTS[map.element]?.color || null },
      travel: {
        gateOpen: map.kind !== "dungeon", inTown: map.kind === "town", here: map.key,
        zones: Object.entries(MAPS).map(([id, m]) => ({
          id, name: m.name, unlockLevel: m.unlockLevel, tiers: m.tiers,
          unlocked: p.level >= m.unlockLevel, maxTier: Math.min(p.unlockedTiers[id] || 1, m.tiers)
        }))
      },
      quests: Object.entries(p.quests).map(([id, q]) => {
        const mapId = Object.keys(MAPS).find(mid => MAPS[mid].quest.id === id);
        return { id, name: MAPS[mapId].quest.itemName, progress: q.progress, need: MAPS[mapId].quest.need, done: q.done, turnedIn: q.turnedIn };
      }),
      log: this.log.slice(-8)
    };
  }

  entities() {
    const map = this.getMap(this.player.mapKey);
    const out = map.entities.filter(e => !(e.type === "monster" && e.hp <= 0)).map(e => {
      if (e.type === "monster") return { kind: "monster", uid: e.uid, monsterId: e.monsterId, isBoss: !!e.boss, glyph: e.glyph, color: e.color, icon: e.icon, element: e.element || "none", tint: ELEMENTS[e.element]?.tint ?? null, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, name: e.name, facing: e.facing || null };
      if (e.type === "item") return { kind: "item", glyph: e.item.glyph, color: e.item.color, icon: e.item.icon, x: e.x, y: e.y, name: itemLabel(e.item) };
      if (e.type === "npc") return { kind: "npc", npcId: e.npcId, glyph: e.glyph, color: e.color, icon: e.icon, x: e.x, y: e.y, name: e.name };
      if (e.type === "portal") return { kind: "portal", glyph: e.glyph, color: e.color, icon: e.icon, x: e.x, y: e.y, name: e.name };
      if (e.type === "entrance") return { kind: "entrance", glyph: e.glyph, color: e.color, icon: e.icon, x: e.x, y: e.y, name: e.name };
      if (e.type === "chest") return { kind: "chest", glyph: e.glyph, color: e.color, icon: null, x: e.x, y: e.y, locked: !!e.locked, name: e.locked ? "Locked chest" : "Chest" };
      if (e.type === "door") return { kind: "door", glyph: e.glyph, color: e.color, icon: "delapouite__door", x: e.x, y: e.y, locked: !!e.locked, name: e.locked ? "Locked strongroom door" : "Open doorway" };
      return null;
    }).filter(Boolean);
    if (map.stairs) out.push({ kind: "stairs", glyph: ">", color: "#ffd76a", icon: "delapouite__3d-stairs", x: map.stairs.x, y: map.stairs.y, name: "Stairs down" });
    return out;
  }

  // ---------- test/movement helpers ----------

  bfsStep(tx, ty) {
    const p = this.player, map = this.getMap(p.mapKey);
    const start = p.x + "," + p.y;
    const prev = new Map([[start, null]]);
    const queue = [[p.x, p.y]];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = nx + "," + ny;
        if (prev.has(k) || this.blocked(nx, ny)) continue;
        if (!(nx === tx && ny === ty)) {
          const occ = this.entityAt(nx, ny);
          if (occ && (occ.type === "npc" || occ.type === "portal" || occ.type === "chest" || occ.type === "door")) continue;
        }
        prev.set(k, cx + "," + cy);
        queue.push([nx, ny]);
      }
    }
    const goal = tx + "," + ty;
    if (!prev.has(goal)) return null;
    let cur = goal, first = null;
    while (cur && cur !== start) {
      const pKey = prev.get(cur);
      if (pKey === start) first = cur;
      cur = pKey;
    }
    if (first) { const [fx, fy] = first.split(",").map(Number); return { dx: fx - p.x, dy: fy - p.y }; }
    return { dx: 0, dy: 0 };
  }

  stepTowards(tx, ty) {
    const step = this.bfsStep(tx, ty);
    if (!step) return false;
    if (!step.dx && !step.dy) return false;
    return this.act({ type: "move", dx: step.dx, dy: step.dy });
  }

  monstersNear() {
    const map = this.getMap(this.player.mapKey);
    return map.entities.filter(e => e.type === "monster" && e.hp > 0).map(m => ({ id: m.uid, name: m.name, x: m.x, y: m.y, hp: m.hp, facing: m.facing || null }));
  }

  itemsOnMap() {
    const map = this.getMap(this.player.mapKey);
    return map.entities.filter(e => e.type === "item").map(i => ({ uid: i.uid, x: i.x, y: i.y, name: itemLabel(i.item) }));
  }

  stairsPos() {
    const map = this.getMap(this.player.mapKey);
    return map.stairs ? { x: map.stairs.x, y: map.stairs.y } : null;
  }

  layoutCount(mapId) {
    const set = new Set();
    const worldKey = (this.player ? this.player.worldSeed : 0) + ":" + mapId;
    for (let a = 0; a < 7; a++) {
      const { grid } = generateLayout(worldKey, 1, a);
      const joined = grid.join("");
      set.add(joined.length + ":" + joined.split(".").length);
    }
    return set.size;
  }
}

// ---------- item generation ----------

function starterWeapon(classId) {
  const byClass = {
    mage: { id: "staff", name: "Apprentice Staff", dmg: 3, icon: "delapouite__wizard-face" },
    cleric: { id: "sickle", name: "Ceremonial Sickle", dmg: 4, icon: "delapouite__cleaver" },
    barbarian: { id: "greataxe", name: "Heirloom Greataxe", dmg: 8, icon: "lorc__battle-axe" },
    druid: { id: "sickle", name: "Harvesting Sickle", dmg: 4, icon: "delapouite__cleaver" },
    bard: { id: "dagger", name: "Concert Razor", dmg: 3, icon: "delapouite__butterfly-knife" },
    monk: { id: "staff", name: "Training Quarterstaff", dmg: 3, icon: "delapouite__yin-yang" },
    sorcerer: { id: "dagger", name: "Blooded Knife", dmg: 3, icon: "delapouite__sparkles" }
  };
  const base = byClass[classId] || { id: "shortsword", name: "Worn Shortsword", dmg: 5, icon: "delapouite__ancient-sword" };
  return { uid: nextUid(), kind: "weapon", slot: "weapon", glyph: "/", color: "#d0d0e0", affixes: [], cursed: false, ...base };
}
function starterArmor(classId) {
  const byClass = {
    mage: { id: "robes", name: "Sage Robes", def: 1, icon: "lorc__robe" },
    cleric: { id: "leather", name: "Pilgrim Leathers", def: 2, icon: "delapouite__leather-armor" },
    barbarian: { id: "leather", name: "Wolfspelt Cloak", def: 2, icon: "delapouite__fur-shirt" },
    druid: { id: "leather", name: "Barkhide Vest", def: 2, icon: "delapouite__leather-armor" },
    bard: { id: "leather", name: "Traveling Silks", def: 2, icon: "delapouite__leather-armor" },
    monk: { id: "rags", name: "Wrapping Bandages", def: 1, icon: "delapouite__herbs-bundle" },
    sorcerer: { id: "robes", name: "Embroidered Silks", def: 1, icon: "lorc__robe" }
  };
  const base = { id: "leather", name: "Battered Leathers", def: 2, icon: "delapouite__leather-armor" };
  return { uid: nextUid(), kind: "armor", slot: "armor", glyph: "[", color: "#c0a070", affixes: [], cursed: false, ...(byClass[classId] || base) };
}
function makePotion() {
  return { uid: nextUid(), kind: "potion", name: "Red Potion", glyph: "!", color: "#ff6060", icon: "delapouite__health-potion", ident: true };
}
function makeScrollIdentify() {
  return { uid: nextUid(), kind: "scroll-identify", name: "Scroll of Identify", glyph: "?", color: "#e0e0ff", icon: "delapouite__spell-book", ident: true };
}
function makeManaPotion() {
  return { uid: nextUid(), kind: "potion", effect: "mana", name: "Blue Potion", glyph: "!", color: "#7090ff", icon: "delapouite__magic-potion", ident: true };
}
function makeKey() {
  return { uid: nextUid(), kind: "key", name: "Iron Key", glyph: "k", color: "#c0c0d0", icon: null, ident: true };
}

export function genItem(mapId, tier, rng, forceBlessed = false, classId = null) {
  const def = MAPS[mapId];
  const lootTier = Math.max(1, tier + (def ? def.lootShift : 0) + (rng() < 0.3 ? 1 : 0));
  const roll = rng();
    if (roll < 0.15 && !forceBlessed) {
    const books = Object.entries(SPELLBOOKS).filter(([, b]) => b.reqLevel <= Math.max(2, tier * 2));
    if (books.length) {
      const learnable = classId ? books.filter(([, b]) => !b.classes || b.classes.includes(classId)) : books;
      const pool = learnable.length && rng() < 0.8 ? learnable : books;
      const [bookId, b] = pool[Math.floor(rng() * pool.length)];
      return { uid: nextUid(), kind: "book", bookId, name: b.name, glyph: b.glyph, color: b.color, icon: b.icon, reqLevel: b.reqLevel };
    }
  }
  if (roll < 0.24 && !forceBlessed) return makeScrollIdentify();
  if (roll < 0.38 && !forceBlessed) return rng() < 0.6 ? makePotion() : makeManaPotion();

  const slotRoll = rng();
  let kind, base;
  const pickFrom = (list) => {
    const ok = list.filter(i => i.tier <= lootTier);
    const top = ok.slice(Math.max(0, ok.length - 3));
    return top[Math.floor(rng() * top.length)];
  };
  if (slotRoll < 0.4) { kind = "weapon"; base = { ...pickFrom(WEAPONS) }; base.dmg += Math.floor((lootTier - base.tier) / 3); }
  else if (slotRoll < 0.75) { kind = "armor"; base = { ...pickFrom(ARMORS) }; base.def += Math.floor((lootTier - base.tier) / 4); }
  else { kind = "trinket"; base = { ...pickFrom(TRINKETS) }; }

  const glyphs = { weapon: "/", armor: "[", trinket: "'" }, colors = { weapon: "#d0d0e0", armor: "#c0a070", trinket: "#e0c060" };
  const item = {
    uid: nextUid(), kind, slot: kind, id: base.id, name: base.name, dmg: base.dmg, def: base.def, tier: base.tier,
    glyph: glyphs[kind], color: colors[kind], icon: base.icon || null, affixes: [], cursed: false,
    ident: forceBlessed || rng() < 0.2
  };
  const cursed = !forceBlessed && rng() < 0.2;
  if (cursed) {
    item.cursed = true;
    item.color = "#d060a0";
    if (kind === "weapon") item.dmg += 2;
    if (kind === "armor") item.def += 2;
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const c = CURSES[Math.floor(rng() * CURSES.length)];
      item.affixes.push({ key: c.key, name: "Curse of " + c.name, value: -(1 + Math.floor(rng() * 3)) });
    }
  } else {
    const n = forceBlessed ? 2 : Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const b = BLESSINGS[Math.floor(rng() * BLESSINGS.length)];
      const el = Object.values(ELEMENTS).find(E => E.res === b.key);
      item.affixes.push({ key: b.key, name: el ? `${el.name} Resistance` : "Blessing of " + b.name, value: 1 + Math.floor(rng() * 3) });
    }
    // Themed floors favor drops that protect against their own danger.
    const E = ELEMENTS[floorElement(mapId, tier)];
    if (E && E.res && !item.affixes.some(a => a.key === E.res) && rng() < 0.45) {
      item.affixes.push({ key: E.res, name: `${E.name} Resistance`, value: 1 + Math.floor(rng() * 2) });
    }
  }
  return item;
}

export function itemWorth(it) {
  const affixSum = (it.affixes || []).reduce((s, a) => s + a.value, 0);
  const t = it.tier || 1;
  switch (it.kind) {
    case "potion": return it.effect === "mana" ? 20 : 15;
    case "key": return 25;
    case "scroll-identify": return 30;
    case "book": return 120 + (it.reqLevel || 1) * 20;
    case "weapon": return Math.max(8, Math.round(20 + it.dmg * it.dmg * 4 + t * 10 + affixSum * 10));
    case "armor": return Math.max(8, Math.round(25 + it.def * it.def * 6 + t * 12 + affixSum * 12));
    case "trinket": return Math.max(10, Math.round(15 + t * t * 6 + affixSum * 12));
    default: return 5;
  }
}

export function sellPrice(it) {
  const w = itemWorth(it);
  if (["weapon", "armor", "trinket"].includes(it.kind)) {
    if (it.ident === false) return Math.max(1, Math.round(w * 0.2));
    if (it.cursed) return Math.max(1, Math.round(w * 0.35));
    return Math.max(2, Math.round(w * 0.5));
  }
  return Math.max(1, Math.round(w * 0.5));
}

export const IDENT_SERVICE_PRICE = 25;

export function itemLabel(it) {
  if (!it) return "";
  if (it.ident === false) return `Unidentified ${it.name}?`;
  if (!it.affixes || !it.affixes.length) return it.name;
  const parts = it.affixes.map(a => `${a.value > 0 ? "+" : ""}${a.value} ${a.name}`);
  return `${it.name} (${parts.join(", ")})`;
}

function labelOrNull(it) { return it ? itemLabel(it) : null; }
function describeItem(it) {
  return { uid: it.uid, label: itemLabel(it), kind: it.kind, color: it.color, glyph: it.glyph, icon: it.icon || null, reqLevel: it.reqLevel || null, ident: it.ident !== false, sell: it.quest ? 0 : sellPrice(it) };
}

function rand1to(rng, n) { return 1 + Math.floor(rng() * Math.max(1, n)); }
function rand0to(rng, n) { return Math.floor(rng() * (n + 1)); }
function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function pick(rng, arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const LAYOUT_NAMES_SHORT = ["rooms", "rings", "caverns", "chessboard", "serpent", "gardens", "arena"];
