/*
 * Somtoday Pack Opener — shaders.js
 * Alle GLSL (WebGL2). De hele animatie is licht en vorm op de videokaart: er wordt per beeld bijna
 * niets op de processor berekend. Ruimte voor de achtergronden: p = (pixel - midden) / hoogte,
 * dus y loopt van -0,5 tot 0,5 en x van -beeldverhouding/2 tot +beeldverhouding/2.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});

  const KOP = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

  // Gedeelde hulpfuncties: ruis, hashes, kleur.
  const GEMEEN = `
float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0., a = .5;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17., 9.); a *= .5; }
  return s;
}
vec3 hsv(vec3 c){
  vec3 k = clamp(abs(mod(c.x * 6. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.);
  return c.z * mix(vec3(1.), k, c.y);
}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
`;

  // Eén grote driehoek over het hele beeld: geen buffers nodig.
  const VS_VOL = `${KOP}
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

  // ───────────────────────── Bloom en nabewerking ─────────────────────────
  // Downsample met 13 steekproeven (zacht en zonder flikkering). Het eerste niveau haalt alleen de
  // heldere delen eruit (uDrempel > 0) met een Karis-gemiddelde, zodat losse felle pixels niet knipperen.
  const FS_NEER = `${KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uDrempel;
vec3 vang(vec3 c){
  c = clamp(c, 0., 64.); // een enkele rare pixel mag nooit de hele bloom besmetten
  if (uDrempel <= 0.) return c;
  float l = max(c.r, max(c.g, c.b));
  float w = max(l - uDrempel, 0.) / max(l, 1e-4);
  return c * w;
}
vec3 s(vec2 d){ return vang(texture(uSrc, vUv + d * uTexel).rgb); }
void main(){
  vec3 A = s(vec2(-2., -2.)), B = s(vec2(0., -2.)), C = s(vec2(2., -2.));
  vec3 D = s(vec2(-1., -1.)), E = s(vec2(1., -1.));
  vec3 F = s(vec2(-2., 0.)), G = s(vec2(0., 0.)), H = s(vec2(2., 0.));
  vec3 I = s(vec2(-1., 1.)), J = s(vec2(1., 1.));
  vec3 K = s(vec2(-2., 2.)), L = s(vec2(0., 2.)), M = s(vec2(2., 2.));
  vec3 r = (D + E + I + J) * .125 + (A + B + F + G) * .03125 + (B + C + G + H) * .03125 + (F + G + K + L) * .03125 + (G + H + L + M) * .03125;
  o = vec4(r, 1.);
}`;

  const FS_OP = `${KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uLaag, uHoog; uniform vec2 uTexel; uniform float uSterkte;
void main(){
  vec2 t = uTexel;
  vec3 s = texture(uLaag, vUv + vec2(-t.x, -t.y)).rgb + texture(uLaag, vUv + vec2(t.x, -t.y)).rgb
         + texture(uLaag, vUv + vec2(-t.x, t.y)).rgb + texture(uLaag, vUv + vec2(t.x, t.y)).rgb;
  s = s * .125 + (texture(uLaag, vUv + vec2(-2. * t.x, 0.)).rgb + texture(uLaag, vUv + vec2(2. * t.x, 0.)).rgb
         + texture(uLaag, vUv + vec2(0., -2. * t.y)).rgb + texture(uLaag, vUv + vec2(0., 2. * t.y)).rgb) * .0625
         + texture(uLaag, vUv).rgb * .125;
  o = vec4(texture(uHoog, vUv).rgb + s * uSterkte, 1.);
}`;

  const FS_POST = `${KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uStreak;
uniform vec2 uRes;
uniform float uTime, uBloomAmt, uStreakAmt, uStreakTexel, uVig, uGrain, uFade, uBars, uCA, uZoom, uRoll, uSat, uShockW;
// zeldzaam: uGl = glitch (scheve strepen, kleurverschuiving, regenboogstrepen), uDark = scherm donker maken, uShockRegen = regenboog-schokgolf
uniform float uGl, uDark, uShockRegen;
// ultiem: uInv = kleuren omkeren (0..1), uPinch = het beeld wordt naar het midden gezogen (0..1)
uniform float uInv, uPinch;
uniform vec3 uVigCol, uStreakCol, uFlash, uGrade, uShockCol;
uniform vec2 uShake;
uniform vec3 uRadial;
uniform vec4 uShock[3];
uniform int uTaps;
${GEMEEN}
vec3 zacht(vec3 c){
  // Zachte schouder boven 0,75. Voor een deel schalen we alle kleuren samen terug (de tint blijft goud
  // in plaats van wit) en voor een deel per kleur (de allerhetste kernen worden wit).
  float m = max(c.r, max(c.g, c.b));
  vec3 hue = c / max(m, 1.);
  vec3 x = max(c - .75, 0.);
  vec3 per = min(c, .75) + .25 * (1. - exp(-x / .25));
  return mix(per, min(hue, vec3(1.)), .4 * smoothstep(.9, 3., m));
}
void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  vec2 uv = vUv;
  vec2 c0 = uv - .5;
  c0 = rot2(uRoll) * (c0 * asp) / asp;
  uv = .5 + c0 / uZoom + uShake;
  float inP = 1.;
  if (uPinch > .001) {
    // implosie: het beeld krimpt naar het midden en draait mee, daarbuiten is het zwart
    vec2 pq = (uv - .5) * asp;
    float pr = length(pq);
    float ps = 1. / max(1. - uPinch, .012);
    pq = rot2(uPinch * uPinch * 4.5 * exp(-pr * 2.2)) * pq * ps;
    uv = .5 + pq / asp;
    inP = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
  }

  // glitch: horizontale stroken die verschuiven en af en toe een groot blok
  if (uGl > .001) {
    float tk = floor(uTime * 16.);
    float rij = floor(uv.y * 54.);
    float hh = h21(vec2(rij, tk));
    uv.x += step(1. - .5 * uGl, hh) * (h21(vec2(rij * 1.7, tk + 3.)) - .5) * .14 * uGl;
    float blk = floor(uv.y * 7.);
    uv.x += step(.9, h21(vec2(blk, floor(uTime * 9.)))) * (h21(vec2(blk, floor(uTime * 9.) + 5.)) - .5) * .3 * uGl;
  }

  float ring = 0.;
  vec3 ringCol = vec3(0.);
  for (int i = 0; i < 3; i++) {
    vec4 s = uShock[i];
    if (s.w > 0.) {
      vec2 d = (uv - s.xy) * asp;
      float r = length(d);
      float x = (r - s.z) / uShockW;
      float k = exp(-x * x) * s.w;
      uv += normalize(d + vec2(1e-4)) / asp * k * .03;
      float rr = exp(-x * x * 5.) * s.w;
      ring += rr;
      ringCol += mix(uShockCol, hsv(vec3(atan(d.y, d.x) / 6.2831853 + r * 1.6 - uTime * .45, .62, 1.)), uShockRegen) * rr;
    }
  }

  vec3 col;
  vec2 dc = uv - uRadial.xy;
  if (uRadial.z > .001) {
    // radiaal wazig (met kleurafwijking), met jitter zodat de stappen als korrel verdwijnen
    vec3 acc = vec3(0.);
    float jit = h21(gl_FragCoord.xy + fract(uTime * 5.3) * 71.);
    float n = float(uTaps);
    for (int i = 0; i < 8; i++) {
      if (i >= uTaps) break;
      float f = (float(i) + jit) / n;
      float s = 1. - uRadial.z * f;
      acc.r += texture(uScene, uRadial.xy + dc * (s * (1. + uCA))).r;
      acc.g += texture(uScene, uRadial.xy + dc * s).g;
      acc.b += texture(uScene, uRadial.xy + dc * (s * (1. - uCA))).b;
    }
    col = acc / n;
  } else if (uCA > .0005) {
    col = vec3(texture(uScene, uRadial.xy + dc * (1. + uCA)).r, texture(uScene, uv).g, texture(uScene, uRadial.xy + dc * (1. - uCA)).b);
  } else {
    col = texture(uScene, uv).rgb;
  }

  if (uGl > .001) {
    vec2 sp = vec2(.014 * uGl, .0);
    col = vec3(texture(uScene, uv + sp).r, texture(uScene, uv).g, texture(uScene, uv - sp).b);
  }
  col += texture(uBloom, uv).rgb * uBloomAmt;
  if (uStreakAmt > .001) {
    vec3 st = vec3(0.);
    for (int i = -7; i <= 7; i++) {
      float w = exp(-abs(float(i)) * .32);
      st += texture(uStreak, uv + vec2(float(i) * uStreakTexel * 1.6, 0.)).rgb * w;
    }
    col += st * uStreakCol * uStreakAmt * .1;
  }
  col += ringCol * .35;
  if (uInv > .001) col = mix(col, vec3(1.) - min(col, vec3(1.)), uInv);
  col *= inP;

  // kleurcorrectie en vignet
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, uSat) * uGrade;
  vec2 vc = (vUv - .5) * vec2(1.05, 1.);
  float v = smoothstep(.28, .98, length(vc * vec2(asp.x * .62, 1.)));
  col = mix(col, col * (1. - uVig) + uVigCol * uVig * .09, v);
  col *= 1. - uDark;
  if (uGl > .001) {
    // regenboogstrepen en een zwak lijnenpatroon, na het donker maken: ook in een zwart scherm zichtbaar
    float lr = floor(vUv.y * uRes.y / 3.);
    float sl = h21(vec2(lr, floor(uTime * 22.)));
    vec3 rbw = hsv(vec3(vUv.y * 3. + uTime * 1.7 + sl, .8, 1.));
    col += rbw * step(1. - .3 * uGl, sl) * (.35 + .65 * h21(vec2(lr * 3.1, 5.))) * .4 * uGl;
    col += rbw * .035 * uGl * (.5 + .5 * sin(vUv.y * uRes.y * 1.6));
  }
  col += uFlash;
  col *= uFade;
  col = mix(col, col * col * (3. - 2. * min(col, vec3(1.))), .3);
  col = zacht(col);

  // letterbox
  float bar = uBars * .115;
  float inb = smoothstep(bar, bar + .0015, vUv.y) * smoothstep(bar, bar + .0015, 1. - vUv.y);
  col *= inb;

  // korrel en dithering tegen banding in de donkere delen
  float n = h21(gl_FragCoord.xy + fract(uTime * 7.31) * 311.7);
  float n2 = h21(gl_FragCoord.xy * 1.37 + fract(uTime * 3.17) * 97.3);
  col += (n - .5) * uGrain + (n + n2 - 1.) / 255.;
  o = vec4(clamp(col, 0., 4.), 1.);
}`;

  // ───────────────────────── Achtergronden ─────────────────────────
  // Hyperspace: sterren die als strepen op je af komen. Dit is de aanloop (vak en onderwerp vliegen langs).
  const FS_WARP = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uTime, uSpeed, uGlow, uZoom, uAlpha;
uniform vec3 uTint, uTint2;
${GEMEEN}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5) / 6.2831853 + .5;
  vec3 col = mix(vec3(.004, .006, .019), vec3(.011, .017, .042), smoothstep(1.1, 0., r));
  col += uTint2 * (.05 + .12 * uGlow) * exp(-r * 2.1);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float bins = 64. + 52. * fl;
    float x = a * bins;
    float id = floor(x);
    float lane = fract(x) - .5;
    float h = h11(id + fl * 41.7);
    float sp = .35 + .65 * h;
    float z = fract(h * 13.1 + uTime * sp * (.18 + .55 * uSpeed));
    float R = .015 + z * z * 1.3;
    float tail = (.012 + .4 * uSpeed * sp) * (.12 + z);
    float d = r - R;
    float along = smoothstep(-tail, 0., d) * (1. - smoothstep(0., .01 + .02 * z, d));
    float w = .16 + .22 * h11(id * 1.93);
    float across = smoothstep(w, w * .12, abs(lane));
    float br = (.3 + .7 * h11(id * 3.7 + fl)) * smoothstep(0., .1, z);
    vec3 c = mix(uTint, vec3(1.), .2 + .55 * h11(id * 7.1));
    col += c * across * along * br * (.5 + .55 * uSpeed);
  }
  col += mix(uTint, vec3(1.), .5) * uGlow * .55 / (1. + 45. * r * r);
  o = vec4(col * uAlpha, 1.);
}`;

  // Stralen en een gloeiende kern: achter het pakje en achter de kaart.
  const FS_STRALEN = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake, uCenter; uniform float uTime, uZoom, uPow, uCore, uRot, uCount, uHaze, uRegen, uAlpha, uDonker;
uniform vec3 uCol, uCol2;
${GEMEEN}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom - uCenter;
  float r = length(p);
  float a = atan(p.y, p.x + 1e-5);
  vec3 col = mix(vec3(.011, .015, .036), vec3(.002, .003, .009), smoothstep(0., 1.05, r)) * uDonker;
  float m = vn(vec2(a * 3. + uRot * .5, uTime * .15));
  float n1 = sin(a * uCount + uRot) * .5 + .5;
  float n2 = sin(a * uCount * 2.3 - uRot * 1.6 + 1.7) * .5 + .5;
  float rays = pow(n1, 4. + 7. * (1. - m)) * (.55 + .7 * m) + .55 * pow(n2, 9.) * (1. - m);
  float fall = exp(-r * 1.55);
  vec3 rc = mix(uCol, uCol2, .5 + .5 * sin(a * 3. + uTime * .7));
  if (uRegen > .5) rc = hsv(vec3(a / 6.2831853 + uTime * .08 + r * .35, .72, 1.));
  col += rc * rays * fall * uPow;
  col += mix(uCol, vec3(1.), .6) * uCore / (1. + 16. * r * r);
  col += rc * uCore * .22 * exp(-r * 2.6);
  if (uHaze > .02) {
    float hz = fbm(p * 2.3 + vec2(uTime * .05, -uTime * .03));
    col += mix(uCol2, uCol, .4) * hz * uHaze * exp(-r * 1.3) * .55;
  }
  o = vec4(col * uAlpha, 1.);
}`;

  // Een flits van licht met een lichtbundel, een horizontale lensstreep en een sterrenpatroon. Dit is het
  // moment dat het pakje scheurt (en de onthulling van de kaart).
  const FS_LICHT = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake, uCenter; uniform float uZoom, uBundel, uBreed, uStreep, uSter, uRot, uCount, uRegen, uTime;
uniform vec3 uCol;
${GEMEEN}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom - uCenter;
  float r = length(p);
  vec3 wit = mix(uCol, vec3(1.), .7);
  vec3 col = vec3(0.);
  // verticale bundel
  float bw = uBreed * (.4 + .9 * smoothstep(-.8, .8, abs(p.y) * 0.)) ;
  col += wit * uBundel * exp(-p.x * p.x / (bw * bw + 1e-5)) * (.35 + .65 * exp(-abs(p.y) * 1.1));
  // horizontale lensstreep
  col += mix(uCol, vec3(.6, .8, 1.), .55) * uStreep * exp(-p.y * p.y / .00035) * exp(-abs(p.x) * 1.5);
  // sterren
  float a = atan(p.y, p.x + 1e-5);
  float st = pow(max(sin(a * uCount + uRot) * .5 + .5, 0.), 14.) + .6 * pow(max(sin(a * uCount * .5 - uRot * 1.3) * .5 + .5, 0.), 20.);
  vec3 sc = uCol;
  if (uRegen > .5) sc = hsv(vec3(a / 6.2831853 + uTime * .2, .7, 1.));
  col += sc * st * uSter * exp(-r * 1.9);
  col += wit * uBundel * .8 / (1. + 90. * r * r);
  o = vec4(col, 1.);
}`;

  // ───────────────────────── De walkout-arena ─────────────────────────
  // Je staat op het veld en kijkt naar de spelerstunnel in de hoofdtribune. Uit de felle tunnel loopt de
  // leerling door de rook naar je toe, in tegenlicht, terwijl schijnwerpers zwaaien en het publiek flitst.
  // De camera rijdt langzaam naar de tunnel toe (uDolly). uDim dempt de wereld tijdens de grote plaatjes.
  const FS_ARENA = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uTime, uZoom, uLicht, uStap, uAmp, uFlits, uBundel, uAlpha, uRegen, uDolly, uDim, uKw;
uniform vec3 uTint, uTint2;
uniform vec4 uFig;   // x, voeten-y, hoogte, zichtbaar
${GEMEEN}
float cap(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float ell(vec2 p, vec2 c, vec2 r){ vec2 q = (p - c) / r; return (length(q) - 1.) * min(r.x, r.y); }
// De leerling, van voren gezien, met capuchon. q: x -0,5..0,5 en y 0 (voeten) tot 1 (kruin).
float figuur(vec2 q, float ph, float amp){
  float s1 = sin(ph);
  float s2 = sin(ph + 3.14159);
  q.y -= abs(s1) * .012 * amp;
  q.x -= s1 * .010 * amp;
  q = rot2(s1 * .018 * amp) * (q - vec2(0., .5)) + vec2(0., .5);
  float d = ell(q, vec2(0., .915), vec2(.047, .058));
  d = smin(d, cap(q, vec2(0., .865), vec2(0., .83), .021), .02);
  float sch = min(cap(q, vec2(-.02, .825), vec2(-.122, .783), .032), cap(q, vec2(.02, .825), vec2(.122, .783), .032));
  float borst = cap(q, vec2(-.068, .735), vec2(.068, .735), .078);
  float taille = cap(q, vec2(-.05, .60), vec2(.05, .60), .066);
  d = smin(d, smin(smin(sch, borst, .05), taille, .08), .025);
  d = smin(d, cap(q, vec2(-.05, .54), vec2(.05, .54), .068), .04);
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? -1. : 1.;
    float lift = max(0., s == 0 ? s1 : s2) * amp;
    vec2 hip = vec2(sg * .055, .52);
    vec2 knee = vec2(sg * (.06 + .012 * lift), .29 + .065 * lift);
    vec2 ank = vec2(sg * (.062 + .01 * lift), .045 + .12 * lift);
    d = smin(d, cap(q, hip, knee, .052 - .012 * (q.y - .3)), .03);
    d = smin(d, cap(q, knee, ank, .034), .025);
    d = smin(d, ell(q, ank + vec2(sg * .01, -.02), vec2(.048, .026)), .02);
    float sw = (s == 0 ? s2 : s1) * amp;
    vec2 sh = vec2(sg * .15, .785);
    vec2 el = vec2(sg * (.178 + .01 * sw), .645 + .03 * abs(sw));
    vec2 ha = vec2(sg * (.172 + .02 * sw), .51 + .05 * abs(sw));
    d = smin(d, cap(q, sh, el, .032), .025);
    d = smin(d, cap(q, el, ha, .026), .02);
    d = smin(d, ell(q, ha + vec2(0., -.012), vec2(.024, .032)), .015);
  }
  return d;
}
// een volumetrische lichtbundel van o0 in richting ang (breedte w groeit met de afstand), met ruis
float bundel(vec2 p, vec2 o0, float ang, float w, float t){
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 v = p - o0;
  float al = dot(v, dir);
  float dl = dot(v, vec2(-dir.y, dir.x));
  float ww = w * (.15 + al);
  float kern = exp(-dl * dl / (ww * ww));
  float stof = .55 + .45 * vn(vec2(dl / ww * 2. + t * .3, al * 3. - t * .5));
  return kern * stof * smoothstep(0., .08, al) * exp(-al * .55);
}
void main(){
  vec2 p0 = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p0 = (p0 - uShake) / uZoom;
  float asp = uRes.x / uRes.y;
  // de camera rijdt naar de tunnel toe; de achtergrond beweegt minder mee dan de voorgrond (parallax)
  vec2 p = p0 / uDolly;
  vec2 pv = p0 / mix(1., uDolly, .55);
  float L = uLicht;
  float t = uTime;
  vec3 tint = uTint;
  vec3 warm = mix(tint, vec3(1., .93, .8), .55);
  vec3 koelLicht = vec3(.55, .68, 1.);
  const float VLOER = -.06;  // horizon van het veld
  const float MUUR = .075;   // bovenrand van de tunnelmuur
  vec2 TM = vec2(.0, VLOER); // midden onder van de tunnelmond
  vec2 TB = vec2(.095, .135); // halve breedte, hoogte

  // lucht boven het stadion: diep nachtblauw met een warme gloed van de lampen
  vec3 col = mix(vec3(.004, .006, .016), vec3(.012, .018, .045), smoothstep(.5, .1, pv.y));
  col += mix(uTint2, koelLicht, .5) * .05 * exp(-abs(pv.y - .32) * 6.);

  // tribunes: rijen publiek in perspectief (de rijen lopen schuin naar het midden), met telefoons en flitsen
  if (pv.y > MUUR * .9) {
    float yy = pv.y - MUUR;
    float rij = yy * 70. + abs(pv.x) * 9.;
    vec2 cp = vec2(pv.x * 70. / (1. + yy * 1.5), rij);
    vec2 ci = floor(cp);
    float hh = h21(ci);
    vec2 jit = h22(ci + 3.7);
    float dd = length((fract(cp) - (.25 + .5 * jit)) * vec2(1., 1.4));
    float dak = smoothstep(.43, .36, pv.y + abs(pv.x) * .08); // het dak van het stadion
    float trib = smoothstep(0., .02, yy) * dak;
    // de mensen zelf: een zacht flakkerende massa, rijen iets zichtbaar
    float massa = (.5 + .5 * vn(cp * vec2(.7, .5) + t * .3)) * (.6 + .4 * sin(rij * 6.2832));
    col += mix(uTint2, warm, .3) * massa * .035 * trib * (1. + 2. * L) * smoothstep(.45, .1, pv.y);
    float punt = smoothstep(.2, 0., dd) * step(.62, hh) * (.5 + .5 * step(.85, hh)) * (.45 + .55 * sin(t * (1.5 + 4. * h11(ci.x * 3.1 + ci.y)) + hh * 60.));
    float ft = t * 2.6 + hh * 11.;
    float fon = step(1. - uFlits * .1, h21(ci + floor(ft) * 13.7 + 5.1));
    float flits = fon * pow(1. - fract(ft), 6.) * exp(-dd * dd * 30.);
    col += (mix(koelLicht, warm, hh) * punt * .45 + vec3(1., .97, .92) * flits * 2.4) * trib;
    // dakrand met een rij lampen
    float rand = exp(-pow((pv.y + abs(pv.x) * .08 - .395) * 90., 2.));
    float lamp = pow(max(0., sin(pv.x * 60.)), 30.) * rand;
    col += warm * (rand * .04 + lamp * .9) * (.6 + .4 * L);
  }

  // de tunnelmuur en de mond van de tunnel (fel tegenlicht van binnenuit)
  vec2 tq = p - TM;
  float inMuur = step(p.y, MUUR) * step(VLOER, p.y);
  vec3 muur = mix(vec3(.006, .007, .014), vec3(.02, .022, .04), smoothstep(VLOER, MUUR, p.y));
  muur += warm * .05 * exp(-abs(tq.x) * 9.) * L;
  // reclameborden langs de muur: een smalle lichtband die langzaam loopt
  float bord = smoothstep(.003, 0., abs(p.y - (VLOER + .022)) - .01) * step(.16, abs(p.x));
  float led = step(.35, fract(p.x * 140.)) * step(.3, fract(p.y * 900.));
  muur += mix(tint, uTint2, .5 + .5 * sin(p.x * 6. - t * 1.5)) * bord * (.05 + .07 * led) * (.5 + .5 * L);
  col = mix(col, muur, inMuur);
  // de opening: afgeronde boog
  vec2 tb = vec2(abs(tq.x), tq.y);
  float boog = max(tb.x - TB.x, tq.y - TB.y);
  boog = min(boog, length(vec2(tb.x, tq.y - TB.y + .02)) - TB.x * .85);
  boog = max(boog, -tq.y);
  float mond = smoothstep(.0025, -.0025, boog);
  // binnen in de tunnel: wit-heet licht met een kern, en wat licht dat langs de wanden kruipt
  // de tunnel heeft diepte: wanden die naar een kleinere, witte uitgang achterin lopen
  vec2 tk = vec2(tb.x / .42, tq.y / .42);
  float kern = max(tk.x - TB.x, tk.y - TB.y);
  kern = min(kern, length(vec2(tk.x, tk.y - TB.y + .02)) - TB.x * .85);
  float kernM = smoothstep(.01, -.01, kern);
  float wand = 1. - clamp(max(tb.x / TB.x, tq.y / TB.y), 0., 1.); // 0 bij de rand, 1 naar binnen
  float ribbel = .75 + .25 * smoothstep(.2, .8, sin(log(max(.02, 1. - wand)) * 30.));
  vec3 binnen = warm * (.12 + .5 * L) * pow(wand, 1.5) * ribbel + tint * .04 * L;
  binnen = mix(binnen, mix(warm, vec3(1.), .5) * (.7 + 1.1 * L), kernM);
  col = mix(col, binnen, mond);
  // de rand van de boog gloeit (licht dat over de rand valt)
  col += warm * L * .5 * exp(-max(boog, 0.) * 70.) * (1. - mond) * step(VLOER, p.y);
  // een groot halo van het tegenlicht
  col += warm * L * .22 / (1. + 500. * dot(tq - vec2(0., .05), tq - vec2(0., .05)));
  col += tint * L * .12 * exp(-length(tq * vec2(.6, 1.)) * 3.);

  // het veld: glanzend en donker, met maaistroken, de weerspiegeling van de tunnel en lichtvlekken
  if (p.y < VLOER) {
    float dz = VLOER - p.y;
    float diep = 1. / (dz + .015);
    float strook = step(.5, fract(diep * .18 + .0));
    vec3 veld = mix(vec3(.006, .012, .01), vec3(.009, .018, .014), strook);
    // weerspiegeling van de tunnelmond: een verticale streep die naar je toe loopt
    float refl = exp(-pow(p.x / (.07 + dz * .5), 2.)) * exp(-dz * 2.8);
    veld += warm * L * refl * .55;
    // lijnen op het veld
    float lijnX = abs(fract(p.x * diep * .25 + .5) - .5);
    veld += vec3(.6, .65, .7) * smoothstep(.012, 0., lijnX - .0) * .015 * exp(-dz * 2.);
    col = veld;
  }

  // schijnwerpers: vier bundels uit het dak die over het veld zwaaien, met een lichtplas op de grond
  float zw = sin(t * .55);
  float zw2 = sin(t * .43 + 1.7);
  float B = uBundel;
  vec3 bk = mix(tint, vec3(1.), .55);
  if (uRegen > .5) bk = hsv(vec3(t * .08, .5, 1.));
  float bs = bundel(pv, vec2(-asp * .42, .52), -1.2 + .22 * zw, .12, t)
           + bundel(pv, vec2(asp * .42, .52), -1.94 - .22 * zw, .12, t + 3.)
           + .7 * bundel(pv, vec2(-asp * .16, .56), -1.42 + .16 * zw2, .09, t + 7.)
           + .7 * bundel(pv, vec2(asp * .16, .56), -1.72 - .16 * zw2, .09, t + 11.);
  col += bk * bs * .16 * B * (.6 + .5 * L);
  // lichtplassen op het veld onder de bundels
  if (p.y < VLOER) {
    for (int i = 0; i < 2; i++) {
      float sg = i == 0 ? -1. : 1.;
      vec2 c = vec2(sg * (.26 - .12 * zw * sg), -.32);
      vec2 dq = (p - c) * vec2(1., 3.2);
      col += bk * .1 * B * exp(-dot(dq, dq) * 18.);
    }
  }

  // rook: laag over het veld en uit de tunnel, verlicht door het tegenlicht
  float rookM = smoothstep(.22, -.05, p.y) * smoothstep(-.5, -.02, p.y);
  vec2 rp = p * vec2(2.2, 4.) + vec2(t * .05, -t * .02);
  float r1 = fbm(rp);
  float r2 = uKw < 2. ? fbm(rp * 1.9 + vec2(-t * .09, t * .03) + r1) : r1;
  float rook = smoothstep(.35, .9, r1 * .6 + r2 * .5) * rookM;
  float lichtR = .25 + 1.2 * exp(-length((p - vec2(0., VLOER + .02)) * vec2(1.3, 2.4)) * 3.2) * L;
  col += mix(vec3(.08, .09, .14), warm, .6) * rook * lichtR * .5;

  // de leerling
  if (uFig.w > 0.) {
    vec2 q = (p - vec2(uFig.x, uFig.y)) / uFig.z;
    float px = 1.4 / (uRes.y * uFig.z * uDolly);
    // schaduw op het veld: het tegenlicht werpt een lange schaduw naar je toe
    if (q.y < .02) {
      vec2 qs = vec2(q.x / (1. + max(-q.y, 0.) * .4), -q.y * .55);
      float dsh = figuur(qs, uStap, uAmp);
      float sch = smoothstep(.04, -.02, dsh) * exp(q.y * 1.5);
      col *= 1. - .78 * sch * uFig.w;
    }
    if (abs(q.x) < .55 && q.y > -.3 && q.y < 1.12) {
      float d = figuur(q, uStap, uAmp);
      float sil = smoothstep(px, -px, d);
      if (d < .05) {
        // normaal uit het afstandsveld: zo valt het licht op de randen als op iets ronds
        float e = .006;
        vec2 nn = vec2(figuur(q + vec2(e, 0.), uStap, uAmp) - d, figuur(q + vec2(0., e), uStap, uAmp) - d);
        nn = normalize(nn + 1e-6);
        float diepte = clamp(-d * 70., 0., 1.); // 0 aan de rand, 1 diep binnen
        // de stof: bijna zwart, met een koele vulling van voren en een warme glans van achteren
        vec3 stof = vec3(.010, .011, .018);
        stof += koelLicht * .02 * (.4 + .6 * smoothstep(.3, .9, q.y)) * (1. - .5 * diepte);
        float rim = pow(1. - diepte, 3.);
        // volume: een zachte koele vulling van linksboven, zodat het lichaam rond oogt en niet plat
        float bol = clamp(-d * 9., 0., 1.);
        stof += mix(koelLicht, tint, .3) * .05 * (1. - bol) * max(0., dot(nn, normalize(vec2(-.5, .85)))) * (.5 + .5 * B);
        stof += warm * .012 * smoothstep(.55, .95, q.y) * (1. - bol * .5);
        float rimL = rim * (.55 + .45 * max(0., nn.y)) * (1. + .5 * max(0., -nn.x * sign(uFig.x + .001)));
        stof += warm * rimL * L * .9;
        // de spots van boven raken de schouders en het hoofd
        stof += bk * pow(max(0., nn.y), 3.) * clamp(1. + d * 25., 0., 1.) * .12 * B;
        // een kleur-accent van het niveau op de zijkanten
        stof += tint * pow(abs(nn.x), 4.) * rim * .6 * L;
        col = mix(col, stof, sil * uFig.w);
      }
      // gloed rond het silhouet (licht dat om de leerling heen kruipt)
      col += warm * L * exp(-max(d, 0.) * 120.) * (1. - sil) * .16 * uFig.w * smoothstep(-.05, .3, q.y);
    }
    // reflectie in het natte veld
    vec2 qr = vec2(q.x, -q.y - .01);
    if (q.y < 0. && q.y > -.6 && abs(qr.x) < .55) {
      float dr = figuur(qr, uStap, uAmp);
      float silr = smoothstep(px * 4., -px * 4., dr);
      col = mix(col, vec3(.003, .004, .008), silr * .45 * smoothstep(-.6, 0., q.y) * uFig.w);
      col += warm * L * exp(-max(dr, 0.) * 40.) * (1. - silr) * .12 * smoothstep(-.5, 0., q.y) * uFig.w;
    }
  }

  // voorgrond-rook die langs de camera trekt (parallax) en zwevend stof
  if (uKw < 3.) {
    float vr = fbm(p0 * vec2(1.2, 2.) + vec2(t * .12, 0.));
    col += mix(vec3(.05, .06, .1), warm, .3) * smoothstep(.55, .95, vr) * smoothstep(.1, -.5, p0.y) * .25 * (.4 + .6 * L);
  }

  // dempen voor de grote plaatjes, plus een zachte vignet naar het midden
  col *= mix(1., .18, uDim);
  col *= 1. - .35 * smoothstep(.35, .95, length(p0 * vec2(.8, 1.2)));
  o = vec4(col * uAlpha, 1.);
}`;

  // ───────────────────────── Voorwerpen in de ruimte (pakje, kaart, plaatjes) ─────────────────────────
  // Gedeeld: plaatsing en perspectief worden in de vertex-shader gedaan, zodat JavaScript alleen
  // een paar getallen per voorwerp hoeft door te geven.
  const OBJ_GEMEEN = `
uniform vec3 uPos; uniform vec3 uRot; uniform vec2 uScl; uniform vec2 uPivot;
uniform vec3 uCamPos; uniform float uRoll, uAspect, uF;
mat3 rx(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 ry(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rz(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
mat3 draai(){ return rz(uRot.z) * rx(uRot.x) * ry(uRot.y); }
vec3 naarWereld(vec3 l, mat3 R){ return uPos + R * (vec3((l.xy - uPivot) * uScl, l.z)); }
vec4 projecteer(vec3 w){
  vec3 c = w - uCamPos;
  float cr = cos(uRoll), sr = sin(uRoll);
  c.xy = vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y);
  return vec4(c.x * uF / uAspect, c.y * uF, 0., -c.z);
}`;

  const VS_VLAK = `${KOP}
${OBJ_GEMEEN}
out vec2 vUv; out vec3 vN; out vec3 vWp;
void main(){
  vec2 g = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 loc = vec2(g.x - .5, .5 - g.y);
  vUv = g;
  mat3 R = draai();
  vec3 w = naarWereld(vec3(loc, 0.), R);
  vN = R * vec3(0., 0., 1.);
  vWp = w;
  gl_Position = projecteer(w);
}`;

  // Het pakje is een raster dat als een kussen bol staat (uBol).
  const VS_PAK = `${KOP}
${OBJ_GEMEEN}
uniform float uBol; uniform ivec2 uRaster;
out vec2 vUv; out vec3 vN; out vec3 vWp;
float hoogte(vec2 g){
  float bx = 1. - pow(abs(2. * g.x - 1.), 2.4);
  float by = smoothstep(0., .13, g.y) * smoothstep(1., .87, g.y);
  return uBol * pow(max(bx, 0.), .6) * by;
}
void main(){
  int q = gl_VertexID / 6; int k = gl_VertexID - q * 6;
  int qy = q / uRaster.x; int qx = q - qy * uRaster.x;
  int cx = (k == 1 || k == 3 || k == 4) ? 1 : 0;
  int cy = (k == 2 || k == 4 || k == 5) ? 1 : 0;
  vec2 g = vec2(float(qx + cx) / float(uRaster.x), float(qy + cy) / float(uRaster.y));
  vec2 loc = vec2(g.x - .5, .5 - g.y);
  float z = hoogte(g);
  vUv = g;
  mat3 R = draai();
  vec3 w = naarWereld(vec3(loc, z), R);
  float e = .01;
  float dzx = (hoogte(g + vec2(e, 0.)) - hoogte(g - vec2(e, 0.))) / (2. * e * uScl.x);
  float dzy = -(hoogte(g + vec2(0., e)) - hoogte(g - vec2(0., e))) / (2. * e * uScl.y);
  vN = R * normalize(vec3(-dzx, -dzy, 1.));
  vWp = w;
  gl_Position = projecteer(w);
}`;

  const FS_PAK = `${KOP}
in vec2 vUv; in vec3 vN; in vec3 vWp; out vec4 o;
uniform sampler2D uTex;
uniform float uDeel, uScheurY, uLaad, uTime, uSeed, uAlpha, uRand, uGlans;
uniform vec3 uCol, uCol2, uCamPos; uniform vec2 uKantel;
${GEMEEN}
void main(){
  float jag = (vn(vec2(vUv.x * 22. + uSeed, uSeed)) * 2. - 1.) * .012 + (vn(vec2(vUv.x * 80. + uSeed * 3., 1.7)) - .5) * .007;
  float rand = vUv.y - (uScheurY + jag);
  if (uDeel > .5 && uDeel < 1.5 && rand > 0.) discard;
  if (uDeel > 1.5 && rand < 0.) discard;
  vec4 t = texture(uTex, vUv);
  if (t.a < .01) discard;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWp);
  vec3 L = normalize(vec3(.45 + uKantel.x * .5, .7 - uKantel.y * .3, 1.));
  float luma = dot(t.rgb, vec3(.299, .587, .114));
  float metaal = smoothstep(.3, .75, luma);
  float diff = .66 + .5 * max(dot(N, L), 0.);
  vec3 col = t.rgb * diff;
  // folie: scherpe weerspiegeling en een regenboog-glans die met de hoek meebeweegt
  float spec = pow(max(dot(reflect(-L, N), V), 0.), mix(30., 90., metaal)) * (.2 + .8 * metaal);
  float band = dot(N.xy, vec2(.8, .6)) * 3.2 + vUv.y * 1.8 + uTime * .12 + uKantel.x * .6;
  vec3 regenboog = .5 + .5 * cos(6.2831853 * (band + vec3(0., .33, .67)));
  col += regenboog * (.08 + .22 * metaal) * (.4 + 1.6 * length(N.xy));
  col += vec3(1., .97, .92) * spec;
  // glanzende veeg die over het pakje trekt
  float veeg = exp(-pow((vUv.x * .7 + vUv.y * .5 - uGlans) * 7., 2.));
  col += vec3(1.) * veeg * (.2 + .45 * metaal);
  // rand in de kleur van het niveau
  float fres = pow(1. - abs(dot(N, V)), 3.);
  col += uCol * fres * (.3 + 1.0 * uLaad) * uRand + vec3(.45, .6, 1.) * fres * .3;
  // licht dat uit de naad lekt terwijl het pakje oplaadt
  float lek = exp(-abs(rand) * (95. - 30. * uLaad)) * uLaad;
  col += mix(uCol, vec3(1.), .55) * lek * 1.5 + uCol * exp(-abs(rand) * 9.) * uLaad * uLaad * .35;
  col += uCol * uLaad * uLaad * .12;
  // gescheurde rand: witte folie-vezels
  if (uDeel > .5) {
    float ed = abs(rand);
    float vezel = smoothstep(.016, .0, ed) * (.6 + .4 * vn(vec2(vUv.x * 150., vUv.y * 40.)));
    col = mix(col, vec3(.95, .97, 1.) * 1.1, vezel);
    col += mix(uCol, vec3(1.), .6) * smoothstep(.03, 0., ed) * 1.5;
  }
  o = vec4(col * t.a, t.a) * uAlpha;
}`;

  // De kaart: drie lagen met parallax, een folie-effect en een glinstering die met de kijkhoek meebeweegt.
  const FS_KAART = `${KOP}
in vec2 vUv; in vec3 vN; in vec3 vWp; out vec4 o;
uniform sampler2D uBG, uMid, uFG, uMasker, uAchter, uCijfer;
uniform vec2 uKantel; uniform vec4 uCijferRect;
uniform float uTime, uHolo, uGlitter, uVeeg, uGlow, uAlpha, uPop, uTier, uHelder, uFolie;
uniform vec3 uCol, uCol2, uCamPos;
${GEMEEN}
void main(){
  bool voor = gl_FrontFacing;
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vWp);
  if (!voor) {
    vec2 bu = vec2(1. - vUv.x, vUv.y);
    vec4 b = texture(uAchter, bu);
    float sp = pow(max(dot(reflect(-normalize(vec3(.4, .6, 1.)), -N), V), 0.), 30.);
    vec3 cb = b.rgb * (.75 + .25 * abs(N.z)) + vec3(1.) * sp * .35 * b.a;
    cb += uCol * pow(1. - abs(dot(N, V)), 3.) * .5;
    o = vec4(cb, b.a) * uAlpha;
    return;
  }
  vec2 uv = vUv;
  vec2 t = uKantel;
  int T = int(uTier + .5);
  vec4 bg = texture(uBG, uv);
  vec2 uvM = uv + t * vec2(-.010, .008);
  vec2 uvF = uv + t * vec2(-.020, .016);
  vec4 mid = texture(uMid, uvM);
  vec4 fg = texture(uFG, uvF);
  vec3 m = texture(uMasker, uv).rgb;
  vec3 col = bg.rgb;
  float lm = dot(col, vec3(.299, .587, .114));

  // reliëf van de lijst, de rand van het embleem en de klinknagels of parels: licht dat meekijkt met je muis
  vec2 px = 1. / vec2(textureSize(uMasker, 0));
  float h0 = m.b;
  float hx = texture(uMasker, uv + vec2(px.x * 1.5, 0.)).b;
  float hy = texture(uMasker, uv + vec2(0., px.y * 1.5)).b;
  vec3 bn = normalize(vec3((h0 - hx) * 10., (hy - h0) * 10., 1.));
  vec3 Ld = normalize(vec3(-.35 + t.x * .6, .55 - t.y * .55, .75));
  float dif = dot(bn, Ld) - Ld.z;
  col *= 1. + dif * 1.5;
  vec3 Hh = normalize(Ld + vec3(0., 0., 1.));
  float spc = max(pow(max(dot(bn, Hh), 0.), 48.) - pow(Hh.z, 48.), 0.);
  float spk = T == 1 ? 1.3 : (T == 0 ? .55 : (T == 3 ? .8 : .95));
  col += mix(vec3(1., .97, .9), uCol, .12) * spc * spk * 1.6 * bg.a;

  // folie: een kleur die met de hoek meebeweegt, alleen op de patronen, de lijst en het embleem
  float ang = dot(t, vec2(.9, .6)) * 1.1 + uv.x * 1.5 - uv.y * 1.9 + uTime * .04;
  vec3 rb = .5 + .5 * cos(6.2831853 * (ang + vec3(0., .33, .67)));
  vec3 fk = T == 0 ? vec3(1., .74, .44) : (T == 1 ? vec3(.7, .86, 1.) : (T == 2 ? vec3(1., .86, .5) : (T == 3 ? vec3(.3, .8, 1.) : vec3(1.))));
  float rf = T == 0 ? .15 : (T == 1 ? .4 : (T == 2 ? .5 : (T == 3 ? .55 : 1.)));
  vec3 holo = mix(fk * (.55 + .45 * rb.g), rb, rf);
  col += holo * m.r * uHolo * .34 * bg.a;

  // een brede baan licht die over het metaal glijdt als je de kaart kantelt
  float ps = uv.x * .6 + uv.y * .9 + t.x * 1.1 - t.y * .7;
  float bnd = exp(-pow(fract(ps * .55 + .1) * 2. - 1., 2.) * 14.);
  vec3 sk = T == 0 ? vec3(1., .72, .42) : (T == 1 ? vec3(.82, .92, 1.) : (T == 2 ? vec3(1., .9, .55) : (T == 3 ? uCol : rb)));
  float sw0 = T == 1 ? .3 : (T == 2 ? .24 : (T == 0 ? .17 : (T == 3 ? .12 : .2)));
  col += sk * bnd * sw0 * (.3 + lm) * bg.a;

  // speciaal: de lijnen pulseren; icoon: parelmoer dat van kleur wisselt
  if (T == 3) {
    float pl = .5 + .5 * sin(uTime * 2.4 - (uv.x * 5. + uv.y * 7.));
    col += uCol * m.r * (.1 + .55 * pl * pl * pl) * bg.a;
  } else if (T == 4) {
    float fb = vn(uv * 4. + t * 1.5);
    vec3 ir = .5 + .5 * cos(6.2831853 * (fb * .8 + ang * .7 + vec3(0., .33, .67)));
    col += (ir - .5) * .14 * min(uHolo, 1.2) * bg.a * (.4 + lm);
  }

  // de veeg die schuin over de kaart glijdt
  float sw = uv.x * .8 + uv.y * .6;
  float veeg = exp(-pow((sw - uVeeg) * 12., 2.));
  col += vec3(1., .97, .9) * veeg * (.16 + .5 * m.r) * bg.a;
  col += vec3(1.) * exp(-pow((sw - uVeeg * .6 - .25) * 20., 2.)) * .12 * m.r;

  // glinsteringen: kleine sterretjes die met je hoek aan en uit gaan
  vec2 gp = uv * vec2(150., 220.);
  vec2 gc = floor(gp);
  vec2 gd = fract(gp) - .5 - (h22(gc + 7.) - .5) * .5;
  float gh = h21(gc);
  float spark = step(.965, gh) * pow(.5 + .5 * sin(uTime * 2.6 + gh * 90. + (t.x * 5. + t.y * 3.) * (1. + gh * 2.)), 14.);
  float core = exp(-dot(gd, gd) * 60.);
  float kruis = (exp(-abs(gd.x) * 28. - abs(gd.y) * 4.) + exp(-abs(gd.y) * 28. - abs(gd.x) * 4.)) * .6;
  col += (vec3(1., .96, .85) * (core + kruis) * 1.8 + hsv(vec3(gh * 7. + ang, .6, 1.)) * core * .6) * spark * m.g * uGlitter * bg.a;

  // zeldzaam: holografische folie over de hele kaart. De regenboog hangt aan de weerkaatsing, dus als de kaart
  // ronddraait loopt hij over het hele oppervlak, met diffractiestrepen en een scherpe glans.
  if (uFolie > .001) {
    vec3 Rf = reflect(-V, N);
    float ph = uv.x * .85 - uv.y * .6 + Rf.x * 1.7 + Rf.y * 1.2 + t.x * .5 + uTime * .06;
    vec3 fr = .5 + .5 * cos(6.2831853 * (ph + vec3(0., .33, .67)));
    float strip = .5 + .5 * sin((uv.x + uv.y * 1.3) * 46. + Rf.x * 11.);
    float glare = exp(-pow((fract(ph * .55) - .5) * 5., 2.));
    col = mix(col, col * (.5 + 1.1 * fr), (.28 + .3 * strip) * uFolie * (.6 + .4 * bg.a)) + fr * glare * .4 * uFolie * (.25 + lm);
    col += vec3(1., .96, .88) * pow(max(dot(Rf, normalize(vec3(.3, .5, .8))), 0.), 36.) * .8 * uFolie;
    col += hsv(vec3(ph * 2., .7, 1.)) * exp(-pow((fract(ph * 1.7 + uTime * .1) - .5) * 9., 2.)) * .22 * uFolie * m.r;
  }

  col = mid.rgb + col * (1. - mid.a);
  // de teksten werpen een zachte schaduw: ze zweven net boven het metaal
  col *= 1. - .3 * texture(uFG, uvF - vec2(.0016, .0026)).a * (1. - fg.a);
  col = fg.rgb + col * (1. - fg.a);

  // het cijfer, dat tijdens het optellen opspringt
  vec2 rc = (uCijferRect.xy + uCijferRect.zw) * .5;
  vec2 ru = (uv - rc) / uPop + rc + t * vec2(-.026, .02);
  if (ru.x > uCijferRect.x && ru.x < uCijferRect.z && ru.y > uCijferRect.y && ru.y < uCijferRect.w) {
    vec2 cu = (ru - uCijferRect.xy) / (uCijferRect.zw - uCijferRect.xy);
    vec4 c = texture(uCijfer, cu);
    float sa = texture(uCijfer, cu - vec2(.014, .02)).a;
    col *= 1. - .3 * sa * (1. - c.a);
    col = c.rgb + col * (1. - c.a);
  }

  // diepte: donkerder naar de rand, rijkere tinten en een zachte lichtvlek die met je muis meebeweegt
  float vgn = smoothstep(.0, .95, 1. - length((uv - .5) * vec2(1.25, 1.) * 1.45));
  col *= .8 + .22 * vgn;
  col = pow(max(col, 0.), vec3(1.08)) * 1.04;
  vec2 lp = vec2(.5 + t.x * -.45, .35 + t.y * .35);
  col += vec3(1., .96, .85) * exp(-dot(uv - lp, uv - lp) * 7.) * .07 * bg.a;
  float fres = pow(1. - abs(dot(N, V)), 3.);
  col += uCol * fres * .35 * uGlow;
  col *= uHelder;
  o = vec4(col * bg.a, bg.a) * uAlpha;
}`;

  // Platte, getextureerde vlakken: vliegende tekst, plaatjes, titel.
  const FS_PLAAT = `${KOP}
in vec2 vUv; in vec3 vN; in vec3 vWp; out vec4 o;
uniform sampler2D uTex;
uniform float uAlpha, uVeeg, uOptel, uTime, uGlitch, uHue, uRGB;
uniform vec3 uTint;
void main(){
  vec2 uv = vUv;
  // glitch: even verschoven strepen
  if (uGlitch > 0.) uv.x += (fract(sin(floor(uv.y * 40.) * 91.7 + floor(uTime * 20.)) * 4375.5) - .5) * .04 * uGlitch;
  vec4 t = texture(uTex, uv);
  // kleurverschuiving: rood en blauw komen uit een iets verschoven plek
  if (uRGB > 0.) {
    vec4 tr = texture(uTex, uv + vec2(.012 * uRGB, 0.));
    vec4 tb = texture(uTex, uv - vec2(.012 * uRGB, 0.));
    t = vec4(tr.r, t.g, tb.b, max(t.a, max(tr.a, tb.a)));
  }
  // de tint van de regenboog draait langzaam rond (kleurwiel, behoudt de helderheid)
  if (uHue != 0.) {
    float cs = cos(uHue), sn = sin(uHue);
    const vec3 k = vec3(.57735);
    t.rgb = t.rgb * cs + cross(k, t.rgb) * sn + k * dot(k, t.rgb) * (1. - cs);
  }
  // veeg van links naar rechts (met een schuine, felle rand)
  float k = uv.x + (uv.y - .5) * .35;
  float zicht = smoothstep(uVeeg, uVeeg - .04, k);
  float rand = exp(-pow((k - uVeeg) * 26., 2.));
  vec3 c = t.rgb * zicht + uTint * rand * t.a * 2.;
  o = vec4(c * uAlpha, t.a * zicht * uAlpha * (1. - uOptel));
}`;

  // ───────────────────────── Deeltjes ─────────────────────────
  // Elk deeltje wordt op de videokaart uitgerekend uit zijn nummer en de tijd: geen buffers, geen
  // berekeningen op de processor, dus ook duizenden deeltjes geven geen haperingen.
  const VS_DEELTJES = `${KOP}
uniform float uTime, uAspect, uT0, uLife, uDelay, uDrag, uAngle, uSpread, uAlpha, uSeed, uRegen;
uniform int uMode, uPer;
uniform vec2 uOrg, uSpd, uGrav, uSize, uCam;
uniform vec3 uCol1, uCol2;
uniform vec4 uFw[16];
out vec2 vQ; out vec4 vC; flat out int vK;
${GEMEEN}
uint pcg(uint v){ uint s = v * 747796405u + 2891336653u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float R(uint id, uint k){ return float(pcg(id * 1664525u + k * 1013904223u + uint(uSeed * 1000.))) * (1. / 4294967295.); }
void main(){
  uint id = uint(gl_InstanceID);
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2. - 1.;
  float r0 = R(id, 1u), r1 = R(id, 2u), r2 = R(id, 3u), r3 = R(id, 4u), r4 = R(id, 5u), r5 = R(id, 6u), r6 = R(id, 7u);
  float t0 = uT0;
  float hue = -1.;
  uint fk = id;
  if (uMode == 4) {
    int fi = int(id) / uPer;
    fk = id - uint(fi * uPer);
    vec4 f = uFw[fi];
    t0 = f.z; hue = f.w;
    r0 = R(fk, 1u); r1 = R(fk, 2u); r2 = R(fk, 3u); r3 = R(fk, 4u); r5 = R(fk, 6u);
  }
  float age = uTime - t0 - r4 * uDelay;
  float life = uLife * (.55 + .45 * r0);
  vK = 0; vQ = c; vC = vec4(0.);
  gl_Position = vec4(2., 2., 2., 1.);
  if (age < 0. || age > life || t0 < -50.) return;
  float u = age / life;
  vec2 pos = uOrg; vec2 off = vec2(0.);
  vec3 col = mix(uCol1, uCol2, r5);
  float alpha = 0.;

  if (uMode == 0) {
    // vonken: vliegen weg, vertragen, vallen en trekken een streepje
    float a = uAngle + (r1 - .5) * uSpread;
    float sp = mix(uSpd.x, uSpd.y, pow(r2, .55));
    vec2 v0 = vec2(cos(a), sin(a)) * sp;
    float k = max(uDrag, .001);
    float e = (1. - exp(-k * age)) / k;
    pos = uOrg + v0 * e + uGrav * (age - e) / k;
    vec2 vel = v0 * exp(-k * age) + uGrav * e;
    float s = length(vel);
    vec2 dir = vel / (s + 1e-4);
    float sz = mix(uSize.x, uSize.y, r3);
    off = dir * c.x * (sz + clamp(s * .03, 0., .07)) + vec2(-dir.y, dir.x) * c.y * sz;
    alpha = (1. - u) * (1. - u) * (.7 + .3 * sin(age * 31. + r5 * 40.));
    if (uRegen > .5) col = hsv(vec3(r5 + uTime * .15, .75, 1.));
    vK = 1;
  } else if (uMode == 1) {
    // stof en bokeh: langzaam zwevende lichtjes door het hele beeld
    vec2 base = vec2((r1 - .5) * uAspect * 1.2, (r2 - .5) * 1.2);
    vec2 drift = vec2((r3 - .5) * .05, .018 + .05 * r5);
    pos = base + drift * age * .8;
    pos.y = mod(pos.y + .6, 1.2) - .6;
    float sz = mix(uSize.x, uSize.y, r3 * r3);
    off = c * sz;
    alpha = smoothstep(0., .15, u) * smoothstep(1., .75, u) * (.4 + .6 * sin(age * (1. + 3. * r5) + r6 * 30.) * sin(age * (1. + 3. * r5) + r6 * 30.));
    vK = 3;
    if (uRegen > .5) col = hsv(vec3(r5 + uTime * .05, .6, 1.));
  } else if (uMode == 2 || uMode == 5) {
    // confetti en snippers: vallen, draaien en klappen om
    float a = uAngle + (r1 - .5) * uSpread;
    vec2 v0 = vec2(cos(a), sin(a)) * mix(uSpd.x, uSpd.y, r2);
    float k = max(uDrag, .001);
    float e = (1. - exp(-k * age)) / k;
    pos = uOrg + v0 * e + uGrav * (age - e) / k;
    if (uMode == 2) { pos.x += (r1 - .5) * uAspect * 1.1; pos.x += sin(age * (2. + 3. * r3) + r5 * 20.) * .02; }
    float rt = r3 * 6.2831853 + age * (3. + 8. * r5);
    float flip = cos(age * (4. + 7. * r6) + r2 * 30.);
    vec2 q = vec2(c.x * mix(uSize.x, uSize.y, r3), c.y * mix(uSize.x, uSize.y, r3) * .55 * flip);
    off = rot2(rt) * q;
    alpha = smoothstep(1., .85, u) * smoothstep(0., .02, u);
    float sh = .65 + .35 * flip;
    if (uMode == 2) { float pk = fract(r6 * 7.3); col = (uRegen > .5 ? hsv(vec3(r5, .7, 1.)) : pk < .45 ? mix(uCol1, uCol2, r5) * 1.15 : pk < .75 ? vec3(1., .96, .88) : hsv(vec3(fract(r5 + .55), .5, 1.))) * (.5 + .6 * sh); alpha *= .9; } else col = col * (.7 + .5 * abs(flip));
    vK = 2;
  } else if (uMode == 3) {
    // regen
    pos = vec2((r1 - .5) * uAspect * 1.25, .6 - mod(age * (.9 + .8 * r2) + r3, 1.25));
    pos.x += (pos.y + .6) * .12;
    off = vec2(c.x * .0009, c.y * (.02 + .03 * r5));
    off = rot2(.12) * off;
    alpha = .35 * smoothstep(0., .1, u) * smoothstep(1., .8, u);
    col = vec3(.6, .7, .9);
    vK = 0;
  } else if (uMode == 4) {
    // vuurwerk: een pijl omhoog, dan een bol van vonken
    vec4 f = uFw[int(id) / uPer];
    float tl = .55;
    float h = hue;
    vec3 fc = hsv(vec3(h, .8, 1.));
    if (age < tl) {
      if (fk > 5u) return;
      float pr = age / tl;
      float tr = max(pr - float(fk) * .035, 0.);
      pos = vec2(f.x + (r1 - .5) * .01, mix(-.6, f.y, 1. - pow(1. - tr, 2.)));
      off = c * .006;
      alpha = (1. - float(fk) / 6.) * .9;
      col = vec3(1., .85, .5);
      vK = 3;
    } else {
      float ba = age - tl;
      float a = r1 * 6.2831853;
      float sp = (.12 + .34 * sqrt(r2)) * (1. + .15 * sin(r3 * 6.));
      vec2 v0 = vec2(cos(a), sin(a)) * sp;
      float k = 1.6;
      float e = (1. - exp(-k * ba)) / k;
      pos = vec2(f.x, f.y) + v0 * e + vec2(0., -.05) * (ba - e) / k;
      vec2 vel = v0 * exp(-k * ba) + vec2(0., -.05) * e;
      float s = length(vel);
      vec2 dir = vel / (s + 1e-4);
      float sz = .0022 + .0022 * r3;
      off = dir * c.x * (sz + clamp(s * .05, 0., .05)) + vec2(-dir.y, dir.x) * c.y * sz;
      alpha = pow(max(1. - ba / (life - tl), 0.), 1.5) * (.7 + .3 * sin(ba * 40. + r5 * 50.));
      col = mix(fc, vec3(1.), r5 * .45);
      vK = 1;
    }
  } else if (uMode == 7) {
    // 3D-confetti: echte rechthoekjes die om alle assen tuimelen, met perspectief, diepte, schaduw en een metalen glans
    float a = uAngle + (r1 - .5) * uSpread;
    vec2 v0 = vec2(cos(a), sin(a)) * mix(uSpd.x, uSpd.y, r2);
    float k = max(uDrag, .001);
    float e = (1. - exp(-k * age)) / k;
    float diep = r6;                                   // 0 = ver weg, 1 = vlak voor de camera
    pos = uOrg + v0 * e + uGrav * (age - e) / k * (.6 + .8 * diep);
    if (uPer == 2) pos.x += (fract(r5 * 7.31 + r2 * 3.7) - .5) * uAspect * 1.15; // regen over de hele breedte
    pos.x += sin(age * (1.2 + 2.5 * r3) + r5 * 20.) * (.02 + .05 * diep);
    float ax = r1 * 6.2831853 + age * (3. + 9. * r5);
    float ay = r2 * 6.2831853 + age * (2. + 8. * r3);
    float az = r3 * 6.2831853 + age * (1. + 4. * r6);
    mat3 Rx = mat3(1., 0., 0., 0., cos(ax), sin(ax), 0., -sin(ax), cos(ax));
    mat3 Ry = mat3(cos(ay), 0., -sin(ay), 0., 1., 0., sin(ay), 0., cos(ay));
    mat3 Rz = mat3(cos(az), sin(az), 0., -sin(az), cos(az), 0., 0., 0., 1.);
    float lint = step(.82, fract(r6 * 13.7));          // een deel zijn lange linten
    vec3 q3 = Rz * Ry * Rx * vec3(c.x * (lint > .5 ? .35 : 1.), c.y * (lint > .5 ? 3.2 : .62), 0.);
    float sz = mix(uSize.x, uSize.y, r0) * (.55 + .95 * diep);
    float persp = 1. / (1. - q3.z * sz * 3.);
    off = q3.xy * sz * persp;
    vec3 nrm = Rz * Ry * Rx * vec3(0., 0., 1.);
    float licht = .45 + .55 * abs(nrm.z);
    float spec = pow(abs(dot(nrm, normalize(vec3(.35, .55, .75)))), 22.);
    float pk = fract(r5 * 9.3);
    vec3 bas = uRegen > .5 ? hsv(vec3(fract(r5 * 3. + age * .15), .72, 1.)) : (pk < .5 ? mix(uCol1, uCol2, r3) : hsv(vec3(fract(r5 * 5.1), .65, 1.)));
    col = bas * licht * (.65 + .6 * diep) + vec3(1., .96, .9) * spec * .9;
    alpha = smoothstep(1., .9, u) * smoothstep(0., .04, u) * (.55 + .45 * diep);
    vK = 2;
  } else if (uMode == 8) {
    // zachte vlokken of stofjes die rustig vallen (sneeuw) of opstijgen (uGrav.y > 0), met zwiepende beweging en diepte
    float diep = r6;
    float sp = (.04 + .09 * diep) * mix(uSpd.x, uSpd.y, r2);
    float span = 1.35;
    float yy = mod(r3 * span + age * uGrav.y * sp * 6. * (.5 + diep), span) - span * .5;
    pos = vec2((r1 - .5) * uAspect * 1.25 + sin(age * (.4 + .8 * r5) + r4 * 30.) * (.03 + .05 * diep) + uGrav.x * age * sp * 3., yy + uOrg.y);
    float sz = mix(uSize.x, uSize.y, r0 * r0) * (.4 + 1.1 * diep);
    off = c * sz;
    alpha = smoothstep(0., 1.2, age) * smoothstep(life, life - 1., age) * (.35 + .65 * diep) * (.7 + .3 * sin(age * (1.5 + 3. * r5) + r6 * 20.));
    vK = 4;
  } else if (uMode == 6) {
    // rook: grote, zachte, donkere wolken die opstijgen
    pos = uOrg + vec2((r1 - .5) * .3, 0.) + vec2((r1 - .5) * .12, .06 + .12 * r2) * age;
    float sz = mix(uSize.x, uSize.y, r3) * (.5 + 1.4 * u);
    off = c * sz;
    alpha = smoothstep(0., .08, u) * (1. - u) * .5;
    col = mix(uCol1, uCol2, r5);
    vK = 4;
  }
  vec2 q = pos + off + uCam;
  gl_Position = vec4(q.x * 2. / uAspect, q.y * 2., 0., 1.);
  vQ = c;
  vC = vec4(col, alpha * uAlpha);
}`;

  const FS_DEELTJES = `${KOP}
in vec2 vQ; in vec4 vC; flat in int vK; out vec4 o;
void main(){
  float a;
  if (vK == 1) {
    a = (1. - smoothstep(.25, 1., abs(vQ.y))) * (1. - smoothstep(.55, 1., abs(vQ.x)));
    a = a * a * 1.4;
  } else if (vK == 0) {
    a = max(1. - length(vQ), 0.); a *= a;
  } else if (vK == 3) {
    float d = length(vQ);
    a = smoothstep(1., .88, d) * (.35 + .65 * smoothstep(.55, .95, d)) ;
  } else if (vK == 4) {
    a = max(1. - length(vQ), 0.); a = a * a * (3. - 2. * a);
  } else {
    a = 1.;
  }
  o = vec4(vC.rgb * vC.a * a, vC.a * a);
}`;

  SPO.shaders = {
    KOP, GEMEEN, OBJ_GEMEEN,
    VS_VOL, FS_NEER, FS_OP, FS_POST, FS_WARP, FS_STRALEN, FS_LICHT, FS_ARENA,
    VS_VLAK, VS_PAK, FS_PAK, FS_KAART, FS_PLAAT, VS_DEELTJES, FS_DEELTJES,
  };
})();
