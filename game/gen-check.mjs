import { layoutArchetype, generateLayout } from "./src/gen.js";
const seen = {};
for (let i = 0; i < 40; i++) {
  const ws = Math.floor(Math.random() * 1e9);
  const a = layoutArchetype(ws + ":greenhills", 1);
  seen[a] = (seen[a] || 0) + 1;
}
console.log("arch distribution over 40 random worlds (want spread over 0-6):", JSON.stringify(seen));
const g1 = generateLayout("111:greenhills", 1, 3).grid.join("").length;
const g2 = generateLayout("222:greenhills", 1, 3).grid.join("").length;
const same = generateLayout("111:greenhills", 1, 3).grid.join("") === generateLayout("111:greenhills", 1, 3).grid.join("");
const diff = generateLayout("111:greenhills", 1, 3).grid.join("") === generateLayout("222:greenhills", 1, 3).grid.join("");
console.log("deterministic per worldKey:", same, "| different worlds identical:", diff);
