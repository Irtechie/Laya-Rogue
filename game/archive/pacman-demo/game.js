import * as THREE from "three";

const TILE = 24;
const W = 504, H = 504;
const scoreEl = document.getElementById("score");
const hiEl = document.getElementById("hi");
const livesEl = document.getElementById("lives");
const messageEl = document.getElementById("message");

const MAZE_SRC = [
  "#####################",
  "#.........#.........#",
  "#o###.###.#.###.###o#",
  "#...................#",
  "#.###.#.#####.#.###.#",
  "#.....#...#...#.....#",
  "#####.#.###.#.#.#####",
  "#####.#.....  #.#####",
  "#####.#.##-##.#.#####",
  "     .  #   #  .    ",
  "#####.#.#####.#.#####",
  "#.........#.........#",
  "#.###.###.#.###.###.#",
  "#o..#...........#..o#",
  "###.#.#.#####.#.#.###",
  "#.....#...#...#.....#",
  "#.###.###.#.###.###.#",
  "#...#.....P.....#...#",
  "#.###.#.#####.#.###.#",
  "#...................#",
  "#####################"
];

const ROWS = MAZE_SRC.length;
const COLS = MAZE_SRC[0].length;

let grid, dots, totalDots, score, hiScore = 0, lives, frightened, state, tick;

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 }
};

const HOUSE = { x: 9, y: 11.5 };
const PAC_START = { x: 9, y: 13.5 };
const GHOST_COLORS = [0xff2020, 0xffb8ff, 0x00ffff, 0xffb852];
const GHOST_STARTS = [
  { x: 9, y: 7.5, inside: false },
  { x: 8, y: 11.5, inside: true },
  { x: 10, y: 11.5, inside: true },
  { x: 9, y: 11.5, inside: true }
];

let pac, ghosts, dyingTimer = 0;

/* ---------- three.js scene ---------- */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000008);

const camera = new THREE.PerspectiveCamera(42, 1, 1, 3000);
camera.position.set(0, -430, 430);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById("scene").appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x8888aa, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(-120, -220, 320);
scene.add(key);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(COLS * TILE + 200, ROWS * TILE + 200),
  new THREE.MeshStandardMaterial({ color: 0x020214, roughness: 1 })
);
scene.add(floor);

const worldX = (x) => (x - (COLS - 1) / 2) * TILE;
const worldY = (y) => ((ROWS - 1) / 2 - y) * TILE;

let wallMesh, doorMeshes = [];

function buildStaticMaze() {
  if (wallMesh) scene.remove(wallMesh);
  doorMeshes.forEach(m => scene.remove(m));
  doorMeshes = [];

  const wallCells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAZE_SRC[r][c] === "#") wallCells.push({ c, r });
    }
  }
  const geo = new THREE.BoxGeometry(TILE - 4, TILE - 4, TILE * 0.9);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2222ff, roughness: 0.55, emissive: 0x0a0a55 });
  wallMesh = new THREE.InstancedMesh(geo, mat, wallCells.length);
  const m = new THREE.Matrix4();
  wallCells.forEach((cell, i) => {
    m.setPosition(worldX(cell.c), worldY(cell.r), TILE * 0.45);
    wallMesh.setMatrixAt(i, m);
  });
  wallMesh.instanceMatrix.needsUpdate = true;
  scene.add(wallMesh);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAZE_SRC[r][c] === "-") {
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(TILE - 2, 3, 6),
          new THREE.MeshStandardMaterial({ color: 0xffb8de, emissive: 0x661133 })
        );
        door.position.set(worldX(c), worldY(r), 6);
        scene.add(door);
        doorMeshes.push(door);
      }
    }
  }
}

const dotGeo = new THREE.SphereGeometry(2.6, 8, 8);
const dotMat = new THREE.MeshStandardMaterial({ color: 0xffb897, emissive: 0xaa6030, emissiveIntensity: 1.4 });
const pelletGeo = new THREE.SphereGeometry(6, 16, 16);
const pelletMat = new THREE.MeshStandardMaterial({ color: 0xffff40, emissive: 0xcccc00, emissiveIntensity: 1.6 });
let dotMesh, pelletMesh, pelletCells;

