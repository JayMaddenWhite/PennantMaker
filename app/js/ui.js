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
    if (typeof v === 'string' && HEX.test(v) && typeof old === 'string' && HEX.test(old) && old.toLowerCase() !== v.toLowerCase()) {
      const others = linked(LAYER_OF(root), 'color');
      for (const k of others) for (const o of PM.layerObjects(st.d, k)) swapColor(o, old, v);
      if (others.length) syncInputs();
    }
    queueRender();
  }
  function setLayer(k, prop, v) {
    snapshot(true);
    st.d.layers = st.d.layers || {};
    st.d.layers[k] = Object.assign({}, st.d.layers[k], { [prop]: v });
    buildPanel(); queueRender();
  }
  function replaceDesign(nd, { rebuild = true } = {}) { snapshot(true); st.d = nd; if (rebuild) buildPanel(); queueRender(); }
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
  const PART_SEC = { field: 'field', spine: 'spine', stitch: 'spine', ties: 'ties', tieTop: 'ties', tieBottom: 'ties', pattern: 'pattern', stripes: 'pattern', stamps: 'stamps', stamp1: 'stamps', stamp2: 'stamps', mark: 'mark', line1: 'line1', line2: 'line2', extra: 'extra', maker: 'maker' };
  const DRAG = { mark: 'mark', line1: 'line1', line2: 'line2', extra: 'extra', stamp1: 'stamps', stamp2: 'stamps', stamps: 'stamps', maker: 'maker' };
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
      document.querySelectorAll('details.sec').forEach((dt) => {
        const on = dt.dataset.sec === sec;
        dt.classList.toggle('hl', on);
        if (on) { dt.open = true; dt.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      });
    }
    queueRender();
  }

  // Keep inputs in sync after drags (positions)
  const binders = [];
  function syncInputs() { binders.forEach((f) => f()); }

  // ---------- controls ----------
  const row = (label, ctl) => h('div', { class: 'row' }, h('span', {}, label), ctl);
  function cColor(path) {
    const v = () => PM.colors.norm(get(path)) || '#000000';
    const pick = h('input', { type: 'color', value: v() });
    const txt = h('input', { type: 'text', value: v(), spellcheck: false });
    const apply = (c) => { c = PM.colors.norm(c); if (!c) return; pick.value = c; txt.value = c; change(path, c); };
    pick.addEventListener('input', () => apply(pick.value));
    txt.addEventListener('change', () => apply(txt.value));
    const p = st.d.palette || {};
    const sws = [p.primary, p.secondary, p.tertiary, st.d.field.color, '#ffffff', '#141414'].filter(Boolean)
      .filter((c, i, a) => a.indexOf(c) === i)
      .map((c) => h('button', { class: 'sw', style: `background:${c}`, title: c, onclick: () => apply(c) }));
    binders.push(() => { pick.value = v(); txt.value = v(); });
    return h('div', { class: 'col' }, pick, txt, ...sws);
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
    const sel = h('select', {}, Object.entries(PM.TEMPLATES).map(([k, v]) => h('option', { value: k, selected: st.d.template === k }, v.name)));
    sel.addEventListener('change', () => { const d = PM.setTemplate(clone(st.d), sel.value); PM.auto.layoutText(d); replaceDesign(d); toast(PM.TEMPLATES[sel.value].name); });
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
    const sel = h('select', {}, [['match', 'Match the sport'], ...Object.entries(PM.TEMPLATES).map(([k, v]) => [k, v.name])]
      .map(([k, l]) => h('option', { value: k, selected: st.autoTpl === k }, l)));
    sel.addEventListener('change', () => { st.autoTpl = sel.value; });
    return sel;
  }

  // ---------- Images into layers (upload, link, search, drag and drop) ----------
  const IMG_SLOT = { mark: 'mark.src', stamp1: 'stamps.items.0.src', stamp2: 'stamps.items.1.src', stamps: 'stamps.items.0.src', maker: 'maker.src', line1: 'line1.img', line2: 'line2.img', extra: 'extra.img' };
  const SLOT_NAME = { mark: 'Primary mark', stamp1: 'Stamp 1', stamp2: 'Stamp 2', stamps: 'Stamp 1', maker: "Maker's mark", line1: 'Wordmark line 1', line2: 'Wordmark line 2', extra: 'Extra text' };
  const aspectOf = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight || 3); i.onerror = () => res(3); i.src = src; });
  // Put image data into a slot path and switch on whatever shows it.
  async function putImage(path, data) {
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
  ];
  const textSec = (k) => () => [
    row('Show', cCheck(k + '.show')),
    row('Text', cText(k + '.text')),
    row('Use image', cCheck(k + '.useImg', 'Image instead of text')),
    row('Image', cImage(k + '.img', 'team')),
    row('Image size', cRange(k + '.imgScale', 0.2, 2.5, 0.05)),
    row('Font', cFont(k + '.font')),
    row('Size', cRange(k + '.size', 20, 320)),
    row('Max width', cRange(k + '.maxWidth', 100, 1400, 10)),
    row('Fill', cColor(k + '.fill')),
    h('div', { class: 'sub' }, 'Outlines'),
    row('Inner color', cColor(k + '.o1.color')), row('Inner width', cRange(k + '.o1.w', 0, 20, 0.5)),
    row('Outer color', cColor(k + '.o2.color')), row('Outer width', cRange(k + '.o2.w', 0, 20, 0.5)),
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
    row('X', cRange(k + '.x', 0, 2000)), row('Y', cRange(k + '.y', 0, 820)),
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
      title: 'Felt body', build: () => [
        row('Background', cTemplate()),
        row('Felt color', cColor('field.color')),
        row('Border margin', cRange('field.margin', 0, 60)),
        row('Length (tip)', cRange('field.tipX', 1200, 1990, 5)),
      ],
    },
    spine: {
      title: 'Spine & stitching', build: () => [
        row('Show spine', cCheck('spine.show')),
        row('Outer band', cColor('spine.outer')), row('Outer width', cRange('spine.outerW', 10, 90)),
        row('Inner band', cColor('spine.inner')), row('Inner width', cRange('spine.innerW', 0, 60)),
        h('div', { class: 'sub' }, 'Stitching'),
        row('Stitching', cCheck('spine.stitchOn')),
        row('Outer edge', cCheck('spine.stitchOuter')), row('Seam', cCheck('spine.stitchSeam')),
        row('Thread', cColor('spine.stitch')), row('Thread width', cRange('spine.stitchW', 0.5, 5, 0.1)),
        row('Stitch length', cRange('spine.dash', 2, 20, 0.5)),
      ],
    },
    ties: {
      title: 'Ties', build: () => [
        row('Top tie', cCheck('ties.top.show')), row('Top color', cColor('ties.top.color')),
        row('Bottom tie', cCheck('ties.bottom.show')), row('Bottom color', cColor('ties.bottom.color')),
        row('Thickness', cRange('ties.width', 8, 50)),
        row('Felt mockup', cSelect('ties.feltStyle', [['loops', 'Fabric loops'], ['chevron', 'Same as flat']])),
      ],
    },
    pattern: {
      title: () => ({ hoops: 'Corner wedges & stripes', hockey: 'Wedges, center stripe & medallion' })[st.d.template] || 'Stripes',
      build: () => st.d.template === 'hockey' ? [
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
      title: 'League / conference stamps', build: () => [
        ...[0, 1].flatMap((i) => [
          h('div', { class: 'sub' }, `Stamp ${i + 1}`),
          row('Show', cCheck(`stamps.items.${i}.show`)),
          row('Label', cText(`stamps.items.${i}.label`, i ? 'Conference' : 'League')),
          row('Logo', cImage(`stamps.items.${i}.src`, 'league')),
          row('Size', cRange(`stamps.items.${i}.size`, 20, 160)),
        ]),
        ...koRows('stamps.ko'),
        h('div', { class: 'sub' }, 'Placement'),
        row('X', cRange('stamps.x', 150, 700)), row('Y', cRange('stamps.y', 60, 300)), row('Gap', cRange('stamps.gap', 0, 60)),
      ],
    },
    mark: {
      title: 'Primary mark (logo)', build: () => [
        row('Show', cCheck('mark.show')),
        row('Logo', cImage('mark.src', 'team')),
        row('Size', cRange('mark.size', 80, 700)),
        row('X', cRange('mark.x', 150, 1600)), row('Y', cRange('mark.y', 80, 760)),
        h('div', { class: 'sub' }, 'Outline'),
        ...koRows('mark.knockout'),
        row('Outer ring', cCheck('mark.ring.on')), row('Ring color', cColor('mark.ring.color')), row('Ring width', cRange('mark.ring.w', 0, 20)),
      ],
    },
    line1: { title: 'Wordmark – line 1 (small)', build: textSec('line1') },
    line2: { title: 'Wordmark – line 2 (big)', build: textSec('line2') },
    extra: { title: 'Extra text', build: textSec('extra') },
    maker: {
      title: "Maker's mark", build: () => [
        row('Show', cCheck('maker.show')), row('Logo', cImage('maker.src', 'team')),
        row('Size', cRange('maker.size', 16, 160)), row('X', cRange('maker.x', 150, 1800)), row('Y', cRange('maker.y', 60, 780)),
        ...koRows('maker.ko'),
      ],
    },
  };
  // Layers: visibility, lock, movement link group, color link group
  const VIS = {
    line1: ['line1.show'], line2: ['line2.show'], extra: ['extra.show'], mark: ['mark.show'], maker: ['maker.show'],
    stamps: ['stamps.items.0.show', 'stamps.items.1.show'], spine: ['spine.show'], ties: ['ties.top.show', 'ties.bottom.show'],
    pattern: [() => ({ classic: 'stripes.show', hoops: 'hoops.show', hockey: 'hockey.show' })[st.d.template]],
  };
  const GROUPS = ['', 'A', 'B', 'C', 'D'];
  function layersPanel() {
    const wrap = h('div', { class: 'layers' },
      h('div', { class: 'lrow lhead' }, h('span', {}, 'Layer'), h('span', { title: 'Show' }, 'Show'), h('span', { title: 'Lock in place' }, 'Lock'), h('span', { title: 'Layers with the same letter move together' }, 'Move'), h('span', { title: 'Layers with the same letter change colors together' }, 'Color')));
    for (const [k, label] of PM.LAYERS_ALL) {
      const L = PM.layer(st.d, k), movable = PM.LAYER_KEYS.includes(k);
      const visPaths = (VIS[k] || []).map((x) => (typeof x === 'function' ? x() : x));
      const vis = visPaths.length ? h('input', { type: 'checkbox', checked: visPaths.some((q) => get(q)), title: 'Show / hide' }) : h('span');
      if (visPaths.length) vis.addEventListener('change', () => { snapshot(true); visPaths.forEach((q) => set(q, vis.checked)); buildPanel(); queueRender(); });
      const lock = movable ? h('button', { class: 'lk' + (L.lock ? ' on' : ''), title: L.lock ? 'Unlock' : 'Lock in place', onclick: () => setLayer(k, 'lock', !L.lock) }, L.lock ? '🔒' : '🔓') : h('span');
      const grp = (kind) => {
        const sel = h('select', { class: 'grp' + (L[kind] ? ' g' + L[kind] : '') }, GROUPS.map((g) => h('option', { value: g, selected: (L[kind] || '') === g }, g || '—')));
        sel.addEventListener('change', () => setLayer(k, kind, sel.value));
        return sel;
      };
      wrap.append(h('div', { class: 'lrow' + (st.sel && (PART_SEC[st.sel] === k || (k === 'pattern' && PART_SEC[st.sel] === 'pattern')) ? ' sel' : '') },
        (() => { const b = h('button', { class: 'lname', onclick: () => select(k === 'pattern' ? 'pattern' : k) }, label); if (IMG_SLOT[k]) { dropTarget(b, k); b.title = 'Click to edit · drop an image here'; } return b; })(),
        vis, lock, movable ? grp('move') : h('span'), grp('color')));
    }
    wrap.append(h('p', { class: 'fine', style: 'margin:6px 0 0' },
      'Same letter under Move = they drag and slide together. Same letter under Color = changing a color on one changes that same color on the others. Locked layers can\'t be moved or clicked, and auto-layout leaves them alone.'));
    return wrap;
  }
  SECTIONS.layers = { title: 'Layers', build: () => [layersPanel()] };

  const ORDER = ['layers', 'palette', 'field', 'spine', 'ties', 'pattern', 'stamps', 'mark', 'line1', 'line2', 'extra', 'maker'];

  function secEl(key, open) {
    const s = SECTIONS[key];
    const body = h('div', { class: 'sec-body' });
    const dt = h('details', { class: 'sec' + (open ? ' hl' : ''), open }, h('summary', {}, typeof s.title === 'function' ? s.title() : s.title), body);
    dt.dataset.sec = key;
    let built = false;
    const build = () => { if (!built) { body.append(...s.build()); built = true; } };
    if (open) build();
    dt.addEventListener('toggle', () => { if (dt.open) build(); });
    return dt;
  }

  // ---------- AUTO ----------
  function teamSearch(onPick) {
    const input = h('input', { type: 'search', placeholder: 'Team, school or club (e.g. Seahawks, Miss State, Arsenal)' });
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
        h('div', { class: 'meta' }, h('b', {}, t.name), h('small', {}, `${t.leagueLabel || ''} · ${t.source}`)),
        h('div', { class: 'dots' }, [t.primary, t.secondary, t.tertiary].filter(Boolean).map((c) => h('i', { style: `background:${PM.colors.norm(c)}` }))))));
    };
    const go = async () => {
      const q = input.value.trim(); if (!q) return;
      results.innerHTML = '<small>Searching ESPN + TheSportsDB…</small>';
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
    return h('div', {}, h('div', { class: 'search' }, input, h('button', { class: 'primary', onclick: go }, 'Search')), chips, hs, results);
  }

  st.autoTpl = st.autoTpl || 'match';
  async function pickTeam(t, base) {
    if (st.era.on) {
      toast(`Finding the ${st.era.year} logo for ${t.name}…`, 6000);
      t = await PM.auto.withEra(t, st.era.year, st.era.useName);
      if (t.eraMissing) toast('No logo history found, using the current logo', 3000);
    }
    if (!base) { base = PM.auto.baseFor(t, st.autoTpl); if (st.d.template === base.template) base.stripes.order = st.d.stripes.order; }
    toast('Building ' + t.name + '…', 6000);
    const d = await PM.auto.fromTeam(t, base, {});
    st.lastTeam = t;
    replaceDesign(d);
    toast(t.name + (t.eraLabel ? ` (${t.eraLabel} logo)` : '') + ' ready' + (d.mark.src ? '' : ' — no logo found, add one under Primary mark'), 3600);
  }

  function buildAuto(p) {
    p.append(
      h('h2', {}, 'Automatic'),
      h('p', { class: 'lead' }, 'Pick a team. Colors, logo, league stamps and wordmark are filled in for you.'),
      h('div', { class: 'card' }, h('h3', {}, 'Find a team'), teamSearch((t) => pickTeam(t)),
        h('div', { class: 'row', style: 'margin-top:10px' }, h('span', {}, 'Background'), cTplChoice()),
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
            const d = PM.setTemplate(PM.defaultDesign(), st.autoTpl === 'match' ? st.d.template : st.autoTpl); if (own.logo) d.mark.src = own.logo;
            if (!own.logo && logoUrl.value.trim()) { try { d.mark.src = await PM.sources.imageData(logoUrl.value.trim()); } catch (e) { toast('Could not load that logo link: ' + e.message, 3500); } }
            d.stamps.items.forEach((s) => { s.show = false; });
            const team = { name: [l1.value, l2.value].filter(Boolean).join(' ') || 'Custom', location: l1.value, nickname: l2.value, primary: own.p, secondary: own.s, tertiary: tChk.checked ? own.t : null };
            replaceDesign(await PM.auto.fromTeam(team, d, { stamps: false, keepLogo: true }));
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
    pattern: ['stripes.colorA', 'stripes.colorB', 'hoops.wedge', 'hoops.stripe', 'hockey.color', 'hockey.ringColor', 'spine.outer', 'spine.inner'], mark: ['mark.knockout', 'mark.ring'],
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
  function buildGuided(p) {
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
    p.append(h('h2', {}, 'Manual'), h('p', { class: 'lead' }, 'Every part is editable. Click a part on the pennant to jump to it.'));
    const selSec = PART_SEC[st.sel];
    ORDER.forEach((k) => p.append(secEl(k, k === selSec || k === 'layers')));
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
        h('p', { class: 'fine' }, 'Columns: ' + PM.bulk.COLUMNS.join(', ') + '. template = baseball, hoops or hockey (blank matches the sport). era = a year like 1985 for the logo used that year (blank = current). style = block / outline / script / modern / slab / hoops / hockey. order = ABBA or ABAB. ties = both / top / bottom / none. stamp = file, link or none. league = nfl, mlb, nba, nhl, cfb, cbb, cbase, epl, efl…')),
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
          for (let x = t.x - w / 2; x <= t.x + w / 2; x += 20) {
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
    if (d.mark.show && !d.mark.src && st.mode !== 'bulk') out.push({ msg: 'No primary logo yet. Upload one, paste a link, or use Find.', fixes: [['Add logo', () => { st.sel = 'mark'; setMode('manual'); }]] });
    out.forEach((w) => box.append(h('div', { class: 'warn' }, h('span', {}, '⚠ ' + w.msg), ...w.fixes.map(([l, f]) => h('button', { onclick: f }, l)))));
  }

  // ---------- save / open / persist ----------
  // File name: "<line 1> <line 2> - <pennant style>", e.g. "Seattle Seahawks - Vintage Baseball"
  const fileBase = () => {
    const words = [st.d.line1, st.d.line2].filter((l) => l.show !== false && l.text).map((l) => l.text.trim()).join(' ') || st.d.name || 'Pennant';
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
      sel.innerHTML = PM.print.SIZES.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}: ${PM.print.sizeLabel(st.d, +v)}</option>`).join('');
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
    document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
      st.view = b.dataset.view; document.querySelectorAll('#viewSeg button').forEach((x) => x.classList.toggle('on', x === b)); followView(); render();
    }));
    $('#viewSeg [data-view="flat"]').classList.add('on');
    $('#phToggle').addEventListener('change', (e) => { st.ph = e.target.checked; render(); });
    $('#stage').addEventListener('pointerdown', onStageDown);
    // phones: the pinned preview sits just under the (wrapping) header
    const topEl = $('.top'), setTop = () => document.documentElement.style.setProperty('--top-h', Math.round(topEl.getBoundingClientRect().height) + 'px');
    setTop(); if (window.ResizeObserver) new ResizeObserver(setTop).observe(topEl);
    const slotAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); const part = el && el.closest && el.closest('#stage [data-part]'); return (part && IMG_SLOT[part.dataset.part]) ? part.dataset.part : 'mark'; };
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
      try { replaceDesign(load(JSON.parse(await f.text()))); toast('Opened ' + f.name); } catch { toast('That file is not a pennant design'); }
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
