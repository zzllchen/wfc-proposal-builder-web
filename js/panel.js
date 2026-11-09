/* WFC Proposal Builder: the form panel on the left can be made wider or narrower (drag the divider; double-click it to go back to the usual width) and closed
   (the little arrow on the divider, or Ctrl+B) so the slide, the layout and the simulation get the whole screen. The choice is remembered on this PC. */
(function () {
  'use strict';
  const KEY = 'wfc-proposal-panel', MIN = 260, $ = s => document.querySelector(s);
  let w = 0, open = true, app, bar, btn;                    // w: 0 = the usual width (it follows the window), else pixels
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); if (o.w > 0) w = o.w; if (o.open === false) open = false; } catch (e) { /* first visit */ }
  const maxW = () => Math.max(MIN, Math.min(720, window.innerWidth - 340));      // the slide area always keeps room
  const clampW = v => Math.max(MIN, Math.min(maxW(), Math.round(v)));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ w, open })); } catch (e) { /* private mode */ } };

  function apply() {
    app.classList.toggle('side-closed', !open);
    if (!open) app.style.setProperty('--side-w', '0px');
    else if (w) app.style.setProperty('--side-w', clampW(w) + 'px');
    else app.style.removeProperty('--side-w');
    btn.setAttribute('aria-label', open ? 'Hide the form panel' : 'Show the form panel');
    btn.title = (open ? 'Hide the form panel' : 'Show the form panel') + ' (Ctrl+B)';
    bar.setAttribute('aria-valuenow', String(open ? Math.round($('#side').getBoundingClientRect().width) : 0));
    bar.title = open ? 'Drag to change the width. Double-click to reset.' : '';
  }
  const setOpen = v => { open = v; save(); apply(); };

  function init() {
    app = $('#app'); if (!app || !$('#side')) return;
    bar = document.createElement('div');
    bar.id = 'splitter'; bar.setAttribute('role', 'separator'); bar.setAttribute('aria-orientation', 'vertical'); bar.setAttribute('aria-label', 'Form panel width'); bar.tabIndex = 0; bar.setAttribute('aria-valuemin', String(MIN));
    bar.innerHTML = '<button type="button" class="sbtn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>';
    app.appendChild(bar); btn = bar.querySelector('.sbtn');
    btn.addEventListener('click', () => setOpen(!open));
    // drag the divider
    let dragging = false;
    bar.addEventListener('pointerdown', e => { if (!open || e.button !== 0 || e.target.closest('.sbtn')) return; dragging = true; bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); document.body.classList.add('resizing'); e.preventDefault(); });
    bar.addEventListener('pointermove', e => { if (!dragging) return; w = clampW(e.clientX - app.getBoundingClientRect().left); apply(); });
    const stop = () => { if (!dragging) return; dragging = false; bar.classList.remove('drag'); document.body.classList.remove('resizing'); save(); };
    bar.addEventListener('pointerup', stop); bar.addEventListener('pointercancel', stop);
    bar.addEventListener('dblclick', e => { if (e.target.closest('.sbtn') || !open) return; w = 0; save(); apply(); });
    // the keyboard: arrows change the width, Enter or Space close and open it, Home resets
    bar.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (!open) return; w = clampW($('#side').getBoundingClientRect().width + (e.key === 'ArrowRight' ? 24 : -24)); save(); apply(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { setOpen(!open); e.preventDefault(); }
      else if (e.key === 'Home' && open) { w = 0; save(); apply(); e.preventDefault(); }
    });
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== 'b') return;
      const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      setOpen(!open); e.preventDefault();
    });
    window.addEventListener('resize', () => { if (open && w) apply(); });
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
