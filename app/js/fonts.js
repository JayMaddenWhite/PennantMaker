// Google Fonts loading (for the live preview) and embedding (for raster/SVG export,
// because an SVG drawn into a canvas can't see the page's fonts).
window.PM = window.PM || {};
(function (PM) {
  // family → "family=Name:axes" (axes from the catalog in fontlist.js)
  const famParam = (f) => { const q = PM.FONT_FAMILIES[f]; return `family=${f.replace(/ /g, '+')}${q ? ':' + q : ''}`; };
  const cssUrl = (fams) => `https://fonts.googleapis.com/css2?${fams.map(famParam).join('&')}&display=block`;

  // Declare every catalog font for the preview (files only download when a font is actually used).
  PM.loadFontsCSS = () => {
    const fams = Object.keys(PM.FONT_FAMILIES);
    for (let i = 0; i < fams.length; i += 30) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = cssUrl(fams.slice(i, i + 30));
      document.head.appendChild(link);
    }
  };

  const loaded = new Set();
  PM.ensureFonts = async (d) => {
    const need = [d.line1, d.line2, d.extra].filter((t) => t.show && t.text).map((t) => t);
    await Promise.all(need.map((t) => {
      const key = PM.fontCss(t, 40);
      if (loaded.has(key)) return null;
      return document.fonts.load(key, t.text).then(() => loaded.add(key)).catch(() => {});
    }));
    await document.fonts.load('700 20px "Oswald"').catch(() => {});
  };

  const blobToData = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  const embedCache = {};
  // Returns @font-face CSS with the font files inlined as data URLs, filtered to the
  // unicode-range subsets actually needed (latin) to keep files small.
  PM.embedFonts = async (d) => {
    const fams = [...new Set([d.line1, d.line2, d.extra].filter((t) => t.show && t.text).map((t) => PM.fontDef(t.font).family))];
    const parts = await Promise.all(fams.map(async (f) => {
      if (embedCache[f]) return embedCache[f];
      try {
        const css = await (await fetch(cssUrl([f]))).text();
        const tagged = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
        const keep = tagged.filter((m) => m[1] === 'latin' || m[1] === 'latin-ext').map((m) => m[2]);
        const use = keep.length ? keep : (css.match(/@font-face\s*\{[^}]*\}/g) || []);
        let out = '';
        for (const b of use) {
          const m = b.match(/url\((https:[^)]+)\)/);
          if (!m) continue;
          const data = await blobToData(await (await fetch(m[1])).blob());
          out += b.replace(m[1], data);
        }
        embedCache[f] = out;
        return out;
      } catch (e) { console.warn('font embed failed', f, e); return ''; }
    }));
    return parts.join('\n');
  };
})(window.PM);
