/*
 * Somtoday Pack Opener: uitval-feest op het rooster.
 * Somtoday laat een uitgevallen les meestal gewoon weg. Daarom onthouden we (alleen in deze browser, niet in de back-up)
 * welke lessen er per dag stonden. Verdwijnt er een les, dan tekenen we op die plek een doorgestreept blok "UITVAL" en volgt
 * eenmalig een korte viering met confetti. Staat er wel een label 'vervallen' bij een les, dan telt dat ook.
 *   spo_uitval_gezien   { hash: tijdstip }                       welke uitval al gevierd is
 *   spo_rooster_vorig   { "week|dag": { ts, lessen: [{ vak, tijd, stijl }] } }   wat er stond (hoogstens 40 dagen)
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  if (window.__spoRooster) return;
  window.__spoRooster = true;

  const SLEUTEL = 'spo_uitval_gezien';
  const SLEUTEL_INSTELLINGEN = 'spo_instellingen';
  const SLEUTEL_VORIG = 'spo_rooster_vorig';
  let vorig = null; // zie boven
  let vermoed = new Map(); // dagsleutel → tijdstip waarop we een les voor het eerst misten (pas na 2 s zeker)
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

  // ───────────── Verdwenen lessen ─────────────
  const weekTekstNu = () => {
    const kop = document.querySelector('sl-rooster-week-header');
    return kop ? tekst(kop.querySelector('h1')) + ' ' + tekst(kop.querySelector('.weeknummer')) : '';
  };
  const lesSleutel = (l) => l.tijd + '|' + l.vak.toLowerCase();
  function tekenSpook(dag, l) {
    const ouder = dag.querySelector('sl-rooster-item') ? dag.querySelector('sl-rooster-item').parentElement : dag;
    if ([...ouder.querySelectorAll(':scope > .spo-spook')].some((x) => x.dataset.les === lesSleutel(l))) return;
    const d = document.createElement('div');
    d.className = 'spo-spook';
    d.dataset.les = lesSleutel(l);
    d.setAttribute('role', 'note');
    d.setAttribute('aria-label', `Uitval: ${l.vak}, ${l.tijd}`);
    d.style.cssText = l.stijl + ';position:absolute;box-sizing:border-box;';
    const t = document.createElement('span');
    t.className = 'spo-spook-vak';
    t.textContent = l.vak;
    const b = document.createElement('span');
    b.className = 'spo-spook-label';
    b.textContent = 'UITVAL';
    d.append(t, b);
    if (getComputedStyle(ouder).position === 'static') ouder.style.position = 'relative';
    ouder.appendChild(d);
  }
  function verdwenen() {
    if (vorig === null) return [];
    const week = weekTekstNu();
    if (!week) return [];
    const nieuw = [];
    let veranderd = false;
    const nu = Date.now();
    for (const dag of document.querySelectorAll('sl-rooster-dag')) {
      const w = dag.closest('sl-rooster-week');
      if (w && (w.hasAttribute('inert') || w.getAttribute('aria-hidden') === 'true')) continue;
      const dagNr = dag.parentElement ? [...dag.parentElement.children].filter((c) => c.localName === 'sl-rooster-dag').indexOf(dag) : 0;
      const sl = week + '|' + dagNr;
      const items = [...dag.querySelectorAll('sl-rooster-item')];
      const nuLessen = items.map((it) => {
        const i = lesInfo(it);
        return i && { vak: i.vak, tijd: i.tijd, stijl: ['top', 'left', 'width', 'height'].map((k) => it.style[k] ? `${k}:${it.style[k]}` : '').filter(Boolean).join(';'), uit: isUitgevallen(it) };
      }).filter(Boolean);
      const oud = vorig[sl];
      const weg = oud ? oud.lessen.filter((l) => !nuLessen.some((n) => lesSleutel(n) === lesSleutel(l))) : [];
      // Een les die net weg is, kan ook nog aan het laden zijn: pas na 2 seconden en met de rest van de dag zichtbaar is het uitval.
      if (weg.length && !weg.every((l) => l.weg)) {
        if (!nuLessen.length) continue;
        const sinds = vermoed.get(sl);
        if (!sinds) { vermoed.set(sl, nu); setTimeout(plan, 2200); continue; }
        if (nu - sinds < 2000) continue;
      }
      vermoed.delete(sl);
      for (const l of weg) {
        tekenSpook(dag, l);
        nieuw.push({ vak: l.vak, tijd: l.tijd, sleutel: hash([week, dagNr, l.tijd, l.vak.toLowerCase()].join('|')) });
      }
      // onthouden: wat er nu staat, plus wat al weg was (zodat het spookblok blijft staan)
      const lessen = nuLessen.filter((n) => !n.uit).map(({ vak, tijd, stijl }) => ({ vak, tijd, stijl })).concat(weg.map((l) => Object.assign({}, l, { weg: true })));
      if (!oud || JSON.stringify(oud.lessen) !== JSON.stringify(lessen)) {
        vorig[sl] = { ts: nu, lessen };
        veranderd = true;
      }
    }
    if (veranderd) {
      const sl = Object.keys(vorig);
      if (sl.length > 40) sl.sort((a, b) => vorig[a].ts - vorig[b].ts).slice(0, sl.length - 40).forEach((k) => delete vorig[k]);
      chrome.storage.local.set({ [SLEUTEL_VORIG]: vorig }).catch(() => {});
    }
    return nieuw;
  }

  // ───────────── Scannen ─────────────
  function scan() {
    gepland = false;
    if (!aan || gezien === null) return;
    const nieuw = verdwenen().filter((n) => !gezien[n.sleutel]);
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
      const r = await chrome.storage.local.get([SLEUTEL, SLEUTEL_INSTELLINGEN, SLEUTEL_VORIG]);
      gezien = r[SLEUTEL] && typeof r[SLEUTEL] === 'object' ? r[SLEUTEL] : {};
      vorig = r[SLEUTEL_VORIG] && typeof r[SLEUTEL_VORIG] === 'object' ? r[SLEUTEL_VORIG] : {};
      pasInstellingenToe(r[SLEUTEL_INSTELLINGEN]);
    } catch (e) { return; }
    chrome.storage.onChanged.addListener((c, gebied) => {
      if (gebied === 'local' && c[SLEUTEL_INSTELLINGEN]) pasInstellingenToe(c[SLEUTEL_INSTELLINGEN].newValue);
    });
    new MutationObserver((lijst) => {
      if (lijst.every((m) => m.target.localName === 'spo-uitval' || (m.target.classList && m.target.classList.contains('spo-spook')) || [...m.addedNodes].every((x) => x.classList && x.classList.contains('spo-spook')) && m.addedNodes.length || (m.target.getRootNode && m.target.getRootNode() instanceof ShadowRoot))) return;
      plan();
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    plan();
  }
  start();
})();
