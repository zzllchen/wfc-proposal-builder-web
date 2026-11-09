/* WFC Proposal Builder: the simulation model (no drawing, no browser). Turns the routes drawn on the site layout (one per pick-up station, each from the
   pick-up point to the drop-off), the speed and the AMR's own limits into a timeline, and answers "where is the AMR, how fast, carrying what" at any second.

   The motion is physical, not a constant speed with pauses:
   - it speeds up and brakes at a real rate (0.5 and 0.6 m/s2), never above the stated speed;
   - it slows for every corner to the speed its turning circle allows (v = sqrt(sideways acceleration x turn radius), about 0.6 m/s for a 90 degree corner);
   - it creeps the last metre into a pallet or onto a drop-off spot (0.3 m/s);
   - at the pick-up the forks go in, lift the pallet (205 mm at 40 mm/s), and the AMR turns round on the spot (50 degrees a second); at the drop-off it puts the
     pallet down and turns away. All of these take the time they really take.
   So the time of a trip comes from distance and speed, plus what the machine really does. For the proposal's own routes it lands within a few seconds of the
   stated cycle time (2 x distance / speed + the real-world buffer), which is what that buffer is for; both numbers are in the model (cycleS and simCycleS).

   One job = drive empty from the drop-off to the pick-up, load, carry back, unload. A TASK is the same between any two points (the AMR drives to the first
   point if it is not there, picks up, carries to the second, puts down).
   WFCSim.build({ routes: [{ id, label, pts, fromName, toName }], aspect, distanceM, speedMps, bufferPct, dwellS, order, net, turnM, liftMm, physics }) -> model | { ok: false, reason }
      (a route's pts run from the pick-up to the drop-off, as fractions of the picture; distanceM is the length of the longest route; order = route numbers
       in the order they are served; net = a WFCNet network for tasks)
   WFCSim.at(model, t)            -> { x, y, heading, speed, accel, phase, laden, lift, kind, label, travelled, job, jobT, jobS, jobDistanceM, done, t, ... }
   WFCSim.call(model, t, i)       -> the AMR goes to route i next (after the job it is on); the usual order carries on after it
   WFCSim.reset(model)            -> back to the start (the AMR parked at the drop-off, the usual order)
   WFCSim.addTask(model, { from, to, approach, fromName, toName }) -> { ok, job } | { ok: false, reason }      (resets first if called with reset: true) */
