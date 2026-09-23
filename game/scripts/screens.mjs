// Playwright screenshot pass: town, all three maps, creation screen, pack.
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "shots");
fs.mkdirSync(OUT, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const PORT = 4175;

const srv = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, ""));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", e => console.log("PAGEERROR:", e.message));
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 15000 });
await sleep(800);
await page.screenshot({ path: path.join(OUT, "01-creation.png") });

await page.evaluate(() => window.game.create("fighter", "dwarf", "Shot"));
await page.evaluate(() => { window.game.core.player.level = 10; });
await sleep(600);
await page.screenshot({ path: path.join(OUT, "02-town.png") });

await page.evaluate(() => {
  window.game.core.player.level = 10;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
});
await sleep(400);
await page.screenshot({ path: path.join(OUT, "07-waygates.png") });
await page.evaluate(() => { document.getElementById("travel").style.display = "none"; });

for (const [i, mapId] of ["greenhills", "darkfang", "ashfall"].entries()) {
  await page.evaluate(m => {
    const g = window.game;
    g.travel(m, 1);
    const mons = g.monsters();
    if (mons.length) g.stepTowards(mons[0].x, mons[0].y);
  }, mapId);
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, `0${i + 3}-${mapId}.png`) });
}

await page.evaluate(() => {
  window.game.travel("town");
  const inv = document.getElementById("inv");
  inv.classList.add("open");
  document.getElementById("doll").classList.add("open");
  window.game.afterAction();
});
await sleep(700);
await page.screenshot({ path: path.join(OUT, "06-pack-town.png") });

await page.evaluate(() => {
  const g = window.game;
  g.travel("greenhills", 2);
  const mons = g.monsters();
  for (const m of mons.slice(0, 6)) g.stepTowards(m.x, m.y);
});
await sleep(900);
await page.screenshot({ path: path.join(OUT, "08-creatures.png") });

await page.evaluate(() => {
  const g = window.game;
  g.toggleMap();
  const st = g.stairs();
  if (st) g.stepTowards(st.x, st.y);
});
await sleep(1100);
await page.screenshot({ path: path.join(OUT, "09-minimap-stairs.png") });

await browser.close();
srv.close();
console.log("shots written to", OUT);
