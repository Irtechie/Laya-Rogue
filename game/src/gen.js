// Procedural dungeon layouts. Seven archetypes per map; seeded by (mapId, tier).

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const W = 43, H = 27;

function blank(ch) {
  return Array.from({ length: H }, () => Array(W).fill(ch));
}
function inb(x, y) { return x >= 1 && y >= 1 && x < W - 1 && y < H - 1; }

function carveRoom(g, r) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++)
      if (inb(x, y)) g[y][x] = ".";
}
function carveCorr(g, x0, y0, x1, y1, rng) {
  let x = x0, y = y0;
  const hFirst = rng() < 0.5;
  const stepX = () => { while (x !== x1) { x += Math.sign(x1 - x); if (inb(x, y)) g[y][x] = "."; } };
  const stepY = () => { while (y !== y1) { y += Math.sign(y1 - y); if (inb(x, y)) g[y][x] = "."; } };
  if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
}
function center(r) { return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) }; }

function largestRegion(g) {
  const seen = Array.from({ length: H }, () => Array(W).fill(0));
  let best = null;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] !== "." || seen[y][x]) continue;
    const stack = [[x, y]], region = [];
    seen[y][x] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      region.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (inb(nx, ny) && g[ny][nx] === "." && !seen[ny][nx]) { seen[ny][nx] = 1; stack.push([nx, ny]); }
      }
    }
    if (!best || region.length > best.length) best = region;
  }
  return best;
}

function finish(g, rng) {
  const region = largestRegion(g);
  const keep = new Set(region.map(([x, y]) => x + "," + y));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (g[y][x] === "." && !keep.has(x + "," + y)) g[y][x] = "#";
  const grid = g.map(row => row.join(""));
  const floors = region.map(([x, y]) => ({ x, y }));
  return { grid, floors };
}

const LAYOUTS = [
  function roomsAndCorridors(rng) {
    const g = blank("#"); const rooms = [];
    for (let i = 0; i < 7; i++) {
      const r = { x: 1 + Math.floor(rng() * (W - 12)), y: 1 + Math.floor(rng() * (H - 9)), w: 5 + Math.floor(rng() * 5), h: 4 + Math.floor(rng() * 4) };
      let clash = false;
      for (const o of rooms)
        if (r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x && r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y) clash = true;
      if (!clash) { rooms.push(r); carveRoom(g, r); }
    }
    for (let i = 1; i < rooms.length; i++) {
      const a = center(rooms[i - 1]), b = center(rooms[i]);
      carveCorr(g, a.x, a.y, b.x, b.y, rng);
    }
    return finish(g, rng);
  },
  function ringHalls(rng) {
    const g = blank("#");
    for (let ring = 0; ring < 3; ring++) {
      const x0 = 2 + ring * 2, y0 = 2 + ring * 2, x1 = W - 3 - ring * 2, y1 = H - 3 - ring * 2;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
        if (x === x0 || x === x1 || y === y0 || y === y1) g[y][x] = ".";
      const gx = x0 + 2 + Math.floor(rng() * (x1 - x0 - 4)), gy = y0;
      g[gy][gx] = "#"; g[y1][gx] = "#";
      g[y0 + Math.floor(rng() * (y1 - y0))][x0] = "#";
      g[y0 + Math.floor(rng() * (y1 - y0))][x1] = "#";
    }
    for (let i = 0; i < 3; i++) {
      const x = 6 + Math.floor(rng() * (W - 12)), y = 4 + Math.floor(rng() * (H - 8));
      carveRoom(g, { x, y, w: 3, h: 3 });
      carveCorr(g, x + 1, y + 1, 3, 3, rng);
    }
    return finish(g, rng);
  },
  function caverns(rng) {
    const g = blank("#");
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = rng() < 0.47 ? "#" : ".";
    for (let it = 0; it < 4; it++) {
      const n = blank("#");
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        let w = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (!inb(nx, ny) || g[ny][nx] === "#") w++;
        }
        n[y][x] = w >= 5 ? "#" : ".";
      }
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = n[y][x];
    }
    return finish(g, rng);
  },
  function chessboard(rng) {
    const g = blank(".");
    for (let y = 3; y < H - 3; y += 4) for (let x = 5; x < W - 5; x += 6) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g[y + dy][x + dx] = "#";
    }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!inb(x, y)) g[y][x] = "#";
    for (let i = 0; i < 5; i++) carveRoom(g, { x: 3 + Math.floor(rng() * (W - 10)), y: 3 + Math.floor(rng() * (H - 10)), w: 5, h: 4 });
    return finish(g, rng);
  },
  function serpent(rng) {
    const g = blank("#");
    let dir = 1;
    for (let col = 3; col < W - 4; col += 5) {
      const y0 = dir === 1 ? 2 : H - 3;
      const y1 = dir === 1 ? H - 3 : 2;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { g[y][col] = "."; g[y][col + 1] = "."; }
      const joinY = dir === 1 ? H - 3 : 2;
      for (let c = col; c <= col + 5 && c < W - 2; c++) g[joinY][c] = ".";
      dir = -dir;
    }
    for (let i = 0; i < 4; i++) carveRoom(g, { x: 4 + Math.floor(rng() * (W - 12)), y: 3 + Math.floor(rng() * (H - 9)), w: 5, h: 4 });
    return finish(g, rng);
  },
  function gardens(rng) {
    const g = blank(".");
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!inb(x, y)) g[y][x] = "#";
    for (let gy = 4; gy < H - 4; gy += 6) for (let gx = 4; gx < W - 4; gx += 7) {
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) g[gy + dy][gx + dx] = "#";
      g[gy + 1][gx + 1] = ".";
      carveRoom(g, { x: gx + 4, y: gy - 2, w: 3, h: 3 });
      carveRoom(g, { x: gx - 3, y: gy + 3, w: 3, h: 3 });
    }
    return finish(g, rng);
  },
  function arena(rng) {
    const g = blank("#");
    carveRoom(g, { x: 2, y: 2, w: W - 4, h: H - 4 });
    carveRoom(g, { x: 8, y: 5, w: W - 16, h: H - 10 });
    for (let y = 5; y < H - 5; y++) for (let x = 8; x < W - 8; x++) {
      const edge = y === 5 || y === H - 6 || x === 8 || x === W - 9;
      if (edge && !((y % 5 === 0) || (x % 6 === 0))) g[y][x] = "#";
    }
    for (const [px, py] of [[13, 9], [W - 14, 9], [13, H - 10], [W - 14, H - 10], [Math.floor(W / 2), Math.floor(H / 2)]])
      g[py][px] = "#";
    for (let i = 0; i < 4; i++) {
      const side = i % 2, pos = Math.floor(i / 2);
      if (side === 0) carveRoom(g, { x: 2, y: 4 + pos * 12, w: 5, h: 5 });
      else carveRoom(g, { x: W - 7, y: 4 + pos * 12, w: 5, h: 5 });
    }
    return finish(g, rng);
  }
];

