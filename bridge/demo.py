"""One API call -> the full typed decision matrix, printed.

This is the Jev demo pattern, local and offline: pass the unstructured game
state + the typed questions, and the encoder answers ALL of them in ONE
forward pass (~100 ms on GPU). No text to parse, no hallucinated JSON - just
typed results with probabilities you can gate your code on.

    python bridge\demo.py            # demo state vs bridge
    python bridge\demo.py my.json    # any state file through /decide
"""
import json
import sys
import urllib.request

BRIDGE = "http://127.0.0.1:8732"

DEMO_STATE = {
    "scene": "dungeon crypts tier 2, flooded vault",
    "player": {
        "class": "mage", "level": 4,
        "hp": 11, "maxHp": 42, "mp": 18, "maxMp": 24, "atk": 6, "def": 3,
        "potions": 1, "gold": 130, "packUsed": 14,
        "skills": [
            {"name": "Magic Bolt", "cost": 4, "ready": True, "desc": "ranged attack spell"},
            {"name": "Heal", "cost": 6, "ready": True, "desc": "restore health"},
        ],
    },
    "monsters": [
        {"name": "ghoul", "hp": 22, "maxHp": 22, "dist": 1, "boss": False},
        {"name": "ghoul", "hp": 18, "maxHp": 18, "dist": 2, "boss": False},
        {"name": "bonedrummer", "hp": 40, "maxHp": 40, "dist": 4, "boss": False},
    ],
    "items": [{"name": "dagger", "dist": 6}],
    "chests": [],
    "stairs": [{"dist": 9}],
    "exits": [],
    "errands": {"unidentifiedGear": 1, "questReady": False, "potionsLow": True},
    "quests": [],
}


def post(path, body):
    req = urllib.request.Request(BRIDGE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    state = DEMO_STATE
    if len(sys.argv) > 1:
        state = json.load(open(sys.argv[1], encoding="utf-8"))

    questions = json.load(urllib.request.urlopen(BRIDGE + "/schema", timeout=10))
    health = json.load(urllib.request.urlopen(BRIDGE + "/health", timeout=10))
    print("== 1 API CALL -> %d typed questions, 1 forward pass ==" % len(questions))
    result = post("/decide", {"state": state})
    d = result["decision"]

    print("\nSTATE   %s  |  hp %s/%s, %d monsters, %s potions, %s gold" % (
        state["scene"], state["player"]["hp"], state["player"]["maxHp"],
        len(state["monsters"]), state["player"]["potions"], state["player"]["gold"]))
    print("MODEL   %s ms forward pass on %s (%s)\n" % (
        result.get("latencyMs"), health.get("device"), health.get("model")))

    widths = {"choice": "%-16s", "score": "%-16s", "noul": "%-16s"}
    for name, q in questions.items():
        if q["type"] == "choice":
            top = sorted(d["probabilities"].items(), key=lambda kv: -kv[1])
            bars = "  ".join("%s %.2f" % (k, v) for k, v in top[:4])
            print("  %-20s choice -> %-10s conf %.2f   [%s]" % (
                name, d["intent"], d["confidence"], bars))
        elif q["type"] == "score":
            print("  %-20s score  -> %.2f / 3       conf %.2f" % (
                name, d["threat"], d["threatConfidence"]))
        else:
            key = {"hp_critical": "hpCritical", "can_kill": "canKill",
                   "objective_reachable": "objectiveReachable",
                   "overmatched": "overmatched",
                   "pack_needs_tending": "packNeedsTending"}[name]
            print("  %-20s noul   -> P(true) = %.2f" % (name, d[key]))

    print("\nThen real code gates on the typed answers (game/src/laya/policy.js, planner.js):")
    print('  if (intent.confidence >= 0.15) -> laya drives the action this tick')
    print('  if (overmatched.noul > 0.7)    -> flee, no matter what intent says')
    print('  if (pack_needs_tending.noul > 0.75) -> arm the HTN "tending" goal: town trip')


if __name__ == "__main__":
    main()
