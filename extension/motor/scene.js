/*
 * Somtoday Pack Opener — scene.js
 * De regie van de animatie. Alles is een functie van de tijd t (in seconden): teken(t) tekent precies
 * het beeld op dat moment. Daardoor is elk moment te testen en haperen er geen losse toestanden.
 *
 * Verloop (opening 'pak', de standaard):
 *   aanloop    vak en onderwerp vliegen door een tunnel van licht langs je heen
 *   pakje      het pakje klapt neer en laadt op, steeds heftiger
 *   scheuren   licht, schokgolven, vonken
 *   walkout    (vanaf een 7) de leerling loopt de arena in, met plaatjes voor vak, onderwerp en weging
 *   kaart      de kaart draait uit het licht, het cijfer telt op, en dan de onthulling
 *
 * Er zijn meer openingen (kluis, plinko, ster, raket): elk een eigen module in motor/openingen/ die alleen het
 * stuk vóór de kaart verzorgt. De kaart, de titel, het tellen, de onthulling, de confetti en het vuurwerk zijn
 * voor alle openingen gelijk en staan hier. Zie motor/openingen/LEESMIJ.md voor het contract.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const { klem, mix, glad, uitEase, inEase, veer } = SPO;

  const FOV = (40 * Math.PI) / 180;
  const F = 1 / Math.tan(FOV / 2);
  const CAM_Z = 3;
  const H_ZICHT = 2 * CAM_Z * Math.tan(FOV / 2); // zichthoogte op z = 0, in wereld-eenheden
  const KAART_H = 1.45;
  const KAART_B = KAART_H * (300 / 440);
  const PAK_H = 1.44;
  const PAK_B = 0.96;
  const TWEE_PI = Math.PI * 2;
  const SCHEUR = SPO.art.SCHEUR;

  const ramp = (t, a, b) => klem((t - a) / (b - a), 0, 1);
  const sm = (t, a, b) => glad(ramp(t, a, b));

  // Hoe heftig elk niveau eruitziet.
  const LOOK = [
    { stralen: 7, flits: 0.5, schud: 0.55, bloom: 0.5, ca: 0.0015, sat: 0.78, vig: 0.62, holo: 0.1, glit: 0.2 },
    { stralen: 10, flits: 0.75, schud: 0.75, bloom: 0.58, ca: 0.002, sat: 1.0, vig: 0.55, holo: 0.38, glit: 0.7 },
    { stralen: 14, flits: 1.0, schud: 1.0, bloom: 0.66, ca: 0.003, sat: 1.06, vig: 0.52, holo: 0.5, glit: 1.0 },
    { stralen: 18, flits: 1.15, schud: 1.2, bloom: 0.76, ca: 0.004, sat: 1.1, vig: 0.55, holo: 0.9, glit: 1.2 },
    { stralen: 22, flits: 1.3, schud: 1.4, bloom: 0.86, ca: 0.005, sat: 1.1, vig: 0.5, holo: 1.15, glit: 1.5 },
  ];

  // ───────────────────────── Tijdlijn ─────────────────────────
  // De kaartonthulling duurt bij elke opening even lang en begint bij K0.
  function kaartTijden(tl, d) {
    const { I, snel } = d;
    tl.spin = snel ? 0.85 : 1.35; // draaitijd van de kaart
    tl.telStart = tl.K0 + tl.spin * 0.85;
    tl.telDuur = snel ? 0.75 : 1.05 + 0.85 * I;
    tl.RV = tl.telStart + tl.telDuur; // de onthulling
    tl.EIND = tl.RV + (snel ? 1.0 : 1.6); // vanaf hier verschijnen de knoppen
    return tl;
  }

  function maakTijdlijn(d) {
    const op = d.opening !== 'pak' && SPO.openingen ? SPO.openingen[d.opening] : null;
    if (op) {
      // E: het hoogtepunt van de opening, K0: hier begint de kaart; staart: hoe lang de opening na K0 nog tekent.
      return kaartTijden(Object.assign({ vak: null, onder: null, pakIn: [0, 0], wo: null, staart: 0.5 }, op.tijdlijn(d)), d);
    }
    const { I, walkout, snel } = d;
    const tl = {};
    if (snel) {
      tl.vak = null;
      tl.onder = null;
      tl.pakIn = [0, 0.65];
    } else {
      tl.vak = [0.3, 1.95];
      tl.onder = [1.35, 2.95];
      tl.pakIn = [2.35, 3.4];
    }
    const c1 = tl.pakIn[1];
    tl.E = c1 + (snel ? 0.55 + 0.6 * I : 1.8 + 1.5 * I); // het moment van scheuren
    if (walkout) {
      const w0 = tl.E + (snel ? 0.3 : 0.5);
      const wd = snel ? 2.6 + 0.6 * I : 5.4 + 1.5 * I;
      tl.wo = [w0, w0 + wd];
      tl.K0 = w0 + wd;
    } else {
      tl.wo = null;
      tl.K0 = tl.E + (snel ? 0.45 : 0.85);
    }
    return kaartTijden(tl, d);
  }

  // ───────────────────────── Scène ─────────────────────────
  // motor: SPO.Motor; d: SPO.maakData; lagen: uit art.maakKaartLagen; audio en terugroepers van pack.js
  function maakScene(motor, d, art, hulp) {
    const gl = motor.gl;
    const P = motor.p;
    const T = d.T;
    const tier = d.tier;
    const I = d.I;
    const L = LOOK[tier];
    const op = d.opening !== 'pak' && SPO.openingen ? SPO.openingen[d.opening] : null;
    const tl = maakTijdlijn(d);
    const regenboog = tier === 4;
    const reduceer = !!hulp.minderBeweging;
    const kl = [0, 0, 0];
    const kl2 = [0, 0, 0];
    const sk1 = [0, 0, 0]; // kleuren van stof en bokeh: neutraal tot het pakje er is
    const sk2 = [0, 0, 0];

    // tekstuur-eigendom
    const tex = {
      bg: motor.tekstuur(art.lagen.bg),
      mid: motor.tekstuur(art.lagen.mid),
      fg: motor.tekstuur(art.lagen.fgNaam || art.lagen.fg),
      masker: motor.tekstuur(art.lagen.masker, { mip: false }),
      achter: motor.tekstuur(art.lagen.achter),
      cijfer: motor.tekstuur(art.lagen.cijfer, { mip: false }),
      pak: art.pak ? motor.tekstuur(art.pak) : null,
      titel: motor.tekstuur(art.titel),
      vak: art.vakTekst ? motor.tekstuur(art.vakTekst) : null,
      onder: art.onderTekst ? motor.tekstuur(art.onderTekst) : null,
      plaat: art.platen ? art.platen.map((c) => motor.tekstuur(c)) : [],
    };
    const platenInfo = art.platen
      ? [
          { x: -1, y: 0.7, t0: 0.12 },
          { x: 1, y: 0.5, t0: 0.38 },
          { x: -1, y: 0.3, t0: 0.62 },
        ]
      : [];

    // Kleur van het licht: bij een Icoon wisselt die langzaam van tint.
    function kleuren(t) {
      if (regenboog) {
        SPO.hsv(t * 0.12, 0.62, 1, kl);
        SPO.hsv(t * 0.12 + 0.35, 0.8, 1, kl2);
      } else {
        kl[0] = T.kleur[0];
        kl[1] = T.kleur[1];
        kl[2] = T.kleur[2];
        kl2[0] = T.kleur2[0];
        kl2[1] = T.kleur2[1];
        kl2[2] = T.kleur2[2];
      }
    }

    // ───── gebeurtenissen: dingen die één keer gebeuren (geluid, trillen, onthullen) ─────
    const ev = [];
    const at = (tijd, fn) => ev.push({ tijd, fn, klaar: false });
    const { audio, onthul, trillen } = hulp;
    const { E, K0, RV } = tl;
    const c1 = tl.pakIn[1];

    const stappen = [];
    if (!op) {
      if (tl.vak) at(tl.vak[0] + 0.1, () => audio.whoosh(0.55 + 0.4 * I));
      if (tl.onder) at(tl.onder[0] + 0.1, () => audio.whoosh(0.55 + 0.4 * I));
      at(tl.pakIn[0] + (tl.vak ? 0.25 : 0), () => audio.whoosh(0.7 + 0.3 * I));
      at(c1, () => {
        audio.boem(0.3 + 0.2 * I, 1.15);
        trillen(20);
      });
      at(c1 + 0.05, () => audio.riser(E - c1 - 0.05, 0.6 + 0.4 * I));
      // Het scheurgeluid heeft zijn eerste klap na 0,1 s, dus starten we iets eerder: dan valt die precies op E.
      at(E - 0.1, () => audio.scheur(0.8 + 0.2 * I));
      at(E, () => {
        audio.boem(0.6 + 0.4 * I);
        trillen([30, 20, 60]);
      });
      if (tl.wo) {
        const [w0, w1] = tl.wo;
        const WO = w1 - w0;
        at(w0 + 0.05, () => audio.publiek(WO + 0.3, 0.5 + 0.5 * I));
        // De hartslag en de stappen vormen samen één ritme dat steeds luider wordt.
        const sp = Math.PI / 5.2; // één stap duurt zo lang (de stapfase loopt met 5,2 rad/s)
        for (let k = 0; ; k++) {
          const ts = w0 + 0.25 + k * sp;
          if (ts > w1 - 0.45) break;
          const q = (ts - w0) / WO;
          stappen.push(ts);
          at(ts, () => {
            audio.stap(0.25 + 0.75 * Math.pow(q, 1.2) * (0.6 + 0.4 * I), k % 2 ? 0.15 : -0.15);
            audio.hartslag((0.3 + 0.6 * q) * (0.6 + 0.4 * I));
          });
        }
        // fotografen: onregelmatig en steeds sneller naarmate de leerling dichterbij komt
        let ts = w0 + 0.9;
        while (ts < w1 - 0.3) {
          const q = (ts - w0) / WO;
          at(ts, () => audio.sluiter());
          ts += (0.22 + Math.random() * 0.3) * (1.5 - q);
        }
        platenInfo.forEach((pl, i) => at(w0 + WO * pl.t0, () => audio.zwiep(0.45, 1.25 + i * 0.1)));
        at(w1 - 0.2, () => audio.whoosh(0.6));
      }
    }
    at(K0 - 0.05, () => audio.zwiep(0.7, 0.8));
    at(K0 + tl.spin * 0.78, () => audio.boem(0.18 + 0.12 * I, 1.5)); // de kaart landt
    at(RV, () => {
      audio.boem(tier === 0 ? 0.35 : 0.7 + 0.3 * I);
      audio.onthulling(0.8 + 0.2 * I);
      if (d.g >= 6) audio.gejuich(2.5 + 1.5 * I, 0.5 + 0.5 * I);
      onthul();
      trillen(tier >= 3 ? [60, 40, 60, 40, 200] : tier >= 2 ? [40, 30, 80] : 30);
    });

    // vuurwerk vanaf een 9
    const vuurwerk = [];
    if (d.g >= 9) {
      const aantal = tier === 4 ? 14 : 5;
      for (let i = 0; i < aantal; i++) {
        const tt = RV + 0.5 + i * (tier === 4 ? 0.34 : 0.45);
        vuurwerk.push({ t: tt, x: (Math.random() - 0.5) * 0.9, y: 0.0 + Math.random() * 0.34, h: Math.random() });
        at(tt + 0.55, () => audio.vuurwerk());
      }
    }
    const fwData = new Float32Array(64);
    for (let i = 0; i < 16; i++) {
      fwData[i * 4 + 2] = -100;
      const v = vuurwerk[i];
      if (v) {
        fwData[i * 4] = v.x * 1.6; // x in p-ruimte wordt in teken() met de beeldverhouding vermenigvuldigd
        fwData[i * 4 + 1] = v.y;
        fwData[i * 4 + 2] = v.t;
        fwData[i * 4 + 3] = v.h;
      }
    }

    // ───── schokken (camera), flitsen en schokgolven ─────
    const lekP = ((0.5 - SCHEUR) * PAK_H) / H_ZICHT; // hoogte van de scheurlijn in p-ruimte
    const schokken = [];
    const flitsen = [];
    const golven = [];
    const schok = (t0, amp, dec) => schokken.push({ t: t0, amp: amp * L.schud * (reduceer ? 0.15 : 1), dec });
    const flits = (t0, sterkte, dec) => flitsen.push({ t: t0, p: sterkte * (reduceer ? 0.4 : 1), dec });
    const golf = (t0, snelheid, sterkte, y) => golven.push({ t: t0, v: snelheid, s: sterkte, y: y || 0 });

    if (!op) {
      schok(c1, 0.022, 0.18);
      flits(c1, 0.2, 0.1);
      golf(c1, 0.9, 0.45, 0);
      schok(E, 0.05, 0.28);
      flits(E, 0.5, 0.025); // een heel korte, felle pop
      flits(E, 0.22 + 0.28 * I, 0.1 + 0.18 * I);
      golf(E, 1.5, 1.0, lekP);
      golf(E + 0.09, 1.1, 0.7, lekP);
      if (tl.wo) {
        flits(tl.wo[0] + 0.12, 0.25, 0.2);
        for (const ts of stappen) {
          const q = (ts - tl.wo[0]) / (tl.wo[1] - tl.wo[0]);
          schok(ts, 0.0016 + 0.009 * q * q, 0.12);
        }
        flits(K0 - 0.04, 0.8, 0.3);
      }
      // oplaadgolven rond het pakje: steeds sneller
      for (let ts = c1 + 0.35, stap = 0.55; ts < E - 0.15; ts += stap, stap = Math.max(0.22, stap * 0.87)) golf(ts, 0.7, 0.16 + 0.2 * I, 0);
    } else {
      flits(K0 - 0.04, 0.8, 0.3); // de kaart komt uit een felle flits
    }
    schok(K0, 0.02, 0.2);
    schok(RV, 0.03 + 0.06 * I, 0.3 + 0.3 * I);
    flits(RV, 0.35, 0.03);
    flits(RV, 0.12 + 0.18 * I, 0.1 + 0.25 * I);
    golf(RV, 1.2, 0.8, 0.03);
    golf(RV + 0.1, 1.6, 0.6, 0.03);
    if (tier >= 2) golf(RV + 0.22, 2.0, 0.5, 0.03);
    if (tier === 4) {
      flits(RV + 0.35, 0.35, 0.3);
      golf(RV + 0.35, 1.6, 0.8, 0.03);
    }

    // ───── deeltjes ─────
    const standaard = {
      mode: 0, t0: 0, life: 2, delay: 0, n: 100, org: [0, 0], angle: 0, spread: TWEE_PI, spd: [0.2, 0.8], grav: [0, -0.3],
      drag: 1, size: [0.002, 0.005], col1: [1, 1, 1], col2: [1, 1, 1], regen: 0, alpha: 1, blend: 'optel', seed: 1, per: 1, lod: true,
    };
    const emit = [];
    const e = (o) => {
      const x = Object.assign({}, standaard, o);
      emit.push(x);
      return x;
    };
    const wit = [1, 0.96, 0.85];
    const pakRand = [0.62, 0.28, 0];
    // stof en bokeh door alles heen (alleen bij het pakje)
    let stof = null;
    if (!op) {
      stof = e({ mode: 1, n: 70, life: 9, size: [0.006, 0.03], col1: sk1, col2: sk2, alpha: 0.5, seed: 11, lod: true });
      // vonken uit de naad tijdens het opladen
      const lekY = lekP;
      e({ mode: 0, t0: c1 + 0.1, delay: E - c1 - 0.3, life: 0.9, n: Math.round(160 + 340 * I), org: [0, lekY], angle: 0, spread: TWEE_PI, spd: [0.05, 0.45], grav: [0, -0.05], drag: 1.5, size: [0.0016, 0.0042], col1: kl, col2: wit, seed: 3 });
      // de scheur zelf
      const nBrand = Math.round(300 + 1300 * I);
      e({ mode: 0, t0: E, delay: 0.1, life: 1.6, n: nBrand, org: [0, lekY], angle: Math.PI / 2, spread: TWEE_PI, spd: [0.25, 1.9], grav: [0, -0.45], drag: 1.2, size: [0.002, 0.0065], col1: kl, col2: wit, seed: 5 });
      e({ mode: 5, t0: E, life: 1.8, n: Math.round(70 + 190 * I), org: [0, lekY], angle: Math.PI / 2, spread: TWEE_PI, spd: [0.25, 1.1], grav: [0, -0.8], drag: 0.6, size: [0.012, 0.03], col1: [0.25, 0.3, 0.85], col2: [1, 0.8, 0.3], alpha: 1, blend: 'alpha', seed: 6 });
    }
    // de onthulling
    const rvVonken = e({ mode: 0, t0: RV, delay: 0.14, life: 2.2, n: Math.round(300 + 1500 * I), org: [0, 0.02], angle: 0, spread: TWEE_PI, spd: [0.3, 2.3], grav: [0, -0.35], drag: 1.1, size: [0.002, 0.007], col1: kl, col2: kl2, alpha: 0.75, regen: regenboog ? 1 : 0, seed: 8 });
    if (tier === 0) {
      e({ mode: 3, t0: RV, life: 5, delay: 0.2, n: 160, alpha: 0.8, seed: 9, blend: 'alpha' });
      e({ mode: 6, t0: RV, life: 3.2, delay: 0.5, n: 14, org: [0, -0.2], size: [0.18, 0.4], col1: [0.16, 0.12, 0.1], col2: [0.3, 0.22, 0.16], blend: 'alpha', seed: 10, lod: false });
    } else if (d.g >= 6) {
      e({ mode: 2, t0: RV + 0.1, life: 4.6, delay: 1.1, n: Math.round(50 + 330 * Math.max(0, I - 0.5) * 2 * (d.g >= 9 ? 1.4 : 1)), org: [0, 0.62], angle: -Math.PI / 2, spread: 0.7, spd: [0.1, 0.45], grav: [0, -0.09], drag: 0.45, size: [0.008, 0.017], alpha: 1, blend: 'alpha', seed: 12 });
    }
    // een staart van vonken terwijl de kaart de lucht in draait
    e({ mode: 0, t0: K0, delay: tl.spin * 0.9, life: 0.9, n: Math.round(80 + 260 * I), org: [0, 0.01], angle: 0, spread: TWEE_PI, spd: [0.12, 0.7], grav: [0, 0], drag: 2.2, size: [0.0014, 0.0038], col1: kl, col2: wit, alpha: 0.7, seed: 15 });
    const vw = e({ mode: 4, t0: 0, life: 2.4, n: 16 * 140, per: 140, alpha: 1, seed: 13, lod: false });
    // zwevende lichtjes bij de walkout
    if (tl.wo) e({ mode: 1, t0: 0, n: 50, life: 6, size: [0.004, 0.018], col1: kl, col2: wit, alpha: 0.7, seed: 14 });

    // ───── toestand ─────
    const S = { laatsteTel: -1, pop: 1, popT: -9 };
    const kantel = [0, 0];
    const skip = new Set(); // alleen voor foutopsporing: lagen die je wilt uitzetten
    const aan = (naam) => !skip.has(naam);
    let asp = 1;
    let lod = 1;
    let opInst = null; // de lopende opening (zie motor/openingen/), of null bij het pakje
    let opFouten = 0; // hoe vaak de opening een fout gaf; main.js springt dan door naar de kaart
    const eigenTex = []; // tekstuur die een opening via ctx.tekstuur heeft gemaakt: die ruimen wij op
    // Een opening zet hier per beeld haar wensen voor de nabewerking in (zie eindbeeld).
    const post = { rad: 0, zoom: 1, roll: 0, bars: 0, bloom: 1, streak: 0, vig: 1, ca: 1, sat: 1, grade: [1, 1, 1] };
    const rust2Van = (t) => (t >= RV ? sm(t, RV + 0.9, RV + 2.6) : 0); // na de onthulling wordt het beeld rustiger

    // schudden van de camera: een som van dempende stoten plus een voortdurend gerommel bij het opladen
    function camera(t, uit) {
      let a = 0;
      for (let i = 0; i < schokken.length; i++) {
        const s = schokken[i];
        const dt = t - s.t;
        if (dt >= 0 && dt < s.dec * 6) a += s.amp * Math.exp(-dt / s.dec);
      }
      if (op) {
        if (opInst && opInst.schud) a += opInst.schud(t) * (reduceer ? 0.15 : 1);
      } else {
        if (t > c1 && t < E) a += 0.0006 + 0.0075 * Math.pow(ramp(t, c1, E), 2.2) * L.schud * (0.5 + I) * (reduceer ? 0.15 : 1);
        if (tl.wo && t > tl.wo[0] && t < K0) a += 0.0008 + 0.004 * Math.pow(ramp(t, tl.wo[0], K0), 3) * L.schud * (reduceer ? 0.15 : 1);
      }
      uit.x = a * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.1 + 1.3) * 0.4);
      uit.y = a * (Math.sin(t * 53.7 + 0.7) * 0.6 + Math.sin(t * 29.9 + 2.1) * 0.4);
      uit.a = a;
    }
    const cam = { x: 0, y: 0, a: 0, zoom: 1, roll: 0 };

    function flitsAt(t) {
      let f = 0;
      for (let i = 0; i < flitsen.length; i++) {
        const x = flitsen[i];
        const dt = t - x.t;
        if (dt >= 0 && dt < x.dec * 8) f += x.p * Math.exp(-dt / x.dec);
        else if (dt < 0 && dt > -0.0) f += 0;
      }
      return f;
    }

    // ───── hulpjes om iets te tekenen ─────
    function obj(p, x, y, z, rx, ry, rz, sx, sy, px, py) {
      p.f3('uPos', x, y, z);
      p.f3('uRot', rx, ry, rz);
      p.f2('uScl', sx, sy);
      p.f2('uPivot', px || 0, py || 0);
      p.f3('uCamPos', -cam.x * H_ZICHT, -cam.y * H_ZICHT, CAM_Z / cam.zoom);
      p.f1('uRoll', 0);
      p.f1('uAspect', asp);
      p.f1('uF', F);
    }
    const basis = (p) => {
      p.f2('uRes', motor.breedte, motor.hoogte);
      p.f2('uShake', cam.x, cam.y);
      p.f1('uZoom', cam.zoom);
    };

    // De aanloop is eerst koel blauwwit en krijgt pas bij het pakje de kleur van het niveau.
    const koel = [0.55, 0.72, 1.0];
    const koel2 = [0.25, 0.35, 0.9];
    const wt = koel.slice();
    const wt2 = koel2.slice();
    // Tot het pakje aankomt blijft alles koel en neutraal: je mag pas aan het licht zien wat voor cijfer het is.
    function neutraal(tk) {
      const w = 0.12 + 0.88 * sm(tk, tl.pakIn[0] - 0.1, c1);
      for (let i = 0; i < 3; i++) {
        wt[i] = mix(koel[i], kl[i], w);
        wt2[i] = mix(koel2[i], kl2[i], w);
        sk1[i] = wt[i];
        sk2[i] = wt2[i];
      }
    }
    function warp(t, alpha, speed, glow, k1 = wt, k2 = wt2) {
      if (alpha <= 0.001) return;
      const p = P.warp.gebruik();
      basis(p);
      p.f1('uTime', t);
      p.f1('uSpeed', speed);
      p.f1('uGlow', glow);
      p.f1('uAlpha', alpha);
      p.v3('uTint', k1);
      p.v3('uTint2', k2);
      motor.mengen('optel');
      motor.volledig();
    }

    function stralen(t, alpha, pow, core, haze, cx, cy, rot, donker, k1 = kl, k2 = kl2, aantal = L.stralen) {
      if (alpha <= 0.001) return;
      const p = P.stralen.gebruik();
      basis(p);
      p.f2('uCenter', cx, cy);
      p.f1('uTime', t);
      p.f1('uPow', pow);
      p.f1('uCore', core);
      p.f1('uRot', rot);
      p.f1('uCount', aantal);
      p.f1('uHaze', haze);
      p.f1('uRegen', regenboog ? 1 : 0);
      p.f1('uAlpha', alpha);
      p.f1('uDonker', donker);
      p.v3('uCol', k1);
      p.v3('uCol2', k2);
      motor.mengen('optel');
      motor.volledig();
    }

    function licht(t, cx, cy, bundel, breed, streep, ster, rot, k1 = kl) {
      if (bundel + streep + ster <= 0.002) return;
      const p = P.licht.gebruik();
      basis(p);
      p.f2('uCenter', cx, cy);
      p.f1('uBundel', bundel);
      p.f1('uBreed', breed);
      p.f1('uStreep', streep);
      p.f1('uSter', ster);
      p.f1('uRot', rot);
      p.f1('uCount', 6 + L.stralen * 0.9);
      p.f1('uRegen', regenboog ? 1 : 0);
      p.f1('uTime', t);
      p.v3('uCol', k1);
      motor.mengen('optel');
      motor.volledig();
    }

    function vlak(t, tx, x, y, z, rx, ry, rz, w, h, alpha, veeg, optel, glitch, tint = kl) {
      const p = P.plaat.gebruik();
      obj(p, x, y, z, rx, ry, rz, w, h);
      p.tex('uTex', 0, tx);
      p.f1('uAlpha', alpha);
      p.f1('uVeeg', veeg);
      p.f1('uOptel', optel || 0);
      p.f1('uTime', t);
      p.f1('uGlitch', glitch || 0);
      p.v3('uTint', tint);
      motor.mengen('alpha');
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      motor.teken.draws++;
    }

    function pakDeel(t, deel, alpha, x, y, z, rx, ry, rz, schaal, bol, laad, glans, pivotY) {
      const p = P.pak.gebruik();
      obj(p, x, y, z, rx, ry, rz, PAK_B * schaal, PAK_H * schaal, 0, pivotY || 0);
      p.f1('uBol', bol);
      p.i2('uRaster', 22, 34);
      p.tex('uTex', 0, tex.pak);
      p.f1('uDeel', deel);
      p.f1('uScheurY', SCHEUR);
      p.f1('uLaad', laad);
      p.f1('uTime', t);
      p.f1('uSeed', 3.7);
      p.f1('uAlpha', alpha);
      p.f1('uRand', tier >= 1 || laad > 0.2 ? 1 : 0.5);
      p.f1('uGlans', glans);
      p.v3('uCol', kl);
      p.v3('uCol2', kl2);
      p.f2('uKantel', kantel[0], kantel[1]);
      motor.mengen('alpha');
      gl.drawArrays(gl.TRIANGLES, 0, 22 * 34 * 6);
      motor.teken.draws++;
    }

    function zendDeeltjes(t, o) {
      const p = P.deeltjes.gebruik();
      const n = o.lod ? Math.max(1, Math.round(o.n * lod)) : o.n;
      p.f1('uTime', t);
      p.f1('uAspect', asp);
      p.i1('uMode', o.mode);
      p.i1('uPer', o.per);
      p.f1('uT0', o.t0);
      p.f1('uLife', o.life);
      p.f1('uDelay', o.delay);
      p.f1('uDrag', o.drag);
      p.f1('uAngle', o.angle);
      p.f1('uSpread', o.spread);
      p.f1('uAlpha', o.alpha);
      p.f1('uSeed', o.seed);
      p.f1('uRegen', o.regen);
      p.f2('uOrg', o.org[0], o.org[1]);
      p.f2('uSpd', o.spd[0], o.spd[1]);
      p.f2('uGrav', o.grav[0], o.grav[1]);
      p.f2('uSize', o.size[0], o.size[1]);
      p.f2('uCam', cam.x, cam.y);
      p.v3('uCol1', o.col1);
      p.v3('uCol2', o.col2);
      if (o.mode === 4) p.v4s('uFw[0]', fwData);
      motor.mengen(o.blend === 'alpha' ? 'alpha' : 'optel');
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      motor.teken.draws++;
    }

    // ───── de opening starten ─────
    // De opening krijgt alles wat ze nodig heeft in één object (zie motor/openingen/LEESMIJ.md).
    if (op) {
      const ctx = {
        motor, gl, d, tl, art: art.opening, artAlles: art, I, tier, T, L, regenboog, reduceer, kl, kl2, cam, post, audio, trillen, onthul,
        H_ZICHT, F, CAM_Z, KAART_H, KAART_B, TWEE_PI,
        get asp() {
          return asp;
        },
        get visB() {
          return H_ZICHT * asp;
        },
        get lod() {
          return lod;
        },
        at, schok, flits, golf,
        // een eigen deeltjesbron: die tekent de opening zelf (ctx.zend) en wordt niet automatisch meegetekend
        e(o) {
          const x = e(o);
          x.eigen = true;
          return x;
        },
        zend: zendDeeltjes,
        obj, basis, vlak, stralen, licht, warp,
        ramp, sm, klem, mix, glad, veer,
        aan,
        prog: (naam) => P[op.naam + '.' + naam],
        tekstuur(bron, opties) {
          const t = motor.tekstuur(bron, opties);
          eigenTex.push(t);
          return t;
        },
      };
      opInst = op.maak(ctx);
    }
    ev.sort((a, b) => a.tijd - b.tijd);

    // Lichtstralen achter het pakje en achter de kaart (bij het pakje niet tijdens de walkout). Bij de andere
    // openingen zijn ze er pas vanaf het moment dat de kaart komt.
    function kaartStralen(t, laad) {
      const wo = tl.wo;
      const rustig2 = rust2Van(t);
      let stralenKans = op ? sm(t, K0 - 0.05, K0 + 0.25) : sm(t, c1, c1 + 0.35);
      if (!op && wo) stralenKans *= klem(1 - sm(t, wo[0] - 0.12, wo[0] + 0.18) + sm(t, K0 - 0.05, K0 + 0.25), 0, 1);
      if (stralenKans > 0.001 && aan('stralen')) {
        let pow;
        let core;
        let haze = 0.2;
        if (t < E) {
          pow = 0.1 + (0.35 + 0.9 * I) * laad * laad;
          core = 0.06 + (0.25 + 0.7 * I) * laad * laad;
        } else if (t < K0) {
          pow = (0.22 + 0.45 * I) * Math.exp(-(t - E) / 0.6) + 0.3;
          core = (0.18 + 0.28 * I) * Math.exp(-(t - E) / 0.4) + 0.1;
        } else {
          const cp = ramp(t, K0, RV);
          pow = 0.35 + 0.55 * I + (0.25 + 0.5 * I) * cp;
          core = 0.15 + 0.4 * cp;
          if (t >= RV) {
            core += (0.18 + 0.3 * I) * Math.exp(-(t - RV) / 0.4);
            pow += (0.25 + 0.35 * I) * Math.exp(-(t - RV) / 0.7);
          }
          haze = 0.22;
        }
        const dim = 1 - 0.62 * rustig2;
        stralen(t, stralenKans * (1 - 0.35 * rustig2), pow * dim, core * dim, haze, 0, 0.02, t * (0.12 + 0.35 * laad + (t >= RV ? 0.2 : 0)), 1);
      }
    }

    // ───── één beeld ─────
    // inv: { tilt: [x, y] (-1..1), afspelen: bool }
    function teken(t, dt, inv) {
      asp = motor.breedte / motor.hoogte;
      kleuren(t);
      camera(t, cam);
      // Op smalle schermen (een telefoon rechtop) passen we de afmetingen aan de breedte aan.
      const visB = H_ZICHT * asp; // zichtbare breedte op z = 0
      const fit = klem((visB * 0.8) / KAART_B, 0.5, 1);
      const R = (v) => v * fit;
      const laad = op ? 1 : t < c1 ? 0 : glad(ramp(t, c1, E));
      const wo = tl.wo;
      const walkoutBezig = !!wo && t >= wo[0] - 0.02 && t < K0 + 0.12;

      motor.doel(motor.doelen.scene);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      motor.mengen('optel');

      // ── achtergrond ──
      if (!op) {
        neutraal(t);
        const aanloop = (1 - sm(t, c1, c1 + 0.3)) * sm(t, 0, 0.5);
        if (aan('warp')) warp(t, aanloop, 0.45 + 1.4 * sm(t, 0, c1) - (t > c1 ? 1.2 * ramp(t, c1, c1 + 0.12) : 0), 0.25 + 0.6 * sm(t, tl.pakIn[0], c1));
      }

      if (!op) kaartStralen(t, laad);

      if (op) {
        // de opening tekent haar eigen wereld; daarna de stralen van de kaart eroverheen
        post.rad = 0;
        post.zoom = 1;
        post.roll = 0;
        post.bars = 0;
        post.bloom = 1;
        post.streak = 0;
        post.vig = 1;
        post.ca = 1;
        post.sat = 1;
        post.grade[0] = post.grade[1] = post.grade[2] = 1;
        if (opInst && t < K0 + tl.staart && aan('opening')) {
          try {
            opInst.teken(t, dt, inv);
          } catch (x) {
            opFouten++;
            if (motor.debug && opFouten < 4) console.error('[pakket] fout in de opening', x);
          }
        }
        motor.mengen('optel');
        kaartStralen(t, laad);
      } else {
        // de walkout-arena
        if (walkoutBezig && aan('arena')) {
          const [w0, w1] = wo;
          const q = klem((t - w0) / (w1 - w0), 0, 1);
          const p = P.arena.gebruik();
          basis(p);
          p.f1('uTime', t);
          // de leerling loopt door de lichtbundel naar je toe: eerst klein, aan het eind groter dan het beeld
          const h = 0.1 * Math.pow(11, Math.pow(q, 0.9)) * (0.85 + 0.15 * fit);
          const loopt = q < 0.93 ? 1 : Math.max(0.2, 1 - (q - 0.93) / 0.07);
          p.f1('uStap', (t - w0) * 5.2 + 1.2);
          p.f1('uAmp', loopt * (0.55 + 0.45 * q));
          p.f1('uFlits', (0.25 + 0.75 * q) * (0.5 + I));
          p.f1('uBundel', 0.55 + 0.6 * q);
          p.f1('uAlpha', sm(t, w0 - 0.02, w0 + 0.25) * (1 - sm(t, K0 - 0.02, K0 + 0.1)));
          p.f1('uRegen', regenboog ? 1 : 0);
          p.f1('uLicht', 0.35 + 0.35 * q + 1.6 * Math.pow(ramp(q, 0.9, 1), 2) + 0.9 * Math.exp(-(t - w0) / 0.4));
          p.f4('uFig', 0, 0.07 - 0.55 * h, h, sm(q, 0, 0.08));
          p.v3('uTint', kl);
          p.v3('uTint2', kl2);
          motor.mengen('optel');
          motor.volledig();
        }

        // stof en bokeh: achter alles
        stof.alpha = (0.18 + 0.55 * I) * (0.4 + 0.6 * sm(t, 0.2, 1.0)) * (walkoutBezig ? 0.6 : 1);
        zendDeeltjes(t, stof);

        // ── aanloop: vliegende tekst ──
        if (tl.vak && tex.vak) {
          const bln = [tl.vak, tl.onder];
          const tx = [tex.vak, tex.onder];
          for (let i = 0; i < 2; i++) {
            if (!tx[i]) continue;
            const [a0, a1] = bln[i];
            if (t < a0 || t > a1) continue;
            const u = (t - a0) / (a1 - a0);
            let z;
            if (u < 0.38) z = -26 + 22.8 * (1 - Math.pow(1 - u / 0.38, 3));
            else if (u < 0.72) z = -3.2 + 1.2 * ((u - 0.38) / 0.34);
            else z = -2.0 + 5.6 * Math.pow((u - 0.72) / 0.28, 3);
            const alpha = sm(u, 0, 0.14) * (1 - sm(u, 0.8, 0.97));
            const w = 3.5 * klem(asp, 0.5, 1);
            vlak(t, tx[i], i ? 0.12 : -0.1, (i ? -0.1 : 0.1) + Math.sin(u * 6 + i * 2) * 0.03, z, 0, 0, i ? 0.05 : -0.04, w, w * (380 / 1400), alpha, 2, 0, u > 0.78 ? (u - 0.78) * 2 : 0);
          }
        }

        // ── pakje ──
        if (t >= tl.pakIn[0] && t < E + 1.4 && aan('pak')) {
          const schaal = R(1);
          const u = ramp(t, tl.pakIn[0], c1);
          if (t < E) {
            let x = 0;
            let y = 0.012 * Math.sin(t * 1.3);
            let z = 0;
            let rx = 0;
            let ry = 0;
            let rz = 0;
            let sch = 1;
            let bol = 0.07;
            if (u < 1) {
              // het pakje komt uit de verte aanvliegen en draait nog even
              const w = Math.pow(1 - u, 3);
              z = -16 * w;
              ry = (1 - u) * (1 - u) * 2.2;
              rz = (1 - u) * 0.5;
              y += 0.15 * w;
            } else {
              const tr = laad * laad * (0.004 + 0.016 * I) * (reduceer ? 0.2 : 1);
              x = tr * (Math.sin(t * 71.3) * 0.6 + Math.sin(t * 43.1) * 0.4);
              y += tr * (Math.sin(t * 67.7 + 1) * 0.6 + Math.sin(t * 39.9) * 0.4);
              rz = tr * 0.8 * Math.sin(t * 57.1);
              // rustig zwaaien en je muis volgen; vlak voor het scheuren gaat dat tril-werk over
              ry = (0.22 * Math.sin(t * 0.9) + inv.tilt[0] * 0.35) * (1 - 0.6 * laad);
              rx = (0.05 * Math.sin(t * 0.7) - inv.tilt[1] * 0.25) * (1 - 0.6 * laad);
              const zwel = sm(t, E - 0.3, E);
              sch = 1 + 0.07 * zwel + 0.012 * laad * Math.sin(t * 22);
              bol = 0.06 + 0.09 * laad + 0.09 * zwel;
            }
            kantel[0] = ry * 2;
            kantel[1] = -rx * 2;
            pakDeel(t, 0, sm(t, tl.pakIn[0], tl.pakIn[0] + 0.1), x, y, z, rx, ry, rz, schaal * sch, bol, u >= 1 ? laad : 0, ((t * 0.45) % 1.8) - 0.4, 0);
          } else {
            // de twee helften vliegen weg
            const k = ramp(t, E, E + 1.1);
            const e1 = 1 - Math.pow(1 - k, 2.4);
            const pivotY = 0.5 - SCHEUR;
            const sch = 1.07 * schaal;
            const wy = pivotY * PAK_H * sch;
            const alpha = 1 - sm(k, 0.35, 1);
            kantel[0] = 0;
            kantel[1] = 0;
            pakDeel(t, 1, alpha, -0.7 * e1, wy + 1.5 * e1 - 0.8 * e1 * e1, 0.5 * e1, -0.3 * e1, 0.4 * e1, 2.2 * e1 + 0.5 * e1 * e1, sch, 0.15 + 0.4 * e1, 1, 0.3, pivotY);
            pakDeel(t, 2, alpha, 0.35 * e1, wy - 1.1 * e1 - 0.3 * e1 * e1, -0.2 * e1, 0.3 * e1, -0.2 * e1, -0.5 * e1, sch, 0.15, 1, 0.3, pivotY);
          }
        }

        // ── het licht van de scheur en van de onthulling ──
        if (t >= E - 0.05 && aan('licht')) {
          const dt2 = t - E;
          const aan = sm(dt2, -0.05, 0.03);
          const b = Math.exp(-dt2 / (0.35 + 0.25 * I));
          licht(t, 0, lekP, (0.3 + 0.55 * I) * b * aan, 0.01 + 0.12 * Math.pow(Math.min(dt2, 0.6), 0.7) + 0.015, (0.35 + 0.55 * I) * Math.exp(-dt2 / 0.65) * aan, (0.3 + 0.4 * I) * Math.exp(-dt2 / 0.9), t * 0.35);
        }
        if (t >= RV - 0.05 && aan('licht')) {
          const dt2 = t - RV;
          const b = Math.exp(-dt2 / (0.4 + 0.5 * I));
          licht(t, 0, 0.02, (0.2 + 0.4 * I) * b, 0.04 + 0.1 * Math.min(dt2, 0.7), (0.3 + 0.5 * I) * Math.exp(-dt2 / 0.9), (0.35 + 0.6 * I) * Math.exp(-dt2 / 1.2), t * 0.3);
        }

        // ── plaatjes tijdens de walkout ──
        if (wo && tex.plaat.length && t >= wo[0] && t < K0 + 0.1) {
          const WO = wo[1] - wo[0];
          const breed = Math.min(1.5, visB * 0.92);
          const half = visB / 2;
          const smal = asp < 1.15; // rechtop: de plaatjes staan boven elkaar in het midden
          platenInfo.forEach((pl, i) => {
            const tp = wo[0] + WO * pl.t0;
            if (t < tp) return;
            const kk = (t - tp) / 0.5;
            const veeg = glad(klem(kk, 0, 1)) * 1.35 - 0.1;
            const x = smal ? pl.x * 0.05 * visB + (1 - glad(klem(kk * 1.4, 0, 1))) * pl.x * 0.1 : pl.x * Math.max(0.3, half - breed * 0.55 - 0.1) + (1 - glad(klem(kk * 1.4, 0, 1))) * pl.x * 0.12;
            const y = smal ? 0.66 - i * (breed * (250 / 1200) * 1.15) : pl.y * 0.9;
            const alpha = 1 - sm(t, K0 - 0.28, K0 + 0.05);
            vlak(t, tex.plaat[i], x, y + Math.sin(t * 1.1 + i * 2) * 0.01, 0, 0, smal ? -pl.x * 0.05 : -pl.x * 0.17, 0, breed, breed * (250 / 1200), alpha, veeg, 0, kk < 0.4 ? 1 - kk / 0.4 : 0);
          });
        }

      }

      // de vonken van de onthulling komen van achter de kaart vandaan
      if (t >= RV - 0.01 && t <= RV + 2.6) zendDeeltjes(t, rvVonken);

      // ── de kaart ──
      if (t >= K0 - 0.05 && aan('kaart')) {
        const q = t - K0;
        const u = ramp(q, 0, tl.spin);
        const uit = 1 - Math.pow(1 - u, 3);
        const draai = (1 - uit) * (Math.PI * 5); // eindigt met de voorkant naar je toe
        const pas = 1 - Math.pow(1 - ramp(q, 0, tl.spin * 0.75), 3);
        const z = -3.0 * Math.pow(1 - pas, 2);
        const op = veer(ramp(q, 0, 0.6));
        // na de onthulling schuift de kaart wat omlaag en wordt hij iets kleiner, zodat de titel erboven past
        const lay = sm(t, RV + 0.15, RV + 0.9);
        const sc = KAART_H * R(1) * (0.02 + 0.98 * Math.min(1.12, op)) * mix(1, 0.92, lay);
        // tel het cijfer op
        const cp = ramp(t, tl.telStart, RV);
        const val = t >= RV ? d.g : 1 + (d.g - 1) * (1 - Math.pow(1 - cp, 2));
        const getoond = d.fmt(Math.min(d.g, Math.round(val * 10) / 10));
        if (getoond !== S.tekst) {
          S.tekst = getoond;
          art.lagen.zetCijfer(getoond);
          motor.verversTekstuur(tex.cijfer, art.lagen.cijfer);
          S.popT = t;
        }
        if (inv.afspelen && t >= tl.telStart && t < RV) {
          const stap = Math.floor(val * 3);
          if (stap !== S.laatsteTel) {
            S.laatsteTel = stap;
            audio.tik(d.g > 1 ? (val - 1) / (d.g - 1) : 1);
          }
        }
        const tPop = t >= RV ? t - RV : t - S.popT;
        const pop = 1 + (t >= RV ? 0.55 : 0.1 + 0.2 * cp) * Math.exp(-tPop / 0.16) * (t >= tl.telStart ? 1 : 0);
        // na de onthulling zweeft de kaart en volgt hij je muis
        const rust = t >= RV ? 1 : 0;
        const kx = inv.tilt[0] * rust;
        const ky = inv.tilt[1] * rust;
        kantel[0] = kx;
        kantel[1] = ky;
        const sc2 = sc * (1 + (t >= RV ? 0.08 * Math.exp(-(t - RV) / 0.45) : 0) + 0.012 * Math.sin(t * 1.6) * rust);
        const p = P.kaart.gebruik();
        obj(p, 0, mix(0.03, -0.17, lay) + Math.sin(t * 1.15) * 0.012 * rust, z, -ky * 0.3 + Math.sin(t * 0.6) * 0.03 * rust, draai + kx * 0.4 + Math.sin(t * 0.8) * 0.05 * rust, 0.04 * (1 - uit) * Math.sin(q * 6), (KAART_B / KAART_H) * sc2, sc2);
        p.tex('uBG', 0, tex.bg);
        p.tex('uMid', 1, tex.mid);
        p.tex('uFG', 2, tex.fg);
        p.tex('uMasker', 3, tex.masker);
        p.tex('uAchter', 4, tex.achter);
        p.tex('uCijfer', 5, tex.cijfer);
        p.f2('uKantel', kantel[0], kantel[1]);
        const r = art.lagen.cijferRect;
        p.f4('uCijferRect', r[0], r[1], r[2], r[3]);
        p.f1('uTime', t);
        p.f1('uHolo', L.holo * (0.7 + 0.5 * rust));
        p.f1('uGlitter', L.glit * (0.45 + 0.8 * rust));
        // een glinsterveeg die over de kaart trekt zodra hij landt, en daarna af en toe
        p.f1('uVeeg', t >= RV ? ((t - RV) * 0.32) % 2.2 - 0.5 : ramp(q, tl.spin * 0.6, tl.spin) * 1.6 - 0.4);
        p.f1('uGlow', 0.5 + 0.8 * rust);
        p.f1('uAlpha', sm(q, 0, 0.12));
        p.f1('uPop', pop);
        p.f1('uTier', tier);
        p.f1('uHelder', 1 + (t >= RV ? 0.35 * Math.exp(-(t - RV) / 0.3) : 0));
        p.v3('uCol', kl);
        p.v3('uCol2', kl2);
        motor.mengen('alpha');
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        motor.teken.draws++;
      }

      // ── titel na de onthulling ──
      if (t >= RV + 0.05) {
        const q = t - RV - 0.05;
        const pop = Math.max(0.001, veer(ramp(q, 0, 0.55)));
        const w = Math.min(2.05 * (0.9 + 0.1 * I), visB * 0.96);
        const hT = w * (360 / 1500);
        // net boven de kaart, die inmiddels wat omlaag en kleiner staat
        vlak(t, tex.titel, 0, -0.17 + 0.667 * fit + 0.5 * hT + 0.035, 0, 0, 0, -0.03 * (1 - pop), w * pop, hT * pop, sm(q, 0, 0.12), 2, 0, q < 0.2 ? 1 - q / 0.2 : 0);
      }

      // ── deeltjes ──
      for (let i = 0; aan('deeltjes') && i < emit.length; i++) {
        const o = emit[i];
        if (o === stof || o === rvVonken || o.eigen) continue;
        if (o.mode === 1) {
          zendDeeltjes(t, o);
        } else if (o.mode === 4) {
          if (vuurwerk.length && t >= RV) {
            // de x-positie van het vuurwerk hangt af van de beeldverhouding
            for (let k = 0; k < vuurwerk.length; k++) fwData[k * 4] = vuurwerk[k].x * asp;
            zendDeeltjes(t, o);
          }
        } else if (t >= o.t0 - 0.01 && t <= o.t0 + o.delay + o.life + 0.2) zendDeeltjes(t, o);
      }

      eindbeeld(t, false, aan('post'));
    }

    // Op het startscherm: alleen een rustige achtergrond.
    function wacht(t) {
      asp = motor.breedte / motor.hoogte;
      kleuren(0.5);
      cam.x = 0;
      cam.y = 0;
      motor.doel(motor.doelen.scene);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (op) {
        motor.mengen('optel');
        if (opInst && opInst.wacht) opInst.wacht(t);
      } else {
        neutraal(0);
        warp(t, 1, 0.32, 0.25);
        stof.alpha = 0.3;
        zendDeeltjes(t, stof);
      }
      eindbeeld(0.5, true);
    }

    const posts = { shock: new Float32Array(12) };

    function eindbeeld(t, rustig, metEffecten = true) {
      const flash = rustig || !metEffecten ? 0 : Math.min(2.2, flitsAt(t));
      // schokgolven: de drie meest recente die nog zichtbaar zijn
      const sh = posts.shock;
      sh.fill(0);
      let n = 0;
      if (!rustig) {
        for (let i = golven.length - 1; i >= 0 && n < 3; i--) {
          const g = golven[i];
          const dt2 = t - g.t;
          if (dt2 < 0 || dt2 > 1.6) continue;
          const sterkte = g.s * Math.exp(-dt2 / 0.55) * (reduceer ? 0.3 : 1);
          if (sterkte < 0.01) continue;
          sh[n * 4] = 0.5;
          sh[n * 4 + 1] = 0.5 + g.y;
          sh[n * 4 + 2] = dt2 * g.v;
          sh[n * 4 + 3] = sterkte;
          n++;
        }
      }
      const rust2 = !rustig && t >= RV ? sm(t, RV + 0.9, RV + 2.6) : 0;
      const bl = motor.bloom(0.62 + 0.12 * rust2);
      motor.doel(null);
      motor.mengen('geen');
      const p = P.post.gebruik();
      p.tex('uScene', 0, motor.doelen.scene.tex);
      p.tex('uBloom', 1, bl.tex);
      const sd = motor.doelen.neer[Math.min(2, motor.doelen.neer.length - 1)];
      p.tex('uStreak', 2, sd.tex);
      p.f2('uRes', motor.breedte, motor.hoogte);
      p.f1('uTime', t);
      const heftig = Math.min(1, flash);
      const pk = !rustig && op ? post : null; // de wensen van de opening voor dit beeld
      p.f1('uBloomAmt', (L.bloom * 0.9 + 0.3 * heftig) * (0.9 + 0.2 * I) * (1 - 0.4 * rust2) * (pk ? pk.bloom : 1));
      p.f1('uStreakAmt', rustig || motor.kwaliteit >= 2 ? 0 : Math.min(1.5, 0.12 + 1.2 * heftig + (!op && t >= E && t < E + 1 ? 0.7 : 0) + (pk ? pk.streak : 0)) * (1 - 0.7 * rust2));
      p.f1('uStreakTexel', 1 / sd.w);
      p.v3('uStreakCol', kl);
      p.f1('uVig', L.vig * (1 + 0.55 * rust2) * (pk ? pk.vig : 1));
      p.v3('uVigCol', rustig ? koel2 : kl2); // op het startscherm nog geen tint van het niveau
      p.f1('uGrain', motor.kwaliteit < 3 ? 0.03 : 0);
      p.f1('uFade', rustig ? 1 : sm(t, 0, 0.45));
      let bars = 0;
      if (pk) bars = pk.bars;
      else if (tl.wo && !rustig) bars = sm(t, tl.wo[0] + 0.1, tl.wo[0] + 0.7) * (1 - sm(t, K0 - 0.15, K0 + 0.05));
      p.f1('uBars', bars);
      p.f1('uCA', rustig ? 0.001 : (L.ca * 0.5 * (0.5 + 1.5 * I) * (pk ? pk.ca : 1) + 0.004 * flash * 0.5) * (reduceer ? 0.3 : 1));
      // radiaal wazig bij de vliegende tekst, het pakje dat aankomt en de klappen
      let rad = 0;
      if (!rustig) {
        if (pk) {
          rad = pk.rad;
        } else {
          if (tl.vak) {
            for (const b of [tl.vak, tl.onder]) {
              const u = ramp(t, b[0], b[1]);
              if (u > 0 && u < 1) rad = Math.max(rad, (u < 0.38 ? 0.3 * Math.pow(1 - u / 0.38, 2) : 0) + (u > 0.72 ? 0.5 * Math.pow((u - 0.72) / 0.28, 2) : 0));
            }
          }
          if (t > tl.pakIn[0] && t < c1) rad = Math.max(rad, 0.4 * Math.pow(1 - ramp(t, tl.pakIn[0], c1), 2));
          if (t >= E) rad = Math.max(rad, 0.25 * Math.exp(-(t - E) / 0.25));
        }
        if (t >= RV) rad = Math.max(rad, 0.22 * Math.exp(-(t - RV) / 0.3));
        if (t > K0 - 0.3 && t < K0) rad = Math.max(rad, 0.3 * ramp(t, K0 - 0.3, K0));
      }
      p.f3('uRadial', 0.5, 0.5, rad * (reduceer ? 0.2 : 1));
      let zoom = 1;
      if (!rustig) {
        zoom += 0.035 * sm(t, K0, RV) * (t < RV ? 1 : 0);
        if (t >= RV) zoom += 0.06 * Math.exp(-(t - RV) / 0.18);
        if (pk) {
          zoom *= pk.zoom;
        } else {
          zoom += 0.045 * sm(t, c1, E);
          if (t >= E && t < E + 0.5) zoom += 0.05 * Math.exp(-(t - E) / 0.12);
          if (t >= c1 && t < c1 + 0.4) zoom += 0.025 * Math.exp(-(t - c1) / 0.1);
        }
      }
      p.f1('uZoom', zoom);
      p.f1('uRoll', rustig ? 0 : (Math.sin(t * 0.7) * 0.004 + (pk ? pk.roll : t >= E && t < E + 0.6 ? 0.012 * Math.exp(-(t - E) / 0.2) * Math.sin(t * 40) : 0)) * (reduceer ? 0.2 : 1));
      p.f2('uShake', 0, 0);
      p.f1('uSat', rustig ? 1 : L.sat * (pk ? pk.sat : 1));
      if (pk) p.f3('uGrade', pk.grade[0], pk.grade[1], pk.grade[2]);
      else p.f3('uGrade', 1, 1, 1);
      p.f1('uShockW', 0.035);
      p.i1('uTaps', [8, 6, 4, 3][motor.kwaliteit] || 3);
      p.v3('uShockCol', kl);
      p.f3('uFlash', flash * 0.7, flash * (0.64 + 0.056 * kl[1]), flash * (0.58 + 0.12 * kl[2]));
      p.v4s('uShock[0]', sh);
      motor.volledig();
    }

    function reset() {
      for (const x of ev) x.klaar = false;
      S.laatsteTel = -1;
      S.tekst = null;
      S.popT = -9;
      if (opInst && opInst.reset) opInst.reset();
    }

    // Waar springt de animatie heen als je erop klikt? { doel, riser } of null (nu even niet).
    function sprong(t) {
      if (opInst && opInst.sprong) {
        const r = opInst.sprong(t);
        if (r !== undefined) return r;
      }
      if (t < E - 0.6) return { doel: E - 0.45, riser: !op };
      if (t < E + 0.5) return null; // net voor of tijdens het hoogtepunt: dat laten we even gebeuren
      if (!op && tl.wo && t < K0 - 0.5) return { doel: K0 - 0.4 };
      if (t < RV - 0.6) return { doel: RV - 0.5 };
      return null;
    }

    function verwijder() {
      if (opInst && opInst.verwijder) {
        try {
          opInst.verwijder();
        } catch (x) {
          /* een fout in het opruimen mag niets blokkeren */
        }
      }
      eigenTex.forEach((x) => gl.deleteTexture(x));
      for (const k in tex) {
        const v = tex[k];
        if (Array.isArray(v)) v.forEach((x) => gl.deleteTexture(x));
        else if (v) gl.deleteTexture(v);
      }
    }

    return {
      tl,
      ev,
      skip,
      teken,
      wacht,
      reset,
      verwijder,
      sprong,
      get opening() {
        return opInst;
      },
      get opFouten() {
        return opFouten;
      },
      set lod(v) {
        lod = v;
      },
      pakRand,
      get plateInfo() {
        return platenInfo;
      },
    };
  }

  SPO.maakScene = maakScene;
  SPO.maakTijdlijn = maakTijdlijn;
  SPO.LOOK = LOOK;
  SPO.H_ZICHT = H_ZICHT;
})();
