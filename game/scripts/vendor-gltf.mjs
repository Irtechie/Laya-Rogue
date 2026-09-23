// Vendors three's own GLTFLoader/GLTFExporter (same library as the vendored
// build - not a new dependency). Re-run after bumping three's version.
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "0.185.0";
const FILES = ["loaders/GLTFLoader.js", "exporters/GLTFExporter.js", "utils/BufferGeometryUtils.js", "utils/SkeletonUtils.js"];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + " -> " + res.statusCode)); }
      const c = [];
      res.on("data", d => c.push(d));
      res.on("end", () => resolve(Buffer.concat(c)));
    }).on("error", reject);
  });
}

for (const f of FILES) {
  const name = path.basename(f);
  const url = `https://cdn.jsdelivr.net/npm/three@${VERSION}/examples/jsm/${f}`;
  const out = path.join(ROOT, "vendor", name);
  let src = (await get(url)).toString("utf8");
  src = src
    .replace("'../utils/BufferGeometryUtils.js'", "'./BufferGeometryUtils.js'")
    .replace("'../utils/SkeletonUtils.js'", "'./SkeletonUtils.js'");
  fs.writeFileSync(out, src);
  console.log("vendored", name, fs.statSync(out).size, "bytes");
}
console.log("DONE - keep VERSION in sync with package.json three version");
