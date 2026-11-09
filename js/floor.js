/* WFC Proposal Builder: the floor. Reads the layout PICTURE and works out where an AMR can drive: light, plain floor is free; walls (thin dark lines),
   machines and coloured production blocks, text and dark areas are blocked. A route that Claude drew is checked against that: one that goes through a wall
   is redrawn along open floor (straight runs, 90-degree turns, as few turns as possible, kept to the middle of the aisle), and the drop-off room's door is
   put where the route really goes through the wall.
   WFCFloor.grid({ data (RGBA), width, height })      -> grid g (g.w, g.h, g.k = picture pixels per grid cell)
   WFCFloor.route(g, a, b, opt)                       -> { pts: [{x,y}...] } in picture pixels | null          (a, b in picture pixels; opt.allowed = cells it may use)
   WFCFloor.crossings(g, pts, ignoreEnd)              -> how many steps of the line lie on blocked floor (walls, machines), ignoring the last ignoreEnd px at each end
   WFCFloor.findDoor(g, pts, near)                    -> where a route goes through a gap in a thin wall (the door; the one nearest to `near` if given) | null
   WFCFloor.refine(plan, g, aspect)                   -> { plan, notes }: routes that cross a wall are redrawn through open floor and the door; the door is put on the route
   WFCFloor.wallMap(g)                                -> RGBA picture of the grid (free floor white, walls and machines black), for Claude to read                         */
