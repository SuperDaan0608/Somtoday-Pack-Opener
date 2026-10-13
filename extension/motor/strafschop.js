/*
 * Somtoday Pack Opener — strafschop.js
 * Eén STRAFSCHOP als tv-cinematic, helemaal op de videokaart getekend (proef voor de nieuwe voetbalduels van v3.0).
 *
 *   beeld    een stadion bij nacht: veld met maaistroken en lijnen, een doel met net dat meegeeft, tribunes vol
 *            lichtjes in lagen, schijnwerpers met bundels in de mist; twee voetballers (schutter en keeper) als
 *            gladde vormen rond een skelet, met rim-light, schaduwen en een spiegelbeeld in het natte gras
 *   regie    (1) breed stadion  (2) achter de schutter  (3) close-ups schutter en keeper  (4) aanloop en het schot in
 *            slow-motion vanaf de zijkant  (5) doelcamera achter het net  (6) juichen of teleurstelling
 *            (7) herhaling vanuit een andere hoek  (8) afsluitend totaalbeeld
 *   overlay  tv-graphics in de typografie van het project (scorebord, STRAFSCHOP, GOAL!/GEREDDERD!/PAAL!/OVER!, HERHALING)
 *
 * Alles is een functie van de tijd t (seconden): SPO.strafschop.start(invoer) speelt af, en met ?debug=1 kun je
 * window.__somPackDebug.seek(t) gebruiken, net als bij de rest van de motor.
 *
 * Invoer (zie maakInvoer):
 *   schutter, keeper: { vak, cijfer, tier 0..4 (kit-kleur; zonder tier volgt hij uit het cijfer), trede 0..4, vloek,
 *                       av?: { huid, haar, shirt, broek, acc (hex-kleuren), nummer 1..99, juich } }   (v3.0: eigen voetballer, optioneel;
 *                       zie SPOVoetbal.naarSchutter. Juichen na een goal: knie | armen | wijd | vuist | dans | salto.)
 *   thema?: { tribune (hex), gras: [hex, hex], veld: 0 strepen | 1 ruiten | 2 diagonaal }   (v3.0: eigen stadion, optioneel; zie SPOVoetbal.naarThema)
 *   uitkomst: 'goal' | 'redding' | 'paal' | 'over';  richting: 'links' | 'midden' | 'rechts';  hoogte: 'laag' | 'hoog'
 *   kracht: 0..1;  stil: geen geluid;  debug
 * Links/rechts is gezien vanuit de schutter.
 *
 * Wereld: meters; de doellijn ligt op z = 0, het doel loopt van x = -3,66 tot 3,66 en is 2,44 hoog; de stip ligt op z = 11.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const klem = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, p) => a + (b - a) * p;
  const ramp = (t, a, b) => klem((t - a) / (b - a), 0, 1);
  const glad = (p) => p * p * (3 - 2 * p);
  const sm = (t, a, b) => glad(ramp(t, a, b));
  const easeOut = (p) => 1 - Math.pow(1 - klem(p, 0, 1), 3);
  const easeIn = (p) => Math.pow(klem(p, 0, 1), 2);
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  // waarde-ruis in 1D (voor handcamera en schud)
  const ruis = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return mix(hash(i), hash(i + 1), u) * 2 - 1;
  };

  // vectoren
  const v3 = (x, y, z) => [x, y, z];
  const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const min3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const keer = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const lerp3 = (a, b, p) => [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const kruis = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const lengte = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => keer(a, 1 / (lengte(a) || 1));
  const rotX = (v, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  };
  const rotY = (v, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  };
  const rotZ = (v, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  };

  // ═════════════════════════ Invoer ═════════════════════════
  const tierVan = (g) => (g >= 9.95 ? 4 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5.5 ? 1 : 0);
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const JUICHSTIJLEN = ['knie', 'armen', 'wijd', 'vuist', 'dans', 'salto'];
  // Eigen uiterlijk van een speler (optioneel): alleen vaste vormen, anders null (dan blijft alles zoals het was).
  function schoonAv(a) {
    if (!a || typeof a !== 'object') return null;
    const kl = (v) => (typeof v === 'string' && HEX.test(v) ? v : null);
    const nr = parseInt(a.nummer, 10);
    const uit = { huid: kl(a.huid), haar: kl(a.haar), shirt: kl(a.shirt), broek: kl(a.broek), acc: kl(a.acc), nummer: Number.isFinite(nr) && nr >= 1 && nr <= 99 ? nr : 0, juich: JUICHSTIJLEN.includes(a.juich) ? a.juich : 'knie' };
    return uit.huid || uit.haar || uit.shirt || uit.nummer ? uit : null;
  }
  function schoonThema(t) {
    if (!t || typeof t !== 'object') return null;
    const kl = (v) => (typeof v === 'string' && HEX.test(v) ? v : null);
    const g = Array.isArray(t.gras) ? [kl(t.gras[0]), kl(t.gras[1])] : [null, null];
    const uit = { tribune: kl(t.tribune), gras: g[0] && g[1] ? g : null, veld: klem(parseInt(t.veld, 10) || 0, 0, 2) };
    return uit.tribune || uit.gras || uit.veld ? uit : null;
  }
  function kaart(k, standaardVak, standaardCijfer) {
    k = k || {};
    const n = parseFloat(String(k.cijfer == null ? standaardCijfer : k.cijfer).replace(',', '.'));
    const g = Number.isFinite(n) ? Math.round(klem(n, 1, 10) * 10) / 10 : standaardCijfer;
    const t = parseInt(k.tier, 10);
    return {
      vak: String(k.vak || standaardVak).slice(0, 24),
      cijfer: g,
      tekst: g.toFixed(1).replace('.', ','),
      tier: Number.isFinite(t) ? klem(t, 0, 4) : tierVan(g),
      trede: klem(parseInt(k.trede, 10) || 0, 0, 4),
      vloek: k.vloek === true || k.vloek === 'true' || k.vloek === '1' || k.vloek === 1,
      av: schoonAv(k.av),
    };
  }
  function maakInvoer(o) {
    o = o || {};
    const uitkomst = ['goal', 'redding', 'paal', 'over'].includes(o.uitkomst) ? o.uitkomst : 'goal';
    let r = String(o.richting || 'links').toLowerCase();
    let hoogte = String(o.hoogte || '').toLowerCase();
    if (/hoog/.test(r)) hoogte = hoogte || 'hoog';
    if (/laag/.test(r)) hoogte = hoogte || 'laag';
    const richting = /rechts/.test(r) ? 'rechts' : /midden/.test(r) ? 'midden' : 'links';
    const kr = parseFloat(o.kracht);
    return {
      schutter: kaart(o.schutter, 'Wiskunde', 8.6),
      keeper: kaart(o.keeper, 'Engels', 6.2),
      thema: schoonThema(o.thema),
      uitkomst,
      richting,
      hoogte: hoogte === 'hoog' ? 'hoog' : 'laag',
      kracht: Number.isFinite(kr) ? klem(kr, 0, 1) : 0.75,
      stil: !!o.stil,
      debug: !!o.debug,
      laag: !!o.laag,
    };
  }

  // ═════════════════════════ Tijdlijn ═════════════════════════
  // s = speltijd (seconden van de actie, 0 = begin van de aanloop); t = echte tijd van de film.
  function maakTijdlijn(inv) {
    const KS = 1.6; // het moment van de trap
    const Tf = mix(0.66, 0.44, inv.kracht); // vluchttijd tot de doellijn
    const sI = KS + Tf; // de inslag (doel, handen, paal of over de lat)
    const T4 = 6.3; // begin van de aanloop in echte tijd
    // stukken met een eigen snelheid (slow-motion rond het schot)
    const segs = [
      { s0: 0, v: 1 },
      { s0: 1.32, v: 0.26 },
      { s0: sI + 0.28, v: 0.55 },
      { s0: sI + 0.7, v: 1 },
    ];
    let t = T4;
    for (let i = 0; i < segs.length; i++) {
      segs[i].t0 = t;
      if (i + 1 < segs.length) t += (segs[i + 1].s0 - segs[i].s0) / segs[i].v;
    }
    const tVan = (s) => {
      let k = 0;
      while (k + 1 < segs.length && s >= segs[k + 1].s0) k++;
      return segs[k].t0 + (s - segs[k].s0) / segs[k].v;
    };
    const sVan = (tt) => {
      if (tt < T4) return tt - T4;
      let k = 0;
      while (k + 1 < segs.length && tt >= segs[k + 1].t0) k++;
      return segs[k].s0 + (tt - segs[k].t0) * segs[k].v;
    };
    const tKick = tVan(KS);
    const tZij = tVan(1.32);
    const tDoelcam = tVan(KS + 0.16);
    const tI = tVan(sI);
    const tReactie = tVan(sI + 0.62);
    const tR = tReactie + 3.4; // herhaling
    const RS0 = KS - 0.7; // de herhaling speelt de speltijd van RS0 tot RS1, op RV keer de snelheid
    const RS1 = sI + 0.55;
    const RV = 0.5;
    const tRE = tR + (RS1 - RS0) / RV;
    const EIND = tRE + 2.6;
    return { KS, Tf, sI, T4, tVan, sVan, tKick, tZij, tDoelcam, tI, tReactie, tR, RS0, RS1, RV, tRE, EIND, tS2: 2.4, tS3a: 4.3, tS3b: 5.3 };
  }

  // ═════════════════════════ Skelet en houdingen ═════════════════════════
  // Gewrichten (18 per speler): 0 bekken, 1 borst, 2 nek, 3 hoofd, 4-6 schouder/elleboog/hand links, 7-9 rechts,
  // 10-13 heup/knie/enkel/teen links, 14-17 rechts. Lokaal: x = rechts (de trapvoet), y = omhoog, z = vooruit.
  const NJ = 18;
  const STAND = {
    x: 0, z: 0, ph: 0.98, yaw: 0, roll: 0, pitch: 0, lean: 0.04, headP: 0, twist: 0,
    hL: [0.02, 0.07], kL: 0.06, fL: 0, hR: [0.02, 0.07], kR: 0.06, fR: 0,
    sL: [0.05, 0.16], eL: 0.2, sR: [0.05, 0.16], eR: 0.2, grond: 1, eAL: null, eAR: null,
  };
  const houding = (o) => Object.assign({}, STAND, o, {
    hL: (o && o.hL) || STAND.hL, hR: (o && o.hR) || STAND.hR, sL: (o && o.sL) || STAND.sL, sR: (o && o.sR) || STAND.sR,
  });
  function meng(a, b, p) {
    if (p <= 0) return a;
    if (p >= 1) return b;
    const u = {};
    for (const k in a) {
      const x = a[k], y = b[k];
      if (k === 'eAL' || k === 'eAR') {
        // een eigen onderarmstand mengt met de stand van de bovenarm
        const za = k === 'eAL' ? 'sL' : 'sR';
        const xa = x == null ? a[za][1] : x, ya = y == null ? b[za][1] : y;
        u[k] = x == null && y == null ? null : mix(xa, ya, p);
      } else u[k] = Array.isArray(x) ? [mix(x[0], y[0], p), mix(x[1], y[1], p)] : mix(x, y, p);
    }
    return u;
  }
  // sleutelbeelden [[s, houding], ...] met vloeiende overgangen
  function spoor(keys, s) {
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 0; i + 1 < keys.length; i++) {
      if (s < keys[i + 1][0]) return meng(keys[i][1], keys[i + 1][1], glad((s - keys[i][0]) / (keys[i + 1][0] - keys[i][0])));
    }
    return keys[keys.length - 1][1];
  }
  const flexRicht = (f) => [0, -Math.cos(f), Math.sin(f)];
  // eerst zijwaarts (abductie, altijd naar buiten), dan naar voren (flexie)
  const ledRicht = (f, a, zij) => rotX([zij * Math.sin(a), -Math.cos(a), 0], -f);

  // Van houding naar 18 gewrichten in de wereld.
  function skelet(h) {
    const J = new Array(NJ);
    const romp = (v) => rotY(rotX(v, h.lean), h.twist);
    J[0] = [0, 0, 0];
    J[1] = romp([0, 0.3, 0]);
    J[2] = romp([0, 0.54, 0]);
    J[3] = plus(J[2], rotY(rotX([0, 0.138, 0.012], h.lean + h.headP), h.twist));
    const arm = (zij, s, e, eA, i0) => {
      const sch = romp([zij * 0.19, 0.47, 0]);
      const boven = romp(ledRicht(s[0], s[1], zij));
      // de onderarm volgt de bovenarm, of heeft een eigen zijwaartse stand (eA, bv. handen op het hoofd)
      const onder = romp(ledRicht(s[0] + e, eA == null ? s[1] : eA, zij));
      J[i0] = sch;
      J[i0 + 1] = plus(sch, keer(boven, 0.29));
      J[i0 + 2] = plus(J[i0 + 1], keer(onder, 0.27));
    };
    arm(-1, h.sL, h.eL, h.eAL, 4);
    arm(1, h.sR, h.eR, h.eAR, 7);
    const been = (zij, hp, kn, vo, i0) => {
      const heup = [zij * 0.1, -0.03, 0];
      const dij = ledRicht(hp[0], hp[1], zij);
      const scheen = ledRicht(hp[0] - kn, hp[1], zij);
      J[i0] = heup;
      J[i0 + 1] = plus(heup, keer(dij, 0.45));
      J[i0 + 2] = plus(J[i0 + 1], keer(scheen, 0.44));
      J[i0 + 3] = plus(J[i0 + 2], keer(ledRicht(hp[0] - kn + 1.42 - vo, hp[1], zij), 0.2));
    };
    been(-1, h.hL, h.kL, h.fL, 10);
    been(1, h.hR, h.kR, h.fR, 14);
    // naar de wereld: draai om het bekken (pitch, roll, yaw), dan verplaatsen
    let ph = h.ph;
    const W = J.map((p) => rotY(rotZ(rotX(p, h.pitch), h.roll), h.yaw));
    if (h.grond > 0) {
      const laagste = Math.min(W[12][1], W[16][1], W[13][1] + 0.02, W[17][1] + 0.02);
      ph = mix(ph, 0.075 - laagste, h.grond);
    }
    return W.map((p) => [p[0] + h.x, p[1] + ph, p[2] + h.z]);
  }

  // ── de schutter ──
  const SCH_START = [1.75, 14.3];
  const SCH_TRAP = [0.2, 11.42]; // het bekken op het moment van de trap
  function schutterHouding(s, tl, inv) {
    const KS = tl.KS;
    const d = s - KS;
    // ── voor de aanloop: rustig staan, ademen, het hoofd zakt en komt omhoog ──
    const kijk = Math.atan2(-SCH_START[0] * 0.25, -1) + Math.PI * 0; // bijna recht op het doel
    const yawStart = Math.PI + Math.atan2(SCH_START[0] - 0.0, SCH_START[1] - 11) * -0.35;
    const adem = Math.sin(s * 2.1) * 0.015;
    const idle = houding({
      x: SCH_START[0], z: SCH_START[1], yaw: yawStart, lean: 0.06 + adem, headP: -0.05 + 0.18 * sm(s, -2.6, -2.0) * (1 - sm(s, -1.3, -0.8)),
      sL: [0.12, 0.22], eL: 0.35, sR: [0.12, 0.22], eR: 0.35, hL: [0.02, 0.1], hR: [0.0, 0.1], kL: 0.08, kR: 0.08,
    });
    if (d < -0.38) {
      if (s <= 0) return idle;
      // ── de aanloop: versnellen van stilstand, pas op het ritme ──
      const u = klem(s / (KS - 0.38), 0, 1);
      const vord = easeIn(u) * 0.55 + u * 0.45;
      const x = mix(SCH_START[0], SCH_TRAP[0] + 0.35, vord);
      const z = mix(SCH_START[1], SCH_TRAP[1] + 0.85, vord);
      const fase = 2 * Math.PI * (0.9 * s + 0.9 * s * s);
      const sn = Math.sin(fase);
      const zw = klem(s / 0.35, 0, 1); // de eerste pas zet in
      const loop = houding({
        // het bekken draait mee met het voorste been, de romp en armen draaien tegen
        x, z, yaw: mix(yawStart, Math.PI - 0.32, sm(s, 0, 0.5)) + 0.09 * sn * zw, twist: -0.2 * sn * zw, roll: 0.035 * Math.cos(fase) * zw, lean: 0.18 * zw + 0.06, headP: -0.1,
        hL: [0.1 + 0.62 * sn * zw, 0.05], kL: 0.25 + 0.95 * zw * Math.max(0, Math.sin(fase - 2.0)) + 0.15 * zw,
        hR: [0.1 - 0.62 * sn * zw, 0.05], kR: 0.25 + 0.95 * zw * Math.max(0, Math.sin(fase + Math.PI - 2.0)) + 0.15 * zw,
        fL: 0.3 * zw, fR: 0.3 * zw,
        sL: [-0.75 * sn * zw + 0.1, 0.18], eL: 1.3, sR: [0.75 * sn * zw + 0.1, 0.18], eR: 1.3,
      });
      return meng(idle, loop, sm(s, 0, 0.12));
    }
    // ── laatste pas, standbeen, trap en uitzwaai ──
    const P = (x, z, o) => houding(Object.assign({ x, z, yaw: Math.PI - 0.12 }, o));
    const keys = [
      [-0.38, P(SCH_TRAP[0] + 0.3, SCH_TRAP[1] + 0.72, { lean: 0.2, hL: [0.55, 0.05], kL: 0.35, hR: [-0.45, 0.05], kR: 0.9, fR: 0.4, sL: [0.4, 0.5], eL: 1.0, sR: [-0.5, 0.25], eR: 1.1, yaw: Math.PI - 0.3 })],
      [-0.13, P(SCH_TRAP[0] + 0.08, SCH_TRAP[1] + 0.22, { lean: 0.02, roll: -0.12, hL: [0.3, 0.1], kL: 0.3, hR: [-0.85, 0.1], kR: 1.75, fR: 0.7, sL: [0.35, 1.3], eL: 0.4, sR: [-0.55, 0.55], eR: 0.6, headP: 0.25, yaw: Math.PI + 0.06, twist: -0.24 })],
      [0, P(SCH_TRAP[0], SCH_TRAP[1], { lean: 0.22, roll: -0.08, hL: [0.15, 0.08], kL: 0.4, hR: [0.4, -0.06], kR: 0.3, fR: 1.0, sL: [0.2, 1.4], eL: 0.3, sR: [-0.4, 0.75], eR: 0.5, headP: 0.35, twist: -0.05 })],
      [0.12, P(SCH_TRAP[0] - 0.05, SCH_TRAP[1] - 0.25, { lean: 0.08, roll: -0.05, hL: [0.0, 0.08], kL: 0.25, hR: [1.25, -0.05], kR: 0.2, fR: 0.9, sL: [-0.1, 1.1], eL: 0.5, sR: [0.35, 0.6], eR: 0.6, headP: 0.1, yaw: Math.PI - 0.28, twist: 0.2 })],
      [0.36, P(SCH_TRAP[0] - 0.1, SCH_TRAP[1] - 0.7, { lean: 0.12, hL: [-0.35, 0.06], kL: 0.7, hR: [0.35, 0.06], kR: 0.35, sL: [0.3, 0.5], eL: 0.9, sR: [-0.2, 0.4], eR: 0.9, headP: -0.05 })],
      [0.7, P(SCH_TRAP[0] - 0.12, SCH_TRAP[1] - 1.05, { lean: 0.05, hL: [0.05, 0.08], kL: 0.12, hR: [0.08, 0.08], kR: 0.12, sL: [0.1, 0.25], eL: 0.6, sR: [0.1, 0.25], eR: 0.6, headP: -0.12 })],
    ];
    let h = spoor(keys, d);
    // ── reactie na de inslag ──
    const r = s - tl.sI;
    if (inv.uitkomst === 'goal') {
      // wegdraaien, een paar passen naar de camera, knieschuiver met de armen omhoog
      const basis = keys[keys.length - 1][1];
      const doel = [-2.6, SCH_TRAP[1] + 1.4];
      const u = sm(r, 0.25, 1.35);
      const fase = 2 * Math.PI * 1.9 * r;
      const sn = Math.sin(fase);
      const loop = houding({
        x: mix(basis.x, doel[0], u), z: mix(basis.z, doel[1], u), yaw: mix(Math.PI, -0.5, sm(r, 0.1, 0.55)), lean: 0.2,
        hL: [0.1 + 0.6 * sn, 0.05], kL: 0.3 + 0.9 * Math.max(0, Math.sin(fase - 2)), hR: [0.1 - 0.6 * sn, 0.05], kR: 0.3 + 0.9 * Math.max(0, Math.sin(fase + Math.PI - 2)),
        sL: [2.3 + 0.3 * sn, 0.5], eL: 0.3, sR: [2.3 - 0.3 * sn, 0.5], eR: 0.3, headP: -0.2, fL: 0.3, fR: 0.3,
      });
      const glij = sm(r, 1.35, 2.6);
      const zs = doel[1] + 0.2 + 2.4 * easeOut(ramp(r, 1.35, 2.7));
      const xs = doel[0] - 1.0 * easeOut(ramp(r, 1.35, 2.7));
      const pomp = Math.sin(r * 9) * 0.12 * sm(r, 2.4, 2.8);
      const knie = houding({
        x: xs, z: zs, yaw: -0.5, ph: 0.6, grond: 0, lean: -0.42, pitch: 0, headP: -0.45,
        hL: [0.15, 0.22], kL: 1.75, hR: [0.15, 0.22], kR: 1.75, fL: -0.3, fR: -0.3,
        sL: [2.55 + pomp, 0.62], eL: 0.25 + pomp, sR: [2.55 - pomp, 0.62], eR: 0.25 - pomp,
      });
      const stijl = inv.schutter.av ? inv.schutter.av.juich : 'knie';
      const eind = stijl === 'knie' ? knie : juichHouding(stijl, xs, zs, r);
      if (r > 0.1) h = meng(meng(h, loop, sm(r, 0.1, 0.45)), eind, glij);
    } else {
      // handen op het hoofd, daarna gebukt met de handen op de knieën
      const kop = houding({
        x: h.x, z: h.z + 0.05, yaw: Math.PI - 0.1, lean: 0.18, headP: -0.25,
        sL: [0.2, 2.45], eL: 0.2, eAL: -1.85, sR: [0.2, 2.45], eR: 0.2, eAR: -1.85, hL: [0.05, 0.1], kL: 0.1, hR: [0.02, 0.1], kR: 0.1,
      });
      const buk = houding({
        x: h.x + 0.05, z: h.z + 0.1, yaw: Math.PI + 0.25, lean: 0.75, headP: -0.2, hL: [0.55, 0.12], kL: 0.55, hR: [0.55, 0.12], kR: 0.55,
        sL: [0.75, 0.25], eL: 0.15, sR: [0.75, 0.25], eR: 0.15,
      });
      if (r > 0.1) h = meng(meng(h, kop, sm(r, 0.1, 0.55)), buk, sm(r, 2.1, 2.8));
    }
    return h;
  }

  // De juichstijlen van de eigen voetballer na een goal (x, z: waar hij staat; r: seconden sinds de inslag).
  function juichHouding(stijl, x, z, r) {
    const basis = { x, z, yaw: -0.5, headP: -0.05, lean: -0.05, hL: [0.05, 0.14], kL: 0.08, hR: [0.05, 0.14], kR: 0.08 };
    const wiebel = Math.sin(r * 9);
    if (stijl === 'armen') return houding(Object.assign(basis, { sL: [2.85, 0.45], eL: 0.2, sR: [2.85, 0.45], eR: 0.2, ph: 0.98 + 0.05 * Math.abs(wiebel) }));
    if (stijl === 'wijd') return houding(Object.assign(basis, { sL: [0.15, 1.55], eL: 0.05, sR: [0.15, 1.55], eR: 0.05, roll: 0.12 * Math.sin(r * 3), lean: 0.12 }));
    if (stijl === 'vuist') return houding(Object.assign(basis, { sL: [0.05, 0.2], eL: 0.4, sR: [2.95, 0.15], eR: 0.15, ph: 0.98 + 0.08 * Math.max(0, wiebel) }));
    if (stijl === 'dans') return houding(Object.assign(basis, { sL: [2.2 + 0.6 * wiebel, 0.5], eL: 0.4, sR: [1.0 - 0.6 * wiebel, 0.5], eR: 0.4, hL: [0.1 + 0.3 * Math.max(0, wiebel), 0.14], hR: [0.1 + 0.3 * Math.max(0, -wiebel), 0.14], twist: 0.35 * wiebel, ph: 0.98 + 0.04 * Math.abs(wiebel) }));
    // salto: een sprong met een rondje om de dwarsas
    const u = klem((r - 1.7) / 0.9, 0, 1);
    return houding(Object.assign(basis, { pitch: -2 * Math.PI * glad(u), grond: 1 - sm(u, 0.05, 0.2) * (1 - sm(u, 0.8, 0.95)), ph: 0.98 + 0.9 * 4 * u * (1 - u), hL: [1.1, 0.15], kL: 1.6, hR: [1.1, 0.15], kR: 1.6, sL: [2.2, 0.3], eL: 0.2, sR: [2.2, 0.3], eR: 0.2 }));
  }

  // ── de keeper ──
  function keeperPlan(tl, inv) {
    const side = inv.richting === 'links' ? -1 : inv.richting === 'rechts' ? 1 : 0;
    let dk;
    if (inv.uitkomst === 'goal') dk = side === 0 ? 1 : -side; // de verkeerde kant
    else if (inv.uitkomst === 'redding') dk = side;
    else dk = side === 0 ? -1 : side; // paal of over: de goede kant, maar hij komt er niet bij
    const hoog = inv.hoogte === 'hoog';
    // bij een redding zijn de handen op het moment van de inslag ~75% uitgestrekt
    const duur = 0.58;
    const sD0 = inv.uitkomst === 'redding' ? tl.sI - 0.72 * duur : tl.KS - 0.04;
    return { dk, hoog, duur, sD0, sLand: sD0 + duur };
  }
  function keeperHouding(s, tl, inv, plan) {
    const { dk, hoog, duur, sD0 } = plan;
    const wieg = Math.sin(s * 1.9) * (1 - sm(s, tl.KS - 0.5, tl.KS - 0.2));
    const veer = Math.abs(Math.sin(s * 3.8)) * 0.03;
    const klaar = houding({
      x: 0.18 * wieg, z: 0.35, ph: 0.82, yaw: 0.06 * wieg, lean: 0.38, headP: -0.38,
      hL: [0.5, 0.26 + 0.05 * wieg], kL: 0.75 + veer * 3, hR: [0.5, 0.26 - 0.05 * wieg], kR: 0.75 + veer * 3,
      sL: [0.42, 0.6], eL: 0.75, sR: [0.42, 0.6], eR: 0.75, fL: -0.1, fR: -0.1,
    });
    if (s < sD0) return klaar;
    const p = (s - sD0) / duur;
    let h;
    if (dk === 0) {
      // recht omhoog of door de knieën
      const piek = hoog ? 0.55 : 0;
      const sp = houding({
        x: 0, z: 0.4, ph: mix(0.82, hoog ? 1.0 : 0.62, sm(p, 0, 0.4)), grond: hoog ? 0 : 1, lean: hoog ? 0.05 : 0.5, headP: -0.2,
        hL: [hoog ? 0.25 : 0.9, 0.2], kL: hoog ? 0.6 : 1.4, hR: [hoog ? 0.25 : 0.9, 0.2], kR: hoog ? 0.6 : 1.4,
        sL: [hoog ? 2.9 : 1.2, 0.2], eL: 0.25, sR: [hoog ? 2.9 : 1.2, 0.2], eR: 0.25,
      });
      sp.ph += piek * 4 * klem(p, 0, 1) * (1 - klem(p, 0, 1)) * 0.6;
      h = meng(klaar, sp, sm(p, 0, 0.35));
    } else {
      // de duik: het bekken in een boog opzij, het lichaam kantelt naar de bal, de armen gestrekt boven het hoofd
      const pe = easeOut(klem(p, 0, 1));
      const top = hoog ? 0.62 : 0.2;
      const ph = mix(0.82, 0.24, klem(p, 0, 1)) + 4 * top * klem(p, 0, 1) * (1 - klem(p, 0, 1));
      const duikH = houding({
        x: dk * (0.25 + 1.75 * pe), z: 0.35 + 0.15 * pe, ph, grond: 0, yaw: 0, roll: -dk * mix(0.2, hoog ? 1.32 : 1.48, sm(p, 0, 0.55)),
        lean: 0.12, headP: -0.05, pitch: 0.05,
        hL: [0.25, dk > 0 ? 0.1 : 0.4], kL: 0.55, hR: [0.25, dk > 0 ? 0.4 : 0.1], kR: 0.55,
        sL: [2.95, 0.12], eL: 0.12, sR: [2.95, 0.12], eR: 0.12,
      });
      const afzet = houding(Object.assign({}, klaar, { x: 0.1 * dk, ph: 0.72, lean: 0.3, hL: [0.6, 0.35], kL: 0.95, hR: [0.6, 0.35], kR: 0.95 }));
      h = p < 0.12 ? meng(klaar, afzet, p / 0.12) : meng(afzet, duikH, sm(p, 0.12, 0.42));
      // na de landing: op de grond, armen iets ingetrokken (bij een redding de bal tegen de borst)
      const lig = Object.assign({}, duikH, { ph: 0.24, roll: -dk * 1.5, sL: [redGreep(inv) ? 1.6 : 2.6, 0.2], eL: redGreep(inv) ? 1.3 : 0.4, sR: [redGreep(inv) ? 1.6 : 2.6, 0.2], eR: redGreep(inv) ? 1.3 : 0.4, hL: [0.6, 0.2], kL: 1.0, hR: [0.4, 0.2], kR: 0.8 });
      h = meng(h, lig, sm(p, 1.0, 1.45));
    }
    // ── reactie ──
    const r = s - plan.sLand;
    if (inv.uitkomst === 'redding') {
      // opstaan en juichen met de bal omhoog
      const sta = houding({ x: h.x * 0.85, z: 0.9, yaw: 0.25 * -dk, lean: -0.1, headP: -0.3, sL: [2.85, 0.35], eL: 0.2, sR: [2.85, 0.35], eR: 0.2, hL: [0.05, 0.14], kL: 0.08, hR: [0.05, 0.14], kR: 0.08 });
      h = meng(h, sta, sm(r, 0.9, 1.7));
    } else if (inv.uitkomst === 'goal') {
      // op de knieën, hoofd omlaag
      const kniel = houding({ x: h.x * 0.8, z: 0.4, yaw: -dk * 0.6, ph: 0.55, grond: 0, lean: 0.35, headP: -0.5, hL: [0.1, 0.15], kL: 1.65, hR: [0.1, 0.15], kR: 1.65, fL: -0.3, fR: -0.3, sL: [0.2, 0.2], eL: 0.3, sR: [0.2, 0.2], eR: 0.3 });
      h = meng(h, kniel, sm(r, 1.0, 1.9));
    } else {
      // opstaan, opgelucht: armen wijd
      const sta = houding({ x: h.x * 0.8, z: 0.7, yaw: -dk * 0.4, lean: 0.05, headP: -0.1, sL: [0.6, 1.1], eL: 0.3, sR: [0.6, 1.1], eR: 0.3 });
      h = meng(h, sta, sm(r, 1.1, 1.9));
    }
    return h;
  }
  const redGreep = (inv) => inv.uitkomst === 'redding';

  // ═════════════════════════ De bal ═════════════════════════
  const BAL_R = 0.11;
  const STIP = [0, BAL_R, 11];
  function balPlan(tl, inv, plan, kpHanden) {
    const side = inv.richting === 'links' ? -1 : inv.richting === 'rechts' ? 1 : 0;
    const hoog = inv.hoogte === 'hoog';
    let E;
    if (inv.uitkomst === 'redding') E = kpHanden;
    else if (inv.uitkomst === 'paal') E = side === 0 ? [0.4, 2.44 - 0.02, 0] : [side * (3.66 - 0.12), hoog ? 1.75 : 0.55, 0];
    else if (inv.uitkomst === 'over') E = [side * 1.8, 2.44 + 0.75 + 0.3 * inv.kracht, 0];
    else E = [side === 0 ? 0.25 : side * 2.75, hoog ? 1.9 : 0.42, 0];
    const boog = 0.32 + 0.35 * (1 - inv.kracht) + (hoog ? 0.2 : 0);
    const krul = side * 0.35;
    return { E, boog, krul, side };
  }
  // positie op de vlucht (u: 0..1)
  function vlucht(bp, u) {
    const b = 4 * u * (1 - u);
    return [mix(STIP[0], bp.E[0], u) + bp.krul * b * 0.5, mix(STIP[1], bp.E[1], u) + bp.boog * b, mix(STIP[2], bp.E[2], u)];
  }
  function balStaat(s, tl, inv, bp, kpSkelet) {
    if (s < tl.KS) return { p: STIP.slice(), spin: 0, net: 0, raak: 0 };
    const u = (s - tl.KS) / tl.Tf;
    if (u <= 1) return { p: vlucht(bp, u), spin: (s - tl.KS) * 32, net: 0, raak: 0 };
    const d = s - tl.sI;
    const v = keer(min3(vlucht(bp, 1), vlucht(bp, 0.98)), 1 / (0.02 * tl.Tf));
    if (inv.uitkomst === 'goal') {
      // het net vangt de bal: afremmen over ~1,9 m, dan valt hij naar beneden
      const sp = lengte(v);
      const L = 1.75 + (bp.E[1] > 1.2 ? 0.1 : 0);
      const tau = L / sp;
      const a = 1 - Math.exp(-d / tau);
      let p = plus(bp.E, keer(v, tau * a));
      const val = Math.max(0, d - 0.12);
      const y = Math.max(BAL_R, p[1] - 4.9 * val * val);
      // terugveren van het net
      const veer = 0.35 * Math.sin(Math.min(d, 1.2) * 7) * Math.exp(-d * 3) * sm(d, 0.1, 0.25);
      p = [p[0], y, p[2] + veer];
      return { p, spin: 32 * tl.Tf + 10 * a, net: a, raak: d };
    }
    if (inv.uitkomst === 'redding') {
      // de bal blijft tussen de handen
      const m = keer(plus(kpSkelet[6], kpSkelet[9]), 0.5);
      const voor = norm(min3(m, keer(plus(kpSkelet[5], kpSkelet[8]), 0.5)));
      return { p: plus(m, keer(voor, 0.07)), spin: 32 * tl.Tf, net: 0, raak: d };
    }
    // paal of over: een ballistische baan (met stuiters bij de paal)
    let vv;
    if (inv.uitkomst === 'paal') vv = bp.side === 0 ? [0.8, 4.2, 6.5] : [bp.side * 2.6, 2.2, 7.5];
    else vv = [v[0] * 0.9, v[1] + 1.5, v[2] * 0.9];
    let p = bp.E.slice();
    let vel = vv.slice();
    let rest = d;
    // stuiteren (analytisch per stuk)
    for (let k = 0; k < 5 && rest > 0; k++) {
      const y0 = p[1] - BAL_R;
      const disc = vel[1] * vel[1] + 2 * 9.8 * y0;
      const tg = (vel[1] + Math.sqrt(Math.max(disc, 0))) / 9.8;
      if (rest < tg || inv.uitkomst === 'over') {
        p = [p[0] + vel[0] * rest, p[1] + vel[1] * rest - 4.9 * rest * rest, p[2] + vel[2] * rest];
        rest = 0;
        break;
      }
      p = [p[0] + vel[0] * tg, BAL_R, p[2] + vel[2] * tg];
      vel = [vel[0] * 0.8, -(vel[1] - 9.8 * tg) * 0.55, vel[2] * 0.8];
      rest -= tg;
    }
    return { p, spin: 32 * tl.Tf - d * 20, net: 0, raak: d };
  }

  // ═════════════════════════ De hele toestand op speltijd s ═════════════════════════
  function maakWereld(inv) {
    const tl = maakTijdlijn(inv);
    const plan = keeperPlan(tl, inv);
    const kpI = skelet(keeperHouding(tl.sI, tl, inv, plan));
    const handen = plus(keer(plus(kpI[6], kpI[9]), 0.5), [0, 0, 0.12]);
    const bp = balPlan(tl, inv, plan, handen);
    function staat(s) {
      const sch = skelet(schutterHouding(s, tl, inv));
      const kp = skelet(keeperHouding(s, tl, inv, plan));
      const bal = balStaat(s, tl, inv, bp, kp);
      const spoor = [];
      for (let k = 1; k <= 7; k++) spoor.push(s - k * 0.022 >= tl.KS ? balStaat(s - k * 0.022, tl, inv, bp, kp).p : bal.p);
      return { s, sch, kp, bal, spoor };
    }
    return { tl, plan, bp, staat };
  }

  // ═════════════════════════ Regie: de camera op echte tijd t ═════════════════════════
  // geeft { pos, doel, fov (graden), roll, schud, shot, replay, s }
  function camera(t, W, inv) {
    const tl = W.tl;
    const hand = (k, a) => [ruis(t * 0.7 + k) * a, ruis(t * 0.6 + k + 7) * a * 0.7, 0];
    let s, shot, pos, doel, fov, roll = 0, replay = false;
    if (t >= tl.tR && t < tl.tRE) {
      replay = true;
      s = tl.RS0 + (t - tl.tR) * tl.RV;
    } else s = tl.sVan(t);
    const S = W.staat(s);
    const sch = S.sch, kp = S.kp;
    if (replay) {
      // de herhaling: hoog en schuin achter het doel, aan de andere kant; de camera volgt de bal
      shot = 7;
      const u = ramp(t, tl.tR, tl.tRE);
      const zij = W.bp.side >= 0 ? -1 : 1;
      pos = [zij * mix(6.5, 5.2, u), mix(3.6, 3.0, u), mix(-6.5, -5.4, u)];
      const bal = S.bal.p;
      doel = lerp3([0, 0.8, 7.5], [bal[0] * 0.5, mix(0.9, bal[1], 0.4), mix(7, bal[2], 0.55)], sm(s, tl.KS - 0.1, tl.sI));
      fov = mix(30, 26, u);
    } else if (t < tl.tS2) {
      // (1) breed stadion: hoge kraan die langzaam zakt en indraait
      shot = 1;
      const u = glad(ramp(t, 0, tl.tS2));
      pos = [mix(17, 12.5, u), mix(10.5, 7.2, u), mix(33, 26.5, u)];
      doel = [mix(1.5, 0.6, u), mix(1.6, 1.4, u), mix(5, 6, u)];
      fov = 40;
    } else if (t < tl.tS3a) {
      // (2) achter de schutter: over zijn schouder op het doel
      shot = 2;
      const u = glad(ramp(t, tl.tS2, tl.tS3a));
      const r = sch[0];
      pos = plus([r[0] + 0.55, 1.5, r[2] + mix(3.4, 2.7, u)], hand(1, 0.03));
      doel = [mix(0.4, 0.25, u), 1.15, 0];
      fov = mix(34, 30, u);
    } else if (t < tl.tS3b) {
      // (3a) close-up van de schutter: van voren en laag, het licht van achteren
      shot = 3;
      const u = glad(ramp(t, tl.tS3a, tl.tS3b));
      const hd = sch[3];
      pos = plus([hd[0] - 0.45, hd[1] - 0.12, hd[2] - mix(1.55, 1.25, u)], hand(2, 0.012));
      doel = [hd[0] - 0.05, hd[1] - 0.04, hd[2]];
      fov = 28;
    } else if (t < tl.T4) {
      // (3b) close-up van de keeper: op ooghoogte, iets van opzij
      shot = 4;
      const u = glad(ramp(t, tl.tS3b, tl.T4));
      const hd = kp[3];
      pos = plus([hd[0] + 0.55, hd[1] + 0.02, hd[2] + mix(2.0, 1.6, u)], hand(3, 0.012));
      doel = [hd[0] + 0.05, hd[1] - 0.08, hd[2]];
      fov = 30;
    } else if (t < tl.tZij) {
      // (4a) de aanloop: laag en meeschuivend, schuin achter de schutter
      shot = 5;
      const r = sch[0];
      pos = plus([r[0] + 2.4, 0.95, r[2] + 2.6], hand(4, 0.02));
      doel = lerp3([r[0], 0.9, r[2] - 2], [0, 0.6, 9.5], 0.5);
      fov = 38;
    } else if (t < tl.tDoelcam) {
      // (4b) het schot in slow-motion vanaf de zijkant, op graskijkhoogte
      shot = 6;
      const u = ramp(t, tl.tZij, tl.tDoelcam);
      pos = [-5.4 + 0.35 * u, 0.7, 11.6 - 0.3 * u];
      doel = [0.15, 0.85, mix(11.2, 10.8, glad(u))];
      fov = 34;
    } else if (t < tl.tReactie) {
      // (5) doelcamera achter het net, de bal komt op ons af
      shot = 8;
      const u = ramp(t, tl.tDoelcam, tl.tReactie);
      const E = W.bp.E;
      // recht achter het punt waar de bal het net raakt: de bal komt op ons af
      pos = [E[0] * 0.8, Math.max(0.7, E[1] * 0.8 + 0.35), -3.7 + 0.2 * u];
      doel = lerp3([E[0] * 0.3, 0.8, 7], [E[0] * 0.45, 0.75, 5], glad(u));
      fov = 42;
    } else if (t < tl.tR) {
      // (6) reactie: juichende schutter (goal), juichende keeper (redding) of baalende schutter
      shot = 9;
      const u = ramp(t, tl.tReactie, tl.tR);
      if (inv.uitkomst === 'redding') {
        const c = kp[1];
        pos = plus([c[0] + mix(1.6, 1.0, u), mix(1.0, 1.25, u), c[2] + mix(4.2, 3.2, u)], hand(5, 0.04));
        doel = [c[0], c[1] + 0.05, c[2]];
        fov = 34;
      } else if (inv.uitkomst === 'goal') {
        const c = sch[1];
        pos = plus([c[0] - 1.6, mix(0.8, 1.0, u), c[2] + mix(4.2, 3.4, u)], hand(5, 0.05));
        doel = [c[0] - 0.1, c[1] + 0.1, c[2]];
        fov = 36;
      } else {
        const c = sch[1];
        pos = plus([c[0] - 1.2, 1.35, c[2] - mix(3.2, 2.6, u)], hand(5, 0.03));
        doel = [c[0], c[1] + 0.05, c[2]];
        fov = 32;
      }
    } else {
      // (8) slot: breed vanaf de hoek, langzaam terug
      shot = 10;
      const u = glad(ramp(t, tl.tRE, tl.EIND));
      pos = [mix(-11, -13, u), mix(5.5, 7.0, u), mix(19, 22, u)];
      doel = [-0.5, 1.2, 7];
      fov = 38;
    }
    // schermschud bij een doelpunt (en heel licht bij de trap)
    let schud = 0;
    if (!replay) {
      if (inv.uitkomst === 'goal') schud += 0.9 * Math.exp(-Math.max(0, t - tl.tI) * 2.6) * (t > tl.tI ? 1 : 0);
      if (inv.uitkomst === 'paal') schud += 0.5 * Math.exp(-Math.max(0, t - tl.tI) * 4) * (t > tl.tI ? 1 : 0);
      schud += 0.25 * Math.exp(-Math.max(0, t - tl.tKick) * 6) * (t > tl.tKick ? 1 : 0);
    }
    return { pos, doel, fov, roll, schud, shot, replay, s, S };
  }

  // ═════════════════════════ GLSL ═════════════════════════
  const KOP = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
  const VS = `${KOP}
const vec2 P[3] = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
out vec2 vUv;
void main(){ vec2 p = P[gl_VertexID]; vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

  const FS_SCENE = `${KOP}
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uKw, uFlits, uLicht, uMist;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform float uTanF;
uniform vec3 uJ[36];
uniform vec3 uTB[6];
uniform vec3 uKit[6];      // per speler: shirt, broek, accent
uniform vec3 uRim[2];      // rim-licht per speler
uniform vec3 uHuid[2];     // huidskleur per speler
uniform vec3 uHaar[2];     // haarkleur per speler
uniform vec3 uGras[2];     // twee maaistroken (eigen stadion)
uniform vec4 uPubliek;     // eigen tribunekleur (w = 1 als hij gebruikt wordt)
uniform float uVeld;       // maaipatroon: 0 strepen, 1 ruiten, 2 diagonaal
uniform vec4 uBal;         // positie, zichtbaar
uniform mat3 uBalRot;
uniform vec3 uSpoor[7];
uniform vec4 uSpoorK;      // kleur, sterkte
uniform vec4 uNet;         // x, y van de inslag, uitbolling (m), golf-fase
uniform vec2 uMyth;        // mythisch/kosmisch-effect (0..1) van de schutter, keeper
uniform sampler2D uGetal;

#define PI 3.14159265
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17., 9.); a *= .5; } return s; }

// ── vormen ──
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdCapT(vec3 p, vec3 a, vec3 b, float ra, float rb){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - mix(ra, rb, h); }
float sdRBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }
float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }

// materialen: 1 shirt, 2 huid, 3 broek, 4 sok, 5 schoen, 6 handschoen, 7 haar, 8 oog, 9 zool
vec2 kies(vec2 a, float d, float m){ return d < a.x ? vec2(d, m) : a; }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
// ledemaat: taps toelopend met een spierbuik halverwege
float sdLid(vec3 p, vec3 a, vec3 b, float ra, float rb, float buik){
  vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h) - mix(ra, rb, h) - buik * 4. * h * (1. - h);
}
// assen van het hoofd (het kan kantelen ten opzichte van de romp)
void hoofdAssen(int i, out vec3 Rh, out vec3 Uh, out vec3 Fh){
  int o = i * 18;
  vec3 F = uTB[i * 3 + 2];
  Uh = normalize(uJ[o + 3] - uJ[o + 2]);
  Fh = normalize(F - Uh * dot(F, Uh));
  Rh = cross(Uh, Fh);
}
// assen van het bekken (volgt de heupen, niet de romp)
void bekkenAssen(int i, out vec3 Rp, out vec3 Up, out vec3 Fp){
  int o = i * 18;
  Rp = normalize(uJ[o + 14] - uJ[o + 10]);
  vec3 U = uTB[i * 3 + 1];
  Up = normalize(U - Rp * dot(U, Rp));
  Fp = cross(Rp, Up);
}

vec2 speler(vec3 p, int i){
  int o = i * 18;
  vec3 P0 = uJ[o], NK = uJ[o + 2], HD = uJ[o + 3];
  // grove begrenzing
  float bnd = length(p - P0) - 1.35;
  if (bnd > .25) return vec2(bnd, 0.);
  bool kp = i == 1;
  vec3 R = uTB[i * 3], U = uTB[i * 3 + 1], F = uTB[i * 3 + 2];
  vec3 Rp, Up, Fp; bekkenAssen(i, Rp, Up, Fp);
  vec3 q = p - P0;
  vec3 l = vec3(dot(q, R), dot(q, U), dot(q, F));
  vec3 lp = vec3(dot(q, Rp), dot(q, Up), dot(q, Fp));
  // ── romp: borstkas (V-vorm), taille en de zoom van het shirt over de broek ──
  float dT = sdCap(p, P0 + U * .02, NK - U * .02, .27);
  if (dT < .03) {
  dT = sdEll(l - vec3(0., .36, -.005), vec3(.152, .165, .1));
  dT = smin(dT, sdEll(l - vec3(0., .19, -.004), vec3(.13, .13, .088)), .06);
  dT = smin(dT, sdEll(l - vec3(0., .045, -.002), vec3(.152, .1, .108)), .05);
  dT = smin(dT, sdEll(vec3(abs(l.x), l.yz) - vec3(.065, .39, .035), vec3(.07, .055, .05)), .06); // borstspieren
  // nek-schouderlijn (trapezius) en schouderkoppen
  vec3 SL = uJ[o + 4], SR = uJ[o + 7];
  dT = smin(dT, sdCapT(p, NK - U * .015, SL + U * .01, .06, .052), .06);
  dT = smin(dT, sdCapT(p, NK - U * .015, SR + U * .01, .06, .052), .06);
  // kraag: een randje rond de hals
  vec3 kq = l - vec3(0., .515, .01);
  dT = smin(dT, length(vec2(length(kq.xz * vec2(1., 1.15)) - .058, kq.y)) - .012, .01);
  dT = max(dT, -max(length(l.xz * vec2(1., 1.15) - vec2(0., .012)) - .048, .49 - l.y)); // halsopening
  }
  // ── broek: om het bekken, met zitvlak; de pijpen komen bij de benen ──
  float dB = length(p - P0 + U * .04) - .25;
  if (dB < .03) {
  dB = sdEll(lp - vec3(0., -.04, -.008), vec3(.158, .118, .106));
  dB = smin(dB, sdEll(vec3(abs(lp.x), lp.yz) - vec3(.055, -.07, -.035), vec3(.08, .08, .07)), .05);
  }
  // ── armen ──
  float dS = dT, dHuid = 1e5, dHand = 1e5;
  for (int k = 0; k < 2; k++) {
    int a = o + 4 + k * 3;
    float zij = k == 0 ? -1. : 1.;
    vec3 S = uJ[a], E = uJ[a + 1], H = uJ[a + 2];
    if (min(sdCap(p, S, E, .1), sdCap(p, E, H, kp ? .28 : .2)) > min(min(dS, dHuid), dHand)) continue;
    // mouw (de keeper: tot de pols)
    vec3 mEind = kp ? H - (H - E) * .08 : mix(S, E, .46);
    float dM = kp ? smin(sdLid(p, S - (E - S) * .1, E, .066, .052, .006), sdCapT(p, E, mEind, .052, .045), .02)
                  : sdCapT(p, S - (E - S) * .1, mEind, .066, .059);
    dS = smin(dS, dM, .045);
    // bovenarm (biceps) en onderarm (dik bij de elleboog, smal bij de pols)
    float dArm = smin(sdLid(p, S, E, .052, .041, .007), sdLid(p, E, H, .043, .029, .005), .02);
    dHuid = min(dHuid, dArm);
    // de hand: handpalm, vier vingers en een duim (de keeper: grote handschoenen)
    float bh = length(p - H - (H - E) * .3) - (kp ? .19 : .13); bh = max(bh, .03);
    if (bh > .02) dHand = min(dHand, bh);
    else if (bh < min(dHand, min(dHuid, dS))) {
      vec3 ax = normalize(H - E);
      vec3 ref = abs(dot(ax, F)) > .92 ? U : F;
      vec3 hx = normalize(ref - ax * dot(ref, ax));
      vec3 pv = zij * cross(ax, hx); // naar de handpalm
      float g = kp ? 1.4 : 1.;
      vec3 c = H + ax * .045 * g;
      vec3 hl = vec3(dot(p - c, hx), dot(p - c, ax), dot(p - c, pv));
      float dh = sdEll(hl, vec3(.041, .05, .019) * g);
      float vr = .0092 * g;
      for (int v = 0; v < 4; v++) {
        float fv = float(v);
        float off = (.027 - .018 * fv) * g;
        float len = (v == 1 ? .085 : v == 3 ? .065 : .078) * g;
        vec3 b0 = H + ax * .085 * g + hx * off;
        float krul = kp ? .45 : .7;
        vec3 b1 = b0 + ax * len * .55 + pv * len * .1 * krul + hx * off * .15;
        vec3 b2 = b1 + ax * len * .3 + pv * len * .5 * krul;
        dh = smin(dh, min(sdCapT(p, b0, b1, vr * 1.05, vr), sdCapT(p, b1, b2, vr, vr * .85)), .008);
      }
      vec3 d0 = H + ax * .025 * g + hx * .032 * g + pv * .008;
      vec3 d1 = d0 + ax * .04 * g + hx * .022 * g + pv * .018 * g;
      dh = smin(dh, sdCapT(p, d0, d1, .014 * g, .01 * g), .012);
      if (kp) dh = smin(dh, sdCapT(p, H - ax * .03, H + ax * .03, .05, .052), .015); // manchet
      else dh = smin(dh, dArm, .015);
      dHand = min(dHand, dh);
    }
  }
  // ── benen ──
  float dSok = 1e5, dSchoen = 1e5, zool = 0.;
  for (int k = 0; k < 2; k++) {
    int a = o + 10 + k * 4;
    vec3 Hp = uJ[a], K = uJ[a + 1], A = uJ[a + 2], T = uJ[a + 3];
    float lb = min(min(sdCap(p, Hp, K, .13), sdCap(p, K, A, .085)), length(p - mix(A, T, .45)) - .18);
    if (lb > min(min(min(dS, dB), min(dHuid, dHand)), min(dSok, dSchoen))) continue;
    vec3 dDij = normalize(K - Hp), dSch = normalize(A - K);
    vec3 vf = Fp - dSch * dot(Fp, dSch);
    vf = length(vf) > .05 ? normalize(vf) : F;
    // dijbeen (met spierbuik), knie, scheen met kuit
    float dD = sdLid(p, Hp - dDij * .03, K, .082, .052, .01);
    float dO = smin(sdCapT(p, K, A, .049, .032), sdCapT(p, mix(K, A, .12) - vf * .018, mix(K, A, .62) - vf * .008, .05, .034), .035);
    dHuid = min(dHuid, smin(dD, dO, .03));
    // broekspijp: wijd, tot ~40% van het dijbeen
    float dP = sdCapT(p, Hp - dDij * .02 + Rp * (k == 0 ? -.008 : .008), mix(Hp, K, .4), .1, .097);
    dB = smin(dB, dP, .035);
    // kous: over de scheen tot net onder de knie, met een rand bovenaan
    vec3 kTop = mix(K, A, .14);
    float ds = max(dO - .005, -dot(p - kTop, dSch));
    ds = min(ds, max(sdCapT(p, kTop, kTop + dSch * .03, .056, .054), -dot(p - kTop, dSch)));
    dSok = min(dSok, ds);
    // voetbalschoen: hiel, wreef, neus; platte zool
    float bs = length(p - mix(A, T, .45)) - .18;
    if (bs > .02) dSchoen = min(dSchoen, bs);
    else if (bs < min(dSok, dSchoen)) {
      vec3 vF = normalize(T - A);
      vec3 vU = -dSch - vF * dot(-dSch, vF);
      vU = length(vU) > .05 ? normalize(vU) : U;
      vec3 hiel = A - vF * .035 - vU * .02;
      float dV = sdCapT(p, hiel, T + vF * .028 - vU * .014, .04, .032);
      dV = smin(dV, length(p - A) - .04, .025);
      float h0 = dot(p - A, vU);
      dV = smax(dV, -(h0 + .062), .006);
      if (dV < dSchoen) { dSchoen = dV; zool = h0 < -.054 ? 1. : 0.; }
    }
  }
  vec2 r = vec2(dS, 1.);
  r = kies(r, dB, 3.);
  r = kies(r, dHuid, 2.);
  r = kies(r, dSok, 4.);
  r = kies(r, dSchoen, zool > .5 ? 9. : 5.);
  r = kies(r, dHand, kp ? 6. : 2.);
  // ── nek en hoofd ──
  float bh = length(p - HD) - .16;
  if (min(bh, length(p - NK) - .12) > r.x) return r;
  vec3 Rh, Uh, Fh; hoofdAssen(i, Rh, Uh, Fh);
  float dN = sdCapT(p, NK - U * .07, HD - Uh * .045 - Fh * .012, .06, .054);
  r = kies(r, dN, 2.);
  if (bh > .02) r = kies(r, bh, 2.);
  else if (bh < r.x) {
    vec3 hq = p - HD;
    vec3 hl = vec3(dot(hq, Rh), dot(hq, Uh), dot(hq, Fh));
    vec3 ho = vec3(abs(hl.x), hl.yz);
    float dH = sdEll(hl - vec3(0., .016, -.006), vec3(.077, .094, .09));                // schedel
    dH = smin(dH, sdEll(hl - vec3(0., -.045, .026), vec3(.056, .06, .064)), .03);         // gezicht en kaak
    dH = smin(dH, sdEll(hl - vec3(0., -.086, .055), vec3(.028, .02, .024)), .02);        // kin
    dH = smin(dH, sdEll(ho - vec3(.04, -.012, .064), vec3(.018, .013, .016)), .015);      // jukbeenderen
    dH = smin(dH, sdEll(hl - vec3(0., .03, .077), vec3(.056, .013, .02)), .014);         // wenkbrauwboog
    dH = smin(dH, sdCapT(hl, vec3(0., .016, .088), vec3(0., -.02, .099), .008, .012), .012); // neus
    dH = smin(dH, sdEll(ho - vec3(.011, -.026, .093), vec3(.009, .007, .008)), .006);    // neusvleugels
    dH = smin(dH, sdEll(hl - vec3(0., -.05, .086), vec3(.024, .011, .012)), .01);        // lippen
    dH = smin(dH, sdEll(ho - vec3(.078, .0, -.006), vec3(.012, .026, .018)), .006);      // oren
    dH = smax(dH, -sdEll(ho - vec3(.03, .011, .093), vec3(.015, .009, .012)), .007);                  // oogkassen
    r = kies(r, dH, 2.);
    r = kies(r, length(ho - vec3(.03, .011, .079)) - .0115, 8.);                         // ogen
    // kort haar met wat volume bovenop, een nette haarlijn en bakkebaarden
    float haar = smin(sdEll(hl - vec3(0., .024, -.012), vec3(.083, .098, .095)), sdEll(hl - vec3(0., .078, .005), vec3(.064, .04, .075)), .03);
    float lijn = mix(-.075, .052, smoothstep(-.035, .065, hl.z)) - .03 * smoothstep(.06, .075, ho.x) * smoothstep(.07, .02, hl.z);
    haar += .0012 * sin(hl.x * 210. + hl.z * 60.) * sin(hl.z * 190. - hl.y * 70.);
    haar = smax(haar, lijn + .006 * sin(hl.x * 90.) - hl.y, .01);
    r = kies(r, haar, 7.);
  }
  return r;
}

vec2 spelers(vec3 p){
  // één aanroepplek per lus houdt de shader klein (de functie wordt anders vele keren ingevoegd)
  vec2 r = vec2(1e5, 0.);
  for (int i = 0; i < 2; i++) {
    vec2 h = speler(p, i);
    if (h.x < r.x) r = vec2(h.x, h.y + float(i) * 10.);
  }
  return r;
}
float spelersD(vec3 p){ return spelers(p).x; }

vec3 normaal(vec3 p){
  vec3 n = vec3(0.);
  for (int k = 0; k < 4; k++) {
    vec3 e = .5773 * (2. * vec3(float(((k + 3) >> 1) & 1), float((k >> 1) & 1), float(k & 1)) - 1.);
    n += e * spelersD(p + e * .0012);
  }
  return normalize(n);
}

// straal tegen bol: [t in, t uit] of (-1)
vec2 bolIn(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c; float b = dot(oc, rd); float h = b * b - dot(oc, oc) + r * r;
  if (h < 0.) return vec2(-1.); h = sqrt(h); return vec2(-b - h, -b + h);
}
// straal tegen capsule (iq)
float capIn(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float r){
  vec3 ba = pb - pa, oa = ro - pa;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  float h = b * b - a * c;
  if (h >= 0.) {
    float t = (-b - sqrt(h)) / a; float y = baoa + t * bard;
    if (y > 0. && y < baba) return t;
    vec3 oc = (y <= 0.) ? oa : ro - pb; b = dot(rd, oc); c = dot(oc, oc) - r * r; h = b * b - c;
    if (h > 0.) return -b - sqrt(h);
  }
  return -1.;
}
vec3 capNor(vec3 p, vec3 a, vec3 b, float r){ vec3 ba = b - a, pa = p - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return (pa - h * ba) / r; }

// ── de schijnwerpers: zes clusters op de daken ──
const int NL = 6;
vec3 lichtPos(int k){
  if (k == 0) return vec3(-26., 29., -16.);
  if (k == 1) return vec3(26., 29., -16.);
  if (k == 2) return vec3(-46., 30., 20.);
  if (k == 3) return vec3(46., 30., 20.);
  if (k == 4) return vec3(-46., 30., 62.);
  return vec3(46., 30., 62.);
}
vec3 lichtKleur(int k){ return k < 2 ? vec3(1., .96, .9) : vec3(.86, .92, 1.); }

// ── het stadion achter alles ──
float footprint; // wereldgrootte van één beeldpunt per meter afstand
vec3 tribune(vec3 ro, vec3 rd, out float tHit){
  tHit = 1e5;
  const float K = 1.6;
  vec3 col = vec3(0.);
  // vier hellende vlakken (achter het doel, links, rechts, overkant) + de reclameborden ervoor
  float best = 1e5; int wie = -1;
  // achter het doel: z = -9 - (y - 1) K
  float den = rd.z + K * rd.y;
  if (abs(den) > 1e-4) { float t = (-9. - (ro.y - 1.) * K - ro.z) / den; vec3 p = ro + rd * t; if (t > 0. && p.y > .9 && p.y < 27. && abs(p.x) < 48. + (p.y) * K) { best = t; wie = 0; } }
  den = rd.x - K * rd.y; // rechts: x = 41 + (y - 1) K
  if (abs(den) > 1e-4) { float t = (41. + (ro.y - 1.) * K - ro.x) / den; vec3 p = ro + rd * t; if (t > 0. && t < best && p.y > .9 && p.y < 27.) { best = t; wie = 1; } }
  den = rd.x + K * rd.y; // links: x = -41 - (y - 1) K
  if (abs(den) > 1e-4) { float t = (-41. - (ro.y - 1.) * K - ro.x) / den; vec3 p = ro + rd * t; if (t > 0. && t < best && p.y > .9 && p.y < 27.) { best = t; wie = 2; } }
  den = rd.z - K * rd.y; // overkant: z = 114 + (y - 1) K
  if (abs(den) > 1e-4) { float t = (114. + (ro.y - 1.) * K - ro.z) / den; vec3 p = ro + rd * t; if (t > 0. && t < best && p.y > .9 && p.y < 27.) { best = t; wie = 3; } }
  // reclameborden (verticaal, 0..0,95 m)
  float tb = 1e5; float bu = 0.;
  if (rd.z < 0.) { float t = (-6.5 - ro.z) / rd.z; vec3 p = ro + rd * t; if (t > 0. && p.y > 0. && p.y < .95 && abs(p.x) < 40.) { tb = t; bu = p.x; } }
  if (rd.x > 0.) { float t = (39. - ro.x) / rd.x; vec3 p = ro + rd * t; if (t > 0. && t < tb && p.y > 0. && p.y < .95) { tb = t; bu = p.z + 50.; } }
  if (rd.x < 0.) { float t = (-39. - ro.x) / rd.x; vec3 p = ro + rd * t; if (t > 0. && t < tb && p.y > 0. && p.y < .95) { tb = t; bu = -p.z + 150.; } }
  if (tb < best) {
    tHit = tb;
    vec3 p = ro + rd * tb;
    float seg = floor(bu / 9.);
    float fase = fract(uTime * .07 + seg * .13);
    vec3 a = mix(vec3(.05, .25, 1.), vec3(1., .2, .5), h21(vec2(seg, floor(uTime * .25))));
    float strepen = .55 + .45 * smoothstep(.3, .7, fract(bu * .25 - uTime * .6));
    float letters = step(.5, vn(vec2(bu * 2.2, p.y * 9.))) * smoothstep(.18, .3, p.y) * smoothstep(.8, .66, p.y);
    col = a * (.25 + .5 * strepen) + vec3(1.) * letters * .35;
    col *= .9;
    return col;
  }
  if (wie < 0) return vec3(-1.);
  tHit = best;
  vec3 p = ro + rd * best;
  float u = wie == 0 ? p.x : wie == 3 ? -p.x : (wie == 1 ? p.z : -p.z);
  float v = p.y;
  float dist = best;
  float fp = footprint * dist; // meters per beeldpunt op die afstand
  // betonnen balkon halverwege en het dak erboven
  float balkon = smoothstep(.35, .0, abs(v - 12.5) - .6);
  // het publiek: rijen stoelen (0,8 m) met mensen
  vec2 c = vec2(u / .62, v / .48);
  vec2 id = floor(c);
  vec2 f = fract(c) - .5;
  float hh = h21(id + float(wie) * 17.);
  vec3 shirt = hh < .4 ? (uPubliek.w > .5 ? uPubliek.xyz : uKit[0]) : hh < .75 ? (uPubliek.w > .5 ? uPubliek.xyz * .6 : uKit[3]) : vec3(.35, .36, .4);
  shirt = mix(shirt, vec3(.08), step(.82, hh) * .8);
  float pers = smoothstep(.5, .15, length(f * vec2(1.1, .8) + vec2(0., .05)));
  float detail = clamp(1.8 - fp / .25, 0., 1.) * .7;
  vec3 publiek = mix(shirt * .45 + .02, shirt * (.2 + .7 * pers), detail);
  // grote, langzame vlekken: vlaggen en sjaals
  publiek *= .55 + .75 * vn(vec2(u * .08, v * .2) + float(wie) * 3.);
  // belichting: de bovenring is donkerder
  float lichtTrib = .2 * (1. - .6 * smoothstep(4., 24., v)) * uLicht;
  col = publiek * lichtTrib;
  col = mix(col, vec3(.012, .014, .02), balkon);
  // lichtjes: telefoons en flitsen, als zachte schijfjes (bokeh) die groter worden met de afstand
  vec2 c2 = vec2(u / 1.3, v / 1.0);
  vec2 i2 = floor(c2);
  float hz = h21(i2 + float(wie) * 5.1);
  if (hz > .9) {
    vec2 o2 = (h22(i2) - .5) * .6;
    float rr = length(fract(c2) - .5 - o2) * 1.15;
    float R = clamp(fp * 1.6 / 1.15, .045, .4);
    float slot = floor(uTime * (1.5 + 3. * h21(i2 * 3.1)) + hz * 30.);
    float aan = step(.5, h21(i2 + slot)) * (.4 + .6 * h21(i2 * 7.7));
    float flits = step(.985, h21(i2 + slot * 1.3)) * (1. + 6. * uFlits);
    vec3 kl = mix(vec3(1., .85, .7), vec3(.75, .85, 1.), h21(i2 * 1.9));
    col += kl * smoothstep(R, R * .55, rr) * (aan * .55 + flits) * (.25 + .75 * uFlits + .5) * .5;
  }
  return col;
}

vec3 lucht(vec3 rd){
  float y = rd.y;
  vec3 c = mix(vec3(.012, .016, .03), vec3(.002, .003, .01), smoothstep(0., .6, y));
  return c;
}

// het dak met de lichtbakken
vec3 dak(vec3 ro, vec3 rd, inout float tHit){
  vec3 col = vec3(0.);
  if (rd.y <= 0.) return col;
  float t = (27.5 - ro.y) / rd.y;
  vec3 p = ro + rd * t;
  bool binnen = abs(p.x) < 41. + 26.5 * 1.6 + 2. && p.z > -9. - 26.5 * 1.6 - 2. && p.z < 160.;
  bool gat = abs(p.x) < 41. + 26.5 * 1.6 - 9. && p.z > -9. - 26.5 * 1.6 + 9.;
  if (t > 0. && t < tHit && binnen && !gat) {
    tHit = t;
    col = vec3(.008, .009, .012);
  }
  return col;
}

// strooilicht van de schijnwerpers in de mist (analytisch per lichtbron), met een bundel naar het veld
vec3 strooi(vec3 ro, vec3 rd, float T){
  vec3 s = vec3(0.);
  for (int k = 0; k < NL; k++) {
    vec3 L = lichtPos(k);
    vec3 d = ro - L;
    float b = dot(d, rd);
    float c = dot(d, d) - b * b;
    float h = sqrt(max(c, 1e-3));
    float I = (atan((T + b) / h) - atan(b / h)) / h;
    // de bundel: gericht op het strafschopgebied
    vec3 as = normalize(vec3(0., 0., 14.) - L);
    vec3 dichtst = ro + rd * clamp(-b, 0., T);
    vec3 nl = normalize(dichtst - L);
    float kegel = smoothstep(.9, .985, dot(nl, as));
    float rook = .6 + .8 * fbm(dichtst.xz * .12 + dichtst.y * .1 + vec2(uTime * .05, 0.));
    s += lichtKleur(k) * I * (.03 + 3.5 * kegel * rook * rook);
  }
  return s * .3;
}

// de lampen zelf (felle punten op de daken)
vec3 lampen(vec3 ro, vec3 rd, float T){
  vec3 s = vec3(0.);
  for (int k = 0; k < NL; k++) {
    vec3 L = lichtPos(k);
    vec3 d = L - ro;
    float t = dot(d, rd);
    if (t < 0. || t > T + 2.) continue;
    // een rij van lampen (5 x 2) om het middelpunt
    vec3 as = normalize(cross(normalize(d), vec3(0., 1., 0.)));
    for (int j = -3; j <= 3; j++) {
      vec3 q = L + as * float(j) * 1.6;
      vec3 dq = q - ro;
      float tq = dot(dq, rd);
      float r = length(dq - rd * tq) / tq; // hoekafstand
      s += lichtKleur(k) * (exp(-r * r / (footprint * footprint * 9.)) * 2.5 + .0016 / (r * r + .00006) * .02);
    }
  }
  return s;
}

vec3 achtergrond(vec3 ro, vec3 rd, out float T){
  vec3 col = tribune(ro, rd, T);
  if (col.x < 0.) { col = lucht(rd); T = 1e4; }
  col = mix(col, dak(ro, rd, T), step(0., 1.) * 0.); // (dak: zie hieronder)
  float Td = T;
  vec3 dk = dak(ro, rd, Td);
  if (Td < T) { col = dk; T = Td; }
  col += lampen(ro, rd, T);
  return col;
}

// ── het veld ──
float lijn(float d, float b){ float aa = fwidth(d) + 1e-4; return smoothstep(b + aa, b - aa, abs(d)); }
vec3 gras(vec3 p, float afst, out float verf){
  // maaistroken van 5,5 m dwars op het doel, en een fijnere textuur
  float band = mod(floor(p.z / 5.5), 2.);
  float band2 = mod(floor(p.x / 5.5), 2.) * .25;
  if (uVeld > 1.5) { band = mod(floor((p.x + p.z) / 5.5), 2.); band2 = 0.; }
  else if (uVeld > .5) { band = mod(floor(p.z / 5.5) + floor(p.x / 5.5), 2.); band2 = 0.; }
  vec3 g = mix(uGras[0], uGras[1], band);
  g *= .92 + band2 * .3;
  float n = fbm(p.xz * 3.) * .5 + fbm(p.xz * .3) * .5;
  g *= .8 + .45 * n;
  // lijnen
  float L = 0.;
  float b = .06;
  L = max(L, lijn(p.z, b) * step(abs(p.x), 34.));                        // doellijn
  L = max(L, lijn(abs(p.x) - 9.16, b) * step(p.z, 5.5) * step(0., p.z));   // doelgebied
  L = max(L, lijn(p.z - 5.5, b) * step(abs(p.x), 9.16));
  L = max(L, lijn(abs(p.x) - 20.16, b) * step(p.z, 16.5) * step(0., p.z)); // strafschopgebied
  L = max(L, lijn(p.z - 16.5, b) * step(abs(p.x), 20.16));
  L = max(L, lijn(length(p.xz - vec2(0., 11.)) - 9.15, b) * step(16.5, p.z)); // de boog
  L = max(L, smoothstep(.13, .1, length(p.xz - vec2(0., 11.))));            // de stip
  L = max(L, lijn(abs(p.x) - 34., b));                                       // zijlijnen
  L = max(L, lijn(p.z - 52.5, b) * step(abs(p.x), 34.));                     // middenlijn
  L = max(L, lijn(length(p.xz - vec2(0., 52.5)) - 9.15, b));
  verf = L * clamp(1.2 - afst * .004, 0., 1.);
  // buiten het veld: donkerder
  float buiten = max(step(34.5, abs(p.x)), step(p.z, -1.));
  g *= 1. - .4 * buiten;
  return mix(g, vec3(.62, .66, .62), verf * (1. - buiten));
}

// zachte schaduw van de spelers richting een licht
float schaduw(vec3 ro, vec3 rd){
  // alleen als de straal langs een speler komt
  float res = 1.;
  for (int i = 0; i < 2; i++) {
    vec2 b = bolIn(ro, rd, uJ[i * 18], 1.4);
    if (b.y < 0.) continue;
    float t = max(b.x, .02);
    for (int k = 0; k < 22; k++) {
      if (t > b.y) break;
      float h = speler(ro + rd * t, i).x;
      res = min(res, 10. * h / t);
      if (res < .02) break;
      t += clamp(h, .02, .25);
    }
  }
  // de bal
  vec3 oc = ro - uBal.xyz; float bb = dot(oc, rd); float cc = dot(oc, oc) - bb * bb;
  if (bb < 0. && uBal.w > .5) res = min(res, smoothstep(.08, .14, sqrt(max(cc, 0.)) - .0) );
  return clamp(res, 0., 1.);
}

// de straal langs de spelers marcheren (binnen hun begrenzende bollen)
vec2 marcheer(vec3 ro, vec3 rd, float tmax, int stappen){
  vec2 b0 = bolIn(ro, rd, uJ[0], 1.45);
  vec2 b1 = bolIn(ro, rd, uJ[18], 1.45);
  float ta = 1e5, tb = -1.;
  if (b0.y > 0.) { ta = min(ta, max(b0.x, 0.)); tb = max(tb, b0.y); }
  if (b1.y > 0.) { ta = min(ta, max(b1.x, 0.)); tb = max(tb, b1.y); }
  if (tb < 0.) return vec2(-1.);
  tb = min(tb, tmax);
  float t = ta;
  for (int i = 0; i < 96; i++) {
    if (i >= stappen || t > tb) break;
    vec2 h = spelers(ro + rd * t);
    if (h.x < .0015 * t + .0008) return vec2(t, h.y);
    t += max(h.x * .9, .002);
  }
  return vec2(-1.);
}

// licht op een speler
vec3 kleedSpeler(vec3 p, vec3 n, vec3 rd, float mat){
  int i = mat > 9.5 ? 1 : 0;
  float m = mat - float(i) * 10.;
  vec3 kit = uKit[i * 3], broek = uKit[i * 3 + 1], acc = uKit[i * 3 + 2];
  vec3 alb; float spec = .15, glans = 24.;
  vec3 R = uTB[i * 3], U = uTB[i * 3 + 1], F = uTB[i * 3 + 2];
  vec3 q = p - uJ[i * 18];
  vec3 l = vec3(dot(q, R), dot(q, U), dot(q, F));
  float wrap = 0.;
  if (m < 1.5) {
    alb = kit;
    // stofstructuur en zachte plooien (vooral bij de taille en onder de armen)
    alb *= .95 + .05 * sin(l.x * 160.);
    alb *= .9 + .14 * vn(vec2(l.x * 9. + l.y * 3., l.y * 16. + l.z * 6.)) - .1 * smoothstep(.2, .02, l.y);
    // kraag en mouwzomen in de accentkleur
    alb = mix(alb, acc, smoothstep(.016, .01, abs(l.y - .515)) * smoothstep(.1, .075, length(l.xz)) * .9);
    for (int k = 0; k < 2; k++) {
      vec3 S = uJ[i * 18 + 4 + k * 3], E = uJ[i * 18 + 5 + k * 3], H = uJ[i * 18 + 6 + k * 3];
      vec3 A = i == 1 ? E : S, B = i == 1 ? H : E;
      float h = dot(p - A, B - A) / dot(B - A, B - A);
      float zoom = i == 1 ? .86 : .4;
      float bij = smoothstep(.09, .075, length(p - mix(A, B, clamp(h, 0., 1.))));
      alb = mix(alb, acc, smoothstep(.06, .03, abs(h - zoom)) * bij * .85);
    }
    // het cijfer op de rug
    if (l.z < -.02) {
      vec2 uv = vec2(-l.x / .32 + .5, (l.y - .32) / .24 + .5);
      if (uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.) {
        vec4 g = texture(uGetal, vec2((uv.x + float(i)) * .5, 1. - uv.y));
        alb = mix(alb, g.rgb, g.a);
      }
    }
    spec = .1; glans = 14.;
  } else if (m < 2.5) {
    alb = uHuid[i]; spec = .16; glans = 20.; wrap = .45;
    // gezicht: lippen iets donkerder/roder, wenkbrauwen in de haarkleur
    vec3 Rh, Uh, Fh; hoofdAssen(i, Rh, Uh, Fh);
    vec3 hq = p - uJ[i * 18 + 3];
    vec3 hl = vec3(dot(hq, Rh), dot(hq, Uh), dot(hq, Fh));
    if (length(hl) < .14) {
      float lip = smoothstep(.026, .016, abs(hl.x)) * smoothstep(.012, .004, abs(hl.y + .05)) * step(.07, hl.z);
      alb = mix(alb, alb * vec3(.8, .6, .58), lip * .6);
      alb = mix(alb, alb * .5, smoothstep(.0025, .0, abs(hl.y + .05)) * smoothstep(.024, .012, abs(hl.x)) * step(.08, hl.z));
      float wb = smoothstep(.006, .002, abs(hl.y - .034 + .05 * (abs(hl.x) - .03) * (abs(hl.x) - .03) * 30.)) * smoothstep(.052, .04, abs(hl.x)) * smoothstep(.01, .02, abs(hl.x)) * step(.07, hl.z);
      alb = mix(alb, uHaar[i], wb * .85);
      alb *= 1. + .12 * smoothstep(.03, .0, length(vec2(abs(hl.x) - .042, hl.y + .03))) * step(.05, hl.z); // blos
    }
  }
  else if (m < 3.5) {
    alb = broek;
    alb *= .9 + .14 * vn(vec2(l.x * 12., l.y * 18.));
    // zoom van de pijpen in de accentkleur
    for (int k = 0; k < 2; k++) {
      vec3 Hp = uJ[i * 18 + 10 + k * 4], K = uJ[i * 18 + 11 + k * 4];
      float h = dot(p - Hp, K - Hp) / dot(K - Hp, K - Hp);
      float bij = smoothstep(.13, .11, length(p - mix(Hp, K, clamp(h, 0., 1.))));
      alb = mix(alb, acc, smoothstep(.035, .015, abs(h - .375)) * bij * .8);
    }
  }
  else if (m < 4.5) {
    alb = mix(kit, vec3(.9), .25);
    // twee ringen bovenaan de kous en ribbels
    for (int k = 0; k < 2; k++) {
      vec3 K = uJ[i * 18 + 11 + k * 4], A = uJ[i * 18 + 12 + k * 4];
      float h = dot(p - K, A - K) / dot(A - K, A - K);
      if (h > .1 && h < 1.05) alb = mix(alb, acc, smoothstep(.02, .01, abs(h - .22)) * .9);
    }
    alb *= .92 + .08 * sin(dot(p, vec3(1.)) * 900.);
  }
  else if (m < 5.5) { alb = mix(vec3(.03), acc, .18); spec = .7; glans = 70.; }
  else if (m < 6.5) { alb = mix(acc, vec3(.9), .4); spec = .3; }
  else if (m < 7.5) {
    alb = uHaar[i]; spec = .3; glans = 36.;
    vec3 Rh, Uh, Fh; hoofdAssen(i, Rh, Uh, Fh);
    vec3 hq = p - uJ[i * 18 + 3];
    alb *= .8 + .35 * vn(vec2(dot(hq, Rh) * 260., dot(hq, Fh) * 60. + dot(hq, Uh) * 60.));
  }
  else if (m < 8.5) {
    // oog: wit, iris, pupil en een glimlichtje
    vec3 Rh, Uh, Fh; hoofdAssen(i, Rh, Uh, Fh);
    vec3 hq = p - uJ[i * 18 + 3];
    vec3 hl = vec3(dot(hq, Rh), dot(hq, Uh), dot(hq, Fh));
    vec2 e = vec2(abs(hl.x) - .03, hl.y - .011);
    float ir = length(e);
    alb = mix(vec3(.5, .48, .45), vec3(.07, .04, .022), smoothstep(.0082, .0072, ir));
    alb = mix(alb, vec3(.005), smoothstep(.0034, .0026, ir));
    spec = 1.; glans = 120.;
  }
  else { alb = mix(vec3(.12), acc, .35); spec = .2; }
  vec3 col = vec3(0.);
  // hoofdlichten: twee kanten (achter het doel en de overkant), met schaduw
  vec3 L1 = normalize(lichtPos(0) - p), L2 = normalize(lichtPos(5) - p), L3 = normalize(lichtPos(3) - p);
  float s1 = uKw < 2.5 ? schaduw(p + n * .01, L1) : 1.;
  float d1 = max((dot(n, L1) + wrap) / (1. + wrap), 0.), d2 = max((dot(n, L2) + wrap) / (1. + wrap), 0.), d3 = max(dot(n, L3), 0.);
  col += alb * (d1 * s1 * 1.25 * vec3(1., .95, .88) + d2 * .42 * vec3(.85, .9, 1.) + d3 * .22) * uLicht;
  vec3 hv = normalize(L1 - rd);
  col += spec * pow(max(dot(n, hv), 0.), glans) * s1 * uLicht;
  col += spec * .5 * pow(max(dot(n, normalize(L2 - rd)), 0.), glans) * uLicht;
  // omgeving: blauwe lucht van boven, groen terugkaatsend gras van onder
  col += alb * mix(vec3(.012, .03, .014), vec3(.02, .025, .045), n.y * .5 + .5);
  // rim-light: hard licht van achteren langs de randen
  float rim = pow(1. - max(dot(n, -rd), 0.), 3.);
  vec3 achter = normalize(-rd * vec3(1., 0., 1.) + vec3(0., .6, 0.));
  col += uRim[i] * rim * (.2 + 1.3 * max(dot(n, achter), 0.)) * (.7 + .5 * smoothstep(.2, .8, n.y));
  return col;
}

void main(){
  vec2 q = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamF + (q.x * uCamR + q.y * uCamU) * uTanF * 2.);
  footprint = uTanF * 2. / uRes.y;
  int stappen = uKw < .5 ? 90 : uKw < 1.5 ? 70 : uKw < 2.5 ? 54 : 40;

  // dichtstbijzijnde treffer: gras, doel, bal, spelers
  float T = 1e5; int wat = 0; // 1 gras, 2 paal, 3 bal, 4 speler
  float tg = rd.y < 0. ? -ro.y / rd.y : 1e5;
  if (tg > 0. && tg < T) { T = tg; wat = 1; }
  // het doel: twee palen en de lat (wit, 12 cm)
  vec3 pnor = vec3(0.);
  float tp = capIn(ro, rd, vec3(-3.72, 0., 0.), vec3(-3.72, 2.5, 0.), .062);
  if (tp > 0. && tp < T) { T = tp; wat = 2; pnor = capNor(ro + rd * tp, vec3(-3.72, 0., 0.), vec3(-3.72, 2.5, 0.), .062); }
  tp = capIn(ro, rd, vec3(3.72, 0., 0.), vec3(3.72, 2.5, 0.), .062);
  if (tp > 0. && tp < T) { T = tp; wat = 2; pnor = capNor(ro + rd * tp, vec3(3.72, 0., 0.), vec3(3.72, 2.5, 0.), .062); }
  tp = capIn(ro, rd, vec3(-3.72, 2.5, 0.), vec3(3.72, 2.5, 0.), .062);
  if (tp > 0. && tp < T) { T = tp; wat = 2; pnor = capNor(ro + rd * tp, vec3(-3.72, 2.5, 0.), vec3(3.72, 2.5, 0.), .062); }
  // achterste steunen van het net (dun, donker)
  tp = capIn(ro, rd, vec3(-3.72, 2.5, 0.), vec3(-3.72, 0., -2.), .025);
  if (tp > 0. && tp < T) { T = tp; wat = 5; pnor = capNor(ro + rd * tp, vec3(-3.72, 2.5, 0.), vec3(-3.72, 0., -2.), .025); }
  tp = capIn(ro, rd, vec3(3.72, 2.5, 0.), vec3(3.72, 0., -2.), .025);
  if (tp > 0. && tp < T) { T = tp; wat = 5; pnor = capNor(ro + rd * tp, vec3(3.72, 2.5, 0.), vec3(3.72, 0., -2.), .025); }
  // de bal
  vec2 tb = uBal.w > .5 ? bolIn(ro, rd, uBal.xyz, .11) : vec2(-1.);
  if (tb.x > 0. && tb.x < T) { T = tb.x; wat = 3; }
  // de spelers
  vec2 ts = marcheer(ro, rd, T, stappen);
  float spMat = 0.;
  if (ts.x > 0. && ts.x < T) { T = ts.x; wat = 4; spMat = ts.y; }

  vec3 col;
  float Tbg;
  vec3 bg = achtergrond(ro, rd, Tbg);
  if (wat == 0) { col = bg; T = Tbg; }
  else {
    vec3 p = ro + rd * T;
    if (wat == 1) {
      float verf;
      vec3 g = gras(p, T, verf);
      // licht op het veld: de clusters, en het strafschopgebied is extra helder (de tv-belichting)
      float pool = .55 + .45 * exp(-dot(p.xz - vec2(0., 9.), p.xz - vec2(0., 9.)) / 900.);
      vec3 n = vec3(0., 1., 0.);
      // schaduwen van spelers en bal: twee lampen (achter het doel en de overkant), zacht
      float sh = 1.;
      float nabij = min(length(p.xz - uJ[0].xz), length(p.xz - uJ[18].xz));
      vec3 L1 = normalize(lichtPos(0) - p), L2 = normalize(lichtPos(5) - p);
      if (nabij < 4.5 && uKw < 2.5) { sh = schaduw(p + n * .01, L1) * .6 + schaduw(p + n * .01, L2) * .4; }
      else if (nabij < 4.5) sh = 1.;
      // de bal: een klein donker vlekje eronder
      float bs = smoothstep(.0, .25, length(p.xz - uBal.xz) - .02 - uBal.y * .2) ;
      sh *= mix(1., .35 + .65 * bs, step(.5, uBal.w) * (1. - smoothstep(.3, 1.5, uBal.y)));
      col = g * pool * (.25 + .75 * sh) * 1.1 * uLicht;
      // contact-schaduw onder de voeten
      for (int i = 0; i < 2; i++) for (int k = 0; k < 2; k++) {
        vec3 A = uJ[i * 18 + 12 + k * 4];
        col *= 1. - .5 * exp(-dot(p.xz - A.xz, p.xz - A.xz) / .03) * smoothstep(.4, .05, A.y);
      }
      // nat gras: een spiegeling (bewolkt door het gras) van lampen, tribunes en spelers
      vec3 rr = reflect(rd, n);
      float fr = .03 + .55 * pow(1. - max(dot(n, -rd), 0.), 5.);
      vec2 jit = (h22(gl_FragCoord.xy + fract(uTime) * 91.) - .5) * .05;
      rr = normalize(rr + vec3(jit.x, 0., jit.y) * (1. + 2. * (1. - fr)));
      float Tr;
      vec3 refl = achtergrond(p, rr, Tr) * .7;
      if (uKw < 1.5) {
        vec2 rs = marcheer(p + n * .01, rr, 6., 40);
        if (rs.x > 0.) { vec3 pp = p + rr * rs.x; refl = kleedSpeler(pp, normaal(pp), rr, rs.y) * .8; }
      }
      // de bal spiegelt ook
      vec2 rb = bolIn(p, rr, uBal.xyz, .11);
      if (rb.x > 0. && uBal.w > .5) refl = vec3(.35) * uLicht;
      col += refl * fr * (1. - verf * .5) * .9;
    } else if (wat == 2 || wat == 5) {
      vec3 n = normalize(pnor);
      vec3 alb = wat == 2 ? vec3(.92) : vec3(.12);
      vec3 L1 = normalize(lichtPos(0) - p), L2 = normalize(lichtPos(5) - p);
      col = alb * (max(dot(n, L1), 0.) * .8 + max(dot(n, L2), 0.) * .6 + .08) * uLicht;
      col += pow(max(dot(reflect(rd, n), L2), 0.), 40.) * .8 * uLicht;
      float rim = pow(1. - max(dot(n, -rd), 0.), 3.);
      col += rim * vec3(.4, .45, .55) * .5;
    } else if (wat == 3) {
      vec3 n = normalize(p - uBal.xyz);
      vec3 ln = uBalRot * n;
      // een klassieke bal: witte panelen met donkere vijfhoekjes (benaderd met een paar richtingen)
      float pat = 0.;
      vec3 dirs[6] = vec3[6](vec3(0., 1., 0.), vec3(0., -1., 0.), vec3(.89, .45, 0.), vec3(-.89, -.45, 0.), vec3(.28, .45, .85), vec3(-.28, -.45, -.85));
      for (int k = 0; k < 6; k++) pat = max(pat, smoothstep(.93, .955, dot(ln, normalize(dirs[k]))));
      vec3 dirs2[6] = vec3[6](vec3(.72, .45, -.53), vec3(-.72, -.45, .53), vec3(-.72, .45, -.53), vec3(.72, -.45, .53), vec3(-.28, .45, .85), vec3(.28, -.45, -.85));
      for (int k = 0; k < 6; k++) pat = max(pat, smoothstep(.93, .955, dot(ln, normalize(dirs2[k]))));
      vec3 alb = mix(vec3(.9), vec3(.05, .06, .1), pat);
      vec3 L1 = normalize(lichtPos(0) - p), L2 = normalize(lichtPos(5) - p);
      col = alb * (max(dot(n, L1), 0.) * .9 + max(dot(n, L2), 0.) * .6 + .07) * uLicht;
      col += pow(max(dot(reflect(rd, n), L2), 0.), 30.) * .6;
      col += pow(1. - max(dot(n, -rd), 0.), 3.) * vec3(.5, .55, .7) * .6;
    } else {
      vec3 n = normaal(p);
      col = kleedSpeler(p, n, rd, spMat);
    }
  }

  // het net: vier vlakken (achter, dak, twee zijkanten) met een ruitjespatroon; het achtervlak bolt uit waar de bal raakt
  {
    float netA = 0.; vec3 netC = vec3(0.);
    for (int k = 0; k < 4; k++) {
      float t = -1.; vec2 uv; vec3 pp;
      if (k == 0) { // achter: z = -2 + (y/2.5)*0.9 (schuin), plus de uitbolling
        // eerst het vlakke vlak, dan één verbetering voor de bolling
        float z0 = -2.;
        for (int it = 0; it < 2; it++) {
          vec3 pt = ro + rd * max(t, 0.);
          float bol = 0.;
          if (it == 1) { vec2 dd = pt.xy - uNet.xy; bol = uNet.z * exp(-dot(dd, dd) / .55) + uNet.z * .25 * sin(length(dd) * 7. - uNet.w * 9.) * exp(-dot(dd, dd) / 2.); }
          float zz = z0 + 0.32 * clamp(pt.y / 2.5, 0., 1.) - bol;
          // los op met z ~ zz (de helling verwaarlozen we in de oplossing; klein)
          t = (zz - ro.z) / rd.z;
        }
        pp = ro + rd * t;
        if (abs(pp.x) > 3.72 || pp.y < 0. || pp.y > 2.5) t = -1.;
        uv = pp.xy;
      } else if (k == 1) { // dak: y = 2.5, z tussen -2 en 0
        t = (2.5 - ro.y) / rd.y; pp = ro + rd * t;
        if (abs(pp.x) > 3.72 || pp.z > 0. || pp.z < -1.7) t = -1.;
        uv = pp.xz;
      } else { // zijkanten
        float sx = k == 2 ? -3.72 : 3.72;
        t = (sx - ro.x) / rd.x; pp = ro + rd * t;
        float zmax = -2. + .32 * clamp(pp.y / 2.5, 0., 1.);
        float dakz = mix(-1.7, -2., 1. - clamp(pp.y / 2.5, 0., 1.));
        if (pp.y < 0. || pp.y > 2.5 || pp.z > 0. || pp.z < zmax || pp.z < -2.) t = -1.;
        uv = pp.zy;
      }
      if (t > 0. && t < T + .001) {
        // ruitjes van 12 cm; dunne draden, vervagend met de afstand (geen moiré)
        vec2 g = uv / .12;
        vec2 fw = fwidth(g);
        float pw = max(max(fw.x, fw.y), 1e-4);
        // dichtbij de lens onscherp, behalve waar de bal in het net hangt (daar ligt de focus)
        float bij = k == 0 ? exp(-dot(pp.xy - uNet.xy, pp.xy - uNet.xy) / .35) * smoothstep(.0, .08, uNet.z) : 0.;
        float blur = pw + .3 * smoothstep(2.6, .9, t) * (1. - bij);
        vec2 dd = abs(fract(g + .5) - .5);
        float dmin = min(dd.x, dd.y);
        float cov = clamp(.05 / blur, 0., 1.) * smoothstep(blur * .5 + .025, 0., dmin);
        float a = mix(cov, .1, smoothstep(.3, .8, pw)) * max(mix(.22, .6, smoothstep(.9, 2.6, t)), .8 * bij);
        vec3 L2 = normalize(lichtPos(5) - pp);
        vec3 nc = vec3(.85, .88, .92) * (.25 + .4 * max(L2.y, 0.)) * uLicht;
        netC = mix(netC, nc, a * (1. - netA));
        netA += a * (1. - netA);
      }
    }
    col = mix(col, netC / max(netA, 1e-3), netA);
  }

  // het spoor van de bal: een zachte staart (bij een mythische/kosmische schutter een vlammen- of sterrenstaart)
  if (uSpoorK.w > .001) {
    float gl = 0.; float vonk = 0.;
    vec3 prev = uBal.xyz;
    for (int k = 0; k < 7; k++) {
      vec3 a = prev, b = uSpoor[k];
      prev = b;
      vec3 ba = b - a;
      float bb = dot(ba, ba);
      if (bb < 1e-6) continue;
      // afstand van de straal tot het lijnstuk (benaderd: dichtstbijzijnde punt op de straal bij het midden)
      vec3 m = (a + b) * .5;
      float tm = dot(m - ro, rd);
      if (tm < 0. || tm > T + .2) continue;
      vec3 pr = ro + rd * tm;
      float h = clamp(dot(pr - a, ba) / bb, 0., 1.);
      float d = length(pr - (a + ba * h));
      float w = .07 * (1. - float(k) / 8.) + .015;
      float f = exp(-d * d / (w * w)) * (1. - (float(k) + h) / 7.5);
      gl += f;
      vonk += f * step(.82, h21(floor(pr.xy * 40. + uTime * 30.)));
    }
    col += uSpoorK.rgb * (gl * .5 + vonk * 1.4 * uMyth.x) * uSpoorK.w;
  }

  // mist en strooilicht
  float Tm = min(T, 160.);
  vec3 sc = strooi(ro, rd, Tm) * uLicht * uMist;
  float fog = 1. - exp(-Tm * .006 * uMist);
  col = mix(col, vec3(.012, .016, .026) * uLicht, fog * .55) + sc;
  // grondmist: laag bij het gras
  if (rd.y < 0.) { float gm = exp(-max(ro.y, 0.) * .5) * (1. - exp(-Tm * .01)); col += vec3(.05, .06, .07) * gm * .25 * uMist; }

  o = vec4(col, 1.);
}`;

  // drempel + verkleinen voor de bloom
  const FS_HELDER = `${KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uDrempel;
void main(){
  vec3 c = vec3(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) c += texture(uTex, vUv + vec2(x, y) * uTexel).rgb;
  c /= 9.;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(uDrempel, uDrempel + .5, l), 1.);
}`;
  const FS_VAAG = `${KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUv).rgb * .227;
  c += (texture(uTex, vUv + uDir * 1.385).rgb + texture(uTex, vUv - uDir * 1.385).rgb) * .316;
  c += (texture(uTex, vUv + uDir * 3.231).rgb + texture(uTex, vUv - uDir * 3.231).rgb) * .07;
  o = vec4(c, 1.);
}`;
  const FS_SAMEN = `${KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uTex, uBloom;
uniform vec2 uRes;
uniform float uBloomS, uTime, uFlits, uZwart, uGlitch, uWipe, uKorrel, uBalk;
uniform vec3 uGlitchK;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
void main(){
  vec2 uv = vUv;
  // een vervloekte kaart: af en toe verspringen er regels opzij, met paarse randen
  float g = uGlitch;
  if (g > .001) {
    float rij = floor(uv.y * 40.);
    float tik = floor(uTime * 14.);
    float sp = step(.93, h21(vec2(rij, tik))) * g;
    uv.x += (h21(vec2(rij * 3., tik)) - .5) * .03 * sp;
  }
  vec3 c = texture(uTex, uv).rgb;
  if (g > .001) {
    c.r = mix(c.r, texture(uTex, uv + vec2(.003 * g, 0.)).r, .8);
    c.b = mix(c.b, texture(uTex, uv - vec2(.003 * g, 0.)).b, .8);
  }
  c += texture(uBloom, vUv).rgb * uBloomS;
  c = aces(c * 1.05);
  // kleurgrading: iets koeler in de schaduw, warm in het licht
  float l = dot(c, vec3(.299, .587, .114));
  c = mix(c * vec3(.92, 1., 1.1), c * vec3(1.04, 1., .94), smoothstep(.2, .7, l));
  c = pow(c, vec3(.95));
  // vignet
  vec2 q = vUv - .5;
  c *= 1. - .55 * dot(q * vec2(1.2, 1.), q * vec2(1.2, 1.));
  // paarse gloed aan de rand bij een vloek
  if (g > .001) {
    float rand = max(abs(q.x) * 2., abs(q.y) * 2.);
    float fl = .6 + .4 * sin(uTime * 7.) * h21(vec2(floor(uTime * 9.), 1.));
    c += uGlitchK * smoothstep(.8, 1., rand) * g * fl * .6;
  }
  // de 'herhaling'-veeg: een schuine glazen balk die over het beeld trekt
  if (uWipe > 0. && uWipe < 1.) {
    float x = vUv.x + (vUv.y - .5) * .35;
    float pos = mix(-.4, 1.4, uWipe);
    float band = smoothstep(.16, .0, abs(x - pos));
    c = mix(c, vec3(.06, .08, .14), band * .85);
    c += vec3(.5, .7, 1.) * smoothstep(.006, .0, abs(abs(x - pos) - .16)) * .8;
  }
  c += uFlits * vec3(1.);
  c *= 1. - uZwart;
  // filmkorrel
  c += (h21(gl_FragCoord.xy + fract(uTime * 13.) * 113.) - .5) * uKorrel;
  // cinematische balken
  float bh = uBalk * .5;
  if (vUv.y < bh || vUv.y > 1. - bh) c = vec3(0.);
  o = vec4(c, 1.);
}`;

  // ═════════════════════════ WebGL ═════════════════════════
  function maakGL(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('geen WebGL2');
    const vao = gl.createVertexArray();
    const comp = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        throw new Error('shader: ' + log);
      }
      return sh;
    };
    const vs = comp(gl.VERTEX_SHADER, VS);
    const prog = (fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      const loc = {};
      const u = (n) => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(p, n)));
      return {
        p, u,
        f1: (n, v) => gl.uniform1f(u(n), v),
        f2: (n, a, b) => gl.uniform2f(u(n), a, b),
        f3: (n, v) => gl.uniform3fv(u(n), v),
        f4: (n, v) => gl.uniform4fv(u(n), v),
        i1: (n, v) => gl.uniform1i(u(n), v),
        m3: (n, v) => gl.uniformMatrix3fv(u(n), false, v),
      };
    };
    const doel = (w, h) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fb, w, h };
    };
    // zonder float-doelen werken we in 8 bit met een vaste schaal: de scène schrijft lineair licht / 4
    return { gl, vao, prog, doel };
  }

  // de rugnummers als textuur (links de schutter, rechts de keeper)
  function maakGetalTex(gl, inv) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 256);
    [inv.schutter, inv.keeper].forEach((k, i) => {
      const licht = k.tier === 1 || k.tier === 4;
      x.save();
      x.translate(i * 256 + 128, 132);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = '800 150px "SPO Sport", "Arial Black", sans-serif';
      const tekst = k.av && k.av.nummer ? String(k.av.nummer) : k.tekst; // de eigen voetballer draagt zijn rugnummer
      let w = x.measureText(tekst).width;
      const sc = Math.min(1, 230 / w);
      x.scale(sc, 1);
      x.lineJoin = 'round';
      x.lineWidth = 12;
      x.strokeStyle = licht ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.6)';
      x.strokeText(tekst, 0, 0);
      x.fillStyle = licht ? '#14181f' : '#f4f1ea';
      x.fillText(tekst, 0, 0);
      x.restore();
    });
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  const hexRgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const lin = (c) => c.map((v) => Math.pow(v, 2.2));
  const TIER_PAL = [
    ['#3d220e', '#a8692f', '#e3b07e'],
    ['#556070', '#c3cdd9', '#f4f7fa'],
    ['#6a4a06', '#e6b41f', '#fff1a6'],
    ['#030622', '#0d2a80', '#1d7fd0'],
    ['#b88f37', '#fff0b8', '#ffffff'],
  ];
  const TIER_GLOED = ['#e08a4a', '#dbe8ff', '#ffc933', '#34dcff', '#ffe27a'];
  function kitVan(k) {
    if (k.av && k.av.shirt) {
      const a = k.av, sh = lin(hexRgb(a.shirt));
      const pal0 = (SPO.TIERS && SPO.TIERS[k.tier] && SPO.TIERS[k.tier].gloed) || TIER_GLOED[k.tier];
      return { shirt: keer(sh, 0.85), broek: lin(hexRgb(a.broek || '#22252b')), acc: lin(hexRgb(a.acc || '#ffffff')), gloed: lin(hexRgb(pal0)) };
    }
    const pal = (SPO.TIERS && SPO.TIERS[k.tier] && SPO.TIERS[k.tier].pal) || TIER_PAL[k.tier];
    const [d, m, l] = pal.map(hexRgb).map(lin);
    // shirt in de middelste kleur, broek donker, accent licht
    const shirt = k.tier === 4 ? lin(hexRgb('#f2e6c4')) : m;
    const broek = k.tier === 1 ? lin(hexRgb('#2a3140')) : k.tier === 4 ? lin(hexRgb('#c99a3a')) : keer(d, 0.45);
    return { shirt: keer(shirt, 0.85), broek, acc: l, gloed: lin(hexRgb((SPO.TIERS && SPO.TIERS[k.tier] && SPO.TIERS[k.tier].gloed) || TIER_GLOED[k.tier])) };
  }

  // ═════════════════════════ Geluid ═════════════════════════
  function maakGeluid(stil) {
    const NAMEN = ['menigte', 'gejuich', 'boem', 'riser', 'hartslag', 'whoosh', 'strafschop-trap', 'strafschop-net', 'strafschop-paal', 'strafschop-fluit', 'strafschop-zucht', 'strafschop-zwel', 'strafschop-duik', 'strafschop-handschoen'];
    const NIV = { menigte: -11, gejuich: -6, boem: -6, riser: -12, hartslag: -5, whoosh: -9, 'strafschop-trap': -2, 'strafschop-net': -4, 'strafschop-paal': -3, 'strafschop-fluit': -9, 'strafschop-zucht': -6, 'strafschop-zwel': -8, 'strafschop-duik': -5, 'strafschop-handschoen': -4 };
    const api = typeof browser !== 'undefined' && browser.runtime ? browser : typeof chrome !== 'undefined' && chrome.runtime ? chrome : null;
    const basis = api && api.runtime && api.runtime.getURL ? api.runtime.getURL('sounds/') : 'sounds/';
    let AC = null, master = null;
    const buf = {};
    const lopend = new Set();
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(AC.destination);
      master = AC.createGain();
      master.gain.value = stil ? 0 : 0.85;
      master.connect(comp);
    } catch (e) {
      AC = null;
    }
    const klaar = AC
      ? Promise.all(
          NAMEN.map((n) =>
            fetch(basis + n + '.mp3')
              .then((r) => (r.ok ? r.arrayBuffer() : null))
              .then((a) => (a ? AC.decodeAudioData(a) : null))
              .then((b) => (buf[n] = b))
              .catch(() => null),
          ),
        )
      : Promise.resolve();
    function speel(n, o = {}) {
      if (!AC || !buf[n]) return null;
      const src = AC.createBufferSource();
      src.buffer = buf[n];
      src.playbackRate.value = o.rate || 1;
      const g = AC.createGain();
      const v = Math.pow(10, ((NIV[n] || 0) + (o.db || 0)) / 20);
      const t0 = AC.currentTime + (o.delay || 0);
      const fi = o.fadeIn || 0.005;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v, t0 + fi);
      if (o.duur) {
        g.gain.setValueAtTime(v, t0 + Math.max(fi, o.duur - (o.fadeOut || 0.3)));
        g.gain.linearRampToValueAtTime(0, t0 + o.duur);
      }
      let node = g;
      if (o.pan && AC.createStereoPanner) {
        const p = AC.createStereoPanner();
        p.pan.value = o.pan;
        g.connect(p);
        node = p;
      }
      node.connect(master);
      src.connect(g);
      src.loop = !!o.loop;
      src.start(t0, o.offset || 0);
      if (o.duur && !o.loop) src.stop(t0 + o.duur + 0.05);
      if (o.loop && o.duur) src.stop(t0 + o.duur + 0.05);
      const r = { src, g, v };
      lopend.add(r);
      src.onended = () => lopend.delete(r);
      return r;
    }
    function stop() {
      for (const r of lopend) {
        try {
          r.src.stop();
        } catch (e) {
          /* al gestopt */
        }
      }
      lopend.clear();
    }
    return { klaar, speel, stop, get AC() { return AC; } };
  }

  // de geluiden op de tijdlijn: [t, naam, opties]
  function geluidCues(W, inv) {
    const tl = W.tl;
    const c = [];
    const goal = inv.uitkomst === 'goal';
    c.push([0.0, 'menigte', { duur: tl.EIND + 0.5, fadeIn: 1.2, fadeOut: 1.5, db: 0 }]);
    c.push([0.05, 'whoosh', { db: -4, rate: 0.8 }]);
    c.push([1.9, 'strafschop-fluit', {}]);
    c.push([tl.tS3a - 0.05, 'hartslag', { db: -2 }]);
    c.push([tl.tS3b - 0.05, 'hartslag', { db: 0 }]);
    c.push([tl.T4 - 0.4, 'strafschop-zwel', { db: 0 }]);
    c.push([tl.tKick - 1.2, 'riser', { db: -3, duur: 1.25, fadeOut: 0.05 }]);
    c.push([tl.tKick, 'strafschop-trap', { rate: 0.82 }]);
    c.push([tl.tKick + 0.02, 'boem', { db: -10, rate: 0.7 }]);
    c.push([tl.tZij + 0.3, 'whoosh', { db: -6, rate: 0.6 }]);
    const tD = tl.tVan(W.plan.sLand);
    if (inv.uitkomst === 'goal') {
      c.push([tl.tI, 'strafschop-net', { rate: 0.85 }]);
      c.push([tl.tI + 0.02, 'boem', { db: -3 }]);
      c.push([tl.tI + 0.05, 'gejuich', { duur: tl.EIND - tl.tI, fadeOut: 2.0, db: 1 }]);
    } else if (inv.uitkomst === 'redding') {
      c.push([tl.tI, 'strafschop-handschoen', {}]);
      c.push([tl.tI + 0.15, 'strafschop-zucht', { db: 0 }]);
      c.push([tl.tI + 1.4, 'gejuich', { duur: 4, fadeIn: 0.6, fadeOut: 1.5, db: -7 }]);
    } else if (inv.uitkomst === 'paal') {
      c.push([tl.tI, 'strafschop-paal', {}]);
      c.push([tl.tI + 0.2, 'strafschop-zucht', { db: 1 }]);
    } else {
      c.push([tl.tI + 0.1, 'strafschop-zucht', { db: 1 }]);
    }
    if (W.plan.dk !== 0) c.push([tD, 'strafschop-duik', {}]);
    // de herhaling: zachter, met een veeg
    c.push([tl.tR - 0.15, 'whoosh', { db: -2 }]);
    const tRk = tl.tR + (tl.KS - tl.RS0) / tl.RV;
    c.push([tRk, 'strafschop-trap', { rate: 0.7, db: -6 }]);
    const tRi = tl.tR + (tl.sI - tl.RS0) / tl.RV;
    if (goal) c.push([tRi, 'strafschop-net', { rate: 0.7, db: -5 }]);
    else if (inv.uitkomst === 'redding') c.push([tRi, 'strafschop-handschoen', { rate: 0.75, db: -5 }]);
    else if (inv.uitkomst === 'paal') c.push([tRi, 'strafschop-paal', { rate: 0.8, db: -6 }]);
    c.push([tl.tRE - 0.1, 'whoosh', { db: -5 }]);
    c.sort((a, b) => a[0] - b[0]);
    return c;
  }

  // ═════════════════════════ Overlay ═════════════════════════
  const CSS = `
.ss-o{position:absolute;inset:0;pointer-events:none;font-family:"SPO Text",system-ui,sans-serif;color:#f4f6fb;overflow:hidden}
.ss-o *{box-sizing:border-box}
.ss-glas{background:linear-gradient(180deg,rgba(28,34,52,.78),rgba(10,13,22,.82));border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.16);backdrop-filter:blur(8px)}
.ss-sb{position:absolute;left:3.2%;top:5.5%;display:flex;align-items:stretch;height:clamp(26px,5.2vh,46px);border-radius:6px;overflow:hidden;font-family:"SPO Sport","Arial Narrow",sans-serif;font-weight:800;letter-spacing:.02em;transform-origin:left center}
.ss-sb .k{display:flex;align-items:center;gap:.55em;padding:0 .8em;font-size:clamp(12px,2.3vh,20px);text-transform:uppercase}
.ss-sb .c{display:grid;place-items:center;min-width:2.5em;height:72%;border-radius:4px;padding:0 .35em;font-style:italic;font-weight:900;color:#10131a}
.ss-sb .stand{display:flex;align-items:center;justify-content:center;min-width:4.2em;background:linear-gradient(180deg,#f6f7fb,#c9ced9);color:#0d1018;font-size:clamp(14px,2.7vh,24px);font-weight:900;font-style:italic;padding:0 .6em}
.ss-sb .rol{font-size:.62em;opacity:.65;font-weight:600;letter-spacing:.12em}
.ss-titel{position:absolute;left:50%;top:13%;transform:translateX(-50%);text-align:center;font-family:"SPO Sport","Arial Narrow",sans-serif;font-weight:900;font-style:italic;letter-spacing:.06em}
.ss-titel .w{font-size:clamp(28px,7.5vh,70px);line-height:1;background:linear-gradient(180deg,#ffffff,#c9d3e6 55%,#8d9ab4);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 10px rgba(0,0,0,.55))}
.ss-titel .l{height:2px;margin:.5em auto 0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent)}
.ss-titel .s{margin-top:.55em;font-family:"SPO Text",sans-serif;font-style:normal;font-weight:600;font-size:clamp(10px,1.8vh,15px);letter-spacing:.32em;opacity:.8;text-transform:uppercase}
.ss-groot{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-family:"SPO Sport","Arial Narrow",sans-serif;font-weight:900;font-style:italic;font-size:clamp(46px,15vh,150px);line-height:1;letter-spacing:.03em;white-space:nowrap}
.ss-groot .w{display:block;background:linear-gradient(180deg,#fff 0%,#fff6d8 40%,var(--k,#ffc933) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.ss-groot .glim{position:absolute;inset:0;background:linear-gradient(100deg,transparent 40%,rgba(255,255,255,.95) 50%,transparent 60%);-webkit-background-clip:text;background-clip:text;color:transparent;background-size:250% 100%}
.ss-lt{position:absolute;left:3.2%;bottom:12%;display:flex;align-items:stretch;border-radius:6px;overflow:hidden}
.ss-lt .b{width:6px;background:var(--k,#ffc933)}
.ss-lt .t{padding:.55em 1.1em .6em .9em}
.ss-lt .r{font-size:clamp(9px,1.5vh,13px);letter-spacing:.3em;opacity:.7;font-weight:700;text-transform:uppercase}
.ss-lt .n{font-family:"SPO Sport","Arial Narrow",sans-serif;font-weight:900;font-style:italic;font-size:clamp(18px,3.8vh,34px);line-height:1.05;text-transform:uppercase}
.ss-lt .n em{font-style:italic;color:var(--k,#ffc933);margin-left:.35em}
.ss-her{position:absolute;right:3.2%;top:5.5%;display:flex;align-items:center;gap:.6em;padding:.45em .95em;border-radius:6px;font-family:"SPO Sport","Arial Narrow",sans-serif;font-weight:900;font-style:italic;font-size:clamp(13px,2.6vh,22px);letter-spacing:.14em}
.ss-her i{width:.62em;height:.62em;border-radius:50%;background:#ff3b4e;box-shadow:0 0 10px #ff3b4e}
.ss-vl{position:absolute;inset:0;border:2px solid rgba(178,74,255,.0)}
`;
  function maakOverlay(host, inv) {
    const st = document.createElement('style');
    st.textContent = CSS;
    host.appendChild(st);
    const o = document.createElement('div');
    o.className = 'ss-o';
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const kl = (k) => (SPO.TIERS && SPO.TIERS[k.tier] ? SPO.TIERS[k.tier].pal[2] : TIER_PAL[k.tier][2]);
    const gl = (k) => (SPO.TIERS && SPO.TIERS[k.tier] ? SPO.TIERS[k.tier].gloed : TIER_GLOED[k.tier]);
    const A = inv.schutter, B = inv.keeper;
    o.innerHTML = `
<div class="ss-sb ss-glas"><div class="k"><span class="c" style="background:${kl(A)}">${esc(A.tekst)}</span>${esc(A.vak)}</div><div class="stand"><span data-s>0 – 0</span></div><div class="k">${esc(B.vak)}<span class="c" style="background:${kl(B)}">${esc(B.tekst)}</span></div></div>
<div class="ss-titel"><div class="w">STRAFSCHOP</div><div class="l"></div><div class="s">${esc(A.vak)} tegen ${esc(B.vak)}</div></div>
<div class="ss-lt ss-glas" data-lt="0" style="--k:${gl(A)}"><div class="b"></div><div class="t"><div class="r">Schutter</div><div class="n">${esc(A.vak)}<em>${esc(A.tekst)}</em></div></div></div>
<div class="ss-lt ss-glas" data-lt="1" style="--k:${gl(B)}"><div class="b"></div><div class="t"><div class="r">Keeper</div><div class="n">${esc(B.vak)}<em>${esc(B.tekst)}</em></div></div></div>
<div class="ss-groot"><span class="w"></span><span class="glim"></span></div>
<div class="ss-her ss-glas"><i></i>HERHALING</div>`;
    host.appendChild(o);
    const $ = (s) => o.querySelector(s);
    const tekst = { goal: 'GOAL!', redding: 'GEREDDERD!', paal: 'PAAL!', over: 'OVER!' }[inv.uitkomst];
    const kleur = { goal: gl(A), redding: gl(B), paal: '#cfd8e6', over: '#cfd8e6' }[inv.uitkomst];
    $('.ss-groot .w').textContent = tekst;
    $('.ss-groot .glim').textContent = tekst;
    $('.ss-groot').style.setProperty('--k', kleur);
    const el = { sb: $('.ss-sb'), titel: $('.ss-titel'), lt0: $('[data-lt="0"]'), lt1: $('[data-lt="1"]'), groot: $('.ss-groot'), glim: $('.ss-groot .glim'), her: $('.ss-her'), stand: $('[data-s]') };
    return { o, el, tekst };
  }
  // zichtbaarheid (0..1) van een element dat van a tot b in beeld is, met in/uit-tijd
  const venster = (t, a, b, i = 0.3, u = 0.3) => sm(t, a, a + i) * (1 - sm(t, b - u, b));
  function zetOverlay(ov, t, W, inv, cam) {
    const tl = W.tl, e = ov.el;
    const zet = (n, a, tr) => {
      n.style.opacity = a.toFixed(3);
      n.style.transform = tr;
      n.style.visibility = a > 0.002 ? 'visible' : 'hidden';
    };
    // scorebord: schuift binnen na de titel, blijft staan (niet tijdens de close-ups en de slow-motion)
    const sbA = venster(t, 1.2, tl.EIND + 1, 0.45) * (1 - 0.85 * venster(t, tl.tS3a, tl.tReactie, 0.2, 0.3)) * (cam.replay ? 0.0 : 1);
    zet(e.sb, sbA, `translateX(${(-30 * (1 - sm(t, 1.2, 1.65))).toFixed(1)}px)`);
    const goalNu = inv.uitkomst === 'goal' && t > tl.tI + 0.2;
    e.stand.textContent = goalNu ? '1 – 0' : '0 – 0';
    // titel
    const ta = venster(t, 0.35, tl.tS2 + 0.2, 0.5, 0.35);
    zet(e.titel, ta, `translateX(-50%) translateY(${(10 * (1 - sm(t, 0.35, 0.9))).toFixed(1)}px)`);
    e.titel.querySelector('.l').style.width = (60 + 40 * sm(t, 0.4, 1.2)).toFixed(0) + '%';
    // lower-thirds bij de close-ups
    zet(e.lt0, venster(t, tl.tS3a + 0.15, tl.tS3b, 0.3, 0.15), `translateX(${(-20 * (1 - sm(t, tl.tS3a + 0.15, tl.tS3a + 0.5))).toFixed(1)}px)`);
    zet(e.lt1, venster(t, tl.tS3b + 0.15, tl.T4, 0.3, 0.15), `translateX(${(-20 * (1 - sm(t, tl.tS3b + 0.15, tl.tS3b + 0.5))).toFixed(1)}px)`);
    // de grote uitslag: knalt erin bij de inslag (+0,15), krimpt naar boven tijdens de reactie, weg voor de herhaling
    const g0 = tl.tI + 0.12;
    const ga = venster(t, g0, tl.tR - 0.1, 0.12, 0.3) + venster(t, tl.tRE + 0.3, tl.EIND + 1, 0.4, 0.1) * 0.9;
    const pop = 1 + 0.35 * Math.exp(-Math.max(0, t - g0) * 9) * (t > g0 ? 1 : 0);
    const naEind = sm(t, tl.tRE + 0.3, tl.tRE + 0.8);
    const sc = mix(pop * mix(1, 0.62, sm(t, g0 + 1.2, g0 + 1.9)), 0.7, naEind);
    const yy = mix(mix(0, -22, sm(t, g0 + 1.2, g0 + 1.9)), -6, naEind);
    zet(e.groot, Math.min(1, ga), `translate(-50%,calc(-50% + ${yy.toFixed(2)}vh)) scale(${sc.toFixed(3)})`);
    e.glim.style.backgroundPosition = `${(160 - 220 * ramp(t, g0 + 0.05, g0 + 0.9)).toFixed(1)}% 0`;
    // herhaling-label
    zet(e.her, venster(t, tl.tR + 0.25, tl.tRE, 0.25, 0.2), `translateX(${(20 * (1 - sm(t, tl.tR + 0.25, tl.tR + 0.55))).toFixed(1)}px)`);
    e.her.querySelector('i').style.opacity = 0.4 + 0.6 * (Math.sin(t * 6) > 0 ? 1 : 0);
  }

  // ═════════════════════════ Start ═════════════════════════
  function start(invoer) {
    const inv = maakInvoer(invoer);
    const W = maakWereld(inv);
    const tl = W.tl;
    const host = document.createElement('div');
    host.id = '__somStrafschop';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#000;overflow:hidden';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);
    document.body.appendChild(host);
    const G = maakGL(canvas);
    const { gl } = G;
    const pS = G.prog(FS_SCENE), pH = G.prog(FS_HELDER), pV = G.prog(FS_VAAG), pC = G.prog(FS_SAMEN);
    let getalTex = null;
    const ov = maakOverlay(host, inv);
    const KA = kitVan(inv.schutter), KB = kitVan(inv.keeper);
    // de keeper draagt een eigen kleur: zijn niveau, maar een tint donkerder en met handschoenen in het accent
    const kitArr = new Float32Array([...KA.shirt, ...KA.broek, ...KA.acc, ...keer(KB.shirt, 0.9), ...KB.broek, ...KB.acc]);
    // mythisch (trede 4) vuurstaart, kosmisch (trede 3) sterrenstaart, zeldzaam/glim een gouden glinster
    const trS = inv.schutter.trede, trK = inv.keeper.trede;
    const spoorKleur = trS >= 4 ? [1.6, 0.55, 0.12] : trS === 3 ? [0.55, 0.5, 1.6] : trS >= 1 ? [1.2, 1.0, 0.55] : [0.7, 0.75, 0.85];
    const mythS = trS >= 3 ? 1 : trS >= 1 ? 0.4 : 0;
    const rimVan = (k, kit) => (k.vloek ? [0.75, 0.25, 1.1] : k.trede >= 3 ? keer(kit.gloed, 0.9) : lerp3([0.55, 0.62, 0.8], kit.gloed, 0.35));
    const rimA = rimVan(inv.schutter, KA), rimB = rimVan(inv.keeper, KB);
    // huidskleur: vast per vak, zodat dezelfde kaart er steeds hetzelfde uitziet
    const HUID = [[0.42, 0.25, 0.16], [0.22, 0.12, 0.075], [0.56, 0.37, 0.27], [0.11, 0.06, 0.04], [0.33, 0.19, 0.12]];
    const huidVan = (vak, extra, av) => {
      if (av && av.huid) return lin(hexRgb(av.huid)).map((v) => v * 0.8);
      let h = extra;
      for (const ch of vak) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return HUID[h % HUID.length];
    };
    const huid = new Float32Array([...huidVan(inv.schutter.vak, 1, inv.schutter.av), ...huidVan(inv.keeper.vak, 7, inv.keeper.av)]);
    const haarKl = (k) => (k.av && k.av.haar ? lin(hexRgb(k.av.haar)) : [0.04, 0.024, 0.014]);
    const haar = new Float32Array([...haarKl(inv.schutter), ...haarKl(inv.keeper)]);
    // eigen stadion: tribunekleur (het publiek draagt die kleur), gras en maaipatroon. Zonder thema precies zoals het was.
    const TH = inv.thema;
    const grasA = TH && TH.gras ? lin(hexRgb(TH.gras[0])).map((v) => v * 0.55) : [0.028, 0.085, 0.03];
    const grasB = TH && TH.gras ? lin(hexRgb(TH.gras[1])).map((v) => v * 0.55) : [0.04, 0.12, 0.042];
    const publiek = TH && TH.tribune ? lin(hexRgb(TH.tribune)) : null;
    const grasArr = new Float32Array([...grasA, ...grasB]);

    let doelen = null; // { scene, half1, half2, w, h }
    let kwaliteit = inv.laag ? 3 : 0;
    const SCHAAL = [1, 0.8, 0.62, 0.5];
    function maat() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W0 = Math.max(2, Math.round(host.clientWidth * dpr * SCHAAL[kwaliteit]));
      const H0 = Math.max(2, Math.round(host.clientHeight * dpr * SCHAAL[kwaliteit]));
      if (doelen && doelen.w === W0 && doelen.h === H0) return;
      canvas.width = W0;
      canvas.height = H0;
      const hw = Math.max(1, W0 >> 2), hh = Math.max(1, H0 >> 2);
      doelen = { scene: G.doel(W0, H0), a: G.doel(hw, hh), b: G.doel(hw, hh), w: W0, h: H0, hw, hh };
    }

    function teken(t) {
      maat();
      const cam = camera(t, W, inv);
      const S = cam.S;
      // camera-assen
      let pos = cam.pos.slice();
      const sch = cam.schud;
      if (sch > 0.001) {
        pos = plus(pos, [ruis(t * 31) * 0.05 * sch, ruis(t * 29 + 5) * 0.05 * sch, 0]);
      }
      const F = norm(min3(cam.doel, pos));
      let R = norm(kruis(F, [0, 1, 0]));
      let U = kruis(R, F);
      const rl = cam.roll + (sch > 0.001 ? ruis(t * 23 + 9) * 0.012 * sch : 0);
      if (rl) {
        const c = Math.cos(rl), s = Math.sin(rl);
        const R2 = plus(keer(R, c), keer(U, s));
        U = plus(keer(U, c), keer(R, -s));
        R = R2;
      }
      // gewrichten en romp-assen
      const J = new Float32Array(36 * 3);
      const TB = new Float32Array(18);
      [S.sch, S.kp].forEach((sk, i) => {
        sk.forEach((p, k) => J.set(p, (i * 18 + k) * 3));
        const r = norm(min3(sk[7], sk[4]));
        const u = norm(min3(sk[2], sk[0]));
        const f = norm(kruis(r, u));
        const r2 = kruis(u, f);
        TB.set(r2, i * 9);
        TB.set(u, i * 9 + 3);
        TB.set(f, i * 9 + 6);
      });
      // bal
      const ang = S.bal.spin;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rot = new Float32Array([1, 0, 0, 0, ca, sa, 0, -sa, ca]);
      const sp = new Float32Array(21);
      S.spoor.forEach((p, k) => sp.set(p, k * 3));
      const vlucht = S.s > tl.KS && S.s < tl.sI + 0.5 ? 1 : 0;
      const spoorS = vlucht * (0.5 + 0.8 * mythS) * (1 - sm(S.s, tl.sI, tl.sI + 0.4));
      // het net
      const netBol = inv.uitkomst === 'goal' ? Math.max(0, -S.bal.p[2] - 1.85) + (S.bal.net > 0 ? 0.05 * Math.sin((S.s - tl.sI) * 12) * Math.exp(-(S.s - tl.sI) * 2.5) : 0) : 0;

      const kw = kwaliteit;
      gl.bindVertexArray(G.vao);
      gl.disable(gl.BLEND);
      // ── scène ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, doelen.scene.fb);
      gl.viewport(0, 0, doelen.w, doelen.h);
      gl.useProgram(pS.p);
      pS.f2('uRes', doelen.w, doelen.h);
      pS.f1('uTime', t);
      pS.f1('uKw', kw);
      const flits = inv.uitkomst === 'goal' && !cam.replay ? Math.exp(-Math.max(0, t - tl.tI) * 1.2) * (t > tl.tI ? 1 : 0) : 0;
      pS.f1('uFlits', flits);
      pS.f1('uLicht', 1.0);
      pS.f1('uMist', 1.0);
      pS.f3('uCamPos', pos);
      pS.f3('uCamF', F);
      pS.f3('uCamR', R);
      pS.f3('uCamU', U);
      pS.f1('uTanF', Math.tan((cam.fov * Math.PI) / 360));
      pS.f3('uJ', J);
      pS.f3('uTB', TB);
      pS.f3('uKit', kitArr);
      pS.f3('uRim', new Float32Array([...rimA, ...rimB]));
      pS.f3('uHuid', huid);
      pS.f3('uHaar', haar);
      pS.f3('uGras', grasArr);
      pS.f4('uPubliek', publiek ? [...publiek, 1] : [0, 0, 0, 0]);
      pS.f1('uVeld', TH ? TH.veld : 0);
      pS.f4('uBal', [...S.bal.p, 1]);
      pS.m3('uBalRot', rot);
      pS.f3('uSpoor', sp);
      pS.f4('uSpoorK', [...spoorKleur, spoorS]);
      pS.f4('uNet', [W.bp.E[0], W.bp.E[1], netBol, S.s - tl.sI]);
      pS.f2('uMyth', mythS, trK >= 3 ? 1 : 0);
      if (!getalTex) getalTex = maakGetalTex(gl, inv);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, getalTex);
      pS.i1('uGetal', 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // ── bloom ──
      gl.viewport(0, 0, doelen.hw, doelen.hh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, doelen.a.fb);
      gl.useProgram(pH.p);
      gl.bindTexture(gl.TEXTURE_2D, doelen.scene.tex);
      pH.i1('uTex', 0);
      pH.f2('uTexel', 1.5 / doelen.w, 1.5 / doelen.h);
      pH.f1('uDrempel', 0.75);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (let k = 0; k < 2; k++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, doelen.b.fb);
        gl.useProgram(pV.p);
        gl.bindTexture(gl.TEXTURE_2D, doelen.a.tex);
        pV.i1('uTex', 0);
        pV.f2('uDir', (1 + k) / doelen.hw, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, doelen.a.fb);
        gl.bindTexture(gl.TEXTURE_2D, doelen.b.tex);
        pV.f2('uDir', 0, (1 + k) / doelen.hh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      // ── samenstellen ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, doelen.w, doelen.h);
      gl.useProgram(pC.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, doelen.scene.tex);
      pC.i1('uTex', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, doelen.a.tex);
      pC.i1('uBloom', 1);
      gl.activeTexture(gl.TEXTURE0);
      pC.f2('uRes', doelen.w, doelen.h);
      pC.f1('uBloomS', 0.55 + 0.5 * flits);
      pC.f1('uTime', t);
      // een korte witte flits bij de inslag van een goal (gedoseerd)
      pC.f1('uFlits', inv.uitkomst === 'goal' && !cam.replay ? 0.12 * Math.exp(-Math.max(0, t - tl.tI) * 10) * (t > tl.tI ? 1 : 0) : 0);
      // in- en uitfaden, en een korte dip bij de cut naar de herhaling
      const zwart = 1 - sm(t, 0, 0.6) + sm(t, tl.EIND - 0.6, tl.EIND);
      pC.f1('uZwart', klem(zwart, 0, 1));
      // vloek: de glitch-rand als de vervloekte speler in beeld is (begint subtiel)
      const focusSch = [2, 3, 5, 6, 9].includes(cam.shot) && !(cam.shot === 9 && inv.uitkomst === 'redding');
      const focusKp = [4, 8].includes(cam.shot) || (cam.shot === 9 && inv.uitkomst === 'redding');
      const vl = (inv.schutter.vloek ? (focusSch ? 1 : 0.35) : 0) + (inv.keeper.vloek ? (focusKp ? 1 : 0.35) : 0);
      pC.f1('uGlitch', klem(vl, 0, 1) * (0.2 + 0.4 * sm(t, 2, 8)));
      pC.f3('uGlitchK', [0.7, 0.2, 1.0]);
      const wipe = t > tl.tR - 0.35 && t < tl.tR + 0.35 ? ramp(t, tl.tR - 0.35, tl.tR + 0.35) : t > tl.tRE - 0.35 && t < tl.tRE + 0.35 ? ramp(t, tl.tRE - 0.35, tl.tRE + 0.35) : 0;
      pC.f1('uWipe', wipe);
      pC.f1('uKorrel', kw < 3 ? 0.025 : 0);
      // cinematische balken tijdens de close-ups en de slow-motion
      const balk = 0.11 * venster(t, tl.tS3a, tl.tDoelcam, 0.25, 0.2);
      pC.f1('uBalk', balk);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      zetOverlay(ov, t, W, inv, cam);
      return cam;
    }

    // ── afspelen ──
    const audio = maakGeluid(inv.stil);
    const cues = geluidCues(W, inv);
    let t0 = null, raf = 0, vorigeT = -1, dood = false, gepauzeerd = !!invoer.pauze;
    let trage = 0, laatsteStap = 0;
    let gezocht = null;
    function lus(nu) {
      if (dood) return;
      raf = requestAnimationFrame(lus);
      if (gezocht !== null) return;
      if (t0 === null) t0 = nu;
      const t = (nu - t0) / 1000;
      for (const c of cues) if (c[0] > vorigeT && c[0] <= t) audio.speel(c[1], c[2]);
      const a = performance.now();
      try {
        teken(Math.min(t, tl.EIND));
      } catch (e) {
        if (inv.debug) console.error('[strafschop]', e);
      }
      // adaptieve kwaliteit: te veel trage beelden achter elkaar → een stap omlaag
      const d = performance.now() - a;
      if (vorigeT >= 0 && nu - (lus.vorig || nu) > 40) trage++;
      else trage = Math.max(0, trage - 1);
      lus.vorig = nu;
      if (trage > 12 && kwaliteit < 3 && nu - laatsteStap > 900) {
        kwaliteit++;
        trage = 0;
        laatsteStap = nu;
        if (inv.debug) console.log('[strafschop] kwaliteit →', kwaliteit, d.toFixed(1) + 'ms');
      }
      vorigeT = t;
      if (t > tl.EIND + 0.3) sluit();
    }
    function sluit() {
      dood = true;
      cancelAnimationFrame(raf);
      audio.stop();
      if (typeof invoer.opKlaar === 'function') {
        try {
          invoer.opKlaar({ uitkomst: inv.uitkomst });
        } catch (e) {
          /* niets */
        }
      }
    }
    const lettertypes = SPO.art && SPO.art.laadLettertypes ? SPO.art.laadLettertypes() : Promise.resolve();
    Promise.race([Promise.all([audio.klaar, lettertypes]), new Promise((r) => setTimeout(r, 3000))]).then(() => {
      if (getalTex) {
        gl.deleteTexture(getalTex);
        getalTex = null;
      }
      if (!gepauzeerd) raf = requestAnimationFrame(lus);
    });
    const api = {
      tl,
      seek(t) {
        gezocht = t;
        if (getalTex === null) {
          /* wordt in teken gemaakt */
        }
        const cam = teken(t);
        gl.finish();
        return { shot: cam.shot, s: cam.s };
      },
      status: () => ({ kwaliteit, breedte: canvas.width, hoogte: canvas.height }),
      get beginMs() {
        return t0;
      },
      zetKwaliteit(k) {
        kwaliteit = klem(k | 0, 0, 3);
      },
      sluit,
      host,
    };
    if (inv.debug) window.__somPackDebug = api;
    return api;
  }

  SPO.strafschop = { start, maakInvoer, maakTijdlijn, maakWereld };
  if (window.__somStrafschop) {
    const go = () => start(window.__somStrafschop);
    if (document.body) go();
    else document.addEventListener('DOMContentLoaded', go);
  }
})();
