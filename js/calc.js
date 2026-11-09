/* WFC Proposal Builder: calculation engine (no DOM). Works in the browser (window.WFCCalc) and in node (tests). */
(function (root) {
  'use strict';

  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };
  const round = (v, p) => { const k = Math.pow(10, p === undefined ? 2 : p); return Math.round((v + Number.EPSILON) * k) / k; };

  /* ---------- Route cycle time ----------
     theoretical = 2 x one-way distance / speed; real-world buffer = % of theoretical; dwell = pick-up + drop-off handling (s) */
  function routeCycle(r) {
    const d = num(r.distanceM), v = num(r.speedMps), b = num(r.bufferPct), s = Math.max(num(r.dwellS), 0);
    if (d <= 0 || v <= 0) return null;
    const theoS = 2 * d / v;
    const bufS = theoS * b / 100;
    return { distanceM: d, speedMps: v, theoS, bufS, dwellS: s, totalS: theoS + bufS + s, totalMin: (theoS + bufS + s) / 60 };
  }

  /* ---------- Productive hours one AMR can give in a day ---------- */
  // Charging strategy: work R hours, charge C hours, repeat, starting full. Clipped to the operating day H.
  function availCharge(H, R, C) {
    const cycle = R + C;
    const n = Math.floor(H / cycle + 1e-9);
    const rest = Math.max(H - n * cycle, 0);
    return n * R + Math.min(rest, R);
  }
  // Battery-swap strategy: spare pack swapped by hand whenever the pack is used up; each swap costs swapMin minutes.
  function availSwap(H, R, swapMin) {
    const swaps = H > R + 1e-9 ? Math.ceil(H / R - 1e-9) - 1 : 0;
    return { availH: Math.max(H - swaps * swapMin / 60, 0), swaps };
  }

  /* ---------- Fleet size ----------
     inp: shifts, hoursPerShift, tripsPerDay, route{...}, runtimeH, chargeH, swapMin, maxUtilPct, peakFactor, spareAmr, batteryCost */
  function fleetSize(inp) {
    const H = num(inp.shifts) * num(inp.hoursPerShift);
    const N = Math.max(num(inp.tripsPerDay), 0);
    const R = num(inp.runtimeH), C = Math.max(num(inp.chargeH), 0), swapMin = Math.max(num(inp.swapMin), 0);
    const u = num(inp.maxUtilPct, 80) / 100, peak = Math.max(num(inp.peakFactor, 1), 0), spare = Math.max(Math.floor(num(inp.spareAmr)), 0);
    const cyc = routeCycle(inp.route || {});
    const errors = [];
    if (H <= 0) errors.push('Enter shifts and hours per shift.');
    if (N <= 0) errors.push('Enter the trips per day.');
    if (!cyc) errors.push('Enter the route distance and speed.');
    if (R <= 0) errors.push('Enter the battery runtime.');
    if (u <= 0 || u > 1) errors.push('Maximum utilisation must be between 1 and 100%.');
    if (errors.length) return { ok: false, errors };

    const workH = N * cyc.totalS / 3600;                        // robot-hours of work per day
    const peakWorkPerHour = (N / H) * peak * cyc.totalS / 3600;  // robot-hours needed in the busiest hour
    const peakNeed = peakWorkPerHour / u;

    function size(availH) {
      const daily = availH > 0 ? workH / (availH * u) : Infinity;
      const need = Math.max(daily, peakNeed);
      const base = Math.max(1, Math.ceil(need - 1e-9));
      const amrs = base + spare;
      return {
        availH, dailyNeed: daily, peakNeed, baseAmrs: base, amrs,
        utilOfDay: workH / (amrs * H),           // share of the operating day each AMR is moving
        utilOfAvail: availH > 0 ? workH / (amrs * availH) : 0
      };
    }
    const ch = size(availCharge(H, R, C));
    ch.extraBatteries = 0; ch.swaps = 0;
    const sw0 = availSwap(H, R, swapMin);
    const sw = size(sw0.availH);
    sw.swaps = sw0.swaps; sw.extraBatteries = sw0.swaps > 0 ? sw.amrs : 0;
    const bc = Math.max(num(inp.batteryCost), 0);
    sw.batteryCostTotal = sw.extraBatteries * bc;

    return {
      ok: true, opHours: H, trips: N, cycle: cyc, workH, peakWorkPerHour, tripsPerHour: N / H,
      charge: ch, swap: sw, runtimeH: R, chargeH: C, swapMin, maxUtil: u, peakFactor: peak, spare,
      swapSavesAmrs: ch.amrs - sw.amrs
    };
  }

  // One AMR across the operating day, for the timeline picture. kinds: ready | charge | swap
  function timeline(strategy, H, R, C, swapMin) {
    const seg = [];
    if (strategy === 'swap') {
      const m = swapMin / 60;
      let t = 0;
      while (t < H - 1e-9) {
        const end = Math.min(t + R, H);
        seg.push({ kind: 'ready', from: t, to: end });
        t = end;
        if (t < H - 1e-9) { const e2 = Math.min(t + m, H); seg.push({ kind: 'swap', from: t, to: e2 }); t = e2; }
      }
    } else {
      let t = 0;
      while (t < H - 1e-9) {
        const end = Math.min(t + R, H);
        seg.push({ kind: 'ready', from: t, to: end });
        t = end;
        if (t < H - 1e-9) { const e2 = Math.min(t + C, H); seg.push({ kind: 'charge', from: t, to: e2 }); t = e2; }
      }
    }
    return seg;
  }

  /* ---------- Pricing lines ----------
     line: { label, qty, base (unit base amount, RM), pct (markup %), taxable } */
  function lineCalc(l) {
    const qty = num(l.qty, 1), base = num(l.base), pct = num(l.pct);
    const unit = base * (1 + pct / 100);
    return { qty, base, pct, unit, markupUnit: unit - base, baseTotal: base * qty, markupTotal: (unit - base) * qty, total: unit * qty, taxable: !!l.taxable };
  }
  // The three linked fields of one line. Editing any one updates the percentage, the others follow.
  function setLinePct(l, pct) { l.pct = num(pct); return l; }
  function setLineMarkupAmt(l, amt) { const b = num(l.base); l.pct = b > 0 ? num(amt) / b * 100 : 0; return l; }
  function setLinePrice(l, price) {
    const b = num(l.base), p = num(price);
    if (b > 0) l.pct = (p / b - 1) * 100; else { l.base = p; l.pct = 0; }
    return l;
  }
  function sumLines(lines, taxRatePct) {
    let base = 0, markup = 0, sub = 0, taxable = 0;
    lines.forEach(l => { const c = lineCalc(l); base += c.baseTotal; markup += c.markupTotal; sub += c.total; if (c.taxable) taxable += c.total; });
    const tax = taxable * num(taxRatePct) / 100;
    return { base, markup, markupPct: base > 0 ? markup / base * 100 : 0, subtotal: sub, tax, grand: sub + tax };
  }
  // Summary-level editing: one markup for every line. mode: 'pct' | 'amt' | 'quote' (target subtotal before tax)
  function applyTotalMarkup(lines, mode, value) {
    const base = lines.reduce((s, l) => s + num(l.base) * num(l.qty, 1), 0);
    if (base <= 0) return lines;
    const v = num(value);
    const pct = mode === 'pct' ? v : mode === 'amt' ? v / base * 100 : (v / base - 1) * 100;
    lines.forEach(l => { l.pct = round(pct, 6); });
    return lines;
  }

  /* ---------- Purchase quotation from the selector tool ----------
     model: { unitPrice, rcsUnit, rcsAtQty1 }. RCS rule: bundled once if the supplier always includes it, or when 2+ units are ordered. */
  function purchaseLines(model, qty, defaults) {
    const q = Math.max(Math.floor(num(qty, 1)), 1), d = defaults || {};
    const rcs = (model.rcsAtQty1 || q >= 2) ? num(model.rcsUnit) : 0;
    return [
      { id: 'hw', label: 'AMR hardware', qty: q, base: num(model.unitPrice), pct: 0, taxable: true },
      { id: 'rcs', label: 'RCS and system', qty: 1, base: rcs, pct: 0, taxable: true },
      { id: 'custom', label: 'Customisation', qty: 1, base: num(d.customisation, 0), pct: 0, taxable: true },
      { id: 'delivery', label: 'Delivery', qty: 1, base: num(d.delivery, 0), pct: 0, taxable: true },
      { id: 'install', label: 'Installation and setup', qty: 1, base: num(d.installation, 0), pct: 0, taxable: false }
    ];
  }

  /* ---------- Rental plans ----------
     r: { qty, setup:[line], monthly: line (per AMR), reduction, reducedMonths, planC:[line] } */
  function rentalPlans(r) {
    const qty = Math.max(num(r.qty, 1), 1);
    const setup = r.setup.reduce((s, l) => s + lineCalc(l).total, 0);
    const unitMonthly = lineCalc(r.monthly).unit;
    const monthly = unitMonthly * qty;
    const reduction = Math.min(Math.max(num(r.reduction), 0), setup);
    const months = Math.max(num(r.reducedMonths, 12), 1);
    const setupC = r.planC.reduce((s, l) => s + lineCalc(l).total, 0);
    const y1 = monthly + reduction / months;
    return {
      qty, unitMonthly, monthly,
      A: { setup, first: monthly, upfront: setup + monthly, monthly },
      B: { setup: setup - reduction, first: y1, upfront: setup - reduction + y1, monthlyY1: y1, monthly, reduction, months },
      C: { setup: setupC, first: monthly, upfront: setupC + monthly, monthly }
    };
  }

  /* ---- Site layout plan: routes drawn on the layout image ----
     Points are fractions of the image width (x) and height (y); aspect = width / height. Distances are measured in image widths,
     and the scale (two points a known number of metres apart) turns them into metres. */
  function planUnit(scale, aspect) {
    if (!scale || !scale.a || !scale.b) return 0;
    const m = num(scale.m), asp = num(aspect, 1) || 1;
    const d = Math.hypot(num(scale.b.x) - num(scale.a.x), (num(scale.b.y) - num(scale.a.y)) / asp);
    return m > 0 && d > 0 ? m / d : 0;   // metres per image width
  }
  function routeLengthM(route, scale, aspect) {
    const u = planUnit(scale, aspect), asp = num(aspect, 1) || 1, p = (route && route.pts) || [];
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.hypot(num(p[i].x) - num(p[i - 1].x), (num(p[i].y) - num(p[i - 1].y)) / asp);
    return len * u;
  }
  function planLongestM(plan, aspect) {
    if (!plan || !plan.routes) return 0;
    return plan.routes.reduce((mx, r) => Math.max(mx, routeLengthM(r, plan.scale, aspect)), 0);
  }

  const API = { num, round, routeCycle, availCharge, availSwap, fleetSize, timeline, planUnit, routeLengthM, planLongestM, lineCalc, setLinePct, setLineMarkupAmt, setLinePrice, sumLines, applyTotalMarkup, purchaseLines, rentalPlans };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCCalc = API;
})(typeof window !== 'undefined' ? window : globalThis);
