// De profielkaart tekenen (canvas, 360 x 540). Gebruikt door het tabblad Profiel, de Vrienden-pagina en de winkel (voorbeelden).
(function () {
  'use strict';
  const E = globalThis.SPOEco || (globalThis.SPOEco = {});
  const BG = {
    standaard: { naam: 'Standaard', stops: ['#10163a', '#1a2160', '#3b1d70'], tekst: '#ffffff' },
    stadion: { naam: 'Stadion', stops: ['#0b3d1d', '#1c7a3a', '#0b3d1d'], tekst: '#ffffff', strepen: true },
    nacht: { naam: 'Sterrennacht', stops: ['#03030f', '#0d1240', '#2a1b66'], tekst: '#ffffff', sterren: true },
    zonsondergang: { naam: 'Zonsondergang', stops: ['#2a0a3d', '#d6407a', '#ffb36b'], tekst: '#ffffff' },
    raster: { naam: 'Neonraster', stops: ['#07060e', '#150f33', '#07060e'], tekst: '#ffffff', raster: true },
    goud: { naam: 'Goudglans', stops: ['#4a3606', '#e6b41f', '#fff1a6'], tekst: '#2a1d03' },
    regenboog: { naam: 'Regenboog', stops: ['#ff6a6a', '#ffd24a', '#6aff9a', '#6ab8ff', '#b36aff'], tekst: '#ffffff' },
  };
  const bgId = (id) => (typeof id === 'string' && BG[id.replace(/^bg-/, '')] ? id.replace(/^bg-/, '') : 'standaard');
  const bgCss = (id) => `linear-gradient(160deg, ${BG[bgId(id)].stops.join(', ')})`;
  const TIERKLEUR = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
  const TITEL = (id) => { const it = E.PER_ID && E.PER_ID.get(typeof id === 'string' && id.indexOf('ti-') === 0 ? id : 'ti-' + id); return it && it.soort === 'titel' ? it.naam : ''; };

  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // Willekeurig maar vast (zodat dezelfde kaart er steeds hetzelfde uitziet)
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // p = een schoon profiel (zie SPOEco.maakProfiel). Geeft het canvas terug.
  async function teken(canvas, p) {
    const W = 360, H = 540;
    canvas.width = W; canvas.height = H;
    try { await Promise.all([document.fonts.load('800 40px "SPO Display"'), document.fonts.load('600 14px "SPO Text"')]); } catch (e) { /* lettertype niet nodig */ }
    const c = canvas.getContext('2d');
    const bg = BG[bgId(p.bg)];
    const tk = TIERKLEUR[p.niv | 0] || TIERKLEUR[0];
    const display = '"SPO Display", system-ui, sans-serif', tekst = '"SPO Text", system-ui, sans-serif';
    c.clearRect(0, 0, W, H);
    c.save(); rr(c, 0, 0, W, H, 26); c.clip();
    const g = c.createLinearGradient(0, 0, W * 0.6, H);
    bg.stops.forEach((s, i) => g.addColorStop(i / (bg.stops.length - 1), s));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (bg.strepen) { c.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 12; i += 2) c.fillRect(0, i * 45, W, 45); }
    if (bg.sterren) { for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + rnd(i + 9) * 0.7})`; const r = 0.6 + rnd(i + 3) * 1.4; c.beginPath(); c.arc(rnd(i) * W, rnd(i + 50) * H, r, 0, 7); c.fill(); } }
    if (bg.raster) { c.strokeStyle = 'rgba(255,47,208,0.45)'; c.lineWidth = 1; for (let x = 0; x <= W; x += 30) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } c.strokeStyle = 'rgba(44,245,160,0.4)'; for (let y = 0; y <= H; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } }
    const glans = c.createRadialGradient(W * 0.3, 0, 10, W * 0.3, 0, 360);
    glans.addColorStop(0, 'rgba(255,255,255,0.22)'); glans.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glans; c.fillRect(0, 0, W, H);
    c.restore();
    c.lineWidth = 5; c.strokeStyle = tk; rr(c, 4, 4, W - 8, H - 8, 24); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.35)'; rr(c, 11, 11, W - 22, H - 22, 18); c.stroke();

    const donker = bg.tekst !== '#ffffff';
    const kleur = bg.tekst;
    c.fillStyle = 'rgba(0,0,0,' + (donker ? 0.1 : 0.28) + ')'; rr(c, 24, 24, 96, 100, 16); c.fill();
    c.textAlign = 'center'; c.fillStyle = kleur;
    c.font = `800 52px ${display}`; c.fillText(String(p.ovr || 0), 72, 84);
    c.font = `700 12px ${tekst}`; c.fillStyle = donker ? '#2a1d03' : tk;
    c.fillText((E.TIERNAMEN ? E.TIERNAMEN[p.niv | 0] : '').toUpperCase(), 72, 108);

    // Bijnaam en titel
    c.fillStyle = kleur; c.textAlign = 'center';
    let naam = p.bn || 'Speler';
    let fs = 34; c.font = `800 ${fs}px ${display}`;
    while (c.measureText(naam).width > 300 && fs > 16) { fs -= 2; c.font = `800 ${fs}px ${display}`; }
    c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = donker ? 0 : 6;
    c.fillText(naam, W / 2, 190);
    c.shadowBlur = 0;
    const titel = TITEL(p.t);
    c.font = `700 14px ${tekst}`; c.fillStyle = donker ? '#2a1d03' : tk;
    c.fillText(titel ? titel.toUpperCase() : 'SPELER', W / 2, 216);

    // Zes stats
    const stats = (p.s || []).slice(0, 6);
    c.textAlign = 'left';
    for (let i = 0; i < 6; i++) {
      const col = i % 2, rij = (i / 2) | 0;
      const x = 34 + col * 156, y = 262 + rij * 52;
      c.fillStyle = 'rgba(0,0,0,' + (donker ? 0.08 : 0.25) + ')'; rr(c, x - 8, y - 26, 148, 44, 10); c.fill();
      const s = stats[i];
      c.fillStyle = kleur;
      c.font = `800 26px ${display}`; c.fillText(s ? String(s.n) : '-', x, y + 5);
      c.font = `700 15px ${tekst}`; c.globalAlpha = 0.85; c.fillText(s ? s.v : '', x + 62, y + 4); c.globalAlpha = 1;
      if (s) { c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x, y + 10, 124, 3); c.fillStyle = tk; c.fillRect(x, y + 10, 124 * Math.min(1, s.n / 100), 3); }
    }

    // Onderkant: zeldzaam, kaarten, gevechten
    c.fillStyle = 'rgba(0,0,0,' + (donker ? 0.1 : 0.3) + ')'; rr(c, 24, 424, W - 48, 92, 14); c.fill();
    c.textAlign = 'center';
    const vak = [[String(p.z || 0), 'ZELDZAAM'], [String(p.k || 0), 'KAARTEN'], [`${p.w || 0}-${p.g || 0}-${p.l || 0}`, 'GEVECHTEN']];
    vak.forEach(([w, l], i) => {
      const x = 24 + (W - 48) * (i + 0.5) / 3;
      c.fillStyle = kleur; c.font = `800 ${i === 2 ? 20 : 26}px ${display}`; c.fillText(w, x, 466);
      c.font = `700 10px ${tekst}`; c.globalAlpha = 0.8; c.fillText(l, x, 488); c.globalAlpha = 1;
    });
    c.font = `600 10px ${tekst}`; c.globalAlpha = 0.6; c.fillStyle = kleur; c.fillText('W-G-V = gewonnen, gelijk, verloren', W / 2, 506); c.globalAlpha = 1;
    return canvas;
  }
  E.BG = BG; E.bgCss = bgCss; E.bgId = bgId; E.tekenProfiel = teken; E.titelNaam = TITEL;
})();
