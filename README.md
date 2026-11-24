# Pennant Maker

Design team pennants on seven background templates: **Vintage Baseball** (diagonal stripe pairs), **Edge Trim**, **Split Two-Tone**, **College Bands**, **Gridiron**,
**Vintage Hoops** (80s NBA corner wedges + accent stripes) and **Vintage Hockey** (80s NHL inset
wedges, center stripe and logo medallion). Every part can be edited on its own:
the felt, the two-tone spine and its stitching, the ties, the 4 stripes (mirrored A B / B A
by default, staggered A B / A B optional), up to 2 league/conference stamps, the primary
mark, two wordmark lines, extra text and a maker's mark.

## Run it

- **Desktop:** `dist/Pennant Maker 0.1.0.exe` (portable, no install). For development: `npm run desktop`.
- **Web:** double-click `Start Web App.bat`, or run `node server.js` and open http://127.0.0.1:5178

Both need internet access for fonts and logo lookups.

## Modes

- **Automatic:** search a team. Colors, logo, league and conference stamps and the wordmark are filled in.
- **Guided:** a 10-step walkthrough, one part per step, each starting from a suggestion.
- **Manual:** every setting for every part. Click a part on the pennant to jump to it, and drag logos and text to move them.
- **Bulk:** a CSV (download the template from the Bulk tab) plus optional logo files. Produces a ZIP with flat PNGs, SVGs, felt PNGs, 8-bit PNGs, the saved designs and a contact sheet.

## Fonts

233 font styles from 161 Google Fonts families, grouped in the picker (Condensed & gothic, Sans, Block & athletic,
Serif & slab, Script, Retro & pixel) with a filter box. Includes all League Gothic widths (Regular, Semi-Condensed,
Condensed, each with italic) and the full Inter Tight range (Regular to Black, with italics). The catalog lives in
`app/js/fontlist.js`; fonts are embedded into SVG/PNG exports automatically.

## High school logos

High schools aren't in the team databases. The team search and the logo **Find** panel link to MaxPreps
(national directory of US high school teams): find the school, copy the logo's image address and paste it into
**Link** (or the "logo link" field when using your own team).

## Outputs

Flat vector (SVG, fonts embedded), flat PNG, felt mockup PNG (beige wall or transparent), 8-bit PNG.

## Championship banners

The **Pennant | Banner** switch at the top turns the app into a championship banner maker. Banners use the same
team lookup, colors, logos, wordmarks, fonts, layers, swap buttons and auto-fit as pennants.
- Shapes: swallowtail, straight bottom or pointed bottom. Backgrounds: Rafter (team-color felt with a two-line trim),
  Two-Tone (team-color block behind the logo) and Varsity Stripes (stripes down both sides).
- Lettering: the team name (or its wordmark) under the logo, a top line from the league (SUPER BOWL, WORLD SERIES,
  STANLEY CUP, NATIONAL...), CHAMPIONS, and a list of championship years that lines itself up in rows and shrinks to
  stay above the bottom edge. Change any of it in Automatic → Banner lettering or under Manual.
- A top sleeve with stitching, a hanging cord and a wooden rod. Felt, Aged, 8-bit, print PDF (12 in to 6 ft tall),
  tiled home print and cut files all work for banners.
- Bulk: set `template` to `rafter banner`, `two-tone banner` or `varsity banner`, and fill the `kicker`, `title`,
  `years` (separated by `;`) and `shape` columns.
- Switching back and forth keeps each product's own lettering.

## Where logos come from

Nothing is bundled. Logos are fetched on demand, held in memory, and only stored inside design files you save yourself.
1. Your uploads or pasted image links (any site, including SportsLogos.net, works by link)
2. ESPN team feeds: pro leagues, NCAA, major soccer leagues (colors and logos)
3. TheSportsDB: worldwide teams. The free test key is limited. A premium key can be set with
   `localStorage.setItem('pm_tsdb_key', 'YOUR_KEY')` in the browser console.
4. Wikimedia Commons: league, conference and association logos (the stamp **Find** button)
5. Logopedia (logos.fandom.com): logo histories by year. Set **Logo era → Vintage** and a year in Automatic or
   Guided mode (or an `era` column in bulk) to get the logo a team used that season, colors taken from that
   logo, and optionally the team name from that year (1980 Kings → Kansas City Kings). Vintage search also
   finds defunct teams (Whalers, Nordiques, North Stars). The logo **Find** button shows the full history.
