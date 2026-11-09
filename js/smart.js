/* WFC Proposal Builder: the balance between the built-in features and Claude. One entry point, run(), used by "New from a brief".
   Built-in (always, free, instant): reads the numbers it recognises, picks the AMR and counts the fleet (solver), draws the plan from what is known.
   Claude (only when needed, one call): reads details the rules could not find, looks at the layout picture and draws the areas, points and route,
   writes the operating flow, and names what it assumed. Claude's answers are checked and tidied by built-in code before anything is used.
   Modes: 'builtin' (never calls Claude), 'balanced' (calls Claude once, only for what the built-in part cannot do), 'claude' (asks Claude to read everything).
   WFCSmart.run(opt) -> { found, hints, solution, plan, flow, assumptions, steps[], costRM, aiErr, usedClaude }
   WFCSmart.applyTo(state, result) -> fills a proposal state with the result */
(function (root) {
  'use strict';
  const I = root.WFCIntake || (typeof require !== 'undefined' ? require('./intake.js') : null);
  const AI = root.WFCIntakeAI || (typeof require !== 'undefined' ? require('./intake-ai.js') : null);
  const P = root.WFCPlanAI || (typeof require !== 'undefined' ? require('./plan-ai.js') : null);
  const SV = root.WFCSolver || (typeof require !== 'undefined' ? require('./solver.js') : null);
  // Details the proposal needs that have no default. (Shifts, hours and speed start with the usual values, so Claude is not asked for those.)
  const NEEDED = ['client.name', 'client.attn', 'scenario.stations', 'scenario.tripsPerDay', 'scenario.loadKg', 'scenario.transfer', 'pallet.type', 'pallet.L', 'pallet.W', 'pallet.H', 'pallet.kg', 'site.pickup', 'site.drop', 'route.distanceM'];
  const OPTIONAL_DEFAULTED = ['scenario.shifts', 'scenario.hoursPerShift', 'route.speedMps'];
  const FLEET_DEFAULT = { runtimeH: 6.5, chargeH: 2, maxUtilPct: 80, peakFactor: 1.5, spareAmr: 0, swapMin: 5 };
  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);

  async function run(opt) {
    const text = String(opt.text || '').trim(), mode = opt.mode || 'builtin', steps = [], assumptions = [];
    const parsed = I.parseBrief(text); let found = parsed.found.slice(); const hints = Object.assign({}, parsed.hints);
    // details typed into the form are exact: they win over anything the reader found in the text
    (opt.fields || []).forEach(f => { const i = found.findIndex(x => x.path === f.path); if (i >= 0) found[i] = f; else found.push(f); });
    steps.push({ by: 'Built-in', what: opt.fields && opt.fields.length ? `Took ${opt.fields.length} details from the form${found.length > opt.fields.length ? ' and read more from the text' : ''}` : `Read the description: ${found.length} detail${found.length === 1 ? '' : 's'} found` });
    const have = new Set(found.map(f => f.path)), missing = NEEDED.filter(p => !have.has(p));
    let ai = null, aiErr = '', plan = null, flow = '', costRM = 0, usedClaude = false;
    const wantPlan = !!opt.layout, key = opt.apiKey;

    // Claude is called once, and only when there is something the built-in part cannot do
    const useClaude = key && mode !== 'builtin' && ((mode === 'claude' && text) || wantPlan || (missing.length && text));
    if (useClaude) {
      const full = mode === 'claude', want = full ? AI.FIELDS.map(f => f[0]) : missing.concat(OPTIONAL_DEFAULTED.filter(p => !have.has(p)));
      const model = wantPlan || full ? (opt.model || 'claude-opus-5-5') : (opt.model === 'claude-opus-5-5' ? 'claude-sonnet-5-5' : (opt.model || 'claude-sonnet-5-5'));
      if (opt.onStep) opt.onStep(wantPlan ? 'Claude is reading the description and drawing the route…' : 'Claude is reading the details the built-in reader missed…');
      try {
        ai = await P.solve({ apiKey: key, model, text, layout: opt.layout, aspect: opt.layoutAspect, models: opt.models, want, known: full ? [] : found });
        usedClaude = true; costRM = ai.costRM || 0;
        // built-in finds win when it found them with the words they came from, unless Claude was asked to read everything
        const builtIn = new Map(found.map(f => [f.path, f]));
        ai.fields.forEach(f => {
          const b = builtIn.get(f.path);
          if (!b) { found.push(f); return; }
          if (String(b.value) !== String(f.value)) {
            if (full) { found[found.indexOf(b)] = f; assumptions.push(`${f.label}: the built-in reader found ${b.value}, Claude read ${f.value}. Claude's is used; please check.`); }
            else assumptions.push(`${f.label}: the built-in reader found ${b.value}, Claude read ${f.value}. The built-in value is kept; please check.`);
          }
        });
        Object.keys(ai.hints || {}).forEach(k => { if (hints[k] == null) hints[k] = ai.hints[k]; });
        steps.push({ by: 'Claude', what: `Read ${ai.fields.length} more detail${ai.fields.length === 1 ? '' : 's'}${wantPlan ? ', drew the layout and wrote the flow' : ''}` });
        (ai.assumptions || []).forEach(a => assumptions.push(a));
        if (ai.plan && (ai.plan.routes.length || ai.plan.zones.length || ai.plan.points.length)) plan = ai.plan;
        flow = ai.flow || '';
      } catch (e) { aiErr = AI.explain ? AI.explain(e) : String(e && e.message || e); steps.push({ by: 'Claude', what: 'Could not be used: ' + aiErr, bad: true }); }
    } else if (mode !== 'builtin' && !key) {
      steps.push({ by: 'Claude', what: 'Not connected, so only the built-in features were used', bad: true });
    }

    // values for the maths: what was read, else the usual defaults
    const val = p => { const f = found.find(x => x.path === p); return f ? f.value : undefined; };
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const scenario = { shifts: num(val('scenario.shifts')) || 2, hoursPerShift: num(val('scenario.hoursPerShift')) || 8, tripsPerDay: num(val('scenario.tripsPerDay')), loadKg: num(val('scenario.loadKg')) };
    const speedStated = num(val('route.speedMps')) > 0;
    const route = { distanceM: num(val('route.distanceM')), speedMps: speedStated ? num(val('route.speedMps')) : 1.3, bufferPct: 20, dwellS: 0 };
    if (!val('scenario.shifts') || !val('scenario.hoursPerShift')) assumptions.push('Shifts and hours were not stated: 2 shifts of 8 hours are assumed.');
    if (!speedStated) assumptions.push('AMR speed was not stated: 1.3 m/s is used, as in past proposals.');
    const solution = SV.solve({ models: opt.models, hints: Object.assign({}, hints, { loadKg: scenario.loadKg }), scenario, route, fleet: Object.assign({}, FLEET_DEFAULT, opt.fleet || {}), speedStated });
    if (solution && solution.best) steps.push({ by: 'Built-in', what: `Chose the ${solution.best.model.name}${solution.best.qty ? `, ${solution.best.qty} ${solution.best.qty === 1 ? 'AMR' : 'AMRs'}` : ''}` });
    else if (solution) steps.push({ by: 'Built-in', what: 'No AMR in the list meets every requirement', bad: true });
    (solution && solution.notes || []).forEach(n => assumptions.push(n));

    // the scale comes from the stated route length
    if (plan && opt.layoutAspect) {
      if (P.calibrate(plan, opt.layoutAspect, route.distanceM)) assumptions.push(`The layout scale is set so the drawn longest route measures the stated ${route.distanceM} m. If you know a real distance on the layout (a wall, a bay), use the Scale tool to check it.`);
      else if (plan.routes.length) assumptions.push('No route length was stated, so the layout has no scale yet. Use the Scale tool, then the route length fills in by itself.');
    }
    if (!plan && wantPlan && mode !== 'builtin' && !aiErr && useClaude) assumptions.push('Claude did not return a drawing for the layout. Draw it with the layout editor, or press Draw with AI there.');
    if (!plan && wantPlan && (mode === 'builtin' || !key)) assumptions.push('Drawing the route on the layout needs Claude (it has to look at the picture). Connect Claude, or draw it by hand in the layout editor.');
    return { found, hints, solution, plan, flow, assumptions, steps, costRM, aiErr, usedClaude, ai };
  }

  // Put a result into a proposal state (a blank one from WFCPresets.blank()).
  function applyTo(S, r) {
    I.apply(S, r.found);
    const sol = r.solution && r.solution.best;
    if (sol) { S.model = sol.model.id; S.fleet.strategy = sol.strategy; }
    if (r.plan) {
      S.layoutPlan = Object.assign({ sync: true, scale: null }, r.plan);
      const pickups = r.plan.points.filter(p => p.kind === 'pick').length;
      if (pickups && !(parseFloat(S.scenario.stations) > 0)) S.scenario.stations = pickups;
      const spots = r.plan.points.filter(p => p.kind === 'spot').map(p => p.label).filter(Boolean);
      if (spots.length && !String(S.site.dropSpots || '').trim()) S.site.dropSpots = spots.join(' ');
    }
    if (r.flow) S.workflow.lines = r.flow;
    S.solution = {
      by: r.usedClaude ? 'Built-in features and Claude' : 'Built-in features',
      why: sol ? sol.why : [], checks: r.solution ? r.solution.checks : [], assumptions: r.assumptions,
      alternatives: r.solution ? r.solution.ranked.filter(x => !sol || x.model.id !== sol.model.id).slice(0, 5).map(x => ({ name: x.model.name, ok: x.feasible, qty: x.qty, why: x.feasible ? 'Also fits' : x.reject.join('; ') })) : []
    };
    return S;
  }

  const API = { run, applyTo, NEEDED };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCSmart = API;
})(typeof window !== 'undefined' ? window : globalThis);
