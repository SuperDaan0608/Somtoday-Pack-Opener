/*
 * Somtoday Pack Opener: meldingen rechtsboven bij een nieuw vriendverzoek of een uitdaging voor een duel (zie update.js).
 * Kijkt alleen als de pagina zichtbaar is. Klik op de melding om meteen Vrienden of Team te openen.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  if (window.__spoMeldingen) return;
  window.__spoMeldingen = true;
  let host = null, wortel = null;

  function zorgHost() {
    if (host && host.isConnected) return;
    host = document.createElement('spo-meldingen');
    wortel = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      :host { position: fixed; top: 16px; right: 16px; z-index: 2147483640; display: flex; flex-direction: column; gap: 10px; max-width: min(360px, calc(100vw - 32px)); pointer-events: none; }
      .m { pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; cursor: pointer;
        background: #14162a; color: #fff; border: 1px solid #f2c94c; box-shadow: 0 10px 30px rgba(0,0,0,.45);
        font: 600 14px/1.35 system-ui, sans-serif; animation: in .35s cubic-bezier(.2,1.4,.4,1); }
      .m.weg { animation: uit .3s ease forwards; }
      .i { font-size: 22px; }
      .t { flex: 1; }
      .s { font-weight: 400; opacity: .75; font-size: 12px; display: block; margin-top: 2px; }
      button { background: none; border: 0; color: #fff; opacity: .6; font-size: 18px; cursor: pointer; padding: 0 2px; }
      button:hover { opacity: 1; }
      @keyframes in { from { transform: translateX(120%); opacity: 0; } }
      @keyframes uit { to { transform: translateX(120%); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .m, .m.weg { animation: none; } }`;
    wortel.append(st);
    (document.body || document.documentElement).appendChild(host);
  }

  function toon(x) {
    zorgHost();
    const m = document.createElement('div');
    m.className = 'm';
    m.setAttribute('role', 'status');
    const i = document.createElement('span'); i.className = 'i'; i.textContent = x.soort === 'duel' ? '⚔️' : '\u{1F91D}';
    const t = document.createElement('span'); t.className = 't'; t.textContent = x.tekst;
    const s = document.createElement('span'); s.className = 's'; s.textContent = x.soort === 'duel' ? 'Klik om naar Team te gaan.' : 'Klik om naar Vrienden te gaan.';
    t.append(s);
    const x2 = document.createElement('button'); x2.type = 'button'; x2.setAttribute('aria-label', 'Sluiten'); x2.textContent = '×';
    m.append(i, t, x2);
    const weg = () => { m.classList.add('weg'); setTimeout(() => m.remove(), 300); };
    x2.addEventListener('click', (e) => { e.stopPropagation(); weg(); });
    m.addEventListener('click', () => { document.dispatchEvent(new CustomEvent('spo-open-tab', { detail: x.soort === 'duel' ? 'team' : 'vrienden' })); weg(); });
    wortel.append(m);
    setTimeout(weg, x.soort === 'duel' ? 30000 : 12000);
    try { new Audio(chrome.runtime.getURL('sounds/' + (x.soort === 'duel' ? 'plinko-bel.mp3' : 'icoon.mp3'))).play().catch(() => {}); } catch (e) { /* stil */ }
  }

  async function vraag() {
    if (document.visibilityState !== 'visible') return;
    try {
      const lijst = await chrome.runtime.sendMessage({ type: 'spo-meldingen' });
      if (Array.isArray(lijst)) lijst.slice(0, 3).forEach(toon);
    } catch (e) { /* extensie herladen of offline */ }
  }
  setTimeout(vraag, 1500);
  setInterval(vraag, 5000);
})();
