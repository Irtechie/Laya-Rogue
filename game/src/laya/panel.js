// In-game overlay: the model's full probability distribution for the current
// state, which intent won, which layer actually acted (laya / safety / plan /
// reflex), and the last 8 decisions. Press P to toggle.

import { macro, pilot } from "./state.js";

const INTENT_COLORS = { fight: "#ff7a5c", cast: "#c0a0ff", flee: "#ffd76a", heal: "#7dffa0", explore: "#7ddfff", loot: "#a0ffd8", descend: "#ffb060", ascend: "#d8c0a0", travel: "#80e0ff", errand: "#ffd7a0", wait: "#667" };

export function panel() {
  let el = document.getElementById("layaPanel");
  if (!el) {
    el = document.createElement("div");
    el.id = "layaPanel";
    el.style.cssText = "position:fixed;top:8px;right:8px;z-index:60;width:270px;" +
      "background:rgba(6,10,14,.92);border:1px solid #2c5;border-radius:8px;padding:10px 12px;" +
      "font:11px/1.45 monospace;color:#9fe;box-shadow:0 4px 18px rgba(0,0,0,.5);display:none;";
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<b style="color:#7dffa0;letter-spacing:1px">LayA DECISION MATRIX</b>' +
      '<button id="layaPause" style="font:10px monospace;background:#123;color:#9fe;border:1px solid #2c5;border-radius:4px;cursor:pointer;padding:1px 6px">pause</button></div>' +
      '<div id="layaMode" style="color:#ffd76a;margin-bottom:4px"></div><div id="layaIntents"></div>' +
      '<div id="layaAxes" style="margin-top:6px"></div>' +
      '<div id="layaNow" style="margin-top:6px;border-top:1px solid #234;padding-top:5px"></div>' +
      '<div id="layaHist" style="margin-top:5px;border-top:1px solid #234;padding-top:5px;color:#6a8"></div>';
    document.body.appendChild(el);
    document.getElementById("layaPause").addEventListener("click", () => pilot.setOn(false));
  }
  return el;
}

function bar(label, frac, color, extra, chosen) {
  const pct = Math.round(frac * 100);
  return '<div style="display:flex;align-items:center;gap:4px;margin:2px 0">' +
    '<span style="width:62px;color:' + (chosen ? "#fff" : "#8ab") + '">' + label + "</span>" +
    '<span style="flex:1;background:#123;height:9px;border-radius:3px;overflow:hidden">' +
    '<span style="display:block;height:100%;width:' + pct + "%;background:" + color + '"></span></span>' +
    '<span style="width:56px;text-align:right;color:' + (chosen ? "#fff" : "#8ab") + '">' + pct + "%" + (extra ? " " + extra : "") + "</span></div>";
}

export function renderPanel(info) {
  const el = panel();
  el.querySelector("#layaMode").textContent = macro.mode + "  " + macro.errand;
  const d = info.decision, a = d && d.probabilities;
  const box = el.querySelector("#layaIntents");
  if (a) {
    box.innerHTML = Object.entries(a).sort((x, y) => y[1] - x[1])
      .map(([k, v]) => bar(k, v, INTENT_COLORS[k] || "#888", "", k === d.intent)).join("");
    el.querySelector("#layaAxes").innerHTML =
      bar("threat", Math.min(1, d.threat / 3), "#ff7a5c", "(" + d.threat.toFixed(1) + ")", false) +
      bar("hp-crit", d.hpCritical, "#ff7a5c", "", false) +
      bar("can-kill", d.canKill, "#7dffa0", "", false) +
      bar("overmatch", d.overmatched, "#ffb060", "", false) +
      bar("objective", d.objectiveReachable, "#7ddfff", "", false) +
      bar("pack-tend", d.packNeedsTending, "#ffd7a0", "", false);
  } else {
    box.innerHTML = '<div style="color:#a86">' + (info.bridgeNote || "no bridge data") + "</div>";
    el.querySelector("#layaAxes").innerHTML = "";
  }
  el.querySelector("#layaNow").innerHTML =
    "action <b>" + info.actionLabel + "</b> via <span style='color:" +
    (info.via.startsWith("laya") ? "#7dffa0" : info.via.startsWith("safety") ? "#ffd76a" : "#8ab") + "'>" + info.via + "</span>" +
    (info.latency != null ? ' <span style="color:#6a8">' + info.latency + "ms</span>" : "") +
    '<br><span style="color:#6a8">laya ' + pilot.decisions + " &middot; fallback " + pilot.fallbacks +
    " &middot; " + info.kills + " kills &middot; lvl " + info.level + " &middot; " + info.gold + "g" +
    (info.dead ? " &middot; DEAD" : "") + "</span>";
  el.querySelector("#layaHist").innerHTML = pilot.history.slice(0, 8).map(h =>
    "<div>" + h.t + "s " + String(h.intent).padEnd(8).slice(0, 8) + (h.conf != null ? h.conf.toFixed(2) : "  -- ") + "&rarr; " + h.action + "</div>").join("");
}
