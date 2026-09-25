// Repro harness: long headless run with full console/error capture + stall detection.
import { chromium } from "playwright";
import { spawn } from "child_process";

const PORT = 4174;
const RUN_MS = Number(process.env.REPRO_MS || 180000);

const server = spawn(process.execPath, ["scripts/serve.mjs"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR " + String(e).slice(0, 300)));
page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE " + m.text().slice(0, 200)); });
page.on("crash", () => errors.push("PAGE CRASH"));

// serve.mjs is hardcoded to 4173; if the user's server owns it, just use it
const net = await import("net");
const reachable = await new Promise(res => {
  const s = net.connect(4173, "127.0.0.1", () => { s.end(); res(true); });
  s.on("error", () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 2000);
});
if (!reachable) { console.log("game server not reachable on 4173"); process.exit(1); }

try {
  await page.goto("http://127.0.0.1:4173/?seed=777&laya=1");
  await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 15000 });
  await page.evaluate(() => {
    if (window.game.core.screen !== "play") {
      const b = [...document.querySelectorAll("button")].find(x => /continue|begin/i.test(x.textContent));
      if (b) b.click();
    }
    window.game.create && !window.game.core.player && window.game.create("mage", "human", "Repro");
    window.game.travel && window.game.travel("greenhills", 1);
  });

  let lastSeen = -1, stalledFor = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < RUN_MS) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const g = window.game;
      return {
        t: Math.round(performance.now() / 1000),
        screen: g && g.core ? g.core.screen : "?",
        map: g && g.core && g.core.player ? g.core.player.mapKey : "?",
        pos: g && g.core.player ? g.core.player.x + "," + g.core.player.y : "?",
        decisions: window.layaPilot ? window.layaPilot.decisions : -1,
        on: window.layaPilot ? window.layaPilot.on : false,
        via: window.layaPilot && window.layaPilot.last ? window.layaPilot.last.via : null,
        kills: g && g.core ? g.core.status().kills : -1,
        tickError: window.layaPilot ? window.layaPilot.tickError : null,
        plan: window.layaPilot ? JSON.stringify(window.layaPilot.macroState().plan) : null
      };
    }).catch(e => ({ evaluateFailed: String(e).slice(0, 120) }));
    console.log(JSON.stringify(st));
    if (st.evaluateFailed) { errors.push("EVAL FAIL " + st.evaluateFailed); break; }
    if (st.screen !== "play") errors.push("SCREEN left play: " + st.screen);
    if (st.decisions === lastSeen && st.on) { stalledFor += 5; } else { stalledFor = 0; lastSeen = st.decisions; }
    if (stalledFor >= 20) { errors.push("STALL: decisions frozen " + stalledFor + "s while pilot.on=true"); break; }
    if (!st.on) errors.push("PILOT OFF (paused?) at decisions=" + st.decisions);
  }
  console.log("errors:", errors.length ? errors : "none");
} finally {
  await browser.close();
  server.kill();
}
