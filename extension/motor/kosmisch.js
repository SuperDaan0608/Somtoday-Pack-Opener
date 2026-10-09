/*
 * Somtoday Pack Opener — kosmisch.js
 * De KOSMISCHE reeks (trede 3, kans 1 op 150): ongeveer twintig seconden ruimte, helemaal op de videokaart getekend.
 *
 *   ruimte   een nevel in lagen (diepte en parallax, kleurgrading paars/blauw/roze, stofbanen), sterren die je
 *            voorbij vliegt, een zwart gat met een gekantelde accretieschijf (dopplerkant, de achterkant van de schijf
 *            die door de zwaartekracht over het gat heen buigt, een fotonring), lensing van alles erachter, en
 *            planeten als echte bollen (belicht door de schijf, met schemerzone, atmosfeer en ringen)
 *
 * De regie (in seconden vanaf het begin van de reeks t0, bij normale snelheid):
 *   0     zwart, een lage toon; de nevel komt uit het donker, we drijven langzaam vooruit
 *   0,4   een geringde reus glijdt links langs
 *   1,6   ver weg licht een ring op: het zwarte gat; het komt dichterbij
 *   2,4   een blauwe wereld rechts langs
 *   K0    het gat ademt in en de kaart komt eruit
 *   RV    de onthulling: één strakke schokgolf door de schijf, daarna rust; het gat blijft als een halo achter de kaart (poster)
 * zeldzaam.js roept maak(c, z) aan voor een kosmische kaart met een eigen tease.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const { klem, mix, glad } = SPO;
  const ramp = (t, a, b) => klem((t - a) / (b - a), 0, 1);
  const sm = (t, a, b) => glad(ramp(t, a, b));
  const SH = () => SPO.shaders;

  // ═════════════════════════ GLSL ═════════════════════════
  const FS_RUIMTE = () => `${SH().KOP}
out vec4 o;
uniform vec2 uRes, uShake;
uniform float uZoom, uTime, uVlucht, uNevel, uSter;
uniform vec4 uGat;      // x, y, straal van de schaduw, zichtbaar
uniform vec4 uSchijf;   // helderheid, draaisnelheid-fase, schok (0..1, <0 = geen), kanteling
uniform vec4 uPl[3];    // x, y, straal, soort (<0 = geen)
uniform vec4 uPlB[3];   // zichtbaar, draai, lichtrichting x, lichtrichting y
${SH().GEMEEN}
float fbm5(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = rot2(.5) * p * 2.02 + vec2(7.3, 1.9); a *= .5; } return s; }

// ── de nevel: drie lagen op verschillende diepte; hoe dichterbij, hoe sneller ze groeien als we vooruit vliegen ──
vec3 nevel(vec2 q){
  vec3 c = vec3(0.);
  float dek = 1.;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float diep = 1. + fi * 1.7;                    // 1 dichtbij, 4,4 ver weg
    float s = 1. / (1. + uVlucht / diep);          // inzoomen door het vooruit vliegen
    vec2 u = q * s * (1.1 + .35 * fi) + vec2(3.1 * fi + .4, -1.7 * fi);
    float w = fbm(u * 1.2 + vec2(uTime * .006, 0.));
    float d = fbm5(u * 1.9 + 2.3 * vec2(w, -w) + fi * 5.1);
    float dicht = smoothstep(.38, .95, d);
    // kleurgrading: diepblauw in de schaduw, paars in het midden, roze en wit in de helderste randen
    vec3 k = mix(vec3(.05, .07, .28), vec3(.34, .12, .55), smoothstep(.3, .75, w));
    k = mix(k, vec3(.95, .34, .7), smoothstep(.62, .95, d) * (.55 + .45 * w));
    k = mix(k, vec3(.35, .55, 1.), smoothstep(.55, .9, 1. - w) * .35);
    // op grote schaal wisselt de tint tussen koel blauw en warm magenta
    k *= mix(vec3(.75, .85, 1.25), vec3(1.25, .8, 1.), smoothstep(.3, .7, vn(u * .35 + 2.)));
    float sterk = (i == 0 ? .6 : i == 1 ? .5 : .38);
    // stofbanen: donkere slierten die het licht van de lagen erachter wegnemen
    float stof = smoothstep(.5, .78, fbm5(u * 2.6 + vec2(9.1, 3.3) + w)) * (i == 0 ? .75 : .45);
    c = c * (1. - stof * .8) + k * dicht * sterk * dek;
    dek *= 1. - .35 * dicht;
  }
  // een zachte gloed van achteren
  c += vec3(.06, .04, .16) * (1. - smoothstep(0., 1.2, length(q)));
  return c;
}

// ── sterren in plakken op diepte: wat dichtbij is, beweegt sneller (vlieg-erdoorheen) ──
vec3 sterren(vec2 q){
  vec3 c = vec3(0.);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float z = fract(fi / 5. - uVlucht * .06);
    float sch = mix(26., 1.2, z);
    float fade = smoothstep(0., .3, z) * smoothstep(1., .82, z);
    vec2 u = q * sch + vec2(fi * 17.3, fi * 9.1);
    vec2 id = floor(u), f = fract(u) - .5;
    float h = h21(id + fi * 31.);
    if (h > .72) {
      vec2 o2 = (h22(id + 3.7) - .5) * .7;
      float r = length(f - o2);
      // een scherpe kern met een zachte rand; grootte in beeldpunten blijft ongeveer gelijk
      float px = sch / uRes.y;
      float g = px * (.9 + 1.4 * pow(h21(id * 1.7), 3.));
      float s = exp(-r * r / (g * g)) + .12 * exp(-r / (g * 4.));
      vec3 k = mix(vec3(.7, .8, 1.), vec3(1., .85, .95), h21(id * 2.3));
      c += k * s * fade * (.5 + 1.2 * pow(h21(id * 4.1), 6.)) * (.6 + .4 * sin(uTime * (1. + 3. * h) + h * 40.));
    }
  }
  // fijn sterrenstof heel ver weg
  vec2 u2 = q * 70. / (1. + uVlucht * .02);
  vec2 i2 = floor(u2);
  float f2 = h21(i2);
  float r2 = length(fract(u2) - .5 - (h22(i2) - .5) * .6);
  c += vec3(.75, .8, 1.) * step(.93, f2) * exp(-r2 * r2 * 60.) * .5;
  return c;
}

vec3 ruimte(vec2 q){ return nevel(q) * uNevel + sterren(q) * uSter; }

// ── de accretieschijf: emissie in het vlak van de schijf ──
vec3 schijfKleur(vec2 sp, float rho, float doppler){
  float hot = smoothstep(3.6, 1.5, rho);
  vec3 k = mix(vec3(.42, .26, 1.), vec3(1., .38, .74), smoothstep(5., 3., rho));
  k = mix(k, vec3(1., .86, .8), hot);
  k = mix(k, vec3(.78, .86, 1.), clamp(doppler - 1., 0., 1.) * .5);
  return k;
}
float schijfLicht(vec2 sp, float rho){
  if (rho < 1.3 || rho > 6.5) return 0.;
  float prof = pow(1.55 / rho, 2.2) * smoothstep(1.3, 1.62, rho) * smoothstep(6.5, 3.2, rho);
  float om = 1.6 / pow(rho, 1.5);
  vec2 r = rot2(uSchijf.y * om) * sp;
  float tur = fbm(r * 1.6 + vec2(rho * 1.3, 0.)) ;
  float vezel = .55 + .45 * sin(rho * 9. + tur * 6.);
  return prof * (.45 + .9 * tur) * (.7 + .3 * vezel);
}

void main(){
  vec2 q = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  q = (q - uShake) / uZoom;
  vec3 col;
  vec2 gc = uGat.xy;
  float rs = max(uGat.z, 1e-4);
  float zgat = uGat.w;
  vec2 d = q - gc;
  float r = length(d);
  // lensing: een Einsteinring op b; binnen de ring komt het spiegelbeeld van de hemel
  float b = rs * 1.55 * zgat;
  vec2 ql = q;
  if (zgat > .001) {
    float def = b * b / max(r * r, 1e-5);
    ql = gc + d * (1. - min(def, 6.));
  }
  col = ruimte(ql);
  // licht om het gat dat door de lens samengeknepen wordt
  col *= 1. + .6 * zgat * exp(-pow((r - b) / (rs * .35), 2.));

  if (zgat > .001) {
    float kant = uSchijf.w;                       // afplatting van de schijf (0,15 = bijna van opzij)
    float ca = cos(-.13), sa = sin(-.13);
    vec2 dr = mat2(ca, sa, -sa, ca) * d;          // de schijf iets scheef
    vec2 sp = vec2(dr.x, dr.y / kant) / rs;       // in het vlak van de schijf, in eenheden van rs
    float rho = length(sp);
    float dop = 1. + .38 * (-sp.x / max(rho, .001));
    float hel = uSchijf.x * zgat;
    // de achterkant van de schijf, door het gat over de bovenkant (en een dunne boog onder) gebogen
    float rr = r / rs;
    if (rr > 1. && rr < 3.2) {
      float rho2 = 1.35 + (rr - 1.02) * 2.1;
      vec2 sp2 = normalize(d) * rho2;
      float boven = smoothstep(-.35, .75, dr.y / r);
      float onder = .28 * smoothstep(-.2, -.9, dr.y / r) * smoothstep(1.45, 1.1, rr);
      float e2 = schijfLicht(sp2, rho2) * (boven * .8 + onder);
      float dop2 = 1. + .4 * (-dr.x / r);
      col += schijfKleur(sp2, rho2, dop2) * e2 * dop2 * dop2 * hel * 1.05;
    }
    // de schaduw
    float sch = smoothstep(rs * .985, rs * 1.03, r);
    col *= mix(1., sch, zgat);
    // de fotonring: een dunne, heldere rand
    float ring = exp(-pow((rr - 1.045) / .028, 2.)) + .35 * exp(-pow((rr - 1.12) / .07, 2.));
    col += vec3(1., .82, .9) * ring * hel * (.9 + .4 * smoothstep(-.6, .6, -dr.x / r));
    // de voorkant van de schijf (onder het midden) gaat over de schaduw heen; de achterkant niet
    float e = schijfLicht(sp, rho);
    float voor = step(dr.y, 0.);
    float zicht = mix(sch, 1., voor);
    col += schijfKleur(sp, rho, dop) * e * dop * dop * hel * zicht * 1.25;
    // een zachte gloed van de hete schijf
    col += vec3(.55, .35, .9) * .16 * hel * exp(-max(rr - 1., 0.) * .9) * sch;
    // de schokgolf van de onthulling: een ring in het vlak van de schijf, en een zachte op het scherm
    if (uSchijf.z >= 0.) {
      float s = uSchijf.z;
      float R = 1.6 + s * 16.;
      float w = .25 + 1.6 * s;
      float sg = exp(-pow((rho - R) / w, 2.)) * pow(1. - s, 1.6);
      col += mix(vec3(1., .75, .95), vec3(.5, .55, 1.), s) * sg * 1.1 * zgat;
      float R2 = rs * (1.2 + s * 9.);
      col += vec3(.6, .5, 1.) * exp(-pow((r - R2) / (rs * (.08 + .8 * s)), 2.)) * pow(1. - s, 2.) * .35 * zgat;
    }
  }

  // de planeten (van ver naar dichtbij)
  for (int i = 0; i < 3; i++) {
    vec4 P = uPl[i];
    vec4 B = uPlB[i];
    if (P.w < 0. || B.x < .002) continue;
    vec2 dp = q - P.xy;
    float R = P.z;
    float rp = length(dp) / R;
    int soort = int(P.w + .5);
    vec3 L = normalize(vec3(B.z, B.w, .55));
    float px = 1.5 / (uRes.y * R);
    // ringen achter de planeet
    float ringV = 0.; vec3 ringK = vec3(0.); float ringA = 0.;
    if (soort == 1) {
      float c2 = cos(.38), s2 = sin(.38);
      vec2 dd = mat2(c2, s2, -s2, c2) * dp / R;
      vec2 rp2 = vec2(dd.x, dd.y / .26);
      float rl = length(rp2);
      float band = smoothstep(1.35, 1.42, rl) * smoothstep(2.35, 2.25, rl) * (.55 + .45 * sin(rl * 23.) * sin(rl * 7.1 + 1.));
      band *= 1. - .85 * smoothstep(1.86, 1.9, rl) * smoothstep(1.96, 1.92, rl); // een spleet
      ringA = band * .85;
      ringK = mix(vec3(.95, .82, .95), vec3(.7, .6, 1.), smoothstep(1.4, 2.3, rl)) * (.35 + .75 * clamp(dot(normalize(vec3(rp2, 0.)), L) * .5 + .5, 0., 1.));
      ringV = step(0., dd.y) < .5 ? 1. : 0.;  // onderste helft = voor de planeet
      // ring achter: eerst tekenen
      if (ringV < .5) col = mix(col, ringK, ringA * B.x);
    }
    // de atmosfeer buiten de rand
    if (rp > 1. && rp < 1.25) {
      float lit = clamp(dot(normalize(dp), L.xy) * .7 + .45, 0., 1.);
      vec3 ak = soort == 2 ? vec3(.35, .7, 1.) : soort == 1 ? vec3(.9, .55, 1.) : vec3(1., .7, .45);
      col += ak * exp(-(rp - 1.) * 22.) * lit * .55 * B.x;
    }
    if (rp < 1. + px) {
      vec3 n = vec3(dp / R, sqrt(max(0., 1. - rp * rp)));
      vec3 s = n;
      float a = B.y;
      s.xz = mat2(cos(a), sin(a), -sin(a), cos(a)) * s.xz;
      float lat = s.y;
      float lon = atan(s.x, s.z);
      vec3 opp;
      float spec = 0.;
      if (soort == 0) {
        // een gasreus in oker en roest, met wervelende banden
        float war = fbm(vec2(lon * 1.6, lat * 3.) * 1.5);
        float bnd = lat * 9. + war * 1.6 + .25 * sin(lon * 3. + lat * 14.);
        float bb = .5 + .5 * sin(bnd * 2.1) * .7 + .3 * fbm(vec2(lon * 3., bnd * 2.));
        opp = mix(vec3(.42, .2, .1), vec3(.98, .82, .6), bb);
        opp = mix(opp, vec3(.75, .42, .22), smoothstep(.55, .8, fbm(vec2(lon * 2., lat * 20.))) * .6);
        float storm = exp(-dot(vec2(lon - .5, (lat + .28) * 2.2), vec2(lon - .5, (lat + .28) * 2.2)) * 18.);
        opp = mix(opp, vec3(.75, .28, .18), storm * .8);
      } else if (soort == 1) {
        // een lavendel-roze reus met zachte banden (met ringen)
        float war = fbm(vec2(lon * 2., lat * 4.));
        float bb = .5 + .5 * sin(lat * 16. + war * 3.);
        opp = mix(vec3(.5, .36, .78), vec3(.95, .8, .93), bb * .45 + .4 * war);
      } else {
        // een blauwe oceaanwereld met wolken
        float land = smoothstep(.55, .62, fbm5(vec2(lon, lat * 1.6) * 2.2 + 4.));
        opp = mix(vec3(.03, .16, .45), vec3(.08, .32, .7), fbm(vec2(lon, lat) * 4.));
        opp = mix(opp, mix(vec3(.18, .38, .2), vec3(.55, .5, .35), fbm(vec2(lon, lat) * 9.)), land);
        float wolk = smoothstep(.5, .8, fbm5(vec2(lon * 1.5 + lat, lat * 3.5) * 2. + 9.));
        opp = mix(opp, vec3(.95), wolk * .85);
        spec = (1. - land) * (1. - wolk);
      }
      float nl = dot(n, L);
      float dif = smoothstep(-.12, .55, nl);
      vec3 h = normalize(L + vec3(0., 0., 1.));
      vec3 c = opp * (.025 + 1.05 * dif);
      c += vec3(.12, .08, .25) * opp * smoothstep(.2, -.6, nl) * .35;    // licht van de nevel aan de nachtkant
      c += vec3(.9, .95, 1.) * pow(max(dot(n, h), 0.), 60.) * spec * .6;
      // atmosfeer: verstrooid licht aan de rand en de schemerzone
      vec3 ak = soort == 2 ? vec3(.4, .75, 1.) : soort == 1 ? vec3(.95, .6, 1.) : vec3(1., .72, .45);
      float rand = pow(1. - n.z, 2.6);
      c += ak * rand * (.15 + .9 * smoothstep(-.25, .6, nl));
      c = mix(c, c * vec3(1., .7, .65), smoothstep(.25, 0., nl) * smoothstep(-.2, 0., nl) * .6);
      float dek = smoothstep(1. + px, 1. - px, rp) * B.x;
      col = mix(col, c, dek);
    }
    if (soort == 1 && ringV > .5) col = mix(col, ringK, ringA * B.x);
  }
  o = vec4(col, 1.);
}`;

  const FS_KOPIE = () => `${SH().KOP}
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uA;
void main(){ vec3 c = texture(uTex, vUv).rgb; o = vec4(c * uA, uA); }`;

  function module() {
    const s = SH();
    return {
      naam: 'kosmisch',
      shaders: {
        ruimte: { vs: s.VS_VOL, fs: FS_RUIMTE() },
        kopie: { vs: s.VS_VOL, fs: FS_KOPIE() },
      },
    };
  }

  // ═════════════════════════ de regie ═════════════════════════
  // c: de omgeving van zeldzaam.js; z: { t0, t1, K0, RV, U, spin, snel, reduceer }
  function maak(c, z) {
    const { motor, audio } = c;
    const prog = (n) => motor.p['kosmisch.' + n];
    const klaar = (n) => {
      const p = prog(n);
      return !!(p && p.ok);
    };
    const { t0, t1, K0, RV, snel } = z;
    const T = t1 - t0;
    const R1 = z.reduceer ? 0.15 : 1;

    // de planeten: wereldpositie (x, y), straal, soort, wanneer ze het dichtst bij zijn
    const PL = [
      { soort: 1, x: -0.95, y: 0.18, R: 0.42, a: t0 + 0.2, b: t0 + T * 0.62, draai: 0.2 },
      { soort: 2, x: 1.05, y: -0.22, R: 0.3, a: t0 + T * 0.36, b: K0 + 0.2, draai: -0.3 },
      { soort: 0, x: -1.0, y: -0.3, R: 0.38, a: K0 + 0.6, b: RV - 0.4, draai: 0.1 },
    ];
    // de geluiden: een lage toon, een zucht per planeet, het gat dat opengaat, opbouw naar de kaart
    c.at(t0 + 0.05, () => audio.speel('kosmisch-bas', { gain: 0.9, galmen: 0.35 }));
    for (const p of PL) c.at(mix(p.a, p.b, 0.62), () => audio.speel('kosmisch-zwaai', { gain: 0.75, pan: p.x > 0 ? 0.6 : -0.6, galmen: 0.35, rate: p.soort === 0 ? 0.85 : 1 }));
    const GAT = t0 + T * 0.3; // het gat licht op in de verte
    c.at(GAT - 0.2, () => audio.speel('kosmisch-gat', { gain: 0.85, galmen: 0.4 }));
    c.at(K0 - 2.2, () => audio.riser && audio.riser(2.2, 0.7));
    c.at(K0 - 0.06, () => audio.boem(0.8, 0.75));
    c.at(RV - 0.02, () => audio.speel('kosmisch-bas', { gain: 0.8, rate: 1.15, galmen: 0.3 }));
    // een korte schok als de kaart uit het gat komt en bij de onthulling
    c.schok(K0, 0.015, 0.3);
    c.schok(RV, 0.02, 0.3);

    // de camera vliegt vooruit: snel in het begin, rustig bij de kaart
    function vlucht(t) {
      const a = ramp(t, t0, K0);
      return 2.2 * a * a * (3 - 2 * a) * 0.9 + 0.25 * Math.max(0, t - K0) * 0.4 + 0.6 * sm(t, K0 - 0.6, K0 + 0.5);
    }
    // het gat: van een stip in de verte naar groot achter de kaart
    function gat(t) {
      const zicht = sm(t, GAT, GAT + 1.2);
      // nadert: straal groeit als 1 / afstand
      const u = ramp(t, GAT, K0);
      const afst = mix(7, 1.0, Math.pow(u, 1.4));
      let rs = 0.17 / afst;
      // de kaart komt eruit: het gat ademt in en weer uit
      const adem = t >= K0 - 0.5 ? Math.exp(-Math.pow((t - K0 + 0.05) / 0.25, 2)) : 0;
      rs *= 1 - 0.3 * adem;
      // na de kaart: iets groter, als halo achter de kaart (de schijf moet links en rechts van de kaart te zien zijn)
      rs = mix(rs, 0.2, sm(t, K0, K0 + 2.2));
      rs *= 1 + 0.06 * sm(t, RV, RV + 1.4);
      const y = mix(0.06, 0.02, sm(t, GAT, K0));
      const x = mix(0.08, 0, sm(t, GAT, K0 - 0.5));
      return [x, y, rs, zicht];
    }
    function planeet(p, t, asp) {
      const u = ramp(t, p.a, p.b);
      if (u <= 0 || u >= 1) return null;
      // van ver (z = 9) naar vlak langs de camera (z = 0,55)
      const zz = mix(9, 0.55, Math.pow(u, 1.25));
      const f = 1.0;
      const x = (p.x * f) / zz, y = (p.y * f) / zz, R = (p.R * f) / zz;
      if (Math.abs(x) - R > asp * 0.6) return null;
      const al = sm(u, 0, 0.12);
      return { x, y, R, al, zz };
    }

    let doel = null;
    function zorgDoel() {
      const f = c.kw >= 1 ? 0.5 : 0.7;
      const W = Math.max(16, Math.ceil(motor.breedte * f)), H = Math.max(16, Math.ceil(motor.hoogte * f));
      if (!doel || doel.w !== W || doel.h !== H) {
        if (doel) motor.verwijderDoel(doel);
        doel = motor.maakDoel(W, H);
      }
      return doel;
    }
    const plA = new Float32Array(12), plB = new Float32Array(12);

    // De ruimte tekenen (achter alles). alpha: hoe zichtbaar
    function teken(t, asp, alpha) {
      if (alpha < 0.003 || !klaar('ruimte') || !klaar('kopie')) return false;
      const d = zorgDoel();
      const [gx, gy, rs, gz] = gat(t);
      motor.doel(d);
      motor.mengen('geen');
      const p = prog('ruimte').gebruik();
      p.f2('uRes', d.w, d.h);
      p.f2('uShake', c.cam.x, c.cam.y);
      p.f1('uZoom', 1);
      p.f1('uTime', t);
      p.f1('uVlucht', vlucht(t));
      p.f1('uNevel', sm(t, t0 + 0.1, t0 + 1.6) * (1 - 0.25 * sm(t, RV, RV + 1.5)));
      p.f1('uSter', sm(t, t0 + 0.05, t0 + 0.8));
      p.f4('uGat', gx, gy, rs, gz);
      // de schijf: draait steeds sneller naar de kaart toe, en krijgt bij de onthulling een schok
      const fase = t * 1.3 + 2.0 * sm(t, K0 - 1.5, K0 + 0.5) + 1.2 * sm(t, RV - 0.1, RV + 0.6);
      const hel = mix(0.95, 1.0, sm(t, GAT + 1, K0)) * (1 + 0.6 * Math.exp(-Math.pow((t - K0) / 0.35, 2))) * (1 + 0.35 * (t >= RV ? Math.exp(-(t - RV) / 0.6) : 0));
      const schok = t >= RV && t < RV + 0.9 ? (t - RV) / 0.9 : -1;
      p.f4('uSchijf', hel, fase, schok, mix(0.2, 0.17, sm(t, K0, RV)));
      // de planeten: van ver naar dichtbij
      const lijst = [];
      for (const pl of PL) {
        const s = planeet(pl, t, asp);
        if (s) lijst.push([pl, s]);
      }
      lijst.sort((a, b) => b[1].zz - a[1].zz);
      for (let i = 0; i < 3; i++) {
        const e = lijst[i];
        if (!e) {
          plA[i * 4 + 3] = -1;
          plB[i * 4] = 0;
          continue;
        }
        const [pl, s] = e;
        plA.set([s.x, s.y, s.R, pl.soort], i * 4);
        // het licht komt van het gat (als dat er is) of van linksboven
        let lx = gx - s.x, ly = gy - s.y;
        const ln = Math.hypot(lx, ly) || 1;
        lx = mix(-0.7, lx / ln, gz);
        ly = mix(0.5, ly / ln, gz);
        plB.set([s.al, pl.draai + (t - pl.a) * 0.05, lx * 1.1, ly * 1.1], i * 4);
      }
      p.v4s('uPl[0]', plA);
      p.v4s('uPlB[0]', plB);
      motor.volledig();
      motor.doel(motor.doelen.scene);
      motor.mengen('alpha');
      const kp = prog('kopie').gebruik();
      kp.tex('uTex', 0, d.tex);
      kp.f1('uA', Math.min(1, alpha));
      motor.volledig();
      return true;
    }

    // de nabewerking: donker en filmisch tijdens de tease, gedoseerd licht bij de onthulling
    function post(p, t) {
      if (t < t0) return;
      p.dark = 0;
      p.inv = 0;
      p.gl = 0;
      p.regen = 0;
      if (t < K0) {
        const u = ramp(t, t0, K0);
        p.bars = sm(t, t0 + 0.1, t0 + 0.8) * (1 - sm(t, K0 - 0.5, K0 + 0.3));
        p.zoom = 1 + 0.02 * u * u;
        p.rad = 0.02 * u * u * u;
        p.vig = 1.35;
        p.sat = 1.05;
        p.bloom = 0.75 + 0.15 * u;
      } else {
        p.bars = 0;
        p.vig = 1.2;
        p.sat = 1.05;
        p.bloom = Math.min(p.bloom, 0.8);
        p.rad = Math.min(p.rad, 0.02);
        p.zoom = 1 + (p.zoom - 1) * 0.6;
        if (t >= RV - 0.05 && t < RV + 1.2) {
          // de inslag: een korte duw naar binnen, verder strak
          const q = t - RV;
          p.zoom *= 1 + 0.015 * Math.exp(-Math.max(q, 0) / 0.16);
          p.rad = Math.max(p.rad, 0.012 * Math.exp(-Math.max(q, 0) / 0.18));
        }
      }
      p.grade = [0.96, 0.93, 1.08];
    }
    function schud(t) {
      if (t < t0 || t > RV + 2) return 0;
      let a = 0;
      if (t < K0) a += 0.0006 + 0.0025 * Math.pow(ramp(t, t0 + T * 0.5, K0), 2);
      return a * R1;
    }
    function verwijder() {
      if (doel) motor.verwijderDoel(doel);
      doel = null;
    }
    return { teken, post, schud, verwijder, gat, PL, GAT, snel };
  }

  SPO.kosmisch = { module, maak };
})();
