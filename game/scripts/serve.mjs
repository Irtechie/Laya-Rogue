import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const PORT = 4173;

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, ""));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    // The autopilot tag is injected here so index.html stays a pure upstream
    // copy: game updates become a plain file sync, no re-editing required.
    if (path.basename(file) === "index.html") {
      let html = data.toString();
      if (!html.includes("src/laya.js"))
        html = html.replace("</body>", '  <script type="module" src="src/laya.js"></script>\n</body>');
      data = Buffer.from(html);
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log("RogueMS: http://127.0.0.1:" + PORT));
