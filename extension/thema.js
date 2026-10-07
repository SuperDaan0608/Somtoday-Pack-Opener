// Zet het gekozen Somtoday-thema (uit de winkel) op de pagina. Draait vroeg, zodat er niet eerst het gewone uiterlijk te zien is.
// Uitzetten of een ander thema kiezen werkt meteen; zonder data-spo-thema doet thema.css niets.
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const THEMAS = { 'st-donker': 'donker', 'st-oceaan': 'oceaan', 'st-bos': 'bos', 'st-neon': 'neon', 'st-goud': 'goud' };
  function zet(w) {
    const g = w && typeof w === 'object' && w.gebruik && typeof w.gebruik === 'object' ? w.gebruik : {};
    const gekocht = Array.isArray(w && w.gekocht) ? w.gekocht : [];
    const id = g.somtoday;
    const thema = typeof id === 'string' && gekocht.includes(id) ? THEMAS[id] : null; // alleen wat je gekocht hebt
    if (thema) document.documentElement.setAttribute('data-spo-thema', thema);
    else document.documentElement.removeAttribute('data-spo-thema');
  }
  try {
    chrome.storage.local.get('spo_winkel').then((r) => zet(r.spo_winkel));
    chrome.storage.onChanged.addListener((w, gebied) => { if (gebied === 'local' && w.spo_winkel) zet(w.spo_winkel.newValue); });
  } catch (e) { /* geen opslag */ }
})();
