import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  fs.readFile(p.endsWith("index.html") || req.url === "/" ? path.join(ROOT, "index.html") : p, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
    res.end(d);
  });
}).listen(4176);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:4176/");
await page.waitForFunction(() => window.game && window.game.ready);
await page.evaluate(() => window.game.create("fighter", "dwarf", "Staircheck"));
await page.evaluate(() => window.game.travel("greenhills", 1));
for (let i = 0; i < 250; i++) {
  const done = await page.evaluate(() => {
    const g = window.game, st = g.stairs(), s = g.status();
    if (st && Math.abs(s.player.x - st.x) + Math.abs(s.player.y - st.y) <= 1) return true;
    if (st) g.stepTowards(st.x, st.y);
    return false;
  });
  if (done) break;
  await sleep(10);
}
await sleep(800);
await page.screenshot({ path: path.join(ROOT, "shots", "07-stairs.png") });
const mat = await page.evaluate(() => {
  const c = window.game.core, s = c.stairsPos();
  const ent = c.entities().find(e => e.kind === "stairs");
  return ent ? { icon: ent.icon, color: ent.color, near: Math.abs(s.x - c.player.x) + Math.abs(s.y - c.player.y) <= 1 } : null;
});
console.log("stairs entity:", JSON.stringify(mat));
await browser.close();
srv.close();
