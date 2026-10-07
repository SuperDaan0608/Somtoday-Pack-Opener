(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`
  const SPO = window.__SPO;
  const SLEUTEL = 'spo_instellingen';
  const $ = (id) => document.getElementById(id);
  const NIVEAUS = [['Brons', 4.2], ['Zilver', 6.1], ['Goud', 8.4], ['Speciaal', 9.6], ['Icoon', 10]];
  const STANDAARD = { thema: 'auto', rand: 'standaard' };
  // ontwerp per niveau (0 t/m 4); keuze[niveau] = { thema, rand }
  let keuze = {};
  let begin = { ...STANDAARD }; // oude globale keuze: beginwaarde voor niveaus zonder eigen ontwerp
  const nu_ = (i) => keuze[i] || begin;
  let niveau = 2;
  let teken = 0;

  // Opslag: chrome.storage.local in de extensie; localStorage alleen als terugval om de pagina los te kunnen testen.
  const opslag = {
    async lees() {
      if (chrome && chrome.storage && chrome.storage.local) return (await chrome.storage.local.get(SLEUTEL))[SLEUTEL] || {};
      try { return JSON.parse(localStorage.getItem(SLEUTEL)) || {}; } catch (e) { return {}; }
    },
    async schrijf(w) {
      if (chrome && chrome.storage && chrome.storage.local) return chrome.storage.local.set({ [SLEUTEL]: w });
      localStorage.setItem(SLEUTEL, JSON.stringify(w));
    },
  };

  function ontwerp() {
    const o = {};
    NIVEAUS.forEach((_, i) => { o[i] = { ...nu_(i) }; });
    return o;
  }

  async function bewaar() {
    try {
      const nu = await opslag.lees();
      await opslag.schrijf({ ...nu, kaartOntwerp: ontwerp() });
      $('melding').textContent = 'Opgeslagen.';
    } catch (e) {
      $('melding').textContent = 'Opslaan lukte niet.';
    }
  }

  async function toon() {
    const mijn = ++teken;
    await SPO.art.laadLettertypes();
    if (mijn !== teken) return;
    const [naam, cijfer] = NIVEAUS[niveau];
    // De naam hieronder is verzonnen en alleen voor het voorbeeld.
    const d = SPO.maakData({ vak: 'Wiskunde', cijfer, onderwerp: 'Voorbeeld', weging: 2, persoon: 'Jouw Naam', kaartOntwerp: ontwerp() });
    const lagen = SPO.art.maakKaartLagen(d);
    const cv = SPO.art.maakAfbeelding(d, lagen);
    $('voor').src = cv.toDataURL('image/png');
    $('voor').alt = `Voorbeeld van je kaart op niveau ${naam}`;
  }

  function bouw() {
    const nv = $('niveaus');
    NIVEAUS.forEach(([naam], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = naam;
      b.setAttribute('aria-pressed', i === niveau ? 'true' : 'false');
      b.addEventListener('click', () => {
        niveau = i;
        vink();
        nv.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
        toon();
      });
      nv.appendChild(b);
    });
    const th = $('themas');
    for (const [id, t] of Object.entries(SPO.KAART_THEMAS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zwatch';
      b.setAttribute('role', 'radio');
      b.dataset.id = id;
      const k = document.createElement('span');
      k.className = 'kleur';
      k.style.background = t.pal ? `linear-gradient(135deg, ${t.pal[0]}, ${t.pal[1]} 55%, ${t.pal[2]})` : 'linear-gradient(135deg, #6a4a06, #e6b41f 55%, #fff1a6, #8aa4ff)';
      const n = document.createElement('span');
      n.className = 'naam';
      n.textContent = t.naam;
      b.append(k, n);
      b.addEventListener('click', () => { keuze[niveau] = { ...nu_(niveau), thema: id }; vink(); bewaar(); toon(); });
      th.appendChild(b);
    }
    const ra = $('randen');
    for (const [id, naam] of Object.entries(SPO.KAART_RANDEN)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.id = id;
      b.textContent = naam;
      b.addEventListener('click', () => { keuze[niveau] = { ...nu_(niveau), rand: id }; vink(); bewaar(); toon(); });
      ra.appendChild(b);
    }
    $('herstel').addEventListener('click', () => { keuze[niveau] = { ...STANDAARD }; vink(); bewaar(); toon(); });
  }

  function vink() {
    document.querySelectorAll('#themas .zwatch').forEach((b) => b.setAttribute('aria-checked', b.dataset.id === nu_(niveau).thema ? 'true' : 'false'));
    document.querySelectorAll('#randen button').forEach((b) => b.setAttribute('aria-checked', b.dataset.id === nu_(niveau).rand ? 'true' : 'false'));
  }

  (async function start() {
    const nu = await opslag.lees();
    if (SPO.KAART_THEMAS[nu.kaartThema]) begin.thema = nu.kaartThema;
    if (SPO.KAART_RANDEN[nu.kaartRand]) begin.rand = nu.kaartRand;
    const o = nu.kaartOntwerp && typeof nu.kaartOntwerp === 'object' ? nu.kaartOntwerp : {};
    NIVEAUS.forEach((_, i) => {
      const e = o[i] || {};
      keuze[i] = { thema: SPO.KAART_THEMAS[e.thema] ? e.thema : begin.thema, rand: SPO.KAART_RANDEN[e.rand] ? e.rand : begin.rand };
    });
    bouw();
    vink();
    toon();
  })();
})();
