// Color utilities + palette → design mapping (the "auto" brain)
window.PM = window.PM || {};
(function (PM) {
  const C = {};

  C.norm = (h) => {
    if (!h) return null;
    h = String(h).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return '#' + h.toLowerCase();
  };
  C.rgb = (h) => { h = C.norm(h) || '#000000'; return [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)); };
  C.hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  C.lum = (h) => {
    const [r, g, b] = C.rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  C.contrast = (a, b) => { const x = C.lum(a), y = C.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  C.dist = (a, b) => { const x = C.rgb(a), y = C.rgb(b); return Math.sqrt((x[0] - y[0]) ** 2 * 0.3 + (x[1] - y[1]) ** 2 * 0.59 + (x[2] - y[2]) ** 2 * 0.11); };
  C.mix = (a, b, t) => { const x = C.rgb(a), y = C.rgb(b); return C.hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
  C.darken = (a, t) => C.mix(a, '#000000', t);
  C.lighten = (a, t) => C.mix(a, '#ffffff', t);

  // Pull the main colors out of a logo (data URL) — used to find a 3rd color
  // or fix a weak secondary when a database only gives primary/alternate.
  // minShare: skip colors covering less than this share of the logo (edge blends between two inks)
  C.extract = (dataUrl, n = 4, minShare = 0) => new Promise((resolve) => {
    if (!dataUrl) return resolve([]);
    const img = new Image();
    img.onload = () => {
      const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, s, s);
      let d; try { d = ctx.getImageData(0, 0, s, s).data; } catch { return resolve([]); }
      const buckets = {};
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        const k = [d[i] >> 4, d[i + 1] >> 4, d[i + 2] >> 4].join(',');
        const b = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0 });
        b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      }
      const total = Object.values(buckets).reduce((t, b) => t + b.n, 0);
      const list = Object.values(buckets).filter((b) => b.n >= total * minShare).sort((a, b) => b.n - a.n)
        .map((b) => C.hex(b.r / b.n, b.g / b.n, b.b / b.n));
      const out = [];
      for (const c of list) {
        if (out.every((o) => C.dist(o, c) > 60)) out.push(c);
        if (out.length >= n) break;
      }
      resolve(out);
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });

  // Make sure secondary/tertiary actually show up on the cream felt.
  C.fixPalette = (pal, logoColors = []) => {
    const F = pal.field || PM.DEFAULT_FIELD;
    const P = C.norm(pal.primary) || '#3a3839';
    const visible = (c) => c && C.contrast(c, F) >= 1.3 && C.dist(c, P) > 40;
    let S = C.norm(pal.secondary), T = C.norm(pal.tertiary);
    const pool = [S, T, ...logoColors.map(C.norm)].filter(visible);
    if (!visible(S)) S = pool.shift() || (C.lum(P) > 0.15 ? '#231f20' : '#8b8a8b');
    if (!visible(T) || T === S) T = pool.find((c) => c !== S && C.dist(c, S) > 40) || null;
    return { primary: P, secondary: S, tertiary: T, field: F };
  };

  // Wordmark style presets — each mirrors one of the reference pennants.
  C.STYLES = {
    classic: { label: 'Clean felt letters (default)', l1Font: 'Oswald Medium', l2Font: 'Bebas Neue' },
    block: { label: 'Varsity block (classic college)', l1Font: 'Oswald', l2Font: 'Graduate' },
    outline: { label: 'Hollow outline (Seahawks)', l1Font: 'Alfa Slab One', l2Font: 'Alfa Slab One' },
    script: { label: 'Script with tail (Dodgers style)', l1Font: 'Oswald', l2Font: 'Yellowtail' },
    modern: { label: 'Heavy modern (90s pro style)', l1Font: 'Archivo Black', l2Font: 'Archivo Black' },
    slab: { label: 'Slab (Angels)', l1Font: 'Oswald', l2Font: 'Alfa Slab One' },
    hoops: { label: 'Retro hoops (80s NBA)', l1Font: 'Alfa Slab One', l2Font: 'Alfa Slab One' },
    hockey: { label: 'Clean sans (80s NHL)', l1Font: 'Montserrat', l2Font: 'Montserrat' },
    split: { label: 'Felt letters (on colour)', l1Font: 'Oswald', l2Font: 'Graduate' },
    gothic: { label: 'Tall gothic (League Gothic)', l1Font: 'League Gothic', l2Font: 'League Gothic Condensed' },
    tight: { label: 'Modern tight (Inter Tight)', l1Font: 'Inter Tight Bold', l2Font: 'Inter Tight Black Italic' },
  };

  // Apply a palette to every colorable part of a design.
  C.applyPalette = (d, pal, style) => {
    const p = C.fixPalette(pal);
    const { primary: P, secondary: S, field: F } = p;
    const T = p.tertiary || S;
    style = style || d.wordStyle || 'block';
    d.palette = p; d.wordStyle = style;
    d.field.color = F;
    d.spine.outer = P; d.spine.inner = S;
    d.spine.stitch = C.lum(S) > 0.6 && C.lum(P) > 0.6 ? '#6b6258' : '#f4ecd8';
    d.ties.top.color = S; d.ties.bottom.color = P;
    d.stripes.colorA = P; d.stripes.colorB = S;
    d.mark.knockout.color = F;
    for (const o of [d.line1, d.line2, d.extra, d.maker, d.stamps]) if (o && o.ko) o.ko.color = F;
    d.mark.ring.color = P;
    const st = C.STYLES[style] || C.STYLES.block;
    const textColor = C.contrast(P, F) >= 2.2 ? P : (C.contrast(S, F) >= 2.2 ? S : '#1b1b1b');
    const l1 = d.line1, l2 = d.line2;
    l1.font = st.l1Font; l2.font = st.l2Font;
    l1.fill = textColor; l1.o1 = { color: F, w: 0 }; l1.o2 = { color: P, w: 0 }; l1.shadow.on = false;
    l2.tail = false; l2.rotate = 0; l1.rotate = 0; l1.letterSpacing = 0; l2.letterSpacing = 0;
    if (style === 'block') {
      l2.fill = textColor; l2.o1 = { color: F, w: 6 }; l2.o2 = { color: textColor, w: 3 };
      l1.fill = textColor === P ? (C.contrast(S, F) > 3 ? S : '#1b1b1b') : P;
      l2.shadow = { on: true, color: C.contrast(S, F) > 2 ? S : '#1b1b1b', dx: 6, dy: 6 };
    } else if (style === 'outline') {
      l2.fill = F; l2.o1 = { color: S, w: 7 }; l2.o2 = { color: P, w: 6 }; l2.shadow.on = false;
    } else if (style === 'script') {
      l2.fill = C.contrast(S, F) >= 1.7 ? S : P; l2.o1 = { color: textColor === l2.fill ? S : P, w: 4 }; l2.o2 = { color: F, w: 5 };
      if (l2.o1.color === l2.fill) l2.o1.color = P === l2.fill ? S : P;
      l2.tail = true; l2.rotate = -6; l2.shadow.on = false;
    } else if (style === 'modern') {
      l2.fill = '#141414'; l2.o1 = { color: F, w: 0 }; l2.o2 = { color: P, w: 0 }; l1.fill = '#141414';
      l2.shadow.on = false;
    } else if (style === 'slab') {
      l2.fill = P; l2.o1 = { color: F, w: 5 }; l2.o2 = { color: S, w: 4 }; l2.shadow.on = false;
    }
    else if (style === 'hoops') {
      const acc = C.contrast(S, F) >= 1.5 ? S : P;
      l2.fill = textColor; l2.o1 = { color: acc === textColor ? F : acc, w: 3 }; l2.o2 = { color: P, w: 0 }; l2.shadow.on = false;
      l1.fill = textColor; l1.o1 = { color: l2.o1.color, w: 2 };
    }
    else if (style === 'gothic') {
      l2.fill = textColor; l2.o1 = { color: F, w: 5 }; l2.o2 = { color: C.contrast(S, F) > 1.5 ? S : P, w: 4 }; l2.shadow.on = false; l1.fill = textColor;
      l1.letterSpacing = 4;
    }
    else if (style === 'tight') {
      l2.fill = textColor; l2.o1 = { color: F, w: 0 }; l2.o2 = { color: P, w: 0 }; l2.shadow.on = false; l1.fill = textColor;
    }
    else if (style === 'split') {
      l2.fill = F; l2.o1 = { color: F, w: 0 }; l2.o2 = { color: C.darken(P, 0.35), w: 4 }; l2.shadow.on = false; l1.fill = F; l1.o2 = { color: C.darken(P, 0.35), w: 3 };
    }
    else if (style === 'classic') {
      // tall, clean letters with one thin accent edge: reads like cut felt without the heavy block look
      const acc = textColor === P ? S : P;
      l2.fill = textColor; l2.o1 = { color: F, w: 0 }; l2.o2 = { color: acc, w: C.contrast(acc, F) >= 1.3 && acc !== textColor ? 3 : 0 }; l2.shadow.on = false;
      l1.fill = textColor; l1.letterSpacing = 6; l2.letterSpacing = 4;
    }
    else if (style === 'hockey') {
      l2.fill = textColor; l2.o1 = { color: F, w: 0 }; l2.o2 = { color: P, w: 0 }; l2.shadow.on = false; l1.fill = textColor;
    }
    d.extra.fill = textColor;
    const tpl = PM.TEMPLATES && PM.TEMPLATES[d.template];
    if (tpl && tpl.palette) tpl.palette(d, p);
    return d;
  };

  PM.colors = C;
})(window.PM);
