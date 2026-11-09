/* WFC Proposal Builder: the pallet close-up. The user adds only the raw photo taken on site; this makes the clear, closer-up picture of the same
   pallet that goes next to it on the "Transport component" slide.
   Two ways, and the tool uses the best one available:
   1. AI picture (Google's Gemini image model, "Nano Banana"): a clean studio-style render of the pallet in the photo. Needs the user's own Google AI key
      (paid, about 15 sen a picture). The key stays in this browser. The photo is sent to Google only when this is used.
   2. Closer crop (Claude finds the pallet in the photo, then the tool crops closer and sharpens it): cheap, uses the Anthropic key, nothing is invented.
   WFCImageAI.closeup({ apiKey, model, photo }) -> { url, costRM } | cropCloser({ ai, apiKey, model, photo }) -> { url, costRM } | test({ apiKey, model }) */
(function (root) {
  'use strict';
  const BASE = 'https://generativelanguage.googleapis.com/v1beta/';
  const RM_PER_USD = 4.4;
  const MODELS = {
    'gemini-nano-banana-2.1': { label: 'Nano Banana 2.1 (recommended)', usd: 0.0336 },
    'gemini-3.1-flash-lite-image': { label: 'Nano Banana 2 Lite (cheapest)', usd: 0.0336 },
    'gemini-3-pro-image': { label: 'Nano Banana Pro (best detail)', usd: 0.134 }
  };
  const PROMPT = 'Create a clean studio product photograph of the exact pallet and load shown in this site photo. Keep the object identical: its shape, proportions, '
    + 'wood, metal corner brackets, strapping, labels, printed text and logos exactly as in the photo. Show it closer-up from a slightly raised three-quarter angle, '
    + 'filling most of the frame and centred, on a plain light grey-white seamless background with a soft natural shadow underneath. Remove the surroundings '
    + '(walls, floor markings, safety rails, other pallets). Sharp, evenly lit, realistic. Do not add text, objects or people.';

  /* ---------- pure helpers (tested) ---------- */
  // Finds the picture in a Gemini reply, whichever shape the reply has (generateContent, or the newer interactions format).
  function extractImage(j) {
    let found = null;
    (function walk(o) {
      if (found || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const mime = o.mimeType || o.mime_type || '', data = o.data;
      if (typeof data === 'string' && data.length > 500 && (/^image\//.test(mime) || o.type === 'image')) { found = `data:${/^image\//.test(mime) ? mime : 'image/png'};base64,${data}`; return; }
      Object.keys(o).forEach(k => walk(o[k]));
    })(j);
    return found;
  }
  function blockReason(j) {
    const pf = j && (j.promptFeedback || {}), c = j && j.candidates && j.candidates[0];
    if (pf.blockReason) return pf.blockReason;
    if (c && c.finishReason && !/^(STOP|MAX_TOKENS)$/.test(c.finishReason)) return c.finishReason;
    return '';
  }
  function explain(e) {
    const m = (e && e.message) || String(e), st = e && e.status;
    if (/api key not valid|API_KEY_INVALID/i.test(m) || st === 401) return 'Google rejected the key. Check that you pasted the whole key from Google AI Studio.';
    if (/free tier|billing|quota|RESOURCE_EXHAUSTED/i.test(m) || st === 429) return 'Google says this key has no billing or has run out of quota. These image models are paid only: turn on billing for the key in Google AI Studio.';
    if (st === 403 || /permission/i.test(m)) return 'This Google key is not allowed to use that image model. Pick another model or check the key in Google AI Studio.';
    if (/SAFETY|PROHIBITED|blocked/i.test(m)) return 'Google’s safety filter did not accept this photo. Try another photo.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Could not reach Google. Check the internet connection.';
    return m;
  }
  const costRM = model => ((MODELS[model] || { usd: 0.0336 }).usd) * RM_PER_USD;

  /* ---------- Google (browser only) ---------- */
  async function call(path, key, body, extra) {
    const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json', 'x-goog-api-key': key }, extra || {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || ('Google answered ' + r.status)); e.status = r.status; throw e; }
    return j;
  }
  // Free check: ask Google for the model's details. Proves the key works and the model name exists, and costs nothing.
  async function test(opt) {
    const model = opt.model || 'gemini-nano-banana-2.1', t0 = Date.now();
    await call('models/' + encodeURIComponent(model), opt.apiKey);
    return { ok: true, model, ms: Date.now() - t0, costRM: costRM(model) };
  }
  function parts(photo) { const m = /^data:([^;]+);base64,(.+)$/.exec(photo || ''); if (!m) throw new Error('The photo could not be read.'); return { mime: m[1], data: m[2] }; }
  function toImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('The picture could not be read.')); im.src = src; }); }
  async function shrink(url, maxW, quality) {   // keeps the project file small
    const im = await toImage(url), k = Math.min(1, maxW / im.naturalWidth), c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality || 0.9);
  }
  async function closeup(opt) {
    const model = opt.model || 'gemini-nano-banana-2.1', ph = parts(opt.photo);
    let j;
    try {
      j = await call(`models/${encodeURIComponent(model)}:generateContent`, opt.apiKey, {
        contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: ph.mime, data: ph.data } }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } }
      });
      if (!extractImage(j) && !blockReason(j)) throw Object.assign(new Error('no picture in the reply'), { status: 0 });
    } catch (e) {
      if (e.status === 401 || e.status === 403 || e.status === 429) throw e;
      // Google's newer "interactions" endpoint, in case this model is only offered there
      j = await call('interactions', opt.apiKey, { model, input: [{ type: 'text', text: PROMPT }, { type: 'image', mime_type: ph.mime, data: ph.data }] }, { 'Api-Revision': '2026-05-20' });
    }
    const url = extractImage(j);
    if (!url) { const why = blockReason(j); throw new Error(why ? 'Google did not accept this photo (' + why + ').' : 'Google answered without a picture. Try again, or use another photo.'); }
    return { url: await shrink(url, 1200, 0.9), costRM: costRM(model), by: 'AI picture' };
  }

  /* ---------- the closer crop (Claude finds the pallet, the browser crops and sharpens) ---------- */
  async function cropCloser(opt) {
    const AI = opt.ai, ph = parts(opt.photo), model = opt.model || 'claude-haiku-5-5';
    const c = await AI.client(opt.apiKey);
    const res = await c.messages.create({
      model, max_tokens: 2000, output_config: { effort: 'low' },   // room for the model's own thinking as well as the answer
      system: 'You find the main pallet (with its load or crate) in a warehouse photo. Reply with ONLY JSON: {"box":[x,y,w,h]} where x,y is the top-left corner and w,h the size of the smallest rectangle that contains the whole pallet and its load, as fractions of the picture (0 to 1, three decimals).',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: ph.mime, data: ph.data } }, { type: 'text', text: 'Where is the main pallet?' }] }]
    });
    const spent = AI.cost ? AI.cost(model, res.usage) : 0; if (AI.record) AI.record(spent);
    const o = AI.jsonOf((res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')), b = o && Array.isArray(o.box) ? o.box.map(Number) : null;
    if (!b || b.length < 4 || b.some(v => !Number.isFinite(v)) || !(b[2] > 0.02) || !(b[3] > 0.02)) throw new Error('Claude could not find the pallet in this photo.');
    const im = await toImage(opt.photo), W = im.naturalWidth, H = im.naturalHeight;
    const pad = 0.14, cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
    let w = Math.min(1, b[2] * (1 + 2 * pad)), h = Math.min(1, b[3] * (1 + 2 * pad));
    const ar = 456 / 540;                                   // the shape of the slide's picture frame
    if (w * W / (h * H) > ar) h = Math.min(1, w * W / ar / H); else w = Math.min(1, h * H * ar / W);
    const x0 = Math.max(0, Math.min(1 - w, cx - w / 2)), y0 = Math.max(0, Math.min(1 - h, cy - h / 2));
    const out = document.createElement('canvas'); out.width = Math.min(1100, Math.round(w * W)); out.height = Math.round(out.width * (h * H) / (w * W));
    const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.filter = 'contrast(1.07) saturate(1.06) brightness(1.03)';
    g.drawImage(im, x0 * W, y0 * H, w * W, h * H, 0, 0, out.width, out.height); g.filter = 'none';
    const d = g.getImageData(0, 0, out.width, out.height), s = new Uint8ClampedArray(d.data), K = 0.45, wd = out.width;   // gentle sharpen
    for (let y = 1; y < out.height - 1; y++) for (let x = 1; x < wd - 1; x++) for (let ch = 0; ch < 3; ch++) {
      const i = (y * wd + x) * 4 + ch;
      d.data[i] = s[i] * (1 + 4 * K) - K * (s[i - 4] + s[i + 4] + s[i - wd * 4] + s[i + wd * 4]);
    }
    g.putImageData(d, 0, 0);
    return { url: out.toDataURL('image/jpeg', 0.92), costRM: spent, by: 'Closer crop' };
  }

  /* ---------- clean background (Claude outlines the pallet, the browser cuts it out and stages it) ----------
     Uses only the Anthropic key and keeps the real photo, so the logos and labels stay exactly as shot. */
  const OUTLINE_SYSTEM = 'You outline objects precisely. You get one warehouse photo twice: clean, and with a pink grid labelled in steps of 0.1 (dotted lines in between are 0.05). '
    + 'Return ONLY JSON: {"outline":[[x,y],...]}: a closed polygon of 14 to 32 points, in order around the edge, that follows the visible outer edge of the main pallet together with its load (crate, box or wrapped goods). '
    + 'Include the whole pallet down to its feet and the crate lid up to its highest edge. Leave out the floor, floor markings, walls, safety rails, shadows and other pallets. '
    + 'Coordinates are fractions of the picture, x from 0 (left) to 1 (right) and y from 0 (top) to 1 (bottom), three decimals. Read positions from the grid copy and place points exactly on the edge.';
  // the outline from Claude's reply, checked: at least 4 points, inside the picture, covering a sensible part of it
  function parseOutline(o) {
    const arr = o && Array.isArray(o.outline) ? o.outline : null; if (!arr) return null;
    const pts = arr.map(p => Array.isArray(p) ? [+p[0], +p[1]] : (p && typeof p === 'object' ? [+p.x, +p.y] : null)).filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [Math.max(0, Math.min(1, p[0])), Math.max(0, Math.min(1, p[1]))]);
    if (pts.length < 4) return null;
    let a = 0; for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; }
    a = Math.abs(a) / 2;
    return a > 0.005 && a < 0.9 ? pts : null;
  }
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // The pallet cut out of the photo with a soft, colour-refined edge. Returns a canvas with transparency, or throws if the result is not believable.
  function cutout(im, poly) {
    const W0 = im.naturalWidth, H0 = im.naturalHeight, xs = poly.map(p => p[0] * W0), ys = poly.map(p => p[1] * H0);
    const mx = (Math.max(...xs) - Math.min(...xs)) * 0.10, my = (Math.max(...ys) - Math.min(...ys)) * 0.10;
    const bx0 = Math.max(0, Math.min(...xs) - mx), bx1 = Math.min(W0, Math.max(...xs) + mx), by0 = Math.max(0, Math.min(...ys) - my), by1 = Math.min(H0, Math.max(...ys) + my);
    const bw = bx1 - bx0, bh = by1 - by0, k = Math.min(1, 1100 / Math.max(bw, bh)), w = Math.round(bw * k), h = Math.round(bh * k);
    const cv = mkCanvas(w, h), g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, bx0, by0, bw, bh, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), px = img.data, N = w * h;
    // the polygon as a soft prior: 1 deep inside, 0 far outside, 0.5 on the line
    const mc = mkCanvas(w, h), mg = mc.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, w, h); mg.fillStyle = '#fff'; mg.beginPath();
    poly.forEach((p, i) => { const X = (p[0] * W0 - bx0) * k, Y = (p[1] * H0 - by0) * k; if (i) mg.lineTo(X, Y); else mg.moveTo(X, Y); }); mg.closePath(); mg.fill();
    const band = Math.max(4, Math.round(Math.max(w, h) * 0.025)), sc = mkCanvas(w, h), sg = sc.getContext('2d', { willReadFrequently: true }); sg.filter = `blur(${band}px)`; sg.drawImage(mc, 0, 0);
    const prior = sg.getImageData(0, 0, w, h).data;
    // colour models of the pallet and of its surroundings from the sure pixels (small k-means each)
    const fg = [], bgp = []; const step = Math.max(1, Math.floor(N / 9000));
    for (let i = 0; i < N; i += step) { const v = prior[i * 4] / 255; if (v > 0.93) fg.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]); else if (v < 0.07) bgp.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]); }
    if (fg.length < 60 || bgp.length < 60) throw new Error('The outline did not fit the photo.');
    const kmeans = (pts, K) => {
      let c = Array.from({ length: K }, (_, i) => pts[Math.floor((i + 0.5) * pts.length / K)].slice());
      for (let it = 0; it < 7; it++) {
        const s = c.map(() => [0, 0, 0, 0]);
        pts.forEach(p => { let b = 0, bd = 1e9; for (let j = 0; j < K; j++) { const d = (p[0] - c[j][0]) ** 2 + (p[1] - c[j][1]) ** 2 + (p[2] - c[j][2]) ** 2; if (d < bd) { bd = d; b = j; } } s[b][0] += p[0]; s[b][1] += p[1]; s[b][2] += p[2]; s[b][3]++; });
        c = c.map((q, j) => s[j][3] ? [s[j][0] / s[j][3], s[j][1] / s[j][3], s[j][2] / s[j][3]] : q);
      }
      return c;
    };
    const cf = kmeans(fg, 6), cb = kmeans(bgp, 8), near = (r, g2, b, cs) => { let m = 1e9; for (const q of cs) { const d = (r - q[0]) ** 2 + (g2 - q[1]) ** 2 + (b - q[2]) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // 1) a rough alpha from the colour models, held near the outline by the prior
    let al = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = prior[i * 4] / 255;
      if (v > 0.93) al[i] = 1; else if (v < 0.07) al[i] = 0;
      else { const dF = near(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], cf), dB = near(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], cb); al[i] = smooth(0.4, 0.6, 0.45 * (dB / (dF + dB + 1e-3)) + 0.55 * v); }
    }
    // 2) round off the edge: blur the alpha, then sharpen it again (removes speckle and jaggies, keeps a clean curve)
    const boxBlur = (a, r) => {
      const t = new Float32Array(N), o = new Float32Array(N), n = 2 * r + 1;
      for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[y * w + x] = s / n; s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
      return o;
    };
    const rr = Math.max(2, Math.round(Math.max(w, h) * 0.0045));
    al = boxBlur(boxBlur(al, rr), rr); for (let i = 0; i < N; i++) al[i] = smooth(0.42, 0.58, al[i]);
    // 3) keep only the biggest piece (drops stray bits of wall or floor)
    const lab = new Int32Array(N); let best = 0, bestN = 0, id = 0; const stack = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (al[s0] < 0.5 || lab[s0]) continue; id++; let cnt = 0; stack.push(s0); lab[s0] = id;
      while (stack.length) { const q = stack.pop(); cnt++; const x = q % w, y = (q - x) / w;
        if (x > 0 && !lab[q - 1] && al[q - 1] >= 0.5) { lab[q - 1] = id; stack.push(q - 1); } if (x < w - 1 && !lab[q + 1] && al[q + 1] >= 0.5) { lab[q + 1] = id; stack.push(q + 1); }
        if (y > 0 && !lab[q - w] && al[q - w] >= 0.5) { lab[q - w] = id; stack.push(q - w); } if (y < h - 1 && !lab[q + w] && al[q + w] >= 0.5) { lab[q + w] = id; stack.push(q + w); } }
      if (cnt > bestN) { bestN = cnt; best = id; }
    }
    let covered = 0;
    for (let i = 0; i < N; i++) { const keep = lab[i] === best || (al[i] > 0 && al[i] < 0.5); const a = keep ? al[i] : 0; px[i * 4 + 3] = Math.round(a * 255); covered += a; }
    if (covered / N < 0.06 || covered / N > 0.92) throw new Error('The cut-out did not look right.');
    g.putImageData(img, 0, 0);
    const out = mkCanvas(w, h), og = out.getContext('2d'); og.filter = 'blur(0.7px)'; og.drawImage(cv, 0, 0);   // soft, anti-aliased edge
    // trim to the pallet
    const od = og.getImageData(0, 0, w, h).data; let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (od[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const tw = x1 - x0 + 1, th = y1 - y0 + 1, trim = mkCanvas(tw, th); trim.getContext('2d').drawImage(out, x0, y0, tw, th, 0, 0, tw, th);
    return trim;
  }

  // The staged picture, in the shape of the slide's frame (456 x 540): soft studio backdrop, a gentle light behind, contact and ground shadows, a faint floor reflection.
  function stage(cut) {
    const W = 1000, H = 1184, c = mkCanvas(W, H), g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, '#FAFBFE'); lg.addColorStop(0.55, '#EFF2F9'); lg.addColorStop(1, '#DDE4F0'); g.fillStyle = lg; g.fillRect(0, 0, W, H);
    const rg = g.createRadialGradient(W * 0.5, H * 0.44, 30, W * 0.5, H * 0.44, W * 0.7); rg.addColorStop(0, 'rgba(255,255,255,.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    const fl = g.createLinearGradient(0, H * 0.7, 0, H); fl.addColorStop(0, 'rgba(206,215,232,0)'); fl.addColorStop(1, 'rgba(206,215,232,.55)'); g.fillStyle = fl; g.fillRect(0, H * 0.7, W, H * 0.3);   // the floor, a little deeper
    const cw = cut.width, ch = cut.height, s = Math.min(W * 0.82 / cw, H * 0.55 / ch), dw = cw * s, dh = ch * s, x = (W - dw) / 2, base = H * 0.73, y = base - dh;
    // the pallet's footprint: the lowest solid point of each column, so the shadows hug its real base
    const bd = cut.getContext('2d').getImageData(0, 0, cw, ch).data, foot = [];
    for (let cx = 0; cx < cw; cx += 3) { let yb = -1; for (let yy = ch - 1; yy >= 0; yy--) if (bd[(yy * cw + cx) * 4 + 3] > 110) { yb = yy; break; } if (yb >= 0) foot.push([x + cx * s, y + yb * s]); }
    const shade = (up, down, dx, blur, alpha) => {
      if (foot.length < 2) return;
      g.save(); g.globalAlpha = alpha; g.filter = `blur(${blur}px)`; g.fillStyle = '#0B1220'; g.beginPath();
      foot.forEach((p, i) => { const X = p[0] + dx, Y = p[1] - up; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
      for (let i = foot.length - 1; i >= 0; i--) g.lineTo(foot[i][0] + dx * 1.6, foot[i][1] + down);
      g.closePath(); g.fill(); g.restore();
    };
    shade(dh * 0.02, dh * 0.13, dw * 0.07, 38, 0.36);   // wide, soft ground shadow, a little to the right
    shade(dh * 0.02, dh * 0.05, dw * 0.03, 14, 0.46);    // closer shadow
    shade(dh * 0.015, dh * 0.012, 0, 3.5, 0.62);          // the dark contact line where it touches the floor
    g.save(); g.filter = 'contrast(1.07) saturate(1.1) brightness(1.04)'; g.drawImage(cut, x, y, dw, dh); g.restore();                                // the pallet, a touch crisper and warmer
    const vg = g.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.5, H * 0.78); vg.addColorStop(0, 'rgba(11,18,32,0)'); vg.addColorStop(1, 'rgba(11,18,32,.09)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }

  async function cleanBackground(opt) {
    const AI = opt.ai, P = root.WFCPlanAI, model = opt.model || 'claude-opus-5-5', c = await AI.client(opt.apiKey), pic = await P.pictures(opt.photo);
    const img = d => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d } });
    const res = await c.messages.create({ model, max_tokens: 8000, output_config: { effort: 'low' }, system: OUTLINE_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Picture 1: clean.' }, img(pic.clean), { type: 'text', text: 'Picture 2: with the grid.' }, img(pic.grid), { type: 'text', text: 'Outline the main pallet and its load.' }] }] });
    const spent = AI.cost(model, res.usage); AI.record(spent);
    const poly = parseOutline(AI.jsonOf((res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')));
    if (!poly) throw new Error('Claude could not outline the pallet in this photo.');
    const im = await toImage(opt.photo), cut = cutout(im, poly), out = stage(cut);
    return { url: out.toDataURL('image/jpeg', 0.93), costRM: spent, by: 'Clean background', outline: poly };
  }

  const API = { MODELS, PROMPT, extractImage, blockReason, explain, costRM, test, closeup, cropCloser, cleanBackground, parseOutline, cutout, stage, shrink };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WFCImageAI = API;
})(typeof window !== 'undefined' ? window : globalThis);
