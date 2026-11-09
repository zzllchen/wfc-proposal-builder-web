/* WFC Proposal Builder: the "New from a brief" screen. Paste or upload the project description, add the pallet photos and the site layout
   (picture or PDF), and a new proposal tab is created with everything the reader could find filled in. Then a short review lists what
   was found and what is still to fill in (those fields are outlined in yellow). */
(function (root) {
  'use strict';
  const App = root.WFCApp, DB = root.WFCDB, AI = root.WFCIntakeAI, CN = root.WFCConnect, SM = root.WFCSmart, IM = root.WFCImageAI, PH = root.WFCPhotoAI, esc = root.WFCSlides.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const PALLET_KEY = 'wfc-pallet-ai';   // "make the close-up" tick, kept between proposals
  const flag = { get: () => { try { return localStorage.getItem(PALLET_KEY) !== '0'; } catch (e) { return true; } }, set: v => { try { localStorage.setItem(PALLET_KEY, v ? '1' : '0'); } catch (e) { /* private window */ } } };
  let st = null;   // { text, pallet: [picture], layout, layoutNote, logo, briefNote, msg, busy, result }

  /* ---------- reading files ---------- */
  async function docxText(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), dec = new TextDecoder();
    let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('That Word file could not be opened. Save it as .docx and try again.');
    const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name !== 'word/document.xml') continue;
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = buf.subarray(start, start + csize);
      let xml;
      if (method === 0) xml = dec.decode(data);
      else if (method === 8) xml = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      else throw new Error('That Word file uses a format the tool cannot read.');
      return xml.replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
    }
    throw new Error('No text found in that Word file.');
  }
  let pdfLoading = null;
  function loadPdfJs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    return pdfLoading || (pdfLoading = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
      s.onload = () => { root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(root.pdfjsLib); };
      s.onerror = () => { pdfLoading = null; rej(new Error('The PDF reader (vendor/pdf.min.js) could not be loaded.')); };
      document.head.appendChild(s);
    }));
  }
  async function pdfDoc(file) { const lib = await loadPdfJs(); return lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
  async function pdfText(file) {
    const doc = await pdfDoc(file); let out = '';
    for (let i = 1; i <= Math.min(doc.numPages, 40); i++) { const tc = await (await doc.getPage(i)).getTextContent(); out += tc.items.map(x => x.str).join(' ') + '\n'; }
    if (!out.trim()) throw new Error('No text found in that PDF (it may be a scan). Paste the text instead.');
    return out.trim();
  }
  async function pdfFirstPage(file) {
    const doc = await pdfDoc(file), pg = await doc.getPage(1), v1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(3, 1800 / v1.width) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    return { url: c.toDataURL('image/jpeg', 0.9), pages: doc.numPages };
  }
  const isPdf = f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
  async function fileText(file) {
    if (/\.docx$/i.test(file.name)) return docxText(file);
    if (isPdf(file)) return pdfText(file);
    if (/\.doc$/i.test(file.name)) throw new Error('Old .doc files cannot be read. Save it as .docx or paste the text.');
    return file.text();
  }

  /* ---------- the form template: the same details as typed boxes, for people who prefer that to a paragraph ---------- */
  // [key, label, columns (of 6), placeholder, kind]
  const FORM = [
    ['Client', [['name', 'Company', 4, 'e.g. ABC Manufacturing (M) Sdn Bhd'], ['attn', 'Contact person', 2, 'e.g. Mr. Lee']]],
    ['Pallet', [['ptype', 'Type or code', 2, 'e.g. PALLET-WOOD-001'], ['L', 'Length (mm)', 1, '790'], ['W', 'Width (mm)', 1, '600'], ['H', 'Height (mm)', 1, '540'], ['kg', 'Max weight (kg)', 1, '300']]],
    ['Operation', [['shifts', 'Shifts a day', 1, '2'], ['hours', 'Hours a shift', 1, '8'], ['trips', 'Pallets (trips) a day', 2, '100'], ['stations', 'Pick-up stations', 2, '10']]],
    ['Route', [['pickup', 'Pick-up area', 3, 'e.g. Production line channels'], ['drop', 'Drop-off area', 3, 'e.g. FG warehouse'], ['spots', 'Drop-off spots', 2, 'A B C'], ['dist', 'Longest one-way route (m)', 2, '110'], ['speed', 'Speed (m/s)', 1, '1.3'], ['traffic', 'Traffic', 1, 'select']]],
    ['Flow and rules', [['flow', 'Flow: how a pallet moves from pick-up to drop-off', 6, 'e.g. The operator presses the call box. The AMR collects the pallet, drives to the FG warehouse and drops it at the first free spot.', 'area'], ['rules', 'Route rules: where the AMR may and may not drive', 6, 'e.g. Only on the walkway around the channels, never into the production areas.', 'area'], ['notes', 'Anything else (aisle width, rack height, outdoor, no WiFi…)', 6, '', 'area']]]
  ];
  const fnum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return n > 0 ? n : 0; };
  const fstr = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  // the typed values as exact details (these win over anything the reader finds in the text)
  function formFields(f) {
    const out = [], put = (path, value) => { if (value === '' || value == null || value === 0) return; out.push({ path, label: AI.LABEL[path] || path, value, source: 'Entered in the form', by: 'Form' }); };
    put('client.name', fstr(f.name)); put('client.attn', fstr(f.attn)); put('pallet.type', fstr(f.ptype));
    put('pallet.L', fnum(f.L)); put('pallet.W', fnum(f.W)); put('pallet.H', fnum(f.H)); put('pallet.kg', fnum(f.kg)); put('scenario.loadKg', fnum(f.kg));
    put('scenario.shifts', fnum(f.shifts)); put('scenario.hoursPerShift', fnum(f.hours)); put('scenario.tripsPerDay', fnum(f.trips)); put('scenario.stations', fnum(f.stations));
    put('site.pickup', fstr(f.pickup)); put('site.drop', fstr(f.drop)); put('site.dropSpots', (fstr(f.spots).match(/[A-Za-z0-9]+/g) || []).join(' ').toUpperCase());
    put('route.distanceM', fnum(f.dist)); put('route.speedMps', fnum(f.speed)); put('scenario.traffic', /^(Low|Medium|High)$/.test(f.traffic) ? f.traffic : '');
    if (fstr(f.pickup) && fstr(f.drop)) put('scenario.transfer', `${fstr(f.pickup).charAt(0).toUpperCase()}${fstr(f.pickup).slice(1)} to ${fstr(f.drop)}`);
    return out;
  }
  // the same details as a short text, for Claude to read (it needs the flow and the rules) and to keep with the proposal
  function formToText(f) {
    const L = [], add = (k, v) => { if (fstr(v)) L.push(`${k}: ${fstr(v)}.`); }, dims = [f.L, f.W, f.H].map(fnum);
    add('Client', f.name); add('Contact', f.attn); add('Pick-up', f.pickup); add('Drop-off', fstr(f.drop) + (fstr(f.spots) ? `, spots ${fstr(f.spots)}` : ''));
    const pal = [fstr(f.ptype), dims.every(Boolean) ? `${dims.join(' x ')} mm` : '', fnum(f.kg) ? `up to ${fnum(f.kg)} kg` : ''].filter(Boolean).join(', '); add('Pallet', pal);
    const op = [fnum(f.shifts) ? `${fnum(f.shifts)} shifts` + (fnum(f.hours) ? ` of ${fnum(f.hours)} hours` : '') : '', fnum(f.trips) ? `${fnum(f.trips)} pallets per day` : '', fnum(f.stations) ? `${fnum(f.stations)} pick-up stations` : ''].filter(Boolean).join(', '); add('Operation', op);
    const rt = [fnum(f.dist) ? `longest one-way route about ${fnum(f.dist)} m` : '', fnum(f.speed) ? `at ${fnum(f.speed)} m/s` : '', f.traffic ? `traffic is ${String(f.traffic).toLowerCase()}` : ''].filter(Boolean).join(', '); add('Route', rt);
    add('Flow', f.flow); add('Route rules', f.rules); add('Other', f.notes);
    return L.join('\n');
  }
  function formHtml() {
    return '<div class="mform">' + FORM.map(([g, fs]) => `<div class="fgrp">${g}</div>` + fs.map(f => {
      const v = esc(st.form[f[0]] || ''), cs = `style="grid-column: span ${f[2]}"`;
      const ctl = f[3] === 'select' ? `<select data-f="${f[0]}">${['', 'Low', 'Medium', 'High'].map(o => `<option value="${o}" ${st.form[f[0]] === o ? 'selected' : ''}>${o || '–'}</option>`).join('')}</select>`
        : f[4] === 'area' ? `<textarea data-f="${f[0]}" rows="2" placeholder="${esc(f[3])}">${v}</textarea>` : `<input data-f="${f[0]}" value="${v}" placeholder="${esc(f[3])}" autocomplete="off">`;
      return `<label class="fld" ${cs}><span>${f[1]}</span>${ctl}</label>`;
    }).join('')).join('') + '</div>';
  }

  /* ---------- the screen ---------- */
  function open() { st = { tab: 'write', form: {}, text: '', pallet: [], layout: null, layoutNote: '', logo: null, briefNote: '', msg: '', busy: false, result: null }; render(); $('#intake').hidden = false; setTimeout(() => { const t = $('#inBrief'); if (t) t.focus(); }, 60); }
  function close() { if (st && st.busy) return; const m = $('#intake'); m.hidden = true; m.innerHTML = ''; st = null; }
  function syncText() { if (!st) return; const t = $('#inBrief'); if (t) st.text = t.value; Array.from(document.querySelectorAll('#intake [data-f]')).forEach(e => { st.form[e.dataset.f] = e.value; }); }

  function thumbs(zone) {
    const list = zone === 'pallet' ? st.pallet : zone === 'layout' ? (st.layout ? [st.layout] : []) : (st.logo ? [st.logo] : []);
    return list.map(u => `<img src="${u}" alt="">`).join('') + (list.length ? '<a class="rm" data-rm="' + zone + '">Remove</a>' : '');
  }
  const zoneHtml = (id, title, hint, accept, multiple) => `<div class="mdrop${(id === 'pallet' ? st.pallet.length : id === 'layout' ? st.layout : st.logo) ? ' has' : ''}" data-zone="${id}"><b>${title}</b><span class="hint">${hint}</span><div class="th">${thumbs(id)}</div><input type="file" accept="${accept}" ${multiple ? 'multiple' : ''} hidden></div>`;

  function render() {
    if (!st) return;
    if (st.result) return renderReview();
    const mode = CN.mode(), cs = CN.state('claude'), gs = CN.state('google');
    $('#intake').innerHTML = `<div class="mcard" role="dialog" aria-label="New proposal from a brief">
      <div class="mhead"><h2>New proposal from a brief</h2><button class="x" data-i="close" aria-label="Close">×</button></div>
      <p class="msub">Describe the project or fill in the form, then add the pictures. Anything the tool cannot find is outlined in yellow.</p>
      <div class="mtabs" role="tablist"><button type="button" class="${st.tab === 'write' ? 'on' : ''}" data-i="tab-write">Write it</button><button type="button" class="${st.tab === 'form' ? 'on' : ''}" data-i="tab-form">Fill in a form</button></div>
      ${st.tab === 'form' ? formHtml() : `<textarea id="inBrief" aria-label="Project description" placeholder="Paste or write the client's description: the scenario, the pallet, the route and how a pallet moves from pick-up to drop-off.">${esc(st.text)}</textarea>
      <div class="mhelp"><a data-i="pickBrief">Upload a document or photo instead</a> (Word, PDF, text or photo) <span class="mnote">${esc(st.briefNote)}</span><input type="file" id="inBriefFile" accept=".txt,.md,.docx,.pdf,text/plain,application/pdf,image/*" hidden></div>`}
      <div class="mdrops">
        ${zoneHtml('pallet', 'Pallet photo', 'Your raw site photo (a second one is optional)', 'image/*', true)}
        ${zoneHtml('layout', 'Site layout', 'Plain picture or PDF, no markings needed' + (st.layoutNote ? ' · ' + esc(st.layoutNote) : ''), 'image/*,application/pdf,.pdf', false)}
        ${zoneHtml('logo', 'Client logo', 'Optional', 'image/*', false)}
      </div>
      <div class="mread"><div class="mlabel">How much AI</div>
        <div class="mmode"><select id="inMode" aria-label="How much AI"><option value="builtin" ${mode === 'builtin' ? 'selected' : ''}>Built-in only (free, offline)</option><option value="balanced" ${mode === 'balanced' ? 'selected' : ''}>Balanced: built-in first, Claude only where needed</option><option value="claude" ${mode === 'claude' ? 'selected' : ''}>Claude reads everything</option></select>
          <span class="cch"><i class="cdot ${cs}"></i>Claude</span><span class="cch"><i class="cdot ${gs}"></i>Pictures</span><a data-i="conn">${cs === 'none' ? 'Connect Claude…' : 'AI connections…'}</a></div>
        <p class="mhelp">${mode === 'builtin' ? 'Built-in reads the numbers it recognises and picks the AMR. It cannot draw the route on the layout.' : cs === 'none' ? 'Claude is not connected, so only the built-in features will be used. Connect it to let Claude draw the route and read unusual wording.' : 'Claude is asked once, only for what the built-in part cannot do. About RM 0.1 to 0.4 a proposal.'}</p>
        <label class="opt"><input type="checkbox" id="inPallet" ${flag.get() ? 'checked' : ''}><span>Make the close-up pallet picture from the raw photo <small class="mnote">${gs !== 'none' ? 'AI picture (Google)' : CN.hasClaude() ? 'clean background (Claude)' : 'needs Google or Claude connected'}</small></span></label>
      </div>      <div class="mfoot"><span class="mmsg" id="inMsg">${esc(st.msg)}</span><button class="btn" data-i="close">Cancel</button><button class="btn primary" data-i="create" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Reading…' : 'Create proposal'}</button></div>
    </div>`;
  }
  const setMsg = t => { if (st) st.msg = t; const el = $('#inMsg'); if (el) el.textContent = t; };

  async function handleFiles(zone, files) {
    const list = Array.from(files || []); if (!list.length || !st) return;
    syncText(); st.msg = '';
    try {
      if (zone === 'pallet') { for (const f of list.filter(x => /^image\//.test(x.type)).slice(0, 2 - st.pallet.length)) st.pallet.push(await App.readImg(f, 1600)); }
      else if (zone === 'logo') { const f = list.find(x => /^image\//.test(x.type)); if (f) st.logo = await App.readImg(f, 600); }
      else if (zone === 'layout') {
        const f = list[0];
        if (isPdf(f)) { setMsg('Reading the PDF…'); const r = await pdfFirstPage(f); st.layout = r.url; st.layoutNote = r.pages > 1 ? `page 1 of ${r.pages}` : 'PDF'; }
        else if (/^image\//.test(f.type)) { st.layout = await App.readImg(f, 1800); st.layoutNote = ''; }
      }
    } catch (e) { st.msg = 'That file could not be read: ' + (e.message || e); }
    render();
  }
  // a photo of a brief: Claude types it out. Word, PDF and text files are read on this PC and never sent.
  async function readBriefPhoto(file) {
    syncText();
    const c = CN.claudeOpts(), why = PH.unavailable(CN.mode(), c);
    if (why) { st.briefNote = why; render(); return; }
    st.briefNote = 'Claude is reading the photo…'; render();
    try {
      const photo = await App.readImg(file, 1600), r = await PH.readBrief(Object.assign({ ai: AI, photo }, c));
      st.photoCost = (st.photoCost || 0) + r.costRM; st.photoReads = (st.photoReads || 0) + 1;
      if (!r.text) st.briefNote = r.blurry ? 'That photo is too blurry to read. Try a sharper one.' : 'Claude could not find any text in that photo.';
      else { st.text = (st.text ? st.text + '\n\n' : '') + '[Read from a photo by Claude, please check]\n' + r.text; st.briefNote = (r.blurry ? 'The photo was blurry, so check the numbers. ' : 'Read from the photo by Claude, please check. ') + r.notes; }
    } catch (e) { st.briefNote = AI.explain(e); }
    render();
  }
  async function readBriefFile(file) {
    if (!file || !st) return;
    if (/^image\//.test(file.type)) return readBriefPhoto(file);
    syncText(); st.briefNote = 'Reading ' + file.name + '…'; render();
    try { const t = await fileText(file); st.text = (st.text ? st.text + '\n\n' : '') + t; st.briefNote = 'Added ' + file.name; }
    catch (e) { st.briefNote = e.message || String(e); }
    render();
  }

  const aspectOf = src => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth / im.naturalHeight || 0); im.onerror = () => res(0); im.src = src; });

  // The close-up of the pallet from the one raw photo: Google's AI picture if connected, else Claude's closer crop, else the photo alone.
  async function palletPicture(mode) {
    if (mode === 'builtin' || st.pallet.length !== 1 || !flag.get()) return null;
    const g = CN.googleOpts(), c = CN.claudeOpts(), photo = st.pallet[0], tries = [];
    if (g) tries.push(['ai', () => IM.closeup(Object.assign({ photo }, g))]);
    if (c) tries.push(['clean', () => IM.cleanBackground(Object.assign({ ai: AI, photo }, c))]);
    if (c) tries.push(['crop', () => IM.cropCloser(Object.assign({ ai: AI, photo }, c, { model: 'claude-haiku-5-5' }))]);
    if (!tries.length) return { url: null, err: 'No picture service is connected (Claude for a clean background, or Google for an AI picture).' };
    let err = '';
    for (const [kind, fn] of tries) {
      try { const r = await fn(); r.kind = kind; return r; }
      catch (e) { err += (err ? ' ' : '') + (kind === 'ai' ? 'AI picture: ' + IM.explain(e) : (kind === 'clean' ? 'Clean background: ' : 'Closer crop: ') + AI.explain(e)); }
    }
    return { url: null, err };
  }

  // a quick Claude look at each pallet photo (not in Built-in only mode, not when Claude is off); a failed look is skipped quietly
  async function palletLooks(mode, c) {
    if (mode === 'builtin' || !c || !st.pallet.length) return [];
    const model = c.model === 'claude-opus-5-5' ? 'claude-sonnet-5-5' : c.model;
    return Promise.all(st.pallet.slice(0, 2).map(photo => PH.lookPallet({ ai: AI, photo, apiKey: c.apiKey, model }).catch(e => ({ err: AI.explain(e) }))));
  }

  async function create() {
    syncText();
    if (!st || st.busy) return;
    const asForm = st.tab === 'form', text = asForm ? formToText(st.form) : st.text.trim(), fields = asForm ? formFields(st.form) : [];
    if (!text && !st.pallet.length && !st.layout && !st.logo) { setMsg(asForm ? 'Fill in a few boxes or add a picture first.' : 'Add a description or a picture first.'); return; }
    const mode = CN.mode(), c = CN.claudeOpts();
    st.busy = true; render(); setMsg('Reading…');
    try {
      const aspect = st.layout ? await aspectOf(st.layout) : 0;
      const palletTask = palletPicture(mode);   // runs while Claude reads
      const lookTask = palletLooks(mode, c);
      const r = await SM.run({ text, fields, layout: st.layout, layoutAspect: aspect, mode, apiKey: c && c.apiKey, model: c && c.model, models: DB.models, onStep: setMsg });
      const pal = await palletTask, looks = await lookTask;
      const S0 = WFCPresets.blank(); SM.applyTo(S0, r); S0.brief = text;
      if (st.pallet[0]) S0.images.pallet1 = st.pallet[0];
      if (st.pallet[1]) S0.images.pallet2 = st.pallet[1];
      if (pal && pal.url) { S0.images.pallet2 = pal.url; S0.captions.pallet2 = { ai: 'Close-up, AI-enhanced from the site photo', clean: 'Site pallet on a clean background' }[pal.kind] || 'Closer view of the site pallet'; }
      if (st.layout) S0.images.layout = st.layout;
      if (st.logo) S0.client.logo = st.logo;
      const lk = PH.applyLooks(S0, looks); if (S0.solution) S0.solution.assumptions = (S0.solution.assumptions || []).concat(lk.notes);   // the pallet type only when blank; never a size or weight
      App.addDoc(S0); App.setView('scroll');
      st.busy = false;
      st.result = { r, pal, mode, looks, photoNotes: lk.notes, missing: App.missingList(), costRM: (r.costRM || 0) + ((pal && pal.costRM) || 0) + looks.reduce((a, l) => a + ((l && l.costRM) || 0), 0) + (st.photoCost || 0) };
    } catch (e) { st.busy = false; st.msg = 'Something went wrong: ' + ((e && e.message) || e); }
    render();
  }

  function renderReview() {
    const R = st.result, r = R.r, fmt = v => typeof v === 'number' ? v.toLocaleString('en-US') : String(v), best = r.solution && r.solution.best;
    const rows = r.found.map(f => `<li><b>${esc(f.label)}</b><span>${esc(fmt(f.value))}</span>${f.source ? `<small>“${esc(f.source)}”</small>` : ''}</li>`);
    if (best) rows.push(`<li><b>AMR model</b><span>${esc(best.model.name)}${best.qty ? ` × ${best.qty}` : ''}</span><small>${esc(best.why.slice(0, 2).join(' '))} · worked out by the built-in rules, please confirm</small></li>`);
    if (r.plan) rows.push(`<li><b>Layout drawn</b><span>${r.plan.zones.length} areas, ${r.plan.points.length} points, ${r.plan.routes.length} route${r.plan.routes.length === 1 ? '' : 's'}</span><small>Drawn by Claude and tidied by the tool. Open Edit layout to move anything.</small></li>`);
    if (r.flow) rows.push(`<li><b>Operating flow</b><span>${r.flow.split('\n').length} steps</span><small>Written from the description. Edit under Workflow steps.</small></li>`);
    if (R.pal && R.pal.url) rows.push(`<li><b>Pallet close-up</b><span>${{ ai: 'AI picture', clean: 'Clean background' }[R.pal.kind] || 'Closer crop'}</span><small>Made from your raw photo. Check it looks right.</small></li>`);
    else if (st.pallet.length) rows.push(`<li><b>Pallet photo${st.pallet.length > 1 ? 's' : ''}</b><span>${st.pallet.length}</span></li>`);
    if (st.layout) rows.push(`<li><b>Site layout</b><span>added</span>${st.layoutNote ? `<small>${esc(st.layoutNote)}</small>` : ''}</li>`);
    if (st.logo) rows.push(`<li><b>Client logo</b><span>added</span></li>`);
    const miss = R.missing.map(m => `<li><b>${esc(m.label)}</b><small>${esc(m.section)}</small></li>`);
    if (!st.layout) miss.push('<li><b>Site layout picture</b><small>Site and route</small></li>');
    (R.looks || []).forEach((l, i) => { if (l && !l.err) rows.push(`<li><b>Pallet photo read</b><span>Read by Claude</span><small></small></li>`); });
    if (st.photoReads) rows.push(`<li><b>Photo read by Claude</b><span></span><small>Typed out into the description. Please check it.</small></li>`);
    const notes = r.assumptions.concat(R.photoNotes || []); if (R.pal && R.pal.err) notes.push('Pallet close-up not made. ' + R.pal.err);
    const steps = r.steps.concat(R.pal && R.pal.url ? [{ by: R.pal.kind === 'ai' ? 'Google' : 'Claude', what: { ai: 'Made the pallet close-up', clean: 'Put the pallet on a clean background' }[R.pal.kind] || 'Cropped the pallet closer' }] : []);
    const how = R.costRM > 0 ? `AI cost about RM ${R.costRM.toFixed(2)}` : 'No AI cost';
    $('#intake').innerHTML = `<div class="mcard wide" role="dialog" aria-label="What was found">
      <div class="mhead"><h2>Here is the solution</h2><button class="x" data-i="done" aria-label="Close">×</button></div>
      <p class="msub">${how}. The proposal is open in a new tab, in scroll view. Everything can be edited afterwards: the form on the left, Edit layout for the points and route.</p>
      <ul class="msteps">${steps.map(s => `<li${s.bad ? ' class="bad"' : ''}><b${/Claude|Google/.test(s.by) ? ' class="cl"' : ''}>${esc(s.by)}</b><span>${esc(s.what)}</span></li>`).join('')}</ul>
      <div class="mcols">
        <div><h3>Filled in <span class="cnt">${rows.length}</span></h3><ul class="mlist">${rows.join('') || '<li><span>Nothing was recognised in the text.</span></li>'}</ul></div>
        <div><h3 class="warn">Still to fill in <span class="cnt">${miss.length}</span></h3><ul class="mlist">${miss.join('') || '<li><span>Nothing. Every required detail is filled in.</span></li>'}</ul>
          ${notes.length ? `<h3>Please check</h3><ul class="mlist">${notes.map(a => `<li><span>${esc(a)}</span></li>`).join('')}</ul>` : ''}</div>
      </div>
      <div class="mfoot"><button class="btn primary" data-i="done">Open the proposal</button></div>
    </div>`;
  }  function done() {
    const r = st && st.result, first = r && r.missing[0];
    close();
    if (first) App.focusSection(first.secId);
  }

  /* ---------- events ---------- */
  const m = $('#intake');
  m.addEventListener('click', e => {
    if (!st) return;
    if (e.target === m && !st.result) { close(); return; }
    const a = e.target.closest('[data-i]'), rm = e.target.closest('[data-rm]'), zone = e.target.closest('.mdrop');
    if (rm) { syncText(); const z = rm.dataset.rm; if (z === 'pallet') st.pallet = []; else if (z === 'layout') { st.layout = null; st.layoutNote = ''; } else st.logo = null; render(); return; }
    if (a) {
      const k = a.dataset.i;
      if (k === 'close') close();
      else if (k === 'done') done();
      else if (k === 'pickBrief') $('#inBriefFile').click();
      else if (k === 'create') create();
      else if (k === 'conn') { syncText(); CN.open(); }
      else if (k === 'tab-write' || k === 'tab-form') { syncText(); st.tab = k.slice(4); render(); }
      return;
    }
    if (zone && e.target.tagName !== 'INPUT') zone.querySelector('input[type=file]').click();
  });
  m.addEventListener('change', e => {
    if (!st) return;
    const t = e.target;
    if (t.id === 'inBriefFile') { readBriefFile(t.files[0]); t.value = ''; }
    else if (t.closest('.mdrop') && t.type === 'file') { handleFiles(t.closest('.mdrop').dataset.zone, t.files); t.value = ''; }
    else if (t.id === 'inMode') { syncText(); CN.setMode(t.value); render(); }
    else if (t.id === 'inPallet') flag.set(t.checked);
  });
  m.addEventListener('dragover', e => { const z = e.target.closest('.mdrop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  m.addEventListener('dragleave', e => { const z = e.target.closest('.mdrop'); if (z) z.classList.remove('over'); });
  m.addEventListener('drop', e => { const z = e.target.closest('.mdrop'); if (z) { e.preventDefault(); z.classList.remove('over'); handleFiles(z.dataset.zone, e.dataTransfer.files); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st && !m.hidden && !st.result) close(); });

  CN.onChange(() => { if (st && !st.busy && !st.result && !m.hidden) { syncText(); render(); } });   // keys saved or tested while this screen is open

  root.WFCIntakeUI = { open, close };
})(window);
