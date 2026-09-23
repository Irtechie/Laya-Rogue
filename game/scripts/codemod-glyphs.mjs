import fs from "fs";
const FILE = "src/data.js";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes('glyph: "\\"')) { console.error("backslash glyph present, aborting"); process.exit(1); }
const start = s.indexOf("export const MONSTERS = {");
const end = s.indexOf("\nexport const MAPS", start);
let block = s.slice(start, end);
block = block.replace(/^(\s*[a-zA-Z]+:\s*\{\s*name:\s*")([^"]+)("[^}]*?glyph:\s*")[^"]*(")/gm,
  (m, p1, name, p2, p3) => {
    const c = name[0].toLowerCase();
    return p1 + name + p2 + c + p3;
  });
s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync(FILE, s);
console.log("done");
