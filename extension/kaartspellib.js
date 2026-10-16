/*
 * Somtoday Pack Opener v3.0: de spelregels van het Kaartspel (deck tegen deck). Geen scherm en geen netwerk; kaartspel.js doet dat.
 *
 * Je kiest een deck van 5 eigen kaarten. Per ronde speel je een kaart uit en kiest een van drie vergelijkingen. Beste van 5: wie het eerst 3 rondes wint.
 *   cijfer  de kaart met het hoogste cijfer wint
 *   ladder  de sterkste kaart wint: cijfer, niveau en trede samen (dezelfde sterkte als in het teamgevecht)
 *   groep   steen-papier-schaar tussen de vakgroepen: Exact verslaat Talen, Talen verslaat Mens & maatschappij,
 *           Mens & maatschappij verslaat Kunst & sport, Kunst & sport verslaat Exact. Andere paren: het hoogste cijfer wint.
 * De ronde-kiezer wisselt af: ronde 1 kiest de uitdager (of jij tegen de computer), ronde 2 de ander, enzovoort.
 * De kiezer noemt eerst de vergelijking; dan kiezen beide spelers geheim een kaart. Beide decks zijn voor iedereen zichtbaar.
 *
 * Berichten tussen vrienden (versleuteld, via de bestaande berichtenkanalen). Alles wat binnenkomt gaat door schoonBericht().
 *   { t:'ks_uit', mid, deck }   uitnodiging          { t:'ks_ja', mid, deck }  geaccepteerd      { t:'ks_nee', mid }  geweigerd
 *   { t:'ks_vgl', mid, r, v }   de kiezer noemt de vergelijking van ronde r
 *   { t:'ks_kaart', mid, r, i } mijn gespeelde kaart (plek in mijn deck)          { t:'ks_stop', mid }  opgegeven
 */
