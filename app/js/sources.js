// Live team / league lookups. Logos are fetched on demand through the local proxy
// and held only in memory (or in a design file the user chooses to save).
window.PM = window.PM || {};
(function (PM) {
  const S = {};
  S.proxied = (url) => (location.protocol.startsWith('http') ? '/proxy?url=' + encodeURIComponent(url) : url);
  S.json = async (url) => { const r = await fetch(S.proxied(url)); if (!r.ok) throw new Error(r.status); return r.json(); };

  const blobToData = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  // Any image URL → data URL (so it can be exported). Optional trim of transparent padding.
  S.imageData = async (url) => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    const r = await fetch(S.proxied(url));
    if (!r.ok) throw new Error('Image fetch failed (' + r.status + ')');
    const blob = await r.blob();
    if (!blob.type.startsWith('image/')) throw new Error('That link is not an image');
    return S.trim(await blobToData(blob));
  };
  // Crop transparent/white margins so logos size consistently.
  S.trim = (data) => new Promise((resolve) => {
    if (/^data:image\/svg/.test(data)) return resolve(data);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
      let px; try { px = ctx.getImageData(0, 0, w, h); } catch { return resolve(data); }
      const d = px.data;
      // Old logo files often sit on a solid white box. If all four corners are opaque white,
      // flood-fill the white that touches the border to transparent (inner whites stay).
      const white = (i) => d[i + 3] > 200 && d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232;
      const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
      let cleared = false;
      if (corners.every(white)) {
        const seen = new Uint8Array(w * h), stack = [];
        for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
        for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
        while (stack.length) {
          const p = stack.pop();
          if (seen[p]) continue; seen[p] = 1;
          if (!white(p * 4)) continue;
          d[p * 4 + 3] = 0;
          const x = p % w;
          if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
          if (p >= w) stack.push(p - w); if (p < w * (h - 1)) stack.push(p + w);
        }
        ctx.putImageData(px, 0, 0); cleared = true;
      }
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 <= x0) return resolve(data);
      if (!cleared && x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return resolve(data);
      const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(cv, -x0, -y0);
      resolve(out.toDataURL('image/png'));
    };
    img.onerror = () => resolve(data);
    img.src = data;
  });

  // ---------- ESPN ----------
  S.ESPN = [
    { id: 'nfl', sport: 'football', league: 'nfl', label: 'NFL', stamp: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png' },
    { id: 'mlb', sport: 'baseball', league: 'mlb', label: 'MLB', stamp: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png' },
    { id: 'nba', sport: 'basketball', league: 'nba', label: 'NBA', stamp: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png' },
    { id: 'nhl', sport: 'hockey', league: 'nhl', label: 'NHL', stamp: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png' },
    { id: 'wnba', sport: 'basketball', league: 'wnba', label: 'WNBA', stamp: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png' },
    { id: 'mls', sport: 'soccer', league: 'usa.1', label: 'MLS', stamp: 'https://a.espncdn.com/i/teamlogos/leagues/500/mls.png' },
    { id: 'cfb', sport: 'football', league: 'college-football', label: 'NCAA Football', college: true },
    { id: 'cbb', sport: 'basketball', league: 'mens-college-basketball', label: 'NCAA Basketball', college: true },
    { id: 'cbase', sport: 'baseball', league: 'college-baseball', label: 'NCAA Baseball', college: true },
    { id: 'epl', sport: 'soccer', league: 'eng.1', label: 'Premier League' },
    { id: 'efl', sport: 'soccer', league: 'eng.2', label: 'EFL Championship' },
    { id: 'laliga', sport: 'soccer', league: 'esp.1', label: 'La Liga' },
    { id: 'bund', sport: 'soccer', league: 'ger.1', label: 'Bundesliga' },
    { id: 'seriea', sport: 'soccer', league: 'ita.1', label: 'Serie A' },
    { id: 'ligue1', sport: 'soccer', league: 'fra.1', label: 'Ligue 1' },
    { id: 'ligamx', sport: 'soccer', league: 'mex.1', label: 'Liga MX' },
  ];
  const espnCache = {};
  S.espnTeams = async (L) => {
    if (espnCache[L.id]) return espnCache[L.id];
    const j = await S.json(`https://site.api.espn.com/apis/site/v2/sports/${L.sport}/${L.league}/teams?limit=1000`);
    const teams = (j.sports?.[0]?.leagues?.[0]?.teams || []).map(({ team: t }) => ({
      source: 'ESPN', leagueId: L.id, leagueLabel: L.label, espnId: t.id,
      name: t.displayName, location: t.location, nickname: t.name, abbr: t.abbreviation,
      primary: t.color ? '#' + t.color : null, secondary: t.alternateColor ? '#' + t.alternateColor : null,
      logo: (t.logos || []).find((l) => l.rel.includes('default'))?.href || t.logos?.[0]?.href,
      logos: (t.logos || []).map((l) => ({ url: l.href, tag: l.rel.filter((r) => r !== 'full').join(' ') })),
    }));
    espnCache[L.id] = teams;
    return teams;
  };

  // ---------- TheSportsDB ----------
  S.tsdbKey = () => localStorage.getItem('pm_tsdb_key') || '123';
  S.tsdb = (path) => S.json(`https://www.thesportsdb.com/api/v1/json/${S.tsdbKey()}/${path}`);
  S.tsdbTeams = async (q) => {
    const j = await S.tsdb('searchteams.php?t=' + encodeURIComponent(q));
    return (j.teams || []).map((t) => {
      const words = t.strTeam.split(' ');
      return {
        source: 'TheSportsDB', name: t.strTeam, leagueLabel: t.strLeague, tsdbLeagueId: t.idLeague,
        location: words.length > 1 ? words.slice(0, -1).join(' ') : '', nickname: words.length > 1 ? words[words.length - 1] : t.strTeam,
        primary: t.strColour1, secondary: t.strColour2, tertiary: t.strColour3,
        logo: t.strBadge, logos: [t.strBadge && { url: t.strBadge, tag: 'badge' }, t.strLogo && { url: t.strLogo, tag: 'wordmark/logo' }, t.strEquipment && { url: t.strEquipment, tag: 'jersey' }].filter(Boolean),
      };
    });
  };
  S.tsdbLeagueBadge = async (id) => {
    if (!id) return null;
    try { const j = await S.tsdb('lookupleague.php?id=' + id); return j.leagues?.[0]?.strBadge || null; } catch { return null; }
  };
  let allLeagues = null;
  S.searchLeagues = async (q) => {
    if (!allLeagues) { const j = await S.tsdb('all_leagues.php'); allLeagues = j.leagues || []; }
    const ql = q.toLowerCase();
    return allLeagues.filter((l) => (l.strLeague + ' ' + (l.strLeagueAlternate || '')).toLowerCase().includes(ql)).slice(0, 12);
  };

  // ---------- Wikimedia Commons (league / conference / association logos) ----------
  S.commonsFile = (title, width) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title.replace(/^File:/, ''))}${width ? '?width=' + width : ''}`;
  S.commonsSearch = async (q, limit = 16) => {
    const j = await S.json(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=${limit}&format=json&srsearch=${encodeURIComponent(q + ' logo')}`);
    return (j.query?.search || []).filter((r) => /\.(svg|png)$/i.test(r.title)).map((r) => ({
      name: r.title.replace(/^File:/, '').replace(/\.(svg|png)$/i, '').replace(/_/g, ' '),
      thumb: S.commonsFile(r.title, 160), url: S.commonsFile(r.title, 600), // SVGs come back rasterized as PNG
    }));
  };

  // ---------- Logopedia (logos.fandom.com): logo history with era years ----------
  const LW = 'https://logos.fandom.com/api.php?format=json&';
  const histCache = {};
  const normFile = (f) => f.replace(/^(File|Image):/i, '').replace(/_/g, ' ').trim().toLowerCase();
  const GENERIC = /^(logos?|primary|alternate|secondary|history|wordmarks?|gallery|other|see also|notes|references|external links|uniforms?|jerseys?)$/i;
  S.logoSearch = async (q, limit = 8) => {
    const j = await S.json(LW + `action=query&list=search&srnamespace=0&srlimit=${limit}&srsearch=${encodeURIComponent(q)}`);
    return (j.query?.search || []).map((r) => r.title);
  };
  // → { title, league, eras: [{from, to, team, file, url}] } sorted oldest first
  S.logoHistory = async (name) => {
    const key = name.toLowerCase();
    if (histCache[key]) return histCache[key];
    let j = await S.json(LW + 'action=parse&prop=wikitext&redirects=1&page=' + encodeURIComponent(name));
    if (j.error) {
      const t = (await S.logoSearch(name, 1))[0];
      if (!t) return (histCache[key] = { title: name, league: null, eras: [] });
      j = await S.json(LW + 'action=parse&prop=wikitext&redirects=1&page=' + encodeURIComponent(t));
      if (j.error) return (histCache[key] = { title: name, league: null, eras: [] });
    }
    const title = j.parse.title, w = j.parse.wikitext['*'];
    const now = new Date().getFullYear();
    const yr = (v) => (/present/i.test(v) ? now : +v);
    const eras = [], seen = new Set();
    // 1) sections: ==Team name== / ===1985–1994=== / [[File:...]]
    let h2 = title, cur = null;
    for (const line of w.split('\n')) {
      const m2 = line.match(/^==\s*([^=].*?)\s*==\s*$/); if (m2) { h2 = m2[1].replace(/\[\[|\]\]|'''/g, ''); cur = null; continue; }
      const m3 = line.match(/^===+\s*(\d{4})\s*[–—-]\s*(\d{4}|present)\s*===+/i); if (m3) { cur = { from: +m3[1], to: yr(m3[2]), team: h2 }; continue; }
      const mf = cur && line.match(/\[\[(?:File|Image):([^|\]]+)/i);
      if (mf && !seen.has(normFile(mf[1]))) { seen.add(normFile(mf[1])); eras.push(Object.assign({ file: mf[1].trim() }, cur)); cur = null; }
    }
    // 2) infobox timeline lines: |file.svg|1985–1994
    for (const m of w.matchAll(/^\|\s*([^|=\n]+?\.(?:svg|png|gif|jpe?g|webp))\s*\|\s*(\d{4})\s*[–—-]\s*(\d{4}|present)/gim)) {
      if (!seen.has(normFile(m[1]))) { seen.add(normFile(m[1])); eras.push({ file: m[1].trim(), from: +m[2], to: yr(m[3]), team: title }); }
    }
    eras.forEach((e) => { if (GENERIC.test(e.team) || /\d/.test(e.team)) e.team = title; });
    // resolve image URLs (batched)
    for (let i = 0; i < eras.length; i += 40) {
      const batch = eras.slice(i, i + 40);
      const r = await S.json(LW + 'action=query&prop=imageinfo&iiprop=url&titles=' + encodeURIComponent(batch.map((e) => 'File:' + e.file).join('|')));
      const urls = {};
      for (const p of Object.values(r.query?.pages || {})) if (p.imageinfo?.[0]?.url) urls[normFile(p.title)] = p.imageinfo[0].url;
      batch.forEach((e) => { e.url = urls[normFile(e.file)] || null; });
    }
    const league = /\bNHL\b/.test(w) ? 'NHL' : /\bNBA\b/.test(w) ? 'NBA' : /\bMLB\b|Major League Baseball/.test(w) ? 'MLB' : /\bNFL\b/.test(w) ? 'NFL' : null;
    const res = { title, league, eras: eras.filter((e) => e.url).sort((a, b) => a.from - b.from || a.to - b.to) };
    return (histCache[key] = res);
  };
  // Logo in use in a given year (or the nearest era).
  S.pickEra = (eras, year) => eras.find((e) => e.from <= year && year <= e.to) ||
    eras.slice().sort((a, b) => Math.min(Math.abs(a.from - year), Math.abs(a.to - year)) - Math.min(Math.abs(b.from - year), Math.abs(b.to - year)))[0] || null;
  S.LEAGUE_STAMPS = { NFL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png', MLB: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png', NBA: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png', NHL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png' };

  // ---------- High schools: MaxPreps (national directory of US high school teams + mascot logos) ----------
  // No public API, so we link out: the user finds the school, copies the logo's image address and pastes it into "Link".
  S.maxprepsUrl = (q) => 'https://www.maxpreps.com/search/?q=' + encodeURIComponent((q || '').trim());
  S.openExternal = (url) => window.open(url, '_blank', 'noopener');

  // ---------- Combined search ----------
  S.search = async (q, leagueIds, opts = {}) => {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const leagues = S.ESPN.filter((l) => leagueIds.includes(l.id));
    const results = [];
    const espnLists = await Promise.allSettled(leagues.map(S.espnTeams));
    espnLists.forEach((r) => {
      if (r.status !== 'fulfilled') return;
      r.value.forEach((t) => {
        const hay = `${t.name} ${t.abbr} ${t.location}`.toLowerCase();
        if (hay.includes(q)) results.push(t);
      });
    });
    try { results.push(...await S.tsdbTeams(q)); } catch (e) { console.warn('TSDB', e); }
    // Vintage mode: also find teams by logo history, which covers defunct clubs (Whalers, Nordiques...)
    if (opts.vintage) {
      try {
        const have = new Set(results.map((r) => r.name.toLowerCase()));
        for (const title of await S.logoSearch(q, 6)) {
          if (have.has(title.toLowerCase())) continue;
          const words = title.split(' ');
          results.push({ source: 'Logopedia', name: title, wikiTitle: title, leagueLabel: 'Logo history',
            location: words.length > 1 ? words.slice(0, -1).join(' ') : '', nickname: words[words.length - 1], logos: [] });
        }
      } catch (e) { console.warn('Logopedia', e); }
    }
    return results.slice(0, 70);
  };

  // College conference name via ESPN. Team ids differ per sport, so match the school by name.
  S.conferenceName = async (team, L) => {
    const tries = [L, ...S.ESPN.filter((x) => x.college && x.id !== L.id)];
    for (const Lx of tries) {
      const { sport, league } = Lx;
      try {
        const same = Lx.id === L.id ? team : (await S.espnTeams(Lx)).find((t) => t.name === team.name);
        if (!same) continue;
        const j = await S.json(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${same.espnId}`);
        const g = j.team?.groups; if (!g?.id) continue;
        const c = await S.json(`https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/groups/${g.id}`);
        if (c.name && /conference|league|athletic|big|sec|acc|pac/i.test(c.name)) return c.name;
      } catch {}
    }
    return null;
  };

  // League + conference stamp URLs for a team result.
  S.stampsFor = async (team) => {
    const out = [];
    if (team.source === 'ESPN') {
      const L = S.ESPN.find((l) => l.id === team.leagueId);
      if (L.college) {
        out.push({ url: 'https://a.espncdn.com/i/espn/misc_logos/500/ncaa.png', label: 'NCAA' });
        // Conference: ESPN gives the conference name; the logo comes from Wikimedia Commons.
        const name = await S.conferenceName(team, L);
        if (name) {
          const hit = (await S.commonsSearch(name, 6).catch(() => []))[0];
          if (hit) out.push({ url: hit.url, label: name });
        }
      } else if (L.stamp) out.push({ url: L.stamp, label: L.label });
      else {
        const ls = await S.searchLeagues(L.label).catch(() => []);
        const b = ls[0] && await S.tsdbLeagueBadge(ls[0].idLeague);
        if (b) out.push({ url: b, label: L.label });
      }
    } else if (S.LEAGUE_STAMPS[team.leagueGuess] && (team.source === 'Logopedia' || /defunct/i.test(team.leagueLabel || '') || !team.tsdbLeagueId)) {
      out.push({ url: S.LEAGUE_STAMPS[team.leagueGuess], label: team.leagueGuess });
    } else if (team.tsdbLeagueId) {
      const b = await S.tsdbLeagueBadge(team.tsdbLeagueId);
      if (b) out.push({ url: b, label: team.leagueLabel });
    }
    return out;
  };

  PM.sources = S;
})(window.PM);
