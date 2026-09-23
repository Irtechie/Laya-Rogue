import { readFileSync, writeFileSync } from "fs";

const ICONS = {
  "power-strike": "delapouite__sword-brandish",
  "second-wind": "sbed__regeneration",
  "berserk": "delapouite__enrage",
  "cleave": "lorc__axe-swing",
  "firebolt": "carl-olsen__flame",
  "identify": "lorc__magnifying-glass",
  "frost-shock": "lorc__ice-bolt",
  "arcane-barrier": "delapouite__vibrating-shield",
  "chain-lightning": "willdabeast__chain-lightning",
  "heal": "delapouite__healing",
  "blessing": "lorc__angel-wings",
  "smite": "delapouite__thor-hammer",
  "divine-shield": "delapouite__templar-shield",
  "backstab": "delapouite__butterfly-knife",
  "plunder": "delapouite__jewel-crown",
  "escape": "delapouite__exit-door",
  "lay-on-hands": "lorc__magic-palm",
  "holy-smite": "lorc__holy-symbol",
  "divine-favor": "delapouite__polar-star",
  "aura-of-courage": "lorc__spiked-halo",
  "aimed-shot": "lorc__archery-target",
  "natures-whisper": "delapouite__vines",
  "hunters-mark": "lorc__targeting",
  "volley": "lorc__arrow-cluster",
  "elemental-ward": "delapouite__barrier",
  "warcry": "lorc__sonic-shout",
  "seismic-slam": "lorc__quake-stomp",
  "barkskin": "lorc__tree-branch",
  "summon-thorns": "lorc__thorny-vine",
  "verdant-mend": "lorc__vine-flower",
  "entangle": "lorc__curling-vines",
  "storm-call": "lorc__lightning-storm",
  "inspire": "lorc__lyre",
  "lullaby": "delapouite__pan-flute",
  "discord": "lorc__sonic-screech",
  "martial-cadence": "delapouite__drum",
  "crescendo": "delapouite__musical-notes",
  "flurry": "lorc__fist",
  "ki-mend": "delapouite__yin-yang",
  "stun-palm": "skoll__open-palm",
  "evasion": "felbrigg__dodge",
  "whirlwind": "lorc__whirlwind",
  "scorcher": "sbed__flamer",
  "spell-ward": "lorc__bolt-shield",
  "wild-surge": "delapouite__exploding-planet",
  "dragon-breath": "lorc__dragon-breath"
};

import fs from "fs";
const have = new Set(fs.readdirSync("assets/img").filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));
const missing = Object.values(ICONS).filter(i => !have.has(i));
if (missing.length) { console.log("MISSING ICON FILES:", missing); process.exit(1); }

let src = readFileSync("src/data.js", "utf8");
const lines = src.split("\n");
const seen = new Set();
let patched = 0;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*"([a-z-]+)":\s*\{/);
  if (!m || !(m[1] in ICONS) || !lines[i].includes("desc:")) continue;
  const id = m[1];
  if (seen.has(id)) continue; // first occurrence = SKILLS block
  seen.add(id);
  if (/icon:\s*"/.test(lines[i])) { console.log("already had icon:", id); continue; }
  lines[i] = lines[i].replace(/\s*desc:/, ` icon: "${ICONS[id]}", desc:`);
  patched++;
}
const unmapped = Object.keys(ICONS).filter(id => !seen.has(id));
if (unmapped.length) console.log("IDS NOT FOUND:", unmapped);
src = lines.join("\n");
writeFileSync("src/data.js", src);
console.log("patched", patched, "skills; unmapped:", unmapped.length);
