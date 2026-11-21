// Automatic design: team record (from lookup or CSV) → full pennant design.
window.PM = window.PM || {};
(function (PM) {
  const A = {};

  // team: {name, location, nickname, primary, secondary, tertiary, logo, ...}
  // opts: {style, order, stamps: true, keepLogo}
  A.fromTeam = async (team, base, opts = {}) => {
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
    A.layoutText(d);
    return d;
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
    const has1 = !!d.line1.text;
    if (!has1) { d.line2.y = L.soloY; } else { d.line1.y = L.l1y; d.line2.y = L.l2y; }
    d.line2.size = L.size2;
    if (d.wordStyle === 'gothic') d.line2.size = Math.round(L.size2 * 1.3); // narrow letters can stand taller
    // keep a gap between the small top line and the big line (tall fonts reach higher)
    if (has1) {
      const cap = 0.76 * PM.fitSize(d.line2), gap = 18;
      if (d.line2.y - cap < d.line1.y + gap) d.line2.y = Math.round(d.line1.y + gap + cap);
    }
    if (d.wordStyle === 'script') { d.line2.size = L.size2 + 20; d.line2.y = (has1 ? L.l2y : L.soloY) + 10; }
  };

  // Which background suits a team: basketball → Vintage Hoops, hockey → Vintage Hockey, everything else → Vintage Baseball.
  A.templateFor = (team) => {
    const L = team && PM.sources.ESPN.find((l) => l.id === team.leagueId);
    if (L && L.sport === 'basketball') return 'hoops';
    if (L && L.sport === 'hockey') return 'hockey';
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
