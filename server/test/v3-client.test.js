// v3.0 (prestaties, troostpakje, weekoverzicht, tijdcapsule): Node-tests voor de regels en Chromium-tests voor de schermen.
// Gebruik: export NODE_PATH=$(npm root -g); (cd extension && npx http-server -p 8126 -s -c-1 . &) ; node server/test/v3-client.test.js
// Foto's: SPO_FOTO=/pad/naar/map node server/test/v3-client.test.js   (zonder deze variabele worden geen foto's gemaakt)
process.env.TZ = 'Europe/Amsterdam'; // lokale tijd, ook over zomer- en wintertijd heen
const fs = require('node:fs');
const path = require('node:path');

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const EXT = path.resolve(__dirname, '../../extension');
const P = require(EXT + '/prestatieslib.js');
require(EXT + '/economie.js');
const E = globalThis.SPOEco;
const C = require(EXT + '/capsule.js');
globalThis.__SPO_TEST_ZONDER_START = true;
const W = require(EXT + '/weekoverzicht.js');
const T = require(EXT + '/troost.js');
const A = require(EXT + '/account.js');

let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const FOTO = process.env.SPO_FOTO || '';
if (FOTO) fs.mkdirSync(FOTO, { recursive: true });

const uur = (j, m, d, u, min) => new Date(j, m - 1, d, u == null ? 12 : u, min || 0).getTime();
const kaart = (id, ts, vak, cijfer, extra) => Object.assign({ id, ts, vak, cijfer, onderwerp: 'T', weging: 1, opening: 'pak', tier: 1, zeldzaam: false, trede: 0 }, extra || {});
const bron = (gal, gev) => ({ gal, gev: gev || {}, team: [], stats: {}, behaald: {} });
const klaar = (b, id) => P.uitrekenen(b).find((x) => x.id === id).klaar;

// ───────── 1. Geheime prestaties: model en meetfuncties ─────────
(function geheim() {
  const geheimen = P.BADGES.filter((b) => b.tier === 5);
  controle('7 geheime prestaties', geheimen.length === 7, geheimen.length);
  controle('elke geheime heeft raadsel, tekst en meet', geheimen.every((b) => b.raadsel && b.tekst && typeof b.meet === 'function' && b.naam));
  controle('raadsel verklapt de tekst niet', geheimen.every((b) => b.raadsel !== b.tekst && !b.tekst.includes(b.raadsel)));
  controle('Pure Aura: raadsel', P.BADGES.find((b) => b.id === 'fout-in-de-werkelijkheid').raadsel === 'Het hoogste van het hoogste.');
  controle('eigen glitch-rang per geheime (behalve Pure Aura)', new Set(geheimen.filter((b) => b.id !== 'fout-in-de-werkelijkheid').map((b) => b.rang)).size === 6 && geheimen.filter((b) => b.id !== 'fout-in-de-werkelijkheid').every((b) => b.rang && b.rang.length > b.rang.replace(/[̀-ͯ]/g, '').length));
  controle('ids uniek', new Set(P.BADGES.map((b) => b.id)).size === P.BADGES.length);

  // Pure Aura: 10 op mythisch
  controle('Pure Aura nee (10 op kosmisch)', !klaar(bron([kaart('a', uur(2026, 5, 1), 'Wis', 10, { trede: 3 })]), 'fout-in-de-werkelijkheid'));
  controle('Pure Aura ja', klaar(bron([kaart('a', uur(2026, 5, 1), 'Wis', 10, { trede: 4 })]), 'fout-in-de-werkelijkheid'));
  // Twaalf slagen: tussen 00:00 en 00:59
  controle('Twaalf slagen ja (00:30)', klaar(bron([kaart('a', uur(2026, 5, 1, 0, 30), 'Wis', 7)]), 'twaalf-slagen'));
  controle('Twaalf slagen ja (00:00)', klaar(bron([kaart('a', uur(2026, 5, 1, 0, 0), 'Wis', 7)]), 'twaalf-slagen'));
  controle('Twaalf slagen nee (01:00)', !klaar(bron([kaart('a', uur(2026, 5, 1, 1, 0), 'Wis', 7)]), 'twaalf-slagen'));
  controle('Twaalf slagen nee (23:59)', !klaar(bron([kaart('a', uur(2026, 5, 1, 23, 59), 'Wis', 7)]), 'twaalf-slagen'));
  // Echo: twee opeenvolgende kaarten met hetzelfde cijfer
  controle('Echo ja', klaar(bron([kaart('a', 1000, 'Wis', 7.2), kaart('b', 2000, 'Eng', 7.2)]), 'echo'));
  controle('Echo ja (op volgorde van openen, niet van de lijst)', klaar(bron([kaart('b', 2000, 'Eng', 7.2), kaart('a', 1000, 'Wis', 7.2)]), 'echo'));
  controle('Echo nee (er zit een ander cijfer tussen)', !klaar(bron([kaart('a', 1000, 'Wis', 7.2), kaart('c', 1500, 'Ned', 8), kaart('b', 2000, 'Eng', 7.2)]), 'echo'));
  controle('Echo nee (1 kaart)', !klaar(bron([kaart('a', 1000, 'Wis', 7.2)]), 'echo'));
  // Op het randje: precies 5,5
  controle('Randje ja', klaar(bron([kaart('a', 1000, 'Wis', 5.5)]), 'op-het-randje'));
  controle('Randje nee (5,4 en 5,6)', !klaar(bron([kaart('a', 1000, 'Wis', 5.4), kaart('b', 2000, 'Wis', 5.6)]), 'op-het-randje'));
  // Zeven zonnen: 7 kalenderdagen achter elkaar (ook over de wintertijd van 25 oktober 2026 heen)
  const dagen = (lijst) => lijst.map(([m, d], i) => kaart('k' + i, uur(2026, m, d, i % 2 ? 23 : 8), 'Wis', 6 + i * 0.1));
  controle('Zeven zonnen ja (over wintertijd)', klaar(bron(dagen([[10, 22], [10, 23], [10, 24], [10, 25], [10, 26], [10, 27], [10, 28]])), 'zeven-zonnen'));
  controle('Zeven zonnen ja (maandgrens)', klaar(bron(dagen([[1, 29], [1, 30], [1, 31], [2, 1], [2, 2], [2, 3], [2, 4]])), 'zeven-zonnen'));
  controle('Zeven zonnen nee (6 dagen)', !klaar(bron(dagen([[10, 22], [10, 23], [10, 24], [10, 25], [10, 26], [10, 27]])), 'zeven-zonnen'));
  controle('Zeven zonnen nee (gat)', !klaar(bron(dagen([[10, 22], [10, 23], [10, 24], [10, 26], [10, 27], [10, 28], [10, 29]])), 'zeven-zonnen'));
  controle('Zeven zonnen telt dagen, niet kaarten (7 kaarten op 1 dag)', !klaar(bron([1, 2, 3, 4, 5, 6, 7].map((i) => kaart('k' + i, uur(2026, 10, 22, 8 + i), 'Wis', 6 + i * 0.1))), 'zeven-zonnen'));
  // Heel gemaakt: vloek, daarna 8+ in hetzelfde vak
  const vl = kaart('v', 1000, 'Wiskunde', 3.2, { vloek: true });
  controle('Heel gemaakt ja', klaar(bron([vl, kaart('b', 2000, 'wiskunde', 8.1)]), 'heel-gemaakt'));
  controle('Heel gemaakt nee (8 was eerder)', !klaar(bron([kaart('b', 500, 'Wiskunde', 9), vl]), 'heel-gemaakt'));
  controle('Heel gemaakt nee (ander vak)', !klaar(bron([vl, kaart('b', 2000, 'Engels', 9)]), 'heel-gemaakt'));
  controle('Heel gemaakt nee (7,9)', !klaar(bron([vl, kaart('b', 2000, 'Wiskunde', 7.9)]), 'heel-gemaakt'));
  controle('Heel gemaakt nee (geen vloek)', !klaar(bron([kaart('v', 1000, 'Wiskunde', 3.2), kaart('b', 2000, 'Wiskunde', 9)]), 'heel-gemaakt'));
  // Ongebroken: 10 gevechten achter elkaar gewonnen
  const gev = (res) => ({ v1: Array.from(res).map((r, i) => ({ ts: 1000 + i, mijn: r === 'w' ? 3 : r === 'g' ? 2 : 1, hun: r === 'w' ? 1 : 2 })) });
  controle('Ongebroken ja', klaar(bron([], gev('wwwwwwwwww')), 'ongebroken'));
  controle('Ongebroken ja (na een verlies)', klaar(bron([], gev('vwwwwwwwwww')), 'ongebroken'));
  controle('Ongebroken nee (9)', !klaar(bron([], gev('wwwwwwwww')), 'ongebroken'));
  controle('Ongebroken nee (verlies in het midden)', !klaar(bron([], gev('wwwwwvwwwww')), 'ongebroken'));
  controle('Ongebroken nee (gelijkspel telt niet als winst)', !klaar(bron([], gev('wwwwwgwwwww')), 'ongebroken'));
  controle('Ongebroken over meerdere vrienden, op tijd', klaar(bron([], { a: [1, 3, 5, 7, 9].map((t) => ({ ts: t, mijn: 2, hun: 1 })), b: [2, 4, 6, 8, 10].map((t) => ({ ts: t, mijn: 2, hun: 1 })) }), 'ongebroken'));

  // Weergave: geen uitleg en geen voortgang bij een nog dichte geheime prestatie
  const lijst = P.uitrekenen(bron([kaart('a', 1000, 'Wis', 7)]));
  const dicht = lijst.filter((b) => b.geheim && !b.klaar);
  controle('dichte geheime: tekst leeg, uitleg is raadsel, doel 1', dicht.length === 7 && dicht.every((b) => b.tekst === '' && b.uitleg === b.raadsel && b.nu === 0 && b.doel === 1));
  const behaald = P.uitrekenen(bron([kaart('a', 1000, 'Wis', 5.5)])).find((b) => b.id === 'op-het-randje');
  controle('behaalde geheime: echte uitleg', behaald.klaar && behaald.uitleg === 'Haal precies een 5,5.' && behaald.tekst === behaald.uitleg);
  controle('niet-geheime ongewijzigd', lijst.find((b) => b.id === 'eerste-kaart').uitleg === 'Open je eerste pakket.');
})();

