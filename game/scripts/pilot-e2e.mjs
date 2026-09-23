// End-to-end: headless Chromium runs RogueMS, LayA bridge drives the autopilot.
// Prestart the bridge (server.py) and this script serves the game itself.
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 4173;
const RUN_MS = Number(process.env.PILOT_RUN_MS || 45000);

const server = spawn(process.execPath, ["scripts/serve.mjs"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e).slice(0, 200)));

try {
  await page.goto(`http://127.0.0.1:${PORT}/?seed=1337`);
  await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 15000 });
  const bridge = await page.evaluate(async () => {
    try { return await (await fetch("http://127.0.0.1:8732/health")).json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  });
  console.log("bridge:", JSON.stringify(bridge));

  await page.evaluate(() => {
    window.game.create("mage", "human", "Layabot");
    window.game.travel("greenhills", 1);
  });
  await page.evaluate(() => window.layaPilot.setOn(true));

  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < RUN_MS) {
    await page.waitForTimeout(3000);
    samples.push(await page.evaluate(() => {
      const s = window.game.status();
      return {
        t: Math.round((Date.now() - performance.timeOrigin) / 1000),
        hp: s.player.hp + "/" + s.player.maxHp, mp: s.player.mp,
        x: s.player.x, y: s.player.y, map: s.map.key, kills: s.kills, dead: s.dead,
        decisions: window.layaPilot.decisions, fallbacks: window.layaPilot.fallbacks,
      panelBars: document.querySelectorAll("#layaIntents span[style*=width]").length,
      turn: window.layaPilot.last && window.layaPilot.last.via,
        last: window.layaPilot.last && {
          via: window.layaPilot.last.via,
          intent: window.layaPilot.last.decision && window.layaPilot.last.decision.intent,
          conf: window.layaPilot.last.decision && window.layaPilot.last.decision.confidence,
          action: window.layaPilot.last.action.type
        }
      };
    }));
  }
  for (const s of samples) console.log(JSON.stringify(s));
  await page.screenshot({ path: "shots/pilot-e2e.png" });
  console.log("pageerrors:", errors.length ? errors : "none");
  let stalls = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].x === samples[i - 1].x && samples[i].y === samples[i - 1].y &&
        samples[i].decisions > samples[i - 1].decisions + 5 && !samples[i].dead) stalls++;
  }
  const final = samples[samples.length - 1];
  console.log("RESULT:", JSON.stringify({
    bridgeOk: bridge.ok === true,
    decisions: final.decisions, fallbacks: final.fallbacks,
    kills: final.kills, dead: final.dead, moved: final.x + "," + final.y,
    map: final.map, panelBars: final.panelBars, stallWindows: stalls
  }));
} finally {
  await browser.close();
  server.kill();
}
