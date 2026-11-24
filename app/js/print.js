// Real-pennant exports: print-ready PDF, tiled home-print PDF, cutting-machine (Cricut/Silhouette) SVG layers.
// Everything is generated in the browser; no libraries.
window.PM = window.PM || {};
(function (PM) {
  const P = {};
  const R = () => PM.out;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
  const enc = new TextEncoder();

  // Pennant sizes: height at the spine (inches). Length follows the design's proportions.
  P.SIZES = [['4', 'Mini 4 in tall'], ['6', '6 in tall'], ['9', '9 in tall'], ['12', '12 in tall (classic)'], ['18', '18 in tall (large)']];
  P.BLEED = 0.125;
  P.BANNER_SIZES = [['12', '12 in tall (desk)'], ['18', '18 in tall'], ['24', '24 in tall (2 ft)'], ['36', '36 in tall (3 ft)'], ['48', '48 in tall (4 ft)'], ['72', '72 in tall (6 ft rafter)']];
  P.POSTER_SIZES = [['12', 'Small'], ['18', 'Medium'], ['24', 'Large'], ['36', 'Wall poster']];
  P.sizesFor = (d) => (PM.isPoster(d) ? P.POSTER_SIZES : PM.isBanner(d) ? P.BANNER_SIZES : P.SIZES);

  // Geometry of the printed piece in design units: spine left edge to tip, top to bottom (ties are sewn on, not printed).
  P.piece = (d) => {
    const t = PM.TEMPLATES[d.template] || PM.TEMPLATES.classic;
    if (t.banner || t.poster) { const body = PM.geom(d).body; return { t, x0: t.L, x1: t.R, y0: t.T, y1: t.B, w: t.R - t.L, h: t.B - t.T, outline: body }; }
    const tipX = d.field.tipX || t.tipX, tipY = (t.top + t.bottom) / 2;
    const x0 = d.spine.show ? t.spineX : t.bodyX - 2, x1 = tipX, y0 = t.top, y1 = t.bottom;
    const outline = d.spine.show ? [[x0, y0], [t.bodyX, y0], [tipX, tipY], [t.bodyX, y1], [x0, y1]] : [[x0, y0], [tipX, tipY], [x0, y1]];
    return { t, x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, outline };
  };
  P.sizeOf = (d, heightIn) => { const g = P.piece(d), s = heightIn / g.h; return { s, W: g.w * s, H: heightIn }; }; // s = inches per unit
  P.sizeLabel = (d, heightIn) => { const z = P.sizeOf(d, heightIn); return `${z.H} × ${z.W.toFixed(1)} in`; };

  // Art raster at true size (+ bleed). Ties left off; felt colour flows into the bleed past the cut line.
  P.raster = async (d, heightIn, dpi, bleed) => {
    const g = P.piece(d), { s } = P.sizeOf(d, heightIn);
    const bu = bleed / s;                         // bleed in design units
    const pxPerUnit = dpi * s;
    const W = Math.round((g.w + 2 * bu) * pxPerUnit), H = Math.round((g.h + 2 * bu) * pxPerUnit);
    await PM.ensureFonts(d);
    const fontCss = await PM.embedFonts(d);
    const vb = `${(g.x0 - bu).toFixed(3)} ${(g.y0 - bu).toFixed(3)} ${(g.w + 2 * bu).toFixed(3)} ${(g.h + 2 * bu).toFixed(3)}`;
    const t = g.t, body = (t.banner || t.poster ? g.outline : [[t.bodyX - 2, t.top], [g.x1, (t.top + t.bottom) / 2], [t.bodyX - 2, t.bottom]]).map((p) => p.join(',')).join(' ');
    const under = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W}" height="${H}">` +
      `<polygon points="${body}" fill="${d.field.color}" stroke="${d.field.color}" stroke-width="${2 * bu}" stroke-linejoin="round"/>` +
      (d.spine.show ? (t.banner ? `<rect x="${g.x0 - bu}" y="${g.y0 - bu}" width="${g.w + 2 * bu}" height="${d.spine.outerW + bu}" fill="${d.spine.outer}"/>`
        : `<rect x="${g.x0 - bu}" y="${g.y0 - bu}" width="${d.spine.outerW + bu}" height="${g.h + 2 * bu}" fill="${d.spine.outer}"/>`) : '') + `</svg>`;
    const art = PM.renderSVG(d, { parts: ['field', 'stripes', 'spine', 'stitch', 'applique'], fontCss }).replace(/viewBox="[^"]*" width="[^"]*" height="[^"]*"/, `viewBox="${vb}" width="${W}" height="${H}"`);
    const c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.drawImage(await R().svgToCanvas(under, W, H), 0, 0);
    x.drawImage(await R().svgToCanvas(art, W, H), 0, 0);
    return { canvas: c, W, H, s, bu, g };
  };
  // Keep huge pennants within browser canvas limits (~60 million pixels).
  const pickDpi = (d, heightIn, want) => { const z = P.sizeOf(d, heightIn); const px = (z.W + 0.5) * (z.H + 0.5) * want * want; return px > 6e7 ? Math.floor(Math.sqrt(6e7 / ((z.W + 0.5) * (z.H + 0.5)))) : want; };

  // ---------- tiny PDF writer ----------
  function pdfDoc() {
    const objs = []; // [Uint8Array parts]
    const add = (parts) => { objs.push(parts); return objs.length; };
    const str = (s) => enc.encode(s);
    return {
      add, str, nextId: () => objs.length + 1,
      obj: (body) => add([str(body)]),
      stream: (dict, bytes) => add([str(`<< ${dict} /Length ${bytes.length} >>\nstream\n`), bytes, str('\nendstream')]),
      build(rootId, infoId) {
        const out = [str('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n')]; let off = out[0].length; const xref = [];
        objs.forEach((parts, i) => {
          xref.push(off);
          const head = str(`${i + 1} 0 obj\n`), tail = str('\nendobj\n');
          out.push(head, ...parts, tail); off += head.length + tail.length + parts.reduce((s, p) => s + p.length, 0);
        });
        let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + xref.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
        x += `trailer\n<< /Size ${objs.length + 1} /Root ${rootId} 0 R${infoId ? ` /Info ${infoId} 0 R` : ''} >>\nstartxref\n${off}\n%%EOF\n`;
        out.push(str(x));
        return new Blob(out, { type: 'application/pdf' });
      },
    };
  }
  const jpegBytes = async (c) => new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.93))).arrayBuffer());
  const pdfText = (s) => '(' + String(s).replace(/[\\()]/g, (m) => '\\' + m).replace(/[^\x20-\x7e]/g, '-') + ')';
  const f2 = (n) => (+n).toFixed(2);
  const title = (d) => [d.line1, d.line2].filter((l) => l.show && l.text).map((l) => l.text).join(' ') || d.name || 'Pennant';

  // ---------- 1) print-ready PDF ----------
  P.printPdf = async (d, { heightIn = 12 } = {}) => {
    const dpi = pickDpi(d, heightIn, 300), b = P.BLEED, m = 0.5;
    const r = await P.raster(d, heightIn, dpi, b);
    const z = P.sizeOf(d, heightIn);
    const pw = (z.W + 2 * b + 2 * m) * 72, ph = (z.H + 2 * b + 2 * m) * 72;
    const doc = pdfDoc();
    const img = doc.stream(`/Type /XObject /Subtype /Image /Width ${r.W} /Height ${r.H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, await jpegBytes(r.canvas));
    const cs = doc.obj('[/Separation /CutContour /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]');
    const font = doc.obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    // design units → PDF points
    const X = (x) => (m + b + (x - r.g.x0) * r.s) * 72, Y = (y) => ph - (m + b + (y - r.g.y0) * r.s) * 72;
    const cut = r.g.outline.map(([x, y], i) => `${f2(X(x))} ${f2(Y(y))} ${i ? 'l' : 'm'}`).join(' ') + ' h';
    const tx0 = (m + b) * 72, ty0 = (m + b) * 72, tx1 = tx0 + z.W * 72, ty1 = ty0 + z.H * 72;
    const mark = (x, y, dx, dy) => `${f2(x + dx * 9)} ${f2(y + dy * 9)} m ${f2(x + dx * 27)} ${f2(y + dy * 27)} l S`;
    const content = [
      `q ${f2((z.W + 2 * b) * 72)} 0 0 ${f2((z.H + 2 * b) * 72)} ${f2(m * 72)} ${f2(m * 72)} cm /Im1 Do Q`,
      `q /CS1 CS 1 SCN 0.5 w 1 j ${cut} S Q`,                                  // cut line (spot colour)
      `q 0 0 0 RG 0.3 w ${mark(tx0, ty0, -1, 0)} ${mark(tx0, ty0, 0, -1)} ${mark(tx1, ty0, 1, 0)} ${mark(tx1, ty0, 0, -1)} ${mark(tx0, ty1, -1, 0)} ${mark(tx0, ty1, 0, 1)} ${mark(tx1, ty1, 1, 0)} ${mark(tx1, ty1, 0, 1)} Q`,
      `BT /F1 7 Tf 0 0 0 rg ${f2(m * 72)} ${f2(m * 72 * 0.35)} Td ${pdfText(`${title(d)} - ${z.H} x ${z.W.toFixed(2)} in finished - ${dpi} dpi - bleed ${b} in - cut line: CutContour spot colour - ${PM.isPoster(d) ? 'trim on the cut line' : PM.isBanner(d) ? 'cord and rod not printed (fold the top sleeve over a dowel)' : 'ties not printed (sew on)'}`)} Tj ET`,
    ].join('\n');
    const cont = doc.stream('', enc.encode(content));
    const pageId = doc.nextId();          // the page, then its /Pages parent right after it
    const page = doc.obj(`<< /Type /Page /Parent ${pageId + 1} 0 R /MediaBox [0 0 ${f2(pw)} ${f2(ph)}] ` +
      `/BleedBox [${f2(m * 72)} ${f2(m * 72)} ${f2(pw - m * 72)} ${f2(ph - m * 72)}] /TrimBox [${f2(tx0)} ${f2(ty0)} ${f2(tx1)} ${f2(ty1)}] ` +
      `/Resources << /XObject << /Im1 ${img} 0 R >> /ColorSpace << /CS1 ${cs} 0 R >> /Font << /F1 ${font} 0 R >> >> /Contents ${cont} 0 R >>`);
    const pages = doc.obj(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
    if (page !== pageId || pages !== pageId + 1) throw new Error('pdf object order');
    const cat = doc.obj(`<< /Type /Catalog /Pages ${pages} 0 R >>`);
    const info = doc.obj(`<< /Title ${pdfText(title(d) + ' pennant')} /Creator (Pennant Maker) >>`);
    return doc.build(cat, info);
  };

  // ---------- 2) tiled home-print PDF ----------
  P.PAPERS = { letter: [11, 8.5, 'Letter'], a4: [11.69, 8.27, 'A4'] };
  P.tiledPdf = async (d, { heightIn = 12, paper = 'letter' } = {}) => {
    const [PW, PH] = P.PAPERS[paper] || P.PAPERS.letter;           // landscape page, inches
    const margin = 0.35, overlap = 0.3, b = P.BLEED;
    const r = await P.raster(d, heightIn, Math.min(200, pickDpi(d, heightIn, 200)), b);
    const z = P.sizeOf(d, heightIn), AW = z.W + 2 * b, AH = z.H + 2 * b;   // art incl. bleed
    const uw = PW - 2 * margin, uh = PH - 2 * margin - 0.25;              // usable area (0.25 in for labels)
    const cols = Math.max(1, Math.ceil((AW - overlap) / (uw - overlap))), rows = Math.max(1, Math.ceil((AH - overlap) / (uh - overlap)));
    const doc = pdfDoc();
    const img = doc.stream(`/Type /XObject /Subtype /Image /Width ${r.W} /Height ${r.H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, await jpegBytes(r.canvas));
    const font = doc.obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const pagesId = 3 + rows * cols * 2;            // pages object comes after all page+content pairs
    const kids = [];
    for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
      const ox = cx * (uw - overlap), oy = ry * (uh - overlap);          // tile origin in art inches (from top-left)
      const pw = PW * 72, ph = PH * 72, L = margin * 72, Bt = (margin + 0.25) * 72;
      // place the whole art so that (ox, oy) lands at the usable area's top-left; clip to the usable area
      const ix = L - ox * 72, iy = (Bt + uh * 72) - (AH - oy) * 72;
      const X = (x) => ix + (b + (x - r.g.x0) * r.s) * 72, Y = (y) => iy + (AH - b - (y - r.g.y0) * r.s) * 72;
      const cut = r.g.outline.map(([x, y], i) => `${f2(X(x))} ${f2(Y(y))} ${i ? 'l' : 'm'}`).join(' ') + ' h';
      const content = [
        `q ${f2(L)} ${f2(Bt)} ${f2(uw * 72)} ${f2(uh * 72)} re W n`,
        `q ${f2(AW * 72)} 0 0 ${f2(AH * 72)} ${f2(ix)} ${f2(iy)} cm /Im1 Do Q`,
        `0 0 0 RG 0.8 w [6 3] 0 d ${cut} S`,
        `Q`,
        // overlap guides: tape the next page over the grey band
        `q 0.6 g 0.6 G 0.5 w [2 2] 0 d ` +
          (cx < cols - 1 ? `${f2(L + (uw - overlap) * 72)} ${f2(Bt)} m ${f2(L + (uw - overlap) * 72)} ${f2(Bt + uh * 72)} l S ` : '') +
          (ry < rows - 1 ? `${f2(L)} ${f2(Bt + overlap * 72)} m ${f2(L + uw * 72)} ${f2(Bt + overlap * 72)} l S ` : '') + 'Q',
        `q 0.75 G 0.5 w ${f2(L)} ${f2(Bt)} ${f2(uw * 72)} ${f2(uh * 72)} re S Q`,
        `BT /F1 8 Tf 0 g ${f2(L)} ${f2(margin * 72 * 0.6)} Td ${pdfText(`${title(d)} - page row ${ry + 1}/${rows}, column ${cx + 1}/${cols} - finished ${z.H} x ${z.W.toFixed(1)} in - print at 100% (no scaling), overlap the grey dashed band, tape, cut on the black dashed line`)} Tj ET`,
      ].join('\n');
      const cont = doc.stream('', enc.encode(content));
      const page = doc.obj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(pw)} ${f2(ph)}] /Resources << /XObject << /Im1 ${img} 0 R >> /Font << /F1 ${font} 0 R >> >> /Contents ${cont} 0 R >>`);
      kids.push(page);
    }
    const pages = doc.obj(`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
    if (pages !== pagesId) throw new Error('pdf object order');
    const cat = doc.obj(`<< /Type /Catalog /Pages ${pages} 0 R /ViewerPreferences << /PrintScaling /None >> >>`);
    return { blob: doc.build(cat), pages: kids.length, cols, rows };
  };

  // ---------- 3) cutting-machine layers ----------
  // Trace the flat art per colour into SVG paths at true size. Base felt = whole silhouette;
  // every other colour = the pieces where that colour shows (layered on top of the base).
  function quantize(px, k) {
    const counts = new Map();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => [((key >> 10) & 31) << 3 | 4, ((key >> 5) & 31) << 3 | 4, (key & 31) << 3 | 4]);
    const pal = [];
    for (const c of top) { if (pal.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) > 54)) pal.push(c); if (pal.length >= k) break; }
    const idx = new Int16Array(px.length / 4).fill(-1);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      if (px[i + 3] < 128) continue;
      let best = 0, bd = 1e9;
      pal.forEach((p, n) => { const dd = (p[0] - px[i]) ** 2 + (p[1] - px[i + 1]) ** 2 + (p[2] - px[i + 2]) ** 2; if (dd < bd) { bd = dd; best = n; } });
      idx[j] = best;
    }
    return { pal, idx };
  }
  // Assign each pixel to the nearest of the given colours; drop colours nobody uses; keep the busiest `max`.
  function snapTo(px, colors, max) {
    let pal = [];
    for (const c of colors.map((h) => PM.colors.rgb(h))) if (pal.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) > 30)) pal.push(c);
    const near = (r, g, b, P) => { let best = 0, bd = 1e9; P.forEach((p, n) => { const dd = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (dd < bd) { bd = dd; best = n; } }); return best; };
    const count = new Array(pal.length).fill(0);
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= 128) count[near(px[i], px[i + 1], px[i + 2], pal)]++;
    pal = pal.filter((_, n) => count[n] > 0).map((p, n) => [p, count.filter((c) => c > 0)[n]]).sort((a, b) => b[1] - a[1]).slice(0, max).map((x) => x[0]);
    const idx = new Int16Array(px.length / 4).fill(-1);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) if (px[i + 3] >= 128) idx[j] = near(px[i], px[i + 1], px[i + 2], pal);
    return { pal, idx };
  }

  // Pixel-edge contour tracing → closed loops (outer + holes), then simplified.
  function trace(mask, w, h, minArea = 6, tol = 0.8) {
    const W1 = w + 1, next = new Map();
    const addE = (a, b) => { const l = next.get(a); if (l) l.push(b); else next.set(a, [b]); };
    const inn = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (!inn(x, y - 1)) addE(y * W1 + x, y * W1 + x + 1);
      if (!inn(x + 1, y)) addE(y * W1 + x + 1, (y + 1) * W1 + x + 1);
      if (!inn(x, y + 1)) addE((y + 1) * W1 + x + 1, (y + 1) * W1 + x);
      if (!inn(x - 1, y)) addE((y + 1) * W1 + x, y * W1 + x);
    }
    const loops = [];
    for (const [start] of next) {
      while (next.has(start) && next.get(start).length) {
        const pts = []; let cur = start;
        do {
          const l = next.get(cur); const nx = l.pop(); if (!l.length) next.delete(cur);
          pts.push([cur % W1, Math.floor(cur / W1)]); cur = nx;
        } while (cur !== start && next.has(cur));
        if (pts.length < 4) continue;
        let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
        if (Math.abs(area / 2) < minArea) continue;
        loops.push(simplify(pts, tol));
      }
    }
    return loops;
  }
  function simplify(pts, tol) {
    // drop collinear points, then Douglas–Peucker on the closed loop (split at the farthest pair)
    const c = pts.filter((p, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) !== 0; });
    if (c.length < 4) return c;
    const dp = (arr) => {
      if (arr.length < 3) return arr;
      const [a, b] = [arr[0], arr[arr.length - 1]]; let md = 0, mi = 0;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      for (let i = 1; i < arr.length - 1; i++) { const dd = Math.abs((b[0] - a[0]) * (a[1] - arr[i][1]) - (a[0] - arr[i][0]) * (b[1] - a[1])) / L; if (dd > md) { md = dd; mi = i; } }
      return md > tol ? [...dp(arr.slice(0, mi + 1)).slice(0, -1), ...dp(arr.slice(mi))] : [a, b];
    };
    const half = Math.floor(c.length / 2);
    return [...dp(c.slice(0, half + 1)).slice(0, -1), ...dp([...c.slice(half), c[0]]).slice(0, -1)];
  }
  // Morphological opening (erode then dilate by 1 px): removes 1-px slivers along colour edges.
  function open1(m, w, h) {
    const er = new Uint8Array(m.length), out = new Uint8Array(m.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; er[i] = m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w] ? 1 : 0; }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; out[i] = er[i] || er[i - 1] || er[i + 1] || er[i - w] || er[i + w] ? 1 : 0; }
    return out;
  }
  const loopsToPath = (loops, sc) => loops.map((l) => 'M' + l.map((p) => `${(p[0] * sc).toFixed(3)} ${(p[1] * sc).toFixed(3)}`).join('L') + 'Z').join('');

  P.cutFiles = async (d, { heightIn = 9, maxColors = 8 } = {}) => {
    const z = P.sizeOf(d, heightIn);
    const ppi = Math.max(40, Math.min(100, Math.round(1800 / z.W)));        // trace resolution (pixels per inch)
    const r = await P.raster(d, heightIn, ppi, 0);
    const { W, H } = r, ctx = r.canvas.getContext('2d');
    // silhouette from the cut outline (the raster has a white background)
    const sil = canvas(W, H), sx = sil.getContext('2d');
    sx.fillStyle = '#000'; sx.beginPath();
    r.g.outline.forEach(([x, y], i) => { const X = (x - r.g.x0) * r.s * ppi, Y = (y - r.g.y0) * r.s * ppi; i ? sx.lineTo(X, Y) : sx.moveTo(X, Y); });
    sx.closePath(); sx.fill();
    const sp = sx.getImageData(0, 0, W, H).data, px = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < px.length; i += 4) px[i + 3] = sp[i + 3] >= 128 ? 255 : 0;
    // snap to the colours actually used (design colours + the logos' main colours), not the blended edge pixels
    const want = [...PM.designColors(d)];
    for (const src of [d.mark.show && d.mark.src, ...d.stamps.items.map((it) => it.show && it.src), d.maker.show && d.maker.src, ...[d.line1, d.line2, d.extra].map((l) => PM.lineUsesImg(l) && l.img)])
      if (src) want.push(...await PM.colors.extract(src, 4));
    const { pal, idx } = snapTo(px, want, maxColors + 4);
    const hex = pal.map((c) => PM.colors.hex(c[0], c[1], c[2]));
    const fieldRGB = PM.colors.rgb(d.field.color);
    let baseIdx = 0, bd = 1e9; pal.forEach((p, n) => { const dd = (p[0] - fieldRGB[0]) ** 2 + (p[1] - fieldRGB[1]) ** 2 + (p[2] - fieldRGB[2]) ** 2; if (dd < bd) { bd = dd; baseIdx = n; } });
    const sc = 1 / ppi;                                                         // pixel → inch
    const layers = [];
    // base: whole silhouette
    const baseMask = new Uint8Array(W * H); for (let j = 0; j < baseMask.length; j++) baseMask[j] = sp[j * 4 + 3] >= 128 ? 1 : 0;
    layers.push({ name: 'base felt', color: hex[baseIdx], loops: trace(baseMask, W, H, 20, 1.0) });
    pal.forEach((_, n) => {
      if (n === baseIdx) return;
      const m = new Uint8Array(W * H); let cnt = 0;
      for (let j = 0; j < m.length; j++) if (idx[j] === n) { m[j] = 1; cnt++; }
      const minPiece = Math.max(12, Math.round(0.012 * ppi * ppi));   // ~0.012 sq in: smaller is too fiddly to cut in felt
      if (cnt < minPiece) return;
      layers.push({ name: `colour ${layers.length + 1}`, color: hex[n], loops: trace(open1(m, W, H), W, H, minPiece, 0.9), area: cnt });
    });
    // order: base first, then biggest pieces first (stripes before lettering)
    const rest = layers.slice(1).sort((a, b) => b.area - a.area);
    const ordered = [layers[0], ...rest].filter((l) => l.loops.length);
    const Win = W * sc, Hin = H * sc;
    const svgHead = `<svg xmlns="http://www.w3.org/2000/svg" width="${Win.toFixed(3)}in" height="${Hin.toFixed(3)}in" viewBox="0 0 ${Win.toFixed(3)} ${Hin.toFixed(3)}">`;
    const bbox = (loops) => { let a = 1e9, b = 1e9, c = -1e9, e = -1e9; loops.forEach((l) => l.forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); e = Math.max(e, y); })); return [(c - a) * sc, (e - b) * sc]; };
    const files = [];
    const all = svgHead + ordered.map((l, i) => `<g id="layer-${i + 1}-${l.color.slice(1)}"><path d="${loopsToPath(l.loops, sc)}" fill="${l.color}" fill-rule="evenodd"/></g>`).join('') + '</svg>';
    files.push({ name: '00-all-layers.svg', data: all });
    const notes = [];
    ordered.forEach((l, i) => {
      const n = String(i + 1).padStart(2, '0');
      files.push({ name: `${n}-${i === 0 ? 'base-felt' : 'layer'}-${l.color.slice(1)}.svg`, data: svgHead + `<path d="${loopsToPath(l.loops, sc)}" fill="${l.color}" fill-rule="evenodd"/></svg>` });
      const [bw, bh] = bbox(l.loops);
      const big = Math.min(bw, bh) > 11.5 || Math.max(bw, bh) > 23.5;
      notes.push(`${n}  ${i === 0 ? `BASE felt (whole ${PM.isBanner(d) ? 'banner' : 'pennant'} shape)` : 'layer piece(s)'}  colour ${l.color.toUpperCase()}  ${l.loops.length} path(s)  size ${bw.toFixed(2)} x ${bh.toFixed(2)} in${big ? '  ** larger than a 12x24 in mat: use a longer mat or split it **' : ''}`);
    });
    files.push({ name: 'README.txt', data: [
      `${title(d)} - felt cutting files`, PM.isBanner(d) ? `Finished size: ${z.H} x ${z.W.toFixed(2)} in (height x width). Cord and rod are not included: fold the top sleeve over a dowel and add a cord.` : `Finished size: ${z.H} x ${z.W.toFixed(2)} in (height at spine x length). Ties are not included: sew ribbon or felt strips to the spine.`, '',
      'Layers, bottom to top:', ...notes, '',
      'How to use (Cricut Design Space / Silhouette Studio):',
      ' 1. Upload each SVG (or 00-all-layers.svg, which keeps every colour as its own layer).',
      ' 2. Check the size matches the numbers above (the files are saved in inches).',
      ' 3. Cut each colour from felt of that colour (stiffened felt cuts cleanest; use a rotary or fabric blade).',
      ' 4. Lay the base felt down, then glue or stitch each layer on top in the order above.',
      'Colours are listed by code - match them to your felt by eye.',
    ].join('\r\n') });
    return PM.zip(files);
  };

  PM.print = P;
})(window.PM);