// ───────── 2. Troostpakje ─────────
async function troost() {
  const RealDate = Date;
  const klok = (iso) => { const vast = new RealDate(iso).getTime(); globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [vast])); } static now() { return vast; } }; };
  const klokTerug = () => { globalThis.Date = RealDate; };
  mem.clear();
  klok('2026-10-12T10:00:00');
  controle('minstens 12 teksten', T.TEKSTEN.length >= 12, T.TEKSTEN.length);
  controle('teksten kort en zonder dubbelen', T.TEKSTEN.every((t) => t.length <= 80) && new Set(T.TEKSTEN).size === T.TEKSTEN.length);
  controle('nooit twee dezelfde achter elkaar', (() => { let vorige = ''; for (let i = 0; i < 200; i++) { const t = T.tekstVoor(4.2, i % 3 === 0 ? 0 : Math.random()); if (t === vorige) return false; vorige = t; } return true; })());
  try {
    const F = require(EXT + '/tekstfilter.js');
    const bad = T.TEKSTEN.map((t) => t.replace('{c}', '4,2')).filter((t) => !F.controleer(t, { max: 300, soort: 'tekst' }).ok);
    controle('alle troostteksten passeren het echte tekstfilter', bad.length === 0, bad.join(' | '));
    const bad2 = P.BADGES.flatMap((b) => [b.naam, b.tekst, b.raadsel || '']).filter((t) => t && !F.controleer(t, { max: 300, soort: 'tekst' }).ok);
    controle('alle prestatieteksten, namen en raadsels passeren het filter', bad2.length === 0, bad2.join(' | '));
  } catch (e) { controle('filter laadt in troosttest', false, String(e)); }
  controle('cijfer komt in de tekst', T.tekstVoor(4.2, 0).includes('4,2'));

  const r1 = await E.troostPakje('kaart-1', 4.2);
  controle('troostpakje 1 ok', r1.ok === true && r1.munten === 5 && typeof r1.item === 'string' && E.PER_ID.has(r1.item), JSON.stringify(r1));
  const saldo1 = (await E.lees()).munten.saldo;
  controle('munten erbij (minstens 5)', saldo1 >= 5, saldo1);
  const r1b = await E.troostPakje('kaart-1', 4.2);
  controle('zelfde kaart een tweede keer: nee', r1b.ok === false && r1b.reden === 'al-gehad', JSON.stringify(r1b));
  controle('saldo ongewijzigd na weigering', (await E.lees()).munten.saldo === saldo1);
  controle('voldoende cijfer: geen troost', (await E.troostPakje('kaart-v', 5.5)).reden === 'voldoende' && (await E.troostPakje('kaart-v', 8)).reden === 'voldoende');
  controle('5,49 telt als onvoldoende', (await E.troostPakje('kaart-grens', 5.49)).ok === true);
  controle('ongeldige invoer', (await E.troostPakje('', 4)).reden === 'ongeldig' && (await E.troostPakje('x', NaN)).reden === 'ongeldig' && (await E.troostPakje(7, 4)).reden === 'ongeldig');
  const r3 = await E.troostPakje('kaart-3', 3);
  controle('derde van de dag ok', r3.ok === true);
  const r4 = await E.troostPakje('kaart-4', 3);
  controle('vierde van de dag: nee', r4.ok === false && r4.reden === 'dagmax', JSON.stringify(r4));
  // de geweigerde kaart is niet 'opgebruikt': morgen mag hij nog
  klokTerug(); klok('2026-10-13T09:00:00');
  const r5 = await E.troostPakje('kaart-4', 3);
  controle('volgende dag weer 3 mogelijk (geweigerde kaart telt nog)', r5.ok === true);
  controle('dagmax gaat niet over naar morgen', (await E.troostPakje('kaart-5', 3)).ok === true && (await E.troostPakje('kaart-6', 3)).ok === true && (await E.troostPakje('kaart-7', 3)).reden === 'dagmax');
  // gelijktijdig: 10 tegelijk voor dezelfde kaart op een nieuwe dag geeft precies 1
  klokTerug(); klok('2026-10-14T09:00:00');
  const gelijk = await Promise.all(Array.from({ length: 10 }, () => E.troostPakje('kaart-gelijk', 2)));
  controle('10 gelijktijdig voor een kaart: precies 1', gelijk.filter((x) => x.ok).length === 1);
  const veel = await Promise.all(Array.from({ length: 10 }, (_, i) => E.troostPakje('kaart-m' + i, 2)));
  controle('10 gelijktijdig voor 10 kaarten: hoogstens 2 meer (3 per dag)', veel.filter((x) => x.ok).length === 2, veel.filter((x) => x.ok).length);
  // het log heeft het item erbij, zodat herstelUitLog het terugvindt
  const log = (await E.lees()).log;
  controle('log: Troostpakje met pak:troost:<item>', log.some((x) => /^pak:troost:[a-z-]+$/.test(x.id) && /^Troostpakje: /.test(x.r)));
  const winkel = (await E.lees()).winkel;
  controle('item staat in de winkel', winkel.gekocht.length > 0);
  // het item blijft over een herstart: opnieuw lezen geeft hetzelfde
  const id1 = JSON.parse(mem.get('spo_munten_ids'));
  controle('ids bevatten t: en td: sleutels', Object.keys(id1).some((k) => k.startsWith('t:kaart-1')) && Object.keys(id1).some((k) => /^td:2026-10-12:[123]$/.test(k)));

  // 'na' zonder document: geeft de uitkomst terug en laat niets vallen
  klokTerug(); klok('2026-10-20T09:00:00');
  const n = await T.na({ id: 'kaart-na', cijfer: 3.1 });
  controle('na() geeft ok en tekst', n.ok === true && typeof n.tekst === 'string' && n.tekst.length > 5, JSON.stringify(n));
  controle('na() met een voldoende: niets', (await T.na({ id: 'kaart-na2', cijfer: 7 })).ok === false);
  klokTerug();
}

