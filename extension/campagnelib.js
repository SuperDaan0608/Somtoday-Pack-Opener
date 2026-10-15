/*
 * Somtoday Pack Opener v3.0: de CAMPAGNE (regels en gegevens, zonder scherm en zonder netwerk; campagne.js doet het scherm).
 * Vier werelden met een eindbaas: Vulkaan (draak, Exact), Zonnetempel (feniks, Talen), Diepzee (kraken, Mens & maatschappij) en Bergtoppen (griffioen, Kunst & sport).
 * Elke wereld heeft 5 niveaus: 4 gewone tegenstanders en de eindbaas. Je verslaat ze met een kaartspel-potje (de regels staan in kaartspellib.js):
 * jouw deck van 5 eigen kaarten tegen een gegenereerd deck. De tegenstanders worden sterker; de baas speelt met alleen kaarten uit zijn eigen vakgroep
 * (thema-voordeel: +BAAS_BONUS op het cijfer) en heeft een eigen baaskaart in wezenstijl.
 *
 * Opslag (chrome.storage.local): spo_campagne { v:1, w:{ <wereld>:{ s:[5 getallen 0..3] } }, deck:[kaart-id's], ts }
 *   s[i] = het beste aantal sterren op niveau i+1 (0 = nog niet gewonnen). Geen vaknamen en niets van Somtoday: alleen getallen en galerij-id's.
 *   De munten en de eenmalige beloningen staan in economie.js (campagneKlaar, in spo_munten_ids), zodat een back-up niets dubbel uitbetaalt.
 */
