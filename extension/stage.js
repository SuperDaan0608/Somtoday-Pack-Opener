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
    stil: q.get('stil') === 'true',
    direct: q.get('direct') === 'true',
    opening: q.get('opening') || 'pak',
    debug: q.get('debug') === '1',
    geenGL: q.get('geengl') === '1',
  };
})();
