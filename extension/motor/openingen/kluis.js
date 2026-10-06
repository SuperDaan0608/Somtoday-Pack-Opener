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
uniform float uDeel, uKant, uT, uDial, uDialW, uWiel, uLek, uBinnen, uFade, uSpot, uKwal, uB0, uBdt, uBdur, uOk, uWH;
uniform vec4 uHint;
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
        // hint: het doelgetal glinstert (koel wit), sterker naarmate je dichterbij komt
        if (uHint.y > .001) {
          float dA = af - (1.5707963 - uHint.x);
          dA -= TAU * floor(dA / TAU + .5);
          float dl = abs(dA) * rd;
          float lijn = smoothstep(.0038, .0009, dl) * smoothstep(.148, .160, rd);
          float halo = exp(-dl * dl / .00011) * smoothstep(.115, .17, rd) * .4;
          emis += vec3(.55, .85, 1.) * (lijn * 2.4 + halo) * uHint.y * (.8 + .2 * sin(uHint.z * 6.));
        }
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
      // hint: een lichtboogje loopt in de draairichting rond de ring; bij succes licht de ring even groen op
      float ringM = smoothstep(.2175, .224, rd) * smoothstep(.2475, .24, rd);
      if (max(uHint.y, uWH) > .001 && abs(uHint.w) > .5) {
        float ph = atan(qd.y, qd.x + 1e-6) - uHint.w * uHint.z * 1.7;
        emis += vec3(.45, .75, 1.) * pow(.5 + .5 * cos(ph * 3.), 5.) * .95 * max(uHint.y, uWH) * ringM;
      }
      emis += vec3(.25, 1., .4) * uOk * ringM * 1.5;
    }
  } else if (dw < 0.) {
    nt = nw;
    if (mw > .5) { alb = vec3(.58, .6, .64); glans = 140.; ks = 1.6; kenv = 1.; aniso = 0.; }
    else { alb = vec3(.36, .38, .42); glans = 80.; ks = .9; kenv = .5; aniso = 1.; }
    float angW = atan(qw.y, qw.x + 1e-6);
    float rrW = length(qw);
    if (mw < .5 && max(uHint.y, uWH) > .001 && abs(uHint.w) > .5) {
      float ph = angW - uHint.w * uHint.z * 1.7;
      emis += vec3(.45, .75, 1.) * pow(.5 + .5 * cos(ph * 3.), 5.) * .8 * max(uHint.y, uWH);
    }
    if (mw < .5 && rrW < .33) emis += vec3(.25, 1., .4) * uOk * 1.2;
    if (uWH > .001) {
      // hint voor het handwiel: een glinstering loopt met de klok mee over de spaken en de kogels
      float ch = pow(.5 + .5 * cos((angW + uHint.z * 2.4) * 3.), 3.);
      emis += vec3(.5, .8, 1.) * uWH * (ch * (.15 + 1.5 * smoothstep(.45, .55, rrW)) + .06);
    }
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
    if (uKwal < .5) {
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
  float rim = exp(-abs(1. - r) / .022) * step(r, 1.03);
  float buiten = clamp(dot(nt.xy, rad) * 2.5 + .25, 0., 1.);
  col += uKl * uLek * (rim * buiten * (.5 + 1.2 * ks) + .1 * exp(-max(1. - r, 0.) / .14)) * ao;
  if (alpha < .002) discard;
  o = vec4(col * uFade * alpha, alpha);
}`;

  // De gang: eindwand met kozijn, scharnieren, staalplaat en beton; zijwanden, vloer en plafond; de opening.
  const FS_ACHTER = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uZoom;
uniform vec3 uCam, uLpos, uLdir, uKl, uKl2, uInPos;
uniform float uF, uR, uT, uSpot, uLek, uBinnen, uOpen, uFade, uTier, uFlik;
${GEMEEN}
${KG}
vec3 spotI(vec3 P, out vec3 L){
  vec3 d = uLpos - P; float l = length(d); L = d / l;
  float kegel = smoothstep(.45, .95, dot(-L, uLdir));
  return vec3(.80, .89, 1.) * uSpot * (.07 + .93 * kegel) * 2.6 / (1. + .2 * l * l);
}
float beton(vec2 u){
  float f = vn(u * 2.2) * .62 + vn(u * 9.1 + 3.) * .38;
  vec2 g = fract(u / .62) - .5;
  float gat = smoothstep(.035, .02, length(g * .62));
  return (.72 + .45 * f) * (1. - .6 * gat);
}
vec3 kamer(vec2 xy, float Rh){
  float rr = length(xy) / Rh;
  vec2 dir = xy / max(length(xy), 1e-4);
  vec3 k1 = uKl;
  if (uTier > 3.5) k1 = hsv(vec3(atan(dir.y, dir.x) / TAU + uT * .15, .55, 1.));
  float kern = 4. * exp(-rr * rr * 7.) + .5 * exp(-rr * rr * 1.5) + .08;
  float str = vn(dir * 3.5 + vec2(uT * .25, 0.));
  vec3 col = mix(k1, vec3(1.), .35) * kern + mix(uKl2, k1, .5) * pow(str, 3.) * .9 * smoothstep(.15, .8, rr);
  vec2 g = xy / Rh * 22. + vec2(0., uT * .6);
  vec2 id = floor(g);
  vec2 f = fract(g) - .5;
  float hh = h21(id);
  float gl = smoothstep(.12, 0., length(f - (h22(id) - .5) * .6)) * step(.8, hh) * (.5 + .5 * sin(uT * 6. + hh * 50.));
  return col + mix(k1, vec3(1.), .7) * gl * 3.;
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  vec3 ro = uCam;
  vec3 rd = vec3(2. * p / uF, -1.);
  float R = uR;
  float W = 1.58 * R, YF = -1.32 * R, YC = 1.62 * R;
  float tx = abs(rd.x) > 1e-5 ? (sign(rd.x) * W - ro.x) / rd.x : 1e5;
  float ty = rd.y < 0. ? (YF - ro.y) / rd.y : (rd.y > 0. ? (YC - ro.y) / rd.y : 1e5);
  float th = ro.z; float soort = 0.;
  if (tx < th) { th = tx; soort = 1.; }
  if (ty < th) { th = ty; soort = rd.y < 0. ? 2. : 3.; }
  vec3 hp = ro + rd * th;
  vec3 V = normalize(-rd);
  vec3 col = vec3(0.);
  if (soort < .5) {
    vec2 q = hp.xy / R;
    float r = length(q);
    if (r < 1.035) {
      // ── de opening: tunnel door de muur en de schatkamer ──
      float Rh = 1.035 * R, D = .55 * R;
      vec2 o2 = ro.xy, d2 = rd.xy;
      float A = dot(d2, d2), B = 2. * dot(o2, d2), C = dot(o2, o2) - Rh * Rh;
      float tc = (-B + sqrt(max(B * B - 4. * A * C, 0.))) / max(2. * A, 1e-6);
      float zc = ro.z - tc;
      if (zc > -D) {
        float diep = clamp(-zc / D, 0., 1.);
        vec2 wp = o2 + d2 * tc;
        vec3 wand = vec3(.2, .21, .23) * (.8 + .2 * vn(vec2(atan(wp.y, wp.x + 1e-6) * 20., diep * 3.)));
        col = wand * uKl * uBinnen * (.3 + 2.4 * diep * diep) + uKl * uLek * (3. + 2. * diep) * (1. - smoothstep(0., .12, uOpen));
      } else {
        col = kamer(ro.xy + rd.xy * (ro.z + D), Rh) * uBinnen + uKl * uLek * 3.5 * (1. - smoothstep(0., .12, uOpen));
      }
      col *= uFlik;
    } else {
      vec2 rad = q / r;
      vec3 alb; float ks = .4, gl = 40.;
      vec3 n = vec3(0., 0., 1.);
      float ao = 1.;
      if (r < 1.30) {
        // stalen kozijnring
        vec2 h = vec2(0.);
        vec2 s = stp(1.035, 1.07, r); h += .035 * s;
        s = stp(1.27, 1.30, r); h -= .03 * s;
        float g = (r - 1.205) / .005; float e = exp(-g * g); h += vec2(-.006 * e, .006 * e * 2. * g / .005);
        n = normalize(vec3(-h.y * rad * .75, 1.));
        float a = atan(q.y, q.x + 1e-6);
        alb = vec3(.27, .29, .32) * (.92 + .1 * vn(vec2(r * 140., a)));
        float sec = TAU / 28.;
        float id = floor(a / sec + .5);
        float al = a - id * sec;
        vec2 ps = vec2(cos(al), sin(al)) * r - vec2(1.24, 0.);
        float lk = length(ps);
        if (lk < .017) { vec3 nb = bol(ps / .017 * .85); n = vec3(rot2(id * sec) * nb.xy, nb.z); alb = vec3(.36, .38, .41); ks = .9; gl = 90.; }
        ao *= 1. - .4 * smoothstep(.028, .017, lk) * step(.017, lk);
        ao *= 1. - .6 * exp(-(r - 1.035) / .012);
      } else {
        float dPl = sdDoos(q, vec2(1.44), .16);
        if (dPl < 0.) {
          n = normalize(vec3(doosN(q, vec2(1.44), .16) * smoothstep(-.02, 0., dPl) * .9, 1.));
          alb = vec3(.20, .215, .24) * (.9 + .15 * vn(vec2(q.x * 3., q.y * 120.)));
          ks = .35; gl = 30.;
          vec2 bq = abs(q) - vec2(1.30);
          float lb = length(bq);
          if (lb < .045) { vec3 nb = bol(bq / .045 * .8); n = vec3(nb.xy * sign(q), nb.z); alb = vec3(.33, .35, .38); ks = 1.; gl = 80.; }
          ao *= 1. - .4 * smoothstep(.06, .045, lb) * step(.045, lb);
          ao *= .55 + .45 * smoothstep(1.30, 1.35, r);
        } else {
          alb = vec3(.12, .125, .135) * beton(q);
          ks = .05; gl = 10.;
          ao *= .7 + .3 * smoothstep(0., .08, dPl);
        }
      }
      // scharnieren links
      vec2 hq = vec2(q.x + 1.13, abs(q.y) - .50);
      if (abs(hq.x) < .066 && abs(hq.y) < .14) {
        float nx = hq.x / .066 * .95;
        n = vec3(nx, 0., sqrt(1. - nx * nx));
        alb = vec3(.36, .38, .41); ks = 1.1; gl = 90.;
        ao = 1. - .5 * smoothstep(.12, .14, abs(hq.y));
      }
      vec3 L;
      vec3 Li = spotI(hp, L);
      float nl = max(dot(n, L), 0.);
      float sp = pow(max(dot(normalize(L + V), n), 0.), gl) * (gl + 8.) / 60.;
      col = alb * (Li * nl + vec3(.018, .022, .03)) * ao + alb * Li * sp * ks * nl;
      float dr = r - 1.035;
      float naar = .6 + .4 * clamp(-dot(n.xy, rad) * 2. + .5, 0., 1.);
      col += uKl * uLek * (1.4 * exp(-dr / .018) + .3 * exp(-dr / .12)) * naar * uFlik;
      col += uKl * uBinnen * uOpen * (1.0 * exp(-dr / .05) + .12 * exp(-dr / .3)) * uFlik;
    }
  } else {
    // ── zijwanden, vloer en plafond ──
    vec3 n = soort < 1.5 ? vec3(-sign(hp.x), 0., 0.) : (soort < 2.5 ? vec3(0., 1., 0.) : vec3(0., -1., 0.));
    vec2 u2 = soort < 1.5 ? hp.zy : hp.xz;
    vec3 alb = vec3(.12, .125, .135) * beton(u2 / R);
    float naad = smoothstep(.006, 0., abs(fract(hp.z / (1.05 * R)) - .5) * 1.05 * R - .5 * 1.05 * R + .006);
    alb *= 1. - .5 * naad;
    if (soort > 1.5 && soort < 2.5) alb *= .8;
    vec3 L;
    vec3 Li = spotI(hp, L);
    col = alb * (Li * max(dot(n, L), 0.) + vec3(.012, .015, .02));
    if (soort > 1.5 && soort < 2.5) col += vec3(.6, .65, .75) * pow(max(dot(reflect(-V, n), L), 0.), 40.) * uSpot * .15;
    // de lamp aan het plafond
    if (soort > 2.5) {
      vec2 lq = vec2(hp.x, hp.z - uLpos.z) / R;
      float dl = sdDoos(lq, vec2(.16, .1), .03);
      col = mix(col, vec3(.02, .022, .026), smoothstep(.004, 0., dl));
      col += vec3(.85, .92, 1.) * uSpot * 5. * smoothstep(.01, -.01, sdDoos(lq, vec2(.11, .055), .03));
    }
    vec3 Lin = uInPos - hp; float lin = length(Lin); Lin /= lin;
    col += alb * 1.5 * uKl * (uBinnen * uOpen * 2.2 + uLek * .25) * max(dot(n, Lin), 0.) / (1. + 1.4 * lin * lin / (R * R)) * uFlik;
  }
  o = vec4(col * uFade, 1.);
}`;

  // De lucht vóór de deur: lichtbundel met stof, stoom, lichtstralen uit de kluis, plasmabogen en de overvloed.
  const FS_LUCHT = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uZoom;
uniform vec3 uCam, uLpos, uLdir, uKl, uGat;
uniform float uF, uR, uT, uTs, uSpot, uStoom, uLek, uBinnen, uOpen, uFlood, uFade, uKwal, uTier, uFlik, uB0, uBdt, uBoog;
${GEMEEN}
${KG}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  vec3 col = vec3(0.);
  float R = uR;
  vec3 ro = uCam;
  vec3 rd = normalize(vec3(2. * p / uF, -1.));
  vec3 w0 = ro - uLpos;
  float b = dot(rd, uLdir), dd = dot(rd, w0), e = dot(uLdir, w0);
  float den = max(1. - b * b, 1e-4);
  float s = (b * e - dd) / den;
  float ta = (e - b * dd) / den;
  float zWand = ro.z / max(-rd.z, 1e-3);
  float bundel = 0.;
  if (s > 0. && ta > 0.) {
    float dist = length((ro + rd * s) - (uLpos + uLdir * ta));
    float br = .06 * R + ta * .42;
    bundel = exp(-dist * dist / (br * br) * 1.6) * smoothstep(0., .25 * R, ta) / (1. + ta * ta * .35 / (R * R)) * smoothstep(0., .1 * R, zWand - s + .05 * R);
  }
  if (bundel > .002) col += vec3(.55, .62, .75) * bundel * (.6 + .8 * vn(p * 5. + vec2(uT * .05, -uT * .08))) * uSpot * .17;
  // stofjes
  float stof = 0.;
  for (int i = 0; i < 2; i++) {
    if (i == 1 && uKwal > .5) break;
    float fi = float(i);
    vec2 pp = p * (26. + fi * 19.) + vec2(fi * 7.3 + sin(uT * .13 + fi), uT * (.11 + fi * .05));
    vec2 id = floor(pp);
    vec2 f = fract(pp) - .5;
    vec2 h = h22(id + fi * 17.);
    vec2 pos = (h - .5) * .6 + .1 * vec2(sin(uT * (.5 + h.x) + h.y * 6.), cos(uT * (.4 + h.y) + h.x * 6.));
    float sz = (.05 + .06 * h.x) * (1. + fi * .3);
    stof += smoothstep(sz, sz * .2, length(f - pos)) * step(.5, h.y) * (.55 + .45 * sin(uT * (1. + 2. * h.y) + h.x * 30.));
  }
  col += stof * (vec3(.9, .95, 1.) * (bundel * 1.8 * uSpot + .015) + uKl * (uBinnen * uOpen * .5 + uLek * .08));
  // rond de opening
  vec2 pc = p - uGat.xy;
  float Rs = uGat.z;
  float lp = length(pc);
  float rr = lp / Rs;
  vec2 dir = pc / max(lp, 1e-4);
  if (uStoom > .002 && rr > .8 && rr < 2.2) {
    float n = vn(dir * 4. + vec2(rr * 4. - uT * .6, uT * .1));
    float damp = exp(-pow((rr - 1.04) / .07, 2.)) * .35;
    for (int k = 0; k < 12; k++) {
      float fk = float(k);
      float age = uTs - (uB0 + mod(fk, 6.) * uBdt) - .05;
      if (age > 0. && age < 2.5) {
        float ak = .2618 + fk * .5236;
        vec2 c2 = vec2(cos(ak), sin(ak)) * (1.04 + .35 * pow(age, .6)) + vec2(0., .1 * age * age);
        float rad2 = .04 + .16 * pow(age, .7);
        vec2 dv = pc / Rs - c2;
        damp += exp(-dot(dv, dv) / (rad2 * rad2)) * (1. - exp(-age / .05)) * exp(-age / .8) * 1.2;
      }
    }
    damp *= (.3 + n) * uStoom;
    col += damp * (vec3(.5, .55, .62) * (.05 + .22 * uSpot * smoothstep(-.5, 1., dir.y)) + uKl * uLek * .9);
  }
  vec3 k1 = uKl;
  if (uTier > 3.5) k1 = hsv(vec3(atan(dir.y, dir.x + 1e-6) / TAU + uT * .12, .6, 1.));
  if (uBinnen > .001) {
    float str = vn(dir * 4. + vec2(uT * .3, -uT * .2)) * .65 + vn(dir * 11. + vec2(-uT * .5, 3.)) * .35;
    float ray = pow(str, 2.5) * (1.4 + uTier * .4);
    float fall = smoothstep(.75, 1.05, rr) * exp(-max(rr - 1., 0.) * (3.2 - uTier * .4));
    col += k1 * (ray * fall * .7 + .25 * exp(-abs(rr - 1.) * 6.)) * uBinnen * uOpen * uFlik;
  }
  if (uBoog > .001 && rr > .8 && rr < 1.3) {
    float boog = 0.;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float sp = floor(uT * 12. + fk * .37);
      float off = (vn(dir * 4.5 + vec2(sp * 1.7, fk * 9.)) - .5) * .12 + (vn(dir * 14. + vec2(fk * 3., sp)) - .5) * .04;
      float d2 = abs(rr - 1.02 - off);
      float act = smoothstep(.45, .7, vn(dir * 2.2 + vec2(uT * 2.1 + fk * 4., fk)));
      boog += act * (exp(-d2 / .004) + .25 * exp(-d2 / .03));
    }
    col += mix(uKl, vec3(1.), .55) * boog * uBoog * 1.8;
  }
  if (uFlood > .001) {
    col += mix(k1, vec3(1.), .5) * uFlood * (3.5 / (1. + 9. * rr * rr) + .35 * uFlood * uFlood);
  }
  o = vec4(col * uFade, 1.);
}`;

  // Tijden. nums: [start, snelle fase, ratelfase] per getal van de combinatie.
  function tijden(snel) {
    if (snel) return { fade: 0.6, nums: [[0.55, 0.42, 0.33], [1.45, 0.4, 0.3]], los: 2.38, W0: 2.55, W1: 3.45, B0: 3.3, Bdt: 0.1, Bdur: 0.15, L0: 3.3, E: 5.0, K0d: 1.15 };
    return { fade: 1.2, nums: [[1.2, 0.6, 0.45], [2.5, 0.55, 0.45], [3.75, 0.55, 0.45]], los: 5.05, W0: 5.25, W1: 6.75, B0: 6.45, Bdt: 0.17, Bdur: 0.2, L0: 6.45, E: 8.6, K0d: 1.7 };
  }

  SPO.openingen.kluis = {
    naam: 'kluis',
    shaders: {
      achter: { vs: VS_VOL, fs: FS_ACHTER, teken: 'vol' },
      deur: { vs: VS_DEUR, fs: FS_DEUR, teken: 'strip' },
      lucht: { vs: VS_VOL, fs: FS_LUCHT, teken: 'vol' },
    },

    tijdlijn(d) {
      const k = tijden(d.snel);
      const E = k.E;
      const K0 = E + k.K0d;
      const fotos = d.snel
        ? [0.35, 0.8, 1.32, 2.4, 2.9, 3.6, 4.4, E + 0.06, E + 0.35, E + 0.7, E + 1.0]
        : [0.6, 1.55, 2.3, 4.3, 5.1, 6.0, 7.1, 8.2, E + 0.06, E + 0.45, E + 0.95, E + 1.45];
      const r = { E, K0, fotos, staart: 0.5, kluis: k };
      if (!d.snel) {
        // Zelf kraken: de klok staat stil bij elke stap van de combinatie (drie getallen) en bij het handwiel.
        // De pauzes liggen op het begin van elke stap in de tijdgestuurde variant; de gebruiker springt na zijn
        // succes naar k.J (kort na het moment waarop het slot er vanzelf was).
        const n = k.nums;
        k.P = n.map((x) => x[0]).concat([k.W0 - 0.1]);
        k.J = n.map((x) => x[0] + x[1] + x[2] + 0.12).concat([k.B0 - 0.12]);
        r.pauzes = k.P.slice();
        r.klikHint = 'Draai het wiel rondjes om het slot te kraken';
        r.pauzeAuto = 14; // niets doen? na 14 s kraakt de kluis zichzelf
        const dr = window.__somPack;
        if (dr && dr.debug) {
          // alleen om te testen: ?pa=2 verkort de wachttijd
          const pa = +new URLSearchParams(location.search).get('pa');
          if (pa > 0) r.pauzeAuto = pa;
        }
      }
      return r;
    },

    *art(d, h) {
      const A = h.art;
      // de wijzerplaat: streepjes 0–99 en getallen per tien (wit = gegraveerd)
      const wv = A.nieuw(512, 512);
      const g = wv.getContext('2d');
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      g.lineCap = 'round';
      for (let i = 0; i < 100; i++) {
        const a = (i * Math.PI * 2) / 100;
        const s = Math.sin(a);
        const co = Math.cos(a);
        const lang = i % 10 === 0 ? 34 : i % 5 === 0 ? 24 : 14;
        g.lineWidth = i % 10 === 0 ? 6 : i % 5 === 0 ? 4.5 : 3;
        g.beginPath();
        g.moveTo(256 + s * 222, 256 - co * 222);
        g.lineTo(256 + s * (222 - lang), 256 - co * (222 - lang));
        g.stroke();
      }
      g.lineWidth = 3;
      g.beginPath();
      g.arc(256, 256, 226, 0, Math.PI * 2);
      g.stroke();
      g.font = `800 50px ${A.F_SPORT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let n = 0; n < 100; n += 10) {
        const a = (n * Math.PI * 2) / 100;
        g.save();
        g.translate(256 + Math.sin(a) * 158, 256 - Math.cos(a) * 158);
        g.rotate(a);
        g.fillText(String(n), 0, 2);
        g.restore();
      }
      yield;
      // de naamplaat: vak, onderwerp en weging
      const pv = A.nieuw(1024, 244);
      const c = pv.getContext('2d');
      c.fillStyle = '#fff';
      c.strokeStyle = '#fff';
      c.lineWidth = 5;
      c.beginPath();
      if (c.roundRect) c.roundRect(28, 22, 968, 200, 18);
      else c.rect(28, 22, 968, 200);
      c.stroke();
      const sp = (px) => {
        if ('letterSpacing' in c) c.letterSpacing = px + 'px';
      };
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const vak = d.vak.toUpperCase();
      sp(6);
      let fs = 112;
      c.font = `800 ${fs}px ${A.F_SPORT}`;
      while (c.measureText(vak).width > 840 && fs > 44) {
        fs -= 2;
        c.font = `800 ${fs}px ${A.F_SPORT}`;
      }
      c.fillText(vak, 512, 62 + fs * 0.78);
      let regel = `${d.onder}  ·  weging ${d.weging}×`.toUpperCase();
      sp(4);
      let fs2 = 30;
      c.font = `600 ${fs2}px ${A.F_TEKST}`;
      while (c.measureText(regel).width > 860 && fs2 > 18) {
        fs2 -= 1;
        c.font = `600 ${fs2}px ${A.F_TEKST}`;
      }
      while (c.measureText(regel).width > 860 && regel.length > 8) regel = regel.slice(0, -2) + '…';
      c.fillText(regel, 512, 200);
      sp(0);
      c.fillRect(80, 168, 120, 3);
      c.fillRect(824, 168, 120, 3);
      return { wijzer: wv, plaat: pv };
    },

    maak(c) {
      const { tl, d, gl } = c;
      const K = tl.kluis;
      const E = tl.E;
      const K0 = tl.K0;
      const tier = c.tier;
      const I = c.I;
      const red = c.reduceer;
      const snel = !!d.snel;
      const pA = c.prog('achter');
      const pD = c.prog('deur');
      const pL = c.prog('lucht');
      const texW = c.tekstuur(c.art.wijzer);
      const texP = c.tekstuur(c.art.plaat);
      const F = c.F;
      const sterk = [0.62, 0.85, 1.0, 1.15, 1.3][tier];
      const au = c.audio;

      // ── de combinatie: vast per vak/onderwerp/weging, dus niet afhankelijk van het cijfer ──
      let hs = 2166136261;
      for (const ch of `${d.vak}|${d.onder}|${d.weging}`) {
        hs ^= ch.charCodeAt(0);
        hs = Math.imul(hs, 16777619) >>> 0;
      }
      const rnd = () => {
        hs = (Math.imul(hs ^ (hs >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
        hs = Math.imul(hs ^ (hs >>> 13), 3266489909) >>> 0;
        hs = (hs ^ (hs >>> 16)) >>> 0;
        return hs / 4294967296;
      };
      const combi = [];
      for (let p = 0; combi.length < K.nums.length && p < 200; p++) {
        const n = 5 + Math.floor(rnd() * 90);
        if (combi.every((x) => Math.abs(x - n) > 8)) combi.push(n);
      }
      while (combi.length < K.nums.length) combi.push(17 + combi.length * 31);
      const nStart = Math.floor(rnd() * 100);
      const segs = [];
      let Ncur = nStart;
      K.nums.forEach(([s, DA, DB], i) => {
        const dir = i % 2 === 0 ? -1 : 1; // met de klok mee, tegen de klok in, met de klok mee
        let delta = ((((combi[i] - Ncur) * dir) % 100) + 100) % 100;
        if (delta < 35) delta += 100;
        const total = delta + (i === 0 || (i === 1 && !snel) ? 100 : 0);
        const nTail = snel ? 5 : 7;
        segs.push({ s, DA, DB, N0: Ncur, dir, total, nTail, vJ: (2 * nTail) / DB, klaar: s + DA + DB, tn: Ncur + dir * total });
        Ncur += dir * total;
      });
      const dial = { N: nStart, v: 0 };
      function draaiDial(t) {
        let N = nStart;
        let v = 0;
        for (let i = 0; i < segs.length; i++) {
          const g = segs[i];
          if (t < g.s) break;
          const dA = g.total - g.nTail;
          if (t < g.s + g.DA) {
            const u = (t - g.s) / g.DA;
            N = g.N0 + g.dir * ((3 * u * u - 2 * u * u * u) * dA + (u * u * u - u * u) * g.vJ * g.DA);
            v = (g.dir * ((6 * u - 6 * u * u) * dA + (3 * u * u - 2 * u) * g.vJ * g.DA)) / g.DA;
          } else if (t < g.klaar) {
            const u = (t - g.s - g.DA) / g.DB;
            N = g.N0 + g.dir * (dA + g.nTail * (1 - (1 - u) * (1 - u)));
            v = (g.dir * g.nTail * 2 * (1 - u)) / g.DB;
          } else {
            const tt = t - g.klaar;
            N = g.N0 + g.dir * (g.total + (tt < 0.3 ? 0.2 * Math.exp(-tt / 0.05) * Math.sin(tt * 60) : 0));
            v = 0;
          }
        }
        dial.N = N;
        dial.v = v;
      }

      // ── geluid ──
      // ratel: elke tik die langs het merkteken gaat (snel draaien: hooguit 26 per seconde)
      segs.forEach((g) => {
        let vorige = null;
        let laatst = -1;
        for (let t = g.s; t <= g.klaar + 1e-6; t += 0.001) {
          draaiDial(t);
          const n = Math.floor(dial.N);
          if (vorige !== null && n !== vorige) {
            const v = Math.abs(dial.v);
            if (t - laatst >= 1 / 26 || v < 40) {
              const zacht = Math.min(1, v / 300);
              const gain = 0.85 - 0.55 * zacht;
              const rate = (0.9 + 0.18 * zacht) * (0.97 + 0.06 * rnd());
              c.at(t, () => au.speel('kluis-klik', { gain, rate }));
              laatst = t;
            }
          }
          vorige = n;
        }
      });
      c.at(0.1, () => au.boem(0.22, 0.7)); // de lamp in de gang springt aan
      segs.forEach((g, i) => {
        c.at(g.klaar, () => {
          au.speel('kluis-slot', { gain: 0.5 + 0.1 * i, rate: 1.12 - 0.07 * i, galmen: 0.15 });
          c.trillen(12);
        });
        c.schok(g.klaar, 0.008, 0.1);
      });
      c.at(K.los, () => {
        au.speel('kluis-slot', { gain: 1.05, rate: 0.82, galmen: 0.3 });
        c.trillen([20, 30, 40]);
      });
      c.schok(K.los, 0.016, 0.16);
      c.at(K.W0 - 0.05, () => au.speel('kluis-wiel', { gain: 1, duur: K.W1 - K.W0 + 0.5, fadeOut: 0.4, galmen: 0.15 }));
      for (let j = 0; j < 6; j++) {
        const tj = K.B0 + j * K.Bdt + K.Bdur * 0.85;
        c.at(tj, () => au.speel('kluis-slot', { gain: 0.32 + 0.04 * j, rate: 1.22 + 0.06 * (j % 2), pan: j % 2 ? 0.35 : -0.35 }));
        c.schok(tj, 0.0045, 0.08);
      }
      c.at(K.L0, () => au.riser(E - K.L0, 0.85));
      if (!snel) [1.8, 1.15, 0.55].forEach((x, i) => c.at(E - x, () => au.hartslag(0.3 + 0.15 * i)));
      c.at(E - (snel ? 0.3 : 0.4), () => au.speel('kluis-deur', { gain: 1, galmen: 0.3 }));
      c.at(E, () => {
        au.boem(0.8 + 0.2 * I);
        c.trillen([40, 30, 90]);
      });
      c.at(E + (snel ? 0.55 : 0.95), () => au.whoosh(0.8));
      c.schok(E, 0.05, 0.3);
      c.flits(E, 0.3, 0.035);
      c.flits(E, 0.08 + 0.12 * I, 0.18);
      c.golf(E, 1.3, 0.85, 0);
      c.golf(E + 0.1, 0.9, 0.5, 0);

      // ── deeltjes ──
      const wit = [1, 0.96, 0.88];
      const vonken = segs.map((g) => g.klaar).concat([K.los]).map((t0, i, l) =>
        c.e({ mode: 0, t0, delay: 0.03, life: 0.55, n: i === l.length - 1 ? 46 : 26, org: [0, 0], angle: Math.PI / 2, spread: 2.6, spd: [0.06, 0.42], grav: [0, -0.7], drag: 2.2, size: [0.0011, 0.0028], col1: [1, 0.95, 0.85], col2: [0.75, 0.85, 1], alpha: 0.9, seed: 21 + i }),
      );
      const naad = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * c.TWEE_PI + 0.2;
        naad.push({ a, e: c.e({ mode: 0, t0: E, delay: 0.1, life: 1.1, n: Math.round(30 + 70 * sterk), org: [0, 0], angle: a, spread: 1.4, spd: [0.15, 1.2], grav: [0, -0.45], drag: 1.6, size: [0.0015, 0.0045], col1: c.kl, col2: wit, alpha: 0.95, regen: tier === 4 ? 1 : 0, seed: 40 + k }) });
      }
      const extra = [];
      const ex = (o) => extra.push(c.e(Object.assign({ org: [0, 0] }, o)));
      const t1 = E + 0.5 * (K0 - E);
      if (tier === 0) {
        ex({ mode: 0, t0: E + 0.2, delay: 1.2, life: 1.6, n: 70, spread: c.TWEE_PI, spd: [0.05, 0.25], grav: [0, 0.06], drag: 2.5, size: [0.0015, 0.0035], col1: c.kl, col2: [1, 0.5, 0.2], seed: 61 });
      } else if (tier === 1) {
        ex({ mode: 0, t0: t1, delay: 0.9, life: 1.0, n: 180, spread: c.TWEE_PI, spd: [0.4, 1.4], grav: [0, -0.1], drag: 1.2, size: [0.001, 0.003], col1: c.kl, col2: wit, seed: 62 });
        ex({ mode: 1, t0: E, life: 3, n: 40, size: [0.004, 0.016], col1: c.kl, col2: wit, alpha: 0.5, seed: 63 });
      } else if (tier === 2) {
        ex({ mode: 5, t0: t1, delay: 0.8, life: 2.0, n: 70, angle: Math.PI / 2, spread: 2.6, spd: [0.3, 0.9], grav: [0, -0.9], drag: 0.5, size: [0.012, 0.022], col1: [1, 0.82, 0.32], col2: [0.85, 0.55, 0.12], blend: 'alpha', seed: 64 });
        ex({ mode: 1, t0: E, life: 3, n: 70, size: [0.004, 0.02], col1: c.kl, col2: c.kl2, alpha: 0.6, seed: 65 });
      } else if (tier === 3) {
        ex({ mode: 0, t0: t1, delay: 0.9, life: 1.1, n: 260, spread: c.TWEE_PI, spd: [0.3, 1.6], grav: [0, -0.2], drag: 1.3, size: [0.0012, 0.0035], col1: c.kl, col2: c.kl2, seed: 66 });
        ex({ mode: 1, t0: E, life: 3, n: 80, size: [0.004, 0.02], col1: c.kl, col2: c.kl2, alpha: 0.6, seed: 67 });
      } else {
        ex({ mode: 0, t0: t1, delay: 1.0, life: 1.3, n: 420, spread: c.TWEE_PI, spd: [0.3, 1.9], grav: [0, -0.25], drag: 1.2, size: [0.0013, 0.004], col1: c.kl, col2: wit, regen: 1, seed: 68 });
        ex({ mode: 5, t0: t1, delay: 0.9, life: 1.8, n: 90, angle: Math.PI / 2, spread: 2.8, spd: [0.25, 1.0], grav: [0, -0.7], drag: 0.6, size: [0.006, 0.013], col1: [0.85, 0.95, 1], col2: [1, 1, 1], blend: 'optel', alpha: 0.9, seed: 69 });
        ex({ mode: 1, t0: E, life: 3, n: 90, size: [0.004, 0.022], col1: c.kl, col2: c.kl2, regen: 1, alpha: 0.7, seed: 70 });
      }

      // ── zelf kraken ──
      // Zie LEESMIJ.md ('invoer'): main.js geeft tijdens een pauze de aanwijzer en de pijltjestoetsen door en vraagt
      // elk beeld of de pauze voorbij is. Het beeld blijft teken(t) plus deze invoerstand; zonder invoer (seek, Spatie,
      // de snelle modus, niets doen) loopt alles op de tijdlijn en is het de automatische variant.
      const NS = K.P ? K.nums.length : 0; // getallen die je zelf draait; daarna volgt het handwiel
      const WMAX = 2.36; // zo ver draait het handwiel (rad), net als de automatische variant
      const WIN = 1.8; // het slot pakt binnen zoveel streepjes van het doelgetal
      const TEKST = [];
      segs.forEach((g, i) => TEKST.push(`${['Draai het wiel naar rechts, tot ', 'Nu naar links, tot ', 'Weer naar rechts, tot '][i % 3]}${combi[i]}`));
      TEKST[NS] = 'Draai het grote handwiel met de klok mee';
      const TEKST0 = 'Draai het wiel rondjes om het slot te kraken';
      const TEKST_IDLE = 'Sleep rondjes om het wiel · dubbeltik of Spatie slaat over';
      const ui = {
        aan: false, // dit beeld speelt echt (geen seek): alleen dan telt de invoer
        bezig: false, // de klok staat stil en wacht op jou
        stap: 0, // 0…NS−1 = een getal, NS = het handwiel, daarna klaar of automatisch
        auto: false,
        klaar: [false, false, false, false],
        tKlaar: [-9, -9, -9, -9],
        tn: 0, // eigen klok (loopt ook tijdens een pauze)
        verloren: 0, // totale pauzetijd: ambient beweging (stof, ademhaling) loopt dan gewoon door
        idle: 0,
        idleTekst: false,
        vis: 0, vv: 0, doelN: 0, // het getallenwiel: getekende stand (met vering) en de stand van je vinger
        inWin: false, dw: 0, need: 0.4, lastDir: 0,
        wvis: 0, wv: 0, wdoel: 0, wEind: false, // het handwiel
        pid: -1, thV: NaN, tBew: 0, tTap: -9, tDown: 0, x0: 0, y0: 0, tikWiel: 0, lastKlik: 0,
        cx: 0, cy: 0, rad: 0.3, // de deur in p-ruimte (voor het raken)
        imp: 0, ok: 0, hintI: 0, wtrill: 0,
        off: 0, offT: -9, woff: 0, woffT: -9,
      };
      const wrap100 = (x) => x - 100 * Math.round(x / 100);
      const rnd2 = Math.random;

      function begin(st) {
        ui.bezig = true;
        ui.idle = 0;
        ui.idleTekst = false;
        ui.hintI = 0;
        ui.pid = -1;
        ui.thV = NaN;
        ui.inWin = false;
        ui.dw = 0;
        if (st < NS) {
          ui.vis = ui.doelN = segs[st].N0;
          ui.vv = 0;
          ui.lastDir = 0;
        } else {
          ui.wvis = ui.wdoel = 0;
          ui.wv = 0;
          ui.wEind = false;
          ui.tikWiel = 0;
        }
        tl.klikHint = TEKST[st];
      }
      function overgeven(t) {
        // de klok loopt weer zonder dat jij klaar bent (Spatie, wachttijd, een klik): neem de automatische variant over
        if (ui.bezig) {
          if (ui.stap < NS) {
            draaiDial(t);
            ui.off = wrap100(ui.vis - dial.N);
            ui.offT = t;
          } else {
            ui.woff = ui.wvis - wielAuto(t);
            ui.woffT = t;
          }
        }
        ui.bezig = false;
        ui.auto = true;
        ui.stap = NS + 5;
        ui.pid = -1;
      }
      // elk beeld, vóór het tekenen
      function opdracht(t, dt) {
        ui.tn += dt;
        const st = ui.stap;
        if (!ui.auto && st <= NS) {
          const P = K.P[st];
          if (t >= P - 1e-6 && t <= P + 0.002) {
            if (!ui.bezig) begin(st);
          } else if (t > P + 0.002) overgeven(t);
        }
        const ex = Math.exp(-dt / 0.07);
        ui.imp *= ex;
        ui.ok *= Math.exp(-dt / 0.28);
        if (ui.klaar[NS]) {
          const du = ui.tn - ui.tKlaar[NS];
          ui.wtrill = 0.03 * Math.sin(du * 30) * Math.exp(-du / 0.1);
        }
        if (!ui.bezig) {
          ui.hintI *= Math.exp(-dt * 8);
          return;
        }
        ui.verloren += dt;
        ui.idle += dt;
        ui.hintI += (1 - ui.hintI) * (1 - Math.exp(-dt * 2.5));
        if (ui.idle > 5 && !ui.idleTekst) {
          ui.idleTekst = true;
          tl.klikHint = TEKST_IDLE;
        }
        let rest = dt;
        if (st < NS) {
          const T = combi[st];
          const eff = ui.inWin ? ui.doelN - wrap100(ui.doelN - T) : ui.doelN;
          while (rest > 0) {
            const h = Math.min(rest, 0.008);
            ui.vv += ((eff - ui.vis) * 900 - ui.vv * 42) * h;
            ui.vis += ui.vv * h;
            rest -= h;
          }
          if (ui.inWin) ui.dw += dt;
        } else {
          while (rest > 0) {
            const h = Math.min(rest, 0.008);
            ui.wv += ((ui.wdoel - ui.wvis) * 260 - ui.wv * 24) * h;
            ui.wvis += ui.wv * h;
            rest -= h;
          }
        }
      }

      // geluid en schok bij een tik van het wiel (vanuit de invoer, nooit in teken)
      function klik(v) {
        const nu = performance.now();
        if (nu - ui.lastKlik < 38) return;
        ui.lastKlik = nu;
        const zacht = Math.min(1, v / 300);
        au.speel('kluis-klik', { gain: 0.85 - 0.55 * zacht, rate: (0.9 + 0.18 * zacht) * (0.97 + 0.06 * rnd2()) });
        ui.imp = Math.min(1.2, ui.imp + 0.3);
      }
      function mis() {
        au.speel('kluis-klik', { gain: 0.32, rate: 0.62 + 0.06 * rnd2() });
        ui.imp = Math.min(1.4, ui.imp + 0.55);
        c.trillen(7);
      }
      // je vinger draait het getallenwiel met dn streepjes
      function draaiGetal(dn, v) {
        const oud = ui.doelN;
        ui.doelN += dn;
        if (Math.abs(dn) > 0.04) ui.lastDir = dn > 0 ? 1 : -1;
        if (Math.floor(ui.doelN) !== Math.floor(oud)) klik(v);
        const st = ui.stap;
        const bin = Math.abs(wrap100(ui.doelN - combi[st])) <= WIN;
        if (bin && !ui.inWin) {
          ui.inWin = true;
          ui.dw = 0;
          ui.need = ui.lastDir === segs[st].dir || ui.lastDir === 0 ? 0.4 : 0.85;
          au.speel('kluis-klik', { gain: 0.9, rate: 1.35 });
          ui.imp = Math.min(1.2, ui.imp + 0.5);
        } else if (!bin && ui.inWin) {
          ui.inWin = false;
          if (ui.dw < ui.need) mis();
          ui.dw = 0;
        }
      }
      function draaiHandwiel(da, v) {
        const oud = ui.wdoel;
        ui.wdoel = Math.max(-WMAX, Math.min(0, ui.wdoel + da));
        const k = Math.floor(-ui.wdoel / 0.3);
        if (k !== Math.floor(-oud / 0.3)) {
          au.speel('kluis-wiel', { gain: 0.55, rate: 0.92 + 0.12 * rnd2(), offset: 0.1 + 1.6 * (-ui.wdoel / WMAX), duur: 0.3, fadeIn: 0.03, fadeOut: 0.12 });
          ui.imp = Math.min(1.2, ui.imp + 0.4);
        }
        if (ui.wdoel <= -WMAX + 0.03) ui.wEind = true;
      }
      function succes(st) {
        ui.klaar[st] = true;
        ui.tKlaar[st] = ui.tn;
        ui.ok = 1;
        ui.bezig = false;
        ui.pid = -1;
        ui.inWin = false;
        if (st < NS) {
          ui.vis = ui.doelN = segs[st].tn;
          ui.vv = 0;
          ui.imp = 1.6;
          au.speel('kluis-slot', { gain: 0.5 + 0.1 * st, rate: 1.12 - 0.07 * st, galmen: 0.15 });
          c.trillen(12);
        } else {
          ui.wvis = -WMAX;
          ui.wv = 0;
          ui.imp = 2.4;
          au.speel('kluis-slot', { gain: 1.05, rate: 0.82, galmen: 0.3 });
          c.trillen([20, 30, 40]);
        }
        ui.stap = st + 1;
        return K.J[st];
      }
      // hoek van de aanwijzer (genormeerd scherm 0…1) rond het midden van de deur; NaN als hij te dicht bij het midden zit
      function hoek(x, y) {
        const dx = (x - 0.5) * c.asp - ui.cx;
        const dy = 0.5 - y - ui.cy;
        if (dx * dx + dy * dy < ui.rad * ui.rad * 0.015) return NaN;
        return Math.atan2(dy, dx);
      }
      const invoer = {
        // pointerdown/move/up in genormeerde canvas-coördinaten; geeft true / een tijd / 'over' terug om de pauze te beëindigen
        aanwijzer(soort, x, y, e) {
          if (!ui.bezig || ui.auto) return false;
          const nu = performance.now();
          if (soort === 'down') {
            if (ui.pid !== -1) return false;
            ui.pid = e.pointerId;
            ui.thV = hoek(x, y);
            ui.tBew = nu;
            ui.tDown = nu;
            ui.x0 = x;
            ui.y0 = y;
            ui.idle = 0;
            if (ui.idleTekst) {
              ui.idleTekst = false;
              tl.klikHint = TEKST[ui.stap];
            }
            return false;
          }
          if (e.pointerId !== ui.pid) return false;
          if (soort === 'move') {
            ui.idle = 0;
            const th = hoek(x, y);
            if (th !== th) return false;
            if (ui.thV !== ui.thV) {
              ui.thV = th;
              return false;
            }
            let dth = th - ui.thV;
            dth -= 2 * Math.PI * Math.round(dth / (2 * Math.PI));
            ui.thV = th;
            const sec = Math.max(0.004, (nu - ui.tBew) / 1000);
            ui.tBew = nu;
            if (ui.idleTekst) {
              ui.idleTekst = false;
              tl.klikHint = TEKST[ui.stap];
            }
            if (ui.stap < NS) draaiGetal((dth * 100) / (2 * Math.PI), Math.abs((dth * 100) / (2 * Math.PI)) / sec);
            else draaiHandwiel(dth, Math.abs(dth) / sec);
            return false;
          }
          // up of cancel: een korte tik is geen draaibeweging; twee korte tikken slaan de interactie over
          ui.pid = -1;
          if (soort === 'up' && nu - ui.tDown < 320 && Math.hypot((x - ui.x0) * c.asp, y - ui.y0) < 0.03) {
            if (nu - ui.tTap < 380) return 'over';
            ui.tTap = nu;
          }
          return false;
        },
        // pijltjes links/rechts draaien het wiel (rechts = rechtsom); Spatie en Enter slaan over (doet main.js)
        toets(key, e) {
          if (!ui.bezig || ui.auto) return false;
          const r = key === 'ArrowRight' ? -1 : key === 'ArrowLeft' ? 1 : 0;
          if (!r) return false;
          ui.idle = 0;
          if (ui.idleTekst) {
            ui.idleTekst = false;
            tl.klikHint = TEKST[ui.stap];
          }
          if (ui.stap < NS) draaiGetal(r * (e && e.shiftKey ? 4 : 1), 60);
          else draaiHandwiel(r * 0.1, 3);
          return true;
        },
        // elk beeld tijdens een pauze: is jouw stap gelukt?
        klaar() {
          if (!ui.bezig || ui.auto) return false;
          const st = ui.stap;
          if (st < NS) {
            if (ui.inWin && ui.dw >= ui.need) return succes(st);
          } else if (st === NS && ui.wEind) return succes(st);
          return false;
        },
      };
      if (window.__somPack && window.__somPack.debug) window.__kluisDebug = { ui, segs, combi, K, NS };

      // ── toestand per beeld (alles een functie van t) ──
      const S = { dist: 3, bx: 0, by: 0 };
      const KL = [0, 0, 0];
      const KL2 = [0, 0, 0];
      const lampAan = [];
      const lampGroen = [];
      for (let i = 0; i < 3; i++) {
        if (i < segs.length) {
          lampAan[i] = segs[i].s;
          lampGroen[i] = segs[i].klaar;
        } else {
          lampAan[i] = lampGroen[i - 1] + 0.06;
          lampGroen[i] = K.los;
        }
      }
      const lamp = (i, t, ta) => {
        if (t < lampAan[i]) return 0;
        if (t < lampGroen[i]) return red ? 0.9 : 0.62 + 0.38 * (0.5 + 0.5 * Math.cos((ta - lampAan[i]) * 19));
        let s = 2 + 1.3 * Math.exp(-(t - lampGroen[i]) / 0.09);
        if (t >= K.los) s += 1.0 * Math.exp(-(t - K.los) / 0.16);
        if (ui.aan && ui.klaar[i]) s += 1.3 * Math.exp(-(ui.tn - ui.tKlaar[i]) / 0.09);
        return s;
      };
      // de hoek van het handwiel: de automatische variant, of jouw draaiing
      function wielHoek(t) {
        if (ui.aan) {
          if (ui.bezig && ui.stap === NS) return ui.wvis;
          if (ui.klaar[NS]) return -WMAX - ui.wtrill;
          const dw = t - ui.woffT;
          if (dw >= 0 && dw < 1.2) return wielAuto(t) + ui.woff * Math.exp(-dw / 0.15);
        }
        return wielAuto(t);
      }
      function wielAuto(t) {
        const u = c.ramp(t, K.W0, K.W1);
        let a = -2.36 * u * u * u * (u * (u * 6 - 15) + 10);
        a += 0.05 * Math.sin(Math.PI * c.ramp(t, K.W0 - 0.2, K.W0 + 0.05));
        if (t > K.W1) a -= 0.03 * Math.sin((t - K.W1) * 30) * Math.exp(-(t - K.W1) / 0.1);
        return a;
      }
      function lek(t) {
        if (t < K.L0) return 0;
        let v = Math.pow(c.ramp(t, K.L0, E), 1.7);
        if (t >= E) v = 1 + 1.5 * Math.exp(-(t - E) / 0.12);
        return v * (1 - 0.8 * c.sm(t, E + 0.25, E + 1.0)) * sterk;
      }
      function binnen(t) {
        if (t < E) return 0;
        return sterk * (1.2 * Math.exp(-(t - E) / 0.12) + (0.7 + 0.4 * c.sm(t, E, E + 0.5)) * (1 + 1.0 * c.sm(t, E + 0.9, K0)));
      }
      const hoekDeur = (t) => 1.85 * Math.pow(c.ramp(t, E + 0.12, K0 - 0.05), 1.35);
      function spotAan(t) {
        let v = c.sm(t, 0.05, K.fade * 0.8);
        if (!red && t < K.fade) {
          const f = K.fade;
          if (t > 0.16 * f && t < 0.22 * f) v *= 0.25;
          else if (t > 0.3 * f && t < 0.34 * f) v *= 0.5;
        }
        return v * (1 - 0.5 * c.sm(t, E, E + 0.6));
      }
      // ts = tijd voor de toestand (dolly), ta = tijd voor de beweging (ademhaling): die loopt door tijdens een pauze
      function camera(ts, ta, rust) {
        S.dist = 3.0 - 0.42 * (rust ? 0 : c.sm(ts, 0, E + 0.5));
        const br = (rust ? 0.6 : 1 - c.sm(ts, E + 0.3, K0)) * (red ? 0.35 : 1);
        S.bx = br * (0.013 * Math.sin(ta * 0.61 + 1.1) + 0.006 * Math.sin(ta * 1.33 + 0.4));
        S.by = br * (0.01 * Math.sin(ta * 0.79 + 2.3) + 0.005 * Math.sin(ta * 1.67 + 0.2));
      }

      // tekent alles. ts = tijd voor de toestand, ta = tijd voor de beweging (stof); rust = startscherm
      function tekenAlles(ts, ta, rust) {
        const t = ts;
        const H = c.H_ZICHT;
        const asp = c.asp;
        const R = Math.min(0.41 * H, 0.505 * H * asp);
        camera(ts, ta, rust);
        const cam = c.cam;
        const dist = S.dist;
        const kw = c.motor.kwaliteit;
        // kleuren: tot het licht gaat lekken alles neutraal
        const gekleurd = !rust && t >= K.L0 - 0.01;
        for (let i = 0; i < 3; i++) {
          KL[i] = gekleurd ? c.kl[i] : 0.6;
          KL2[i] = gekleurd ? c.kl2[i] : 0.6;
        }
        const fade = rust ? 1 : c.sm(t, 0, K.fade) * (1 - c.sm(t, K0 + 0.02, K0 + tl.staart));
        const spotV = rust ? 1 : spotAan(t);
        const lk = rust ? 0 : lek(t);
        const bn = rust ? 0 : binnen(t);
        const th = rust ? 0 : hoekDeur(t);
        const open = Math.min(1, th / 1.0);
        const flood = rust ? 0 : Math.pow(c.sm(t, E + 0.68 * (K0 - E), K0), 1.6) * (1 - c.sm(t, K0 + 0.05, K0 + 0.45));
        const stoom = rust ? 0 : c.sm(t, K.B0, K.B0 + 0.3) * (1 - c.sm(t, E + 0.2, E + 1.2));
        const flik = tier === 0 && !red ? 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(ta * 23) * Math.sin(ta * 7.3 + 1)) : 1;
        const boog = tier === 3 && !rust ? 0.5 * c.sm(t, E - 1.2, E) + 0.8 * c.sm(t, E, E + 0.2) : 0;
        const lY = 1.55 * R;
        const lZ = 0.9 * R;
        const inZ = -0.5 * R + 1.1 * R * open;
        const sch = F / (2 * dist); // p per wereld-eenheid op de muur
        const gx = -S.bx * sch;
        const gy = -S.by * sch;

        // 1. de gang en de opening
        pA.gebruik();
        c.basis(pA);
        pA.f3('uCam', S.bx, S.by, dist);
        pA.f1('uF', F);
        pA.f1('uR', R);
        pA.f1('uT', ta);
        pA.f1('uSpot', spotV);
        pA.f1('uLek', lk);
        pA.f1('uBinnen', bn);
        pA.f1('uOpen', open);
        pA.f1('uFade', fade);
        pA.f1('uTier', tier);
        pA.f1('uFlik', flik);
        pA.f3('uLpos', 0, lY, lZ);
        pA.f3('uLdir', 0, -0.8412, -0.5408);
        pA.f3('uInPos', 0, 0, inZ);
        pA.v3('uKl', KL);
        pA.v3('uKl2', KL2);
        c.motor.mengen('optel');
        if (c.aan('k-achter')) c.motor.volledig();

        // 2. de deur
        let jx = 0;
        let jy = 0;
        if (!rust && !red && t < E) {
          const a = 0.0025 * R * lk * lk;
          jx = a * Math.sin(ta * 73.1);
          jy = a * Math.sin(ta * 61.7 + 1);
        }
        if (ui.aan && ui.imp > 0.002) {
          // elke tik laat de deur even schokken (jouw hand voelt het slot)
          const ia = ui.imp * (red ? 0.0025 : 0.008) * R;
          jx += ia * Math.sin(ta * 131);
          jy += ia * Math.sin(ta * 113 + 1);
        }
        const zpop = rust ? 0 : 0.04 * R * c.sm(t, E - 0.03, E + 0.08);
        const Sx = -1.13 * R;
        const Sz = 0.05 * R;
        {
          // waar staat het midden van de deur op het scherm? (voor het raken van de invoer)
          const kk = F / (2 * (dist - Sz));
          ui.cx = -S.bx * kk + (cam.x * dist) / (dist - Sz);
          ui.cy = -S.by * kk + (cam.y * dist) / (dist - Sz);
          ui.rad = R * kk;
        }
        pD.gebruik();
        pD.f3('uPos', jx + Sx, jy, zpop + Sz);
        pD.f3('uRot', 0, th, 0);
        pD.f3('uScharnier', Sx, 0, Sz);
        pD.f3('uCamPos', S.bx - (cam.x * 2 * dist) / F, S.by - (cam.y * 2 * dist) / F, dist);
        pD.f1('uRoll', 0);
        pD.f1('uAspect', asp);
        pD.f1('uF', F);
        pD.f1('uR', R);
        pD.f1('uDik', 0.3 * R);
        pD.f1('uQuad', 1.2);
        pD.tex('uWijzer', 0, texW);
        pD.tex('uPlaat', 1, texP);
        pD.f3('uLpos', 0, lY, lZ);
        pD.f3('uLdir', 0, -0.8412, -0.5408);
        pD.f3('uInPos', 0, 0, inZ);
        pD.v3('uKl', KL);
        draaiDial(rust ? 0 : t);
        let dN = dial.N;
        let dV = dial.v;
        let hx = 0;
        let hy = 0;
        let hw = 0;
        let wh = 0;
        if (ui.aan) {
          if (ui.bezig && ui.stap < NS) {
            dN = ui.vis;
            dV = ui.vv;
            const st = ui.stap;
            hx = (combi[st] * Math.PI * 2) / 100;
            hy = ui.hintI * (0.55 + 0.6 * (1 - c.sm(Math.abs(wrap100(ui.vis - combi[st])), 3, 30)));
            hw = segs[st].dir > 0 ? 1 : -1;
          } else if (ui.bezig) {
            wh = ui.hintI;
            hw = -1;
          } else {
            const dd = t - ui.offT;
            if (dd >= 0 && dd < 1.2) dN += ui.off * Math.exp(-dd / 0.12);
          }
        }
        pD.f1('uDial', (dN * Math.PI * 2) / 100);
        pD.f1('uDialW', Math.max(-1.2, Math.min(1.2, ((dV * Math.PI * 2) / 100) * 0.014)));
        pD.f1('uWiel', rust ? 0 : wielHoek(t));
        pD.f4('uHint', hx, hy, red ? 0 : ta, hw);
        pD.f1('uWH', wh);
        pD.f1('uOk', ui.aan ? ui.ok : 0);
        pD.f3('uLamp', rust ? 0 : lamp(0, t, ta), rust ? 0 : lamp(1, t, ta), rust ? 0 : lamp(2, t, ta));
        pD.f1('uT', rust ? 0 : t);
        pD.f1('uB0', K.B0);
        pD.f1('uBdt', K.Bdt);
        pD.f1('uBdur', K.Bdur);
        pD.f1('uLek', lk);
        pD.f1('uBinnen', bn);
        pD.f1('uFade', fade);
        pD.f1('uSpot', spotV);
        pD.f1('uKwal', kw);
        c.motor.mengen('alpha');
        const deurAan = c.aan('k-deur');
        if (th > 0.005 && deurAan) {
          pD.f1('uDeel', 1);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 258);
          c.motor.teken.draws++;
        }
        // welke kant zien we? (de deur draait naar ons toe, om het scharnier)
        const nx = Math.sin(th);
        const nz = Math.cos(th);
        const cx = Sx - Math.cos(th) * Sx;
        const cz = Sz + zpop + Math.sin(th) * Sx;
        const achter = nx * (S.bx - cx) + nz * (dist - cz) < 0;
        pD.f1('uDeel', 0);
        pD.f1('uKant', achter ? 1 : 0);
        pD.f1('uZvlak', achter ? -0.3 * R : 0);
        if (deurAan) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        c.motor.teken.draws++;

        // 3. de lucht ervoor
        pL.gebruik();
        c.basis(pL);
        pL.f3('uCam', S.bx, S.by, dist);
        pL.f1('uF', F);
        pL.f1('uR', R);
        pL.f1('uT', ta);
        pL.f1('uTs', ts);
        pL.f1('uSpot', spotV);
        pL.f1('uStoom', stoom);
        pL.f1('uLek', lk);
        pL.f1('uBinnen', bn);
        pL.f1('uOpen', open);
        pL.f1('uFlood', flood);
        pL.f1('uFade', fade);
        pL.f1('uKwal', kw);
        pL.f1('uTier', tier);
        pL.f1('uFlik', flik);
        pL.f1('uB0', K.B0);
        pL.f1('uBdt', K.Bdt);
        pL.f1('uBoog', boog);
        pL.f3('uLpos', 0, lY, lZ);
        pL.f3('uLdir', 0, -0.8412, -0.5408);
        pL.f3('uGat', gx, gy, R * sch);
        pL.v3('uKl', KL);
        c.motor.mengen('optel');
        if (c.aan('k-lucht')) c.motor.volledig();
        if (rust) return;

        // 4. deeltjes
        for (let i = 0; i < vonken.length; i++) {
          const v = vonken[i];
          if (t < v.t0 - 0.01 || t > v.t0 + v.delay + v.life + 0.05) continue;
          v.org[0] = gx;
          v.org[1] = gy + 0.232 * R * sch;
          c.zend(t, v);
        }
        if (t >= E - 0.01 && t < E + 1.4) {
          for (let k = 0; k < naad.length; k++) {
            const n = naad[k];
            n.e.org[0] = gx + Math.cos(n.a) * R * sch * 1.02;
            n.e.org[1] = gy + Math.sin(n.a) * R * sch * 1.02;
            c.zend(t, n.e);
          }
        }
        for (let i = 0; i < extra.length; i++) {
          const x = extra[i];
          if (t < x.t0 - 0.01) continue;
          x.org[0] = gx + (x.mode === 1 ? 0 : 0.42 * R * sch);
          x.org[1] = gy;
          c.zend(t, x);
        }

        // 5. nabewerking
        const P = c.post;
        const dE = t - E;
        P.zoom = 1 + 0.9 * Math.pow(c.ramp(t, E + 0.55, K0), 2.2) + (dE >= 0 ? 0.025 * Math.exp(-dE / 0.15) : 0);
        P.rad = 0.4 * Math.pow(c.ramp(t, E + 0.7, K0), 2) + (dE >= 0 ? 0.18 * Math.exp(-dE / 0.2) : 0);
        P.streak = dE >= 0 ? 0.7 * Math.exp(-dE / 0.6) : 0.25 * lk;
        P.roll = 0.0018 * Math.sin(ta * 0.41 + 1) * (1 - c.sm(t, E, K0)) * (red ? 0.3 : 1);
        const w = c.sm(t, K.L0, E + 0.3);
        P.grade[0] = c.mix(0.93, 1, w);
        P.grade[1] = c.mix(0.98, 1, w);
        P.grade[2] = c.mix(1.07, 1, w);
        P.sat = c.mix(0.86, 1.05, c.sm(t, K.L0, E + 0.5));
        P.vig = c.mix(1.15, 0.95, c.sm(t, E, E + 0.6));
        P.bloom = 1 + 0.15 * c.sm(t, E, E + 0.4);
        P.ca = 1 + (dE >= 0 ? 0.8 * Math.exp(-dE / 0.4) : 0);
        if (ui.aan && ui.ok > 0.01) {
          P.ca += ui.ok * (red ? 0.3 : 0.9);
          P.bloom += 0.3 * ui.ok;
        }
      }

      return {
        teken(t, dt, inv) {
          ui.aan = NS > 0 && !!(inv && inv.afspelen);
          if (ui.aan) opdracht(t, Math.min(dt || 0.016, 0.05));
          tekenAlles(t, ui.aan ? t + ui.verloren : t, false);
        },
        invoer: NS > 0 ? invoer : undefined,
        reset() {
          ui.stap = 0;
          ui.auto = false;
          ui.bezig = false;
          ui.klaar.fill(false);
          ui.tKlaar.fill(-9);
          ui.verloren = 0;
          ui.offT = ui.woffT = -9;
          ui.imp = ui.ok = ui.hintI = ui.wtrill = 0;
          ui.pid = -1;
          ui.inWin = false;
          if (NS > 0) tl.klikHint = TEKST0;
        },
        wacht(t) {
          ui.aan = false;
          tekenAlles(K.fade + 0.1, t, true);
        },
        schud(t) {
          let a = 0;
          if (t > K.W0 && t < K.W1 + 0.2) a += 0.0012 * c.sm(t, K.W0, K.W0 + 0.3);
          if (t > K.L0 && t < E) a += 0.0008 + 0.0055 * Math.pow(c.ramp(t, K.L0, E), 2.2);
          if (t >= E && t < K0) a += 0.0035 * (1 - c.ramp(t, E, K0));
          return a;
        },
        sprong(t) {
          if (t < E - 0.6) return { doel: E - 0.45, riser: true };
          if (t < E + 0.5) return null;
          return undefined;
        },
      };
    },
  };
})();
