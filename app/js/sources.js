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

  // ---------- Schedules ----------
  // A team's season from ESPN's public schedule feed: one line per game plus each opponent's logo.
  S.espnSchedule = async (team) => {
    const L = team && S.ESPN.find((l) => l.id === team.leagueId);
    if (!L || !team.espnId) throw new Error('Schedules load for ESPN teams (pro leagues and major colleges). For others, import a calendar file or paste the schedule.');
    const base = `https://site.api.espn.com/apis/site/v2/sports/${L.sport}/${L.league}/teams/${team.espnId}/schedule`;
    let j = await S.json(base);
    if (L.sport === 'football') { try { const r = await S.json(base + '?seasontype=2'); if ((r.events || []).length) j = r; } catch {} }
    const lines = [], logos = {};
    for (const e of j.events || []) {
      const c = e.competitions && e.competitions[0]; if (!c) continue;
      const us = c.competitors.find((x) => String(x.team.id) === String(team.espnId)), them = c.competitors.find((x) => x !== us);
      if (!us || !them) continue;
      const dt = new Date(e.date);
      const date = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
      const time = e.timeValid === false ? 'TBA' : dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const opp = them.team.shortDisplayName || them.team.displayName || them.team.name;
      const logo = (them.team.logos && them.team.logos[0] && them.team.logos[0].href) || them.team.logo;
      if (logo) logos[opp] = logo;
      lines.push(`${date} | ${us.homeAway === 'home' ? 'vs' : '@'} | ${opp} | ${time}`);
    }
    if (!lines.length) throw new Error('ESPN has no games listed for this team yet.');
    return { lines, logos, season: (j.season && j.season.displayName) || '' };
  };
  // Small logo (ESPN can resize its own) as a data URL, so a whole season of logos stays light.
  S.smallLogo = async (url) => {
    let u = url;
    try { const x = new URL(url); if (/espncdn\.com$/.test(x.hostname) && !/combiner/.test(x.pathname)) u = `https://a.espncdn.com/combiner/i?img=${x.pathname}&w=96&h=96`; } catch {}
    return S.imageData(u);
  };
  // A calendar file (.ics, as schedule sites export) → schedule lines. teamName is dropped from titles.
  S.icsSchedule = (text, teamName = '') => {
    const raw = String(text || '').replace(/\r?\n[ \t]/g, '');            // unfold long lines
    const evs = raw.split(/BEGIN:VEVENT/).slice(1).map((b) => b.split(/END:VEVENT/)[0]);
    const field = (b, k) => { const m = b.match(new RegExp('^' + k + '(?:;[^:\\n]*)?:(.*)$', 'mi')); return m ? m[1].trim().replace(/\\,/g, ',').replace(/\\n/g, ' ') : ''; };
    const when = (v) => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/); if (!m) return null;
      const [, y, mo, dd, hh, mi, , z] = m;
      if (!hh) return { dt: new Date(+y, +mo - 1, +dd), allDay: true };
      return { dt: z ? new Date(Date.UTC(+y, +mo - 1, +dd, +hh, +mi)) : new Date(+y, +mo - 1, +dd, +hh, +mi), allDay: false };
    };
    const name = String(teamName || '').trim().toLowerCase();
    return evs.map((b) => {
      const w = when(field(b, 'DTSTART')); if (!w) return null;
      let s = field(b, 'SUMMARY'), ha = 'vs', opp = s;
      const vs = s.match(/\b(?:vs\.?|v\.?)\s+(.+)$/i), at = s.match(/(?:@|\bat\b)\s+(.+)$/i);
      // "Lincoln at Our Team" is a home game against Lincoln
      if (at && name && at[1].toLowerCase().includes(name)) { opp = s.slice(0, at.index).trim(); }
      else if (at && (!vs || at.index > vs.index)) { ha = '@'; opp = at[1]; } else if (vs) opp = vs[1];
      else if (name && s.toLowerCase().includes(name)) opp = s.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').replace(/^[\s\-–:]+|[\s\-–:]+$/g, '');
      opp = opp.replace(/\s*[-–(].*$/, '').trim() || s;
      const date = w.dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
      const time = w.allDay ? 'TBA' : w.dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return { t: w.dt.getTime(), line: `${date} | ${ha} | ${opp} | ${time}` };
    }).filter(Boolean).sort((a, b) => a.t - b.t).map((x) => x.line);
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
    // sections for caps, helmets, uniforms, alternates etc. are not the team's primary logo (or its name)
    const SIDE = /\b(caps?|helmets?|jerseys?|uniforms?|alternates?|secondary|tertiary|wordmarks?|scripts?|patch(es)?|anniversary|special|throwback|road|home|batting practice|spring training|other logos?)\b/i;
    eras.forEach((e) => { e.side = SIDE.test(e.team); });
    if (eras.some((e) => !e.side)) for (let i = eras.length - 1; i >= 0; i--) if (eras[i].side) eras.splice(i, 1);
    eras.forEach((e) => { if (GENERIC.test(e.team) || /\d/.test(e.team) || e.side || /\blogos?\b/i.test(e.team)) e.team = title; });
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

  // ---------- Wikipedia: minor-league, defunct, arena, junior and lower-level teams ----------
  // English Wikipedia has a page (with logo, colors, league and years) for nearly every pro and minor-league
  // team that ever played: MiLB, ECHL/IHL/CHL hockey, CBA/ABA basketball, Arena/af2 football, USL soccer...
  const WP = 'https://en.wikipedia.org/w/api.php?format=json&';
  const TEAMISH = /\b(team|club|franchise|squad)\b|minor[- ]league (baseball|hockey|basketball|football|soccer)/i;
  const NOT_TEAM = /\bseason\b|player|coach|manager|executive|owner|broadcaster|announcer|stadium|ballpark|venue|ice rink|place in|born|\bdraft\b|\bgames?\b|series|award|film|song|album|novel|\bleague\s*$|\bleague (in|of|for|based|that|which)\b|\bconference\b/i;
  S.sportOf = (s) => {
    s = s || '';
    if (/hockey/i.test(s)) return 'hockey';
    if (/basketball/i.test(s)) return 'basketball';
    if (/association football|soccer|football club|\bF\.?C\.?\b/i.test(s)) return 'soccer';
    if (/football|gridiron/i.test(s)) return 'football';
    if (/baseball|softball/i.test(s)) return 'baseball';
    if (/lacrosse/i.test(s)) return 'lacrosse';
    return null;
  };
  // Called straight from the browser (Wikipedia allows it), so each visitor uses their own allowance
  // instead of every visitor sharing the server's; falls back to the proxy.
  const wj = async (url) => {
    try {
      const r = await fetch(url + '&origin=*', { headers: { 'Api-User-Agent': 'PennantMaker/1.0 (https://pennantmaker.com)' } });
      if (r.ok) return r.json();
      if (r.status === 429) throw new Error('Wikipedia is busy, try again in a minute');
    } catch (e) { if (/busy/.test(e.message)) throw e; }
    return S.json(url);
  };
  const wikiFileUrls = async (files, width = 600) => {
    const out = {};
    for (let i = 0; i < files.length; i += 40) {
      const batch = files.slice(i, i + 40);
      const r = await wj(WP + `action=query&prop=imageinfo&iiprop=url&iiurlwidth=${width}&titles=` + encodeURIComponent(batch.map((f) => 'File:' + f).join('|')));
      const norm = {}; (r.query?.normalized || []).forEach((n) => { norm[n.to] = n.from; });
      for (const p of Object.values(r.query?.pages || {})) {
        const ii = p.imageinfo?.[0]; if (!ii) continue;
        const url = (ii.thumburl || ii.url).replace(/\?.*$/, '');
        out[normFile(p.title)] = url; if (norm[p.title]) out[normFile(norm[p.title])] = url;
      }
    }
    return out;
  };
  const cleanWiki = (v) => (v || '').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  // Schools: Wikipedia has one page per sport ("Ole Miss Rebels football", "... baseball") plus the athletic
  // program's main page ("Ole Miss Rebels": intercollegiate sports teams of the university). Show the main page only.
  const PROGRAM = /(inter)?collegiate (sports|athletic)|athletic (teams|program|department)|sports teams of|athletics program/i;
  const SPORT_TAIL = /^(.+?)\s+(?:(?:men's|women's)\s+)?(football|baseball|softball|(?:ice )?hockey|basketball|soccer|volleyball|lacrosse|wrestling|tennis|golf|swimming(?: and diving)?|track and field|cross country|gymnastics|rowing|field hockey|beach volleyball|water polo|rugby(?: union)?)(?:\s+team)?$/i;
  const COLLEGE = /college|university|intercollegiate|collegiate|NCAA|NAIA/i;
  const progBase = (t) => t.replace(/\s+(athletics|sports)$/i, '');
  S.wikiTeams = async (q, limit = 20) => {
    const j = await wj(WP + `action=query&generator=search&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(q)}&prop=pageprops|description&ppprop=page_image`);
    const all = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).filter((p) => p.description);
    const isProgram = (p) => PROGRAM.test(p.description) && !/\bseason\b/i.test(p.description);
    let pages = all.filter((p) => isProgram(p) || (TEAMISH.test(p.description) && !NOT_TEAM.test(p.description)));
    // college sport page → its program ("Mississippi State Bulldogs football" → "Mississippi State Bulldogs")
    const parentOf = (p) => { const m = p.title.match(SPORT_TAIL); return m && COLLEGE.test(p.description + ' ' + p.title) ? m[1] : null; };
    const programs = pages.filter(isProgram);
    const missing = [...new Set(pages.map(parentOf).filter(Boolean))]
      .filter((par) => !programs.some((g) => g.title === par || progBase(g.title) === par || par.startsWith(progBase(g.title) + ' ')));
    if (missing.length) {
      try {
        const r = await wj(WP + 'action=query&redirects=1&prop=pageprops|description&ppprop=page_image&titles=' + encodeURIComponent(missing.join('|')));
        for (const g of Object.values(r.query?.pages || {})) if (g.pageid && g.description && isProgram(g) && !programs.some((x) => x.pageid === g.pageid)) {
          g.index = Math.min(...pages.filter((p) => { const par = parentOf(p); return par && (par === g.title || (r.query.redirects || []).some((x) => x.from === par && x.to === g.title)); }).map((p) => p.index), 99);
          programs.push(g); pages.push(g);
        }
      } catch {}
    }
    // drop a school's per-sport pages when its main program page is there
    const covered = (p) => { const par = parentOf(p); return par && programs.some((g) => g !== p && (g.title === par || par.startsWith(progBase(g.title)) || progBase(g.title).startsWith(par))); };
    pages = pages.filter((p) => isProgram(p) || !covered(p)).sort((a, b) => a.index - b.index);
    const urls = await wikiFileUrls(pages.map((p) => p.pageprops?.page_image).filter(Boolean)).catch(() => ({}));
    const list = pages.map((p) => {
      const name = progBase(p.title.replace(/\s*\([^)]*\)\s*$/, '')), words = name.split(' ');
      const logo = p.pageprops?.page_image ? urls[normFile(p.pageprops.page_image)] || null : null;
      return { source: 'Wikipedia', name, wikiTitle: p.title, leagueLabel: p.description.replace(/^./, (c) => c.toUpperCase()), college: isProgram(p) || undefined,
        sport: isProgram(p) ? null : S.sportOf(p.description + ' ' + p.title), location: words.length > 1 ? words.slice(0, -1).join(' ') : '', nickname: words[words.length - 1],
        logo, logos: logo ? [{ url: logo, tag: 'logo' }] : [] };
    });
    // school pages carry their logo in the infobox only (no search thumbnail): read the first few now
    await Promise.all(list.filter((t) => t.college && !t.logo).slice(0, 3).map(async (t) => Object.assign(t, await S.wikiDetails(t))));
    return list;
  };
  // Color names used in infoboxes that CSS doesn't know.
  const SPORT_COLORS = { 'burnt orange': '#cc5500', 'old gold': '#cfb53b', 'vegas gold': '#c5b358', 'athletic gold': '#ffb81c', 'kelly green': '#4cbb17',
    'hunter green': '#355e3b', 'forest green': '#228b22', 'cardinal': '#c41e3a', 'scarlet': '#ff2400', 'columbia blue': '#9bcbeb', 'carolina blue': '#7bafd4',
    'navy blue': '#000080', 'royal blue': '#4169e1', 'sky blue': '#87ceeb', 'midnight blue': '#191970', 'maroon': '#800000', 'burgundy': '#800020',
    'garnet': '#733635', 'cream': '#fffdd0', 'copper': '#b87333', 'bronze': '#cd7f32', 'teal': '#008080', 'aqua': '#00ffff', 'kelly': '#4cbb17' };
  const colorWord = (w) => {
    w = w.toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (!w) return null;
    if (SPORT_COLORS[w]) return SPORT_COLORS[w];
    const ctx = (colorWord.ctx ||= document.createElement('canvas').getContext('2d'));
    ctx.fillStyle = '#010203'; ctx.fillStyle = w.replace(/\s+/g, '');
    return ctx.fillStyle !== '#010203' ? ctx.fillStyle : null;
  };
  S.wikiColors = (field) => {
    const out = [];
    const add = (c) => { c = c && (PM.colors.norm(c) || colorWord(c)); if (c && !out.includes(c)) out.push(c); };
    for (const m of field.matchAll(/\{\{\s*colou?r\s*box\s*\|\s*([^|}]+)/gi)) add(m[1].trim());
    if (!out.length) cleanWiki(field).split(/,|\band\b|\/|&/i).forEach((w) => add(w));
    // white / near-white last: they suit the lettering better than the felt
    return out.filter((c) => PM.colors.lum(c) < 0.85).concat(out.filter((c) => PM.colors.lum(c) >= 0.85));
  };
  // Full details for a Wikipedia result: infobox logo, colors, league(s), years.
  S.wikiDetails = async (team) => {
    if (team.detailed) return team;
    const t = Object.assign({}, team, { detailed: true });
    try {
      const j = await wj(WP + 'action=parse&prop=wikitext&section=0&redirects=1&page=' + encodeURIComponent(team.wikiTitle));
      const w = j.parse?.wikitext?.['*'] || '';
      const field = (k) => { const m = w.match(new RegExp('^\\s*\\|\\s*(?:' + k + ')\\s*=\\s*(.*)$', 'im')); return m ? m[1].trim() : ''; };
      const cols = S.wikiColors(field('colou?rs|team_colou?rs'));
      if (cols[0]) t.primary = cols[0]; if (cols[1]) t.secondary = cols[1]; if (cols[2]) t.tertiary = cols[2];
      const logoFile = field('logo|image').replace(/^(File|Image):/i, '').replace(/\|.*$/, '').replace(/\[\[|\]\]/g, '').trim();
      if (/\.(svg|png|gif|jpe?g|webp)$/i.test(logoFile)) {
        const u = (await wikiFileUrls([logoFile]).catch(() => ({})))[normFile(logoFile)];
        if (u) { t.logo = u; t.logos = [{ url: u, tag: 'logo' }, ...(t.logos || []).filter((l) => l.url !== u)]; }
      }
      // leagues: keep the linked page titles so the league's own logo can be found for the stamp
      const lg = field('league|leagues|conference');
      t.leagues = [...lg.matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g)].map((m) => ({ page: m[1].trim(), label: (m[2] || m[1]).trim() }))
        .filter((x) => !/^\d{4}|season/i.test(x.page));
      if (t.college) t.leagues = t.leagues.slice(0, 1);  // "SEC (primary)" comes first; later ones are single-sport
      if (t.leagues.length) t.leagueLabel = t.leagues[t.leagues.length - 1].page;
      // a wordmark in the infobox (schools often list it as the alternate logo)
      const files = (v) => (v.match(/([^\[\]|:=]+?\.(?:svg|png|gif))/gi) || []).map((f) => f.trim());
      const wm = files(field('wordmark'))[0] || files(field('altlogo|alt_logo|logo_alt|secondary_logo')).find((f) => /word\s*mark|script/i.test(f));
      if (wm) { const u = (await wikiFileUrls([wm]).catch(() => ({})))[normFile(wm)]; if (u) t.wordmark = u; }
      const founded = cleanWiki(field('founded|established')).match(/\d{4}/)?.[0], folded = cleanWiki(field('folded|dissolved|defunct')).match(/\d{4}/)?.[0];
      if (founded || folded) t.years = `${founded || '?'}–${folded || 'now'}`;
      const nm = cleanWiki(field('name|team_name'));
      if (nm && nm.split(' ').length > 1 && !/\d/.test(nm)) { const ws = nm.split(' '); t.name = nm; t.location = ws.slice(0, -1).join(' '); t.nickname = ws[ws.length - 1]; }
      // split "Hartford Wolf Pack" at the city from the infobox, not just before the last word
      const places = cleanWiki(field('city|location|arena|ballpark|stadium')).split(/,| in /).map((x) => x.trim()).filter(Boolean);
      const city = [...places, ...cleanWiki(field('city|location')).split(/\s*,\s*/)].find((c) => c && t.name.toLowerCase().startsWith(c.toLowerCase() + ' '));
      if (city) { t.location = t.name.slice(0, city.length); t.nickname = t.name.slice(city.length + 1); }
      t.sport = t.sport || S.sportOf(field('sport') + ' ' + t.leagueLabel);
    } catch (e) { console.warn('wikiDetails', e); }
    return t;
  };
  // Logo of a Wikipedia page (e.g. a league) via its lead image.
  S.wikiPageLogo = async (title) => {
    const j = await wj(WP + 'action=query&redirects=1&prop=pageprops&ppprop=page_image&titles=' + encodeURIComponent(title));
    let f = Object.values(j.query?.pages || {})[0]?.pageprops?.page_image;
    if (!f) { // no lead image: take the infobox logo
      const w = (await wj(WP + 'action=parse&prop=wikitext&section=0&redirects=1&page=' + encodeURIComponent(title)).catch(() => null))?.parse?.wikitext?.['*'] || '';
      const m = w.match(/^\s*\|\s*(?:logo|image)\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n]+?\.(?:svg|png|gif|jpe?g))/im);
      f = m && m[1].trim();
    }
    return f ? (await wikiFileUrls([f]))[normFile(f)] || null : null;
  };

  // ---------- Team wordmarks (the team's own lettering, used instead of a font when found) ----------
  // Wikimedia Commons first (clean lettering-only files), then TheSportsDB's team "logo" (wordmark or lockup).
  S.wordmarks = async (team, year) => {
    const out = [];
    if (team.wordmark && !year) out.push({ url: team.wordmark, from: 'Wikipedia' });
    const nick = (team.nickname || team.name || '').toLowerCase(), squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    try {
      const hits = (await S.commonsSearch(team.name + ' wordmark', 12)).filter((h) => /word\s*mark/i.test(h.name) &&
        (h.name.toLowerCase().includes(nick) || squash(h.name).includes(squash(team.nickname || team.name))));
      const yr = (h) => +(h.name.match(/\b(18|19|20)\d\d\b/) || [0])[0];
      // current logos: undated files first, then newest; vintage: the file dated closest to (not after) that year
      hits.sort((a, b) => year ? Math.abs((yr(a) || 3000) - year) - Math.abs((yr(b) || 3000) - year) : (!yr(a) - !yr(b)) * -1 || yr(b) - yr(a));
      hits.slice(0, 3).forEach((h) => out.push({ url: h.url, from: 'Wikimedia Commons' }));
    } catch {}
    if (!year) try {
      const ts = team.source === 'TheSportsDB' ? team : (await S.tsdbTeams(team.name)).find((t) => t.name.toLowerCase() === (team.name || '').toLowerCase());
      const w = ts?.logos?.find((l) => l.tag.startsWith('wordmark'));
      if (w) out.push({ url: w.url, from: 'TheSportsDB' });
    } catch {}
    return out;
  };

  // Link-outs for teams no API covers well.
  S.funWhileItLastedUrl = (q) => 'https://funwhileitlasted.net/?s=' + encodeURIComponent((q || '').trim());
  S.sportsLogosUrl = (q) => 'https://www.google.com/search?q=' + encodeURIComponent('site:sportslogos.net ' + (q || '').trim());

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
    const wiki = S.wikiTeams(q).catch((e) => { console.warn('Wikipedia', e); return []; });
    try { results.push(...await S.tsdbTeams(q)); } catch (e) { console.warn('TSDB', e); }
    // Wikipedia: minor-league, defunct, arena and lower-level teams the big APIs don't carry
    // (kept next to a TheSportsDB match of the same name: Wikipedia usually has the better logo + colors for minor-league clubs)
    { const have = new Set(results.filter((r) => r.source === 'ESPN').map((r) => r.name.toLowerCase())); for (const t of await wiki) if (!have.has(t.name.toLowerCase())) { have.add(t.name.toLowerCase()); results.push(t); } }
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
    } else if (team.source === 'Wikipedia') {
      if (team.college) out.push({ url: 'https://a.espncdn.com/i/espn/misc_logos/500/ncaa.png', label: 'NCAA' });
      // the team's (most recent) league, logo from that league's own Wikipedia page
      const MAJOR = { 'National Football League': 'NFL', 'Major League Baseball': 'MLB', 'National Basketball Association': 'NBA', 'National Hockey League': 'NHL' };
      for (const L of (team.leagues || []).slice().reverse()) {
        const url = MAJOR[L.page] ? S.LEAGUE_STAMPS[MAJOR[L.page]] : await S.wikiPageLogo(L.page).catch(() => null);
        const conf = url || (team.college ? (await S.commonsSearch(L.page, 6).catch(() => []))[0]?.url : null);
        if (conf) { out.push({ url: conf, label: L.label }); break; }
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
