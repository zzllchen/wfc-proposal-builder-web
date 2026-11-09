/* WFC Proposal Builder: "Read with Claude". Sends the project description to the Anthropic API (your own key, kept in this browser only)
   and gets back the same fields the built-in reader looks for, plus the AMR it suggests and what it assumed.
   Uses the official Anthropic SDK, loaded in the browser when first needed.
   WFCIntakeAI.read({ apiKey, model, text, models }) -> { found, pick, assumptions, usage, costRM } */
(function (root) {
  'use strict';
  const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@1.3.0';
  const RM_PER_USD = 4.4;   // rough rate, only used to show the cost on screen
  const MODELS = {          // $ per million tokens (in, out)
    'claude-opus-5-5': { label: 'Opus 5.5 (smartest)', inUsd: 4, outUsd: 20 },
    'claude-sonnet-5-5': { label: 'Sonnet 5.5 (balanced)', inUsd: 2, outUsd: 10 },
    'claude-haiku-5-5': { label: 'Haiku 5.5 (cheapest)', inUsd: 0.1, outUsd: 0.5 }
  };
  const FIELDS = [
    ['client.name', 'the client company name'], ['client.attn', 'the client contact person (with title, e.g. Mr. Lee)'], ['client.ref', 'a quotation or reference number'],
    ['scenario.shifts', 'number of shifts per day (number)'], ['scenario.hoursPerShift', 'hours per shift (number)'], ['scenario.stations', 'number of pick-up stations or lines (number)'],
    ['scenario.tripsPerDay', 'pallet trips (moves) per day (number)'], ['scenario.loadKg', 'maximum load per pallet in kg (number)'],
    ['scenario.traffic', 'traffic density risk, exactly Low, Medium or High'], ['scenario.transfer', 'one short line describing the transfer, e.g. "Production line pick-up to FG warehouse drop-off"'],
    ['pallet.type', 'pallet or component type or code'], ['pallet.L', 'pallet length in mm (number)'], ['pallet.W', 'pallet width in mm (number)'], ['pallet.H', 'pallet height in mm (number)'], ['pallet.kg', 'pallet weight in kg (number)'],
    ['site.pickup', 'the pick-up area, short noun phrase'], ['site.drop', 'the drop-off area, short noun phrase'], ['site.dropSpots', 'drop-off spot letters separated by spaces, e.g. "A B C"'],
    ['route.distanceM', 'longest one-way route length in metres (number)'], ['route.speedMps', 'AMR speed in m/s (number)']
  ];
  const NUMERIC = /^(scenario\.(shifts|hoursPerShift|stations|tripsPerDay|loadKg)|pallet\.(L|W|H|kg)|route\.(distanceM|speedMps))$/;
  const LABEL = {
    'client.name': 'Client company', 'client.attn': 'Attention', 'client.ref': 'Reference no.', 'scenario.shifts': 'Shifts per day', 'scenario.hoursPerShift': 'Hours per shift',
    'scenario.stations': 'Pick-up stations', 'scenario.tripsPerDay': 'Trips per day', 'scenario.loadKg': 'Max load per pallet (kg)', 'scenario.traffic': 'Traffic density risk',
    'scenario.transfer': 'Transfer description', 'pallet.type': 'Pallet / component type', 'pallet.L': 'Pallet length (mm)', 'pallet.W': 'Pallet width (mm)', 'pallet.H': 'Pallet height (mm)',
    'pallet.kg': 'Pallet weight (kg)', 'site.pickup': 'Pick-up area', 'site.drop': 'Drop-off area', 'site.dropSpots': 'Drop-off spots', 'route.distanceM': 'Longest one-way route (m)', 'route.speedMps': 'Speed (m/s)'
  };

  function buildPrompt(text, models) {
    const list = (models || []).map(m => `- ${m.id}: ${m.name}, ${m.type}, payload ${m.payloadKg} kg, lift ${m.liftMm} mm, ${m.aisleM ? 'aisle ' + m.aisleM + ' m, ' : ''}${m.outdoor ? 'outdoor capable' : 'indoor only'}`).join('\n');
    const fields = FIELDS.map(f => `- "${f[0]}": ${f[1]}`).join('\n');
    const system = `You read a client's project description for an AMR (autonomous mobile robot) proposal for WFC Systems and return ONLY one JSON object, no other text.

Fields to fill (leave a field out when the description does not say it; never invent numbers):
${fields}

AMR models you may suggest (use the id exactly; choose the smallest model that fits the load, lift, aisle and floor; if the description is not enough to choose, leave "model" out):
${list}

Return exactly this shape:
{"fields": {"<field>": {"value": <number or string>, "evidence": "<the words from the description, at most 12 words>"}},
 "model": {"id": "<model id>", "why": ["<short reason>", "..."]},
 "assumptions": ["<anything you assumed, or an important detail that is missing>"]}`;
    return { system, user: `Project description:\n\n${String(text || '').slice(0, 40000)}` };
  }

  // the JSON object inside Claude's reply (it may add words around it)
  function jsonOf(raw) {
    const s = String(raw || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }
  function fieldsFrom(o) {
    const found = [];
    Object.keys((o && o.fields) || {}).forEach(path => {
      const f = FIELDS.find(x => x[0] === path); if (!f) return;
      const e = o.fields[path]; let v = e && typeof e === 'object' && 'value' in e ? e.value : e;
      if (NUMERIC.test(path)) { v = parseFloat(String(v).replace(/,/g, '')); if (!(v > 0)) return; }
      else { v = String(v == null ? '' : v).trim(); if (!v) return; }
      if (path === 'scenario.traffic' && !/^(Low|Medium|High)$/.test(v)) { v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); if (!/^(Low|Medium|High)$/.test(v)) return; }
      found.push({ path, label: LABEL[path] || path, value: v, source: e && e.evidence ? String(e.evidence) : '', by: 'Claude' });
    });
    return found;
  }
  function parseReply(raw) {
    const o = jsonOf(raw); if (!o) return null;
    const found = fieldsFrom(o);
    const pick = o.model && o.model.id ? { id: String(o.model.id), why: Array.isArray(o.model.why) ? o.model.why.map(String) : [] } : null;
    return { found, pick, assumptions: Array.isArray(o.assumptions) ? o.assumptions.map(String).filter(Boolean) : [] };
  }

  /* ---------- the connection ---------- */
  let sdk = null;
  async function client(apiKey) {
    if (!apiKey) throw new Error('No API key saved.');
    sdk = sdk || (await import(SDK_URL)).default;
    return new sdk({ apiKey, dangerouslyAllowBrowser: true });
  }
  // A one-word question, to see that the key works and the model can be used. Costs a fraction of a sen.
  async function test(opt) {
    const model = opt.model || 'claude-sonnet-5-5', t0 = Date.now();
    const c = await client(opt.apiKey);
    const res = await c.messages.create({ model, max_tokens: 200, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] });
    const rm = cost(model, res.usage); record(rm);
    return { ok: true, model, ms: Date.now() - t0, costRM: rm };
  }
  // plain-language reasons for the common failures
  function explain(e) {
    const m = (e && (e.message || e.error && e.error.message)) || String(e), st = e && e.status;
    if (st === 401 || /invalid x-api-key|authentication/i.test(m)) return 'Anthropic rejected the key. Check that you pasted the whole key (it starts with sk-ant-).';
    if (st === 403 || /permission/i.test(m)) return 'This key is not allowed to use that model. Pick another model or check the key in the Anthropic Console.';
    if (st === 404 || /not_found|model/i.test(m) && /not found|does not exist/i.test(m)) return 'That model name is not available to this key. Pick another model.';
    if (st === 429 || /rate|credit|billing|balance/i.test(m)) return /credit|billing|balance/i.test(m) ? 'The API account has no credit left. Check Billing in the Anthropic Console: Claude Max and Team plans include monthly API credit once the plan is linked to the Console organization, otherwise add credit there.' : 'Too many requests just now. Wait a minute and try again.';
    if (/Failed to fetch|NetworkError|Load failed|import/i.test(m)) return 'Could not reach Anthropic. Check the internet connection (the tool loads its Claude library from the web the first time).';
    return m;
  }

  function cost(model, usage) {
    const m = MODELS[model]; if (!m || !usage) return 0;
    return ((usage.input_tokens || 0) * m.inUsd + (usage.output_tokens || 0) * m.outUsd) / 1e6 * RM_PER_USD;
  }
  // Every call reports what it cost, so the monthly limit (set in the AI connections screen) can add it up. API.onSpend is set by that screen.
  function record(usd_rm) { if (usd_rm > 0 && typeof API.onSpend === 'function') { try { API.onSpend(usd_rm); } catch (e) { /* the counter must never break a call */ } } }

  async function read(opt) {
    const c = await client(opt.apiKey);
    const p = buildPrompt(opt.text, opt.models);
    const res = await c.messages.create({
      model: opt.model || 'claude-opus-5-5', max_tokens: 4000, system: p.system,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: p.user }]
    });
    record(cost(opt.model || 'claude-opus-5-5', res.usage));
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to read this text.');
    const txt = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const out = parseReply(txt);
    if (!out) throw new Error('Claude answered, but not in a form the tool could read.');
    out.usage = res.usage; out.costRM = cost(opt.model || 'claude-opus-5-5', res.usage);
    return out;
  }

  // Claude's answers replace the built-in reader's where both found something
  function merge(builtIn, ai) {
    const byPath = {}; builtIn.forEach(f => { byPath[f.path] = Object.assign({ by: 'Built-in' }, f); });
    ai.forEach(f => { f.label = (byPath[f.path] && byPath[f.path].label) || f.label; byPath[f.path] = f; });
    return Object.keys(byPath).map(k => byPath[k]);
  }

  const API = { MODELS, FIELDS, LABEL, NUMERIC, buildPrompt, parseReply, jsonOf, fieldsFrom, cost, record, onSpend: null, read, merge, client, test, explain };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCIntakeAI = API;
})(typeof window !== 'undefined' ? window : globalThis);
