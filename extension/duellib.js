/*
 * Somtoday Pack Opener v3.0: de spelregels van het DUEL (strafschoppen). Geen scherm en geen netwerk; team.js doet dat.
 *
 * Een duel is een reeks strafschoppen tussen twee teams: 5 beurten per kant, om en om (de eerste wordt bij de uitnodiging
 * door beide kanten even eerlijk uitgeloot). Bij elke strafschop is de één schutter en de ander keeper:
 *   - de schutter kiest richting (links, midden, rechts) en hoogte (laag, hoog) en stopt een wijzer in de groene zone van het
 *     timing-balkje (goed timen = harder en nauwkeuriger). Wie geen timing wil doen, kiest 'Zonder timing' (een vaste, gemiddelde timing);
 *   - de keeper kiest een duikrichting en een hoogte.
 * De uitkomst volgt uit die keuzes en uit de sterkte van de twee kaarten (sterkte, trede, heel/vloek, aura en chemie uit gevecht.js).
 * Als een kant het niet meer kan inhalen (zoals bij echte strafschoppen) of na 5 + 5 schoten is het duel klaar. Gelijk blijft gelijk.
 * De 5 beste veldspelers van een team nemen de strafschoppen (heeft het team minder, dan om de beurt); de keeper is altijd de keeper van het team.
 *
 * EERLIJK EN GELIJK OP BEIDE COMPUTERS
 * De uitkomst is een vaste (deterministische) functie van: de kaarten en teams (die beide kanten kennen), de keuzes van schutter en
 * keeper, en twee geheime getallen (een van de schutter, een van de keeper) die samen de dobbelstenen bepalen. De stappen:
 *   1. de keeper kiest, trekt een geheim getal nK en stuurt een VASTLEGGING (SHA-256 van zijn keuze en nK): sd_vast;
 *   2. de schutter ziet die vastlegging, kiest, trekt nS en stuurt zijn keuze, timing en nS: sd_schot;
 *   3. pas dan onthult de keeper zijn keuze en nK: sd_onthul. De schutter controleert de vastlegging.
 * De schutter kan dus niet meer reageren op de duik, en de keeper kan zijn duik of nK niet meer veranderen na het schot. Geen van
 * beide kan de dobbelstenen vooraf kennen (die hangen van allebei de getallen af). Beide computers rekenen daarna dezelfde uitkomst uit.
 * BEPERKINGEN (er is geen server die meekijkt, alles draait in de browsers):
 *   - de timing van de schutter (0 tot 100) is zijn eigen meting; een aangepaste browser kan altijd 100 melden. Het effect is begrensd:
 *     de timing verschuift kansen, hij beslist niet alleen;
 *   - een keeper die na het schot niet onthult (omdat hij ziet dat het een goal wordt) krijgt een doelpunt tegen: geen onthulling
 *     binnen de tijd telt als doelpunt voor de schutter;
 *   - de munten die je verdient zijn beperkt door een dagelijkse limiet (economie.js), ook als iemand vals speelt.
 *
 * Berichten tussen vrienden (versleuteld, via de bestaande berichtenkanalen). Alles wat binnenkomt gaat door schoonBericht().
 *   sd_uit {mid, nonce, team}          uitnodiging           sd_ja {mid, nonce, team}  geaccepteerd     sd_nee {mid}  geweigerd
 *   sd_stop {mid}                      gestopt               sd_hb {mid}               hartslag
 *   sd_vast {mid, k, c}                keeper legt keuze vast          sd_schot {mid, k, r, h, q, n}     schot van de schutter
 *   sd_onthul {mid, k, r, h, n}        keeper onthult                  sd_eind {mid, a, b}               eindstand (controle)
 *   Meekijken (toeschouwers, alleen vrienden): sd_kijk {mid, z, tg?} (ik speel een duel: kijk mee), sd_mee {mid} (ik kijk mee),
 *   sd_ev {mid, k, z, s, g, r, h, q, dr, dh, u, a, b, gt} (wat er in strafschop k gebeurde), sd_emoji {mid, e} (een emoji uit een vaste lijst).
 */
