import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e).slice(0, 150)));
await p.goto("http://127.0.0.1:4173/");
await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 15000 });
const out = await p.evaluate(async () => {
  localStorage.removeItem("roguerng-save-v1");
  window.game.create("mage", "human", "ChainAll");
  window.game.travel("greenhills", 2);
  window.layaPilot.setOn(true);
  const core = window.game.core;
  core.player.gold = 400;
  core.player.hp = 4;
  const planSeq = [], whys = new Set();
  for (let i = 0; i < 400; i++) {
    await window.layaPilot.tick();
    const l = window.layaPilot.last;
    if (l) { whys.add(l.via.split(":").slice(0, 2).join(":"));
      const m = window.layaPilot.macroState().plan;
      const label = m ? m.source + ":" + m.steps[m.i].name : null;
      if (planSeq[planSeq.length - 1] !== label) planSeq.push(label); }
  }
  const p2 = core.player;
  return { planSequence: planSeq, finalMap: p2.mapKey, gold: p2.gold, hp: p2.hp + "/" + core.eff().maxHp,
    bagKinds: p2.bag.map(i => i.kind).join(","), skills: p2.skills.join(","),
    whyGroups: [...whys] };
});
console.log(JSON.stringify(out, null, 1));
console.log("pageerrors:", errs.length ? errs : "none");
await b.close();
