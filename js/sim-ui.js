/* WFC Proposal Builder: the Simulation tab. Draws the site layout as a tilted 3D model (or a flat plan) and drives a mini 3D model of the PROPOSED AMR (the
   1.5T pallet-jack AMR: white body, black base and forks, lidar mast, lifting a wooden pallet) at the stated speed, with live readings: speed (it really speeds
   up, slows for corners and creeps in to dock), distance, seconds, pallets moved, rate, battery. The default simulation is the LONGEST route, trip after trip.
   Pick any two points and press "Run task": the AMR drives to the first, picks up, carries to the second and puts down, with the leg-by-leg times.
   Click a station and the AMR is sent there next. "Save video" records the picture to a video file. All drawing is on one canvas, 1920 x 1080.
   "Full screen" (or F, or a double-click on the picture) presents the simulation alone with only the playback controls; Esc leaves it. */
(function (root) {
  'use strict';
  const Sim = root.WFCSim, esc = root.WFCSlides.esc;
  let W = 1920, H = 1080; const C30 = Math.cos(Math.PI / 6), S30 = 0.5, VIZ = 5;                                    // VIZ: the AMR is drawn this much bigger than life, so it can be seen
  const FONT = '"DM Sans", Arial, sans-serif', INK = '#0B1220', BLUE = '#2F5BD0', SLATE = '#3A4766', MUTE = '#5B6577', LIGHT = '#8FB0F5', AMBER = '#E3A21A', GREEN = '#1E8A55';
  let MAP = { x: 70, y: 160, w: 1330, h: 730 }; const HX = 1440, HW = 420;
  const $ = s => document.querySelector(s);
  let cv, ctx, S, D, model, img = null, imgSrc = '', t = 0, playing = true, speedF = 8, view = '3d', last = 0, raf = 0, recState = null, cam = null, inited = false;
  let hover = null, toast = null, hits = [], clockOverride = null, rows = [], dots = [], vz = VIZ;   // vz: how much bigger than life the AMR is drawn (the close-up draws it life size)
  // the 3D camera: drag to turn (az) and tilt (elev), scroll to zoom; the standard view is the isometric one
  const AZ0 = Math.PI / 4, ELEV0 = Math.asin(1 / Math.sqrt(3)), ELEV_MIN = 0.3, ELEV_MAX = 1.5, SPIN = 0.28;   // SPIN: radians a second for the 360 view (about 22 s a turn)
  let az = AZ0, elev = ELEV0, zoom = 1, pan = { x: 0, y: 0 }, orb = null, camMemo = null;   // the camera now; pan is the look-at point, in metres from the layout's centre
  let gl = { az: AZ0, elev: ELEV0, zoom: 1, px: 0, py: 0 }, spin = false, follow = null, picked = null, picks = [], cardHits = [];   // gl: where the camera is flying to
  const camTag = () => [view, az.toFixed(3), elev.toFixed(3), zoom.toFixed(3), pan.x.toFixed(2), pan.y.toFixed(2)].join(',');
  const viewMoved = () => Math.abs(az - AZ0) > 1e-3 || Math.abs(elev - ELEV0) > 1e-3 || Math.abs(zoom - 1) > 1e-3 || Math.abs(pan.x) > 1e-3 || Math.abs(pan.y) > 1e-3 || spin || !!picked || follow !== null;
  const clampV = (v, a, b) => Math.max(a, Math.min(b, v));
  let task = null, taskPts = [];                                                                     // task: the point-to-point run on screen (null = the longest route, trip after trip)
  // the shift simulation (js/ops.js): mode 'shift' plays a whole shift with every line, the queue, charging, doors and obstacles; mode 'trip' is one trip at a time
  let mode = 'shift', ops = null, opsAll = null, opsModel = null, opsSig = '', obsSince = {}, placing = false, selObs = null, dragObs = null, sheetOpen = '', unit = 'km';
  const SPEEDS = { shift: [1, 10, 60, 300, 1200], trip: [1, 2, 4, 8, 16] }, speedOf = { shift: 60, trip: 8 };
  const wall = () => clockOverride !== null ? clockOverride : performance.now() / 1000;

  /* ---------- small helpers ---------- */
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f)))); return `rgb(${c[0]},${c[1]},${c[2]})`; };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const txt = (s, x, y, size, weight, color, align) => { ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y); };
  // text that always stays inside its box: the size shrinks a little, then the end is cut and marked with ...
  function fitTxt(s, x, y, maxW, size, weight, color, align) {
    s = String(s); let sz = size; ctx.font = `${weight} ${sz}px ${FONT}`;
    while (ctx.measureText(s).width > maxW && sz > size * 0.72) { sz -= 1; ctx.font = `${weight} ${sz}px ${FONT}`; }
    if (ctx.measureText(s).width > maxW) { while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); s += '…'; }
    txt(s, x, y, sz, weight, color, align); return ctx.measureText(s).width;
  }
  const width = (s, size, weight) => { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(s).width; };
  const fmt = (v, d) => (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const mm = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const KIND = { out: LIGHT, load: SLATE, pivot: AMBER, drive: BLUE, unload: SLATE, go: LIGHT, wait: AMBER, charge: GREEN, swap: GREEN, idle: '#9AA6BC' };
  const tagOf = r => (/(\d+)\s*$/.exec(r.name || '') || [])[1] || (r.num !== undefined && r.num !== null && r.num !== '' ? String(r.num) : '•');   // the number shown on a station: the line's own number when its name ends in one
  const toScreen = (x, y, z) => cam.P(x, y, z || 0);
  const SQ = () => (cam && cam.sqr) || 1;   // how much flatter a circle on the floor looks than in the standard view (it follows the tilt)
  const planToWorld = p => [p.x * model.k, p.y / model.aspect * model.k];

  /* ---------- the camera: fit the whole layout into the picture ---------- */
  // the picture of the layout stays inside its own area, even when zoomed in (the cards and counters are never drawn over)
  const clipWorld = () => { if (dash) { ctx.beginPath(); ctx.rect(0, 0, W, H); } else rr(ctx, 50, 150, 1360, 800, 26); ctx.clip(); };
  const camera = () => {
    const key = [camTag(), model.k, model.aspect].join('|');
    if (!camMemo || camMemo.key !== key) camMemo = { key, cam: buildCam({ az, elev, zoom, px: pan.x, py: pan.y }) };
    return camMemo.cam;
  };
  // the camera for a given state (the one on screen, or the one it is flying to): an orthographic view that looks at the point (px, py) from the layout's centre
  function buildCam(st) {
    const k = model.k, asp = model.aspect, iso = view === '3d', box = MAP, h = k / asp;
    const K = C30 * Math.SQRT2, sE = Math.sin(st.elev), cE = Math.cos(st.elev);
    const proj = a => { const sA = Math.sin(a), cA = Math.cos(a); return (x, y, z) => iso ? [K * (x * sA - y * cA), K * sE * (x * cA + y * sA) - K * cE * (z || 0)] : [x, y]; };
    const extent = pr => { const cs = [pr(0, 0, 0), pr(k, 0, 0), pr(k, h, 0), pr(0, h, 0), pr(0, 0, 6)]; return { x0: Math.min(...cs.map(c => c[0])), x1: Math.max(...cs.map(c => c[0])), y0: Math.min(...cs.map(c => c[1])), y1: Math.max(...cs.map(c => c[1])) }; };
    const pr = proj(st.az), b = extent(pr), fit = e => Math.min(box.w / (e.x1 - e.x0), box.h / (e.y1 - e.y0));
    let sc = fit(b);
    if (iso) for (let a = 0; a < Math.PI; a += Math.PI / 18) sc = Math.min(sc, fit(extent(proj(a))));   // the size of the worst angle, so turning the view never makes the layout grow or shrink
    sc *= st.zoom;
    const c0 = pr(k / 2, h / 2, 0), ct = pr(k / 2 + st.px, h / 2 + st.py, 0);   // the look-at point lands where the layout's centre does when nothing is zoomed on
    const ox = box.x + (box.w - (b.x1 - b.x0) * sc) / 2 - b.x0 * sc + (c0[0] - ct[0]) * sc, oy = box.y + (box.h - (b.y1 - b.y0) * sc) / 2 - b.y0 * sc + (c0[1] - ct[1]) * sc;
    const P = (x, y, z) => { const q = pr(x, y, z); return [ox + q[0] * sc, oy + q[1] * sc]; }, o0 = P(0, 0, 0), ex = P(1, 0, 0), ey = P(0, 1, 0);
    return { iso, sc, ox, oy, az: st.az, elev: st.elev, sqr: iso ? sE / 0.57735 : 1, dir: iso ? [Math.cos(st.az), Math.sin(st.az)] : [Math.SQRT1_2, Math.SQRT1_2], ex: [ex[0] - o0[0], ex[1] - o0[1]], ey: [ey[0] - o0[0], ey[1] - o0[1]], P };
  }

  /* ---------- the world (drawn once, then copied each frame) ---------- */
  function drawGround() {
    const k = model.k, asp = model.aspect, w = k, h = k / asp, P = cam.P;
    const c = [P(0, 0, 0), P(w, 0, 0), P(w, h, 0), P(0, h, 0)], th = 16;
    ctx.save();
    if (cam.iso) {   // the visible sides of the floor slab: the edges that face the camera, the one facing away from the light a little darker
      [[0, 1, 0, -1], [1, 2, 1, 0], [2, 3, 0, 1], [3, 0, -1, 0]].forEach(([i0, i1, nx, ny]) => {
        if (nx * cam.dir[0] + ny * cam.dir[1] <= 0.02) return;
        ctx.fillStyle = shade('#C8D2E6', (0.9 + 0.12 * (ny - nx) / Math.SQRT2) / 0.985);
        ctx.beginPath(); ctx.moveTo(c[i0][0], c[i0][1]); ctx.lineTo(c[i1][0], c[i1][1]); ctx.lineTo(c[i1][0], c[i1][1] + th); ctx.lineTo(c[i0][0], c[i0][1] + th); ctx.fill();
      });
    }
    ctx.restore();
    ctx.save(); ctx.beginPath(); c.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#F2F5FB'; ctx.fillRect(0, 0, W, H);
    if (img && img.complete && img.naturalWidth) {
      const s = k / img.naturalWidth;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.setTransform(s * cam.ex[0], s * cam.ex[1], s * cam.ey[0], s * cam.ey[1], c[0][0], c[0][1]); ctx.drawImage(img, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.beginPath(); c.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();   // calm the picture so the routes stand out
    }
    ctx.restore();
    ctx.save(); ctx.strokeStyle = '#B2BFD8'; ctx.lineWidth = 2; ctx.beginPath(); c.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  function drawAreas() {
    const lp = S.layoutPlan || {}, P = cam.P;
    (lp.zones || []).filter(z => z.kind === 'pickup' || z.kind === 'drop').forEach(z => {
      const col = z.kind === 'pickup' ? BLUE : SLATE, a = planToWorld({ x: z.x, y: z.y }), b = planToWorld({ x: z.x + z.w, y: z.y + z.h }), c = [P(a[0], a[1], 0), P(b[0], a[1], 0), P(b[0], b[1], 0), P(a[0], b[1], 0)];
      ctx.save(); ctx.beginPath(); c.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
      ctx.globalAlpha = .08; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = .75; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    });
  }
  function stroke(pts, w, color, dash, cap) { ctx.save(); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = cap || 'round'; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.restore(); }
  // part of a line (distance a to b from its start) as screen points; P in world metres, cum the running length
  function partPath(P, cum, a, b) {
    const total = cum[cum.length - 1]; a = Math.max(0, Math.min(total, a)); b = Math.max(0, Math.min(total, b));
    const at = dd => { for (let i = 0; i < P.length - 1; i++) if (dd <= cum[i + 1] + 1e-9) { const L = cum[i + 1] - cum[i], u = L ? (dd - cum[i]) / L : 0; return [P[i].x + (P[i + 1].x - P[i].x) * u, P[i].y + (P[i + 1].y - P[i].y) * u, i + 1]; } return [P[P.length - 1].x, P[P.length - 1].y, P.length - 1]; };
    const A = at(a), B = at(b), pts = [[A[0], A[1]]]; for (let i = A[2]; i < B[2] && i < P.length; i++) pts.push([P[i].x, P[i].y]); pts.push([B[0], B[1]]);
    return pts.map(p => cam.P(p[0], p[1], 0));
  }
  function drawRoutesBase(m) {
    m = m || model; m.routes.forEach((R, i) => { const all = partPath(R.P, R.cum, 0, R.distanceM), far = i === m.far; stroke(all, far ? 13 : 11, 'rgba(255,255,255,.85)'); stroke(all, far ? 5 : 4, far ? 'rgba(227,162,26,.9)' : 'rgba(47,91,208,.4)', [2, 11]); });
  }
  function drawStations(dots) {
    const P = cam.P;
    dots = dots || rows.map((r, i) => { const R = model.routes[i]; return { x: R.P[0].x, y: R.P[0].y, tag: tagOf(r), far: i === model.far }; });
    ((S.layoutPlan || {}).points || []).forEach(p => {
      const w = planToWorld(p), [x, y] = P(w[0], w[1], 0);
      if (p.kind === 'spot') { ctx.save(); ctx.fillStyle = SLATE; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; rr(ctx, x - 11, y - ((cam.iso ? 7 * SQ() : 11)), 22, (cam.iso ? 14 * SQ() : 22), 4); ctx.fill(); ctx.stroke(); ctx.restore(); if (p.label) txt(String(p.label).slice(0, 2), x, y + (cam.iso ? 4 : 5), 12, 700, '#fff', 'center'); }
      else if (p.kind === 'door') { ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 9, (cam.iso ? 6 * SQ() : 9), 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
    });
    dots.forEach(r => {   // pick-up stations: numbered dots; the farthest has an amber ring
      const [x, y] = P(r.x, r.y, 0), far = r.far;
      ctx.save(); if (far) { ctx.strokeStyle = AMBER; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, 19, (cam.iso ? 12 * SQ() : 19), 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = BLUE; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 14, (cam.iso ? 9.5 * SQ() : 14), 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      txt(r.tag, x, y + (cam.iso ? 4.5 : 5.5), 14, 700, '#fff', 'center');
    });
  }

  /* ---------- the mini 3D AMR: the 1.5T pallet-jack AMR being proposed ---------- */
  // a box seen from the camera: sides first (far to near), then the lid
  function box(x, y, hd, L, Wd, z0, z1, tone) {
    const c = Math.cos(hd), sn = Math.sin(hd), loc = [[-L / 2, -Wd / 2], [L / 2, -Wd / 2], [L / 2, Wd / 2], [-L / 2, Wd / 2]].map(p => [x + p[0] * c - p[1] * sn, y + p[0] * sn + p[1] * c]);
    const faces = [];
    for (let i = 0; i < 4; i++) {
      const a = loc[i], b = loc[(i + 1) % 4], e = [b[0] - a[0], b[1] - a[1]], n = [e[1], -e[0]], len = Math.hypot(n[0], n[1]) || 1, mid = [(a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - y];
      if (n[0] * mid[0] + n[1] * mid[1] < 0) { n[0] = -n[0]; n[1] = -n[1]; }
      n[0] /= len; n[1] /= len;
      if (cam.iso && n[0] * cam.dir[0] + n[1] * cam.dir[1] <= 0.05) continue;
      faces.push({ a, b, n, depth: ((a[0] + b[0]) * cam.dir[0] + (a[1] + b[1]) * cam.dir[1]) / 2 });
    }
    faces.sort((p, q) => p.depth - q.depth);
    faces.forEach(f => {
      const light = 0.78 + 0.2 * ((f.n[0] - f.n[1]) / Math.SQRT2), q = [cam.P(f.a[0], f.a[1], z0), cam.P(f.b[0], f.b[1], z0), cam.P(f.b[0], f.b[1], z1), cam.P(f.a[0], f.a[1], z1)];
      ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = shade(tone[1], light); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; ctx.stroke();
    });
    const top = loc.map(p => cam.P(p[0], p[1], z1)); ctx.beginPath(); top.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = tone[0]; ctx.fill();
    ctx.strokeStyle = 'rgba(11,18,32,.14)'; ctx.lineWidth = 1; ctx.stroke();
  }
  const T = { black: ['#2B3552', '#1B2235'], white: ['#FFFFFF', '#EEF2FA'], grey: ['#6A7487', '#444E62'], blue: ['#3E6BE0', '#2F5BD0'], dark: ['#1B2640', '#0F1524'], led: ['#BDE6FF', '#6FC3F5'], red: ['#F25555', '#C73333'], amber: ['#FFC63D', '#E3A21A'], wood: ['#E4C48E', '#BC9254'], card: ['#D9B67E', '#B38B50'] };
  // a part given in the AMR's own frame (metres: x along the forks, y across, z up), turned into the world with the heading, scaled by vz
  function part(s, x0, x1, y0, y1, z0, z1, tone) {
    const c = Math.cos(s.heading), sn = Math.sin(s.heading), lx = (x0 + x1) / 2, ly = (y0 + y1) / 2;
    return { cx: s.x + (lx * c - ly * sn) * vz, cy: s.y + (lx * sn + ly * c) * vz, hd: s.heading, L: (x1 - x0) * vz, Wd: (y1 - y0) * vz, z0: z0 * vz, z1: z1 * vz, tone };
  }
  function palletParts(cx, cy, hd, lift) {   // a wooden pallet (0.79 x 0.60 m) with a sealed crate, centred on (cx, cy) in world metres
    const p0 = lift * 0.205, mk = (x0, x1, y0, y1, z0, z1, tone) => part({ x: cx, y: cy, heading: hd }, x0, x1, y0, y1, z0, z1, tone);
    return [mk(-0.395, 0.395, -0.30, 0.30, p0, p0 + 0.12, T.wood), mk(-0.365, 0.365, -0.27, 0.27, p0 + 0.12, p0 + 0.54, T.card)];
  }
  function drawAmrScene(s, closeup) {
    const parts = [], lift = s.lift, fz = 0.02 + lift * 0.185, c = Math.cos(s.heading), sn = Math.sin(s.heading), blink = (Math.floor(wall() * 2.5) % 2 === 0) && s.speed > 0;
    if (!closeup && mode === 'trip') {
      // pallets that are not on the AMR: the one waiting at the pick-up, the one just put down at the drop-off
      const job = s.jobRef;
      if (job && s.waiting) { const a = job.pick; palletParts(a.x + Math.cos(a.hd) * 0.47 * vz, a.y + Math.sin(a.hd) * 0.47 * vz, a.hd, 0).forEach(q => parts.push(q)); }
      const dj = (s.kind === 'unload' && !s.laden) ? job : (s.kind === 'unload' ? null : model.jobs[s.done - 1]);
      if (dj && dj.drop) { const e = dj.drop; palletParts(e.x + Math.cos(e.hd) * 0.47 * vz, e.y + Math.sin(e.hd) * 0.47 * vz, e.hd, 0).forEach(q => parts.push(q)); }
    }
    parts.push(part(s, -0.30, 0.86, -0.30, -0.12, fz, fz + 0.08, T.black), part(s, -0.30, 0.86, 0.12, 0.30, fz, fz + 0.08, T.black));          // forks
    parts.push(part(s, -0.88, -0.22, -0.36, 0.36, 0.03, 0.20, T.black));                                                                       // base
    parts.push(part(s, -0.86, -0.24, -0.34, 0.34, 0.20, 0.56, T.white));                                                                       // body
    parts.push(part(s, -0.865, -0.235, -0.345, 0.345, 0.34, 0.385, T.blue));                                                                   // WFC blue band
    parts.push(part(s, -0.86, -0.24, -0.34, 0.34, 0.56, 0.60, T.grey));                                                                        // cap
    parts.push(part(s, -0.24, -0.20, -0.30, 0.30, 0.04, 0.16, T.amber));                                                                       // safe-touch edge
    parts.push(part(s, -0.84, -0.76, -0.04, 0.04, 0.60, 1.36, T.dark));                                                                        // mast
    parts.push(part(s, -0.76, -0.72, -0.11, 0.11, 0.92, 1.14, T.dark));                                                                        // panel
    parts.push(part(s, -0.92, -0.68, -0.11, 0.11, 1.28, 1.40, T.dark), part(s, -0.70, -0.66, -0.07, 0.07, 1.31, 1.37, T.led));                // lidar head
    parts.push(part(s, -0.50, -0.44, -0.22, -0.15, 0.60, 0.67, T.red));                                                                        // emergency stop
    if (blink) parts.push(part(s, -0.83, -0.77, -0.03, 0.03, 1.40, 1.47, T.amber));                                                            // beacon
    if (s.laden) palletParts(s.x + c * 0.47 * vz, s.y + sn * 0.47 * vz, s.heading, lift).forEach(q => parts.push(q));
    parts.forEach(q => { q.key = cam.iso ? (q.cx * cam.dir[0] + q.cy * cam.dir[1]) * Math.SQRT2 + 0.0004 * (q.z0 + q.z1) : (q.z0 + q.z1); });
    parts.sort((a, b) => a.key - b.key).forEach(q => box(q.cx, q.cy, q.hd, q.L, q.Wd, q.z0, q.z1, q.tone));
  }
  function drawAmr(s, name) {
    const a0 = wall() * 3.2, g0 = toScreen(s.x, s.y, 0), R0 = 9;   // the floor under it: a slow lidar sweep and a soft ring
    ctx.save(); ctx.beginPath(); ctx.moveTo(g0[0], g0[1]);
    for (let i = 0; i <= 14; i++) { const a = a0 + i * 0.05, q = toScreen(s.x + Math.cos(a) * R0, s.y + Math.sin(a) * R0, 0); ctx.lineTo(q[0], q[1]); }
    ctx.closePath(); const gr = ctx.createRadialGradient(g0[0], g0[1], 0, g0[0], g0[1], 90); gr.addColorStop(0, 'rgba(47,91,208,.34)'); gr.addColorStop(1, 'rgba(47,91,208,.04)'); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = 'rgba(47,91,208,.08)'; ctx.strokeStyle = 'rgba(47,91,208,.4)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(g0[0], g0[1], 62, (cam.iso ? 37 * SQ() : 62), 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    const c = Math.cos(s.heading), sn = Math.sin(s.heading);   // a soft shadow
    [[0.6, .06], [0.3, .08], [0, .1]].forEach(([grow, al]) => { const L = 1.2 * VIZ + grow, Wd = 0.42 * VIZ + grow, cxw = s.x + c * 0.28 * VIZ + 0.6, cyw = s.y + sn * 0.28 * VIZ + 0.6;
      const g2 = [[-L, -Wd], [L, -Wd], [L, Wd], [-L, Wd]].map(p => toScreen(cxw + p[0] * c - p[1] * sn, cyw + p[0] * sn + p[1] * c, 0)); ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = INK; ctx.beginPath(); g2.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); ctx.restore(); });
    drawAmrScene(s, false);
    // a live tag above it
    const top = toScreen(s.x, s.y, 1.5 * VIZ), tx = Math.max(MAP.x + 130, Math.min(MAP.x + MAP.w - 130, top[0])), ty = Math.max(MAP.y + 34, top[1] - 40);
    ctx.save(); ctx.strokeStyle = 'rgba(11,18,32,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty + 24); ctx.lineTo(top[0], top[1] + 6); ctx.stroke();
    ctx.shadowColor = 'rgba(11,18,32,.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5; ctx.fillStyle = INK; rr(ctx, tx - 120, ty - 24, 240, 48, 14); ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = s.speed > 0 ? '#4ADE80' : AMBER; ctx.beginPath(); ctx.arc(tx - 98, ty, 6, 0, 7); ctx.fill(); ctx.restore();
    txt(name || 'AMR 01', tx - 82, ty + 7, 20, 700, '#fff'); txt(`${fmt(s.speed, 2)} m/s`, tx + 106, ty + 7, 19, 500, '#B9C6E8', 'right');
  }
  // a life-size close-up of the AMR in the corner of the map, turning as it turns, with what it is doing and the forks' lift as live readings
  let CU = { x: 1070, y: 160, w: 330, h: 270 };
  function drawCloseup(s, opt) {
    const bare = !!(opt && opt.bare), M = D && D.model, cx = CU.x + CU.w / 2 + 12, gy = CU.y + CU.h - (bare ? 40 : 100), sc2 = 62, keep = cam;
    ctx.save(); rr(ctx, CU.x + 3, CU.y + 3, CU.w - 6, CU.h - 6, 24); ctx.clip();
    const bg = ctx.createLinearGradient(0, CU.y, 0, CU.y + CU.h); bg.addColorStop(0, '#F6F8FD'); bg.addColorStop(1, '#E6ECF8'); ctx.fillStyle = bg; ctx.fillRect(CU.x, CU.y, CU.w, CU.h);
    const g0 = ctx.createRadialGradient(cx, gy, 0, cx, gy, 130); g0.addColorStop(0, 'rgba(47,91,208,.22)'); g0.addColorStop(1, 'rgba(47,91,208,0)');
    ctx.save(); ctx.translate(cx, gy + 6); ctx.scale(1, 0.5); ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, 0, 130, 0, 7); ctx.fill(); ctx.restore();
    cam = { iso: true, sc: sc2, sqr: 1, dir: [Math.SQRT1_2, Math.SQRT1_2], P: (x, y, z) => [cx + ((x - s.x) - (y - s.y)) * C30 * sc2, gy + ((x - s.x) + (y - s.y)) * S30 * sc2 - (z || 0) * sc2] };
    vz = 1; drawAmrScene(s, true); vz = VIZ; cam = keep;
    ctx.restore();
    const fk = `Forks ${Math.round(s.lift * (M && M.liftMm ? M.liftMm : 205))} mm`, ph = s.phase || s.label || '';   // two small labels on soft pills, so the AMR never draws over them
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.88)'; if (!bare) { rr(ctx, CU.x + 16, CU.y + 16, 178, 30, 15); ctx.fill(); } rr(ctx, CU.x + CU.w - 16 - (width(fk, 16, 600) + 24), CU.y + 16, width(fk, 16, 600) + 24, 30, 15); ctx.fill(); ctx.restore();
    if (!bare) fitTxt(ph, CU.x + 28, CU.y + 37, 156, 16, 700, s.speed > 0.02 || s.lift > 0.02 ? BLUE : MUTE);
    txt(fk, CU.x + CU.w - 28, CU.y + 37, 16, 600, MUTE, 'right');
    if (!bare) { txt('PROPOSED AMR', CU.x + 26, CU.y + CU.h - 52, 15, 700, BLUE); fitTxt(M ? M.name : 'Pallet jack AMR', CU.x + 26, CU.y + CU.h - 24, CU.w - 52, 21, 700, INK);
      if (M && M.payloadKg) txt(`${fmt(M.payloadKg)} kg payload`, CU.x + CU.w - 26, CU.y + CU.h - 52, 15, 500, MUTE, 'right'); }
  }
  // the path being driven: the part already driven is filled in as it goes. A task's path is drawn here (it is not one of the saved routes).
  function drawProgress(s, mdl) {
    mdl = mdl || model; const job = s.jobRef || mdl.jobs[mdl.jobs.length - 1]; if (!job) return;
    const legs = mdl.segs.slice(job.s0, job.s1).filter(g => g.leg);
    legs.forEach(g => {
      const L = g.leg, all = partPath(L.P, L.cum, 0, L.total); if (task) { stroke(all, 12, 'rgba(255,255,255,.8)'); stroke(all, 4, 'rgba(47,91,208,.5)', [2, 11]); }
      const upTo = s.leg === L ? s.legS : (g.t1 <= s.t ? L.total : 0);
      if (upTo > 0.01) stroke(partPath(L.P, L.cum, 0, upTo), 8, g.kind === 'out' ? LIGHT : BLUE);
    });
    // a pulse on the pick-up it is going to
    const a = job.pick, ph = (wall() * 1.4) % 1, g = a ? toScreen(a.x, a.y, 0) : null;
    if (g && s.kind === 'out' || (s.kind === 'pivot' && s.waiting)) { ctx.save(); ctx.strokeStyle = `rgba(47,91,208,${(1 - ph) * .6})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(g[0], g[1], 18 + ph * 40, cam.iso ? (18 + ph * 40) * .6 * SQ() : 18 + ph * 40, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // a trail behind it
    const pts = [], tr = mode === 'shift' ? Math.max(0.6, speedF / 12) : 0.6; for (let i = 14; i >= 0; i--) { const q = Sim.at(mdl, Math.max(0, s.t - i * tr)); pts.push(toScreen(q.x, q.y, 0)); }
    for (let i = 1; i < pts.length; i++) { ctx.save(); ctx.globalAlpha = i / pts.length * .5; ctx.strokeStyle = s.laden ? BLUE : LIGHT; ctx.lineWidth = 10 * (i / pts.length); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); ctx.restore(); }
  }
  // the two points of a task, marked on the map
  function drawTaskEnds() {
    if (!task) return;
    [[task.from, 'FROM', BLUE], [task.to, 'TO', GREEN]].forEach(([p, lab, col]) => {
      const w = planToWorld(p), [x, y] = toScreen(w[0], w[1], 0);
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, 24, (cam.iso ? 15 * SQ() : 24), 0, 0, 7); ctx.stroke();
      const pw = width(lab, 15, 700) + 22; ctx.fillStyle = col; rr(ctx, x - pw / 2, y - 62, pw, 28, 14); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 6, y - 34); ctx.lineTo(x + 6, y - 34); ctx.lineTo(x, y - 26); ctx.fill(); ctx.restore();
      txt(lab, x, y - 42, 15, 700, '#fff', 'center');
    });
  }

  /* ---------- the readings ---------- */
  function card(x, y, w, h) { ctx.save(); ctx.shadowColor = 'rgba(11,18,32,.13)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 9; ctx.fillStyle = '#fff'; rr(ctx, x, y, w, h, 26); ctx.fill(); ctx.restore(); }
  const KX = i => MAP.x + i * 340, KY = 905, KW = 310, KH = 72, TLY = 1000, TLH = 18;
  function drawHudStatic() {
    const cl = S.client && S.client.name ? S.client.name : '', mdl = D && D.model ? D.model.name : 'Pallet jack AMR';
    txt('On site with the AMR', 70, 92, 46, 700, INK); fitTxt(`${cl ? cl + '  ·  ' : ''}${mdl}  ·  up to ${fmt(model.speedMps, 2)} m/s  ·  ${speedF}× speed`, 70, 132, 1300, 24, 500, MUTE);
    card(CU.x, CU.y, CU.w, CU.h); card(HX, 150, HW, 360); card(HX, 530, HW, 82); card(HX, 632, HW, 358);
    txt('LIVE READINGS', HX + 36, 196, 20, 700, BLUE);
    for (let i = 0; i < 4; i++) card(KX(i), KY, KW, KH);
    ctx.save(); rr(ctx, MAP.x, TLY, MAP.w, TLH, 9); ctx.fillStyle = 'rgba(11,18,32,.07)'; ctx.fill(); ctx.restore();
    [['Empty to the pick-up', LIGHT], ['Carrying the pallet', BLUE], ['Lift, lower', SLATE], ['Turning on the spot', AMBER]].forEach((l, i) => { const lx = MAP.x + i * 270; ctx.fillStyle = l[1]; ctx.beginPath(); ctx.arc(lx + 8, 1050, 8, 0, 7); ctx.fill(); txt(l[0], lx + 26, 1058, 21, 500, MUTE); });
  }
  function drawTaskCard(s) {
    const job = s.jobRef || model.jobs[model.jobs.length - 1], done = !!s.finished, rowsT = job.rows;
    txt('TASK', HX + 36, 676, 20, 700, BLUE);
    if (done) txt('Done', HX + HW - 36, 676, 18, 700, GREEN, 'right'); else txt('Running', HX + HW - 36, 676, 18, 600, MUTE, 'right');
    fitTxt(`${task.from.name}  →  ${task.to.name}`, HX + 36, 716, HW - 72, 24, 700, INK);
    rowsT.forEach((r, i) => {
      const yy = 762 + i * 32, isDone = s.t >= r.t1 - 1e-6, act = !isDone && s.t >= r.t0 - 1e-6, d = r.t1 - r.t0;
      if (act) { ctx.save(); ctx.fillStyle = 'rgba(47,91,208,.10)'; rr(ctx, HX + 14, yy - 22, HW - 28, 30, 10); ctx.fill(); ctx.restore(); }
      ctx.save(); ctx.beginPath(); ctx.arc(HX + 44, yy - 7, 7, 0, 7); if (isDone) { ctx.fillStyle = BLUE; ctx.fill(); } else if (act) { ctx.lineWidth = 3; ctx.strokeStyle = BLUE; ctx.stroke(); } else { ctx.fillStyle = '#C6CFE2'; ctx.fill(); } ctx.restore();
      fitTxt(r.label, HX + 64, yy, 200, 19, act ? 700 : 500, act ? INK : SLATE);
      fitTxt(r.distanceM > 0 ? `${fmt(r.distanceM, 1)} m · ${fmt(d)} s` : `${fmt(d)} s`, HX + HW - 30, yy, 140, 19, act ? 700 : 500, act ? INK : SLATE, 'right');
      if (act) { const f = Math.max(0, Math.min(1, (s.t - r.t0) / d)); ctx.save(); ctx.fillStyle = 'rgba(11,18,32,.07)'; rr(ctx, HX + 64, yy + 2, HW - 94, 3, 2); ctx.fill(); ctx.fillStyle = BLUE; rr(ctx, HX + 64, yy + 2, Math.max(4, (HW - 94) * f), 3, 2); ctx.fill(); ctx.restore(); }
    });
    ctx.save(); ctx.fillStyle = 'rgba(11,18,32,.09)'; ctx.fillRect(HX + 36, 880, HW - 72, 2); ctx.restore();
    const line = (yy, l, v, bold) => { txt(l, HX + 36, yy, 19, bold ? 700 : 500, bold ? INK : MUTE); fitTxt(v, HX + HW - 36, yy, 220, bold ? 22 : 19, 700, INK, 'right'); };
    line(912, 'Total', `${fmt(job.distanceM, 1)} m · ${fmt(job.timeS)} s`, true);
    line(944, 'Average speed', `${fmt(job.avgMps, 2)} m/s`);
    line(974, 'Average while driving', `${fmt(job.distanceM / (job.driveS || 1), 2)} m/s`);
  }
  function drawHud(s) {
    const F = D && D.fleet && D.fleet.ok ? D.fleet : null, d = s.jobDistanceM, job = s.jobRef || model.jobs[model.jobs.length - 1], what = task ? 'task' : 'trip';
    const row = (yy, big, unit, label, extra) => { txt(big, HX + 36, yy, 64, 700, INK); const bw = ctx.measureText(big).width; fitTxt(unit, HX + 36 + bw + 12, yy, HW - 72 - bw - 12, 26, 500, MUTE); const lw = width(label, 22, 500); txt(label, HX + 36, yy + 32, 22, 500, MUTE); if (extra) fitTxt(extra, HX + 36 + lw + 12, yy + 32, HW - 72 - lw - 12, 18, 700, BLUE); };
    row(262, fmt(s.speed, 2), 'm/s', 'Speed', s.phase && s.kind !== 'idle' ? '· ' + s.phase : '');
    row(364, fmt(s.travelled), `of ${fmt(d)} m`, `Distance this ${what}`); row(466, fmt(s.jobT), `of ${fmt(s.jobS)} s`, `Seconds into this ${what}`);
    { const gx = HX + HW - 78, gy = 246, r = 40, a0 = 0.75 * Math.PI, a1 = 2.25 * Math.PI, f = Math.max(0, Math.min(1, s.speed / model.speedMps));   // speed gauge
      ctx.save(); ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(11,18,32,.09)'; ctx.beginPath(); ctx.arc(gx, gy, r, a0, a1); ctx.stroke();
      if (f > 0.002) { ctx.strokeStyle = BLUE; ctx.beginPath(); ctx.arc(gx, gy, r, a0, a0 + (a1 - a0) * f); ctx.stroke(); } ctx.restore(); }
    // what it is doing
    const col = KIND[s.kind] || (s.kind === 'idle' ? GREEN : SLATE), rw = s.route >= 0 ? rows[s.route] : null;
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(HX + 44, 571, 11, 0, 7); ctx.fill(); ctx.restore();
    fitTxt(s.label, HX + 72, 564, HW - 72 - 28, 26, 700, INK);
    fitTxt(task ? `${task.from.name} → ${task.to.name}` : `Trip ${s.job}  ·  ${rw ? rw.name : ''}  ·  ${fmt(d / 2, 1)} m one way`, HX + 72, 594, HW - 72 - 28, 19, 500, MUTE);
    // the stations (the one it is serving is lit, the farthest is amber; click one to send the AMR there next), or the task's legs and totals
    if (task) drawTaskCard(s);
    else {
      txt('STATIONS', HX + 36, 676, 20, 700, BLUE); txt('one way, m', HX + HW - 36, 676, 18, 500, MUTE, 'right');
      const n = rows.length, pitch = Math.min(29, 252 / Math.max(n, 1)), maxD = Math.max(...rows.map(r => r.distanceM), 1);
      rows.forEach((r, i) => {
        const yy = 718 + i * pitch, act = i === s.route, hov = hover && hover.i === i;
        if (act || hov) { ctx.save(); ctx.fillStyle = act ? 'rgba(47,91,208,.10)' : 'rgba(11,18,32,.05)'; rr(ctx, HX + 14, yy - 21, HW - 28, pitch - 2, 10); ctx.fill(); ctx.restore(); }
        ctx.save(); ctx.fillStyle = i === model.far ? AMBER : (act ? BLUE : '#C6CFE2'); ctx.beginPath(); ctx.arc(HX + 44, yy - 6, 11, 0, 7); ctx.fill(); ctx.restore();
        txt(tagOf(r), HX + 44, yy - 1, 13, 700, i === model.far || act ? '#fff' : SLATE, 'center');
        fitTxt(r.name, HX + 66, yy, 132, 20, act ? 700 : 500, act ? INK : SLATE);
        const bx = HX + 206, bw = 96; ctx.save(); ctx.fillStyle = 'rgba(11,18,32,.07)'; rr(ctx, bx, yy - 12, bw, 8, 4); ctx.fill(); ctx.fillStyle = i === model.far ? AMBER : (act ? BLUE : LIGHT); rr(ctx, bx, yy - 12, Math.max(6, bw * r.distanceM / maxD), 8, 4); ctx.fill(); ctx.restore();
        txt(fmt(r.distanceM, 1), HX + HW - 30, yy, 20, 700, act ? INK : SLATE, 'right');
      });
      fitTxt('Click a station to send the AMR there next', HX + 36, 978, HW - 72, 17, 500, MUTE);
    }
    // the four counters under the map
    const done = s.done, hrs = s.t / 3600, runtime = (D && D.fleet && D.fleet.runtimeH) || (S.fleet && +S.fleet.runtimeH) || 6.5, pct = Math.max(0, 100 - 100 * s.t / (runtime * 3600));
    const chip = (i, label, v, unit, sub) => { txt(label, KX(i) + 22, KY + 26, 15, 700, BLUE); txt(v, KX(i) + 22, KY + 62, 34, 700, INK); const bw = ctx.measureText(v).width; if (unit) fitTxt(unit, KX(i) + 22 + bw + 8, KY + 62, KW - 44 - bw - 8 - (sub ? 110 : 0), 18, 500, MUTE); if (sub) fitTxt(sub, KX(i) + KW - 20, KY + 62, 120, 16, 500, MUTE, 'right'); };
    chip(0, 'PALLETS MOVED', String(done), F && !task ? `of ${fmt(F.trips)} a day` : '', '');
    chip(1, 'TIME ON SITE', mm(s.t), '', `${speedF}× speed`);
    if (task) chip(2, 'AVERAGE SPEED', s.t > 0.5 ? fmt(Math.min(s.travelled, job.distanceM) / Math.max(s.t, 0.001), 2) : '—', 'm/s', ''); else chip(2, 'RATE', hrs > 0.003 && done > 0 ? fmt(done / hrs) : '—', 'pallets / hour', '');
    chip(3, 'BATTERY', fmt(pct, 1) + '%', '', `${fmt(runtime, 1)} h runtime`);
    // this job's breakdown under the map, with a marker, and the proposal's own cycle for comparison
    if (job) { ctx.save(); rr(ctx, MAP.x, TLY, MAP.w, TLH, 9); ctx.clip(); for (let i = job.s0; i < job.s1; i++) { const g = model.segs[i]; ctx.fillStyle = KIND[g.kind] || SLATE; ctx.fillRect(MAP.x + (g.t0 - job.t0) / (job.t1 - job.t0) * MAP.w, TLY, Math.max(1, (g.t1 - g.t0) / (job.t1 - job.t0) * MAP.w + .5), TLH); } ctx.restore();
      const px = MAP.x + Math.min(1, (s.t - job.t0) / (job.t1 - job.t0)) * MAP.w; ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, TLY + TLH / 2, 14, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      const R = !task && job.ri >= 0 ? model.routes[job.ri] : null;
      fitTxt(`${mm(Math.min(s.jobT, s.jobS))} / ${mm(s.jobS)}${R ? `  ·  proposal ${mm(R.cycleS)}` : ''}`, MAP.x + MAP.w, 1058, 520, 21, 700, INK, 'right'); }
    // hover card (sized to its text) and the note
    const pitchH = Math.min(29, 252 / Math.max(rows.length, 1));
    hits = (task ? [] : rows.map((r, i) => ({ i, x: HX + 14, y: 718 + i * pitchH - 21, w: HW - 28, h: pitchH - 2 }))).concat(dots.map(d2 => d2));
    if (hover && rows[hover.i]) {
      const r = rows[hover.i], R2 = model.routes[hover.i], l1 = r.name, l2 = `${fmt(R2.distanceM, 1)} m one way`, l3 = `${fmt(R2.simS)} s a trip  ·  ${fmt(3600 / R2.simS, 1)} an hour`;
      const w = Math.max(width(l1, 22, 700) + (hover.i === model.far ? 110 : 0), width(l2, 19, 500), width(l3, 17, 500)) + 44, h = 112, x = Math.max(MAP.x + 10, Math.min(MAP.x + MAP.w - w - 10, hover.px - w / 2)), y = Math.max(MAP.y + 10, hover.py - h - 28);
      ctx.save(); ctx.shadowColor = 'rgba(11,18,32,.25)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; ctx.fillStyle = INK; rr(ctx, x, y, w, h, 16); ctx.fill(); ctx.restore();
      txt(l1, x + 22, y + 34, 22, 700, '#fff'); txt(l2, x + 22, y + 62, 19, 500, '#B9C6E8'); txt(l3, x + 22, y + 88, 17, 500, '#B9C6E8');
      if (hover.i === model.far) txt('FARTHEST', x + w - 22, y + 34, 14, 700, AMBER, 'right'); }
    if (toast && wall() - toast.at < 3.2) { ctx.font = `600 20px ${FONT}`; const w = Math.min(MAP.w - 40, ctx.measureText(toast.text).width + 44); ctx.save(); ctx.fillStyle = BLUE; rr(ctx, MAP.x + 20, MAP.y + 16, w, 46, 14); ctx.fill(); ctx.restore(); fitTxt(toast.text, MAP.x + 42, MAP.y + 46, w - 44, 20, 600, '#fff'); }
  }

  /* ---------- the shift: lines, staff, doors, obstacles, every AMR, and the live panel ---------- */
  const OPS = window.WFCOps, CAT = { out: 'work', drive: 'work', pivot: 'work', load: 'work', unload: 'work', go: 'work', wait: 'wait', charge: 'charge', swap: 'charge', idle: 'idle' };
  const CATC = { work: BLUE, wait: AMBER, charge: GREEN, idle: '#C6CFE2' }, ORANGE = '#F08C24';
  const opsLines = () => ops ? ops.lines : [];
  // the obstacles in the proposal, each with the moment it was put down in this run (so the past does not change when one is added while it plays)
  const obstacleList = () => ((S.sim && S.sim.obstacles) || []).map(b => Object.assign({}, b, { since: obsSince[b.id] || 0 }));
  function rebuildOps(force) {
    if (!OPS || !model || !model.ok) { ops = opsAll = null; return; }
    const sig = JSON.stringify([rebuild.sig, S.sim || null, S.scenario, S.pallet && S.pallet.kg, obsSince]);
    if (!force && sig === opsSig && ops) return;
    opsSig = sig; opsModel = opsModel && opsModel.sig === rebuild.sig ? opsModel : Object.assign(OPS.modelFor(S, D), { sig: rebuild.sig });
    const cfg = OPS.settings(S, D), sc = OPS.scenario(S, cfg);
    ops = OPS.runFor(S, D, { model: opsModel, record: true, hours: Math.min(sc.hours, 24), obstacles: obstacleList() });
    opsAll = sc.hours > 24 || Object.keys(obsSince).length ? OPS.runFor(S, D, { model: opsModel }) : ops;   // the results: the whole scenario, obstacles there from the start
    if (!ops.ok) { ops = opsAll = null; return; }
    // time spent per kind of activity, added up along each AMR's timeline (for the live percentages and the timeline bar)
    ops.amrs.forEach(a => { const c = { work: 0, wait: 0, charge: 0, idle: 0 }; a.cum = a.model.segs.map(g => { c[CAT[g.kind] || 'work'] += g.t1 - g.t0; return Object.assign({ t1: g.t1, cat: CAT[g.kind] || 'work' }, c); }); });
    ops.lines.forEach(L => { const R = opsModel.routes[L.ri]; L.pick = R.P[0]; L.hd = R.rev.h1; L.dir = Math.atan2(R.P[1].y - R.P[0].y, R.P[1].x - R.P[0].x); L.tag = tagOf({ name: L.name, num: L.num || String(L.li + 1) }); });
    // a door faces across the route that goes through it
    ops.doors.forEach(d => { let best = null; opsModel.routes.forEach(R => { for (let i = 0; i < R.P.length - 1; i++) { const a = R.P[i], b = R.P[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((d.x - a.x) * dx + (d.y - a.y) * dy) / L2)) : 0, dd = Math.hypot(d.x - a.x - dx * u, d.y - a.y - dy * u); if (!best || dd < best.d) best = { d: dd, ang: Math.atan2(dy, dx) }; } }); d.ang = best ? best.ang : 0; });
    ops.obstacles.forEach(b => { let best = null; opsModel.routes.forEach(R => { for (let i = 0; i < R.P.length - 1; i++) { const a = R.P[i], c = R.P[i + 1], dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((b.x - a.x) * dx + (b.y - a.y) * dy) / L2)) : 0, dd = Math.hypot(b.x - a.x - dx * u, b.y - a.y - dy * u); if (!best || dd < best.d) best = { d: dd, ang: Math.atan2(dy, dx) }; } }); b.ang = best ? best.ang : 0; b.onRoute = !!best && best.d < 1.2; });
    if (t > ops.Hend) t = ops.Hend;
  }
  const catAt = (a, tt) => { const c = a.cum; if (!c.length) return { work: 0, wait: 0, charge: 0, idle: 0 }; let lo = 0, hi = c.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid].t1 < tt) lo = mid + 1; else hi = mid; } const r = Object.assign({}, c[lo]), g = a.model.segs[lo], over = g ? Math.max(0, g.t1 - tt) : 0; if (g) r[r.cat] -= over; return r; };
  const clock = s => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (d ? `Day ${d + 1}  ` : '') + `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
  // a small person standing at a line (two legs, a body, arms, a head), drawn with the same boxes as the AMR, about 1.7 m tall, shown as big as the AMR
  function personParts(x, y, hd, busy) {
    const s = { x, y, heading: hd }, sway = busy ? Math.sin(wall() * 5) * 0.04 : 0;
    return [part(s, -0.06, 0.06, -0.16, -0.04, 0, 0.8, T.dark), part(s, -0.06, 0.06, 0.04, 0.16, 0, 0.8, T.dark),
      part(s, -0.1, 0.1, -0.2, 0.2, 0.8, 1.42, ['#3E6BE0', '#2F5BD0']),
      part(s, -0.05 + sway, 0.07 + sway, -0.27, -0.2, 0.9, 1.38, ['#3E6BE0', '#2F5BD0']), part(s, -0.05 - sway, 0.07 - sway, 0.2, 0.27, 0.9, 1.38, ['#3E6BE0', '#2F5BD0']),
      part(s, -0.09, 0.09, -0.09, 0.09, 1.44, 1.66, ['#F1D2B0', '#D9B48E']), part(s, -0.1, 0.1, -0.1, 0.1, 1.62, 1.7, T.amber)];   // a hard hat
  }
  function lineState(L, tt) {
    let waiting = 0, finished = 0, next = null;
    for (const p of L.pallets) { if (p.tFinish <= tt && (p.tLoad === null || p.tLoad > tt)) { waiting++; if (p.tCall > tt) finished++; } if (p.tFinish > tt) { next = p; break; } }
    const prog = next ? Math.max(0, Math.min(1, 1 - (next.tFinish - tt) / L.intervalS)) : 0;
    return { waiting, finished, prog, producing: !!next && next.tFinish - tt <= L.intervalS + 1e-6 };
  }
  function drawLines(tt, serving) {
    opsLines().forEach(L => {
      const st = lineState(L, tt), c = Math.cos(L.hd), sn = Math.sin(L.hd), px = L.pick.x + c * 0.47 * VIZ, py = L.pick.y + sn * 0.47 * VIZ, nx = -sn, ny = c;
      const parts = [], g = toScreen(px, py, 0), lit = st.waiting > 0;
      picks.push({ kind: 'line', id: L.li, wx: px, wy: py, wz: 0.3 * VIZ, r: 46 });
      if (lit) { const ph = (wall() * 1.2) % 1; ctx.save(); ctx.strokeStyle = `rgba(227,162,26,${0.5 - ph * 0.45})`; ctx.fillStyle = `rgba(227,162,26,${0.10 - ph * 0.08})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(g[0], g[1], 30 + ph * 14, ((cam.iso ? 18 * SQ() : 30)) + ph * 9, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
      // the pallet at the line: being packed (the crate grows), or finished and waiting (full, lit); more waiting pallets stand beside it
      const crate = lit ? 0.54 : Math.max(0.06, st.prog * 0.54), base2 = { x: px, y: py, heading: L.hd };
      parts.push(part(base2, -0.395, 0.395, -0.30, 0.30, 0, 0.12, T.wood));
      if (st.producing || lit) parts.push(part(base2, -0.365, 0.365, -0.27, 0.27, 0.12, 0.12 + crate, lit ? T.card : ['#E9D7B5', '#CDB58A']));
      for (let k = 1; k < Math.min(st.waiting, 3); k++) { const bx = px + nx * 0.7 * VIZ * k, by = py + ny * 0.7 * VIZ * k; palletParts(bx, by, L.hd, 0).forEach(q => parts.push(q)); }
      // the member of staff at the line, and the call button (lit once the pallet is called)
      const sx = px - nx * 0.75 * VIZ - c * 0.1 * VIZ, sy = py - ny * 0.75 * VIZ - sn * 0.1 * VIZ;
      personParts(sx, sy, L.hd + Math.PI / 2, st.producing && !lit).forEach(q => parts.push(q));
      const bx = px - nx * 0.6 * VIZ + c * 0.55 * VIZ, by = py - ny * 0.6 * VIZ + sn * 0.55 * VIZ;
      parts.push(part({ x: bx, y: by, heading: L.hd }, -0.04, 0.04, -0.04, 0.04, 0, 1.05, T.grey), part({ x: bx, y: by, heading: L.hd }, -0.08, 0.08, -0.08, 0.08, 1.05, 1.2, lit ? (st.finished ? T.amber : ['#7DF0A8', '#2DBE6C']) : T.dark));
      parts.forEach(q => { q.key = cam.iso ? (q.cx * cam.dir[0] + q.cy * cam.dir[1]) * Math.SQRT2 + 0.0004 * (q.z0 + q.z1) : (q.z0 + q.z1); });
      parts.sort((a, b) => a.key - b.key).forEach(q => box(q.cx, q.cy, q.hd, q.L, q.Wd, q.z0, q.z1, q.tone));
      if (L.li === serving) { ctx.save(); ctx.strokeStyle = BLUE; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(g[0], g[1], 44, (cam.iso ? 26 * SQ() : 44), 0, 0, 7); ctx.stroke(); ctx.restore(); }
      // a pallet is ready: a small white capsule with an amber dot (the same dot as "Ready" in the panel); the number only when more than one is waiting
      if (st.waiting > 0) {
        const top = toScreen(px, py, 1.3 * VIZ), many = st.waiting > 1, w = many ? 46 : 26, h = 26, x0 = top[0] - w / 2, y0 = top[1] - 30;
        ctx.save(); ctx.shadowColor = 'rgba(11,18,32,.22)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2; ctx.fillStyle = 'rgba(255,255,255,.96)'; rr(ctx, x0, y0, w, h, 13); ctx.fill(); ctx.restore();
        ctx.save(); ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(x0 + 13, y0 + 13, 6, 0, 7); ctx.fill(); ctx.restore();
        if (many) txt(String(st.waiting), x0 + 26, y0 + 19.5, 16, 700, INK);
      }
    });
  }
  // a roll-up door: two posts, the housing on top, the shutter rolling up as it opens; a light that is red (closed), amber (moving) or green (open)
  function doorState(d, tt) {
    const cy = d.cycles; let lo = 0, hi = cy.length - 1, c = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (cy[mid].o0 <= tt) { c = cy[mid]; lo = mid + 1; } else hi = mid - 1; }
    if (!c || tt > c.c1) return { open: 0, label: 'Closed', col: '#D8362F' };
    if (tt < c.o1) return { open: (tt - c.o0) / Math.max(0.01, c.o1 - c.o0), label: 'Opening', col: AMBER };
    if (tt <= c.c0) return { open: 1, label: 'Open', col: '#1E9E5A' };
    return { open: 1 - (tt - c.c0) / Math.max(0.01, c.c1 - c.c0), label: 'Closing', col: AMBER };
  }
  function drawDoors(tt) {
    (ops ? ops.doors : []).forEach(d => {
      picks.push({ kind: 'door', id: d.id, wx: d.x, wy: d.y, wz: 0.85 * VIZ, r: 54 });
      const st = doorState(d, tt), Wd = 1.5 * VIZ, Hd = 1.7 * VIZ, s0 = { x: d.x, y: d.y, heading: d.ang }, nx = -Math.sin(d.ang), ny = Math.cos(d.ang), parts = [];
      const post = k => { const q = { x: d.x + nx * Wd / 2 * k, y: d.y + ny * Wd / 2 * k, heading: d.ang }; return part(Object.assign(q), -0.05, 0.05, -0.05, 0.05, 0, (Hd + 0.4 * VIZ) / VIZ, ['#5B6577', '#3A4559']); };
      parts.push(post(-1), post(1));
      const z0 = (st.open * Hd) / VIZ; if (st.open < 0.98) parts.push(part(s0, -0.03, 0.03, -Wd / 2 / VIZ, Wd / 2 / VIZ, z0, Hd / VIZ, ['#C9D3E6', '#AEB9CE']));
      parts.push(part(s0, -0.09, 0.09, -Wd / 2 / VIZ - 0.05, Wd / 2 / VIZ + 0.05, Hd / VIZ, Hd / VIZ + 0.12, ['#8A96AD', '#6A7487']));
      parts.forEach(q => { q.key = cam.iso ? (q.cx * cam.dir[0] + q.cy * cam.dir[1]) * Math.SQRT2 + 0.0004 * (q.z0 + q.z1) : (q.z0 + q.z1); });
      parts.sort((a, b) => a.key - b.key).forEach(q => box(q.cx, q.cy, q.hd, q.L, q.Wd, q.z0, q.z1, q.tone));
      const top = toScreen(d.x, d.y, Hd + 0.3 * VIZ), lab = 'Door · ' + st.label, w = width(lab, 16, 700) + 40;
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.strokeStyle = 'rgba(11,18,32,.12)'; ctx.lineWidth = 1.5; rr(ctx, top[0] - w / 2, top[1] - 34, w, 30, 15); ctx.fill(); ctx.stroke();
      ctx.fillStyle = st.col; ctx.beginPath(); ctx.arc(top[0] - w / 2 + 16, top[1] - 19, 6, 0, 7); ctx.fill(); ctx.restore();
      txt(lab, top[0] - w / 2 + 28, top[1] - 13, 16, 700, INK);
    });
  }
  // an obstacle (a person or a trolley in the way): orange, with a ring; red and pulsing while an AMR waits for it; it steps aside as the AMR passes
  function drawObstacles(tt) {
    const list = ops ? ops.obstacles : [];
    ((S.sim && S.sim.obstacles) || []).forEach(o => {
      const b = list.find(q => q.id === o.id) || o, w0 = planToWorld(dragObs && dragObs.id === o.id ? dragObs : o), ev = (b.events || []).find(e => tt >= e.t0 && tt <= e.pass + 2);
      const blocked = ev && tt < ev.t1, aside = ev && tt >= ev.t1 ? Math.min(1, (tt - ev.t1) / 1.5) : 0, ang = b.ang || 0, nx = -Math.sin(ang), ny = Math.cos(ang);
      const x = w0[0] + nx * 1.6 * aside * VIZ * 0.4, y = w0[1] + ny * 1.6 * aside * VIZ * 0.4, g = toScreen(x, y, 0), sel = selObs === o.id, ph = (wall() * 1.6) % 1;
      ctx.save(); ctx.setLineDash(blocked ? [] : [6, 6]); ctx.strokeStyle = blocked ? `rgba(216,54,47,${0.9 - ph * 0.5})` : sel ? BLUE : 'rgba(240,140,36,.8)'; ctx.lineWidth = blocked ? 5 : 3;
      ctx.beginPath(); ctx.ellipse(g[0], g[1], 30 + (blocked ? ph * 10 : 0), ((cam.iso ? 18 * SQ() : 30)) + (blocked ? ph * 6 : 0), 0, 0, 7); ctx.stroke(); ctx.restore();
      const s0 = { x, y, heading: ang }, parts = [part(s0, -0.16, 0.16, -0.16, 0.16, 0, 0.5, [ORANGE, '#C96A10']), part(s0, -0.165, 0.165, -0.165, 0.165, 0.2, 0.28, ['#FFFFFF', '#E8ECF3']), part(s0, -0.06, 0.06, -0.06, 0.06, 0.5, 0.6, T.dark)];
      parts.forEach(q => box(q.cx, q.cy, q.hd, q.L, q.Wd, q.z0, q.z1, q.tone));
      if (blocked) { const top = toScreen(x, y, 0.9 * VIZ), lab = `Waiting · clears in ${Math.ceil(ev.t1 - tt)} s`, w = width(lab, 15, 700) + 26; ctx.save(); ctx.fillStyle = '#D8362F'; rr(ctx, top[0] - w / 2, top[1] - 30, w, 28, 14); ctx.fill(); ctx.restore(); txt(lab, top[0], top[1] - 11, 15, 700, '#fff', 'center'); }
      else if (b.onRoute === false && !dragObs) { const top = toScreen(x, y, 0.9 * VIZ); txt('Not on a route', top[0], top[1] - 10, 15, 600, MUTE, 'center'); }
    });
  }
  // the live panel on the right, the four counters, the timeline of the shift
  function drawHudStaticOps() {
    const cl = S.client && S.client.name ? S.client.name : '', mdl = D && D.model ? D.model.name : 'Pallet jack AMR', n = ops.amrs.length, sc = ops.cfg.scenario;
    txt(sc === 'shift' ? `A shift with the AMR${n > 1 ? 's' : ''}` : sc === 'day' ? `A day with the AMR${n > 1 ? 's' : ''}` : `The AMR${n > 1 ? 's' : ''} at work`, 70, 92, 46, 700, INK);
    fitTxt(`${cl ? cl + '  ·  ' : ''}${ops.lines.filter(L => L.on).length} line${ops.lines.filter(L => L.on).length === 1 ? '' : 's'}  ·  ${n} × ${mdl}  ·  ${ops.cfg.charge === 'swap' ? 'battery swap' : 'automatic charging'}`, 70, 132, 1300, 24, 500, MUTE);
    card(CU.x, CU.y, CU.w, CU.h); card(HX, 150, HW, 236); card(HX, 404, HW, 92); card(HX, 514, HW, 498);
    txt('SHIFT CLOCK', HX + 36, 196, 20, 700, BLUE); txt('PRODUCTION LINES', HX + 36, 556, 20, 700, BLUE);
    fitTxt(`Each line packs a pallet every ${fmt(ops.cfg.intervalMin)} min`, HX + 36, 584, HW - 72, 17, 500, MUTE);
    txt('LINE', HX + 36, 620, 13, 700, MUTE); txt('PALLET PROGRESS', HX + 196, 620, 13, 700, MUTE); txt('STATUS', HX + HW - 36, 620, 13, 700, MUTE, 'right');
    for (let i = 0; i < 4; i++) card(KX(i), KY, KW, KH);
    // the timeline of AMR 1: what it does when, across the shift
    const a = ops.amrs[0], span = ops.Hend;
    ctx.save(); rr(ctx, MAP.x, TLY, MAP.w, TLH, 9); ctx.clip(); ctx.fillStyle = '#E3E8F1'; ctx.fillRect(MAP.x, TLY, MAP.w, TLH);
    const NB = 96, bw = MAP.w / NB, bins = Array.from({ length: NB }, () => ({ work: 0, wait: 0, charge: 0, idle: 0 }));
    a.model.segs.forEach(g => { const c = CAT[g.kind] || 'work'; let b0 = Math.floor(g.t0 / span * NB), b1 = Math.min(NB - 1, Math.floor(g.t1 / span * NB)); for (let b = Math.max(0, b0); b <= b1; b++) { const lo = Math.max(g.t0, b * span / NB), hi = Math.min(g.t1, (b + 1) * span / NB); if (hi > lo) bins[b][c] += hi - lo; } });
    bins.forEach((b, i) => { let y = TLY + TLH; const tot = b.work + b.wait + b.charge + b.idle || 1; ['idle', 'charge', 'wait', 'work'].forEach(c => { const hgt = TLH * b[c] / tot; if (hgt > 0.2) { ctx.fillStyle = CATC[c]; ctx.fillRect(MAP.x + i * bw, y - hgt, bw - 1, hgt); } y -= hgt; }); });
    ctx.restore();
    [['Working', CATC.work], ['Waiting (door, obstacle)', CATC.wait], ['Charging', CATC.charge], ['Idle', CATC.idle]].forEach((l, i) => { const lx = MAP.x + [0, 170, 470, 640][i]; ctx.fillStyle = l[1]; ctx.beginPath(); ctx.arc(lx + 8, 1050, 8, 0, 7); ctx.fill(); txt(l[0], lx + 26, 1058, 21, 500, MUTE); });
  }
  function drawHudOps(tt, sts) {
    const a0 = ops.amrs[0], s = sts[0], bat = OPS.valueAt(a0.batPts, tt, true), Hn = ops.H;
    // the clock and the battery
    // the big clock stays inside its card: the day goes small on the right ("Day 2"), the time shrinks to fit; a run of whole days ends at 24:00:00, not "Day 2 0:00:00"
    const whole = h => h > 0 && h % 86400 === 0, cs = whole(Hn) && tt >= Hn - 0.5 ? `${Hn / 3600}:00:00` : clock(tt), dm = /^(Day \d+)\s+(.*)$/.exec(cs);
    if (dm) { txt(dm[1], HX + HW - 36, 266, 26, 700, BLUE, 'right'); fitTxt(dm[2], HX + 36, 266, HW - 72 - width(dm[1], 26, 700) - 14, 60, 700, INK); } else fitTxt(cs, HX + 36, 266, HW - 72, 60, 700, INK);
    fitTxt(`of ${whole(Hn) ? Hn / 3600 + ':00:00' : clock(Hn)}${ops.scenarioHours > 24 ? '  ·  day 1 shown' : ''}`, HX + 36, 300, HW - 72, 20, 500, MUTE);
    const chg = s.kind === 'charge' || s.kind === 'swap', bc = bat < 0.2 ? '#D8362F' : bat < 0.5 ? AMBER : '#1E9E5A';
    txt(sts.length > 1 ? 'AMR 1 battery' : 'Battery', HX + 36, 340, 21, 500, MUTE); txt(fmt(bat * 100) + '%', HX + HW - 36, 340, 26, 700, INK, 'right');
    if (chg) fitTxt(s.kind === 'swap' ? 'Swapping' : bat >= 0.995 ? 'Full' : 'Charging', HX + HW - 36 - width(fmt(bat * 100) + '%', 26, 700) - 14, 340, 140, 18, 700, GREEN, 'right');
    ctx.save(); ctx.fillStyle = 'rgba(11,18,32,.08)'; rr(ctx, HX + 36, 354, HW - 72, 14, 7); ctx.fill(); ctx.fillStyle = bc; rr(ctx, HX + 36, 354, Math.max(8, (HW - 72) * bat), 14, 7); ctx.fill(); ctx.restore();
    // what AMR 1 is doing
    const col = KIND[s.kind] || SLATE, job = s.jobRef, L = job && !job.service && job.pallet !== undefined ? ops.lines[ops.pallets.find(p => p.id === job.pallet).li] : null;
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(HX + 44, 445, 11, 0, 7); ctx.fill(); ctx.restore();
    fitTxt(s.label, HX + 72, 438, HW - 72 - 28, 25, 700, INK);
    fitTxt(L ? `${L.name}  →  ${job.toName || 'the drop-off'}${s.phase ? '  ·  ' + s.phase : ''}` : (s.phase || ''), HX + 72, 470, HW - 72 - 28, 19, 500, MUTE);
    // the lines, one row each: LINE (number and name) | PALLET PROGRESS (the bar fills while a pallet is packed) | STATUS in words:
    // Making (packing) / Ready (finished, waiting for the AMR; the number when several) / Collecting (the AMR is on its way or loading it) / Idle
    const lines = ops.lines.filter(Lx => Lx.on), n = lines.length, pitch = Math.min(30, 262 / Math.max(n - 1, 1)), serving = L ? L.li : -1, x1 = HX + HW - 36;
    lines.forEach((Lx, i) => {
      const yy = 654 + i * pitch, st = lineState(Lx, tt), act = Lx.li === serving, mid = yy - 7;
      if (act) { ctx.save(); ctx.fillStyle = 'rgba(47,91,208,.09)'; rr(ctx, HX + 14, mid - 14, HW - 28, 28, 10); ctx.fill(); ctx.restore(); }
      ctx.save(); ctx.fillStyle = act ? BLUE : '#E3E8F3'; ctx.beginPath(); ctx.arc(HX + 48, mid, 12, 0, 7); ctx.fill(); ctx.restore();
      txt(Lx.tag, HX + 48, mid + 4.5, 13, 700, act ? '#fff' : SLATE, 'center');
      fitTxt(Lx.name, HX + 70, yy, 118, 19, act ? 700 : 500, act ? INK : SLATE);
      const bx = HX + 196, bw = 86;
      ctx.save(); ctx.fillStyle = 'rgba(11,18,32,.08)'; rr(ctx, bx, mid - 4, bw, 8, 4); ctx.fill();
      if (st.waiting) { ctx.fillStyle = AMBER; rr(ctx, bx, mid - 4, bw, 8, 4); ctx.fill(); }
      else if (st.producing) { ctx.fillStyle = BLUE; rr(ctx, bx, mid - 4, Math.max(8, bw * st.prog), 8, 4); ctx.fill(); }
      ctx.restore();
      const label = act ? 'Collecting' : st.waiting ? (st.waiting > 1 ? `${st.waiting} ready` : 'Ready') : st.producing ? 'Making' : 'Idle';
      if (act || st.waiting) {
        ctx.font = `700 14px ${FONT}`; const pw = ctx.measureText(label).width + 20;
        ctx.save(); ctx.fillStyle = act ? 'rgba(47,91,208,.13)' : '#FFEFC7'; rr(ctx, x1 - pw, mid - 12, pw, 24, 12); ctx.fill(); ctx.restore();
        txt(label, x1 - pw / 2, mid + 5, 14, 700, act ? BLUE : '#8A5A00', 'center');
      } else txt(label, x1, mid + 5, 14, 500, st.producing ? MUTE : '#9AA6BC', 'right');
    });
    // the pickup queue: the pallets that are ready and waiting for the AMR, oldest first, with how long each has waited
    const q = ops.pallets.filter(p => p.tCall <= tt && (p.tAssign === null || p.tAssign > tt)).sort((p1, p2) => p1.tCall - p2.tCall);
    ctx.save(); ctx.fillStyle = 'rgba(11,18,32,.09)'; ctx.fillRect(HX + 36, 936, HW - 72, 2); ctx.restore();
    txt('WAITING FOR PICKUP', HX + 36, 968, 15, 700, BLUE); txt(q.length ? `${q.length} ${q.length === 1 ? 'pallet' : 'pallets'}` : 'none', x1, 968, 18, 700, q.length ? INK : MUTE, 'right');
    if (!q.length) txt('The AMR has caught up', HX + 36, 1000, 17, 500, MUTE);
    else { let qx = HX + 36; q.slice(0, 3).forEach(p => { const tg = ops.lines[p.li].tag, tm = mm(tt - p.tCall); ctx.save(); ctx.fillStyle = '#E3E8F3'; ctx.beginPath(); ctx.arc(qx + 11, 994, 11, 0, 7); ctx.fill(); ctx.restore(); txt(tg, qx + 11, 998.5, 12, 700, SLATE, 'center'); txt(tm, qx + 28, 1000, 17, 600, INK); qx += 28 + width(tm, 17, 600) + 18; }); txt('waited', Math.min(qx, x1), 1000, 14, 500, MUTE); }
    // the four counters (so far in the shift)
    const moved = ops.pallets.filter(p => p.tDrop !== null && p.tDrop <= tt), made = ops.pallets.filter(p => p.tFinish <= tt).length;
    const lead = moved.length ? moved.reduce((sm, p) => sm + p.tDrop - p.tCall, 0) / moved.length : 0, c = catAt(a0, tt), tot = Math.max(1, tt);
    const qmax = ops.series.queue.reduce((mx, p) => p[0] <= tt ? Math.max(mx, p[1]) : mx, 0);
    const chip = (i, label, v, unitT) => { txt(label, KX(i) + 22, KY + 26, 15, 700, BLUE); txt(v, KX(i) + 22, KY + 62, 34, 700, INK); const bw = ctx.measureText(v).width; if (unitT) fitTxt(unitT, KX(i) + 22 + bw + 8, KY + 62, KW - 44 - bw - 8, 18, 500, MUTE); };
    chip(0, 'PALLETS MOVED', String(moved.length), `of ${made} made`);
    chip(1, 'TIME PER PALLET', moved.length ? mm(lead) : '—', 'call to drop-off');
    chip(2, 'AMR WORKING', fmt(100 * c.work / tot) + '%', `${fmt(100 * c.charge / tot)}% charging`);
    chip(3, 'QUEUE NOW', String(q.length), `max ${qmax} so far`);
    // where we are on the timeline
    const px = MAP.x + Math.min(1, tt / ops.Hend) * MAP.w; ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, TLY + TLH / 2, 14, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    fitTxt('Simulated estimate based on the settings shown', MAP.x + MAP.w, 1058, 520, 19, 600, MUTE, 'right');
    hits = [{ timeline: true, x: MAP.x - 10, y: TLY - 16, w: MAP.w + 20, h: TLH + 32 }];
    if (toast && wall() - toast.at < 3.2) { ctx.font = `600 20px ${FONT}`; const w = Math.min(MAP.w - 40, ctx.measureText(toast.text).width + 44); ctx.save(); ctx.fillStyle = BLUE; rr(ctx, MAP.x + 20, MAP.y + 16, w, 46, 14); ctx.fill(); ctx.restore(); fitTxt(toast.text, MAP.x + 42, MAP.y + 46, w - 44, 20, 600, '#fff'); }
    if (placing) { const msg = 'Click on a route to put an obstacle there'; ctx.font = `600 20px ${FONT}`; const w = ctx.measureText(msg).width + 44; ctx.save(); ctx.fillStyle = ORANGE; rr(ctx, MAP.x + 20, MAP.y + 70, w, 46, 14); ctx.fill(); ctx.restore(); txt(msg, MAP.x + 42, MAP.y + 100, 20, 600, '#fff'); }
    return serving;
  }
  /* ---------- the dashboard: the shift view puts its readings in HTML panels beside the picture (the picture gets the space; the video keeps the full composite) ---------- */
  let dash = false, DH = 800, legacyHold = false;
  const wantDash = () => mode === 'shift' && !recState && !legacyHold;
  function layout(on, w, h) {
    const nw = on ? w : 1920, nh = on ? h : 1080;
    if (on === dash && cv.width === nw && cv.height === nh) return;
    dash = on; W = nw; H = nh; MAP = on ? { x: 22, y: 22, w: W - 44, h: H - 44 } : { x: 70, y: 160, w: 1330, h: 730 };
    cv.width = W; cv.height = H; if (stat) { stat.width = W; stat.height = H; } statKey = ''; camMemo = null; tlKey = '';
    const st = $('#simStage'); if (st) st.classList.toggle('dash', on);
    const bar = $('#simBar'), slot = $('#dTlBar'), sheet = $('#simSheet');
    if (bar && slot && sheet) { if (on) { if (bar.parentNode !== slot) slot.appendChild(bar); } else if (bar.parentNode !== sheet.parentNode) sheet.parentNode.insertBefore(bar, sheet); }
    if (on) setTimeout(fitView, 30);
  }
  function applyLayout() { layout(wantDash(), W, H); }
  // the picture takes the shape of the space it is given (about 0.9 screen pixels to a drawing pixel, so its labels keep a readable size at any window size)
  function fitView() {
    if (!dash || !cv) return; const box = $('.dview'); if (!box) return; const r = box.getBoundingClientRect(); if (r.width < 80 || r.height < 80) return;
    const nw = Math.round(clampV(r.width / 0.9, 900, 2400)), nh = Math.round(clampV(r.height / 0.9, 500, 1500));
    if (Math.abs(nw - W) > 12 || Math.abs(nh - H) > 12 || !dash) layout(true, nw, nh);
  }
  function drawOverlays() {
    if (toast && wall() - toast.at < 3.2) { ctx.font = `600 20px ${FONT}`; const w = Math.min(MAP.w - 40, ctx.measureText(toast.text).width + 44); ctx.save(); ctx.fillStyle = BLUE; rr(ctx, MAP.x + 20, MAP.y + 16, w, 46, 14); ctx.fill(); ctx.restore(); fitTxt(toast.text, MAP.x + 42, MAP.y + 46, w - 44, 20, 600, '#fff'); }
    if (placing) { const msg = 'Click on a route to put an obstacle there'; ctx.font = `600 20px ${FONT}`; const w = ctx.measureText(msg).width + 44; ctx.save(); ctx.fillStyle = ORANGE; rr(ctx, MAP.x + 20, MAP.y + 70, w, 46, 14); ctx.fill(); ctx.restore(); txt(msg, MAP.x + 42, MAP.y + 100, 20, 600, '#fff'); }
  }
  // the AMR close-up, drawn into the little canvas in the left panel
  function drawCloseupDom(s) {
    const c = $('#simClose'); if (!c || !s || !c.clientWidth) return;   // (hidden on a short screen)
    const main = ctx, keepCU = CU; ctx = c.getContext('2d'); CU = { x: 0, y: 0, w: 330, h: 170 };
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 330, 170); drawCloseup(s, { bare: true }); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx = main; CU = keepCU;
  }
  // the timeline under the picture: what AMR 1 does across the run; what is still to come is lighter; click or drag to jump
  let tlKey = '', tlCache = null;
  function drawTimelineDom(tt) {
    const c = $('#simTl'); if (!c || !ops) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = Math.max(240, Math.round(c.clientWidth * dpr)), ch = Math.round(38 * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; tlKey = ''; }
    const key = [opsSig, cw, ch].join('|');
    if (key !== tlKey || !tlCache) {
      tlKey = key; tlCache = document.createElement('canvas'); tlCache.width = cw; tlCache.height = ch; const g = tlCache.getContext('2d');
      const span = ops.Hend, NB = Math.max(60, Math.min(240, Math.round(cw / (5 * dpr)))), bw = cw / NB, bins = Array.from({ length: NB }, () => ({ work: 0, wait: 0, charge: 0, idle: 0 }));
      g.fillStyle = '#E3E8F1'; g.fillRect(0, 0, cw, ch);
      ops.amrs[0].model.segs.forEach(sg => { const k = CAT[sg.kind] || 'work'; const b0 = Math.max(0, Math.floor(sg.t0 / span * NB)), b1 = Math.min(NB - 1, Math.floor(sg.t1 / span * NB)); for (let b = b0; b <= b1; b++) { const lo = Math.max(sg.t0, b * span / NB), hi = Math.min(sg.t1, (b + 1) * span / NB); if (hi > lo) bins[b][k] += hi - lo; } });
      bins.forEach((b, i) => { let y = ch; const tot = b.work + b.wait + b.charge + b.idle || 1; ['idle', 'charge', 'wait', 'work'].forEach(k => { const hg = ch * b[k] / tot; if (hg > 0.2) { g.fillStyle = CATC[k]; g.fillRect(i * bw, y - hg, Math.ceil(bw) - 1, hg); } y -= hg; }); });
      const hm = sx => { sx = Math.round(sx / 60); return Math.floor(sx / 60) + ':' + String(sx % 60).padStart(2, '0'); };
      put('dTicks', [0, 1, 2, 3, 4].map(i => `<span>${hm(span * i / 4)}</span>`).join(''));
    }
    const g = c.getContext('2d'); g.clearRect(0, 0, cw, ch); g.drawImage(tlCache, 0, 0);
    const x = Math.min(1, tt / ops.Hend) * cw; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x, 0, cw - x, ch);
    g.fillStyle = INK; g.fillRect(x - 1.5 * dpr, 0, 3 * dpr, ch); g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2.5 * dpr; g.beginPath(); g.arc(Math.max(9 * dpr, Math.min(cw - 9 * dpr, x)), ch / 2, 8 * dpr, 0, 7); g.fill(); g.stroke();
  }
  // the panels: written at about 8 times a second, and only when the text changed
  let panelAt = 0; const panelCache = {};
  function put(id, html) { if (panelCache[id] === html) return; panelCache[id] = html; const el = document.getElementById(id); if (el) el.innerHTML = html; }
  let fitN = 0;
  function updatePanels(tt, sts) {
    if (++fitN % 15 === 0) fitView();   // (a resize observer can lag, so the shape is checked now and then too)
    drawCloseupDom(sts[0]); drawTimelineDom(tt);
    const nowT = performance.now(); if (nowT - panelAt < 120) return; panelAt = nowT;
    const a0 = ops.amrs[0], s = sts[0], bat = OPS.valueAt(a0.batPts, tt, true), Hn = ops.H, M = D && D.model, n = ops.amrs.length, cfg = ops.cfg;
    const cl = S.client && S.client.name ? S.client.name : '', on = ops.lines.filter(Lx => Lx.on).length;
    put('dTitle', cfg.scenario === 'shift' ? `A shift with the AMR${n > 1 ? 's' : ''}` : cfg.scenario === 'day' ? `A day with the AMR${n > 1 ? 's' : ''}` : `The AMR${n > 1 ? 's' : ''} at work`);
    put('dSub', esc(`${cl ? cl + '  ·  ' : ''}${on} line${on === 1 ? '' : 's'}  ·  ${n} × ${M ? M.name : 'Pallet jack AMR'}  ·  ${cfg.charge === 'swap' ? 'battery swap' : 'automatic charging'}`));
    // the clock and the battery
    const whole = h => h > 0 && h % 86400 === 0, cs = whole(Hn) && tt >= Hn - 0.5 ? `${Hn / 3600}:00:00` : clock(tt), dm = /^(Day \d+)\s+(.*)$/.exec(cs);
    const chg = s.kind === 'charge' || s.kind === 'swap', bc = bat < 0.2 ? '#D8362F' : bat < 0.5 ? AMBER : '#1E9E5A';
    put('pClock', `<div class="plabel">Shift clock</div><div class="pclock"><b>${esc(dm ? dm[2] : cs)}</b>${dm ? `<span class="pday">${esc(dm[1])}</span>` : ''}</div>`
      + `<div class="psub">of ${whole(Hn) ? Hn / 3600 + ':00:00' : esc(clock(Hn))}${ops.scenarioHours > 24 ? ' · day 1 shown' : ''}</div>`
      + `<div class="prow"><span>${n > 1 ? 'AMR 1 battery' : 'Battery'}</span>${chg ? `<em class="pchg">${s.kind === 'swap' ? 'Swapping' : bat >= 0.995 ? 'Full' : 'Charging'}</em>` : ''}<b>${fmt(bat * 100)}%</b></div><div class="pbar"><i style="width:${Math.max(3, bat * 100)}%;background:${bc}"></i></div>`);
    // what AMR 1 is doing
    const job = s.jobRef, L = job && !job.service && job.pallet !== undefined ? ops.lines[ops.pallets.find(p => p.id === job.pallet).li] : null, serving = L ? L.li : -1;
    put('pAmrTxt', `<div class="pamr"><i class="dot" style="background:${KIND[s.kind] || SLATE}"></i><div><b>${esc(s.label)}</b><span>${esc((n > 1 ? 'AMR 1 of ' + n + ' · ' : '') + (L ? `${L.name} → ${job.toName || 'the drop-off'}${s.phase ? ' · ' + s.phase : ''}` : (s.phase || '')))}</span></div></div>`);
    put('pAmrCap', esc(M ? `${M.name}${M.payloadKg ? ' · ' + fmt(M.payloadKg) + ' kg payload' : ''}` : 'Pallet jack AMR'));
    // the four counters
    const q = ops.pallets.filter(p => p.tCall <= tt && (p.tAssign === null || p.tAssign > tt)).sort((p1, p2) => p1.tCall - p2.tCall);
    const moved = ops.pallets.filter(p => p.tDrop !== null && p.tDrop <= tt), made = ops.pallets.filter(p => p.tFinish <= tt).length;
    const lead = moved.length ? moved.reduce((sm, p) => sm + p.tDrop - p.tCall, 0) / moved.length : 0, c = catAt(a0, tt), tot = Math.max(1, tt);
    const qmax = ops.series.queue.reduce((mx, p) => p[0] <= tt ? Math.max(mx, p[1]) : mx, 0);
    const kpi = (l, v, sub) => `<div class="kpi"><span>${l}</span><b>${esc(v)}</b><em>${esc(sub)}</em></div>`;
    put('pKpi', `<div class="pkpi">${kpi('Pallets moved', String(moved.length), `of ${made} made`)}${kpi('Time per pallet', moved.length ? mm(lead) : '—', 'call to drop-off')}${kpi('AMR working', fmt(100 * c.work / tot) + '%', `${fmt(100 * c.charge / tot)}% charging`)}${kpi('Queue now', String(q.length), `max ${qmax} so far`)}</div>`);
    // the lines: LINE | PALLET PROGRESS (fills while a pallet is packed) | STATUS in words (Making, Ready, Collecting, Idle)
    const rows = ops.lines.filter(Lx => Lx.on).map(Lx => {
      const st = lineState(Lx, tt), act = Lx.li === serving, w = st.waiting ? 100 : st.producing ? Math.max(8, st.prog * 100) : 0;
      const label = act ? 'Collecting' : st.waiting ? (st.waiting > 1 ? `${st.waiting} ready` : 'Ready') : st.producing ? 'Making' : 'Idle', cls = act ? 'col' : st.waiting ? 'rdy' : st.producing ? '' : 'idle';
      return `<li class="lr${act ? ' act' : ''}" data-li="${Lx.li}" title="Click to look at this line in the picture"><i class="tag">${esc(Lx.tag)}</i><span class="nm">${esc(Lx.name)}</span><span class="lbar"><i class="${st.waiting ? 'rdy' : ''}" style="width:${w.toFixed(0)}%"></i></span><span class="stt ${cls}">${label}</span></li>`;
    }).join('');
    const qhtml = q.length ? `<div class="qrow">${q.slice(0, 4).map(p => `<span class="qchip"><i class="tag">${esc(ops.lines[p.li].tag)}</i>${mm(tt - p.tCall)}</span>`).join('')}<small>time waited</small></div>` : `<div class="qnone">The AMR has caught up</div>`;
    put('pLines', `<div class="plabel">Production lines</div><p class="lsub">Each line packs a pallet every ${fmt(cfg.intervalMin)} min</p>`
      + `<div class="lcap"><span>Line</span><span></span><span>Progress</span><span>Status</span></div><ul class="llist">${rows}</ul>`
      + `<div class="qbox"><div class="qhead"><span>Waiting for pickup</span><b>${q.length ? `${q.length} ${q.length === 1 ? 'pallet' : 'pallets'}` : 'none'}</b></div>${qhtml}</div>`);
  }
  function focusLine(li) {
    const L = ops && ops.lines.find(q => q.li === li); if (!L) return;
    focusOn({ kind: 'line', id: li, wx: L.pick.x + Math.cos(L.hd) * 0.47 * VIZ, wy: L.pick.y + Math.sin(L.hd) * 0.47 * VIZ });
  }
  function focusAmr() { if (!ops || !ops.amrs[0]) return; const q = Sim.at(ops.amrs[0].model, Math.min(t, ops.Hend)); focusOn({ kind: 'amr', id: 0, wx: q.x, wy: q.y }); }

  function frameOps(tt) {
    const key = ['ops', camTag(), speedF, !!(img && img.complete && img.naturalWidth), rebuild.sig, opsSig, W, H].join('|');
    if (!stat) { stat = document.createElement('canvas'); stat.width = W; stat.height = H; }
    if (key !== statKey) {
      statKey = key; const main = ctx; ctx = stat.getContext('2d'); cam = camera();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#FBFCFE'); bg.addColorStop(1, '#E9EEF8'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.save(); clipWorld(); drawGround(); drawAreas(); drawRoutesBase(opsModel); drawStations(ops.lines.map(L => ({ x: L.pick.x, y: L.pick.y, tag: L.tag, far: L.ri === opsModel.far }))); ctx.restore(); if (!dash) drawHudStaticOps(); ctx = main;
    }
    cam = camera(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(stat, 0, 0);
    const sts = ops.amrs.map(a => Sim.at(a.model, tt)), s0 = sts[0], j0 = s0.jobRef, serving = j0 && !j0.service && j0.pallet !== undefined ? ops.pallets.find(p => p.id === j0.pallet).li : -1;
    picks = []; const info = selInfo(tt, sts, serving);
    ctx.save(); clipWorld();
    drawFocus(info);
    sts.forEach((s, i) => { if (s.jobRef && !s.jobRef.service) drawProgress(s, ops.amrs[i].model); });
    drawLines(tt, serving); drawDoors(tt); drawObstacles(tt);
    sts.forEach((s, i) => { drawAmr(s, 'AMR ' + String(i + 1).padStart(2, '0')); picks.push({ kind: 'amr', id: i, wx: s.x, wy: s.y, wz: 0.7 * VIZ, r: 64 }); });
    ctx.restore();
    if (dash) { hits = []; drawOverlays(); updatePanels(tt, sts); } else { drawCloseup(s0); drawHudOps(tt, sts); }
    drawInspector(info);
  }

  /* ---------- the picture ---------- */
  let stat = null, statKey = '';
  function frame(tt) {
    if (!model || !model.ok) return;
    if (mode === 'shift' && ops) { frameOps(Math.min(tt, ops.Hend)); return; }
    const s = Sim.at(model, tt), key = [camTag(), speedF, !!(img && img.complete && img.naturalWidth), rebuild.sig].join('|');
    if (!stat) { stat = document.createElement('canvas'); stat.width = W; stat.height = H; }
    if (key !== statKey) {   // the floor, the areas, the routes and the readings' frames are drawn once
      statKey = key; const main = ctx; ctx = stat.getContext('2d'); cam = camera();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#FBFCFE'); bg.addColorStop(1, '#E9EEF8'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.save(); clipWorld(); drawGround(); drawAreas(); drawRoutesBase(); drawStations(); ctx.restore(); drawHudStatic(); ctx = main;
      dots = rows.map((r, i) => { const R = model.routes[i], g = toScreen(R.P[0].x, R.P[0].y, 0); return { i, cx: g[0], cy: g[1], r: 24 }; });
    }
    cam = camera();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(stat, 0, 0);
    ctx.save(); clipWorld(); drawProgress(s); drawTaskEnds(); drawAmr(s); ctx.restore(); drawCloseup(s); drawHud(s);
    if (task && s.finished && playing && !recState) { playing = false; ui(); }   // a task ends with the AMR standing where it put the pallet down
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!cv || $('#sim').hidden) { last = now; return; }
    const dt = Math.min(recState ? 1 : 0.1, (now - last) / 1000); last = now;   // while recording, time must follow the clock even on a slow computer
    if (playing && model && model.ok) {
      t += dt * speedF;
      if (recState && t >= recState.end) { t = recState.end - 1e-3; frame(t); finishRecording(); return; }
      if (mode === 'shift' && ops && t >= ops.Hend) { t = ops.Hend; playing = false; ui(); }
    }
    if (model && model.ok) { stepCam(dt); frame(t); if (recState) setNote(`Recording… ${Math.max(0, Math.ceil((recState.end - t) / speedF))} s left. Keep this tab open.`); }
  }

  /* ---------- the model from the proposal ---------- */
  const parseLabel = (label, i) => { const m = /^(?:Longest route\s*[·-]\s*)?Point\s+(\S+)(?:\s*\((.*)\))?\s*$/.exec(label || ''); return m ? { num: m[1], name: m[2] || 'Point ' + m[1] } : { num: String(i + 1), name: (label || 'Route ' + (i + 1)).replace(/^Longest route\s*[·-]\s*/, '') }; };
  function buildModel() {
    const lp = S.layoutPlan || {}, routes = (lp.routes || []).filter(r => (r.pts || []).length > 1), aspect = D.layoutAspect || 1.5, M = D && D.model;
    const spots = (lp.points || []).filter(p => p.kind === 'spot');
    const dropName = r => { const e = r.pts[r.pts.length - 1]; let best = null, bd = 1e9; spots.forEach(p => { const dd = Math.hypot(p.x - e.x, (p.y - e.y) / aspect); if (dd < bd) { bd = dd; best = p; } }); return best && bd < 0.05 ? 'Spot ' + best.label : 'the drop-off'; };
    const named = routes.map((r, i) => Object.assign({}, r, { fromName: parseLabel(r.label, i).name, toName: dropName(r) }));
    const pts = (lp.points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.id !== undefined);
    const net = root.WFCNet ? root.WFCNet.build({ routes, points: pts, aspect }) : null;
    const m = Sim.build({ routes: named, aspect, distanceM: S.route.distanceM, speedMps: S.route.speedMps, bufferPct: S.route.bufferPct, dwellS: S.route.dwellS, net, turnM: M && M.turnM, liftMm: M && M.liftMm });
    if (m.ok) rows = m.routes.map((R, i) => Object.assign({ distanceM: R.distanceM }, parseLabel(R.label, i)));
    return m;
  }
  // the points a task can start and end at: the drop-off spots and the pick-up stations (named as in the station list)
  function taskPoints() {
    const lp = S.layoutPlan || {}, out = []; if (!model || !model.ok) return out;
    const dz = (lp.zones || []).find(z => z.kind === 'drop');
    (lp.points || []).filter(p => p.kind === 'spot').forEach(p => out.push({ id: p.id, x: p.x, y: p.y, name: 'Spot ' + (p.label || ''), text: 'Spot ' + (p.label || ''), group: (dz && dz.label) || 'Drop-off' }));
    (lp.points || []).filter(p => p.kind === 'pick').forEach(p => {
      let bi = -1, bd = 1e9; model.routes.forEach((R, i) => { const w = planToWorld(p), dd = Math.hypot(R.P[0].x - w[0], R.P[0].y - w[1]); if (dd < bd) { bd = dd; bi = i; } });
      const row = bi >= 0 && bd < 0.05 * model.k ? rows[bi] : null, name = row ? row.name : 'Point ' + p.label, same = new RegExp('(^|\\D)' + String(p.label).replace(/\W/g, '') + '$').test(name);
      out.push({ id: p.id, x: p.x, y: p.y, name, text: same || !row ? name : `${name}  (point ${p.label})`, group: 'Pick-up stations' });
    });
    return out;
  }
  const findPoint = q => { q = String(q).trim().toLowerCase(); return taskPts.find(p => String(p.id).toLowerCase() === q) || taskPts.find(p => p.name.toLowerCase() === q) || taskPts.find(p => p.name.toLowerCase() === 'spot ' + q) || taskPts.find(p => p.name.toLowerCase() === 'channel ' + q) || taskPts.find(p => p.name.toLowerCase() === 'point ' + q) || null; };
  function fillTaskBar() {
    const fr = $('#taskFrom'), to = $('#taskTo'); if (!fr || !to) return;
    const sig = taskPts.map(p => p.id + p.text).join('|'); if (fr.dataset.sig === sig) return; fr.dataset.sig = sig;
    const keepF = fr.value, keepT = to.value, groups = []; taskPts.forEach(p => { let g = groups.find(x => x.name === p.group); if (!g) groups.push(g = { name: p.group, items: [] }); g.items.push(p); });
    const html = groups.map(g => `<optgroup label="${esc(g.name)}">${g.items.map(p => `<option value="${esc(String(p.id))}">${esc(p.text)}</option>`).join('')}</optgroup>`).join('');
    fr.innerHTML = '<option value="">Choose a point</option>' + html; to.innerHTML = '<option value="">Choose a point</option>' + html;   // nothing chosen = the longest route
    fr.value = taskPts.some(p => String(p.id) === keepF) ? keepF : ''; to.value = taskPts.some(p => String(p.id) === keepT) ? keepT : '';
  }
  function rebuild() {
    const lp = S.layoutPlan || {}, routes = (lp.routes || []).filter(r => (r.pts || []).length > 1);
    const sig = JSON.stringify([routes.map(r => [r.label, r.pts]), D.layoutAspect, S.route.distanceM, S.route.speedMps, S.route.bufferPct, S.route.dwellS, (lp.points || []).map(p => [p.id, p.kind, p.x, p.y]), D.model && D.model.id]);
    if (rebuild.sig === sig && model) return false;
    rebuild.sig = sig; const was = model && model.ok;
    task = null; model = buildModel(); if (!was || !model.ok) t = 0; taskPts = taskPoints(); opsModel = null;
    return true;
  }
  function loadImage() {
    const src = S.images.layout || '';
    if (src === imgSrc) return; imgSrc = src; img = null;
    if (src) { const i = new Image(); i.onload = () => { img = i; }; i.src = src; }
  }
  const note = m => { toast = { text: m, at: wall() }; };
  // a fresh start: the AMR parked at the drop-off, the longest route trip after trip (or the same task again)
  function fresh() { if (mode === 'shift') { obsSince = {}; rebuildOps(true); t = 0; playing = true; return; } model = buildModel(); taskPts = taskPoints(); if (task) { const r = Sim.addTask(model, { from: task.from.id, to: task.to.id, approach: task.approach, fromName: task.from.name, toName: task.to.name }); if (!r.ok) task = null; } t = 0; playing = true; }
  function runTask(fromQ, toQ, approach) {
    if (!model || !model.ok) return { ok: false, reason: 'Nothing to simulate yet.' };
    const f = fromQ ? findPoint(fromQ) : null, g = toQ ? findPoint(toQ) : null; if (!f || !g) { const reason = 'Choose a start and an end point. Without a choice the longest route runs.'; note(reason); return { ok: false, reason }; }
    if (f.id === g.id) { const reason = 'Pick two different points.'; note(reason); return { ok: false, reason }; }
    const keep = task; task = { from: f, to: g, approach: approach !== false }; fresh();
    if (!task) { task = keep; const reason = 'No drivable way between those two points on the walkways.'; note(reason); return { ok: false, reason }; }
    ui(); return { ok: true, job: model.jobs[0] };
  }
  function defaultRun() { task = null; const a = $('#taskFrom'), b = $('#taskTo'); if (a) a.value = ''; if (b) b.value = ''; fresh(); ui(); }
  const callStation = i => {
    if (!model || !model.ok || recState) return;
    if (task) { const p = taskPts.find(q => q.name === rows[i].name); if (p) { $('#taskTo').value = String(p.id); syncRun(); note(`To: ${rows[i].name}. Press Run task.`); } return; }
    if (Sim.call(model, t, i)) note(`Sent to ${rows[i].name} (after this trip)`);
  };

  /* ---------- recording to a video file ---------- */
  function setNote(m) { const n = $('#simNote'), v = $('#viewHint'); if (n) n.textContent = m || ''; if (v) { v.textContent = m || ''; v.hidden = !m; } }
  function startRecording() {
    if (!model || !model.ok || recState) return;
    if (!window.MediaRecorder || !cv.captureStream) { setNote('This browser cannot record video. Use Edge or Chrome.'); return; }
    legacyHold = true; applyLayout();   // the saved video is the full picture with the readings on it
    const types = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'], type = types.find(x => MediaRecorder.isTypeSupported(x)) || '';
    const trips = 1, chunks = [], rec = new MediaRecorder(cv.captureStream(30), Object.assign({ videoBitsPerSecond: 9e6 }, type ? { mimeType: type } : {}));
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' }), ext = /mp4/.test(rec.mimeType) ? 'mp4' : 'webm', a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${(S.client.name || 'Client').replace(/[\/:*?"<>|]+/g, ' ')} - AMR simulation.${ext}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (recState && recState.keep) speedF = recState.keep;
      setNote(`Video saved to your Downloads folder (${ext.toUpperCase()}).`); recState = null; legacyHold = false; applyLayout(); ui();
    };
    fresh();
    if (mode === 'shift' && ops) { recState = { rec, end: ops.Hend, keep: speedF }; speedF = Math.max(speedF, ops.Hend / 90); }   // the whole shift in about a minute and a half
    else recState = { rec, end: task ? model.endT : Sim.jobsUntil(model, trips) + 0.01 };
    ui(); frame(0); rec.start(200);
  }
  function finishRecording() { const r = recState; if (!r) return; setTimeout(() => { try { r.rec.stop(); } catch (e) { recState = null; legacyHold = false; applyLayout(); ui(); } }, 600); playing = false; }   // hold the last frame a moment

  /* ---------- presentation mode: the simulation alone, full screen, with only the playback controls ---------- */
  const ICON = {
    play: '<svg class="ico fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg class="ico fill" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
    full: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>',
    exit: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/></svg>'
  };
  let presenting = false, idleT = 0, stillT = 0;
  const simEl = () => $('#sim');
  function present(on) {
    const el = simEl(); if (!el || presenting === on) return;
    presenting = on; el.classList.toggle('presenting', on); document.body.classList.toggle('sim-presenting', on);
    if (on) {
      if (el.requestFullscreen && document.fullscreenEnabled && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* phones only */ } }).catch(() => {});
    } else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (on) showBar(2800); else { clearTimeout(idleT); clearTimeout(stillT); el.classList.remove('showbar', 'still'); }
    ui(); setTimeout(fitView, 60); setTimeout(fitView, 500);   // the picture takes the new shape
  }
  // in presentation mode the controls are OUT OF THE WAY (they used to float over the picture and hid words at the bottom): they show for a moment when it starts,
  // then only when the pointer goes to the bottom edge or onto the bar (a tap on a touch screen, or Tab, brings them back); Space, F and Esc work all the time
  function showBar(ms) {
    const el = simEl(); if (!el) return; el.classList.add('showbar'); clearTimeout(idleT);
    if (ms) idleT = setTimeout(hideBar, ms);
  }
  function hideBar() {
    const el = simEl(); if (!el || !el.classList.contains('showbar')) return;
    if (el.querySelector('.simbar:hover, .simbar :focus-visible')) { idleT = setTimeout(hideBar, 700); return; }   // still using it: look again shortly
    el.classList.remove('showbar');
  }
  function wake(e) {
    const el = simEl(); if (!el || !presenting) return;
    if (e && e.type === 'pointerdown' && e.pointerType && e.pointerType !== 'mouse') {   // touch or pen: a tap on the picture shows or hides the bar, a tap on the bar keeps it
      if (e.target.closest && e.target.closest('.simbar')) showBar(4000); else if (el.classList.contains('showbar')) { clearTimeout(idleT); hideBar(); } else showBar(4000);
      return;
    }
    if (e && e.type === 'mousemove') {
      el.classList.remove('still'); clearTimeout(stillT); stillT = setTimeout(() => el.classList.add('still'), 2800);   // the pointer rests: hide it too
      const r = el.getBoundingClientRect();
      if (e.clientY > r.bottom - 96 || (e.target.closest && e.target.closest('.simbar'))) showBar(); else if (el.classList.contains('showbar')) { clearTimeout(idleT); idleT = setTimeout(hideBar, 500); }
    }
  }
  // the camera controls: "Reset view" shows only when the picture has been turned, tilted, zoomed, moved or pointed at something
  function viewUi() {
    const ok = model && model.ok, b = $('#simReset'), sp = $('#simSpin');
    if (b) b.hidden = !viewMoved() || !ok;
    if (sp) { sp.hidden = !ok; sp.classList.toggle('active', spin); sp.setAttribute('aria-pressed', String(spin)); }
  }
  function resetView() { gl = { az: AZ0, elev: ELEV0, zoom: 1, px: 0, py: 0 }; picked = null; follow = null; spin = false; ui(); }
  function toggleSpin() {
    if (spin) { spin = false; gl.az = az; ui(); return; }
    spin = true; follow = null; picked = null; gl.px = 0; gl.py = 0; gl.zoom = 1; gl.elev = 0.72; if (view !== '3d') view = '3d'; ui();
  }
  // each frame the camera moves a little toward where it is going (a smooth fly-in), follows the AMR that is picked, or keeps turning in the 360 view
  function stepCam(dt) {
    if (!model || !model.ok) return;
    const k = model.k, hh = k / model.aspect;
    if (follow !== null && mode === 'shift' && ops && ops.amrs[follow]) { const s = Sim.at(ops.amrs[follow].model, Math.min(t, ops.Hend)); gl.px = clampV(s.x - k / 2, -k / 2, k / 2); gl.py = clampV(s.y - hh / 2, -hh / 2, hh / 2); }
    const f = 1 - Math.exp(-Math.min(dt, 0.1) * 6), near = (a, b, e) => Math.abs(a - b) < e;
    if (spin) { az += SPIN * Math.min(dt, 0.1); gl.az = az; }
    else { const da = Math.atan2(Math.sin(gl.az - az), Math.cos(gl.az - az)); az += near(da, 0, 1e-4) ? da : da * f; }
    elev = near(gl.elev, elev, 1e-4) ? gl.elev : elev + (gl.elev - elev) * f;
    zoom = near(gl.zoom, zoom, 1e-4) ? gl.zoom : zoom * Math.exp(Math.log(gl.zoom / zoom) * f);
    pan.x = near(gl.px, pan.x, 1e-3) ? gl.px : pan.x + (gl.px - pan.x) * f; pan.y = near(gl.py, pan.y, 1e-3) ? gl.py : pan.y + (gl.py - pan.y) * f;
  }
  // click the AMR, a door or a line's pallet: the camera flies in on it and a card says what it is doing
  function focusOn(h) {
    if (!model || !model.ok) return;
    const k = model.k, hh = k / model.aspect;
    picked = { kind: h.kind, id: h.id }; spin = false; follow = h.kind === 'amr' ? h.id : null;
    gl.px = clampV(h.wx - k / 2, -k / 2, k / 2); gl.py = clampV(h.wy - hh / 2, -hh / 2, hh / 2);
    gl.zoom = h.kind === 'door' ? 3.2 : 3.6; if (view === '3d' && (gl.elev < 0.5 || gl.elev > 1.0)) gl.elev = 0.68;
    ui();
  }
  function pickAt(p) {
    if (mode !== 'shift' || !ops || !picks.length) return null;
    const c = camera(); let best = null;
    picks.forEach(h => { const g = c.P(h.wx, h.wy, h.wz), r = h.r * Math.pow(Math.max(zoom, 1), 0.7), d = Math.hypot(p.x - g[0], p.y - g[1]); if (d <= r) { const sc = d / r - (h.kind === 'amr' ? 0.6 : 0); if (!best || sc < best.sc) best = Object.assign({ sc }, h); } });
    return best;
  }
  // what the card says about the thing that was picked
  function selInfo(tt, sts, serving) {
    if (!picked || !ops) return null;
    if (picked.kind === 'amr') {
      const a = ops.amrs[picked.id], s = sts[picked.id]; if (!a || !s) { picked = null; follow = null; return null; }
      const bat = OPS.valueAt(a.batPts, tt, true), moved = ops.pallets.filter(q => q.amr === a.id && q.tDrop !== null && q.tDrop <= tt).length;
      return { pos: [s.x, s.y], title: 'AMR ' + String(picked.id + 1).padStart(2, '0'), sub: (s.label || '') + (s.phase ? ' · ' + s.phase : ''), col: KIND[s.kind] || SLATE, rm: 4.4,
        rows: [['Speed', `${fmt(s.speed, 2)} m/s`], ['Battery', `${fmt(bat * 100)}%`], ['Carrying', s.laden ? 'A pallet' : 'Nothing'], ['Delivered so far', `${moved} ${moved === 1 ? 'pallet' : 'pallets'}`]] };
    }
    if (picked.kind === 'door') {
      const d = ops.doors.find(q => q.id === picked.id); if (!d) { picked = null; return null; }
      const st = doorState(d, tt), n = d.cycles.filter(c => c.o0 <= tt).length, cfg = ops.cfg;
      return { pos: [d.x, d.y], title: 'Roll-up door', sub: st.label, col: st.col, rm: 4.6,
        rows: [['Opened so far', `${n} ${n === 1 ? 'time' : 'times'}`], ['Opening takes', `${fmt(cfg.doorOpenS)} s`], ['Closing takes', `${fmt(cfg.doorCloseS)} s`], ['Held open for', `${fmt(cfg.doorHoldS)} s after the AMR`]] };
    }
    const L = ops.lines.find(q => q.li === picked.id); if (!L) { picked = null; return null; }
    const st = lineState(L, tt), made = L.pallets.filter(q => q.tFinish <= tt).length, next = L.pallets.find(q => q.tFinish > tt), w = L.pallets.find(q => q.tCall <= tt && (q.tAssign === null || q.tAssign > tt)), c = Math.cos(L.hd), sn = Math.sin(L.hd);
    return { pos: [L.pick.x + c * 0.47 * VIZ, L.pick.y + sn * 0.47 * VIZ], title: L.name, sub: L.li === serving ? 'Collecting: the AMR is on its way or loading' : st.waiting ? 'A pallet is ready for pickup' : st.producing ? 'Packing a pallet' : 'Nothing being packed', col: L.li === serving ? BLUE : st.waiting ? AMBER : '#9AA6BC', rm: 3.4,
      rows: [['Pallet', st.waiting ? `${st.waiting} ready` : st.producing ? `${Math.round(st.prog * 100)}% packed` : 'None'], ['Waiting for pickup', w ? mm(tt - w.tCall) : '—'], ['Made so far', String(made)], ['Next pallet', next ? 'in ' + mm(next.tFinish - tt) : 'none left']] };
  }
  // the spotlight: the layout dims a little round what was picked, which gets a soft pulsing ring
  function drawFocus(info) {
    if (!info) return;
    const a = cam.P(info.pos[0], info.pos[1], 0), g = ctx.createRadialGradient(a[0], a[1], 130, a[0], a[1], 620); g.addColorStop(0, 'rgba(14,22,48,0)'); g.addColorStop(1, 'rgba(14,22,48,.28)');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();   // (inside the clip)
    const ph = (wall() * 0.9) % 1, rx = info.rm * cam.sc * (1 + ph * 0.1);
    ctx.save(); ctx.strokeStyle = `rgba(47,91,208,${0.85 - ph * 0.6})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(a[0], a[1], rx, rx * (cam.iso ? 0.58 * SQ() : 1), 0, 0, 7); ctx.stroke(); ctx.restore();
  }
  function drawInspector(info) {
    cardHits = []; if (!info) return;
    const x = MAP.x + 14, y = MAP.y + 14, w = 350, h = 112 + info.rows.length * 30 + 60;
    card(x, y, w, h);
    ctx.save(); ctx.fillStyle = info.col; ctx.beginPath(); ctx.arc(x + 36, y + 40, 9, 0, 7); ctx.fill(); ctx.restore();
    fitTxt(info.title, x + 58, y + 49, w - 58 - 62, 26, 700, INK); fitTxt(info.sub, x + 28, y + 84, w - 56, 18, 500, MUTE);
    ctx.save(); ctx.strokeStyle = MUTE; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + w - 40, y + 30); ctx.lineTo(x + w - 24, y + 46); ctx.moveTo(x + w - 24, y + 30); ctx.lineTo(x + w - 40, y + 46); ctx.stroke(); ctx.restore();
    info.rows.forEach((r, i) => { const yy = y + 130 + i * 30; ctx.save(); ctx.fillStyle = 'rgba(11,18,32,.07)'; ctx.fillRect(x + 28, yy - 22, w - 56, 1); ctx.restore(); txt(r[0], x + 28, yy, 17, 500, MUTE); fitTxt(r[1], x + w - 28, yy, w - 56 - 130, 18, 700, INK, 'right'); });
    const bx = x + 24, by = y + h - 52, bw = w - 48;
    ctx.save(); ctx.fillStyle = 'rgba(47,91,208,.10)'; rr(ctx, bx, by, bw, 36, 18); ctx.fill(); ctx.restore(); txt('Back to overview', bx + bw / 2, by + 24.5, 17, 700, BLUE, 'center');
    cardHits = [{ x: bx, y: by, w: bw, h: 36 }, { x: x + w - 58, y: y + 14, w: 46, h: 46 }];
  }
  const typing = e => { const t = e.target; return t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); };
  function onKey(e) {
    if (document.body.dataset.tab !== 'sim' || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') { present(!presenting); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') { resetView(); e.preventDefault(); }
    else if (e.key === 'Escape' && (picked || follow !== null || spin)) { resetView(); e.preventDefault(); }
    else if (e.key === 'Escape' && presenting) { present(false); e.preventDefault(); }
    else if (e.key === 'Escape' && placing) { placing = false; ui(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selObs && mode === 'shift') { removeObstacle(selObs); ui(); e.preventDefault(); }
    else if (e.key === ' ' && (e.target === document.body || e.target === cv || presenting)) { $('#simPlay').click(); if (presenting) showBar(1500); e.preventDefault(); }
  }

  /* ---------- the screen ---------- */
  function ui() {
    const ok = model && model.ok, shift = mode === 'shift';
    $('#simStage').hidden = !ok; $('#simMsg').hidden = !!ok;
    if (!ok) $('#simMsg').innerHTML = `<div class="simbox"><b>${esc((model && model.reason) || 'Nothing to show yet.')}</b><span>The simulation uses the routes, speed and cycle time of this proposal.</span></div>`;
    $('#simPlay').innerHTML = (playing ? ICON.pause : ICON.play) + `<span>${playing ? 'Pause' : shift && ops && t >= ops.Hend - 0.5 ? 'Play again' : 'Play'}</span>`;
    const fb = $('#simFull'); if (fb) { fb.innerHTML = (presenting ? ICON.exit : ICON.full) + `<span class="lbl">${presenting ? 'Exit full screen' : 'Full screen'}</span>`; fb.title = presenting ? 'Exit full screen (Esc)' : 'Present full screen (F)'; fb.setAttribute('aria-pressed', String(presenting)); fb.disabled = !ok; }
    document.querySelectorAll('#simMode button').forEach(b => { const on = b.dataset.m === mode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    document.querySelectorAll('#sim .shiftonly').forEach(e => { e.hidden = !shift || !ok; });
    const sp = $('#simSpeed'), list = SPEEDS[mode];
    if (sp.dataset.sig !== mode) { sp.dataset.sig = mode; sp.innerHTML = list.map(v => `<button class="tab" data-v="${v}">${v}×</button>`).join(''); }
    sp.querySelectorAll('button').forEach(b => b.classList.toggle('active', +b.dataset.v === speedF));
    document.querySelectorAll('#simView button').forEach(b => b.classList.toggle('active', b.dataset.v === view));
    viewUi(); cv.dataset.view = view; cv.style.touchAction = presenting || view !== '3d' ? (presenting ? 'none' : '') : 'pan-y';
    ['simPlay', 'simRestart', 'simSpeed', 'simView', 'taskBar', 'simTop'].forEach(id => { const e = $('#' + id); if (e) e.classList.toggle('lock', !!recState); });
    $('#simSave').disabled = !ok || !!recState;
    const tb = $('#taskBar'); if (tb) { tb.hidden = shift || !ok || taskPts.length < 2; if (ok && !shift) { fillTaskBar(); $('#taskDefault').hidden = !task; syncRun(); } }
    if (shift && ok && OPS) {
      const cfg = OPS.settings(S, D), sc = $('#simScen'), hrs = $('#simHours');
      if (sc && document.activeElement !== sc) sc.value = cfg.scenario;
      if (hrs) { hrs.hidden = cfg.scenario !== 'custom'; if (document.activeElement !== hrs) hrs.value = cfg.customH; }
      $('#simAmrsN').textContent = cfg.amrs;
      document.querySelectorAll('#simCharge button').forEach(b => b.classList.toggle('active', b.dataset.v === (cfg.charge === 'swap' ? 'swap' : 'auto')));
      $('#obsAdd').classList.toggle('on', placing); $('#obsAdd').setAttribute('aria-pressed', String(placing)); $('#obsDel').hidden = !selObs;
    }
    document.querySelectorAll('#sim [data-sheet]').forEach(b => { b.classList.toggle('on', b.dataset.sheet === sheetOpen); b.setAttribute('aria-expanded', String(b.dataset.sheet === sheetOpen)); });
    if (cv) cv.style.cursor = placing ? 'crosshair' : '';
  }
  // Run task needs two different points; until then the longest route keeps running
  function syncRun() { const a = $('#taskFrom'), b = $('#taskTo'), r = $('#taskRun'); if (!a || !b || !r) return; r.disabled = !(a.value && b.value && a.value !== b.value); r.title = r.disabled ? 'Choose where the AMR starts and where it ends. Without a choice it runs the longest route.' : ''; }
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const toCanvas = e => { const r = cv.getBoundingClientRect(), s = Math.min(r.width / W, r.height / H); return { x: (e.clientX - r.left - (r.width - W * s) / 2) / s, y: (e.clientY - r.top - (r.height - H * s) / 2) / s }; };
  function hitAt(p) {
    for (const h of hits) { if (h.w !== undefined ? (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) : Math.hypot(p.x - h.cx, p.y - h.cy) <= h.r) return { i: h.i, timeline: h.timeline, px: h.w !== undefined ? h.x - 10 : h.cx, py: h.w !== undefined ? h.y : h.cy }; }
    return null;
  }

  /* ---------- the shift settings: written into the proposal (S.sim), so they are saved with it ---------- */
  function setSim(k, v) { S.sim = Object.assign({}, S.sim || {}); if (v === undefined) delete S.sim[k]; else S.sim[k] = v; rebuildOps(); ui(); if (sheetOpen === 'results') renderSheet(); if (root.WFCApp) root.WFCApp.changed(); }
  // a point on the picture -> metres on the floor -> a fraction of the layout
  function worldAtCam(c, p) {
    const X = (p.x - c.ox) / c.sc, Y = (p.y - c.oy) / c.sc; if (!c.iso) return { x: X, y: Y };
    const K = C30 * Math.SQRT2, u = X / K, v = Y / (K * Math.sin(c.elev)), sA = Math.sin(c.az), cA = Math.cos(c.az); return { x: u * sA + v * cA, y: -u * cA + v * sA };
  }
  function worldAt(p) { return worldAtCam(camera(), p); }
  const toPlan = w => ({ x: +(w.x / model.k).toFixed(4), y: +(w.y * model.aspect / model.k).toFixed(4) });
  function snapToRoute(w) {
    let best = null;
    ((mode === 'shift' && opsModel) || model).routes.forEach(R => { for (let i = 0; i < R.P.length - 1; i++) { const a = R.P[i], b = R.P[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, ((w.x - a.x) * dx + (w.y - a.y) * dy) / L2)) : 0, x = a.x + dx * u, y = a.y + dy * u, d = Math.hypot(w.x - x, w.y - y); if (!best || d < best.d) best = { x, y, d }; } });
    return best && best.d < 6 ? { x: best.x, y: best.y } : w;
  }
  const obsList = () => (S.sim && S.sim.obstacles) || [];
  function obstacleAt(p) { let hit = null; cam = camera(); obsList().forEach(o => { const w = planToWorld(o), g = toScreen(w[0], w[1], 0); if (Math.hypot(p.x - g[0], p.y - (g[1] - 18)) < 42) hit = o; }); return hit; }
  function addObstacle(p) {
    const pl = toPlan(snapToRoute(worldAt(p))), id = 'o' + Date.now().toString(36);
    if (t > 0.5) obsSince[id] = t;   // put down part way through: it is there from now on
    placing = false; selObs = id; setSim('obstacles', obsList().concat([{ id, x: pl.x, y: pl.y }])); note('Obstacle added. Drag it to move it.');
  }
  function removeObstacle(id) { delete obsSince[id]; selObs = null; setSim('obstacles', obsList().filter(o => o.id !== id)); }

  /* ---------- the Settings and Results panels ---------- */
  const SRC = { fact: 'Fact', proposal: 'Proposal', product: 'Product data', assumption: 'Assumption' };
  const GROUPS = [['lines', 'Production lines'], ['battery', 'Battery'], ['charging', 'Charging rules'], ['energy', 'Electricity'], ['doors', 'Doors'], ['obstacles', 'Obstacles']];
  const srcTag = k => `<em class="src ${k}">${SRC[k]}</em>`;
  function fieldRow(f, cfg, ph) {
    const v = cfg[f.k], input = f.type === 'bool'
      ? `<label class="tgl"><input type="checkbox" data-k="${f.k}" ${v !== false ? 'checked' : ''}><span class="track" aria-hidden="true"></span><span class="sr">${esc(f.l)}</span></label>`
      : `<div class="inp"><input type="number" inputmode="decimal" step="${f.step || 1}" min="0" data-k="${f.k}" value="${v === '' || v == null ? '' : esc(v)}"${ph ? ` placeholder="${esc(ph)}"` : ''} aria-label="${esc(f.l)}"><span class="u">${esc(f.u || '')}</span></div>`;
    return `<div class="frow"><div class="fl"><span>${esc(f.l)}</span> ${srcTag(f.src)}${f.note ? `<small>${esc(f.note)}</small>` : ''}</div>${input}</div>`;
  }
  const sel = (k, v, opts, label) => `<select data-k="${k}" aria-label="${esc(label)}">${opts.map(([val, lab]) => `<option value="${val}"${String(v) === val ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
  function settingsHtml() {
    if (!ops) return '<p class="snote">Draw the routes on the Site layout first.</p>';
    const cfg = OPS.settings(S, D), inp = ops.inputs, bat = inp.bat, M = D && D.model;
    const batPh = bat.from === 'product' ? `${bat.kwh} from the AMR data (${bat.text})` : 'not known: type it in';
    let h = `<div class="snote hi"><b>Simulated estimate based on the settings shown.</b> ${srcTag('fact')} comes from WFC, ${srcTag('product')} from the AMR's data, ${srcTag('proposal')} from this proposal, and ${srcTag('assumption')} is our estimate: change it to match the site.</div>`;
    h += `<h4>From the proposal ${srcTag('proposal')}</h4><ul class="plist"><li>Lines run <b>${inp.sc.shifts} × ${inp.sc.hps} h</b> a day (Operation and pallet)</li><li>Speed <b>${fmt(S.route.speedMps, 2)} m/s</b>, longest route <b>${fmt(S.route.distanceM)} m</b> (Site and route)</li><li>Pallet <b>${inp.kg > 0 ? fmt(inp.kg) + ' kg' : 'weight not given'}</b>${inp.pay > 0 ? ` of ${fmt(inp.pay)} kg payload: ${fmt(inp.loadFrac * 100)}% load` : ''}</li><li>${inp.doors.length} ${inp.doors.length === 1 ? 'door' : 'doors'} drawn on the layout${inp.charger ? ', a charger' : ''}</li></ul>`;
    if (!inp.charger) h += `<p class="snote">No charger is drawn on the layout, so it is taken to be next to the drop-off ${srcTag('assumption')}.</p>`;
    h += `<h4>How it works</h4><div class="frow"><div class="fl"><span>Which pallet next</span></div>${sel('dispatch', cfg.dispatch, [['fifo', 'First come, first served'], ['nearest', 'Nearest line first']], 'Which pallet next')}</div>`;
    h += `<div class="frow"><div class="fl"><span>At an obstacle</span> ${srcTag('assumption')}</div>${sel('obstacleMode', cfg.obstacleMode, [['wait', 'Stop and wait until clear'], ['reroute', 'Go round it']], 'At an obstacle')}</div>`;
    h += `<div class="frow"><div class="fl"><span>The lines start</span> ${srcTag('assumption')}</div>${sel('start', cfg.start, [['staggered', 'Staggered'], ['together', 'All together']], 'The lines start')}</div>`;
    h += `<div class="frow"><div class="fl"><span>Pallet timing</span> ${srcTag('assumption')}</div>${sel('timing', cfg.timing, [['varied', 'Random (like a real line)'], ['regular', 'Exactly on time']], 'Pallet timing')}</div>`;
    h += `<h4>Lines ${srcTag('fact')}</h4><p class="snote">Every pick-up point on the layout is a line${ops.lines.some(L => L.auto) ? '; points marked auto have no route drawn, so the tool found the shortest way along the drawn walkways' : ''}${S.scenario && +S.scenario.stations && +S.scenario.stations !== ops.lines.length ? `. The proposal says ${+S.scenario.stations} stations and the layout has ${ops.lines.length} pick-up points: add the missing points in Edit layout` : ''}. Distances are measured on the layout, scaled so the longest drawn route is ${fmt(S.route.distanceM)} m. Metres: one way from the line to the drop-off. Minutes: a finished pallet every so often. Type a value to change one line.</p><div class="ltable" role="table"><div class="lrow lhead" role="row"><span>Line</span><span>Metres</span><span>Minutes</span><span>On</span></div>`;
    ops.lines.forEach(L => { const c = cfg.lines[L.id] || {}; h += `<div class="lrow" role="row"><span><b class="ltag">${esc(L.tag)}</b>${esc(L.name)}${L.auto ? ' <em class="src product" title="No route is drawn to this point: the tool found the shortest way along the drawn walkways">auto</em>' : ''}</span><input type="number" inputmode="decimal" step="0.1" min="1" data-line="${esc(L.id)}" data-lk="distanceM" value="${c.distanceM ? esc(c.distanceM) : ''}" placeholder="${fmt(L.geoM, 1)}" aria-label="${esc(L.name)} distance in metres"><input type="number" inputmode="decimal" step="1" min="1" data-line="${esc(L.id)}" data-lk="interval" value="${c.interval ? esc(c.interval) : ''}" placeholder="${fmt(cfg.intervalMin)}" aria-label="${esc(L.name)} minutes between pallets"><label class="tgl"><input type="checkbox" data-line="${esc(L.id)}" data-lk="on" ${c.on === false ? '' : 'checked'}><span class="track" aria-hidden="true"></span><span class="sr">${esc(L.name)} on</span></label></div>`; });
    h += '</div>';
    GROUPS.forEach(([g, title]) => { const fs = OPS.FIELDS.filter(f => f.g === g); if (!fs.length) return; h += `<h4>${title}</h4>` + fs.map(f => fieldRow(f, cfg, f.k === 'batteryKwh' ? batPh : '')).join(''); });
    if (!bat.kwh) h += '<p class="snote alert">The battery capacity is not known for this AMR, so energy and cost are not shown. Type it in above.</p>';
    h += `<div class="sfoot"><button type="button" class="btn ghost" data-reset>Back to the defaults</button><span class="snote">AMR: ${esc(M ? M.name : '')}</span></div>`;
    return h;
  }
  // a small chart over time, sampled into 240 intervals: the queue as its average length in each interval (an area), the battery as a line
  function chartSvg(pts, end, step, yMax, yFmt, color, label) {
    const Wc = 440, Hc = 140, px = 34, py = 14, n = 240, xs = i => px + (Wc - px - 8) * i / n, vals = [];
    let j = 0;
    for (let i = 0; i <= n; i++) {
      const t0 = end * i / n, t1 = Math.min(end, end * (i + 1) / n);
      if (!step || t1 <= t0) { vals.push(OPS.valueAt(pts, t0, !step)); continue; }
      while (j < pts.length && pts[j][0] <= t0) j++;
      let cur = OPS.valueAt(pts, t0, false), tp = t0, acc = 0;
      for (let q = j; q < pts.length && pts[q][0] < t1; q++) { acc += cur * (pts[q][0] - tp); tp = pts[q][0]; cur = pts[q][1]; }
      vals.push((acc + cur * (t1 - tp)) / (t1 - t0));
    }
    if (step) yMax = Math.max(1, Math.ceil(Math.max(...vals)));
    const ys = v => py + (Hc - py - 24) * (1 - v / (yMax || 1)), d = vals.map((v, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).join('');
    const area = step ? `<path d="${d}L${xs(n).toFixed(1)} ${ys(0)}L${xs(0)} ${ys(0)}Z" fill="${color}" opacity=".18"/>` : '';
    const hrs = end / 3600, lab = v => hrs > 48 ? 'day ' + Math.round(v / 24) : Math.round(v) + ' h';
    return `<svg class="chart" viewBox="0 0 ${Wc} ${Hc}" role="img" aria-label="${esc(label)}"><line x1="${px}" x2="${Wc - 8}" y1="${ys(0)}" y2="${ys(0)}" stroke="#D5DEF0"/><line x1="${px}" x2="${Wc - 8}" y1="${ys(yMax)}" y2="${ys(yMax)}" stroke="#EDF1F7"/><text x="${px - 6}" y="${ys(yMax) + 4}" text-anchor="end">${yFmt(yMax)}</text><text x="${px - 6}" y="${ys(0) + 4}" text-anchor="end">${yFmt(0)}</text>${area}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/><text x="${px}" y="${Hc - 4}">0 h</text><text x="${(px + Wc - 8) / 2}" y="${Hc - 4}" text-anchor="middle">${lab(hrs / 2)}</text><text x="${Wc - 8}" y="${Hc - 4}" text-anchor="end">${lab(hrs)}</text></svg>`;
  }
  function resultsHtml() {
    const R = opsAll; if (!R) return '<p class="snote">Draw the routes on the Site layout first.</p>';
    const st = R.stats, cfg = R.cfg, n = st.amrs, on = R.lines.filter(L => L.on).length, dist = unit === 'm' ? fmt(st.distKm * 1000) + ' m' : unit === 'mi' ? fmt(st.distKm * 0.621371, 1) + ' mi' : fmt(st.distKm, 1) + ' km';
    const behind = st.made - st.moved, ok = st.waitingAtEnd <= Math.max(2, on) && st.maxQueue <= 2 * on;
    const kc = (l, v, sub) => `<div class="kc"><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const pc = st.pct, bar = [['work', pc.working, 'Working'], ['wait', pc.waiting, 'Waiting at doors and obstacles'], ['charge', pc.charging, cfg.charge === 'swap' ? 'Battery swaps' : 'Charging'], ['idle', pc.idle, 'Idle']];
    let h = `<div class="snote hi"><b>Simulated estimate based on the settings shown.</b> ${esc(R.scenarioLabel)} · ${n} AMR${n > 1 ? 's' : ''} · ${cfg.charge === 'swap' ? 'battery swap' : 'automatic charging'} · ${on} lines.</div>`;
    h += `<div class="verdict ${ok ? 'ok' : 'warn'}">${ok ? `<b>${n === 1 ? 'One AMR keeps up.' : n + ' AMRs keep up.'}</b> ${fmt(st.moved)} of ${fmt(st.made)} pallets moved; the queue was never longer than ${st.maxQueue}.` : `<b>The queue keeps growing.</b> ${fmt(behind)} pallets were still waiting at the end and the queue reached ${st.maxQueue}. Try ${n + 1} AMRs in the bar above.`}</div>`;
    h += `<div class="kgrid">${kc('Pallets moved', `${fmt(st.moved)} <i>of ${fmt(st.made)}</i>`, `${fmt(st.ratePerH, 1)} an hour`)}${kc('Time per pallet', mm(st.avgLeadS), 'call to drop-off, average')}${kc('Wait for pickup', mm(st.avgWaitS), `longest call to drop-off ${mm(st.maxLeadS)}`)}${kc('Distance driven', dist, `${fmt(st.distLadenKm / Math.max(1e-9, st.distKm) * 100)}% carrying a pallet`)}`
      + `${kc('Battery cycles', fmt(st.cycles, 1), cfg.charge === 'swap' ? `${st.swaps} swaps · ${fmt(st.swapH * 60)} min` : `${fmt(st.chargingH, 1)} h charging · ${st.sessions} visits`)}${kc('Lowest battery', fmt(st.lowestPct) + '%', st.ranOut ? 'ran out' : 'never ran out')}`
      + `${kc('Energy used', st.usedKwh !== null ? fmt(st.usedKwh, 2) + ' kWh' : 'not known', st.gridKwh !== null ? `${fmt(st.gridKwh, 2)} kWh from the grid` : 'add the battery kWh in Settings')}${kc('Electricity cost', st.costRM !== null ? 'RM ' + fmt(st.costRM, 2) : '—', `at RM ${fmt(cfg.kwhPrice, 2)}/kWh`)}`
      + `${kc('Door delays', fmt(st.doorWaitS / 60, 1) + ' min', `${fmt(st.doorStops)} door stops`)}${kc('Obstacle delays', fmt(st.obsWaitS / 60, 1) + ' min', `${fmt(st.obsStops)} stops`)}</div>`;
    h += `<div class="seg unit" role="group" aria-label="Distance unit">${['km', 'm', 'mi'].map(u => `<button type="button" class="tab${u === unit ? ' active' : ''}" data-unit="${u}">${u}</button>`).join('')}</div>`;
    h += `<h4>Where the time goes${n > 1 ? ' (all AMRs)' : ''}</h4><div class="split">${bar.map(([c, v]) => `<i class="${c}" style="width:${(v * 100).toFixed(2)}%"></i>`).join('')}</div><ul class="legend2">${bar.map(([c, v, l]) => `<li><i class="${c}"></i>${l}<b>${fmt(v * 100)}%</b></li>`).join('')}</ul>`;
    const qMax = Math.max(1, st.maxQueue);
    h += `<h4>Pickup queue over time</h4><p class="snote">Average pallets waiting in each part of the run; the longest queue was ${st.maxQueue}.</p>${chartSvg(R.series.queue.slice().sort((a, b) => a[0] - b[0]), R.Hend, true, qMax, v => String(Math.round(v)), '#E3A21A', 'Pickup queue over time')}`;
    h += `<h4>Battery over time${n > 1 ? ' (AMR 1)' : ''}</h4>${chartSvg(R.series.battery[0], R.Hend, false, 1, v => Math.round(v * 100) + '%', '#1E8A55', 'Battery over time')}`;
    h += `<h4>Assumptions used</h4><ul class="plist">${OPS.FIELDS.filter(f => f.src === 'assumption').map(f => `<li>${esc(f.l)}: <b>${f.type === 'bool' ? (cfg[f.k] !== false ? 'yes' : 'no') : esc(cfg[f.k]) + ' ' + esc(f.u || '')}</b></li>`).join('')}<li>Battery: <b>${R.inputs.bat.kwh ? fmt(R.inputs.bat.kwh, 2) + ' kWh' : 'not known'}</b> (${R.inputs.bat.from === 'product' ? 'AMR data' : R.inputs.bat.from === 'settings' ? 'typed in' : 'missing'}); waiting and idle use the no-load rate; charging is linear</li></ul>`;
    h += `<label class="incl"><input type="checkbox" data-slide ${S.slides && S.slides.off && S.slides.off.simresults ? '' : 'checked'}> Show these results in the proposal PDF (slide "Simulation results")</label>`;
    return h;
  }
  function renderSheet() {
    const sh = $('#simSheet'); if (!sh) return; sh.hidden = !sheetOpen; if (!sheetOpen) return;
    $('#sheetTitle').textContent = sheetOpen === 'results' ? 'Results' : 'Settings and assumptions';
    const body = $('#sheetBody'), keep = body.scrollTop; body.innerHTML = sheetOpen === 'results' ? resultsHtml() : settingsHtml(); body.scrollTop = keep;
  }
  function openSheet(which) { sheetOpen = sheetOpen === which ? '' : which; renderSheet(); ui(); }
  function onSheetChange(e) {
    const el = e.target, cfg = OPS.settings(S, D);
    if (el.dataset.slide !== undefined) { S.slides.off.simresults = !el.checked; if (root.WFCApp) root.WFCApp.changed(); return; }
    if (el.dataset.line) {
      const lines = Object.assign({}, cfg.lines), c = Object.assign({}, lines[el.dataset.line] || {}), k = el.dataset.lk;
      if (k === 'on') c.on = el.checked; else { const v = parseFloat(el.value); if (v > 0) c[k] = v; else delete c[k]; }
      lines[el.dataset.line] = c; setSim('lines', lines); return;
    }
    const k = el.dataset.k; if (!k) return;
    if (el.type === 'checkbox') setSim(k, el.checked);
    else if (el.tagName === 'SELECT') setSim(k, el.value);
    else { const v = parseFloat(el.value); setSim(k, el.value === '' ? (k === 'batteryKwh' ? '' : undefined) : Number.isFinite(v) ? Math.max(0, v) : undefined); }
  }
  function init() {
    if (inited) return; inited = true;
    cv = $('#simCv'); ctx = cv.getContext('2d'); speedF = speedOf[mode];
    applyLayout(); if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (dash) fitView(); }); ro.observe($('.dview')); }
    $('#pLines').addEventListener('click', e => { const r = e.target.closest('[data-li]'); if (r) focusLine(+r.dataset.li); });
    $('#pAmr').addEventListener('click', focusAmr);
    const tlEl = $('#simTl'); let tlDrag = false, tlId = -1;
    const seekTl = e => { if (!ops) return; const r = tlEl.getBoundingClientRect(); t = clampV((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * ops.Hend; };
    tlEl.addEventListener('pointerdown', e => { if (recState) return; tlDrag = true; tlId = e.pointerId; try { tlEl.setPointerCapture(e.pointerId); } catch (err) { /* gone */ } seekTl(e); });
    tlEl.addEventListener('pointermove', e => { if (tlDrag && e.pointerId === tlId) seekTl(e); });
    ['pointerup', 'pointercancel'].forEach(ev => tlEl.addEventListener(ev, () => { tlDrag = false; }));
    $('#simPlay').addEventListener('click', () => { if (recState) return; if (!playing && ((task && model.endT <= t) || (mode === 'shift' && ops && t >= ops.Hend - 0.5))) fresh(); else playing = !playing; ui(); });
    $('#simRestart').addEventListener('click', () => { if (recState) return; fresh(); ui(); });
    $('#simSpeed').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !recState) { speedF = +b.dataset.v; speedOf[mode] = speedF; ui(); } });
    $('#simView').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !recState) { view = b.dataset.v; ui(); } });
    $('#simSave').addEventListener('click', startRecording);
    $('#taskRun').addEventListener('click', () => { if (!recState) runTask($('#taskFrom').value, $('#taskTo').value, true); });
    $('#taskDefault').addEventListener('click', () => { if (!recState) defaultRun(); });
    $('#taskSwap').addEventListener('click', () => { const a = $('#taskFrom'), b = $('#taskTo'), v = a.value; a.value = b.value; b.value = v; syncRun(); });
    $('#taskFrom').addEventListener('change', syncRun); $('#taskTo').addEventListener('change', syncRun);
    // the shift controls
    $('#simMode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b || recState || b.dataset.m === mode) return; speedOf[mode] = speedF; mode = b.dataset.m; speedF = speedOf[mode]; placing = false; selObs = null; statKey = ''; t = 0; playing = true; applyLayout(); if (mode === 'trip') { task = null; fresh(); } else { obsSince = {}; rebuildOps(true); } ui(); });
    $('#simScen').addEventListener('change', e => { setSim('scenario', e.target.value); t = 0; });
    $('#simHours').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) { setSim('customH', Math.min(v, 8760)); t = 0; } });
    $('#simAmrs').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; const n = Math.max(1, Math.min(10, OPS.settings(S, D).amrs + +b.dataset.d)); setSim('amrs', n); });
    $('#simCharge').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setSim('charge', b.dataset.v); });
    $('#obsAdd').addEventListener('click', () => { placing = !placing; selObs = null; ui(); });
    $('#obsDel').addEventListener('click', () => { if (selObs) removeObstacle(selObs); ui(); });
    document.querySelectorAll('#sim [data-sheet]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.sheet)));
    $('#sheetClose').addEventListener('click', () => openSheet(''));
    const sh = $('#simSheet');
    sh.addEventListener('change', onSheetChange);
    sh.addEventListener('click', e => {
      const u = e.target.closest('[data-unit]'); if (u) { unit = u.dataset.unit; renderSheet(); return; }
      if (e.target.closest('[data-reset]')) { S.sim = { obstacles: obsList(), scenario: OPS.settings(S, D).scenario }; if (root.WFCApp) root.WFCApp.changed(); setTimeout(renderSheet, 60); }
    });
    // the picture: click a station (one trip), seek on the timeline, put down, pick, drag or remove obstacles (shift)
    let down = null;
    cv.addEventListener('pointerdown', e => { if (mode !== 'shift' || recState || placing) return; const p = toCanvas(e), o = obstacleAt(p); if (o) { down = { id: o.id, x0: p.x, y0: p.y, moved: false }; cv.setPointerCapture(e.pointerId); e.preventDefault(); } });
    cv.addEventListener('pointermove', e => {
      if (recState) return; const p = toCanvas(e);
      if (down) { if (Math.hypot(p.x - down.x0, p.y - down.y0) > 6) down.moved = true; if (down.moved) { const pl = toPlan(snapToRoute(worldAt(p))); dragObs = { id: down.id, x: pl.x, y: pl.y }; } return; }
      if (mode === 'shift') { const h = hitAt(p); cv.style.cursor = placing ? 'crosshair' : obstacleAt(p) ? 'grab' : (h && h.timeline) || pickAt(p) || cardHits.some(r => inRect(p, r)) ? 'pointer' : ''; return; }
      hover = hitAt(p); cv.style.cursor = hover ? 'pointer' : 'default';
    });
    cv.addEventListener('pointerup', () => {
      if (!down) return; const d = down; down = null;
      if (d.moved && dragObs) { const id = d.id, pl = dragObs; dragObs = null; if (t > 0.5) obsSince[id] = t; setSim('obstacles', obsList().map(o => o.id === id ? Object.assign({}, o, { x: pl.x, y: pl.y }) : o)); }
      else { selObs = d.id; dragObs = null; ui(); }
      cv.dataset.dragged = d.moved ? '1' : '';
    });
    // the camera: drag to turn and tilt (one finger sideways on a phone), right-drag or Shift-drag to move, scroll to zoom toward the pointer; click the AMR, a door or a
    // pallet to fly in on it; "360° view" turns the whole layout; "Reset view" (or R, or Esc) goes back to the overview
    const inMap = p => dash || (p.x < 1430 && p.y > 130 && p.y < 960);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      if (recState || placing || down || !inMap(toCanvas(e))) return;
      const mv = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
      if (!mv && (e.button !== 0 || view !== '3d')) return;
      const c0 = camera();
      orb = { id: e.pointerId, x: e.clientX, y: e.clientY, az0: az, el0: elev, moved: false, touch: e.pointerType === 'touch', pan: mv, c0, w0: worldAtCam(c0, toCanvas(e)), p0: { x: pan.x, y: pan.y } };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* the pointer is already gone */ }
    });
    cv.addEventListener('pointermove', e => {
      if (!orb || e.pointerId !== orb.id) return;
      const dx = e.clientX - orb.x, dy = e.clientY - orb.y; if (!orb.moved && Math.hypot(dx, dy) < 5) return;
      if (!orb.moved) { orb.moved = true; if (spin) { spin = false; gl.az = az; } if (orb.pan) follow = null; }
      if (orb.pan) { const w = worldAtCam(orb.c0, toCanvas(e)), k = model.k, hh = k / model.aspect; pan.x = gl.px = clampV(orb.p0.x - (w.x - orb.w0.x), -k / 2, k / 2); pan.y = gl.py = clampV(orb.p0.y - (w.y - orb.w0.y), -hh / 2, hh / 2); }
      else { const kk = W / Math.max(1, cv.getBoundingClientRect().width); az = gl.az = orb.az0 + dx * kk * 0.0042; if (!orb.touch || presenting) elev = gl.elev = clampV(orb.el0 + dy * kk * 0.0035, ELEV_MIN, ELEV_MAX); }
      cv.style.cursor = 'grabbing'; viewUi();
    });
    const endOrbit = e => { if (!orb || (e && e.pointerId !== orb.id)) return; if (orb.moved) cv.dataset.orbited = '1'; orb = null; cv.style.cursor = ''; };
    cv.addEventListener('pointerup', endOrbit); cv.addEventListener('pointercancel', endOrbit);
    cv.addEventListener('wheel', e => {   // scroll up to zoom in, down to zoom out, toward the pointer (the point under it stays put)
      if (recState || !model || !model.ok || !inMap(toCanvas(e))) return; e.preventDefault();
      const nz = clampV(gl.zoom * Math.exp(-e.deltaY * 0.0014), 0.6, 8), fz = nz / gl.zoom;
      if (follow === null && fz !== 1) { const w = worldAtCam(buildCam(gl), toCanvas(e)), k = model.k, hh = k / model.aspect; gl.px = clampV(gl.px + (w.x - (k / 2 + gl.px)) * (1 - 1 / fz), -k / 2, k / 2); gl.py = clampV(gl.py + (w.y - (hh / 2 + gl.py)) * (1 - 1 / fz), -hh / 2, hh / 2); }
      gl.zoom = nz; viewUi();
    }, { passive: false });
    $('#simReset').addEventListener('click', resetView); $('#simSpin').addEventListener('click', toggleSpin);
    cv.addEventListener('mouseleave', () => { hover = null; });
    cv.addEventListener('click', e => {
      if (cv.dataset.orbited) { cv.dataset.orbited = ''; return; }   // that was a drag to turn the view, not a click
      const p = toCanvas(e);
      if (mode === 'shift') {
        if (cv.dataset.dragged) { cv.dataset.dragged = ''; return; }
        if (cardHits.some(r => inRect(p, r))) { resetView(); return; }
        if (!placing) { const pk = pickAt(p); if (pk) { focusOn(pk); return; } }
        if (placing) { addObstacle(p); ui(); return; }
        const h = hitAt(p); if (h && h.timeline && ops) { t = Math.max(0, Math.min(ops.Hend, (p.x - MAP.x) / MAP.w * ops.Hend)); return; }
        if (!obstacleAt(p) && selObs) { selObs = null; ui(); }
        return;
      }
      const h = hitAt(p); if (h && h.i !== undefined) callStation(h.i);
    });
    $('#simFull').addEventListener('click', () => present(!presenting));
    cv.addEventListener('dblclick', e => { if (mode === 'shift' && (obstacleAt(toCanvas(e)) || pickAt(toCanvas(e)) || cardHits.some(r => inRect(toCanvas(e), r)))) return; present(!presenting); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presenting) present(false); });   // Esc in real full screen
    ['mousemove', 'pointerdown'].forEach(ev => simEl().addEventListener(ev, wake, { passive: true }));
    const HINT = 'Click the AMR, a door or a pallet to zoom in · drag to turn · right-drag to move · scroll to zoom'; setNote(HINT); setTimeout(() => { const n = $('#simNote'); if (n && n.textContent === HINT) setNote(''); }, 9000);
    last = performance.now(); raf = requestAnimationFrame(loop);
  }
  // called by the app whenever the proposal changes while the tab is open (and when the tab opens)
  function update(state, derived) {
    S = state; D = derived; init(); loadImage();
    if (!S.layoutPlan) S.layoutPlan = { zones: [], points: [], routes: [] };
    rebuild(); rebuildOps(); ui(); if (sheetOpen === 'results') renderSheet();
  }
  root.WFCSimUI = {
    update, frame: tt => { if (model && model.ok) frame(tt); },
    tick: (dt, n) => { for (let i = 0; i < (n || 1); i++) { if (playing && model && model.ok) t += dt * speedF; if (model && model.ok) { stepCam(dt); frame(t); } } },   // advance by hand (for tests and recordings)
    camera: () => ({ az, elev, zoom, pan: { x: pan.x, y: pan.y }, spin, follow, picked }),
    picks: () => { const c = camera(); return picks.map(h => ({ kind: h.kind, id: h.id, at: c.P(h.wx, h.wy, h.wz).map(Math.round) })); },
    set: o => { if (o.t !== undefined) t = o.t; if (o.playing !== undefined) playing = o.playing; if (o.view) view = o.view; if (o.speed) speedF = o.speed; if (o.clock !== undefined) clockOverride = o.clock; ui(); },
    // the order the stations are served in, by station number (for a video); starts the timeline again
    setOrder: nums => { if (!model || !model.ok) return false; const idx = nums.map(n => rows.findIndex(r => String(r.num) === String(n))).filter(i => i >= 0); if (!idx.length) return false; task = null; fresh(); model.order = idx; model.nextIx = 0; return true; },
    present: on => present(on !== false), presenting: () => presenting,
    runTask, defaultRun, taskPoints: () => taskPts.map(p => ({ id: p.id, name: p.name, text: p.text, group: p.group })),
    call: i => callStation(i), model: () => model, rows: () => rows, now: () => t, task: () => task, ready: () => !!(model && model.ok && (!imgSrc || img)),
    image: (type, q) => cv.toDataURL(type || 'image/png', q)
  };
})(window);
