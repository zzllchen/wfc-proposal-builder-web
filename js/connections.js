/* WFC Proposal Builder: AI connections. One place to connect Claude (reading, drawing the route, the closer crop) and Google (the AI pallet picture),
   test them, and choose how much the tool leans on AI. Keys are kept in this browser only (localStorage) and are sent only to Anthropic / Google.
   A small status chip in the top bar shows what is connected. Everything the tool does without AI keeps working with no connection. */
(function (root) {
  'use strict';
  const AI = root.WFCIntakeAI, IMG = root.WFCImageAI, esc = root.WFCSlides.esc;
  const K = { ckey: 'wfc-claude-key', cmodel: 'wfc-claude-model', cmode: 'wfc-ai-mode', gkey: 'wfc-google-key', gmodel: 'wfc-google-model', tested: 'wfc-conn-tested', old: 'wfc-claude-on', spend: 'wfc-ai-spend' };
  const RM_PER_USD = 4.4;
  const store = {
    get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* private window */ } }
  };
  const $ = (s, r) => (r || document).querySelector(s);
  let tested = {}, busy = {}, listeners = [];
  try { tested = JSON.parse(store.get(K.tested) || '{}') || {}; } catch (e) { tested = {}; }
  const saveTested = () => store.set(K.tested, JSON.stringify(tested));
  const emit = () => { refreshChip(); listeners.forEach(f => { try { f(); } catch (e) { /* a listener failed */ } }); };

  /* ---------- the monthly counter (display only) ----------
     An estimate of what Claude has cost this month, added up from the token counts each call reports (this browser only, calendar month in UTC like the
     Console). It only shows a number: it never warns and never switches Claude off. The low-credit alert is js/credit.js. */
  const month = () => new Date().toISOString().slice(0, 7);
  function spentUsd() { let o; try { o = JSON.parse(store.get(K.spend) || '{}'); } catch (e) { o = {}; } return o && o.m === month() ? (+o.usd || 0) : 0; }
  function addSpend(rm) {
    const usd = rm / RM_PER_USD; if (!(usd > 0)) return;
    store.set(K.spend, JSON.stringify({ m: month(), usd: spentUsd() + usd }));
    emit(); render();
  }

  const claude = () => ({ key: store.get(K.ckey), model: store.get(K.cmodel) || 'claude-opus-5-5' });
  const google = () => ({ key: store.get(K.gkey), model: store.get(K.gmodel) || 'gemini-nano-banana-2.1' });
  function mode() { const m = store.get(K.cmode); return m === 'builtin' || m === 'balanced' || m === 'claude' ? m : (claude().key ? 'balanced' : 'builtin'); }
  function setMode(m) { store.set(K.cmode, m); emit(); render(); }
  // 'ok' = answered when tested, 'bad' = the test failed, 'saved' = key saved but not tested (with this model), 'none' = no key
  function state(which) {
    const c = which === 'claude' ? claude() : google(), t = tested[which];
    if (!c.key) return 'none';
    if (!t || t.model !== c.model || t.key !== c.key.slice(-6)) return 'saved';
    return t.ok ? 'ok' : 'bad';
  }
  const hasClaude = () => !!claude().key, hasGoogle = () => !!google().key;

  function refreshChip() {
    const b = $('#connBtn'); if (!b) return;
    const dot = s => `<i class="cdot ${s}"></i>`, c = state('claude'), g = state('google');
    b.innerHTML = `<span>AI</span><span class="cch">${dot(c)}Claude</span>${g !== 'none' ? `<span class="cch">${dot(g)}Pictures</span>` : ''}`;
    b.title = `Claude: ${label(c)}. Pictures (Google): ${label(g)}. Click to set up.`;
  }
  const label = s => ({ ok: 'connected', saved: 'key saved, not tested', bad: 'test failed', none: 'not connected' }[s]);

  async function test(which) {
    const c = which === 'claude' ? claude() : google();
    if (!c.key) return;
    busy[which] = true; render();
    let res;
    try { res = which === 'claude' ? await AI.test({ apiKey: c.key, model: c.model }) : await IMG.test({ apiKey: c.key, model: c.model }); res.ok = true; }
    catch (e) { res = { ok: false, msg: which === 'claude' ? AI.explain(e) : IMG.explain(e) }; }
    tested[which] = Object.assign({ model: c.model, key: c.key.slice(-6), at: Date.now() }, res); saveTested();
    busy[which] = false; emit(); render();
  }

  /* ---------- the screen ---------- */
  const when = t => { const d = new Date(t); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  // the pill at the top right of a card, and one short line under the title
  function status(which) {
    const s = state(which), t = tested[which];
    if (busy[which]) return { pill: '<span class="cs wait">Testing…</span>', note: '' };
    if (s === 'none') return { pill: '<span class="cs none">Not connected</span>', note: '' };
    if (s === 'saved') return { pill: '<span class="cs saved">Not tested yet</span>', note: 'Press Test connection.' };
    if (s === 'ok') return { pill: '<span class="cs ok">Connected</span>', note: `Tested ${esc(when(t.at))}` };
    return { pill: '<span class="cs bad">Not working</span>', note: esc(t.msg || '') };
  }
  const HELP = {
    claude: `<ol><li>Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com/settings/keys</a></li><li>Press <b>Create key</b> and copy it (shown once)</li><li>Paste it above</li></ol><p>Your Claude Max plan includes monthly API credit. See Billing in the Console.</p>`,
    google: `<ol><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></li><li>Create a key and turn on billing for it</li><li>Paste it above</li></ol><p>Your photo goes to Google only when you make a close-up. Testing is free.</p>`
  };
  function card(which) {
    const isC = which === 'claude', c = isC ? claude() : google(), models = isC ? AI.MODELS : IMG.MODELS, has = !!c.key, st = status(which);
    const opt = k => isC ? models[k].label : `${models[k].label.replace(/\s*\(.*\)/, '')} · about RM ${(models[k].usd * 4.4).toFixed(2)} a picture`;
    return `<div class="ccard">
      <div class="chead"><div class="ct"><b>${isC ? 'Claude' : 'Pallet pictures'}</b><span>${isC ? 'Reads the brief and draws the route' : 'Google · optional · paid'}</span></div>${st.pill}</div>
      ${st.note ? `<div class="cnote${state(which) === 'bad' ? ' bad' : ''}">${st.note}</div>` : ''}
      ${has ? `<div class="crow"><span class="ckey">Key saved (ends ${esc(c.key.slice(-4))})</span><button class="btn" data-c="test-${which}" ${busy[which] ? 'disabled' : ''}>Test connection</button><a data-c="forget-${which}">Remove</a></div>`
        : `<div class="crow"><input type="password" id="${which}Key" placeholder="${isC ? 'Paste your key (sk-ant-…)' : 'Paste your Google AI key'}" autocomplete="off"><button class="btn primary" data-c="save-${which}">Save and test</button></div>`}
      <div class="crow"><select id="${which}Model" aria-label="${isC ? 'Claude model' : 'Picture model'}">${Object.keys(models).map(k => `<option value="${k}" ${k === c.model ? 'selected' : ''}>${esc(opt(k))}</option>`).join('')}</select></div>
      <details class="chelp2"><summary>How do I get a key?</summary>${HELP[which]}</details>
    </div>`;
  }
  const MODE_DESC = {
    builtin: 'Free and offline. Reads the numbers and picks the AMR, but cannot draw the route.',
    balanced: 'Built-in first. Claude is asked once, only for what it cannot do. About RM 0.1 to 0.4 a proposal.',
    claude: 'Claude reads every detail, and its answer wins when it differs from the built-in one.'
  };
  function render() {
    const m = $('#conn'); if (!m || m.hidden) return;
    const md = mode(), keepKey = id => { const e = $('#' + id); return e ? e.value : ''; };
    const keep = { c: keepKey('claudeKey'), g: keepKey('googleKey') };
    m.innerHTML = `<div class="mcard wide conn" role="dialog" aria-label="AI connections">
      <div class="mhead"><h2>AI connections</h2><button class="x" data-c="close" aria-label="Close">×</button></div>
      <p class="msub">Optional. The tool works without AI. Connect it to draw routes and make pallet pictures. Keys stay on this PC.</p>
      <div class="cgrid">${card('claude')}${card('google')}</div>
      <div class="cspend"><span>Claude spend this month</span><b>about $${spentUsd().toFixed(2)}</b><a data-c="resetspend">Reset</a><span class="info" tabindex="0" title="An estimate of what Claude calls cost, counted on this browser only. It never warns or switches Claude off. The Console shows the real bill.">?</span></div>
      <div class="mread"><div class="mlabel">How much AI should the tool use?</div>
        <div class="seg3" role="radiogroup">${[['builtin', 'Built-in only'], ['balanced', 'Balanced'], ['claude', 'Claude reads everything']].map(([v, l]) =>
          `<label class="${md === v ? 'on' : ''}"><input type="radio" name="aimode" value="${v}" ${md === v ? 'checked' : ''}><span>${l}${v === 'balanced' ? '<small>Recommended</small>' : ''}</span></label>`).join('')}</div>
        <p class="mdesc">${MODE_DESC[md]}</p>
      </div>
      <div class="mfoot"><button class="btn primary" data-c="close">Done</button></div></div>`;
    if (keep.c) { const e = $('#claudeKey'); if (e) e.value = keep.c; }
    if (keep.g) { const e = $('#googleKey'); if (e) e.value = keep.g; }
  }  function open() { const m = $('#conn'); m.hidden = false; render(); }
  function close() { const m = $('#conn'); m.hidden = true; m.innerHTML = ''; }

  function init() {
    const m = $('#conn');
    m.addEventListener('click', e => {
      if (e.target === m) { close(); return; }
      const a = e.target.closest('[data-c]'); if (!a) return;
      const [act, which] = a.dataset.c.split('-');
      if (act === 'close') close();
      else if (act === 'save') {
        const el = $('#' + which + 'Key'), v = (el.value || '').trim();
        if (which === 'claude' && !/^sk-ant-/.test(v)) { el.value = ''; el.placeholder = 'That does not look like an Anthropic key. It starts with sk-ant-'; el.focus(); return; }
        if (which === 'google' && v.length < 20) { el.value = ''; el.placeholder = 'That does not look like a Google AI key.'; el.focus(); return; }
        store.set(which === 'claude' ? K.ckey : K.gkey, v); delete tested[which];
        if (which === 'claude' && mode() === 'builtin' && !store.get(K.cmode)) store.set(K.cmode, 'balanced');
        emit(); render(); test(which);
      }
      else if (act === 'forget') { store.set(which === 'claude' ? K.ckey : K.gkey, ''); delete tested[which]; saveTested(); emit(); render(); }
      else if (act === 'test') test(which);
      else if (act === 'resetspend') { store.set(K.spend, ''); emit(); render(); }
    });
    m.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'aimode') setMode(t.value);
      else if (t.id === 'claudeModel') { store.set(K.cmodel, t.value); emit(); render(); }
      else if (t.id === 'googleModel') { store.set(K.gmodel, t.value); emit(); render(); }
    });
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && /Key$/.test(e.target.id || '')) { e.preventDefault(); const b = $(`[data-c="save-${e.target.id.replace('Key', '')}"]`); if (b) b.click(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden) close(); });
    const b = $('#connBtn'); if (b) b.addEventListener('click', open);
    refreshChip();
  }

  AI.onSpend = addSpend;   // every Claude call reports its cost here
  root.WFCConnect = { claude, google, mode, setMode, state, hasClaude, hasGoogle, open, close, test, refreshChip, onChange: f => listeners.push(f),
    spentUsd, addSpend,
    claudeOpts: () => hasClaude() ? { apiKey: claude().key, model: claude().model } : null,
    googleOpts: () => hasGoogle() ? { apiKey: google().key, model: google().model } : null };
  init();
})(window);
