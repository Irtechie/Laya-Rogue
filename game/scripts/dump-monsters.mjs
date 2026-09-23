import * as D from "../src/data.js";

const rows = Object.values(D.MONSTERS).map((m) => `${m.tier}\t${m.id}\t${m.name}\t${m.icon}\t${D.FAMILIES[m.id] || "?"}`);
rows.sort((a, b) => Number(a.split("\t")[0]) - Number(b.split("\t")[0]) || a.localeCompare(b));
console.log(`count=${rows.length}`);
console.log(rows.join("\n"));
console.log("--- pools ---");
for (const k of ["greenhills", "darkfang", "ashfall"]) {
  console.log(k, JSON.stringify(D.MAPS[k].monsters));
}
console.log("--- families ---");
console.log([...new Set(Object.values(D.FAMILIES))].join(", "));
