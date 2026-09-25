// Entrance-circle regression: drop hero into an emptied max-tier dungeon and
// confirm the enter/exit loop is broken (they rest in town instead of circling).
import { chromium } from "playwright";
import { spawn } from "child_process";

const RUN_MS = Number(process.env.REPRO_MS || 90000);
const server = spawn(process.execPath, ["scripts/serve.mjs"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 200)));

try {
  await page.goto("http://127.0.0.1:4173/?seed=999&laya=1");
  await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 15000 });
  const maxTier = await page.evaluate(() => {
    window.game.create("cleric", "human", "CircleTest");
    window.game.travel("greenhills", 1);
    return window.game.core.status().travel.zones.find(z => z.id === "greenhills").tiers;
  });
  await page.waitForFunction(() => window.layaPilot && window.layaPilot.on, null, { timeout: 10000 });

  // simulate a fully-cleared seeded top tier: teleport + zero all monsters
  await page.evaluate((tier) => {
    const c = window.game.core;
    c.player.level = 10; c.player.unlockedTiers = { greenhills: tier };
    window.game.travel("greenhills", tier);
    const m = c.getMap(c.player.mapKey);
    m.entities.forEach(e => { if (e.type === "monster") e.hp = 0; });
  }, maxTier);

  let enters = 0, lastKey = "", settle = "";
  const t0 = Date.now();
  const perMap = {};
  while (Date.now() - t0 < RUN_MS) {
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => {
      const g = window.game.core;
      return { map: g.player.mapKey, pos: g.player.x + "," + g.player.y,
        decisions: window.layaPilot.decisions, via: window.layaPilot.last && window.layaPilot.last.via };
    });
    if (st.map !== lastKey) {
      if (/greenhills:d/.test(st.map)) enters++;
      perMap[st.map] = (perMap[st.map] || 0) + 1;
      lastKey = st.map;
    }
    settle = st.via || settle;
  }
  const mapChanges = Object.keys(perMap).length;
  console.log(JSON.stringify({ enters, mapChanges, perMap, settle,
    errors: errors.length ? errors : "none" }));
  console.log(mapChanges <= 6 ? "PASS: no runaway enter/exit circle" : "FAIL: still circling");
} finally {
  await browser.close();
  server.kill();
}
