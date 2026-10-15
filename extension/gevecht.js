// Gevecht: de gedeelde basis voor teams en duels (sterkte van kaarten, teamchemie, vloek, computer-team).
// Alles hier is "deterministisch": met dezelfde invoer geeft het op beide computers precies hetzelfde. Er staat geen scherm of
// netwerk in. v3.0: het duel zelf is een reeks strafschoppen; de regels staan in duellib.js, het scherm in team.js.
//
// Teams: lijst met kaarten { vak, cijfer, tier, z }. Plaats 0 is de keeper, de rest zijn veldspelers.
(function () {
  'use strict';

  // Kleine, snelle generator met een seed (mulberry32).
  function maakRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Seed uit tekst (FNV-1a), voor als er geen WebCrypto is.
  function seedUitTekst(t) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // Seed uit een SHA-256 van tekst (de eerste vier bytes).
  async function seedUitHash(tekst) {
    const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst)));
    return ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  }

  // Sterkte van een kaart in het veld: het cijfer, met een beetje extra voor een hoog niveau en voor zeldzame kaarten.
  // v2.4: de ladder. k.t = trede 0..4 (gewoon, zeldzaam, glim, kosmisch, mythisch); oude kaarten hebben alleen k.z (zeldzaam).
  // Elke trede is sterker; mythisch is bijna niet te verslaan. Een team krijgt bovendien een aura van zijn hoogste trede.
  const TREDE_STERKTE = [0, 0.3, 1.2, 2.6, 6];
  const AURA_STERKTE = [0, 0, 0.3, 0.8, 1.8];
  const tredeVan = (k) => (k && Number.isInteger(k.t) ? Math.max(0, Math.min(4, k.t)) : k && k.z ? 1 : 0);
  const auraVan = (team) => (Array.isArray(team) ? team.reduce((m, k) => Math.max(m, tredeVan(k)), 0) : 0);
  // v2.4: een vervloekte kaart (k.v) is sterker, maar keert zich soms tegen zijn eigen team (zie vloekKeert).
  const VLOEK_STERKTE = 1.6;   // de sterkte van een vervloekte kaart telt zoveel keer mee
  const VLOEK_KANS = 0.2;      // kans per strafschop dat de vloek toeslaat
  const isVloek = (k) => !!k && k.v === true;
  // v3.0: een opgeheven vloek (k.h, zie heel.js) telt als één trede hoger (hoogstens mythisch) voor de sterkte. De vloek keert zich dan niet meer (k.v is dan onwaar).
  const isHeel = (k) => !!k && k.h === true && k.v !== true;
  const duelTrede = (k) => Math.min(4, tredeVan(k) + (isHeel(k) ? 1 : 0));
  function sterkte(k) { return (k.cijfer + 0.4 * (k.tier | 0) + TREDE_STERKTE[duelTrede(k)]) * (isVloek(k) ? VLOEK_STERKTE : 1); }
  // Slaat de vloek toe in strafschop `nr` van dit duel? Hangt alleen af van de seed, het duelnummer en de plek van de kaart,
  // dus beide spelers zien precies hetzelfde. Een kaart zonder vloek keert zich nooit.
  function vloekKeert(seed, nr, kant, plek, kaart) {
    if (!isVloek(kaart)) return false;
    const r = maakRng((seed ^ Math.imul(nr + 1, 0x9E3779B1) ^ Math.imul(plek + 1, 0x85EBCA6B) ^ (kant === 'A' ? 0x1234567 : 0x7654321)) >>> 0);
    r(); // de eerste waarde van mulberry32 is nog erg gelijk bij nabije seeds
    return r() < VLOEK_KANS;
  }
  // Teamchemie (0 tot 100) geeft hooguit +8% op de sterkte van de kaarten van een team in een duel.
  const CHEMIE_MAX_BONUS = 0.08;
  const chemieBonus = (ch) => CHEMIE_MAX_BONUS * Math.max(0, Math.min(100, ch | 0)) / 100;

  // ---- Teamchemie ----
  // Vakken die bij elkaar horen vormen een groep. Hoe meer kaarten uit dezelfde groep, en hoe vaker ze naast elkaar staan, hoe hoger de chemie.
  const GROEPEN = [
    { id: 'exact', naam: 'Exact', kleur: '#4aa8ff', vakken: 'wiskunde, natuurkunde, scheikunde, biologie, informatica, NLT' },
    { id: 'talen', naam: 'Talen', kleur: '#ff8a4a', vakken: 'Nederlands, Engels, Frans, Duits, Spaans, Latijn, Grieks' },
    { id: 'mens', naam: 'Mens & maatschappij', kleur: '#a678ff', vakken: 'geschiedenis, aardrijkskunde, economie, maatschappijleer, filosofie, levensbeschouwing' },
    { id: 'kunst', naam: 'Kunst & sport', kleur: '#3fcf8e', vakken: 'LO, tekenen, muziek, CKV, drama' },
  ];
  // Herkenning op de hele naam of op losse woorden (hoofdletters en leestekens maken niet uit), met de gewone Somtoday-afkortingen.
  const GROEP_WOORDEN = {
    exact: ['wiskunde', 'wisk', 'wis', 'wi', 'rekenen', 'statistiek', 'natuurkunde', 'natuurk', 'nat', 'na', 'scheikunde', 'scheik', 'sk', 'biologie', 'biol', 'bio', 'bi', 'informatica', 'inform', 'info', 'inf', 'in', 'nlt', 'natuur leven en technologie', 'techniek', 'technasium', 'ict'],
    talen: ['nederlands', 'nederl', 'ned', 'nl', 'ne', 'engels', 'eng', 'en', 'frans', 'fra', 'fa', 'fr', 'duits', 'dui', 'du', 'dt', 'spaans', 'spa', 'sp', 'latijn', 'lat', 'la', 'grieks', 'gr', 'gri', 'taal', 'italiaans', 'russisch', 'chinees', 'turks', 'arabisch'],
    mens: ['geschiedenis', 'gesch', 'gs', 'ges', 'aardrijkskunde', 'aardr', 'ak', 'aard', 'economie', 'econ', 'ec', 'eco', 'bedrijfseconomie', 'beco', 'maatschappijleer', 'maatschappij', 'maatsch', 'ml', 'maat', 'maw', 'maatschappijwetenschappen', 'filosofie', 'filos', 'fi', 'fil', 'levensbeschouwing', 'lev', 'lb', 'godsdienst', 'gods', 'kunstgeschiedenis'],
    kunst: ['lichamelijke opvoeding', 'lichamelijke', 'lichamelijk', 'lo', 'gymnastiek', 'gym', 'sport', 'bewegen', 'bewegingsonderwijs', 'tekenen', 'teken', 'tekenen en handvaardigheid', 'handvaardigheid', 'handv', 'tehv', 'te', 'kunst', 'beeldende vorming', 'beeldende', 'ckv', 'culturele en kunstzinnige vorming', 'muziek', 'muz', 'mu', 'drama', 'dr', 'dans', 'theater', 'kunstvakken'],
  };
  const WOORD_NAAR_GROEP = new Map();
  for (const g of GROEPEN) for (const w of GROEP_WOORDEN[g.id]) WOORD_NAAR_GROEP.set(w, g.id);
  const TOEVOEGING = /^(a|b|c|d|i|ii|iii|iv|havo|vwo|mavo|vmbo|tl|gl|kb|bb|mondeling|schriftelijk|se|ce|pta|\d+)$/;
  function groepVan(vak) {
    const t = String(vak || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (WOORD_NAAR_GROEP.has(t)) return WOORD_NAAR_GROEP.get(t);
    // Een vaknaam met een toevoeging ("wiskunde A", "Engels havo", "Nederlands 2"): laat de toevoegingen weg en kijk naar de losse woorden.
    const woorden = t.split(' ').filter((w) => !TOEVOEGING.test(w));
    if (woorden.length && WOORD_NAAR_GROEP.has(woorden.join(' '))) return WOORD_NAAR_GROEP.get(woorden.join(' '));
    for (const w of woorden) if (WOORD_NAAR_GROEP.has(w) && (w.length >= 3 || woorden.length === 1)) return WOORD_NAAR_GROEP.get(w);
    // Beginstuk van een langer woord ("natuurkunde-2", "wiskundige"): alleen bij lange stukken.
    for (const w of woorden) {
      if (w.length < 5) continue;
      for (const [x, id] of WOORD_NAAR_GROEP) if (x.length >= 5 && (w.startsWith(x) || x.startsWith(w))) return id;
    }
    return null;
  }
  // Welke spelers staan naast elkaar? Op het veld (zelfde plekken als in het gevecht): dichterbij dan deze afstand.
  const NAAST_AFSTAND = 0.36;
  function buren(n) {
    const p = posities(n, 'A'), uit = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y) <= NAAST_AFSTAND) uit.push([i, j]);
    return uit;
  }
  // Chemie van een team in de vaste volgorde (keeper eerst, dan op sterkte: zie ordenTeam). Geeft een geheel getal 0 tot 100:
  //  - tot 70 punten voor het aandeel kaarten dat in een groep van 3 of meer zit (een paar telt voor de helft),
  //  - tot 30 punten voor het aandeel naastgelegen spelers dat in dezelfde groep zit.
  function chemie(geordend) {
    const n = geordend.length;
    const groepen = geordend.map((k) => groepVan(k.vak));
    const tel = {};
    for (const g of groepen) if (g) tel[g] = (tel[g] || 0) + 1;
    const lijst = GROEPEN.map((g) => ({ id: g.id, naam: g.naam, kleur: g.kleur, n: tel[g.id] || 0 }));
    const bb = n > 1 ? buren(n) : [];
    const lijnen = bb.filter(([i, j]) => groepen[i] && groepen[i] === groepen[j]);
    let gekoppeld = 0;
    for (const g of lijst) gekoppeld += g.n >= 3 ? g.n : g.n === 2 ? 1 : 0;
    const deelGroep = n > 1 ? 70 * gekoppeld / n : 0;
    const deelNaast = bb.length ? 30 * lijnen.length / bb.length : 0;
    return { score: Math.max(0, Math.min(100, Math.round(deelGroep + deelNaast))), groepen, lijst, lijnen, deelGroep: Math.round(deelGroep), deelNaast: Math.round(deelNaast) };
  }

  // Hoeveel veldspelers per lijn (achterhoede, middenveld, voorhoede) bij n kaarten (inclusief keeper).
  const LIJNEN = { 0: [0, 0, 0], 1: [0, 1, 0], 2: [1, 0, 1], 3: [1, 1, 1], 4: [2, 1, 1], 5: [2, 2, 1], 6: [2, 2, 2], 7: [3, 2, 2], 8: [3, 3, 2], 9: [4, 3, 2], 10: [4, 4, 2] };
  function lijnen(n) { return LIJNEN[Math.max(0, Math.min(10, n - 1))].slice(); }
  // Zet het team in volgorde: keeper eerst, daarna de zwakste veldspelers achterin en de sterkste voorin.
  function ordenTeam(kaarten, keeperIndex) {
    const keeper = kaarten[keeperIndex];
    const rest = kaarten.filter((_, i) => i !== keeperIndex).sort((a, b) => sterkte(a) - sterkte(b));
    return [keeper].concat(rest);
  }
  // Lijn van speler i (0 = keeper, 1 = achterhoede, 2 = middenveld, 3 = voorhoede).
  function lijnVan(n, i) {
    if (i === 0) return 0;
    const l = lijnen(n);
    let j = i - 1;
    for (let r = 0; r < 3; r++) { if (j < l[r]) return r + 1; j -= l[r]; }
    return 3;
  }
  // Plekken in het veld (x en y tussen 0 en 1). Kant A speelt onderin en valt omhoog aan; kant B is gespiegeld.
  const LIJN_Y = [0.925, 0.79, 0.67, 0.555];
  function posities(n, kant) {
    const l = lijnen(n);
    const uit = [{ x: 0.5, y: LIJN_Y[0] }];
    for (let r = 0; r < 3; r++) {
      for (let j = 0; j < l[r]; j++) uit.push({ x: (j + 1) / (l[r] + 1), y: LIJN_Y[r + 1] });
    }
    return kant === 'A' ? uit : uit.map((p) => ({ x: 1 - p.x, y: 1 - p.y }));
  }

  // De computer-tegenstander (oefenmodus): een team van dezelfde grootte, rond het niveau van jouw team.
  const VAKKEN = ['Wiskunde', 'Nederlands', 'Engels', 'Biologie', 'Scheikunde', 'Natuurkunde', 'Geschiedenis', 'Aardrijkskunde', 'Frans', 'Duits', 'Economie', 'Muziek'];
  function maakComputerTeam(seed, n, mijn) {
    const rng = maakRng(seed ^ 0x9E3779B9);
    let gem = 6.5;
    if (mijn && mijn.length) gem = mijn.reduce((a, k) => a + k.cijfer, 0) / mijn.length;
    const uit = [];
    for (let i = 0; i < n; i++) {
      const c = Math.max(3, Math.min(10, Math.round((gem + (rng() - 0.5) * 3) * 10) / 10));
      const tier = c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0;
      const z = rng() < 0.08;
      uit.push({ vak: VAKKEN[Math.floor(rng() * VAKKEN.length)], cijfer: c, tier, z, t: z ? 1 : 0 });
    }
    return uit;
  }
  const lib = {
    maakRng, seedUitTekst, seedUitHash, sterkte, GROEPEN, groepVan, chemie, chemieBonus, CHEMIE_MAX_BONUS, lijnen, lijnVan, posities, ordenTeam,
    vloekKeert, isVloek, isHeel, duelTrede, VLOEK_STERKTE, VLOEK_KANS, maakComputerTeam, TREDE_STERKTE, AURA_STERKTE, tredeVan, auraVan,
  };
  globalThis.SPOGevecht = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
