// Bulk maker: CSV + optional logo files → many pennants → ZIP + contact sheet.
window.PM = window.PM || {};
(function (PM) {
  const B = {};

  B.COLUMNS = ['name', 'template', 'era', 'line1', 'line2', 'lookup', 'league', 'primary', 'secondary', 'tertiary', 'field', 'style', 'order', 'logo', 'stamp1', 'stamp2', 'extra', 'ties'];

  B.parseCSV = (text) => {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const clean = rows.filter((r) => r.some((v) => v.trim()));
    if (!clean.length) return [];
    const head = clean[0].map((h) => h.trim().toLowerCase());
    return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  };

  const fileData = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });

  // Resolve a logo cell: uploaded filename, URL, "auto", or blank.
  async function resolveImg(cell, files) {
    if (!cell || /^(none|auto)$/i.test(cell)) return null;
    const f = files.find((x) => x.name.toLowerCase() === cell.toLowerCase());
    if (f) return PM.sources.trim(await fileData(f));
    if (/^https?:\/\//i.test(cell)) return PM.sources.imageData(cell);
    return null;
  }

  B.designForRow = async (row, files, base, log) => {
    let d = JSON.parse(JSON.stringify(base));
    const q = row.lookup || (row.logo === 'auto' || !row.primary ? row.name : '');
    let team = null;
    if (q) {
      const leagues = row.league ? [row.league] : PM.sources.ESPN.map((l) => l.id);
      const res = await PM.sources.search(q, leagues).catch(() => []);
      team = res.find((t) => t.name.toLowerCase() === q.toLowerCase()) || res[0] || null;
      if (team) log(`  found "${team.name}" (${team.leagueLabel}, ${team.source})`); else log(`  no database match for "${q}"`);
    }
    // era = a year → that year's logo from Logopedia (also finds defunct teams)
    const era = parseInt(row.era, 10);
    if (era > 1800 && q) {
      const close = team && (team.name.toLowerCase().includes(q.toLowerCase()) || q.toLowerCase().includes(team.name.toLowerCase()));
      team = await PM.auto.withEra(close ? team : { source: 'Logopedia', name: q, wikiTitle: q, location: '', nickname: q }, era, true);
      log(team.eraMissing ? `  no logo history for ${era}, using current logo` : `  using the ${team.eraLabel} logo (${team.name})`);
      if (team.eraMissing && team.source === 'Logopedia') team = null;
    }
    // Background: baseball / hoops, or blank = match the sport
    const tv = (row.template || '').toLowerCase();
    const tplKey = /hoop|nba|basket/.test(tv) ? 'hoops' : /hock|nhl/.test(tv) ? 'hockey' : /base|mlb|classic/.test(tv) ? 'classic' : PM.auto.templateFor(team);
    d = PM.setTemplate(d, tplKey);
    const userLogo = await resolveImg(row.logo, files).catch(() => null);
    const t = Object.assign({ name: row.name, location: '', nickname: row.name }, team || {});
    if (row.line1 !== undefined && row.line1 !== '') t.location = row.line1;
    if (row.line2) t.nickname = row.line2;
    if (!team && !row.line2 && row.name) { const w = row.name.split(' '); t.location = row.line1 || (w.length > 1 ? w.slice(0, -1).join(' ') : ''); t.nickname = w[w.length - 1]; }
    if (row.primary) t.primary = row.primary;
    if (row.secondary) t.secondary = row.secondary;
    if (row.tertiary) t.tertiary = row.tertiary;
    if (userLogo) { d.mark.src = userLogo; t.logo = null; }
    if (row.field) d.field.color = PM.colors.norm(row.field) || d.field.color;
    d = await PM.auto.fromTeam(t, d, { style: row.style || undefined, order: (row.order || '').toUpperCase() === 'ABAB' ? 'ABAB' : 'ABBA', stamps: !!team, keepLogo: !!userLogo });
    for (const [i, key] of [[0, 'stamp1'], [1, 'stamp2']]) {
      if (/^none$/i.test(row[key] || '')) d.stamps.items[i].show = false;
      else { const img = await resolveImg(row[key], files).catch(() => null); if (img) { d.stamps.items[i].src = img; d.stamps.items[i].show = true; } }
    }
    if (row.extra) { d.extra.show = true; d.extra.text = row.extra; }
    if (row.ties) { const v = row.ties.toLowerCase(); d.ties.top.show = v === 'both' || v === 'top'; d.ties.bottom.show = v === 'both' || v === 'bottom'; }
    if (!d.mark.src) log('  ⚠ no logo found — upload one or add a URL in the "logo" column');
    return d;
  };

  B.sample = () => [
    B.COLUMNS.join(','),
    'Seattle Seahawks,baseball,,Seattle,Seahawks,Seattle Seahawks,nfl,,,,,outline,ABBA,auto,,,,both',
    'Mississippi State Bulldogs,baseball,,Miss. State,Bulldogs,Mississippi State,cbase,,,,,block,ABAB,auto,,,,bottom',
    'Hartfield Hawks,baseball,,,Hartfield,,,#7d2230,#cdb27f,,,script,ABBA,hartfield.png,mais.png,none,,both',
    'Sacramento Kings,hoops,,Sacramento,Kings,Sacramento Kings,nba,,,,,,,auto,,,,',
    'Phoenix Suns,,,Phoenix,Suns,Phoenix Suns,nba,,,,,,,auto,,,,',
    'New Jersey Devils,hockey,,New Jersey,Devils,New Jersey Devils,nhl,,,,,,,auto,,,,',
    'Hartford Whalers,hockey,1985,Hartford,Whalers,Hartford Whalers,,,,,,,,auto,,,,',
  ].join('\n');

  PM.bulk = B;
})(window.PM);
