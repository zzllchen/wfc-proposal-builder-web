/* WFC Proposal Builder: Claude reads photos. Two small jobs, both only when Claude is connected and the AI mode is not "Built-in only":
   1. A photo of a brief (notes, a spec sheet, handwriting) is typed out as text for the description box. Word, PDF and text files are not sent to Claude.
   2. A quick look at the pallet photo: what kind of pallet, wrapped or not, anything readable on it. It adds "please check" lines and may fill the
      pallet type when that is still blank. It NEVER estimates a length, width, height or weight from a picture: those stay for a person to fill in.
   WFCPhotoAI.readBrief({ ai, apiKey, model, photo }) -> { text, blurry, notes, costRM }
   WFCPhotoAI.lookPallet({ ai, apiKey, model, photo }) -> { type, wrapped, load, labels, quality, notes, costRM }
   WFCPhotoAI.applyLooks(state, looks) -> { notes[], filledType }          (parsers and apply are plain functions, tested without a browser) */
(function (root) {
  'use strict';
  const BRIEF_SYSTEM = 'You read a photo of a document or notes (a brief, a specification sheet, handwriting) and type out its text. Keep the reading order. Keep every number and unit exactly as written. '
    + 'Mark any part you cannot read as "[unreadable]". Never guess and never invent. Return ONLY JSON: {"blurry": true or false, "text": "...", "notes": "one short sentence, or empty"}. '
    + 'If the photo is too blurry or too dark to read, set "blurry": true and leave "text" empty.';
  const PALLET_SYSTEM = 'You look at a photo of a pallet and its load in a warehouse or factory. Return ONLY JSON: '
    + '{"type": "wooden" or "plastic" or "metal" or "other", "wrapped": true or false, "load": "short description, at most 8 words", "labels": ["any code or text you can read clearly, at most 3"], '
    + '"quality": "ok" or "blurry" or "dark", "notes": "one short sentence, or empty"}. Never estimate sizes or weights. Do not guess text you cannot read.';
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
  const bool = v => v === true || /^(true|yes)$/i.test(String(v));

  /* ---------- parsers ---------- */
  function parseBrief(o) {
    if (!o || typeof o !== 'object') return null;
    const text = String(o.text == null ? '' : o.text).replace(/\r/g, '').trim().slice(0, 20000);
    return { text, blurry: bool(o.blurry), notes: str(o.notes, 160) };
  }
  function parsePallet(o) {
    if (!o || typeof o !== 'object') return null;
    const type = /^(wooden|plastic|metal|other)$/i.test(o.type) ? String(o.type).toLowerCase() : 'other';
    const quality = /^(ok|blurry|dark)$/i.test(o.quality) ? String(o.quality).toLowerCase() : 'ok';
    const labels = (Array.isArray(o.labels) ? o.labels : []).map(l => str(l, 40)).filter(Boolean).slice(0, 3);
    return { type, wrapped: bool(o.wrapped), load: str(o.load, 60), labels, quality, notes: str(o.notes, 160) };   // nothing else is ever taken: no sizes, no weights
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // a readable code on the photo (like PALLET-WOOD-001) is the best pallet type; otherwise a plain description
  function palletTypeFrom(look) {
    const code = (look.labels || []).find(l => /^[A-Z0-9][A-Z0-9 ._/-]{3,}$/.test(l) && /[0-9]/.test(l) && /[A-Z]/.test(l));
    return code || (look.type === 'other' ? 'Pallet' : cap(look.type) + ' pallet');
  }
  function lookNotes(look, i, n) {
    const tag = n > 1 ? `Pallet photo ${i + 1}` : 'Pallet photo', out = [];
    if (look.quality === 'blurry' || look.quality === 'dark') out.push(`${tag} is ${look.quality}: do not rely on it for sizes.`);
    const bits = [look.type === 'other' ? '' : look.type + ' pallet', look.wrapped ? 'shrink-wrapped' : '', look.load].filter(Boolean).join(', ');
    if (bits || look.labels.length) out.push(`${tag}: ${bits || 'pallet'}${look.labels.length ? `; label reads ${look.labels.join(', ')}` : ''}. Please check.`);
    if (look.notes) out.push(`${tag}: ${look.notes}`);
    return out;
  }
  // Fills only what a picture can honestly tell: the pallet type, and only when it is still blank. Sizes and weight are never touched.
  function applyLooks(S, looks) {
    const good = (looks || []).filter(l => l && !l.err), notes = []; let filled = false;
    good.forEach((l, i) => { lookNotes(l, i, good.length).forEach(n => notes.push(n)); });
    if (good.length && !String((S.pallet && S.pallet.type) || '').trim()) {
      S.pallet = S.pallet || {}; S.pallet.type = palletTypeFrom(good[0]); filled = true; notes.push('The pallet type was taken from the photo. Please check it.');
    }
    return { notes, filled };
  }
  // why a photo cannot be read now ('' when it can)
  const unavailable = (mode, claude) => !claude ? 'Connect Claude to read photos.' : mode === 'builtin' ? 'Turn on Balanced AI to read photos.' : '';

  /* ---------- the calls (Claude, with the photo) ---------- */
  async function ask(opt, system, question) {
    const AI = opt.ai, m = /^data:([^;]+);base64,(.+)$/.exec(opt.photo || '');
    if (!m) throw new Error('The photo could not be read.');
    const c = await AI.client(opt.apiKey), model = opt.model || 'claude-sonnet-5-5';
    const body = { model, max_tokens: 4000, output_config: { effort: 'low' }, system,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: question }] }] };
    let res;
    try { res = await c.messages.create(body); }
    catch (e) { if (e && e.status === 400 && /effort|output_config/i.test(e.message || '')) { delete body.output_config; res = await c.messages.create(body); } else throw e; }
    const costRM = AI.cost(model, res.usage); AI.record(costRM);   // counted even if the answer is unusable: it was billed
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to read this photo.');
    const json = AI.jsonOf((res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n'));
    if (!json) throw new Error('Claude answered, but not in a form the tool could read.');
    return { json, costRM };
  }
  async function readBrief(opt) {
    const r = await ask(opt, BRIEF_SYSTEM, 'Type out the text in this photo.'), p = parseBrief(r.json);
    if (!p) throw new Error('Claude answered, but not in a form the tool could read.');
    return Object.assign(p, { costRM: r.costRM });
  }
  async function lookPallet(opt) {
    const r = await ask(opt, PALLET_SYSTEM, 'Describe the pallet in this photo.'), p = parsePallet(r.json);
    if (!p) throw new Error('Claude answered, but not in a form the tool could read.');
    return Object.assign(p, { costRM: r.costRM });
  }

  const API = { parseBrief, parsePallet, palletTypeFrom, lookNotes, applyLooks, unavailable, readBrief, lookPallet };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCPhotoAI = API;
})(typeof window !== 'undefined' ? window : globalThis);