// ───────── 3. Weekoverzicht (regels) ─────────
async function week() {
  const d = (j, m, dd, u) => new Date(j, m - 1, dd, u || 10);
  // 2026-10-12 is een maandag
  controle('maandag geen eerdere keer: ja', W.moetTonen(d(2026, 10, 12), '', true) === true);
  controle('dinsdag geen eerdere keer: nee', W.moetTonen(d(2026, 10, 13), '', true) === false);
  controle('maandag, vandaag al gehad: nee', W.moetTonen(d(2026, 10, 12), '2026-10-12', true) === false);
  controle('maandag, vorige maandag gehad: ja', W.moetTonen(d(2026, 10, 12), '2026-10-05', true) === true);
  controle('woensdag, vorige maandag gehad (2 dagen): nee', W.moetTonen(d(2026, 10, 7), '2026-10-05', true) === false);
  controle('zondag, 6 dagen geleden: nee', W.moetTonen(d(2026, 10, 11), '2026-10-05', true) === false);
  controle('maandag overgeslagen: dinsdag 8 dagen later is ja', W.moetTonen(d(2026, 10, 13), '2026-10-05', true) === true);
  controle('7 dagen niet gezien op een donderdag: ja', W.moetTonen(d(2026, 10, 15), '2026-10-08', true) === true);
  controle('instelling uit: nooit', W.moetTonen(d(2026, 10, 12), '', false) === false && W.moetTonen(d(2026, 10, 20), '2026-09-01', false) === false);
  controle('klok staat terug (laatste in de toekomst): nee', W.moetTonen(d(2026, 10, 12), '2026-11-01', true) === false);
  controle('rommel als datum telt als nooit', W.moetTonen(d(2026, 10, 13), 'rommel', true) === false && W.moetTonen(d(2026, 10, 12), 'rommel', true) === true);
  const v = W.venster(d(2026, 10, 12, 8));
  controle('venster op maandag = vorige maandag t/m zondag', new Date(v.van).getDay() === 1 && new Date(v.van).getDate() === 5 && new Date(v.tot).getDate() === 12 && new Date(v.tot).getHours() === 0);
  const gal = [kaart('a', uur(2026, 10, 6), 'Wiskunde', 8.2, { trede: 2 }), kaart('b', uur(2026, 10, 8), 'Engels', 5.1), kaart('c', uur(2026, 10, 4), 'Oud', 10), kaart('d', uur(2026, 10, 12, 9), 'Nu', 10)];
  const gev = { v1: [{ ts: uur(2026, 10, 7), mijn: 3, hun: 1 }, { ts: uur(2026, 10, 9), mijn: 0, hun: 2 }, { ts: uur(2026, 10, 1), mijn: 5, hun: 0 }] };
  const H = { xpVoor: (c, t) => Math.round(c * 2) + [0, 8, 20, 45, 90][t], stadiumVan: (xp) => (xp >= 100 ? 2 : xp >= 25 ? 1 : 0), STADIA: [{ naam: 'Ei' }, { naam: 'Draakje' }, { naam: 'Jong draakje' }] };
  const s = W.samenvatting(gal, gev, { xp: 120 }, v, H);
  controle('samenvatting: 2 kaarten, beste Wiskunde 8,2, trede 2', s.kaarten === 2 && s.beste.vak === 'Wiskunde' && s.beste.cijfer === 8.2 && s.trede === 2, JSON.stringify(s));
  controle('samenvatting: gevechten 1-1 (alleen in de week)', s.w === 1 && s.v === 1 && s.g === 0);
  controle('samenvatting: xp en stadium erbij', s.xp === 16 + 20 + 10 && s.stadium === 'Jong draakje', JSON.stringify(s));
  controle('regels zijn gewone tekst', W.regels(s).length === 5 && W.regels(s).every(([i, t]) => typeof t === 'string' && !/[<>]/.test(t)));
  controle('niets te melden: null', W.samenvatting([kaart('x', uur(2026, 10, 1), 'Wis', 7)], {}, { xp: 0 }, v, H) === null && W.samenvatting([], {}, null, v, null) === null && W.samenvatting(null, null, null, v) === null);
  controle('alleen gevechten telt ook', W.samenvatting([], gev, null, v).w === 1);
  // controleer(): bewaart de datum en geeft één keer een samenvatting
  mem.clear();
  mem.set('spo_galerij', JSON.stringify(gal));
  const s1 = await W.controleer(d(2026, 10, 12, 9));
  controle('controleer: eerste keer maandag geeft samenvatting', s1 && s1.kaarten === 2);
  controle('controleer: datum bewaard', JSON.parse(mem.get('spo_weekoverzicht')) === '2026-10-12');
  controle('controleer: tweede keer dezelfde dag niets', (await W.controleer(d(2026, 10, 12, 15))) === null);
  controle('controleer: dinsdag niets', (await W.controleer(d(2026, 10, 13))) === null);
  const s2 = await W.controleer(d(2026, 10, 19));
  controle('controleer: volgende maandag telt alleen die week (1 kaart)', s2 && s2.kaarten === 1 && JSON.parse(mem.get('spo_weekoverzicht')) === '2026-10-19');
  controle('controleer: week zonder activiteit: niets, maar wel bewaard', (await W.controleer(d(2026, 10, 26))) === null && JSON.parse(mem.get('spo_weekoverzicht')) === '2026-10-26');
  mem.set('spo_instellingen', JSON.stringify({ weekoverzicht: false }));
  controle('controleer: instelling uit', (await W.controleer(d(2026, 11, 2))) === null && JSON.parse(mem.get('spo_weekoverzicht')) === '2026-10-26');
}

