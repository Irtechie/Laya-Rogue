// Downloads free CC-BY game-icons SVGs and rasterizes them to white PNG
// silhouettes (tinted at runtime). Also paints procedural tile textures.
// Reruns are incremental. See assets/ATTRIBUTION.md for license terms.

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVG_DIR = path.join(ROOT, "assets", "svg");
const IMG_DIR = path.join(ROOT, "assets", "img");
const TEX_DIR = path.join(ROOT, "assets", "tex");
for (const d of [SVG_DIR, IMG_DIR, TEX_DIR]) fs.mkdirSync(d, { recursive: true });

export const ICONS = [
  "delapouite/rat", "delapouite/bat", "lorc/wolf-head", "caro-asercion/goblin",
  "skoll/skeleton", "carl-olsen/spider-face", "delapouite/ogre", "lorc/harpy",
  "lorc/ghost", "delapouite/elysium-shade", "skoll/troll", "delapouite/ice-golem",
  "lorc/minotaur", "lorc/raven", "lorc/imp", "sbed/lava", "delapouite/golem-head",
  "delapouite/butterfly-knife", "delapouite/cleaver", "delapouite/ancient-sword",
  "delapouite/flanged-mace", "delapouite/sword-brandish", "lorc/battle-axe",
  "delapouite/warhammer", "delapouite/swords-power", "delapouite/wizard-face",
  "delapouite/fur-shirt", "lorc/robe", "delapouite/leather-armor", "lorc/scale-mail",
  "delapouite/chest-armor", "delapouite/diamond-ring", "delapouite/double-necklace",
  "delapouite/feather-necklace", "delapouite/jewel-crown", "delapouite/health-potion",
  "delapouite/spell-book", "delapouite/herbs-bundle", "delapouite/glowing-artifact",
  "delapouite/coal-pile", "delapouite/beer-horn", "delapouite/dwarf-face",
  "delapouite/archer", "delapouite/miner", "lorc/portal", "delapouite/exit-door",
  "delapouite/3d-stairs", "delapouite/fencer", "delapouite/prayer-beads",
  "delapouite/character", "delapouite/elf-ear", "delapouite/dungeon-gate",
  "lorc/campfire", "delapouite/torch", "delapouite/door",
  "delapouite/magic-potion", "lorc/fairy-wand",
  // bestiary expansion candidates; unknown slugs are skipped, not fatal
  "delapouite/boar-head", "lorc/snake", "delapouite/snake", "lorc/owl", "delapouite/owl",
  "lorc/fairy", "delapouite/fairy", "lorc/mushroom", "delapouite/mushroom",
  "delapouite/sparkles", "lorc/gear", "delapouite/gear", "delapouite/crab",
  "delapouite/kraken", "lorc/tentacle", "delapouite/tentacle", "skoll/dead-head",
  "delapouite/helmet", "lorc/wings", "delapouite/wings", "skoll/lightning-bolt",
  "lorc/lightning-bolt", "delapouite/lightning-bolt", "lorc/evil-eye", "delapouite/eye",
  "lorc/fish", "delapouite/leaf", "lorc/leaf", "delapouite/beetle-shell",
  "delapouite/horse-head", "skoll/horse-head", "skoll/cat-head", "delapouite/cat-head",
  "lorc/beetle", "delapouite/bat-wing", "lorc/bat-wing", "delapouite/acorn",
  "lorc/frog", "delapouite/frog", "delapouite/fangs", "lorc/feather",
  "lorc/open-hand", "delapouite/open-hand", "lorc/hood", "delapouite/hood",
  "skoll/orc", "delapouite/orc", "lorc/orc", "lorc/gnome", "delapouite/gnome",
  "lorc/hobbit", "delapouite/hobbit", "delapouite/halfling", "lorc/halfling",
  "delapouite/yin-yang", "lorc/yin-yang", "delapouite/open-fist", "lorc/fist",
  "delapouite/glasses", "lorc/glasses", "lorc/wand", "delapouite/wand",
  // skill bar icons; unknown slugs are skipped, not fatal
  "sbed/regeneration", "delapouite/enrage", "lorc/axe-swing", "carl-olsen/flame",
  "delapouite/vibrating-shield", "willdabeast/chain-lightning", "delapouite/healing",
  "lorc/angel-wings", "delapouite/thor-hammer", "delapouite/templar-shield",
  "lorc/magic-palm", "lorc/holy-symbol", "delapouite/polar-star", "lorc/spiked-halo",
  "lorc/archery-target", "delapouite/vines", "lorc/targeting", "lorc/arrow-cluster",
  "delapouite/barrier", "lorc/sonic-shout", "lorc/quake-stomp", "lorc/tree-branch",
  "lorc/thorny-vine", "lorc/vine-flower", "lorc/curling-vines", "lorc/lightning-storm",
  "lorc/lyre", "delapouite/pan-flute", "lorc/sonic-screech", "delapouite/drum",
  "delapouite/musical-notes", "skoll/open-palm", "felbrigg/dodge", "lorc/whirlwind",
  "sbed/flamer", "lorc/bolt-shield", "delapouite/exploding-planet", "lorc/dragon-breath",
  "lorc/magnifying-glass", "lorc/ice-bolt"
];

