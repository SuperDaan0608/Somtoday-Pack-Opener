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
  const CIJFER_RECT = [18, 34, 114, 128]; // waar het cijfer op de kaart staat (ontwerpmaat)
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

  function korrel(c, n, seed, a0, a1) {
    // metaalkorrel: duizenden kleine stipjes, vast per kaart
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a0 + r() * a1})` : `rgba(0,0,0,${a0 + r() * a1})`;
      c.fillRect(r() * CW, r() * CH, 0.5 + r() * 1.1, 0.5 + r() * 0.8);
    }
  }

  // Het patroon van elk niveau komt op een eigen laag, zodat we er ook een folie-masker van kunnen maken.
  function tekenPatroon(c, data) {
    const t = data.tier;
    let s = 1234567;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    if (t === 0) {
      // geborsteld brons
      for (let i = 0; i < 230; i++) {
        const y = r() * CH;
        const x = r() * CW;
        const l = 40 + r() * 220;
        c.strokeStyle = r() < 0.55 ? `rgba(255,225,180,${0.04 + r() * 0.1})` : `rgba(40,15,0,${0.05 + r() * 0.1})`;
        c.lineWidth = 0.4 + r() * 1.2;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + l, y + l * 0.05);
        c.stroke();
      }
    } else if (t === 1) {
      // fijn ruitpatroon
      c.lineWidth = 0.7;
      for (let i = -CH; i < CW + CH; i += 12) {
        c.strokeStyle = 'rgba(255,255,255,.22)';
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + CH, CH);
        c.stroke();
        c.strokeStyle = 'rgba(60,80,110,.14)';
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i - CH, CH);
        c.stroke();
      }
    } else if (t === 2) {
      // zonnestralen vanuit linksboven en fijne strepen
      c.fillStyle = 'rgba(255,248,200,.2)';
      for (let i = 0; i < 26; i++) {
        const a0 = (i / 26) * Math.PI * 0.62 - 0.05;
        const a1 = a0 + (Math.PI * 0.62) / 52;
        c.beginPath();
        c.moveTo(40, 40);
        c.lineTo(40 + Math.cos(a0) * 700, 40 + Math.sin(a0) * 700);
        c.lineTo(40 + Math.cos(a1) * 700, 40 + Math.sin(a1) * 700);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = 'rgba(120,70,0,.16)';
      c.lineWidth = 0.6;
      for (let i = -CH; i < CW + CH; i += 7) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + CH * 0.7, CH);
        c.stroke();
      }
    } else if (t === 3) {
      // zeshoeken met neon-lijnen
      const hs = 17;
      const hh = hs * Math.sqrt(3);
      for (let row = -1; row < CH / hh + 2; row++) {
        for (let col = -1; col < CW / (hs * 1.5) + 2; col++) {
          const cx = col * hs * 1.5;
          const cy = row * hh + (col % 2 ? hh / 2 : 0);
          const gl = r();
          c.strokeStyle = gl > 0.9 ? 'rgba(120,240,255,.7)' : `rgba(60,190,255,${0.1 + gl * 0.2})`;
          c.lineWidth = gl > 0.9 ? 1.4 : 0.8;
          c.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            const px = cx + Math.cos(a) * hs * 0.94;
            const py = cy + Math.sin(a) * hs * 0.94;
            if (k) c.lineTo(px, py);
            else c.moveTo(px, py);
          }
          c.closePath();
          c.stroke();
          if (gl > 0.93) {
            c.fillStyle = 'rgba(80,220,255,.16)';
            c.fill();
          }
        }
      }
      // lichtbundels
      for (let i = 0; i < 5; i++) {
        const x = 20 + r() * 260;
        const gr = c.createLinearGradient(x, 0, x, CH);
        gr.addColorStop(0, 'rgba(120,240,255,0)');
        gr.addColorStop(0.5, 'rgba(120,240,255,.22)');
        gr.addColorStop(1, 'rgba(120,240,255,0)');
        c.fillStyle = gr;
        c.fillRect(x, 0, 2 + r() * 3, CH);
      }
    } else {
      // parelmoer met sierringen
      c.lineWidth = 0.8;
      for (let k = 0; k < 16; k++) {
        c.strokeStyle = `rgba(255,255,255,${0.35 - k * 0.012})`;
        c.beginPath();
        c.arc(150, 170, 34 + k * 17, 0, 6.2832);
        c.stroke();
        c.fillStyle = 'rgba(255,255,255,.55)';
        for (let d = 0; d < 28; d++) {
          const a = (d / 28) * 6.2832 + k * 0.4;
          c.fillRect(150 + Math.cos(a) * (34 + k * 17) - 0.7, 170 + Math.sin(a) * (34 + k * 17) - 0.7, 1.4, 1.4);
        }
      }
    }
  }

  // De kaart wordt in stukjes gemaakt (een generator): na elk stuk kan de browser even iets anders doen.
  function* kaartGen(data) {
    const T = data.T;
    const tier = data.tier;
    const S = 3.2; // pixels per ontwerp-eenheid voor achtergrond en voorgrond
    const pal = T.pal;

    // ───── achtergrond ─────
    const bg = nieuw(CW * S, CH * S);
    const c = bg.getContext('2d');
    c.scale(S, S);
    kaartPad(c, 0);
    c.save();
    c.clip();
    const gr = c.createLinearGradient(0, 0, CW, CH);
    gr.addColorStop(0, pal[0]);
    gr.addColorStop(0.45, pal[1]);
    gr.addColorStop(0.72, pal[2]);
    gr.addColorStop(1, pal[1]);
    c.fillStyle = gr;
    c.fillRect(0, 0, CW, CH);
    if (tier === 4) {
      // pastelkleurige wassingen over het parelmoer
      for (const [x, y, k] of [[60, 80, 'rgba(255,150,210,.34)'], [240, 150, 'rgba(120,220,255,.34)'], [100, 330, 'rgba(190,150,255,.3)'], [230, 380, 'rgba(255,230,140,.35)']]) {
        const rg = c.createRadialGradient(x, y, 0, x, y, 170);
        rg.addColorStop(0, k);
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = rg;
        c.fillRect(0, 0, CW, CH);
      }
    }
    const hl = c.createRadialGradient(70, 40, 0, 70, 40, 280);
    hl.addColorStop(0, `rgba(255,255,255,${tier === 3 ? 0.16 : 0.36})`);
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    c.fillRect(0, 0, CW, CH);
    korrel(c, 5200, 77, 0.03, 0.07);
    // patroon op een eigen laag: voor de kleur én voor het masker
    const pat = nieuw(CW * S, CH * S);
    const pc = pat.getContext('2d');
    pc.scale(S, S);
    tekenPatroon(pc, data);
    c.drawImage(pat, 0, 0, CW, CH);
    // donkere onderkant voor de tekst
    const band = c.createLinearGradient(0, CH - 200, 0, CH);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(1, tier === 3 ? 'rgba(0,0,30,.5)' : 'rgba(30,15,0,.16)');
    c.fillStyle = band;
    c.fillRect(0, CH - 200, CW, 200);
    // vignet
    const vg = c.createRadialGradient(150, 200, 120, 150, 210, 300);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, tier === 4 ? 'rgba(120,90,40,.2)' : 'rgba(0,0,0,.28)');
    c.fillStyle = vg;
    c.fillRect(0, 0, CW, CH);
    c.restore();

    // lijsten: een metalen rand en twee dunne binnenlijnen
    const lijst = (ins, w, kleur) => {
      kaartPad(c, ins);
      c.lineWidth = w;
      c.strokeStyle = kleur;
      c.stroke();
    };
    const rand = c.createLinearGradient(0, 0, CW, CH);
    if (tier === 3) {
      rand.addColorStop(0, '#fff2b3');
      rand.addColorStop(0.5, '#4fd7ff');
      rand.addColorStop(1, '#ffd86a');
    } else {
      rand.addColorStop(0, '#ffffff');
      rand.addColorStop(0.5, pal[2]);
      rand.addColorStop(1, pal[0]);
    }
    lijst(2.5, 5, rand);
    lijst(9, 1.4, 'rgba(255,255,255,.55)');
    lijst(12.5, 0.9, 'rgba(0,0,0,.28)');
    // naamplaat
    c.save();
    kaartPad(c, 14);
    c.clip();
    c.fillStyle = tier === 3 ? 'rgba(2,8,40,.5)' : 'rgba(255,255,255,.1)';
    c.fillRect(0, 262, CW, 2);
    c.restore();

    yield;
    // ───── masker: R folie, G glinstering, B reliëf ─────
    const MS = 1.6;
    const mk = nieuw(CW * MS, CH * MS);
    const mc = mk.getContext('2d');
    mc.fillStyle = '#000';
    mc.fillRect(0, 0, mk.width, mk.height);
    mc.globalCompositeOperation = 'lighter';
    // R: het patroon, ingekleurd
    const tmp = nieuw(mk.width, mk.height);
    const tc = tmp.getContext('2d');
    tc.drawImage(pat, 0, 0, tmp.width, tmp.height);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = '#f00';
    tc.fillRect(0, 0, tmp.width, tmp.height);
    mc.globalAlpha = tier === 0 ? 0.5 : 1;
    mc.drawImage(tmp, 0, 0);
    mc.globalAlpha = 1;
    // de lijst glanst ook
    mc.save();
    mc.scale(MS, MS);
    kaartPad(mc, 2.5);
    mc.lineWidth = 7;
    mc.strokeStyle = 'rgb(255,120,0)';
    mc.stroke();
    // G: glinstering op de lijst en in een gloeiende band
    kaartPad(mc, 2.5);
    mc.lineWidth = 9;
    mc.strokeStyle = 'rgb(0,255,0)';
    mc.stroke();
    const gl = mc.createLinearGradient(0, 0, CW, CH);
    gl.addColorStop(0, 'rgba(0,255,0,.0)');
    gl.addColorStop(0.5, 'rgba(0,255,0,.7)');
    gl.addColorStop(1, 'rgba(0,255,0,.0)');
    mc.fillStyle = gl;
    kaartPad(mc, 4);
    mc.fill();
    // B: reliëf: de vorm wazig + de lijsten
    mc.filter = 'blur(3px)';
    mc.fillStyle = 'rgb(0,0,200)';
    kaartPad(mc, 5);
    mc.fill();
    mc.filter = 'none';
    mc.strokeStyle = 'rgb(0,0,255)';
    mc.lineWidth = 2;
    kaartPad(mc, 9);
    mc.stroke();
    mc.fillStyle = 'rgb(0,0,255)';
    mc.fillRect(26, 262, CW - 52, 2);
    mc.restore();

    yield;
    // ───── midden: het silhouet en het vakpictogram ─────
    const MIDS = 2.133;
    const mid = nieuw(CW * MIDS, CH * MIDS);
    const md = mid.getContext('2d');
    md.scale(MIDS, MIDS);
    kaartPad(md, 0);
    md.clip();
    const naam = icoonVoorVak(data.vak);
    const donker = tier !== 3;
    // groot vakpictogram als watermerk
    md.save();
    md.strokeStyle = tier === 3 ? 'rgba(120,235,255,.35)' : tier === 4 ? 'rgba(120,80,40,.22)' : 'rgba(255,255,255,.3)';
    md.fillStyle = md.strokeStyle;
    icoon(md, naam, 172, 150, 230, 7);
    md.restore();
    // silhouet van de leerling
    const bx = 168;
    const by = 160;
    const bh = 215;
    md.save();
    const sg = md.createLinearGradient(0, by - bh * 0.4, 0, by + bh * 0.5);
    if (donker) {
      sg.addColorStop(0, 'rgba(26,14,4,.9)');
      sg.addColorStop(0.7, 'rgba(26,14,4,.82)');
      sg.addColorStop(1, 'rgba(26,14,4,0)');
    } else {
      sg.addColorStop(0, 'rgba(225,250,255,.95)');
      sg.addColorStop(0.7, 'rgba(150,220,255,.8)');
      sg.addColorStop(1, 'rgba(150,220,255,0)');
    }
    md.fillStyle = sg;
    const pad = () => {
      md.beginPath();
      md.ellipse(bx, by - bh * 0.2, bh * 0.165, bh * 0.2, 0, 0, 6.2832);
      md.moveTo(bx - bh * 0.07, by + 0);
      md.lineTo(bx + bh * 0.07, by + 0);
      md.quadraticCurveTo(bx + bh * 0.1, by + bh * 0.1, bx + bh * 0.38, by + bh * 0.2);
      md.quadraticCurveTo(bx + bh * 0.5, by + bh * 0.27, bx + bh * 0.5, by + bh * 0.5);
      md.lineTo(bx - bh * 0.5, by + bh * 0.5);
      md.quadraticCurveTo(bx - bh * 0.5, by + bh * 0.27, bx - bh * 0.38, by + bh * 0.2);
      md.quadraticCurveTo(bx - bh * 0.1, by + bh * 0.1, bx - bh * 0.07, by);
      md.closePath();
    };
    pad();
    md.fill();
    // randlicht: een lichte rand links en boven
    md.save();
    pad();
    md.clip();
    const rl = md.createLinearGradient(bx - bh * 0.5, by - bh * 0.4, bx + bh * 0.1, by + bh * 0.2);
    rl.addColorStop(0, donker ? 'rgba(255,225,170,.55)' : 'rgba(255,255,255,.7)');
    rl.addColorStop(0.35, 'rgba(255,255,255,0)');
    md.fillStyle = rl;
    md.fillRect(0, 0, CW, CH);
    md.restore();
    // rugzakbandjes
    md.globalAlpha = 0.28;
    md.strokeStyle = donker ? '#fff' : '#012';
    md.lineWidth = bh * 0.045;
    md.lineCap = 'round';
    for (const s of [-1, 1]) {
      md.beginPath();
      md.moveTo(bx + s * bh * 0.2, by + bh * 0.16);
      md.quadraticCurveTo(bx + s * bh * 0.24, by + bh * 0.32, bx + s * bh * 0.22, by + bh * 0.48);
      md.stroke();
    }
    md.restore();

    yield;
    // ───── voorgrond: teksten en emblemen ─────
    const fg = nieuw(CW * S, CH * S);
    const f = fg.getContext('2d');
    f.scale(S, S);
    const tk = T.tekst;
    f.fillStyle = tk;
    f.strokeStyle = tk;
    f.textAlign = 'center';
    f.textBaseline = 'alphabetic';
    // afkorting onder het cijfer
    f.font = `800 22px ${F_SPORT}`;
    spatie(f, 2);
    f.fillText(data.afkorting, 66, 150);
    spatie(f, 0);
    f.globalAlpha = 0.5;
    f.fillRect(40, 158, 52, 2);
    f.globalAlpha = 1;
    // embleem met het pictogram van het vak
    f.beginPath();
    f.arc(66, 196, 24, 0, 6.2832);
    f.globalAlpha = 0.13;
    f.fill();
    f.globalAlpha = 1;
    f.lineWidth = 2;
    f.stroke();
    icoon(f, naam, 66, 196, 27, 2.1);
    // weging
    f.font = `800 17px ${F_SPORT}`;
    spatie(f, 1);
    f.fillText(`${data.weging}×`, 66, 242);
    spatie(f, 0);
    f.font = `600 9px ${F_SPORT}`;
    spatie(f, 2);
    f.globalAlpha = 0.65;
    f.fillText('WEGING', 66, 253);
    f.globalAlpha = 1;
    spatie(f, 0);
    // naam van het vak
    const naamTekst = data.vak.toUpperCase();
    pasFont(f, naamTekst, 'italic 900', F_SPORT, 40, 20, CW - 44);
    f.fillText(pas(f, naamTekst, CW - 44), 150, 296);
    f.globalAlpha = 0.5;
    f.fillRect(40, 304, CW - 80, 1.5);
    f.globalAlpha = 1;
    f.font = `600 15px ${F_SPORT}`;
    spatie(f, 0.6);
    f.fillText(pas(f, data.onder, CW - 56), 150, 322);
    spatie(f, 0);
    // zes stats met een streepje ertussen
    for (let i = 0; i < 6; i++) {
      const x = 62 + (i % 3) * 88;
      const y = 352 + Math.floor(i / 3) * 27;
      f.textAlign = 'right';
      f.font = `900 22px ${F_SPORT}`;
      f.fillText(String(data.statWaarde(i)), x + 8, y);
      f.textAlign = 'left';
      f.font = `600 14px ${F_SPORT}`;
      f.globalAlpha = 0.8;
      f.fillText(data.STATS[i], x + 13, y - 0.5);
      f.globalAlpha = 1;
    }
    f.globalAlpha = 0.35;
    f.fillRect(106, 336, 1.2, 50);
    f.fillRect(194, 336, 1.2, 50);
    f.globalAlpha = 1;
    f.textAlign = 'center';
    f.globalAlpha = 0.55;
    f.font = `700 9.5px ${F_SPORT}`;
    spatie(f, 2);
    f.fillText(`${T.naam.toUpperCase()} · ${data.datum.toUpperCase()}`, 150, 418);
    spatie(f, 0);
    f.globalAlpha = 1;

    yield;
    // ───── achterkant ─────
    const BS = 2.133;
    const ach = nieuw(CW * BS, CH * BS);
    const a = ach.getContext('2d');
    a.scale(BS, BS);
    kaartPad(a, 0);
    a.save();
    a.clip();
    const ag = a.createLinearGradient(0, 0, CW, CH);
    ag.addColorStop(0, '#1b2160');
    ag.addColorStop(0.5, '#0b0e30');
    ag.addColorStop(1, '#04050f');
    a.fillStyle = ag;
    a.fillRect(0, 0, CW, CH);
    a.strokeStyle = 'rgba(255,255,255,.05)';
    a.lineWidth = 1;
    for (let i = -CH; i < CH; i += 10) {
      a.beginPath();
      a.moveTo(0, i);
      a.lineTo(CW, i + CW);
      a.stroke();
    }
    const eg = a.createLinearGradient(80, 100, 220, 280);
    eg.addColorStop(0, '#ffe27a');
    eg.addColorStop(0.5, '#ffb020');
    eg.addColorStop(1, '#ff6a3d');
    a.lineWidth = 4;
    a.strokeStyle = eg;
    a.beginPath();
    a.arc(150, 200, 74, 0, 6.2832);
    a.stroke();
    a.lineWidth = 1.2;
    a.strokeStyle = 'rgba(255,255,255,.25)';
    a.beginPath();
    a.arc(150, 200, 64, 0, 6.2832);
    a.stroke();
    a.fillStyle = '#fff';
    a.font = `800 110px ${F_DISPLAY}`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    a.shadowColor = '#ffb020';
    a.shadowBlur = 18;
    a.fillText('?', 153, 206);
    a.shadowBlur = 0;
    a.font = `800 13px ${F_SPORT}`;
    spatie(a, 5);
    a.fillStyle = 'rgba(255,255,255,.6)';
    a.fillText('PACK OPENER', 152, CH - 76);
    a.restore();
    kaartPad(a, 2.5);
    a.lineWidth = 5;
    a.strokeStyle = 'rgba(210,220,255,.7)';
    a.stroke();
    kaartPad(a, 9);
    a.lineWidth = 1.2;
    a.strokeStyle = 'rgba(255,255,255,.3)';
    a.stroke();

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
      cc.fillStyle = tk;
      const w = x1 - x0 - 8;
      const fs = pasFont(cc, str, 'italic 900', F_SPORT, 86, 40, w);
      spatie(cc, -1);
      cc.fillText(str, (x1 - x0) / 2 + 2, (y1 - y0) * 0.79 + (fs < 70 ? 0 : 0));
      spatie(cc, 0);
      cc.restore();
    };
    zetCijfer(data.cijferTekst);

    return {
      bg,
      mid,
      fg,
      masker: mk,
      achter: ach,
      cijfer,
      zetCijfer,
      cijferRect: [x0 / CW, y0 / CH, x1 / CW, y1 / CH],
    };
  }

  // ───────────────────────── Het pakje ─────────────────────────
  function maakPak(data) {
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
    bg.addColorStop(0, '#4650d8');
    bg.addColorStop(0.35, '#262e98');
    bg.addColorStop(0.72, '#111650');
    bg.addColorStop(1, '#060818');
    c.fillStyle = bg;
    c.fillRect(0, 0, PW, PH);
    // grote, zachte lichtveeg
    const vg = c.createLinearGradient(-40, 60, PW + 40, 250);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(0.5, 'rgba(170,200,255,.3)');
    vg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = vg;
    c.fillRect(0, 0, PW, PH);
    // sterretjes
    let s = 4242;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `rgba(190,210,255,${0.08 + r() * 0.35})`;
      const z = 0.5 + r() * 1.4;
      c.fillRect(r() * PW, r() * PH, z, z);
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
      c.strokeStyle = 'rgba(255,214,120,.5)';
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
    c.font = `800 86px ${F_DISPLAY}`;
    const qg = c.createLinearGradient(0, ey - 40, 0, ey + 40);
    qg.addColorStop(0, '#ffffff');
    qg.addColorStop(1, '#ffd98a');
    c.fillStyle = qg;
    c.fillText('?', PW / 2 + 2, ey + 6);
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
    c.fillText(pas(c, `1 CIJFER · ${data.vak.toUpperCase()}`, PW - 40), PW / 2 + 1.5, PH - 44);
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
    const txt = T.label.toUpperCase();
    const fs = pasFont(c, txt, 'italic 900', F_SPORT, 215, 90, 1380);
    c.font = `italic 900 ${fs}px ${F_SPORT}`;
    c.lineJoin = 'round';
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(0,0,0,.5)';
    c.strokeText(txt, 750, 12 + fs * 0.86);
    const g = c.createLinearGradient(0, 12, 0, 12 + fs);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, rgba(T.kleur, 1));
    g.addColorStop(1, rgba(T.kleur2, 1));
    c.fillStyle = g;
    c.fillText(txt, 750, 12 + fs * 0.86);
    c.font = `800 60px ${F_SPORT}`;
    spatie(c, 8);
    const regel = `${T.naam.toUpperCase()}  ·  ${T.sub.toUpperCase()}`;
    c.lineWidth = 9;
    c.strokeStyle = 'rgba(0,0,0,.55)';
    c.strokeText(regel, 750 + 4, 342);
    c.fillStyle = 'rgba(255,255,255,.95)';
    c.fillText(regel, 750 + 4, 342);
    spatie(c, 0);
    return cv;
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
    c.shadowColor = rgba(data.T.kleur, 0.9);
    c.shadowBlur = 60 * sch * 0.4;
    c.drawImage(lagen.bg, 0, 0, CW * sch, CH * sch);
    c.shadowBlur = 0;
    c.drawImage(lagen.mid, 0, 0, CW * sch, CH * sch);
    c.drawImage(lagen.fg, 0, 0, CW * sch, CH * sch);
    const [x0, y0, x1, y1] = CIJFER_RECT;
    c.drawImage(lagen.cijfer, x0 * sch, y0 * sch, (x1 - x0) * sch, (y1 - y0) * sch);
    c.restore();
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
    c.shadowColor = rgba(data.T.kleur, 0.85);
    c.shadowBlur = 36 * sch;
    c.drawImage(lagen.bg, 0, 0, CW * sch, CH * sch);
    c.shadowBlur = 0;
    c.drawImage(lagen.mid, 0, 0, CW * sch, CH * sch);
    c.drawImage(lagen.fg, 0, 0, CW * sch, CH * sch);
    const [x0, y0, x1, y1] = CIJFER_RECT;
    c.drawImage(lagen.cijfer, x0 * sch, y0 * sch, (x1 - x0) * sch, (y1 - y0) * sch);
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
    return { lagen, pak, titel, vakTekst, onderTekst, platen, opening };
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
    laadLettertypes, maakKaartLagen, maakMiniatuur, maakPak, maakVliegTekst, maakPlaat, maakTitel, maakAfbeelding, icoonVoorVak, icoon, nieuw,
  };
})();
