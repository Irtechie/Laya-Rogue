// Long-run macro runner: drives RogueRNG headless with the LayA autopilot
// for hours, logs JSONL, summarizes periodically, self-heals stalls/reloads.
//
//   node scripts/macro-run.mjs                (default 10 minutes)
//   PILOT_MINUTES=480 node scripts/macro-run.mjs
//
// The LayA bridge (port 8732) must be running. The game server is started
// here only if nothing already serves port 4173.
import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const PORT = 4173;
const MINUTES = Number(process.env.PILOT_MINUTES || 10);
const CLASS = process.env.PILOT_CLASS || "mage";
const RACE = process.env.PILOT_RACE || "human";
const RUNS = path.resolve("E:/roguems-laya/runs");
fs.mkdirSync(RUNS, { recursive: true });
const logPath = path.join(RUNS, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
const log = fs.createWriteStream(logPath);
console.log("logging to", logPath);

async function portAlive() {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/`); return r.ok; } catch { return false; }
}
let server = null;
if (!(await portAlive())) {
  server = spawn(process.execPath, ["scripts/serve.mjs"], { stdio: "ignore", cwd: path.resolve("E:/roguems-laya/game") });
  await new Promise(r => setTimeout(r, 1200));
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on("pageerror", e => log.write(JSON.stringify({ ev: "pageerror", msg: String(e).slice(0, 300), at: Date.now() }) + "\n"));

async function startOrResume() {
  await page.goto(`http://127.0.0.1:${PORT}/?seed=${Math.floor(Math.random() * 1e6)}&laya=1`);
  await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 20000 });
  await page.evaluate(([c, r]) => {
    if (!window.game.core.player) window.game.create(c, r, "Macro" + Math.floor(Math.random() * 999));
    window.layaPilot.setOn(true);
  }, [CLASS, RACE]);
}
await startOrResume();

let lastX = "", lastPosChange = Date.now(), reloads = 0, unsticks = 0;
const t0 = Date.now();
const deadline = t0 + MINUTES * 60000;

while (Date.now() < deadline) {
  await page.waitForTimeout(20000);
  let snap;
  try {
    snap = await page.evaluate(() => {
      const s = window.game.status();
      const m = window.layaPilot.macroState();
      return {
        on: window.layaPilot.on, decisions: window.layaPilot.decisions, fallbacks: window.layaPilot.fallbacks,
        deaths: window.layaPilot.deaths, dead: s.dead, level: s.player.level, kills: s.kills,
        gold: s.player.gold, hp: s.player.hp, map: s.map.key, x: s.player.x, y: s.player.y,
        mode: m.mode, errand: m.errand, stuckTicks: m.stuckTicks
      };
    });
  } catch (e) {
    console.log(new Date().toISOString(), "page lost, reloading:", e.message.slice(0, 80));
    await startOrResume(); reloads++;
    continue;
  }
  const stats = await fetch("http://127.0.0.1:8732/stats").then(r => r.json()).catch(() => null);
  const rec = { ev: "sample", at: Date.now(), min: Math.round((Date.now() - t0) / 60000), ...snap,
    intentPct: stats && stats.intentPct, viaPct: stats && stats.viaPct, p50: stats && stats.bridge.p50Ms };
  log.write(JSON.stringify(rec) + "\n");
  console.log(`[${rec.min}m] lvl${snap.level} hp${snap.hp} ${snap.map} ${snap.mode} (${snap.errand}) k:${snap.kills} g:${snap.gold} d:${snap.deaths} laya:${snap.decisions} fb:${snap.fallbacks}` +
    (stats ? ` p50:${stats.bridge.p50Ms}ms top:${Object.entries(stats.intentPct || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "-"}` : ""));

  if (snap.x !== undefined && (snap.x !== lastX || snap.map)) { lastX = snap.x; lastPosChange = Date.now(); }
  if (Date.now() - lastPosChange > 90000) {
    console.log("watchdog: 90s no movement -> emergency unstuck");
    await page.evaluate(() => window.layaPilot.emergencyUnstuck()).catch(() => {});
    unsticks++; lastPosChange = Date.now();
  }
}

const finalStats = await fetch("http://127.0.0.1:8732/stats").then(r => r.json()).catch(() => null);
if (finalStats) log.write(JSON.stringify({ ev: "final-stats", stats: { intentPct: finalStats.intentPct, viaPct: finalStats.viaPct, bridge: finalStats.bridge, events: finalStats.events } }) + "\n");
console.log("FINAL:", JSON.stringify(finalStats && { events: finalStats.events, intentPct: finalStats.intentPct, viaPct: finalStats.viaPct, bridge: finalStats.bridge }));
console.log(`reloads: ${reloads}, watchdog unsticks: ${unsticks}`);
log.end();
await browser.close();
if (server) server.kill();
