/* WFC Proposal Builder: the interface around the form and the preview on phones and tablets (up to 900px wide).
   There is room for one pane at a time, so the bar at the bottom switches between Details (the form) and Preview (slides, simulation, video).
   Nothing here changes a proposal; it only shows and hides the two panes. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const narrow = window.matchMedia('(max-width: 900px)');

  function setPane(p) {
    document.body.dataset.pane = p;
    document.querySelectorAll('#mobileNav [data-pane]').forEach(b => { const on = b.dataset.pane === p; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (p === 'preview' && window.WFCApp) requestAnimationFrame(() => WFCApp.flush());   // the slide is sized to the space it has, which was zero while hidden
  }

  function init() {
    const nav = $('#mobileNav'); if (!nav) return;
    nav.addEventListener('click', e => { const b = e.target.closest('[data-pane]'); if (b) setPane(b.dataset.pane); });
    // things that only make sense with the preview showing switch to it by themselves on a small screen
    document.addEventListener('click', e => {
      if (!narrow.matches) return;
      const t = e.target;
      if (t.closest('#tabs [data-tab]:not(:disabled)')) { setPane(t.closest('[data-tab]').dataset.tab === 'proposal' ? document.body.dataset.pane : 'preview'); return; }
      if (t.closest('#side [data-editor]')) setPane('preview');
    }, true);
    setPane(document.body.dataset.pane || 'form');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.WFCShell = { setPane };
})();
