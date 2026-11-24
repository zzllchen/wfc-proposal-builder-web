/* WFC Proposal Builder: form, slide viewer, fleet calculator, PDF and project files.
   Pricing and quotation are not part of the proposal; they will live in the Quotation tab (coming soon). */
(function () {
  'use strict';
  const C = WFCCalc, DB = WFCDB, SL = WFCSlides, num = C.num, esc = SL.esc;
  const LS = 'wfc-proposal-builder-v3', LS_OLD = 'wfc-proposal-builder-v2', APP_TITLE = 'Proposal Builder · WFC Systems';
  const qs = new URLSearchParams(location.search);
  const printMode = !!qs.get('print'), printDoc = qs.get('doc') || '';   // doc=quotation: the page prints the quotation instead of the slides
  const volatile = !!(qs.get('preset') || qs.get('state'));   // ?preset= is a throwaway preview: never overwrite the saved proposals
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const set = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k] == null ? (a[k] = {}) : a[k], o)[last] = v; };

  function merge(base, extra) {
    if (extra == null || typeof extra !== 'object' || Array.isArray(extra) || typeof base !== 'object' || Array.isArray(base) || base === null) return extra === undefined ? base : extra;
    const out = Object.assign({}, base);
    Object.keys(extra).forEach(k => { out[k] = k in base ? merge(base[k], extra[k]) : extra[k]; });
    return out;
  }
  const clean = s => { delete s.pricing; if (s.fleet) delete s.fleet.batteryCost; return s; };

  // Several proposals can be open at once (document tabs). docs[act].S is the active proposal; S points at it.
  let docs = [], act = 0, S, D, out = [], cur = null, openSec = 'client', stageHtml = '', filmSig = '', filmCache = {}, tabSig = '';

  const hash = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h; };
  let uid = 0;
  const mk = (s, c, h, ph) => ({ ph: !!ph, id: 'd' + Date.now().toString(36) + (uid++), S: s, cur: c || null, h: h == null ? hash(JSON.stringify(s)) : h });   // h = fingerprint at the last file save, to tell unsaved changes
  const isDirty = d => hash(JSON.stringify(d.S)) !== d.h;

  /* ---------- storage ---------- */
  function loadStore() {
    try {
      const j = localStorage.getItem(LS);
      if (j) {
        const o = JSON.parse(j);
        if (o && Array.isArray(o.docs) && o.docs.length) return { docs: o.docs.map(d => mk(clean(merge(WFCPresets.blank(), d.S)), d.cur, d.h, d.ph)), active: Math.min(Math.max(0, o.active | 0), o.docs.length - 1) };
      }
      const old = localStorage.getItem(LS_OLD);   // the single proposal saved by the earlier version
      if (old) return { docs: [mk(clean(merge(WFCPresets.blank(), JSON.parse(old))))], active: 0 };
    } catch (e) { /* ignore */ }
    return null;
  }
  // the status pill in the top bar: saved, saving, busy (PDF), done or error
  function status(state, text) { const h = $('#saveHint'); if (!h) return; h.dataset.state = state; h.textContent = text; h.title = text; }
  let saveT;
  function persist() {
    if (volatile) return;
    clearTimeout(saveT);
    const h = $('#saveHint'); if (h && h.dataset.state !== 'busy') status('saving', 'Saving…');
    saveT = setTimeout(() => {
      try {
        if (docs[act]) docs[act].cur = cur;
        localStorage.setItem(LS, JSON.stringify({ v: 3, active: act, docs: docs.map(d => ({ id: d.id, S: d.S, cur: d.cur, h: d.h, ph: d.ph })) }));
        if (h && h.dataset.state !== 'busy') { status('saved', 'Saved'); h.title = 'All changes are saved on this device'; }
      } catch (e) { status('error', 'Not auto-saved (too many photos for the browser). Use File, Save project.'); }
    }, 400);
  }

  /* ---------- document tabs ---------- */
  function tabLabels() {
    const seen = {};
    return docs.map(d => { const base = (d.S.client.name || '').trim() || 'New proposal'; seen[base] = (seen[base] || 0) + 1; return seen[base] > 1 ? `${base} (${seen[base]})` : base; });
  }
  function renderTabs() {
    const box = $('#docTabs'); syncStart(); if (!box) return;
    const labels = tabLabels(), sig = act + '|' + labels.join('|');
    if (sig === tabSig) return;
    tabSig = sig;
    box.innerHTML = docs.map((d, i) => d.ph ? '' : `<div class="doctab${i === act ? ' active' : ''}" role="tab" aria-selected="${i === act}" data-i="${i}" title="${esc(labels[i])}"><span class="dn">${esc(labels[i])}</span><button class="dx" data-close="${i}" title="Close" aria-label="Close ${esc(labels[i])}">×</button></div>`).join('');
    const a = $('.doctab.active', box); if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  /* ---------- scroll view: the whole proposal as one page to read down ---------- */
  let viewMode = 'slides', scrollSig = '', scrollObs = null;
  const scrollSeen = new Set(), scrollCache = {};
  function setView(mode) {
    if (mode === 'scroll') closeEditor();
    viewMode = mode; document.body.dataset.view = mode;
    $('#stage').hidden = mode === 'scroll'; $('#film').hidden = mode === 'scroll'; $('#scroll').hidden = mode !== 'scroll';
    $$('#viewSeg .tab').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
    if (mode === 'scroll') { scrollSig = ''; renderScroll(); } else { stageHtml = ''; drawStage(); renderFilm(); }
  }
  // Proposal and Simulation are two views of the same open proposal; the simulation redraws whenever the proposal changes
  function setTab(name) {
    document.body.dataset.tab = name; $$('#tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name)); $('#sim').hidden = name !== 'sim'; $('#concept').hidden = name !== 'concept'; $('#quote').hidden = name !== 'quote'; $('#btnPdf').title = name === 'quote' ? 'Download the quotation as a PDF' : 'Download the proposal as a PDF';
    if (window.WFCPanel) WFCPanel.hold(name === 'quote');   // the quotation gets the whole width; the arrow on the divider brings the form panel back
    if (name !== 'concept' && window.WFCConcept) WFCConcept.stop();
    if (name === 'sim') { closeEditor(); if (window.WFCSimUI) WFCSimUI.update(S, D); } else if (name === 'concept') { closeEditor(); if (window.WFCConcept) WFCConcept.update(S); } else if (name === 'quote') { closeEditor(); if (window.WFCQuote) WFCQuote.update(S, derive()); } else { stageHtml = ''; flush(); }
  }
  function renderScroll() {
    if (viewMode !== 'scroll') return;
    const box = $('#scroll'), W = Math.round(Math.max(360, Math.min(box.clientWidth - 56, 1180))), k = W / 1920, H = Math.round(1080 * k);
    const sig = out.map(s => s.id + (S.slides.off[s.id] ? 0 : 1)).join() + '|' + W;
    if (sig !== scrollSig) {
      scrollSig = sig; scrollSeen.clear(); Object.keys(scrollCache).forEach(q => delete scrollCache[q]);
      if (scrollObs) scrollObs.disconnect();
      box.innerHTML = `<div class="sc-col" style="width:${W}px">${out.map((s, i) => `<section class="sc-item${S.slides.off[s.id] ? ' off' : ''}" data-id="${s.id}"><div class="sc-meta"><span>${String(i + 1).padStart(2, '0')} · ${esc(s.name)}</span><label><input type="checkbox" data-tick="${s.id}" ${S.slides.off[s.id] ? '' : 'checked'}> In the proposal</label></div><div class="sc-slide" style="width:${W}px;height:${H}px" title="Click to open this slide"><div class="scaler" style="width:1920px;height:1080px;transform:scale(${k})"></div></div></section>`).join('')}</div>`;
      scrollObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { scrollSeen.add(e.target.dataset.id); fillScroll(); } }), { root: box, rootMargin: '900px 0px' });
      $$('.sc-item', box).forEach(el => scrollObs.observe(el));
    }
    $('#stageTitle').innerHTML = `Whole proposal<small>${included().length} pages · scroll to read</small>`;
    fillScroll();
  }
  function fillScroll() {
    const box = $('#scroll');
    out.forEach(s => {
      if (!scrollSeen.has(s.id)) return;
      const html = wrapSlide(s, pageNo(s.id));
      if (scrollCache[s.id] === html) return;
      const el = $(`.sc-item[data-id="${s.id}"] .scaler`, box); if (el) { el.innerHTML = html; scrollCache[s.id] = html; }
    });
  }

  /* ---------- layout editor (draw the plan on the site layout) ---------- */
  function openEditor() {
    if (viewMode !== 'slides') setView('slides');
    if (!S.images.layout) { alert('Add the site layout image first (step 3, Site and route).'); return; }
    if (!S.layoutPlan) S.layoutPlan = { scale: null, zones: [], points: [], routes: [], sync: true };
    $('#stage').hidden = true; $('#film').hidden = true; $('#editor').hidden = false;
    WFCLayoutEditor.open({
      host: $('#editor'), getPlan: () => S.layoutPlan, getImage: () => S.images.layout, getAspect: () => D.layoutAspect || imgAspect(S.images.layout),
      getLegend: () => S.site.legend, getDefaults: () => ({ pickup: S.site.pickup, drop: S.site.drop }),
      onChange: planChanged, onClose: closeEditor,
      ai: {
        available: () => WFCConnect.hasClaude(), connect: () => WFCConnect.open(), explain: e => WFCIntakeAI.explain(e),
        run: async (instruction, current) => {
          const o = WFCConnect.claudeOpts(), aspect = D.layoutAspect || imgAspect(S.images.layout);
          if (!o) throw new Error('Claude is not connected. Open AI connections.');
          const has = ['zones', 'points', 'routes'].some(k => (current[k] || []).length);
          const res = await WFCPlanAI.solve({ apiKey: o.apiKey, model: o.model, text: briefText(), layout: S.images.layout, aspect, models: DB.models,
            instruction: instruction || (has ? 'Redraw everything from the description.' : 'Draw only the pick-up and drop-off boxes, the numbered pick-up points, the lettered drop-off spots and the one longest route, from the description. Keep it minimal.'), current: has ? WFCPlanAI.describe(current) : {} });
          // the scale: keep one the user set; otherwise measure the longest route as the stated distance
          if (!(current.scale && !current.scale.assumed)) WFCPlanAI.calibrate(res.plan, aspect, S.route.distanceM);
          return { plan: res.plan, note: `Done (about RM ${res.costRM.toFixed(2)}). Move anything that is not quite right, or press Undo.` };
        }
      }
    });
  }
  // the description Claude works from: what was pasted in, or else what the form says
  function briefText() {
    if (S.brief && S.brief.trim()) return S.brief;
    const sp = String(S.site.dropSpots || '').trim();
    return [S.scenario.transfer, S.site.pickup && 'Pick-up: ' + S.site.pickup, S.site.drop && 'Drop-off: ' + S.site.drop + (sp ? ', spots ' + sp : ''), num(S.route.distanceM) > 0 && `The longest one-way route is about ${S.route.distanceM} m.`, S.workflow.lines].filter(Boolean).join('\n');
  }
  function closeEditor() {
    if (!WFCLayoutEditor.isOpen() && $('#editor').hidden) return;
    WFCLayoutEditor.close();
    $('#editor').hidden = true; $('#stage').hidden = false; $('#film').hidden = false;
    stageHtml = ''; flush();
  }
  // a route was drawn or moved: keep the route distance (and so the AMR count) in step with it
  function planChanged() {
    const p = S.layoutPlan, L = C.planLongestM(p, D.layoutAspect);
    if (p.sync && L > 0) {
      const v = Math.round(L);
      if (num(S.route.distanceM) !== v) { S.route.distanceM = v; const inp = $('[data-p="route.distanceM"]'); if (inp) inp.value = v; }
    }
    refresh();
  }

  function activate(i, skipSave) {
    closeEditor();
    if (!skipSave && docs[act]) docs[act].cur = cur;
    act = i; S = docs[i].S; cur = docs[i].cur; stageHtml = ''; filmSig = ''; filmCache = {}; tabSig = '';
    renderSide(); flush(); renderTabs(); persist();
  }
  function addDoc(s) { const hadPh = docs.some(d => d.ph); docs = docs.filter(d => !d.ph); docs.push(mk(s)); activate(docs.length - 1, hadPh); }
  // with no proposal open the work area shows a start screen (a hidden blank proposal keeps the app valid underneath)
  function syncStart() { const el = $('#start'); if (el) el.hidden = !(docs.length && docs.every(d => d.ph)); }
  function closeDoc(i) {
    const d = docs[i], label = tabLabels()[i];
    if (isDirty(d) && !confirm(`"${label}" has changes that are only kept on this PC.\n\nClose it anyway? (Use File, Save project first if you want a copy.)`)) return;
    docs.splice(i, 1);
    if (!docs.length) { const p0 = mk(WFCPresets.blank()); p0.ph = true; docs.push(p0); }
    if (i === act) activate(Math.min(i, docs.length - 1), true);
    else { if (i < act) act--; tabSig = ''; renderTabs(); persist(); }
  }

  /* ---------- derived numbers ---------- */
  function derive() {
    const model = DB.models.find(m => m.id === S.model) || DB.models[0];
    const sc = S.scenario, fl = S.fleet;
    const F = C.fleetSize({ shifts: sc.shifts, hoursPerShift: sc.hoursPerShift, tripsPerDay: sc.tripsPerDay, route: S.route, runtimeH: fl.runtimeH, chargeH: fl.chargeH, swapMin: fl.swapMin, maxUtilPct: fl.maxUtilPct, peakFactor: fl.peakFactor, spareAmr: fl.spareAmr });
    const cycle = C.routeCycle(S.route);
    let qty = F.ok ? (fl.strategy === 'swap' ? F.swap : F.charge).amrs : 1;
    const ov = Math.floor(num(fl.qtyOverride)); if (ov > 0) qty = ov;
    return { model, fleet: F, cycle, qty, override: ov > 0 ? ov : 0, layoutAspect: imgAspect(S.images.layout) };
  }

  // width / height of the site layout picture (needed to draw and measure the plan on it); 0 until the picture has loaded
  const aspectCache = new Map();
  function imgAspect(src) {
    if (!src) return 0;
    if (aspectCache.has(src)) return aspectCache.get(src);
    aspectCache.set(src, 0);
    const im = new Image();
    im.onload = () => { aspectCache.set(src, im.naturalWidth / im.naturalHeight || 0); refresh(); };
    im.src = src;
    return 0;
  }

  /* ---------- form definition ---------- */
  const T = (p, l, o) => Object.assign({ p, l, t: 'text' }, o);
  const N = (p, l, o) => Object.assign({ p, l, t: 'number' }, o);
  const pl = (n, a, b) => n === 1 ? a : b;
  const FORM = [
    { id: 'client', title: 'Client', sub: () => S.client.name || 'Who is the proposal for?', blocks: [
      { fields: [T('client.name', 'Client company', { full: 1, req: 1 }), T('client.attn', 'Attention', { req: 1 }), { p: 'client.date', l: 'Date', t: 'date', req: 1 }] },
      { head: 'WFC contact', fields: [{ p: 'contact.name', l: 'Name', t: 'select', full: 1, o: contactOptions, req: 1 }, { t: 'contactinfo' }] },
      { more: 'More details', fields: [{ p: 'client.address', l: 'Address', t: 'textarea', full: 1 }, T('client.ref', 'Reference no.'), { p: 'brief', l: 'Project description (from the intake)', t: 'textarea', full: 1, rows: 4 }, T('title', 'Proposal title'), T('subtitle', 'Subtitle', { full: 1 }), { p: 'client.logo', l: 'Client logo (optional)', t: 'image' }] }] },
    { id: 'scenario', title: 'Operation and pallet', sub: () => [S.scenario.shifts && `${S.scenario.shifts} ${pl(+S.scenario.shifts, 'shift', 'shifts')}`, S.scenario.tripsPerDay && `${S.scenario.tripsPerDay} trips a day`, S.scenario.loadKg && `${S.scenario.loadKg} kg`].filter(Boolean).join(' · ') || 'Shifts, trips and the pallet', blocks: [
      { head: 'Operation', fields: [N('scenario.shifts', 'Shifts per day', { req: 1 }), N('scenario.hoursPerShift', 'Hours per shift', { req: 1 }), N('scenario.stations', 'Pick-up stations', { req: 1 }), N('scenario.tripsPerDay', 'Trips per day', { req: 1 }), N('scenario.loadKg', 'Max load per pallet (kg)', { req: 1 }), { p: 'scenario.traffic', l: 'Traffic density risk', t: 'select', o: ['Low', 'Medium', 'High'] }, T('scenario.transfer', 'Transfer description', { full: 1, req: 1 })] },
      { more: 'Daily volume (optional)', fields: [N('scenario.rowsPerDay', 'Rows per day'), N('scenario.minPallets', 'Minimum pallets')] },
      { head: 'Pallet', fields: [T('pallet.type', 'Pallet / component type', { full: 1, req: 1 }), N('pallet.L', 'Length (mm)', { req: 1 }), N('pallet.W', 'Width (mm)', { req: 1 }), N('pallet.H', 'Height (mm)', { req: 1 }), N('pallet.kg', 'Weight (kg)', { req: 1 })] },
      { head: 'Pallet photos', fields: [{ p: 'images.pallet1', l: 'Photo 1: your raw site photo', t: 'image' }, T('captions.pallet1', 'Caption 1', { full: 1 }), { t: 'palletai' }, { p: 'images.pallet2', l: 'Photo 2: close-up', t: 'image' }, T('captions.pallet2', 'Caption 2', { full: 1 })] }] },
    { id: 'site', title: 'Site and route', sub: () => D && D.cycle ? `${S.route.distanceM} m at ${S.route.speedMps} m/s · ${SL.n0(D.cycle.totalS)} s a trip` : 'Layout, route and workflow', blocks: [
      { head: 'Route', fields: [N('route.distanceM', 'Longest one-way route (m)', { h: 'Along the AMR path', req: 1 }), N('route.speedMps', 'Speed (m/s)', { h: '1.3 as in past proposals', req: 1 })] },
      { head: 'Pick-up and drop-off', fields: [T('site.pickup', 'Pick-up area', { full: 1, req: 1 }), T('site.drop', 'Drop-off area', { req: 1 }), T('site.dropSpots', 'Drop-off spots', { h: 'e.g. A B C' }), { p: 'images.layout', l: 'Site layout image', t: 'image', req: 1 }, { t: 'editbtn' }] },
      { more: 'Workflow steps', fields: [{ p: 'workflow.lines', l: 'Phase | Step | Who, one per line', t: 'textarea', full: 1, rows: 7 }, T('workflow.note', 'Summary line', { full: 1 })] },
      { more: 'Route settings', fields: [N('route.bufferPct', 'Real-world buffer (%)'), N('route.dwellS', 'Handling per trip (s)', { h: '0 = not counted' }), { p: 'site.legend', l: 'Legend colours', t: 'select', o: [['brand', 'WFC blue and black'], ['map', 'Match the map (red, orange)']], full: 1 }] }] },
    { id: 'fleet', title: 'AMR and fleet size', html: fleetHtml, sub: () => D ? (D.fleet.ok ? `${D.qty} ${pl(D.qty, 'AMR', 'AMRs')} · ${D.model.name}` : 'Enter the trips and the route') : '' }
  ];

  // WFC contact: pick a name, phone and email follow (a name saved earlier that is not in the list stays selectable)
  function contactOptions() {
    const names = DB.contacts.map(c => c.name), cur2 = S.contact && S.contact.name;
    return (!cur2 ? [['', 'Choose a name']] : names.includes(cur2) ? [] : [cur2]).concat(names);
  }
  function contactInfoHtml() {
    const c = S.contact || {};
    return `<div class="contactinfo full" id="contactInfo"><div><span>Phone</span>${esc(c.phone || '')}</div><div><span>Email</span>${esc(c.email || '')}</div></div>`;
  }
  function pickContact() {
    const c = DB.contacts.find(x => x.name === S.contact.name);
    if (c) { S.contact.phone = c.phone; S.contact.email = c.email; }
    const el = $('#contactInfo'); if (el) el.outerHTML = contactInfoHtml();
  }

  // Fields marked req: 1 must be filled for the proposal to be complete; empty ones get a yellow outline (see markMissing)
  function isMissing(f) {
    const v = get(S, f.p);
    if (f.t === 'image') return !v;
    if (f.t === 'number') return !(num(v) > 0);
    return v == null || String(v).trim() === '';
  }
  function markMissing() {
    const side = $('#side'), left = {};
    FORM.forEach(sec => (sec.blocks || []).forEach(b => b.fields.forEach(f => {
      if (!f.req) return;
      const miss = isMissing(f), el = side.querySelector(f.t === 'image' ? `[data-img="${f.p}"]` : `[data-p="${f.p}"]`), box = el && el.closest('.f');
      if (box) box.classList.toggle('missing', miss);
      if (miss) left[sec.id] = (left[sec.id] || 0) + 1;
    })));
    FORM.forEach(sec => { const t = $(`[data-todo="${sec.id}"]`); if (t) { const n = left[sec.id] || 0; t.textContent = n ? `${n} to fill in` : ''; t.hidden = !n; } });
    renderProgress(left);
  }
  // the summary at the top of the form: how many steps are complete and where to go next
  function renderProgress(left) {
    const box = $('#progress'); if (!box) return;
    const steps = FORM.map(sec => ({ id: sec.id, title: sec.title, left: sec.blocks ? (left[sec.id] || 0) : (D && D.fleet && D.fleet.ok ? 0 : 1) }));
    const done = steps.filter(s => !s.left).length, total = steps.length, next = steps.find(s => s.left);
    steps.forEach(s => { const d = $(`details.sec[data-sec="${s.id}"]`); if (d) d.classList.toggle('done', !s.left); });
    box.classList.toggle('complete', !next);
    const nleft = Object.keys(left).reduce((a, k) => a + left[k], 0);
    box.innerHTML = `<div class="ph"><b>Proposal details</b><span>${done} of ${total} steps done</span></div><div class="bar" role="progressbar" aria-label="Steps done" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${Math.round(done / total * 100)}%"></i></div>`
      + (next ? `<div class="pn"><span>${nleft ? `${nleft} required ${pl(nleft, 'field', 'fields')} left` : 'Check the fleet calculation'}</span><button type="button" data-goto="${next.id}">Next: ${esc(next.title)} →</button></div>` : '<div class="pn">Everything required is filled in. Ready to download.</div>');
  }

  function fieldHtml(f) {
    if (f.t === 'contactinfo') return contactInfoHtml();
    if (f.t === 'palletai') return palletAiHtml();
    if (f.t === 'editbtn') return '<div class="f full"><button type="button" class="btn" data-editor>Draw areas, points and routes on the layout…</button><div class="help">Drag boxes, dots and route lines on the picture. The route length sets the fleet size.</div></div>';
    const v = get(S, f.p);
    const cls = 'f' + (f.full ? ' full' : '') + (f.req && isMissing(f) ? ' missing' : '');
    if (f.t === 'image') return `<div class="${cls} full"><label>${f.l}</label><div class="drop" data-img="${f.p}">${v ? `<img src="${v}" alt=""><span>Replace</span><a class="x" data-clear="${f.p}">Remove</a>` : '<span>Drop an image here or click to choose</span>'}<input type="file" accept="image/*"></div></div>`;
    let inner;
    if (f.t === 'select') inner = `<select data-p="${f.p}">${(typeof f.o === 'function' ? f.o() : f.o).map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
    else if (f.t === 'textarea') inner = `<textarea data-p="${f.p}" rows="${f.rows || 3}">${esc(v)}</textarea>`;
    else inner = `<input type="${f.t}" ${f.t === 'number' ? 'step="any"' : ''} data-p="${f.p}" value="${esc(v)}">`;
    return `<div class="${cls}"><label>${f.l}</label>${inner}${f.h ? `<div class="help">${f.h}</div>` : ''}</div>`;
  }
  function blockHtml(b) {
    if (b.more) return `<details class="more"><summary>${b.more}</summary><div class="sbody2">${b.fields.map(fieldHtml).join('')}</div></details>`;
    return (b.head ? `<div class="grp">${b.head}</div>` : '') + b.fields.map(fieldHtml).join('');
  }

  /* ---------- pallet close-up (AI picture, or a closer crop) ---------- */
  function palletAiHtml() {
    const g = WFCConnect.hasGoogle(), c = WFCConnect.hasClaude();
    return `<div class="f full"><div class="pbtns"><button type="button" class="btn ai${c ? '' : ' off'}" data-pai="clean" title="${c ? 'Claude outlines the pallet and the tool places your real photo on a clean studio background' : 'Needs Claude connected (AI button, top bar)'}">✦ Clean background</button>
      <button type="button" class="btn${g ? '' : ' off'}" data-pai="ai" title="${g ? 'Google makes a new studio picture of the pallet in Photo 1 (paid)' : 'Needs a Google AI key (AI button, top bar)'}">AI close-up</button>
      <button type="button" class="btn${c ? '' : ' off'}" data-pai="crop" title="${c ? 'Claude finds the pallet, the tool crops closer and sharpens it' : 'Needs Claude connected (AI button, top bar)'}">Crop closer</button>
      <span class="hint" id="paiMsg">Uses Photo 1 and fills Photo 2.${g || c ? '' : ' Connect AI first (AI button in the top bar), or add Photo 2 yourself.'}</span></div></div>`;
  }
  const PAI = { clean: ['Site pallet on a clean background', 'Claude is outlining the pallet…'], ai: ['Close-up, AI-enhanced from the site photo', 'Google is making the close-up… (10 to 30 seconds)'], crop: ['Closer view of the site pallet', 'Claude is finding the pallet…'] };
  let paiBusy = false;
  async function makeCloseup(kind) {
    const msg = $('#paiMsg'), say = t => { if (msg) msg.textContent = t; };
    if (paiBusy) return;
    if (!S.images.pallet1) { say('Add Photo 1 first (the raw site photo).'); return; }
    const g = WFCConnect.googleOpts(), c = WFCConnect.claudeOpts();
    if (kind === 'ai' && !g) { WFCConnect.open(); return; }
    if (kind !== 'ai' && !c) { WFCConnect.open(); return; }
    paiBusy = true; const doc = docs[act], btns = $$('[data-pai]'); btns.forEach(b => { b.disabled = true; });
    say(PAI[kind][1]);
    try {
      const photo = S.images.pallet1;
      const r = kind === 'ai' ? await WFCImageAI.closeup(Object.assign({ photo }, g))
        : kind === 'clean' ? await WFCImageAI.cleanBackground(Object.assign({ ai: WFCIntakeAI, photo }, c))
        : await WFCImageAI.cropCloser(Object.assign({ ai: WFCIntakeAI, photo }, c, { model: 'claude-haiku-5-5' }));
      const T2 = doc.S; T2.images.pallet2 = r.url; T2.captions.pallet2 = PAI[kind][0];
      if (doc === docs[act]) {
        const drop = $('[data-img="images.pallet2"]'); if (drop) drop.innerHTML = `<img src="${r.url}" alt=""><span>Replace</span><a class="x" data-clear="images.pallet2">Remove</a><input type="file" accept="image/*">`;
        const cap = $('[data-p="captions.pallet2"]'); if (cap) cap.value = T2.captions.pallet2;
        refresh(); say(`Done (about RM ${r.costRM.toFixed(2)}). Not right? Press again, try another button, or replace Photo 2 with your own.`);
      }
    } catch (e) { say(kind === 'ai' ? WFCImageAI.explain(e) : WFCIntakeAI.explain(e)); }
    paiBusy = false; btns.forEach(b => { b.disabled = false; });
  }
  // how the tool worked out the solution (shown at the top of step 4 for a proposal made from a brief)
  function solutionHtml() {
    const s = S.solution; if (!s) return '';
    const li = (t, cls) => `<li${cls ? ` class="${cls}"` : ''}>${esc(t)}</li>`, list = (h, arr, extra) => arr && arr.length ? `<div${extra ? ` class="${extra}"` : ''}><h4>${h}</h4><ul>${arr.join('')}</ul></div>` : '';
    return `<details class="how" open><summary>How this was worked out <small>${esc(s.by || '')}</small></summary><div class="hbody">
      ${list('Why this AMR', (s.why || []).map(w => li(w)))}
      ${list('Requirement checks', (s.checks || []).map(c => li(`${c.label}: ${c.detail}`, c.ok ? 'ok' : 'bad')))}
      ${list('Assumptions to confirm with the client', (s.assumptions || []).map(a => li(a)), 'assume')}
      ${list('Other models considered', (s.alternatives || []).map(a => li(`${a.name}: ${a.why}`)))}
    </div></details>`;
  }

  /* ---------- fleet section ---------- */
  function fleetHtml() {
    const opts = DB.models.map(m => `<option value="${m.id}" ${S.model === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    return `${solutionHtml()}<div class="f full"><label>AMR model</label><select data-p="model">${opts}</select></div>
      <div id="fleetBox"></div>
      <details class="more"><summary>Calculation settings</summary><div class="sbody2">
      ${[N('fleet.runtimeH', 'Runtime per charge (h)', { h: '8 h empty, 6–7 h loaded' }), N('fleet.chargeH', 'Full charge time (h)'), N('fleet.maxUtilPct', 'Max busy time (%)', { h: 'Leaves slack for traffic' }), N('fleet.peakFactor', 'Busiest hour vs average (×)', { h: '1 = evenly spread' }), N('fleet.spareAmr', 'Standby AMRs to add'), N('fleet.swapMin', 'Battery swap time (min)'), N('fleet.qtyOverride', 'Override number of AMRs', { h: 'Blank = use the calculation', full: 1 })].map(fieldHtml).join('')}
      </div></details>`;
  }
  function renderFleetBox() {
    const F = D.fleet, box = $('#fleetBox'); if (!box) return;
    if (!F.ok) { box.innerHTML = `<div class="note err">${F.errors.map(esc).join('<br>')}</div>`; return; }
    const sel = S.fleet.strategy === 'swap' ? 'swap' : 'charge', ch = F.charge, sw = F.swap, cur2 = sel === 'swap' ? sw : ch;
    const lines = [`Operating day ${F.opHours} h. Cycle ${SL.n0(F.cycle.totalS)} s per trip.`, `Work required <b>${SL.n1(F.workH)} h</b> per day (${SL.n0(F.trips)} trips).`, `One AMR can work ${SL.n1(cur2.availH)} h × ${Math.round(F.maxUtil * 100)}% = <b>${SL.n1(cur2.availH * F.maxUtil)} h</b>.`, `Busiest hour needs ${SL.n2(cur2.peakNeed)} AMR.`];
    let notes = '';
    if (D.override && D.override !== cur2.amrs) notes += `<div class="note">The proposal says ${D.override} ${pl(D.override, 'AMR', 'AMRs')} (your override). The calculation says ${cur2.amrs}.</div>`;
    if (sel === 'charge' && F.swapSavesAmrs > 0) notes += `<div class="note info">Swapping spare batteries would save ${F.swapSavesAmrs} ${pl(F.swapSavesAmrs, 'AMR', 'AMRs')}. Click the second box to compare.</div>`;
    box.innerHTML = `<div class="result"><div class="n">${D.qty}<small>${pl(D.qty, 'AMR', 'AMRs')} in the proposal</small></div><div class="txt">${lines.join('<br>')}<br>Each AMR is busy about <b>${Math.round(cur2.utilOfAvail * 100)}%</b> of its available time.</div></div>
      <div class="cmp"><div class="opt ${sel === 'charge' ? 'sel' : ''}" data-strat="charge"><b>${ch.amrs} ${pl(ch.amrs, 'AMR', 'AMRs')}</b>Auto-charging<small>Charges ${SL.n1(F.chargeH)} h after ${SL.n1(F.runtimeH)} h of work.</small></div>
      <div class="opt ${sel === 'swap' ? 'sel' : ''}" data-strat="swap"><b>${sw.amrs} ${pl(sw.amrs, 'AMR', 'AMRs')}${sw.extraBatteries ? ` + ${sw.extraBatteries} ${pl(sw.extraBatteries, 'battery', 'batteries')}` : ''}</b>Spare battery swap<small>Swap by hand in ${F.swapMin} min.</small></div></div>${notes}`;
  }

  /* ---------- side panel ---------- */
  function renderSide() {
    $('#side').innerHTML = '<div class="progress" id="progress" aria-live="polite"></div>' + FORM.map((sec, i) => `<details class="sec" data-sec="${sec.id}" ${openSec === sec.id ? 'open' : ''}><summary><span class="num">${i + 1}</span><span class="t"><b>${sec.title}</b><small data-sub="${sec.id}"></small></span><span class="todo" data-todo="${sec.id}" hidden></span></summary><div class="sbody" id="body-${sec.id}">${sec.html ? sec.html() : sec.blocks.map(blockHtml).join('')}</div></details>`).join('');
    updateSubs();
  }
  function updateSubs() { FORM.forEach(sec => { const el = $(`[data-sub="${sec.id}"]`); if (el) el.textContent = sec.sub(); }); }

  /* ---------- slide viewer ---------- */
  function included() { return out.filter(s => !S.slides.off[s.id]); }
  function pageNo(id) { const i = included().findIndex(s => s.id === id); return i < 0 ? 0 : i + 1; }
  function wrapSlide(s, n) {
    return `<section class="slide" style="${s.style || ''}">${s.html}${s.noFoot ? '' : `<div class="foot"><span>${esc(DB.company.name)} · ${esc(S.title)} Proposal${S.client.name ? ' · ' + esc(S.client.name) : ''}</span><span>${n ? String(n).padStart(2, '0') : ''}</span></div>`}</section>`;
  }
  function drawStage() {
    const s = out.find(x => x.id === cur) || out[0]; if (!s) return; cur = s.id;
    const stage = $('#stage'), w = stage.clientWidth, h = stage.clientHeight;
    const sc = Math.max(0.05, Math.min(w / 1920, h / 1080));
    const wr = $('#stageSlide'), sca = wr.firstElementChild;
    wr.style.width = (1920 * sc) + 'px'; wr.style.height = (1080 * sc) + 'px'; sca.style.transform = `scale(${sc})`;
    const html = wrapSlide(s, pageNo(s.id));
    if (html !== stageHtml) { sca.innerHTML = html; stageHtml = html; }
    const idx = out.indexOf(s), off = !!S.slides.off[s.id];
    wr.classList.toggle('off', off);
    $('#editLayout').hidden = s.id !== 'layout';
    $('#stageTitle').innerHTML = `${esc(s.name)}<small>Slide ${idx + 1} of ${out.length}</small>`;
    $('#incl').checked = !off;
    $('#prev').disabled = idx === 0; $('#next').disabled = idx === out.length - 1;
  }
  function renderFilm() {
    if (printMode) return;
    const film = $('#film'), sig = out.map(s => s.id).join();
    if (sig !== filmSig) {
      film.innerHTML = out.map((s, i) => `<div class="thumb" data-id="${s.id}"><div class="tw"><div class="scaler"></div></div><div class="cap"><span class="no">${i + 1}</span><span class="nm">${esc(s.name)}</span><input class="tick" type="checkbox" data-tick="${s.id}" title="Include this slide in the proposal" aria-label="Include ${esc(s.name)} in the proposal"></div></div>`).join('');
      filmSig = sig; filmCache = {};
    }
    out.forEach((s, i) => {
      const el = film.children[i]; if (!el) return;
      const off = !!S.slides.off[s.id];
      el.classList.toggle('cur', s.id === cur); el.classList.toggle('off', off);
      $('.tick', el).checked = !off;
      const html = wrapSlide(s, pageNo(s.id));
      if (filmCache[s.id] !== html) { $('.scaler', el).innerHTML = html; filmCache[s.id] = html; }
    });
    const c = $('.thumb.cur', film);
    if (c) film.scrollTo({ left: Math.max(0, c.offsetLeft - film.clientWidth / 2 + c.clientWidth / 2) });
  }
  let filmT;
  function scheduleFilm() { clearTimeout(filmT); filmT = setTimeout(renderFilm, 250); }
  function select(id) { cur = id; drawStage(); renderFilm(); }
  function step(d) { const i = out.findIndex(s => s.id === cur) + d; if (i >= 0 && i < out.length) select(out[i].id); }

  function renderAll() {
    D = derive(); out = SL.build(S, D);
    if (!out.some(s => s.id === cur)) cur = out[0] && out[0].id;
    drawStage(); renderFleetBox(); updateSubs(); markMissing(); scheduleFilm(); renderTabs(); renderScroll();
    if (document.body.dataset.tab === 'sim' && window.WFCSimUI) WFCSimUI.update(S, D);
    if (document.body.dataset.tab === 'concept' && window.WFCConcept) WFCConcept.update(S);
    if (document.body.dataset.tab === 'quote' && window.WFCQuote) WFCQuote.update(S, D);
  }
  let raf = 0;
  function refresh() { persist(); if (raf) return; raf = requestAnimationFrame(() => { raf = 0; renderAll(); }); }
  function flush() { if (raf) { cancelAnimationFrame(raf); raf = 0; } renderAll(); clearTimeout(filmT); renderFilm(); }

  /* ---------- images ---------- */
  function readImg(file, maxW) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const r = Math.min(1, maxW / im.width), c = document.createElement('canvas');
          c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
          const x = c.getContext('2d'), png = /png|svg|webp|gif/.test(file.type);
          if (!png) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
          x.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88));
        };
        im.onerror = rej; im.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  async function takeImage(drop, file) {
    if (!file || !/^image\//.test(file.type)) return;
    try { set(S, drop.dataset.img, await readImg(file, 1600)); } catch (e) { alert('That image could not be read.'); return; }
    drop.innerHTML = `<img src="${get(S, drop.dataset.img)}" alt=""><span>Replace</span><a class="x" data-clear="${drop.dataset.img}">Remove</a><input type="file" accept="image/*">`;
    refresh();
  }

  /* ---------- events ---------- */
  function bind() {
    const side = $('#side');
    side.addEventListener('toggle', e => {
      const d = e.target; if (!d.matches || !d.matches('details.sec') || !d.open) return;
      openSec = d.dataset.sec; $$('details.sec').forEach(o => { if (o !== d) o.open = false; });
    }, true);
    side.addEventListener('input', e => {
      const t = e.target; if (!t.dataset.p) return;
      let v = t.value; if (t.type === 'number') v = v === '' ? '' : parseFloat(v);
      set(S, t.dataset.p, v);
      if (t.dataset.p === 'contact.name') pickContact();
      refresh();
    });
    side.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-editor]')) { if (viewMode !== 'slides') setView('slides'); select('layout'); openEditor(); return; }
      const pai = t.closest('[data-pai]'); if (pai) { makeCloseup(pai.dataset.pai); return; }
      const strat = t.closest('[data-strat]'); if (strat) { S.fleet.strategy = strat.dataset.strat; refresh(); return; }
      const clr = t.closest('[data-clear]'); if (clr) { e.stopPropagation(); e.preventDefault(); set(S, clr.dataset.clear, null); clr.closest('.drop').innerHTML = '<span>Drop an image here or click to choose</span><input type="file" accept="image/*">'; refresh(); return; }
      const drop = t.closest('.drop'); if (drop && t.tagName !== 'INPUT') $('input[type=file]', drop).click();
    });
    side.addEventListener('change', e => { const t = e.target; if (t.type === 'file') takeImage(t.closest('.drop'), t.files[0]); });
    side.addEventListener('dragover', e => { const d = e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
    side.addEventListener('dragleave', e => { const d = e.target.closest('.drop'); if (d) d.classList.remove('over'); });
    side.addEventListener('drop', e => { const d = e.target.closest('.drop'); if (d) { e.preventDefault(); d.classList.remove('over'); takeImage(d, e.dataTransfer.files[0]); } });

    $('#film').addEventListener('click', e => {
      const tick = e.target.closest('[data-tick]');
      if (tick) { S.slides.off[tick.dataset.tick] = !tick.checked; refresh(); return; }
      const th = e.target.closest('.thumb'); if (th) select(th.dataset.id);
    });
    $('#incl').addEventListener('change', e => { S.slides.off[cur] = !e.target.checked; refresh(); });
    $('#prev').addEventListener('click', () => step(-1));
    $('#next').addEventListener('click', () => step(1));
    $('#editLayout').addEventListener('click', openEditor);
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b && !b.disabled) setTab(b.dataset.tab); });
    $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b && b.dataset.view !== viewMode) setView(b.dataset.view); });
    $('#scroll').addEventListener('click', e => {
      const tick = e.target.closest('[data-tick]'); if (tick) { S.slides.off[tick.dataset.tick] = !tick.checked; refresh(); return; }
      if (e.target.closest('label')) return;
      const it = e.target.closest('.sc-slide'); if (it) { cur = it.closest('.sc-item').dataset.id; setView('slides'); }
    });
    if (window.ResizeObserver) { let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(renderScroll, 120); }).observe($('#scroll')); }
    document.addEventListener('keydown', e => {
      if (WFCLayoutEditor.isOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    });

    const menu = $('#fileMenu'), newMenu = $('#newMenu');
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      menu.open = false;
      const a = b.dataset.act;
      if (a === 'open') $('#fileOpen').click(); else if (a === 'save') saveProject(); else if (a === 'dup') addDoc(JSON.parse(JSON.stringify(S))); else if (a === 'pptx') savePptx();
    });
    newMenu.addEventListener('click', e => {
      const b = e.target.closest('[data-new]'); if (!b) return;
      newMenu.open = false;
      if (b.dataset.new === 'open') $('#fileOpen').click(); else if (b.dataset.new === 'brief') WFCIntakeUI.open(); else addDoc(WFCPresets.make(b.dataset.new));
    });
    document.addEventListener('click', e => { [menu, newMenu].forEach(m => { if (m.open && !m.contains(e.target)) m.open = false; }); });

    const tabs = $('#docTabs');
    tabs.addEventListener('click', e => {
      const x = e.target.closest('[data-close]'); if (x) { e.stopPropagation(); closeDoc(+x.dataset.close); return; }
      const t = e.target.closest('.doctab'); if (t && +t.dataset.i !== act) activate(+t.dataset.i);
    });
    tabs.addEventListener('auxclick', e => { if (e.button !== 1) return; const t = e.target.closest('.doctab'); if (t) { e.preventDefault(); closeDoc(+t.dataset.i); } });
    tabs.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    $('#btnPdf').addEventListener('click', savePdf);
    $('#fileOpen').addEventListener('change', openProject);
    $('#start').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; if (b.dataset.s === 'brief') WFCIntakeUI.open(); else if (b.dataset.s === 'blank') addDoc(WFCPresets.make('blank')); else $('#fileOpen').click(); });
    if (window.ResizeObserver) new ResizeObserver(() => drawStage()).observe($('#stage')); else window.addEventListener('resize', drawStage);
    window.addEventListener('afterprint', () => { document.title = APP_TITLE; });
    side.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) { focusSection(g.dataset.goto); const d = $(`details.sec[data-sec="${g.dataset.goto}"]`); if (d) d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
  }

  /* ---------- files ---------- */
  function fileBase(doc) { if (doc === 'quotation' && window.WFCQuote) return WFCQuote.fileName(S); return `${S.client.name || 'Client'} - ${S.title} ${doc === 'quotation' ? 'Quotation' : 'Proposal'}`.replace(/[\\/:*?"<>|]+/g, ' '); }
  function fillPrint(doc) { const q = (doc || printDoc) === 'quotation' && window.WFCQuote; $('#printRoot').innerHTML = q ? WFCQuote.printHtml(S, D) : included().map((s, i) => wrapSlide(s, i + 1)).join(''); }
  function printPdf(doc) { renderAll(); fillPrint(doc); document.title = fileBase(doc); setTimeout(() => window.print(), 80); }

  /* ---------- PDF and PowerPoint ----------
     Run from Start.bat, the local server prints a clean PDF (no header or footer) and the PowerPoint is built from it, one picture per slide.
     Opened straight from the file, Save PDF falls back to the browser's print window. */
  const hint = t => status(/fail/i.test(t) ? 'error' : /…$/.test(t) ? 'busy' : /saved to|untick/i.test(t) ? 'done' : 'saved', t);
  const busy = on => { ['#btnPdf', '#btnPptx'].forEach(id => { $(id).disabled = on; }); };
  let serverOk = null;
  async function hasServer() {
    if (serverOk !== null) return serverOk;
    try { const r = await fetch('api/ping', { cache: 'no-store' }); serverOk = r.ok && (await r.json()).ok === true; } catch (e) { serverOk = false; }
    return serverOk;
  }
  async function serverPdf(doc) {
    const r = await fetch('api/pdf' + (doc ? '?doc=' + doc : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) });
    if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) { /* not JSON */ } throw new Error(m || 'The PDF could not be made.'); }
    return r.blob();
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function savePdf() {
    const doc = document.body.dataset.tab === 'quote' ? 'quotation' : '';
    if (doc && window.WFCQuote && !(await WFCQuote.beforeGenerate(S, D))) return;   // problems that would show on the quotation are listed first
    if (!(await hasServer())) { hint('In the print window, untick “Headers and footers”'); if (doc && window.WFCQuote) WFCQuote.afterGenerate(S, D, null, ''); printPdf(doc); return; }
    busy(true); hint('Making the PDF…');
    try { const blob = await serverPdf(doc); download(blob, fileBase(doc) + '.pdf'); hint('PDF saved to your Downloads folder'); if (doc && window.WFCQuote) WFCQuote.afterGenerate(S, D, blob, fileBase(doc) + '.pdf'); }   // the revision and a copy of the PDF go into the register
    catch (e) { hint('PDF failed: ' + (e.message || e)); }
    busy(false);
  }
  const libs = {};
  function loadLib(src, loaded) {
    if (loaded()) return Promise.resolve();
    return libs[src] || (libs[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete libs[src]; rej(new Error(src + ' could not be loaded.')); }; document.head.appendChild(s); }));
  }
  // the words on a slide, for the speaker notes
  function notesFor(s) {
    const t = s.html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
    return (s.name + '\n\n' + t).slice(0, 3000);
  }
  async function savePptx() {
    if (!(await hasServer())) { alert('Saving a PowerPoint needs the tool to run from Start.bat, which makes the pictures of the slides.\n\nDouble-click Start.bat in the WFC Proposal Builder folder and use the page it opens (http://localhost:8081).'); return; }
    busy(true);
    try {
      hint('Making the slides…');
      const pdf = await serverPdf();
      await loadLib('vendor/pdf.min.js', () => window.pdfjsLib); window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      await loadLib('vendor/pptxgen.bundle.js', () => window.PptxGenJS);
      const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
      const pptx = new window.PptxGenJS(); pptx.layout = 'LAYOUT_16x9'; pptx.title = fileBase(); pptx.author = DB.company.name; pptx.company = DB.company.name;
      const pages = included();
      for (let i = 1; i <= doc.numPages; i++) {
        hint(`Building the PowerPoint, slide ${i} of ${doc.numPages}…`);
        const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 1920 / v1.width });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: g, viewport: vp }).promise;
        const sl = pptx.addSlide(); sl.addImage({ data: c.toDataURL('image/jpeg', 0.92), x: 0, y: 0, w: 10, h: 5.625 });
        if (pages[i - 1]) sl.addNotes(notesFor(pages[i - 1]));
      }
      hint('Saving the PowerPoint…');
      await pptx.writeFile({ fileName: fileBase() + '.pptx' });
      hint('PowerPoint saved to your Downloads folder');
    } catch (e) { hint('PowerPoint failed: ' + (e.message || e)); }
    busy(false);
  }
  function saveProject() {
    const blob = new Blob([JSON.stringify(Object.assign({ app: 'wfc-proposal-builder' }, S))], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileBase() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    docs[act].h = hash(JSON.stringify(S)); persist();
  }
  function openProject(e) {
    const f = e.target.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { let s; try { s = clean(merge(WFCPresets.blank(), JSON.parse(fr.result))); } catch (err) { alert('That file is not a proposal project.'); return; } addDoc(s); };
    fr.readAsText(f); e.target.value = '';
  }

  /* ---------- start ---------- */
  function start() {
    $('#topLogo').src = WFC_IMG.logo;
    const sid = qs.get('state');   // the local server hands a proposal to the page it prints
    if (sid) {
      fetch('api/state/' + encodeURIComponent(sid)).then(r => r.json()).then(j => init([mk(clean(merge(WFCPresets.blank(), j)))], 0)).catch(() => init(null, 0));
      return;
    }
    const st = volatile ? null : loadStore();
    init(st ? st.docs : null, st ? st.active : 0);
  }
  function init(dd, a) {
    if (dd) { docs = dd; act = a; } else { docs = [mk(WFCPresets.make(qs.get('preset') || 'default'))]; act = 0; }
    S = docs[act].S; cur = docs[act].cur;
    D = derive(); renderSide(); bind(); flush(); renderTabs();
    // on the website (https, not localhost) there is no server to make the slide pictures, so the PowerPoint choice is not offered; Save PDF uses the print window
    if (location.protocol === 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { const b = $('#btnPptx'); if (b) b.style.display = 'none'; }
    WFCConnect.onChange(() => { const p = $('.pbtns'), f = p && p.closest('.f'); if (f) f.outerHTML = palletAiHtml(); });   // the close-up buttons follow the connections
    if (printMode) {
      document.body.classList.add('printmode'); document.title = fileBase(printDoc); fillPrint();
      // the layout slide needs the picture's proportions (to place the drawn plan), so draw the pages again once they are known
      const pic = new Promise(res => { const t = setInterval(() => { if (!S.images.layout || imgAspect(S.images.layout)) { clearInterval(t); res(); } }, 40); });
      Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), pic]).then(() => { renderAll(); fillPrint(); window.__ready = true; });
    }
  }
  function missingList() {
    const list = [];
    FORM.forEach(sec => (sec.blocks || []).forEach(b => b.fields.forEach(f => { if (f.req && isMissing(f)) list.push({ section: sec.title, secId: sec.id, label: f.l }); })));
    return list;
  }
  function focusSection(id) { openSec = id; renderSide(); markMissing(); }
  window.WFCApp = { changed: () => refresh(), readImg, missingList, focusSection, setView, view: () => viewMode, state: () => S, derived: () => D, slides: () => out, flush, select, current: () => cur, docs: () => docs, active: () => act, addDoc, activate, closeDoc, openEditor, closeEditor };
  start();
})();
