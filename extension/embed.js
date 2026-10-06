// Voor de pagina's die in het Pack Opener-paneel (hub.html) staan: ze worden daar geladen met ?embed=1.
// Zonder ?embed=1 doet dit bestand niets en werkt de pagina gewoon los.
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('embed') !== '1') return;
  document.documentElement.classList.add('embed');
  const naarPaneel = (m) => {
    try {
      parent.postMessage(Object.assign({ bron: 'spo-embed', versie: 1 }, m), location.origin);
    } catch (e) {
      /* niet in het paneel */
    }
  };
  // Esc sluit het paneel, ook als de focus in deze pagina staat (maar eerst een eventueel open venster in de pagina zelf).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    naarPaneel({ type: 'esc' });
  });
  // Een link naar Somtoday opent geen los tabblad, maar brengt je in het Somtoday-venster zelf naar je cijfers.
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="https://leerling.somtoday.nl/"]') : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    naarPaneel({ type: 'naar-cijfers' });
  });
})();
