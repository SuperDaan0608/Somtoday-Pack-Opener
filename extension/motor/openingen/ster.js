/*
 * Somtoday Pack Opener — openingen/ster.js
 * Wensster. Een stille nachtlucht boven een bergmeer: de Melkweg, flonkerende sterren, wat poollicht en mist op
 * het water. Dan valt er een ster, en zijn kleur verraadt meteen wat hij brengt: een klein oranje gloeiend
 * kooltje (brons), een felle wit-cyaan ster (zilver), goud met twee begeleiders (goud), elektrisch violet-cyaan
 * plasma met drie begeleiders (speciaal) of een regenboog-regen van acht sterren die op één punt samenkomen
 * (icoon). Hij valt vlak voor de overkant in het meer: een flits, ringen over het water, een lichtzuil die het
 * beeld vult, en uit dat licht komt de kaart.
 *
 * Ruimte: de lucht-shader rekent in ‘wereld’-coördinaten: x = p.x (plus wat parallax), y = p.y + camerahoogte.
 * De horizon ligt op wereld-y Y_H. De Melkweg en het poollicht worden één keer in maak() in een tekstuur gebakken;
 * sterren, bergen, meer en de vallende sterren worden per beeld uitgerekend.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  const { KOP, GEMEEN, VS_VOL } = SPO.shaders;

  const Y_H = -0.1; // de horizon (wereld-y)
  const DZ_I = 0.03; // de inslag ligt zoveel onder de horizon (op het water, vlak voor de overkant)
  const HEMEL = [-1.6, -0.06, 1.6, 1.3]; // gebakken gebied: x0, v0, x1, v1 (v = hoogte boven de horizon)
  const HB = 1792; // grootte van de gebakken lucht
  const HH = 768;
  const TW = 1600; // tekstcanvas
  const TH = 470;

  // ───────────────────────── De lucht bakken (één keer) ─────────────────────────
  // rgb = Melkweg en nevel (wortel-gecodeerd, zodat de donkere tinten in 8 bit niet in banden uiteenvallen), a = poollicht.
  const FS_BAK = `${KOP}
out vec4 o;
uniform vec2 uRes;
uniform vec4 uRect;
${GEMEEN}
float fbm6(vec2 p){
  float s = 0., a = .5;
  for (int i = 0; i < 6; i++) { s += a * vn(p); p = rot2(.5) * p * 2.03 + vec2(13.1, 7.7); a *= .5; }
  return s;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 w = mix(uRect.xy, uRect.zw, uv);
  // de Melkweg: een brede band die links uit de bergen opstijgt en rechtsboven het beeld uit gaat
  vec2 A = vec2(-1.05, -.06);
  vec2 dir = normalize(vec2(2., 1.05));
  vec2 nr = vec2(-dir.y, dir.x);
  vec2 r = w - A;
  float al = dot(r, dir);
  float ac = dot(r, nr);
  ac += (fbm(vec2(al * 1.2, 3.1)) - .5) * .14;
  float br = .15 + .08 * fbm(vec2(al * 1.7, 9.2));
  float band = exp(-ac * ac / (br * br));
  float kern = exp(-ac * ac / (br * br * .2));
  vec2 q = vec2(al * 3.4, ac * 8.);
  vec2 wq = vec2(fbm(q * .55 + 1.7), fbm(q * .55 + 8.3));
  float wolk = fbm6(q + 2.6 * wq);
  float knoop = pow(wolk, 2.2) * 2.3;
  float mw = band * (.14 + knoop) + kern * .6 * wolk * wolk + exp(-ac * ac / (br * br * 4.)) * .05;
  float stof = fbm6(vec2(al * 6., ac * 24.) + 3.2 * wq);
  float laan = smoothstep(.43, .7, stof) * exp(-pow((ac + .014 * sin(al * 4.)) / (br * .5), 2.));
  mw *= 1. - .88 * laan;
  mw *= smoothstep(-.02, .16, w.y);
  vec3 c = mix(vec3(.38, .5, 1.), vec3(.92, .9, .98), clamp(kern * wolk * 1.5, 0., 1.)) * mw * .32;
  // een zweem van roze nevel in de kern en zwakke nevel door de hele lucht
  c += vec3(.5, .32, .55) * kern * smoothstep(.55, .8, wolk) * .03;
  float nev = fbm(w * vec2(1.8, 2.6) + wq * 1.3);
  c += vec3(.22, .3, .65) * nev * nev * .02;
  // poollicht: gordijnen boven de bergen links
  float x = w.x;
  float basis = .12 + .04 * sin(x * 2.4 + 1.3) + .06 * (fbm(vec2(x * 2.2, 1.)) - .5);
  float h = w.y - basis;
  float st = fbm(vec2(x * 30., 2.));
  st = .3 + 1.2 * st * st;
  float plooi = .5 + .5 * sin(x * 6.5 + fbm(vec2(x * 1.6, 5.)) * 7.);
  float au = smoothstep(-.03, .03, h) * exp(-max(h, 0.) / .2) * st * (.55 + .45 * plooi);
  au *= (1. - smoothstep(-.45, .1, x)) * smoothstep(-1.75, -1.15, x);
  float dit = (h21(gl_FragCoord.xy * 1.13) - .5) / 255.;
  o = vec4(sqrt(max(c, 0.)) + dit, clamp(au, 0., 1.) + dit);
}`;

  // ───────────────────────── Lucht, bergen, meer en de vallende sterren ─────────────────────────
  const FS_LUCHT = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake;
uniform float uZoom, uTime, uCy, uDrift, uYH, uFade, uVig, uQ, uTw, uTier;
uniform sampler2D uHemel;
uniform vec4 uRect;
uniform vec4 uKop[8];
uniform vec4 uKl[8];
uniform vec4 uKl2[8];
uniform vec4 uBx[8];
uniform vec4 uSt[8];
uniform vec2 uPad[56];
uniform int uN;
uniform vec4 uLicht;
uniform vec3 uLichtKl;
uniform vec4 uInslag;
uniform vec3 uInslagKl;
uniform vec4 uZuil, uZuil2;
uniform vec3 uKl2Z;
uniform vec4 uRing;
uniform vec4 uBoom[4];
${GEMEEN}
float px = .001;
float vn1(float x){ float i = floor(x); float f = fract(x); f = f * f * (3. - 2. * f); return mix(h11(i), h11(i + 1.), f); }
// bergen in de verte: scherpe toppen, in het midden lager (daar valt de ster)
float bergVer(float x){
  float n = 1. - abs(vn1(x * 1.3 + 3.) * 2. - 1.);
  float n2 = 1. - abs(vn1(x * 3.1 + 7.) * 2. - 1.);
  float h = .5 * n * n + .25 * n2 * n2 + .14 * vn1(x * 9. + 5.) + .06 * vn1(x * 23. + 2.) + .025 * vn1(x * 61.);
  float flank = .2 + .8 * smoothstep(.08, .85, abs(x + .04));
  return (.012 + .33 * h) * flank;
}
// een nabijere, lagere rug
float bergMid(float x){
  float n = 1. - abs(vn1(x * 2.2 + 11.) * 2. - 1.);
  float h = .55 * n + .3 * vn1(x * 6.3 + 4.) + .15 * vn1(x * 17. + 8.);
  return (.004 + .085 * h) * (.3 + .7 * smoothstep(.12, .9, abs(x - .05)));
}
// bosrand aan de overkant van het meer: heuvels met spitse dennen
float bos(float x){
  float h = .005 + .016 * vn1(x * 2.6 + 9.) + .006 * vn1(x * 8.1 + 2.);
  float cc = x * 62.;
  float id = floor(cc);
  float f = fract(cc) - .5;
  float bh = (.004 + .012 * h11(id * 1.37 + 4.)) * step(.2, h11(id * 3.1 + 1.));
  return h + max(bh * (1. - abs(f) * 2.4), 0.);
}
// één laag sterren: per cel één ster, met helderheid, kleurtemperatuur en flonkering
vec3 sterLaag(vec2 w, float dicht, float zaad, float helder, float maat, float tw){
  vec2 g = w * dicht + zaad;
  vec2 id = floor(g);
  vec2 f = fract(g) - .5;
  vec2 r = h22(id + zaad);
  float h = h21(id * 1.31 + zaad * 3.7);
  float d = length(f - (r - .5) * .64) / dicht;
  float rr = px * maat;
  float m = h * h * h;
  m *= m * h * helder;
  float fl = 1. - tw * uTw * (.5 + .5 * sin(uTime * (1.1 + 4.2 * r.x) + h * 71.));
  float wt = fract(h * 17.3);
  vec3 k = mix(vec3(.62, .74, 1.), vec3(1., .87, .72), wt * wt);
  return k * m * fl * exp(-d * d / (rr * rr));
}
// de vallende sterren: een taps toelopende staart (afstand tot een lijn van 7 punten) en een kop met gloed en kruis
vec3 meteoren(vec2 w){
  vec3 c = vec3(0.);
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    vec4 b = uBx[i];
    if (w.x < b.x || w.x > b.z || w.y < b.y || w.y > b.w) continue;
    vec4 K = uKop[i];
    vec4 A = uKl[i];
    vec3 B = uKl2[i].rgb;
    vec4 S = uSt[i];
    float dm = 1e3;
    float sa = 0.;
    for (int k = 0; k < 6; k++) {
      vec2 a = uPad[i * 7 + k];
      vec2 ba = uPad[i * 7 + k + 1] - a;
      vec2 pa = w - a;
      float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-10), 0., 1.);
      float dd = length(pa - ba * hh);
      if (dd < dm) { dm = dd; sa = (float(k) + hh) / 6.; }
    }
    float bw = S.x * (1. - .85 * sa);
    float bwp = max(bw, px * .8);
    float en = bw / bwp;
    float val = (exp(-dm * dm / (bwp * bwp * .22)) * 1.5 + exp(-dm * dm / (bwp * bwp * 5.)) * .3) * en;
    float af = pow(1. - sa, 1.35) * S.y;
    float glit = .55 + .9 * vn(vec2(sa * 46. - uTime * 7. + S.z * 9., S.z * 5.));
    vec3 tk = A.w > 1.5 ? hsv(vec3(fract(sa * .9 - uTime * .4 + S.z), .8, 1.)) : mix(A.rgb, B, smoothstep(.1, .85, sa));
    c += mix(mix(vec3(1.), tk, .4), tk, smoothstep(0., .2, sa)) * val * af * glit;
    vec2 dk = w - K.xy;
    float r = length(dk);
    float rc = max(K.z, px);
    float kern = exp(-r * r / (rc * rc)) * K.z * K.z / (rc * rc);
    float g1 = exp(-r / (K.z * 2.));
    float g2 = max(1. - r / (K.z * 20.), 0.);
    g2 *= g2;
    vec2 ad = abs(dk);
    float spk = exp(-ad.y / px) * exp(-ad.x / (K.z * 9.)) + exp(-ad.x / px) * exp(-ad.y / (K.z * 6.));
    vec3 hk = A.rgb;
    if (A.w > .5 && A.w < 1.5) {
      // plasma: een knetterende, flakkerende rand van violet en cyaan
      float ang = atan(dk.y, dk.x + 1e-6);
      float kn = vn(vec2(ang * 3.2 + uTime * 13., r / K.z * .7 - uTime * 19.));
      kn = kn * kn * kn * 3.;
      hk = mix(A.rgb, B, clamp(kn, 0., 1.));
      g1 *= .6 + kn;
      g2 *= .7 + .6 * kn;
    } else if (A.w > 1.5) {
      float ang = atan(dk.y, dk.x + 1e-6);
      hk = hsv(vec3(fract(ang / 6.2831853 + uTime * .5 + r / K.z * .04), .72, 1.));
    }
    // ontbranden: een ring van licht in de kleur van de ster die even uitdijt
    float ig = uKl2[i].w;
    float ign = ig < .55 ? (1. - ig / .55) * (1. - ig / .55) : 0.;
    if (ign > 0.) {
      float rr2 = .004 + ig * .16;
      c += hk * exp(-pow((r - rr2) / (.006 + ig * .03), 2.)) * ign * .55;
    }
    c += (vec3(1.) * kern * 6. + hk * (g1 * 1.2 + g2 * .22) + mix(hk, vec3(1.), .5 - .35 * ign) * spk * (.5 + .6 * ign)) * K.w;
  }
  return c;
}
// de stille wereld: lucht, Melkweg, poollicht, sterren, bergen en bos (ook voor de weerspiegeling)
vec3 lucht(vec2 w, float spiegel){
  float v = w.y - uYH;
  float vp = max(v, 0.);
  vec3 col = vec3(.006, .009, .026) + vec3(.055, .088, .16) * exp(-vp / .22) + vec3(.065, .092, .135) * exp(-vp / .04);
  col += vec3(.045, .072, .11) * exp(-vp / .1) * exp(-w.x * w.x * 2.);
  vec2 ws = vec2(w.x + uDrift * .25, v);
  vec4 hm = texture(uHemel, (ws - uRect.xy) / (uRect.zw - uRect.xy));
  vec3 mw = hm.rgb * hm.rgb;
  col += mw;
  float au = hm.a;
  if (uQ < 2.5) au *= .6 + .4 * sin(ws.x * 9. - uTime * .5 + 1.6 * sin(ws.x * 3.3 + uTime * .23));
  col += mix(vec3(.08, .55, .33), vec3(.28, .18, .62), smoothstep(.12, .42, v)) * au * 1.1;
  vec3 st = sterLaag(ws, 95., 1.7, .55, 1.05, .3) + sterLaag(ws, 38., 7.3, 1.15, 1.3, .5);
  if (uQ < 1.5) st += sterLaag(ws, 13.5, 3.1, 2.6, 1.6, .55);
  col += st * (1. + 6. * mw.g) * smoothstep(0., .035, v) * (1. - .4 * spiegel);
  // licht van de vallende ster: de lucht wordt lichter waar hij langs komt
  float rl = length(w - uLicht.xy);
  col += uLichtKl * uLicht.z * (.03 * exp(-rl / .1) + .014 * exp(-rl / .45));
  float ri = length((w - uInslag.xy) * vec2(.5, 1.2));
  float gi = uInslag.z;
  // bergen in de verte (heiig) en een nabijere rug (donkerder)
  float xv = w.x + uDrift * .45;
  float hv = bergVer(xv);
  float mv = smoothstep(-px, px, hv - v);
  float dl = exp(-abs(w.x - uInslag.x) * 2.2);
  if (mv > 0.) {
    float rel = clamp(v / max(hv, .001), 0., 1.);
    vec3 kv = mix(vec3(.066, .09, .145), vec3(.03, .042, .076), sqrt(rel));
    float sneeuw = smoothstep(.55, .9, rel) * (.5 + .5 * vn1(xv * 90.)) * smoothstep(.07, .14, hv);
    kv += vec3(.05, .062, .085) * (sneeuw + smoothstep(hv - .006, hv, v) * .6);
    kv += uLichtKl * uLicht.z * .07 * exp(-rl / .6) * (.5 + .5 * rel);
    kv += uInslagKl * gi * (.06 * dl * dl + .01) * (.2 + .8 * rel) * (1. + 2. * sneeuw) + uInslagKl * gi * .12 * dl * smoothstep(hv - .01, hv, v);
    col = mix(col, kv, mv);
  }
  float hm2 = bergMid(w.x + uDrift * .52);
  float mm = smoothstep(-px, px, hm2 - v);
  if (mm > 0.) {
    float rel = clamp(v / max(hm2, .001), 0., 1.);
    vec3 km = mix(vec3(.034, .046, .078), vec3(.017, .024, .044), rel);
    km += uInslagKl * gi * (.04 * dl * dl + .006) * (.3 + .7 * rel) + uInslagKl * gi * .07 * dl * smoothstep(hm2 - .006, hm2, v);
    col = mix(col, km, mm);
  }
  // bosrand aan de overkant
  float hb = bos(w.x + uDrift * .6);
  float mb = smoothstep(-px, px, hb - v);
  col = mix(col, vec3(.008, .011, .02) + uInslagKl * gi * .03 * dl, mb);
  return col;
}
// een den op de voorgrond (silhouet); b: x, voet-y, hoogte, halve breedte
float den(vec2 q, vec4 b){
  float y = q.y / b.z;
  if (y < 0. || y > 1. || abs(q.x) > b.w * 1.3) return 0.;
  float laag = fract(y * 8.5 + b.x * 7.);
  float hb = b.w * (1. - y) * (.5 + .5 * laag) + b.w * .05;
  hb *= .82 + .36 * vn1(y * 46. + b.x * 31.);
  return 1. - smoothstep(hb - px, hb + px, abs(q.x));
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  px = 1.1 / (uRes.y * uZoom);
  vec2 w = vec2(p.x, p.y + uCy);
  float v = w.y - uYH;
  float xb = w.x + uDrift * .6;
  vec3 col;
  if (v >= 0.) {
    col = lucht(w, 0.) + meteoren(vec2(xb, w.y));
  } else {
    // het meer: de gespiegelde lucht, vervormd door golfjes (perspectivisch), met fresnel
    float dz = -v;
    float Z = .08 / (dz + .0012);
    float X = xb * Z;
    float n1 = vn(vec2(X * 1.3, Z * 2.6 - uTime * .5));
    float n2 = uQ < 2.5 ? vn(vec2(X * 3.4 + 3., Z * 7. + uTime * .7)) : .5;
    float rip = (n1 - .5) + (n2 - .5) * .6;
    float rip2 = (n2 - .5) + (n1 - .5) * .4;
    vec2 dsp = vec2(rip * (.06 * dz + .0008), rip2 * (.3 * dz + .002));
    float rl = 0.;
    vec3 rk = vec3(0.);
    if (uRing.y > 0.) {
      // ringen over het water, in het vlak van het meer (dus perspectivisch platte ellipsen)
      float Zi = .08 / (uYH - uInslag.y + .0012);
      vec2 rel = vec2(X - uInslag.x * Zi, Z - Zi);
      float R = length(rel);
      float dS = mix(1. / Z, .08 / (Z * Z), abs(rel.y) / max(R, 1e-3));
      for (int k = 0; k < 3; k++) {
        float tau = uRing.x - float(k) * .17;
        if (tau <= 0.) continue;
        float Rk = uRing.z * tau * (1. - .1 * float(k));
        float x = (R - Rk) * dS / (.0035 + .006 * tau);
        float g = exp(-x * x) * exp(-tau * 1.1) * (1. - .25 * float(k));
        rl += g;
        if (uTier > 3.5) rk += hsv(vec3(fract(float(k) * .31 + atan(rel.x, rel.y + 1e-4) * .16 + uTime * .2), .75, 1.)) * g;
        dsp.y += x * exp(-x * x) * (.012 * dz + .002) * exp(-tau * .7);
      }
    }
    vec3 refl = lucht(vec2(w.x + dsp.x, uYH + dz + dsp.y), 1.);
    float fres = .38 + .58 * exp(-dz * 6.);
    col = refl * fres + vec3(.0015, .0025, .005);
    col += vec3(.02, .03, .05) * exp(-dz / .003);
    // de vallende sterren: direct (vlak boven het water) en weerspiegeld rond het punt van de inslag
    col += meteoren(vec2(xb, w.y));
    col += meteoren(vec2(xb + dsp.x * 1.5, 2. * uInslag.y - w.y + dsp.y * 2.)) * fres * .7;
    if (uLicht.z > 0.) {
      // een glinsterpad op het water onder de ster
      float bx = xb - uLicht.x;
      float bw = .006 + .16 * dz;
      float gp = exp(-bx * bx / (bw * bw));
      float gl = vn(vec2(X * 2.3, Z * 9. - uTime * 1.4));
      gl = gl * gl;
      gl = gl * gl * 7.;
      col += uLichtKl * uLicht.z * gp * gl * .12 * fres;
    }
    vec3 ringKl = uTier > 3.5 ? mix(rk, vec3(rl), .25) : mix(uInslagKl, vec3(1.), .4) * rl;
    col += ringKl * uRing.y * (.4 + .6 * exp(-abs(xb - uInslag.x) * 2.));
  }
  // gloed rond de inslag: op het water, in de mist en tegen de bergen
  float ri = length((vec2(xb, w.y) - uInslag.xy) * vec2(.5, 1.25));
  col += uInslagKl * uInslag.z * (.26 * exp(-ri / .03) + .09 * exp(-ri / .2) + .03 * exp(-ri / .8));
  // mist laag boven het water
  float mh = v > 0. ? exp(-v / .025) : exp(v / .06);
  float mn = uQ < 2.5 ? vn(vec2(p.x * 2.6 + uTime * .035 + uDrift * 2., v * 30. - uTime * .02)) : .5;
  float mist = mh * smoothstep(.2, .85, mn);
  vec3 mk = vec3(.075, .095, .13) * .7;
  mk += uLichtKl * uLicht.z * .06 * exp(-length(w - uLicht.xy) / .5);
  mk += uInslagKl * uInslag.z * .45 * exp(-ri / .3);
  col = col * (1. - .3 * mist) + mk * mist;
  // de lichtzuil na de inslag (in schermruimte), met stralen die omhoog door de mist waaieren
  if (uZuil.w > 0.) {
    float dx = p.x - uZuil.x;
    float wz = uZuil.z;
    float hgt = p.y - uZuil.y;
    float op = smoothstep(-.004, .006, hgt);
    float boven = op * (1. - smoothstep(uZuil2.x - .12, uZuil2.x + .06, p.y));
    float kz = exp(-dx * dx / (wz * wz));
    float bz = exp(-dx * dx / (wz * wz * 22.));
    float upf = .45 + .55 * exp(-max(hgt, 0.) * 1.6);
    float onder = (1. - op) * exp(hgt * 10.) * .55;
    vec3 halo = uInslagKl;
    if (uTier > 3.5) halo = hsv(vec3(fract(dx / (wz * 9.) + p.y * .4 - uTime * .3), .7, 1.)) * 1.15;
    col += (mix(uInslagKl, vec3(1.), .75) * kz * 1.7 + halo * bz * uZuil2.y) * uZuil.w * (boven * upf + onder);
    if (uTier > 2.5 && uTier < 3.5 && hgt > 0.) {
      // speciaal: elektrische bogen die rond de zuil knetteren
      float fl = uTw > .5 ? step(.35, h11(floor(uTime * 24.) + 3.)) : .7;
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float off = (fk * 2. - 1.) * (wz * 2.2 + .02) + (vn(vec2(hgt * 26. + fk * 7., uTime * 9.)) - .5) * .05;
        float lijn = exp(-abs(dx - off) / (px * 1.6));
        col += mix(uKl2Z, vec3(1.), .4) * lijn * uZuil.w * .9 * fl * exp(-hgt * 2.5);
      }
    }
    if (uZuil2.z > 0. && hgt > 0.) {
      float ang = atan(dx, hgt);
      float rr = length(vec2(dx, hgt));
      float st = vn(vec2(ang * 9. + 3., uTime * .25)) * .65 + vn(vec2(ang * 23. + 7., uTime * .4)) * .35;
      st = smoothstep(.45, .95, st);
      col += uInslagKl * uZuil2.z * st * exp(-rr * 1.6) * (1. - smoothstep(.2, 1.5, abs(ang))) * smoothstep(0., .08, rr);
    }
  }
  // dennen op de voorgrond
  float dn = 0.;
  for (int k = 0; k < 4; k++) {
    vec4 b = uBoom[k];
    if (b.z <= 0.) continue;
    dn = max(dn, den(vec2(p.x + uDrift * 1.4 - b.x, w.y - b.y), b));
  }
  col = mix(col, vec3(.002, .003, .006) + uInslagKl * uInslag.z * .004, dn);
  float vg = smoothstep(.32, .98, length(p * vec2(.66, 1.)));
  col *= 1. - uVig * vg;
  o = vec4(col * uFade, 1.);
}`;

  // ───────────────────────── Het onderschrift (een vlak in schermruimte) ─────────────────────────
  const VS_TEKST = `${KOP}
uniform vec2 uRes, uShake;
uniform float uZoom;
uniform vec4 uRect;
out vec2 vUv;
void main(){
  vec2 g = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vUv = g;
  vec2 p = uRect.xy + vec2(g.x * 2. - 1., 1. - g.y * 2.) * uRect.zw;
  p = p * uZoom + uShake;
  gl_Position = vec4(p.x * 2. * uRes.y / uRes.x, p.y * 2., 0., 1.);
}`;
  const FS_TEKST = `${KOP}
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform float uAlpha, uScherp, uGlans;
uniform vec3 uKleur, uGloed;
void main(){
  vec4 t = textureLod(uTex, vUv, (1. - uScherp) * 3.2);
  vec4 g = textureLod(uTex, vUv, 4.6);
  float gl = exp(-pow((vUv.x - uGlans) * 5. - (vUv.y - .5) * 1.2, 2.));
  vec3 c = t.rgb * uKleur * (1. + .9 * gl) + g.rgb * uGloed;
  o = vec4(c * uAlpha, 0.);
}`;

  // ───────────────────────── Tijden ─────────────────────────
  function tijden(d) {
    const snel = !!d.snel;
    const IN = snel ? 2.0 : 3.6; // de ster verschijnt
    const E = snel ? 4.45 : 7.5; // de inslag
    const K0 = E + (snel ? 0.85 : 1.3);
    return { IN, E, K0 };
  }

  // Per niveau: aantal sterren, kern, helderheid, staartlengte (wereld), staartbreedte, staartlicht, zuil, vonken.
  const LOOKS = [
    { n: 1, kern: 0.003, kop: 0.55, staartL: 0.17, breed: 0.0055, staartI: 1.3, zuil: 0.8, vonk: 0.55 },
    { n: 1, kern: 0.0036, kop: 0.8, staartL: 0.27, breed: 0.0064, staartI: 1.7, zuil: 1.0, vonk: 0.75 },
    { n: 3, kern: 0.0042, kop: 1.0, staartL: 0.35, breed: 0.0072, staartI: 2.1, zuil: 1.2, vonk: 1.0 },
    { n: 4, kern: 0.0046, kop: 1.15, staartL: 0.41, breed: 0.0078, staartI: 2.4, zuil: 1.35, vonk: 1.2 },
    { n: 8, kern: 0.005, kop: 1.35, staartL: 0.48, breed: 0.0084, staartI: 2.7, zuil: 1.55, vonk: 1.5 },
  ];
  // kleur van de staart (a) en van het uiteinde (b); type 0 gewoon, 1 plasma, 2 regenboog
  const KLEUREN = [
    { a: [1.0, 0.58, 0.26], b: [0.85, 0.26, 0.07], type: 0 },
    { a: [0.76, 0.92, 1.0], b: [0.5, 0.7, 1.0], type: 0 },
    { a: [1.0, 0.8, 0.3], b: [1.0, 0.48, 0.1], type: 0 },
    { a: [0.28, 0.9, 1.0], b: [0.58, 0.3, 1.0], type: 1 },
    { a: [1.0, 0.92, 0.8], b: [1.0, 0.6, 0.9], type: 2 },
  ];
  // De baan van de wensster (kubische Bézier; x in halve beeldbreedtes, y in wereld-y) en die van de begeleiders,
  // met hoe veel later ze verschijnen. Ze eindigen allemaal op het punt van de inslag.
  const BAAN = [0.72, 0.5, 0.36, 0.52, 0.1, 0.24];
  const MEE = [
    [-0.66, 0.48, -0.36, 0.47, -0.1, 0.22, 0.3],
    [0.98, 0.42, 0.6, 0.36, 0.22, 0.14, 0.55],
    [-1.0, 0.4, -0.62, 0.34, -0.22, 0.12, 0.75],
    [0.3, 0.6, 0.18, 0.5, 0.06, 0.22, 0.42],
    [-0.3, 0.6, -0.18, 0.5, -0.05, 0.22, 0.62],
    [1.05, 0.49, 0.7, 0.46, 0.3, 0.2, 0.85],
    [-1.05, 0.49, -0.7, 0.46, -0.3, 0.2, 1.0],
  ];

  SPO.openingen.ster = {
    naam: 'ster',

    shaders: {
      bak: { vs: VS_VOL, fs: FS_BAK, teken: 'vol' },
      lucht: { vs: VS_VOL, fs: FS_LUCHT, teken: 'vol' },
      tekst: { vs: VS_TEKST, fs: FS_TEKST, teken: 'strip' },
    },

    tijdlijn(d) {
      const { IN, E, K0 } = tijden(d);
      return { E, K0, IN, staart: 0.45, fotos: [IN * 0.42, IN - 0.3, IN + 0.45, IN + (E - IN) * 0.5, E - 0.3, E + 0.06, E + 0.45, K0 - 0.2] };
    },

    // Het onderschrift: "Doe een wens…", een sierlijntje, het vak in gespatieerde hoofdletters en het onderwerp met de weging.
    *art(d, h) {
      const A = h.art;
      const cv = A.nieuw(TW, TH);
      const g = cv.getContext('2d');
      const spatie = (px) => {
        if ('letterSpacing' in g) g.letterSpacing = px + 'px';
      };
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      let breedst = 0;
      // regel 1
      spatie(3);
      g.font = `200 92px ${A.F_TEKST}`;
      g.fillStyle = 'rgb(238,243,255)';
      const r1 = 'Doe een wens…';
      g.fillText(r1, TW / 2 + 1.5, 150);
      breedst = Math.max(breedst, g.measureText(r1).width);
      yield;
      // sierlijn met een kleine vierpuntige ster
      const oy = 200;
      for (const kant of [-1, 1]) {
        const x0 = TW / 2 + kant * 30;
        const x1 = TW / 2 + kant * 250;
        const gr = g.createLinearGradient(x0, 0, x1, 0);
        gr.addColorStop(0, 'rgba(205,220,255,0.85)');
        gr.addColorStop(1, 'rgba(205,220,255,0)');
        g.fillStyle = gr;
        g.fillRect(Math.min(x0, x1), oy - 1, Math.abs(x1 - x0), 2);
      }
      g.fillStyle = 'rgb(235,242,255)';
      g.beginPath();
      const s = 15;
      const cx = TW / 2;
      g.moveTo(cx, oy - s);
      g.quadraticCurveTo(cx + 2, oy - 2, cx + s, oy);
      g.quadraticCurveTo(cx + 2, oy + 2, cx, oy + s);
      g.quadraticCurveTo(cx - 2, oy + 2, cx - s, oy);
      g.quadraticCurveTo(cx - 2, oy - 2, cx, oy - s);
      g.fill();
      yield;
      // het vak
      const vak = String(d.vak || 'Vak').toUpperCase();
      let fs = 70;
      const maxB = TW - 180;
      for (; fs > 34; fs -= 2) {
        g.font = `600 ${fs}px ${A.F_SPORT}`;
        spatie(fs * 0.42);
        if (g.measureText(vak).width <= maxB) break;
      }
      g.fillStyle = 'rgb(214,228,255)';
      g.fillText(vak, TW / 2 + fs * 0.21, 292);
      breedst = Math.max(breedst, g.measureText(vak).width);
      yield;
      // onderwerp en weging
      spatie(2.5);
      g.font = `400 30px ${A.F_TEKST}`;
      g.fillStyle = 'rgba(178,195,236,0.82)';
      const extra = `  ·  weging ${d.weging}×`;
      let ond = String(d.onder || '');
      while (ond.length > 3 && g.measureText(ond + extra).width > maxB) ond = ond.slice(0, -2);
      if (ond !== String(d.onder || '')) ond = ond.trim() + '…';
      const r3 = ond + extra;
      g.fillText(r3, TW / 2 + 1.25, 362);
      breedst = Math.max(breedst, g.measureText(r3).width);
      return { tekst: cv, tekstBreed: Math.min(TW, breedst + 120) };
    },

    maak(c) {
      const { gl, motor, tl, d, tier, I, L } = c;
      const { IN, E, K0 } = tl;
      const KE = K0 - E;
      const snel = !!d.snel;
      const LK = LOOKS[tier];
      const KL = KLEUREN[tier];
      const pL = c.prog('lucht');
      const pB = c.prog('bak');
      const pT = c.prog('tekst');
      const S = { riser: false, vlucht: false };
      const wit = [1, 0.97, 0.9];
      const koel = [0.62, 0.74, 1.0];

      // ── de lucht één keer bakken ──
      const doel = motor.maakDoel(HB, HH, false);
      motor.doel(doel);
      motor.mengen('geen');
      pB.gebruik();
      pB.f2('uRes', HB, HH);
      pB.f4('uRect', HEMEL[0], HEMEL[1], HEMEL[2], HEMEL[3]);
      motor.volledig();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(doel.fbo);
      const hemel = doel.tex;

      const tekstTex = c.art && c.art.tekst ? c.tekstuur(c.art.tekst) : null;
      const tekstBreed = (c.art && c.art.tekstBreed) || TW;

      // ── camera: eerst rustig omhoog kantelen, dan de ster volgen naar de horizon ──
      const hs0 = -0.05;
      const hs1 = -0.25;
      const hs2 = -0.075;
      function horizon(t) {
        if (t <= IN) return c.mix(hs0, hs1, c.glad(t / IN));
        if (t <= E) return c.mix(hs1, hs2, c.glad(c.ramp(t, IN + 0.2 * (E - IN), E)));
        return hs2;
      }
      const camY = (t) => Y_H - horizon(t);
      const drift = (t) => 0.045 * (1 - Math.min(Math.max(t, 0), E) / E);

      // ── de sterren ──
      const binnen = c.klem((I - [0, 0.55, 0.7, 0.9, 0.995][tier]) / 0.15, 0, 1); // waar in het niveau
      const groei = 0.9 + 0.2 * binnen;
      const P3 = [0, Y_H - DZ_I]; // het punt van de inslag (wereld)
      const sterren = [];
      function ster(o) {
        const s = Object.assign(
          { acc: 0.7, na: 0.3, uit: false, kern: LK.kern, kop: LK.kop * groei, staartL: LK.staartL * groei, breed: LK.breed, staartI: LK.staartI, a: KL.a, b: KL.b, type: KL.type, seed: 0 },
          o,
        );
        sterren.push(s);
        return s;
      }
      // een verre, neutrale vonk vooraf (nog geen kleur!)
      const tv = snel ? 0.95 : 1.75;
      ster({ t0: tv, t1: tv + 0.6, p: [-0.3, 0.42, -0.36, 0.4, -0.45, 0.36, -0.56, 0.31], acc: 0.8, uit: true, kern: 0.0018, kop: 0.5, staartL: 0.07, breed: 0.0022, staartI: 0.9, a: koel, b: [0.45, 0.6, 1], type: 0, seed: 0.77 });
      // de wensster zelf
      const hoofd = ster({ t0: IN, t1: E, p: BAAN.concat(P3), seed: 0.13 });
      // begeleiders (goud, speciaal, icoon): ze komen allemaal op hetzelfde punt samen
      for (let j = 0; j < LK.n - 1; j++) {
        const m = MEE[j];
        let a = KL.a;
        let b = KL.b;
        if (tier === 3 && j % 2 === 0) {
          a = KL.b;
          b = KL.a;
        }
        ster({ t0: IN + m[6] * (snel ? 0.6 : 1), t1: E, p: m.slice(0, 6).concat(P3), kern: LK.kern * 0.65, kop: LK.kop * 0.62, breed: LK.breed * 0.7, staartI: LK.staartI * 0.8, staartL: LK.staartL * 0.8, a, b, seed: 0.13 + 0.125 * (j + 1) });
      }

      // Plaats van ster s op tijd t (wereld). hw = halve beeldbreedte in p-eenheden.
      function plek(s, t, hw, uit) {
        const hwE = Math.max(hw, 0.27);
        let u = (t - s.t0) / (s.t1 - s.t0);
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const k = u * (s.acc + (1 - s.acc) * u);
        const a = 1 - k;
        const b0 = a * a * a;
        const b1 = 3 * k * a * a;
        const b2 = 3 * k * k * a;
        const b3 = k * k * k;
        const P = s.p;
        uit[0] = (b0 * P[0] + b1 * P[2] + b2 * P[4] + b3 * P[6]) * hwE;
        uit[1] = b0 * P[1] + b1 * P[3] + b2 * P[5] + b3 * P[7];
        return u;
      }
      const Q = [0, 0];
      const Q2 = [0, 0];
      const KOPA = new Float32Array(32);
      const KL1 = new Float32Array(32);
      const KL2 = new Float32Array(32);
      const BX = new Float32Array(32);
      const STA = new Float32Array(32);
      const PAD = new Float32Array(112);
      const BOOM = new Float32Array(16);
      const LICHT = [0, 0, 0, 0];
      const lichtKl = koel.slice();
      const inslagKl = [1, 1, 1];
      const hsvTmp = [0, 0, 0];

      function sterKleur(s, t, uit, welke) {
        const k = welke ? s.b : s.a;
        if (s.type === 2) {
          SPO.hsv(t * 0.12 + s.seed + (welke ? 0.35 : 0), 0.55, 1, uit);
          return;
        }
        uit[0] = k[0];
        uit[1] = k[1];
        uit[2] = k[2];
      }

      // Vult de uniform-lijsten voor de sterren die nu zichtbaar zijn; geeft het aantal terug.
      function vul(t, hw) {
        let n = 0;
        LICHT[2] = 0;
        for (let i = 0; i < sterren.length && n < 8; i++) {
          const s = sterren[i];
          if (t < s.t0 || t > s.t1 + s.na) continue;
          const u = plek(s, t, hw, Q);
          let hel = s.kop * c.sm(t, s.t0, s.t0 + 0.2) * (0.55 + 0.45 * u + 0.5 * Math.pow(u, 6));
          hel += s.kop * 1.3 * Math.exp(-(t - s.t0) / 0.09);
          let sti = s.staartI * c.sm(t, s.t0, s.t0 + 0.15);
          if (s.uit) {
            const f = 1 - c.sm(t, s.t1 - 0.3, s.t1);
            hel *= f;
            sti *= f;
          } else if (t > s.t1) {
            hel = 0;
            sti *= 1 - c.sm(t, s.t1, s.t1 + s.na);
          }
          const o4 = n * 4;
          const kern = s.kern * (0.75 + 0.5 * u);
          KOPA[o4] = Q[0];
          KOPA[o4 + 1] = Q[1];
          KOPA[o4 + 2] = kern;
          KOPA[o4 + 3] = hel;
          sterKleur(s, t, hsvTmp, 0);
          KL1[o4] = hsvTmp[0];
          KL1[o4 + 1] = hsvTmp[1];
          KL1[o4 + 2] = hsvTmp[2];
          KL1[o4 + 3] = s.type;
          sterKleur(s, t, hsvTmp, 1);
          KL2[o4] = hsvTmp[0];
          KL2[o4 + 1] = hsvTmp[1];
          KL2[o4 + 2] = hsvTmp[2];
          KL2[o4 + 3] = t - s.t0;
          STA[o4] = s.breed * (0.7 + 0.5 * u);
          STA[o4 + 1] = sti;
          STA[o4 + 2] = s.seed;
          STA[o4 + 3] = 0;
          // de staart: een vaste lengte langs de baan (dus een tijdvenster dat met de snelheid meeschaalt)
          plek(s, Math.min(t, s.t1) - 0.03, hw, Q2);
          const snelh = Math.hypot(Q[0] - Q2[0], Q[1] - Q2[1]) / 0.03;
          const duur = Math.min(1.6, s.staartL / Math.max(snelh, 0.05));
          let x0 = 1e9;
          let y0 = 1e9;
          let x1 = -1e9;
          let y1 = -1e9;
          for (let k = 0; k < 7; k++) {
            plek(s, t - duur * Math.pow(k / 6, 1.2), hw, Q2);
            const j = (n * 7 + k) * 2;
            PAD[j] = Q2[0];
            PAD[j + 1] = Q2[1];
            if (Q2[0] < x0) x0 = Q2[0];
            if (Q2[0] > x1) x1 = Q2[0];
            if (Q2[1] < y0) y0 = Q2[1];
            if (Q2[1] > y1) y1 = Q2[1];
          }
          const m = Math.max(s.breed * 4, kern * 24, t - s.t0 < 0.8 ? 0.17 : 0) + 0.01;
          BX[o4] = x0 - m;
          BX[o4 + 1] = y0 - m;
          BX[o4 + 2] = x1 + m;
          BX[o4 + 3] = y1 + m;
          if (s === hoofd) {
            LICHT[0] = Q[0];
            LICHT[1] = Q[1];
            LICHT[2] = hel * 0.6;
          }
          n++;
        }
        return n;
      }

      // ── deeltjes ──
      const MOT0 = [0.55, 0.68, 1.0];
      const motKl1 = MOT0.slice();
      const motKl2 = [0.82, 0.9, 1.0];
      const stof = c.e({ mode: 1, t0: -8, delay: 14, life: 10, n: 60, size: [0.0018, 0.0075], col1: motKl1, col2: motKl2, alpha: 0.32, seed: 41 });
      // vonkjes langs de baan: veel kleine bronnen met oplopende t0, op de plek waar de ster toen was
      const sporen = [];
      function spoor(s, dE, n, life, maat, alpha) {
        for (let te = s.t0 + 0.04; te < s.t1 - 0.02; te += dE) {
          const em = c.e({ mode: 0, t0: te, delay: dE, life, n, org: [0, 0], angle: 0, spread: 1.5, spd: [0.006, 0.07], grav: [0, 0], drag: 2.4, size: [0.001, maat], col1: s.type === 2 ? c.kl : s.a, col2: wit, regen: s.type === 2 ? 1 : 0, alpha, seed: 60 + sporen.length });
          sporen.push({ em, s, te, a0: alpha });
        }
      }
      const vk = LK.vonk;
      spoor(hoofd, snel ? 0.05 : 0.065, Math.round(10 + 16 * vk), 0.5 + 0.35 * vk, 0.0024 + 0.0012 * vk, 0.9);
      for (let i = 2; i < sterren.length; i++) {
        if (tier === 4 && i % 2) continue;
        spoor(sterren[i], snel ? 0.11 : 0.15, Math.round(8 + 8 * vk), 0.45 + 0.2 * vk, 0.002 + 0.001 * vk, 0.8);
      }
      spoor(sterren[0], 0.1, 6, 0.4, 0.0016, 0.6); // de neutrale vonk vooraf
      // ontbranden: een klein pufje vonken als een ster verschijnt
      const ontbrand = [];
      for (let i = 1; i < sterren.length; i++) {
        const s = sterren[i];
        const em = c.e({ mode: 0, t0: s.t0, delay: 0.04, life: 0.6, n: Math.round((i === 1 ? 30 : 14) + 30 * vk * (i === 1 ? 1 : 0.4)), org: [0, 0], angle: 0, spread: c.TWEE_PI, spd: [0.04, 0.3], grav: [0, -0.04], drag: 3.2, size: [0.0012, 0.0034], col1: s.type === 2 ? c.kl : s.a, col2: wit, regen: s.type === 2 ? 1 : 0, alpha: 0.9, seed: 30 + i });
        ontbrand.push({ em, s });
      }
      // de inslag: een fontein van druppels en vonken, vonken die langs de lichtzuil omhoog schieten, en zwevende sintels
      const rg = tier === 4 ? 1 : 0;
      const spat = c.e({ mode: 0, t0: E, delay: 0.08, life: 1.3, n: Math.round((200 + 600 * I) * (0.7 + 0.3 * vk)), org: [0, 0], angle: Math.PI / 2, spread: 1.15, spd: [0.25, 1.25 + 0.2 * vk], grav: [0, -1.1], drag: 0.7, size: [0.0014, 0.0045], col1: c.kl, col2: wit, regen: rg, alpha: 1, seed: 71 });
      const opstijg = c.e({ mode: 0, t0: E + 0.05, delay: KE, life: 0.9, n: Math.round((100 + 300 * I) * vk), org: [0, 0], angle: Math.PI / 2, spread: 0.16, spd: [0.4, 1.6], grav: [0, 0.1], drag: 0.6, size: [0.0012, 0.0035], col1: c.kl, col2: wit, regen: rg, alpha: 0.8, seed: 72 });
      const sintels = c.e({ mode: 0, t0: E + 0.1, delay: 0.8, life: 2.4, n: Math.round((60 + 220 * I) * vk), org: [0, 0], angle: Math.PI / 2, spread: 2.4, spd: [0.05, 0.5], grav: [0, 0.03], drag: 1.2, size: [0.0016, 0.004], col1: c.kl, col2: c.kl2, regen: rg, alpha: 0.8, seed: 73 });

      // ── gebeurtenissen: geluid en trillen ──
      const A = c.audio;
      c.at(0.05, () => A.speel('ster-nacht', { gain: 0.9, fadeIn: 1.6, duur: IN + 2.6, fadeOut: 2.4 }));
      c.at(IN - 0.1, () => A.speel('tik', { rate: 2.2, gain: 0.55, galmen: 0.5 }));
      c.at(IN - 0.05, () => {
        S.vlucht = true;
        A.speel('ster-vlucht', { gain: 0.85, duur: E - IN + 0.35, fadeIn: 0.25, fadeOut: 0.3 });
      });
      for (let i = 2; i < sterren.length; i++) {
        const s = sterren[i];
        c.at(s.t0 - 0.04, () => A.speel('tik', { rate: 1.75 + 0.11 * i, gain: 0.32, galmen: 0.55, pan: s.p[0] > 0 ? 0.5 : -0.5 }));
      }
      const RIS = snel ? 1.0 : 1.5;
      c.at(E - RIS, () => {
        S.riser = true;
        A.riser(RIS, 0.5 + 0.4 * I);
      });
      // na overslaan (naar E − 1,1) zijn de vorige geluiden overgeslagen: dan alsnog een korte opbouw
      const SPR = 1.1 * (snel ? 0.8 : 1);
      c.at(E - SPR, () => {
        if (!S.riser) A.riser(SPR, 0.5 + 0.4 * I);
        if (!S.vlucht) A.speel('ster-vlucht', { gain: 0.8, offset: Math.max(0, E - IN - SPR), duur: SPR + 0.3, fadeIn: 0.1, fadeOut: 0.3 });
        S.riser = true;
        S.vlucht = true;
      });
      c.at(E - 0.02, () => {
        A.speel('ster-inslag', { gain: 1.0, galmen: 0.35 });
        A.boem(0.55 + 0.4 * I, 0.85);
        c.trillen([30, 30, 80]);
      });

      // ── klappen ──
      const zyE = P3[1] - camY(E); // hoogte van de inslag op het scherm
      c.schok(E, 0.045, 0.3);
      c.flits(E, 0.4, 0.03);
      c.flits(E, 0.08 + 0.1 * I, 0.12);
      c.golf(E, 1.3, 0.22, zyE);

      // Normalisatie van de nabewerking vóór de onthulling: elk niveau moet er dan precies hetzelfde uitzien.
      const bloomN = 0.5 / (L.bloom * 0.9 * (0.9 + 0.2 * I));
      const caN = 0.0011 / (L.ca * 0.5 * (0.5 + 1.5 * I));
      const satN = 1 / L.sat;

      const ZUIL = [0, 0, 0, 0, 0, 0, 0, 0];
      function luchtTekenen(t, cy, dr, n, fade, inslag, ringT, niveau) {
        const p = pL;
        p.gebruik();
        c.basis(p);
        p.f1('uTime', t);
        p.f1('uCy', cy);
        p.f1('uDrift', dr);
        p.f1('uYH', Y_H);
        p.f1('uFade', fade);
        p.f1('uVig', 0.55);
        p.f1('uQ', motor.kwaliteit);
        p.f1('uTw', c.reduceer ? 0.3 : 1);
        p.tex('uHemel', 0, hemel);
        p.f4('uRect', HEMEL[0], HEMEL[1], HEMEL[2], HEMEL[3]);
        p.i1('uN', n);
        if (n > 0) {
          p.v4s('uKop[0]', KOPA);
          p.v4s('uKl[0]', KL1);
          p.v4s('uKl2[0]', KL2);
          p.v4s('uBx[0]', BX);
          p.v4s('uSt[0]', STA);
          p.f2v('uPad[0]', PAD);
        }
        p.f4('uLicht', LICHT[0], LICHT[1], LICHT[2], 0);
        p.v3('uLichtKl', lichtKl);
        p.f4('uInslag', P3[0], P3[1], inslag, 0);
        p.v3('uInslagKl', inslagKl);
        p.f4('uZuil', ZUIL[0], ZUIL[1], ZUIL[2], ZUIL[3]);
        p.f4('uZuil2', ZUIL[5], ZUIL[6], ZUIL[7], 0);
        p.f4('uRing', ringT, ringT >= 0 ? ZUIL[4] : 0, 2.1, 0);
        p.v4s('uBoom[0]', BOOM);
        p.f1('uTier', niveau);
        p.v3('uKl2Z', c.kl2);
        motor.mengen('optel');
        motor.volledig();
      }

      // dennen op de voorgrond, aan de randen van het beeld
      function bomen(asp) {
        const hw = asp / 2;
        const s = Math.min(1, asp / 1.5) * 0.9 + 0.1;
        BOOM[0] = -hw - 0.03 * s;
        BOOM[1] = Y_H - 0.52;
        BOOM[2] = 0.98 * s;
        BOOM[3] = 0.13 * s;
        BOOM[4] = -hw + 0.13 * s;
        BOOM[5] = Y_H - 0.5;
        BOOM[6] = 0.64 * s;
        BOOM[7] = 0.085 * s;
        BOOM[8] = hw + 0.02 * s;
        BOOM[9] = Y_H - 0.53;
        BOOM[10] = 0.9 * s;
        BOOM[11] = 0.12 * s;
        BOOM[12] = hw - 0.11 * s;
        BOOM[13] = Y_H - 0.5;
        BOOM[14] = 0.5 * s;
        BOOM[15] = 0.07 * s;
      }

      return {
        teken(t) {
          const asp = c.asp;
          const hw = asp / 2;
          const cy = camY(t);
          const dr = drift(t);
          const tau = t - E;
          const uitF = 1 - c.sm(t, K0, K0 + tl.staart);
          const rv = c.sm(t, IN, IN + 0.6); // hoe ver de onthulling is
          bomen(asp);

          // kleur van het licht: neutraal tot de ster er is
          sterKleur(hoofd, t, hsvTmp, 0);
          for (let i = 0; i < 3; i++) {
            lichtKl[i] = c.mix(koel[i], hsvTmp[i], rv);
            inslagKl[i] = tier === 4 ? c.kl[i] : c.mix(hsvTmp[i], c.kl[i], 0.4);
            motKl1[i] = c.mix(MOT0[i], hsvTmp[i], 0.7 * rv);
          }
          const n = vul(t, hw);

          // de inslag
          const Lz = LK.zuil * (0.85 + 0.3 * binnen);
          let G = 0;
          if (tau >= 0) G = Lz * (1.6 * Math.exp(-tau / 0.08) + 0.7 * Math.exp(-tau / 0.5) + 0.35 + 0.8 * c.sm(tau, 0.4, KE));
          else if (tau > -0.3) G = Lz * 0.4 * Math.pow(1 + tau / 0.3, 3);
          G *= uitF;
          const zx = P3[0] - dr * 0.6;
          const zy = P3[1] - cy;
          ZUIL[0] = zx;
          ZUIL[1] = zy;
          const zwel = c.sm(tau, 0.45, KE);
          ZUIL[2] = 0.003 + 0.007 * c.sm(tau, 0, 0.25) + 0.065 * zwel * zwel;
          ZUIL[3] = tau >= 0 ? Lz * (c.sm(tau, 0, 0.04) * (0.7 + 1.3 * Math.exp(-tau / 0.3)) + 1.5 * Math.pow(zwel, 1.5)) * uitF : 0;
          ZUIL[4] = Lz * 0.9 * uitF;
          ZUIL[5] = zy + 1.4 * c.sm(tau, 0, 0.2); // de top van de zuil schiet omhoog
          ZUIL[6] = 0.2 + 0.45 * zwel;
          ZUIL[7] = tau >= 0 ? Lz * (0.3 * c.sm(tau, 0.04, 0.4) + 0.2 * zwel) * uitF : 0; // stralen

          // nabewerking
          const post = c.post;
          post.streak = c.mix(-0.12, 0.25 + 0.3 * c.ramp(t, IN, E), rv) + (tau >= 0 ? 0.5 * Math.exp(-tau / 0.4) : 0);
          post.vig = 0.15 + 0.85 * c.sm(t, E - 0.5, K0);
          post.bloom = c.mix(bloomN, 1, rv);
          post.ca = c.mix(caN, 1, rv);
          post.sat = c.mix(satN, 1, c.sm(t, E, K0));
          let zoom = 1 + 0.025 * c.sm(t, IN, E);
          if (tau >= 0) zoom += 0.012 * Math.exp(-tau / 0.1) + 0.1 * Math.pow(c.sm(tau, 0.3, KE), 2);
          post.zoom = c.mix(zoom, 1, c.sm(t, K0, K0 + 0.3));
          if (tau >= 0) post.rad = 0.025 * Math.exp(-tau / 0.15) + 0.28 * Math.pow(c.sm(tau, 0.5, KE), 2) * uitF;

          // ── de wereld ──
          const fade = (0.15 + 0.85 * c.sm(t, 0, 1.7)) * uitF;
          luchtTekenen(t, cy, dr, n, fade, G, tau, t >= IN ? tier : 0);

          // lichtstralen en lensstreep bij de inslag
          if (tau > -0.02 && uitF > 0.01) {
            const k = c.sm(tau, -0.02, 0.03);
            c.licht(t, zx, zy, Lz * k * 0.2 * Math.exp(-tau / 0.3) * uitF, 0.01, Lz * k * 0.8 * Math.exp(-tau / 0.45) * uitF, 0, 0, c.kl);
          }

          // ── deeltjes ──
          motor.mengen('optel');
          stof.alpha = 0.3 * c.sm(t, 0.3, 2) * uitF;
          c.zend(t, stof);
          for (let i = 0; i < sporen.length; i++) {
            const sp = sporen[i];
            const em = sp.em;
            if (t < sp.te || t > sp.te + em.delay + em.life) continue;
            const s = sp.s;
            // de plek waar de ster toen was, in schermruimte; de camera beweegt mee, dus geven we de vonken die snelheid mee
            plek(s, sp.te, hw, Q);
            plek(s, sp.te + 0.02, hw, Q2);
            const cy0 = camY(sp.te);
            const vcy = (camY(sp.te + 0.02) - cy0) / 0.02;
            em.org[0] = Q[0] - drift(sp.te) * 0.6;
            em.org[1] = Q[1] - cy0;
            em.angle = Math.atan2(Q[1] - Q2[1], Q[0] - Q2[0]);
            em.grav[0] = 0.6 * (0.045 / E) * em.drag;
            em.grav[1] = -vcy * em.drag - 0.04;
            em.alpha = sp.a0 * uitF;
            c.zend(t, em);
          }
          for (let i = 0; i < ontbrand.length; i++) {
            const o = ontbrand[i];
            if (t < o.s.t0 || t > o.s.t0 + 0.7) continue;
            plek(o.s, o.s.t0, hw, Q);
            o.em.org[0] = Q[0] - drift(o.s.t0) * 0.6;
            o.em.org[1] = Q[1] - camY(o.s.t0);
            c.zend(t, o.em);
          }
          if (tau >= -0.01) {
            spat.org[0] = opstijg.org[0] = sintels.org[0] = zx;
            spat.org[1] = opstijg.org[1] = sintels.org[1] = zy;
            spat.alpha = uitF;
            opstijg.alpha = 0.8 * uitF;
            sintels.alpha = 0.8 * uitF;
            if (tau < 1.5) c.zend(t, spat);
            c.zend(t, opstijg);
            c.zend(t, sintels);
          }

          // ── het onderschrift ──
          if (tekstTex) {
            const c0 = snel ? 0.25 : 0.55;
            const c1 = snel ? 1.35 : 2.55;
            const a = c.sm(t, c0, c0 + 0.8) * (1 - c.sm(t, c1, c1 + 0.7));
            if (a > 0.003) {
              const p = pT;
              p.gebruik();
              c.basis(p);
              const breed = Math.min(1.3, asp * 0.9 * (TW / tekstBreed));
              p.f4('uRect', 0, 0.115 + 0.012 * (t - c0), breed / 2, (breed / 2) * (TH / TW));
              p.tex('uTex', 0, tekstTex);
              p.f1('uAlpha', a);
              p.f1('uScherp', c.sm(t, c0, c0 + 1.1) * (1 - 0.75 * c.sm(t, c1, c1 + 0.7)));
              p.f1('uGlans', -0.3 + 1.6 * c.ramp(t, c0 + 0.6, c0 + 2.4));
              p.f3('uKleur', 0.8, 0.85, 0.95);
              p.f3('uGloed', 0.22, 0.32, 0.7);
              motor.mengen('optel');
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
              motor.teken.draws++;
            }
          }
        },

        // het startscherm: alleen de rustige nachtlucht
        wacht(t) {
          bomen(c.asp);
          LICHT[2] = 0;
          for (let i = 0; i < ZUIL.length; i++) ZUIL[i] = 0;
          luchtTekenen(t, camY(0), drift(0), 0, 1, 0, -1, 0);
        },

        reset() {
          S.riser = false;
          S.vlucht = false;
        },

        verwijder() {
          gl.deleteTexture(hemel);
        },

        // spanning vlak voor de inslag en terwijl de lichtzuil aanzwelt
        schud(t) {
          if (t > E - 1.2 && t < E) return 0.0012 + 0.0035 * Math.pow(c.ramp(t, E - 1.2, E), 2);
          if (t >= E && t < K0) return 0.002 + 0.006 * c.sm(t, E + 0.3, K0);
          return 0;
        },

        // overslaan: vóór de laatste seconde van de vlucht springen we naar E − 1,1 (je ziet de ster nog vallen)
        sprong(t) {
          if (t < E - SPR - 0.5) return { doel: E - SPR };
          if (t < E + 0.5) return null;
          return undefined;
        },
      };
    },
  };
})();