6. Wikipedia: minor-league, defunct, arena, indoor and lower-level teams in every sport (MiLB, AHL/ECHL/IHL,
   CBA, Arena Football/af2, USL and more). Every search includes it; picking a result reads the team's infobox for
   its logo, colors, league, years and city, and the league's own logo becomes the stamp. Minor-league hockey,
   basketball and football teams get the matching background.
Team wordmarks: when a team's own lettering is found (Wikimedia Commons, then TheSportsDB) and reads on the felt,
Automatic and Guided put it in place of the big text line and hide the small line. A felt-coloured edge is added when
the background behind it is dark. Turn it off with "Use the team's own wordmark" in Automatic, or untick
**Image instead of text** under Wordmark line 2. With no wordmark, the default lettering is the clean style
(Oswald Medium over Bebas Neue).

7. Link-outs for anything still missing: Fun While It Lasted (funwhileitlasted.net, a defunct-teams database)
   and SportsLogos.net. Drag the logo onto a slot or paste its image address under **Link**.

Logos are fine for mockups and personal use. Selling pennants that carry them needs a license.

## Adding background designs

Templates live in `app/js/engine.js` → `PM.TEMPLATES`. Part rendering reads its geometry from there.

## Note for rebuilding the .exe

On Node 26, Electron's own unzip step stalls during `npm install`. If `node_modules/electron/dist/electron.exe`
is missing, unzip `%LOCALAPPDATA%\electron\Cache\...\electron-v33.4.11-win32-x64.zip` into that folder and
write `electron.exe` into `node_modules/electron/path.txt`. Then `npm run build:win`.

## Posters

A third product behind the **Pennant | Banner | Poster** switch: 2:3 portrait posters in two 80s house styles.

- **Color Frame:** a team-color border, the name in capitals across the top (Jost Medium, classic poster gold when it reads), a thin keyline round the photo, corner logos bottom right.
- **Classic White:** white paper, the name in a serif at the top left (EB Garamond), the team logo top right, a white script signature across the photo, a small league logo and an italic caption along the bottom.

Add a photo (upload, or drop it anywhere on the poster). It is shrunk to 2000 px and always fills its box; Photo → Zoom / Left-right / Up-down frame it. Automatic takes a name, signature and caption, and a team lookup fills the colors and logos. Print sizes run from 8 x 12 in to 24 x 36 in; felt views, felt cut files and bead charts are hidden for posters. Use your own photos or ones you have the rights to.

Posters also come **wide** (landscape, for sideways action shots and team pictures), and the team logo can sit in its usual spot, **see-through in a corner of the photo**, solid in a corner, or not at all (Automatic → Team logo; Manual → Team logo → See-through and the corner arrows).

## Trading cards

A fourth product behind the **Card** switch: 2.5 x 3.5 in cards (5:7) using the same photo tools as posters. The name sits on a team-color band, with the position, team name, team logo, an optional league logo and an optional set logo of your own.

- **Wood Grain '87 (baseball):** the default. A wood-grain border made from noise, the team logo in a white circle at the top left, the name on a team-color plank.
- **Parquet Floor '87 (basketball):** the same card on a gym-floor border. Automatic picks it for basketball teams.
- **Silver Arch (late-80s hoops):** brushed silver, the photo arched across the top, a team-color name band.
- **Clean White (late-80s premium):** white border, a thin team line round the photo, a team-color name bar.

Print sizes: trading card (2.5 x 3.5 in), jumbo (5 x 7 in) and display (7.5 x 10.5 in), each with bleed and a cut line.

### Schedule and game-day posters

Two more poster styles:

- **Schedule Poster:** team color, the logo and team name up top, a season line, and every game on a paper panel (date, VS or @, opponent with their logo, time), with home games shaded. One column for short seasons, up to three for 80+ games. Picking a pro or major college team loads its season from ESPN's public schedule feed with opponent logos. Any other team: **Import calendar file (.ics)** (the export most schedule sites offer) or paste the schedule, one game per line: `Fri Sep 5 | vs | Central | 7:00 PM`, `Sep 12 @ North 7pm`, or rows copied from a schedule table. A score after the opponent (`W 21-14`) shows in the right-hand column.
- **Game Day Poster:** a big photo, GAME DAY, your logo VS (or @) theirs on matching discs, the date and time, and the place. Pick any game from a loaded schedule to fill it in, or type the opponent and use Find for their logo.
