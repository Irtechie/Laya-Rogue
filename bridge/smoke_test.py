import sys, time, json
sys.path.insert(0, r"e:\layaplayground")
import torch
print("cuda:", torch.cuda.is_available())
from laya import Agent
t0 = time.time()
agent = Agent(r"E:\layaplayground\.models\english")
print("load %.1fs device=%s" % (time.time()-t0, agent.device))
state = {
  "scene": "dungeon tier 1",
  "player": {"hp": 6, "maxHp": 30, "mp": 9, "level": 2, "x": 15, "y": 7, "potions": 1},
  "monsters": [
    {"name": "Giant Rat", "hp": 6, "dmg": 3, "distance": 1},
    {"name": "Goblin", "hp": 12, "dmg": 5, "distance": 3}
  ]
}
questions = {
  "intent": {"type": "choice", "instructions": "What should the adventurer do this turn?",
    "criteria": {
      "fight": "an enemy is close and can be attacked safely",
      "flee": "disengage and run away from enemies",
      "heal": "use a healing potion or self-heal",
      "explore": "no enemies worth fighting; move toward objectives",
      "wait": "hold position"}},
  "threat": {"type": "score", "instructions": "How dangerous is this situation for the adventurer?",
    "criteria": ["harmless", "tense", "dangerous", "about to die"]},
  "hp_critical": {"type": "noul", "instructions": "Is the adventurer close enough to death that healing or fleeing matters most?"}
}
t0 = time.time()
res = agent.predict(state, questions)
print("predict %.2fs" % (time.time()-t0))
print(json.dumps(res["answers"], indent=1))