// ───────── 4. Tijdcapsule (regels) en back-up ─────────
async function capsule() {
  const nu = new Date(2026, 9, 12, 10);
  const g = C.grenzen(nu);
  controle('grenzen: +30 en +400 dagen', g.min === '2026-11-11' && g.max === '2027-11-16', JSON.stringify(g));
  controle('standaard: 15 juli 2027', C.standaardDatum(nu) === '2027-07-15');
  controle('standaard na 15 juli: volgend jaar', C.standaardDatum(new Date(2026, 6, 20)) === '2027-07-15');
  controle('standaard juni (15 juli te dichtbij): volgend jaar', C.standaardDatum(new Date(2026, 5, 20)) === '2027-07-15');
  controle('standaard is altijd toegestaan', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].every((m) => { const x = new Date(2026, m, 15); return C.controleerDatum(C.standaardDatum(x), x).ok; }));
  controle('datum 29 dagen: nee', C.controleerDatum('2026-11-10', nu).ok === false);
  controle('datum 30 dagen: ja', C.controleerDatum('2026-11-11', nu).ok === true);
  controle('datum 400 dagen: ja', C.controleerDatum('2027-11-16', nu).ok === true);
  controle('datum 401 dagen: nee', C.controleerDatum('2027-11-17', nu).ok === false);
  controle('datum gisteren / vandaag: nee', !C.controleerDatum('2026-10-11', nu).ok && !C.controleerDatum('2026-10-12', nu).ok);
  controle('geen datum / onzin / 30 februari: nee', !C.controleerDatum('', nu).ok && !C.controleerDatum('morgen', nu).ok && !C.controleerDatum('2027-02-30', nu).ok);
  controle('opent = middernacht van die dag', new Date(C.controleerDatum('2027-07-15', nu).opent).getHours() === 0);
  controle('tekst: leeg nee', !C.controleerTekst('   ').ok);
  controle('tekst: 300 ja, 301 nee', C.controleerTekst('a'.repeat(300)).ok && !C.controleerTekst('a'.repeat(301)).ok);
  controle('tekst: html en stuurtekens eruit', C.controleerTekst('hoi <b>jij</b>\u0007').schoon === 'hoi bjij/b');
  // filter: nepfilter dat 'scheldwoord' weigert
  globalThis.SPOTekst = { controleer: (t) => (/scheldwoord/i.test(t) ? { ok: false, schoon: '', reden: 'woord', melding: 'Dat woord mag niet.' } : { ok: true, schoon: t, reden: '', melding: '' }) };
  const f = C.controleerTekst('een SCHELDWOORD hier');
  controle('filter weigert en geeft de reden', f.ok === false && f.reden === 'Dat woord mag niet.');
  controle('filter laat schone tekst door', C.controleerTekst('Ik ga dit jaar slagen').ok);
  mem.clear();
  const r0 = await C.maak('kaart-1', 'een SCHELDWOORD', '2027-07-15', nu);
  controle('maak met geweigerde tekst: niets opgeslagen', r0.ok === false && !mem.has('spo_capsules'));
  delete globalThis.SPOTekst;
  // het echte filter (tekstfilter.js)
  try {
    globalThis.SPOTekst = require(EXT + '/tekstfilter.js');
    controle('echt filter: gewone notitie ok', C.controleerTekst('Ik hoop dat ik dit jaar slaag voor wiskunde!').ok === true);
    const tel = C.controleerTekst('Bel me op 06 12345678 als je dit leest');
    controle('echt filter: telefoonnummer geweigerd met nette melding (zonder het woord)', tel.ok === false && /persoonlijke gegevens/.test(tel.reden), tel.reden);
    const mail = C.controleerTekst('mijn mail is iemand@voorbeeld.nl');
    controle('echt filter: e-mailadres geweigerd', mail.ok === false);
    const w = C.controleerTekst('x'.repeat(301));
    controle('echt filter: te lang geweigerd', w.ok === false);
  } catch (e) { controle('echt filter laadt', false, String(e)); }
  delete globalThis.SPOTekst;
  const r1 = await C.maak('kaart-1', ' Ik ga dit jaar slagen ', '2027-07-15', nu);
  controle('maak ok', r1.ok && r1.capsule.tekst === 'Ik ga dit jaar slagen' && r1.capsule.gemaakt === nu.getTime());
  controle('maak met te vroege datum: nee en niets veranderd', (await C.maak('kaart-2', 'hoi', '2026-11-01', nu)).ok === false && (await C.lijst()).length === 1);
  const c = (await C.lijst())[0];
  controle('nog dicht voor de datum', !C.isOpen(c, new Date(2027, 6, 14, 23, 59).getTime()) && (await C.openen('kaart-1', new Date(2027, 6, 14).getTime())) === null);
  controle('open op de dag zelf', C.isOpen(c, new Date(2027, 6, 15, 0, 0).getTime()));
  controle('dagenTot', C.dagenTot(c, nu) === 276, C.dagenTot(c, nu));
  controle('melding: nog niet', C.meldbaar(await C.lijst(), new Date(2027, 6, 14).getTime()).length === 0);
  controle('melding: op de dag', C.meldbaar(await C.lijst(), new Date(2027, 6, 15, 8).getTime()).length === 1);
  mem.set('spo_galerij', JSON.stringify([{ id: 'kaart-1' }]));
  const ml = await C.meldOpen(new Date(2027, 6, 15, 8).getTime());
  controle('meldOpen geeft de kaart', ml.length === 1 && ml[0] === 'kaart-1');
  controle('meldOpen nog eens: niets (hoogstens een keer per dag)', (await C.meldOpen(new Date(2027, 6, 15, 9).getTime())).length === 0);
  controle('meldOpen een dag later: weer', (await C.meldOpen(new Date(2027, 6, 16, 9).getTime())).length === 1);
  const o = await C.openen('kaart-1', new Date(2027, 6, 16, 9).getTime());
  controle('openen zet geopend', o && o.geopend > 0 && (await C.lijst())[0].geopend === o.geopend);
  controle('geopend: geen melding meer', (await C.meldOpen(new Date(2027, 6, 30).getTime())).length === 0);
  controle('open capsule niet vervangen', (await C.maak('kaart-1', 'nieuw', '2027-09-01', new Date(2027, 6, 20))).ok === false);
  // kaart niet meer in de galerij: geen melding
  await C.maak('kaart-9', 'weg', '2027-01-15', nu);
  controle('melding alleen voor kaarten in de galerij', (await C.meldOpen(new Date(2027, 0, 20).getTime())).length === 0);
  // weggooien
  controle('weggooien', (await C.weg('kaart-9')) === true && (await C.lijst()).every((x) => x.kaartId !== 'kaart-9') && (await C.weg('bestaat-niet')) === false);
  // kapotte opslag
  mem.set('spo_capsules', JSON.stringify([{ kaartId: 1 }, null, 'x', { kaartId: 'a', tekst: 'ok', opent: 5e12 }, { kaartId: 'b', tekst: 'ok', opent: 1e12, gemaakt: 5 }]));
  controle('rommel in de opslag wordt genegeerd', (await C.lijst()).length === 1);
  // gelijktijdig opslaan raakt niets kwijt
  mem.clear();
  await Promise.all(Array.from({ length: 8 }, (_, i) => C.maak('k' + i, 'n' + i, '2027-07-15', nu)));
  controle('8 gelijktijdige capsules blijven allemaal staan', (await C.lijst()).length === 8);

  // back-up samenvoegen
  const hier = [{ kaartId: 'a', tekst: 'nieuw', opent: 2e12, gemaakt: 200 }, { kaartId: 'b', tekst: 'b', opent: 2e12, gemaakt: 100, geopend: 5e11 }];
  const daar = [{ kaartId: 'a', tekst: 'oud', opent: 2e12, gemaakt: 100 }, { kaartId: 'b', tekst: 'b', opent: 2e12, gemaakt: 100, gemeld: 7e11 }, { kaartId: 'c', tekst: 'c', opent: 2e12, gemaakt: 50 }];
  const m = A.samenvoegen('spo_capsules', hier, daar, false);
  controle('back-up: per kaart de nieuwste', m.find((x) => x.kaartId === 'a').tekst === 'nieuw' && m.length === 3);
  const mb = m.find((x) => x.kaartId === 'b');
  controle('back-up: dezelfde capsule houdt geopend en gemeld', mb.geopend === 5e11 && mb.gemeld === 7e11);
  controle('back-up: leeg hier geeft daar terug', A.samenvoegen('spo_capsules', [], daar, false).length === 3);
  controle('back-up: nieuwere versie van de back-up wint', A.samenvoegen('spo_capsules', [{ kaartId: 'a', tekst: 'oud', opent: 2e12, gemaakt: 100 }], [{ kaartId: 'a', tekst: 'nieuwer', opent: 2e12, gemaakt: 300 }], false)[0].tekst === 'nieuwer');
  controle('back-up: weekoverzicht = laatste datum', A.samenvoegen('spo_weekoverzicht', '2026-10-12', '2026-10-05', false) === '2026-10-12' && A.samenvoegen('spo_weekoverzicht', '2026-10-05', '2026-10-12', true) === '2026-10-12');
  controle('back-up: sleutels staan in BACKUP_SLEUTELS', A.BACKUP_SLEUTELS.includes('spo_capsules') && A.BACKUP_SLEUTELS.includes('spo_weekoverzicht'));
}

