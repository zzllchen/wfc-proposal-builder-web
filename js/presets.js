/* Starting points. blank() is an empty project. A sample project can register itself in WFCPresets.samples (the private copy has one; the website copy has none). */
(function (root) {
  'use strict';
  const I = () => root.WFC_IMG || {};

  function blank() {
    return {
      v: 2, brief: '', title: 'AMR Project', subtitle: 'Autonomous mobile robots for pallet transfer',
      client: { name: '', attn: '', address: '', date: new Date().toISOString().slice(0, 10), ref: '', logo: null },
      contact: Object.assign({}, root.WFCDB.contacts[0]),
      scenario: { shifts: 2, hoursPerShift: 8, stations: '', loadKg: '', tripsPerDay: '', rowsPerDay: '', minPallets: '', traffic: 'Low', transfer: '' },
      pallet: { type: '', L: '', W: '', H: '', kg: '' },
      site: { pickup: '', drop: '', dropSpots: '', legend: 'brand' },
      route: { distanceM: '', speedMps: 1.3, bufferPct: 20, dwellS: 0 },
      model: 'reeman-pj15',
      fleet: { runtimeH: 6.5, chargeH: 2, maxUtilPct: 80, peakFactor: 1.5, spareAmr: 0, strategy: 'charge', swapMin: 5, qtyOverride: '' },
      images: { layout: null, pallet1: null, pallet2: null, amr: null },
      // drawn on the layout image in the layout editor; coordinates are fractions of the image (0 to 1)
      layoutPlan: { scale: null, zones: [], points: [], routes: [], sync: true },
      captions: { pallet1: 'On site', pallet2: 'Reference pallet' },
      // how the tool worked out the solution (why this AMR, the requirement checks, what it assumed); set by "New from a brief"
      solution: null,
      workflow: {
        lines: 'Demand trigger | Call box trigger | Production line\nPackaging and load | Packaging | Production line loads the pallet\nPackaging and load | System dispatch | RCS assigns an AMR\nSmart transit | Autonomous retrieval | AMR collects the pallet\nSmart transit | Drop-off | At the allocated spots\nRelease and return | Cycle complete | AMR returns to standby or charging',
        note: 'People handle the call box and packaging. The AMR handles transit and drop-off.'
      },
      slides: { off: {} },
      // the Concept video tab: { ai: { src, poster, label, note, caption }, sim: { ... } }; a project without it shows an empty tab
      concept: null
    };
  }

  const P = { blank, samples: {}, defaultSample: null,
    make: name => { const f = P.samples[name] || (name === 'default' ? P.defaultSample : null); return f ? f() : blank(); } };
  root.WFCPresets = P;
})(window);
