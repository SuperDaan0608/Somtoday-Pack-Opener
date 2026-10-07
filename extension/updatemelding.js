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
    const zichtbaar = u && u.versie && nieuwer(u.versie, huidig) && u.later !== u.versie;
    if (!zichtbaar) { if (host) { host.remove(); host = null; } return; }
    if (host) host.remove();
    host = document.createElement('spo-updatemelding');
    const s = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      :host { position: fixed; z-index: 2147482000; ${inHub ? 'left: 50%; top: 10px; transform: translateX(-50%);' : 'right: 20px; bottom: 76px;'} max-width: calc(100vw - 24px); }
      .balk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border-radius: 10px; background: #fff3c4; color: #2a1a02; font: 600 14px/1.3 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35); border: 1px solid #e0b22e; }
      a, button { font: inherit; border-radius: 6px; padding: 5px 10px; cursor: pointer; text-decoration: none; }
      a.dl { background: #2a1a02; color: #ffe27a; border: 0; }
      a.pg { color: #2a1a02; text-decoration: underline; padding: 5px 2px; font-weight: 500; }
      button { background: transparent; border: 1px solid #b88f37; color: #2a1a02; }
      :focus-visible { outline: 2px solid #2a1a02; outline-offset: 2px; }`;
    const balk = document.createElement('div');
    balk.className = 'balk';
    balk.setAttribute('role', 'status');
    const t = document.createElement('span');
    t.textContent = `Nieuwe versie ${u.versie}`;
    const zip = (isFirefox ? u.zipFirefox : u.zipChrome) || u.pagina;
    const dl = document.createElement('a');
    dl.className = 'dl'; dl.textContent = 'Downloaden'; dl.href = zip; dl.target = '_blank'; dl.rel = 'noopener';
    const pg = document.createElement('a');
    pg.className = 'pg'; pg.textContent = 'Wat is nieuw'; pg.href = u.pagina; pg.target = '_blank'; pg.rel = 'noopener';
    const later = document.createElement('button');
    later.type = 'button'; later.textContent = 'Later';
    later.addEventListener('click', () => chrome.storage.local.set({ [SLEUTEL]: { ...u, later: u.versie } }).catch(() => {}));
    balk.append(t, dl, pg, later);
    s.append(st, balk);
    (document.body || document.documentElement).appendChild(host);
  }

  async function start() {
    try {
      const r = await chrome.storage.local.get(SLEUTEL);
      toon(r[SLEUTEL]);
      chrome.storage.onChanged.addListener((c, g) => { if (g === 'local' && c[SLEUTEL]) toon(c[SLEUTEL].newValue); });
      chrome.runtime.sendMessage({ type: 'spo-update-check' }).catch(() => {});
    } catch (e) { /* geen melding */ }
  }
  start();
})();
