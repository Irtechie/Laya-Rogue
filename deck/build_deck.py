"""Build the Laya-Rogue talk deck (dark theme, code-forward).

    e:\\layaplayground\\.venv\\Scripts\\python.exe deck\\build_deck.py
"""
import os
import re

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "deck", "One Forward Pass Per Turn.pptx")

BG = RGBColor(0x0A, 0x0F, 0x16)
PANEL = RGBColor(0x0F, 0x18, 0x22)
BORDER = RGBColor(0x1E, 0x8A, 0x4C)
TITLE = RGBColor(0x7D, 0xFF, 0xA0)
TEXT = RGBColor(0xD8, 0xE8, 0xE0)
MUTED = RGBColor(0x7A, 0x9A, 0x8A)
CODE = RGBColor(0xE6, 0xF2, 0xE6)
COMMENT = RGBColor(0x5F, 0x8F, 0x72)
KEY = RGBColor(0xFF, 0x9E, 0x7D)
STR = RGBColor(0xFF, 0xD7, 0x6A)
NUM = RGBColor(0x7D, 0xDF, 0xFF)

KW = (r"\b(?:const|let|var|function|return|if|else|for|of|in|def|import|from|"
      r"export|new|async|await|True|False|None|null|true|false)\b")
TOKEN = re.compile(
    r"(//[^\n]*|#[^\n]*)"                                   # 1 comment
    r"|(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')"    # 2 string
    r"|(\b\d+(?:\.\d+)?%?\b)"                               # 3 number
    r"|(" + KW + r")"                                       # 4 keyword
)


def runs_for(line):
    """Split one code line into (text, color) tokens."""
    out, pos = [], 0
    for m in TOKEN.finditer(line):
        if m.start() > pos:
            out.append((line[pos:m.start()], CODE))
        if m.group(1):
            out.append((m.group(1), COMMENT))
        elif m.group(2):
            out.append((m.group(2), STR))
        elif m.group(3):
            out.append((m.group(3), NUM))
        else:
            out.append((m.group(4), KEY))
        pos = m.end()
    out.append((line[pos:], CODE))
    return [(t, c) for t, c in out if t]


def slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = BG
    return s


def text(s, x, y, w, h, size=18, color=TEXT, bold=False, lines=None, align=None):
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    for i, ln in enumerate(lines or [""]):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if align:
            p.alignment = align
        r = p.add_run()
        r.text = ln
        r.font.size = Pt(size)
        r.font.color.rgb = color
        r.font.bold = bold
        r.font.name = "Segoe UI"
    return box


def kicker(s, label):
    text(s, 0.55, 0.28, 12, 0.4, size=13, color=MUTED, bold=True, lines=[label])


def head(s, t, y=0.62, size=30):
    text(s, 0.5, y, 12.4, 0.9, size=size, color=TITLE, bold=True, lines=[t])


def code(s, x, y, w, h, src, size=12):
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                             Inches(x), Inches(y), Inches(w), Inches(h))
    box.fill.solid()
    box.fill.fore_color.rgb = PANEL
    box.line.color.rgb = BORDER
    box.line.width = Pt(1.25)
    box.shadow.inherit = False
    tf = box.text_frame
    tf.word_wrap = False
    tf.margin_left = Inches(0.22)
    tf.margin_top = Inches(0.14)
    for i, ln in enumerate(src.strip("\n").split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(1.5)
        for tok, col in runs_for(ln):
            r = p.add_run()
            r.text = tok
            r.font.size = Pt(size)
            r.font.color.rgb = col
            r.font.name = "Consolas"


def note(s, t):
    s.notes_slide.notes_text_frame.text = t


def bullets(s, x, y, w, items, size=16, gap=Pt(8)):
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(4))
    tf = box.text_frame
    tf.word_wrap = True
    for i, (a, b) in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = gap
        r = p.add_run(); r.text = a
        r.font.size = Pt(size); r.font.bold = True
        r.font.color.rgb = TITLE; r.font.name = "Segoe UI"
        if b:
            r2 = p.add_run(); r2.text = "  " + b
            r2.font.size = Pt(size); r2.font.color.rgb = TEXT
            r2.font.name = "Segoe UI"
    return box


prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# ---- 1 title ---------------------------------------------------------
s = slide(prs)
text(s, 0.8, 2.3, 11.7, 1.6, size=44, color=TITLE, bold=True,
     lines=["One Forward Pass Per Turn"])
text(s, 0.85, 3.6, 11.7, 1.2, size=20, color=TEXT,
     lines=["Playing a roguelike with a non-autoregressive decision brain —",
            "typed judgments in ONE parallel pass. No LLM. No tokens. No text parsing."])
text(s, 0.85, 6.6, 11, 0.5, size=13, color=MUTED,
     lines=["Laya-Rogue · LayA decision matrix + HTN planner · repo: Irtechie/Laya-Rogue"])
note(s, "Pitch in one sentence: an 807 MB encoder answers SEVEN typed questions about a "
        "game state in one forward pass (~100 ms), and deterministic code decides what to do. "
        "Same typed-primitive pattern as the Jev DOOM demo — running locally, offline, for free.")

# ---- 2 the bet -------------------------------------------------------
s = slide(prs)
kicker(s, "THE SETUP")
head(s, "Agents today = a loop of LLM calls. It didn't have to be.")
bullets(s, 0.7, 1.7, 12, [
    ("LLM agent", "text out, parse it, pray it's JSON; seconds per step; meter running; nondeterministic"),
    ("Our agent (LayA)", "non-autoregressive encoder — it does NOT generate text; it answers typed questions"),
    ("The primitive trio", "Choice (category), Score (scale), Noul (strict yes/no probability) — Jev-style"),
    ("Why it can be fast", "one forward pass classifies ALL questions in parallel: ask 7 = cost of asking 1"),
    ("Where it runs", "807 MB checkpoint (model.safetensors, ~400M params) on a local GPU — $0 marginal cost"),
])
note(s, "Contrast: every LLM-agent failure mode (parse errors, hallucinated options, latency "
        "spikes, token bills) comes from generating text. We never generate text.")

