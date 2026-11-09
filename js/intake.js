/* WFC Proposal Builder: reads a project description and fills in what it can recognise (names, shifts, hours, trips, distance, weights,
   pallet size, pick-up and drop-off). Plain rules, no internet. Everything it finds is listed with the words it came from, and anything
   it cannot find stays empty so the form outlines it in yellow.
   WFCIntake.parseBrief(text) -> { found: [{ path, label, value, source }], hints: {...} }
   WFCIntake.recommendModel(hints, models) -> { model, why } | null
   WFCIntake.apply(state, found) -> sets the values on a proposal state */
(function (root) {
  'use strict';
  const WORDS = { one: 1, single: 1, two: 2, double: 2, three: 3, triple: 3, four: 4 };
  const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
  const toNum = s => { const k = String(s).toLowerCase(); return WORDS[k] || num(k); };
  const clean = s => String(s).replace(/\s+/g, ' ').replace(/^[\s,.:;\-–]+|[\s,.:;\-–]+$/g, '');
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const n0 = v => Math.round(v).toLocaleString('en-US');

  function parseBrief(raw) {
    const text = String(raw || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ');
    const found = [], hints = {};
    const snip = m => {   // the words around a match, cut at word edges, so the review can show where each value came from
      let a = Math.max(0, m.index - 28), b = Math.min(text.length, m.index + m[0].length + 28);
      if (a > 0) { const sp = text.indexOf(' ', a); if (sp > -1 && sp < m.index) a = sp + 1; }
      if (b < text.length) { const sp = text.lastIndexOf(' ', b); if (sp > m.index + m[0].length) b = sp; }
      return (a > 0 ? '… ' : '') + clean(text.slice(a, b)) + (b < text.length ? ' …' : '');
    };
    const put = (path, label, value, m, note) => {
      if (value === '' || value == null || (typeof value === 'number' && !(value > 0))) return false;
      if (found.some(f => f.path === path)) return false;
      found.push({ path, label, value, source: m ? snip(m) : '', note: note || '', by: 'Built-in' });
      return true;
    };
    const val = path => { const f = found.find(x => x.path === path); return f ? f.value : null; };
    let m;

    /* who */
    m = /\b(?:client|customer|company)\s*(?:name)?\s*[:\-–]\s*([^\n.,;]{3,70})/i.exec(text);
    if (m) put('client.name', 'Client company', clean(m[1]), m);
    else {
      m = /((?:[A-Z(][\w&.'()-]*\s+){1,7}(?:Sdn\.?\s*Bhd\.?|Bhd\.?|Berhad|Pte\.?\s*Ltd\.?|Ltd\.?|Limited|Inc\.?|Corporation|Corp\.?|Co\.))/.exec(text);
      if (m) put('client.name', 'Client company', clean(m[1].replace(/^(?:The|A|An|For|At|Client|Customer|Company|Dear|To|From|Project)\s+/i, '')), m);
    }
    m = /\b(?:attn\.?|attention|contact person|person in charge|pic|contact(?=\s*:))\s*[:\-–]?\s*([^\n,;]{2,50})/i.exec(text);
    if (m) {   // the name itself is matched case-sensitively so that the next sentence is not swallowed
      const nm = /^(?:(?:Mr|Ms|Mrs|Dr|Encik|En|Puan|Pn|Cik)\.?\s+)?[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2}/.exec(m[1].trim());
      if (nm) put('client.attn', 'Attention', clean(nm[0]), m);
    }
    m = /\b(?:ref(?:erence)?|quotation|quote)\s*(?:no\.?|number|#)\s*[:\-–]?\s*([A-Z0-9][A-Z0-9/-]{3,})/i.exec(text);
    if (m) put('client.ref', 'Reference no.', m[1], m);

    /* shifts and hours */
    m = /\b(\d+|one|two|three|single|double|triple)[\s-]+shifts?\b/i.exec(text) || /\bshifts?\s*(?:per day|a day|daily)?\s*[:=]\s*(\d+)/i.exec(text);
    if (m) put('scenario.shifts', 'Shifts per day', toNum(m[1]), m);
    else if ((m = /\b(?:day|morning)\s+(?:and|&|\+)\s+(?:night|afternoon|evening)\s+shifts?\b/i.exec(text))) put('scenario.shifts', 'Shifts per day', 2, m);
    m = /(\d+(?:\.\d+)?)[\s-]*(?:hours?|hrs?|h)\b[\s-]*(?:per|a|each|every|\/)?\s*shifts?/i.exec(text) || /shifts?\s*(?:of|is|are|=|:)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(text);
    if (m) put('scenario.hoursPerShift', 'Hours per shift', num(m[1]), m);
    m = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:per|a|\/)\s*day/i.exec(text);
    if (m) {
      const hpd = num(m[1]), sh = val('scenario.shifts');
      if (sh && !val('scenario.hoursPerShift')) put('scenario.hoursPerShift', 'Hours per shift', Math.round(hpd / sh * 10) / 10, m, `${hpd} h a day over ${sh} shifts`);
      else if (!sh && hpd <= 12) { put('scenario.shifts', 'Shifts per day', 1, m); put('scenario.hoursPerShift', 'Hours per shift', hpd, m); }
    }

    /* volume */
    m = /(\d[\d,]*)\s*(?:pallets?|trips?|moves?|transfers?|deliveries|runs|cycles|loads?|movements?)\s*(?:per|a|each|every|\/)\s*day/i.exec(text)
      || /(\d[\d,]*)\s*(?:pallets?|trips?|transfers?|moves?)\s*daily/i.exec(text)
      || /daily\s+(?:volume|output|throughput|movements?)?\s*(?:of|:|is)?\s*(?:about|around|approximately|~)?\s*(\d[\d,]*)\s*(?:pallets?|trips?|transfers?|moves?)/i.exec(text);
    if (m) put('scenario.tripsPerDay', 'Trips per day', num(m[1]), m);
    else if ((m = /(\d[\d,]*)\s*(?:pallets?|trips?|transfers?|moves?)\s*(?:per|an|\/)\s*hour/i.exec(text))) {
      const sh = val('scenario.shifts'), hs = val('scenario.hoursPerShift');
      if (sh && hs) put('scenario.tripsPerDay', 'Trips per day', Math.round(num(m[1]) * sh * hs), m, `${num(m[1])} an hour over ${sh * hs} working hours`);
    }
    m = /(\d+)\s*(?:pick-?up\s+)?(?:stations?|production\s+lines?|lines|channels|pick-?up points?|workstations?)\b/i.exec(text);
    if (m) put('scenario.stations', 'Pick-up stations', num(m[1]), m);

    /* distance and speed */
    m = /(?:longest|total|one[- ]way)?[^.\n]{0,12}(?:distance|route|travel(?:l?ing)?|path|haul|length)[^.\n]{0,50}?(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)\b(?!\s*\/)/i.exec(text)
      || /(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)\b(?!\s*\/)\s*(?:one[- ]way|each way|away|long|route|distance|travel)/i.exec(text);
    if (!m) m = /(?:route|distance|path)[^\n]{0,260}?\b(?:about|around|approximately|roughly|~|is|of)\s*(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)\b(?!\s*\/)/i.exec(text);   // "The longest one-way route is from A to B along the walkway. It is about 110 m."
    if (m) put('route.distanceM', 'Longest one-way route (m)', num(m[1]), m);
    m = /(\d(?:\.\d+)?)\s*m\s*\/\s*s\b/i.exec(text) || /(\d(?:\.\d+)?)\s*(?:meters?|metres?)\s*per\s*second/i.exec(text);
    if (m && num(m[1]) <= 3) put('route.speedMps', 'Speed (m/s)', num(m[1]), m);

    /* load and pallet */
    const kgRe = /(\d[\d,]*(?:\.\d+)?)\s*(kg|kgs|kilograms?|tonnes?|tons?|t)\b/gi;
    let best = null;
    while ((m = kgRe.exec(text))) {
      const ctx = text.slice(Math.max(0, m.index - 45), m.index).toLowerCase();
      if (!/(load|weigh|payload|capacity|heavy|pallet|carry|up to|max)/.test(ctx) && !/(load|weigh|payload|pallet)/.test(text.slice(m.index, m.index + 30).toLowerCase())) continue;
      const kg = /^t/i.test(m[2]) && !/^kg/i.test(m[2]) ? num(m[1]) * 1000 : num(m[1]);
      if (kg > 0 && kg <= 10000 && (!best || kg > best.kg)) best = { kg, m };
    }
    if (best) { put('scenario.loadKg', 'Max load per pallet (kg)', Math.round(best.kg), best.m); put('pallet.kg', 'Pallet weight (kg)', Math.round(best.kg), best.m); hints.loadKg = best.kg; }
    m = /(\d{3,4})\s*(?:mm)?\s*(?:x|×|\*|by)\s*(\d{3,4})\s*(?:mm)?\s*(?:x|×|\*|by)\s*(\d{2,4})\s*(?:mm)?\b/i.exec(text);
    if (m) { put('pallet.L', 'Pallet length (mm)', num(m[1]), m); put('pallet.W', 'Pallet width (mm)', num(m[2]), m); put('pallet.H', 'Pallet height (mm)', num(m[3]), m); }
    else if ((m = /(\d(?:\.\d+)?)\s*(?:x|×|by)\s*(\d(?:\.\d+)?)\s*(?:x|×|by)\s*(\d(?:\.\d+)?)\s*m\b/i.exec(text))) {
      put('pallet.L', 'Pallet length (mm)', num(m[1]) * 1000, m); put('pallet.W', 'Pallet width (mm)', num(m[2]) * 1000, m); put('pallet.H', 'Pallet height (mm)', num(m[3]) * 1000, m);
    } else if ((m = /(\d{3,4})\s*(?:x|×|\*|by)\s*(\d{3,4})\s*mm/i.exec(text))) {
      put('pallet.L', 'Pallet length (mm)', num(m[1]), m); put('pallet.W', 'Pallet width (mm)', num(m[2]), m);
    }
    m = /\b([A-Z]{3,}(?:-[A-Z0-9]{2,})+)\b/.exec(text);
    if (m) put('pallet.type', 'Pallet / component type', m[1], m);
    else if ((m = /\b(euro|wooden|plastic|steel|metal|wood|gaylord|cage|roll|drum)\s+(pallets?|crates?|boxes|cages|containers)\b/i.exec(text))) put('pallet.type', 'Pallet / component type', cap(m[1].toLowerCase()) + ' ' + m[2].toLowerCase().replace(/s$/, ''), m);

    /* where from, where to */
    const stop = /\b(?:where|which|that|using|with|by|for|in order|so that|via|and then|then|because)\b/i;
    m = /\bfrom\s+(?:the\s+)?([A-Za-z0-9][^,.;\n]{2,55}?)\s+(?:to|towards|into)\s+(?:the\s+)?([A-Za-z0-9][^,.;\n]{2,55})/i.exec(text);
    if (m) {
      const lead = x => x.replace(/^(?:its|their|our|his|her|the|a|an)\s+/i, '');
      const pick = lead(clean(m[1].split(stop)[0])), drop = lead(clean(m[2].split(stop)[0]));
      if (pick && drop) {
        put('site.pickup', 'Pick-up area', cap(pick), m); put('site.drop', 'Drop-off area', cap(drop), m);
        put('scenario.transfer', 'Transfer description', `${cap(pick)} to ${drop}`, m);
      }
    }
    m = /(?:spots?|slots?|bays?|positions?|locations?)\s*(?:are|:|=|,)?\s*((?:[A-Z]\b[\s,;/&]*(?:(?:and|or)\s+)?){2,8})/.exec(text);
    if (m) put('site.dropSpots', 'Drop-off spots', (m[1].match(/\b[A-Z]\b/g) || []).join(' '), m);
    else if ((m = /(\d+)\s*(?:drop-?off\s+)?(?:spots?|slots?|bays?)\b/i.exec(text)) && num(m[1]) >= 2 && num(m[1]) <= 8) put('site.dropSpots', 'Drop-off spots', 'ABCDEFGH'.slice(0, num(m[1])).split('').join(' '), m);

    /* traffic */
    if ((m = /high[- ]traffic|heavy traffic|traffic\s*(?:(?:\w+\s+){0,3}?(?:is|are)|:)?\s*(?:very\s+)?(?:high|heavy)|congested|crowded|very busy|(?<!not )(?<!not that )many (?:forklifts?|people|pedestrians|workers)/i.exec(text))) put('scenario.traffic', 'Traffic density risk', 'High', m);
    else if ((m = /medium traffic|moderate traffic|traffic\s*(?:(?:\w+\s+){0,3}?(?:is|are)|:)?\s*(?:medium|moderate)|moderately busy|some (?:forklifts?|pedestrians)|busy/i.exec(text))) put('scenario.traffic', 'Traffic density risk', 'Medium', m);
    else if ((m = /low[- ]traffic|light traffic|traffic\s*(?:(?:\w+\s+){0,3}?(?:is|are)|:)?\s*(?:very\s+)?(?:low|light)|quiet|not many (?:forklifts?|people|pedestrians|workers)|few (?:forklifts?|people|pedestrians)|no (?:forklifts?|pedestrians)/i.exec(text))) put('scenario.traffic', 'Traffic density risk', 'Low', m);

    /* what decides the AMR model */
    m = /(?:aisle|corridor|passage|doorway)\s*(?:width)?[^.\n]{0,30}?(\d(?:\.\d+)?)\s*m\b/i.exec(text); if (m) hints.aisleM = num(m[1]);
    m = /(?:lift(?:ing)?|rack|shel(?:f|ves|ving)|stack(?:ing)?|height)[^.\n]{0,40}?(\d(?:\.\d+)?)\s*m\b/i.exec(text); if (m && num(m[1]) >= 1) hints.liftMm = num(m[1]) * 1000;
    if (/\b(?:racks?|racking|shel(?:f|ves|ving)|reach truck|stack(?:ing)?|high bay)\b/i.test(text)) hints.rack = true;
    if (/\b(?:outdoor|outside|yard|uneven|slope|ramp)\b/i.test(text)) hints.outdoor = true;
    return { found, hints };
  }

  // The smallest AMR that can carry the load (and lift, fit the aisle, go outdoors if asked); among equals, the cheapest.
  function recommendModel(hints, models) {
    const h = hints || {}, why = [];
    let list = (models || []).filter(x => x.payloadKg >= (h.loadKg || 0));
    const needLift = h.liftMm > 0 ? h.liftMm : (h.rack ? 1500 : 0);
    if (needLift > 600) { list = list.filter(x => x.liftMm >= needLift && /Reach|Fork/i.test(x.type)); why.push(`lifts to at least ${n0(needLift)} mm`); }
    else list = list.filter(x => /Pallet Jack/i.test(x.type));
    if (h.outdoor) { list = list.filter(x => x.outdoor); why.push('works outdoors and on uneven floors'); }
    if (h.aisleM) { list = list.filter(x => !x.aisleM || x.aisleM <= h.aisleM); why.push(`fits an aisle of ${h.aisleM} m`); }
    if (!list.length) return null;
    list.sort((a, b) => a.payloadKg - b.payloadKg || a.unitPrice - b.unitPrice);
    const pick = list[0];
    why.unshift(h.loadKg ? `carries up to ${n0(pick.payloadKg)} kg (the load is ${n0(h.loadKg)} kg)` : `carries up to ${n0(pick.payloadKg)} kg`);
    return { model: pick, why };
  }

  const set = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k] == null ? (a[k] = {}) : a[k], o)[last] = v; };
  function apply(state, found) { found.forEach(f => set(state, f.path, f.value)); return state; }

  const API = { parseBrief, recommendModel, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCIntake = API;
})(typeof window !== 'undefined' ? window : globalThis);
