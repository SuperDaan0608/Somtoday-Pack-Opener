/*
 * Somtoday Pack Opener — openingen/raket.js
 * De raket ("Lanceren"): hoe hoog de raket komt, is je cijfer. Een nachtelijke lancering vanaf het platform,
 * aftellen, ontsteking, door de wolken, de stratosfeer en de rand van de ruimte, tot hij bij een 10 de maan
 * haalt. Waar de motor uitvalt en de raket stil komt te hangen, springt de neus open en komt de kaart eruit.
 *
 * Hoogte f = (cijfer − 1) / 9 (0 = platform, 1 = de maan). De klim is voor elk cijfer precies hetzelfde tot de
 * motor uitvalt: pas daar zie je hoe ver hij komt. Tot het hoogtepunt E is alles neutraal (oranje vlam, koel
 * licht); de kleur van het niveau verschijnt pas als de neus openspringt.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  const { KOP, GEMEEN, VS_VOL } = SPO.shaders;

  // ───────────────────────── GLSL ─────────────────────────
  // Een vierkant in p-ruimte (y −0,5…0,5), gedraaid om zijn midden. vL = lokaal −1…1 (y omhoog).
  const VS_KWAD = `${KOP}
uniform vec2 uRes, uShake; uniform float uZoom;
uniform vec2 uC, uHalf; uniform float uAng; uniform vec4 uUV;
out vec2 vUv; out vec2 vL; out vec2 vP;
void main(){
  vec2 g = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 l = vec2(g.x * 2. - 1., 1. - g.y * 2.);
  vL = l;
  vUv = vec2(mix(uUV.x, uUV.z, g.x), mix(uUV.y, uUV.w, g.y));
  float c = cos(uAng), s = sin(uAng);
  vec2 q = l * uHalf;
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec2 p = uC + q;
  vP = p;
  vec2 sp = p * uZoom + uShake;
  gl_Position = vec4(sp.x * 2. * uRes.y / uRes.x, sp.y * 2., 0., 1.);
}`;

  // De lucht: van de nacht op het platform via de wolkendekken en de dageraad naar de ruimte, de aarde en de maan.
  const FS_LUCHT = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake;
uniform float uZoom, uTime, uQ, uSter, uVig;
uniform sampler2D uRuis, uSter2;
uniform vec3 uZenit, uHorK, uGloedK, uVlamK;
uniform vec4 uHor, uZon, uMaan, uAarde, uDek0, uDek1, uPad, uLamp0, uLamp1, uVlam;
uniform vec2 uPadM, uDrift, uLampL;
uniform vec4 uLampD;
uniform vec2 uDekK;
${GEMEEN}
float wolk(vec2 q){
  return texture(uRuis, q * .125).r;
}
float bundel(vec2 p, vec2 o0, vec2 dir, float w){
  vec2 v = p - o0;
  float al = dot(v, dir);
  float dl = abs(dot(v, vec2(-dir.y, dir.x)));
  float ww = w * (1. + al * 2.4);
  return exp(-dl * dl / (ww * ww)) * smoothstep(0., .03, al) * exp(-al * 1.2);
}
// Een wolkendek als vlak: x = afstand tot de onderkant (>0: dek boven ons), y = afstand tot de bovenkant
// (>0: dek onder ons), z = bedekking, w = daglicht.
vec3 dek(vec3 col, vec2 p, float a, vec4 D, float idx, float kk){
  if (kk < .003 || (D.x <= 0. && D.y <= 0. && D.z < .002)) return col;
  vec3 mistK = mix(vec3(.05, .056, .072), vec3(.62, .64, .7), D.w);
  if (D.x > 0.) {
    if (a <= 0.) return col;
    float z = D.x / (a + .015);
    vec2 q = vec2(p.x * z * 1.15, z * 1.6) * (1. + 2.5 / (1. + z * 3.)) + vec2(idx * 17.3 + uDrift.x, idx * 7.1 + uDrift.y);
    float n = wolk(q * 1.3);
    float cov = smoothstep(.66 - .4 * D.z, .8 - .28 * D.z, n);
    cov = mix(D.z * .85, cov, exp(-z * .1)) * smoothstep(0., .03, a);
    vec3 cc = mix(vec3(.024, .028, .042), vec3(.36, .4, .48), D.w) * (.45 + .7 * n);
    vec2 dv = (p - uVlam.xy) * vec2(.8, 1.);
    float vl = uVlam.z * exp(-D.x * 3.2) * exp(-length(dv) * 1.6 / (1. + z * .3));
    cc += uVlamK * vl * (.12 + .5 * n) * .9;
    float mist = exp(-D.x * 16.);
    cc = mix(cc, mistK, mist);
    return mix(col, cc, max(cov, mist) * kk);
  }
  if (D.y > 0.) {
    if (a >= 0.) return col;
    float z = D.y / (-a + .015);
    vec2 q = vec2(p.x * z * 1.1, z * 1.55) + vec2(idx * 17.3 + uDrift.x, idx * 7.1 - uDrift.y);
    float n = wolk(q * 1.1);
    float n2 = uQ < 2.5 ? wolk(q * 1.1 + vec2(.16, .06)) : n - .02;
    float far = exp(-z * .07);
    float cov = smoothstep(.3 - .2 * D.z, .5 - .15 * D.z, n);
    cov = mix(D.z * .95, cov, far);
    float lit = clamp(.5 + (n - n2) * 6., 0., 1.25);
    float kant = smoothstep(-1., 1., (p.x - uZon.x * .4) * .9);
    vec3 schaduw = mix(vec3(.012, .015, .025), mix(vec3(.2, .24, .38), vec3(.3, .3, .44), kant), D.w);
    vec3 zon = mix(vec3(.03, .035, .05), mix(vec3(.72, .74, .86), vec3(1., .86, .86), kant), D.w);
    vec3 cc = mix(schaduw, zon, lit * far + (1. - far) * .55) * (.7 + .45 * smoothstep(.35, .85, n));
    cc += uVlamK * uVlam.z * exp(-D.y * 5.) * exp(-abs(p.x - uVlam.x) * 2.2 / (1. + z * .5)) * .2;
    cc = mix(cc, uHorK * 1.1 + uGloedK * uHor.w * kant * .5, (1. - far) * D.w * .85);
    float mist = exp(-D.y * 16.);
    cc = mix(cc, mistK, mist);
    return mix(col, cc, max(cov, mist) * kk);
  }
  float gl = uVlam.z * exp(-length((p - uVlam.xy) * vec2(.9, .7)) * 2.6);
  return mix(col, mistK + uVlamK * gl * .55, D.z * kk);
}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  float asp = uRes.x / uRes.y;
  float R = uHor.y;
  vec2 ec = vec2(0., uHor.x - R);
  float a = length(p - ec) - R;
  float hh = max(a, 0.);
  // lucht
  vec3 col = mix(uHorK, uZenit, sqrt(smoothstep(0., .95, hh)));
  vec2 dz = p - uZon.xy;
  if (uHor.w > .002) col += uGloedK * uHor.w * exp(-length(dz * vec2(.5, 1.7)) * 2.) * exp(-hh * 2.2);
  // sterren: uit een vooraf getekende textuur (R: grote sterren, G: kleine)
  if (uSter > .01 && a > 0.) {
    vec2 st = texture(uSter2, p * .5).rg;
    float tw = .75 + .25 * sin(uTime * 2.2 + dot(floor(p * 30.), vec2(12.9898, 78.233)));
    col += vec3(.82, .88, 1.) * (st.r * 2.5 * tw * uSter);
    if (uQ < 1.5) col += vec3(.7, .8, 1.) * (st.g * .6 * uSter);
  }
  // de zon (vlak bij de rand van de aarde)
  if (uZon.z > .001 && dz.x * dz.x * .2 + dz.y * dz.y < .5) {
    float dsun = length(dz);
    float boven = smoothstep(-.01, .02, length(uZon.xy - ec) - R);
    float zicht = step(-.002, a) * mix(.25, 1., boven);
    col += vec3(1., .95, .88) * uZon.z * (.006 / (dsun * dsun + .0015)) * zicht;
    col += vec3(1., .98, .95) * uZon.w * boven * smoothstep(.02, .014, dsun) * 9. * step(0., a);
    col += vec3(.75, .85, 1.) * uZon.z * boven * exp(-abs(dz.y) * 190.) * exp(-abs(dz.x) * 2.2) * .7 * step(0., a);
  }
  // de maan
  if (uMaan.w > .001) {
    vec2 mq = (p - uMaan.xy) / uMaan.z;
    float md = length(mq);
    if (md < 1.02) {
      float nz = sqrt(max(1. - md * md, 0.));
      vec3 N = vec3(mq, nz);
      float lam = max(dot(N, normalize(vec3(.85, .28, .42))), 0.);
      float mar = textureLod(uRuis, mq * .33 + .25, 1.).g;
      float alb = .66 - .3 * smoothstep(.48, .68, mar);
      vec2 kc = mq * 6.;
      vec2 ki = floor(kc);
      vec2 kf = fract(kc) - .5 - (h22(ki) - .5) * .35;
      float kr = length(kf);
      float rad = .14 + .18 * h21(ki + 3.);
      float krater = step(.72, h21(ki + 9.)) * (smoothstep(rad * 1.15, rad * .85, kr) * smoothstep(rad * .55, rad * .9, kr) * .16 - smoothstep(rad * .8, rad * .4, kr) * .1);
      alb += krater * .3 * smoothstep(.95, .4, md);
      vec3 mc = vec3(.96, .94, .9) * alb * (lam * 1.35 + .012) + vec3(.03, .05, .1) * (1. - lam) * .3;
      float rand = smoothstep(1., 1. - 2.2 / (uMaan.z * uRes.y), md);
      col = mix(col, mc, rand * uMaan.w);
    }
    col += vec3(.5, .62, .85) * .06 * exp(-max(md - 1., 0.) * 6.) * step(1., md) * uMaan.w;
  }
  // onder de horizon: de grond (platform) of de aarde
  if (a < 0.) {
    float dd = -a;
    vec3 g = vec3(.006, .007, .011);
    if (uAarde.x > .001) {
      float z = uAarde.w / (dd + .012);
      vec2 q = vec2(p.x * z * 1.2, z * 1.7) + vec2(3.7, -uDrift.y * .4);
      float n = wolk(q * .5);
      float land = texture(uRuis, q * .02 + .3).b;
      vec3 sur = mix(vec3(.004, .014, .04), vec3(.016, .022, .024), smoothstep(.52, .6, land));
      float cl = smoothstep(.5, .78, n);
      float dag = smoothstep(-.35, .65, p.x / (asp * .5));
      vec3 dagK = mix(sur * 4. + vec3(.03, .07, .16), vec3(.8, .84, .92), cl);
      vec3 nachtK = sur + vec3(.012, .016, .03) * cl;
      vec3 e = mix(nachtK, dagK, dag);
      if (uAarde.y > .01 && dag < .98 && land > .5) {
        float sb = textureLod(uRuis, q * .29 + .6, 2.).b;
        float stad = sb * sb * sb * sb * sb * 3. * smoothstep(.52, .62, land) * (1. - dag) * (1. - cl * .85);
        e += vec3(1., .82, .55) * stad * uAarde.y * exp(-z * .05);
      }
      e = mix(e, uHorK * .75, exp(-dd * 16.) * .9);
      g = mix(g, e, uAarde.x);
    }
    col = g;
  }
  // wolkendekken
  col = dek(col, p, a, uDek0, 0., uDekK.x);
  col = dek(col, p, a, uDek1, 1., uDekK.y);
  // de dunne gloeiende rand van de dampkring
  if (uHor.z > .001 && abs(a) < .3) {
    float rim = exp(-a * a * 9000.) + .45 * exp(-max(a, 0.) * 22.) * step(0., a) + .25 * exp(-max(-a, 0.) * 60.) * step(a, 0.);
    float kant = .55 + .6 * exp(-abs(p.x - uZon.x) * 1.6);
    col += uHorK * rim * uHor.z * kant;
  }
  // het platform: grond, schijnwerpers, gloed van de vlam
  if (uPad.x > .001) {
    float vis = uPad.x;
    float zm = uPad.z;
    if (a < 0.) {
      float dd = -a;
      // natte plassen licht onder de schijnwerpers
      for (int i = 0; i < 2; i++) {
        vec4 L = i == 0 ? uLamp0 : uLamp1;
        float dx = p.x - L.x;
        col += vec3(.55, .65, .85) * L.w * exp(-dx * dx / (.0016 * zm * zm + .0004)) * exp(-dd * 9. / zm) * .5 * vis;
        col += vec3(.5, .6, .8) * L.w * exp(-length(vec2(dx * .6, dd * 3.) / zm) * 6.) * .1 * vis;
      }
      // het platform zelf wordt verlicht
      vec2 dm = (p - uPadM) / zm;
      col += vec3(.32, .38, .5) * exp(-length(dm * vec2(.8, 3.)) * 4.) * .2 * vis;
      col += uVlamK * uPad.w * exp(-length(dm * vec2(.55, 2.6)) * 3.) * 1.3;
    }
    // stadsgloed aan de horizon
    col += vec3(.05, .06, .085) * exp(-abs(a) * 14.) * vis;
    // lichtpuntjes in de verte
    float ax = p.x * 90.;
    float ai = floor(ax);
    float hl = h11(ai * 3.7);
    float lp = step(.72, hl) * smoothstep(.35, .0, abs(fract(ax) - .5)) * exp(-pow((a + .004 + .006 * h11(ai)) * 900. / zm, 2.));
    col += mix(vec3(1., .78, .5), vec3(.7, .85, 1.), step(.86, hl)) * lp * 1.2 * vis * (.6 + .4 * sin(uTime * 2. + ai));
    // lichtbundels van de schijnwerpers
    for (int i = 0; i < 2; i++) {
      vec4 L = i == 0 ? uLamp0 : uLamp1;
      float lenB = i == 0 ? uLampL.x : uLampL.y;
      vec2 dir = i == 0 ? uLampD.xy : uLampD.zw;
      vec2 lv = p - L.xy;
      float al = dot(lv, dir);
      if (abs(dot(lv, vec2(-dir.y, dir.x))) < .22 && al > -.04) {
      float stop = smoothstep(lenB + .03 * zm, lenB - .05 * zm, al);
      float sg = i == 0 ? .0699 : -.0699;
      vec2 dir2 = vec2(dir.x * .99756 - dir.y * sg, dir.y * .99756 + dir.x * sg);
      float b = (bundel(p, L.xy, dir, .02 * zm) + .5 * bundel(p, L.xy, dir2, .014 * zm)) * stop;
      if (b > .004) col += vec3(.55, .66, .9) * b * L.w * .5 * (.55 + .7 * textureLod(uRuis, vec2(p.x * 9. - uTime * .2, p.y * 6. + uTime * .09) * .125, 1.5).b) * vis;
      }
      float dl = length((p - L.xy) * vec2(1., 1.25));
      col += vec3(.8, .88, 1.) * L.w * (.0011 / (dl * dl + .00025)) * vis;
      if (abs(lv.y) < .03) col += vec3(.6, .75, 1.) * L.w * exp(-abs(lv.y) * 420.) * exp(-abs(lv.x) * 9.) * .5 * vis;
    }
  }
  col *= 1. - uVig * smoothstep(.28, .98, length((gl_FragCoord.xy / uRes - .5) * vec2(.65 * asp, 1.)));
  o = vec4(col, 1.);
}`;

  // Plaatjes: de raket (met belichting), het platform, tekst en de hoogtemeter.
  const FS_SPRITE = `${KOP}
in vec2 vUv; in vec2 vL; in vec2 vP; out vec4 o;
uniform sampler2D uTex, uNorm;
uniform int uModus;
uniform float uAlpha, uGloed, uTime, uAng;
uniform vec3 uTint, uKeyDir, uKeyK, uKey2Dir, uKey2K, uLuchtK, uBodemK, uVlamK, uFlitsK, uRaamK;
uniform vec4 uVlam, uFlits, uWijzer;
${GEMEEN}
void main(){
  if (uModus == 3) {
    // de wijzer van de hoogtemeter: gevulde rail tot de wijzer, een pijl en een gloeiend streepje
    vec2 uv = vUv;
    float railX = .25;
    float dx = (uv.x - railX) * 160.;
    float wy = uWijzer.x;
    float onder = 964. / 1024.;
    float vul = step(wy, uv.y) * step(uv.y, onder) * exp(-dx * dx / 5.);
    float dy = (uv.y - wy) * 1024.;
    float streep = exp(-dy * dy / 3.) * smoothstep(-6., 0., dx) * smoothstep(120., 60., dx);
    float pijl = smoothstep(1.5, 0., abs(dy) * 1.25 + (dx + 26.) * 1.1 - 12.) * step(dx, -8.) * step(-30., dx);
    float gloed = exp(-(dx * dx + dy * dy) / 260.);
    vec3 k = uTint;
    vec3 c = k * (vul * .9 + streep * 2.2 + pijl * 1.8 + gloed * .9) + vec3(1.) * streep * .6 * uWijzer.z;
    o = vec4(c * uAlpha, 0.);
    return;
  }
  vec4 t = texture(uTex, vUv);
  if (uModus == 0) {
    o = vec4(t.rgb * uTint * uGloed, t.a) * uAlpha;
    return;
  }
  float a = t.a;
  if (a < .002) { o = vec4(0.); return; }
  vec3 alb = t.rgb / a;
  if (uModus == 2) {
    // het platform: donker staal, verlicht door de vlam en de schijnwerpers; lampjes gloeien
    vec2 dv = (vP - uVlam.xy) * vec2(1., 1.2);
    float fall = uVlam.z / (1. + dot(dv, dv) / (uVlam.w * uVlam.w));
    float em = smoothstep(.82, .98, max(alb.r, max(alb.g, alb.b)));
    vec3 c = alb * (uLuchtK + uVlamK * fall * .9) + alb * em * uGloed;
    o = vec4(c * a, a) * uAlpha;
    return;
  }
  // de raket
  vec4 nm = texture(uNorm, vUv);
  vec3 nn = nm.rgb / max(nm.a, .003);
  float mat = nn.b;
  vec3 N = vec3(nn.r * 2. - 1., nn.g * 2. - 1., 0.);
  N.z = sqrt(max(1. - dot(N.xy, N.xy), 0.));
  float cs = cos(uAng), sn = sin(uAng);
  N.xy = vec2(cs * N.x - sn * N.y, sn * N.x + cs * N.y);
  float glas = smoothstep(.88, .95, mat);
  float metaal = smoothstep(.55, .72, mat) * (1. - glas);
  float glans = smoothstep(.2, .32, mat) * (1. - metaal) * (1. - glas);
  vec3 Rf = vec3(2. * N.z * N.x, 2. * N.z * N.y, 2. * N.z * N.z - 1.);
  vec3 amb = mix(uBodemK, uLuchtK, .5 + .5 * N.y);
  vec3 env = mix(uBodemK * .6, uLuchtK * 1.3, smoothstep(-.25, .3, Rf.y)) + (uLuchtK + uKeyK * .15) * .8 * exp(-abs(Rf.y - .05) * 7.);
  float fres = .05 + .95 * pow(1. - N.z, 4.);
  float dk = max(dot(N, uKeyDir), 0.);
  vec3 H = normalize(uKeyDir + vec3(0., 0., 1.));
  float nh = max(dot(N, H), 0.);
  float spec = pow(nh, mix(28., 110., metaal + glas)) * (glans * .55 + metaal * 1.3 + glas * 2.2);
  float rim = pow(clamp(1. - N.z, 0., 1.), 2.2);
  float dk2 = max(dot(N, uKey2Dir), 0.);
  float sp2 = pow(max(dot(N, normalize(uKey2Dir + vec3(0., 0., 1.))), 0.), mix(28., 110., metaal + glas)) * (glans * .55 + metaal * 1.3 + glas * 2.2);
  // de vlam: een puntlicht onder de raket
  vec3 Lf = vec3(uVlam.xy - vP, uVlam.w * .5);
  float df = length(Lf);
  Lf /= max(df, 1e-4);
  float fall = uVlam.z / (1. + df * df / (uVlam.w * uVlam.w));
  float dfl = max(dot(N, Lf), 0.);
  vec3 vl = uVlamK * fall * (dfl * .85 + rim * 1.5 * (.4 + .6 * dfl));
  // het licht uit de neus (na het hoogtepunt, in de kleur van het niveau)
  vec3 Lb = vec3(uFlits.xy - vP, uFlits.w * .4);
  float db = length(Lb);
  Lb /= max(db, 1e-4);
  float fb = uFlits.z / (1. + db * db / (uFlits.w * uFlits.w));
  float dbl = max(dot(N, Lb), 0.);
  vec3 bl = uFlitsK * fb * (dbl * .8 + rim * 1.8 * (.3 + .7 * dbl));
  vec3 diffK = mix(alb, alb * .22, metaal);
  vec3 col = diffK * (amb + uKeyK * dk + uKey2K * (dk2 * .8 + rim * .6 * dk2) + vl + bl);
  vec3 specK = mix(vec3(1.), alb * 1.2 + .1, metaal);
  col += specK * (uKeyK * spec + uKey2K * sp2 + (vl + bl) * pow(max(dfl, dbl), 6.) * .4 * (glans + metaal));
  col += env * fres * (glans * .5 + metaal * .9 + glas * .8) * mix(vec3(1.), alb + .25, metaal);
  col += glas * uRaamK * (.55 + .45 * N.z);
  o = vec4(col * a, a) * uAlpha;
}`;

  // De vlam, het rookspoor en de dampkegel bij de geluidsbarrière.
  const FS_VLAM = `${KOP}
in vec2 vUv; in vec2 vL; in vec2 vP; out vec4 o;
uniform vec2 uHalf;
uniform float uTime, uR0, uKracht, uLucht, uScroll, uAlpha, uSoort, uQ, uKap;
uniform vec3 uKern, uMid, uRand, uVlamK, uRookK;
uniform vec4 uVlam;
${GEMEEN}
void main(){
  float s = (1. - vL.y) * .5;
  float L = uHalf.y * 2.;
  float d = s * L;
  float x = vL.x * uHalf.x;
  float r0 = max(uR0, 1e-4);
  float dn = d / r0;
  float xn = x / r0;
  if (uSoort < .5) {
    float t = uTime;
    float n1 = vn(vec2(xn * 1.2, dn * .32 - t * 14.));
    float n2 = uQ < 2.5 ? vn(vec2(xn * 2.9 + 3., dn * .85 - t * 23.)) : .5;
    float turb = n1 * .62 + n2 * .38;
    float lucht = uLucht;
    float Ro = 1.05 + dn * mix(.5, .13, lucht);
    float edge = abs(xn) + (turb - .5) * Ro * .95 * smoothstep(0., 4., dn);
    float lenF = mix(8., 17., lucht) * (.35 + .65 * uKracht);
    float along = exp(-dn / lenF) * smoothstep(-.3, .5, dn);
    float body = smoothstep(Ro, Ro * .08, edge) * along;
    float Rc = .88 * max(1. - dn / 6.5, 0.);
    float core = smoothstep(Rc + .16, Rc * .15, abs(xn)) * smoothstep(6.5, 0., dn);
    float md = pow(.5 + .5 * cos(dn * 3.1 - .5), 14.) * exp(-dn / 9.) * smoothstep(.55, 0., abs(xn)) * smoothstep(.0, 1.2, dn) * lucht;
    vec3 col = uRand * body * 1.1 + uMid * pow(body, 1.4) * 2.3 + uKern * (core * 2.2 + md * 1.6);
    col += uMid * .22 * exp(-abs(xn) / (1.5 + dn * .2)) * along;
    col += uKern * 1.2 * exp(-dn * 4.) * smoothstep(1.2, .4, abs(xn));
    float Rv = 1. + dn * .7;
    col += vec3(.5, .62, 1.) * (1. - lucht) * .35 * smoothstep(Rv, 0., abs(xn) + (turb - .5) * Rv * .35) * exp(-dn / 16.);
    col *= smoothstep(1., .8, abs(vL.x)) * smoothstep(1., .75, s);
    col *= smoothstep(uKap - .004, uKap + .03, vP.y);
    o = vec4(col * uKracht * uAlpha, 1.);
  } else if (uSoort < 1.5) {
    // rookspoor: wit-grijs, verankerd in de wereld, onderaan verlicht door de vlam
    float W = r0 * (1.4 + dn * .16);
    float wy = vP.y + uScroll;
    float n = vn(vec2(x / W * 1.3 + 4., wy * 7.)) * .6 + vn(vec2(x / W * 3.1, wy * 17. + 3.)) * .4;
    float e = abs(x) / W + (n - .5) * .55;
    float dens = smoothstep(1., .25, e) * smoothstep(1.5, 4.5, dn) * smoothstep(1., .55, s);
    dens *= .55 + .45 * n;
    vec2 dv = vP - uVlam.xy;
    float fall = uVlam.z / (1. + dot(dv, dv) / (uVlam.w * uVlam.w));
    vec3 c = uRookK * (.65 + .5 * n) + uVlamK * fall * .55;
    float A = dens * uAlpha;
    o = vec4(c * A, A);
  } else {
    // dampkegel (Prandtl-Glauert): een witte rok rond de raket
    float yy = (vL.y + 1.) * .5;
    float hb = mix(1., .28, yy);
    float ex = abs(vL.x) / hb;
    float n = vn(vec2(vL.x * 9., vL.y * 3. + uTime * 4.));
    float sch = smoothstep(1., .55, ex + (n - .5) * .35) * smoothstep(.0, .25, yy) * smoothstep(1., .7, yy);
    sch *= .45 + .55 * smoothstep(.2, .95, ex);
    float A = sch * uAlpha * .85;
    o = vec4(uRookK * (.8 + .4 * n) * A, A);
  }
}`;

  // Rook en stoom: deeltjes als zachte wolkjes (een plaatje), elk een pure functie van de tijd.
  const VS_ROOK = `${KOP}
uniform vec2 uRes, uShake; uniform float uZoom;
uniform float uTijd, uT0, uDuur, uLife, uSeed, uAlpha;
uniform int uSoort;
uniform vec2 uOrg, uSpd, uSize, uWind;
uniform vec4 uCam, uVlam;
uniform vec3 uVlamK, uAmb, uKleur;
out vec2 vQ; out vec4 vC; out vec3 vF; flat out float vV;
${GEMEEN}
uint pcg(uint v){ uint s = v * 747796405u + 2891336653u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float R(uint id, uint k){ return float(pcg(id * 1664525u + k * 1013904223u + uint(uSeed * 1000.))) * (1. / 4294967295.); }
void main(){
  uint id = uint(gl_InstanceID);
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2. - 1.;
  float r0 = R(id, 1u), r1 = R(id, 2u), r2 = R(id, 3u), r3 = R(id, 4u), r4 = R(id, 5u), r5 = R(id, 6u);
  vQ = c; vC = vec4(0.); vF = vec3(0.); vV = floor(r5 * 3.999);
  gl_Position = vec4(2., 2., 2., 1.);
  float life = uLife * (.65 + .35 * r1);
  float age = 0.;
  if (uSoort == 1) {
    float ph = uTijd - uT0 - r0 * life;
    if (ph < 0.) return;
    age = mod(ph, life);
  } else {
    age = uTijd - (uT0 + r0 * uDuur);
  }
  if (age < 0. || age > life) return;
  float u = age / life;
  vec2 pos = uOrg;
  float sz = 0.;
  float al = 0.;
  if (uSoort == 0) {
    // de grote wolken die bij de start over de grond rollen
    float side = r2 < .5 ? -1. : 1.;
    float v0 = mix(uSpd.x, uSpd.y, r3 * r3);
    float k = 1.1;
    float e = (1. - exp(-k * age)) / k;
    float op = r4 * r4;
    pos = uOrg + vec2(side * (v0 * e * (1. - .7 * op) + op * (.05 + .06 * r1)), .012 + op * .04 + age * (.012 + .07 * op) * (.5 + u));
    sz = mix(uSize.x, uSize.y, r4) * (.35 + 1.6 * (1. - exp(-age * .8)));
    al = smoothstep(0., .05, u) * (1. - u) * (1. - u * .6);
  } else if (uSoort == 1) {
    // stoom die uit de raket ontsnapt: valt zacht naar beneden en waait opzij
    float side = r2 < .5 ? -1. : 1.;
    float hgt = floor(r3 * 3.) / 3.;
    pos = uOrg + vec2(side * (uSize.x * 2. + age * (.035 + .03 * r4)), hgt * uSpd.y - age * age * .02 + age * .004);
    sz = uSize.x * (1. + age * 2.2) * (.7 + .6 * r4);
    al = smoothstep(0., .15, u) * (1. - u) * (1. - u);
  } else {
    // een losse wolk (afschieten van de trap, haperende motor)
    float ang = r2 * 6.2831853;
    float v0 = mix(uSpd.x, uSpd.y, r3);
    float k = 2.4;
    float e = (1. - exp(-k * age)) / k;
    pos = uOrg + vec2(cos(ang), sin(ang) * .8) * v0 * e + uWind * age;
    sz = mix(uSize.x, uSize.y, r4) * (.5 + 1.2 * (1. - exp(-age * 1.4)));
    al = smoothstep(0., .04, u) * (1. - u) * (1. - u);
  }
  vec2 sp = (pos - uCam.xy) * uCam.z + vec2(0., uCam.w);
  float szs = sz * uCam.z;
  vec2 dv = sp - uVlam.xy;
  float fall = uVlam.z / (1. + dot(dv, dv) / (uVlam.w * uVlam.w));
  vF = uKleur * uVlamK * fall * (.75 + .5 * r5);
  vec3 kl = uKleur * uAmb;
  float rot = r5 * 6.2831853 + age * (r1 - .5) * .8;
  vec2 q = sp + rot2(rot) * c * szs;
  vec2 s2 = q * uZoom + uShake;
  gl_Position = vec4(s2.x * 2. * uRes.y / uRes.x, s2.y * 2., 0., 1.);
  vC = vec4(kl, al * uAlpha);
}`;

  const FS_ROOK = `${KOP}
in vec2 vQ; in vec4 vC; in vec3 vF; flat in float vV; out vec4 o;
uniform sampler2D uPuf;
void main(){
  vec2 uv = (vQ * .5 + .5) * .5 + vec2(mod(vV, 2.), floor(vV * .5)) * .5;
  vec4 t = texture(uPuf, uv);
  float a = t.a * vC.a;
  vec2 sh = t.rg / max(t.a, .004);
  o = vec4((vC.rgb * (.25 + .75 * sh.x) + vF * (.15 + .85 * sh.y)) * a, a);
}`;

  // Wolken vlak voor de camera (als je erdoor schiet) en snelheidsstrepen.
  const FS_NEVEL = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake;
uniform float uZoom, uTime, uQ, uMist, uScroll, uSnel, uDag, uWit;
uniform sampler2D uRuis;
uniform vec3 uMistK, uVlamK;
uniform vec4 uVlam, uRing;
uniform vec2 uRaket;
${GEMEEN}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  vec3 c = vec3(0.);
  float A = 0.;
  if (uMist > .002) {
    vec2 q = vec2(p.x * 1.5, p.y * .8 + uScroll * .5);
    float n = texture(uRuis, q * .2).r;
    float n2 = uQ < 2.5 ? texture(uRuis, vec2(p.x * 7., p.y * .9 + uScroll * 1.25) * .125).g : .5;
    float n3 = texture(uRuis, vec2(p.x * 2.2 + 9., p.y * .5 + uScroll * 1.6) * .125).b;
    float dens = clamp(uMist * (.5 + 1.1 * (n - .5) + .7 * (n2 - .5) + .5 * (n3 - .5)), 0., 1.);
    dens = dens * dens * (3. - 2. * dens);
    vec3 k = uMistK * (.7 + .6 * n);
    vec2 dv = (p - uVlam.xy) * vec2(1., .55);
    k += uVlamK * uVlam.z * exp(-length(dv) * 6.) * (.3 + .5 * n);
    c = k * dens;
    A = dens;
  }
  if (uSnel > .002) {
    float cols = 38.;
    float xs = (p.x + 7.3) * cols;
    float ci = floor(xs);
    float h = h11(ci * 1.37);
    float fx = (fract(xs) - .5) / cols * uRes.y;
    float lijn = smoothstep(1.2, .15, abs(fx - (h - .5) * 6.));
    float sp = .8 + 1.4 * h;
    float yy = (p.y + uScroll * sp) * (.7 + .6 * h11(ci * 7.1)) + h * 9.;
    float seg = fract(yy);
    float st = smoothstep(0., .04, seg) * smoothstep(.24, .04, seg) * step(.62, h11(ci * 3.3 + floor(yy) * 1.7));
    float rand = smoothstep(.12, .5, abs(p.x - uRaket.x)) * (.4 + .6 * smoothstep(.2, .5, abs(p.y)));
    c += mix(vec3(.6, .7, .9), vec3(1.), uDag) * lijn * st * uSnel * rand * .3;
  }
  // een witte schokgolf (geluidsbarrière) en een witte flits: neutraal, zonder de kleur van het niveau
  if (uRing.w > .002) {
    float r = length((p - uRing.xy) * vec2(1., 1.15));
    float x = (r - uRing.z) / (.012 + uRing.z * .08);
    c += vec3(.85, .9, 1.) * exp(-x * x) * uRing.w;
  }
  c += vec3(.92, .95, 1.) * uWit;
  o = vec4(c, A);
}`;

  // ───────────────────────── Vlucht en tijdlijn ─────────────────────────
  // De klim (voor elk cijfer gelijk tot de motor uitvalt): eerst langzaam, dan steeds sneller, daarna gelijkmatig.
  // De snelheid per seconde (in hoogte-eenheden f): langzaam van de toren, versnellen, een dip bij max-q
  // (de motor knijpt even), weer versnellen, de tweede trap trekt harder en daarna gelijkmatig. Eén keer in een tabel.
  const UB = 2.6;
  const FB = 0.25;
  const PEXP = 3.25;
  const VCR = (FB * PEXP) / UB;
  const U_MAXQ = 2.1;
  const U_TWEE = 3.7;
  const VT_DU = 0.01;
  const VT_N = 1801;
  const vBasis = (u) => (u <= 0 ? 0 : u <= UB ? (PEXP * FB * Math.pow(u / UB, PEXP - 1)) / UB : VCR);
  const vProfiel = (u) => {
    const dq = (u - U_MAXQ) / 0.42;
    const w = Math.min(1, Math.max(0, (u - U_TWEE) / 0.9));
    return vBasis(u) * (1 - 0.42 * Math.exp(-dq * dq)) * (1 + 0.28 * w * w * (3 - 2 * w));
  };
  const VT = new Float32Array(VT_N);
  const FT = new Float32Array(VT_N);
  for (let i = 0; i < VT_N; i++) {
    VT[i] = vProfiel(i * VT_DU);
    FT[i] = i === 0 ? 0 : FT[i - 1] + ((VT[i - 1] + VT[i]) / 2) * VT_DU;
  }
  const tabel = (T, u) => {
    const x = Math.min(VT_N - 1.001, Math.max(0, u / VT_DU));
    const i = Math.floor(x);
    return T[i] + (T[i + 1] - T[i]) * (x - i);
  };
  const fVlucht = (u) => (u <= 0 ? 0 : tabel(FT, u));
  const vVlucht = (u) => (u <= 0 ? 0 : tabel(VT, u));
  const uVoorF = (f) => {
    if (f <= 0) return 0;
    let lo = 0;
    let hi = (VT_N - 1) * VT_DU;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (fVlucht(m) < f) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const F_KNAL = 0.07; // geluidsbarrière
  const F_TRAP = 0.21; // de eerste trap valt af
  const DEK_A = [0.045, 0.06];
  const DEK_B = [0.1, 0.15];

  const mix2 = (a, b, x) => a + (b - a) * x;
  function plan(d) {
    const snel = !!d.snel;
    const fA = Math.max(0.04, Math.min(1, (d.g - 1) / 9));
    // tempo van de klim: een lage vlucht gaat rustiger, zodat hij ook lang genoeg duurt
    const k = mix2(2.7, 1.45, fA) * (snel ? 0.6 : 1);
    const tellen = snel ? [1.7, 2.6] : [3.0, 4.5, 6.0];
    const TI = snel ? 3.5 : 7.0; // ontsteking (en "LANCERING")
    const TL = TI + (snel ? 0.3 : 0.55); // de klemmen laten los
    const Tco = snel ? 0.8 : 1.5; // uitrollen na het uitvallen van de motor
    const Th = snel ? 0.7 : 1.5; // stil hangen op het hoogste punt
    const coastU = Tco / k;
    let lo = 0;
    let hi = 9;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (fVlucht(m) + (vVlucht(m) * coastU) / 2 < fA) lo = m;
      else hi = m;
    }
    const uc = (lo + hi) / 2;
    const tc = TL + uc * k;
    const tA = tc + Tco;
    const E = tA + Th;
    const K0 = E + (snel ? 1.1 : 1.6);
    const uKnal = uVoorF(F_KNAL);
    const uSep = uVoorF(F_TRAP);
    const tijdVoorF = (f) => (uc > uVoorF(f) ? TL + uVoorF(f) * k : null);
    return {
      snel, k, fA, tellen, TI, TL, Tco, Th, uc, tc, tA, E, K0,
      knal: uc > uKnal + 0.05 ? TL + uKnal * k : null,
      sep: uc >= uSep + 0.4 ? TL + uSep * k : null,
      sputter: Math.min(0.32 * k, uc * k * 0.4),
      fc: fVlucht(uc),
      vc: vVlucht(uc) / k,
      tDekB: tijdVoorF(DEK_B[0]),
      tDekA: tijdVoorF(DEK_A[0]),
    };
  }

  // ───────────────────────── Tekenwerk (canvas) ─────────────────────────
  // De raket: 512×1280. Links (0…320) de raket zelf, rechts de motor van de tweede trap.
  const RW = 512;
  const RHP = 1280;
  const CX = 160;
  const Y_TOP = 22;
  const Y_NAAD = 133; // hier springt de neus eraf
  const Y_RAAM = 214;
  const Y_TRAP = 636; // onderkant van de tweede trap
  const Y_TUS = 700; // onderkant van de tussenring
  const Y_BOOST = 1150;
  const Y_STAART = 1176;
  const Y_BODEM = 1258; // uitlaat van de straalpijp
  const MOT2 = { cx: 420, y0: 40, y1: 150 }; // de motor van de tweede trap (rechts in het plaatje)

  function straal(y) {
    if (y < Y_TOP) return 0;
    if (y < 300) {
      const s = (y - Y_TOP) / (300 - Y_TOP);
      return 66 * Math.pow(Math.max(0, 1 - (1 - s) * (1 - s)), 0.6);
    }
    if (y < Y_TRAP) return 66;
    if (y < Y_TUS) {
      const s = (y - Y_TRAP) / (Y_TUS - Y_TRAP);
      return 66 + 14 * s * s * (3 - 2 * s);
    }
    if (y < Y_BOOST) return 80;
    if (y < Y_STAART) return 80 - 10 * ((y - Y_BOOST) / (Y_STAART - Y_BOOST));
    return 0;
  }
  const straalPijp = (y) => 36 + 28 * Math.pow(Math.max(0, Math.min(1, (y - Y_STAART) / (Y_BODEM - Y_STAART))), 1.6);
  const straalMot2 = (y) => 20 + 22 * Math.pow(Math.max(0, Math.min(1, (y - MOT2.y0) / (MOT2.y1 - MOT2.y0))), 1.5);

  function maakRaket(d, A) {
    const K = A.nieuw(RW, RHP);
    const M = A.nieuw(RW, RHP);
    const k = K.getContext('2d');
    const m = M.getContext('2d');
    const mid = (n) => `rgb(${n},0,0)`;
    const WIT = '#eef1f5';
    const NAVY = '#16233f';
    const ROOD = '#cf3a2c';

    // vinnen (achter de romp)
    for (const s of [-1, 1]) {
      const pad = (c) => {
        c.beginPath();
        c.moveTo(CX + s * 66, 930);
        c.lineTo(CX + s * 148, 1092);
        c.lineTo(CX + s * 153, 1190);
        c.lineTo(CX + s * 70, 1166);
        c.closePath();
      };
      pad(k);
      k.fillStyle = ROOD;
      k.fill();
      k.save();
      k.clip();
      k.fillStyle = NAVY;
      k.beginPath();
      k.moveTo(CX + s * 66, 930);
      k.lineTo(CX + s * 148, 1092);
      k.lineTo(CX + s * 148, 1112);
      k.lineTo(CX + s * 66, 952);
      k.closePath();
      k.fill();
      k.fillStyle = 'rgba(255,255,255,0.85)';
      k.fillRect(CX + s * 153 - (s > 0 ? 8 : 0), 1100, 8, 92);
      k.restore();
      pad(m);
      m.fillStyle = mid(s < 0 ? 50 : 60);
      m.fill();
    }

    // de romp, rij voor rij (met zachte randen)
    for (let y = Y_TOP; y < Y_STAART; y++) {
      const r = straal(y + 0.5);
      if (r <= 0.01) continue;
      let kl = WIT;
      let ma = 10;
      if (y < 62) kl = ROOD;
      else if (y >= Y_TRAP && y < Y_TUS) {
        kl = NAVY;
        ma = 10;
      } else if (y >= Y_BOOST) {
        kl = '#4a4f58';
        ma = 30;
      }
      k.fillStyle = kl;
      k.fillRect(CX - r, y, 2 * r, 1);
      m.fillStyle = mid(ma);
      m.fillRect(CX - r, y, 2 * r, 1);
    }
    // de straalpijp
    for (let y = Y_STAART; y < Y_BODEM; y++) {
      const r = straalPijp(y + 0.5);
      const g = k.createLinearGradient(0, Y_STAART, 0, Y_BODEM);
      g.addColorStop(0, '#3c4048');
      g.addColorStop(1, '#5d5a58');
      k.fillStyle = g;
      k.fillRect(CX - r, y, 2 * r, 1);
      m.fillStyle = mid(70);
      m.fillRect(CX - r, y, 2 * r, 1);
    }
    // de motor van de tweede trap (los, rechts)
    for (let y = MOT2.y0; y < MOT2.y1; y++) {
      const r = straalMot2(y + 0.5);
      k.fillStyle = y < MOT2.y0 + 14 ? '#2c3038' : '#6b6e74';
      k.fillRect(MOT2.cx - r, y, 2 * r, 1);
      m.fillStyle = mid(80);
      m.fillRect(MOT2.cx - r, y, 2 * r, 1);
    }

    // stickers op een cilinder: eerst plat tekenen, dan om de romp ‘wikkelen’
    const wikkel = (U, y0, r) => {
      const Wu = U.width;
      for (let xd = Math.floor(CX - r); xd < Math.ceil(CX + r); xd++) {
        const sn = (xd + 0.5 - CX) / r;
        if (sn <= -1 || sn >= 1) continue;
        const sx = Wu / 2 + r * Math.asin(sn);
        k.drawImage(U, Math.max(0, Math.min(Wu - 1, sx - 0.5)), 0, 1, U.height, xd, y0, 1, U.height);
      }
    };
    const vak = d.vak.toUpperCase();

    // tweede trap: missie-embleem en het onderwerp als ‘serienummer’
    {
      const r = 66;
      const Wu = Math.ceil(Math.PI * r);
      const Hu = Y_TRAP - 300;
      const U = A.nieuw(Wu, Hu);
      const u = U.getContext('2d');
      const mx = Wu / 2;
      u.fillStyle = ROOD;
      u.fillRect(0, 10, Wu, 5);
      u.fillStyle = NAVY;
      u.fillRect(0, 17, Wu, 2);
      // embleem
      const ey = 92;
      const R = 44;
      u.fillStyle = '#ffffff';
      u.beginPath();
      u.arc(mx, ey, R + 3, 0, Math.PI * 2);
      u.fill();
      u.fillStyle = ROOD;
      u.beginPath();
      u.arc(mx, ey, R, 0, Math.PI * 2);
      u.fill();
      u.fillStyle = NAVY;
      u.beginPath();
      u.arc(mx, ey, R - 6, 0, Math.PI * 2);
      u.fill();
      // een baan om het embleem
      u.strokeStyle = 'rgba(255,255,255,0.75)';
      u.lineWidth = 2.2;
      u.beginPath();
      u.ellipse(mx, ey + 4, R - 12, (R - 12) * 0.36, -0.35, 0, Math.PI * 2);
      u.stroke();
      // sterretjes
      u.fillStyle = '#ffffff';
      for (const [sx, sy, rr] of [[-20, -22, 2.2], [18, -26, 1.6], [25, 14, 1.8], [-27, 10, 1.4], [6, -31, 1.2]]) {
        u.beginPath();
        u.arc(mx + sx, ey + sy, rr, 0, Math.PI * 2);
        u.fill();
      }
      u.textAlign = 'center';
      u.textBaseline = 'middle';
      u.font = `900 34px ${A.F_DISPLAY}`;
      let fs = 34;
      while (fs > 18 && u.measureText(d.afkorting).width > (R - 10) * 1.75) {
        fs -= 1;
        u.font = `900 ${fs}px ${A.F_DISPLAY}`;
      }
      u.fillStyle = '#ffffff';
      u.fillText(d.afkorting, mx, ey + 2);
      // het onderwerp, klein en verticaal
      u.save();
      u.translate(mx, 160);
      u.rotate(Math.PI / 2);
      u.textAlign = 'left';
      u.font = `800 21px ${A.F_SPORT}`;
      if ('letterSpacing' in u) u.letterSpacing = '3px';
      let o = (d.onder || '').toUpperCase();
      while (o.length > 3 && u.measureText(o).width > Hu - 175) o = o.slice(0, -1);
      if (o !== (d.onder || '').toUpperCase()) o = o.replace(/\s+$/, '') + '…';
      u.fillStyle = 'rgba(22,35,63,0.82)';
      u.fillText(o, 0, 1);
      u.restore();
      // naden
      u.fillStyle = 'rgba(30,40,60,0.18)';
      for (const ph of [-1.05, -0.52, 0.52, 1.05]) u.fillRect(mx + r * ph - 0.6, 0, 1.2, Hu);
      u.fillRect(0, 140, Wu, 1.2);
      u.fillRect(0, Hu - 3, Wu, 2);
      wikkel(U, 300, r);
    }

    // de eerste trap: rolpatroon, het vak in grote letters, banden
    {
      const r = 80;
      const Wu = Math.ceil(Math.PI * r);
      const Hu = Y_BOOST - Y_TUS;
      const U = A.nieuw(Wu, Hu);
      const u = U.getContext('2d');
      const mx = Wu / 2;
      const q = (Math.PI / 4) * r;
      // rolpatroon (zwart-wit per kwart, twee rijen)
      u.fillStyle = '#15171c';
      u.fillRect(mx - q, 14, 2 * q, 46);
      u.fillRect(0, 60, mx - q, 46);
      u.fillRect(mx + q, 60, Wu - mx - q, 46);
      u.fillStyle = ROOD;
      u.fillRect(0, 8, Wu, 4);
      // het vak, verticaal van boven naar beneden
      u.save();
      u.translate(mx, 130);
      u.rotate(Math.PI / 2);
      u.textAlign = 'left';
      u.textBaseline = 'middle';
      const maxL = Hu - 175;
      let fs = 92;
      u.font = `800 ${fs}px ${A.F_SPORT}`;
      if ('letterSpacing' in u) u.letterSpacing = '4px';
      while (fs > 34 && u.measureText(vak).width > maxL) {
        fs -= 2;
        u.font = `800 ${fs}px ${A.F_SPORT}`;
      }
      let tv = vak;
      while (tv.length > 3 && u.measureText(tv).width > maxL) tv = tv.slice(0, -1);
      if (tv !== vak) tv = tv.replace(/\s+$/, '') + '…';
      u.fillStyle = NAVY;
      u.fillText(tv, 0, 3);
      u.restore();
      // banden onderaan
      u.fillStyle = NAVY;
      u.fillRect(0, Hu - 36, Wu, 20);
      u.fillStyle = ROOD;
      u.fillRect(0, Hu - 12, Wu, 4);
      // naden en klinknagels
      u.fillStyle = 'rgba(30,40,60,0.16)';
      for (const ph of [-1.05, -0.52, 0.52, 1.05]) u.fillRect(mx + r * ph - 0.6, 0, 1.2, Hu);
      for (const yy of [112, 250, 380]) u.fillRect(0, yy, Wu, 1.3);
      u.fillStyle = 'rgba(30,40,60,0.22)';
      for (const yy of [114, 252, 382]) for (let xx = 4; xx < Wu; xx += 9) u.fillRect(xx, yy + 3, 1.6, 1.6);
      // een beetje roet onderaan
      const sg = u.createLinearGradient(0, Hu - 120, 0, Hu);
      sg.addColorStop(0, 'rgba(40,36,34,0)');
      sg.addColorStop(1, 'rgba(40,36,34,0.32)');
      u.fillStyle = sg;
      u.fillRect(0, Hu - 120, Wu, 120);
      wikkel(U, Y_TUS, r);
    }

    // tussenring: rode streep en roosters
    k.fillStyle = ROOD;
    for (let y = 650; y < 655; y++) {
      const r = straal(y + 0.5);
      k.fillRect(CX - r, y, 2 * r, 1);
    }
    k.fillStyle = 'rgba(0,0,0,0.45)';
    for (const ph of [-0.6, 0, 0.6]) {
      const r = straal(676);
      const x = CX + r * Math.sin(ph);
      const w = 12 * Math.cos(ph);
      for (let i = 0; i < 4; i++) k.fillRect(x - w / 2, 664 + i * 7, w, 3);
    }

    // de capsule: naad, raampje, stuurmotortjes
    k.fillStyle = '#9aa3ad';
    m.fillStyle = mid(30);
    for (let y = Y_NAAD - 4; y < Y_NAAD + 5; y++) {
      const r = straal(y + 0.5);
      k.fillRect(CX - r, y, 2 * r, 1);
      m.fillRect(CX - r, y, 2 * r, 1);
    }
    k.fillStyle = 'rgba(10,14,22,0.85)';
    k.fillRect(CX - straal(Y_NAAD), Y_NAAD - 0.6, 2 * straal(Y_NAAD), 1.2);
    k.fillStyle = 'rgba(30,40,60,0.2)';
    for (const yy of [176, 262]) {
      const r = straal(yy);
      k.fillRect(CX - r, yy, 2 * r, 1.2);
    }
    for (const s of [-1, 1]) {
      const r = straal(250);
      k.fillStyle = '#2a2f38';
      k.fillRect(CX + s * r * 0.78 - 5, 244, 10, 12);
      k.fillStyle = '#5c6470';
      k.fillRect(CX + s * r * 0.78 - 3, 247, 6, 2);
    }
    // raampje
    k.fillStyle = '#c9d0d8';
    k.beginPath();
    k.arc(CX, Y_RAAM, 19, 0, Math.PI * 2);
    k.fill();
    k.fillStyle = '#0d1a2c';
    k.beginPath();
    k.arc(CX, Y_RAAM, 14.5, 0, Math.PI * 2);
    k.fill();
    m.fillStyle = mid(30);
    m.beginPath();
    m.arc(CX, Y_RAAM, 19, 0, Math.PI * 2);
    m.fill();
    m.fillStyle = mid(40);
    m.beginPath();
    m.arc(CX, Y_RAAM, 14.5, 0, Math.PI * 2);
    m.fill();
    // ring met boutjes
    k.fillStyle = '#7d8590';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.beginPath();
      k.arc(CX + Math.cos(a) * 16.8, Y_RAAM + Math.sin(a) * 16.8, 1.1, 0, Math.PI * 2);
      k.fill();
    }
    return { K, M };
  }

  // De normalen (uit het profiel) en het materiaal per pixel: r = normaal x, g = normaal y, b = materiaal.
  function maakNormaal(A, K, M) {
    const W = RW;
    const H = RHP;
    const kd = K.getContext('2d').getImageData(0, 0, W, H).data;
    const md = M.getContext('2d').getImageData(0, 0, W, H).data;
    const N = A.nieuw(W, H);
    const n = N.getContext('2d');
    const img = n.createImageData(W, H);
    const nd = img.data;
    const helling = new Float32Array(H);
    for (let y = 0; y < H; y++) helling[y] = (straal(y + 1.5) - straal(y - 0.5)) / 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = kd[i + 3];
        if (!a) continue;
        const id = Math.round(md[i] / 10) * 10;
        let nx = 0;
        let ny = 0;
        let mat = 0.3;
        if (x >= 330) {
          const r = straalMot2(y + 0.5);
          const rp = (straalMot2(y + 1.5) - straalMot2(y - 0.5)) / 2;
          const L = Math.sqrt(1 + rp * rp);
          nx = Math.max(-1, Math.min(1, (x + 0.5 - MOT2.cx) / r)) / L;
          ny = rp / L;
          mat = 0.7;
        } else if (id === 50 || id === 60) {
          nx = id === 50 ? -0.4 : 0.4;
          ny = 0.06 + 0.12 * ((y - 930) / 260);
          mat = 0.3;
        } else if (y >= Y_STAART) {
          const r = straalPijp(y + 0.5);
          const rp = (straalPijp(y + 1.5) - straalPijp(y - 0.5)) / 2;
          const L = Math.sqrt(1 + rp * rp);
          nx = Math.max(-1, Math.min(1, (x + 0.5 - CX) / r)) / L;
          ny = rp / L;
          mat = 0.72;
        } else {
          const r = straal(y + 0.5);
          if (r > 0.01) {
            const rp = helling[y];
            const L = Math.sqrt(1 + rp * rp);
            nx = Math.max(-1, Math.min(1, (x + 0.5 - CX) / r)) / L;
            ny = rp / L;
          }
          mat = id === 30 ? 0.7 : id === 40 ? 1 : id === 20 ? 0.1 : 0.3;
        }
        nd[i] = Math.round((nx * 0.5 + 0.5) * 255);
        nd[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        nd[i + 2] = Math.round(mat * 255);
        nd[i + 3] = a;
      }
    }
    n.putImageData(img, 0, 0);
    return N;
  }

  // Het platform: 1024×1024 voor de wereld x −0,5…0,5, y 0…1 (de grond onderaan). Plus de toegangsarm rechtsboven.
  const PAD_ARM = { x0: 760, y0: 40, x1: 1010, y1: 90 };
  function maakPad(A) {
    const S = 1024;
    const cv = A.nieuw(S, S);
    const g = cv.getContext('2d');
    const X = (wx) => (wx + 0.5) * S;
    const Y = (wy) => (1 - wy) * S;
    const staal = '#121722';
    const rand = '#3a4660';
    g.lineCap = 'square';
    // verre gebouwen aan de horizon
    g.fillStyle = '#0b0f17';
    g.fillRect(X(0.3), Y(0.055), 0.07 * S, 0.055 * S);
    g.fillRect(X(-0.47), Y(0.03), 0.05 * S, 0.03 * S);
    g.fillRect(X(0.41), Y(0.022), 0.04 * S, 0.022 * S);
    g.fillStyle = '#ffffff';
    for (const [x, y] of [[0.31, 0.05], [0.36, 0.05], [0.33, 0.03], [-0.45, 0.025], [0.42, 0.018]]) g.fillRect(X(x), Y(y), 2, 2);
    // bliksemmast rechts met draden
    g.strokeStyle = '#0f141e';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(X(0.25), Y(0));
    g.lineTo(X(0.25), Y(0.9));
    g.stroke();
    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(40,52,74,0.8)';
    g.beginPath();
    g.moveTo(X(0.25), Y(0.9));
    g.quadraticCurveTo(X(0.36), Y(0.5), X(0.49), Y(0.02));
    g.moveTo(X(0.25), Y(0.9));
    g.quadraticCurveTo(X(0.14), Y(0.55), X(0.07), Y(0.04));
    g.stroke();
    g.fillStyle = '#ff2a2a';
    g.beginPath();
    g.arc(X(0.25), Y(0.9) - 4, 3.2, 0, Math.PI * 2);
    g.fill();
    // schijnwerpermasten
    for (const [x, h] of [[-0.44, 0.3], [0.4, 0.28]]) {
      g.fillStyle = staal;
      g.fillRect(X(x) - 3, Y(h), 6, h * S);
      g.fillStyle = '#1a2130';
      g.fillRect(X(x) - 16, Y(h) - 14, 32, 16);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) g.fillRect(X(x) - 13 + i * 7, Y(h) - 11, 5, 10);
    }
    // de toren (vakwerk)
    const tx0 = X(-0.275);
    const tx1 = X(-0.165);
    const ty0 = Y(0);
    const ty1 = Y(0.84);
    g.fillStyle = 'rgba(14,18,27,0.55)';
    g.fillRect(tx0, ty1, tx1 - tx0, ty0 - ty1);
    g.strokeStyle = staal;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(tx0, ty0);
    g.lineTo(tx0, ty1);
    g.moveTo(tx1, ty0);
    g.lineTo(tx1, ty1);
    g.stroke();
    const vak = 0.06 * S;
    g.lineWidth = 2.6;
    for (let y = ty0; y > ty1 + 2; y -= vak) {
      g.beginPath();
      g.moveTo(tx0, y);
      g.lineTo(tx1, y - vak);
      g.moveTo(tx1, y);
      g.lineTo(tx0, y - vak);
      g.moveTo(tx0, y);
      g.lineTo(tx1, y);
      g.stroke();
    }
    // randlicht van de schijnwerpers op de rechterpoot
    g.strokeStyle = rand;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(tx1 + 3, ty0);
    g.lineTo(tx1 + 3, ty1);
    g.stroke();
    // platforms met lampjes
    for (let i = 1; i < 7; i++) {
      const y = Y(i * 0.12);
      g.fillStyle = '#1b2232';
      g.fillRect(tx0 - 10, y - 4, tx1 - tx0 + 20, 6);
      g.fillStyle = '#fff4dc';
      g.fillRect(tx0 - 6, y - 8, 3, 3);
      g.fillRect(tx1 + 2, y - 8, 3, 3);
    }
    // kraan bovenop
    g.fillStyle = staal;
    g.fillRect(tx0 - 30, ty1 - 10, tx1 - tx0 + 90, 12);
    g.fillRect((tx0 + tx1) / 2 - 3, ty1 - 70, 6, 60);
    g.fillStyle = '#ff2a2a';
    g.beginPath();
    g.arc((tx0 + tx1) / 2, ty1 - 74, 3.5, 0, Math.PI * 2);
    g.fill();
    // het lanceerplatform
    g.fillStyle = '#161b26';
    g.fillRect(X(-0.13), Y(0.06), 0.26 * S, 0.06 * S);
    g.fillStyle = '#2d3646';
    g.fillRect(X(-0.13), Y(0.06), 0.26 * S, 4);
    g.fillStyle = '#05070b';
    g.fillRect(X(-0.045), Y(0.045), 0.09 * S, 0.045 * S);
    g.fillStyle = '#1d2433';
    for (const s of [-1, 1]) {
      g.fillRect(X(s * 0.052) - 4, Y(0.085), 8, 0.03 * S);
      g.fillRect(X(-0.12 + (s > 0 ? 0.2 : 0)), Y(0.04), 0.04 * S, 0.04 * S);
    }
    g.fillStyle = '#fff4dc';
    for (const x of [-0.11, -0.07, 0.07, 0.11]) g.fillRect(X(x), Y(0.057), 3, 2);
    // de toegangsarm (los, rechtsboven): van de toren naar de capsule
    const a0 = PAD_ARM;
    g.fillStyle = staal;
    g.fillRect(a0.x0, a0.y0 + 18, a0.x1 - a0.x0 - 30, 14);
    g.strokeStyle = '#1e2635';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = a0.x0; x < a0.x1 - 40; x += 18) {
      g.moveTo(x, a0.y0 + 32);
      g.lineTo(x + 18, a0.y0 + 18);
    }
    g.stroke();
    g.fillStyle = '#1b2232';
    g.fillRect(a0.x1 - 34, a0.y0 + 4, 34, 38);
    g.fillStyle = '#fff4dc';
    g.fillRect(a0.x1 - 26, a0.y0 + 12, 6, 4);
    g.fillStyle = rand;
    g.fillRect(a0.x0, a0.y0 + 17, a0.x1 - a0.x0 - 30, 2);
    return cv;
  }

  // Het aftellen: 3, 2, 1 en LANCERING, met een ingebakken gloed.
  function maakTelling(A) {
    const cv = A.nieuw(2048, 1024);
    const g = cv.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tekst = (s, x, y, font) => {
      g.font = font;
      g.shadowColor = 'rgba(120,175,255,0.95)';
      g.shadowBlur = 54;
      g.fillStyle = 'rgba(150,195,255,0.75)';
      g.fillText(s, x, y);
      g.shadowBlur = 18;
      g.fillText(s, x, y);
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      g.fillText(s, x, y);
    };
    ['3', '2', '1'].forEach((s, i) => tekst(s, 256 + i * 512, 268, `800 420px ${A.F_SPORT}`));
    let fs = 190;
    g.font = `800 ${fs}px ${A.F_DISPLAY}`;
    while (fs > 80 && g.measureText('LANCERING').width > 1880) {
      fs -= 4;
      g.font = `800 ${fs}px ${A.F_DISPLAY}`;
    }
    tekst('LANCERING', 1024, 770, `800 ${fs}px ${A.F_DISPLAY}`);
    return cv;
  }

  // Een kleine, naadloze ruistextuur (256², drie kanalen): vervangt de ruisberekeningen per pixel in de schermvullende shaders.
  function* maakRuis(A) {
    const N = 256;
    const cv = A.nieuw(N, N);
    const g = cv.getContext('2d');
    const img = g.createImageData(N, N);
    const rooster = (per, seed) => {
      const r = new Float32Array(per * per);
      let z = seed * 7919 + 13;
      for (let i = 0; i < r.length; i++) {
        z = (z * 16807) % 2147483647;
        r[i] = z / 2147483647;
      }
      return r;
    };
    const rooster3 = [[8, 16, 32], [8, 16, 32], [8, 16, 32]].map((l, ch) => l.map((per, i) => rooster(per, ch * 10 + i + 1)));
    const gew = [0.56, 0.29, 0.15];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        for (let ch = 0; ch < 3; ch++) {
          let v = 0;
          for (let o = 0; o < 3; o++) {
            const per = 8 << o;
            const r = rooster3[ch][o];
            const fx = (x / N) * per;
            const fy = (y / N) * per;
            const xi = Math.floor(fx);
            const yi = Math.floor(fy);
            let ux = fx - xi;
            let uy = fy - yi;
            ux = ux * ux * (3 - 2 * ux);
            uy = uy * uy * (3 - 2 * uy);
            const x1 = (xi + 1) % per;
            const y1 = (yi + 1) % per;
            const a = r[yi * per + xi] + (r[yi * per + x1] - r[yi * per + xi]) * ux;
            const b = r[y1 * per + xi] + (r[y1 * per + x1] - r[y1 * per + xi]) * ux;
            v += (a + (b - a) * uy) * gew[o];
          }
          img.data[(y * N + x) * 4 + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
        }
        img.data[(y * N + x) * 4 + 3] = 255;
      }
      if (y % 64 === 63) yield;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // De sterrenhemel, één keer getekend: 1408² (2 schermhoogtes breed). R: grote sterren (64 vakjes per hoogte), G: kleine (150).
  function* maakSterren(A) {
    const N = 1408;
    const cv = A.nieuw(N, N);
    const g = cv.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'lighter';
    let z = 12345;
    const rnd = () => (z = (z * 16807) % 2147483647) / 2147483647;
    const ster = (cx, cy, rad, kleur) => {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, kleur);
      gr.addColorStop(0.35, kleur.replace(/,1\)$/, ',0.55)'));
      gr.addColorStop(1, kleur.replace(/,1\)$/, ',0)'));
      g.fillStyle = gr;
      g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    };
    const per = [[128, 11, 2.3, 0.14], [300, 4.693, 1.7, 0.1]];
    for (let l = 0; l < 2; l++) {
      const [n, cel, rad, kans] = per[l];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (rnd() > kans) continue;
          const px = (x + 0.15 + rnd() * 0.7) * cel;
          const py = (y + 0.15 + rnd() * 0.7) * cel;
          if (l === 0) {
            const br = Math.min(1, (0.3 + 2.2 * Math.pow(rnd(), 7)) / 2.5);
            ster(px, py, rad, `rgba(${Math.round(255 * br)},0,0,1)`);
          } else ster(px, py, rad, 'rgba(0,255,0,1)');
        }
        if (y % 40 === 39) yield;
      }
    }
    return cv;
  }

  // Het live cijfer: een atlas met de tekens 0…9 en de komma (cellen van 170×256) en daaronder het woordje CIJFER.
  const TEL_CW = 170;
  const TEL_CH = 256;
  const CALLS = ['TOREN VRIJ', 'MAX-Q', 'GELUIDSBARRIÈRE', 'TRAPSCHEIDING', 'MOTOR UIT', 'RUIMTE'];
  function maakTeller(A) {
    const cv = A.nieuw(2048, 512);
    const g = cv.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const tekens = '0123456789,';
    for (let i = 0; i < tekens.length; i++) {
      g.font = `900 236px ${A.F_SPORT}`;
      const x = i * TEL_CW + TEL_CW / 2;
      g.shadowColor = 'rgba(255,255,255,0.9)';
      g.shadowBlur = 26;
      g.fillStyle = '#ffffff';
      g.fillText(tekens[i], x, 206);
      g.shadowBlur = 0;
      g.fillText(tekens[i], x, 206);
    }
    g.font = `800 64px ${A.F_DISPLAY}`;
    if ('letterSpacing' in g) g.letterSpacing = '14px';
    g.shadowColor = 'rgba(255,255,255,0.7)';
    g.shadowBlur = 12;
    g.fillText('CIJFER', 330, 400);
    // de meldingen
    g.font = `800 58px ${A.F_DISPLAY}`;
    if ('letterSpacing' in g) g.letterSpacing = '8px';
    return cv;
  }
  function maakMeldingen(A) {
    const cv = A.nieuw(1536, 128 * CALLS.length);
    const g = cv.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    CALLS.forEach((s, i) => {
      let fs = 60;
      g.font = `800 ${fs}px ${A.F_DISPLAY}`;
      if ('letterSpacing' in g) g.letterSpacing = '8px';
      while (fs > 28 && g.measureText(s).width > 1380) {
        fs -= 2;
        g.font = `800 ${fs}px ${A.F_DISPLAY}`;
      }
      g.shadowColor = 'rgba(150,200,255,0.9)';
      g.shadowBlur = 20;
      g.fillStyle = '#ffffff';
      g.fillText(s, 768, i * 128 + 60);
      g.shadowBlur = 0;
      g.fillText(s, 768, i * 128 + 60);
      g.fillStyle = 'rgba(190,225,255,0.8)';
      g.fillRect(168, i * 128 + 110, 1200, 3);
    });
    return cv;
  }

  // De hoogtemeter: een rail met 1…10 en de streep van een voldoende (5,5).
  const HUD_W = 160;
  const HUD_H = 1024;
  const HUD_Y0 = 964; // cijfer 1
  const HUD_Y1 = 60; // cijfer 10
  const hudY = (g) => HUD_Y0 + ((g - 1) / 9) * (HUD_Y1 - HUD_Y0);
  function maakHud(A) {
    const cv = A.nieuw(HUD_W, HUD_H);
    const g = cv.getContext('2d');
    // donker glazen paneel
    g.fillStyle = 'rgba(6,10,20,0.42)';
    const r = 14;
    g.beginPath();
    g.moveTo(4 + r, 4);
    g.lineTo(HUD_W - 4 - r, 4);
    g.quadraticCurveTo(HUD_W - 4, 4, HUD_W - 4, 4 + r);
    g.lineTo(HUD_W - 4, HUD_H - 4 - r);
    g.quadraticCurveTo(HUD_W - 4, HUD_H - 4, HUD_W - 4 - r, HUD_H - 4);
    g.lineTo(4 + r, HUD_H - 4);
    g.quadraticCurveTo(4, HUD_H - 4, 4, HUD_H - 4 - r);
    g.lineTo(4, 4 + r);
    g.quadraticCurveTo(4, 4, 4 + r, 4);
    g.fill();
    g.strokeStyle = 'rgba(170,200,255,0.22)';
    g.lineWidth = 2;
    g.stroke();
    // rail
    g.fillStyle = 'rgba(200,220,255,0.35)';
    g.fillRect(38, HUD_Y1, 4, HUD_Y0 - HUD_Y1);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let i = 1; i <= 10; i++) {
      const y = hudY(i);
      g.fillStyle = 'rgba(235,242,255,0.9)';
      g.fillRect(40, y - 1.5, 26, 3);
      g.font = `800 34px ${A.F_SPORT}`;
      g.fillText(String(i), 76, y + 1);
      if (i < 10) {
        g.fillStyle = 'rgba(200,220,255,0.45)';
        g.fillRect(40, hudY(i + 0.5) - 1, 14, 2);
      }
    }
    // voldoende-streep (5,5), gestippeld
    const yv = hudY(5.5);
    g.fillStyle = 'rgba(150,235,255,0.95)';
    for (let x = 10; x < HUD_W - 8; x += 14) g.fillRect(x, yv - 1.5, 8, 3);
    g.font = `800 15px ${A.F_SPORT}`;
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText('VOLDOENDE', 52, yv - 15);
    g.font = `800 17px ${A.F_SPORT}`;
    g.fillStyle = 'rgba(200,220,255,0.7)';
    g.fillText('HOOGTE', 22, 30);
    return cv;
  }

  // "MISSIE: WISKUNDE" met het onderwerp en de weging eronder.
  function maakLabel(d, A) {
    const cv = A.nieuw(1600, 200);
    const g = cv.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const kop = `MISSIE: ${d.vak.toUpperCase()}`;
    let fs = 60;
    const zet = () => {
      g.font = `800 ${fs}px ${A.F_DISPLAY}`;
      if ('letterSpacing' in g) g.letterSpacing = `${Math.round(fs * 0.12)}px`;
    };
    zet();
    while (fs > 30 && g.measureText(kop).width > 1500) {
      fs -= 2;
      zet();
    }
    g.shadowColor = 'rgba(0,0,0,0.75)';
    g.shadowBlur = 14;
    g.fillStyle = '#ffffff';
    g.fillText(kop, 800, 86);
    let sub = `${(d.onder || '').toUpperCase()}  ·  WEGING ${d.weging}×`;
    g.font = `800 40px ${A.F_SPORT}`;
    if ('letterSpacing' in g) g.letterSpacing = '6px';
    while (sub.length > 12 && g.measureText(sub).width > 1500) sub = sub.slice(0, -1);
    g.fillStyle = 'rgba(200,222,255,0.85)';
    g.fillText(sub, 800, 160);
    return cv;
  }

  // Vier rookwolkjes (2×2) voor de deeltjes: r = licht van boven, g = licht van onder, a = dichtheid.
  function maakPuf(A) {
    const W = 256;
    const lagen = [A.nieuw(W, W), A.nieuw(W, W)];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const blobs = [];
    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * 128 + 64;
      const oy = Math.floor(v / 2) * 128 + 64;
      for (let i = 0; i < 26; i++) {
        const an = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * 30;
        const R = 9 + rnd() * 15 * (1 - rr / 45);
        blobs.push([ox + Math.cos(an) * rr, oy + Math.sin(an) * rr * 0.78, R, 0.7 + rnd() * 0.3]);
      }
    }
    for (let l = 0; l < 2; l++) {
      const g = lagen[l].getContext('2d');
      const dy = l === 0 ? -0.45 : 0.45;
      for (const [x, y, R, b] of blobs) {
        const gr = g.createRadialGradient(x - R * 0.15, y + R * dy, R * 0.05, x, y, R);
        const c0 = Math.round(255 * b);
        gr.addColorStop(0, `rgba(${c0},${c0},${c0},0.9)`);
        gr.addColorStop(0.6, `rgba(${Math.round(c0 * 0.45)},${Math.round(c0 * 0.45)},${Math.round(c0 * 0.45)},0.6)`);
        gr.addColorStop(1, 'rgba(20,20,20,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, R, 0, Math.PI * 2);
        g.fill();
      }
    }
    const a = lagen[0].getContext('2d').getImageData(0, 0, W, W);
    const b = lagen[1].getContext('2d').getImageData(0, 0, W, W).data;
    const ad = a.data;
    for (let i = 0; i < ad.length; i += 4) {
      ad[i + 1] = b[i];
      ad[i + 2] = 0;
    }
    lagen[0].getContext('2d').putImageData(a, 0, 0);
    return lagen[0];
  }

  // ───────────────────────── Sleutelwaarden per hoogte ─────────────────────────
  const ZENIT = [[0, 0.006, 0.01, 0.03], [0.04, 0.01, 0.015, 0.04], [0.15, 0.03, 0.06, 0.16], [0.25, 0.045, 0.11, 0.3], [0.4, 0.03, 0.055, 0.2], [0.5, 0.016, 0.02, 0.1], [0.65, 0.004, 0.005, 0.022], [1, 0.002, 0.002, 0.008]];
  const HORK = [[0, 0.035, 0.042, 0.07], [0.04, 0.03, 0.035, 0.06], [0.15, 0.2, 0.24, 0.36], [0.25, 0.42, 0.48, 0.64], [0.4, 0.3, 0.42, 0.7], [0.5, 0.13, 0.27, 0.62], [0.65, 0.05, 0.14, 0.45], [1, 0.03, 0.08, 0.32]];
  function kfKleur(rows, f, out) {
    if (f <= rows[0][0]) {
      out[0] = rows[0][1];
      out[1] = rows[0][2];
      out[2] = rows[0][3];
      return out;
    }
    for (let i = 1; i < rows.length; i++) {
      if (f <= rows[i][0]) {
        const a = rows[i - 1];
        const b = rows[i];
        let w = (f - a[0]) / (b[0] - a[0]);
        w = w * w * (3 - 2 * w);
        out[0] = a[1] + (b[1] - a[1]) * w;
        out[1] = a[2] + (b[2] - a[2]) * w;
        out[2] = a[3] + (b[3] - a[3]) * w;
        return out;
      }
    }
    const l = rows[rows.length - 1];
    out[0] = l[1];
    out[1] = l[2];
    out[2] = l[3];
    return out;
  }

  // Per niveau: hoe groot de klapper bij het hoogtepunt is.
  const KLAP = [
    { vonk: 150, flits: 0.32, kern: 0.55, stralen: 0.55, golven: 1, rook: 1 },
    { vonk: 520, flits: 0.5, kern: 0.85, stralen: 0.85, golven: 1, rook: 0 },
    { vonk: 900, flits: 0.7, kern: 1.1, stralen: 1.1, golven: 2, rook: 0 },
    { vonk: 1150, flits: 0.85, kern: 1.25, stralen: 1.25, golven: 4, rook: 0 },
    { vonk: 1400, flits: 1.0, kern: 1.45, stralen: 1.45, golven: 3, rook: 0 },
  ];

  SPO.openingen.raket = {
    naam: 'raket',

    shaders: {
      lucht: { vs: VS_VOL, fs: FS_LUCHT, teken: 'vol' },
      sprite: { vs: VS_KWAD, fs: FS_SPRITE, teken: 'strip' },
      vlam: { vs: VS_KWAD, fs: FS_VLAM, teken: 'strip' },
      rook: { vs: VS_ROOK, fs: FS_ROOK, teken: 'inst' },
      nevel: { vs: VS_VOL, fs: FS_NEVEL, teken: 'vol' },
    },

    tijdlijn(d) {
      const P = plan(d);
      const fotos = [0.7, P.tellen[P.tellen.length - 1] + 0.12, P.TI + 0.22, P.TL + 0.85 * P.k];
      if (P.tDekB !== null) fotos.push(P.tDekB + 0.05 * P.k);
      if (P.sep !== null) fotos.push(P.sep + 0.3 * P.k);
      if (P.uc > U_MAXQ + 0.2) fotos.push(P.TL + U_MAXQ * P.k);
      fotos.push(P.tc - 0.12, P.tA + 0.25, P.E - 0.2, P.E + 0.1, P.E + 0.5);
      fotos.sort((a, b) => a - b);
      return { E: P.E, K0: P.K0, fotos, staart: 0.5, raket: P };
    },

    *art(d, h) {
      const A = h.art;
      const { K, M } = maakRaket(d, A);
      yield;
      const N = maakNormaal(A, K, M);
      yield;
      const pad = maakPad(A);
      yield;
      const tel = maakTelling(A);
      yield;
      const hud = maakHud(A);
      const label = maakLabel(d, A);
      const teller = maakTeller(A);
      const meld = maakMeldingen(A);
      yield;
      const ruis = yield* maakRuis(A);
      yield;
      const ster = yield* maakSterren(A);
      const puf = maakPuf(A);
      return { raket: K, norm: N, pad, tel, hud, label, puf, teller, meld, ruis, ster };
    },

    maak(c) {
      const gl = c.gl;
      const tl = c.tl;
      const d = c.d;
      const P = tl.raket || plan(d);
      const { E, K0 } = tl;
      const tier = c.tier;
      const klem = c.klem;
      const mix = c.mix;
      const sm = c.sm;
      const art = c.art || {};
      const tex = {
        raket: c.tekstuur(art.raket),
        norm: c.tekstuur(art.norm),
        pad: c.tekstuur(art.pad),
        tel: c.tekstuur(art.tel),
        hud: c.tekstuur(art.hud),
        label: c.tekstuur(art.label),
        teller: c.tekstuur(art.teller),
        ster: c.tekstuur(art.ster, { mip: true, herhaal: true }),
        ruis: c.tekstuur(art.ruis, { mip: true, herhaal: true }),
        meld: c.tekstuur(art.meld),
        puf: c.tekstuur(art.puf, { mip: false }),
      };
      const pL = c.prog('lucht');
      const pS = c.prog('sprite');
      const pV = c.prog('vlam');
      const pR = c.prog('rook');
      const pN = c.prog('nevel');
      const kw = () => c.motor.kwaliteit || 0;

      // ───── vaste maten ─────
      const KH = 22; // wereld-eenheden per eenheid hoogte (dichtbij: platform, toren)
      const RH = 0.6; // hoogte van de raket (wereld, zoom 1)
      const YM = 0.06; // hoogte van het lanceerplatform
      const PXW = RH / Y_BODEM; // wereld-eenheden per pixel van het raketplaatje
      const ANKER = (Y_BODEM - Y_NAAD) * PXW; // hoogte van de naad boven de uitlaat

      // ───── toestand per beeld (alles een pure functie van t) ─────
      const S = {
        f: 0, v: 0, hR: 0, z: 1, fit: 1, ax: 0, ay: 0, th: 0, wcY: 0.36, kr: 0, lucht: 1, trap2: 0,
        vlamX: 0, vlamY: 0, r0: 0.02, nozX: 0, nozY: 0, padZicht: 1,
      };
      const kZen = [0, 0, 0];
      const kHor = [0, 0, 0];
      const kMist = [0, 0, 0];
      const VLAMK = [1, 0.55, 0.22];
      const KERN = [1, 0.9, 0.72];
      const MID = [1, 0.58, 0.2];
      const RANDK = [0.85, 0.28, 0.07];
      const ROOKK = [0.5, 0.52, 0.56];
      const keyDir = [0, 0, 1];
      const keyK = [0, 0, 0];
      const key2Dir = [0, 0, 1];
      const key2K = [0, 0, 0];
      const luchtK = [0, 0, 0];
      const bodemK = [0, 0, 0];
      const raamK = [0.25, 0.42, 0.7];
      const nul3 = [0, 0, 0];
      const tint = [1, 1, 1];
      const hudK = [0.55, 0.85, 1];
      const flitsK = [0, 0, 0];
      const padAmb = [0.55, 0.62, 0.78];

      function hoogte(t) {
        if (t <= P.TL) {
          S.f = 0;
          S.v = 0;
        } else if (t <= P.tc) {
          const u = (t - P.TL) / P.k;
          S.f = fVlucht(u);
          S.v = vVlucht(u) / P.k;
        } else if (t <= P.tA) {
          const s = (t - P.tc) / P.Tco;
          S.f = P.fc + P.vc * P.Tco * (s - (s * s) / 2);
          S.v = P.vc * (1 - s);
        } else {
          S.f = P.fA;
          S.v = 0;
        }
      }

      // De stuwkracht: ontsteken, branden, haperen en uitvallen (ook een pure functie van t).
      const HAPER = [1, 0.25, 0.95, 0.12, 0.65, 0.04, 0.32, 0];
      function kracht(t) {
        if (t < P.TI) return 0;
        let kr = sm(t, P.TI, P.TI + 0.22) * (1 + 0.25 * Math.exp(-(t - P.TI) / 0.3));
        if (P.sep !== null && t >= P.sep) {
          // de eerste trap valt af; de tweede ontsteekt even later
          const t2 = P.sep + 0.2 * P.k;
          kr = t < t2 ? 0 : sm(t, t2, t2 + 0.15);
        }
        const h0 = P.tc - P.sputter;
        if (t >= P.tc) return 0;
        if (t > h0) {
          const u = ((t - h0) / P.sputter) * (HAPER.length - 1);
          const i = Math.floor(u);
          const w = u - i;
          const a = HAPER[i];
          const b = HAPER[Math.min(HAPER.length - 1, i + 1)];
          kr *= a + (b - a) * w * w * (3 - 2 * w);
        }
        return kr;
      }

      const smin = (a, b, k) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));

      function bereken(t) {
        hoogte(t);
        const f = S.f;
        const asp = c.asp;
        const fit = klem(asp / 1.25, 0.72, 1);
        S.fit = fit;
        S.hR = KH * f;
        let z = 1 + 0.07 * sm(t, 0, P.TI + 0.3);
        z *= mix(1, 0.8, sm(S.hR, 0.15, 1.8));
        if (P.sep !== null) z *= 1 + 0.3 * sm(t, P.sep + 0.1, P.sep + 1.8);
        z *= 1 + 0.18 * sm(t, P.tc - 0.2, P.E + 0.2) + 0.05 * sm(t, P.tA, P.E);
        z *= fit;
        S.z = z;
        const yAw = YM + S.hR + ANKER;
        const yFree = (yAw - 0.36) * z;
        let yT = mix(0.3, 0.2, sm(S.hR, 0.1, 1.5));
        if (P.sep !== null) yT = mix(yT, 0.13, sm(t, P.sep, P.sep + 1.6));
        yT = mix(yT, 0.035, sm(t, P.tc - 0.1, P.E - 0.05));
        S.ay = t <= P.TL ? yFree : smin(yFree, yT, 0.035);
        S.ax = 0;
        S.wcY = yAw - S.ay / z;
        // kantelen (zwaartekrachtbocht) en een klein beetje wiebelen
        let th = -0.065 * sm(t, P.TL + 1.2 * P.k, P.TL + 3.4 * P.k);
        th += (0.006 * Math.sin(t * 2.3) + 0.004 * Math.sin(t * 5.1 + 1)) * sm(t, P.TL + 0.4, P.TL + 1.2) * (1 - sm(t, P.tc, P.tA));
        th -= 0.035 * sm(t, P.tc, P.E + 0.3);
        S.th = th;
        S.kr = kracht(t);
        S.lucht = Math.exp(-f * 6.5);
        S.trap2 = P.sep !== null && t >= P.sep ? 1 : 0;
        S.padZicht = 1 - sm(S.hR, 1.2, 2.2);
        // de uitlaat van de actieve motor
        const sp = PXW * z;
        const ny = S.trap2 ? Y_TRAP + (MOT2.y1 - MOT2.y0) : Y_BODEM;
        const ly = -(ny - Y_NAAD) * sp;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        S.nozX = S.ax - sn * ly;
        S.nozY = S.ay + cs * ly;
        S.r0 = (S.trap2 ? 42 : 64) * sp;
        // het licht van de vlam zit een stukje onder de uitlaat
        const lv = S.r0 * 3.2;
        S.vlamX = S.nozX + sn * lv;
        S.vlamY = S.nozY - cs * lv;
      }

      // Wereld (platform) → scherm
      const wx2s = (wx) => wx * S.z;
      const wy2s = (wy) => (wy - S.wcY) * S.z;

      // ───── gebeurtenissen: geluid ─────
      const A = c.audio;
      P.tellen.forEach((tt) => c.at(tt, () => A.speel('raket-piep', { gain: 0.9 })));
      c.at(P.TI, () => {
        A.speel('raket-piep', { gain: 1, rate: 1.26, duur: 0.9, fadeOut: 0.3 });
        A.speel('raket-start', { gain: 1, galmen: 0.3 });
        c.trillen([40, 30, 120]);
      });
      c.at(P.TL, () => A.speel('raket-trap', { gain: 0.35, rate: 0.72, galmen: 0.2 }));
      // de motor: elkaar overlappende stukken, zodat de lus niet klikt; stopt bij het uitvallen
      const motor = [null, null, null, null];
      let mi = 0;
      for (let ts = P.TL - 0.1, i = 0; ts < P.tc - 0.3; ts += 2.2, i++) {
        const f0 = fVlucht(Math.max(0, (ts - P.TL) / P.k));
        const gain = 0.95 * (0.45 + 0.55 * Math.exp(-f0 * 3));
        const ofs = [0.25, 1.1, 0.6][i % 3];
        c.at(ts, () => {
          motor[mi++ % 4] = A.speel('raket-motor', { gain, offset: ofs, duur: 2.65, fadeIn: i === 0 ? 0.5 : 0.35, fadeOut: 0.4 });
        });
      }
      const h0 = P.tc - P.sputter;
      [0.15, 0.48, 0.8].forEach((q, i) => c.at(h0 + q * P.sputter, () => A.speel('raket-motor', { gain: 0.7 - i * 0.15, offset: 0.4 + i * 0.3, duur: 0.13, fadeIn: 0.004, fadeOut: 0.06, rate: 1.1 })));
      c.at(P.tc - 0.02, () => {
        for (let i = 0; i < 4; i++) if (motor[i]) motor[i].stop(0.22);
      });
      if (P.knal !== null) c.at(P.knal, () => {
        A.speel('raket-knal', { gain: 1, galmen: 0.35 });
        c.trillen(40);
      });
      if (P.sep !== null) c.at(P.sep, () => {
        A.speel('raket-trap', { gain: 1, galmen: 0.3 });
        c.trillen([20, 20, 30]);
      });
      c.at(E - 0.35, () => A.whoosh(0.5));
      c.at(E, () => {
        A.boem(0.55 + 0.45 * c.I);
        if (tier >= 3) A.boem(0.35, 1.4);
        c.trillen(tier >= 3 ? [50, 30, 90] : [30, 20, 50]);
      });
      if (tier === 4) [0.35, 0.7, 1.05].forEach((q) => c.at(E + q, () => A.vuurwerk()));

      // ───── het live cijfer: een zuivere functie van de hoogte ─────
      const N_EIND = Math.round(parseFloat(String(d.cijferTekst).replace(',', '.')) * 10) || Math.round(d.g * 10);
      const tienden = (f) => 10 + Math.round((N_EIND - 10) * Math.min(1, f / P.fA));
      const tw = new Float32Array(12).fill(-1); // eerste moment waarop een heel getal bereikt is
      let t55 = -1;
      const tikken = [];
      {
        let prev = 10;
        let laatste = -9;
        for (let tt = P.TL; tt <= P.tA + 0.01; tt += 0.004) {
          hoogte(tt);
          const n = tienden(S.f);
          if (n > prev) {
            for (let m = prev + 1; m <= n; m++) {
              if (m % 10 === 0 && tw[m / 10] < 0) tw[m / 10] = tt;
              if (m === 55 && t55 < 0) t55 = tt;
            }
            if (tt - laatste >= 0.085) {
              tikken.push(tt, (n - 10) / Math.max(1, N_EIND - 10));
              laatste = tt;
            }
            prev = n;
          }
        }
      }
      for (let i = 0; i < tikken.length; i += 2) {
        const pr = tikken[i + 1];
        c.at(tikken[i], () => A.speel('tik', { gain: 0.55, rate: 0.85 + 0.75 * pr }));
      }
      if (t55 >= 0) {
        c.at(t55, () => A.speel('raket-piep', { gain: 0.6, rate: 1.5, duur: 0.35, fadeOut: 0.2 }));
        c.flits(t55, 0.1, 0.05);
      }
      // meldingen langs de vlucht (rij in het plaatje, tijd)
      const meldingen = [];
      {
        const tF = (f) => (P.uc > uVoorF(f) ? P.TL + uVoorF(f) * P.k : null);
        const lijst = [[0, tF(0.012)], [1, P.uc > U_MAXQ + 0.1 ? P.TL + U_MAXQ * P.k : null], [2, P.knal], [3, P.sep], [4, P.tc + 0.05], [5, tF(0.5)]];
        lijst.filter((x) => x[1] !== null).sort((a, b) => a[1] - b[1]).forEach((x) => {
          const vorig = meldingen.length ? meldingen[meldingen.length - 1] : null;
          if (!vorig || x[1] - vorig[1] > 1.5) meldingen.push(x);
        });
      }
      // het gerommel vóór de ontsteking
      [0, 1, 2, 3].forEach((i) => {
        const ts = P.tellen[0] - 0.4 + i * ((P.TI - P.tellen[0] + 0.4) / 4);
        if (ts < P.TI - 0.3) c.at(ts, () => A.speel('raket-motor', { gain: 0.1 + 0.07 * i, rate: 0.5 + 0.06 * i, offset: 0.2 + i * 0.4, duur: 2.4, fadeIn: 0.7, fadeOut: 0.8, galmen: 0.2 }));
      });

      // ───── schokken, flitsen, golven ─────
      c.schok(P.TI, 0.03, 0.25);
      c.schok(P.TL, 0.02, 0.3);
      if (P.knal !== null) c.schok(P.knal, 0.03, 0.18);
      if (P.sep !== null) c.schok(P.sep, 0.022, 0.2);
      // de positie van de neus bij E (voor de schokgolven)
      bereken(E);
      const neusY = S.ay;
      const neusX = S.ax;
      const KL = KLAP[tier];
      c.schok(E, 0.02 + 0.03 * c.I, 0.25);
      c.flits(E, KL.flits * 0.6, 0.025);
      c.flits(E, KL.flits * 0.3, 0.1 + 0.08 * c.I);
      for (let i = 0; i < KL.golven; i++) c.golf(E + i * 0.11, 1.15 + i * 0.25, 0.9 - i * 0.12, neusY);

      // ───── deeltjes ─────
      // vonken bij de ontsteking
      const vonkStart = c.e({ mode: 0, t0: P.TI + 0.05, delay: 0.7, life: 0.9, n: 150, org: [0, 0], angle: Math.PI / 2, spread: 2.6, spd: [0.25, 1.1], grav: [0, -0.9], drag: 1.6, size: [0.0014, 0.0035], col1: [1, 0.75, 0.4], col2: [1, 0.95, 0.85], seed: 21 });
      // klapper bij het hoogtepunt (kleur van het niveau)
      const klapVonk = c.e({ mode: 0, t0: E, delay: 0.06, life: 1.5, n: KL.vonk, org: [neusX, neusY], angle: Math.PI / 2, spread: c.TWEE_PI, spd: [0.2, 1.3 + 0.5 * c.I], grav: [0, -0.35], drag: 1.3, size: [0.0018, 0.0055], col1: c.kl, col2: [1, 0.97, 0.9], regen: tier === 4 ? 1 : 0, seed: 22 });
      const extra = [];
      if (tier === 0) {
        // een eigenwijs klein beetje confetti en een trots saluutje van vonken
        extra.push(c.e({ mode: 5, t0: E + 0.05, delay: 0.1, life: 1.6, n: 28, org: [neusX, neusY + 0.02], angle: Math.PI / 2, spread: 1.4, spd: [0.25, 0.55], grav: [0, -0.5], drag: 0.8, size: [0.006, 0.012], col1: c.kl, col2: [1, 0.85, 0.6], blend: 'alpha', seed: 23, lod: false }));
        extra.push(c.e({ mode: 0, t0: E + 0.35, delay: 0.05, life: 0.9, n: 60, org: [neusX, neusY + 0.03], angle: Math.PI / 2, spread: 0.7, spd: [0.35, 0.8], grav: [0, -0.8], drag: 1, size: [0.0016, 0.004], col1: c.kl, col2: [1, 0.9, 0.7], seed: 24 }));
      }
      if (tier >= 3) {
        // energieringen en ‘vuurwerk’-sterren
        const n = tier === 4 ? 7 : 3;
        for (let i = 0; i < n; i++) {
          const an = (i / n) * Math.PI * 2 + 0.4;
          const r = 0.16 + 0.08 * (i % 2);
          extra.push(c.e({ mode: 0, t0: E + 0.2 + i * (tier === 4 ? 0.16 : 0.22), delay: 0.03, life: 1.1, n: tier === 4 ? 220 : 150, org: [neusX + Math.cos(an) * r * 1.4, neusY + Math.sin(an) * r], angle: 0, spread: c.TWEE_PI, spd: [0.12, 0.5], grav: [0, -0.15], drag: 1.6, size: [0.0016, 0.004], col1: c.kl, col2: c.kl2, regen: tier === 4 ? 1 : 0, seed: 30 + i }));
        }
      }

      // ───── rook (eigen deeltjes) ─────
      const rook = [
        // grote wolken over de grond bij de start
        { soort: 0, t0: P.TI + 0.04, duur: 2.2, life: 3.8, n: 48, org: [0, YM], spd: [0.25, 1.6], size: [0.14, 0.28], wereld: 1, seed: 3, alpha: 1, kl: [0.86, 0.87, 0.9] },
        // stoom uit de raket (loopt door)
        { soort: 1, t0: 0, duur: 0, life: 2.8, n: 24, org: [0, YM + 0.22], spd: [0, 0.2], size: [0.024, 0.03], wereld: 1, seed: 5, alpha: 0.42, kl: [0.85, 0.88, 0.95] },
      ];

      const ventiel = [];
      P.tellen.forEach((tt, i) => {
        [-1, 1].forEach((side) => ventiel.push({ soort: 2, t0: tt + 0.2 + (side > 0 ? 0.12 : 0), duur: 0.15, life: 1.6, n: 12, org: [side * 0.05, YM + 0.26 + 0.07 * i], spd: [0.03, 0.1], size: [0.018, 0.036], seed: 40 + i * 2 + (side > 0 ? 1 : 0), alpha: 0.5, kl: [0.88, 0.9, 0.96] }));
      });
      function zendRook(t, R, camX, camY, camZ, camW, org0, org1) {
        const n = Math.max(1, Math.round(R.n * c.lod * (kw() >= 2 ? 0.6 : 1)));
        pR.f1('uTijd', t);
        pR.f1('uT0', R.t0);
        pR.f1('uDuur', R.duur);
        pR.f1('uLife', R.life);
        pR.f1('uSeed', R.seed);
        pR.f1('uAlpha', R.alpha);
        pR.i1('uSoort', R.soort);
        pR.f2('uOrg', org0, org1);
        pR.f2('uSpd', R.spd[0], R.spd[1]);
        pR.f2('uSize', R.size[0], R.size[1]);
        pR.f2('uWind', 0, 0.02);
        pR.f4('uCam', camX, camY, camZ, camW);
        pR.v3('uKleur', R.kl);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
        c.motor.teken.draws++;
      }

      // ───── hulpjes om te tekenen ─────
      function kwad(p, cx, cy, hw, hh, ang, u0, v0, u1, v1) {
        p.f2('uC', cx, cy);
        p.f2('uHalf', hw, hh);
        p.f1('uAng', ang);
        p.f4('uUV', u0, v0, u1, v1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        c.motor.teken.draws++;
      }
      // Een stuk van het raketplaatje (rijen y0…y1, kolommen x0…x1), geplaatst t.o.v. het anker (de naad).
      function raketDeel(ax, ay, th, z, x0, x1, y0, y1, ankX, ankY) {
        const sp = PXW * z;
        const lx = ((x0 + x1) / 2 - ankX) * sp;
        const ly = -((y0 + y1) / 2 - ankY) * sp;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        kwad(pS, ax + cs * lx - sn * ly, ay + sn * lx + cs * ly, ((x1 - x0) / 2) * sp, ((y1 - y0) / 2) * sp, th, x0 / RW, y0 / RHP, x1 / RW, y1 / RHP);
      }

      function zetDir(o, x, y, z) {
        const l = Math.hypot(x, y, z);
        o[0] = x / l;
        o[1] = y / l;
        o[2] = z / l;
      }
      function lichtRaket(t) {
        // het licht om de raket heen: schijnwerpers op het platform, maanlicht in de nacht, de zon boven de wolken
        const f = S.f;
        const lamp = 1 - sm(f, 0.012, 0.05);
        const zon = sm(f, 0.11, 0.2);
        const nacht = (1 - lamp) * (1 - zon);
        const ruimte = sm(f, 0.45, 0.7);
        zetDir(keyDir, -0.72 * lamp + 0.5 * nacht + 0.75 * zon, -0.05 * lamp + 0.5 * nacht + 0.22 * zon, 0.68 * lamp + 0.7 * nacht + 0.62 * zon);
        zetDir(key2Dir, 0.78 * lamp - 0.35 * (1 - lamp), -0.08 * lamp - 0.75 * (1 - lamp), 0.6);
        const kz = 1.05 + 0.25 * ruimte;
        keyK[0] = 1.0 * lamp * 0.92 + 0.28 * nacht + kz * zon * 1.0;
        keyK[1] = 1.0 * lamp * 0.98 + 0.33 * nacht + kz * zon * 0.95;
        keyK[2] = 1.0 * lamp * 1.12 + 0.46 * nacht + kz * zon * mix(0.9, 0.98, ruimte);
        const k2 = 0.62 * lamp + (1 - lamp) * (0.06 + 0.08 * zon + 0.12 * ruimte);
        key2K[0] = k2 * 0.62;
        key2K[1] = k2 * 0.72;
        key2K[2] = k2 * 0.95;
        const dag = zon * (1 - ruimte);
        const gl = S.kr * (1 - zon * 0.6) * 0.16;
        luchtK[0] = mix(0.025, 0.1, dag) + 0.008 + gl * 0.5;
        luchtK[1] = mix(0.03, 0.15, dag) + 0.01 + gl * 0.3;
        luchtK[2] = mix(0.06, 0.27, dag) + 0.025 + gl * 0.12;
        bodemK[0] = mix(0.02, 0.22, dag) + 0.02 * ruimte + gl * 1.6;
        bodemK[1] = mix(0.022, 0.22, dag) + 0.04 * ruimte + gl * 0.9;
        bodemK[2] = mix(0.032, 0.27, dag) + 0.09 * ruimte + gl * 0.36;
        // het raampje: binnenverlichting, na E in de kleur van het niveau
        const na = t >= E ? sm(t, E - 0.02, E + 0.12) : 0;
        raamK[0] = mix(0.3, c.kl[0] * 3, na);
        raamK[1] = mix(0.5, c.kl[1] * 3, na);
        raamK[2] = mix(0.85, c.kl[2] * 3, na);
      }

      function zetVlamLicht(p) {
        const I = S.kr * (0.9 + 0.1 * Math.sin(S.tt * 47) * Math.sin(S.tt * 31.7));
        p.f4('uVlam', S.vlamX, S.vlamY, 2.2 * I, 0.11 * S.z);
        p.v3('uVlamK', VLAMK);
      }

      // ───── de wereld tekenen ─────
      const deck0 = [0, 0, 0, 0];
      const deck1 = [0, 0, 0, 0];
      function zetDek(D, range, KD, cov, dag, f) {
        if (f < range[0]) {
          D[0] = (range[0] - f) * KD;
          D[1] = 0;
        } else if (f > range[1]) {
          D[0] = 0;
          const x = (f - range[1]) * KD;
          D[1] = x / (1 + x * 1.1);
        } else {
          D[0] = 0;
          D[1] = 0;
        }
        D[2] = cov;
        D[3] = dag;
      }

      function lucht(t, anim) {
        const f = S.f;
        const p = pL.gebruik();
        c.basis(p);
        p.f1('uTime', anim);
        p.f1('uQ', kw());
        p.tex('uRuis', 0, tex.ruis);
        p.tex('uSter2', 1, tex.ster);
        p.f1('uVig', 0.55 * (1 - sm(t, E - 0.05, E + 0.25)));
        kfKleur(ZENIT, f, kZen);
        kfKleur(HORK, f, kHor);
        p.v3('uZenit', kZen);
        p.v3('uHorK', kHor);
        p.f3('uGloedK', 0.75, 0.52, 0.66);
        p.v3('uVlamK', VLAMK);
        // de horizon: eerst de grond van het platform (die wegschuift als de camera omhoog kijkt), daarna boven de wolken
        const grond = wy2s(0);
        const hv = -0.31 - 0.13 * sm(f, 0.3, 1);
        const hor = mix(grond, hv, sm(f, 0.1, 0.17));
        const krom = mix(40, 1.5, Math.pow(sm(f, 0.3, 1), 0.75));
        const rimI = sm(f, 0.38, 0.6) * 1.4;
        const gloed = sm(f, 0.13, 0.22) * (1 - sm(f, 0.45, 0.7)) * 0.55;
        p.f4('uHor', hor, krom, rimI, gloed);
        p.f1('uSter', 0.55 * (1 - sm(f, 0.03, 0.12)) + 1.1 * sm(f, 0.42, 0.65));
        // zon: rechts bij de horizon; komt bij de hoogste cijfers boven de rand uit
        const asp = c.asp;
        const zx = asp * 0.36;
        const zy = hor + mix(-0.05, 0.05, sm(f, 0.7, 1.0));
        p.f4('uZon', zx, zy, sm(f, 0.12, 0.3) * (0.35 + 0.65 * sm(f, 0.6, 0.95)), sm(f, 0.8, 0.98));
        // de maan: komt van boven in beeld vanaf de rand van de ruimte
        const mz = sm(f, 0.55, 1);
        p.f4('uMaan', asp * 0.14, mix(0.95, 0.2, mz), mix(0.1, 0.27, mz), sm(f, 0.55, 0.65));
        p.f4('uAarde', sm(f, 0.28, 0.5), sm(f, 0.45, 0.65), 0, mix(0.6, 3.2, sm(f, 0.3, 1)));
        // wolkendekken: de verste eerst
        const dagB = sm(f, 0.13, 0.2);
        const fadeB = 1 - sm(f, 0.42, 0.55);
        if (f < DEK_A[0]) {
          zetDek(deck0, DEK_B, 9, 0.82, 0, f);
          zetDek(deck1, DEK_A, 12, 0.5, 0, f);
        } else {
          zetDek(deck0, DEK_A, 12, 0.5, 0, f);
          zetDek(deck1, DEK_B, 9, 0.82 * fadeB, dagB, f);
        }
        if (f > DEK_A[1] + 0.02) deck0[2] *= 0;
        p.f4('uDek0', deck0[0], deck0[1], deck0[2], deck0[3]);
        p.f4('uDek1', deck1[0], deck1[1], deck1[2], deck1[3]);
        p.f2('uDekK', 1 - sm(f, 0.24, 0.38), 1 - sm(f, 0.42, 0.56));
        p.f2('uDrift', 0.4 + f * 3, f * 2);
        // het platform
        const pz = S.padZicht;
        p.f4('uPad', pz, 0, S.z, 1.4 * S.kr * (1 - sm(S.hR, 0.1, 0.7)) * pz);
        p.f2('uPadM', wx2s(0), wy2s(YM * 0.5));
        const lampI = (1 + 0.6 * sm(t, P.TI, P.TI + 0.2) * (1 - sm(t, P.TI + 0.4, P.TI + 2))) * pz;
        const l0x = wx2s(-0.44);
        const l0y = wy2s(0.29);
        const l1x = wx2s(0.4);
        const l1y = wy2s(0.27);
        const d0x = wx2s(-0.03) - l0x;
        const d0y = wy2s(0.43) - l0y;
        const d1x = wx2s(0.03) - l1x;
        const d1y = wy2s(0.45) - l1y;
        p.f4('uLamp0', l0x, l0y, Math.atan2(d0y, d0x), lampI);
        p.f4('uLamp1', l1x, l1y, Math.atan2(d1y, d1x), lampI * 0.9);
        p.f2('uLampL', Math.hypot(d0x, d0y), Math.hypot(d1x, d1y));
        p.f4('uLampD', Math.cos(Math.atan2(d0y, d0x)), Math.sin(Math.atan2(d0y, d0x)), Math.cos(Math.atan2(d1y, d1x)), Math.sin(Math.atan2(d1y, d1x)));
        p.f4('uVlam', S.vlamX, S.vlamY, 1.6 * S.kr, 0.2);
        c.motor.mengen('optel');
        c.motor.volledig();
      }

      function platform(t, anim) {
        if (S.padZicht <= 0.001) return;
        const p = pS.gebruik();
        c.basis(p);
        p.i1('uModus', 2);
        p.tex('uTex', 0, tex.pad);
        p.f1('uAlpha', S.padZicht);
        p.f1('uGloed', 3.2);
        p.v3('uLuchtK', padAmb);
        zetVlamLicht(p);
        p.f4('uVlam', S.vlamX, S.vlamY, 3 * S.kr, 0.18 * S.z);
        c.motor.mengen('alpha');
        // het grote plaatje: x −0,5…0,5, y 0…1
        const half = 0.5 * S.z;
        kwad(p, wx2s(0), wy2s(0.5), half, half, 0, 0, 0, 1, 1);
        // de toegangsarm draait weg vóór de start
        const a0 = PAD_ARM;
        const weg = sm(t, P.tellen[0] + 0.2, P.tellen[0] + 1.6);
        const lengte = (a0.x1 - a0.x0) / 1024;
        const sx = 1 - 0.85 * weg;
        const armX = -0.165 + (lengte * sx) / 2;
        kwad(p, wx2s(armX), wy2s(0.553), ((lengte * sx) / 2) * S.z, ((a0.y1 - a0.y0) / 1024 / 2) * S.z, 0, a0.x0 / 1024, a0.y0 / 1024, a0.x1 / 1024, a0.y1 / 1024);
      }

      function raket(t) {
        const p = pS.gebruik();
        c.basis(p);
        p.i1('uModus', 1);
        p.tex('uTex', 0, tex.raket);
        p.tex('uNorm', 1, tex.norm);
        p.f1('uTime', t);
        p.v3('uKeyDir', keyDir);
        p.v3('uKeyK', keyK);
        p.v3('uKey2Dir', key2Dir);
        p.v3('uKey2K', key2K);
        p.v3('uLuchtK', luchtK);
        p.v3('uBodemK', bodemK);
        p.v3('uRaamK', raamK);
        zetVlamLicht(p);
        // het licht van de klapper
        const na = t >= E ? 1 : 0;
        const kI = na * (KL.kern * 2.4 * Math.exp(-(t - E) / 0.5) + 0.7 * sm(t, E, E + 0.3));
        flitsK[0] = c.kl[0];
        flitsK[1] = c.kl[1];
        flitsK[2] = c.kl[2];
        p.f4('uFlits', S.ax, S.ay + 0.01, kI, 0.12);
        p.v3('uFlitsK', na ? flitsK : nul3);
        const fade = 1 - sm(t, K0 - 0.15, K0 + 0.25);
        p.f1('uAlpha', fade);
        c.motor.mengen('alpha');
        const z = S.z;
        const th = S.th;
        // na E zakt de raket weg
        let ax = S.ax;
        let ay = S.ay;
        if (t > E) {
          const q = t - E;
          ay -= 0.06 * q * q + 0.015 * q;
        }
        // de eerste trap (vast of vallend)
        if (!S.trap2) {
          raketDeel(ax, ay, th, z, 0, 320, Y_TRAP, Y_BODEM, CX, Y_NAAD);
        } else {
          const q = t - P.sep;
          if (q < 1.8) {
            // waar was het anker toen de trap losliet? De camera volgt de tweede trap; de eerste valt achter.
            const val = (0.55 * q + 0.5 * 1.8 * q * q) * z;
            const bth = th + 0.25 * q * q + 0.08 * q;
            const bx = ax - 0.09 * q * z;
            const by = ay - val;
            p.f1('uAlpha', fade * (1 - sm(q, 0.7, 1.3)));
            raketDeel(bx, by, bth, z * (1 - 0.06 * q), 0, 320, Y_TRAP, Y_BODEM, CX, Y_NAAD);
            p.f1('uAlpha', fade);
          }
          // de motor van de tweede trap
          raketDeel(ax, ay, th, z, MOT2.cx - 48, MOT2.cx + 48, MOT2.y0, MOT2.y1, MOT2.cx, MOT2.y0 - (Y_TRAP - Y_NAAD));
        }
        // de tweede trap en de capsule
        raketDeel(ax, ay, th, z, 60, 260, Y_NAAD, Y_TRAP, CX, Y_NAAD);
        // de neus: springt er bij E af
        if (t < E) {
          raketDeel(ax, ay, th, z, 90, 230, 0, Y_NAAD, CX, Y_NAAD);
        } else {
          const q = t - E;
          if (q < 1.2) {
            const nx = ax + 0.32 * q * z;
            const ny = ay + (1.15 * q - 0.6 * q * q) * z;
            p.f1('uAlpha', fade * (1 - sm(q, 0.6, 1.15)));
            raketDeel(nx, ny, th - 4.5 * q, z, 90, 230, 0, Y_NAAD, CX, Y_NAAD);
          }
        }
      }

      function vlam(t) {
        const kr = S.kr;
        const p = pV.gebruik();
        c.basis(p);
        p.f1('uTime', t);
        p.f1('uQ', kw());
        const th = S.th;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        const r0 = S.r0;
        p.f1('uR0', r0);
        p.f1('uLucht', S.lucht);
        p.f1('uScroll', S.f * 30);
        p.v3('uKern', KERN);
        p.v3('uMid', MID);
        p.v3('uRand', RANDK);
        p.v3('uVlamK', VLAMK);
        p.v3('uRookK', ROOKK);
        p.f4('uVlam', S.vlamX, S.vlamY, 1.5 * kr, 0.12);
        // rookspoor (achter de vlam), alleen in de dampkring en als de raket los is van de grond
        const spoor = sm(S.hR, 0.25, 0.8) * sm(S.lucht, 0.08, 0.35) * (t < P.tA + 0.5 ? 1 : 1 - sm(t, P.tA + 0.5, E));
        if (spoor > 0.002) {
          const L = 1.3;
          p.f1('uSoort', 1);
          p.f2('uHalf', r0 * 7, L / 2);
          p.f1('uAlpha', spoor * 0.85);
          const lx = 0;
          const ly = -L / 2;
          c.motor.mengen('alpha');
          kwad(p, S.nozX - sn * ly + cs * lx, S.nozY + cs * ly, r0 * 7, L / 2, th, 0, 0, 1, 1);
        }
        if (kr > 0.002) {
          const len = r0 * mix(27, 17, 1 - S.lucht) * (0.55 + 0.45 * kr);
          const w = r0 * mix(4.4, 10, 1 - S.lucht);
          p.f1('uKap', S.hR < 0.4 && S.padZicht > 0 ? wy2s(YM - 0.004) : -10);
          p.f1('uSoort', 0);
          p.f1('uKracht', kr);
          p.f1('uAlpha', 1);
          p.f2('uHalf', w, len / 2);
          c.motor.mengen('optel');
          const ly = -len / 2 + r0 * 0.15;
          kwad(p, S.nozX - sn * ly, S.nozY + cs * ly, w, len / 2, th, 0, 0, 1, 1);
        }
        // dampkegel bij de geluidsbarrière
        if (P.knal !== null && t > P.knal - 0.25 && t < P.knal + 0.6) {
          const q = sm(t, P.knal - 0.25, P.knal) * (1 - sm(t, P.knal + 0.05, P.knal + 0.55));
          const sp = PXW * S.z;
          const lyc = -(560 - Y_NAAD) * sp;
          p.f1('uSoort', 2);
          p.f1('uAlpha', q);
          c.motor.mengen('alpha');
          kwad(p, S.ax - sn * lyc, S.ay + cs * lyc, 95 * sp * 2.1, 95 * sp * 1.1, th, 0, 0, 1, 1);
        }
      }

      function rookTekenen(t, anim) {
        const p = pR.gebruik();
        c.basis(p);
        p.tex('uPuf', 0, tex.puf);
        p.f4('uVlam', S.vlamX, S.vlamY, 3.2 * S.kr * (1 - 0.5 * sm(S.hR, 0.3, 1.2)), 0.16 * S.z);
        p.v3('uVlamK', VLAMK);
        p.f3('uAmb', 0.34, 0.38, 0.48);
        c.motor.mengen('alpha');
        // stoom uit de raket (alleen op het platform)
        if (t < P.TL + 1.5 && S.padZicht > 0 && kw() < 2) {
          const R = rook[1];
          const ox = 0;
          const oy = YM + S.hR + 0.22;
          R.alpha = 0.42 * (0.35 + 0.65 * sm(t, 0.4, P.tellen[1])) * (1 - sm(t, P.TL, P.TL + 1.5));
          zendRook(anim, R, 0, S.wcY, S.z, 0, ox, oy);
        }
        // ventielen: korte stoomstoten tijdens het aftellen
        if (kw() < 2 && S.padZicht > 0 && t < P.TI + 0.5) {
          for (let i = 0; i < ventiel.length; i++) {
            const V = ventiel[i];
            if (t >= V.t0 && t < V.t0 + V.life + 0.1) zendRook(t, V, 0, S.wcY, S.z, 0, V.org[0], V.org[1]);
          }
        }
        if (t >= P.TI && S.padZicht > 0) zendRook(t, rook[0], 0, S.wcY, S.z, 0, 0, YM);
      }

      function nevel(t) {
        const f = S.f;
        let mist = 0;
        const inDek = (r, dichtheid) => sm(f, r[0] - 0.006, r[0] + 0.003) * (1 - sm(f, r[1] - 0.003, r[1] + 0.008)) * dichtheid;
        mist = Math.max(inDek(DEK_A, 0.75), inDek(DEK_B, 0.97));
        const snel = sm(S.v, 0.05, 0.25) * (0.35 + 0.65 * sm(S.lucht, 0.05, 0.5)) * (t < P.tc ? 1 : 1 - sm(t, P.tc, P.tc + 0.5));
        let ring = 0;
        let ringR = 0;
        let wit = 0;
        if (P.knal !== null && t >= P.knal && t < P.knal + 1.2) {
          const q = t - P.knal;
          ring = 0.75 * Math.exp(-q / 0.16);
          ringR = 0.04 + 1.9 * q;
          wit = 0.1 * Math.exp(-q / 0.05);
        }
        if (t >= P.TI && t < P.TI + 0.6) wit += 0.18 * Math.exp(-(t - P.TI) / 0.08) * (c.reduceer ? 0.4 : 1);
        if (mist < 0.002 && snel < 0.002 && ring < 0.002 && wit < 0.002) return;
        const p = pN.gebruik();
        c.basis(p);
        p.f1('uTime', t);
        p.f1('uQ', kw());
        p.f1('uMist', mist);
        p.f1('uScroll', S.f * 34);
        p.f1('uSnel', snel);
        const dag = sm(f, 0.13, 0.2);
        p.f1('uDag', dag);
        kMist[0] = mix(0.05, 0.62, dag);
        kMist[1] = mix(0.055, 0.64, dag);
        kMist[2] = mix(0.075, 0.7, dag);
        p.v3('uMistK', kMist);
        p.v3('uVlamK', VLAMK);
        p.f4('uVlam', S.vlamX, S.vlamY, 1.4 * S.kr, 0);
        p.f2('uRaket', S.ax, S.ay);
        p.tex('uRuis', 0, tex.ruis);
        p.f1('uWit', wit);
        p.f4('uRing', S.ax, S.ay - 0.2 * S.z, ringR, ring);
        c.motor.mengen('alpha');
        c.motor.volledig();
      }

      function telling(t) {
        const p = pS.gebruik();
        c.basis(p);
        p.i1('uModus', 0);
        p.tex('uTex', 0, tex.tel);
        p.v3('uTint', tint);
        c.motor.mengen('optel');
        const asp = c.asp;
        const breed = asp > 1.15;
        const cx = breed ? asp * 0.27 : 0;
        const cy = breed ? 0.03 : -0.27;
        const hgt = breed ? 0.36 : 0.24;
        for (let i = 0; i < P.tellen.length; i++) {
          const t0 = P.tellen[i];
          const q = t - t0;
          if (q < -0.02 || q > 0.95) continue;
          const pop = 1 + 0.35 * Math.exp(-Math.max(q, 0) / 0.09);
          const al = sm(q, -0.02, 0.04) * (1 - sm(q, 0.55, 0.92));
          const cel = 3 - P.tellen.length + i;
          p.f1('uAlpha', al);
          p.f1('uGloed', 1.15 + 2.2 * Math.exp(-Math.max(q, 0) / 0.12));
          kwad(p, cx, cy, (hgt / 2) * pop, (hgt / 2) * pop, 0, (cel * 512) / 2048, 14 / 1024, ((cel + 1) * 512) / 2048, 526 / 1024);
        }
        const q = t - P.TI;
        if (q > -0.02 && q < 1.3) {
          const al = sm(q, -0.02, 0.04) * (1 - sm(q, 0.75, 1.25));
          const w = Math.min(breed ? 0.78 : asp * 0.92, 1.15);
          const hh = w * (240 / 1960);
          const pop = 1 + 0.12 * Math.exp(-Math.max(q, 0) / 0.12) + 0.05 * q;
          p.f1('uAlpha', al);
          p.f1('uGloed', 1.2 + 2.5 * Math.exp(-Math.max(q, 0) / 0.1));
          kwad(p, cx, breed ? cy : cy + 0.06, (w / 2) * pop, (hh / 2) * pop, 0, 44 / 2048, 650 / 1024, 2004 / 2048, 890 / 1024);
        }
      }

      function hud(t) {
        const zicht = sm(t, 0.5, 1.0) * (1 - sm(t, E + 0.15, E + 0.8));
        if (zicht <= 0.002) return;
        const flik = c.reduceer ? 1 : 0.75 + 0.25 * sm(t, 0.95, 1.05) + (t < 1.05 ? 0.25 * Math.sin(t * 90) : 0);
        const p = pS.gebruik();
        c.basis(p);
        const asp = c.asp;
        const hh = asp < 1 ? 0.46 : 0.62;
        const hw = (hh * HUD_W) / HUD_H;
        const cx = -asp / 2 + (asp < 1 ? 0.012 : 0.035) + hw / 2;
        const cy = -0.03;
        p.i1('uModus', 0);
        p.tex('uTex', 0, tex.hud);
        p.v3('uTint', tint);
        p.f1('uGloed', 1);
        p.f1('uAlpha', zicht * flik);
        c.motor.mengen('alpha');
        kwad(p, cx, cy, hw / 2, hh / 2, 0, 0, 0, 1, 1);
        // de wijzer
        const g = tienden(S.f) / 10;
        const wy = hudY(Math.min(10, g)) / HUD_H;
        p.i1('uModus', 3);
        const na = t >= E ? sm(t, E, E + 0.1) : 0;
        tint[0] = mix(hudK[0], c.kl[0], na);
        tint[1] = mix(hudK[1], c.kl[1], na);
        tint[2] = mix(hudK[2], c.kl[2], na);
        p.v3('uTint', tint);
        p.f4('uWijzer', wy, 0, na * Math.exp(-(t - E) / 0.3), 0);
        c.motor.mengen('optel');
        kwad(p, cx, cy, hw / 2, hh / 2, 0, 0, 0, 1, 1);
        tint[0] = tint[1] = tint[2] = 1;
        // het missielabel bovenaan
        const lw = Math.min(asp * 0.86, 0.95);
        const lh = lw * (200 / 1600);
        p.i1('uModus', 0);
        p.tex('uTex', 0, tex.label);
        p.v3('uTint', tint);
        p.f1('uGloed', 1);
        p.f1('uAlpha', zicht * flik * 0.95);
        c.motor.mengen('alpha');
        kwad(p, 0, 0.5 - 0.065 - lh / 2, lw / 2, lh / 2, 0, 0, 0, 1, 1);
      }

      function klapper(t) {
        if (t < E - 0.02) return;
        const q = t - E;
        const fade = 1 - sm(t, K0 - 0.1, K0 + 0.4);
        const I = c.I;
        const cx = S.ax;
        const cy = S.ay + 0.012;
        const kern = KL.kern * (Math.exp(-q / 0.35) * 1.4 + 0.5 * sm(q, 0, 0.3)) * fade;
        c.licht(t, cx, cy, kern * 0.3, 0.012 + 0.05 * Math.min(q, 0.8), KL.kern * 0.9 * Math.exp(-q / 0.6) * fade, KL.stralen * 0.6 * Math.exp(-q / 0.9) * fade, t * 0.3);
        const op = sm(q, 0, 0.08) * fade;
        c.stralen(t, op * KL.stralen * 0.9, 0.25 + 0.55 * I + 0.25 * sm(t, E + 0.5, K0), 0.1 + 0.4 * KL.kern * Math.exp(-q / 0.5), 0.15, cx, cy, t * (0.2 + 0.3 * I), 0);
      }

      // ───── het cijfer en de meldingen tekenen ─────
      const gIdx = [0, 0, 0, 0];
      const RODE = [1, 0.3, 0.26];
      const GROEN = [0.35, 1, 0.5];
      const TEL_ADV = 0.78;
      function teller(t) {
        const zicht = sm(t, 0.5, 1.0) * (1 - sm(t, E + 0.55, E + 1.0));
        if (zicht <= 0.002) return;
        const n = tienden(S.f);
        const w = (n / 10) | 0;
        let k = 0;
        if (w >= 10) {
          gIdx[k++] = 1;
          gIdx[k++] = 0;
        } else gIdx[k++] = w;
        gIdx[k++] = 10;
        gIdx[k++] = n % 10;
        const asp = c.asp;
        const breed = asp > 1.6;
        const hgt = breed ? 0.2 : asp < 1 ? 0.085 : 0.12;
        const lwv = Math.min(asp * 0.86, 0.95);
        const lhv = lwv * (200 / 1600);
        const topm = 0.065;
        const cyL = breed ? 0.07 + hgt * 0.5 : 0.5 - topm - lhv - 0.012;
        const cy = breed ? 0.07 : cyL - 0.012 - hgt * 0.5;
        const cwv = (hgt * TEL_CW) / TEL_CH;
        let breedte = 0;
        for (let i = 0; i < k; i++) breedte += gIdx[i] === 10 ? 0.42 : TEL_ADV;
        // pop bij elk heel getal, het 5,5-moment en het toppunt
        const q = tw[w] >= 0 ? t - tw[w] : 9;
        let pop = 1 + 0.16 * Math.exp(-Math.max(q, 0) / 0.14);
        const q5 = t55 >= 0 ? t - t55 : 9;
        const fl = q5 >= 0 ? Math.exp(-q5 / 0.3) : 0;
        pop += 0.12 * fl;
        const hold = t >= P.tA ? sm(t, P.tA, P.tA + 0.2) : 0;
        pop += hold * (0.04 + 0.03 * Math.sin((t - P.tA) * 7)) * (c.reduceer ? 0.3 : 1);
        const cx = breed ? -asp / 2 + 0.35 : 0;
        const bron = n >= 55 ? GROEN : RODE;
        const na = t >= E ? sm(t, E, E + 0.12) : 0;
        tint[0] = mix(mix(bron[0], 1, fl * 0.7), c.kl[0], na);
        tint[1] = mix(mix(bron[1], 1, fl * 0.7), c.kl[1], na);
        tint[2] = mix(mix(bron[2], 1, fl * 0.7), c.kl[2], na);
        const p = pS.gebruik();
        c.basis(p);
        p.i1('uModus', 0);
        p.tex('uTex', 0, tex.teller);
        p.v3('uTint', tint);
        c.motor.mengen('optel');
        p.f1('uAlpha', zicht * (0.85 + 0.15 * hold));
        p.f1('uGloed', 1.25 + 2.5 * fl + 0.8 * Math.exp(-Math.max(q, 0) / 0.2) + hold * (0.5 + 0.35 * Math.sin((t - P.tA) * 7)) + 0.8 * na * Math.exp(-(t - E) / 0.4));
        // het woordje CIJFER
        const lsc = (hgt * 0.26) / 100;
        kwad(p, cx, cyL, 330 * lsc * pop, 50 * lsc * pop, 0, 0, 330 / 512, 660 / 2048, 430 / 512);
        let x = cx - (breedte * cwv * pop) / 2;
        for (let i = 0; i < k; i++) {
          const gi = gIdx[i];
          const adv = (gi === 10 ? 0.42 : TEL_ADV) * cwv * pop;
          kwad(p, x + adv / 2, cy, (cwv / 2) * pop, (hgt / 2) * pop, 0, (gi * TEL_CW) / 2048, 0, ((gi + 1) * TEL_CW) / 2048, TEL_CH / 512);
          x += adv;
        }
        tint[0] = tint[1] = tint[2] = 1;
      }

      function meldingTekenen(t) {
        const dur = d.snel ? 1.1 : 1.6;
        for (let i = 0; i < meldingen.length; i++) {
          const q = t - meldingen[i][1];
          if (q < -0.05 || q > dur) continue;
          const al = sm(q, 0, 0.15) * (1 - sm(q, dur - 0.5, dur));
          const asp = c.asp;
          const breed = asp > 1.3;
          const wv = breed ? 0.5 : asp * 0.86;
          const hv = wv * (128 / 1536);
          const cx = breed ? asp * 0.2 : 0;
          const cy = (breed ? 0.15 : -0.3) + 0.02 * (1 - sm(q, 0, 0.4));
          const p = pS.gebruik();
          c.basis(p);
          p.i1('uModus', 0);
          p.tex('uTex', 0, tex.meld);
          tint[0] = tint[1] = tint[2] = 1;
          p.v3('uTint', tint);
          p.f1('uAlpha', al * 0.9);
          p.f1('uGloed', 1.1 + 1.5 * Math.exp(-Math.max(q, 0) / 0.12));
          c.motor.mengen('optel');
          const r = meldingen[i][0];
          kwad(p, cx, cy, wv / 2, hv / 2, 0, 0, (r * 128) / (128 * CALLS.length), 1, ((r + 1) * 128) / (128 * CALLS.length));
        }
      }

      // ───── het hele beeld ─────
      function tekenAlles(t, anim, wacht) {
        S.tt = anim;
        bereken(t);
        lichtRaket(t);
        if (c.aan('r-lucht')) lucht(t, anim);
        if (c.aan('r-pad')) platform(t, anim);
        if (c.aan('r-raket')) raket(t);
        if (c.aan('r-rook')) rookTekenen(t, anim);
        if (!wacht && c.aan('r-vlam')) vlam(t);
        if (wacht) return;
        // vonken bij de ontsteking (schuiven mee met de grond)
        if (t >= P.TI && t < P.TI + 2.2 && S.padZicht > 0) {
          vonkStart.org[0] = 0;
          vonkStart.org[1] = wy2s(YM);
          c.zend(t, vonkStart);
        }
        nevel(t);
        klapper(t);
        if (t >= E - 0.01 && t < E + 2) {
          c.zend(t, klapVonk);
          for (let i = 0; i < extra.length; i++) {
            const x = extra[i];
            if (t >= x.t0 - 0.01 && t < x.t0 + x.delay + x.life + 0.1) c.zend(t, x);
          }
        }
        telling(t);
        hud(t);
        teller(t);
        meldingTekenen(t);
      }

      function post(t) {
        const pst = c.post;
        let zoom = 1;
        for (let i = 0; i < P.tellen.length; i++) {
          const q = t - P.tellen[i];
          if (q >= 0 && q < 0.6) zoom += 0.014 * Math.exp(-q / 0.14);
        }
        if (t >= P.TI) zoom += 0.02 * Math.exp(-(t - P.TI) / 0.25);
        if (t >= E) zoom += 0.1 * sm(t, E, K0) + 0.03 * Math.exp(-(t - E) / 0.15);
        pst.zoom = zoom;
        let rad = 0;
        if (P.knal !== null && t >= P.knal) rad = Math.max(rad, 0.22 * Math.exp(-(t - P.knal) / 0.2));
        if (t >= P.TI) rad = Math.max(rad, 0.1 * Math.exp(-(t - P.TI) / 0.3));
        if (t >= E) rad = Math.max(rad, 0.2 * Math.exp(-(t - E) / 0.3) + 0.25 * sm(t, K0 - 0.6, K0));
        pst.rad = rad;
        // vóór E geen lensstreep en (bijna) geen vignet van de motor: die hebben de kleur van het niveau
        pst.streak = t < E ? -0.2 : 0.8 * Math.exp(-(t - E) / 0.5);
        pst.bloom = 1 + 0.25 * sm(t, P.TI, P.TI + 0.3) * (1 - sm(t, P.TI + 1, P.TI + 3));
        pst.vig = t < E ? 0.05 : sm(t, E, E + 0.4);
        pst.grade[0] = mix(0.94, 1, sm(S.f, 0.1, 0.3));
        pst.grade[1] = mix(0.98, 1, sm(S.f, 0.1, 0.3));
        pst.grade[2] = mix(1.06, 1, sm(S.f, 0.1, 0.3));
      }

      return {
        teken(t) {
          tekenAlles(t, t, false);
          post(t);
        },
        wacht(t) {
          tekenAlles(0.8, t, true);
        },
        schud(t) {
          if (t < P.TI) return t > P.tellen[0] - 0.3 ? (0.0005 + 0.0024 * sm(t, P.tellen[0], P.TI)) * (c.reduceer ? 0.3 : 1) : 0;
          if (t > P.tc + 0.1) return 0;
          hoogte(t);
          const ign = sm(t, P.TI, P.TI + 0.3);
          return ign * (0.0035 + 0.0055 * Math.exp(-S.f * 9)) * (t > P.tc - P.sputter ? 0.5 : 1);
        },
      };
    },
  };
})();
