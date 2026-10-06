/*
 * Somtoday Pack Opener — openingen/schiet.js
 * De Schietkraam. Een rij dikke cijfertegels, één ervan is jouw cijfer. Elke klik = één schot van een stripfiguur-revolver
 * die een tegel kapotschiet; de laatste tegel die overblijft is het cijfer. De klok staat stil tussen de schoten (tl.pauzes),
 * alles daarbinnen is een zuivere functie van t. Alle sprites (tegels, cijfers, revolver, knalwoorden) komen uit één atlas.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  SPO.openingen = SPO.openingen || {};
  const { KOP, GEMEEN, VS_VOL } = SPO.shaders;
  const TWEE_PI = Math.PI * 2;
  const MAXS = 40; // sprites per tekenbeurt
  const INK = '#1b0d3a';
  const ZERO3 = [0, 0, 0];

  // ───────────────────────── kleine hulpjes ─────────────────────────
  const klem = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ramp = (x, a, b) => klem((x - a) / (b - a), 0, 1);
  const sm = (x, a, b) => {
    const u = ramp(x, a, b);
    return u * u * (3 - 2 * u);
  };
  const veer = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(p * 9));
  // restant van een verende beweging: 1 bij u=0, schiet over, 0 bij u>=1
  const gres = (u) => (u <= 0 ? 1 : u >= 1 ? 0 : Math.exp(-5.2 * u) * Math.cos(8.8 * u));
  const hh = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  function mulberry(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const tierVan = (g) => (g >= 9.95 ? 4 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5.5 ? 1 : 0);

  // kleuren per niveau: [bovenkant, onderkant, rand, glans]
  const PAL = [
    ['#ffb35c', '#d2672b', '#5c2a14', '#ffe0b0'], // brons
    ['#f1f6fc', '#8da3c2', '#34476a', '#ffffff'], // zilver
    ['#fff06a', '#f5a300', '#7d4a00', '#fffbd0'], // goud
    ['#8af0ff', '#2b6bff', '#10206e', '#d8f8ff'], // speciaal
    ['#ffffff', '#ffd25a', '#6a3a00', '#ffffff'], // icoon (regenboog)
  ];
  const TC = [
    [[1, 0.62, 0.28], [0.85, 0.4, 0.17]],
    [[0.9, 0.96, 1], [0.55, 0.65, 0.8]],
    [[1, 0.92, 0.35], [1, 0.62, 0.05]],
    [[0.5, 0.95, 1], [0.2, 0.42, 1]],
    [[1, 0.5, 0.7], [0.4, 0.9, 1]],
  ];
  const WOORDEN = ['PANG!', 'BAM!', 'POW!', 'BOEM!', 'KNAL!'];

  // ───────────────────────── Het plan: waardes, volgorde, tijden ─────────────────────────
  function maakPlan(d) {
    const snel = !!d.snel;
    const N = snel ? 6 : 10;
    const M = N - 1;
    let hsh = 2166136261;
    const sleutel = d.vak + '|' + d.cijferTekst;
    for (let i = 0; i < sleutel.length; i++) hsh = Math.imul(hsh ^ sleutel.charCodeAt(i), 16777619) >>> 0;
    const rnd = mulberry(hsh);
    const real = Math.floor(rnd() * N);
    const g10 = Math.round(d.g * 10);
    const gebruikt = [g10];
    const dec = [];
    for (let j = 0; j < M; j++) {
      const lo = 10 + (j / M) * 90;
      const hi = 10 + ((j + 1) / M) * 90;
      let v = 0;
      let ok = false;
      for (let poging = 0; poging < 80 && !ok; poging++) {
        v = klem(Math.round(lo + rnd() * (hi - lo)), 10, 100);
        const afst = poging < 50 ? 4 : 1;
        ok = true;
        for (let q = 0; q < gebruikt.length; q++) if (Math.abs(gebruikt[q] - v) < afst) ok = false;
      }
      if (!ok) {
        for (v = 10; v <= 100; v++) {
          let vrij = true;
          for (let q = 0; q < gebruikt.length; q++) if (gebruikt[q] === v) vrij = false;
          if (vrij) break;
        }
      }
      gebruikt.push(v);
      dec.push(v);
    }
    for (let i = dec.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const x = dec[i];
      dec[i] = dec[j];
      dec[j] = x;
    }
    const val = new Array(N);
    const txt = new Array(N);
    const tier = new Array(N);
    let di = 0;
    for (let i = 0; i < N; i++) {
      const g = i === real ? d.g : dec[di++] / 10;
      val[i] = g;
      tier[i] = tierVan(g);
      const s = i === real ? d.cijferTekst : d.fmt(g);
      const arr = [];
      for (let q = 0; q < s.length; q++) {
        const ch = s[q];
        arr.push(ch === ',' || ch === '.' ? 10 : ch.charCodeAt(0) - 48);
      }
      txt[i] = arr;
    }
    // volgorde waarin de lokvogels sneuvelen
    const order = [];
    for (let i = 0; i < N; i++) if (i !== real) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const x = order[i];
      order[i] = order[j];
      order[j] = x;
    }
    const KD = new Int8Array(N).fill(-1);
    for (let k = 0; k < M; k++) KD[order[k]] = k;
    // tijden
    const T0 = snel ? 1.05 : 2.55;
    const FD = [0.3, 0.8, 0.95, 1.3];
    const SD = [1.05, 1.45, 1.65, 1.0];
    const hes = new Uint8Array(M);
    const P = new Float64Array(M);
    const F = new Float64Array(M);
    const TH = new Float64Array(M);
    const TS = new Float64Array(M);
    let t = T0;
    const hs = snel ? 0.03 : 0.065;
    for (let k = 0; k < M; k++) {
      const r = N - k;
      hes[k] = snel ? 0 : r === 4 ? 1 : r === 3 ? 2 : r === 2 ? 3 : 0;
      P[k] = t;
      F[k] = t + (snel ? 0.2 : FD[hes[k]]);
      TH[k] = F[k] + 0.035;
      TS[k] = TH[k] + hs;
      t += snel ? 0.55 : SD[hes[k]];
    }
    const TF = F[M - 1] + (snel ? 0.3 : 0.5);
    const E = F[M - 1] + (snel ? 0.85 : 1.3);
    const K0 = E + (snel ? 0.8 : 1.4);
    return { N, M, real, val, txt, tier, order, KD, T0, hes, P, F, TH, TS, TF, E, K0, snel, hs, seed: hsh };
  }

  // ───────────────────────── Shaders ─────────────────────────
  const FS_ARENA = `${KOP}
out vec4 o;
uniform vec2 uRes, uShake; uniform float uZoom, uTime, uTens, uOnth, uAlpha, uDim, uFlash;
uniform vec3 uCam, uKleur;
${GEMEEN}
void main(){
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  p = (p - uShake) / uZoom;
  p = p / uCam.z + uCam.xy;
  float y = p.y;
  vec3 bot = vec3(.07,.16,.62), mid = vec3(.40,.14,.78), top = vec3(.17,.06,.46);
  vec3 col = mix(bot, mid, smoothstep(-.5, .05, y));
  col = mix(col, top, smoothstep(.05, .5, y));
  float r = length((p - vec2(0., .1)) * vec2(.8, 1.));
  col += vec3(.60,.36,1.) * .30 * exp(-r * r * 2.6);
  // grote zachte lichtbundels
  float b1 = dot(p, vec2(.866, .5));
  float b2 = dot(p, vec2(.5, -.866));
  float ray = smoothstep(.45, .95, sin(b1 * 5.2 + uTime * .1) * .5 + .5) * .6 + smoothstep(.55, 1., sin(b2 * 3.4 - uTime * .07 + 1.3) * .5 + .5) * .5;
  col += vec3(.55,.40,1.) * .075 * ray * smoothstep(-.45, .3, y);
  // halftone
  vec2 g = (mat2(.7071, .7071, -.7071, .7071) * p) / .027;
  vec2 f = fract(g) - .5;
  float dd = length(f);
  float rad = clamp(.09 + .5 * (.25 - y * .9) * (.6 + abs(p.x) * .5), .0, .46);
  float aa = fwidth(dd) + .001;
  float dots = smoothstep(rad + aa, rad - aa, dd);
  col += vec3(.16,.10,.42) * dots * .55 * (1. - smoothstep(.1, .45, y));
  // balie (voorpaneel, blad)
  float ct = -.40;
  vec3 pan = mix(vec3(.20,.08,.40), vec3(.09,.03,.22), smoothstep(ct, -.5, y));
  float plank = smoothstep(.0035, .0, abs(fract(p.x / .11 + .5) - .5) * .11);
  pan *= 1. - .35 * plank;
  float blad = smoothstep(-.372 + .004, -.372, y) * smoothstep(ct - .004, ct, y);
  vec3 bl = mix(vec3(.95,.52,.16), vec3(1.,.8,.3), smoothstep(ct, -.372, y));
  float trim = smoothstep(.012, .0, abs(y - (ct - .008)));
  vec3 bal = mix(pan, bl, blad);
  bal = mix(bal, vec3(1.,.78,.22), trim);
  float rand = smoothstep(.004, .0, abs(y - ct)) + smoothstep(.004, .0, abs(y + .372)) + smoothstep(.004, .0, abs(y - (ct - .017)));
  bal = mix(bal, vec3(.07,.03,.16), clamp(rand, 0., 1.));
  float inB = step(y, -.372);
  col = mix(col, bal, inB);
  // schaduw van het blad
  col *= 1. - .35 * smoothstep(-.31, -.372, y) * (1. - inB);
  // luifel met strepen
  float w = .09;
  float cell = p.x / w;
  float fr = fract(cell) * 2. - 1.;
  float lim = .445 - .034 * sqrt(max(0., 1. - fr * fr));
  float idx = floor(cell);
  float on = step(lim, y);
  vec3 aw = mod(idx, 2.) < .5 ? vec3(1.,.82,.25) : vec3(.95,.22,.62);
  aw *= .62 + .55 * smoothstep(.43, .52, y) * 0. + .35 * (1. - smoothstep(lim, lim + .05, y));
  aw += vec3(.25) * smoothstep(.01, .0, abs(fr + .55) - .05) * .0;
  float rim = smoothstep(.006, .0, y - lim) * on;
  aw = mix(aw, vec3(.07,.03,.16), rim);
  col *= 1. - .5 * smoothstep(lim - .06, lim, y) * (1. - on);
  col = mix(col, aw, on);
  // lampjes onderaan de luifel
  float cx = (idx + .5) * w;
  float tipY = .445 - .034 - .008;
  float ph = .6 + .4 * sin(uTime * 4. - idx * .8);
  float bd = length((p - vec2(cx, tipY)) * vec2(1., 1.));
  col += vec3(1., .85, .45) * ph * (exp(-bd * bd / .00006) * .9 + exp(-bd * bd / .0012) * .22);
  // spanning en kleur van het niveau
  col *= 1. - uDim * .5;
  float v = smoothstep(.3, .95, length(p * vec2(.85, 1.)));
  col *= 1. - (.22 + .5 * uTens) * v;
  col = mix(col, col * (.4 + 1.5 * uKleur) + uKleur * .06, uOnth * .75);
  col += vec3(1.) * uFlash;
  col += (h21(gl_FragCoord.xy) - .5) * (1.5 / 255.);
  o = vec4(max(col, 0.) * uAlpha, 1.);
}`;

  const VS_SPR = `${KOP}
uniform vec4 uA[${MAXS}], uB[${MAXS}], uC[${MAXS}], uD[${MAXS}];
uniform vec2 uRes, uShake; uniform float uZoom; uniform vec3 uCam;
out vec2 vUv; out vec4 vC; out float vAdd;
void main(){
  int i = gl_InstanceID;
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec4 a = uA[i], b = uB[i], dd = uD[i];
  vec2 l = (q - .5) * 2. * a.zw;
  vec2 w = vec2(l.x * dd.x - l.y * dd.y, l.x * dd.y + l.y * dd.x) + a.xy;
  vec2 s = (w - uCam.xy) * uCam.z * uZoom + uShake;
  gl_Position = vec4(s.x * 2. * uRes.y / uRes.x, s.y * 2., 0., 1.);
  vUv = vec2(mix(b.x, b.z, q.x), mix(b.w, b.y, q.y));
  vC = uC[i];
  vAdd = dd.z;
}`;
  const FS_SPR = `${KOP}
in vec2 vUv; in vec4 vC; in float vAdd; out vec4 o;
uniform sampler2D uTex; uniform float uMaster;
void main(){
  vec4 s = texture(uTex, vUv);
  float al = vC.a * uMaster;
  o = vec4(s.rgb * vC.rgb * al, s.a * al * (1. - vAdd));
}`;

  // ───────────────────────── Tekenwerk (atlas) ─────────────────────────
  function rr(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
  }
  function lin(x, x0, y0, x1, y1, stops) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }

  function tekenTegel(x, k, W, H) {
    const pal = PAL[k];
    const px = 14;
    const fw = W - 28;
    const fh = H - 50;
    // dikke onderrand
    rr(x, px, 36, fw, fh, 50);
    x.fillStyle = pal[2];
    x.fill();
    x.lineWidth = 12;
    x.strokeStyle = INK;
    x.lineJoin = 'round';
    x.stroke();
    // voorvlak
    rr(x, px, 12, fw, fh, 50);
    if (k === 4) {
      x.fillStyle = lin(x, 0, 0, W, H, [0, '#ff8aa8', 0.2, '#ffd36b', 0.4, '#a8f08a', 0.6, '#6fe6ff', 0.8, '#8f8cff', 1, '#ff8ae6']);
    } else x.fillStyle = lin(x, 0, 12, 0, 12 + fh, [0, pal[0], 1, pal[1]]);
    x.fill();
    x.lineWidth = 12;
    x.strokeStyle = INK;
    x.stroke();
    x.save();
    rr(x, px, 12, fw, fh, 50);
    x.clip();
    // diagonale glansbanen
    x.fillStyle = 'rgba(255,255,255,.17)';
    x.beginPath();
    x.moveTo(W * 0.52, 0);
    x.lineTo(W * 0.68, 0);
    x.lineTo(W * 0.34, H);
    x.lineTo(W * 0.18, H);
    x.fill();
    x.beginPath();
    x.moveTo(W * 0.74, 0);
    x.lineTo(W * 0.8, 0);
    x.lineTo(W * 0.46, H);
    x.lineTo(W * 0.4, H);
    x.fill();
    // onderschaduw in het vlak
    x.fillStyle = lin(x, 0, 12 + fh * 0.6, 0, 12 + fh, [0, 'rgba(0,0,0,0)', 1, 'rgba(40,10,60,.32)']);
    x.fillRect(0, 12, W, fh);
    // gloss
    rr(x, px + 12, 20, fw - 24, fh * 0.42, 34);
    x.fillStyle = lin(x, 0, 20, 0, 20 + fh * 0.42, [0, 'rgba(255,255,255,.62)', 1, 'rgba(255,255,255,.06)']);
    x.fill();
    x.restore();
    // lichte binnenrand
    rr(x, px + 9, 21, fw - 18, fh - 18, 42);
    x.lineWidth = 5;
    x.strokeStyle = 'rgba(255,255,255,.4)';
    x.stroke();
    // klinknagels
    x.fillStyle = pal[3];
    for (const [cx, cy] of [[px + 26, 36], [px + fw - 26, 36], [px + 26, 12 + fh - 24], [px + fw - 26, 12 + fh - 24]]) {
      x.beginPath();
      x.arc(cx, cy, 6.5, 0, TWEE_PI);
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = INK;
      x.stroke();
    }
  }

  function tekenScheur(x, W, H, seed) {
    const r = mulberry(seed * 977 + 13);
    const cx = W * (0.42 + r() * 0.16);
    const cy = H * (0.4 + r() * 0.12);
    x.save();
    rr(x, 14, 12, W - 28, H - 50, 50);
    x.clip();
    const lijnen = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      let a = (i / n) * TWEE_PI + (r() - 0.5) * 0.5;
      let px = cx;
      let py = cy;
      const pts = [[px, py]];
      const len = 90 + r() * 140;
      let l = 0;
      while (l < len) {
        const st = 16 + r() * 22;
        a += (r() - 0.5) * 0.9;
        px += Math.cos(a) * st;
        py += Math.sin(a) * st;
        l += st;
        pts.push([px, py]);
      }
      lijnen.push(pts);
    }
    x.lineJoin = 'round';
    x.lineCap = 'round';
    for (const [bk, kl] of [[16, INK], [7, '#ffffff']]) {
      x.lineWidth = bk;
      x.strokeStyle = kl;
      x.beginPath();
      for (const pts of lijnen) {
        x.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
      }
      x.stroke();
    }
    // gat in het midden
    x.fillStyle = INK;
    x.beginPath();
    x.arc(cx, cy, 20, 0, TWEE_PI);
    x.fill();
    x.restore();
  }

  function tekenGun(x, W, H) {
    x.lineJoin = 'round';
    x.lineCap = 'round';
    const lw = 10;
    const uit = (pad, fill) => {
      x.fillStyle = fill;
      x.fill();
      x.lineWidth = lw;
      x.strokeStyle = INK;
      x.stroke();
    };
    // kolf (oranje)
    x.beginPath();
    x.moveTo(96, 176);
    x.bezierCurveTo(70, 210, 70, 262, 84, 296);
    x.bezierCurveTo(100, 306, 150, 306, 170, 292);
    x.bezierCurveTo(176, 250, 186, 214, 198, 178);
    x.closePath();
    uit(0, lin(x, 70, 180, 180, 300, [0, '#ffc04a', 0.55, '#ff8a12', 1, '#d94a00']));
    x.strokeStyle = 'rgba(120,40,0,.55)';
    x.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(98 + i * 12, 214 + i * 4);
      x.lineTo(88 + i * 16, 288);
      x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,.55)';
    x.lineWidth = 9;
    x.beginPath();
    x.moveTo(176, 188);
    x.bezierCurveTo(170, 220, 166, 250, 162, 276);
    x.stroke();
    // kogelvanger onder de kolf
    x.beginPath();
    x.arc(128, 298, 12, 0, TWEE_PI);
    uit(0, '#ffd75e');
    // trekkerbeugel
    x.beginPath();
    x.moveTo(206, 190);
    x.bezierCurveTo(206, 250, 254, 250, 262, 196);
    x.lineWidth = 14;
    x.strokeStyle = INK;
    x.stroke();
    x.lineWidth = 6;
    x.strokeStyle = '#9fb0cc';
    x.stroke();
    x.beginPath();
    x.moveTo(236, 196);
    x.lineTo(228, 226);
    x.lineWidth = 12;
    x.strokeStyle = INK;
    x.stroke();
    x.lineWidth = 5;
    x.strokeStyle = '#ffe9a0';
    x.stroke();
    // loop
    rr(x, 246, 94, 252, 56, 18);
    uit(0, lin(x, 0, 94, 0, 150, [0, '#f4f8ff', 0.35, '#b9c8e0', 1, '#5f7096']));
    rr(x, 260, 98, 200, 10, 5);
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fill();
    // onderliggende stang
    rr(x, 250, 142, 150, 26, 12);
    uit(0, lin(x, 0, 142, 0, 168, [0, '#aebcd6', 1, '#59688c']));
    // snuit
    rr(x, 470, 86, 34, 74, 12);
    uit(0, lin(x, 0, 86, 0, 160, [0, '#8c9bb8', 1, '#2d3a5a']));
    x.beginPath();
    x.ellipse(498, 123, 6, 22, 0, 0, TWEE_PI);
    x.fillStyle = '#0a0518';
    x.fill();
    // korrel
    x.beginPath();
    x.moveTo(444, 94);
    x.lineTo(458, 94);
    x.lineTo(452, 70);
    x.closePath();
    uit(0, '#ffd75e');
    // frame
    rr(x, 90, 96, 190, 96, 30);
    uit(0, lin(x, 0, 96, 0, 192, [0, '#f1f6ff', 0.4, '#b0c0dc', 1, '#53628a']));
    rr(x, 102, 104, 120, 11, 5);
    x.fillStyle = 'rgba(255,255,255,.8)';
    x.fill();
    // cilinder (goud)
    rr(x, 176, 84, 104, 118, 28);
    uit(0, lin(x, 176, 0, 280, 0, [0, '#ffe58a', 0.35, '#ffc61e', 0.75, '#c9840d', 1, '#8a5200']));
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.ellipse(228, 110 + i * 38, 26, 12, 0, 0, TWEE_PI);
      x.fillStyle = '#6b3a00';
      x.fill();
      x.lineWidth = 5;
      x.strokeStyle = INK;
      x.stroke();
    }
    rr(x, 186, 92, 18, 98, 8);
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.fill();
    // haan
    x.beginPath();
    x.moveTo(94, 108);
    x.bezierCurveTo(70, 96, 52, 82, 44, 56);
    x.bezierCurveTo(60, 48, 78, 50, 100, 70);
    x.lineTo(124, 98);
    x.closePath();
    uit(0, lin(x, 44, 56, 120, 100, [0, '#6e7fa6', 1, '#2d3a5a']));
    // schroef
    x.beginPath();
    x.arc(116, 150, 11, 0, TWEE_PI);
    uit(0, '#ffd75e');
    x.beginPath();
    x.moveTo(110, 150);
    x.lineTo(122, 150);
    x.lineWidth = 3;
    x.strokeStyle = INK;
    x.stroke();
  }

  function tekenMount(x, W, H) {
    x.lineJoin = 'round';
    rr(x, 14, H - 70, W - 28, 56, 20);
    x.fillStyle = lin(x, 0, H - 70, 0, H - 14, [0, '#ffd75e', 1, '#d08a10']);
    x.fill();
    x.lineWidth = 10;
    x.strokeStyle = INK;
    x.stroke();
    x.beginPath();
    x.moveTo(52, H - 66);
    x.bezierCurveTo(60, 20, W - 60, 20, W - 52, H - 66);
    x.closePath();
    x.fillStyle = lin(x, 0, 20, 0, H - 66, [0, '#c9a6ff', 1, '#6a2fd0']);
    x.fill();
    x.stroke();
    x.beginPath();
    x.moveTo(84, H - 90);
    x.bezierCurveTo(92, 52, W / 2 - 10, 40, W / 2 - 20, 52);
    x.lineWidth = 9;
    x.strokeStyle = 'rgba(255,255,255,.55)';
    x.stroke();
    x.fillStyle = INK;
    for (const bx of [44, W - 44]) {
      x.beginPath();
      x.arc(bx, H - 42, 7, 0, TWEE_PI);
      x.fill();
    }
  }

  function tekenBurst(x, W, H, woord, kleurA, kleurB, seed) {
    const r = mulberry(seed * 31 + 7);
    const cx = W / 2;
    const cy = H / 2;
    const n = 15;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * TWEE_PI - Math.PI / 2;
      const rr0 = i % 2 === 0 ? 0.96 + r() * 0.1 : 0.62 + r() * 0.06;
      pts.push([cx + Math.cos(a) * rr0 * (W / 2 - 14), cy + Math.sin(a) * rr0 * (H / 2 - 14)]);
    }
    const pad = () => {
      x.beginPath();
      x.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
      x.closePath();
    };
    x.lineJoin = 'round';
    pad();
    x.lineWidth = 26;
    x.strokeStyle = INK;
    x.stroke();
    pad();
    x.fillStyle = lin(x, 0, 0, 0, H, [0, kleurA, 1, kleurB]);
    x.fill();
    x.save();
    x.translate(cx, cy);
    x.scale(0.82, 0.82);
    x.translate(-cx, -cy);
    pad();
    x.lineWidth = 6;
    x.strokeStyle = 'rgba(255,255,255,.55)';
    x.stroke();
    x.restore();
    x.save();
    x.translate(cx, cy + 4);
    x.rotate(-0.1);
    let fs = 128;
    const A = SPO.__artF;
    x.font = `900 italic ${fs}px ${A}`;
    const mw = x.measureText(woord).width;
    fs = Math.min(fs, (fs * (W * 0.7)) / mw);
    x.font = `900 italic ${fs}px ${A}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 22;
    x.strokeStyle = INK;
    x.strokeText(woord, 0, 6);
    x.fillStyle = '#ffffff';
    x.fillText(woord, 0, 0);
    x.restore();
  }

  function tekenGlow(x, S) {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,.55)');
    g.addColorStop(0.65, 'rgba(255,255,255,.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  }
  function tekenRing(x, S) {
    const g = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,.05)');
    g.addColorStop(0.8, 'rgba(255,255,255,.95)');
    g.addColorStop(0.9, 'rgba(255,255,255,.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  }
  function tekenSter(x, S) {
    const c = S / 2;
    const maak = (n, ro, ri, rot) => {
      x.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * TWEE_PI + rot;
        const r = i % 2 === 0 ? ro : ri;
        x[i === 0 ? 'moveTo' : 'lineTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      x.closePath();
    };
    const g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#fff3a0');
    g.addColorStop(0.7, '#ffae2e');
    g.addColorStop(1, '#ff6a00');
    maak(8, c * 0.98, c * 0.3, 0.1);
    x.fillStyle = g;
    x.fill();
    maak(4, c * 0.98, c * 0.14, Math.PI / 4);
    x.fillStyle = 'rgba(255,255,255,.9)';
    x.fill();
    x.beginPath();
    x.arc(c, c, c * 0.28, 0, TWEE_PI);
    x.fillStyle = '#fff';
    x.fill();
  }
  function tekenRet(x, S) {
    const c = S / 2;
    x.lineCap = 'round';
    for (const [lw, kl] of [[22, INK], [11, '#ff3d3d'], [4, '#ffffff']]) {
      x.lineWidth = lw;
      x.strokeStyle = kl;
      x.beginPath();
      x.arc(c, c, c * 0.62, 0, TWEE_PI);
      x.stroke();
      x.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        x.moveTo(c + Math.cos(a) * c * 0.42, c + Math.sin(a) * c * 0.42);
        x.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
      }
      x.stroke();
    }
    x.beginPath();
    x.arc(c, c, 7, 0, TWEE_PI);
    x.fillStyle = '#ff3d3d';
    x.fill();
  }
  function tekenStreak(x, W, H) {
    x.fillStyle = lin(x, 0, 0, W, 0, [0, 'rgba(255,230,150,0)', 0.7, 'rgba(255,240,190,.8)', 1, 'rgba(255,255,255,1)']);
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = lin(x, 0, 0, 0, H, [0, 'rgba(0,0,0,0)', 0.35, 'rgba(0,0,0,.55)', 0.5, 'rgba(0,0,0,1)', 0.65, 'rgba(0,0,0,.55)', 1, 'rgba(0,0,0,0)']);
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
  }
  function tekenBolt(x, S) {
    const r = mulberry(5);
    const pts = [[S / 2, S]];
    let px = S / 2;
    for (let y = S - 28; y > 0; y -= 26) {
      px = klem(px + (r() - 0.5) * 70, S * 0.2, S * 0.8);
      pts.push([px, y]);
    }
    pts.push([S / 2 + (r() - 0.5) * 30, 0]);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    for (const [lw, kl, bl] of [[22, 'rgba(90,170,255,.6)', 10], [10, 'rgba(180,230,255,1)', 2], [4, '#ffffff', 0]]) {
      x.lineWidth = lw;
      x.strokeStyle = kl;
      x.shadowColor = '#5ab4ff';
      x.shadowBlur = bl;
      x.beginPath();
      x.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
      x.stroke();
    }
    x.shadowBlur = 0;
  }

  // ───────────────────────── De opening ─────────────────────────
  SPO.openingen.schiet = {
    naam: 'schiet',
    shaders: {
      arena: { vs: VS_VOL, fs: FS_ARENA, teken: 'vol' },
      spr: { vs: VS_SPR, fs: FS_SPR, teken: 'inst' },
    },

    tijdlijn(d) {
      const p = maakPlan(d);
      const { M, P, F, E, K0, hes, TH } = p;
      const fotos = [0.8, p.T0 - 0.9, p.T0 - 0.05, TH[0] + 0.05, TH[0] + 0.45, P[Math.max(0, M - 5)] + 0.5];
      if (!p.snel) {
        fotos.push(P[M - 3] + 0.5, P[M - 2] + 0.6, P[M - 1] + 0.1, P[M - 1] + 0.7, F[M - 1] - 0.15, TH[M - 1] + 0.1, F[M - 1] + 0.5);
      } else fotos.push(P[M - 2] + 0.3, P[M - 1] + 0.1, TH[M - 1] + 0.1);
      fotos.push(E - 0.15, E + 0.12, E + 0.6, K0 - 0.12);
      const r = { E, K0, staart: 0.5, fotos };
      if (!p.snel) {
        r.pauzes = Array.from(P);
        r.klikHint = 'Klik om te schieten';
        r.pauzeAuto = 12;
      }
      return r;
    },

    *art(d, h) {
      const A = h.art;
      SPO.__artF = A.F_SPORT;
      const cv = A.nieuw(2048, 2048);
      const x = cv.getContext('2d');
      const R = {};
      let cx0 = 0;
      let cy0 = 0;
      let rh = 0;
      const G = 8;
      const plaats = (naam, w, h2) => {
        if (cx0 + w > 2048) {
          cx0 = 0;
          cy0 += rh + G;
          rh = 0;
        }
        R[naam] = [cx0, cy0, w, h2];
        const o = R[naam];
        cx0 += w + G;
        rh = Math.max(rh, h2);
        return o;
      };
      const op = (naam, w, h2, fn) => {
        const r = plaats(naam, w, h2);
        x.save();
        x.translate(r[0], r[1]);
        x.beginPath();
        x.rect(0, 0, w, h2);
        x.clip();
        fn(x, w, h2);
        x.restore();
      };
      const TW = 352;
      const TH2 = 288;
      for (let k = 0; k < 5; k++) op('tile' + k, TW, TH2, (c2, w, h2) => tekenTegel(c2, k, w, h2));
      yield;
      for (let k = 0; k < 3; k++) op('crack' + k, TW, TH2, (c2, w, h2) => tekenScheur(c2, w, h2, k + 1));
      op('glow', 256, 256, (c2) => tekenGlow(c2, 256));
      op('ring', 256, 256, (c2) => tekenRing(c2, 256));
      op('star', 256, 256, (c2) => tekenSter(c2, 256));
      op('ret', 256, 256, (c2) => tekenRet(c2, 256));
      yield;
      // cijfers 0-9 en de komma
      const ADV = [];
      const glyphs = '0123456789,';
      for (let j = 0; j < 11; j++) {
        op('d' + j, 176, 256, (c2) => {
          c2.font = `900 italic 215px ${A.F_SPORT}`;
          c2.textAlign = 'center';
          c2.textBaseline = 'alphabetic';
          c2.lineJoin = 'round';
          const ch = glyphs[j];
          const w = c2.measureText(ch).width;
          ADV[j] = w + 14;
          const gx = 88;
          const gy = 203;
          c2.lineWidth = 34;
          c2.strokeStyle = '#0a0420';
          c2.strokeText(ch, gx, gy + 9);
          c2.lineWidth = 30;
          c2.strokeStyle = INK;
          c2.strokeText(ch, gx, gy);
          c2.fillStyle = lin(c2, 0, 53, 0, 203, [0, '#ffffff', 0.55, '#fff6d6', 1, '#ffd98a']);
          c2.fillText(ch, gx, gy);
        });
      }
      yield;
      const BK = [['#ffe94a', '#ff9a1a'], ['#ffffff', '#ffc14a'], ['#8af2ff', '#2f7bff'], ['#ff8ad0', '#ff3d6a'], ['#c8ff6a', '#2bc46a']];
      for (let j = 0; j < 5; j++) op('b' + j, 352, 224, (c2, w, h2) => tekenBurst(c2, w, h2, WOORDEN[j], BK[j][0], BK[j][1], j + 1));
      yield;
      op('gun', 520, 310, tekenGun);
      op('mount', 280, 150, tekenMount);
      op('streak', 256, 48, tekenStreak);
      op('bolt', 256, 256, (c2) => tekenBolt(c2, 256));
      yield;
      // titels
      op('capBig', 1000, 280, (c2, w, h2) => {
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        c2.lineJoin = 'round';
        const regels = ['WELK CIJFER', 'BLIJFT OVER?'];
        for (let i = 0; i < 2; i++) {
          const y = 76 + i * 128;
          let f1 = 128;
          c2.font = `900 italic ${f1}px ${A.F_SPORT}`;
          const m1 = c2.measureText(regels[i]).width;
          if (m1 > w - 70) f1 *= (w - 70) / m1;
          c2.font = `900 italic ${f1}px ${A.F_SPORT}`;
          c2.lineWidth = 34;
          c2.strokeStyle = '#0a0420';
          c2.strokeText(regels[i], w / 2, y + 8);
          c2.strokeStyle = INK;
          c2.lineWidth = 28;
          c2.strokeText(regels[i], w / 2, y);
          c2.fillStyle = lin(c2, 0, y - 60, 0, y + 60, [0, '#ffffff', 0.5, '#fff3b0', 1, i ? '#ffb02e' : '#ffd34a']);
          c2.fillText(regels[i], w / 2, y);
        }
      });
      op('plate', 900, 140, (c2, w, h2) => {
        rr(c2, 10, 10, w - 20, h2 - 20, 30);
        c2.fillStyle = lin(c2, 0, 10, 0, h2, [0, '#3a1a78', 1, '#1b0a45']);
        c2.fill();
        c2.lineWidth = 8;
        c2.strokeStyle = '#ffd24a';
        c2.stroke();
        rr(c2, 4, 4, w - 8, h2 - 8, 34);
        c2.lineWidth = 6;
        c2.strokeStyle = INK;
        c2.stroke();
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        const vak = String(d.vak || '').toUpperCase();
        const onder = String(d.onder || '').toUpperCase();
        let fs = onder ? 66 : 84;
        c2.font = `900 ${fs}px ${A.F_SPORT}`;
        const mw = c2.measureText(vak).width;
        if (mw > w - 90) fs *= (w - 90) / mw;
        c2.font = `900 ${fs}px ${A.F_SPORT}`;
        c2.fillStyle = '#ffffff';
        c2.fillText(vak, w / 2, onder ? 50 : h2 / 2 + 2);
        if (onder) {
          let f2 = 36;
          c2.font = `700 ${f2}px ${A.F_SPORT}`;
          const m2 = c2.measureText(onder).width;
          if (m2 > w - 90) f2 *= (w - 90) / m2;
          c2.font = `700 ${f2}px ${A.F_SPORT}`;
          c2.fillStyle = '#ffd24a';
          c2.fillText(onder, w / 2, 100);
        }
      });
      yield;
      op('capSmall', 1400, 130, (c2, w, h2) => {
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        c2.lineJoin = 'round';
        const t = 'WELK CIJFER BLIJFT OVER?';
        let f1 = 98;
        c2.font = `900 italic ${f1}px ${A.F_SPORT}`;
        const m1 = c2.measureText(t).width;
        if (m1 > w - 60) f1 *= (w - 60) / m1;
        c2.font = `900 italic ${f1}px ${A.F_SPORT}`;
        c2.lineWidth = 26;
        c2.strokeStyle = '#0a0420';
        c2.strokeText(t, w / 2, h2 / 2 + 8);
        c2.lineWidth = 20;
        c2.strokeStyle = INK;
        c2.strokeText(t, w / 2, h2 / 2);
        c2.fillStyle = lin(c2, 0, 20, 0, 110, [0, '#ffffff', 1, '#ffd34a']);
        c2.fillText(t, w / 2, h2 / 2);
      });
      if (cy0 + rh > 2048) console.warn('[schiet] atlas te klein', cy0 + rh);
      const rect = {};
      for (const k in R) rect[k] = [R[k][0] / 2048, R[k][1] / 2048, (R[k][0] + R[k][2]) / 2048, (R[k][1] + R[k][3]) / 2048, R[k][2], R[k][3]];
      return { atlas: cv, rect, adv: ADV };
    },

    maak(c) {
      const d = c.d;
      const gl = c.gl;
      const PL = maakPlan(d);
      const { N, M, real, txt, tier, KD, T0, hes, P, F, TH, TS, TF, E, K0, snel } = PL;
      const sp = c.prog('spr');
      const ar = c.prog('arena');
      const tex = c.tekstuur(c.art.atlas, { mip: true });
      const RC = c.art.rect;
      const ADV = c.art.adv;
      const names = Object.keys(RC);
      const ID = {};
      const RU = new Float32Array(names.length * 4);
      const RW = new Float32Array(names.length);
      const RHt = new Float32Array(names.length);
      names.forEach((nm, i) => {
        ID[nm] = i;
        for (let q = 0; q < 4; q++) RU[i * 4 + q] = RC[nm][q];
        RW[i] = RC[nm][4];
        RHt[i] = RC[nm][5];
      });
      const DUR = snel ? 0.5 : 0.75;
      const S1 = M; // stages 0..M
      const PX = new Float32Array(N * (M + 1));
      const PY = new Float32Array(N * (M + 1));
      const SZ = new Float32Array(M + 1);
      // gun
      const gun = { x: 0, y: -0.33, sc: 0.0007, reach: 0.24 };
      const GPX = 150, GPY = 205, GCX = 260, GCY = 155, GMX = 505, GMY = 122;
      const regioFlags = { asp: -1 };
      let lastAsp = -1;
      let FLYS = 0.4;
      const FLYY = 0.0;
      // aim segments
      const MAXSEG = 64;
      const SG_T = new Float64Array(MAXSEG), SG_A = new Float32Array(MAXSEG), SG_X = new Float32Array(MAXSEG), SG_Y = new Float32Array(MAXSEG), SG_D = new Float32Array(MAXSEG);
      const SG_K = new Int16Array(MAXSEG);
      let NSEG = 0;
      const FL_T = new Float64Array(MAXSEG), FL_S = new Float32Array(MAXSEG);
      let NFL = 0;
      const SHOT_SEG0 = new Int16Array(M + 1);
      const TIN = new Float32Array(N);
      const stag = snel ? 0.045 : 0.09;
      for (let i = 0; i < N; i++) TIN[i] = (snel ? 0.3 : 1.2) + i * stag;
      const ANG0 = Math.PI / 2;

      function bouwLayout() {
        const A = c.asp;
        lastAsp = A;
        const port = A < 1;
        const W = Math.min(A * 0.93, 1.75);
        const Hh = port ? 0.58 : 0.43;
        const cy = port ? 0.1 : 0.15;
        gun.reach = port ? Math.min(0.26, A * 0.52) : 0.36;
        gun.sc = gun.reach / 355;
        gun.y = port ? -0.335 : -0.29;
        FLYS = Math.min(0.44, A * 0.56);
        for (let s = 0; s <= M; s++) {
          const r = N - s;
          let best = -1, bRows = 1;
          for (let rows = 1; rows <= r; rows++) {
            const cols = Math.ceil(r / rows);
            const z = Math.min(W / (cols * 1.44), Hh / (rows * 1.24));
            if (z > best + 1e-6) {
              best = z;
              bRows = rows;
            }
          }
          const sz = Math.min(best, port ? 0.36 : 0.3);
          SZ[s] = sz;
          const rows = bRows;
          const cols = Math.ceil(r / rows);
          let slot = 0;
          const pitchX = 1.44 * sz;
          const pitchY = 1.24 * sz;
          for (let i = 0; i < N; i++) {
            if (!(KD[i] < 0 || KD[i] >= s)) {
              PX[s * N + i] = PX[(s > 0 ? s - 1 : 0) * N + i];
              PY[s * N + i] = PY[(s > 0 ? s - 1 : 0) * N + i];
              continue;
            }
            const row = Math.floor(slot / cols);
            const inRow = row === rows - 1 ? r - cols * (rows - 1) : cols;
            const col = slot - row * cols;
            PX[s * N + i] = (col - (inRow - 1) / 2) * pitchX;
            PY[s * N + i] = cy + ((rows - 1) / 2 - row) * pitchY;
            slot++;
          }
        }
        bouwSegs();
      }
      function aimHoek(wx, wy, face) {
        const dx = wx - gun.x, dy = wy - gun.y;
        const D = Math.max(0.05, Math.hypot(dx, dy));
        const e = (GPY - GMY) * gun.sc;
        return Math.atan2(dy, dx) - face * Math.asin(Math.min(0.85, e / D));
      }
      function bouwSegs() {
        NSEG = 0;
        NFL = 0;
        let face = 1;
        for (let k = 0; k < M; k++) {
          SHOT_SEG0[k] = NSEG;
          const tgt = PL.order[k];
          const pl = [];
          const hk = hes[k];
          const base = P[k];
          if (hk === 0) pl.push(0, tgt);
          else if (hk === 1) pl.push(0, real, 0.42, tgt);
          else if (hk === 2) pl.push(0, real, 0.4, tgt);
          else pl.push(0, real, 0.5, tgt, 0.8, real, 1.04, tgt);
          for (let q = 0; q < pl.length; q += 2) {
            const w = pl[q + 1];
            const wx = PX[k * N + w], wy = PY[k * N + w];
            const raw = Math.atan2(wy - gun.y, wx - gun.x);
            let nf = face;
            if (raw <= 1.2) nf = 1;
            else if (raw >= 1.94) nf = -1;
            if (nf !== face && NFL < MAXSEG) {
              FL_T[NFL] = base + pl[q];
              FL_S[NFL] = nf;
              NFL++;
            }
            face = nf;
            if (NSEG < MAXSEG) {
              SG_T[NSEG] = base + pl[q];
              SG_A[NSEG] = aimHoek(wx, wy, face);
              SG_X[NSEG] = wx;
              SG_Y[NSEG] = wy;
              SG_D[NSEG] = hk === 3 && q > 0 ? 0.2 : 0.27;
              SG_K[NSEG] = k;
              NSEG++;
            }
          }
        }
        SHOT_SEG0[M] = NSEG;
      }

      // positie van een tegel op tijd t
      const V = { x: 0, y: 0, s: 0 };
      function tilePos(i, t) {
        let cur = 0;
        while (cur < M && t >= TS[cur]) cur++;
        const kd = KD[i];
        const lastS = kd >= 0 && kd < cur ? kd : cur;
        const start = Math.max(1, lastS - 3);
        let x = PX[(start - 1) * N + i], y = PY[(start - 1) * N + i], s = SZ[start - 1];
        for (let k = start; k <= lastS; k++) {
          const g = gres((t - TS[k - 1]) / DUR);
          const tx = PX[k * N + i], ty = PY[k * N + i];
          x = tx + (x - tx) * g;
          y = ty + (y - ty) * g;
          s = SZ[k] + (s - SZ[k]) * g;
        }
        if (kd < 0 && t >= TF) {
          const g = gres((t - TF) / 0.7);
          x = x * g;
          y = FLYY + (y - FLYY) * g;
          s = FLYS + (s - FLYS) * g;
        }
        V.x = x;
        V.y = y;
        V.s = s;
      }

      // camera: pure functie van t
      const CAM = { x: 0, y: 0, z: 1 };
      function camera(t) {
        let z = 1 + 0.04 * sm(t, T0, F[M - 1]) + 0.045 * sm(t, TF, E);
        let q = 9;
        for (let k = M - 1; k >= 0; k--) {
          if (t >= TH[k]) {
            q = t - TH[k];
            z += (0.008 + 0.0022 * k) * Math.exp(-q * 9);
            break;
          }
        }
        z += 0.06 * sm(t, E + 0.9, K0);
        CAM.z = z;
      }
      const TENS_N = { v: 0 };
      function spanning(t) {
        let n = 0;
        for (let k = 0; k < M; k++) {
          if (t >= TH[k]) n = k + 1;
          else {
            n += ramp(t, P[k], F[k]) * 0.6;
            break;
          }
        }
        return Math.pow(klem(n / M, 0, 1), 1.5);
      }

      // ── sprites ──
      const A_ = new Float32Array(MAXS * 4), B_ = new Float32Array(MAXS * 4), C_ = new Float32Array(MAXS * 4), D_ = new Float32Array(MAXS * 4);
      let ns = 0;
      let master = 1;
      function flush() {
        if (!ns) return;
        sp.v4s('uA[0]', A_);
        sp.v4s('uB[0]', B_);
        sp.v4s('uC[0]', C_);
        sp.v4s('uD[0]', D_);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, ns);
        ns = 0;
      }
      function spr(id, x, y, hw, hgt, rot, r, g, b, a, add) {
        if (a <= 0.003) return;
        if (ns >= MAXS) flush();
        const i = ns * 4;
        A_[i] = x;
        A_[i + 1] = y;
        A_[i + 2] = hw;
        A_[i + 3] = hgt;
        const k = id * 4;
        B_[i] = RU[k];
        B_[i + 1] = RU[k + 1];
        B_[i + 2] = RU[k + 2];
        B_[i + 3] = RU[k + 3];
        C_[i] = r;
        C_[i + 1] = g;
        C_[i + 2] = b;
        C_[i + 3] = a;
        D_[i] = Math.cos(rot);
        D_[i + 1] = Math.sin(rot);
        D_[i + 2] = add;
        D_[i + 3] = 0;
        ns++;
      }
      // sprite met breedte uit beeldverhouding van het atlasvak: hoogte = hgt (wereld)
      function sprH(id, x, y, hgt, rot, r, g, b, a, add) {
        spr(id, x, y, (hgt * 0.5 * RW[id]) / RHt[id], hgt * 0.5, rot, r, g, b, a, add);
      }

      // ── deeltjesbronnen ──
      const emSh = [], emSp = [], emOrg = [];
      for (let k = 0; k < M; k++) {
        const ti = tier[PL.order[k]];
        const nS = Math.round(22 + 3.5 * k);
        const sh = c.e({ mode: 5, t0: TS[k], delay: 0.02, life: 1.5, n: nS, org: [0, 0], angle: 0, spread: TWEE_PI, spd: [0.18, 0.6 + 0.05 * k], grav: [0, -1.1], drag: 0.7, size: [0.007, 0.017], col1: TC[ti][0], col2: TC[ti][1], blend: 'alpha', seed: 100 + k });
        const spk = c.e({ mode: 0, t0: TS[k], delay: 0.01, life: 0.65, n: 28 + 9 * k, org: [0, 0], angle: 0, spread: TWEE_PI, spd: [0.3, 0.85 + 0.1 * k], grav: [0, -0.6], drag: 1.4, size: [0.002, 0.005], col1: [1, 0.88, 0.45], col2: [1, 1, 1], seed: 200 + k });
        emSh.push(sh);
        emSp.push(spk);
      }
      function zetOrgs() {
        for (let k = 0; k < M; k++) {
          tilePos(PL.order[k], TS[k] - 0.001);
          camera(TS[k]);
          const sx = V.x * CAM.z, sy = V.y * CAM.z;
          emSh[k].org[0] = emSp[k].org[0] = sx;
          emSh[k].org[1] = emSp[k].org[1] = sy;
        }
      }
      // finale-bronnen (kleur van het niveau; pas vanaf E gebruikt)
      const tr = PL.tier[real];
      const fin = [];
      const KLc = c.kl;
      {
        const sc2 = snel ? 0.6 : 1;
        const spk = (n, spd, sd, t0, c1, c2) => c.e({ mode: 0, t0, delay: 0.06, life: 1.5, n: Math.round(n * sc2), org: [0, FLYY], angle: 0, spread: TWEE_PI, spd, grav: [0, -0.35], drag: 1.3, size: [0.002, 0.0055], col1: c1, col2: c2, regen: tr === 4 ? 1 : 0, seed: sd });
        if (tr === 0) {
          fin.push(spk(70, [0.15, 0.7], 301, E, [1, 0.62, 0.28], [1, 0.85, 0.6]));
          fin.push(c.e({ mode: 5, t0: E + 0.05, delay: 0.1, life: 1.6, n: 26, org: [0, 0.05], angle: Math.PI / 2, spread: 1.6, spd: [0.25, 0.6], grav: [0, -0.5], drag: 0.8, size: [0.006, 0.012], col1: [1, 0.62, 0.28], col2: [1, 0.85, 0.6], blend: 'alpha', seed: 302, lod: false }));
          fin.push(c.e({ mode: 6, t0: E, delay: 0.1, life: 1.6, n: 14, org: [0, -0.1], angle: Math.PI / 2, spread: 2.4, spd: [0.04, 0.12], grav: [0, 0.02], drag: 1, size: [0.05, 0.1], col1: [0.55, 0.32, 0.18], col2: [0.7, 0.5, 0.3], blend: 'alpha', seed: 303 }));
        } else if (tr === 1) {
          fin.push(spk(130, [0.18, 0.95], 311, E, [0.85, 0.93, 1], [1, 1, 1]));
          fin.push(spk(60, [0.1, 0.4], 312, E + 0.25, [0.7, 0.85, 1], [1, 1, 1]));
        } else if (tr === 2) {
          fin.push(spk(190, [0.2, 1.1], 321, E, [1, 0.8, 0.3], [1, 0.97, 0.8]));
          fin.push(c.e({ mode: 5, t0: E + 0.05, delay: 0.5, life: 2.0, n: 46, org: [0, 0.62], angle: -Math.PI / 2, spread: 2.2, spd: [0.1, 0.5], grav: [0, -0.7], drag: 0.5, size: [0.008, 0.016], col1: [1, 0.8, 0.2], col2: [1, 0.95, 0.55], blend: 'alpha', seed: 322 }));
        } else if (tr === 3) {
          fin.push(spk(240, [0.2, 1.3], 331, E, [0.35, 0.8, 1], [0.9, 1, 1]));
          fin.push(spk(120, [0.1, 0.5], 332, E + 0.2, [0.5, 0.6, 1], [1, 1, 1]));
        } else {
          fin.push(spk(320, [0.2, 1.5], 341, E, KLc, [1, 0.97, 0.9]));
          fin.push(c.e({ mode: 2, t0: E + 0.05, delay: 0.8, life: 2.2, n: 160, org: [0, 0.6], angle: -Math.PI / 2, spread: 1.6, spd: [0.1, 0.5], grav: [0, -0.5], drag: 0.6, size: [0.007, 0.014], col1: [1, 0.4, 0.5], col2: [0.4, 0.8, 1], blend: 'alpha', seed: 342 }));
          for (let i = 0; i < 3; i++) fin.push(c.e({ mode: 4, t0: E + 0.35 + i * 0.3, delay: 0.1, life: 1.6, n: 150, org: [(i - 1) * 0.28, 0.17 + (i % 2) * 0.05], angle: 0, spread: TWEE_PI, spd: [0.1, 0.55], grav: [0, -0.3], drag: 1.5, size: [0.002, 0.004], col1: KLc, col2: c.kl2, seed: 343 + i }));
        }
      }

      // ── gebeurtenissen: geluid, schokken, flitsen ──
      const aud = c.audio;
      const speel = (n, o) => {
        if (aud && aud.speel) aud.speel(n, o);
      };
      c.at(0.2, () => aud.whoosh(0.5));
      for (let i = 0; i < N; i++) c.at(TIN[i] + 0.06, () => speel('klik', { gain: 0.35, rate: 0.9 + i * 0.04 }));
      for (let k = 0; k < M; k++) {
        const rt = 0.92 + 0.028 * k;
        const spinT = hes[k] ? F[k] - 0.3 : P[k] + 0.03;
        c.at(spinT, () => speel('schiet-spin', { gain: 0.8, rate: 0.95 + 0.015 * k }));
        c.at(F[k], () => {
          speel('schiet-knal', { gain: 0.95, rate: rt });
          c.trillen(12 + 4 * k);
        });
        c.at(F[k] + 0.09, () => speel('schiet-scherf', { gain: 0.85, rate: 0.95 + 0.025 * k }));
        c.schok(F[k] + 0.01, 0.012 + 0.0042 * k, 0.22);
        c.flits(F[k], 0.1 + 0.025 * k, 0.03);
        if (hes[k]) {
          c.at(P[k] + 0.12, () => aud.hartslag(0.55 + 0.1 * hes[k]));
          if (hes[k] >= 2) c.at(P[k] + 0.12 + 0.62, () => aud.hartslag(0.6));
          if (hes[k] >= 3) c.at(P[k] + 0.12 + 1.15, () => aud.hartslag(0.65));
          const sg0 = SHOT_SEG0[k];
          // een zacht 'zwiep' bij elke zwaai van de loop
          for (let q = 1; q < 4; q++) c.at(P[k] + 0.4 + q * 0.01, () => {});
        }
      }
      const M1 = M - 1;
      c.at(F[M1] + 0.12, () => aud.riser(E - F[M1] - 0.12, 0.8));
      c.at(E - 0.06, () => speel('schiet-laatste', { gain: 1 }));
      c.at(E, () => {
        aud.boem(0.8);
        c.trillen([30, 20, 60]);
        if (tr === 4) c.at(E + 0.2, () => aud.vuurwerk());
      });
      const LK = [
        { fl: 0.45, sch: 0.034, gol: 0.7 },
        { fl: 0.65, sch: 0.04, gol: 0.85 },
        { fl: 0.8, sch: 0.046, gol: 1 },
        { fl: 0.95, sch: 0.052, gol: 1.1 },
        { fl: 1, sch: 0.058, gol: 1.2 },
      ][tr];
      c.schok(E, LK.sch, 0.3);
      c.flits(E, LK.fl, 0.05);
      c.golf(E, 1.4, LK.gol, 0);
      if (tr >= 3) c.golf(E + 0.12, 1.1, 0.7, 0);
      c.flits(K0 - 0.04, 0.7, 0.06);

      // ── tekenfuncties ──
      let wacht0 = 0;
      const SG = { a: 0, f: 1, x: 0, y: 0, vis: 0, lock: 0 };
      function gunStaat(t) {
        // hoek met verende zwaaien
        let a = ANG0;
        let rx = 0, ry = 0.3;
        let seg = -1;
        for (let q = 0; q < NSEG && SG_T[q] <= t; q++) {
          const g = gres((t - SG_T[q]) / SG_D[q]);
          a = SG_A[q] + (a - SG_A[q]) * g;
          rx = SG_X[q] + (rx - SG_X[q]) * gres((t - SG_T[q]) / 0.2);
          ry = SG_Y[q] + (ry - SG_Y[q]) * gres((t - SG_T[q]) / 0.2);
          seg = q;
        }
        SG.a = a;
        SG.x = rx;
        SG.y = ry;
        SG.seg = seg;
        // draairichting (spiegelen) met een korte flip
        let f = 1;
        for (let q = 0; q < NFL && FL_T[q] <= t; q++) {
          const u = ramp(t, FL_T[q], FL_T[q] + 0.14);
          f = -FL_S[q] * Math.cos(Math.PI * u) * (1);
          f = f * 1;
        }
        // eerste flip start vanaf rechts: f = -S cos(pi u), bij u=1 is dat S
        SG.f = f;
      }

      function teken(t, dt, inv, alleenArena) {
        const A = c.asp;
        if (Math.abs(A - lastAsp) > 1e-4) {
          bouwLayout();
          zetOrgs();
        }
        const wall = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
        let idle = false;
        for (let k = 0; k < M; k++) if (Math.abs(t - P[k]) < 1e-3) idle = true;
        if (alleenArena) idle = true;
        const tw = idle ? wall : t;
        camera(t);
        const tens = spanning(t);
        const afstoot = 1 - sm(t, K0 - 0.05, K0 + 0.4);
        master = afstoot;
        const dim = sm(t, TF + 0.15, E) * 0.8 * (1 - sm(t, E, E + 0.25));
        const onth = sm(t, E, E + 0.5);
        const flashBg = 0.15 * Math.exp(-Math.max(0, t - E) / 0.06) * (t >= E ? 1 : 0);
        // arena
        ar.gebruik();
        c.basis(ar);
        ar.f1('uTime', tw);
        ar.f1('uTens', tens);
        ar.f1('uOnth', t >= E ? onth : 0);
        ar.f1('uAlpha', afstoot);
        ar.f1('uDim', dim);
        ar.f1('uFlash', flashBg * LK.fl);
        ar.f3('uCam', CAM.x, CAM.y, CAM.z);
        ar.v3('uKleur', t >= E ? c.kl : ZERO3);
        c.motor.mengen('optel');
        c.motor.volledig();
        // sprites
        sp.gebruik();
        c.basis(sp);
        sp.f3('uCam', CAM.x, CAM.y, CAM.z);
        sp.f1('uMaster', master);
        sp.tex('uTex', 0, tex);
        c.motor.mengen('alpha');
        ns = 0;

        const vb = c.visB;
        // titel: groot in het begin, daarna als banner
        const capIn = veer(ramp(t, 0.25, 0.8));
        const capMv = sm(t, snel ? 0.45 : 1.0, snel ? 0.8 : 1.5);
        const capW = Math.min(1.1, A * 0.9);
        const capBigH = (capW / RW[ID.capBig]) * RHt[ID.capBig];
        const capY = 0.1 + (0.0) * capMv;
        sprH(ID.capBig, 0, capY + 0.0, capBigH * (1 - 0.0), 0, 1, 1, 1, (1 - capMv) * Math.min(1, capIn) * 1, 0);
        // banner
        const bw = Math.min(0.62, A * 0.88);
        const bh = (bw / RW[ID.capSmall]) * RHt[ID.capSmall];
        sprH(ID.capSmall, 0, 0.395 + 0.02 * (1 - capMv), bh * (0.9 + 0.1 * capMv), 0, 1, 1, 1, capMv * (1 - 0.0) * (1 - sm(t, E - 0.4, E - 0.1)), 0);
        // naamplaatje van het vak op het voorpaneel
        const pw = Math.min(0.5, A * 0.86);
        const ph = (pw / RW[ID.plate]) * RHt[ID.plate];
        const pin = veer(ramp(t, 0.5, 1.1));
        sprH(ID.plate, 0, -0.443 - 0.2 * (1 - pin), ph, 0, 1, 1, 1, 1 - sm(t, E - 0.3, E), 0);

        const tiles = !alleenArena;
        // finale: overlevende tegel, kleuren van het niveau
        if (t >= TF - 0.2 && tiles) {
          tilePos(real, t);
          const x = V.x, y = V.y, s = V.s;
          const ch = ramp(t, TF + 0.1, E);
          // witte opbouw (neutraal), daarna de kleur van het niveau
          const wa = (0.25 + 0.75 * ch) * (1 - sm(t, E, E + 0.05)) * sm(t, TF - 0.2, TF + 0.2);
          spr(ID.glow, x, y, s * 1.9, s * 1.5, 0, 0.7, 0.75, 1, wa * 0.45, 1);
          if (t >= E) {
            const q = t - E;
            const k1 = c.kl, k2 = c.kl2;
            const fa = 1 - sm(t, K0 - 0.2, K0 - 0.02);
            spr(ID.glow, x, y, s * (2.0 + 0.2 * Math.sin(q * 3)), s * 1.7, 0, k1[0], k1[1], k1[2], (0.38 * sm(t, E, E + 0.1) + 0.08) * fa, 1);
            const r1 = ramp(q, 0, 0.8), r2 = ramp(q, 0.1, 1.0);
            spr(ID.ring, x, y, s * (1.2 + 3 * r1), s * (1.2 + 3 * r1) * 0.9, 0, k1[0] * 0.9, k1[1] * 0.9, k1[2] * 0.9, (1 - r1) * (1 - r1), 1);
            spr(ID.ring, x, y, s * (1.0 + 2.2 * r2), s * (1.0 + 2.2 * r2) * 0.9, 0, k2[0] * 0.9, k2[1] * 0.9, k2[2] * 0.9, (1 - r2) * (1 - r2) * 0.7, 1);
            if (tr >= 1) {
              const r3 = ramp(q, 0.25, 1.1);
              spr(ID.ring, x, y, s * (1.0 + 3.6 * r3), s * (1.0 + 3.6 * r3), 0, 1, 1, 1, (1 - r3) * (1 - r3) * 0.4, 1);
            }
            if (tr === 3) {
              // elektrische bogen
              const fl = Math.floor(t * 22);
              for (let j = 0; j < 7; j++) {
                const on = hh(fl * 1.7 + j * 9.3) > 0.28 ? 1 : 0;
                const an = (j / 7) * TWEE_PI + hh(fl + j) * 0.5 + t * 0.4;
                const L = s * (1.1 + 0.9 * hh(fl * 3.1 + j));
                const cs = Math.cos(an), sn = Math.sin(an);
                spr(ID.bolt, x + cs * (s * 0.75 + L / 2), y + sn * (s * 0.55 + L / 2), L * 0.5, L * 0.5, an - Math.PI / 2, 1.2, 1.5, 2.2, on * sm(q, 0, 0.1) * (1 - sm(q, 1.1, 1.4)) * fa, 1);
              }
            }
          }
        }
        const amp = 0.012 + 0.05 * tens;
        const fr = 7 + 9 * tens;
        const surv = real;
        if (tiles) {
          for (let i = 0; i < N; i++) {
            const tin = TIN[i];
            if (t < tin) continue;
            const kd = KD[i];
            if (kd >= 0 && t >= TS[kd]) continue;
            tilePos(i, t);
            let x = V.x, y = V.y, s = V.s;
            const pop = veer((t - tin) / 0.55);
            let rot = (1 - pop) * (i % 2 ? 0.4 : -0.4);
            const ph0 = i * 1.7;
            rot += amp * Math.sin(tw * fr + ph0) + 0.01 * Math.sin(tw * 1.3 + ph0);
            y += 0.004 * Math.sin(tw * 1.7 + ph0) * (1 - 0.6 * tens);
            let tint = 1;
            let crack = -1;
            const lift = i === surv ? 1 : 0;
            if (kd >= 0 && t >= TH[kd]) {
              const q = (t - TH[kd]) / PL.hs;
              x += (hh(i * 3.1 + t * 60) - 0.5) * 0.006;
              y += (hh(i * 7.7 + t * 60) - 0.5) * 0.006;
              s *= 1.06 + 0.04 * Math.sin(q * 20);
              tint = 1.5;
              crack = (i + kd) % 3;
            }
            let extra = 0;
            if (i === surv && t >= TF) {
              const ch = ramp(t, TF + 0.3, E);
              x += (hh(t * 83.1) - 0.5) * 0.007 * ch;
              y += (hh(t * 71.3 + 5) - 0.5) * 0.007 * ch;
              rot += 0.02 * Math.sin(t * 40) * ch;
              if (t >= E) {
                const q = t - E;
                s *= 1 + 0.22 * Math.exp(-q * 7) * Math.cos(q * 15);
                extra = Math.exp(-q / 0.12);
              }
              s *= 1 + 0.12 * sm(t, E + 0.8, K0);
              tint = 1 + 0.05 * ch + 0.3 * extra;
            }
            s *= Math.max(0.0001, pop);
            const hgt = 1.16 * s;
            const hw = hgt * (352 / 288) * 0.5;
            const hhh = hgt * 0.5;
            // schaduw
            spr(ID.glow, x + 0.006 * s, y - 0.5 * s, hw * 1.0, hhh * 0.34, 0, 0.02, 0, 0.1, 0.5, 0);
            // lichaam
            spr(ID['tile' + tier[i]], x, y, hw, hhh, rot, tint, tint, tint, 1, 0);
            if (crack >= 0) spr(ID['crack' + crack], x, y, hw, hhh, rot, 1, 1, 1, 1, 0);
            // cijfers
            const tx = txt[i];
            let sum = 0;
            for (let j = 0; j < tx.length; j++) sum += ADV[tx[j]];
            const kk = (0.89 * s) / 256;
            let fitK = kk;
            if (sum * kk > 1.12 * s) fitK = (1.12 * s) / sum;
            const cr = Math.cos(rot), sr = Math.sin(rot);
            let cum = -sum / 2;
            for (let j = 0; j < tx.length; j++) {
              const g = tx[j];
              const ox = (cum + ADV[g] / 2) * fitK;
              cum += ADV[g];
              spr(ID['d' + g], x + ox * cr, y + ox * sr + 0.012 * s * cr, 88 * fitK, 128 * fitK, rot, tint, tint, tint, 1, 0);
            }
          }
          // brokstukken van gesneuvelde tegels (cijfers vliegen weg) + knalwoorden en schokringen
          for (let k = 0; k < M; k++) {
            if (t < TH[k] || t > TS[k] + 1.2) continue;
            const i = PL.order[k];
            tilePos(i, TS[k] - 0.001);
            const bx = V.x, by = V.y, bs = V.s;
            const qh = t - TH[k];
            // schokflits en ring
            const fl = Math.exp(-qh / 0.07);
            spr(ID.glow, bx, by, bs * 1.5, bs * 1.2, 0, 1, 0.9, 0.55, fl * (0.7 + 0.04 * k), 1);
            const ru = ramp(t, TH[k], TH[k] + 0.32);
            if (ru < 1) spr(ID.ring, bx, by, bs * (0.7 + 2.3 * ru), bs * (0.7 + 2.3 * ru), 0, 1, 0.85, 0.4, (1 - ru) * (1 - ru) * 0.9, 1);
            if (t >= TS[k]) {
              const tau = t - TS[k];
              // cijfers
              const tx = txt[i];
              let sum = 0;
              for (let j = 0; j < tx.length; j++) sum += ADV[tx[j]];
              const kkk = (0.89 * bs) / 256;
              const fitK = sum * kkk > 1.12 * bs ? (1.12 * bs) / sum : kkk;
              let cum = -sum / 2;
              const fa = 1 - sm(tau, 0.3, 0.95);
              for (let j = 0; j < tx.length; j++) {
                const g = tx[j];
                const ox = (cum + ADV[g] / 2) * fitK;
                cum += ADV[g];
                const vx = (hh(i * 5.3 + j * 1.9) - 0.5) * 0.9 + ox * 1.5;
                const vy = 0.5 + 0.5 * hh(i * 2.9 + j * 3.3);
                const gx = bx + ox + vx * tau;
                const gy = by + vy * tau - 0.9 * tau * tau;
                const rt = (hh(i * 1.1 + j) - 0.5) * 7 * tau;
                const sc3 = 1 + 0.35 * tau;
                spr(ID['d' + g], gx, gy, 88 * fitK * sc3, 128 * fitK * sc3, rt, 1, 1, 1, fa, 0);
              }
              // knalwoord
              const wk = (k + (PL.seed % 5)) % 5;
              const pp = veer(ramp(tau, 0, 0.3));
              const bf = 1 - sm(tau, 0.42, 0.7);
              const bsz = Math.min(0.17, Math.max(0.1, bs * 0.6)) * (0.9 + 0.02 * k);
              const side = (hh(k * 3.3 + 1) > 0.5 ? 1 : -1) * bs * 0.4;
              let bxx = bx + side;
              const lim = Math.max(0, A * 0.5 - bsz * 1.9 - 0.01);
              bxx = klem(bxx, -lim, lim);
              sprH(ID['b' + wk], bxx, by + bs * 0.42, bsz * pp * 2.4, (hh(k * 9.1) - 0.5) * 0.35, 1, 1, 1, bf, 0);
            }
          }
        }
        // revolver
        gunStaat(t);
        const gIn = veer(ramp(t, 1.0, 1.6)) * (1 - sm(t, F[M - 1] + 0.3, TF + 0.25));
        let gx = gun.x, gy = gun.y - 0.28 * (1 - gIn);
        let th = SG.a;
        // recoil en rilling
        let kick = 0, rk = 0;
        let hk = 0;
        for (let k = M - 1; k >= 0; k--) {
          if (t >= F[k]) {
            const q = t - F[k];
            kick = 0.035 * Math.exp(-q * 12) * (0.5 + 0.5 * Math.cos(q * 20));
            rk = 0.3 * Math.exp(-q * 10) * Math.cos(q * 16);
            break;
          }
        }
        for (let k = 0; k < M; k++) {
          if (hes[k] && t >= P[k] + 0.2 && t < F[k]) {
            const env = sm(t, P[k] + 0.2, P[k] + 0.35) * (1 - sm(t, F[k] - 0.03, F[k]));
            th += 0.012 * hes[k] * env * (Math.sin(t * 43) + 0.6 * Math.sin(t * 71 + 1.3));
          }
        }
        if (idle) th += 0.01 * Math.sin(wall * 1.9);
        const f = SG.f;
        const sgn = f >= 0 ? 1 : -1;
        const rotG = (f >= 0 ? th : th - Math.PI) + rk * sgn;
        const cg = Math.cos(rotG), sg = Math.sin(rotG);
        const dirx = Math.cos(th), diry = Math.sin(th);
        gx -= dirx * kick;
        gy -= diry * kick;
        const gs = gun.sc;
        const offx = (GCX - GPX) * gs * f, offy = (GPY - GCY) * gs;
        const ccx = gx + offx * cg - offy * sg;
        const ccy = gy + offx * sg + offy * cg;
        const mox = (GMX - GPX) * gs * f, moy = (GPY - GMY) * gs;
        const mx = gx + mox * cg - moy * sg;
        const my = gy + mox * sg + moy * cg;
        const gunA = gIn;
        // sokkel en schaduw
        spr(ID.glow, gx, gun.y - 0.044, 0.18, 0.04, 0, 0, 0, 0.05, 0.5 * gunA, 0);
        sprH(ID.mount, gx, gun.y - 0.005 - 0.3 * (1 - gIn), 0.22, 0, 1, 1, 1, 1, 0);
        spr(ID.gun, ccx, ccy, 260 * gs * f, 155 * gs, rotG, 1, 1, 1, gunA, 0);
        // richtkruis
        if (tiles && SG.seg >= 0) {
          const k = SG_K[SG.seg];
          if (t < TH[k]) {
            const q = ramp(t, SG_T[SG.seg], SG_T[SG.seg] + 0.2);
                        tilePos(PL.order[k], P[k]);
            const rs = V.s;
            spr(ID.ret, SG.x, SG.y, rs * 0.55 * (1 + (1 - q) * 0.9), rs * 0.55 * (1 + (1 - q) * 0.9), t * 1.2, 1, 1, 1, 0.95 * q * (hes[k] ? 1 : 0.9), 0);
          }
        }
        // mondingsvlam en kogelspoor
        for (let k = Math.max(0, M - 1); k >= 0; k--) {
          if (t >= F[k] && t < F[k] + 0.25) {
            const q = t - F[k];
            const sa = Math.exp(-q / 0.045);
            const sz = (0.1 + 0.012 * k) * (0.5 + veer(ramp(q, 0, 0.05)) * 0.7);
            spr(ID.glow, mx, my, sz * 1.8, sz * 1.8, 0, 1, 0.8, 0.4, sa * 0.9, 1);
            spr(ID.star, mx + dirx * 0.02, my + diry * 0.02, sz, sz, rotG + k, 1, 1, 1, sa, 0);
            // kogelspoor
            const w = SG.x, v = SG.y;
            const vx = SG.x - mx, vy = SG.y - my;
            const len = Math.hypot(vx, vy);
            const a2 = Math.atan2(vy, vx);
            const hd = ramp(q, 0, 0.045);
            const tl2 = ramp(q, 0.02, 0.08);
            const x0 = len * tl2, x1 = len * hd;
            if (x1 > x0 + 0.001) {
              const ml = (x0 + x1) / 2;
              spr(ID.streak, mx + Math.cos(a2) * ml, my + Math.sin(a2) * ml, (x1 - x0) / 2, 0.016, a2, 1, 0.95, 0.7, 1, 1);
            }
          }
          if (t >= F[k]) break;
        }
        // tegelflits
        flush();

        if (t >= TF - 0.2 && tiles) {
          tilePos(real, t);
          const x = V.x, y = V.y, s = V.s;
          // convergente flits richting de kaart
          const kc = ramp(t, K0 - 0.3, K0 - 0.02);
          if (kc > 0) {
            spr(ID.ring, x, y, s * (6 - 5.4 * kc), s * (6 - 5.4 * kc), 0, 1.6, 1.6, 1.6, 0.7 * kc, 1);
            spr(ID.glow, x, y, s * (1.6 + 2.2 * kc), s * (1.6 + 2.2 * kc), 0, 2, 2, 2, kc * kc, 1);
          }
          flush();
          // stralen
          if (t >= E) {
            const q = t - E;
            const op = [0, 0.4, 0.8, 1, 1.2][tr] * sm(q, 0, 0.3) * (1 - sm(t, K0, K0 + 0.4));
            if (op > 0.01) c.stralen(t, op * 0.6, 0.25 + 0.5 * c.I, 0.1 + 0.2 * Math.exp(-q / 0.5), 0.15, 0, y * CAM.z, t * 0.25, 0);
          }
        }
        // deeltjes
        for (let k = 0; k < M; k++) {
          if (t >= TS[k] - 0.01 && t < TS[k] + 1.8) {
            c.zend(t, emSh[k]);
            c.zend(t, emSp[k]);
          }
        }
        if (t >= E - 0.01 && t < E + 3) {
          for (let i = 0; i < fin.length; i++) {
            const x2 = fin[i];
            if (t >= x2.t0 - 0.01 && t < x2.t0 + x2.delay + x2.life + 0.1) c.zend(t, x2);
          }
        }
        // nabewerking
        c.post.vig = 1 + 0.55 * tens + 0.35 * sm(t, TF, E);
        c.post.ca = 1 + 0.8 * tens;
        if (t >= E) c.post.rad = 0.28 * Math.exp(-(t - E) / 0.22);
        c.post.zoom = 1 + 0.07 * sm(t, K0 - 0.3, K0);
      }

      zetOrgs;
      bouwLayout();
      zetOrgs();

      return {
        teken(t, dt, inv) {
          teken(t, dt, inv, false);
        },
        wacht(t) {
          teken(Math.min(1.3, 0.8 + 0 * t), 0, null, true);
        },
        schud(t) {
          return t > TF + 0.3 && t < E ? 0.0025 * ramp(t, TF + 0.3, E) : 0;
        },
        sprong(t) {
          if (snel) return undefined;
          if (t < T0 - 0.02) return { doel: T0 };
          for (let k = 0; k < M; k++) {
            if (t >= P[k] - 1e-6 && t < P[k] + 0.45) return null;
            if (k < M - 1 && t >= P[k] + 0.45 && t < P[k + 1]) return { doel: P[k + 1] };
          }
          return undefined;
        },
      };
    },
  };
})();
