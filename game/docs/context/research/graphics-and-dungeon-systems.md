# Graphics upgrade + dungeon/regen/save systems

Checked: 2026-09-03
Budget mode: lean

## Question

1. Can we get real 3D-looking graphics (not billboard "cards") with free assets,
   like the kids' Minecraft project?
2. How to fix: outdoor vs dungeon identity, sticky-per-run dungeons, physical
   stair marker, HP-over-time, mana regen model, save button?

## Findings

### Graphics options (3D-look)

- **Option A - CC0 low-poly glTF models (recommended primary path).**
  Quaternius (quaternius.com, reachable 2026-09-03) publishes public-domain
  (CC0) monster/character/dungeon packs in glTF/GLB. Kenney (kenney.nl,
  reachable) has CC0 3D packs (castle/fantasy/roguelike-adjacent) shipped as
  zips with OBJ/glTF. Three.js loads GLB via GLTFLoader; loader is fetchable
  from `cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/loaders/GLTFLoader.js`
  (verified 200) and can be vendored next to `vendor/three.module.js` like the
  rest of three. Tradeoff: style mixing risk; zip download automation from
  kenney.nl pages NOT yet verified (page links are hashed) - fallback is a
  one-time manual zip download by the user, then we commit chosen GLBs.
- **Option B - procedural voxel/block models (guaranteed offline).**
  Minecraft-look built from InstancedMesh boxes (cat-ears head, torso, arms,
  legs per monster class, tinted per species). Zero licensing, zero downloads,
  consistent look, cheap. Less detailed than Quaternius.
- **Option C - status quo billboards + lighting/shadow polish.** Cheapest; user
  explicitly wants better than "a card", so this is the floor, not the goal.
- Recommendation: **B now for guaranteed look, import a curated CC0 GLB set (A)
  as the visual target**; drop-in per-entity so packs can replace voxel bodies.

### Outdoor vs dungeon identity

Current maps are all closed grids. Standard rogue pattern (Caves of Qud, AD&D,
Minecraft overworld): outdoor maps use connectivity ~8-neighbor-open, tree/rock
scatter props, sky-blue fog + sun light, grass textures (already themed);
dungeons keep tight corridors + torch point light. Need a new map kind
`outdoor`: village exteriors of Greenhills/Darkfang/Ashfall, with dungeon
entrances (door prop) as the actual dungeons. Town stays special-cased outdoors.

### Sticky generated dungeons

Current layout seed = hash(map,tier) -> deterministic per tier, so re-runs feel
"samey" and identical across characters. Standard fix (Minecraft seed model):
roll per-character world seed at creation; layout seed =
hash(charSeed, mapId, tier); generate on first visit, persist the layout (and
clear state) in the save so the dungeon "sticks" after first run.

### Stairs physical marker

Stairs are currently a sprite on a flat tile. Fix: raise a small 3D structure
(instanced block stair run + torch/portal glow) at the stairs cell so it
exists in the world, not just as an icon.

### HP-over-time and mana model

Conventions (AD&D roguelikes / Scapegoat / Minecraft hunger model):
- HP regenerates slowly out of combat only: +1 HP per ~5 player turns with no
  damage taken; town/instant full rest at inn.
- Mana does NOT regen per turn (current +1/turn in town only is fine; the
  perceived "too fast" issue is skills partially refunding on cancel and low
  costs). Fix: no refund exploit path, costs scaled to maxMp percentage, and
  mana only restores via potions, inn rest, and level-ups (classic D&D: spells
  per day - simplest honest model, but per-point with slow combat-drained
  regen is friendlier for a phone MMO).

### Save/load

Core state is already plain data (no DOM refs): `player`, `maps` grids+entities,
seed, quests. Serialize to JSON -> localStorage "Save" button + autosave on
descend/level/turn-in. Multiplayer note: the same JSON is the future server
character record; keep save v1 versioned.

## Sources

- quaternius.com (CC0 Ultimate packs, glTF) - reachable 2026-09-03
- kenney.nl 3D category (CC0, zip delivery; direct URL automation unverified)
- jsDelivr three@0.185 GLTFLoader - HTTP 200 2026-09-03
- Local: src/core.js state shape (serialization-ready), vendor/ three build

## Applies When

Planning the graphics rework, overworld maps, save system, regen economy, and
dungeon seeding.

## Stale When

Three version bump breaks GLTFLoader vendoring; asset packs relicense; a pack
is chosen and committed (then this note is implementation truth, not question).

## Rejected Approaches

- Text/font atlas upgrades only - user explicitly wants past "a card".
- Paywalled asset stores - user asked for free images.
- Downloading arbitrary scraped sprites without license check - attribution/
  license must survive (we keep game-icons CC-BY attribution today).
- Full procedural mesh generation of "realistic" monsters - high effort,
  uncanny; CC0 packs are better per hour.

## Impact On Current Project

Planning inputs (next /kb-plan), in dependency order:
1. Per-character seed + persisted layouts (dungeons stick; prerequisite for save).
2. Save/load (localStorage, versioned JSON) + Save button + autosave hooks.
3. Outdoor map kind + entrance props + outdoor lighting/textures; current start
   map becomes a proper dungeon entered from Greenhills outdoors.
4. Stairs physical marker structure.
5. Regen economy: out-of-combat HP tick; mana via potions/inn/level-up only.
6. Graphics: voxel bodies first (guaranteed), GLB import pipeline second
   (vendor GLTFLoader; user may need to grab one CC0 zip by hand).
