/* WFC Proposal Builder: the Quotation tab. The proposal itself has NO prices; the price, the terms and the signature block live here, in their own A4 document,
   made from the same project (client, contact, AMR model and quantity, doors and stations on the layout, charging plan).

   The quotation is its own saved document (S.quote): the items are real rows made from the proposal once, then edited in place, with a "Sync from proposal"
   button that never overwrites a hand edit without asking. The A4 page you edit is the page that becomes the PDF (docHtml with { edit: true } or without).

   WFCQuote.update(S, D)       -> draws the tab (the editable quotation, the side panel, the figures bar)
   WFCQuote.printHtml(S, D)    -> the quotation as print pages (used by Save PDF)
   WFCQuote.compute(S, D)      -> { lines, totals, checks } (for tests)
   What each supplier item costs WFC and its markup are for the editor only: the document shows the price the client pays, nothing else. */
(function (root) {
  'use strict';
  const C = root.WFCCalc, DB = root.WFCDB, esc = root.WFCSlides.esc, num = C.num;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const round2 = v => Math.round(((+v || 0) + (v < 0 ? -1e-9 : 1e-9)) * 100) / 100;
  const money = (v, d) => (+v || 0).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d });
  const CURS = { MYR: 'RM', USD: 'US$', SGD: 'S$', EUR: '€', GBP: '£', CNY: 'CN¥', JPY: '¥', AUD: 'A$' };
  const sym = Q => CURS[Q.currency] || Q.currency || 'RM';
  const CE = (() => { try { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; } catch (e) { return 'true'; } })();
  const fmtQty = v => { const n = +v || 0; return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); };
  // a number typed by a person: "1,200.50", " 12 " ... -> number; '' -> null; anything else -> NaN
  function parseNum(s) { const t = String(s == null ? '' : s).replace(/[\s,]/g, '').replace(/^(RM|MYR|US\$|S\$|\$)/i, ''); if (t === '') return null; return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN; }
  let uidn = 0; const uid = () => 'm' + Date.now().toString(36) + (uidn++).toString(36);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const longDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return iso || ''; return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const addDays = (iso, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return ''; const d = new Date(+m[1], +m[2] - 1, +m[3] + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- the wording (taken from WFC's own quotations; the late-penalty and cancellation terms are from the 21 Sep rental quotation) ---------- */
  const T_ = {
    delivery: 'DDP to your factory',
    periodRent: '3.5 months from PO confirmation date (excludes installation & commissioning)',
    late: 'RM200.00 per calendar day of delay starting from the 3rd business day beyond the delivery period, capped at a maximum of RM4,000.00, deducted from the final invoice.',
    cancel: 'Order cancellation is permitted only if delivery delay exceeds 60 calendar days. Upon cancellation, the Seller shall refund the initial upfront deposit as full and final settlement, with all penalty claims waived upon contract termination.',
    warranty: '1-year warranty on manufacturing defects',
    bank: 'All bank charges (remitter & beneficiary) are for your account and must not be deducted from our invoice.',
    order: 'Please indicate our quotation number in your order confirmation.',
    install: 'As described in the installation and commissioning item above.',
    accept: 'We confirm the order by accepting the terms.'
  };
  const SPEC = {
    amr: ['Auto and manual mode (switchable)'],
    install: ['Complete installation and commissioning', 'Supply and installation of charging stations, push buttons and related accessories', 'Navigation setup, route configuration and system integration', 'Functional testing and operator training'],
    rcs: ['Centralised software platform for AMR task scheduling, traffic control, route management, mission dispatching, monitoring and reporting', 'Deployment and integration of the RCS on the designated server', 'Perpetual licence including user management, map management, traffic-control logic, task allocation and an operational dashboard'],
    door: ['Hardware interfacing and software signal integration for AMR shuttle-door pass-through'],
    callbox: ['Supply, configuration and mounting of multi-station call buttons for AMR dispatching'],
    wifi: ['Supply and installation of industrial WiFi infrastructure for AMR communication and RCS operations', 'Network configuration and integration with the AMRs and the RCS', 'Wireless coverage verification and communication testing'],
    server: ['Supply of a dedicated server for the Robot Control System', 'Deployment and configuration of the RCS software', 'Supply of a monitoring station including monitor, keyboard and mouse']
  };
  const SERVICE = [
    ['Mechanical check', 'Forks and lifting mechanism, tyre wear, brake system, lubrication'],
    ['Sensors and safety', 'LiDAR and laser calibration and cleaning, bumper sensor, emergency stop test, warning lights and indicators, alarm sounds'],
    ['Navigation and software', 'SLAM map stability and recalibration, traffic-control communication, task execution logs'],
    ['Battery system', 'Battery voltage and overall health, charging performance']
  ];
  // the standard exclusions (the route-change charge is WFC's usual one, from the price list)
  const exclDefault = rent => { const rc = num((DB.quote || {}).routeChange); return ['Major layout modifications or route redesign are not included in this quotation.',
    rc > 0 ? `AMR route changing after commissioning is charged separately at RM ${money(rc)} per AMR.` : 'AMR route changing after commissioning is charged separately.',
    'Items marked Optional, civil works, and power and network cabling to the AMR area are not included unless listed above.'].concat(rent ? ['Early termination: cancellation within the contract period incurs a penalty equal to the remaining months of full rental charges.'] : []); };
  const defaultTerms = type => [
    { id: 'delivery', k: 'Delivery terms', v: T_.delivery, on: true },
    { id: 'period', k: 'Delivery period', v: type === 'rent' ? T_.periodRent : '', on: true },
    { id: 'late', k: 'Late penalty', v: T_.late, on: true },
    { id: 'cancel', k: 'Cancellation terms', v: T_.cancel, on: true },
    { id: 'validity', k: 'Offer validity', v: null, on: true },
    { id: 'payment', k: 'Payment terms', v: null, on: true },
    { id: 'warranty', k: 'Warranty', v: T_.warranty, on: true },
    { id: 'install', k: 'Installation scope', v: T_.install, on: false },
    { id: 'bank', k: 'Bank charges', v: T_.bank, on: true },
    { id: 'order', k: 'Order confirmation', v: T_.order, on: true }
  ];

  /* ---------- the settings ---------- */
  // the selector tool's AMR and RCS prices are WFC's cost, so a quotation needs a markup on them; the one you usually add is kept on this PC
  const MKEY = 'wfc-quote-markup', BKEY = 'wfc-quote-bank', SKEY = 'wfc-quote-seq';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const defaultMarkup = () => { const v = parseFloat(lsGet(MKEY)); return Number.isFinite(v) ? v : num((DB.quote || {}).markup, 0); };   // the one you saved, else the standard 30% in js/db.js
  const defaultBank = () => { try { const b = JSON.parse(lsGet(BKEY)); if (b && typeof b === 'object') return { bank: String(b.bank || ''), name: String(b.name || ''), no: String(b.no || '') }; } catch (e) { /* none saved */ } return { bank: '', name: DB.company.legal || '', no: '' }; };
  // quotation numbers WFC-QT-YYYY-NNNN: one counter per year kept on this PC (the shared register comes with phase 4)
  let memSeq = {};
  function nextNo(year) {
    let seq = memSeq; const raw = lsGet(SKEY); if (raw) { try { seq = JSON.parse(raw) || {}; } catch (e) { seq = memSeq; } }
    seq[year] = (seq[year] | 0) + 1; memSeq = seq; lsSet(SKEY, JSON.stringify(seq));
    return 'WFC-QT-' + year + '-' + String(seq[year]).padStart(4, '0');
  }
  function assignNo(S) { const Q = ensure(S); if (!Q.no) Q.no = nextNo((Q.date || today()).slice(0, 4)); return Q.no; }
  const quoteNo = S => (S.quote && S.quote.no) || 'WFC-QT-' + ((S.quote && S.quote.date) || today()).slice(0, 4) + '-0000';

  function ensure(S, D) {
    const Q = S.quote || (S.quote = {});
    const legacy = Q.v !== 2 ? { period: Q.period, delivery: Q.delivery, payment: Q.payment, warranty: Q.warranty, bank: Q.bank, exclusions: Q.exclusions, lines: Q.lines } : null;
    const d = { type: 'rent', termYears: 5, no: '', rev: 1, status: 'draft', date: '', validityDays: 30, currency: 'MYR', taxPct: num(DB.defaults && DB.defaults.taxPct, 0), taxLabel: 'SST', markup: defaultMarkup(), disc: { mode: 'pct', v: 0 },
      head: {}, items: {}, sig: {}, terms: null, excl: null, notes: '', service: true, perYear: 4, accept: true, optB: { on: false, reduction: 0, months: 12 }, internal: false, tbc: { tax: 1, period: 1, bank: 1 }, bankInfo: defaultBank() };
    Object.keys(d).forEach(k => { if (Q[k] === undefined) Q[k] = d[k]; });
    Q.v = 2;
    if (!Q.date) Q.date = (S.client && /^\d{4}-\d{2}-\d{2}/.test(S.client.date || '') && S.client.date.slice(0, 10)) || today();
    if (!Q.terms) Q.terms = defaultTerms(Q.type);
    if (legacy) {   // a quotation saved by the first version of this tab: keep what was typed
      const set = (id, v) => { const t = Q.terms.find(x => x.id === id); if (t && v != null && String(v).trim() !== '') t.v = String(v); };
      set('delivery', legacy.delivery); set('period', legacy.period); set('payment', legacy.payment); set('warranty', legacy.warranty); set('bank', legacy.bank);
      if (legacy.exclusions != null) Q.excl = String(legacy.exclusions).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (legacy.period) Q.tbc.period = 0;
      Q.legacyLines = legacy.lines || null; delete Q.lines; delete Q.period; delete Q.delivery; delete Q.payment; delete Q.warranty; delete Q.bank; delete Q.exclusions; delete Q.stamp;
    }
    if (D) rowsFor(S, D, Q, Q.type, true);
    return Q;
  }
  const headVal = (S, Q, k) => {
    if (Q.head && Q.head[k] !== undefined) return Q.head[k];
    const c = S.client || {}, p = S.contact || {};
    return ({ toName: c.name, toAddress: c.address, attn: c.attn, project: S.subtitle || 'AMR project', ref: c.ref, contact: p.name, phone: p.phone, email: p.email })[k] || '';
  };

  /* ---------- the items, made from the proposal ---------- */
  function defs(S, D, Q, type) {
    const M = (D && D.model) || {}, qty = Math.max(1, (D && D.qty) || 1), rent = type === 'rent', ps = (S.layoutPlan && S.layoutPlan.points) || [], K = DB.quote || {}, st = K.setup || {};
    const doors = ps.filter(p => p.kind === 'door').length, stations = ps.filter(p => p.kind === 'pick').length || Math.max(1, num(S.scenario && S.scenario.stations, 1));
    const swap = S.fleet && S.fleet.strategy === 'swap';
    const L = [], s = (a, extra) => a.concat(extra || []);
    const amr = [M.payloadKg ? `Load capacity: up to ${M.payloadKg >= 1000 ? (M.payloadKg / 1000) + ' tonne' : M.payloadKg + ' kg'}` : '', M.nav ? `Navigation: ${M.nav}` : '', M.battery ? `Battery: ${M.battery}` : ''].filter(Boolean).concat(SPEC.amr);
    const inst = `Installation and commissioning of ${qty} AMR${qty > 1 ? 's' : ''}`;
    if (rent) {
      const known = num((K.rent || {})[M.id]), ref = DB.models.find(m => m.id === 'reeman-pj15'), ratio = ref && K.rent && K.rent['reeman-pj15'] ? K.rent['reeman-pj15'] / ref.unitPrice : 0, guess = !known && ratio && M.unitPrice ? Math.round(M.unitPrice * ratio / 100) * 100 : 0;
      L.push({ id: 'rent', label: 'AMR rental contract', sub: M.name, qty, uom: 'unit / month', base: known || guess, est: !known && guess > 0, taxable: true, monthly: true,
        bullets: s(amr, [`Based on a ${Q.termYears}-year contract`, 'Rental contract includes AMR maintenance and service']) });
      L.push({ id: 'install', label: inst, qty: 1, uom: 'LOT', base: num(st.install), taxable: false, bullets: SPEC.install });
      L.push({ id: 'rcs', label: 'Robot Control System (RCS)', qty: 1, uom: 'LOT', base: num(st.rcs), taxable: true, bullets: SPEC.rcs });
    } else {
      const P = C.purchaseLines({ unitPrice: M.unitPrice, rcsUnit: M.rcsUnit, rcsAtQty1: M.rcsAtQty1 }, qty, DB.defaults);
      const pl = Object.fromEntries(P.map(l => [l.id, l]));
      L.push({ id: 'hw', label: 'AMR hardware', sub: M.name, qty, uom: 'unit', base: pl.hw.base, taxable: true, cost: true, bullets: amr });
      L.push({ id: 'rcs', label: 'Robot Control System (RCS) and system', qty: 1, uom: 'LOT', base: pl.rcs.base, taxable: true, cost: true,
        bullets: [SPEC.rcs[0], 'Perpetual licence including user management, map management and an operational dashboard'] });
      L.push({ id: 'custom', label: 'Customisation', qty: 1, uom: 'LOT', base: pl.custom.base, taxable: true, bullets: ['Setup of the AMR for the site and the pallet'] });
      L.push({ id: 'delivery', label: 'Delivery', qty: 1, uom: 'LOT', base: pl.delivery.base, taxable: true, bullets: [T_.delivery] });
      L.push({ id: 'install', label: inst, qty: 1, uom: 'LOT', base: pl.install.base, taxable: false, bullets: SPEC.install });
    }
    if (doors) L.push({ id: 'door', label: 'Automatic shuttle door integration and interlocking', qty: doors, uom: doors > 1 ? 'doors' : 'door', base: num(st.door), taxable: true, bullets: SPEC.door });
    L.push({ id: 'callbox', label: 'Wireless call box and station push-button system', qty: 1, uom: 'LOT', base: num(st.callbox), taxable: true, bullets: [SPEC.callbox[0] + ` (${stations} station${stations > 1 ? 's' : ''})`] });
    if (swap && D && D.fleet && D.fleet.ok) {
      const x = (D.fleet.swap && D.fleet.swap.extraBatteries) || 0;
      if (x > 0) L.push({ id: 'spare', label: 'Spare batteries', qty: x, uom: 'unit', base: 0, taxable: true, bullets: ['One spare battery per AMR for hand swapping, so the AMR does not wait to charge'] });
    }
    L.push({ id: 'wifi', label: 'WiFi infrastructure setup', optional: true, qty: 1, uom: 'LOT', base: num(st.wifi), taxable: true, bullets: SPEC.wifi });
    L.push({ id: 'server', label: 'Server and monitoring station', optional: true, qty: 1, uom: 'LOT', base: num(st.server), taxable: true, bullets: SPEC.server });
    return L;
  }
  const mkRow = (d, Q) => ({ id: d.id, src: true, name: d.label, sub: d.sub || '', specs: (d.bullets || []).join('\n'), qty: d.qty, uom: d.uom, base: d.base || 0, pct: d.cost ? num(Q.markup) : 0, disc: 0,
    taxable: !!d.taxable, optional: !!d.optional, monthly: !!d.monthly, on: !d.optional, cost: !!d.cost, est: !!d.est, ed: {} });
  const fresh = (S, D, Q, type) => defs(S, D, Q, type).map(d => mkRow(d, Q));
  // what the proposal says now: when this changes, the saved items are out of date
  const sig = (S, D, type) => { const ps = (S.layoutPlan && S.layoutPlan.points) || [], M = (D && D.model) || {}; return [type, M.id, (D && D.qty) || 1, ps.filter(p => p.kind === 'door').length, ps.filter(p => p.kind === 'pick').length, S.fleet && S.fleet.strategy, D && D.fleet && D.fleet.swap && D.fleet.swap.extraBatteries].join('|'); };
  function rowsFor(S, D, Q, type, save) {
    if (Q.items && Q.items[type]) return Q.items[type];
    const rows = fresh(S, D, Q, type);
    const lg = Q.legacyLines;
    if (lg) rows.forEach(r => { const o = lg[type + ':' + r.id]; if (!o) return; if (o.on !== undefined) r.on = !!o.on; if (o.qty !== undefined) { r.qty = num(o.qty, 1); r.ed.qty = 1; } if (o.base !== undefined) { r.base = num(o.base); r.ed.price = 1; } if (o.pct !== undefined) { r.pct = num(o.pct); r.ed.price = 1; } });
    if (save) { Q.items = Q.items || {}; Q.items[type] = rows; Q.sig = Q.sig || {}; Q.sig[type] = sig(S, D, type); if (type === Q.type) delete Q.legacyLines; }
    return rows;
  }
  function calcRow(r) {
    const qty = Math.max(0, num(r.qty)), base = num(r.base), pct = num(r.pct), unit = round2(base * (1 + pct / 100)), disc = Math.min(100, Math.max(0, num(r.disc)));
    const gross = round2(qty * unit), discAmt = round2(gross * disc / 100), net = round2(gross - discAmt);
    return Object.assign({}, r, { qty, base, pct, unit, disc, gross, discAmt, net, total: net, specList: String(r.specs || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean), on: !!r.on, est: !!r.est && !(r.ed && r.ed.price), markupPct: pct });
  }
  const hasEd = r => !!r.ed && Object.keys(r.ed).some(k => r.ed[k]);

  /* ---------- the numbers ---------- */
  function sect(rows, taxPct, extra) {
    let gross = 0, rowDisc = 0, net = 0, taxBase = 0;
    rows.forEach(l => { gross += l.gross; rowDisc += l.discAmt; net += l.net; if (l.taxable) taxBase += l.net; });
    const v = extra ? Math.max(0, num(extra.v)) : 0, ex = !extra || !v ? 0 : extra.mode === 'amt' ? Math.min(round2(v), net) : round2(net * Math.min(100, v) / 100);
    const after = round2(net - ex), f = net > 0 ? after / net : 1, tax = round2(taxBase * f * num(taxPct) / 100);
    return { subtotal: round2(gross), discount: round2(rowDisc + ex), rowDisc: round2(rowDisc), extra: ex, net: after, tax, grand: round2(after + tax) };
  }
  function compute(S, D, type) {
    const Q = ensure(S, D), ty = type || Q.type, rent = ty === 'rent', tax = num(Q.taxPct);
    const L = rowsFor(S, D, Q, ty, ty === Q.type).map(calcRow), inc = L.filter(l => l.on), T = { rent };
    if (rent) {
      const su = sect(inc.filter(l => !l.monthly), tax, Q.disc), mo = sect(inc.filter(l => l.monthly), tax, null);
      T.setup = su; T.month = mo; T.upfront = round2(su.grand + mo.grand); T.deposit = round2(T.upfront / 2); T.balance = round2(T.upfront - T.deposit);   // 50% of the initial payment on PO, 50% on completion (the 21 Sep rental quotation)
      const red = Math.min(Math.max(num(Q.optB.reduction), 0), su.grand), months = Math.max(num(Q.optB.months, 12), 1);
      T.optB = Q.optB.on && red > 0 ? { setup: su.grand - red, y1: mo.grand + red / months, monthly: mo.grand, months, reduction: red, upfront: su.grand - red + mo.grand + red / months } : null;
    } else {
      T.sum = sect(inc, tax, Q.disc); const g = T.sum.grand; T.pay = [round2(g * 0.4), round2(g * 0.4), round2(g - round2(g * 0.4) * 2)];   // WFC's usual purchase terms: 40% on PO, 40% on stock arrival, 20% on completion
    }
    const cl = inc.filter(l => l.cost);   // the supplier items: what they cost WFC, what they are sold for
    T.hasCost = cl.length > 0; T.cost = cl.reduce((a, l) => a + l.base * l.qty, 0); T.sell = cl.reduce((a, l) => a + l.net, 0); T.marginPct = T.sell > 0 ? (T.sell - T.cost) / T.sell * 100 : 0;
    const info = [], add = (msg, key, confirm) => info.push({ msg, key, confirm: !!confirm });
    if (!(S.client && String(S.client.name || '').trim() || Q.head && Q.head.toName)) add('The customer name is blank', 'name');
    if (!inc.length) add('No item is included in the quotation', 'items');
    const badQty = inc.filter(l => !(l.qty > 0)); if (badQty.length) add(`${badQty.length} item${badQty.length > 1 ? 's have' : ' has'} no quantity: ${badQty.map(l => l.name).join(', ')}`, 'qty');
    const noPrice = inc.filter(l => !(l.unit > 0)); if (noPrice.length) add(`${noPrice.length} price${noPrice.length > 1 ? 's are' : ' is'} missing: ${noPrice.map(l => l.name).join(', ')}`, 'price');
    if (T.hasCost && !(T.sell > T.cost + 0.005)) add('No markup: the AMR and RCS are at the selector tool cost price, so there is no margin', 'markup');
    if (inc.some(l => l.est)) add('The monthly rent is estimated from the 1.5T rental rate: confirm it', 'price');
    if (Q.tbc.tax) add(`The tax rate (${Q.taxLabel || 'tax'} ${tax}%) is not confirmed: check it with accounts`, 'tax', true);
    if (!String(((Q.terms.find(t => t.id === 'period') || {}).v) || '').trim()) add('The delivery period is blank', 'period');
    else if (Q.tbc.period) add('The delivery period is the standard one from the last rental quotation: confirm it for this job', 'period', true);
    const bi = Q.bankInfo || {}; if (!(bi.bank && bi.no)) add('The bank details are blank, so they are not printed', 'bank');
    if (!String(headVal(S, Q, 'contact') || '').trim()) add('Your contact person is blank', 'contact');
    return { lines: L, totals: T, checks: info.map(i => i.msg), checkInfo: info, Q, type: ty };
  }
  // the estimated quotation for the proposal, both ways: what it costs to buy, and to rent (setup + monthly)
  function estimate(S, D) {
    const M = (D && D.model) || {}, qty = Math.max(1, (D && D.qty) || 1), ps = (S.layoutPlan && S.layoutPlan.points) || [], stations = ps.filter(p => p.kind === 'pick').length, doors = ps.filter(p => p.kind === 'door').length;
    const basis = [`${qty} x ${M.name || 'AMR'}`, stations ? `${stations} station${stations > 1 ? 's' : ''}` : '', doors ? `${doors} door${doors > 1 ? 's' : ''}` : '', S.fleet && S.fleet.strategy === 'swap' ? 'battery swap' : 'automatic charging'].filter(Boolean).join(' · ');
    return { buy: compute(S, D, 'buy').totals, rent: compute(S, D, 'rent').totals, basis, qty };
  }

  /* ---------- sync from the proposal ---------- */
  const FIELDS = ['name', 'sub', 'specs', 'qty', 'uom', 'taxable', 'monthly'];
  function mergeRows(rows, fr, mode) {
    const out = []; let updated = 0;
    const byId = {}; fr.forEach(f => { byId[f.id] = f; });
    rows.forEach(r => {
      if (!r.src) { out.push(r); return; }   // the rows you added are always kept
      const f = byId[r.id];
      if (!f) { if (mode === 'keep' && hasEd(r)) { out.push(Object.assign({}, r, { gone: true })); } return; }   // no longer in the proposal: removed, unless you changed it
      const n = mode === 'replace' ? Object.assign({}, f, { on: r.on }) : Object.assign({}, r, { gone: undefined });
      if (n.gone === undefined) delete n.gone;
      if (mode === 'keep') {
        FIELDS.forEach(k => { if (!(r.ed && r.ed[k])) n[k] = f[k]; });
        if (!(r.ed && r.ed.price)) { n.base = f.base; n.pct = f.pct; n.est = f.est; }
        n.optional = f.optional;
      }
      if (JSON.stringify(n) !== JSON.stringify(r)) updated++;
      out.push(n);
    });
    // new rows from the proposal go after the row that precedes them in the proposal's order
    fr.forEach((f, i) => {
      if (out.some(r => r.id === f.id)) return;
      let at = out.length; for (let j = i - 1; j >= 0; j--) { const k = out.findIndex(r => r.id === fr[j].id); if (k >= 0) { at = k + 1; break; } }
      out.splice(at, 0, f); updated++;
    });
    return { rows: out, updated };
  }
  function syncPlan(S, D) {
    const Q = ensure(S, D), rows = rowsFor(S, D, Q, Q.type, true), fr = fresh(S, D, Q, Q.type), m = mergeRows(rows, fr, 'keep');
    const headEdits = Object.keys(Q.head || {}).filter(k => Q.head[k] !== undefined);
    return { updated: m.updated, edited: rows.filter(r => r.src && hasEd(r)), gone: m.rows.filter(r => r.gone), added: fr.filter(f => !rows.some(r => r.id === f.id)), manual: rows.filter(r => !r.src).length, headEdits, stale: Q.sig[Q.type] !== sig(S, D, Q.type) };
  }
  function applySync(S, D, mode) {
    const Q = ensure(S, D), rows = rowsFor(S, D, Q, Q.type, true), m = mergeRows(rows, fresh(S, D, Q, Q.type), mode === 'replace' ? 'replace' : 'keep');
    Q.items[Q.type] = m.rows; Q.sig[Q.type] = sig(S, D, Q.type);
    if (mode === 'replace') Q.head = {};
    return m.updated;
  }
  function setMarkup(S, D, v) {   // re-price the supplier items whose price you have not set by hand
    const Q = ensure(S, D); Q.markup = Math.max(0, num(v));
    Object.keys(Q.items || {}).forEach(t => Q.items[t].forEach(r => { if (r.cost && !(r.ed && r.ed.price)) r.pct = Q.markup; }));
  }
  function setPrice(r, v) { if (r.cost) C.setLinePrice(r, v); else { r.base = num(v); r.pct = 0; } r.ed = r.ed || {}; r.ed.price = 1; r.est = false; }

  /* ---------- the A4 document (also the editable page) ---------- */
  function termText(S, Q, t, R) {
    const T = R.totals, rent = T.rent, s = sym(Q);
    if (t.id === 'validity' && t.v == null) { const n = num(Q.validityDays, 30), u = addDays(Q.date, n); return `${n} days from the quotation date${u ? ' (valid until ' + longDate(u) + ')' : ''}`; }
    if (t.id === 'payment' && t.v == null) return rent
      ? `50% initial payment (one-time setup + 1st month rental) upon PO confirmation: ${s} ${money(T.deposit)}. 50% balance upon installation and commissioning completion: ${s} ${money(T.balance)}.`
      : `40% upon receipt of PO: ${s} ${money(T.pay[0])}. 40% upon stock arrival: ${s} ${money(T.pay[1])}. 20% upon project completion: ${s} ${money(T.pay[2])}.`;
    return t.v == null ? '' : String(t.v);
  }
  function totalsHtml(S, Q, R) {
    const T = R.totals, s = sym(Q), tx = num(Q.taxPct), lab = `${esc(Q.taxLabel || 'Tax')} ${tx}%`;
    const block = (title, x, grandLabel) => `<table class="q-tot">${title ? `<caption>${title}</caption>` : ''}<tr><td>Subtotal</td><td>${money(x.subtotal)}</td></tr>${x.discount > 0 ? `<tr><td>Discount</td><td>- ${money(x.discount)}</td></tr>` : ''}${tx ? `<tr><td>${lab}</td><td>${money(x.tax)}</td></tr>` : ''}<tr class="b"><td>${grandLabel} (${esc(s)})</td><td>${money(x.grand)}</td></tr></table>`;
    return T.rent ? block('One-time setup', T.setup, 'Total one-time setup') + block('Monthly rental', T.month, 'Rental per month') : block('', T.sum, 'Total');
  }
  function docHtml(S, D, opt) {
    const E = !!(opt && opt.edit), R = (opt && opt.R) || compute(S, D), Q = R.Q, T = R.totals, rent = T.rent, co = DB.company, M = (D && D.model) || {}, qty = Math.max(1, (D && D.qty) || 1), s = sym(Q);
    const hv = k => headVal(S, Q, k);
    // a text field: in the editor you type on the page itself, in the PDF it is plain text
    const ed = (path, val, ph, o) => { o = o || {}; return E ? `<span class="ed${o.ml ? ' ml' : ''}${o.cls ? ' ' + o.cls : ''}" contenteditable="${CE}" spellcheck="false" role="textbox" data-f="${esc(path)}" data-ph="${esc(ph || '')}" aria-label="${esc(o.label || ph || path)}"${o.ml ? ' aria-multiline="true"' : ''}>${esc(val)}</span>`
      : (String(val || '').trim() ? `<span${o.ml ? ' class="ml"' : ''}>${esc(val)}</span>` : (o.print || '')); };
    const showRows = R.lines.filter(l => E || l.on || l.optional), showDisc = E || R.lines.some(l => l.on && l.disc > 0);
    let n = 0;
    const rows = showRows.map(l => {
      const vis = l.on || l.optional, no = vis ? ++n : '–', off = !l.on, bad = l.on && !(l.unit > 0);
      const amt = l.on ? (l.unit > 0 ? money(l.net) : '') : '<span class="q-muted">not included</span>';
      if (!E) return `<tr class="q-row${off ? ' q-off' : ''}"><td class="n">${no}</td><td class="d"><b>${esc(l.name)}</b>${l.sub ? `<span class="q-sub">${esc(l.sub)}</span>` : ''}${l.optional ? '<em class="q-opt">Optional</em>' : ''}${l.specList.length ? `<ul>${l.specList.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</td>
        <td class="c">${esc(fmtQty(l.qty))}</td><td class="c">${esc(l.uom)}</td><td class="r">${l.unit > 0 ? money(l.unit) : '<span class="q-tbc">to confirm</span>'}</td>${showDisc ? `<td class="r">${l.disc > 0 ? esc(String(+l.disc.toFixed(2))) + '%' : ''}</td>` : ''}<td class="r">${amt}</td></tr>`;
      const rk = (k, v, ph, cls, lab) => `<input class="cell ${cls || ''}" inputmode="decimal" autocomplete="off" data-rk="${k}" value="${esc(v)}" placeholder="${ph || ''}" aria-label="${lab}">`;
      return `<tr class="q-row${off ? ' q-off' : ''}" data-row="${esc(l.id)}">
        <td class="n"><span class="rn">${no}</span><label class="sw sm" title="Include this item in the quotation"><input type="checkbox" data-rk="on" ${l.on ? 'checked' : ''} aria-label="Include ${esc(l.name)}"><i></i></label></td>
        <td class="d">${ed('row.name', l.name, 'Item name', { cls: 'q-nm', label: 'Item name' })}${l.optional ? '<em class="q-opt">Optional</em>' : ''}${l.est ? '<em class="q-opt">Estimated</em>' : ''}<br>${ed('row.sub', l.sub, 'Description (for example the model)', { cls: 'q-sb', label: 'Description' })}<div class="q-sp">${ed('row.specs', l.specs, 'Specifications, one per line', { ml: 1, label: 'Specifications' })}</div>
          ${Q.internal && l.cost ? `<div class="q-int"><label>Cost<span class="inpx">${rk('cost', l.base ? money(l.base) : '', '0.00', 'num', 'Cost price')}</span></label><label>Markup<span class="inpx">${rk('pct', l.pct ? +l.pct.toFixed(2) : '', '0', 'num', 'Markup percent')}<i>%</i></span></label><small>only you see this</small></div>` : ''}</td>
        <td class="c" data-l="Qty">${rk('qty', fmtQty(l.qty), '0', 'num', 'Quantity')}</td>
        <td class="c" data-l="Unit">${ed('row.uom', l.uom, 'unit', { label: 'Unit' })}</td>
        <td class="r" data-l="Unit price">${rk('price', l.unit > 0 ? money(l.unit) : '', '0.00', 'num' + (bad ? ' bad' : ''), 'Unit price')}</td>
        <td class="r" data-l="Disc. %">${rk('disc', l.disc > 0 ? +l.disc.toFixed(2) : '', '0', 'num', 'Discount percent')}</td>
        <td class="r q-am" data-l="Amount"><b data-amt>${amt}</b></td>
        <td class="act"><details class="rmenu"><summary aria-label="Row actions" title="Row actions"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></summary>
          <div class="rmenu-b"><button type="button" data-act="up">Move up</button><button type="button" data-act="down">Move down</button><button type="button" data-act="dup">Duplicate</button><button type="button" data-act="tax">${l.taxable ? 'Do not charge tax' : 'Charge tax'}</button>${rent ? `<button type="button" data-act="monthly">${l.monthly ? 'Charge once (one-time)' : 'Charge every month'}</button>` : ''}<button type="button" data-act="del" class="dg">Remove</button></div></details></td></tr>`;
    }).join('');
    const catalog = E ? `<details class="addmenu"><summary class="btn quiet">+ Add an item</summary><div class="addmenu-b">${catalogItems(S, D, Q).map((c, i) => `<button type="button" data-act="add" data-cat="${i}"><b>${esc(c.name)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}<em>${c.base > 0 ? s + ' ' + money(c.cost ? c.base * (1 + num(Q.markup) / 100) : c.base) : 'price to confirm'}</em></button>`).join('')}</div></details>` : '';
    const nm = hv('toName'), sumBox = rent ? `<div class="q-sum"><h3>Summary</h3><div class="q-stats"><div><small>One-time setup</small><b>${esc(s)} ${money(T.setup.grand)}</b></div><div><small>Monthly rental</small><b>${esc(s)} ${money(T.month.grand)}</b></div><div class="hi"><small>Initial payment (setup + 1st month)</small><b>${esc(s)} ${money(T.upfront)}</b></div></div>
      ${T.optB ? `<p class="q-optb"><b>Option B, lower setup:</b> setup ${esc(s)} ${money(T.optB.setup)}; rental ${esc(s)} ${money(T.optB.y1)} a month for the first ${T.optB.months} months, then ${esc(s)} ${money(T.optB.monthly)} a month. Initial payment ${esc(s)} ${money(T.optB.upfront)}.</p>` : ''}</div>` : '';
    // the terms
    const termRows = Q.terms.filter(t => E || t.on).map(t => {
      const txt = termText(S, Q, t, R), isAuto = t.v == null;
      if (!E) { const shown = t.id === 'period' && !String(txt).trim() ? 'To be confirmed' : txt; return shown.trim() ? `<dt>${esc(t.k)}</dt><dd><span class="ml">${esc(shown)}</span></dd>` : ''; }
      return `<div class="q-trm${t.on ? '' : ' off'}" data-term="${esc(t.id)}"><label class="sw sm" title="Show this term on the quotation"><input type="checkbox" data-tk="on" ${t.on ? 'checked' : ''} aria-label="Show ${esc(t.k)}"><i></i></label>
        <div class="tk">${ed('term.k', t.k, 'Term', { label: 'Term name' })}</div><div class="tv">${ed('term.v', txt, 'Type the term', { ml: 1, label: t.k })}${isAuto && (t.id === 'payment' || t.id === 'validity') ? '<small class="auto">worked out from the totals</small>' : ''}${!isAuto && (t.id === 'payment' || t.id === 'validity') ? '<button type="button" class="lnk" data-act="termauto">Back to automatic</button>' : ''}</div>
        <button type="button" class="x" data-act="termdel" title="Remove this term" aria-label="Remove ${esc(t.k)}">×</button></div>`;
    }).join('');
    const excl = Q.excl != null ? Q.excl : exclDefault(rent);
    const exclHtml = E ? `<ol class="q-exl">${excl.map((x, i) => `<li data-ex="${i}">${ed('ex', x, 'Type an exclusion', { ml: 1, label: 'Exclusion ' + (i + 1) })}<button type="button" class="x" data-act="exdel" title="Remove" aria-label="Remove exclusion ${i + 1}">×</button></li>`).join('')}</ol><button type="button" class="btn quiet sm" data-act="exadd">+ Add an exclusion</button>`
      : (excl.length ? `<ol>${excl.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '');
    const bi = Q.bankInfo || {}, bankFilled = bi.bank || bi.name || bi.no;
    const bankHtml = E ? `<section class="q-block q-bank"><h3>Bank details</h3><div class="q-bk"><div><small>Bank</small>${ed('bank.bank', bi.bank, 'Bank name', { label: 'Bank name' })}</div><div><small>Account name</small>${ed('bank.name', bi.name, 'Account name', { label: 'Account name' })}</div><div><small>Account no.</small>${ed('bank.no', bi.no, 'Account number', { label: 'Account number' })}</div></div>${Q.tbc.bank && !(bi.bank && bi.no) ? '<span class="tbc">to confirm</span>' : ''}</section>`
      : (bankFilled ? `<section class="q-block q-bank"><h3>Bank details</h3><div class="q-bk"><div><small>Bank</small><span>${esc(bi.bank)}</span></div><div><small>Account name</small><span>${esc(bi.name)}</span></div><div><small>Account no.</small><span>${esc(bi.no)}</span></div></div></section>` : '');
    const service = rent && Q.service ? `<section class="q-block q-service"><h3>AMR maintenance and service</h3><p>Service frequency: ${num(Q.perYear, 4)} times a year${num(Q.perYear, 4) === 4 ? ' (every quarter)' : ''}. Total service: ${qty} AMR${qty > 1 ? 's' : ''}.</p>
      <dl>${SERVICE.map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl></section>` : '';
    const until = addDays(Q.date, num(Q.validityDays, 30));
    const metaNo = E ? `<span class="ed" contenteditable="${CE}" spellcheck="false" role="textbox" data-f="no" data-ph="WFC-QT-${(Q.date || today()).slice(0, 4)}-0001" aria-label="Quotation number">${esc(Q.no)}</span>` : esc(quoteNo(S));
    const metaDate = E ? `<input type="date" class="cell dt" data-f="date" value="${esc(Q.date)}" aria-label="Quotation date">` : esc(longDate(Q.date));
    const metaValid = E ? `<span class="inpx"><input class="cell num" inputmode="numeric" data-f="validityDays" value="${num(Q.validityDays, 30)}" aria-label="Valid for days"><i>days</i></span><small class="q-until">until ${esc(longDate(until))}</small>` : esc(longDate(until));
    const mrow = (label, html, val) => (E || String(val || '').trim()) ? `<tr><td>${label}</td><td>${html}</td></tr>` : '';   // the PDF leaves out a line with nothing in it
    return `<div class="qdoc${E ? ' edit' : ''}">
      <header class="q-head"><div class="q-brand"><img src="${root.WFC_IMG && root.WFC_IMG.logo || ''}" alt=""><div><b>${esc(co.legal || co.name)}</b><span>${co.regNo ? 'Company No. ' + esc(co.regNo) : ''}</span><span>${esc(co.address)}</span><span>${esc(co.web)}</span></div></div>
        <div class="q-title"><h1>QUOTATION</h1><table class="q-meta"><tr><td>Quotation no.</td><td>${metaNo}</td></tr><tr><td>Revision</td><td>Rev ${num(Q.rev, 1)}</td></tr><tr><td>Date</td><td>${metaDate}</td></tr><tr><td>Valid until</td><td>${metaValid}</td></tr>
        ${mrow('Your ref.', ed('head.ref', hv('ref'), 'Customer reference', { label: 'Your reference' }), hv('ref'))}${mrow('Our contact', ed('head.contact', hv('contact'), 'Contact person', { label: 'Our contact person' }), hv('contact'))}${mrow('Phone', ed('head.phone', hv('phone'), 'Phone', { label: 'Phone' }), hv('phone'))}${mrow('Email', ed('head.email', hv('email'), 'Email', { label: 'Email' }), hv('email'))}</table></div></header>
      <section class="q-to"><div><small>Quoted to</small><b>${ed('head.toName', nm, 'Customer name', { label: 'Customer name', print: 'Customer name' })}</b>${E || hv('toAddress') ? `<p>${ed('head.toAddress', hv('toAddress'), 'Customer address', { ml: 1, label: 'Customer address' })}</p>` : ''}${E || hv('attn') ? `<p>${E ? 'Attn: ' : 'Attn: '}${ed('head.attn', hv('attn'), 'Contact person', { label: 'Attention' })}</p>` : ''}</div>
        <div><small>Project</small><b>${ed('head.project', hv('project'), 'Project name', { label: 'Project name' })}</b><p>${esc(M.name || '')}${qty ? `, ${qty} unit${qty > 1 ? 's' : ''}` : ''}</p></div></section>
      <p class="q-intro">${hv('attn') ? `Dear ${esc(hv('attn'))},` : 'Dear Sir or Madam,'}<br>Thank you for your enquiry. We are pleased to quote as follows.</p>
      <table class="q-table${E ? ' edit' : ''}"><thead><tr><th>No.</th><th>Description</th><th>Qty</th><th>UOM</th><th>Unit price (${esc(s)})</th>${showDisc ? '<th class="nw">Disc.</th>' : ''}<th>Amount (${esc(s)})</th>${E ? '<th class="act"></th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
      ${E ? `<div class="q-add">${catalog}</div>` : ''}
      <div class="q-totals"${E ? ' id="qTots"' : ''}>${totalsHtml(S, Q, R)}</div>${sumBox}
      <section class="q-block"><h3>Terms</h3>${E ? `<div class="q-terms-e">${termRows}</div><button type="button" class="btn quiet sm" data-act="termadd">+ Add a term</button>` : `<dl class="q-terms">${termRows}</dl>`}</section>
      ${E || excl.length ? `<section class="q-block"><h3>Exclusions</h3>${exclHtml}</section>` : ''}
      ${bankHtml}
      <div class="q-end">${service}
      ${E || Q.notes ? `<section class="q-block"><h3>Notes</h3><p>${ed('notes', Q.notes, 'Anything else you want on the quotation (optional)', { ml: 1, label: 'Notes' })}</p></section>` : ''}
      <section class="q-sign${Q.accept ? ' two' : ''}"><div><p>Best regards,<br><b>${esc(co.legal || co.name)}</b></p><div class="q-line"></div><p>${esc(hv('contact'))}<br><small>Authorised signature</small></p></div>
        ${Q.accept ? `<div><p>${esc(T_.accept)}<br><b>${esc(nm || 'The customer')}</b></p><div class="q-line"></div><p><small>Name, date, chop and signature</small></p></div>` : ''}</section></div>
    </div>`;
  }
  // Quotation_WFC-QT-2026-0001_Customer-Name.pdf (the legal ending is left out; a revision adds _Rev2)
  const LEGAL = ['sdn', 'bhd', 'berhad', 'ltd', 'limited', 'pte', 'inc', 'corp', 'llc', 'plc', 'co'];
  function fileName(S) {
    const Q = ensure(S), no = assignNo(S);
    const words = String(headVal(S, Q, 'toName') || '').replace(/[.,]/g, '').replace(/[\/:*?"<>|()\[\]{}&'#%]+/g, ' ').split(/\s+/).filter(w => w && !LEGAL.includes(w.toLowerCase())), keep = [];
    for (const w of words) { if (keep.length && (keep.join('-') + '-' + w).length > 40) break; keep.push(w); }   // whole words, about 40 characters at most
    const name = keep.join('-').slice(0, 60);
    return `Quotation_${no}${num(Q.rev, 1) > 1 ? '_Rev' + num(Q.rev, 1) : ''}_${name || 'Customer'}`;
  }
  // the PDF's footer carries the quotation number and revision on every page, with "Page x of y" on the right (app.css)
  function printHtml(S, D) {
    assignNo(S); const Q = ensure(S), foot = `${quoteNo(S)}  ·  Rev ${num(Q.rev, 1)}  ·  ${DB.company.legal || DB.company.name}`.replace(/["\\\r\n]/g, '');
    return `<style>@page quote { @bottom-left { content: "${foot}"; } }</style><div class="qprint">${docHtml(S, D)}</div>`;
  }
  // before the PDF: problems that would show on the page (no customer, no items, a missing price or quantity) are listed first
  function beforeGenerate(S, D) {
    const R = compute(S, D), block = R.checkInfo.filter(c => ['name', 'items', 'qty', 'price'].includes(c.key));
    if (!block.length) return Promise.resolve(true);
    return new Promise(res => {
      const dlg = document.createElement('dialog'); dlg.className = 'qdlg';
      dlg.innerHTML = `<h3>Before you generate</h3><p class="warn"><b>These would show on the quotation:</b></p><ul>${block.map(c => `<li>${esc(c.msg)}</li>`).join('')}</ul>
        <div class="qdlg-b"><button type="button" class="btn" data-m="fix">Go back and fix</button><button type="button" class="btn quiet" data-m="go">Generate anyway</button></div>`;
      (document.querySelector('#quote') || document.body).appendChild(dlg);
      const done = v => { try { dlg.close(); } catch (e) { /* already closed */ } dlg.remove(); res(v); };
      dlg.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (b) done(b.dataset.m === 'go'); });
      dlg.addEventListener('cancel', ev => { ev.preventDefault(); done(false); });
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  }
  // what you can add: blank, the AMR models, and the standard items (a blank price is shown as to confirm, never invented)
  function catalogItems(S, D, Q) {
    const st = (DB.quote || {}).setup || {}, L = [{ name: 'New item', sub: '', specs: '', uom: 'unit', base: 0 }];
    (DB.models || []).forEach(m => L.push({ name: 'AMR hardware', sub: m.name, specs: SPEC.amr.join('\n'), uom: 'unit', base: m.unitPrice, cost: true }));
    L.push({ name: 'Robot Control System (RCS)', specs: SPEC.rcs.join('\n'), uom: 'LOT', base: num(st.rcs) }, { name: 'Installation and commissioning', specs: SPEC.install.join('\n'), uom: 'LOT', base: num(st.install), taxable: false },
      { name: 'Automatic shuttle door integration and interlocking', specs: SPEC.door.join('\n'), uom: 'door', base: num(st.door) }, { name: 'Wireless call box and station push-button system', specs: SPEC.callbox.join('\n'), uom: 'LOT', base: num(st.callbox) },
      { name: 'WiFi infrastructure setup', specs: SPEC.wifi.join('\n'), uom: 'LOT', base: num(st.wifi), optional: true }, { name: 'Server and monitoring station', specs: SPEC.server.join('\n'), uom: 'LOT', base: num(st.server), optional: true },
      { name: 'Charging station', specs: '', uom: 'unit', base: 0 }, { name: 'Operator training', specs: '', uom: 'LOT', base: 0 }, { name: 'Maintenance and service contract', specs: '', uom: 'year', base: 0 }, { name: 'Spare battery', specs: '', uom: 'unit', base: 0 });
    return L;
  }

  /* ---------- the editor ----------
     The A4 page itself is the editor (like Zoho, Xero and QuickBooks): click any text or number on it and type. On the side: what to check, the estimate, and the settings. On a phone the
     table becomes one card per item, and the tab bar switches between Quotation, Settings and PDF preview. */
  let S0, D0, selfEdit = false, bound = false, hist = [], redo = [], lastKey = '', lastT = 0, lastS = null;
  const openSecs = { setup: true, price: false, more: false };
  const ICON = {
    setup: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
    price: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
    more: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'
  };
  const svg = p => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const seg = (key, val, opts) => `<div class="seg" role="group" data-q="${key}">${opts.map(o => `<button type="button" class="tab${String(val) === String(o[0]) ? ' active' : ''}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
  const fld = (label, html, cls, tag) => `<${tag || 'label'} class="qf${cls ? ' ' + cls : ''}"><span>${label}</span>${html}</${tag || 'label'}>`;
  const tog = (path, on, label, hint) => `<label class="qtog"><span class="sw"><input type="checkbox" data-qf="${path}" ${on ? 'checked' : ''}><i></i></span><span>${label}${hint ? ` <small>${hint}</small>` : ''}</span></label>`;
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

  function estHtml() {
    const E = estimate(S0, D0), Q = ensure(S0, D0), tx = num(Q.taxPct), s = sym(Q), row = (k, a, b) => `<button type="button" class="qe-row${Q.type === k ? ' on' : ''}" data-est="${k}"><span>${a}</span><b>${b}</b></button>`;
    return `<small>Estimated quotation <em>from your proposal</em></small>${row('buy', 'To buy', s + ' ' + money(E.buy.sum.grand))}${row('rent', 'To rent', s + ' ' + money(E.rent.setup.grand) + ' setup + ' + s + ' ' + money(E.rent.month.grand) + ' a month')}
      <p>${esc(E.basis)}. Prices from the AMR selector tool${tx ? `, with ${tx}% tax on everything except installation` : ''}.</p>${E.buy.hasCost ? `<p class="qe-cost${E.buy.sell > E.buy.cost + 0.005 ? '' : ' warn'}">${E.buy.sell > E.buy.cost + 0.005 ? `AMR and RCS: cost ${s} ${money(E.buy.cost)}, sold at ${s} ${money(E.buy.sell)}, a margin of ${E.buy.marginPct.toFixed(1)}% (only you see this).` : 'The AMR and RCS are at cost price: set a markup under Pricing.'}</p>` : ''}`;
  }
  function barHtml(R) {
    const T = R.totals, s = sym(R.Q), st = (l, v, cls) => `<div class="qb-s${cls ? ' ' + cls : ''}"><small>${l}</small><b>${v}</b></div>`, tx = num(R.Q.taxPct);
    return T.rent ? st('One-time setup', s + ' ' + money(T.setup.grand)) + st('Monthly rental', s + ' ' + money(T.month.grand)) + st('Initial payment', s + ' ' + money(T.upfront), 'hi')
      : st('Subtotal', s + ' ' + money(T.sum.subtotal)) + (T.sum.discount > 0 ? st('Discount', '- ' + s + ' ' + money(T.sum.discount)) : '') + (tx ? st(`${esc(R.Q.taxLabel || 'Tax')} ${tx}%`, s + ' ' + money(T.sum.tax)) : '') + st('Total', s + ' ' + money(T.sum.grand), 'hi');
  }
  function checkHtml(R) {
    const n = R.checkInfo.length;
    return n ? `<details class="qcheck"><summary><b>${n} thing${n > 1 ? 's' : ''} to check</b> before you send it</summary><ul>${R.checkInfo.map(c => `<li>${esc(c.msg)}${c.confirm && R.Q.tbc[c.key] ? ` <button type="button" class="lnk" data-ok="${c.key}">It is right</button>` : ''}</li>`).join('')}</ul></details>`
      : '<div class="qcheck ok"><b>All set.</b> Everything needed is filled in.</div>';
  }
  function staleHtml() {
    let p; try { p = syncPlan(S0, D0); } catch (e) { return ''; }
    return p.stale ? `<div class="qstale"><b>The proposal has changed</b> since these items were made (AMR, stations, doors or charging).<button type="button" class="btn sm" data-sync>Sync from proposal</button></div>` : '';
  }
  const sec = (id, title, sum, body) => `<details class="qsec" data-sec="${id}"${openSecs[id] ? ' open' : ''}><summary><span class="qs-ico">${svg(ICON[id])}</span><span class="qs-t">${title}</span><span class="qs-s" data-sum="${id}">${esc(sum)}</span>
    <svg class="qs-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="qs-b">${body}</div></details>`;
  function summaries(R) {
    const Q = R.Q, rent = Q.type === 'rent';
    return { setup: `${rent ? 'Rent, ' + Q.termYears + ' years' : 'Buy'} · ${Q.currency}`, price: (num(Q.markup) ? `Markup ${num(Q.markup)}%` : 'No markup') + (num(Q.disc.v) ? ' · discount' : ''), more: rent ? (Q.service ? `${num(Q.perYear, 4)} visits a year` : 'No service page') : 'Acceptance block' };
  }
  function railHtml(R) {
    const Q = R.Q, rent = Q.type === 'rent', sm = summaries(R), s = sym(Q);
    const setup = fld('Quotation type', seg('type', Q.type, [['rent', 'Rent'], ['buy', 'Buy']]), '', 'div')
      + (rent ? fld('Contract term', seg('termYears', Q.termYears, [[3, '3 years'], [5, '5 years']]), '', 'div') : '')
      + fld('Currency', `<select data-qf="currency">${Object.keys(CURS).map(c => `<option value="${c}"${Q.currency === c ? ' selected' : ''}>${c}</option>`).join('')}</select>`, 'qf-s')
      + (Q.currency !== 'MYR' ? '<p class="qnote">Prices are typed in this currency. Nothing is converted, and the standard RM amounts in the price list are not changed.</p>' : '')
      + `<div class="qgrid">${fld('Tax name', `<input data-qf="taxLabel" value="${esc(Q.taxLabel)}">`)}${fld('Tax rate', `<div class="inp"><input inputmode="decimal" data-qf="taxPct" value="${num(Q.taxPct)}"><i class="r">%</i></div>`)}</div>`
      + `<p class="qnote">${Q.tbc.tax ? '<span class="tbc">to confirm</span> ' : ''}The rate used in the selector tool, on every item except installation. Confirm it with accounts, then set 0 if tax is not charged.</p>`;
    const price = fld('Markup on the AMR and RCS', `<div class="inp"><input inputmode="decimal" data-qf="markup" value="${num(Q.markup) || ''}" placeholder="0"><i class="r">%</i></div>`, 'qf-s')
      + '<p class="qnote">The selector tool prices for the AMR and the RCS are your cost: this is added on top (only you see it). Other items are selling prices; set any price on the page.</p>'
      + '<button type="button" class="btn quiet qsave" data-save-markup>Use this markup for new quotations</button>'
      + fld('Extra discount on the whole quotation', `${seg('disc.mode', Q.disc.mode, [['pct', '%'], ['amt', s]])}<div class="inp"><input inputmode="decimal" data-qf="disc.v" value="${num(Q.disc.v) || ''}" placeholder="0"><i class="r">${Q.disc.mode === 'pct' ? '%' : esc(s)}</i></div>`, '', 'div')
      + '<p class="qnote">Per-item discounts are in the table. For a rental, this one is taken off the one-time setup.</p>'
      + tog('internal', Q.internal, 'Show cost and markup on the page', 'only you see these; they are never printed');
    const more = (rent ? tog('service', Q.service, 'Add the maintenance and service page') + (Q.service ? fld('Service visits a year', `<input inputmode="numeric" data-qf="perYear" value="${num(Q.perYear, 4)}">`, 'qf-s') : '')
        + tog('optB.on', Q.optB.on, 'Offer a lower setup fee (option B)', 'the saving is paid back through a higher rental for a while')
        + (Q.optB.on ? `<div class="qgrid">${fld('Reduce setup by', `<div class="inp"><i>${esc(s)}</i><input inputmode="decimal" data-qf="optB.reduction" value="${num(Q.optB.reduction) || ''}"></div>`)}${fld('Paid back over', `<div class="inp"><input inputmode="numeric" data-qf="optB.months" value="${num(Q.optB.months, 12)}"><i class="r">months</i></div>`)}</div>` : '') : '')
      + tog('accept', Q.accept, 'Customer acceptance block', 'chop and signature line for the customer')
      + '<button type="button" class="btn quiet qsave" data-save-bank>Use these bank details for new quotations</button>';
    return `${staleHtml()}<div id="qEst" class="qest">${estHtml()}</div><div id="qCheck">${checkHtml(R)}</div>${sec('setup', 'Quotation setup', sm.setup, setup)}${sec('price', 'Pricing', sm.price, price)}${sec('more', 'More', sm.more, more)}
      <p class="qhint">The proposal PDF never shows a price. <b>Download PDF</b> saves this quotation as its own PDF.</p>`;
  }

  /* ---------- drawing ---------- */
  function paintNumbers(R) {
    const paper = $('#qPaper'); if (!paper) return;
    R.lines.forEach(l => {
      const row = paper.querySelector(`[data-row="${CSS.escape(l.id)}"]`); if (!row) return;
      row.classList.toggle('q-off', !l.on);
      const a = row.querySelector('[data-amt]'); if (a) a.innerHTML = l.on ? (l.unit > 0 ? money(l.net) : '') : '<span class="q-muted">not included</span>';
      const set = (k, v, bad) => { const i = row.querySelector(`[data-rk="${k}"]`); if (i && i !== document.activeElement) i.value = v; if (i && bad != null) i.classList.toggle('bad', bad); };
      set('price', l.unit > 0 ? money(l.unit) : '', l.on && !(l.unit > 0)); set('cost', l.base ? money(l.base) : ''); set('pct', l.pct ? +l.pct.toFixed(2) : ''); set('disc', l.disc > 0 ? +l.disc.toFixed(2) : '');
    });
    const t = $('#qTots'); if (t) t.innerHTML = totalsHtml(S0, R.Q, R);
    const u = $('.q-until'); if (u) u.textContent = 'until ' + longDate(addDays(R.Q.date, num(R.Q.validityDays, 30)));
    $$('[data-term="payment"] .tv .ed, [data-term="validity"] .tv .ed', paper).forEach(el => { if (el === document.activeElement) return; const t2 = R.Q.terms.find(x => x.id === el.closest('[data-term]').dataset.term); if (t2 && t2.v == null) el.textContent = termText(S0, R.Q, t2, R); });
  }
  function refresh(full) {
    const paper = $('#qPaper'), rail = $('#qRail'), sheet = $('#qSheet'); if (!paper || !rail) return;
    const R = compute(S0, D0), Q = R.Q;
    if (full) {
      const sy = $('#qMain') && $('#qMain').scrollTop, ry = rail.scrollTop;
      paper.innerHTML = docHtml(S0, D0, { edit: true, R }); rail.innerHTML = railHtml(R);
      if ($('#qMain') && sy) $('#qMain').scrollTop = sy; rail.scrollTop = ry;
    } else {
      paintNumbers(R);
      const c = $('#qCheck'); if (c) { const open = c.querySelector('details') && c.querySelector('details').open; c.innerHTML = checkHtml(R); if (open) { const d = c.querySelector('details'); if (d) d.open = true; } }
      const sm = summaries(R); Object.keys(sm).forEach(k => { const e = rail.querySelector(`[data-sum="${k}"]`); if (e) e.textContent = sm[k]; });
      const es = $('#qEst'); if (es) es.innerHTML = estHtml();
    }
    const bar = $('#qTotal'); if (bar) bar.innerHTML = barHtml(R);
    const st = $('#qStatus'); if (st) { st.className = 'qchip' + (R.checks.length ? '' : ' ok'); st.textContent = R.checks.length ? `${R.checks.length} to check` : 'Ready'; }
    const no = $('#qNo'); if (no) no.textContent = (Q.no || quoteNo(S0)) + ' · Rev ' + num(Q.rev, 1);
    const ss = $('#qStat'); if (ss && ss.value !== Q.status) ss.value = Q.status;
    const u = $('#qUndo'), r = $('#qRedo'); if (u) u.disabled = !hist.length; if (r) r.disabled = !redo.length;
    if ($('#quote').dataset.qm === 'preview' && sheet) { sheet.innerHTML = docHtml(S0, D0); fit(); }
  }
  function fit() {
    const box = $('#qPrev'), sheet = $('#qSheet'); if (!box || !sheet || !box.clientWidth) return;
    const w = box.clientWidth - (box.clientWidth < 600 ? 16 : 40); if (w > 100) sheet.style.setProperty('--qs', Math.min(1.25, w / 794).toFixed(3));
  }
  function toast(msg) { let t = $('#qToast'); if (!t) { t = document.createElement('div'); t.id = 'qToast'; t.setAttribute('role', 'status'); $('#quote').appendChild(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200); }

  /* ---------- editing ---------- */
  function persist() { selfEdit = true; if (root.WFCApp && root.WFCApp.changed) root.WFCApp.changed(); }
  function snap(key) {   // one undo step per burst of typing in the same box
    const now = Date.now(); if (key === lastKey && now - lastT < 1200) { lastT = now; return; }
    hist.push(JSON.stringify(S0.quote)); if (hist.length > 80) hist.shift(); redo = []; lastKey = key; lastT = now;
  }
  function restore(from, to) { if (!from.length) return; to.push(JSON.stringify(S0.quote)); S0.quote = JSON.parse(from.pop()); lastKey = ''; persist(); refresh(true); }
  function mutate(key, fn, then) { const Q = ensure(S0, D0); snap(key + Math.random()); fn(Q); persist(); refresh(true); if (then) then(); }
  const rowOf = el => { const tr = el.closest('[data-row]'); if (!tr) return null; const Q = ensure(S0, D0); return { Q, rows: Q.items[Q.type], r: Q.items[Q.type].find(x => x.id === tr.dataset.row), tr }; };
  const clearTbc = (Q, k) => { if (Q.tbc && Q.tbc[k]) Q.tbc[k] = 0; };
  const textOf = el => { const t = el.innerText != null ? el.innerText : el.textContent; return String(t).replace(/\r/g, '').replace(/\n+$/, ''); };

  function onInput(e) {
    const el = e.target, Q = ensure(S0, D0);
    if (el.classList && el.classList.contains('ed') && !String(textOf(el)).trim()) el.textContent = '';
    if (el.dataset.rk) {   // one item
      const ctx = rowOf(el); if (!ctx || !ctx.r) return; const k = el.dataset.rk, r = ctx.r; r.ed = r.ed || {};
      if (k === 'on') return;
      if (['qty', 'price', 'disc', 'cost', 'pct'].includes(k)) {
        const v = parseNum(el.value); el.classList.toggle('bad', Number.isNaN(v)); if (Number.isNaN(v)) return;
        snap('r:' + r.id + k);
        if (k === 'qty') { r.qty = Math.max(0, v || 0); r.ed.qty = 1; }
        else if (k === 'price') setPrice(r, v || 0);
        else if (k === 'disc') { r.disc = Math.min(100, Math.max(0, v || 0)); r.ed.disc = 1; if ((v || 0) > 100) el.classList.add('bad'); }
        else if (k === 'cost') { r.base = Math.max(0, v || 0); r.ed.price = 1; }
        else if (k === 'pct') { r.pct = v || 0; r.ed.price = 1; }
      } else { snap('r:' + r.id + k); const key = k.replace('row.', ''); r[key] = textOf(el); r.ed[key] = 1; }
      persist(); refresh(false); return;
    }
    const f = el.dataset.f; if (!f) return;
    snap('f:' + f);
    if (f.startsWith('head.')) { Q.head = Q.head || {}; Q.head[f.slice(5)] = textOf(el); }
    else if (f.startsWith('row.')) {
      const ctx = rowOf(el); if (!ctx || !ctx.r) return; const key = f.slice(4); ctx.r[key] = textOf(el); ctx.r.ed = ctx.r.ed || {}; ctx.r.ed[key] = 1;
    } else if (f === 'term.k' || f === 'term.v') { const t = Q.terms.find(x => x.id === el.closest('[data-term]').dataset.term); if (t) { if (f === 'term.k') t.k = textOf(el); else { t.v = textOf(el); clearTbc(Q, t.id); } } }
    else if (f === 'ex') { Q.excl = Q.excl || exclDefault(Q.type === 'rent'); Q.excl[+el.closest('[data-ex]').dataset.ex] = textOf(el); }
    else if (f.startsWith('bank.')) { Q.bankInfo[f.slice(5)] = textOf(el); }
    else if (f === 'no') Q.no = textOf(el).trim();
    else if (f === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return; Q.date = el.value; }
    else if (f === 'validityDays') { const v = parseNum(el.value); el.classList.toggle('bad', Number.isNaN(v) || v < 1); if (Number.isNaN(v) || v == null || v < 1) return; Q.validityDays = Math.round(v); }
    else if (f === 'notes') Q.notes = textOf(el);
    persist(); refresh(false);
  }
  function onChange(e) {
    const el = e.target;
    if (el.dataset.rk === 'on') { const ctx = rowOf(el); if (!ctx || !ctx.r) return; snap('on' + ctx.r.id + Math.random()); ctx.r.on = el.checked; persist(); refresh(true); return; }
    if (el.dataset.tk === 'on') { const Q = ensure(S0, D0), t = Q.terms.find(x => x.id === el.closest('[data-term]').dataset.term); if (t) { snap('t' + Math.random()); t.on = el.checked; persist(); refresh(true); } return; }
    if (el.dataset.f === 'date') onInput(e);
  }
  function onBlur(e) {   // tidy the number you typed
    const el = e.target; if (!el.dataset || !el.dataset.rk || el.dataset.rk === 'on') return; const ctx = rowOf(el); if (!ctx || !ctx.r) return;
    const l = calcRow(ctx.r), k = el.dataset.rk; el.classList.remove('bad');
    if (k === 'qty') el.value = fmtQty(l.qty); else if (k === 'price') el.value = l.unit > 0 ? money(l.unit) : ''; else if (k === 'cost') el.value = l.base ? money(l.base) : ''; else if (k === 'disc') el.value = l.disc > 0 ? +l.disc.toFixed(2) : ''; else if (k === 'pct') el.value = l.pct ? +l.pct.toFixed(2) : '';
  }
  function onKey(e) {
    const el = e.target;
    if (el.classList && el.classList.contains('ed') && !el.classList.contains('ml') && e.key === 'Enter') { e.preventDefault(); el.blur(); }
    else if (el.tagName === 'INPUT' && e.key === 'Enter') { e.preventDefault(); el.blur(); }
  }
  function onPaste(e) { const el = e.target; if (!(el.classList && el.classList.contains('ed'))) return; e.preventDefault(); let t = (e.clipboardData || window.clipboardData).getData('text'); if (!el.classList.contains('ml')) t = t.replace(/\s*\n\s*/g, ' '); document.execCommand('insertText', false, t); }
  function onPaperClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, Q = ensure(S0, D0);
    const menu = b.closest('details'); if (menu) menu.open = false;
    if (act === 'add') {
      const c = catalogItems(S0, D0, Q)[+b.dataset.cat]; if (!c) return;
      const id = uid();
      mutate('add', q => { q.items[q.type].push({ id, src: false, name: c.name, sub: c.sub || '', specs: c.specs || '', qty: 1, uom: c.uom || 'unit', base: c.base || 0, pct: c.cost ? num(q.markup) : 0, disc: 0, taxable: c.taxable !== false, optional: !!c.optional, monthly: false, on: !c.optional, cost: !!c.cost, est: false, ed: {} }); },
        () => { const el = $(`#qPaper [data-row="${CSS.escape(id)}"] .q-nm`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); } });
      const am = $('#qPaper .addmenu'); if (am) am.open = false; return;
    }
    if (act === 'exadd') { mutate('exadd', q => { q.excl = (q.excl || exclDefault(q.type === 'rent')).concat(['']); }, () => { const l = $$('#qPaper .q-exl li .ed'); if (l.length) l[l.length - 1].focus(); }); return; }
    if (act === 'exdel') { const i = +b.closest('[data-ex]').dataset.ex; mutate('exdel', q => { q.excl = (q.excl || exclDefault(q.type === 'rent')).filter((x, j) => j !== i); }); return; }
    if (act === 'termadd') { const id = uid(); mutate('tadd', q => { q.terms.push({ id, k: 'New term', v: '', on: true }); }, () => { const el = $(`#qPaper [data-term="${CSS.escape(id)}"] .tv .ed`); if (el) el.focus(); }); return; }
    if (act === 'termdel') { const id = b.closest('[data-term]').dataset.term; mutate('tdel', q => { q.terms = q.terms.filter(t => t.id !== id); }); return; }
    if (act === 'termauto') { const id = b.closest('[data-term]').dataset.term; mutate('tauto', q => { const t = q.terms.find(x => x.id === id); if (t) t.v = null; }); return; }
    const tr = b.closest('[data-row]'); if (!tr) return; const rows = Q.items[Q.type], i = rows.findIndex(x => x.id === tr.dataset.row); if (i < 0) return;
    if (act === 'up' && i > 0) mutate('up', q => { const a = q.items[q.type]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; });
    else if (act === 'down' && i < rows.length - 1) mutate('down', q => { const a = q.items[q.type]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; });
    else if (act === 'dup') mutate('dup', q => { const a = q.items[q.type], c = JSON.parse(JSON.stringify(a[i])); c.id = uid(); c.src = false; c.ed = {}; a.splice(i + 1, 0, c); });
    else if (act === 'del') mutate('del', q => { q.items[q.type].splice(i, 1); }, () => toast('Item removed. Use Undo to bring it back.'));
    else if (act === 'tax') mutate('tax', q => { const r = q.items[q.type][i]; r.taxable = !r.taxable; r.ed = r.ed || {}; r.ed.taxable = 1; });
    else if (act === 'monthly') mutate('mo', q => { const r = q.items[q.type][i]; r.monthly = !r.monthly; r.ed = r.ed || {}; r.ed.monthly = 1; });
  }
  function setType(t) {
    mutate('type', Q => {
      const p = Q.terms.find(x => x.id === 'period'), was = defaultTerms(Q.type).find(x => x.id === 'period').v;
      Q.type = t; ensure(S0, D0);
      if (p && p.v === was) p.v = defaultTerms(t).find(x => x.id === 'period').v;   // the standard delivery period follows the type unless you changed it
    });
  }
  function doSync() {
    const p = syncPlan(S0, D0), Q = ensure(S0, D0);
    const clean = !p.edited.length && !p.headEdits.length;
    if (!p.updated && !p.added.length && !p.gone.length && !p.stale) { toast('Already in line with the proposal.'); return; }
    if (clean) { mutate('sync', () => { applySync(S0, D0, 'keep'); }, () => toast(`Synced: ${p.updated} item${p.updated === 1 ? '' : 's'} updated from the proposal.`)); return; }
    const dlg = document.createElement('dialog'); dlg.className = 'qdlg';
    const names = p.edited.map(r => r.name).concat(p.headEdits.length ? [`${p.headEdits.length} header field${p.headEdits.length > 1 ? 's' : ''}`] : []);
    dlg.innerHTML = `<h3>Sync from the proposal</h3><p>${p.updated || p.added.length ? `The proposal will update ${p.updated} item${p.updated === 1 ? '' : 's'}${p.added.length ? ` and add ${p.added.length}` : ''}.` : 'The items you have not edited are already up to date.'}</p>
      <p class="warn"><b>You changed these by hand:</b></p><ul>${names.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
      ${p.manual ? `<p class="qnote">The ${p.manual} item${p.manual > 1 ? 's' : ''} you added yourself are always kept.</p>` : ''}
      <div class="qdlg-b"><button type="button" class="btn" data-m="keep">Update, keep my changes</button><button type="button" class="btn quiet dg" data-m="replace">Replace my changes too</button><button type="button" class="btn quiet" data-m="no">Cancel</button></div>`;
    $('#quote').appendChild(dlg);
    dlg.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (!b) return; const m = b.dataset.m; dlg.close(); dlg.remove(); if (m === 'no') return; mutate('sync', () => { applySync(S0, D0, m); }, () => toast(m === 'keep' ? 'Synced. Your changes were kept.' : 'Synced. Everything now follows the proposal.')); });
    dlg.addEventListener('cancel', () => dlg.remove());
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function onRailClick(e) {
    const Q = ensure(S0, D0), t = e.target;
    let b;
    if ((b = t.closest('[data-save-markup]'))) { b.textContent = lsSet(MKEY, String(num(Q.markup))) ? 'Saved: new quotations start at ' + num(Q.markup) + '%' : 'Could not save on this browser'; return; }
    if ((b = t.closest('[data-save-bank]'))) { b.textContent = lsSet(BKEY, JSON.stringify(Q.bankInfo)) ? 'Saved: new quotations start with these bank details' : 'Could not save on this browser'; return; }
    if ((b = t.closest('[data-sync]'))) { doSync(); return; }
    if ((b = t.closest('[data-ok]'))) { mutate('ok', q => { clearTbc(q, b.dataset.ok); }); return; }
    if ((b = t.closest('[data-est]'))) { if (Q.type !== b.dataset.est) setType(b.dataset.est); return; }
    if ((b = t.closest('.seg[data-q] [data-v]'))) {
      const key = b.closest('.seg').dataset.q;
      if (key === 'type') { if (Q.type !== b.dataset.v) setType(b.dataset.v); return; }
      mutate('seg', q => { setPath(q, key, key === 'termYears' ? +b.dataset.v : b.dataset.v); if (key === 'termYears') applySync(S0, D0, 'keep'); });
    }
  }
  function onRailInput(e) {
    const el = e.target, Q = ensure(S0, D0); if (!el.dataset.qf) return;
    const f = el.dataset.qf; let v;
    if (el.type === 'checkbox') v = el.checked; else if (el.tagName === 'SELECT') v = el.value; else if (['taxPct', 'markup', 'disc.v', 'optB.reduction', 'optB.months', 'perYear'].includes(f)) { v = parseNum(el.value); el.closest('.inp, .qf') && el.classList.toggle('bad', Number.isNaN(v)); if (Number.isNaN(v)) return; v = v || 0; } else v = el.value;
    snap('q:' + f);
    if (f === 'markup') setMarkup(S0, D0, v); else setPath(Q, f, v);
    if (f === 'taxPct') clearTbc(Q, 'tax');
    persist();
    if (el.type === 'checkbox' || el.tagName === 'SELECT') { refresh(true); return; }
    refresh(false);
  }
  function bind() {
    if (bound) return; bound = true;
    const qz = $('#quote'), paper = $('#qPaper'), rail = $('#qRail');
    paper.addEventListener('input', onInput); paper.addEventListener('change', onChange); paper.addEventListener('click', onPaperClick); paper.addEventListener('keydown', onKey); paper.addEventListener('paste', onPaste); paper.addEventListener('focusout', onBlur);
    rail.addEventListener('click', onRailClick); rail.addEventListener('input', onRailInput); rail.addEventListener('change', onRailInput);
    rail.addEventListener('toggle', e => { const d = e.target.closest && e.target.closest('details.qsec'); if (d) openSecs[d.dataset.sec] = d.open; }, true);
    document.addEventListener('click', e => { $$('#qPaper details.rmenu[open], #qPaper details.addmenu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('#qGen', () => { const b = document.getElementById('btnPdf'); if (b) b.click(); });
    on('#qUndo', () => restore(hist, redo)); on('#qRedo', () => restore(redo, hist)); on('#qSync', doSync);
    const ss = $('#qStat'); if (ss) ss.addEventListener('change', () => { mutate('st', q => { q.status = ss.value; }); });
    const mode = $('#qMode'); if (mode) mode.addEventListener('click', e => { const b = e.target.closest('[data-qm]'); if (!b) return; qz.dataset.qm = b.dataset.qm; mode.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b)); refresh(false); fit(); setTimeout(fit, 60); });
    if (window.ResizeObserver && $('#qPrev')) new ResizeObserver(fit).observe($('#qPrev'));
  }
  function update(S, D) {
    if (S !== lastS) { hist = []; redo = []; lastKey = ''; lastS = S; }
    S0 = S; D0 = D; ensure(S, D); assignNo(S); bind();
    if (selfEdit) { selfEdit = false; refresh(false); return; }   // an edit made here: only the figures move (the boxes keep the cursor)
    refresh(true);
  }
  root.WFCQuote = { update, printHtml, fileName, beforeGenerate, compute, estimate, ensure, docHtml, syncPlan, applySync, setMarkup, setPrice, parseNum, headVal, assignNo, nextNo, defaultTerms };
})(window);
