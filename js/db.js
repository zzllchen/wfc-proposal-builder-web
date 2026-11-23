/* AMR models from AMR_Selector_Tool_v2 (prices, aisle, turning, WiFi, RCS rules) plus the 2026 catalog (speed, battery, safety).
   Prices here are a relative price index, not real prices (the private copy has the real ones). Edit here to add a model; "img" is a key of WFC_IMG or null. */
window.WFCDB = {
  company: {
    name: 'WFC Systems', tagline: 'Where Flow Connects.', web: 'www.wfcsystems.com',
    legal: 'WFC Systems Sdn. Bhd.', regNo: '1632508H',   // the registered company (the quotation header and signature use it; the proposal says WFC Systems)
    address: 'SK 1 Residensi, G11, Jalan PSK 4, Pusat Perdagangan Seri Kembangan, 43300 Seri Kembangan, Selangor'
  },
  // The people who can be named as the WFC contact on a proposal (picked from a dropdown; phone and email follow the name).
  contacts: [
    { name: 'Edward Chin', phone: '+60 12-328 1852', email: 'edward.wfcsystems@gmail.com' },
    { name: 'Jimmy Ewe', phone: '+60 12-392 1852', email: 'jimmy.wfcsystems@gmail.com' }
  ],
  defaults: { customisation: 3.75, delivery: 2.5, installation: 3.125, taxPct: 10 },
  /* quote:start */
  // the Quotation tab's starting prices (RM), from the real rental quotation; every one is editable in the tab. The site charges (customisation, delivery, installation, door, call box, WiFi, server) differ every time, so they start blank; prefill: true would start them from these figures
  quote: { markup: 0, prefill: false, routeChange: 0.5, rent: { 'reeman-pj15': 1.125 }, setup: { install: 3.0, rcs: 4.5, door: 1.5, callbox: 1.0, wifi: 3.75, server: 5.0 } },
  /* quote:end */
  models: [
    { id: 'reeman-pj15', name: '1.5T Pallet Jack AMR', type: 'Pallet Jack AMR', supplier: 'Reeman', payloadKg: 1500, liftMm: 205, hole: 'Normal', shape: 'Open', aisleM: 2.2, turnM: 1.365, outdoor: false, floor: 'Cement, Epoxy', wifi: false, unitPrice: 9.925, rcsUnit: 7.05, rcsAtQty1: false, img: 'amr-pj15', nav: 'Laser SLAM', speed: '1.0 / 1.5 m/s (laden / empty)', battery: '48 V / 30 Ah', safety: '5 m LiDAR and safe-touch edge', accuracy: '±100 mm' },
    { id: 'reeman-rt12', name: '1.2T Reach Truck AMR', type: 'Reach Truck AMR', supplier: 'Reeman', payloadKg: 1200, liftMm: 2500, hole: 'Normal', shape: 'Open, Closed', aisleM: 2.2, turnM: 2.0, outdoor: true, floor: 'Cement, Epoxy, Uneven', wifi: false, unitPrice: 12.975, rcsUnit: 7.05, rcsAtQty1: false, img: 'amr-rt12', nav: 'Laser SLAM', speed: '0.33 / 0.42 m/s (laden / empty)', battery: '48 V / 100 Ah', safety: '5 m LiDAR and front collision edge', accuracy: '±100 mm' },
    { id: 'lz-pj2', name: '2T Pallet Jack AMR', type: 'Pallet Jack AMR', supplier: 'LZ', payloadKg: 2000, liftMm: 210, hole: 'Normal, Narrow, Wide', shape: 'Open, Closed', aisleM: 1.4, turnM: 1.8, outdoor: true, floor: 'Cement, Epoxy, Uneven', wifi: true, unitPrice: 12.0, rcsUnit: 4.25, rcsAtQty1: true, img: 'amr-pj2', nav: 'Laser SLAM', speed: '0.97 / 1.11 m/s (laden / empty)', battery: '25.6 V / 60 Ah', safety: '5 m LiDAR and front collision edge', accuracy: '±100 mm' },
    { id: 'lz-rt2', name: '2T Reach Truck AMR', type: 'Reach Truck AMR', supplier: 'LZ', payloadKg: 2000, liftMm: 3000, hole: 'Normal, Narrow, Wide', shape: 'Open, Closed', aisleM: 1.5, turnM: 2.0, outdoor: true, floor: 'Cement, Epoxy, Uneven', wifi: true, unitPrice: 18.125, rcsUnit: 4.25, rcsAtQty1: true, img: 'amr-rt2', nav: 'Laser SLAM', speed: '1.11 / 1.25 m/s (laden / empty)', battery: '25.6 V / 202 Ah', safety: '5 m LiDAR and front collision edge', accuracy: '±100 mm' },
    { id: 'lz-fl3', name: '3T Forklift AMR', type: 'Forklift AMR', supplier: 'LZ', payloadKg: 3000, liftMm: 3700, hole: 'Normal, Narrow, Wide', shape: 'Open, Closed', aisleM: 2.1, turnM: 2.6, outdoor: true, floor: 'Cement, Epoxy, Uneven', wifi: true, unitPrice: 53.0, rcsUnit: 4.25, rcsAtQty1: true, img: null, nav: 'Laser SLAM' },
    { id: 'ep-pj15', name: '1.5T Pallet Jack AMR (EP)', type: 'Pallet Jack AMR', supplier: 'EP', payloadKg: 1500, liftMm: 110, hole: 'Normal', shape: 'Open', aisleM: 2.08, turnM: 1.495, outdoor: false, floor: 'Cement, Epoxy', wifi: true, unitPrice: 14.925, rcsUnit: 2.525, rcsAtQty1: false, img: null, nav: 'Laser SLAM' }
  ]
};
