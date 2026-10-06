/*
 * Somtoday Pack Opener: het paneel (hub.html).
 *
 * Dit bestand draait op twee manieren:
 *  - in het Somtoday-venster: content.js zet hub.html in een iframe boven de pagina. Dan praten we met content.js via
 *    window.postMessage (zie hieronder);
 *  - los, in een eigen tabblad: dan zoeken we zelf het Somtoday-tabblad op en praten we met content.js via chrome.tabs.
 *
 * Berichten van dit paneel naar content.js: { bron: 'spo-hub', versie: 1, type, id?, ...gegevens }
 *   hub-klaar | sluiten | open-volgende | alles-geopend | alles-afdekken | naar-cijfers | proef { data }
 * Berichten van content.js naar dit paneel: { bron: 'spo-pagina', versie: 1, type, ... }
 *   init { tab, status } | status { status } | tab { tab } | focus { waar } | antwoord { id, ok, status }
 * Berichten van de ingebedde pagina's (galerij, ...) naar dit paneel: { bron: 'spo-embed', versie: 1, type: 'esc' | 'naar-cijfers' } (zie embed.js)
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`

  const $ = (id) => document.getElementById(id);
  const PAGINA = 'https://leerling.somtoday.nl';
  const CIJFERS_URL = PAGINA + '/cijfers';
  const SLEUTEL_INSTELLINGEN = 'spo_instellingen';
  const SLEUTEL_DICHT = 'spo_dicht';
  const SLEUTEL_GALERIJ = 'spo_galerij';
  const SLEUTEL_GEOPEND = 'spo_geopend';
  const SLEUTEL_PROEF = 'spo_proef';
  const STANDAARD = { afdekking: true, geluid: true, snel: false, opening: 'pak', galerij: true, laag: false, zeldzaam: true, seizoen: true, gemiddelden: true, knop: true };
  const OPENINGEN = ['pak', 'kluis', 'plinko', 'ster', 'raket', 'schiet', 'dans', 'willekeurig'];
  const OPENING_NAAM = { pak: 'Pakje', kluis: 'Kluis', plinko: 'Plinko', ster: 'Wensster', raket: 'Raket', schiet: 'Schieten', dans: 'Dansje', willekeurig: 'Verras me' };
  const TABS = ['overzicht', 'galerij', 'kaart', 'vrienden', 'rekenen', 'proberen', 'instellingen', 'geluiden'];

  const ingebed = window.parent !== window;
  if (!ingebed) document.documentElement.classList.add('los');

  const maak = (tag, klas, tekst) => {
    const el = document.createElement(tag);
    if (klas) el.className = klas;
    if (tekst != null) el.textContent = tekst;
    return el;
  };
  const fmt = (g) => Number(g).toFixed(1).replace('.', ',');

  // ───────────────────────── Praten met content.js ─────────────────────────
  let teller = 0;
  const wachtend = new Map();

  function naarPagina(type, gegevens) {
    if (!ingebed) return;
    parent.postMessage(Object.assign({ bron: 'spo-hub', versie: 1, type }, gegevens), PAGINA);
  }

  function vraagPagina(type, gegevens, ms = 1500) {
    return new Promise((klaar) => {
      const id = ++teller;
      const timer = setTimeout(() => {
        wachtend.delete(id);
        klaar(null);
      }, ms);
      wachtend.set(id, (antwoord) => {
        clearTimeout(timer);
        klaar(antwoord);
      });
      naarPagina(type, Object.assign({ id }, gegevens));
    });
  }

  // Los tabblad: zoek het Somtoday-tabblad waar de Pack Opener draait. Zonder hostrechten (Chrome) zien we geen URL's,
  // dan vragen we elk tabblad of het antwoordt op 'status'.
  async function vindTab() {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({});
    } catch (e) {
      return null;
    }
    for (const t of tabs) {
      if (t.url && !t.url.startsWith(PAGINA + '/')) continue;
      try {
        const status = await chrome.tabs.sendMessage(t.id, { type: 'status' });
        if (status && status.ok) return { tab: t, status };
      } catch (e) {
        /* geen Pack Opener op dit tabblad */
      }
    }
    return null;
  }

  // Een actie voor de Somtoday-pagina: 'open-volgende', 'alles-geopend', 'alles-afdekken'. Geeft { ok, status } of null.
  async function actie(type) {
    if (ingebed) return vraagPagina(type);
    const gevonden = await vindTab();
    if (!gevonden) return { ok: false, reden: 'geen-tab' };
    try {
      const antwoord = await chrome.tabs.sendMessage(gevonden.tab.id, { type });
      if (type === 'open-volgende' && antwoord && antwoord.ok) {
        chrome.tabs.update(gevonden.tab.id, { active: true });
        chrome.windows.update(gevonden.tab.windowId, { focused: true });
      }
      // content.js antwoordt bij 'alles-...' met de status zelf, bij 'open-volgende' met { ok }
      return { ok: !antwoord || antwoord.ok !== false, status: antwoord && antwoord.totaal != null ? antwoord : null };
    } catch (e) {
      return { ok: false, reden: 'geen-tab' };
    }
  }

  function sluit() {
    naarPagina('sluiten');
  }

  async function naarCijfers() {
    if (ingebed) return naarPagina('naar-cijfers');
    const gevonden = await vindTab();
    if (gevonden) {
      chrome.tabs.update(gevonden.tab.id, { url: CIJFERS_URL, active: true });
      chrome.windows.update(gevonden.tab.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: CIJFERS_URL });
    }
  }

  // ───────────────────────── Opslag ─────────────────────────
  let instellingen = { ...STANDAARD };
  let dicht = [];
  let galerij = [];
  let status = null; // wat content.js over de huidige pagina weet: { totaal, ongeopend, vakken, pad }

  const schoonDicht = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x.vak === 'string').slice(0, 20);
  const schoonGalerij = (v) =>
    (Array.isArray(v) ? v : []).filter((e) => e && typeof e.id === 'string' && typeof e.kaart === 'string' && Number.isFinite(e.cijfer));
  const metStandaard = (v) => {
    const i = { ...STANDAARD, ...(v && typeof v === 'object' ? v : {}) };
    if (!OPENINGEN.includes(i.opening)) i.opening = 'pak';
    return i;
  };

  // Instellingen schrijven we altijd bovenop wat er nu in de opslag staat (andere pagina's bewaren er ook iets in, zoals het kaartthema).
  let schrijfKetting = Promise.resolve();
  function bewaarInstelling(k, v) {
    instellingen[k] = v;
    schrijfKetting = schrijfKetting
      .then(async () => {
        const r = await chrome.storage.local.get(SLEUTEL_INSTELLINGEN);
        await chrome.storage.local.set({ [SLEUTEL_INSTELLINGEN]: { ...(r[SLEUTEL_INSTELLINGEN] || {}), [k]: v } });
        meldInstelling('Opgeslagen.');
      })
      .catch(() => meldInstelling('Opslaan lukte niet.'));
    return schrijfKetting;
  }

  let meldTimer = 0;
  function meldInstelling(tekst) {
    $('inst-melding').textContent = tekst;
    clearTimeout(meldTimer);
    meldTimer = setTimeout(() => ($('inst-melding').textContent = ''), 2200);
  }

  // ───────────────────────── Tabs ─────────────────────────
  const tabKnoppen = Array.from(document.querySelectorAll('#tabs [role="tab"]'));
  let huidig = null;
  let laadTimer = 0;

  function laadKader(naam) {
    const paneel = $('paneel-' + naam);
    if (!paneel || !paneel.dataset.src || paneel.querySelector('iframe')) return;
    // De iframe maken we pas als je het tabblad opent: de pagina's staan er dus niet allemaal tegelijk in het geheugen.
    const f = document.createElement('iframe');
    f.title = paneel.dataset.titel || naam;
    if (paneel.dataset.allow) f.allow = paneel.dataset.allow;
    f.addEventListener('load', () => (paneel.dataset.geladen = ''), { once: true });
    f.src = paneel.dataset.src;
    paneel.prepend(f);
  }

  function kies(naam, { focus = false, snel = true, ververs = true } = {}) {
    if (!TABS.includes(naam)) naam = 'overzicht';
    huidig = naam;
    for (const k of tabKnoppen) {
      const aan = k.dataset.tab === naam;
      k.setAttribute('aria-selected', String(aan));
      k.tabIndex = aan ? 0 : -1;
      if (aan) {
        if (focus) k.focus();
        try {
          k.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (e) {
          /* geen scrollen */
        }
      }
    }
    for (const t of TABS) $('paneel-' + t).hidden = t !== naam;
    clearTimeout(laadTimer);
    // Met de pijltjestoetsen vlieg je langs tabs: de pagina laden we pas als je even blijft staan.
    if (snel) laadKader(naam);
    else laadTimer = setTimeout(() => laadKader(naam), 150);
    if (naam === 'overzicht' && ververs) verversStatus();
  }

  $('tabs').addEventListener('click', (e) => {
    const k = e.target.closest('[role="tab"]');
    if (k) kies(k.dataset.tab);
  });
  $('tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(huidig);
    let n = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    kies(TABS[n], { focus: true, snel: false });
  });
  const smal = matchMedia('(max-width: 760px)');
  const zetRichting = () => $('tabs').setAttribute('aria-orientation', smal.matches ? 'horizontal' : 'vertical');
  smal.addEventListener('change', zetRichting);
  zetRichting();

  // Knoppen met data-ga="tabnaam" brengen je naar dat tabblad.
  document.addEventListener('click', (e) => {
    const k = e.target instanceof Element ? e.target.closest('[data-ga]') : null;
    if (k) kies(k.dataset.ga, { focus: false });
  });

  $('sluit').addEventListener('click', sluit);

  // ───────────────────────── Overzicht ─────────────────────────
  const nCijfers = (n) => (n === 1 ? '1 nieuw cijfer' : `${n} nieuwe cijfers`);
  let melding = '';

  const aantalDicht = () => (status && status.totaal > 0 ? status.ongeopend : dicht.length);

  function tekenHero() {
    const n = instellingen.afdekking ? aantalDicht() : 0;
    const opPagina = !!(status && status.ongeopend > 0);
    const hero = $('hero');
    hero.classList.toggle('leeg', n === 0);
    let getal, kop, sub;
    if (!instellingen.afdekking) {
      [getal, kop, sub] = ['–', 'Afdekken staat uit', 'Nieuwe cijfers worden nu niet verborgen. Zet afdekken aan om ze pas te zien als je het pakket opent.'];
    } else if (n > 0) {
      [getal, kop, sub] = [String(n), `Je hebt ${nCijfers(n)} klaar`, opPagina ? 'Open een pakket om je cijfer te zien. Tot dan blijft het verborgen.' : 'Je opent ze op de pagina Cijfers van Somtoday. Tot dan blijven ze verborgen.'];
    } else {
      [getal, kop, sub] = ['0', 'Alles geopend', 'Zodra er een nieuw cijfer is, staat het hier klaar.'];
    }
    $('hero-getal').textContent = getal;
    $('hero-kop').textContent = kop;
    $('hero-sub').textContent = sub;
    $('b-volgend').hidden = !(instellingen.afdekking && n > 0 && opPagina);
    $('b-cijfers').hidden = !(instellingen.afdekking && n > 0 && !opPagina);
    $('b-afdekken-aan').hidden = instellingen.afdekking;

    const badge = $('tab-badge');
    badge.hidden = !(instellingen.afdekking && n > 0);
    badge.textContent = String(n);

    const ul = $('vakken');
    ul.replaceChildren();
    const lijst = instellingen.afdekking ? dicht.slice(0, 12) : [];
    ul.hidden = lijst.length === 0;
    for (const x of lijst) {
      const li = maak('li');
      li.append(maak('b', '', x.vak));
      if (x.onderwerp) li.append(maak('span', '', x.onderwerp));
      ul.append(li);
    }

    // Beheer: 'alles als geopend' kan alleen op een pagina met cijfers (daar weet Somtoday welke het zijn)
    $('b-alles-geopend').hidden = !(instellingen.afdekking && n > 0 && opPagina);
    $('b-alles-afdekken').hidden = !instellingen.afdekking;
    $('ov-melding').textContent = melding;
  }

  // dezelfde berekening als galerij.js: gemiddelde met weging, beste = hoogste cijfer
  function tekenGalerij() {
    const heeft = galerij.length > 0;
    $('stats').hidden = !heeft;
    $('st-leeg').hidden = heeft;
    $('st-leeg').textContent = instellingen.galerij === false ? 'Galerij bijhouden staat uit. Zet dat aan bij Instellingen om je kaarten te bewaren.' : 'Nog geen kaarten. Open een nieuw cijfer en je kaart verschijnt hier.';
    const ul = $('laatste');
    ul.replaceChildren();
    ul.hidden = !heeft;
    if (!heeft) return;
    let s = 0;
    let w = 0;
    for (const e of galerij) {
      const g = Number.isFinite(e.weging) && e.weging > 0 ? e.weging : 1;
      s += e.cijfer * g;
      w += g;
    }
    const beste = galerij.reduce((b, e) => (e.cijfer > b.cijfer ? e : b), galerij[0]);
    $('st-aantal').textContent = String(galerij.length);
    $('st-gem').textContent = fmt(w ? s / w : 0);
    $('st-beste').textContent = `${fmt(beste.cijfer)} ${beste.vak}`;
    const nieuwste = galerij.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 5);
    for (const e of nieuwste) {
      const li = maak('li');
      const b = maak('button');
      b.type = 'button';
      b.dataset.ga = 'galerij';
      b.setAttribute('aria-label', `Kaart ${e.vak} ${fmt(e.cijfer)}, open de galerij`);
      const img = new Image();
      img.src = e.kaart;
      img.alt = '';
      img.decoding = 'async';
      b.append(img);
      li.append(b);
      ul.append(li);
    }
  }

  function tekenOverzicht() {
    tekenHero();
    tekenGalerij();
  }

  async function verversStatus() {
    if (ingebed) {
      const r = await vraagPagina('status');
      if (r && r.status) status = r.status;
    } else {
      const g = await vindTab();
      status = g ? g.status : null;
    }
    tekenHero();
  }

  function zetMelding(tekst) {
    melding = tekst;
    $('ov-melding').textContent = tekst;
  }

  $('b-volgend').addEventListener('click', async () => {
    zetMelding('');
    const r = await actie('open-volgende');
    if (r && r.ok === false) {
      zetMelding(r.reden === 'geen-tab' ? 'Open eerst je cijfers op Somtoday.' : 'Er staat op deze pagina geen afgedekt cijfer. Ga naar Cijfers op Somtoday.');
      verversStatus();
    }
  });
  $('b-cijfers').addEventListener('click', naarCijfers);
  $('b-afdekken-aan').addEventListener('click', () => bewaarInstelling('afdekking', true));

  // Alles als geopend markeren / alles weer afdekken, met bevestiging
  let bevestigActie = null;
  function vraag(tekst, ja, uitvoer, terugNaar) {
    bevestigActie = { uitvoer, terugNaar };
    $('bevestig-tekst').textContent = tekst;
    $('bevestig-ja').textContent = ja;
    $('bevestig').hidden = false;
    $('bevestig-nee').focus();
  }
  function sluitVraag(focusTerug) {
    const terug = bevestigActie && bevestigActie.terugNaar;
    $('bevestig').hidden = true;
    bevestigActie = null;
    if (focusTerug && terug && !terug.hidden) terug.focus();
  }
  $('b-alles-geopend').addEventListener('click', (e) =>
    vraag('Alle nieuwe cijfers als geopend markeren? Je ziet ze dan meteen, zonder pakket.', 'Ja, markeren', async () => {
      const r = await actie('alles-geopend');
      if (r && r.status) status = r.status;
      zetMelding(r && r.ok !== false ? 'Alles is als geopend gemarkeerd.' : 'Dat lukte niet: open eerst je cijfers op Somtoday.');
    }, e.currentTarget),
  );
  $('b-alles-afdekken').addEventListener('click', (e) =>
    vraag('Alles weer afdekken? Alle cijfers die je al hebt geopend, staan daarna weer afgedekt.', 'Ja, afdekken', async () => {
      const r = await actie('alles-afdekken');
      if (r && r.ok === false) {
        // geen Somtoday-pagina bij de hand: de lijst met geopende cijfers wissen is genoeg, de pagina leest die bij het laden
        try {
          await chrome.storage.local.remove(SLEUTEL_GEOPEND);
        } catch (x) {
          /* geen opslag */
        }
      }
      if (r && r.status) status = r.status;
      zetMelding('Alles is weer afgedekt.');
    }, e.currentTarget),
  );
  $('bevestig-ja').addEventListener('click', async () => {
    const a = bevestigActie;
    sluitVraag(false);
    if (a) await a.uitvoer();
    tekenHero();
    if ($('b-alles-afdekken').hidden) $('tab-overzicht').focus();
    else $('b-alles-afdekken').focus();
  });
  $('bevestig-nee').addEventListener('click', () => sluitVraag(true));

  // ───────────────────────── Proberen ─────────────────────────
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

  const vakEl = $('vak');
  const cijferEl = $('cijfer');
  const schuifEl = $('schuif');
  const onderEl = $('onderwerp');
  let weging = 1;
  let geschiedenis = [];
  let vorigeTier = -1;
  let bewaarTimer = 0;

  function bewaarProef() {
    clearTimeout(bewaarTimer);
    bewaarTimer = setTimeout(() => {
      try {
        chrome.storage.local.set({
          [SLEUTEL_PROEF]: { vak: vakEl.value, cijfer: cijferEl.value, onderwerp: onderEl.value, weging, zeldzaam: $('proef-zeldzaam').checked, seizoen: $('proef-seizoen').value, geschiedenis },
        });
      } catch (e) {
        /* geen opslag */
      }
    }, 300);
  }

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

  function zetWeging(w) {
    weging = w;
    document.querySelectorAll('#weging button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w)));
  }

  function tekenGeschiedenis() {
    const sectie = $('geschiedenis');
    sectie.hidden = geschiedenis.length === 0;
    if (!geschiedenis.length) return;
    const totaalW = geschiedenis.reduce((s, x) => s + (x.weging || 1), 0);
    const gem = geschiedenis.reduce((s, x) => s + x.cijfer * (x.weging || 1), 0) / totaalW;
    const gemEl = $('gemiddelde');
    gemEl.textContent = 'Gemiddelde ';
    gemEl.append(maak('b', '', fmt(Math.round(gem * 10) / 10)));
    const ul = $('lijst');
    ul.replaceChildren();
    geschiedenis.slice(0, 5).forEach((x) => {
      const T = TIERS[tierVan(x.cijfer)];
      const li = maak('li');
      const b = maak('button');
      b.type = 'button';
      b.title = 'Opnieuw invullen';
      const c = maak('span', 'l-cijfer' + (x.cijfer < 5.5 ? ' onv' : ''), fmt(x.cijfer));
      c.style.background = x.cijfer < 5.5 ? 'linear-gradient(135deg, #b4232f, #ff5a64)' : `linear-gradient(135deg, ${T.pal[1]}, ${T.pal[2]})`;
      const tekst = maak('span', 'l-tekst');
      tekst.append(maak('b', '', x.vak), maak('span', '', x.onderwerp));
      b.append(c, tekst, maak('span', 'l-weging', `${x.weging || 1}×`));
      b.addEventListener('click', () => {
        vakEl.value = x.vak;
        onderEl.value = x.onderwerp;
        cijferEl.value = fmt(x.cijfer);
        schuifEl.value = x.cijfer;
        zetWeging(x.weging || 1);
        werkVoorbeeldBij();
        bewaarProef();
        vakEl.focus();
      });
      li.append(b);
      ul.append(li);
    });
  }

  function tekenOpeningNotitie() {
    const p = $('opening-notitie');
    p.replaceChildren(`Opening: ${OPENING_NAAM[instellingen.opening] || 'Pakje'}. Geluid, snelle modus en kwaliteit volg je instellingen. `);
    const b = maak('button', 'tekstknop', 'Wijzigen');
    b.type = 'button';
    b.dataset.ga = 'instellingen';
    p.append(b);
  }

  vakEl.addEventListener('input', () => {
    werkVoorbeeldBij();
    bewaarProef();
  });
  onderEl.addEventListener('input', bewaarProef);
  cijferEl.addEventListener('input', () => {
    cijferEl.value = cijferEl.value.replace(/[^0-9.,]/g, '');
    const g = leesCijfer(cijferEl.value);
    if (g != null) schuifEl.value = g;
    $('fout').textContent = '';
    werkVoorbeeldBij();
    bewaarProef();
  });
  cijferEl.addEventListener('blur', () => {
    const g = leesCijfer(cijferEl.value);
    if (g != null) cijferEl.value = fmt(g);
  });
  schuifEl.addEventListener('input', () => {
    cijferEl.value = fmt(Number(schuifEl.value));
    $('fout').textContent = '';
    werkVoorbeeldBij();
    bewaarProef();
  });
  $('weging').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    zetWeging(Number(b.dataset.w));
    bewaarProef();
  });
  $('proef-zeldzaam').addEventListener('change', bewaarProef);
  $('proef-seizoen').addEventListener('change', bewaarProef);
  $('wis').addEventListener('click', () => {
    geschiedenis = [];
    tekenGeschiedenis();
    bewaarProef();
    vakEl.focus();
  });

  $('formulier').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('fout').textContent = '';
    const g = leesCijfer(cijferEl.value);
    if (g == null) {
      $('fout').textContent = 'Vul een cijfer in tussen 1 en 10.';
      cijferEl.focus();
      return;
    }
    const data = {
      vak: vakEl.value.trim() || 'Vak',
      cijfer: g,
      onderwerp: onderEl.value.trim() || 'Toets',
      weging,
      // bij het proberen kies je zelf: een zeldzame kaart en een seizoensthema kun je zo altijd uitproberen
      zeldzaam: $('proef-zeldzaam').checked,
      seizoen: $('proef-seizoen').value,
    };
    geschiedenis.unshift({ vak: data.vak, cijfer: g, onderwerp: data.onderwerp, weging, ts: Date.now() });
    geschiedenis = geschiedenis.slice(0, 20);
    tekenGeschiedenis();
    bewaarProef();
    clearTimeout(bewaarTimer);
    await chrome.storage.local.set({ [SLEUTEL_PROEF]: { vak: vakEl.value, cijfer: cijferEl.value, onderwerp: onderEl.value, weging, zeldzaam: data.zeldzaam, seizoen: data.seizoen, geschiedenis } }).catch(() => {});

    if (ingebed) {
      naarPagina('proef', { data }); // content.js sluit het paneel en start de animatie op de pagina
      return;
    }
    // Los tabblad: geen Somtoday-pagina om op te openen, dus het pakket krijgt een eigen tabblad (zoals vroeger de reservepagina).
    const q = new URLSearchParams(
      Object.entries({ ...data, snel: !!instellingen.snel, laag: !!instellingen.laag, stil: !instellingen.geluid, opening: instellingen.opening, thema: instellingen.kaartThema || 'auto', rand: instellingen.kaartRand || 'standaard' }).map(([k, v]) => [k, String(v)]),
    );
    chrome.tabs.create({ url: chrome.runtime.getURL('stage.html?' + q.toString()) });
  });

  async function laadProef() {
    let p = null;
    try {
      p = (await chrome.storage.local.get(SLEUTEL_PROEF))[SLEUTEL_PROEF];
    } catch (e) {
      /* geen opslag */
    }
    if (!p) {
      // eenmalig: wat de oude popup in localStorage onthield (werkt alleen in een los tabblad)
      try {
        const l = (k, r) => localStorage.getItem('sp_' + k) ?? r;
        p = { vak: l('vak', ''), cijfer: l('cijfer', ''), onderwerp: l('onderwerp', ''), weging: parseInt(l('weging', '1'), 10), zeldzaam: l('proef-zeldzaam', '0') === '1', seizoen: l('proef-seizoen', 'auto'), geschiedenis: JSON.parse(l('geschiedenis', '[]')) };
      } catch (e) {
        p = {};
      }
    }
    vakEl.value = typeof p.vak === 'string' ? p.vak.slice(0, 40) : '';
    onderEl.value = typeof p.onderwerp === 'string' ? p.onderwerp.slice(0, 80) : '';
    const c = leesCijfer(p.cijfer || '');
    cijferEl.value = c ? fmt(c) : '';
    schuifEl.value = c || 7.5;
    zetWeging(Math.min(4, Math.max(1, parseInt(p.weging, 10) || 1)));
    $('proef-zeldzaam').checked = p.zeldzaam === true;
    $('proef-seizoen').value = ['auto', 'halloween', 'geen'].includes(p.seizoen) ? p.seizoen : 'auto';
    geschiedenis = (Array.isArray(p.geschiedenis) ? p.geschiedenis : []).filter((x) => x && typeof x.cijfer === 'number' && typeof x.vak === 'string').slice(0, 20);
    werkVoorbeeldBij();
    tekenGeschiedenis();
  }

  // ───────────────────────── Instellingen ─────────────────────────
  function toonInstellingen() {
    for (const k of Object.keys(STANDAARD)) if (k !== 'opening') $(k).checked = instellingen[k] !== false && !!instellingen[k];
    $('opening').querySelectorAll('button').forEach((b) => {
      const aan = b.dataset.opening === instellingen.opening;
      b.setAttribute('aria-checked', String(aan));
      b.tabIndex = aan ? 0 : -1;
    });
    tekenOpeningNotitie();
  }

  for (const k of Object.keys(STANDAARD)) {
    if (k !== 'opening') $(k).addEventListener('change', (e) => bewaarInstelling(k, e.target.checked).then(tekenHero));
  }
  $('opening').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    bewaarInstelling('opening', b.dataset.opening);
    toonInstellingen();
  });
  $('opening').addEventListener('keydown', (e) => {
    const pijl = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!pijl) return;
    e.preventDefault();
    const i = OPENINGEN.indexOf(instellingen.opening);
    bewaarInstelling('opening', OPENINGEN[(i + pijl + OPENINGEN.length) % OPENINGEN.length]);
    toonInstellingen();
    $('opening').querySelector('[aria-checked="true"]').focus();
  });

  try {
    chrome.storage.onChanged.addListener((w, gebied) => {
      if (gebied !== 'local') return;
      if (w[SLEUTEL_INSTELLINGEN]) {
        instellingen = metStandaard(w[SLEUTEL_INSTELLINGEN].newValue);
        toonInstellingen();
      }
      if (w[SLEUTEL_DICHT]) dicht = schoonDicht(w[SLEUTEL_DICHT].newValue);
      if (w[SLEUTEL_GALERIJ]) galerij = schoonGalerij(w[SLEUTEL_GALERIJ].newValue);
      if (w[SLEUTEL_DICHT] || w[SLEUTEL_INSTELLINGEN] || w[SLEUTEL_GALERIJ]) {
        tekenOverzicht();
        if (w[SLEUTEL_DICHT] && huidig === 'overzicht') verversStatus();
      }
    });
  } catch (e) {
    /* geen opslag */
  }

  // ───────────────────────── Berichten ontvangen ─────────────────────────
  const vanKader = (bron) => Array.from(document.querySelectorAll('.kader iframe')).some((f) => f.contentWindow === bron);

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.bron === 'spo-pagina') {
      if (!ingebed || e.source !== parent || e.origin !== PAGINA || m.versie !== 1) return;
      switch (m.type) {
        case 'init':
          if (m.status) status = m.status;
          kies(TABS.includes(m.tab) ? m.tab : 'overzicht', { focus: true });
          tekenHero();
          break;
        case 'tab':
          kies(TABS.includes(m.tab) ? m.tab : 'overzicht', { focus: true });
          break;
        case 'status':
          if (m.status) status = m.status;
          tekenHero();
          break;
        case 'focus':
          // de focus-val van content.js: Tab voorbij het laatste of Shift+Tab voor het eerste element
          if (m.waar === 'einde') $('sluit').focus();
          else $('tab-' + huidig).focus();
          break;
        case 'antwoord': {
          const klaar = wachtend.get(m.id);
          if (klaar) {
            wachtend.delete(m.id);
            klaar(m);
          }
          break;
        }
      }
    } else if (m.bron === 'spo-embed') {
      if (e.origin !== location.origin || !vanKader(e.source)) return;
      if (m.type === 'esc') sluit();
      else if (m.type === 'naar-cijfers') naarCijfers();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (bevestigActie) {
      e.preventDefault();
      sluitVraag(true);
      return;
    }
    sluit();
  });

  // ───────────────────────── Start ─────────────────────────
  (async function start() {
    try {
      const r = await chrome.storage.local.get([SLEUTEL_INSTELLINGEN, SLEUTEL_DICHT, SLEUTEL_GALERIJ]);
      instellingen = metStandaard(r[SLEUTEL_INSTELLINGEN]);
      dicht = schoonDicht(r[SLEUTEL_DICHT]);
      galerij = schoonGalerij(r[SLEUTEL_GALERIJ]);
    } catch (e) {
      /* standaardwaarden */
    }
    toonInstellingen();
    await laadProef();
    tekenOverzicht();
    const gewenst = location.hash.slice(1);
    kies(TABS.includes(gewenst) ? gewenst : 'overzicht', { ververs: !ingebed });
    if (ingebed) {
      naarPagina('hub-klaar');
    } else {
      // los tabblad: opnieuw kijken zodra je terugkomt uit het Somtoday-tabblad
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && huidig === 'overzicht') verversStatus();
      });
    }
  })();
})();