(function () {
  'use strict';
  const NIVEAUS = 5;
  const BAAS_BONUS = 0.6;
  // Herkenbare vaknamen per vakgroep (gevecht.js groepVan kent ze), voor de gegenereerde decks.
  const VAKKEN = {
    exact: ['Wiskunde', 'Natuurkunde', 'Scheikunde', 'Biologie', 'Informatica'],
    talen: ['Nederlands', 'Engels', 'Frans', 'Duits', 'Spaans'],
    mens: ['Geschiedenis', 'Economie', 'Aardrijkskunde', 'Maatschappijleer', 'Filosofie'],
    kunst: ['Muziek', 'Tekenen', 'LO', 'Drama', 'CKV'],
  };
  const WERELDEN = [
    { id: 'exact', naam: 'Vulkaan', wezen: 'draak', baas: 'Vulkaandraak', groep: 'Exact', kleur: '#ff6a2b', kleur2: '#2a0904', beschrijving: 'Een gloeiende berg vol magma. Op de top slaapt de vulkaandraak, die de kracht van Exact gebruikt.',
      tegenstanders: ['Lavaslak', 'Asgeest', 'Vuurhagedis', 'Magmagolem'], titel: 'ti-drakendoder', thema: 'kt-vulkaan' },
    { id: 'talen', naam: 'Zonnetempel', wezen: 'feniks', baas: 'Zonnefeniks', groep: 'Talen', kleur: '#ffcc33', kleur2: '#3a2504', beschrijving: 'Een gouden tempel in de woestijn. De zonnefeniks bewaakt hem met de kracht van Talen.',
      tegenstanders: ['Zandschrijver', 'Tempelwachter', 'Zonnepriester', 'Gouden sfinx'], titel: 'ti-feniksvriend', thema: 'kt-zonnetempel' },
    { id: 'mens', naam: 'Diepzee', wezen: 'kraken', baas: 'Kraken', groep: 'Mens & maatschappij', kleur: '#2fd3c4', kleur2: '#03162e', beschrijving: 'Een donkere oceaan met zinkende schatten. De kraken rijdt op de golven van Mens & maatschappij.',
      tegenstanders: ['Kwallenzwerm', 'Lantaarnvis', 'Diepzeeduiker', 'Koraalheks'], titel: 'ti-krakenbedwinger', thema: 'kt-diepzee' },
    { id: 'kunst', naam: 'Bergtoppen', wezen: 'griffioen', baas: 'Berggriffioen', groep: 'Kunst & sport', kleur: '#8fb4ff', kleur2: '#182238', beschrijving: 'Ijle toppen boven de wolken. De berggriffioen vliegt hier op de kracht van Kunst & sport.',
      tegenstanders: ['Steengeit', 'Bergarend', 'Windnimf', 'Wolkenreus'], titel: 'ti-griffioenmeester', thema: 'kt-bergtop' },
  ];
  const PER_ID = new Map(WERELDEN.map((w, i) => [w.id, Object.assign({ nr: i }, w)]));
  const wereld = (id) => PER_ID.get(id) || null;

  // Basis-cijfer per niveau; elke wereld is een beetje zwaarder dan de vorige.
  const BASIS = [4.8, 5.8, 6.8, 7.6, 8.1];
  const WERELD_PLUS = 0.2;
  const tierVan = (c) => (c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0);
  function maakRng(zaad) {
    let a = zaad >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const rond = (x) => Math.round(Math.max(1, Math.min(9.9, x)) * 10) / 10;

  // Het deck van niveau `niveau` (1 t/m 5) van wereld `id`. Altijd hetzelfde deck: tegenstanders zijn vaste personages.
  function maakDeck(id, niveau) {
    const w = wereld(id);
    if (!w || !Number.isInteger(niveau) || niveau < 1 || niveau > NIVEAUS) return null;
    const baas = niveau === NIVEAUS;
    const rng = maakRng(((w.nr + 1) * 7919 + niveau * 104729) >>> 0);
    const basis = BASIS[niveau - 1] + w.nr * WERELD_PLUS;
    const eigen = VAKKEN[id].slice(), alle = [].concat(...Object.values(VAKKEN));
    const uit = [];
    const aantal = baas ? 4 : 5;
    for (let n = 0; n < aantal; n++) {
      let vak;
      if (baas) vak = eigen.splice(Math.floor(rng() * eigen.length), 1)[0];
      else { do { vak = alle[Math.floor(rng() * alle.length)]; } while (uit.some((k) => k.vak === vak)); }
      const cijfer = rond(Math.min(9.3, basis + (baas ? BAAS_BONUS : 0) + (rng() - 0.5) * 1.4));
      const t = niveau >= 4 && rng() < (baas ? 0.6 : 0.25) ? 1 : 0;
      uit.push({ vak, cijfer, tier: tierVan(cijfer), t, z: t >= 1, v: false, h: false });
    }
    if (baas) {
      // De baaskaart: sterk, kosmisch, met een eigen naam en plaatje (campagne.js tekent het wezen).
      const cijfer = rond(Math.min(9.7, basis + 1.3));
      uit.splice(Math.floor(rng() * 5), 0, { vak: VAKKEN[id][0], naam: w.baas, cijfer, tier: tierVan(cijfer), t: 3, z: true, v: false, h: false, baas: true });
    }
    return uit;
  }
  const tegenstanderNaam = (id, niveau) => { const w = wereld(id); return !w ? '' : niveau === NIVEAUS ? w.baas : w.tegenstanders[niveau - 1]; };

  // 3 sterren: een 3-0 winst, 2: 3-1, 1: 3-2. Geen winst: 0.
  const sterren = (score) => (!score || score.ik <= score.zij ? 0 : score.zij === 0 ? 3 : score.zij === 1 ? 2 : 1);

  // ---- opslag ----
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const nat = (x, max) => (Number.isFinite(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0);
  function schoonSterren(a) {
    const uit = [];
    let stop = false;
    for (let i = 0; i < NIVEAUS; i++) { const v = stop ? 0 : nat(Array.isArray(a) ? a[i] : 0, 3); if (!v) stop = true; uit.push(v); }
    return uit;
  }
  function schoon(o) {
    o = obj(o);
    const w = {};
    for (const x of WERELDEN) w[x.id] = { s: schoonSterren(obj(obj(o.w)[x.id]).s) };
    const deck = (Array.isArray(o.deck) ? o.deck : []).filter((t, i, a) => typeof t === 'string' && t.length > 0 && t.length <= 60 && a.indexOf(t) === i).slice(0, 5);
    return { v: 1, w, deck, ts: nat(o.ts, 4.1e12) };
  }
  // Het hoogste bereikte niveau telt: per niveau de meeste sterren, van allebei.
  function samenvoegen(hier, daar) {
    const h = schoon(hier), d = schoon(daar);
    const w = {};
    for (const x of WERELDEN) w[x.id] = { s: schoonSterren(h.w[x.id].s.map((v, i) => Math.max(v, d.w[x.id].s[i]))) };
    return { v: 1, w, deck: h.deck.length === 5 ? h.deck : d.deck.length === 5 ? d.deck : h.deck, ts: Math.max(h.ts, d.ts) };
  }
  // Aantal gewonnen niveaus (0..5) en het niveau dat nu aan de beurt is (1..5; 5 blijft open ook als de baas al is verslagen).
  const gewonnen = (st, id) => schoon(st).w[id].s.filter((v) => v > 0).length;
  const openNiveau = (st, id) => Math.min(NIVEAUS, gewonnen(st, id) + 1);
  const voltooid = (st, id) => schoon(st).w[id].s[NIVEAUS - 1] > 0;
  const aantalVoltooid = (st) => WERELDEN.filter((x) => voltooid(st, x.id)).length;
  const totaalSterren = (st) => WERELDEN.reduce((n, x) => n + schoon(st).w[x.id].s.reduce((a, b) => a + b, 0), 0);
  // Legt een resultaat vast (alleen een winst telt, en nooit minder sterren dan je al had). Geeft de nieuwe staat.
  function registreer(st, id, niveau, aantal) {
    const n = schoon(st);
    if (!n.w[id] || !Number.isInteger(niveau) || niveau < 1 || niveau > NIVEAUS || !(aantal >= 1)) return n;
    if (niveau > openNiveau(n, id)) return n;   // je kunt niet een niveau overslaan
    n.w[id].s[niveau - 1] = Math.max(n.w[id].s[niveau - 1], Math.min(3, aantal | 0));
    n.ts = Date.now();
    return n;
  }
  const lib = { NIVEAUS, BAAS_BONUS, VAKKEN, WERELDEN, wereld, maakDeck, tegenstanderNaam, sterren, schoon, samenvoegen, gewonnen, openNiveau, voltooid, aantalVoltooid, totaalSterren, registreer, SLEUTEL: 'spo_campagne' };
  globalThis.SPOCampagne = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
