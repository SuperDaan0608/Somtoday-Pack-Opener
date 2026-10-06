/*
 * Somtoday Pack Opener — koppeling met je echte cijfers op leerling.somtoday.nl.
 *
 * Wat dit doet:
 *  - Zoekt de cijfers in "Laatste cijfers" en legt over elk cijfer dat je nog niet hebt
 *    geopend een afdekking. Het cijfer zelf is dan onzichtbaar.
 *  - Klik je op de afdekking, dan start de pack opening met je echte vak, cijfer,
 *    onderwerp en weging. Zodra het cijfer onthuld wordt, onthoudt de extensie dat het geopend is.
 *
 * Alles blijft in je eigen browser: de cijfers worden alleen op de pagina gelezen en er
 * wordt niets verstuurd. Onthouden wat je al geopend hebt gebeurt met een korte hash.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`

  if (window.__spoContent) return;
  window.__spoContent = true;

  const SLEUTEL_GEOPEND = 'spo_geopend';
  const SLEUTEL_INSTELLINGEN = 'spo_instellingen';
  const STANDAARD = { afdekking: true, geluid: true, snel: false, opening: 'pak', galerij: true, laag: false, kaartThema: 'auto', kaartRand: 'standaard', zeldzaam: true, seizoen: true, gemiddelden: true, knop: true };
  const SLEUTEL_GALERIJ = 'spo_galerij';
  const SLEUTEL_DICHT = 'spo_dicht';
  const SLEUTEL_HUB_OPEN = 'spo_hub_open'; // { tab, ts }: de popup vraagt om het paneel te openen zodra Somtoday geladen is
  const OPENINGEN = ['pak', 'kluis', 'plinko', 'ster', 'raket', 'schiet', 'dans'];

  const RIJ = 'sl-laatste-resultaat-item'; // de klikbare rij in "Laatste cijfers"
  const ITEM = 'sl-resultaat-item'; // daarbinnen: vak, onderwerp, weging en cijfer
  const VERGRENDELD = 'spo-vergrendeld';

  let geopend = {}; // { hash van het cijfer: hoeveel keer geopend }
  let instellingen = { ...STANDAARD };
  let geladen = false;
  let bezig = false; // er is al een pakket open
  let rijen = []; // uitkomst van de laatste scan
  let groepen = []; // idem, gegroepeerd per lijst en cijfer
  const staat = new WeakMap(); // rij-element -> { cover, sig, oudLabel }
  let dicht = []; // de ongeopende cijfers die we kennen: [{ id, ts, vak, onderwerp, weging }]. Nooit het cijfer zelf.
  let toonToch = false; // 'Toch tonen' bij de gemiddelden: geldt tot je de pagina herlaadt

  // ───────────────────────── Hulpjes ─────────────────────────
  const tekst = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();

  // Korte, vaste hash (cyrb53) zodat we geen leesbare cijfers hoeven op te slaan.
  function hash(s) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  const schoonGeopend = (v) => {
    const uit = {};
    if (v && typeof v === 'object') {
      for (const [k, n] of Object.entries(v)) if (Number.isFinite(n) && n > 0) uit[k] = Math.floor(n);
    }
    return uit;
  };

  const schoonDicht = (v) =>
    (Array.isArray(v) ? v : [])
      .filter((x) => x && typeof x.id === 'string' && typeof x.vak === 'string')
      .slice(0, 20)
      .map((x) => ({ id: x.id, ts: Number(x.ts) || 0, vak: x.vak.slice(0, 60), onderwerp: String(x.onderwerp || '').slice(0, 120), weging: Number(x.weging) || 1 }));

  const isDatum = (s) =>
    /^(vandaag|gisteren|eergisteren|morgen|\d{1,2}\s+[a-zé]{3,9}\.?(\s+\d{4})?|(zon|maan|dins|woens|donder|vrij|zater)dag(\s.*)?)$/i.test(s);

  // ───────────────────────── Een cijfer uit de pagina lezen ─────────────────────────
  function lees(item) {
    const vak = tekst(item.querySelector('.titel'));
    const cijferTekst = tekst(item.querySelector('.cijfer'));
    // Alleen echte cijfers (1 t/m 10). Letters als "V" of "G" laten we met rust.
    if (!vak || !/^\d{1,2}(?:[.,]\d{1,2})?$/.test(cijferTekst)) return null;
    const cijfer = parseFloat(cijferTekst.replace(',', '.'));
    if (!(cijfer >= 1 && cijfer <= 10)) return null;

    // "Vandaag • SO Ecologie en duurzaamheid" -> datum + onderwerp
    const sub = tekst(item.querySelector('.subtitel'));
    let datum = '';
    let onderwerp = '';
    const punt = sub.indexOf('•');
    if (punt >= 0) {
      datum = sub.slice(0, punt).trim();
      onderwerp = sub.slice(punt + 1).trim();
    } else if (isDatum(sub)) {
      datum = sub;
    } else {
      onderwerp = sub;
    }

    let weging = 1;
    const wDom = tekst(item.querySelector('.weging')).match(/^(\d+(?:[.,]\d+)?)\s*x$/i);
    const wAria = (item.querySelector('.root')?.getAttribute('aria-label') || '').match(/Weging:\s*(\d+(?:[.,]\d+)?)/i);
    const w = wDom || wAria;
    if (w) weging = parseFloat(w[1].replace(',', '.')) || 1;

    // De datum zit er bewust niet in: "Vandaag" wordt morgen "Gisteren", en het cijfer
    // moet dan nog steeds als hetzelfde cijfer herkend worden.
    const sleutel = [vak, cijferTekst, weging, onderwerp].join('|').toLowerCase();
    return { vak, cijfer, cijferTekst, onderwerp, datum, weging, sleutel };
  }

  // ───────────────────────── De afdekking ─────────────────────────
  const COVER_HTML = `
    <style>
      :host { display: block; }
      .rij {
        box-sizing: border-box; position: relative; display: flex; align-items: center; gap: 14px;
        width: 100%; height: 100%; min-height: 64px; padding: 0 16px; overflow: hidden;
        border-radius: inherit; color: #fff; cursor: pointer; user-select: none; -webkit-user-select: none;
        font-family: 'SPO Text', 'Open Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
        background:
          radial-gradient(120% 180% at 0% 0%, rgba(124, 131, 255, 0.5), transparent 58%),
          linear-gradient(110deg, #10163a 0%, #1a2160 52%, #3b1d70 100%);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.14);
        transition: filter 0.2s;
      }
      .rij::after {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, 0.2) 50%, transparent 62%);
        background-size: 260% 100%; background-position: 130% 0;
        animation: glans 4.5s ease-in-out infinite;
      }
      @keyframes glans { 0%, 40% { background-position: 130% 0; } 100% { background-position: -130% 0; } }
      .rij:hover { filter: brightness(1.12); }
      .icoon {
        flex: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; color: #2a1a02;
        background: linear-gradient(135deg, #ffe27a, #ffb020 52%, #ff6a3d);
        box-shadow: 0 8px 20px -8px rgba(255, 150, 40, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.6);
      }
      .icoon svg { width: 22px; height: 22px; fill: currentColor; }
      .tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
      .kop { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .titel {
        font-family: 'SPO Display', 'Open Sans', system-ui, sans-serif; font-size: 16px; font-weight: 650;
        letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .nieuw {
        flex: none; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: 0.14em;
        text-transform: uppercase; color: #ffd24a; background: rgba(255, 210, 74, 0.14); border: 1px solid rgba(255, 210, 74, 0.4);
      }
      .sub { font-size: 12.5px; color: rgba(255, 255, 255, 0.64); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .knop {
        flex: none; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px 0 14px; border-radius: 11px;
        font-size: 13.5px; font-weight: 700; color: #241703;
        background: linear-gradient(135deg, #fff0b3, #ffd24a 45%, #ff7a3d);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 8px 22px -10px rgba(255, 140, 40, 0.95);
        transition: transform 0.15s;
      }
      .knop svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
      .rij:hover .knop { transform: translateY(-1px); }
      @media (max-width: 480px) { .knop span { display: none; } .knop { padding: 0 10px; } }
      @media (prefers-reduced-motion: reduce) { .rij::after { animation: none; } }
    </style>
    <div class="rij">
      <span class="icoon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3-6.3-2.2 6.3-2.2z"/></svg></span>
      <span class="tekst">
        <span class="kop"><span class="titel"></span><span class="nieuw">Nieuw</span></span>
        <span class="sub"></span>
      </span>
      <span class="knop"><span>Open pakket</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></span>
    </div>`;

  let fontsGevraagd = false;
  function laadFonts() {
    if (fontsGevraagd || !window.FontFace || !document.fonts) return;
    fontsGevraagd = true;
    try {
      const basis = chrome.runtime.getURL('fonts/');
      [
        ['SPO Display', 'unbounded.woff2', '200 900'],
        ['SPO Text', 'inter.woff2', '100 900'],
      ].forEach(([naam, bestand, gewicht]) => {
        new FontFace(naam, `url("${basis}${bestand}")`, { weight: gewicht })
          .load()
          .then((f) => document.fonts.add(f))
          .catch(() => {});
      });
    } catch (e) {
      /* dan maar systeemletters */
    }
  }

  function maakCover() {
    laadFonts();
    const el = document.createElement('spo-afdekking');
    el.setAttribute('aria-hidden', 'true');
    window.__SPO.zetHtml(el.attachShadow({ mode: 'open' }), COVER_HTML);
    return el;
  }

  function vulCover(el, d) {
    const w = el.shadowRoot;
    w.querySelector('.titel').textContent = d.vak;
    w.querySelector('.sub').textContent = [d.datum, d.onderwerp].filter(Boolean).join(' • ');
  }

  function vergrendel(rij) {
    const { host, d } = rij;
    let st = staat.get(host);
    if (!st) staat.set(host, (st = {}));

    if (!st.cover || st.cover.parentNode !== host) {
      st.cover = maakCover();
      st.sig = null;
      host.appendChild(st.cover);
    }
    if (st.sig !== rij.sig || st.vak !== d.vak || st.onderwerp !== d.onderwerp || st.datum !== d.datum) {
      vulCover(st.cover, d);
      st.sig = rij.sig;
      st.vak = d.vak;
      st.onderwerp = d.onderwerp;
      st.datum = d.datum;
    }
    if (!host.classList.contains(VERGRENDELD)) host.classList.add(VERGRENDELD);

    // De rij zelf blijft de toegankelijke knop; de afdekking is alleen visueel.
    const label = `Nieuw cijfer voor ${d.vak}. Open het pakket.`;
    if (host.getAttribute('aria-label') !== label) {
      if (!('oudLabel' in st)) st.oudLabel = host.getAttribute('aria-label');
      host.setAttribute('aria-label', label);
    }
  }

  function ontgrendel(host) {
    const st = staat.get(host);
    if (host.classList.contains(VERGRENDELD)) host.classList.remove(VERGRENDELD);
    if (!st) return;
    if (st.cover) {
      st.cover.remove();
      st.cover = null;
    }
    if ('oudLabel' in st) {
      if (st.oudLabel == null) host.removeAttribute('aria-label');
      else host.setAttribute('aria-label', st.oudLabel);
      delete st.oudLabel;
    }
    st.sig = null;
  }

  // Staat er een afgedekt cijfer op de pagina? Dan halen we in een rustig moment alvast de lettertypes en
  // geluiden op, zodat er bij de klik niets meer geladen hoeft te worden.
  let voorgeladen = false;
  function voorladen() {
    if (voorgeladen || !rijen.some((r) => r.vergrendeld)) return;
    voorgeladen = true;
    const doe = () => {
      try {
        if (typeof window.__somPackVoorlaad === 'function') window.__somPackVoorlaad(OPENINGEN.includes(instellingen.opening) ? instellingen.opening : 'pak', seizoenKeuze());
      } catch (x) {
        /* voorladen is een extraatje */
      }
    };
    if (window.requestIdleCallback) requestIdleCallback(doe, { timeout: 4000 });
    else setTimeout(doe, 1500);
  }

  // ───────────────────────── Scannen ─────────────────────────
  function scan() {
    if (!geladen) return;
    const verzameld = new Map(); // lijst -> (hash -> rijen)
    const nieuweRijen = [];

    for (const host of document.querySelectorAll(RIJ)) {
      const item = host.querySelector(ITEM);
      const d = item && lees(item);
      if (!d) {
        ontgrendel(host);
        continue;
      }
      const rij = { host, d, sig: hash(d.sleutel), vergrendeld: false };
      nieuweRijen.push(rij);
      const lijst = host.parentElement;
      if (!verzameld.has(lijst)) verzameld.set(lijst, new Map());
      const perSig = verzameld.get(lijst);
      if (!perSig.has(rij.sig)) perSig.set(rij.sig, []);
      perSig.get(rij.sig).push(rij);
    }

    // Twee cijfers die er precies hetzelfde uitzien (zelfde vak, cijfer, weging en onderwerp)
    // tellen we samen: heb je er N geopend, dan blijven de nieuwste (bovenste) afgedekt.
    const nieuweGroepen = [];
    for (const perSig of verzameld.values()) {
      for (const [sig, lijst] of perSig) {
        nieuweGroepen.push({ sig, lijst });
        const nogDicht = instellingen.afdekking ? Math.max(0, lijst.length - (geopend[sig] || 0)) : 0;
        lijst.forEach((rij, i) => {
          rij.vergrendeld = i < nogDicht;
        });
      }
    }

    for (const rij of nieuweRijen) {
      if (rij.vergrendeld) vergrendel(rij);
      else ontgrendel(rij.host);
    }

    rijen = nieuweRijen;
    groepen = nieuweGroepen;
    bewaarDicht(nieuweRijen);
    bewaakOverzicht();
    voorladen();
    werkKnopBij();
    document.documentElement.setAttribute('data-spo-klaar', '');
    observer.takeRecords(); // onze eigen wijzigingen negeren
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // ───────────────────────── Opslag ─────────────────────────
  function bewaar() {
    try {
      chrome.storage.local.set({ [SLEUTEL_GEOPEND]: geopend });
    } catch (e) {
      /* extensie is herladen: pagina verversen lost dat op */
    }
  }

  async function laad() {
    try {
      const r = await chrome.storage.local.get([SLEUTEL_GEOPEND, SLEUTEL_INSTELLINGEN, SLEUTEL_DICHT]);
      geopend = schoonGeopend(r[SLEUTEL_GEOPEND]);
      dicht = schoonDicht(r[SLEUTEL_DICHT]);
      instellingen = { ...STANDAARD, ...(r[SLEUTEL_INSTELLINGEN] || {}) };
    } catch (e) {
      /* zonder opslag begint alles afgedekt */
    }
    geladen = true;
    scan();
    wachtendPaneel();
  }

  try {
    chrome.storage.onChanged.addListener((wijzigingen, gebied) => {
      if (gebied !== 'local') return;
      if (wijzigingen[SLEUTEL_GEOPEND]) geopend = schoonGeopend(wijzigingen[SLEUTEL_GEOPEND].newValue);
      if (wijzigingen[SLEUTEL_DICHT]) dicht = schoonDicht(wijzigingen[SLEUTEL_DICHT].newValue);
      if (wijzigingen[SLEUTEL_INSTELLINGEN]) instellingen = { ...STANDAARD, ...(wijzigingen[SLEUTEL_INSTELLINGEN].newValue || {}) };
      scan();
    });
  } catch (e) {
    /* geen opslag beschikbaar */
  }

  // ───────────────────────── Welke opening? ─────────────────────────
  // Bij "Verras me" kiezen we er één per cijfer, en houden die vast tot je het cijfer opent: dan kiezen het opwarmen
  // (zodra je met de muis boven het cijfer hangt) en het echte openen dezelfde opening.
  // De naam van de leerling, alleen voor de kaart en het deelplaatje. Hij wordt elke keer opnieuw van de pagina gelezen
  // en nergens opgeslagen: niet in de instellingen, niet in de galerij en niet in een variabele die blijft hangen.
  const NIET_EEN_NAAM = /^(somtoday|cijfers?|agenda|huiswerk|berichten|vandaag|home|uitloggen|inloggen|instellingen|profiel|account|menu|nieuw|laatste|rooster|afwezigheid|studiewijzer|portfolio|vakken|resultaten|overzicht|help|zoeken)$/i;
  const NAAMPATROON = /^\p{Lu}[\p{L}'’.-]*(\s+(?:(?:van|de|der|den|ter|ten|te|het|op|in)\s+)*\p{Lu}[\p{L}'’.-]*){1,3}$/u;
  function leesNaam() {
    try {
      const goed = (t) => {
        t = String(t || '').replace(/\s+/g, ' ').trim();
        if (t.length < 4 || t.length > 40) return '';
        if (t.split(' ').some((w) => NIET_EEN_NAAM.test(w))) return '';
        return NAAMPATROON.test(t) ? t : '';
      };
      // 1. een label zoals "Account van Jan de Vries" of "Ingelogd als ..."
      for (const el of document.querySelectorAll('[aria-label],[title]')) {
        const l = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        const m = l.match(/^(?:account|profiel|gebruiker|ingelogd als|menu)\s*(?:van|:)?\s+(.+)$/i);
        if (m && goed(m[1])) return goed(m[1]);
      }
      // 2. korte tekst in de kop van de pagina die op een naam lijkt
      const koppen = document.querySelectorAll('header, nav, [role="banner"], [class*="header"], [class*="toolbar"], [class*="menu"], [class*="profiel"], [class*="account"], [class*="gebruiker"]');
      for (const k of koppen) {
        const r = k.getBoundingClientRect();
        if (r.top > 160 || r.height > 220) continue;
        for (const el of k.querySelectorAll('span, a, button, div, p')) {
          if (el.children.length > 1) continue;
          const n = goed(el.textContent);
          if (n) return n;
        }
      }
    } catch (e) {
      /* geen naam is ook goed */
    }
    return '';
  }

  // Eén op de tien kaarten is zeldzaam (instelling 'zeldzaam'). Net als bij 'Verras me' dobbelen we één keer per cijfer en houden
  // we de uitkomst vast tot het pakket dicht is: zo zijn het opwarmen (muis erboven) en het echte openen het eens.
  function zeldzaamVoor(rij) {
    if (instellingen.zeldzaam === false) return false;
    let st = staat.get(rij.host);
    if (!st) staat.set(rij.host, (st = {}));
    if (st.zeldzaam == null) {
      const w = new Uint32Array(1);
      crypto.getRandomValues(w);
      st.zeldzaam = w[0] / 4294967296 < 0.1;
    }
    return st.zeldzaam;
  }
  const seizoenKeuze = () => (instellingen.seizoen === false ? 'geen' : 'auto');

  function openingVoor(rij) {
    const keuze = instellingen.opening;
    if (OPENINGEN.includes(keuze)) return keuze;
    if (keuze !== 'willekeurig') return 'pak';
    let st = staat.get(rij.host);
    if (!st) staat.set(rij.host, (st = {}));
    if (!st.willekeur) st.willekeur = OPENINGEN[Math.floor(Math.random() * OPENINGEN.length)];
    return st.willekeur;
  }

  // ───────────────────────── Pakket openen ─────────────────────────
  function markeer(sig) {
    geopend[sig] = (geopend[sig] || 0) + 1;
    bewaar();
    scan();
  }

  // ───────────────────────── Onthouden welke cijfers nog dicht zijn ─────────────────────────
  // Alleen vak, onderwerp en weging van cijfers die je nog niet hebt geopend, nooit het cijfer zelf. Dat gebruikt de vriendenpagina
  // ('Voorspel mijn cijfer') en het afdekken van de gemiddelden (die weten zo dat er een nieuw cijfer is, ook als je niet op 'Laatste cijfers' staat).
  // Staat er op deze pagina geen lijst met cijfers, dan blijft de lijst zoals hij was.
  function bewaarDicht(rijenNu) {
    if (!rijenNu.length) return;
    const oud = new Map(dicht.map((x) => [x.id, x]));
    const gezien = new Set();
    const nieuw = [];
    for (const r of rijenNu) {
      if (!r.vergrendeld || gezien.has(r.sig)) continue;
      gezien.add(r.sig);
      const o = oud.get(r.sig);
      nieuw.push({ id: r.sig, ts: o ? o.ts : Date.now(), vak: r.d.vak.slice(0, 60), onderwerp: r.d.onderwerp.slice(0, 120), weging: r.d.weging });
    }
    if (JSON.stringify(nieuw.slice(0, 20)) === JSON.stringify(dicht)) return;
    dicht = nieuw.slice(0, 20);
    try {
      chrome.storage.local.set({ [SLEUTEL_DICHT]: dicht });
    } catch (e) {
      /* extensie is herladen: pagina verversen lost dat op */
    }
  }

  // ───────────────────────── Gemiddelden en cijferoverzicht afdekken ─────────────────────────
  // Zolang er een nieuw cijfer dicht is, verklappen 'Vakgemiddelden' en 'Cijferoverzicht' het (een gemiddelde dat omhoog of omlaag gaat,
  // of het cijfer zelf in de lijst). Daarom vervangen we dat tabblad door een melding, tot je het cijfer hebt geopend of 'Toch tonen' kiest.
  // Somtoday zet de inhoud van een tabblad direct na de <router-outlet> in <sl-cijfers> (naast de tabbladen); daar grijpen we in.
  const VERBORGEN = 'spo-verborgen';
  const OVERZICHT_TAB = /vakgemiddelden|cijferoverzicht/i;
  let overzichtMelding = null;
  let overzichtDoel = null;

  function maakOverzichtMelding() {
    const el = document.createElement('spo-overzicht-afdekking');
    window.__SPO.zetHtml(
      el.attachShadow({ mode: 'open' }),
      `<style>
        :host { display: block; margin: 16px 0; }
        .kaart { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 14px 20px; padding: 18px 20px; border-radius: 16px; color: #fff;
          font-family: 'SPO Text', 'Open Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
          background: linear-gradient(110deg, #10163a 0%, #1a2160 52%, #3b1d70 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
        .tekst { flex: 1 1 260px; min-width: 0; }
        .kop { font-family: 'SPO Display', 'Open Sans', system-ui, sans-serif; font-size: 17px; font-weight: 650; letter-spacing: -.02em; }
        p { margin: 6px 0 0; font-size: 13.5px; line-height: 1.45; color: rgba(255,255,255,.75); }
        .acties { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
        button { font: inherit; cursor: pointer; }
        button:focus-visible { outline: 2px solid #ffd24a; outline-offset: 2px; }
        .goud { height: 38px; padding: 0 16px; border: 0; border-radius: 11px; font-size: 13.5px; font-weight: 700; color: #241703;
          background: linear-gradient(135deg, #fff0b3, #ffd24a 45%, #ff7a3d); }
        .tekstknop { padding: 4px 2px; border: 0; background: none; color: rgba(255,255,255,.7); font-size: 12.5px; text-decoration: underline; text-underline-offset: 2px; }
        .tekstknop:hover { color: #fff; }
      </style>
      <div class="kaart" role="region" aria-label="Overzicht afgedekt">
        <div class="tekst"><div class="kop">Open eerst je nieuwe cijfer</div><p class="uitleg"></p></div>
        <div class="acties"><button type="button" class="goud" data-a="naar">Naar mijn nieuwe cijfers</button><button type="button" class="tekstknop" data-a="toch">Toch tonen</button></div>
      </div>`,
    );
    el.shadowRoot.addEventListener('click', (e) => {
      const knop = e.target instanceof Element ? e.target.closest('[data-a]') : null;
      if (!knop) return;
      if (knop.dataset.a === 'toch') {
        toonToch = true;
        bewaakOverzicht();
      } else {
        const eerste = document.querySelector('sl-cijfers hmy-switch[role="tab"], sl-cijfers hmy-tab');
        if (eerste) eerste.click();
      }
    });
    return el;
  }

  function opruimenOverzicht() {
    if (overzichtDoel) overzichtDoel.classList.remove(VERBORGEN);
    overzichtDoel = null;
    if (overzichtMelding) overzichtMelding.remove();
    overzichtMelding = null;
  }

  function bewaakOverzicht() {
    const aan = geladen && instellingen.afdekking && instellingen.gemiddelden !== false && dicht.length > 0 && !toonToch;
    let doel = null;
    if (aan) {
      const cijfers = document.querySelector('sl-cijfers');
      if (cijfers) {
        const geselecteerd = Array.from(cijfers.querySelectorAll('hmy-switch[aria-selected="true"], hmy-tab[aria-selected="true"]'));
        const opOverzicht = geselecteerd.some((t) => OVERZICHT_TAB.test(t.getAttribute('label') || t.getAttribute('data-gtm') || t.textContent || ''));
        const outlet = cijfers.querySelector('router-outlet'); // de eerste: die van dit scherm (eventuele geneste komen daarna)
        let volgend = outlet ? outlet.nextElementSibling : null;
        if (volgend && volgend === overzichtMelding) volgend = volgend.nextElementSibling;
        if (opOverzicht && volgend) doel = volgend;
      }
    }
    if (!doel) {
      if (overzichtDoel || overzichtMelding) opruimenOverzicht();
      return;
    }
    if (overzichtDoel !== doel) {
      opruimenOverzicht();
      overzichtDoel = doel;
      doel.classList.add(VERBORGEN);
    }
    if (!overzichtMelding || overzichtMelding.parentNode !== doel.parentNode) {
      if (overzichtMelding) overzichtMelding.remove();
      overzichtMelding = maakOverzichtMelding();
      doel.parentNode.insertBefore(overzichtMelding, doel);
    }
    laadFonts();
    const n = dicht.length;
    const vakken = Array.from(new Set(dicht.map((x) => x.vak))).slice(0, 3).join(', ');
    overzichtMelding.shadowRoot.querySelector('.uitleg').textContent =
      `Dit overzicht zou je nieuwe cijfer al verklappen. Je hebt nog ${n === 1 ? '1 cijfer dat' : n + ' cijfers die'} je niet hebt geopend (${vakken}). Open eerst je pakket; daarna staat alles weer open.`;
  }

  function open(rij, { direct }) {
    if (bezig || typeof window.__somPackRun !== 'function') return false;
    bezig = true;
    let gemarkeerd = false;
    const d = rij.d;
    window.__somPack = {
      vak: d.vak,
      cijfer: d.cijfer,
      onderwerp: d.onderwerp || 'Nieuw cijfer',
      weging: d.weging,
      snel: !!instellingen.snel,
      laag: !!instellingen.laag,
      persoon: leesNaam(),
      kaartThema: instellingen.kaartThema,
      kaartRand: instellingen.kaartRand,
      stil: !instellingen.geluid,
      opening: openingVoor(rij),
      zeldzaam: zeldzaamVoor(rij),
      seizoen: seizoenKeuze(),
      direct,
      opOnthuld() {
        if (gemarkeerd) return;
        gemarkeerd = true;
        markeer(rij.sig);
      },
      // de miniatuur van de kaart, kort na de onthulling: bewaren voor de galerij (alleen in deze browser)
      opKaartKlaar(k) {
        if (instellingen.galerij === false || !k || typeof k.kaart !== 'string') return;
        try {
          chrome.storage.local.get(SLEUTEL_GALERIJ).then((r) => {
            const lijst = Array.isArray(r[SLEUTEL_GALERIJ]) ? r[SLEUTEL_GALERIJ].filter((x) => x && x.id !== rij.sig) : [];
            lijst.unshift({ id: rij.sig, ts: Date.now(), vak: String(k.vak).slice(0, 60), cijfer: k.cijfer, onderwerp: String(k.onderwerp).slice(0, 120), weging: k.weging, opening: k.opening, tier: k.tier, zeldzaam: !!k.zeldzaam, kaart: k.kaart });
            chrome.storage.local.set({ [SLEUTEL_GALERIJ]: lijst.slice(0, 150) });
          });
        } catch (e) {
          /* opslag niet beschikbaar */
        }
      },
      opGesloten() {
        bezig = false;
        const st = staat.get(rij.host);
        if (st) {
          st.willekeur = null; // de volgende keer weer een nieuwe verrassing
          st.zeldzaam = null;
        }
        scan();
      },
    };
    try {
      window.__somPackRun();
    } catch (e) {
      bezig = false;
      return false;
    }
    return true;
  }

  // ───────────────────────── Klikken en toetsen onderscheppen ─────────────────────────
  // In de capture-fase, zodat de eigen klik-afhandeling van Somtoday (die het cijfer zou
  // tonen) nooit te zien krijgt dat je op een afgedekt cijfer klikt.
  const vergrendeldeRij = (e) => (e.target instanceof Element ? e.target.closest('.' + VERGRENDELD) : null);

  document.addEventListener(
    'click',
    (e) => {
      const host = vergrendeldeRij(e);
      if (!host) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const rij = rijen.find((r) => r.host === host);
      if (rij) open(rij, { direct: true });
    },
    true,
  );

  // Zodra je met de muis (of het toetsenbord) bij een afgedekt cijfer komt, zetten we de videokaart alvast
  // klaar. Dan begint de animatie bij de klik zonder haperen.
  const opwarmen = (e) => {
    const host = vergrendeldeRij(e);
    if (!host) return;
    try {
      const rij = rijen.find((r) => r.host === host);
      // dezelfde gegevens als bij open(): zo herkent de animatie dat de afbeeldingen al klaarstaan
      if (typeof window.__somPackWarm === 'function') {
        window.__somPackWarm(rij && { vak: rij.d.vak, cijfer: rij.d.cijfer, onderwerp: rij.d.onderwerp || 'Nieuw cijfer', weging: rij.d.weging, snel: !!instellingen.snel, laag: !!instellingen.laag, persoon: leesNaam(), kaartThema: instellingen.kaartThema, kaartRand: instellingen.kaartRand, opening: openingVoor(rij), zeldzaam: zeldzaamVoor(rij), seizoen: seizoenKeuze() });
      }
    } catch (x) {
      /* opwarmen is een extraatje */
    }
  };
  document.addEventListener('pointerover', opwarmen, true);
  document.addEventListener('focusin', opwarmen, true);

  for (const soort of ['keydown', 'keyup', 'keypress']) {
    document.addEventListener(
      soort,
      (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const host = vergrendeldeRij(e);
        if (!host) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (soort !== 'keydown' || e.repeat) return;
        const rij = rijen.find((r) => r.host === host);
        if (rij) open(rij, { direct: true });
      },
      true,
    );
  }

  // ───────────────────────── De startknop en het paneel ─────────────────────────
  // Een knop rechtsonder op de pagina opent het Pack Opener-paneel: hub.html in een iframe boven Somtoday, met alles erin
  // (galerij, kaart ontwerpen, vrienden, calculator, proberen, instellingen, geluiden).
  //
  // Berichten tussen dit script en het paneel (window.postMessage; we accepteren alleen berichten van ons eigen iframe):
  //   paneel -> hier: { bron: 'spo-hub', versie: 1, type, id?, ... }
  //     hub-klaar | sluiten | open-volgende | alles-geopend | alles-afdekken | naar-cijfers | proef { data }
  //   hier -> paneel: { bron: 'spo-pagina', versie: 1, type, ... }
  //     init { tab, status } | status { status } | tab { tab } | focus { waar } | antwoord { id, ok, status }
  const HUB_TABS = ['overzicht', 'galerij', 'kaart', 'vrienden', 'rekenen', 'proberen', 'instellingen', 'geluiden'];
  const HUB_WACHT_MS = 2500; // zo lang wachten we op 'hub-klaar' van het iframe
  const CIJFERS_PAD = '/cijfers';
  // Het origin van onze eigen extensiepagina's; null als de browser er geen geeft (dan vertrouwen we alleen op event.source).
  const eigenOrigin = (() => {
    try {
      const o = new URL(chrome.runtime.getURL('')).origin;
      return o && o !== 'null' ? o : null;
    } catch (e) {
      return null;
    }
  })();

  const KNOP_HTML = `
    <style>
      :host { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; display: block; }
      :host([hidden]) { display: none !important; }
      * { box-sizing: border-box; }
      .knop {
        position: relative; display: flex; align-items: center; gap: 10px; height: 52px; margin: 0; padding: 0 18px 0 8px;
        border: 0; border-radius: 999px; cursor: pointer; color: #fff; -webkit-appearance: none; appearance: none;
        font-family: 'SPO Display', 'Open Sans', system-ui, sans-serif; font-size: 14.5px; font-weight: 650; line-height: 1; letter-spacing: -0.01em;
        background:
          radial-gradient(120% 180% at 0% 0%, rgba(124, 131, 255, 0.5), transparent 58%),
          linear-gradient(110deg, #10163a 0%, #1a2160 52%, #3b1d70 100%);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2), 0 0 0 1px rgba(255, 210, 74, 0.3), 0 12px 28px -8px rgba(8, 10, 40, 0.75);
        transition: transform 0.15s, filter 0.2s;
      }
      .knop:hover { filter: brightness(1.14); transform: translateY(-1px); }
      .knop:active { transform: scale(0.98); }
      .knop:focus-visible { outline: 3px solid #ffd24a; outline-offset: 3px; }
      .merk { flex: none; width: 36px; height: 36px; }
      .tekst { white-space: nowrap; }
      .badge {
        min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px; font-size: 12px; font-weight: 800; line-height: 22px; text-align: center;
        color: #241703; background: linear-gradient(135deg, #fff0b3, #ffd24a 45%, #ff7a3d);
      }
      .badge[hidden] { display: none; }
      .uit { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      /* Smal scherm: alleen het icoon, boven Somtoday's eigen onderbalk (de precieze hoogte meet het script in --onder) */
      @media (max-width: 599px) {
        :host { right: 14px; bottom: var(--onder, calc(84px + env(safe-area-inset-bottom, 0px))); }
        .knop { width: 52px; padding: 0; justify-content: center; }
        .tekst { display: none; }
        .merk { width: 38px; height: 38px; }
        .badge { position: absolute; top: -6px; right: -6px; box-shadow: 0 0 0 2px #080a14; }
      }
      @media (prefers-reduced-motion: reduce) { .knop { transition: none; } }
      @media print { :host { display: none !important; } }
    </style>
    <button type="button" class="knop" aria-label="Pack Opener openen" aria-haspopup="dialog" aria-describedby="uit">
      <svg class="merk" viewBox="0 0 40 40" aria-hidden="true">
        <defs><linearGradient id="goud" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="0.55" stop-color="#ffb020"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient></defs>
        <rect x="6.5" y="8" width="17" height="24" rx="4" transform="rotate(-11 15 20)" fill="#ffffff" fill-opacity="0.3"/>
        <rect x="14" y="7.5" width="18.5" height="25" rx="4.2" fill="url(#goud)"/>
        <path d="M23.2 13.6l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z" fill="#2a1a02"/>
      </svg>
      <span class="tekst">Pack Opener</span>
      <span class="badge" aria-hidden="true" hidden></span>
    </button>
    <span class="uit" id="uit"></span>`;

  let knopHost = null;
  let plaatsGepland = false;

  function maakKnop() {
    if (!document.body || !window.__SPO) return;
    laadFonts();
    knopHost = document.createElement('spo-knop');
    window.__SPO.zetHtml(knopHost.attachShadow({ mode: 'open' }), KNOP_HTML);
    knopHost.shadowRoot.querySelector('.knop').addEventListener('click', () => openPaneel('overzicht'));
    document.documentElement.appendChild(knopHost);
    observer.takeRecords(); // onze eigen wijziging negeren
  }

  // Op een smal scherm staat Somtoday's eigen tabbalk onderin: de knop gaat daar net boven.
  function plaatsKnop() {
    if (!knopHost) return;
    let onder = null;
    if (window.innerWidth < 600) {
      const balk = document.querySelector('sl-tab-bar');
      if (balk) {
        const r = balk.getBoundingClientRect();
        if (r.height > 0 && r.top < window.innerHeight && r.bottom > window.innerHeight - 4) onder = Math.ceil(window.innerHeight - r.top) + 14;
      }
    }
    if (onder == null) knopHost.style.removeProperty('--onder');
    else knopHost.style.setProperty('--onder', onder + 'px');
  }

  function werkKnopBij() {
    const toon = geladen && instellingen.knop !== false && !paneel && !bezig;
    if (!toon) {
      if (knopHost) knopHost.hidden = true;
      return;
    }
    if (!knopHost) maakKnop();
    if (!knopHost) return;
    knopHost.hidden = false;
    const n = dicht.length;
    const badge = knopHost.shadowRoot.querySelector('.badge');
    const tekst = n > 99 ? '99+' : String(n);
    if (badge.textContent !== (n ? tekst : '')) badge.textContent = n ? tekst : '';
    badge.hidden = n === 0;
    const uit = n === 0 ? '' : n === 1 ? '1 nieuw cijfer klaar' : `${n} nieuwe cijfers klaar`;
    const el = knopHost.shadowRoot.getElementById('uit');
    if (el.textContent !== uit) el.textContent = uit;
    if (!plaatsGepland) {
      plaatsGepland = true;
      requestAnimationFrame(() => {
        plaatsGepland = false;
        plaatsKnop();
      });
    }
  }
  window.addEventListener('resize', () => werkKnopBij());

  // ── Het paneel ──
  const PANEEL_HTML = `
    <style>
      :host { position: fixed; inset: 0; z-index: 2147483647; display: block; }
      * { box-sizing: border-box; }
      /* Een echt modaal venster (<dialog>): het staat in de 'top layer', dus boven alles op de pagina, welke z-index die ook heeft,
         en de rest van de pagina is zolang het open is niet te bedienen. */
      .laag {
        position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 24px; border: 0; overflow: hidden;
        align-items: center; justify-content: center; color: inherit;
        background: rgba(4, 5, 12, 0.74); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
        animation: laag-in 0.18s ease-out;
      }
      .laag[open] { display: flex; }
      .laag::backdrop { background: transparent; }
      .dialoog {
        position: relative; width: min(1180px, 100%); height: min(90vh, 920px); overflow: hidden; border-radius: 22px; background: #080a14;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14), 0 40px 100px -20px rgba(0, 0, 0, 0.85);
        animation: dialoog-in 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
      }
      iframe { display: block; width: 100%; height: 100%; border: 0; background: #080a14; color-scheme: dark; }
      .val { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
      .mislukt {
        position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 28px; text-align: center;
        color: #eef1f8; background: #080a14; font-family: 'SPO Text', 'Open Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.5;
      }
      .mislukt[hidden] { display: none; }
      .mislukt h2 { margin: 0; font-family: 'SPO Display', 'Open Sans', system-ui, sans-serif; font-size: 20px; font-weight: 700; }
      .mislukt p { margin: 0; max-width: 420px; color: #a5aec4; }
      .acties { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
      button { margin: 0; min-height: 44px; padding: 0 20px; border-radius: 12px; font: 650 15px 'SPO Text', system-ui, sans-serif; cursor: pointer; color: #eef1f8; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18); }
      button.goud { border: 0; color: #241703; background: linear-gradient(135deg, #fff0b3, #ffd24a 45%, #ff7a3d); }
      button:focus-visible { outline: 2px solid #ffd24a; outline-offset: 2px; }
      /* Telefoon (of een laag, liggend scherm): het paneel vult het hele scherm */
      @media (max-width: 639px), (max-height: 500px) {
        .laag { padding: 0; }
        .dialoog { width: 100%; height: 100%; border-radius: 0; }
      }
      @keyframes laag-in { from { opacity: 0; } }
      @keyframes dialoog-in { from { opacity: 0; transform: translateY(10px) scale(0.985); } }
      @media (prefers-reduced-motion: reduce) { .laag, .dialoog { animation: none; } }
    </style>
    <dialog class="laag" aria-label="Pack Opener">
      <div class="dialoog">
        <div class="val" tabindex="0" data-val="voor"></div>
        <iframe title="Pack Opener" allow="clipboard-write"></iframe>
        <div class="val" tabindex="0" data-val="na"></div>
        <div class="mislukt" role="alert" hidden>
          <h2>Het paneel kon niet worden geladen</h2>
          <p>Somtoday laat het hier niet toe. Je kunt de Pack Opener wel in een eigen tabblad openen.</p>
          <div class="acties"><button type="button" class="goud" data-a="tabblad">Openen in een nieuw tabblad</button><button type="button" data-a="sluit">Sluiten</button></div>
        </div>
      </div>
    </dialog>`;

  let paneel = null; // { host, iframe, tab, klaar, timer, vorigFocus, oudeOverflow }

  const hubUrl = (tab) => chrome.runtime.getURL('hub.html') + '#' + tab;

  function naarHub(bericht) {
    if (!paneel || !paneel.iframe.contentWindow) return;
    try {
      paneel.iframe.contentWindow.postMessage({ bron: 'spo-pagina', versie: 1, ...bericht }, eigenOrigin || '*');
    } catch (e) {
      /* het iframe is al weg */
    }
  }

  function openPaneel(tab) {
    if (!document.body || bezig || !window.__SPO) return false;
    if (paneel) {
      paneel.tab = tab;
      naarHub({ type: 'tab', tab });
      return true;
    }
    laadFonts();
    const host = document.createElement('spo-paneel');
    const wortel = host.attachShadow({ mode: 'open' });
    window.__SPO.zetHtml(wortel, PANEEL_HTML);
    const iframe = wortel.querySelector('iframe');
    paneel = {
      host,
      iframe,
      tab,
      klaar: false,
      timer: 0,
      vorigFocus: document.activeElement,
      oudeOverflow: [document.documentElement.style.overflow, document.body.style.overflow],
    };
    // Achtergrond niet meer laten scrollen
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    // Klik naast het paneel sluit het
    wortel.querySelector('.laag').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) sluitPaneel(true);
    });
    wortel.querySelector('.laag').addEventListener('touchmove', (e) => {
      if (e.target === e.currentTarget) e.preventDefault();
    }, { passive: false });
    // Focus-val: Tab voorbij het laatste (of Shift+Tab voor het eerste) element van het paneel brengt je terug in het paneel
    wortel.addEventListener('focusin', (e) => {
      const val = e.target instanceof Element ? e.target.getAttribute('data-val') : null;
      if (!val) return;
      iframe.focus();
      naarHub({ type: 'focus', waar: val === 'na' ? 'begin' : 'einde' });
    });
    wortel.addEventListener('click', (e) => {
      const knop = e.target instanceof Element ? e.target.closest('[data-a]') : null;
      if (!knop) return;
      if (knop.dataset.a === 'tabblad') {
        if (window.open(hubUrl(paneel.tab), '_blank')) sluitPaneel(false);
      } else {
        sluitPaneel(true);
      }
    });
    wortel.querySelector('.laag').addEventListener('cancel', (e) => {
      e.preventDefault();
      sluitPaneel(true);
    });
    iframe.addEventListener('load', () => iframe.focus({ preventScroll: true }));
    document.documentElement.appendChild(host);
    try {
      wortel.querySelector('.laag').showModal();
    } catch (e) {
      wortel.querySelector('.laag').setAttribute('open', ''); // zonder modaal venster werkt het ook, alleen niet altijd boven alles
    }
    iframe.src = chrome.runtime.getURL('hub.html');
    paneel.timer = setTimeout(valTerug, HUB_WACHT_MS);
    werkKnopBij(); // verbergt de knop zolang het paneel open is
    observer.takeRecords();
    return true;
  }

  function sluitPaneel(focusTerug) {
    if (!paneel) return;
    const { host, vorigFocus, oudeOverflow, timer } = paneel;
    clearTimeout(timer);
    host.remove();
    document.documentElement.style.overflow = oudeOverflow[0];
    document.body.style.overflow = oudeOverflow[1];
    paneel = null;
    werkKnopBij();
    if (focusTerug) {
      const knop = knopHost && !knopHost.hidden ? knopHost.shadowRoot.querySelector('.knop') : null;
      const doel = knop || (vorigFocus && vorigFocus.isConnected ? vorigFocus : null);
      if (doel && doel.focus) doel.focus({ preventScroll: true });
    }
    observer.takeRecords();
  }

  // Kwam er geen 'hub-klaar' van het iframe (bijvoorbeeld omdat een strenge CSP van de pagina het iframe blokkeert), dan openen we
  // hetzelfde paneel in een eigen tabblad. window.open mag alleen vlak na een klik; is die er niet (het paneel werd bijvoorbeeld door
  // de popup geopend) of wordt het geblokkeerd, dan zetten we in het paneel een knop die dat met een klik doet.
  function valTerug() {
    if (!paneel || paneel.klaar) return;
    let w = null;
    if (!navigator.userActivation || navigator.userActivation.isActive) {
      try {
        w = window.open(hubUrl(paneel.tab), '_blank');
      } catch (e) {
        w = null;
      }
    }
    if (w) {
      sluitPaneel(false);
      return;
    }
    const wortel = paneel.host.shadowRoot;
    wortel.querySelector('iframe').hidden = true;
    const kaart = wortel.querySelector('.mislukt');
    kaart.hidden = false;
    kaart.querySelector('[data-a="tabblad"]').focus();
  }

  function startProef(d) {
    if (bezig || typeof window.__somPackRun !== 'function' || !d || typeof d !== 'object') return false;
    const cijfer = Number(d.cijfer);
    if (!(cijfer >= 1 && cijfer <= 10)) return false;
    bezig = true;
    // Gewoon een pakket met zelfgekozen gegevens: er wordt niets onthouden (geen galerij, niet als geopend gemarkeerd).
    window.__somPack = {
      vak: String(d.vak || 'Vak').slice(0, 40),
      cijfer: Math.round(cijfer * 10) / 10,
      onderwerp: String(d.onderwerp || 'Toets').slice(0, 80),
      weging: Math.min(4, Math.max(1, Math.round(Number(d.weging)) || 1)),
      snel: !!instellingen.snel,
      laag: !!instellingen.laag,
      stil: !instellingen.geluid,
      kaartThema: instellingen.kaartThema,
      kaartRand: instellingen.kaartRand,
      opening: instellingen.opening,
      zeldzaam: d.zeldzaam === true,
      seizoen: ['auto', 'halloween', 'geen'].includes(d.seizoen) ? d.seizoen : 'auto',
      direct: true, // de klik in het paneel is er al geweest
      opGesloten() {
        bezig = false;
        scan();
      },
    };
    try {
      window.__somPackRun();
    } catch (e) {
      bezig = false;
      return false;
    }
    return true;
  }

  function behandelHubBericht(m) {
    const antwoord = (extra) => naarHub({ type: 'antwoord', id: m.id, ...extra });
    switch (m.type) {
      case 'hub-klaar':
        paneel.klaar = true;
        clearTimeout(paneel.timer);
        paneel.iframe.focus({ preventScroll: true });
        naarHub({ type: 'init', tab: paneel.tab, status: status() });
        break;
      case 'sluiten':
        sluitPaneel(true);
        break;
      case 'status':
        antwoord({ ok: true, status: status() });
        break;
      case 'open-volgende': {
        const rij = rijen.find((r) => r.vergrendeld);
        if (!rij || bezig || typeof window.__somPackRun !== 'function') {
          antwoord({ ok: false, reden: 'geen-rij', status: status() });
          break;
        }
        sluitPaneel(false);
        if (!open(rij, { direct: true })) {
          openPaneel('overzicht');
          break;
        }
        werkKnopBij();
        break;
      }
      case 'alles-geopend':
        allesGeopend();
        antwoord({ ok: true, status: status() });
        break;
      case 'alles-afdekken':
        allesAfdekken();
        antwoord({ ok: true, status: status() });
        break;
      case 'naar-cijfers':
        sluitPaneel(false);
        if (location.pathname !== CIJFERS_PAD) location.assign(CIJFERS_PAD);
        break;
      case 'proef':
        if (startProef(m.data)) {
          sluitPaneel(false);
          werkKnopBij();
        } else {
          antwoord({ ok: false });
        }
        break;
    }
  }

  window.addEventListener('message', (e) => {
    // Alleen berichten van ons eigen iframe, met de vaste vorm.
    if (!paneel || e.source !== paneel.iframe.contentWindow) return;
    if (eigenOrigin && e.origin !== eigenOrigin) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.bron !== 'spo-hub' || m.versie !== 1 || typeof m.type !== 'string') return;
    try {
      behandelHubBericht(m);
    } catch (x) {
      /* een fout in het paneel mag de pagina niet storen */
    }
  });

  // Esc sluit het paneel (staat de focus in het paneel zelf, dan regelt hub.js dat)
  document.addEventListener(
    'keydown',
    (e) => {
      if (!paneel || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      sluitPaneel(true);
    },
    true,
  );

  // De popup kan het paneel niet openen als je niet op Somtoday bent: dan zet hij { tab, ts } in de opslag en opent hij Somtoday.
  // Na het laden openen wij het paneel (alleen als dat verzoek net is gedaan; daarna wissen we het).
  async function wachtendPaneel() {
    try {
      const w = (await chrome.storage.local.get(SLEUTEL_HUB_OPEN))[SLEUTEL_HUB_OPEN];
      if (!w) return;
      await chrome.storage.local.remove(SLEUTEL_HUB_OPEN);
      const leeftijd = Date.now() - Number(w.ts);
      if (Number.isFinite(leeftijd) && leeftijd > -5000 && leeftijd < 30000) openPaneel(HUB_TABS.includes(w.tab) ? w.tab : 'overzicht');
    } catch (e) {
      /* geen opslag */
    }
  }

  // ───────────────────────── Berichten van de popup ─────────────────────────
  function status() {
    const dicht = rijen.filter((r) => r.vergrendeld);
    return { ok: true, totaal: rijen.length, ongeopend: dicht.length, vakken: dicht.map((r) => r.d.vak), pad: location.pathname };
  }

  function allesGeopend() {
    for (const { sig, lijst } of groepen) geopend[sig] = Math.max(geopend[sig] || 0, lijst.length);
    bewaar();
    dicht = [];
    try {
      chrome.storage.local.set({ [SLEUTEL_DICHT]: dicht });
    } catch (e) {
      /* geen opslag */
    }
    scan();
  }

  function allesAfdekken() {
    geopend = {};
    bewaar();
    scan();
  }

  try {
    chrome.runtime.onMessage.addListener((bericht, afzender, antwoord) => {
      try {
        switch (bericht && bericht.type) {
          case 'status':
            antwoord(status());
            break;
          case 'open-volgende': {
            const rij = rijen.find((r) => r.vergrendeld);
            // Via de popup is er nog geen klik op de pagina geweest, dus eerst het startscherm:
            // jouw klik daar zorgt ervoor dat Chrome het geluid toestaat.
            antwoord({ ok: !!rij && open(rij, { direct: false }) });
            break;
          }
          case 'alles-geopend':
            allesGeopend();
            antwoord(status());
            break;
          case 'alles-afdekken':
            allesAfdekken();
            antwoord(status());
            break;
          case 'hub-open':
            antwoord({ ok: openPaneel(HUB_TABS.includes(bericht.tab) ? bericht.tab : 'overzicht') });
            break;
          default:
            return;
        }
      } catch (e) {
        antwoord({ ok: false });
      }
    });
  } catch (e) {
    /* geen berichten beschikbaar */
  }

  laad();
})();
