// Automatic design: team record (from lookup or CSV) → full pennant design.
window.PM = window.PM || {};
(function (PM) {
  const A = {};

  // team: {name, location, nickname, primary, secondary, tertiary, logo, ...}
  // opts: {style, order, stamps: true, keepLogo}
  A.fromTeam = async (team, base, opts = {}) => {
    if (team.source === 'Wikipedia' && !team.detailed) team = await PM.sources.wikiDetails(team);
    const d = base ? JSON.parse(JSON.stringify(base)) : PM.defaultDesign();
    d.name = team.name || d.name;
    d.line1.text = team.location ?? d.line1.text;
    d.line2.text = team.nickname ?? d.line2.text;
    if (opts.order) d.stripes.order = opts.order;

    let logoData = d.mark.src;
    if (team.logo && !opts.keepLogo) {
      try { logoData = await PM.sources.imageData(team.logo); } catch (e) { console.warn('logo', e); }
    }
    d.mark.src = logoData || null;

    if (opts.stamps !== false) {
      const st = await PM.sources.stampsFor(team).catch(() => []);
      for (let i = 0; i < 2; i++) {
        const it = d.stamps.items[i];
        if (st[i]) { try { it.src = await PM.sources.imageData(st[i].url); it.label = st[i].label; it.show = true; } catch {} }
        else if (!it.src) it.show = i === 0 ? it.show : false;
      }
    }

    const logoColors = logoData ? await PM.colors.extract(logoData, 6) : [];
    // Vintage logos: take the colors from that era's logo (today's team colors may differ)
    const fromLogo = team.colorsFromLogo ? logoColors.filter((c) => PM.colors.lum(c) < 0.8) : [];
    const pal = PM.colors.fixPalette({
      primary: fromLogo[0] || team.primary || logoColors[0] || '#3a3839',
      secondary: fromLogo[1] || team.secondary || logoColors[1],
      tertiary: fromLogo[2] || team.tertiary || logoColors[2],
      field: d.field.color || PM.DEFAULT_FIELD,
    }, logoColors);
    PM.colors.applyPalette(d, pal, opts.style || d.wordStyle);
    if (opts.wordmark !== false && !PM.isLocked(d, 'line2')) await A.useWordmark(d, team);
    A.layoutText(d);
    await A.fit(d);
    return d;
  };

  // Image facts: aspect ratio + average color of the inked pixels.
  const inkOf = (data) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(300, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth) || 1;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
      const px = cx.getImageData(0, 0, w, h).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      res({ ar: img.naturalWidth / img.naturalHeight, ink: n ? PM.colors.hex(r / n, g / n, b / n) : null, cover: n / (w * h) });
    };
    img.onerror = () => res(null);
    img.src = data;
  });
  // The team's real wordmark goes in the big line when one is found and reads on the felt; otherwise the font.
  A.useWordmark = async (d, team) => {
    const l2 = d.line2;
    const wasAuto = l2.autoImg;
    let found = null;
    for (const c of await PM.sources.wordmarks(team, team.eraLabel ? parseInt(team.eraLabel, 10) : 0).catch(() => [])) {
      try {
        const data = await PM.sources.imageData(c.url);
        const f = await inkOf(data);
        if (!f || !f.ink || f.ar < 1.5 || f.cover < 0.04) continue;            // not lettering-shaped / empty
        // colour behind the lettering: the felt, or the pattern on full-colour backgrounds (Gridiron, Split)
        const behind = d.template === 'gridiron' ? d.grid.field : d.template === 'split' ? d.split.top : d.field.color;
        const C = PM.colors;
        if (C.contrast(f.ink, behind) >= 1.6) { found = { data, ar: f.ar, from: c.from, ko: false }; break; }
        // dark lettering on a dark field: cut it out with a felt-coloured edge, if the felt itself reads against it
        if (behind !== d.field.color && C.contrast(f.ink, d.field.color) >= 1.6) { found = { data, ar: f.ar, from: c.from, ko: true }; break; }
      } catch {}
    }
    if (found) {
      Object.assign(l2, { show: true, useImg: true, img: found.data, imgAR: found.ar, imgScale: 1.15, autoImg: true, imgFrom: found.from });
      l2.ko = Object.assign({}, l2.ko, { on: found.ko, shape: 'outline', w: 5, color: d.field.color });
      d.line1.show = false; // the wordmark already carries the name
    } else if (wasAuto) {
      Object.assign(l2, { useImg: false, img: null, autoImg: false, imgFrom: null });
      if (l2.ko) l2.ko.on = false;
      d.line1.show = true;
    }
    return !!found;
  };

  // Vintage: swap in the logo the team used in `year` (from Logopedia), and optionally the name it had then.
  A.withEra = async (team, year, useName = true) => {
    const h = await PM.sources.logoHistory(team.wikiTitle || team.name).catch(() => null);
    if (!h || !h.eras.length) return Object.assign({}, team, { eraMissing: true });
    const e = PM.sources.pickEra(h.eras, year);
    const t = Object.assign({}, team, { logo: e.url, eraLabel: `${e.from}–${e.to >= new Date().getFullYear() ? 'now' : e.to}`, colorsFromLogo: true, leagueGuess: h.league, eras: h.eras });
    if (team.source === 'Logopedia' && h.league) t.leagueLabel = h.league;
    if (useName && e.team && e.team.toLowerCase() !== (team.name || '').toLowerCase() && e.team.split(' ').length > 1) {
      const w = e.team.split(' ');
      t.name = e.team; t.location = w.slice(0, -1).join(' '); t.nickname = w[w.length - 1];
    }
    return t;
  };

  // Single-line names get centered bigger; short line1 stays small above.
  A.layoutText = (d) => {
    const L = (PM.TEMPLATES[d.template] || PM.TEMPLATES.classic).layout;
    // locked lines stay exactly where the user put them
    const keep = ['line1', 'line2'].filter((k) => PM.isLocked(d, k)).map((k) => [k, d[k].x, d[k].y, d[k].size]);
    A._layout(d, L);
    for (const [k, x, y, size] of keep) Object.assign(d[k], { x, y, size });
  };
  A._layout = (d, L) => {
    const has1 = d.line1.show !== false && !!d.line1.text;
    if (!has1) { d.line2.y = L.soloY; } else { d.line1.y = L.l1y; d.line2.y = L.l2y; }
    d.line2.size = L.size2;
    if (d.wordStyle === 'gothic') d.line2.size = Math.round(L.size2 * 1.3); // narrow letters can stand taller
    if (d.wordStyle === 'classic') d.line2.size = Math.round(L.size2 * 1.05);
    // keep a gap between the small top line and the big line (tall fonts reach higher)
    if (has1) {
      const cap = 0.76 * PM.fitSize(d.line2), gap = 18;
      if (d.line2.y - cap < d.line1.y + gap) d.line2.y = Math.round(d.line1.y + gap + cap);
    }
    if (d.wordStyle === 'script') { d.line2.size = L.size2 + 20; d.line2.y = (has1 ? L.l2y : L.soloY) + 10; }
  };

  // Shrink / nudge the unlocked logo and wordmark lines so nothing spills over the spine or the pennant's edges.
  A.fit = (d) => PM.fitToPennant(d, ['mark', 'line1', 'line2', 'extra'].filter((k) => !PM.isLocked(d, k))).catch(() => false);

  // Which background suits a team: basketball → Vintage Hoops, hockey → Vintage Hockey, everything else → Vintage Baseball.
  A.templateFor = (team) => {
    const L = team && PM.sources.ESPN.find((l) => l.id === team.leagueId);
    if (L && L.sport === 'basketball') return 'hoops';
    if (L && L.sport === 'hockey') return 'hockey';
    if (L && L.sport === 'football') return 'gridiron';
    const sp = team && (team.sport || PM.sources.sportOf(team.leagueLabel));
    if (sp === 'hockey') return 'hockey';
    if (sp === 'basketball') return 'hoops';
    if (sp === 'football') return 'gridiron';
    if (team && /hockey|nhl/i.test(team.leagueLabel || '')) return 'hockey';
    if (team && /basketball|nba|wnba/i.test(team.leagueLabel || '')) return 'hoops';
    return 'classic';
  };
  // A fresh design on the chosen background ('match' = pick by sport).
  A.baseFor = (team, choice) => PM.setTemplate(PM.defaultDesign(), !choice || choice === 'match' ? A.templateFor(team) : choice);

  // Rotate through wordmark styles / fonts for "Remix" in auto mode.
  A.remix = (d) => {
    const keys = Object.keys(PM.colors.STYLES);
    const next = keys[(keys.indexOf(d.wordStyle) + 1) % keys.length];
    PM.colors.applyPalette(d, d.palette, next);
    A.layoutText(d);
    return d;
  };
  A.swapColors = (d) => {
    const p = d.palette;
    PM.colors.applyPalette(d, { primary: p.secondary, secondary: p.primary, tertiary: p.tertiary, field: p.field }, d.wordStyle);
    return d;
  };

  PM.auto = A;
})(window.PM);
