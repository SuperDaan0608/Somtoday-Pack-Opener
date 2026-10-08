/*
 * Somtoday Pack Opener: meldingen rechtsboven bij een nieuw vriendverzoek of een uitdaging voor een duel (zie update.js).
 * Kijkt alleen als de pagina zichtbaar is. Klik op de melding om meteen Vrienden of Team te openen.
 * v2.4: ook 'GG' van een vriend op je kosmische of mythische kaart, 'kijk mee' bij een vriend die nu zo'n kaart opent
 * (klik = dezelfde animatie op jouw scherm; zie kijken.js) en emoji van kijkers (die vliegen over je scherm; zie kijken.js).
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

  const ICOON = { duel: '⚔️', verzoek: '\u{1F91D}', gg: '\u{1F64C}', kijk: '\u{1F440}' };
  const ONDER = {
    duel: 'Klik om naar Team te gaan.',
    verzoek: 'Klik om naar Vrienden te gaan.',
    gg: 'Klik om je galerij te openen.',
    kijk: 'Klik om dezelfde animatie op jouw scherm af te spelen (geen video).',
  };
  function toon(x) {
    if (x.soort === 'emoji') { document.dispatchEvent(new CustomEvent('spo-emoji-in', { detail: { emoji: x.emoji, naam: x.naam } })); return; }
    zorgHost();
    const m = document.createElement('div');
    m.className = 'm';
    m.setAttribute('role', 'status');
    const i = document.createElement('span'); i.className = 'i'; i.textContent = ICOON[x.soort] || '\u{1F91D}';
    const t = document.createElement('span'); t.className = 't'; t.textContent = x.tekst;
    const s = document.createElement('span'); s.className = 's'; s.textContent = ONDER[x.soort] || ONDER.verzoek;
    t.append(s);
    const x2 = document.createElement('button'); x2.type = 'button'; x2.setAttribute('aria-label', 'Sluiten'); x2.textContent = '×';
    m.append(i, t, x2);
    const weg = () => { m.classList.add('weg'); setTimeout(() => m.remove(), 300); };
    x2.addEventListener('click', (e) => { e.stopPropagation(); weg(); });
    m.addEventListener('click', () => {
      if (x.soort === 'kijk') document.dispatchEvent(new CustomEvent('spo-kijk', { detail: { van: x.van, naam: x.naam, kijk: x.kijk } }));
      else document.dispatchEvent(new CustomEvent('spo-open-tab', { detail: x.soort === 'duel' ? 'team' : x.soort === 'gg' ? 'galerij' : 'vrienden' }));
      weg();
    });
    wortel.append(m);
    setTimeout(weg, x.soort === 'duel' ? 30000 : x.soort === 'kijk' ? Math.min(60, x.rest || 60) * 1000 : x.soort === 'gg' ? 15000 : 12000);
    try { new Audio(chrome.runtime.getURL('sounds/' + (x.soort === 'duel' ? 'plinko-bel.mp3' : x.soort === 'kijk' ? 'hartslag.mp3' : 'icoon.mp3'))).play().catch(() => {}); } catch (e) { /* stil */ }
  }

  async function vraag() {
    if (document.visibilityState !== 'visible') return;
    try {
      const lijst = await chrome.runtime.sendMessage({ type: 'spo-meldingen' });
      if (Array.isArray(lijst)) lijst.slice(0, 12).filter((x) => x && x.soort === 'emoji').concat(lijst.filter((x) => x && x.soort !== 'emoji').slice(0, 3)).forEach(toon);
    } catch (e) { /* extensie herladen of offline */ }
  }
  setTimeout(vraag, 1500);
  setInterval(vraag, 5000);
})();
