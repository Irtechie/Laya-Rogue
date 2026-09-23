import fs from "fs";
import { MONSTERS, MAPS, ELEMENTS, WARD_ITEMS, SHOP, SPELLBOOKS, WEAPONS, ARMORS, SKILLS } from "../src/data.js";

let bad = 0;
const fail = m => { console.log("FAIL:", m); bad++; };

const ids = Object.keys(MONSTERS);
console.log("species:", ids.length, "| combos:", ids.length * Object.keys(ELEMENTS).length);

const icons = new Set(fs.readdirSync("assets/img").map(f => f.replace(".png", "")));
for (const [id, m] of Object.entries(MONSTERS)) {
  if (!m.icon || !icons.has(m.icon)) fail(`icon missing for ${id}: ${m.icon}`);
  if (!m.name || !m.glyph || !m.color) fail(`fields missing: ${id}`);
  if (!Number.isFinite(m.hp) || !Number.isFinite(m.xp) || m.minTier < 1 || m.minTier > 12) fail(`stats: ${id}`);
}
for (const w of WARD_ITEMS) if (!icons.has(w.icon)) fail(`ward icon ${w.id}`);
for (const s of SHOP) {
  if (s.key.startsWith("weapon:")) { if (!WEAPONS.find(w => w.id === s.key.split(":")[1])) fail(`shop weapon ${s.key}`); }
  if (s.key.startsWith("armor:")) { if (!ARMORS.find(w => w.id === s.key.split(":")[1])) fail(`shop armor ${s.key}`); }
  if (s.key.startsWith("book:")) { const b = SPELLBOOKS[s.key.split(":")[1]]; if (!b || !SKILLS[b.teaches]) fail(`shop book ${s.key}`); }
}
for (const [mid, def] of Object.entries(MAPS)) {
  for (const m of def.monsters) if (!MONSTERS[m]) fail(`map ${mid} unknown species ${m}`);
}
const dup = new Map();
for (const [id, m] of Object.entries(MONSTERS)) {
  if (dup.has(m.name)) fail(`name collision ${m.name}: ${dup.get(m.name)} / ${id}`);
  dup.set(m.name, id);
}
const unused = ids.filter(id => !Object.values(MAPS).some(d => d.monsters.includes(id)));
console.log("species not in any pool:", unused.join(", ") || "none");
console.log(bad === 0 ? "ALL DATA CHECKS PASSED" : `${bad} problems`);
