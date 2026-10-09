// Eén gedeelde tabel voor de ladder (v2.4): namen en kans per trede. Trede 0 is een gewone kaart.
// Alles waar een trede getoond wordt (galerij, team, prestaties, meldingen) gebruikt deze tabel.
(function () {
  'use strict';
  const NAAM = ['', 'Zeldzaam', 'Glim', 'Kosmisch', 'Mythisch'];
  const KORT = ['', 'Z', 'GLIM', 'KOSM', 'MYTH'];
  const KANS = ['', '1/10', '1/40', '1/150', '1/1000'];
  const t = (n) => Math.max(0, Math.min(4, n | 0));
  const lib = {
    NAAM, KORT, KANS,
    kans: (n) => KANS[t(n)],
    naam: (n) => NAAM[t(n)],
    // 'Kosmisch (1/150)'
    label: (n) => (t(n) ? `${NAAM[t(n)]} (${KANS[t(n)]})` : 'Gewoon'),
  };
  globalThis.SPOLadder = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