# ---- 3 architecture --------------------------------------------------
s = slide(prs)
kicker(s, "ARCHITECTURE")
head(s, "Two boxes, one HTTP port")
for x, w, t, sub in [
    (0.6, 3.6, "GAME (browser)", "RogueRNG + src/laya/ autopilot\npolicy · HTN planner · memory"),
    (5.05, 3.5, "BRIDGE (stdlib HTTP)", "bridge/server.py + matrix.py\n/decide /event /stats /schema"),
    (9.4, 3.35, "LayA CHECKPOINT", "encoder on CUDA\n1 pass ~100 ms · 0 LLM calls"),
]:
    b = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(1.9), Inches(w), Inches(1.9))
    b.fill.solid(); b.fill.fore_color.rgb = PANEL
    b.line.color.rgb = BORDER; b.line.width = Pt(1.5); b.shadow.inherit = False
    tf = b.text_frame; tf.word_wrap = True
    for i, ln in enumerate([t] + sub.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run(); r.text = ln
        r.font.size = Pt(15 if i else 16); r.font.bold = (i == 0)
        r.font.color.rgb = TITLE if i == 0 else TEXT
        r.font.name = "Segoe UI"
text(s, 4.25, 2.5, 0.8, 0.6, size=24, color=MUTED, lines=["⇄"])
text(s, 8.6, 2.5, 0.8, 0.6, size=24, color=MUTED, lines=["→"])
code(s, 0.7, 4.3, 11.9, 2.5, """
// one tick, every ~110 ms (game/src/laya.js)
const f = facts();                      // game -> structured JSON
const d = await askBridge(buildState(f));   // ONE forward pass -> 7 typed answers
plannerTick(f, d.decision);             // HTN: noul axes arm long-horizon goals
const { act } = macroDecision(f, d.decision); // safety > plan > laya > reflex
game().core.act(act);                   // code owns the action, always
""", size=13)
note(s, "The model NEVER acts. It votes. Everything around it is deterministic JS + stdlib python.")

# ---- 4 one call, seven answers ---------------------------------------
s = slide(prs)
kicker(s, "THE API — python bridge\\demo.py")
head(s, "One call in. Seven typed answers out.")
code(s, 0.7, 1.55, 9.4, 5.4, """
STATE  dungeon crypts tier 2 | hp 11/42 | 3 monsters | 1 potion
MODEL  229 ms forward pass on cuda      # 7 questions = 1 pass = 1 cost

intent               choice -> explore  conf 0.26
                       [explore 0.40  flee 0.21  cast 0.12  heal 0.06]
threat               score  -> 1.79 / 3        conf 0.04
hp_critical          noul   -> P(true) = 0.25
can_kill             noul   -> P(true) = 0.17
objective_reachable  noul   -> P(true) = 0.53
overmatched          noul   -> P(true) = 0.23
pack_needs_tending   noul   -> P(true) = 0.25
""", size=13)
bullets(s, 10.35, 1.8, 2.9, [
    ("Typed", "no string parsing, no hallucinated JSON"),
    ("Calibrated", "every answer carries a probability"),
    ("Parallel", "7 answers, same latency as 1"),
], size=14)
note(s, "Live output from the actual bridge. The state is unstructured JSON; the questions "
        "are declared once in matrix.py.")

# ---- 5 CHOICE --------------------------------------------------------
s = slide(prs)
kicker(s, "PRIMITIVE 1 OF 3 — CHOICE (closed-set decision)")
head(s, "Choice: pick one of 11 macro intents")
text(s, 0.7, 1.45, 6, 0.4, size=14, color=MUTED, lines=["bridge/matrix.py — the question"])
code(s, 0.7, 1.85, 6.0, 3.7, """
"intent": Choice(
  "What single move should the
   adventurer make this turn?",
  { "fight":  "strike a monster",
    "cast":   "attack spell in range",
    "flee":   "run for the stairs",
    "heal":   "drink a potion first",
    "explore": "go deeper",
    "loot":   "grab the item",
    ... descend, ascend,
        travel, errand, wait ...
  })
""", size=13)
text(s, 7.0, 1.45, 6, 0.4, size=14, color=MUTED, lines=["game/src/laya/policy.js — in-game use"])
code(s, 7.0, 1.85, 5.75, 3.7, """
// below the floor, a choice is noise
const intent = decision.confidence >= 0.15
  ? decision.intent : null;

if (intent === "flee")
  return fleeAction(f);      // "laya:flee"
if (intent === "fight" || intent === "cast") {
  const a = bestAttack(f);   // facts must allow it
  if (a) return { act: a, why: "laya:" + intent };
}
""", size=13)
text(s, 0.7, 5.9, 12.2, 1.2, size=15, color=TEXT,
     lines=["Returns: chosen intent + confidence + the FULL 11-bar probability table "
            "(that's the distribution on the in-game panel and the dashboard)."])
note(s, "Key honesty trick: confidence floor 0.15. If the model isn't sure, the reflex layer "
        "plays instead — and the dashboard tracks who actually decided each turn.")

# ---- 6 SCORE ---------------------------------------------------------
s = slide(prs)
kicker(s, "PRIMITIVE 2 OF 3 — SCORE (ordered scale, can land between levels)")
head(s, "Score: how dangerous is this turn, 0 → 3")
text(s, 0.7, 1.45, 6, 0.4, size=14, color=MUTED, lines=["bridge/matrix.py — the question"])
code(s, 0.7, 1.85, 6.0, 3.2, """
"threat": Score(
  "How dangerous is this turn?",
  [ "level 0: harmless",
    "level 1: tense, not touching me",
    "level 2: adjacent, could die soon",
    "level 3: lethal, dying now" ])
""", size=13)
text(s, 7.0, 1.45, 6, 0.4, size=14, color=MUTED, lines=["game/src/laya/policy.js — in-game use"])
code(s, 7.0, 1.85, 5.75, 3.2, """
// leaving the level needs BOTH the
// intent AND a near-lethal score
if (intent === "ascend"
    && decision.threat > 2.2)
  return { act: { type: "ascend" },
           why: "laya:ascend" };
""", size=13)
text(s, 0.7, 5.5, 12.2, 1.4, size=15, color=TEXT,
     lines=["A float on the scale, not an integer — 1.79 means \"between tense and dangerous.\" "
            "Two typed signals must agree (choice + score) before the model can make the agent "
            "abandon the dive."])
note(s, "Score can interpolate between anchor levels — like Jev's frustration score. Here it "
        "acts as a second, independent key that must turn together with the intent.")

# ---- 7 NOUL ----------------------------------------------------------
s = slide(prs)
kicker(s, "PRIMITIVE 3 OF 3 — NOUL (strict binary judgment)")
head(s, "Noul: P(true) for one yes/no question")
text(s, 0.7, 1.45, 6, 0.4, size=14, color=MUTED, lines=["bridge/matrix.py — 1 of 5 noul axes"])
code(s, 0.7, 1.85, 6.0, 3.2, """
"pack_needs_tending": Noul(
  "Should the adventurer go to town
   soon to sell loot, identify gear,
   buy supplies or turn in a quest?")
""", size=13)
text(s, 7.0, 1.45, 6, 0.4, size=14, color=MUTED, lines=["game/src/laya/planner.js — in-game use"])
code(s, 7.0, 1.85, 5.75, 3.2, """
// a noul PROBABILITY arms an HTN goal
{ id: "tending", weight: 45,
  trig: (f, d) =>
    d.packNeedsTending > 0.75
    && f.mapKind === "dungeon"
    && (f.bag.length >= 10
        || f.gold >= 90),
  tasks: tHomeDive }
""", size=13)
text(s, 0.7, 5.4, 12.2, 1.5, size=15, color=TEXT,
     lines=["Five noul axes: hp_critical, can_kill, objective_reachable, overmatched, "
            "pack_needs_tending. They are the model's own judgment used as SOFT PRECONDITIONS "
            "on long-horizon plans — e.g. overmatched > 0.7 triggers a flee the intent can't veto."])
note(s, "This is the System-1 -> long-horizon bridge: a calibrated gut feeling, gated at 0.75, "
        "planning a multi-step town trip. No hardcoded threshold on HP/gold alone.")

# ---- 8 guardrails ----------------------------------------------------
s = slide(prs)
kicker(s, "GUARDRAILS")
head(s, "The model votes. The code decides.")
code(s, 0.7, 1.6, 7.1, 4.2, """
// priority is fixed, top wins (policy.js)
1 safety   hp < 35% -> heal, else flee   # no override
2 plan     current HTN task (fight through it)
3 laya     intent IF conf >= 0.15
           AND facts say it's executable
4 reflex   loot > fight > stairs > frontier
""", size=13)
bullets(s, 8.1, 1.8, 4.9, [
    ("Facts gate", "\"cast\" with no mana in range → rejected, reflex plays"),
    ("Safety first", "safety layer cannot be outvoted"),
    ("Watchdog", "15 ticks stuck → drop goal; 30 → ascend"),
    ("Accountability", "every turn logs who decided: laya / safety / plan / macro"),
], size=15)
note(s, "This is why a near-chance zero-shot model is already playable: its wrong answers are "
        "filtered by facts, its right answers get through.")

# ---- 9 HTN -----------------------------------------------------------
s = slide(prs)
kicker(s, "LONG HORIZON — HTN GOAL PLANNER")
head(s, "Three worries, one town trip")
code(s, 0.7, 1.6, 11.9, 3.3, """
GOALS ARMED THIS TURN (facts + noul)          MERGED PLAN (shared tasks once)
  unpack     bag 18/18          ─┐              1 gohome
  resupply   0 potions, 90 gold  ├─► merge ──►  2 chores      <- run ONCE
  haveKey    locked chest, no key ┘              3 buy key
                                                4 resume crypts:t2
""", size=13)
text(s, 0.7, 5.3, 12.2, 1.6, size=15, color=TEXT,
     lines=["Each goal = trigger + method (primitive tasks with done/act predicates). Active goals "
            "merge: duplicate tasks drop, the terminal \"resume dive\" is hoisted to the end. "
            "Three sequential chains would be 3 round trips; the planner makes it one. "
            "Dashboard shows the live plan per decision."])
note(s, "This replaced 8 hardcoded event chains. The model's noul axes (packNeedsTending) are one "
        "of the goal triggers — perception layer feeding the planning layer.")

# ---- 10 proof --------------------------------------------------------
s = slide(prs)
kicker(s, "IT RUNS")
head(s, "45-second smoke run (headless, live bridge)")
shot = os.path.join(ROOT, "game", "shots", "pilot-e2e.png")
if os.path.exists(shot):
    s.shapes.add_picture(shot, Inches(6.35), Inches(1.6), width=Inches(6.4))
bullets(s, 0.7, 1.8, 5.4, [
    ("60 decisions", "0 fallbacks — bridge answered every dungeon tick"),
    ("3 kills", "while exploring + looting; 0 deaths"),
    ("0 stalls, 0 page errors", "goal commitment + watchdog never tripped"),
    ("Panel visible right", "full intent distribution + 5 noul axes, live"),
    ("Longer runs", "full chain loop verified: locked chest -> buy key -> potions -> quest -> descend"),
], size=15)
note(s, "Pilot-e2e.mjs is reproducible: PILOT_MINUTES=480 for overnight runs, JSONL telemetry -> "
        "dashboard at :8732.")

# ---- 11 honesty / future ---------------------------------------------
s = slide(prs)
kicker(s, "HONESTY & WHAT'S NEXT")
head(s, "Zero-shot today — and the dashboard proves it")
bullets(s, 0.7, 1.7, 12, [
    ("Near chance today", "base checkpoint: intent conf ~0.3-0.5; gates + reflex carry the play"),
    ("Honesty table", "dashboard tracks the share of turns where laya:* actually earned execution"),
    ("Next: RLCD fine-tune", "train on game-state labels -> noul axes become CALIBRATED preconditions"),
    ("Then hand over the wheel", "as conf rises, the floor drops and laya share grows — measured, not assumed"),
    ("The pitch", "a $0-per-turn agent brain: ~100 ms, local, deterministic guardrails, typed answers"),
])
note(s, "Close on trust: we don't claim the model plays well yet — we show the machinery that "
        "makes every improvement measurable and every bad prediction harmless.")

# ---- 12 close ----------------------------------------------------------
s = slide(prs)
text(s, 0.8, 2.7, 11.7, 1.2, size=38, color=TITLE, bold=True,
     lines=["Ask seven questions. Pay one forward pass."])
text(s, 0.85, 4.0, 11.5, 1.4, size=18, color=TEXT,
     lines=["game + bridge + dashboard + planner: github.com/Irtechie/Laya-Rogue",
            "demo: python bridge\\demo.py · dashboard: http://localhost:8732 · press P in game"])
note(s, "End with the demo loop running on the dashboard if time allows.")

prs.save(OUT)
print("saved:", OUT, os.path.getsize(OUT) // 1024, "KB")