(function () {
  'use strict';
  const G = globalThis.SPOGevecht || (typeof require === 'function' ? require('./gevecht.js') : null);

  const DECK = 5;
  const WINST = 3;
  const VGL_IDS = ['cijfer', 'ladder', 'groep'];
  const VGL = {
    cijfer: { naam: 'Cijfer', uitleg: 'Het hoogste cijfer wint.' },
    ladder: { naam: 'Ladder', uitleg: 'De sterkste kaart wint: cijfer, niveau en trede samen.' },
    groep: { naam: 'Vakgroep', uitleg: 'Exact slaat Talen, Talen slaat Mens, Mens slaat Kunst, Kunst slaat Exact. Anders wint het hoogste cijfer.' },
  };
  const SLAAT = { exact: 'talen', talen: 'mens', mens: 'kunst', kunst: 'exact' };
  const GROEP_NAAM = { exact: 'Exact', talen: 'Talen', mens: 'Mens & maatschappij', kunst: 'Kunst & sport' };
  const MUNTEN = { w: 12, g: 5, v: 2 };   // de beloning per potje (wint, gelijk, verliest); de dagelijkse limiet staat in economie.js
  const heeft = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  const groepVan = (k) => (G && G.groepVan ? G.groepVan(k.vak) : null);
  const sterkte = (k) => (G ? G.sterkte(k) : k.cijfer);

  // 1 = a wint, -1 = b wint, 0 = gelijk
  function vergelijk(a, b, vgl) {
    const diff = (x, y) => (Math.abs(x - y) < 0.005 ? 0 : x > y ? 1 : -1);
    if (vgl === 'ladder') return diff(sterkte(a), sterkte(b));
    if (vgl === 'groep') {
      const ga = groepVan(a), gb = groepVan(b);
      if (ga && gb && ga !== gb) { if (SLAAT[ga] === gb) return 1; if (SLAAT[gb] === ga) return -1; }
      return diff(a.cijfer, b.cijfer);
    }
    return diff(a.cijfer, b.cijfer);
  }

  // ---- het potje ----
  // `ik` en `zij` zijn de decks (5 kaarten). `beginner` is wie in ronde 1 de vergelijking kiest: 'ik' of 'zij'.
  function nieuwPotje(ik, zij, beginner) {
    return { ik: ik.slice(0, DECK), zij: zij.slice(0, DECK), beginner: beginner === 'zij' ? 'zij' : 'ik', r: 0, score: { ik: 0, zij: 0 }, gebruikt: { ik: [], zij: [] }, rondes: [] };
  }
  const kiezer = (p, r) => ((r === undefined ? p.r : r) % 2 === 0 ? p.beginner : p.beginner === 'ik' ? 'zij' : 'ik');
  const over = (p, kant) => p[kant].map((k, i) => i).filter((i) => !p.gebruikt[kant].includes(i));
  const eind = (p) => p.score.ik >= WINST || p.score.zij >= WINST || p.r >= DECK;
  // Speelt een ronde: kaart-plek `i` van mij tegen plek `j` van de ander. Geeft { winnaar: 'ik' | 'zij' | null } of null als het niet mag.
  function speelRonde(p, vgl, i, j) {
    if (eind(p) || !VGL_IDS.includes(vgl) || !over(p, 'ik').includes(i) || !over(p, 'zij').includes(j)) return null;
    const u = vergelijk(p.ik[i], p.zij[j], vgl);
    const winnaar = u > 0 ? 'ik' : u < 0 ? 'zij' : null;
    if (winnaar) p.score[winnaar]++;
    p.gebruikt.ik.push(i); p.gebruikt.zij.push(j);
    const rij = { r: p.r, vgl, kiezer: kiezer(p), i, j, winnaar };
    p.rondes.push(rij);
    p.r++;
    return rij;
  }
  // 'w' (ik win), 'g' (gelijk), 'v' (ik verlies); null als het potje nog loopt.
  function uitslag(p) {
    if (!eind(p)) return null;
    return p.score.ik > p.score.zij ? 'w' : p.score.ik < p.score.zij ? 'v' : 'g';
  }

  // ---- de computer ----
  // Kans dat kaart `k` (van de computer) wint van een willekeurige van de resterende kaarten van de ander, bij vergelijking `vgl` (gelijk telt als half).
  function kansOp(k, rest, vgl) {
    if (!rest.length) return 0.5;
    let s = 0;
    for (const t of rest) s += -vergelijk(t, k, vgl) / 2 + 0.5;
    return s / rest.length;
  }
  // De computer als kiezer: kies (vergelijking, kaart) met de beste winstkans, af en toe de op een na beste zodat het niet voorspelbaar is.
  function computerKiest(p, rng) {
    const eigen = over(p, 'zij'), hun = over(p, 'ik').map((i) => p.ik[i]);
    const opties = [];
    for (const vgl of VGL_IDS) for (const j of eigen) opties.push({ vgl, j, s: kansOp(p.zij[j], hun, vgl) + rng() * 0.3 });
    opties.sort((a, b) => b.s - a.s);
    const o = opties[rng() < 0.2 && opties.length > 1 ? 1 : 0];
    return { vgl: o.vgl, j: o.j };
  }
  // De computer als antwoorder: kies de kaart die het best past bij de genoemde vergelijking.
  function computerAntwoordt(p, vgl, rng) {
    const hun = over(p, 'ik').map((i) => p.ik[i]);
    const opties = over(p, 'zij').map((j) => ({ j, s: kansOp(p.zij[j], hun, vgl) + rng() * 0.3 }));
    opties.sort((a, b) => b.s - a.s);
    return opties[rng() < 0.2 && opties.length > 1 ? 1 : 0].j;
  }
  const AI_VAKKEN = ['Wiskunde', 'Natuurkunde', 'Biologie', 'Scheikunde', 'Nederlands', 'Engels', 'Frans', 'Duits', 'Geschiedenis', 'Economie', 'Aardrijkskunde', 'Muziek', 'Tekenen', 'LO'];
  const tierVan = (c) => (c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0);
  // Een deck voor de computer, ongeveer even sterk als het jouwe (zodat het een eerlijk potje is).
  function maakComputerDeck(rng, ref) {
    const gem = ref && ref.length ? ref.reduce((s, k) => s + k.cijfer, 0) / ref.length : 6.5;
    const maxT = ref && ref.length ? ref.reduce((m, k) => Math.max(m, k.t | 0), 0) : 1;
    const vakken = AI_VAKKEN.slice();
    const uit = [];
    for (let n = 0; n < DECK; n++) {
      const v = vakken.splice(Math.floor(rng() * vakken.length), 1)[0];
      const cijfer = Math.round(Math.max(2.5, Math.min(9.8, gem + (rng() - 0.5) * 3.2)) * 10) / 10;
      const r = rng();
      const t = Math.min(maxT, r < 0.08 ? 2 : r < 0.22 ? 1 : 0);
      uit.push({ vak: v, cijfer, tier: tierVan(cijfer), t, z: t >= 1, v: false, h: false });
    }
    return uit;
  }

  // ---- schoonmaak van wat een vriend stuurt ----
  const getal = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  const MID = /^[0-9a-f]{16,32}$/;
  function schoonKaart(k) {
    if (!k || typeof k !== 'object' || Array.isArray(k) || typeof k.vak !== 'string' || !getal(k.cijfer, 1, 10)) return null;
    const vak = k.vak.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24);
    if (!vak) return null;
    const t = Number.isInteger(k.t) ? Math.max(0, Math.min(4, k.t)) : 0;
    const uit = { vak, cijfer: Math.round(k.cijfer * 100) / 100, tier: Number.isInteger(k.tier) ? Math.max(0, Math.min(4, k.tier)) : 0, t, z: t >= 1, v: k.v === true && k.h !== true, h: k.h === true && k.v !== true };
    return uit;
  }
  function schoonDeck(a) {
    if (!Array.isArray(a) || a.length !== DECK) return null;
    const uit = a.map(schoonKaart);
    return uit.every(Boolean) ? uit : null;
  }
  // Maakt van een bericht een veilig bericht, of null. `leeftijd` in seconden (uitnodigingen verlopen na 5 minuten).
  function schoonBericht(m, leeftijd) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || !MID.test(String(m.mid))) return null;
    const mid = m.mid;
    const r = Number.isInteger(m.r) && m.r >= 0 && m.r < DECK ? m.r : -1;
    switch (m.t) {
      case 'ks_uit': { if (!(leeftijd < 300)) return null; const deck = schoonDeck(m.deck); return deck ? { t: m.t, mid, deck } : null; }
      case 'ks_ja': { const deck = schoonDeck(m.deck); return deck ? { t: m.t, mid, deck } : null; }
      case 'ks_nee': case 'ks_stop': return { t: m.t, mid };
      case 'ks_vgl': return r >= 0 && typeof m.v === 'string' && VGL_IDS.includes(m.v) ? { t: m.t, mid, r, v: m.v } : null;
      case 'ks_kaart': return r >= 0 && Number.isInteger(m.i) && m.i >= 0 && m.i < DECK ? { t: m.t, mid, r, i: m.i } : null;
      default: return null;
    }
  }
  // De kaart zoals die naar een vriend gaat (geen plaatje, geen id).
  const deelKaart = (k) => ({ vak: String(k.vak || '').slice(0, 24), cijfer: Math.round(k.cijfer * 100) / 100, tier: Math.max(0, Math.min(4, k.tier | 0)), t: Math.max(0, Math.min(4, k.t | 0)), v: k.v === true, h: k.h === true });

  const lib = { DECK, WINST, VGL_IDS, VGL, SLAAT, GROEP_NAAM, MUNTEN, vergelijk, groepVan, nieuwPotje, kiezer, over, eind, speelRonde, uitslag, computerKiest, computerAntwoordt, maakComputerDeck, schoonKaart, schoonDeck, schoonBericht, deelKaart, heeft };
  globalThis.SPOKaartspel = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
