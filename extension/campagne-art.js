/*
 * Somtoday Pack Opener v3.0: de tekeningen van de Campagne (canvas 2D, dus geen WebGL nodig).
 * De vier eindbazen (draak, feniks, kraken, griffioen) zijn simpel getekend met vlakken en bogen; elke wereld heeft een eigen achtergrond.
 * teken(ctx, wezen, b, h) tekent het wezen in een vak van b x h; achtergrond(ctx, wereld, b, h) de lucht en het landschap;
 * baasKaart(wezen, naam, cijfer) geeft een kaartplaatje (data-URL) in wezenstijl, voor de baaskaart in het potje.
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const KLEUR = {
    draak: ['#ff6a2b', '#9b1c0c', '#ffd24a'],
    feniks: ['#ffcc33', '#e0561b', '#fff2b8'],
    kraken: ['#8a5cff', '#3b1a8f', '#7ff3e6'],
    griffioen: ['#d9c08a', '#8a6a3a', '#ffffff'],
  };
  const pad = (ctx, f) => { ctx.beginPath(); f(ctx); };
  function vul(ctx, kleur, f) { ctx.fillStyle = kleur; pad(ctx, f); ctx.fill(); }
  function lijn(ctx, kleur, br, f) { ctx.strokeStyle = kleur; ctx.lineWidth = br; ctx.lineCap = 'round'; pad(ctx, f); ctx.stroke(); }
  const oog = (ctx, x, y, r, kleur) => { vul(ctx, '#fff', (c) => c.arc(x, y, r, 0, TAU)); vul(ctx, kleur || '#111', (c) => c.arc(x + r * 0.2, y, r * 0.55, 0, TAU)); };

  // Alles is getekend op een vak van 100 x 100; teken() schaalt.
  const WEZENS = {
    draak(c) {
      const [a, b, g] = KLEUR.draak;
      vul(c, b, (x) => { x.moveTo(40, 55); x.quadraticCurveTo(8, 10, 2, 40); x.quadraticCurveTo(18, 38, 20, 52); x.quadraticCurveTo(14, 60, 40, 66); }); // vleugel achter
      vul(c, b, (x) => { x.moveTo(60, 55); x.quadraticCurveTo(92, 6, 98, 38); x.quadraticCurveTo(84, 38, 82, 52); x.quadraticCurveTo(88, 60, 62, 66); });
      lijn(c, a, 7, (x) => { x.moveTo(50, 78); x.quadraticCurveTo(80, 92, 92, 74); x.quadraticCurveTo(96, 66, 90, 64); }); // staart
      vul(c, a, (x) => x.ellipse(50, 66, 20, 22, 0, 0, TAU)); // lijf
      vul(c, g, (x) => x.ellipse(50, 72, 11, 14, 0, 0, TAU)); // buik
      vul(c, a, (x) => x.ellipse(50, 36, 15, 13, 0, 0, TAU)); // kop
      vul(c, a, (x) => x.ellipse(50, 44, 9, 7, 0, 0, TAU)); // snuit
      vul(c, g, (x) => { x.moveTo(36, 28); x.lineTo(30, 10); x.lineTo(43, 24); }); vul(c, g, (x) => { x.moveTo(64, 28); x.lineTo(70, 10); x.lineTo(57, 24); }); // hoorns
      oog(c, 43, 34, 3.4, '#a30'); oog(c, 57, 34, 3.4, '#a30');
      vul(c, '#3a0a02', (x) => { x.arc(46, 45, 1.3, 0, TAU); x.moveTo(54, 45); x.arc(54, 45, 1.3, 0, TAU); });
      vul(c, '#ffb347', (x) => { x.moveTo(44, 50); x.quadraticCurveTo(50, 62, 56, 50); x.quadraticCurveTo(50, 54, 44, 50); }); // vuur
    },
    feniks(c) {
      const [a, b, g] = KLEUR.feniks;
      vul(c, b, (x) => { x.moveTo(50, 50); x.quadraticCurveTo(10, 8, 2, 40); x.quadraticCurveTo(14, 36, 12, 48); x.quadraticCurveTo(24, 46, 24, 58); x.quadraticCurveTo(38, 56, 50, 66); });
      vul(c, b, (x) => { x.moveTo(50, 50); x.quadraticCurveTo(90, 8, 98, 40); x.quadraticCurveTo(86, 36, 88, 48); x.quadraticCurveTo(76, 46, 76, 58); x.quadraticCurveTo(62, 56, 50, 66); });
      vul(c, a, (x) => { x.moveTo(50, 50); x.quadraticCurveTo(22, 22, 8, 40); x.quadraticCurveTo(30, 46, 50, 62); }); vul(c, a, (x) => { x.moveTo(50, 50); x.quadraticCurveTo(78, 22, 92, 40); x.quadraticCurveTo(70, 46, 50, 62); });
      for (const [dx, k] of [[-14, b], [0, a], [14, b]]) lijn(c, k, 6, (x) => { x.moveTo(50, 72); x.quadraticCurveTo(50 + dx * 1.6, 88, 50 + dx * 2, 98); }); // staartveren
      vul(c, a, (x) => x.ellipse(50, 60, 12, 20, 0, 0, TAU));
      vul(c, g, (x) => x.ellipse(50, 64, 6, 12, 0, 0, TAU));
      vul(c, a, (x) => x.arc(50, 34, 11, 0, TAU));
      vul(c, '#ff9a1f', (x) => { x.moveTo(44, 36); x.lineTo(50, 48); x.lineTo(56, 36); }); // snavel
      for (const dx of [-8, 0, 8]) vul(c, '#e0301b', (x) => { x.moveTo(50 + dx - 3, 26); x.quadraticCurveTo(50 + dx * 1.6, 8, 50 + dx + 3, 26); }); // vlammenkuif
      oog(c, 45, 32, 2.8); oog(c, 55, 32, 2.8);
    },
    kraken(c) {
      const [a, b, g] = KLEUR.kraken;
      for (let i = 0; i < 8; i++) { // tentakels
        const x0 = 24 + i * 7.5, dir = i % 2 ? 1 : -1;
        lijn(c, i % 2 ? a : b, 6.5, (x) => { x.moveTo(x0, 58); x.bezierCurveTo(x0 - dir * 16, 70, x0 + dir * 14, 82, x0 + (i - 3.5) * 5, 96); });
        vul(c, g, (x) => x.arc(x0 + (i - 3.5) * 3.4, 80, 1.4, 0, TAU));
      }
      vul(c, a, (x) => { x.moveTo(20, 60); x.bezierCurveTo(14, 4, 86, 4, 80, 60); x.quadraticCurveTo(50, 70, 20, 60); }); // kop
      vul(c, g + '44', (x) => x.ellipse(40, 24, 10, 6, -0.5, 0, TAU));
      oog(c, 38, 46, 5.2, '#20104a'); oog(c, 62, 46, 5.2, '#20104a');
      lijn(c, b, 2.2, (x) => { x.moveTo(30, 36); x.lineTo(44, 40); }); lijn(c, b, 2.2, (x) => { x.moveTo(70, 36); x.lineTo(56, 40); }); // wenkbrauwen
      for (const [px, py] of [[28, 22], [64, 18], [72, 32]]) vul(c, g + '88', (x) => x.arc(px, py, 2.2, 0, TAU));
    },
    griffioen(c) {
      const [a, b, g] = KLEUR.griffioen;
      vul(c, g, (x) => { x.moveTo(46, 52); x.quadraticCurveTo(8, 4, 2, 42); x.quadraticCurveTo(16, 36, 16, 50); x.quadraticCurveTo(28, 48, 30, 62); x.quadraticCurveTo(40, 62, 50, 70); });
      vul(c, '#dfe9f5', (x) => { x.moveTo(54, 52); x.quadraticCurveTo(92, 4, 98, 42); x.quadraticCurveTo(84, 36, 84, 50); x.quadraticCurveTo(72, 48, 70, 62); x.quadraticCurveTo(60, 62, 50, 70); });
      lijn(c, b, 6, (x) => { x.moveTo(62, 80); x.quadraticCurveTo(90, 86, 94, 70); }); vul(c, a, (x) => x.arc(94, 68, 5, 0, TAU)); // leeuwenstaart
      vul(c, a, (x) => x.ellipse(50, 68, 20, 18, 0, 0, TAU)); // lijf
      for (const dx of [-12, 12]) { vul(c, b, (x) => x.rect(50 + dx - 4, 78, 8, 18)); vul(c, '#ff9a1f', (x) => { x.moveTo(50 + dx - 7, 96); x.lineTo(50 + dx + 7, 96); x.lineTo(50 + dx + 4, 91); x.lineTo(50 + dx - 4, 91); }); }
      vul(c, '#ffffff', (x) => x.ellipse(50, 42, 14, 16, 0, 0, TAU)); // arendskop
      vul(c, '#ff9a1f', (x) => { x.moveTo(42, 44); x.quadraticCurveTo(50, 40, 58, 44); x.lineTo(50, 60); });
      vul(c, '#ffffff', (x) => { x.moveTo(40, 30); x.lineTo(34, 14); x.lineTo(46, 26); }); vul(c, '#ffffff', (x) => { x.moveTo(60, 30); x.lineTo(66, 14); x.lineTo(54, 26); });
      oog(c, 44, 38, 2.8, '#a30'); oog(c, 56, 38, 2.8, '#a30');
    },
  };

  function teken(ctx, wezen, b, h) {
    const f = WEZENS[wezen];
    if (!f) return;
    const s = Math.min(b, h) / 100;
    ctx.save();
    ctx.translate((b - 100 * s) / 2, (h - 100 * s) / 2);
    ctx.scale(s, s);
    f(ctx);
    ctx.restore();
  }

  function achtergrond(ctx, w, b, h) {
    const kleuren = {
      exact: ['#1a0604', '#7a1d08', '#ff7a2b'],
      talen: ['#2a1a05', '#b87a12', '#ffe28a'],
      mens: ['#010a1c', '#064a70', '#2fd3c4'],
      kunst: ['#0f1830', '#4a6a9c', '#e6f0ff'],
    }[w] || ['#080a14', '#1d2547', '#5fd0ff'];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, kleuren[0]); g.addColorStop(0.7, kleuren[1]); g.addColorStop(1, kleuren[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, b, h);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    if (w === 'exact') { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(b * 0.3, h * 0.45); ctx.lineTo(b * 0.42, h * 0.45); ctx.lineTo(b * 0.75, h); ctx.fill(); ctx.fillStyle = '#ff9a3c'; ctx.fillRect(b * 0.3, h * 0.42, b * 0.12, h * 0.05); }
    else if (w === 'talen') { ctx.beginPath(); ctx.arc(b * 0.78, h * 0.3, h * 0.12, 0, TAU); ctx.fillStyle = '#fff6c8'; ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 4; i++) ctx.fillRect(b * (0.1 + i * 0.12), h * 0.55, b * 0.05, h * 0.45); ctx.fillRect(b * 0.05, h * 0.5, b * 0.5, h * 0.06); }
    else if (w === 'mens') { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(b * (0.15 + i * 0.18), h * (0.2 + (i % 3) * 0.2), 4 + i, 0, TAU); ctx.stroke(); } }
    else if (w === 'kunst') { for (const [x, y, k] of [[0.1, 0.55, 0.5], [0.45, 0.4, 0.7], [0.8, 0.6, 0.45]]) { ctx.beginPath(); ctx.moveTo(b * (x - k * 0.35), h); ctx.lineTo(b * x, h * y); ctx.lineTo(b * (x + k * 0.35), h); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(b * (x - 0.05), h * (y + 0.1)); ctx.lineTo(b * x, h * y); ctx.lineTo(b * (x + 0.05), h * (y + 0.1)); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.35)'; } }
  }

  // Een kaartplaatje (data-URL, 136 x 200) voor de baaskaart: kader in de kleur van het wezen, het wezen zelf, de naam en het cijfer.
  function baasKaart(wezen, naam, cijfer, wereld) {
    if (typeof document === 'undefined') return '';
    const c = document.createElement('canvas'); c.width = 136; c.height = 200;
    const x = c.getContext('2d');
    if (!x) return '';
    const k = KLEUR[wezen] || KLEUR.draak;
    x.fillStyle = '#0d1128'; x.beginPath(); x.roundRect ? x.roundRect(2, 2, 132, 196, 12) : x.rect(2, 2, 132, 196); x.fill();
    x.save(); x.beginPath(); x.rect(8, 8, 120, 130); x.clip(); achtergrond(x, wereld, 136, 150); teken(x, wezen, 120, 130); x.restore();
    x.strokeStyle = k[2]; x.lineWidth = 4; x.beginPath(); x.roundRect ? x.roundRect(2, 2, 132, 196, 12) : x.rect(2, 2, 132, 196); x.stroke();
    x.fillStyle = '#ffffff'; x.textAlign = 'center';
    x.font = '800 15px system-ui, sans-serif'; x.fillText(String(naam).slice(0, 16), 68, 160);
    x.font = '800 26px system-ui, sans-serif'; x.fillStyle = k[2]; x.fillText(String(cijfer).replace('.', ','), 68, 188);
    return c.toDataURL('image/png');
  }

  globalThis.SPOCampagneArt = { WEZENS: Object.keys(WEZENS), teken, achtergrond, baasKaart };
})();
