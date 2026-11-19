/* WFC Proposal Builder: the shift simulation (no drawing, no browser). Works for any proposal: the production lines are the pick-up points that have a route
   on the site layout, the doors are the door points drawn on it, the AMR is the proposal's model. Each line finishes a pallet every few minutes; staff press the
   call button and the pallet joins the pickup queue; the AMR(s) take the next pallet, drive out, load, carry it to the drop-off and unload, stopping at doors
   and obstacles on the way; the battery drains by load and the AMR charges (or a member of staff swaps the battery) by the rules in the settings.

   It is an event simulation: a whole shift, day, week or month is worked out at once (no waiting for an animation), and with record: true it also writes the
   exact timeline the Simulation tab plays (the same WFCSim segments the single-trip view uses), so the picture and the numbers always agree.

   WFCOps.settings(S)                 -> the settings in use: defaults (facts and assumptions) with the proposal's own changes (S.sim) on top
   WFCOps.run(model, o)               -> { ok, H, lines, pallets, amrs, doors, obstacles, stats, series }
        o: { settings, lines: [{ ri, id, name }], doors: [{ id, x, y }] (plan fractions), charger: { x, y } | null, obstacles: [{ id, x, y, since, until }],
             hours, windows: [[t0, t1]...] (production, seconds), loadFrac, batteryKwh, record }
   WFCOps.scenario(S, settings)       -> { hours, windows, label }   (the scenario's length and the hours the lines run, from the proposal's shifts)
   WFCOps.FIELDS                      -> every setting, with its unit and where the number comes from (fact, proposal, product data, assumption)        */