export const LAYOUT_NAMES = ["rooms", "rings", "caverns", "chessboard", "serpent", "gardens", "arena"];

export function generateOutdoor(worldKey) {
  const rng = makeRng(hashStr(worldKey + ":out"));
  const g = blank(".");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) g[y][x] = "#";
  // tree and rock scatter in clumps
  for (let n = 0; n < 14; n++) {
    const cx = 3 + Math.floor(rng() * (W - 6)), cy = 3 + Math.floor(rng() * (H - 6));
    const ch = rng() < 0.72 ? "T" : "r";
    for (let i = 0; i < 4 + Math.floor(rng() * 6); i++) {
      const x = cx + Math.floor(rng() * 5) - 2, y = cy + Math.floor(rng() * 4) - 2;
      if (inb(x, y)) g[y][x] = ch;
    }
  }
  // cellar building with a door cell
  const bx = 14 + Math.floor(rng() * 8), by = 6 + Math.floor(rng() * 6);
  for (let y = by; y < by + 5; y++) for (let x = bx; x < bx + 7; x++)
    if (inb(x, y)) g[y][x] = "#";
  for (let y = by + 1; y < by + 4; y++) for (let x = bx + 1; x < bx + 6; x++) g[y][x] = ".";
  const door = { x: bx + 3, y: by + 4 };
  g[door.y][door.x] = ".";
  // open approach apron in front of the door
  for (let y = door.y + 1; y < Math.min(H - 1, door.y + 5); y++)
    for (let x = door.x - 2; x <= door.x + 2; x++) if (inb(x, y)) g[y][x] = ".";
  const floors = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === ".") floors.push({ x, y });
  const region = largestRegionFrom(g, door.x, door.y);
  return { grid: g.map(r => r.join("")), floors: region || floors, building: { x: bx, y: by, w: 7, h: 5, door } };
}

function largestRegionFrom(g, sx, sy) {
  const seen = new Set();
  const stack = [[sx, sy]], region = [];
  seen.add(sx + "," + sy);
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (g[cy][cx] === ".") region.push({ x: cx, y: cy });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = nx + "," + ny;
      if (inb(nx, ny) && g[ny][nx] === "." && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
    }
  }
  return region;
}

export function generateLayout(mapId, tier, archetype) {
  const rng = makeRng(hashStr(mapId + ":" + tier + ":" + archetype));
  return LAYOUTS[archetype % LAYOUTS.length](rng);
}

export function layoutArchetype(mapId, tier) {
  return hashStr(mapId + ":" + tier) % LAYOUTS.length;
}
