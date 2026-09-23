import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fail = 0;
for (const f of ["verify-shot-dungeon.png", "verify-shot-town.png", "verify-shot-models.png"]) {
  const png = PNG.sync.read(fs.readFileSync(path.join(root, f)));
  const colors = new Set();
  let lit = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    if (r + g + b > 90) lit++;
    if (r + g + b > 200) colors.add((r >> 4) + "," + (g >> 4) + "," + (b >> 4));
  }
  const pct = (lit / (png.width * png.height)) * 100;
  const ok = pct > 2 && colors.size > 5;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${f}: ${pct.toFixed(1)}% lit pixels, ${colors.size} distinct bright colors`);
}
process.exit(fail ? 1 : 0);
