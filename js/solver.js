/* WFC Proposal Builder: the solver. Takes what the description says (load, lift, aisle, floor, trips, distance...) and works out, with plain
   rules and the fleet-size maths, which AMR fits, how many are needed, and why. No internet, no AI: this part is always built in.
   WFCSolver.solve({ models, hints, scenario, route, fleet, speedStated }) ->
     { best: { model, qty, strategy, speedMps, fleet, why[] }, ranked: [{ model, feasible, qty, reject[] }], checks: [{ label, ok, detail }], notes[] } | null
   Rules: the AMR class follows the lift (floor-level pallet jack, or reach truck / forklift when racks or a lift height are mentioned);
   it must carry the load, fit the aisle, suit the floor, and work without WiFi if the site has none. Of the models left, the one needing the
   lowest hardware cost for the fleet wins (fewest AMRs first); ties go to the smaller payload. Cost only ranks the choices, it is never shown. */
(function (root) {
  'use strict';
  const C = root.WFCCalc || (typeof require !== 'undefined' ? require('./calc.js') : null);
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const n0 = v => Math.round(v).toLocaleString('en-US');

  // Speed used for a model: the stated speed if the description gave one; otherwise 1.3 m/s for pallet jacks (as in past proposals), and for the
  // other classes the model's own laden/empty speeds combined into one round-trip speed.
  function modelSpeed(m, stated) {
    if (stated > 0) return stated;
    if (/Pallet Jack/i.test(m.type)) return 1.3;
    const nums = String(m.speed || '').match(/(\d+(?:\.\d+)?)/g);
    if (nums && nums.length >= 2) { const a = +nums[0], b = +nums[1]; return Math.round(2 / (1 / a + 1 / b) * 100) / 100; }
    return nums ? +nums[0] : 1.3;
  }

  function hardwareCost(m, qty) {   // AMRs plus the RCS bundle (included once when the supplier always bundles it, or from 2 units up)
    const rcs = (m.rcsAtQty1 || qty >= 2) ? num(m.rcsUnit) : 0;
    return qty * num(m.unitPrice) + rcs;
  }

  function solve(inp) {
    const models = inp.models || [], h = inp.hints || {}, sc = inp.scenario || {}, rt = inp.route || {}, fl = inp.fleet || {};
    const load = num(sc.loadKg) || num(h.loadKg), stated = inp.speedStated ? num(rt.speedMps) : 0;
    if (!models.length) return null;
    const needLift = h.liftMm > 0 ? h.liftMm : (h.rack ? 1500 : 0);
    const liftClass = needLift > 600;
    const notes = [];

    const ranked = models.map(m => {
      const reject = [];
      if (load && m.payloadKg < load) reject.push(`carries only ${n0(m.payloadKg)} kg (load ${n0(load)} kg)`);
      if (liftClass) { if (!/Reach|Fork/i.test(m.type)) reject.push('cannot lift to the rack height'); else if (m.liftMm < needLift) reject.push(`lifts only ${n0(m.liftMm)} mm (needs ${n0(needLift)} mm)`); }
      else if (!/Pallet Jack/i.test(m.type)) reject.push('a floor-level transfer does not need a lifting truck');
      if (h.outdoor && !m.outdoor) reject.push('indoor only, the site is outdoor or uneven');
      if (h.aisleM && m.aisleM && m.aisleM > h.aisleM) reject.push(`needs a ${m.aisleM} m aisle (site has ${h.aisleM} m)`);
      if (h.noWifi && m.wifi) reject.push('needs site WiFi, which the site does not have');
      let qty = null, F = null, strategy = 'charge', speed = modelSpeed(m, stated);
      const ok = !reject.length;
      if (ok) {
        F = C.fleetSize({ shifts: sc.shifts, hoursPerShift: sc.hoursPerShift, tripsPerDay: sc.tripsPerDay, route: Object.assign({}, rt, { speedMps: speed }),
          runtimeH: fl.runtimeH, chargeH: fl.chargeH, swapMin: fl.swapMin, maxUtilPct: fl.maxUtilPct, peakFactor: fl.peakFactor, spareAmr: fl.spareAmr });
        if (F.ok) qty = F.charge.amrs;
      }
      return { model: m, feasible: ok, reject, qty, fleet: F, speedMps: speed, cost: ok ? hardwareCost(m, qty || 1) : Infinity };
    });
    const ok = ranked.filter(r => r.feasible).sort((a, b) => a.cost - b.cost || a.model.payloadKg - b.model.payloadKg);
    ranked.sort((a, b) => (b.feasible - a.feasible) || (a.cost - b.cost) || (a.model.payloadKg - b.model.payloadKg));
    if (!ok.length) return { best: null, ranked, checks: [], notes: ['No AMR in the list meets every requirement. Check the load, aisle and lift in the description.'] };

    const b = ok[0], F = b.fleet, m = b.model, why = [];
    why.push(load ? `Carries up to ${n0(m.payloadKg)} kg; the heaviest pallet is ${n0(load)} kg.` : `Carries up to ${n0(m.payloadKg)} kg.`);
    why.push(liftClass ? `Lifts to ${n0(m.liftMm)} mm for the racking.` : 'Moves pallets at floor level, so a pallet jack AMR is enough and keeps the solution simple.');
    if (h.aisleM && m.aisleM) why.push(`Needs a ${m.aisleM} m aisle; the site has ${h.aisleM} m.`);
    if (h.outdoor) why.push('Works outdoors and on uneven floors.');
    if (ok.length > 1) why.push('Of the models that fit, it is the most economical choice for the fleet.');

    let strategy = 'charge';
    if (F && F.ok) {
      if (F.swapSavesAmrs > 0) notes.push(`Swapping spare batteries would need ${F.swapSavesAmrs} fewer ${F.swapSavesAmrs === 1 ? 'AMR' : 'AMRs'}, but needs an operator and ${F.swap.extraBatteries} spare ${F.swap.extraBatteries === 1 ? 'battery' : 'batteries'}. Auto-charging is proposed; ask the client which they prefer.`);
      why.push(F.charge.amrs === 1 ? `One AMR covers ${n0(F.trips)} trips a day, busy about ${Math.round(F.charge.utilOfAvail * 100)}% of its available time.`
        : `${F.charge.amrs} AMRs cover ${n0(F.trips)} trips a day, each busy about ${Math.round(F.charge.utilOfAvail * 100)}% of its available time.`);
    }
    const checks = [];
    if (load) checks.push({ label: 'Load', ok: m.payloadKg >= load, detail: `${n0(load)} kg against ${n0(m.payloadKg)} kg capacity` });
    checks.push({ label: 'Transfer type', ok: true, detail: liftClass ? `Racking up to ${n0(needLift)} mm, ${m.type}` : `Floor-level pallet transfer, ${m.type}` });
    if (h.aisleM) checks.push({ label: 'Aisle', ok: !m.aisleM || m.aisleM <= h.aisleM, detail: `${h.aisleM} m aisle, AMR needs ${m.aisleM} m` });
    checks.push({ label: 'Floor', ok: !h.outdoor || m.outdoor, detail: h.outdoor ? 'Outdoor or uneven floor' : 'Indoor, smooth floor (assumed)' });
    if (F && F.ok) checks.push({ label: 'Workload', ok: F.charge.utilOfAvail <= F.maxUtil + 1e-9, detail: `${n0(F.trips)} trips x ${n0(F.cycle.totalS)} s = ${(Math.round(F.workH * 10) / 10)} h a day` });
    return { best: { model: m, qty: b.qty, strategy, speedMps: b.speedMps, fleet: F, why }, ranked, checks, notes };
  }

  const API = { solve, modelSpeed, hardwareCost };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCSolver = API;
})(typeof window !== 'undefined' ? window : globalThis);