(function (root) {
  'use strict';
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const LABEL = { out: 'Driving to the pick-up', load: 'Loading the pallet', pivot: 'Turning on the spot', drive: 'Carrying the pallet', unload: 'Unloading the pallet', idle: 'Task complete' };
  const THERE = { load: 1, drive: 1, unload: 1 };
  // what the machine can do (m, s, rad). Adjustable by passing { physics: {...} } to build().
  const PHYS = { accel: 0.5, decel: 0.6, latAccel: 0.3, dockMps: 0.3, dockM: 1.0, minCorner: 0.35, liftMps: 0.04, settleS: 1.0, pivotDegS: 50, headingM: 1.2, ds: 0.05 };

  const plen = (pts, asp) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, (pts[i].y - pts[i - 1].y) / asp); return L; };

  /* ---------- one drive along a line: the speed at every point, from the limits ---------- */
  function makeLeg(m, P, dockEnd) {
    const ph = m.phys, vmax = m.speedMps, n = P.length, len = [], cum = [0], dirs = [];
    for (let i = 1; i < n; i++) { len.push(Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y)); cum.push(cum[i - 1] + len[i - 1]); dirs.push(Math.atan2(P[i].y - P[i - 1].y, P[i].x - P[i - 1].x)); }
    const total = cum[n - 1], N = Math.max(2, Math.ceil(total / ph.ds)), dS = total / N, corners = [];
    const lim = new Float64Array(N + 1).fill(vmax);
    for (let k = 1; k < n - 1; k++) {
      const th = Math.abs(angDiff(dirs[k - 1], dirs[k])); if (th < 0.2 || len[k - 1] <= 0 || len[k] <= 0) continue;
      const vc = th > 1.7 ? ph.minCorner : Math.max(ph.minCorner, Math.min(vmax, m.cornerMps * (1 + (Math.PI / 2 - Math.min(th, Math.PI / 2)) * 0.9)));
      corners.push({ k, S: cum[k], th, vc }); const i = Math.round(cum[k] / dS); lim[i] = Math.min(lim[i], vc);
    }
    if (dockEnd) for (let i = 0; i <= N; i++) if (total - i * dS < ph.dockM) lim[i] = Math.min(lim[i], ph.dockMps);   // the last metre into a pallet or a spot is a creep
    lim[0] = 0; lim[N] = 0;
    const v = Float64Array.from(lim);
    for (let i = 0; i < N; i++) v[i + 1] = Math.min(v[i + 1], Math.sqrt(v[i] * v[i] + 2 * ph.accel * dS));          // never faster than it can speed up to
    for (let i = N - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * ph.decel * dS));    // never faster than it can still stop for
    const T = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) { const vs = v[i] + v[i + 1]; T[i + 1] = T[i] + (vs > 1e-9 ? 2 * dS / vs : 0); }
    const leg = { P, len, cum, dirs, total, N, dS, v, T, time: T[N], corners, dockEnd: !!dockEnd };
    // where it is s seconds after the start of the drive: distance along the line, speed, acceleration
    leg.at = u => {
      if (u <= 0) return { s: 0, v: 0, a: ph.accel }; if (u >= leg.time) return { s: total, v: 0, a: -ph.decel };
      let lo = 0, hi = N; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= u) lo = mid; else hi = mid; }
      const f = (u - T[lo]) / ((T[lo + 1] - T[lo]) || 1);
      return { s: (lo + f) * dS, v: v[lo] + (v[lo + 1] - v[lo]) * f, a: (v[lo + 1] * v[lo + 1] - v[lo] * v[lo]) / (2 * dS) };
    };
    const edge = s => { let i = 0; while (i < n - 2 && s >= cum[i + 1]) i++; return i; };
    leg.pos = s => { const i = edge(s), u = len[i] ? clamp((s - cum[i]) / len[i], 0, 1) : 0; return { x: P[i].x + (P[i + 1].x - P[i].x) * u, y: P[i].y + (P[i + 1].y - P[i].y) * u }; };
    // the way it points: along the line, turning smoothly through each corner over about a metre either side
    const win = k => Math.min(ph.headingM, 0.45 * len[k - 1], 0.45 * len[k]);
    leg.head = s => {
      const i = edge(s); let h = dirs[i];
      if (i >= 1 && corners.some(c => c.k === i)) { const w = win(i), d = s - cum[i]; if (d < w) h = dirs[i - 1] + angDiff(dirs[i - 1], dirs[i]) * smooth(0.5 + d / (2 * w)); }
      if (i + 2 < n && corners.some(c => c.k === i + 1)) { const w = win(i + 1), d = cum[i + 1] - s; if (d < w) h = dirs[i] + angDiff(dirs[i], dirs[i + 1]) * smooth(0.5 - d / (2 * w)); }
      return h;
    };
    leg.cornerAhead = (s, within) => corners.some(c => c.S >= s - 0.3 && c.S - s < within);
    leg.h0 = leg.head(0); leg.h1 = leg.head(total);
    return leg;
  }

  /* ---------- build ---------- */
  function build(o) {
    const asp = num(o.aspect, 1) || 1, d = num(o.distanceM), v = num(o.speedMps);
    let src = (o.routes || []).map((r, i) => ({ id: r.id !== undefined ? String(r.id) : 'r' + (i + 1), label: r.label || 'Route ' + (i + 1), fromName: r.fromName, toName: r.toName, pts: (r.pts || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) })).filter(r => r.pts.length > 1);
    if (!src.length && o.pts) src = [{ id: 'r1', label: 'Route', pts: o.pts.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) }].filter(r => r.pts.length > 1);
    if (!src.length) return { ok: false, reason: 'Draw the route on the Site layout first (Edit layout).' };
    if (!(d > 0) || !(v > 0)) return { ok: false, reason: 'Enter the route distance and the speed first.' };
    const lens = src.map(r => plen(r.pts, asp)), Lmax = Math.max(...lens);
    if (!(Lmax > 0)) return { ok: false, reason: 'The route has no length. Draw it again on the Site layout.' };
    const k = d / Lmax;                                                                   // metres per plan unit, so the longest drawn route measures the stated distance
    const buf = Math.max(num(o.bufferPct), 0), dwellS = Math.max(num(o.dwellS), 0), phys = Object.assign({}, PHYS, o.physics || {});
    const turnM = num(o.turnM, 1.4) || 1.4, liftMm = num(o.liftMm, 205) || 205;
    const m = { ok: true, k, aspect: asp, speedMps: v, phys, turnM, liftMm, cornerMps: Math.min(v, Math.sqrt(phys.latAccel * turnM)), bufferPct: buf, dwellS, segs: [], jobs: [], endT: 0, nextIx: 0, endHd: null, mode: 'loop', net: o.net || null };
    m.liftS = liftMm / 1000 / phys.liftMps; m.pivotRadS = phys.pivotDegS * Math.PI / 180;
    m.loadS = phys.settleS * 2 + m.liftS + dwellS / 2; m.unloadS = m.loadS;           // settle, lift (or lower), settle; plus any handling time the proposal states
    m.routes = src.map((r, ri) => {
      const P = r.pts.map(p => ({ x: p.x * k, y: p.y / asp * k })), n = P.length, len = [], cum = [0];
      for (let i = 1; i < n; i++) { len.push(Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y)); cum.push(cum[i - 1] + len[i - 1]); }
      const dir = i => Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x), dm = cum[n - 1], theoS = 2 * dm / v, bufS = theoS * buf / 100;
      const R = { id: r.id, label: r.label, fromName: r.fromName, toName: r.toName, P, n, len, cum, dir, distanceM: dm, theoS, bufS, cycleS: theoS + bufS + dwellS };   // cycleS: the proposal's formula
      R.rev = makeLeg(m, P.slice().reverse(), true); R.fwd = makeLeg(m, P, true);
      // the time one trip really takes (in a row of trips: it turns round at the drop-off, drives out, loads, turns, carries back, unloads)
      R.driveS = R.rev.time + R.fwd.time;
      R.simS = R.rev.time + R.fwd.time + m.loadS + m.unloadS + 2 * Math.abs(Math.PI) / m.pivotRadS;
      return R;
    });
    const far = m.routes.reduce((a, b, i) => b.distanceM > m.routes[a].distanceM + 1e-9 ? i : a, 0);
    m.far = far; m.distanceM = m.routes[far].distanceM; m.theoS = m.routes[far].theoS; m.bufS = m.routes[far].bufS; m.cycleS = m.routes[far].cycleS; m.simCycleS = m.routes[far].simS;
    m.order = (o.order && o.order.length ? o.order : [far]).filter(i => m.routes[i]);   // the longest route is the default simulation
    const R0 = m.routes[far]; m.park = { x: R0.P[R0.n - 1].x, y: R0.P[R0.n - 1].y }; m.endPos = { x: m.park.x, y: m.park.y };
    return m;
  }

  function reset(m) { m.segs = []; m.jobs = []; m.endT = 0; m.nextIx = 0; m.endHd = null; m.endPos = { x: m.park.x, y: m.park.y }; m.mode = 'loop'; }

  /* ---------- one job on the timeline ---------- */
  // spec: { out (drive to the pick-up, or null), carry (the drive with the pallet), ri, fromName, toName }
  function addJobSpec(m, spec) {
    let t = m.endT; const out = spec.out, carry = spec.carry, job = { ri: spec.ri === undefined ? -1 : spec.ri, t0: t, s0: m.segs.length, name: spec.name || '', fromName: spec.fromName || 'the pick-up', toName: spec.toName || 'the drop-off', rows: [] };
    const add = (kind, dur, a) => { const g = Object.assign({ kind, t0: t, t1: t + dur, job: m.jobs.length, ri: job.ri }, a); m.segs.push(g); t += dur; return g; };
    const pivot = (hd0, ang, laden, stage, at, base) => { if (Math.abs(ang) < 0.05) return 0; const dur = Math.abs(ang) / m.pivotRadS; add('pivot', dur, { hd0, hd1: hd0 + ang, x: at.x, y: at.y, laden, stage, base }); return dur; };
    const dist0 = out ? out.total : 0;
    // 1. drive to the pick-up (turning to face the way first if the AMR is not already facing it)
    let tRow = t, pickPose, hdArr;
    if (out) {
      if (m.endHd !== null) pivot(m.endHd, angDiff(m.endHd, out.h0), false, 'start', out.P[0], 0);
      add('out', out.time, { leg: out, laden: false, base: 0 }); hdArr = out.h1; pickPose = out.P[out.P.length - 1];
      job.rows.push({ label: 'Drive to ' + job.fromName, distanceM: out.total, t0: tRow, t1: t, kind: 'out' });
    } else { hdArr = carry.h0; pickPose = carry.P[0]; }
    // 2. load: forks in, lift, then turn round to leave
    tRow = t; add('load', m.loadS, { x: pickPose.x, y: pickPose.y, hd: hdArr, base: dist0 }); pivot(hdArr, angDiff(hdArr, carry.h0), true, 'carry', pickPose, dist0);
    job.rows.push({ label: 'Load the pallet', distanceM: 0, t0: tRow, t1: t, kind: 'load' });
    // 3. carry it
    tRow = t; add('drive', carry.time, { leg: carry, laden: true, base: dist0 });
    job.rows.push({ label: 'Carry to ' + job.toName, distanceM: carry.total, t0: tRow, t1: t, kind: 'drive' });
    // 4. put it down
    const dropPose = carry.P[carry.P.length - 1]; tRow = t; add('unload', m.unloadS, { x: dropPose.x, y: dropPose.y, hd: carry.h1, base: dist0 + carry.total });
    job.rows.push({ label: 'Unload the pallet', distanceM: 0, t0: tRow, t1: t, kind: 'unload' });
    job.t1 = t; job.s1 = m.segs.length; job.pick = { x: pickPose.x, y: pickPose.y, hd: hdArr }; job.drop = { x: dropPose.x, y: dropPose.y, hd: carry.h1 };
    job.distanceM = dist0 + carry.total; job.timeS = job.t1 - job.t0; job.avgMps = job.distanceM / (job.timeS || 1);
    job.driveS = (out ? out.time : 0) + carry.time; job.handlingS = job.timeS - job.driveS;
    m.jobs.push(job); m.endT = t; m.endHd = carry.h1; m.endPos = { x: dropPose.x, y: dropPose.y };
    return job;
  }
  const addRouteJob = (m, ri) => { const R = m.routes[ri]; return addJobSpec(m, { out: R.rev, carry: R.fwd, ri, name: R.label, fromName: R.fromName, toName: R.toName }); };
  function ensure(m, t) { if (m.mode === 'task') return; while (m.endT <= t + 1e-9) { const job = addRouteJob(m, m.order[m.nextIx % m.order.length]); m.nextIx++; job.next = m.nextIx; } }

  // the AMR is sent to route ri after the job it is on; whatever was lined up after that job is dropped (the usual order carries on afterwards)
  function call(m, t, ri) {
    if (!m.routes[ri] || m.mode === 'task') return false;
    ensure(m, t);
    const cur = m.jobs.findIndex(j => t >= j.t0 - 1e-9 && t < j.t1);
    if (cur < 0) return false;
    const keep = m.jobs[cur]; m.jobs.length = cur + 1; m.segs.length = keep.s1; m.endT = keep.t1; m.nextIx = keep.next === undefined ? m.nextIx : keep.next;
    const last = m.segs[keep.s1 - 1]; m.endHd = last.hd; m.endPos = { x: last.x, y: last.y };
    const job = addRouteJob(m, ri); job.next = keep.next; return true;
  }

  // a task: pick up at one point and put down at another, along the shortest drivable way. approach: the AMR first drives from where it is to the pick-up (default).
  function addTask(m, o) {
    if (!m.net) return { ok: false, reason: 'The walkway network is missing: draw the routes on the Site layout first.' };
    if (o.reset) reset(m);
    const W = p => ({ x: p.x * m.k, y: p.y / m.aspect * m.k }), carryP = m.net.path(o.from, o.to);
    if (!carryP || !(carryP.len * m.k > 0.5)) return { ok: false, reason: 'Pick two different points.' };
    let out = null;
    if (o.approach !== false) { const here = { x: m.endPos.x / m.k, y: m.endPos.y * m.aspect / m.k }, ap = m.net.path(here, o.from); if (ap && ap.len * m.k > 0.4) out = makeLeg(m, ap.pts.map(W), true); }
    const carry = makeLeg(m, carryP.pts.map(W), true);
    m.mode = 'task';
    const job = addJobSpec(m, { out, carry, ri: -1, name: (o.fromName || 'A') + ' to ' + (o.toName || 'B'), fromName: o.fromName, toName: o.toName });
    return { ok: true, job };
  }

  const findSeg = (m, t) => { let lo = 0, hi = m.segs.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (t < m.segs[mid].t1) hi = mid; else lo = mid + 1; } return m.segs[lo]; };

  // where everything is at second t
  function at(m, t) {
    t = Math.max(t, 0); ensure(m, t);
    const last = m.jobs[m.jobs.length - 1];
    if (m.mode === 'task' && last && t >= m.endT) {   // the task is done: it stands where it put the pallet down
      return { x: m.endPos.x, y: m.endPos.y, heading: m.endHd, speed: 0, accel: 0, phase: '', laden: false, lift: 0, kind: 'idle', label: LABEL.idle, travelled: last.distanceM, job: m.jobs.length, route: last.ri, jobT: last.timeS, jobS: last.timeS, jobDistanceM: last.distanceM, done: m.jobs.length, t, there: false, atKind: 'idle', finished: true };
    }
    const s = findSeg(m, t), job = m.jobs[s.job], e = t - s.t0, dur = s.t1 - s.t0, ph = m.phys;
    let x, y, speed = 0, accel = 0, heading, laden = s.laden, lift = s.laden ? 1 : 0, travelled = s.base || 0, phase = '', waiting = false, leg = null, legS = 0;
    if (s.kind === 'drive' || s.kind === 'out') {
      const st = s.leg.at(e), p = s.leg.pos(st.s); x = p.x; y = p.y; speed = st.v; accel = st.a; heading = s.leg.head(st.s); travelled = s.base + st.s; leg = s.leg; legS = st.s;
      const toEnd = s.leg.total - st.s;
      if (speed < 0.03 && e < 1.5) phase = 'Starting'; else if (s.leg.dockEnd && toEnd < ph.dockM + 0.25 && speed <= ph.dockMps + 0.08) phase = 'Docking slowly';
      else if (accel > 0.05) phase = 'Accelerating'; else if (accel < -0.05) phase = s.leg.cornerAhead(st.s, 4) ? 'Slowing for a turn' : 'Braking';
      else phase = speed > 0.97 * m.speedMps ? 'Cruising' : 'Turning through the corner';
      if (s.kind === 'out') waiting = true;
    } else if (s.kind === 'pivot') {
      x = s.x; y = s.y; heading = s.hd0 + (s.hd1 - s.hd0) * smooth(e / dur); phase = Math.round(Math.abs(s.hd1 - s.hd0) * 180 / Math.PI) + '° turn'; waiting = !s.laden && s.stage === 'start';
    } else {
      x = s.x; y = s.y; heading = s.hd;
      if (s.kind === 'load') { const a = ph.settleS, b = a + m.liftS; lift = smooth((e - a) / m.liftS); laden = e > a; waiting = e <= a; phase = e < a ? 'Forks in position' : e < b ? 'Lifting ' + Math.round(lift * m.liftMm) + ' mm' : 'Pallet secured'; }
      else { const a = ph.settleS, b = a + m.liftS; lift = 1 - smooth((e - a) / m.liftS); laden = e < b; phase = e < a ? 'Forks in position' : e < b ? 'Lowering ' + Math.round(lift * m.liftMm) + ' mm' : 'Pallet released'; }
    }
    return { x, y, heading, speed, accel, phase, laden, lift, kind: s.kind, label: LABEL[s.kind], travelled, job: s.job + 1, route: s.ri, jobT: t - job.t0, jobS: job.t1 - job.t0, jobDistanceM: job.distanceM, done: m.jobs.filter(j => j.t1 <= t + 1e-9).length, t, there: !!THERE[s.kind], atKind: s.kind, waiting, jobRef: job, leg, legS };
  }

  // one row per route, for the readings: how far, how long (the proposal's formula and what the machine really takes)
  function table(m) { return m.routes.map((R, i) => ({ i, id: R.id, label: R.label, distanceM: R.distanceM, cycleS: R.cycleS, simS: R.simS, driveS: R.driveS, farthest: i === m.far })); }

  // make sure the first n jobs are on the timeline and say when the n-th ends
  function jobsUntil(m, n) { while (m.jobs.length < n) { const job = addRouteJob(m, m.order[m.nextIx % m.order.length]); m.nextIx++; job.next = m.nextIx; } return m.jobs[n - 1].t1; }

  const API = { build, at, call, reset, addTask, table, jobsUntil, makeLeg, LABEL, PHYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCSim = API;
})(typeof window !== 'undefined' ? window : globalThis);
