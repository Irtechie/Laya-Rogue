# RogueMS

A rogue-style, real-time-with-turns RPG for the browser: a town hub, three 12-tier
dungeon ladders with themed elemental floors, 11 classes, 6 races, a 127-species
folklore bestiary, gear with affixes and identification, quests, spell books with
tradition-locked study, a dressed 3D hero with an equipment doll, and a
waygate travel menu. Rendered with Three.js (KayKit CC0 rigs), icons from
game-icons.net (CC-BY). It is a prototype for a future phone MMORPG, built in
small shippable batches.

## Run it

```bash
node scripts/serve.mjs      # tiny static server
# open http://localhost:4173
```

No build step: plain ES modules, vendored Three.js in `vendor/`.

## Controls

`WASD` move · click to walk/use · skill bar `1-9 0 - =` (12 slots, right-click to rebind) ·
`Shift+arrows` casts the selected slot toward that direction (hover a slot for click-arrows) ·
`E` talk/open · `>` descend · `<` ascend · `I` pack + equipment doll (drag the doll to spin) ·
`T` waygate travel · `B` bestiary · `M` map · `.` wait.

## Layout

| Path | What lives there |
|---|---|
| `src/core.js` | Pure game rules: world state, actions, combat, loot, quests, save/load. No DOM, no Three.js. Deterministic (seeded RNG), headless-testable. |
| `src/game.js` | Three.js renderer + DOM HUD: maps, rigged models, skill bar, doll, panels. Talks to core only through `core.act(action)` and `core.status()`. |
| `src/data.js` | All tables: classes, races, 46 skills, bestiary, elements, maps, shop, spell books. |
| `assets/` | White silhouette PNG icons (rasterized from CC-BY SVGs), KayKit CC0 GLBs, procedural tile textures. `scripts/fetch-assets.mjs` regenerates. |
| `vendor/` | Vendored three.js + loaders (no npm install needed). |
| `scripts/` | Dev tooling (below). |

## How this project is tested (the real point of this repo)

**This codebase is also an experiment in agentic development.** A large
language model — a Qwen-class coding model (in our notes, "Qwen 3.8", served
through LiteLLM under the route `litellm/best`) — is being evaluated on whether
it can act as a sustained, autonomous game developer across many sessions:
planning features, writing code, and, most importantly, *proving its own work
honestly* before calling it done. We watch for:

1. **Continuity** — does it remember the plan, the constraints, and the
   codebase conventions across sessions instead of re-deriving everything?
2. **Verification honesty** — does it report what actually passed, refuse to
   claim green without running the checks, and flag what it could not see?
   (The agent cannot view screenshots in this setup, and says so.)
3. **Regression discipline** — `main` must never go red; every feature batch
   lands with the full harness green *and* fresh screenshots.
4. **Scope judgment** — does it keep a kid-friendly "looks like a real game"
   bar, defer the right backlog items, and avoid architecture that would make
   the future phone MMORPG harder?

### The harness is the scoreboard

- `node scripts/verify.mjs` — drives the real game in headless Chromium
  (Playwright + swiftshader): boot, create, fight, loot, quests, saves,
  rendering (it counts lit pixels and distinct colors so a black frame fails),
  and every shipped feature has a behavioral check. **86 checks; exit 0 only
  when all pass.** New features must arrive with a new check.
- `node scripts/screens.mjs` — regenerates `shots/` (creation, town, waygates,
  all three maps, pack + equipment doll, creatures, minimap).
- `node scripts/check-shots.mjs` — brightness/entropy gate on verification
  screenshots: the game must actually draw something.
- A commit/push ritual: pull --rebase, full harness, screenshots, one commit
  per feature batch with real notes. The repo history doubles as the model's
  decision log.

### Reproducing the evaluation

Point any agent CLI at the LiteLLM route under test and give it this repo plus
a user who plays between batches and asks for the next feature. Judge it from
the outside: does `verify.mjs` stay green, do its "done" claims match reality,
does the game keep getting better between commits, and does it push back when
it's wrong rather than agreeing?

## Deferred backlog (agreed with the human playtester)

- Harder difficulty tuning ("fighters walk through it all")
- Deeper dress-the-hero surface (capes, weapon skins)
- Mobile/touch controls, then the MMO turn (server-authoritative core)

## Credits & licenses

- Character/monster models: [KayKit](https://kaylousberg.com/) (CC0)
- Icons: [game-icons.net](https://game-icons.net) (CC-BY, authors: Lorc, Delapouite, skoll, sbed, carl-olsen, caro-asercion, willdabeast, felbrigg)
- Renderer: [three.js](https://threejs.org/) (MIT, vendored)
