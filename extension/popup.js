// Popup: je echte cijfers op Somtoday, instellingen, en handmatig een pakket proberen.
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`

  // De bestanden van de animatie, in de volgorde waarin ze geladen moeten worden (zie manifest.json).
  const PAKKET_BESTANDEN = ['motor/data.js', 'motor/audio.js', 'motor/shaders.js', 'motor/gl.js', 'motor/art.js', 'motor/openingen/kluis.js', 'motor/openingen/plinko.js', 'motor/openingen/ster.js', 'motor/openingen/raket.js', 'motor/openingen/schiet.js', 'motor/openingen/dans.js', 'motor/scene.js', 'motor/main.js'];

  const $ = (id) => document.getElementById(id);
  const SOMTODAY = /^https:\/\/leerling\.somtoday\.nl\//;
  const CIJFERS_URL = 'https://leerling.somtoday.nl/cijfers';
  const SLEUTEL_GEOPEND = 'spo_geopend';
  const SLEUTEL_INSTELLINGEN = 'spo_instellingen';
  const STANDAARD = { afdekking: true, geluid: true, snel: false, opening: 'pak', galerij: true };
  const OPENINGEN = ['pak', 'kluis', 'plinko', 'ster', 'raket', 'schiet', 'dans', 'willekeurig'];

  // Het formulier onthoudt zijn invoer in localStorage (zelfde sleutels als versie 0.1).
  const opslag = {
    lees(k, reserve) {
      try {
        const v = localStorage.getItem('sp_' + k);
        return v == null ? reserve : v;
      } catch (e) {
        return reserve;
      }
    },
    schrijf(k, v) {
      try {
        localStorage.setItem('sp_' + k, v);
      } catch (e) {
        /* opslag vol of geblokkeerd */
      }
    },
  };

  const maak = (tag, klas, tekst) => {
    const el = document.createElement(tag);
    if (klas) el.className = klas;
    if (tekst != null) el.textContent = tekst;
    return el;
  };

  // ───────────────────────── Instellingen (ook gelezen door de pagina zelf) ─────────────────────────
  let instellingen = { ...STANDAARD };

  async function laadInstellingen() {
    try {
      const r = await chrome.storage.local.get(SLEUTEL_INSTELLINGEN);
      if (r[SLEUTEL_INSTELLINGEN]) {
        instellingen = { ...STANDAARD, ...r[SLEUTEL_INSTELLINGEN] };
      } else {
        // Eerste keer na de update: neem de keuzes uit versie 0.1 over.
        instellingen = { ...STANDAARD, geluid: opslag.lees('geluid', '1') === '1', snel: opslag.lees('snel', '0') === '1' };
      }
    } catch (e) {
      /* standaardwaarden */
    }
    if (!OPENINGEN.includes(instellingen.opening)) instellingen.opening = 'pak';
    for (const k of Object.keys(STANDAARD)) if (k !== 'opening') $(k).checked = !!instellingen[k];
    toonOpening();
  }

  // De keuze van de opening: één rij knoppen, altijd precies één gekozen (radiogroep).
  function toonOpening() {
    $('opening').querySelectorAll('button').forEach((b) => {
      const aan = b.dataset.opening === instellingen.opening;
      b.setAttribute('aria-checked', String(aan));
      b.tabIndex = aan ? 0 : -1;
    });
  }
  $('opening').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    bewaarInstelling('opening', b.dataset.opening);
    toonOpening();
  });
  $('opening').addEventListener('keydown', (e) => {
    const pijl = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!pijl) return;
    e.preventDefault();
    const i = OPENINGEN.indexOf(instellingen.opening);
    bewaarInstelling('opening', OPENINGEN[(i + pijl + OPENINGEN.length) % OPENINGEN.length]);
    toonOpening();
    $('opening').querySelector('[aria-checked="true"]').focus();
  });

  function bewaarInstelling(k, v) {
    instellingen[k] = v;
    chrome.storage.local.set({ [SLEUTEL_INSTELLINGEN]: instellingen });
  }

  for (const k of Object.keys(STANDAARD)) {
    if (k === 'opening') continue;
    $(k).addEventListener('change', (e) => {
      bewaarInstelling(k, e.target.checked);
      if (k === 'afdekking') setTimeout(toonSomtoday, 150); // de pagina heeft even nodig om te reageren
    });
  }

  // ───────────────────────── Somtoday-paneel ─────────────────────────
  const nCijfers = (n) => (n === 1 ? '1 nieuw cijfer' : `${n} nieuwe cijfers`);

  async function actieveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function stuur(tab, type) {
    try {
      return await chrome.tabs.sendMessage(tab.id, { type });
    } catch (e) {
      return null; // geen content script op deze pagina (bijv. pagina was al open vóór de installatie)
    }
  }

  function kop(getal, titel, tekst, leeg) {
    const rij = maak('div', 's-kop');
    rij.append(maak('div', 's-getal' + (leeg ? ' leeg' : ''), getal));
    const t = maak('div', 's-tekst');
    t.append(maak('strong', '', titel), maak('span', '', tekst));
    rij.append(t);
    return rij;
  }

  function knop(tekst, klas, actie) {
    const b = maak('button', 'knop ' + (klas || ''), tekst);
    b.type = 'button';
    b.addEventListener('click', actie);
    return b;
  }

  function tekstknop(tekst, actie) {
    const b = maak('button', 'tekstknop', tekst);
    b.type = 'button';
    b.addEventListener('click', actie);
    return b;
  }

  async function toonSomtoday() {
    const paneel = $('somtoday');
    const tab = await actieveTab();
    const opSomtoday = !!(tab && SOMTODAY.test(tab.url || ''));
    const status = opSomtoday ? await stuur(tab, 'status') : null;
    paneel.textContent = '';
    // De eerste keer: het handmatige deel staat open als je niet op Somtoday bent; daarna blijft het zoals jij het zet.
    if (!$('handmatig').dataset.klaar) {
      $('handmatig').dataset.klaar = '1';
      $('handmatig').open = !(opSomtoday && status && status.ok);
    }

    const naarCijfers = () => {
      if (opSomtoday) chrome.tabs.update(tab.id, { url: CIJFERS_URL });
      else chrome.tabs.create({ url: CIJFERS_URL });
      window.close();
    };

    if (!opSomtoday) {
      paneel.append(
        kop('?', 'Open je cijfers op Somtoday', 'Nieuwe cijfers staan daar afgedekt tot jij ze opent.', true),
        knop('Naar mijn cijfers', 'goud', naarCijfers),
      );
      return;
    }

    if (!status || !status.ok) {
      paneel.append(
        kop('↻', 'Ververs de pagina', 'De Pack Opener is op deze pagina nog niet actief. Ververs hem om je cijfers te koppelen.', true),
        knop('Pagina verversen', 'goud', () => {
          chrome.tabs.reload(tab.id);
          window.close();
        }),
      );
      return;
    }

    if (!instellingen.afdekking) {
      paneel.append(kop('–', 'Afdekken staat uit', 'Zet “Cijfers afdekken” hieronder aan om nieuwe cijfers te verbergen.', true));
      return;
    }

    if (status.ongeopend > 0) {
      paneel.append(kop(String(status.ongeopend), `${nCijfers(status.ongeopend)} klaar`, 'Klik op een afgedekt cijfer in Somtoday, of open het volgende hier.'));
      const chips = maak('div', 'chips');
      status.vakken.slice(0, 5).forEach((v) => chips.append(maak('span', 'chip', v)));
      if (status.vakken.length > 5) chips.append(maak('span', 'chip', `+${status.vakken.length - 5}`));
      paneel.append(chips);
      paneel.append(
        knop('Open volgend pakket', 'goud', async () => {
          await stuur(tab, 'open-volgende');
          window.close();
        }),
      );
      const acties = maak('div', 's-acties');
      acties.append(
        tekstknop('Alles als geopend markeren', async () => {
          await stuur(tab, 'alles-geopend');
          toonSomtoday();
        }),
        tekstknop('Alles weer afdekken', async () => {
          await chrome.storage.local.remove(SLEUTEL_GEOPEND);
          setTimeout(toonSomtoday, 200);
        }),
      );
      paneel.append(acties);
      return;
    }

    const opCijfers = status.pad.indexOf('/cijfers') === 0;
    if (status.totaal > 0) {
      paneel.append(kop('0', 'Alles geopend', 'Zodra er een nieuw cijfer is, staat het hier klaar.', true));
      paneel.append(
        tekstknop('Alles weer afdekken', async () => {
          await chrome.storage.local.remove(SLEUTEL_GEOPEND);
          setTimeout(toonSomtoday, 200);
        }),
      );
    } else {
      paneel.append(
        kop('0', 'Geen cijfers op deze pagina', opCijfers ? 'Er staan nog geen cijfers in “Laatste cijfers”.' : 'Je nieuwe cijfers vind je onder “Cijfers”.', true),
      );
      if (!opCijfers) paneel.append(knop('Naar mijn cijfers', 'goud', naarCijfers));
    }
  }

  // ───────────────────────── Handmatig: live voorbeeld ─────────────────────────
  const vakEl = $('vak');
  const cijferEl = $('cijfer');
  const schuifEl = $('schuif');
  const onderEl = $('onderwerp');
  const fout = $('fout');

  const TIERS = [
    { naam: 'Brons', label: 'Oei…', uitleg: 'Onder de 5,5. Het pakket gaat toch open.', kleur: '#e08a4a', pal: ['#4a2a12', '#a8692f', '#e3b07e'], tekst: '#2b1808' },
    { naam: 'Zilver', label: 'Voldoende!', uitleg: 'Nog net geen walkout (vanaf een 7).', kleur: '#dfe9f5', pal: ['#5d6878', '#c3cdd9', '#f4f7fa'], tekst: '#202833' },
    { naam: 'Goud', label: 'Walkout!', uitleg: 'Vanaf een 7 krijg je een walkout.', kleur: '#ffcc33', pal: ['#6e4f08', '#e6b41f', '#fff1a6'], tekst: '#302103' },
    { naam: 'Speciaal', label: 'Speciaal!', uitleg: 'Een 9 of hoger: vuurwerk gegarandeerd.', kleur: '#38e1ff', pal: ['#030622', '#10308f', '#1d7fd0'], tekst: '#eaffff' },
    { naam: 'Icoon', label: 'Icoon! Perfect!', uitleg: 'Een tien. Zet je geluid maar hard.', kleur: '#ffe27a', pal: ['#b88f37', '#fff0b8', '#ffffff'], tekst: '#2e2207' },
  ];

  const leesCijfer = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? Math.round(Math.min(10, Math.max(1, n)) * 10) / 10 : null;
  };
  const tierVan = (g) => (g >= 9.95 ? 4 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5.5 ? 1 : 0);
  const fmt = (g) => g.toFixed(1).replace('.', ',');

  vakEl.value = opslag.lees('vak', '');
  onderEl.value = opslag.lees('onderwerp', '');
  const startCijfer = leesCijfer(opslag.lees('cijfer', ''));
  cijferEl.value = startCijfer ? fmt(startCijfer) : '';
  schuifEl.value = startCijfer || 7.5;
  let weging = Math.min(4, Math.max(1, parseInt(opslag.lees('weging', '1'), 10) || 1));

  let vorigeTier = -1;
  function werkVoorbeeldBij() {
    const g = leesCijfer(cijferEl.value) ?? Number(schuifEl.value);
    const t = tierVan(g);
    const T = TIERS[t];
    const vak = vakEl.value.trim() || 'Vak';
    const kaart = $('mini-kaart');
    document.documentElement.style.setProperty('--tier', T.kleur);
    kaart.style.setProperty('--c1', T.pal[0]);
    kaart.style.setProperty('--c2', T.pal[1]);
    kaart.style.setProperty('--c3', T.pal[2]);
    kaart.style.setProperty('--ct', T.tekst);
    kaart.classList.toggle('icoon', t === 4);
    $('mk-cijfer').textContent = fmt(g);
    $('mk-vak').textContent = vak.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase() || 'VAK';
    $('mk-naam').textContent = vak;
    $('tier-naam').textContent = T.naam;
    $('tier-label').textContent = T.label;
    $('tier-uitleg').textContent = T.uitleg;
    if (t !== vorigeTier && vorigeTier !== -1) {
      kaart.classList.remove('pop');
      void kaart.offsetWidth;
      kaart.classList.add('pop');
    }
    vorigeTier = t;
  }

  vakEl.addEventListener('input', () => {
    opslag.schrijf('vak', vakEl.value);
    werkVoorbeeldBij();
  });
  onderEl.addEventListener('input', () => opslag.schrijf('onderwerp', onderEl.value));
  cijferEl.addEventListener('input', () => {
    cijferEl.value = cijferEl.value.replace(/[^0-9.,]/g, '');
    const g = leesCijfer(cijferEl.value);
    if (g != null) schuifEl.value = g;
    opslag.schrijf('cijfer', cijferEl.value);
    fout.textContent = '';
    werkVoorbeeldBij();
  });
  cijferEl.addEventListener('blur', () => {
    const g = leesCijfer(cijferEl.value);
    if (g != null) cijferEl.value = fmt(g);
  });
  schuifEl.addEventListener('input', () => {
    cijferEl.value = fmt(Number(schuifEl.value));
    opslag.schrijf('cijfer', cijferEl.value);
    fout.textContent = '';
    werkVoorbeeldBij();
  });

  function zetWeging(w) {
    weging = w;
    opslag.schrijf('weging', String(w));
    document.querySelectorAll('#weging button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w)));
  }
  $('weging').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) zetWeging(Number(b.dataset.w));
  });
  zetWeging(weging);

  // ───────────────────────── Handmatig: geschiedenis ─────────────────────────
  function leesGeschiedenis() {
    try {
      const lijst = JSON.parse(opslag.lees('geschiedenis', '[]'));
      return Array.isArray(lijst) ? lijst.filter((x) => x && typeof x.cijfer === 'number') : [];
    } catch (e) {
      return [];
    }
  }

  function toonGeschiedenis() {
    const lijst = leesGeschiedenis();
    const sectie = $('geschiedenis');
    sectie.hidden = lijst.length === 0;
    if (!lijst.length) return;

    const totaalW = lijst.reduce((s, x) => s + (x.weging || 1), 0);
    const gem = lijst.reduce((s, x) => s + x.cijfer * (x.weging || 1), 0) / totaalW;
    const gemEl = $('gemiddelde');
    gemEl.textContent = 'Gemiddelde ';
    const b = document.createElement('b');
    b.textContent = fmt(Math.round(gem * 10) / 10);
    gemEl.appendChild(b);

    const ul = $('lijst');
    ul.textContent = '';
    lijst.slice(0, 5).forEach((x) => {
      const T = TIERS[tierVan(x.cijfer)];
      const li = document.createElement('li');
      const knopEl = document.createElement('button');
      knopEl.type = 'button';
      knopEl.title = 'Opnieuw invullen';
      const c = document.createElement('span');
      c.className = 'l-cijfer' + (x.cijfer < 5.5 ? ' onv' : '');
      c.style.background = x.cijfer < 5.5 ? 'linear-gradient(135deg, #b4232f, #ff5a64)' : `linear-gradient(135deg, ${T.pal[1]}, ${T.pal[2]})`;
      c.textContent = fmt(x.cijfer);
      const tekst = document.createElement('span');
      tekst.className = 'l-tekst';
      const naam = document.createElement('b');
      naam.textContent = x.vak;
      const onder = document.createElement('span');
      onder.textContent = x.onderwerp;
      tekst.append(naam, onder);
      const w = document.createElement('span');
      w.className = 'l-weging';
      w.textContent = `${x.weging || 1}×`;
      knopEl.append(c, tekst, w);
      knopEl.addEventListener('click', () => {
        vakEl.value = x.vak;
        onderEl.value = x.onderwerp;
        cijferEl.value = fmt(x.cijfer);
        schuifEl.value = x.cijfer;
        zetWeging(x.weging || 1);
        ['vak', 'onderwerp', 'cijfer'].forEach((k) => opslag.schrijf(k, $(k).value));
        werkVoorbeeldBij();
      });
      li.appendChild(knopEl);
      ul.appendChild(li);
    });
  }

  $('wis').addEventListener('click', () => {
    opslag.schrijf('geschiedenis', '[]');
    toonGeschiedenis();
  });

  // ───────────────────────── Handmatig: openen ─────────────────────────
  $('formulier').addEventListener('submit', async (e) => {
    e.preventDefault();
    fout.textContent = '';
    const g = leesCijfer(cijferEl.value);
    if (g == null) {
      fout.textContent = 'Vul een cijfer in tussen 1 en 10.';
      cijferEl.focus();
      return;
    }
    const data = {
      vak: vakEl.value.trim() || 'Vak',
      cijfer: g,
      onderwerp: onderEl.value.trim() || 'Toets',
      weging,
      snel: !!instellingen.snel,
      stil: !instellingen.geluid,
      opening: instellingen.opening,
    };

    const lijst = leesGeschiedenis();
    lijst.unshift({ vak: data.vak, cijfer: g, onderwerp: data.onderwerp, weging, ts: Date.now() });
    opslag.schrijf('geschiedenis', JSON.stringify(lijst.slice(0, 20)));

    try {
      const tab = await actieveTab();
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (d) => {
          window.__somPack = d;
        },
        args: [data],
      });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: PAKKET_BESTANDEN });
    } catch (err) {
      // Op chrome://-pagina's, de Web Store of pdf's mag niets geïnjecteerd worden:
      // dan openen we het pakket in een eigen tabblad.
      const q = new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)]));
      await chrome.tabs.create({ url: chrome.runtime.getURL('stage.html?' + q.toString()) });
    }
    window.close();
  });

  // ───────────────────────── Start ─────────────────────────
  (async () => {
    werkVoorbeeldBij();
    toonGeschiedenis();
    await laadInstellingen();
    await toonSomtoday();
  })();
})();
