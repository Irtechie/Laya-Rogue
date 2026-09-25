// Bridge client: the ONLY network code in the agent. Each /decide call sends
// the serialized facts and gets back LayA's typed answers (intent choice,
// threat score, noul axes) from ONE forward pass of the local encoder.
// /event carries per-turn telemetry to the live dashboard. Failures are
// silent by design: no bridge -> pure reflex play, never a stall.

import { BRIDGE } from "./state.js";

export async function askBridge(state) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const res = await fetch(BRIDGE + "/decide", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }), signal: ctl.signal
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function sendTelemetry(evt) {
  fetch(BRIDGE + "/event", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(evt)
  }).catch(() => {});
}
