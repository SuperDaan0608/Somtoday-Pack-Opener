/*
 * Somtoday Pack Opener v2.4: meekijken en emoji gooien.
 *  - Een vriend opent een KOSMISCHE of MYTHISCHE kaart: meldingen.js toont "kijk mee!". Klik je erop, dan speelt content.js
 *    dezelfde animatie af (zelfde opening, zelfde trede, hetzelfde vak en cijfer) op JOUW scherm. Het is dus geen videostream:
 *    de animatie wordt bij jou zelf getekend, daarom kan het er een beetje anders uitzien.
 *  - Tijdens en na het kijken kun je emoji gooien (balkje onderaan). Bij de opener vliegen ze over het scherm, ook midden in zijn
 *    animatie: een laag over de pagina waar je dwars doorheen klikt (pointer-events: none).
 * De emoji lopen via de achtergrond (update.js), die ze versleuteld naar de opener stuurt.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  if (window.__spoKijken) return;
  window.__spoKijken = true;

  const EMOJI = ['\u{1F525}', '\u{1F62E}', '\u{1F44F}', '\u{1F602}']; // vuur, verbazing, applaus, lachen
  const NAMEN = ['vuur', 'verbazing', 'applaus', 'lachen'];
  const reduceer = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  let host = null, wortel = null, laag = null, balk = null, balkTimer = 0;

  function zorgHost() {
    if (!host || !host.isConnected) {
      host = document.createElement('spo-kijken');
      wortel = host.attachShadow({ mode: 'open' });
      const st = document.createElement('style');
      st.textContent = `
        :host { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
        .laag { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .v { position: absolute; bottom: -60px; font-size: 44px; line-height: 1; will-change: transform, opacity; pointer-events: none;
          animation: vlieg var(--d, 3.6s) cubic-bezier(.2,.7,.3,1) forwards; text-shadow: 0 4px 14px rgba(0,0,0,.4); }
        .v small { display: block; margin-top: 2px; font: 700 11px/1.2 system-ui, sans-serif; color: #fff; text-align: center; text-shadow: 0 1px 4px #000; white-space: nowrap; }
        @keyframes vlieg {
          0% { transform: translate(0, 0) scale(.5) rotate(0); opacity: 0; }
          10% { opacity: 1; transform: translate(0, -10vh) scale(1.15) rotate(-6deg); }
          50% { transform: translate(var(--x, 20px), -50vh) scale(1) rotate(8deg); }
          85% { opacity: 1; }
          100% { transform: translate(calc(var(--x, 20px) * -1), -112vh) scale(1.05) rotate(-8deg); opacity: 0; }
        }
        .balk { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); pointer-events: auto; display: flex; align-items: center; gap: 8px;
          flex-wrap: wrap; justify-content: center; max-width: min(520px, calc(100vw - 24px)); padding: 10px 12px; border-radius: 16px;
          background: rgba(20,22,42,.94); border: 1px solid #f2c94c; color: #fff; font: 600 13px/1.3 system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
        .balk .t { flex: 1 1 100%; text-align: center; }
        .balk .t small { display: block; font-weight: 400; opacity: .7; font-size: 11px; margin-top: 1px; }
        .balk button { font-size: 26px; line-height: 1; padding: 6px 10px; border-radius: 12px; border: 1px solid #ffffff30; background: #ffffff12; cursor: pointer; color: #fff; }
        .balk button:hover { background: #ffffff28; transform: translateY(-2px); }
        .balk button:focus-visible { outline: 2px solid #f2c94c; outline-offset: 2px; }
        .balk button:disabled { opacity: .5; cursor: default; transform: none; }
        .balk .x { font-size: 18px; padding: 4px 9px; opacity: .8; }
        @media (prefers-reduced-motion: reduce) {
          .v { animation: stil 2.4s ease forwards; bottom: 30%; }
          @keyframes stil { 0% { opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
          .balk button:hover { transform: none; }
        }`;
      laag = document.createElement('div'); laag.className = 'laag'; laag.setAttribute('aria-hidden', 'true');
      wortel.append(st, laag);
      balk = null;
    }
    // altijd als laatste in de pagina: boven de animatie van het pakket zelf
    const doel = document.body || document.documentElement;
    if (host.parentNode !== doel || doel.lastElementChild !== host) doel.appendChild(host);
  }

  // Een emoji die over het scherm vliegt (van een kijker, of mijn eigen worp als terugkoppeling).
  function vlieg(emoji, naam) {
    zorgHost();
    const v = document.createElement('span');
    v.className = 'v';
    v.style.left = (8 + Math.random() * 80) + '%';
    v.style.setProperty('--x', Math.round((Math.random() - 0.5) * 140) + 'px');
    v.style.setProperty('--d', (3 + Math.random() * 1.6).toFixed(2) + 's');
    v.append(document.createTextNode(emoji));
    if (naam) { const s = document.createElement('small'); s.textContent = String(naam).slice(0, 24); v.append(s); }
    laag.append(v);
    while (laag.children.length > 40) laag.firstElementChild.remove();
    setTimeout(() => v.remove(), 5200);
  }

  document.addEventListener('spo-emoji-in', (e) => {
    const d = e.detail || {};
    if (EMOJI.includes(d.emoji)) vlieg(d.emoji, d.naam);
  });

  // Het balkje voor de kijker.
  function toonBalk(van, naam) {
    zorgHost();
    if (balk) balk.remove();
    clearTimeout(balkTimer);
    balk = document.createElement('div'); balk.className = 'balk'; balk.setAttribute('role', 'group'); balk.setAttribute('aria-label', 'Emoji gooien');
    const t = document.createElement('div'); t.className = 't';
    t.textContent = `Je kijkt mee met ${naam || 'een vriend'}. Gooi een emoji!`;
    const k = document.createElement('small'); k.textContent = 'Dit is dezelfde animatie op jouw scherm, geen videostream.';
    t.append(k);
    balk.append(t);
    let laatste = 0;
    EMOJI.forEach((em, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = em; b.setAttribute('aria-label', 'Gooi ' + NAMEN[i]);
      b.addEventListener('click', async () => {
        if (Date.now() - laatste < 600) return; // niet spammen
        laatste = Date.now();
        vlieg(em);
        try { await chrome.runtime.sendMessage({ type: 'spo-emoji-stuur', naar: van, emoji: em }); } catch (e) { /* offline: de emoji bleef bij jou */ }
      });
      balk.append(b);
    });
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Sluiten');
    x.addEventListener('click', () => { balk.remove(); balk = null; });
    balk.append(x);
    wortel.append(balk);
    balkTimer = setTimeout(() => { if (balk) { balk.remove(); balk = null; } }, 90000);
  }
  document.addEventListener('spo-kijk-balk', (e) => { const d = e.detail || {}; if (typeof d.van === 'string') toonBalk(d.van, d.naam); });
})();
