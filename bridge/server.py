"""HTTP bridge between the RogueRNG client and the local LayA checkpoint,
plus a telemetry store that powers the live dashboard.

Stdlib-only; runs in the layaplayground venv.

    e:\layaplayground\.venv\Scripts\python.exe E:\roguems-laya\bridge\server.py

Endpoints:
    GET  /          -> the live dashboard (dashboard/index.html)
    GET  /health    -> {ok, device, model, lastLatencyMs}
    GET  /schema    -> the typed-question decision matrix
    GET  /stats     -> aggregated telemetry JSON for the dashboard
    POST /decide    -> {state, questions?} -> {decision, answers, latencyMs}
    POST /event     -> per-turn telemetry from the game client
"""
import json
import os
import sys
import threading
import time
from collections import Counter, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LAYA_REPO = os.environ.get("LAYA_REPO", r"e:\layaplayground")
LAYA_MODEL = os.environ.get("LAYA_MODEL", r"E:\layaplayground\.models\english")
DASHBOARD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboard", "index.html")
EVENTS_LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "runs", "events.jsonl")
HOST = os.environ.get("LAYA_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("LAYA_BRIDGE_PORT", "8732"))

sys.path.insert(0, LAYA_REPO)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from laya import Agent  # noqa: E402
from matrix import GAME_QUESTIONS, matrix_result  # noqa: E402

AGENT = None
LAST_LATENCY_MS = None

LOCK = threading.Lock()
EVENTS = deque(maxlen=4000)          # per-turn telemetry from the client
DECIDE_LOG = deque(maxlen=500)       # bridge-side latencies
DECISIONS = {}                       # rid -> {at, state, answers, decision, ms} (bounded)
RID = [0]
STARTED = time.time()


def get_agent():
    global AGENT
    if AGENT is None:
        AGENT = Agent(LAYA_MODEL)
        AGENT.predict({"note": "warmup"}, {
            "warm": {"type": "noul", "instructions": "Is this a warmup probe?"}})
    return AGENT


def pct(part, whole):
    return round(100.0 * part / whole, 1) if whole else 0.0


def pctl(sorted_vals, q):
    if not sorted_vals:
        return None
    idx = min(len(sorted_vals) - 1, int(q * len(sorted_vals)))
    return sorted_vals[idx]


def stats():
    with LOCK:
        ev = list(EVENTS)
    n = len(ev)
    with_intent = [e for e in ev if e.get("intent")]
    via_group = Counter()
    for e in ev:
        via = e.get("via", "?")
        via_group[via.split(":")[0]] += 1
    intent_counts = Counter(e["intent"] for e in with_intent)
    intent_executed = Counter(e["intent"] for e in with_intent if e.get("via", "").startswith("laya"))
    intent_conf = {}
    for intent, cnt in intent_counts.items():
        vals = [e["conf"] for e in with_intent if e["intent"] == intent and e.get("conf") is not None]
        intent_conf[intent] = round(sum(vals) / len(vals), 3) if vals else None
    lat = sorted(v for v in DECIDE_LOG if v is not None)
    latest = ev[-1] if ev else None
    timeline = ev[:: max(1, n // 120)] if n else []
    modes, prev = [], None
    for e in ev:
        if e.get("mode") != prev:
            modes.append({"t": e.get("t"), "mode": e.get("mode"), "via": e.get("via")})
            prev = e.get("mode")
    return {
        "now": time.time(), "bridgeUptimeS": round(time.time() - STARTED),
        "events": n,
        "lastEventAgeS": round(time.time() - ev[-1]["_recv"]) if ev else None,
        "latest": latest,
        "turns": {"withIntent": len(with_intent), "macroOnly": n - len(with_intent)},
        "intentPct": {k: pct(v, len(with_intent)) for k, v in intent_counts.items()},
        "intentCounts": dict(intent_counts),
        "intentExecuted": dict(intent_executed),
        "intentAvgConf": intent_conf,
        "viaPct": {k: pct(v, n) for k, v in via_group.items()},
        "viaCounts": dict(via_group),
        "bridge": {"calls": len(lat), "p50Ms": pctl(lat, 0.50), "p95Ms": pctl(lat, 0.95),
                   "maxMs": lat[-1] if lat else None},
        "timeline": [{"t": e.get("t"), "hp": e.get("hp"), "hpRatio": e.get("hpRatio"),
                      "gold": e.get("gold"), "kills": e.get("kills"), "level": e.get("level"),
                      "mode": e.get("mode")} for e in timeline],
        "modeChanges": modes[-25:],
        "recent": ev[-30:][::-1] if ev else [],
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload, ctype="application/json"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        if self.path in ("/", "/dashboard"):
            try:
                with open(DASHBOARD, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            except OSError as e:
                self._send(500, {"error": str(e)})
        elif self.path == "/health":
            agent = get_agent()
            self._send(200, {"ok": True, "model": LAYA_MODEL,
                             "device": str(agent.device), "lastLatencyMs": LAST_LATENCY_MS})
        elif self.path == "/schema":
            self._send(200, GAME_QUESTIONS)
        elif self.path == "/stats":
            self._send(200, stats())
        elif self.path.startswith("/decision"):
            rid = self.path.rpartition("/")[2]
            try:
                rid = int(rid)
            except ValueError:
                self._send(400, {"error": "usage: /decision/<rid>"})
                return
            with LOCK:
                rec = DECISIONS.get(rid)
            self._send(200 if rec else 404, rec or {"error": "archived (keep last 400)"})
        else:
            self._send(404, {"error": "unknown path"})

    def do_POST(self):
        global LAST_LATENCY_MS
        try:
            length = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError) as e:
            self._send(400, {"error": "bad json: %s" % e})
            return

        if self.path == "/decide":
            try:
                state = req["state"]
                questions = req.get("questions") or GAME_QUESTIONS
                agent = get_agent()
                t0 = time.perf_counter()
                result = agent.predict(state, questions)
                ms = round((time.perf_counter() - t0) * 1000, 1)
                LAST_LATENCY_MS = ms
                with LOCK:
                    DECIDE_LOG.append(ms)
                    RID[0] += 1
                    rid = RID[0]
                    DECISIONS[rid] = {"rid": rid, "state": state, "answers": result["answers"],
                                      "decision": matrix_result(result["answers"]), "ms": ms}
                    while len(DECISIONS) > 400:
                        DECISIONS.pop(min(DECISIONS))
                self._send(200, {"decision": matrix_result(result["answers"]),
                                 "answers": result["answers"], "model": result["model"],
                                 "rid": rid, "latencyMs": ms})
            except (KeyError, ValueError) as e:
                self._send(400, {"error": "bad request: %s" % e})
            except Exception as e:
                self._send(500, {"error": "%s: %s" % (type(e).__name__, e)})
        elif self.path == "/event":
            req["_recv"] = time.time()
            with LOCK:
                EVENTS.append(req)
                if len(EVENTS) % 50 == 0:
                    try:
                        os.makedirs(os.path.dirname(EVENTS_LOG), exist_ok=True)
                        if os.path.exists(EVENTS_LOG) and os.path.getsize(EVENTS_LOG) > 10_000_000:
                            os.replace(EVENTS_LOG, EVENTS_LOG + ".1")  # rotate, keep one old file
                        with open(EVENTS_LOG, "a") as f:
                            f.write(json.dumps(req) + "\n")
                    except OSError:
                        pass
            self._send(200, {"ok": True})
        elif self.path == "/reset":
            # start a clean run: clear in-memory telemetry, archive the event log
            with LOCK:
                EVENTS.clear()
                DECISIONS.clear()
                DECIDE_LOG.clear()
                LAST_LATENCY_MS = None
            try:
                if os.path.exists(EVENTS_LOG):
                    os.replace(EVENTS_LOG, EVENTS_LOG.replace(".jsonl", "-%d.jsonl" % int(time.time())))
                import glob
                archives = sorted(glob.glob(EVENTS_LOG.replace("events.jsonl", "events-*.jsonl")))
                for old in archives[:-5]:  # keep the five most recent runs
                    os.remove(old)
            except OSError:
                pass
            self._send(200, {"ok": True, "reset": True})
        else:
            self._send(404, {"error": "unknown path"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    print("Loading LayA checkpoint from %s ..." % LAYA_MODEL, flush=True)
    get_agent()
    print("Bridge ready on http://%s:%d (device=%s, dashboard at /)" % (HOST, PORT, AGENT.device), flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
