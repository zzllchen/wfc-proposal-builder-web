/* WFC Proposal Builder: the Concept video tab. Plays the 3D concept film of the proposed AMR at the client's site (made with an AI video tool from a photo of
   the AMR, so it is mood footage, not to scale) and the exact recording of the Simulation tab (the layout, the stated speed and cycle times). A project can name
   its own videos in S.concept = { ai: { src, poster, note, caption }, sim: { ... } }; a sample project can supply its own. "Play another video…" shows any video
   file from this PC. */
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  let S = null, which = 'ai', picked = null;
  const sources = s => { const c = s && s.concept; if (c && (c.ai || c.sim)) return c; const f = root.WFCSampleConcept; return f && f.match((s && s.client && s.client.name) || '') ? f.files : null; };

  function draw() {
    const src = sources(S), v = $('#cvVideo'), has = picked || (src && (src.ai || src.sim));
    $('#cvStage').hidden = !has; $('#cvEmpty').hidden = !!has; $('#cvCaption').hidden = !has;
    $('#cvSwitch').hidden = !src || !!picked;
    if (!has) return;
    if (picked) { if (v.dataset.src !== 'picked') { v.dataset.src = 'picked'; v.removeAttribute('poster'); v.src = picked.url; } $('#cvNote').textContent = picked.name; $('#cvCaption').textContent = ''; return; }
    if (!src[which]) which = src.ai ? 'ai' : 'sim';
    const c = src[which];
    document.querySelectorAll('#cvSwitch button').forEach(b => { b.classList.toggle('active', b.dataset.v === which); b.hidden = !src[b.dataset.v]; });
    if (v.dataset.src !== c.src) { v.dataset.src = c.src; if (c.poster) v.poster = c.poster; else v.removeAttribute('poster'); v.src = c.src; v.load(); }
    $('#cvNote').textContent = c.note || ''; $('#cvCaption').textContent = c.caption || '';
  }
  function init() {
    if (init.done) return; init.done = true;
    $('#cvSwitch').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.hidden) return; which = b.dataset.v; picked = null; draw(); });
    $('#cvOpen').addEventListener('click', () => $('#cvFile').click());
    $('#cvFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (picked) URL.revokeObjectURL(picked.url); picked = { url: URL.createObjectURL(f), name: f.name }; $('#cvVideo').dataset.src = ''; draw(); e.target.value = ''; });
    $('#cvVideo').addEventListener('error', () => { const n = $('#cvNote'); if (n) n.textContent = 'This video file was not found. Use “Play another video…”.'; });
  }
  root.WFCConcept = { update: s => { S = s; init(); draw(); }, stop: () => { const v = $('#cvVideo'); if (v && !v.paused) v.pause(); } };
})(window);