function buildDots() {
  if (dotMesh) scene.remove(dotMesh);
  if (pelletMesh) scene.remove(pelletMesh);

  const dotCells = [], pCells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === ".") dotCells.push({ c, r });
      else if (grid[r][c] === "o") pCells.push({ c, r });
    }
  }
  pelletCells = pCells;

  const hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
  const m = new THREE.Matrix4();

  dotMesh = new THREE.InstancedMesh(dotGeo, dotMat, Math.max(dotCells.length, 1));
  dotCells.forEach((cell, i) => {
    m.setPosition(worldX(cell.c), worldY(cell.r), 4);
    dotMesh.setMatrixAt(i, m);
  });
  scene.add(dotMesh);

  pelletMesh = new THREE.InstancedMesh(pelletGeo, pelletMat, Math.max(pCells.length, 1));
  pCells.forEach((cell, i) => {
    m.setPosition(worldX(cell.c), worldY(cell.r), 6);
    pelletMesh.setMatrixAt(i, m);
  });
  scene.add(pelletMesh);
  dotMesh.userData.cells = dotCells;
  pelletMesh.userData.cells = pCells;
  void hidden;
}

const pacMat = new THREE.MeshStandardMaterial({ color: 0xffe000, emissive: 0x664400, emissiveIntensity: 0.5, side: THREE.DoubleSide });
let pacMesh = null;
const pacPivot = new THREE.Group();
scene.add(pacPivot);

function buildPac() {
  if (pacMesh) pacPivot.remove(pacMesh);
  pacMesh = new THREE.Mesh(new THREE.SphereGeometry(TILE * 0.5, 24, 2, Math.PI * 0.15, Math.PI * 1.7), pacMat);
  pacPivot.add(pacMesh);
}

const eyeWhiteGeo = new THREE.SphereGeometry(3.4, 10, 10);
const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
const eyePupilGeo = new THREE.SphereGeometry(1.8, 8, 8);
const eyePupilMat = new THREE.MeshStandardMaterial({ color: 0x0000cc });
const ghostBodyGeo = new THREE.SphereGeometry(TILE * 0.5, 18, 14);
const scaredMats = [
  new THREE.MeshStandardMaterial({ color: 0x2121ff }),
  new THREE.MeshStandardMaterial({ color: 0xffffff })
];

function makeGhost(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    ghostBodyGeo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
  );
  body.scale.set(1, 1, 0.85);
  body.position.z = TILE * 0.4;
  group.add(body);
  const eyes = new THREE.Group();
  for (const sx of [-4.5, 4.5]) {
    const w = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    w.position.set(sx, 3, TILE * 0.72);
    eyes.add(w);
    const p = new THREE.Mesh(eyePupilGeo, eyePupilMat);
    p.position.set(sx, 3, TILE * 0.72 + 2.4);
    eyes.add(p);
  }
  group.add(eyes);
  group.userData = { body, eyes };
  scene.add(group);
  return group;
}

let ghostGroups = [];

/* ---------- game logic (2D grid) ---------- */

function resetActors() {
  pac = { x: PAC_START.x, y: PAC_START.y, dir: "none", want: "none", speed: 6, mouth: 0 };
  ghosts = GHOST_STARTS.map((g, i) => ({
    x: g.x, y: g.y,
    dir: ["left", "up", "down", "right"][i],
    speed: 4.5 + i * 0.2,
    scared: false, eaten: false,
    inside: g.inside, outTimer: i * 2
  }));
  ghostGroups.forEach(g => scene.remove(g));
  ghostGroups = GHOST_COLORS.map(c => makeGhost(c));
}

function newGame() {
  grid = MAZE_SRC.map(row => row.split(""));
  dots = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === "." || grid[r][c] === "o") dots.add(r * COLS + c);
    }
  }
  totalDots = dots.size;
  score = 0;
  lives = 3;
  frightened = 0;
  tick = 0;
  buildStaticMaze();
  buildDots();
  buildPac();
  resetActors();
  state = "ready";
  messageEl.textContent = "Press an arrow key or WASD to move";
  updateHud();
}

function updateHud() {
  scoreEl.textContent = "SCORE: " + score;
  hiEl.textContent = "HI: " + hiScore;
  livesEl.innerHTML = "&#9679;".repeat(Math.max(0, lives));
}

function tileOf(e) {
  return { c: Math.round(e.x), r: Math.round(e.y) };
}

function atCenter(e) {
  return Math.abs(e.x - Math.round(e.x)) < 0.06 && Math.abs(e.y - Math.round(e.y)) < 0.06;
}

function blockedTile(c, r, ghost) {
  if (r < 0 || r >= ROWS) return true;
  if (c < 0 || c >= COLS) return false;
  const ch = MAZE_SRC[r][c];
  if (ch === "#") return true;
  if (ch === "-" && !ghost) return true;
  return false;
}

