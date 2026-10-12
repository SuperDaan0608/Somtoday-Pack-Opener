// Reservepagina: als de popup niet in het huidige tabblad mag injecteren (bijv. chrome://-pagina's),
// opent het pakket hier. De gegevens komen uit de URL.
(function () {
  const q = new URLSearchParams(location.search);
  // ?strafschop=1: de proef-strafschop (motor/strafschop.js) in plaats van een pakket
  if (q.get('strafschop') === '1') {
    const kaart = (p, vak, cijfer) => ({
      vak: q.get(p + 'vak') || vak,
      cijfer: q.get(p === '' ? 'cijfer' : 'keeper') || cijfer,
      tier: q.get(p + 'tier'),
      trede: q.get(p + 'trede'),
      vloek: q.get(p + 'vloek'),
    });
    window.__somStrafschop = {
      schutter: kaart('', 'Wiskunde', '8.6'),
      keeper: kaart('keeper', 'Engels', '6.2'),
      uitkomst: q.get('uitkomst') || 'goal',
      richting: q.get('richting') || 'links',
      hoogte: q.get('hoogte') || '',
      kracht: q.get('kracht'),
      stil: q.get('stil') === 'true',
      laag: q.get('laag') === 'true',
      pauze: q.get('pauze') === '1',
      debug: q.get('debug') === '1',
    };
    return;
  }
  window.__somPack = {
    vak: q.get('vak') || 'Vak',
    cijfer: q.get('cijfer') || '1',
    onderwerp: q.get('onderwerp') || 'Toets',
    weging: q.get('weging') || '1',
    snel: q.get('snel') === 'true',
    laag: q.get('laag') === 'true',
    persoon: q.get('persoon') || '',
    kaartThema: q.get('thema') || 'auto',
    kaartRand: q.get('rand') || 'standaard',
    kaartOntwerp: (() => { try { return JSON.parse(q.get('ontwerp')) || undefined; } catch (e) { return undefined; } })(),
    stil: q.get('stil') === 'true',
    direct: q.get('direct') === 'true',
    opening: q.get('opening') || 'pak',
    zeldzaam: q.get('zeldzaam') === 'true',
    trede: Math.max(0, Math.min(4, parseInt(q.get('trede'), 10) || 0)),
    valsAlarm: q.get('vals') === null ? undefined : q.get('vals') === '1' || q.get('vals') === 'true',
    upgrade: q.get('upgrade') === null ? undefined : q.get('upgrade') === '1' || q.get('upgrade') === 'true',
    seizoen: q.get('seizoen') || 'auto',
    debug: q.get('debug') === '1',
    geenGL: q.get('geengl') === '1',
  };
})();
