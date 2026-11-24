// Pennant Maker UI: modes (auto / guided / manual / bulk), live preview, export.
(function (PM) {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const deepMerge = (base, over) => {
    for (const k of Object.keys(over || {})) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') deepMerge(base[k], over[k]);
      else base[k] = over[k];
    }
    return base;
  };

  const st = {
    d: PM.defaultDesign(), mode: 'auto', view: 'flat', sel: null, ph: true,
    undo: [], redo: [], lastSnap: 0, step: 0,
    leagues: ['nfl', 'mlb', 'nba', 'nhl', 'cfb', 'cbase', 'epl', 'efl'],
    results: [], lastTeam: null, bulkFiles: [], bulkOut: null,
    era: { on: false, year: 1985, useName: true },
  };
  PM.ui = st;
  st.banner = st.banner || { kicker: '', title: 'CHAMPIONS', years: '' };
  st.autoTplB = st.autoTplB || 'bannerRafter';
  const isB = () => PM.isBanner(st.d);
  const isP = () => PM.isPoster(st.d);      // posters and cards (paper with a photo)
  const isC = () => PM.isCard(st.d);
  const isSched = () => st.d.template === 'posterSchedule';
  const isGame = () => st.d.template === 'posterGameDay';
  const SCHED_NAMES = { line2: 'Team name', line1: 'Season line', extra: 'Footer note', mark: 'Team logo', stamps: 'Corner logos', field: 'Background & schedule' };
  const GAME_NAMES = { line2: 'Headline', line1: 'Date & time', extra: 'Place', mark: 'Team logo', stamps: 'Corner logos', field: 'Background & photo' };
  const CARD_NAMES = { line2: 'Name', line1: 'Position', extra: 'Team name', mark: 'Team logo', stamps: 'League logo', maker: 'Set logo', field: 'Border & photo' };
  st.poster = st.poster || { player: '', signature: '', caption: '' };
  // what each part is called on a poster
  const POSTER_NAMES = { line2: 'Name', line1: 'Caption', extra: 'Signature', mark: 'Team logo', stamps: 'Corner logos', maker: "Maker's mark", field: 'Paper / frame & photo' };
  // Photos are shrunk to a sensible size (long side 2000 px, JPEG) so designs stay quick to save and undo.
  const shrinkPhoto = (src) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), hh = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, hh); x.drawImage(img, 0, 0, w, hh);
      let data = src; try { data = c.toDataURL('image/jpeg', 0.88); } catch {}
      res({ data, ar: w / hh });
    };
    img.onerror = () => res({ data: src, ar: 1.5 });
    img.src = src;
  });
  async function setPhoto(src) {
    if (!src) { snapshot(true); st.d.pst.photo = null; st.d.pst.photoAR = 0; buildPanel(); queueRender(); return; }
    const r = await shrinkPhoto(src);
    snapshot(true); Object.assign(st.d.pst, { photo: r.data, photoAR: r.ar, zoom: 1, fx: 0.5, fy: 0.5 });
    buildPanel(); queueRender(); toast('Photo added. Zoom and slide it under Photo.', 2600);
  }
  function cPhoto() {
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', () => { const f = file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setPhoto(r.result); r.readAsDataURL(f); file.value = ''; });
    const p = st.d.pst || {};
    const thumb = h('div', { class: 'photo-thumb', title: 'Drop a photo here' }, p.photo ? h('img', { src: p.photo, alt: '' }) : 'no photo');
    const box = h('div', { class: 'img-slot' }, thumb, h('div', { class: 'btns' },
      h('button', { class: 'primary', onclick: () => file.click() }, p.photo ? 'Replace photo' : 'Upload photo'),
      p.photo ? h('button', { onclick: () => setPhoto(null) }, 'Remove') : null), file);
    dropTarget(box, 'photo');
    return box;
  }
  const TW = () => (PM.TEMPLATES[st.d.template] || PM.TEMPLATES.classic).W, TH = () => (PM.TEMPLATES[st.d.template] || PM.TEMPLATES.classic).H;

  // ---------- state helpers ----------
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), st.d);
  const set = (path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], st.d)[last] = v; };
  function snapshot(force) {
    const now = Date.now();
    if (force || now - st.lastSnap > 600) { st.undo.push(JSON.stringify(st.d)); if (st.undo.length > 100) st.undo.shift(); st.redo = []; }
    st.lastSnap = now; updUndo();
  }
  const HEX = /^#[0-9a-f]{6}$/i;
  const LAYER_OF = (root) => (['stripes', 'hoops', 'hockey'].includes(root) ? 'pattern' : root);
  // Replace every color equal to `from` with `to` inside an object (used by color links).
  function swapColor(o, from, to) {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string' && HEX.test(v) && v.toLowerCase() === from.toLowerCase()) o[k] = to;
      else if (v && typeof v === 'object') swapColor(v, from, to);
    }
  }
  // Other layers in the same link group ('move' or 'color'), excluding `k`.
  const linked = (k, kind) => {
    const g = PM.layer(st.d, k)[kind];
    if (!g) return [];
    return PM.LAYERS_ALL.map(([key]) => key).filter((key) => key !== k && PM.layer(st.d, key)[kind] === g);
  };
  function change(path, v) {
    snapshot();
    const old = get(path);
    set(path, v);
    const [root, prop] = path.split('.');
    // movement link: moving one layer moves its group (locked layers stay put)
    if ((prop === 'x' || prop === 'y') && path.split('.').length === 2 && PM.LAYER_KEYS.includes(root) && typeof old === 'number') {
      const dv = v - old;
      for (const k of linked(root, 'move')) if (PM.LAYER_KEYS.includes(k) && !PM.isLocked(st.d, k)) st.d[k][prop] += dv;
      if (dv) syncInputs();
    }
    // color link: a color change also changes the same color on linked layers
    // (skipped when the edited part is switched off, e.g. a hidden ring: nothing visible changed here,
    //  so it must not recolor other layers)
    const parent = path.split('.').slice(0, -1).reduce((o, k) => (o == null ? o : o[k]), st.d);
    const partOff = parent && typeof parent === 'object' && parent.on === false;
    if (!partOff && typeof v === 'string' && HEX.test(v) && typeof old === 'string' && HEX.test(old) && old.toLowerCase() !== v.toLowerCase()) {
      const before = JSON.stringify(st.d);
      const others = linked(LAYER_OF(root), 'color');
      const touched = [];
      for (const k of others) { const was = JSON.stringify(PM.layerObjects(st.d, k)); for (const o of PM.layerObjects(st.d, k)) swapColor(o, old, v); if (JSON.stringify(PM.layerObjects(st.d, k)) !== was) touched.push(k); }
      if (touched.length) {
        syncInputs();
        const names = touched.map((k) => (PM.LAYERS_ALL.find(([key]) => key === k) || [k, k])[1]).join(', ');
        toast(`Color link ${PM.layer(st.d, LAYER_OF(root)).color}: also changed ${names}`, 3500);
      }
      void before;
    }
    if (/^(line1|line2|extra|years)\.(text|font|img|useImg|show|perRow|caps|smallCaps|align)$/.test(path)) fitNow([root]);
    else if (path === 'bnr.shape') fitNow(['years', 'mark']);
    else if (path === 'mark.src') fitNow(['mark', 'line1', 'line2']);
    queueRender();
  }
  function setLayer(k, prop, v) {
    snapshot(true);
    st.d.layers = st.d.layers || {};
    st.d.layers[k] = Object.assign({}, st.d.layers[k], { [prop]: v });
    buildPanel(); queueRender();
  }
  function replaceDesign(nd, { rebuild = true, fit = true } = {}) {
    snapshot(true); st.d = nd; if (rebuild) buildPanel(); queueRender();
    if (fit) fitNow(); // a fresh layout never starts out spilling over the pennant's edges
  }
  // Shrink wordmark lines that poke past the felt (after their fonts load), then refresh.
  function fitNow(keys) {
    const d = st.d;
    const ks = (keys || ['mark', 'line1', 'line2', 'extra', 'years']).filter((k) => !PM.isLocked(d, k));
    PM.fitToPennant(d, ks).then((ch) => { if (ch && st.d === d) { syncInputs(); queueRender(); } }).catch(() => {});
  }
  function updUndo() { $('#undoBtn').disabled = !st.undo.length; $('#redoBtn').disabled = !st.redo.length; }
  function undo() { if (!st.undo.length) return; st.redo.push(JSON.stringify(st.d)); st.d = JSON.parse(st.undo.pop()); st.lastSnap = 0; updUndo(); buildPanel(); queueRender(); }
  function redo() { if (!st.redo.length) return; st.undo.push(JSON.stringify(st.d)); st.d = JSON.parse(st.redo.pop()); st.lastSnap = 0; updUndo(); buildPanel(); queueRender(); }

  let toastT;
  function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }

  // ---------- rendering ----------
  let rq = 0, rasterT = null;
  function queueRender() { cancelAnimationFrame(rq); rq = requestAnimationFrame(render); persist(); }
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    const stage = $('#stage');
    if (st.view === 'flat') {
      await PM.ensureFonts(st.d);
      if (seq !== renderSeq) return;
      stage.innerHTML = PM.renderSVG(st.d, { placeholders: st.ph });
      for (const k of PM.LAYER_KEYS) if (PM.isLocked(st.d, k)) stage.querySelectorAll(`[data-part="${k}"]`).forEach((el) => { el.style.pointerEvents = 'none'; });
      highlight();
      $('#stageHint').textContent = st.mode === 'bulk' ? '' : 'Click any part to edit it. Drag logos and text to move them.';
    } else {
      $('#stageHint').textContent = 'Switch to Flat to click and drag parts.';
      if (!stage.querySelector('.busy')) stage.append(h('div', { class: 'busy' }, 'Rendering…'));
      clearTimeout(rasterT);
      rasterT = setTimeout(async () => {
        try {
          const c = await PM.out.render(st.d, st.view, { width: 1600, bg: st.view === 'felt' || st.view === 'aged' ? 'wall' : null, pixels: +$('#exPixels').value || 128, preset: $('#exPreset').value });
          if (seq !== renderSeq) return;
          stage.innerHTML = ''; stage.append(h('img', { src: c.toDataURL('image/png'), alt: 'Pennant preview' }));
        } catch (e) { console.error(e); stage.innerHTML = '<p>Preview failed: ' + PM.esc(e.message) + '</p>'; }
      }, 350);
    }
    warnings();
  }

  const svgPt = (svg, e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  function highlight() {
    const svg = $('#stage svg'); if (!svg || !st.sel) return;
    const el = svg.querySelector(`[data-part="${st.sel}"]`); if (!el) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const a = svgPt(svg, { clientX: r.left, clientY: r.top }), b = svgPt(svg, { clientX: r.right, clientY: r.bottom });
    const NS = 'http://www.w3.org/2000/svg', rect = document.createElementNS(NS, 'rect');
    Object.entries({ x: a.x - 6, y: a.y - 6, width: b.x - a.x + 12, height: b.y - a.y + 12, fill: 'none', stroke: '#f2c230', 'stroke-width': 3, 'stroke-dasharray': '10 6', rx: 6, class: 'sel-box' }).forEach(([k, v]) => rect.setAttribute(k, v));
    svg.append(rect);
  }

  // ---------- click & drag on the preview ----------
  const PART_SEC = { sched: 'schedule', game: 'game', photo: 'photo', band: 'field', field: 'field', spine: 'spine', stitch: 'spine', ties: 'ties', tieTop: 'ties', tieBottom: 'ties', pattern: 'pattern', stripes: 'pattern', stamps: 'stamps', stamp1: 'stamps', stamp2: 'stamps', mark: 'mark', line1: 'line1', line2: 'line2', extra: 'extra', maker: 'maker', years: 'years' };
  const DRAG = { mark: 'mark', line1: 'line1', line2: 'line2', extra: 'extra', years: 'years', stamp1: 'stamps', stamp2: 'stamps', stamps: 'stamps', maker: 'maker' };
  let drag = null;
  function onStageDown(e) {
    const svg = $('#stage svg'); if (!svg || st.mode === 'bulk') return;
    const el = e.target.closest('[data-part]');
    const part = el ? el.dataset.part : null;
    if (part === 'stamps') return;
    select(part);
    const obj = DRAG[part];
    if (obj && st.mode !== 'auto' && !PM.isLocked(st.d, obj)) {
      e.preventDefault();
      const p0 = svgPt(svg, e);
      const group = [obj, ...linked(obj, 'move').filter((k) => PM.LAYER_KEYS.includes(k) && !PM.isLocked(st.d, k))];
      drag = { p0, start: group.map((k) => [k, st.d[k].x, st.d[k].y]), moved: false };
    }
  }
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const svg = $('#stage svg'); if (!svg) return;
    const p = svgPt(svg, e);
    if (!drag.moved) { snapshot(true); drag.moved = true; }
    const dx = Math.round(p.x - drag.p0.x), dy = Math.round(p.y - drag.p0.y);
    for (const [k, x, y] of drag.start) { st.d[k].x = x + dx; st.d[k].y = y + dy; }
    queueRender();
  });
  window.addEventListener('pointerup', () => { if (drag && drag.moved) syncInputs(); drag = null; });

  // Bring a section's title to the top of the controls: right under the yellow line on a computer,
  // right under the pinned header and preview on a phone.
  function scrollSecTop(dt) {
    const panel = $('.panel');
    const ov = getComputedStyle(panel).overflowY;
    if (ov === 'auto' || ov === 'scroll') {
      const top = panel.scrollTop + dt.getBoundingClientRect().top - panel.getBoundingClientRect().top - 10;
      panel.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      // pinned (sticky) parts cover the top of the page once they stick: header, then the preview
      const cover = ['.top', '.stage'].map((q) => document.querySelector(q)).filter(Boolean)
        .filter((el) => getComputedStyle(el).position === 'sticky')
        .reduce((m, el) => Math.max(m, (parseFloat(getComputedStyle(el).top) || 0) + el.offsetHeight), 0);
      window.scrollTo({ top: Math.max(0, window.scrollY + dt.getBoundingClientRect().top - cover - 8), behavior: 'smooth' });
    }
  }
  function select(part) {
    st.sel = part;
    if (part && st.mode === 'auto') { setMode('manual'); return; }
    if (st.mode === 'guided' && part) {
      const sec = PART_SEC[part];
      const i = STEPS.findIndex((s) => s.secs.includes(sec));
      if (i >= 0 && i !== st.step) { st.step = i; buildPanel(); }
    }
    if (st.mode === 'manual') {
      const sec = PART_SEC[part];
      let target = null;
      document.querySelectorAll('details.sec').forEach((dt) => {
        const on = dt.dataset.sec === sec;
        dt.classList.toggle('hl', on);
        if (on) { dt.open = true; target = dt; }
        else if (dt.dataset.sec !== 'layers' && part) dt.open = false; // only the picked part stays open
      });
      if (target) scrollSecTop(target);
    }
    queueRender();
  }

  // Keep inputs in sync after drags (positions)
  const binders = [];
  function syncInputs() { binders.forEach((f) => f()); }

  // ---------- controls ----------
  const row = (label, ctl) => h('div', { class: 'row' }, h('span', {}, label), ctl);
  // One-click swap: flips two settings (colors, places, contents) in one undoable step.
  const swapBtn = (label, fn, done) => h('div', { class: 'row' }, h('span', {}),
    h('button', { class: 'swap', type: 'button', onclick: () => { snapshot(true); const msg = fn(st.d); buildPanel(); queueRender(); toast(msg || done || 'Swapped', 2200); } }, '⇅ ' + label));
  const swapKeys = (a, b, keys) => { for (const k of keys) { const t = a[k]; a[k] = b[k]; b[k] = t; } };
  // Stamps and maker's mark trade places (centre for centre; the stamp row keeps its spacing).
  function swapStampsMaker(d) {
    const S = d.stamps, M = d.maker;
    const shown = S.items.filter((it) => it.show);
    const W = shown.reduce((w, it) => w + it.size, 0) + Math.max(0, shown.length - 1) * S.gap;
    const cx = S.x + W / 2, cy = S.y;
    S.x = Math.round(M.x - W / 2); S.y = Math.round(M.y);
    M.x = Math.round(cx); M.y = Math.round(cy);
    return "Stamps and maker's mark swapped places" + (M.show ? '' : " (the maker's mark is switched off)");
  }
  // Top and bottom wordmark lines trade what they say (text or image); each line keeps its own look.
  function swapLines(d) {
    swapKeys(d.line1, d.line2, ['text', 'show', 'useImg', 'img', 'imgAR', 'imgScale', 'autoImg', 'imgFrom']);
    return 'Top and bottom wordmark lines swapped';
  }
  // ---------- copy / swap style between sections ----------
  // A lettering "style" is how it looks, not what it says or where it sits: font, colors, outlines,
  // shadow, slant, spacing, knockout. Size, width and position stay with each line.
  const STYLE_KEYS = ['font', 'caps', 'smallCaps', 'fill', 'o1', 'o2', 'shadow', 'italic', 'letterSpacing', 'slant', 'tail', 'ko'];
  const grabStyle = (t) => clone(Object.fromEntries(STYLE_KEYS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])));
  const TEXT_PARTS = () => (isSched() ? [['line2', 'Team name'], ['line1', 'Season line'], ['extra', 'Footer note']] : isGame() ? [['line2', 'Headline'], ['line1', 'Date & time'], ['extra', 'Place']] : isC() ? [['line2', 'Name'], ['line1', 'Position'], ['extra', 'Team name']] : isP() ? [['line2', 'Name'], ['extra', 'Signature'], ['line1', 'Caption']]
    : [['line1', isB() ? 'Top line' : 'Line 1 (small)'], ['line2', isB() ? 'Big line' : 'Line 2 (big)'],
      ['extra', isB() ? 'Team name line' : 'Extra text'], ...(isB() ? [['years', 'Years']] : [])]);
  const partName = (k) => (TEXT_PARTS().find(([v]) => v === k) || [k, k])[1];
  // the style clipboard outlives the design (paste onto another pennant), so it lives in browser storage
  const CLIP = 'pm.styleClip', KO_CLIP = 'pm.koClip';
  const clipGet = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return st[key] || null; } };
  const clipSet = (key, v) => { st[key] = v; try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
  function restyle(fn, keys) {
    snapshot(true); const msg = fn(st.d); fitNow(keys); buildPanel(); queueRender(); toast(msg, 2400);
  }
  function styleRows(k) {
    const others = TEXT_PARTS().filter(([v]) => v !== k);
    const sel = h('select', {}, others.map(([v, l]) => h('option', { value: v }, l)));
    const btn = (label, title, fn) => h('button', { class: 'swap', type: 'button', title, onclick: fn }, label);
    return [
      h('div', { class: 'sub' }, 'Style'),
      row('Other line', sel),
      h('div', { class: 'row' }, h('span', {}), h('div', { class: 'col' },
        btn('⤓ Copy its style here', 'Give this line the font, colors and outlines of the line picked above', () => restyle((d) => { Object.assign(d[k], grabStyle(d[sel.value])); return `${partName(k)} now uses the style of ${partName(sel.value)}`; }, [k])),
        btn('⤒ Send this style there', 'Give the line picked above this line’s font, colors and outlines', () => restyle((d) => { Object.assign(d[sel.value], grabStyle(d[k])); return `${partName(sel.value)} now uses the style of ${partName(k)}`; }, [sel.value])),
        btn('⇅ Swap styles', 'Trade fonts, colors and outlines with the line picked above', () => restyle((d) => { const a = grabStyle(d[k]), b = grabStyle(d[sel.value]); Object.assign(d[k], b); Object.assign(d[sel.value], a); return `${partName(k)} and ${partName(sel.value)} swapped styles`; }, [k, sel.value])))),
      h('div', { class: 'row' }, h('span', {}), h('div', { class: 'col' },
        btn('Copy style', 'Remember this style; paste it onto any line, even on another design', () => { clipSet(CLIP, grabStyle(st.d[k])); toast(`Style copied from ${partName(k)}: ${st.d[k].font}`, 2400); buildPanel(); }),
        clipGet(CLIP) ? btn('Paste style', 'Use the copied style on this line', () => restyle((d) => { Object.assign(d[k], clone(clipGet(CLIP))); return `Style pasted onto ${partName(k)}`; }, [k])) : null,
        btn('Use on all lines', 'Give every line this font, colors and outlines', () => restyle((d) => { const s = grabStyle(d[k]); for (const [o] of others) Object.assign(d[o], clone(s)); return `Every line now uses the style of ${partName(k)}`; }, TEXT_PARTS().map(([v]) => v)))),
      ),
    ];
  }
  function cColor(path) {
    const v = () => PM.colors.norm(get(path)) || '#000000';
    const pick = h('input', { type: 'color', value: v() });
    const txt = h('input', { type: 'text', value: v(), spellcheck: false });
    const apply = (c) => { c = PM.colors.norm(c); if (!c) return; pick.value = c; txt.value = c; change(path, c); };
    pick.addEventListener('input', () => apply(pick.value));
    txt.addEventListener('change', () => apply(txt.value));
    // Swatches on their own full-width row: team colors, then every color pulled from the logo, then white / black.
    const sw = (c, title) => h('button', { class: 'sw', style: `background:${c}`, title: `${title}: ${c}`, onclick: () => apply(c) });
    const swRow = h('div', { class: 'swatches' });
    const paint = (logo) => {
      const p = st.d.palette || {}, seen = new Set();
      const add = (c, title) => { c = PM.colors.norm(c); if (!c || seen.has(c.toLowerCase())) return null; seen.add(c.toLowerCase()); return sw(c, title); };
      const team = [[p.primary, 'Primary'], [p.secondary, 'Secondary'], [p.tertiary, 'Tertiary'], [st.d.field.color, 'Felt']].map(([c, t]) => add(c, t)).filter(Boolean);
      const near = (c) => team.some((b) => PM.colors.dist(b.title.split(': ')[1], c) < 40); // already offered as a team color
      const fromLogo = (logo || []).filter((c) => !near(c)).map((c) => add(c, 'From the logo')).filter(Boolean);
      const basics = [['#ffffff', 'White'], ['#141414', 'Black']].map(([c, t]) => add(c, t)).filter(Boolean);
      swRow.replaceChildren(...team, fromLogo.length ? h('span', { class: 'sw-sep', title: 'Colors from the logo' }) : null, ...fromLogo, h('span', { class: 'sw-sep' }), ...basics);
    };
    const src = st.d.mark && st.d.mark.show !== false ? st.d.mark.src : null;
    paint(logoSwatches(src, paint));
    binders.push(() => { pick.value = v(); txt.value = v(); });
    return h('div', { class: 'col color-ctl' }, pick, txt, swRow);
  }
  // Colors pulled from the primary logo, kept per logo so every color picker can offer them.
  const logoSw = new Map();
  function logoSwatches(src, then) {
    if (!src) return [];
    const got = logoSw.get(src);
    if (Array.isArray(got)) return got;
    if (!got) logoSw.set(src, PM.colors.extract(src, 10, 0.006).then((cs) => { const out = (cs || []).filter(Boolean); logoSw.set(src, out); return out; }).catch(() => { logoSw.set(src, []); return []; }));
    logoSw.get(src).then((cs) => then(cs));
    return [];
  }
  function cRange(path, min, max, step = 1) {
    const r = h('input', { type: 'range', min, max, step, value: get(path) });
    const n = h('input', { type: 'number', min, max, step, value: get(path) });
    const lk = path.match(/^(stamps|mark|line1|line2|extra|maker)\.(x|y|size)$/);
    if (lk && PM.isLocked(st.d, lk[1])) { r.disabled = n.disabled = true; r.title = n.title = 'Layer is locked'; }
    r.addEventListener('input', () => { n.value = r.value; change(path, +r.value); });
    n.addEventListener('change', () => { r.value = n.value; change(path, +n.value); });
    binders.push(() => { r.value = get(path); n.value = get(path); });
    return h('div', { class: 'rng' }, r, n);
  }
  function cText(path, ph = '') {
    const i = h('input', { type: 'text', value: get(path) || '', placeholder: ph });
    i.addEventListener('input', () => change(path, i.value));
    return i;
  }
  function cCheck(path, label) {
    const i = h('input', { type: 'checkbox', checked: !!get(path) });
    i.addEventListener('change', () => change(path, i.checked));
    binders.push(() => { i.checked = !!get(path); });
    return h('label', { class: 'chk' }, i, label || '');
  }
  function cSelect(path, opts, after) {
    const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v, selected: String(get(path)) === String(v) }, l)));
    s.addEventListener('change', () => { change(path, s.value); after && after(s.value); });
    return s;
  }
  // Font picker: grouped by style, each name drawn in its own face, with a quick filter.
  const faceCss = (name) => { const f = PM.fontDef(name); return `font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};font-stretch:${f.stretch}`; };
  function cFont(path) {
    const s = h('select', {});
    const fill = (q = '') => {
      const ql = q.trim().toLowerCase(), cur = get(path);
      s.innerHTML = '';
      if (cur && !PM.FONT_DEFS[cur]) s.append(h('option', { value: cur, selected: true }, cur));
      for (const [cat, names] of PM.FONT_CATS) {
        const list = names.filter((n) => !ql || n.toLowerCase().includes(ql) || n === cur);
        if (!list.length) continue;
        s.append(h('optgroup', { label: `${cat} (${list.length})` }, list.map((n) => h('option', { value: n, selected: n === cur, style: faceCss(n) }, n))));
      }
    };
    const paint = () => { s.style.cssText = faceCss(get(path)); };
    const filter = h('input', { type: 'search', placeholder: `Filter ${PM.FONTS.length} fonts…`, style: 'width:100%;margin-bottom:4px' });
    filter.addEventListener('input', () => fill(filter.value));
    s.addEventListener('change', () => { change(path, s.value); paint(); });
    fill(); paint();
    binders.push(() => { fill(filter.value); paint(); });
    return h('div', {}, filter, s);
  }

  // Background (template) switcher: re-lays out and recolors the current design.
  function cTemplate() {
    const sel = h('select', {}, PM.templatesFor(PM.productOf(st.d)).map(([k, v]) => h('option', { value: k, selected: st.d.template === k }, v.name)));
    sel.addEventListener('change', () => {
      const d = PM.setTemplate(clone(st.d), sel.value); PM.auto.layoutText(d);
      if (sel.value === 'posterSchedule' || sel.value === 'posterGameDay') PM.auto.posterText(d, st.lastTeam, posterOpts());
      replaceDesign(d); toast(PM.TEMPLATES[sel.value].name);
    });
    return sel;
  }
  // Current vs vintage logos (by year). Vintage also finds defunct teams and takes colors from that logo.
  function cEra() {
    const mode = h('select', {}, h('option', { value: 'current', selected: !st.era.on }, 'Current logos'), h('option', { value: 'vintage', selected: st.era.on }, 'Vintage logos'));
    const year = h('input', { type: 'number', min: 1900, max: new Date().getFullYear(), value: st.era.year, style: 'width:80px', title: 'Season year' });
    const nm = h('input', { type: 'checkbox', checked: st.era.useName });
    const nameLbl = h('label', { class: 'chk', title: 'e.g. 1980 Kings becomes Kansas City Kings' }, nm, 'Team name from that year');
    const sync = () => { year.style.display = nameLbl.style.display = st.era.on ? '' : 'none'; try { localStorage.setItem('pm_era', JSON.stringify(st.era)); } catch {} };
    mode.addEventListener('change', () => { st.era.on = mode.value === 'vintage'; sync(); });
    year.addEventListener('change', () => { st.era.year = Math.max(1900, Math.min(new Date().getFullYear(), +year.value || 1985)); year.value = st.era.year; sync(); });
    nm.addEventListener('change', () => { st.era.useName = nm.checked; sync(); });
    sync();
    return h('div', { class: 'col' }, mode, year, nameLbl);
  }

  // Which background automatic mode uses for the next team.
  function cTplChoice() {
    if (isB()) {
      const sb = h('select', {}, PM.templatesFor('banner').map(([k, v]) => h('option', { value: k, selected: st.autoTplB === k }, v.name)));
      sb.addEventListener('change', () => { st.autoTplB = sb.value; const d = PM.setTemplate(clone(st.d), sb.value); PM.auto.layoutText(d); replaceDesign(d); });
      return sb;
    }
    const sel = h('select', {}, [['match', 'Match the sport'], ...Object.entries(PM.TEMPLATES).map(([k, v]) => [k, v.name])]
      .map(([k, l]) => h('option', { value: k, selected: st.autoTpl === k }, l)));
    sel.addEventListener('change', () => { st.autoTpl = sel.value; });
    return sel;
  }

  // ---------- Images into layers (upload, link, search, drag and drop) ----------
  const IMG_SLOT = { photo: 'pst.photo', mark: 'mark.src', stamp1: 'stamps.items.0.src', stamp2: 'stamps.items.1.src', stamps: 'stamps.items.0.src', maker: 'maker.src', line1: 'line1.img', line2: 'line2.img', extra: 'extra.img' };
  const SLOT_NAME = { photo: 'Photo', mark: 'Primary mark', stamp1: 'Stamp 1', stamp2: 'Stamp 2', stamps: 'Stamp 1', maker: "Maker's mark", line1: 'Wordmark line 1', line2: 'Wordmark line 2', extra: 'Extra text' };
  const aspectOf = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight || 3); i.onerror = () => res(3); i.src = src; });
  // Put image data into a slot path and switch on whatever shows it.
  async function putImage(path, data) {
    if (path === 'pst.photo') return setPhoto(data);
    snapshot(true);
    set(path, data);
    const root = path.split('.')[0];
    if (path.endsWith('.img')) { set(root + '.useImg', !!data); set(root + '.show', true); if (data) set(root + '.imgAR', await aspectOf(data)); }
    else if (root === 'stamps' && data) set(path.replace('.src', '.show'), true);
    else if (data && (root === 'mark' || root === 'maker')) set(root + '.show', true);
    syncInputs(); queueRender();
  }
  // Turn whatever was dropped (our thumbnails, files, links or images from other sites) into image data.
  const unproxy = (u) => { try { const x = new URL(u, location.href); return x.pathname === '/proxy' && x.searchParams.get('url') ? x.searchParams.get('url') : u; } catch { return u; } };
  async function imageFromDrop(dt) {
    const file = [...(dt.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) return new Promise((res) => { const r = new FileReader(); r.onload = () => res(PM.sources.trim(r.result)); r.readAsDataURL(file); });
    let url = dt.getData('application/x-pennant-img') || dt.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#')) || '';
    if (!url) { const html = dt.getData('text/html'); const m = html && html.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) url = m[1]; }
    if (!url) { const t = dt.getData('text/plain'); if (/^(https?:|data:image)/i.test(t)) url = t.trim(); }
    if (!url) return null;
    url = unproxy(url.replace(/&amp;/g, '&'));
    return url.startsWith('data:') ? PM.sources.trim(url) : PM.sources.imageData(url);
  }
  const isImgDrag = (e) => [...(e.dataTransfer?.types || [])].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/html' || t === 'application/x-pennant-img' || t === 'text/plain');
  // Make any element a drop target that fills `slot` (a key of IMG_SLOT or a direct path).
  function dropTarget(el, slotOrFn) {
    el.addEventListener('dragover', (e) => { if (!isImgDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('drop-on'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop-on'));
    el.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation(); el.classList.remove('drop-on');
      const slot = typeof slotOrFn === 'function' ? slotOrFn(e) : slotOrFn;
      const path = IMG_SLOT[slot] || slot; if (!path) return;
      try {
        toast('Loading image…');
        const data = await imageFromDrop(e.dataTransfer);
        if (!data) { toast('That drop had no image in it'); return; }
        await putImage(path, data);
        toast('Added to ' + (SLOT_NAME[slot] || path.split('.')[0]));
      } catch (er) { toast('Could not use that image: ' + er.message, 3500); }
    });
  }

  // Image slot: upload, paste a link, or search the live databases.
  function cImage(path, kind) {
    const thumb = h('div', { class: 'thumb' });
    const paint = () => { thumb.innerHTML = ''; const s = get(path); thumb.append(s ? h('img', { src: s }) : h('small', {}, 'none')); };
    paint();
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const setImg = async (getter) => {
      try { toast('Loading image…'); const data = await getter(); await putImage(path, data); paint(); toast('Image added'); }
      catch (e) { toast('Could not load that image: ' + e.message, 3500); }
    };
    dropTarget(thumb, path);
    thumb.title = 'Drop an image or a search result here';
    file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      setImg(() => new Promise((res) => { const r = new FileReader(); r.onload = () => res(PM.sources.trim(r.result)); r.readAsDataURL(f); }));
    });
    const urlRow = h('div', { class: 'search', hidden: true });
    const urlIn = h('input', { type: 'url', placeholder: 'Paste image link (PNG/SVG)…' });
    urlRow.append(urlIn, h('button', { onclick: () => urlIn.value && setImg(() => PM.sources.imageData(urlIn.value.trim())) }, 'Use'));
    const finder = h('div', { class: 'finder', hidden: true });
    const fIn = h('input', { type: 'search', placeholder: kind === 'league' ? 'League / conference (e.g. NCAA, SEC, Pacific Coast)…' : 'Team name…' });
    const grid = h('div', { class: 'grid' });
    const runFind = async () => {
      const q = fIn.value.trim(); if (!q) return;
      grid.innerHTML = '<small>Searching…</small>';
      try {
        const commons = PM.sources.commonsSearch(q).catch(() => []);
        const addCommons = async () => (await commons).forEach((c) => grid.append(h('button', { title: c.name + ' (Wikimedia Commons)', onclick: () => setImg(() => PM.sources.imageData(c.url)) },
          h('img', { src: PM.sources.proxied(c.thumb), alt: '' }), c.name.slice(0, 28))));
        if (kind === 'league') {
          const ls = await PM.sources.searchLeagues(q).catch(() => []);
          grid.innerHTML = '';
          await addCommons();
          if (!grid.children.length && !ls.length) grid.innerHTML = '<small>No logos found.</small>';
          for (const l of ls) {
            const b = h('button', { title: l.strLeague }, h('img', { alt: '' }), l.strLeague);
            grid.append(b);
            PM.sources.tsdbLeagueBadge(l.idLeague).then((u) => {
              if (!u) { b.remove(); return; }
              b.querySelector('img').src = PM.sources.proxied(u);
              b.onclick = () => setImg(() => PM.sources.imageData(u));
            });
          }
        } else {
          const [ts, hist] = await Promise.all([PM.sources.search(q, st.leagues), PM.sources.logoHistory(q).catch(() => null)]);
          grid.innerHTML = '';
          (hist?.eras || []).forEach((e) => grid.append(h('button', { title: `${e.team} logo, ${e.from}–${e.to} (Logopedia)`, onclick: () => setImg(() => PM.sources.imageData(e.url)) },
            h('img', { src: PM.sources.proxied(e.url), alt: '' }), `${e.from}–${e.to >= new Date().getFullYear() ? 'now' : String(e.to).slice(2)}`)));
          ts.forEach((t) => (t.logos || []).slice(0, 6).forEach((l) => {
            grid.append(h('button', { title: `${t.name} — ${l.tag}`, onclick: () => setImg(() => PM.sources.imageData(l.url)) },
              h('img', { src: PM.sources.proxied(l.url), alt: '' }), `${t.abbr || t.name.split(' ').pop()} · ${l.tag.split(' ')[0]}`));
          }));
          await addCommons();
          if (!grid.children.length) grid.innerHTML = '<small>No logos found.</small>';
        }
      } catch (e) { grid.innerHTML = '<small>Lookup failed: ' + PM.esc(e.message) + '</small>'; }
    };
    fIn.addEventListener('keydown', (e) => e.key === 'Enter' && runFind());
    finder.append(h('div', { class: 'search' }, fIn, h('button', { onclick: runFind }, 'Search')), grid);
    if (kind === 'team') finder.append(h('p', { class: 'fine', style: 'margin:0' },
      'High school? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); PM.sources.openExternal(PM.sources.maxprepsUrl(fIn.value)); } }, 'Search MaxPreps high school logos ↗'),
      ' · Minor league or defunct? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); PM.sources.openExternal(PM.sources.funWhileItLastedUrl(fIn.value)); } }, 'Fun While It Lasted ↗'),
      ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); PM.sources.openExternal(PM.sources.sportsLogosUrl(fIn.value)); } }, 'SportsLogos.net ↗'),
      ' then right-click the logo, choose Copy image address, and paste it under Link.'));
    binders.push(paint);
    return h('div', {},
      h('div', { class: 'img-slot' }, thumb, h('div', { class: 'btns' },
        h('button', { onclick: () => file.click() }, 'Upload'),
        h('button', { onclick: () => { urlRow.hidden = !urlRow.hidden; } }, 'Link'),
        h('button', { onclick: () => { finder.hidden = !finder.hidden; fIn.focus(); } }, 'Find'),
        h('button', { onclick: () => { change(path, null); paint(); } }, 'Clear')), file),
      urlRow, finder);
  }

  // ---------- sections (each = one editable part) ----------
  // Knockout ("room" of felt around an item): on/off, shape, room, color, corner radius
  const koRows = (path) => [
    h('div', { class: 'sub' }, 'Knockout room'),
    row('Knockout', cCheck(path + '.on')),
    row('Shape', cSelect(path + '.shape', PM.KO_SHAPES)),
    row('Room', cRange(path + '.w', 0, 80)),
    row('Color', cColor(path + '.color')),
    row('Corner radius', cRange(path + '.radius', 0, 120)),
    h('div', { class: 'row' }, h('span', {}), h('div', { class: 'col' },
      h('button', { class: 'swap', type: 'button', title: 'Remember this knockout (shape, room, color, corners)', onclick: () => { clipSet(KO_CLIP, clone(get(path))); toast('Knockout copied', 2000); buildPanel(); } }, 'Copy knockout'),
      clipGet(KO_CLIP) ? h('button', { class: 'swap', type: 'button', title: 'Use the copied knockout here', onclick: () => { snapshot(true); set(path, clone(clipGet(KO_CLIP))); buildPanel(); queueRender(); toast('Knockout pasted', 2000); } }, 'Paste knockout') : null)),
  ];
  const textSec = (k) => () => [
    row('Show', cCheck(k + '.show')),
    row('Text', cText(k + '.text')),
    row('Use image', cCheck(k + '.useImg', 'Image instead of text')),
    row('Image', cImage(k + '.img', 'team')),
    row('Image size', cRange(k + '.imgScale', 0.2, 2.5, 0.05)),
    row('Font', cFont(k + '.font')),
    row('Capitals', h('div', { class: 'col' }, cCheck(k + '.caps', 'ALL CAPS'), cCheck(k + '.smallCaps', 'Small caps'))),
    row('Line up', cSelect(k + '.align', [['middle', 'Centred on X'], ['start', 'Left edge at X'], ['end', 'Right edge at X']])),
    row('Size', cRange(k + '.size', 20, 320)),
    row('Max width', cRange(k + '.maxWidth', 100, 1400, 10)),
    row('Fill', cColor(k + '.fill')),
    h('div', { class: 'sub' }, 'Outlines'),
    row('Inner color', cColor(k + '.o1.color')), row('Inner width', cRange(k + '.o1.w', 0, 20, 0.5)),
    row('Outer color', cColor(k + '.o2.color')), row('Outer width', cRange(k + '.o2.w', 0, 20, 0.5)),
    swapBtn('Swap inner / outer outline colors', (d) => { const t = d[k]; const c = t.o1.color; t.o1.color = t.o2.color; t.o2.color = c; }, 'Outline colors swapped'),
    (k === 'line1' || k === 'line2') ? swapBtn('Swap top / bottom wordmark lines', swapLines) : null,
    ...styleRows(k),
    ...koRows(k + '.ko'),
    h('div', { class: 'sub' }, 'Effects'),
    row('Drop shadow', cCheck(k + '.shadow.on')), row('Shadow color', cColor(k + '.shadow.color')),
    row('Shadow X / Y', h('div', { class: 'rng' }, cRange(k + '.shadow.dx', -20, 20), cRange(k + '.shadow.dy', -20, 20))),
    row('Script tail', cCheck(k + '.tail', 'Underline swash')),
    row('Italic', cCheck(k + '.italic')),
    row('Letter spacing', cRange(k + '.letterSpacing', -10, 40, 0.5)),
    row('Rotate', cRange(k + '.rotate', -20, 20, 0.5)),
    row('Slant', cRange(k + '.slant', -20, 20, 0.5)),
    h('div', { class: 'sub' }, 'Position'),
    row('X', cRange(k + '.x', 0, TW())), row('Y', cRange(k + '.y', 0, TH())),
  ];

  const SECTIONS = {
    palette: {
      title: 'Team colors', build: () => [
        h('p', { class: 'lead', style: 'margin:0' }, 'Change these, then press Apply to recolor every part using the standard layout.'),
        row('Primary', cColor('palette.primary')), row('Secondary', cColor('palette.secondary')),
        row('Tertiary', cColor('palette.tertiary')), row('Felt', cColor('palette.field')),
        row('Wordmark style', cSelect('wordStyle', Object.entries(PM.colors.STYLES).map(([k, v]) => [k, v.label]))),
        h('div', { class: 'btns' },
          h('button', { class: 'primary', onclick: () => { const d = clone(st.d); PM.colors.applyPalette(d, d.palette, d.wordStyle); PM.auto.layoutText(d); replaceDesign(d); toast('Colors applied to all parts'); } }, 'Apply to all parts'),
          h('button', { onclick: () => { const d = clone(st.d); PM.auto.swapColors(d); replaceDesign(d); } }, 'Swap primary / secondary')),
      ],
    },
    field: {
      title: () => (isC() ? 'Card style & border' : isP() ? 'Poster style & paper' : isB() ? 'Banner shape & felt' : 'Felt body'), build: () => isP() ? [
        row('Style', cTemplate()),
        isC() ? null : row(/^posterWhite/.test(st.d.template) ? 'Paper' : 'Frame color', cColor('field.color')),
        isC() && st.d.template === 'cardWood' ? row('Wood', h('div', { class: 'col' }, cColor('pst.paperA'), cColor('pst.paperB'))) : null,
        isC() && st.d.template === 'cardClean' ? row('Border', cColor('field.color')) : null,
        isC() ? row('Name band', cColor('pst.bandColor')) : null,
        isC() && st.d.template !== 'cardClean' ? row('Band trim', cColor('pst.bandColor2')) : null,
        h('div', { class: 'sub' }, 'Line round the photo'),
        row('Keyline', cCheck('pst.keyOn')), row('Color', cColor('pst.keyColor')), row('Width', cRange('pst.keyW', 0, 24, 0.5)),
      ] : [
        row('Background', cTemplate()),
        isB() ? row('Shape', cSelect('bnr.shape', PM.BANNER_SHAPES)) : null,
        row('Felt color', cColor('field.color')),
        row('Border margin', cRange('field.margin', 0, 60)),
        isB() ? null : row('Length (tip)', cRange('field.tipX', 1200, 1990, 5)),
      ],
    },
    spine: {
      title: () => (isB() ? 'Top sleeve & stitching' : 'Spine & stitching'), build: () => [
        row(isB() ? 'Show sleeve' : 'Show spine', cCheck('spine.show')),
        row('Outer band', cColor('spine.outer')), row('Outer width', cRange('spine.outerW', 10, 90)),
        row('Inner band', cColor('spine.inner')), row('Inner width', cRange('spine.innerW', 0, 60)),
        swapBtn('Swap outer / inner band colors', (d) => { const c = d.spine.outer; d.spine.outer = d.spine.inner; d.spine.inner = c; }, 'Spine colors swapped'),
        h('div', { class: 'sub' }, 'Stitching'),
        row('Stitching', cCheck('spine.stitchOn')),
        row('Outer edge', cCheck('spine.stitchOuter')), row('Seam', cCheck('spine.stitchSeam')),
        row('Thread', cColor('spine.stitch')), row('Thread width', cRange('spine.stitchW', 0.5, 5, 0.1)),
        row('Stitch length', cRange('spine.dash', 2, 20, 0.5)),
      ],
    },
    ties: {
      title: () => (isB() ? 'Hanging cord & rod' : 'Ties'), build: () => isB() ? [
        row('Cord', cCheck('ties.top.show')), row('Cord color', cColor('ties.top.color')),
        row('Rod', cCheck('ties.bottom.show')), row('Rod color', cColor('ties.bottom.color')),
        swapBtn('Swap cord / rod colors', (d) => { const c = d.ties.top.color; d.ties.top.color = d.ties.bottom.color; d.ties.bottom.color = c; }, 'Cord and rod colors swapped'),
        row('Thickness', cRange('ties.width', 8, 50)),
      ] : [
        row('Top tie', cCheck('ties.top.show')), row('Top color', cColor('ties.top.color')),
        row('Bottom tie', cCheck('ties.bottom.show')), row('Bottom color', cColor('ties.bottom.color')),
        swapBtn('Swap top / bottom tie colors', (d) => { const c = d.ties.top.color; d.ties.top.color = d.ties.bottom.color; d.ties.bottom.color = c; }, 'Tie colors swapped'),
        row('Thickness', cRange('ties.width', 8, 50)),
        row('Felt mockup', cSelect('ties.feltStyle', [['loops', 'Fabric loops'], ['chevron', 'Same as flat']])),
      ],
    },
    pattern: {
      title: () => ({ bannerRafter: 'Edge trim', bannerHeader: 'Top block & divider', bannerVarsity: 'Side stripes', hoops: 'Corner wedges & stripes', hockey: 'Wedges, center stripe & medallion', edge: 'Edge trim stripes', split: 'Two-tone split', bands: 'College bands', gridiron: 'Football field' })[st.d.template] || 'Stripes',
      build: () => isB() ? [
        row('Show pattern', cCheck('bnr.show')),
        row('Shape', cSelect('bnr.shape', PM.BANNER_SHAPES)),
        ...(st.d.template === 'bannerRafter' ? [
          row('Trim color', cColor('bnr.colorA')), row('Pinstripe', cColor('bnr.colorB')),
          row('Trim width', cRange('bnr.trimW', 4, 50)), row('Gap', cRange('bnr.trimGap', 0, 40)), row('Inset from edge', cRange('bnr.trimInset', 0, 90)),
        ] : st.d.template === 'bannerHeader' ? [
          row('Top block', cColor('bnr.colorA')), row('Divider', cColor('bnr.colorB')),
          row('Block bottom', cRange('bnr.headerY', 400, 1400)), row('Divider width', cRange('bnr.trimW', 0, 50)),
        ] : [
          row('Outer stripe', cColor('bnr.colorA')), row('Inner stripe', cColor('bnr.colorB')),
          row('Stripe width', cRange('bnr.sideW', 8, 80)), row('Gap', cRange('bnr.sideGap', 0, 40)), row('Inset from edge', cRange('bnr.sideInset', 0, 120)),
        ]),
        swapBtn('Swap the two pattern colors', (d) => { const c = d.bnr.colorA; d.bnr.colorA = d.bnr.colorB; d.bnr.colorB = c; }, 'Pattern colors swapped'),
      ] : st.d.template === 'edge' ? [
        row('Show pattern', cCheck('edge.show')),
        row('Outer stripe', cColor('edge.colorA')), row('Inner stripe', cColor('edge.colorB')),
        row('Stripe width', cRange('edge.w', 8, 90)), row('Gap', cRange('edge.gap', 0, 60)), row('Inset from edge', cRange('edge.inset', 0, 80)),
      ] : st.d.template === 'split' ? [
        row('Show pattern', cCheck('split.show')),
        row('Top colour', cColor('split.top')), row('Bottom colour', cColor('split.bottom')),
        row('Divider colour', cColor('split.divider')), row('Divider width', cRange('split.divW', 0, 80)),
        row('Split height', cRange('split.offset', -200, 200)),
      ] : st.d.template === 'bands' ? [
        row('Show pattern', cCheck('bands.show')),
        row('Colour A', cColor('bands.colorA')), row('Colour B', cColor('bands.colorB')),
        row('Number of bands', cRange('bands.count', 1, 7)), row('Band width', cRange('bands.w', 10, 140)),
        row('Gap', cRange('bands.gap', 0, 60)), row('Start from spine', cRange('bands.start', 0, 300)),
      ] : st.d.template === 'gridiron' ? [
        row('Show pattern', cCheck('grid.show')),
        row('Field colour', cColor('grid.field')), row('End zone', cColor('grid.endzone')), row('Lines', cColor('grid.lines')),
        row('End zone width', cRange('grid.endW', 0, 400)), row('Yard line spacing', cRange('grid.every', 60, 300)),
        row('Hash marks', cCheck('grid.hash')),
      ] : st.d.template === 'hockey' ? [
        row('Show pattern', cCheck('hockey.show')),
        row('Color', cColor('hockey.color')),
        row('Corner wedges', cCheck('hockey.wedges')), row('Wedge depth', cRange('hockey.wedgeH', 80, 320)),
        row('Border margin', cRange('field.margin', 0, 60)),
        row('Center stripe', cCheck('hockey.center')), row('Stripe width', cRange('hockey.centerW', 10, 140)),
        row('Stripe length', cRange('hockey.centerEnd', 600, 1900, 5)),
        row('Gap at lettering', cCheck('hockey.knockout')), row('Gap padding', cRange('hockey.knockPad', 0, 80)),
        h('div', { class: 'sub' }, 'Logo medallion'),
        row('Medallion', cCheck('hockey.medallion')), row('Size vs logo', cRange('hockey.medScale', 1, 1.5, 0.01)),
        row('Ring', cCheck('hockey.ring')), row('Ring color', cColor('hockey.ringColor')),
        row('Ring width', cRange('hockey.ringW', 2, 40)), row('Ring inset', cRange('hockey.ringGap', 0, 60)),
      ] : st.d.template === 'hoops' ? [
        row('Show pattern', cCheck('hoops.show')),
        row('Corner wedges', cCheck('hoops.wedges')), row('Wedge color', cColor('hoops.wedge')),
        row('Wedge depth', cRange('hoops.wedgeH', 40, 300)),
        row('Accent stripes', cCheck('hoops.stripes')), row('Stripe color', cColor('hoops.stripe')),
        row('Stripe width', cRange('hoops.stripeW', 6, 80)),
        row('Gap to wedge', cRange('hoops.gap', 0, 80)),
        row('Stripe length', cRange('hoops.stripeEnd', 400, 1950, 5)),
      ] : [
        row('Show stripes', cCheck('stripes.show')),
        row('Pattern', cSelect('stripes.order', [['ABBA', 'Mirrored  A B / B A'], ['ABAB', 'Staggered  A B / A B']])),
        row('Color A', cColor('stripes.colorA')), row('Color B', cColor('stripes.colorB')),
        row('Thickness', cRange('stripes.thickness', 10, 140)),
        row('Gap in pair', cRange('stripes.gap', 0, 80)),
        row('Top pair Y', cRange('stripes.topY', 80, 500)),
        row('Bottom pair Y', cRange('stripes.bottomY', 300, 720)),
        row('Hide', h('div', { class: 'col' }, [0, 1, 2, 3].map((i) => cCheck(`stripes.hide.${i}`, '#' + (i + 1))))),
      ],
    },
    stamps: {
      title: () => (isC() ? 'League logo' : isP() ? 'Corner logos (league / team)' : 'League / conference stamps'), build: () => [
        ...[0, 1].flatMap((i) => [
          h('div', { class: 'sub' }, `Stamp ${i + 1}`),
          row('Show', cCheck(`stamps.items.${i}.show`)),
          row('Label', cText(`stamps.items.${i}.label`, i ? 'Conference' : 'League')),
          row('Logo', cImage(`stamps.items.${i}.src`, 'league')),
          row('Size', cRange(`stamps.items.${i}.size`, 20, 160)),
        ]),
        swapBtn('Swap stamp 1 / stamp 2', (d) => { const [a, b] = d.stamps.items; d.stamps.items = [b, a]; }, 'League and conference stamps swapped'),
        ...koRows('stamps.ko'),
        h('div', { class: 'sub' }, 'Placement'),
        row('X', cRange('stamps.x', 100, TW() - 100)), row('Y', cRange('stamps.y', 40, TH() - 40)), row('Gap', cRange('stamps.gap', 0, 60)),
        swapBtn("Swap places with the maker's mark", swapStampsMaker),
      ],
    },
    mark: {
      title: () => (isP() ? 'Team logo' : 'Primary mark (logo)'), build: () => [
        isP() ? row('See-through', cRange('mark.opacity', 0.1, 1, 0.05)) : null,
        isP() ? row('Corner', h('div', { class: 'col' }, [['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']].map(([c, a]) =>
          h('button', { class: 'swap', type: 'button', title: 'Put the logo in this corner of the photo', onclick: () => { snapshot(true); logoToCorner(st.d, c); buildPanel(); queueRender(); } }, a)))) : null,
        row('Show', cCheck('mark.show')),
        row('Logo', cImage('mark.src', 'team')),
        row('Size', cRange('mark.size', 80, 700)),
        row('X', cRange('mark.x', 100, TW() - 100)), row('Y', cRange('mark.y', 60, TH() - 60)),
        h('div', { class: 'sub' }, 'Outline'),
        ...koRows('mark.knockout'),
        h('div', { class: 'sub' }, 'Outer ring (traces the logo itself)'),
        row('Outer ring', cCheck('mark.ring.on')), row('Ring color', cColor('mark.ring.color')), row('Ring width', cRange('mark.ring.w', 0, 20)),
        st.d.template === 'hockey' ? h('p', { class: 'fine', style: 'margin:0' }, 'The circle ring around the logo on Vintage Hockey is the medallion ring: Wedges, center stripe & medallion → Ring color.') : null,
      ],
    },
    line1: { title: () => (isSched() ? 'Season line (e.g. 2026 SCHEDULE)' : isGame() ? 'Date & time' : isC() ? 'Position' : isP() ? 'Caption (team, position)' : isB() ? 'Title – top line (e.g. WORLD SERIES)' : 'Wordmark – line 1 (small)'), build: textSec('line1') },
    line2: { title: () => (isSched() ? 'Team name' : isGame() ? 'Headline (GAME DAY)' : isP() ? 'Name' : isB() ? 'Title – big line (CHAMPIONS)' : 'Wordmark – line 2 (big)'), build: textSec('line2') },
    extra: { title: () => (isSched() ? 'Footer note' : isGame() ? 'Place' : isC() ? 'Team name' : isP() ? 'Signature' : isB() ? 'Team name line' : 'Extra text'), build: textSec('extra') },
    schedule: { title: 'Schedule', build: () => schedRows() },
    game: { title: 'Opponent & game', build: () => gameRows() },
    photo: {
      title: 'Photo', build: () => [
        row('Photo', cPhoto()),
        row('Zoom', cRange('pst.zoom', 1, 3, 0.01)),
        row('Left ↔ right', cRange('pst.fx', 0, 1, 0.01)),
        row('Up ↕ down', cRange('pst.fy', 0, 1, 0.01)),
        h('p', { class: 'fine', style: 'margin:0' }, 'The photo always fills its box. Zoom in, then slide it to frame the player. Use your own photos (or ones you have the rights to).'),
      ],
    },
    years: {
      title: 'Championship years', build: () => [
        row('Show', cCheck('years.show')),
        row('Years', (() => {
          const ta = h('textarea', { rows: 3, value: st.d.years.text || '', placeholder: '1986, 2004, 2007, 2013' });
          ta.addEventListener('input', () => { st.banner.years = ta.value; change('years.text', ta.value); });
          binders.push(() => { if (document.activeElement !== ta) ta.value = st.d.years.text || ''; });
          return ta;
        })()),
        row('Per row', cSelect('years.perRow', [[0, 'Automatic'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']].map(([v, l]) => [String(v), l]), (v) => change('years.perRow', +v))),
        row('Line spacing', cRange('years.lineGap', 0.9, 2, 0.02)),
        row('Font', cFont('years.font')),
        row('Size', cRange('years.size', 30, 260)),
        row('Max width', cRange('years.maxWidth', 100, 1100, 10)),
        row('Fill', cColor('years.fill')),
        h('div', { class: 'sub' }, 'Outlines'),
        row('Inner color', cColor('years.o1.color')), row('Inner width', cRange('years.o1.w', 0, 20, 0.5)),
        row('Outer color', cColor('years.o2.color')), row('Outer width', cRange('years.o2.w', 0, 20, 0.5)),
        swapBtn('Swap inner / outer outline colors', (d) => { const c = d.years.o1.color; d.years.o1.color = d.years.o2.color; d.years.o2.color = c; }, 'Outline colors swapped'),
        row('Letter spacing', cRange('years.letterSpacing', -10, 40, 0.5)),
        ...styleRows('years'),
        h('div', { class: 'sub' }, 'Position'),
        row('X', cRange('years.x', 0, TW())), row('Y (first row)', cRange('years.y', 0, TH())),
      ],
    },
    maker: {
      title: () => (isC() ? 'Set logo (your own, top corner)' : "Maker's mark"), build: () => [
        row('Show', cCheck('maker.show')), row('Logo', cImage('maker.src', 'team')),
        row('Size', cRange('maker.size', 16, 160)), row('X', cRange('maker.x', 100, TW() - 100)), row('Y', cRange('maker.y', 40, TH() - 40)),
        swapBtn('Swap places with the league / conference stamps', swapStampsMaker),
        ...koRows('maker.ko'),
      ],
    },
  };
  // Layers: visibility, lock, movement link group, color link group
  const VIS = {
    line1: ['line1.show'], line2: ['line2.show'], extra: ['extra.show'], years: ['years.show'], mark: ['mark.show'], maker: ['maker.show'],
    stamps: ['stamps.items.0.show', 'stamps.items.1.show'], spine: ['spine.show'], ties: ['ties.top.show', 'ties.bottom.show'],
    pattern: [() => (isB() ? 'bnr.show' : null) || ({ classic: 'stripes.show', hoops: 'hoops.show', hockey: 'hockey.show', edge: 'edge.show', split: 'split.show', bands: 'bands.show', gridiron: 'grid.show' })[st.d.template]],
  };
  const GROUPS = ['', 'A', 'B', 'C', 'D'];
  // Layers panel. It is locked down until you press "Edit layers": then the drag handles, show, locks and
  // link groups wake up; press "Done" to lock it back down. Rows run top to bottom the way parts stack.
  function layersPanel() {
    const edit = !!st.layerEdit;
    const toggle = h('button', { class: 'lyr-edit' + (edit ? ' on' : ''), type: 'button',
      title: edit ? 'Lock the layers back down' : 'Unlock the layers to reorder, lock and link them',
      onclick: () => { st.layerEdit = !edit; buildPanel(); toast(st.layerEdit ? 'Layers unlocked: drag ⠿ to restack, then press Done' : 'Layers locked down', 2400); } },
      edit ? '✓ Done' : '✎ Edit layers');
    const wrap = h('div', { class: 'layers' + (edit ? ' editing' : ' locked') },
      h('div', { class: 'lyr-bar' }, h('span', { class: 'fine' }, edit ? 'Drag ⠿ to move a part above or below another.' : 'Locked down. Press Edit layers to change them.'), toggle),
      h('div', { class: 'lrow lhead' }, h('span', {}), h('span', {}, 'Layer'), h('span', { title: 'Show' }, 'Show'), h('span', { title: 'Lock in place' }, 'Lock'), h('span', { title: 'Layers with the same letter move together' }, 'Move'), h('span', { title: 'Layers with the same letter change colors together' }, 'Color')));
    const label = (k) => (isSched() && SCHED_NAMES[k]) || (isGame() && GAME_NAMES[k]) || (isC() && CARD_NAMES[k]) || (isP() && POSTER_NAMES[k]) || (PM.LAYERS_ALL.find(([q]) => q === k) || [k, k])[1];
    const isSel = (k) => st.sel && (PART_SEC[st.sel] === k || (k === 'pattern' && PART_SEC[st.sel] === 'pattern'));
    const rowFor = (k, stackable) => {
      const L = PM.layer(st.d, k), movable = PM.LAYER_KEYS.includes(k);
      const visPaths = (VIS[k] || []).map((x) => (typeof x === 'function' ? x() : x));
      const vis = visPaths.length ? h('input', { type: 'checkbox', checked: visPaths.some((q) => get(q)), title: 'Show / hide', disabled: !edit }) : h('span');
      if (visPaths.length) vis.addEventListener('change', () => { snapshot(true); visPaths.forEach((q) => set(q, vis.checked)); buildPanel(); queueRender(); });
      const lock = movable ? h('button', { class: 'lk' + (L.lock ? ' on' : ''), disabled: !edit, title: L.lock ? 'Unlock' : 'Lock in place', onclick: () => setLayer(k, 'lock', !L.lock) }, L.lock ? '🔒' : '🔓') : h('span');
      const grp = (kind) => {
        const sel = h('select', { class: 'grp' + (L[kind] ? ' g' + L[kind] : ''), disabled: !edit }, GROUPS.map((g) => h('option', { value: g, selected: (L[kind] || '') === g }, g || '—')));
        sel.addEventListener('change', () => setLayer(k, kind, sel.value));
        return sel;
      };
      const canDrag = edit && stackable && !L.lock;
      const grip = stackable ? h('button', { class: 'grip', type: 'button', disabled: !canDrag,
        title: !edit ? 'Press Edit layers to restack' : L.lock ? 'Locked: unlock it to restack' : 'Drag to move above or below other parts (or use the arrow keys)' }, '⠿') : h('span', { class: 'grip-none' });
      const name = h('button', { class: 'lname', onclick: () => select(k === 'pattern' ? 'pattern' : k) }, label(k));
      if (IMG_SLOT[k]) { dropTarget(name, k); name.title = 'Click to edit · drop an image here'; }
      const r = h('div', { class: 'lrow' + (isSel(k) ? ' sel' : '') + (stackable ? ' stk' : ' fixed') }, grip, name, vis, lock, movable ? grp('move') : h('span'), grp('color'));
      r.dataset.key = k;
      if (canDrag) dragRow(grip, r);
      return r;
    };
    // stacking parts, top first (years only on banners)
    const stack = PM.stackOf(st.d).filter((k) => k !== 'years' || isB()).reverse();
    for (const k of stack) wrap.append(rowFor(k, true));
    wrap.append(h('div', { class: 'lyr-div' }, 'Underneath (always at the bottom)'));
    for (const k of isP() ? ['field'] : ['pattern', 'spine', 'ties', 'field']) wrap.append(rowFor(k, false));
    wrap.append(h('p', { class: 'fine', style: 'margin:6px 0 0' },
      "The top row is drawn over everything below it. Same letter under Move = they drag and slide together. Same letter under Color = changing a color on one changes that same color on the others. Locked layers can't be moved, restacked or clicked, and auto-layout leaves them alone."));
    return wrap;

    // Save a new top-to-bottom order of the stacking rows.
    function restack(topFirst, movedKey) {
      const full = PM.stackOf(st.d), hidden = full.filter((k) => !topFirst.includes(k)); // years on a pennant keeps its place
      const bottomFirst = topFirst.slice().reverse();
      hidden.forEach((k) => bottomFirst.splice(Math.min(full.indexOf(k), bottomFirst.length), 0, k));
      if (bottomFirst.join() === full.join()) return;
      snapshot(true); st.d.stack = bottomFirst; buildPanel(); queueRender();
      const i = topFirst.indexOf(movedKey);
      toast(`${label(movedKey)} is now ${i === 0 ? 'on top' : i === topFirst.length - 1 ? 'at the bottom' : `under ${label(topFirst[i - 1])}`}`, 2200);
    }
    function dragRow(grip, r) {
      const order = () => [...wrap.querySelectorAll('.lrow.stk')].map((x) => x.dataset.key);
      grip.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const o = order(), i = o.indexOf(r.dataset.key), j = i + (e.key === 'ArrowUp' ? -1 : 1);
        if (j < 0 || j >= o.length) return;
        o.splice(i, 1); o.splice(j, 0, r.dataset.key); restack(o, r.dataset.key);
        requestAnimationFrame(() => { const g = document.querySelector(`.layers .lrow[data-key="${r.dataset.key}"] .grip`); if (g) g.focus(); });
      });
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault(); grip.setPointerCapture(e.pointerId);
        const rows = [...wrap.querySelectorAll('.lrow.stk')], y0 = e.clientY;
        let to = rows.indexOf(r);
        r.classList.add('dragging');
        const move = (ev) => {
          r.style.transform = `translateY(${ev.clientY - y0}px)`;
          // where it would land: before the first other row whose middle is below the pointer
          const others = rows.filter((x) => x !== r);
          let idx = others.findIndex((x) => { const b = x.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
          if (idx < 0) idx = others.length;
          to = idx;
          rows.forEach((x) => x.classList.remove('drop-above', 'drop-below'));
          if (others[idx]) others[idx].classList.add('drop-above'); else if (others.length) others[others.length - 1].classList.add('drop-below');
        };
        const up = () => {
          grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
          rows.forEach((x) => x.classList.remove('drop-above', 'drop-below', 'dragging')); r.style.transform = '';
          const o = rows.map((x) => x.dataset.key).filter((k) => k !== r.dataset.key);
          o.splice(to, 0, r.dataset.key); restack(o, r.dataset.key);
        };
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
      });
    }
  }
  SECTIONS.layers = { title: 'Layers', build: () => [layersPanel()] };

  const ORDER = ['layers', 'palette', 'field', 'spine', 'ties', 'pattern', 'stamps', 'mark', 'line1', 'line2', 'years', 'extra', 'maker'];

  // Long sections fold into subsections (Outlines, Knockout, Effects, Position…), each with its own
  // triangle. They start open on a computer and closed on a phone; whatever you open or close is remembered.
  const phone = () => window.matchMedia('(max-width: 860px)').matches;
  function foldSubs(key, items) {
    st.subOpen = st.subOpen || {};
    const out = []; let grp = null;
    for (const el of [items].flat(Infinity)) {
      if (el == null || el === false) continue;
      if (el.classList && el.classList.contains('sub')) { grp = { title: el.textContent, kids: [] }; out.push(grp); continue; }
      (grp ? grp.kids : out).push(el);
    }
    return out.flatMap((g) => {
      if (g.nodeType) return [g];
      if (!g.kids.length) return [];
      const id = key + '/' + g.title, open = st.subOpen[id] ?? !phone();
      const dt = h('details', { class: 'subsec', open }, h('summary', {}, g.title), h('div', { class: 'sub-body' }, g.kids));
      dt.addEventListener('toggle', () => { st.subOpen[id] = dt.open; });
      return [dt];
    });
  }
  function secEl(key, open) {
    const s = SECTIONS[key];
    const body = h('div', { class: 'sec-body' });
    const dt = h('details', { class: 'sec' + (open ? ' hl' : ''), open }, h('summary', {}, typeof s.title === 'function' ? s.title() : s.title), body);
    dt.dataset.sec = key;
    let built = false;
    const build = () => { if (!built) { body.append(...foldSubs(key, s.build())); built = true; } };
    if (open) build();
    dt.addEventListener('toggle', () => { if (dt.open) build(); });
    return dt;
  }

  // ---------- AUTO ----------
  function teamSearch(onPick) {
    const input = h('input', { type: 'search', placeholder: 'Any team: pro, college, minor league or defunct (e.g. Seahawks, Albany Firebirds)' });
    const results = h('div', { class: 'results' });
    const chips = h('div', { class: 'chips' }, PM.sources.ESPN.map((l) => {
      const c = h('input', { type: 'checkbox', checked: st.leagues.includes(l.id) });
      c.addEventListener('change', () => { st.leagues = c.checked ? [...st.leagues, l.id] : st.leagues.filter((x) => x !== l.id); });
      return h('label', {}, c, l.label);
    }));
    const showResults = () => {
      results.innerHTML = '';
      if (!st.results.length) return;
      st.results.forEach((t) => results.append(h('button', { class: 'result', onclick: () => onPick(t) },
        t.logo ? h('img', { src: PM.sources.proxied(t.logo), alt: '' }) : h('div', { style: 'width:36px;height:36px;border-radius:6px;background:var(--chip);display:grid;place-items:center;font-size:10px;color:var(--muted)' }, 'logo'),
        h('div', { class: 'meta' }, h('b', {}, t.name), h('small', {}, `${t.leagueLabel || ''}${t.years ? ' · ' + t.years : ''} · ${t.source}`)),
        h('div', { class: 'dots' }, [t.primary, t.secondary, t.tertiary].filter(Boolean).map((c) => h('i', { style: `background:${PM.colors.norm(c)}` }))))));
    };
    const go = async () => {
      const q = input.value.trim(); if (!q) return;
      results.innerHTML = '<small>Searching ESPN, TheSportsDB and Wikipedia…</small>';
      try { st.results = await PM.sources.search(q, st.leagues, { vintage: st.era.on }); }
      catch (e) { st.results = []; results.innerHTML = '<small>Lookup failed: ' + PM.esc(e.message) + '</small>'; return; }
      if (!st.results.length) { results.innerHTML = '<small>No matches. Try fewer words, tick more leagues, or use your own colors below.</small>'; return; }
      showResults();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    showResults();
    const hs = h('p', { class: 'fine', style: 'margin:6px 0 0' }, 'High school team? ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); PM.sources.openExternal(PM.sources.maxprepsUrl(input.value)); } }, 'Find its logo on MaxPreps ↗'),
      ', copy the logo image address, then use "Or use your own team" below or Primary mark → Link.');
    const minors = h('p', { class: 'fine', style: 'margin:4px 0 0' }, 'Minor-league or defunct team not showing? Look it up on ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); PM.sources.openExternal(PM.sources.funWhileItLastedUrl(input.value)); } }, 'Fun While It Lasted ↗'), ' or ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); PM.sources.openExternal(PM.sources.sportsLogosUrl(input.value)); } }, 'SportsLogos.net ↗'),
      ', then drag the logo onto Primary mark (or copy its image address into Link).');
    return h('div', {}, h('div', { class: 'search' }, input, h('button', { class: 'primary', onclick: go }, 'Search')), chips, hs, minors, results);
  }

  st.autoTpl = st.autoTpl || 'classic'; // Vintage Baseball unless you pick another background (or Match the sport)
  async function pickTeam(t, base) {
    if (st.era.on) {
      toast(`Finding the ${st.era.year} logo for ${t.name}…`, 6000);
      t = await PM.auto.withEra(t, st.era.year, st.era.useName);
      if (t.eraMissing) toast('No logo history found, using the current logo', 3000);
    }
    if (t.source === 'Wikipedia') t = await PM.sources.wikiDetails(t); // logo, colors, league, years from the team's page
    if (!base && isP()) {
      // cards in the '87 family follow the sport: basketball gets the parquet floor
      let tpl = st.d.template;
      if (isC() && /^card(Wood|Parquet)$/.test(tpl)) tpl = PM.auto.templateFor(t) === 'hoops' ? 'cardParquet' : 'cardWood';
      base = PM.auto.posterBase(tpl, PM.productOf(st.d)); base.pst = clone(st.d.pst);
      if (!isC() && !isSched() && !isGame()) { const m = st.d.mark; Object.assign(base.mark, { show: m.show, x: m.x, y: m.y, size: m.size, opacity: m.opacity }); }
      base.sched = clone(st.d.sched); base.game = clone(st.d.game);
      if (isSched() || isGame()) { base.line1.text = st.d.line1.text; base.extra.text = st.d.extra.text; }
    }
    if (!base && isB()) base = PM.auto.bannerBase(st.autoTplB, st.d.bnr.shape);
    if (!base) { base = PM.auto.baseFor(t, st.autoTpl); if (st.d.template === base.template) base.stripes.order = st.d.stripes.order; }
    toast('Building ' + t.name + '…', 6000);
    const d = await PM.auto.fromTeam(t, base, { wordmark: st.useWordmark !== false, banner: bannerOpts(), poster: posterOpts() });
    st.lastTeam = t;
    if (d.template === 'posterSchedule' && t.espnId) {
      try { const n = await loadSchedule(t, d); toast(`${n} games loaded from ESPN`, 3000); } catch (e) { toast(e.message, 5000); }
    }
    replaceDesign(d);
    toast(t.name + (t.eraLabel ? ` (${t.eraLabel} logo)` : '') + ' ready' + ((PM.isBanner(d) ? d.extra : d.line2).autoImg ? ` with the team's wordmark (${(PM.isBanner(d) ? d.extra : d.line2).imgFrom})` : '') +
      (d.mark.src ? '' : ' — no logo found, add one under Primary mark'), 4200);
  }

  // Team logo on a poster: its usual spot, a see-through or solid logo in a corner of the photo, or none.
  function logoToCorner(d, c) {
    const b = PM.posterBox(d), m = d.mark, s = Math.round(Math.min(b.w, b.h) * 0.17), pad = 28;
    m.show = true; m.size = s; m.knockout.on = false;
    m.x = Math.round(c[1] === 'l' ? b.x + pad + s / 2 : b.x + b.w - pad - s / 2);
    m.y = Math.round(c[0] === 't' ? b.y + pad + s / 2 : b.y + b.h - pad - s / 2);
  }
  const logoMode = () => { const m = st.d.mark; if (!m.show) return 'off'; const c = (st.d.pst || {}).logoCorner; return c === 'faint' || c === 'solid' ? c : 'spot'; };
  function setLogoMode(d, mode) {
    d.pst.logoCorner = mode;
    if (mode === 'off') { d.mark.show = false; return; }
    if (mode === 'spot') {
      const def = (PM.TEMPLATES[d.template].defaults || {}).mark || {};
      Object.assign(d.mark, { show: true, opacity: 1, x: def.x ?? d.mark.x, y: def.y ?? d.mark.y, size: def.size ?? d.mark.size });
      if (!def.show) d.mark.show = false;
      return;
    }
    logoToCorner(d, 'br'); d.mark.opacity = mode === 'faint' ? 0.35 : 1;
  }
  // ---------- Schedules and game days ----------
  async function loadSchedule(team, d = st.d) {
    toast(`Getting the ${team.name} schedule from ESPN…`, 8000);
    const r = await PM.sources.espnSchedule(team);
    d.sched.text = r.lines.join('\n'); d.sched.logos = {};
    const names = Object.keys(r.logos);
    for (let i = 0; i < names.length; i += 6) {                     // a few logos at a time
      await Promise.all(names.slice(i, i + 6).map(async (n) => { try { d.sched.logos[n] = await PM.sources.smallLogo(r.logos[n]); } catch {} }));
    }
    if (r.season) d.line1.text = `${r.season} Schedule`;
    return r.lines.length;
  }
  // Turn one game into a game-day poster (keeps the team, colors, photo and schedule).
  function makeGameDay(g) {
    const d = PM.setTemplate(clone(st.d), 'posterGameDay');
    Object.assign(d.game, { opp: g.opp, ha: g.ha, oppLogo: (st.d.sched.logos || {})[g.opp] || null, us: d.game.us || (st.lastTeam && (st.lastTeam.nickname || st.lastTeam.name)) || '' });
    d.line2.text = 'Game Day'; d.line2.show = true; d.line2.useImg = false;
    d.line1.text = [g.date, g.time].filter(Boolean).join(' · '); d.line1.show = true;
    replaceDesign(d); toast(`Game day: ${g.ha === '@' ? 'at' : 'vs'} ${g.opp}`, 2600);
  }
  function gamePicker() {
    const games = PM.parseSchedule(st.d.sched && st.d.sched.text);
    if (!games.length) return null;
    const sel = h('select', {}, games.map((g, i) => h('option', { value: i }, `${g.date}  ${g.ha === '@' ? '@' : 'vs'} ${g.opp}${g.time ? '  ' + g.time : ''}`)));
    return row('Game-day poster', h('div', { class: 'col' }, sel, h('button', { class: 'swap', type: 'button', onclick: () => makeGameDay(games[+sel.value]) }, 'Make it')));
  }
  function schedRows() {
    const ics = h('input', { type: 'file', accept: '.ics,text/calendar', hidden: true });
    ics.addEventListener('change', async () => {
      const f = ics.files[0]; if (!f) return;
      const lines = PM.sources.icsSchedule(await f.text(), st.lastTeam ? st.lastTeam.name : st.d.line2.text);
      ics.value = '';
      if (!lines.length) { toast('No games found in that calendar file', 3500); return; }
      change('sched.text', lines.join('\n')); buildPanel(); toast(`${lines.length} games imported`, 2600);
    });
    const ta = h('textarea', { rows: 9, value: st.d.sched.text || '', placeholder: 'One game per line, e.g.\nFri Sep 5 | vs | Central | 7:00 PM\nSep 12 @ North 7pm\n(or paste rows copied from a schedule table)' });
    ta.addEventListener('input', () => change('sched.text', ta.value));
    binders.push(() => { if (document.activeElement !== ta) ta.value = st.d.sched.text || ''; });
    const t = st.lastTeam;
    return [
      h('div', { class: 'btns' },
        t && t.espnId ? h('button', { class: 'primary', onclick: async () => { try { snapshot(true); const n = await loadSchedule(t); buildPanel(); queueRender(); toast(`${n} games loaded from ESPN`, 3000); } catch (e) { toast(e.message, 5000); } } }, `Get the ${t.nickname || t.name} schedule (ESPN)`) : null,
        h('button', { onclick: () => ics.click() }, 'Import calendar file (.ics)'), ics),
      row('Games', ta),
      h('p', { class: 'fine', style: 'margin:0' }, t && t.espnId ? 'Edit any line. Home games (vs) are shaded.' : 'Pro and major college teams load from ESPN once you pick the team. For high school, youth and minor-league teams, use the calendar file most schedule sites (MaxPreps, team and league sites) offer, or copy the schedule table and paste it here.'),
      gamePicker(),
      row('Opponent logos', cCheck('sched.showLogos', 'Show them (when loaded from ESPN)')),
      row('Shade home games', cCheck('sched.shade')),
      row('Font', cFont('sched.font')),
      row('Panel', cColor('pst.panel')), row('Shading color', cColor('pst.bandColor')),
    ];
  }
  function gameRows() {
    const txt = (path, ph, after) => { const i = h('input', { type: 'text', value: get(path) || '', placeholder: ph }); i.addEventListener('input', () => { change(path, i.value); if (after) after(i.value); }); return i; };
    return [
      row('Opponent', txt('game.opp', 'e.g. Central Wildcats')),
      row('Their logo', cImage('game.oppLogo', 'team')),
      row('Home or away', cSelect('game.ha', [['vs', 'Home (VS)'], ['@', 'Away (@)']])),
      row('Your team', txt('game.us', 'Short name under your logo')),
      row('Date & time', txt('line1.text', 'e.g. Fri Sep 5 · 7:00 PM', (v) => change('line1.show', !!v))),
      row('Place', txt('extra.text', 'e.g. Memorial Stadium', (v) => change('extra.show', !!v))),
      gamePicker(),
    ];
  }
  // Poster text the user typed in Automatic.
  function posterOpts() { return { player: st.poster.player || (isP() ? st.d.line2.text : ''), signature: st.poster.signature, caption: st.poster.caption }; }
  function posterCard() {
    const inp = (key, ph, apply) => {
      const fromDesign = key === 'player' && st.d.line2.text !== 'Player Name' ? st.d.line2.text : '';
      const i = h('input', { type: 'text', value: st.poster[key] || fromDesign || '', placeholder: ph });
      i.addEventListener('input', () => { st.poster[key] = i.value; apply(i.value); });
      return i;
    };
    const caption = () => [st.lastTeam && st.lastTeam.name, (st.poster.caption || '').trim()].filter(Boolean).join('  ·  ');
    if (isSched()) return h('div', { class: 'card' }, h('h3', {}, 'Schedule poster'),
      h('div', { class: 'sec-body', style: 'padding:0' }, row('Style', cTemplate()), ...schedRows()));
    if (isGame()) return h('div', { class: 'card' }, h('h3', {}, 'Game day poster'),
      h('div', { class: 'sec-body', style: 'padding:0' }, row('Style', cTemplate()), row('Photo', cPhoto()), ...gameRows()));
    if (isC()) return h('div', { class: 'card' }, h('h3', {}, 'Card'),
      h('div', { class: 'sec-body', style: 'padding:0' },
        row('Style', cTemplate()),
        row('Photo', cPhoto()),
        row('Name', inp('player', 'e.g. Jordan Smith', (v) => change('line2.text', v || 'Player Name'))),
        row('Position', inp('caption', 'e.g. Shortstop', (v) => change('line1.text', v || 'Position'))),
        h('p', { class: 'fine', style: 'margin:0' }, "Pick a team below for its colors, logo and name. Baseball and the rest get the wood-grain '87 card; basketball gets the parquet floor. More styles under Style.")));
    const logoSel = h('select', {}, [['spot', 'In its usual spot'], ['faint', 'See-through, in a photo corner'], ['solid', 'Solid, in a photo corner'], ['off', 'None']]
      .map(([v, l]) => h('option', { value: v, selected: logoMode() === v }, l)));
    logoSel.addEventListener('change', () => { snapshot(true); setLogoMode(st.d, logoSel.value); buildPanel(); queueRender(); });
    return h('div', { class: 'card' }, h('h3', {}, 'Poster'),
      h('div', { class: 'sec-body', style: 'padding:0' },
        row('Style', cTemplate()),
        row('Photo', cPhoto()),
        row('Team logo', logoSel),
        row('Name', inp('player', 'e.g. Jordan Smith', (v) => { change('line2.text', v || 'Player Name'); if (!st.poster.signature) change('extra.text', v || 'Player Name'); })),
        row('Signature', inp('signature', 'Same as the name', (v) => change('extra.text', v || st.poster.player || st.d.line2.text))),
        row('Caption', inp('caption', 'e.g. Shortstop · 2026 (team name is added)', () => { change('line1.text', caption()); change('line1.show', !!caption()); })),
        h('p', { class: 'fine', style: 'margin:0' }, 'Pick a team below for its colors and logos, or set colors under Team colors. Drop a photo anywhere on the poster.')));
  }
  // Banner text the user typed in Automatic ('' kicker = from the team's league).
  function bannerOpts() { return { kicker: st.banner.kicker, title: st.banner.title || 'CHAMPIONS', years: st.banner.years || (isB() ? st.d.years.text : '') }; }
  function bannerCard() {
    const inp = (key, ph, apply) => {
      const i = h('input', { type: 'text', value: st.banner[key] || '', placeholder: ph });
      i.addEventListener('input', () => { st.banner[key] = i.value; apply(i.value); });
      return i;
    };
    const yrs = h('textarea', { rows: 2, value: st.banner.years || st.d.years.text || '', placeholder: '1986, 2004, 2007, 2013, 2018' });
    yrs.addEventListener('input', () => { st.banner.years = yrs.value; change('years.text', yrs.value); });
    return h('div', { class: 'card' }, h('h3', {}, 'Banner lettering'),
      h('div', { class: 'sec-body', style: 'padding:0' },
        row('Top line', inp('kicker', 'From the league (e.g. WORLD SERIES)', (v) => change('line1.text', v || PM.auto.kickerFor(st.lastTeam)))),
        row('Big line', inp('title', 'CHAMPIONS', (v) => change('line2.text', v || 'CHAMPIONS'))),
        row('Years', yrs),
        row('Shape', cSelect('bnr.shape', PM.BANNER_SHAPES)),
        h('p', { class: 'fine', style: 'margin:0' }, 'Separate years with commas or spaces. They line up in rows automatically (change it under Manual → Championship years).')));
  }
  function buildAuto(p) {
    p.append(
      h('h2', {}, 'Automatic'),
      h('p', { class: 'lead' }, isSched() ? "Pick a team: its colors and logo fill in, and pro and major college schedules load from ESPN. Or import a calendar file or paste the schedule." : isGame() ? "Add a photo, pick your team, then set the opponent, date and place (or pick a game from a loaded schedule)." : isC() ? 'Add a photo, a name and a position, then pick a team for its colors and logo.' : isP() ? 'Add a photo and a name, then pick a team for the colors and logos.' : isB() ? 'Pick a team for a championship banner. Colors, logo, league stamps and wordmark are filled in; add the title and years below.' : 'Pick a team. Colors, logo, league stamps and wordmark are filled in for you.'),
      isP() ? posterCard() : isB() ? bannerCard() : null,
      h('div', { class: 'card' }, h('h3', {}, 'Find a team'), teamSearch((t) => pickTeam(t)),
        isP() ? null : h('div', { class: 'row', style: 'margin-top:10px' }, h('span', {}, 'Background'), cTplChoice()),
        isP() ? null : h('label', { class: 'row', style: 'margin-top:6px;gap:8px;justify-content:flex-start' }, (() => {
          const c = h('input', { type: 'checkbox', checked: st.useWordmark !== false });
          c.addEventListener('change', () => { st.useWordmark = c.checked; });
          return c;
        })(), h('span', {}, "Use the team's own wordmark when one is found (instead of a font)")),
        h('div', { class: 'row', style: 'margin-top:6px' }, h('span', {}, 'Logo era'), cEra())),
    );
    if (st.lastTeam && st.lastTeam.eras && st.lastTeam.eras.length > 1) {
      p.append(h('div', { class: 'card' }, h('h3', {}, 'Logo history: ' + (st.lastTeam.wikiTitle || st.lastTeam.name)),
        h('div', { class: 'finder' }, h('div', { class: 'grid' }, st.lastTeam.eras.map((e) => h('button', {
          title: `${e.team}, ${e.from}–${e.to}`, onclick: async () => { try { change('mark.src', await PM.sources.imageData(e.url)); } catch (er) { toast(er.message); } },
        }, h('img', { src: PM.sources.proxied(e.url) }), `${e.from}–${e.to >= new Date().getFullYear() ? 'now' : String(e.to).slice(2)}`))))));
    }
    if (st.lastTeam && st.lastTeam.logos && st.lastTeam.logos.length > 1) {
      p.append(h('div', { class: 'card' }, h('h3', {}, 'Other logos for ' + st.lastTeam.name),
        h('div', { class: 'finder' }, h('div', { class: 'grid' }, st.lastTeam.logos.map((l) => h('button', {
          title: l.tag, onclick: async () => { try { const s = await PM.sources.imageData(l.url); change('mark.src', s); } catch (e) { toast(e.message); } },
        }, h('img', { src: PM.sources.proxied(l.url) }), l.tag.split(' ').slice(0, 2).join(' ')))))));
    }
    if (isP()) {
      p.append(h('div', { class: 'card' }, h('h3', {}, 'Quick tweaks'), h('div', { class: 'btns' },
        h('button', { onclick: () => replaceDesign(PM.auto.swapColors(clone(st.d))) }, 'Swap colors'),
        h('button', { onclick: () => setMode('guided') }, 'Walk through it'),
        h('button', { onclick: () => setMode('manual') }, 'Fine-tune manually'))));
      return;
    }
    const own = { name: '', l1: '', l2: '', p: '#7d2230', s: '#cdb27f', t: '', logo: null };
    const colorIn = (k) => { const i = h('input', { type: 'color', value: own[k] || '#000000' }); i.addEventListener('input', () => { own[k] = i.value; }); return i; };
    const logoIn = h('input', { type: 'file', accept: 'image/*' });
    logoIn.addEventListener('change', () => { const f = logoIn.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { own.logo = await PM.sources.trim(r.result); }; r.readAsDataURL(f); });
    const logoUrl = h('input', { type: 'url', placeholder: 'Paste image link (e.g. from MaxPreps)' });
    const l1 = h('input', { type: 'text', placeholder: 'Line 1 (small): e.g. Seattle' });
    const l2 = h('input', { type: 'text', placeholder: 'Line 2 (big): e.g. Seahawks' });
    const tChk = h('input', { type: 'checkbox' });
    p.append(h('div', { class: 'card' }, h('h3', {}, 'Or use your own team'),
      h('div', { class: 'sec-body', style: 'padding:0' },
        row('Line 1', l1), row('Line 2', l2),
        row('Colors', h('div', { class: 'col' }, colorIn('p'), colorIn('s'), h('label', { class: 'chk' }, tChk, '3rd'), colorIn('t'))),
        row('Logo', logoIn),
        row('Or logo link', logoUrl),
        h('button', {
          class: 'primary', onclick: async () => {
            const d = isB() ? PM.auto.bannerBase(st.autoTplB, st.d.bnr.shape) : PM.setTemplate(PM.defaultDesign(), st.autoTpl === 'match' ? st.d.template : st.autoTpl); if (own.logo) d.mark.src = own.logo;
            if (!own.logo && logoUrl.value.trim()) { try { d.mark.src = await PM.sources.imageData(logoUrl.value.trim()); } catch (e) { toast('Could not load that logo link: ' + e.message, 3500); } }
            d.stamps.items.forEach((s) => { s.show = false; });
            const team = { name: [l1.value, l2.value].filter(Boolean).join(' ') || 'Custom', location: l1.value, nickname: l2.value, primary: own.p, secondary: own.s, tertiary: tChk.checked ? own.t : null };
            replaceDesign(await PM.auto.fromTeam(team, d, { stamps: false, keepLogo: true, banner: bannerOpts() }));
          },
        }, 'Generate'))));
    p.append(h('div', { class: 'card' }, h('h3', {}, 'Quick tweaks'),
      h('div', { class: 'sec-body', style: 'padding:0' },
        row('Wordmark', cSelect('wordStyle', Object.entries(PM.colors.STYLES).map(([k, v]) => [k, v.label]), (v) => { const d = clone(st.d); PM.colors.applyPalette(d, d.palette, v); PM.auto.layoutText(d); replaceDesign(d, { rebuild: false }); })),
        row('Background', cTemplate()),
        st.d.template === 'classic' ? row('Stripes', cSelect('stripes.order', [['ABBA', 'Mirrored  A B / B A'], ['ABAB', 'Staggered  A B / A B']])) : null,
        h('div', { class: 'btns' },
          h('button', { onclick: () => replaceDesign(PM.auto.remix(clone(st.d))) }, 'Remix style'),
          h('button', { onclick: () => replaceDesign(PM.auto.swapColors(clone(st.d))) }, 'Swap colors'),
          h('button', { onclick: () => setMode('guided') }, 'Walk through it'),
          h('button', { onclick: () => setMode('manual') }, 'Fine-tune manually')))));
  }

  // ---------- GUIDED ----------
  const STEPS = [
    { title: 'Team & colors', secs: ['palette'], team: true, tip: 'Look up a team to fill colors, logo and stamps, or set 2–3 colors yourself and press Apply. Every later step starts from these.' },
    { title: 'Background & felt', secs: ['field'], tip: 'Pick the background design (Vintage Baseball, Hoops or Hockey), then the felt color. The margin is the thin felt border where the stripes stop.' },
    { title: 'Spine', secs: ['spine'], tip: 'Suggested: primary on the wide outer band, secondary on the thin inner band, light thread on both seams.' },
    { title: 'Ties', secs: ['ties'], tip: 'Suggested: secondary on top, primary on the bottom. Turn one off for a single-tie pennant.' },
    { title: 'Pattern', secs: ['pattern'], tip: 'Vintage Baseball: mirrored stripes (A B / B A) by default, staggered (A B / A B) if a stripe sits behind same-colored text. Vintage Hoops: dark corner wedges with thin accent stripes. Vintage Hockey: inset wedges, a center stripe that stops around the lettering, and a medallion behind the logo.' },
    { title: 'Stamps', secs: ['stamps'], tip: 'Up to two marks in the top corner, such as NCAA + SEC or MiLB + PCL. Use Find to search leagues.' },
    { title: 'Primary mark', secs: ['mark'], tip: 'The big logo. The felt-colored knockout outline keeps it readable over the stripes.' },
    { title: 'Wordmark', secs: ['line1', 'line2'], tip: 'Line 1 is the small top line (city or school), line 2 is the big name. Drag them on the pennant to move.' },
    { title: 'Extras', secs: ['extra', 'maker'], tip: 'Optional: a sub-line like BASEBALL or championship years, plus a small maker’s mark.' },
    { title: 'Finish', secs: [], finish: true, tip: 'Pick an output style below the preview and download, or Save the design to keep working on it later.' },
  ];
  const SUGGEST_KEYS = {
    spine: ['spine.outer', 'spine.inner', 'spine.stitch'], ties: ['ties.top.color', 'ties.bottom.color'],
    pattern: ['stripes.colorA', 'stripes.colorB', 'hoops.wedge', 'hoops.stripe', 'hockey.color', 'hockey.ringColor', 'edge.colorA', 'edge.colorB', 'split.top', 'split.bottom', 'split.divider', 'bands.colorA', 'bands.colorB', 'grid.field', 'grid.endzone', 'grid.lines', 'spine.outer', 'spine.inner'], mark: ['mark.knockout', 'mark.ring'],
    line1: ['line1.font', 'line1.fill', 'line1.o1', 'line1.o2', 'line1.shadow', 'line1.tail', 'line1.rotate'],
    line2: ['line2.font', 'line2.fill', 'line2.o1', 'line2.o2', 'line2.shadow', 'line2.tail', 'line2.rotate', 'line2.size', 'line2.y'],
    field: ['field.color'], extra: ['extra.fill'],
  };
  function applySuggestion(secs) {
    const tmp = PM.colors.applyPalette(clone(st.d), st.d.palette, st.d.wordStyle); PM.auto.layoutText(tmp);
    const d = clone(st.d);
    secs.forEach((s) => (SUGGEST_KEYS[s] || []).forEach((path) => {
      const v = path.split('.').reduce((o, k) => o[k], tmp);
      const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], d)[last] = clone(v);
    }));
    replaceDesign(d);
  }
  // Banner versions of the guided steps (same order, banner words).
  const BANNER_STEP = {
    'Background & felt': { title: 'Shape & felt', tip: 'Pick the banner background (Rafter, Two-Tone or Varsity Stripes), the shape of the bottom edge, and the felt color.' },
    Spine: { title: 'Top sleeve', tip: 'The folded sleeve the rod slides through. Suggested: the accent color with a thin cream band.' },
    Ties: { title: 'Cord & rod', tip: 'The hanging cord and the wooden rod. Turn either off for a flat banner.' },
    Pattern: { title: 'Trim', tip: 'Rafter: two-line trim around the edge. Two-Tone: a team-color block behind the logo. Varsity: stripes down both sides.' },
    Stamps: { tip: 'Up to two small marks under the sleeve, like the league and conference.' },
    Wordmark: { title: 'Title & years', secs: ['line1', 'line2', 'years'], tip: 'The top line (WORLD SERIES, STATE, CONFERENCE), the big line (CHAMPIONS) and the championship years.' },
    Extras: { title: 'Team name & extras', tip: 'The team name (or its wordmark) under the logo, and an optional maker’s mark.' },
  };
  const POSTER_STEPS = [
    { title: 'Style & colors', secs: ['field', 'palette'], team: true, tip: 'Color Frame: a team-color border with the name in caps across the top. Classic White: white paper, the name in a serif at the top left. Look up a team for its colors and logos.' },
    { title: 'Photo', secs: ['photo'], tip: 'Upload a photo (or drop one on the poster), then zoom and slide it so the player fills the frame.' },
    { title: 'Name & signature', secs: ['line2', 'extra'], tip: 'The name across the top, and a signature over the photo. Drag either on the poster to move it.' },
    { title: 'Logos & caption', secs: ['mark', 'stamps', 'line1'], tip: 'A team logo, small league or team logos in a corner, and a caption line like the team and position.' },
    { title: 'Finish', secs: [], finish: true, tip: 'Download it below the preview, or Save the design to keep working on it later.' },
  ];
  const CARD_STEPS = [
    { title: 'Style & colors', secs: ['field', 'palette'], team: true, tip: "Wood Grain '87 is the classic; Parquet Floor is the basketball version; Silver Arch and Clean White are late-80s looks. Look up a team for its colors and logo." },
    { title: 'Photo', secs: ['photo'], tip: 'Upload a photo (or drop one on the card), then zoom and slide it so the player fills the frame.' },
    { title: 'Name & position', secs: ['line2', 'line1', 'extra'], tip: 'The name on the color band, the position, and the team name where the style has room for it.' },
    { title: 'Logos', secs: ['mark', 'stamps', 'maker'], tip: 'The team logo, an optional league logo, and a set logo of your own (your team, league or tournament).' },
    { title: 'Finish', secs: [], finish: true, tip: 'Download it below the preview. Print PDF at Trading card size gives a real 2.5 x 3.5 in card with a cut line.' },
  ];
  const SCHED_STEPS = [
    { title: 'Team & colors', secs: ['field', 'palette'], team: true, tip: 'Look up the team: its colors and logo fill in, and pro and major college schedules load straight from ESPN.' },
    { title: 'Schedule', secs: ['schedule'], tip: 'Import a calendar file (most school and league sites offer one) or paste the schedule, one game per line. Edit any line right in the box.' },
    { title: 'Lettering', secs: ['line2', 'line1', 'extra'], tip: 'The team name, the season line under it, and a footer note.' },
    { title: 'Logos', secs: ['mark', 'stamps'], tip: 'The team logo up top, plus optional league or sponsor logos in the bottom corner.' },
    { title: 'Finish', secs: [], finish: true, tip: 'Download it below the preview, or print it up to 24 x 36 in.' },
  ];
  const GAME_STEPS = [
    { title: 'Team & colors', secs: ['field', 'palette'], team: true, tip: 'Look up your team for its colors and logo.' },
    { title: 'Photo', secs: ['photo'], tip: 'A big action shot fills the top. Zoom and slide it to frame it.' },
    { title: 'Opponent & game', secs: ['game', 'line1', 'extra'], tip: "Who you're playing (their logo has a Find button), home or away, and the date, time and place." },
    { title: 'Finish', secs: [], finish: true, tip: 'Download it for social media or print it.' },
  ];
  const stepsNow = () => (isSched() ? SCHED_STEPS : isGame() ? GAME_STEPS : isC() ? CARD_STEPS : isP() ? POSTER_STEPS : isB() ? STEPS.map((x) => Object.assign({}, x, BANNER_STEP[x.title] || {})) : STEPS);
  function buildGuided(p) {
    const STEPS = stepsNow();
    if (st.step >= STEPS.length) st.step = 0;
    const s = STEPS[st.step];
    p.append(h('h2', {}, 'Guided'),
      h('div', { class: 'steps' }, STEPS.map((x, i) => h('button', { class: i === st.step ? 'on' : i < st.step ? 'done' : '', onclick: () => { st.step = i; st.sel = null; buildPanel(); queueRender(); } }, `${i + 1}. ${x.title}`))),
      h('div', { class: 'suggest' }, h('b', {}, `Step ${st.step + 1}: ${s.title}. `), s.tip));
    if (s.team) p.append(h('div', { class: 'card' }, h('h3', {}, 'Look up a team (optional)'), teamSearch((t) => pickTeam(t, st.d)), h('div', { class: 'row', style: 'margin-top:8px' }, h('span', {}, 'Logo era'), cEra())));
    s.secs.forEach((k) => p.append(secEl(k, true)));
    if (s.secs.some((k) => SUGGEST_KEYS[k])) p.append(h('div', { class: 'btns' }, h('button', { onclick: () => applySuggestion(s.secs) }, 'Reset this step to the suggestion')));
    if (s.finish) p.append(h('div', { class: 'btns' }, h('button', { onclick: () => setMode('manual') }, 'Open everything in Manual'), h('button', { onclick: saveDesign }, 'Save design')));
    p.append(h('div', { class: 'nav' },
      h('button', { disabled: st.step === 0, onclick: () => { st.step--; buildPanel(); queueRender(); } }, '← Back'),
      h('button', { class: 'primary', disabled: st.step === STEPS.length - 1, onclick: () => { st.step++; buildPanel(); queueRender(); } }, 'Next →')));
    const focus = { spine: 'spine', ties: 'tieTop', pattern: 'pattern', stamps: 'stamps', mark: 'mark', line1: 'line2', field: 'field', extra: 'extra' }[s.secs[0]];
    if (!st.sel || !s.secs.includes(PART_SEC[st.sel])) st.sel = focus || null;
  }

  // ---------- MANUAL ----------
  function buildManual(p) {
    p.append(h('h2', {}, 'Manual'), h('p', { class: 'lead' }, `Every part is editable. Click a part on the ${PM.productOf(st.d)} to jump to it.`));
    const selSec = PART_SEC[st.sel];
    (isSched() ? ['layers', 'palette', 'field', 'schedule', 'line2', 'line1', 'extra', 'mark', 'stamps']
      : isGame() ? ['layers', 'palette', 'field', 'photo', 'game', 'line2', 'line1', 'extra', 'mark']
      : isC() ? ['layers', 'palette', 'field', 'photo', 'line2', 'line1', 'extra', 'mark', 'stamps', 'maker']
      : isP() ? ['layers', 'palette', 'field', 'photo', 'line2', 'extra', 'line1', 'mark', 'stamps'] : ORDER.filter((k) => k !== 'years' || isB()))
      .forEach((k) => p.append(secEl(k, k === selSec || k === 'layers')));
    p.append(h('div', { class: 'scroll-pad' })); // room to bring even the last section up to the top
  }

  // ---------- BULK ----------
  function buildBulk(p) {
    const ta = h('textarea', { rows: 9, value: st.bulkCsv || PM.bulk.sample() });
    ta.addEventListener('input', () => { st.bulkCsv = ta.value; });
    const csvIn = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true });
    csvIn.addEventListener('change', () => { const f = csvIn.files[0]; if (!f) return; f.text().then((t) => { ta.value = t; st.bulkCsv = t; }); });
    const logos = h('input', { type: 'file', accept: 'image/*', multiple: true });
    const logoCount = h('small', {}, st.bulkFiles.length ? `${st.bulkFiles.length} files loaded` : '');
    logos.addEventListener('change', () => { st.bulkFiles = [...logos.files]; logoCount.textContent = `${st.bulkFiles.length} files loaded`; });
    const outs = { png: true, svg: false, felt: true, aged: false, pixel: false, sheet: true };
    const outChk = (k, label) => { const c = h('input', { type: 'checkbox', checked: outs[k] }); c.addEventListener('change', () => { outs[k] = c.checked; }); return h('label', { class: 'chk' }, c, label); };
    const feltBg = h('select', {}, h('option', { value: 'wall' }, 'Beige wall'), h('option', { value: 'transparent' }, 'Transparent'));
    const sheetStyle = h('select', {}, h('option', { value: 'felt' }, 'Felt'), h('option', { value: 'flat' }, 'Flat'), h('option', { value: 'aged' }, 'Aged'), h('option', { value: 'pixel' }, '8-bit'));
    const log = h('div', { class: 'log' }, 'Ready.');
    const thumbs = h('div', { class: 'thumbs' });
    const dl = h('button', { class: 'primary', hidden: !st.bulkOut, onclick: () => st.bulkOut && PM.out.download(st.bulkOut, 'pennants.zip') }, 'Download ZIP');
    const say = (m) => { log.textContent += '\n' + m; log.scrollTop = 1e9; };
    const run = h('button', {
      class: 'primary', onclick: async () => {
        const rows = PM.bulk.parseCSV(ta.value);
        if (!rows.length) { toast('No rows found in the CSV'); return; }
        run.disabled = true; dl.hidden = true; thumbs.innerHTML = ''; log.textContent = `Making ${rows.length} pennants…`;
        const files = [], sheetC = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i], slug = (r.name || 'pennant-' + (i + 1)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          say(`[${i + 1}/${rows.length}] ${r.name || slug}`);
          try {
            const d = await PM.bulk.designForRow(r, st.bulkFiles, PM.defaultDesign(), say);
            files.push({ name: `designs/${slug}.pennant.json`, data: JSON.stringify(d) });
            if (outs.png) files.push({ name: `flat/${slug}.png`, data: await PM.out.canvasBlob(await PM.out.flat(d, { width: 2400 })) });
            if (outs.svg) files.push({ name: `vector/${slug}.svg`, data: await PM.out.svg(d) });
            let feltC = null;
            if (outs.felt) { feltC = await PM.out.felt(d, { width: 2400, bg: feltBg.value }); files.push({ name: `felt/${slug}.png`, data: await PM.out.canvasBlob(feltC) }); }
            if (outs.aged) files.push({ name: `aged/${slug}.png`, data: await PM.out.canvasBlob(await PM.out.felt(d, { width: 2400, bg: feltBg.value, aged: true })) });
            if (outs.pixel) files.push({ name: `8bit/${slug}.png`, data: await PM.out.canvasBlob(await PM.out.pixel(d, { width: 2000, pixels: 128, preset: 'nes' })) });
            if (outs.sheet) {
              const sc = sheetStyle.value === 'felt' && feltC && feltBg.value === 'transparent' ? feltC : await PM.out.render(d, sheetStyle.value, { width: 1200, bg: sheetStyle.value === 'felt' ? 'transparent' : null });
              sheetC.push(sc);
              thumbs.append(h('img', { src: sc.toDataURL('image/png'), title: r.name }));
            }
          } catch (e) { say('  ✖ failed: ' + e.message); console.error(e); }
        }
        if (outs.sheet && sheetC.length) { say('Building contact sheet…'); files.push({ name: 'contact-sheet.png', data: await PM.out.canvasBlob(await PM.out.sheet(sheetC, { cols: 2 })) }); }
        st.bulkOut = await PM.zip(files);
        say(`Done. ${files.length} files.`); run.disabled = false; dl.hidden = false;
      },
    }, 'Make pennants');
    p.append(h('h2', {}, 'Bulk maker'),
      h('p', { class: 'lead' }, 'One row per pennant. Leave colors or logo blank (or write auto) to pull them from the databases. Logo cells can be an uploaded file name or an image link.'),
      h('div', { class: 'card' }, h('h3', {}, '1. Spreadsheet (CSV)'), ta,
        h('div', { class: 'btns', style: 'margin-top:6px' },
          h('button', { onclick: () => csvIn.click() }, 'Load CSV'),
          h('button', { onclick: () => PM.out.download(new Blob([PM.bulk.sample()], { type: 'text/csv' }), 'pennant-template.csv') }, 'Download template')), csvIn,
        h('p', { class: 'fine' }, 'Columns: ' + PM.bulk.COLUMNS.join(', ') + '. template = baseball, hoops, hockey, gridiron, edge, split or bands (blank matches the sport). era = a year like 1985 for the logo used that year (blank = current). style = block / outline / script / modern / slab / hoops / hockey. order = ABBA or ABAB. ties = both / top / bottom / none. stamp = file, link or none. league = nfl, mlb, nba, nhl, cfb, cbb, cbase, epl, efl…')),
      h('div', { class: 'card' }, h('h3', {}, '2. Logo files (optional)'), logos, logoCount),
      h('div', { class: 'card' }, h('h3', {}, '3. Outputs'),
        h('div', { class: 'col' }, outChk('png', 'Flat PNG'), outChk('svg', 'Vector SVG'), outChk('felt', 'Felt PNG'), outChk('aged', 'Aged PNG'), outChk('pixel', '8-bit PNG'), outChk('sheet', 'Contact sheet')),
        h('div', { class: 'sec-body', style: 'padding:8px 0 0' }, row('Felt background', feltBg), row('Sheet style', sheetStyle))),
      h('div', { class: 'btns' }, run, dl), log, thumbs);
  }

  // ---------- panel / modes ----------
  function buildPanel() {
    binders.length = 0;
    const p = $('#panel'); p.innerHTML = '';
    ({ auto: buildAuto, guided: buildGuided, manual: buildManual, bulk: buildBulk })[st.mode](p);
    document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
    document.querySelectorAll('#productSw button').forEach((b) => b.classList.toggle('on', b.dataset.product === PM.productOf(st.d)));
    syncProductUi();
  }
  // Posters are paper: no felt or aged-felt views, no felt cut files, no bead charts.
  function syncProductUi() {
    const p = isP();
    document.querySelectorAll('#viewSeg [data-view="felt"], #viewSeg [data-view="aged"]').forEach((b) => { b.hidden = p; });
    const f = $('#exFormat');
    if (f) {
      [...f.options].forEach((o) => { if (['felt', 'aged', 'cut', 'chart'].includes(o.value)) o.hidden = p; });
      if (p && ['felt', 'aged', 'cut', 'chart'].includes(f.value)) { f.value = 'png'; syncExportUi(); }
    }
    if (p && (st.view === 'felt' || st.view === 'aged')) {
      st.view = 'flat'; document.querySelectorAll('#viewSeg button').forEach((x) => x.classList.toggle('on', x.dataset.view === 'flat'));
    }
    if ($('#exFormat') && $('#exFormat').value && ['printpdf', 'tiled', 'cut'].includes($('#exFormat').value)) syncExportUi();
  }
  function setProduct(prod) {
    if (PM.productOf(st.d) === prod) return;
    const d = PM.auto.toProduct(clone(st.d), prod, { tpl: prod === 'banner' ? st.autoTplB : prod === 'card' && st.lastTeam && PM.auto.templateFor(st.lastTeam) === 'hoops' ? 'cardParquet' : null, team: st.lastTeam, banner: bannerOpts(), poster: posterOpts() });
    replaceDesign(d);
    toast(prod === 'card' ? "Card: add a photo, name and position in Automatic. Wood Grain '87 to start; more styles under Style" : prod === 'poster' ? 'Poster: add a photo and a name in Automatic, or click any part to edit it' : prod === 'banner' ? 'Championship banner: add the title and years in Automatic, or click any part to edit it' : 'Back to the pennant', 3800);
  }
  function setMode(m) { st.mode = m; if (m === 'auto' || m === 'bulk') st.sel = null; buildPanel(); queueRender(); localStorage.setItem('pm_mode', m); }

  // ---------- warnings (readability checks) ----------
  function warnings() {
    const box = $('#warnings'); box.innerHTML = '';
    if (st.mode === 'bulk') return;
    const d = st.d, C = PM.colors, out = [];
    const edge = (t) => (t.o2.w > 0 ? t.o2.color : t.o1.w > 0 ? t.o1.color : t.fill);
    [['line1', 'Line 1'], ['line2', 'Line 2']].forEach(([k, name]) => {
      const t = d[k]; if (!t.show || !t.text || PM.lineUsesImg(t)) return;
      const e = edge(t);
      if (d.template === 'classic' && d.stripes.show) {
        // Only warn when the text box actually crosses a stripe of a matching color.
        const g = PM.geom(d), s = d.stripes, th = s.thickness, size = PM.fitSize(t), w = PM.measure(t, size);
        const tops = [s.topY, s.topY + th + s.gap, s.bottomY, s.bottomY + th + s.gap];
        const seq = s.order === 'ABAB' ? ['colorA', 'colorB', 'colorA', 'colorB'] : ['colorA', 'colorB', 'colorB', 'colorA'];
        const y0 = t.y - size * 0.72, y1 = t.y + (t.tail ? size * 0.3 : 0);
        const crossing = new Set();
        tops.forEach((top, i) => {
          if (s.hide[i]) return;
          const lx = t.align === 'start' ? t.x : t.align === 'end' ? t.x - w : t.x - w / 2;
          for (let x = lx; x <= lx + w; x += 20) {
            const a = top + g.b * (x - g.t.bodyX);
            if (a < y1 && a + th > y0) { crossing.add(seq[i]); break; }
          }
        });
        const hit = [['colorA', 'A'], ['colorB', 'B']].find(([c]) => crossing.has(c) && C.dist(e, s[c]) < 35);
        if (hit && t.o1.w === 0) out.push({
          msg: `${name}'s color matches stripe ${hit[1]}, so it can vanish where it crosses that stripe.`,
          fixes: [['Add felt outline', () => { snapshot(true); t.o1 = { color: d.field.color, w: 5 }; buildPanel(); queueRender(); }],
            [d.stripes.order === 'ABBA' ? 'Use staggered stripes' : 'Use mirrored stripes', () => change('stripes.order', d.stripes.order === 'ABBA' ? 'ABAB' : 'ABBA')]],
        });
      }
      if (C.contrast(t.fill, d.field.color) < 1.35 && t.o1.w === 0 && t.o2.w === 0) out.push({ msg: `${name} is hard to read on the felt.`, fixes: [['Add outline', () => { snapshot(true); t.o2 = { color: d.palette.primary, w: 4 }; buildPanel(); queueRender(); }]] });
    });
    if (PM.isPoster(d) && !d.pst.photo && !(PM.TEMPLATES[d.template] || {}).noPhoto) out.push({ msg: `No photo yet. Upload one or drop it on the ${PM.productOf(d)}.`, fixes: [['Add photo', () => { st.sel = 'photo'; setMode('manual'); }]] });
    else if (!PM.isPoster(d) && d.mark.show && !d.mark.src && st.mode !== 'bulk') out.push({ msg: 'No primary logo yet. Upload one, paste a link, or use Find.', fixes: [['Add logo', () => { st.sel = 'mark'; setMode('manual'); }]] });
    out.forEach((w) => box.append(h('div', { class: 'warn' }, h('span', {}, '⚠ ' + w.msg), ...w.fixes.map(([l, f]) => h('button', { onclick: f }, l)))));
  }

  // ---------- save / open / persist ----------
  // File name: "<line 1> <line 2> - <pennant style>", e.g. "Seattle Seahawks - Vintage Baseball"
  const fileBase = () => {
    const parts = isP() ? [st.d.line2] : isB() ? [st.d.extra, st.d.line1, st.d.line2] : [st.d.line1, st.d.line2];
    const words = parts.filter((l) => l.show !== false && l.text && !l.useImg).map((l) => l.text.trim()).join(' ') || st.d.name || (isC() ? 'Card' : isP() ? 'Poster' : isB() ? 'Banner' : 'Pennant');
    const style = (PM.TEMPLATES[st.d.template] || {}).name || 'Pennant';
    return `${words} - ${style}`.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim();
  };
  const slug = fileBase;
  function saveDesign() { PM.out.saveAs(new Blob([JSON.stringify(st.d, null, 1)], { type: 'application/json' }), fileBase() + '.pennant.json'); }
  let pT;
  function persist() { clearTimeout(pT); pT = setTimeout(() => { try { localStorage.setItem('pm_design', JSON.stringify(st.d)); } catch { /* storage full or blocked */ } }, 500); }
  const load = (obj) => deepMerge(PM.defaultDesign(), obj);

  // ---------- export ----------
  async function doExport() {
    const fmt = $('#exFormat').value, bg = $('#exBg').value, width = +$('#exWidth').value || 2400;
    const btn = $('#exBtn'); btn.disabled = true; btn.textContent = 'Rendering…';
    try {
      if (fmt === 'svg') {
        const svg = await PM.out.svg(st.d, { bg: bg === 'transparent' ? null : bg === 'wall' ? '#e6ded1' : bg });
        await PM.out.saveAs(new Blob([svg], { type: 'image/svg+xml' }), fileBase() + '.svg');
      } else if (fmt === 'printpdf' || fmt === 'tiled' || fmt === 'cut') {
        const heightIn = +$('#exSize').value || 12, size = PM.print.sizeLabel(st.d, heightIn).replace(/ /g, '');
        if (fmt === 'printpdf') await PM.out.saveAs(await PM.print.printPdf(st.d, { heightIn }), `${fileBase()} (print ${size}).pdf`);
        else if (fmt === 'tiled') {
          const r = await PM.print.tiledPdf(st.d, { heightIn, paper: $('#exPaper').value });
          await PM.out.saveAs(r.blob, `${fileBase()} (home print ${size}, ${r.pages} pages).pdf`);
          toast(`${r.pages} pages (${r.cols} across × ${r.rows} down). Print at 100% / actual size.`, 5000);
        } else await PM.out.saveAs(await PM.print.cutFiles(st.d, { heightIn }), `${fileBase()} (felt cut files ${size}).zip`);
      } else if (fmt === 'chart') {
        const kind = $('#exChart').value;
        const c = await PM.out.chart(st.d, { cells: +$('#exCells').value || 58, kind, maxColors: +$('#exColors').value || 10 });
        await PM.out.saveAs(await PM.out.canvasBlob(c), `${fileBase()} (${kind === 'beads' ? 'bead pattern' : 'cross-stitch chart'}).png`);
      } else {
        const o = { width, bg: bg === 'transparent' ? null : bg === 'wall' && fmt !== 'felt' && fmt !== 'aged' ? '#e6ded1' : bg, pixels: +$('#exPixels').value || 128, preset: $('#exPreset').value };
        if (fmt === 'felt' || fmt === 'aged') o.bg = bg;
        const c = await PM.out.render(st.d, fmt === 'png' ? 'flat' : fmt, o);
        const tag = { png: 'flat', felt: 'felt', aged: 'aged vintage', pixel: '8-bit ' + $('#exPreset').selectedOptions[0].text }[fmt] || fmt;
        await PM.out.saveAs(await PM.out.canvasBlob(c), `${fileBase()} (${tag}).png`);
      }
      toast('Downloaded');
    } catch (e) { console.error(e); toast('Export failed: ' + e.message, 4000); }
    btn.disabled = false; syncExportUi();
  }
  const EX_LABEL = { svg: 'Download SVG', png: 'Download flat PNG', felt: 'Download felt PNG', aged: 'Download aged PNG', pixel: 'Download 8-bit PNG', chart: 'Download chart', printpdf: 'Download print PDF', tiled: 'Download home-print PDF', cut: 'Download cut files' };
  function syncExportUi() {
    const fmt = $('#exFormat').value;
    document.querySelectorAll('.px-only').forEach((el) => { el.style.display = fmt === 'pixel' || st.view === 'pixel' ? '' : 'none'; });
    document.querySelectorAll('.chart-only').forEach((el) => { el.style.display = fmt === 'chart' ? '' : 'none'; });
    const real = ['printpdf', 'tiled', 'cut'].includes(fmt);
    document.querySelectorAll('.real-only').forEach((el) => { el.style.display = real ? '' : 'none'; });
    document.querySelectorAll('.tile-only').forEach((el) => { el.style.display = fmt === 'tiled' ? '' : 'none'; });
    $('#exWidth').closest('label').style.display = real || fmt === 'chart' || fmt === 'svg' ? 'none' : '';
    $('#exBg').closest('label').style.display = real || fmt === 'chart' ? 'none' : '';
    if (real) {   // size list shows the finished size for this design's proportions
      const sel = $('#exSize'), cur = sel.value || (fmt === 'cut' ? '9' : '12');
      sel.innerHTML = PM.print.sizesFor(st.d).map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}: ${PM.print.sizeLabel(st.d, +v)}</option>`).join('');
    }
    $('#exBtn').textContent = EX_LABEL[fmt] || 'Download';
  }
  // The export follows the preview: viewing Felt exports felt, Aged exports aged, 8-bit exports pixel art.
  const VIEW_FMT = { felt: 'felt', aged: 'aged', pixel: 'pixel' };
  function followView() {
    const f = $('#exFormat');
    if (VIEW_FMT[st.view]) f.value = VIEW_FMT[st.view];
    else if (['felt', 'aged', 'pixel'].includes(f.value)) f.value = 'png';
    if ((st.view === 'felt' || st.view === 'aged') && $('#exBg').value === 'transparent') { /* keep the user's choice */ }
    syncExportUi();
  }

  // ---------- boot ----------
  function boot() {
    PM.loadFontsCSS();
    try { const s = localStorage.getItem('pm_design'); if (s) st.d = load(JSON.parse(s)); } catch {}
    try { const m = localStorage.getItem('pm_mode'); if (m) st.mode = m; } catch {}
    try { const e = JSON.parse(localStorage.getItem('pm_era') || 'null'); if (e) Object.assign(st.era, e); } catch {}
    document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    document.querySelectorAll('#productSw button').forEach((b) => b.addEventListener('click', () => setProduct(b.dataset.product)));
    document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
      st.view = b.dataset.view; document.querySelectorAll('#viewSeg button').forEach((x) => x.classList.toggle('on', x === b)); followView(); render();
    }));
    $('#viewSeg [data-view="flat"]').classList.add('on');
    $('#phToggle').addEventListener('change', (e) => { st.ph = e.target.checked; render(); });
    $('#stage').addEventListener('pointerdown', onStageDown);
    // phones: the pinned preview sits just under the (wrapping) header
    const topEl = $('.top'), setTop = () => document.documentElement.style.setProperty('--top-h', Math.round(topEl.getBoundingClientRect().height) + 'px');
    setTop(); if (window.ResizeObserver) new ResizeObserver(setTop).observe(topEl);
    const slotAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); const part = el && el.closest && el.closest('#stage [data-part]'); return (part && IMG_SLOT[part.dataset.part]) ? part.dataset.part : (isP() ? 'photo' : 'mark'); };
    dropTarget($('#stage'), slotAt);
    $('#stage').addEventListener('dragover', (e) => { if (isImgDrag(e)) $('#stageHint').textContent = 'Drop onto: ' + SLOT_NAME[slotAt(e)]; });
    $('#stage').addEventListener('dragleave', () => { $('#stageHint').textContent = ''; });
    // a file dropped outside a target must not navigate the app away
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
    // every search-result thumbnail can be dragged (team results, Find grids, logo history, other logos)
    document.addEventListener('dragstart', (e) => {
      const host = e.target.closest && e.target.closest('.finder .grid button, .results .result, .finder img, .results img');
      if (!host) return;
      const img = host.tagName === 'IMG' ? host : host.querySelector('img');
      if (!img || !img.src) { e.preventDefault(); return; }
      const url = unproxy(img.src);
      e.dataTransfer.setData('application/x-pennant-img', url);
      e.dataTransfer.setData('text/uri-list', url);
      e.dataTransfer.effectAllowed = 'copy';
      if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(img, 24, 24);
    });
    new MutationObserver(() => document.querySelectorAll('.finder .grid button, .results .result').forEach((b) => { if (!b.draggable) { b.draggable = true; b.title = (b.title ? b.title + ' · ' : '') + 'drag onto the pennant or a layer'; } }))
      .observe($('#panel'), { childList: true, subtree: true });
    $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
    $('#newBtn').onclick = () => { st.lastTeam = null; st.results = []; replaceDesign(PM.defaultDesign()); };
    $('#saveBtn').onclick = saveDesign;
    $('#openBtn').onclick = () => $('#openFile').click();
    $('#openFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { replaceDesign(load(JSON.parse(await f.text())), { fit: false }); toast('Opened ' + f.name); } catch { toast('That file is not a pennant design'); }
      e.target.value = '';
    });
    $('#exBtn').onclick = doExport;
    $('#exFormat').addEventListener('change', syncExportUi); syncExportUi();
    for (const id of ['#exPreset', '#exPixels']) $(id).addEventListener('change', () => { if (st.view === 'pixel') render(); });
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    });
    updUndo(); buildPanel(); render();
    document.fonts.ready.then(() => render());
  }
  boot();
})(window.PM);
