/*
 * Somtoday Pack Opener v2 (content script): telt munten, toont de dagelijkse beloning en zet het muntensaldo in de tooltip van de knop.
 * De beloning verschijnt de eerste keer per dag dat Somtoday open is (uit te zetten bij Instellingen). Lichte animatie in DOM/CSS, geen WebGL.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const E = globalThis.SPOEco;
  if (!E || window !== window.top || window.__spoDagelijks) return;
  window.__spoDagelijks = true;

  // ── Muntentelling ──
  let sweepTimer = 0;
  function planSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(() => E.sweep().catch(() => {}), 600);
  }

  // ── Tooltip bij de knop ──
  let saldo = 0;
  function tooltip() {
    const host = document.querySelector('spo-knop');
    const root = host && host.shadowRoot;
    if (!root) return;
    const tekst = `${saldo} ${saldo === 1 ? 'munt' : 'munten'}`;
    for (const el of root.querySelectorAll('.knop, .badge')) if (el.title !== tekst) el.title = tekst;
    const uit = root.getElementById('uit');
    if (uit && !uit.dataset.munten) uit.dataset.munten = '1';
  }
  async function leesSaldo() {
    try { saldo = (await E.lees()).munten.saldo; } catch (e) { /* geen opslag */ }
    tooltip();
  }
  new MutationObserver(() => tooltip()).observe(document.documentElement, { childList: true });

  // ── Dagelijkse beloning ──
  const CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483000; font-family: 'Open Sans', system-ui, sans-serif; }
    * { box-sizing: border-box; }
    .scherm { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(5, 7, 16, 0.78); animation: erin 0.25s ease-out; padding: 16px; }
    .kaart { width: min(380px, 100%); padding: 24px 22px 20px; border-radius: 20px; text-align: center; color: #eef1f8;
      background: linear-gradient(160deg, #1a2160, #0d1020 70%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.16), 0 0 0 1px rgba(255,210,74,.3), 0 24px 60px -10px #000; }
    h2 { margin: 0 0 4px; font-size: 20px; font-weight: 800; }
    p { margin: 0; color: #b6bed3; font-size: 14px; line-height: 1.4; }
    .dagen { display: flex; justify-content: center; gap: 7px; margin: 16px 0 6px; }
    .dag { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #b6bed3; background: rgba(255,255,255,.08); }
    .dag.klaar { background: #5a4a14; color: #ffe27a; }
    .dag.nu { background: linear-gradient(135deg, #fff0b3, #ffd24a 50%, #ff7a3d); color: #241703; transform: scale(1.18); }
    .dag.zeld { box-shadow: 0 0 0 2px #ff9ee8; }
    .podium { position: relative; height: 170px; margin: 10px 0 6px; display: grid; place-items: center; }
    .pak { position: relative; width: 104px; height: 140px; border: 0; padding: 0; background: none; cursor: pointer; animation: wiebel 1.6s ease-in-out infinite; }
    .pak .deel { position: absolute; left: 0; right: 0; background: linear-gradient(150deg, #ffe27a, #ffb020 55%, #ff6a3d); box-shadow: inset 0 0 0 2px rgba(255,255,255,.35); transition: transform .6s cubic-bezier(.2,.8,.2,1), opacity .5s; }
    .pak .top { top: 0; height: 30px; border-radius: 10px 10px 2px 2px; transform-origin: 0 100%; }
    .pak .lijf { top: 28px; bottom: 0; border-radius: 2px 2px 12px 12px; display: grid; place-items: center; }
    .pak svg { width: 44px; height: 44px; fill: #2a1a02; }
    .pak:focus-visible { outline: 3px solid #fff; outline-offset: 6px; }
    .open .pak { animation: none; pointer-events: none; }
    .open .pak .top { transform: translate(40px, -70px) rotate(32deg); opacity: 0; }
    .open .pak .lijf { transform: scale(.6) translateY(30px); opacity: 0; }
    .gloed { position: absolute; pointer-events: none; width: 190px; height: 190px; border-radius: 50%; opacity: 0; background: radial-gradient(closest-side, rgba(255,226,122,.85), rgba(255,210,74,0)); }
    .open .gloed { animation: gloed 1.1s ease-out forwards; }
    .prijs { position: absolute; pointer-events: none; opacity: 0; transform: scale(.3); }
    .open .prijs { animation: prijs .6s .35s cubic-bezier(.2,1.4,.4,1) forwards; }
    .prijs b { display: block; font-size: 38px; font-weight: 800; color: #ffe27a; line-height: 1; }
    .prijs span { display: block; margin-top: 6px; font-size: 14px; color: #eef1f8; }
    .zeldzaam b { font-size: 24px; background: linear-gradient(90deg, #ff9ee8, #ffe27a, #7ff0ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .knop { position: relative; z-index: 2; margin-top: 12px; min-height: 46px; padding: 0 26px; border: 0; border-radius: 999px; font: inherit; font-weight: 800; font-size: 15px; cursor: pointer; color: #241703; background: linear-gradient(135deg, #fff0b3, #ffd24a 45%, #ff7a3d); }
    .knop:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    .knop[hidden] { display: none; }
    .klein { margin-top: 10px; font-size: 12px; color: #8790a8; }
    @keyframes erin { from { opacity: 0; } }
    @keyframes wiebel { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg) translateY(-4px); } }
    @keyframes gloed { 0% { opacity: 0; transform: scale(.4); } 30% { opacity: 1; } 100% { opacity: .0; transform: scale(1.5); } }
    @keyframes prijs { to { opacity: 1; transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) { * { animation-duration: .01s !important; animation-delay: 0s !important; transition-duration: .01s !important; } }`;

  function toon(uit) {
    const host = document.createElement('spo-dagelijks');
    const root = host.attachShadow({ mode: 'open' });
    const stijl = document.createElement('style');
    stijl.textContent = CSS;
    const scherm = document.createElement('div');
    scherm.className = 'scherm';
    scherm.innerHTML = '<div class="kaart" role="dialog" aria-modal="true" aria-labelledby="k"><h2 id="k">Dagelijkse beloning</h2><p class="sub"></p><div class="dagen" aria-hidden="true"></div>' +
      '<div class="podium"><div class="gloed"></div><button type="button" class="pak" aria-label="Open je pakje"><span class="deel top"></span><span class="deel lijf"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 6.1L21 12l-6.6 2.9L12 21l-2.4-6.1L3 12l6.6-2.9z"/></svg></span></button><div class="prijs" aria-live="polite"></div></div>' +
      '<button type="button" class="knop" hidden>Top!</button><p class="klein">Kom morgen terug voor de volgende dag. Mis je een dag, dan begint de reeks opnieuw.</p></div>';
    root.append(stijl, scherm);
    const q = (s) => root.querySelector(s);
    q('.sub').textContent = `Dag ${uit.dag} van 7. Klik op het pakje.`;
    const dagen = q('.dagen');
    for (let i = 1; i <= 7; i++) {
      const d = document.createElement('span');
      d.className = 'dag' + (i < uit.dag ? ' klaar' : i === uit.dag ? ' nu' : '') + (i === 7 ? ' zeld' : '');
      d.textContent = i === 7 ? '★' : String(i);
      dagen.append(d);
    }
    const prijs = q('.prijs');
    if (uit.item) {
      const it = E.PER_ID.get(uit.item);
      prijs.classList.add('zeldzaam');
      prijs.innerHTML = '<b></b><span></span>';
      prijs.firstChild.textContent = it.naam;
      prijs.lastChild.textContent = `${E.ZELD[it.zeld]}: ${E.SOORTEN[it.soort].toLowerCase()}`;
    } else {
      prijs.innerHTML = '<b></b><span>munten erbij</span>';
      prijs.firstChild.textContent = '+' + uit.munten;
    }
    const sluit = () => { host.remove(); document.removeEventListener('keydown', toets, true); };
    const klaar = q('.knop');
    const openen = () => {
      scherm.classList.add('open');
      q('.sub').textContent = uit.item ? 'Dag 7: een zeldzaam item! Je vindt het in de Winkel.' : 'Je munten staan in je portemonnee.';
      setTimeout(() => { klaar.hidden = false; klaar.focus(); }, 900);
    };
    q('.pak').addEventListener('click', openen);
    klaar.addEventListener('click', sluit);
    function toets(e) {
      if (e.key === 'Escape') { e.stopPropagation(); if (scherm.classList.contains('open')) sluit(); else openen(); }
    }
    document.addEventListener('keydown', toets, true);
    document.documentElement.appendChild(host);
    q('.pak').focus();
  }

  async function dagelijks() {
    let inst = {};
    try { inst = (await chrome.storage.local.get('spo_instellingen')).spo_instellingen || {}; } catch (e) { return; }
    if (inst.dagelijks === false) return;
    await E.sweep().catch(() => {}); // eerst de startgegevens, zodat een nieuwe gebruiker niet dubbel telt
    const st = await E.dagStatus();
    if (st.gehaald) return;
    const start = async () => {
      const uit = await E.claimDagelijks();
      if (uit) { toon(uit); leesSaldo(); }
    };
    setTimeout(start, 1500);
  }

  try {
    chrome.storage.onChanged.addListener((w, gebied) => {
      if (gebied !== 'local') return;
      if (w.spo_galerij || w.spo_gevechten || w.spo_prestaties) planSweep();
      if (w.spo_munten) { saldo = (E.schoonMunten(w.spo_munten.newValue)).saldo; tooltip(); }
    });
  } catch (e) { /* geen opslag */ }

  leesSaldo();
  planSweep();
  dagelijks();
})();
