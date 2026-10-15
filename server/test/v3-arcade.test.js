// v3.0: vloek opheffen, wekelijkse drop (client) en de Arcade-hoek: regels, economie en kansen. Alles in Node, zonder browser of server.
// Gebruik: node server/test/v3-arcade.test.js
process.env.TZ = 'Europe/Amsterdam';
const fs = require('node:fs');
const path = require('node:path');

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const EXT = path.resolve(__dirname, '../../extension');
const P = require(EXT + '/prestatieslib.js');
require(EXT + '/gevecht.js');
const G = globalThis.SPOGevecht;
const D = require(EXT + '/duellib.js');
require(EXT + '/economie.js');
const E = globalThis.SPOEco;
const H = require(EXT + '/heel.js');
const AR = require(EXT + '/arcadelib.js');
const L = require(EXT + '/vriendenlib.js');
const ACC = require(EXT + '/account.js');

let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const lees = (s) => { const t = mem.get(s); return t === undefined ? undefined : JSON.parse(t); };
const zet = (s, w) => mem.set(s, JSON.stringify(w));
const schoon = () => mem.clear();
// Vaste, herhaalbare willekeur voor de tests.
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const kaart = (id, ts, vak, cijfer, extra) => Object.assign({ id, ts, vak, cijfer, onderwerp: 'T', weging: 1, opening: 'pak', tier: 1, zeldzaam: false, trede: 0 }, extra || {});

