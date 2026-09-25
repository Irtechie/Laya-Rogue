// Town errand machine: every town-side Core.act() type (rest, quest turn-in,
// identify, equip, study, sell, buy) lives here as a strict priority list.
// The planner's "chores" task simply runs this until it reports done.

import { SKILLS, MAPS, SPELLBOOKS, SHOP, CLASSES } from "../data.js";
import { walkTo } from "./actions.js";
import { questTargets } from "./facts.js";
import { IDENT_PRICE, isRej } from "./state.js";

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

export function wantedBook(f) {
  for (const [id, sb] of Object.entries(SPELLBOOKS)) {
    if (f.p.skills.includes(sb.teaches)) continue;
    if (sb.classes && !sb.classes.includes(f.p.classId)) continue;
    if (f.p.level < (sb.reqLevel || 1)) continue;
    const shop = SHOP.find(s => s.key === "book:" + id);
    if (shop && f.gold >= shop.price + 80) return { key: shop.key, price: shop.price };
  }
  return null;
}

export function townErrand(f) {
  const npcAt = id => f.ents.find(e => e.kind === "npc" && e.npcId === id);
  const inn = npcAt("innkeep"), mer = npcAt("merchant"), sageN = npcAt("sage");

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
      if (near && f.gold >= 30 && !isRej("buy:scroll-identify")) return { act: { type: "buy", key: "scroll-identify" }, why: "errand:buy:scroll" };
      if (f.gold >= Math.max(IDENT_PRICE, 30)) {
        const act = walkTo(f, mer.x, mer.y, 2);
        return { act: act || { type: "wait" }, why: "errand:walk:merchant-ident" };
      }
    }
  }
  // 4. equip upgrades - mirror core.doEquip's class gate exactly, or the
  //    errand machine offers a longbow to a cleric every single tick
  const cls = CLASSES[f.p.classId] || {};
  const canUse = it =>
    !(it.kind === "weapon" && cls.weapons && !cls.weapons.includes(it.id)) &&
    !(it.kind === "armor" && cls.armors && !cls.armors.includes(it.id));
  for (const slot of ["weapon", "armor", "trinket"]) {
    const cur = f.p.equipment[slot];
    const best = f.bag.filter(i => i.slot === slot && i.ident !== false && canUse(i))
      .sort((a, b) => scoreGear(b) - scoreGear(a))[0];
    if (best && scoreGear(best) > scoreGear(cur || {})) {
      return { act: { type: "equip", uid: best.uid }, why: "errand:equip:" + slot };
    }
  }
  // 5. study books when learnable - and only at the book's level or the game
  //    spams "you need level N to comprehend it" every tick
  const sb = f.bag.find(i => i.kind === "book" && SPELLBOOKS[i.bookId] &&
    !f.p.skills.includes(SPELLBOOKS[i.bookId].teaches));
  if (sb && f.p.level >= ((SPELLBOOKS[sb.bookId] || {}).reqLevel || 1) && !isRej("useItem:" + sb.uid)) {
    return { act: { type: "useItem", uid: sb.uid }, why: "errand:study" };
  }
  // 5b. buy a spellbook we can actually learn from Ianna, if we can afford it
  const wb = wantedBook(f);
  if (wb) {
    const sage = npcAt("sage");
    if (sage) {
      if (f.man(sage.x, sage.y, f.p.x, f.p.y) <= 2 && !isRej("buy:" + wb.key)) return { act: { type: "buy", key: wb.key }, why: "errand:buy:book" };
      const act = walkTo(f, sage.x, sage.y, 2);
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
      if (near && !isRej("buy:potion") && f.gold >= 60) return { act: { type: "buy", key: "potion" }, why: "errand:buy:potion" };
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
