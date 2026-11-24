// Output renderers: flat SVG, flat PNG, felt mockup, 8-bit.
window.PM = window.PM || {};
(function (PM) {
  const R = {};

  R.loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };

  // Standalone SVG with fonts embedded (what the "Vector SVG" export writes).
  R.svg = async (d, opts = {}) => {
    await PM.ensureFonts(d);
    const fontCss = await PM.embedFonts(d);
    return PM.renderSVG(d, Object.assign({ fontCss }, opts));
  };

  R.svgToCanvas = async (svg, w, h) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = await R.loadImg(url);
      const c = canvas(w, h); c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c;
    } finally { URL.revokeObjectURL(url); }
  };

  const T = (d) => (d && PM.TEMPLATES[d.template]) || PM.TEMPLATES.classic;

  // ---------- Flat PNG ----------
  R.flat = async (d, { width = 2000, bg = null } = {}) => {
    const t = T(d), h = width * t.H / t.W;
    const svg = await R.svg(d, { width, height: h, bg: bg || undefined });
    return R.svgToCanvas(svg, width, h);
  };

  // ---------- Felt texture (generated once, tileable) ----------
  // Multi-scale value noise (mottling) + fine grain + short fibers, centered on mid-gray
  // so it can be laid over any color with 'overlay'.
  function valueNoise(size, cells, rnd) {
    const g = new Float32Array(cells * cells).map(() => rnd());
    const out = new Float32Array(size * size), step = size / cells;
    const sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++) {
      const gy = y / step, y0 = Math.floor(gy) % cells, y1 = (y0 + 1) % cells, fy = sm(gy - Math.floor(gy));
      for (let x = 0; x < size; x++) {
        const gx = x / step, x0 = Math.floor(gx) % cells, x1 = (x0 + 1) % cells, fx = sm(gx - Math.floor(gx));
        const a = g[y0 * cells + x0] + (g[y0 * cells + x1] - g[y0 * cells + x0]) * fx;
        const b = g[y1 * cells + x0] + (g[y1 * cells + x1] - g[y1 * cells + x0]) * fx;
        out[y * size + x] = a + (b - a) * fy;
      }
    }
    return out;
  }
  let feltTile = null;
  function felt() {
    if (feltTile) return feltTile;
    const s = 512, c = canvas(s, s), ctx = c.getContext('2d');
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n1 = valueNoise(s, 4, rnd), n2 = valueNoise(s, 16, rnd), n3 = valueNoise(s, 64, rnd), n4 = valueNoise(s, 170, rnd);
    const id = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const v = 128 + (n1[i] - 0.5) * 22 + (n2[i] - 0.5) * 26 + (n3[i] - 0.5) * 30 + (n4[i] - 0.5) * 34 + (rnd() - 0.5) * 26;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    // matted fibers: short curly strokes, light and dark, drawn with wraparound so the tile stays seamless
    for (let k = 0; k < 5200; k++) {
      const x = rnd() * s, y = rnd() * s, a = rnd() * Math.PI * 2, l = 2 + rnd() * 8, bend = (rnd() - 0.5) * 2;
      ctx.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.10 + rnd() * 0.16})` : `rgba(0,0,0,${0.08 + rnd() * 0.14})`;
      ctx.lineWidth = 0.5 + rnd() * 0.7;
      for (const [ox, oy] of [[0, 0], [-s, 0], [0, -s], [-s, -s]]) {
        const X = x + (x + l > s ? ox : 0), Y = y + (y + l > s ? oy : 0);
        if ((ox && !(x + l > s)) || (oy && !(y + l > s))) continue;
        ctx.beginPath(); ctx.moveTo(X, Y);
        ctx.quadraticCurveTo(X + Math.cos(a + bend) * l / 2, Y + Math.sin(a + bend) * l / 2, X + Math.cos(a) * l, Y + Math.sin(a) * l);
        ctx.stroke();
      }
    }
    const c2 = canvas(s, s), x2 = c2.getContext('2d'); x2.filter = 'blur(0.45px)'; x2.drawImage(c, 0, 0);
    feltTile = c2; return c2;
  }
  const pattern = (ctx, k) => { const p = ctx.createPattern(felt(), 'repeat'); p.setTransform(new DOMMatrix().scale(Math.max(0.6, k * 1.15))); return p; };

  // Lay the felt texture over whatever is painted on c (alpha kept).
  function texturize(c, strength, k) {
    const tmp = canvas(c.width, c.height), tx = tmp.getContext('2d');
    tx.fillStyle = pattern(tx, k); tx.fillRect(0, 0, c.width, c.height);
    tx.globalCompositeOperation = 'destination-in'; tx.drawImage(c, 0, 0);
    const ctx = c.getContext('2d');
    ctx.save(); ctx.globalAlpha = strength; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(tmp, 0, 0);
    // overlay barely shows on pale felt (cream, white), so add a light multiply pass for grain
    ctx.globalAlpha = strength * 0.2; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(tmp, 0, 0); ctx.restore();
    // felt is matte: knock the colors back slightly toward a soft, dusty look
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(240,232,218,0.06)'; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
  }

  // Inner edge light/shade so each felt piece reads as a thick, slightly rounded layer.
  function rim(src, dx, dy, color, blur) {
    const c = canvas(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'destination-out'; x.drawImage(src, dx, dy);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    const b = canvas(src.width, src.height), bx = b.getContext('2d');
    bx.filter = `blur(${blur}px)`; bx.drawImage(c, 0, 0); bx.filter = 'none';
    bx.globalCompositeOperation = 'destination-in'; bx.drawImage(src, 0, 0);
    return b;
  }
  function bevel(c, d, hi, lo) {
    const sh = rim(c, -d, -d, `rgba(20,12,4,${lo})`, d * 0.9);
    const li = rim(c, d, d, `rgba(255,252,244,${hi})`, d * 0.9);
    const x = c.getContext('2d'); x.drawImage(sh, 0, 0); x.drawImage(li, 0, 0);
  }
  // Draw img with a soft cast shadow underneath.
  function withShadow(ctx, img, blur, dx, dy, alpha) {
    ctx.save(); ctx.shadowColor = `rgba(28,18,8,${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = dx; ctx.shadowOffsetY = dy;
    ctx.drawImage(img, 0, 0); ctx.restore();
  }
  // Silhouette of img (for wall shadows), blurred
  function silhouette(img, blur, color) {
    const c = canvas(img.width, img.height), x = c.getContext('2d');
    x.filter = `blur(${blur}px)`; x.drawImage(img, 0, 0); x.filter = 'none';
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ---------- Aged vintage: a pennant that spent 40 years on a bedroom wall ----------
  // Sun-faded, slightly yellowed felt, a few stains and creases, dust, frayed edges and tack holes.
  // Random but stable per design (seeded from the name), so re-exports look the same.
  function ageFelt(src, d, k, t) {
    const w = src.width, h = src.height;
    let seed = [...(d.name || 'pennant')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const c = canvas(w, h), x = c.getContext('2d');
    x.filter = 'saturate(0.66) sepia(0.3) contrast(0.9) brightness(1.04)'; x.drawImage(src, 0, 0); x.filter = 'none';
    x.save(); x.globalCompositeOperation = 'source-atop';
    // uneven sun fade (stronger toward the upper tip)
    const g = x.createLinearGradient(0, h, w * 0.8, 0); g.addColorStop(0, 'rgba(255,246,225,0)'); g.addColorStop(1, 'rgba(255,246,225,0.18)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // stains + tide lines
    x.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 5; i++) {
      const cx = w * (0.15 + rnd() * 0.75), cy = h * (0.15 + rnd() * 0.7), r = (30 + rnd() * 90) * k;
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, 'rgba(150,115,60,0.10)'); rg.addColorStop(0.75, 'rgba(150,115,60,0.07)'); rg.addColorStop(0.9, 'rgba(120,85,40,0.13)'); rg.addColorStop(1, 'rgba(150,115,60,0)');
      x.fillStyle = rg; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    // creases: a dark fold line with a light ridge next to it
    x.globalCompositeOperation = 'source-atop'; x.filter = `blur(${1.2 * k}px)`;
    for (let i = 0; i < 3; i++) {
      const x0 = w * (0.25 + rnd() * 0.55), sl = (rnd() - 0.5) * 0.5 * h;
      x.lineWidth = 3 * k; x.strokeStyle = 'rgba(40,25,10,0.16)';
      x.beginPath(); x.moveTo(x0, 0); x.lineTo(x0 + sl, h); x.stroke();
      x.lineWidth = 2.5 * k; x.strokeStyle = 'rgba(255,250,240,0.18)';
      x.beginPath(); x.moveTo(x0 - 3 * k, 0); x.lineTo(x0 + sl - 3 * k, h); x.stroke();
    }
    x.filter = 'none';
    // dust specks
    for (let i = 0; i < 380; i++) { x.fillStyle = `rgba(70,55,35,${0.12 + rnd() * 0.25})`; x.fillRect(rnd() * w, rnd() * h, (0.6 + rnd() * 1.4) * k, (0.6 + rnd() * 1.4) * k); }
    x.restore();
    // clip everything back to the pennant (stains must not land on the wall)
    x.save(); x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0); x.restore();
    // frayed edges: nibble the top and bottom edges, and let a few fibers stick out
    const tipX = (d.field.tipX || t.tipX) * k, tipY = (t.top + t.bottom) / 2 * k, bx = t.bodyX * k;
    let edges = [[bx, t.top * k, tipX, tipY, 1], [bx, t.bottom * k, tipX, tipY, -1]];
    if (t.banner) {
      const poly = PM.geom(d).body.map(([px, py]) => [px * k, py * k]);
      const cxk = poly.reduce((a, p) => a + p[0], 0) / poly.length, cyk = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      edges = poly.map((p, i) => [p, poly[(i + 1) % poly.length]]).filter(([a, b]) => !(Math.abs(a[1] - t.T * k) < 1 && Math.abs(b[1] - t.T * k) < 1))
        .map(([a, b]) => { const nx = -(b[1] - a[1]), ny = b[0] - a[0]; return [a[0], a[1], b[0], b[1], nx * (cxk - a[0]) + ny * (cyk - a[1]) > 0 ? 1 : -1]; });
    }
    for (const [ax, ay, ex, ey, inward] of edges) {
      const len = Math.hypot(ex - ax, ey - ay), nx = -(ey - ay) / len * inward, ny = (ex - ax) / len * inward;
      for (let i = 0; i < len / (6 * k); i++) {
        const u = rnd(), px = ax + (ex - ax) * u, py = ay + (ey - ay) * u, dep = rnd() * 2.2 * k;
        x.globalCompositeOperation = 'destination-out';
        x.beginPath(); x.arc(px + nx * dep, py + ny * dep * -1 * -1, (0.6 + rnd() * 1.4) * k, 0, Math.PI * 2); x.fill();
        if (rnd() < 0.35) {
          x.globalCompositeOperation = 'source-over'; x.strokeStyle = PM.colors.mix(d.field.color, '#b8a888', 0.35); x.globalAlpha = 0.6; x.lineWidth = 0.7 * k;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px - nx * (2 + rnd() * 4) * k + (rnd() - 0.5) * 3 * k, py - ny * (2 + rnd() * 4) * k); x.stroke(); x.globalAlpha = 1;
        }
      }
    }
    // tack holes near the top and bottom of the spine
    x.globalCompositeOperation = 'source-over';
    const holes = t.banner ? [[t.L + 34, t.T + d.spine.outerW / 2], [t.R - 34, t.T + d.spine.outerW / 2]] : [[t.spineX + d.spine.outerW / 2, t.top + 28], [t.spineX + d.spine.outerW / 2, t.bottom - 28]];
    for (const [hxu, y] of holes) {
      const hx = hxu * k, hy = y * k, r = 3.2 * k;
      const hg = x.createRadialGradient(hx, hy, 0, hx, hy, r * 1.8);
      hg.addColorStop(0, 'rgba(25,18,10,0.85)'); hg.addColorStop(0.55, 'rgba(25,18,10,0.55)'); hg.addColorStop(1, 'rgba(25,18,10,0)');
      x.fillStyle = hg; x.beginPath(); x.arc(hx, hy, r * 1.8, 0, Math.PI * 2); x.fill();
    }
    return c;
  }

  // ---------- Felt mockup (a photo-style felt pennant) ----------
  // bg: 'wall' (beige wall) | 'transparent' | any CSS color
  R.felt = async (d, { width = 2400, bg = 'wall', wave = 1, aged = false } = {}) => {
    if (aged) wave *= 1.5;
    const t = T(d);
    const pad = Math.round(width * 0.06);
    const inner = width - pad * 2, k = inner / t.W, ih = Math.round(t.H * k);
    await PM.ensureFonts(d);
    const fontCss = await PM.embedFonts(d);
    const tieStyle = d.ties.feltStyle || 'loops';
    const layer = (parts) => R.svgToCanvas(PM.renderSVG(d, { parts, fontCss, width: inner, height: ih, tieStyle }), inner, ih);
    const [ties, field, stripes, spine, stitch, app] = await Promise.all(
      [['ties'], ['field'], ['stripes'], ['spine'], ['stitch'], ['applique']].map(layer));

    // Each felt piece: texture, then a beveled edge
    [ties, field, stripes, spine].forEach((c) => texturize(c, 0.95, k));
    texturize(app, 0.75, k);
    bevel(ties, 3.2 * k, 0.30, 0.38);
    bevel(field, 2.5 * k, 0.18, 0.22);
    bevel(stripes, 2 * k, 0.20, 0.26);
    bevel(app, 2.6 * k, 0.34, 0.40);
    // Spine binding is folded over the edge: round it with a cross-wise light gradient
    {
      const sp = spine.getContext('2d'), x0 = t.spineX * k, x1 = (t.spineX + d.spine.outerW + d.spine.innerW) * k;
      const g = t.banner ? sp.createLinearGradient(0, t.T * k, 0, (t.T + d.spine.outerW + d.spine.innerW) * k) : sp.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.26)'); g.addColorStop(0.18, 'rgba(255,255,255,0.10)'); g.addColorStop(0.45, 'rgba(255,255,255,0.04)');
      g.addColorStop(0.62, 'rgba(0,0,0,0.10)'); g.addColorStop(0.7, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
      sp.save(); sp.globalCompositeOperation = 'source-atop'; sp.fillStyle = g; sp.fillRect(0, 0, inner, ih); sp.restore();
      bevel(spine, 2 * k, 0.16, 0.25);
    }

    // Stack the pieces like sewn felt, each with a small shadow on the one below
    const pen = canvas(inner, ih), p = pen.getContext('2d');
    withShadow(p, ties, 4 * k, 1.5 * k, 2.5 * k, 0.35);
    p.drawImage(field, 0, 0);
    withShadow(p, stripes, 2.5 * k, 0.8 * k, 1.6 * k, 0.28);
    withShadow(p, spine, 6 * k, 2.5 * k, 1 * k, 0.32);
    // stitches sit in little dimples: dark tuck under each, then the thread
    if (d.spine.stitchOn) {
      const dim = silhouette(stitch, 0.8 * k, 'rgba(0,0,0,0.45)');
      p.drawImage(dim, 0.6 * k, 1.1 * k);
      p.drawImage(stitch, 0, 0);
    }
    withShadow(p, app, 5 * k, 2.2 * k, 3.2 * k, 0.42);
    if (aged) { const a = ageFelt(pen, d, k, t); p.clearRect(0, 0, inner, ih); p.drawImage(a, 0, 0); }

    // Soft fuzzy felt edge: a faint halo of fibers outside the cut edge
    const soft = canvas(inner, ih), sx = soft.getContext('2d');
    sx.globalAlpha = 0.55; sx.filter = `blur(${Math.max(0.8, 1.6 * k)}px)`; sx.drawImage(pen, 0, 0);
    sx.globalAlpha = 1; sx.filter = `blur(${Math.max(0.3, 0.45 * k)}px)`; sx.drawImage(pen, 0, 0); sx.filter = 'none';

    // Cloth drape: gentle ripples that grow toward the tip, plus a little gravity sag
    const H = Math.round(ih + pad * 2);
    const warped = canvas(width, H), w = warped.getContext('2d');
    const amp = ih * 0.011 * wave, f1 = (Math.PI * 2) / (inner * 0.62), f2 = (Math.PI * 2) / (inner * 0.23);
    const dyAt = (x) => { const u = x / inner; return (Math.sin(x * f1 + 0.7) * 1 + Math.sin(x * f2 + 2.1) * 0.35) * amp * (0.25 + u) + u * u * ih * 0.012 * wave; };
    const strip = 2;
    const bAmp = inner * 0.007 * wave, g1 = (Math.PI * 2) / (ih * 0.55), g2f = (Math.PI * 2) / (ih * 0.19);
    const dxAt = (y) => { const v = y / ih; return (Math.sin(y * g1 + 0.4) + Math.sin(y * g2f + 1.3) * 0.35) * bAmp * (0.1 + v); };
    if (t.banner) for (let y = 0; y < ih; y += strip) w.drawImage(soft, 0, y, inner, strip, pad + dxAt(y), pad + y, inner, strip);
    else for (let x = 0; x < inner; x += strip) w.drawImage(soft, x, 0, strip, ih, pad + x, pad + dyAt(x), strip, ih);
    // light the folds: slope → highlight / shade bands
    const shade = canvas(width, H), sh = shade.getContext('2d');
    const grad = t.banner ? sh.createLinearGradient(0, pad, 0, pad + ih) : sh.createLinearGradient(pad, 0, pad + inner, 0);
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * (t.banner ? ih : inner), slope = t.banner ? (dxAt(x + 2) - dxAt(x - 2)) / 4 : (dyAt(x + 2) - dyAt(x - 2)) / 4;
      const a = Math.min(t.banner ? 0.14 : 0.24, Math.abs(slope) * 3.2);
      grad.addColorStop(i / N, slope < 0 ? `rgba(255,250,240,${a * 0.75})` : `rgba(20,12,4,${a})`);
    }
    sh.fillStyle = grad; sh.fillRect(0, 0, width, H);
    // key light from the upper left
    const g2 = sh.createLinearGradient(pad, pad, pad + inner * 0.7, pad + ih);
    g2.addColorStop(0, 'rgba(255,250,240,0.10)'); g2.addColorStop(1, 'rgba(0,0,0,0.12)');
    sh.fillStyle = g2; sh.fillRect(0, 0, width, H);
    sh.globalCompositeOperation = 'destination-in'; sh.drawImage(warped, 0, 0);
    w.drawImage(shade, 0, 0);

    // Background + shadows on the wall
    const out = canvas(width, H), o = out.getContext('2d');
    if (bg === 'wall') {
      const g = o.createLinearGradient(0, 0, width, H); g.addColorStop(0, '#ebe3d7'); g.addColorStop(1, '#d8cdbd');
      o.fillStyle = g; o.fillRect(0, 0, width, H);
      // plaster mottling + grain
      o.save(); o.globalAlpha = 0.35; o.globalCompositeOperation = 'soft-light';
      const wp = o.createPattern(felt(), 'repeat'); wp.setTransform(new DOMMatrix().scale(width / 600)); o.fillStyle = wp; o.fillRect(0, 0, width, H);
      o.globalAlpha = 0.12; o.fillStyle = pattern(o, 0.7); o.fillRect(0, 0, width, H); o.restore();
      const v = o.createRadialGradient(width * 0.32, H * 0.25, H * 0.1, width * 0.5, H * 0.5, width * 0.8);
      v.addColorStop(0, 'rgba(255,252,245,0.16)'); v.addColorStop(1, 'rgba(40,28,14,0.20)');
      o.fillStyle = v; o.fillRect(0, 0, width, H);
    } else if (bg && bg !== 'transparent') { o.fillStyle = bg; o.fillRect(0, 0, width, H); }
    const s1 = bg === 'transparent' ? 0.22 : 0.30, s2 = bg === 'transparent' ? 0.16 : 0.26;
    o.drawImage(silhouette(warped, width * 0.014, `rgba(40,28,14,${s1})`), width * 0.006, width * 0.011); // ambient
    o.drawImage(silhouette(warped, width * 0.0025, `rgba(30,20,10,${s2})`), width * 0.0012, width * 0.002); // contact
    o.drawImage(warped, 0, 0);
    return out;
  };

  // ---------- 8-bit: real pixel art ----------
  // Instead of shrinking the finished pennant, each part is drawn on a small pixel grid:
  // hard-edged shapes, the logo reduced to a few colors with an outline, lettering in a
  // pixel font, a 1 px sprite outline and two-tone edge shading. Presets set the palette.
  const PX_FONT = 'Silkscreen';
  R.PIXEL_PRESETS = {
    nes: { label: 'NES style', logoColors: 4, shade: true, dither: false },
    gameboy: { label: 'Game Boy', logoColors: 4, shade: true, dither: false },
    snes: { label: '16-bit (SNES / Genesis)', logoColors: 10, shade: true, dither: true },
    pattern: { label: 'Pattern', logoColors: 6, shade: false, dither: false },
  };
  const GB = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'].map((c) => PM.colors.rgb(c));
  const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function mapColor(preset, r, g, b) {
    if (preset === 'gameboy') { const l = lumOf(r, g, b); return GB[l < 60 ? 0 : l < 120 ? 1 : l < 185 ? 2 : 3]; }
    if (preset === 'nes') { const q = (v) => [0, 88, 168, 248][Math.min(3, Math.round(v / 85))]; return [q(r), q(g), q(b)]; }
    if (preset === 'snes') { const q = (v) => Math.min(248, Math.round(v / 8) * 8); return [q(r), q(g), q(b)]; }
    return [r, g, b];
  }
  // Reduce an RGBA buffer region to its k most common colors (alpha thresholded).
  function reduceColors(px, k) {
    const counts = new Map();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => [((key >> 10) & 31) << 3, ((key >> 5) & 31) << 3, (key & 31) << 3]);
    const pal = [];
    for (const c of top) { if (pal.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) > 60)) pal.push(c); if (pal.length >= k) break; }
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) { px[i + 3] = 0; continue; }
      let best = pal[0], bd = 1e9;
      for (const p of pal) { const dd = (p[0] - px[i]) ** 2 + (p[1] - px[i + 1]) ** 2 + (p[2] - px[i + 2]) ** 2; if (dd < bd) { bd = dd; best = p; } }
      px[i] = best[0]; px[i + 1] = best[1]; px[i + 2] = best[2]; px[i + 3] = 255;
    }
  }
  // Paint a 1 px (or r px) ring of `color` around the opaque pixels of `src` into `dst` (both RGBA, same size).
  function ring(src, dst, w, h, r, color) {
    const [cr, cg, cb] = PM.colors.rgb(color);
    const a = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? src[(y * w + x) * 4 + 3] : 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a(x, y)) continue;
      let hit = false;
      for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r && !hit; dx++) if ((dx || dy) && Math.abs(dx) + Math.abs(dy) <= r + (r > 1 ? 1 : 0) && a(x + dx, y + dy)) hit = true;
      if (hit) { const i = (y * w + x) * 4; dst[i] = cr; dst[i + 1] = cg; dst[i + 2] = cb; dst[i + 3] = 255; }
    }
  }
  const over = (dst, src) => { for (let i = 0; i < src.length; i += 4) if (src[i + 3]) { dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 255; } };
  // Tiny 3x5 arcade font for lettering too small for a regular pixel font (also used in bead charts).
  const TINY = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
    '.': '000000000000010', '-': '000000111000000', '&': '010101010101011', "'": '010010000000000', '!': '010010010000010',
  };
  const tinyWidth = (t) => [...t].reduce((s, ch) => s + (ch === ' ' ? 3 : 5), 0) - 2;
  function drawTiny(buf, W, H, text, cx, baseline, sc, color) {
    const [r, g, b] = PM.colors.rgb(color);
    let x0 = Math.round(cx - tinyWidth(text) * sc / 2);
    const y0 = baseline - 5 * sc;
    for (const ch of text) {
      if (ch === ' ') { x0 += 3 * sc; continue; }
      const gl = TINY[ch] || TINY['-'];
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (gl[gy * 3 + gx] === '1')
        for (let sy = 0; sy < sc; sy++) for (let sx = 0; sx < sc; sx++) {
          const X = x0 + gx * sc + sx, Y = y0 + gy * sc + sy;
          if (X >= 0 && Y >= 0 && X < W && Y < H) { const i = (Y * W + X) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; }
        }
      x0 += 5 * sc;
    }
  }
  const darkest = (d) => PM.designColors(d).sort((a, b) => PM.colors.lum(a) - PM.colors.lum(b))[0] || '#141414';

  // → { w, h, px: Uint8ClampedArray RGBA } at native pixel size
  R.pixelGrid = async (d, { w = 128, preset = 'nes', maxColors = 0 } = {}) => {
    PM.fillMissing(d);
    const t = T(d), W = Math.round(w), H = Math.round(w * t.H / t.W), k = W / t.W;
    const P = R.PIXEL_PRESETS[preset] || R.PIXEL_PRESETS.nes;
    const blank = () => new Uint8ClampedArray(W * H * 4);
    // 1) base felt pieces, hard edges
    const baseC = await R.svgToCanvas(PM.renderSVG(d, { parts: ['ties', 'field', 'stripes', 'spine'], width: W, height: H, crisp: true }), W, H);
    const px = baseC.getContext('2d').getImageData(0, 0, W, H).data;
    for (let i = 0; i < px.length; i += 4) px[i + 3] = px[i + 3] < 128 ? 0 : 255;
    {
      // the browser smooths edges even with crispEdges: snap every felt pixel to an actual pennant color
      const base = [...new Set([d.field.color, d.spine.outer, d.spine.inner, d.ties.top.color, d.ties.bottom.color,
        d.stripes.colorA, d.stripes.colorB, d.hoops.wedge, d.hoops.stripe, d.hockey.color, d.hockey.ringColor, d.edge.colorA, d.edge.colorB, d.split.top, d.split.bottom, d.split.divider, d.bands.colorA, d.bands.colorB, d.grid.field, d.grid.endzone, d.grid.lines, d.bnr.colorA, d.bnr.colorB, d.spine.stitch].map(PM.colors.norm).filter(Boolean))].map(PM.colors.rgb);
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        let best = base[0], bd = 1e9;
        for (const c of base) { const dd = (c[0] - px[i]) ** 2 + (c[1] - px[i + 1]) ** 2 + (c[2] - px[i + 2]) ** 2; if (dd < bd) { bd = dd; best = c; } }
        px[i] = best[0]; px[i + 1] = best[1]; px[i + 2] = best[2];
      }
    }
    const body = new Uint8ClampedArray(px); // silhouette for outline + shading
    // 2) two-tone edge shading on the felt (light top edges, dark bottom edges), optional dithered fold shadow
    if (P.shade) {
      const a = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? body[(y * W + x) * 4 + 3] : 0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4; if (!px[i + 3]) continue;
        let f = 0;
        if (!a(x, y - 1)) f = 0.22; else if (!a(x, y + 1)) f = -0.25;
        if (P.dither && !f && y > H * 0.55 && BAYER[(y % 4) * 4 + (x % 4)] < (y / H - 0.55) * 24) f = -0.12;
        if (f > 0) for (let c = 0; c < 3; c++) px[i + c] += (255 - px[i + c]) * f;
        else if (f < 0) for (let c = 0; c < 3; c++) px[i + c] *= 1 + f;
      }
    }
    // 3) images (logo, stamps, maker): drawn small, reduced to a few colors, knockout + outline
    const ink = darkest(d);
    const drawImg = async (src, cx, cy, size, ko, colorsMax) => {
      if (!src) return;
      const img = await R.loadImg(src);
      const s = Math.max(2, Math.round(size * k)), ar = img.naturalWidth / img.naturalHeight;
      const iw = ar >= 1 ? s : Math.round(s * ar), ih = ar >= 1 ? Math.round(s / ar) : s;
      const c = canvas(W, H), x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, Math.round(cx * k - iw / 2), Math.round(cy * k - ih / 2), iw, ih);
      const lay = x.getImageData(0, 0, W, H).data;
      reduceColors(lay, colorsMax);
      const outl = blank();
      if (ko && ko.on && ko.w > 0) { const r = Math.max(1, Math.round(ko.w * k)); ring(lay, outl, W, H, r, ko.color); over(outl, lay); const o2 = blank(); ring(outl, o2, W, H, 1, ink); over(px, o2); over(px, outl); }
      else { ring(lay, outl, W, H, 1, ink); over(px, outl); over(px, lay); }
    };
    // 4) lettering in a pixel font, hard edges, outlined for legibility
    await document.fonts.load(`700 16px "${PX_FONT}"`).catch(() => {});
    // banners: each row of championship years is drawn like another line of lettering
    const yearLines = PM.isBanner(d) && d.years.show ? (() => { const sz = PM.yearsSize(d), gap = d.years.lineGap || 1.18;
      return PM.yearRows(d.years).map((r, i) => Object.assign({}, d.years, { text: r, size: sz, show: true, useImg: false, y: d.years.y + i * gap * sz })); })() : [];
    // logos and lettering go down in the design's stacking order (bottom first)
    for (const key of PM.stackOf(d)) {
      if (key === 'mark') { if (d.mark.show) await drawImg(d.mark.src, d.mark.x, d.mark.y, d.mark.size, d.mark.knockout, P.logoColors); continue; }
      if (key === 'stamps') { if (W >= 150) { let sx = d.stamps.x; for (const it of d.stamps.items) { if (!it.show) continue; if (it.src) await drawImg(it.src, sx + it.size / 2, d.stamps.y, it.size, d.stamps.ko, 3); sx += it.size + d.stamps.gap; } } continue; }
      if (key === 'maker') { if (d.maker.show && W >= 150) await drawImg(d.maker.src, d.maker.x, d.maker.y, d.maker.size, d.maker.ko, 3); continue; }
      for (const l of key === 'years' ? yearLines : [d[key]]) await drawLine(l);
    }
    async function drawLine(l) {
      if (PM.lineUsesImg(l)) {
        // wordmark image: drawn like a logo (few colors + outline) inside its box
        const b = PM.lineImgBox(l);
        const img = await R.loadImg(l.img);
        const c = canvas(W, H), x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.drawImage(img, Math.round((b.cx - b.w / 2) * k), Math.round((b.cy - b.h / 2) * k), Math.max(1, Math.round(b.w * k)), Math.max(1, Math.round(b.h * k)));
        const lay = x.getImageData(0, 0, W, H).data; reduceColors(lay, P.logoColors);
        const r1 = blank(); ring(lay, r1, W, H, 1, l.ko && l.ko.on ? l.ko.color : d.field.color); over(r1, lay); over(px, r1);
        return;
      }
      if (!l.show || !l.text) return;
      const c = canvas(W, H), x = c.getContext('2d');
      const capWant = PM.fitSize(l) * k * 0.72, maxW = (l.maxWidth || 800) * k * 1.08;
      const cx = l.x * k, by = Math.round(l.y * k);
      let lay;
      // pixel font (Silkscreen) at the biggest 8 px step that fits; otherwise the tiny 3x5 font
      let fs = 0;
      const T8 = l.text.toUpperCase(); // pixel lettering reads best in caps, like old game text
      // letter spacing leaves room for the 1 px outline between letters
      const spc = (s) => `${Math.max(2, Math.round(s / 8) * 2)}px`;
      for (let s = 8; s <= 96; s += 8) { x.font = `700 ${s}px "${PX_FONT}"`; x.letterSpacing = spc(s); if (s * 0.62 <= capWant * 1.25 && x.measureText(T8).width <= maxW) fs = s; }
      if (fs && capWant >= 6) {
        x.font = `700 ${fs}px "${PX_FONT}"`; x.letterSpacing = spc(fs); x.textBaseline = 'alphabetic'; x.fillStyle = l.fill;
        const tw = x.measureText(T8).width;
        x.fillText(T8, Math.round(cx - tw / 2), by);
        lay = x.getImageData(0, 0, W, H).data;
        const [fr, fg, fb] = PM.colors.rgb(l.fill);
        for (let i = 0; i < lay.length; i += 4) { if (lay[i + 3] >= 110) { lay[i] = fr; lay[i + 1] = fg; lay[i + 2] = fb; lay[i + 3] = 255; } else lay[i + 3] = 0; }
      } else {
        lay = blank();
        const txt = l.text.toUpperCase();
        let sc = 1;
        for (let q = 4; q >= 1; q--) if (5 * q <= Math.max(5, capWant * 1.3) && tinyWidth(txt) * q <= Math.max(maxW, tinyWidth(txt))) { sc = q; break; }
        drawTiny(lay, W, H, txt, cx, by, sc, l.fill);
      }
      // rings: inner felt-colored ring (inner outline or knockout), then the outer outline color if any
      const inner = l.o1.w > 0 ? l.o1.color : (l.ko && l.ko.on ? l.ko.color : d.field.color);
      const r1 = blank(); ring(lay, r1, W, H, 1, inner); over(r1, lay);
      if (l.o2.w > 0 && ![inner, l.fill].map((c) => c.toLowerCase()).includes(l.o2.color.toLowerCase())) { const r2 = blank(); ring(r1, r2, W, H, 1, l.o2.color); over(px, r2); }
      over(px, r1);
    }
    // 5) palette for the preset (or a fixed color budget for bead / stitch charts)
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const [r, g, b] = mapColor(preset, px[i], px[i + 1], px[i + 2]);
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
    if (maxColors) reduceColors(px, maxColors);
    // 6) 1 px sprite outline around the whole pennant
    const outl = blank(); ring(px, outl, W, H, 1, preset === 'gameboy' ? '#0f380f' : '#141414');
    if (preset === 'gameboy' || !maxColors || maxColors > 2) over(px, outl);
    return { w: W, h: H, px };
  };

  R.pixel = async (d, { width = 2000, pixels = 128, preset = 'nes', bg = null } = {}) => {
    const g = await R.pixelGrid(d, { w: pixels, preset });
    const lo = canvas(g.w, g.h); lo.getContext('2d').putImageData(new ImageData(g.px, g.w, g.h), 0, 0);
    const f = Math.max(1, Math.round(width / g.w));
    const out = canvas(g.w * f, g.h * f), o = out.getContext('2d');
    if (bg) { o.fillStyle = bg; o.fillRect(0, 0, out.width, out.height); }
    o.imageSmoothingEnabled = false; o.drawImage(lo, 0, 0, out.width, out.height);
    return out;
  };

  // ---------- Bead / cross-stitch chart ----------
  // A printable grid: every cell = one bead or stitch, with a symbol per color and a legend with counts.
  const SYMBOLS = '●▲■◆★✚✖◯△□◇☆♥♣♠♦ABCDEFGHJKLMNPRSTUVWXYZ23456789'.split('');
  R.chart = async (d, { cells = 58, kind = 'beads', maxColors = 12 } = {}) => {
    const g = await R.pixelGrid(d, { w: cells, preset: 'pattern', maxColors });
    const counts = new Map();
    for (let i = 0; i < g.px.length; i += 4) if (g.px[i + 3]) { const c = PM.colors.hex(g.px[i], g.px[i + 1], g.px[i + 2]); counts.set(c, (counts.get(c) || 0) + 1); }
    const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const sym = Object.fromEntries(colors.map(([c], i) => [c, SYMBOLS[i % SYMBOLS.length]]));
    const cs = 26, pad = 60, head = 90;
    const legendRows = Math.ceil(colors.length / 3), legH = 50 + legendRows * 40 + 40;
    const cw = pad * 2 + g.w * cs, ch = head + g.h * cs + pad + legH;
    const out = canvas(cw, ch), o = out.getContext('2d');
    o.fillStyle = '#ffffff'; o.fillRect(0, 0, cw, ch);
    o.fillStyle = '#1b1b1b'; o.font = '700 30px system-ui, sans-serif';
    const title = [d.line1, d.line2].filter((l) => l.show && l.text).map((l) => l.text).join(' ') || d.name || 'Pennant';
    o.fillText(`${title} — ${kind === 'beads' ? 'fuse bead pattern' : 'cross-stitch chart'}`, pad, 44);
    o.font = '18px system-ui, sans-serif'; o.fillStyle = '#555';
    const total = colors.reduce((s, [, n]) => s + n, 0);
    const boards = Math.ceil(g.w / 29) * Math.ceil(g.h / 29);
    o.fillText(`${g.w} × ${g.h} ${kind === 'beads' ? 'beads' : 'stitches'} · ${colors.length} colors · ${total} ${kind === 'beads' ? 'beads' : 'stitches'}` +
      (kind === 'beads' ? ` · ${boards} large square pegboards (29×29)` : ` · on 14-count fabric ≈ ${(g.w / 14).toFixed(1)} × ${(g.h / 14).toFixed(1)} in`), pad, 74);
    // cells
    o.textAlign = 'center'; o.textBaseline = 'middle'; o.font = `700 ${Math.round(cs * 0.6)}px system-ui, sans-serif`;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const i = (y * g.w + x) * 4; if (!g.px[i + 3]) continue;
      const c = PM.colors.hex(g.px[i], g.px[i + 1], g.px[i + 2]);
      const X = pad + x * cs, Y = head + y * cs;
      o.fillStyle = c; o.fillRect(X, Y, cs, cs);
      o.fillStyle = PM.colors.lum(c) > 0.4 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
      o.fillText(sym[c], X + cs / 2, Y + cs / 2 + 1);
    }
    // grid: every cell thin; every 10 bold (stitch) or every 29 bold = pegboard edge (beads)
    const major = kind === 'beads' ? 29 : 10;
    for (let x = 0; x <= g.w; x++) { o.strokeStyle = x % major === 0 ? '#222' : x % 10 === 0 ? '#888' : '#d0d0d0'; o.lineWidth = x % major === 0 ? 2.5 : 1; o.beginPath(); o.moveTo(pad + x * cs, head); o.lineTo(pad + x * cs, head + g.h * cs); o.stroke(); }
    for (let y = 0; y <= g.h; y++) { o.strokeStyle = y % major === 0 ? '#222' : y % 10 === 0 ? '#888' : '#d0d0d0'; o.lineWidth = y % major === 0 ? 2.5 : 1; o.beginPath(); o.moveTo(pad, head + y * cs); o.lineTo(pad + g.w * cs, head + y * cs); o.stroke(); }
    // legend
    let ly = head + g.h * cs + pad;
    o.textAlign = 'left'; o.textBaseline = 'middle'; o.fillStyle = '#1b1b1b'; o.font = '700 22px system-ui, sans-serif';
    o.fillText('Colors (match to your bead / floss brand by eye)', pad, ly); ly += 40;
    const colW = (cw - pad * 2) / 3;
    colors.forEach(([c, n], i) => {
      const X = pad + (i % 3) * colW, Y = ly + Math.floor(i / 3) * 40;
      o.fillStyle = c; o.fillRect(X, Y - 14, 28, 28); o.strokeStyle = '#999'; o.lineWidth = 1; o.strokeRect(X, Y - 14, 28, 28);
      o.fillStyle = PM.colors.lum(c) > 0.4 ? '#000' : '#fff'; o.textAlign = 'center'; o.font = '700 16px system-ui, sans-serif'; o.fillText(sym[c], X + 14, Y + 1);
      o.textAlign = 'left'; o.fillStyle = '#1b1b1b'; o.font = '18px system-ui, sans-serif'; o.fillText(`${c.toUpperCase()}  ×${n}`, X + 38, Y);
    });
    return out;
  };

  // One entry point used by preview, export and bulk.
  R.render = (d, style, o = {}) => {
    if (style === 'felt') return R.felt(d, o);
    if (style === 'aged') return R.felt(d, Object.assign({}, o, { aged: true }));
    if (style === 'pixel') return R.pixel(d, o);
    if (style === 'chart') return R.chart(d, o);
    return R.flat(d, o);
  };

  R.canvasBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
  R.download = (blob, name) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  // Save with a "Save as" dialog pre-filled with the name (Chrome, Edge and the desktop app);
  // other browsers fall back to a normal download with that name.
  R.saveAs = async (blob, name) => {
    if (window.showSaveFilePicker) {
      const ext = (name.match(/\.[^.]+$/) || [''])[0];
      const mime = blob.type || 'application/octet-stream';
      try {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: ext ? [{ description: ext.slice(1).toUpperCase() + ' file', accept: { [mime]: [ext] } }] : undefined });
        const w = await h.createWritable(); await w.write(blob); await w.close();
        return true;
      } catch (e) { if (e && e.name === 'AbortError') return false; console.warn('save picker failed, downloading instead', e); }
    }
    R.download(blob, name); return true;
  };

  // Contact sheet (like the 12-up grid)
  R.sheet = async (canvases, { cols = 2, bg = '#f4eee2', cell = 1000 } = {}) => {
    const gap = Math.round(cell * 0.05);
    const ch = Math.round(cell * 0.45);
    const rows = Math.ceil(canvases.length / cols);
    const out = canvas(cols * cell + (cols + 1) * gap, rows * ch + (rows + 1) * gap), o = out.getContext('2d');
    if (bg) { o.fillStyle = bg; o.fillRect(0, 0, out.width, out.height); }
    canvases.forEach((c, i) => {
      const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (ch + gap);
      const s = Math.min(cell / c.width, ch / c.height);
      o.drawImage(c, x + (cell - c.width * s) / 2, y + (ch - c.height * s) / 2, c.width * s, c.height * s);
    });
    return out;
  };

  PM.out = R;
})(window.PM);
