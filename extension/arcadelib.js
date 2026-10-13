/*
 * Somtoday Pack Opener v3.0: de regels van de Arcade-hoek (vier mini-games). Geen scherm en geen opslag: alleen de spelregels en kansen,
 * zodat ze te testen zijn. arcade.js tekent de spellen; economie.js (SPOEco.arcadeStart / arcadeKlaar) regelt de munten en de dagelijkse limiet.
 *
 * Elk spel kost 5 munten en betaalt hoogstens het maximum uit dat in economie.js staat (SPOEco.ARCADE). De tabellen hieronder zijn zo gekozen
 * dat je met goed spelen gemiddeld ongeveer je inzet terugkrijgt en met gokken er iets op verliest (zie arcade.test.js, die de verwachting narekent).
 * Alle willekeur komt uit een functie r() die getallen van 0 tot (niet inclusief) 1 geeft; standaard crypto.getRandomValues.
 */
(function () {
  'use strict';

  function willekeur() {
    const b = new Uint32Array(1);
    globalThis.crypto.getRandomValues(b);
    return b[0] / 4294967296;
  }
  const geheel = (r, n) => Math.floor(r() * n);
  function schud(lijst, r) {
    const l = lijst.slice();
    for (let i = l.length - 1; i > 0; i--) { const j = geheel(r, i + 1); [l[i], l[j]] = [l[j], l[i]]; }
    return l;
  }
  // Kiest een index uit gewichten (som hoeft niet 1 te zijn).
  function kiesGewicht(gewichten, r) {
    let x = r() * gewichten.reduce((a, c) => a + c, 0);
    for (let i = 0; i < gewichten.length; i++) { if (x < gewichten[i]) return i; x -= gewichten[i]; }
    return gewichten.length - 1;
  }

  // ───────── 1. Memory met je eigen kaarten ─────────
  const MEMORY_PAREN = 6;
  // Beurten (twee kaarten omdraaien is één beurt) naar munten. Perfect onthouden kost gemiddeld ongeveer 9 beurten.
  const MEMORY_TABEL = [[7, 12], [8, 7], [10, 5], [12, 3], [15, 2]]; // [hoogstens beurten, munten]; daarboven 1
  const memoryWinst = (beurten) => { for (const [b, m] of MEMORY_TABEL) if (beurten <= b) return m; return 1; };
  // Kiest 6 verschillende kaarten uit de galerij en maakt er 12 tegels van (elke kaart twee keer, door elkaar). Te weinig kaarten: null.
  function memoryTegels(galerij, r) {
    r = r || willekeur;
    const uniek = [];
    const gezien = new Set();
    for (const e of Array.isArray(galerij) ? galerij : []) {
      if (!e || typeof e.id !== 'string' || gezien.has(e.id) || !Number.isFinite(e.cijfer)) continue;
      gezien.add(e.id);
      uniek.push(e);
    }
    if (uniek.length < MEMORY_PAREN) return null;
    const gekozen = schud(uniek, r).slice(0, MEMORY_PAREN);
    const tegels = [];
    gekozen.forEach((e, i) => { for (let k = 0; k < 2; k++) tegels.push({ paar: i, id: e.id, vak: String(e.vak || '').slice(0, 40), cijfer: e.cijfer, kaart: typeof e.kaart === 'string' ? e.kaart : '' }); });
    return schud(tegels, r);
  }

  // ───────── 2. Hoger of lager ─────────
  // Een cijfer van 1,0 tot en met 10,0 (één decimaal). Het volgende cijfer is nooit gelijk aan het vorige, dus je gokt altijd goed of fout.
  const HOGER_WINST = [0, 6, 8, 10, 12, 16]; // munten na 0 t/m 5 goede gokken; na 5 goede gokken betaalt het spel zelf uit
  const HOGER_MAX = HOGER_WINST.length - 1;
  const hogerCijfer = (r) => (10 + geheel(r || willekeur, 91)) / 10;
  function hogerVolgend(huidig, r) {
    r = r || willekeur;
    let n;
    do { n = hogerCijfer(r); } while (Math.abs(n - huidig) < 0.001);
    return n;
  }
  // gok: 'hoger' of 'lager'. Geeft true als je goed gokte.
  const hogerGoed = (huidig, volgend, gok) => (gok === 'hoger' ? volgend > huidig : gok === 'lager' ? volgend < huidig : false);
  const hogerWinst = (reeks) => HOGER_WINST[Math.max(0, Math.min(HOGER_MAX, reeks | 0))];
  // De kans dat 'hoger' klopt bij dit cijfer (de andere 90 cijfers zijn even waarschijnlijk).
  const hogerKans = (huidig) => { const t = Math.round(huidig * 10); return (100 - t) / 90; };

  // ───────── 3. Kraslot ─────────
  // 6 vakjes. Drie dezelfde symbolen = de prijs van dat symbool. Alleen één soort kan drie keer voorkomen.
  const SYMBOLEN = [
    { id: 'munt', naam: 'Munt', teken: '\u{1FA99}', prijs: 5 },
    { id: 'ster', naam: 'Ster', teken: '⭐', prijs: 8 },
    { id: 'klaver', naam: 'Klaver', teken: '\u{1F340}', prijs: 15 },
    { id: 'diamant', naam: 'Diamant', teken: '\u{1F48E}', prijs: 25 },
    { id: 'kroon', naam: 'Kroon', teken: '\u{1F451}', prijs: 50 },
  ];
  // Kans per uitkomst: geen prijs (index 0) of het symbool met die index + 1.
  const KRAS_KANS = [0.495, 0.27, 0.13, 0.07, 0.03, 0.005];
  const telSymbolen = (cellen) => { const t = {}; for (const c of cellen) t[c] = (t[c] || 0) + 1; return t; };
  // De prijs van een kraslot: het symbool dat drie keer (of vaker) voorkomt. Zijn het er meer, dan telt het hoogste.
  function krasPrijs(cellen) {
    let best = 0;
    const t = telSymbolen(cellen);
    for (const s of SYMBOLEN) if ((t[s.id] || 0) >= 3) best = Math.max(best, s.prijs);
    return best;
  }
  // Maakt een kraslot: { cellen: [6 symbool-id's], prijs }. De uitkomst wordt eerst getrokken, daarna worden de vakjes ingevuld zodat het klopt.
  function krasLot(r) {
    r = r || willekeur;
    const uitkomst = kiesGewicht(KRAS_KANS, r);
    const winnaar = uitkomst > 0 ? SYMBOLEN[uitkomst - 1] : null;
    for (let poging = 0; poging < 200; poging++) {
      let cellen;
      if (winnaar) {
        const rest = SYMBOLEN.filter((s) => s !== winnaar);
        cellen = [winnaar.id, winnaar.id, winnaar.id];
        for (let i = 0; i < 3; i++) cellen.push(rest[geheel(r, rest.length)].id);
      } else {
        cellen = [];
        for (let i = 0; i < 6; i++) cellen.push(SYMBOLEN[geheel(r, SYMBOLEN.length)].id);
      }
      cellen = schud(cellen, r);
      if (krasPrijs(cellen) === (winnaar ? winnaar.prijs : 0) && (!winnaar || Object.values(telSymbolen(cellen)).filter((n) => n >= 3).length === 1)) return { cellen, prijs: krasPrijs(cellen) };
    }
    // vaste noodoplossing (komt in de praktijk niet voor): twee van elk van drie symbolen
    return { cellen: schud(['munt', 'munt', 'ster', 'ster', 'klaver', 'klaver'], r), prijs: 0 };
  }

  // ───────── 4. Rad van fortuin ─────────
  const RAD = [0, 20, 0, 5, 0, 8, 0, 3, 5, 10, 0, 2]; // 12 vakken, in de volgorde waarin ze op het rad staan
  const radDraai = (r) => geheel(r || willekeur, RAD.length);

  // Wat een spel gemiddeld oplevert (voor de tests en voor de uitleg in het scherm).
  const verwachtingKras = () => KRAS_KANS.reduce((a, k, i) => a + k * (i === 0 ? 0 : SYMBOLEN[i - 1].prijs), 0);
  const verwachtingRad = () => RAD.reduce((a, b) => a + b, 0) / RAD.length;

  globalThis.SPOArcade = {
    willekeur, schud, kiesGewicht,
    MEMORY_PAREN, MEMORY_TABEL, memoryWinst, memoryTegels,
    HOGER_WINST, HOGER_MAX, hogerCijfer, hogerVolgend, hogerGoed, hogerWinst, hogerKans,
    SYMBOLEN, KRAS_KANS, krasPrijs, krasLot,
    RAD, radDraai, verwachtingKras, verwachtingRad,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.SPOArcade;
})();
