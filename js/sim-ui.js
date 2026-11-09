/* WFC Proposal Builder: the Simulation tab. Draws the site layout as a tilted 3D model (or a flat plan) and drives a mini 3D model of the PROPOSED AMR (the
   1.5T pallet-jack AMR: white body, black base and forks, lidar mast, lifting a wooden pallet) at the stated speed, with live readings: speed (it really speeds
   up, slows for corners and creeps in to dock), distance, seconds, pallets moved, rate, battery. The default simulation is the LONGEST route, trip after trip.
   Pick any two points and press "Run task": the AMR drives to the first, picks up, carries to the second and puts down, with the leg-by-leg times.
   Click a station and the AMR is sent there next. "Save video" records the picture to a video file. All drawing is on one canvas, 1920 x 1080. */
(function (root) {
  'use strict';
  const Sim = root.WFCSim, esc = root.WFCSlides.esc;
  const W = 1920, H = 1080, C30 = Math.cos(Math.PI / 6), S30 = 0.5, VIZ = 5;                                    // VIZ: the AMR is drawn this much bigger than life, so it can be seen
  const FONT = '"DM Sans", Arial, sans-serif', INK = '#0B1220', BLUE = '#2F5BD0', SLATE = '#3A4766', MUTE = '#5B6577', LIGHT = '#8FB0F5', AMBER = '#E3A21A', GREEN = '#1E8A55';
  const MAP = { x: 70, y: 160, w: 1330, h: 730 }, HX = 1440, HW = 420;
  const $ = s => document.querySelector(s);
  let cv, ctx, S, D, model, img = null, imgSrc = '', t = 0, playing = true, speedF = 8, view = '3d', last = 0, raf = 0, recState = null, cam = null, inited = false;
  let hover = null, toast = null, hits = [], clockOverride = null, rows = [], dots = [], vz = VIZ;   // vz: how much bigger than life the AMR is drawn (the close-up draws it life size)
  let task = null, taskPts = [];                                                                     // task: the point-to-point run on screen (null = the longest route, trip after trip)
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
  const KIND = { out: LIGHT, load: SLATE, pivot: AMBER, drive: BLUE, unload: SLATE };
  const toScreen = (x, y, z) => cam.P(x, y, z || 0);
  const planToWorld = p => [p.x * model.k, p.y / model.aspect * model.k];

  /* ---------- the camera: fit the whole layout into the picture ---------- */
  function camera() {
    const k = model.k, asp = model.aspect, iso = view === '3d', box = MAP;
    const pr = (x, y, z) => iso ? [(x - y) * C30, (x + y) * S30 - (z || 0)] : [x, y];
    const cs = [pr(0, 0, 0), pr(k, 0, 0), pr(k, k / asp, 0), pr(0, k / asp, 0), pr(0, 0, 6)];
    const bx0 = Math.min(...cs.map(c => c[0])), bx1 = Math.max(...cs.map(c => c[0])), by0 = Math.min(...cs.map(c => c[1])), by1 = Math.max(...cs.map(c => c[1]));
    const sc = Math.min(box.w / (bx1 - bx0), box.h / (by1 - by0)), ox = box.x + (box.w - (bx1 - bx0) * sc) / 2 - bx0 * sc, oy = box.y + (box.h - (by1 - by0) * sc) / 2 - by0 * sc;
    return { iso, sc, ox, oy, P: (x, y, z) => { const q = pr(x, y, z); return [ox + q[0] * sc, oy + q[1] * sc]; } };
  }

  /* ---------- the world (drawn once, then copied each frame) ---------- */
  function drawGround() {
    const k = model.k, asp = model.aspect, w = k, h = k / asp, P = cam.P;
    const c = [P(0, 0, 0), P(w, 0, 0), P(w, h, 0), P(0, h, 0)], th = 16;
    ctx.save(); ctx.fillStyle = '#C8D2E6';
    if (cam.iso) {
      ctx.beginPath(); ctx.moveTo(c[3][0], c[3][1]); ctx.lineTo(c[2][0], c[2][1]); ctx.lineTo(c[2][0], c[2][1] + th); ctx.lineTo(c[3][0], c[3][1] + th); ctx.fill();
      ctx.fillStyle = '#B2BFD8'; ctx.beginPath(); ctx.moveTo(c[2][0], c[2][1]); ctx.lineTo(c[1][0], c[1][1]); ctx.lineTo(c[1][0], c[1][1] + th); ctx.lineTo(c[2][0], c[2][1] + th); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.beginPath(); c.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#F2F5FB'; ctx.fillRect(0, 0, W, H);
    if (img && img.complete && img.naturalWidth) {
      const s = k / img.naturalWidth, a = cam.iso ? s * C30 * cam.sc : s * cam.sc, b = cam.iso ? s * S30 * cam.sc : 0;
      ctx.setTransform(a, b, cam.iso ? -a : 0, cam.iso ? b : a, c[0][0], c[0][1]); ctx.drawImage(img, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
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
  function drawRoutesBase() {
    model.routes.forEach((R, i) => { const all = partPath(R.P, R.cum, 0, R.distanceM), far = i === model.far; stroke(all, far ? 13 : 11, 'rgba(255,255,255,.85)'); stroke(all, far ? 5 : 4, far ? 'rgba(227,162,26,.9)' : 'rgba(47,91,208,.4)', [2, 11]); });
  }
  function drawStations() {
    const P = cam.P;
    ((S.layoutPlan || {}).points || []).forEach(p => {
      const w = planToWorld(p), [x, y] = P(w[0], w[1], 0);
      if (p.kind === 'spot') { ctx.save(); ctx.fillStyle = SLATE; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; rr(ctx, x - 11, y - (cam.iso ? 7 : 11), 22, cam.iso ? 14 : 22, 4); ctx.fill(); ctx.stroke(); ctx.restore(); if (p.label) txt(String(p.label).slice(0, 2), x, y + (cam.iso ? 4 : 5), 12, 700, '#fff', 'center'); }
      else if (p.kind === 'door') { ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 9, cam.iso ? 6 : 9, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
    });
    rows.forEach((r, i) => {   // pick-up stations: numbered dots; the farthest has an amber ring
      const R = model.routes[i], [x, y] = P(R.P[0].x, R.P[0].y, 0), far = i === model.far;
      ctx.save(); if (far) { ctx.strokeStyle = AMBER; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, 19, cam.iso ? 12 : 19, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = BLUE; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 14, cam.iso ? 9.5 : 14, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      txt(String(r.num), x, y + (cam.iso ? 4.5 : 5.5), 14, 700, '#fff', 'center');
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
      if (cam.iso && n[0] + n[1] <= 0.05) continue;
      faces.push({ a, b, n, depth: (a[0] + a[1] + b[0] + b[1]) / 2 });
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
    if (!closeup) {
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
    parts.forEach(q => { q.key = cam.iso ? q.cx + q.cy + 0.0004 * (q.z0 + q.z1) : (q.z0 + q.z1); });
    parts.sort((a, b) => a.key - b.key).forEach(q => box(q.cx, q.cy, q.hd, q.L, q.Wd, q.z0, q.z1, q.tone));
  }
  function drawAmr(s) {
    const a0 = wall() * 3.2, g0 = toScreen(s.x, s.y, 0), R0 = 9;   // the floor under it: a slow lidar sweep and a soft ring
    ctx.save(); ctx.beginPath(); ctx.moveTo(g0[0], g0[1]);
    for (let i = 0; i <= 14; i++) { const a = a0 + i * 0.05, q = toScreen(s.x + Math.cos(a) * R0, s.y + Math.sin(a) * R0, 0); ctx.lineTo(q[0], q[1]); }
    ctx.closePath(); const gr = ctx.createRadialGradient(g0[0], g0[1], 0, g0[0], g0[1], 90); gr.addColorStop(0, 'rgba(47,91,208,.34)'); gr.addColorStop(1, 'rgba(47,91,208,.04)'); ctx.fillStyle = gr; ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = 'rgba(47,91,208,.08)'; ctx.strokeStyle = 'rgba(47,91,208,.4)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(g0[0], g0[1], 62, cam.iso ? 37 : 62, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    const c = Math.cos(s.heading), sn = Math.sin(s.heading);   // a soft shadow
    [[0.6, .06], [0.3, .08], [0, .1]].forEach(([grow, al]) => { const L = 1.2 * VIZ + grow, Wd = 0.42 * VIZ + grow, cxw = s.x + c * 0.28 * VIZ + 0.6, cyw = s.y + sn * 0.28 * VIZ + 0.6;
      const g2 = [[-L, -Wd], [L, -Wd], [L, Wd], [-L, Wd]].map(p => toScreen(cxw + p[0] * c - p[1] * sn, cyw + p[0] * sn + p[1] * c, 0)); ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = INK; ctx.beginPath(); g2.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); ctx.restore(); });
    drawAmrScene(s, false);
    // a live tag above it
    const top = toScreen(s.x, s.y, 1.5 * VIZ), tx = Math.max(MAP.x + 130, Math.min(MAP.x + MAP.w - 130, top[0])), ty = Math.max(MAP.y + 34, top[1] - 40);
    ctx.save(); ctx.strokeStyle = 'rgba(11,18,32,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty + 24); ctx.lineTo(top[0], top[1] + 6); ctx.stroke();
    ctx.shadowColor = 'rgba(11,18,32,.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5; ctx.fillStyle = INK; rr(ctx, tx - 120, ty - 24, 240, 48, 14); ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = s.speed > 0 ? '#4ADE80' : AMBER; ctx.beginPath(); ctx.arc(tx - 98, ty, 6, 0, 7); ctx.fill(); ctx.restore();
    txt('AMR 01', tx - 82, ty + 7, 20, 700, '#fff'); txt(`${fmt(s.speed, 2)} m/s`, tx + 106, ty + 7, 19, 500, '#B9C6E8', 'right');
  }
  // a life-size close-up of the AMR in the corner of the map, turning as it turns, with what it is doing and the forks' lift as live readings
  const CU = { x: 1070, y: 160, w: 330, h: 270 };
  function drawCloseup(s) {
    const M = D && D.model, cx = CU.x + CU.w / 2 + 12, gy = CU.y + CU.h - 100, sc2 = 62, keep = cam;
    ctx.save(); rr(ctx, CU.x + 3, CU.y + 3, CU.w - 6, CU.h - 6, 24); ctx.clip();
    const bg = ctx.createLinearGradient(0, CU.y, 0, CU.y + CU.h); bg.addColorStop(0, '#F6F8FD'); bg.addColorStop(1, '#E6ECF8'); ctx.fillStyle = bg; ctx.fillRect(CU.x, CU.y, CU.w, CU.h);
    const g0 = ctx.createRadialGradient(cx, gy, 0, cx, gy, 130); g0.addColorStop(0, 'rgba(47,91,208,.22)'); g0.addColorStop(1, 'rgba(47,91,208,0)');
    ctx.save(); ctx.translate(cx, gy + 6); ctx.scale(1, 0.5); ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, 0, 130, 0, 7); ctx.fill(); ctx.restore();
    cam = { iso: true, sc: sc2, P: (x, y, z) => [cx + ((x - s.x) - (y - s.y)) * C30 * sc2, gy + ((x - s.x) + (y - s.y)) * S30 * sc2 - (z || 0) * sc2] };
    vz = 1; drawAmrScene(s, true); vz = VIZ; cam = keep;
    ctx.restore();
    const fk = `Forks ${Math.round(s.lift * (M && M.liftMm ? M.liftMm : 205))} mm`, ph = s.phase || s.label || '';   // two small labels on soft pills, so the AMR never draws over them
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.88)'; rr(ctx, CU.x + 16, CU.y + 16, 178, 30, 15); ctx.fill(); rr(ctx, CU.x + CU.w - 16 - (width(fk, 16, 600) + 24), CU.y + 16, width(fk, 16, 600) + 24, 30, 15); ctx.fill(); ctx.restore();
    fitTxt(ph, CU.x + 28, CU.y + 37, 156, 16, 700, s.speed > 0.02 || s.lift > 0.02 ? BLUE : MUTE);
    txt(fk, CU.x + CU.w - 28, CU.y + 37, 16, 600, MUTE, 'right');
    txt('PROPOSED AMR', CU.x + 26, CU.y + CU.h - 52, 15, 700, BLUE); fitTxt(M ? M.name : 'Pallet jack AMR', CU.x + 26, CU.y + CU.h - 24, CU.w - 52, 21, 700, INK);
    if (M && M.payloadKg) txt(`${fmt(M.payloadKg)} kg payload`, CU.x + CU.w - 26, CU.y + CU.h - 52, 15, 500, MUTE, 'right');
  }
  // the path being driven: the part already driven is filled in as it goes. A task's path is drawn here (it is not one of the saved routes).
  function drawProgress(s) {
    const job = s.jobRef || model.jobs[model.jobs.length - 1]; if (!job) return;
    const legs = model.segs.slice(job.s0, job.s1).filter(g => g.leg);
    legs.forEach(g => {
      const L = g.leg, all = partPath(L.P, L.cum, 0, L.total); if (task) { stroke(all, 12, 'rgba(255,255,255,.8)'); stroke(all, 4, 'rgba(47,91,208,.5)', [2, 11]); }
      const upTo = s.leg === L ? s.legS : (g.t1 <= s.t ? L.total : 0);
      if (upTo > 0.01) stroke(partPath(L.P, L.cum, 0, upTo), 8, g.kind === 'out' ? LIGHT : BLUE);
    });
    // a pulse on the pick-up it is going to
    const a = job.pick, g = toScreen(a.x, a.y, 0), ph = (wall() * 1.4) % 1;
    if (s.kind === 'out' || (s.kind === 'pivot' && s.waiting)) { ctx.save(); ctx.strokeStyle = `rgba(47,91,208,${(1 - ph) * .6})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(g[0], g[1], 18 + ph * 40, cam.iso ? (18 + ph * 40) * .6 : 18 + ph * 40, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // a trail behind it
    const pts = []; for (let i = 14; i >= 0; i--) { const q = Sim.at(model, Math.max(0, s.t - i * 0.6)); pts.push(toScreen(q.x, q.y, 0)); }
    for (let i = 1; i < pts.length; i++) { ctx.save(); ctx.globalAlpha = i / pts.length * .5; ctx.strokeStyle = s.laden ? BLUE : LIGHT; ctx.lineWidth = 10 * (i / pts.length); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); ctx.restore(); }
  }
  // the two points of a task, marked on the map
  function drawTaskEnds() {
    if (!task) return;
    [[task.from, 'FROM', BLUE], [task.to, 'TO', GREEN]].forEach(([p, lab, col]) => {
      const w = planToWorld(p), [x, y] = toScreen(w[0], w[1], 0);
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(x, y, 24, cam.iso ? 15 : 24, 0, 0, 7); ctx.stroke();
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
        txt(String(r.num), HX + 44, yy - 1, 13, 700, i === model.far || act ? '#fff' : SLATE, 'center');
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

  /* ---------- the picture ---------- */
  let stat = null, statKey = '';
  function frame(tt) {
    if (!model || !model.ok) return;
    const s = Sim.at(model, tt), key = [view, speedF, !!(img && img.complete && img.naturalWidth), rebuild.sig].join('|');
    if (!stat) { stat = document.createElement('canvas'); stat.width = W; stat.height = H; }
    if (key !== statKey) {   // the floor, the areas, the routes and the readings' frames are drawn once
      statKey = key; const main = ctx; ctx = stat.getContext('2d'); cam = camera();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#FBFCFE'); bg.addColorStop(1, '#E9EEF8'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      drawGround(); drawAreas(); drawRoutesBase(); drawStations(); drawHudStatic(); ctx = main;
      dots = rows.map((r, i) => { const R = model.routes[i], g = toScreen(R.P[0].x, R.P[0].y, 0); return { i, cx: g[0], cy: g[1], r: 24 }; });
    }
    cam = camera();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(stat, 0, 0);
    drawProgress(s); drawTaskEnds(); drawAmr(s); drawCloseup(s); drawHud(s);
    if (task && s.finished && playing && !recState) { playing = false; ui(); }   // a task ends with the AMR standing where it put the pallet down
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!cv || $('#sim').hidden) { last = now; return; }
    const dt = Math.min(recState ? 1 : 0.1, (now - last) / 1000); last = now;   // while recording, time must follow the clock even on a slow computer
    if (playing && model && model.ok) {
      t += dt * speedF;
      if (recState && t >= recState.end) { t = recState.end - 1e-3; frame(t); finishRecording(); return; }
    }
    if (model && model.ok) { frame(t); if (recState) setNote(`Recording… ${Math.max(0, Math.ceil((recState.end - t) / speedF))} s left. Keep this tab open.`); }
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
    task = null; model = buildModel(); if (!was || !model.ok) t = 0; taskPts = taskPoints();
    return true;
  }
  function loadImage() {
    const src = S.images.layout || '';
    if (src === imgSrc) return; imgSrc = src; img = null;
    if (src) { const i = new Image(); i.onload = () => { img = i; }; i.src = src; }
  }
  const note = m => { toast = { text: m, at: wall() }; };
  // a fresh start: the AMR parked at the drop-off, the longest route trip after trip (or the same task again)
  function fresh() { model = buildModel(); taskPts = taskPoints(); if (task) { const r = Sim.addTask(model, { from: task.from.id, to: task.to.id, approach: task.approach, fromName: task.from.name, toName: task.to.name }); if (!r.ok) task = null; } t = 0; playing = true; }
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
  function setNote(m) { const n = $('#simNote'); if (n) n.textContent = m || ''; }
  function startRecording() {
    if (!model || !model.ok || recState) return;
    if (!window.MediaRecorder || !cv.captureStream) { setNote('This browser cannot record video. Use Edge or Chrome.'); return; }
    const types = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'], type = types.find(x => MediaRecorder.isTypeSupported(x)) || '';
    const trips = 1, chunks = [], rec = new MediaRecorder(cv.captureStream(30), Object.assign({ videoBitsPerSecond: 9e6 }, type ? { mimeType: type } : {}));
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' }), ext = /mp4/.test(rec.mimeType) ? 'mp4' : 'webm', a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${(S.client.name || 'Client').replace(/[\\/:*?"<>|]+/g, ' ')} - AMR simulation.${ext}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setNote(`Video saved to your Downloads folder (${ext.toUpperCase()}).`); recState = null; ui();
    };
    fresh(); recState = { rec, end: task ? model.endT : Sim.jobsUntil(model, trips) + 0.01 }; ui(); frame(0); rec.start(200);
  }
  function finishRecording() { const r = recState; if (!r) return; setTimeout(() => { try { r.rec.stop(); } catch (e) { recState = null; ui(); } }, 600); playing = false; }   // hold the last frame a moment

  /* ---------- the screen ---------- */
  function ui() {
    const ok = model && model.ok;
    $('#simStage').hidden = !ok; $('#simMsg').hidden = !!ok;
    if (!ok) $('#simMsg').innerHTML = `<div class="simbox"><b>${esc((model && model.reason) || 'Nothing to show yet.')}</b><span>The simulation uses the routes, speed and cycle time of this proposal.</span></div>`;
    $('#simPlay').textContent = playing ? 'Pause' : 'Play';
    document.querySelectorAll('#simSpeed button').forEach(b => b.classList.toggle('active', +b.dataset.v === speedF));
    document.querySelectorAll('#simView button').forEach(b => b.classList.toggle('active', b.dataset.v === view));
    ['simPlay', 'simRestart', 'simSpeed', 'simView', 'taskBar'].forEach(id => { const e = $('#' + id); if (e) e.classList.toggle('lock', !!recState); });
    $('#simSave').disabled = !ok || !!recState;
    const tb = $('#taskBar'); if (tb) { tb.hidden = !ok || taskPts.length < 2; if (ok) { fillTaskBar(); $('#taskDefault').hidden = !task; syncRun(); } }
  }
  // Run task needs two different points; until then the longest route keeps running
  function syncRun() { const a = $('#taskFrom'), b = $('#taskTo'), r = $('#taskRun'); if (!a || !b || !r) return; r.disabled = !(a.value && b.value && a.value !== b.value); r.title = r.disabled ? 'Choose where the AMR starts and where it ends. Without a choice it runs the longest route.' : ''; }
  const toCanvas = e => { const r = cv.getBoundingClientRect(), s = Math.min(r.width / W, r.height / H); return { x: (e.clientX - r.left - (r.width - W * s) / 2) / s, y: (e.clientY - r.top - (r.height - H * s) / 2) / s }; };
  function hitAt(p) {
    for (const h of hits) { if (h.w !== undefined ? (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) : Math.hypot(p.x - h.cx, p.y - h.cy) <= h.r) return { i: h.i, px: h.w !== undefined ? h.x - 10 : h.cx, py: h.w !== undefined ? h.y : h.cy }; }
    return null;
  }
  function init() {
    if (inited) return; inited = true;
    cv = $('#simCv'); ctx = cv.getContext('2d');
    $('#simPlay').addEventListener('click', () => { if (recState) return; if (!playing && task && model.endT <= t) fresh(); else playing = !playing; ui(); });
    $('#simRestart').addEventListener('click', () => { if (recState) return; fresh(); ui(); });
    $('#simSpeed').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !recState) { speedF = +b.dataset.v; ui(); } });
    $('#simView').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !recState) { view = b.dataset.v; ui(); } });
    $('#simSave').addEventListener('click', startRecording);
    $('#taskRun').addEventListener('click', () => { if (!recState) runTask($('#taskFrom').value, $('#taskTo').value, true); });
    $('#taskDefault').addEventListener('click', () => { if (!recState) defaultRun(); });
    $('#taskSwap').addEventListener('click', () => { const a = $('#taskFrom'), b = $('#taskTo'), v = a.value; a.value = b.value; b.value = v; syncRun(); });
    $('#taskFrom').addEventListener('change', syncRun); $('#taskTo').addEventListener('change', syncRun);
    cv.addEventListener('mousemove', e => { if (recState) return; hover = hitAt(toCanvas(e)); cv.style.cursor = hover ? 'pointer' : 'default'; });
    cv.addEventListener('mouseleave', () => { hover = null; });
    cv.addEventListener('click', e => { const h = hitAt(toCanvas(e)); if (h) callStation(h.i); });
    last = performance.now(); raf = requestAnimationFrame(loop);
  }
  // called by the app whenever the proposal changes while the tab is open (and when the tab opens)
  function update(state, derived) {
    S = state; D = derived; init(); loadImage();
    if (!S.layoutPlan) S.layoutPlan = { zones: [], points: [], routes: [] };
    rebuild(); ui();
  }
  root.WFCSimUI = {
    update, frame: tt => { if (model && model.ok) frame(tt); },
    set: o => { if (o.t !== undefined) t = o.t; if (o.playing !== undefined) playing = o.playing; if (o.view) view = o.view; if (o.speed) speedF = o.speed; if (o.clock !== undefined) clockOverride = o.clock; ui(); },
    // the order the stations are served in, by station number (for a video); starts the timeline again
    setOrder: nums => { if (!model || !model.ok) return false; const idx = nums.map(n => rows.findIndex(r => String(r.num) === String(n))).filter(i => i >= 0); if (!idx.length) return false; task = null; fresh(); model.order = idx; model.nextIx = 0; return true; },
    runTask, defaultRun, taskPoints: () => taskPts.map(p => ({ id: p.id, name: p.name, text: p.text, group: p.group })),
    call: i => callStation(i), model: () => model, rows: () => rows, now: () => t, task: () => task, ready: () => !!(model && model.ok && (!imgSrc || img)),
    image: (type, q) => cv.toDataURL(type || 'image/png', q)
  };
})(window);
