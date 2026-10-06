/*
 * Somtoday Pack Opener — openingen/dans.js
 * Dansje. Een klein tekenfilmfiguurtje danst op een gloeiende discovloer; hoe beter hij danst, hoe hoger het cijfer.
 * De dans IS de onthulling: de keuze van de moves, de energie, de timing, het publiek en de lichtshow groeien met de
 * score (laag: struikelen en zwaaien · midden: echte moves · hoog: moonwalk, draaien, windmill en een salto). Elke dans
 * eindigt met een dab (E); pas dan komt de kleur van het niveau. Alles is een zuivere functie van t.
 *
 * Opbouw: één schermvullende shader voor het podium (muur, lichtbundels, discobal, vloer, publiek) en één shader voor het
 * figuurtje (14 capsules + hoofd, getekend als tekenfilm met omlijning). Het skelet wordt per beeld in JS uit hoeken
 * berekend (analytisch in t) en als uniform-lijst doorgegeven.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  const { KOP, GEMEEN } = SPO.shaders;

  const TAU = Math.PI * 2;
  const BEAT = 0.5; // 120 bpm
  const B_START = 1.2; // dans-beat start
  const B0 = B_START + 0.52; // eerste tel van de opname
  const T0 = B0; // de dans begint op een tel
  const VLOER = -0.22; // y van de vloer onder het figuurtje (p-ruimte)
  const HZ = 0.15; // horizon

  const klem = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (a, b, x) => {
    const t = klem((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mixf = (a, b, t) => a + (b - a) * t;
  function hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
  function prng(a) {
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hsvTo(h, s, v, o) {
    h = h - Math.floor(h);
    const k = (n) => klem(Math.abs(((h * 6 + n) % 6) - 3) - 1, 0, 1);
    o[0] = v * (1 + s * (k(0) - 1));
    o[1] = v * (1 + s * (k(4) - 1));
    o[2] = v * (1 + s * (k(2) - 1));
  }

  // ───────────────────────── Het skelet: parameters ─────────────────────────
  const HX = 0, JUMP = 1, LEAN = 2, HEAD = 3, ALS = 4, ALE = 5, ARS = 6, ARE = 7, TL = 8, KL = 9, TR = 10, KR = 11;
  const ROT = 12, SX = 13, SMILE = 14, OPEN = 15, EYE = 16, FACE = 17, TURN = 18, NP = 19;
  // hoeken: vanaf 'recht naar beneden', + = naar rechts (+x). Elleboog/knie: relatief t.o.v. het bovenstuk.
  const REST = Float64Array.from([0, 0, 0, 0, -0.15, 0.12, 0.15, -0.12, -0.08, 0, 0.08, 0, 0, 1, 0.3, 0, 0, 0, 0]);
  const AMPIDX = [LEAN, HEAD, ALS, ARS, TL, TR, ALE, ARE];

  const S_ = Math.sin;
  const mx = Math.max;
  const MOVES = [];
  function mv(name, lvl, fn, raw) {
    MOVES.push({ name, lvl, fn, raw: !!raw });
  }

  // ── niveau 0: onhandig ──
  mv('sway', 0, (u, P) => {
    const w = S_(TAU * u);
    P[LEAN] = 0.1 * w;
    P[HEAD] = -0.1 * w;
    P[ALS] = -0.24 + 0.1 * w;
    P[ARS] = 0.24 + 0.1 * w;
    P[TL] = -0.1 - 0.05 * w;
    P[TR] = 0.1 - 0.05 * w;
    P[SMILE] = -0.1;
  });
  mv('flail', 0, (u, P) => {
    P[ALS] = -1.7 + 1.3 * S_(TAU * 1.3 * u + 0.4);
    P[ALE] = 0.5 * S_(TAU * 3 * u);
    P[ARS] = 1.6 + 1.3 * S_(TAU * 1.7 * u + 2);
    P[ARE] = -0.5 * S_(TAU * 2.6 * u + 1);
    const a = S_(TAU * 2 * u), b = S_(TAU * 2 * u + 3);
    P[TL] = -0.3 + 0.25 * a;
    P[KL] = 0.5 * mx(0, a);
    P[TR] = 0.3 + 0.25 * b;
    P[KR] = -0.5 * mx(0, b);
    P[LEAN] = 0.1 * S_(TAU * u * 1.5);
    P[JUMP] = 0.02 * Math.abs(a);
    P[OPEN] = 0.5;
    P[SMILE] = 0.2;
  });
  mv('stumble', 0, (u, P) => {
    const w2 = sm(0.22, 0.42, u) * (1 - sm(0.7, 0.92, u));
    const fl = S_(TAU * 4 * u) * w2;
    P[LEAN] = 0.5 * sm(0.18, 0.5, u) * (1 - sm(0.62, 0.9, u));
    P[HX] = 0.06 * sm(0.1, 0.5, u) - 0.03 * sm(0.6, 1, u);
    P[ALS] = -0.15 - 1.9 * w2 + 0.5 * fl;
    P[ARS] = 0.15 + 1.8 * w2 - 0.5 * fl;
    P[ALE] = 0.3 * fl;
    P[ARE] = -0.3 * fl;
    P[TR] = 0.08 + 0.5 * sm(0.05, 0.25, u) * (1 - sm(0.5, 0.8, u));
    P[KR] = -0.5 * sm(0.1, 0.3, u) * (1 - sm(0.5, 0.7, u));
    P[TL] = -0.08 - 0.25 * S_(TAU * 3 * u) * w2;
    P[JUMP] = 0.045 * S_(Math.PI * klem((u - 0.3) / 0.25, 0, 1));
    P[SMILE] = mixf(0.3, -0.85, sm(0.2, 0.35, u) * (1 - sm(0.75, 0.95, u)));
    P[OPEN] = 0.9 * w2;
    P[EYE] = -0.8 * w2;
    P[HEAD] = 0.25 * w2 * S_(TAU * 3 * u);
  }, true);
  mv('scratch', 0, (u, P) => {
    P[ARS] = 2.5 + 0.12 * S_(TAU * 4 * u);
    P[ARE] = 1.5 + 0.3 * S_(TAU * 4 * u);
    P[ALS] = -0.3;
    P[ALE] = 0.5;
    P[LEAN] = 0.05 * S_(TAU * u);
    P[HEAD] = 0.2 * S_(TAU * u);
    P[TL] = -0.15;
    P[TR] = 0.15;
    P[SMILE] = -0.25;
    P[OPEN] = 0.1;
    P[EYE] = -0.3;
  });
  // ── niveau 1: wankelend maar met goede wil ──
  mv('steptouch', 1, (u, P) => {
    const w = S_(TAU * u), pump = Math.abs(S_(TAU * u * 2));
    P[HX] = 0.05 * w;
    P[TR] = 0.1 + 0.3 * mx(0, w);
    P[KR] = -0.2 * mx(0, w);
    P[TL] = -0.1 - 0.3 * mx(0, -w);
    P[KL] = 0.2 * mx(0, -w);
    P[ALS] = -0.8 + 0.15 * pump;
    P[ALE] = 1.0;
    P[ARS] = 0.8 - 0.15 * pump;
    P[ARE] = -1.0;
    P[JUMP] = 0.015 * pump;
    P[LEAN] = 0.07 * w;
    P[SMILE] = 0.6;
  });
  mv('clap', 1, (u, P) => {
    const c = S_(TAU * 2 * u), ab = Math.abs(c);
    P[ALS] = -2.78 - 0.2 * c;
    P[ARS] = 2.78 + 0.2 * c;
    P[ALE] = -0.1;
    P[ARE] = 0.1;
    P[TL] = -0.14;
    P[TR] = 0.14;
    P[KL] = -0.18 * ab;
    P[KR] = 0.18 * ab;
    P[JUMP] = 0.012 * ab;
    P[HEAD] = 0.1 * c;
    P[SMILE] = 0.7;
  });
  mv('wobble', 1, (u, P) => {
    const w = S_(TAU * u);
    P[LEAN] = 0.14 * w;
    P[HEAD] = -0.2 * w;
    P[ALS] = -0.55 + 0.4 * S_(TAU * u + 0.5);
    P[ARS] = 0.55 + 0.4 * S_(TAU * u + 0.5);
    P[TL] = -0.1 + 0.1 * w;
    P[TR] = 0.1 + 0.1 * w;
    P[KL] = 0.2 * mx(0, -w);
    P[KR] = -0.2 * mx(0, w);
    P[HX] = 0.03 * w;
    P[SMILE] = 0.5;
  });
  // ── niveau 2: echte moves ──
  mv('disco', 2, (u, P) => {
    const r = sm(-0.6, 0.6, S_(TAU * u));
    P[ALS] = mixf(-2.55, -0.9, r);
    P[ALE] = mixf(0, 1.9, r);
    P[ARS] = mixf(0.9, 2.55, r);
    P[ARE] = mixf(-1.9, 0, r);
    P[LEAN] = -0.12 * (2 * r - 1);
    P[HX] = 0.03 * (2 * r - 1);
    P[TL] = -0.22;
    P[TR] = 0.22;
    P[KL] = 0.25 * (1 - r);
    P[KR] = -0.25 * r;
    P[HEAD] = 0.15 * (2 * r - 1);
    P[SMILE] = 0.9;
    P[OPEN] = 0.2;
  });
  mv('running', 2, (u, P) => {
    const ph = TAU * 2 * u, a = S_(ph), b = -a;
    P[FACE] = 1;
    P[TL] = -0.15 + 1.0 * mx(0, a) - 0.25 * mx(0, -a);
    P[KL] = -1.5 * mx(0, a);
    P[TR] = -0.15 + 1.0 * mx(0, b) - 0.25 * mx(0, -b);
    P[KR] = -1.5 * mx(0, b);
    P[HX] = -0.04 * Math.cos(ph);
    P[ALS] = 0.9 * S_(ph + Math.PI);
    P[ALE] = 1.0;
    P[ARS] = 0.9 * S_(ph);
    P[ARE] = 1.0;
    P[JUMP] = 0.02 * Math.abs(a);
    P[LEAN] = 0.08;
    P[SMILE] = 1;
    P[OPEN] = 0.3;
  });
  mv('floss', 2, (u, P) => {
    const sw = S_(TAU * 2 * u);
    P[ALS] = 0.9 * sw;
    P[ARS] = 0.9 * sw + 0.1;
    P[ALE] = 0.15;
    P[ARE] = -0.15;
    P[HX] = -0.045 * sw;
    P[LEAN] = -0.1 * sw;
    P[TL] = -0.2;
    P[TR] = 0.2;
    P[KL] = 0.35;
    P[KR] = -0.35;
    P[HEAD] = 0.1 * sw;
    P[SMILE] = 1;
    P[OPEN] = 0.4;
  });
  mv('shuffle', 2, (u, P) => {
    const ph = TAU * 4 * u, a = S_(ph);
    P[FACE] = 0.6;
    P[TL] = 0.55 * a;
    P[TR] = -0.55 * a;
    P[KL] = -0.7 * mx(0, -a);
    P[KR] = -0.7 * mx(0, a);
    P[ALS] = -0.5 + 0.4 * S_(ph * 0.5);
    P[ALE] = 1.3;
    P[ARS] = 0.5 + 0.4 * S_(ph * 0.5 + Math.PI);
    P[ARE] = -1.3;
    P[HX] = 0.03 * S_(ph * 0.5);
    P[LEAN] = 0.06;
    P[SMILE] = 0.9;
  });
  mv('roof', 2, (u, P) => {
    const a = S_(TAU * 2 * u);
    P[ALS] = -2.4 + 0.4 * a;
    P[ARS] = 2.4 - 0.4 * a;
    P[ALE] = -0.15;
    P[ARE] = 0.15;
    P[JUMP] = 0.03 * Math.abs(a);
    P[TL] = -0.18;
    P[TR] = 0.18;
    P[KL] = 0.2 * mx(0, -a);
    P[KR] = -0.2 * mx(0, -a);
    P[HEAD] = 0.1;
    P[SMILE] = 1;
    P[OPEN] = 0.8;
  });
  // ── niveau 3: strak ──
  mv('moonwalk', 3, (u, P) => {
    const ph = TAU * 2 * u, a = S_(ph);
    P[FACE] = 1;
    P[HX] = -0.16 * (u - 0.5);
    P[TL] = 0.22 * a;
    P[TR] = -0.22 * a;
    P[KL] = -0.8 * mx(0, -a);
    P[KR] = -0.8 * mx(0, a);
    P[LEAN] = -0.08;
    P[ALS] = 0.5 * a;
    P[ARS] = -0.5 * a;
    P[ALE] = 0.6;
    P[ARE] = 0.6;
    P[HEAD] = 0.1;
    P[SMILE] = 0.8;
  });
  mv('spin', 3, (u, P) => {
    const e = u * u * (3 - 2 * u), ang = TAU * 2 * e;
    P[SX] = Math.cos(ang);
    P[TURN] = S_(ang);
    P[ALS] = -1.3;
    P[ARS] = 1.3;
    P[ALE] = 0.15;
    P[ARE] = -0.15;
    const l = sm(0.1, 0.3, u) * (1 - sm(0.8, 0.95, u));
    P[TL] = -0.05;
    P[TR] = 0.85 * l;
    P[KR] = -1.7 * l;
    P[JUMP] = 0.01 * l;
    P[LEAN] = 0.03;
    P[SMILE] = 1;
  });
  const FOOT = [
    [-0.55, 0.4, 0.12, 0, -1.0, 1.4, 0.6, -0.5, 0.1],
    [-0.1, 0, 0.55, -0.4, -0.6, 0.6, 1.0, -1.4, -0.1],
    [0.3, -0.7, 0.1, 0, -2.2, -0.3, 0.4, -0.4, 0.05],
    [-0.1, 0, -0.3, -0.7, -0.4, 0.4, 2.2, 0.3, -0.05],
  ];
  mv('footwork', 3, (u, P) => {
    const x = u * 4, q = Math.floor(x), f = x - q;
    const e = 1 - Math.exp(-f * 12);
    const A = FOOT[(q + 3) & 3], B = FOOT[q & 3];
    P[TL] = mixf(A[0], B[0], e);
    P[KL] = mixf(A[1], B[1], e);
    P[TR] = mixf(A[2], B[2], e);
    P[KR] = mixf(A[3], B[3], e);
    P[ALS] = mixf(A[4], B[4], e);
    P[ALE] = mixf(A[5], B[5], e);
    P[ARS] = mixf(A[6], B[6], e);
    P[ARE] = mixf(A[7], B[7], e);
    P[LEAN] = mixf(A[8], B[8], e);
    P[JUMP] = 0.03 * Math.exp(-f * 5);
    P[HEAD] = (q & 1 ? 0.15 : -0.15) * e;
    P[SMILE] = 1;
    P[OPEN] = 0.3;
  });
  const PT0 = new Float64Array(8), PT1 = new Float64Array(8);
  function popT(q, o) {
    o[0] = -0.8 - 0.9 * (0.5 + 0.5 * S_(q * 2.1));
    o[1] = 1.2 * S_(q * 1.7 + 1);
    o[2] = 0.8 + 0.9 * (0.5 + 0.5 * S_(q * 1.3 + 2));
    o[3] = -1.2 * S_(q * 2.3);
    o[4] = 0.12 * S_(q * 1.9);
    o[5] = 0.3 * S_(q * 2.9);
    o[6] = -0.25 - 0.1 * S_(q * 3.1);
    o[7] = 0.25 + 0.1 * S_(q * 2.7);
  }
  mv('popping', 3, (u, P) => {
    const x = u * 8, q = Math.floor(x), f = x - q;
    popT(q - 1, PT0);
    popT(q, PT1);
    const e = 1 - Math.exp(-f * 20), jk = 0.05 * S_(f * 60) * (1 - e);
    P[ALS] = mixf(PT0[0], PT1[0], e) + jk;
    P[ALE] = mixf(PT0[1], PT1[1], e);
    P[ARS] = mixf(PT0[2], PT1[2], e) - jk;
    P[ARE] = mixf(PT0[3], PT1[3], e);
    P[LEAN] = mixf(PT0[4], PT1[4], e);
    P[HEAD] = mixf(PT0[5], PT1[5], e);
    P[TL] = mixf(PT0[6], PT1[6], e) - 0.1;
    P[TR] = mixf(PT0[7], PT1[7], e) + 0.1;
    P[KL] = 0.4;
    P[KR] = -0.4;
    P[SMILE] = 0.6;
    P[OPEN] = 0.1;
  });
  // ── niveau 4: legendarisch ──
  mv('windmill', 4, (u, P) => {
    const w = sm(0.08, 0.22, u) * (1 - sm(0.84, 0.96, u));
    P[ROT] = -TAU * 2 * sm(0.12, 0.88, u);
    P[TL] = -0.8 * w;
    P[TR] = 0.8 * w;
    P[ALS] = -0.4 * w - 0.15 * (1 - w);
    P[ALE] = 1.5 * w + 0.12 * (1 - w);
    P[ARS] = 0.4 * w + 0.15 * (1 - w);
    P[ARE] = -1.5 * w - 0.12 * (1 - w);
    P[HX] = 0.04 * S_(TAU * 2 * sm(0.12, 0.88, u));
    P[SMILE] = 1;
    P[OPEN] = 0.6;
  });
  mv('backflip', 4, (u, P) => {
    const p = klem((u - 0.2) / 0.62, 0, 1);
    const sq = sm(0, 0.15, u) * (1 - sm(0.15, 0.2, u)) + sm(0.82, 0.9, u) * (1 - sm(0.93, 1, u));
    const tk = S_(Math.PI * p) * (p > 0 && p < 1 ? 1 : 0);
    P[FACE] = 1;
    P[JUMP] = 0.2 * 4 * p * (1 - p);
    P[ROT] = TAU * sm(0, 1, p);
    P[TL] = 0.8 * sq + 1.4 * tk;
    P[TR] = 0.8 * sq + 1.4 * tk;
    P[KL] = -1.6 * sq - 2.2 * tk;
    P[KR] = -1.6 * sq - 2.2 * tk;
    P[ALS] = P[ARS] = mixf(0.6, 2.4, sm(0.0, 0.2, u) * (1 - sm(0.2, 0.4, u))) * (1 - tk) + 0.9 * tk;
    P[ALE] = P[ARE] = 0.5 * tk;
    P[LEAN] = 0.2 * sq;
    P[SMILE] = 1;
    P[OPEN] = 0.7;
  });
  mv('starjump', 4, (u, P) => {
    const p = u * 2 - Math.floor(u * 2), a = S_(Math.PI * p);
    P[JUMP] = 0.16 * 4 * p * (1 - p);
    P[TL] = -0.08 - 0.6 * a;
    P[TR] = 0.08 + 0.6 * a;
    P[KL] = 0.1 * a;
    P[KR] = -0.1 * a;
    P[ALS] = mixf(-0.5, -2.6, a);
    P[ARS] = mixf(0.5, 2.6, a);
    P[ALE] = P[ARE] = 0;
    P[SMILE] = 1;
    P[OPEN] = 1;
  });
  let pBalpha = 1;
  const MI = {};
  MOVES.forEach((m, i) => (MI[m.name] = i));
  // de dab: het hoofd in de elleboog, de andere arm schuin omhoog
  const DAB = Float64Array.from(REST);
  DAB[ALS] = -2.6;
  DAB[ALE] = -2.5;
  DAB[ARS] = 2.45;
  DAB[ARE] = 0;
  DAB[LEAN] = -0.28;
  DAB[HEAD] = -0.5;
  DAB[TL] = -0.3;
  DAB[KL] = 0.3;
  DAB[TR] = 0.28;
  DAB[KR] = -0.1;
  DAB[SMILE] = 1;
  DAB[OPEN] = 0.3;

  function niveau(s) {
    return s < 0.3 ? 0 : s < 0.55 ? 1 : s < 0.75 ? 2 : s < 0.9 ? 3 : 4;
  }
  // de choreografie: een pure functie van het cijfer
  function plan(d) {
    const s = klem((d.g - 1) / 9, 0, 1);
    const N = d.snel ? 5 : 10;
    const rnd = prng(hash(d.vak + '|' + d.cijferTekst + '|dans'));
    const L = niveau(s);
    const per = [[], [], [], [], []];
    MOVES.forEach((m, i) => {
      if (m.name !== 'stumble') per[m.lvl].push(i);
    });
    const ch = [];
    for (let i = 0; i < N; i++) {
      const f = N > 1 ? i / (N - 1) : 1;
      const hi = Math.min(L, Math.round(L * (0.5 + 0.5 * f)));
      const lv = rnd() < 0.3 && hi > 0 ? hi - 1 : hi;
      const pool = per[lv];
      let pick, tr = 0;
      do {
        pick = pool[Math.floor(rnd() * pool.length)];
        tr++;
      } while (pick === ch[i - 1] && tr < 8 && pool.length > 1);
      ch.push(pick);
    }
    const st = [];
    if (L === 0) {
      st.push(2);
      if (s < 0.15 && N >= 8) st.push(N - 3);
      for (const k of st) ch[k] = MI.stumble;
    }
    if (L === 4) {
      ch[N - 3] = MI.windmill;
      ch[N - 2] = MI.backflip;
      ch[N - 1] = MI.starjump;
    }
    const E = T0 + N;
    const best = T0 + Math.max(0, N - 2) + 0.5;
    const first = st.length ? T0 + st[0] + 0.4 : T0 + 1.5;
    return { s, N, L, ch, st, E, K0: E + 1.4, fotos: [0.8, 1.45, T0 + 0.5, first, T0 + N * 0.5, best, E + 0.1, E + 0.55, E + 1.3] };
  }

  // ───────────────────────── Shaders ─────────────────────────
  const FS_BUHN = `${KOP}
in vec2 vUv; out vec4 o;
uniform vec2 uRes, uShake;
uniform float uZoom, uTime, uBeat, uKick, uEn, uCrowd, uSync, uDrop, uIntro, uBurst, uAlpha, uTierMix, uRegen, uNB, uPul, uSpot, uAsp;
uniform vec3 uFig;
uniform vec3 uC1, uC2;
const float TAU = 6.2831853;
const float HZ = ${HZ.toFixed(3)};
${GEMEEN}
vec3 party(float h){ return hsv(vec3(fract(h), .72, 1.)); }
vec3 pcol(float id, float tt){
  vec3 a = party(id * .173 + tt);
  vec3 b = uRegen > .5 ? hsv(vec3(fract(id * .09 + uTime * .35), .8, 1.)) : mix(uC1, uC2, fract(id * .37 + .1));
  return mix(a, b, uTierMix);
}
float cap(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  return length(pa - ba * h);
}
float crowd(vec2 p, float yb, float sc, float seedv, float wpc){
  float cid0 = floor(p.x / wpc);
  float m = 0.;
  for (int k = -1; k <= 1; k++) {
    float cid = cid0 + float(k);
    float h1 = h11(cid * 1.37 + seedv), h2 = h11(cid * 2.91 + seedv + 5.);
    float cx = (cid + .5) * wpc + (h1 - .5) * wpc * .5;
    float ph = uBeat * 3.14159 + h1 * 6.28;
    float hy = yb + sc * (.045 + .035 * h2) + sc * .018 * uCrowd * abs(sin(ph));
    float dh = length(p - vec2(cx, hy)) - sc * .034;
    vec2 e = (p - vec2(cx, hy - sc * .075)) / vec2(sc * .065, sc * .05);
    float d = min(dh, (length(e) - 1.) * sc * .05);
    for (int j = 0; j < 2; j++) {
      float sg = float(j) * 2. - 1.;
      vec2 s0 = vec2(cx + sg * sc * .045, hy - sc * .06);
      float on = step(h1 * .85, .12 + .88 * uCrowd);
      float hgt = sc * (.04 + .17 * uCrowd * (.35 + .65 * (.5 + .5 * sin(ph + sg * 1.3))));
      vec2 s1 = s0 + vec2(sg * sc * (.02 + .03 * sin(ph * .5 + sg)), hgt) * on;
      d = min(d, cap(p, s0, s1) - sc * .011);
    }
    m = max(m, smoothstep(.0016, -.0016, d));
  }
  return m;
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  float lit = uIntro * (1. - .8 * uDrop);
  vec3 col = vec3(0.);
  float dh = HZ - p.y;
  vec3 pl = vec3(1., .93, .82);
  pl = mix(pl, uC1, uTierMix * .6);
  if (dh > 0.) {
    float mf = 1.85 / max(dh, .001);
    vec2 g = vec2(p.x * mf, mf);
    vec2 id = floor(g), f = fract(g);
    float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
    float edge = smoothstep(.025, .09, e);
    float mfig = 1.85 / (HZ - uFig.y);
    vec2 dd = vec2(g.x - uFig.x * mfig, g.y - mfig);
    float dw = length(vec2(dd.x, dd.y * 1.7));
    float wave = .5 + .5 * sin(dw * 1.7 - uBeat * TAU);
    float flick = step(.66 - .26 * uCrowd, h21(id + floor(uBeat) * 3.7));
    float b = .05 + uEn * (.4 * wave * wave * wave + .38 * flick);
    b *= .65 + .7 * uKick;
    float ring = exp(-pow((dw - uPul * 9.) * .7, 2.)) * step(0., uPul);
    b = mix(b, .24 + .16 * wave, uTierMix * .8);
    b += ring * .7;
    vec3 tc = pcol(h21(id + .5) * 5. + dw * .07, uTime * .07);
    col = tc * b * edge * lit;
    col += tc * .035 * (1. - edge) * lit;
    float far = smoothstep(.0, .08, dh);
    col = mix(pcol(.3, uTime * .07) * .05 * lit, col, far);
    col += vec3(.2, .1, .35) * .28 * exp(-dh * 5.) * lit;
    // glans: de vloer weerkaatst het lichtere deel van de muur
    col += pcol(.6, uTime * .1) * .045 * exp(-pow((p.x - uFig.x) * 2.2, 2.)) * lit;
  } else {
    float wy = p.y - HZ;
    col = mix(vec3(.055, .026, .105), vec3(.012, .01, .036), clamp(wy * 2.2, 0., 1.));
    vec2 dg = p - vec2(0., .05);
    col += vec3(.22, .08, .3) * exp(-dot(dg, dg) * 5.) * lit * (.7 + .6 * uKick * uEn);
    float bw = .05, bi = floor(p.x / bw);
    float bh = .03 + .24 * uEn * h21(vec2(bi, floor(uTime * 7.))) * (.6 + .4 * uKick);
    float bar = step(wy, bh) * step(abs(fract(p.x / bw) - .5), .36) * step(fract(wy * 28.), .65);
    col += pcol(bi * .07, uTime * .05) * bar * .32 * lit;
    float rr = length(p - vec2(0., .08));
    float ring = exp(-pow((rr - .31) * 70., 2.)) + .12 * exp(-pow((rr - .31) * 12., 2.));
    col += pcol(.3, uTime * .1) * ring * (.6 + .9 * uKick) * lit * smoothstep(0., .02, wy);
  }
  // discobal en lichtvlekken
  vec2 bc = vec2(0., uAsp < .8 ? .445 : .37);
  float br = uAsp < .8 ? .045 : .055;
  vec2 q = p - bc;
  float rq = length(q);
  vec2 spc = q;
  float aa = atan(spc.y, spc.x) + uTime * .25;
  float cellA = aa / TAU * 30.;
  float rr2 = rq * 7.;
  vec2 cid = vec2(floor(cellA), floor(rr2));
  float hh = h21(cid + 3.1);
  vec2 cl = vec2((fract(cellA) - .5) * rq * TAU / 30., (fract(rr2) - .5) / 7.);
  float spot = smoothstep(.017, .004, length(cl)) * step(.5, hh) * (.5 + .5 * sin(uTime * 3. + hh * 20.)) * smoothstep(.07, .13, rq);
  col += pcol(hh * 7., uTime * .08) * spot * (.25 + .9 * uEn) * lit * (.5 + .5 * uKick);
  if (rq < br + .12) {
    float line = step(abs(p.x), .0016) * step(bc.y, p.y);
    col += vec3(.5) * line * .35 * uIntro;
    if (rq < br) {
      vec2 u = q / br;
      float lon = asin(clamp(u.x, -1., 1.)) + uTime * .9;
      vec2 fc = vec2(floor(lon * 4.5), floor(u.y * 6.));
      float fh = h21(fc);
      float fl = pow(max(sin(uTime * 4. + fh * 30.), 0.), 6.);
      vec3 bcol = vec3(.2, .2, .26) * (.35 + .8 * fh) * (.4 + .6 * (1. - u.y * .5)) + vec3(1.) * fl * 1.8 * step(.55, fh);
      col = bcol * (.25 + .75 * uIntro);
    } else {
      col += pcol(.1, uTime * .1) * exp(-(rq - br) * 28.) * .5 * lit;
    }
  }
  // lichtbundels
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= uNB) break;
    float bx = (fi - 2.5) * .26;
    vec2 org = vec2(bx, .6);
    float ang = .34 * sin(uTime * (.7 + .13 * fi) + fi * 2.1);
    float sa = .4 * sin(uTime * 1.5) * (mod(fi, 2.) * 2. - 1.);
    ang = mix(ang, sa, uSync) - bx * .7;
    vec2 dir = vec2(sin(ang), -cos(ang));
    vec2 dv = p - org;
    float along = dot(dv, dir);
    float perp = dv.x * dir.y - dv.y * dir.x;
    float w = .01 + .045 * max(along, 0.);
    float bm = exp(-perp * perp / (w * w)) * smoothstep(0., .1, along) * exp(-along * .8);
    col += pcol(fi * 1.7, uTime * .06) * bm * .55 * lit * (.7 + .5 * uKick);
  }
  // spot op het figuurtje
  {
    float along = .62 - p.y;
    float hw = .03 + .16 * along;
    float m = exp(-pow((p.x - uFig.x) / hw, 2.) * 1.6) * smoothstep(-.02, .03, along) * step(uFig.y - .04, p.y);
    col += pl * m * .2 * uSpot * (.6 + .4 * uIntro);
    vec2 pd = vec2(p.x - uFig.x, (p.y - uFig.y) * 3.2);
    float pool = exp(-dot(pd, pd) * 26.);
    col += pl * pool * .55 * uSpot;
    // schaduw onder de voeten
    vec2 sd = vec2(p.x - uFig.x, (p.y - uFig.y + .004) * 4.5);
    float sh = exp(-dot(sd, sd) * (120. + 600. * uFig.z));
    col *= 1. - .6 * sh * (1. - uFig.z * 3.);
  }
  // luidsprekers
  {
    float sx = min(uAsp * .5 - .05, .6);
    for (int k = 0; k < 2; k++) {
      if (uAsp < .8) break;
      float sg = float(k) * 2. - 1.;
      vec2 sp = vec2(sg * sx, -.01);
      vec2 dq = abs(p - sp) - vec2(.042, .15);
      float bd = length(max(dq, 0.)) + min(max(dq.x, dq.y), 0.);
      if (bd < .004) {
        vec3 sc = vec3(.025, .022, .035) + vec3(.03) * smoothstep(.0, -.008, bd + .006);
        float wr = length(p - sp - vec2(0., -.05));
        float wr2 = length(p - sp - vec2(0., .075));
        float pu = 1. + .1 * uKick * (.4 + uEn);
        sc += vec3(.07, .05, .09) * smoothstep(.034 * pu, .03 * pu, wr) + vec3(.35, .2, .5) * uKick * uEn * smoothstep(.012, .0, abs(wr - .025 * pu)) * .6;
        sc += vec3(.07, .05, .09) * smoothstep(.016 * pu, .012 * pu, wr2);
        col = mix(col, sc * (.4 + .6 * uIntro), smoothstep(.002, -.002, bd));
      }
    }
  }
  // het publiek
  {
    float c1 = crowd(p, -.51, 1., 1.3, .13);
    float c2 = crowd(p, HZ - .005, .52, 7.7, .075) * smoothstep(.0, .03, p.y - HZ + .02);
    col = mix(col, vec3(.016, .012, .03) + pcol(.2, uTime * .1) * .02, c2 * .8);
    col = mix(col, vec3(.006, .004, .012), c1);
    col += pcol(.5, uTime * .1) * .13 * c1 * smoothstep(-.4, -.55, p.y) * lit * uKick * 0.;
  }
  // stralenkrans bij de onthulling
  if (uBurst > .001) {
    vec2 hc = p - vec2(uFig.x, uFig.y + .22);
    float an = atan(hc.y, hc.x);
    float rays = pow(.5 + .5 * sin(an * 11. + uTime * .6), 3.) * exp(-length(hc) * 1.3);
    vec3 rc = uRegen > .5 ? hsv(vec3(fract(an / TAU * 2. + uTime * .3), .7, 1.)) : mix(uC1, uC2, .5 + .5 * sin(an * 3.));
    col += rc * rays * uBurst * .8;
    col += uC1 * exp(-dot(hc, hc) * 7.) * uBurst * .25;
  }
  col *= uAlpha;
  col *= 1. - .35 * dot(p * vec2(1. / max(uAsp, .6), 1.), p * vec2(1. / max(uAsp, .6), 1.)) * 1.2;
  col += (h21(gl_FragCoord.xy + fract(uTime) * 61.) - .5) / 255.;
  o = vec4(max(col, 0.), 1.);
}`;

  const VS_FIG = `${KOP}
uniform vec2 uRes, uShake;
uniform float uZoom;
uniform vec4 uRect;
out vec2 vP;
void main(){
  vec2 g = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 p = mix(uRect.xy, uRect.zw, g);
  vP = p;
  p = p * uZoom + uShake;
  gl_Position = vec4(p.x * 2. * uRes.y / uRes.x, p.y * 2., 0., 1.);
}`;

  const FS_FIG = `${KOP}
in vec2 vP; out vec4 o;
uniform vec2 uRes;
uniform float uZoom, uMir, uFloor, uRefl, uSc, uTime;
uniform vec4 uSeg[14];
uniform float uRad[14];
uniform vec4 uHead;
uniform vec4 uFace;
uniform vec3 uFc;
uniform vec3 uRimL, uRimR, uRimB;
${GEMEEN}
const vec3 OUTC = vec3(.035, .03, .07);
float cap(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  return length(pa - ba * h);
}
vec3 shade(vec3 base, vec2 n2){
  if (uMir > .5) n2.y = -n2.y;
  n2 *= min(1., 1. / max(length(n2), 1e-3));
  float nz = sqrt(max(1. - dot(n2, n2), 0.));
  vec3 n = vec3(n2, nz);
  float df = clamp(dot(n, normalize(vec3(-.4, .7, .6))), 0., 1.);
  vec3 c = base * (.4 + .75 * df);
  float rim = pow(1. - nz, 2.2);
  c += rim * (uRimL * max(-n.x, 0.) + uRimR * max(n.x, 0.) + uRimB * max(-n.y, 0.));
  c += pow(df, 18.) * .1;
  return c;
}
vec3 baseCol(int i){
  if (i <= 1 || (i >= 3 && i <= 4)) return vec3(.13, .22, .46);
  if (i == 2 || i == 5) return vec3(.92, .92, .95);
  if (i == 6) return vec3(.68, .7, .76);
  if (i == 7) return vec3(.5, .52, .6);
  if (i <= 11) return vec3(.68, .7, .76);
  return vec3(.96, .74, .6);
}
float sdBox(vec2 p, vec2 b, float r){
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r;
}
void head(vec2 q, float fw, float ow, inout vec3 C, inout float A){
  vec2 rel = q - uHead.xy;
  float hr = uHead.w;
  vec2 l = rot2(-uHead.z) * rel / hr;
  float turn = uFc.x, back = uFc.y;
  float hairline = back > .5 ? -3. : .3 + .1 * cos(l.x * 2.4);
  float dskin = length(l) - 1.;
  float dcirc = length(l - vec2(0., .1)) - 1.1;
  float dtuft = length(l - vec2(.4 + .35 * turn, 1.02)) - .36;
  float hairD = min(max(dcirc, hairline - l.y), dtuft);
  float dl = min(dskin, hairD) * hr;
  if (dl > ow + fw * 2.) return;
  float ao = 1. - smoothstep(-fw, fw, dl - ow);
  C = mix(C, OUTC, ao);
  A = max(A, ao);
  float af = 1. - smoothstep(-fw, fw, dl);
  vec2 n2 = rel / hr;
  vec3 skin = shade(vec3(.97, .75, .62), n2);
  vec3 hair = shade(vec3(.2, .12, .08), n2) + vec3(.08, .05, .03) * smoothstep(.55, .0, length(l - vec2(-.3, .7)));
  float hm = 1. - smoothstep(-fw, fw, hairD * hr);
  vec3 hc = mix(skin, hair, hm);
  float inside = 1. - smoothstep(-.04, .0, (dskin + .0) * 1.);
  if (back < .5) {
    float ft = turn * .5;
    float skinM = (1. - hm) * inside;
    // wangen
    hc = mix(hc, vec3(1., .5, .55), .35 * max(uFace.x, 0.) * skinM * smoothstep(.17, .0, length(l - vec2(-.55 + ft, -.2))) );
    hc = mix(hc, vec3(1., .5, .55), .35 * max(uFace.x, 0.) * skinM * smoothstep(.17, .0, length(l - vec2(.55 + ft, -.2))) );
    // ogen
    float wide = max(-uFace.z, 0.), cls = clamp(uFace.z, 0., 1.);
    for (int j = 0; j < 2; j++) {
      float e = float(j) * 2. - 1.;
      vec2 ec = vec2(e * .34 + ft, .02);
      float rx = .15 * (1. + .3 * wide), ry = mix(.19 * (1. + .25 * wide), .03, cls);
      float de = length((l - ec) / vec2(rx, ry)) - 1.;
      float em = smoothstep(.1, -.1, de) * inside;
      vec3 ecol = mix(vec3(1.), vec3(.1, .06, .08), smoothstep(.5, .9, cls));
      hc = mix(hc, ecol, em);
      float dp = length(l - ec - vec2(.03 * turn + .02 * e, -.02)) - .085;
      hc = mix(hc, vec3(.06, .04, .07), smoothstep(.03, -.03, dp) * (1. - cls) * inside * em);
      hc = mix(hc, vec3(1.), smoothstep(.03, -.01, length(l - ec - vec2(.0, .04)) - .025) * (1. - cls) * inside);
      // wenkbrauwen
      float wr = max(-uFace.x, 0.), pr = max(uFace.x, 0.);
      vec2 bi = vec2(ec.x - e * .17, .4 + .08 * wr + .03 * pr + .1 * wide);
      vec2 bo = vec2(ec.x + e * .17, .38 - .05 * wr + .12 * wide);
      float db = cap(l, bi, bo) - .04;
      hc = mix(hc, vec3(.18, .1, .07), smoothstep(.03, -.03, db) * inside);
    }
    // mond
    float mw = .3;
    vec2 m = vec2(l.x - ft, l.y + .44);
    float tt = clamp(m.x / mw, -1., 1.);
    float ym = -.1 * uFace.x, yc = .09 * uFace.x;
    float curve = mix(ym, yc, tt * tt);
    float oh = .26 * uFace.y * (1. - tt * tt) + .0;
    float dv = abs(m.y - (curve - oh * .5)) - (.028 + oh * .5);
    float mm = smoothstep(.025, -.025, max(dv, abs(m.x) - mw)) * inside;
    vec3 mcol = oh > .05 ? mix(vec3(.4, .05, .1), vec3(1., .5, .55), smoothstep(-.02, -.12, m.y - curve + oh * .5 - .0) * .8) : vec3(.3, .08, .1);
    if (oh > .05) mcol = mix(mcol, vec3(1.), smoothstep(.05, .0, curve - m.y) * step(.5, uFace.x + .5) * .9);
    hc = mix(hc, mcol, mm);
    // zonnebril
    if (uFace.w > .01) {
      float yo = (1. - uFace.w) * 1.3;
      float dg = 1e3;
      for (int j = 0; j < 2; j++) {
        float e = float(j) * 2. - 1.;
        dg = min(dg, sdBox(l - vec2(e * .36 + ft, .03 + yo), vec2(.3, .19), .1));
      }
      dg = min(dg, sdBox(l - vec2(ft, .08 + yo), vec2(.12, .03), .02));
      float gm = smoothstep(.04, -.02, dg) * (inside + hm);
      vec3 gcol = vec3(.015, .015, .03) + vec3(.7, .85, 1.) * smoothstep(.07, .0, abs((l.x - ft) * .7 + (l.y - yo) * .6 + .15 * sin(uTime * 2.))) * .0;
      gcol += vec3(.85, .95, 1.) * smoothstep(.035, .0, abs((l.x - ft) * 1. + (l.y - yo) * 1. - .02 * 0. - fract(uTime * .3 + .0) * 0. - (.55 * sign(l.x - ft)) * .0 - .12 * sign(l.x - ft))) * .3 * step(abs(l.x - ft), .66);
      hc = mix(hc, gcol, gm);
    }
  }
  C = mix(C, hc, af);
  A = max(A, af);
  // zweetdruppel
  if (uFc.z > .001) {
    vec2 sc = vec2(1.1, .6 - .5 * fract(uFc.z));
    vec2 dq2 = (l - sc) / vec2(.1, .15);
    float dsw = (length(dq2) - 1.) * .1 * hr;
    float sa = (1. - smoothstep(-fw, fw, dsw)) * sin(fract(uFc.z) * 3.1416);
    C = mix(C, vec3(.55, .8, 1.), sa);
    A = max(A, sa);
  }
}
void main(){
  vec2 q = vP;
  if (uMir > .5) q.y = 2. * uFloor - q.y;
  float fw = 1. / uRes.y / uZoom;
  float ow = .0042 * uSc;
  vec3 C = vec3(0.);
  float A = 0.;
  for (int i = 0; i < 14; i++) {
    if (i == 8) head(q, fw, ow, C, A);
    vec4 s = uSeg[i];
    float r = uRad[i];
    vec2 pa = q - s.xy, ba = s.zw - s.xy;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
    vec2 v = pa - ba * h;
    float dl = length(v) - r;
    if (dl < ow + fw * 2.) {
      float ao = 1. - smoothstep(-fw, fw, dl - ow);
      C = mix(C, OUTC, ao);
      A = max(A, ao);
      float af = 1. - smoothstep(-fw, fw, dl);
      vec3 base = baseCol(i);
      vec3 sc = shade(base, v / r);
      C = mix(C, sc, af);
    }
  }
  float a = A;
  if (uMir > .5) {
    a *= uRefl * exp(-max(uFloor - vP.y, 0.) * 8.);
    C *= .7;
  }
  o = vec4(C * a, a);
}`;

  const VS_HUD = `${KOP}
uniform vec2 uRes;
uniform vec4 uRect;
out vec2 vUv;
void main(){
  vec2 g = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vUv = vec2(g.x, 1. - g.y);
  vec2 p = uRect.xy + (g * 2. - 1.) * uRect.zw;
  gl_Position = vec4(p.x * 2. * uRes.y / uRes.x, p.y * 2., 0., 1.);
}`;
  const FS_TXT = `${KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform float uAlpha;
void main(){
  vec4 t = texture(uTex, vUv);
  o = vec4(t.rgb * t.a * uAlpha, 0.);
}`;
  const FS_METER = `${KOP}
in vec2 vUv; out vec4 o;
uniform float uAlpha, uFill, uAr, uKick;
void main(){
  vec2 q = (vUv - .5) * 2. * vec2(uAr, 1.);
  float d = length(max(abs(q) - vec2(uAr - 1., 0.), 0.)) - 1.;
  float tr = smoothstep(.1, -.02, d) * .22;
  float rimm = smoothstep(.1, .0, abs(d + .04)) * .45;
  float fx = (vUv.x - .04) / .92;
  float fill = smoothstep(uFill + .006, uFill - .006, fx) * step(0., fx);
  float gap = smoothstep(.0, .06, abs(fract(fx * 10.) - .0)) * smoothstep(.0, .06, abs(fract(fx * 10.) - 1.));
  float inner = smoothstep(.02, -.04, d + .3);
  vec3 fc = mix(vec3(1., .3, .6), vec3(.25, .85, 1.), fx) * (1.1 + .5 * uKick);
  vec3 col = vec3(.6, .55, .9) * (tr + rimm) + fc * fill * gap * inner;
  o = vec4(col * uAlpha, 0.);
}`;

  // ───────────────────────── De opening ─────────────────────────
  SPO.openingen.dans = {
    naam: 'dans',
    shaders: {
      buhn: { vs: SPO.shaders.VS_VOL, fs: FS_BUHN, teken: 'vol' },
      fig: { vs: VS_FIG, fs: FS_FIG, teken: 'strip' },
      txt: { vs: VS_HUD, fs: FS_TXT, teken: 'strip' },
      meter: { vs: VS_HUD, fs: FS_METER, teken: 'strip' },
    },

    tijdlijn(d) {
      const pl = plan(d);
      return { E: pl.E, K0: pl.K0, staart: 0.5, fotos: pl.fotos };
    },

    art(d, h) {
      const mk = (w, hh, txt, px, glow) => {
        const cv = h.art.nieuw(w, hh);
        const x = cv.getContext('2d');
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        let s = px;
        x.font = `800 ${s}px ${h.art.F_SPORT}`;
        const mw = x.measureText(txt).width;
        if (mw > w * 0.92) {
          s *= (w * 0.92) / mw;
          x.font = `800 ${s}px ${h.art.F_SPORT}`;
        }
        x.shadowColor = glow;
        x.shadowBlur = 14;
        x.fillStyle = '#ffffff';
        x.fillText(txt, w / 2, hh / 2 + 2);
        x.shadowBlur = 0;
        x.fillText(txt, w / 2, hh / 2 + 2);
        return cv;
      };
      return { cap: mk(1024, 96, ('DANSJE VOOR ' + (d.vak || '')).toUpperCase(), 72, '#ff4fa8'), lab: mk(512, 64, 'DANS-SCORE', 48, '#58d8ff') };
    },

    maak(c) {
      const { tl, d, tier, reduceer, motor } = c;
      const gl = c.gl;
      const E = tl.E, K0 = tl.K0;
      const pl = plan(d);
      const N = pl.N, SK = pl.s, ch = pl.ch;
      const rngX = prng(hash(d.vak + '|' + d.cijferTekst + '|x'));
      void rngX;
      const pB = c.prog('buhn'), pF = c.prog('fig'), pT = c.prog('txt'), pM = c.prog('meter');
      const capTex = c.art && c.art.cap ? c.tekstuur(c.art.cap) : null;
      const labTex = c.art && c.art.lab ? c.tekstuur(c.art.lab) : null;

      // ── geluid ──
      let beat = null;
      c.at(B_START, () => {
        beat = c.audio.speel('dans-beat', { gain: 0.9 });
      });
      for (let i = 0; i < 4; i++) c.at(0.35 + i * 0.32, () => c.audio.stap(0.35, i & 1 ? 0.2 : -0.2));
      const crowdG = 0.2 + 0.7 * SK;
      c.at(T0 + 3, () => c.audio.menigte(E - T0 - 2.5, 0.25 + 0.6 * SK));
      for (let i = 0; i < N; i++) {
        const nm = MOVES[ch[i]].name, t1 = T0 + i;
        if (nm === 'stumble') {
          c.at(t1 + 0.28, () => {
            if (beat && beat.stop) beat.stop(0.04);
            beat = null;
          });
          c.at(t1 + 0.34, () => c.audio.speel('dans-scratch', { gain: 0.9 }));
          c.at(t1 + 1.25, () => {
            beat = c.audio.speel('dans-beat', { gain: 0.9, offset: t1 + 1.25 - B_START, fadeIn: 0.04 });
          });
          c.at(t1 + 0.45, () => c.audio.stap(0.5, 0.2));
        } else if (nm === 'clap') {
          c.at(t1 + 0.125, () => c.audio.tik(0.7));
          c.at(t1 + 0.625, () => c.audio.tik(0.7));
        } else if (nm === 'backflip') {
          c.at(t1 + 0.15, () => c.audio.zwiep(0.5, 1.3));
          c.at(t1 + 0.85, () => c.audio.boem(0.35, 1.3));
          c.at(t1 + 0.9, () => c.audio.gejuich(1.6, 0.4));
        } else if (nm === 'windmill') {
          c.at(t1 + 0.1, () => c.audio.zwiep(0.45, 0.9));
          c.at(t1 + 0.6, () => c.audio.gejuich(1.6, 0.35));
        } else if (nm === 'spin') {
          c.at(t1 + 0.1, () => c.audio.zwiep(0.4, 1.1));
        } else if (nm === 'steptouch' || nm === 'footwork') {
          c.at(t1 + 0.25, () => c.audio.stap(0.35, 0));
          c.at(t1 + 0.75, () => c.audio.stap(0.35, 0));
        }
      }
      c.at(E - 0.05, () => {
        c.audio.speel('dans-dab', { gain: 1 });
        c.audio.boem(0.7);
        c.trillen([30, 20, 70]);
      });
      c.at(E + 0.05, () => c.audio.gejuich(2.2, 0.3 + 0.7 * SK));
      if (tier >= 3) c.at(E + 0.1, () => c.audio.boem(0.6, 0.8));
      if (tier === 4) {
        c.at(E + 0.3, () => c.audio.vuurwerk());
        c.at(E + 0.75, () => c.audio.vuurwerk());
      }
      void crowdG;

      // ── effecten bij de dab (het niveau mag pas op E zichtbaar worden) ──
      c.schok(E, 0.05, 0.3);
      c.flits(E, 0.7, 0.05);
      c.golf(E, 1.4, 1, 0);
      c.golf(E + 0.14, 1.0, 0.7, 0);
      if (tier >= 2) c.golf(E + 0.3, 0.8, 0.6, 0);
      if (tier >= 4) c.golf(E + 0.5, 0.9, 0.6, 0);
      const nC = [50, 100, 160, 240, 420][tier];
      const conf = c.e({ mode: 2, t0: E + 0.02, life: 3.6, delay: 0.5, n: nC, org: [0, 0.56], angle: -Math.PI / 2, spread: 1.3, spd: [0.1, 0.55], grav: [0, -0.12], drag: 0.45, size: [0.008, 0.017], col1: c.kl, col2: c.kl2, alpha: 1, blend: 'alpha', regen: tier === 4 ? 1 : 0, seed: 41 });
      const vonk = c.e({ mode: 0, t0: E + 0.02, life: 1.3, delay: 0.05, n: 140 + tier * 160, org: [0, -0.02], angle: 0, spread: TAU, spd: [0.25, 1.4], grav: [0, -0.4], drag: 1.2, size: [0.002, 0.006], col1: c.kl, col2: [1, 0.96, 0.85], alpha: 0.9, regen: tier === 4 ? 1 : 0, seed: 43 });
      const vw = tier === 4 ? c.e({ mode: 4, t0: E + 0.25, life: 2.4, n: 12 * 120, per: 120, alpha: 1, seed: 47, lod: false }) : null;

      // ── skelet ──
      const PA = new Float64Array(NP), PL = new Float64Array(NP), PB = new Float64Array(NP), PC = new Float64Array(NP), PO = new Float64Array(NP), PQ = new Float64Array(NP);
      const DABq = new Float64Array(NP);
      const dq = 0.7 + 0.3 * SK;
      for (let i = 0; i < NP; i++) DABq[i] = REST[i] + (DAB[i] - REST[i]) * (AMPIDX.indexOf(i) >= 0 || i === KL || i === KR ? dq : 1);
      const baseSmile = klem(-0.15 + 1.2 * SK, -0.2, 1);
      const AMP = 0.62 + 0.55 * SK;
      const xStart = () => -Math.min(c.asp * 0.5 + 0.1, 0.75);
      const walkE = (tt) => sm(0.15, 1.55, tt);
      const walkX = (tt) => xStart() * (1 - walkE(tt));

      function walk(tt, o) {
        o.set(REST);
        const xw = walkX(tt);
        const ph = ((xw - xStart()) * TAU) / 0.24;
        const am = 1 - sm(1.3, 1.62, tt);
        const a = S_(ph);
        o[FACE] = 1 - sm(T0 - 0.3, T0, tt);
        o[TL] = 0.55 * a * am - 0.05;
        o[TR] = -0.55 * a * am + 0.05;
        o[KL] = -0.8 * mx(0, Math.cos(ph)) * am;
        o[KR] = -0.8 * mx(0, -Math.cos(ph)) * am;
        o[ALS] = -0.3 * S_(ph + Math.PI) * am - 0.15;
        o[ARS] = 0.3 * S_(ph) * am + 0.15;
        o[ALE] = 0.35;
        o[ARE] = -0.35;
        o[LEAN] = 0.05;
        o[JUMP] = 0.012 * Math.abs(a) * am;
        o[SMILE] = 0.6;
      }
      function ev(slot, u, o) {
        o.set(REST);
        o[SMILE] = baseSmile;
        const M = MOVES[ch[slot]];
        M.fn(u, o);
        if (!M.raw) for (let k = 0; k < AMPIDX.length; k++) {
          const i = AMPIDX[k];
          o[i] = REST[i] + (o[i] - REST[i]) * AMP;
        }
      }
      function slotPose(tt, o) {
        let x = tt - T0;
        if (x < 0) x = 0;
        let slot = Math.floor(x), u = x - slot;
        if (slot >= N) {
          slot = N - 1;
          u = 1;
        }
        ev(slot, u, PC);
        const w = sm(0, 0.2, u);
        if (w < 1) {
          if (slot > 0) ev(slot - 1, 1, PB);
          else walk(T0, PB);
          let r = PB[ROT];
          PB[ROT] = r - TAU * Math.round(r / TAU);
          for (let i = 0; i < NP; i++) o[i] = PB[i] + (PC[i] - PB[i]) * w;
        } else o.set(PC);
      }
      const slop = Math.pow(1 - SK, 1.5);
      function evalPose(tt, o) {
        if (tt < 0) {
          o.set(REST);
          o[LEAN] = 0.03 * S_(tt * -1.2 + 1);
          o[SMILE] = 0.5;
          return;
        }
        if (tt > E) tt = E;
        if (tt < T0) {
          walk(tt, o);
          return;
        }
        const dA = slop * 0.15 * S_(1.9 * tt), dL = (1 - SK) * 0.05 * S_(1.3 * tt + 1);
        slotPose(tt + dL, PL);
        slotPose(tt + dA, PA);
        o.set(PL);
        o[ALS] = PA[ALS];
        o[ALE] = PA[ALE];
        o[ARS] = PA[ARS];
        o[ARE] = PA[ARE];
        if (SK < 0.5) {
          const tr = (0.5 - SK) * 0.1;
          o[KL] += tr * S_(tt * 23);
          o[KR] += tr * S_(tt * 19 + 1);
        }
        const wd = sm(E - 0.22, E - 0.04, tt);
        if (wd > 0) for (let i = 0; i < NP; i++) o[i] = o[i] + (DABq[i] - o[i]) * wd;
      }

      // ── voorwaartse kinematica ──
      const SEG = new Float32Array(56), RAD = new Float32Array(14), HD = new Float32Array(4), FACEV = new Float32Array(4), FCV = new Float32Array(3);
      const LP = new Float64Array(64); // 14 segmenten × 4 + hoofd
      const RC = [0.028, 0.023, 0.02, 0.028, 0.023, 0.02, 0.052, 0.032, 0.021, 0.019, 0.021, 0.019, 0.021, 0.021];
      const RECT = new Float32Array(4);
      let figW = 0;
      function setSeg(i, ax, ay, bx, by) {
        const k = i * 4;
        LP[k] = ax;
        LP[k + 1] = ay;
        LP[k + 2] = bx;
        LP[k + 3] = by;
      }
      function limb(i1, i2, sx0, sy0, a1, l1, rel, l2) {
        const ex = sx0 + S_(a1) * l1, ey = sy0 - Math.cos(a1) * l1;
        const a2 = a1 + rel;
        const wx = ex + S_(a2) * l2, wy = ey - Math.cos(a2) * l2;
        setSeg(i1, sx0, sy0, ex, ey);
        setSeg(i2, ex, ey, wx, wy);
        return a2;
      }
      function fk(P, ox, fy, S) {
        const lean = P[LEAN], cl = Math.cos(lean), sl = S_(lean);
        const nx = sl * 0.15, ny = cl * 0.15;
        const hl = 0.034;
        // torso en kap
        setSeg(6, 0, 0.01, sl * 0.12, cl * 0.12);
        setSeg(7, nx - cl * 0.05, ny + sl * 0.05 - 0.005, nx + cl * 0.05, ny - sl * 0.05 - 0.005);
        // benen
        const lx = -cl * hl, ly = sl * hl, rx = cl * hl, ry = -sl * hl;
        const aL = limb(3, 4, lx, ly, P[TL], 0.105, P[KL], 0.105);
        const aR = limb(0, 1, rx, ry, P[TR], 0.105, P[KR], 0.105);
        // voeten
        const turn = klem(P[FACE] + P[TURN], -1, 1), at = Math.abs(turn);
        for (let k = 0; k < 2; k++) {
          const sgn = k ? 1 : -1, a = k ? aR : aL, i1 = k ? 1 : 4;
          const dir = mixf(sgn, turn >= 0 ? 1 : -1, at);
          const ax = LP[i1 * 4 + 2], ay = LP[i1 * 4 + 3];
          const px = Math.cos(a) * dir, py = S_(a) * dir;
          setSeg(k ? 2 : 5, ax - px * 0.008, ay - py * 0.008, ax + px * 0.05 + S_(a) * 0.01, ay + py * 0.05 - Math.cos(a) * 0.01);
        }
        // armen
        const shx = nx - cl * 0.0, shy = ny; // schouderlijn
        const sLx = nx - sl * 0.022 - cl * 0.064, sLy = ny - cl * 0.022 + sl * 0.064;
        const sRx = nx - sl * 0.022 + cl * 0.064, sRy = ny - cl * 0.022 - sl * 0.064;
        void shx; void shy;
        const wRa = limb(8, 9, sRx, sRy, P[ARS], 0.092, P[ARE], 0.088);
        const wLa = limb(10, 11, sLx, sLy, P[ALS], 0.092, P[ALE], 0.088);
        setSeg(12, LP[9 * 4 + 2] + S_(wRa) * 0.012, LP[9 * 4 + 3] - Math.cos(wRa) * 0.012, LP[9 * 4 + 2] + S_(wRa) * 0.012, LP[9 * 4 + 3] - Math.cos(wRa) * 0.012);
        setSeg(13, LP[11 * 4 + 2] + S_(wLa) * 0.012, LP[11 * 4 + 3] - Math.cos(wLa) * 0.012, LP[11 * 4 + 2] + S_(wLa) * 0.012, LP[11 * 4 + 3] - Math.cos(wLa) * 0.012);
        // hoofd
        const ha = lean + P[HEAD];
        LP[56] = nx + S_(ha) * 0.072;
        LP[57] = ny + Math.cos(ha) * 0.072;
        // transformatie
        const sxf = Math.max(Math.abs(P[SX]), 0.14) * S, sy = S;
        const rot = P[ROT], cr = Math.cos(rot), sr = S_(rot);
        const pvy = 0.07 * S;
        let low = 1e9;
        for (let i = 0; i < 15; i++) {
          const n2 = i === 14 ? 1 : 2;
          for (let k = 0; k < n2; k++) {
            const j = i * 4 + k * 2;
            const x = LP[j] * sxf, y = LP[j + 1] * sy - pvy;
            LP[j] = x * cr - y * sr;
            LP[j + 1] = x * sr + y * cr + pvy;
            const rr = (i === 14 ? 0.064 : RC[i]) * S;
            if (LP[j + 1] - rr < low) low = LP[j + 1] - rr;
          }
        }
        const oy = fy - low + P[JUMP] * S, oxx = ox + P[HX] * S;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < 15; i++) {
          const n2 = i === 14 ? 1 : 2;
          const rr = ((i === 14 ? 0.064 : RC[i]) + 0.012) * S;
          for (let k = 0; k < n2; k++) {
            const j = i * 4 + k * 2;
            const x = LP[j] + oxx, y = LP[j + 1] + oy;
            LP[j] = x;
            LP[j + 1] = y;
            if (x - rr < x0) x0 = x - rr;
            if (x + rr > x1) x1 = x + rr;
            if (y - rr < y0) y0 = y - rr;
            if (y + rr > y1) y1 = y + rr;
          }
        }
        for (let i = 0; i < 14; i++) {
          SEG[i * 4] = LP[i * 4];
          SEG[i * 4 + 1] = LP[i * 4 + 1];
          SEG[i * 4 + 2] = LP[i * 4 + 2];
          SEG[i * 4 + 3] = LP[i * 4 + 3];
          RAD[i] = RC[i] * S;
        }
        HD[0] = LP[56];
        HD[1] = LP[57];
        HD[2] = rot - ha;
        HD[3] = 0.064 * S;
        RECT[0] = x0 - 0.02;
        RECT[1] = y0 - 0.02;
        RECT[2] = x1 + 0.02;
        RECT[3] = y1 + 0.02;
        figW = oy - fy; // hoogte boven de vloer (voor de schaduw)
        return turn;
      }

      const RIML = [0.8, 0.3, 0.7], RIMR = [0.2, 0.7, 1], RIMB = [0.5, 0.3, 0.9];
      const TMP = [0, 0, 0];
      const TC1 = [0.5, 0.5, 0.5], TC2 = [0.5, 0.5, 0.5];
      const SFIG = [0, VLOER, 0];
      let lastRim = -1;

      function tEff(t) {
        if (t <= E) return t;
        const u = Math.max(t - E - 0.07, 0);
        return E + (u * u) / (u + 0.45);
      }
      const stumbleStart = pl.st.map((k) => T0 + k);
      function dropAmt(t) {
        let m = 0;
        for (let i = 0; i < stumbleStart.length; i++) m = Math.max(m, sm(stumbleStart[i] + 0.25, stumbleStart[i] + 0.3, t) * (1 - sm(stumbleStart[i] + 1.15, stumbleStart[i] + 1.4, t)));
        return m;
      }

      function figDraw(t, tp, ox, S, shades, refl, mirOnly, clone) {
        evalPose(tp, PO);
        const wdab = sm(E - 0.22, E - 0.04, tp);
        // gezicht
        const blink = (tp * 0.43) % 1 < 0.05 ? 1 : 0;
        FACEV[0] = PO[SMILE];
        FACEV[1] = PO[OPEN];
        let eye = PO[EYE];
        if (SK < 0.55) eye = mixf(eye, 0.9, wdab);
        FACEV[2] = Math.max(eye, blink * 0.95);
        FACEV[3] = shades;
        const sc = S * (t > E ? 1 + 0.06 * Math.exp(-(t - E) / 0.2) : 1);
        const turn = fk(PO, ox, VLOER, sc);
        FCV[0] = turn;
        FCV[1] = PO[SX] < -0.1 ? 1 : 0;
        FCV[2] = !clone && SK < 0.4 && tp > T0 + 1.5 && tp < E ? 0.2 + ((tp * 0.6) % 0.8) : 0;
        pF.gebruik();
        c.basis(pF);
        pF.f1('uTime', t);
        pF.f1('uFloor', VLOER);
        pF.f1('uSc', sc);
        pF.f1('uRefl', 0.34);
        pF.v4s('uSeg[0]', SEG);
        pF.f1v('uRad[0]', RAD);
        pF.v4s('uHead', HD);
        pF.v4s('uFace', FACEV);
        pF.v3('uFc', FCV);
        pF.v3('uRimL', RIML);
        pF.v3('uRimR', RIMR);
        pF.v3('uRimB', RIMB);
        motor.mengen('alpha');
        if (refl) {
          pF.f1('uMir', 1);
          pF.f4('uRect', RECT[0], 2 * VLOER - RECT[3], RECT[2], 2 * VLOER - Math.min(RECT[1], VLOER));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          motor.teken.draws++;
        }
        if (!mirOnly) {
          pF.f1('uMir', 0);
          pF.f4('uRect', RECT[0], RECT[1], RECT[2], RECT[3]);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          motor.teken.draws++;
        }
      }

      function bouw(t, wacht) {
        const asp = c.asp;
        const sk = wacht ? 0.45 : SK;
        const te = wacht ? t : tEff(t);
        const bt = (te - B0) / BEAT;
        const kick = bt < 0 ? 0 : Math.exp(-(bt - Math.floor(bt)) * 5.5);
        const intro = wacht ? 1 : sm(0.05, 1.4, t);
        const drop = wacht ? 0 : dropAmt(t);
        const post = t >= E && !wacht;
        const en = wacht ? 0.35 : 0.3 + 0.7 * sk;
        const S = Math.min(1, 0.45 + asp * 0.75);
        // ── het podium ──
        pB.gebruik();
        c.basis(pB);
        pB.f1('uTime', te);
        pB.f1('uAlpha', pBalpha);
        pB.f1('uBeat', bt);
        pB.f1('uKick', kick * (1 - drop));
        pB.f1('uEn', en * (1 - 0.6 * drop));
        pB.f1('uCrowd', wacht ? 0.3 : 0.2 + 0.8 * sk * sm(T0 - 0.5, T0 + 3, t) + (post ? 0.2 : 0));
        pB.f1('uSync', sk > 0.88 ? sm(0.88, 0.96, sk) : 0);
        pB.f1('uDrop', drop);
        pB.f1('uIntro', intro);
        pB.f1('uAsp', asp);
        let nb = wacht ? 3 : Math.round(2 + 3 * sk) + (sk > 0.9 ? 1 : 0);
        if (motor.kwaliteit >= 2) nb = Math.min(nb, 3);
        pB.f1('uNB', nb * sm(0.3, 0.9, t) + (wacht ? 0 : 0));
        pB.f1('uSpot', wacht ? 0.8 : sm(0.2, 1.0, t));
        let burst = 0, tm = 0, pul = -1;
        if (post) {
          const x = t - E;
          tm = sm(0, 0.1, x);
          burst = Math.exp(-x / 0.9) * (1 - sm(1.0, 1.4, x)) + 0.35 * sm(0.1, 0.3, x) * (1 - sm(1.2, 1.5, x));
          pul = x;
          const k1 = c.kl, k2 = c.kl2;
          TC1[0] = k1[0]; TC1[1] = k1[1]; TC1[2] = k1[2];
          TC2[0] = k2[0]; TC2[1] = k2[1]; TC2[2] = k2[2];
          pB.v3('uC1', TC1);
          pB.v3('uC2', TC2);
        }
        pB.f1('uTierMix', tm);
        pB.f1('uRegen', post && tier === 4 ? 1 : 0);
        pB.f1('uBurst', burst);
        pB.f1('uPul', pul);
        // positie van het figuurtje
        const xw = wacht ? 0 : walkX(t);
        SFIG[0] = xw;
        SFIG[1] = VLOER;
        SFIG[2] = 0;
        // (de sprong-hoogte voor de schaduw komt uit de vorige beeldberekening; dus eerst het skelet)
        // rimlicht: twee tinten die door het feest wandelen
        const hp = te * 0.07;
        if (post) {
          RIML[0] = TC1[0] * 0.9; RIML[1] = TC1[1] * 0.9; RIML[2] = TC1[2] * 0.9;
          RIMR[0] = TC2[0] * 0.9; RIMR[1] = TC2[1] * 0.9; RIMR[2] = TC2[2] * 0.9;
          RIMB[0] = (TC1[0] + TC2[0]) * 0.5; RIMB[1] = (TC1[1] + TC2[1]) * 0.5; RIMB[2] = (TC1[2] + TC2[2]) * 0.5;
        } else {
          hsvTo(hp + 0.9, 0.7, 0.75 * intro, RIML);
          hsvTo(hp + 0.5, 0.7, 0.75 * intro, RIMR);
          hsvTo(hp + 0.15, 0.7, 0.5 * intro, RIMB);
        }
        void TMP;
        void lastRim;
        // het figuurtje bepaalt zijn sprong eerst (voor de schaduw)
        const tp = wacht ? 0 : t;
        let hoogte = 0;
        if (wacht) {
          // rustig staan: de rustpose met een zacht deinen
          PO.set(REST);
          PO[LEAN] = 0.03 * S_(t * 1.2);
          PO[JUMP] = 0.006 * Math.abs(S_(t * 3.14159 / BEAT * 0.5));
          PO[SMILE] = 0.5;
          hoogte = PO[JUMP];
        } else {
          evalPose(tp, PO);
          hoogte = PO[JUMP];
        }
        SFIG[2] = klem(hoogte * S * 1.2, 0, 0.3);
        pB.v3('uFig', SFIG);
        motor.mengen('geen');
        motor.volledig();
        motor.teken.draws++;
        return S;
      }

      function tekenFiguren(t, wacht, S) {
        const asp = c.asp;
        const lowQ = motor.kwaliteit >= 3;
        let shades = 0;
        if (!wacht) {
          if (SK >= 0.75) shades = sm(T0 + 3, T0 + 3.2, t);
          else if (SK >= 0.55) shades = sm(E - 0.2, E - 0.05, t);
        }
        const ox = wacht ? 0 : walkX(t);
        if (!wacht && tier === 4 && t > E - 5.5) {
          const a = sm(E - 5.5, E - 5.0, t);
          const cx = Math.min(0.3, asp * 0.5 - 0.13);
          for (let k = 0; k < 2; k++) {
            const sg = k ? 1 : -1;
            const cs = S * 0.78 * a;
            figDraw(t, t - 0.25 * (k + 1), sg * cx * (0.4 + 0.6 * a), cs, shades, !lowQ && motor.kwaliteit < 2, false, true);
          }
        }
        if (wacht) {
          figDraw(t, -t - 0.01, 0, S, 0, !lowQ, false, false);
        } else figDraw(t, t, ox, S, shades, !lowQ, false, false);
      }

      let hudUit = 1;
      function hud(t, wacht) {
        if (wacht) return;
        const asp = c.asp;
        hudUit = 1 - sm(E - 0.15, E + 0.25, t);
        const a = sm(0.5, 1.2, t) * hudUit;
        if (a < 0.004) return;
        const wcap = Math.min(0.56, asp * 0.86);
        const hcap = (wcap * 96) / 1024;
        const x0 = -asp / 2 + 0.03 + wcap / 2 * 0 + Math.max(0, 0);
        const cx = asp < 1 ? 0 : -asp / 2 + 0.025 + wcap / 2;
        const cy = 0.5 - 0.1 - hcap / 2;
        void x0;
        motor.mengen('optel');
        if (capTex) {
          pT.gebruik();
          pT.f4('uRect', cx, cy, wcap / 2, hcap / 2);
          pT.tex('uTex', 0, capTex);
          pT.f1('uAlpha', a * 0.95);
          c.basis(pT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          motor.teken.draws++;
        }
        const wl = Math.min(0.26, asp * 0.5);
        const hl = (wl * 64) / 512;
        const cyl = cy - hcap / 2 - hl / 2 - 0.004;
        const cxl = asp < 1 ? 0 : cx - wcap / 2 + wl / 2 + 0.006;
        if (labTex) {
          pT.gebruik();
          pT.f4('uRect', cxl, cyl, wl / 2, hl / 2);
          pT.tex('uTex', 0, labTex);
          pT.f1('uAlpha', a * 0.9);
          c.basis(pT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          motor.teken.draws++;
        }
        // de meter
        const wm = Math.min(0.36, asp * 0.7), hm = 0.016;
        const cym = cyl - hl / 2 - hm - 0.004;
        const cxm = asp < 1 ? 0 : cx - wcap / 2 + wm / 2 + 0.006;
        const x = Math.max(0, t - T0), i = Math.min(N, Math.floor(x)), f = x - Math.floor(x);
        const ramp = Math.min(1, (i + sm(0, 0.5, f)) / N);
        let fill = SK * (0.05 + 0.95 * ramp);
        fill *= 1 - 0.3 * dropAmt(t);
        if (t < T0) fill = 0;
        if (t >= E - 0.05) fill = SK;
        const bt = (t - B0) / BEAT, kick = bt < 0 ? 0 : Math.exp(-(bt - Math.floor(bt)) * 5.5);
        fill = klem(fill + 0.01 * kick, 0, 1);
        pM.gebruik();
        c.basis(pM);
        pM.f4('uRect', cxm, cym, wm / 2, hm);
        pM.f1('uAlpha', a);
        pM.f1('uFill', fill);
        pM.f1('uAr', wm / (2 * hm));
        pM.f1('uKick', kick);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        motor.teken.draws++;
      }

      function alles(t, wacht) {
        let al = 1;
        if (!wacht) {
          al = 1 - sm(K0 + 0.02, K0 + 0.5, t);
        }
        const S = bouw(t, wacht);
        // de uitdoving aan het eind: de buhn-uniform uAlpha is al gezet in bouw(); hier corrigeren we niet meer
        void al;
        tekenFiguren(t, wacht, S);
        if (!wacht) {
          if (t >= E - 0.01 && t <= E + 3.8) {
            const f = 1 - sm(K0, K0 + 0.4, t);
            conf.alpha = f;
            vonk.alpha = 0.9 * f;
            c.zend(t, conf);
            c.zend(t, vonk);
          }
          if (vw && t >= E + 0.2 && t <= E + 2.8) c.zend(t, vw);
          hud(t, wacht);
        }
      }

      return {
        teken(t, dt, inv) {
          void dt; void inv;
          pBalpha = 1 - sm(K0 + 0.02, K0 + 0.5, t);
          alles(t, false);
          const x = t - E;
          const kick = (() => {
            const bt = (tEff(t) - B0) / BEAT;
            return bt < 0 || t > E ? 0 : Math.exp(-(bt - Math.floor(bt)) * 6);
          })();
          let z = 1 + (reduceer ? 0 : 0.01 * kick * (0.3 + SK));
          if (t >= E) {
            z = 1 + 0.07 * Math.exp(-x / 0.22) + 0.03 * sm(0, 1.4, x);
            c.post.rad = 0.2 * Math.exp(-x / 0.12);
            c.post.ca = 1 + 1.5 * Math.exp(-x / 0.2);
          }
          c.post.zoom = z;
          c.post.bloom = 1.05;
        },
        wacht(t) {
          pBalpha = 1;
          alles(1.9 + (t % 6), true);
        },
        schud(t) {
          if (t > E - 0.35 && t < E) return 0.0015 * ((t - (E - 0.35)) / 0.35);
          return 0;
        },
      };

      // (uAlpha van de buhn wordt hieronder in een kleine omweg gezet)
    },
  };
})();
