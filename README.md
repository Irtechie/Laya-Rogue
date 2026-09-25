# Laya-Rogue

RogueRNG (Three.js roguelike) driven by **LayA** — a non-autoregressive System-1
decision encoder (one forward pass, ~100 ms, calibrated typed judgments).
**No LLM calls anywhere**: LayA answers typed questions (choice / score / noul);
all action selection, planning, and town economy logic is deterministic JS.

## Pieces

| part | role |
|---|---|
| `bridge/server.py` | stdlib HTTP bridge: loads the local `laya` checkpoint (CUDA), `/decide`, `/event` telemetry, `/stats`, `/decision/<rid>` payload archive, serves the dashboard |
| `bridge/matrix.py` | the decision matrix: 11-intent choice + threat score + 5 noul axes, one forward pass |
| `dashboard/index.html` | live dashboard: intent %, who-decided %, latency p50/p95, map-mapped %, timeline, clickable decision rows (exact input JSON + full typed response) |
| `game/` | RogueRNG checkout + `src/laya.js` autopilot (split below) + `scripts/macro-run.mjs` long-run headless runner |

## The decision engine (`game/src/laya/`)

One module per concern — read them in this order for a 5-10 minute tour:

| # | file | the one question it answers |
|---|---|---|
| 1 | `state.js` | where does mutable agent state live? (pilot memory + macro working memory) |
| 2 | `facts.js` | how does the game become a structured object / bridge JSON? (perception) |
| 3 | `actions.js` | what are the agent's hands & feet? (step toward / attack / heal / flee) |
| 4 | `memory.js` | how does it not get lost? (visited-tile frontier, goal commitment) |
| 5 | `town.js` | every town-side verb as a priority errand list (rest/quest/identify/sell/buy) |
| 6 | `planner.js` | **HTN goals -> merged shared task plan** (long-horizon behavior) |
| 7 | `policy.js` | the per-tick arbiter: safety > plan > LayA intent > reflex |
| 8 | `bridge.js` | the only network code (`/decide`, `/event`; fails silent) |
| 9 | `panel.js` | in-game overlay of the model's mind |
| — | `src/laya.js` | the tick loop, watchdog, telemetry, key bindings |

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

1. `facts.js` packs game state as compact JSON (player, monsters, loot, errands, quests).
2. Bridge runs one LayA forward pass -> intent probabilities, threat score, 5 noul axes.
3. `planner.js` (HTN): weighted goal triggers (`recover`, `deeper`, `turnin`, `unpack`,
   `resupply`, `tending`, `haveKey`, `study`) each name a method — an ordered primitive-task
   list. All active goals **merge into one plan**: shared subtasks run once, the terminal
   "resume dive" task is hoisted to the end. Bag-full + out-of-potions + locked-chest
   becomes ONE town trip, not three round trips.
4. `policy.js` composes the `Core.act()` action: safety layer > current plan task >
   confidence-gated LayA intent (validated against real facts) > reflex fallback.

The checkpoint is near chance zero-shot; the dashboard's honesty table tracks when
`laya:*` has earned execution share. Fine-tuning (RLCD notebook upstream) is the path
to handing it more of the wheel. LayA's noul axes already steer the planner as soft
gates (`packNeedsTending > 0.75` arms the `tending` goal).