function get(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + " -> " + res.statusCode)); }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

const downloaded = [];
const missing = [];
for (const icon of ICONS) {
  const svgPath = path.join(SVG_DIR, icon.replace("/", "__") + ".svg");
  if (!fs.existsSync(svgPath)) {
    const url = "https://raw.githubusercontent.com/game-icons/icons/master/" + icon + ".svg";
    try {
      fs.writeFileSync(svgPath, await get(url));
      downloaded.push(icon);
    } catch {
      fs.rmSync(svgPath, { force: true });
      missing.push(icon);
    }
  }
}
console.log("svg files:", ICONS.length - missing.length, "(newly downloaded", downloaded.length + ", skipped", missing.length + ")", missing.join(" ") || "");

// Rasterize all SVGs to white 128px PNGs in one browser pass.
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
let made = 0;
for (const icon of ICONS) {
  const svgPath = path.join(SVG_DIR, icon.replace("/", "__") + ".svg");
  const pngPath = path.join(IMG_DIR, icon.replace("/", "__") + ".png");
  if (fs.existsSync(pngPath) || !fs.existsSync(svgPath)) continue;
  let svg = fs.readFileSync(svgPath, "utf8");
  svg = svg.replace(/currentColor/g, "#ffffff").replace(/#000000/gi, "#ffffff");
  await page.setContent(`<body style="margin:0"><img id="i" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`);
  await page.waitForFunction(() => document.getElementById("i").complete);
  const dataUrl = await page.evaluate(() => {
    const img = document.getElementById("i");
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 128, 128);
    return c.toDataURL("image/png");
  });
  fs.writeFileSync(pngPath, Buffer.from(dataUrl.split(",")[1], "base64"));
  made++;
}
await browser.close();
console.log("pngs rendered:", made);

// Procedural tile textures (floors/walls per map theme).
function noisePng(file, seed, base, spec) {
  const S = 64;
  const png = new PNG({ width: S, height: S });
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const idx = (y * S + x) * 4;
    let r = base[0], g = base[1], b = base[2];
    const n = (rnd() - 0.5) * spec.grain;
    r += n; g += n; b += n;
    if (spec.grass && rnd() < spec.grass) { g += 26; r -= 6; b -= 12; }
    if (spec.grass && rnd() < 0.02) { r += 22; g += 6; b -= 24; }
    if (spec.plank && (y % 11 < 1)) { r *= 0.55; g *= 0.55; b *= 0.5; }
    if (spec.plank && rnd() < 0.03) { r *= 0.8; g *= 0.8; b *= 0.8; }
    if (spec.cracks && rnd() < spec.cracks) { r *= 0.6; g *= 0.6; b *= 0.6; }
    if (spec.moss && rnd() < spec.moss) { g += 30; r -= 10; }
    if (spec.edge && ((x % 16 < 1) || (y % 16 < 1))) { r *= 0.7; g *= 0.7; b *= 0.7; }
    png.data[idx] = Math.max(0, Math.min(255, r));
    png.data[idx + 1] = Math.max(0, Math.min(255, g));
    png.data[idx + 2] = Math.max(0, Math.min(255, b));
    png.data[idx + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}

const themes = {
  // Town floor is sunlit grass, not dungeon stone; town walls are warm timber.
  town:      { floor: [64, 92, 52], wall: [96, 72, 48] },
  greenhills:{ floor: [40, 56, 40], wall: [58, 66, 88] },
  darkfang:  { floor: [30, 34, 30], wall: [44, 40, 58] },
  ashfall:   { floor: [46, 36, 32], wall: [66, 42, 38] }
};
for (const [name, t] of Object.entries(themes)) {
  const isTown = name === "town";
  noisePng(path.join(TEX_DIR, `floor-${name}.png`), name.length * 7 + 3, t.floor,
    isTown ? { grain: 34, grass: 0.25, edge: false } : { grain: 26, cracks: 0.02, edge: true });
  noisePng(path.join(TEX_DIR, `wall-${name}.png`), name.length * 13 + 5, t.wall,
    isTown ? { grain: 18, plank: true, edge: true } : { grain: 22, cracks: 0.04, edge: true, moss: name === "greenhills" ? 0.03 : 0 });
}
console.log("textures painted:", Object.keys(themes).length * 2);
console.log("DONE");
