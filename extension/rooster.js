/*
 * Somtoday Pack Opener: uitval-feest op het rooster.
 * Een uitgevallen les krijgt een label. Is er nieuwe uitval, dan volgt eenmalig een korte
 * viering met confetti. We onthouden alleen een hash van week, dag, tijd en vak; geen namen.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  if (window.__spoRooster) return;
  window.__spoRooster = true;

  const SLEUTEL = 'spo_uitval_gezien';
  const SLEUTEL_INSTELLINGEN = 'spo_instellingen';
  let aan = true;
  let geluid = true;
  let gezien = null; // { hash: tijdstip }, null = nog niet geladen
  let gepland = false;
  let opIdle = false;

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  const tekst = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();

  function isUitgevallen(item) {
    if (item.classList.contains('uitgevallen')) return true;
    for (const p of item.querySelectorAll('hmy-pill')) if (/vervallen|uitgevallen/i.test(p.textContent)) return true;
    return false;
  }

  function lesInfo(item) {
    const week = item.closest('sl-rooster-week');
    if (week && (week.hasAttribute('inert') || week.getAttribute('aria-hidden') === 'true')) return null; // weekwissel-animatie
    const vak = tekst(item.querySelector('.titel')) || (item.getAttribute('aria-label') || '').split(',')[0].trim();
    const tijd = ((item.getAttribute('aria-label') || '').match(/(\d{1,2}:\d{2}) tot (\d{1,2}:\d{2})/) || [])[0] || tekst(item.querySelector('hmy-pill'));
    const dag = item.closest('sl-rooster-dag');
    const dagNr = dag && dag.parentElement ? [...dag.parentElement.children].filter((c) => c.localName === 'sl-rooster-dag').indexOf(dag) : 0;
    const kop = document.querySelector('sl-rooster-week-header');
    const weekTekst = kop ? tekst(kop.querySelector('h1')) + ' ' + tekst(kop.querySelector('.weeknummer')) : '';
    return { vak, tijd, sleutel: hash([weekTekst, dagNr, tijd, vak.toLowerCase()].join('|')) };
  }

  // ───────────── Feest ─────────────
  function speel() {
    if (!geluid) return;
    try {
      const a = new Audio(chrome.runtime.getURL('sounds/gejuich.mp3'));
      a.volume = 0.7;
      a.play().catch(() => {});
    } catch (e) { /* geen geluid */ }
  }

  function feest(lessen) {
    if (document.querySelector('spo-uitval')) return;
    const host = document.createElement('spo-uitval');
    const s = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { position: fixed; inset: 0; z-index: 2147483000; display: block; }
      .vlak { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(10,14,30,.55); cursor: pointer; animation: in .25s ease-out; }
      canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
      .doos { position: relative; text-align: center; font-family: system-ui, sans-serif; color: #fff; padding: 0 16px; }
      .groot { font-size: clamp(52px, 14vw, 130px); font-weight: 900; letter-spacing: .02em; color: #ffd24a; text-shadow: 0 4px 0 #b36b00, 0 10px 30px rgba(0,0,0,.5); animation: pop .5s cubic-bezier(.2,1.6,.4,1); }
      .lijst { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 10px; }
      .les { background: #fff; color: #1b2233; border-radius: 8px; padding: 8px 14px; font-size: 16px; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,.35); }
      .les small { display: block; font-weight: 400; font-size: 12.5px; color: #55607a; }
      .hint { margin-top: 14px; font-size: 13px; opacity: .8; }
      @keyframes in { from { opacity: 0 } }
      @keyframes pop { from { transform: scale(.3) rotate(-6deg); opacity: 0 } }
      @media (prefers-reduced-motion: reduce) { .vlak, .groot { animation: none; } }`;
    const vlak = document.createElement('div');
    vlak.className = 'vlak';
    vlak.setAttribute('role', 'dialog');
    vlak.setAttribute('aria-label', 'Uitval');
    const canvas = document.createElement('canvas');
    const doos = document.createElement('div');
    doos.className = 'doos';
    const groot = document.createElement('div');
    groot.className = 'groot';
    groot.textContent = 'UITVAL!';
    const lijst = document.createElement('div');
    lijst.className = 'lijst';
    for (const l of lessen.slice(0, 6)) {
      const d = document.createElement('div');
      d.className = 'les';
      d.textContent = l.vak;
      const k = document.createElement('small');
      k.textContent = l.tijd;
      d.appendChild(k);
      lijst.appendChild(d);
    }
    if (lessen.length > 6) {
      const d = document.createElement('div');
      d.className = 'les';
      d.textContent = `+ ${lessen.length - 6} meer`;
      lijst.appendChild(d);
    }
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Klik om weg te gaan';
    doos.append(groot, lijst, hint);
    vlak.append(canvas, doos);
    s.append(style, vlak);
    document.documentElement.appendChild(host);
    speel();

    let stop = false;
    const weg = () => { stop = true; host.remove(); };
    vlak.addEventListener('click', weg);
    setTimeout(weg, 3200);
    confetti(canvas, () => stop);
  }

  function confetti(canvas, gestopt) {
    const w = (canvas.width = innerWidth);
    const h = (canvas.height = innerHeight);
    const g = canvas.getContext('2d');
    const kleuren = ['#ffd24a', '#ff5d73', '#4cc9f0', '#7bd88f', '#c77dff', '#ffffff'];
    const stukjes = Array.from({ length: 160 }, () => ({
      x: Math.random() * w, y: -20 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
      b: 6 + Math.random() * 8, k: kleuren[(Math.random() * kleuren.length) | 0],
    }));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    (function stap() {
      if (gestopt()) return;
      g.clearRect(0, 0, w, h);
      for (const p of stukjes) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r);
        g.fillStyle = p.k; g.fillRect(-p.b / 2, -p.b / 4, p.b, p.b / 2);
        g.restore();
      }
      requestAnimationFrame(stap);
    })();
  }

  // ───────────── Scannen ─────────────
  function scan() {
    gepland = false;
    if (!aan || gezien === null) return;
    const nieuw = [];
    for (const item of document.querySelectorAll('sl-rooster-item')) {
      const uit = isUitgevallen(item);
      item.classList.toggle('spo-uitval', uit);
      if (!uit) continue;
      const info = lesInfo(item);
      if (!info) continue;
      if (!gezien[info.sleutel] && !nieuw.some((n) => n.sleutel === info.sleutel)) nieuw.push(info);
    }
    if (!nieuw.length) return;
    const nu = Date.now();
    for (const n of nieuw) gezien[n.sleutel] = nu;
    // oude weg: hou maximaal 300 hashes
    const sleutels = Object.keys(gezien);
    if (sleutels.length > 300) sleutels.sort((a, b) => gezien[a] - gezien[b]).slice(0, sleutels.length - 300).forEach((k) => delete gezien[k]);
    chrome.storage.local.set({ [SLEUTEL]: gezien }).catch(() => {});
    feest(nieuw);
  }

  function plan() {
    if (gepland) return;
    gepland = true;
    setTimeout(scan, 250);
  }

  function pasInstellingenToe(v) {
    aan = !v || v.uitval !== false;
    geluid = !v || v.geluid !== false;
    if (!aan) document.querySelectorAll('.spo-uitval').forEach((e) => e.classList.remove('spo-uitval'));
    else plan();
  }

  async function start() {
    try {
      const r = await chrome.storage.local.get([SLEUTEL, SLEUTEL_INSTELLINGEN]);
      gezien = r[SLEUTEL] && typeof r[SLEUTEL] === 'object' ? r[SLEUTEL] : {};
      pasInstellingenToe(r[SLEUTEL_INSTELLINGEN]);
    } catch (e) { return; }
    chrome.storage.onChanged.addListener((c, gebied) => {
      if (gebied === 'local' && c[SLEUTEL_INSTELLINGEN]) pasInstellingenToe(c[SLEUTEL_INSTELLINGEN].newValue);
    });
    new MutationObserver((lijst) => {
      if (lijst.every((m) => m.target.localName === 'spo-uitval' || (m.target.getRootNode && m.target.getRootNode() instanceof ShadowRoot))) return;
      plan();
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    plan();
  }
  start();
})();
