/*
 * Somtoday Pack Opener v3.0: de wekelijkse drop in het Overzicht (hub.html).
 * Toont "Deze week: N mythische kaarten door alle spelers". De server telt alleen: geen namen en geen kaarten (actie `dropTelling`).
 * Het werkt alleen met een account (vrienden aan, SPOVrienden.laad()); zonder account of zonder verbinding blijft de regel verborgen.
 * Er wordt niets opgeslagen op deze computer.
 */
(function () {
  'use strict';
  const el = document.getElementById('drop-week');
  const L = globalThis.SPOVrienden;
  if (!el || !L || !L.dropTelling) return;
  let laatst = 0;
  async function ververs() {
    if (Date.now() - laatst < 30000) return; // hoogstens eens per 30 seconden
    laatst = Date.now();
    try {
      const st = await L.laad();
      const d = st ? await L.dropTelling(st) : null;
      if (!d) { el.hidden = true; return; }
      el.textContent = L.dropTekst(d.aantal) + '.';
      el.hidden = false;
    } catch (e) { el.hidden = true; }
  }
  ververs();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ververs(); });
  // Bij het openen van het tabblad Overzicht nog eens verversen.
  document.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('#tab-overzicht')) ververs(); });
})();
