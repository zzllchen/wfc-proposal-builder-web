/* WFC Proposal Builder: slide templates. Each slide returns an HTML string for a 1920 x 1080 canvas styled by css/app.css.
   WFCSlides.build(state, derived) -> [{ id, name, html, noFoot, style }] */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = v => Math.round(v).toLocaleString('en-US');
  const n1 = v => (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n2 = v => (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rm = v => 'RM ' + (Math.abs(v - Math.round(v)) < 0.005 ? n0(v) : n2(v));
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const plural = (n, a, b) => n === 1 ? a : b;
  const IMG = () => root.WFC_IMG || {};
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function longDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : (iso || ''); }

  const head = (eye, title) => `<div class="head"><p class="eyebrow">${esc(eye)}</p><h2>${esc(title)}</h2></div>`;
  const ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>'
  };
    const ICON2 = {
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></svg>',
    headset: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>',
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>',
    deploy: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    handover: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
    support: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/></svg>'
  };
  const icon = k => `<div class="icon">${ICON[k] || ICON2[k]}</div>`;
  const kv = (label, value) => `<div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--line);padding-top:12px"><span class="t24 lbl">${label}</span><span class="t24 b" style="text-align:right">${value}</span></div>`;
  const kvStack = (label, value) => `<div class="col gap8" style="border-top:1px solid var(--line);padding-top:12px"><span class="t24 lbl">${label}</span><span class="t24 b">${value}</span></div>`;

  function parseWorkflow(text) {
    // lines: "Phase | Step | Who"; consecutive lines with the same phase share a column
    const phases = []; let n = 0;
    String(text || '').split(/\r?\n/).forEach(line => {
      const p = line.split('|').map(s => s.trim());
      if (!p[0] || !p[1]) return;
      let ph = phases[phases.length - 1];
      if (!ph || ph.name !== p[0]) { ph = { name: p[0], steps: [] }; phases.push(ph); }
      ph.steps.push({ n: ++n, title: p[1], who: p[2] || '' });
    });
    return phases;
  }

  // Stacked timeline for one AMR across the operating day
  function timelineSvg(segs, H) {
    const W = 1500, x0 = 0, bw = W, y = 8, h = 44;
    const px = t => x0 + (t / H) * bw;
    const colors = { ready: '#204CBA', charge: '#0B1220', swap: '#8FB0F5' };
    let s = `<svg viewBox="0 0 ${W} 100" width="${W}" height="100" style="display:block">`;
    s += `<rect x="0" y="${y}" width="${W}" height="${h}" rx="10" fill="#E3EAF8"/>`;
    segs.forEach(g => {
      const w = Math.max(px(g.to) - px(g.from), g.kind === 'swap' ? 6 : 0);
      s += `<rect x="${px(g.from)}" y="${y}" width="${w}" height="${h}" fill="${colors[g.kind]}"/>`;
    });
    const step = H > 16 ? 4 : 2;
    for (let t = 0; t <= H + 1e-9; t += step) {
      const x = Math.min(px(t), W - 1);
      s += `<line x1="${x}" y1="${y + h}" x2="${x}" y2="${y + h + 10}" stroke="#5B6577" stroke-width="2"/>`;
      s += `<text x="${t === 0 ? 0 : (t >= H ? W : x)}" y="${y + h + 38}" font-size="24" fill="#5B6577" text-anchor="${t === 0 ? 'start' : (t >= H ? 'end' : 'middle')}" font-family="DM Sans, Arial">${t}h</text>`;
    }
    return s + '</svg>';
  }

  /* ---- Site layout plan: zones, points and routes drawn over the layout image (the slide and the layout editor share this) ---- */
  const POINT_KINDS = { pick: ['', 'Pick-up point', 'Pick-up points'], callbox: ['C', 'Call box', 'Call boxes'], door: ['D', 'Door', 'Doors'], charger: ['CH', 'Charger', 'Chargers'], standby: ['S', 'Standby', 'Standby spots'], spot: ['', 'Drop-off spot', 'Drop-off spots'] };   // spot: a lettered square (A, B, C) in the drop-off colour; pick: a numbered circle (1, 2, 3) in the pick-up colour
  const POINT_STYLE = { callbox: ['#204CBA', '#fff', '#fff'], door: ['#0B1220', '#fff', '#fff'], charger: ['#8FB0F5', '#0B1220', '#fff'], standby: ['#fff', '#0B1220', '#0B1220'] };   // fill, letter, ring
  const planColors = legend => legend === 'map' ? { pickup: '#E5322D', drop: '#F28C28', zone: '#5B6577', route: '#204CBA' } : { pickup: '#2F5BD0', drop: '#3A4766', zone: '#8A94A8', route: '#2F5BD0' };
  const SCALE_GREEN = '#0F7B4B';
  // markers are small icons on a soft tint, so the map needs no letters: [tint, icon colour, drawing on a 24 x 24 grid]
  const MARK = {
    door: ['#E6EBF5', '#3A4766', '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M3.5 21h17"/><path d="M14.5 12.2v.6" stroke-width="3"/>'],
    standby: ['#DDE7FB', '#2F5BD0', '<path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>'],
    charger: ['#DDF3E6', '#1E8A55', '<path d="M13 2.5L4.5 13.5H11l-1 8L19.5 10H13z"/>'],
    callbox: ['#E6EBF5', '#3A4766', '<path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5"/><path d="M13.8 20.5a2 2 0 0 1-3.6 0"/>']
  };
  const markIcon = (kind, cx, cy, size) => `<g transform="translate(${Math.round((cx - size / 2) * 10) / 10} ${Math.round((cy - size / 2) * 10) / 10}) scale(${Math.round(size / 24 * 1000) / 1000})" fill="none" stroke="${MARK[kind][1]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pointer-events="none">${MARK[kind][2]}</g>`;

  // o: { k (size factor, 1 = an 880 px wide image), aspect, legend, edit: { sel, draft, pending } }. Returns the inside of an <svg> w x h px.
  function planSvgInner(plan, w, h, o) {
    o = o || {};
    plan = plan || {};
    const k = o.k || (w / 880), asp = o.aspect || (w / h), cols = planColors(o.legend), ed = o.edit || null, Cc = root.WFCCalc;
    const X = x => x * w, Y = y => y * h, f = v => Math.round(v * 10) / 10, ff = 'font-family="DM Sans, Arial, sans-serif"';
    const sel = ed && ed.sel;
    let s = '';
    const pill = (x, y, text, fs, fill, color, stroke) => {
      const tw = String(text).length * fs * 0.58 + fs, th = fs * 1.55;
      const x0 = Math.max(2, Math.min(w - tw - 2, x)), y0 = Math.max(2, Math.min(h - th - 2, y - th / 2));
      return `<g pointer-events="none"><rect x="${f(x0)}" y="${f(y0)}" width="${f(tw)}" height="${f(th)}" rx="${f(th / 2)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${f(1.5 * k)}"` : ''}/><text x="${f(x0 + tw / 2)}" y="${f(y0 + th / 2 + fs * 0.35)}" font-size="${f(fs)}" font-weight="700" text-anchor="middle" fill="${color}" ${ff}>${esc(text)}</text></g>`;
    };
    const dot = (x, y, r, fill, stroke, attrs) => `<circle ${attrs || ''} cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(3 * k)}"/>`;

    // areas
    (plan.zones || []).forEach(z => {
      const c = cols[z.kind] || cols.zone;
      s += `<rect data-type="zone" data-id="${z.id}" data-part="body" x="${f(X(z.x))}" y="${f(Y(z.y))}" width="${f(X(z.w))}" height="${f(Y(z.h))}" rx="${f(6 * k)}" fill="${c}" fill-opacity=".09" stroke="${c}" stroke-width="${f(3 * k)}"/>`;
    });
    // routes
    const labels = [];
    // on the slide only the longest route is drawn (the editor shows them all); extra routes would only add clutter
    const plen = r => (r.pts || []).reduce((a, p, i, arr) => i ? a + Math.hypot((p.x - arr[i - 1].x) * w, (p.y - arr[i - 1].y) * h) : 0, 0);
    const routeList = (plan.routes || []).filter(r => (r.pts || []).length > 1), routes = ed || routeList.length < 2 ? (plan.routes || []) : [routeList.reduce((a, b) => plen(b) > plen(a) ? b : a)];
    routes.forEach(r => {
      const pts = (r.pts || []).map(p => [X(p.x), Y(p.y)]); if (pts.length < 2) return;
      const d = pts.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ' ' + f(p[1])).join(' ');
      s += `<g data-type="route" data-id="${r.id}"><path data-part="line" d="${d}" fill="none" stroke="transparent" stroke-width="${f(24 * k)}" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="${d}" fill="none" stroke="#fff" stroke-width="${f(10 * k)}" stroke-linecap="round" stroke-linejoin="round" opacity=".9" pointer-events="none"/>`
        + `<path d="${d}" fill="none" stroke="${cols.route}" stroke-width="${f(5 * k)}" stroke-dasharray="${f(2 * k)} ${f(10 * k)}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
      const a = pts[pts.length - 1], b = pts[pts.length - 2], ang = Math.atan2(a[1] - b[1], a[0] - b[0]), L = 18 * k, ca = Math.cos(ang), sa = Math.sin(ang);
      const tri = [[a[0], a[1]], [a[0] - L * ca + L * 0.55 * sa, a[1] - L * sa - L * 0.55 * ca], [a[0] - L * ca - L * 0.55 * sa, a[1] - L * sa + L * 0.55 * ca]];
      s += `<polygon points="${tri.map(p => f(p[0]) + ',' + f(p[1])).join(' ')}" fill="${cols.route}" stroke="#fff" stroke-width="${f(2 * k)}" stroke-linejoin="round" pointer-events="none"/>`
        + dot(pts[0][0], pts[0][1], 6 * k, '#fff', cols.route, 'pointer-events="none"') + '</g>';
      const seg = i => Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      let total = 0; for (let i = 1; i < pts.length; i++) total += seg(i);
      let acc = 0, mid = pts[0];
      for (let i = 1; i < pts.length; i++) { const g = seg(i); if (acc + g >= total / 2) { const t = (total / 2 - acc) / (g || 1); mid = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; break; } acc += g; }
      const m = Cc ? Cc.routeLengthM(r, plan.scale, asp) : 0, txt = [r.label, m > 0 ? Math.round(m) + ' m' : ''].filter(Boolean).join(' · ');
      if (txt) labels.push([mid, txt, r]);
    });
    // points
    // a call box at every station would only add clutter on the slide: the legend says so instead
    const callCount = (plan.points || []).filter(p => p.kind === 'callbox').length;
    (plan.points || []).forEach(p => {
      if (!ed && p.kind === 'callbox' && callCount >= 3) return;
      const st = POINT_STYLE[p.kind] || POINT_STYLE.callbox, sym = (POINT_KINDS[p.kind] || ['•'])[0], cx = X(p.x), cy = Y(p.y), two = sym.length > 1;
      if (p.kind === 'pick') {
        const lab = String(p.label || ''), fs = (lab.length > 2 ? 11 : lab.length > 1 ? 14 : 16) * k;
        s += `<g data-type="point" data-id="${p.id}"><circle data-part="body" cx="${f(cx)}" cy="${f(cy)}" r="${f(15 * k)}" fill="${cols.pickup}" stroke="#fff" stroke-width="${f(2.5 * k)}"/><text x="${f(cx)}" y="${f(cy + fs * 0.35)}" font-size="${f(fs)}" font-weight="700" text-anchor="middle" fill="#fff" ${ff} pointer-events="none">${esc(lab)}</text></g>`;
        return;
      }
      if (p.kind === 'spot') {
        const sz = 28 * k;
        s += `<g data-type="point" data-id="${p.id}"><rect data-part="body" x="${f(cx - sz / 2)}" y="${f(cy - sz / 2)}" width="${f(sz)}" height="${f(sz)}" rx="${f(5 * k)}" fill="${cols.drop}" stroke="#fff" stroke-width="${f(2.5 * k)}"/><text x="${f(cx)}" y="${f(cy + 5.5 * k)}" font-size="${f(16 * k)}" font-weight="700" text-anchor="middle" fill="#fff" ${ff} pointer-events="none">${esc(p.label || '')}</text></g>`;
        return;
      }
      if (MARK[p.kind]) { s += `<g data-type="point" data-id="${p.id}"><circle data-part="body" cx="${f(cx)}" cy="${f(cy)}" r="${f(15 * k)}" fill="${MARK[p.kind][0]}" stroke="${MARK[p.kind][1]}" stroke-width="${f(1.8 * k)}"/>${markIcon(p.kind, cx, cy, 18 * k)}</g>`; return; }
      s += `<g data-type="point" data-id="${p.id}">${dot(cx, cy, 15 * k, st[0], st[2], 'data-part="body"')}<text x="${f(cx)}" y="${f(cy + (two ? 4 : 5) * k)}" font-size="${f((two ? 11 : 14) * k)}" font-weight="700" text-anchor="middle" fill="${st[1]}" ${ff} pointer-events="none">${sym}</text></g>`;    });
    // words stay off the map: the legend beside it names everything (only the item being edited shows its name, so it can be told apart)
    const named = it => !!(o.labels || (sel && it && sel.id === it.id));
    (plan.zones || []).forEach(z => { if (z.label && named(z)) s += pill(X(z.x) + 8 * k, Y(z.y), z.label, 17 * k, cols[z.kind] || cols.zone, '#fff'); });
    labels.forEach(([mid, txt, r]) => { if (named(r)) s += pill(mid[0] - (txt.length * 15 * k * 0.58 + 15 * k) / 2, mid[1] - 24 * k, txt, 15 * k, '#fff', cols.route, cols.route); });
    (plan.points || []).forEach(p => { if (p.label && p.kind !== 'spot' && p.kind !== 'pick' && named(p)) s += pill(X(p.x) + 22 * k, Y(p.y), p.label, 15 * k, 'rgba(255,255,255,.94)', '#0B1220', '#C9D3E8'); });

    const u = Cc ? Cc.planUnit(plan.scale, asp) : 0;
    if (u > 0 && !ed && o.scalebar) {   // scale bar: off on the slide, the legend gives the route length
      const raw = u * 0.2, nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].reduce((a, b) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a), bw = nice / u * w, x0 = 18 * k, y0 = h - 20 * k;
      s += `<g pointer-events="none"><rect x="${f(x0 - 10 * k)}" y="${f(y0 - 32 * k)}" width="${f(bw + 20 * k)}" height="${f(46 * k)}" rx="${f(8 * k)}" fill="#fff" opacity=".92"/><path d="M${f(x0)} ${f(y0 - 10 * k)} V${f(y0)} H${f(x0 + bw)} V${f(y0 - 10 * k)}" fill="none" stroke="#0B1220" stroke-width="${f(2.5 * k)}"/><text x="${f(x0 + bw / 2)}" y="${f(y0 - 14 * k)}" font-size="${f(14 * k)}" font-weight="700" text-anchor="middle" fill="#0B1220" ${ff}>${nice} m</text></g>`;
    }

    if (ed) {   // editing aids
      const hs = 12 * k;
      const scl = ed.pending && ed.pending.length ? { a: ed.pending[0], b: ed.pending[1] } : plan.scale;
      if (scl && scl.a) {
        const a = scl.a, b = scl.b;
        if (b) s += `<line x1="${f(X(a.x))}" y1="${f(Y(a.y))}" x2="${f(X(b.x))}" y2="${f(Y(b.y))}" stroke="${SCALE_GREEN}" stroke-width="${f(3 * k)}" stroke-dasharray="${f(8 * k)} ${f(5 * k)}" pointer-events="none"/>`;
        s += dot(X(a.x), Y(a.y), 8 * k, SCALE_GREEN, '#fff', 'data-type="scale" data-id="scale" data-part="a"');
        if (b) s += dot(X(b.x), Y(b.y), 8 * k, SCALE_GREEN, '#fff', 'data-type="scale" data-id="scale" data-part="b"');
        if (b && !(ed.pending && ed.pending.length) && plan.scale && plan.scale.m) s += pill((X(a.x) + X(b.x)) / 2 - 20 * k, (Y(a.y) + Y(b.y)) / 2 - 18 * k, plan.scale.m + ' m', 14 * k, SCALE_GREEN, '#fff');
      }
      if (sel && sel.type === 'zone') {
        const z = (plan.zones || []).find(q => q.id === sel.id);
        if (z) {
          const x = X(z.x), y = Y(z.y), zw = X(z.w), zh = Y(z.h);
          s += `<rect x="${f(x - 3 * k)}" y="${f(y - 3 * k)}" width="${f(zw + 6 * k)}" height="${f(zh + 6 * k)}" fill="none" stroke="#0B1220" stroke-width="${f(1.5 * k)}" stroke-dasharray="${f(5 * k)} ${f(4 * k)}" pointer-events="none"/>`;
          [['nw', x, y], ['ne', x + zw, y], ['sw', x, y + zh], ['se', x + zw, y + zh]].forEach(c => { s += `<rect data-type="zone" data-id="${z.id}" data-part="${c[0]}" x="${f(c[1] - hs / 2)}" y="${f(c[2] - hs / 2)}" width="${f(hs)}" height="${f(hs)}" rx="${f(2 * k)}" fill="#fff" stroke="#0B1220" stroke-width="${f(2 * k)}" style="cursor:${c[0] === 'nw' || c[0] === 'se' ? 'nwse-resize' : 'nesw-resize'}"/>`; });
        }
      } else if (sel && sel.type === 'point') {
        const p = (plan.points || []).find(q => q.id === sel.id);
        if (p) s += `<circle cx="${f(X(p.x))}" cy="${f(Y(p.y))}" r="${f(22 * k)}" fill="none" stroke="#0B1220" stroke-width="${f(1.5 * k)}" stroke-dasharray="${f(5 * k)} ${f(4 * k)}" pointer-events="none"/>`;
      } else if (sel && sel.type === 'route') {
        const r = (plan.routes || []).find(q => q.id === sel.id);
        if (r) (r.pts || []).forEach((p, i) => { s += dot(X(p.x), Y(p.y), 7.5 * k, sel.v === i ? cols.route : '#fff', cols.route, `data-type="route" data-id="${r.id}" data-part="v" data-i="${i}" style="cursor:move"`); });
      }
      if (ed.draft && ed.draft.pts.length) {
        const dp = ed.draft.pts.concat(ed.draft.cursor ? [ed.draft.cursor] : []).map((p, i) => (i ? 'L' : 'M') + f(X(p.x)) + ' ' + f(Y(p.y))).join(' ');
        s += `<path d="${dp}" fill="none" stroke="${cols.route}" stroke-width="${f(4 * k)}" stroke-dasharray="${f(2 * k)} ${f(9 * k)}" stroke-linecap="round" pointer-events="none"/>`;
        ed.draft.pts.forEach(p => { s += dot(X(p.x), Y(p.y), 6 * k, '#fff', cols.route, 'pointer-events="none"'); });
      }
    }
    return s;
  }
  function planSvg(plan, w, h, o) {
    w = Math.round(w); h = Math.round(h);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;pointer-events:none">${planSvgInner(plan, w, h, o)}</svg>`;
  }
  const pointChip = (kind, size) => { const st = POINT_STYLE[kind] || POINT_STYLE.callbox, sym = (POINT_KINDS[kind] || ['•'])[0], mk = MARK[kind]; return mk ? `<svg width="${size || 40}" height="${size || 40}" viewBox="0 0 40 40" style="flex:none"><circle cx="20" cy="20" r="18" fill="${mk[0]}" stroke="${mk[1]}" stroke-width="2"/><g transform="translate(9.5 9.5) scale(.875)" fill="none" stroke="${mk[1]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${mk[2]}</g></svg>` : `<svg width="${size || 40}" height="${size || 40}" viewBox="0 0 40 40" style="flex:none"><circle cx="20" cy="20" r="18" fill="${st[0]}" stroke="${st[2]}" stroke-width="3"/><text x="20" y="${sym.length > 1 ? 25 : 27}" font-size="${sym.length > 1 ? 16 : 20}" font-weight="700" text-anchor="middle" fill="${st[1]}" font-family="DM Sans, Arial">${sym}</text></svg>`; };
  /* ---- The pallet and its crate drawn in isometric view, to the real proportions, with dimension lines. vw x vh px.
     Flat colours only (no gradients or filters), so it prints and scales the same everywhere. ---- */
  function palletDrawing(L, W, H, vw, vh) {
    const ok = L > 0 && W > 0 && H > 0; L = ok ? L : 800; W = ok ? W : 600; H = ok ? H : 520;
    const c = Math.cos(Math.PI / 6), sn = 0.5, m = 0.07 * Math.max(L, W);                              // m = the floor plate's margin round the pallet
    const padL = 90, padR = 130, padT = 12, padB = 82, aw = vw - padL - padR, ah = vh - padT - padB;
    const s = Math.min(aw / ((L + W + 2 * m) * c), ah / ((L + W + 2 * m) * sn + H)), bw = (L + W + 2 * m) * c * s, bh = ((L + W + 2 * m) * sn + H) * s;
    const top = padT + (ah - bh) / 2, ox = padL + (aw - bw) / 2 + (W + m) * c * s, oy = top + ((L + W) * sn + H) * s;   // oy, ox: the front, bottom corner
    const P = (l, w, h) => [ox + (l - w) * c * s, oy - (l + w) * sn * s - h * s], pt = a => a.map(v => Math.round(v * 10) / 10).join(',');
    const BLUE = '#204CBA', INK = '#0B1220';
    const poly = (pts, fill, o) => `<polygon points="${pts.map(pt).join(' ')}" fill="${fill}"${o && o.nostroke ? '' : ` stroke="${(o && o.stroke) || BLUE}" stroke-width="${(o && o.sw) || 2.2}" stroke-linejoin="round"`}${o && o.op ? ` opacity="${o.op}"` : ''}/>`;
    const line = (a, b, col, w, op, dash) => `<line x1="${pt(a).split(',')[0]}" y1="${pt(a).split(',')[1]}" x2="${pt(b).split(',')[0]}" y2="${pt(b).split(',')[1]}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${op ? ` opacity="${op}"` : ''}${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    // a box from (l0,w0,h0) to (l1,w1,h1): the left face, the right face, the top; tone = [top, right, left]
    const box = (l0, l1, w0, w1, h0, h1, tone) => poly([P(l0, w0, h0), P(l0, w1, h0), P(l0, w1, h1), P(l0, w0, h1)], tone[2]) + poly([P(l0, w0, h0), P(l1, w0, h0), P(l1, w0, h1), P(l0, w0, h1)], tone[1]) + poly([P(l0, w0, h1), P(l1, w0, h1), P(l1, w1, h1), P(l0, w1, h1)], tone[0]);
    const face = (pts, fill, op) => poly(pts, fill, { nostroke: true, op });
    const hb = H * 0.17, lidH = H * 0.05, e = 0.012 * Math.max(L, W), hc = hb + (H - hb - lidH) * 0.55;   // pallet base, lid thickness, lid overhang, the collar's seam
    let svg = `<svg viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" style="display:block" font-family="DM Sans, Arial, sans-serif">`;
    // the floor plate and a soft shadow made of stacked, fading ellipses
    svg += poly([P(-m, -m, 0), P(L + m, -m, 0), P(L + m, W + m, 0), P(-m, W + m, 0)], '#E7ECF7', { stroke: '#C9D3EA', sw: 1.6 });
    const cx = (P(0, 0, 0)[0] + P(L, W, 0)[0]) / 2, cy = (P(0, 0, 0)[1] + P(L, W, 0)[1]) / 2 + 6;
    [1.0, 0.86, 0.72, 0.58].forEach((k, i) => { svg += `<ellipse cx="${Math.round(cx + 8)}" cy="${Math.round(cy)}" rx="${Math.round(bw * 0.43 * k)}" ry="${Math.round(bw * 0.17 * k)}" fill="${INK}" opacity="${0.035 + i * 0.018}"/>`; });
    // the pallet: base box, then dark fork openings on both faces
    svg += box(0, L, 0, W, 0, hb, ['#DCE4F4', '#AEBFE4', '#93A9D8']);
    [[0.14, 0.43], [0.57, 0.86]].forEach(g => {
      svg += face([P(L * g[0], 0, hb * 0.12), P(L * g[1], 0, hb * 0.12), P(L * g[1], 0, hb * 0.8), P(L * g[0], 0, hb * 0.8)], INK, 0.62);
      svg += face([P(0, W * g[0], hb * 0.12), P(0, W * g[1], hb * 0.12), P(0, W * g[1], hb * 0.8), P(0, W * g[0], hb * 0.8)], INK, 0.7);
    });
    // the crate: a hinged collar on the pallet
    svg += box(0, L, 0, W, hb, H - lidH, ['#F4F7FE', '#D8E3F8', '#BFD0EF']);
    svg += line(P(0, 0, hc), P(L, 0, hc), '#fff', 2.2, 0.85) + line(P(0, 0, hc), P(0, W, hc), '#fff', 2.2, 0.7);      // the seam between the collar frames
    const br = (l, w, fl) => fl ? poly([P(l, 0, hb + (H - hb - lidH) * 0.22), P(l + L * 0.04, 0, hb + (H - hb - lidH) * 0.22), P(l + L * 0.04, 0, hb + (H - hb - lidH) * 0.88), P(l, 0, hb + (H - hb - lidH) * 0.88)], '#CBD4E6', { stroke: '#8794B0', sw: 1.4 })
      : poly([P(0, w, hb + (H - hb - lidH) * 0.22), P(0, w + W * 0.04, hb + (H - hb - lidH) * 0.22), P(0, w + W * 0.04, hb + (H - hb - lidH) * 0.88), P(0, w, hb + (H - hb - lidH) * 0.88)], '#B3BED6', { stroke: '#8794B0', sw: 1.4 });
    svg += br(0, 0, true) + br(L - L * 0.04, 0, true) + br(0, 0, false) + br(0, W - W * 0.04, false);      // corner brackets
    // the strap round the load, over the lid and down the front
    svg += face([P(L * 0.47, 0, hb), P(L * 0.5, 0, hb), P(L * 0.5, 0, H - lidH), P(L * 0.47, 0, H - lidH)], BLUE, 0.9);
    // the lid, slightly wider than the crate, with a light top edge
    svg += box(-e, L + e, -e, W + e, H - lidH, H, ['#FBFCFF', '#E4ECFB', '#CBD9F2']);
    svg += face([P(L * 0.47, -e, H), P(L * 0.5, -e, H), P(L * 0.5, W + e, H), P(L * 0.47, W + e, H)], BLUE, 0.9);
    svg += line(P(-e, -e, H), P(L + e, -e, H), '#fff', 2.6, 0.95) + line(P(-e, -e, H), P(-e, W + e, H), '#fff', 2.6, 0.95);
    if (!ok) return svg + '</svg>';
    // dimension lines
    const ext = (a, b) => line(a, b, '#8C97AC', 1.4, 0, '4 5');
    const arrow = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, k = 11; return `<polygon points="${pt(a)} ${pt([a[0] + ux * k - uy * 4.5, a[1] + uy * k + ux * 4.5])} ${pt([a[0] + ux * k + uy * 4.5, a[1] + uy * k - ux * 4.5])}" fill="${BLUE}"/>`; };
    const dim = (a, b, letter, val) => {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], txt = `${val} mm`, w = 46 + txt.length * 15.5;
      return line(a, b, BLUE, 2) + arrow(a, b) + arrow(b, a)
        + `<rect x="${mid[0] - w / 2}" y="${mid[1] - 21}" width="${w}" height="42" rx="21" fill="#fff" stroke="#C9D3EA" stroke-width="1.5"/><circle cx="${mid[0] - w / 2 + 22}" cy="${mid[1]}" r="14" fill="${BLUE}"/>`
        + `<text x="${mid[0] - w / 2 + 22}" y="${mid[1] + 6}" font-size="17" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text><text x="${mid[0] - w / 2 + 44}" y="${mid[1] + 8}" font-size="23" font-weight="700" fill="${INK}">${txt}</text>`;
    };
    const off = (p, n, d) => [p[0] + n[0] * d, p[1] + n[1] * d], d1 = 56, nL = [0.5, 0.866], nW = [-0.5, 0.866];
    const l0 = P(0, 0, 0), l1 = P(L, 0, 0), w1 = P(0, W, 0), h0 = P(L, 0, 0), h1 = P(L, 0, H);
    svg += ext(off(l1, nL, 6), off(l1, nL, d1 + 8)) + ext(off(l0, nL, 6), off(l0, nL, d1 + 8)) + dim(off(l0, nL, d1), off(l1, nL, d1), 'L', n0(L));
    svg += ext(off(w1, nW, 6), off(w1, nW, d1 + 8)) + ext(off(l0, nW, 6), off(l0, nW, d1 + 8)) + dim(off(l0, nW, d1), off(w1, nW, d1), 'W', n0(W));
    const hx = h0[0] + 70; svg += ext([h0[0] + 8, h0[1]], [hx + 8, h0[1]]) + ext([h1[0] + 8, h1[1]], [hx + 8, h1[1]]) + dim([hx, h0[1]], [hx, h1[1]], 'H', n0(H));
    return svg + '</svg>';
  }
  function build(S, D) {
    const DB = root.WFCDB, co = DB.company, M = D.model, I = IMG();
    const sc = S.scenario, pa = S.pallet, rt = S.route, fl = S.fleet, cyc = D.cycle, F = D.fleet, qty = D.qty;
    const clientShort = S.client.name || 'Client';
    const modelImgKey = M && M.img;
    const modelImg = S.images.amr || (modelImgKey && I[modelImgKey]) || null;
    const photoBg = (S.images.amr || !modelImgKey) ? '#FFFFFF' : '#EEF2F7';
    const heroImg = S.images.amr || (modelImgKey && I[modelImgKey]) || I.amrWfc;
    const heroBg = (S.images.amr || !modelImgKey) ? '#FFFFFF' : '#EEF2F7';
    const strat = fl.strategy === 'swap' ? 'swap' : 'charge';
    const chosen = F && F.ok ? (strat === 'swap' ? F.swap : F.charge) : null;
    const slides = [];
    const add = (id, name, html, extra) => slides.push(Object.assign({ id, name, html }, extra || {}));

    /* ---- Cover ---- */
    add('cover', 'Cover', `
      <div style="position:absolute;left:1100px;top:0;width:820px;height:1080px;background:var(--ink)"></div>
      <div style="position:absolute;left:1180px;top:150px;width:660px;height:780px;background:${heroBg};border-radius:32px"></div>
      ${heroImg ? `<img class="contain" src="${heroImg}" alt="" style="position:absolute;left:1210px;top:180px;width:600px;height:720px">` : ''}
      <div class="col" style="width:840px;height:824px;justify-content:space-between">
        <div class="row" style="align-items:center;gap:40px"><div class="col gap8"><img class="contain" src="${I.logo}" alt="WFC Systems" style="width:260px;height:105px"><p class="t24 lbl" style="font-style:italic">${esc(co.tagline)}</p></div>${S.client.logo ? `<div style="width:2px;height:80px;background:var(--line)"></div><img class="contain" src="${S.client.logo}" alt="" style="max-width:300px;max-height:110px;height:110px">` : ''}</div>
        <div class="col gap24"><p class="eyebrow">Proposal</p><h1 style="font-size:96px;font-weight:700;line-height:1.05">${esc(S.title)}</h1><p class="t32 body">${esc(S.subtitle)}</p></div>
        <div class="col gap16">
          <div class="col gap8"><p class="t24 lbl">Prepared for</p><p class="t32 b">${esc(S.client.name)}</p>${S.client.attn ? `<p class="t24 body">Attn: ${esc(S.client.attn)}</p>` : ''}</div>
          <div class="col gap8"><p class="t24 lbl">Prepared by</p><p class="t32 b">${esc(co.name)}${S.client.date ? ' · ' + esc(longDate(S.client.date)) : ''}</p>${S.client.ref ? `<p class="t24 body">Ref: ${esc(S.client.ref)}</p>` : ''}</div>
        </div>
      </div>`, { noFoot: true, style: 'padding:128px' });

    /* ---- Introduction ---- */
    add('intro', 'Introduction', `
      ${head('Overview', 'Introduction')}
      <div class="row">
        <div class="card col gap16 f1">${icon('gear')}<h3>Operational precision</h3><p class="t24 body">Less manual handling and fewer human errors.</p></div>
        <div class="card col gap16 f1">${icon('shield')}<h3>Enhanced safety</h3><p class="t24 body">A secure, synchronised environment for staff and machinery.</p></div>
        <div class="card col gap16 f1">${icon('bulb')}<h3>Future readiness</h3><p class="t24 body">Scalable productivity in line with Industry 4.0 standards.</p></div>
      </div>
      <div class="card dark col gap12"><p class="eyebrow sky">What is an AMR?</p><p class="t32 white">An autonomous mobile robot navigates on its own using sensors and a robot control system (RCS). It reads its surroundings in real time to avoid obstacles and optimise its path, unlike track-bound AGVs.</p></div>`);

    /* ---- Education: why automate ---- */
    const ecard = (ic, t, d) => `<div class="card row gap24 f1" style="align-items:flex-start;padding:36px">${icon(ic)}<div class="col gap8 grow"><h3>${t}</h3><p class="t24 body">${d}</p></div></div>`;
    add('whyauto', 'Why automate', `
      ${head('Overview', 'Why automate')}
      <div class="col" style="gap:32px">
        <div class="row">${ecard('users', 'Labour shortages and rising costs', 'AMRs automate repetitive transport tasks, easing labour shortages and rising costs.')}${ecard('target', 'Reliable delivery', 'Materials reach the exact right location on time, which improves material flow across the facility.')}</div>
        <div class="row">${ecard('shield', 'A safer workplace', 'Less manual handling and less unnecessary forklift traffic.')}${ecard('trend', 'Room to grow', 'The same technology scales as your operational requirements increase.')}</div>
      </div>
      <div class="card dark" style="padding:24px 40px"><p class="t32 white"><b>AMR or AGV?</b> An AMR perceives its surroundings in real time and finds its own path. A track-bound AGV follows a fixed route.</p></div>`);

    /* ---- Education: how an AMR works ---- */
    const vcard = (svg, t, d) => `<div class="col f1" style="gap:24px"><div class="card" style="padding:0;height:290px;overflow:hidden;display:flex;align-items:center;justify-content:center">${svg}</div><div class="col gap8"><h3>${t}</h3><p class="t24 body">${d}</p></div></div>`;
    const slamSvg = '<svg viewBox="0 0 400 260" width="400" height="260"><rect x="20" y="20" width="360" height="220" rx="14" fill="#fff" stroke="#C7D3EE" stroke-width="3"/><rect x="50" y="50" width="70" height="26" rx="4" fill="#CFDBF5"/><rect x="50" y="94" width="70" height="26" rx="4" fill="#CFDBF5"/><rect x="50" y="138" width="70" height="26" rx="4" fill="#CFDBF5"/><rect x="290" y="50" width="70" height="26" rx="4" fill="#CFDBF5"/><rect x="290" y="94" width="70" height="26" rx="4" fill="#CFDBF5"/><path d="M150 205 H215 V128 H255 V78" fill="none" stroke="#204CBA" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round"/><circle cx="150" cy="205" r="15" fill="#204CBA"/><path d="M243 86 L255 62 L267 86 Z" fill="#204CBA"/><circle cx="320" cy="190" r="6" fill="#0B1220"/><circle cx="90" cy="205" r="6" fill="#0B1220"/><circle cx="215" cy="60" r="6" fill="#0B1220"/></svg>';
    const lidarSvg = '<svg viewBox="0 0 400 260" width="400" height="260"><path d="M50 225 A150 150 0 0 1 350 225" fill="none" stroke="#C7D3EE" stroke-width="7"/><path d="M95 225 A105 105 0 0 1 305 225" fill="none" stroke="#8FB0F5" stroke-width="7"/><path d="M140 225 A60 60 0 0 1 260 225" fill="none" stroke="#204CBA" stroke-width="7"/><line x1="200" y1="205" x2="283" y2="95" stroke="#204CBA" stroke-width="3" stroke-dasharray="4 8"/><rect x="266" y="62" width="40" height="54" rx="7" fill="#0B1220"/><rect x="160" y="205" width="80" height="42" rx="12" fill="#0B1220"/><circle cx="200" cy="205" r="11" fill="#8FB0F5"/></svg>';
    const dashSvg = '<svg viewBox="0 0 400 260" width="400" height="260"><rect x="30" y="26" width="340" height="208" rx="16" fill="#fff" stroke="#C7D3EE" stroke-width="3"/><path d="M30 42 a16 16 0 0 1 16 -16 h308 a16 16 0 0 1 16 16 v22 h-340 z" fill="#0B1220"/><circle cx="52" cy="46" r="6" fill="#8FB0F5"/><circle cx="72" cy="46" r="6" fill="#8FB0F5"/><circle cx="92" cy="46" r="6" fill="#8FB0F5"/><rect x="56" y="150" width="34" height="56" rx="5" fill="#CFDBF5"/><rect x="106" y="120" width="34" height="86" rx="5" fill="#8FB0F5"/><rect x="156" y="136" width="34" height="70" rx="5" fill="#204CBA"/><circle cx="240" cy="96" r="9" fill="#204CBA"/><rect x="262" y="90" width="78" height="12" rx="6" fill="#CFDBF5"/><circle cx="240" cy="132" r="9" fill="#204CBA"/><rect x="262" y="126" width="78" height="12" rx="6" fill="#CFDBF5"/><circle cx="240" cy="168" r="9" fill="#0B1220"/><rect x="262" y="162" width="78" height="12" rx="6" fill="#CFDBF5"/><circle cx="240" cy="204" r="9" fill="#204CBA"/><rect x="262" y="198" width="78" height="12" rx="6" fill="#CFDBF5"/></svg>';
    add('howworks', 'How an AMR works', `
      ${head('Overview', 'How an AMR works')}
      <div class="row" style="gap:32px;align-items:flex-start">
        ${vcard(slamSvg, 'SLAM navigation', 'The AMR builds a map as it moves and tracks where it is on it (Simultaneous Localization and Mapping), so it navigates accurately.')}
        ${vcard(lidarSvg, 'LiDAR sensing', 'LiDAR sensors help the robot understand its surroundings and navigate safely and efficiently.')}
        ${vcard(dashSvg, 'Fleet management', 'One platform coordinates several robots, with real-time monitoring of robot status, task progress and performance.')}
      </div>`);

    /* ---- Education: the AMR range ---- */
    const RANGE = [['card-pj', 'Pallet Jack AMR', 'Automated pallet transport for floor-to-floor warehouse and production transfer.'], ['card-rt', 'Reach Truck AMR', 'Designed for high-rack storage, put-away operations and narrow aisle navigation.'], ['card-tow', 'Towing AMR', 'High-capacity tugger for towing multiple carts and trolleys along production lines.'], ['card-fork', 'Forklift AMR', 'Heavy-duty automated pallet handling, loading and unloading, and internal logistics.']];
    add('types', 'AMR range', `
      ${head('Overview', 'The WFC AMR range')}
      <div class="row" style="gap:24px;align-items:stretch">${RANGE.map(t => { const mine = M && M.type === t[1]; return `<div class="col f1" style="border-radius:24px;overflow:hidden;border:2px solid ${mine ? 'var(--blue)' : 'var(--line)'}"><img class="cover" src="${I[t[0]]}" alt="${t[1]}" style="width:100%;height:270px;background:#F8F9FB"><div class="col gap12" style="padding:24px 28px"><h3>${t[1]}</h3><p class="t24 body">${t[2]}</p>${mine ? '<div><span class="chip dark">Proposed here</span></div>' : ''}</div></div>`; }).join('')}</div>`);

    /* ---- Scenario ---- */
    const tiles = [
      [sc.shifts, `${plural(num(sc.shifts), 'shift', 'shifts')} per day, ${esc(sc.hoursPerShift)} hours each`],
      [sc.stations, 'pick-up stations'], [sc.loadKg, 'kg maximum load per pallet'], [sc.tripsPerDay, 'trips per day']
    ].filter(t => t[0] !== '' && t[0] != null);
    const facts = [];
    if (sc.rowsPerDay || sc.minPallets) facts.push(['Daily volume', `${sc.rowsPerDay ? esc(sc.rowsPerDay) + ' rows per day' : ''}${sc.rowsPerDay && sc.minPallets ? ', ' : ''}${sc.minPallets ? 'minimum ' + esc(sc.minPallets) + ' pallets' : ''}`]);
    if (sc.traffic) facts.push(['Traffic density risk', esc(sc.traffic)]);
    if (sc.transfer) facts.push(['Transfer', esc(sc.transfer)]);
    add('scenario', 'Application scenario', `
      ${head('Scope', 'Application scenario')}
      <div class="row">${tiles.map(t => `<div class="card col gap12 f1"><p class="big">${esc(t[0])}</p><p class="t32" style="font-weight:500">${t[1]}</p></div>`).join('')}</div>
      ${facts.length ? `<div class="row">${facts.map(f => `<div class="outline col gap8 f1"><p class="t24 lbl">${f[0]}</p><p class="t32 b">${f[1]}</p></div>`).join('')}</div>` : ''}`);

    /* ---- Pallet / transport component: one drawing with its dimensions, the type and load, and the photos. Nothing else. ---- */
    const pics = [[S.images.pallet1, S.captions.pallet1], [S.images.pallet2, S.captions.pallet2]].filter(p => p[0]);
    const pw = pics.length === 2 ? 424 : 560, cardW = pics.length === 0 ? 1664 : 1664 - 48 - (pics.length === 2 ? 424 * 2 + 48 : 560);
    const picHtml = pics.map(p => `<div class="col gap16" style="width:${pw}px"><img class="cover" src="${p[0]}" alt="" style="width:${pw}px;height:540px;border-radius:24px"><p class="t24 lbl">${esc(p[1])}</p></div>`).join('');
    add('pallet', 'Transport component', `
      ${head('Scope', 'Transport component')}
      <div class="row" style="gap:48px;align-items:flex-start">
        <div class="col" style="width:${cardW}px;height:580px;background:var(--tint);border-radius:24px;overflow:hidden;gap:0">
          <div style="height:430px;display:flex;align-items:center;justify-content:center">${palletDrawing(num(pa.L), num(pa.W), num(pa.H), cardW, 430)}</div>
          <div class="row" style="height:150px;border-top:2px solid var(--line);padding:0 48px;align-items:center;justify-content:space-between">
            <div class="col gap8"><p class="t24 lbl">Component</p><p class="t32 b">${esc(pa.type)}</p></div>
            <div class="col gap8" style="text-align:right"><p class="t24 lbl">Maximum load</p><p class="t32 b blue-t">${esc(pa.kg)} kg</p></div>
          </div>
        </div>${picHtml}
      </div>`);
    /* ---- Site layout ---- */
    const mapCols = S.site.legend === 'map' ? ['#E5322D', '#F28C28'] : ['#2F5BD0', '#3A4766'];
    const chip = (c, solid) => solid ? `<div style="width:40px;height:40px;border-radius:10px;background:${c};flex:none"></div>` : `<div style="width:40px;height:40px;border-radius:10px;border:6px solid ${c};flex:none"></div>`;
    const lp = S.layoutPlan || {}, aspect = D.layoutAspect || 0, hasPlan = ['zones', 'points', 'routes'].some(q => (lp[q] || []).length);
    let layoutBox = `<div class="placeholder" style="width:912px;height:603px">Add the site layout image in the form</div>`;
    if (S.images.layout && aspect) {
      const dw = Math.min(880, 571 * aspect), dh = dw / aspect;   // the picture, fitted into its card, with the drawn plan on top
      layoutBox = `<div class="imgcard" style="width:912px;height:603px;padding:16px;background:var(--tint)"><div style="position:relative;width:${Math.round(dw)}px;height:${Math.round(dh)}px;border-radius:12px;overflow:hidden"><img src="${S.images.layout}" alt="Site layout" style="display:block;width:${Math.round(dw)}px;height:${Math.round(dh)}px">${hasPlan ? planSvg(lp, dw, dh, { aspect, legend: S.site.legend }) : ''}</div></div>`;
    } else if (S.images.layout) {
      layoutBox = `<div class="imgcard" style="width:912px;height:603px;padding:16px;background:var(--tint)"><img class="contain" src="${S.images.layout}" alt="Site layout" style="width:880px;height:571px;border-radius:12px"></div>`;
    }
    const picks = (lp.points || []).filter(p => p.kind === 'pick').length, calls = (lp.points || []).filter(p => p.kind === 'callbox').length;
    const lrow = (chipHtml, title, text) => `<div class="row" style="gap:24px;align-items:flex-start">${chipHtml}<div class="col gap8 grow"><p class="t32 b" style="line-height:1.2">${title}</p><p class="t24 body">${text}</p></div></div>`;
    const legendRows = [
      lrow(S.site.legend === 'map' ? chip(mapCols[0], false) : chip(mapCols[0], true), 'Pick-up', `${esc(S.site.pickup)}${S.site.legend === 'map' ? ', outlined in red' : ''}${picks > 1 ? ', stations 1 to ' + picks : ''}.${calls >= 3 ? ' A call box at each station.' : ''}`),
      lrow(S.site.legend === 'map' ? chip(mapCols[1], false) : chip(mapCols[1], true), 'Drop-off', `${esc(S.site.drop)}${S.site.dropSpots ? ', spots ' + esc(S.site.dropSpots) : ''}${S.site.legend === 'map' ? ', outlined in orange' : ''}.`),
      lrow('<div style="width:40px;height:40px;border-radius:10px;border:3px dashed var(--blue);flex:none"></div>', 'Longest route', `About ${esc(rt.distanceM)} m one way, driven at ${esc(rt.speedMps)} m/s.`)
    ];
    // anything else on the map: one line per kind (doors, chargers, standby spots, call boxes when there are only a few, extra areas)
    const kinds = []; (lp.points || []).forEach(p => { if (p.kind !== 'spot' && p.kind !== 'pick' && !(p.kind === 'callbox' && calls >= 3) && !kinds.includes(p.kind)) kinds.push(p.kind); });
    const areas = (lp.zones || []).filter(z => z.kind === 'zone' && z.label).map(z => z.label);
    const extra = kinds.map(k => `<div class="row" style="gap:16px;align-items:center">${pointChip(k, 36)}<p class="t24">${esc((POINT_KINDS[k] || [0, 'Point'])[1])}${(lp.points || []).filter(p => p.kind === k).length > 1 ? 's' : ''}</p></div>`)
      .concat(areas.map(a => `<div class="row" style="gap:16px;align-items:center"><div style="width:36px;height:36px;border-radius:8px;border:3px solid #5B6577;background:#5B657722;flex:none"></div><p class="t24">${esc(a)}</p></div>`));
    if (extra.length) legendRows.push(`<div class="col" style="gap:18px;border-top:2px solid var(--line);padding-top:32px"><p class="t24 lbl">Also on the map</p>${extra.join('')}</div>`);    add('layout', 'Site layout', `
      ${head('Route', 'Site layout')}
      <div class="row" style="gap:64px;align-items:flex-start">
        ${layoutBox}
        <div class="col" style="width:688px;gap:40px">${legendRows.join('')}</div>
      </div>`);

    /* ---- Route overview (diagram) ---- */
    (function () {
      const n = Math.max(1, Math.min(Math.floor(num(sc.stations)) || 1, 5)), total = Math.floor(num(sc.stations)) || n;
      const W = 1664, Hh = 520, bx = 20, bw = 250, bh = 52, gapY = 18, top = 20;
      const colH = n * bh + (n - 1) * gapY, y0 = top + (360 - colH) / 2, busX = 470, routeY = top + 180, dropX = 1330;
      let s = `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" style="display:block"><rect width="${W}" height="${Hh}" rx="24" fill="#F2F6FD"/>`;
      for (let i = 0; i < n; i++) {
        const y = y0 + i * (bh + gapY), cy = y + bh / 2;
        const label = (total > n && i === n - 1) ? `Station ${total}` : `Station ${i + 1}`;
        s += `<rect x="${bx + 20}" y="${y}" width="${bw}" height="${bh}" rx="12" fill="#fff" stroke="#204CBA" stroke-width="3"/><text x="${bx + 20 + bw / 2}" y="${cy + 8}" font-size="24" font-weight="700" text-anchor="middle" fill="#0B1220" font-family="DM Sans, Arial">${label}</text>`;
        s += `<path d="M${bx + 20 + bw} ${cy} H${busX - 40} V${routeY}" fill="none" stroke="#8FB0F5" stroke-width="3"/>`;
      }
      if (total > n) s += `<text x="${bx + 20 + bw / 2}" y="${y0 + colH - bh - gapY / 2 + 4}" font-size="24" text-anchor="middle" fill="#5B6577" font-family="DM Sans, Arial">···</text>`;
      s += `<text x="${bx + 20 + bw / 2}" y="${top + 360 + 40}" font-size="24" text-anchor="middle" fill="#5B6577" font-family="DM Sans, Arial">${esc(S.site.pickup)}</text>`;
      s += `<path d="M${busX - 40} ${routeY} H${dropX - 14}" fill="none" stroke="#204CBA" stroke-width="6" stroke-dasharray="4 14" stroke-linecap="round"/>`;
      s += `<path d="M${dropX - 36} ${routeY - 16} L${dropX - 8} ${routeY} L${dropX - 36} ${routeY + 16} Z" fill="#204CBA"/>`;
      const ax = busX + 330;
      s += `<rect x="${ax}" y="${routeY - 40}" width="180" height="80" rx="16" fill="#204CBA"/><text x="${ax + 90}" y="${routeY + 10}" font-size="32" font-weight="700" text-anchor="middle" fill="#fff" font-family="DM Sans, Arial">AMR</text>`;
      s += `<circle cx="${ax + 34}" cy="${routeY + 48}" r="12" fill="#0B1220"/><circle cx="${ax + 146}" cy="${routeY + 48}" r="12" fill="#0B1220"/>`;
      // distance dimension line
      const dy = top + 330;
      s += `<line x1="${busX - 40}" y1="${dy}" x2="${dropX - 14}" y2="${dy}" stroke="#0B1220" stroke-width="3"/><line x1="${busX - 40}" y1="${dy - 12}" x2="${busX - 40}" y2="${dy + 12}" stroke="#0B1220" stroke-width="3"/><line x1="${dropX - 14}" y1="${dy - 12}" x2="${dropX - 14}" y2="${dy + 12}" stroke="#0B1220" stroke-width="3"/>`;
      s += `<text x="${(busX - 40 + dropX - 14) / 2}" y="${dy + 42}" font-size="32" font-weight="700" text-anchor="middle" fill="#0B1220" font-family="DM Sans, Arial">${esc(rt.distanceM)} m longest one-way route</text>`;
      // drop-off
      // the drop-off name wraps onto two lines when it is long, so it stays inside its box
      const dropWords = String(S.site.drop || '').split(/\s+/).filter(Boolean), dropLines = [];
      dropWords.forEach(w => { const last = dropLines[dropLines.length - 1]; if (last !== undefined && (last + ' ' + w).length <= 15) dropLines[dropLines.length - 1] = last + ' ' + w; else dropLines.push(w); });
      while (dropLines.length > 2) dropLines.splice(1, 2, dropLines[1] + ' ' + dropLines[2]);
      const dropFs = dropLines.some(l => l.length > 15) ? 26 : 32;
      s += `<rect x="${dropX}" y="${routeY - 110}" width="290" height="220" rx="20" fill="#0B1220"/>`
        + dropLines.map((l, i) => `<text x="${dropX + 145}" y="${routeY - (dropLines.length > 1 ? 66 : 50) + i * (dropFs + 6)}" font-size="${dropFs}" font-weight="700" text-anchor="middle" fill="#fff" font-family="DM Sans, Arial">${esc(l)}</text>`).join('');
      const spots = String(S.site.dropSpots || '').split(/[\s,·]+/).filter(Boolean).slice(0, 6);
      const sw = 56, sg = 14, tw = spots.length * sw + (spots.length - 1) * sg, sx = dropX + 145 - tw / 2;
      spots.forEach((sp, i) => { s += `<rect x="${sx + i * (sw + sg)}" y="${routeY - 8}" width="${sw}" height="${sw}" rx="12" fill="#204CBA"/><text x="${sx + i * (sw + sg) + sw / 2}" y="${routeY - 8 + 38}" font-size="28" font-weight="700" text-anchor="middle" fill="#fff" font-family="DM Sans, Arial">${esc(sp)}</text>`; });
      s += `<text x="${dropX + 145}" y="${routeY + 90}" font-size="24" text-anchor="middle" fill="${'#B9C6E0'}" font-family="DM Sans, Arial">Drop-off</text></svg>`;
      add('routemap', 'Route overview', `
        ${head('Route', 'Route overview')}
        ${s}
        <div class="row">
          <div class="card col gap8 f1" style="padding:28px 36px"><p class="t24 lbl">One-way distance</p><p class="t44">${esc(rt.distanceM)} m</p></div>
          <div class="card col gap8 f1" style="padding:28px 36px"><p class="t24 lbl">Travel speed</p><p class="t44">${esc(rt.speedMps)} m/s</p></div>
          <div class="card col gap8 f1" style="padding:28px 36px"><p class="t24 lbl">Cycle time per trip</p><p class="t44">${cyc ? n0(cyc.totalS) + ' s' : '—'}</p></div>
          <div class="card col gap8 f1" style="padding:28px 36px"><p class="t24 lbl">Trips per day</p><p class="t44">${esc(sc.tripsPerDay)}</p></div>
        </div>`);
    })();

    /* ---- Route analysis ---- */
    if (cyc) {
      const t1 = cyc.theoS, t2 = cyc.bufS, t3 = cyc.dwellS, tot = cyc.totalS;
      const op = (c) => `<p style="width:64px;font-size:44px;font-weight:700;text-align:center;color:var(--muted)">${c}</p>`;
      const tile = (v, l, cls) => `<div class="${cls || 'card'} col gap8 f1" style="padding:32px"><p class="t64"${cls === 'card blue' ? ' style="color:#fff"' : ''}>${v}</p><p class="t24" style="color:${cls === 'card blue' ? '#E4ECFB' : 'var(--body)'}">${l}</p></div>`;
      const pct = x => (x / tot * 100).toFixed(2) + '%';
      add('route-analysis', 'Route analysis', `
        ${head('Route', 'Route analysis')}
        <div class="row" style="gap:0;align-items:center">
          ${tile(n0(cyc.distanceM), 'metres, longest one-way route')}
          <div style="width:64px;display:flex;justify-content:center"><svg width="40" height="28" viewBox="0 0 40 28"><path d="M0 8h24V0l16 14-16 14v-8H0z" fill="#5B6577"/></svg></div>
          ${tile(n2(t1), `seconds, theoretical round trip at ${esc(rt.speedMps)} m/s`)}
          ${op('+')}${tile(n2(t2), `seconds, ${esc(rt.bufferPct)}% real-world buffer for turns and stops`)}
          ${t3 > 0 ? op('+') + tile(n2(t3), 'seconds, pick-up and drop-off handling') : ''}
          ${op('=')}${tile(n2(tot), `seconds, total real-world cycle (about ${n1(cyc.totalMin)} minutes)`, 'card blue')}
        </div>
        <div class="col gap16"><p class="t24 lbl">Cycle time composition</p>
          <div style="display:flex;height:96px;border-radius:16px;overflow:hidden">
            <div style="width:${pct(t1)};background:var(--blue);display:flex;align-items:center;padding:0 32px"><p class="t32 b white" style="white-space:nowrap">Theoretical ${n2(t1)} s</p></div>
            <div style="width:${pct(t2)};background:var(--ink);display:flex;align-items:center;padding:0 24px"><p class="t32 b white" style="white-space:nowrap">${t2 / tot > 0.09 ? '+' + n2(t2) + ' s' : ''}</p></div>
            ${t3 > 0 ? `<div style="width:${pct(t3)};background:var(--sky);display:flex;align-items:center;padding:0 16px"></div>` : ''}
          </div>
        </div>
        ${F && F.ok ? `<p class="t32 body"><b>${esc(sc.tripsPerDay)} trips per day</b> at ${n2(tot)} s each is about ${n1(F.workH)} hours of travel time per day.</p>` : ''}`);
    }

    /* ---- Fleet size (new visual) ---- */
    if (F && F.ok && chosen) {
      const cap = chosen.amrs * chosen.availH * F.maxUtil;
      const maxScale = Math.max(F.workH, cap, 0.1) * 1.08;
      const bar = (label, val, color, txt) => `<div class="col gap8"><div class="row" style="justify-content:space-between"><p class="t24 b">${label}</p><p class="t24 b">${txt}</p></div><div style="height:48px;border-radius:12px;background:#E3EAF8"><div style="height:48px;border-radius:12px;background:${color};width:${Math.max(val / maxScale * 100, 1.5).toFixed(1)}%"></div></div></div>`;
      const util = Math.min(chosen.utilOfAvail, 1);
      const R = 70, Cc = 2 * Math.PI * R;
      const ring = `<svg viewBox="0 0 180 180" width="180" height="180"><circle cx="90" cy="90" r="${R}" fill="none" stroke="#26324A" stroke-width="20"/><circle cx="90" cy="90" r="${R}" fill="none" stroke="#8FB0F5" stroke-width="20" stroke-linecap="round" stroke-dasharray="${(Cc * util).toFixed(1)} ${Cc.toFixed(1)}" transform="rotate(-90 90 90)"/><text x="90" y="88" font-size="40" font-weight="700" text-anchor="middle" fill="#fff" font-family="DM Sans, Arial">${Math.round(chosen.utilOfAvail * 100)}%</text><text x="90" y="114" font-size="18" text-anchor="middle" fill="#B9C6E0" font-family="DM Sans, Arial">busy</text></svg>`;
      const step = (k, v) => `<div class="row" style="gap:24px;border-top:1px solid var(--line);padding-top:12px"><p class="t24 lbl" style="width:290px;flex:none">${k}</p><p class="t24 grow">${v}</p></div>`;
      const availTxt = strat === 'swap'
        ? `${n1(chosen.availH)} h of ${F.opHours} h (spare battery swapped by hand, about ${F.swapMin} min each)`
        : `${n1(chosen.availH)} h of ${F.opHours} h (${n1(F.runtimeH)} h running, ${n1(F.chargeH)} h charging)`;
      add('fleet', 'AMR fleet size', `
        ${head('Solution', 'AMR fleet size')}
        <div class="row" style="align-items:stretch">
          <div class="card dark col" style="width:500px;justify-content:space-between;gap:12px">
            <p class="t24 ondark">Recommended for this scenario</p>
            <div class="col"><p style="font-size:200px;font-weight:700;line-height:.95;color:#fff">${chosen.amrs}</p><p class="t44 white">${plural(chosen.amrs, 'AMR', 'AMRs')}</p></div>
            <p class="t24 ondark">${strat === 'swap' ? `Spare batteries swapped by hand${chosen.extraBatteries ? `, ${chosen.extraBatteries} spare ${plural(chosen.extraBatteries, 'battery', 'batteries')}` : ''}` : 'Auto-charging between tasks'}${F.spare ? `. Includes ${F.spare} standby ${plural(F.spare, 'unit', 'units')}.` : ''}${D.override && D.override !== chosen.amrs ? ` The quotation uses ${D.qty}.` : ''}</p>
            <div style="display:flex;justify-content:center">${ring}</div>
          </div>
          <div class="outline col gap24 grow" style="padding:36px 40px">
            ${bar('Work required per day', F.workH, '#204CBA', n1(F.workH) + ' h')}
            ${bar('Fleet capacity per day', cap, '#0B1220', n1(cap) + ' h')}
            <div class="col gap12">
              ${step('Operating day', `${esc(sc.shifts)} ${plural(num(sc.shifts), 'shift', 'shifts')} × ${esc(sc.hoursPerShift)} h = ${F.opHours} h`)}
              ${step('Cycle time', `${n0(cyc.totalS)} s per trip (${esc(rt.distanceM)} m, ${esc(rt.speedMps)} m/s)`)}
              ${step('Work required', `${esc(sc.tripsPerDay)} trips × ${n0(cyc.totalS)} s = ${n1(F.workH)} h`)}
              ${step('One AMR can work', `${availTxt}, at most ${Math.round(F.maxUtil * 100)}% busy = ${n1(chosen.availH * F.maxUtil)} h`)}
              ${step('Busiest hour', `${n1(F.peakFactor)} × average = ${n1(F.tripsPerHour * F.peakFactor)} trips per hour, needs ${n2(chosen.peakNeed)} ${plural(Math.round(chosen.peakNeed * 100) / 100, 'AMR', 'AMRs')}`)}
            </div>
          </div>
        </div>`);

      /* ---- Charging and battery plan ---- */
      const H = F.opHours;
      const tlC = WFCCalc.timeline('charge', H, F.runtimeH, F.chargeH, F.swapMin), tlS = WFCCalc.timeline('swap', H, F.runtimeH, F.chargeH, F.swapMin);
      const full = H <= F.runtimeH + 1e-9;
      const tcard = (title, sub, svg, res, proposed) => `<div class="outline col gap12" style="padding:18px 32px 8px;${proposed ? 'border-color:var(--blue);background:var(--tint)' : ''}">
          <div class="row" style="justify-content:space-between;align-items:center"><div class="row" style="align-items:center;gap:20px"><h3>${title}</h3>${proposed ? '<span class="chip dark">Proposed</span>' : ''}</div><p class="t24 b blue-t">${res}</p></div>
          <p class="t24 body">${sub}</p>${svg}</div>`;
      const rec = F.swapSavesAmrs > 0
        ? `Swapping spare batteries saves <b>${F.swapSavesAmrs} ${plural(F.swapSavesAmrs, 'AMR', 'AMRs')}</b> against waiting to charge, at the cost of ${F.swap.extraBatteries} spare ${plural(F.swap.extraBatteries, 'battery', 'batteries')}.`
        : (full ? `One full charge covers the whole ${H} h day, so AMRs charge between shifts and no spare batteries are needed.` : 'Auto-charging is enough for this workload, so no spare batteries are needed.');
      add('battery', 'Charging and battery plan', `
        ${head('Solution', 'Charging and battery plan')}
        <div class="col" style="gap:20px">
          ${tcard('Auto-charging', `AMR runs up to ${n1(F.runtimeH)} h (8 h empty, 6–7 h loaded), then charges for ${n1(F.chargeH)} h.`, timelineSvg(tlC, H), `${F.charge.amrs} ${plural(F.charge.amrs, 'AMR', 'AMRs')}`, strat === 'charge')}
          ${tcard('Spare battery swap', `An operator swaps in a charged pack by hand in about ${F.swapMin} min, so the AMR does not wait to charge.`, timelineSvg(tlS, H), `${F.swap.amrs} ${plural(F.swap.amrs, 'AMR', 'AMRs')}${F.swap.extraBatteries ? ` + ${F.swap.extraBatteries} spare ${plural(F.swap.extraBatteries, 'battery', 'batteries')}` : ''}`, strat === 'swap')}
        </div>
        <div class="row" style="align-items:center;gap:32px"><div class="legend"><span><i style="background:#204CBA"></i>Working</span><span><i style="background:#0B1220"></i>Charging</span><span><i style="background:#8FB0F5"></i>Battery swap</span></div></div>
        <p class="t32 body">${rec}</p>`);
    }

    /* ---- Workflow ---- */
    const phases = parseWorkflow(S.workflow.lines);
    if (phases.length) {   // four phases left to right, each a short list; sized to fit above the footer
      const chev = '<svg width="28" height="28" viewBox="0 0 28 28" style="flex:none;align-self:center"><path d="M8 5l10 9-10 9" fill="none" stroke="#204CBA" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const card = (ph, i) => `<div class="card col f1" style="padding:28px;gap:22px;min-width:0"><div class="col gap8"><p class="eyebrow">Phase ${i + 1}</p><p style="font-size:34px;font-weight:700;line-height:1.15">${esc(ph.name)}</p></div>
        ${ph.steps.slice(0, 3).map(st => `<div class="row" style="gap:16px;align-items:flex-start"><div class="badge" style="width:42px;height:42px;font-size:21px">${st.n}</div><div class="col grow" style="gap:4px;min-width:0"><p style="font-size:28px;font-weight:700;line-height:1.2">${esc(st.title)}</p>${st.who ? `<p style="font-size:22px;line-height:1.3;color:var(--muted)">${esc(st.who)}</p>` : ''}</div></div>`).join('')}</div>`;
      add('workflow', 'Operational workflow', `
        ${head('Solution', 'Operational workflow')}
        <div class="row" style="gap:12px;align-items:stretch">${phases.map(card).join(chev)}</div>
        ${S.workflow.note ? `<div class="card dark" style="padding:18px 36px"><p class="white" style="font-size:28px;line-height:1.35">${esc(S.workflow.note)}</p></div>` : ''}`);
    }

    /* ---- System workflow (fixed): a flowchart in two lanes, equal boxes, one arrow style ---- */
    const fArrow = c => `<svg width="44" height="24" viewBox="0 0 44 24" style="flex:none;align-self:center"><path d="M3 12h34M28 4l10 8-10 8" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const fNode = (n, t, d, dark) => `<div class="col" style="flex:0 0 240px;gap:10px;border-radius:20px;padding:24px 22px;${dark ? 'background:#fff;border:2px solid var(--ink)' : 'background:var(--tint)'}"><div style="width:36px;height:36px;border-radius:50%;background:${dark ? 'var(--ink)' : 'var(--blue)'};color:#fff;font-weight:700;font-size:20px;display:flex;align-items:center;justify-content:center">${n}</div><p style="font-size:28px;font-weight:700;line-height:1.2">${t}</p>${d ? `<p style="font-size:22px;line-height:1.35;color:var(--muted)">${d}</p>` : ''}</div>`;
    const fLane = (items, dark) => `<div style="display:flex;align-items:stretch">${items.map((it, i) => (i ? fArrow(dark ? '#0B1220' : '#204CBA') : '') + fNode(i + 1, it[0], it[1], dark)).join('')}</div>`;
    add('system', 'System workflow', `
      ${head('Solution', 'System workflow')}
      <div class="col gap16"><p class="eyebrow" style="color:var(--muted)">Flexible operation</p>${fLane([['Call box', 'Operator presses the trigger button'], ['RCS', 'System receives the signal'], ['Action send', 'Nearest AMR is dispatched'], ['AMR transfer', 'Moves the pallet to its location'], ['Completed signal', 'Task completed, sent to RCS'], ['Return charging', 'AMR returns to charge or standby']], false)}</div>
      <div class="col gap16"><p class="eyebrow" style="color:var(--muted)">Error operation</p>${fLane([['Error occurs'], ['AMR manual mode'], ['Manual transfer'], ['Error analysis and solving'], ['Restart auto mode']], true)}</div>`);
    /* ---- Why this AMR (from the solver's checks, when the proposal was built from a brief) ---- */
    const sol = S.solution || {}, checks = (sol.checks || []).slice(0, 6), whyList = (sol.why || []).slice(0, 4);
    if (M && checks.length) {
      const tick = ok => `<div style="width:52px;height:52px;border-radius:50%;background:${ok ? 'var(--blue)' : '#B42318'};flex:none;display:flex;align-items:center;justify-content:center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ok ? '<path d="M5 12.5l4.5 4.5L19 7.5"/>' : '<path d="M6 6l12 12M18 6L6 18"/>'}</svg></div>`;
      add('whyamr', 'Why this AMR', `
        ${head('Solution', 'Why this AMR')}
        <div class="row" style="gap:48px;align-items:stretch">
          <div class="col grow" style="gap:20px">${checks.map(c => `<div class="row" style="gap:24px;align-items:center;border:2px solid var(--line);border-radius:20px;padding:20px 28px">${tick(c.ok)}<div class="col gap8 grow"><p class="t32 b" style="line-height:1.2">${esc(c.label)}</p><p class="t24 body">${esc(c.detail)}</p></div></div>`).join('')}</div>
          <div class="card dark col" style="width:640px;gap:24px;justify-content:space-between;padding:40px">
            <div class="col gap12"><p class="eyebrow sky">Recommended</p><h2 style="color:#fff;font-size:56px;line-height:1.1">${esc(M.name)}</h2><p class="t32 white">${qty} ${plural(qty, 'unit', 'units')} for this scenario</p></div>
            <div class="col gap12">${whyList.map(w => `<p class="t24 ondark" style="line-height:1.35">${esc(w)}</p>`).join('')}</div>
          </div>
        </div>`);
    }

    /* ---- AMR specification ---- */
    if (M) {
      const rows = [
        ['Model', esc(M.name)],
        ['Load capacity', `${n0(M.payloadKg)} kg`],
        ['Lifting height', `${n0(M.liftMm)} mm`],
        M.speed ? ['Travel speed', esc(M.speed)] : null,
        M.battery ? ['Battery', esc(M.battery)] : null,
        ['Runtime', 'Up to 8 h empty, 6–7 h fully loaded'],
        ['Full charge', `About ${n1(fl.chargeH)} h`],
        M.safety ? ['Safety', esc(M.safety)] : null,
        ['Navigation', `${esc(M.nav || 'Laser SLAM')}${M.accuracy ? ', ' + esc(M.accuracy) : ''}`]
      ].filter(Boolean);
      add('amr', 'AMR specification', `
        ${head('Solution', 'AMR specification')}
        <div class="row" style="gap:48px;align-items:flex-start">
          <div class="col gap16" style="width:560px">
            <div class="imgcard" style="width:560px;height:520px;background:${photoBg}">${modelImg ? `<img class="contain" src="${modelImg}" alt="${esc(M.name)}" style="width:500px;height:480px">` : `<div class="placeholder" style="width:500px;height:480px">${esc(M.type)}</div>`}</div>
            <div class="row" style="align-items:center;gap:16px"><span class="chip dark">× ${qty} ${plural(qty, 'unit', 'units')}</span><span class="chip">${esc(M.type)}</span></div>
          </div>
          <div class="col grow">${rows.slice(0, 10).map(r => `<div class="specrow" style="padding:10px 0"><p class="k">${r[0]}</p><p class="v">${r[1]}</p></div>`).join('')}</div>
        </div>`);
    }

    /* ---- Safety (fixed): two layers, each with a picture, three short points ---- */
    const sector = (cx, cy, rx, ry) => { const p = a => [cx + rx * Math.cos(a * Math.PI / 180), cy + ry * Math.sin(a * Math.PI / 180)].map(v => Math.round(v * 10) / 10).join(' '); return `M${cx} ${cy} L${p(-135)} A${rx} ${ry} 0 1 1 ${p(135)} Z`; };
    const scanSvg = `<svg viewBox="0 0 740 250" width="740" height="250" style="display:block" font-family="DM Sans, Arial, sans-serif">
      <path d="${sector(190, 125, 300, 112)}" fill="#204CBA" opacity=".09"/><path d="${sector(190, 125, 200, 84)}" fill="#204CBA" opacity=".14"/><path d="${sector(190, 125, 110, 52)}" fill="#204CBA" opacity=".24"/>
      <line x1="190" y1="125" x2="396" y2="125" stroke="#204CBA" stroke-width="2.5" stroke-dasharray="3 9" stroke-linecap="round"/>
      <rect x="86" y="76" width="34" height="10" rx="5" fill="#26324A"/><rect x="86" y="164" width="34" height="10" rx="5" fill="#26324A"/><rect x="80" y="82" width="110" height="86" rx="20" fill="#0B1220"/>
      <circle cx="172" cy="125" r="13" fill="#204CBA" stroke="#fff" stroke-width="3"/><rect x="96" y="112" width="40" height="26" rx="8" fill="#26324A"/>
      <ellipse cx="420" cy="125" rx="14" ry="28" fill="#5B6577"/><circle cx="420" cy="125" r="13" fill="#0B1220"/>
      <line x1="190" y1="226" x2="490" y2="226" stroke="#0B1220" stroke-width="2"/><line x1="190" y1="216" x2="190" y2="236" stroke="#0B1220" stroke-width="2"/><line x1="490" y1="216" x2="490" y2="236" stroke="#0B1220" stroke-width="2"/>
      <rect x="314" y="205" width="68" height="42" rx="21" fill="#fff" stroke="#C9D3EA" stroke-width="1.5"/><text x="348" y="234" font-size="23" font-weight="700" text-anchor="middle" fill="#0B1220">3 m</text>
      <rect x="548" y="82" width="116" height="42" rx="21" fill="#204CBA"/><text x="606" y="111" font-size="23" font-weight="700" text-anchor="middle" fill="#fff">270°</text></svg>`;
    const bumpSvg = `<svg viewBox="0 0 740 250" width="740" height="250" style="display:block" font-family="DM Sans, Arial, sans-serif">
      <line x1="30" y1="222" x2="710" y2="222" stroke="#3A4A6B" stroke-width="3" stroke-linecap="round"/>
      <rect x="70" y="100" width="300" height="100" rx="18" fill="#2A3756"/><rect x="118" y="72" width="76" height="34" rx="10" fill="#3A4A6B"/><circle cx="156" cy="89" r="8" fill="#8FB0F5"/>
      <circle cx="134" cy="206" r="24" fill="#0B1220" stroke="#3A4A6B" stroke-width="5"/><circle cx="306" cy="206" r="24" fill="#0B1220" stroke="#3A4A6B" stroke-width="5"/>
      <rect x="364" y="116" width="28" height="84" rx="12" fill="#8FB0F5"/>
      <path d="M408 132h42M408 158h52M408 184h42" stroke="#8FB0F5" stroke-width="6" stroke-linecap="round"/>
      <rect x="500" y="74" width="64" height="148" rx="8" fill="#9AA6BD"/><path d="M500 118l64-30M500 158l64-30M500 198l64-30" stroke="#B9C3D6" stroke-width="5" opacity=".8"/>
      <circle cx="652" cy="120" r="44" fill="#fff"/><rect x="634" y="102" width="36" height="36" rx="7" fill="#0B1220"/></svg>`;
    const tick = (txt, dark) => `<div class="row" style="gap:16px;align-items:center"><svg width="32" height="32" viewBox="0 0 32 32" style="flex:none"><circle cx="16" cy="16" r="16" fill="${dark ? '#8FB0F5' : '#204CBA'}"/><path d="M9 16.5l4.6 4.6 9.4-9.6" fill="none" stroke="${dark ? '#0B1220' : '#fff'}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg><p style="font-size:27px;line-height:1.3;${dark ? 'color:#D5DEF0' : ''}">${txt}</p></div>`;
    add('safety', 'Dual-layer safety', `
      ${head('Solution', 'Dual-layer safety')}
      <div class="row" style="align-items:stretch;gap:24px">
        <div class="card col f1" style="padding:32px 40px;gap:22px">${scanSvg}<div class="col gap8"><p class="eyebrow">Layer 1 · Non-contact</p><p class="t44">Active laser scanning</p></div>
          <div class="col" style="gap:14px">${tick('270° field of view, range up to 3 m')}${tick('Slows and stops, with audible and visual warnings')}${tick('Resumes automatically once the way is clear')}</div></div>
        <div class="card dark col f1" style="padding:32px 40px;gap:22px">${bumpSvg}<div class="col gap8"><p class="eyebrow sky">Layer 2 · Contact</p><p class="t44 white">Front-edge safety bumper</p></div>
          <div class="col" style="gap:14px">${tick('Immediate emergency stop on impact', true)}${tick('Manual inspection and reset before restart', true)}${tick('Keeps the site secure after any contact', true)}</div></div>
      </div>`);
    /* ---- Service contract: four icon cards, and one year drawn as a strip ---- */
    const svc = (ic, t, d) => `<div class="card row f1" style="gap:28px;align-items:center;padding:30px 36px">${icon(ic)}<div class="col gap8 grow"><h3>${t}</h3><p class="t24 body">${d}</p></div></div>`;
    const yearStrip = (() => {
      const x = [200, 520, 840, 1160], W = 1664, y = 52;
      return `<svg viewBox="0 0 ${W} 130" width="${W}" height="130" style="display:block" font-family="DM Sans, Arial, sans-serif"><line x1="60" y1="${y}" x2="1500" y2="${y}" stroke="#C9D3EA" stroke-width="4" stroke-linecap="round"/>`
        + x.map((cx, i) => `<circle cx="${cx}" cy="${y}" r="22" fill="#204CBA"/><path d="M${cx - 9} ${y + 1}l6 6 12-13" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><text x="${cx}" y="${y + 66}" font-size="24" font-weight="700" text-anchor="middle" fill="#0B1220">Quarter ${i + 1}</text>`).join('')
        + `<circle cx="1500" cy="${y}" r="26" fill="#0B1220"/><path d="M1490 ${y + 12}V${y - 12}l22 7-22 7" fill="#fff"/><text x="1500" y="${y + 66}" font-size="24" font-weight="700" text-anchor="middle" fill="#0B1220">Yearly refresher</text>`
        + `<text x="60" y="${y - 32}" font-size="22" fill="#5B6577">On-site inspection every quarter</text></svg>`;
    })();
    add('service', 'Service and maintenance', `
      ${head('Support', 'Service and maintenance')}
      <div class="col" style="gap:24px">
        <div class="row" style="gap:24px">${svc('wrench', 'Spare parts and wear-item check', 'Hardware inspection and replacement of wear components.')}${svc('calendar', 'Quarterly on-site inspections', 'Preventive maintenance with hardware and software checklists.')}</div>
        <div class="row" style="gap:24px">${svc('headset', 'Priority remote and site support', 'Fast response for faults and troubleshooting, with hotline and scheduled visits.')}${svc('book', 'Yearly operator refresher', 'Annual training so new staff are briefed and operators keep best practice.')}</div>
      </div>
      <div style="background:var(--tint);border-radius:24px;padding:18px 0 0">${yearStrip}</div>`);

    /* ---- Why WFC: two icon cards, and the process as a connected list ---- */
    const proc = [['plan', 'Plan', 'Assess workflows and design the ideal solution.'], ['deploy', 'Deploy', 'Configure and install systems on-site.'], ['handover', 'Handover', 'Test performance and train operators.'], ['support', 'Support', 'Ongoing maintenance and technical assistance.']];
    const stepD = (p, i) => `<div class="row" style="gap:22px;align-items:stretch"><div class="col" style="align-items:center;width:60px;flex:none"><div style="width:60px;height:60px;border-radius:50%;background:#8FB0F5;display:flex;align-items:center;justify-content:center;flex:none"><div style="width:30px;height:30px">${ICON2[p[0]].replace(/#fff/g, '#0B1220')}</div></div>${i < proc.length - 1 ? '<div style="width:3px;flex:1;background:#33415F;margin:6px 0"></div>' : ''}</div><div class="col" style="gap:4px;padding-bottom:${i < proc.length - 1 ? 18 : 0}px"><p class="t32 b white" style="line-height:1.2">${p[1]}</p><p class="t24" style="color:var(--ondark)">${p[2]}</p></div></div>`;
    const wcard = (ic, t, sub, d) => `<div class="card row f1" style="gap:28px;align-items:center;padding:32px 36px">${icon(ic)}<div class="col gap8 grow"><h3>${t}</h3><p class="t24 b blue-t">${sub}</p><p class="t24 body">${d}</p></div></div>`;
    add('why', 'Why WFC Systems', `
      ${head('Support', 'Why WFC Systems')}
      <div class="row" style="align-items:stretch;gap:32px">
        <div class="col" style="width:960px;gap:32px">${wcard('headset', 'Local technical support', 'Fast response, minimal downtime', 'Our local software and mechanical engineers support your AMRs through remote troubleshooting or on-site visits.')}${wcard('box', 'Ex-stock wear components', 'Quick replacement, zero waiting', 'We keep key wear parts such as tyres, batteries and electrical components in stock for fast replacement.')}</div>
        <div class="card dark col grow" style="padding:36px 40px;gap:24px"><p class="eyebrow sky">Our process</p><div class="col">${proc.map(stepD).join('')}</div></div>
      </div>`);
    /* ---- Thank you ---- */
    const ct = S.contact;
    add('thanks', 'Thank you', `
      <div style="position:absolute;left:1320px;top:0;width:600px;height:1080px;background:var(--blue)"></div>
      <div style="position:absolute;left:1380px;top:200px;width:480px;height:680px;background:${heroBg};border-radius:32px"></div>
      ${heroImg ? `<img class="contain" src="${heroImg}" alt="" style="position:absolute;left:1400px;top:220px;width:440px;height:640px">` : ''}
      <div class="col" style="width:1000px;height:824px;justify-content:space-between">
        <div style="width:308px;height:173px;background:#fff;border-radius:24px;display:flex;align-items:center;justify-content:center"><img class="contain" src="${I.logo}" alt="WFC Systems" style="width:260px;height:125px"></div>
        <div class="col gap16"><h1 style="font-size:96px;font-weight:700;line-height:1.05;color:#fff">Thank you</h1><p class="t32" style="color:var(--sky)">${esc(co.tagline)}</p></div>
        <div class="row" style="gap:48px"><div class="col gap8" style="width:440px"><p class="t32 b white">${esc(ct.name)}</p><p class="t24" style="color:var(--ondark)">${esc(ct.phone)}</p><p class="t24" style="color:var(--ondark)">${esc(ct.email)}</p></div>
          <div class="col gap8" style="width:480px"><p class="t32 b white">${esc(co.name)}</p><p class="t24" style="color:var(--ondark)">${esc(co.web)}</p><p class="t24" style="color:var(--ondark)">${esc(co.address)}</p></div></div>
      </div>`, { noFoot: true, dark: true, style: 'padding:128px;background:var(--ink);color:#fff' });

    return slides;
  }

  root.WFCSlides = { build, longDate, rm, n0, n1, n2, esc, planSvg, planSvgInner, POINT_KINDS };
})(window);
