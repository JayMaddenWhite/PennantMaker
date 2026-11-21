// Font catalog (all Google Fonts, loaded on demand).
// Each family: [family, google axis query ('' = default face only), category, faces]
// Each face: [label suffix ('' = plain family name), weight, style, stretch]
//   style: 'normal' | 'italic'   stretch: CSS keyword ('normal', 'semi-condensed', 'condensed', 'extra-condensed', 'expanded')
// A face's display name = family + ' ' + suffix. Plain names keep the weights older designs were saved with.
window.PM = window.PM || {};
(function (PM) {
  const F = (suffix, weight = 400, style = 'normal', stretch = 'normal') => [suffix, weight, style, stretch];
  const one = [F('')];

  const FAMILIES = [
    // ---------- Condensed & gothic ----------
    ['League Gothic', 'wdth@75..100', 'Condensed & gothic', [
      F(''), F('Italic', 400, 'italic'),
      F('Semi-Condensed', 400, 'normal', 'semi-condensed'), F('Semi-Condensed Italic', 400, 'italic', 'semi-condensed'),
      F('Condensed', 400, 'normal', 'condensed'), F('Condensed Italic', 400, 'italic', 'condensed')]],
    ['Oswald', 'wght@200..700', 'Condensed & gothic', [F('', 700), F('Medium', 500), F('Light', 300)]],
    ['Bebas Neue', '', 'Condensed & gothic', one],
    ['Anton', '', 'Condensed & gothic', one],
    ['Antonio', 'wght@100..700', 'Condensed & gothic', [F('', 700)]],
    ['Fjalla One', '', 'Condensed & gothic', one],
    ['Teko', 'wght@300..700', 'Condensed & gothic', [F('', 600), F('Bold', 700)]],
    ['Saira Extra Condensed', 'wght@800;900', 'Condensed & gothic', [F('', 800), F('Black', 900)]],
    ['Saira Condensed', 'wght@700;900', 'Condensed & gothic', [F('', 700), F('Black', 900)]],
    ['Barlow Condensed', 'ital,wght@0,700;0,900;1,700;1,900', 'Condensed & gothic', [F('', 700), F('Black', 900), F('Bold Italic', 700, 'italic'), F('Black Italic', 900, 'italic')]],
    ['Barlow Semi Condensed', 'wght@700;900', 'Condensed & gothic', [F('', 700), F('Black', 900)]],
    ['Roboto Condensed', 'ital,wght@0,100..900;1,100..900', 'Condensed & gothic', [F('', 700), F('Black', 900), F('Bold Italic', 700, 'italic')]],
    ['Fira Sans Extra Condensed', 'ital,wght@0,700;0,900;1,900', 'Condensed & gothic', [F('', 700), F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Pathway Gothic One', '', 'Condensed & gothic', one],
    ['Big Shoulders Display', 'wght@100..900', 'Condensed & gothic', [F('', 800), F('Black', 900)]],
    ['Six Caps', '', 'Condensed & gothic', one],
    ['Sofia Sans Extra Condensed', 'ital,wght@0,1..1000;1,1..1000', 'Condensed & gothic', [F('', 800), F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Mohave', 'wght@300..700', 'Condensed & gothic', [F('', 700)]],
    ['Khand', 'wght@700', 'Condensed & gothic', [F('', 700)]],
    ['Staatliches', '', 'Condensed & gothic', one],
    ['Squada One', '', 'Condensed & gothic', one],
    ['Archivo Narrow', 'ital,wght@0,400..700;1,400..700', 'Condensed & gothic', [F('', 700), F('Bold Italic', 700, 'italic')]],
    ['Yanone Kaffeesatz', 'wght@200..700', 'Condensed & gothic', [F('', 700)]],
    ['BenchNine', 'wght@700', 'Condensed & gothic', [F('', 700)]],
    ['Alumni Sans', 'ital,wght@0,100..900;1,100..900', 'Condensed & gothic', [F('', 800), F('Black Italic', 900, 'italic')]],
    ['Smooch Sans', 'wght@100..900', 'Condensed & gothic', [F('', 800)]],

    // ---------- Sans ----------
    ['Inter Tight', 'ital,wght@0,100..900;1,100..900', 'Sans', [
      F('', 400), F('Medium', 500), F('SemiBold', 600), F('Bold', 700), F('ExtraBold', 800), F('Black', 900),
      F('Italic', 400, 'italic'), F('SemiBold Italic', 600, 'italic'), F('Bold Italic', 700, 'italic'), F('ExtraBold Italic', 800, 'italic'), F('Black Italic', 900, 'italic')]],
    ['Inter', 'ital,opsz,wght@0,14..32,100..900;1,14..32,100..900', 'Sans', [F('Bold', 700), F('ExtraBold', 800), F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Montserrat', 'ital,wght@0,100..900;1,100..900', 'Sans', [F('', 800), F('Bold', 700), F('Black', 900), F('ExtraBold Italic', 800, 'italic'), F('Black Italic', 900, 'italic')]],
    ['Archivo Black', '', 'Sans', one],
    ['Archivo', 'ital,wdth,wght@0,62..125,100..900;1,62..125,100..900', 'Sans', [
      F('Bold', 700), F('Black', 900), F('Black Italic', 900, 'italic'),
      F('Condensed Black', 900, 'normal', 'condensed'), F('Extra Condensed Black', 900, 'normal', 'extra-condensed'), F('Expanded Black', 900, 'normal', 'expanded')]],
    ['Work Sans', 'wght@100..900', 'Sans', [F('Black', 900)]],
    ['Poppins', 'ital,wght@0,700;0,900;1,700;1,900', 'Sans', [F('', 700), F('Black', 900), F('Bold Italic', 700, 'italic'), F('Black Italic', 900, 'italic')]],
    ['Raleway', 'wght@100..900', 'Sans', [F('Black', 900)]],
    ['Rubik', 'ital,wght@0,300..900;1,300..900', 'Sans', [F('Bold', 700), F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Barlow', 'ital,wght@0,800;1,800', 'Sans', [F('ExtraBold', 800), F('ExtraBold Italic', 800, 'italic')]],
    ['Roboto', 'wght@100..900', 'Sans', [F('Black', 900)]],
    ['Lato', 'ital,wght@0,700;0,900;1,900', 'Sans', [F('Bold', 700), F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Open Sans', 'wght@300..800', 'Sans', [F('ExtraBold', 800)]],
    ['Nunito', 'wght@200..1000', 'Sans', [F('Black', 900)]],
    ['DM Sans', 'wght@100..1000', 'Sans', [F('Black', 900)]],
    ['Outfit', 'wght@100..900', 'Sans', [F('Black', 900)]],
    ['Manrope', 'wght@200..800', 'Sans', [F('ExtraBold', 800)]],
    ['Space Grotesk', 'wght@300..700', 'Sans', [F('Bold', 700)]],
    ['Josefin Sans', 'ital,wght@0,100..700;1,100..700', 'Sans', [F('Bold', 700), F('Bold Italic', 700, 'italic')]],
    ['Jost', 'ital,wght@0,100..900;1,100..900', 'Sans', [F('Bold', 700), F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Lexend', 'wght@100..900', 'Sans', [F('Black', 900)]],
    ['Red Hat Display', 'wght@300..900', 'Sans', [F('Black', 900)]],
    ['Exo 2', 'ital,wght@0,100..900;1,100..900', 'Sans', [F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Titillium Web', 'wght@700;900', 'Sans', [F('Bold', 700), F('Black', 900)]],
    ['Chivo', 'ital,wght@0,100..900;1,100..900', 'Sans', [F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Hanken Grotesk', 'wght@100..900', 'Sans', [F('Black', 900)]],
    ['Kanit', 'ital,wght@0,800;0,900;1,800;1,900', 'Sans', [F('ExtraBold', 800), F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['League Spartan', 'wght@100..900', 'Sans', [F('', 800), F('Black', 900)]],
    ['Kumbh Sans', 'wght@100..900', 'Sans', [F('Black', 900)]],

    // ---------- Block, collegiate & athletic ----------
    ['Graduate', '', 'Block & athletic', one],
    ['Jersey 10', '', 'Block & athletic', one],
    ['Jersey 15', '', 'Block & athletic', one],
    ['Jersey 20', '', 'Block & athletic', one],
    ['Jersey 25', '', 'Block & athletic', one],
    ['Bowlby One SC', '', 'Block & athletic', one],
    ['Bowlby One', '', 'Block & athletic', one],
    ['Holtwood One SC', '', 'Block & athletic', one],
    ['Black Ops One', '', 'Block & athletic', one],
    ['Bungee', '', 'Block & athletic', one],
    ['Bungee Inline', '', 'Block & athletic', one],
    ['Bungee Shade', '', 'Block & athletic', one],
    ['Russo One', '', 'Block & athletic', one],
    ['Changa One', 'ital@0;1', 'Block & athletic', [F(''), F('Italic', 400, 'italic')]],
    ['Passion One', 'wght@400;700;900', 'Block & athletic', [F('', 700), F('Black', 900)]],
    ['Titan One', '', 'Block & athletic', one],
    ['Luckiest Guy', '', 'Block & athletic', one],
    ['Bangers', '', 'Block & athletic', one],
    ['Racing Sans One', '', 'Block & athletic', one],
    ['Faster One', '', 'Block & athletic', one],
    ['Fugaz One', '', 'Block & athletic', one],
    ['Audiowide', '', 'Block & athletic', one],
    ['Orbitron', 'wght@400..900', 'Block & athletic', [F('', 900)]],
    ['Michroma', '', 'Block & athletic', one],
    ['Seymour One', '', 'Block & athletic', one],
    ['Chango', '', 'Block & athletic', one],
    ['Days One', '', 'Block & athletic', one],
    ['Krona One', '', 'Block & athletic', one],
    ['Goldman', 'wght@400;700', 'Block & athletic', [F('', 700)]],
    ['Saira Stencil One', '', 'Block & athletic', one],
    ['Allerta Stencil', '', 'Block & athletic', one],
    ['Wallpoet', '', 'Block & athletic', one],

    // ---------- Serif & slab ----------
    ['Alfa Slab One', '', 'Serif & slab', one],
    ['Ultra', '', 'Serif & slab', one],
    ['Rammetto One', '', 'Serif & slab', one],
    ['Abril Fatface', '', 'Serif & slab', one],
    ['Playfair Display', 'ital,wght@0,400..900;1,400..900', 'Serif & slab', [F('', 900), F('Bold', 700), F('Black Italic', 900, 'italic')]],
    ['Caprasimo', '', 'Serif & slab', one],
    ['Fraunces', 'ital,opsz,wght@0,9..144,100..900;1,9..144,100..900', 'Serif & slab', [F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Roboto Slab', 'wght@100..900', 'Serif & slab', [F('Black', 900)]],
    ['Arvo', 'ital,wght@0,700;1,700', 'Serif & slab', [F('Bold', 700), F('Bold Italic', 700, 'italic')]],
    ['Bitter', 'ital,wght@0,100..900;1,100..900', 'Serif & slab', [F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Zilla Slab', 'wght@700', 'Serif & slab', [F('Bold', 700)]],
    ['Rokkitt', 'wght@100..900', 'Serif & slab', [F('Black', 900)]],
    ['Patua One', '', 'Serif & slab', one],
    ['Coustard', 'wght@900', 'Serif & slab', [F('Black', 900)]],
    ['Bevan', '', 'Serif & slab', one],
    ['Bree Serif', '', 'Serif & slab', one],
    ['DM Serif Display', 'ital@0;1', 'Serif & slab', [F(''), F('Italic', 400, 'italic')]],
    ['Yeseva One', '', 'Serif & slab', one],
    ['Bodoni Moda', 'ital,opsz,wght@0,6..96,400..900;1,6..96,400..900', 'Serif & slab', [F('Black', 900), F('Black Italic', 900, 'italic')]],
    ['Libre Baskerville', 'wght@700', 'Serif & slab', [F('Bold', 700)]],
    ['Old Standard TT', 'wght@700', 'Serif & slab', [F('Bold', 700)]],
    ['Cinzel', 'wght@400..900', 'Serif & slab', [F('Black', 900)]],
    ['Cinzel Decorative', 'wght@900', 'Serif & slab', [F('Black', 900)]],
    ['Stint Ultra Condensed', '', 'Serif & slab', one],
    ['Rye', '', 'Serif & slab', one],
    ['Sancreek', '', 'Serif & slab', one],
    ['Smokum', '', 'Serif & slab', one],
    ['Ewert', '', 'Serif & slab', one],
    ['Diplomata SC', '', 'Serif & slab', one],

    // ---------- Script ----------
    ['Yellowtail', '', 'Script', one],
    ['Playball', '', 'Script', one],
    ['Kaushan Script', '', 'Script', one],
    ['Damion', '', 'Script', one],
    ['Mr Dafoe', '', 'Script', one],
    ['Pacifico', '', 'Script', one],
    ['Lobster', '', 'Script', one],
    ['Lobster Two', 'ital,wght@1,700', 'Script', [F('Bold Italic', 700, 'italic')]],
    ['Dancing Script', 'wght@400..700', 'Script', [F('', 700)]],
    ['Satisfy', '', 'Script', one],
    ['Leckerli One', '', 'Script', one],
    ['Oleo Script', 'wght@400;700', 'Script', [F(''), F('Bold', 700)]],
    ['Cookie', '', 'Script', one],
    ['Courgette', '', 'Script', one],
    ['Grand Hotel', '', 'Script', one],
    ['Norican', '', 'Script', one],
    ['Yesteryear', '', 'Script', one],
    ['Rochester', '', 'Script', one],
    ['Arizonia', '', 'Script', one],
    ['Marck Script', '', 'Script', one],
    ['Seaweed Script', '', 'Script', one],
    ['Berkshire Swash', '', 'Script', one],
    ['Molle', 'ital@1', 'Script', [F('', 400, 'italic')]],
    ['Great Vibes', '', 'Script', one],
    ['Sacramento', '', 'Script', one],
    ['Pinyon Script', '', 'Script', one],
    ['Allura', '', 'Script', one],
    ['Alex Brush', '', 'Script', one],
    ['Caveat Brush', '', 'Script', one],
    ['Permanent Marker', '', 'Script', one],
    ['Rock Salt', '', 'Script', one],

    // ---------- Retro & pixel ----------
    ['Monoton', '', 'Retro & pixel', one],
    ['Righteous', '', 'Retro & pixel', one],
    ['Shrikhand', '', 'Retro & pixel', one],
    ['Lilita One', '', 'Retro & pixel', one],
    ['Paytone One', '', 'Retro & pixel', one],
    ['Sigmar One', '', 'Retro & pixel', one],
    ['Fascinate', '', 'Retro & pixel', one],
    ['Fascinate Inline', '', 'Retro & pixel', one],
    ['Chicle', '', 'Retro & pixel', one],
    ['Rubik Mono One', '', 'Retro & pixel', one],
    ['Press Start 2P', '', 'Retro & pixel', one],
    ['VT323', '', 'Retro & pixel', one],
    ['Silkscreen', 'wght@400;700', 'Retro & pixel', [F(''), F('Bold', 700)]],
    ['Pixelify Sans', 'wght@400..700', 'Retro & pixel', [F('Bold', 700)]],
  ];

  PM.FONT_FAMILIES = {};   // family → google axis query
  PM.FONT_DEFS = {};       // display name → { family, weight, style, stretch, cat }
  PM.FONT_CATS = [];       // [category, [names]]
  const cats = {};
  for (const [family, q, cat, faces] of FAMILIES) {
    PM.FONT_FAMILIES[family] = q;
    for (const [suffix, weight, style, stretch] of faces) {
      const name = suffix ? `${family} ${suffix}` : family;
      PM.FONT_DEFS[name] = { family, weight, style, stretch, cat };
      (cats[cat] || (cats[cat] = [])).push(name);
    }
  }
  PM.FONT_CATS = Object.entries(cats);
  PM.FONTS = Object.keys(PM.FONT_DEFS);
  PM.fontDef = (name) => PM.FONT_DEFS[name] || { family: name, weight: 400, style: 'normal', stretch: 'normal', cat: 'Other' };
})(window.PM);
