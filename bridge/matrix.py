"""Decision matrix for RogueRNG, expressed as LayA typed questions.

Every action the game's Core.act() reducer accepts is mapped here into one of
11 macro intents, plus per-axis judgments (score + noul) that the deterministic
policy layer composes with. Pattern from the Jev DOOM demo: parallel
judgments in ONE forward pass, code owns the final action.

Action map (Core.act type -> macro intent):
    move (bump-attack)      -> fight
    skill (melee/melee-all) -> fight
    skill (bolt/multi-bolt) -> cast
    move away / descend     -> flee
    useItem potion / heal   -> heal
    move toward loot/stairs -> explore
    useItem/interact chest  -> loot
    descend                 -> descend
    ascend / portal up      -> ascend
    travel waygate          -> travel
    buy/sell/equip/identify -> errand
    interact NPC, talk      -> errand
"""

# The three typed primitives (identical in spirit to Jev's Choice/Score/Noul):
#   Choice -> closed-set category + confidence + full probability table
#   Score  -> position on an ordered scale, may land between levels
#   Noul   -> strict binary check, returns P(true)
# All are evaluated in parallel by ONE forward pass of the encoder: asking
# seven questions costs the same ~100 ms as asking one.


def Choice(instructions, criteria):
    return {"type": "choice", "instructions": instructions, "criteria": criteria}


def Score(instructions, criteria):
    return {"type": "score", "instructions": instructions, "criteria": criteria}


def Noul(instructions):
    return {"type": "noul", "instructions": instructions}


GAME_QUESTIONS = {
    "intent": Choice(
        "What single move should the adventurer make this turn?",
        {
            "fight": "step into or strike a monster within reach with weapon or melee skill",
            "cast": "cast an attack spell or ranged skill at a target in range",
            "flee": "run away from monsters toward stairs, the exit or town",
            "heal": "drink a potion or use a healing skill before taking another hit",
            "explore": "move deeper through the dungeon toward stairs, items or objectives",
            "loot": "pick up a nearby item or open a chest",
            "descend": "take the stairs down to the next dungeon depth",
            "ascend": "leave this dungeon level and climb back out",
            "travel": "step through the waygate to town or another zone",
            "errand": "in town: talk to an NPC, buy, sell, identify, equip, rest at the inn",
            "wait": "hold position; nothing else is worth doing",
        },
    ),
    "threat": Score(
        "How dangerous is this turn for the adventurer?",
        [
            "level 0: harmless, no monsters can reach me",
            "level 1: tense, monsters nearby but not touching me",
            "level 2: dangerous, monsters adjacent and I could die soon",
            "level 3: lethal, I am about to die this turn",
        ],
    ),
    "hp_critical": Noul(
        "Is the adventurer hurt enough that healing or escaping matters more than fighting?"),
    "can_kill": Noul(
        "Could the adventurer kill or badly wound a monster with one attack this turn?"),
    "objective_reachable": Noul(
        "Is there a useful objective (item, chest, stairs, NPC, portal) close enough to head toward?"),
    "overmatched": Noul(
        "Are the monsters around too strong for the adventurer to survive a fight?"),
    "pack_needs_tending": Noul(
        "Should the adventurer go to town soon to sell loot, identify gear, buy supplies or turn in a quest?"),
}


def matrix_result(answers):
    """Flatten LayA answers into the compact decision the game client consumes."""
    intent = answers["intent"]
    return {
        "intent": intent["choice"],
        "confidence": intent["confidence"],
        "probabilities": intent["probabilities"],
        "threat": answers["threat"]["score"],
        "threatConfidence": answers["threat"]["confidence"],
        "hpCritical": answers["hp_critical"]["noul"],
        "canKill": answers["can_kill"]["noul"],
        "objectiveReachable": answers["objective_reachable"]["noul"],
        "overmatched": answers["overmatched"]["noul"],
        "packNeedsTending": answers["pack_needs_tending"]["noul"],
    }
