/*
 * Somtoday Pack Opener: toont de melding "Nieuwe versie X" (zie update.js).
 * Draait als content script op Somtoday (kleine melding boven de knop) en in het hub-paneel (banner).
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  if (window.__spoUpdateMelding) return;
  window.__spoUpdateMelding = true;
  const SLEUTEL = 'spo_update';
  const inHub = /^(chrome|moz)-extension:$/.test(location.protocol);
  const isFirefox = /Firefox\//.test(navigator.userAgent);
  let host = null;

  const delen = (v) => String(v || '').replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  function nieuwer(a, b) {
    const x = delen(a), y = delen(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
    return false;
  }

  function toon(u) {
    const huidig = chrome.runtime.getManifest().version;
    // Een nieuwe versie is verplicht: zolang je de oude hebt, werkt de Pack Opener niet (geen 'Later' meer).
    const zichtbaar = u && u.versie && nieuwer(u.versie, huidig);
    if (!zichtbaar) { if (host) { host.remove(); host = null; } return; }
    if (host) host.remove();
    host = document.createElement('spo-updatemelding');
    const s = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      :host { position: fixed; z-index: 2147483600; ${inHub ? 'inset: 0; display: grid; place-items: center; background: rgba(5,6,14,.92); padding: 16px;' : 'right: 20px; bottom: 76px; max-width: min(420px, calc(100vw - 24px));'} }
      .balk { max-width: 460px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border-radius: 10px; background: #fff3c4; color: #2a1a02; font: 600 14px/1.3 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35); border: 1px solid #e0b22e; }
      a, button { font: inherit; border-radius: 6px; padding: 5px 10px; cursor: pointer; text-decoration: none; }
      a.dl { background: #2a1a02; color: #ffe27a; border: 0; }
      a.pg { color: #2a1a02; text-decoration: underline; padding: 5px 2px; font-weight: 500; }
      button { background: transparent; border: 1px solid #b88f37; color: #2a1a02; }
      :focus-visible { outline: 2px solid #2a1a02; outline-offset: 2px; }`;
    const balk = document.createElement('div');
    balk.className = 'balk';
    balk.setAttribute('role', inHub ? 'alertdialog' : 'status');
    const t = document.createElement('span');
    t.style.flexBasis = '100%';
    t.textContent = `Er is een nieuwe versie (${u.versie}). Je moet eerst updaten voordat de Pack Opener weer werkt: download de zip, pak hem uit en laad hem opnieuw in (of vervang de bestanden in je map en klik op vernieuwen bij de extensie). Je voortgang komt terug als je inlogt.`;
    const zip = (isFirefox ? u.zipFirefox : u.zipChrome) || u.pagina;
    const dl = document.createElement('a');
    dl.className = 'dl'; dl.textContent = 'Downloaden'; dl.href = zip; dl.target = '_blank'; dl.rel = 'noopener';
    const pg = document.createElement('a');
    pg.className = 'pg'; pg.textContent = 'Wat is nieuw'; pg.href = u.pagina; pg.target = '_blank'; pg.rel = 'noopener';
    balk.append(t, dl, pg);
    s.append(st, balk);
    (document.body || document.documentElement).appendChild(host);
  }

  async function start() {
    try {
      const r = await chrome.storage.local.get(SLEUTEL);
      toon(r[SLEUTEL]);
      chrome.storage.onChanged.addListener((c, g) => { if (g === 'local' && c[SLEUTEL]) toon(c[SLEUTEL].newValue); });
      const vraag = () => chrome.runtime.sendMessage({ type: 'spo-update-check' }).catch(() => {});
      vraag();
      setInterval(vraag, 10 * 60 * 1000); // ook als je lang bezig bent
    } catch (e) { /* geen melding */ }
  }
  start();
})();