function canMove(e, dir, ghost) {
  if (dir === "none") return false;
  const d = DIRS[dir];
  const t = tileOf(e);
  if (!ghost && d.x !== 0 && Math.abs(e.y - t.r) > 0.06) return true;
  if (!ghost && d.y !== 0 && Math.abs(e.x - t.c) > 0.06) return true;
  return !blockedTile(t.c + d.x, t.r + d.y, ghost);
}

function wrap(e) {
  if (e.x < -0.6) e.x = COLS - 0.6;
  if (e.x > COLS - 0.4) e.x = -0.6;
}

function hideDot(key) {
  const r = Math.floor(key / COLS), c = key % COLS;
  const ch = MAZE_SRC[r][c];
  const mesh = ch === "o" ? pelletMesh : dotMesh;
  const cells = mesh.userData.cells;
  const idx = cells.findIndex(cell => cell.c === c && cell.r === r);
  if (idx >= 0) {
    mesh.setMatrixAt(idx, new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001));
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function movePac(dt) {
  if (pac.want !== "none" && canMove(pac, pac.want, false)) pac.dir = pac.want;
  const stepLen = pac.speed * dt;
  const d = DIRS[pac.dir];
  if (canMove(pac, pac.dir, false) || d.x !== 0) {
    pac.x += d.x * stepLen;
    pac.y += d.y * stepLen;
  }
  if (d.x !== 0) pac.y = Math.round(pac.y - 0.5) + 0.5;
  else if (d.y !== 0) pac.x = Math.round(pac.x);
  wrap(pac);
  pac.mouth += stepLen * 3;

  const t = tileOf(pac);
  if (t.c < 0 || t.c >= COLS) return;
  const key = t.r * COLS + t.c;
  if (dots.has(key)) {
    dots.delete(key);
    hideDot(key);
    if (grid[t.r][t.c] === "o") {
      score += 50;
      frightened = 7;
      ghosts.forEach(g => { if (!g.eaten) g.scared = true; });
    } else {
      score += 10;
    }
    hiScore = Math.max(hiScore, score);
    updateHud();
    if (dots.size === 0) {
      state = "won";
      messageEl.textContent = "YOU WIN! Press Enter to play again";
    }
  }
}

function ghostTarget(g, idx) {
  if (g.scared) return { x: Math.random() * COLS, y: Math.random() * ROWS };
  const p = tileOf(pac), d = DIRS[pac.dir] || DIRS.none;
  if (idx === 0) return p;
  if (idx === 1) return { x: p.c + d.x * 4, y: p.r + d.y * 4 };
  if (idx === 2) return { x: p.c - d.x * 2, y: p.r - d.y * 2 };
  return Math.hypot(g.x - p.c, g.y - p.r) > 8 ? p : { x: 1, y: ROWS - 2 };
}

function moveGhostHouse(g, dt) {
  g.outTimer -= dt;
  if (g.outTimer > 0) return;
  g.x += (HOUSE.x - g.x) * Math.min(1, dt * 5);
  if (Math.abs(g.x - HOUSE.x) < 0.1) {
    g.x = HOUSE.x;
    g.y -= g.speed * dt;
    if (g.y <= 7.5) {
      g.y = 7.5;
      g.x = 9;
      g.inside = false;
      g.dir = Math.random() < 0.5 ? "left" : "right";
    }
  }
}

function moveGhost(g, idx, dt) {
  if (g.inside) { moveGhostHouse(g, dt); return; }
  const speed = (g.scared ? g.speed * 0.6 : g.speed) * dt;
  const opposites = { up: "down", down: "up", left: "right", right: "left", none: "none" };
  if (atCenter(g)) {
    g.x = Math.round(g.x);
    g.y = Math.round(g.y);
    const t = tileOf(g);
    const options = ["up", "left", "down", "right"].filter(
      dir => dir !== opposites[g.dir] && canMove(g, dir, true)
    );
    if (options.length === 0) {
      if (canMove(g, opposites[g.dir], true)) g.dir = opposites[g.dir];
    } else if (g.scared) {
      g.dir = options[Math.floor(Math.random() * options.length)];
    } else {
      const target = ghostTarget(g, idx);
      let best = options[0], bestD = Infinity;
      for (const dir of options) {
        const d = DIRS[dir];
        const dd = Math.hypot(t.c + d.x - target.x, t.r + d.y - target.y);
        if (dd < bestD) { bestD = dd; best = dir; }
      }
      g.dir = best;
    }
  }
  const d = DIRS[g.dir];
  g.x += d.x * speed;
  g.y += d.y * speed;
  if (d.x !== 0) g.y = Math.round(g.y);
  else g.x = Math.round(g.x);
  wrap(g);
}

function handleCollisions() {
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    if (g.eaten || g.inside) continue;
    if (Math.hypot(g.x - pac.x, g.y - pac.y) < 0.6) {
      if (g.scared) {
        g.eaten = true;
        g.scared = false;
        score += 200;
        updateHud();
      } else {
        lives--;
        updateHud();
        if (lives <= 0) {
          state = "lost";
          messageEl.textContent = "GAME OVER - Press Enter to restart";
        } else {
          state = "dying";
          dyingTimer = 1.2;
        }
        return;
      }
    }
  }
}

