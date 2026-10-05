/*
 * Somtoday Pack Opener — openingen/plinko.js
 * Plinko: een chromen bal valt door een neon pennenbord en landt in een van de tien bakjes (1 t/m 10). Het bakje is
 * het cijfer, de plek in het bakje de decimalen. Het pad (9 keer links/rechts) wordt één keer berekend met een
 * zaadje uit vak + cijfer; teken(t) leest daarna alleen nog uit tabellen: elk beeld is een pure functie van t.
 * Bordruimte: x = −5…5 (bakjes van 1 breed), y omhoog; de pinkoppen en het midden van de bal liggen op z = 0,2.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  const { KOP, GEMEEN, VS_VOL } = SPO.shaders;

  // ───────────────────────── Bord en pad ─────────────────────────
  const RIJ0 = 3.9; // y van de bovenste rij pinnen
  const RH = 0.87; // afstand tussen de rijen
  const RP = 0.085; // straal van een pinkop
  const RB = 0.2; // straal van de bal
  const RT = 0.05; // straal van de kop van een tussenschot
  const RTB = RT + RB;
  const TIP = -3.72; // y van de koppen van de tussenschotten
  const VLOER = -4.95; // bodem van de bakjes
  const G = 14; // zwaartekracht (bord-eenheden / s²)
  const START = [0, 4.92]; // de bal in de lanceerbuis
  const FOC = 0.5 / Math.tan((20 * Math.PI) / 180); // brandpunt in p-eenheden (40° beeldhoek)
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];

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
  const klem = (v, a, b) => Math.max(a, Math.min(b, v));

  // Negen keuzes (−1 links, +1 rechts) met precies `rechts` keer rechts, geschud; geen saaie ‘eerst alles links, dan alles rechts’.
  function beslis(rechts, rnd) {
    let a = null;
    for (let poging = 0; poging < 60; poging++) {
      a = [];
      for (let i = 0; i < 9; i++) a.push(i < rechts ? 1 : -1);
      for (let i = 8; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const x = a[i];
        a[i] = a[j];
        a[j] = x;
      }
      if (rechts === 0 || rechts === 9) break;
      let wissel = 0;
      for (let i = 1; i < 9; i++) if (a[i] !== a[i - 1]) wissel++;
      const nodig = rechts >= 2 && rechts <= 7 && poging < 30 ? 3 : 2;
      if (wissel >= nodig) break;
    }
    return a;
  }

  // Catmull-Rom over gelijk verdeelde sleutels
  function cr(k, u) {
    const n = k.length - 1;
    const f = klem(u, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const s = f - i;
    const p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(n, i + 2)];
    return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s * s * s);
  }
  const WIP = [-0.1, -0.34, 0.12, -0.13, 0.05, 0.6]; // de bal wiebelt op het tussenschot (× kant van het doelbakje)

  // Het hele pad: segmenten in ‘bordtijd’ met elk een eigen tempo (slow motion onderaan), daarna omgerekend naar echte tijd.
  function maakPad(d) {
    const snel = !!d.snel;
    const tR = snel ? 0.85 : 1.5;
    const E = snel ? 4.7 + 0.3 * d.I : 8.3 + 0.6 * d.I;
    const rnd = prng(hash(d.vak + '|' + d.cijferTekst + '|plinko'));
    const k = klem(Math.round(d.g), 1, 10);
    const dec = beslis(k - 1, rnd);
    const side = dec[8];
    const PX = [];
    const B = [];
    const TH = [];
    let px = 0;
    for (let r = 0; r < 9; r++) {
      PX.push(px);
      const th = dec[r] * (r === 8 ? 0.58 + 0.08 * rnd() : 0.3 + 0.24 * rnd());
      TH.push(th);
      B.push([px + (RP + RB) * Math.sin(th), RIJ0 - r * RH + (RP + RB) * Math.cos(th)]);
      px += 0.5 * dec[r];
    }
    PX.push(px); // midden van het bakje
    const x8 = PX[8];
    const rand = Math.abs(x8 + side) > 4.5; // het verre schot is de rand: eerst tegen de wand
    const xd = rand ? x8 : x8 + side; // het schot waarop de bal gaat wiebelen
    const tsd = rand ? side : -side; // kant van het doelbakje, gezien vanaf dat schot
    const xc = xd + 0.5 * tsd;
    const off = klem(d.g - k, -0.5, 0.5);
    const xEind = xc + off * 0.52;

    const segs = [];
    const boog = (x0, y0, x1, y1, T, v, j, hit) => segs.push({ k: 0, T, v, j, x0, y0, vx: (x1 - x0) / T, vy: (y1 - y0 + 0.5 * G * T * T) / T, hit });
    const pinHit = (r) => ({ x: PX[r], y: RIJ0 - r * RH, nx: Math.sin(TH[r]), ny: Math.cos(TH[r]), s: 1, soort: 'pin', r });
    // 0: rust in de buis
    segs.push({ k: 3, T: 1, v: 1, j: 0, x0: START[0], y0: START[1], vx: 0, vy: 0, hit: null, voor: true });
    // 1: de val naar de eerste pin
    const dy0 = START[1] - B[0][1];
    boog(START[0], START[1], B[0][0], B[0][1], Math.sqrt((2 * dy0) / G), 1, 0, null);
    const tempo = [1, 1, 1, 0.96, 0.88, 0.78, 0.67, 0.57];
    for (let r = 0; r < 8; r++) boog(B[r][0], B[r][1], B[r + 1][0], B[r + 1][1], 0.48 + 0.06 * rnd(), tempo[r], r + 1, pinHit(r));
    const a0 = -tsd * 0.1;
    const tipC = [xd + RTB * Math.sin(a0), TIP + RTB * Math.cos(a0)];
    if (!rand) {
      boog(B[8][0], B[8][1], tipC[0], tipC[1], 0.5, 0.47, 9, pinHit(8));
    } else {
      const W = [side * (5 - RB), B[8][1] - 0.6];
      boog(B[8][0], B[8][1], W[0], W[1], 0.33, 0.5, 9, pinHit(8));
      boog(W[0], W[1], tipC[0], tipC[1], 0.2, 0.45, 9, { x: side * 5, y: W[1], nx: -side, ny: 0, s: 0.9, soort: 'wand', r: 7 });
    }
    // het wiebelen op het schot
    segs.push({ k: 1, T: 1.0, v: 0.4, j: 9, x0: tipC[0], y0: tipC[1], vx: 0, vy: 0, xd, tsd, hit: { x: xd, y: TIP, nx: Math.sin(a0), ny: Math.cos(a0), s: 0.8, soort: 'tip', r: 8 } });
    const aU = tsd * WIP[WIP.length - 1];
    const U = [xd + RTB * Math.sin(aU), TIP + RTB * Math.cos(aU)];
    const xLand = klem(xc + tsd * 0.02 + 0.3 * (xEind - xc), xc - 0.25, xc + 0.25);
    const yR = VLOER + RB;
    boog(U[0], U[1], xLand, yR, Math.sqrt((2 * (U[1] - yR)) / G), 0.55, 9, null);
    // tot hier loopt de tijd met het tempo; de landing valt precies op E
    let S = 0;
    for (let i = 1; i < segs.length; i++) S += segs[i].T / segs[i].v;
    const sigma = (E - tR) / S;
    // stuiters en uitrollen (gewone snelheid)
    const vHit = { x: xLand, y: VLOER, nx: 0, ny: 1, s: 1, soort: 'vloer', r: 9 };
    let x = xLand;
    const hoog = [0.2, 0.065, 0.018];
    const sterk = [1, 0.45, 0.18];
    const deel = [0.55, 0.6, 0.7];
    for (let i = 0; i < 3; i++) {
      const T = 2 * Math.sqrt((2 * hoog[i]) / G);
      const x2 = x + deel[i] * (xEind - x);
      boog(x, yR, x2, yR, T, 1, 9, i === 0 ? vHit : { x, y: VLOER, nx: 0, ny: 1, s: sterk[i], soort: 'stuit', r: 9 });
      segs[segs.length - 1].na = true;
      x = x2;
    }
    segs.push({ k: 2, T: 0.4, v: 1, j: 9, x0: x, y0: yR, vx: xEind - x, vy: 0, hit: { x, y: VLOER, nx: 0, ny: 1, s: 0.07, soort: 'stuit', r: 9 }, na: true });
    segs.push({ k: 3, T: 1, v: 1, j: 9, x0: xEind, y0: yR, vx: 0, vy: 0, hit: null, na: true });
    // echte tijden en draaiing
    let t = tR;
    let spin = 0;
    segs[0].t0 = -1e9;
    segs[0].t1 = tR;
    segs[0].spin0 = 0;
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      s.t0 = t;
      s.dur = s.na ? s.T : (sigma * s.T) / s.v;
      if (s.k === 3) s.dur = 1e9;
      s.t1 = t + s.dur;
      s.spin0 = spin;
      let x1;
      if (s.k === 0 || s.k === 2) x1 = s.x0 + s.vx * s.T;
      else if (s.k === 1) x1 = U[0];
      else x1 = s.x0;
      spin -= (x1 - s.x0) / RB;
      t = s.t1;
    }
    const hits = [];
    for (const s of segs) if (s.hit) hits.push(Object.assign({ t: s.t0 }, s.hit));
    // momenten voor het contactblad en de geluiden
    const iWip = segs.findIndex((s) => s.k === 1);
    return { tR, E, k, dec, side, PX, B, xd, tsd, xc, xEind, xLand, rand, segs, hits, sigma, iWip, tWip: [segs[iWip].t0, segs[iWip].t1] };
  }

  // Waar is de bal op tijd t? Schrijft in `u` (geen nieuwe objecten).
  function balOp(pad, t, u) {
    const S = pad.segs;
    let lo = 0;
    let hi = S.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (S[m].t0 <= t) lo = m;
      else hi = m - 1;
    }
    const s = S[lo];
    const f = s.k === 3 ? 0 : klem((t - s.t0) / s.dur, 0, 1);
    const tau = f * s.T;
    const schaal = s.k === 3 ? 0 : s.T / s.dur; // bordtijd per echte seconde
    u.seg = lo;
    u.j = s.j;
    if (s.k === 0) {
      u.x = s.x0 + s.vx * tau;
      u.y = s.y0 + s.vy * tau - 0.5 * G * tau * tau;
      u.vx = s.vx * schaal;
      u.vy = (s.vy - G * tau) * schaal;
    } else if (s.k === 1) {
      const a = s.tsd * cr(WIP, f);
      const lift = 0.018 * Math.abs(Math.sin(f * Math.PI * 5)) * (1 - f);
      u.x = s.xd + RTB * Math.sin(a);
      u.y = TIP + RTB * Math.cos(a) + lift;
      u.vx = 0;
      u.vy = 0;
    } else if (s.k === 2) {
      const e = f * f * (3 - 2 * f);
      u.x = s.x0 + s.vx * e;
      u.y = s.y0;
      u.vx = 0;
      u.vy = 0;
    } else {
      u.x = s.x0;
      u.y = s.y0;
      u.vx = 0;
      u.vy = 0;
    }
    u.spin = s.spin0 - (u.x - s.x0) / RB;
    // indeuken bij een klap, in de richting van de normaal
    if (s.hit) {
      u.knijp = 0.2 * s.hit.s * Math.exp(-tau / 0.035);
      u.nx = s.hit.nx;
      u.ny = s.hit.ny;
    } else {
      u.knijp = 0;
      u.nx = 0;
      u.ny = 1;
    }
    return u;
  }

  // ───────────────────────── Shaders ─────────────────────────
  const FS_BORD = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake;
uniform float uZoom, uFoc, uTime, uBoot, uRust, uAlpha, uKw, uSpanning, uBalFl;
uniform vec3 uCP, uCR, uCU, uCF;
uniform vec4 uBal, uKnijp, uVak, uKlim, uExtra;
uniform vec4 uHit[4];
uniform vec4 uFlits[3];
uniform vec3 uKl;
uniform sampler2D uAtlas;
${GEMEEN}
const float RIJ0 = 3.9, RH = .87, RP = .085, RB = .2, ZP = .2, TIP = -3.72, VLOER = -4.95;
const vec3 MAG = vec3(1., .1, .52), CYA = vec3(.1, .7, 1.), PIN = vec3(.6, .76, 1.);
const vec3 KEY = vec3(-.36, .55, .75);
float sdKader(vec2 q, vec2 h, float r){ vec2 a = abs(q) - h + r; return length(max(a, 0.)) + min(max(a.x, a.y), 0.) - r; }
float sdLijn(vec2 q, vec2 a, vec2 b){ vec2 pa = q - a, ba = b - a; float k = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * k); }
float aanzet(float id, float t0){
  float b = uBoot;
  if (b >= t0 + .12) return 1.;
  if (b <= t0) return 0.;
  if (uRust > .5) return smoothstep(t0, t0 + .12, b);
  return step(.42, h11(floor(uTime * 24.) * 1.7 + id * 13.1)) * (.6 + .4 * h11(id + floor(uTime * 40.)));
}
vec3 vakKleur(float k){
  float x = (k - 1.) / 9.;
  vec3 c = mix(vec3(1., .09, .05), vec3(1., .4, .04), smoothstep(0., .3, x));
  c = mix(c, vec3(1., .75, .12), smoothstep(.3, .52, x));
  c = mix(c, vec3(.4, 1., .35), smoothstep(.55, .72, x));
  c = mix(c, vec3(.12, .85, 1.), smoothstep(.75, .88, x));
  c = mix(c, vec3(1., .82, .35), smoothstep(.92, 1., x));
  return c;
}
vec3 omgeving(vec3 r){
  vec3 c = vec3(.012, .012, .03) + vec3(.22, .26, .42) * smoothstep(-.3, 1., r.y) * .25;
  c += MAG * pow(max(-r.x * .9 + r.y * .25, 0.), 3.) * 1.2;
  c += CYA * pow(max(r.x * .9 + r.y * .25, 0.), 3.) * 1.2;
  c += vec3(1., .97, .92) * pow(max(dot(r, KEY), 0.), 80.) * 12.;
  c += vec3(.7, .78, 1.) * pow(max(dot(r, vec3(.42, .62, .66)), 0.), 8.) * .7;
  c += (MAG + CYA) * exp(-r.z * r.z * 50.) * .18;
  return c * mix(1., .25, smoothstep(.05, -.7, r.z));
}
float buis(float s, float aa){ return smoothstep(.028 + aa, .028 - aa, abs(s)); }
vec3 neon(float s, float aa, vec3 k){ float a = abs(s); return mix(k, vec3(1.), .55) * buis(s, aa) * 4.5 + k * (exp(-a * 16.) * 1.1 + exp(-a * 2.4) * .2); }

void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  vec3 d = normalize(uCR * p.x + uCU * p.y + uCF * uFoc);
  vec2 b0 = uCP.xy + d.xy * (-uCP.z / d.z);
  vec2 b1 = uCP.xy + d.xy * ((ZP - uCP.z) / d.z);
  vec2 bw = uCP.xy + d.xy * ((-7. - uCP.z) / d.z);
  vec2 gx = dFdx(b0), gy = dFdy(b0);
  vec2 fwW = fwidth(bw);
  float aa = max(length(gx), length(gy)) * .8 + 1e-4;
  float t = uTime;
  vec2 vc = vec2(0., -.55);
  float aanB = smoothstep(.0, .5, uBoot);

  // ── achterwand: donker indigo, een vaag raster, nevel en het neon dat erop valt ──
  vec3 col = vec3(.005, .004, .014);
  vec2 gw = abs(fract(bw * .5) - .5) / max(fwW * .5, vec2(1e-4));
  float wand = exp(-length(bw * vec2(.05, .045)));
  col += vec3(.12, .07, .3) * (1. - min(min(gw.x, gw.y), 1.)) * .06 * wand;
  float dk = sdKader(bw - vc, vec2(5.8, 7.), 1.);
  col += (MAG * .55 + CYA * .45) * .07 * exp(-max(dk, 0.) * .3) * aanB;
  if (uKw < 1.5) col += vec3(.035, .02, .08) * vn(bw * .14 + vec2(t * .04, -t * .02)) * wand * .6;

  // ── paneel (z = 0) ──
  float sdP = sdKader(b0 - vc, vec2(5.62, 6.92), .8);
  if (sdP < aa) {
    float inP = smoothstep(aa, -aa, sdP);
    vec3 pan = vec3(.011, .010, .026) + vec3(.006, .004, .016) * smoothstep(6., -6., b0.y);
    float band = (b0.x - uCP.x * .55) * .3 + (b0.y - uCP.y * .55) * .16;
    pan += vec3(.05, .055, .09) * exp(-band * band * 3.) * .35;
    vec2 gq = fract(b0 * 4.) - .5;
    pan *= 1. - .35 * smoothstep(.16, .08, length(gq)) * (1. - smoothstep(.03, .07, aa));
    float dIn = sdKader(b0 - vc, vec2(5., 6.3), .3);
    pan += (CYA * .07 + MAG * .03) * exp(min(dIn, 0.) * 1.4) * aanB;
    // de bakjes
    if (b0.y < TIP + .1 && b0.y > VLOER - .05 && abs(b0.x) < 5.) {
      float kb = floor(b0.x) + 6.;
      float isV = step(abs(kb - uVak.y), .5);
      float h = smoothstep(TIP, VLOER, b0.y);
      pan += vakKleur(kb) * (.012 + .03 * h) * smoothstep(.6, .9, uBoot);
      pan += uKl * isV * uVak.z * (.18 + .9 * uVak.w) * (.35 + .65 * h);
    }
    // de cijferplaat
    if (b0.y < -5.08 && b0.y > -6.26 && abs(b0.x) < 5.) {
      float kb = floor(b0.x) + 6.;
      float lx = b0.x - floor(b0.x);
      float ly = (-5.12 - b0.y) / 1.1;
      vec2 sc = vec2(102. / 1024., -112. / (1.1 * 512.));
      vec3 a = textureGrad(uAtlas, vec2(((kb - 1.) + lx) * 102. / 1024., ly * 112. / 512.), gx * sc, gy * sc).rgb;
      float aanD = aanzet(kb + 20., .55 + kb * .025);
      float isV = step(abs(kb - uVak.y), .5) * uVak.z;
      vec3 dkl = mix(vakKleur(kb), mix(uKl, vec3(1.), .2), isV);
      float hel = aanD * (1. - .6 * uVak.z * (1. - isV)) * (1. + isV * (1.2 + 5. * uVak.w));
      pan += vec3(.012, .012, .024) + vec3(.05, .06, .09) * exp(-min(lx, 1. - lx) / (aa + .004)) * .4;
      pan += (mix(dkl, vec3(1.), .5) * a.r * 1.9 + dkl * a.g * .55) * hel;
    }
    // onvoldoende | voldoende
    if (b0.y < -6.36 && b0.y > -6.72 && abs(b0.x) < 3.7) {
      vec2 sc = vec2(1. / 7.2, -40. / (.28 * 512.));
      vec3 a = textureGrad(uAtlas, vec2((b0.x + 3.6) / 7.2, (420. + (-6.4 - b0.y) / .28 * 40.) / 512.), gx * sc, gy * sc).rgb;
      pan += vec3(.7, .75, .9) * (a.r * .55 + a.g * .12) * smoothstep(.7, .9, uBoot);
    }
    float vm = exp(-abs(b0.x) / (aa + .008)) * step(-6.7, b0.y) * step(b0.y, TIP - .05);
    pan += vec3(.35, 1., .55) * vm * .45 * smoothstep(.7, .9, uBoot);
    // schaduw van de bal
    vec2 db = b0 - uBal.xy - vec2(.03, -.07);
    pan *= 1. - .55 * exp(-dot(db, db) / (RB * RB * 1.1));
    // schokgolf over het bord en de lichtzuil
    if (uKlim.w > 0.) { float dw = length(b0 - vec2(uVak.x, VLOER)) - uKlim.z; pan += uKl * exp(-dw * dw * 10.) * uKlim.w * .7; }
    col = mix(col, pan, inP);
  }
  // ── het neonbord met het vak ──
  if (b0.y > 6.25 && b0.y < 7.95 && abs(b0.x) < 3.3) {
    if (b0.y > 6.7) {
      vec2 sc = vec2(1. / 6.26, -180. / (1.1 * 512.));
      vec3 a = textureGrad(uAtlas, vec2((b0.x + 3.13) / 6.26, (170. + (7.85 - b0.y) / 1.1 * 180.) / 512.), gx * sc, gy * sc).rgb;
      col += (mix(MAG, vec3(1.), .55) * a.r * 2.6 + MAG * a.g * .9) * aanzet(40., .28);
    } else {
      vec2 sc = vec2(1. / 5.52, -52. / (.28 * 512.));
      vec3 a = textureGrad(uAtlas, vec2((b0.x + 2.76) / 5.52, (360. + (6.58 - b0.y) / .28 * 52.) / 512.), gx * sc, gy * sc).rgb;
      col += (mix(CYA, vec3(1.), .5) * a.r * 1.5 + CYA * a.g * .45) * aanzet(41., .4);
    }
  }

  // ── pinnen (z = 0,2) ──
  float r = clamp(floor((RIJ0 - b1.y) / RH + .5), 0., 8.);
  float lim = mod(r, 2.) < .5 ? 4. : 4.5;
  float px = clamp(floor(b1.x - .5 * r + .5) + .5 * r, -lim, lim);
  vec2 pc = vec2(px, RIJ0 - r * RH);
  vec2 dv = b1 - pc;
  float dp = length(dv);
  float fl = 0.;
  vec3 fx = vec3(0.);
  for (int i = 0; i < 4; i++) {
    vec4 h = uHit[i];
    if (h.w <= 0.) continue;
    float age = h.z;
    float dd = length(b1 - h.xy);
    float x = (dd - .1 - age * 2.4) / (.03 + age * .1);
    fx += vec3(.55, .82, 1.) * (exp(-x * x) * exp(-age / .15) * 1.3 + exp(-dd * 8.) * exp(-age / .1) * .6) * h.w;
    if (length(h.xy - pc) < .05) fl = max(fl, h.w * exp(-age / .3));
  }
  float pAan = smoothstep(.32 + r * .045, .42 + r * .045, uBoot);
  float adem = .85 + .15 * sin(t * 1.4 - r * .8 + px * .3);
  float gp = 0.;
  if (uKlim.w > 0.) { float dw = length(pc - vec2(uVak.x, VLOER)) - uKlim.z; gp = uKlim.w * exp(-dw * dw * 3.); }
  vec3 pk = PIN * (.6 * adem * pAan) + vec3(.75, .92, 1.) * fl * 5. + uKl * gp * 3.;
  if (uExtra.x > 0.) {
    float a = uExtra.x - (8. - r) * .075 - abs(px - uVak.x) * .025;
    if (a > 0.) pk += hsv(vec3(r * .11 + px * .04 + t * .35, .7, 1.)) * 3.5 * exp(-a / .55);
  }
  float stem = smoothstep(.028 + aa, .028 - aa, length(mix(b0, b1, .5) - pc));
  col = mix(col, vec3(.035, .04, .06) + pk * .08, stem * .9);
  float kop = smoothstep(RP + aa, RP - aa, dp);
  float nz = sqrt(max(1. - dp * dp / (RP * RP), 0.));
  vec3 pn = vec3(dv / RP, nz);
  float spec = pow(max(dot(reflect(d, pn), KEY), 0.), 20.);
  col = mix(col, pk * (.45 + .55 * nz) + vec3(1.) * spec * .9 * pAan + vec3(.03, .035, .05), kop);
  col += pk * (exp(-dp * 18.) * .1 + exp(-dp * 5.) * .018) + fx;

  // ── tussenschotten en vloer ──
  float onS = smoothstep(.6, .8, uBoot);
  if (b1.y < TIP + .12 && b1.y > VLOER - .12 && abs(b1.x) < 5.2) {
    float xd = clamp(floor(b1.x + .5), -4., 4.);
    float isV = abs(xd - uVak.x) < .6 ? uVak.z : 0.;
    float wob = isV * uExtra.w;
    vec2 q = b1 - vec2(wob * (b1.y - VLOER), 0.);
    float sdD = sdLijn(q, vec2(xd, VLOER), vec2(xd, TIP)) - .035;
    vec3 rk = mix(abs(xd) < .5 ? vec3(.45, 1., .6) : vec3(.5, .75, 1.), mix(uKl, vec3(1.), .3), isV);
    col = mix(col, col * .6 + vec3(.03, .045, .07), smoothstep(aa, -aa, sdD) * .7);
    col += rk * exp(-abs(sdD) / (aa + .006)) * (.45 + isV * (.6 + 3. * uVak.w)) * onS;
    float dt = length(q - vec2(xd, TIP));
    col = mix(col, vec3(.75, .85, 1.) * (.5 + 1.5 * pow(max(1. - dt / .05, 0.), 2.)) * onS + vec3(.04), smoothstep(.05 + aa, .05 - aa, dt));
    col += vec3(.5, .75, 1.) * exp(-abs(b1.y - VLOER) / (aa + .006)) * .5 * onS * step(abs(b1.x), 5.);
  }
  // ── lanceerbuis ──
  if (abs(b1.x) < .7 && b1.y > 4.35 && b1.y < 5.9) {
    float wl = abs(abs(b1.x) - .27);
    col += vec3(.5, .75, 1.) * exp(-wl / (aa + .006)) * .5 * step(4.72, b1.y) * onS;
    vec2 gq = vec2(abs(b1.x) - .14 - uKnijp.w * .32, b1.y - 4.69);
    float gate = smoothstep(aa, -aa, sdKader(gq, vec2(.13, .025), .02));
    col = mix(col, vec3(.6, .65, .75) * (.4 + .6 * smoothstep(-.02, .02, gq.y)), gate);
    float rd = abs(length((b1 - vec2(0., 4.62)) * vec2(1., 3.2)) - .42);
    col += CYA * (smoothstep(.03 + aa * 3., 0., rd) * 2.5 + exp(-rd * 9.) * .3) * aanzet(50., .7);
  }
  // ── neonbuizen om het bord ──
  vec2 fq = b1 - vc;
  float seg = floor((atan(fq.y, fq.x * 1.2) / 6.2831853 + .5) * 8.);
  col += neon(sdKader(fq, vec2(5.18, 6.48), .45), aa, CYA) * aanzet(seg, .04 + .3 * h11(seg * 3.7));
  col += neon(sdKader(fq, vec2(5.4, 6.7), .62), aa, MAG) * aanzet(seg + 8., .08 + .3 * h11(seg * 5.1 + 2.));

  // ── lichtzuil uit het bakje ──
  if (uKlim.y > 0.) {
    float cw = .16 + .22 * uKlim.y;
    float cx = (b0.x - uVak.x) / cw;
    float top = VLOER + uKlim.x;
    float cy = smoothstep(top, top - 1.2, b0.y) * step(VLOER - .1, b0.y);
    col += mix(uKl, vec3(1.), .4 + .3 * exp(-cx * cx * 8.)) * exp(-cx * cx) * cy * uKlim.y * 2.2;
  }
  // ── bliksem (speciaal) ──
  if (uExtra.y > 0.) {
    float tf = uRust > .5 ? floor(t * 3.) : floor(t * 18.);
    for (int i = 0; i < 3; i++) {
      vec4 L = uFlits[i];
      vec2 ab = L.zw - L.xy;
      float len = length(ab);
      vec2 dir = ab / len;
      vec2 q = b1 - L.xy;
      float al = dot(q, dir);
      float u = clamp(al / len, 0., 1.);
      float off = ((vn(vec2(u * 7. + float(i) * 13., tf)) - .5) * .5 + (vn(vec2(u * 23., tf + 5.)) - .5) * .18) * sin(3.14159 * u);
      float dd = abs(dot(q, vec2(-dir.y, dir.x)) - off * len * .35);
      col += mix(uKl, vec3(1.), .5) * (exp(-dd / (aa + .008)) * 2.5 + exp(-dd * 10.) * .25) * uExtra.y * step(0., al) * step(al, len);
    }
  }

  // ── de bal ──
  vec2 db1 = b1 - uBal.xy;
  if (dot(db1, db1) < .36) {
    vec3 n3 = vec3(uKnijp.xy, 0.);
    float kk = uKnijp.z;
    float ia = 1. / (1. - kk), ib = 1. / (1. + .5 * kk);
    vec3 oc = uCP - vec3(uBal.xy, RB);
    vec3 o1 = oc * ib + (ia - ib) * dot(oc, n3) * n3;
    vec3 d1 = d * ib + (ia - ib) * dot(d, n3) * n3;
    vec3 cl = o1 - d1 * (dot(o1, d1) / dot(d1, d1));
    float dist = length(cl);
    float cov = smoothstep(RB + aa * 1.2, RB - aa * 1.2, dist);
    if (cov > 0.) {
      vec3 hp = cl - normalize(d1) * sqrt(max(RB * RB - dist * dist, 0.));
      vec3 N = normalize(hp);
      vec3 R = reflect(d, N);
      float fres = .62 + .38 * pow(1. - max(dot(N, -d), 0.), 4.);
      vec3 bk = omgeving(R) * vec3(.9, .93, 1.) * fres;
      vec2 nr2 = rot2(uBal.z) * N.xy;
      bk += mix(CYA, uKl, uVak.z) * exp(-nr2.x * nr2.x / .0025) * smoothstep(-.2, .4, N.z) * 1.4;
      bk += vec3(.6, .85, 1.) * uBalFl * 3.;
      bk = mix(bk, mix(uKl, vec3(1.), .5) * (3. + 5. * uBal.w), uBal.w);
      col = mix(col, bk, cov);
    }
  }
  if (uBal.w > 0.) col += mix(uKl, vec3(1.), .4) * uBal.w * exp(-length(db1) * 3.5) * 1.6;

  // ── overstroming naar het midden, en een eigen vignet ──
  if (uExtra.z > 0.) col += mix(uKl, vec3(1.), .55) * uExtra.z * (2.6 * exp(-dot(p, p) / (.01 + .12 * uExtra.z)) + .4 * uExtra.z * uExtra.z);
  col *= 1. - uSpanning * smoothstep(.22, .95, length(p * vec2(.82, 1.12)));
  o = vec4(max(col, 0.) * uAlpha, 1.);
}`;

  // Het lichtspoor achter de bal: een lint van 16 punten, in de vertex-shader geprojecteerd.
  const VS_SPOOR = `${KOP}
uniform vec3 uCP, uCR, uCU, uCF; uniform float uFoc, uAsp, uZoom, uBreed; uniform vec2 uShake;
uniform vec4 uSp[16];
out vec2 vQ; out float vA;
vec3 cam(vec2 b){ vec3 v = vec3(b, .2) - uCP; return vec3(dot(v, uCR), dot(v, uCU), dot(v, uCF)); }
void main(){
  int i = gl_VertexID >> 1;
  float s = float(gl_VertexID & 1) * 2. - 1.;
  vec3 c0 = cam(uSp[max(i - 1, 0)].xy), c1 = cam(uSp[min(i + 1, 15)].xy), cc = cam(uSp[i].xy);
  vec2 tg = c0.xy / c0.z - c1.xy / c1.z;
  float lt = length(tg);
  tg = lt > 1e-6 ? tg / lt : vec2(1., 0.);
  float u = float(i) / 15.;
  float w = .2 * uFoc / cc.z * uBreed * (1. - u * .85);
  vec2 q = (cc.xy * uFoc / cc.z + vec2(-tg.y, tg.x) * s * w) * uZoom + uShake;
  gl_Position = vec4(q.x * 2. / uAsp, q.y * 2., 0., 1.);
  vQ = vec2(u, s);
  vA = uSp[i].w;
}`;
  const FS_SPOOR = `${KOP}
in vec2 vQ; in float vA; out vec4 o;
uniform vec3 uKleur;
void main(){
  float a = exp(-vQ.y * vQ.y * 3.5) * pow(1. - vQ.x, 1.6) * vA * smoothstep(0., .12, vQ.x);
  float kern = exp(-vQ.y * vQ.y * 18.) * pow(1. - vQ.x, 3.) * vA * smoothstep(0., .12, vQ.x);
  o = vec4(uKleur * a * .9 + vec3(1.) * kern * .8, 1.);
}`;

  /*__MODULE__*/
})();