(function () {
  'use strict';
  const G = globalThis.SPOGevecht || (typeof require === 'function' ? require('./gevecht.js') : null);

  const RONDES = 5;
  const RICHTINGEN = ['links', 'midden', 'rechts'];
  const HOOGTES = ['laag', 'hoog'];
  const KEUZE_MS = 25000;       // zo lang mag je kiezen (daarna kiest het spel iets rustigs voor je)
  const ONTHUL_MS = 15000;      // zo lang mag de keeper wachten met onthullen
  const ZONDER_TIMING = 55;     // timing (0 tot 100) als je 'Zonder timing' kiest
  const EMOJI = ['\u{1F525}', '\u{1F62E}', '\u{1F44F}', '\u{1F602}']; // vuur, verbazing, applaus, lachen (dezelfde vier als bij meekijken)
  const MUNTEN = { w: 10, g: 4, v: 2 }; // de beloning per duel (wint, gelijk, verliest); de dagelijkse limiet staat in economie.js
  const klem = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---- rollen ----
  // `geordend` is het team in de vaste volgorde van G.ordenTeam (keeper eerst, dan op sterkte van laag naar hoog).
  function rollen(geordend) {
    const keeper = geordend[0];
    const veld = geordend.slice(1).reverse(); // sterkste eerst
    return { keeper, schutters: veld.length ? veld.slice(0, RONDES) : [keeper] };
  }
  const schutterVoor = (rol, beurt) => rol.schutters[beurt % rol.schutters.length];
  // Wie schiet strafschop k? `begin` is de kant die het eerst schiet ('A' of 'B').
  const kantVan = (begin, k) => (k % 2 === 0 ? begin : begin === 'A' ? 'B' : 'A');
  const beurtVan = (k) => Math.floor(k / 2);
  const anderKant = (z) => (z === 'A' ? 'B' : 'A');
  // Welke kant begint? Hangt van de geheime getallen van allebei af, dus geen van beide kan het sturen.
  const beginKant = (seedTekst) => { const r = G.maakRng(G.seedUitTekst('begin|' + seedTekst)); r(); return r() < 0.5 ? 'A' : 'B'; };
  const auraVan = (team) => (G ? G.auraVan(team) : 0);

  // ---- de stand ----
  function nieuweStand() { return { A: 0, B: 0, nA: 0, nB: 0, rij: [] }; }
  // Verwerkt de uitslag van een strafschop van kant `z` (goal: true/false).
  function verwerk(stand, z, goal) {
    stand['n' + z]++;
    if (goal) stand[z]++;
    stand.rij.push({ z, goal: !!goal });
    return stand;
  }
  // Klaar? Zoals bij echte strafschoppen: als de achterstand niet meer in te halen is, of als iedereen 5 keer schoot.
  function beslist(stand) {
    const restA = RONDES - stand.nA, restB = RONDES - stand.nB;
    const klaar = stand.A > stand.B + restB || stand.B > stand.A + restA || (restA === 0 && restB === 0);
    return { klaar, winnaar: !klaar || stand.A === stand.B ? null : stand.A > stand.B ? 'A' : 'B' };
  }
  const volgendeK = (stand) => stand.nA + stand.nB;
  // 'w' (kant z wint), 'g', 'v'
  function uitslagVoor(stand, z) {
    const b = beslist(stand);
    if (!b.klaar) return null;
    return b.winnaar === null ? 'g' : b.winnaar === z ? 'w' : 'v';
  }

  // ---- timing ----
  // Het balkje: een wijzer gaat heen en weer tussen 0 en 1 (driehoeksgolf). De groene zone staat rond `zone` en is `breed` breed.
  const wijzerPlek = (ms, periode) => { const f = (ms / periode) % 2; return f <= 1 ? f : 2 - f; };
  // Breedte (halve breedte) van de groene zone: sterkere kaarten hebben een iets bredere zone.
  const zoneHalf = (kaart) => 0.06 + 0.06 * klem(G.sterkte(kaart) / 18, 0, 1);
  // Hoe goed was de timing? 100 in de groene zone, en minder naarmate je er verder naast zit (0 bij een halve balk ernaast).
  function timingKwaliteit(plek, zone, half) {
    const afstand = Math.abs(plek - zone);
    if (afstand <= half) return 100;
    return klem(Math.round(100 * (1 - (afstand - half) / 0.5)), 0, 99);
  }
  const krachtVan = (q) => 0.45 + 0.5 * klem(q, 0, 100) / 100; // voor de animatie (0..1)

  // ---- de uitkomst van een strafschop ----
  // Sterkte van een kaart in dit duel: sterkte, aura van het team en teamchemie (hooguit +8%).
  function macht(kaart, ch, aura) { return (G.sterkte(kaart) + G.AURA_STERKTE[aura | 0]) * (1 + G.chemieBonus(ch)); }
  // Kansen in promille, zonder dobbelstenen. Alleen gewone rekenkunde, zodat elke browser hetzelfde uitkomt.
  function kansen(inp) {
    const d = klem(inp.sS - inp.sK, -12, 12) / 12;       // -1 (keeper veel sterker) tot 1 (schutter veel sterker)
    const qq = klem(inp.q, 0, 100) / 100;
    // Mis (paal of erover): slecht getimed schiet je vaak mis; hoog en in de hoeken is riskanter.
    let mis = 0.04 + 0.34 * (1 - qq) * (1 - qq) - 0.05 * d;
    if (inp.h === 'hoog') mis += 0.05;
    mis += inp.r === 'midden' ? -0.02 : 0.03;
    mis = klem(mis, 0.01, 0.6);
    // Redding (als het schot op doel is): hangt af van hoe goed de keeper de zone raadde.
    const zelfde = inp.r === inp.dr, hoogteGelijk = inp.h === inp.dh;
    let basis;
    if (zelfde && hoogteGelijk) basis = 0.78;
    else if (zelfde) basis = 0.34;
    else if (inp.r === 'midden' || inp.dr === 'midden') basis = hoogteGelijk ? 0.14 : 0.05;
    else basis = hoogteGelijk ? 0.04 : 0.02;
    let red = basis * (1 - 0.3 * d);                      // een sterkere schutter is moeilijker te stoppen
    red *= 1 - 0.4 * qq;                                  // een hard, goed getimed schot ook
    red = klem(red, 0.01, 0.92);
    const misP = Math.round(mis * 1000), redP = Math.round(red * 1000);
    return { misP, redP, goalP: Math.round(((1000 - misP) * (1000 - redP)) / 1000) };
  }
  // De dobbelstenen: drie getallen 0..999 uit de twee geheime getallen (en het duel en de strafschop).
  function dobbel(seedTekst) {
    const rng = G.maakRng(G.seedUitTekst(seedTekst));
    rng(); // de eerste waarde van mulberry32 lijkt nog te veel op nabije seeds
    return [Math.floor(rng() * 1000), Math.floor(rng() * 1000), Math.floor(rng() * 1000)];
  }
  // inp: { seedTekst, k, kant (schutterkant), beurt, schutter: kaart, keeper: kaart, chS, chK, auraS, auraK, kantK, plekK, r, h, q, dr, dh }
  function uitkomst(inp) {
    const sS = macht(inp.schutter, inp.chS, inp.auraS), sK = macht(inp.keeper, inp.chK, inp.auraK);
    const kn = kansen({ sS, sK, q: inp.q, r: inp.r, h: inp.h, dr: inp.dr, dh: inp.dh });
    const [rm, rr, rp] = dobbel(`${inp.seedTekst}|${inp.k}`);
    const seedNr = G.seedUitTekst(inp.seedTekst);
    // De vloek: een vervloekte schutter schiet er expres naast, een vervloekte keeper laat de bal erin. (Keren beide, dan telt de schutter.)
    const keertS = G.vloekKeert(seedNr, inp.k, inp.kant, inp.beurt, inp.schutter);
    const keertK = G.vloekKeert(seedNr, inp.k, anderKant(inp.kant), 0, inp.keeper);
    let u;
    let keert = null;
    if (keertS) { u = 'over'; keert = { z: inp.kant, rol: 'schutter' }; }
    else if (keertK) { u = 'goal'; keert = { z: anderKant(inp.kant), rol: 'keeper' }; }
    // Mis: een lage bal raakt de paal, een hoge gaat meestal over (in de hoeken soms tegen de paal).
    else if (rm < kn.misP) u = inp.h === 'hoog' && rp >= (inp.r === 'midden' ? 150 : 400) ? 'over' : 'paal';
    else if (rr < kn.redP) u = 'redding';
    else u = 'goal';
    return { uitkomst: u, goal: u === 'goal', keert, misP: kn.misP, redP: kn.redP, goalP: kn.goalP, sS, sK };
  }

  // ---- vastlegging van de keeper ----
  const HEX = /^[0-9a-f]+$/;
  const nonce = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  async function legVast(mid, k, dr, dh, n) {
    const t = `${mid}|${k}|${dr}|${dh}|${n}`;
    try {
      const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
      return Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { // geen WebCrypto: een zwakkere vastlegging is beter dan geen
      return (G.seedUitTekst(t) >>> 0).toString(16).padStart(8, '0').repeat(4);
    }
  }
  async function klopt(mid, k, dr, dh, n, c) { return (await legVast(mid, k, dr, dh, n)) === c; }

  // ---- de computer ----
  const kies = (rng, lijst, gew) => { let t = 0; for (const g of gew) t += g; let x = rng() * t; for (let i = 0; i < lijst.length; i++) { x -= gew[i]; if (x <= 0) return lijst[i]; } return lijst[lijst.length - 1]; };
  function computerSchot(rng, kaart) {
    return { r: kies(rng, RICHTINGEN, [0.38, 0.24, 0.38]), h: kies(rng, HOOGTES, [0.55, 0.45]), q: klem(Math.round(30 + kaart.cijfer * 4 + (rng() - 0.5) * 50), 5, 100) };
  }
  function computerDuik(rng) {
    return { dr: kies(rng, RICHTINGEN, [0.4, 0.2, 0.4]), dh: kies(rng, HOOGTES, [0.6, 0.4]) };
  }

  // ---- schoonmaak van wat een vriend stuurt ----
  const MID = /^[0-9a-f]{16,32}$/;
      const geheel = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  const hex = (x, min, max) => typeof x === 'string' && x.length >= min && x.length <= max && HEX.test(x);
  const richting = (x) => (RICHTINGEN.includes(x) ? x : null);
  const hoogte = (x) => (HOOGTES.includes(x) ? x : null);
  const emoji = (x) => { if (typeof x !== 'string' || x.length > 4) return null; const kaal = x.replace(/️/g, ''); return EMOJI.find((e) => e === kaal) || null; };
  const vriendenLib = () => globalThis.SPOVrienden || (typeof require === 'function' ? require('./vriendenlib.js') : null);
  // Een kaart in een gebeurtenis voor toeschouwers (hetzelfde als een kaart in een gedeeld team).
  function schoonKaart(k) {
    const L = vriendenLib();
    if (!k || typeof k !== 'object' || Array.isArray(k) || !L) return null;
    const t = L.schoonTeam({ kaarten: [k] });
    return t ? t.kaarten[0] : null;
  }
  // Maakt van een bericht een veilig bericht, of null. `leeftijd` in seconden.
  function schoonBericht(m, leeftijd) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || !MID.test(String(m.mid))) return null;
    if (!(Number.isFinite(leeftijd) && leeftijd >= 0 && leeftijd < 600)) return null;
    const mid = m.mid;
    const k = geheel(m.k, 0, 2 * RONDES - 1) ? m.k : -1;
    const L = vriendenLib();
    switch (m.t) {
      case 'sd_uit': case 'sd_ja': {
        if (m.t === 'sd_uit' && !(leeftijd < 300)) return null;
        const team = L ? L.schoonTeam(m.team) : null;
        return team && hex(m.nonce, 8, 40) ? { t: m.t, mid, nonce: m.nonce, team } : null;
      }
      case 'sd_nee': case 'sd_stop': case 'sd_hb': case 'sd_mee': return { t: m.t, mid };
      case 'sd_kijk': return leeftijd < 180 ? { t: m.t, mid, z: m.z === 'B' ? 'B' : 'A', tg: hex(m.tg, 32, 32) ? m.tg : null } : null;
      case 'sd_vast': return k >= 0 && hex(m.c, 32, 64) ? { t: m.t, mid, k, c: m.c } : null;
      case 'sd_schot': return k >= 0 && richting(m.r) && hoogte(m.h) && geheel(m.q, 0, 100) && hex(m.n, 8, 32) ? { t: m.t, mid, k, r: m.r, h: m.h, q: m.q, n: m.n } : null;
      case 'sd_onthul': return k >= 0 && richting(m.r) && hoogte(m.h) && hex(m.n, 8, 32) ? { t: m.t, mid, k, r: m.r, h: m.h, n: m.n } : null;
      case 'sd_eind': return geheel(m.a, 0, RONDES) && geheel(m.b, 0, RONDES) ? { t: m.t, mid, a: m.a, b: m.b } : null;
      case 'sd_emoji': { const e = emoji(m.e); return e ? { t: m.t, mid, e } : null; }
      case 'sd_ev': {
        const s = schoonKaart(m.s), g = schoonKaart(m.g);
        if (k < 0 || !s || !g || (m.z !== 'A' && m.z !== 'B') || !richting(m.r) || !hoogte(m.h) || !geheel(m.q, 0, 100) || !richting(m.dr) || !hoogte(m.dh)) return null;
        if (!['goal', 'redding', 'paal', 'over'].includes(m.u) || !geheel(m.a, 0, RONDES) || !geheel(m.b, 0, RONDES)) return null;
        return { t: m.t, mid, k, z: m.z, s, g, r: m.r, h: m.h, q: m.q, dr: m.dr, dh: m.dh, u: m.u, a: m.a, b: m.b, gt: geheel(m.gt, 0, 100) ? m.gt : 0 };
      }
      default: return null;
    }
  }
  // De kaart zoals die naar toeschouwers gaat (geen plaatje, geen id).
  const deelKaart = (k) => ({ vak: String(k.vak || '').slice(0, 24), cijfer: Math.round(k.cijfer * 100) / 100, tier: Math.max(0, Math.min(4, k.tier | 0)), t: Math.max(0, Math.min(4, k.t | 0)), z: (k.t | 0) >= 1, v: k.v === true, h: k.h === true });

  const lib = {
    RONDES, RICHTINGEN, HOOGTES, KEUZE_MS, ONTHUL_MS, ZONDER_TIMING, EMOJI, MUNTEN,
    rollen, schutterVoor, kantVan, beurtVan, anderKant, beginKant, auraVan,
    nieuweStand, verwerk, beslist, volgendeK, uitslagVoor,
    wijzerPlek, zoneHalf, timingKwaliteit, krachtVan,
    macht, kansen, dobbel, uitkomst, nonce, legVast, klopt, computerSchot, computerDuik,
    schoonBericht, deelKaart,
  };
  globalThis.SPODuel = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
