// De muntteller in de kop van het paneel. Klikken brengt je naar de winkel (data-ga in hub.js).
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const el = document.getElementById('munt-saldo');
  const knop = document.getElementById('munten');
  if (!el || !knop) return;
  const toon = (m) => {
    const n = m && Number.isFinite(m.saldo) ? Math.max(0, Math.floor(m.saldo)) : 0;
    el.textContent = String(n);
    knop.setAttribute('aria-label', `Je hebt ${n} ${n === 1 ? 'munt' : 'munten'}. Naar de winkel.`);
  };
  try {
    chrome.storage.local.get('spo_munten').then((r) => toon(r.spo_munten));
    chrome.storage.onChanged.addListener((w, gebied) => { if (gebied === 'local' && w.spo_munten) toon(w.spo_munten.newValue); });
  } catch (e) { /* geen opslag */ }
})();
