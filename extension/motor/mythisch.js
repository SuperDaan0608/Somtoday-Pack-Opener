/*
 * Somtoday Pack Opener — mythisch.js
 * De MYTHISCHE reeks (trede 4, kans 1 op 1000): een korte film van ruim dertig seconden met een wezen per vakgroep
 * (exact = draak, talen = feniks, mens & maatschappij = kraken, kunst & sport = griffioen).
 *
 * Alles wordt procedureel op de videokaart getekend:
 *   wereld   een landschap in lagen (parallax, mist, licht, rook) per wezen, op halve resolutie in een eigen doel
 *   wezen    het wezen als 2D-afstandsveld met anatomie (romp, nek, kop met kaken en hoorns, vleugels met vingers en
 *            vlies, poten met klauwen, staart) en belichting (hoofdlicht, randlicht, schubben, doorschijnend vlies).
 *            Het skelet wordt per beeld in 3D op de processor gerekend en geprojecteerd, zodat vleugels echt slaan.
 *   oog      een groot oog in close-up (iris met vezels, spleetpupil die vernauwt, natte glans, oogleden, schubben)
 *   smeed    de kaart die uit vloeibaar licht gesmeed wordt
 *   scheur   lichtscheuren in het pakje
 *
 * De regie (vijf akten) staat onderaan in maak(c); zeldzaam.js roept die aan voor een mythische kaart.
 *   1  stilte, hartslag, het pakje trilt en barst met licht
 *   2  de wereld van het wezen, met een schaduw die door de lucht trekt
 *   3  het wezen ontwaakt: een oog in close-up, de kop, een brul met schokgolf, de vleugels gaan open, het vliegt langs je
 *   4  het smeden: het wezen cirkelt en blaast zijn adem op een kiem van licht, die in slow-motion een kaart wordt
 *   5  de onthulling: de kaart scherp, het wezen erachter, de titel; het eindbeeld is een poster
 * Alles is een functie van de tijd: elk beeld is los te tekenen (seek).
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const { klem, mix, glad } = SPO;
  const ramp = (t, a, b) => klem((t - a) / (b - a), 0, 1);
  const sm = (t, a, b) => glad(ramp(t, a, b));
  const hash = (x) => {
    const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const WEZEN_NR = { draak: 0, feniks: 1, kraken: 2, griffioen: 3 };

  // ═════════════════════════ GLSL ═════════════════════════
  const SH = () => SPO.shaders;

  // een rechthoek op het scherm (in NDC), voor tekenwerk dat maar een deel van het beeld beslaat
  const VS_RECHT = () => `${SH().KOP}
uniform vec4 uRect;
void main(){
  vec2 g = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  gl_Position = vec4(mix(uRect.xy, uRect.zw, g), 0., 1.);
}`;

  // gedeelde hulpjes bovenop GEMEEN
  const HULP = `
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(h11(i), h11(i + 1.), f); }
float fbm1(float x){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * n1(x); x = x * 2.07 + 3.1; a *= .5; } return s; }
float fbm3(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.07 + vec2(11.3, 5.7); a *= .5; } return s; }
float rug(float x, float sd){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * (1. - abs(2. * n1(x + sd) - 1.)); x = x * 2.1 + 1.7; a *= .5; } return s; }
float sstep(float a, float b, float x){ return smoothstep(a, b, x); }
vec2 vor(vec2 p){
  // afstand tot de dichtste celrand (x) en een id van de cel (y)
  vec2 n = floor(p), f = fract(p);
  float md = 8., md2 = 8.; vec2 mid = vec2(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = h22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md2 = md; md = d; mid = n + g; } else if (d < md2) md2 = d;
  }
  return vec2(sqrt(md2) - sqrt(md), h21(mid));
}
`;

  // ───────────────────────── de wereld ─────────────────────────
  // Lagen op diepte D: een punt op het scherm p ziet op die laag X = p * (D - cz) + (cx, cy).
  const FS_WERELD = (nr) => `${SH().KOP}
#define WERELD ${nr}
out vec4 o;
uniform vec2 uRes, uShake;
uniform float uTime, uZoom, uHelder, uRook, uGloed, uSchaduw;
uniform vec3 uCam;
uniform vec4 uBliksem;   // x, y, sterkte, zaad
uniform vec4 uVorm;      // een schaduw van het wezen die door de lucht trekt: x, y, grootte, zichtbaar
${SH().GEMEEN}
${HULP}
float aa;
vec2 laag(vec2 p, float D){ return p * (D - uCam.z) + uCam.xy; }
float rand(float y, float r, float w){ return smoothstep(w, -w, y - r); }
vec3 mist(vec3 c, vec3 m, float k){ return mix(c, m, clamp(k, 0., 1.)); }

#if WERELD == 0
// ── de draak: een vulkaan onder een koele maannacht vol as; lava gloeit in de dalen, bliksem in de rook ──
const vec3 MAAN = vec3(.62, .74, 1.);
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  aa = 1.6 / uRes.y;
  float t = uTime;
  // de lucht (diepte 40): koel blauwviolet boven, warm boven de vulkaan
  vec2 X = laag(p, 40.) / 40.;
  vec3 col = mix(vec3(.05, .045, .085), vec3(.006, .008, .02), smoothstep(-.1, .55, X.y));
  vec2 mq = X - vec2(-.42, .3);
  float mr = length(mq);
  col += MAAN * .22 * exp(-mr * 5.);
  col += MAAN * .9 * smoothstep(.052, .046, mr) * (.85 + .15 * fbm3(mq * 40.));
  float ster = step(.995, h21(floor(gl_FragCoord.xy * .5))) * smoothstep(.1, .5, X.y) * h21(floor(gl_FragCoord.xy * .5) + 3.);
  col += vec3(.7, .8, 1.) * ster * .5;
  vec2 kr = X - vec2(.05, -.05);
  col += vec3(1., .3, .06) * .5 * exp(-length(kr * vec2(.8, 1.7)) * 3.6) * uGloed;
  // aswolken (diepte 16): donker blauwgrijs, van onderen oranje verlicht, de maan geeft ze een zilveren rand
  vec2 R = laag(p, 16.) / 16. * 2.;
  vec2 w = vec2(fbm(R * 1.2 + vec2(t * .012, 0.)), fbm(R * 1.2 + vec2(3.1, t * .009)));
  float rook = fbm(R * 1.5 + w * 1.6 + vec2(t * .018, -t * .005));
  float dicht = smoothstep(.36, .74, rook) * smoothstep(-.3, .12, X.y) * uRook;
  float rand2 = smoothstep(.36, .5, rook) * (1. - smoothstep(.5, .7, rook));
  vec3 rookK = vec3(.03, .03, .045);
  rookK += vec3(1., .3, .07) * .55 * smoothstep(.75, .3, rook) * smoothstep(.35, -.15, X.y) * exp(-abs(X.x - .05) * 2.) * uGloed;
  rookK += MAAN * .12 * rand2 * exp(-mr * 2.5);
  col = mix(col, rookK, dicht * .94);
  // bliksem in de rook
  if (uBliksem.z > .001) {
    vec2 b = X - uBliksem.xy;
    float sd = uBliksem.w;
    float xs = b.x + (fbm1(b.y * 9. + sd) - .5) * .12 + (fbm1(b.y * 31. + sd * 3.) - .5) * .03;
    float tak = exp(-abs(xs) / (.0012 + .0018 * smoothstep(0., -.3, b.y))) * smoothstep(.05, -.02, b.y) * smoothstep(-.4, -.18, b.y);
    float xs2 = b.x + .05 + (fbm1(b.y * 13. + sd * 2.) - .5) * .1;
    tak += .6 * exp(-abs(xs2) / .001) * smoothstep(-.06, -.1, b.y) * smoothstep(-.28, -.16, b.y);
    col += vec3(.75, .82, 1.) * tak * uBliksem.z * 2.4;
    col += vec3(.45, .45, .7) * uBliksem.z * (.3 + dicht) * exp(-length(b) * 2.5) * 1.1;
  }
  // verre bergen (diepte 10): koel in de nevel
  vec2 X9 = laag(p, 10.) / 10.;
  float r9 = -.13 + .15 * rug(X9.x * 2.1, 3.);
  vec3 k9 = mix(vec3(.05, .05, .08), vec3(.16, .08, .09), smoothstep(.2, -.3, X9.x * .3 + X9.y));
  k9 += MAAN * .05 * exp(-(r9 - X9.y) * 50.);
  col = mix(col, k9, rand(X9.y, r9, aa));
  // de vulkaan (diepte 6)
  vec2 X6 = laag(p, 6.) / 6.;
  float vx = X6.x - .05;
  float top = .03;
  float helling = top - .8 * abs(vx) + .03 * (fbm1(vx * 16.) - .5) - .3 * max(abs(vx) - .32, 0.);
  float krater = top - .025 + .025 * smoothstep(.03, .07, abs(vx));
  float r6 = min(helling, mix(krater, helling, smoothstep(.05, .09, abs(vx))));
  float m6 = rand(X6.y, r6, aa);
  vec3 k6 = vec3(.022, .014, .018);
  // ruwe flanken met geulen, koel randlicht van de maan links
  float geul = fbm(vec2(vx * 30., X6.y * 6.));
  k6 *= .6 + .7 * geul;
  k6 += MAAN * .05 * smoothstep(.0, -.2, vx) * exp(-(r6 - X6.y) * 30.);
  // lavastromen: gloeiende aderen die van de krater omlaag kronkelen
  float ader = abs(vx * (1. + .5 * (X6.y - top)) + .05 * (fbm(vec2(X6.y * 9., vx * 2.)) - .5) - .06 * sin(X6.y * 14.)) ;
  float ader2 = abs(vx + .12 + .05 * (fbm(vec2(X6.y * 7. + 3., 1.)) - .5) + .3 * (X6.y - top));
  float stroom = (exp(-ader * 220.) + .7 * exp(-ader2 * 260.) * step(X6.y, -.04)) * smoothstep(-.42, -.0, X6.y) * smoothstep(top + .01, top - .02, X6.y);
  k6 += vec3(1.25, .4, .07) * stroom * (.55 + .6 * fbm(X6 * 40. + vec2(0., -t * .4))) * uGloed;
  k6 += vec3(1., .28, .05) * exp(-(r6 - X6.y) * 35.) * .55 * smoothstep(.2, 0., abs(vx)) * uGloed;
  col = mix(col, k6, m6);
  // de krater en de pluim
  vec2 kp = X6 - vec2(.05, top - .015);
  col += vec3(1., .42, .09) * exp(-length(kp * vec2(1., 2.8)) * 26.) * 1.8 * uGloed;
  float pl = fbm(vec2(kp.x * 6. + fbm(kp * 3. + vec2(0., -t * .1)) * 1.4, kp.y * 3. - t * .22));
  float pluim = smoothstep(.42, .78, pl) * smoothstep(-.02, .08, kp.y) * smoothstep(.1 + kp.y * .7, 0., abs(kp.x - kp.y * .15));
  col = mix(col, mix(vec3(.04, .03, .04), vec3(1., .38, .08), exp(-kp.y * 7.) * uGloed * smoothstep(.4, .9, pl)), pluim * .9);
  // middengrond (diepte 3.2): scherpe rotskammen, zwart met een oranje rand van onderen en zilver van de maan
  vec2 X3 = laag(p, 3.2) / 3.2;
  float r3 = -.24 + .12 * rug(X3.x * 1.7, 11.) + .1 * smoothstep(.25, .75, abs(X3.x));
  float m3 = rand(X3.y, r3, aa);
  vec3 k3 = vec3(.012, .01, .014) * (.7 + .6 * fbm(X3 * vec2(20., 8.)));
  k3 += MAAN * .09 * exp(-(r3 - X3.y) * 120.);
  col = mix(col, k3, m3);
  // het lavameer in het dal (diepte 2.5): korsten met gloeiende naden
  vec2 X2 = laag(p, 2.5) / 2.5;
  float meerR = -.31 + .01 * sin(X2.x * 9.);
  float meer = smoothstep(meerR + aa, meerR - aa, X2.y);
  if (meer > 0.) {
    float persp = 1. / max(meerR + .02 - X2.y, .01);
    vec2 lq = vec2(X2.x * persp * .12, persp * .9) * 3.;
    vec2 v = vor(lq + vec2(t * .04, 0.));
    float naad = exp(-v.x * 9.);
    vec3 lava = vec3(.05, .012, .01) + vec3(1.3, .42, .08) * naad * (.6 + .4 * vn(lq * .4 + t * .3));
    lava += vec3(1., .3, .05) * .25 * smoothstep(meerR - .1, meerR, X2.y);
    col = mix(col, lava * uGloed + vec3(.01), meer);
  }
  // hitte boven het meer
  col += vec3(1., .3, .06) * .2 * exp(-max(X2.y - meerR, 0.) * 14.) * smoothstep(meerR - .05, meerR + .02, X2.y) * uGloed;
  // voorgrond (diepte 1.3): grote rotsen links en rechts, onscherp en zwart, met een warme rand
  vec2 X1 = laag(p, 1.3) / 1.3;
  float r1 = -.38 + .7 * smoothstep(.32, 1.05, abs(X1.x)) + .07 * rug(X1.x * 2.6, 21.);
  float m1 = rand(X1.y, r1, aa * 4.);
  vec3 k1 = vec3(.004, .003, .004) + vec3(1., .3, .06) * exp(-(r1 - X1.y) * 60.) * .35 * uGloed * smoothstep(.0, .4, -X1.y + .2);
  col = mix(col, k1, m1);
  col *= 1. - uSchaduw * .7;
  o = vec4(col * uHelder, 1.);
}
#elif WERELD == 1
// ── de feniks: een zonnetempel op een rots boven een zee van wolken, in de schemering ──
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  aa = 1.6 / uRes.y;
  float t = uTime;
  vec2 X = laag(p, 40.) / 40.;
  vec2 zon = vec2(.0, .0);
  float zr = length(X - zon);
  // schemering: indigo boven, paars en roze in het midden, goud bij de zon
  vec3 col = mix(vec3(1., .5, .16), vec3(.42, .1, .2), smoothstep(-.02, .2, X.y));
  col = mix(col, vec3(.1, .04, .16), smoothstep(.15, .38, X.y));
  col = mix(col, vec3(.015, .015, .06), smoothstep(.35, .62, X.y));
  col += vec3(1., .55, .2) * exp(-zr * 6.) * .9 * uGloed;
  float ster = step(.996, h21(floor(gl_FragCoord.xy * .5))) * smoothstep(.3, .55, X.y);
  col += vec3(.8, .8, 1.) * ster * .5;
  // lange, dunne wolkenbanken die door de zon van onderen worden aangelicht
  vec2 W = laag(p, 18.) / 18. * vec2(1.2, 5.);
  float wl = fbm(W * 1.4 + vec2(t * .008, 0.));
  float wm = smoothstep(.52, .78, wl) * smoothstep(.02, .12, X.y) * smoothstep(.45, .2, X.y);
  vec3 wk = mix(vec3(.16, .05, .12), vec3(1., .45, .22), smoothstep(.62, .85, wl) * exp(-abs(X.x) * 1.5) * uGloed);
  col = mix(col, wk, wm * .9);
  // stralen van de zon
  float ang = atan(X.y - zon.y, X.x - zon.x);
  float st = pow(vn(vec2(ang * 10., t * .06)), 4.) * exp(-zr * 1.3) * smoothstep(.06, .25, zr) * step(-.02, X.y);
  col += vec3(1., .62, .3) * st * .35 * uGloed;
  // de zonneschijf, half achter de wolkenzee
  col += vec3(1., .92, .7) * smoothstep(.082, .074, zr) * 1.8 * uGloed;
  // verre bergen in paarse nevel (diepte 12)
  vec2 X9 = laag(p, 12.) / 12.;
  float r9 = -.06 + .12 * rug(X9.x * 1.8, 5.);
  col = mix(col, mix(vec3(.25, .08, .16), vec3(.8, .35, .25), exp(-abs(X9.x) * 2.) * .6), rand(X9.y, r9, aa));
  // de zee van wolken (diepte 7)
  vec2 X6 = laag(p, 7.) / 7.;
  float wz = -.06 + .025 * fbm(vec2(X6.x * 5. + t * .02, 0.));
  float zee = smoothstep(wz + .02, wz - .03, X6.y);
  float wf = fbm(vec2(X6.x * 7. + t * .03, X6.y * 20.));
  vec3 zk = mix(vec3(1., .62, .35) * (.4 + .6 * exp(-abs(X6.x) * 2.5)), vec3(.25, .08, .14), smoothstep(-.06, -.3, X6.y)) * (.7 + .4 * wf);
  col = mix(col, zk, zee);
  // de rots en de tempel (diepte 4): tegen het licht, met een gouden rand en licht tussen de zuilen
  vec2 X3 = laag(p, 4.) / 4.;
  float rots = -.08 - .5 * smoothstep(.16, .55, abs(X3.x)) + .025 * rug(X3.x * 6., 2.);
  float xa = abs(X3.x);
  float trap = step(xa, .21 - .015 * floor(clamp((X3.y + .08) / .012, 0., 3.))) * step(X3.y, -.044) * step(-.09, X3.y);
  float zuilen = step(xa, .18) * step(-.045, X3.y) * step(X3.y, .06);
  float spleet = step(.42, fract(X3.x * 27. + .5));
  float balk = step(xa, .195) * step(.06, X3.y) * step(X3.y, .082);
  float front = step(X3.y, .082 + .07 * (1. - xa / .2)) * step(.082, X3.y) * step(xa, .2);
  float tempel = max(max(trap, zuilen * spleet), max(balk, front));
  float m3 = max(rand(X3.y, rots, aa), tempel);
  vec3 tk = vec3(.035, .015, .03);
  tk += vec3(1., .6, .3) * .35 * exp(-(max(rots, .082 + .07 * (1. - xa / .2)) - X3.y) * 60.) * uGloed;
  col = mix(col, tk, m3);
  // licht tussen de zuilen: de zon staat recht achter de tempel
  float tussen = zuilen * (1. - spleet);
  col += vec3(1., .75, .4) * tussen * (.9 + .4 * exp(-xa * 6.)) * uGloed;
  // hitte en stof boven de tempel
  col += vec3(1., .55, .25) * .12 * exp(-length((X3 - vec2(0., .05)) * vec2(1.5, 3.)) * 4.) * uGloed;
  // voorgrond (diepte 1.4): gebroken zuilen en rotsen, onscherp en donker
  vec2 X1 = laag(p, 1.4) / 1.4;
  float r1 = -.42 + .08 * rug(X1.x * 3., 8.);
  float stomp = 0.;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cx = (i == 1 ? -1. : 1.) * (.78 + .12 * fi);
    float hh = -.1 + .35 * h11(fi * 3.7);
    stomp = max(stomp, step(abs(X1.x - cx), .06) * step(X1.y, hh + .03 * sin(X1.x * 60.)));
  }
  float m1 = max(rand(X1.y, r1, aa * 4.), stomp);
  col = mix(col, vec3(.012, .006, .014) + vec3(1., .5, .2) * .06, m1);
  col *= 1. - uSchaduw * .7;
  o = vec4(col * uHelder, 1.);
}
#elif WERELD == 2
// ── de kraken: de diepzee; schuine lichtbundels van boven, een wrak, wier en lichtgevende wezentjes ──
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  aa = 1.6 / uRes.y;
  float t = uTime;
  vec2 X = laag(p, 24.) / 24.;
  vec3 col = mix(vec3(.0, .006, .016), vec3(.01, .11, .2), smoothstep(-.45, .55, X.y));
  col += vec3(.05, .25, .35) * smoothstep(.2, .7, X.y) * .6;
  // lichtbundels: schuin van het oppervlak, zacht en traag bewegend
  float sb = (X.x + X.y * .45) * 5.;
  float bundel = pow(vn(vec2(sb, t * .12)), 3.) + .5 * pow(vn(vec2(sb * 2.3 + 4., t * .2)), 4.);
  col += vec3(.2, .55, .62) * bundel * .32 * smoothstep(-.6, .6, X.y) * uGloed;
  // het oppervlak, ver boven je: lichte, bewegende vlekken
  vec2 C = laag(p, 9.) / 9. * vec2(7., 18.);
  float ca = vor(C + vec2(t * .15, t * .07)).x;
  col += vec3(.35, .7, .8) * smoothstep(.1, .0, ca) * .12 * smoothstep(.3, .55, X.y) * uGloed;
  // zwevende deeltjes in de verte als zachte nevel
  col += vec3(.02, .07, .1) * fbm(X * 6. + t * .02) * .5;
  // verre rotsen en een boog (diepte 9)
  vec2 X8 = laag(p, 9.) / 9.;
  float r8 = -.16 + .17 * rug(X8.x * 2.2, 4.);
  float boog = abs(length((X8 - vec2(-.35, -.18)) * vec2(1., 1.3)) - .15) - .025;
  float m8 = max(rand(X8.y, r8, aa), smoothstep(aa, -aa, boog) * step(-.2, X8.y));
  col = mix(col, mist(vec3(.0, .02, .04), vec3(.02, .1, .16), .65), m8);
  // het wrak (diepte 5): een gebroken romp met masten, schuin in het zand
  vec2 X4 = laag(p, 5.) / 5.;
  vec2 wq = rot2(-.22) * (X4 - vec2(.34, -.2));
  float romp = max(abs(wq.y + .035 * (wq.x / .3) * (wq.x / .3) * 2.) - .045, abs(wq.x) - .3);
  romp = max(romp, -(length(wq - vec2(.12, .06)) - .05));
  float mast = max(abs(wq.x - .05) - .007, abs(wq.y - .13) - .15);
  float mast2 = max(abs(rot2(.5) * (wq - vec2(-.14, .07))).x - .006, abs((rot2(.5) * (wq - vec2(-.14, .07))).y) - .1);
  float ra = max(abs(wq.y - .2) - .005, abs(wq.x - .05) - .08);
  float wrak = smoothstep(aa, -aa, min(min(romp, mast), min(mast2, ra)));
  col = mix(col, mist(vec3(.0, .012, .025), vec3(.02, .09, .14), .45), wrak);
  // de zeebodem (diepte 3)
  vec2 X3 = laag(p, 3.) / 3.;
  float r3 = -.3 + .07 * rug(X3.x * 2., 9.);
  col = mix(col, vec3(.0, .008, .014) + vec3(.1, .35, .4) * exp(-(r3 - X3.y) * 70.) * .15 * uGloed, rand(X3.y, r3, aa));
  // lichtgevende wezentjes, dichtbij
  vec2 G = laag(p, 2.) / 2. * 16.;
  vec2 gi = floor(G); vec2 gf = fract(G) - .5;
  float gh = h21(gi);
  float lichtje = smoothstep(.07, .0, length(gf - (h22(gi) - .5) * .6)) * step(.9, gh) * (.5 + .5 * sin(t * 2. + gh * 40.));
  col += vec3(.2, 1., .85) * lichtje * .5 * uGloed;
  // voorgrond: golvend wier aan beide kanten, onscherp
  vec2 X1 = laag(p, 1.25) / 1.25;
  float wier = 0.;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float x0 = .6 + .065 * fi;
    float bx = abs(X1.x) - x0 - .045 * sin(X1.y * 5. + t * .7 + fi * 2.);
    wier = max(wier, smoothstep(.016, .004, abs(bx)) * smoothstep(-.05 - .2 * h11(fi), -.5, X1.y));
  }
  col = mix(col, vec3(.0, .01, .014), wier);
  col *= 1. - uSchaduw * .7;
  o = vec4(col * uHelder, 1.);
}
#else
// ── de griffioen: besneeuwde bergtoppen boven een wolkenzee, bij zonsopgang ──
vec3 berg(vec2 Xb, float D, float i, vec3 col){
  float e = .035;
  float f = 1.4 + .45 * i;
  float sd = 7. + i * 13.;
  float r = -.08 - .055 * i + (.24 - .03 * i) * rug(Xb.x * f, sd);
  float m = rand(Xb.y, r, aa * (1. + i));
  float hl = (rug((Xb.x + e) * f, sd) - rug((Xb.x - e) * f, sd)) / (2. * e);
  float zonkant = smoothstep(.3, -.3, hl);
  float sneeuw = smoothstep(r - .06 - .04 * fbm1(Xb.x * 30. + i), r - .03, Xb.y);
  float geul = fbm(vec2(Xb.x * 9., Xb.y * 5.) + i * 3.7);
  vec3 rots = mix(vec3(.12, .13, .25), vec3(.42, .32, .38), zonkant) * (.7 + .5 * geul);
  vec3 sn = mix(vec3(.52, .6, .85), vec3(1., .86, .72), zonkant) * (.85 + .2 * geul);
  vec3 k = mix(rots, sn, sneeuw * smoothstep(.25, .55, geul + .25));
  k = mist(k, vec3(.92, .78, .72), .55 - .17 * i);
  return mix(col, k, m);
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  aa = 1.6 / uRes.y;
  float t = uTime;
  vec2 X = laag(p, 40.) / 40.;
  vec2 zon = vec2(.22, .03);
  float zr = length(X - zon);
  vec3 col = mix(vec3(1., .74, .52), vec3(.5, .62, .86), smoothstep(-.04, .22, X.y));
  col = mix(col, vec3(.12, .2, .45), smoothstep(.2, .6, X.y));
  col += vec3(1., .8, .55) * exp(-zr * 6.) * .75 * uGloed;
  col += vec3(1., .97, .9) * smoothstep(.042, .036, zr) * 1.8 * uGloed;
  float ang = atan(X.y - zon.y, X.x - zon.x);
  col += vec3(1., .85, .6) * pow(vn(vec2(ang * 9., t * .05)), 4.) * exp(-zr * 1.7) * .3 * smoothstep(.04, .15, zr) * uGloed;
  // hoge, dunne wolkjes
  vec2 W = laag(p, 20.) / 20. * vec2(1.2, 4.);
  float wl = fbm(W * 1.6 + vec2(t * .006, 0.));
  col = mix(col, mix(vec3(.75, .7, .9), vec3(1., .82, .7), exp(-zr * 2.5)), smoothstep(.55, .8, wl) * smoothstep(.12, .3, X.y) * .55);
  // drie rijen bergen, steeds dichterbij
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float D = 13. - fi * 3.8;
    col = berg(laag(p, D) / D, D, fi, col);
  }
  // de zee van wolken
  vec2 X4 = laag(p, 3.6) / 3.6;
  float wz = -.25 + .025 * fbm(vec2(X4.x * 4. + t * .02, 1.));
  float wf = fbm(vec2(X4.x * 5. + t * .025, X4.y * 14.));
  vec3 wk = mix(vec3(1., .88, .78), vec3(.58, .55, .75), smoothstep(-.25, -.45, X4.y)) * (.8 + .25 * wf);
  col = mix(col, wk, smoothstep(wz + .02, wz - .03, X4.y));
  // voorgrond: een rotspunt, onscherp, met een warme rand
  vec2 X1 = laag(p, 1.3) / 1.3;
  float r1 = -.42 + .55 * smoothstep(.4, 1.05, abs(X1.x)) + .05 * rug(X1.x * 3., 12.);
  col = mix(col, vec3(.05, .045, .08) + vec3(1., .75, .5) * exp(-(r1 - X1.y) * 70.) * .25 * uGloed, rand(X1.y, r1, aa * 4.));
  col *= 1. - uSchaduw * .7;
  o = vec4(col * uHelder, 1.);
}
#endif
`;

  // het halve-resolutie-beeld van de wereld in de scène zetten (met een overvloeier)
  const FS_KOPIE = () => `${SH().KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uA, uMul;
void main(){ vec3 c = texture(uTex, vUv).rgb * uMul; o = vec4(c * uA, uA); }`;

  // ───────────────────────── het wezen ─────────────────────────
  const FS_WEZEN = (nr) => `${SH().KOP}
#define WEZEN ${nr}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uZoom, uTime;
uniform vec4 uKet[18]; uniform int uKetN;          // de ruggengraat: xy, straal, booglengte
uniform vec2 uKopO; uniform mat2 uKopI, uKopB; uniform float uKopS, uKaak, uKopZ;
uniform vec4 uVl[20];                               // vleugels: [0..9] achter, [10..19] voor
uniform vec4 uSc[8];                                // de schulpen in de achterrand van het vlies
uniform vec4 uVlB[2];                               // een omhullende cirkel per vleugel (sneller)
uniform vec4 uPt[20];                               // poten: 4 x 5 punten (achter: 0,1; voor: 2,3)
uniform vec4 uTe[48]; uniform float uTeZ[8]; uniform int uTeN;   // kraken: 8 armen x 6 punten; feniks: staartveren
uniform vec3 uL, uLK, uRK, uAK, uMK, uRK2; uniform vec2 uRD, uRD2;
uniform float uMist, uSil, uOogG, uMondG, uDetail, uAlpha, uS, uDoor, uVlA, uVlV, uVuur, uVlD;
uniform vec3 uVN0, uVN1;
uniform vec3 uC1, uC2, uC3, uC4, uC5, uC6;          // huid donker, huid licht, buik, vlies, hoorn, gloed (oog)
${SH().GEMEEN}
${HULP}
struct H { float d; vec2 n; float r; float u; float v; float m; };
float kreuk = 0.;
H geen(){ H o; o.d = 1e5; o.n = vec2(0., 1.); o.r = 1.; o.u = 0.; o.v = 0.; o.m = 0.; return o; }
H cap(vec2 p, vec2 a, vec2 b, float ra, float rb, float ua, float ub, float m){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0., 1.);
  vec2 q = pa - ba * h;
  float l = length(q);
  float r = mix(ra, rb, h);
  H o; o.d = l - r; o.n = q / max(l, 1e-7); o.r = max(r, 1e-5); o.u = mix(ua, ub, h);
  o.v = sign(ba.x * pa.y - ba.y * pa.x) * l / o.r; o.m = m;
  return o;
}
H hmin(H a, H b){ if (b.d < a.d) return b; return a; }
H hsmin(H a, H b, float k){
  float h = clamp(.5 + .5 * (b.d - a.d) / k, 0., 1.);
  H o = b;
  if (h > .5) o = a;
  o.d = mix(b.d, a.d, h) - k * h * (1. - h);
  kreuk = max(kreuk, h * (1. - h) * 4. * step(o.d, 0.));
  o.n = normalize(mix(b.n, a.n, h) + 1e-6);
  o.r = mix(b.r, a.r, h);
  return o;
}
float px;
// een veelhoek (iq), 7 hoeken
float sdVeel(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3, vec2 v4, vec2 v5, vec2 v6){
  vec2 v[7]; v[0] = v0; v[1] = v1; v[2] = v2; v[3] = v3; v[4] = v4; v[5] = v5; v[6] = v6;
  float d = dot(p - v[0], p - v[0]);
  float s = 1.;
  for (int i = 0, j = 6; i < 7; j = i, i++) {
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0., 1.);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.;
  }
  return s * sqrt(d);
}
float sdDriehoek(vec2 p, vec2 a, vec2 b, vec2 c){
  vec2 e0 = b - a, e1 = c - b, e2 = a - c;
  vec2 v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0., 1.);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0., 1.);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0., 1.);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

// ── belichting ──
vec3 normaal(H h){
  float s = clamp(1. + h.d / h.r, 0., 1.);
  return normalize(vec3(h.n * s, sqrt(max(1. - s * s, 0.)) + .05));
}
vec3 licht(vec3 alb, vec3 N, float glans, float ruw){
  float dif = max(dot(N, uL), 0.);
  vec3 amb = uAK * (.55 + .45 * N.y);
  vec3 c = alb * (amb + uLK * dif);
  float fr = pow(1. - clamp(N.z, 0., 1.), 2.2);
  float rd = smoothstep(-.2, .9, dot(normalize(N.xy + 1e-5), uRD));
  c += uRK * fr * rd * (.65 + .6 * glans);
  float rd2 = smoothstep(-.1, .9, dot(normalize(N.xy + 1e-5), uRD2));
  c += uRK2 * pow(1. - clamp(N.z, 0., 1.), 3.) * rd2 * (.6 + .5 * glans);
  vec3 hv = normalize(uL + vec3(0., 0., 1.));
  c += uLK * glans * pow(max(dot(N, hv), 0.), ruw);
  return c;
}

// ── schubben: dakpannen in (booglengte, dwars) ──
vec3 schub(vec2 g){
  // g in schub-eenheden; geeft (schaduw, glim, rand)
  float rij = floor(g.y);
  g.x += .5 * mod(rij, 2.);
  vec2 f = fract(g) - vec2(.5, .5);
  vec2 q = f * vec2(1., 1.25);
  float e = length(q - vec2(.18, 0.));
  float bol = smoothstep(.72, .2, e);
  float rand = smoothstep(.5, .66, e);
  return vec3(bol, smoothstep(.45, .0, length(q - vec2(-.1, .18))), rand);
}

// ═════ de romp: een keten van taps toelopende capsules (lijf, nek en staart; bij de kraken de mantel) ═════
H romp(vec2 p){
  H b = geen();
  for (int i = 0; i < 17; i++) {
    if (i >= uKetN - 1) break;
    vec4 A = uKet[i], B = uKet[i + 1];
    b = hmin(b, cap(p, A.xy, B.xy, A.z, B.z, A.w, B.w, 0.));
  }
#if WEZEN == 0
  // stekels op de rug: een zaagtand langs de booglengte (groot op de rug, klein op nek en staart)
  float sp = b.u;
  float groot = smoothstep(-2.1, -1.3, sp) * (1. - smoothstep(1.75, 2., sp)) * (.4 + .6 * smoothstep(-.9, -.1, sp) * (1. - smoothstep(.85, 1.35, sp)));
  float per = .16;
  float zt = 1. - abs(fract(sp / per) * 2. - 1.);
  zt = pow(zt, 1.6);
  float boven = smoothstep(.2, .9, b.v);
  float stek = .11 * uS * groot * zt * boven;
  if (stek > 0.) { float d2 = b.d - stek; if (d2 < b.d) { b.m = b.d > 0. ? 4. : b.m; b.d = d2; } }
  // de staartpunt: een spade
  vec4 T = uKet[0], T1 = uKet[1];
  vec2 dir = normalize(T.xy - T1.xy);
  vec2 nn = vec2(-dir.y, dir.x);
  vec2 q = p - T.xy;
  float ax = dot(q, dir), ay = dot(q, nn);
  float sz = .2 * uS;
  float spade = sdDriehoek(vec2(ax, ay), vec2(-.25 * sz, 0.), vec2(.75 * sz, 0.), vec2(.05 * sz, .42 * sz));
  spade = min(spade, sdDriehoek(vec2(ax, ay), vec2(-.25 * sz, 0.), vec2(.75 * sz, 0.), vec2(.05 * sz, -.42 * sz)));
  if (spade < b.d) { b.d = spade; b.m = 4.; b.n = normalize(q + 1e-6); b.r = .1 * sz; b.u = -3.; }
#endif
#if WEZEN == 3
  // de pluim aan het eind van de leeuwenstaart
  vec4 T = uKet[0], T1 = uKet[1];
  vec2 dir = normalize(T.xy - T1.xy);
  H pl = cap(p, T.xy - dir * .02 * uS, T.xy + dir * .14 * uS, .055 * uS, .02 * uS, -3., -3.2, 4.);
  b = hsmin(b, pl, .02 * uS);
#endif
#if WEZEN == 1 || WEZEN == 3
  // veren in de nek: zachte plukjes langs de bovenkant
  float nk = smoothstep(1.0, 1.25, b.u);
  if (nk > 0.) {
    float zt = 1. - abs(fract(b.u / .07) * 2. - 1.);
    float d2 = b.d - .035 * uS * nk * zt * zt * smoothstep(-.2, .8, b.v);
    if (d2 < b.d) b.d = d2;
  }
#endif
  return b;
}

// ── de kop van de draak, in kop-eenheden (1 = de lengte van het lijf / 1.1) ──
#if WEZEN == 0
H kopD(vec2 p, float verre){
  vec2 q = uKopI * (p - uKopO);
  if (verre > .5) q += vec2(.03, -.035);
  H h = geen();
  if (dot(q - vec2(.2, 0.), q - vec2(.2, 0.)) > .9) { h.d = (length(q - vec2(.2, 0.)) - .6) * uKopS; return h; }
  if (verre < .5) {
    // schedel (een wig), snuit met neusbult, een zware wenkbrauwrichel en jukbeenderen
    h = cap(q, vec2(.0, .035), vec2(.2, .05), .122, .095, 0., .2, 1.);
    h = hsmin(h, cap(q, vec2(.18, .035), vec2(.49, .006), .086, .044, .2, .5, 1.), .05);
    h = hsmin(h, cap(q, vec2(.46, .022), vec2(.535, .016), .036, .026, .5, .55, 1.), .03);
    h = hsmin(h, cap(q, vec2(.08, .115), vec2(.31, .07), .045, .018, .1, .3, 1.), .035);
    h = hsmin(h, cap(q, vec2(-.01, -.025), vec2(.2, -.035), .068, .04, 0., .2, 1.), .04);
    // onderkaak: draait om het scharnier, met een kin
    vec2 sch = vec2(.05, -.045);
    vec2 qj = rot2(uKaak) * (q - sch) + sch;
    H j = cap(qj, vec2(.03, -.07), vec2(.42, -.07), .066, .03, .0, .45, 1.);
    j = hsmin(j, cap(qj, vec2(.36, -.075), vec2(.47, -.062), .032, .022, .4, .5, 1.), .02);
    h = hsmin(h, j, .015 + .03 * (1. - smoothstep(.05, .3, uKaak)));
    // tanden: boven langs de snuit, onder langs de kaak (alleen te zien als de bek open is), en twee hoektanden
    float tx = q.x;
    float k = 16.;
    float fx = (fract(tx * k) - .5) / k;
    float tl = .036 * (1. - .4 * smoothstep(.2, .5, tx));
    float yb = -.03 - .08 * (tx - .2) * .45;
    float tand = max(abs(fx) - .02 * (1. - clamp((yb - q.y) / tl, 0., 1.)), max(q.y - yb, yb - tl - q.y));
    tand = max(tand, max(.2 - tx, tx - .5));
    float fang = sdDriehoek(q, vec2(.37, -.025), vec2(.42, -.025), vec2(.395, -.12));
    tand = min(tand, fang);
    float ybj = -.038 - .02 * (qj.x - .2);
    float fxj = (fract(qj.x * k + .5) - .5) / k;
    float tandj = max(abs(fxj) - .018 * (1. - clamp((qj.y - ybj) / .032, 0., 1.)), max(ybj - qj.y, qj.y - ybj - .032));
    tandj = max(tandj, max(.16 - qj.x, qj.x - .44));
    tandj = min(tandj, sdDriehoek(qj, vec2(.12, -.04), vec2(.16, -.04), vec2(.14, .05)));
    tand = min(tand, tandj);
    if (tand < h.d && uKaak > .04) { h.d = tand; h.m = 6.; h.n = vec2(0., 1.); h.r = .01; }
    // hoorns: twee grote die naar achteren buigen, twee kleinere eronder, een kraag van stekels langs de kaak
    H hr = cap(q, vec2(.03, .1), vec2(-.08, .19), .058, .043, 0., .25, 5.);
    hr = hmin(hr, cap(q, vec2(-.08, .19), vec2(-.2, .235), .043, .03, .25, .5, 5.));
    hr = hmin(hr, cap(q, vec2(-.2, .235), vec2(-.31, .235), .03, .017, .5, .75, 5.));
    hr = hmin(hr, cap(q, vec2(-.31, .235), vec2(-.4, .195), .017, .003, .75, 1., 5.));
    hr = hmin(hr, cap(q, vec2(.0, .04), vec2(-.12, .085), .04, .024, 0., .5, 5.));
    hr = hmin(hr, cap(q, vec2(-.12, .085), vec2(-.23, .075), .024, .003, .5, 1., 5.));
    hr = hmin(hr, cap(q, vec2(.0, -.05), vec2(-.14, -.1), .028, .003, 0., 1., 5.));
    hr = hmin(hr, cap(q, vec2(.05, -.085), vec2(-.06, -.155), .024, .003, 0., 1., 5.));
    hr = hmin(hr, cap(q, vec2(.1, -.1), vec2(.03, -.17), .02, .003, 0., 1., 5.));
    hr = hmin(hr, cap(q, vec2(.22, .1), vec2(.17, .16), .018, .003, 0., 1., 5.));
    h = hsmin(h, hr, .012);
  } else {
    // de verre hoorn (iets donkerder, achter de kop)
    h = cap(q, vec2(.03, .1), vec2(-.08, .19), .054, .04, 0., .25, 5.);
    h = hmin(h, cap(q, vec2(-.08, .19), vec2(-.2, .235), .04, .028, .25, .5, 5.));
    h = hmin(h, cap(q, vec2(-.2, .235), vec2(-.31, .235), .028, .016, .5, .75, 5.));
    h = hmin(h, cap(q, vec2(-.31, .235), vec2(-.4, .195), .016, .003, .75, 1., 5.));
    h = hmin(h, cap(q, vec2(.0, -.05), vec2(-.14, -.1), .026, .003, 0., 1., 5.));
  }
  h.d *= uKopS; h.r *= uKopS;
  h.n = normalize(uKopB * h.n + 1e-6);
  return h;
}
#endif

#if WEZEN == 1 || WEZEN == 3
// ── de kop van een vogel (adelaar of feniks), in kop-eenheden ──
H kopV(vec2 p, float verre){
  vec2 q = uKopI * (p - uKopO);
  if (verre > .5) q += vec2(.02, -.03);
  H h = geen();
  if (dot(q - vec2(.15, 0.), q - vec2(.15, 0.)) > .5) { h.d = (length(q - vec2(.15, 0.)) - .5) * uKopS; return h; }
#if WEZEN == 3
  float sn = 1.;
#else
  float sn = .82;
#endif
  if (verre < .5) {
    h = cap(q, vec2(.0, .04), vec2(.12 * sn, .05), .125 * sn, .1 * sn, 0., .2, 1.);
    h = hsmin(h, cap(q, vec2(-.06, -.03), vec2(.06, -.03), .12 * sn, .095 * sn, 0., .1, 1.), .05);
    // de wenkbrauw: de felle blik van een roofvogel
    h = hsmin(h, cap(q, vec2(.05, .105 * sn), vec2(.18 * sn, .085 * sn), .042 * sn, .02, .1, .3, 1.), .03);
    // de snavel: boven met een haak, onder draait mee met de bek
    vec2 sch = vec2(.14 * sn, -.02);
    H bk = cap(q, vec2(.14 * sn, .035), vec2(.3 * sn, .012), .062 * sn, .04 * sn, 0., .5, 8.);
    bk = hsmin(bk, cap(q, vec2(.3 * sn, .012), vec2(.37 * sn, -.03), .04 * sn, .028 * sn, .5, .8, 8.), .02);
    bk = hmin(bk, cap(q, vec2(.37 * sn, -.03), vec2(.385 * sn, -.085 * sn), .028 * sn, .005, .8, 1., 8.));
    vec2 qj = rot2(uKaak) * (q - sch) + sch;
    bk = hmin(bk, cap(qj, vec2(.14 * sn, -.035), vec2(.3 * sn, -.05), .04 * sn, .016, 0., 1., 8.));
    h = hsmin(h, bk, .015);
    // de bek van binnen
    // veerplukjes achter op de kop
    H pk = cap(q, vec2(-.06, .1), vec2(-.2, .13), .035, .004, 0., 1., 4.);
    pk = hmin(pk, cap(q, vec2(-.1, .04), vec2(-.24, .05), .035, .004, 0., 1., 4.));
    pk = hmin(pk, cap(q, vec2(-.1, -.03), vec2(-.22, -.06), .03, .004, 0., 1., 4.));
#if WEZEN == 1
    // de kuif van de feniks: drie lange, gebogen vlammenveren
    pk = hmin(pk, cap(q, vec2(.02, .12), vec2(-.1, .26), .03, .022, 0., .5, 4.));
    pk = hmin(pk, cap(q, vec2(-.1, .26), vec2(-.26, .33), .022, .004, .5, 1., 4.));
    pk = hmin(pk, cap(q, vec2(-.02, .1), vec2(-.16, .2), .026, .018, 0., .5, 4.));
    pk = hmin(pk, cap(q, vec2(-.16, .2), vec2(-.32, .22), .018, .003, .5, 1., 4.));
    pk = hmin(pk, cap(q, vec2(.06, .12), vec2(.0, .3), .02, .003, 0., 1., 4.));
#endif
    h = hsmin(h, pk, .03);
  } else {
    h = cap(q, vec2(-.06, .1), vec2(-.2, .13), .03, .004, 0., 1., 4.);
  }
  h.d *= uKopS; h.r *= uKopS;
  h.n = normalize(uKopB * h.n + 1e-6);
  return h;
}
#endif

// ── vleugels: botten en vlies ──
// w = 0 (achter) of 10 (voor); punten: S, E, W, F1, F2, F3, F4, A, duim
H vleugelBot(vec2 p, int w){
  vec2 S = uVl[w].xy, E = uVl[w + 1].xy, W = uVl[w + 2].xy;
  float rS = uVl[w].z, rE = uVl[w + 1].z, rW = uVl[w + 2].z;
  H b = cap(p, S, E, rS, rE, 0., .3, 7.);
  b = hsmin(b, cap(p, E, W, rE, rW, .3, .6, 7.), rE * .6);
  for (int i = 3; i < 7; i++) b = hmin(b, cap(p, W, uVl[w + i].xy, rW * .62, uVl[w + i].z, .6, 1., 7.));
  b = hmin(b, cap(p, W, uVl[w + 8].xy, rW * .5, rW * .08, .6, 1., 5.));
  return b;
}
float vlies(vec2 p, int w, int sc){
  float d = sdVeel(p, uVl[w].xy, uVl[w + 2].xy, uVl[w + 3].xy, uVl[w + 4].xy, uVl[w + 5].xy, uVl[w + 6].xy, uVl[w + 7].xy);
  for (int i = 0; i < 4; i++) {
    vec4 c = uSc[sc + i];
    if (c.z > 0.) d = max(d, c.z - length(p - c.xy));
  }
  return d;
}
vec4 vleugel(vec2 p, int w, int sc, vec3 VN, float donker, float zicht){
  if (zicht < .01) return vec4(0.);
  vec4 bb = uVlB[w / 10];
  if (length(p - bb.xy) > bb.z) return vec4(0.);
  float dv = vlies(p, w, sc);
  H b = vleugelBot(p, w);
  float av = clamp(.5 - dv / px, 0., 1.);
  float ab = clamp(.5 - b.d / px, 0., 1.);
  if (av + ab < .001) return vec4(0.);
  vec3 col = vec3(0.);
  // het vlies: vlak, met aders, een doorhangende vorm tussen de vingers en doorschijnend tegen het licht
  vec3 N = VN.z < 0. ? -VN : VN;
  vec2 W = uVl[w + 2].xy;
  float db = b.d;
  float zak = smoothstep(0., .06 * uS, db);
  vec3 Nz = normalize(N + vec3(normalize(p - W + 1e-6) * .25 * zak, 0.));
  vec3 alb = uC4 * (.75 + .25 * (1. - zak));
  // aders: fijne lijnen die van de pols uitwaaieren, met wat ruis
  vec2 rw = p - W;
  float ang = atan(rw.y, rw.x);
  float ad = abs(sin(ang * 34. + fbm3(p / uS * 6.) * 3.));
  float ader = smoothstep(.12, .0, ad) * smoothstep(.02 * uS, .12 * uS, db) * uDetail;
  vec3 c = licht(alb, Nz, .15, 18.);
  // tegenlicht
  float dun = smoothstep(.0, .25 * uS, db) ;
  float door = uDoor * (.25 + .75 * dun) * (1. - .6 * ader);
  c += uRK * door * (uC4 * 4. + vec3(.12, .02, .0));
  c *= 1. - .35 * ader;
  // de rand van het vlies iets donkerder en dikker
  c *= 1. - .35 * smoothstep(-.012 * uS, 0., dv);
  col = c;
  float a = av;
  // de botten erop
  vec3 bc = licht(mix(uC1, uC2, .4), normaal(b), .35, 24.);
  if (b.m > 4.5 && b.m < 5.5) bc = licht(mix(uC5 * .4, uC5, smoothstep(.6, 1., b.u)), normaal(b), .6, 30.);
  col = mix(col, bc, ab);
  a = max(a, ab);
  col *= donker;
  return vec4(col, a * zicht);
}

#if WEZEN == 1 || WEZEN == 3
// ── een gevederde vleugel: dezelfde botten, met slagpennen en dekveren ──
vec4 vleugelV(vec2 p, int w, vec3 VN, float donker, float zicht, vec3 kBasis, vec3 kPunt, float gloed){
  if (zicht < .01) return vec4(0.);
  vec4 bb = uVlB[w / 10];
  if (length(p - bb.xy) > bb.z) return vec4(0.);
  vec2 S = uVl[w].xy, W = uVl[w + 2].xy;
  float dp = sdVeel(p, S, W, uVl[w + 3].xy, uVl[w + 4].xy, uVl[w + 5].xy, uVl[w + 6].xy, uVl[w + 7].xy);
  // alleen de arm (een vogel laat geen vingerbotten zien)
  vec2 E = uVl[w + 1].xy;
  H b = cap(p, S, E, uVl[w].z, uVl[w + 1].z, 0., .3, 7.);
  b = hsmin(b, cap(p, E, W, uVl[w + 1].z, uVl[w + 2].z, .3, .6, 7.), uVl[w + 1].z * .6);
  // slagpennen: per pen een strook rond de pols; de achterrand wordt gekarteld door de punten van de pennen
  vec2 rw = p - W;
  float rr = length(rw);
  float ang = atan(rw.y, rw.x) + .12 * sin(rr / uS * 2.5);
  float N = 22.;
  float fid = floor(ang / 6.2832 * N);
  float fr = fract(ang / 6.2832 * N);
  float pen = abs(fr * 2. - 1.);
  float penLicht = .9 + .16 * h11(fid * 3.1);
  float kart = .09 * uS * pow(pen, 1.6) * smoothstep(-.3 * uS, -.02 * uS, dp);
  float d = dp + kart;
  float a = clamp(.5 - d / px, 0., 1.);
  float ab = clamp(.5 - b.d / px, 0., 1.);
  if (a + ab < .001) return vec4(0.);
  vec3 Nn = VN.z < 0. ? -VN : VN;
  // dekveren langs de voorrand: rijen geschulpte veertjes
  float voor = smoothstep(.45 * uS, .2 * uS, b.d);
  vec2 dk = vec2(ang * 9., b.d / uS * 14.);
  float rij = floor(dk.y);
  float sch = length(vec2(fract(dk.x + .5 * mod(rij, 2.)) - .5, fract(dk.y) - .15)) ;
  float dekrand = smoothstep(.42, .5, sch);
  // kleur: van de basis naar de punten
  float t = smoothstep(.0, .6 * uS, -dp + .0) ;
  vec3 alb = mix(kPunt, kBasis, smoothstep(.0, .5 * uS, b.d * .6 + (-dp) * .4));
  alb *= penLicht * (.8 + .2 * smoothstep(.0, .12, pen));    // elke pen een eigen tint, de schacht licht
  alb *= 1. - .25 * smoothstep(.8, 1., pen) - .12 * pen;      // de overlap van de pennen, licht in het midden
  alb += kBasis * .2 * smoothstep(.05, .0, pen);
  alb = mix(alb, kBasis * (1. - .3 * dekrand), voor);
  vec3 c = licht(alb, normalize(Nn + vec3(rw / max(rr, 1e-5) * .15 * (pen - .5), 0.)), .3, 20.);
  c += uDoor * uRK * kPunt * .5 * (1. - voor);
  float uit = smoothstep(.0, .5 * uS, rr);
  c += mix(kBasis, kPunt, uit) * gloed * (.45 + .55 * uit) * (.7 + .5 * fbm3(p / uS * 4. + vec2(0., -uTime * 1.5)));
  vec3 bc = licht(kBasis * .9, normaal(b), .3, 20.);
  c = mix(c, bc, ab * .35);
  return vec4(c * donker, max(a, ab) * zicht);
}
#endif

#if WEZEN != 2
// poten: 4 x 5 punten (heup, knie, enkel, voet, klauwrichting)
H poot(vec2 p, int i){
  int k = i * 5;
  vec4 A = uPt[k], B = uPt[k + 1], C = uPt[k + 2], D = uPt[k + 3], K = uPt[k + 4];
  if (A.z <= 0.) return geen();
  H h = cap(p, A.xy, B.xy, A.z, B.z, 0., .4, 0.);
  h = hsmin(h, cap(p, B.xy, C.xy, B.z, C.z, .4, .8, 0.), B.z * .5);
  h = hsmin(h, cap(p, C.xy, D.xy, C.z, D.z, .8, 1., 0.), C.z * .5);
  vec2 kd = K.xy - D.xy;
  for (int j = -1; j <= 1; j++) {
    vec2 kk = rot2(float(j) * .45) * kd;
    h = hmin(h, cap(p, D.xy, D.xy + kk, D.z * .55, D.z * .05, .0, 1., 5.));
  }
  return h;
}
#endif

#if WEZEN == 0
// ── een laag kleuren: huid met schubben en buikplaten ──
vec3 huid(H h, vec2 p){
  vec3 N = normaal(h);
  float dw = h.v * h.r / max(uS, 1e-5);   // dwars, in wezen-eenheden
  float onder = smoothstep(-.1, -.6, h.v);
  vec3 alb = mix(uC1, uC2, .35 + .35 * N.y);
  float glans = .35, ruw = 26.;
  if (h.m < .5) {
    // schubben (vervagen als ze kleiner worden dan een paar pixels)
    float sz = .05;
    float zicht = smoothstep(2.5, 7., sz * uS / px * .5) * uDetail;
    if (zicht > .01) {
      vec2 sv = vor(vec2(h.u / sz, dw / sz * 1.2));
      float dom = smoothstep(.0, .32, sv.x);
      alb *= mix(1., (.5 + .65 * dom) * (.8 + .4 * sv.y), zicht);
      glans = mix(.35, .25 + .7 * dom, zicht);
      // een fijne glinstering op de bolling van de schub
      alb += uC2 * .25 * smoothstep(.25, .45, sv.x) * zicht;
    }
    // buikplaten
    if (onder > .01) {
      float band = abs(fract(h.u / .07) - .5);
      vec3 buik = uC3 * (.75 + .25 * smoothstep(.5, .3, band)) * (1. - .45 * smoothstep(.38, .5, band) * zicht);
      alb = mix(alb, buik, onder);
      glans = mix(glans, .25, onder);
    }
  } else if (h.m > 3.5 && h.m < 5.5) {
    // hoorn, klauw en stekel: donker aan de voet, ivoor naar de punt
    alb = mix(uC5 * .3, uC5, smoothstep(.15, 1., h.u)) * (.82 + .18 * sin(h.u * 70.));
    if (h.m < 4.5) alb = mix(uC1 * .8, uC5 * .7, .5);
    glans = .9; ruw = 40.;
  } else if (h.m > .5 && h.m < 1.5) {
    // de kop: fijnere schubben
    float sz = .028;
    vec2 q = uKopI * (p - uKopO);
    float zicht = smoothstep(2.5, 6., sz * uKopS / px * .5) * uDetail;
    if (zicht > .01) {
      vec2 v = vor(q / sz * vec2(1., 1.3));
      alb *= mix(1., .7 + .5 * smoothstep(.0, .25, v.x), zicht);
      alb *= mix(1., .85 + .3 * v.y, zicht);
    }
    // lichtere kaak en keel
    alb = mix(alb, uC3 * .8, smoothstep(-.03, -.09, q.y) * smoothstep(.05, .25, q.x) * .7);
  } else if (h.m > 5.5) {
    alb = vec3(.95, .9, .78); glans = .6;
  }
  alb *= 1. - .55 * kreuk;
  return licht(alb, N, glans, ruw);
}

#elif WEZEN == 3
// ── de griffioen: achter een leeuw (korte vacht), voor een adelaar (veren), een gouden snavel ──
vec3 huid(H h, vec2 p){
  vec3 N = normaal(h);
  float dw = h.v * h.r / max(uS, 1e-5);
  vec3 alb; float glans = .2, ruw = 14.;
  if (h.m < .5) {
    float veer = smoothstep(.45, .85, h.u);
    float vacht = fbm3(vec2(h.u * 30., dw * 50.));
    vec3 leeuw = mix(uC1, uC2, .35 + .45 * N.y) * (.8 + .35 * vacht * uDetail);
    leeuw = mix(leeuw, uC3, smoothstep(-.1, -.7, h.v) * .55);
    vec2 g = vec2(h.u / .05, dw / .045);
    float rij = floor(g.y);
    vec2 f = fract(g + vec2(.5 * mod(rij, 2.), 0.)) - .5;
    float sch = smoothstep(.32, .5, length(f * vec2(1., 1.2)));
    vec3 veren = uC5 * (.8 + .25 * N.y) * (1. - .28 * sch * uDetail);
    alb = mix(leeuw, veren, veer);
  } else if (h.m < 1.5) {
    vec2 q = uKopI * (p - uKopO);
    float st = vn(vec2(q.x * 26., q.y * 80.));
    alb = uC5 * (.82 + .22 * st * uDetail);
    glans = .3;
  } else if (h.m < 4.5) {
    alb = h.u < -2.5 ? uC1 * .45 : uC5 * .85;
  } else if (h.m < 5.5) {
    alb = vec3(.08, .07, .06); glans = .8; ruw = 40.;
  } else {
    alb = mix(vec3(.55, .32, .05), vec3(1., .8, .3), smoothstep(.0, .8, h.u)); glans = 1.; ruw = 50.;
  }
  alb *= 1. - .5 * kreuk;
  return licht(alb, N, glans, ruw);
}
#elif WEZEN == 1
// ── de feniks: veren van vuur, die zelf gloeien ──
vec3 huid(H h, vec2 p){
  vec3 N = normaal(h);
  float dw = h.v * h.r / max(uS, 1e-5);
  vec3 alb; float glans = .3, ruw = 18.; float gl = 0.;
  if (h.m < .5) {
    vec2 g = vec2(h.u / .045, dw / .04);
    float rij = floor(g.y);
    vec2 f = fract(g + vec2(.5 * mod(rij, 2.), 0.)) - .5;
    float sch = smoothstep(.3, .5, length(f * vec2(1., 1.2)));
    alb = mix(uC1, uC2, .35 + .45 * N.y + .2 * smoothstep(.6, 1.2, h.u)) * (1. - .3 * sch * uDetail);
    alb = mix(alb, uC3, smoothstep(-.1, -.7, h.v) * .5);
    gl = .35 + .35 * smoothstep(-.2, -.8, h.v);
  } else if (h.m < 1.5) {
    alb = mix(uC2, uC3, .5); gl = .45;
  } else if (h.m < 4.5) {
    alb = mix(uC2, vec3(1., .95, .7), smoothstep(.2, 1., h.u)); gl = 1.2;
  } else if (h.m < 5.5) {
    alb = vec3(.2, .08, .03); glans = .8;
  } else {
    alb = mix(vec3(.7, .5, .2), vec3(1., .92, .7), smoothstep(.0, .8, h.u)); glans = 1.; ruw = 50.;
  }
  alb *= 1. - .5 * kreuk;
  vec3 c = licht(alb, N, glans, ruw);
  // gloed van binnenuit, flakkerend
  c += alb * gl * uVuur * (.75 + .5 * fbm3(p / max(uS, 1e-4) * 5. + vec2(0., -uTime * 2.)));
  return c;
}
#else
// ── de kraken: natte, gevlekte huid met lichtgevende stippen en zuignappen ──
vec3 huid(H h, vec2 p){
  vec3 N = normaal(h);
  float dw = h.v * h.r / max(uS, 1e-5);
  vec2 q = vec2(h.u * 3.5, dw * 6.) + vec2(h.m * 7.1, 0.);
  float vlek = fbm3(q * 2.2);
  vec3 alb = mix(uC1, uC2, smoothstep(.35, .7, vlek) * .8 + .2 * N.y);
  alb = mix(alb, uC3, smoothstep(-.2, -.8, h.v) * .6);
  float glans = .9, ruw = 48.;
  vec3 em = vec3(0.);
  if (h.m > 1.5 && h.m < 2.5) {
    // zuignappen aan de binnenkant van de arm
    float zs = length(vec2((fract(h.u * 15.) - .5) * 1.1, (h.v + .52) * 1.7));
    float nap = smoothstep(.36, .3, zs) * smoothstep(-.1, -.35, h.v);
    alb = mix(alb, uC3 * (.6 + .5 * smoothstep(.12, .24, zs)), nap * uDetail);
  }
  // lichtgevende stippen
  vec2 v = vor(q * 3.);
  float stip = step(.82, v.y) * smoothstep(.25, .45, v.x) * smoothstep(.15, -.3, h.v + .3);
  em += uC6 * stip * (.6 + .4 * sin(uTime * 3. + v.y * 40.)) * 2.2 * uDetail;
  alb *= 1. - .5 * kreuk;
  return licht(alb, N, glans, ruw) + em;
}
#endif

void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  px = 1.2 / uRes.y / uZoom;
  vec3 col = vec3(0.);
  float a = 0.;
  vec3 extra = vec3(0.);

#if WEZEN == 0
  // 1: de achterste vleugel
  vec4 vA = vleugel(p, 0, 0, uVN0, uVlD, uVlA);
  col = vA.rgb * vA.a; a = vA.a;
  // 2: de verre poten en de verre hoorn
  kreuk = 0.;
  H fp = hmin(poot(p, 0), poot(p, 1));
  H fh = kopD(p, 1.);
  H far = hmin(fp, fh);
  float af = clamp(.5 - far.d / px, 0., 1.);
  if (af > 0.) { vec3 c = huid(far, p) * .5; col = mix(col, c, af); a = max(a, af); }
  // 3: lijf, nek, staart, kop en de nabije poten
  kreuk = 0.;
  H b = romp(p);
  b = hsmin(b, poot(p, 2), .02 * uS);
  b = hsmin(b, poot(p, 3), .02 * uS);
  H k = kopD(p, 0.);
  // de bek van binnen: rood en gloeiend als hij opengaat
  vec2 q = uKopI * (p - uKopO);
  vec2 sch = vec2(.05, -.045);
  vec2 qj = rot2(uKaak) * (q - sch) + sch;
  float mond = max(max(-(q.y + .03 - (q.x - .05) * -.06), qj.y + .055), max(-q.x + .02, q.x - .48));
  mond = max(mond, -k.d / uKopS - .0);
  float am = clamp(.5 - mond * uKopS / px, 0., 1.) * smoothstep(.02, .12, uKaak);
  b = hsmin(b, k, .03 * uS);
  float ab = clamp(.5 - b.d / px, 0., 1.);
  if (am > 0.) {
    float diep = smoothstep(.45, .05, q.x);
    vec3 mk = mix(vec3(.25, .02, .02), uC6 * 2.2 * uMondG + vec3(.5, .08, .02), diep * diep);
    col = mix(col, mk, am); a = max(a, am);
  }
  if (ab > 0.) {
    vec3 c = huid(b, p);
    // het oog: gloeiend, met een spleetpupil
    vec2 oq = q - vec2(.215, .058);
    oq = rot2(.18) * oq;
    float oog = length(oq * vec2(1., 2.4)) - .03;
    // de oogkas: donker rond het oog, een neusgat op de snuit
    float kas = length(oq * vec2(1., 1.7)) - .055;
    c *= mix(1., .45, smoothstep(.03, -.01, kas) * step(-.0, k.d * -1.));
    float neus = length((q - vec2(.505, .035)) * vec2(1., 2.2)) - .016;
    c *= mix(1., .25, smoothstep(.006, -.004, neus) * step(0., -k.d));
    if (oog < .01 && k.d < 0.) {
      float ao = clamp(.5 - oog * uKopS / px, 0., 1.);
      float pup = length(oq * vec2(5.5, 1.)) - .028;
      vec3 oc = mix(uC6 * 1.6, uC6 * .5, smoothstep(0., .03, length(oq)));
      oc *= 1. - .85 * smoothstep(.003, -.003, pup);
      c = mix(c, oc * (.6 + 1.6 * uOogG), ao);
    }
    col = mix(col, c, ab); a = max(a, ab);
  }
  // 4: de voorste vleugel
  vec4 vV = vleugel(p, 10, 4, uVN1, 1., uVlV);
  col = mix(col, vV.rgb, vV.a); a = max(a, vV.a);
#elif WEZEN == 3
  vec3 kB = uC4, kP = vec3(.4, .24, .1);
  vec4 vA = vleugelV(p, 0, uVN0, uVlD, uVlA, kB, kP, 0.);
  col = vA.rgb * vA.a; a = vA.a;
  kreuk = 0.;
  H far = hmin(hmin(poot(p, 0), poot(p, 1)), kopV(p, 1.));
  float af = clamp(.5 - far.d / px, 0., 1.);
  if (af > 0.) { col = mix(col, huid(far, p) * .5, af); a = max(a, af); }
  kreuk = 0.;
  H b = romp(p);
  b = hsmin(b, poot(p, 2), .02 * uS);
  b = hsmin(b, poot(p, 3), .02 * uS);
  H k = kopV(p, 0.);
  b = hsmin(b, k, .03 * uS);
  float ab = clamp(.5 - b.d / px, 0., 1.);
  if (ab > 0.) {
    vec3 c = huid(b, p);
    vec2 q = uKopI * (p - uKopO);
    vec2 oq = q - vec2(.13, .062);
    float oog = length(oq) - .03;
    if (oog < .01 && k.d < 0.) {
      float ao = clamp(.5 - oog * uKopS / px, 0., 1.);
      vec3 oc = mix(uC6 * 1.3, uC6 * .45, smoothstep(.0, .03, length(oq)));
      oc *= 1. - .9 * smoothstep(.002, -.002, length(oq) - .013);
      oc += vec3(1.) * smoothstep(.007, .003, length(oq - vec2(-.01, .012)));
      c = mix(c * (1. - .5 * smoothstep(.05, .03, length(oq))), oc * (.6 + 1.2 * uOogG), ao);
    }
    col = mix(col, c, ab); a = max(a, ab);
  }
  vec4 vV = vleugelV(p, 10, uVN1, 1., uVlV, kB, kP, 0.);
  col = mix(col, vV.rgb, vV.a); a = max(a, vV.a);
#elif WEZEN == 1
  // de staartveren: lange linten van vuur achter alles
  vec3 gloedBuiten = vec3(0.);
  for (int j = 0; j < 3; j++) {
    if (j >= uTeN) break;
    H t = geen();
    for (int i = 0; i < 5; i++) {
      vec4 A = uTe[j * 6 + i], B = uTe[j * 6 + i + 1];
      t = hmin(t, cap(p, A.xy, B.xy, A.z, B.z, A.w, B.w, 4.));
    }
    float vl = fbm3(p / uS * 6. + vec2(uTime * .8, -uTime * 1.6)) - .5;
    float d = t.d - vl * .05 * uS * smoothstep(.2, 1., t.u);
    float at = clamp(.5 - d / px, 0., 1.) * (1. - smoothstep(.85, 1., t.u) * .6);
    vec3 fc = mix(uC1 * 1.4, mix(uC2, vec3(1., .95, .75), smoothstep(.6, 1., t.u)), smoothstep(.0, .7, t.u)) * (1.1 + .5 * uVuur);
    // een oog in de veer, vlak voor het eind
    float og = length((p - mix(uTe[j * 6 + 4].xy, uTe[j * 6 + 5].xy, .3)) / uS) - .05;
    fc = mix(fc, uC6 * 2., smoothstep(.02, -.01, og) * .7);
    col = mix(col, fc, at); a = max(a, at * .9);
    gloedBuiten += uC2 * .35 * exp(-max(d, 0.) / (.05 * uS)) * (1. - at);
  }
  vec4 vA = vleugelV(p, 0, uVN0, uVlD, uVlA, vec3(1., .38, .06), vec3(1., .75, .3), .4 * uVuur);
  col = mix(col, vA.rgb, vA.a); a = max(a, vA.a);
  kreuk = 0.;
  H fp = hmin(poot(p, 0), poot(p, 1));
  float af = clamp(.5 - fp.d / px, 0., 1.);
  if (af > 0.) { col = mix(col, huid(fp, p) * .6, af); a = max(a, af); }
  kreuk = 0.;
  H b = romp(p);
  H k = kopV(p, 0.);
  b = hsmin(b, k, .03 * uS);
  float vlb = fbm3(p / uS * 7. + vec2(0., -uTime * 2.)) - .5;
  float db = b.d - vlb * .02 * uS;
  float ab = clamp(.5 - db / px, 0., 1.);
  if (ab > 0.) {
    vec3 c = huid(b, p);
    vec2 q = uKopI * (p - uKopO);
    vec2 oq = q - vec2(.11, .055);
    float oog = length(oq) - .024;
    if (oog < .01 && k.d < 0.) {
      float ao = clamp(.5 - oog * uKopS / px, 0., 1.);
      c = mix(c, mix(vec3(1., 1., .9), uC6, smoothstep(.0, .02, length(oq))) * (1. + 1.5 * uOogG), ao);
    }
    col = mix(col, c, ab); a = max(a, ab);
  }
  gloedBuiten += uC2 * .5 * exp(-max(db, 0.) / (.07 * uS)) * (1. - ab) * uVuur;
  vec4 vV = vleugelV(p, 10, uVN1, 1., uVlV, vec3(1., .38, .06), vec3(1., .75, .3), .4 * uVuur);
  col = mix(col, vV.rgb, vV.a); a = max(a, vV.a);
  extra = gloedBuiten;
#else
  // de kraken: de armen achter de kop, de mantel en de kop, de armen ervoor
  H arAchter = geen(), arVoor = geen();
  for (int j = 0; j < 8; j++) {
    if (j >= uTeN) break;
    H t = geen();
    for (int i = 0; i < 5; i++) {
      vec4 A = uTe[j * 6 + i], B = uTe[j * 6 + i + 1];
      t = hmin(t, cap(p, A.xy, B.xy, A.z, B.z, A.w + float(j), B.w + float(j), 2.));
    }
    if (uTeZ[j] < uKopZ) arAchter = hmin(arAchter, t); else arVoor = hmin(arVoor, t);
  }
  arAchter.u = fract(arAchter.u); arVoor.u = fract(arVoor.u);
  kreuk = 0.;
  float aa1 = clamp(.5 - arAchter.d / px, 0., 1.);
  if (aa1 > 0.) { col = huid(arAchter, p) * .5; a = aa1; }
  kreuk = 0.;
  H b = romp(p);
  vec2 q = uKopI * (p - uKopO);
  H kp = cap(q, vec2(-.06, -.02), vec2(.1, -.03), .21, .17, 0., .2, 0.);
  kp = hsmin(kp, cap(q, vec2(.08, .1), vec2(.13, .1), .1, .095, 0., .1, 0.), .05);
  kp.d *= uKopS; kp.r *= uKopS; kp.n = normalize(uKopB * kp.n + 1e-6);
  b = hsmin(b, kp, .06 * uS);
  float ab = clamp(.5 - b.d / px, 0., 1.);
  if (ab > 0.) {
    vec3 c = huid(b, p);
    // het grote oog met een liggende pupil
    vec2 oq = (q - vec2(.14, .1)) * vec2(1., 1.2);
    float oog = length(oq) - .072;
    if (oog < .01) {
      float ao = clamp(.5 - oog * uKopS / px, 0., 1.);
      float pup = length(oq / vec2(1., mix(.12, .5, .3))) - .032;
      vec3 oc = mix(uC6 * 1.5, uC6 * .3, smoothstep(.0, .07, length(oq)));
      oc *= .7 + .5 * vn(vec2(atan(oq.y, oq.x) * 12., length(oq) * 60.));
      oc = mix(oc, vec3(.0), smoothstep(.004, -.004, length(max(abs(oq) - vec2(.04, .006), 0.)) - .006));
      oc += vec3(1.) * smoothstep(.012, .006, length(oq - vec2(-.025, .028)));
      c = mix(c * (1. - .6 * smoothstep(.09, .05, length(oq))), oc * (.6 + 1.3 * uOogG), ao);
    }
    col = mix(col, c, ab); a = max(a, ab);
  }
  kreuk = 0.;
  float av = clamp(.5 - arVoor.d / px, 0., 1.);
  if (av > 0.) { col = mix(col, huid(arVoor, p), av); a = max(a, av); }
#endif

  // mist en silhouet (ver weg of tegen het licht)
  col = mix(col, uMK, uMist);
  col = mix(col, uMK * .12 + uRK * .0, uSil);
  o = vec4((col * a + extra * (1. - uSil)) * uAlpha, a * uAlpha);
}
`;

  // ───────────────────────── het oog ─────────────────────────
  const FS_OOG = () => `${SH().KOP}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uZoom, uTime;
uniform float uOpen, uPupil, uSchaal, uA, uGloed, uKnip, uVorm, uSoort;
uniform vec2 uKijk, uMid;
uniform vec3 uIris1, uIris2, uHuid1, uHuid2, uRK, uLK;
${SH().GEMEEN}
${HULP}
// voronoi met de vector naar het middelpunt van de cel (voor bolle schubben)
vec4 cel(vec2 p){
  vec2 n = floor(p), f = fract(p);
  float md = 8., md2 = 8.; vec2 mr = vec2(0.), mid = vec2(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + h22(n + g) * .8 + .1 - f;
    float d = dot(r, r);
    if (d < md) { md2 = md; md = d; mr = r; mid = n + g; } else if (d < md2) md2 = d;
  }
  return vec4(sqrt(md2) - sqrt(md), h21(mid), mr);
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  float pxs = 1.5 / uRes.y / uZoom / uSchaal;
  vec2 q = (p - uMid) / uSchaal;
  vec2 e = rot2(-.1) * q;
  float W = .6;
  float xr = clamp(e.x / W, -1., 1.);
  float boog = 1. - xr * xr;
  float bov = .33 * pow(boog, .7) * uOpen + .004 - .04 * e.x * uOpen;
  float ond = -.2 * pow(boog, .8) * mix(.3, 1., uOpen) - .004;
  float binnen = min(min(bov - e.y, e.y - ond), W - abs(e.x));
  float ai = smoothstep(-pxs, pxs, binnen);
  // ── de huid: bolle schubben, groter naar buiten, kleine rond de oogleden ──
  float afst = length(e * vec2(.75, 1.15));
  float sch = mix(26., 9., smoothstep(.3, .95, afst));
  vec2 sq = e * sch * (uSoort > .5 && uSoort < 1.5 ? vec2(.55, 1.5) : vec2(1.));
  sq = rot2(.3 * sin(e.y * 3.)) * sq;
  vec4 v = cel(sq + vec2(5.3, 2.1));
  float rnd = smoothstep(.0, .14, v.x);
  if (uSoort > 1.5) { rnd = .75 + .25 * fbm3(e * 9.); v.zw *= .2; v.y = fbm3(e * 3.5 + 2.); }
  vec3 N = normalize(vec3(-v.zw * 1.6 * rnd, 1.));
  vec3 Lw = normalize(vec3(.35, -.55, .75));
  vec3 Lk = normalize(vec3(-.5, .8, .5));
  vec3 alb = mix(uHuid1, uHuid2, .25 + .55 * v.y) * (.55 + .45 * rnd);
  vec3 hu = alb * (.12 + .9 * max(dot(N, Lw), 0.) * uLK * .9);
  hu += alb * .6 * max(dot(N, Lk), 0.) * vec3(.35, .45, .7);
  hu += uLK * pow(max(dot(reflect(-Lw, N), vec3(0., 0., 1.)), 0.), 18.) * .5 * rnd;
  hu *= .25 + .75 * rnd;
  // de wenkbrauwrichel werpt schaduw over de bovenkant van het oog
  float boven = e.y - bov;
  hu *= 1. - .6 * smoothstep(.0, .06, boven) * (1. - smoothstep(.12, .3, boven));
  hu *= 1. - .55 * smoothstep(.35, .7, e.y - .1 * boog);
  // de oogleden: een dikke, glanzende rand
  float lb = abs(e.y - bov), lo = abs(e.y - ond);
  float lid = min(lb, lo);
  float lidRand = smoothstep(.045, .0, lid) * step(abs(e.x), W);
  hu = mix(hu, uHuid1 * .25, lidRand * .7);
  hu += uRK * .55 * smoothstep(.012, .0, abs(e.y - ond + .016)) * step(abs(e.x), W * .92) * boog;
  hu += vec3(.8, .85, 1.) * .2 * smoothstep(.01, .0, abs(e.y - bov - .02)) * step(abs(e.x), W * .8) * boog;
  // vignet: het oog is het enige wat telt
  hu *= 1. - .75 * smoothstep(.45, 1.05, length(e * vec2(.8, 1.2)));
  vec3 col = hu;
  if (ai > .001) {
    vec2 iq = e - uKijk;
    float r = length(iq);
    float ang = atan(iq.y, iq.x);
    // lagen van de iris
    vec3 ic = mix(uIris1 * vec3(1.2, 1.05, .8), uIris2, smoothstep(.05, .3, r));
    ic = mix(ic, uIris2 * .25, smoothstep(.27, .36, r));
    float vez = fbm(vec2(ang * 9.55, r * 3.5 + .5));
    float fijn = vn(vec2(ang * 95.5, r * 9.));
    float fijn2 = vn(vec2(ang * 40. + 3., r * 22.));
    ic *= .55 + .55 * vez + .3 * (fijn - .5) + .2 * (fijn2 - .5);
    // de kraag rond de pupil en donkere crypten
    float kraag = .1 + .018 * sin(ang * 13. + vez * 6.);
    ic += uIris1 * .8 * smoothstep(.02, .0, abs(r - kraag - .02));
    ic *= 1. - .45 * smoothstep(.55, .75, vn(vec2(ang * 18., r * 14.))) * smoothstep(.13, .2, r) * (1. - smoothstep(.26, .3, r));
    // de spleetpupil, met een rode gloed in de rand
    float pw = mix(.01, .1, uPupil);
    float pd = length(iq / vec2(pw, .27)) - 1.;
    if (uVorm > .5 && uVorm < 1.5) pd = r / mix(.035, .14, uPupil) - 1.;
    if (uVorm > 1.5) pd = length(iq / vec2(.21, mix(.01, .05, uPupil))) - 1.;
    float pup = smoothstep(.06, -.06, pd);
    ic += vec3(1., .25, .05) * smoothstep(.35, .0, pd) * (1. - pup) * .5 * uGloed;
    ic = mix(ic, vec3(.004, .002, .002), pup);
    ic *= .55 + .9 * uGloed;
    // schaduw van het bovenste ooglid en in de ooghoeken
    ic *= .2 + .8 * smoothstep(.0, .09, bov - e.y);
    ic *= .5 + .5 * smoothstep(.0, .12, W - abs(e.x));
    // het natte hoornvlies: een vensterreflectie, een puntje en het vuur weerspiegeld
    vec2 gq = e - vec2(-.15, .12 * uOpen);
    float venster = smoothstep(.02, .0, length(max(abs(gq * vec2(1., 1.5)) - vec2(.035, .02), 0.)) - .012);
    ic += vec3(1., .97, .92) * venster * .55;
    ic += vec3(1.) * smoothstep(.014, .008, length(e - vec2(.11, -.07))) * .7;
    ic += vec3(1., .45, .1) * .25 * smoothstep(.12, .0, length((e - vec2(.18, -.1)) * vec2(1., 2.)));
    // een dun glanslijntje langs het onderste ooglid
    ic += vec3(1., .95, .85) * .5 * smoothstep(.008, .0, abs(e.y - ond - .012)) * boog;
    col = mix(col, ic, ai);
  }
  o = vec4(col * uA, uA);
}`;

  // ───────────────────────── de kaart die gesmeed wordt ─────────────────────────
  const FS_SMEED = () => `${SH().KOP}
in vec2 vUv; in vec3 vN; in vec3 vWp; out vec4 o;
uniform float uTime, uHeet, uVorm, uA, uAfkoel, uPuls;
uniform vec3 uK1, uK2;
${SH().GEMEEN}
${HULP}
float rrect(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
void main(){
  // p in kaart-eenheden: de kaart is 1 breed en 440/300 hoog, er is een rand van 12,5% voor de gloed
  vec2 p = (vUv - .5) * vec2(1.25, 1.25 * 440. / 300.);
  float H2 = .5 * 440. / 300.;
  float d = rrect(p, vec2(.5, H2), .07);
  // de vorm: van een kluit gloeiend metaal naar een strakke kaart
  float n = fbm(p * 3.5 + vec2(0., -uTime * .5));
  float blob = length(p * vec2(1., .72)) - .2 - .42 * uVorm + (n - .5) * .3 * (1. - uVorm);
  float dd = mix(blob, d + (n - .5) * .025 * (1. - uVorm), smoothstep(.2, 1., uVorm));
  float px = fwidth(dd) * 1.2;
  float in1 = smoothstep(px, -px, dd);
  // het metaal: donker en gloeiend in de naden, heter waar net geslagen is
  vec2 v = vor(p * 11. + vec2(1.7, uTime * .05) + vec2(fbm(p * 4.), fbm(p * 4. + 3.)) * 1.5);
  float naad = exp(-v.x * 22.) * (.35 + .65 * smoothstep(.3, .7, fbm(p * 3. + uTime * .1)));
  float stroom = fbm(p * 5. + vec2(fbm(p * 2.5 + uTime * .15) * 1.5, -uTime * .35));
  float heet = uHeet * (1. - uAfkoel);
  vec3 metaal = mix(vec3(.05, .02, .015), vec3(.35, .08, .02), stroom * heet);
  metaal += uK2 * naad * (.25 + 1.1 * heet) * (.5 + .6 * stroom);
  metaal += vec3(1., .9, .7) * pow(naad, 3.) * heet * .8;
  // de vormen van de kaart verschijnen als gloeiende groeven: de rand, de cirkel van het cijfer, de naamplaat
  float groef = exp(-abs(d + .045) * 140.);
  groef += exp(-abs(length(p - vec2(-.21, .41)) - .12) * 160.) * smoothstep(.5, .9, uVorm);
  groef += exp(-abs(length(p - vec2(.0, .12)) - .2) * 140.) * smoothstep(.55, 1., uVorm);
  groef += exp(-abs(rrect(p - vec2(0., -.3), vec2(.4, .065), .03)) * 160.) * smoothstep(.6, 1., uVorm);
  metaal += uK1 * groef * (1.2 + 2. * uPuls) * smoothstep(.3, .8, uVorm);
  // de slag: een golf van wit licht over het oppervlak
  metaal += vec3(1., .7, .4) * uPuls * .22 * (.4 + .6 * stroom);
  // gloeiende rand
  float rand = exp(-abs(dd) * 60.) * (.7 + 1.2 * uPuls);
  vec3 col = metaal * in1 + uK2 * rand * (.6 + heet);
  float al = clamp(in1, 0., 1.);
  o = vec4(col * uA, al * uA);
}`;

  // ───────────────────────── lichtscheuren in het pakje ─────────────────────────
  const FS_SCHEUR = () => `${SH().KOP}
in vec2 vUv; in vec3 vN; in vec3 vWp; out vec4 o;
uniform float uTime, uGroei, uA, uPuls;
uniform vec3 uK1, uK2;
${SH().GEMEEN}
${HULP}
void main(){
  vec2 p = (vUv - .5) * vec2(.96, 1.44);
  // scheuren groeien vanuit de naad (iets boven het midden) naar buiten, cel voor cel
  vec2 c = p - vec2(0., .22);
  float r = length(c * vec2(1., .75));
  vec2 w = p * 3.6 + vec2(fbm(p * 2.5), fbm(p * 2.5 + 4.)) * .9;
  vec2 v = vor(w);
  float drempel = r * 1.25 + .35 * v.y;
  float aan = smoothstep(drempel, drempel - .08, uGroei);
  float lijn = exp(-v.x * 70.) + .25 * exp(-v.x * 12.);
  float zicht = lijn * aan;
  // de naad zelf
  float naad = exp(-abs(c.y + .015 * sin(c.x * 30.)) * 90.) * smoothstep(.5, .0, abs(c.x)) * smoothstep(.0, .3, uGroei);
  float a = zicht * (.6 + .8 * uPuls) + naad * (.4 + .9 * uPuls);
  vec3 col = mix(uK2, vec3(1., .96, .85), smoothstep(.6, 2., a)) * a;
  float m = smoothstep(.49, .45, abs(p.x)) * smoothstep(.71, .67, abs(p.y));
  o = vec4(col * m * uA * 1.6, 0.);
}`;

  // De programma's van één wezen (de wereld, het wezen, het oog en de rest). naam: 'mythisch-<wezen>'.
  function module(wezen) {
    const nr = WEZEN_NR[wezen] || 0;
    const s = SH();
    return {
      naam: 'mythisch-' + wezen,
      shaders: {
        wereld: { vs: s.VS_VOL, fs: FS_WERELD(nr) },
        kopie: { vs: s.VS_VOL, fs: FS_KOPIE() },
        wezen: { vs: VS_RECHT(), fs: FS_WEZEN(nr), teken: 'strip' },
        oog: { vs: s.VS_VOL, fs: FS_OOG() },
        smeed: { vs: s.VS_VLAK, fs: FS_SMEED(), teken: 'strip' },
        scheur: { vs: s.VS_VLAK, fs: FS_SCHEUR(), teken: 'strip' },
      },
    };
  }

  // ═════════════════════════ het skelet ═════════════════════════
  // Een wezen staat in zijn eigen 3D-ruimte: x naar voren, y omhoog, z naar de camera (bij draai 0 zie je de linkerflank).
  const PI = Math.PI;
  const v3 = (x, y, z) => [x, y, z];

  // De bouw van elk gevleugeld wezen: lijf, staart, nek, kop, vleugels, poten.
  const BOUW = {
    draak: {
      B: [[-0.55, 0.0, 0.19], [-0.15, 0.06, 0.245], [0.25, 0.085, 0.262], [0.6, 0.14, 0.215]],
      TR: [0.118, 0.09, 0.068, 0.05, 0.035, 0.024, 0.016], TL: 0.32, TK: 0.06, TH: 0.1,
      NR: [0.21, 0.175, 0.15, 0.132, 0.12], NL: 0.185, kopG: 1.3, kopL: 0.8,
      vinger: [[0.1, 2.6], [-0.6, 2.32], [-1.08, 1.78], [-1.3, 1.02]], W: [0.25, 1.28], E: [-0.3, 0.68], A: [-0.62, 0.06], VR: [0.06, 0.045, 0.036, 0.009, 0.008, 0.007, 0.006, 0.02, 0.02],
      voorV: [[0.42, -0.1, 0.09], [0.3, -0.3, 0.062], [0.45, -0.4, 0.048], [0.56, -0.38, 0.034], [0.66, -0.42, 0]],
      voorS: [[0.42, -0.08, 0.09], [0.5, -0.37, 0.065], [0.44, -0.6, 0.05], [0.56, -0.67, 0.035], [0.68, -0.7, 0]],
      achV: [[-0.45, -0.06, 0.15], [-0.56, -0.32, 0.085], [-0.85, -0.38, 0.058], [-1.0, -0.42, 0.04], [-1.12, -0.42, 0]],
      achS: [[-0.45, -0.04, 0.15], [-0.24, -0.36, 0.09], [-0.47, -0.58, 0.06], [-0.33, -0.69, 0.04], [-0.2, -0.71, 0]],
    },
    griffioen: {
      // een leeuwenlijf met de borst en kop van een adelaar
      B: [[-0.55, 0.02, 0.2], [-0.18, 0.05, 0.23], [0.2, 0.09, 0.255], [0.52, 0.16, 0.235]],
      TR: [0.05, 0.04, 0.033, 0.028, 0.024, 0.022, 0.02], TL: 0.24, TK: -0.09, TH: 0.55,
      NR: [0.2, 0.17, 0.15], NL: 0.16, kopG: 1.25, kopL: 0.6,
      vinger: [[0.1, 2.8], [-0.7, 2.55], [-1.1, 1.9], [-1.05, 1.0]], W: [0.25, 1.3], E: [-0.25, 0.68], A: [-0.5, 0.08], VR: [0.07, 0.05, 0.04, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02],
      voorV: [[0.42, -0.08, 0.075], [0.32, -0.3, 0.05], [0.46, -0.4, 0.035], [0.56, -0.4, 0.028], [0.66, -0.45, 0]],
      voorS: [[0.42, -0.08, 0.075], [0.48, -0.36, 0.05], [0.44, -0.6, 0.035], [0.54, -0.68, 0.03], [0.64, -0.72, 0]],
      achV: [[-0.45, -0.04, 0.17], [-0.58, -0.3, 0.1], [-0.86, -0.36, 0.07], [-1.0, -0.4, 0.06], [-1.1, -0.42, 0]],
      achS: [[-0.45, -0.02, 0.17], [-0.26, -0.36, 0.1], [-0.46, -0.58, 0.07], [-0.32, -0.7, 0.065], [-0.22, -0.72, 0]],
    },
    feniks: {
      // een slanke vogel: klein lijf, lange nek, grote vleugels en lange vurige staartveren (apart)
      B: [[-0.3, 0.0, 0.13], [-0.05, 0.04, 0.17], [0.2, 0.08, 0.175], [0.4, 0.14, 0.14]],
      TR: [0.09, 0.06, 0.035], TL: 0.18, TK: -0.05, TH: 0.15,
      NR: [0.12, 0.105, 0.092, 0.082, 0.075], NL: 0.15, kopG: 1.05, kopL: 0.55,
      vinger: [[0.15, 3.05], [-0.75, 2.75], [-1.15, 2.05], [-1.05, 1.05]], W: [0.25, 1.35], E: [-0.25, 0.7], A: [-0.42, 0.06], VR: [0.055, 0.04, 0.032, 0.01, 0.01, 0.01, 0.01, 0.02, 0.02],
      voorV: [[0.1, -0.12, 0.04], [0.0, -0.28, 0.025], [-0.15, -0.32, 0.018], [-0.3, -0.34, 0.012], [-0.38, -0.36, 0]],
      voorS: [[0.1, -0.12, 0.04], [0.15, -0.35, 0.025], [0.1, -0.58, 0.018], [0.2, -0.62, 0.014], [0.3, -0.64, 0]],
      achV: null, achS: null,
      pluimen: 3,
    },
  };

  // o: { t, fase (vleugelslag), slagA, slagM (gemiddelde hoek), vouw, vouwA, nek, nekK, kop, kaak, staart, poten (0 vliegen, 1 staan), adem }
  function vleugelSkelet(o, soort) {
    const C = BOUW[soort] || BOUW.draak;
    const sp = [];
    const ademS = 1 + 0.035 * (o.adem || 0);
    const bob = o.bob || 0;
    const B = C.B.map((b, i) => [b[0], b[1] + bob, b[2] * (i === 1 || i === 2 ? ademS : 1)]);
    // de staart: vanaf de heup naar achteren, golvend
    const staart = [];
    let x = B[0][0], y = B[0][1], a = PI + (o.staartH === undefined ? C.TH : o.staartH);
    for (let i = 0; i < C.TR.length; i++) {
      a += (o.staartK === undefined ? C.TK : o.staartK) + (o.staart || 0.12) * Math.sin(o.t * (o.staartF || 2.1) - i * 0.75) * (0.35 + 0.13 * i);
      x += Math.cos(a) * C.TL;
      y += Math.sin(a) * C.TL;
      staart.push([x, y, 0, C.TR[i]]);
    }
    // de nek: een S-bocht vanaf de schouders
    const nek = [];
    let nx = B[3][0], ny = B[3][1], na = o.nek === undefined ? 0.95 : o.nek;
    const NK = (o.nekK === undefined ? -0.2 : o.nekK) * (5 / C.NR.length);
    for (let i = 0; i < C.NR.length; i++) {
      na += NK;
      nx += Math.cos(na) * C.NL;
      ny += Math.sin(na) * C.NL;
      nek.push([nx, ny, 0, C.NR[i]]);
    }
    for (let i = staart.length - 1; i >= 0; i--) sp.push(staart[i]);
    for (const b of B) sp.push([b[0], b[1], 0, b[2]]);
    for (const n of nek) sp.push(n);
    // booglengte: 0 bij de heup
    const u = new Array(sp.length).fill(0);
    const h0 = staart.length;
    for (let i = h0 + 1; i < sp.length; i++) u[i] = u[i - 1] + Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]);
    for (let i = h0 - 1; i >= 0; i--) u[i] = u[i + 1] - Math.hypot(sp[i][0] - sp[i + 1][0], sp[i][1] - sp[i + 1][1]);
    const kopHoek = na + (o.kop || 0);
    const kop = { o: [nx, ny, 0], f: [Math.cos(kopHoek), Math.sin(kopHoek), 0], up: [-Math.sin(kopHoek), Math.cos(kopHoek), 0] };

    // de vleugels in het vlak van de vleugel: (a langs het lijf, b de spanwijdte)
    const fase = o.fase || 0;
    const phi0 = (o.slagM === undefined ? 0.35 : o.slagM) + (o.slagA === undefined ? 0.75 : o.slagA) * Math.sin(fase);
    const vouw = klem((o.vouw || 0) + (o.vouwA === undefined ? 0.35 : o.vouwA) * (0.5 + 0.5 * Math.cos(fase)), 0, 1);
    const zweep = -0.35 * Math.cos(fase) * (o.slagA === undefined ? 0.75 : o.slagA);
    const vl = [];
    for (const s of [-1, 1]) {
      const S = [B[3][0] - 0.18, B[3][1] + 0.06 + C.B[3][2] * 0.3, 0.13 * s];
      const E = [C.E[0] * (1 - 0.25 * vouw), C.E[1] * (1 - 0.3 * vouw)];
      const Wb = [C.W[0] - 0.45 * vouw, C.W[1] * (1 - 0.5 * vouw)];
      const tips = C.vinger.map(([va, vb], i) => {
        const da = va - C.W[0], db = vb - C.W[1];
        const hoek = Math.atan2(db, da) + vouw * (1.35 - 0.12 * i);
        const len = Math.hypot(da, db) * (1 - 0.55 * vouw);
        return [Wb[0] + Math.cos(hoek) * len, Wb[1] + Math.sin(hoek) * len];
      });
      const duim = [Wb[0] + 0.2, Wb[1] + 0.03];
      const naar3 = ([pa, pb], buig) => {
        const ph = phi0 + buig * zweep * (pb / 2.6);
        return [S[0] + pa, S[1] + pb * Math.sin(ph), s * (Math.abs(S[2]) + pb * Math.cos(ph))];
      };
      vl.push({ pts: [S, naar3(E, 0.3), naar3(Wb, 0.6), ...tips.map((tp) => naar3(tp, 1)), [C.A[0], C.A[1] + bob, 0.12 * s], naar3(duim, 0.6)], r: C.VR, s });
    }
    // de poten: staan (1) of ingetrokken tijdens het vliegen (0)
    const pp = klem(o.poten || 0, 0, 1);
    const L = (A, Bp) => A.map((v, i) => [mix(v[0], Bp[i][0], pp), mix(v[1], Bp[i][1], pp), 0, v[2]]);
    const poten = [];
    for (const s of [-1, 1]) {
      for (const [V, St] of [[C.achV, C.achS], [C.voorV, C.voorS]]) {
        if (!V) continue;
        const pt = L(V, St).map((q) => [q[0], q[1] + bob, s * (0.14 + 0.02 * q[1]), q[3]]);
        pt.s = s;
        poten.push(pt);
      }
    }
    // de feniks: lange staartveren die achter het lijf aan golven
    let te = null;
    if (C.pluimen) {
      te = [];
      for (let j = 0; j < C.pluimen; j++) {
        const ch = [];
        let px = B[0][0] + 0.05, py = B[0][1] - 0.02, pa = PI + 0.25 + (j - 1) * 0.22 + (o.staartH || 0);
        const zz = (j - 1) * 0.08;
        for (let i = 0; i < 6; i++) {
          ch.push([px, py, zz, i === 0 ? 0.05 : 0.045 - 0.006 * i]);
          pa += 0.08 + (o.staart || 0.12) * 1.4 * Math.sin(o.t * 2.3 - i * 0.9 + j * 1.3) * (0.3 + 0.12 * i);
          px += Math.cos(pa) * (0.26 + 0.03 * j);
          py += Math.sin(pa) * (0.26 + 0.03 * j);
        }
        te.push(ch);
      }
    }
    return { sp, u, kop, vl, poten, te, kopL: C.kopL, kopG: C.kopG, kaak: o.kaak || 0 };
  }
  const draakSkelet = (o) => vleugelSkelet(o, 'draak');

  // De kraken: een mantel boven de kop, twee grote ogen en acht armen. Dezelfde houdingen als de vliegers:
  //   fase/slagA = de golf door de armen, slagM = hoe wijd de armen staan (1 = wijd open), kaak = de bek/het uitwaaieren,
  //   nek/kop = de kanteling van de mantel
  function krakenSkelet(o) {
    const ademS = 1 + 0.05 * (o.adem || 0);
    const bob = o.bob || 0;
    const kant = (o.kop || 0) * 0.6;
    // de mantel: van de kop omhoog naar achteren
    const M0 = [[0.0, 0.05, 0.3], [-0.1, 0.36, 0.39 * ademS], [-0.24, 0.66, 0.33 * ademS], [-0.36, 0.86, 0.21], [-0.42, 0.97, 0.08]];
    const c0 = Math.cos(kant), s0 = Math.sin(kant);
    const sp = M0.map(([x, y, r]) => [x * c0 - y * s0, x * s0 + y * c0 + bob, 0, r]).reverse();
    const u = sp.map((_, i) => i * 0.3);
    const kop = { o: [0.06, 0.02 + bob, 0], f: [1, 0, 0], up: [0, 1, 0] };
    // acht armen vanaf de onderkant van de kop
    const te = [];
    const wijd = o.slagM === undefined ? 0.4 : o.slagM;
    const golf = o.slagA === undefined ? 0.5 : o.slagA;
    for (let j = 0; j < 8; j++) {
      const hk = (j / 8) * 2 * PI + 0.2;
      const zr = Math.sin(hk), xr = Math.cos(hk);
      const ch = [];
      let px = 0.02 + 0.16 * xr, py = -0.14 + bob, pz = 0.16 * zr;
      // basisrichting: omlaag, en naar buiten als ze wijd staan
      let dx = xr * (0.25 + 0.9 * wijd), dy = -1 + 0.6 * wijd, dz = zr * (0.25 + 0.9 * wijd);
      for (let i = 0; i < 6; i++) {
        ch.push([px, py, pz, 0.105 * (1 - i / 6.2) + 0.008]);
        const g = golf * Math.sin((o.fase || 0) - i * 0.8 + j * 0.9) * (0.25 + 0.15 * i);
        const krul = (o.kaak || 0) * 0.5 * i;
        const l = Math.hypot(dx, dy, dz) || 1;
        let nx = dx / l, ny = dy / l, nz = dz / l;
        // de golf buigt de arm in zijn eigen vlak, de krul draait het einde op
        nx += g * xr + krul * xr * 0.3;
        ny += g * 0.6 + krul * 0.5;
        nz += g * zr;
        const L = 0.36 - 0.025 * i;
        const l2 = Math.hypot(nx, ny, nz) || 1;
        px += (nx / l2) * L; py += (ny / l2) * L; pz += (nz / l2) * L;
        dx = nx; dy = ny; dz = nz;
      }
      te.push(ch);
    }
    return { sp, u, kop, vl: null, poten: null, te, kopL: 0.5, kopG: 1.0, kaak: o.kaak || 0 };
  }
  const SKELET = { draak: draakSkelet, griffioen: (o) => vleugelSkelet(o, 'griffioen'), feniks: (o) => vleugelSkelet(o, 'feniks'), kraken: krakenSkelet };

  // 3D draaien (eerst rollen om de lengteas, dan kantelen, dan wenden) en projecteren
  function draaier(wend, kantel, rol) {
    const cy = Math.cos(wend), sy = Math.sin(wend), cz = Math.cos(kantel), sz = Math.sin(kantel), cx = Math.cos(rol), sx = Math.sin(rol);
    return (p) => {
      // rol om x
      let x = p[0], y = p[1] * cx - p[2] * sx, z = p[1] * sx + p[2] * cx;
      // kantel om z (neus omhoog)
      const x2 = x * cz - y * sz, y2 = x * sz + y * cz;
      x = x2; y = y2;
      // wend om y (naar de camera)
      const x3 = x * cy + z * sy, z3 = -x * sy + z * cy;
      return [x3, y, z3];
    };
  }

  // Zet een skelet om in de uniforms van de shader. pl: { x, y, s (schaal: p-ruimte per eenheid), wend, kantel, rol }
  function projecteer(sk, pl, U) {
    const R = draaier(pl.wend || 0, pl.kantel || 0, pl.rol || 0);
    const S = pl.s;
    const P = (q) => {
      const r = R(q);
      return [pl.x + S * r[0], pl.y + S * r[1], r[2]];
    };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const bb = (x, y, r) => {
      x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r);
      y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
    };
    // de ruggengraat
    const n = sk.sp.length;
    U.ketN = n;
    for (let i = 0; i < 18; i++) {
      const j = Math.min(i, n - 1);
      const q = P(sk.sp[j]);
      U.ket[i * 4] = q[0]; U.ket[i * 4 + 1] = q[1]; U.ket[i * 4 + 2] = sk.sp[j][3] * S; U.ket[i * 4 + 3] = sk.u[j];
      if (i < n) bb(q[0], q[1], sk.sp[j][3] * S + 0.13 * S);
    }
    // de kop
    const O = P(sk.kop.o);
    // de kop mag een eigen draaiing hebben (een wezen dat recht naar je kijkt maar de kop opzij draait)
    const Rk = sk.kopWend !== undefined ? draaier(sk.kopWend, pl.kantel || 0, pl.rol || 0) : R;
    const Rf = Rk(sk.kop.f), Ru = Rk(sk.kop.up);
    const ex = [Rf[0], Rf[1]], ey = [Ru[0], Ru[1]];
    const det = ex[0] * ey[1] - ex[1] * ey[0];
    const dd = Math.abs(det) < 0.05 ? (det < 0 ? -0.05 : 0.05) : det;
    // q = I * (p - O) / S, met I de inverse van [ex ey]
    U.kopO[0] = O[0]; U.kopO[1] = O[1];
    const G = sk.kopG || 1; // de kop iets groter dan het skelet zegt
    U.kopI[0] = ey[1] / dd / S / G; U.kopI[1] = -ex[1] / dd / S / G; U.kopI[2] = -ey[0] / dd / S / G; U.kopI[3] = ex[0] / dd / S / G;
    const le = Math.hypot(ex[0], ex[1]) || 1, lu = Math.hypot(ey[0], ey[1]) || 1;
    U.kopB[0] = ex[0] / le; U.kopB[1] = ex[1] / le; U.kopB[2] = ey[0] / lu; U.kopB[3] = ey[1] / lu;
    U.kopS = S * G * Math.sqrt(Math.abs(dd));
    U.kopZ = O[2];
    bb(O[0] + ex[0] * 0.25 * S, O[1] + ex[1] * 0.25 * S, (sk.kopL || 0.6) * S);
    // vleugels: de achterste eerst
    if (sk.vl) {
      const vp = sk.vl.map((w) => {
        const pts = w.pts.map(P);
        const z = pts.reduce((s, q) => s + q[2], 0) / pts.length;
        return { pts, r: w.r, z, w };
      });
      vp.sort((a, b) => a.z - b.z);
      vp.forEach((w, k) => {
        const off = k * 10;
        let cx = 0, cy = 0;
        for (const q of w.pts) { cx += q[0] / w.pts.length; cy += q[1] / w.pts.length; }
        let rr = 0;
        for (const q of w.pts) rr = Math.max(rr, Math.hypot(q[0] - cx, q[1] - cy));
        U.vlb[k * 4] = cx; U.vlb[k * 4 + 1] = cy; U.vlb[k * 4 + 2] = rr + 0.15 * S; U.vlb[k * 4 + 3] = 0;
        for (let i = 0; i < 10; i++) {
          const q = w.pts[Math.min(i, w.pts.length - 1)];
          U.vl[(off + i) * 4] = q[0]; U.vl[(off + i) * 4 + 1] = q[1]; U.vl[(off + i) * 4 + 2] = (w.r[i] || 0.01) * S; U.vl[(off + i) * 4 + 3] = 0;
          if (i < 9) bb(q[0], q[1], 0.06 * S);
        }
        // de vlakke normaal van het vlies (in 3D, na het draaien)
        const r3 = (q) => R(q);
        const A3 = w.w.pts.map(r3);
        const e1 = [A3[3][0] - A3[0][0], A3[3][1] - A3[0][1], A3[3][2] - A3[0][2]];
        const e2 = [A3[6][0] - A3[0][0], A3[6][1] - A3[0][1], A3[6][2] - A3[0][2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const N = k === 0 ? U.vn0 : U.vn1;
        N[0] = nx; N[1] = ny; N[2] = nz;
        // de schulpen in de achterrand: cirkels buiten de randen F1-F2, F2-F3, F3-F4, F4-A
        const pt2 = w.pts.map((q) => [q[0], q[1]]);
        // oriëntatie van de veelhoek S, W, F1..F4, A
        const poly = [pt2[0], pt2[2], pt2[3], pt2[4], pt2[5], pt2[6], pt2[7]];
        let opp = 0;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          opp += a[0] * b[1] - b[0] * a[1];
        }
        const zin = opp > 0 ? 1 : -1;
        for (let e = 0; e < 4; e++) {
          const a = pt2[3 + e], b = pt2[4 + e];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const o4 = (k * 4 + e) * 4;
          if (L < 1e-4) { U.sc[o4 + 2] = 0; continue; }
          const diep = (e === 3 ? 0.1 : 0.17) * L;
          const c = (L * L / 4 - diep * diep) / (2 * diep);
          // naar buiten: rechts van de rand bij een veelhoek tegen de klok in
          const nxo = ((b[1] - a[1]) / L) * zin, nyo = (-(b[0] - a[0]) / L) * zin;
          U.sc[o4] = (a[0] + b[0]) / 2 + nxo * c;
          U.sc[o4 + 1] = (a[1] + b[1]) / 2 + nyo * c;
          U.sc[o4 + 2] = c + diep;
          U.sc[o4 + 3] = 0;
        }
      });
    }
    // poten: verre eerst (index 0, 1), dan de nabije (2, 3)
    U.pt.fill(0);
    if (sk.poten) {
      const pp = sk.poten.map((pt) => {
        const q = pt.map(P);
        return { q, r: pt.map((x) => x[3] * S), z: q[0][2] };
      });
      pp.sort((a, b) => a.z - b.z);
      pp.forEach((pt, k) => {
        for (let i = 0; i < 5; i++) {
          const o4 = (k * 5 + i) * 4;
          U.pt[o4] = pt.q[i][0]; U.pt[o4 + 1] = pt.q[i][1]; U.pt[o4 + 2] = i < 4 ? pt.r[i] : 0.01; U.pt[o4 + 3] = 0;
          bb(pt.q[i][0], pt.q[i][1], 0.1 * S);
        }
      });
    }
    // armen (kraken) of staartveren (feniks): 8 ketens van 6 punten; z per keten voor de volgorde
    U.teN = 0;
    if (sk.te) {
      const tp = sk.te.map((ch) => {
        const q = ch.map(P);
        return { q, r: ch.map((x) => x[3] * S), z: q.reduce((s2, x) => s2 + x[2], 0) / q.length };
      });
      tp.sort((a, b) => a.z - b.z);
      U.teN = tp.length;
      tp.forEach((ch, k) => {
        U.teZ[k] = ch.z;
        for (let i = 0; i < 6; i++) {
          const o4 = (k * 6 + i) * 4;
          U.te[o4] = ch.q[i][0]; U.te[o4 + 1] = ch.q[i][1]; U.te[o4 + 2] = ch.r[i]; U.te[o4 + 3] = i / 5;
          bb(ch.q[i][0], ch.q[i][1], ch.r[i] + 0.05 * S);
        }
      });
    }
    U.s = S;
    U.bbox = [x0, y0, x1, y1];
    return U;
  }

  // zet het wezen zo neer dat een punt van het skelet (3D) op een plek in beeld komt
  function plaats(pl, punt3, doel) {
    const r = draaier(pl.wend || 0, pl.kantel || 0, pl.rol || 0)(punt3);
    pl.x = doel[0] - pl.s * r[0];
    pl.y = doel[1] - pl.s * r[1];
    return pl;
  }

  function nieuweUniforms() {
    return {
      ket: new Float32Array(72), ketN: 0, kopO: new Float32Array(2), kopI: new Float32Array(4), kopB: new Float32Array(4), kopS: 1, kopZ: 0,
      vl: new Float32Array(80), vlb: new Float32Array(8), sc: new Float32Array(32), pt: new Float32Array(80), te: new Float32Array(192), teZ: new Float32Array(8), teN: 0, vn0: new Float32Array(3), vn1: new Float32Array(3), s: 1, bbox: [0, 0, 0, 0],
    };
  }

  // ═════════════════════════ kleuren en licht per wezen ═════════════════════════
  const STIJL = {
    draak: {
      huid1: [0.015, 0.06, 0.045], huid2: [0.08, 0.36, 0.22], buik: [0.62, 0.45, 0.2], vlies: [0.07, 0.025, 0.02], hoorn: [0.92, 0.84, 0.66], gloed: [1, 0.72, 0.12], iris1: [1, 0.78, 0.22], iris2: [0.62, 0.2, 0.03],
      vonk1: [1, 0.55, 0.12], vonk2: [1, 0.85, 0.35], adem1: [1, 0.5, 0.08], adem2: [1, 0.9, 0.45],
      // licht in de wereld: lava van onderen en randlicht van de krater
      L: [0.3, -0.45, 0.85], LK: [0.95, 0.4, 0.12], RK: [1.3, 0.45, 0.1], AK: [0.07, 0.11, 0.16], RD: [0.35, -1], RK2: [0.5, 0.65, 1.0], RD2: [-0.45, 0.9], mist: [0.06, 0.05, 0.08],
      grade: [1.04, 0.98, 0.94],
    },
  };
  STIJL.draak.pupil = 0;
  STIJL.draak.oogSoort = 0;
  STIJL.feniks = {
    huid1: [0.55, 0.06, 0.02], huid2: [1.0, 0.42, 0.06], buik: [1, 0.78, 0.3], vlies: [0.5, 0.1, 0.02], hoorn: [0.9, 0.75, 0.4], gloed: [1, 0.85, 0.4],
    iris1: [1, 0.95, 0.6], iris2: [0.9, 0.35, 0.05], oogHuid1: [0.45, 0.06, 0.02], oogHuid2: [1, 0.48, 0.1], oogSoort: 1, pupil: 1,
    vonk1: [1, 0.6, 0.15], vonk2: [1, 0.9, 0.5], adem1: [1, 0.55, 0.1], adem2: [1, 0.95, 0.6],
    L: [-0.2, 0.35, 0.6], LK: [1.0, 0.62, 0.32], RK: [1.4, 0.85, 0.42], AK: [0.16, 0.07, 0.08], RD: [0.1, 1], RK2: [0.55, 0.35, 0.85], RD2: [-0.7, 0.4], mist: [0.55, 0.25, 0.2],
    grade: [1.03, 0.99, 0.95],
  };
  STIJL.griffioen = {
    huid1: [0.42, 0.25, 0.09], huid2: [0.85, 0.6, 0.28], buik: [0.95, 0.85, 0.62], vlies: [0.88, 0.76, 0.5], hoorn: [0.95, 0.93, 0.88], gloed: [1, 0.6, 0.12],
    iris1: [1, 0.72, 0.2], iris2: [0.55, 0.25, 0.04], oogHuid1: [0.5, 0.48, 0.45], oogHuid2: [0.97, 0.95, 0.9], oogSoort: 1, pupil: 1,
    vonk1: [1, 0.9, 0.6], vonk2: [1, 0.97, 0.85], adem1: [1, 0.95, 0.75], adem2: [0.85, 0.92, 1],
    L: [0.6, 0.3, 0.75], LK: [1.15, 0.92, 0.7], RK: [1.2, 0.9, 0.62], AK: [0.24, 0.27, 0.4], RD: [0.7, 0.7], RK2: [0.5, 0.6, 1.0], RD2: [-0.7, 0.6], mist: [0.85, 0.74, 0.72],
    grade: [1.02, 1.0, 0.98],
  };
  STIJL.kraken = {
    huid1: [0.16, 0.03, 0.12], huid2: [0.48, 0.09, 0.24], buik: [0.62, 0.42, 0.46], vlies: [0.2, 0.05, 0.1], hoorn: [0.8, 0.8, 0.8], gloed: [0.3, 1, 0.95],
    iris1: [0.65, 1, 0.9], iris2: [0.05, 0.35, 0.42], oogHuid1: [0.14, 0.02, 0.1], oogHuid2: [0.42, 0.08, 0.2], oogSoort: 2, pupil: 2,
    vonk1: [0.3, 0.9, 1], vonk2: [0.7, 1, 0.95], adem1: [0.2, 0.6, 1], adem2: [0.6, 1, 1],
    L: [0.1, 0.8, 0.55], LK: [0.35, 0.6, 0.75], RK: [0.3, 0.85, 0.95], AK: [0.05, 0.09, 0.13], RD: [0, 1], RK2: [0.35, 0.4, 1], RD2: [-0.7, 0.3], mist: [0.02, 0.1, 0.16],
    grade: [0.96, 1.0, 1.04],
  };
  const MOND = { draak: [0.5, -0.04], griffioen: [0.36, -0.04], feniks: [0.3, -0.03], kraken: [0.0, -0.22] };

  // ═════════════════════════ de regie ═════════════════════════
  // c: de omgeving van zeldzaam.js (met motor, gl, obj, basis, pak van scene.js); z: extra's uit zeldzaam.js
  function maak(c, z) {
    const { motor, gl, audio, trillen } = c;
    const WN = z.WN;
    const ST = STIJL[WN];
    const nr = WEZEN_NR[WN];
    const prog = (n) => motor.p['mythisch-' + WN + '.' + n];
    const klaar = (n) => {
      const p = prog(n);
      return !!(p && p.ok);
    };
    const { t0, t1, K0, RV, snel, w, reduceer, rg } = z;
    const T = t1 - t0;
    const k = T / 20;
    const A = (x) => t0 + x * k;
    const R1 = reduceer ? 0.15 : 1;

    // ── de tijden van de film (in seconden vanaf het begin van de reeks, bij normale snelheid) ──
    const M = {
      zwart: A(0.45), pakIn: A(0.8), barst: A(4.3),
      wereld0: A(4.3), wereld1: A(9.0), bliksem: [A(5.7), A(7.5), A(8.25)], schaduw0: A(6.1), schaduw1: A(8.4),
      oog0: A(9.0), oogOpen0: A(9.7), oogOpen1: A(10.35), pupil: A(10.75), oog1: A(11.75),
      kop0: A(11.6), brul: A(12.45), brul1: A(14.0), vouw0: A(13.5), vouw1: A(14.6), start: A(14.75), start1: A(15.7),
      cirkel0: A(15.7), cirkel1: A(16.85), adem0: A(16.85), adem1: A(18.6), duik0: A(18.6), duik1: A(19.55),
      smeed0: A(16.2), slagen: [A(17.4), A(17.95), A(18.5)],
    };
    M.hart = [1.0, 2.0, 2.8, 3.35, 3.72, 3.98, 4.15].map(A);
    M.slot = RV + (snel ? 1.6 : 2.8);

    // ── geluid ──
    const at = c.at;
    at(t0 + 0.04, () => audio.stopAlles && audio.stopAlles());
    at(A(0.3), () => audio.speel('kosmisch-bas', { gain: 0.55, rate: 0.62, galmen: 0.35 }));
    M.hart.forEach((b, i) => at(b, () => audio.speel('hartslag', { gain: 0.75 + 0.06 * i, rate: 0.82 + 0.03 * i, fadeOut: 0.12, galmen: 0.25 })));
    at(M.barst - 2.0 * k, () => audio.riser(2.0 * k, 0.9));
    at(M.barst - 0.05, () => {
      audio.speel('zeldzaam-boem', { gain: 1.0, rate: 0.85, galmen: 0.35 });
      audio.speel('schiet-scherf', { gain: 0.8, rate: 0.75, galmen: 0.4 });
      trillen([60, 30, 60, 30, 200]);
    });
    at(M.wereld0 + 0.15, () => audio.speel('kosmisch-gat', { gain: 0.75, rate: 0.7, galmen: 0.4 }));
    at(M.wereld0 + 0.9 * k, () => audio.speel('mythisch-adem', { gain: 0.35, rate: 0.6, galmen: 0.4 }));
    M.bliksem.forEach((b, i) => at(b + 0.12, () => audio.boem(0.45 + 0.1 * i, 0.55 + 0.05 * i)));
    at(M.schaduw0 + 0.6 * k, () => audio.speel('mythisch-vleugel', { gain: 0.45, rate: 0.62, pan: 0.5, galmen: 0.5 }));
    at(M.schaduw0 + 1.3 * k, () => audio.speel('mythisch-vleugel', { gain: 0.4, rate: 0.6, pan: -0.3, galmen: 0.5 }));
    at(M.oog0 + 0.1, () => audio.speel('hartslag', { gain: 1.0, rate: 0.68, fadeOut: 0.12, galmen: 0.35 }));
    at(M.oogOpen0 - 0.3, () => audio.speel('mythisch-grom', { gain: 1.0, rate: WN === 'feniks' ? 1.25 : WN === 'griffioen' ? 1.1 : WN === 'kraken' ? 0.8 : 1, galmen: 0.4 }));
    at(M.pupil - 0.05, () => audio.zwiep(0.35, 0.6));
    at(M.brul - 0.14, () => {
      audio.speel('mythisch-brul', { gain: 1.3, rate: z.PAL.brul, galmen: 0.4 });
      audio.speel('zeldzaam-boem', { gain: 0.9, rate: 0.72, galmen: 0.35 });
      audio.boem(0.8, 0.6);
      trillen([80, 30, 120, 30, 300]);
    });
    at(M.vouw0 + 0.1, () => audio.speel('mythisch-vleugel', { gain: 0.9, rate: 0.7, galmen: 0.35 }));
    at(M.vouw0 + 0.65 * k, () => audio.speel('mythisch-vleugel', { gain: 0.95, rate: 0.66, galmen: 0.35 }));
    at(M.start, () => {
      audio.speel('mythisch-vleugel', { gain: 1.1, rate: 0.6, galmen: 0.35 });
      audio.speel('kosmisch-zwaai', { gain: 1.0, rate: 0.8, pan: 0.2, galmen: 0.3 });
    });
    at(M.start + 0.55 * k, () => audio.whoosh(0.9));
    for (let i = 0; i < 3; i++) at(M.cirkel0 + i * 0.5 * k, () => audio.speel('mythisch-vleugel', { gain: 0.45, rate: 0.75, pan: -0.4 + 0.3 * i, galmen: 0.45 }));
    at(M.smeed0, () => audio.speel('kosmisch-bas', { gain: 0.8, rate: 0.85, galmen: 0.35 }));
    at(M.adem0 - 0.1, () => audio.speel('mythisch-adem', { gain: 1.1, rate: WN === 'kraken' ? 0.7 : 0.95, galmen: 0.35 }));
    M.slagen.forEach((b, i) => at(b - 0.01, () => {
      audio.speel('mythisch-smeed', { gain: 0.8 + 0.15 * i, rate: 1.0 - 0.06 * i, galmen: 0.45 });
      audio.boem(0.4 + 0.15 * i, 1.2 - 0.1 * i);
    }));
    at(M.duik0 - 0.05, () => {
      audio.speel('mythisch-brul', { gain: 0.85, rate: z.PAL.brul * 0.9, galmen: 0.4, duur: 1.6, fadeOut: 0.4 });
      audio.speel('mythisch-vleugel', { gain: 1.0, rate: 0.7, galmen: 0.3 });
    });
    at(M.duik0 + 0.35 * k, () => audio.whoosh(0.9));
    at(t1 - 1.6 * k, () => audio.riser(1.6 * k, 1.0));
    at(K0 - 0.12, () => {
      audio.boem(1, 0.55);
      audio.speel('zeldzaam-boem', { gain: 1.1, rate: 0.68, galmen: 0.35 });
    });
    at(M.slot - 0.1, () => {
      audio.speel('mythisch-brul', { gain: 1.1, rate: z.PAL.brul * 0.9, galmen: 0.45 });
      trillen([60, 30, 60, 30, 240]);
    });

    // ── schokken, flitsen en golven (gedoseerd) ──
    M.hart.forEach((b, i) => c.schok(b, 0.006 + 0.003 * i, 0.12));
    c.flits(M.barst, 0.55, 0.12);
    c.schok(M.barst, 0.08, 0.35);
    c.golf(M.barst, 1.3, 0.7, 0.02);
    M.bliksem.forEach((b) => c.flits(b, 0.12, 0.08));
    c.schok(M.brul, 0.12, 0.6);
    c.schok(M.start + 0.4 * k, 0.05, 0.4);
    M.slagen.forEach((b, i) => {
      c.schok(b, 0.02 + 0.01 * i, 0.2);
      c.flits(b, 0.08 + 0.04 * i, 0.08);
    });
    c.schok(M.duik0 + 0.6 * k, 0.06, 0.4);
    c.flits(K0 - 0.03, 0.35, 0.1);
    c.schok(M.slot, 0.05, 0.4);

    // ── deeltjes ──
    const wk1 = ST.vonk1, wk2 = ST.vonk2;
    // de barst: stukjes pakje en vonken
    w({ mode: 0, t0: M.barst, delay: 0.1, life: 1.4, n: 450, org: [0, 0.04], angle: 0, spread: c.TWEE_PI, spd: [0.3, 2.6], grav: [0, -0.2], drag: 1.2, size: [0.002, 0.006], col1: wk1, col2: wk2, alpha: 0.9, seed: 302 });
    // gloeiende as die opstijgt in de wereld, en vallende as
    w({ mode: 8, t0: M.wereld0 - 0.5, delay: 0, life: 90, n: 160, size: [0.003, 0.009], grav: [0.15, 0.9], spd: [0.5, 1.4], col1: wk1, col2: wk2, alpha: 0.8, seed: 303 });
    // de brul: vonken en as weggeblazen van de bek
    const bek = (tb) => (x, asp) => {
      const m = mondPunt(tb, asp);
      x.org[0] = m[0];
      x.org[1] = m[1];
      x.angle = m[2];
    };
    const e1 = w({ mode: 0, t0: M.brul, delay: 1.0 * k, life: 1.3, n: 380, org: [0, 0], angle: 0, spread: 1.5, spd: [0.25, 1.2], grav: [0, 0.08], drag: 1.2, size: [0.002, 0.007], col1: wk1, col2: wk2, alpha: 0.9, seed: 304 });
    e1.bij = bek(M.brul + 0.3);
    // de adem op de kiem
    // de adem gaat recht op de kiem af (het midden van het beeld)
    const opKiem = (tb) => (x, asp) => {
      const m = mondPunt(tb, asp);
      x.org[0] = m[0];
      x.org[1] = m[1];
      x.angle = Math.atan2(-m[1], -m[0]);
    };
    const e2 = w({ mode: 0, t0: M.adem0 + 0.15 * k, delay: M.adem1 - M.adem0 - 0.35, life: 0.6, n: 1800, org: [0, 0], angle: 0, spread: 0.32, spd: [0.9, 1.6], grav: [0, 0.15], drag: 2.4, size: [0.004, 0.014], col1: ST.adem1, col2: ST.adem2, alpha: 0.9, seed: 305 });
    e2.bij = opKiem(M.adem0 + 0.8 * k);
    const e3 = w({ mode: 6, t0: M.adem0 + 0.15 * k, delay: M.adem1 - M.adem0 - 0.35, life: 0.7, n: 70, org: [0, 0], angle: 0, size: [0.04, 0.11], col1: [0.9, 0.25, 0.04], col2: [1, 0.6, 0.15], alpha: 0.55, seed: 306, lod: false });
    e3.bij = opKiem(M.adem0 + 0.8 * k);
    // de smeedslagen: vonken uit de kiem
    M.slagen.forEach((b, i) => w({ mode: 0, t0: b, delay: 0.05, life: 1.1, n: 200 + 100 * i, org: [0, 0.0], angle: 0, spread: c.TWEE_PI, spd: [0.25, 1.1 + 0.25 * i], grav: [0, -0.5], drag: 1.1, size: [0.002, 0.005], col1: wk1, col2: wk2, alpha: 0.8, seed: 310 + i }));
    // de kaart komt: een kring van vonken
    w({ mode: 0, t0: K0, delay: 0.15, life: 1.8, n: 700, org: [0, 0.0], angle: 0, spread: c.TWEE_PI, spd: [0.4, 2.0], grav: [0, -0.25], drag: 1.2, size: [0.002, 0.006], col1: wk1, col2: wk2, alpha: 0.85, seed: 320 });
    // de laatste brul: een kleine vlaag
    const e4 = w({ mode: 0, t0: M.slot, delay: 0.6, life: 1.4, n: 160, org: [0.25, 0.25], angle: 0, spread: 1.4, spd: [0.1, 0.6], grav: [0, 0.1], drag: 1.4, size: [0.002, 0.005], col1: wk1, col2: wk2, alpha: 0.7, seed: 321 });
    e4.bij = bek(M.slot + 0.2);


    // ═════ shots: waar staat het wezen, hoe ziet het eruit ═════
    const U = nieuweUniforms();
    const SK = SKELET[WN] || draakSkelet;
    // het wezen in een bepaalde houding op tijd t; geeft { sk, pl, mist, sil, alpha }
    function houding(t, asp) {
      return WN === 'kraken' ? houdingK(t, asp) : houdingV(t, asp);
    }
    // de kraken: zwemt, rijst op uit de diepte, spreidt zijn armen
    function houdingK(t, asp) {
      const hv = (c.H_ZICHT * asp) / 2 / c.H_ZICHT;
      if (t >= M.schaduw0 && t < M.schaduw1) {
        const q = ramp(t, M.schaduw0, M.schaduw1);
        const sk = SK({ t, fase: t * 3, slagA: 0.4, slagM: 0.05, kop: 0 });
        return { sk, pl: { x: mix(hv * 1.2, -hv * 1.2, q), y: 0.12 + 0.05 * Math.sin(q * 3), s: 0.07, wend: 0.3, kantel: 1.25, rol: 0 }, mist: 0.6, sil: 0.85 };
      }
      if (t >= M.kop0 && t < M.start) {
        const br = ramp(t, M.brul - 0.25, M.brul + 0.1);
        const brul = glad(br) * (1 - sm(t, M.brul1 - 0.4, M.brul1 + 0.3));
        const ontv = sm(t, M.vouw0, M.vouw1);
        const adem = Math.sin(t * 1.8);
        const sk = SK({ t, fase: t * 2.2, slagA: 0.45 + 0.3 * brul, slagM: mix(0.15, 1.0, Math.max(ontv, brul * 0.8)), kaak: 0.6 * brul, kop: 0.05 * adem, adem });
        const terug = sm(t, M.vouw0 - 0.2, M.vouw1 + 0.1);
        const pk = plaats({ s: 0.62 * (1 + 0.04 * brul), wend: -0.3, kantel: 0.05 }, sk.kop.o, [0.05, -0.05 + 0.03 * brul]);
        const pb = plaats({ s: 0.3, wend: -0.3, kantel: 0.05 }, sk.kop.o, [0.0, 0.0]);
        return { sk, pl: { x: mix(pk.x, pb.x, terug), y: mix(pk.y, pb.y, terug), s: mix(pk.s, pb.s, terug), wend: -0.3, kantel: 0.05, rol: 0 }, mist: mix(0.0, 0.1, terug), sil: 0 };
      }
      if (t >= M.start && t < M.start1) {
        const q = ramp(t, M.start, M.start1);
        const e2 = Math.pow(q, 1.6);
        const sk = SK({ t, fase: t * 4, slagA: 0.6, slagM: mix(1.0, 0.6, q), kaak: 0.3 });
        const p0 = plaats({ s: 0.3, wend: -0.3, kantel: 0.05 }, sk.kop.o, [0.0, 0.0]);
        return { sk, pl: { x: mix(p0.x, 0.1, e2), y: mix(p0.y, 0.2, e2), s: mix(0.3, 2.4, e2), wend: -0.3, kantel: 0.05 - 0.3 * q, rol: 0 }, mist: 0.04, sil: 0, alpha: 1 - sm(q, 0.85, 1) };
      }
      if (t >= M.cirkel0 && t < M.cirkel1) {
        const q = ramp(t, M.cirkel0, M.cirkel1);
        const sk = SK({ t, fase: t * 3, slagA: 0.4, slagM: 0.05 });
        return { sk, pl: { x: mix(hv * 1.1, -hv * 0.4, glad(q)), y: 0.12 + 0.03 * Math.sin(q * 4), s: mix(0.09, 0.14, q), wend: 0.3, kantel: 1.15, rol: 0 }, mist: 0.35, sil: 0.25 };
      }
      if (t >= M.adem0 && t < M.duik0) {
        const q = ramp(t, M.adem0, M.duik0);
        const sk = SK({ t, fase: t * 2.4, slagA: 0.4, slagM: 0.55, kaak: 0.2, adem: Math.sin(t * 2) });
        const pl = plaats({ s: 0.3 + 0.02 * q, wend: -0.2, kantel: 0.35 }, sk.kop.o, [-0.42 + 0.015 * Math.sin(t * 0.7), 0.22]);
        return { sk, pl, mist: 0.06, sil: 0 };
      }
      if (t >= M.duik0 && t < M.duik1) {
        const q = ramp(t, M.duik0, M.duik1);
        const e = q * q * (0.6 + 0.4 * q);
        const sk = SK({ t, fase: t * 4, slagA: 0.6, slagM: 0.7, kaak: 0.3 });
        const p0 = plaats({ s: 0.3, wend: -0.2, kantel: 0.35 }, sk.kop.o, [-0.42, 0.22]);
        return { sk, pl: { x: mix(p0.x, hv * 0.4, glad(q)), y: mix(p0.y, -0.1, glad(q)), s: mix(0.3, 3.0, e), wend: -0.2, kantel: mix(0.35, 0.0, q), rol: 0 }, mist: 0.04, sil: 0, alpha: 1 - sm(q, 0.8, 1) };
      }
      if (t >= K0 - 0.6) {
        const q = sm(t, K0 - 0.6, K0 + 1.2);
        const sb = t >= M.slot ? Math.exp(-(t - M.slot) / 0.6) : 0;
        const brul = t >= M.slot - 0.25 ? glad(ramp(t, M.slot - 0.25, M.slot + 0.05)) * (1 - sm(t, M.slot + 1.2, M.slot + 1.8)) : 0;
        const adem = Math.sin(t * 1.4);
        const sk = SK({ t, fase: t * 1.6, slagA: 0.3, slagM: 0.95 + 0.1 * brul, kaak: 0.15 + 0.4 * brul, adem });
        const pl = plaats({ s: 0.46 * (1 + 0.03 * sb), wend: -0.25, kantel: 0.05 }, sk.kop.o, [0.0, mix(0.5, 0.06, q) + 0.008 * adem]);
        return { sk, pl, mist: 0.0, sil: 0.0, poster: 1, alpha: q };
      }
      return null;
    }
    function houdingV(t, asp) {
      const hv = (c.H_ZICHT * asp) / 2 / c.H_ZICHT; // halve breedte in p-ruimte
      // akte 2: een kleine schim die door de verre lucht vliegt
      if (t >= M.schaduw0 && t < M.schaduw1) {
        const q = ramp(t, M.schaduw0, M.schaduw1);
        const sk = SK({ t, fase: t * 6.5, slagA: 0.8, vouwA: 0.4, nek: 0.55, nekK: -0.12, kop: -0.1, staart: 0.18, poten: 0 });
        return { sk, pl: { x: mix(hv * 1.25, -hv * 1.25, q), y: 0.2 + 0.05 * Math.sin(q * 3), s: 0.045, wend: PI + 0.15, kantel: 0.05 + 0.08 * Math.sin(t * 6.5), rol: 0.2 }, mist: 0.55, sil: 0.85, ver: 1 };
      }
      // akte 3: de kop, de brul en de vleugels die opengaan
      if (t >= M.kop0 && t < M.start) {
        const br = ramp(t, M.brul - 0.25, M.brul + 0.1);
        const brE = sm(t, M.brul1 - 0.4, M.brul1 + 0.3);
        const brul = glad(br) * (1 - brE);
        const ontv = sm(t, M.vouw0, M.vouw1);
        const adem = Math.sin(t * 2.2);
        const sk = SK({
          t, fase: 0, slagA: 0, slagM: mix(0.15, 1.05, ontv) + 0.05 * Math.sin(t * 2), vouw: mix(1, 0.05, ontv), vouwA: 0,
          nek: mix(1.05, 0.62, brul) + 0.03 * adem, nekK: mix(-0.24, -0.08, brul), kop: mix(-0.28, 0.05, brul) + 0.02 * adem,
          kaak: 0.03 + 0.62 * brul * (0.9 + 0.1 * Math.sin(t * 30)), staart: 0.05, staartF: 1.2, poten: 1, adem,
        });
        // camera: begint dicht op de kop en trekt terug naar het hele wezen
        const terug = sm(t, M.vouw0 - 0.2, M.vouw1 + 0.1);
        const wend = -0.42 + 0.06 * brul, kantel = 0.02;
        const pk = plaats({ s: 0.5 * (1 + 0.03 * brul), wend, kantel }, sk.kop.o, [-0.08 - 0.04 * brul + 0.02 * ramp(t, M.kop0, M.brul), -0.02 + 0.02 * brul]);
        const pb = plaats({ s: 0.32, wend, kantel }, [0.25, 0.08, 0], [-0.06, -0.24]);
        return { sk, pl: { x: mix(pk.x, pb.x, terug), y: mix(pk.y, pb.y, terug), s: mix(pk.s, pb.s, terug), wend, kantel, rol: 0 }, mist: mix(0.0, 0.08, terug), sil: 0 };
      }
      // de sprong naar de camera
      if (t >= M.start && t < M.start1) {
        const q = ramp(t, M.start, M.start1);
        const e = q * q;
        const sk = SK({ t, fase: (t - M.start) * 9 + 1.4, slagA: 1.0, slagM: 0.3, vouwA: 0.4, nek: 0.7, nekK: -0.1, kop: -0.05, kaak: 0.1, staart: 0.2, poten: 1 - sm(q, 0, 0.4) });
        const p0 = plaats({ s: 0.32, wend: -0.42, kantel: 0.02 }, [0.25, 0.08, 0], [-0.06, -0.24]);
        const e2 = Math.pow(q, 1.6);
        return { sk, pl: { x: mix(p0.x, -0.25, e2), y: mix(p0.y, 0.75, e2), s: mix(0.32, 1.7, e2), wend: mix(-0.42, -0.85, q), kantel: mix(0.02, 0.75, glad(q)), rol: -0.2 * q }, mist: 0.04, sil: 0, alpha: 1 - sm(q, 0.85, 1) };
      }
      // akte 4: cirkelen in de verte
      if (t >= M.cirkel0 && t < M.cirkel1) {
        const q = ramp(t, M.cirkel0, M.cirkel1);
        const sk = SK({ t, fase: t * 5.5, slagA: 0.85, vouwA: 0.4, nek: 0.6, nekK: -0.12, kop: -0.1, staart: 0.15, poten: 0 });
        return { sk, pl: { x: mix(hv * 1.1, -hv * 0.3, glad(q)), y: 0.16 + 0.03 * Math.sin(q * 4), s: mix(0.07, 0.11, q), wend: PI - 0.25, kantel: 0.1 * Math.sin(t * 5.5), rol: 0.35 }, mist: 0.3, sil: 0.2 };
      }
      // het blazen op de kiem
      if (t >= M.adem0 && t < M.duik0) {
        const q = ramp(t, M.adem0, M.duik0);
        const sk = SK({ t, fase: t * 3.6, slagA: 0.6, slagM: 0.55, vouwA: 0.3, nek: 0.35, nekK: -0.16, kop: -0.18, kaak: 0.45 + 0.04 * Math.sin(t * 23), staart: 0.12, poten: 0.3, bob: 0.03 * Math.sin(t * 3.6 - 1) });
        const pl = plaats({ s: 0.27 + 0.02 * q, wend: -0.3, kantel: 0.12 }, sk.kop.o, [-0.4 + 0.015 * Math.sin(t * 0.7), 0.25]);
        return { sk, pl, mist: 0.06, sil: 0 };
      }
      // de duik naar de camera
      if (t >= M.duik0 && t < M.duik1) {
        const q = ramp(t, M.duik0, M.duik1);
        const e = q * q * (0.6 + 0.4 * q);
        const sk = SK({ t, fase: t * 8, slagA: 0.9, slagM: 0.45, vouwA: 0.35, nek: 0.4, nekK: -0.1, kop: -0.1, kaak: 0.35, staart: 0.25, poten: 0 });
        return { sk, pl: { x: mix(-hv * 0.62, hv * 0.3, glad(q)), y: mix(0.17, -0.25, glad(q)), s: mix(0.28, 3.0, e), wend: mix(-0.3, -0.9, q), kantel: mix(-0.32, -0.1, q), rol: 0 }, mist: 0.04, sil: 0, alpha: 1 - sm(q, 0.8, 1) };
      }
      // akte 5: achter de kaart
      if (t >= K0 - 0.6) {
        const q = sm(t, K0 - 0.6, K0 + 1.2);
        const sb = t >= M.slot ? Math.exp(-(t - M.slot) / 0.6) : 0;
        const brul = t >= M.slot - 0.25 ? glad(ramp(t, M.slot - 0.25, M.slot + 0.05)) * (1 - sm(t, M.slot + 1.2, M.slot + 1.8)) : 0;
        const adem = Math.sin(t * 1.6);
        // heraldisch: het lijf naar je toe, de vleugels wijd open als een V rond de titel, de kop opzij
        const sk = SK({ t, fase: t * 1.5, slagA: 0.1, slagM: 0.95 + 0.04 * adem, vouw: 0.0, vouwA: 0.06, nek: mix(1.25, 1.1, brul) + 0.03 * adem, nekK: mix(-0.2, -0.1, brul), kop: mix(-0.3, 0.15, brul), kaak: 0.04 + 0.6 * brul, staart: 0.08, staartF: 1.1, poten: 1, adem });
        sk.kopWend = -0.5;
        const pl = plaats({ s: (WN === 'draak' ? 0.36 : 0.4) * (1 + 0.03 * sb), wend: -1.15, kantel: 0.05 }, sk.kop.o, [0.25, mix(0.62, 0.15, q) + 0.008 * adem]);
        return { sk, pl, mist: 0.0, sil: 0.0, poster: 1, alpha: q };
      }
      return null;
    }
    // de plek van de bek (p-ruimte) en de richting waarin hij open staat
    function mondPunt(t, asp) {
      const h = houding(t, asp);
      if (!h) return [0, 0, 0];
      projecteer(h.sk, h.pl, U);
      const q = MOND[WN] || MOND.draak;
      const I = U.kopI;
      // p = O + B * q * S  (B = inverse van I)
      const det = I[0] * I[3] - I[1] * I[2];
      const bx = (I[3] * q[0] - I[2] * q[1]) / det, by = (-I[1] * q[0] + I[0] * q[1]) / det;
      const fx = I[3] / det, fy = -I[1] / det;
      return [U.kopO[0] + bx, U.kopO[1] + by, Math.atan2(fy, fx) - 0.15];
    }

    // schokgolven vanaf de bek
    {
      const m = mondPunt(M.slot + 0.1, 16 / 9);
      c.golf(M.slot, 1.1, 0.35, m[1], m[0]);
      const m2 = mondPunt(M.brul + 0.1, 16 / 9);
      c.golf(M.brul, 1.0, 0.45, m2[1], m2[0]);
    }

    // ═════ tekenen ═════
    let doel = null;
    let zwartT = null;
    const zwartTex = () => {
      if (!zwartT) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 4;
        const x = cv.getContext('2d');
        x.fillStyle = '#000';
        x.fillRect(0, 0, 4, 4);
        zwartT = c.tekstuur(cv, { mip: false });
      }
      return zwartT;
    };
    function zorgDoel() {
      const W = Math.max(16, Math.ceil(motor.breedte / 2)), Hh = Math.max(16, Math.ceil(motor.hoogte / 2));
      if (!doel || doel.w !== W || doel.h !== Hh) {
        if (doel) motor.verwijderDoel(doel);
        doel = motor.maakDoel(W, Hh);
      }
      return doel;
    }
    // de wereld: in een eigen doel op halve resolutie, dan in de scène gemengd
    function wereld(t, alpha, cam, o) {
      if (alpha < 0.003 || !klaar('wereld') || !klaar('kopie')) return;
      const d = zorgDoel();
      motor.doel(d);
      motor.mengen('geen');
      const p = prog('wereld').gebruik();
      p.f2('uRes', d.w, d.h);
      p.f2('uShake', c.cam.x, c.cam.y);
      p.f1('uZoom', 1);
      p.f1('uTime', t);
      p.f3('uCam', cam[0], cam[1], cam[2]);
      p.f1('uHelder', o.helder === undefined ? 1 : o.helder);
      p.f1('uRook', o.rook === undefined ? 1 : o.rook);
      p.f1('uGloed', o.gloed === undefined ? 1 : o.gloed);
      p.f1('uSchaduw', o.schaduw || 0);
      const b = o.bliksem || [0, 0, 0, 0];
      p.f4('uBliksem', b[0], b[1], b[2], b[3]);
      const v = o.vorm || [0, 0, 1, 0];
      p.f4('uVorm', v[0], v[1], v[2], v[3]);
      motor.volledig();
      motor.doel(motor.doelen.scene);
      motor.mengen('alpha');
      const kp = prog('kopie').gebruik();
      kp.tex('uTex', 0, d.tex);
      kp.f1('uA', Math.min(1, alpha));
      kp.f1('uMul', 1);
      motor.volledig();
    }
    // het wezen in de scène tekenen
    function wezen(t, asp, h, licht) {
      if (!h || !klaar('wezen')) return;
      const al = (h.alpha === undefined ? 1 : h.alpha) * (licht.alpha === undefined ? 1 : licht.alpha);
      if (al < 0.004) return;
      projecteer(h.sk, h.pl, U);
      const zoom = c.cam.zoom || 1;
      const bx = U.bbox;
      const naar = (x, y) => [((x * zoom + c.cam.x) * 2) / asp, (y * zoom + c.cam.y) * 2];
      const a0 = naar(bx[0] - 0.02, bx[1] - 0.02), a1 = naar(bx[2] + 0.02, bx[3] + 0.02);
      const x0 = Math.max(-1, a0[0]), y0 = Math.max(-1, a0[1]), x1 = Math.min(1, a1[0]), y1 = Math.min(1, a1[1]);
      if (x1 <= x0 || y1 <= y0) return;
      const p = prog('wezen').gebruik();
      p.f4('uRect', x0, y0, x1, y1);
      p.f2('uRes', motor.breedte, motor.hoogte);
      p.f2('uShake', c.cam.x, c.cam.y);
      p.f1('uZoom', zoom);
      p.f1('uTime', t);
      p.v4s('uKet[0]', U.ket);
      p.i1('uKetN', U.ketN);
      p.f2('uKopO', U.kopO[0], U.kopO[1]);
      gl.uniformMatrix2fv(p.l('uKopI'), false, U.kopI);
      gl.uniformMatrix2fv(p.l('uKopB'), false, U.kopB);
      p.f1('uKopS', U.kopS);
      p.f1('uKaak', h.sk.kaak !== undefined ? h.sk.kaak : h.kaak || 0);
      p.v4s('uVl[0]', U.vl);
      p.v4s('uSc[0]', U.sc);
      p.v4s('uVlB[0]', U.vlb);
      p.v4s('uPt[0]', U.pt);
      p.v3('uVN0', U.vn0);
      p.v3('uVN1', U.vn1);
      p.v4s('uTe[0]', U.te);
      p.f1v('uTeZ[0]', U.teZ);
      p.i1('uTeN', U.teN);
      p.f1('uKopZ', U.kopZ);
      p.f1('uVuur', licht.vuur === undefined ? 1 : licht.vuur);
      const Ld = ST.L, ln = Math.hypot(Ld[0], Ld[1], Ld[2]);
      p.f3('uL', Ld[0] / ln, Ld[1] / ln, Ld[2] / ln);
      const kl = licht.kracht === undefined ? 1 : licht.kracht;
      p.f3('uLK', ST.LK[0] * kl, ST.LK[1] * kl, ST.LK[2] * kl);
      const rk = licht.rand === undefined ? 1 : licht.rand;
      p.f3('uRK', ST.RK[0] * rk, ST.RK[1] * rk, ST.RK[2] * rk);
      p.v3('uAK', ST.AK);
      p.v3('uMK', licht.mistKleur || ST.mist);
      const rl = Math.hypot(ST.RD[0], ST.RD[1]);
      p.f2('uRD', ST.RD[0] / rl, ST.RD[1] / rl);
      const rl2 = Math.hypot(ST.RD2[0], ST.RD2[1]);
      p.f2('uRD2', ST.RD2[0] / rl2, ST.RD2[1] / rl2);
      const r2 = licht.rand2 === undefined ? 1 : licht.rand2;
      p.f3('uRK2', ST.RK2[0] * r2, ST.RK2[1] * r2, ST.RK2[2] * r2);
      p.f1('uMist', h.mist || 0);
      p.f1('uSil', h.sil || 0);
      p.f1('uOogG', licht.oog === undefined ? 0.6 : licht.oog);
      p.f1('uMondG', licht.mond === undefined ? 0.4 : licht.mond);
      p.f1('uDetail', c.kw >= 2 ? 0 : 1);
      p.f1('uAlpha', al);
      p.f1('uS', U.s);
      p.f1('uDoor', licht.door === undefined ? 0.35 : licht.door);
      p.f1('uVlA', 1);
      p.f1('uVlD', h.poster ? 0.85 : 0.55);
      p.f1('uVlV', 1);
      p.v3('uC1', ST.huid1);
      p.v3('uC2', ST.huid2);
      p.v3('uC3', ST.buik);
      p.v3('uC4', ST.vlies);
      p.v3('uC5', ST.hoorn);
      p.v3('uC6', ST.gloed);
      motor.mengen('alpha');
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      motor.teken.draws++;
    }
    function oog(t, alpha) {
      if (alpha < 0.003 || !klaar('oog')) return;
      const p = prog('oog').gebruik();
      c.basis(p);
      p.f1('uTime', t);
      const open = glad(ramp(t, M.oogOpen0, M.oogOpen1));
      const knip = 1;
      p.f1('uOpen', Math.max(0.0, open * knip));
      p.f1('uPupil', mix(0.85, 0.12, glad(ramp(t, M.pupil, M.pupil + 0.22))) + 0.04 * Math.sin(t * 3));
      // langzaam inzoomen, en een korte blik opzij
      const zoom = 1 + 0.12 * ramp(t, M.oog0, M.oog1);
      p.f1('uSchaal', 0.78 * zoom);
      p.f2('uMid', 0.05, 0.02);
      const kijk = sm(t, M.pupil + 0.35, M.pupil + 0.55) * (1 - sm(t, M.oog1 - 0.5, M.oog1 - 0.2));
      p.f2('uKijk', -0.05 * kijk, 0.012 * kijk);
      p.f1('uA', alpha);
      p.f1('uGloed', 0.35 + 0.65 * open);
      p.v3('uIris1', ST.iris1 || ST.gloed);
      p.v3('uIris2', ST.iris2 || [ST.gloed[0] * 0.55, ST.gloed[1] * 0.3, ST.gloed[2] * 0.15]);
      p.v3('uHuid1', ST.oogHuid1 || ST.huid1);
      p.v3('uHuid2', ST.oogHuid2 || ST.huid2);
      p.v3('uRK', ST.RK);
      p.v3('uLK', ST.LK);
      p.f1('uVorm', ST.pupil || 0);
      p.f1('uSoort', ST.oogSoort || 0);
      motor.mengen('alpha');
      motor.volledig();

    }
    function smeed(t, x, y, s, heet, vorm, alpha, afkoel, puls) {
      if (alpha < 0.003 || !klaar('smeed')) return;
      const p = prog('smeed').gebruik();
      c.obj(p, x, y, 0.1, 0, 0, 0, s * c.KAART_B * 1.25, s * c.KAART_H * 1.25);
      p.f1('uTime', t);
      p.f1('uHeet', heet);
      p.f1('uVorm', vorm);
      p.f1('uA', alpha);
      p.f1('uAfkoel', afkoel || 0);
      p.f1('uPuls', puls || 0);
      p.v3('uK1', ST.vonk2);
      p.v3('uK2', ST.adem1);
      motor.mengen('alpha');
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      motor.teken.draws++;
    }
    function scheur(t, x, y, z2, rx, ry, sch, groei, puls, alpha) {
      if (alpha < 0.003 || !klaar('scheur')) return;
      const p = prog('scheur').gebruik();
      c.obj(p, x, y, z2 + 0.02, rx, ry, 0, 0.96 * sch, 1.44 * sch);
      p.f1('uTime', t);
      p.f1('uGroei', groei);
      p.f1('uPuls', puls);
      p.f1('uA', alpha);
      p.v3('uK1', ST.vonk2);
      p.v3('uK2', ST.vonk1);
      motor.mengen('alpha');
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      motor.teken.draws++;
    }
    const hartslag = (t) => {
      let a = 0;
      for (const b of M.hart) {
        const d = t - b;
        if (d >= 0 && d < 0.9) a += Math.exp(-d / 0.09) + 0.6 * (d > 0.17 ? Math.exp(-(d - 0.17) / 0.09) : 0);
      }
      return Math.min(1.5, a);
    };
    // de camera in de wereld per moment: [x, y, z]
    function wereldCam(t) {
      if (t < M.oog0) {
        const q = ramp(t, M.wereld0, M.oog0);
        const e = glad(q);
        return [0.05 * Math.sin(q * 2), mix(0.28, 0.02, e), mix(0.55, 0.05, glad(ramp(q, 0, 0.75))) + 0.5 * Math.pow(ramp(q, 0.8, 1), 2)];
      }
      if (t < M.start1) {
        const q = ramp(t, M.kop0, M.start1);
        return [-0.1 + 0.08 * q, -0.02 + 0.06 * sm(t, M.vouw0, M.vouw1), 0.45 - 0.25 * sm(t, M.vouw0, M.vouw1)];
      }
      if (t < K0) {
        const q = ramp(t, M.start1, K0);
        return [0.04 * Math.sin(q * 2), 0.1 - 0.08 * q, 0.15 + 0.2 * q];
      }
      const q = ramp(t, K0, RV + 6);
      return [0.02 * Math.sin(t * 0.1), 0.0, 0.3 + 0.08 * q];
    }
    const bliksem = (t) => {
      for (let i = 0; i < M.bliksem.length; i++) {
        const d = t - M.bliksem[i];
        if (d >= 0 && d < 0.5) {
          const fl = (d < 0.06 ? 1 : d < 0.1 ? 0.3 : d < 0.16 ? 0.85 : 0) * Math.exp(-d / 0.25) + 0.15 * Math.exp(-d / 0.2);
          return [[-0.25, 0.3, 0.1][i], 0.32, fl, 3.7 + i * 5.1];
        }
      }
      return [0, 0, 0, 0];
    };

    // ── akte voor akte ──
    function tease(t, asp) {
      // 1: het pakje in het donker
      if (t < M.barst + 0.6) {
        const th = hartslag(t);
        const zicht = sm(t, M.pakIn, M.pakIn + 0.9) * (1 - sm(t, M.barst, M.barst + 0.08));
        const groei = ramp(t, M.hart[0], M.barst);
        const tril = (0.002 + 0.012 * groei * groei) * (0.4 + th) * R1;
        const x = tril * Math.sin(t * 71.3), y = 0.02 + tril * Math.sin(t * 57.7 + 1) + 0.01 * Math.sin(t * 1.1);
        const rz = tril * 0.6 * Math.sin(t * 63.1);
        const dolly = 0.78 + 0.1 * ramp(t, M.pakIn, M.barst);
        const ry = 0.12 * Math.sin(t * 0.6) * (1 - groei);
        // een zachte gloed achter het pakje, die op elke slag oplicht
        c.licht(t, 0, 0.02, 0.0, 0.05, 0.02 * th * zicht, 0.06 * (0.3 + th) * zicht * (0.3 + groei), t * 0.2, ST.vonk1);
        if (zicht > 0.003 && c.pak) {
          c.pak(t, zicht, x, y, 0, 0.04 * Math.sin(t * 0.7), ry, rz, dolly, Math.min(1, 0.1 + 0.6 * groei * groei + 0.2 * th), ((t * 0.3) % 1.8) - 0.4);
          // het pakje hangt in het donker: alleen de scheuren geven licht
          c.vlak(t, zwartTex(), x, y, 0.06, 0.04 * Math.sin(t * 0.7), ry, rz, 1.2 * dolly, 1.7 * dolly, zicht * (0.62 - 0.25 * th * groei), 2, 0, 0, ST.vonk1, 0, 0);
          scheur(t, x, y, 0.08, 0.04 * Math.sin(t * 0.7), ry, dolly, 0.1 + 1.05 * Math.pow(groei, 1.3), Math.min(1, th), zicht);
        } else if (zicht > 0.003) {
          scheur(t, x, y, 0, 0, 0, dolly, 0.1 + 1.05 * Math.pow(groei, 1.3), Math.min(1, th), zicht);
        }
        // de barst: licht vult het beeld en zakt terug in de wereld
        const fl = t >= M.barst ? Math.exp(-(t - M.barst) / 0.18) : 0;
        if (fl > 0.01) c.licht(t, 0, 0.02, 0.45 * fl, 0.12, 0.35 * fl, 0, t, ST.vonk2);
      }
      // 2: de wereld
      const wa = sm(t, M.wereld0 + 0.05, M.wereld0 + 0.6 * k) * (t < M.oog0 + 0.2 * k ? 1 : 0);
      const wb = sm(t, M.kop0 - 0.1, M.kop0 + 0.5 * k);
      const wA = Math.max(wa, wb);
      if (wA > 0.003) {
        const vorm = t >= M.schaduw0 - 1.5 && t < M.schaduw0 ? [mix(0.6, -0.2, ramp(t, M.schaduw0 - 1.5, M.schaduw0)), 0.28, 0.12, 0.0] : [0, 0, 1, 0];
        const helder = t < M.oog0 ? 1 - 0.45 * sm(t, M.wereld1 - 0.8 * k, M.oog0) : 1;
        const dim = t >= K0 - 0.4 ? mix(1, 0.42, sm(t, K0 - 0.4, K0 + 1.6)) : 1;
        wereld(t, wA, wereldCam(t), { bliksem: bliksem(t), vorm, helder: helder * dim, rook: 1, gloed: 1, schaduw: 0 });
      }
      // 3: het oog
      const oA = sm(t, M.oog0, M.oog0 + 0.15 * k) * (1 - sm(t, M.oog1 - 0.3 * k, M.oog1));
      oog(t, oA);
      // het wezen
      const h = houding(t, asp);
      if (h) {
        const brul = t >= M.brul - 0.2 && t < M.brul1 ? Math.exp(-(t - M.brul) / 0.8) : 0;
        const held = t >= M.kop0 && t < M.start ? 1.45 : 1;
        wezen(t, asp, h, { kracht: held, rand2: held, oog: 0.6 + 0.8 * brul, mond: 0.4 + 0.8 * brul + (t >= M.adem0 && t < M.duik0 ? 1 : 0), door: 0.35, alpha: t >= M.kop0 && t < M.kop0 + 0.4 * k ? sm(t, M.kop0, M.kop0 + 0.35 * k) : 1 });
      }
      // 4: de kiem die een kaart wordt
      const kA = sm(t, M.smeed0, M.smeed0 + 0.8 * k);
      if (kA > 0.003) {
        const q = ramp(t, M.adem0, t1);
        let puls = 0;
        for (const b of M.slagen) if (t >= b) puls += Math.exp(-(t - b) / 0.12);
        const vorm = glad(ramp(t, M.adem0 + 0.2 * k, M.slagen[2] + 0.2));
        const s = (0.35 + 0.45 * vorm) * (1 + 0.04 * puls);
        smeed(t, 0, 0.0, s, 0.45 + 0.55 * q, vorm, kA, 0, Math.min(1.2, puls));
        c.licht(t, 0, 0.0, 0.0, 0.05, 0.05 * puls, 0, t * 0.4, ST.vonk2);
      }
    }
    // na de tease (vanaf t1): de wereld gedimd erachter en het wezen achter de kaart
    function na(t, asp) {
      const wa = 1 - sm(t, RV + 9, RV + 12);
      const dim = mix(1, 0.42, sm(t, K0 - 0.4, K0 + 1.6));
      wereld(t, wa, wereldCam(t), { helder: dim, rook: 1, gloed: 0.9, bliksem: [0, 0, 0, 0] });
      const h = houding(t, asp);
      if (h) {
        const brul = t >= M.slot - 0.2 ? Math.exp(-Math.max(0, t - M.slot) / 0.8) : 0;
        // poster: het wezen in tegenlicht, met een sterk randlicht en gloeiende ogen
        wezen(t, asp, h, { oog: 0.9 + 0.6 * brul, mond: 0.3 + 0.8 * brul, door: 0.4, kracht: 0.85, rand: 1.3, rand2: 1.2 });
      }

    }
    function post(p, t) {
      if (t < t0) return;
      p.bars = sm(t, t0 + 0.1, t0 + 0.6) * (1 - sm(t, K0 - 0.6, K0 + 0.4));
      p.regen = 0;
      p.gl = 0;
      p.dark = 0;
      p.sat = 1.0;
      p.vig = 1.15;
      p.bloom = 0.62;
      p.zoom = 1;
      p.rad = 0;
      p.grade = ST.grade;
      if (t < M.barst) {
        // akte 1: bijna zwart, korrel, een vignet dat op de hartslag ademt
        const th = hartslag(t);
        p.vig = 1.8 + 0.4 * th;
        p.zoom = 1 + 0.015 * th;
        p.bloom = 0.7;
      }
      const br = t - M.barst;
      if (br >= 0 && br < 1) {
        p.rad = Math.max(p.rad, 0.3 * Math.exp(-br / 0.25));
        p.zoom *= 1 + 0.05 * Math.exp(-br / 0.2);
      }
      const rt = t - M.brul;
      if (rt > -0.05 && rt < 1.6) {
        p.zoom *= 1 + 0.045 * Math.exp(-Math.max(rt, 0) / 0.25);
        p.rad = Math.max(p.rad, 0.07 * Math.exp(-Math.max(rt, 0) / 0.25));
      }
      if (t >= M.start && t < M.start1) p.rad = Math.max(p.rad, 0.25 * sm(t, M.start + 0.3 * k, M.start1) );
      if (t >= M.duik0 && t < M.duik1) p.rad = Math.max(p.rad, 0.22 * sm(t, M.duik0 + 0.3 * k, M.duik1));
      if (t >= K0 - 0.5) {
        // de onthulling: helder en scherp, gedoseerde gloed
        p.bloom = mix(0.62, 0.55, sm(t, RV, RV + 2));
        p.vig = 1.25;
        p.sat = 1.05;
      }
    }
    function schud(t) {
      let a = 0;
      if (t >= M.wereld0 && t < M.oog0) a += 0.0012 * R1;
      if (t >= M.brul && t < M.brul + 1.8) a += 0.01 * Math.exp(-(t - M.brul) / 0.7) * R1;
      if (t >= M.adem0 && t < M.adem1) a += 0.0025 * R1;
      return a;
    }
    function verwijder() {
      if (doel) motor.verwijderDoel(doel);
      doel = null;
    }
    return { tease, na, post, schud, verwijder, M, houding };
  }

  SPO.mythisch = { module, WEZEN_NR, maak };
})();
