/* WFC Proposal Builder: the Quotation tab. The proposal itself has NO prices; the price, the terms and the signature block live here, in their own A4 document,
   built from the same project (client, contact, AMR model and quantity, doors and stations on the layout, charging plan).

   WFCQuote.update(S, D)       -> draws the tab (editor on the left, the A4 quotation on the right)
   WFCQuote.printHtml(S, D)    -> the quotation as print pages (used by Save PDF)
   WFCQuote.compute(S, D)      -> { lines, totals, checks } (for tests)
   The settings are kept in S.quote and saved with the project. What each line costs WFC and its markup are for the editor only: the document shows the
   price the client pays, nothing else. */
(function (root) {
  'use strict';
  const C = root.WFCCalc, DB = root.WFCDB, esc = root.WFCSlides.esc, num = C.num;
  const $ = (s, r) => (r || document).querySelector(s);
  const money = (v, d) => (+v || 0).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });

  const EXCL = {
    rent: ['Early termination: cancellation within the contract period incurs a penalty equal to the remaining months of full rental charges.']
  };
  // the standard exclusions (the route-change charge is WFC's usual one, from the price list)
  const exclDefault = rent => { const rc = num(((DB.quote || {}).routeChange)); return ['Major layout modifications or route redesign are not included in this quotation.',
    rc > 0 ? `AMR route changing after commissioning is charged separately at RM ${money(rc)} per AMR.` : 'AMR route changing after commissioning is charged separately.',
    'Items marked Optional, civil works, and power and network cabling to the AMR area are not included unless listed above.'].concat(rent ? EXCL.rent : []); };
  const SERVICE = [
    ['Mechanical check', 'Forks and lifting mechanism, tyre wear, brake system, lubrication'],
    ['Sensors and safety', 'LiDAR and laser calibration and cleaning, bumper sensor, emergency stop test, warning lights and indicators, alarm sounds'],
    ['Navigation and software', 'SLAM map stability and recalibration, traffic-control communication, task execution logs'],
    ['Battery system', 'Battery voltage and overall health, charging performance']
  ];

  /* ---------- the settings ---------- */
  // the selector tool's AMR and RCS prices are WFC's cost, so a quotation needs a markup on them; the one you usually add is kept on this PC
  const MKEY = 'wfc-quote-markup';
  const defaultMarkup = () => { try { const v = parseFloat(localStorage.getItem(MKEY)); if (Number.isFinite(v)) return v; } catch (e) { /* no saved one */ } return num((DB.quote || {}).markup, 0); };   // the one you saved, else the standard 30% in js/db.js
  function ensure(S) {
    const Q = S.quote || (S.quote = {});
    const d = { type: 'rent', termYears: 5, no: '', date: '', validityDays: 30, taxPct: num(DB.defaults && DB.defaults.taxPct, 0), markup: defaultMarkup(), delivery: 'DDP to your factory', period: '', payment: null, warranty: '1-year warranty on manufacturing defects',
      bank: 'All bank charges (remitter and beneficiary) are for your account and must not be deducted from our invoice.', exclusions: null, notes: '', service: true, perYear: 4, optB: { on: false, reduction: 0, months: 12 }, lines: {}, internal: false };
    Object.keys(d).forEach(k => { if (Q[k] === undefined) Q[k] = d[k]; });
    if (!Q.stamp) { const n = new Date(); Q.stamp = String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0'); }
    if (!Q.optB) Q.optB = d.optB; if (!Q.lines) Q.lines = {};
    return Q;
  }
  const stampDate = S => (S.quote && S.quote.date) || (S.client && S.client.date) || new Date().toISOString().slice(0, 10);
  // CLIENT-DDMMYYYY-HHMM, the way the existing quotations are numbered (the time is when this quotation was first made)
  const quoteNo = S => { if (S.quote && S.quote.no) return S.quote.no; const d = stampDate(S).split('-'), q = (S.quote && S.quote.stamp) || '0000'; return ((String((S.client && S.client.name) || 'WFC').trim().split(/\s+/)[0] || 'WFC').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'WFC') + '-' + d[2] + d[1] + d[0] + '-' + q; };
  const longDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return iso || ''; return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };

  /* ---------- the lines of the quotation, from the proposal ---------- */
  function defs(S, D, Q) {
    const M = (D && D.model) || {}, qty = Math.max(1, (D && D.qty) || 1), rent = Q.type === 'rent', ps = (S.layoutPlan && S.layoutPlan.points) || [], K = DB.quote || {}, st = K.setup || {};
    const doors = ps.filter(p => p.kind === 'door').length, stations = ps.filter(p => p.kind === 'pick').length || Math.max(1, num(S.scenario && S.scenario.stations, 1));
    const swap = S.fleet && S.fleet.strategy === 'swap';
    const L = [];
    const amr = [M.payloadKg ? `Load capacity: up to ${M.payloadKg >= 1000 ? (M.payloadKg / 1000) + ' tonne' : M.payloadKg + ' kg'}` : '', M.nav ? `Navigation: ${M.nav}` : '', M.battery ? `Battery: ${M.battery}` : '', 'Auto and manual mode (switchable)'].filter(Boolean);
    if (rent) {
      const known = num((K.rent || {})[M.id]), ref = DB.models.find(m => m.id === 'reeman-pj15'), ratio = ref && K.rent && K.rent['reeman-pj15'] ? K.rent['reeman-pj15'] / ref.unitPrice : 0, guess = !known && ratio && M.unitPrice ? Math.round(M.unitPrice * ratio / 100) * 100 : 0;
      L.push({ id: 'rent', label: 'AMR rental contract', sub: M.name, qty, uom: 'unit / month', base: known || guess, est: !known && guess > 0, taxable: true, monthly: true,
        bullets: amr.concat([Q.warranty, `Based on a ${Q.termYears}-year contract`, 'Rental contract includes AMR maintenance and service']) });
      L.push({ id: 'install', label: `Installation and commissioning of ${qty} AMR${qty > 1 ? 's' : ''}`, qty: 1, uom: 'LOT', base: num(st.install), taxable: false,
        bullets: ['Complete installation and commissioning of the AMR unit' + (qty > 1 ? 's' : ''), 'Supply and installation of charging stations, push buttons and related accessories', 'Navigation setup, route configuration and system integration', 'Functional testing and operator training'] });
      L.push({ id: 'rcs', label: 'Robot Control System (RCS)', qty: 1, uom: 'LOT', base: num(st.rcs), taxable: true,
        bullets: ['Centralised software platform for AMR task scheduling, traffic control, route management, mission dispatching, monitoring and reporting', 'Deployment and integration of the RCS on the designated server', 'Perpetual licence including user management, map management, traffic-control logic, task allocation and an operational dashboard'] });
    } else {
      const P = C.purchaseLines({ unitPrice: M.unitPrice, rcsUnit: M.rcsUnit, rcsAtQty1: M.rcsAtQty1 }, qty, DB.defaults);
      const pl = Object.fromEntries(P.map(l => [l.id, l]));
      L.push({ id: 'hw', label: 'AMR hardware', sub: M.name, qty, uom: 'unit', base: pl.hw.base, taxable: true, cost: true, bullets: amr.concat([Q.warranty]) });
      L.push({ id: 'rcs', label: 'Robot Control System (RCS) and system', qty: 1, uom: 'LOT', base: pl.rcs.base, taxable: true, cost: true,
        bullets: ['Centralised software platform for AMR task scheduling, traffic control, route management, mission dispatching, monitoring and reporting', 'Perpetual licence including user management, map management and an operational dashboard'] });
      L.push({ id: 'custom', label: 'Customisation', qty: 1, uom: 'LOT', base: pl.custom.base, taxable: true, bullets: ['Setup of the AMR for the site and the pallet'] });
      L.push({ id: 'delivery', label: 'Delivery', qty: 1, uom: 'LOT', base: pl.delivery.base, taxable: true, bullets: [Q.delivery] });
      L.push({ id: 'install', label: `Installation and commissioning of ${qty} AMR${qty > 1 ? 's' : ''}`, qty: 1, uom: 'LOT', base: pl.install.base, taxable: false,
        bullets: ['Complete installation and commissioning', 'Supply and installation of charging stations, push buttons and related accessories', 'Navigation setup, route configuration and system integration', 'Functional testing and operator training'] });
    }
    if (doors) L.push({ id: 'door', label: 'Automatic shuttle door integration and interlocking', qty: doors, uom: doors > 1 ? 'doors' : 'door', base: num(st.door), taxable: true,
      bullets: ['Hardware interfacing and software signal integration for AMR shuttle-door pass-through'] });
    L.push({ id: 'callbox', label: 'Wireless call box and station push-button system', qty: 1, uom: 'LOT', base: num(st.callbox), taxable: true,
      bullets: [`Supply, configuration and mounting of multi-station call buttons for AMR dispatching (${stations} station${stations > 1 ? 's' : ''})`] });
    if (swap && D && D.fleet && D.fleet.ok) {
      const x = (D.fleet.swap && D.fleet.swap.extraBatteries) || 0;
      if (x > 0) L.push({ id: 'spare', label: 'Spare batteries', qty: x, uom: 'unit', base: 0, taxable: true, bullets: ['One spare battery per AMR for hand swapping, so the AMR does not wait to charge'] });
    }
    L.push({ id: 'wifi', label: 'WiFi infrastructure setup', optional: true, qty: 1, uom: 'LOT', base: num(st.wifi), taxable: true,
      bullets: ['Supply and installation of industrial WiFi infrastructure for AMR communication and RCS operations', 'Network configuration and integration with the AMRs and the RCS', 'Wireless coverage verification and communication testing'] });
    L.push({ id: 'server', label: 'Server and monitoring station', optional: true, qty: 1, uom: 'LOT', base: num(st.server), taxable: true,
      bullets: ['Supply of a dedicated server for the Robot Control System', 'Deployment and configuration of the RCS software', 'Supply of a monitoring station including monitor, keyboard and mouse'] });
    return L;
  }
  function lines(S, D, Qx) {
    const Q = Qx || ensure(S);
    return defs(S, D, Q).map(d => {
      const o = Q.lines[Q.type + ':' + d.id] || {}, l = { id: d.id, label: d.label, sub: d.sub, uom: d.uom, bullets: d.bullets, optional: !!d.optional, monthly: !!d.monthly, taxable: d.taxable, est: !!d.est && o.base === undefined, cost: !!d.cost,
        on: o.on !== undefined ? !!o.on : !d.optional, qty: o.qty !== undefined ? num(o.qty, 1) : d.qty, base: o.base !== undefined ? num(o.base) : d.base, pct: o.pct !== undefined ? num(o.pct) : (d.cost ? num(Q.markup) : 0) };
      const c = C.lineCalc(l); l.unit = c.unit; l.total = c.total; l.markupPct = l.pct; return l;
    });
  }

  /* ---------- the numbers ---------- */
  function compute(S, D, type) {
    const Q0 = ensure(S), Q = type && type !== Q0.type ? Object.assign({}, Q0, { type }) : Q0, L = lines(S, D, Q), inc = L.filter(l => l.on), rent = Q.type === 'rent', tax = num(Q.taxPct), T = { rent };
    if (rent) {
      const su = C.sumLines(inc.filter(l => !l.monthly), tax), mo = C.sumLines(inc.filter(l => l.monthly), tax);
      T.setup = su; T.month = mo; T.upfront = su.grand + mo.grand; T.deposit = su.grand / 2 + mo.grand; T.balance = su.grand / 2;
      const red = Math.min(Math.max(num(Q.optB.reduction), 0), su.grand), months = Math.max(num(Q.optB.months, 12), 1);
      T.optB = Q.optB.on && red > 0 ? { setup: su.grand - red, y1: mo.grand + red / months, monthly: mo.grand, months, reduction: red, upfront: su.grand - red + mo.grand + red / months } : null;
    } else {
      T.sum = C.sumLines(inc, tax); T.pay = [T.sum.grand * 0.4, T.sum.grand * 0.4, T.sum.grand * 0.2];   // WFC's usual purchase terms: 40% on PO, 40% on stock arrival, 20% on completion
    }
    const cl = inc.filter(l => l.cost);   // the supplier items: what they cost WFC, what they are sold for
    T.hasCost = cl.length > 0; T.cost = cl.reduce((a, l) => a + l.base * l.qty, 0); T.sell = cl.reduce((a, l) => a + l.total, 0); T.marginPct = T.sell > 0 ? (T.sell - T.cost) / T.sell * 100 : 0;
    const checks = [];
    if (T.hasCost && !(T.sell > T.cost + 0.005)) checks.push('No markup: the AMR and RCS are at the selector tool cost price, so there is no margin');
    const noPrice = inc.filter(l => !(l.unit > 0)); if (noPrice.length) checks.push(`${noPrice.length} price${noPrice.length > 1 ? 's are' : ' is'} missing: ${noPrice.map(l => l.label).join(', ')}`);
    if (inc.some(l => l.est)) checks.push('The monthly rent is estimated from the 1.5T rental rate: confirm it');
    if (!tax) checks.push('No tax is added: confirm whether SST applies');
    if (!String(Q.period || '').trim()) checks.push('The delivery period is blank');
    if (!(S.client && S.client.name)) checks.push('The client name is blank');
    return { lines: L, totals: T, checks, Q };
  }
  // the estimated quotation for the proposal, both ways: what it costs to buy, and to rent (setup + monthly)
  function estimate(S, D) {
    const M = (D && D.model) || {}, qty = Math.max(1, (D && D.qty) || 1), ps = (S.layoutPlan && S.layoutPlan.points) || [], stations = ps.filter(p => p.kind === 'pick').length, doors = ps.filter(p => p.kind === 'door').length;
    const basis = [`${qty} x ${M.name || 'AMR'}`, stations ? `${stations} station${stations > 1 ? 's' : ''}` : '', doors ? `${doors} door${doors > 1 ? 's' : ''}` : '', S.fleet && S.fleet.strategy === 'swap' ? 'battery swap' : 'automatic charging'].filter(Boolean).join(' · ');
    return { buy: compute(S, D, 'buy').totals, rent: compute(S, D, 'rent').totals, basis, qty };
  }

  /* ---------- the A4 document ---------- */
  function docHtml(S, D) {
    const R = compute(S, D), Q = R.Q, T = R.totals, rent = T.rent, c = S.client || {}, k = S.contact || {}, co = DB.company, M = (D && D.model) || {}, qty = Math.max(1, (D && D.qty) || 1);
    const RM = v => money(v), dateIso = stampDate(S);
    const rows = R.lines.filter(l => l.on || l.optional).map((l, i) => `<tr class="q-row${l.on ? '' : ' q-off'}"><td class="n">${i + 1}</td>
      <td class="d"><b>${esc(l.label)}</b>${l.sub ? `<span class="q-sub">${esc(l.sub)}</span>` : ''}${l.optional ? '<em class="q-opt">Optional</em>' : ''}<ul>${l.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul></td>
      <td class="c">${l.qty}</td><td class="c">${esc(l.uom)}</td><td class="r">${l.unit > 0 ? RM(l.unit) : '<span class="q-tbc">to confirm</span>'}</td><td class="r">${l.on ? (l.unit > 0 ? RM(l.total) : '') : '<span class="q-muted">not included</span>'}</td></tr>`).join('');
    const tx = num(Q.taxPct), tl = n => `Tax (${tx}%)`;
    let totals = '', summary = '';
    if (rent) {
      totals = `<table class="q-tot">${tx ? `<tr><td>Setup before tax</td><td>${RM(T.setup.subtotal)}</td></tr><tr><td>${tl()}</td><td>${RM(T.setup.tax)}</td></tr>` : ''}<tr class="b"><td>Total one-time setup (RM)</td><td>${RM(T.setup.grand)}</td></tr>
        <tr class="b"><td>Monthly rental (RM / month)${tx ? ' incl. tax' : ''}</td><td>${RM(T.month.grand)}</td></tr></table>`;
      summary = `<div class="q-sum"><h3>Summary</h3><div class="q-stats"><div><small>One-time setup</small><b>RM ${RM(T.setup.grand)}</b></div><div><small>Monthly rental</small><b>RM ${RM(T.month.grand)}</b></div><div class="hi"><small>Initial payment (setup + 1st month)</small><b>RM ${RM(T.upfront)}</b></div></div>
        ${T.optB ? `<p class="q-optb"><b>Option B, lower setup:</b> setup RM ${RM(T.optB.setup)}; rental RM ${RM(T.optB.y1)} a month for the first ${T.optB.months} months, then RM ${RM(T.optB.monthly)} a month. Initial payment RM ${RM(T.optB.upfront)}.</p>` : ''}</div>`;
    } else {
      totals = `<table class="q-tot"><tr><td>Subtotal (RM)</td><td>${RM(T.sum.subtotal)}</td></tr>${tx ? `<tr><td>${tl()}</td><td>${RM(T.sum.tax)}</td></tr>` : ''}<tr class="b"><td>Total (RM)</td><td>${RM(T.sum.grand)}</td></tr></table>`;
    }
    const payment = Q.payment != null && String(Q.payment).trim() ? esc(Q.payment) : rent
      ? `50% of the setup and the 1st month rental upon PO confirmation: RM ${RM(T.deposit)}. 50% of the setup upon installation and commissioning completion: RM ${RM(T.balance)}.`
      : `40% upon receipt of PO: RM ${RM(T.pay[0])}. 40% upon stock arrival: RM ${RM(T.pay[1])}. 20% upon project completion: RM ${RM(T.pay[2])}.`;
    const exclusions = (Q.exclusions != null ? String(Q.exclusions).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : exclDefault(rent));
    const terms = [['Delivery terms', Q.delivery], ['Delivery period', String(Q.period || '').trim() || 'To be confirmed'], ['Offer validity', `${num(Q.validityDays, 30)} days from the quotation date`],
      ['Payment terms', payment], ['Warranty', Q.warranty], ['Bank charges', Q.bank]].filter(t => t[1]);
    const service = rent && Q.service ? `<section class="q-block q-service"><h3>AMR maintenance and service</h3><p>Service frequency: ${num(Q.perYear, 4)} times a year${num(Q.perYear, 4) === 4 ? ' (every quarter)' : ''}. Total service: ${qty} AMR${qty > 1 ? 's' : ''}.</p>
      <dl>${SERVICE.map(s => `<dt>${s[0]}</dt><dd>${esc(s[1])}</dd>`).join('')}</dl></section>` : '';
    return `<div class="qdoc">
      <header class="q-head"><div class="q-brand"><img src="${root.WFC_IMG && root.WFC_IMG.logo || ''}" alt=""><div><b>${esc(co.legal || co.name)}</b><span>${co.regNo ? 'Company No. ' + esc(co.regNo) : ''}</span><span>${esc(co.address)}</span><span>${esc(co.web)}</span></div></div>
        <div class="q-title"><h1>QUOTATION</h1><table class="q-meta"><tr><td>Quotation no.</td><td>${esc(quoteNo(S))}</td></tr><tr><td>Date</td><td>${esc(longDate(dateIso))}</td></tr>
        <tr><td>Your contact</td><td>${esc(k.name || '')}</td></tr><tr><td>Phone</td><td>${esc(k.phone || '')}</td></tr><tr><td>Email</td><td>${esc(k.email || '')}</td></tr></table></div></header>
      <section class="q-to"><div><small>Quoted to</small><b>${esc(c.name || 'Client name')}</b>${c.address ? `<p>${esc(c.address)}</p>` : ''}${c.attn ? `<p>Attn: ${esc(c.attn)}</p>` : ''}</div>
        <div><small>Project</small><b>${esc(S.subtitle || 'AMR project')}</b><p>${esc(M.name || '')}${qty ? `, ${qty} unit${qty > 1 ? 's' : ''}` : ''}</p></div></section>
      <p class="q-intro">${c.attn ? `Dear ${esc(c.attn)},` : 'Dear Sir or Madam,'}<br>Thank you for your enquiry. We are pleased to quote as follows.</p>
      <table class="q-table"><thead><tr><th>No.</th><th>Description</th><th>Qty</th><th>UOM</th><th>Unit price (RM)</th><th>Total (RM)</th></tr></thead><tbody>${rows}</tbody></table>
      ${totals}${summary}
      <section class="q-block"><h3>Terms</h3><dl class="q-terms">${terms.map(t => `<dt>${esc(t[0])}</dt><dd>${esc(t[1])}</dd>`).join('')}</dl></section>
      ${exclusions.length ? `<section class="q-block"><h3>Exclusions</h3><ol>${exclusions.map(e => `<li>${esc(e)}</li>`).join('')}</ol></section>` : ''}
      ${service}
      ${Q.notes ? `<section class="q-block"><h3>Notes</h3><p>${esc(Q.notes).replace(/\n/g, '<br>')}</p></section>` : ''}
      <section class="q-sign"><p>Best regards,<br><b>${esc(co.legal || co.name)}</b></p><div class="q-line"></div><p>${esc(k.name || '')}<br><small>Authorised signature</small></p></section>
    </div>`;
  }
  const printHtml = (S, D) => `<div class="qprint">${docHtml(S, D)}</div>`;

  /* ---------- the editor ----------
     Laid out like the quotation and invoice makers people already know (Stripe, Zoho, Xero, QuickBooks): sections that fold, one tidy row per item with an on/off switch,
     the figures that matter always visible in a bar at the bottom, and on a small screen an Edit | Preview switch instead of two squeezed columns. */
  let S0, D0, selfEdit = false, bound = false;
  const openSecs = { offer: true, items: true, tax: false, terms: false, excl: false, svc: false };
  const ICON = {
    offer: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
    items: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    tax: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
    terms: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
    excl: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    svc: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'
  };
  const svg = p => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const seg = (key, val, opts) => `<div class="seg" role="group" data-q="${key}">${opts.map(o => `<button type="button" class="tab${String(val) === String(o[0]) ? ' active' : ''}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
  const fld = (label, html, cls, tag) => `<${tag || 'label'} class="qf${cls ? ' ' + cls : ''}"><span>${label}</span>${html}</${tag || 'label'}>`;
  const rm = (input, warn) => `<div class="inp${warn ? ' warn' : ''}"><i>RM</i>${input}</div>`;

  function lineRow(l, internal) {
    const warn = l.on && !(l.unit > 0);
    return `<div class="ql${l.on ? '' : ' off'}" data-id="${l.id}">
      <label class="sw" title="Include in the quotation"><input type="checkbox" data-lf="on" ${l.on ? 'checked' : ''} aria-label="Include ${esc(l.label)}"><i></i></label>
      <div class="ql-name"><b>${esc(l.label)}</b>${l.sub || l.optional ? `<small>${l.sub ? esc(l.sub) : ''}${l.optional ? `<em>Optional</em>` : ''}</small>` : ''}</div>
      <label class="ql-f ql-q"><span>Qty</span><input type="number" min="0" step="1" data-lf="qty" value="${l.qty}"></label>
      <label class="ql-f ql-p"><span>Unit price</span>${rm(`<input type="number" min="0" step="any" data-lf="price" value="${l.unit ? +l.unit.toFixed(2) : ''}" placeholder="0.00">`, warn)}</label>
      <div class="ql-t"><span>Total</span><b data-tot>${l.on && l.total > 0 ? money(l.total) : '–'}</b></div>
      ${internal ? `<div class="ql-i"><label class="ql-f"><span>Cost (only you see this)</span>${rm(`<input type="number" min="0" step="any" data-lf="base" value="${l.base || ''}" placeholder="0.00">`)}</label>
        <label class="ql-f"><span>Markup</span><div class="inp"><input type="number" step="any" data-lf="pct" value="${l.pct ? +l.pct.toFixed(2) : ''}" placeholder="0"><i class="r">%</i></div></label></div>` : ''}
    </div>`;
  }
  function estHtml() {
    const E = estimate(S0, D0), Q = ensure(S0), tx = num(Q.taxPct), row = (k, a, b) => `<button type="button" class="qe-row${Q.type === k ? ' on' : ''}" data-est="${k}"><span>${a}</span><b>${b}</b></button>`;
    return `<small>Estimated quotation <em>from your proposal</em></small>${row('buy', 'To buy', 'RM ' + money(E.buy.sum.grand))}${row('rent', 'To rent', 'RM ' + money(E.rent.setup.grand) + ' setup + RM ' + money(E.rent.month.grand) + ' a month')}
      <p>${esc(E.basis)}. Prices from the AMR selector tool${tx ? `, with ${tx}% tax on everything except installation` : ''}.</p>${E.buy.hasCost ? `<p class="qe-cost${E.buy.sell > E.buy.cost + 0.005 ? '' : ' warn'}">${E.buy.sell > E.buy.cost + 0.005 ? `AMR and RCS: cost RM ${money(E.buy.cost)}, sold at RM ${money(E.buy.sell)}, a margin of ${E.buy.marginPct.toFixed(1)}% (only you see this).` : 'The AMR and RCS are at cost price: set a markup under Tax and markup.'}</p>` : ''}`;
  }
  function barHtml(R) {
    const T = R.totals, st = (l, v, cls) => `<div class="qb-s${cls ? ' ' + cls : ''}"><small>${l}</small><b>${v}</b></div>`, tx = num(R.Q.taxPct);
    return T.rent ? st('One-time setup', 'RM ' + money(T.setup.grand)) + st('Monthly rental', 'RM ' + money(T.month.grand)) + st('Initial payment', 'RM ' + money(T.upfront), 'hi')
      : st('Subtotal', 'RM ' + money(T.sum.subtotal)) + (tx ? st(`Tax ${tx}%`, 'RM ' + money(T.sum.tax)) : '') + st('Total', 'RM ' + money(T.sum.grand), 'hi');
  }
  function checkHtml(R) {
    const n = R.checks.length;
    return n ? `<details class="qcheck"><summary><b>${n} thing${n > 1 ? 's' : ''} to check</b> before you send it</summary><ul>${R.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul></details>`
      : '<div class="qcheck ok"><b>All set.</b> Everything needed is filled in.</div>';
  }
  function summaries(R) {
    const Q = R.Q, rent = Q.type === 'rent', inc = R.lines.filter(l => l.on).length;
    return { offer: `${rent ? 'Rent, ' + Q.termYears + ' years' : 'Buy'} · ${quoteNo(S0)}`, items: `${inc} of ${R.lines.length} items`, tax: (num(Q.taxPct) ? `Tax ${num(Q.taxPct)}%` : 'No tax added') + (num(Q.markup) ? ` · markup ${num(Q.markup)}%` : ' · no markup'),
      terms: `${num(Q.validityDays, 30)} days valid` + (String(Q.period || '').trim() ? ' · ' + Q.period : ''), excl: 'What is not included', svc: Q.service ? `${num(Q.perYear, 4)} visits a year` + (Q.optB.on ? ' · Option B' : '') : (Q.optB.on ? 'Option B' : 'Off') };
  }
  const sec = (id, title, sum, body) => `<details class="qsec" data-sec="${id}"${openSecs[id] ? ' open' : ''}><summary><span class="qs-ico">${svg(ICON[id])}</span><span class="qs-t">${title}</span><span class="qs-s" data-sum="${id}">${esc(sum)}</span>
    <svg class="qs-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="qs-b">${body}</div></details>`;
  function editorHtml() {
    const R = compute(S0, D0), Q = R.Q, rent = Q.type === 'rent', sm = summaries(R);
    const offer = fld('Quotation type', seg('type', Q.type, [['rent', 'Rent'], ['buy', 'Buy']]), '', 'div')
      + (rent ? fld('Contract term', seg('termYears', Q.termYears, [[3, '3 years'], [5, '5 years']]), '', 'div') : '')
      + `<div class="qgrid">${fld('Quotation no.', `<input data-qf="no" value="${esc(Q.no)}" placeholder="${esc(quoteNo(S0))}">`)}${fld('Date', `<input type="date" data-qf="date" value="${esc(stampDate(S0))}">`)}${fld('Valid for', `<div class="inp"><input type="number" min="1" data-qf="validityDays" value="${num(Q.validityDays, 30)}"><i class="r">days</i></div>`)}</div>`;
    const items = `<div class="ql-head"><span></span><span>Item</span><span>Qty</span><span>Unit price</span><span>Total</span></div><div class="qlines" id="qLines">${R.lines.map(l => lineRow(l, Q.internal)).join('')}</div>
      <label class="qtog"><span class="sw"><input type="checkbox" data-qf="internal" ${Q.internal ? 'checked' : ''}><i></i></span><span>Show cost and markup <small>only you see these; they are never printed</small></span></label>`;
    const tax = fld('Tax (SST)', `<div class="inp"><input type="number" min="0" step="any" data-qf="taxPct" value="${num(Q.taxPct)}"><i class="r">%</i></div>`, 'qf-s')
      + '<p class="qnote">The rate used in the selector tool, applied to every item except installation. Set 0 if tax is not charged.</p>'
      + fld('Markup on the AMR and RCS', `<div class="inp"><input type="number" step="any" data-qf="markup" value="${num(Q.markup) || ''}" placeholder="0"><i class="r">%</i></div>`, 'qf-s')
      + '<p class="qnote">The selector tool prices for the AMR and the RCS are your cost: this is added on top (only you see it). Customisation, delivery and installation start at your usual selling prices; price any item by hand with Show cost and markup.</p>'
      + '<button type="button" class="btn quiet qsave" data-save-markup>Use this markup for new quotations</button>';
    const terms = fld('Delivery terms', `<input data-qf="delivery" value="${esc(Q.delivery)}">`) + fld('Delivery period', `<input data-qf="period" value="${esc(Q.period)}" placeholder="e.g. 12 weeks from PO">`)
      + fld('Payment terms', `<textarea rows="3" data-qf="payment" placeholder="Filled in from the totals (rent: 50% / 50%; buy: 40% / 40% / 20%). Type here to change it.">${esc(Q.payment || '')}</textarea>`)
      + fld('Warranty', `<input data-qf="warranty" value="${esc(Q.warranty)}">`) + fld('Bank charges', `<textarea rows="2" data-qf="bank">${esc(Q.bank)}</textarea>`);
    const excl = fld('Exclusions (one per line)', `<textarea rows="5" data-qf="exclusions">${esc(Q.exclusions != null ? Q.exclusions : exclDefault(rent).join('\n'))}</textarea>`)
      + fld('Notes for the client', `<textarea rows="2" data-qf="notes" placeholder="Anything else you want on the quotation">${esc(Q.notes)}</textarea>`);
    const svc = rent ? `<label class="qtog"><span class="sw"><input type="checkbox" data-qf="service" ${Q.service ? 'checked' : ''}><i></i></span><span>Add the maintenance and service page</span></label>
      ${Q.service ? fld('Service visits a year', `<input type="number" min="1" data-qf="perYear" value="${num(Q.perYear, 4)}">`, 'qf-s') : ''}
      <label class="qtog"><span class="sw"><input type="checkbox" data-qf="optB.on" ${Q.optB.on ? 'checked' : ''}><i></i></span><span>Offer a lower setup fee (option B) <small>the saving is paid back through a higher rental for a while</small></span></label>
      ${Q.optB.on ? `<div class="qgrid">${fld('Reduce setup by', rm(`<input type="number" min="0" step="any" data-qf="optB.reduction" value="${num(Q.optB.reduction) || ''}">`))}${fld('Paid back over', `<div class="inp"><input type="number" min="1" data-qf="optB.months" value="${num(Q.optB.months, 12)}"><i class="r">months</i></div>`)}</div>` : ''}`
      : '<p class="qnote">The maintenance and service page and option B are for rental quotations.</p>';
    return `<div id="qEst" class="qest">${estHtml()}</div><div id="qCheck">${checkHtml(R)}</div>${sec('offer', 'Offer', sm.offer, offer)}${sec('items', 'Items and prices', sm.items, items)}${sec('tax', 'Tax and markup', sm.tax, tax)}${sec('terms', 'Terms and payment', sm.terms, terms)}${sec('excl', 'Exclusions and notes', sm.excl, excl)}${sec('svc', rent ? 'Service and option B' : 'Service', sm.svc, svc)}
      <p class="qhint">The proposal PDF never shows a price. <b>Download PDF</b> saves this quotation as its own PDF.</p>`;
  }
  function refresh(full) {
    const ed = $('#qEdit'), sheet = $('#qSheet'); if (!ed || !sheet) return;
    const R = compute(S0, D0);
    if (full) ed.innerHTML = editorHtml();
    else {
      const c = $('#qCheck'); if (c) { const open = c.querySelector('details') && c.querySelector('details').open; c.innerHTML = checkHtml(R); if (open) { const d = c.querySelector('details'); if (d) d.open = true; } }
      const sm = summaries(R); Object.keys(sm).forEach(k => { const e = ed.querySelector(`[data-sum="${k}"]`); if (e) e.textContent = sm[k]; });
      R.lines.forEach(l => { const row = ed.querySelector(`.ql[data-id="${l.id}"]`); if (!row) return; const e = row.querySelector('[data-tot]'); if (e) e.textContent = l.on && l.total > 0 ? money(l.total) : '–';
        const pi = row.querySelector('[data-lf="price"]'); if (pi && pi !== document.activeElement) pi.value = l.unit ? +l.unit.toFixed(2) : ''; });   // a markup or tax change moves the prices too
    }
    const es = $('#qEst'); if (es) es.innerHTML = estHtml();
    const bar = $('#qTotal'); if (bar) bar.innerHTML = barHtml(R);
    const st = $('#qStatus'); if (st) { st.className = 'qchip' + (R.checks.length ? '' : ' ok'); st.textContent = R.checks.length ? `${R.checks.length} to check` : 'Ready'; }
    sheet.innerHTML = docHtml(S0, D0); fit();
  }
  function fit() {
    const box = $('#qPrev'), sheet = $('#qSheet'); if (!box || !sheet || !box.clientWidth) return;
    const w = box.clientWidth - (box.clientWidth < 600 ? 16 : 40); if (w > 100) sheet.style.setProperty('--qs', Math.min(1.25, w / 794).toFixed(3));
  }
  function persist() { selfEdit = true; if (root.WFCApp && root.WFCApp.changed) root.WFCApp.changed(); }
  function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
  function bind() {
    if (bound) return; bound = true;
    const ed = $('#qEdit'), qz = $('#quote');
    ed.addEventListener('click', e => {
      const sv = e.target.closest('[data-save-markup]'); if (sv) { try { localStorage.setItem(MKEY, String(num(ensure(S0).markup))); sv.textContent = 'Saved: new quotations start at ' + num(ensure(S0).markup) + '%'; } catch (err) { sv.textContent = 'Could not save on this browser'; } return; }
      const es = e.target.closest('[data-est]'); if (es) { ensure(S0).type = es.dataset.est; ensure(S0).exclusions = null; persist(); refresh(true); return; }
      const b = e.target.closest('.seg[data-q] [data-v]'); if (!b) return; const Q = ensure(S0), key = b.closest('.seg').dataset.q;
      Q[key] = key === 'termYears' ? +b.dataset.v : b.dataset.v;
      if (key === 'type') Q.exclusions = null;   // the standard exclusions follow the type
      persist(); refresh(true);
    });
    ed.addEventListener('toggle', e => { const d = e.target.closest && e.target.closest('details.qsec'); if (d) openSecs[d.dataset.sec] = d.open; }, true);
    const onEdit = e => {
      const el = e.target, Q = ensure(S0);
      if (el.dataset.lf) {   // one line
        const row = el.closest('.ql'), id = row.dataset.id, key = Q.type + ':' + id, o = Q.lines[key] || (Q.lines[key] = {}), f = el.dataset.lf, cur = lines(S0, D0).find(l => l.id === id);
        if (f === 'on') { o.on = el.checked; row.classList.toggle('off', !el.checked); }
        else if (f === 'qty') o.qty = Math.max(0, num(el.value));
        else if (f === 'base') o.base = Math.max(0, num(el.value));
        else if (f === 'pct') o.pct = num(el.value);
        else if (f === 'price') { const t = { base: cur.base, pct: cur.pct }; C.setLinePrice(t, el.value); o.base = t.base; o.pct = t.pct; }
        persist();
        const now = lines(S0, D0).find(l => l.id === id);   // the other boxes of this row follow (cost, markup and price stay linked), except the one being typed in
        [['base', now.base], ['pct', now.pct ? +now.pct.toFixed(2) : ''], ['price', now.unit ? +now.unit.toFixed(2) : '']].forEach(([k, v]) => { const i = row.querySelector(`[data-lf="${k}"]`); if (i && i !== el) i.value = v === 0 ? '' : v; });
        const p = row.querySelector('[data-lf="price"]'); if (p) p.closest('.inp').classList.toggle('warn', !(num(p.value) > 0) && !row.classList.contains('off'));
        refresh(false); return;
      }
      if (el.dataset.qf) {
        const f = el.dataset.qf, v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? num(el.value) : el.value;
        setPath(Q, f, v);
        if ((f === 'payment' || f === 'exclusions') && !String(el.value).trim()) Q[f] = null;
        persist();
        if (el.type === 'checkbox') { refresh(true); return; }
        refresh(false);
      }
    };
    ed.addEventListener('input', onEdit);
    // small screens: Edit | Preview
    const mode = $('#qMode'); if (mode) mode.addEventListener('click', e => { const b = e.target.closest('[data-qm]'); if (!b) return; qz.dataset.qm = b.dataset.qm; mode.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b)); fit(); setTimeout(fit, 60); });
    if (window.ResizeObserver && $('#qPrev')) new ResizeObserver(fit).observe($('#qPrev'));
  }
  function update(S, D) {
    S0 = S; D0 = D; ensure(S); bind();
    if (selfEdit) { selfEdit = false; refresh(false); return; }   // an edit made here: only the totals and the document move (the fields keep the cursor)
    refresh(true);
  }
  root.WFCQuote = { update, printHtml, compute, estimate, ensure, docHtml };
})(window);
