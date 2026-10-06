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
  const STANDAARD = { afdekking: true, geluid: true, snel: false, opening: 'pak', galerij: true, laag: false };
  const SLEUTEL_GALERIJ = 'spo_galerij';
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
        if (typeof window.__somPackVoorlaad === 'function') window.__somPackVoorlaad(OPENINGEN.includes(instellingen.opening) ? instellingen.opening : 'pak');
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
    voorladen();
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
      const r = await chrome.storage.local.get([SLEUTEL_GEOPEND, SLEUTEL_INSTELLINGEN]);
      geopend = schoonGeopend(r[SLEUTEL_GEOPEND]);
      instellingen = { ...STANDAARD, ...(r[SLEUTEL_INSTELLINGEN] || {}) };
    } catch (e) {
      /* zonder opslag begint alles afgedekt */
    }
    geladen = true;
    scan();
  }

  try {
    chrome.storage.onChanged.addListener((wijzigingen, gebied) => {
      if (gebied !== 'local') return;
      if (wijzigingen[SLEUTEL_GEOPEND]) geopend = schoonGeopend(wijzigingen[SLEUTEL_GEOPEND].newValue);
      if (wijzigingen[SLEUTEL_INSTELLINGEN]) instellingen = { ...STANDAARD, ...(wijzigingen[SLEUTEL_INSTELLINGEN].newValue || {}) };
      scan();
    });
  } catch (e) {
    /* geen opslag beschikbaar */
  }

  // ───────────────────────── Welke opening? ─────────────────────────
  // Bij "Verras me" kiezen we er één per cijfer, en houden die vast tot je het cijfer opent: dan kiezen het opwarmen
  // (zodra je met de muis boven het cijfer hangt) en het echte openen dezelfde opening.
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
      stil: !instellingen.geluid,
      opening: openingVoor(rij),
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
            lijst.unshift({ id: rij.sig, ts: Date.now(), vak: String(k.vak).slice(0, 60), cijfer: k.cijfer, onderwerp: String(k.onderwerp).slice(0, 120), weging: k.weging, opening: k.opening, tier: k.tier, kaart: k.kaart });
            chrome.storage.local.set({ [SLEUTEL_GALERIJ]: lijst.slice(0, 150) });
          });
        } catch (e) {
          /* opslag niet beschikbaar */
        }
      },
      opGesloten() {
        bezig = false;
        const st = staat.get(rij.host);
        if (st) st.willekeur = null; // de volgende keer weer een nieuwe verrassing
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
        window.__somPackWarm(rij && { vak: rij.d.vak, cijfer: rij.d.cijfer, onderwerp: rij.d.onderwerp || 'Nieuw cijfer', weging: rij.d.weging, snel: !!instellingen.snel, opening: openingVoor(rij) });
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

  // ───────────────────────── Berichten van de popup ─────────────────────────
  function status() {
    const dicht = rijen.filter((r) => r.vergrendeld);
    return { ok: true, totaal: rijen.length, ongeopend: dicht.length, vakken: dicht.map((r) => r.d.vak), pad: location.pathname };
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
            for (const { sig, lijst } of groepen) geopend[sig] = Math.max(geopend[sig] || 0, lijst.length);
            bewaar();
            scan();
            antwoord(status());
            break;
          case 'alles-afdekken':
            geopend = {};
            bewaar();
            scan();
            antwoord(status());
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
