const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };
function serve(port) {
  const srv = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, ""));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}

(async () => {
  const srv = await serve(4173);
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 760 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  const url = "http://127.0.0.1:4173/";

  await page.goto(url + "?autoplay=1");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "shot-1-start.png" });

  await page.waitForTimeout(6000);
  await page.screenshot({ path: "shot-2-gameplay.png" });

  const state = await page.evaluate(() => window.pacman.getState());
  console.log("state:", JSON.stringify(state));
  console.log("errors:", errors.length ? errors.join("\n") : "none");
  await browser.close();
  srv.close();
})();
