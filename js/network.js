/* WFC Proposal Builder: the walkway network. Every route drawn on the layout lies on a walkway; put together they are a map of where the AMR may drive.
   This joins them into one network (routes that share a stretch of walkway or cross each other are cut where they meet) and hangs every point on it (pick-up
   points, drop-off spots, the door, standby, charger), so the shortest drivable way between ANY two points can be found, not only the drawn routes.
   Coordinates are fractions of the layout picture, like the drawing itself (x across, y down); distances inside are in picture widths (y divided by aspect).
   WFCNet.build({ routes: [{ pts: [{x,y}...] }], points: [{ id, x, y }], aspect }) -> net
   net.path(a, b)    -> { pts: [{x,y}...], len } | null      a, b: a point id, a point, or any {x,y}; len in picture widths (multiply by metres per width)
   net.nodes, net.edges                                                                                                                                      */
(function (root) {
  'use strict';
  const EPS = 4e-4;                       // 0.04 % of the picture width: two corners closer than this are the same corner

  function build(o) {
    const asp = +o.aspect || 1, U = p => ({ x: p.x, y: p.y / asp }), back = p => ({ x: p.x, y: p.y * asp });
    const nodes = [], adj = [];
    const nodeAt = p => { for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) < EPS) return i; nodes.push({ x: p.x, y: p.y }); adj.push([]); return nodes.length - 1; };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    // 1. every drawn stretch of walkway
    let segs = [];
    (o.routes || []).forEach(r => { const pts = (r.pts || []).map(U); for (let i = 1; i < pts.length; i++) if (dist(pts[i - 1], pts[i]) > EPS) segs.push([pts[i - 1], pts[i]]); });
    // 2. cut every stretch where another one ends on it or crosses it
    const onSeg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0; if (t <= 0 || t >= 1) return null; const q = { x: a.x + dx * t, y: a.y + dy * t }; return dist(p, q) < EPS ? { t, q } : null; };
    const cross = (a, b, c, d) => {   // proper crossing of two segments (not touching at an end)
      const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, den = r.x * s.y - r.y * s.x; if (Math.abs(den) < 1e-12) return null;
      const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
      if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
      return { t, q: { x: a.x + r.x * t, y: a.y + r.y * t } };
    };
    segs.forEach(([a, b]) => {
      const cuts = [{ t: 0, q: a }, { t: 1, q: b }];
      segs.forEach(([c, d]) => { if (c === a) return; [c, d].forEach(p => { const h = onSeg(p, a, b); if (h) cuts.push(h); }); const x = cross(a, b, c, d); if (x) cuts.push(x); });
      cuts.sort((p, q) => p.t - q.t);
      for (let i = 1; i < cuts.length; i++) { const u = nodeAt(cuts[i - 1].q), v = nodeAt(cuts[i].q); if (u === v || adj[u].some(e => e.to === v)) continue; const w = dist(nodes[u], nodes[v]); adj[u].push({ to: v, w }); adj[v].push({ to: u, w }); }
    });
    // 3. hang a point on the network: on it, or joined to the nearest bit of it by a short square step
    const hung = {};
    function hang(p) {
      const q = U(p); let best = null;
      for (let u = 0; u < nodes.length; u++) for (const e of adj[u]) {
        if (e.to < u) continue;
        const a = nodes[u], b = nodes[e.to], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)) : 0, c = { x: a.x + dx * t, y: a.y + dy * t }, d = dist(q, c);
        if (!best || d < best.d - 1e-9) best = { u, v: e.to, t, c, d };
      }
      if (!best) return nodeAt(q);
      let n;
      if (best.t <= 1e-9 || dist(nodes[best.u], best.c) < EPS) n = best.u; else if (best.t >= 1 - 1e-9 || dist(nodes[best.v], best.c) < EPS) n = best.v;
      else {   // cut the edge in two at the foot of the point
        n = nodeAt(best.c); const ui = adj[best.u].findIndex(e => e.to === best.v), vi = adj[best.v].findIndex(e => e.to === best.u);
        adj[best.u].splice(ui, 1); adj[best.v].splice(vi, 1);
        [best.u, best.v].forEach(x => { const w = dist(nodes[x], nodes[n]); adj[x].push({ to: n, w }); adj[n].push({ to: x, w }); });
      }
      if (best.d < EPS) return n;
      const foot = nodes[n], dx = Math.abs(q.x - foot.x), dy = Math.abs(q.y - foot.y);
      const via = (dx > 0.004 && dy > 0.004) ? (dx >= dy ? { x: q.x, y: foot.y } : { x: foot.x, y: q.y }) : null;   // one square corner unless it is a straight step
      let prev = n; const chain = via ? [via, q] : [q];
      chain.forEach(pt => { const m = nodeAt(pt); if (m === prev) return; const w = dist(nodes[prev], nodes[m]); adj[prev].push({ to: m, w }); adj[m].push({ to: prev, w }); prev = m; });
      return prev;
    }
    const attach = p => { if (p.id !== undefined && hung[p.id] !== undefined) return hung[p.id]; const n = hang(p); if (p.id !== undefined) hung[p.id] = n; return n; };
    (o.points || []).forEach(p => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.id !== undefined) attach(p); });
    const byId = id => (o.points || []).find(p => p.id === id);

    // 4. the shortest way (Dijkstra)
    function path(a, b) {
      a = typeof a === 'object' ? a : byId(a); b = typeof b === 'object' ? b : byId(b); if (!a || !b) return null;
      const s = attach(a), t = attach(b), D = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false); D[s] = 0;
      for (;;) { let u = -1; for (let i = 0; i < nodes.length; i++) if (!done[i] && D[i] < Infinity && (u < 0 || D[i] < D[u])) u = i; if (u < 0 || u === t) break; done[u] = true; adj[u].forEach(e => { if (D[u] + e.w < D[e.to] - 1e-12) { D[e.to] = D[u] + e.w; prev[e.to] = u; } }); }
      if (!(D[t] < Infinity)) return null;
      const chain = []; for (let c = t; c >= 0; c = prev[c]) chain.push(c); chain.reverse();
      let pts = chain.map(i => back(nodes[i]));
      // the exact ends of the two points, then drop corners that are not corners
      const first = { x: a.x, y: a.y }, last = { x: b.x, y: b.y };
      if (Math.hypot(pts[0].x - first.x, (pts[0].y - first.y) / asp) > EPS) pts.unshift(first); else pts[0] = first;
      if (Math.hypot(pts[pts.length - 1].x - last.x, (pts[pts.length - 1].y - last.y) / asp) > EPS) pts.push(last); else pts[pts.length - 1] = last;
      pts = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !(Math.abs((p.x - pts[i - 1].x) * (pts[i + 1].y - p.y) - (p.y - pts[i - 1].y) * (pts[i + 1].x - p.x)) < 1e-9 && (p.x - pts[i - 1].x) * (pts[i + 1].x - p.x) + (p.y - pts[i - 1].y) * (pts[i + 1].y - p.y) > 0));
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, (pts[i].y - pts[i - 1].y) / asp);
      return { pts, len };
    }
    return { nodes, adj, path, attach, aspect: asp };
  }

  const API = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCNet = API;
})(typeof window !== 'undefined' ? window : globalThis);
