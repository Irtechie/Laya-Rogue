// Hardening verification: pause/resume via postMessage + chip + supervisor field exists.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push("PAGEERROR " + String(e).slice(0, 200)));

try {
  await page.goto("http://127.0.0.1:4173/?seed=4242&laya=1");
  await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: 15000 });
  await page.evaluate(() => {
    if (!window.game.core.player) window.game.create("mage", "human", "HardTest");
    if (window.game.core.screen === "play") window.game.travel("greenhills", 1);
  });
  await page.waitForFunction(() => window.layaPilot && window.layaPilot.on, null, { timeout: 10000 });
  await page.waitForTimeout(8000);

  const d1 = await page.evaluate(() => window.layaPilot.decisions);
  await page.evaluate(() => window.postMessage("laya-toggle", "*")); // pause
  await page.waitForTimeout(2000);
  const chipVisible = await page.evaluate(() => {
    const c = document.getElementById("layaChip");
    return !!c && c.style.display !== "none";
  });
  await page.waitForTimeout(5000);
  const d2 = await page.evaluate(() => window.layaPilot.decisions);

  await page.evaluate(() => window.postMessage("laya-toggle", "*")); // resume
  await page.waitForTimeout(6000);
  const d3 = await page.evaluate(() => window.layaPilot.decisions);
  const chipHidden = await page.evaluate(() => {
    const c = document.getElementById("layaChip");
    return !c || c.style.display === "none";
  });

  console.log(JSON.stringify({
    running: d1 > 5,
    pausedNoProgress: d2 - d1 <= 2,
    chipOnPause: chipVisible,
    resumed: d3 - d2 > 5,
    chipHiddenOnResume: chipHidden,
    d1, d2, d3
  }));

  // dashboard parent: P keydown forwards a toggle to the iframe
  const dash = await browser.newPage();
  dash.on("pageerror", e => errors.push("DASH " + String(e).slice(0, 150)));
  await dash.goto("http://127.0.0.1:8732/");
  await dash.waitForTimeout(2500);
  const before = await dash.evaluate(() =>
    document.getElementById("gameFrame").contentWindow.layaPilot.on);
  await dash.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" })));
  await dash.waitForTimeout(1500);
  const after = await dash.evaluate(() =>
    document.getElementById("gameFrame").contentWindow.layaPilot.on);
  await dash.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" })));
  await dash.waitForTimeout(1500);
  const back = await dash.evaluate(() =>
    document.getElementById("gameFrame").contentWindow.layaPilot.on);
  console.log(JSON.stringify({ dashPForwardToggles: before === true && after === false && back === true }));
  console.log("pageerrors:", errors.length ? errors : "none");
} finally {
  await browser.close();
}
