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
  vec3 c = mix(vec3(.02, .02, .04), vec3(.55, .62, .85), smoothstep(-.15, .9, r.y));
  c += vec3(.9, .95, 1.) * smoothstep(.02, .0, abs(r.y - .05)) * .35;
  c += MAG * pow(max(-r.x, 0.), 4.) * .6;
  c += CYA * pow(max(r.x, 0.), 4.) * .6;
  c += vec3(1., .97, .92) * pow(max(dot(r, KEY), 0.), 80.) * 12.;
  c += vec3(.7, .78, 1.) * pow(max(dot(r, vec3(.42, .62, .66)), 0.), 8.) * .7;
  c += (MAG + CYA) * exp(-r.z * r.z * 50.) * .18;
  return c * mix(1., .45, smoothstep(.05, -.7, r.z));
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
  col += (MAG * .55 + CYA * .45) * .035 * exp(-max(dk, 0.) * .6) * aanB;
  if (uKw < 1.5) col += vec3(.02, .012, .045) * vn(bw * .1 + vec2(t * .04, -t * .02)) * wand * .5;

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
      pan += vakKleur(kb) * (.015 + .06 * h * h) * smoothstep(.6, .9, uBoot);
      pan += uKl * isV * uVak.z * (.1 + .4 * uVak.w) * (.35 + .65 * h);
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
      vec3 dkl = mix(vakKleur(kb), uKl, isV);
      float hel = aanD * (1. - .6 * uVak.z * (1. - isV)) * (1. + isV * (.5 + 1.2 * uVak.w));
      pan += vec3(.012, .012, .024) + vec3(.05, .06, .09) * exp(-min(lx, 1. - lx) / (aa + .004)) * .4;
      pan += (mix(dkl, vec3(1.), .5 - .25 * isV) * a.r * (1.9 - .5 * isV) + dkl * a.g * (.55 + .15 * isV)) * hel;
    }
    // onvoldoende | voldoende
    if (b0.y < -6.36 && b0.y > -6.72 && abs(b0.x) < 3.7) {
      vec2 sc = vec2(1. / 7.2, -40. / (.28 * 512.));
      vec3 a = textureGrad(uAtlas, vec2((b0.x + 3.6) / 7.2, (420. + (-6.4 - b0.y) / .28 * 40.) / 512.), gx * sc, gy * sc).rgb;
      pan += vec3(.7, .75, .9) * (a.r * .55 + a.g * .12) * smoothstep(.7, .9, uBoot);
    }
    float vm = exp(-abs(b0.x) / (aa + .008)) * step(-6.7, b0.y) * step(b0.y, VLOER - .1);
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
  vec3 pk = PIN * (1. * adem * pAan) + vec3(.75, .92, 1.) * fl * 5. + uKl * gp * 3.;
  if (uExtra.x > 0.) {
    float a = uExtra.x - (8. - r) * .075 - abs(px - uVak.x) * .025;
    if (a > 0.) pk += hsv(vec3(r * .11 + px * .04 + t * .35, .7, 1.)) * 3.5 * exp(-a / .55);
  }
  float stem = smoothstep(.028 + aa, .028 - aa, length(mix(b0, b1, .5) - pc));
  col = mix(col, vec3(.035, .04, .06) + pk * .08, stem * .9);
  float kop = smoothstep(RP + aa, RP - aa, dp);
  float nz = sqrt(max(1. - dp * dp / (RP * RP), 0.));
  vec3 pn = normalize(vec3(dv / max(dp, RP), nz + .05));
  float spec = pow(max(dot(reflect(d, pn), KEY), 0.), 20.);
  col = mix(col, pk * (.45 + .55 * nz) + vec3(1.) * spec * .9 * pAan + vec3(.03, .035, .05), kop);
  col += pk * (exp(-dp * 14.) * .16 + exp(-dp * 4.) * .025) + fx;

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
    col += rk * exp(-abs(sdD) / (aa + .006)) * (.45 + isV * (.6 + 2. * uVak.w)) * onS;
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
    col += mix(uKl, vec3(1.), .3 + .4 * exp(-cx * cx * 8.)) * exp(-cx * cx) * cy * uKlim.y * 1.5;
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
      float fres = .8 + .2 * pow(1. - max(dot(N, -d), 0.), 4.);
      vec3 bk = omgeving(R) * vec3(.9, .93, 1.) * fres * 1.9;
      vec2 nr2 = rot2(uBal.z) * N.xy;
      bk += mix(CYA, uKl, uVak.z) * exp(-nr2.x * nr2.x / .0025) * smoothstep(-.2, .4, N.z) * 1.4;
      bk += vec3(.6, .85, 1.) * uBalFl * 3.;
      bk = mix(bk, mix(uKl, vec3(1.), .5) * (3. + 5. * uBal.w), uBal.w);
      col = mix(col, bk, cov);
    }
  }
  col += vec3(.5, .7, 1.) * exp(-length(db1) * 9.) * .12 * (1. - uBal.w);
  if (uBal.w > 0.) col += mix(uKl, vec3(1.), .4) * uBal.w * exp(-length(db1) * 3.5) * 1.6;

  // ── overstroming naar het midden, en een eigen vignet ──
  if (uExtra.z > 0.) col += mix(uKl, vec3(1.), .55) * uExtra.z * (2.6 * exp(-dot(p, p) / (.008 + .07 * uExtra.z)) + .2 * uExtra.z * uExtra.z);
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

  // ───────────────────────── Camera ─────────────────────────
  // Een kader (xa, xb, ya, yb) in bordruimte dat in beeld moet; elke rand volgt zijn doel met een gedempte veer.
  // Die veren rekenen we één keer uit (60 stappen per seconde); per beeld lezen we alleen de tabel.
  function maakKamera(pad, K0) {
    const dt = 1 / 60;
    const n = Math.ceil((K0 + 1.2) / dt) + 2;
    const tab = { dt, n, r: [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)] };
    const st = [0, 0, 0, 0];
    const vel = [0, 0, 0, 0];
    const doel = [0, 0, 0, 0];
    const u = {};
    const { tR, E, xc, xd } = pad;
    let w = 3;
    function zetDoel(t) {
      if (t < tR) {
        const a = klem(t / (tR + 0.3), 0, 1);
        const e = a * a * (3 - 2 * a);
        doel[0] = -3.4 - 2.35 * e;
        doel[1] = 3.4 + 2.35 * e;
        doel[2] = 4.3 - 11.2 * e;
        doel[3] = 8.1 - 1.9 * e;
        w = 3.2;
      } else if (t < E) {
        balOp(pad, t, u);
        const j = Math.min(9, u.j);
        if (u.seg >= pad.iWip - (pad.rand ? 2 : 1)) {
          doel[0] = Math.min(xd, xc) - 1.25;
          doel[1] = Math.max(xd, xc) + 1.25;
          doel[2] = -6.45;
          doel[3] = TIP + 1.3;
          w = 2.6;
        } else {
          const reik = (9 - j) * 0.5;
          doel[0] = Math.max(-5.75, Math.min(u.x - 1.3, pad.PX[j] - reik - 0.6));
          doel[1] = Math.min(5.75, Math.max(u.x + 1.3, pad.PX[j] + reik + 0.6));
          doel[2] = -6.85;
          doel[3] = u.y + 1.35;
          w = 2.4;
        }
      } else {
        const a = klem((t - E - 0.35) / 0.9, 0, 1);
        doel[0] = xc - 1.1 + 0.55 * a;
        doel[1] = xc + 1.1 - 0.55 * a;
        doel[2] = -6.3 + 0.85 * a;
        doel[3] = -3.7 - 0.35 * a;
        w = 3.4;
      }
    }
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      zetDoel(t);
      if (i === 0) for (let e = 0; e < 4; e++) st[e] = doel[e];
      else {
        const h = dt / 4;
        for (let s = 0; s < 4; s++) {
          for (let e = 0; e < 4; e++) {
            vel[e] += (w * w * (doel[e] - st[e]) - 2 * w * vel[e]) * h;
            st[e] += vel[e] * h;
          }
        }
      }
      for (let e = 0; e < 4; e++) tab.r[e][i] = st[e];
    }
    return tab;
  }

  // ───────────────────────── De opening ─────────────────────────
  SPO.openingen.plinko = {
    naam: 'plinko',
    shaders: {
      bord: { vs: VS_VOL, fs: FS_BORD, teken: 'vol' },
      spoor: { vs: VS_SPOOR, fs: FS_SPOOR, teken: 'strip' },
    },
    _pad: maakPad,

    tijdlijn(d) {
      const pad = maakPad(d);
      const E = pad.E;
      const K0 = E + (d.snel ? 1.0 : 1.4);
      const h = pad.hits;
      const mid = (i) => (pad.segs[i].t0 + pad.segs[i].t1) / 2;
      return {
        E,
        K0,
        staart: 0.5,
        fotos: [0.45, pad.tR - 0.2, mid(4), mid(7), h[8].t + 0.1, pad.tWip[0] + 0.35 * (pad.tWip[1] - pad.tWip[0]), E + 0.08, E + 0.5, K0 - 0.25],
      };
    },

    *art(d, h) {
      const A = h.art;
      const cv = A.nieuw(1024, 512);
      const x = cv.getContext('2d');
      x.fillStyle = '#000';
      x.fillRect(0, 0, 1024, 512);
      // R = scherpe vorm, G = dezelfde vorm vervaagd (de gloed)
      const gloed = (fn, blur) => {
        x.save();
        x.globalCompositeOperation = 'lighter';
        x.fillStyle = x.strokeStyle = '#ff0000';
        fn();
        x.filter = `blur(${blur}px)`;
        x.fillStyle = x.strokeStyle = '#00ff00';
        fn();
        x.restore();
      };
      const spatie = (px) => {
        if ('letterSpacing' in x) x.letterSpacing = px + 'px';
      };
      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      x.font = `800 92px ${A.F_SPORT}`;
      gloed(() => {
        for (let i = 1; i <= 10; i++) x.fillText(String(i), (i - 1) * 102 + 51, 90);
      }, 6);
      yield;
      const vak = d.vak.toUpperCase();
      let fs = 150;
      x.font = `italic 900 ${fs}px ${A.F_SPORT}`;
      while (fs > 50 && x.measureText(vak).width > 930) {
        fs -= 4;
        x.font = `italic 900 ${fs}px ${A.F_SPORT}`;
      }
      gloed(() => x.fillText(vak, 512, 260 + fs * 0.35), 8);
      yield;
      let sub = `${d.onder.toUpperCase()}  ·  WEGING ${d.weging}×`;
      let fs2 = 36;
      spatie(3);
      x.font = `800 ${fs2}px ${A.F_SPORT}`;
      while (fs2 > 18 && x.measureText(sub).width > 960) {
        fs2 -= 2;
        x.font = `800 ${fs2}px ${A.F_SPORT}`;
      }
      gloed(() => x.fillText(sub, 512, 386 + fs2 * 0.36), 4);
      x.font = `800 26px ${A.F_SPORT}`;
      spatie(5);
      gloed(() => {
        x.textAlign = 'right';
        x.fillText('ONVOLDOENDE', 488, 449);
        x.textAlign = 'left';
        x.fillText('VOLDOENDE', 536, 449);
        x.beginPath();
        x.moveTo(170, 440); x.lineTo(184, 432); x.lineTo(184, 448); x.closePath();
        x.moveTo(854, 440); x.lineTo(840, 432); x.lineTo(840, 448); x.closePath();
        x.fill();
      }, 3);
      spatie(0);
      return { atlas: cv };
    },

    maak(c) {
      const { d, tl, mix } = c;
      const pad = maakPad(d);
      const { E, tR, xc, tier } = Object.assign({ tier: c.tier }, pad);
      const K0 = tl.K0;
      const snel = !!d.snel;
      const kam = maakKamera(pad, K0);
      const pb = c.prog('bord');
      const ps = c.prog('spoor');
      const atlas = c.tekstuur(c.art.atlas, { mip: true });
      const gl = c.gl;
      const NEUTRAAL = [0.6, 0.78, 1];
      const ui = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, knijp: 0, nx: 0, ny: 1, seg: 0, j: 0 };
      const us = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, knijp: 0, nx: 0, ny: 1, seg: 0, j: 0 };
      const CP = [0, 0, 0], CR = [1, 0, 0], CU = [0, 1, 0], CF = [0, 0, -1];
      const scr = [0, 0];
      const hitArr = new Float32Array(16);
      const spArr = new Float32Array(64);
      const flArr = new Float32Array(12);
      const hits = pad.hits;
      const iLand = hits.findIndex((h) => h.soort === 'vloer');

      // ── camera per beeld ──
      function kamera(t, tilt, asp) {
        const f = klem(t / kam.dt, 0, kam.n - 1.001);
        const i = f | 0;
        const a = f - i;
        const R = kam.r;
        const xa = R[0][i] + (R[0][i + 1] - R[0][i]) * a;
        const xb = R[1][i] + (R[1][i + 1] - R[1][i]) * a;
        const ya = R[2][i] + (R[2][i + 1] - R[2][i]) * a;
        const yb = R[3][i] + (R[3][i + 1] - R[3][i]) * a;
        const phi = 0.14 + 0.22 * c.sm(t, 0, tR + 0.5) + 0.08 * c.sm(t, tR + 2, E) - 0.12 * c.sm(t, E, K0) + 0.04 * tilt[1];
        const psi = 0.025 * Math.sin(t * 0.37) + 0.05 * tilt[0];
        const rol = 0.008 * Math.sin(t * 0.51);
        const hb = yb - ya;
        const hv = Math.max(hb * Math.cos(phi) * 1.06, ((xb - xa) / asp) * 1.12);
        const D = hv * FOC;
        const half = (hv * asp) / 2;
        const vrij = c.sm(t, E - 0.2, E + 0.6);
        const tx = mix((half >= 5.75 ? 0 : klem((xa + xb) / 2, -5.75 + half, 5.75 - half)), (xa + xb) / 2, vrij);
        const ty = (ya + yb) / 2 - hb * 0.05 * Math.sin(phi);
        const cp = Math.cos(phi), sp = Math.sin(phi), cs = Math.cos(psi), ss = Math.sin(psi);
        const wx = ss * cp, wy = -sp, wz = cs * cp;
        CF[0] = -wx; CF[1] = -wy; CF[2] = -wz;
        let rx = -CF[2], rz = CF[0];
        const rl = Math.hypot(rx, rz);
        rx /= rl; rz /= rl;
        // U = R × F
        const ux = 0 * CF[2] - rz * CF[1];
        const uy = rz * CF[0] - rx * CF[2];
        const uz = rx * CF[1] - 0 * CF[0];
        const cr2 = Math.cos(rol), sr2 = Math.sin(rol);
        CR[0] = rx * cr2 + ux * sr2; CR[1] = uy * sr2; CR[2] = rz * cr2 + uz * sr2;
        CU[0] = ux * cr2 - rx * sr2; CU[1] = uy * cr2; CU[2] = uz * cr2 - rz * sr2;
        CP[0] = tx + D * wx; CP[1] = ty + D * wy; CP[2] = D * wz;
      }
      // bordpunt → p-ruimte (zonder schudden)
      function scherm(x, y, z) {
        const vx = x - CP[0], vy = y - CP[1], vz = z - CP[2];
        const zc = vx * CF[0] + vy * CF[1] + vz * CF[2];
        scr[0] = ((vx * CR[0] + vy * CR[1] + vz * CR[2]) * FOC) / zc;
        scr[1] = ((vx * CU[0] + vy * CU[1] + vz * CU[2]) * FOC) / zc;
        return scr;
      }

      // ── geluid en klappen ──
      const L = c.L;
      for (const h of hits) {
        const voor = h.t < E - 0.01;
        if (h.soort === 'pin') {
          const rate = Math.min(2, 0.7 * Math.pow(2, PENTA[h.r] / 12));
          c.at(h.t, () => c.audio.speel('plinko-tok', { gain: 0.6 + 0.04 * h.r, rate, pan: klem(h.x / 6, -0.7, 0.7) }));
          c.schok(h.t, (0.0035 + 0.0006 * h.r) / L.schud, 0.08);
        } else if (h.soort === 'wand' || h.soort === 'tip') {
          c.at(h.t, () => c.audio.speel('plinko-tok', { gain: 0.9, rate: h.soort === 'tip' ? 1.0 : 0.85, pan: klem(h.x / 6, -0.7, 0.7) }));
          c.schok(h.t, 0.006 / L.schud, 0.1);
        } else if (h.soort === 'stuit') {
          c.at(h.t, () => c.audio.speel('plinko-tok', { gain: 0.5 * h.s, rate: 1.3 }));
        }
        if (voor && h.soort === 'tip') {
          const [w0, w1] = pad.tWip;
          c.at(w0 + 0.25 * (w1 - w0), () => c.audio.hartslag(0.5));
          c.at(w0 + 0.6 * (w1 - w0), () => c.audio.hartslag(0.65));
        }
      }
      c.at(0.25, () => c.audio.whoosh(0.35));
      for (let i = 0; i < 3; i++) c.at(0.12 + i * 0.22 * (snel ? 0.6 : 1), () => c.audio.speel('klik', { gain: 0.2, rate: 0.6 + 0.15 * i }));
      c.at(tR - 0.06, () => {
        c.audio.speel('plinko-tok', { gain: 0.5, rate: 0.6 });
        c.audio.zwiep(0.3, 1.5);
      });
      const tRiser = hits[6].t;
      c.at(tRiser, () => c.audio.riser(E - tRiser, 0.75));
      c.at(E, () => {
        c.audio.speel('plinko-vak', { gain: 1 });
        c.audio.boem(0.5 + 0.5 * c.I);
        c.trillen(tier >= 3 ? [40, 30, 90] : [30, 20, 60]);
      });
      c.at(E + 0.25, () => c.audio.speel('plinko-bel', { gain: 0.9, rate: [0.84, 1, 1.12, 1.26, 1.5][tier], galmen: 0.3 }));
      if (tier === 2) for (let i = 0; i < 3; i++) c.at(E + 0.45 + i * 0.13, () => c.audio.speel('plinko-bel', { gain: 0.25, rate: 1.7 + i * 0.1 }));
      if (tier === 4) for (let j = 0; j < 9; j++) c.at(E + 0.3 + j * 0.075, () => c.audio.speel('plinko-tok', { gain: 0.5, rate: Math.min(2, 0.9 * Math.pow(2, PENTA[j] / 12)) }));
      c.at(E + (snel ? 0.45 : 0.7), () => c.audio.whoosh(0.55));

      // ── klap bij de landing ──
      const T = [
        { n: 140, sp: 0.8, golf: 0.5, gr: 4.5, zuil: 0.7, flits: 0.3 },
        { n: 320, sp: 1.2, golf: 0.85, gr: 9, zuil: 1, flits: 0.45 },
        { n: 520, sp: 1.5, golf: 1.05, gr: 11, zuil: 1.25, flits: 0.6 },
        { n: 700, sp: 1.7, golf: 1.2, gr: 12, zuil: 1.45, flits: 0.7 },
        { n: 950, sp: 2, golf: 1.4, gr: 14, zuil: 1.8, flits: 0.85 },
      ][tier];
      c.schok(E, 0.035, 0.25);
      c.flits(E, T.flits * 0.6, 0.03);
      c.flits(E, 0.15 + 0.2 * c.I, 0.15);
      // schaal: hoeveel p-eenheden is één bord-eenheid bij de landing
      kamera(E, [0, 0], c.asp);
      const sc0 = scherm(xc, VLOER, 0)[1];
      const sch = Math.abs(scherm(xc, VLOER + 1, 0)[1] - sc0);
      c.golf(E, 1.3, 0.6 + 0.3 * c.I, klem(sc0, -0.4, 0.4));
      const WIT = [1, 0.97, 0.9];
      const vonken = [];
      // vonken bij elke klap tegen een pin of schot
      for (const h of hits) {
        if (h.soort === 'stuit' || h.t >= E - 0.01) continue;
        kamera(h.t, [0, 0], c.asp);
        const s1 = Math.abs(scherm(h.x, h.y, 0.2)[1] - scherm(h.x, h.y + 1, 0.2)[1]);
        const em = c.e({ mode: 0, t0: h.t, life: 0.5, delay: 0.02, n: h.soort === 'pin' ? 22 : 34, org: [0, 0], angle: Math.atan2(h.ny, h.nx), spread: 2.4, spd: [0.6 * s1, 2.4 * s1], grav: [0, -3 * s1], drag: 2.2, size: [0.0012, 0.003], col1: [0.55, 0.82, 1], col2: [1, 1, 1], seed: 30 + vonken.length });
        vonken.push({ em, h });
      }
      const groot = [];
      const bron = (o, bx, by) => groot.push({ em: c.e(o), bx, by });
      bron({ mode: 0, t0: E, delay: 0.06, life: 1.3, n: T.n, org: [0, 0], angle: Math.PI / 2, spread: tier === 4 ? c.TWEE_PI : 1.8 + 0.3 * tier, spd: [0.25 * sch, T.sp * 1.4 * sch], grav: [0, -1.3 * sch], drag: 1, size: [0.0018, 0.005], col1: c.kl, col2: tier === 0 ? [0.75, 0.45, 0.25] : WIT, regen: tier === 4 ? 1 : 0, seed: 7 }, xc, VLOER + 0.3);
      if (tier === 2) bron({ mode: 5, t0: E + 0.05, life: 1.8, n: 70, org: [0, 0], angle: Math.PI / 2, spread: 1.8, spd: [0.5 * sch, 1.4 * sch], grav: [0, -1.8 * sch], drag: 0.5, size: [0.008, 0.016], col1: [1, 0.78, 0.2], col2: [1, 0.95, 0.55], blend: 'alpha', seed: 8 }, xc, VLOER + 0.4);
      if (tier === 3) bron({ mode: 0, t0: E + 0.05, delay: 0.5, life: 0.4, n: 260, org: [0, 0], angle: Math.PI / 2, spread: 3, spd: [0.6 * sch, 3 * sch], grav: [0, 0], drag: 3, size: [0.0012, 0.003], col1: [0.3, 0.9, 1], col2: [0.6, 0.4, 1], seed: 9 }, xc, VLOER + 0.5);
      if (tier === 4) {
        const prng2 = prng(91);
        for (let i = 0; i < 7; i++) bron({ mode: 0, t0: E + 0.2 + i * 0.13, life: 1.1, n: 170, org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.2 * sch, 1.2 * sch], grav: [0, -0.6 * sch], drag: 1.4, size: [0.0018, 0.0045], col1: c.kl, col2: WIT, regen: 1, seed: 40 + i }, xc + (prng2() - 0.5) * 5, VLOER + 1.5 + prng2() * 4);
      }
      // bliksem van het bakje naar pinnen erboven
      for (let i = 0; i < 3; i++) {
        flArr[i * 4] = xc + (i - 1) * 0.15;
        flArr[i * 4 + 1] = VLOER + 0.4;
        flArr[i * 4 + 2] = Math.round(xc + (i - 1) * 1.5 - 0.5) + 0.5 * ((8 - i) % 2 ? 0 : 0);
        flArr[i * 4 + 3] = RIJ0 - (8 - i) * RH;
      }
      for (let i = 0; i < 3; i++) {
        const r = 8 - i;
        flArr[i * 4 + 2] = klem(Math.round(xc + (i - 1) * 1.6 - 0.5 * r) + 0.5 * r, -4, 4);
      }

      function tekenBord(t, alpha, wachten) {
        const onth = !wachten && t >= E;
        pb.gebruik();
        c.basis(pb);
        pb.f3('uCP', CP[0], CP[1], CP[2]);
        pb.f3('uCR', CR[0], CR[1], CR[2]);
        pb.f3('uCU', CU[0], CU[1], CU[2]);
        pb.f3('uCF', CF[0], CF[1], CF[2]);
        pb.f1('uFoc', FOC);
        pb.f1('uTime', t);
        pb.f1('uBoot', wachten ? 1 : c.ramp(t, 0.02, tR * 0.9));
        pb.f1('uRust', c.reduceer ? 1 : 0);
        pb.f1('uAlpha', alpha);
        pb.f1('uKw', c.motor.kwaliteit);
        pb.v3('uKl', onth ? c.kl : NEUTRAAL);
        pb.tex('uAtlas', 0, atlas);
        const q = wachten ? 0 : t - E;
        // balletje
        const licht = onth ? c.sm(t, E + 0.55, K0 - 0.15) : 0;
        pb.f4('uBal', ui.x, ui.y, ui.spin, licht);
        pb.f4('uKnijp', ui.nx, ui.ny, ui.knijp, wachten ? 0 : c.ramp(t, tR - 0.1, tR));
        let fl = 0;
        hitArr.fill(0);
        let n = 0;
        for (let i = hits.length - 1; i >= 0 && n < 4 && !wachten; i--) {
          const age = t - hits[i].t;
          if (age < 0 || age > 1.2) continue;
          hitArr[n * 4] = hits[i].x;
          hitArr[n * 4 + 1] = hits[i].y;
          hitArr[n * 4 + 2] = age;
          hitArr[n * 4 + 3] = hits[i].s;
          fl = Math.max(fl, hits[i].s * Math.exp(-age / 0.12));
          n++;
        }
        pb.v4s('uHit[0]', hitArr);
        pb.f1('uBalFl', fl * 0.3);
        pb.f4('uVak', xc, pad.k, onth ? 1 : 0, onth ? Math.exp(-q / 0.35) : 0);
        pb.f4('uKlim', onth ? 9 * c.sm(t, E + 0.25, K0) : 0, onth ? T.zuil * c.sm(t, E + 0.2, E + 0.9) * (1 - 0.7 * c.sm(t, K0 - 0.7, K0)) : 0, onth ? q * 9 : 0, onth ? T.golf * Math.exp(-q / 0.9) * (q < T.gr / 9 ? 1 : 0) : 0);
        const wiebel = tier === 0 && onth ? 0.06 * Math.sin(q * 26) * Math.exp(-q / 0.35) * (c.reduceer ? 0.3 : 1) : 0;
        pb.f4('uExtra', tier === 4 && onth ? q - 0.1 : -1, tier === 3 && onth ? c.sm(q, 0.05, 0.2) * (1 - c.sm(t, K0 - 0.4, K0)) : 0, onth ? Math.pow(c.ramp(t, E + 0.8, K0), 2) : 0, wiebel);
        pb.v4s('uFlits[0]', flArr);
        pb.f1('uSpanning', wachten ? 0.3 : 0.3 + 0.35 * c.sm(t, hits[4].t, E) - 0.2 * (onth ? c.sm(q, 0, 0.3) : 0));
        c.motor.mengen('optel');
        c.motor.volledig();
      }

      function tekenSpoor(t) {
        let som = 0;
        for (let j = 0; j < 16; j++) {
          const tj = t - j * (snel ? 0.013 : 0.017);
          balOp(pad, tj, us);
          const v = Math.hypot(us.vx, us.vy);
          const a = tj < tR ? 0 : klem(v * 0.3 - 0.15, 0, 1);
          spArr[j * 4] = us.x;
          spArr[j * 4 + 1] = us.y;
          spArr[j * 4 + 2] = 0;
          spArr[j * 4 + 3] = a;
          som += a;
        }
        if (som < 0.05) return;
        ps.gebruik();
        ps.f3('uCP', CP[0], CP[1], CP[2]);
        ps.f3('uCR', CR[0], CR[1], CR[2]);
        ps.f3('uCU', CU[0], CU[1], CU[2]);
        ps.f3('uCF', CF[0], CF[1], CF[2]);
        ps.f1('uFoc', FOC);
        ps.f1('uAsp', c.asp);
        ps.f1('uZoom', c.cam.zoom);
        ps.f2('uShake', c.cam.x, c.cam.y);
        ps.f1('uBreed', 0.9);
        ps.v4s('uSp[0]', spArr);
        ps.f3('uKleur', 0.45, 0.75, 1);
        c.motor.mengen('optel');
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 32);
      }

      return {
        teken(t, dt, inv) {
          const asp = c.asp;
          balOp(pad, t, ui);
          kamera(t, inv.tilt, asp);
          const alpha = 1 - c.sm(t, K0 - 0.02, K0 + 0.45);
          tekenBord(t, alpha, false);
          if (t > tR && t < E + 0.8) tekenSpoor(t);
          // vonken: de oorsprong schuift mee met de camera
          for (let i = 0; i < vonken.length; i++) {
            const v = vonken[i];
            if (t < v.h.t - 0.01 || t > v.h.t + 0.6) continue;
            scherm(v.h.x + v.h.nx * RP, v.h.y + v.h.ny * RP, 0.2);
            v.em.org[0] = scr[0];
            v.em.org[1] = scr[1];
            c.zend(t, v.em);
          }
          if (t >= E) {
            const q = t - E;
            for (let i = 0; i < groot.length; i++) {
              const g = groot[i];
              if (t < g.em.t0 - 0.01 || t > g.em.t0 + g.em.delay + g.em.life + 0.1) continue;
              scherm(g.bx, g.by, 0.2);
              g.em.org[0] = scr[0];
              g.em.org[1] = scr[1];
              c.zend(t, g.em);
            }
            scherm(xc, VLOER + 0.3, 0.2);
            const b = Math.exp(-q / (0.3 + 0.25 * c.I));
            c.licht(t, scr[0], scr[1], 0.1 * b, 0.03, (0.3 + 0.5 * c.I) * Math.exp(-q / 0.5), (0.25 + 0.45 * c.I) * Math.exp(-q / 0.8), t * 0.3);
            const s = c.sm(t, E + 0.15, E + 0.6) * (1 - c.sm(t, K0, K0 + 0.4));
            if (s > 0.01) c.stralen(t, s * alpha, 0.25 + 0.5 * c.I, 0.12 + 0.3 * c.sm(t, E + 0.5, K0), 0.15, scr[0], scr[1], t * 0.25, 0);
          }
          // nabewerking: vóór de landing neutraal (geen tier-afhankelijke verzadiging, bloom, kleurfouten of vignetkleur)
          const P = c.post;
          if (t < E) {
            P.sat = 1 / L.sat;
            P.bloom = 0.6 / (L.bloom * 0.9 * (0.9 + 0.2 * c.I));
            P.ca = 0.0011 / Math.max(1e-4, L.ca * 0.5 * (0.5 + 1.5 * c.I));
            P.vig = 0.12 / L.vig;
            P.streak = -0.12;
            P.zoom = 1 + 0.03 * c.sm(t, hits[6].t, E);
          } else {
            const q = t - E;
            P.rad = 0.12 * Math.exp(-q / 0.2) + 0.25 * c.sm(t, K0 - 0.5, K0);
            P.zoom = 1.03 + 0.04 * Math.exp(-q / 0.15) + 0.06 * c.sm(t, E + 0.6, K0);
            P.streak = 0.4 * Math.exp(-q / 0.5);
            P.bloom = 0.8;
          }
        },
        wacht(t) {
          balOp(pad, 0, ui);
          kamera(tR + 0.4, [0, 0], c.asp);
          tekenBord(t, 0.8, true);
        },
        schud(t) {
          const [w0, w1] = pad.tWip;
          return t > w0 && t < w1 ? 0.0015 : 0;
        },
        sprong(t) {
          if (t < E - 0.8) return { doel: E - 0.45, riser: true };
          return undefined;
        },
      };
    },
  };
})();