(function (root) {
  'use strict';
  const Sim = root.WFCSim || (typeof require !== 'undefined' ? require('./sim.js') : null);
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  /* ---------- settings: facts from WFC, the proposal, the product data, and assumptions (all editable) ---------- */
  const FIELDS = [
    { k: 'runEmptyH', g: 'battery', l: 'Battery runtime with no load', u: 'h', src: 'fact', step: 0.25 },
    { k: 'runFullH', g: 'battery', l: 'Battery runtime with a full load', u: 'h', src: 'fact', step: 0.25, note: '6.5 to 7 h; partial loads are in between' },
    { k: 'chargeH', g: 'battery', l: 'Full charge, 0 to 100%', u: 'h', src: 'fact', step: 0.25 },
    { k: 'swapMin', g: 'battery', l: 'Manual battery swap by staff', u: 'min', src: 'fact', step: 1, note: '5 to 10 min' },
    { k: 'batteryKwh', g: 'battery', l: 'Battery capacity', u: 'kWh', src: 'product', step: 0.01, note: 'from the AMR data; empty = not known' },
    { k: 'lowPct', g: 'charging', l: 'Go to charge below', u: '%', src: 'assumption', step: 1, note: 'after finishing the task it is on' },
    { k: 'leavePct', g: 'charging', l: 'Leave the charger for a waiting pallet above', u: '%', src: 'assumption', step: 1 },
    { k: 'idleCharge', g: 'charging', l: 'Charge whenever no pallet is waiting', type: 'bool', src: 'assumption' },
    { k: 'chargerEff', g: 'energy', l: 'Charger efficiency', u: '%', src: 'assumption', step: 1 },
    { k: 'kwhPrice', g: 'energy', l: 'Electricity price', u: 'RM/kWh', src: 'assumption', step: 0.01, note: 'close to the Malaysian average base tariff; real bills vary' },
    { k: 'doorOpenS', g: 'doors', l: 'Door opening time', u: 's', src: 'assumption', step: 1, note: 'roll-up or sectional shutter, not confirmed with the client' },
    { k: 'doorCloseS', g: 'doors', l: 'Door closing time', u: 's', src: 'assumption', step: 1 },
    { k: 'doorHoldS', g: 'doors', l: 'Door stays open after the AMR passes', u: 's', src: 'assumption', step: 1 },
    { k: 'obstacleClearS', g: 'obstacles', l: 'An obstacle clears after', u: 's', src: 'assumption', step: 5, note: 'a person or trolley moving out of the way' },
    { k: 'safetyM', g: 'obstacles', l: 'Stops this far from an obstacle', u: 'm', src: 'assumption', step: 0.1 },
    { k: 'callDelayS', g: 'lines', l: 'Staff press the call button after the pallet is finished', u: 's', src: 'assumption', step: 5 },
    { k: 'intervalMin', g: 'lines', l: 'Each line finishes a pallet every', u: 'min', src: 'fact', step: 1, note: 'editable per line below' }
  ];
  const DEFAULTS = {
    scenario: 'shift', customH: 12, amrs: 1, charge: 'auto', dispatch: 'fifo', obstacleMode: 'wait', start: 'staggered',
    runEmptyH: 8, runFullH: 6.75, chargeH: 2, swapMin: 7, batteryKwh: '', lowPct: 20, leavePct: 30, idleCharge: true,
    chargerEff: 90, kwhPrice: 0.45, doorOpenS: 10, doorCloseS: 8, doorHoldS: 5, doorStopM: 1, obstacleClearS: 30, safetyM: 1,
    callDelayS: 0, intervalMin: 30, lines: {}, obstacles: []
  };
  function settings(S) {
    const o = Object.assign({}, DEFAULTS, (S && S.sim) || {});
    o.lines = Object.assign({}, (S && S.sim && S.sim.lines) || {}); o.obstacles = ((S && S.sim && S.sim.obstacles) || []).slice();
    return o;
  }
  // the battery in kWh from the product data ("48 V / 30 Ah"); a typed value wins; null when it is not known (then no energy or cost is shown)
  function batteryKwh(cfg, model) {
    const typed = num(cfg.batteryKwh, NaN); if (typed > 0) return { kwh: typed, from: 'settings' };
    const m = /(\d+(?:\.\d+)?)\s*V\b[^\d]*(\d+(?:\.\d+)?)\s*Ah/i.exec((model && model.battery) || '');
    return m ? { kwh: +(m[1] * m[2] / 1000).toFixed(3), from: 'product', text: `${m[1]} V × ${m[2]} Ah` } : { kwh: null, from: 'missing' };
  }
  // the scenario: how long it runs and when the lines produce (the proposal's shifts a day, every day, from 00:00)
  const SCEN = { shift: 'One shift', day: 'Full day (24 h)', week: 'Week (7 days)', month: 'Month (30 days)', custom: 'Custom' };
  function scenario(S, cfg) {
    const hps = num(S && S.scenario && S.scenario.hoursPerShift, 8) || 8, shifts = Math.max(1, Math.round(num(S && S.scenario && S.scenario.shifts, 1) || 1));
    const perDay = Math.min(24, hps * shifts);
    const hours = cfg.scenario === 'shift' ? hps : cfg.scenario === 'day' ? 24 : cfg.scenario === 'week' ? 168 : cfg.scenario === 'month' ? 720 : Math.max(0.5, num(cfg.customH, 12));
    const windows = [];
    if (cfg.scenario === 'shift') windows.push([0, hps * 3600]);
    else for (let d = 0; d * 24 < hours; d++) { const a = d * 86400, b = Math.min(a + perDay * 3600, hours * 3600); if (b > a) windows.push([a, b]); }
    const label = cfg.scenario === 'shift' ? `One ${hps}-hour shift` : cfg.scenario === 'custom' ? `${hours} hours` : SCEN[cfg.scenario];
    return { hours, windows, label, perDay, shifts, hps };
  }

  /* ---------- geometry along a route ---------- */
  const cumOf = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y)); return c; };
  // where point q falls along polyline P: { s (metres from the start), d (metres off the line) }
  function project(P, cum, q) {
    let best = { s: 0, d: Infinity };
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, u = L2 ? clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, 0, 1) : 0;
      const x = a.x + dx * u, y = a.y + dy * u, d = Math.hypot(q.x - x, q.y - y);
      if (d < best.d) best = { s: cum[i] + Math.sqrt(L2) * u, d };
    }
    return best;
  }
  function pointAt(P, cum, s) { for (let i = 0; i < P.length - 1; i++) if (s <= cum[i + 1] + 1e-9) { const L = cum[i + 1] - cum[i], u = L ? (s - cum[i]) / L : 0; return { x: P[i].x + (P[i + 1].x - P[i].x) * u, y: P[i].y + (P[i + 1].y - P[i].y) * u, i }; } const n = P.length - 1; return { x: P[n].x, y: P[n].y, i: n - 1 }; }
  function slice(P, cum, s0, s1) { const a = pointAt(P, cum, s0), b = pointAt(P, cum, s1), out = [{ x: a.x, y: a.y }]; for (let i = a.i + 1; i <= b.i; i++) out.push({ x: P[i].x, y: P[i].y }); out.push({ x: b.x, y: b.y }); return out.filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 1e-6); }
  // the time a leg reaches distance s from its start
  function timeAtS(leg, s) { if (s <= 0) return 0; if (s >= leg.total) return leg.time; const i = Math.min(leg.N - 1, Math.floor(s / leg.dS)); const f = (s - i * leg.dS) / leg.dS; return leg.T[i] + (leg.T[i + 1] - leg.T[i]) * f; }
  // a detour round an obstacle: leave the line 2.5 m before it, pass 1.4 m to the side, come back 2.5 m after
  function detour(P, cum, s, side) {
    const tot = cum[cum.length - 1], a = Math.max(0, s - 2.5), b = Math.min(tot, s + 2.5), p = pointAt(P, cum, s), q0 = pointAt(P, cum, Math.max(0, s - 0.5)), q1 = pointAt(P, cum, Math.min(tot, s + 0.5));
    const dx = q1.x - q0.x, dy = q1.y - q0.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * side, ny = dx / L * side, w = 1.4;
    const mid = [{ x: pointAt(P, cum, Math.max(0, s - 1.2)).x + nx * w, y: pointAt(P, cum, Math.max(0, s - 1.2)).y + ny * w }, { x: p.x + nx * w, y: p.y + ny * w }, { x: pointAt(P, cum, Math.min(tot, s + 1.2)).x + nx * w, y: pointAt(P, cum, Math.min(tot, s + 1.2)).y + ny * w }];
    return slice(P, cum, 0, a).concat(mid, slice(P, cum, b, tot));
  }

  /* ---------- the run ---------- */
  function run(model, o) {
    if (!model || !model.ok) return { ok: false, reason: (model && model.reason) || 'Nothing to simulate yet.' };
    const cfg = o.settings, rec = !!o.record, k = model.k, asp = model.aspect, H = Math.max(60, num(o.hours, 8) * 3600);
    const W = p => ({ x: p.x * k, y: p.y / asp * k });
    const loadFrac = clamp(num(o.loadFrac, 1), 0, 1);
    const rE = 1 / (Math.max(0.1, num(cfg.runEmptyH, 8)) * 3600), rFull = 1 / (Math.max(0.1, num(cfg.runFullH, 6.75)) * 3600), rL = rE + (rFull - rE) * loadFrac, rC = 1 / (Math.max(0.05, num(cfg.chargeH, 2)) * 3600);
    const low = clamp(num(cfg.lowPct, 20), 1, 95) / 100, leave = clamp(Math.max(num(cfg.leavePct, 30) / 100, low), low, 1), swapS = Math.max(0, num(cfg.swapMin, 7)) * 60;
    const auto = cfg.charge !== 'swap', idleCharge = cfg.idleCharge !== false && auto, obsWait = cfg.obstacleMode !== 'reroute';
    const doorOpenS = Math.max(0, num(cfg.doorOpenS, 10)), doorCloseS = Math.max(0, num(cfg.doorCloseS, 8)), doorHoldS = Math.max(0, num(cfg.doorHoldS, 5)), doorStopM = Math.max(0.3, num(cfg.doorStopM, 1));
    const clearS = Math.max(0, num(cfg.obstacleClearS, 30)), safetyM = Math.max(0.3, num(cfg.safetyM, 1)), callDelay = Math.max(0, num(cfg.callDelayS, 0));

    // the lines (one per route) and their pallets
    const lines = (o.lines || model.routes.map((R, ri) => ({ ri, id: R.id, name: R.label }))).map((L, li) => {
      const R = model.routes[L.ri], c = cfg.lines[L.id] || {}, geo = R.distanceM, dist = num(c.distanceM, NaN) > 0 ? num(c.distanceM) : geo;
      return { li, ri: L.ri, id: L.id, name: L.name, geoM: geo, distM: dist, f: dist / geo, intervalS: Math.max(1, num(c.interval, num(cfg.intervalMin, 30))) * 60, on: c.on !== false, pallets: [] };
    });
    const on = lines.filter(L => L.on), pallets = [];
    (o.windows || [[0, H]]).forEach(([w0, w1]) => on.forEach((L, j) => {
      const off = cfg.start === 'together' ? L.intervalS : L.intervalS * (j + 1) / on.length;
      for (let t = w0 + off; t <= w1 + 1e-6 && t <= H; t += L.intervalS) { const p = { id: pallets.length, li: L.li, tFinish: t, tCall: t + callDelay, tAssign: null, tLoad: null, tDrop: null, amr: null }; pallets.push(p); L.pallets.push(p); }
    }));
    pallets.sort((a, b) => a.tCall - b.tCall || a.li - b.li);

    // doors and obstacles in metres
    const doors = (o.doors || []).map(d => Object.assign({ id: d.id, cycles: [], waits: 0, waitS: 0 }, W(d)));
    const obstacles = (o.obstacles || []).map(b => Object.assign({ id: b.id, since: num(b.since, 0), until: b.until == null ? Infinity : b.until, events: [], waits: 0, waitS: 0 }, W(b)));
    const park = { x: model.park.x, y: model.park.y }, charger = o.charger ? W(o.charger) : null;
    const chM = charger ? Math.hypot(charger.x - park.x, charger.y - park.y) : 0;
    const legTo = chM > 0.5 ? Sim.makeLeg(model, [park, charger], true) : null, legFrom = chM > 0.5 ? Sim.makeLeg(model, [charger, park], true) : null;

    // the drive one way along a route, cut where it stops (doors, obstacles) and bent round obstacles when it re-routes; cached
    const cache = {};
    function plan(ri, dir, tStart) {
      const R = model.routes[ri], base = dir === 'out' ? R.P.slice().reverse() : R.P, full = dir === 'out' ? R.rev : R.fwd, cum0 = cumOf(base);
      const act = obstacles.filter(b => { const pr = project(base, cum0, b); if (pr.d > 1.2) return false; const tr = tStart + timeAtS(full, pr.s); return tr >= b.since && tr < b.until; });
      const key = ri + dir + act.map(b => b.id).join(',') + (obsWait ? 'w' : 'r');
      if (cache[key]) return cache[key];
      let P = base;
      if (!obsWait) act.forEach(b => { const c = cumOf(P), pr = project(P, c, b); P = detour(P, c, pr.s, 1); });
      const cum = cumOf(P), tot = cum[cum.length - 1], stops = [];
      doors.forEach(d => { const pr = project(P, cum, d); if (pr.d < 4) stops.push({ s: pr.s - doorStopM, at: pr.s, type: 'door', ref: d }); });
      if (obsWait) act.forEach(b => { const pr = project(P, cum, b); stops.push({ s: pr.s - safetyM, at: pr.s, type: 'obs', ref: b }); });
      const cuts = stops.filter(x => x.s > 0.4 && x.s < tot - 0.4).sort((a, b) => a.s - b.s);
      const pieces = []; let s0 = 0;
      cuts.forEach(c => { pieces.push({ leg: Sim.makeLeg(model, slice(P, cum, s0, c.s), false), stop: c }); s0 = c.s; });
      pieces.push({ leg: Sim.makeLeg(model, slice(P, cum, s0, tot), true), stop: null });
      // a stop right at the start (a door next to the pick-up or the drop-off) is a wait before the first piece
      const pre = stops.filter(x => x.s <= 0.4);
      return (cache[key] = { pieces, pre, total: tot, h0: pieces[0].leg.h0, h1: pieces[pieces.length - 1].leg.h1 });
    }
    // a door: when may the AMR pass if it asks at time t, and when has it passed
    function doorWait(d, t, passAfter) {
      const cy = d.cycles; let c = cy[cy.length - 1], wait;
      if (c && t >= c.o0 - 1e-9 && t <= c.c0) { wait = Math.max(0, c.o1 - t); c.c0 = Math.max(c.c0, t + wait + passAfter + doorHoldS); c.c1 = c.c0 + doorCloseS; }
      else {
        const from = c && t < c.c1 ? c.c1 : t;   // closing: it finishes closing, then opens again
        c = { o0: from, o1: from + doorOpenS }; wait = c.o1 - t; c.c0 = t + wait + passAfter + doorHoldS; c.c1 = c.c0 + doorCloseS; cy.push(c);
      }
      d.waits++; d.waitS += wait; return wait;
    }

    // the AMRs
    const amrs = [];
    for (let a = 0; a < Math.max(1, Math.round(num(cfg.amrs, 1))); a++) {
      const mm = rec ? Object.assign({}, model, { segs: [], jobs: [], endT: 0, endHd: null, endPos: { x: park.x, y: park.y }, mode: 'ops' }) : null;
      amrs.push({ id: a, bat: 1, where: 'drop', pos: { x: park.x, y: park.y }, hd: model.routes[model.far].fwd.h1, freeAt: 0, mode: 'idle', since: 0, after: null, model: mm, batPts: [[0, 1]],
        acc: { empty: 0, laden: 0, handling: 0, doorWait: 0, obsWait: 0, charging: 0, swapping: 0, idle: 0, toCharger: 0 }, distE: 0, distL: 0, charged: 0, used: 0, swaps: 0, trips: 0, sessions: 0, lowest: 1, ranOut: 0 });
    }
    const pos = a => a.pos;

    // writing the timeline (only when recording); every activity also adds up the statistics
    function seg(a, g) { if (!a.model) return; const m = a.model; g.job = m.jobs.length - 1; m.segs.push(g); m.endT = g.t1; }
    function job(a, j) { if (!a.model) return null; j.s0 = a.model.segs.length; a.model.jobs.push(j); return j; }
    function close(a, j, t) { if (!j) return; j.t1 = t; j.s1 = a.model.segs.length; j.timeS = j.t1 - j.t0; }
    const drain = (a, dur, rate) => { a.bat -= dur * rate; a.used += dur * rate; if (a.bat < a.lowest) a.lowest = a.bat; if (a.bat < 0) { a.ranOut++; a.bat = 0; } };
    const mark = (a, t) => { const p = a.batPts[a.batPts.length - 1]; if (!p || p[0] !== t || p[1] !== a.bat) a.batPts.push([t, a.bat]); };

    function hold(a, kind, t0, t1, label, extra) {
      if (t1 <= t0 + 1e-9) return t0;
      const p = pos(a); seg(a, Object.assign({ kind, t0, t1, x: p.x, y: p.y, hd: a.hd, laden: false, label, base: 0 }, extra || {})); return t1;
    }
    function service(a, t0, label) { return job(a, { service: true, ri: -1, t0, name: label, fromName: '', toName: '', rows: [], distanceM: 0 }); }
    function drive(a, t, leg, kind, laden, base, ts, label) {
      const dur = leg.time * (ts || 1); seg(a, { kind, t0: t, t1: t + dur, leg, laden, base, ts: ts || 1, label });
      drain(a, dur, laden ? rL : rE); if (laden) { a.acc.laden += dur; a.distL += leg.total * (ts || 1); } else { a.acc.empty += dur; a.distE += leg.total * (ts || 1); }
      a.hd = leg.h1; return t + dur;
    }
    function pivot(a, t, to, laden, stage, at) {
      const ang = angDiff(a.hd, to); if (Math.abs(ang) < 0.05) { a.hd = to; return t; }
      const dur = Math.abs(ang) / model.pivotRadS; seg(a, { kind: 'pivot', t0: t, t1: t + dur, hd0: a.hd, hd1: a.hd + ang, x: at.x, y: at.y, laden, stage, base: 0 });
      drain(a, dur, laden ? rL : rE); a.acc.handling += dur; a.hd = to; return t + dur;
    }
    function goCharger(a, t) { if (!legTo) { a.where = 'charger'; return t; } const j = service(a, t, 'Going to charge'); t = drive(a, t, legTo, 'go', false, 0, 1, 'Going to the charger'); a.acc.toCharger += legTo.time; a.acc.empty -= legTo.time; close(a, j, t); a.where = 'charger'; a.pos = { x: charger.x, y: charger.y }; return t; }
    function goBack(a, t) { if (!legFrom || a.where !== 'charger') { a.where = 'drop'; return t; } const j = service(a, t, 'Back to work'); t = pivot(a, t, legFrom.h0, false, 'start', charger); t = drive(a, t, legFrom, 'go', false, 0, 1, 'Leaving the charger'); a.acc.toCharger += legFrom.time; a.acc.empty -= legFrom.time; close(a, j, t); a.where = 'drop'; a.pos = { x: park.x, y: park.y }; return t; }

    // one pallet: out, load, carry, unload; door and obstacle stops on the way
    function stops(a, t, stop, laden, nextLeg, tsf) {
      if (!stop) return t;
      const p = { x: stop.ref.x, y: stop.ref.y }, here = nextLeg ? nextLeg.P[0] : p;
      if (stop.type === 'door') {
        const pass = timeAtS(nextLeg, doorStopM + 1.5) * (tsf || 1), w = doorWait(stop.ref, t, pass);
        if (w > 1e-6) { seg(a, { kind: 'wait', t0: t, t1: t + w, x: here.x, y: here.y, hd: a.hd, laden, label: 'Waiting for the door', phase: 'Door opening', base: 0 }); drain(a, w, laden ? rL : rE); a.acc.doorWait += w; }
        return t + w;
      }
      const b = stop.ref, w = clearS;
      b.events.push({ t0: t, t1: t + w, pass: t + w + timeAtS(nextLeg, safetyM + 1.2) * (tsf || 1) }); b.waits++; b.waitS += w;
      if (w > 1e-6) { seg(a, { kind: 'wait', t0: t, t1: t + w, x: here.x, y: here.y, hd: a.hd, laden, label: 'Obstacle ahead: waiting', phase: 'Path blocked', base: 0 }); drain(a, w, laden ? rL : rE); a.acc.obsWait += w; }
      return t + w;
    }
    function oneWay(a, t, ri, dir, laden, tsf) {
      const pl = plan(ri, dir, t); let base = 0;
      pl.pre.forEach(x => { t = stops(a, t, x, laden, pl.pieces[0].leg, tsf); });
      pl.pieces.forEach((pc, i) => { t = drive(a, t, pc.leg, laden ? 'drive' : 'out', laden, base, tsf); base += pc.leg.total * tsf; t = stops(a, t, pc.stop, laden, pl.pieces[i + 1] && pl.pieces[i + 1].leg, tsf); });
      return { t, pl };
    }
    function trip(a, p, t) {
      const L = lines[p.li], R = model.routes[L.ri];
      t = goBack(a, t);
      const j = job(a, { ri: L.ri, t0: t, name: L.name, fromName: L.name, toName: 'the drop-off', rows: [], pallet: p.id });
      const out0 = plan(L.ri, 'out', t);
      t = pivot(a, t, out0.h0, false, 'start', park);
      const o1 = oneWay(a, t, L.ri, 'out', false, L.f); t = o1.t;
      const pick = R.P[0], hdArr = o1.pl.h1;
      p.tLoad = t; seg(a, { kind: 'load', t0: t, t1: t + model.loadS, x: pick.x, y: pick.y, hd: hdArr, base: 0 }); drain(a, model.loadS, rE); a.acc.handling += model.loadS; t += model.loadS; a.hd = hdArr;
      const c0 = plan(L.ri, 'carry', t); t = pivot(a, t, c0.h0, true, 'carry', pick);
      const o2 = oneWay(a, t, L.ri, 'carry', true, L.f); t = o2.t;
      const drop = R.P[R.P.length - 1];
      seg(a, { kind: 'unload', t0: t, t1: t + model.unloadS, x: drop.x, y: drop.y, hd: o2.pl.h1, base: 0 }); drain(a, model.unloadS, rL); a.acc.handling += model.unloadS; t += model.unloadS; a.hd = o2.pl.h1;
      p.tDrop = t; a.trips++;
      if (j) { close(a, j, t); Object.assign(j, { pick: { x: pick.x, y: pick.y, hd: hdArr }, drop: { x: drop.x, y: drop.y, hd: o2.pl.h1 }, distanceM: (o1.pl.total + o2.pl.total) * L.f, rows: [] }); j.avgMps = j.distanceM / (j.timeS || 1); }
      a.where = 'drop'; a.pos = { x: drop.x, y: drop.y }; mark(a, t); return t;
    }

    // the event loop
    const queue = [], qSeries = [[0, 0]], H2 = H; let ai = 0, guard = 0, maxQ = 0;
    const qMark = t => { qSeries.push([t, queue.length]); if (queue.length > maxQ) maxQ = queue.length; };
    const batAt = (a, t) => a.mode === 'charging' ? Math.min(1, a.bat + (t - a.since) * rC) : a.bat;
    function endCharge(a, t) {   // close a charging session at t
      const b1 = batAt(a, t), j = service(a, a.since, 'Charging');
      hold(a, 'charge', a.since, t, b1 >= 0.999 ? 'Charged, waiting at the charger' : 'Charging', { phase: 'Battery ' + Math.round(b1 * 100) + '%' });
      close(a, j, t); a.charged += b1 - a.bat; a.acc.charging += t - a.since; a.bat = b1; mark(a, t); a.mode = 'idle'; a.since = t;
    }
    function endIdle(a, t) { if (t > a.since + 1e-9) { const j = service(a, a.since, 'Waiting'); hold(a, 'idle', a.since, t, a.where === 'charger' ? 'Waiting at the charger' : 'Waiting for a pallet', { phase: 'No pallet waiting' }); close(a, j, t); drain(a, t - a.since, rE); a.acc.idle += t - a.since; mark(a, t); } a.since = t; }
    function startCharge(a, t) { endIdle(a, t); t = goCharger(a, t); mark(a, t); a.mode = 'busy'; a.freeAt = t; a.after = 'charge'; }
    function startSwap(a, t) {
      endIdle(a, t); t = goCharger(a, t);
      const j = service(a, t, 'Battery swap'); hold(a, 'swap', t, t + swapS, 'Battery swap by staff', { phase: Math.round(swapS / 60) + ' min' }); close(a, j, t + swapS);
      a.acc.swapping += swapS; a.swaps++; a.charged += 1 - a.bat; a.bat = 1; t += swapS; mark(a, t); t = goBack(a, t); mark(a, t); a.mode = 'busy'; a.freeAt = t; a.after = null;
    }
    function assign(a, p, t) {
      if (a.mode === 'charging') endCharge(a, t); else endIdle(a, t);
      queue.splice(queue.indexOf(p), 1); qMark(t); p.tAssign = t; p.amr = a.id;
      a.mode = 'busy'; a.freeAt = trip(a, p, t); a.after = null;
    }
    const pickNext = () => cfg.dispatch === 'nearest' ? queue.reduce((b, p) => lines[p.li].distM < lines[b.li].distM - 1e-9 ? p : b, queue[0]) : queue[0];

    while (guard++ < 500000) {
      let T = Infinity;
      amrs.forEach(a => { if (a.mode === 'busy') T = Math.min(T, a.freeAt); });
      if (ai < pallets.length) T = Math.min(T, pallets[ai].tCall);
      if (queue.length) amrs.forEach(a => { if (a.mode === 'charging' && batAt(a, a.since) < leave) T = Math.min(T, a.since + (leave - a.bat) / rC); });
      if (!(T < Infinity)) break;
      if (T >= H2 && !amrs.some(a => a.mode === 'busy')) break;
      // AMRs that finished what they were doing
      amrs.forEach(a => {
        if (a.mode !== 'busy' || a.freeAt > T + 1e-9) return;
        const t = a.freeAt; a.since = t;
        if (a.after === 'charge') { a.mode = 'charging'; a.after = null; a.sessions++; return; }
        a.mode = 'idle';
        if (a.bat < low && t < H2) { if (auto) startCharge(a, t); else startSwap(a, t); }
      });
      while (ai < pallets.length && pallets[ai].tCall <= T + 1e-9) { queue.push(pallets[ai]); ai++; qMark(queue[queue.length - 1].tCall); }
      if (T < H2) {
        // hand out the waiting pallets: free AMRs first, then those charging with enough battery
        let guard2 = 0;
        while (queue.length && guard2++ < 100) {
          const idle = amrs.filter(a => a.mode === 'idle' && a.bat >= low).sort((x, y) => x.since - y.since || x.id - y.id)[0];
          const chg = amrs.filter(a => a.mode === 'charging' && batAt(a, T) >= leave - 1e-9).sort((x, y) => batAt(y, T) - batAt(x, T))[0];
          const a = idle || chg; if (!a) break;
          assign(a, pickNext(), T);
        }
        // nothing to carry: charge while waiting (automatic charging), otherwise wait where it is
        if (!queue.length && idleCharge) amrs.forEach(a => { if (a.mode === 'idle' && a.bat < 0.995) startCharge(a, T); });
      }
    }
    // the end of the scenario: close whatever each AMR is doing
    const Hend = Math.max(H2, ...amrs.map(a => a.mode === 'busy' ? a.freeAt : 0));
    amrs.forEach(a => { if (a.mode === 'charging') endCharge(a, Hend); else if (a.mode === 'idle') endIdle(a, Hend); mark(a, Hend); if (a.model) a.model.endT = Math.max(a.model.endT, Hend); });
    qMark(Hend);

    // statistics
    const done = pallets.filter(p => p.tDrop !== null && p.tDrop <= Hend + 1e-6), made = pallets.filter(p => p.tFinish <= H2 + 1e-6);
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const sum = f => amrs.reduce((s, a) => s + f(a), 0);
    const kwh = num(o.batteryKwh, NaN) > 0 ? num(o.batteryKwh) : null, eff = clamp(num(cfg.chargerEff, 90), 10, 100) / 100;
    const usedFrac = sum(a => a.used), chargedFrac = sum(a => a.charged);
    // the grid supplies what the batteries take in (swapped batteries are charged off the AMR, so count what was used), through the charger's losses
    const gridKwh = kwh ? (auto ? chargedFrac : usedFrac) * kwh / eff : null;
    const timeTot = amrs.length * Hend, accSum = key => sum(a => a.acc[key]);
    const working = accSum('empty') + accSum('laden') + accSum('handling') + accSum('toCharger');
    const stats = {
      hours: H2 / 3600, endHours: Hend / 3600, amrs: amrs.length, made: made.length, moved: done.length, waitingAtEnd: pallets.filter(p => p.tFinish <= H2 && (p.tDrop === null || p.tDrop > Hend)).length,
      avgWaitS: avg(done.map(p => p.tLoad - p.tCall)), avgLeadS: avg(done.map(p => p.tDrop - p.tCall)), maxLeadS: done.reduce((m, p) => Math.max(m, p.tDrop - p.tCall), 0), avgTripS: avg(done.map(p => p.tDrop - p.tAssign)),
      distKm: sum(a => a.distE + a.distL) / 1000, distLadenKm: sum(a => a.distL) / 1000,
      cycles: chargedFrac, chargingH: accSum('charging') / 3600, sessions: sum(a => a.sessions), swaps: sum(a => a.swaps), swapH: accSum('swapping') / 3600,
      usedKwh: kwh ? usedFrac * kwh : null, gridKwh, costRM: gridKwh !== null ? gridKwh * clamp(num(cfg.kwhPrice, 0.45), 0, 100) : null,
      pct: { working: working / timeTot, waiting: (accSum('doorWait') + accSum('obsWait')) / timeTot, charging: (accSum('charging') + accSum('swapping')) / timeTot, idle: accSum('idle') / timeTot },
      doorWaitS: accSum('doorWait'), doorStops: doors.reduce((s, d) => s + d.waits, 0), obsWaitS: accSum('obsWait'), obsStops: obstacles.reduce((s, b) => s + b.waits, 0),
      maxQueue: maxQ, lowestPct: Math.min(...amrs.map(a => a.lowest)) * 100, ranOut: sum(a => a.ranOut),
      keepsUp: done.length >= made.length - Math.max(2, on.length), demandPerH: on.reduce((s, L) => s + 3600 / L.intervalS, 0) * (o.windows ? o.windows.reduce((s, w) => s + w[1] - w[0], 0) / H2 : 1)
    };
    stats.ratePerH = stats.moved / Math.max(1e-9, H2 / 3600);
    return { ok: true, H: H2, Hend, lines, pallets, amrs, doors, obstacles, stats, series: { queue: qSeries, battery: amrs.map(a => a.batPts) }, charger, park };
  }

  // the value of a stepwise or piecewise-linear series at time t (pts sorted by time)
  function valueAt(pts, t, linear) {
    if (!pts.length) return 0; let lo = 0, hi = pts.length - 1;
    if (t <= pts[0][0]) return pts[0][1]; if (t >= pts[hi][0]) return pts[hi][1];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= t) lo = mid; else hi = mid; }
    if (!linear) return pts[lo][1];
    const a = pts[lo], b = pts[hi]; return b[0] > a[0] ? a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]) : b[1];
  }

  /* ---------- from a proposal: the motion model, the lines, the doors, and the whole run (used by the Simulation tab and the results slide) ---------- */
  // a route's label is "Point 3 (Channel 4)" or "Longest route · Point 8 (Channel 8)": the number on the map and the line's name
  const parseLabel = (label, i) => { const m = /^(?:Longest route\s*[·-]\s*)?Point\s+(\S+)(?:\s*\((.*)\))?\s*$/.exec(label || ''); return m ? { num: m[1], name: m[2] || 'Point ' + m[1] } : { num: String(i + 1), name: (label || 'Route ' + (i + 1)).replace(/^Longest route\s*[·-]\s*/, '') }; };
  function modelFor(S, D) {
    const lp = (S && S.layoutPlan) || {}, routes = (lp.routes || []).filter(r => (r.pts || []).length > 1), aspect = (D && D.layoutAspect) || 1.5, M = D && D.model;
    const spots = (lp.points || []).filter(p => p.kind === 'spot');
    const dropName = r => { const e = r.pts[r.pts.length - 1]; let best = null, bd = 1e9; spots.forEach(p => { const dd = Math.hypot(p.x - e.x, (p.y - e.y) / aspect); if (dd < bd) { bd = dd; best = p; } }); return best && bd < 0.05 ? 'Spot ' + best.label : 'the drop-off'; };
    const named = routes.map((r, i) => Object.assign({}, r, { fromName: parseLabel(r.label, i).name, toName: dropName(r) }));
    const pts = (lp.points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.id !== undefined);
    const net = root.WFCNet ? root.WFCNet.build({ routes, points: pts, aspect }) : null;
    return Sim.build({ routes: named, aspect, distanceM: S.route.distanceM, speedMps: S.route.speedMps, bufferPct: S.route.bufferPct, dwellS: S.route.dwellS, net, turnM: M && M.turnM, liftMm: M && M.liftMm });
  }
  function inputsFor(S, D, model, cfg) {
    const lp = (S && S.layoutPlan) || {}, M = D && D.model, sc = scenario(S, cfg), bat = batteryKwh(cfg, M);
    const kg = num(S.pallet && S.pallet.kg, NaN) > 0 ? num(S.pallet.kg) : num(S.scenario && S.scenario.loadKg, NaN), pay = num(M && M.payloadKg, NaN);
    const loadFrac = kg > 0 && pay > 0 ? clamp(kg / pay, 0, 1) : 1;   // not known: count every trip as a full load (the safe side)
    const lines = model.routes.map((R, ri) => { const p = parseLabel(R.label, ri); return { ri, id: R.id, name: p.name, num: p.num }; });
    const doors = (lp.points || []).filter(p => p.kind === 'door'), ch = (lp.points || []).find(p => p.kind === 'charger') || null;
    return { sc, bat, loadFrac, kg, pay, lines, doors, charger: ch };
  }
  function runFor(S, D, opt) {
    opt = opt || {};
    const model = opt.model || modelFor(S, D); if (!model.ok) return { ok: false, reason: model.reason, model };
    const cfg = Object.assign(settings(S), opt.settings || {}), inp = inputsFor(S, D, model, cfg);
    const hours = opt.hours ? Math.min(opt.hours, inp.sc.hours) : inp.sc.hours, H = hours * 3600;
    const windows = inp.sc.windows.map(w => [w[0], Math.min(w[1], H)]).filter(w => w[1] > w[0]);
    const obstacles = (opt.obstacles || cfg.obstacles || []);
    const res = run(model, { settings: cfg, lines: inp.lines, doors: inp.doors, charger: inp.charger, obstacles, hours, windows, loadFrac: inp.loadFrac, batteryKwh: inp.bat.kwh, record: !!opt.record });
    return Object.assign(res, { model, cfg, inputs: inp, scenarioLabel: inp.sc.label, scenarioHours: inp.sc.hours });
  }
  // the results for the proposal (the scenario chosen in the Simulation tab), worked out once per change
  let sumKey = '', sumVal = null;
  function summary(S, D) {
    if (!S || !S.layoutPlan || !(S.layoutPlan.routes || []).length) return null;
    const key = JSON.stringify([S.layoutPlan.routes, S.layoutPlan.points, D && D.layoutAspect, S.route, D && D.model && D.model.id, S.sim, S.scenario, S.pallet && S.pallet.kg]);
    if (key === sumKey) return sumVal;
    sumKey = key; try { const r = runFor(S, D); sumVal = r.ok ? r : null; } catch (e) { sumVal = null; }
    return sumVal;
  }

  const API = { run, runFor, modelFor, summary, settings, scenario, batteryKwh, valueAt, parseLabel, FIELDS, DEFAULTS, SCEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCOps = API;
})(typeof window !== 'undefined' ? window : globalThis);
