/*
 * Somtoday Pack Opener — openingen/kluis.js
 * "Kluis kraken": een enorme ronde kluisdeur in een donkere, koude gang. De combinatie wordt gedraaid
 * (drie lampjes worden groen), het wiel draait, de grendels schieten terug, licht lekt door de naad en
 * de deur zwaait open: daarachter ligt de kaart. Zie motor/openingen/LEESMIJ.md voor het contract.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  const { KOP, GEMEEN, OBJ_GEMEEN, VS_VOL } = SPO.shaders;

  // ───────────────────────── GLSL ─────────────────────────
  const KG = `
const float TAU = 6.2831853;
float sdDoos(vec2 p, vec2 b, float rr){ vec2 d = abs(p) - b + rr; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - rr; }
vec2 stp(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0., 1.); return vec2(t * t * (3. - 2. * t), 6. * t * (1. - t) / (b - a)); }
vec2 doosN(vec2 p, vec2 b, float rr){
  float e = .002;
  return vec2(sdDoos(p + vec2(e, 0.), b, rr) - sdDoos(p - vec2(e, 0.), b, rr), sdDoos(p + vec2(0., e), b, rr) - sdDoos(p - vec2(0., e), b, rr)) / (2. * e);
}
vec3 bol(vec2 d){ float l2 = dot(d, d); if (l2 > .92) d *= sqrt(.92 / l2); return vec3(d, sqrt(max(1. - dot(d, d), 0.))); }
`;

  // De deur: uDeel 0 = het vlak (voor- of achterkant), 1 = de zijkant (dikte) als driehoeksstrook.
  const VS_DEUR = `${KOP}
${OBJ_GEMEEN}
uniform float uDeel, uR, uDik, uQuad, uZvlak;
uniform vec3 uScharnier;
out vec2 vQ; out vec3 vWp; out vec3 vN; out vec3 vT; out vec3 vB; out float vZ;
void main(){
  mat3 R = draai();
  vec3 l;
  if (uDeel < .5) {
    vec2 g = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
    vec2 loc = vec2(g.x - .5, .5 - g.y) * 2. * uQuad;
    vQ = loc;
    l = vec3(loc * uR, uZvlak);
    vN = R * vec3(0., 0., 1.);
    vZ = 0.;
  } else {
    int k = gl_VertexID / 2;
    float a = float(k) * (6.2831853 / 128.);
    float ach = float(gl_VertexID & 1);
    l = vec3(cos(a) * uR, sin(a) * uR, -uDik * ach);
    vQ = vec2(a, ach);
    vN = R * vec3(cos(a), sin(a), 0.);
    vZ = ach;
  }
  vT = R * vec3(1., 0., 0.);
  vB = R * vec3(0., 1., 0.);
  vec3 w = uPos + R * (l - uScharnier);
  vWp = w;
  gl_Position = projecteer(w);
}`;

  const FS_DEUR = `${KOP}
in vec2 vQ; in vec3 vWp; in vec3 vN; in vec3 vT; in vec3 vB; in float vZ;
out vec4 o;
uniform sampler2D uWijzer, uPlaat;
uniform vec3 uCamPos, uLpos, uLdir, uInPos, uKl, uLamp;
uniform float uDeel, uKant, uT, uDial, uDialW, uWiel, uLek, uBinnen, uFade, uSpot, uKwal, uB0, uBdt, uBdur;
${GEMEEN}
${KG}
vec3 spot(vec3 P, out vec3 L){
  vec3 d = uLpos - P; float l = length(d); L = d / l;
  float kegel = smoothstep(.55, .95, dot(-L, uLdir));
  return vec3(.80, .89, 1.) * uSpot * (.12 + .88 * kegel) * 2.6 / (1. + .2 * l * l);
}
vec3 omg(vec3 R){
  return vec3(.010, .013, .018) + vec3(.04, .05, .065) * smoothstep(-.3, 1., R.y) + vec3(.5, .55, .6) * pow(max(R.y, 0.), 24.) * uSpot;
}
vec3 lampKleur(float s){
  vec3 amber = vec3(1., .45, .08), groen = vec3(.25, 1., .4);
  vec3 k = s < 1. ? amber * s : mix(amber, groen, clamp(s - 1., 0., 1.));
  return k * (1. + 1.2 * max(s - 2., 0.));
}
// het wiel: naaf en zes spaken met kogels. d < 0 = op het wiel; nt = normaal (deurruimte); m = 1 chroom
float wiel(vec2 p, out vec3 nt, out float m){
  vec2 pr = rot2(-uWiel) * p;
  float rr = length(pr);
  float a = atan(pr.y, pr.x + 1e-6);
  float sec = TAU / 6.;
  float ah = floor(a / sec + .5) * sec;
  float al = a - ah;
  vec2 ps = vec2(cos(al), sin(al)) * rr;
  float x = clamp(ps.x, .30, .52);
  float rad = mix(.038, .028, (x - .30) / .22);
  vec2 dsv = ps - vec2(x, 0.);
  float dS = length(dsv) - rad;
  vec2 dbv = ps - vec2(.566, 0.);
  float dB = length(dbv) - .057;
  float dH = max(rr - .325, .25 - rr);
  float d = min(min(dS, dB), dH);
  vec2 nxy;
  if (dB <= dS && dB <= dH) { nxy = dbv / .057; m = 1.; }
  else if (dS <= dH) { nxy = vec2(0., dsv.y / rad); m = 1.; }
  else { nxy = vec2(cos(al), sin(al)) * clamp((rr - .2875) / .0375, -1., 1.) * .8; m = 0.; }
  vec3 n = bol(nxy * .95);
  nt = vec3(rot2(ah + uWiel) * n.xy, n.z);
  return d;
}
void main(){
  vec2 q = vQ;
  vec2 fw = fwidth(q);
  float pw = max(max(fw.x, fw.y), 1e-4);
  vec3 Nw = normalize(vN);
  vec3 V = normalize(uCamPos - vWp);
  vec3 P = vWp;
  vec3 L;
  vec3 Li = spot(P, L);
  vec3 kb = uKl * uBinnen;
  if (uDeel > .5) {
    // ── de zijkant (dikte van de deur) ──
    if (dot(Nw, V) < 0.) discard;
    float a = q.x, z = vZ;
    vec3 T = normalize(-sin(a) * vT + cos(a) * vB);
    float gr = exp(-pow((z - .36) / .035, 2.)) + exp(-pow((z - .7) / .035, 2.));
    float nl = max(dot(Nw, L), 0.);
    float th = dot(T, normalize(L + V));
    vec3 alb = vec3(.29, .31, .34) * (.86 + .14 * vn(vec2(a * 40., z * 6.)));
    vec3 col = alb * (Li * nl * .9 + vec3(.018, .022, .03)) + Li * pow(max(1. - th * th, 0.), 30.) * nl * .45;
    vec3 Lb = normalize(uInPos - P);
    float nb = max(dot(Nw, Lb), 0.);
    float tb = dot(T, normalize(Lb + V));
    col += kb * (alb * nb * 1.3 + pow(max(1. - tb * tb, 0.), 24.) * nb * .9);
    col *= 1. - .55 * gr;
    col += kb * smoothstep(.8, 1., z) * nb * .5;
    o = vec4(col * uFade, 1.);
    return;
  }
  float r = length(q);
  vec2 rad = q / max(r, 1e-4);
  if (uKant > .5) {
    // ── de achterkant: het mechanisme, verlicht door de kluis ──
    float al = clamp((1. - r) / pw + .5, 0., 1.);
    if (al <= 0.) discard;
    vec3 N = -Nw;
    float a = atan(q.y, q.x + 1e-6);
    float sec = TAU / 12.;
    float a12 = a - .2618 - floor((a - .2618) / sec + .5) * sec;
    float stang = smoothstep(.034, .022, abs(sin(a12) * r)) * smoothstep(.27, .3, r) * smoothstep(.93, .9, r);
    float plaat = 1. - smoothstep(.28, .3, r);
    float ring = smoothstep(.88, .9, r) * (1. - smoothstep(.97, .99, r));
    vec3 alb = vec3(.13, .14, .16) + vec3(.16, .15, .14) * stang + vec3(.1) * plaat + vec3(.06) * ring;
    vec3 Lb = normalize(uInPos - P);
    float nb = max(dot(N, Lb), 0.);
    vec3 col = alb * (Li * max(dot(N, L), 0.) * .8 + kb * nb * 1.5 + vec3(.012, .015, .02));
    col += kb * pow(max(dot(reflect(-Lb, N), V), 0.), 16.) * (.25 + .6 * stang + .4 * plaat);
    o = vec4(col * uFade * al, al);
    return;
  }
  // ── de voorkant ──
  vec3 Vt = vec3(dot(V, vT), dot(V, vB), dot(V, Nw));
  vec3 Lt = vec3(dot(L, vT), dot(L, vB), dot(L, Nw));
  float vz = max(Vt.z, .2);
  vec3 nt = vec3(0., 0., 1.);
  vec3 alb = vec3(.30, .33, .37);
  float glans = 70., ks = .5, kenv = .3, aniso = 1.;
  vec2 tang = vec2(-rad.y, rad.x);
  vec3 emis = vec3(0.);
  float ao = 1.;
  float alpha = clamp((1. - r) / pw + .5, 0., 1.);
  vec2 qd = q + Vt.xy / vz * .13;
  float rd = length(qd);
  vec2 qw = q + Vt.xy / vz * .10;
  vec3 nw; float mw;
  float dw = wiel(qw, nw, mw);
  if (rd < .25) {
    vec2 rdir = qd / max(rd, 1e-4);
    if (rd < .215) {
      vec2 qf = rot2(-uDial) * qd;
      float af = atan(qf.y, qf.x + 1e-6);
      float blur = clamp(abs(uDialW) * 3., 0., 1.);
      if (rd < .078) {
        // knop in het midden
        float rib = sin(af * 28.) * (1. - blur) * smoothstep(.05, .075, rd);
        nt = bol(rdir * (rd / .078) * .55 + vec2(-rdir.y, rdir.x) * rib * .25);
        alb = vec3(.24, .25, .27); glans = 90.; ks = 1.1; kenv = .8; aniso = 0.;
        ao = .75 + .25 * smoothstep(.078, .07, rd);
      } else if (rd < .192) {
        // wijzerplaat met de schaal; onscherp als hij snel draait
        float lod = log2(max(pw * 1.2 / .00084, 1.));
        float ink = 0.;
        if (abs(uDialW) < .003) {
          ink = textureLod(uWijzer, vec2(.5 + qf.x / .43, .5 - qf.y / .43), lod).a;
        } else {
          float nTap = uKwal < .5 ? 7. : (uKwal < 1.5 ? 5. : 3.);
          for (int i = 0; i < 7; i++) {
            if (float(i) >= nTap) break;
            float f = (float(i) + .5) / nTap - .5;
            vec2 qq = rot2(-(uDial + uDialW * f)) * qd;
            ink += textureLod(uWijzer, vec2(.5 + qq.x / .43, .5 - qq.y / .43), lod).a;
          }
          ink /= nTap;
        }
        nt = normalize(vec3(rdir * .10, 1.));
        alb = mix(vec3(.52, .54, .57), vec3(.03, .03, .035), ink);
        glans = 40.; ks = 1. - .8 * ink; kenv = .6 * (1. - ink); aniso = 1.;
        tang = vec2(-rdir.y, rdir.x);
        ao = .8 + .2 * smoothstep(.078, .095, rd);
      } else {
        // gekartelde rand
        float k = sin(af * 72.) * (1. - blur);
        nt = bol(rdir * ((rd - .2035) / .0115) * .6 + vec2(-rdir.y, rdir.x) * k * .45);
        alb = vec3(.55, .57, .6) * (.8 + .2 * (k * .5 + .5)); glans = 80.; ks = 1.2; kenv = .8; aniso = 0.;
      }
    } else {
      // vaste ring met het merkteken bovenaan
      nt = bol(rdir * ((rd - .2325) / .0175) * .65);
      alb = vec3(.5, .52, .55); glans = 110.; ks = 1.3; kenv = .9; aniso = 0.;
      float tri = step(.218, qd.y) * step(abs(qd.x), (qd.y - .218) * .7) * step(qd.y, .247);
      alb = mix(alb, vec3(.95, .95, .92), tri);
      emis += vec3(.25, .26, .28) * tri * uSpot;
    }
  } else if (dw < 0.) {
    nt = nw;
    if (mw > .5) { alb = vec3(.58, .6, .64); glans = 140.; ks = 1.6; kenv = 1.; aniso = 0.; }
    else { alb = vec3(.36, .38, .42); glans = 80.; ks = .9; kenv = .5; aniso = 1.; }
  } else {
    // ── de voorplaat: ringen ──
    vec2 h = vec2(0.);
    vec2 s = stp(.962, 1.0, r); h -= .05 * s;
    s = stp(.766, .782, r); h += .016 * s;
    s = stp(.583, .599, r); h += .016 * s;
    s = stp(.335, .36, r); h -= .012 * s;
    float g1 = (r - .865) / .0045; float e1 = exp(-g1 * g1); h += vec2(-.0045 * e1, .0045 * e1 * 2. * g1 / .0045);
    float g2 = (r - .47) / .004; float e2 = exp(-g2 * g2); h += vec2(-.0035 * e2, .0035 * e2 * 2. * g2 / .004);
    float mf = smoothstep(.014, .005, pw);
    float micro = (vn(vec2(r * 75., .5)) - .5) * .09 * mf;
    nt = normalize(vec3(rad * (-h.y * .75 + micro), 1.));
    ao *= 1. - .32 * exp(-max(.766 - r, 0.) / .012) * step(r, .766);
    ao *= 1. - .32 * exp(-max(.583 - r, 0.) / .012) * step(r, .583);
    float a0 = atan(q.y, q.x + 1e-6);
    alb *= .9 + .2 * vn(q * 28.) * mf + .08 * (vn(vec2(r * 150., a0 * 2.)) - .5) * mf;
    // klinknagels
    float sec = TAU / 12.;
    float id = floor(a0 / sec + .5);
    float al = a0 - id * sec;
    float sg = al < 0. ? -1. : 1.;
    vec2 ps = vec2(cos(al), abs(sin(al))) * r;
    vec2 d1 = ps - vec2(.99357, .11320) * .925;
    vec2 d2 = ps - vec2(.99144, .13053) * .685;
    float l1 = length(d1), l2 = length(d2);
    vec2 dk = l1 < l2 ? d1 : d2;
    float lk = min(l1, l2);
    if (lk < .0175) {
      vec3 n = bol(dk / .0175 * .85);
      n.y *= sg;
      nt = vec3(rot2(id * sec) * n.xy, n.z);
      alb = vec3(.38, .4, .43); glans = 100.; ks = 1.; kenv = .6; aniso = 0.;
    }
    ao *= 1. - .45 * smoothstep(.03, .0175, lk) * step(.0175, lk);
    // grendels in sleuven (op 15° + 30°·k); ze schuiven per paar terug
    float a1 = a0 - .2618;
    float idb = floor(a1 / sec + .5);
    float ab = idb * sec + .2618;
    float hb = a1 - idb * sec;
    vec2 pb = vec2(cos(hb), sin(hb)) * r;
    float j = mod(mod(idb + 12., 12.), 6.);
    float ub = clamp((uT - uB0 - j * uBdt) / uBdur, 0., 1.);
    float uit = mix(1.10, .965, 1. - pow(1. - ub, 2.6));
    float dSl = max(abs(pb.y) - .048, .772 - pb.x);
    if (dSl < 0.) {
      alb = vec3(.05, .055, .065); ks = .2; kenv = .05; aniso = 0.; glans = 30.;
      nt = vec3(0., 0., 1.);
      ao *= .5 + .5 * smoothstep(0., .02, -dSl);
    }
    vec2 bd = pb - vec2(clamp(pb.x, .70, uit - .036), 0.);
    float dBo = length(bd) - .036;
    float inSl = step(.772, pb.x);
    if (dBo < 0. && inSl > .5) {
      vec3 n = bol(bd / .036 * .93);
      nt = vec3(rot2(ab) * n.xy, n.z);
      alb = vec3(.6, .62, .66); glans = 130.; ks = 1.5; kenv = 1.; aniso = 0.; ao = 1.;
    }
    alpha = max(alpha, clamp(-dBo / pw + .5, 0., 1.) * inSl);
    // scharnierarmen links (draaien mee met de deur)
    float sy = q.y < 0. ? -1. : 1.;
    vec2 aq = q - vec2(-.915, .50 * sy);
    float dA = sdDoos(aq, vec2(.215, .056), .028);
    vec2 kq = q - vec2(-1.13, .50 * sy);
    float dK = sdDoos(kq, vec2(.066, .07), .012);
    if (min(dA, dK) < 0.) {
      if (dK < 0.) {
        float nx = clamp(kq.x / .066, -1., 1.) * .95;
        nt = vec3(nx, 0., sqrt(1. - nx * nx));
        alb = vec3(.4, .42, .45); glans = 90.; ks = 1.2; kenv = .7; aniso = 0.;
      } else {
        nt = normalize(vec3(doosN(aq, vec2(.215, .056), .028) * smoothstep(-.016, 0., dA) * .9, 1.));
        alb = vec3(.30, .32, .36); glans = 60.; ks = .6; kenv = .35; aniso = 1.; tang = vec2(1., 0.);
        vec2 bq = vec2(abs(aq.x - .1275) - .0425, aq.y);
        float lb = length(bq);
        if (lb < .024) { nt = bol(bq / .024 * .8); alb = vec3(.42, .44, .47); ks = 1.; aniso = 0.; }
        ao *= 1. - .4 * smoothstep(.034, .024, lb) * step(.024, lb);
      }
      ao = max(ao, .6);
    } else ao *= .6 + .4 * smoothstep(0., .025, min(dA, dK));
    alpha = max(alpha, clamp(-min(dA, dK) / pw + .5, 0., 1.));
    // plaatje met de drie lampjes
    vec2 lp = q - vec2(0., .695);
    float dP = sdDoos(lp, vec2(.17, .05), .03);
    if (dP < 0.) {
      nt = normalize(vec3(doosN(lp, vec2(.17, .05), .03) * smoothstep(-.012, 0., dP) * .9, 1.));
      alb = vec3(.18, .19, .21); glans = 50.; ks = .45; kenv = .3; aniso = 1.; tang = vec2(1., 0.);
    } else ao *= .6 + .4 * smoothstep(0., .02, dP);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 lc = lp - vec2((fi - 1.) * .1, 0.);
      float dl = length(lc);
      float st = i == 0 ? uLamp.x : (i == 1 ? uLamp.y : uLamp.z);
      vec3 lk2 = lampKleur(st);
      if (dl < .027) {
        nt = bol(lc / .027 * .8);
        alb = vec3(.03, .025, .02) + lk2 * .05; glans = 160.; ks = 1.2; kenv = 1.2; aniso = 0.;
        emis += lk2 * (1.6 + 2.4 * smoothstep(.027, 0., dl));
      } else if (dl < .036) {
        nt = bol(lc / dl * ((dl - .0315) / .0045) * .6);
        alb = vec3(.5, .52, .55); glans = 100.; ks = 1.2; kenv = .8; aniso = 0.;
      }
      emis += lk2 * .22 * exp(-max(dl - .027, 0.) / .014) * step(.036, dl);
    }
    // messing naamplaat
    vec2 np = q - vec2(0., -.70);
    float dN = sdDoos(np, vec2(.36, .086), .022);
    if (dN < 0.) {
      vec2 uv = vec2(np.x / .72 + .5, .5 - np.y / .172);
      float lodP = log2(max(pw * 1.2 / .0007, 1.));
      float e = textureLod(uPlaat, uv, lodP).a;
      float eU = textureLod(uPlaat, uv + vec2(0., -.03), lodP).a;
      float eD = textureLod(uPlaat, uv + vec2(0., .03), lodP).a;
      nt = normalize(vec3(doosN(np, vec2(.36, .086), .022) * smoothstep(-.01, 0., dN) * .9 + vec2(0., (eD - eU) * .5 * e), 1.));
      alb = vec3(.72, .53, .25) * (.9 + .12 * vn(vec2(np.x * 260., np.y * 9.))) * (1. - .75 * e);
      glans = 45.; ks = .9 - .6 * e; kenv = .55 * (1. - e); aniso = 1.; tang = vec2(1., 0.);
      ao *= 1. - .45 * clamp(e - eU, 0., 1.);
      vec2 sq = vec2(abs(np.x) - .328, abs(np.y) - .052);
      float ls = length(sq);
      if (ls < .012) { vec3 n = bol(sq / .012 * .7); nt = vec3(n.xy * sign(np), n.z); alb = vec3(.55, .45, .3); ks = 1.; aniso = 0.; }
    } else ao *= .6 + .4 * smoothstep(0., .02, dN);
    // contactschaduw van wiel en schijf, en de schaduw van de spot
    ao *= .55 + .45 * smoothstep(0., .03, dw);
    ao *= .55 + .45 * smoothstep(.25, .29, rd);
    if (uKwal < 1.5) {
      float lz = max(Lt.z, .25);
      vec3 dn; float dm;
      float ds = wiel(q + Lt.xy / lz * .10, dn, dm);
      Li *= .25 + .75 * smoothstep(-.01, .025, ds) * smoothstep(.25, .29, length(q + Lt.xy / lz * .13));
    }
  }
  // ── licht ──
  vec3 N = normalize(vT * nt.x + vB * nt.y + Nw * nt.z);
  float nl = max(dot(N, L), 0.);
  vec3 H = normalize(L + V);
  float spec;
  if (aniso > .5) {
    vec3 Tw = normalize(vT * tang.x + vB * tang.y);
    float th = dot(Tw, H);
    spec = pow(max(1. - th * th, 0.), glans * .5) * smoothstep(0., .25, nl) * .6;
  } else {
    spec = pow(max(dot(N, H), 0.), glans) * smoothstep(0., .25, nl) * (glans + 8.) / 60.;
  }
  vec3 col = alb * (Li * nl + vec3(.022, .028, .038)) * ao;
  col += alb * Li * spec * ks;
  col += omg(reflect(-V, N)) * alb * kenv * 2. * ao;
  col += emis;
  // licht uit de naad: de rand en alles wat naar buiten kijkt vangt het
  float rim = exp(-max(1. - r, 0.) / .022);
  float buiten = clamp(dot(nt.xy, rad) * 2.5 + .25, 0., 1.);
  col += uKl * uLek * (rim * buiten * (.5 + 1.2 * ks) + .1 * exp(-max(1. - r, 0.) / .14)) * ao;
  if (alpha < .002) discard;
  o = vec4(col * uFade * alpha, alpha);
}`;

  /*@@ACHTER@@*/
})();
