// Downloads CC0 KayKit GLB models into assets/models/ (run: node scripts/fetch-models.mjs)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "assets", "models");
fs.mkdirSync(OUT, { recursive: true });

const BASE = "https://raw.githubusercontent.com/KayKit-Game-Assets";
const FILES = [
  ["Knight.glb", `${BASE}/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Knight.glb`],
  ["Mage.glb", `${BASE}/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Mage.glb`],
  ["Rogue.glb", `${BASE}/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue.glb`],
  ["Barbarian.glb", `${BASE}/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Barbarian.glb`],
  ["Skeleton_Warrior.glb", `${BASE}/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Warrior.glb`],
  ["Skeleton_Mage.glb", `${BASE}/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf/Skeleton_Mage.glb`],
  ["chest.glb", `${BASE}/KayKit-Dungeon-Remastered-1.0/main/addons/kaykit_dungeon_remastered/Assets/gltf/chest.glb`],
  ["chest_gold.glb", `${BASE}/KayKit-Dungeon-Remastered-1.0/main/addons/kaykit_dungeon_remastered/Assets/gltf/chest_gold.glb`],
  ["torch_mounted.glb", `${BASE}/KayKit-Dungeon-Remastered-1.0/main/addons/kaykit_dungeon_remastered/Assets/gltf/torch_mounted.gltf.glb`],
  ["torch_lit.glb", `${BASE}/KayKit-Dungeon-Remastered-1.0/main/addons/kaykit_dungeon_remastered/Assets/gltf/torch_lit.gltf.glb`],
  ["barrel_small.glb", `${BASE}/KayKit-Dungeon-Remastered-1.0/main/addons/kaykit_dungeon_remastered/Assets/gltf/barrel_small.glb`],
  ["coffin.glb", `${BASE}/KayKit-Dungeon-Remastered-1.0/main/addons/kaykit_dungeon_remastered/Assets/gltf/coffin.glb`]
];

const LICENSE = `KayKit asset packs (CC0 1.0 Universal)
Created/distributed by Kay Lousberg - www.kaylousberg.com
Packs used: KayKit Character Pack Adventures 1.0, KayKit Character Pack Skeletons 1.0, KayKit Dungeon Remastered 1.0
License: CC0 1.0 Universal - https://creativecommons.org/publicdomain/zero/1.0/
Source: https://github.com/KayKit-Game-Assets
`;
fs.writeFileSync(path.join(OUT, "LICENSE-KayKit.txt"), LICENSE);

for (const [name, url] of FILES) {
  const dest = path.join(OUT, name);
  const res = await fetch(url);
  if (!res.ok) { console.log(`FAIL ${name}: HTTP ${res.status}`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  const header = buf.readUInt32LE(0) === 0x46546C67 ? "glTF-binary-OK" : "BAD-MAGIC";
  console.log(`${name}: ${(buf.length / 1024).toFixed(0)} KB ${header}`);
}
