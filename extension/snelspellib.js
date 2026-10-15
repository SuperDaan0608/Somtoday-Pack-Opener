/*
 * Somtoday Pack Opener v3.0: de regels van het Snelspel (vier mini-games van ongeveer 20 seconden, "lesbeurt-games").
 * Geen scherm en geen opslag: alleen de spelregels, zodat ze te testen zijn. snelspel.js tekent de spellen; economie.js
 * (SPOEco.miniStatus / miniKlaar) regelt de munten: 2 munten per goed potje, hoogstens 15 potjes per dag (dus nooit meer dan 30 munten per dag).
 *
 * De spellen
 *   reactie    Reactietest met kaarten: vier kaarten liggen dicht. Eén ervan wordt goud. Klik of druk (1 t/m 4) zo snel mogelijk. 5 rondes, minstens 4 snel genoeg.
 *   schatting  Snelle cijferschatting: drie cijfers, wat is het gemiddelde? Kies uit drie antwoorden. 6 rondes, minstens 4 goed.
 *   hoogste    Wijs de hoogste kaart: vier kaarten, welke heeft het hoogste cijfer? 8 rondes, minstens 6 goed.
 *   sorteer    Kaartjes sorteren op ladder: vier kaartjes met elk een trede (Gewoon, Zeldzaam, Glim, Kosmisch, Mythisch). Klik ze van laag naar hoog. 4 rondes, minstens 3 goed.
 *
 * Twee manieren van spelen
 *   met tijd           20 seconden voor het hele potje. Wat je dan niet af hebt, telt als fout. Bij de reactietest tellen alleen reacties binnen 0,7 seconde.
 *   zonder tijdsdruk   geen klok en geen snelheidseis; je hoeft alleen goed te zijn. Dezelfde beloning.
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
  const rond1 = (x) => Math.round(x * 10) / 10;
  function schud(lijst, r) {
    const l = lijst.slice();
    for (let i = l.length - 1; i > 0; i--) { const j = geheel(r, i + 1); [l[i], l[j]] = [l[j], l[i]]; }
    return l;
  }

  const DUUR = 20;            // seconden voor een potje met tijd
  const REACTIE_MS = 700;     // zo snel moet je reageren (alleen met tijd)
  const SPELLEN = {
    reactie: { naam: 'Reactietest', rondes: 5, goed: 4, uitleg: 'Vier kaarten liggen dicht. Eén kaart wordt goud. Klik erop, of druk op de toets 1 tot en met 4, zo snel je kunt. Te vroeg klikken is fout.', uitlegRustig: 'Een kaart is goud. Kies die kaart, of druk op de toets 1 tot en met 4. Je hoeft niet snel te zijn.' },
    schatting: { naam: 'Cijferschatting', rondes: 6, goed: 4, uitleg: 'Je ziet drie cijfers. Wat is het gemiddelde? Kies het goede antwoord (toets 1, 2 of 3).', uitlegRustig: 'Je ziet drie cijfers. Wat is het gemiddelde? Kies het goede antwoord (toets 1, 2 of 3). Je hebt alle tijd.' },
    hoogste: { naam: 'Hoogste kaart', rondes: 8, goed: 6, uitleg: 'Vier kaarten. Welke heeft het hoogste cijfer? Klik erop of druk op 1 tot en met 4.', uitlegRustig: 'Vier kaarten. Welke heeft het hoogste cijfer? Klik erop of druk op 1 tot en met 4. Je hebt alle tijd.' },
    sorteer: { naam: 'Sorteer op ladder', rondes: 4, goed: 3, uitleg: 'Vier kaartjes met elk een trede van de ladder. Klik ze van laag naar hoog: Gewoon, Zeldzaam, Glim, Kosmisch, Mythisch.', uitlegRustig: 'Vier kaartjes met elk een trede van de ladder. Klik ze van laag naar hoog: Gewoon, Zeldzaam, Glim, Kosmisch, Mythisch. Je hebt alle tijd.' },
  };
  const IDS = Object.keys(SPELLEN);
  const TREDEN = ['Gewoon', 'Zeldzaam', 'Glim', 'Kosmisch', 'Mythisch'];
  const VAKKEN = ['Wiskunde', 'Nederlands', 'Engels', 'Biologie', 'Scheikunde', 'Natuurkunde', 'Geschiedenis', 'Aardrijkskunde', 'Economie', 'Frans', 'Duits', 'Muziek', 'Tekenen', 'LO'];
  const potjeId = (r) => { r = r || willekeur; let t = ''; for (let i = 0; i < 16; i++) t += geheel(r, 16).toString(16); return t; };

  // Is het potje gehaald? goed = aantal goede rondes.
  const gehaald = (spel, goed) => Object.prototype.hasOwnProperty.call(SPELLEN, spel) && Number.isInteger(goed) && goed >= SPELLEN[spel].goed;

  // ───────── 1. Reactietest ─────────
  // Een ronde: na `wacht` milliseconden wordt kaart `doel` (0 t/m 3) goud. Zonder tijdsdruk is die kaart meteen goud.
  function reactieRonde(r) {
    r = r || willekeur;
    return { wacht: 600 + geheel(r, 1100), doel: geheel(r, 4) };
  }
  // keuze: welke kaart je koos; ms: milliseconden na het goud worden (negatief of null = te vroeg, nog niet goud).
  function reactieGoed(ronde, keuze, ms, rustig) {
    if (!ronde || keuze !== ronde.doel) return false;
    if (rustig) return true;
    return Number.isFinite(ms) && ms >= 0 && ms <= REACTIE_MS;
  }

  // ───────── 2. Cijferschatting ─────────
  // Drie cijfers (1,0 t/m 10,0) en drie antwoorden: het goede gemiddelde (op één decimaal) en twee ernaast, minstens 0,4 uit elkaar.
  function schattingRonde(r) {
    r = r || willekeur;
    for (let poging = 0; poging < 200; poging++) {
      const cijfers = [0, 0, 0].map(() => (10 + geheel(r, 91)) / 10);
      const gem = rond1(cijfers.reduce((a, b) => a + b, 0) / 3);
      const opties = [gem];
      for (let t = 0; t < 40 && opties.length < 3; t++) {
        const stap = (4 + geheel(r, 9)) / 10 * (r() < 0.5 ? -1 : 1);
        const x = rond1(gem + stap);
        if (x >= 1 && x <= 10 && opties.every((o) => Math.abs(o - x) >= 0.39)) opties.push(x);
      }
      if (opties.length < 3) continue;
      const schud_ = schud(opties, r);
      return { cijfers, opties: schud_, goed: schud_.indexOf(gem), gem };
    }
    return { cijfers: [6, 7, 8], opties: [7, 6.2, 7.8], goed: 0, gem: 7 };
  }

  // ───────── 3. Wijs de hoogste kaart ─────────
  // pool: kaarten uit de galerij ({ vak, cijfer }); lukt het daar niet met vier verschillende cijfers, dan vullen we aan met verzonnen kaarten.
  // Geeft { kaarten: [{ vak, cijfer }] (4, met allemaal een ander cijfer), goed: index van de hoogste }.
  function hoogsteRonde(pool, r) {
    r = r || willekeur;
    const kaarten = [];
    const gezien = new Set();
    const voeg = (vak, cijfer) => {
      const c = rond1(cijfer);
      if (!Number.isFinite(c) || c < 1 || c > 10 || gezien.has(c)) return;
      gezien.add(c); kaarten.push({ vak: String(vak || '').replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 24) || 'Vak', cijfer: c });
    };
    const eigen = schud((Array.isArray(pool) ? pool : []).filter((k) => k && Number.isFinite(k.cijfer)), r);
    for (const k of eigen) { if (kaarten.length >= 4) break; voeg(k.vak, k.cijfer); }
    let nog = 0;
    while (kaarten.length < 4 && nog++ < 500) voeg(VAKKEN[geheel(r, VAKKEN.length)], (10 + geheel(r, 91)) / 10);
    const rij = schud(kaarten, r);
    let hoogste = 0;
    rij.forEach((k, i) => { if (k.cijfer > rij[hoogste].cijfer) hoogste = i; });
    return { kaarten: rij, goed: hoogste };
  }

  // ───────── 4. Sorteer op ladder ─────────
  // Vier verschillende treden (0 t/m 4), door elkaar. `volgorde` is de goede volgorde van klikken (indexen, van laag naar hoog).
  function sorteerRonde(r) {
    r = r || willekeur;
    const treden = schud([0, 1, 2, 3, 4], r).slice(0, 4);
    const volgorde = treden.map((t, i) => i).sort((a, b) => treden[a] - treden[b]);
    return { treden, volgorde };
  }
  // Je klikt een index aan; `al` zijn de indexen die je eerder koos. Geeft 'goed' (en door), 'klaar' (laatste goede klik) of 'fout'.
  function sorteerStap(ronde, al, index) {
    if (!ronde || !Array.isArray(al) || !Number.isInteger(index)) return 'fout';
    if (ronde.volgorde[al.length] !== index) return 'fout';
    return al.length + 1 >= ronde.volgorde.length ? 'klaar' : 'goed';
  }

  const lib = { DUUR, REACTIE_MS, SPELLEN, IDS, TREDEN, VAKKEN, willekeur, schud, potjeId, gehaald, reactieRonde, reactieGoed, schattingRonde, hoogsteRonde, sorteerRonde, sorteerStap };
  globalThis.SPOSnelspel = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
