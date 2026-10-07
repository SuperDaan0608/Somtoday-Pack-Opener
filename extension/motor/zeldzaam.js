/*
 * Somtoday Pack Opener — zeldzaam.js
 * De ZELDZAAM-reeks: wat er extra gebeurt als een kaart zeldzaam is, bij elke opening. Alles blijft een functie
 * van de tijd (net als scene.js), de regie hier is alleen het extra stuk:
 *
 *   tease      vlak voor de kaart: de opening bevriest, het scherm gaat bijna zwart met een regenboog-glitch, een
 *              hartslag en de tekst "ER GEBEURT IETS..."; daarna een felle flits
 *   walkout    de kaart komt door een regenboogtunnel aanvliegen, met een regenboogexplosie en schokgolven
 *   onthulling slow-motion, een regenboog-schokgolf over het hele scherm, de kaart draait rond met holografische
 *              folie, het grote ZELDZAAM!-logo met glitch en sterren, draaiende lichtbundels, een 3D-confettistorm
 *   viering    ruim vier seconden langer dan een gewone onthulling; een klik slaat het over
 *
 * scene.js roept dit aan: tijden() schuift de tijdlijn op, maakArt() levert de afbeeldingen, maak(c) bouwt de reeks.
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

  // ───────────────────────── Tijdlijn ─────────────────────────
  // o: de gewone tijdlijn (met K0, spin, telStart, RV, EIND). Geeft een verlengde tijdlijn terug die de gewone als
  // prototype heeft (dus wijzigingen van een opening, zoals klikHint, blijven zichtbaar) en die zegt:
  //   tease [t0, t1]   het bevroren stuk: de opening staat stil op t0 (pre() zegt welke tijd de opening ziet)
  //   K0, spin, RV, EIND   opgeschoven en verlengd; vier = vanaf hier slaat een klik de viering over
  //   warp(t) / echt(ts)   slow-motion rond de onthulling: werkelijke tijd <-> scènetijd
  function tijden(o, d) {
    const snel = d.snel;
    const TEASE = snel ? 1.15 : 2.5;
    const t0 = o.K0 - 0.06;
    const z = Object.create(o);
    z.basis = o;
    z.tease = [t0, t0 + TEASE];
    z.K0 = o.K0 + TEASE;
    z.spin = snel ? 1.2 : 2.3;
    z.telStart = z.K0 + z.spin * 0.85;
    z.telDuur = snel ? 0.95 : 1.5 + 0.9 * d.I;
    z.RV = z.telStart + z.telDuur;
    z.vier = z.RV + (snel ? 1.2 : 2.0);
    z.EIND = z.RV + (snel ? 2.6 : 5.6);
    z.pre = (t) => (t < t0 ? t : t < t0 + TEASE ? t0 : t - TEASE);

    // slow-motion: eerst een korte, trage stukje (snelheid v0), dan een vloeiend herstel naar normaal tempo
    const v0 = snel ? 0.32 : 0.17;
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
    z.warp = (t) => (t <= RV ? t : RV + g(t - RV));
    z.echt = (ts) => {
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
    return z;
  }

  // ───────────────────────── Afbeeldingen ─────────────────────────
  function maakArt(d) {
    const A = SPO.art;
    const sport = A.F_SPORT;
    const regenboog = ['#ff4d6d', '#ffb02e', '#fff04a', '#4dff9a', '#3bd8ff', '#8a6bff', '#ff5fd2', '#ff4d6d'];

    // het logo: ZELDZAAM! met dikke lijn, schuine diepte, regenboog en een glans; eronder het niveau
    const logo = A.nieuw(1900, 540);
    {
      const c = logo.getContext('2d');
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const txt = 'ZELDZAAM!';
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
      c.shadowColor = 'rgba(255,90,230,.95)';
      c.shadowBlur = 46;
      c.lineWidth = 34;
      c.strokeStyle = 'rgba(40,10,70,.9)';
      c.strokeText(txt, cx, by);
      c.restore();
      // diepte: donkere kopieën schuin naar beneden
      for (let i = 16; i >= 1; i--) {
        c.fillStyle = i > 12 ? '#16062e' : i > 6 ? '#2a0f55' : '#3d1a7a';
        c.fillText(txt, cx + i * 0.9, by + i * 1.15);
      }
      c.lineWidth = 30;
      c.strokeStyle = '#120528';
      c.strokeText(txt, cx, by);
      c.lineWidth = 15;
      c.strokeStyle = '#ffffff';
      c.strokeText(txt, cx, by);
      // regenboogvulling
      const g = c.createLinearGradient(130, 0, 1770, 0);
      regenboog.forEach((k, i, l) => g.addColorStop(i / (l.length - 1), k));
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
      const regel = `${d.T.label.toUpperCase()}  ·  ${d.T.naam.toUpperCase()}`;
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
    return { logo, tease, ster };
  }

  // ───────────────────────── De reeks ─────────────────────────
  // c: de omgeving van scene.js (zie het blok ctxZ daar).
  function maak(c) {
    const { tl, d, I, audio, trillen, reduceer, art } = c;
    const [t0, t1] = tl.tease;
    const TEASE = t1 - t0;
    const K0 = tl.K0;
    const RV = tl.RV;
    const snel = d.snel;
    const tex = { logo: c.tekstuur(art.logo), tease: c.tekstuur(art.tease), ster: c.tekstuur(art.ster) };
    const k1 = [1, 1, 1];
    const k2 = [1, 1, 1];
    const regen = (t, a = 0.12, b = 0.35) => {
      SPO.hsv(t * a, 0.7, 1, k1);
      SPO.hsv(t * a + b, 0.8, 1, k2);
    };
    const rg = reduceer ? 0.3 : 1; // minder flikkering als je dat wilt

    // ───── de hartslag van de tease: gelijk aan het geluid (zie scripts/bouw-zeldzaam.py) ─────
    const geluidLen = 2.6;
    const eindGeluid = t1 + 0.04;
    let startGeluid = eindGeluid - 2.58;
    let offset = 0;
    if (startGeluid < t0 - 0.05) {
      offset = t0 - startGeluid;
      startGeluid = t0;
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
    const beats = slagen.map((s) => startGeluid - offset + s).filter((b) => b >= t0 - 0.02 && b < t1 - 0.1);
    const thump = (t) => {
      let s = 0;
      for (let i = 0; i < beats.length; i++) {
        const dt = t - beats[i];
        if (dt >= 0 && dt < 0.8) s += Math.exp(-dt / 0.09) * (i % 2 ? 0.6 : 1);
      }
      return Math.min(1.4, s);
    };

    // ───── geluid ─────
    c.at(startGeluid, () => audio.speel('zeldzaam-tease', { gain: 1.1, offset, duur: geluidLen - offset, fadeOut: 0.03, galmen: 0.1 }));
    c.at(RV - 1.9, () => audio.speel('zeldzaam-koor', { gain: 0.95, fadeOut: 1.2, galmen: 0.25 }));
    c.at(RV - 0.04, () => audio.speel('zeldzaam-boem', { gain: 1.0, galmen: 0.25 }));
    c.at(RV + 0.35, () => audio.speel('zeldzaam-boem', { gain: 0.45, rate: 1.25, galmen: 0.25 }));

    // ───── flitsen, schokken en golven ─────
    // de tease: een schok op elke hartslag en één grote ontlading precies voor de kaart
    for (const b of beats) {
      c.schok(b, 0.006 + 0.01 * ramp(b, t0, t1), 0.12);
    }
    c.flits(t1 - 0.02, 1.5, 0.05);
    c.flits(t1 - 0.02, 0.9, 0.22);
    c.golf(t1 - 0.02, 1.5, 1.1, 0);
    c.trillen = trillen;
    c.at(t1 - 0.5, () => trillen([30, 30, 60, 30, 120]));
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
    w({ mode: 0, t0: K0, delay: 0.1, life: 2.4, n: 1800, org: [0, 0.01], angle: 0, spread: c.TWEE_PI, spd: [0.3, 3.2], grav: [0, -0.2], drag: 1.2, size: [0.002, 0.007], col1: k1, col2: k2, alpha: 0.9, regen: 1, seed: 31 });
    w({ mode: 0, t0: K0, delay: tl.spin * 0.85, life: 1.2, n: 700, org: [0, 0.01], angle: 0, spread: c.TWEE_PI, spd: [0.15, 1.4], grav: [0, 0], drag: 2.0, size: [0.0016, 0.0045], col1: k1, col2: k2, alpha: 0.8, regen: 1, seed: 32 });
    // de confettistorm: 3D-stukjes, linten, kanonnen links en rechts
    const vlak = (o) => Object.assign({ mode: 7, per: 1, alpha: 1, blend: 'alpha', drag: 0.55, regen: 0 }, o);
    w(vlak({ t0: RV + 0.1, life: 5.4, delay: 3.0, n: 1700, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.45], grav: [0, -0.16], size: [0.006, 0.016], col1: [1, 0.85, 0.3], col2: [1, 0.35, 0.7], seed: 41, per: 2 }));
    const kanon = (zijde, seed) => {
      const o = w(vlak({ t0: RV + 0.25, life: 4.4, delay: 0.5, n: 900, org: [0, -0.52], angle: Math.PI / 2 - zijde * 0.62, spread: 0.7, spd: [0.7, 2.1], grav: [0, -0.5], drag: 1.15, size: [0.006, 0.016], col1: [0.4, 1, 0.6], col2: [0.4, 0.8, 1], regen: 1, seed }));
      o.bij = (x, asp) => {
        x.org[0] = zijde * asp * 0.5 * 0.95;
      };
    };
    kanon(-1, 42);
    kanon(1, 43);
    w(vlak({ t0: RV + 0.1, life: 5.0, delay: 2.0, n: 1100, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.6, spd: [0.05, 0.4], grav: [0, -0.14], size: [0.006, 0.016], col1: [1, 0.5, 0.8], col2: [0.5, 0.9, 1], regen: 1, seed: 44, per: 2 }));
    w(vlak({ t0: RV + 2.6, life: 6, delay: 3.0, n: 800, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.4], grav: [0, -0.13], size: [0.006, 0.015], col1: [1, 0.85, 0.3], col2: [0.7, 0.4, 1], seed: 45, per: 2 }));
    w(vlak({ t0: RV + 5.2, life: 8, delay: 6.0, n: 420, org: [0, 0.66], angle: -Math.PI / 2, spread: 0.5, spd: [0.05, 0.35], grav: [0, -0.12], size: [0.006, 0.015], col1: [1, 0.85, 0.3], col2: [1, 0.4, 0.7], regen: 1, seed: 46, per: 2 }));

    // ───── de tease tekenen ─────
    function teaseTeken(t, asp, visB) {
      const u = ramp(t, t0, t1);
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
    function achter(t, asp) {
      regen(t);
      // de regenboogtunnel: de kaart komt er doorheen aanvliegen
      const tun = sm(t, K0 - 0.08, K0 + 0.25) * (1 - sm(t, K0 + tl.spin * 0.62, K0 + tl.spin + 0.5));
      if (tun > 0.004) {
        const h = t * 0.35;
        const a = [0, 0, 0];
        const b = [0, 0, 0];
        SPO.hsv(h, 0.7, 1, a);
        SPO.hsv(h + 0.4, 0.85, 1, b);
        c.warp(t, tun * 0.9, 1.7 - 1.0 * ramp(t, K0, K0 + tl.spin), 0.7, a, b);
      }
      // draaiende lichtbundels: twee lagen die tegen elkaar in draaien, en zoeklichten vanuit de onderhoeken
      const r = t - RV;
      if (t > K0) {
        const rust = 1 - 0.35 * sm(r, 3.5, 6.5);
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
    function voor(t, fit, asp, visB, layY) {
      const r = t - RV - 0.12;
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
      c.vlak(t, tex.logo, (stoot ? (hash(Math.floor(t * 30)) - 0.5) * 0.05 : 0), y, 0.02, 0, 0, wob - 0.03 * (1 - slag), wT * sc, hT * sc, al, 2, 0, gl * 0.8, k1, gl * (0.5 + 0.5 * fl) + 0.12, hue);
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
    const kaartNu = { rot: 0, folie: 0, schaal: 1, y: 0 };
    function kaart(t) {
      const r = t - RV;
      // vanaf de aankomst al folie, en tijdens de slow-motion een volle draai (de voorkant komt weer naar je toe)
      kaartNu.folie = sm(t, K0 + 0.2, K0 + tl.spin) * (0.75 + 0.35 * sm(r, 0, 0.6)) * (1 + 0.2 * Math.sin(t * 1.3));
      const draai = ramp(r, 0.05, 1.5);
      const e = draai * draai * (3 - 2 * draai);
      // na de draai wiegt de kaart rustig heen en weer
      kaartNu.rot = r < 0 ? 0 : Math.PI * 2 * e + (r > 1.5 ? 0.28 * Math.sin((r - 1.5) * 0.9) * sm(r, 1.5, 2.3) : 0);
      kaartNu.schaal = 1 + (r > 0 ? 0.1 * Math.exp(-r / 0.5) : 0);
      return kaartNu;
    }

    // ───── de nabewerking ─────
    const postNu = { gl: 0, dark: 0, regen: 0, zoom: 1, rad: 0, vig: 1, sat: 1, bloom: 1 };
    function post(t) {
      const p = postNu;
      p.gl = 0;
      p.dark = 0;
      p.zoom = 1;
      p.rad = 0;
      p.vig = 1;
      p.sat = 1;
      p.bloom = 1;
      p.regen = t >= RV - 0.05 ? 1 : 0;
      if (t >= t0 && t < t1 + 0.02) {
        const u = ramp(t, t0, t1 + 0.02);
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
      return p;
    }

    // kleine extra schudbeving: rommelen tijdens de tease en een lange nasidderen na de onthulling
    function schud(t) {
      if (t >= t0 && t < t1) {
        const u = ramp(t, t0, t1);
        return (0.0015 + 0.011 * u * u * u) * (reduceer ? 0.15 : 1);
      }
      if (t >= RV && t < RV + 4) return 0.003 * Math.exp(-(t - RV) / 1.4) * (reduceer ? 0.15 : 1);
      return 0;
    }

    return {
      teaseTeken,
      achter,
      voor,
      kaart,
      post,
      schud,
      verwijder() {
        /* de teksturen zijn via c.tekstuur gemaakt en worden door scene.js opgeruimd */
      },
    };
  }

  SPO.zeldzaam = { tijden, maakArt, maak };
})();
