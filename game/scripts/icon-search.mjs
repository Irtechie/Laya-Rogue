import https from "https";

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "user-agent": "rogue-ms-icon-audit" } }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + " -> " + res.statusCode)); }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
    }).on("error", reject);
  });
}

const cache = new Set();
async function ensureTree() {
  if (cache.size) return cache;
  const tree = await getJson("https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1");
  for (const t of tree.tree) {
    const m = t.path.match(/^([a-z0-9-]+)\/([a-z0-9-]+)\.svg$/);
    if (m) cache.add(m[1] + "/" + m[2]);
    const m2 = t.path.match(/^svg\/1x0\/([^/]+)\/(.+)\.svg$/);
    if (m2) cache.add(m2[1] + "/" + m2[2]);
  }
  return cache;
}

const set = await ensureTree();
console.log("total icons in repo:", set.size);
const terms = process.argv.slice(2);
for (const t of terms) {
  const hits = [...set].filter(n => n.toLowerCase().includes(t.toLowerCase()));
  console.log(`\n== ${t} (${hits.length}) ==\n  ` + (hits.slice(0, 30).join("\n  ") || "(none)"));
}
