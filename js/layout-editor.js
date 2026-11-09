/* WFC Proposal Builder: layout editor. Draw and edit areas, points, routes and the scale on top of the site layout image.
   Everything is stored as fractions of the image (x of the width, y of the height), see WFCCalc.planUnit.
   The drawing itself is WFCSlides.planSvgInner, so the editor and the slide always look the same. */
(function (root) {
  'use strict';
  const SL = root.WFCSlides, C = root.WFCCalc, esc = SL.esc, KINDS = SL.POINT_KINDS;
  const TOOLS = [
    ['select', 'Select', 'Click an item to select it and drag to move it. Double-click a route to add a bend.'],
    ['pickup', 'Pick-up', 'Drag a box over the pick-up area.'],
    ['drop', 'Drop-off', 'Drag a box over the drop-off area.'],
    ['zone', 'Area', 'Drag a box, for example over a charging or no-go area.'],
    ['pick', 'Pick-up point', 'Click on each pick-up station. They are numbered 1, 2, 3… and you can retype the number.'],
    ['spot', 'Spot', 'Click on each drop-off spot. They are lettered A, B, C… and you can retype the letter.'],
    ['callbox', 'Call box', 'Click where the call box is.'],
    ['door', 'Door', 'Click where the door or gate is.'],
    ['charger', 'Charger', 'Click where the charger is.'],
    ['standby', 'Standby', 'Click where the AMR waits.'],
    ['route', 'Route', 'Click each corner of the route. Double-click (or press Enter) on the last corner to finish.'],
    ['scale', 'Scale', 'Click two points on the map whose real distance you know, for example the length of a wall.']
  ];
  const AREA_NAME = { pickup: 'Pick-up area', drop: 'Drop-off area', zone: 'Area' };
  const cl = v => Math.max(0, Math.min(1, v));
  const byId = (arr, id) => (arr || []).find(x => x.id === id);
  let ctx = null, host = null, svg = null, stage = null, info = null, plan = null, aspect = 1, cw = 0, ch = 0, ro = null;
  let tool = 'select', sel = null, drag = null, draft = null, pending = null, hist = [], nid = 0, tries = 0;

  const newId = pre => pre + Date.now().toString(36) + (nid++);
  const snapshot = () => { hist.push(JSON.stringify(plan)); if (hist.length > 60) hist.shift(); };
  const changed = () => { if (ctx) ctx.onChange(); };
  function find(s) { if (!s) return null; return s.type === 'zone' ? byId(plan.zones, s.id) : s.type === 'point' ? byId(plan.points, s.id) : s.type === 'route' ? byId(plan.routes, s.id) : null; }
  function capture(e) { try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already gone */ } }
  function pt(e) { const r = svg.getBoundingClientRect(); return { x: cl((e.clientX - r.left) / r.width), y: cl((e.clientY - r.top) / r.height) }; }

  /* ---------- open / close ---------- */
  function open(c) {
    ctx = c; host = c.host; plan = c.getPlan();
    ['zones', 'points', 'routes'].forEach(k => { if (!Array.isArray(plan[k])) plan[k] = []; });
    if (plan.scale === undefined) plan.scale = null;
    if (plan.sync === undefined) plan.sync = true;
    tool = 'select'; sel = null; drag = null; draft = null; pending = null; hist = [];
    aspect = c.getAspect();
    if (!aspect) {   // the picture is still being measured
      host.innerHTML = '<div class="einfo">Loading the picture…</div>';
      if (tries++ < 20) setTimeout(() => { if (ctx === c) open(c); }, 150);
      return;
    }
    tries = 0;
    host.innerHTML = `<div class="ebar"><button class="btn" data-e="close" title="Back to the slide">‹ Back</button>
      <div class="etools">${TOOLS.map((t, i) => `${i === 1 || i === 6 || i === 10 ? '<span class="esep"></span>' : ''}<button class="etool" data-tool="${t[0]}" title="${esc(t[2])}">${t[1]}</button>`).join('')}</div>
      <div class="sp"></div>${c.ai ? `<button class="btn ai${c.ai.available() ? '' : ' off'}" data-e="ai" title="${c.ai.available() ? 'Let Claude draw or change the plan from the description' : 'Connect Claude first'}">✦ Draw with AI</button>` : ''}<button class="btn" data-e="undo" title="Undo (Ctrl+Z)">Undo</button></div>
      <div class="eai" hidden><input id="eAiText" placeholder="Optional: tell Claude what to draw or change, e.g. “route through the north door” or “add a charger next to spot C”"><button class="btn primary" data-e="aiRun">Draw</button><span id="eAiMsg" class="hint"></span></div>
      <div class="ecanvas"><div class="estage"><img alt="Site layout" draggable="false"><svg></svg></div></div>
      <div class="einfo"></div>`;
    stage = host.querySelector('.estage'); svg = host.querySelector('svg'); info = host.querySelector('.einfo');
    host.querySelector('img').src = c.getImage();
    host.addEventListener('click', onHostClick);
    host.addEventListener('input', onHostInput);
    host.addEventListener('change', onHostInput);
    svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp); svg.addEventListener('pointercancel', onUp); svg.addEventListener('dblclick', onDbl);
    document.addEventListener('keydown', onKey);
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host.querySelector('.ecanvas')); } else window.addEventListener('resize', fit);
    fit(); renderInfo();
  }
  function close() {
    if (!ctx) return;
    document.removeEventListener('keydown', onKey);
    if (ro) { ro.disconnect(); ro = null; } else window.removeEventListener('resize', fit);
    if (host) { host.removeEventListener('click', onHostClick); host.removeEventListener('input', onHostInput); host.removeEventListener('change', onHostInput); host.innerHTML = ''; }
    ctx = null; host = null; svg = null; stage = null; info = null; plan = null;
  }

  function fit() {
    if (!host || !stage) return;
    const box = host.querySelector('.ecanvas'), W = box.clientWidth - 24, H = box.clientHeight - 24;
    if (W < 50 || H < 50) return;
    cw = Math.min(W, H * aspect); ch = cw / aspect;
    stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
    svg.setAttribute('width', cw); svg.setAttribute('height', ch); svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
    redraw();
  }
  function redraw() {
    if (!svg || !cw) return;
    svg.innerHTML = SL.planSvgInner(plan, cw, ch, { aspect, legend: ctx.getLegend(), edit: { sel, draft, pending } });
    svg.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }

  /* ---------- information bar ---------- */
  function renderInfo() {
    if (!info) return;
    host.querySelectorAll('.etool').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    const t = TOOLS.find(x => x[0] === tool), unit = C.planUnit(plan.scale, aspect), longest = C.planLongestM(plan, aspect);
    let h = '';
    if (tool === 'scale' && pending && pending.length === 2) {
      h = `<div class="erow"><b>Set scale</b><label for="eScaleM">Real distance between the two green points</label><input type="number" id="eScaleM" min="0" step="any" placeholder="metres" value="${plan.scale && plan.scale.m ? plan.scale.m : ''}"><span>m</span><button class="btn primary" data-e="applyScale">Apply</button><button class="btn" data-e="cancel">Cancel</button></div>`;
    } else if (tool !== 'select') {
      h = `<div class="erow"><b>${t[1]}</b><span class="hint">${t[2]}</span>${tool === 'route' && draft && draft.pts.length >= 2 ? '<button class="btn primary" data-e="finish">Finish route</button>' : ''}<button class="btn" data-e="cancel">Cancel</button></div>`;
    } else if (sel && sel.type === 'scale' && plan.scale) {
      h = `<div class="erow"><b>Scale</b><label for="eScaleEdit">Real distance between the two green points</label><input type="number" id="eScaleEdit" min="0" step="any" value="${plan.scale.m || ''}"><span>m</span><button class="btn" data-e="delete">Delete scale</button></div>`;
    } else if (sel && find(sel)) {
      const it = find(sel), kind = sel.type === 'zone' ? (AREA_NAME[it.kind] || 'Area') : sel.type === 'point' ? (KINDS[it.kind] || [0, 'Point'])[1] : 'Route';
      const len = sel.type === 'route' && unit > 0 ? `<span class="hint">${Math.round(C.routeLengthM(it, plan.scale, aspect))} m</span>` : '';
      h = `<div class="erow"><b>${kind}</b><label for="eLabel">Label on the slide</label><input id="eLabel" value="${esc(it.label || '')}" placeholder="Name">${len}<button class="btn" data-e="delete">${sel.type === 'route' && sel.v != null && it.pts.length > 2 ? 'Delete corner' : 'Delete'}</button></div>`;
    } else {
      const has = plan.zones.length || plan.points.length || plan.routes.length || plan.scale;
      h = `<div class="erow">${unit > 0 ? `<span>Scale set: <b>${plan.scale.m} m</b> between the green points.</span>` : '<span class="eneed">Scale not set. Use “Scale” so routes show their length in metres.</span>'}`
        + (longest > 0 ? `<span>Longest route <b>${Math.round(longest)} m</b></span><label class="esync"><input type="checkbox" id="eSync" ${plan.sync ? 'checked' : ''}> Use it as the route distance in the fleet size</label>` : '')
        + (!has ? '<span class="hint">Pick a tool above and draw on the map.</span>' : '')
        + (has ? '<button class="btn" data-e="clear">Clear all</button>' : '') + '</div>';
    }
    info.innerHTML = h;
  }
  function focusLabel() { setTimeout(() => { const i = info && info.querySelector('#eLabel'); if (i) { i.focus(); i.select(); } }, 30); }

  /* ---------- actions ---------- */
  function setTool(t) { tool = t; draft = null; pending = null; if (t !== 'select') sel = null; renderInfo(); redraw(); }
  function undo() {
    const j = hist.pop(); if (!j) return;
    Object.keys(plan).forEach(k => delete plan[k]); Object.assign(plan, JSON.parse(j));
    sel = null; draft = null; pending = null; tool = 'select'; changed(); renderInfo(); redraw();
  }
  function deleteSel() {
    if (!sel) return;
    snapshot();
    if (sel.type === 'scale') plan.scale = null;
    else if (sel.type === 'route') { const r = find(sel); if (r && sel.v != null && r.pts.length > 2) { r.pts.splice(sel.v, 1); sel = { type: 'route', id: r.id, v: null }; changed(); renderInfo(); redraw(); return; } plan.routes = plan.routes.filter(x => x.id !== sel.id); }
    else if (sel.type === 'zone') plan.zones = plan.zones.filter(x => x.id !== sel.id);
    else if (sel.type === 'point') plan.points = plan.points.filter(x => x.id !== sel.id);
    sel = null; changed(); renderInfo(); redraw();
  }
  function finishRoute() {
    if (draft && draft.pts.length >= 2) {
      snapshot();
      const r = { id: newId('r'), label: 'Route ' + (plan.routes.length + 1), pts: draft.pts.map(q => ({ x: q.x, y: q.y })) };
      plan.routes.push(r); sel = { type: 'route', id: r.id, v: null }; changed();
    }
    draft = null; tool = 'select'; renderInfo(); redraw(); focusLabel();
  }
  function defaultLabel(kind) {
    const d = ctx.getDefaults();
    if (kind === 'pickup') return d.pickup || 'Pick-up';
    if (kind === 'drop') return d.drop || 'Drop-off';
    if (kind === 'zone') return 'Area';
    const n = plan.points.filter(p => p.kind === kind).length + 1, name = KINDS[kind][1];
    if (kind === 'spot') return String.fromCharCode(64 + ((n - 1) % 26) + 1);
    if (kind === 'pick') return String(n);
    return n > 1 ? `${name} ${n}` : name;
  }
  function distToSeg(p, a, b) {   // pixel space
    const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)) : 0;
    const px = a[0] + t * vx, py = a[1] + t * vy;
    return { d: Math.hypot(p[0] - px, p[1] - py), x: px, y: py };
  }

  /* ---------- pointer ---------- */
  function onDown(e) {
    if (e.button !== 0 || !ctx) return;
    e.preventDefault();
    const p = pt(e);
    if (tool === 'select') {
      const t = e.target.closest('[data-type]');
      if (!t) { sel = null; renderInfo(); redraw(); return; }
      const type = t.dataset.type, id = t.dataset.id, part = e.target.dataset.part || t.dataset.part || 'body', iv = e.target.dataset.i != null ? +e.target.dataset.i : null;
      sel = { type, id, v: part === 'v' ? iv : null };
      const it = type === 'scale' ? plan.scale : find(sel); if (!it) return;
      drag = { type, id, part, i: iv, start: p, snap: JSON.stringify(plan), orig: JSON.parse(JSON.stringify(it)), moved: false };
      capture(e); renderInfo(); redraw(); return;
    }
    if (tool === 'pickup' || tool === 'drop' || tool === 'zone') {
      snapshot();
      const z = { id: newId('z'), kind: tool, label: defaultLabel(tool), x: p.x, y: p.y, w: 0, h: 0 };
      plan.zones.push(z); sel = { type: 'zone', id: z.id, v: null };
      drag = { create: true, type: 'zone', id: z.id, start: p, moved: false };
      capture(e); redraw(); return;
    }
    if (KINDS[tool]) {
      snapshot();
      const pn = { id: newId('p'), kind: tool, label: defaultLabel(tool), x: p.x, y: p.y };
      plan.points.push(pn); sel = { type: 'point', id: pn.id, v: null }; tool = 'select';
      changed(); renderInfo(); redraw(); focusLabel(); return;
    }
    if (tool === 'route') {
      if (!draft) draft = { pts: [] };
      draft.pts.push(p); draft.cursor = p; renderInfo(); redraw(); return;
    }
    if (tool === 'scale') {
      pending = pending && pending.length === 1 ? pending.concat([p]) : [p];
      renderInfo(); redraw();
      if (pending.length === 2) setTimeout(() => { const i = info && info.querySelector('#eScaleM'); if (i) i.focus(); }, 30);
    }
  }
  function onMove(e) {
    if (!ctx) return;
    const p = pt(e);
    if (!drag) { if (tool === 'route' && draft) { draft.cursor = p; redraw(); } return; }
    if (drag.create) {
      const z = byId(plan.zones, drag.id);
      z.x = Math.min(drag.start.x, p.x); z.y = Math.min(drag.start.y, p.y); z.w = Math.abs(p.x - drag.start.x); z.h = Math.abs(p.y - drag.start.y);
      drag.moved = true; redraw(); return;
    }
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved) { if (Math.hypot(dx * cw, dy * ch) < 3) return; hist.push(drag.snap); if (hist.length > 60) hist.shift(); drag.moved = true; }
    const o = drag.orig;
    if (drag.type === 'zone') {
      const z = byId(plan.zones, drag.id);
      if (drag.part === 'body') { z.x = cl(Math.min(o.x + dx, 1 - o.w)); z.y = cl(Math.min(o.y + dy, 1 - o.h)); if (o.x + dx < 0) z.x = 0; if (o.y + dy < 0) z.y = 0; }
      else {
        const west = drag.part.indexOf('w') > -1, north = drag.part.indexOf('n') > -1;
        const ox = west ? o.x + o.w : o.x, oy = north ? o.y + o.h : o.y;               // the corner that stays put
        const mx = cl((west ? o.x : o.x + o.w) + dx), my = cl((north ? o.y : o.y + o.h) + dy);
        z.x = Math.min(ox, mx); z.y = Math.min(oy, my); z.w = Math.max(0.01, Math.abs(mx - ox)); z.h = Math.max(0.01, Math.abs(my - oy));
      }
    } else if (drag.type === 'point') {
      const q = byId(plan.points, drag.id); q.x = cl(o.x + dx); q.y = cl(o.y + dy);
    } else if (drag.type === 'route') {
      const r = byId(plan.routes, drag.id);
      if (drag.part === 'v') r.pts[drag.i] = { x: cl(o.pts[drag.i].x + dx), y: cl(o.pts[drag.i].y + dy) };
      else {
        const xs = o.pts.map(q => q.x), ys = o.pts.map(q => q.y);
        const sx = Math.max(-Math.min.apply(null, xs), Math.min(1 - Math.max.apply(null, xs), dx)), sy = Math.max(-Math.min.apply(null, ys), Math.min(1 - Math.max.apply(null, ys), dy));
        r.pts = o.pts.map(q => ({ x: q.x + sx, y: q.y + sy }));
      }
    } else if (drag.type === 'scale') {
      plan.scale[drag.part] = { x: cl(o[drag.part].x + dx), y: cl(o[drag.part].y + dy) };
    }
    redraw();
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    if (d.create) {
      const z = byId(plan.zones, d.id);
      if (z.w < 0.012 || z.h < 0.012) { z.w = 0.16; z.h = 0.1; z.x = Math.min(Math.max(0, d.start.x - 0.08), 1 - z.w); z.y = Math.min(Math.max(0, d.start.y - 0.05), 1 - z.h); }
      tool = 'select'; changed(); renderInfo(); redraw(); focusLabel(); return;
    }
    if (d.moved) changed();
    renderInfo(); redraw();
  }
  function onDbl(e) {
    if (!ctx) return;
    if (tool === 'route' && draft) { draft.pts.pop(); finishRoute(); return; }   // the second click of the double-click added a duplicate corner
    // the picture is redrawn on every press, so look at what is under the pointer now instead of trusting e.target
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (tool !== 'select' || !hit || hit.dataset.part !== 'line') return;
    const g = hit.closest('[data-type="route"]'), r = g && byId(plan.routes, g.dataset.id); if (!r) return;
    const p = pt(e), pp = [p.x * cw, p.y * ch], px = r.pts.map(q => [q.x * cw, q.y * ch]);
    let best = null;
    for (let i = 1; i < px.length; i++) { const s = distToSeg(pp, px[i - 1], px[i]); if (!best || s.d < best.d) best = { d: s.d, i, x: s.x, y: s.y }; }
    if (!best) return;
    snapshot(); r.pts.splice(best.i, 0, { x: cl(best.x / cw), y: cl(best.y / ch) });
    sel = { type: 'route', id: r.id, v: best.i }; changed(); renderInfo(); redraw();
  }

  /* ---------- buttons, fields, keys ---------- */
  function onHostClick(e) {
    const tl = e.target.closest('[data-tool]'); if (tl) { setTool(tl.dataset.tool); return; }
    const b = e.target.closest('[data-e]'); if (!b) return;
    const a = b.dataset.e;
    if (a === 'close') ctx.onClose();
    else if (a === 'undo') undo();
    else if (a === 'delete') deleteSel();
    else if (a === 'cancel') setTool('select');
    else if (a === 'finish') finishRoute();
    else if (a === 'clear') { if (confirm('Remove everything drawn on this layout?')) { snapshot(); plan.zones = []; plan.points = []; plan.routes = []; plan.scale = null; sel = null; changed(); renderInfo(); redraw(); } }
    else if (a === 'applyScale') applyScale();
    else if (a === 'ai') { const bar = host.querySelector('.eai'); if (!ctx.ai.available()) { ctx.ai.connect(); return; } bar.hidden = !bar.hidden; if (!bar.hidden) host.querySelector('#eAiText').focus(); }
    else if (a === 'aiRun') runAI();
  }
  // Claude draws or changes the plan; the result replaces the areas, points and routes (Undo brings the old ones back)
  async function runAI() {
    const c = ctx, inp = host.querySelector('#eAiText'), msg = host.querySelector('#eAiMsg'), btn = host.querySelector('[data-e=aiRun]');
    btn.disabled = true; msg.textContent = 'Claude is looking at the layout…';
    try {
      const res = await c.ai.run(inp.value.trim(), JSON.parse(JSON.stringify(plan)));
      if (ctx !== c || !plan) return;   // the editor was closed meanwhile
      snapshot();
      plan.zones = res.plan.zones; plan.points = res.plan.points; plan.routes = res.plan.routes;
      if (res.plan.scale) plan.scale = res.plan.scale;
      sel = null; draft = null; pending = null; tool = 'select'; changed(); renderInfo(); redraw();
      msg.textContent = res.note || 'Done. Move anything that is not quite right, or press Undo.'; inp.value = '';
    } catch (e) { if (ctx === c) msg.textContent = c.ai.explain ? c.ai.explain(e) : ((e && e.message) || String(e)); }
    if (ctx === c) btn.disabled = false;
  }
  function applyScale() {
    const i = info.querySelector('#eScaleM'), m = i ? parseFloat(i.value) : 0;
    if (!(m > 0) || !pending || pending.length < 2) { if (i) i.focus(); return; }
    snapshot(); plan.scale = { a: pending[0], b: pending[1], m }; pending = null; tool = 'select'; sel = null; changed(); renderInfo(); redraw();
  }
  function onHostInput(e) {
    const t = e.target;
    if (t.id === 'eLabel') { const it = find(sel); if (it) { it.label = t.value; changed(); redraw(); } }
    else if (t.id === 'eScaleEdit') { if (plan.scale) { plan.scale.m = parseFloat(t.value) || 0; changed(); redraw(); } }
    else if (t.id === 'eSync' && e.type === 'change') { plan.sync = t.checked; changed(); }
  }
  function onKey(e) {
    if (!ctx) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '');
    if (e.key === 'Enter' && e.target.id === 'eScaleM') { e.preventDefault(); applyScale(); return; }
    if (e.key === 'Enter' && e.target.id === 'eAiText') { e.preventDefault(); runAI(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') { if (tool !== 'select') setTool('select'); else { sel = null; renderInfo(); redraw(); } }
    else if (e.key === 'Enter' && tool === 'route') { e.preventDefault(); finishRoute(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSel(); }
  }

  root.WFCLayoutEditor = { open, close, isOpen: () => !!ctx };
})(window);
