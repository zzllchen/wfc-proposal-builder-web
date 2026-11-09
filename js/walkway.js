/* WFC Proposal Builder: walkway distances. Given the walkway the AMR may drive on (a closed loop drawn on the layout), the drop-off spot and the
   pick-up stations, finds the SHORTEST drivable route from the drop-off to every station (the AMR can go round the loop either way) and says which
   station is the farthest. Units are whatever the points are in (the picture's pixels, or fractions); the caller turns them into metres.
   WFCWalkway.routes({ loop: [{x,y}...] (closed; with open: true the last point does not join the first), start: {x,y}, stations: [{ id, label, x, y }] })
     -> [{ id, label, len, pts: [{x,y}...] (start to station), way: 'left' | 'right' | '' }], and .farthest(list) picks the longest one.                    */
(function (root) {
  'use strict';
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // the nearest point of the loop to p: { seg, t, x, y }
  function snap(loop, p, open) {
    let best = null;
    for (let i = 0; i < (open ? loop.length - 1 : loop.length); i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0, q = { x: a.x + dx * t, y: a.y + dy * t }, d = dist(p, q);
      if (!best || d < best.d - 1e-9) best = { seg: i, t, x: q.x, y: q.y, d };
    }
    return best;
  }

  function routes(o) {
    const loop = (o.loop || []).map(p => ({ x: +p.x, y: +p.y })), st = o.stations || [];
    if (loop.length < 3 || !o.start) return [];
    // every point that touches the loop (the start and each station) becomes a node on the loop edge it is nearest to
    const att = [{ key: 'start', p: o.start }].concat(st.map((s, i) => ({ key: 'st' + i, p: s })));
    att.forEach(a => { a.snap = snap(loop, a.p, o.open); });
    // nodes: loop corners, then the attachment points; each loop edge is cut at its attachment points, in order
    const nodes = loop.map(p => ({ x: p.x, y: p.y })), idx = {};
    const bySeg = loop.map(() => []);
    att.forEach(a => bySeg[a.snap.seg].push(a));
    const edges = [];   // [from, to, length]
    for (let i = 0; i < (o.open ? loop.length - 1 : loop.length); i++) {
      const list = bySeg[i].slice().sort((p, q) => p.snap.t - q.snap.t);
      let prev = i;
      list.forEach(a => { nodes.push({ x: a.snap.x, y: a.snap.y }); idx[a.key] = nodes.length - 1; edges.push([prev, idx[a.key]]); prev = idx[a.key]; });
      edges.push([prev, (i + 1) % loop.length]);
    }
    const adj = nodes.map(() => []);
    edges.forEach(([a, b]) => { const d = dist(nodes[a], nodes[b]); adj[a].push([b, d]); adj[b].push([a, d]); });
    // Dijkstra from the start
    const D = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false), s0 = idx.start; D[s0] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < nodes.length; i++) if (!done[i] && D[i] < Infinity && (u < 0 || D[i] < D[u])) u = i;
      if (u < 0) break; done[u] = true;
      adj[u].forEach(([v, d]) => { if (D[u] + d < D[v] - 1e-9) { D[v] = D[u] + d; prev[v] = u; } });
    }
    const stub0 = dist(o.start, nodes[s0]);
    return st.map((s, i) => {
      const n = idx['st' + i], chain = []; for (let c = n; c >= 0; c = prev[c]) chain.push(c); chain.reverse();
      const pts = [{ x: o.start.x, y: o.start.y }];
      chain.forEach(c => { const q = { x: nodes[c].x, y: nodes[c].y }, l = pts[pts.length - 1]; if (dist(l, q) > 1e-9) pts.push(q); });
      const e = { x: s.x, y: s.y }; if (dist(pts[pts.length - 1], e) > 1e-9) pts.push(e);
      // which way round: does the route leave the entry going up or down? (screen up is smaller y)
      const first = chain[1] !== undefined ? nodes[chain[1]] : null, way = first && first.y < nodes[s0].y - 1e-9 ? 'up' : first && first.y > nodes[s0].y + 1e-9 ? 'down' : '';
      return { id: s.id, label: s.label, len: stub0 + D[n] + dist(nodes[n], s), pts, way };
    });
  }
  const farthest = list => list.reduce((a, b) => (!a || b.len > a.len + 1e-9) ? b : a, null);

  const API = { routes, farthest, snap };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCWalkway = API;
})(typeof window !== 'undefined' ? window : globalThis);
