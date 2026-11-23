// Pennant rendering engine: design JSON → SVG string.
// Every editable part is its own <g data-part="...">.
window.PM = window.PM || {};
(function (PM) {
  PM.DEFAULT_FIELD = '#fff3d9';

  // ---------- Templates (background designs) ----------
  // Each template = shared geometry + its own background pattern + default layout
  // + how team colors map onto its parts. Add more backgrounds by adding an entry here.
  const GEO = { W: 2000, H: 820, spineX: 105, top: 55, bottom: 752, bodyX: 165, tipX: 1905, tieTopY: 212, tieBottomY: 642 };
  const poly = (p, fill, extra = '') => `<polygon points="${p.map((q) => q.map((v) => +v.toFixed(2)).join(',')).join(' ')}" fill="${fill}"${extra}/>`;
  const insetClip = (id, g) => `<defs><clipPath id="${id}">${poly(g.inset, '#000')}</clipPath></defs>`;

  PM.TEMPLATES = {
    classic: Object.assign({}, GEO, {
      name: 'Vintage Baseball',
      // 4 diagonal stripes in 2 pairs, parallel to the bottom edge, mirrored (ABBA) or staggered (ABAB)
      pattern(d, g) {
        const st = d.stripes, t = g.t, th = st.thickness;
        if (!st.show) return '';
        const tops = [st.topY, st.topY + th + st.gap, st.bottomY, st.bottomY + th + st.gap];
        const seq = st.order === 'ABAB' ? ['A', 'B', 'A', 'B'] : ['A', 'B', 'B', 'A'];
        const x0 = t.bodyX - 4, x1 = g.tipX + 10, run = x1 - x0;
        let s = insetClip('patClip', g) + `<g data-part="pattern" clip-path="url(#patClip)">`;
        tops.forEach((y, i) => {
          if (st.hide[i]) return;
          s += poly([[x0, y], [x1, y + g.b * run], [x1, y + th + g.b * run], [x0, y + th]], seq[i] === 'A' ? st.colorA : st.colorB, ` data-stripe="${i}"`);
        });
        return s + `</g>`;
      },
      defaults: {
        wordStyle: 'classic',
        field: { margin: 18, tipX: 1905 },
        spine: { outerW: 40, innerW: 18, stitchSeam: true },
        ties: { top: { show: true }, bottom: { show: true } },
        stamps: { x: 180, y: 105, items: [{ show: true, size: 68 }, { show: true, size: 68 }] },
        mark: { x: 415, y: 400, size: 450 },
        line1: { x: 1065, y: 340, size: 78, maxWidth: 560 },
        line2: { x: 1065, y: 500, size: 170, maxWidth: 790 },
        extra: { x: 415, y: 690 },
        maker: { x: 205, y: 690 },
      },
      field: PM.DEFAULT_FIELD,
      layout: { l1y: 340, l2y: 500, soloY: 450, size2: 170 },
    }),

    hoops: Object.assign({}, GEO, {
      name: 'Vintage Hoops',
      // Solid corner wedges at the spine + a thin accent stripe inside each, ending in a slanted point
      pattern(d, g) {
        const h = d.hoops, t = g.t;
        if (!h.show) return '';
        const x0 = t.bodyX - 4;
        let s = `<g data-part="pattern">`;
        if (h.wedges) {
          const yT = t.top + h.wedgeH, xT = t.bodyX + h.wedgeH / g.a;
          const yB = t.bottom - h.wedgeH, xB = t.bodyX + h.wedgeH / -g.b;
          s += poly([[x0, t.top - 2], [xT, yT], [x0, yT]], h.wedge) + poly([[x0, t.bottom + 2], [xB, yB], [x0, yB]], h.wedge);
        }
        if (h.stripes) {
          const w = h.stripeW, xe = h.stripeEnd, cut = w / g.a;
          const yA = t.top + h.wedgeH + h.gap, yZ = t.bottom - h.wedgeH - h.gap;
          s += insetClip('patClip', g) + `<g clip-path="url(#patClip)">` +
            poly([[x0, yA], [xe, yA], [xe + cut, yA + w], [x0, yA + w]], h.stripe) +
            poly([[x0, yZ - w], [xe + cut, yZ - w], [xe, yZ], [x0, yZ]], h.stripe) + `</g>`;
        }
        return s + `</g>`;
      },
      defaults: {
        wordStyle: 'hoops',
        field: { margin: 14, tipX: 1950 },
        spine: { outerW: 46, innerW: 0, stitchSeam: false },
        ties: { top: { show: false }, bottom: { show: false } },
        stamps: { x: 178, y: 688, items: [{ show: true, size: 66 }, { show: false, size: 60 }] },
        mark: { x: 420, y: 404, size: 560 },
        line1: { x: 1090, y: 348, size: 80, maxWidth: 760 },
        line2: { x: 1090, y: 492, size: 160, maxWidth: 880 },
        extra: { x: 420, y: 700 },
        maker: { x: 205, y: 112 },
      },
      field: '#f6f4ee',
      layout: { l1y: 348, l2y: 492, soloY: 450, size2: 160 },
      // Hoops: wedges = the darker team color, accent stripes + spine = the lighter one (as on the 80s NBA pennants)
      palette(d, p) {
        const C = PM.colors;
        const [dark, light] = C.lum(p.primary) <= C.lum(p.secondary) ? [p.primary, p.secondary] : [p.secondary, p.primary];
        d.hoops.wedge = dark; d.hoops.stripe = light;
        d.spine.outer = light; d.spine.inner = light;
        d.spine.stitch = C.mix(light, C.lum(light) > 0.5 ? '#000000' : '#ffffff', 0.35);
        // wordmark in the dark color, accent outline in the light one
        for (const l of [d.line1, d.line2]) if (l.fill === p.primary || l.fill === p.secondary) l.fill = C.contrast(dark, d.field.color) >= 2.2 ? dark : l.fill;
        for (const l of [d.line1, d.line2]) if (l.o1.w > 0 && (l.o1.color === p.primary || l.o1.color === p.secondary)) l.o1.color = l.fill === light ? dark : light;
      },
    }),

    hockey: Object.assign({}, GEO, {
      name: 'Vintage Hockey',
      // Inset corner wedges (white border along the edges), a thick center stripe ending in a point,
      // a felt medallion behind the logo, and a felt knockout behind the wordmark.
      pattern(d, g) {
        const k = d.hockey, t = g.t;
        if (!k.show) return '';
        const x0 = t.bodyX - 4, m = d.field.margin;
        let s = `<g data-part="pattern">`;
        if (k.wedges) {
          const yT = t.top + k.wedgeH, xT = t.bodyX + (yT - (t.top + m)) / g.a;
          const yB = t.bottom - k.wedgeH, xB = t.bodyX + (yB - (t.bottom - m)) / g.b;
          s += poly([[x0, t.top + m], [xT, yT], [x0, yT]], k.color) + poly([[x0, t.bottom - m], [xB, yB], [x0, yB]], k.color);
        }
        const yc = (t.top + t.bottom) / 2, w = k.centerW;
        if (k.center) {
          const xe = k.centerEnd, cut = w * 1.1;
          s += insetClip('patClip', g) + `<g clip-path="url(#patClip)">` +
            poly([[x0, yc - w / 2], [xe, yc - w / 2], [xe + cut, yc], [xe, yc + w / 2], [x0, yc + w / 2]], k.color) + `</g>`;
          // felt knockout behind the wordmark, so the stripe stops around the lettering
          if (k.knockout) {
            const spans = [d.line1, d.line2].filter((l) => PM.lineUsesImg(l) || (l.show && l.text)).map((l) => {
              if (PM.lineUsesImg(l)) { const b = PM.lineImgBox(l); return [b.cx - b.w / 2, b.cx + b.w / 2]; }
              const wd = PM.measure(l, PM.fitSize(l)); return [l.x - wd / 2, l.x + wd / 2];
            });
            if (spans.length) {
              const L = Math.min(...spans.map((q) => q[0])) - k.knockPad, R = Math.max(...spans.map((q) => q[1])) + k.knockPad;
              s += `<rect x="${L.toFixed(1)}" y="${yc - w / 2 - 2}" width="${(R - L).toFixed(1)}" height="${w + 4}" fill="${d.field.color}"/>`;
            }
          }
        }
        if (k.medallion && d.mark.show) {
          const r = d.mark.size / 2 * k.medScale;
          s += `<circle cx="${d.mark.x}" cy="${d.mark.y}" r="${r.toFixed(1)}" fill="${d.field.color}"/>`;
          if (k.ring) s += `<circle cx="${d.mark.x}" cy="${d.mark.y}" r="${(r - k.ringGap - k.ringW / 2).toFixed(1)}" fill="none" stroke="${k.ringColor}" stroke-width="${k.ringW}"/>`;
        }
        return s + `</g>`;
      },
      defaults: {
        wordStyle: 'hockey',
        field: { margin: 26, tipX: 1950 },
        spine: { outerW: 46, innerW: 0, stitchSeam: false },
        ties: { top: { show: false }, bottom: { show: false } },
        stamps: { x: 180, y: 702, items: [{ show: true, size: 60 }, { show: false, size: 60 }] },
        mark: { x: 432, y: 404, size: 430 },
        line1: { x: 1090, y: 335, size: 68, maxWidth: 640 },
        line2: { x: 1090, y: 462, size: 150, maxWidth: 720 },
        extra: { x: 432, y: 700 },
        maker: { x: 205, y: 112 },
      },
      field: '#f6f4ee',
      layout: { l1y: 335, l2y: 462, soloY: 440, size2: 150 },
      // Hockey: the brighter team color on wedges/stripe, the darker one on spine + lettering
      palette(d, p) {
        const C = PM.colors;
        const [dark, light] = C.lum(p.primary) <= C.lum(p.secondary) ? [p.primary, p.secondary] : [p.secondary, p.primary];
        d.hockey.color = light; d.hockey.ringColor = light;
        d.spine.outer = dark; d.spine.inner = dark;
        d.spine.stitch = C.mix(dark, C.lum(dark) > 0.5 ? '#000000' : '#ffffff', 0.35);
        const txt = C.contrast(dark, d.field.color) >= 2.2 ? dark : (C.contrast(light, d.field.color) >= 2.2 ? light : '#1b1b1b');
        for (const l of [d.line1, d.line2]) if (l.fill === p.primary || l.fill === p.secondary || l.fill === '#141414') l.fill = txt;
      },
    }),

    // ---------- Edge Trim: stripes follow both slanted edges and meet at the tip ----------
    edge: Object.assign({}, GEO, {
      name: 'Edge Trim',
      pattern(d, g) {
        const e = d.edge, t = g.t;
        if (!e.show) return '';
        const x0 = t.bodyX - 4, x1 = g.tipX + 20, m = d.field.margin;
        const band = (yAt, slope, o, w, c) => poly([[x0, yAt + o], [x1, yAt + o + slope * (x1 - t.bodyX)], [x1, yAt + o + w + slope * (x1 - t.bodyX)], [x0, yAt + o + w]], c);
        // each pair stays on its own half (top above the centre line, bottom below) so they meet in a chevron
        const yc = (t.top + t.bottom) / 2;
        let s = insetClip('patClip', g) + `<defs><clipPath id="edgeTop"><rect x="0" y="0" width="${x1 + 20}" height="${yc}"/></clipPath>` +
          `<clipPath id="edgeBot"><rect x="0" y="${yc}" width="${x1 + 20}" height="${t.bottom + 20}"/></clipPath></defs>` +
          `<g data-part="pattern" clip-path="url(#patClip)">`;
        // top edge: offsets measured downward from the top edge; bottom edge: upward from the bottom edge
        const o1 = m + e.inset, o2 = o1 + e.w + e.gap;
        s += `<g clip-path="url(#edgeTop)">` + band(t.top, g.a, o1, e.w, e.colorA) + band(t.top, g.a, o2, e.w, e.colorB) + `</g>`;
        s += `<g clip-path="url(#edgeBot)">` + band(t.bottom, g.b, -o1 - e.w, e.w, e.colorA) + band(t.bottom, g.b, -o2 - e.w, e.w, e.colorB) + `</g>`;
        return s + `</g>`;
      },
      defaults: {
        wordStyle: 'slab',
        field: { margin: 16, tipX: 1905 },
        spine: { outerW: 40, innerW: 18, stitchSeam: true },
        ties: { top: { show: true }, bottom: { show: true } },
        stamps: { x: 180, y: 138, items: [{ show: true, size: 62 }, { show: true, size: 62 }] },
        mark: { x: 400, y: 404, size: 340 },
        line1: { x: 840, y: 340, size: 58, maxWidth: 430 },
        line2: { x: 840, y: 478, size: 124, maxWidth: 560 },
        extra: { x: 420, y: 640 },
        maker: { x: 205, y: 690 },
      },
      field: PM.DEFAULT_FIELD,
      layout: { l1y: 340, l2y: 478, soloY: 440, size2: 124 },
      palette(d, p) { d.edge.colorA = p.primary; d.edge.colorB = p.secondary; },
    }),

    // ---------- Split Two-Tone: top half one colour, bottom half another, felt divider ----------
    split: Object.assign({}, GEO, {
      name: 'Split Two-Tone',
      pattern(d, g) {
        const k = d.split, t = g.t;
        if (!k.show) return '';
        const x0 = t.bodyX - 4, x1 = g.tipX + 20, yc = (t.top + t.bottom) / 2 + k.offset, h = k.divW / 2;
        let s = insetClip('patClip', g) + `<g data-part="pattern" clip-path="url(#patClip)">`;
        s += poly([[x0, t.top - 10], [x1, t.top - 10], [x1, yc - h], [x0, yc - h]], k.top);
        s += poly([[x0, yc + h], [x1, yc + h], [x1, t.bottom + 10], [x0, t.bottom + 10]], k.bottom);
        if (k.divW > 0) s += poly([[x0, yc - h], [x1, yc - h], [x1, yc + h], [x0, yc + h]], k.divider);
        return s + `</g>`;
      },
      defaults: {
        wordStyle: 'split',
        field: { margin: 18, tipX: 1905 },
        spine: { outerW: 40, innerW: 18, stitchSeam: true },
        ties: { top: { show: true }, bottom: { show: true } },
        stamps: { x: 180, y: 105, items: [{ show: true, size: 64 }, { show: true, size: 64 }] },
        mark: { x: 420, y: 404, size: 420 },
        line1: { x: 1060, y: 360, size: 74, maxWidth: 560 },
        line2: { x: 1060, y: 500, size: 160, maxWidth: 760 },
        extra: { x: 420, y: 690 },
        maker: { x: 205, y: 690 },
      },
      field: PM.DEFAULT_FIELD,
      layout: { l1y: 360, l2y: 500, soloY: 460, size2: 160 },
      // colour fills the pennant: felt-coloured lettering with a dark outline reads on both halves
      palette(d, p) {
        const C = PM.colors;
        d.split.top = p.primary; d.split.bottom = p.secondary; d.split.divider = d.field.color;
        const dark = C.lum(p.primary) <= C.lum(p.secondary) ? p.primary : p.secondary;
        for (const l of [d.line1, d.line2]) { l.fill = d.field.color; l.o1 = { color: d.field.color, w: 0 }; l.o2 = { color: C.darken(dark, 0.35), w: 4 }; l.shadow.on = false; l.tail = false; }
      },
    }),

    // ---------- College Bands: upright colour bands near the spine ----------
    bands: Object.assign({}, GEO, {
      name: 'College Bands',
      pattern(d, g) {
        const k = d.bands, t = g.t;
        if (!k.show) return '';
        let s = insetClip('patClip', g) + `<g data-part="pattern" clip-path="url(#patClip)">`;
        let x = t.bodyX + k.start;
        for (let i = 0; i < k.count; i++) {
          s += poly([[x, t.top - 10], [x + k.w, t.top - 10], [x + k.w, t.bottom + 10], [x, t.bottom + 10]], i % 2 ? k.colorB : k.colorA);
          x += k.w + k.gap;
        }
        return s + `</g>`;
      },
      defaults: {
        wordStyle: 'classic',
        field: { margin: 18, tipX: 1905 },
        spine: { outerW: 40, innerW: 18, stitchSeam: true },
        ties: { top: { show: true }, bottom: { show: true } },
        stamps: { x: 440, y: 150, items: [{ show: true, size: 58 }, { show: false, size: 58 }] },
        mark: { x: 560, y: 404, size: 340 },
        line1: { x: 1130, y: 358, size: 66, maxWidth: 520 },
        line2: { x: 1130, y: 486, size: 140, maxWidth: 660 },
        extra: { x: 560, y: 640 },
        maker: { x: 205, y: 690 },
      },
      field: PM.DEFAULT_FIELD,
      layout: { l1y: 358, l2y: 486, soloY: 440, size2: 140 },
      palette(d, p) { d.bands.colorA = p.primary; d.bands.colorB = p.secondary; },
    }),

    // ---------- Gridiron: football field with an end zone, yard lines and hash marks ----------
    gridiron: Object.assign({}, GEO, {
      name: 'Gridiron',
      pattern(d, g) {
        const k = d.grid, t = g.t;
        if (!k.show) return '';
        const x0 = t.bodyX - 4, x1 = g.tipX + 20, ez = t.bodyX + k.endW;
        let s = insetClip('patClip', g) + `<g data-part="pattern" clip-path="url(#patClip)">`;
        s += poly([[x0, t.top - 10], [x1, t.top - 10], [x1, t.bottom + 10], [x0, t.bottom + 10]], k.field);
        if (k.endW > 0) s += poly([[x0, t.top - 10], [ez, t.top - 10], [ez, t.bottom + 10], [x0, t.bottom + 10]], k.endzone);
        const lw = 6, yc = (t.top + t.bottom) / 2;
        for (let x = ez; x < g.tipX - 40; x += k.every) {
          s += `<rect x="${x - lw / 2}" y="${t.top - 10}" width="${lw}" height="${t.bottom - t.top + 20}" fill="${k.lines}"/>`;
          if (k.hash) for (let hx = x + k.every / 5; hx < x + k.every - 4 && hx < g.tipX - 60; hx += k.every / 5)
            for (const hy of [yc - 120, yc + 120]) s += `<rect x="${hx - 2.5}" y="${hy - 12}" width="5" height="24" fill="${k.lines}"/>`;
        }
        return s + `</g>`;
      },
      defaults: {
        wordStyle: 'split',
        field: { margin: 18, tipX: 1905 },
        spine: { outerW: 40, innerW: 18, stitchSeam: true },
        ties: { top: { show: true }, bottom: { show: true } },
        stamps: { x: 180, y: 105, items: [{ show: true, size: 60 }, { show: true, size: 60 }] },
        mark: { x: 470, y: 404, size: 400 },
        line1: { x: 1080, y: 360, size: 72, maxWidth: 560 },
        line2: { x: 1080, y: 496, size: 156, maxWidth: 740 },
        extra: { x: 470, y: 690 },
        maker: { x: 205, y: 690 },
      },
      field: PM.DEFAULT_FIELD,
      layout: { l1y: 360, l2y: 496, soloY: 455, size2: 156 },
      palette(d, p) {
        const C = PM.colors;
        const [dark, light] = C.lum(p.primary) <= C.lum(p.secondary) ? [p.primary, p.secondary] : [p.secondary, p.primary];
        d.grid.field = dark; d.grid.endzone = light; d.grid.lines = d.field.color;
        for (const l of [d.line1, d.line2]) { l.fill = d.field.color; l.o1 = { color: d.field.color, w: 0 }; l.o2 = { color: light, w: 4 }; l.shadow.on = false; l.tail = false; }
      },
    }),
  };

  // Recursive merge; arrays of objects merge item by item (so logos in stamp slots survive).
  PM.merge = (base, over) => {
    for (const k of Object.keys(over || {})) {
      const o = over[k], b = base[k];
      if (Array.isArray(o) && Array.isArray(b)) o.forEach((v, i) => { if (v && typeof v === 'object' && b[i] && typeof b[i] === 'object') PM.merge(b[i], v); else b[i] = v; });
      else if (o && typeof o === 'object' && !Array.isArray(o) && b && typeof b === 'object') PM.merge(b, o);
      else base[k] = o;
    }
    return base;
  };

  // ---------- Layers ----------
  // Movable layers (position objects) and every layer that can share colors.
  PM.LAYER_KEYS = ['stamps', 'mark', 'line1', 'line2', 'extra', 'maker'];
  PM.LAYERS_ALL = [
    ['line1', 'Wordmark line 1'], ['line2', 'Wordmark line 2'], ['extra', 'Extra text'], ['mark', 'Primary mark'],
    ['stamps', 'League stamps'], ['maker', "Maker's mark"], ['pattern', 'Background pattern'], ['spine', 'Spine'], ['ties', 'Ties'], ['field', 'Felt body'],
  ];
  PM.layer = (d, k) => (d.layers && d.layers[k]) || {};
  PM.isLocked = (d, k) => !!PM.layer(d, k).lock;
  // the design objects a layer key owns (the pattern layer covers every template's pattern settings)
  PM.layerObjects = (d, k) => (k === 'pattern' ? [d.stripes, d.hoops, d.hockey, d.edge, d.split, d.bands, d.grid] : [d[k]]).filter(Boolean);

  // Older saved designs lack settings added later (new backgrounds etc.): fill them in from the defaults.
  PM.fillMissing = (d) => {
    if (!d || d.__filled) return d;
    const def = PM.defaultDesign();
    for (const k of Object.keys(def)) if (d[k] === undefined) d[k] = def[k];
    Object.defineProperty(d, '__filled', { value: true, enumerable: false });
    return d;
  };

  // Switch a design to another background: apply that template's layout, then recolor.
  PM.setTemplate = (d, key) => {
    const tpl = PM.TEMPLATES[key]; if (!tpl) return d;
    PM.fillMissing(d);
    const prevField = (PM.TEMPLATES[d.template] || {}).field;
    d.template = key;
    const defs = JSON.parse(JSON.stringify(tpl.defaults));
    // locked layers keep their position and size
    for (const k of PM.LAYER_KEYS) if (PM.isLocked(d, k) && defs[k]) { delete defs[k].x; delete defs[k].y; delete defs[k].size; }
    PM.merge(d, defs);
    // swap felt color only if it was still the old template's default felt
    if (!d.field.color || d.field.color === prevField || d.field.color === PM.DEFAULT_FIELD) {
      d.field.color = tpl.field; if (d.palette) d.palette.field = tpl.field;
    }
    d.mark.knockout.color = d.field.color;
    if (PM.colors && d.palette) PM.colors.applyPalette(d, Object.assign({}, d.palette, { field: d.field.color }), d.wordStyle);
    return d;
  };

  // Font catalog lives in fontlist.js (PM.FONTS, PM.FONT_DEFS, PM.fontDef).

  // Knockout = felt-colored room around an item. shape: outline (follows the item), box, circle.
  PM.defaultKo = (on, w = 12) => ({ on, color: PM.DEFAULT_FIELD, w, shape: 'outline', radius: 18 });
  PM.KO_SHAPES = [['outline', 'Follow the shape'], ['box', 'Rounded box'], ['circle', 'Circle / oval']];

  const text = (over) => Object.assign({
    show: true, text: '', font: 'Oswald', size: 80, fill: '#3a3839', x: 1030, y: 330, maxWidth: 780,
    letterSpacing: 0, rotate: 0, slant: 0, italic: false,
    o1: { color: PM.DEFAULT_FIELD, w: 0 }, o2: { color: '#3a3839', w: 0 },
    shadow: { on: false, color: '#000000', dx: 5, dy: 5 }, tail: false,
    ko: PM.defaultKo(false),
    // image instead of text (an uploaded or dropped wordmark): box = maxWidth x size, scaled by imgScale
    useImg: false, img: null, imgAR: 0, imgScale: 1,
  }, over);

  // The generic starter pennant (white / gray / black).
  PM.defaultDesign = () => ({
    version: 1,
    template: 'classic',
    name: 'Starter',
    wordStyle: 'classic',
    palette: { primary: '#3a3839', secondary: '#8b8a8b', tertiary: null, field: PM.DEFAULT_FIELD },
    field: { color: PM.DEFAULT_FIELD, margin: 18, tipX: 1905 },
    spine: { show: true, outer: '#3a3839', inner: '#8b8a8b', outerW: 40, innerW: 18, stitch: '#f4ecd8', stitchOn: true, stitchOuter: true, stitchSeam: true, stitchW: 1.8, dash: 7 },
    ties: { top: { show: true, color: '#3a3839' }, bottom: { show: true, color: '#8b8a8b' }, width: 30, feltStyle: 'loops' },
    stripes: { show: true, order: 'ABBA', colorA: '#3a3839', colorB: '#8b8a8b', thickness: 63, gap: 18, topY: 262, bottomY: 585, hide: [false, false, false, false] },
    hoops: { show: true, wedges: true, stripes: true, wedge: '#3a3839', stripe: '#8b8a8b', wedgeH: 165, gap: 24, stripeW: 30, stripeEnd: 1900 },
    edge: { show: true, colorA: '#3a3839', colorB: '#8b8a8b', w: 26, gap: 10, inset: 10 },
    split: { show: true, top: '#3a3839', bottom: '#8b8a8b', divider: PM.DEFAULT_FIELD, divW: 18, offset: 0 },
    bands: { show: true, colorA: '#3a3839', colorB: '#8b8a8b', w: 52, gap: 14, count: 3, start: 14 },
    grid: { show: true, field: '#3a3839', endzone: '#8b8a8b', lines: PM.DEFAULT_FIELD, every: 150, endW: 150, hash: true },
    hockey: { show: true, wedges: true, color: '#8b8a8b', wedgeH: 205, center: true, centerW: 58, centerEnd: 1790, knockout: true, knockPad: 24, medallion: true, medScale: 1.13, ring: false, ringColor: '#8b8a8b', ringW: 10, ringGap: 12 },
    stamps: {
      x: 180, y: 105, gap: 10, ko: PM.defaultKo(false, 6),
      items: [{ show: true, src: null, size: 68, label: 'League' }, { show: true, src: null, size: 68, label: 'Conference' }],
    },
    mark: { show: true, src: null, x: 415, y: 400, size: 450, knockout: { on: true, color: PM.DEFAULT_FIELD, w: 9, shape: 'outline', radius: 24 }, ring: { on: false, color: '#3a3839', w: 4 } },
    line1: text({ text: '', font: 'Oswald Medium', size: 78, x: 1065, y: 340, maxWidth: 560 }),
    line2: text({ text: '', font: 'Bebas Neue', size: 170, x: 1065, y: 500, maxWidth: 790 }),
    extra: text({ show: false, text: '', size: 44, x: 415, y: 690, maxWidth: 420, font: 'Oswald' }),
    maker: { show: false, src: null, x: 205, y: 690, size: 50, ko: PM.defaultKo(false, 6) },
    // Layers panel state: lock = fixed in place; move / color = link group ('' or 'A'..'D')
    layers: {},
  });

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  PM.esc = esc;

  // ---------- Geometry helpers ----------
  PM.geom = (d) => {
    const t = PM.TEMPLATES[d.template] || PM.TEMPLATES.classic;
    const tipX = d.field.tipX || t.tipX;
    const tipY = (t.top + t.bottom) / 2;
    const dx = tipX - t.bodyX;
    const a = (tipY - t.top) / dx;      // top edge slope
    const b = (tipY - t.bottom) / dx;   // bottom edge slope (stripes run parallel to this)
    const m = d.field.margin;
    const ix = (t.bottom - t.top - 2 * m) / (a - b);
    return {
      t, tipX, tipY, a, b,
      body: [[t.bodyX - 2, t.top], [tipX, tipY], [t.bodyX - 2, t.bottom]],
      inset: [[t.bodyX - 4, t.top + m], [t.bodyX + ix, t.top + m + a * ix], [t.bodyX - 4, t.bottom - m]],
    };
  };
  const pts = (arr) => arr.map((p) => p.map((v) => +v.toFixed(2)).join(',')).join(' ');

  // ---------- Text measuring (canvas, fonts must be loaded) ----------
  const mctx = document.createElement('canvas').getContext('2d');
  // CSS font shorthand for a text part: face from the catalog, plus the part's own italic toggle.
  PM.fontCss = (t, size) => {
    const f = PM.fontDef(t.font);
    const italic = t.italic || f.style === 'italic';
    return `${italic ? 'italic ' : ''}${f.weight} ${f.stretch && f.stretch !== 'normal' ? f.stretch + ' ' : ''}${size}px "${f.family}"`;
  };
  PM.measure = (t, size) => {
    mctx.font = PM.fontCss(t, size);
    const w = mctx.measureText(t.text).width;
    return w + Math.max(0, t.text.length - 1) * (t.letterSpacing || 0) * (size / t.size);
  };
  PM.fitSize = (t) => {
    if (!t.text) return t.size;
    const w = PM.measure(t, t.size);
    return t.maxWidth && w > t.maxWidth ? t.size * t.maxWidth / w : t.size;
  };

  // ---------- Keep wordmark lines inside the pennant ----------
  // The felt narrows toward the tip, so a line that fits its width box can still poke through the slanted
  // edges. Shrink the line (text: maxWidth, image: imgScale) until its box sits inside the felt with some room.
  // Only ever shrinks; assumes the line's fonts are loaded (use PM.fitToPennant for that).
  PM.fitLineToPennant = (d, k, opts = {}) => {
    const l = d[k];
    if (!l || !l.show || (!l.text && !PM.lineUsesImg(l))) return false;
    const g = PM.geom(d), t = g.t, pad = 10; // px of felt kept between the line and the pennant's edge
    // furthest right the box may reach at a given top / bottom
    const reach = (yTop, yBot) => Math.min(
      g.tipX - pad,
      t.bodyX + (yTop - t.top - pad) / g.a,
      t.bodyX + (yBot + pad - t.bottom) / g.b);
    // furthest left: clear of the primary mark (or the spine)
    const left = d.mark && d.mark.show && d.mark.src !== undefined && d.mark.x + d.mark.size / 2 < l.x
      ? d.mark.x + d.mark.size / 2 + 24 : t.bodyX + 60;
    const edge = (l.o1?.w || 0) + (l.o2?.w || 0) + (l.ko?.on ? l.ko.w || 0 : 0);
    const box = () => {
      if (PM.lineUsesImg(l)) { const b = PM.lineImgBox(l); return { w: b.w, top: b.cy - b.h / 2 - edge, bot: b.cy + b.h / 2 + edge }; }
      const size = PM.fitSize(l), below = /[gjpqy]/.test(l.text) || l.tail ? 0.3 : 0.08;
      return { w: PM.measure(l, size), top: l.y - 0.72 * size - edge, bot: l.y + below * size + edge };
    };
    let changed = false;
    for (let i = 0; i < 14; i++) {
      const bx = box(), xr = reach(bx.top, bx.bot);
      const over = l.x + bx.w / 2 - xr;
      if (over <= 0.5) break;
      // 1) slide left into the taller part of the pennant, if there's free felt there
      const slack = opts.shift === false ? 0 : (l.x - bx.w / 2) - left;
      if (slack > 1) { l.x = Math.round(l.x - Math.min(over, slack)); changed = true; continue; }
      // 2) still too big: shrink
      const allowed = 2 * (xr - l.x);
      if (PM.lineUsesImg(l)) {
        if ((l.imgScale || 1) < 0.3) break;
        l.imgScale = +((l.imgScale || 1) * Math.max(0.6, Math.min(0.97, allowed / bx.w))).toFixed(3);
      } else l.maxWidth = Math.max(60, Math.floor(Math.min(l.maxWidth || bx.w, allowed, bx.w * 0.97)));
      changed = true;
    }
    return changed;
  };
  // Primary logo: clear of the spine and inside the slanted edges (slide right / re-centre first, then shrink).
  // ar = the logo image's width / height (it's drawn fitted inside a size x size square).
  PM.fitMarkToPennant = (d, ar = 1) => {
    const m = d.mark;
    if (!m || !m.show || !m.src) return false;
    const g = PM.geom(d), t = g.t, pad = 10;
    const yTop = (x) => t.top + g.a * (x - t.bodyX), yBot = (x) => t.bottom + g.b * (x - t.bodyX);
    const ext = () => {
      const ko = m.knockout && m.knockout.on ? m.knockout.w || 0 : 0, ring = m.ring && m.ring.on ? m.ring.w || 0 : 0;
      if (d.template === 'hockey' && d.hockey && d.hockey.show && d.hockey.medallion) { const r = m.size / 2 * (d.hockey.medScale || 1) + 6; return [r, r]; }
      if (m.knockout && m.knockout.on && m.knockout.shape && m.knockout.shape !== 'outline') { const r = m.size / 2 + ko; return [r, r]; }
      const hw = (ar >= 1 ? m.size : m.size * ar) / 2, hh = (ar >= 1 ? m.size / ar : m.size) / 2;
      return [hw + ko + ring, hh + ko + ring];
    };
    let changed = false;
    for (let i = 0; i < 30; i++) {
      const [hw, hh] = ext();
      const minX = t.bodyX + pad + hw;
      if (m.x < minX - 0.5) { m.x = Math.round(minX); changed = true; continue; }            // off the spine
      const xr = m.x + hw, top = yTop(xr) + pad, bot = yBot(xr) - pad;
      if (m.y - hh >= top - 0.5 && m.y + hh <= bot + 0.5) break;                               // fits
      const mid = (top + bot) / 2;
      if (hh <= (bot - top) / 2 && Math.abs(m.y - mid) > 0.5) { m.y = Math.round(mid); changed = true; continue; } // re-centre
      // shrink, keeping the left edge where it is
      const k = Math.max(0.85, Math.min(0.97, (bot - top) / 2 / hh));
      const leftEdge = m.x - hw;
      m.size = Math.max(60, Math.round(m.size * k));
      m.x = Math.round(leftEdge + ext()[0]); changed = true;
      if (m.size <= 60) break;
    }
    return changed;
  };
  const aspectOf = (src) => new Promise((res) => {
    if (!src || typeof Image === 'undefined') return res(1);
    const i = new Image(); i.onload = () => res(i.naturalWidth && i.naturalHeight ? i.naturalWidth / i.naturalHeight : 1); i.onerror = () => res(1); i.src = src;
  });
  PM.fitToPennant = async (d, keys = ['mark', 'line1', 'line2', 'extra']) => {
    let markCh = false;
    if (keys.includes('mark')) markCh = PM.fitMarkToPennant(d, await aspectOf(d.mark && d.mark.src));
    if (PM.ensureFonts) await PM.ensureFonts(d);
    // the two wordmark lines share a centre: fit the big line (which may slide), then bring line 1 along
    const together = keys.includes('line1') && keys.includes('line2') && Math.abs(d.line1.x - d.line2.x) < 2;
    let ch = false;
    if (keys.includes('line2')) ch = PM.fitLineToPennant(d, 'line2') || ch;
    if (keys.includes('line1')) {
      if (together && d.line1.x !== d.line2.x) { d.line1.x = d.line2.x; ch = true; }
      ch = PM.fitLineToPennant(d, 'line1', { shift: !together }) || ch;
    }
    if (keys.includes('extra')) ch = PM.fitLineToPennant(d, 'extra') || ch;
    return ch || markCh;
  };

  // ---------- Parts ----------
  function tailPath(x, y, w, s) {
    const L = x - w / 2 + w * 0.04, R = x + w / 2;
    return `M${L},${y + 0.1 * s} C${L + 0.3 * w},${y + 0.36 * s} ${R - 0.15 * w},${y + 0.22 * s} ${R + 0.45 * s},${y - 0.2 * s} ` +
      `C${R - 0.05 * w},${y + 0.3 * s} ${L + 0.35 * w},${y + 0.24 * s} ${L},${y + 0.1 * s} Z`;
  }

  // Where a wordmark image sits: centred where the text's capitals would be, fitted inside maxWidth x size.
  PM.lineImgBox = (l) => {
    const bw = (l.maxWidth || 800) * (l.imgScale || 1), bh = l.size * 1.15 * (l.imgScale || 1), ar = l.imgAR || 3;
    const w = bw / bh > ar ? bh * ar : bw, h = bw / bh > ar ? bh : bw / ar;
    return { cx: l.x, cy: l.y - l.size * 0.36, w, h };
  };
  PM.lineUsesImg = (l) => !!(l.show && l.useImg && l.img);

  function linePic(t, part) {
    const b = PM.lineImgBox(t), ko = t.ko;
    let defs = '', behind = '', filter = '';
    if (ko && ko.on && ko.w > 0) {
      if (ko.shape === 'outline') {
        const fid = 'ko_' + part;
        defs = `<defs><filter id="${fid}" x="-30%" y="-50%" width="160%" height="200%"><feMorphology in="SourceAlpha" operator="dilate" radius="${ko.w}" result="d"/>` +
          `<feFlood flood-color="${ko.color}"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
        filter = ` filter="url(#${fid})"`;
      } else {
        const L = b.cx - b.w / 2 - ko.w, T = b.cy - b.h / 2 - ko.w, W = b.w + 2 * ko.w, H = b.h + 2 * ko.w;
        behind = ko.shape === 'circle'
          ? `<ellipse cx="${b.cx}" cy="${b.cy}" rx="${(W / 2 * 1.12).toFixed(1)}" ry="${(H / 2 * 1.3).toFixed(1)}" fill="${ko.color}"/>`
          : `<rect x="${L.toFixed(1)}" y="${T.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" rx="${ko.radius}" fill="${ko.color}"/>`;
      }
    }
    const tf = [];
    if (t.rotate) tf.push(`rotate(${t.rotate} ${t.x} ${t.y})`);
    if (t.slant) tf.push(`translate(${t.y * Math.tan(t.slant * Math.PI / 180)},0) skewX(${-t.slant})`);
    return `<g data-part="${part}"${tf.length ? ` transform="${tf.join(' ')}"` : ''}>${defs}${behind}` +
      `<image href="${t.img}" x="${(b.cx - b.w / 2).toFixed(1)}" y="${(b.cy - b.h / 2).toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"${filter}/></g>`;
  }

  function textPart(t, part) {
    if (PM.lineUsesImg(t)) return linePic(t, part);
    if (!t.show || !t.text) return '';
    const size = PM.fitSize(t);
    const w = PM.measure(t, size);
    const ls = (t.letterSpacing || 0) * (size / t.size);
    const fd = PM.fontDef(t.font), italic = t.italic || fd.style === 'italic';
    const base = `x="${t.x}" y="${t.y}" text-anchor="middle" font-family="${esc(fd.family)}" font-weight="${fd.weight}" font-size="${size.toFixed(1)}"` +
      `${italic ? ' font-style="italic"' : ''}${fd.stretch && fd.stretch !== 'normal' ? ` font-stretch="${fd.stretch}"` : ''}${ls ? ` letter-spacing="${ls.toFixed(1)}"` : ''}`;
    const str = esc(t.text);
    const tail = t.tail ? tailPath(t.x, t.y, w, size) : null;
    const layer = (fill, stroke, sw, extra = '') => {
      const st = sw > 0 ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke"` : '';
      return `<g${extra}>${tail ? `<path d="${tail}" fill="${fill}"${st}/>` : ''}<text ${base} fill="${fill}"${st}>${str}</text></g>`;
    };
    const o1 = t.o1.w > 0 ? t.o1.w : 0, o2 = t.o2.w > 0 ? t.o2.w : 0;
    let out = '';
    const ko = t.ko;
    if (ko && ko.on && ko.w > 0) {
      if (ko.shape === 'outline') {
        // dilate the outermost text layer and fill it with the knockout color
        const fid = 'ko_' + part;
        out += `<defs><filter id="${fid}" x="-30%" y="-80%" width="160%" height="260%"><feMorphology in="SourceAlpha" operator="dilate" radius="${ko.w}" result="d"/>` +
          `<feFlood flood-color="${ko.color}"/><feComposite in2="d" operator="in"/></filter></defs>` +
          layer('#000', '#000', 2 * (o1 + o2), ` filter="url(#${fid})"`);
      } else {
        const asc = 0.8 * size, desc = (t.tail ? 0.36 : 0.2) * size;
        const L = t.x - w / 2 - ko.w, R = t.x + w / 2 + (t.tail ? 0.45 * size : 0) + ko.w;
        const T = t.y - asc - ko.w - o1 - o2, B = t.y + desc + ko.w + o1 + o2;
        out += ko.shape === 'circle'
          ? `<ellipse cx="${((L + R) / 2).toFixed(1)}" cy="${((T + B) / 2).toFixed(1)}" rx="${((R - L) / 2 * 1.12).toFixed(1)}" ry="${((B - T) / 2 * 1.3).toFixed(1)}" fill="${ko.color}"/>`
          : `<rect x="${L.toFixed(1)}" y="${T.toFixed(1)}" width="${(R - L).toFixed(1)}" height="${(B - T).toFixed(1)}" rx="${ko.radius}" fill="${ko.color}"/>`;
      }
    }
    if (t.shadow.on) {
      out += layer(t.shadow.color, t.shadow.color, 2 * (o1 + o2), ` transform="translate(${t.shadow.dx},${t.shadow.dy})"`);
    }
    if (o2) out += layer(t.o2.color, t.o2.color, 2 * (o1 + o2));
    if (o1) out += layer(t.o1.color, t.o1.color, 2 * o1);
    out += layer(t.fill, null, 0);
    const tf = [];
    if (t.rotate) tf.push(`rotate(${t.rotate} ${t.x} ${t.y})`);
    if (t.slant) tf.push(`translate(${t.y * Math.tan(t.slant * Math.PI / 180)},0) skewX(${-t.slant})`);
    return `<g data-part="${part}"${tf.length ? ` transform="${tf.join(' ')}"` : ''}>${out}</g>`;
  }

  function imagePart(id, src, x, y, size, ko, ring, placeholder, label) {
    if (!src) {
      if (!placeholder) return '';
      const r = size / 2;
      return `<g data-part="${id}" class="ph"><circle cx="${x}" cy="${y}" r="${r - 3}" fill="rgba(0,0,0,0.04)" stroke="#9a948a" stroke-width="${Math.max(2, size / 90)}" stroke-dasharray="${size / 25} ${size / 40}"/>` +
        `<text x="${x}" y="${y + size / 22}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${Math.max(11, size / 8)}" fill="#9a948a">${esc(label)}</text></g>`;
    }
    let filter = '', defs = '', behind = '';
    // box / circle knockouts are plain shapes behind the image; 'outline' uses the dilate filter below
    if (ko && ko.on && ko.w > 0 && ko.shape && ko.shape !== 'outline') {
      const r = size / 2 + ko.w;
      behind = ko.shape === 'circle' ? `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${ko.color}"/>`
        : `<rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${(2 * r).toFixed(1)}" height="${(2 * r).toFixed(1)}" rx="${ko.radius}" fill="${ko.color}"/>`;
      ko = null;
    }
    if ((ko && ko.on && ko.w > 0) || (ring && ring.on && ring.w > 0)) {
      const fid = 'f_' + id;
      const k = ko && ko.on ? ko.w : 0, r = ring && ring.on ? ring.w : 0;
      defs = `<filter id="${fid}" x="-25%" y="-25%" width="150%" height="150%">` +
        (r ? `<feMorphology in="SourceAlpha" operator="dilate" radius="${k + r}" result="d2"/><feFlood flood-color="${ring.color}"/><feComposite in2="d2" operator="in" result="o2"/>` : '') +
        (k ? `<feMorphology in="SourceAlpha" operator="dilate" radius="${k}" result="d1"/><feFlood flood-color="${ko.color}"/><feComposite in2="d1" operator="in" result="o1"/>` : '') +
        `<feMerge>${r ? '<feMergeNode in="o2"/>' : ''}${k ? '<feMergeNode in="o1"/>' : ''}<feMergeNode in="SourceGraphic"/></feMerge></filter>`;
      filter = ` filter="url(#${fid})"`;
    }
    return `<g data-part="${id}">${defs ? `<defs>${defs}</defs>` : ''}${behind}<image href="${src}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"${filter}/></g>`;
  }

  // ---------- Main render ----------
  // opts: { layer: 'all'|'base'|'applique', parts: [...], tieStyle: 'chevron'|'loops', placeholders, fontCss, bg }
  // parts (felt mockup draws each separately): ties, field, stripes, spine, stitch, applique
  PM.LAYERS = { base: ['ties', 'field', 'stripes', 'spine', 'stitch'], applique: ['applique'] };
  PM.renderSVG = (d, opts = {}) => {
    PM.fillMissing(d);
    const g = PM.geom(d), t = g.t;
    const layer = opts.layer || 'all';
    const parts = new Set(opts.parts || (layer === 'all' ? [...PM.LAYERS.base, ...PM.LAYERS.applique] : PM.LAYERS[layer]));
    const has = (p) => parts.has(p);
    let s = '';

    {
      // Ties (behind spine). Chevron = the flat graphic; loops = folded fabric tabs (felt look).
      const loops = (opts.tieStyle || 'chevron') === 'loops';
      const tie = (cfg, y, id) => {
        if (!cfg.show) return '';
        if (!loops) return `<polyline data-part="${id}" points="${pts([[18, y - 44], [t.spineX + 6, y], [18, y + 44]])}" fill="none" stroke="${cfg.color}" stroke-width="${d.ties.width}" stroke-linejoin="miter" stroke-miterlimit="6"/>`;
        const w = d.ties.width * 1.1, x0 = 4, x1 = t.spineX + 10;
        const tab = (dy, ang) => `<path transform="rotate(${ang} ${x1} ${y + dy})" d="M${x1},${y + dy - w / 2} H${x0 + w * 0.45} Q${x0},${y + dy - w / 2} ${x0},${y + dy} Q${x0},${y + dy + w / 2} ${x0 + w * 0.45},${y + dy + w / 2} H${x1} Z" fill="${cfg.color}"/>`;
        return `<g data-part="${id}">${tab(-w * 0.62, 5)}${tab(w * 0.62, -5)}</g>`;
      };
      if (has('ties')) s += tie(d.ties.top, t.tieTopY, 'tieTop') + tie(d.ties.bottom, t.tieBottomY, 'tieBottom');

      // Felt body
      if (has('field')) s += `<polygon data-part="field" points="${pts(g.body)}" fill="${d.field.color}"/>`;

      // Background pattern (template-specific: diagonal stripes, corner wedges, ...)
      if (has('stripes')) s += (PM.TEMPLATES[d.template] || PM.TEMPLATES.classic).pattern(d, g);

      // Two-tone spine + stitching
      if (d.spine.show) {
        const sp = d.spine, x = t.spineX, h = t.bottom - t.top;
        if (has('spine')) s += `<g data-part="spine"><rect x="${x}" y="${t.top}" width="${sp.outerW}" height="${h}" fill="${sp.outer}"/>` +
          `<rect x="${x + sp.outerW}" y="${t.top}" width="${sp.innerW}" height="${h}" fill="${sp.inner}"/></g>`;
        if (has('stitch') && sp.stitchOn) {
          const line = (lx) => `<line x1="${lx}" y1="${t.top + 2}" x2="${lx}" y2="${t.bottom - 2}" stroke="${sp.stitch}" stroke-width="${sp.stitchW}" stroke-dasharray="${sp.dash} ${sp.dash * 0.55}" stroke-linecap="round"/>`;
          s += `<g data-part="stitch">${sp.stitchOuter ? line(x + 4) : ''}${sp.stitchSeam ? line(x + sp.outerW + 4) : ''}</g>`;
        }
      }
    }

    if (has('applique')) {
      const ph = !!opts.placeholders;
      // League / conference stamps
      const S = d.stamps; let sx = S.x;
      s += `<g data-part="stamps">`;
      S.items.forEach((it, i) => {
        if (!it.show) return;
        if (!it.src && !ph) return;
        s += imagePart('stamp' + (i + 1), it.src, sx + it.size / 2, S.y, it.size, S.ko, null, ph, it.label || 'Stamp');
        sx += it.size + S.gap;
      });
      s += `</g>`;
      if (d.mark.show) s += imagePart('mark', d.mark.src, d.mark.x, d.mark.y, d.mark.size, d.mark.knockout, d.mark.ring, ph, 'PRIMARY MARK');
      s += textPart(d.extra, 'extra');
      s += textPart(d.line2, 'line2');
      s += textPart(d.line1, 'line1');
      if (d.maker.show) s += imagePart('maker', d.maker.src, d.maker.x, d.maker.y, d.maker.size, d.maker.ko, null, ph, 'MAKER');
    }

    const W = t.W, H = t.H;
    const bg = opts.bg ? `<rect width="${W}" height="${H}" fill="${opts.bg}"/>` : '';
    const style = opts.fontCss ? `<style>${opts.fontCss}</style>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${opts.width || W}" height="${opts.height || H}"${opts.crisp ? ' shape-rendering="crispEdges"' : ''}>${style}${bg}${s}</svg>`;
  };

  // Colors that appear in the design (used for 8-bit palette + swatches)
  PM.designColors = (d) => {
    PM.fillMissing(d);
    const set = new Set([d.field.color, d.spine.outer, d.spine.inner, d.spine.stitch, d.stripes.colorA, d.stripes.colorB,
      d.ties.top.color, d.ties.bottom.color, d.hoops.wedge, d.hoops.stripe, d.hockey.color, d.edge.colorA, d.edge.colorB, d.split.top, d.split.bottom, d.bands.colorA, d.bands.colorB, d.grid.field, d.grid.endzone, d.line1.fill, d.line2.fill, d.line2.o1.color, d.line2.o2.color, d.line1.o1.color]
      .map(PM.colors.norm).filter(Boolean));
    return [...set];
  };
})(window.PM);
