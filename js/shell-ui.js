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

  // the bar of open proposals can be hidden for more room; the choice is remembered on this PC
  const DOCS_KEY = 'wfc-proposal-docs-closed';
  function docsName() { const n = $('#docTabs .doctab.active .dn'), l = $('#docsShowName'); if (l) l.textContent = (n && n.textContent.trim()) || 'Proposals'; }
  function setDocs(open) {
    const app = $('#app'); if (!app) return;
    app.classList.toggle('docs-closed', !open); const show = $('#docsShow'); if (show) show.hidden = open;
    try { localStorage.setItem(DOCS_KEY, open ? '0' : '1'); } catch (e) { /* private mode */ }
    docsName(); requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); if (window.WFCApp) WFCApp.flush(); });   // the slide and the simulation take the room
  }
  function initDocs() {
    let closed = false; try { closed = localStorage.getItem(DOCS_KEY) === '1'; } catch (e) { /* first visit */ }
    const hide = $('#docsHide'), show = $('#docsShow'), tabs = $('#docTabs');
    if (hide) hide.addEventListener('click', () => setDocs(false));
    if (show) show.addEventListener('click', () => setDocs(true));
    document.addEventListener('click', e => { const b = e.target.closest('#fileMenu [data-act="new"]'); if (!b) return; const f = $('#fileMenu'); if (f) f.open = false; setDocs(true); const m = $('#newMenu'); if (m) m.open = true; });
    if (tabs && window.MutationObserver) new MutationObserver(docsName).observe(tabs, { childList: true, subtree: true, characterData: true });
    setDocs(!closed);
  }

  function init() {
    initDocs();
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