function step(dt) {
  tick++;
  if (state === "dying") {
    dyingTimer -= dt;
    if (dyingTimer <= 0) {
      resetActors();
      frightened = 0;
      state = "ready";
      messageEl.textContent = "Press an arrow key or WASD to move";
    }
    return;
  }
  if (state !== "playing") return;

  if (frightened > 0) {
    frightened -= dt;
    if (frightened <= 0) ghosts.forEach(g => g.scared = false);
  }
  movePac(dt);
  ghosts.forEach((g, i) => { if (!g.eaten) moveGhost(g, i, dt); });
  handleCollisions();
}

/* ---------- three.js sync ---------- */

const pacAngle = { right: 0, left: Math.PI, up: Math.PI / 2, down: -Math.PI / 2, none: 0 };

function render3d() {
  pacPivot.position.set(worldX(pac.x), worldY(pac.y), TILE * 0.5);
  if (state === "dying") {
    const p = Math.max(0.02, 1 - dyingTimer / 1.2);
    pacPivot.scale.setScalar(p);
  } else {
    pacPivot.scale.setScalar(1);
  }
  if (pacMesh) {
    const open = Math.abs(Math.sin(pac.mouth)) * 0.6;
    pacMesh.geometry.dispose();
    pacMesh.geometry = new THREE.SphereGeometry(TILE * 0.5, 24, 2, Math.PI * 0.15 + open, Math.PI * 1.7 - open * 2);
    pacPivot.rotation.z = pacAngle[pac.dir] || 0;
  }

  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    const grp = ghostGroups[i];
    grp.visible = !g.eaten;
    if (g.eaten) continue;
    grp.position.set(worldX(g.x), worldY(g.y), Math.sin(tick * 0.1 + i) * 2);
    const d = DIRS[g.dir];
    grp.userData.eyes.position.set(d.x * 3, d.y * 3, 0);
    const mat = g.scared ? scaredMats[(frightened < 2 && tick % 20 < 10) ? 1 : 0] : null;
    grp.userData.body.material.color.set(g.scared ? (mat ? mat.color : 0x2121ff) : GHOST_COLORS[i]);
  }

  const pulse = 1 + Math.sin(tick * 0.15) * 0.3;
  if (pelletMesh) {
    const m = new THREE.Matrix4();
    pelletMesh.userData.cells.forEach((cell, idx) => {
      const s = dots.has(cell.r * COLS + cell.c) ? pulse : 0.0001;
      m.makeScale(s, s, s);
      m.setPosition(worldX(cell.c), worldY(cell.r), 6);
      pelletMesh.setMatrixAt(idx, m);
    });
    pelletMesh.instanceMatrix.needsUpdate = true;
  }

  renderer.render(scene, camera);
}

/* ---------- input ---------- */

const keys = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right"
};

window.addEventListener("keydown", (e) => {
  if (keys[e.key]) {
    pac.want = keys[e.key];
    if (state === "ready") {
      state = "playing";
      messageEl.textContent = "";
    }
    e.preventDefault();
  }
  if (e.key === "Enter" && (state === "lost" || state === "won")) newGame();
});

const params = new URLSearchParams(location.search);
const autoplay = params.has("autoplay");

if (autoplay) {
  const autoDirs = ["right", "left", "up", "down"];
  setInterval(() => {
    if (state === "ready") { state = "playing"; messageEl.textContent = ""; }
    pac.want = autoDirs[Math.floor(Math.random() * 4)];
  }, 200);
}

newGame();
if (autoplay) state = "playing";

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  step(dt);
  render3d();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.pacman = {
  getState: () => ({ state, score, lives, dots: dots.size, totalDots }),
  start: () => { state = "playing"; },
  press: (d) => { pac.want = d; }
};