(async () => {
  // ───────── 1. Vloek opheffen: keuze ─────────
  (function keuze() {
    const gal = [kaart('v1', 100, 'Wiskunde', 4.2, { vloek: true }), kaart('v2', 200, 'wiskunde ', 3.1, { vloek: true }), kaart('x', 150, 'Engels', 4, { vloek: true }), kaart('g', 120, 'Wiskunde', 7)];
    const nieuw = (c, ts, vak, id) => ({ id: id || 'n', ts, vak: vak || 'Wiskunde', cijfer: c });
    controle('voldoende is vanaf 5,5', H.HEEL_VANAF === 5.5);
    controle('een 5,5 in hetzelfde vak heft de oudste vloek op', H.kiesVloek(gal, nieuw(5.5, 300)) === 'v1');
    controle('een 5,4 doet niets', H.kiesVloek(gal, nieuw(5.4, 300)) === null);
    controle('vak telt zonder hoofdletters en spaties', H.kiesVloek([gal[1]], nieuw(8, 300)) === 'v2');
    controle('ander vak: geen vloek opgeheven', H.kiesVloek(gal, nieuw(9, 300, 'Frans')) === null);
    controle('alleen een vloek die er eerder was', H.kiesVloek(gal, nieuw(9, 50)) === null && H.kiesVloek(gal, nieuw(9, 100)) === null);
    controle('een kaart is niet zijn eigen redding', H.kiesVloek(gal, nieuw(9, 300, 'Wiskunde', 'v1')) === 'v2');
    controle('al opgeheven (in spo_heel) wordt overgeslagen', H.kiesVloek(gal, nieuw(9, 300), { v1: { ts: 1, door: 'q' } }) === 'v2');
    controle('al opgeheven (heel op de kaart) wordt overgeslagen', H.kiesVloek([Object.assign({}, gal[0], { heel: 5 })], nieuw(9, 300)) === null);
    controle('kaart zonder vloek wordt nooit gekozen', H.kiesVloek([gal[3]], nieuw(9, 300)) === null);
    controle('rommel in, null uit', H.kiesVloek(null, null) === null && H.kiesVloek([null, 5, {}], nieuw(9, 300)) === null && H.kiesVloek(gal, nieuw(NaN, 300)) === null && H.kiesVloek(gal, { id: 'n', ts: 'x', vak: 'Wiskunde', cijfer: 9 }) === null);
  })();

  // ───────── 2. Vloek opheffen: opslag ─────────
  schoon();
  zet('spo_galerij', [kaart('v1', 100, 'Wiskunde', 4.2, { vloek: true, kaart: 'data:x' }), kaart('v2', 150, 'Wiskunde', 3.5, { vloek: true }), kaart('e', 160, 'Engels', 2, { vloek: true })]);
  let r = await H.na({ id: 'n1', ts: 300, vak: 'Wiskunde', cijfer: 6.1 });
  controle('na(): eerste vloek opgeheven', r.ok === true && r.id === 'v1' && r.vak === 'Wiskunde' && r.cijfer === 4.2, JSON.stringify(r));
  let gal = lees('spo_galerij');
  controle('de kaart krijgt heel (tijdstip); vloek blijft true; plaatje blijft', gal[0].heel > 0 && gal[0].vloek === true && gal[0].kaart === 'data:x' && !gal[1].heel && !gal[2].heel);
  controle('spo_heel bevat alleen kaart-id\'s en tijdstip', Object.keys(lees('spo_heel')).join() === 'v1' && lees('spo_heel').v1.door === 'n1' && lees('spo_heel').v1.ts > 0 && !JSON.stringify(lees('spo_heel')).includes('Wiskunde'));
  r = await H.na({ id: 'n2', ts: 310, vak: 'Wiskunde', cijfer: 8 });
  controle('een tweede voldoende heft de volgende vloek op (één per kaart)', r.ok && r.id === 'v2' && lees('spo_galerij')[1].heel > 0);
  r = await H.na({ id: 'n3', ts: 320, vak: 'Wiskunde', cijfer: 8 });
  controle('geen vloeken meer over: niets', r.ok === false);
  r = await H.na({ id: 'n4', ts: 330, vak: 'Engels', cijfer: 5.4 });
  controle('onvoldoende heft niets op', r.ok === false && !lees('spo_galerij')[2].heel);
  r = await H.na({ id: 'n5', ts: 340, vak: 'Engels', cijfer: 6 }, { eerder: true });
  controle('een kaart die je opnieuw opent (eerder) heft niets op', r.ok === false && !lees('spo_galerij')[2].heel);
  // twee tegelijk: nooit dezelfde vloek twee keer
  schoon();
  zet('spo_galerij', [kaart('a', 100, 'Frans', 3, { vloek: true }), kaart('b', 110, 'Frans', 2, { vloek: true })]);
  const [p, q] = await Promise.all([H.na({ id: 'x1', ts: 200, vak: 'Frans', cijfer: 7 }), H.na({ id: 'x2', ts: 210, vak: 'Frans', cijfer: 7 })]);
  controle('twee tegelijk: twee verschillende vloeken', p.ok && q.ok && p.id !== q.id, JSON.stringify([p, q]));
  controle('zonder galerij: geen fout', (schoon(), (await H.na({ id: 'z', ts: 1, vak: 'a', cijfer: 9 })).ok === false));

  // 'Heel gemaakt' (prestatie) blijft kloppen: de kaart blijft vervloekt in de galerij
  const gem = (cijfer) => { const g = [kaart('v', 100, 'Wiskunde', 3, { vloek: true, heel: 500 }), kaart('n', 200, 'Wiskunde', cijfer)]; return P.uitrekenen({ gal: g, gev: {}, team: [], stats: {}, behaald: {} }).find((x) => x.id === 'heel-gemaakt').klaar; };
  controle('prestatie Heel gemaakt: met een 8 klopt hij nog steeds, ook als de kaart al opgeheven is', gem(8) === true);
  controle('prestatie Heel gemaakt: een 6 (wel opgeheven, niet 8+) telt niet voor de prestatie', gem(6) === false);

  // ───────── 3. Vloek opheffen: duels ─────────
  (function duel() {
    const gewoon = { vak: 'Wiskunde', cijfer: 4.2, tier: 0, z: false, t: 0, v: false };
    const vloek = Object.assign({}, gewoon, { v: true });
    const heel = Object.assign({}, gewoon, { h: true });
    controle('opgeheven kaart is sterker dan dezelfde kaart zonder', G.sterkte(heel) > G.sterkte(gewoon));
    controle('opgeheven = één trede hoger', Math.abs(G.sterkte(heel) - G.sterkte(Object.assign({}, gewoon, { t: 1 }))) < 1e-9 && G.duelTrede(heel) === 1);
    controle('opgeheven kaart van trede 1 telt als trede 2', G.duelTrede(Object.assign({}, heel, { t: 1 })) === 2);
    controle('hoogstens mythisch (trede 4)', G.duelTrede(Object.assign({}, heel, { t: 4 })) === 4 && G.sterkte(Object.assign({}, heel, { t: 4 })) === G.sterkte(Object.assign({}, gewoon, { t: 4 })));
    controle('in een duel telt een opgeheven kaart zwaarder dan een gewone', D.macht(heel, 0, 0) > D.macht(gewoon, 0, 0));
    let keert = 0;
    for (let i = 0; i < 300; i++) if (G.vloekKeert(12345, i, 'A', 1, heel)) keert++;
    controle('een opgeheven vloek keert zich nooit tegen je team', keert === 0);
    let keertV = 0;
    for (let i = 0; i < 300; i++) if (G.vloekKeert(12345, i, 'A', 1, vloek)) keertV++;
    controle('een echte vloek wel (controle van de test zelf)', keertV > 0);
    // Een duel met opgeheven kaarten: beide computers zien exact hetzelfde.
    const teamVan = (h) => Array.from({ length: 7 }, (_, i) => ({ vak: 'Vak' + i, cijfer: 4 + (i % 3), tier: 0, z: false, t: 0, v: false, h }));
    const speel = (seed, hA) => {
      const A = G.ordenTeam(teamVan(hA), 0), B = G.ordenTeam(teamVan(false), 0), rA = D.rollen(A), rB = D.rollen(B), uit = [];
      for (let k = 0; k < 10; k++) {
        const z = D.kantVan('A', k), beurt = D.beurtVan(k), sch = D.schutterVoor(z === 'A' ? rA : rB, beurt), kee = (z === 'A' ? rB : rA).keeper;
        const u = D.uitkomst({ seedTekst: 'x|' + seed, k, kant: z, beurt, schutter: sch, keeper: kee, chS: 0, chK: 0, auraS: 0, auraK: 0, r: 'links', h: 'laag', q: 80, dr: 'rechts', dh: 'laag' });
        uit.push(u.uitkomst + (u.keert ? 'K' : ''));
      }
      return uit.join(',');
    };
    controle('opgeheven: twee computers spelen exact hetzelfde duel', [1, 2, 3, 42, 777].every((sd) => speel(sd, true) === speel(sd, true)));
    controle('opgeheven: geen vloek-omkering in een heel team (alleen echte vloeken keren zich tegen je)', ![1, 2, 3, 4, 5, 6, 7, 8].some((sd) => /K/.test(speel(sd, true))));
    controle('h bij een kaart die ook v is telt niet (geen dubbele bonus)', G.isHeel(Object.assign({}, vloek, { h: true })) === false);
    controle('een kaart zonder h verandert niet', G.duelTrede(gewoon) === 0 && G.sterkte(gewoon) === 4.2);
  })();

  // vrienden: wat er over de lijn gaat bij teams
  (function delen() {
    const m = L.teamMomentopname([kaart('a', 1, 'Wiskunde', 4, { vloek: true }), kaart('b', 2, 'Wiskunde', 4, { vloek: true, heel: 9 }), kaart('c', 3, 'Frans', 7)]);
    controle('teammomentopname: vloek, opgeheven en gewoon', m.kaarten[0].v === true && m.kaarten[0].h === false && m.kaarten[1].v === false && m.kaarten[1].h === true && m.kaarten[2].v === false && m.kaarten[2].h === false, JSON.stringify(m.kaarten));
    const t = L.schoonTeam(m);
    controle('schoonTeam bewaart h, en nooit v en h tegelijk', t.kaarten[1].h === true && t.kaarten[1].v === false && t.kaarten[0].h === false);
    const kwaad = L.schoonTeam({ kaarten: [{ vak: 'a', cijfer: 5, tier: 0, v: true, h: true }] });
    controle('een vriend die v en h allebei stuurt, krijgt alleen v', kwaad.kaarten[0].v === true && kwaad.kaarten[0].h === false);
    controle('h uit rommel wordt onwaar', L.schoonTeam({ kaarten: [{ vak: 'a', cijfer: 5, tier: 0, h: 'ja' }] }).kaarten[0].h === false);
  })();

  // ───────── 4. Back-up: samenvoegen ─────────
  (function backup() {
    const sl = ACC.BACKUP_SLEUTELS;
    const lijst = sl || (fs.readFileSync(EXT + '/account.js', 'utf8').match(/BACKUP_SLEUTELS = \[([^\]]*)\]/)[1].match(/'[^']+'/g) || []).map((x) => x.slice(1, -1));
    controle('spo_heel zit in BACKUP_SLEUTELS', lijst.includes('spo_heel'));
    const heel = ACC.samenvoegen('spo_heel', { a: { ts: 20, door: 'x' }, b: { ts: 5, door: 'y' } }, { a: { ts: 10, door: 'z' }, c: { ts: 7, door: 'w' } }, false);
    controle('spo_heel: unie, per kaart de oudste', Object.keys(heel).sort().join() === 'a,b,c' && heel.a.ts === 10 && heel.a.door === 'z' && heel.b.ts === 5);
    controle('spo_heel: leeg + vol = vol', JSON.stringify(ACC.samenvoegen('spo_heel', undefined, { a: { ts: 1, door: 'q' } }, false)) === '{"a":{"ts":1,"door":"q"}}');
    const g = ACC.samenvoegen('spo_galerij', [kaart('v', 100, 'W', 3, { vloek: true })], [kaart('v', 100, 'W', 3, { vloek: true, heel: 77 }), kaart('w', 90, 'W', 8)], false);
    controle('galerij-samenvoeging neemt heel mee van de back-up', g.find((e) => e.id === 'v').heel === 77 && g.length === 2);
    const g2 = ACC.samenvoegen('spo_galerij', [kaart('v', 100, 'W', 3, { vloek: true, heel: 5 })], [kaart('v', 100, 'W', 3, { vloek: true })], false);
    controle('galerij-samenvoeging: heel hier blijft staan', g2[0].heel === 5);
    const ids = ACC.samenvoegen('spo_munten_ids', { 'ar:2026-10-13:1': 1 }, { 'ar:2026-10-13:2': 1, 'arw:2026-10-13:2': 1, 'dm:abc': 1 }, false);
    controle('arcade-limiet en drop-markeringen (in spo_munten_ids) worden samengevoegd', Object.keys(ids).length === 4);
  })();

  // ───────── 5. Wekelijkse drop (client) ─────────
  (function drop() {
    controle('dropTekst: meervoud', L.dropTekst(12) === 'Deze week: 12 mythische kaarten door alle spelers');
    controle('dropTekst: enkelvoud en nul', L.dropTekst(1) === 'Deze week: 1 mythische kaart door alle spelers' && L.dropTekst(0) === 'Deze week: 0 mythische kaarten door alle spelers');
    controle('schoonDrop: geldig', JSON.stringify(L.schoonDrop({ week: '2026-W42', aantal: 3, naam: 'Piet' })) === '{"week":"2026-W42","aantal":3}');
    controle('schoonDrop: rommel wordt null', [null, [], {}, { week: 'x', aantal: 1 }, { week: '2026-W42', aantal: -1 }, { week: '2026-W42', aantal: 1.5 }, { week: '2026-W42', aantal: '5' }, { week: '2026-W42', aantal: 1e12 }, { week: '2026-W42<b>', aantal: 1 }].every((x) => L.schoonDrop(x) === null));
  })();
  {
    const verzoeken = [];
    const echteFetch = globalThis.fetch;
    globalThis.fetch = async (url, o) => { verzoeken.push({ url, headers: o.headers, body: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => ({ ok: true, week: '2026-W42', aantal: 4 }) }; };
    const st = { server: 'https://voorbeeld.invalid/api.php', id: 'a'.repeat(32), token: 'tok', vrienden: [] };
    const uit = await L.dropMeld(st);
    const tel = await L.dropTelling(st);
    globalThis.fetch = echteFetch;
    controle('dropMeld: antwoord schoon', uit && uit.aantal === 4 && uit.week === '2026-W42');
    controle('dropMeld stuurt alleen de actie (geen naam, kaart of cijfer)', Object.keys(verzoeken[0].body).join() === 'a' && verzoeken[0].body.a === 'dropMelden', JSON.stringify(verzoeken[0].body));
    controle('dropTelling stuurt alleen de actie', Object.keys(verzoeken[1].body).join() === 'a' && verzoeken[1].body.a === 'dropTelling' && tel.aantal === 4);
    controle('met de account-headers van het vrienden-account', verzoeken[0].headers['X-Id'] === st.id && verzoeken[0].headers['X-Token'] === 'tok');
  }
  // economie: een mythische kaart telt maar één keer
  schoon();
  controle('drop: nog niet gemeld', (await E.dropGemeld('kaart-1')) === false);
  controle('drop: markeren lukt één keer', (await E.dropMarkeer('kaart-1')) === true && (await E.dropMarkeer('kaart-1')) === false);
  controle('drop: daarna gemeld', (await E.dropGemeld('kaart-1')) === true && (await E.dropGemeld('kaart-2')) === false);

  // ───────── 6. Arcade: economie ─────────
  const echteDate = Date;
  let nepNu = null;
  const zetDag = (jjjj, mm, dd) => { nepNu = new echteDate(jjjj, mm - 1, dd, 12, 0, 0).getTime(); };
  globalThis.Date = class extends echteDate { constructor(...a) { if (a.length) super(...a); else super(nepNu == null ? echteDate.now() : nepNu); } static now() { return nepNu == null ? echteDate.now() : nepNu; } };
  zetDag(2026, 10, 13);
  const geefMunten = (n) => { const m = lees('spo_munten') || {}; zet('spo_munten', Object.assign({ v: 1, init: true, saldo: 0, totaal: 0, gev: { w: 0, g: 0, v: 0 }, ts: 1 }, m, { saldo: n, init: true })); };
  const saldo = () => lees('spo_munten').saldo;
  schoon(); geefMunten(100);
  controle('arcade: vaste regels', E.ARCADE_PER_DAG === 10 && E.ARCADE_INZET === 5 && Object.keys(E.ARCADE).sort().join() === 'hoger,kras,memory,rad');
  let s = await E.arcadeStatus();
  controle('status: 10 over, 100 munten', s.over === 10 && s.gespeeld === 0 && s.saldo === 100 && s.inzet === 5, JSON.stringify(s));
  let a = await E.arcadeStart('memory');
  controle('start: inzet 5 af, slot terug', a.ok && saldo() === 95 && /^ar:2026-10-13:1$/.test(a.slot) && a.over === 9, JSON.stringify(a));
  controle('inzet staat in het logboek', lees('spo_munten_log')[0].n === -5 && /Arcade: Memory/.test(lees('spo_munten_log')[0].r));
  let k = await E.arcadeKlaar(a.slot, 'memory', 7);
  controle('klaar: winst bijgeschreven', k.ok && k.winst === 7 && saldo() === 102, JSON.stringify(k));
  controle('totaal telt mee bij winst', lees('spo_munten').totaal >= 7);
  k = await E.arcadeKlaar(a.slot, 'memory', 7);
  controle('tweede uitbetaling van hetzelfde spel: geweigerd', k.ok === false && k.reden === 'al-betaald' && saldo() === 102, JSON.stringify(k));
  k = await E.arcadeKlaar('ar:2026-10-13:9', 'memory', 1);
  controle('uitbetaling zonder gestart spel: geweigerd', k.ok === false && k.reden === 'onbekend' && saldo() === 102);
  a = await E.arcadeStart('hoger');
  for (const [w, naam] of [[17, 'boven het maximum van hoger-lager'], [-1, 'negatief'], [1.5, 'met komma'], [NaN, 'NaN'], [Infinity, 'oneindig'], ['5', 'tekst']]) {
    k = await E.arcadeKlaar(a.slot, 'hoger', w);
    controle('winst ' + naam + ': geweigerd', k.ok === false && k.reden === 'ongeldig', JSON.stringify(k));
  }
  controle('saldo ongewijzigd na geweigerde winst', saldo() === 97);
  k = await E.arcadeKlaar(a.slot, 'rad', 5);
  controle('slot met een ander spel: gewoon geldig (zelfde slot, ander maximum)', k.ok === true || k.reden === 'al-betaald');
  for (const slot of ['', 'ar:x', 'kaas', '__proto__', 'ar:2026-10-13:1; DROP', null, 5, 'ar:2026-10-13:99']) {
    k = await E.arcadeKlaar(slot, 'memory', 1);
    controle('rommel als slot geweigerd: ' + JSON.stringify(slot), k.ok === false);
  }
  controle('onbekend spel bij start geweigerd', (await E.arcadeStart('poker')).reden === 'onbekend' && (await E.arcadeStart('__proto__')).reden === 'onbekend' && (await E.arcadeStart('constructor')).reden === 'onbekend');
  controle('onbekend spel bij klaar geweigerd', (await E.arcadeKlaar('ar:2026-10-13:1', 'constructor', 1)).reden === 'onbekend');

  // dagelijkse limiet
  schoon(); geefMunten(1000);
  const slots = [];
  for (let i = 0; i < 10; i++) { const x = await E.arcadeStart('kras'); if (x.ok) slots.push(x.slot); }
  controle('10 spellen per dag lukken', slots.length === 10 && new Set(slots).size === 10 && saldo() === 950);
  let elf = await E.arcadeStart('rad');
  controle('het 11e spel: dagmax, geen inzet af', elf.ok === false && elf.reden === 'dagmax' && saldo() === 950, JSON.stringify(elf));
  s = await E.arcadeStatus();
  controle('status: 0 over', s.over === 0 && s.gespeeld === 10);
  // uitbetalen kan nog na de limiet (het spel liep al)
  controle('een gestart spel kan nog worden afgerond', (await E.arcadeKlaar(slots[0], 'kras', 0)).ok === true && saldo() === 950);
  controle('winst 0 betaalt niets en kan ook niet nog eens met winst', (await E.arcadeKlaar(slots[0], 'kras', 50)).reden === 'al-betaald' && saldo() === 950);
  // een back-up terugzetten kan de limiet niet omzeilen: de sleutels in spo_munten_ids worden samengevoegd
  const idsNu = lees('spo_munten_ids');
  const leegHier = ACC.samenvoegen('spo_munten_ids', {}, idsNu, false);
  controle('limiet blijft na samenvoegen met een lege browser', Object.keys(leegHier).filter((x) => x.startsWith('ar:2026-10-13:')).length === 10);
  // volgende dag
  zetDag(2026, 10, 14);
  s = await E.arcadeStatus();
  controle('de volgende dag: weer 10', s.over === 10 && s.gespeeld === 0);
  const nieuweDag = await E.arcadeStart('rad');
  controle('de volgende dag: nieuw slot', nieuweDag.ok && nieuweDag.slot === 'ar:2026-10-14:1');
  // te weinig munten
  schoon(); geefMunten(4);
  const arm = await E.arcadeStart('memory');
  controle('te weinig munten: geweigerd, geen slot gebruikt', arm.ok === false && arm.reden === 'te-weinig' && (await E.arcadeStatus()).over === 10 && saldo() === 4);
  geefMunten(5);
  controle('precies 5 munten is genoeg', (await E.arcadeStart('memory')).ok === true && saldo() === 0);
  // max per spel
  schoon(); geefMunten(100);
  for (const [spel, max] of [['memory', 12], ['hoger', 16], ['kras', 50], ['rad', 20]]) {
    const st = await E.arcadeStart(spel);
    const te = await E.arcadeKlaar(st.slot, spel, max + 1);
    const goed = await E.arcadeKlaar(st.slot, spel, max);
    controle(`${spel}: ${max + 1} geweigerd en ${max} toegestaan`, te.reden === 'ongeldig' && goed.ok === true && E.ARCADE[spel].max === max);
  }
  // gelijktijdig starten: nooit meer dan 10
  schoon(); geefMunten(1000);
  const gelijk = await Promise.all(Array.from({ length: 14 }, () => E.arcadeStart('rad')));
  controle('14 gelijktijdige starts: precies 10 lukken', gelijk.filter((x) => x.ok).length === 10 && gelijk.filter((x) => x.reden === 'dagmax').length === 4 && saldo() === 950);
  globalThis.Date = echteDate;

  // ───────── 7. Arcade: spelregels en kansen ─────────
  // Memory
  (function memory() {
    const gal = Array.from({ length: 9 }, (_, i) => kaart('k' + i, i, 'Vak' + i, 5 + i / 4, { kaart: 'data:' + i }));
    controle('memory: te weinig kaarten geeft null', AR.memoryTegels(gal.slice(0, 5)) === null && AR.memoryTegels([]) === null && AR.memoryTegels(null) === null);
    controle('memory: dubbele id\'s tellen één keer', AR.memoryTegels(gal.slice(0, 5).concat(gal.slice(0, 5))) === null);
    const t = AR.memoryTegels(gal, seeded(7));
    controle('memory: 12 tegels, 6 paren', t.length === 12 && new Set(t.map((x) => x.paar)).size === 6);
    controle('memory: elk paar twee keer, dezelfde kaart', Array.from({ length: 6 }, (_, p) => t.filter((x) => x.paar === p)).every((z) => z.length === 2 && z[0].id === z[1].id));
    controle('memory: 6 verschillende kaarten', new Set(t.map((x) => x.id)).size === 6);
    controle('memory: zonder plaatje kan ook', AR.memoryTegels(gal.map((e) => { const c = Object.assign({}, e); delete c.kaart; return c; }), seeded(1)).every((x) => x.kaart === ''));
    controle('memory: door elkaar (niet steeds dezelfde volgorde)', new Set(Array.from({ length: 20 }, (_, i) => AR.memoryTegels(gal, seeded(i)).map((x) => x.id).join())).size > 10);
    controle('memory: tabel loopt af met meer beurten', [6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 30].map(AR.memoryWinst).join() === '12,12,7,5,5,3,3,2,2,1,1', [6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 30].map(AR.memoryWinst).join());
    controle('memory: nooit boven het maximum van economie', AR.memoryWinst(1) <= E.ARCADE.memory.max);
    // Verwachting: een bot met perfect geheugen en een bot die willekeurig draait.
    function beurten(perfect, r) {
      const kaarten = []; for (let i = 0; i < 6; i++) kaarten.push(i, i);
      const w = AR.schud(kaarten, r), bekend = new Map(), weg = new Set();
      const vrij = () => w.map((_, i) => i).filter((i) => !weg.has(i));
      const kies = (l) => l[Math.floor(r() * l.length)];
      let n = 0;
      while (weg.size < 12) {
        n++;
        let a = null, b = null;
        if (perfect) for (const [p, v] of bekend) for (const [q, x] of bekend) if (p < q && v === x && !weg.has(p) && !weg.has(q)) { a = p; b = q; }
        if (a !== null) { weg.add(a); weg.add(b); continue; }
        const nieuw = perfect ? vrij().filter((i) => !bekend.has(i)) : vrij();
        a = kies(nieuw); bekend.set(a, w[a]);
        let m = null; for (const [p, v] of bekend) if (p !== a && v === w[a] && !weg.has(p)) m = p;
        if (m !== null) { weg.add(a); weg.add(m); continue; }
        const rest = (perfect ? vrij().filter((i) => !bekend.has(i)) : vrij()).filter((i) => i !== a);
        b = kies(rest.length ? rest : vrij().filter((i) => i !== a)); bekend.set(b, w[b]);
        if (w[a] === w[b]) { weg.add(a); weg.add(b); }
      }
      return n;
    }
    const gem = (perfect) => { const r = seeded(perfect ? 11 : 22); let som = 0; const N = 20000; for (let i = 0; i < N; i++) som += AR.memoryWinst(beurten(perfect, r)); return som / N; };
    const gp = gem(true), gw = gem(false);
    controle('memory: perfect geheugen levert gemiddeld hooguit 5,5 (inzet 5), nu ' + gp.toFixed(2), gp <= 5.5 && gp >= 4, gp);
    controle('memory: willekeurig draaien verliest munten (gemiddeld onder 5), nu ' + gw.toFixed(2), gw < 5 && gw > 2.5, gw);
  })();

  // Hoger of lager
  (function hoger() {
    const r = seeded(3);
    let gelijk = 0, buiten = 0, tienden = 0;
    for (let i = 0; i < 20000; i++) { const c = AR.hogerCijfer(r); if (c < 1 || c > 10) buiten++; if (Math.abs(c * 10 - Math.round(c * 10)) > 1e-9) tienden++; const n = AR.hogerVolgend(c, r); if (n === c) gelijk++; }
    controle('hoger: cijfers 1,0 tot 10,0 met één decimaal', buiten === 0 && tienden === 0);
    controle('hoger: volgend cijfer is nooit gelijk', gelijk === 0);
    controle('hoger: beoordelen', AR.hogerGoed(5, 6, 'hoger') && !AR.hogerGoed(5, 6, 'lager') && AR.hogerGoed(5, 4, 'lager') && !AR.hogerGoed(5, 5, 'hoger') && !AR.hogerGoed(5, 6, 'rommel'));
    controle('hoger: kans klopt (1,0: 100%, 10,0: 0%, 5,5: 50%)', AR.hogerKans(1) === 1 && AR.hogerKans(10) === 0 && Math.abs(AR.hogerKans(5.5) - 0.5) < 0.006);
    // kans empirisch bij 3,0: hoger = (100-30)/90
    let h = 0; const r2 = seeded(9); for (let i = 0; i < 40000; i++) if (AR.hogerVolgend(3, r2) > 3) h++;
    controle('hoger: empirische kans bij 3,0 is ongeveer 78%', Math.abs(h / 40000 - 70 / 90) < 0.01, h / 40000);
    controle('hoger: uitbetaling stijgt en blijft onder het maximum', AR.HOGER_WINST.every((w, i, l) => i === 0 || w > l[i - 1]) && Math.max(...AR.HOGER_WINST) <= E.ARCADE.hoger.max && AR.hogerWinst(99) === 16 && AR.hogerWinst(-3) === 0);
    // Verwachting bij optimaal spelen (dynamisch programmeren over alle 91 cijfers).
    const W = AR.HOGER_WINST, waarden = Array.from({ length: 91 }, (_, i) => 10 + i);
    let V = waarden.map(() => W[5]); // na 5 goed betaalt het spel zelf uit
    for (let k = 4; k >= 0; k--) {
      const next = V.slice();
      V = waarden.map((c, ci) => {
        const hoger = waarden.reduce((a, n, ni) => a + (n > c ? next[ni] : 0), 0) / 90, lager = waarden.reduce((a, n, ni) => a + (n < c ? next[ni] : 0), 0) / 90;
        return Math.max(W[k], hoger, lager);
      });
    }
    const optimaal = V.reduce((a, b) => a + b, 0) / V.length;
    controle('hoger: optimaal spelen levert gemiddeld hooguit de inzet op, nu ' + optimaal.toFixed(3), optimaal <= 5 && optimaal > 4, optimaal);
    // Altijd 'de waarschijnlijkste kant' kiezen en na 3 stoppen: ook niet boven de inzet
    let som = 0; const r3 = seeded(5), N = 40000;
    for (let i = 0; i < N; i++) { let c = AR.hogerCijfer(r3), reeks = 0; while (reeks < 3) { const soort = AR.hogerKans(c) >= 0.5 ? 'hoger' : 'lager'; const n = AR.hogerVolgend(c, r3); if (!AR.hogerGoed(c, n, soort)) { reeks = -1; break; } c = n; reeks++; } som += reeks < 0 ? 0 : AR.hogerWinst(reeks); }
    controle('hoger: "kies de meest waarschijnlijke kant en stop na 3" levert minder dan de inzet, nu ' + (som / N).toFixed(2), som / N < 5, som / N);
  })();

  // Kraslot
  (function kras() {
    controle('kras: kansen tellen op tot 1', Math.abs(AR.KRAS_KANS.reduce((a, b) => a + b, 0) - 1) < 1e-12 && AR.KRAS_KANS.length === AR.SYMBOLEN.length + 1);
    controle('kras: prijzen onder het maximum', Math.max(...AR.SYMBOLEN.map((x) => x.prijs)) === E.ARCADE.kras.max);
    controle('kras: verwachting onder de inzet (' + AR.verwachtingKras().toFixed(2) + ')', AR.verwachtingKras() < 5 && AR.verwachtingKras() > 3.5);
    controle('kras: prijs van een rij', AR.krasPrijs(['munt', 'munt', 'munt', 'ster', 'ster', 'klaver']) === 5 && AR.krasPrijs(['kroon', 'kroon', 'kroon', 'ster', 'ster', 'klaver']) === 50 && AR.krasPrijs(['munt', 'munt', 'ster', 'ster', 'klaver', 'klaver']) === 0 && AR.krasPrijs(['ster', 'ster', 'ster', 'munt', 'munt', 'munt']) === 8);
    const r = seeded(99), N = 60000, telling = {}; let som = 0, fout = 0;
    for (let i = 0; i < N; i++) {
      const lot = AR.krasLot(r);
      const t = {}; for (const c of lot.cellen) t[c] = (t[c] || 0) + 1;
      const driedubbel = Object.values(t).filter((x) => x >= 3).length;
      if (lot.cellen.length !== 6 || driedubbel > 1 || lot.prijs !== AR.krasPrijs(lot.cellen) || lot.cellen.some((c) => !AR.SYMBOLEN.some((s) => s.id === c))) fout++;
      som += lot.prijs; telling[lot.prijs] = (telling[lot.prijs] || 0) + 1;
    }
    controle('kras: elk lot is geldig en de prijs klopt met de vakjes (60.000 loten)', fout === 0, fout);
    controle('kras: gemiddelde uitbetaling klopt met de verwachting (' + (som / N).toFixed(2) + ')', Math.abs(som / N - AR.verwachtingKras()) < 0.15, som / N);
    controle('kras: de kans op niets ligt rond de 50%', Math.abs((telling[0] || 0) / N - 0.495) < 0.01);
    controle('kras: alle prijzen komen voor', [5, 8, 15, 25, 50].every((p) => telling[p] > 0), JSON.stringify(telling));
    controle('kras: onder een rare willekeur blijft het geldig', AR.krasLot(() => 0).cellen.length === 6 && AR.krasLot(() => 0.999999).cellen.length === 6);
  })();

  // Rad
  (function rad() {
    controle('rad: 12 vakken, 5 keer niets', AR.RAD.length === 12 && AR.RAD.filter((x) => x === 0).length === 5);
    controle('rad: hoogste vak is het maximum van economie', Math.max(...AR.RAD) === E.ARCADE.rad.max);
    controle('rad: verwachting onder de inzet (' + AR.verwachtingRad().toFixed(2) + ')', AR.verwachtingRad() < 5 && AR.verwachtingRad() > 3.5);
    const r = seeded(4), N = 60000, hits = new Array(12).fill(0); let som = 0;
    for (let i = 0; i < N; i++) { const x = AR.radDraai(r); hits[x]++; som += AR.RAD[x]; }
    controle('rad: alle vakken komen voor, ongeveer even vaak', hits.every((h) => Math.abs(h / N - 1 / 12) < 0.01), hits.join());
    controle('rad: gemiddelde klopt met de verwachting', Math.abs(som / N - AR.verwachtingRad()) < 0.15);
    controle('rad: index altijd in bereik', AR.radDraai(() => 0) === 0 && AR.radDraai(() => 0.9999999) === 11);
  })();
  controle('echte willekeur (crypto) geeft getallen in [0, 1)', Array.from({ length: 1000 }, () => AR.willekeur()).every((x) => x >= 0 && x < 1));

  // ───────── 8. Bestanden: hub, manifest, pagina ─────────
  const lees_ = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
  const hubHtml = lees_('hub.html'), hubJs = lees_('hub.js'), manifest = JSON.parse(lees_('manifest.json')), arcadeHtml = lees_('arcade.html');
  controle('hub: tab, paneel en pictogram voor de arcade', /id="tab-arcade"[^>]*data-tab="arcade"/.test(hubHtml) && /id="paneel-arcade"[^>]*data-src="arcade\.html\?embed=1"/.test(hubHtml) && /id="i-arcade"/.test(hubHtml));
  const tabsInJs = /const TABS = \[([^\]]*)\]/.exec(hubJs)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  const tabsInHtml = [...hubHtml.matchAll(/<button[^>]*role="tab"[^>]*data-tab="([a-z]+)"/g)].map((x) => x[1]);
  controle('hub: volgorde van TABS in hub.js is gelijk aan die in de zijbalk (pijltjestoetsen)', JSON.stringify(tabsInJs) === JSON.stringify(tabsInHtml), JSON.stringify([tabsInJs, tabsInHtml]));
  controle('hub: elk tabblad heeft een paneel', tabsInHtml.every((t) => hubHtml.includes(`id="paneel-${t}"`)));
  controle('hub: regel voor de wekelijkse drop (aria-live) en drop.js', /id="drop-week"[^>]*aria-live="polite"/.test(hubHtml) && /<script src="drop\.js">/.test(hubHtml) && /<link rel="stylesheet" href="drop\.css"/.test(hubHtml));
  controle('hub: drop.js na vriendenlib.js', hubHtml.indexOf('drop.js') > hubHtml.indexOf('vriendenlib.js'));
  const cs = manifest.content_scripts.find((c) => c.js.includes('content.js')).js;
  controle('content.js: HUB_TABS kent het tabblad arcade', /const HUB_TABS = \[[^\]]*'arcade'/.test(lees_('content.js')));
  controle('manifest: heel.js na economie.js en vóór content.js', cs.indexOf('heel.js') > cs.indexOf('economie.js') && cs.indexOf('heel.js') < cs.indexOf('content.js'));
  controle('manifest: arcade.html is bereikbaar vanuit Somtoday', manifest.web_accessible_resources.some((w) => w.resources.includes('arcade.html')));
  controle('arcade.html: scripts in de goede volgorde', ['economie.js', 'arcadelib.js', 'arcade.js'].every((s, i, l) => arcadeHtml.indexOf(`src="${s}"`) > (i ? arcadeHtml.indexOf(`src="${l[i - 1]}"`) : 0)));
  controle('arcade.html: lang nl, kop, hoofd en skip-link', /<html lang="nl">/.test(arcadeHtml) && /<h1>/.test(arcadeHtml) && /<main id="hoofd">/.test(arcadeHtml) && /class="skip"/.test(arcadeHtml));
  controle('arcade.html: geen tekstvelden (dus niets om te filteren)', !/<(input|textarea)\b(?![^>]*type="checkbox")/i.test(arcadeHtml) && !/contenteditable/i.test(arcadeHtml));
  controle('arcade.html: statusmeldingen worden voorgelezen', /id="melding"[^>]*role="status"[^>]*aria-live="polite"/.test(arcadeHtml));
  const zonderOpmerkingen = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  controle('het woord Somtoday komt in de nieuwe bestanden niet voor in teksten of data (alleen in opmerkingen)', !/somtoday/i.test(arcadeHtml) && ['arcade.js', 'arcadelib.js', 'heel.js', 'drop.js'].every((f) => !/somtoday/i.test(zonderOpmerkingen(lees_(f)))));
  const opslagTekst = lees_('economie.js').split('// ───────── Arcade')[1] + lees_('heel.js') + lees_('arcade.js');
  controle('arcade en heel slaan nergens vaknamen of namen op in de munten- of heel-sleutels', !/spo_heel[^\n]*vak/i.test(lees_('heel.js').split('Opslag')[1] || '') && !/ids\[[^\]]*vak/.test(opslagTekst));
  controle('geen geheimen of ruwe ip\'s in de nieuwe bestanden', ['arcade.js', 'arcadelib.js', 'heel.js', 'drop.js'].every((f) => !/(api[_-]?key|secret|password|wachtwoord|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/i.test(lees_(f))));
  const sj = (f) => lees_(f);
  controle('nieuw-data.js heeft nog steeds een blok 3.0.0 met hooguit 6 punten', (() => { const m = /versie: '3\.0\.0'[\s\S]*?punten: \[([\s\S]*?)\n      \],/.exec(sj('nieuw-data.js')); return !!m && (m[1].match(/^\s{8}'/gm) || []).length <= 6; })());

  console.log(`v3-arcade.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.log('FOUT', e); process.exit(1); });