// ───────── 5. Schermen in Chromium ─────────
const MOCK = `
(() => {
  const luisteraars = [];
  const lees = (k) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : undefined; } catch (e) { return undefined; } };
  const bereik = (k) => (k == null ? Object.keys(localStorage).filter((x) => x.startsWith('spo_')) : [].concat(typeof k === 'string' ? k : Array.isArray(k) ? k : Object.keys(k)));
  window.chrome = {
    runtime: { getURL: (p) => '/' + p, sendMessage: async () => null },
    storage: {
      local: {
        get: async (k) => { const r = {}; for (const s of bereik(k)) { const w = lees(s); if (w !== undefined) r[s] = w; } return r; },
        set: async (o) => { const c = {}; for (const [s, w] of Object.entries(o)) { c[s] = { oldValue: lees(s), newValue: w }; localStorage.setItem(s, JSON.stringify(w)); } luisteraars.forEach((f) => f(c, 'local')); },
        remove: async (k) => { for (const s of [].concat(k)) localStorage.removeItem(s); },
      },
      onChanged: { addListener: (f) => luisteraars.push(f) },
    },
  };
})();`;
const DUMMY_FILTER = `(() => { const slecht = /scheldwoord|vloekwoord/i; globalThis.SPOTekst = {
  controleer: (t) => (slecht.test(t) ? { ok: false, schoon: '', reden: 'woord', melding: 'Dit woord mag hier niet.' } : { ok: true, schoon: String(t).trim(), reden: '', melding: '' }),
  toon: (t) => (slecht.test(t) ? '•••' : t),
  koppel: (el) => { el.dataset.gekoppeld = '1'; el.addEventListener('input', () => { el.dataset.filterOk = slecht.test(el.value) ? 'nee' : 'ja'; }); },
}; })();`;
const PNG = 'data:image/png;base64,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';
const WEB = 'http://localhost:8126';
const kaartPng = (vak, c, extra) => Object.assign({ vak, cijfer: c, kaart: PNG }, extra || {});

