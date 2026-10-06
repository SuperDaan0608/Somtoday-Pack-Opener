(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`
  const SPO = window.__SPO;
  const SLEUTEL = 'spo_instellingen';
  const $ = (id) => document.getElementById(id);
  const NIVEAUS = [['Brons', 4.2], ['Zilver', 6.1], ['Goud', 8.4], ['Speciaal', 9.6], ['Icoon', 10]];
  const STANDAARD = { kaartThema: 'auto', kaartRand: 'standaard' };
  let keuze = { ...STANDAARD };
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

  async function bewaar() {
    try {
      const nu = await opslag.lees();
      await opslag.schrijf({ ...nu, kaartThema: keuze.kaartThema, kaartRand: keuze.kaartRand });
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
    const d = SPO.maakData({ vak: 'Wiskunde', cijfer, onderwerp: 'Voorbeeld', weging: 2, persoon: 'Jouw Naam', kaartThema: keuze.kaartThema, kaartRand: keuze.kaartRand });
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
      b.addEventListener('click', () => { keuze.kaartThema = id; vink(); bewaar(); toon(); });
      th.appendChild(b);
    }
    const ra = $('randen');
    for (const [id, naam] of Object.entries(SPO.KAART_RANDEN)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.id = id;
      b.textContent = naam;
      b.addEventListener('click', () => { keuze.kaartRand = id; vink(); bewaar(); toon(); });
      ra.appendChild(b);
    }
    $('herstel').addEventListener('click', () => { keuze = { ...STANDAARD }; vink(); bewaar(); toon(); });
  }

  function vink() {
    document.querySelectorAll('#themas .zwatch').forEach((b) => b.setAttribute('aria-checked', b.dataset.id === keuze.kaartThema ? 'true' : 'false'));
    document.querySelectorAll('#randen button').forEach((b) => b.setAttribute('aria-checked', b.dataset.id === keuze.kaartRand ? 'true' : 'false'));
  }

  (async function start() {
    const nu = await opslag.lees();
    if (SPO.KAART_THEMAS[nu.kaartThema]) keuze.kaartThema = nu.kaartThema;
    if (SPO.KAART_RANDEN[nu.kaartRand]) keuze.kaartRand = nu.kaartRand;
    bouw();
    vink();
    toon();
  })();
})();
