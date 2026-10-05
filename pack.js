(function () {
  const d = window.__somPack; if (!d) return;
  const old = document.getElementById('__somPackOverlay'); if (old) old.remove();

  const g = Math.max(1, Math.min(10, parseFloat(String(d.cijfer).replace(',', '.')) || 1));
  const I = g / 10;                       // 10 is 10x zo sterk als 1
  const tier = g >= 9.95 ? 4 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5.5 ? 1 : 0; // brons, zilver, goud, special, icon
  const walkout = g >= 7;
  const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',');
  const gradeStr = fmt(g);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vak = String(d.vak), onder = String(d.onderwerp);

  const cv = document.createElement('canvas');
  cv.id = '__somPackOverlay';
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;background:#000;cursor:pointer';
  document.documentElement.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W, H, dpr;
  function resize() { dpr = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; }
  resize(); addEventListener('resize', resize);

  // ---------- GELUID ----------
  let AC = null, nb = null;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); AC.resume && AC.resume().catch(() => {});
    nb = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const ch = nb.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
  function noise(dur, type, f0, f1, vol) {
    if (!AC) return; const n = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
    s.buffer = nb; s.loop = true; f.type = type; f.frequency.setValueAtTime(f0, n); f.frequency.exponentialRampToValueAtTime(f1, n + dur);
    gn.gain.setValueAtTime(0.0001, n); gn.gain.linearRampToValueAtTime(vol, n + dur * 0.5); gn.gain.linearRampToValueAtTime(0.0001, n + dur);
    s.connect(f); f.connect(gn); gn.connect(AC.destination); s.start(n); s.stop(n + dur + 0.1);
  }
  function boom(vol) {
    if (!AC) return; const n = AC.currentTime, o = AC.createOscillator(), gn = AC.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, n); o.frequency.exponentialRampToValueAtTime(30, n + 0.9);
    gn.gain.setValueAtTime(vol, n); gn.gain.exponentialRampToValueAtTime(0.001, n + 1.2);
    o.connect(gn); gn.connect(AC.destination); o.start(n); o.stop(n + 1.3); noise(0.8, 'lowpass', 2000, 80, vol * 0.8);
  }
  function sting(vol) {
    if (!AC) return; const n = AC.currentTime;
    const base = [196, 220, 261.6, 329.6, 392][tier];
    [1, 1.25, 1.5, 2, 3].slice(0, 2 + tier).forEach((m, i) => {
      const o = AC.createOscillator(), gn = AC.createGain(); o.type = 'triangle'; o.frequency.value = base * m;
      gn.gain.setValueAtTime(vol / (i + 1.5), n); gn.gain.exponentialRampToValueAtTime(0.001, n + 2.2);
      o.connect(gn); gn.connect(AC.destination); o.start(n); o.stop(n + 2.3);
    });
  }

  // ---------- TIJDLIJN ----------
  const A = 600, B = 2800, C = 5000, D = 6300;
  const E = D + 1200 + 1500 * I;          // pakje scheurt open
  const F = E + 800;                      // einde scheur
  const WO = walkout ? 4800 + 1500 * I : 0;
  const S = F + WO;                       // kaart verschijnt
  const RV = S + 1900;                    // BOEM: rating onthuld
  let raf, closed = false, revealed = false, tunnelPos = 0, last = performance.now(), start = last;
  let parts = [], confetti = [], shocks = [], fireworks = [], flashes = [];
  const stars = Array.from({ length: Math.floor(10 + 250 * I) }, () => ({ a: rnd(0, 6.283), r: rnd(0, 1), s: rnd(0.4, 1) }));
  const ev = []; const at = (time, fn) => ev.push({ time, fn, done: false });
  const flash = (t0, p, dec) => flashes.push({ t0, p, dec });

  at(A, () => noise(2.2, 'bandpass', 200, 2500, 0.15 + 0.2 * I));
  at(B, () => noise(2.2, 'bandpass', 200, 2500, 0.15 + 0.2 * I));
  at(C, () => noise(1.4, 'bandpass', 150, 3000, 0.2 + 0.3 * I));
  at(D, () => noise((E - D) / 1000, 'lowpass', 60, 500, 0.1 + 0.4 * I));
  at(E, t => { boom(0.4 + 0.6 * I); flash(t, 0.4 + 0.6 * I, 200 + 500 * I); });
  if (walkout) {
    at(F, () => noise(WO / 1000, 'bandpass', 500, 1600, 0.15 + 0.3 * I));
    at(F + WO * 0.5, () => noise(WO / 2000, 'highpass', 800, 4000, 0.05 + 0.1 * I));
    at(S - 50, t => flash(t, 0.6 + 0.4 * I, 500));
  }
  at(S, () => noise(1, 'bandpass', 300, 3000, 0.15));
  at(RV, t => { boom(0.3 + 0.7 * I); sting(0.1 + 0.3 * I); flash(t, 0.3 + 0.7 * I, 150 + 700 * I); noise(2 + 3 * I, 'bandpass', 600, 1800, 0.1 + 0.4 * I); });

  // ---------- KLEUREN ----------
  function tierColor(t) { return tier === 4 ? `hsl(${(t * 0.25) % 360},100%,60%)` : ['#e08a4a', '#e6eef7', '#ffd24a', '#39e6ff'][tier]; }
  const pal = [['#6b3d18', '#c98443', '#e9b883'], ['#7d8794', '#c9d3de', '#f2f6fa'], ['#8a6a14', '#f1c232', '#fff0a8'], ['#0a1650', '#1b5cff', '#39e6ff'], ['#d9b457', '#fff0b0', '#ffffff']][tier];
  const txtCol = ['#3a210c', '#2b3440', '#3b2a05', '#eaffff', '#3b2a05'][tier];

  function close() { closed = true; cancelAnimationFrame(raf); cv.remove(); removeEventListener('keydown', onKey); removeEventListener('resize', resize); try { AC && AC.close(); } catch (e) {} }
  function onKey(e) { if (e.key === 'Escape') close(); }
  addEventListener('keydown', onKey);
  cv.addEventListener('click', () => { if (performance.now() - start > RV + 1000) close(); });

  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };

  // ---------- TUNNEL ----------
  function drawTunnel(t, dt, alpha, speedMul) {
    const cx = W / 2, cy = H / 2, f = H * 0.9, zmax = 24, sp = 2, HX = 1.3, HY = 0.8;
    tunnelPos += dt * (3 + 9 * I) * speedMul;
    const col = tier >= 2 || t > C ? tierColor(t) : '#fff';
    ctx.strokeStyle = col;
    for (let i = 0; i < 12; i++) {
      const z = (((i * sp - tunnelPos) % zmax) + zmax) % zmax + 0.25;
      ctx.globalAlpha = alpha * Math.pow(Math.max(0, 1 - z / zmax), 1.2); ctx.lineWidth = Math.min(8, 1 + 2 / z);
      ctx.strokeRect(cx - HX * f / z, cy - HY * f / z, 2 * HX * f / z, 2 * HY * f / z);
    }
    ctx.globalAlpha = alpha;
    for (const [X, Y] of [[-HX, -HY], [HX, -HY], [-HX, HY], [HX, HY], [-HX, 0], [HX, 0], [-.65, HY], [0, HY], [.65, HY], [-.65, -HY], [0, -HY], [.65, -HY]]) {
      const xf = cx + X * f / zmax, yf = cy + Y * f / zmax, xn = cx + X * f / .25, yn = cy + Y * f / .25;
      const gr = ctx.createLinearGradient(xf, yf, xn, yn); gr.addColorStop(0, '#000'); gr.addColorStop(.5, col); gr.addColorStop(1, col);
      ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xf, yf); ctx.lineTo(xn, yn); ctx.stroke();
    }
    const D2 = Math.hypot(W, H) / 2; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (const s of stars) {
      s.r += dt * (0.1 + s.r * 1.6) * s.s * speedMul * (0.6 + I);
      if (s.r > 1) { s.r = rnd(0, 0.05); s.a = rnd(0, 6.283); }
      const r1 = s.r * D2, r2 = r1 + s.r * s.r * D2 * 0.15 * (0.5 + I);
      ctx.globalAlpha = alpha * s.r * 0.8; ctx.beginPath();
      ctx.moveTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); ctx.lineTo(cx + Math.cos(s.a) * r2, cy + Math.sin(s.a) * r2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawText(str, p, t) {
    if (p < 0 || p > 1) return;
    const scale = 0.03 * Math.pow(45, p), base = Math.min(H * 0.2, (W * 0.7) / (Math.max(3, str.length) * 0.55));
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.1));
    ctx.font = `800 ${base * scale}px system-ui, Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 25 * scale; ctx.fillStyle = '#fff'; ctx.fillText(str, W / 2, H / 2); ctx.restore();
  }

  // ---------- PAKJE ----------
  function drawPack(px, py, s, rot, glow, t, part, alpha) {
    const w = 240, h = 340;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(px, py); ctx.rotate(rot); ctx.scale(s, s);
    ctx.beginPath();
    if (part === 'top') ctx.rect(-w / 2 - 20, -h / 2 - 20, w + 40, 90); else if (part === 'bottom') ctx.rect(-w / 2 - 20, -h / 2 + 70, w + 40, h);
    else ctx.rect(-999, -999, 2000, 2000);
    ctx.clip();
    ctx.shadowColor = tierColor(t); ctx.shadowBlur = glow;
    rr(-w / 2, -h / 2, w, h, 18);
    const bg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); bg.addColorStop(0, '#08080c'); bg.addColorStop(1, '#1d1d28');
    ctx.fillStyle = bg; ctx.fill(); ctx.shadowBlur = 0;
    ctx.save(); rr(-w / 2, -h / 2, w, h, 18); ctx.clip();
    ctx.fillStyle = '#2a2a34'; ctx.fillRect(-w / 2, -h / 2, w, 26); ctx.fillRect(-w / 2, h / 2 - 26, w, 26);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
    for (let x = -w / 2; x < w / 2; x += 8) { ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x, -h / 2 + 26); ctx.moveTo(x, h / 2 - 26); ctx.lineTo(x, h / 2); ctx.stroke(); }
    const off = (((t * 0.0007) % 2) - 0.5) * w * 2, sh = ctx.createLinearGradient(off - 60, -h / 2, off + 60, h / 2);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.5, 'rgba(255,255,255,.22)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
    rr(-w / 2, -h / 2, w, h, 18); ctx.strokeStyle = g >= 9 ? '#ffd24a' : '#c9c9d6'; ctx.lineWidth = 4; ctx.stroke();
    ctx.font = '900 190px system-ui, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 25; ctx.fillStyle = '#fff'; ctx.fillText('?', 0, 8);
    ctx.restore();
  }

  // ---------- SPELER SILHOUET ----------
  function figure(x, feetY, h, ph, amp, t) {
    ctx.save(); ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineCap = 'round';
    ctx.shadowColor = tierColor(t); ctx.shadowBlur = 25 + 40 * I;
    const hip = feetY - h * 0.48, sh = feetY - h * 0.82;
    for (const s of [-1, 1]) {
      const a = Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.55 * amp;
      ctx.lineWidth = h * 0.075; ctx.beginPath(); ctx.moveTo(x + s * h * 0.04, hip);
      ctx.lineTo(x + s * h * 0.04 + Math.sin(a) * h * 0.46, hip + Math.cos(a) * h * 0.48); ctx.stroke();
      ctx.lineWidth = h * 0.055; ctx.beginPath(); ctx.moveTo(x + s * h * 0.12, sh + h * 0.03);
      ctx.lineTo(x + s * h * 0.12 - Math.sin(a) * h * 0.3, sh + h * 0.03 + Math.cos(a) * h * 0.3); ctx.stroke();
    }
    ctx.lineWidth = h * 0.21; ctx.beginPath(); ctx.moveTo(x, sh + h * 0.05); ctx.lineTo(x, hip); ctx.stroke();
    ctx.lineWidth = h * 0.09; ctx.beginPath(); ctx.moveTo(x - h * 0.1, sh + h * 0.01); ctx.lineTo(x + h * 0.1, sh + h * 0.01); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, feetY - h * 0.93, h * 0.065, 0, 6.283); ctx.fill(); ctx.restore();
  }

  function chip(txt, x, y, q, t) {
    if (q <= 0) return; const sc = q >= 1 ? 1 : 1 - Math.exp(-7 * q) * Math.cos(q * 9);
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(.01, sc), Math.max(.01, sc));
    const fs = Math.min(H * 0.045, 30); ctx.font = `800 ${fs}px system-ui, Arial`;
    let s = txt; while (ctx.measureText(s).width > W * 0.32 && s.length > 4) s = s.slice(0, -2);
    if (s !== txt) s += '…';
    const w = ctx.measureText(s).width + 50, h = fs * 2;
    ctx.shadowColor = tierColor(t); ctx.shadowBlur = 30; rr(-w / 2, -h / 2, w, h, 12);
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fill(); ctx.strokeStyle = tierColor(t); ctx.lineWidth = 3; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.toUpperCase(), 0, 2); ctx.restore();
  }

  // ---------- KAART ----------
  const CW = 300, CH = 430;
  let seed = 0; for (const c of vak) seed += c.charCodeAt(0);
  const sv = i => clamp(Math.round(g * 10 + (((seed * (i + 7) * 9301 + 49297) % 233280) / 233280 - 0.5) * 18), 5, 99);
  const statL = ['INZ', 'FOC', 'KEN', 'TMP', 'TEC', 'MOT'];
  function cardPath() {
    ctx.beginPath(); ctx.moveTo(-CW / 2, -CH / 2 + 40); ctx.lineTo(-CW / 2 + 40, -CH / 2); ctx.lineTo(CW / 2 - 40, -CH / 2); ctx.lineTo(CW / 2, -CH / 2 + 40);
    ctx.lineTo(CW / 2, CH / 2 - 70); ctx.quadraticCurveTo(CW / 2, CH / 2 - 20, 0, CH / 2); ctx.quadraticCurveTo(-CW / 2, CH / 2 - 20, -CW / 2, CH / 2 - 70); ctx.closePath();
  }
  function fitText(s, maxW) { while (ctx.measureText(s).width > maxW && s.length > 3) s = s.slice(0, -2); return s; }
  function drawCard(front, rating, t, glow) {
    ctx.save(); ctx.shadowColor = tierColor(t); ctx.shadowBlur = glow; cardPath();
    const gr = ctx.createLinearGradient(-CW / 2, -CH / 2, CW / 2, CH / 2);
    if (front) { gr.addColorStop(0, pal[0]); gr.addColorStop(.5, pal[1]); gr.addColorStop(1, pal[2]); } else { gr.addColorStop(0, '#05050a'); gr.addColorStop(1, '#232333'); }
    ctx.fillStyle = gr; ctx.fill(); ctx.shadowBlur = 0; ctx.save(); cardPath(); ctx.clip();
    if (front) {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(40, -40, 150, 0, 6.283); ctx.fill();
      if (tier === 4) { const hg = ctx.createLinearGradient(-CW, -CH, CW, CH); for (let i = 0; i <= 6; i++) hg.addColorStop(i / 6, `hsla(${(t * 0.1 + i * 60) % 360},100%,65%,.35)`); ctx.fillStyle = hg; ctx.fillRect(-CW, -CH, CW * 2, CH * 2); }
    }
    const off = (((t * 0.0006) % 2) - 0.5) * CW * 2.4, sh = ctx.createLinearGradient(off - 70, -CH / 2, off + 70, CH / 2);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.5, `rgba(255,255,255,${front ? .35 : .15})`); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(-CW, -CH, CW * 2, CH * 2); ctx.restore();
    cardPath(); ctx.strokeStyle = front ? pal[2] : tierColor(t); ctx.lineWidth = 5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (!front) { ctx.font = '900 170px system-ui, Arial'; ctx.fillStyle = '#fff'; ctx.shadowColor = tierColor(t); ctx.shadowBlur = 30; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 0); ctx.restore(); return; }
    ctx.fillStyle = txtCol;
    ctx.font = '900 84px system-ui, Arial'; ctx.fillText(rating, -CW / 2 + 62, -CH / 2 + 100);
    ctx.font = '800 26px system-ui, Arial'; ctx.fillText(vak.slice(0, 3).toUpperCase(), -CW / 2 + 62, -CH / 2 + 132);
    ctx.fillRect(-CW / 2 + 38, -CH / 2 + 146, 48, 3);
    ctx.font = '120px system-ui, Arial'; ctx.fillText(['😬', '🙂', '😎', '🔥', '👑'][tier], 50, -CH / 2 + 180);
    ctx.font = '900 32px system-ui, Arial'; ctx.fillText(fitText(vak.toUpperCase(), CW - 60), 0, CH / 2 - 160);
    ctx.fillRect(-CW / 2 + 40, CH / 2 - 150, CW - 80, 2);
    ctx.font = '600 15px system-ui, Arial'; ctx.fillText(fitText(onder, CW - 60), 0, CH / 2 - 128);
    ctx.font = '800 20px system-ui, Arial';
    for (let i = 0; i < 6; i++) {
      const x = -70 + (i % 3) * 70, y = CH / 2 - 98 + Math.floor(i / 3) * 30; ctx.textAlign = 'right'; ctx.fillText(String(sv(i)), x, y);
      ctx.textAlign = 'left'; ctx.font = '600 15px system-ui, Arial'; ctx.fillText(statL[i], x + 4, y); ctx.font = '800 20px system-ui, Arial';
    }
    ctx.restore();
  }

  // ---------- EFFECTEN ----------
  function doReveal(t) {
    revealed = true; const cx = W / 2, cy = H / 2, n = Math.floor(15 + 485 * I);
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(100, 300 + 1100 * I); parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(.7, 1.4 + I), size: rnd(1.5, 3 + 4 * I), g: 150, hue: tier === 4 ? rnd(0, 360) : null }); }
    for (let i = 0; i < 1 + Math.round(5 * I); i++) shocks.push({ delay: i * .12, v: 500 + 900 * I });
    if (g >= 6) { const nc = Math.floor(400 * (I - .5) * 2 * (g >= 9 ? 1.5 : 1)) + 20; for (let i = 0; i < nc; i++) confetti.push({ x: rnd(0, W), y: rnd(-H * .6, -10), vx: rnd(-60, 60), vy: rnd(120, 360), w: rnd(6, 12), h: rnd(4, 8), rot: rnd(0, 6), vr: rnd(-8, 8), hue: rnd(0, 360) }); }
    if (g >= 9) for (let i = 0; i < (g >= 9.95 ? 14 : 5); i++) fireworks.push(t + 400 + i * 380);
  }
  function explode(x, y) { const hue = rnd(0, 360), n = 80 + Math.floor(60 * I); for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), sp = rnd(60, 380); parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(1, 1.8), size: rnd(1.5, 3.5), g: 160, hue: hue + rnd(-20, 20) }); } }
  function rays(cx, cy, t, alpha, n) {
    const D2 = Math.hypot(W, H); ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = tierColor(t);
    for (let k = 0; k < n; k++) { const a = k / n * 6.283 + t * 0.0005 * (1 + 3 * I), w = 0.03; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - w) * D2, cy + Math.sin(a - w) * D2); ctx.lineTo(cx + Math.cos(a + w) * D2, cy + Math.sin(a + w) * D2); ctx.fill(); }
    ctx.restore();
  }
  function glowAt(x, y, r, col, a) { const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r)); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore(); }

  // ---------- HOOFDLUS ----------
  function loop(now) {
    if (closed) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now - start;
    for (const e of ev) if (!e.done && t >= e.time) { e.done = true; try { e.fn(t); } catch (x) {} }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;

    let amp = 0;
    if (t > C + 1300 && t < E) amp = (2 + 38 * I) * Math.pow((t - (C + 1300)) / (E - C - 1300), 1.5);
    else if (t >= E && t < F) amp = (8 + 40 * I) * Math.exp(-(t - E) / 300);
    else if (t >= F && t < S) amp = (1 + 5 * I) * Math.abs(Math.sin(t * 0.006)) + (S - t < 600 ? (2 + 10 * I) : 0);
    else if (t >= RV) amp = (10 + 60 * I) * Math.exp(-(t - RV) / (300 + 500 * I));
    ctx.save(); ctx.translate(rnd(-amp, amp), rnd(-amp, amp));

    const psc = Math.min(W, H) / 700 * 1.25;
    if (t < F) {
      const tA = Math.min(1, t / 600) * (t < C ? 1 : 0.5);
      drawTunnel(t, dt, tA, t < D ? 1 : 0.3);
      drawText(vak, (t - A) / (B - A), t); drawText(onder, (t - B) / (C - B), t);
      if (t >= C && t < E) {
        let s, rot = 0, jx = 0, jy = 0, ramp = 0;
        if (t < D) { const p = (t - C) / (D - C); s = 0.03 * Math.pow(33.3, p); rot = (1 - p) * 0.5; }
        else {
          s = 1; ramp = (t - D) / (E - D); const j = (2 + 22 * I) * ramp; jx = rnd(-j, j); jy = rnd(-j, j) + Math.sin(t * .004) * 6; rot = rnd(-j, j) * .004;
          if (I > 0.2) rays(cx, cy, t, ramp * (0.12 + 0.4 * I), 6 + Math.floor(20 * I));
          glowAt(cx, cy, H * (0.2 + 0.6 * ramp * I), tierColor(t), ramp * (0.2 + 0.5 * I));
        }
        drawPack(cx + jx, cy + jy, s * psc, rot, 10 + (20 + 120 * I) * Math.max(ramp, .2), t);
      } else if (t >= E) {
        const p = (t - E) / 800, e = p * p;
        glowAt(cx, cy, H * (0.4 + 1.2 * p), tierColor(t), 0.5 + 0.4 * I);
        const bw = W * (0.02 + 0.5 * p) * (0.4 + I), gr = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr; ctx.fillRect(cx - bw, 0, bw * 2, H);
        drawPack(cx, cy - e * H * 0.6, psc, -e * 1.6, 40, t, 'top', 1 - p);
        drawPack(cx, cy + e * H * 0.3, psc, e * 0.4, 40, t, 'bottom', 1 - p);
        rays(cx, cy, t, 0.6, 10 + Math.floor(30 * I));
      }
    } else if (t < S) {
      // WALKOUT
      const q = (t - F) / WO;
      drawTunnel(t, dt, 0.35, 0.25);
      const tc = tierColor(t);
      glowAt(cx, cy * 0.9, H * (0.3 + 0.3 * q), '#fff', 0.55); glowAt(cx, cy * 0.9, H * 0.9, tc, 0.55);
      const fl = ctx.createLinearGradient(cx - W * .5, 0, cx + W * .5, 0); fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(.5, tc); fl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fl; ctx.globalAlpha = .7; ctx.fillRect(cx - W * (.15 + .35 * q), cy * 0.9 - 3, W * (.3 + .7 * q), 6); ctx.globalAlpha = 1;
      const nf = Math.floor(Math.random() * (2 + 12 * I));
      for (let i = 0; i < nf; i++) { const x = rnd(W * .03, W * .97), y = rnd(H * .03, H * .55), r = rnd(12, 40 + 40 * I); const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
      const p = clamp(q / 0.8, 0, 1), sc = 0.1 + 0.9 * p, h = H * 0.62 * sc, feetY = cy + H * 0.05 + H * 0.28 * p;
      const wa = q < 0.8 ? 1 : Math.max(0, 1 - (q - 0.8) / 0.05);
      figure(cx, feetY, h, t * 0.007, wa, t);
      const fs = Math.min(W, H);
      chip(vak, W * 0.2, H * 0.2, (q - 0.18) * 4, t); chip(onder, W * 0.8, H * 0.2, (q - 0.4) * 4, t); chip('CIJFER ???', cx, H * 0.1, (q - 0.65) * 4, t);
    } else {
      // KAART
      const q = (t - S) / 1000;
      glowAt(cx, cy, Math.hypot(W, H) * (0.3 + 0.4 * I), tierColor(t), 0.3 + 0.3 * I);
      rays(cx, cy, t, 0.12 + 0.3 * I, 8 + Math.floor(24 * I));
      const sc = Math.min(W * 0.8 / CW, H * 0.78 / CH) * (0.75 + 0.25 * I) * (revealed ? 1 + 0.02 * Math.sin(t * 0.005) : 1);
      const enter = clamp(q / 0.6, 0, 1), es = 1 - Math.pow(1 - enter, 3) * Math.cos(enter * 5);
      const fp = clamp((t - S - 300) / 1100, 0, 1), ang = (1 - (fp * fp * (3 - 2 * fp))) * Math.PI;
      const sx = Math.max(0.02, Math.abs(Math.cos(ang))), front = ang < Math.PI / 2;
      const cp = clamp((t - S - 1300) / 600, 0, 1), val = 1 + (g - 1) * (1 - Math.pow(1 - cp, 2));
      const shown = t >= RV ? gradeStr : (Math.abs(val - g) < 0.05 ? gradeStr : fmt(Math.round(val * 10) / 10));
      ctx.save(); ctx.translate(cx, cy + (t < S + 300 ? (1 - enter) * 60 : 0)); ctx.scale(sx * sc * Math.max(0.01, es), sc * Math.max(0.01, es));
      drawCard(front, shown, t, 20 + (30 + 150 * I) * (revealed ? 1 : 0.4)); ctx.restore();
      if (t >= RV && !revealed) doReveal(t);
      if (revealed) {
        const rq = (t - RV) / 1000;
        for (const sw of shocks) { if (rq < sw.delay) continue; const r = (rq - sw.delay) * sw.v; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - r / (Math.hypot(W, H) * .6)); ctx.strokeStyle = tierColor(t); ctx.lineWidth = 3 + 10 * I; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke(); ctx.restore(); }
        while (fireworks.length && t >= fireworks[0]) { fireworks.shift(); explode(rnd(W * .15, W * .85), rnd(H * .12, H * .45)); }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; parts = parts.filter(p => p.life > 0);
        for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .99; ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.hue != null ? `hsl(${p.hue},100%,60%)` : tierColor(t); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill(); }
        ctx.restore();
        confetti = confetti.filter(c => c.y < H + 30);
        for (const c of confetti) { c.x += c.vx * dt + Math.sin(c.rot) * 20 * dt; c.y += c.vy * dt; c.rot += c.vr * dt; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.fillStyle = `hsl(${c.hue},90%,60%)`; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore(); }
        const la = clamp(rq * 3, 0, 1), label = g >= 9.95 ? '🔥 ICON! PERFECT! 🔥' : g >= 9 ? '⚡ SPECIAL! ⚡' : g >= 8 ? 'TOPPER!' : g >= 7 ? 'WALKOUT!' : g >= 5.5 ? 'Voldoende!' : 'Oei...';
        ctx.save(); ctx.globalAlpha = la; ctx.textAlign = 'center'; ctx.font = `900 ${Math.max(24, Math.min(W, H) * (0.04 + 0.05 * I))}px system-ui, Arial`;
        ctx.fillStyle = tierColor(t); ctx.shadowColor = tierColor(t); ctx.shadowBlur = 20 * I + 5; ctx.fillText(label, cx, Math.max(40, cy - CH / 2 * sc - 20)); ctx.restore();
        if (rq > 2) { ctx.save(); ctx.globalAlpha = .5 + .3 * Math.sin(t * .004); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '14px system-ui, Arial'; ctx.fillText('Klik of druk op Esc om te sluiten', cx, H - 20); ctx.restore(); }
      }
    }
    ctx.restore();
    let fa = 0; for (const f of flashes) fa += f.p * Math.exp(-(t - f.t0) / f.dec);
    if (fa > 0.01) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, fa)})`; ctx.fillRect(0, 0, W, H); }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
})();