(function (root) {
  'use strict';
  const LUMA = 178, CHROMA = 46, DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  function grid(img, opt) {
    opt = opt || {};
    const W = img.width, H = img.height, d = img.data, k = Math.max(1, Math.ceil(Math.max(W, H) / (opt.maxSide || 800)));
    const w = Math.ceil(W / k), h = Math.ceil(H / k), blk = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let bl = 0;                                             // a cell is blocked if any pixel in it is (thin walls must survive shrinking)
      for (let yy = y * k; yy < Math.min(H, y * k + k) && !bl; yy++) for (let xx = x * k; xx < Math.min(W, x * k + k); xx++) {
        const i = (yy * W + xx) * 4, r = d[i], g = d[i + 1], b = d[i + 2], L = (r * 299 + g * 587 + b * 114) / 1000, ch = Math.max(r, g, b) - Math.min(r, g, b);
        if (L < LUMA || ch > CHROMA) { bl = 1; break; }
      }
      blk[y * w + x] = bl;
    }
    // grow the blocked cells by one (a thin wall becomes three cells wide, so no path can slip through a diagonal)
    const bk = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (blk[y * w + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) bk[Y * w + X] = 1; }
    // distance of every free cell to the nearest blocked one (two passes), to keep routes in the middle of aisles
    const dist = new Float32Array(w * h), BIG = 1e4;
    for (let i = 0; i < w * h; i++) dist[i] = bk[i] ? 0 : BIG;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1); if (y > 0) dist[i] = Math.min(dist[i], dist[i - w] + 1); }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (x < w - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1); if (y < h - 1) dist[i] = Math.min(dist[i], dist[i + w] + 1); }
    return { w, h, k, W, H, blocked: bk, dist, raw: blk };
  }

  // the grid as a picture: free floor white, walls and machines black (thin walls as they are, not grown), 1 grid cell = 1 pixel
  function wallMap(g) {
    const d = new Uint8ClampedArray(g.w * g.h * 4);
    for (let i = 0; i < g.w * g.h; i++) { const v = g.raw[i] ? 0 : 255; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    return { data: d, width: g.w, height: g.h };
  }

  // the nearest free cell to (x, y), picture pixels in, grid cell out
  function nearestFree(g, p) {
    const cx = Math.max(0, Math.min(g.w - 1, Math.round(p.x / g.k - 0.5))), cy = Math.max(0, Math.min(g.h - 1, Math.round(p.y / g.k - 0.5)));
    if (!g.blocked[cy * g.w + cx]) return [cx, cy];
    for (let r = 1; r < 40; r++) {
      let best = null, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= g.w || Y >= g.h || g.blocked[Y * g.w + X]) continue;
        const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = [X, Y]; }
      }
      if (best) return best;
    }
    return null;
  }

  // a small binary heap
  function Heap() { const a = []; return { push(k, v) { a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }, pop() { const t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { let m = i; const L = 2 * i + 1, R = L + 1; if (L < a.length && a[L][0] < a[m][0]) m = L; if (R < a.length && a[R][0] < a[m][0]) m = R; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; }, get size() { return a.length; } }; }

  // shortest route through free floor in straight runs, a penalty for turns, and a small penalty for hugging walls
  function route(g, a, b, opt) {
    opt = opt || {};
    const s = nearestFree(g, a), t = nearestFree(g, b); if (!s || !t) return null;
    const allowed = opt.allowed || null; if (allowed) { allowed[s[1] * g.w + s[0]] = 1; allowed[t[1] * g.w + t[0]] = 1; }
    const TURN = opt.turn === undefined ? 14 : opt.turn, W = g.w, N = W * g.h, ROOM = opt.room === undefined ? 6 : opt.room, PEN = opt.hug === undefined ? 0.15 : opt.hug;
    const cost = new Float32Array(N * 4).fill(Infinity), from = new Int32Array(N * 4).fill(-1), H = Heap();
    const cell = (x, y) => y * W + x;
    for (let d = 0; d < 4; d++) { cost[cell(s[0], s[1]) * 4 + d] = 0; H.push(0, cell(s[0], s[1]) * 4 + d); }
    let end = -1;
    while (H.size) {
      const [c, st] = H.pop(); if (c > cost[st]) continue;
      const ci = st >> 2, d = st & 3, x = ci % W, y = (ci / W) | 0;
      if (x === t[0] && y === t[1]) { end = st; break; }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue;
        const nx = x + DIRS[nd][0], ny = y + DIRS[nd][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= g.h) continue;
        const ni = cell(nx, ny); if (g.blocked[ni] || (allowed && !allowed[ni])) continue;
        const room = g.dist[ni], step = 1 + (room < ROOM ? (ROOM - room) * PEN : 0) + (nd !== d ? TURN : 0), nc = Math.fround(c + step), ns = ni * 4 + nd;   // fround: the costs are stored as 32-bit floats
        if (nc < cost[ns]) { cost[ns] = nc; from[ns] = st; H.push(nc, ns); }
      }
    }
    if (end < 0) return null;
    const cells = []; for (let st = end; st >= 0; st = from[st]) cells.push(st >> 2); cells.reverse();
    // corner points only (picture pixels, the centre of each cell)
    const P = i => ({ x: ((i % W) + 0.5) * g.k, y: (((i / W) | 0) + 0.5) * g.k }), pts = [P(cells[0])];
    for (let i = 1; i < cells.length - 1; i++) { const p0 = cells[i - 1], p1 = cells[i], p2 = cells[i + 1]; if ((p1 - p0) !== (p2 - p1)) pts.push(P(p1)); }
    if (cells.length > 1) pts.push(P(cells[cells.length - 1]));
    return { pts: straighten(pts, a, b, g.k), cells: cells.length };
  }

  // the exact start and end go on the ends, a jog of a couple of pixels becomes straight
  function straighten(pts, a, b, k) {
    const tol = Math.max(2.5, k * 2.5), out = [];
    pts.forEach(p => { const q = { x: p.x, y: p.y }, pr = out[out.length - 1]; if (pr && Math.abs(q.x - pr.x) < 0.01 && Math.abs(q.y - pr.y) < 0.01) return; out.push(q); });
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < out.length - 2; i++) {   // remove short jogs: a segment shorter than tol between two parallel runs
      const p = out[i], q = out[i + 1], len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < tol) { const before = out[i - 1], after = out[i + 2]; if (Math.abs(before.x - p.x) < 0.01 && Math.abs(after.x - q.x) < 0.01) { q.x = p.x; out.splice(i, 1); } else if (Math.abs(before.y - p.y) < 0.01 && Math.abs(after.y - q.y) < 0.01) { q.y = p.y; out.splice(i, 1); } }
    }
    const res = out.filter((p, i) => { if (i === 0 || i === out.length - 1) return true; const u = out[i - 1], v = out[i + 1]; return !((Math.abs(u.x - p.x) < 0.01 && Math.abs(p.x - v.x) < 0.01) || (Math.abs(u.y - p.y) < 0.01 && Math.abs(p.y - v.y) < 0.01)); });
    const join = (e, p, atStart) => {   // the true end (a pick-up point sits on the edge of a machine) joined by one short square step
      const dx = Math.abs(e.x - p.x), dy = Math.abs(e.y - p.y);
      if (dx < 0.5 && dy < 0.5) { p.x = e.x; p.y = e.y; return; }
      const add = [];
      if (dx >= 0.5 && dy >= 0.5) add.push(dx >= dy ? { x: e.x, y: p.y } : { x: p.x, y: e.y });
      add.push({ x: e.x, y: e.y });
      if (atStart) res.unshift(...add.reverse()); else res.push(...add);
    };
    join(a, res[0], true); join(b, res[res.length - 1], false);
    return res;
  }
  const lengthOf = pts => pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);

  // how many steps of a line lie on blocked floor (walls, machines, text), not counting the last few pixels at each end (the station is on a machine's edge)
  function crossings(g, pts, ignoreEnd) {
    ignoreEnd = ignoreEnd === undefined ? 12 : ignoreEnd;
    const total = lengthOf(pts); let hits = 0, run = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L / (g.k * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, along = run + L * u;
        if (along < ignoreEnd || along > total - ignoreEnd) continue;
        const cx = Math.max(0, Math.min(g.w - 1, Math.floor(x / g.k))), cy = Math.max(0, Math.min(g.h - 1, Math.floor(y / g.k)));
        if (g.blocked[cy * g.w + cx]) hits++;
      }
      run += L;
    }
    return hits;
  }

  // The drop-off area is a room: its outline is a wall with ONE gap, the door. (The picture's own walls may be incomplete, and the warehouse outline in a
  // layout is only a marking.) box and door in picture pixels; the gap is 2 x half pixels wide, centred on the point of the outline nearest to the door.
  function withBarrier(g, box, door, half) {
    half = half || 7;
    const blocked = Uint8Array.from(g.blocked), x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
    const cand = [{ x: Math.max(x0, Math.min(x1, door.x)), y: y0 }, { x: Math.max(x0, Math.min(x1, door.x)), y: y1 }, { x: x0, y: Math.max(y0, Math.min(y1, door.y)) }, { x: x1, y: Math.max(y0, Math.min(y1, door.y)) }];
    const gate = cand.reduce((a, b) => Math.hypot(b.x - door.x, b.y - door.y) < Math.hypot(a.x - door.x, a.y - door.y) ? b : a);
    for (let cy = 0; cy < g.h; cy++) for (let cx = 0; cx < g.w; cx++) {
      const x = (cx + 0.5) * g.k, y = (cy + 0.5) * g.k, t = 1.6 * g.k;
      const onEdge = ((Math.abs(x - x0) < t || Math.abs(x - x1) < t) && y > y0 - t && y < y1 + t) || ((Math.abs(y - y0) < t || Math.abs(y - y1) < t) && x > x0 - t && x < x1 + t);
      if (onEdge && Math.hypot(x - gate.x, y - gate.y) > half) blocked[cy * g.w + cx] = 1;
    }
    return Object.assign({}, g, { blocked, gate, half });
  }

  // the cells within r picture pixels of a line (a corridor that keeps a re-drawn route on the aisles Claude chose)
  function corridor(g, pts, r) {
    const m = new Uint8Array(g.w * g.h);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L / (g.k * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const x = a.x + (b.x - a.x) * s / steps, y = a.y + (b.y - a.y) * s / steps;
        for (let dy = -r; dy <= r; dy += g.k) for (let dx = -r; dx <= r; dx += g.k) {
          if (dx * dx + dy * dy > r * r) continue;
          const cx = Math.floor((x + dx) / g.k), cy = Math.floor((y + dy) / g.k); if (cx >= 0 && cy >= 0 && cx < g.w && cy < g.h) m[cy * g.w + cx] = 1;
        }
      }
    }
    return m;
  }

  // Where does a route go through a door? A door is a gap in a THIN wall: the route passes between two bits of wall close on either side of it, and that
  // wall stops a few pixels either way along the route (an aisle's walls run on). Returns the first one from the start of the route, or null.
  function findDoor(g, pts, near) {
    const blocked = (x, y) => { const cx = Math.floor(x / g.k), cy = Math.floor(y / g.k); return cx < 0 || cy < 0 || cx >= g.w || cy >= g.h || !!g.raw[cy * g.w + cx]; };
    const found = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1) continue;
      const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L, nx = -dy, ny = dx;
      for (let s = 3; s < L - 3; s += 1) {
        const x = a.x + dx * s, y = a.y + dy * s;
        let l = -1, r = -1;
        for (let k = 3; k <= 14 && (l < 0 || r < 0); k++) { if (l < 0 && blocked(x + nx * k, y + ny * k)) l = k; if (r < 0 && blocked(x - nx * k, y - ny * k)) r = k; }
        if (l < 0 || r < 0 || l + r < 8 || l + r > 28) continue;
        const shortWall = [-9, 9].every(o => !blocked(x + dx * o + nx * l, y + dy * o + ny * l) && !blocked(x + dx * o - nx * r, y + dy * o - ny * r));
        if (shortWall) { const last = found[found.length - 1]; if (!last || Math.hypot(last.x - x, last.y - y) > 6) found.push({ x, y, gap: l + r }); }
      }
    }
    if (!found.length) return null;
    return near ? found.reduce((p, q) => Math.hypot(q.x - near.x, q.y - near.y) < Math.hypot(p.x - near.x, p.y - near.y) ? q : p) : found[0];
  }

  // does a line leave the drop-off room anywhere except through its door?
  function leavesRoom(box, gate, pts, half) {
    const inside = p => p.x > box.x + 1 && p.x < box.x + box.w - 1 && p.y > box.y + 1 && p.y < box.y + box.h - 1;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L));
      let prev = inside(a);
      for (let s = 1; s <= steps; s++) { const q = { x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps }, cur = inside(q); if (prev && !cur && Math.hypot(q.x - gate.x, q.y - gate.y) > (half || 7) + 2) return true; prev = cur; }
    }
    return false;
  }

  const nearestOn = (pts, p) => { let bd = 1e9, bq = null; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0, q = { x: a.x + dx * u, y: a.y + dy * u }, d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bq = q; } } return bq; };

  /* ---------- fix up a drawn plan (coordinates in the plan are fractions of the picture) ---------- */
  // Claude's route is kept wherever it is right. A route that crosses a wall or a machine, or leaves the drop-off room anywhere but its door, is re-drawn along
  // open floor (in a corridor round the aisles Claude chose, and through the door). The door is put where the route really goes through the wall.
  function refine(plan, g, aspect) {
    const W = g.W, H = g.H, px = p => ({ x: p.x * W, y: p.y * H }), fr = p => ({ x: Math.round(p.x / W * 1e4) / 1e4, y: Math.round(p.y / H * 1e4) / 1e4 });
    const notes = [], out = JSON.parse(JSON.stringify(plan || {}));
    out.routes = out.routes || []; out.points = out.points || [];
    const door = out.points.find(p => p.kind === 'door'), dz = (out.zones || []).find(z => z.kind === 'drop');
    const box = dz ? { x: dz.x * W, y: dz.y * H, w: dz.w * W, h: dz.h * H } : null;
    const roomed = !!(box && door), G2 = roomed ? withBarrier(g, box, px(door)) : g, gate = roomed ? G2.gate : null;
    let first = null;
    out.routes = out.routes.map(r => {
      const pts = (r.pts || []).map(px); if (pts.length < 2) return r;
      const hitWall = crossings(g, pts) > 0, bad = hitWall || (roomed && leavesRoom(box, gate, pts));
      let res = pts;
      if (bad) {
        const link = roomed ? [pts[pts.length - 1], gate, nearestOn(pts, gate)] : [];
        let best = null;
        for (const rad of [14, 24, 40]) {
          const allowed = corridor(G2, pts, rad); if (link.length) { const lk = corridor(G2, link, rad); for (let i = 0; i < allowed.length; i++) if (lk[i]) allowed[i] = 1; }
          const rt = route(G2, pts[0], pts[pts.length - 1], { allowed }); if (rt) { best = rt.pts; break; }
        }
        if (!best) { const rt = route(G2, pts[0], pts[pts.length - 1]); if (rt) best = rt.pts; }
        if (best) { res = best; notes.push('The route "' + (r.label || 'Route') + '" ' + (hitWall ? 'went through a wall' : 'left the drop-off area away from its door') + ', so it was redrawn along open floor' + (roomed ? ' through the door' : '') + '.'); }
      }
      if (!first) first = res;
      return bad && res !== pts ? Object.assign({}, r, { pts: res.map(fr) }) : r;
    });
    // the door goes where the route goes through the wall: a gap in a thin wall if there is one, else where the route leaves the drop-off area
    if (door && first) {
      const dp = px(door); let at = findDoor(g, first, dp);
      if (at && Math.hypot(at.x - dp.x, at.y - dp.y) > 0.2 * Math.max(W, H)) at = null;
      if (!at && roomed) { for (let i = 1; i < first.length && !at; i++) { const a = first[i - 1], b = first[i], L = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)); for (let s = 0; s <= L && !at; s++) { const q = { x: a.x + (b.x - a.x) * s / L, y: a.y + (b.y - a.y) * s / L }; if (Math.hypot(q.x - gate.x, q.y - gate.y) < 6) at = q; } } }
      if (at) { const m = fr(at); if (Math.hypot((m.x - door.x) * W, (m.y - door.y) * H) > 3) notes.push('The door was moved onto the route, where it goes through the wall.'); door.x = m.x; door.y = m.y; }
    }
    return { plan: out, notes };
  }

  const API = { grid, route, crossings, refine, nearestFree, lengthOf, withBarrier, corridor, findDoor, leavesRoom, wallMap, LUMA, CHROMA };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCFloor = API;
})(typeof window !== 'undefined' ? window : globalThis);
