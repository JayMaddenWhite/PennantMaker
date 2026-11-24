/* <pennant-wordmark> — animated two-line script wordmark with pennants flying from the t and the k.
   Drop-in, no dependencies. Usage: <pennant-wordmark aria-label="Pennant Maker"></pennant-wordmark>
   Size it with CSS height (width follows the aspect ratio). Attributes (all optional):
     ink      letters + poles        (default: currentColor)
     outline  pennant/ball outlines  (default: #163a26)
     teams    "random" (default) | "a,b" (two indexes into PennantWordmark.TEAM_SETS)
     wind     0.3–2 (default 1)
     avoid    a #rrggbb background color; random sets whose main color is close to it are skipped
   Each page load draws two different team sets at random. Hover sends a gust through.
   prefers-reduced-motion: pennants are shown raised and still. */
(() => {
  const TEAM_SETS = [
    ['Navy & Gold', '#1d2c5e', '#f2b51c'], ['Forest & Cream', '#1f5c3a', '#f1e6c8'], ['Maroon & Gold', '#6e1a2a', '#e8b020'],
    ['Royal & White', '#1f4fbf', '#ffffff'], ['Kelly & White', '#12893f', '#ffffff'], ['Orange & Navy', '#f26b1d', '#1d2c5e'],
    ['Purple & Gold', '#4b2a7b', '#f2b51c'], ['Scarlet & Gray', '#c8102e', '#c4c4c4'], ['Black & Orange', '#201e1d', '#f26b1d'],
    ['Teal & Black', '#0f8a8a', '#201e1d'], ['Sky & Navy', '#5aa7e0', '#1d2c5e'], ['Cardinal & Cream', '#9e1b32', '#f1e6c8'],
    ['Green & Gold', '#1f5c3a', '#f2b51c'], ['Red & White', '#ec3013', '#f3f2f2'], ['Brown & Orange', '#4e2a1e', '#f26b1d'],
    ['Columbia & Navy', '#9cc3e6', '#1d2c5e'],
  ];
  // Design units = px at a 300px font size. W x H is the artboard; text origin sits at (OX, OY).
  const W = 1510, H = 740, OX = 0, OY = 171, FS = 300;
  const LINE2_X = 620, LINE2_Y = 250, SLANT = 29.5;
  const FLAGS = [
    { ch: 't', x: 0.333, y: 0.253, poleH: 210, L: 330, H: 150, phase: 0, start: 0.25 },
    { ch: 'k', x: 0.363, y: 0.17, poleH: 220, L: 300, H: 136, phase: 1.7, start: 0.53 },
  ];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const E = {
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    elastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  };
  const tween = (ease, from, to, s, e, t) => from + (to - from) * ease(clamp((t - s) / (e - s), 0, 1));

  function edge(L, Hh, A, sag, stretch, T, phase, u0, u1, inset) {
    const N = 30, top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const u = u0 + (u1 - u0) * (i / N);
      const x = u * L * stretch;
      const c = A * Math.pow(u, 1.15) * Math.sin(2 * Math.PI * 1.1 * u - T * 2 * Math.PI * 1.35 + phase) + sag * u * u;
      const hh = Math.max(Hh / 2 * (1 - u) - inset, 0);
      top.push([x, c - hh]); bot.push([x, c + hh]);
    }
    return top.concat(bot.reverse()).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' Z';
  }

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  // Two different sets; any set whose main color is close to `avoid` (the background) is skipped.
  function drawTwo(avoid) {
    let pool = TEAM_SETS.map((_, i) => i);
    if (avoid && /^#[0-9a-f]{6}$/i.test(avoid)) pool = pool.filter((i) => dist(TEAM_SETS[i][1], avoid) > 90);
    const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const b = pool[Math.floor(Math.random() * pool.length)];
    return [a, b];
  }

  function ensureFont() {
    if (document.querySelector('link[data-pennant-wordmark-font]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.pennantWordmarkFont = '';
    l.href = 'https://fonts.googleapis.com/css2?family=Yellowtail&display=swap';
    document.head.appendChild(l);
  }

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent && parent.appendChild(n); return n; };

  class PennantWordmark extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      ensureFont();
      if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
      if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Pennant Maker');
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:inline-block;position:relative;height:58px;aspect-ratio:${W}/${H};line-height:0;vertical-align:middle}
        .art{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;pointer-events:none}
        .line{position:absolute;white-space:nowrap;font:${FS}px/1 "Yellowtail",cursive;color:var(--ink)}
        .flag{position:relative;display:inline-block;transform-origin:50% 78%}
        .flag svg{position:absolute;width:1px;height:1px;overflow:visible}
      </style><div class="art" part="art"></div>`;
      const art = root.querySelector('.art');
      const ink = this.getAttribute('ink') || 'currentColor';
      art.style.setProperty('--ink', ink);
      const outline = this.getAttribute('outline') || '#163a26';
      const want = (this.getAttribute('teams') || 'random').split(',').map(Number);
      const pick = want.length === 2 && want.every((n) => n >= 0 && n < TEAM_SETS.length) && want[0] !== want[1] ? want : drawTwo(this.getAttribute('avoid'));
      this.teams = pick.map((i) => TEAM_SETS[i]);
      this.dataset.teams = this.teams.map((t) => t[0]).join(' / ');
      this.wind = clamp(parseFloat(this.getAttribute('wind')) || 1, 0.3, 2);

      const l1 = document.createElement('div'); l1.className = 'line';
      l1.style.left = OX + 'px'; l1.style.top = OY + 'px';
      const l2 = document.createElement('div'); l2.className = 'line';
      l2.style.left = OX + LINE2_X + 'px'; l2.style.top = OY + LINE2_Y + 'px';
      art.append(l1, l2);
      l1.append('Pennan'); l2.append('Ma');
      this.flags = FLAGS.map((f, i) => {
        const span = document.createElement('span'); span.className = 'flag'; span.textContent = f.ch;
        const svg = el('svg', {}); svg.style.left = f.x + 'em'; svg.style.top = f.y + 'em';
        span.appendChild(svg);
        (i ? l2 : l1).appendChild(span);
        const [, fill, band] = this.teams[i];
        const skew = el('g', { transform: `skewX(${-SLANT})` }, svg);
        const pg = el('g', {}, skew);
        const body = el('path', { fill, stroke: outline, 'stroke-width': 7, 'stroke-linejoin': 'round' }, pg);
        const bandP = el('path', { fill: band, stroke: outline, 'stroke-width': 7, 'stroke-linejoin': 'round' }, pg);
        const stitch = el('path', { fill: 'none', stroke: band, 'stroke-width': 3.5, 'stroke-dasharray': '11 8' }, pg);
        const pole = el('rect', { x: -11, width: 22, fill: ink }, skew);
        const ball = el('circle', { fill: band, stroke: outline, 'stroke-width': 5 }, svg);
        return { ...f, span, pg, body, bandP, stitch, pole, ball };
      });
      l2.append('er');

      const fit = () => { const h = this.clientHeight || 58; art.style.transform = `scale(${h / H})`; };
      this._ro = new ResizeObserver(fit); this._ro.observe(this); fit();

      this._reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._gustAt = 3.2;
      this.addEventListener('pointerenter', () => { const t = this._now(); if (t - this._gustAt > 1.6) this._gustAt = t; });
      const go = () => {
        this._t0 = performance.now();
        if (this._reduced) { this._frame(6, true); return; }
        const loop = () => { this._frame(this._now()); this._raf = requestAnimationFrame(loop); };
        loop();
      };
      this._frame(0);
      (document.fonts ? document.fonts.load(`${FS}px Yellowtail`).catch(() => {}) : Promise.resolve()).then(go);
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); this._built = false; this.shadowRoot && (this.shadowRoot.innerHTML = ''); }
    _now() { return this._t0 ? (performance.now() - this._t0) / 1000 : 0; }
    _frame(T, still) {
      // gusts: one on a timer every ~7s, plus one on hover
      const since = T - this._gustAt;
      if (since > 7) this._gustAt = T;
      const g = clamp(since, 0, 3);
      const gust = still ? 0 : tween(E.inOut, 0, 1, 0, 0.7, g) - tween(E.inOut, 0, 1, 1.1, 2.2, g);
      const wind = this.wind;
      const tex = still ? 0 : T;
      for (const f of this.flags) {
        const s = f.start;
        const sq = still ? 1 : T < s + 0.18 ? tween(E.inOut, 1, 0.84, s, s + 0.18, T) : tween(E.back, 0.84, 1, s + 0.18, s + 0.55, T);
        const P = still ? f.poleH : tween(E.back, 0, f.poleH, s + 0.15, s + 0.6, T);
        const open = still ? 1 : tween(E.elastic, 0, 1, s + 0.5, s + 1.6, T);
        const settle = still ? 0 : tween(E.inOut, 1, 0, s + 0.5, s + 2.2, T);
        const A = (12 + 30 * gust + 26 * settle) * wind * (still ? 0.6 : 1);
        const sag = 34 * (1 - gust) * (1.2 - Math.min(wind, 1));
        const stretch = 1 + 0.07 * gust;
        f.span.style.transform = `scaleY(${sq})`;
        const show = P > 0.5;
        f.pole.style.display = f.ball.style.display = show ? '' : 'none';
        f.pg.style.display = show && open > 0.01 ? '' : 'none';
        if (!show) continue;
        f.pole.setAttribute('y', -P); f.pole.setAttribute('height', P + Math.min(P, 30));
        f.ball.setAttribute('cx', Math.tan(SLANT * Math.PI / 180) * (P + 11));
        f.ball.setAttribute('cy', -P - 11); f.ball.setAttribute('r', Math.min(16, P / 6));
        f.pg.setAttribute('transform', `translate(9 ${-P + 18 + f.H / 2}) scale(${open} ${0.6 + 0.4 * Math.min(open, 1.2)})`);
        const bU = 40 / f.L;
        f.body.setAttribute('d', edge(f.L, f.H, A, sag, stretch, tex, f.phase, 0, 1, 0));
        f.bandP.setAttribute('d', edge(f.L, f.H, A, sag, stretch, tex, f.phase, 0, bU, 0));
        f.stitch.setAttribute('d', edge(f.L, f.H, A, sag, stretch, tex, f.phase, bU + 0.03, 1 - 30 / f.H, 13));
      }
    }
  }
  PennantWordmark.TEAM_SETS = TEAM_SETS;
  if (!customElements.get('pennant-wordmark')) customElements.define('pennant-wordmark', PennantWordmark);
  window.PennantWordmark = PennantWordmark;
})();
