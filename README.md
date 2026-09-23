# Laya-Rogue

RogueRNG (Three.js roguelike) driven by **LayA** — a non-autoregressive System-1
decision encoder (one forward pass, ~100 ms, calibrated typed judgments).
**No LLM calls anywhere**: LayA answers typed questions (choice / score / noul);
all action selection, event chains, and town economy logic is deterministic JS.

## Pieces

| part | role |
|---|---|
| `bridge/server.py` | stdlib HTTP bridge: loads the local `laya` checkpoint (CUDA), `/decide`, `/event` telemetry, `/stats`, `/decision/<rid>` payload archive, serves the dashboard |
| `bridge/matrix.py` | the decision matrix: 11-intent choice + threat score + 5 noul axes, one forward pass |
| `dashboard/index.html` | live dashboard: intent %, who-decided %, latency p50/p95, map-mapped %, timeline, clickable decision rows (exact input JSON + full typed response) |
| `game/` | RogueRNG checkout + `src/laya.js` (autopilot: facts, frontier exploration w/ visit memory, goal commitment + bump detection, event chains, town errand machine) and `scripts/macro-run.mjs` (long-run headless runner) |

## Run

```powershell
# 1. LayA bridge (needs the laya repo at e:\layaplayground + .models\english checkpoint)
e:\layaplayground\.venv\Scripts\python.exe bridge\server.py
# 2. Game
node game\scripts\serve.mjs        # http://localhost:4173
# 3. Dashboard (game embedded + live decision panels)
start http://localhost:8732
```

In-game: press **P** to toggle the autopilot, or open with `?laya=1` to autostart.
Long run: `PILOT_MINUTES=480 node game\scripts\macro-run.mjs` (logs JSONL to `runs/`).

Both servers bind `0.0.0.0` (LAN reachable); the bridge is unauthenticated — do not expose.

## How a turn works

1. `laya.js` packs game state as compact JSON (player, monsters, loot, errands, quests).
2. Bridge runs one LayA forward pass -> intent probabilities, threat score, 5 noul axes.
3. Deterministic policy composes a `Core.act()` action: safety layer > event-chain plan >
   confidence-gated LayA intent (validated against real facts) > reflex fallback.
4. Spatial memory (visited-tile frontier), goal commitment (abandon-on-no-progress),
   and chains (`hp-critical`, `bag-full`, `no-potions`, `quest-ready`, `locked-treasure`,
   `want-book`, `tier-cleared`, `laya-tending`) drive long-horizon behavior.

The checkpoint is near chance zero-shot; the dashboard's honesty table tracks when
`laya:*` has earned execution share. Fine-tuning (RLCD notebook upstream) is the path
to handing it more of the wheel.
