// Gevecht: de wedstrijd zelf. Alles hier is "deterministisch": met dezelfde seed en dezelfde teams geeft het
// op beide computers precies dezelfde wedstrijd. Er staat geen scherm of netwerk in; dat doet team.js.
//
// Teams: lijst met kaarten { vak, cijfer, tier, z }. Plaats 0 is de keeper, de rest zijn veldspelers.
// Kant 'A' is degene die uitnodigde (onderaan in het canonieke veld), kant 'B' degene die accepteerde (bovenaan).
(function () {
  'use strict';

  const MAX_MIN = 90;       // een wedstrijd van 90 spelminuten
  const STAPPEN = 40;       // ... in 40 stappen (passes), samen ongeveer een minuut echte tijd
  const MAX_KANSEN = 6;
  const MIN_KANSEN = 3;
  const KLIK_MAX = 60;      // meer dan dit tellen we niet mee (60 kliks in 3 seconde is al onmenselijk snel)

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
  const TREDE_KLIK = [1, 1.03, 1.15, 1.4, 1.75];
  const AURA_STERKTE = [0, 0, 0.3, 0.8, 1.8];
  const AURA_KLIK = [1, 1, 1.05, 1.15, 1.35];
  const tredeVan = (k) => (k && Number.isInteger(k.t) ? Math.max(0, Math.min(4, k.t)) : k && k.z ? 1 : 0);
  const auraVan = (team) => (Array.isArray(team) ? team.reduce((m, k) => Math.max(m, tredeVan(k)), 0) : 0);
  function sterkte(k) { return k.cijfer + 0.4 * (k.tier | 0) + TREDE_STERKTE[tredeVan(k)]; }
  // Bonus voor de klik-duels: hoe hoger het cijfer, hoe sterker je kliks tellen (0,85 bij een 1, 1,3 bij een 10).
  // `ch` is de teamchemie (0 tot 100) en geeft hooguit +8% extra.
  const CHEMIE_MAX_BONUS = 0.08;
  const chemieBonus = (ch) => CHEMIE_MAX_BONUS * Math.max(0, Math.min(100, ch | 0)) / 100;
  function klikFactor(k, ch, aura) { return (0.8 + 0.05 * k.cijfer) * (1 + chemieBonus(ch)) * TREDE_KLIK[tredeVan(k)] * AURA_KLIK[aura | 0]; }

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

  const ander = (z) => (z === 'A' ? 'B' : 'A');
  const kies = (rng, lijst) => lijst[Math.floor(rng() * lijst.length) % lijst.length];

  // De wedstrijd. teams = { A: [kaart...], B: [kaart...] } (al in volgorde: keeper eerst).
  function maakSim(seed, teams, opties) {
    const rng = maakRng(seed);
    const n = teams.A.length;
    // Chemie per kant (0 tot 100, geheel getal). Zonder opties (oude versie of oude test) is het 0 en verandert er niets.
    const ch = { A: 0, B: 0 };
    if (opties && opties.chemie) { ch.A = Math.max(0, Math.min(100, Math.round(Number(opties.chemie.A)) || 0)); ch.B = Math.max(0, Math.min(100, Math.round(Number(opties.chemie.B)) || 0)); }
    const pos = { A: posities(n, 'A'), B: posities(n, 'B') };
    const aura = { A: auraVan(teams.A), B: auraVan(teams.B) };
    const sterkteIn = (z, i) => sterkte(teams[z][i]) + AURA_STERKTE[aura[z]];
    const s = {
      n, teams, pos, chemie: ch, minuut: 0, stand: { A: 0, B: 0 }, kansen: 0, sindsKans: 99, stap: 0,
      houder: null, kans: null, klaar: false, aftrapDoor: null,
    };
    // De aftrap is voor kant A, in het midden van het veld (de middelste veldspeler, of de keeper bij n = 1).
    function aftrapPlek(z) {
      if (n === 1) return 0;
      const mid = [];
      for (let i = 1; i < n; i++) if (lijnVan(n, i) === 2) mid.push(i);
      return mid.length ? mid[0] : Math.min(n - 1, 1 + Math.floor((n - 1) / 2));
    }
    s.houder = { z: 'A', i: aftrapPlek('A') };

    function topLijn() { let m = 0; for (let i = 1; i < n; i++) m = Math.max(m, lijnVan(n, i)); return m; }
    const top = topLijn();

    // Een volgende gebeurtenis. Elke aanroep gebruikt de generator in dezelfde volgorde op beide computers.
    s.volgende = function () {
      if (s.klaar) return { t: 'eind' };
      if (s.kans) throw new Error('Eerst het duel afhandelen.');
      if (s.minuut >= MAX_MIN - 1e-9) { s.klaar = true; return { t: 'eind', stand: Object.assign({}, s.stand) }; }
      const h = s.houder, z = h.z, o = ander(z);
      s.stap++; s.sindsKans++;

      // Een team met alleen een keeper: alleen schoten (keeper tegen keeper), om en om.
      if (n === 1) {
        s.minuut = Math.min(MAX_MIN, s.minuut + 15);
        const aanval = rng() < 0.5 ? z : o;
        return maakKans({ z: aanval, i: 0 }, { z: ander(aanval), i: 0 });
      }

      const lijn = lijnVan(n, h.i);
      const min = s.minuut;
      s.minuut = Math.min(MAX_MIN, s.minuut + MAX_MIN / STAPPEN);
      // Kans op een schot: voorin vaak, op het middenveld heel soms, en te weinig duels? Dan sneller.
      const nood = s.kansen < MIN_KANSEN && min > 68;
      if (s.kansen < MAX_KANSEN && (s.sindsKans >= 3 || nood) && lijn > 0) {
        let p = lijn === top ? 0.4 : (lijn === top - 1 && top >= 3 ? 0.06 : 0);
        if (s.kansen < MIN_KANSEN) {
          if (min > 55 && lijn === top) p = 0.85;
          if (nood) p = 1;
        }
        if (rng() < p) return maakKans(h, { z: o, i: 0 });
      }
      // Pass: iemand van mijn team, het liefst vooruit.
      const kandidaten = [];
      for (let i = 0; i < n; i++) {
        if (i === h.i) continue;
        const l = lijnVan(n, i);
        let w = l > lijn ? 3 : l === lijn ? 1.5 : 1;
        if (i === 0) w = lijn === 1 ? 0.5 : 0.15;
        if (lijn === 0) w = l === 1 ? 3 : 1;
        kandidaten.push({ i, w });
      }
      let tot = 0; for (const k of kandidaten) tot += k.w;
      let r = rng() * tot, naar = kandidaten[kandidaten.length - 1].i;
      for (const k of kandidaten) { r -= k.w; if (r <= 0) { naar = k.i; break; } }
      // Een tegenstander probeert de bal te onderscheppen (een veldspeler van de ander, bij n = 2 ook de keeper niet).
      const tegen = [];
      for (let i = 1; i < n; i++) tegen.push(i);
      const d = tegen.length ? kies(rng, tegen) : 0;
      const sPass = (sterkteIn(z, h.i) + sterkteIn(z, naar)) / 2;
      const sD = sterkteIn(o, d);
      const pOk = Math.max(0.25, Math.min(aura[z] === 4 ? 0.98 : 0.93, 0.76 + 0.05 * (sPass - sD) + chemieBonus(ch[z])));
      const a = pos[z][h.i], b = pos[z][naar];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const dur = Math.round(550 + 700 * dist + rng() * 150);
      const ok = rng() < pOk;
      if (ok) {
        s.houder = { z, i: naar };
        return { t: 'pass', van: { z, i: h.i }, naar: { z, i: naar }, dur, min: s.minuut };
      }
      s.houder = { z: o, i: d };
      return { t: 'onderschep', van: { z, i: h.i }, naar: { z, i: naar }, door: { z: o, i: d }, dur, min: s.minuut };
    };

    function maakKans(schutter, keeper) {
      s.kansen++; s.sindsKans = 0;
      s.kans = { k: s.kansen, schutter, keeper };
      s.houder = schutter;
      return { t: 'kans', k: s.kansen, schutter, keeper, min: s.minuut };
    }

    // Uitslag van het klikduel: aanvaller (ca kliks) tegen keeper (ck kliks). Wie relatief het meest klikt, wint.
    s.duelUitslag = function (ca, ck) {
      if (!s.kans) throw new Error('Er is geen duel.');
      const { schutter, keeper } = s.kans;
      const u = duelUitslag(teams[schutter.z][schutter.i], teams[keeper.z][keeper.i], ca, ck, ch[schutter.z], ch[keeper.z], aura[schutter.z], aura[keeper.z]);
      s.kans = null;
      if (u.goal) {
        s.stand[schutter.z]++;
        const z = keeper.z;
        s.houder = { z, i: aftrapPlek(z) };
        s.aftrapDoor = z;
      } else {
        s.houder = { z: keeper.z, i: 0 };
      }
      return u;
    };
    return s;
  }

  function schoonKlik(c) { return Number.isFinite(c) ? Math.max(0, Math.min(KLIK_MAX, Math.round(c))) : 0; }
  // Los van de wedstrijd, zodat het ook te testen is. De keeper houdt hem bij gelijke stand.
  function duelUitslag(schutterKaart, keeperKaart, ca, ck, chA, chK, auraA, auraK) {
    const sa = schoonKlik(ca) * klikFactor(schutterKaart, chA, auraA);
    const sk = schoonKlik(ck) * klikFactor(keeperKaart, chK, auraK);
    return { goal: sa > sk, sa, sk };
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
  // Hoe vaak de computer klikt in een duel van 3 seconde: een mens doet ongeveer 15 tot 25.
  function computerKliks(rng, kaart) {
    return Math.round(13 + kaart.cijfer * 0.9 + (rng() - 0.5) * 8);
  }

  const lib = {
    MAX_MIN, STAPPEN, KLIK_MAX, maakRng, seedUitTekst, seedUitHash, sterkte, klikFactor, GROEPEN, groepVan, chemie, chemieBonus, CHEMIE_MAX_BONUS, lijnen, lijnVan, posities, ordenTeam,
    maakSim, duelUitslag, schoonKlik, maakComputerTeam, computerKliks, TREDE_STERKTE, TREDE_KLIK, AURA_KLIK, tredeVan, auraVan,
  };
  globalThis.SPOGevecht = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
