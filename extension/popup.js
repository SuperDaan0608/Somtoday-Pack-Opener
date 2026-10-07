// Popup: een slanke afstandsbediening. Bovenaan wat er op Somtoday klaarstaat; daaronder knoppen die het Pack Opener-paneel
// in het Somtoday-venster openen (alles zelf, zoals de galerij en de instellingen, zit in dat paneel: hub.html).
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`

  // De bestanden van de animatie, in de volgorde waarin ze geladen moeten worden (zie manifest.json).
  const PAKKET_BESTANDEN = ['motor/data.js', 'motor/audio.js', 'motor/shaders.js', 'motor/gl.js', 'motor/art.js', 'motor/openingen/kluis.js', 'motor/openingen/plinko.js', 'motor/openingen/ster.js', 'motor/openingen/raket.js', 'motor/openingen/schiet.js', 'motor/openingen/dans.js', 'motor/zeldzaam.js', 'motor/scene.js', 'motor/main.js'];

  const $ = (id) => document.getElementById(id);
  const SOMTODAY = /^https:\/\/leerling\.somtoday\.nl\//;
  const CIJFERS_URL = 'https://leerling.somtoday.nl/cijfers';
  const SLEUTEL_GEOPEND = 'spo_geopend';
  const SLEUTEL_INSTELLINGEN = 'spo_instellingen';
  const SLEUTEL_HUB_OPEN = 'spo_hub_open';

  const maak = (tag, klas, tekst) => {
    const el = document.createElement(tag);
    if (klas) el.className = klas;
    if (tekst != null) el.textContent = tekst;
    return el;
  };

  let afdekking = true;
  let opSomtoday = false;

  const nCijfers = (n) => (n === 1 ? '1 nieuw cijfer' : `${n} nieuwe cijfers`);

  async function actieveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function stuur(tab, type, extra) {
    try {
      return await chrome.tabs.sendMessage(tab.id, { type, ...extra });
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

  function meld(tekst) {
    $('melding').textContent = tekst;
  }

  // ───────────────────────── Het paneel openen ─────────────────────────
  // Op Somtoday: de pagina opent het paneel zelf (bericht 'hub-open'). Staat de pagina er nog niet klaar voor (bijv. al open vóór de
  // installatie), of ben je niet op Somtoday, dan onthouden we het verzoek in de opslag en laat het content script het paneel openen
  // zodra Somtoday is geladen.
  async function vraagPaneelNaLaden(naam) {
    await chrome.storage.local.set({ [SLEUTEL_HUB_OPEN]: { tab: naam, ts: Date.now() } });
  }

  async function openHub(naam) {
    const tab = await actieveTab();
    if (tab && SOMTODAY.test(tab.url || '')) {
      const r = await stuur(tab, 'hub-open', { tab: naam });
      if (r && r.ok) {
        window.close();
        return;
      }
      if (r) {
        meld('Er speelt al een pakket. Sluit dat eerst.');
        return;
      }
      await vraagPaneelNaLaden(naam);
      chrome.tabs.reload(tab.id);
    } else {
      await vraagPaneelNaLaden(naam);
      chrome.tabs.create({ url: CIJFERS_URL });
    }
    window.close();
  }

  document.querySelectorAll('[data-hub]').forEach((b) => b.addEventListener('click', () => openHub(b.dataset.hub)));

  // Zonder Somtoday: het paneel in een eigen tabblad (alles behalve het openen op de pagina zelf werkt daar ook).
  $('los-knop').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('hub.html') });
    window.close();
  });

  // ───────────────────────── Somtoday-paneel ─────────────────────────
  async function toonSomtoday() {
    const paneel = $('somtoday');
    const tab = await actieveTab();
    opSomtoday = !!(tab && SOMTODAY.test(tab.url || ''));
    const status = opSomtoday ? await stuur(tab, 'status') : null;
    paneel.textContent = '';
    $('los').hidden = opSomtoday;

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

    if (!afdekking) {
      paneel.append(kop('–', 'Afdekken staat uit', 'Zet “Cijfers afdekken” aan bij Instellingen om nieuwe cijfers te verbergen.', true));
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

  // ───────────────────────── Start ─────────────────────────
  (async () => {
    try {
      $('versie').textContent = chrome.runtime.getManifest().version;
    } catch (e) {
      /* geen versie */
    }
    try {
      const r = await chrome.storage.local.get(SLEUTEL_INSTELLINGEN);
      if (r[SLEUTEL_INSTELLINGEN] && r[SLEUTEL_INSTELLINGEN].afdekking === false) afdekking = false;
    } catch (e) {
      /* standaardwaarden */
    }
    await toonSomtoday();
  })();
})();
