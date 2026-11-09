/* WFC Proposal Builder: "Draw the solution with Claude". Claude looks at the site layout picture (a clean copy plus a copy with a grid, so it can read
   positions) and the project description, and returns what to draw: pick-up and drop-off areas, numbered pick-up points, lettered drop-off spots,
   call boxes, doors, chargers, the AMR's route, and the operating flow in words. Everything comes back as plain data and is drawn by the layout editor,
   so it can all be moved and changed afterwards. This file also tidies Claude's answer (snaps corners straight, keeps it inside the picture)
   and sets the scale from the stated route length.
   WFCPlanAI.parseSolution(raw, aspect) -> { fields, hints, plan, flow, assumptions } | null      (no internet; used by the tests)
   WFCPlanAI.calibrate(plan, aspect, distanceM)                                                   (sets plan.scale so the longest route measures distanceM)
   WFCPlanAI.solve(opt)                                                                          (the call itself, browser only) */
(function (root) {
  'use strict';
  const AI = root.WFCIntakeAI || (typeof require !== 'undefined' ? require('./intake-ai.js') : null);
  const C = root.WFCCalc || (typeof require !== 'undefined' ? require('./calc.js') : null);
  const ZONE_KINDS = ['pickup', 'drop', 'zone'], POINT_KINDS = ['pick', 'spot', 'callbox', 'door', 'charger', 'standby'];
  const PHASES = ['Demand trigger', 'Packaging and load', 'Smart transit', 'Release and return'];
  const cl = v => Math.max(0, Math.min(1, v));
  const r3 = v => Math.round(v * 1000) / 1000;
  const str = (v, n) => String(v == null ? '' : v).replace(/[|\n\r]+/g, ' ').trim().slice(0, n || 60);

  /* ---------- tidy up what Claude drew ---------- */
  // Corners that are nearly in line with the one before become exactly in line, so the route runs straight along aisles.
  function snapRoute(pts, tol) {
    tol = tol || 0.012;
    const out = [];
    pts.forEach(p => {
      const q = { x: p.x, y: p.y }, prev = out[out.length - 1];
      if (prev) {
        const dx = Math.abs(q.x - prev.x), dy = Math.abs(q.y - prev.y);
        if (dx < tol && dy < tol) return;                      // the same corner twice (or a wobble too small to see)
        if (dx < tol) q.x = prev.x; else if (dy < tol) q.y = prev.y;
      }
      out.push(q);
    });
    // a middle corner that lies on the straight line between its neighbours is not a corner
    return out.filter((p, i) => {
      if (i === 0 || i === out.length - 1) return true;
      const a = out[i - 1], b = out[i + 1];
      return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
    });
  }
  const xy = a => Array.isArray(a) ? { x: +a[0], y: +a[1] } : (a && typeof a === 'object' ? { x: +a.x, y: +a.y } : null);
  const okXY = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

  // opt.minimal (the first drawing): no call boxes, no extra areas, one route, at most one door, charger and standby. The user can still ask for more.
  function sanitizePlan(o, opt) {
    const min = !!(opt && opt.minimal), seen = {};
    const plan = { zones: [], points: [], routes: [] };
    (Array.isArray(o.zones) ? o.zones : []).slice(0, 14).forEach((z, i) => {
      const kind = ZONE_KINDS.includes(z.kind) ? z.kind : 'zone';
      if (min && kind === 'zone') return;
      let b = Array.isArray(z.box) ? z.box : [z.x, z.y, z.w, z.h]; b = b.map(Number);
      if (b.length < 4 || b.some(v => !Number.isFinite(v)) || !(b[2] > 0) || !(b[3] > 0)) return;
      const x = cl(b[0]), y = cl(b[1]), w = Math.min(b[2], 1 - x), h = Math.min(b[3], 1 - y);
      if (w < 0.01 || h < 0.01) return;
      plan.zones.push({ id: 'zai' + i, kind, label: str(z.label), x: r3(x), y: r3(y), w: r3(w), h: r3(h) });
    });
    (Array.isArray(o.points) ? o.points : []).slice(0, 40).forEach((p, i) => {
      const kind = POINT_KINDS.includes(p.kind) ? p.kind : null, at = xy(p.at || p);
      if (!kind || !okXY(at)) return;
      if (min && (kind === 'callbox' || (/^(door|charger|standby)$/.test(kind) && seen[kind]))) return;
      seen[kind] = true;
      plan.points.push({ id: 'pai' + i, kind, label: str(p.label, 24), x: r3(cl(at.x)), y: r3(cl(at.y)) });
    });
    (Array.isArray(o.routes) ? o.routes : []).slice(0, min ? 1 : 4).forEach((r, i) => {
      const pts = (Array.isArray(r.pts) ? r.pts : []).map(xy).filter(okXY).map(p => ({ x: cl(p.x), y: cl(p.y) }));
      const s = snapRoute(pts).map(p => ({ x: r3(p.x), y: r3(p.y) }));
      if (s.length < 2) return;
      plan.routes.push({ id: 'rai' + i, label: str(r.label, 40) || (i ? 'Route ' + (i + 1) : 'Longest route'), pts: s });
    });
    return plan;
  }
  // the four operating phases, 1 to 3 steps each, as the "Phase | Step | Who" lines the workflow slide reads
  function flowLines(arr) {
    if (!Array.isArray(arr)) return '';
    const rows = arr.map(r => {
      if (typeof r === 'string') { const p = r.split('|').map(s => s.trim()); return { phase: p[0], step: p[1], who: p[2] }; }
      return { phase: str(r && r.phase, 40), step: str(r && r.step, 60), who: str(r && r.who, 90) };
    }).filter(r => r.phase && r.step);
    const lines = [];
    PHASES.forEach(ph => rows.filter(r => r.phase.toLowerCase() === ph.toLowerCase()).slice(0, 3).forEach(r => lines.push([ph, r.step, r.who || ''].join(' | '))));
    return lines.length >= 3 ? lines.join('\n') : '';
  }
  function parseSolution(raw, aspect, opt) {
    const o = AI.jsonOf(raw); if (!o) return null;
    const hints = {}, h = o.hints || {};
    ['aisleM', 'liftMm'].forEach(k => { const v = parseFloat(h[k]); if (v > 0) hints[k] = v; });
    ['rack', 'outdoor', 'noWifi'].forEach(k => { if (h[k] === true) hints[k] = true; });
    return {
      fields: AI.fieldsFrom(o), hints, plan: sanitizePlan(o, opt), flow: flowLines(o.flow),
      assumptions: Array.isArray(o.assumptions) ? o.assumptions.map(a => str(a, 260)).filter(Boolean) : []
    };
  }

  // The scale: the longest route is the distance the client stated, so the picture's real size follows from it.
  function calibrate(plan, aspect, distanceM) {
    const d = parseFloat(distanceM);
    if (!plan || !(d > 0) || !(aspect > 0)) return false;
    const unit = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, m: 1 };   // 1 unit = 1 picture width
    const L = (plan.routes || []).reduce((mx, r) => Math.max(mx, C.routeLengthM(r, unit, aspect)), 0);
    if (!(L > 0)) return false;
    const mPerWidth = d / L;
    plan.scale = { a: { x: 0.04, y: 0.95 }, b: { x: 0.29, y: 0.95 }, m: +(0.25 * mPerWidth).toFixed(2), assumed: true };
    return true;
  }

  /* ---------- the picture Claude sees ---------- */
  function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('The layout picture could not be read.')); im.src = src; }); }
  // A clean copy and a copy with a pink grid every 0.1 (labelled), scaled so the long side is 1400 px (small pictures are enlarged, so the
  // grid labels stay small against what is drawn).
  async function pictures(src) {
    const im = await loadImage(src), k = Math.min(3, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    const mk = grid => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
      if (grid) {
        const fs = Math.max(11, Math.round(Math.min(w, h) / 52));
        g.font = `700 ${fs}px Arial`; g.textBaseline = 'middle'; g.textAlign = 'center';
        for (let i = 1; i < 20; i++) {
          const major = i % 2 === 0, t = i / 20, X = Math.round(t * w), Y = Math.round(t * h);
          g.strokeStyle = major ? 'rgba(255,0,150,.75)' : 'rgba(255,0,150,.3)'; g.lineWidth = major ? 1.5 : 1; g.setLineDash(major ? [] : [4, 5]);
          g.beginPath(); g.moveTo(X, 0); g.lineTo(X, h); g.stroke(); g.beginPath(); g.moveTo(0, Y); g.lineTo(w, Y); g.stroke();
          if (major) {
            const lab = (t).toFixed(1);
            [[X, fs * 0.8], [X, h - fs * 0.8], [fs * 1.3, Y], [w - fs * 1.3, Y]].forEach(([px, py]) => {
              const tw = g.measureText(lab).width + 6; g.setLineDash([]); g.fillStyle = 'rgba(255,0,150,.92)'; g.fillRect(px - tw / 2, py - fs * 0.62, tw, fs * 1.24);
              g.fillStyle = '#fff'; g.fillText(lab, px, py + 1);
            });
          }
        }
      }
      return c.toDataURL('image/jpeg', 0.88).split(',')[1];
    };
    // the walls: the picture reduced to free floor (white) and walls, machines and text (black). A door is a gap in a thin wall line. The same reading is used
    // afterwards to check Claude's route (js/floor.js).
    let floor = null, walls = null;
    try {
      if (root.WFCFloor) {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const gx = c.getContext('2d', { willReadFrequently: true }); gx.fillStyle = '#fff'; gx.fillRect(0, 0, c.width, c.height); gx.drawImage(im, 0, 0);
        floor = root.WFCFloor.grid(gx.getImageData(0, 0, c.width, c.height));
        const wm = root.WFCFloor.wallMap(floor), c2 = document.createElement('canvas'); c2.width = floor.w; c2.height = floor.h; c2.getContext('2d').putImageData(new ImageData(wm.data, floor.w, floor.h), 0, 0);
        const c3 = document.createElement('canvas'); c3.width = w; c3.height = h; const g3 = c3.getContext('2d'); g3.imageSmoothingEnabled = false; g3.drawImage(c2, 0, 0, w, h);
        walls = c3.toDataURL('image/png').split(',')[1];
      }
    } catch (e) { floor = null; walls = null; }
    return { clean: mk(false), grid: mk(true), walls, floor, w, h };
  }

  /* ---------- the question ---------- */
  function buildPrompt(o) {
    const models = (o.models || []).map(m => `- ${m.name} (${m.type}, ${m.payloadKg} kg, lift ${m.liftMm} mm${m.aisleM ? ', aisle ' + m.aisleM + ' m' : ''}${m.outdoor ? ', outdoor' : ', indoor only'})`).join('\n');
    const want = (o.want || AI.FIELDS.map(f => f[0])), fields = AI.FIELDS.filter(f => want.includes(f[0])).map(f => `- "${f[0]}": ${f[1]}`).join('\n');
    const redraw = !!o.instruction;
    const system = `You design AMR (autonomous mobile robot) solutions for WFC Systems. You are given a client's project description and a picture of their site layout, and you return ONE JSON object and nothing else.

How to read the picture: coordinates are fractions of the picture, x from 0 (left edge) to 1 (right edge), y from 0 (top) to 1 (bottom), three decimals. You get the picture up to three times: clean; with a pink grid whose lines are labelled in steps of 0.1 (dotted lines in between are 0.05), which is where you read positions from; and as a wall map, the same picture reduced to free floor (white) and walls, machines and text (black). In the wall map a wall is a thin black line and a door is a GAP in a thin black wall line. A room (like a warehouse) is closed by its walls, and the AMR gets in and out only through the gaps.

${redraw ? '' : `Details to read from the description (leave a field out when the description does not say it, never invent numbers):
${fields || '(none needed)'}

`}What to draw, using the names printed on the picture for labels:
- "zones": boxes {"kind":"pickup"|"drop","label":"...","box":[x,y,w,h]}: one "pickup" box round the area the pallets are collected from, one "drop" box round the drop-off area (the room or marked area with the drop-off label). Keep each box tight on the printed areas and on the walls round the room; do not stretch a box over floor that belongs to something else. ("zone" is only for an area the user asks for.)
- "points": {"kind":"pick"|"spot"|"callbox"|"door"|"charger"|"standby","label":"...","at":[x,y]}. "pick": one numbered point per pick-up station (labels "1","2",...), on the edge of the station that faces the aisle the AMR drives along. "spot": the lettered drop-off spots (A, B, C...) inside the drop-off area, in the order the description gives, and exactly where the description puts them: "in a row along the bottom of the warehouse" means a row of evenly spaced spots along the BOTTOM wall of the drop-off area (never the top), side by side in one straight row, not stacked. "callbox": only if the user asks for one. "door": the door the AMR uses to enter and leave the drop-off area (or any other door or gate the route passes through). Put it exactly on the gap in the wall in the wall map, on the wall the description names ("entered from the right side" = the gap in the right-hand wall), never in the middle of a room or on a solid wall. "charger" and "standby": a charging place and a waiting place for the AMR on free floor near the drop-off, only if the description says the AMR charges or waits there (at most one of each).
- "routes": [{"label":"Longest route","pts":[[x,y],...]}]. The AMR's driving path from the farthest pick-up point to the farthest drop-off spot (this one sets the cycle time, label it "Longest route"). The path follows the centre of free aisles and open floor in straight segments with 90-degree turns, with as few turns as possible. It never crosses machines, coloured production blocks, racks or walls drawn in the picture. The last point is at the drop-off spot (the arrowhead is drawn there). The route leaves the drop-off area only through its door: from the spot it first drives to the door and out through the gap, and it never crosses a wall (a thin black line in the wall map) or a black block. Draw this one route only.
- The map must stay clean and simple: lines, boxes and dots only. Draw exactly what is listed above and nothing else: no call boxes, no no-go areas, no extra routes. Put anything else (call boxes, forbidden areas, rules) in "flow" or "assumptions" as words, because the words go in a legend, not on the map. When the user asks for something extra, draw it.
- Obey every rule the description states (one-way routes, doors to use, areas to avoid, where to charge or wait). When the description names a path, follow it.
${redraw ? '' : `- "flow": the operating flow as steps {"phase":"...","step":"...","who":"..."}. Put every step in the right phase, in the order things happen: "Demand trigger" = the pallet is ready and the operator calls (call box); "Packaging and load" = the line loads the pallet and the system assigns the nearest free AMR; "Smart transit" = everything the AMR does from leaving standby to reaching the drop-off (go to the pick-up point, collect the pallet, drive, enter the drop-off area); "Release and return" = drop at the spot, return to standby, charge. 1 to 3 steps in each phase, in that order, 3 to 10 steps in all. Use the description's own wording. "step" is at most 6 words; "who" is at most 3 words naming who acts (for example "Operator", "AMR", "RCS").
- "hints": {"aisleM": narrowest aisle in metres if stated, "liftMm": rack or lift height in mm if stated, "rack": true if racking is involved, "outdoor": true if outdoors or on uneven floor, "noWifi": true if the site has no WiFi}. Only include what the description says.
`}- "assumptions": short sentences naming anything you had to guess or that the picture does not show clearly (for example where a route passes if no aisle is visible). The user will check these.

AMR models available:
${models}

Return exactly:
{${redraw ? '' : '"fields":{"<field>":{"value":<number or string>,"evidence":"<up to 12 words from the description>"}},"hints":{},'}"zones":[],"points":[],"routes":[]${redraw ? '' : ',"flow":[]'},"assumptions":[]}`;
    let user = `Project description:\n\n${String(o.text || '').slice(0, 30000)}`;
    if (o.known && o.known.length) user += `\n\nAlready read from the description (do not repeat): ${o.known.map(k => k.path + ' = ' + k.value).join('; ')}.`;
    if (redraw) user += `\n\nThe current drawing (same format as your answer): ${JSON.stringify(o.current || {})}\n\nChange requested by the user: ${String(o.instruction).slice(0, 1500)}\nKeep everything the user did not ask to change, and return the complete drawing.`;
    return { system, user };
  }

  async function solve(opt) {
    const c = await AI.client(opt.apiKey), p = buildPrompt(opt), content = [];
    let pic = null;
    if (opt.layout) {
      pic = await pictures(opt.layout);
      content.push({ type: 'text', text: 'Picture 1: the site layout, clean.' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: pic.clean } },
        { type: 'text', text: 'Picture 2: the same layout with the labelled grid.' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: pic.grid } });
      if (pic.walls) content.push({ type: 'text', text: 'Picture 3: the same layout as a wall map: free floor white, walls, machines and text black. Doors are gaps in thin wall lines.' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pic.walls } });
    }
    content.push({ type: 'text', text: p.user });
    const model = opt.model || 'claude-opus-5-5';
    // These models think by default, and thinking counts against max_tokens, so leave plenty of room for the answer itself
    const body = { model, max_tokens: opt.layout ? 16000 : 8000, system: p.system, output_config: { effort: opt.layout ? 'medium' : 'low' }, messages: [{ role: 'user', content }] };
    let res;
    try { res = await c.messages.create(body); }
    catch (e) { if (e && e.status === 400 && /effort|output_config/i.test(e.message || '')) { delete body.output_config; res = await c.messages.create(body); } else throw e; }
    const spent = AI.cost(model, res.usage); AI.record(spent);   // counted even if the answer turns out unusable: it was billed
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to read this.');
    const txt = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const out = parseSolution(txt, opt.aspect, { minimal: !opt.instruction });
    if (!out) throw new Error('Claude answered, but not in a form the tool could read.');
    // a route through a wall is redrawn along open floor and the door is put where the route goes through the wall (the picture's own walls decide)
    if (pic && pic.floor && root.WFCFloor) {
      try { const fx = root.WFCFloor.refine(out.plan, pic.floor, opt.aspect); out.plan = fx.plan; (fx.notes || []).forEach(t => out.assumptions.push(t)); } catch (e) { /* keep Claude's drawing as it is */ }
    }
    out.usage = res.usage; out.costRM = spent;
    return out;
  }

  // the current drawing in the same compact form Claude answers in (sent along when the user asks for a change)
  function describe(plan) {
    plan = plan || {};
    return {
      zones: (plan.zones || []).map(z => ({ kind: z.kind, label: z.label || '', box: [r3(z.x), r3(z.y), r3(z.w), r3(z.h)] })),
      points: (plan.points || []).map(p => ({ kind: p.kind, label: p.label || '', at: [r3(p.x), r3(p.y)] })),
      routes: (plan.routes || []).map(r => ({ label: r.label || '', pts: (r.pts || []).map(q => [r3(q.x), r3(q.y)]) }))
    };
  }

  const API = { parseSolution, sanitizePlan, snapRoute, flowLines, calibrate, describe, buildPrompt, pictures, solve, PHASES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCPlanAI = API;
})(typeof window !== 'undefined' ? window : globalThis);
