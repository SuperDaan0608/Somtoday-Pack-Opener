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

  float ring = 0.;
  for (int i = 0; i < 3; i++) {
    vec4 s = uShock[i];
    if (s.w > 0.) {
      vec2 d = (uv - s.xy) * asp;
      float r = length(d);
      float x = (r - s.z) / uShockW;
      float k = exp(-x * x) * s.w;
      uv += normalize(d + vec2(1e-4)) / asp * k * .03;
      ring += exp(-x * x * 5.) * s.w;
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

  col += texture(uBloom, uv).rgb * uBloomAmt;
  if (uStreakAmt > .001) {
    vec3 st = vec3(0.);
    for (int i = -7; i <= 7; i++) {
      float w = exp(-abs(float(i)) * .32);
      st += texture(uStreak, uv + vec2(float(i) * uStreakTexel * 1.6, 0.)).rgb * w;
    }
    col += st * uStreakCol * uStreakAmt * .1;
  }
  col += uShockCol * ring * .35;

  // kleurcorrectie en vignet
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, uSat) * uGrade;
  vec2 vc = (vUv - .5) * vec2(1.05, 1.);
  float v = smoothstep(.28, .98, length(vc * vec2(asp.x * .62, 1.)));
  col = mix(col, col * (1. - uVig) + uVigCol * uVig * .09, v);
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
  const FS_ARENA = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uTime, uZoom, uLicht, uStap, uAmp, uFlits, uBundel, uAlpha, uRegen;
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
  float d = ell(q, vec2(0., .915), vec2(.050, .060));
  d = smin(d, cap(q, vec2(0., .865), vec2(0., .83), .022), .02);
  d = smin(d, ell(q, vec2(0., .866), vec2(.068, .042)), .03);
  float sch = cap(q, vec2(-.125, .795), vec2(.125, .795), .036);
  float borst = cap(q, vec2(-.07, .735), vec2(.07, .735), .08);
  float taille = cap(q, vec2(-.045, .60), vec2(.045, .60), .075);
  d = smin(d, smin(smin(sch, borst, .05), taille, .08), .02);
  d = smin(d, cap(q, vec2(-.045, .545), vec2(.045, .545), .07), .04);
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? -1. : 1.;
    float lift = max(0., s == 0 ? s1 : s2) * amp;
    vec2 hip = vec2(sg * .052, .53);
    vec2 knee = vec2(sg * (.062 + .012 * lift), .30 + .065 * lift);
    vec2 ank = vec2(sg * (.066 + .01 * lift), .05 + .12 * lift);
    d = smin(d, cap(q, hip, knee, .05), .03);
    d = smin(d, cap(q, knee, ank, .036), .03);
    d = smin(d, ell(q, ank + vec2(sg * .008, -.022), vec2(.05, .03)), .02);
    float sw = (s == 0 ? s2 : s1) * amp;
    vec2 sh = vec2(sg * .158, .78);
    vec2 el = vec2(sg * (.185 + .01 * sw), .64 + .035 * abs(sw));
    vec2 ha = vec2(sg * (.18 + .015 * sw), .50 + .06 * abs(sw));
    d = smin(d, cap(q, sh, el, .03), .02);
    d = smin(d, cap(q, el, ha, .026), .02);
    d = smin(d, length(q - ha) - .03, .015);
  }
  return d;
}
float straal(vec2 p, vec2 o0, float ang, float w){
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 v = p - o0;
  float al = dot(v, dir);
  float dl = abs(dot(v, vec2(-dir.y, dir.x)));
  float ww = w * (1. + al * .9);
  return exp(-dl * dl / (ww * ww)) * smoothstep(0., .25, al) * exp(-al * .9);
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  float asp = uRes.x / uRes.y;
  vec2 VP = vec2(0., .07);
  vec3 wit = mix(uTint, vec3(1.), .6);

  // lucht en tribune
  vec3 col = mix(vec3(.005, .008, .02), vec3(.02, .03, .07), smoothstep(-.1, .55, p.y));
  col += uTint2 * .03 * exp(-length(p - VP) * 1.5);

  // publiek: lichtjes en camera-flitsen links, rechts en bovenin
  vec2 cp = p * 58.;
  vec2 ci = floor(cp);
  float hh = h21(ci);
  vec2 jit = h22(ci + 3.7);
  float dd = length(fract(cp) - (.25 + .5 * jit));
  float tribune = smoothstep(.1, .5, abs(p.x) / asp * 2. + max(p.y - .05, 0.) * .9) * smoothstep(-.12, .12, p.y - VP.y + .05);
  float punt = smoothstep(.2, 0., dd) * step(.86, hh) * (.35 + .35 * sin(uTime * (2. + 5. * h11(ci.x * 3.1 + ci.y)) + hh * 60.));
  float ft = uTime * 3. + hh * 11.;
  float fon = step(1. - uFlits * .12, h21(ci + floor(ft) * 13.7 + 5.1));
  float flits = fon * pow(1. - fract(ft), 5.) * exp(-dd * dd * 40.);
  col += (vec3(.55, .6, .8) * punt * .5 + vec3(1., .97, .9) * flits * 3.2) * tribune;

  // gloed van het tegenlicht aan het eind van de tunnel
  vec2 e = (p - VP) * vec2(1., 1.2);
  float L = uLicht;
  col += wit * L * .9 / (1. + 110. * dot(e, e));
  col += uTint * L * .45 * exp(-length(e) * 2.3);

  // lichtbundels van de schijnwerpers en vanuit de tunnel
  float sw = sin(uTime * .6);
  float beams = straal(p, vec2(-asp * .62, .6), -.62 + .22 * sw, .028) + straal(p, vec2(asp * .62, .6), 3.76 - .22 * sw, .028);
  col += mix(uTint, vec3(1.), .25) * beams * (.28 + .35 * L) * uBundel;
  float aV = atan(p.y - VP.y, p.x - VP.x + 1e-5);
  float rv = length(p - VP);
  float spaken = pow(max(sin(aV * 13. + uTime * .35) * .5 + .5, 0.), 6.) * (.5 + .7 * vn(vec2(aV * 4., uTime * .2)));
  vec3 rc = uTint;
  if (uRegen > .5) rc = hsv(vec3(aV / 6.2831853 + uTime * .06, .6, 1.));
  col += rc * spaken * exp(-rv * 1.9) * L * .55 * uBundel;

  // vloer met reflectie
  if (p.y < VP.y) {
    float dz = VP.y - p.y;
    float depth = 1. / (dz + .02);
    float gx = abs(fract(p.x * depth * .8) - .5);
    float gz = abs(fract(depth * .45 - uTime * (.55 + .4 * uAmp)) - .5);
    float lijn = smoothstep(.03, 0., gx - .46 + .02) * .0 + smoothstep(.035, .0, min(gx, gz) - .46 + .035) * 0.;
    float vloer = exp(-dz * 1.7);
    col += wit * L * exp(-abs(p.x) * 5.5) * exp(-dz * 1.9) * .55;
    col += uTint * L * vloer * .08 * (.6 + .4 * sin(p.x * depth * 3.));
    col *= mix(1., .65, smoothstep(0., .5, dz));
  }

  // nevel
  float hz = fbm(p * vec2(1.6, 2.4) + vec2(uTime * .04, -uTime * .02));
  col += mix(uTint2, uTint, .5) * hz * (.04 + .1 * L) * exp(-length(p - VP) * .9);

  // de leerling
  if (uFig.w > 0.) {
    vec2 q = (p - vec2(uFig.x, uFig.y)) / uFig.z;
    float px = 1.4 / (uRes.y * uFig.z);
    if (abs(q.x) < .55 && q.y > -.3 && q.y < 1.12) {
      float d = figuur(q, uStap, uAmp);
      float sil = smoothstep(px, -px, d);
      float rand = smoothstep(.016, 0., abs(d + .004)) * (1. - sil * 0.);
      vec3 fcol = vec3(.004, .005, .011);
      col = mix(col, fcol, sil * uFig.w);
      col += wit * L * (smoothstep(-.016, 0., d) * sil) * 1.6 * uFig.w;
      // tegenlicht: de stof licht zacht op langs de randen en aan de kant van de bundel
      float binnen = exp(d * 38.) * sil;
      float kant = .5 + .5 * clamp(-q.x * 6., -1., 1.) * 0.;
      col += mix(uTint, vec3(1.), .4) * L * binnen * .5 * uFig.w * (.6 + .8 * smoothstep(.2, .9, q.y));
      col += uTint2 * L * sil * .035 * uFig.w * (1. - q.y);
      col += uTint * L * exp(-max(d, 0.) * 30.) * (1. - sil) * .22 * uFig.w;
    }
    // reflectie in de vloer
    vec2 qr = vec2(q.x, -q.y * 1.0 - .02);
    if (q.y < 0. && q.y > -.55 && abs(qr.x) < .55) {
      float dr = figuur(qr, uStap, uAmp);
      float silr = smoothstep(px * 3., -px * 3., dr);
      col = mix(col, vec3(.004, .005, .011), silr * .38 * smoothstep(-.55, 0., q.y) * uFig.w);
    }
    // schaduw onder de voeten
    float sh = exp(-pow(length(vec2(q.x * .9, (q.y + .015) * 3.2)), 2.) * 14.);
    col *= 1. - .7 * sh * uFig.w;
  }
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
uniform float uTime, uHolo, uGlitter, uVeeg, uGlow, uAlpha, uPop, uTier, uHelder;
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
  vec4 bg = texture(uBG, uv);
  vec4 mid = texture(uMid, uv + t * vec2(-.010, .008));
  vec4 fg = texture(uFG, uv + t * vec2(-.020, .016));
  vec3 m = texture(uMasker, uv).rgb;
  vec3 col = bg.rgb;

  // reliëf van de rand en de lijsten
  vec2 tx = vec2(1. / 480., 1. / 704.);
  float h0 = m.b;
  float hx = texture(uMasker, uv + vec2(tx.x * 2., 0.)).b;
  float hy = texture(uMasker, uv + vec2(0., tx.y * 2.)).b;
  vec3 bn = normalize(vec3((h0 - hx) * 7., (hy - h0) * 7., 1.));
  vec3 Ld = normalize(vec3(-.35 + t.x * .55, .55 - t.y * .5, .8));
  float bev = dot(bn, Ld);
  col *= .88 + .3 * bev;

  // folie: regenboog die met de hoek meebeweegt, alleen op de achtergrond en lijsten
  float ang = dot(t, vec2(.9, .6)) * 1.1 + uv.x * 1.5 - uv.y * 1.9 + uTime * .04;
  vec3 holo = .5 + .5 * cos(6.2831853 * (ang + vec3(0., .33, .67)));
  col += holo * m.r * uHolo * .32 * bg.a;
  // de veeg die schuin over de kaart glijdt
  float sw = uv.x * .8 + uv.y * .6;
  float veeg = exp(-pow((sw - uVeeg) * 12., 2.));
  col += vec3(1., .97, .9) * veeg * (.16 + .5 * m.r) * bg.a;
  col += vec3(1.) * exp(-pow((sw - uVeeg * .6 - .25) * 20., 2.)) * .12 * m.r;
  // glinsteringen
  vec2 gc = floor(uv * vec2(96., 140.));
  float gh = h21(gc);
  float tw = step(.955, gh) * pow(.5 + .5 * sin(uTime * 3.1 + gh * 90. + (t.x + t.y) * 7.), 10.);
  col += (vec3(1., .96, .85) * tw * 1.7 + hsv(vec3(gh * 7. + ang, .6, 1.)) * tw * .7) * m.g * uGlitter;

  col = mid.rgb + col * (1. - mid.a);
  col = fg.rgb + col * (1. - fg.a);

  // het cijfer, dat tijdens het optellen opspringt
  vec2 rc = (uCijferRect.xy + uCijferRect.zw) * .5;
  vec2 ru = (uv - rc) / uPop + rc + t * vec2(-.026, .02);
  if (ru.x > uCijferRect.x && ru.x < uCijferRect.z && ru.y > uCijferRect.y && ru.y < uCijferRect.w) {
    vec2 cu = (ru - uCijferRect.xy) / (uCijferRect.zw - uCijferRect.xy);
    vec4 c = texture(uCijfer, cu);
    col = c.rgb + col * (1. - c.a);
  }

  // diepte: donkerder naar de rand, rijkere tinten en een zachte lichtvlek die met je muis meebeweegt
  float vgn = smoothstep(.0, .95, 1. - length((uv - .5) * vec2(1.25, 1.) * 1.45));
  col *= .74 + .3 * vgn;
  col = pow(max(col, 0.), vec3(1.14)) * 1.06;
  vec2 lp = vec2(.5 + t.x * -.45, .35 + t.y * .35);
  col += vec3(1., .96, .85) * exp(-dot(uv - lp, uv - lp) * 7.) * .09 * bg.a;
  float fres = pow(1. - abs(dot(N, V)), 3.);
  col += uCol * fres * .35 * uGlow;
  col *= uHelder;
  o = vec4(col * bg.a, bg.a) * uAlpha;
}`;

  // Platte, getextureerde vlakken: vliegende tekst, plaatjes, titel.
  const FS_PLAAT = `${KOP}
in vec2 vUv; in vec3 vN; in vec3 vWp; out vec4 o;
uniform sampler2D uTex;
uniform float uAlpha, uVeeg, uOptel, uTime, uGlitch;
uniform vec3 uTint;
void main(){
  vec2 uv = vUv;
  // glitch: even verschoven strepen
  if (uGlitch > 0.) uv.x += (fract(sin(floor(uv.y * 40.) * 91.7 + floor(uTime * 20.)) * 4375.5) - .5) * .04 * uGlitch;
  vec4 t = texture(uTex, uv);
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
    VS_VOL, FS_NEER, FS_OP, FS_POST, FS_WARP, FS_STRALEN, FS_LICHT, FS_ARENA,
    VS_VLAK, VS_PAK, FS_PAK, FS_KAART, FS_PLAAT, VS_DEELTJES, FS_DEELTJES,
  };
})();