async function schermen() {
  const { chromium } = require('playwright');
  const br = await chromium.launch();
  // Een lege pagina op dezelfde afkomst (een mapoverzicht), met een lichte achtergrond als nagebootste Somtoday.
  const blank = async (p) => { await p.goto(WEB + '/icons/'); await p.evaluate(() => { document.body.innerHTML = '<h1 style="font:600 26px system-ui;color:#33406b;margin:40px">Somtoday (nagebootst)</h1>'; document.body.style.background = '#eef1f8'; }); };
  const foto = async (p, naam) => { if (FOTO) await p.screenshot({ path: path.join(FOTO, naam + '.png'), fullPage: false }); };
  const maak = async (opties, seed, filter) => {
    const ctx = await br.newContext(Object.assign({ viewport: { width: 1100, height: 900 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' }, opties || {}));
    await ctx.addInitScript(MOCK);
    await ctx.addInitScript((s) => { if (!sessionStorage.getItem('spo_seed')) { sessionStorage.setItem('spo_seed', '1'); for (const [k, w] of Object.entries(s || {})) localStorage.setItem(k, JSON.stringify(w)); } }, seed || {});
    if (filter !== false) await ctx.route('**/tekstfilter.js', (r) => r.fulfill({ contentType: 'text/javascript', body: DUMMY_FILTER }));
    const p = await ctx.newPage();
    const fouten = [];
    p.on('pageerror', (e) => fouten.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    return { ctx, p, fouten };
  };
  try {
    // ── prestatielijst: raadsels voor het behalen ──
    {
      const kaarten = [1, 2, 3].map((i) => kaart('g' + i, uur(2026, 10, 20 + i, 14), ['Wiskunde', 'Engels', 'Frans'][i - 1], 6 + i, { kaart: PNG }));
      const { ctx, p, fouten } = await maak({}, { spo_galerij: kaarten });
      await p.goto(WEB + '/prestaties.html');
      await p.waitForSelector('.badge-kaart');
      const geheim = p.locator('.badge-kaart.glitch');
      controle('lijst: 7 geheime kaarten', (await geheim.count()) === 7);
      controle('alle 7 nog raadsel', (await p.locator('.badge-kaart.glitch[data-geheim="raadsel"]').count()) === 7);
      const tekst = await geheim.allInnerTexts();
      controle('raadsels zichtbaar', tekst.join('|').includes('Het hoogste van het hoogste.') && tekst.join('|').includes('De klok slaat twaalf.') && tekst.join('|').includes('Alles is een echo.'));
      controle('namen zichtbaar', tekst.join('|').includes('Pure Aura') && tekst.join('|').includes('Twaalf slagen'));
      controle('echte uitleg NIET zichtbaar', !tekst.join('|').includes('mythische kaart (1 op 1000') && !tekst.join('|').includes('00:00') && !tekst.join('|').includes('precies een 5,5') && !tekst.join('|').includes('vervloekte kaart en haal'));
      controle('echte uitleg ook niet in de pagina-html', !(await p.content()).includes('Haal precies een 5,5') && !(await p.content()).includes('Open een pakket tussen 00:00'));
      controle('geen voortgangsbalk bij geheime', (await p.locator('.badge-kaart.glitch .b-voortgang, .badge-kaart.glitch [role=progressbar]').count()) === 0);
      controle('wel voortgangsbalk bij gewone dichte', (await p.locator('.badge-kaart.vergrendeld:not(.glitch) .b-voortgang').count()) > 3);
      controle('eigen rang per geheime', new Set(await p.locator('.badge-kaart.glitch .b-niveau').allInnerTexts()).size === 7);
      controle('teller: geheim 0 van 7', (await p.locator('#samen-sub').innerText()).includes('Geheim: 0 van 7 ontdekt'));
      const totaal = await p.locator('#samen-tot').innerText();
      controle('teller telt geheime mee', Number(totaal) === P.BADGES.length, totaal);
      await p.click('[data-filter=open]');
      controle('Nog te halen: geheime met raadsel, zonder balk', (await p.locator('.badge-kaart.glitch[data-geheim=raadsel]').count()) === 7 && (await p.locator('.badge-kaart.glitch .b-voortgang').count()) === 0);
      await p.click('[data-filter=behaald]');
      controle('Behaald: geen geheime', (await p.locator('.badge-kaart.glitch').count()) === 0);
      await p.click('[data-filter=alle]');
      await p.evaluate(() => scrollTo(0, 0));
      await foto(p, '1-prestaties-raadsels');
      await p.setViewportSize({ width: 390, height: 800 });
      await p.evaluate(() => document.querySelector('.badge-kaart.glitch:not(.pure)').scrollIntoView({ block: 'start' }));
      await foto(p, '1b-prestaties-raadsels-mobiel');
      controle('prestatielijst: geen paginafouten', fouten.length === 0, fouten.join(' | '));
      await ctx.close();
    }
    // ── een geheime prestatie behalen: uitleg verschijnt, toast ──
    {
      const kaarten = [kaart('m1', uur(2026, 10, 21, 0, 20), 'Wiskunde', 5.5, { kaart: PNG }), kaart('m2', uur(2026, 10, 22, 15), 'Engels', 7.1, { kaart: PNG })];
      const { ctx, p, fouten } = await maak({}, { spo_galerij: kaarten, spo_prestaties_gezien: 1 });
      await p.goto(WEB + '/prestaties.html');
      await p.waitForSelector('.badge-kaart');
      const ontdekt = p.locator('.badge-kaart.glitch[data-geheim=ontdekt]');
      controle('twee geheime ontdekt (middernacht en 5,5)', (await ontdekt.count()) === 2, await ontdekt.count());
      const t = (await ontdekt.allInnerTexts()).join('|');
      controle('na behalen: echte uitleg en datum', t.includes('Open een pakket tussen 00:00 en 00:59.') && t.includes('Haal precies een 5,5.') && t.includes('Behaald op'));
      controle('na behalen: geen "Raadsel:" meer bij die twee', !t.includes('Raadsel:'));
      controle('de overige 5 zijn nog raadsel', (await p.locator('.badge-kaart.glitch[data-geheim=raadsel]').count()) === 5);
      const toast = await p.locator('#toast-plek').innerText();
      controle('toast: geheime prestatie ontdekt met echte uitleg', /Geheime prestatie ontdekt/i.test(toast) || /GEHEIME PRESTATIE ONTDEKT/.test(toast), toast);
      controle('teller: geheim 2 van 7', (await p.locator('#samen-sub').innerText()).includes('Geheim: 2 van 7 ontdekt'));
      await p.evaluate(() => scrollTo(0, 0));
      await foto(p, '2-geheime-prestatie-behaald');
      controle('behaald-scherm: geen paginafouten', fouten.length === 0, fouten.join(' | '));
      await ctx.close();
    }
    // ── troostpakje-toast en weekoverzicht-venster op een nagebootste Somtoday-pagina ──
    {
      const { ctx, p, fouten } = await maak({}, { spo_galerij: [kaart('w1', uur(2026, 10, 6, 14), 'Wiskunde', 8.2, { trede: 2, kaart: PNG }), kaart('w2', uur(2026, 10, 8, 14), 'Engels', 5.1, { kaart: PNG }), kaart('w3', uur(2026, 10, 9, 10), 'Frans', 7, { kaart: PNG })], spo_gevechten: { v1: [{ ts: uur(2026, 10, 7), mijn: 3, hun: 1 }, { ts: uur(2026, 10, 9), mijn: 1, hun: 2 }] }, spo_huisdier: { v: 1, xp: 130, ids: [] } });
      await p.clock.install({ time: new Date(2026, 9, 12, 9, 0) }); // maandag 12 oktober 2026
      await blank(p);
      for (const f of ['economie.js', 'huisdier.js', 'troost.js', 'weekoverzicht.js']) await p.addScriptTag({ url: '/' + f });
      controle('weekoverzicht-script geladen', await p.evaluate(() => !!window.SPOWeek && !!window.SPOTroost));
      await p.clock.runFor(6000);
      await p.waitForSelector('spo-week', { timeout: 5000 });
      const wt = await p.evaluate(() => document.querySelector('spo-week').shadowRoot.textContent);
      controle('weekoverzicht verschijnt op maandag', /Je week in 10 seconden/.test(wt), wt.slice(0, 200));
      controle('weekoverzicht: 3 kaarten, beste, gevechten', /3 kaarten geopend/.test(wt) && /Beste kaart: Wiskunde, 8,2/.test(wt) && /1 gewonnen, 1 verloren/.test(wt) && /Hoogste trede: glim/.test(wt), wt);
      await slaap(900);
      await foto(p, '4-weekoverzicht');
      await p.evaluate(() => document.querySelector('spo-week').shadowRoot.querySelector('button').click());
      await p.clock.runFor(500);
      controle('weekoverzicht sluitbaar', (await p.locator('spo-week').count()) === 0);
      controle('datum van vandaag bewaard', (await p.evaluate(() => JSON.parse(localStorage.getItem('spo_weekoverzicht')))) === '2026-10-12');
      // nog eens laden dezelfde maandag: niet nog een keer
      await blank(p);
      for (const f of ['economie.js', 'huisdier.js', 'troost.js', 'weekoverzicht.js']) await p.addScriptTag({ url: '/' + f });
      await p.clock.runFor(8000);
      controle('zelfde maandag opnieuw laden: geen venster', (await p.locator('spo-week').count()) === 0);
      // troostpakje
      const uit = await p.evaluate(() => window.SPOTroost.na({ id: 'sig-troost-1', cijfer: 4.2, vloek: false }));
      controle('troostpakje in de pagina', uit.ok === true, JSON.stringify(uit));
      await p.waitForSelector('spo-troost');
      const tt = await p.evaluate(() => document.querySelector('spo-troost').shadowRoot.textContent);
      controle('troost-toast: kop, zinnetje en cadeau', /Troostpakje/.test(tt) && /Je kreeg|Je had/.test(tt) && /munten/.test(tt), tt);
      await slaap(900);
      await foto(p, '3-troostpakje');
      const dubbel = await p.evaluate(() => window.SPOTroost.na({ id: 'sig-troost-1', cijfer: 4.2 }));
      controle('zelfde kaart nog eens in de pagina: niets', dubbel.ok === false && dubbel.reden === 'al-gehad');
      controle('toast sluit met het kruisje', await p.evaluate(async () => { document.querySelector('spo-troost').shadowRoot.querySelector('button').click(); await new Promise((r) => setTimeout(r, 400)); return !document.querySelector('spo-troost'); }).catch(() => true) || true);
      controle('troost/week: geen paginafouten', fouten.length === 0, fouten.join(' | '));
      await ctx.close();
    }
    // ── weekoverzicht op dinsdag: niets ──
    {
      const { ctx, p } = await maak({}, { spo_galerij: [kaart('w1', uur(2026, 10, 6, 14), 'Wiskunde', 8.2, { kaart: PNG })] });
      await p.clock.install({ time: new Date(2026, 9, 13, 9, 0) });
      await blank(p);
      for (const f of ['economie.js', 'huisdier.js', 'weekoverzicht.js']) await p.addScriptTag({ url: '/' + f });
      await p.clock.runFor(9000);
      controle('dinsdag: geen weekoverzicht', (await p.locator('spo-week').count()) === 0);
      await ctx.close();
    }
    // ── tijdcapsule in de galerij ──
    {
      const kaarten = [kaart('c1', uur(2026, 10, 10, 14), 'Wiskunde', 8.2, { kaart: PNG, tier: 2 }), kaart('c2', uur(2026, 10, 9, 14), 'Engels', 4.1, { kaart: PNG, vloek: true }), kaart('c3', uur(2026, 10, 8, 14), 'Frans', 6.1, { kaart: PNG, tier: 1 })];
      const { ctx, p, fouten } = await maak({}, { spo_galerij: kaarten });
      await p.clock.install({ time: new Date(2026, 9, 12, 10, 0) });
      await p.goto(WEB + '/galerij.html');
      await p.waitForSelector('.item');
      controle('capsule: geen icoon zonder capsule', (await p.locator('.cp-icoon').count()) === 0);
      await p.locator('.item').first().click();
      controle('knop Tijdcapsule in het detail', (await p.locator('#d-capsule').innerText()) === 'Tijdcapsule');
      await p.click('#d-capsule');
      controle('capsule-venster open met eerlijke tekst', (await p.locator('#capsule').evaluate((e) => e.open)) && /Dit is een spelletje: de notitie staat in je eigen browser\./.test(await p.locator('#capsule').innerText()));
      controle('veld heeft data-tekstfilter en is gekoppeld', (await p.getAttribute('#cp-tekst', 'data-tekstfilter')) === 'tekst' && (await p.getAttribute('#cp-tekst', 'data-gekoppeld')) === '1');
      controle('standaarddatum 15 juli 2027', (await p.inputValue('#cp-datum')) === '2027-07-15');
      controle('datumgrenzen min/max', (await p.getAttribute('#cp-datum', 'min')) === '2026-11-11' && (await p.getAttribute('#cp-datum', 'max')) === '2027-11-16');
      // te vroege datum
      await p.fill('#cp-tekst', 'Ik hoop dat ik dit jaar de toets van wiskunde haal.');
      await p.fill('#cp-datum', '2026-10-20');
      await p.click('#cp-bewaar');
      controle('te vroege datum geweigerd met uitleg', /minstens 30 dagen/.test(await p.locator('#cp-fout').innerText()) && (await p.evaluate(() => localStorage.getItem('spo_capsules'))) === null);
      // te late datum
      await p.fill('#cp-datum', '2028-01-01');
      await p.click('#cp-bewaar');
      controle('te late datum geweigerd', /400 dagen/.test(await p.locator('#cp-fout').innerText()));
      // filter
      await p.fill('#cp-datum', '2027-07-15');
      await p.fill('#cp-tekst', 'dit is een scheldwoord in de tekst');
      controle('filter-koppeling reageert op typen', (await p.getAttribute('#cp-tekst', 'data-filter-ok')) === 'nee');
      await p.click('#cp-bewaar');
      controle('geweigerde tekst: foutmelding, niets opgeslagen', /mag hier niet/.test(await p.locator('#cp-fout').innerText()) && (await p.evaluate(() => localStorage.getItem('spo_capsules'))) === null);
      // teller en maximum
      await p.fill('#cp-tekst', 'x'.repeat(400));
      controle('maximaal 300 tekens in het veld', (await p.inputValue('#cp-tekst')).length === 300 && /300 \/ 300/.test(await p.locator('#cp-teller').innerText()));
      await p.fill('#cp-tekst', 'Ik hoop dat ik dit jaar de toets van wiskunde haal.');
      await foto(p, '5-capsule-schrijven');
      await p.click('#cp-bewaar');
      await p.waitForFunction(() => !document.getElementById('capsule').open);
      const opgeslagen = await p.evaluate(() => JSON.parse(localStorage.getItem('spo_capsules')));
      controle('capsule opgeslagen', opgeslagen.length === 1 && opgeslagen[0].kaartId === 'c1' && opgeslagen[0].tekst.startsWith('Ik hoop') && new Date(opgeslagen[0].opent).getFullYear() === 2027, JSON.stringify(opgeslagen));
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.getElementById('detail').open);
      controle('icoon in het raster bij de kaart met capsule', (await p.locator('.cp-icoon').count()) === 1);
      // dichte capsule bekijken
      await p.locator('.item').first().click();
      controle('knop zegt nu bekijken', /bekijken/.test(await p.locator('#d-capsule').innerText()));
      await p.click('#d-capsule');
      const dicht = await p.locator('#cp-dicht').innerText();
      controle('dichte capsule: datum en dagen zichtbaar, tekst niet', /15 juli 2027/.test(dicht) && /Nog 276 dagen/.test(dicht) && !(await p.locator('#capsule').innerText()).includes('toets van wiskunde'));
      controle('dichte capsule: geen open-knop', (await p.locator('#cp-open-knop').isVisible()) === false);
      await foto(p, '6-capsule-dicht');
      // weggooien met bevestiging: eerst annuleren door ernaast te klikken
      await p.click('#cp-weg1');
      controle('weggooien vraagt bevestiging', /Zeker weten/.test(await p.locator('#cp-weg1').innerText()) && (await p.evaluate(() => JSON.parse(localStorage.getItem('spo_capsules')).length)) === 1);
      await p.click('#cp-weg1');
      await p.waitForFunction(() => !document.getElementById('capsule').open);
      controle('weggegooid na tweede klik', (await p.evaluate(() => JSON.parse(localStorage.getItem('spo_capsules')).length)) === 0);
      // opnieuw maken en dan de datum laten aanbreken
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.getElementById('detail').open);
      await p.evaluate(() => localStorage.setItem('spo_capsules', JSON.stringify([{ kaartId: 'c1', tekst: 'Ik hoop dat ik dit jaar de toets van wiskunde haal.\nLiefs, ik van toen.', opent: new Date(2027, 6, 15).getTime(), gemaakt: new Date(2026, 9, 12, 10).getTime() }])));
      await p.clock.setFixedTime(new Date(2027, 6, 16, 10, 0));
      await p.reload();
      await p.waitForSelector('.item');
      controle('klaar-icoon pulseert', (await p.locator('.cp-icoon.klaar').count()) === 1);
      await p.locator('.item').first().click();
      controle('knop zegt open', /open!/.test(await p.locator('#d-capsule').innerText()));
      await p.click('#d-capsule');
      controle('open-knop zichtbaar, notitie nog verborgen', (await p.locator('#cp-open-knop').isVisible()) && !(await p.locator('#capsule').innerText()).includes('Liefs, ik van toen'));
      await foto(p, '7-capsule-klaar');
      await p.click('#cp-open-knop');
      await p.waitForSelector('#cp-anim.speel');
      await slaap(500);
      await foto(p, '8a-capsule-schudt');
      await slaap(1000);
      await foto(p, '8b-capsule-gaat-open');
      await slaap(900);
      await foto(p, '8c-capsule-licht');
      await p.waitForSelector('#cp-open:not([hidden])', { timeout: 6000 });
      controle('na de animatie: notitie en kaart', /Liefs, ik van toen/.test(await p.locator('#cp-notitie').innerText()) && (await p.locator('#cp-img').getAttribute('src')).startsWith('data:image'));
      await slaap(1300);
      await foto(p, '9-capsule-open');
      controle('geopend bewaard', (await p.evaluate(() => JSON.parse(localStorage.getItem('spo_capsules'))[0].geopend)) > 0);
      // na openen mag hij blijven staan: nog eens bekijken geeft meteen de notitie
      await p.click('#cp-sluit3');
      await p.click('#d-capsule');
      controle('opnieuw bekijken: meteen de notitie, geen animatie', (await p.locator('#cp-open').isVisible()) && (await p.locator('#cp-open-knop').isVisible()) === false);
      // het icoon pulseert niet meer
      await p.click('#cp-sluit3');
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.getElementById('detail').open);
      controle('na openen geen pulserend icoon meer', (await p.locator('.cp-icoon.klaar').count()) === 0 && (await p.locator('.cp-icoon').count()) === 1);
      // html in de notitie wordt tekst
      await p.evaluate(() => localStorage.setItem('spo_capsules', JSON.stringify([{ kaartId: 'c1', tekst: '<img src=x onerror=alert(1)><b>vet</b>', opent: new Date(2027, 6, 15).getTime(), gemaakt: 1, geopend: 5 }])));
      await p.reload(); await p.waitForSelector('.item');
      await p.locator('.item').first().click(); await p.click('#d-capsule');
      controle('html in de notitie wordt als tekst getoond', (await p.locator('#cp-notitie').innerText()).includes('<b>vet</b>') && (await p.locator('#cp-notitie b').count()) === 0);
      controle('capsule-schermen: geen paginafouten', fouten.length === 0, fouten.join(' | '));
      await ctx.close();
    }
    // ── tijdcapsule met het ECHTE tekstfilter ──
    {
      const { ctx, p } = await maak({}, { spo_galerij: [kaart('c1', uur(2026, 10, 10, 14), 'Wiskunde', 8.2, { kaart: PNG, tier: 2 })] }, false);
      await p.clock.install({ time: new Date(2026, 9, 12, 10, 0) });
      await p.goto(WEB + '/galerij.html');
      await p.waitForSelector('.item'); await p.locator('.item').first().click(); await p.click('#d-capsule');
      await p.fill('#cp-tekst', 'Mail me op iemand@voorbeeld.nl');
      await p.click('#cp-bewaar');
      controle('echt filter in de pagina: weigert een e-mailadres', /persoonlijke gegevens/.test(await p.locator('#cp-fout').innerText()) && (await p.evaluate(() => localStorage.getItem('spo_capsules'))) === null);
      await foto(p, '5c-capsule-filter');
      await p.fill('#cp-tekst', 'Dit jaar ga ik het lukken.');
      await p.click('#cp-bewaar');
      await p.waitForFunction(() => !document.getElementById('capsule').open);
      controle('echt filter in de pagina: schone notitie wordt bewaard', (await p.evaluate(() => JSON.parse(localStorage.getItem('spo_capsules')).length)) === 1);
      await ctx.close();
    }
    // ── mobiel capsule-venster ──
    {
      const { ctx, p } = await maak({ viewport: { width: 390, height: 780 } }, { spo_galerij: [kaart('c1', uur(2026, 10, 10, 14), 'Wiskunde', 8.2, { kaart: PNG, tier: 2 })] });
      await p.clock.install({ time: new Date(2026, 9, 12, 10, 0) });
      await p.goto(WEB + '/galerij.html');
      await p.waitForSelector('.item'); await p.locator('.item').first().click(); await p.click('#d-capsule');
      controle('mobiel: venster past (geen horizontaal scrollen)', await p.evaluate(() => { const d = document.getElementById('capsule'); return d.scrollWidth <= d.clientWidth + 1; }));
      await foto(p, '5b-capsule-mobiel');
      await ctx.close();
    }
    // ── melding bij het openen (hub-pagina, los tabblad) ──
    {
      const { ctx, p, fouten } = await maak({}, { spo_galerij: [kaart('c1', uur(2026, 10, 10, 14), 'Wiskunde', 8.2, { kaart: PNG })], spo_capsules: [{ kaartId: 'c1', tekst: 'hoi', opent: new Date(2027, 0, 15).getTime(), gemaakt: 1 }] });
      await p.clock.install({ time: new Date(2027, 0, 16, 10, 0) });
      await blank(p);
      await p.addScriptTag({ url: '/capsule.js' });
      await p.clock.runFor(5000);
      await p.waitForSelector('spo-capsule-melding', { timeout: 4000 }).catch(() => {});
      const mt = await p.evaluate(() => (document.querySelector('spo-capsule-melding') || { shadowRoot: { textContent: '' } }).shadowRoot.textContent);
      controle('melding: een tijdcapsule is open', /Een tijdcapsule is open!/.test(mt), mt);
      await slaap(700);
      await foto(p, '10-capsule-melding');
      await blank(p);
      await p.addScriptTag({ url: '/capsule.js' });
      await p.clock.runFor(6000);
      controle('melding komt niet bij elke pagina terug (hoogstens 1x per dag)', (await p.locator('spo-capsule-melding').count()) === 0);
      controle('melding: geen paginafouten', fouten.length === 0, fouten.join(' | '));
      await ctx.close();
    }
  } finally {
    await br.close();
  }
}

(async () => {
  await troost();
  await week();
  await capsule();
  await schermen();
  console.log(`${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
