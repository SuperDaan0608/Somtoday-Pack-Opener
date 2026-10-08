/*
 * Somtoday Pack Opener — zeldzaam.js
 * De ZELDZAAM-reeks en de ladder erboven: wat er extra gebeurt als een kaart zeldzaam is, bij elke opening. Alles blijft een
 * functie van de tijd (net als scene.js), de regie hier is alleen het extra stuk:
 *
 *   tease      vlak voor de kaart: de opening bevriest, het scherm gaat bijna zwart met een regenboog-glitch, een
 *              hartslag en de tekst "ER GEBEURT IETS..."; daarna een felle flits
 *   walkout    de kaart komt door een regenboogtunnel aanvliegen, met een regenboogexplosie en schokgolven
 *   onthulling slow-motion, een regenboog-schokgolf over het hele scherm, de kaart draait rond met holografische
 *              folie, het grote ZELDZAAM!-logo met glitch en sterren, draaiende lichtbundels, een 3D-confettistorm
 *   viering    ruim vier seconden langer dan een gewone onthulling; een klik slaat het over
 *
 * De ladder (d.trede): 0 gewoon, 1 zeldzaam (hierboven), en daarboven drie treden die elk groter zijn dan de vorige:
 *   2 GLIM       een SHINY!-moment kort na de onthulling: de kaart breekt in kristalscherven en komt terug, regenboogglinster
 *   3 KOSMISCH   de kaart komt uit een zwart gat, door een nevel-warp, met planeten die langs je heen vliegen
 *   4 MYTHISCH   een wezen (per vakgroep: draak, feniks, kraken of griffioen) vliegt uit het pakje, brult en zet de kaart neer
 * Bij elke trede vanaf 2 is er vooraf een klein teken tijdens het openen (en bij gewone en zeldzame kaarten soms een
 * vals alarm met hetzelfde teken), en soms een upgrade: de reeks lijkt op ZELDZAAM! uit te komen en breekt dan nog eens open.
 * Legendarisch (zeldzaam met een 9,5 of hoger) stapelt op elke trede: de kroon en de supernova komen erbij.
 * Ultiem (een 10 bij kosmisch of mythisch): na de supernova breekt de werkelijkheid, het beeld bevriest, de kleuren
 * keren om, een barst loopt door het scherm, alles wordt naar één punt gezogen, het wordt stil en zwart en dan volgt
 * een BIG BANG: een nieuw universum waarin de kaart als een relikwie neerdaalt.
 *
 * scene.js roept dit aan: tijden() schuift de tijdlijn op, maakArt() levert de afbeeldingen, maak(c) bouwt de reeks en
 * vroeg(c) het teken vooraf; lot(d) zegt of het een vals alarm en/of een upgrade is.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const { klem, mix, glad, veer } = SPO;
  const ramp = (t, a, b) => klem((t - a) / (b - a), 0, 1);
  const sm = (t, a, b) => glad(ramp(t, a, b));
  const hash = (x) => {
    const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // Wat voor kaart is dit nog meer: een vals alarm (alleen bij gewone en zeldzame kaarten, ongeveer één op de vier) en/of een
  // upgrade (bij glim, kosmisch en mythisch ongeveer één op de drie, niet bij een ultieme kaart). Vast per kaart.
  // d.valsAlarm en d.upgrade (true/false) zetten het vast, voor tests.
  function lot(d) {
    const tr = d.trede | 0;
    let h = 7;
    const s = [d.vak, d.cijferTekst, d.onder, d.weging].join('|');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003;
    const r = (k) => hash(h * 0.01731 + k * 3.7);
    return {
      vals: d.valsAlarm != null ? !!d.valsAlarm && tr <= 1 : tr <= 1 && r(1) < 0.25,
      upg: d.upgrade != null ? !!d.upgrade && tr >= 2 && !d.ultiem : tr >= 2 && !d.ultiem && r(2) < 0.33,
      kleur: Math.floor(r(3) * 3) + 2, // de kleur van het teken bij een vals alarm: die van glim, kosmisch of mythisch
    };
  }

  // ───────────────────────── Tijdlijn ─────────────────────────
  // o: de gewone tijdlijn (met K0, spin, telStart, RV, EIND). Geeft een verlengde tijdlijn terug die de gewone als
  // prototype heeft (dus wijzigingen van een opening, zoals klikHint, blijven zichtbaar) en die zegt:
  //   tease [t0, t1]   het bevroren stuk: de opening staat stil op t0 (pre() zegt welke tijd de opening ziet)
  //   K0, spin, RV, EIND   opgeschoven en verlengd; vier = vanaf hier slaat een klik de viering over
  //   warp(t) / echt(ts)   slow-motion rond de onthulling: werkelijke tijd <-> scènetijd
  // Daarbovenop (zie de trede): shiny (glim), upg + U (upgrade-moment), nova (legendarisch), ult (ultiem: bevriezen, implosie,
  // zwart, bang), klikSprong (waar een klik de lange tease naartoe springt).
  function tijden(o, d) {
    const snel = d.snel;
    const tr = d.trede | 0;
    const leg = !!d.legendarisch;
    const ult = !!d.ultiem;
    const lt = lot(d);
    const upg = tr >= 2 && lt.upg;
    // legendarisch: eerst een stuk zonder geluid van de tease (barsten in het glas), daarna de gewone tease. Vanaf glim hebben
    // de treden hun eigen tease en doet alleen de supernova mee.
    const legT = leg && tr < 2;
    // bij een upgrade begint de reeks als een gewone zeldzame kaart (korte tease) en breekt hij later open
    const eigen = tr >= 2 && !upg;
    const TEASE = legT ? (snel ? 2.0 : 4.4) : eigen ? [0, 0, snel ? 1.3 : 3.0, snel ? 2.6 : 5.6, snel ? 4.6 : 9.8][tr] : snel ? 1.15 : 2.5;
    const t0 = o.K0 - 0.06;
    const z = Object.create(o);
    z.basis = o;
    z.tease = [t0, t0 + TEASE];
    z.K0 = o.K0 + TEASE;
    z.spin = legT ? (snel ? 1.5 : 2.9) : eigen ? [0, 0, snel ? 1.3 : 2.6, snel ? 1.9 : 3.8, snel ? 1.7 : 2.8][tr] : snel ? 1.2 : 2.3;
    z.telStart = z.K0 + z.spin * 0.85;
    z.telDuur = snel ? 0.95 : 1.5 + 0.9 * d.I;
    z.RV = z.telStart + z.telDuur;
    z.vier = z.RV + (snel ? 1.2 : 2.0);
    z.EIND = z.RV + (snel ? 2.6 : 5.6);
    z.pre = (t) => (t < t0 ? t : t < t0 + TEASE ? t0 : t - TEASE);
    z.upg = upg;
    if (tr >= 3 && eigen) z.klikSprong = z.K0 - 0.3;

    // slow-motion: eerst een korte, trage stukje (snelheid v0), dan een vloeiend herstel naar normaal tempo
    const v0 = legT || tr >= 3 ? (snel ? 0.25 : 0.12) : snel ? 0.32 : 0.17;
    const S0 = snel ? 0.35 : 0.6;
    const S1 = snel ? 0.95 : 1.6;
    const F = (u) => u * u * u - (u * u * u * u) / 2;
    const g = (x) => {
      if (x <= 0) return x;
      if (x < S0) return v0 * x;
      const w = S1 - S0;
      if (x < S1) return v0 * S0 + v0 * (x - S0) + (1 - v0) * w * F((x - S0) / w);
      return v0 * S1 + (1 - v0) * w * 0.5 + (x - S1);
    };
    const RV = z.RV;
    const echt0 = (ts) => {
      if (ts <= RV) return ts;
      let a = 0;
      let b = (ts - RV) / v0 + 1;
      for (let i = 0; i < 40; i++) {
        const m = (a + b) / 2;
        if (g(m) < ts - RV) a = m;
        else b = m;
      }
      return RV + (a + b) / 2;
    };
    z.warp = (t) => (t <= RV ? t : RV + g(t - RV));
    z.echt = echt0;

    // het moment na de onthulling waarop de trede zich laat zien (scènetijd): het SHINY!-moment (glim) of de upgrade
    z.U = RV + (snel ? 1.1 : 1.9);
    if (tr === 2) {
      z.shiny = z.U;
      z.EIND = echt0(z.shiny + (snel ? 2.6 : 5.0));
    } else if (tr === 3) {
      z.EIND = echt0(RV + (upg ? (snel ? 4.2 : 9.0) : snel ? 3.4 : 8.0));
    } else if (tr === 4) {
      z.EIND = echt0(RV + (upg ? (snel ? 4.2 : 9.4) : snel ? 3.6 : 7.4));
    }
    if (upg) z.vier = z.RV + (snel ? 1.2 : 2.0);
    if (leg) {
      // de supernova (scènetijd) en een langere viering; het eind en de klik-grens zijn echte tijd
      z.nova = RV + (tr >= 3 ? (upg ? (snel ? 4.4 : 9.6) : snel ? 3.6 : 8.6) : tr === 2 ? (snel ? 3.8 : 7.0) : snel ? 1.7 : 3.3);
      z.EIND = echt0(z.nova + (snel ? 2.6 : 6.2));
      z.vier = RV + (snel ? 1.2 : 2.0);
    }
    if (ult && leg) {
      // ultiem: na de supernova breekt de werkelijkheid. De scènetijd loopt dan in vier stukken anders:
      //   bevriezen (bijna stil, 0,02x), implosie (gewoon), zwart (6x, zodat al het oude is uitgedoofd), en dan de bang (gewoon).
      const k = snel ? 0.55 : 1;
      const U0 = z.nova + (snel ? 2.4 : 4.4);
      const Fd = 1.7 * k;
      const Im = 1.9 * k;
      const Bk = 1.9 * k;
      const eU = echt0(U0);
      const f1 = U0 + 0.02 * Fd;
      const f2 = f1 + Im;
      const bang = f2 + 6 * Bk;
      const seg = [[Fd, 0.02], [Im, 1], [Bk, 6]];
      z.ult = { U0, Fd, Im, Bk, f1, f2, bang, k };
      z.warp = (t) => {
        if (t <= RV) return t;
        if (t <= eU) return RV + g(t - RV);
        let x = t - eU;
        let s = U0;
        for (const [dur, v] of seg) {
          const nm = Math.min(x, dur);
          s += nm * v;
          x -= nm;
          if (x <= 0) return s;
        }
        return s + x;
      };
      z.echt = (ts) => {
        if (ts <= U0) return echt0(ts);
        let r = ts - U0;
        let e = eU;
        for (const [dur, v] of seg) {
          if (r <= dur * v) return e + r / v;
          r -= dur * v;
          e += dur;
        }
        return e + r;
      };
      z.EIND = z.echt(bang + (snel ? 6.0 : 12.5));
      z.rust2 = (t) => sm(t, bang + (snel ? 3 : 7), bang + (snel ? 5 : 10));
    }
    return z;
  }

  // ───────────────────────── Tekenhulpjes (alleen voor de afbeeldingen) ─────────────────────────
  const NW = (w, h) => SPO.art.nieuw(w, h);
  const zaad = (s) => {
    let z = s;
    return () => ((z = (z * 16807) % 2147483647) / 2147483647);
  };
  // een vloeiend pad door punten (Catmull-Rom naar bezier)
  function pad(c, pts, sluit) {
    const n = pts.length;
    const P = (i) => (sluit ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    c.moveTo(pts[0][0], pts[0][1]);
    const m = sluit ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (sluit) c.closePath();
  }
  const veelhoek = (c, pts) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  };
  // Een silhouet met gloed, een verloop van licht naar donker en een lichte rand bovenaan (contourlicht).
  function vulSil(c, maakPad, pal, o = {}) {
    const W = c.canvas.width, H = c.canvas.height;
    if (o.gloed !== 0) {
      c.save();
      c.shadowColor = pal.gloed;
      c.shadowBlur = o.gloed || 38;
      c.fillStyle = pal.midden;
      c.beginPath();
      maakPad();
      c.fill();
      c.restore();
    }
    c.save();
    c.beginPath();
    maakPad();
    c.clip();
    c.fillStyle = pal.licht;
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(o.rx === undefined ? 6 : o.rx, o.ry === undefined ? 9 : o.ry);
    const g = c.createLinearGradient(0, o.y0 || 0, 0, o.y1 || H);
    g.addColorStop(0, pal.midden);
    g.addColorStop(0.55, pal.donker2 || pal.donker);
    g.addColorStop(1, pal.donker);
    c.fillStyle = g;
    c.beginPath();
    maakPad();
    c.fill();
    c.restore();
    if (o.tex) o.tex(c);
    c.restore();
  }
  const schubben = (c, x0, y0, x1, y1, r, kleur, zaadwaarde) => {
    const rnd = zaad(zaadwaarde || 5);
    c.save();
    c.strokeStyle = kleur;
    c.lineWidth = 1.6;
    for (let y = y0; y < y1; y += r * 0.9) {
      for (let x = x0 + ((Math.round(y / r) % 2) * r) / 2; x < x1; x += r) {
        c.beginPath();
        c.arc(x + (rnd() - 0.5) * 3, y, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
        c.stroke();
      }
    }
    c.restore();
  };
  const oog = (c, x, y, r, kleur, spleet = true) => {
    c.save();
    const g = c.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, 'rgba(255,255,255,.9)');
    g.addColorStop(0.25, kleur);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r * 3.2, 0, 6.2832);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = kleur;
    c.beginPath();
    c.ellipse(x, y, r * 1.5, r, -0.25, 0, 6.2832);
    c.fill();
    if (spleet) {
      c.fillStyle = '#100';
      c.beginPath();
      c.ellipse(x + r * 0.2, y, r * 0.22, r * 0.9, -0.25, 0, 6.2832);
      c.fill();
    }
    c.restore();
  };

  // De kleuren per wezen (vakgroep): exact = draak, talen = feniks, mens & maatschappij = kraken, kunst & sport = griffioen.
  const WEZENS = {
    draak: { naam: 'DRAAK', donker: '#03150a', donker2: '#0b4a22', midden: '#1f8a3e', licht: '#a8ff86', goud: '#ffd34a', gloed: 'rgba(120,255,120,.7)', oog: '#ffe14a', vuur1: [0.45, 1, 0.35], vuur2: [1, 0.85, 0.25], licht1: [0.5, 1, 0.5], licht2: [1, 0.85, 0.3], brul: 1 },
    feniks: { naam: 'FENIKS', donker: '#3a0300', donker2: '#a81a04', midden: '#f0480a', licht: '#ffe27a', goud: '#fff1a0', gloed: 'rgba(255,150,40,.8)', oog: '#ffffff', vuur1: [1, 0.35, 0.05], vuur2: [1, 0.85, 0.3], licht1: [1, 0.5, 0.15], licht2: [1, 0.8, 0.3], brul: 1.3 },
    kraken: { naam: 'KRAKEN', donker: '#040824', donker2: '#16227a', midden: '#2f45d0', licht: '#9a8cff', goud: '#33e8ff', gloed: 'rgba(90,120,255,.75)', oog: '#8dfff0', vuur1: [0.25, 0.4, 1], vuur2: [0.7, 0.35, 1], licht1: [0.3, 0.45, 1], licht2: [0.6, 0.3, 1], brul: 0.65 },
    griffioen: { naam: 'GRIFFIOEN', donker: '#6a5a30', donker2: '#c9a54a', midden: '#f1dca0', licht: '#ffffff', goud: '#ffc938', gloed: 'rgba(255,235,160,.85)', oog: '#ff9a1a', vuur1: [1, 0.95, 0.7], vuur2: [1, 0.78, 0.25], licht1: [1, 0.95, 0.75], licht2: [1, 0.8, 0.3], brul: 1.15 },
  };
  const GROEP_WEZEN = { exact: 'draak', talen: 'feniks', mens: 'kraken', kunst: 'griffioen' };
  const wezenVan = (d) => GROEP_WEZEN[d.groep] || 'draak';

  // Een veer/blad vanuit een scharnier: gebogen, met een smalle punt.
  function veerPad(c, hx, hy, hoek, lengte, breedte, krul) {
    const dx = Math.cos(hoek), dy = Math.sin(hoek);
    const nx = -dy, ny = dx;
    const tx = hx + dx * lengte + nx * (krul || 0), ty = hy + dy * lengte + ny * (krul || 0);
    c.moveTo(hx, hy);
    c.bezierCurveTo(hx + dx * lengte * 0.3 + nx * breedte, hy + dy * lengte * 0.3 + ny * breedte, hx + dx * lengte * 0.8 + nx * breedte * 0.8 + nx * (krul || 0) * 0.6, hy + dy * lengte * 0.8 + ny * breedte * 0.8 + ny * (krul || 0) * 0.6, tx, ty);
    c.bezierCurveTo(hx + dx * lengte * 0.8 - nx * breedte * 0.5 + nx * (krul || 0) * 0.6, hy + dy * lengte * 0.8 - ny * breedte * 0.5 + ny * (krul || 0) * 0.6, hx + dx * lengte * 0.3 - nx * breedte, hy + dy * lengte * 0.3 - ny * breedte, hx, hy);
    c.closePath();
  }

  // ───── de draak ─────
  function tekenDraak(P) {
    const lijf = NW(1100, 720);
    const c = lijf.getContext('2d');
    // poten achter het lijf
    const poot = (pts) => vulSil(c, () => pad(c, pts, true), { ...P, midden: P.donker2, licht: P.midden }, { gloed: 0, ry: 4 });
    poot([[610, 470], [650, 540], [640, 600], [690, 640], [726, 628], [704, 590], [716, 540], [700, 470]]);
    poot([[380, 470], [350, 540], [300, 610], [348, 644], [394, 600], [430, 540], [450, 480]]);
    // de staartpunt (een pijlpunt)
    vulSil(c, () => veelhoek(c, [[80, 332], [20, 286], [0, 332], [20, 380]]), { ...P, midden: P.goud, licht: '#fff7d0', donker: '#7a5a10', donker2: '#b88a20' }, { gloed: 20 });
    const romp = [[70, 332], [130, 375], [220, 395], [320, 368], [415, 325], [520, 298], [600, 276], [660, 232], [715, 182], [768, 148], [812, 122], [860, 112], [915, 126], [968, 152], [1030, 176], [1064, 196], [1060, 214], [1020, 226], [966, 238], [935, 256], [890, 284], [835, 327], [780, 377], [720, 432], [640, 492], [540, 522], [430, 508], [330, 472], [235, 438], [140, 404]];
    // rugstekels
    const stek = [[300, 366, 26], [360, 346, 30], [420, 326, 34], [480, 308, 36], [540, 292, 34], [600, 272, 32], [650, 236, 30], [695, 196, 28], [738, 160, 26]];
    c.save();
    c.fillStyle = P.goud;
    c.shadowColor = P.gloed;
    c.shadowBlur = 12;
    for (const [x, y, h] of stek) {
      c.beginPath();
      c.moveTo(x - 14, y + 8);
      c.lineTo(x - 4, y - h);
      c.lineTo(x + 16, y + 6);
      c.closePath();
      c.fill();
    }
    c.restore();
    vulSil(c, () => pad(c, romp, true), P, {
      y0: 100,
      y1: 540,
      tex: (x) => {
        schubben(x, 60, 280, 900, 540, 22, 'rgba(0,0,0,.28)', 3);
        // de lichte buik
        x.save();
        x.globalCompositeOperation = 'source-atop';
        const bg = x.createLinearGradient(0, 440, 0, 540);
        bg.addColorStop(0, 'rgba(255,220,120,0)');
        bg.addColorStop(1, 'rgba(255,220,120,.55)');
        x.fillStyle = bg;
        x.fillRect(300, 430, 520, 120);
        x.restore();
      },
    });
    // horens, tanden, oog
    for (const [pts, k] of [[[[830, 124], [770, 74], [690, 42], [740, 100], [800, 140]], 1], [[[880, 118], [840, 52], [790, 20], [826, 80], [866, 130]], 0.8]]) {
      vulSil(c, () => pad(c, pts, true), { ...P, midden: P.goud, licht: '#fffbe0', donker: '#6a4a10', donker2: '#c89a2a' }, { gloed: 14 * k });
    }
    c.fillStyle = '#fff6d8';
    for (let i = 0; i < 7; i++) {
      const x = 1040 - i * 13;
      c.beginPath();
      c.moveTo(x, 224);
      c.lineTo(x - 5, 238 + i);
      c.lineTo(x - 10, 226);
      c.fill();
    }
    oog(c, 922, 166, 11, P.oog);
    // neusgat
    c.fillStyle = 'rgba(0,0,0,.5)';
    c.beginPath();
    c.ellipse(1040, 192, 6, 3.5, 0.4, 0, 6.2832);
    c.fill();

    const vleugel = NW(860, 700);
    const w = vleugel.getContext('2d');
    const H = [70, 616];
    const elleboog = [235, 215], pols = [470, 92];
    const tippen = [[838, 38], [806, 296], [660, 486], [432, 604]];
    const membraan = () => {
      w.moveTo(H[0], H[1]);
      w.lineTo(elleboog[0], elleboog[1]);
      w.lineTo(pols[0], pols[1]);
      w.lineTo(tippen[0][0], tippen[0][1]);
      w.quadraticCurveTo(676, 190, tippen[1][0], tippen[1][1]);
      w.quadraticCurveTo(646, 336, tippen[2][0], tippen[2][1]);
      w.quadraticCurveTo(484, 450, tippen[3][0], tippen[3][1]);
      w.quadraticCurveTo(252, 548, H[0], H[1]);
      w.closePath();
    };
    vulSil(w, membraan, { ...P, midden: P.midden, licht: P.goud, donker: '#021008', donker2: P.donker2 }, {
      y0: 30,
      y1: 640,
      rx: 4,
      ry: 6,
      tex: (x) => {
        // botten en aders
        x.strokeStyle = 'rgba(0,0,0,.55)';
        x.lineCap = 'round';
        for (const [t, b] of [[tippen[0], 9], [tippen[1], 8], [tippen[2], 7], [tippen[3], 6]]) {
          x.lineWidth = b;
          x.beginPath();
          x.moveTo(pols[0], pols[1]);
          x.lineTo(t[0], t[1]);
          x.stroke();
        }
        x.lineWidth = 12;
        x.beginPath();
        x.moveTo(H[0], H[1]);
        x.lineTo(elleboog[0], elleboog[1]);
        x.lineTo(pols[0], pols[1]);
        x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.18)';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(H[0] + 4, H[1] - 4);
        x.lineTo(elleboog[0] + 4, elleboog[1] - 4);
        x.lineTo(pols[0] + 3, pols[1] - 3);
        x.stroke();
        x.strokeStyle = 'rgba(0,0,0,.22)';
        x.lineWidth = 2;
        for (let i = 1; i < 5; i++) {
          x.beginPath();
          x.moveTo(H[0] + 40, H[1] - 30);
          x.quadraticCurveTo(300 + 70 * i, 330 - 28 * i + 60, 400 + 85 * i, 220 + 40 * i);
          x.stroke();
        }
      },
    });
    // een klauw op de pols
    vulSil(w, () => veelhoek(w, [[pols[0] - 14, pols[1] + 6], [pols[0] - 40, pols[1] - 36], [pols[0] + 8, pols[1] - 8]]), { ...P, midden: P.goud, licht: '#fffbe0', donker: '#6a4a10', donker2: '#c89a2a' }, { gloed: 6 });
    return { lijf, vleugel, w: { lijf: [1100, 720], vleugel: [860, 700] }, scharnier: [480, 304], vscharnier: H, mond: [1046, 206], oog: [922, 166], kop: [900, 190] };
  }

  // ───── de feniks ─────
  function tekenFeniks(P) {
    const lijf = NW(1100, 720);
    const c = lijf.getContext('2d');
    // de lange staartveren: gebogen linten die uitlopen in vlammen
    const lint = (p0, p1, p2, p3, b0, kl) => {
      c.save();
      c.shadowColor = P.gloed;
      c.shadowBlur = 26;
      const g = c.createLinearGradient(p0[0], p0[1], p3[0], p3[1]);
      g.addColorStop(0, P.goud);
      g.addColorStop(0.35, kl || P.midden);
      g.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(p0[0], p0[1] - b0);
      c.bezierCurveTo(p1[0], p1[1] - b0 * 0.8, p2[0], p2[1] - b0 * 0.3, p3[0], p3[1]);
      c.bezierCurveTo(p2[0], p2[1] + b0 * 0.3, p1[0], p1[1] + b0 * 0.8, p0[0], p0[1] + b0);
      c.closePath();
      c.fill();
      c.restore();
    };
    lint([440, 410], [330, 330], [200, 520], [30, 400], 26, P.licht);
    lint([440, 420], [320, 470], [180, 380], [20, 560], 30, P.midden);
    lint([450, 430], [350, 560], [240, 600], [90, 690], 26, P.donker2);
    lint([440, 400], [330, 280], [220, 300], [60, 230], 22, P.midden);
    lint([450, 415], [300, 420], [170, 470], [10, 470], 18, P.goud);
    // poten
    c.fillStyle = P.donker2;
    for (const x0 of [560, 620]) {
      c.beginPath();
      c.moveTo(x0, 470);
      c.lineTo(x0 + 70, 560);
      c.lineTo(x0 + 110, 566);
      c.lineTo(x0 + 80, 588);
      c.lineTo(x0 + 40, 574);
      c.lineTo(x0 + 10, 500);
      c.closePath();
      c.fill();
    }
    const lichaam = () => {
      // de romp, de hals en de kop als één silhouet
      c.ellipse(570, 405, 195, 105, -0.18, 0, 6.2832);
      c.moveTo(740, 330);
      pad(c, [[690, 330], [770, 292], [830, 240], [868, 190], [920, 170], [965, 190], [978, 232], [940, 262], [890, 300], [850, 352], [790, 410], [700, 452]], true);
      // de snavel
      c.moveTo(965, 196);
      c.lineTo(1066, 238);
      c.lineTo(972, 246);
      c.closePath();
      // de kuif
      for (const [a, l] of [[-2.55, 150], [-2.25, 190], [-1.95, 150]]) veerPad(c, 905, 175, a, l, 26, 0);
    };
    vulSil(c, lichaam, P, {
      y0: 140,
      y1: 520,
      tex: (x) => {
        x.save();
        x.globalCompositeOperation = 'source-atop';
        const rg = x.createRadialGradient(560, 420, 0, 560, 420, 260);
        rg.addColorStop(0, 'rgba(255,240,150,.85)');
        rg.addColorStop(1, 'rgba(255,240,150,0)');
        x.fillStyle = rg;
        x.fillRect(250, 200, 700, 400);
        x.restore();
        schubben(x, 380, 330, 780, 520, 20, 'rgba(120,10,0,.3)', 11);
      },
    });
    oog(c, 940, 214, 9, P.oog, false);
    c.fillStyle = '#2a0600';
    c.beginPath();
    c.arc(944, 214, 4.5, 0, 6.2832);
    c.fill();

    const vleugel = NW(900, 700);
    const w = vleugel.getContext('2d');
    const H = [80, 620];
    // twee rijen veren: eerst de lange achterste, dan de korte voorste
    const rij = (n, a0, a1, l0, l1, b, P2, k) => {
      for (let i = 0; i < n; i++) {
        const q = i / (n - 1);
        const a = mix(a0, a1, q);
        const l = mix(l0, l1, Math.sin(q * 3.14159) * 0.5 + 0.5 * (1 - q));
        vulSil(w, () => veerPad(w, H[0], H[1], a, l, b, (q - 0.5) * 40), P2, { gloed: k, rx: 3, ry: 5, y0: 0, y1: 700 });
      }
    };
    rij(11, -1.78, -0.12, 780, 560, 52, { ...P, midden: P.midden, licht: P.goud, donker: '#5a0800', donker2: P.donker2 }, 24);
    rij(9, -1.6, -0.2, 520, 380, 46, { ...P, midden: P.goud, licht: '#fffbe0', donker: P.midden, donker2: P.goud }, 14);
    return { lijf, vleugel, w: { lijf: [1100, 720], vleugel: [900, 700] }, scharnier: [610, 345], vscharnier: H, mond: [1066, 238], oog: [940, 214], kop: [930, 210] };
  }

  // ───── de kraken ─────
  function tekenKraken(P) {
    const lijf = NW(900, 900);
    const c = lijf.getContext('2d');
    // vinnen
    for (const s of [-1, 1]) {
      vulSil(c, () => pad(c, [[450 + s * 150, 210], [450 + s * 300, 130], [450 + s * 380, 230], [450 + s * 330, 330], [450 + s * 160, 330]], true), { ...P, midden: P.donker2, licht: P.licht }, { gloed: 24 });
    }
    // de mantel: een hoge koepel
    const mantel = () => pad(c, [[450, 30], [560, 60], [640, 150], [670, 270], [640, 390], [580, 480], [520, 520], [450, 528], [380, 520], [320, 480], [260, 390], [230, 270], [260, 150], [340, 60]], true);
    vulSil(c, mantel, P, {
      y0: 20,
      y1: 540,
      tex: (x) => {
        // lichtgevende stippen en banen
        const rnd = zaad(17);
        x.save();
        x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 70; i++) {
          const px = 270 + rnd() * 360, py = 60 + rnd() * 440;
          const g = x.createRadialGradient(px, py, 0, px, py, 12);
          g.addColorStop(0, 'rgba(120,255,255,.8)');
          g.addColorStop(1, 'rgba(120,255,255,0)');
          x.fillStyle = g;
          x.fillRect(px - 12, py - 12, 24, 24);
        }
        x.restore();
        x.strokeStyle = 'rgba(160,140,255,.35)';
        x.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          x.beginPath();
          x.moveTo(450 + (i - 2.5) * 20, 40);
          x.quadraticCurveTo(450 + (i - 2.5) * 70, 280, 450 + (i - 2.5) * 38, 500);
          x.stroke();
        }
      },
    });
    // het hoofd onder de mantel met twee grote ogen en een trechter
    vulSil(c, () => c.ellipse(450, 566, 215, 112, 0, 0, 6.2832), { ...P, midden: P.donker2, licht: P.licht }, { gloed: 18, ry: 5 });
    oog(c, 360, 566, 26, P.oog);
    oog(c, 540, 566, 26, P.oog);
    c.fillStyle = 'rgba(0,0,0,.4)';
    c.beginPath();
    c.ellipse(450, 640, 38, 16, 0, 0, 6.2832);
    c.fill();

    // één tentakel (hangt aan het scharnier boven in het plaatje): kleiner naar de punt, met zuignappen
    const tent = NW(200, 820);
    const t = tent.getContext('2d');
    const links = [], rechts = [];
    for (let i = 0; i <= 30; i++) {
      const q = i / 30;
      const y = 6 + q * 800;
      const x = 100 + Math.sin(q * 5.2) * 48 * (0.4 + q) + q * q * 18;
      const b = (1 - q) * 46 + 7;
      links.push([x - b, y]);
      rechts.push([x + b, y]);
    }
    vulSil(t, () => {
      t.moveTo(links[0][0], links[0][1]);
      for (const p of links) t.lineTo(p[0], p[1]);
      for (let i = rechts.length - 1; i >= 0; i--) t.lineTo(rechts[i][0], rechts[i][1]);
      t.closePath();
    }, P, { y0: 0, y1: 820, rx: 5, ry: 3, gloed: 20 });
    t.save();
    t.globalCompositeOperation = 'lighter';
    for (let i = 3; i < 28; i += 1.2) {
      const p = links[Math.floor(i)];
      const q = rechts[Math.floor(i)];
      const x = (p[0] + q[0]) / 2, y = p[1];
      const r = Math.max(2.5, (q[0] - p[0]) * 0.15);
      const g = t.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, 'rgba(140,255,255,.85)');
      g.addColorStop(1, 'rgba(140,255,255,0)');
      t.fillStyle = g;
      t.beginPath();
      t.arc(x, y, r * 2.4, 0, 6.2832);
      t.fill();
    }
    t.restore();
    return { lijf, tent, w: { lijf: [900, 900], tent: [200, 820] }, mond: [450, 640], oog: [450, 566], kop: [450, 560], scharnier: [450, 600], tentWortels: [[330, 618], [380, 640], [430, 650], [470, 650], [520, 640], [570, 618], [300, 590], [600, 590]] };
  }

  // ───── de griffioen ─────
  function tekenGriffioen(P) {
    const lijf = NW(1100, 720);
    const c = lijf.getContext('2d');
    const Pl = { ...P, midden: '#d9a43a', licht: '#fff0b0', donker: '#5a3a08', donker2: '#a8741a' };
    // staart met pluim
    c.save();
    c.shadowColor = P.gloed;
    c.shadowBlur = 20;
    const sg = c.createLinearGradient(380, 400, 80, 560);
    sg.addColorStop(0, Pl.midden);
    sg.addColorStop(1, Pl.donker);
    c.strokeStyle = sg;
    c.lineWidth = 34;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(380, 410);
    c.bezierCurveTo(260, 380, 200, 520, 110, 520);
    c.stroke();
    c.restore();
    vulSil(c, () => pad(c, [[60, 520], [100, 470], [160, 480], [190, 530], [150, 580], [90, 570]], true), Pl, { gloed: 12 });
    // achterpoot en voorpoot (adelaarsklauwen)
    vulSil(c, () => pad(c, [[430, 470], [390, 540], [330, 610], [380, 640], [440, 610], [470, 540], [500, 480]], true), Pl, { gloed: 0 });
    vulSil(c, () => pad(c, [[720, 430], [780, 510], [850, 540], [880, 580], [820, 584], [740, 560], [690, 500]], true), { ...P, midden: '#e8c060', licht: '#fff6d0', donker: '#6a4a10', donker2: '#b88a2a' }, { gloed: 0 });
    // lichaam van de leeuw
    vulSil(c, () => {
      c.ellipse(560, 420, 235, 118, -0.12, 0, 6.2832);
      pad(c, [[690, 360], [760, 320], [820, 250], [860, 220], [900, 260], [880, 320], [840, 390], [760, 450], [690, 470]], true);
    }, Pl, {
      y0: 280,
      y1: 540,
      tex: (x) => {
        x.save();
        x.globalCompositeOperation = 'source-atop';
        x.strokeStyle = 'rgba(90,50,0,.28)';
        x.lineWidth = 2;
        for (let i = 0; i < 40; i++) {
          x.beginPath();
          x.moveTo(340 + i * 11, 330 + (i % 3) * 10);
          x.lineTo(330 + i * 11, 420 + (i % 5) * 12);
          x.stroke();
        }
        x.restore();
      },
    });
    // de adelaarskop met kraag en haaksnavel
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.7 + i * 0.14);
      vulSil(c, () => veerPad(c, 880, 235, a, 90 + (i % 2) * 24, 18, 0), { ...P, midden: '#eee3c8', licht: '#fff', donker: '#9a8a5a', donker2: '#d8c898' }, { gloed: 8 });
    }
    vulSil(c, () => c.ellipse(918, 200, 72, 62, 0.1, 0, 6.2832), { ...P, midden: '#f4efe0', licht: '#ffffff', donker: '#a89868', donker2: '#e0d4b0' }, { gloed: 24, ry: 6 });
    vulSil(c, () => pad(c, [[966, 184], [1052, 198], [1072, 240], [1050, 272], [1022, 250], [990, 244], [968, 232]], true), { ...P, midden: '#f2b020', licht: '#fff2a0', donker: '#7a4a00', donker2: '#c88a10' }, { gloed: 14 });
    // oren/veren op de kop
    vulSil(c, () => veelhoek(c, [[880, 154], [858, 80], [920, 138]]), { ...P, midden: '#f4efe0', licht: '#fff', donker: '#a89868', donker2: '#e0d4b0' }, { gloed: 10 });
    oog(c, 946, 196, 10, P.oog, true);

    const vleugel = NW(900, 700);
    const w = vleugel.getContext('2d');
    const H = [80, 620];
    const rij = (n, a0, a1, l0, l1, b, P2, k) => {
      for (let i = 0; i < n; i++) {
        const q = i / (n - 1);
        const a = mix(a0, a1, q);
        const l = mix(l0, l1, q);
        vulSil(w, () => veerPad(w, H[0], H[1], a, l, b, (q - 0.5) * 30), P2, { gloed: k, rx: 3, ry: 5 });
      }
    };
    rij(12, -1.8, -0.1, 790, 560, 50, { ...P, midden: '#f0e8d0', licht: '#ffffff', donker: '#b0a070', donker2: '#e6d8b0' }, 22);
    rij(9, -1.65, -0.2, 500, 360, 44, { ...P, midden: '#ffffff', licht: '#ffffff', donker: '#d8c890', donker2: '#f4ecd0' }, 12);
    // gouden punten
    w.save();
    w.globalCompositeOperation = 'source-atop';
    const gg = w.createRadialGradient(H[0], H[1], 320, H[0], H[1], 800);
    gg.addColorStop(0, 'rgba(255,200,60,0)');
    gg.addColorStop(1, 'rgba(255,190,50,.55)');
    w.fillStyle = gg;
    w.fillRect(0, 0, 900, 700);
    w.restore();
    return { lijf, vleugel, w: { lijf: [1100, 720], vleugel: [900, 700] }, scharnier: [600, 350], vscharnier: H, mond: [1060, 240], oog: [946, 196], kop: [930, 200] };
  }
  const TEKEN_WEZEN = { draak: tekenDraak, feniks: tekenFeniks, kraken: tekenKraken, griffioen: tekenGriffioen };

  // ───── de ruimte: planeten, zwart gat, nevel, sterrenstelsels ─────
  function bol(c, cx, cy, r, oppervlak, licht = [-0.4, -0.4], atmos = 'rgba(160,200,255,.7)') {
    c.save();
    c.shadowColor = atmos;
    c.shadowBlur = r * 0.22;
    c.fillStyle = '#000';
    c.beginPath();
    c.arc(cx, cy, r, 0, 6.2832);
    c.fill();
    c.restore();
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, 6.2832);
    c.clip();
    oppervlak(c, cx, cy, r);
    // schaduwkant
    const g = c.createRadialGradient(cx + licht[0] * r, cy + licht[1] * r, r * 0.15, cx + licht[0] * r * 0.4, cy + licht[1] * r * 0.4, r * 1.9);
    g.addColorStop(0, 'rgba(0,0,12,0)');
    g.addColorStop(0.5, 'rgba(0,0,12,.25)');
    g.addColorStop(1, 'rgba(0,0,12,.94)');
    c.fillStyle = g;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
    // lichte rand van de atmosfeer
    c.lineWidth = r * 0.07;
    c.strokeStyle = atmos;
    c.globalAlpha = 0.55;
    c.beginPath();
    c.arc(cx - licht[0] * r * 0.06, cy - licht[1] * r * 0.06, r * 0.99, 0, 6.2832);
    c.stroke();
    c.restore();
  }
  function maakPlaneten() {
    const lijst = [];
    // 1: een gasreus met banden
    {
      const cv = NW(512, 512), c = cv.getContext('2d');
      bol(c, 256, 256, 230, (x, cx, cy, r) => {
        const kl = ['#f6d9a8', '#d9904a', '#f1b878', '#b86a30', '#f8e2b8', '#c47a3a', '#e8a860', '#8a4a22'];
        const rnd = zaad(9);
        for (let i = 0; i < 18; i++) {
          const y = cy - r + (i / 18) * r * 2;
          x.fillStyle = kl[i % kl.length];
          x.beginPath();
          x.moveTo(cx - r, y);
          for (let k = 0; k <= 12; k++) x.lineTo(cx - r + (k / 12) * r * 2, y + Math.sin(k * 1.3 + i) * 5 + (rnd() - 0.5) * 3);
          x.lineTo(cx + r, y + r / 9 + 2);
          x.lineTo(cx - r, y + r / 9 + 2);
          x.fill();
        }
        // de grote storm
        x.fillStyle = 'rgba(200,60,30,.8)';
        x.beginPath();
        x.ellipse(cx + 40, cy + 50, 46, 26, 0, 0, 6.2832);
        x.fill();
      }, [-0.45, -0.35], 'rgba(255,200,130,.6)');
      lijst.push(cv);
    }
    // 2: een ringplaneet in paars/roze
    {
      const cv = NW(640, 640), c = cv.getContext('2d');
      const ring = (voor) => {
        c.save();
        c.translate(320, 320);
        c.rotate(-0.33);
        c.scale(1, 0.24);
        c.beginPath();
        if (voor) c.rect(-400, 0, 800, 400);
        else c.rect(-400, -400, 800, 400);
        c.clip();
        for (const [r0, r1, a, k] of [[200, 232, 0.8, '230,200,255'], [236, 262, 0.55, '255,170,220'], [268, 304, 0.7, '210,190,255'], [310, 322, 0.4, '255,255,255']]) {
          c.strokeStyle = `rgba(${k},${a})`;
          c.lineWidth = r1 - r0;
          c.beginPath();
          c.arc(0, 0, (r0 + r1) / 2, 0, 6.2832);
          c.stroke();
        }
        c.restore();
      };
      ring(false);
      bol(c, 320, 320, 150, (x, cx, cy, r) => {
        const g = x.createLinearGradient(0, cy - r, 0, cy + r);
        g.addColorStop(0, '#ffd2f0');
        g.addColorStop(0.4, '#c070e8');
        g.addColorStop(0.75, '#7a3ac0');
        g.addColorStop(1, '#3a1a80');
        x.fillStyle = g;
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
        x.strokeStyle = 'rgba(255,255,255,.16)';
        x.lineWidth = 6;
        for (let i = 0; i < 7; i++) {
          x.beginPath();
          x.moveTo(cx - r, cy - r + 40 + i * 38);
          x.quadraticCurveTo(cx, cy - r + 25 + i * 38, cx + r, cy - r + 48 + i * 38);
          x.stroke();
        }
      }, [-0.4, -0.45], 'rgba(255,170,240,.7)');
      ring(true);
      lijst.push(cv);
    }
    // 3: een blauwe waterwereld
    {
      const cv = NW(512, 512), c = cv.getContext('2d');
      bol(c, 256, 256, 220, (x, cx, cy, r) => {
        const g = x.createRadialGradient(cx - 60, cy - 60, 10, cx, cy, r);
        g.addColorStop(0, '#6fd0ff');
        g.addColorStop(1, '#0a3a9a');
        x.fillStyle = g;
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
        const rnd = zaad(21);
        x.fillStyle = '#3aa860';
        for (let i = 0; i < 5; i++) {
          x.beginPath();
          const px = cx + (rnd() - 0.5) * r * 1.3, py = cy + (rnd() - 0.5) * r * 1.3;
          x.moveTo(px, py);
          for (let k = 0; k < 8; k++) x.lineTo(px + Math.cos(k * 0.785) * (30 + rnd() * 50), py + Math.sin(k * 0.785) * (20 + rnd() * 34));
          x.fill();
        }
        x.strokeStyle = 'rgba(255,255,255,.7)';
        x.lineWidth = 12;
        x.lineCap = 'round';
        for (let i = 0; i < 9; i++) {
          x.beginPath();
          const px = cx + (rnd() - 0.5) * r * 1.6, py = cy + (rnd() - 0.5) * r * 1.6;
          x.moveTo(px, py);
          x.quadraticCurveTo(px + 40, py - 20, px + 90, py + (rnd() - 0.5) * 30);
          x.stroke();
        }
      }, [-0.5, -0.3], 'rgba(120,220,255,.85)');
      lijst.push(cv);
    }
    // 4: een lavaplaneet
    {
      const cv = NW(512, 512), c = cv.getContext('2d');
      bol(c, 256, 256, 215, (x, cx, cy, r) => {
        x.fillStyle = '#1a0806';
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
        const rnd = zaad(33);
        x.lineCap = 'round';
        for (let i = 0; i < 22; i++) {
          let px = cx + (rnd() - 0.5) * r * 1.8, py = cy + (rnd() - 0.5) * r * 1.8;
          x.beginPath();
          x.moveTo(px, py);
          for (let k = 0; k < 6; k++) {
            px += (rnd() - 0.5) * 80;
            py += (rnd() - 0.5) * 80;
            x.lineTo(px, py);
          }
          x.shadowColor = '#ff8a20';
          x.shadowBlur = 14;
          x.strokeStyle = '#ffb040';
          x.lineWidth = 3 + rnd() * 4;
          x.stroke();
        }
        x.shadowBlur = 0;
      }, [-0.4, -0.4], 'rgba(255,110,40,.85)');
      lijst.push(cv);
    }
    return lijst;
  }

  function maakGat() {
    const S = 1024;
    const cv = NW(S, S), c = cv.getContext('2d');
    const m = S / 2;
    // diepe gloed om het gat
    const gl = c.createRadialGradient(m, m, 120, m, m, m);
    gl.addColorStop(0, 'rgba(255,170,90,.55)');
    gl.addColorStop(0.2, 'rgba(190,60,200,.3)');
    gl.addColorStop(0.55, 'rgba(70,40,200,.12)');
    gl.addColorStop(1, 'rgba(20,10,80,0)');
    c.fillStyle = gl;
    c.fillRect(0, 0, S, S);
    const schijf = (alleenVoor) => {
      c.save();
      c.translate(m, m);
      c.rotate(-0.22);
      c.scale(1, 0.26);
      if (alleenVoor) {
        c.beginPath();
        c.rect(-S, 0, S * 2, S);
        c.clip();
      }
      const g = c.createRadialGradient(0, 0, 150, 0, 0, m * 0.98);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.04, 'rgba(255,250,230,1)');
      g.addColorStop(0.16, 'rgba(255,200,110,.98)');
      g.addColorStop(0.4, 'rgba(255,110,70,.8)');
      g.addColorStop(0.65, 'rgba(180,60,220,.42)');
      g.addColorStop(1, 'rgba(70,60,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, m * 0.98, 0, 6.2832);
      c.fill();
      c.restore();
    };
    schijf(false);
    // het door de zwaartekracht gebogen licht van de achterkant van de schijf: een boog boven en onder het gat
    for (const s of [-1, 1]) {
      c.save();
      c.translate(m, m);
      c.beginPath();
      c.rect(-S, s < 0 ? -S : 0, S * 2, S);
      c.clip();
      const g = c.createRadialGradient(0, 0, 150, 0, 0, 260);
      g.addColorStop(0, 'rgba(255,250,235,0)');
      g.addColorStop(0.3, 'rgba(255,230,190,.9)');
      g.addColorStop(0.6, 'rgba(255,150,100,.4)');
      g.addColorStop(1, 'rgba(255,120,160,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 260, 0, 6.2832);
      c.fill();
      c.restore();
    }
    // het gat zelf en de fotonenring
    c.save();
    c.shadowColor = 'rgba(255,230,190,1)';
    c.shadowBlur = 40;
    c.fillStyle = '#000';
    c.beginPath();
    c.arc(m, m, 158, 0, 6.2832);
    c.fill();
    c.restore();
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(255,245,225,.95)';
    c.beginPath();
    c.arc(m, m, 160, 0, 6.2832);
    c.stroke();
    c.fillStyle = '#000';
    c.beginPath();
    c.arc(m, m, 154, 0, 6.2832);
    c.fill();
    schijf(true);
    return cv;
  }
  // de draaiende streepjes bovenop het gat, om de draaiing te zien
  function maakGatDraai() {
    const S = 1024;
    const cv = NW(S, S), c = cv.getContext('2d');
    const m = S / 2;
    c.translate(m, m);
    c.globalCompositeOperation = 'lighter';
    const rnd = zaad(77);
    for (let i = 0; i < 160; i++) {
      const r = 190 + rnd() * 300;
      const a = rnd() * 6.2832;
      const l = 0.12 + rnd() * 0.5;
      c.strokeStyle = `hsla(${280 + rnd() * 80},90%,${60 + rnd() * 30}%,${0.12 + 0.35 * (1 - (r - 190) / 300)})`;
      c.lineWidth = 1.5 + rnd() * 3;
      c.beginPath();
      c.arc(0, 0, r, a, a + l);
      c.stroke();
    }
    return cv;
  }
  function maakNevel(w, h, zaadw, paletten) {
    const cv = NW(w, h), c = cv.getContext('2d');
    const rnd = zaad(zaadw);
    c.fillStyle = '#04010c';
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 130; i++) {
      const x = rnd() * w, y = rnd() * h, r = 80 + rnd() * 240;
      const k = paletten[Math.floor(rnd() * paletten.length)];
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${k},${0.1 + rnd() * 0.13})`);
      g.addColorStop(1, `rgba(${k},0)`);
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // sterretjes
    for (let i = 0; i < 380; i++) {
      const x = rnd() * w, y = rnd() * h, r = 0.5 + rnd() * rnd() * 2.4;
      c.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      c.beginPath();
      c.arc(x, y, r, 0, 6.2832);
      c.fill();
    }
    return cv;
  }
  function maakStelsel(zaadw, kleuren, schuin) {
    const S = 640;
    const cv = NW(S, S), c = cv.getContext('2d');
    const m = S / 2;
    const rnd = zaad(zaadw);
    c.translate(m, m);
    c.scale(1, schuin);
    c.globalCompositeOperation = 'lighter';
    // de kern en de halo
    for (const [r, a, k] of [[300, 0.12, kleuren[2]], [150, 0.25, kleuren[1]], [60, 0.7, kleuren[0]]]) {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(${k},${a})`);
      g.addColorStop(1, `rgba(${k},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, r, 0, 6.2832);
      c.fill();
    }
    // de spiraalarmen: veel kleine stippen langs twee gedraaide armen
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 520; i++) {
        const q = Math.pow(rnd(), 0.8);
        const r = 18 + q * 280;
        const a = arm * 2.0944 + q * 5.2 + (rnd() - 0.5) * (0.5 - 0.3 * q);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        const k = q < 0.4 ? kleuren[0] : q < 0.75 ? kleuren[1] : kleuren[2];
        c.fillStyle = `rgba(${k},${0.25 + rnd() * 0.6})`;
        c.beginPath();
        c.arc(x, y, 0.8 + rnd() * 2.4, 0, 6.2832);
        c.fill();
      }
    }
    return cv;
  }
  // een zachte ring (voor schokgolven in de ruimte)
  function maakRing(k = '255,255,255') {
    const cv = NW(512, 512), c = cv.getContext('2d');
    const g = c.createRadialGradient(256, 256, 150, 256, 256, 256);
    g.addColorStop(0, `rgba(${k},0)`);
    g.addColorStop(0.72, `rgba(${k},0)`);
    g.addColorStop(0.9, `rgba(${k},.85)`);
    g.addColorStop(0.95, `rgba(${k},.4)`);
    g.addColorStop(1, `rgba(${k},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
    return cv;
  }
  // de krans achter de relikwie-kaart: een gouden ring met een regenboogrand en kleine tanden
  function maakKrans() {
    const S = 1024;
    const cv = NW(S, S), c = cv.getContext('2d');
    const m = S / 2;
    c.translate(m, m);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 240; i++) {
      const a0 = (i / 240) * 6.2832, a1 = ((i + 1.15) / 240) * 6.2832;
      c.strokeStyle = `hsla(${(i / 240) * 360},90%,65%,.9)`;
      c.lineWidth = 8;
      c.beginPath();
      c.arc(0, 0, 412, a0, a1);
      c.stroke();
    }
    for (const [r, w, k] of [[400, 22, 'rgba(255,215,110,.85)'], [380, 8, 'rgba(255,245,200,.9)'], [430, 6, 'rgba(255,255,255,.6)']]) {
      c.strokeStyle = k;
      c.lineWidth = w;
      c.shadowColor = 'rgba(255,200,80,1)';
      c.shadowBlur = 24;
      c.beginPath();
      c.arc(0, 0, r, 0, 6.2832);
      c.stroke();
    }
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,235,170,.9)';
    for (let i = 0; i < 48; i++) {
      c.save();
      c.rotate((i / 48) * 6.2832);
      c.beginPath();
      c.moveTo(-9, -440);
      c.lineTo(0, -(i % 2 ? 478 : 500));
      c.lineTo(9, -440);
      c.fill();
      c.restore();
    }
    return cv;
  }
  // scheuren in de werkelijkheid: bijna wit, met een gekleurde (cyaan/roze) rand; drie stappen die verder lopen
  function maakRissen() {
    const BW = 1920, BH = 1080;
    const takken = [];
    const rnd = zaad(19);
    const tak = (x, y, hoek, lengte, dikte, diepte) => {
      const p = [[x, y]];
      let a = hoek;
      for (let l = 0; l < lengte; ) {
        a += (rnd() - 0.5) * 0.8;
        const st = 24 + rnd() * 46;
        x += Math.cos(a) * st;
        y += Math.sin(a) * st;
        l += st;
        p.push([x, y]);
        if (diepte < 3 && rnd() < 0.11) tak(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.7), lengte * 0.5, dikte * 0.62, diepte + 1);
      }
      takken.push({ pad: p, dikte, diepte });
    };
    // vanuit het midden naar alle kanten, tot buiten het scherm
    for (let i = 0; i < 16; i++) tak(BW / 2 + (rnd() - 0.5) * 24, BH / 2 + (rnd() - 0.5) * 24, (i / 16) * 6.2832 + rnd() * 0.3, 900 + rnd() * 700, 6 + rnd() * 3, 0);
    return [0.28, 0.62, 1].map((stap) => {
      const cv = NW(BW, BH), c = cv.getContext('2d');
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (const [breed, kleur, blur, schaduw] of [[4.2, 'rgba(0,255,255,.5)', 22, 'rgba(0,255,255,.9)'], [3, 'rgba(255,60,200,.5)', 22, 'rgba(255,60,200,.9)'], [1.2, 'rgba(255,255,255,.98)', 6, 'rgba(255,255,255,.9)'], [0.5, '#fff', 0, 'rgba(255,255,255,0)']]) {
        c.shadowColor = schaduw;
        c.shadowBlur = blur;
        c.strokeStyle = kleur;
        for (const t of takken) {
          const n = Math.max(2, Math.floor(t.pad.length * Math.min(1, stap * (t.diepte ? 0.85 : 1.25))));
          c.lineWidth = t.dikte * breed;
          c.beginPath();
          c.moveTo(t.pad[0][0], t.pad[0][1]);
          for (let k = 1; k < n; k++) c.lineTo(t.pad[k][0], t.pad[k][1]);
          c.stroke();
        }
      }
      return cv;
    });
  }
  // een klein teken (ring met vierpuntige ster) dat vooraf even opflitst
  function maakTeken(kleur) {
    const S = 256;
    const cv = NW(S, S), c = cv.getContext('2d');
    const gl = c.createRadialGradient(128, 128, 0, 128, 128, 120);
    gl.addColorStop(0, `rgba(${kleur},.75)`);
    gl.addColorStop(0.4, `rgba(${kleur},.25)`);
    gl.addColorStop(1, `rgba(${kleur},0)`);
    c.fillStyle = gl;
    c.fillRect(0, 0, S, S);
    c.strokeStyle = `rgba(${kleur},1)`;
    c.lineWidth = 5;
    c.shadowColor = `rgba(${kleur},1)`;
    c.shadowBlur = 14;
    c.beginPath();
    c.arc(128, 128, 78, 0, 6.2832);
    c.stroke();
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(128, 128, 94, 0, 6.2832);
    c.stroke();
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 11 : 66;
      const a = (i / 8) * 6.2832 - Math.PI / 2;
      c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    return cv;
  }

  // ───── de logo's van de treden ─────
  function maakLogoT(A, d) {
    const tr = d.trede | 0;
    const sport = A.F_SPORT;
    const cv = A.nieuw(1900, 540);
    const c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const txt = ['', '', 'GLIM!', 'KOSMISCH!', 'MYTHISCH!'][tr];
    let fs = 340;
    c.font = `italic 900 ${fs}px ${sport}`;
    while (fs > 150 && c.measureText(txt).width > 1700) {
      fs -= 4;
      c.font = `italic 900 ${fs}px ${sport}`;
    }
    const cx = 950 - 16;
    const by = (tr === 4 ? 88 : 40) + fs * 0.86;
    c.lineJoin = 'round';
    c.miterLimit = 2;
    const S = {
      2: { gloed: 'rgba(120,230,255,.95)', buiten: 'rgba(40,10,90,.9)', diepte: ['#12063a', '#2a1070', '#4a2aa8'], binnen: '#ffffff', regel: ['#e6ffff', '#8af0ff', '#ff9ae8'] },
      3: { gloed: 'rgba(140,110,255,.95)', buiten: 'rgba(6,4,40,.92)', diepte: ['#04021a', '#0d0a45', '#1c1a8a'], binnen: '#c6f4ff', regel: ['#e8e0ff', '#a090ff', '#5ae8ff'] },
      4: { gloed: 'rgba(255,90,20,.98)', buiten: 'rgba(50,0,0,.92)', diepte: ['#1a0000', '#4a0600', '#8a1a00'], binnen: '#ffe27a', regel: ['#fff3b0', '#ffc93a', '#ff6a1a'] },
    }[tr];
    // vlammen boven de letters (mythisch)
    if (tr === 4) {
      const rnd = zaad(41);
      c.save();
      c.globalCompositeOperation = 'lighter';
      const breedte = c.measureText(txt).width;
      for (let i = 0; i < 46; i++) {
        const x = cx - breedte / 2 + (i / 45) * breedte + (rnd() - 0.5) * 20;
        const h = 40 + rnd() * 62;
        const y0 = by - fs * 0.78 + rnd() * 24;
        const g = c.createLinearGradient(0, y0, 0, y0 - h);
        g.addColorStop(0, 'rgba(255,200,60,.9)');
        g.addColorStop(0.5, 'rgba(255,90,10,.7)');
        g.addColorStop(1, 'rgba(200,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x - 15, y0);
        c.quadraticCurveTo(x - 6, y0 - h * 0.5, x + (rnd() - 0.5) * 12, y0 - h);
        c.quadraticCurveTo(x + 9, y0 - h * 0.4, x + 15, y0);
        c.closePath();
        c.fill();
      }
      c.restore();
    }
    c.save();
    c.shadowColor = S.gloed;
    c.shadowBlur = 50;
    c.lineWidth = 34;
    c.strokeStyle = S.buiten;
    c.strokeText(txt, cx, by);
    c.restore();
    for (let i = 16; i >= 1; i--) {
      c.fillStyle = i > 12 ? S.diepte[0] : i > 6 ? S.diepte[1] : S.diepte[2];
      c.fillText(txt, cx + i * 0.9, by + i * 1.15);
    }
    c.lineWidth = 30;
    c.strokeStyle = S.diepte[0];
    c.strokeText(txt, cx, by);
    c.lineWidth = 15;
    c.strokeStyle = S.binnen;
    c.strokeText(txt, cx, by);
    if (tr === 4) {
      c.lineWidth = 7;
      c.strokeStyle = '#ff7a1a';
      c.strokeText(txt, cx, by);
    }
    // de vulling
    let g;
    if (tr === 2) {
      g = c.createLinearGradient(130, by - fs, 1770, by);
      ['#8a6bff', '#ff5fd2', '#ffe6f8', '#5ff0ff', '#a8ff9a', '#ff9ae8', '#8a6bff'].forEach((k, i, l) => g.addColorStop(i / (l.length - 1), k));
    } else if (tr === 3) {
      g = c.createLinearGradient(0, by - fs * 0.86, 0, by);
      g.addColorStop(0, '#fff0ff');
      g.addColorStop(0.3, '#c89aff');
      g.addColorStop(0.62, '#5a5cff');
      g.addColorStop(1, '#27d4ff');
    } else {
      g = c.createLinearGradient(0, by - fs * 0.86, 0, by);
      g.addColorStop(0, '#fffbd0');
      g.addColorStop(0.28, '#ffd93a');
      g.addColorStop(0.58, '#ff7a14');
      g.addColorStop(0.85, '#e01a0a');
      g.addColorStop(1, '#8a0a0a');
    }
    c.fillStyle = g;
    c.fillText(txt, cx, by);
    // een eigen laag per trede, alleen binnen de letters
    c.save();
    c.globalCompositeOperation = 'source-atop';
    const rnd = zaad(5 + tr);
    if (tr === 2) {
      // holografische schuine banen en glinsters
      for (let i = 0; i < 10; i++) {
        const x = 120 + i * 175;
        const hg = c.createLinearGradient(x, 0, x + 120, 0);
        hg.addColorStop(0, 'rgba(255,255,255,0)');
        hg.addColorStop(0.5, `hsla(${i * 40},100%,85%,.5)`);
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = hg;
        c.beginPath();
        c.moveTo(x, by - fs);
        c.lineTo(x + 120, by - fs);
        c.lineTo(x + 40, by + 10);
        c.lineTo(x - 80, by + 10);
        c.fill();
      }
    } else if (tr === 3) {
      // een sterrenstelsel in de letters: nevelvlekken en sterretjes
      for (let i = 0; i < 16; i++) {
        const x = 150 + rnd() * 1600, y = by - fs * 0.8 + rnd() * fs * 0.8, r = 80 + rnd() * 150;
        const ng = c.createRadialGradient(x, y, 0, x, y, r);
        const k = [[255, 90, 220], [60, 200, 255], [140, 100, 255]][i % 3];
        ng.addColorStop(0, `rgba(${k},.55)`);
        ng.addColorStop(1, `rgba(${k},0)`);
        c.fillStyle = ng;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      c.fillStyle = '#fff';
      for (let i = 0; i < 160; i++) {
        c.globalAlpha = 0.4 + rnd() * 0.6;
        c.beginPath();
        c.arc(150 + rnd() * 1600, by - fs * 0.88 + rnd() * fs * 0.95, 0.8 + rnd() * 2.6, 0, 6.2832);
        c.fill();
      }
      c.globalAlpha = 1;
    } else {
      // vuur: lichte vlekken onderin en donkere barsten
      for (let i = 0; i < 14; i++) {
        const x = 140 + rnd() * 1620;
        const fg = c.createRadialGradient(x, by + 10, 0, x, by + 10, 120);
        fg.addColorStop(0, 'rgba(255,230,120,.5)');
        fg.addColorStop(1, 'rgba(255,100,0,0)');
        c.fillStyle = fg;
        c.fillRect(x - 120, by - 120, 240, 160);
      }
    }
    c.restore();
    // glans over de bovenste helft
    c.save();
    c.beginPath();
    c.rect(0, 0, 1900, by - fs * 0.34);
    c.clip();
    const gl = c.createLinearGradient(0, by - fs * 0.86, 0, by - fs * 0.34);
    gl.addColorStop(0, 'rgba(255,255,255,.7)');
    gl.addColorStop(1, 'rgba(255,255,255,.08)');
    c.fillStyle = gl;
    c.fillText(txt, cx, by);
    c.restore();
    // het niveau eronder
    const regel = d.legendarisch ? `LEGENDARISCH  ·  ${SPO.TREDE_NAMEN[tr].toUpperCase()}` : `${d.T.label.toUpperCase()}  ·  ${d.T.naam.toUpperCase()}`;
    c.font = `800 74px ${sport}`;
    if ('letterSpacing' in c) c.letterSpacing = '10px';
    c.lineWidth = 12;
    c.strokeStyle = 'rgba(8,0,24,.8)';
    c.strokeText(regel, 950, 515);
    const zg = c.createLinearGradient(380, 0, 1520, 0);
    S.regel.forEach((k, i, l) => zg.addColorStop(i / (l.length - 1), k));
    c.fillStyle = zg;
    c.fillText(regel, 950, 515);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    return cv;
  }
  // de titel van de ultieme kaart
  function maakTitelUlt(A, d) {
    const sport = A.F_SPORT;
    const cv = A.nieuw(1900, 700);
    const c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.miterLimit = 2;
    const regenboog = c.createLinearGradient(100, 0, 1800, 0);
    ['#ff4d6d', '#ffb02e', '#fff04a', '#4dff9a', '#3bd8ff', '#8a6bff', '#ff5fd2', '#ff4d6d'].forEach((k, i, l) => regenboog.addColorStop(i / (l.length - 1), k));
    const goud = (y0, y1) => {
      const g = c.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, '#fff0b0');
      g.addColorStop(0.62, '#ffc83a');
      g.addColorStop(1, '#ffe9a0');
      return g;
    };
    // "10" groot
    c.font = `italic 900 380px ${sport}`;
    const by1 = 330;
    c.save();
    c.shadowColor = 'rgba(255,220,120,1)';
    c.shadowBlur = 60;
    c.lineWidth = 36;
    c.strokeStyle = 'rgba(60,30,0,.9)';
    c.strokeText('10', 950, by1);
    c.restore();
    for (let i = 14; i >= 1; i--) {
      c.fillStyle = i > 8 ? '#3a1c00' : '#7a4a08';
      c.fillText('10', 950 + i * 0.8, by1 + i * 1.1);
    }
    c.lineWidth = 30;
    c.strokeStyle = '#3a1c00';
    c.strokeText('10', 950, by1);
    c.lineWidth = 17;
    c.strokeStyle = regenboog;
    c.strokeText('10', 950, by1);
    c.lineWidth = 6;
    c.strokeStyle = '#fffbe8';
    c.strokeText('10', 950, by1);
    c.fillStyle = goud(by1 - 330, by1);
    c.fillText('10', 950, by1);
    // DE PERFECTE KAART
    const t2 = 'DE PERFECTE KAART';
    let fs = 170;
    c.font = `italic 900 ${fs}px ${sport}`;
    if ('letterSpacing' in c) c.letterSpacing = '6px';
    while (fs > 80 && c.measureText(t2).width > 1700) {
      fs -= 4;
      c.font = `italic 900 ${fs}px ${sport}`;
    }
    const by2 = 560;
    c.save();
    c.shadowColor = 'rgba(255,200,90,.95)';
    c.shadowBlur = 36;
    c.lineWidth = 26;
    c.strokeStyle = 'rgba(60,30,0,.92)';
    c.strokeText(t2, 950, by2);
    c.restore();
    c.lineWidth = 22;
    c.strokeStyle = '#3a1c00';
    c.strokeText(t2, 950, by2);
    c.lineWidth = 10;
    c.strokeStyle = regenboog;
    c.strokeText(t2, 950, by2);
    c.fillStyle = goud(by2 - fs * 0.86, by2);
    c.fillText(t2, 950, by2);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    // twee sterretjes
    const ster = (x, y, r) => {
      c.fillStyle = '#fff';
      c.shadowColor = '#ffe9a0';
      c.shadowBlur = 20;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? r * 0.16 : r;
        const a = (i / 8) * 6.2832 - Math.PI / 2;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
    };
    ster(520, 190, 60);
    ster(1380, 230, 48);
    return cv;
  }
  // "SHINY!" voor het glim-moment
  function maakShiny(A) {
    const cv = A.nieuw(1100, 380);
    const c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.font = `italic 900 250px ${A.F_SPORT}`;
    c.save();
    c.shadowColor = 'rgba(120,240,255,1)';
    c.shadowBlur = 44;
    c.lineWidth = 30;
    c.strokeStyle = 'rgba(40,20,100,.92)';
    c.strokeText('SHINY!', 550, 270);
    c.restore();
    c.lineWidth = 12;
    c.strokeStyle = '#ffffff';
    c.strokeText('SHINY!', 550, 270);
    const g = c.createLinearGradient(100, 0, 1000, 0);
    ['#7ff3ff', '#ffffff', '#ff9ae8', '#ffffff', '#8affc8'].forEach((k, i, l) => g.addColorStop(i / (l.length - 1), k));
    c.fillStyle = g;
    c.fillText('SHINY!', 550, 270);
    return cv;
  }

  // een zachte gloed in een kleur (achter een wezen), en een verdonkerde kopie van een vleugel (de verre vleugel)
  function maakGloed(rgba) {
    const cv = NW(256, 256), c = cv.getContext('2d');
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, rgba.replace('ALPHA', '.9'));
    g.addColorStop(0.45, rgba.replace('ALPHA', '.3'));
    g.addColorStop(1, rgba.replace('ALPHA', '0'));
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    return cv;
  }
  function donkerder(A, bron, a) {
    const cv = A.nieuw(bron.width, bron.height);
    const c = cv.getContext('2d');
    c.drawImage(bron, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = `rgba(0,0,12,${a})`;
    c.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  // een gouden kroon met juwelen
  function maakKroon(A) {
    const kroon = A.nieuw(520, 360);
    {
      const c = kroon.getContext('2d');
      const vorm = () => {
        c.beginPath();
        c.moveTo(60, 300);
        c.lineTo(36, 110);
        c.lineTo(150, 205);
        c.lineTo(260, 52);
        c.lineTo(370, 205);
        c.lineTo(484, 110);
        c.lineTo(460, 300);
        c.closePath();
      };
      c.save();
      c.shadowColor = 'rgba(255,180,30,.95)';
      c.shadowBlur = 40;
      vorm();
      c.fillStyle = '#ffcc33';
      c.fill();
      c.restore();
      vorm();
      const g = c.createLinearGradient(0, 50, 0, 300);
      g.addColorStop(0, '#fffbe2');
      g.addColorStop(0.35, '#ffd84a');
      g.addColorStop(0.7, '#d98200');
      g.addColorStop(1, '#ffe08a');
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 10;
      c.strokeStyle = '#5a2c00';
      c.lineJoin = 'round';
      c.stroke();
      // de band
      c.fillStyle = '#b86a00';
      c.fillRect(64, 262, 392, 44);
      c.strokeRect(64, 262, 392, 44);
      // juwelen
      const juweel = (x, y, r, k) => {
        const jg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
        jg.addColorStop(0, '#ffffff');
        jg.addColorStop(0.35, k);
        jg.addColorStop(1, '#1a0630');
        c.fillStyle = jg;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = 5;
        c.stroke();
      };
      juweel(36, 104, 20, '#ff3d7a');
      juweel(260, 46, 26, '#3bd8ff');
      juweel(484, 104, 20, '#4dff9a');
      juweel(160, 284, 15, '#8a6bff');
      juweel(260, 284, 18, '#ff4d6d');
      juweel(360, 284, 15, '#3bd8ff');
    }
    return kroon;
  }

  // ───────────────────────── Afbeeldingen ─────────────────────────
  function maakArt(d) {
    const A = SPO.art;
    const sport = A.F_SPORT;

    // ── de treden boven zeldzaam ──
    function extra(o) {
      if (tr < 2) return o;
      const lt = lot(d);
      o.logoT = maakLogoT(A, d);
      if (legAlle && !o.kroon) o.kroon = maakKroon(A);
      o.upg = lt.upg;
      o.zwart = (() => {
        const z = A.nieuw(8, 8);
        const zc = z.getContext('2d');
        zc.fillStyle = '#000';
        zc.fillRect(0, 0, 8, 8);
        return z;
      })();
      o.ringen = { wit: maakRing(), goud: maakRing('255,205,100'), roze: maakRing('255,110,220'), blauw: maakRing('110,170,255') };
      if (tr === 2) o.shiny = maakShiny(A);
      if (tr === 3 || d.ultiem) {
        o.nevel = maakNevel(1280, 720, 5, ['120,60,255', '60,120,255', '255,80,200', '60,200,255']);
        o.planeten = maakPlaneten();
        o.gat = maakGat();
        o.gatDraai = maakGatDraai();
      }
      if (tr === 4) {
        o.wezenNaam = wezenVan(d);
        const wz = TEKEN_WEZEN[o.wezenNaam](WEZENS[o.wezenNaam]);
        if (wz.vleugel) wz.vleugelA = donkerder(A, wz.vleugel, 0.5);
        wz.gloed = maakGloed(WEZENS[o.wezenNaam].gloed.replace(/[\d.]+\)$/, 'ALPHA)'));
        o.wezen = wz;
      }
      if (lt.upg || d.ultiem) o.rissen = maakRissen();
      if (d.ultiem) {
        o.titelUlt = maakTitelUlt(A, d);
        o.stelsels = [maakStelsel(3, ['255,235,170', '255,170,90', '200,110,255'], 0.45), maakStelsel(4, ['230,245,255', '110,190,255', '120,90,255'], 0.7), maakStelsel(8, ['255,220,240', '255,120,200', '140,90,255'], 0.38)];
        o.krans = maakKrans();
        o.nevelUlt = maakNevel(1280, 720, 11, ['255,190,80', '255,90,190', '90,150,255', '150,100,255']);
      }
      return o;
    }
    const tr = d.trede | 0;
    const leg = !!d.legendarisch && tr < 2; // legendarisch op gewoon/zeldzaam: de eigen logo's en barsten; vanaf glim stapelt alleen de kroon
    const legAlle = !!d.legendarisch;
    const regenboog = ['#ff4d6d', '#ffb02e', '#fff04a', '#4dff9a', '#3bd8ff', '#8a6bff', '#ff5fd2', '#ff4d6d'];

    // het logo: ZELDZAAM! met dikke lijn, schuine diepte, regenboog en een glans; eronder het niveau
    const logo = A.nieuw(1900, 540);
    {
      const c = logo.getContext('2d');
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const txt = leg ? 'LEGENDARISCH!' : 'ZELDZAAM!';
      let fs = 340;
      c.font = `italic 900 ${fs}px ${sport}`;
      while (fs > 160 && c.measureText(txt).width > 1740) {
        fs -= 4;
        c.font = `italic 900 ${fs}px ${sport}`;
      }
      const cx = 950 - 16;
      const by = 40 + fs * 0.86;
      c.lineJoin = 'round';
      c.miterLimit = 2;
      // gloed
      c.save();
      c.shadowColor = leg ? 'rgba(255,190,40,.95)' : 'rgba(255,90,230,.95)';
      c.shadowBlur = 46;
      c.lineWidth = 34;
      c.strokeStyle = leg ? 'rgba(70,35,0,.9)' : 'rgba(40,10,70,.9)';
      c.strokeText(txt, cx, by);
      c.restore();
      // diepte: donkere kopieën schuin naar beneden
      for (let i = 16; i >= 1; i--) {
        c.fillStyle = leg ? (i > 12 ? '#2a1400' : i > 6 ? '#4a2600' : '#6e3a00') : i > 12 ? '#16062e' : i > 6 ? '#2a0f55' : '#3d1a7a';
        c.fillText(txt, cx + i * 0.9, by + i * 1.15);
      }
      c.lineWidth = 30;
      c.strokeStyle = leg ? '#2a1400' : '#120528';
      c.strokeText(txt, cx, by);
      if (leg) {
        // legendarisch: een regenboogrand om goud
        const rb = c.createLinearGradient(130, 0, 1770, 0);
        regenboog.forEach((k, i, l) => rb.addColorStop(i / (l.length - 1), k));
        c.lineWidth = 19;
        c.strokeStyle = rb;
        c.strokeText(txt, cx, by);
        c.lineWidth = 7;
        c.strokeStyle = '#fffbe8';
        c.strokeText(txt, cx, by);
      } else {
        c.lineWidth = 15;
        c.strokeStyle = '#ffffff';
        c.strokeText(txt, cx, by);
      }
      // vulling: regenboog, of goud bij legendarisch
      let g;
      if (leg) {
        g = c.createLinearGradient(0, by - fs * 0.86, 0, by);
        g.addColorStop(0, '#fffbe0');
        g.addColorStop(0.38, '#ffd84a');
        g.addColorStop(0.62, '#f29a00');
        g.addColorStop(1, '#ffe7a0');
      } else {
        g = c.createLinearGradient(130, 0, 1770, 0);
        regenboog.forEach((k, i, l) => g.addColorStop(i / (l.length - 1), k));
      }
      c.fillStyle = g;
      c.fillText(txt, cx, by);
      // glans over de bovenste helft en een donkere onderkant
      c.save();
      c.beginPath();
      c.rect(0, 0, 1900, by - fs * 0.34);
      c.clip();
      const gl = c.createLinearGradient(0, by - fs * 0.86, 0, by - fs * 0.34);
      gl.addColorStop(0, 'rgba(255,255,255,.85)');
      gl.addColorStop(1, 'rgba(255,255,255,.12)');
      c.fillStyle = gl;
      c.fillText(txt, cx, by);
      c.restore();
      c.save();
      c.globalCompositeOperation = 'source-atop';
      const sh = c.createLinearGradient(0, by - fs * 0.3, 0, by);
      sh.addColorStop(0, 'rgba(60,0,100,0)');
      sh.addColorStop(1, 'rgba(60,0,100,.38)');
      c.fillStyle = sh;
      c.fillRect(0, by - fs * 0.34, 1900, fs * 0.5);
      c.restore();
      // het niveau eronder
      const regel = leg ? `ZELDZAAM  ·  ${d.T.naam.toUpperCase()}` : `${d.T.label.toUpperCase()}  ·  ${d.T.naam.toUpperCase()}`;
      c.font = `800 74px ${sport}`;
      if ('letterSpacing' in c) c.letterSpacing = '10px';
      c.lineWidth = 12;
      c.strokeStyle = 'rgba(8,0,24,.8)';
      c.strokeText(regel, 950, 515);
      const zg = c.createLinearGradient(380, 0, 1520, 0);
      zg.addColorStop(0, '#fff3b0');
      zg.addColorStop(0.5, '#ffc93a');
      zg.addColorStop(1, '#ff9a3a');
      c.fillStyle = zg;
      c.fillText(regel, 950, 515);
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }

    // de tekst van de tease, met kleurverschuiving en afgesneden lijnen
    const tease = A.nieuw(1500, 210);
    {
      const c = tease.getContext('2d');
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const txt = 'ER GEBEURT IETS...';
      let fs = 150;
      c.font = `italic 900 ${fs}px ${sport}`;
      if ('letterSpacing' in c) c.letterSpacing = '8px';
      while (fs > 70 && c.measureText(txt).width > 1400) {
        fs -= 3;
        c.font = `italic 900 ${fs}px ${sport}`;
      }
      const y = 30 + fs * 0.86;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(0,255,255,.85)';
      c.fillText(txt, 750 - 7, y);
      c.fillStyle = 'rgba(255,0,200,.85)';
      c.fillText(txt, 750 + 7, y);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#ffffff';
      c.fillText(txt, 750, y);
      c.globalCompositeOperation = 'destination-out';
      for (let yy = 0; yy < 210; yy += 7) {
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.fillRect(0, yy, 1500, 2);
      }
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }

    // een glinsterster met vier punten en een zachte gloed
    const ster = A.nieuw(192, 192);
    {
      const c = ster.getContext('2d');
      const gl = c.createRadialGradient(96, 96, 0, 96, 96, 70);
      gl.addColorStop(0, 'rgba(255,255,255,.95)');
      gl.addColorStop(0.18, 'rgba(255,240,190,.55)');
      gl.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = gl;
      c.fillRect(0, 0, 192, 192);
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 11 : 92;
        const a = (i / 8) * 6.2832 - Math.PI / 2;
        c.lineTo(96 + Math.cos(a) * r, 96 + Math.sin(a) * r);
      }
      c.closePath();
      c.fillStyle = '#fff';
      c.fill();
    }
    if (!leg) return extra({ logo, tease, ster });

    // ── alleen bij legendarisch ──
    // de tweede tekst van de tease, in goud
    const tease2 = A.nieuw(1500, 210);
    {
      const c = tease2.getContext('2d');
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const txt = 'DIT IS GEEN GEWONE KAART';
      let fs = 130;
      c.font = `italic 900 ${fs}px ${sport}`;
      if ('letterSpacing' in c) c.letterSpacing = '6px';
      while (fs > 60 && c.measureText(txt).width > 1420) {
        fs -= 3;
        c.font = `italic 900 ${fs}px ${sport}`;
      }
      const y = 40 + fs * 0.86;
      c.save();
      c.shadowColor = 'rgba(255,170,20,.95)';
      c.shadowBlur = 30;
      c.fillStyle = '#ffcf40';
      c.fillText(txt, 750, y);
      c.restore();
      const gg = c.createLinearGradient(0, y - fs * 0.8, 0, y);
      gg.addColorStop(0, '#fffbe6');
      gg.addColorStop(0.55, '#ffd34a');
      gg.addColorStop(1, '#ff9d00');
      c.fillStyle = gg;
      c.fillText(txt, 750, y);
      c.globalCompositeOperation = 'destination-out';
      for (let yy = 0; yy < 210; yy += 7) {
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.fillRect(0, yy, 1500, 2);
      }
      if ('letterSpacing' in c) c.letterSpacing = '0px';
    }

    // barsten in het 'glas' voor het beeld: drie stappen, elke stap gaat verder; wit met een gouden gloed
    const BW = 1920, BH = 1080;
    const takken = [];
    {
      let zaad = 7;
      const rnd = () => ((zaad = (zaad * 16807) % 2147483647) / 2147483647);
      const tak = (x, y, hoek, lengte, dikte, diepte) => {
        const pad = [[x, y]];
        let a = hoek;
        for (let l = 0; l < lengte; ) {
          a += (rnd() - 0.5) * 0.7;
          const st = 22 + rnd() * 40;
          x += Math.cos(a) * st;
          y += Math.sin(a) * st;
          l += st;
          pad.push([x, y]);
          if (diepte < 2 && rnd() < 0.09) tak(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), lengte * 0.45, dikte * 0.6, diepte + 1);
        }
        takken.push({ pad, dikte, diepte });
      };
      for (let i = 0; i < 13; i++) tak(BW / 2 + (rnd() - 0.5) * 30, BH / 2 + (rnd() - 0.5) * 30, (i / 13) * Math.PI * 2 + rnd() * 0.4, 380 + rnd() * 900, 5 + rnd() * 3, 0);
      // ringen om het inslagpunt
      for (let r = 0; r < 3; r++) {
        const R = 70 + r * 85 + rnd() * 20;
        const pad = [];
        for (let k = 0; k <= 26; k++) {
          const a = (k / 26) * Math.PI * 2;
          const rr = R * (0.85 + rnd() * 0.3);
          pad.push([BW / 2 + Math.cos(a) * rr, BH / 2 + Math.sin(a) * rr]);
        }
        takken.push({ pad, dikte: 3.5 - r, diepte: 0, ring: r });
      }
    }
    const barst = [0.3, 0.6, 1].map((stap) => {
      const cv = A.nieuw(BW, BH);
      const c = cv.getContext('2d');
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (const [breed, kleur, blur] of [[3.2, 'rgba(255,190,60,.55)', 18], [1, 'rgba(255,236,170,.95)', 6], [0.42, 'rgba(255,255,255,1)', 0]]) {
        c.shadowColor = 'rgba(255,170,30,.9)';
        c.shadowBlur = blur;
        c.strokeStyle = kleur;
        for (const t of takken) {
          if (t.ring !== undefined && t.ring > stap * 3 - 1) continue;
          const n = Math.max(2, Math.floor(t.pad.length * Math.min(1, stap * (t.diepte ? 0.8 : 1.15))));
          c.lineWidth = t.dikte * breed;
          c.beginPath();
          c.moveTo(t.pad[0][0], t.pad[0][1]);
          for (let k = 1; k < n; k++) c.lineTo(t.pad[k][0], t.pad[k][1]);
          c.stroke();
        }
      }
      // een felle kern in het midden
      const g = c.createRadialGradient(BW / 2, BH / 2, 0, BW / 2, BH / 2, 120 * stap + 40);
      g.addColorStop(0, `rgba(255,250,220,${0.15 + 0.25 * stap})`);
      g.addColorStop(1, 'rgba(255,190,60,0)');
      c.shadowBlur = 0;
      c.fillStyle = g;
      c.fillRect(0, 0, BW, BH);
      return cv;
    });

    const kroon = maakKroon(A);
    return extra({ logo, tease, ster, tease2, barst, kroon });
  }

  // ───────────────────────── De reeks ─────────────────────────
  // c: de omgeving van scene.js (zie het blok ctxZ daar).
  function maak(c) {
    const { tl, d, I, audio, trillen, reduceer, art } = c;
    const tr = c.trede | 0; // de ladder: 0 gewoon, 1 zeldzaam, 2 glim, 3 kosmisch, 4 mythisch
    const [t0, t1] = tl.tease;
    const TEASE = t1 - t0;
    const K0 = tl.K0;
    const RV = tl.RV;
    const snel = d.snel;
    const leg = !!d.legendarisch; // legendarisch (kroon, supernova), op elke trede
    const legT = leg && !!art.barst; // alleen op gewoon/zeldzaam: ook het glas dat barst in de tease
    const ult = !!d.ultiem && !!tl.ult;
    const upg = !!tl.upg;
    const eigenT = tr >= 3 && !upg; // kosmisch en mythisch hebben een eigen, lange tease (tenzij het een upgrade is)
    const RGN = tr >= 3 ? 0 : 1; // vanaf kosmisch zijn de vonken niet regenboog maar in het thema van de trede
    const U = tl.U;
    const UL = tl.ult;
    // tb: het begin van de gewone tease. Bij legendarisch komt daar eerst een stuk met barsten in het glas voor (t0 … tb).
    const tb = legT ? t1 - (snel ? 1.15 : 2.5) : t0;
    const N = leg ? tl.nova : Infinity; // de supernova (scènetijd)
    const echt = (ts) => (tl.echt ? tl.echt(ts) : ts);
    const tex = { logo: c.tekstuur(art.logo), tease: c.tekstuur(art.tease), ster: c.tekstuur(art.ster) };
    if (legT) {
      tex.tease2 = c.tekstuur(art.tease2);
      tex.barst = art.barst.map((b) => c.tekstuur(b));
    }
    if (leg) tex.kroon = c.tekstuur(art.kroon);
    const goud1 = [1, 0.8, 0.28];
    const goud2 = [1, 0.95, 0.72];
    const k1 = [1, 1, 1];
    const k2 = [1, 1, 1];
    const regen = (t, a = 0.12, b = 0.35) => {
      if (tr >= 2 && tema(t, k1, k2) && !naBang(t)) return;
      SPO.hsv(t * a, 0.7, 1, k1);
      SPO.hsv(t * a + b, 0.8, 1, k2);
    };
    const rg = reduceer ? 0.3 : 1; // minder flikkering als je dat wilt

    // ───── de hartslag van de tease: gelijk aan het geluid (zie scripts/bouw-zeldzaam.py) ─────
    const geluidLen = 2.6;
    const eindGeluid = t1 + 0.04;
    let startGeluid = eindGeluid - 2.58;
    let offset = 0;
    if (startGeluid < tb - 0.05) {
      offset = tb - startGeluid;
      startGeluid = tb;
    }
    const slagen = [];
    {
      let tb = 0.05;
      while (tb < 2.2) {
        const q = tb / 2.2;
        slagen.push(tb, tb + 0.17 - 0.06 * q);
        tb += 0.62 - 0.32 * q;
      }
    }
    const beats = slagen.map((s) => startGeluid - offset + s).filter((b) => b >= tb - 0.02 && b < t1 - 0.1);
    // legendarisch: twee trage, zware slagen vóór de gewone tease; bij elke slag barst het glas verder
    const A = tb - t0;
    const slagenA = legT ? [t0 + 0.14 * A, t0 + 0.6 * A] : [];
    const barstStap = (t) => (t >= tb + 0.45 * (t1 - tb) ? 2 : t >= slagenA[1] ? 1 : t >= slagenA[0] ? 0 : -1);
    const thumpA = (t) => {
      let s = 0;
      for (const b of slagenA) {
        const dt = t - b;
        if (dt >= 0 && dt < 1.2) s += Math.exp(-dt / 0.14);
      }
      return Math.min(1.4, s);
    };
    const thump = (t) => {
      let s = 0;
      for (let i = 0; i < beats.length; i++) {
        const dt = t - beats[i];
        if (dt >= 0 && dt < 0.8) s += Math.exp(-dt / 0.09) * (i % 2 ? 0.6 : 1);
      }
      return Math.min(1.4, s);
    };

    // ───── geluid ─────
    if (!eigenT) c.at(startGeluid, () => audio.speel('zeldzaam-tease', { gain: 1.1, offset, duur: geluidLen - offset, fadeOut: 0.03, galmen: 0.1 }));
    c.at(RV - 1.9, () => audio.speel('zeldzaam-koor', { gain: 0.95, fadeOut: 1.2, galmen: 0.25 }));
    c.at(RV - 0.04, () => audio.speel('zeldzaam-boem', { gain: 1.0, galmen: 0.25 }));
    c.at(RV + 0.35, () => audio.speel('zeldzaam-boem', { gain: 0.45, rate: 1.25, galmen: 0.25 }));

    // ───── flitsen, schokken en golven ─────
    // de tease: een schok op elke hartslag en één grote ontlading precies voor de kaart
    for (const b of beats) {
      if (!eigenT) c.schok(b, 0.006 + 0.01 * ramp(b, tb, t1), 0.12);
    }
    if (!eigenT) {
      c.flits(t1 - 0.02, 1.5, 0.05);
      c.flits(t1 - 0.02, 0.9, 0.22);
      c.golf(t1 - 0.02, 1.5, 1.1, 0);
    }
    c.trillen = trillen;
    if (!eigenT) c.at(t1 - 0.5, () => trillen([30, 30, 60, 30, 120]));
    // de kaart komt: een regenboogexplosie met drie golven
    c.golf(K0, 1.6, 0.9, 0);
    c.golf(K0 + 0.12, 1.2, 0.8, 0);
    c.golf(K0 + 0.26, 2.0, 0.6, 0);
    c.schok(K0, 0.05, 0.3);
    c.flits(K0, 0.7, 0.12);
    // de onthulling: groter dan de gewone en in slow-motion; een regenboog-schokgolf over het hele scherm
    c.flits(RV, 0.8, 0.05);
    c.flits(RV + 0.04, 0.3, 0.2);
    c.schok(RV, 0.1, 0.5);
    for (let i = 0; i < 6; i++) {
      c.golf(RV + 0.18 * i, 1.0 + 0.25 * i, 1.0 - 0.07 * i, 0.03);
      if (i % 2 === 0) c.flits(RV + 0.18 * i, 0.3, 0.1);
      if (i % 2 === 1) c.schok(RV + 0.18 * i, 0.03, 0.2);
    }
    c.at(RV, () => trillen([80, 40, 80, 40, 80, 40, 400]));

    // ───── deeltjes ─────
    const w = (o) => c.e0(o);
    // de explosie van de kaart: regenboogvonken in een grote bol, plus een staart tijdens het draaien
    w({ mode: 0, t0: K0, delay: 0.1, life: 2.4, n: 1800, org: [0, 0.01], angle: 0, spread: c.TWEE_PI, spd: [0.3, 3.2], grav: [0, -0.2], drag: 1.2, size: [0.002, 0.007], col1: k1, col2: k2, alpha: 0.9, regen: RGN, seed: 31 });
    w({ mode: 0, t0: K0, delay: tl.spin * 0.85, life: 1.2, n: 700, org: [0, 0.01], angle: 0, spread: c.TWEE_PI, spd: [0.15, 1.4], grav: [0, 0], drag: 2.0, size: [0.0016, 0.0045], col1: k1, col2: k2, alpha: 0.8, regen: RGN, seed: 32 });
    // de confettistorm: 3D-stukjes, linten, kanonnen links en rechts
    const vlak = (o) => Object.assign({ mode: 7, per: 1, alpha: 1, blend: 'alpha', drag: 0.55, regen: 0 }, o);
    w(vlak({ t0: RV + 0.1, life: 5.4, delay: 3.0, n: 1700, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.45], grav: [0, -0.16], size: [0.006, 0.016], col1: [1, 0.85, 0.3], col2: [1, 0.35, 0.7], seed: 41, per: 2 }));
    const kanon = (zijde, seed) => {
      const o = w(vlak({ t0: RV + 0.25, life: 4.4, delay: 0.5, n: 900, org: [0, -0.52], angle: Math.PI / 2 - zijde * 0.62, spread: 0.7, spd: [0.7, 2.1], grav: [0, -0.5], drag: 1.15, size: [0.006, 0.016], col1: [0.4, 1, 0.6], col2: [0.4, 0.8, 1], regen: RGN, seed }));
      o.bij = (x, asp) => {
        x.org[0] = zijde * asp * 0.5 * 0.95;
      };
    };
    kanon(-1, 42);
    kanon(1, 43);
    w(vlak({ t0: RV + 0.1, life: 5.0, delay: 2.0, n: 1100, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.6, spd: [0.05, 0.4], grav: [0, -0.14], size: [0.006, 0.016], col1: [1, 0.5, 0.8], col2: [0.5, 0.9, 1], regen: RGN, seed: 44, per: 2 }));
    w(vlak({ t0: RV + 2.6, life: 6, delay: 3.0, n: 800, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.4], grav: [0, -0.13], size: [0.006, 0.015], col1: [1, 0.85, 0.3], col2: [0.7, 0.4, 1], seed: 45, per: 2 }));
    w(vlak({ t0: RV + 5.2, life: 8, delay: 6.0, n: 420, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.35], grav: [0, -0.12], size: [0.006, 0.015], col1: [1, 0.85, 0.3], col2: [1, 0.4, 0.7], regen: RGN, seed: 46, per: 2 }));

    // ───── LEGENDARISCH: barsten, glas, gouden tunnel, kroon en een supernova ─────
    if (legT) {
      // het stuk vóór de tease: twee zware slagen, glas dat barst
      for (const b of slagenA) {
        c.at(b, () => {
          audio.speel('hartslag', { gain: 1.2, rate: 0.72, galmen: 0.35 });
          audio.speel('schiet-scherf', { gain: 0.55, rate: 0.7, galmen: 0.4 });
        });
        c.schok(b, 0.025, 0.25);
        c.flits(b, 0.25, 0.08);
      }
      c.at(t0 + 0.02, () => audio.speel('boem', { gain: 0.55, rate: 0.55, galmen: 0.4 }));
      const s3 = tb + 0.45 * (t1 - tb);
      c.at(s3, () => audio.speel('schiet-scherf', { gain: 0.7, rate: 0.85, galmen: 0.3 }));
      c.schok(s3, 0.02, 0.2);
      // het glas spat uit elkaar
      c.at(t1 - 0.03, () => {
        audio.speel('schiet-scherf', { gain: 1.0, rate: 1.0, galmen: 0.3 });
        audio.speel('schiet-laatste', { gain: 0.6, rate: 0.8, galmen: 0.3 });
      });
      w({ mode: 7, t0: t1 - 0.02, delay: 0.05, life: 2.4, n: 520, org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.5, 2.8], grav: [0, -0.8], drag: 0.9, size: [0.012, 0.042], col1: [0.85, 0.95, 1], col2: [1, 0.88, 0.5], alpha: 1, blend: 'alpha', regen: 0, seed: 61, per: 1 });
      w({ mode: 0, t0: t1 - 0.02, delay: 0.08, life: 1.6, n: 800, org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.6, 3.6], grav: [0, -0.3], drag: 1.3, size: [0.002, 0.007], col1: goud1, col2: goud2, alpha: 1, seed: 62 });
      c.golf(t1 + 0.05, 2.2, 1.0, 0);
    }
    if (leg) {
      // de kaart komt: een gouden explosie extra
      w({ mode: 0, t0: K0, delay: 0.25, life: 2.2, n: 600, org: [0, 0.01], angle: 0, spread: c.TWEE_PI, spd: [0.4, 3.0], grav: [0, -0.15], drag: 1.1, size: [0.002, 0.007], col1: goud1, col2: goud2, alpha: 1, seed: 63 });

      // ── de supernova ──
      c.at((N - 1.25), () => audio.speel('riser', { gain: 1.1, rate: 0.9, galmen: 0.3 }));
      c.at((N - 1.0), () => audio.speel('zeldzaam-tease', { gain: 0.7, offset: 1.5, duur: 1.0, fadeOut: 0.05, galmen: 0.2 }));
      c.at((N - 0.04), () => {
        audio.speel('zeldzaam-boem', { gain: 1.2, rate: 0.75, galmen: 0.35 });
        audio.boem(1, 0.6);
        audio.fanfare(1);
        trillen([120, 40, 120, 40, 120, 40, 500]);
      });
      c.at((N + 0.15), () => audio.speel('zeldzaam-koor', { gain: 1.0, rate: 0.9, fadeOut: 1.5, galmen: 0.35 }));
      c.at((N + 0.3), () => audio.publiek(5, 1));
      c.flits(N, 0.9, 0.05);
      c.flits(N + 0.03, 0.35, 0.25);
      c.schok(N, 0.14, 0.55);
      for (let i = 0; i < 3; i++) c.golf(N + 0.14 * i, 1.4 + 0.4 * i, 0.75 - 0.15 * i, 0.02);
      // de knal: goud en regenboog
      w({ mode: 0, t0: N, delay: 0.15, life: 2.6, n: 1000, org: [0, 0.02], angle: 0, spread: c.TWEE_PI, spd: [0.5, 4.2], grav: [0, -0.25], drag: 1.0, size: [0.0022, 0.008], col1: goud1, col2: goud2, alpha: 1, seed: 71 });
      w({ mode: 0, t0: N, delay: 0.4, life: 3.0, n: 800, org: [0, 0.02], angle: 0, spread: c.TWEE_PI, spd: [0.3, 2.8], grav: [0, -0.3], drag: 1.0, size: [0.002, 0.007], col1: k1, col2: k2, alpha: 0.9, regen: RGN, seed: 72 });
      // vuurwerk overal
      for (let i = 0; i < 14; i++) {
        const tt = N + 0.35 + i * 0.26 + hash(i * 1.7) * 0.12;
        const x = (hash(i * 3.1 + 1) - 0.5) * 1.3;
        const y = 0.05 + hash(i * 5.3 + 2) * 0.33;
        const kl = [0, 0, 0];
        const kl2 = [0, 0, 0];
        SPO.hsv(i % 3 === 0 ? 0.12 : hash(i * 7.7), i % 3 === 0 ? 0.65 : 0.75, 1, kl);
        SPO.hsv(i % 3 === 0 ? 0.14 : hash(i * 7.7) + 0.08, 0.3, 1, kl2);
        w({ mode: 0, t0: tt, delay: 0.04, life: 1.7, n: 420, org: [x, y], angle: 0, spread: c.TWEE_PI, spd: [0.15, 0.62], grav: [0, -0.12], drag: 1.5, size: [0.0018, 0.005], col1: kl, col2: kl2, alpha: 1, seed: 80 + i });
        c.at((tt), () => audio.vuurwerk());
      }
      // een regen van gouden munten en nog meer confetti
      w(vlak({ t0: N + 0.1, life: 6.5, delay: 3.6, n: 1100, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.4], grav: [0, -0.2], size: [0.009, 0.02], col1: [1, 0.72, 0.15], col2: [1, 0.93, 0.55], seed: 90, per: 2 }));
      w(vlak({ t0: N + 0.2, life: 5.0, delay: 2.4, n: 1000, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.6, spd: [0.05, 0.4], grav: [0, -0.14], size: [0.006, 0.016], col1: [1, 0.5, 0.8], col2: [0.5, 0.9, 1], regen: RGN, seed: 91, per: 2 }));
      const kanonN = (zijde, seed) => {
        const o = w(vlak({ t0: N + 0.05, life: 4.4, delay: 0.4, n: 800, org: [0, -0.52], angle: Math.PI / 2 - zijde * 0.55, spread: 0.6, spd: [0.8, 2.3], grav: [0, -0.5], drag: 1.15, size: [0.006, 0.016], col1: goud1, col2: goud2, regen: 0, seed }));
        o.bij = (x, asp) => {
          x.org[0] = zijde * asp * 0.5 * 0.95;
        };
      };
      kanonN(-1, 92);
      kanonN(1, 93);
    }

    // het stuk vóór de gewone tease (alleen legendarisch): de tekst in goud
    function teaseA(t, visB) {
      const u = ramp(t, t0, tb);
      const th = thumpA(t);
      c.licht(t, 0, 0, 0.6 * th, 0.02, 0.5 * th, 0.6 * th, t * 0.3, goud1);
      const ta = sm(u, 0.45, 0.6) * (1 - sm(u, 0.94, 1));
      if (ta > 0.002) {
        const wT = Math.min(2.1, visB * 0.9);
        const hT = wT * (210 / 1500);
        const flik = hash(Math.floor(t * 11)) > 0.82 ? 1 : 0.1;
        c.vlak(t, tex.tease2, 0, -0.42, 0, 0, 0, 0, wT, hT, ta * 9, ramp(u, 0.45, 0.8) * 1.5 - 0.1, 1, flik * 0.5 * rg, goud1, 0.25 * flik * rg, 0);
      }
    }
    // de barsten in het glas, over alles heen; feller op elke slag
    function barstTeken(t, asp, visB) {
      const st = barstStap(t);
      if (st < 0 || t >= t1) return;
      const bt = st === 0 ? slagenA[0] : st === 1 ? slagenA[1] : tb + 0.45 * (t1 - tb);
      const fel = 1 + 1.2 * Math.exp(-(t - bt) / 0.12) + (t > t1 - 0.4 ? 0.6 * ramp(t, t1 - 0.4, t1) : 0);
      const breed = Math.max(visB, (visB / asp) * (1920 / 1080));
      c.vlak(t, tex.barst[st], 0, 0, 0, 0, 0, 0, breed * 1.02, breed * 1.02 * (1080 / 1920), (t < tb ? 1.6 : 3.2) * fel, 2, 1, 0, goud1, 0, 0);
    }

    // ───── de tease tekenen ─────
    function teaseTeken0(t, asp, visB) {
      if (legT) barstTeken(t, asp, visB);
      if (t < tb) return teaseA(t, visB);
      const u = ramp(t, tb, t1);
      const th = thump(t);
      const dark = 1 - sm(u, 0.88, 0.99);
      regen(t, 0.5, 0.3);
      // een klein regenboog-hart dat groeit, met dunne stralen
      if (!snel || c.kw < 2) c.stralen(t, 1.6 * sm(u, 0.06, 0.4) * dark, 0.12 + 0.55 * u * u + 0.2 * th, 0.05 + 0.5 * Math.pow(u, 2.5) + 0.18 * th, 0.12, 0, 0, t * 0.45, 1, k1, k2, 12 + Math.round(10 * u));
      c.licht(t, 0, 0, 2.5 * (0.1 + 0.55 * u * u) * dark * (0.8 + 0.4 * th), 0.01 + 0.06 * u, 0.7 * u * u * dark, 1.2 * u * u * u * dark, t * 0.6, k1);
      // de tekst
      const ta = sm(u, 0.1, 0.17) * (1 - sm(u, 0.84, 0.92));
      if (ta > 0.002) {
        const wT = Math.min(2.25, visB * 0.94);
        const hT = wT * (210 / 1500);
        const flik = hash(Math.floor(t * 13)) > 0.76 ? 1 : 0.12;
        const veeg = ramp(u, 0.12, 0.5) * 1.5 - 0.1;
        c.vlak(t, tex.tease, (hash(Math.floor(t * 17)) - 0.5) * 0.012 * flik, 0.03, 0, 0, 0, 0, wT * (1 + 0.035 * th), hT * (1 + 0.035 * th), ta * 12 * (0.8 + 0.25 * th), veeg, 1, flik * 0.9 * rg, k1, (0.35 + 0.65 * flik) * rg, 0);
      }
    }

    // ───── de viering: stralen achter de kaart, regenboogtunnel bij de aankomst ─────
    function achter0(t, asp) {
      regen(t);
      // de regenboogtunnel: de kaart komt er doorheen aanvliegen
      const tun = sm(t, K0 - 0.08, K0 + 0.25) * (1 - sm(t, K0 + tl.spin * 0.62, K0 + tl.spin + 0.5));
      if (tun > 0.004 && tr < 3) {
        const h = t * 0.35;
        const a = [0, 0, 0];
        const b = [0, 0, 0];
        if (leg && tr < 3) {
          // goud, met af en toe een regenboogflits
          SPO.hsv(0.11 + 0.03 * Math.sin(t * 3), 0.7, 1, a);
          SPO.hsv(h, 0.6, 1, b);
          c.warp(t, tun * 0.8, 2.0 - 1.2 * ramp(t, K0, K0 + tl.spin), 0.6, a, b);
          c.licht(t, 0, 0, 0.25 * tun, 0.04, 0.3 * tun, 0.35 * tun, t * 0.5, goud1);
        } else {
          SPO.hsv(h, 0.7, 1, a);
          SPO.hsv(h + 0.4, 0.85, 1, b);
          c.warp(t, tun * 0.9, 1.7 - 1.0 * ramp(t, K0, K0 + tl.spin), 0.7, a, b);
        }
      }
      // draaiende lichtbundels: twee lagen die tegen elkaar in draaien, en zoeklichten vanuit de onderhoeken
      const r = t - RV;
      if (leg && t > N - 1.3 && t < N + 4) {
        // de supernova: eerst trekt het licht samen, dan een enorme gouden ster en stralen die wegschieten
        const pre = sm(t, N - 1.2, N) * (t < N ? 1 : 0);
        const na = t >= N ? Math.exp(-(t - N) / 0.9) : 0;
        c.licht(t, 0, 0.02, 0.2 * pre + 0.6 * na, 0.02 + 0.1 * (1 - na), 0.3 * pre + 0.8 * na, 0.25 * pre + 0.9 * na, t * 0.4, goud1);
        if (na > 0.01) c.stralen(t, 0.55 * na, 0.9, 0.3 * na, 0.2, 0, 0.02, -t * 0.8, 1, goud1, goud2, 40);
      }
      if (t > K0) {
        // legendarisch: vlak voor de supernova wordt het stil en donker, daarna komt alles terug
        const stilte = leg ? 1 - 0.9 * sm(t, N - 1.1, N - 0.2) * (1 - sm(t, N, N + 0.5)) : 1;
        const rust = (1 - 0.35 * sm(r, leg ? N - RV + 2.5 : 3.5, leg ? N - RV + 5.5 : 6.5)) * stilte;
        const al = sm(t, K0 + tl.spin * 0.5, RV) * 0.25 + sm(r, 0, 0.5) * (0.35 + 0.4 * sm(r, 0.8, 2));
        regen(t, 0.14, 0.4);
        c.stralen(t, al * rust, 0.55 + 0.5 * Math.exp(-r / 1.2) * (r > 0 ? 1 : 0), 0.2, 0.2, 0, 0.02, t * 0.5, 1, k1, k2, 26);
        if (c.kw < 3) c.stralen(t, al * 0.5 * rust, 0.4, 0.05, 0.1, 0, 0.02, -t * 0.33 + 1, 1, k2, k1, 11);
        if (r > 0 && c.kw < 2) {
          const zw = sm(r, 0.3, 0.9) * rust;
          const sw = Math.sin(t * 0.9) * 0.5;
          c.stralen(t, zw * 0.55, 0.5, 0.05, 0.05, -asp * 0.5, -0.62, 1.2 + sw, 1, k1, k2, 3);
          c.stralen(t, zw * 0.55, 0.5, 0.05, 0.05, asp * 0.5, -0.62, 1.95 - sw, 1, k2, k1, 3);
        }
      }
    }

    // ───── het logo en de sterren (voorgrond) ─────
    function voor0(t, fit, asp, visB, layY) {
      const r = logoR(t);
      if (r < 0) return;
      const wT = Math.min(2.0, visB * 0.95);
      const hT = wT * (540 / 1900);
      const slag = veer(ramp(r, 0, 0.55));
      const groot = 1 + 1.1 * Math.pow(1 - ramp(r, 0, 0.7), 2.2); // het logo slaat in vanuit groot
      const yRust = 0.47 * fit + 0.5 * hT * 0.95;
      const y = mix(yRust - 0.18, yRust, glad(ramp(r, 0, 0.9)));
      // glitch: veel in het begin, daarna af en toe een korte stoot
      const per = (r - 1.0) % 1.9;
      const stoot = r > 1.0 && per >= 0 && per < 0.16 ? 1 : 0;
      const gl = Math.min(1, Math.exp(-r / 0.35) * 1.2 + stoot * 0.85) * rg;
      const fl = hash(Math.floor(t * 21)) > 0.7 ? 1 : 0.5;
      const wob = Math.sin(t * 2.2) * 0.012;
      const hue = Math.sin(t * 0.7) * 0.55;
      const sc = Math.max(0.001, slag) * groot * (1 + 0.025 * Math.sin(t * 3));
      const al = sm(r, 0, 0.1);
      c.vlak(t, logoNu(t), (stoot ? (hash(Math.floor(t * 30)) - 0.5) * 0.05 : 0), y, 0.02, 0, 0, wob - 0.03 * (1 - slag), wT * sc, hT * sc, al, 2, 0, gl * 0.8, k1, gl * (0.5 + 0.5 * fl) + 0.12, hue);
      // legendarisch: een kroon die op het logo valt, en bij de supernova een felle gloed
      if (leg && r > 0.55) {
        const q = r - 0.55;
        const val = veer(ramp(q, 0, 0.7));
        const kw = wT * 0.17 * (1 + (t >= N ? 0.25 * Math.exp(-(t - N) / 0.35) : 0));
        const kh = kw * (360 / 520);
        const ky = y + hT * 0.52 * sc + kh * 0.38 + (1 - val) * 0.5;
        c.vlak(t, tex.kroon, 0, ky, 0.03, 0, Math.sin(t * 1.4) * 0.25, Math.sin(t * 2) * 0.04, kw, kh, sm(q, 0, 0.1), 2, 0, 0, goud1, 0, 0);
        if (t >= N) c.vlak(t, tex.ster, 0, ky + kh * 0.3, 0.04, 0, 0, t * 0.6, kw * 1.3 * Math.exp(-(t - N) / 0.5), kw * 1.3 * Math.exp(-(t - N) / 0.5), 1, 2, 1, 0, k1, 0, 0);
      }
      // glinsterende sterren rond het logo
      const aantal = 12;
      for (let i = 0; i < aantal; i++) {
        const hh = hash(i * 3.17 + 0.5);
        const hh2 = hash(i * 7.31 + 2.1);
        const kant = i % 2 ? 1 : -1;
        const x = (hh - 0.5) * wT * 0.94 * 0.5 + kant * 0.0;
        const yy = y + (hh2 - 0.5) * hT * 1.05;
        const tw = 0.5 + 0.5 * Math.sin(t * (2.2 + 2 * hh) + hh2 * 30);
        const s = (0.07 + 0.17 * hh2) * (0.45 + 0.8 * tw * tw) * sm(r, 0.25 + 0.08 * i, 0.6 + 0.08 * i);
        if (s < 0.004) continue;
        c.vlak(t, tex.ster, x * 2, yy, 0.03, 0, 0, t * (0.3 + hh) * (i % 2 ? 1 : -1), s, s, 0.9, 2, 1, 0, k1, 0, 0);
      }
      // een paar grote glinsters die over de kaart flitsen
      const q = Math.max(0, t - RV - 0.6);
      for (let i = 0; i < 3 && q > 0; i++) {
        const ph = (q * 0.55 + i * 0.37) % 1.4;
        const s = 0.5 * Math.pow(Math.max(0, Math.sin(Math.min(ph, 1) * Math.PI)), 3) * sm(q, 0, 0.5);
        if (s < 0.01) continue;
        const px = (hash(Math.floor(q * 0.55 + i * 0.37 + 5) * 1.7 + i) - 0.5) * 0.5;
        const py = layY + (hash(Math.floor(q * 0.55 + i * 0.37 + 9) * 2.3 + i) - 0.5) * 0.8;
        c.vlak(t, tex.ster, px, py, 0.05, 0, 0, ph * 1.5, s, s, 1, 2, 1, 0, k1, 0, 0);
      }
    }

    // ───── de kaart: ronddraaien en folie ─────
    const kaartNu = { rot: 0, folie: 0, schaal: 1, y: 0, x: 0, alpha: 1, lay: 0.84 };
    function kaart0(t) {
      const r = t - RV;
      // vanaf de aankomst al folie, en tijdens de slow-motion een volle draai (de voorkant komt weer naar je toe)
      kaartNu.folie = sm(t, K0 + 0.2, K0 + tl.spin) * (0.75 + 0.35 * sm(r, 0, 0.6)) * (1 + 0.2 * Math.sin(t * 1.3));
      const draai = ramp(r, 0.05, 1.5);
      const e = draai * draai * (3 - 2 * draai);
      // na de draai wiegt de kaart rustig heen en weer
      kaartNu.rot = r < 0 ? 0 : Math.PI * 2 * e + (r > 1.5 ? 0.28 * Math.sin((r - 1.5) * 0.9) * sm(r, 1.5, 2.3) : 0);
      kaartNu.schaal = 1 + (r > 0 ? 0.1 * Math.exp(-r / 0.5) : 0);
      if (leg) {
        // de supernova: de kaart trilt en zwelt op, en draait na de knal nog twee keer rond
        const pre = sm(t, N - 1.2, N) * (t < N ? 1 : 0);
        const d2 = ramp(t, N, N + 1.6);
        kaartNu.rot += Math.PI * 4 * (1 - Math.pow(1 - d2, 3));
        kaartNu.schaal += 0.05 * pre + (t >= N ? 0.16 * Math.exp(-(t - N) / 0.45) : 0) + pre * 0.01 * Math.sin(t * 70);
        kaartNu.folie += 0.6 * pre + (t >= N ? 0.8 * Math.exp(-(t - N) / 1.5) : 0);
      }
      return kaartNu;
    }

    // ───── de nabewerking ─────
    const postNu = { gl: 0, dark: 0, regen: 0, zoom: 1, rad: 0, vig: 1, sat: 1, bloom: 1 };
    function post0(t) {
      const p = postNu;
      p.gl = 0;
      p.dark = 0;
      p.zoom = 1;
      p.rad = 0;
      p.vig = 1;
      p.sat = 1;
      p.bloom = 1;
      p.regen = t >= RV - 0.05 ? 1 : 0;
      if (legT && t >= t0 && t < tb) {
        // het stuk vóór de tease: bijna zwart, een zware schok op elke slag
        const u = ramp(t, t0, tb);
        const th = thumpA(t);
        p.dark = 0.88 * sm(u, 0, 0.12);
        p.gl = Math.min(1, Math.exp(-u / 0.06) * 0.8 + th * 0.35) * rg;
        p.zoom = 1 + 0.06 * th + 0.02 * u;
        p.rad = 0.18 * th;
        p.vig = 1 + 0.8 * th + 0.4 * u;
        p.sat = 0.6;
        return p;
      }
      if (t >= tb && t < t1 + 0.02) {
        const u = ramp(t, tb, t1 + 0.02);
        const th = thump(t);
        const spike = hash(Math.floor(t * 9.5)) > 0.8 - 0.25 * u ? 0.5 : 0;
        p.dark = 0.93 * sm(u, 0, 0.05) * (1 - sm(u, 0.9, 0.985));
        p.gl = Math.min(1, Math.exp(-u / 0.045) + (0.22 + 0.4 * u * u + spike) * sm(u, 0.02, 0.1) + 0.5 * sm(u, 0.93, 1)) * rg;
        p.zoom = 1 + 0.045 * th + 0.03 * u;
        p.rad = 0.1 * th + 0.3 * sm(u, 0.85, 1);
        p.vig = 1 + 0.5 * th + 0.5 * u;
        p.sat = 1 - 0.5 * sm(u, 0, 0.1) * (1 - sm(u, 0.9, 1));
      } else if (t >= K0 - 0.1 && t < K0 + 0.5) {
        p.gl = 0.6 * Math.exp(-(t - K0 + 0.1) / 0.12) * rg;
      }
      // het logo glitcht en daarmee een stukje het beeld
      const r = t - RV - 0.12;
      if (r > 0) {
        const per = (r - 1.0) % 1.9;
        const stoot = r > 1.0 && per >= 0 && per < 0.16 ? 1 : 0;
        p.gl = Math.max(p.gl, (Math.exp(-r / 0.3) * 0.7 + stoot * 0.45) * rg);
      }
      if (t >= RV) {
        p.bloom = 1 + 0.12 * Math.exp(-(t - RV) / 1.5);
        p.sat = 1.08;
      }
      if (leg && t > N - 1.3) {
        const pre = sm(t, N - 1.2, N) * (t < N ? 1 : 0);
        const na = t >= N ? Math.exp(-(t - N) / 0.35) : 0;
        p.vig = Math.max(p.vig, 1 + 2.4 * pre);
        p.dark = Math.max(p.dark, 0.5 * pre);
        p.sat = mix(p.sat, 0.7, pre);
        p.zoom *= 1 + 0.06 * pre + 0.09 * na;
        p.rad = Math.max(p.rad, 0.12 * pre + 0.4 * na);
        p.gl = Math.max(p.gl, 0.45 * na * rg);
        p.bloom *= 1 + 0.15 * pre + 0.3 * Math.exp(-Math.max(0, t - N) / 1.0) * (t >= N ? 1 : 0);
      }
      return p;
    }

    // kleine extra schudbeving: rommelen tijdens de tease en een lange nasidderen na de onthulling
    function schud0(t) {
      if (legT && t >= t0 && t < tb) return (0.001 + 0.006 * thumpA(t)) * (reduceer ? 0.15 : 1);
      if (t >= tb && t < t1) {
        const u = ramp(t, tb, t1);
        return (0.0015 + 0.011 * u * u * u) * (reduceer ? 0.15 : 1);
      }
      if (leg && t >= N - 1.2 && t < N + 3) {
        // de supernova laadt op (gerommel) en knalt
        return (t < N ? 0.006 * Math.pow(ramp(t, N - 1.2, N), 2) : 0.012 * Math.exp(-(t - N) / 0.5)) * (reduceer ? 0.15 : 1);
      }
      if (t >= RV && t < RV + 4) return 0.003 * Math.exp(-(t - RV) / 1.4) * (reduceer ? 0.15 : 1);
      return 0;
    }


    // ═════════════════════════ de ladder boven zeldzaam ═════════════════════════
    // Alles hieronder is alleen voor glim (2), kosmisch (3), mythisch (4), de upgrade en de ultieme reeks; voor gewoon en
    // zeldzaam doet dit niets (tr < 2).
    const hw = (asp) => (c.H_ZICHT * asp) / 2; // de halve zichtbreedte op z = 0
    const V = (t, tx, x, y, z, rz, bw, bh, al, optel, extra) => c.vlak(t, tx, x, y, z, 0, 0, rz, bw, bh, al, 2, optel || 0, 0, k1, 0, 0);
    if (tr >= 2) {
      tex.logoT = c.tekstuur(art.logoT);
      tex.logoZ = tex.logo; // het gewone ZELDZAAM!-logo (voor het begin van een upgrade)
      tex.zwart = c.tekstuur(art.zwart);
      tex.ringen = {};
      for (const k in art.ringen) tex.ringen[k] = c.tekstuur(art.ringen[k]);
      if (art.kroon && !tex.kroon) tex.kroon = c.tekstuur(art.kroon);
      if (art.shiny) tex.shiny = c.tekstuur(art.shiny);
      if (art.rissen) tex.rissen = art.rissen.map((b) => c.tekstuur(b));
      if (art.nevel) {
        tex.nevel = c.tekstuur(art.nevel);
        tex.planeten = art.planeten.map((b) => c.tekstuur(b));
        tex.gat = c.tekstuur(art.gat);
        tex.gatDraai = c.tekstuur(art.gatDraai);
      }
      if (art.wezen) {
        const wz = art.wezen;
        tex.wz = { lijf: c.tekstuur(wz.lijf), gloed: c.tekstuur(wz.gloed) };
        if (wz.vleugel) {
          tex.wz.vleugel = c.tekstuur(wz.vleugel);
          tex.wz.vleugelA = c.tekstuur(wz.vleugelA);
        }
        if (wz.tent) tex.wz.tent = c.tekstuur(wz.tent);
      }
      if (art.titelUlt) {
        tex.titelUlt = c.tekstuur(art.titelUlt);
        tex.stelsels = art.stelsels.map((b) => c.tekstuur(b));
        tex.krans = c.tekstuur(art.krans);
        tex.nevelUlt = c.tekstuur(art.nevelUlt);
      }
    }
    const WN = art.wezenNaam; // 'draak', 'feniks', 'kraken' of 'griffioen' (alleen mythisch)
    const PAL = WN ? WEZENS[WN] : null;
    const wk1 = PAL ? PAL.vuur1 : [1, 1, 1];
    const wk2 = PAL ? PAL.vuur2 : [1, 1, 1];

    // de kleuren van de trede (het licht, de vonken): glim pastel cyaan/roze, kosmisch paars/blauw, mythisch de kleur van het wezen
    function tema(t, a, b) {
      if (tr === 2) {
        SPO.hsv(0.5 + 0.2 * Math.sin(t * 0.8), 0.55, 1, a);
        SPO.hsv(0.88 + 0.1 * Math.sin(t * 0.55 + 1), 0.62, 1, b);
        return true;
      }
      if (tr === 3) {
        const s = 0.5 + 0.5 * Math.sin(t * 0.6);
        a[0] = mix(0.55, 0.78, s);
        a[1] = mix(0.4, 0.5, s);
        a[2] = 1;
        b[0] = mix(0.2, 0.55, 1 - s);
        b[1] = mix(0.6, 0.45, s);
        b[2] = 1;
        return true;
      }
      if (tr === 4) {
        const s = 0.5 + 0.5 * Math.sin(t * 0.9);
        for (let i = 0; i < 3; i++) {
          a[i] = mix(PAL.licht1[i], PAL.licht2[i], s * 0.5);
          b[i] = mix(PAL.licht2[i], PAL.licht1[i], s * 0.4);
        }
        return true;
      }
      return false;
    }
    // vanaf glim en hoger: na de bang van een ultieme kaart gaat alles weer op regenboog en goud
    const naBang = (t) => ult && t >= UL.bang;
    function kleur(t, a, b) {
      if (tr < 2 || naBang(t)) return false;
      if (tr === 2) return t >= K0 - 0.05 ? tema(t, a, b) : false;
      return t >= t0 - 0.05 ? tema(t, a, b) : false;
    }
    const regenUit = (t) => tr >= 3 && t >= t0 - 0.05 && !naBang(t);

    // een zwart vlak over de bevroren wereld van de opening, zodat de nieuwe wereld er schoon boven staat
    function plaat(t, a) {
      if (a > 0.002) c.vlak(t, tex.zwart, 0, 0, 0.2, 0, 0, 0, 16, 10, Math.min(1, a), 2, 0, 0, k1, 0, 0);
    }

    // ───── geluiden en schokken van de treden ─────
    const sf = snel ? 0.5 : 1;

    // ───────────────── GLIM: het SHINY!-moment ─────────────────
    // Kort na de onthulling: een witte flits, de kaart breekt in kristalscherven die uiteenspatten, de kaart komt terug (pop-in
    // met een extra draai) onder een regen van regenboogglinster, en SHINY! klapt in beeld.
    const S2 = U;
    if (tr === 2) {
      c.at(S2 - 0.03, () => {
        audio.speel('glim-shiny', { gain: 1.0, galmen: 0.3 });
        trillen([40, 30, 60, 30, 140]);
      });
      c.at(S2 + 0.3, () => {
        audio.speel('glim-glinster', { gain: 1.0, galmen: 0.3 });
        audio.glinster(0.8);
      });
      c.flits(S2, 1.0, 0.035);
      c.flits(S2 + 0.02, 0.4, 0.22);
      c.flits(S2 + 0.3, 0.55, 0.06);
      c.schok(S2, 0.07, 0.3);
      c.schok(S2 + 0.3, 0.04, 0.25);
      for (let i = 0; i < 3; i++) c.golf(S2 + 0.1 * i, 1.4 + 0.5 * i, 0.8 - 0.15 * i, -0.04);
      // de scherven: kristal (wit, cyaan, roze) vliegen naar buiten; later nog een kleine vlaag als de kaart terugkomt
      w({ mode: 7, t0: S2, delay: 0.04, life: 2.8, n: 820, org: [0, -0.08], angle: 0, spread: c.TWEE_PI, spd: [0.5, 3.0], grav: [0, -0.9], drag: 0.9, size: [0.01, 0.038], col1: [0.75, 1, 1], col2: [1, 0.7, 0.95], alpha: 1, blend: 'alpha', regen: 0, seed: 101, per: 1 });
      w({ mode: 7, t0: S2 + 0.3, delay: 0.05, life: 2.2, n: 360, org: [0, -0.08], angle: 0, spread: c.TWEE_PI, spd: [0.3, 1.6], grav: [0, -0.5], drag: 1.1, size: [0.008, 0.026], col1: [1, 1, 1], col2: [0.6, 0.95, 1], alpha: 1, blend: 'alpha', regen: 1, seed: 102, per: 1 });
      w({ mode: 0, t0: S2 + 0.28, delay: 0.1, life: 2.2, n: 1200, org: [0, -0.08], angle: 0, spread: c.TWEE_PI, spd: [0.3, 2.6], grav: [0, -0.2], drag: 1.2, size: [0.002, 0.007], col1: k1, col2: k2, alpha: 0.95, regen: 1, seed: 103 });
      // zwevende kristalstofjes in pastel: tijdens de hele viering
      w({ mode: 1, t0: K0, delay: 0, life: 16, n: 70, size: [0.008, 0.04], col1: k1, col2: k2, regen: 1, alpha: 0.5, seed: 104 });
      w({ mode: 8, t0: K0, delay: 0, life: 40, n: 150, size: [0.004, 0.012], grav: [0, 1], spd: [0.5, 1.2], col1: [0.8, 1, 1], col2: [1, 0.8, 1], alpha: 0.8, seed: 105 });
    }
    function glimKaart(zk, t) {
      const S = S2;
      const tril = sm(t, S - 0.5, S) * (t < S ? 1 : 0);
      zk.folie += 0.9 * tril + 0.4 * sm(t, K0 + 0.3, RV);
      zk.schaal *= 1 + 0.012 * tril * Math.sin(t * 95);
      if (t >= S && t < S + 0.3) zk.alpha = 0;
      else if (t >= S + 0.3) {
        // opnieuw pop-in: klein beginnen, doorschieten, landen; met een extra draai en een golf folie
        zk.schaal *= mix(0.15, 1, veer(ramp(t, S + 0.3, S + 1.0)));
        zk.rot += Math.PI * 2 * (1 - glad(ramp(t, S + 0.3, S + 1.35)));
        zk.folie += 1.4 * Math.exp(-(t - S - 0.3) / 1.5);
      }
    }
    function glimVoor(t, layY, visB) {
      const rs = t - S2;
      if (rs > 0.02 && rs < 1.8) {
        const wT = Math.min(1.7, visB * 0.58);
        const hT = wT * (380 / 1100);
        const pop = Math.max(0.001, veer(ramp(rs, 0.02, 0.42)));
        const gl = rs < 0.5 ? 1 - rs / 0.5 : 0;
        c.vlak(t, tex.shiny, 0, layY + 0.12, 0.08, 0, 0, -0.1 + 0.03 * Math.sin(t * 5), wT * pop, hT * pop, sm(rs, 0.02, 0.07) * (1 - sm(rs, 1.2, 1.8)), 2, 0, gl * 0.7, k1, gl * 0.6 + 0.1, rs * 0.4);
      }
      // extra glinsters in regenboogkleuren, vooral vlak na het moment
      const q = rs - 0.3;
      for (let i = 0; i < 9 && q > 0 && q < 4.5; i++) {
        const ph = (q * 0.9 + i * 0.31) % 1.2;
        const s = 0.38 * Math.pow(Math.max(0, Math.sin(Math.min(ph, 1) * Math.PI)), 3) * (1 - sm(q, 3, 4.5));
        if (s < 0.01) continue;
        const px = (hash(Math.floor(q * 0.9 + i * 0.31) * 1.9 + i * 7.1) - 0.5) * 0.62;
        const py = layY + (hash(Math.floor(q * 0.9 + i * 0.31) * 2.7 + i * 3.3) - 0.5) * 0.95;
        SPO.hsv(i * 0.13 + t * 0.2, 0.5, 1, k2);
        c.vlak(t, tex.ster, px, py, 0.06, 0, 0, ph * 1.7, s, s, 1, 2, 1, 0, k2, 0, 0);
      }
    }
    function glimPost(p, t) {
      const rs = t - S2;
      if (rs > -0.05 && rs < 2.5) {
        p.gl = Math.max(p.gl, (Math.exp(-Math.max(rs, 0) / 0.1) * 0.55 + (rs > 0.25 && rs < 0.5 ? 0.3 * Math.exp(-(rs - 0.25) / 0.1) : 0)) * rg);
        p.zoom *= 1 + 0.06 * Math.exp(-Math.max(rs, 0) / 0.18) + 0.03 * Math.exp(-Math.max(rs - 0.3, 0) / 0.2) * (rs > 0.3 ? 1 : 0);
        p.rad = Math.max(p.rad, 0.3 * Math.exp(-Math.max(rs, 0) / 0.15));
        p.sat = Math.max(p.sat, 1.15);
      }
    }

    // ───────────────── KOSMISCH: nevel-warp, zwart gat, planeten, sterrenvelden ─────────────────
    // Bij een eigen tease komt dit allemaal voor de kaart (de kaart komt uit het zwarte gat); bij een upgrade breekt het open achter
    // de kaart, na de onthulling.
    const TEASE_T = t1 - t0;
    const KS = {};
    if (tr === 3) {
      if (eigenT) {
        KS.neb = t0 + 0.3 * sf;
        KS.warp = t0 + 0.1;
        KS.open = t0 + TEASE_T * 0.42;
        KS.dicht = K0 + tl.spin * 0.62;
        KS.einde = RV + 3;
      } else {
        KS.neb = U;
        KS.warp = U;
        KS.open = U + 0.15;
        KS.dicht = U + 3.6 * sf;
        KS.einde = U + 7 * sf;
      }
      const dur = snel ? 2.4 : 3.6;
      const tijden = eigenT
        ? [[t0 + TEASE_T * 0.2, 0], [t0 + TEASE_T * 0.5, 1], [t0 + TEASE_T * 0.76, 2], [K0 + tl.spin * 0.3, 3], [K0 + tl.spin * 0.75, 0], [RV + 0.8 * sf, 1], [RV + 2.5 * sf, 2], [RV + 4.1 * sf, 3]]
        : [[U + 0.3 * sf, 0], [U + 1.3 * sf, 1], [U + 2.4 * sf, 2], [U + 3.4 * sf, 3]];
      KS.planeten = tijden.map(([T0, i], k) => ({ T: T0, i, x0: (k % 2 ? 1 : -1) * (0.6 + 0.5 * hash(k * 3.3)), y: (hash(k * 5.1 + 1) - 0.5) * 0.9, D: 1.5 + hash(k * 7.7) * 1.1, dur }));
      for (const p of KS.planeten) c.at(p.T + p.dur * 0.5, () => audio.speel('kosmisch-zwaai', { gain: 0.85, pan: p.x0 > 0 ? 0.7 : -0.7, galmen: 0.3, rate: 0.9 + 0.2 * hash(p.i * 2.2) }));
      if (eigenT) {
        c.at(t0 + 0.1, () => audio.speel('kosmisch-bas', { gain: 1.0, galmen: 0.3 }));
        c.at(KS.open - 0.4, () => audio.speel('kosmisch-gat', { gain: 1.0, galmen: 0.3 }));
        c.schok(KS.open, 0.03, 0.4);
        c.flits(KS.open, 0.35, 0.12);
        for (let i = 0; i < 3; i++) c.golf(KS.open + 0.12 * i, 1.0 + 0.3 * i, 0.7 - 0.12 * i, 0);
        // het gat ademt in: een trage dreun net voor de kaart eruit komt
        c.flits(K0 - 0.04, 0.9, 0.12);
        c.golf(K0, 1.8, 1.0, 0);
        c.golf(K0 + 0.15, 1.3, 0.8, 0);
        c.golf(K0 + 0.3, 2.2, 0.7, 0);
        c.at(K0 - 0.1, () => audio.boem(0.9, 0.7));
      } else {
        c.at(U - 0.3, () => audio.speel('kosmisch-bas', { gain: 1.0, galmen: 0.3 }));
        c.at(U + 0.0, () => audio.speel('kosmisch-gat', { gain: 1.0, galmen: 0.3 }));
        c.flits(KS.open, 0.8, 0.05);
        c.schok(KS.open, 0.07, 0.4);
        for (let i = 0; i < 4; i++) c.golf(KS.open + 0.1 * i, 1.3 + 0.4 * i, 0.8 - 0.12 * i, 0);
      }
      // sterrenvelden: veel kleine sterren die langzaam omhoog drijven, en grote vage sterren
      const sb = eigenT ? t0 + 0.4 : U;
      w({ mode: 8, t0: sb, delay: 0, life: 70, n: 300, size: [0.004, 0.014], grav: [0, 1], spd: [0.4, 1.4], col1: [0.8, 0.9, 1], col2: [0.7, 0.7, 1], alpha: 0.85, seed: 111 });
      w({ mode: 8, t0: sb, delay: 0, life: 70, n: 160, size: [0.003, 0.01], grav: [0, 1.6], spd: [0.6, 1.8], col1: [1, 0.85, 1], col2: [0.7, 0.9, 1], alpha: 0.8, seed: 112 });
      w({ mode: 1, t0: sb, delay: 0, life: 40, n: 90, size: [0.005, 0.03], col1: [0.6, 0.55, 1], col2: [0.5, 0.8, 1], alpha: 0.6, seed: 113 });
    }
    function kosmosTekenen(t, asp, uPre) {
      const tw = KS.warp;
      const fade = 1 - sm(t, KS.dicht + 0.4, KS.dicht + 2.0);
      // de nevel
      const na = 0.8 * sm(t, KS.neb, KS.neb + 2.2) * (1 - 0.4 * sm(t, KS.einde, KS.einde + 3));
      if (na > 0.004) {
        const hz = c.H_ZICHT * (3 + 1.6) / 3;
        const wN = Math.max(hz * asp, hz * (16 / 9)) * 1.25;
        c.vlak(t, tex.nevel, Math.sin(t * 0.05) * 0.1, Math.cos(t * 0.04) * 0.06, -1.6, 0, 0, 0.03 * Math.sin(t * 0.07), wN, wN * (720 / 1280), na, 2, 1, 0, k1, 0, 0);
      }
      // de nevel-warp
      const wa = 0.9 * sm(t, tw, tw + 1.2) * fade;
      if (wa > 0.004) {
        const snelh = eigenT ? 0.3 + 3.0 * Math.pow(ramp(t, tw, K0), 2) : 1.0 + 1.2 * Math.exp(-(t - tw) / 1.2);
        const a = [0, 0, 0], b = [0, 0, 0];
        a[0] = 0.55 + 0.15 * Math.sin(t * 0.7); a[1] = 0.35; a[2] = 1;
        b[0] = 0.15; b[1] = 0.45 + 0.15 * Math.sin(t * 0.5); b[2] = 1;
        c.warp(t, wa, snelh * (t > K0 ? 1 - 0.6 * ramp(t, K0, K0 + tl.spin) : 1), 0.55 + 0.4 * ramp(t, tw, K0), a, b);
      }
      // het zwarte gat
      const open = veer(ramp(t, KS.open, KS.open + 1.5));
      const sluit = 1 - sm(t, KS.dicht, KS.dicht + 0.9);
      const gs = open * sluit;
      if (gs > 0.01) {
        const D = 3.7 * gs * (1 + 0.015 * Math.sin(t * 2.3));
        const rg2 = (eigenT ? 1 : 0.9);
        c.licht(t, 0, 0, 0.18 * gs, 0.05, 0.25 * gs, 0.3 * gs, t * 0.3, k1);
        c.vlak(t, tex.gat, 0, 0.0, -2.2, 0, 0, -0.04, D, D, rg2, 2, 0, 0, k1, 0, 0);
        c.vlak(t, tex.gatDraai, 0, 0, -2.19, 0, 0, -t * 0.8, D, D, 0.9 * gs, 2, 1, 0, k1, 0, 0);
      }
      planeten(t, 0);
    }
    function planeten(t, laag) {
      if (!KS.planeten) return;
      for (const p of KS.planeten) {
        const q = (t - p.T) / p.dur;
        if (q <= 0 || q >= 1) continue;
        const e = q * q * (0.45 + 0.55 * q);
        const z = mix(-12, 2.6, e);
        if ((z > 0.5 ? 1 : 0) !== laag) continue;
        const al = sm(q, 0, 0.12) * (1 - sm(z, 1.6, 2.5));
        c.vlak(t, tex.planeten[p.i], p.x0, p.y, z, 0, 0, p.i + t * 0.05, p.D, p.D, al, 2, 0, 0, k1, 0, 0);
      }
    }
    function kosmosTease(t, asp) {
      const u = ramp(t, t0, t1);
      kosmosTekenen(t, asp, u);
      // een trage ademhaling van licht in het midden, steeds sterker
      c.licht(t, 0, 0, 0.3 * u * u, 0.03 + 0.05 * u, 0.2 * u, 0.5 * u * u * u, t * 0.4, k1);
    }
    function kosmosPost(p, t) {
      if (eigenT && t >= t0 && t < K0) {
        const u = ramp(t, t0, t1);
        p.dark = 0;
        p.gl = (hash(Math.floor(t * 9)) > 0.93 ? 0.3 : 0) * u * rg + 0.7 * Math.exp(-(t - t0) / 0.1) * rg;
        p.zoom = 1 + 0.03 * u * u;
        p.rad = 0.12 * u * u;
        p.vig = 1.2 + 0.6 * u;
        p.sat = 1.1;
        p.bloom = 1 + 0.15 * u;
      }
      if (t >= t0 && t < KS.einde + 3) p.grade = [0.94, 0.92, 1.1];
    }

    // ───────────────── MYTHISCH: een wezen uit het pakje ─────────────────
    // Het wezen vliegt uit het pakje, cirkelt, brult (schokgolven, ademvuur/inkt/veren) en dient bij een eigen tease de kaart toe:
    // het duikt naar je toe en de kaart komt. Bij een upgrade verschijnt het na de onthulling en vliegt na de brul weg.
    const u0 = 0.0021; // plaatjes-pixels naar wereld-eenheden
    const SM = {};
    if (tr === 4) {
      if (eigenT) {
        SM.in0 = t0 + 0.07 * TEASE_T;
        SM.circ0 = t0 + 0.275 * TEASE_T;
        SM.roar = t0 + 0.65 * TEASE_T;
        SM.dive0 = t0 + 0.81 * TEASE_T;
        SM.out = t0 + 0.975 * TEASE_T;
      } else {
        const f = snel ? 0.4 : 1;
        SM.in0 = U;
        SM.circ0 = U + 1.3 * f;
        SM.roar = U + 3.6 * f;
        SM.dive0 = U + 5.0 * f;
        SM.out = U + 6.9 * f;
      }
      SM.hover = { x: 0, y: 0.34, s: 0.95 };
      const roar = SM.roar;
      // de brul: geluid, schokken, golven en de adem
      c.at(SM.in0 - 0.1, () => audio.speel('mythisch-vleugel', { gain: 0.8, rate: 0.9, galmen: 0.3 }));
      for (let k = 0; SM.circ0 + k * 1.15 < roar - 1.0; k++) c.at(SM.circ0 + k * 1.15, () => audio.speel('mythisch-vleugel', { gain: 0.7, rate: 0.85 + 0.2 * hash(k * 1.3), pan: k % 2 ? 0.5 : -0.5, galmen: 0.3 }));
      c.at(roar - 0.12, () => {
        audio.speel('mythisch-brul', { gain: 1.1, rate: PAL.brul, galmen: 0.35 });
        trillen([60, 30, 120, 30, 240]);
      });
      c.at(roar + 0.3, () => audio.speel('mythisch-adem', { gain: 0.9, rate: WN === 'kraken' ? 0.7 : 1, galmen: 0.3 }));
      c.at(SM.dive0, () => audio.speel('mythisch-vleugel', { gain: 1.0, rate: 0.75, galmen: 0.3 }));
      c.at(SM.dive0 + 0.5, () => audio.speel('mythisch-vleugel', { gain: 1.0, rate: 0.7, galmen: 0.3 }));
      c.flits(roar, 0.55, 0.05);
      c.schok(roar, 0.13, 0.55);
      for (let i = 0; i < 4; i++) c.golf(roar + 0.12 * i, 1.2 + 0.4 * i, 0.8 - 0.1 * i, 0.05);
      c.schok(roar + 0.6, 0.04, 0.3);
      c.flits(roar + 0.6, 0.25, 0.1);
      // het pakje barst open: licht en vonken in het midden bij de geboorte van het wezen
      c.flits(SM.in0, 0.6, 0.08);
      c.schok(SM.in0, 0.04, 0.3);
      c.golf(SM.in0, 1.3, 0.8, 0);
      c.golf(SM.in0 + 0.15, 1.8, 0.6, 0);
      w({ mode: 0, t0: SM.in0, delay: 0.3, life: 1.6, n: 900, org: [0, 0.02], angle: 0, spread: c.TWEE_PI, spd: [0.3, 2.2], grav: [0, -0.2], drag: 1.2, size: [0.002, 0.007], col1: wk1, col2: wk2, alpha: 1, seed: 121 });
      // sfeer: gloeiende stofjes (vuur en as) of drijvend licht
      const op = WN === 'kraken' ? -0.6 : 1.1;
      w({ mode: 8, t0: eigenT ? t0 : U, delay: 0, life: 70, n: 220, size: [0.004, 0.013], grav: [0, op], spd: [0.5, 1.4], col1: wk1, col2: wk2, alpha: 0.85, seed: 122 });
      w({ mode: 1, t0: eigenT ? t0 : U, delay: 0, life: 40, n: 60, size: [0.006, 0.03], col1: wk1, col2: wk2, alpha: 0.45, seed: 123 });
      // het kleurige gloeien van de adem, per wezen
      const mond = (x, asp) => {
        const m = wzMond(asp);
        x.org[0] = m[0];
        x.org[1] = m[1];
      };
      const em = (o) => {
        const e1 = w(o);
        e1.bij = mond;
        return e1;
      };
      if (WN === 'draak' || WN === 'feniks') {
        // ademvuur: een lange vlam naar rechts
        em({ mode: 0, t0: roar + 0.2, delay: 1.1, life: 1.7, n: 3200, org: [0, 0], angle: -0.05, spread: 0.45, spd: [0.8, 3.0], grav: [0.05, 0.25], drag: 0.65, size: [0.003, 0.016], col1: wk1, col2: wk2, alpha: 1, seed: 124 });
        em({ mode: 0, t0: roar + 0.2, delay: 1.1, life: 1.3, n: 1200, org: [0, 0], angle: -0.05, spread: 0.3, spd: [1.2, 3.4], grav: [0, 0.1], drag: 0.8, size: [0.002, 0.007], col1: [1, 1, 0.8], col2: wk2, alpha: 1, seed: 125 });
        em({ mode: 6, t0: roar + 0.2, delay: 1.0, life: 1.6, n: 26, org: [0, 0], size: [0.18, 0.4], col1: wk1, col2: wk2, alpha: 0.6, seed: 126, lod: false });
        if (WN === 'feniks') w({ mode: 5, t0: roar, delay: 1.6, life: 3.4, n: 160, org: [0, 0.3], angle: -Math.PI / 2, spread: 3.0, spd: [0.05, 0.5], grav: [0, -0.12], drag: 0.6, size: [0.01, 0.03], col1: wk1, col2: wk2, alpha: 1, blend: 'alpha', seed: 127 });
      } else if (WN === 'kraken') {
        // een inktwolk: violette gloed die uit de kop golft, bellen en lichtgevende druppels
        em({ mode: 6, t0: roar + 0.1, delay: 1.2, life: 2.8, n: 34, org: [0, 0], size: [0.2, 0.46], col1: [0.2, 0.1, 0.7], col2: [0.1, 0.45, 0.9], alpha: 0.75, seed: 124, lod: false });
        em({ mode: 0, t0: roar + 0.1, delay: 1.2, life: 2.2, n: 2200, org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.2, 1.8], grav: [0, 0.08], drag: 0.8, size: [0.003, 0.012], col1: wk1, col2: wk2, alpha: 1, seed: 125 });
        em({ mode: 1, t0: roar + 0.1, delay: 1.2, life: 3.2, n: 70, org: [0, 0], size: [0.01, 0.04], col1: [0.4, 0.9, 1], col2: wk2, alpha: 0.8, seed: 126 });
      } else {
        // het griffioenengeluid: een regen van veren en een witgouden stralenkrans
        em({ mode: 5, t0: roar, delay: 1.6, life: 3.6, n: 420, org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.2, 1.6], grav: [0, -0.2], drag: 0.9, size: [0.01, 0.034], col1: [1, 0.97, 0.88], col2: [1, 0.8, 0.3], alpha: 1, blend: 'alpha', seed: 124 });
        em({ mode: 0, t0: roar + 0.1, delay: 0.9, life: 1.8, n: 1800, org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.4, 2.8], grav: [0, -0.1], drag: 1.1, size: [0.002, 0.008], col1: wk1, col2: wk2, alpha: 1, seed: 125 });
      }
      // de kaart wordt neergelegd: een uitbarsting in de kleuren van het wezen
      if (eigenT) {
        c.flits(K0 - 0.03, 0.9, 0.1);
        c.golf(K0, 1.8, 1.0, 0);
        c.golf(K0 + 0.12, 1.3, 0.8, 0);
        w({ mode: 0, t0: K0, delay: 0.2, life: 2.2, n: 1400, org: [0, 0.01], angle: 0, spread: c.TWEE_PI, spd: [0.4, 2.8], grav: [0, -0.2], drag: 1.1, size: [0.002, 0.007], col1: wk1, col2: wk2, alpha: 1, seed: 128 });
        c.at(K0 - 0.12, () => audio.boem(0.95, 0.65));
      }
    }
    // De toestand van het wezen op tijd t: positie, schaal, richting, helling en de slag van de vleugels. null = niet in beeld.
    function wzPos(t, asp) {
      const A = 0.6 * hw(asp);
      const circ = (tau) => ({ x: -A * Math.cos(0.85 * tau), y: 0.3 + 0.11 * Math.sin(1.7 * tau + 0.6), s: 0.62 + 0.2 * Math.sin(0.85 * tau + 1.2) });
      const S = SM;
      if (t < S.circ0) {
        const p = ramp(t, S.in0, S.circ0);
        const e = glad(p);
        const c0 = circ(0);
        const sw = Math.sin(p * Math.PI);
        return { x: mix(0, c0.x, e) + sw * 0.2 * hw(asp), y: mix(0.0, c0.y, e) + sw * 0.28, s: mix(0.1, c0.s, Math.pow(e, 0.8)) };
      }
      if (t < S.roar - 1.1) return circ(t - S.circ0);
      if (t < S.roar) {
        const q = glad(ramp(t, S.roar - 1.1, S.roar));
        const cc = circ(S.roar - 1.1 - S.circ0);
        return { x: mix(cc.x, S.hover.x, q), y: mix(cc.y, S.hover.y, q), s: mix(cc.s, S.hover.s, q) };
      }
      if (t < S.dive0) return { x: S.hover.x, y: S.hover.y, s: S.hover.s * (1 + 0.05 * Math.sin((t - S.roar) * 22) * Math.exp(-(t - S.roar) * 1.6)) };
      const p = ramp(t, S.dive0, S.out);
      const e = p * p * (0.6 + 0.4 * p);
      return { x: mix(S.hover.x, 0.1, glad(p)), y: mix(S.hover.y, -0.1, glad(p)), s: mix(S.hover.s, 3.6, e) };
    }
    function wzToestand(t, asp) {
      if (t < SM.in0 || t > SM.out + 0.05) return null;
      const P = wzPos(t, asp);
      const P1 = wzPos(t + 0.03, asp), P0 = wzPos(t - 0.03, asp);
      const vx = (P1.x - P0.x) / 0.06, vy = (P1.y - P0.y) / 0.06;
      const hov = sm(t, SM.roar - 1.1, SM.roar - 0.4);
      const sx = mix(Math.tanh(vx * 3.5) || 1, 1, hov);
      const roarT = t - SM.roar;
      const kop = t >= SM.roar && t < SM.dive0 ? 0.32 * Math.sin(Math.min(1, roarT / 0.3) * Math.PI * 0.5) * (1 - sm(roarT, 1.0, 1.5)) : 0;
      const bank = 0.22 * Math.atan(vy * 1.4) * (1 - hov) + kop + (t >= SM.dive0 ? -0.35 * ramp(t, SM.dive0, SM.out) : 0);
      const dive = t >= SM.dive0 ? 1 : 0;
      const wf = dive ? 8.5 : t >= SM.roar - 1.1 ? 4.6 : 5.6;
      let flap = -0.25 + 0.7 * Math.sin(wf * t);
      if (t >= SM.roar && t < SM.dive0) flap = mix(flap, 0.45, sm(roarT, 0, 0.3) * (1 - sm(roarT, 1.0, 1.4)));
      const bob = 0.02 * Math.sin(2.1 * t);
      const pas = SM.out + 0.05;
      return { x: P.x, y: P.y + bob, s: P.s, sx, bank, flap, alpha: sm(t, SM.in0, SM.in0 + 0.25) * (1 - sm(t, SM.out - 0.25, SM.out + 0.02)), t };
    }
    function wzOmzet(st, G) {
      const bw = G.w.lijf[0], bh = G.w.lijf[1];
      const sg = st.sx >= 0 ? 1 : -1;
      const th = st.bank * sg;
      const cs = Math.cos(th), sn = Math.sin(th);
      return {
        sg,
        th,
        naarWereld(px, py) {
          const lx = (px - bw / 2) * u0 * st.s * st.sx, ly = -(py - bh / 2) * u0 * st.s;
          return [st.x + cs * lx - sn * ly, st.y + sn * lx + cs * ly];
        },
      };
    }
    // waar de mond is, in deeltjesruimte, tijdens de brul
    function wzMond(asp) {
      const G = art.wezen;
      const st = { x: SM.hover.x, y: SM.hover.y, s: SM.hover.s, sx: 1, bank: 0.32 };
      const m = wzOmzet(st, G).naarWereld(G.mond[0], G.mond[1]);
      return [m[0] / c.H_ZICHT, m[1] / c.H_ZICHT];
    }
    // het wezen tekenen: gloed, verre vleugel, lijf, nabije vleugel (of tentakels)
    function wezenTekenen(t, asp, st, alphaMul) {
      const G = art.wezen, W = tex.wz;
      if (!st || Math.abs(st.sx) < 0.04) return;
      const om = wzOmzet(st, G);
      const al = st.alpha * (alphaMul === undefined ? 1 : alphaMul);
      if (al < 0.004) return;
      const put = (tx, pxc, pyc, wpx, hpx, rot, alpha, optel) => {
        const [X, Y] = om.naarWereld(pxc, pyc);
        c.vlak(t, tx, X, Y, 0, 0, 0, om.th + rot * om.sg, wpx * u0 * st.s * st.sx, hpx * u0 * st.s, alpha, 2, optel || 0, 0, k1, 0, 0);
      };
      // gloed erachter
      const gl = 0.45 + 0.15 * Math.sin(t * 3);
      const kop = st.t >= SM.roar && st.t < SM.dive0 ? 1 + 0.6 * Math.exp(-(st.t - SM.roar) * 1.5) : 1;
      put(W.gloed, G.w.lijf[0] / 2, G.w.lijf[1] / 2, 2000 * kop, 1500 * kop, 0, al * gl, 1);
      if (G.tent) {
        // tentakels: acht, golvend, aan de onderkant van de kop
        const [tw, th] = G.w.tent;
        G.tentWortels.forEach(([rx, ry], i) => {
          const a = (i - 3.5) * 0.09 + 0.3 * Math.sin(2.4 * st.t + i * 0.85) + 0.1 * st.bank;
          const sa = Math.sin(a), ca = Math.cos(a);
          put(W.tent, rx + (th / 2 - 6) * sa, ry + (th / 2 - 6) * ca, tw, th, a, al, 0);
        });
        const pulse = 1 + 0.035 * Math.sin(3.1 * st.t);
        put(W.lijf, G.w.lijf[0] / 2, G.w.lijf[1] / 2 - 18 * (pulse - 1), G.w.lijf[0], G.w.lijf[1] * pulse, 0, al, 0);
        return;
      }
      const [vw, vh] = G.w.vleugel;
      const wing = (tx, a, alpha, dx, dy) => {
        const hx = G.scharnier[0] + dx, hy = G.scharnier[1] + dy;
        const vx = vw / 2 - G.vscharnier[0], vy = -(vh / 2 - G.vscharnier[1]);
        const ca = Math.cos(a), sa = Math.sin(a);
        put(tx, hx + vx * ca - vy * sa, hy - (vx * sa + vy * ca), vw, vh, a, alpha, 0);
      };
      wing(W.vleugelA, st.flap * 0.85 + 0.1, al, -24, 8);
      put(W.lijf, G.w.lijf[0] / 2, G.w.lijf[1] / 2, G.w.lijf[0], G.w.lijf[1], 0, al, 0);
      wing(W.vleugel, st.flap, al, 0, 0);
    }
    function wezenAchter(t, asp) {
      if (tr !== 4) return;
      const st = wzToestand(t, asp);
      if (!st) return;
      // het licht van het wezen: stralen rond het lijf, feller tijdens de brul
      const roarT = t - SM.roar;
      const fel = (t >= SM.roar && t < SM.dive0 ? 0.5 + 0.9 * Math.exp(-roarT * 1.2) : 0.12) * st.alpha;
      if (fel > 0.01 && c.kw < 3) c.stralen(t, fel * 0.6, 0.6, 0.12, 0.1, st.x / c.H_ZICHT, st.y / c.H_ZICHT, t * 0.3, 1, wk1, wk2, 14);
      wezenTekenen(t, asp, st);
    }
    function wezenTease(t, asp) {
      // het donkere, warme licht in de ruimte (de zwarte plaat over de opening staat in teaseTeken)
      c.licht(t, 0, 0.02, 0.12 + 0.35 * Math.exp(-(t - SM.in0) / 0.5) * (t > SM.in0 ? 1 : 0), 0.05, 0.1, 0.1, t * 0.2, wk1);
    }
    function wezenPost(p, t) {
      if (eigenT && t >= t0 && t < K0) {
        const u = ramp(t, t0, t1);
        const rt = t - SM.roar;
        p.dark = 0;
        p.gl = (rt > -0.02 && rt < 0.35 ? Math.exp(-Math.max(rt, 0) / 0.12) * 0.7 : 0) * rg + (t < SM.in0 + 0.4 && t >= SM.in0 ? 0.4 * rg : 0);
        p.zoom = 1 + 0.02 * u + (rt > 0 ? 0.07 * Math.exp(-rt / 0.2) : 0);
        p.rad = rt > 0 ? 0.35 * Math.exp(-rt / 0.3) : 0;
        p.vig = 1.3 + 0.6 * u;
        p.sat = 1.1;
        p.bloom = 1.08;
      } else if (!eigenT && t >= SM.roar && t < SM.roar + 2) {
        const rt = t - SM.roar;
        p.gl = Math.max(p.gl, 0.6 * Math.exp(-rt / 0.12) * rg);
        p.zoom *= 1 + 0.07 * Math.exp(-rt / 0.2);
        p.rad = Math.max(p.rad, 0.35 * Math.exp(-rt / 0.3));
      }
      if (t >= t0) p.grade = WN === 'kraken' ? [0.92, 0.95, 1.12] : WN === 'draak' ? [0.96, 1.06, 0.94] : [1.1, 0.97, 0.9];
    }

    // ───────────────── de upgrade: de reeks lijkt op ZELDZAAM! uit te komen en breekt dan nog eens open ─────────────────
    const LS = tr < 2 || !upg ? -1 : tr === 2 ? U : tr === 3 ? U + 0.9 * sf : SM.roar; // wanneer het logo van de trede het ZELDZAAM!-logo vervangt
    if (LS > 0) {
      c.at(LS - 0.05, () => {
        audio.speel('schiet-scherf', { gain: 0.9, rate: 0.9, galmen: 0.3 });
        audio.speel('zeldzaam-boem', { gain: 0.7, rate: 0.8, galmen: 0.3 });
        trillen([60, 30, 60, 30, 200]);
      });
      c.flits(LS, 0.8, 0.04);
      c.schok(LS, 0.08, 0.35);
      c.golf(LS, 1.6, 0.9, 0.06);
      c.golf(LS + 0.1, 1.2, 0.7, 0.06);
      // het ZELDZAAM!-logo spat uit elkaar
      w({ mode: 7, t0: LS, delay: 0.04, life: 2.2, n: 420, org: [0, 0.27], angle: 0, spread: c.TWEE_PI, spd: [0.4, 2.4], grav: [0, -0.8], drag: 0.9, size: [0.008, 0.028], col1: tr === 2 ? [0.8, 1, 1] : wk1, col2: tr === 2 ? [1, 0.7, 0.95] : wk2, alpha: 1, blend: 'alpha', regen: tr === 2 ? 1 : 0, seed: 131, per: 1 });
    }
    // scheuren door het beeld (bij de upgrade kort, bij ultiem lang); stap 0, 1, 2
    function rissen(t, stap, alpha, asp, visB) {
      const breed = Math.max(visB, (visB / asp) * (1920 / 1080)) * 1.03;
      c.vlak(t, tex.rissen[stap], 0, 0, 0.5, 0, 0, 0, breed, breed * (1080 / 1920), alpha, 2, 1, 0, k1, 0, 0);
    }
    function upgradeRissen(t, asp, visB) {
      if (LS < 0) return;
      const q = t - LS;
      if (q < -0.02 || q > 0.9) return;
      const stap = q < 0.12 ? 0 : q < 0.26 ? 1 : 2;
      rissen(t, stap, 1.6 * (1 - sm(q, 0.3, 0.9)), asp, visB);
    }

    // ───────────────── ULTIEM: de werkelijkheid breekt, implosie, stilte, BIG BANG, de relikwie ─────────────────
    const BANG = ult ? UL.bang : 1e9;
    const UK = ult ? UL.k : 1;
    // uitgangspunten voor de bang: waar de stelsels komen te staan (wereld-eenheden, x wordt met de beeldverhouding geschaald)
    const STELSELS = [[-0.78, 0.5, 2.1], [0.8, 0.42, 1.9], [-0.58, -0.58, 1.6], [0.62, -0.55, 1.8], [0.0, 0.84, 1.4], [-1.02, -0.05, 1.3], [1.02, 0.0, 1.3]];
    if (ult) {
      // de stilte: alles wat nog klinkt verdwijnt, dan klinkt de barst (met zijn eigen stilte erna)
      c.at(UL.U0 - 0.01, () => audio.stopAlles());
      c.at(UL.U0 + 0.01, () => audio.speel('ultiem-barst', { gain: 1.1, galmen: 0.3 }));
      c.at(UL.U0, () => trillen([30, 20, 30, 20, 30]));
      // de bevroren barst: drie stappen, elke met een korte schok (die zie je pas als de klok weer loopt: de scènetijd staat bijna stil)
      c.at(UL.f2 - 0.02, () => audio.stopAlles());
      // de bang
      c.at(BANG - 0.02, () => {
        audio.speel('ultiem-bang', { gain: 1.2, galmen: 0.35 });
        trillen([200, 40, 120, 40, 80, 40, 500]);
      });
      c.at(BANG + 0.3, () => audio.speel('ultiem-akkoord', { gain: 1.05, galmen: 0.4 }));
      c.at(BANG + 2.6 * UK, () => audio.fanfare(1));
      c.at(BANG + 4.6 * UK, () => audio.publiek(6, 1));
      c.at(BANG + 4.8 * UK, () => audio.gejuich(5, 1));
      c.flits(BANG, 1.5, 0.05);
      c.flits(BANG + 0.04, 0.5, 0.35);
      c.schok(BANG, 0.18, 0.7);
      for (let i = 0; i < 7; i++) c.golf(BANG + 0.1 * i, 1.0 + 0.45 * i, 1.0 - 0.1 * i, 0);
      c.flits(BANG + 1.4 * UK, 0.5, 0.2); // de relikwie verschijnt
      c.golf(BANG + 1.4 * UK, 1.6, 0.8, -0.05);
      c.golf(BANG + 4.6 * UK, 1.3, 0.7, -0.05); // en landt
      c.flits(BANG + 4.6 * UK, 0.35, 0.15);
      c.schok(BANG + 4.6 * UK, 0.03, 0.3);
      // de knal: goud, regenboog en wit; een uitdijend heelal van sterren; gouden stof dat blijft opstijgen
      w({ mode: 0, t0: BANG, delay: 0.25, life: 3.2, n: 2600, org: [0, 0.0], angle: 0, spread: c.TWEE_PI, spd: [0.5, 5.0], grav: [0, -0.15], drag: 0.9, size: [0.0022, 0.009], col1: goud1, col2: goud2, alpha: 1, regen: 0, seed: 141 });
      w({ mode: 0, t0: BANG, delay: 0.5, life: 3.6, n: 2200, org: [0, 0.0], angle: 0, spread: c.TWEE_PI, spd: [0.3, 4.0], grav: [0, -0.2], drag: 0.9, size: [0.002, 0.008], col1: k1, col2: k2, alpha: 0.95, regen: 1, seed: 142 });
      w({ mode: 0, t0: BANG, delay: 0.1, life: 1.8, n: 1400, org: [0, 0.0], angle: 0, spread: c.TWEE_PI, spd: [1.0, 6.0], grav: [0, 0], drag: 1.6, size: [0.002, 0.006], col1: [1, 1, 1], col2: [0.8, 0.9, 1], alpha: 1, seed: 143 });
      w({ mode: 8, t0: BANG, delay: 2.0, life: 60, n: 520, size: [0.004, 0.015], grav: [0, 0.6], spd: [0.4, 1.4], col1: [1, 1, 1], col2: [0.8, 0.85, 1], alpha: 0.95, seed: 144 });
      w({ mode: 8, t0: BANG, delay: 3.0, life: 60, n: 200, size: [0.004, 0.012], grav: [0, 1.4], spd: [0.5, 1.6], col1: goud1, col2: goud2, alpha: 0.9, seed: 145 });
      w({ mode: 1, t0: BANG, delay: 1.5, life: 40, n: 110, size: [0.006, 0.035], col1: [1, 0.8, 0.5], col2: [0.6, 0.5, 1], alpha: 0.55, seed: 146 });
      // confetti en kanonnen vanaf de relikwie, als de kaart landt
      const vl = (o) => Object.assign({ mode: 7, per: 1, alpha: 1, blend: 'alpha', drag: 0.55, regen: 1 }, o);
      w(vl({ t0: BANG + 4.6 * UK, life: 5.5, delay: 3.2, n: 1500, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.45], grav: [0, -0.16], size: [0.006, 0.016], col1: goud1, col2: [1, 0.35, 0.7], seed: 147, per: 2 }));
      for (const zijde of [-1, 1]) {
        const o = w(vl({ t0: BANG + 4.6 * UK, life: 4.4, delay: 0.5, n: 800, org: [0, -0.52], angle: Math.PI / 2 - zijde * 0.6, spread: 0.7, spd: [0.7, 2.2], grav: [0, -0.5], drag: 1.15, size: [0.006, 0.016], col1: [0.4, 1, 0.6], col2: [0.4, 0.8, 1], seed: 148 + zijde }));
        o.bij = (x, asp) => {
          x.org[0] = zijde * asp * 0.5 * 0.95;
        };
      }
    }
    const ultFase = (t) => (!ult || t < UL.U0 ? 0 : t <= UL.f1 ? 1 : t < UL.f2 ? 2 : t < BANG ? 3 : 4);
    // ───── tekenen: het stuk van de barst tot de bang ─────
    function ultAchter(t, asp, visB) {
      const fase = ultFase(t);
      if (fase === 0) return;
      if (fase === 1 || fase === 2) {
        const p1 = ramp(t, UL.U0, UL.f1);
        const stap = p1 < 0.3 ? 0 : p1 < 0.62 ? 1 : 2;
        rissen(t, fase === 2 ? 2 : stap, 1.7 * sm(p1, 0.02, 0.1), asp, visB);
      }
      if (fase === 2) {
        // het witte punt waar alles naartoe gezogen wordt
        const p2 = ramp(t, UL.f1, UL.f2);
        const s = 0.04 + 1.6 * Math.pow(p2, 5);
        c.vlak(t, tex.ster, 0, 0, 0.6, 0, 0, t * 2, s, s, 1, 2, 1, 0, k1, 0, 0);
        c.licht(t, 0, 0, 0.9 * Math.pow(p2, 3), 0.02 + 0.2 * p2, 0.5 * p2, 1.5 * Math.pow(p2, 3), t * 3, [1, 1, 1]);
      }
    }
    // ───── tekenen: de nieuwe wereld na de bang ─────
    function ultNaBang(t, asp, visB) {
      const b = t - BANG;
      if (b < 0) return;
      const hwv = hw(asp);
      // de nevel dijt uit en blijft als achtergrond
      const na = 0.85 * sm(b, 0, 0.9) * (1 - 0.25 * sm(b, 6, 12));
      const hz = c.H_ZICHT * (3 + 1.4) / 3;
      const wN = Math.max(hz * asp, hz * (16 / 9)) * 1.2 * mix(0.25, 1, Math.pow(sm(b, 0, 1.6), 0.6));
      c.vlak(t, tex.nevelUlt, 0, 0, -1.4, 0, 0, 0.02 * b, wN, wN * (720 / 1280), na, 2, 1, 0, k1, 0, 0);
      // gouden en witte golven
      for (const [dl, kn] of [[0, 'wit'], [0.12, 'goud'], [0.26, 'roze'], [0.4, 'blauw'], [0.6, 'goud']]) {
        const q = b - dl;
        if (q < 0 || q > 2.4) continue;
        const D = 0.2 + 8 * (1 - Math.pow(1 - q / 2.4, 2.4));
        c.vlak(t, tex.ringen[kn], 0, 0, 0.3, 0, 0, 0, D, D, 0.8 * (1 - sm(q, 1.0, 2.4)), 2, 1, 0, k1, 0, 0);
      }
      // sterrenstelsels die ontstaan: ze groeien uit het niets, draaien en blijven
      STELSELS.forEach(([sx, sy, D], i) => {
        const q = b - (0.45 + 0.28 * i);
        if (q < 0) return;
        const g = veer(ramp(q, 0, 1.5));
        const dd = D * g;
        const bob = Math.sin(t * 0.3 + i) * 0.02;
        c.vlak(t, tex.stelsels[i % 3], sx * hwv * 0.9, sy + bob, -0.8 - 0.1 * i, 0, 0, t * (0.12 + 0.04 * (i % 3)) * (i % 2 ? 1 : -1), dd, dd, 0.9 * sm(q, 0, 0.4), 2, 1, 0, k1, 0, 0);
      });
      // een mythisch wezen blijft groot in de verte
      if (tr === 4) {
        const wa = 0.5 * sm(b, 1.0, 2.6);
        if (wa > 0.01) {
          const st = { x: 0.62 * hwv, y: 0.36 + 0.03 * Math.sin(t * 0.8), s: 1.25, sx: -1, bank: 0.1 + 0.05 * Math.sin(t * 0.7), flap: -0.3 + 0.55 * Math.sin(t * 3.4), alpha: 1, t: t };
          wezenTekenen(t, asp, st, wa);
        }
      }
      // de krans en de stralen achter de relikwie
      const kr = sm(b, 1.4 * UK, 3.8 * UK);
      const ky = -0.17 + relikwieY(t);
      if (kr > 0.01) {
        const D = 3.5 * mix(0.6, 1, veer(ramp(b, 1.4 * UK, 3.4 * UK)));
        c.vlak(t, tex.krans, 0, ky + 0.02, -0.15, 0, 0, t * 0.12, D, D, 0.8 * kr, 2, 1, 0, k1, 0, 0);
        c.vlak(t, tex.krans, 0, ky + 0.02, -0.16, 0, 0, -t * 0.07, D * 0.78, D * 0.78, 0.45 * kr, 2, 1, 0, k1, 0, 0);
        SPO.hsv(t * 0.1, 0.35, 1, k2);
        c.stralen(t, 0.75 * kr, 0.8, 0.28, 0.2, 0, ky / c.H_ZICHT, t * 0.15, 1, goud1, k2, 44);
        c.licht(t, 0, 0.5, 0.5 * kr, 0.08, 0.1 * kr, 0.5 * kr, 0, goud2);
      }
    }
    // de relikwie daalt neer van boven; hij zweeft daarna een beetje
    function relikwieY(t) {
      const b = t - BANG;
      const q = ramp(b, 1.4 * UK, 4.6 * UK);
      const e = 1 - Math.pow(1 - q, 3);
      return 1.25 * (1 - e) + (q >= 1 ? 0.025 * Math.sin((b - 4.6 * UK) * 1.1) : 0);
    }
    function ultKaart(zk, t) {
      if (!ult || t < UL.U0) return;
      const b = t - BANG;
      if (t >= UL.f2 && t < BANG) {
        zk.alpha = 0;
        return;
      }
      if (b >= 0) {
        zk.alpha = sm(b, 1.4 * UK, 1.9 * UK);
        zk.y = relikwieY(t);
        zk.lay = 0.9;
        const q = ramp(b, 1.4 * UK, 5.4 * UK);
        zk.rot = Math.PI * 3 * Math.pow(1 - q, 2.2) + (q >= 1 ? 0.18 * Math.sin((b - 5.4 * UK) * 0.8) : 0);
        zk.schaal = 1 + 0.06 * Math.exp(-Math.max(0, b - 4.6 * UK) / 0.4) * (b > 4.6 * UK ? 1 : 0);
        zk.folie = 1.2 + 0.6 * Math.sin(t * 1.3) + 1.2 * Math.exp(-Math.max(0, b - 1.4 * UK) / 1.6);
      }
    }
    function ultVoor(t, asp, visB, fit, layY) {
      const b = t - BANG;
      if (b < 0) return;
      // de titel boven de relikwie
      const q = b - 4.4 * UK;
      if (q > 0) {
        const wT = Math.min(1.95, visB * 0.82);
        const hT = wT * (700 / 1900);
        const pop = Math.max(0.001, veer(ramp(q, 0, 0.8)));
        const yRust = 0.4 * fit + 0.5 * hT * 0.8;
        const bob = 0.012 * Math.sin(t * 1.4);
        const gl = Math.exp(-q / 0.3);
        c.vlak(t, tex.titelUlt, 0, yRust + bob, 0.05, 0, 0, -0.02 * (1 - pop) + 0.006 * Math.sin(t * 1.9), wT * pop, hT * pop, sm(q, 0, 0.1), 2, 0, gl * 0.7, k1, gl * 0.5 + 0.08, Math.sin(t * 0.5) * 0.35);
        // sterretjes rond de titel
        for (let i = 0; i < 14; i++) {
          const hh = hash(i * 3.17 + 0.5), hh2 = hash(i * 7.31 + 2.1);
          const x = (hh - 0.5) * wT * 0.95;
          const y = yRust + (hh2 - 0.5) * hT * 1.1;
          const tw = 0.5 + 0.5 * Math.sin(t * (2 + 2 * hh) + hh2 * 30);
          const s = (0.06 + 0.15 * hh2) * (0.4 + 0.8 * tw * tw) * sm(q, 0.2 + 0.08 * i, 0.6 + 0.08 * i);
          if (s < 0.004) continue;
          c.vlak(t, tex.ster, x, y, 0.06, 0, 0, t * (0.3 + hh) * (i % 2 ? 1 : -1), s, s, 0.9, 2, 1, 0, k1, 0, 0);
        }
      }
      // het aureool/de kroon boven de kaart
      const ky = -0.17 + relikwieY(t);
      const ka = sm(b, 3.4 * UK, 4.6 * UK);
      if (ka > 0.01 && tex.kroon) {
        const kw = 0.5 * (1 + 0.04 * Math.sin(t * 2));
        c.vlak(t, tex.kroon, 0, ky + KAART_HALF * fit * 0.82 + 0.05 + 0.02 * Math.sin(t * 1.7), 0.04, 0, 0, Math.sin(t * 1.1) * 0.03, kw, kw * (360 / 520), ka, 2, 0, 0, k1, 0, 0);
      }
      // glinsters over de kaart
      const qq = Math.max(0, b - 4.8 * UK);
      for (let i = 0; i < 5 && qq > 0; i++) {
        const ph = (qq * 0.6 + i * 0.29) % 1.3;
        const s = 0.45 * Math.pow(Math.max(0, Math.sin(Math.min(ph, 1) * Math.PI)), 3);
        if (s < 0.01) continue;
        const px = (hash(Math.floor(qq * 0.6 + i * 0.29) * 1.7 + i) - 0.5) * 0.55;
        const py = ky + (hash(Math.floor(qq * 0.6 + i * 0.29) * 2.3 + i) - 0.5) * 0.9;
        SPO.hsv(i * 0.2 + t * 0.15, 0.4, 1, k2);
        c.vlak(t, tex.ster, px, py, 0.06, 0, 0, ph * 1.5, s, s, 1, 2, 1, 0, k2, 0, 0);
      }
    }
    const KAART_HALF = c.KAART_H / 2;
    function ultPost(p, t) {
      if (!ult || t < UL.U0) return;
      const fase = ultFase(t);
      if (fase === 1) {
        const p1 = ramp(t, UL.U0, UL.f1);
        const flik = p1 < 0.22 ? (Math.floor(p1 * 46) % 2) : 1;
        p.inv = flik;
        p.gl = (0.35 + 0.35 * hash(Math.floor(p1 * 30))) * rg;
        p.dark = 0;
        p.zoom = 1 + 0.02 * p1;
        p.vig = 1.5;
      } else if (fase === 2) {
        const p2 = ramp(t, UL.f1, UL.f2);
        p.inv = 1 - sm(p2, 0.35, 0.8);
        p.pinch = 0.993 * Math.pow(p2, 2.4);
        p.gl = (0.5 * (1 - p2)) * rg;
        p.rad = 0.2 * p2;
        p.vig = 1 + 2 * p2;
        p.dark = 0.0;
        p.bloom = 1 + 0.5 * p2;
      } else if (fase === 3) {
        p.dark = 1;
        p.pinch = 0;
        p.inv = 0;
      } else if (fase === 4) {
        const b = t - BANG;
        p.dark = 1 - sm(b, 0, 0.03);
        p.gl = Math.max(p.gl, 0.7 * Math.exp(-b / 0.15) * rg);
        p.zoom *= 1 + 0.16 * Math.exp(-b / 0.28);
        p.rad = Math.max(p.rad, 0.55 * Math.exp(-b / 0.35));
        p.bloom *= 1.1 + 0.3 * Math.exp(-b / 1.2);
        p.sat = Math.max(p.sat, 1.1);
        p.vig = Math.min(p.vig, 1.0);
      }
    }
    function ultSchud(t) {
      if (!ult || t < UL.U0) return 0;
      const fase = ultFase(t);
      if (fase === 1) return 0.01 * ramp(t, UL.U0, UL.f1) * (reduceer ? 0.15 : 1);
      if (fase === 2) return (0.004 + 0.02 * ramp(t, UL.f1, UL.f2)) * (reduceer ? 0.15 : 1);
      if (fase === 4 && t < BANG + 4.5) return 0.013 * Math.exp(-(t - BANG) / 0.8) * (reduceer ? 0.15 : 1);
      return 0;
    }

    // ═════════════════════════ samenstellen ═════════════════════════
    const plaatNu = (t) => plaat(t, sm(t, t0, t0 + 0.35 * sf) * (1 - sm(t, K0 + 0.2, K0 + 1.4)));
    const logoNu = (t) => (tr >= 2 ? (LS > 0 && t < LS ? tex.logoZ : tex.logoT) : tex.logo);
    const logoR = (t) => (LS > 0 && t >= LS ? t - LS : t - RV - 0.12);

    function teaseTeken(t, asp, visB) {
      if (eigenT) {
        plaatNu(t);
        if (tr === 3) kosmosTease(t, asp);
        else wezenTease(t, asp);
        return;
      }
      teaseTeken0(t, asp, visB);
    }
    function achter(t, asp) {
      const visB = c.H_ZICHT * asp;
      if (tr >= 3 && t >= t0 && (!ult || t < UL.f2)) {
        if (eigenT && t >= t1) plaatNu(t);
        if (tr === 3) kosmosTekenen(t, asp, 0);
        else wezenAchter(t, asp);
      }
      achter0(t, asp);
      if (ult) {
        ultAchter(t, asp, visB);
        if (t >= BANG) ultNaBang(t, asp, visB);
      }
    }
    function voor(t, fit, asp, visB, layY) {
      if (ult && t >= BANG) {
        ultVoor(t, asp, visB, fit, layY);
        return;
      }
      voor0(t, fit, asp, visB, layY);
      if (tr === 3 && (!ult || t < UL.f2)) planeten(t, 1);
      if (tr === 2) glimVoor(t, layY, visB);
      if (tr >= 2) upgradeRissen(t, asp, visB);
    }
    function kaart(t) {
      kaartNu.alpha = 1;
      kaartNu.x = 0;
      kaartNu.y = 0;
      kaartNu.lay = 0.84;
      const zk = kaart0(t);
      if (tr === 2) glimKaart(zk, t);
      if (tr >= 2) ultKaart(zk, t);
      return zk;
    }
    function post(t) {
      const p = postNu;
      p.inv = 0;
      p.pinch = 0;
      p.grade = null;
      post0(t);
      if (tr === 2) glimPost(p, t);
      else if (tr === 3) kosmosPost(p, t);
      else if (tr === 4) wezenPost(p, t);
      if (ult) ultPost(p, t);
      return p;
    }
    function schud(t) {
      let a = schud0(t);
      if (eigenT && tr >= 3 && t >= t0 && t < t1) {
        const u = ramp(t, t0, t1);
        a += (0.0012 + 0.006 * u * u) * (reduceer ? 0.15 : 1);
      }
      if (ult) a += ultSchud(t);
      return a;
    }

    return {
      teaseTeken,
      achter,
      voor,
      kaart,
      post,
      schud,
      kleur,
      regenUit,
      verwijder() {
        /* de teksturen zijn via c.tekstuur gemaakt en worden door scene.js opgeruimd */
      },
    };
  }

  // ───────────────────────── Het teken vooraf en het vals alarm ─────────────────────────
  // Tijdens het openen (vlak voor het hoogtepunt E van de opening) verschijnt er bij glim, kosmisch en mythisch een klein teken:
  // het pakje trilt anders, er komt gekleurd licht uit de scheur. Bij gewone en zeldzame kaarten gebeurt dat soms ook (vals alarm),
  // maar dan dooft het teken en blijft het bij de gewone reeks.
  const TEKEN_KLEUR = { 2: ['150,235,255', [0.65, 0.9, 1]], 3: ['170,130,255', [0.65, 0.5, 1]], 4: ['255,150,50', [1, 0.55, 0.2]] };
  function vroeg(c) {
    const { tlOp, d, audio, reduceer, lot, trede } = c;
    const tr = trede | 0;
    const vals = tr < 2;
    const kl = tr >= 2 ? tr : lot.kleur;
    const [rgb, tint] = TEKEN_KLEUR[kl];
    const snel = !!d.snel;
    const E = tlOp.E !== undefined ? tlOp.E : tlOp.K0 - 1.2;
    const dur = snel ? 0.8 : 1.6;
    const W0 = E - dur;
    const W1 = Math.min(E + (vals ? 0.55 : 0.12), tlOp.K0 - 0.14);
    if (W1 <= W0) return { teken() {}, schud: () => 0 };
    const teken = c.tekstuur(maakTeken(rgb));
    const pak = c.opNaam === 'pak';
    const yP = pak ? c.lekP : 0.12; // y in deeltjesruimte
    const yW = yP * c.H_ZICHT;
    const E2 = Math.min(E, W1 - 0.05);
    // geluid
    c.at(W0 + 0.05, () => {
      if (tr >= 2) audio.speel('glim-glinster', { gain: 0.55, rate: tr === 3 ? 0.7 : tr === 4 ? 0.55 : 0.95, galmen: 0.3 });
      else audio.glinster(0.55);
    });
    c.at(W0 + dur * 0.35, () => audio.hartslag(0.55));
    c.at(W0 + dur * 0.7, () => audio.hartslag(0.75));
    if (vals) c.at(E2 + 0.08, () => audio.speel('tear', { gain: 0.22, rate: 1.9, galmen: 0.2 }));
    // vonkjes uit de scheur
    c.e0({ mode: 0, t0: W0 + dur * 0.4, delay: dur * 0.6, life: 0.9, n: vals ? 140 : 260, org: [0, yP], angle: 0, spread: c.TWEE_PI, spd: [0.04, 0.4], grav: [0, 0.05], drag: 1.4, size: [0.0016, 0.004], col1: tint, col2: [1, 1, 1], alpha: 0.9, seed: 151 });
    if (vals) {
      // het dooft: een zuchtje donkere, grijze vonken
      c.e0({ mode: 0, t0: E2 + 0.05, delay: 0.12, life: 0.8, n: 160, org: [0, yP], angle: Math.PI / 2, spread: 2.4, spd: [0.05, 0.4], grav: [0, -0.2], drag: 1.6, size: [0.002, 0.005], col1: [0.5, 0.5, 0.6], col2: [0.8, 0.8, 0.85], alpha: 0.6, seed: 152 });
    }
    return {
      teken(t, asp) {
        if (t < W0 || t > W1 + 0.05) return;
        const u = ramp(t, W0, E2);
        const na = vals ? Math.max(0, t - E2) : 0;
        // knippert steeds sneller, en bij een vals alarm stottert het uit
        const klop = 0.5 + 0.5 * Math.sin(t * (9 + 22 * u * u));
        const uit = vals ? 1 - sm(na, 0.0, 0.4) * (hash(Math.floor(t * 30)) > 0.35 ? 1 : 0.4) : 1 - sm(t, E2 + 0.1, W1);
        const a = (0.25 + 0.75 * sm(u, 0, 0.35)) * (0.6 + 0.4 * klop) * uit * (reduceer ? 0.6 : 1);
        if (a < 0.01) return;
        const s = (0.12 + 0.34 * sm(u, 0, 0.8)) * (1 + 0.1 * klop);
        c.licht(t, 0, yP, 0.28 * u * uit, 0.03 + 0.03 * u, 0.4 * u * uit, 0.6 * u * u * uit, t * 0.8, tint);
        c.vlak(t, teken, 0, yW, 0.1, 0, 0, t * 1.3, s, s, a, 2, 1, 0, tint, 0, 0);
        c.vlak(t, teken, 0, yW, 0.1, 0, 0, -t * 0.7, s * 1.5, s * 1.5, a * 0.35, 2, 1, 0, tint, 0, 0);
      },
      schud(t) {
        if (t < W0 || t > E2 + 0.1) return 0;
        const u = ramp(t, W0, E2);
        return (0.0012 + 0.005 * u * u) * (tr >= 2 ? 1.3 : 0.8) * (reduceer ? 0.15 : 1);
      },
    };
  }

  SPO.zeldzaam = { tijden, maakArt, maak, vroeg, lot };
})();
