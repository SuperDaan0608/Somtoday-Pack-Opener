/*
 * Somtoday Pack Opener — art.js
 * Al het getekende werk: het pakje, de kaart (in drie lagen, zodat hij diepte krijgt), de plaatjes en de
 * titels. Alles wordt één keer met Canvas 2D getekend en daarna als tekstuur op de videokaart gezet.
 * Tijdens de animatie wordt hier dus niets meer getekend: dat scheelt veel haperingen.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const { klem } = SPO;

  const F_SPORT = '"SPO Sport", "Arial Narrow", "Arial Black", system-ui, sans-serif';
  const F_DISPLAY = '"SPO Display", "Arial Black", system-ui, sans-serif';
  const F_TEKST = '"SPO Text", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

  const CW = 300; // ontwerpmaat van de kaart
  const CH = 440;
  const PW = 240; // ontwerpmaat van het pakje
  const PH = 360;
  const CIJFER_RECT = [16, 30, 120, 126]; // waar het cijfer op de kaart staat (ontwerpmaat)
  const SCHEUR = 0.2; // het scheurlijntje: zo ver van de bovenkant van het pakje (als deel van de hoogte)

  const nieuw = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  const spatie = (c, px) => {
    if ('letterSpacing' in c) c.letterSpacing = px + 'px';
  };
  const pas = (c, s, maxW) => {
    if (c.measureText(s).width <= maxW) return s;
    while (c.measureText(s + '…').width > maxW && s.length > 3) s = s.slice(0, -1);
    return s + '…';
  };
  // Zet de lettergrootte zo dat de tekst in maxW past (tussen min en max).
  const pasFont = (c, s, stijl, familie, max, min, maxW) => {
    let fs = max;
    c.font = `${stijl} ${fs}px ${familie}`;
    while (fs > min && c.measureText(s).width > maxW) {
      fs -= 1;
      c.font = `${stijl} ${fs}px ${familie}`;
    }
    return fs;
  };
  const rgba = (rgb, a) => `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)},${a})`;

  // ───────────────────────── Lettertypes ─────────────────────────
  let fontBelofte = null;
  function laadLettertypes() {
    if (fontBelofte) return fontBelofte;
    fontBelofte = (async () => {
      try {
        if (!window.FontFace || !document.fonts) return;
        const api = typeof browser !== 'undefined' && browser.runtime ? browser : typeof chrome !== 'undefined' ? chrome : null;
        const basis = api && api.runtime && api.runtime.getURL ? api.runtime.getURL('fonts/') : 'fonts/';
        const lijst = [
          ['SPO Display', 'unbounded.woff2', { weight: '200 900' }],
          ['SPO Text', 'inter.woff2', { weight: '100 900' }],
          ['SPO Sport', 'sport-600.woff2', { weight: '600' }],
          ['SPO Sport', 'sport-800.woff2', { weight: '800' }],
          ['SPO Sport', 'sport-800-italic.woff2', { weight: '800', style: 'italic' }],
          ['SPO Sport', 'sport-900-italic.woff2', { weight: '900', style: 'italic' }],
        ];
        // wat content.js al heeft geladen (de afdekking gebruikt Unbounded en Inter) laden we niet nog eens
        const aanwezig = (n, o) => [...document.fonts].some((x) => x.family.replace(/["']/g, '') === n && x.weight === (o.weight || 'normal') && x.style === (o.style || 'normal'));
        await Promise.race([
          Promise.all(
            lijst.map(([n, f, o]) =>
              aanwezig(n, o)
                ? Promise.resolve()
                : new FontFace(n, `url("${basis}${f}")`, o).load().then((ff) => document.fonts.add(ff)),
            ),
          ),
          new Promise((r) => setTimeout(r, 2500)),
        ]);
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
      } catch (e) {
        /* dan maar systeemletters */
      }
    })();
    return fontBelofte;
  }

  // ───────────────────────── Pictogrammen per vak ─────────────────────────
  // Alles in een vierkant van -1 tot 1, met de huidige lijnkleur.
  const ICONEN = {
    pi(c) {
      c.beginPath();
      c.moveTo(-0.8, -0.5);
      c.quadraticCurveTo(0, -0.64, 0.82, -0.46);
      c.moveTo(-0.38, -0.54);
      c.quadraticCurveTo(-0.46, 0.1, -0.62, 0.72);
      c.moveTo(0.2, -0.56);
      c.quadraticCurveTo(0.17, 0.32, 0.36, 0.66);
      c.quadraticCurveTo(0.48, 0.8, 0.68, 0.62);
      c.stroke();
    },
    boek(c) {
      c.beginPath();
      c.moveTo(0, -0.55);
      c.quadraticCurveTo(-0.45, -0.8, -0.92, -0.55);
      c.lineTo(-0.92, 0.55);
      c.quadraticCurveTo(-0.45, 0.32, 0, 0.58);
      c.quadraticCurveTo(0.45, 0.32, 0.92, 0.55);
      c.lineTo(0.92, -0.55);
      c.quadraticCurveTo(0.45, -0.8, 0, -0.55);
      c.moveTo(0, -0.55);
      c.lineTo(0, 0.58);
      for (const y of [-0.22, 0.04]) {
        c.moveTo(-0.76, y - 0.08);
        c.lineTo(-0.2, y + 0.04);
        c.moveTo(0.2, y + 0.04);
        c.lineTo(0.76, y - 0.08);
      }
      c.stroke();
    },
    taal(c) {
      c.beginPath();
      c.moveTo(-0.55, -0.72);
      c.lineTo(0.55, -0.72);
      c.quadraticCurveTo(0.92, -0.72, 0.92, -0.35);
      c.lineTo(0.92, 0.1);
      c.quadraticCurveTo(0.92, 0.45, 0.55, 0.45);
      c.lineTo(0.0, 0.45);
      c.lineTo(-0.5, 0.86);
      c.lineTo(-0.42, 0.45);
      c.lineTo(-0.55, 0.45);
      c.quadraticCurveTo(-0.92, 0.45, -0.92, 0.1);
      c.lineTo(-0.92, -0.35);
      c.quadraticCurveTo(-0.92, -0.72, -0.55, -0.72);
      c.moveTo(-0.55, -0.35);
      c.lineTo(0.55, -0.35);
      c.moveTo(-0.55, -0.1);
      c.lineTo(0.3, -0.1);
      c.moveTo(-0.55, 0.15);
      c.lineTo(0.45, 0.15);
      c.stroke();
    },
    tempel(c) {
      c.beginPath();
      c.moveTo(-0.95, -0.2);
      c.lineTo(0, -0.85);
      c.lineTo(0.95, -0.2);
      c.closePath();
      c.moveTo(-0.85, -0.05);
      c.lineTo(0.85, -0.05);
      for (const x of [-0.65, -0.22, 0.22, 0.65]) {
        c.moveTo(x, 0.05);
        c.lineTo(x, 0.58);
      }
      c.moveTo(-0.95, 0.68);
      c.lineTo(0.95, 0.68);
      c.moveTo(-1, 0.86);
      c.lineTo(1, 0.86);
      c.stroke();
    },
    wereld(c) {
      c.beginPath();
      c.arc(0, 0, 0.88, 0, 6.2832);
      c.moveTo(0, -0.88);
      c.lineTo(0, 0.88);
      c.moveTo(-0.88, 0);
      c.lineTo(0.88, 0);
      c.stroke();
      c.beginPath();
      c.ellipse(0, 0, 0.4, 0.88, 0, 0, 6.2832);
      c.stroke();
      c.save();
      c.beginPath();
      c.arc(0, 0, 0.88, 0, 6.2832);
      c.clip();
      c.beginPath();
      c.ellipse(0, -0.95, 1.2, 0.6, 0, 0, 6.2832);
      c.ellipse(0, 0.95, 1.2, 0.6, 0, 0, 6.2832);
      c.stroke();
      c.restore();
    },
    grafiek(c) {
      c.beginPath();
      c.rect(-0.85, 0.05, 0.4, 0.7);
      c.rect(-0.2, -0.25, 0.4, 1.0);
      c.rect(0.45, -0.55, 0.4, 1.3);
      c.stroke();
      c.beginPath();
      c.moveTo(-0.9, -0.2);
      c.lineTo(-0.25, -0.55);
      c.lineTo(0.15, -0.35);
      c.lineTo(0.85, -0.85);
      c.moveTo(0.55, -0.85);
      c.lineTo(0.85, -0.85);
      c.lineTo(0.85, -0.55);
      c.stroke();
    },
    weegschaal(c) {
      c.beginPath();
      c.moveTo(0, -0.85);
      c.lineTo(0, 0.7);
      c.moveTo(-0.5, 0.85);
      c.lineTo(0.5, 0.85);
      c.moveTo(-0.9, -0.55);
      c.lineTo(0.9, -0.55);
      for (const s of [-1, 1]) {
        c.moveTo(s * 0.9, -0.55);
        c.lineTo(s * 1.0, 0.05);
        c.moveTo(s * 0.9, -0.55);
        c.lineTo(s * 0.5, 0.05);
        c.moveTo(s * 1.0, 0.05);
        c.quadraticCurveTo(s * 0.75, 0.38, s * 0.5, 0.05);
        c.closePath();
      }
      c.stroke();
    },
    kompas(c) {
      c.beginPath();
      c.arc(0, 0, 0.88, 0, 6.2832);
      c.stroke();
      c.beginPath();
      c.moveTo(0, -0.72);
      c.lineTo(0.17, 0);
      c.lineTo(0, 0.72);
      c.lineTo(-0.17, 0);
      c.closePath();
      c.moveTo(-0.72, 0);
      c.lineTo(0, -0.17);
      c.lineTo(0.72, 0);
      c.lineTo(0, 0.17);
      c.closePath();
      c.stroke();
    },
    atoom(c) {
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate((i * Math.PI) / 3);
        c.beginPath();
        c.ellipse(0, 0, 0.92, 0.34, 0, 0, 6.2832);
        c.stroke();
        c.beginPath();
        c.arc(0.92 * Math.cos(i * 1.7), 0.34 * Math.sin(i * 1.7), 0.075, 0, 6.2832);
        c.fill();
        c.restore();
      }
      c.beginPath();
      c.arc(0, 0, 0.17, 0, 6.2832);
      c.fill();
    },
    kolf(c) {
      c.beginPath();
      c.moveTo(-0.22, -0.88);
      c.lineTo(-0.22, -0.2);
      c.lineTo(-0.84, 0.62);
      c.quadraticCurveTo(-0.97, 0.88, -0.7, 0.88);
      c.lineTo(0.7, 0.88);
      c.quadraticCurveTo(0.97, 0.88, 0.84, 0.62);
      c.lineTo(0.22, -0.2);
      c.lineTo(0.22, -0.88);
      c.moveTo(-0.34, -0.88);
      c.lineTo(0.34, -0.88);
      c.moveTo(-0.55, 0.28);
      c.quadraticCurveTo(-0.2, 0.18, 0.1, 0.3);
      c.quadraticCurveTo(0.35, 0.4, 0.58, 0.28);
      c.stroke();
      c.beginPath();
      c.arc(-0.12, 0.58, 0.09, 0, 6.2832);
      c.arc(0.22, 0.5, 0.06, 0, 6.2832);
      c.arc(0.02, 0.1, 0.05, 0, 6.2832);
      c.fill();
    },
    blad(c) {
      c.beginPath();
      c.moveTo(-0.82, 0.82);
      c.quadraticCurveTo(-0.95, -0.55, 0.82, -0.82);
      c.quadraticCurveTo(0.98, 0.72, -0.82, 0.82);
      c.closePath();
      c.moveTo(-0.82, 0.82);
      c.quadraticCurveTo(-0.2, 0.2, 0.5, -0.5);
      for (const [x, y, dx, dy] of [[-0.45, 0.38, 0.1, -0.35], [-0.12, 0.05, 0.12, -0.38], [0.18, -0.25, 0.14, -0.34], [-0.4, 0.5, 0.36, 0.1], [-0.05, 0.2, 0.4, 0.08]]) {
        c.moveTo(x, y);
        c.lineTo(x + dx, y + dy);
      }
      c.stroke();
    },
    code(c) {
      c.beginPath();
      c.moveTo(-0.34, -0.56);
      c.lineTo(-0.88, 0);
      c.lineTo(-0.34, 0.56);
      c.moveTo(0.34, -0.56);
      c.lineTo(0.88, 0);
      c.lineTo(0.34, 0.56);
      c.moveTo(0.16, -0.72);
      c.lineTo(-0.16, 0.72);
      c.stroke();
    },
    palet(c) {
      c.beginPath();
      c.moveTo(0.1, -0.8);
      c.bezierCurveTo(-0.7, -0.9, -1.0, 0, -0.62, 0.55);
      c.bezierCurveTo(-0.35, 0.92, 0.05, 0.62, 0.22, 0.5);
      c.bezierCurveTo(0.45, 0.35, 0.65, 0.78, 0.82, 0.6);
      c.bezierCurveTo(1.05, 0.3, 0.98, -0.7, 0.1, -0.8);
      c.closePath();
      c.stroke();
      for (const [x, y] of [[-0.38, -0.2], [-0.05, -0.5], [0.4, -0.3], [-0.5, 0.25]]) {
        c.beginPath();
        c.arc(x, y, 0.1, 0, 6.2832);
        c.fill();
      }
    },
    noot(c) {
      c.beginPath();
      c.moveTo(-0.42, 0.45);
      c.lineTo(-0.42, -0.62);
      c.lineTo(0.5, -0.8);
      c.lineTo(0.5, 0.28);
      c.moveTo(-0.42, -0.3);
      c.lineTo(0.5, -0.48);
      c.stroke();
      for (const [x, y] of [[-0.62, 0.52], [0.3, 0.35]]) {
        c.beginPath();
        c.ellipse(x, y, 0.27, 0.2, -0.35, 0, 6.2832);
        c.fill();
      }
    },
    bal(c) {
      c.beginPath();
      c.arc(0, 0, 0.88, 0, 6.2832);
      c.stroke();
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const x = Math.cos(a) * 0.34;
        const y = Math.sin(a) * 0.34;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
        c.moveTo(x, y);
      }
      c.closePath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        c.moveTo(Math.cos(a) * 0.34, Math.sin(a) * 0.34);
        c.lineTo(Math.cos(a) * 0.86, Math.sin(a) * 0.86);
      }
      c.stroke();
    },
    pet(c) {
      c.beginPath();
      c.moveTo(0, -0.62);
      c.lineTo(0.98, -0.17);
      c.lineTo(0, 0.28);
      c.lineTo(-0.98, -0.17);
      c.closePath();
      c.moveTo(-0.58, 0.04);
      c.lineTo(-0.58, 0.52);
      c.quadraticCurveTo(0, 0.9, 0.58, 0.52);
      c.lineTo(0.58, 0.04);
      c.moveTo(0.98, -0.17);
      c.lineTo(0.98, 0.45);
      c.stroke();
      c.beginPath();
      c.arc(0.98, 0.52, 0.08, 0, 6.2832);
      c.fill();
    },
  };

  function icoonVoorVak(vak) {
    const v = vak.toLowerCase();
    const reeks = [
      [/wiskunde|rekenen|statistiek|^wis\b/, 'pi'],
      [/nederlands|taal|lezen|schrijven|literatuur|spelling/, 'boek'],
      [/engels|frans|duits|spaans|latijn|grieks|chinees|russisch|italiaans|arabisch|turks|fries|moderne/, 'taal'],
      [/geschiedenis|oudheid|historie/, 'tempel'],
      [/aardrijkskunde|geografie/, 'wereld'],
      [/economie|bedrijf|management|boekhouden|handel|administratie/, 'grafiek'],
      [/maatschappij|burgerschap|recht|sociale/, 'weegschaal'],
      [/levensbeschouw|godsdienst|religie|filosofie|ethiek/, 'kompas'],
      [/natuurkunde|nask|fysica|techniek|technologie|natuur/, 'atoom'],
      [/scheikunde|chemie/, 'kolf'],
      [/biologie|verzorging|zorg|landbouw/, 'blad'],
      [/informatica|programmeren|ict|computer|digital/, 'code'],
      [/muziek/, 'noot'],
      [/kunst|ckv|teken|handvaardigheid|beeldend|drama|cultuur/, 'palet'],
      [/lichamelijk|^lo$|gym|sport|beweg/, 'bal'],
    ];
    for (const [re, naam] of reeks) if (re.test(v)) return naam;
    return 'pet';
  }

  function icoon(c, naam, x, y, s, lw) {
    c.save();
    c.translate(x, y);
    c.scale(s / 2, s / 2);
    c.lineWidth = lw / (s / 2);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    (ICONEN[naam] || ICONEN.pet)(c);
    c.restore();
  }

  // ───────────────────────── De kaart ─────────────────────────
  // De vorm van de kaart (ontwerpmaat, linksboven is de oorsprong). ins krimpt de vorm naar binnen.
  function kaartPad(c, ins) {
    c.save();
    if (ins) {
      c.translate(CW / 2, CH / 2);
      c.scale((CW - 2 * ins) / CW, (CH - 2 * ins) / CH);
      c.translate(-CW / 2, -CH / 2);
    }
    c.beginPath();
    c.moveTo(0, 44);
    c.quadraticCurveTo(6, 6, 44, 0);
    c.lineTo(92, 0);
    c.quadraticCurveTo(150, 22, 208, 0);
    c.lineTo(256, 0);
    c.quadraticCurveTo(294, 6, 300, 44);
    c.lineTo(300, 364);
    c.quadraticCurveTo(300, 418, 150, 440);
    c.quadraticCurveTo(0, 418, 0, 364);
    c.closePath();
    c.restore();
  }

  // ── kleuren (0-255) ──
  const WIT = [255, 255, 255];
  const ZWART = [0, 0, 0];
  const hex = (h) => {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.replace(/./g, (m) => m + m);
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  };
  const k255 = (k) => [k[0] * 255, k[1] * 255, k[2] * 255];
  const mixk = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const kcss = (k, a = 1) => `rgba(${Math.round(k[0])},${Math.round(k[1])},${Math.round(k[2])},${a})`;
  const lumi = (k) => (0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2]) / 255;
  const lichter = (k, t) => mixk(k, WIT, t);
  const donkerder = (k, t) => mixk(k, ZWART, t);
  const maakRng = (zaad) => {
    let s = Math.abs(Math.floor(zaad)) % 2147483647;
    if (s <= 0) s = 12345;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  };
  // Een kleurverloop uit een lijst [positie, kleur, alpha?].
  const verloop = (g, stops) => {
    for (const s of stops) g.addColorStop(s[0], kcss(s[1], s[2] == null ? 1 : s[2]));
    return g;
  };

  // De stijl van één kaart: alle kleuren komen uit het kleurthema (T.pal en T.tekst) en uit de kleuren van het niveau.
  function kaartStijl(data) {
    const T = data.T;
    const tier = data.tier;
    const pal = T.pal.map(hex);
    const thema = !!(SPO.TIERS && SPO.TIERS[tier] && T.pal !== SPO.TIERS[tier].pal);
    const tek = hex(T.tekst);
    const tekLicht = lumi(tek) > 0.5;
    const d = pal[0];
    const m = pal[1];
    const l = pal[2];
    const kl = k255(T.kleur);
    const kl2 = k255(T.kleur2);
    // lichtkleuren: bij een eigen thema komen ze uit het thema, anders uit het niveau
    const acc = thema ? lichter(mixk(m, l, 0.7), 0.25) : kl;
    const acc2 = thema ? lichter(mixk(m, l, 0.35), 0.2) : kl2;
    let zaad = 7;
    for (const ch of data.vak) zaad += ch.charCodeAt(0) * 13;
    return {
      tier,
      thema,
      d,
      m,
      l,
      hi: lichter(l, 0.55),
      lo: donkerder(d, 0.4),
      tek,
      tekLicht,
      acc,
      acc2,
      oro: thema ? mixk(m, l, 0.55) : [200, 150, 46],
      kl,
      kl2,
      zaad,
      rng: maakRng(zaad * 31 + tier * 977),
      // de plaat onderaan: licht bij donkere tekst, donker bij lichte tekst (dan blijft alles leesbaar, ook met een eigen thema)
      plaat0: tekLicht ? donkerder(mixk(d, m, 0.25), 0.3) : lichter(mixk(m, l, 0.7), 0.3),
      plaat1: tekLicht ? donkerder(d, 0.55) : lichter(mixk(m, l, 0.35), 0.15),
    };
  }

  // Ruis: één klein tegeltje met willekeurige grijswaarden, dat we uitrekken en over de kaart leggen (geborsteld metaal, korrel, parelmoer).
  let ruisBron = null;
  function ruisTegel() {
    if (ruisBron) return ruisBron;
    const cv = nieuw(256, 256);
    const x = cv.getContext('2d');
    const im = x.createImageData(256, 256);
    const r = maakRng(424242);
    for (let i = 0; i < 256 * 256; i++) {
      const v = Math.floor(r() * 256);
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
      im.data[i * 4 + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return (ruisBron = cv);
  }
  // sx, sy: hoe ver het tegeltje wordt uitgerekt (sx groot = lange horizontale strepen)
  function ruis(c, a, modus, sx, sy, x0 = 0, y0 = 0, w = CW, h = CH) {
    const t = ruisTegel();
    const tw = (256 / 3.2) * sx;
    const th = (256 / 3.2) * sy;
    c.save();
    c.beginPath();
    c.rect(x0, y0, w, h);
    c.clip();
    c.globalAlpha = a;
    c.globalCompositeOperation = modus;
    for (let y = y0; y < y0 + h; y += th) for (let x = x0; x < x0 + w; x += tw) c.drawImage(t, x, y, tw, th);
    c.restore();
  }

  // De omtrek van de kaart als rij punten (met raaklijn en naar binnen wijzende normaal): voor kralen, klinknagels en sierranden.
  let omtrekBron = null;
  function omtrek() {
    if (omtrekBron) return omtrekBron;
    const P = [];
    const lijn = (x0, y0, x1, y1) => {
      for (let i = 0; i < 8; i++) P.push([x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8]);
    };
    const kw = (x0, y0, cx, cy, x1, y1) => {
      for (let i = 0; i < 24; i++) {
        const t = i / 24;
        const u = 1 - t;
        P.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
      }
    };
    kw(0, 44, 6, 6, 44, 0);
    lijn(44, 0, 92, 0);
    kw(92, 0, 150, 22, 208, 0);
    lijn(208, 0, 256, 0);
    kw(256, 0, 294, 6, 300, 44);
    lijn(300, 44, 300, 364);
    kw(300, 364, 300, 418, 150, 440);
    kw(150, 440, 0, 418, 0, 364);
    lijn(0, 364, 0, 44);
    return (omtrekBron = P);
  }
  function randPunten(ins, stap, start = 0) {
    const P = omtrek();
    const sx = (CW - 2 * ins) / CW;
    const sy = (CH - 2 * ins) / CH;
    const Q = P.map((p) => [CW / 2 + (p[0] - CW / 2) * sx, CH / 2 + (p[1] - CH / 2) * sy]);
    const n = Q.length;
    const cum = [0];
    for (let i = 0; i < n; i++) {
      const a = Q[i];
      const b = Q[(i + 1) % n];
      cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const totaal = cum[n];
    const aantal = Math.max(4, Math.round(totaal / stap));
    const uit = [];
    let j = 0;
    for (let k = 0; k < aantal; k++) {
      const s = ((k + start) * totaal) / aantal;
      const ss = s % totaal;
      while (j < n - 1 && cum[j + 1] <= ss) j++;
      if (ss < cum[j]) j = 0;
      while (j < n - 1 && cum[j + 1] <= ss) j++;
      const a = Q[j];
      const b = Q[(j + 1) % n];
      const dl = Math.max(1e-6, cum[j + 1] - cum[j]);
      const f = (ss - cum[j]) / dl;
      const tx = (b[0] - a[0]) / dl;
      const ty = (b[1] - a[1]) / dl;
      uit.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, tx, ty, nx: -ty, ny: tx, s: ss, k });
    }
    return uit;
  }

  // Een vierpuntige schitterster.
  function ster4(c, x, y, r, dik = 0.16) {
    c.beginPath();
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x + r * dik, y - r * dik, x + r, y);
    c.quadraticCurveTo(x + r * dik, y + r * dik, x, y + r);
    c.quadraticCurveTo(x - r * dik, y + r * dik, x - r, y);
    c.quadraticCurveTo(x - r * dik, y - r * dik, x, y - r);
    c.closePath();
  }
  const cirkel = (c, x, y, r) => {
    c.beginPath();
    c.arc(x, y, r, 0, 6.2832);
  };
  // Een koepelvormige kraal of klinknagel: een radiaal verloop met een glanspunt.
  function kraal(c, x, y, r, licht, midden, donker) {
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, kcss(licht));
    g.addColorStop(0.45, kcss(midden));
    g.addColorStop(1, kcss(donker));
    c.fillStyle = g;
    cirkel(c, x, y, r);
    c.fill();
  }
  // Een veelhoek met n hoeken.
  function veelhoek(c, x, y, r, n, rot) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
    c.closePath();
  }

  // Een ingelegde lijn langs de rand: licht aan de ene kant en donker aan de andere (reliëf). neerwaarts = een groef.
  function schuin(c, ins, w, hi, lo, o = 0.7) {
    c.save();
    c.lineWidth = w;
    c.translate(-o, -o);
    kaartPad(c, ins);
    c.strokeStyle = hi;
    c.stroke();
    c.translate(o * 2, o * 2);
    kaartPad(c, ins);
    c.strokeStyle = lo;
    c.stroke();
    c.restore();
  }

  // Een pictogram als gepolijst metaal: een buis met schaduw, donkere rand, verloop en een lichtlijntje.
  function icoonMetaal(c, naam, x, y, s, lw, kl, extra = {}) {
    const f = ICONEN[naam] || ICONEN.pet;
    const lok = lw / (s / 2);
    const pas1 = (stijl, breedte, dx, dy) => {
      c.save();
      c.translate(x + dx, y + dy);
      c.scale(s / 2, s / 2);
      c.lineWidth = breedte / (s / 2);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = stijl;
      c.fillStyle = stijl;
      f(c);
      c.restore();
    };
    // schaduw
    c.save();
    c.shadowColor = extra.schaduw || 'rgba(0,0,0,.5)';
    c.shadowBlur = (extra.blur == null ? 7 : extra.blur) * (extra.px || 1);
    c.shadowOffsetY = 3 * (extra.px || 1);
    pas1('rgba(0,0,0,.55)', lw + 1.6, 0, 0);
    c.restore();
    pas1(kcss(kl.rand), lw + 1.8, 0, 0);
    // lichaam: verloop van boven naar onder, in lokale coordinaten
    c.save();
    c.translate(x, y);
    c.scale(s / 2, s / 2);
    c.lineWidth = lok;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const g = c.createLinearGradient(-0.5, -1, 0.5, 1);
    verloop(g, [[0, kl.licht], [0.4, kl.midden], [0.55, kl.diep], [1, kl.midden]]);
    c.strokeStyle = g;
    c.fillStyle = g;
    f(c);
    c.restore();
    // glans
    pas1(kcss(kl.glans, 0.8), Math.max(0.7, lw * 0.26), -lw * 0.16, -lw * 0.2);
  }

  const BS = 3.2; // pixels per ontwerp-eenheid voor achtergrond en voorgrond
  const MS = 2; // idem voor het masker
  const MIDS = 2.4; // idem voor de middenlaag
  const HX = 190; // het hart van de kaart: hier staat het embleem van het vak
  const HY = 150;
  const RIM = 9; // dikte van de rand
  const PLAAT_Y = 266; // hier begint de naamplaat

  // ── het materiaal van elk niveau ──
  const FOND = [
    // Brons: geborsteld, gehamerd en gepatineerd
    (c, st) => {
      const { d, m, l, rng } = st;
      c.fillStyle = verloop(c.createLinearGradient(0, 0, CW * 0.75, CH), [
        [0, mixk(m, l, 0.5)],
        [0.2, l],
        [0.45, m],
        [0.75, mixk(d, m, 0.55)],
        [1, donkerder(d, 0.15)],
      ]);
      c.fillRect(0, 0, CW, CH);
      ruis(c, 0.45, 'overlay', 9, 0.7);
      ruis(c, 0.28, 'soft-light', 1.2, 1.2);
      // gehamerd: een lichte boog links boven en een donkere rechts onder, per deukje
      c.lineWidth = 0.7;
      let lichtP = new Path2D();
      let donkerP = new Path2D();
      for (let i = 0; i < 340; i++) {
        const x = rng() * CW;
        const y = rng() * CH;
        const s = 1.6 + rng() * 3.6;
        lichtP.moveTo(x + Math.cos(Math.PI * 0.95) * s, y + Math.sin(Math.PI * 0.95) * s);
        lichtP.arc(x, y, s, Math.PI * 0.95, Math.PI * 1.75);
        donkerP.moveTo(x + s, y);
        donkerP.arc(x, y, s, 0, Math.PI * 0.75);
      }
      c.strokeStyle = kcss(lichter(l, 0.5), 0.16);
      c.stroke(lichtP);
      c.strokeStyle = kcss(donkerder(d, 0.5), 0.17);
      c.stroke(donkerP);
      // patina: groenblauwe vlekken in de hoeken en langs de randen
      const pk = st.thema ? mixk(m, [70, 150, 140], 0.3) : [72, 158, 138];
      for (let i = 0; i < 18; i++) {
        const x = rng() * CW;
        const y = rng() * CH;
        const rand = Math.min(1, Math.hypot((x - 150) / 150, (y - 220) / 220));
        const r = 16 + rng() * 34;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, kcss(pk, 0.06 + 0.3 * rand * rand));
        g.addColorStop(1, kcss(pk, 0));
        c.fillStyle = g;
        c.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      ruis(c, 0.22, 'overlay', 1, 1);
    },
    // Zilver: gepolijst chroom met een scherpe horizon
    (c, st) => {
      const { d, m, l } = st;
      const koel = st.thema ? l : mixk(l, [190, 215, 255], 0.5);
      c.fillStyle = verloop(c.createLinearGradient(0, 30, 70, 420), [
        [0, mixk(l, WIT, 0.5)],
        [0.22, koel],
        [0.4, mixk(m, l, 0.35)],
        [0.455, mixk(d, m, 0.35)],
        [0.5, mixk(l, WIT, 0.7)],
        [0.62, mixk(m, l, 0.55)],
        [0.85, l],
        [1, mixk(m, d, 0.25)],
      ]);
      c.fillRect(0, 0, CW, CH);
      // brede zachte weerspiegelingen
      c.save();
      c.rotate(0.5);
      for (const [x, w, a] of [[140, 36, 0.3], [230, 12, 0.35], [-10, 60, 0.18], [310, 40, 0.14]]) {
        c.fillStyle = verloop(c.createLinearGradient(x, 0, x + w, 0), [[0, WIT, 0], [0.5, WIT, a], [1, WIT, 0]]);
        c.fillRect(x, -200, w, 900);
      }
      c.restore();
      ruis(c, 0.4, 'overlay', 5, 0.8);
      ruis(c, 0.18, 'soft-light', 1, 1);
    },
    // Goud: glanzend, met twee heldere banen licht
    (c, st) => {
      const { d, m, l } = st;
      c.fillStyle = verloop(c.createLinearGradient(0, 0, CW * 0.95, CH * 0.8), [
        [0, mixk(m, l, 0.3)],
        [0.1, mixk(m, l, 0.8)],
        [0.26, m],
        [0.45, mixk(m, l, 0.65)],
        [0.6, mixk(d, m, 0.8)],
        [0.82, mixk(d, m, 0.4)],
        [1, donkerder(d, 0.1)],
      ]);
      c.fillRect(0, 0, CW, CH);
      const g = c.createRadialGradient(HX, HY, 0, HX, HY, 150);
      g.addColorStop(0, kcss(lichter(l, 0.5), 0.34));
      g.addColorStop(1, kcss(l, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, CW, CH);
      ruis(c, 0.32, 'overlay', 3, 1);
      ruis(c, 0.16, 'soft-light', 1, 1);
    },
    // Speciaal: diep, met een gloeiende kern
    (c, st) => {
      const { d, m, l, acc } = st;
      c.fillStyle = verloop(c.createLinearGradient(0, 0, 0, CH), [
        [0, mixk(d, m, 0.35)],
        [0.5, mixk(d, m, 0.7)],
        [1, donkerder(d, 0.2)],
      ]);
      c.fillRect(0, 0, CW, CH);
      for (const [x, y, r, k, a] of [[HX, HY, 190, mixk(m, l, 0.55), 0.85], [60, 360, 150, m, 0.35], [280, 40, 120, mixk(m, acc, 0.4), 0.3]]) {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, kcss(k, a));
        g.addColorStop(1, kcss(k, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, CW, CH);
      }
      ruis(c, 0.2, 'overlay', 1, 1);
    },
    // Icoon: parelmoer met pastelwassingen
    (c, st) => {
      const { d, m, l, acc, acc2 } = st;
      c.fillStyle = verloop(c.createLinearGradient(0, 0, CW, CH), [
        [0, mixk(m, l, 0.25)],
        [0.3, mixk(m, l, 0.7)],
        [0.62, m],
        [1, mixk(m, d, 0.45)],
      ]);
      c.fillRect(0, 0, CW, CH);
      const wass = st.thema
        ? [[60, 90, mixk(l, acc, 0.5)], [250, 160, mixk(l, acc2, 0.5)], [90, 340, mixk(m, acc, 0.5)], [235, 390, mixk(l, WIT, 0.3)]]
        : [[60, 90, [255, 150, 210]], [250, 160, [120, 220, 255]], [90, 340, [190, 150, 255]], [235, 390, [255, 230, 140]]];
      for (const [x, y, k] of wass) {
        const g = c.createRadialGradient(x, y, 0, x, y, 175);
        g.addColorStop(0, kcss(k, 0.42));
        g.addColorStop(1, kcss(k, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, CW, CH);
      }
      ruis(c, 0.22, 'soft-light', 2, 2);
      ruis(c, 0.12, 'overlay', 5, 0.6);
    },
  ];

  // De kleuren van het embleem (het pictogram als metaal) per niveau.
  function embleemKleuren(st) {
    const { tier, d, m, l, acc } = st;
    const veld = lumi(mixk(m, l, 0.4));
    const donkerVeld = veld < 0.3;
    if (tier === 0 || tier === 2) {
      if (donkerVeld) return { licht: WIT, midden: lichter(l, 0.45), diep: mixk(m, l, 0.55), rand: donkerder(d, 0.6), glans: WIT };
      if (tier === 0) return { licht: lichter(l, 0.35), midden: mixk(l, m, 0.5), diep: mixk(m, d, 0.5), rand: donkerder(d, 0.45), glans: lichter(l, 0.8) };
      return { licht: lichter(l, 0.6), midden: mixk(m, l, 0.45), diep: mixk(d, m, 0.45), rand: donkerder(d, 0.4), glans: lichter(l, 0.9) };
    }
    if (tier === 1) return { licht: WIT, midden: mixk(l, m, 0.2), diep: mixk(m, d, 0.2), rand: donkerder(d, 0.55), glans: WIT };
    if (tier === 3) return { licht: lichter(acc, 0.6), midden: acc, diep: mixk(acc, m, 0.55), rand: donkerder(d, 0.4), glans: WIT };
    const o = st.oro;
    const lichtO = lumi(o) > 0.35;
    return { licht: lichter(o, 0.55), midden: o, diep: donkerder(o, 0.3), rand: donkerder(lichtO ? o : d, 0.62), glans: WIT };
  }

  // ── het podium van het embleem op de achtergrond ──
  const HELD = [
    // Brons: een geslagen munt met touwrand
    (c, st) => {
      const { d, m, l } = st;
      c.save();
      c.shadowColor = 'rgba(25,8,0,.6)';
      c.shadowBlur = 16 * BS;
      c.shadowOffsetY = 5 * BS;
      c.fillStyle = kcss(donkerder(d, 0.2));
      cirkel(c, HX, HY, 75);
      c.fill();
      c.restore();
      c.fillStyle = verloop(c.createLinearGradient(HX - 75, HY - 75, HX + 75, HY + 75), [[0, lichter(l, 0.4)], [0.35, l], [0.6, m], [1, donkerder(d, 0.1)]]);
      cirkel(c, HX, HY, 75);
      c.fill();
      // touw
      const donkerP = new Path2D();
      const lichtP = new Path2D();
      for (let i = 0; i < 52; i++) {
        const a = (i / 52) * 6.2832;
        const a2 = a + 0.2;
        for (const [P, o] of [[donkerP, 0], [lichtP, -0.5]]) {
          P.moveTo(HX + o + Math.cos(a) * 66.5, HY + o + Math.sin(a) * 66.5);
          P.lineTo(HX + o + Math.cos(a2) * 73, HY + o + Math.sin(a2) * 73);
        }
      }
      c.lineWidth = 1.7;
      c.strokeStyle = kcss(donkerder(d, 0.4), 0.55);
      c.stroke(donkerP);
      c.lineWidth = 0.9;
      c.strokeStyle = kcss(lichter(l, 0.7), 0.7);
      c.stroke(lichtP);
      // het veld: verzonken
      c.fillStyle = verloop(c.createRadialGradient(HX - 16, HY - 20, 4, HX, HY, 68), [[0, mixk(m, l, 0.55)], [0.6, m], [1, mixk(d, m, 0.4)]]);
      cirkel(c, HX, HY, 62);
      c.fill();
      c.save();
      cirkel(c, HX, HY, 62);
      c.clip();
      ruis(c, 0.45, 'overlay', 8, 0.7, HX - 64, HY - 64, 128, 128);
      // straaltjes
      c.strokeStyle = kcss(lichter(l, 0.6), 0.1);
      c.lineWidth = 0.6;
      c.beginPath();
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * 6.2832;
        c.moveTo(HX + Math.cos(a) * 14, HY + Math.sin(a) * 14);
        c.lineTo(HX + Math.cos(a) * 64, HY + Math.sin(a) * 64);
      }
      c.stroke();
      c.restore();
      c.lineWidth = 1.8;
      c.strokeStyle = verloop(c.createLinearGradient(HX - 62, HY - 62, HX + 62, HY + 62), [[0, donkerder(d, 0.5), 0.9], [0.5, d, 0.3], [1, lichter(l, 0.8), 0.9]]);
      cirkel(c, HX, HY, 62.6);
      c.stroke();
      // een ring stipjes
      c.fillStyle = kcss(donkerder(d, 0.3), 0.5);
      c.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * 6.2832;
        c.moveTo(HX + Math.cos(a) * 56.5 + 0.9, HY + Math.sin(a) * 56.5);
        c.arc(HX + Math.cos(a) * 56.5, HY + Math.sin(a) * 56.5, 0.9, 0, 6.2832);
      }
      c.fill();
    },
    // Zilver: een horlogewijzerplaat met een lunet
    (c, st) => {
      const { d, m, l } = st;
      c.save();
      c.shadowColor = 'rgba(10,20,40,.5)';
      c.shadowBlur = 14 * BS;
      c.shadowOffsetY = 4 * BS;
      c.fillStyle = kcss(donkerder(m, 0.4));
      cirkel(c, HX, HY, 77);
      c.fill();
      c.restore();
      // lunet: gepolijst chroom (conisch verloop)
      let bez;
      if (c.createConicGradient) {
        bez = c.createConicGradient(-0.6, HX, HY);
        verloop(bez, [[0, WIT], [0.12, mixk(m, l, 0.4)], [0.25, WIT], [0.38, mixk(d, m, 0.4)], [0.5, WIT], [0.62, mixk(m, l, 0.4)], [0.75, WIT], [0.88, mixk(d, m, 0.4)], [1, WIT]]);
      } else bez = verloop(c.createLinearGradient(HX - 76, HY - 76, HX + 76, HY + 76), [[0, WIT], [0.5, mixk(d, m, 0.4)], [1, WIT]]);
      c.fillStyle = bez;
      cirkel(c, HX, HY, 76);
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = kcss(donkerder(d, 0.5), 0.6);
      cirkel(c, HX, HY, 75.4);
      c.stroke();
      c.fillStyle = kcss(donkerder(d, 0.2), 0.5);
      cirkel(c, HX, HY, 66);
      c.fill();
      // het veld
      c.fillStyle = verloop(c.createRadialGradient(HX - 18, HY - 22, 4, HX, HY, 66), [[0, mixk(m, d, 0.25)], [0.6, mixk(d, m, 0.55)], [1, mixk(d, ZWART, 0.2)]]);
      cirkel(c, HX, HY, 64.6);
      c.fill();
      // streepjes van de wijzerplaat
      const dk = new Path2D();
      const lt = new Path2D();
      const gr = new Path2D();
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * 6.2832 - 1.5708;
        const groot = i % 5 === 0;
        const r0 = groot ? 56.5 : 59.5;
        const r1 = 63;
        for (const [P, o] of [[dk, 0], [lt, 0.5]]) {
          P.moveTo(HX + o + Math.cos(a) * r0, HY + o + Math.sin(a) * r0);
          P.lineTo(HX + o + Math.cos(a) * r1, HY + o + Math.sin(a) * r1);
        }
        if (groot) {
          gr.moveTo(HX + Math.cos(a) * 52.5, HY + Math.sin(a) * 52.5);
          gr.arc(HX + Math.cos(a) * 52.5, HY + Math.sin(a) * 52.5, 0.9, 0, 6.2832);
        }
      }
      c.lineWidth = 0.8;
      c.strokeStyle = kcss(donkerder(d, 0.6), 0.8);
      c.stroke(lt);
      c.strokeStyle = kcss(lichter(l, 0.9), 0.95);
      c.stroke(dk);
      c.fillStyle = kcss(lichter(l, 0.9), 0.8);
      c.fill(gr);
      c.lineWidth = 1.6;
      c.strokeStyle = verloop(c.createLinearGradient(HX - 66, HY - 66, HX + 66, HY + 66), [[0, donkerder(d, 0.45), 0.9], [0.5, d, 0.2], [1, WIT, 0.95]]);
      cirkel(c, HX, HY, 66);
      c.stroke();
    },
    // Goud: een medaillon met parelrand
    (c, st) => {
      const { d, m, l } = st;
      c.save();
      c.shadowColor = 'rgba(60,30,0,.55)';
      c.shadowBlur = 14 * BS;
      c.shadowOffsetY = 4 * BS;
      c.fillStyle = kcss(donkerder(d, 0.2));
      cirkel(c, HX, HY, 70);
      c.fill();
      c.restore();
      c.fillStyle = verloop(c.createLinearGradient(HX - 70, HY - 70, HX + 70, HY + 70), [[0, lichter(l, 0.8)], [0.3, l], [0.55, m], [0.75, lichter(l, 0.35)], [1, mixk(d, m, 0.4)]]);
      cirkel(c, HX, HY, 70);
      c.fill();
      // parels
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * 6.2832;
        kraal(c, HX + Math.cos(a) * 65, HY + Math.sin(a) * 65, 2.5, lichter(l, 0.9), mixk(l, m, 0.3), mixk(d, m, 0.4));
      }
      c.lineWidth = 1.2;
      c.strokeStyle = kcss(donkerder(d, 0.45), 0.7);
      cirkel(c, HX, HY, 60);
      c.stroke();
      c.strokeStyle = kcss(lichter(l, 0.9), 0.8);
      cirkel(c, HX + 0.6, HY + 0.6, 59.2);
      c.stroke();
      c.fillStyle = verloop(c.createRadialGradient(HX - 16, HY - 22, 3, HX, HY, 60), [[0, lichter(l, 0.85)], [0.5, mixk(l, m, 0.15)], [1, mixk(m, l, 0.1)]]);
      cirkel(c, HX, HY, 57.5);
      c.fill();
      c.save();
      cirkel(c, HX, HY, 57.5);
      c.clip();
      ruis(c, 0.3, 'overlay', 3, 1, HX - 60, HY - 60, 120, 120);
      c.restore();
      c.lineWidth = 1.4;
      c.strokeStyle = verloop(c.createLinearGradient(HX - 58, HY - 58, HX + 58, HY + 58), [[0, donkerder(d, 0.5), 0.9], [1, WIT, 0.9]]);
      cirkel(c, HX, HY, 57.8);
      c.stroke();
    },
    // Speciaal: een zeshoek van gloeiend glas
    (c, st) => {
      const { d, m, l, acc, acc2 } = st;
      c.save();
      c.shadowColor = kcss(acc, 0.9);
      c.shadowBlur = 20 * BS;
      c.fillStyle = kcss(donkerder(d, 0.3));
      veelhoek(c, HX, HY, 71, 6, 0);
      c.fill();
      c.restore();
      c.fillStyle = verloop(c.createRadialGradient(HX, HY - 6, 4, HX, HY, 74), [[0, mixk(m, acc, 0.45)], [0.5, mixk(d, m, 0.55)], [1, donkerder(d, 0.35)]]);
      veelhoek(c, HX, HY, 70, 6, 0);
      c.fill();
      // zeshoekraster in het glas
      c.save();
      veelhoek(c, HX, HY, 70, 6, 0);
      c.clip();
      const hs = 9.5;
      const hh = hs * Math.sqrt(3);
      c.strokeStyle = kcss(acc, 0.17);
      c.lineWidth = 0.6;
      c.beginPath();
      for (let row = -2; row < 18; row++) {
        for (let col = -2; col < 18; col++) {
          const cx = HX - 80 + col * hs * 1.5;
          const cy = HY - 80 + row * hh + (col % 2 ? hh / 2 : 0);
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            const px = cx + Math.cos(a) * hs * 0.94;
            const py = cy + Math.sin(a) * hs * 0.94;
            if (k) c.lineTo(px, py);
            else c.moveTo(px, py);
          }
          c.closePath();
        }
      }
      c.stroke();
      // een lichtvlek boven in het glas
      c.fillStyle = verloop(c.createLinearGradient(0, HY - 70, 0, HY + 10), [[0, WIT, 0.22], [1, WIT, 0]]);
      c.fillRect(HX - 72, HY - 72, 144, 82);
      c.restore();
      c.lineJoin = 'round';
      c.lineWidth = 3.2;
      c.strokeStyle = kcss(lichter(acc, 0.35));
      c.shadowColor = kcss(acc, 1);
      c.shadowBlur = 10 * BS;
      veelhoek(c, HX, HY, 70, 6, 0);
      c.stroke();
      c.shadowBlur = 0;
      c.lineWidth = 1;
      c.strokeStyle = kcss(acc, 0.65);
      veelhoek(c, HX, HY, 63.5, 6, 0);
      c.stroke();
      c.strokeStyle = kcss(acc2, 0.5);
      c.lineWidth = 0.7;
      veelhoek(c, HX, HY, 57, 6, 0);
      c.stroke();
      // knooppunten op de hoeken
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        c.fillStyle = kcss(lichter(acc, 0.7));
        cirkel(c, HX + Math.cos(a) * 70, HY + Math.sin(a) * 70, 2.6);
        c.fill();
      }
    },
    // Icoon: een ovale cameo met gouden filigraan
    (c, st) => {
      const { d, m, l, acc2 } = st;
      const goud = [[0, lichter(l, 0.5)], [0.3, mixk(m, l, 0.2)], [0.55, mixk(d, m, 0.35)], [0.78, mixk(m, l, 0.4)], [1, mixk(d, m, 0.15)]];
      c.save();
      c.shadowColor = 'rgba(90,60,10,.5)';
      c.shadowBlur = 16 * BS;
      c.shadowOffsetY = 4 * BS;
      c.fillStyle = kcss(mixk(d, m, 0.2));
      c.beginPath();
      c.ellipse(HX, HY, 70, 84, 0, 0, 6.2832);
      c.fill();
      c.restore();
      // de gouden lijst
      c.fillStyle = verloop(c.createLinearGradient(HX - 70, HY - 84, HX + 70, HY + 84), goud);
      c.beginPath();
      c.ellipse(HX, HY, 70, 84, 0, 0, 6.2832);
      c.fill();
      c.lineWidth = 0.9;
      c.strokeStyle = kcss(donkerder(d, 0.5), 0.7);
      c.beginPath();
      c.ellipse(HX, HY, 69.6, 83.6, 0, 0, 6.2832);
      c.stroke();
      // parels in de lijst
      for (let i = 0; i < 52; i++) {
        const a = (i / 52) * 6.2832;
        kraal(c, HX + Math.cos(a) * 64.5, HY + Math.sin(a) * 78.5, 2.1, WIT, lichter(l, 0.3), mixk(m, d, 0.4));
      }
      // het veld van parelmoer
      c.fillStyle = verloop(c.createRadialGradient(HX - 14, HY - 24, 4, HX, HY, 84), [[0, WIT], [0.5, lichter(l, 0.5)], [1, mixk(l, m, 0.5)]]);
      c.beginPath();
      c.ellipse(HX, HY, 58, 72, 0, 0, 6.2832);
      c.fill();
      c.save();
      c.beginPath();
      c.ellipse(HX, HY, 58, 72, 0, 0, 6.2832);
      c.clip();
      for (const [x, y, k] of [[HX - 30, HY - 40, [255, 160, 215]], [HX + 34, HY + 10, [140, 215, 255]], [HX - 10, HY + 55, [255, 235, 160]]]) {
        const g = c.createRadialGradient(x, y, 0, x, y, 60);
        const kk = st.thema ? mixk(k, l, 0.6) : k;
        g.addColorStop(0, kcss(kk, 0.35));
        g.addColorStop(1, kcss(kk, 0));
        c.fillStyle = g;
        c.fillRect(HX - 60, HY - 74, 120, 148);
      }
      c.restore();
      c.lineWidth = 1.6;
      c.strokeStyle = verloop(c.createLinearGradient(HX - 58, HY - 72, HX + 58, HY + 72), [[0, donkerder(d, 0.4), 0.85], [0.5, d, 0.25], [1, WIT, 0.95]]);
      c.beginPath();
      c.ellipse(HX, HY, 58.4, 72.4, 0, 0, 6.2832);
      c.stroke();
      // vier edelstenen op de lijst
      for (const [dx, dy] of [[-69, 0], [69, 0], [0, 83], [0, -83]]) {
        c.fillStyle = verloop(c.createLinearGradient(HX + dx - 5, HY + dy - 5, HX + dx + 5, HY + dy + 5), goud);
        cirkel(c, HX + dx, HY + dy, 5.2);
        c.fill();
        kraal(c, HX + dx, HY + dy, 3.3, lichter(acc2, 0.7), acc2, donkerder(acc2, 0.5));
      }
    },
  ];

  // De decoraties boven het embleem, op de middenlaag: lauwerkrans, kroon, banen.
  function lauwer(c, st, cx, cy, R) {
    const { d, m, l } = st;
    for (const kant of [-1, 1]) {
      // de tak
      c.lineWidth = 1.3;
      c.strokeStyle = kcss(donkerder(d, 0.35), 0.9);
      c.beginPath();
      for (let i = 0; i <= 20; i++) {
        const th = 0.12 + (i / 20) * 2.1;
        const x = cx + kant * Math.sin(th) * R;
        const y = cy + Math.cos(th) * R;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const th = 0.2 + t * 1.95;
        const len = 15 - t * 4.5;
        for (const bin of [1, -1]) {
          const rr = R + bin * 2.6;
          const x = cx + kant * Math.sin(th) * rr;
          const y = cy + Math.cos(th) * rr;
          c.save();
          c.translate(x, y);
          c.rotate(Math.atan2(-Math.sin(th), kant * Math.cos(th)) + bin * kant * 0.6);
          const g = c.createLinearGradient(0, -2.5, 0, 2.5);
          verloop(g, [[0, lichter(l, 0.7)], [0.5, mixk(m, l, 0.3)], [1, mixk(d, m, 0.5)]]);
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(len * 0.45, -len * 0.36, len, 0);
          c.quadraticCurveTo(len * 0.45, len * 0.36, 0, 0);
          c.fill();
          c.lineWidth = 0.5;
          c.strokeStyle = kcss(donkerder(d, 0.4), 0.8);
          c.stroke();
          c.restore();
        }
      }
    }
  }

  function kroon(c, st, x, y, s) {
    const { d, m, l, acc2 } = st;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    const goud = [[0, lichter(l, 0.7)], [0.35, mixk(m, l, 0.3)], [0.6, mixk(d, m, 0.35)], [1, mixk(m, l, 0.1)]];
    c.shadowColor = 'rgba(60,30,0,.5)';
    c.shadowBlur = 5 * MIDS;
    c.shadowOffsetY = 2 * MIDS;
    c.fillStyle = verloop(c.createLinearGradient(-26, -18, 26, 10), goud);
    c.beginPath();
    c.moveTo(-24, 7);
    c.lineTo(-27, -11);
    c.quadraticCurveTo(-18, -4, -12, -1);
    c.lineTo(-7, -14);
    c.quadraticCurveTo(-3, -5, 0, -18);
    c.quadraticCurveTo(3, -5, 7, -14);
    c.lineTo(12, -1);
    c.quadraticCurveTo(18, -4, 27, -11);
    c.lineTo(24, 7);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    c.lineWidth = 0.8;
    c.strokeStyle = kcss(donkerder(d, 0.5), 0.9);
    c.stroke();
    // bandje onderaan
    c.fillStyle = verloop(c.createLinearGradient(0, 1, 0, 10), [[0, lichter(l, 0.6)], [0.5, mixk(m, l, 0.2)], [1, mixk(d, m, 0.3)]]);
    c.beginPath();
    c.roundRect(-25, 3, 50, 7, 3);
    c.fill();
    c.strokeStyle = kcss(donkerder(d, 0.5), 0.9);
    c.stroke();
    // parels op de punten en steentjes in het bandje
    for (const [px, py] of [[-27, -12], [0, -19.5], [27, -12]]) kraal(c, px, py, 2.7, WIT, lichter(l, 0.4), mixk(m, d, 0.3));
    for (const px of [-14, 0, 14]) kraal(c, px, 6.5, 2.1, lichter(acc2, 0.75), acc2, donkerder(acc2, 0.5));
    c.restore();
  }

  // ── het patroon van elk niveau: komt op een eigen laag, zodat het ook het folie-masker kan worden ──
  const PATROON = [
    // Brons: een ketting van ruitjes langs de rand en een paar krassen
    (c, st) => {
      const { d, l, rng } = st;
      const pts = randPunten(14.4, 9);
      c.beginPath();
      for (const p of pts) {
        c.moveTo(p.x + p.tx * 2.9, p.y + p.ty * 2.9);
        c.lineTo(p.x + p.nx * 1.8, p.y + p.ny * 1.8);
        c.lineTo(p.x - p.tx * 2.9, p.y - p.ty * 2.9);
        c.lineTo(p.x - p.nx * 1.8, p.y - p.ny * 1.8);
        c.closePath();
      }
      c.fillStyle = kcss(lichter(l, 0.55), 0.6);
      c.fill();
      c.lineWidth = 0.5;
      c.strokeStyle = kcss(donkerder(d, 0.5), 0.55);
      c.stroke();
      c.lineWidth = 0.45;
      for (let i = 0; i < 16; i++) {
        const x = rng() * CW;
        const y = rng() * (PLAAT_Y - 10);
        const a = -0.5 + rng() * 1.0;
        const len = 12 + rng() * 40;
        c.strokeStyle = rng() < 0.5 ? kcss(lichter(l, 0.7), 0.22) : kcss(donkerder(d, 0.5), 0.2);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        c.stroke();
      }
    },
    // Zilver: een gedraaide rozet en een guilloche-band
    (c, st) => {
      const { d, l } = st;
      c.save();
      cirkel(c, HX, HY, 57);
      c.clip();
      c.lineWidth = 0.45;
      for (const [k, o] of [[kcss(donkerder(d, 0.5), 0.3), 0.5], [kcss(WIT, 0.7), 0]]) {
        c.strokeStyle = k;
        c.beginPath();
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * 6.2832;
          const cx = HX + o + Math.cos(a) * 27;
          const cy = HY + o + Math.sin(a) * 27;
          c.moveTo(cx + 27, cy);
          c.arc(cx, cy, 27, 0, 6.2832);
        }
        c.stroke();
      }
      c.lineWidth = 0.35;
      c.strokeStyle = kcss(donkerder(d, 0.5), 0.14);
      c.beginPath();
      for (let r = 4; r < 58; r += 2.6) {
        c.moveTo(HX + r, HY);
        c.arc(HX, HY, r, 0, 6.2832);
      }
      c.stroke();
      c.restore();
      // de band langs de rand
      const pts = randPunten(13.2, 1.4);
      for (const [ph, k] of [[0, kcss(WIT, 0.75)], [Math.PI, kcss(donkerder(d, 0.5), 0.4)]]) {
        c.beginPath();
        pts.forEach((p, i) => {
          const o = 2.1 * Math.sin((p.s * 6.2832) / 10 + ph);
          const x = p.x + p.nx * o;
          const y = p.y + p.ny * o;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        });
        c.closePath();
        c.lineWidth = 0.55;
        c.strokeStyle = k;
        c.stroke();
      }
    },
    // Goud: zonnestralen vanuit het embleem
    (c, st) => {
      const { l } = st;
      const n = 40;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 6.2832;
        const a1 = a0 + 3.1416 / n;
        c.moveTo(HX, HY);
        c.lineTo(HX + Math.cos(a0) * 560, HY + Math.sin(a0) * 560);
        c.lineTo(HX + Math.cos(a1) * 560, HY + Math.sin(a1) * 560);
        c.closePath();
      }
      const g = c.createRadialGradient(HX, HY, 60, HX, HY, 330);
      g.addColorStop(0, kcss(lichter(l, 0.7), 0.0));
      g.addColorStop(0.12, kcss(lichter(l, 0.7), 0.34));
      g.addColorStop(0.6, kcss(lichter(l, 0.7), 0.17));
      g.addColorStop(1, kcss(lichter(l, 0.7), 0.04));
      c.fillStyle = g;
      c.fill();
      // een tweede, fijnere waaier in de schaduw
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a0 = ((i + 0.5) / n) * 6.2832;
        c.moveTo(HX, HY);
        c.lineTo(HX + Math.cos(a0) * 560, HY + Math.sin(a0) * 560);
        c.lineTo(HX + Math.cos(a0 + 0.03) * 560, HY + Math.sin(a0 + 0.03) * 560);
        c.closePath();
      }
      c.fillStyle = verloop(c.createRadialGradient(HX, HY, 60, HX, HY, 330), [[0, ZWART, 0], [0.2, st.d, 0.16], [1, st.d, 0.02]]);
      c.fill();
    },
    // Speciaal: neon-circuitlijnen die vanuit de zeshoek uitwaaieren
    (c, st) => {
      const { acc, acc2, rng } = st;
      c.save();
      c.beginPath();
      c.rect(0, 0, CW, PLAAT_Y);
      c.rect(8, 22, 108, 240);
      c.clip('evenodd');
      const sporen = [];
      for (let i = 0; i < 30; i++) {
        const hoek = -2.1 + (i / 29) * 4.2 + (rng() - 0.5) * 0.1;
        let dir = Math.round((hoek / Math.PI) * 4) * (Math.PI / 4);
        let x = HX + Math.cos(hoek) * 71;
        let y = HY + Math.sin(hoek) * 71;
        const pad = [[x, y]];
        const stappen = 3 + Math.floor(rng() * 3);
        for (let k = 0; k < stappen; k++) {
          const len = 8 + rng() * 26;
          x += Math.cos(dir) * len;
          y += Math.sin(dir) * len;
          pad.push([x, y]);
          dir += (rng() < 0.5 ? 1 : -1) * (Math.PI / 4);
        }
        sporen.push(pad);
      }
      c.lineJoin = 'round';
      c.lineCap = 'round';
      // gloed, daarna de lijn zelf
      for (const [lw, a, kl] of [[3.4, 0.14, acc], [1.0, 0.85, lichter(acc, 0.35)]]) {
        c.lineWidth = lw;
        c.strokeStyle = kcss(kl, a);
        c.beginPath();
        for (const pad of sporen) {
          c.moveTo(pad[0][0], pad[0][1]);
          for (let k = 1; k < pad.length; k++) c.lineTo(pad[k][0], pad[k][1]);
        }
        c.stroke();
      }
      for (const pad of sporen) {
        const e = pad[pad.length - 1];
        c.fillStyle = kcss(lichter(acc2, 0.5), 0.9);
        cirkel(c, e[0], e[1], 1.7);
        c.fill();
        c.strokeStyle = kcss(acc, 0.8);
        c.lineWidth = 0.6;
        cirkel(c, e[0], e[1], 3.2);
        c.stroke();
      }
      c.restore();
    },
    // Icoon: zachte stralen, schitters en een gouden rank langs de rand
    (c, st) => {
      const { oro, rng } = st;
      const n = 28;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * 6.2832;
        c.moveTo(HX, HY);
        c.lineTo(HX + Math.cos(a0) * 560, HY + Math.sin(a0) * 560);
        c.lineTo(HX + Math.cos(a0 + 3.1416 / n) * 560, HY + Math.sin(a0 + 3.1416 / n) * 560);
        c.closePath();
      }
      const g = c.createRadialGradient(HX, HY, 70, HX, HY, 340);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.15, 'rgba(255,255,255,.4)');
      g.addColorStop(1, 'rgba(255,255,255,.05)');
      c.fillStyle = g;
      c.fill();
      // de rank
      const pts = randPunten(14.4, 1.6);
      const A = 2.3;
      const lam = 26;
      c.lineCap = 'round';
      for (const [lw, k] of [[1.5, kcss(donkerder(oro, 0.35), 0.8)], [0.7, kcss(lichter(oro, 0.65), 0.95)]]) {
        c.lineWidth = lw;
        c.strokeStyle = k;
        c.beginPath();
        pts.forEach((p, i) => {
          const o = A * Math.sin((p.s * 6.2832) / lam);
          const x = p.x + p.nx * o;
          const y = p.y + p.ny * o;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        });
        c.closePath();
        c.stroke();
      }
      // blaadjes en parels op de toppen van de golf
      const top = randPunten(14.4, lam / 2, 0.25);
      top.forEach((p, i) => {
        const kant = i % 2 ? 1 : -1;
        const x = p.x + p.nx * A * kant * 1.2;
        const y = p.y + p.ny * A * kant * 1.2;
        const ax = Math.atan2(p.ty, p.tx);
        c.save();
        c.translate(x + p.nx * kant * 1.2, y + p.ny * kant * 1.2);
        c.rotate(ax + kant * 0.5);
        c.fillStyle = verloop(c.createLinearGradient(0, -2, 0, 2), [[0, lichter(oro, 0.6)], [1, donkerder(oro, 0.2)]]);
        c.beginPath();
        c.moveTo(-5, 0);
        c.quadraticCurveTo(0, -3.2, 5, 0);
        c.quadraticCurveTo(0, 3.2, -5, 0);
        c.fill();
        c.restore();
        kraal(c, x - p.nx * kant * 1.6 + p.tx * 4.5, y - p.ny * kant * 1.6 + p.ty * 4.5, 1.2, WIT, lichter(oro, 0.4), donkerder(oro, 0.2));
      });
      // schitters
      for (let i = 0; i < 46; i++) {
        const x = 20 + rng() * 260;
        const y = 20 + rng() * (PLAAT_Y - 30);
        const r = 1.1 + rng() * 2.6;
        c.fillStyle = `rgba(255,255,255,${0.35 + rng() * 0.55})`;
        ster4(c, x, y, r, 0.14);
        c.fill();
      }
    },
  ];

  // ── de naamplaat onderaan ──
  function naamplaat(c, st) {
    const { tier, d, m, l, tekLicht, acc, acc2, oro } = st;
    c.save();
    kaartPad(c, RIM);
    c.clip();
    c.beginPath();
    c.rect(0, PLAAT_Y, CW, CH - PLAAT_Y);
    c.clip();
    c.fillStyle = verloop(c.createLinearGradient(0, PLAAT_Y, 0, CH), [[0, st.plaat0], [1, st.plaat1]]);
    c.fillRect(0, PLAAT_Y, CW, CH - PLAAT_Y);
    if (tier === 0) {
      ruis(c, 0.5, 'overlay', 9, 0.7, 0, PLAAT_Y, CW, CH - PLAAT_Y);
      c.fillStyle = verloop(c.createLinearGradient(0, PLAAT_Y, CW, CH), [[0, WIT, 0.22], [0.5, WIT, 0], [1, ZWART, 0.18]]);
      c.fillRect(0, PLAAT_Y, CW, CH - PLAAT_Y);
    } else if (tier === 1) {
      ruis(c, 0.4, 'overlay', 6, 0.7, 0, PLAAT_Y, CW, CH - PLAAT_Y);
      c.fillStyle = verloop(c.createLinearGradient(0, PLAAT_Y, 0, CH), [[0, WIT, 0.45], [0.35, WIT, 0], [1, ZWART, 0.12]]);
      c.fillRect(0, PLAAT_Y, CW, CH - PLAAT_Y);
    } else if (tier === 2) {
      ruis(c, 0.3, 'overlay', 3, 1, 0, PLAAT_Y, CW, CH - PLAAT_Y);
      c.fillStyle = verloop(c.createLinearGradient(0, PLAAT_Y, CW, CH), [[0, WIT, 0.35], [0.4, WIT, 0], [0.7, WIT, 0.2], [1, ZWART, 0.15]]);
      c.fillRect(0, PLAAT_Y, CW, CH - PLAAT_Y);
    } else if (tier === 3) {
      // donker glas met een fijn raster en lichtstreepjes
      c.strokeStyle = kcss(acc, 0.08);
      c.lineWidth = 0.5;
      c.beginPath();
      for (let y = PLAAT_Y; y < CH; y += 4) {
        c.moveTo(0, y);
        c.lineTo(CW, y);
      }
      c.stroke();
      c.fillStyle = verloop(c.createLinearGradient(0, PLAAT_Y, 0, PLAAT_Y + 40), [[0, acc, 0.22], [1, acc, 0]]);
      c.fillRect(0, PLAAT_Y, CW, 40);
      ruis(c, 0.15, 'overlay', 1, 1, 0, PLAAT_Y, CW, CH - PLAAT_Y);
    } else {
      ruis(c, 0.2, 'soft-light', 2, 2, 0, PLAAT_Y, CW, CH - PLAAT_Y);
      c.fillStyle = verloop(c.createLinearGradient(0, PLAAT_Y, CW, CH), [[0, WIT, 0.5], [0.5, WIT, 0.05], [1, oro, 0.18]]);
      c.fillRect(0, PLAAT_Y, CW, CH - PLAAT_Y);
    }
    c.restore();

    // de rand tussen kaartveld en plaat
    const y = PLAAT_Y;
    const x0 = RIM + 2;
    const x1 = CW - RIM - 2;
    c.save();
    kaartPad(c, RIM);
    c.clip();
    // schaduw op het veld erboven
    c.fillStyle = verloop(c.createLinearGradient(0, y - 7, 0, y), [[0, ZWART, 0], [1, ZWART, tekLicht ? 0.45 : 0.28]]);
    c.fillRect(0, y - 7, CW, 7);
    if (tier === 0) {
      c.fillStyle = verloop(c.createLinearGradient(0, y - 2, 0, y + 4), [[0, lichter(l, 0.6)], [0.5, m], [1, donkerder(d, 0.2)]]);
      c.fillRect(0, y - 2.5, CW, 6);
      const dk = new Path2D();
      const lt = new Path2D();
      for (let x = x0; x < x1; x += 4.2) {
        dk.moveTo(x, y + 3);
        dk.lineTo(x + 2.4, y - 2);
        lt.moveTo(x + 0.7, y + 3);
        lt.lineTo(x + 3.1, y - 2);
      }
      c.lineWidth = 0.9;
      c.strokeStyle = kcss(donkerder(d, 0.5), 0.55);
      c.stroke(dk);
      c.lineWidth = 0.5;
      c.strokeStyle = kcss(lichter(l, 0.8), 0.6);
      c.stroke(lt);
    } else if (tier === 1) {
      c.fillStyle = verloop(c.createLinearGradient(0, y - 3, 0, y + 3.5), [[0, WIT], [0.45, mixk(m, l, 0.3)], [0.55, mixk(d, m, 0.4)], [1, WIT]]);
      c.fillRect(0, y - 3, CW, 6.5);
      for (const [ph, k] of [[0, kcss(donkerder(d, 0.5), 0.5)], [Math.PI, kcss(WIT, 0.7)]]) {
        c.beginPath();
        for (let x = x0; x <= x1; x += 1) {
          const yy = y + 0.2 + 1.4 * Math.sin(((x - x0) * 6.2832) / 9 + ph);
          if (x > x0) c.lineTo(x, yy);
          else c.moveTo(x, yy);
        }
        c.lineWidth = 0.5;
        c.strokeStyle = k;
        c.stroke();
      }
    } else if (tier === 2) {
      c.fillStyle = verloop(c.createLinearGradient(0, y - 3, 0, y + 3.5), [[0, lichter(l, 0.8)], [0.4, m], [0.7, lichter(l, 0.3)], [1, mixk(d, m, 0.4)]]);
      c.fillRect(0, y - 3, CW, 6.5);
      for (let x = x0 + 2; x < x1; x += 5.4) kraal(c, x, y + 0.2, 1.7, lichter(l, 0.9), mixk(l, m, 0.3), mixk(d, m, 0.4));
    } else if (tier === 3) {
      c.fillStyle = kcss(donkerder(d, 0.4));
      c.fillRect(0, y - 2.5, CW, 5);
      c.lineWidth = 1.4;
      c.strokeStyle = kcss(lichter(acc, 0.3));
      c.shadowColor = kcss(acc, 1);
      c.shadowBlur = 7 * BS;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();
      c.shadowBlur = 0;
      // schuine accenten
      c.fillStyle = kcss(acc2, 0.9);
      for (const [xa, br] of [[40, 22], [CW - 62, 22]]) {
        c.beginPath();
        c.moveTo(xa, y - 2.2);
        c.lineTo(xa + br, y - 2.2);
        c.lineTo(xa + br - 4, y + 2.2);
        c.lineTo(xa - 4, y + 2.2);
        c.closePath();
        c.fill();
      }
    } else {
      c.fillStyle = verloop(c.createLinearGradient(0, y - 2.5, 0, y + 3), [[0, lichter(oro, 0.6)], [0.45, oro], [1, donkerder(oro, 0.35)]]);
      c.fillRect(0, y - 2.5, CW, 5);
      c.fillStyle = kcss(lichter(oro, 0.8), 0.9);
      for (const x of [CW / 2 - 24, CW / 2 + 24]) {
        cirkel(c, x, y, 1.9);
        c.fill();
      }
      // een ruit in het midden
      c.fillStyle = verloop(c.createLinearGradient(CW / 2 - 7, y - 7, CW / 2 + 7, y + 7), [[0, lichter(oro, 0.7)], [1, donkerder(oro, 0.3)]]);
      c.beginPath();
      c.moveTo(CW / 2, y - 7.5);
      c.lineTo(CW / 2 + 9, y);
      c.lineTo(CW / 2, y + 7.5);
      c.lineTo(CW / 2 - 9, y);
      c.closePath();
      c.fill();
      c.lineWidth = 0.6;
      c.strokeStyle = kcss(donkerder(oro, 0.5), 0.9);
      c.stroke();
      kraal(c, CW / 2, y, 2.6, lichter(acc2, 0.75), acc2, donkerder(acc2, 0.5));
    }
    // het vak met de statistieken ligt iets verdiept
    c.beginPath();
    c.roundRect(24, 334, CW - 48, 58, 6);
    c.fillStyle = tekLicht ? 'rgba(0,0,0,.28)' : 'rgba(0,0,0,.06)';
    c.fill();
    c.lineWidth = 0.9;
    c.strokeStyle = 'rgba(0,0,0,.32)';
    c.beginPath();
    c.roundRect(24, 334, CW - 48, 58, 6);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.32)';
    c.beginPath();
    c.roundRect(24.8, 334.9, CW - 48, 58, 6);
    c.stroke();
    // fijne lichte en donkere lijn
    c.fillStyle = 'rgba(0,0,0,.4)';
    c.fillRect(0, y + 3.5, CW, 0.7);
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(0, y - 3.2, CW, 0.6);
    c.restore();
  }

  // ── de lijst rond de kaart ──
  function lijst(c, st) {
    const { tier, d, m, l, acc, acc2, oro } = st;
    const stops = [
      [[0, lichter(l, 0.55)], [0.28, l], [0.52, m], [0.8, mixk(d, m, 0.4)], [1, d]],
      [[0, WIT], [0.16, l], [0.34, mixk(m, d, 0.25)], [0.5, WIT], [0.7, mixk(m, l, 0.35)], [0.86, mixk(m, d, 0.3)], [1, l]],
      [[0, lichter(l, 0.8)], [0.24, l], [0.44, m], [0.6, lichter(l, 0.65)], [0.8, mixk(d, m, 0.4)], [1, mixk(m, l, 0.2)]],
      [[0, mixk(m, WIT, 0.4)], [0.35, mixk(d, m, 0.5)], [0.65, donkerder(d, 0.2)], [1, mixk(m, acc, 0.4)]],
      [[0, lichter(oro, 0.75)], [0.22, oro], [0.45, donkerder(oro, 0.25)], [0.62, lichter(oro, 0.45)], [0.85, oro], [1, donkerder(oro, 0.3)]],
    ][tier];
    c.lineWidth = RIM;
    c.strokeStyle = verloop(c.createLinearGradient(0, 0, CW, CH), stops);
    kaartPad(c, RIM / 2);
    c.stroke();
    // een lichtrand buiten en een donkere rand binnen
    c.lineWidth = 1.3;
    c.strokeStyle = verloop(c.createLinearGradient(0, 0, CW, CH), [[0, WIT, 0.95], [0.45, WIT, 0.3], [1, WIT, 0.05]]);
    kaartPad(c, 0.8);
    c.stroke();
    c.lineWidth = 0.7;
    c.strokeStyle = 'rgba(0,0,0,.5)';
    kaartPad(c, 0.25);
    c.stroke();
    schuin(c, RIM + 0.1, 1.1, 'rgba(255,255,255,.3)', 'rgba(0,0,0,.5)', 0.6);
    // de middelste groef in de rand
    c.lineWidth = 0.8;
    c.strokeStyle = 'rgba(0,0,0,.28)';
    kaartPad(c, RIM * 0.5);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.3)';
    c.translate(0.5, 0.5);
    kaartPad(c, RIM * 0.5);
    c.stroke();
    c.translate(-0.5, -0.5);

    if (tier === 0) {
      // klinknagels
      for (const p of randPunten(4.5, 118, 0.3)) {
        c.fillStyle = 'rgba(0,0,0,.45)';
        cirkel(c, p.x + 0.5, p.y + 0.8, 2.7);
        c.fill();
        kraal(c, p.x, p.y, 2.4, lichter(l, 0.75), mixk(m, l, 0.3), donkerder(d, 0.2));
      }
    } else if (tier === 2) {
      for (const p of randPunten(11.6, 7.6)) kraal(c, p.x, p.y, 1.9, lichter(l, 0.9), mixk(l, m, 0.3), mixk(d, m, 0.4));
    } else if (tier === 3) {
      c.save();
      kaartPad(c, 10.6);
      c.lineWidth = 1.5;
      c.strokeStyle = verloop(c.createLinearGradient(0, 0, CW, CH), [[0, lichter(acc, 0.4)], [0.5, acc2, 0.8], [1, lichter(acc, 0.4)]]);
      c.shadowColor = kcss(acc, 1);
      c.shadowBlur = 8 * BS;
      c.stroke();
      c.restore();
      // streepjes op de rand
      c.strokeStyle = kcss(acc, 0.55);
      c.lineWidth = 0.7;
      c.beginPath();
      for (const p of randPunten(RIM * 0.5, 14)) {
        c.moveTo(p.x - p.nx * 2.4, p.y - p.ny * 2.4);
        c.lineTo(p.x + p.nx * 2.4, p.y + p.ny * 2.4);
      }
      c.stroke();
    } else if (tier === 4) {
      c.lineWidth = 0.7;
      c.strokeStyle = kcss(lichter(oro, 0.7), 0.9);
      kaartPad(c, RIM + 2.4);
      c.stroke();
      c.strokeStyle = kcss(donkerder(oro, 0.4), 0.6);
      kaartPad(c, RIM + 3.3);
      c.stroke();
      for (const p of randPunten(RIM * 0.5, 17)) kraal(c, p.x, p.y, 1.6, WIT, lichter(oro, 0.5), donkerder(oro, 0.3));
    }
  }

  // ── de hoogtekaart voor het reliëf (voor het masker: blauw kanaal) ──
  function hoogtes(h, st) {
    const { tier } = st;
    const grijs = (v) => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;
    h.fillStyle = '#000';
    h.fillRect(0, 0, CW, CH);
    h.fillStyle = grijs(0.5);
    kaartPad(h, 0);
    h.fill();
    // de lijst: een afgeronde rug
    for (const [w, v] of [[RIM, 0.66], [RIM * 0.72, 0.74], [RIM * 0.46, 0.83], [RIM * 0.22, 0.92]]) {
      h.lineWidth = w;
      h.strokeStyle = grijs(v);
      kaartPad(h, RIM / 2);
      h.stroke();
    }
    h.lineWidth = 1.2;
    h.strokeStyle = grijs(0.3);
    kaartPad(h, RIM + 0.6);
    h.stroke();
    // de plaat ligt iets hoger dan het veld; de rand ertussen is een lijst
    h.save();
    kaartPad(h, RIM + 1);
    h.clip();
    h.fillStyle = grijs(0.58);
    h.fillRect(0, PLAAT_Y, CW, CH - PLAAT_Y);
    h.fillStyle = grijs(0.82);
    h.fillRect(0, PLAAT_Y - 2, CW, 5);
    h.fillStyle = grijs(0.34);
    h.fillRect(0, PLAAT_Y + 3.5, CW, 1.2);
    // het vak met de statistieken ligt verdiept
    h.fillStyle = grijs(0.46);
    h.beginPath();
    h.roundRect(24, 334, CW - 48, 58, 6);
    h.fill();
    h.restore();
    // het podium van het embleem
    const ring = (r, v, w) => {
      h.lineWidth = w;
      h.strokeStyle = grijs(v);
      cirkel(h, HX, HY, r);
      h.stroke();
    };
    if (tier === 0) {
      h.fillStyle = grijs(0.74);
      cirkel(h, HX, HY, 75);
      h.fill();
      h.fillStyle = grijs(0.42);
      cirkel(h, HX, HY, 62);
      h.fill();
      ring(68.5, 0.62, 6);
      for (const p of randPunten(4.5, 118, 0.3)) {
        h.fillStyle = grijs(0.96);
        cirkel(h, p.x, p.y, 2.4);
        h.fill();
      }
    } else if (tier === 1) {
      h.fillStyle = grijs(0.8);
      cirkel(h, HX, HY, 76);
      h.fill();
      h.fillStyle = grijs(0.44);
      cirkel(h, HX, HY, 64.6);
      h.fill();
      ring(60, 0.5, 5);
      ring(66.2, 0.7, 1.4);
    } else if (tier === 2) {
      h.fillStyle = grijs(0.76);
      cirkel(h, HX, HY, 70);
      h.fill();
      h.fillStyle = grijs(0.5);
      cirkel(h, HX, HY, 57.5);
      h.fill();
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * 6.2832;
        h.fillStyle = grijs(0.97);
        cirkel(h, HX + Math.cos(a) * 65, HY + Math.sin(a) * 65, 2.5);
        h.fill();
      }
      for (const p of randPunten(11.6, 7.6)) {
        h.fillStyle = grijs(0.95);
        cirkel(h, p.x, p.y, 1.9);
        h.fill();
      }
    } else if (tier === 3) {
      h.fillStyle = grijs(0.72);
      veelhoek(h, HX, HY, 71, 6, 0);
      h.fill();
      h.fillStyle = grijs(0.45);
      veelhoek(h, HX, HY, 62, 6, 0);
      h.fill();
      h.lineWidth = 2.6;
      h.strokeStyle = grijs(0.9);
      veelhoek(h, HX, HY, 69, 6, 0);
      h.stroke();
    } else {
      h.fillStyle = grijs(0.76);
      h.beginPath();
      h.ellipse(HX, HY, 70, 84, 0, 0, 6.2832);
      h.fill();
      h.fillStyle = grijs(0.46);
      h.beginPath();
      h.ellipse(HX, HY, 58, 72, 0, 0, 6.2832);
      h.fill();
      for (let i = 0; i < 52; i++) {
        const a = (i / 52) * 6.2832;
        h.fillStyle = grijs(0.97);
        cirkel(h, HX + Math.cos(a) * 64.5, HY + Math.sin(a) * 78.5, 2.1);
        h.fill();
      }
      for (const p of randPunten(RIM * 0.5, 17)) {
        h.fillStyle = grijs(0.97);
        cirkel(h, p.x, p.y, 1.6);
        h.fill();
      }
    }
  }

  // De buitenvorm van het podium van het embleem (voor het masker).
  function heldPad(c, tier, r = 0) {
    c.beginPath();
    if (tier === 3) {
      c.save();
      veelhoek(c, HX, HY, 71 + r, 6, 0);
      c.restore();
    } else if (tier === 4) c.ellipse(HX, HY, 70 + r, 84 + r, 0, 0, 6.2832);
    else c.arc(HX, HY, [75, 76, 70][tier] + r, 0, 6.2832);
  }

  // De kaart wordt in stukjes gemaakt (een generator): na elk stuk kan de browser even iets anders doen.
  // Een vleugje van het seizoensthema van het pakje op de kaart: alleen in de randen en de rechterbovenhoek, nooit over het
  // cijfer (linksboven) of de naamplaat. Halloween: paarse gloed, een spinnenweb en vleermuisjes. Kerst: rijp in de hoeken en
  // sneeuwvlokjes. Zomer: warm zonlicht van rechtsboven met een paar stralen.
  function seizoenLaag(c, seizoen) {
    if (!seizoen) return;
    c.save();
    if (seizoen === 'halloween') {
      const g = c.createLinearGradient(0, CH, 0, CH * 0.55);
      g.addColorStop(0, 'rgba(120,40,170,.42)');
      g.addColorStop(1, 'rgba(120,40,170,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, CW, CH);
      const o = c.createRadialGradient(CW, 0, 0, CW, 0, 150);
      o.addColorStop(0, 'rgba(255,120,10,.4)');
      o.addColorStop(1, 'rgba(255,130,20,0)');
      c.fillStyle = o;
      c.fillRect(0, 0, CW, CH);
      // spinnenweb in de hoek rechtsboven
      c.strokeStyle = 'rgba(40,20,50,.5)';
      c.lineWidth = 1.2;
      const hx = CW - RIM, hy = RIM;
      for (let i = 0; i <= 5; i++) {
        const a = Math.PI / 2 + (i / 5) * (Math.PI / 2);
        c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a) * 78, hy + Math.sin(a) * 78); c.stroke();
      }
      for (const r of [22, 42, 62]) {
        c.beginPath();
        for (let i = 0; i <= 5; i++) {
          const a = Math.PI / 2 + (i / 5) * (Math.PI / 2);
          const x = hx + Math.cos(a) * r, y = hy + Math.sin(a) * r;
          if (i === 0) c.moveTo(x, y); else c.quadraticCurveTo(hx + Math.cos(a - 0.16) * r * 0.86, hy + Math.sin(a - 0.16) * r * 0.86, x, y);
        }
        c.stroke();
      }
      // vleermuisjes
      c.fillStyle = 'rgba(25,8,35,.8)';
      for (const [x, y, s] of [[226, 96, 1.4], [258, 132, 1], [198, 138, 0.8]]) {
        c.save(); c.translate(x, y); c.scale(s, s);
        c.beginPath();
        c.moveTo(0, 0); c.quadraticCurveTo(-8, -9, -18, -4); c.quadraticCurveTo(-13, -2, -12, 3); c.quadraticCurveTo(-7, 0, -4, 4);
        c.lineTo(0, 2); c.lineTo(4, 4); c.quadraticCurveTo(7, 0, 12, 3); c.quadraticCurveTo(13, -2, 18, -4); c.quadraticCurveTo(8, -9, 0, 0);
        c.fill(); c.restore();
      }
    } else if (seizoen === 'kerst') {
      for (const [x, y] of [[0, 0], [CW, 0], [0, CH], [CW, CH]]) {
        const g = c.createRadialGradient(x, y, 0, x, y, 120);
        g.addColorStop(0, 'rgba(235,248,255,.62)');
        g.addColorStop(1, 'rgba(230,245,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, CW, CH);
      }
      const r = c.createLinearGradient(0, 0, 0, 60);
      r.addColorStop(0, 'rgba(200,30,40,.38)');
      r.addColorStop(1, 'rgba(200,30,40,0)');
      c.fillStyle = r;
      c.fillRect(0, 0, CW, 60);
      // sneeuwvlokjes (niet linksboven, daar staat het cijfer)
      c.strokeStyle = 'rgba(255,255,255,.95)';
      c.shadowColor = 'rgba(80,140,220,.9)';
      c.shadowBlur = 3;
      c.lineWidth = 1.6;
      let z = 11;
      const rnd = () => ((z = (z * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 22; i++) {
        const x = 20 + rnd() * (CW - 40), y = 20 + rnd() * (PLAAT_Y - 30);
        if (x < 150 && y < 175) continue;
        const k = 4 + rnd() * 4.5;
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * Math.PI;
          c.beginPath(); c.moveTo(x - Math.cos(a) * k, y - Math.sin(a) * k); c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); c.stroke();
        }
      }
    } else if (seizoen === 'zomer') {
      const g = c.createRadialGradient(CW, 0, 0, CW, 0, 260);
      g.addColorStop(0, 'rgba(255,215,100,.6)');
      g.addColorStop(0.5, 'rgba(255,180,70,.12)');
      g.addColorStop(1, 'rgba(255,180,70,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, CW, CH);
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,230,150,.12)';
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.55 + (i / 6) * Math.PI * 0.42;
        c.beginPath(); c.moveTo(CW, 0); c.lineTo(CW + Math.cos(a - 0.05) * 420, Math.sin(a - 0.05) * 420); c.lineTo(CW + Math.cos(a + 0.05) * 420, Math.sin(a + 0.05) * 420); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      const t = c.createLinearGradient(0, CH, 0, CH * 0.7);
      t.addColorStop(0, 'rgba(30,200,210,.32)');
      t.addColorStop(1, 'rgba(30,200,210,0)');
      c.fillStyle = t;
      c.fillRect(0, 0, CW, CH);
    }
    c.restore();
  }

  function* kaartGen(data) {
    const T = data.T;
    const tier = data.tier;
    const st = kaartStijl(data);
    const tk = T.tekst;
    const naam = icoonVoorVak(data.vak);

    // ───── achtergrond: het materiaal ─────
    const bg = nieuw(CW * BS, CH * BS);
    const c = bg.getContext('2d');
    c.scale(BS, BS);
    c.save();
    kaartPad(c, 0);
    c.clip();
    FOND[tier](c, st);
    // een lichte of donkere vlek achter het cijfer, zodat het altijd leesbaar blijft
    const pool = c.createRadialGradient(66, 78, 0, 66, 78, 92);
    pool.addColorStop(0, st.tekLicht ? 'rgba(0,0,0,.4)' : 'rgba(255,255,255,.26)');
    pool.addColorStop(1, st.tekLicht ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)');
    c.fillStyle = pool;
    c.fillRect(0, 0, 150, PLAAT_Y);
    // het patroon op een eigen laag: voor de kleur én voor het masker
    const pat = nieuw(CW * BS, CH * BS);
    const pc = pat.getContext('2d');
    pc.scale(BS, BS);
    PATROON[tier](pc, st);
    c.drawImage(pat, 0, 0, CW, CH);
    c.restore();
    yield;

    // ───── achtergrond: het podium, de plaat en de lijst ─────
    c.save();
    kaartPad(c, 0);
    c.clip();
    HELD[tier](c, st);
    naamplaat(c, st);
    // lichtval: een glans linksboven en schaduw rechtsonder, en een vignet
    c.fillStyle = verloop(c.createLinearGradient(0, 0, CW * 0.8, CH * 0.75), [[0, WIT, tier === 3 ? 0.1 : 0.3], [0.4, WIT, 0], [0.8, ZWART, 0], [1, ZWART, 0.2]]);
    c.fillRect(0, 0, CW, CH);
    const vg = c.createRadialGradient(150, 215, 110, 150, 225, 300);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, tier === 3 ? 'rgba(0,0,12,.5)' : tier === 4 ? 'rgba(110,80,30,.22)' : 'rgba(0,0,0,.34)');
    c.fillStyle = vg;
    c.fillRect(0, 0, CW, CH);
    seizoenLaag(c, data.seizoen);
    // de lijst werpt een zachte schaduw op het veld
    c.save();
    kaartPad(c, RIM);
    c.clip();
    c.shadowColor = 'rgba(0,0,0,.5)';
    c.shadowBlur = 6 * BS;
    c.shadowOffsetX = 1.2 * BS;
    c.shadowOffsetY = 1.8 * BS;
    c.lineWidth = 10;
    c.strokeStyle = '#000';
    kaartPad(c, 3);
    c.stroke();
    c.restore();
    c.restore();
    lijst(c, st);
    yield;

    // ───── masker: R folie, G glinstering, B reliëf ─────
    const mk = nieuw(CW * MS, CH * MS);
    const mc = mk.getContext('2d');
    mc.fillStyle = '#000';
    mc.fillRect(0, 0, mk.width, mk.height);
    mc.globalCompositeOperation = 'lighter';
    const tmp = nieuw(mk.width, mk.height);
    const tc = tmp.getContext('2d');
    tc.drawImage(pat, 0, 0, tmp.width, tmp.height);
    tc.globalCompositeOperation = 'destination-out';
    tc.fillRect(0, PLAAT_Y * MS, tmp.width, tmp.height);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = '#f00';
    tc.fillRect(0, 0, tmp.width, tmp.height);
    mc.globalAlpha = [0.55, 1, 0.9, 1, 0.85][tier];
    mc.drawImage(tmp, 0, 0);
    mc.globalAlpha = 1;
    mc.save();
    mc.scale(MS, MS);
    // de lijst en het podium: folie en glinstering
    mc.lineWidth = RIM;
    mc.strokeStyle = 'rgb(255,200,0)';
    kaartPad(mc, RIM / 2);
    mc.stroke();
    mc.lineWidth = 8;
    mc.strokeStyle = 'rgb(255,150,0)';
    heldPad(mc, tier, -3);
    mc.stroke();
    const gg = mc.createRadialGradient(HX, HY, 0, HX, HY, 120);
    gg.addColorStop(0, 'rgba(0,255,0,.6)');
    gg.addColorStop(1, 'rgba(0,255,0,.08)');
    mc.fillStyle = gg;
    mc.save();
    kaartPad(mc, RIM);
    mc.clip();
    mc.fillRect(0, 0, CW, PLAAT_Y);
    mc.fillStyle = 'rgba(0,255,0,.12)';
    mc.fillRect(0, PLAAT_Y, CW, CH);
    mc.restore();
    mc.restore();
    // B: het reliëf
    const hh = nieuw(mk.width, mk.height);
    const hc = hh.getContext('2d');
    hc.scale(MS, MS);
    hoogtes(hc, st);
    const hb = nieuw(mk.width, mk.height);
    const hbc = hb.getContext('2d');
    try {
      hbc.filter = 'blur(1.2px)';
    } catch (e) {
      /* zonder filter blijft het reliëf scherper */
    }
    hbc.drawImage(hh, 0, 0);
    hbc.filter = 'none';
    hbc.globalCompositeOperation = 'multiply';
    hbc.fillStyle = '#00f';
    hbc.fillRect(0, 0, hb.width, hb.height);
    mc.drawImage(hb, 0, 0);

    yield;
    // ───── midden: het embleem van het vak ─────
    const mid = nieuw(CW * MIDS, CH * MIDS);
    const md = mid.getContext('2d');
    md.scale(MIDS, MIDS);
    kaartPad(md, 0);
    md.clip();
    const ek = embleemKleuren(st);
    // een zachte gloed achter het embleem
    {
      const gk = tier === 3 ? st.acc : tier === 4 ? WIT : lichter(st.l, 0.6);
      const gv = md.createRadialGradient(HX, HY, 0, HX, HY, 62);
      gv.addColorStop(0, kcss(gk, [0.22, 0.4, 0.5, 0.45, 0.5][tier]));
      gv.addColorStop(1, kcss(gk, 0));
      md.globalCompositeOperation = 'lighter';
      md.fillStyle = gv;
      md.fillRect(HX - 64, HY - 64, 128, 128);
      md.globalCompositeOperation = 'source-over';
    }
    if (tier === 2) lauwer(md, st, HX, HY, 78);
    if (tier === 4) kroon(md, st, 150, 32, 1);
    icoonMetaal(md, naam, HX, HY + 1, [88, 80, 82, 84, 92][tier], [7, 6.2, 6.6, 6, 6.4][tier], ek, { px: MIDS });

    yield;
    // ───── voorgrond: teksten en emblemen ─────
    const fg = nieuw(CW * BS, CH * BS);
    const f = fg.getContext('2d');
    f.scale(BS, BS);
    f.fillStyle = tk;
    f.strokeStyle = tk;
    f.textAlign = 'center';
    f.textBaseline = 'alphabetic';
    // tekst met een lichte rand (op lichte kaarten) of gloed (op donkere): zo blijft hij op elk thema leesbaar
    const randTekst = st.tekLicht ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.5)';
    const gravure = (fn, dx = 0.5, dy = 0.7) => {
      f.save();
      f.translate(dx, dy);
      f.fillStyle = randTekst;
      f.strokeStyle = randTekst;
      fn();
      f.restore();
      fn();
    };
    const LX = 68;
    // afkorting onder het cijfer
    f.font = `800 22px ${F_SPORT}`;
    spatie(f, 2.4);
    gravure(() => f.fillText(data.afkorting, LX + 1, 143));
    spatie(f, 0);
    // een sierlijntje met een ruitje
    const sier = (x, y, br, a = 0.55) => {
      f.save();
      f.globalAlpha = a;
      f.fillRect(x - br, y - 0.6, br - 5, 1.2);
      f.fillRect(x + 5, y - 0.6, br - 5, 1.2);
      f.beginPath();
      f.moveTo(x, y - 3);
      f.lineTo(x + 3.4, y);
      f.lineTo(x, y + 3);
      f.lineTo(x - 3.4, y);
      f.closePath();
      f.fill();
      f.restore();
    };
    sier(LX, 153, 28);
    // de weging in een medaillon
    {
      const wy = 190;
      f.save();
      f.globalAlpha = 0.14;
      cirkel(f, LX, wy, 22);
      f.fill();
      f.restore();
      f.lineWidth = 1.8;
      cirkel(f, LX, wy, 22);
      f.stroke();
      f.lineWidth = 0.7;
      f.globalAlpha = 0.6;
      cirkel(f, LX, wy, 18.6);
      f.stroke();
      f.globalAlpha = 1;
      f.font = `900 19px ${F_SPORT}`;
      spatie(f, 0.5);
      gravure(() => f.fillText(`${data.weging}×`, LX + 0.5, wy + 6.4));
      spatie(f, 0);
      f.font = `700 8.5px ${F_SPORT}`;
      spatie(f, 2.2);
      f.globalAlpha = 0.75;
      f.fillText('WEGING', LX + 1, wy + 36);
      f.globalAlpha = 1;
      spatie(f, 0);
    }
    // vijf ruitjes: hoe zeldzaam het niveau is
    for (let i = 0; i < 5; i++) {
      const x = LX + (i - 2) * 11;
      f.beginPath();
      f.moveTo(x, 242);
      f.lineTo(x + 4, 246);
      f.lineTo(x, 250);
      f.lineTo(x - 4, 246);
      f.closePath();
      if (i <= tier) {
        f.globalAlpha = 0.9;
        f.fill();
      } else {
        f.globalAlpha = 0.35;
        f.lineWidth = 0.9;
        f.stroke();
      }
    }
    f.globalAlpha = 1;
    // naam van het vak
    const naamTekst = data.vak.toUpperCase();
    pasFont(f, naamTekst, 'italic 900', F_SPORT, 40, 15, CW - 56);
    const naamPas = pas(f, naamTekst, CW - 56);
    gravure(() => f.fillText(naamPas, 150, 302), 0.6, 0.8);
    sier(150, 311.5, 112, 0.5);
    f.font = `600 15px ${F_SPORT}`;
    spatie(f, 0.6);
    f.fillText(pas(f, data.onder, CW - 60), 150, 326);
    spatie(f, 0);
    // zes stats met een streepje ertussen
    for (let i = 0; i < 6; i++) {
      const x = 62 + (i % 3) * 88;
      const y = 355 + Math.floor(i / 3) * 26.5;
      f.textAlign = 'right';
      f.font = `900 22px ${F_SPORT}`;
      f.fillText(String(data.statWaarde(i)), x + 8, y);
      f.textAlign = 'left';
      f.font = `600 13.5px ${F_SPORT}`;
      f.globalAlpha = 0.8;
      spatie(f, 0.4);
      f.fillText(data.STATS[i], x + 13, y - 0.5);
      spatie(f, 0);
      f.globalAlpha = 1;
    }
    f.globalAlpha = 0.35;
    f.fillRect(106, 339, 1.2, 48);
    f.fillRect(194, 339, 1.2, 48);
    f.globalAlpha = 1;
    f.textAlign = 'center';
    f.globalAlpha = 0.62;
    f.font = `700 8.5px ${F_SPORT}`;
    spatie(f, 1.8);
    f.fillText(`${T.naam.toUpperCase()} · ${data.datum.toUpperCase()}`, 150, 417);
    spatie(f, 0);
    f.globalAlpha = 1;

    // eigen rand (instelling)
    if (data.rand !== 'standaard') {
      const kl = T.kleur;
      f.save();
      f.lineJoin = 'round';
      if (data.rand === 'dubbel') {
        for (const [ins, a, w] of [[RIM + 4.5, 0.85, 2], [RIM + 8.5, 0.5, 0.9]]) {
          kaartPad(f, ins);
          f.globalAlpha = a;
          f.lineWidth = w;
          f.stroke();
        }
      } else if (data.rand === 'neon') {
        kaartPad(f, RIM + 4);
        f.strokeStyle = rgba(kl, 0.95);
        f.shadowColor = rgba(kl, 1);
        f.shadowBlur = 14 * BS;
        f.lineWidth = 3;
        f.stroke();
        f.shadowBlur = 5 * BS;
        f.strokeStyle = 'rgba(255,255,255,.85)';
        f.lineWidth = 1;
        f.stroke();
      } else {
        kaartPad(f, RIM + 3);
        f.globalAlpha = 0.6;
        f.lineWidth = 1;
        f.stroke();
      }
      f.restore();
    }

    // zeldzame kaart: een regenboogrand en een label rechtsboven (blijft ook in de galerij zichtbaar, want dit zit in de voorgrond)
    if (data.zeldzaam) {
      f.save();
      const pr = f.createLinearGradient(0, 0, CW, CH);
      ['#ff6b6b', '#ffd24a', '#6bff9e', '#38e1ff', '#b07bff', '#ff5fd2', '#ff6b6b'].forEach((k, i, l) => pr.addColorStop(i / (l.length - 1), k));
      kaartPad(f, RIM / 2);
      f.strokeStyle = pr;
      f.lineWidth = 3.4;
      f.shadowColor = 'rgba(255,255,255,.55)';
      f.shadowBlur = 5 * BS;
      f.stroke();
      f.restore();
      f.save();
      kaartPad(f, RIM / 2 - 2);
      f.lineWidth = 0.7;
      f.strokeStyle = 'rgba(255,255,255,.75)';
      f.stroke();
      f.restore();
      // het label: een gouden pilletje met een viersterretje
      f.save();
      const lx = 192;
      const ly = 24;
      f.beginPath();
      f.roundRect(lx, ly, 86, 20, 10);
      const lg = f.createLinearGradient(lx, ly, lx + 86, ly + 20);
      lg.addColorStop(0, '#fff3b0');
      lg.addColorStop(0.5, '#ffc93a');
      lg.addColorStop(1, '#ff8a2a');
      f.fillStyle = lg;
      f.shadowColor = 'rgba(255,190,60,.8)';
      f.shadowBlur = 6;
      f.fill();
      f.shadowBlur = 0;
      f.lineWidth = 0.8;
      f.strokeStyle = 'rgba(120,60,0,.6)';
      f.stroke();
      f.fillStyle = '#2a1802';
      f.beginPath();
      const sx = lx + 12;
      const sy = ly + 10;
      f.moveTo(sx, sy - 6);
      f.quadraticCurveTo(sx + 1, sy - 1, sx + 6, sy);
      f.quadraticCurveTo(sx + 1, sy + 1, sx, sy + 6);
      f.quadraticCurveTo(sx - 1, sy + 1, sx - 6, sy);
      f.quadraticCurveTo(sx - 1, sy - 1, sx, sy - 6);
      f.fill();
      f.textAlign = 'center';
      f.textBaseline = 'alphabetic';
      f.font = `900 11px ${F_SPORT}`;
      spatie(f, 1.6);
      f.fillText('ZELDZAAM', lx + 53, ly + 14);
      spatie(f, 0);
      f.restore();
    }

    // De naam van de leerling staat op een eigen laag: de galerij gebruikt alleen de laag zonder naam.
    let fgNaam = null;
    if (data.persoon) {
      fgNaam = nieuw(CW * BS, CH * BS);
      const n = fgNaam.getContext('2d');
      n.drawImage(fg, 0, 0);
      n.scale(BS, BS);
      n.fillStyle = tk;
      n.textAlign = 'center';
      n.textBaseline = 'alphabetic';
      n.font = `800 12.5px ${F_SPORT}`;
      spatie(n, 2.2);
      n.globalAlpha = 0.92;
      n.fillText(pas(n, data.persoon.toUpperCase(), CW - 80), 150, 404);
      spatie(n, 0);
    }

    yield;
    // ───── achterkant ─────
    const ach = maakAchterkant();

    // ───── het cijfer (verandert tijdens het optellen) ─────
    const [x0, y0, x1, y1] = CIJFER_RECT;
    const cijfer = nieuw((x1 - x0) * 4, (y1 - y0) * 4);
    const cc = cijfer.getContext('2d');
    const zetCijfer = (str) => {
      cc.clearRect(0, 0, cijfer.width, cijfer.height);
      cc.save();
      cc.scale(4, 4);
      cc.textAlign = 'center';
      cc.textBaseline = 'alphabetic';
      const w = x1 - x0 - 6;
      const fs = pasFont(cc, str, 'italic 900', F_SPORT, 90, 40, w);
      spatie(cc, -1);
      const cx = (x1 - x0) / 2 + 2;
      const cy = (y1 - y0) * 0.8;
      if (st.tekLicht) {
        cc.lineJoin = 'round';
        cc.lineWidth = 5;
        cc.strokeStyle = 'rgba(0,10,40,.65)';
        cc.strokeText(str, cx, cy);
        cc.shadowColor = kcss(st.acc, 0.95);
        cc.shadowBlur = 12 * 4;
        cc.fillStyle = verloop(cc.createLinearGradient(0, cy - fs * 0.7, 0, cy), [[0, WIT], [1, mixk(st.tek, st.acc, 0.35)]]);
        cc.fillText(str, cx, cy);
        cc.shadowBlur = 0;
        cc.fillText(str, cx, cy);
      } else {
        cc.lineJoin = 'round';
        cc.lineWidth = 3.4;
        cc.strokeStyle = 'rgba(255,255,255,.45)';
        cc.strokeText(str, cx + 0.6, cy + 0.9);
        cc.fillStyle = verloop(cc.createLinearGradient(0, cy - fs * 0.7, 0, cy), [[0, lichter(st.tek, 0.2)], [1, st.tek]]);
        cc.fillText(str, cx, cy);
      }
      spatie(cc, 0);
      cc.restore();
    };
    zetCijfer(data.cijferTekst);

    return {
      bg,
      mid,
      fg,
      fgNaam,
      masker: mk,
      patroon: pat,
      achter: ach,
      cijfer,
      zetCijfer,
      cijferRect: [x0 / CW, y0 / CH, x1 / CW, y1 / CH],
    };
  }

  // De achterkant: een diepblauwe kaart met een guilloche-rozet en een vraagteken (het cijfer is nog een geheim).
  function maakAchterkant() {
    const BSA = 2.133;
    const ach = nieuw(CW * BSA, CH * BSA);
    const a = ach.getContext('2d');
    a.scale(BSA, BSA);
    a.save();
    kaartPad(a, 0);
    a.clip();
    const ag = a.createLinearGradient(0, 0, CW, CH);
    ag.addColorStop(0, '#1d2468');
    ag.addColorStop(0.5, '#0b0e30');
    ag.addColorStop(1, '#04050f');
    a.fillStyle = ag;
    a.fillRect(0, 0, CW, CH);
    ruis(a, 0.14, 'overlay', 1, 1);
    // fijne ruiten
    a.strokeStyle = 'rgba(255,255,255,.045)';
    a.lineWidth = 0.8;
    a.beginPath();
    for (let i = -CH; i < CH; i += 10) {
      a.moveTo(0, i);
      a.lineTo(CW, i + CW);
      a.moveTo(0, i + CW);
      a.lineTo(CW, i);
    }
    a.stroke();
    // een rozet van overlappende cirkels
    const gold = verloop(a.createLinearGradient(70, 90, 230, 310), [[0, [255, 226, 122]], [0.5, [255, 176, 32]], [1, [255, 106, 61]]]);
    a.lineWidth = 0.6;
    a.strokeStyle = 'rgba(255,214,120,.32)';
    a.beginPath();
    for (let i = 0; i < 36; i++) {
      const an = (i / 36) * 6.2832;
      const cx = 150 + Math.cos(an) * 46;
      const cy = 200 + Math.sin(an) * 46;
      a.moveTo(cx + 46, cy);
      a.arc(cx, cy, 46, 0, 6.2832);
    }
    a.stroke();
    const mg = a.createRadialGradient(150, 200, 0, 150, 200, 110);
    mg.addColorStop(0, 'rgba(60,80,220,.42)');
    mg.addColorStop(1, 'rgba(60,80,220,0)');
    a.fillStyle = mg;
    a.fillRect(0, 0, CW, CH);
    a.fillStyle = 'rgba(8,10,40,.78)';
    cirkel(a, 150, 200, 72);
    a.fill();
    a.lineWidth = 4;
    a.strokeStyle = gold;
    cirkel(a, 150, 200, 76);
    a.stroke();
    a.lineWidth = 1.1;
    a.strokeStyle = 'rgba(255,255,255,.28)';
    cirkel(a, 150, 200, 68);
    a.stroke();
    for (let i = 0; i < 48; i++) {
      const an = (i / 48) * 6.2832;
      a.fillStyle = 'rgba(255,226,140,.8)';
      cirkel(a, 150 + Math.cos(an) * 82, 200 + Math.sin(an) * 82, i % 4 ? 0.9 : 1.6);
      a.fill();
    }
    a.fillStyle = '#fff';
    a.font = `800 104px ${F_DISPLAY}`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    a.shadowColor = '#ffb020';
    a.shadowBlur = 18;
    a.fillText('?', 153, 206);
    a.shadowBlur = 0;
    a.font = `800 13px ${F_SPORT}`;
    spatie(a, 5);
    a.fillStyle = 'rgba(255,255,255,.62)';
    a.fillText('PACK OPENER', 152, CH - 70);
    spatie(a, 0);
    a.restore();
    // de rand
    a.lineWidth = 6;
    a.strokeStyle = verloop(a.createLinearGradient(0, 0, CW, CH), [[0, [235, 240, 255]], [0.5, [120, 135, 190]], [1, [200, 212, 250]]]);
    kaartPad(a, 3);
    a.stroke();
    a.lineWidth = 1.1;
    a.strokeStyle = 'rgba(255,255,255,.35)';
    kaartPad(a, 10);
    a.stroke();
    a.lineWidth = 0.7;
    a.strokeStyle = 'rgba(0,0,0,.5)';
    kaartPad(a, 6.7);
    a.stroke();
    return ach;
  }


  // ───────────────────────── Het pakje ─────────────────────────
  function maakPak(data) {
    const hw = data.seizoen === 'halloween';
    const kerst = data.seizoen === 'kerst';
    const zomer = data.seizoen === 'zomer';
    const S = 3.2;
    const cv = nieuw(PW * S, PH * S);
    const c = cv.getContext('2d');
    c.scale(S, S);
    const tand = 6;
    const stap = 10;
    const vorm = () => {
      c.beginPath();
      c.moveTo(0, tand);
      for (let x = 0; x < PW; x += stap) {
        c.lineTo(x + stap / 2, 0);
        c.lineTo(x + stap, tand);
      }
      c.lineTo(PW, PH - tand);
      for (let x = PW; x > 0; x -= stap) {
        c.lineTo(x - stap / 2, PH);
        c.lineTo(x - stap, PH - tand);
      }
      c.closePath();
    };
    vorm();
    c.save();
    c.clip();
    const bg = c.createLinearGradient(0, 0, PW, PH);
    if (hw) {
      bg.addColorStop(0, '#6a2bb0');
      bg.addColorStop(0.35, '#3a1270');
      bg.addColorStop(0.72, '#1a0838');
      bg.addColorStop(1, '#07020f');
    } else if (kerst) {
      // rood en groen folie, als inpakpapier
      bg.addColorStop(0, '#e8304a');
      bg.addColorStop(0.34, '#b01630');
      bg.addColorStop(0.56, '#17703f');
      bg.addColorStop(0.8, '#0a4a2a');
      bg.addColorStop(1, '#041f12');
    } else if (zomer) {
      // zonnig turquoise: de zee, met de zon rechtsboven
      bg.addColorStop(0, '#5fe6ee');
      bg.addColorStop(0.4, '#1db4d2');
      bg.addColorStop(0.75, '#0d78a8');
      bg.addColorStop(1, '#075078');
    } else {
      bg.addColorStop(0, '#4650d8');
      bg.addColorStop(0.35, '#262e98');
      bg.addColorStop(0.72, '#111650');
      bg.addColorStop(1, '#060818');
    }
    c.fillStyle = bg;
    c.fillRect(0, 0, PW, PH);
    // grote, zachte lichtveeg
    const vg = c.createLinearGradient(-40, 60, PW + 40, 250);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(0.5, hw ? 'rgba(255,150,70,.26)' : kerst ? 'rgba(255,236,190,.3)' : zomer ? 'rgba(255,250,190,.42)' : 'rgba(170,200,255,.3)');
    vg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = vg;
    c.fillRect(0, 0, PW, PH);
    // sterretjes (bij Halloween: vonkjes)
    let s = 4242;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = hw ? `rgba(${r() < 0.6 ? '255,170,70' : '200,140,255'},${0.08 + r() * 0.35})` : kerst ? `rgba(255,255,255,${0.12 + r() * 0.5})` : zomer ? `rgba(255,255,205,${0.1 + r() * 0.4})` : `rgba(190,210,255,${0.08 + r() * 0.35})`;
      const z = 0.5 + r() * 1.4;
      c.fillRect(r() * PW, r() * PH, z, z);
    }
    if (hw) {
      // vleermuizen
      const vleermuis = (x, y, k, rot) => {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.scale(k, k);
        c.beginPath();
        for (const g of [1, -1]) {
          c.moveTo(0, -3);
          c.lineTo(g * 3, -9);
          c.lineTo(g * 5, -3);
          c.quadraticCurveTo(g * 14, -10, g * 28, -4);
          c.quadraticCurveTo(g * 24, -1, g * 22, 7);
          c.quadraticCurveTo(g * 18, 2, g * 14, 8);
          c.quadraticCurveTo(g * 10, 3, g * 6, 9);
          c.quadraticCurveTo(g * 3, 5, 0, 10);
        }
        c.fillStyle = 'rgba(8,2,18,.9)';
        c.fill();
        c.restore();
      };
      vleermuis(40, 138, 0.9, -0.2);
      vleermuis(196, 152, 0.7, 0.25);
      vleermuis(48, 288, 0.65, 0.15);
      vleermuis(192, 276, 0.85, -0.3);
      // spinnenweb in de linkerbovenhoek
      c.save();
      c.strokeStyle = 'rgba(255,255,255,.26)';
      c.lineWidth = 0.7;
      const ox = 0;
      const oy = 26;
      for (let a = 0; a <= 5; a++) {
        const hoek = (a / 5) * (Math.PI / 2);
        c.beginPath();
        c.moveTo(ox, oy);
        c.lineTo(ox + Math.cos(hoek) * 74, oy + Math.sin(hoek) * 74);
        c.stroke();
      }
      for (const rad of [20, 38, 56, 72]) {
        c.beginPath();
        for (let a = 0; a <= 5; a++) {
          const hoek = (a / 5) * (Math.PI / 2);
          const px = ox + Math.cos(hoek) * rad;
          const py = oy + Math.sin(hoek) * rad;
          if (a === 0) c.moveTo(px, py);
          else {
            const hm = ((a - 0.5) / 5) * (Math.PI / 2);
            c.quadraticCurveTo(ox + Math.cos(hm) * rad * 0.9, oy + Math.sin(hm) * rad * 0.9, px, py);
          }
        }
        c.stroke();
      }
      c.restore();
    }
    if (kerst) {
      // sneeuwvlokken met zes armen
      const vlok = (x, y, k, a) => {
        c.save();
        c.translate(x, y);
        c.strokeStyle = `rgba(255,255,255,${a})`;
        c.lineWidth = 0.9;
        for (let i = 0; i < 6; i++) {
          c.rotate(Math.PI / 3);
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(0, -6 * k);
          c.moveTo(0, -3.6 * k);
          c.lineTo(-2.2 * k, -5.4 * k);
          c.moveTo(0, -3.6 * k);
          c.lineTo(2.2 * k, -5.4 * k);
          c.stroke();
        }
        c.restore();
      };
      [[38, 132, 1.5, 0.7], [204, 150, 1.1, 0.6], [30, 292, 1.2, 0.55], [206, 270, 1.6, 0.7], [118, 322, 0.9, 0.45], [214, 76, 0.9, 0.5], [22, 84, 0.8, 0.5]].forEach((a) => vlok(...a));
      // dennentakken in de onderhoeken, met rode besjes
      const tak = (x, y, len, rot, spiegel) => {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.scale(spiegel, 1);
        c.strokeStyle = '#0c3a1f';
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(len, 0);
        c.stroke();
        for (let i = 0; i < 12; i++) {
          const px = 6 + i * (len / 12.5);
          const nl = 15 * (1 - i / 16);
          c.strokeStyle = i % 2 ? '#1f8f4d' : '#27a85b';
          c.lineWidth = 2.2;
          for (const g of [-1, 1]) {
            c.beginPath();
            c.moveTo(px, 0);
            c.lineTo(px + nl * 0.55, g * nl);
            c.stroke();
          }
        }
        for (const [bx, by] of [[len * 0.3, -3], [len * 0.36, 4], [len * 0.45, -2]]) {
          c.beginPath();
          c.arc(bx, by, 2.6, 0, 6.2832);
          c.fillStyle = '#ff2d4a';
          c.fill();
          c.beginPath();
          c.arc(bx - 0.8, by - 0.8, 0.9, 0, 6.2832);
          c.fillStyle = 'rgba(255,255,255,.8)';
          c.fill();
        }
        c.restore();
      };
      tak(-4, PH - 28, 92, -0.42, 1);
      tak(PW + 4, PH - 28, 92, Math.PI + 0.42, 1);
      // een sneeuwlaag onder de bovenste klemrand en wat sneeuw onderaan
      c.fillStyle = 'rgba(255,255,255,.92)';
      c.beginPath();
      c.moveTo(0, 22);
      for (let x = 0; x <= PW; x += 6) c.lineTo(x, 28 + 5 * Math.sin(x * 0.19) + 3 * Math.sin(x * 0.53 + 1));
      c.lineTo(PW, 20);
      c.lineTo(0, 20);
      c.closePath();
      c.fill();
    }
    if (zomer) {
      // zonnestralen die schuin over de folie vallen
      c.save();
      c.translate(PW - 18, 10);
      for (let i = 0; i < 9; i++) {
        const hoek = 1.45 + i * 0.2;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(hoek - 0.045) * 420, Math.sin(hoek - 0.045) * 420);
        c.lineTo(Math.cos(hoek + 0.045) * 420, Math.sin(hoek + 0.045) * 420);
        c.closePath();
        c.fillStyle = 'rgba(255,248,190,.16)';
        c.fill();
      }
      c.restore();
      // de zon rechtsboven
      const zg = c.createRadialGradient(PW - 18, 34, 2, PW - 18, 34, 46);
      zg.addColorStop(0, 'rgba(255,255,230,1)');
      zg.addColorStop(0.3, 'rgba(255,230,90,.95)');
      zg.addColorStop(1, 'rgba(255,200,40,0)');
      c.fillStyle = zg;
      c.fillRect(PW - 70, 0, 80, 90);
      // golven met schuim onderaan en een strookje zand
      const golf = (y0, amp, kleur, fase) => {
        c.beginPath();
        c.moveTo(0, PH);
        for (let x = 0; x <= PW; x += 4) c.lineTo(x, y0 + amp * Math.sin(x * 0.045 + fase) + amp * 0.5 * Math.sin(x * 0.11 + fase * 2));
        c.lineTo(PW, PH);
        c.closePath();
        c.fillStyle = kleur;
        c.fill();
      };
      golf(PH - 54, 4, 'rgba(255,255,255,.55)', 0);
      golf(PH - 49, 4, '#0a9ec2', 1.2);
      golf(PH - 32, 3, '#f6dc8e', 2.5);
      golf(PH - 24, 2, '#e9c670', 0.3);
      // een palmboom linksonder
      c.save();
      c.translate(26, PH - 30);
      c.strokeStyle = '#6b4a22';
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(10, -50, 4, -96);
      c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.18)';
      c.lineWidth = 1;
      for (let i = 1; i < 9; i++) {
        c.beginPath();
        c.moveTo(-1 + i * 0.1, -i * 11);
        c.lineTo(7 + i * 0.1, -i * 11 - 2);
        c.stroke();
      }
      const blad = (hoek, len, kleur) => {
        c.save();
        c.translate(4, -96);
        c.rotate(hoek);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(len * 0.5, -len * 0.34, len, len * 0.18);
        c.quadraticCurveTo(len * 0.5, -len * 0.08, 0, 0);
        c.fillStyle = kleur;
        c.fill();
        c.restore();
      };
      blad(-2.9, 52, '#1c8a3c');
      blad(-2.3, 56, '#27a54b');
      blad(-1.6, 50, '#1c8a3c');
      blad(-0.9, 56, '#27a54b');
      blad(-0.2, 52, '#1c8a3c');
      blad(0.45, 46, '#1f9443');
      c.beginPath();
      c.arc(2, -92, 3.4, 0, 6.2832);
      c.arc(8, -90, 3.2, 0, 6.2832);
      c.fillStyle = '#7a4a1a';
      c.fill();
      c.restore();
    }
    // kreukels in de folie
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = -6; i < 8; i++) {
      c.beginPath();
      c.moveTo(i * 38 - 30, 0);
      c.lineTo(i * 38, 0);
      c.lineTo(i * 38 + 60, PH);
      c.lineTo(i * 38 + 38, PH);
      c.fill();
    }
    // een waaier van kaarten achter het embleem
    for (const [rot, kleur] of [[-0.3, 'rgba(255,255,255,.1)'], [0.26, 'rgba(255,255,255,.14)']]) {
      c.save();
      c.translate(PW / 2, 214);
      c.rotate(rot);
      c.beginPath();
      c.roundRect(-52, -78, 104, 156, 12);
      c.fillStyle = kleur;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = hw ? 'rgba(255,140,50,.55)' : kerst ? 'rgba(255,224,130,.75)' : zomer ? 'rgba(255,255,255,.6)' : 'rgba(255,214,120,.5)';
      c.stroke();
      c.restore();
    }
    // klemranden boven en onder met fijne ribbels
    for (const y0 of [0, PH - 26]) {
      const sg = c.createLinearGradient(0, y0, 0, y0 + 26);
      sg.addColorStop(0, y0 ? 'rgba(210,225,255,.12)' : 'rgba(210,225,255,.34)');
      sg.addColorStop(1, y0 ? 'rgba(210,225,255,.34)' : 'rgba(210,225,255,.12)');
      c.fillStyle = sg;
      c.fillRect(0, y0, PW, 26);
      for (let x = 0; x < PW; x += 2.4) {
        c.fillStyle = (x / 2.4) % 2 < 1 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,20,.25)';
        c.fillRect(x, y0, 1.2, 26);
      }
    }
    // scheurlijn
    const sy = PH * SCHEUR;
    c.setLineDash([5, 4]);
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(14, sy);
    c.lineTo(PW - 14, sy);
    c.stroke();
    c.setLineDash([]);
    c.font = `700 8px ${F_SPORT}`;
    spatie(c, 2.4);
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.textAlign = 'right';
    c.fillText('SCHEUR HIER', PW - 14, sy + 12);
    spatie(c, 0);
    // opdruk
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `800 11px ${F_SPORT}`;
    spatie(c, 5);
    c.fillStyle = 'rgba(255,255,255,.78)';
    c.fillText('SOMTODAY', PW / 2 + 2.5, 46);
    spatie(c, 0);
    // embleem
    const ey = 214;
    const ring = c.createLinearGradient(PW / 2 - 70, ey - 70, PW / 2 + 70, ey + 70);
    ring.addColorStop(0, '#fff2b0');
    ring.addColorStop(0.5, '#ffb92b');
    ring.addColorStop(1, '#ff6a3d');
    c.beginPath();
    c.arc(PW / 2, ey, 62, 0, 6.2832);
    c.fillStyle = 'rgba(5,8,30,.55)';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = ring;
    c.stroke();
    c.beginPath();
    c.arc(PW / 2, ey, 52, 0, 6.2832);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,255,255,.3)';
    c.stroke();
    if (hw) {
      const px = PW / 2;
      // de pompoen: vijf bolle lobben, het middelste voorop
      const lob = (dx, rx, kleur) => {
        c.beginPath();
        c.ellipse(px + dx, ey + 6, rx, 33, 0, 0, 6.2832);
        const pg = c.createLinearGradient(0, ey - 28, 0, ey + 40);
        pg.addColorStop(0, '#ffb13b');
        pg.addColorStop(0.55, kleur);
        pg.addColorStop(1, '#a83300');
        c.fillStyle = pg;
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = 'rgba(100,30,0,.55)';
        c.stroke();
      };
      lob(-27, 19, '#ee6a10');
      lob(27, 19, '#ee6a10');
      lob(-14, 24, '#ff7a14');
      lob(14, 24, '#ff7a14');
      lob(0, 25, '#ff8a1f');
      // steeltje
      c.beginPath();
      c.moveTo(px - 4, ey - 24);
      c.quadraticCurveTo(px - 2, ey - 36, px + 6, ey - 38);
      c.lineTo(px + 8, ey - 33);
      c.quadraticCurveTo(px + 3, ey - 31, px + 4, ey - 24);
      c.closePath();
      c.fillStyle = '#4f7a1c';
      c.fill();
      // het gezicht: gloeiend uitgesneden, alsof er een kaarsje in staat
      c.save();
      c.shadowColor = 'rgba(255,200,60,.95)';
      c.shadowBlur = 9;
      const gz = c.createLinearGradient(0, ey - 8, 0, ey + 30);
      gz.addColorStop(0, '#fff6b0');
      gz.addColorStop(1, '#ffb020');
      c.fillStyle = gz;
      c.beginPath();
      c.moveTo(px - 20, ey + 6);
      c.lineTo(px - 6, ey + 6);
      c.lineTo(px - 13, ey - 6);
      c.closePath();
      c.moveTo(px + 6, ey + 6);
      c.lineTo(px + 20, ey + 6);
      c.lineTo(px + 13, ey - 6);
      c.closePath();
      c.moveTo(px, ey + 9);
      c.lineTo(px - 4, ey + 17);
      c.lineTo(px + 4, ey + 17);
      c.closePath();
      c.moveTo(px - 24, ey + 20);
      c.lineTo(px + 24, ey + 20);
      c.lineTo(px + 18, ey + 32);
      c.lineTo(px + 12, ey + 25);
      c.lineTo(px + 6, ey + 34);
      c.lineTo(px, ey + 26);
      c.lineTo(px - 6, ey + 34);
      c.lineTo(px - 12, ey + 25);
      c.lineTo(px - 18, ey + 32);
      c.closePath();
      c.fill();
      c.restore();
    } else if (kerst) {
      // een kerstbal met een gouden dop en een glinsterende ster erboven
      const px = PW / 2;
      const by = ey + 6;
      const bal = c.createRadialGradient(px - 11, by - 12, 3, px, by, 36);
      bal.addColorStop(0, '#ff8a8a');
      bal.addColorStop(0.35, '#e0213c');
      bal.addColorStop(1, '#6e0818');
      c.beginPath();
      c.arc(px, by, 32, 0, 6.2832);
      c.fillStyle = bal;
      c.fill();
      // gouden banden en stippen
      c.save();
      c.beginPath();
      c.arc(px, by, 32, 0, 6.2832);
      c.clip();
      c.strokeStyle = '#ffd24a';
      c.lineWidth = 3.4;
      c.beginPath();
      c.ellipse(px, by, 32, 11, -0.25, 0, 6.2832);
      c.stroke();
      c.lineWidth = 1.6;
      c.strokeStyle = 'rgba(255,240,170,.9)';
      c.beginPath();
      c.ellipse(px, by + 4, 32, 11, -0.25, 0.2, 2.9);
      c.stroke();
      c.fillStyle = '#fff1b0';
      for (const [dx, dy] of [[-18, -8], [-6, -20], [16, -14], [22, 6], [-22, 14], [8, 22], [-4, 8]]) {
        c.beginPath();
        c.arc(px + dx, by + dy, 1.7, 0, 6.2832);
        c.fill();
      }
      c.restore();
      // glans
      c.beginPath();
      c.ellipse(px - 12, by - 14, 8, 4.6, -0.7, 0, 6.2832);
      c.fillStyle = 'rgba(255,255,255,.62)';
      c.fill();
      // dop en haakje
      c.fillStyle = '#e8b830';
      c.fillRect(px - 7, by - 41, 14, 9);
      c.fillStyle = '#fff0a8';
      c.fillRect(px - 7, by - 41, 14, 2.6);
      c.strokeStyle = '#e8b830';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(px, by - 46, 4.4, Math.PI * 0.1, Math.PI * 1.9, true);
      c.stroke();
      // de ster
      c.save();
      c.shadowColor = 'rgba(255,230,120,.95)';
      c.shadowBlur = 8;
      c.translate(px + 30, by - 34);
      c.rotate(0.2);
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? 6 : 14;
        const aa = (i / 10) * 6.2832 - Math.PI / 2;
        c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      c.closePath();
      const sg2 = c.createLinearGradient(0, -14, 0, 12);
      sg2.addColorStop(0, '#fffbd0');
      sg2.addColorStop(1, '#ffc020');
      c.fillStyle = sg2;
      c.fill();
      c.restore();
    } else if (zomer) {
      // een zon met stralen en een zonnebril, midden in de ring
      const px = PW / 2;
      c.save();
      c.shadowColor = 'rgba(255,220,80,.95)';
      c.shadowBlur = 10;
      c.strokeStyle = '#ffd43a';
      c.lineWidth = 3.2;
      c.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        const aa = (i / 14) * 6.2832;
        c.beginPath();
        c.moveTo(px + Math.cos(aa) * 31, ey + Math.sin(aa) * 31);
        c.lineTo(px + Math.cos(aa) * (i % 2 ? 40 : 45), ey + Math.sin(aa) * (i % 2 ? 40 : 45));
        c.stroke();
      }
      const zk = c.createRadialGradient(px - 6, ey - 8, 2, px, ey, 29);
      zk.addColorStop(0, '#fffbd0');
      zk.addColorStop(0.5, '#ffd23a');
      zk.addColorStop(1, '#ff9a1a');
      c.beginPath();
      c.arc(px, ey, 27, 0, 6.2832);
      c.fillStyle = zk;
      c.fill();
      c.restore();
      // zonnebril en glimlach
      c.fillStyle = '#10252e';
      c.beginPath();
      c.roundRect(px - 20, ey - 8, 17, 11, 4);
      c.roundRect(px + 3, ey - 8, 17, 11, 4);
      c.fill();
      c.fillRect(px - 4, ey - 6, 8, 2.4);
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.fillRect(px - 17, ey - 6, 6, 2);
      c.fillRect(px + 6, ey - 6, 6, 2);
      c.strokeStyle = '#8a3a08';
      c.lineWidth = 2.2;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(px, ey + 3, 12, 0.25, Math.PI - 0.25);
      c.stroke();
    } else {
      c.font = `800 86px ${F_DISPLAY}`;
      const qg = c.createLinearGradient(0, ey - 40, 0, ey + 40);
      qg.addColorStop(0, '#ffffff');
      qg.addColorStop(1, '#ffd98a');
      c.fillStyle = qg;
      c.fillText('?', PW / 2 + 2, ey + 6);
    }
    // naam
    c.font = `italic 900 44px ${F_SPORT}`;
    const ng = c.createLinearGradient(0, 96, 0, 130);
    ng.addColorStop(0, '#fff7d6');
    ng.addColorStop(0.55, '#ffc93a');
    ng.addColorStop(1, '#ff8a2a');
    c.fillStyle = ng;
    c.fillText('PACK OPENER', PW / 2, 112);
    c.font = `700 10px ${F_SPORT}`;
    spatie(c, 3);
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.fillText(pas(c, `${hw ? 'HALLOWEEN' : kerst ? 'KERST' : zomer ? 'ZOMER' : '1 CIJFER'} · ${data.vak.toUpperCase()}`, PW - 40), PW / 2 + 1.5, PH - 44);
    spatie(c, 0);
    c.restore();
    // metalen rand
    vorm();
    const rg = c.createLinearGradient(0, 0, PW, PH);
    rg.addColorStop(0, 'rgba(235,242,255,.85)');
    rg.addColorStop(0.5, 'rgba(140,160,220,.6)');
    rg.addColorStop(1, 'rgba(235,242,255,.75)');
    c.lineWidth = 2.4;
    c.strokeStyle = rg;
    c.stroke();
    return cv;
  }

  // ───────────────────────── Tekst voor de walkout ─────────────────────────
  // Vliegende tekst in de aanloop: een klein label en daaronder het woord, in schuine sportletters.
  function maakVliegTekst(label, str, kleur) {
    const cv = nieuw(1400, 380);
    const c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const txt = str.toUpperCase();
    const fs = pasFont(c, txt, 'italic 900', F_SPORT, 270, 90, 1260);
    c.font = `800 46px ${F_SPORT}`;
    spatie(c, 14);
    c.fillStyle = rgba(kleur, 0.9);
    c.fillText(label.toUpperCase(), 700 + 7, 70);
    spatie(c, 0);
    c.font = `italic 900 ${fs}px ${F_SPORT}`;
    c.lineJoin = 'round';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(0,10,40,.55)';
    c.strokeText(txt, 700, 70 + fs * 0.86);
    const g = c.createLinearGradient(0, 70, 0, 70 + fs);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c9d8ff');
    c.fillStyle = g;
    c.fillText(txt, 700, 70 + fs * 0.86);
    const w = Math.min(1260, c.measureText(txt).width);
    c.fillStyle = rgba(kleur, 0.95);
    c.beginPath();
    c.moveTo(700 - w / 2 + 24, 330);
    c.lineTo(700 + w / 2 + 24, 330);
    c.lineTo(700 + w / 2 - 6, 352);
    c.lineTo(700 - w / 2 - 6, 352);
    c.closePath();
    c.fill();
    return cv;
  }

  // Het plaatje dat tijdens de walkout in beeld schuift (zoals de club- en landenplaatjes bij FIFA).
  function maakPlaat(label, waarde, kleur) {
    const cv = nieuw(1200, 250);
    const c = cv.getContext('2d');
    const kl = rgba(kleur, 1);
    c.beginPath();
    c.moveTo(36, 10);
    c.lineTo(1190, 10);
    c.lineTo(1156, 240);
    c.lineTo(2, 240);
    c.closePath();
    const bg = c.createLinearGradient(0, 10, 0, 240);
    bg.addColorStop(0, 'rgba(26,32,66,.95)');
    bg.addColorStop(1, 'rgba(5,7,18,.97)');
    c.fillStyle = bg;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let x = -300; x < 1300; x += 22) {
      c.beginPath();
      c.moveTo(x, 240);
      c.lineTo(x + 40, 240);
      c.lineTo(x + 100, 10);
      c.lineTo(x + 60, 10);
      c.fill();
    }
    const gl = c.createLinearGradient(0, 10, 0, 120);
    gl.addColorStop(0, 'rgba(255,255,255,.14)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.fillRect(0, 10, 1200, 110);
    c.restore();
    c.fillStyle = kl;
    c.beginPath();
    c.moveTo(36, 10);
    c.lineTo(78, 10);
    c.lineTo(44, 240);
    c.lineTo(2, 240);
    c.closePath();
    c.fill();
    c.strokeStyle = rgba(kleur, 0.8);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(36, 10);
    c.lineTo(1190, 10);
    c.lineTo(1156, 240);
    c.lineTo(2, 240);
    c.closePath();
    c.stroke();
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = `800 42px ${F_SPORT}`;
    spatie(c, 12);
    c.fillStyle = kl;
    c.fillText(label.toUpperCase(), 118, 80);
    spatie(c, 0);
    const txt = waarde.toUpperCase();
    const fs = pasFont(c, txt, 'italic 900', F_SPORT, 140, 56, 1000);
    c.fillStyle = '#fff';
    c.fillText(pas(c, txt, 1000), 112, 80 + fs * 0.86);
    return cv;
  }

  // De titel na de onthulling: een groot woord met een regel eronder.
  function maakTitel(data) {
    const cv = nieuw(1500, 360);
    const c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const T = data.T;
    const txt = data.zeldzaam ? 'ZELDZAAM!' : T.label.toUpperCase();
    const fs = pasFont(c, txt, 'italic 900', F_SPORT, 215, 90, 1380);
    c.font = `italic 900 ${fs}px ${F_SPORT}`;
    c.lineJoin = 'round';
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(0,0,0,.5)';
    c.strokeText(txt, 750, 12 + fs * 0.86);
    let g;
    if (data.zeldzaam) {
      // een zeldzame kaart heeft een regenboogtitel, en je cijfer-niveau staat eronder
      g = c.createLinearGradient(150, 0, 1350, 0);
      ['#ff6b6b', '#ffd24a', '#6bff9e', '#38e1ff', '#b07bff', '#ff5fd2'].forEach((k, i, l) => g.addColorStop(i / (l.length - 1), k));
    } else {
      g = c.createLinearGradient(0, 12, 0, 12 + fs);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, rgba(T.kleur, 1));
      g.addColorStop(1, rgba(T.kleur2, 1));
    }
    c.fillStyle = g;
    c.fillText(txt, 750, 12 + fs * 0.86);
    c.font = `800 60px ${F_SPORT}`;
    spatie(c, 8);
    const regel = data.zeldzaam ? `${T.label.toUpperCase()}  ·  ${T.naam.toUpperCase()}` : `${T.naam.toUpperCase()}  ·  ${T.sub.toUpperCase()}`;
    c.lineWidth = 9;
    c.strokeStyle = 'rgba(0,0,0,.55)';
    c.strokeText(regel, 750 + 4, 342);
    if (data.zeldzaam) {
      const zg = c.createLinearGradient(300, 0, 1200, 0);
      zg.addColorStop(0, '#fff3b0');
      zg.addColorStop(0.5, '#ffc93a');
      zg.addColorStop(1, '#ff9a3a');
      c.fillStyle = zg;
    } else c.fillStyle = 'rgba(255,255,255,.95)';
    c.fillText(regel, 750 + 4, 342);
    spatie(c, 0);
    return cv;
  }

  // Alle lagen van de kaart op elkaar, met een stilstaande versie van het folie-effect (voor de opgeslagen plaatjes).
  // Het canvas c staat op de linkerbovenhoek van de kaart; sch is het aantal pixels per ontwerp-eenheid.
  function plakKaart(c, data, lagen, sch, metNaam, schaduw) {
    const w = CW * sch;
    const h = CH * sch;
    c.save();
    if (schaduw) schaduw(c);
    c.drawImage(lagen.bg, 0, 0, w, h);
    c.restore();
    // folie: een regenboog (of metaalkleur) over het patroon, plus een zachte lichtbaan
    if (lagen.patroon) {
      const tier = data.tier;
      const tmp = nieuw(w, h);
      const t = tmp.getContext('2d');
      t.drawImage(lagen.patroon, 0, 0, w, h);
      t.globalCompositeOperation = 'destination-out';
      t.fillRect(0, PLAAT_Y * sch, w, h);
      t.globalCompositeOperation = 'source-in';
      const g = t.createLinearGradient(0, 0, w, h);
      const reeks =
        tier === 4 || data.zeldzaam
          ? ['#ff8fb8', '#ffe27a', '#8fffc4', '#6fd8ff', '#c39bff', '#ff8fb8']
          : tier === 3
            ? ['#35e6ff', '#7a7dff', '#35e6ff', '#9a6bff']
            : tier === 2
              ? ['#fff2b0', '#ffc94a', '#fff6cf', '#ffb040']
              : tier === 1
                ? ['#ffffff', '#9fd0ff', '#ffffff', '#c8b8ff']
                : ['#ffd9a0', '#ff9a50', '#ffe2b8', '#d07a3a'];
      reeks.forEach((k, i, l) => g.addColorStop(i / (l.length - 1), k));
      t.fillStyle = g;
      t.fillRect(0, 0, w, h);
      c.save();
      c.scale(sch, sch);
      kaartPad(c, 0);
      c.clip();
      c.scale(1 / sch, 1 / sch);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = [0.18, 0.3, 0.3, 0.4, 0.3][tier] * (data.zeldzaam ? 1.3 : 1);
      c.drawImage(tmp, 0, 0);
      c.restore();
    }
    c.save();
    c.scale(sch, sch);
    kaartPad(c, 0);
    c.clip();
    const bn = c.createLinearGradient(CW * 0.15, 0, CW * 0.75, CH * 0.6);
    bn.addColorStop(0, 'rgba(255,255,255,0)');
    bn.addColorStop(0.45, 'rgba(255,255,255,.1)');
    bn.addColorStop(0.55, 'rgba(255,255,255,.04)');
    bn.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = bn;
    c.fillRect(0, 0, CW, CH);
    c.restore();
    c.drawImage(lagen.mid, 0, 0, w, h);
    c.drawImage(metNaam ? lagen.fgNaam || lagen.fg : lagen.fg, 0, 0, w, h);
    const [x0, y0, x1, y1] = CIJFER_RECT;
    c.drawImage(lagen.cijfer, x0 * sch, y0 * sch, (x1 - x0) * sch, (y1 - y0) * sch);
  }

  // Voor ‘Opslaan als afbeelding’: de kaart in één plaatje op een mooie achtergrond.
  function maakAfbeelding(data, lagen) {
    const sch = 3.2;
    const pad = 44;
    const cv = nieuw((CW + pad * 2) * sch, (CH + pad * 2) * sch);
    const c = cv.getContext('2d');
    const bg = c.createRadialGradient(cv.width / 2, cv.height / 2, 0, cv.width / 2, cv.height / 2, cv.height * 0.7);
    bg.addColorStop(0, rgba(data.T.kleur2, 0.55));
    bg.addColorStop(0.5, '#0a0d24');
    bg.addColorStop(1, '#03040b');
    c.fillStyle = bg;
    c.fillRect(0, 0, cv.width, cv.height);
    c.save();
    c.translate(pad * sch, pad * sch);
    plakKaart(c, data, lagen, sch, true, (x) => {
      x.shadowColor = rgba(data.T.kleur, 0.9);
      x.shadowBlur = 60 * sch * 0.4;
    });
    c.restore();
    return cv;
  }

  // Een plaatje om te delen (Snapchat, Instagram, ...): de kaart groot op een donkere achtergrond, met de naam erop.
  function maakDeelplaat(data, lagen) {
    const W = 1080;
    const H = 1350;
    const sch = 2.12;
    const cv = nieuw(W, H);
    const c = cv.getContext('2d');
    c.fillStyle = '#05060c';
    c.fillRect(0, 0, W, H);
    const gl = c.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H * 0.62);
    gl.addColorStop(0, rgba(data.T.kleur2, 0.6));
    gl.addColorStop(0.45, rgba(data.T.kleur2, 0.16));
    gl.addColorStop(1, 'rgba(5,6,12,0)');
    c.fillStyle = gl;
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H * 0.5);
    for (let i = 0; i < 18; i++) {
      c.rotate(Math.PI / 9);
      const st = c.createLinearGradient(0, 0, 0, -H);
      st.addColorStop(0, rgba(data.T.kleur, 0.2));
      st.addColorStop(1, rgba(data.T.kleur, 0));
      c.fillStyle = st;
      c.beginPath();
      c.moveTo(-9, 0);
      c.lineTo(9, 0);
      c.lineTo(0, -H);
      c.fill();
    }
    c.restore();
    c.save();
    c.translate((W - CW * sch) / 2, 150);
    plakKaart(c, data, lagen, sch, true, (x) => {
      x.shadowColor = rgba(data.T.kleur, 0.9);
      x.shadowBlur = 70;
    });
    c.restore();
    c.textAlign = 'center';
    c.fillStyle = '#fff';
    c.globalAlpha = 0.75;
    c.font = `700 26px ${F_SPORT}`;
    spatie(c, 6);
    c.fillText('SOMTODAY PACK OPENER', W / 2, 92);
    c.globalAlpha = 0.9;
    c.font = `800 38px ${F_SPORT}`;
    spatie(c, 3);
    c.fillText('SOMEREVEAL.NL', W / 2, H - 70);
    spatie(c, 0);
    c.globalAlpha = 1;
    return cv;
  }

  // Een kleine kaart met gloed op een doorzichtige achtergrond (webp), voor de galerij.
  function maakMiniatuur(data, lagen, breedte = 280) {
    const pad = 46;
    const sch = breedte / (CW + pad * 2);
    const cv = nieuw(breedte, Math.round((CH + pad * 2) * sch));
    const c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.save();
    c.translate(pad * sch, pad * sch);
    plakKaart(c, data, lagen, sch, false, (x) => {
      x.shadowColor = rgba(data.T.kleur, 0.85);
      x.shadowBlur = 36 * sch;
    });
    c.restore();
    const url = cv.toDataURL('image/webp', 0.9);
    return url.indexOf('data:image/webp') === 0 || breedte <= 200 ? url : maakMiniatuur(data, lagen, 200); // zonder webp (Firefox) wordt het een png: dan kleiner
  }

  const draai = (gen) => {
    let r;
    while (!(r = gen.next()).done);
    return r.value;
  };
  const maakKaartLagen = (data) => draai(kaartGen(data));

  // Alles wat de animatie nodig heeft, in stukjes. De kaart en de titel zijn voor elke opening hetzelfde; het
  // pakje en de plaatjes bestaan alleen bij de pakje-opening, en de andere openingen maken hun eigen
  // afbeeldingen (SPO.openingen[naam].art, als gewone functie of als generator die tussendoor yield).
  function* allesGen(d) {
    const kleur = d.T.kleur;
    const lagen = yield* kaartGen(d);
    yield;
    const pakje = d.opening === 'pak';
    const pak = pakje ? maakPak(d) : null;
    yield;
    const titel = maakTitel(d);
    // de vliegende teksten zijn koel en neutraal: het niveau mag nog niet te zien zijn
    const koel = [0.55, 0.75, 1];
    const vakTekst = pakje && !d.snel ? maakVliegTekst('Vak', d.vak, koel) : null;
    const onderTekst = pakje && !d.snel ? maakVliegTekst('Onderwerp', d.onder, koel) : null;
    yield;
    const platen = pakje && d.walkout ? [maakPlaat('Vak', d.vak, kleur), maakPlaat('Onderwerp', d.onder, kleur), maakPlaat('Weging', `${d.weging}×  ·  Cijfer ???`, kleur)] : null;
    let opening = null;
    const op = SPO.openingen && SPO.openingen[d.opening];
    if (op && op.art) {
      yield;
      const g = op.art(d, { art: SPO.art });
      opening = g && typeof g.next === 'function' ? yield* g : g;
    }
    const zeld = d.zeldzaam && SPO.zeldzaam ? SPO.zeldzaam.maakArt(d) : null;
    return { lagen, pak, titel, vakTekst, onderTekst, platen, opening, zeld };
  }

  // pauze: een functie die een belofte geeft; daarin mag de browser andere dingen doen.
  async function maakAllesAsync(d, pauze) {
    const gen = allesGen(d);
    let r;
    while (!(r = gen.next()).done) await pauze();
    return r.value;
  }

  SPO.art = {
    maakAllesAsync,
    CW, CH, PW, PH, SCHEUR, CIJFER_RECT, F_SPORT, F_DISPLAY, F_TEKST,
    laadLettertypes, maakKaartLagen, maakMiniatuur, maakPak, maakVliegTekst, maakPlaat, maakTitel, maakAfbeelding, maakDeelplaat, icoonVoorVak, icoon, nieuw,
  };
})();
