// Reservepagina: als de popup niet in het huidige tabblad mag injecteren (bijv. chrome://-pagina's),
// opent het pakket hier. De gegevens komen uit de URL.
(function () {
  const q = new URLSearchParams(location.search);
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
