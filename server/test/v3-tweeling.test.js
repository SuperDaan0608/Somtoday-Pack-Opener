// v3.0: Tweelingkaarten (tweeling.js): cijferbanden, vakgroepen, berichten (strenge schoonmaak, geen cijfers of vaknamen), wederzijds akkoord,
// beloning (eenmalig, dagelijkse limiet, maximum van 5), opruimen bij blokkeren, back-up, en de pagina's (vrienden en galerij).
// Gebruik: node server/test/v3-tweeling.test.js   (start zelf een kleine webserver op poort 8126; NODE_PATH moet naar de globale modules wijzen)
process.env.TZ = 'Europe/Amsterdam';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const EXT = path.resolve(__dirname, '../../extension');

// Twee gebruikers in één proces: elk heeft zijn eigen opslag. als('A', ...) wisselt de opslag.
const opslagen = { A: new Map(), B: new Map(), C: new Map() };
let huidig = opslagen.A;
globalThis.localStorage = { getItem: (k) => (huidig.has(k) ? huidig.get(k) : null), setItem: (k, v) => huidig.set(k, String(v)), removeItem: (k) => huidig.delete(k) };
globalThis.SPOTekst = require(EXT + '/tekstfilter.js');
require(EXT + '/gevecht.js');
require(EXT + '/economie.js');
const E = globalThis.SPOEco;
const L = require(EXT + '/vriendenlib.js');
const T = require(EXT + '/tweeling.js');
const ACC = require(EXT + '/account.js');

let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : (typeof extra === 'string' ? extra : JSON.stringify(extra))); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const als = async (wie, fn) => { huidig = opslagen[wie]; try { return await fn(); } finally { huidig = opslagen.A; } };
const lees = (wie, sl) => { const t = opslagen[wie].get(sl); return t === undefined ? undefined : JSON.parse(t); };
const zet = (wie, sl, w) => opslagen[wie].set(sl, JSON.stringify(w));
const IDS = { A: 'a1'.repeat(16), B: 'b2'.repeat(16), C: 'c3'.repeat(16) };
const stVan = (wie, anderen) => ({ id: IDS[wie], vrienden: anderen.map(([w, alias, status, extra]) => Object.assign({ id: IDS[w], pub: 'p', alias, status: status || 'vriend' }, extra || {})) });
const ST = { A: stVan('A', [['B', 'Sam'], ['C', 'Noor']]), B: stVan('B', [['A', 'Daan']]), C: stVan('C', [['A', 'Eva']]) };
const kaart = (id, vak, cijfer, ts) => ({ id, ts: ts || 1000, vak, cijfer, onderwerp: 'T', weging: 1, opening: 'pak', tier: 1, zeldzaam: false, trede: 0 });
const MUNTEN = (saldo) => ({ v: 1, init: true, saldo, totaal: 500, gev: { w: 0, g: 0, v: 0 }, ts: 1 });
const saldo = (wie) => lees(wie, 'spo_munten').saldo;
for (const w of ['A', 'B', 'C']) zet(w, 'spo_munten', MUNTEN(100));

// Een nep-kanaal: wat iemand stuurt komt in de postbus van de ander; bezorg() geeft het af (in de opslag van de ontvanger).
const post = [];
let seq = 1000;
L.stuurBericht = async (st, v, obj) => { post.push({ van: st.id, naar: v.id, obj: JSON.parse(JSON.stringify(obj)), seq: ++seq }); };
const wie = (id) => Object.keys(IDS).find((k) => IDS[k] === id);
async function bezorg(naar, opties) {
  const o = opties || {};
  const mijne = post.filter((p) => p.naar === IDS[naar] && !p.bezorgd);
  const uit = { meldingen: [], veranderd: false, n: 0 };
  for (const p of mijne) {
    p.bezorgd = true;
    const r = await als(naar, () => T.opBerichten(ST[naar], p.van, [{ seq: p.seq, leeftijd: o.leeftijd === undefined ? 5 : o.leeftijd, m: p.obj }]));
    uit.meldingen.push(...r.meldingen); uit.veranderd = uit.veranderd || r.veranderd; uit.n++;
  }
  return uit;
}
const alles = async () => { for (let i = 0; i < 4; i++) for (const w of ['A', 'B', 'C']) await bezorg(w); };

(async () => {
  // ───────── 1. Banden en groepen ─────────
  controle('band: 1,0 t/m 1,3 is band 0, 10,0 is band 22', T.band(1) === 0 && T.band(1.3) === 0 && T.band(1.4) === 1 && T.band(10) === 22 && T.band(9.8) === 22 && T.band(9.7) === 21 && T.BANDEN === 23);
  controle('band: ongeldige cijfers geven -1', [0.9, 10.1, NaN, Infinity, '7', null, undefined, {}, -3].every((x) => T.band(x) === -1));
  let bandenOk = true;
  for (let a = 10; a <= 100; a++) for (let b = a; b <= 100; b++) { if (T.band(a / 10) === T.band(b / 10) && b - a > 3) bandenOk = false; }
  controle('bandgarantie: twee cijfers in dezelfde band verschillen hoogstens 0,3 (alle 91 x 91 paren)', bandenOk);
  let bandGrootte = new Set(); for (let a = 10; a <= 100; a++) bandGrootte.add(T.band(a / 10));
  controle('alle 23 banden komen voor en lopen netjes op', bandGrootte.size === 23 && [...bandGrootte].sort((x, y) => x - y).every((x, i) => x === i));
  controle('bandtekst: 7,2 valt in "7,0 tot 7,3"', T.bandTekst(T.band(7.2)) === '7,0 tot 7,3' && T.bandTekst(22) === '9,8 tot 10,0' && T.bandTekst(0) === '1,0 tot 1,3', [T.bandTekst(T.band(7.2)), T.bandTekst(22)]);
  controle('cijfers met afrondingsruis blijven in dezelfde band', T.band(7.2) === T.band(7.2000000001) && T.band(7.3) === T.band(7.299999999));
  controle('vakgroepen: Wiskunde exact, Engels talen, Geschiedenis mens, Tekenen kunst; onbekend vak null', T.groepVan('Wiskunde') === 'exact' && T.groepVan('Engels') === 'talen' && T.groepVan('Geschiedenis') === 'mens' && T.groepVan('Tekenen') === 'kunst' && T.groepVan('Qwxz') === null && T.groepVan(null) === null);
  controle('past: zelfde groep en band', T.past(kaart('x', 'Natuurkunde', 7.1), T.band(7.2), 'exact') && !T.past(kaart('x', 'Natuurkunde', 7.1), T.band(7.2), 'talen') && !T.past(kaart('x', 'Natuurkunde', 7.9), T.band(7.2), 'exact') && !T.past(null, 3, 'exact'));

  // ───────── 2. Strenge schoonmaak van berichten ─────────
  const tid = 'ab12cd34ef56ab12';
  const goed = T.schoonBericht({ t: 'tw-vraag', id: tid, b: 15, g: 'exact' }, 5);
  controle('geldig bericht komt door', goed && goed.t === 'tw-vraag' && goed.id === tid && goed.b === 15 && goed.g === 'exact');
  const extra = T.schoonBericht({ t: 'tw-ja', id: tid, b: 3, g: 'talen', vak: 'Wiskunde', cijfer: 7.2, kaart: 'k1', naam: 'Jan', __proto__: { x: 1 }, constructor: 'x' }, 0);
  controle('alle extra velden (vak, cijfer, kaart, naam) worden weggegooid: alleen t, id, b, g', extra && Object.keys(extra).sort().join() === 'b,g,id,t', extra);
  controle('tw-nee heeft alleen t en id', JSON.stringify(T.schoonBericht({ t: 'tw-nee', id: tid, b: 3, g: 'x' }, 5)) === JSON.stringify({ t: 'tw-nee', id: tid }));
  const slecht = [
    [null, 5], ['tw-vraag', 5], [[], 5], [{}, 5], [{ t: 'tw-vraag' }, 5], [{ t: 'tw-vraag', id: 'xyz', b: 1, g: 'exact' }, 5], [{ t: 'tw-vraag', id: '__proto__', b: 1, g: 'exact' }, 5],
    [{ t: 'tw-vraag', id: 'AB12CD34EF56AB12', b: 1, g: 'exact' }, 5], [{ t: 'tw-vraag', id: 'ab12', b: 1, g: 'exact' }, 5], [{ t: 'tw-vraag', id: 'a'.repeat(33), b: 1, g: 'exact' }, 5],
    [{ t: 'tw-vraag', id: tid, b: 23, g: 'exact' }, 5], [{ t: 'tw-vraag', id: tid, b: -1, g: 'exact' }, 5], [{ t: 'tw-vraag', id: tid, b: 1.5, g: 'exact' }, 5], [{ t: 'tw-vraag', id: tid, b: '3', g: 'exact' }, 5],
    [{ t: 'tw-vraag', id: tid, b: 3, g: 'Wiskunde' }, 5], [{ t: 'tw-vraag', id: tid, b: 3, g: '__proto__' }, 5], [{ t: 'tw-vraag', id: tid, b: 3, g: 'constructor' }, 5], [{ t: 'tw-vraag', id: tid, b: 3 }, 5], [{ t: 'tw-ja', id: tid, b: 3, g: ['exact'] }, 5],
    [{ t: 'tw-onbekend', id: tid, b: 3, g: 'exact' }, 5], [{ t: 'rivaal', id: tid, b: 3, g: 'exact' }, 5], [{ t: 'tw-vraag', id: tid, b: 3, g: 'exact' }, 600], [{ t: 'tw-vraag', id: tid, b: 3, g: 'exact' }, -1], [{ t: 'tw-vraag', id: tid, b: 3, g: 'exact' }, NaN],
    [{ t: 'tw-vraag', id: tid, b: 3, g: 'exact' }, undefined], [{ t: 'tw-vraag', id: tid, b: 3, g: 'exact' }, '5'], [{ t: 'tw-nee', id: 12345678 }, 5], [{ t: ['tw-nee'], id: tid }, 5],
  ];
  slecht.forEach(([m, l], i) => controle('ongeldig bericht #' + i + ' geweigerd: ' + JSON.stringify(m), T.schoonBericht(m, l) === null));
  controle('bericht van net binnen en van 599 seconden oud mogen nog', T.schoonBericht({ t: 'tw-nee', id: tid }, 0) && T.schoonBericht({ t: 'tw-nee', id: tid }, 599));

  // ───────── 3. De hele stroom: A stelt voor, B doet mee ─────────
  zet('A', 'spo_galerij', [kaart('a1', 'Wiskunde', 7.2), kaart('a2', 'Engels', 6.0), kaart('a3', 'Qwxz', 7.2), kaart('a4', 'Geschiedenis', 8.1)]);
  zet('B', 'spo_galerij', [kaart('b1', 'Natuurkunde', 7.1), kaart('b2', 'Frans', 7.2), kaart('b3', 'Biologie', 9.0), kaart('b4', 'Wiskunde', 7.6)]);
  zet('C', 'spo_galerij', [kaart('c1', 'Wiskunde', 7.2)]);
  const kA = lees('A', 'spo_galerij');
  let id1;
  await als('A', async () => {
    try { await T.vraag(ST.A, IDS.B, kA[2]); controle('onbekend vak kan niet worden voorgesteld', false); } catch (e) { controle('onbekend vak kan niet worden voorgesteld', /geen tweelingkaart/.test(e.message)); }
    try { await T.vraag(ST.A, IDS.B, null); controle('zonder kaart kan niet', false); } catch (e) { controle('zonder kaart kan niet', /Kies eerst/.test(e.message)); }
    try { await T.vraag(ST.A, 'f'.repeat(32), kA[0]); controle('onbekende vriend kan niet', false); } catch (e) { controle('onbekende vriend kan niet', /niet beschikbaar/.test(e.message)); }
    id1 = await T.vraag(ST.A, IDS.B, kA[0]);
  });
  controle('voorstel: een bericht naar B met alleen t, id, b en g', post.length === 1 && post[0].naar === IDS.B && Object.keys(post[0].obj).sort().join() === 'b,g,id,t' && post[0].obj.t === 'tw-vraag' && post[0].obj.g === 'exact' && post[0].obj.b === T.band(7.2) && post[0].obj.id === id1, post[0]);
  controle('het bericht bevat geen vaknaam, geen cijfer, geen kaart-id en geen naam', !/wiskunde|7\.2|7,2|a1\b|daan|sam/i.test(JSON.stringify(post[0].obj)));
  let sA = lees('A', 'spo_tweeling');
  controle('A: opgeslagen als verzonden voorstel met eigen kaart (blijft lokaal)', sA.kaarten[id1].status === 'verzonden' && sA.kaarten[id1].rol === 'vraag' && sA.kaarten[id1].eigen === 'a1' && sA.kaarten[id1].naam === 'Sam');
  const m1 = await bezorg('B');
  controle('B krijgt een melding met band en groep, zonder vak', m1.meldingen.length === 1 && /Daan stelt een tweelingkaart voor/.test(m1.meldingen[0]) && /7,0 tot 7,3/.test(m1.meldingen[0]) && /exacte vakken/.test(m1.meldingen[0]) && !/wiskunde/i.test(m1.meldingen[0]), m1.meldingen);
  const sB = lees('B', 'spo_tweeling');
  controle('B: een openstaand verzoek, geen kaart', Object.keys(sB.verzoeken).length === 1 && sB.verzoeken[id1].van === IDS.A && Object.keys(sB.kaarten).length === 0);
  const kB = lees('B', 'spo_galerij');
  const opties = T.passendeKaarten(kB, sB, sB.verzoeken[id1].b, 'exact');
  controle('B: alleen kaarten in dezelfde band en groep passen (Natuurkunde 7,1), niet Frans (talen), Biologie (9,0) of Wiskunde 7,6', opties.map((e) => e.id).join() === 'b1', opties.map((e) => e.id));
  await als('B', async () => {
    for (const [bad, tekst] of [[kB[1], 'talen-kaart'], [kB[2], 'andere band'], [kB[3], 'band ernaast'], [null, 'geen kaart']]) {
      try { await T.accepteer(ST.B, id1, bad); controle('accepteren met ' + tekst + ' kan niet', false); } catch (e) { controle('accepteren met ' + tekst + ' kan niet', /past niet/.test(e.message)); }
    }
    try { await T.accepteer(ST.B, 'ffffffffffffffff', kB[0]); controle('onbekend voorstel kan niet', false); } catch (e) { controle('onbekend voorstel kan niet', /bestaat niet meer/.test(e.message)); }
  });
  controle('B heeft nog niets verstuurd door de mislukte pogingen', post.length === 1);
  await als('B', () => T.accepteer(ST.B, id1, kB[0]));
  const sB2 = lees('B', 'spo_tweeling');
  controle('B: tweelingkaart actief (antwoord), verzoek weg, nog niet bevestigd', sB2.kaarten[id1].status === 'actief' && sB2.kaarten[id1].rol === 'antwoord' && sB2.kaarten[id1].eigen === 'b1' && sB2.kaarten[id1].bevestigd === false && Object.keys(sB2.verzoeken).length === 0);
  controle('B stuurt ja met dezelfde band en groep (zonder vak of cijfer)', post.length === 2 && post[1].obj.t === 'tw-ja' && post[1].obj.b === post[0].obj.b && post[1].obj.g === 'exact' && Object.keys(post[1].obj).sort().join() === 'b,g,id,t' && !/natuurkunde|7\.1/i.test(JSON.stringify(post[1].obj)));
  await als('B', async () => { const o = await T.onderhoud(ST.B); controle('B krijgt nog geen munten zolang A niet heeft bevestigd', o.munten === 0 && saldo('B') === 100, o); });
  const m2 = await bezorg('A');
  controle('A krijgt de melding: jullie hebben een tweelingkaart', m2.meldingen.length === 1 && /Sam doet mee/.test(m2.meldingen[0]));
  sA = lees('A', 'spo_tweeling');
  controle('A: actief en bevestigd', sA.kaarten[id1].status === 'actief' && sA.kaarten[id1].bevestigd === true);
  controle('A bevestigt terug naar B (tw-ja)', post.length === 3 && post[2].naar === IDS.B && post[2].obj.t === 'tw-ja');
  let oA = await als('A', () => T.onderhoud(ST.A));
  controle('A krijgt 25 munten (eenmalig) en de beloning is gemarkeerd', oA.munten === 25 && saldo('A') === 125 && lees('A', 'spo_tweeling').kaarten[id1].beloond === true && lees('A', 'spo_munten_ids')['bm:tw:' + id1] === 1);
  oA = await als('A', () => T.onderhoud(ST.A));
  controle('een tweede onderhoud geeft niets extra', oA.munten === 0 && saldo('A') === 125);
  await bezorg('B');
  controle('B: bevestigd door A', lees('B', 'spo_tweeling').kaarten[id1].bevestigd === true);
  let oB = await als('B', () => T.onderhoud(ST.B));
  controle('B krijgt nu ook 25 munten', oB.munten === 25 && saldo('B') === 125);
  const nPost = post.length;
  await bezorg('A'); await bezorg('B');
  controle('geen eindeloos heen-en-weer: er worden geen extra berichten gestuurd', post.length === nPost);
  // een herhaald ja (verloren bevestiging) krijgt opnieuw een bevestiging maar geen tweede kaart of beloning
  await als('B', async () => { const s = lees('B', 'spo_tweeling'); s.kaarten[id1].bevestigd = false; s.kaarten[id1].laatst = 0; zet('B', 'spo_tweeling', s); await T.onderhoud(ST.B); });
  controle('B stuurt het ja opnieuw zolang het niet bevestigd is', post.length === nPost + 1 && post[post.length - 1].obj.t === 'tw-ja');
  await bezorg('A'); await bezorg('B');
  controle('A bevestigt opnieuw, B is weer bevestigd, A krijgt geen tweede beloning', lees('B', 'spo_tweeling').kaarten[id1].bevestigd === true && saldo('A') === 125 && Object.keys(lees('A', 'spo_tweeling').kaarten).length === 1);
  controle('B kan zijn beloning niet nog eens krijgen (bm:tw is eenmalig)', (await als('B', () => T.onderhoud(ST.B))).munten === 0 && saldo('B') === 125);

  // ───────── 4. Misbruik en rommel ─────────
  const sBvoor = JSON.stringify(lees('B', 'spo_tweeling'));
  await als('B', async () => {
    // niet-vriend, geblokkeerde, andere versie
    const vreemd = { id: 'e5'.repeat(16), vrienden: ST.B.vrienden };
    const r1 = await T.opBerichten(ST.B, 'e5'.repeat(16), [{ seq: ++seq, leeftijd: 1, m: { t: 'tw-vraag', id: 'aaaaaaaaaaaaaaaa', b: 3, g: 'exact' } }]);
    controle('voorstel van een niet-vriend wordt genegeerd', !r1.veranderd && Object.keys(lees('B', 'spo_tweeling').verzoeken).length === 0);
    const andere = { id: IDS.B, vrienden: [{ id: IDS.A, alias: 'Daan', status: 'vriend', andereVersie: true }] };
    const r2 = await T.opBerichten(andere, IDS.A, [{ seq: ++seq, leeftijd: 1, m: { t: 'tw-vraag', id: 'bbbbbbbbbbbbbbbb', b: 3, g: 'exact' } }]);
    controle('voorstel van een vriend met een andere versie wordt genegeerd', !r2.veranderd);
    const wacht = { id: IDS.B, vrienden: [{ id: IDS.A, alias: 'Daan', status: 'verzonden' }] };
    controle('voorstel van iemand die nog geen vriend is wordt genegeerd', !(await T.opBerichten(wacht, IDS.A, [{ seq: ++seq, leeftijd: 1, m: { t: 'tw-vraag', id: 'cccccccccccccccc', b: 3, g: 'exact' } }])).veranderd);
    // een ja zonder voorstel, met een verkeerde band, van een verkeerde vriend, een oud volgnummer
    const s0 = lees('B', 'spo_tweeling').seq[IDS.A];
    controle('oud volgnummer (replay) wordt genegeerd', !(await T.opBerichten(ST.B, IDS.A, [{ seq: 1, leeftijd: 1, m: { t: 'tw-vraag', id: 'dddddddddddddddd', b: 3, g: 'exact' } }])).veranderd && lees('B', 'spo_tweeling').seq[IDS.A] === s0);
    controle('rommel in de lijst en berichten zonder seq worden genegeerd', !(await T.opBerichten(ST.B, IDS.A, [null, 5, {}, { seq: 'x', leeftijd: 1, m: { t: 'tw-nee', id: id1 } }, { seq: ++seq, leeftijd: 1, m: null }])).veranderd && !(await T.opBerichten(ST.B, IDS.A, 'rommel')).veranderd);
  });
  await als('A', async () => {
    const nuId = lees('A', 'spo_tweeling');
    const s0 = JSON.stringify(nuId.kaarten);
    // een ja met een andere band of groep dan het voorstel, van een andere vriend, en voor een onbekend id
    await T.opBerichten(ST.A, IDS.B, [{ seq: ++seq, leeftijd: 1, m: { t: 'tw-ja', id: id1, b: 3, g: 'exact' } }, { seq: ++seq, leeftijd: 1, m: { t: 'tw-ja', id: id1, b: nuId.kaarten[id1].b, g: 'talen' } }, { seq: ++seq, leeftijd: 1, m: { t: 'tw-ja', id: 'eeeeeeeeeeeeeeee', b: 3, g: 'exact' } }]);
    await T.opBerichten(ST.A, IDS.C, [{ seq: ++seq, leeftijd: 1, m: { t: 'tw-nee', id: id1 } }]);
    controle('een ja met verkeerde band/groep, voor een onbekend id, en een nee van een ander verandert niets', JSON.stringify(lees('A', 'spo_tweeling').kaarten) === s0);
  });

  // ───────── 5. Weigeren, intrekken, weghalen ─────────
  let id2;
  await als('A', async () => { id2 = await T.vraag(ST.A, IDS.C, kA[1]); });
  const mC = await bezorg('C');
  controle('C krijgt het voorstel (A: Eva)', /Daan stelt/.test(mC.meldingen[0] || '') === false && /Daan|Eva|stelt een tweelingkaart/.test(mC.meldingen[0] || ''), mC.meldingen);
  await als('C', () => T.weiger(ST.C, id2));
  await bezorg('A');
  controle('C weigert: het voorstel van A verdwijnt en A krijgt een melding', !lees('A', 'spo_tweeling').kaarten[id2] && Object.keys(lees('C', 'spo_tweeling').verzoeken).length === 0);
  // niet twee keer dezelfde kaart
  await als('A', async () => {
    try { await T.vraag(ST.A, IDS.C, kA[0]); controle('een kaart die al in een tweelingkaart zit kan niet nog eens', false); } catch (e) { controle('een kaart die al in een tweelingkaart zit kan niet nog eens', /al in een tweelingkaart/.test(e.message)); }
  });
  // intrekken van een openstaand voorstel
  let id3;
  await als('A', async () => { id3 = await T.vraag(ST.A, IDS.C, kA[3]); await T.stop(ST.A, id3); });
  await bezorg('C');
  controle('intrekken: A heeft niets meer open en C ziet het voorstel niet meer', !lees('A', 'spo_tweeling').kaarten[id3] && !lees('C', 'spo_tweeling').verzoeken[id3]);
  // weghalen van een actieve tweelingkaart haalt hem bij beide weg
  await als('B', () => T.stop(ST.B, id1));
  const mA = await bezorg('A');
  controle('B haalt de tweelingkaart weg: A raakt hem ook kwijt, met melding', !lees('A', 'spo_tweeling').kaarten[id1] && /weggehaald/.test(mA.meldingen[0] || ''), mA.meldingen);
  controle('de beloning blijft van A en B (geen terugboeking)', saldo('A') === 125 && saldo('B') === 125);
  // dezelfde kaart is daarna weer vrij; een nieuw voorstel krijgt een nieuw id en dus een nieuwe beloning (maar wel binnen de dagelijkse limiet)
  const sCnaam = lees('A', 'spo_tweeling');
  controle('na weghalen is de kaart weer vrij', Object.values(sCnaam.kaarten).every((k) => k.eigen !== 'a1'));

  // ───────── 6. Maximum van 5 en de dagelijkse limiet ─────────
  for (const w of ['A', 'B']) { zet(w, 'spo_tweeling', { v: 1, kaarten: {}, verzoeken: {}, seq: {}, betaald: {} }); zet(w, 'spo_munten', MUNTEN(0)); zet(w, 'spo_munten_ids', {}); }
  post.length = 0;
  const galA = Array.from({ length: 7 }, (_, i) => kaart('x' + i, 'Wiskunde', 7.0 + (i % 3) * 0.1, 100 + i));
  const galB = Array.from({ length: 7 }, (_, i) => kaart('y' + i, 'Natuurkunde', 7.1, 100 + i));
  zet('A', 'spo_galerij', galA); zet('B', 'spo_galerij', galB);
  const ids = [];
  for (let i = 0; i < 5; i++) {
    await als('A', async () => {
      // Hoogstens 2 openstaande voorstellen per vriend: eerst afhandelen
      ids.push(await T.vraag(ST.A, IDS.B, galA[i]));
    });
    await bezorg('B');
    await als('B', () => T.accepteer(ST.B, ids[i], galB[i]));
    await bezorg('A'); await bezorg('B');
  }
  controle('vijf tweelingkaarten gemaakt', Object.keys(lees('A', 'spo_tweeling').kaarten).length === 5 && Object.keys(lees('B', 'spo_tweeling').kaarten).length === 5);
  await als('A', async () => { try { await T.vraag(ST.A, IDS.B, galA[5]); controle('de zesde kan niet (A)', false); } catch (e) { controle('de zesde kan niet (A)', /al 5 tweelingkaarten/.test(e.message)); } });
  // B kan geen zesde accepteren: een voorstel van A kan alleen via een handmatig verzoek
  await als('B', async () => { const s = lees('B', 'spo_tweeling'); s.verzoeken['1111111111111111'] = { van: IDS.A, b: T.band(7.1), g: 'exact', ts: Date.now() }; zet('B', 'spo_tweeling', s); try { await T.accepteer(ST.B, '1111111111111111', galB[5]); controle('de zesde kan niet (B)', false); } catch (e) { controle('de zesde kan niet (B)', /al 5 tweelingkaarten/.test(e.message)); } });
  const oA1 = await als('A', () => T.onderhoud(ST.A));
  controle('dagelijkse limiet: 5 tweelingen op één dag geven samen hoogstens 50 munten', oA1.munten === 50 && saldo('A') === 50, oA1);
  const geld = Object.values(lees('A', 'spo_tweeling').kaarten);
  controle('de rest wacht (nog niet beloond) en wordt niet vergeten', geld.filter((k) => k.beloond).length === 2 && geld.filter((k) => !k.beloond).length === 3);
  const oA2 = await als('A', () => T.onderhoud(ST.A));
  controle('nog steeds op dezelfde dag: geen extra munten', oA2.munten === 0 && saldo('A') === 50);
  await als('A', async () => { const s = lees('A', 'spo_tweeling'); const dag = Object.keys(s.betaald)[0]; s.betaald['2000-01-01'] = s.betaald[dag]; delete s.betaald[dag]; zet('A', 'spo_tweeling', s); });
  const oA3 = await als('A', () => T.onderhoud(ST.A));
  controle('de volgende dag worden er weer hoogstens 2 uitbetaald (50 munten)', oA3.munten === 50 && saldo('A') === 100, oA3);
  controle('de oude dagtellers worden opgeruimd (hoogstens 7)', Object.keys(lees('A', 'spo_tweeling').betaald).length <= 7);
  controle('munten hebben geen invloed op cijfers: spo_galerij is onaangetast', JSON.stringify(lees('A', 'spo_galerij')) === JSON.stringify(galA));

  // ───────── 7. Openstaande voorstellen per vriend, verlopen, vriend weg ─────────
  zet('A', 'spo_tweeling', { v: 1, kaarten: {}, verzoeken: {}, seq: {}, betaald: {} });
  await als('A', async () => {
    await T.vraag(ST.A, IDS.B, galA[0]); await T.vraag(ST.A, IDS.B, galA[1]);
    try { await T.vraag(ST.A, IDS.B, galA[2]); controle('hoogstens 2 openstaande voorstellen per vriend', false); } catch (e) { controle('hoogstens 2 openstaande voorstellen per vriend', /Wacht eerst op antwoord/.test(e.message)); }
    const s = lees('A', 'spo_tweeling');
    const eerste = Object.keys(s.kaarten)[0];
    s.kaarten[eerste].sinds = Date.now() - 8 * 864e5; zet('A', 'spo_tweeling', s);
    await T.onderhoud(ST.A);
    controle('een voorstel zonder antwoord vervalt na een week', Object.keys(lees('A', 'spo_tweeling').kaarten).length === 1);
    const zonderB = { id: IDS.A, vrienden: [{ id: IDS.C, alias: 'Noor', status: 'vriend' }] };
    await T.onderhoud(zonderB);
    controle('geen vriend meer: het voorstel gaat weg', Object.keys(lees('A', 'spo_tweeling').kaarten).length === 0);
    const vz = lees('A', 'spo_tweeling'); vz.verzoeken['2222222222222222'] = { van: IDS.B, b: 3, g: 'exact', ts: Date.now() }; vz.seq[IDS.B] = 7; zet('A', 'spo_tweeling', vz);
    await T.onderhoud(zonderB);
    controle('verzoeken en volgnummers van een weggevallen vriend worden opgeruimd', Object.keys(lees('A', 'spo_tweeling').verzoeken).length === 0 && lees('A', 'spo_tweeling').seq[IDS.B] === undefined);
  });
  // te veel verzoeken
  await als('B', async () => {
    zet('B', 'spo_tweeling', { v: 1, kaarten: {}, verzoeken: {}, seq: {}, betaald: {} });
    const lijst = Array.from({ length: 14 }, (_, i) => ({ seq: 10000 + i, leeftijd: 1, m: { t: 'tw-vraag', id: i.toString(16).padStart(16, '0'), b: 3, g: 'exact' } }));
    await T.opBerichten(ST.B, IDS.A, lijst);
    controle('hoogstens 10 openstaande verzoeken tegelijk', Object.keys(lees('B', 'spo_tweeling').verzoeken).length === 10);
  });
  // naam in de opslag komt door het filter
  await als('A', async () => {
    const stSlecht = { id: IDS.A, vrienden: [{ id: IDS.B, pub: 'p', alias: 'klootzak', status: 'vriend' }] };
    zet('A', 'spo_tweeling', { v: 1, kaarten: {}, verzoeken: {}, seq: {}, betaald: {} });
    const id = await T.vraag(stSlecht, IDS.B, galA[0]);
    controle('een bijnaam die door het filter wordt afgekeurd komt als standaardnaam in de opslag', lees('A', 'spo_tweeling').kaarten[id].naam === 'Vriend ' + IDS.B.slice(0, 4), lees('A', 'spo_tweeling').kaarten[id].naam);
  });

  // ───────── 8. Opslag: kapotte gegevens en samenvoegen ─────────
  const kapot = T.schoonStaat({ kaarten: { '__proto__': { vriend: IDS.B }, abc: {}, [tid]: { vriend: 'x', rol: 'vraag', status: 'actief', eigen: 'a', b: 1, g: 'exact' }, ['1234567890abcdef']: { vriend: IDS.B, rol: 'antwoord', status: 'verzonden', eigen: 'k', b: 99, g: 'exact' } }, verzoeken: { '1234567890abcdef': { van: 'x', b: 1, g: 'exact' } }, seq: { x: 1, [IDS.B]: -5 }, betaald: { rommel: 5, '2026-01-01': 9999 } });
  controle('kapotte opslag levert een lege, geldige staat (en betaald is begrensd)', Object.keys(kapot.kaarten).length === 0 && Object.keys(kapot.verzoeken).length === 0 && Object.keys(kapot.seq).length === 0 && kapot.betaald['2026-01-01'] === T.MUNTEN_MAX_DAG && !('rommel' in kapot.betaald), kapot);
  controle('schoonStaat(null) en schoonStaat("rommel") zijn leeg', JSON.stringify(T.schoonStaat(null)) === JSON.stringify(T.schoonStaat('rommel')) && T.schoonStaat(5).v === 1);
  const antw = T.schoonStaat({ kaarten: { [tid]: { vriend: IDS.B, rol: 'antwoord', status: 'verzonden', eigen: 'k', b: 3, g: 'exact', beloond: 'ja' } } });
  controle('een antwoord is altijd actief en beloond moet echt true zijn', antw.kaarten[tid].status === 'actief' && antw.kaarten[tid].beloond === false);
  const kA2 = { v: 1, kaarten: { [tid]: { vriend: IDS.B, rol: 'vraag', status: 'verzonden', eigen: 'k', b: 3, g: 'exact', naam: 'S', sinds: 1, laatst: 1, bevestigd: false, beloond: false }, '1111111111111111': { vriend: IDS.B, rol: 'vraag', status: 'actief', eigen: 'k2', b: 3, g: 'exact', beloond: true, bevestigd: true } }, verzoeken: { '2222222222222222': { van: IDS.B, b: 1, g: 'talen', ts: 5 } }, seq: { [IDS.B]: 10 }, betaald: { '2026-01-01': 25 } };
  const kB2 = { v: 1, kaarten: { [tid]: { vriend: IDS.B, rol: 'vraag', status: 'actief', eigen: 'k', b: 3, g: 'exact', beloond: true, bevestigd: true }, '1111111111111111': { vriend: IDS.B, rol: 'vraag', status: 'verzonden', eigen: 'k2', b: 3, g: 'exact' }, '3333333333333333': { vriend: IDS.C, rol: 'antwoord', status: 'actief', eigen: 'k3', b: 4, g: 'kunst' } }, verzoeken: {}, seq: { [IDS.B]: 30, [IDS.C]: 2 }, betaald: { '2026-01-01': 50, '2026-01-02': 25 } };
  const mg = ACC.samenvoegen('spo_tweeling', kA2, kB2);
  controle('samenvoegen: unie van kaarten, actief wint, beloond blijft beloond', Object.keys(mg.kaarten).length === 3 && mg.kaarten[tid].status === 'actief' && mg.kaarten[tid].beloond === true && mg.kaarten['1111111111111111'].status === 'actief' && mg.kaarten['1111111111111111'].beloond === true, mg.kaarten);
  controle('samenvoegen: volgnummers en dagtellers nemen het hoogste, verzoeken van allebei', mg.seq[IDS.B] === 30 && mg.seq[IDS.C] === 2 && mg.betaald['2026-01-01'] === 50 && mg.betaald['2026-01-02'] === 25 && !!mg.verzoeken['2222222222222222']);
  controle('samenvoegen: het resultaat is een geldige staat', JSON.stringify(T.schoonStaat(mg).kaarten).length > 10 && Object.keys(T.schoonStaat(mg).kaarten).length === 3);
  controle('samenvoegen: leeg hier of daar', ACC.samenvoegen('spo_tweeling', undefined, kB2) === kB2 && ACC.samenvoegen('spo_tweeling', kA2, undefined) === kA2);
  controle('spo_tweeling staat in BACKUP_SLEUTELS', ACC.BACKUP_SLEUTELS.includes('spo_tweeling'));
  const pk = T.perKaart({ kaarten: { [tid]: { vriend: IDS.B, rol: 'vraag', status: 'actief', eigen: 'k9', b: 3, g: 'exact', naam: 'Sam' }, '1111111111111111': { vriend: IDS.B, rol: 'vraag', status: 'verzonden', eigen: 'k8', b: 3, g: 'exact' } } });
  controle('perKaart (galerij): alleen actieve tweelingen, met de naam', Object.keys(pk).join() === 'k9' && pk.k9.naam === 'Sam');

  // ───────── 9. Blokkeren ruimt tweelingkaarten op ─────────
  await als('A', async () => {
    const echt = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
    zet('A', 'spo_tweeling', { v: 1, kaarten: { [tid]: { vriend: IDS.B, rol: 'vraag', status: 'actief', eigen: 'k', b: 3, g: 'exact', naam: 'Sam', sinds: 1, laatst: 1, bevestigd: true, beloond: true }, '1111111111111111': { vriend: IDS.C, rol: 'vraag', status: 'actief', eigen: 'k2', b: 3, g: 'exact', naam: 'Eva', sinds: 1, laatst: 1, bevestigd: true, beloond: true } }, verzoeken: { '2222222222222222': { van: IDS.B, b: 3, g: 'exact', ts: 1 } }, seq: { [IDS.B]: 4 }, betaald: {} });
    const st = { server: 'https://x.invalid/api.php', id: IDS.A, token: 't', vrienden: [{ id: IDS.B, pub: 'p', alias: 'Sam', status: 'vriend' }, { id: IDS.C, pub: 'p', alias: 'Eva', status: 'vriend' }], reacties: {}, gokken: {}, raden: [] };
    try { await L.blokkeer(st, IDS.B); } finally { globalThis.fetch = echt; }
    const s = lees('A', 'spo_tweeling');
    controle('blokkeren: de tweelingkaart, het voorstel en het volgnummer van die persoon zijn weg; die van een ander blijft', !s.kaarten[tid] && !!s.kaarten['1111111111111111'] && Object.keys(s.verzoeken).length === 0 && s.seq[IDS.B] === undefined, s);
  });

  // ───────── 10. Bestanden: geen vaknamen in berichten, geen merknaam, geen tekstvelden ─────────
  const bron = fs.readFileSync(EXT + '/tweeling.js', 'utf8');
  controle('tweeling.js stuurt alleen { t, id, b, g } (geen vak/cijfer in een stuur-aanroep)', (bron.match(/stuur\(st, [^)]*\{[^}]*\}/g) || []).every((x) => !/vak|cijfer|eigen|naam/.test(x)), bron.match(/stuur\(st, [^)]*\{[^}]*\}/g));
  controle('geen tekstvelden in tweeling.js (alleen keuzelijsten)', !/createElement\('(input|textarea)'|el\('(input|textarea)'/.test(bron));
  controle('geen merknaam in tweeling.js, tweeling.css', !/somtoday/i.test(bron.replace(/Somtoday Pack Opener/g, '')) && !/somtoday/i.test(fs.readFileSync(EXT + '/tweeling.css', 'utf8')));

  // ───────── 11. Pagina's ─────────
  const { chromium } = require('playwright');
  const WEB = 'http://localhost:8126';
  const SERVER = 'https://jummysnacks.nl/api.php';
  const web = spawn(process.execPath, [path.join(process.env.NODE_PATH || '', 'http-server/bin/http-server'), '-p', '8126', '-s', '-c-1', EXT], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(WEB + '/vrienden.html'); break; } catch (e) { await slaap(100); } }
  const NEP = ({ zaad }) => {
    const P = 'mock:';
    if (!localStorage.getItem(P + '__klaar')) { localStorage.setItem(P + '__klaar', '1'); for (const [sl, w] of Object.entries(zaad)) localStorage.setItem(P + sl, JSON.stringify(w)); }
    const luisteraars = [];
    const les = (sl) => { const t = localStorage.getItem(P + sl); return t == null ? undefined : JSON.parse(t); };
    const sleutels = (s) => (s == null ? Object.keys(localStorage).filter((x) => x.startsWith(P) && x !== P + '__klaar').map((x) => x.slice(P.length)) : [].concat(typeof s === 'object' && !Array.isArray(s) ? Object.keys(s) : s));
    const local = {
      async get(s) { const r = {}; for (const sl of sleutels(s)) { const v = les(sl); if (v !== undefined) r[sl] = v; } return r; },
      async set(o) { const w = {}; for (const [sl, v] of Object.entries(o)) { w[sl] = { oldValue: les(sl), newValue: v }; localStorage.setItem(P + sl, JSON.stringify(v)); } luisteraars.forEach((f) => f(w, 'local')); },
      async remove(s) { for (const sl of [].concat(s)) localStorage.removeItem(P + sl); },
    };
    window.chrome = { storage: { local, onChanged: { addListener: (f) => luisteraars.push(f) } }, runtime: { getManifest: () => ({ version: '2.4.4' }), id: 'nep', sendMessage: () => Promise.resolve() } };
  };
  const VR = (extra) => ({ server: SERVER, id: IDS.A, token: 'geheim', privJwk: {}, pub: 'p', vrienden: [{ id: IDS.B, pub: 'p', alias: 'Sam', status: 'vriend' }, { id: IDS.C, pub: 'p', alias: 'Noor', status: 'vriend' }], reacties: {}, gokken: {}, raden: [] });
  const GAL = [kaart('p1', 'Wiskunde', 7.2, 5000), kaart('p2', 'Engels', 6.0, 4000), kaart('p3', 'Geschiedenis', 8.1, 3000)];
  async function nieuw(br, zaad, breed) {
    const ctx = await br.newContext({ viewport: { width: breed || 1000, height: 900 } });
    await ctx.addInitScript(NEP, { zaad });
    const verzoeken = [];
    await ctx.route(/jummysnacks\.nl/, (route) => { verzoeken.push(route.request().postData()); return route.abort(); });
    const p = await ctx.newPage();
    const fouten = [];
    p.on('pageerror', (e) => fouten.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/jummysnacks|ERR_FAILED|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    return { ctx, p, fouten, verzoeken };
  }
  const opslag = (p, sl) => p.evaluate((x) => { const t = localStorage.getItem('mock:' + x); return t == null ? undefined : JSON.parse(t); }, sl);
  const br = await chromium.launch();
  try {
    {
      const tidA = '1234567890abcdef', tidB = 'fedcba0987654321';
      const zaad = { spo_vrienden: VR(), spo_galerij: GAL, spo_profiel: { bijnaam: 'Pip', deel: true }, spo_munten: MUNTEN(0),
        spo_tweeling: { v: 1, kaarten: {}, verzoeken: { [tidA]: { van: IDS.B, b: T.band(7.2), g: 'exact', ts: Date.now() } }, seq: {}, betaald: {} } };
      const { ctx, p, fouten } = await nieuw(br, zaad);
      await p.goto(WEB + '/vrienden.html'); await p.waitForSelector('#tweeling-sectie:not([hidden])', { timeout: 8000 });
      const sec = p.locator('#tweeling-sectie');
      controle('vrienden: de sectie is een benoemd gebied met kop', (await sec.getAttribute('aria-labelledby')) === 'tw-titel' && /Tweelingkaarten/.test(await sec.locator('#tw-titel').innerText()));
      controle('vrienden: uitleg noemt 0,3 verschil, wederzijds, beloning en maximum', /0,3 verschil/.test(await sec.innerText()) && /ja zegt/.test(await sec.innerText()) && /25 munten/.test(await sec.innerText()) && /5 tweelingkaarten/.test(await sec.innerText()));
      const vz = sec.locator('.tw-verzoek');
      controle('vrienden: het voorstel van Sam met band en groep, zonder vak', (await vz.count()) === 1 && /Sam stelt een tweelingkaart voor/.test(await vz.innerText()) && /7,0 tot 7,3/.test(await vz.innerText()) && /exacte vakken/.test(await vz.innerText()));
      controle('vrienden: alleen mijn passende kaart (Wiskunde 7,2) staat in de lijst', (await vz.locator('select option').count()) === 1 && /Wiskunde 7,2/.test(await vz.locator('select').innerText()));
      controle('vrienden: de keuzelijst heeft een label', !!(await vz.locator('select').getAttribute('id')) && (await vz.locator('label').getAttribute('for')) === (await vz.locator('select').getAttribute('id')));
      controle('vrienden: de knoppen hebben een duidelijke naam', (await vz.getByRole('button', { name: 'Tweelingkaart maken met Sam' }).count()) === 1 && (await vz.getByRole('button', { name: 'Voorstel van Sam weigeren' }).count()) === 1);
      // een nieuw voorstel: het formulier zegt precies wat er gedeeld wordt
      const form = sec.locator('.tw-form');
      controle('vrienden: formulier toont wat er gedeeld wordt (band en soort vak, niet vak of cijfer)', /Je deelt alleen: de cijferband/.test(await form.locator('.tw-deelt').innerText()) && /Niet je vak, niet je exacte cijfer/.test(await form.locator('.tw-deelt').innerText()));
      controle('vrienden: de uitleg bij het formulier wordt voorgelezen (role status)', (await form.locator('.tw-deelt').getAttribute('role')) === 'status');
      controle('vrienden: geen tekstvelden in de sectie', (await sec.locator('input, textarea').count()) === 0);
      // accepteren
      await vz.getByRole('button', { name: 'Tweelingkaart maken met Sam' }).click(); await slaap(400);
      const na = await opslag(p, 'spo_tweeling');
      controle('vrienden: accepteren maakt een actieve tweelingkaart met mijn kaart p1', Object.keys(na.verzoeken).length === 0 && na.kaarten[tidA] && na.kaarten[tidA].status === 'actief' && na.kaarten[tidA].eigen === 'p1' && na.kaarten[tidA].rol === 'antwoord', na);
      const kaartLi = sec.locator('.tw-kaart.actief');
      controle('vrienden: de tweelingkaart toont beide avatars (P van Pip, S van Sam) en alleen band en groep', (await kaartLi.count()) === 1 && (await kaartLi.locator('.tw-avatar').allInnerTexts()).join() === 'P,S' && /Tweelingkaart: Pip en Sam/.test(await kaartLi.innerText()) && /Gedeeld: alleen de band 7,0 tot 7,3 en exacte vakken/.test(await kaartLi.innerText()), await kaartLi.innerText());
      controle('vrienden: de avatars zijn verborgen voor schermlezers (de naam staat in de tekst)', (await kaartLi.locator('.tw-avatar[aria-hidden="true"]').count()) === 2);
      // nieuw voorstel aan Noor met kaart p3 (Geschiedenis 8,1)
      await p.selectOption('#tw-vriend', IDS.C);
      await p.selectOption('#tw-kaart', 'p3');
      controle('vrienden: p1 zit al in een tweelingkaart en staat niet meer in het formulier', (await p.locator('#tw-kaart option').allInnerTexts()).every((t) => !/Wiskunde/.test(t)));
      controle('vrienden: de uitleg past zich aan (mens en maatschappij, 7,8 tot 8,1)', /7,8 tot 8,1/.test(await p.locator('.tw-deelt').innerText()) && /mens en maatschappij/.test(await p.locator('.tw-deelt').innerText()), await p.locator('.tw-deelt').innerText());
      await p.getByRole('button', { name: 'Voorstel versturen' }).click(); await slaap(400);
      const na2 = await opslag(p, 'spo_tweeling');
      const nieuwId = Object.keys(na2.kaarten).find((k) => k !== tidA);
      controle('vrienden: het voorstel staat als verzonden in de opslag, met mijn kaart p3', nieuwId && na2.kaarten[nieuwId].status === 'verzonden' && na2.kaarten[nieuwId].eigen === 'p3' && na2.kaarten[nieuwId].vriend === IDS.C && na2.kaarten[nieuwId].g === 'mens', na2);
      controle('vrienden: de melding en het wachten op antwoord staan er', /Wachten tot Noor ja zegt/.test(await sec.innerText()));
      // weghalen met bevestiging (twee klikken)
      const weg = sec.locator('.tw-kaart.actief').getByRole('button', { name: /weghalen/ });
      await weg.click();
      controle('vrienden: weghalen vraagt eerst "Zeker weten?"', /Zeker weten/.test(await weg.innerText()) && (await opslag(p, 'spo_tweeling')).kaarten[tidA] !== undefined);
      await weg.click(); await slaap(400);
      controle('vrienden: na bevestigen is de tweelingkaart weg', (await opslag(p, 'spo_tweeling')).kaarten[tidA] === undefined && (await sec.locator('.tw-kaart.actief').count()) === 0);
      controle('vrienden: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    {
      // maximum bereikt: geen formulier meer, wel uitleg
      const kaarten = {}; for (let i = 0; i < 5; i++) kaarten[(i + 1).toString(16).padStart(16, '0')] = { vriend: IDS.B, rol: 'vraag', status: 'actief', eigen: 'q' + i, b: 3, g: 'exact', naam: 'Sam', sinds: 100 + i, laatst: Date.now(), bevestigd: true, beloond: true };
      const { ctx, p } = await nieuw(br, { spo_vrienden: VR(), spo_galerij: GAL, spo_tweeling: { v: 1, kaarten, verzoeken: {}, seq: {}, betaald: {} } });
      await p.goto(WEB + '/vrienden.html'); await p.waitForSelector('#tweeling-sectie:not([hidden])', { timeout: 8000 });
      controle('vrienden: bij 5 tweelingkaarten geen formulier, wel uitleg over het maximum', (await p.locator('.tw-form').count()) === 0 && /maximum/.test(await p.locator('#tweeling-sectie').innerText()) && (await p.locator('.tw-kaart').count()) === 5);
      await ctx.close();
    }
    {
      // geen vrienden: de sectie blijft verborgen
      const { ctx, p } = await nieuw(br, { spo_vrienden: Object.assign(VR(), { vrienden: [] }), spo_galerij: GAL });
      await p.goto(WEB + '/vrienden.html'); await slaap(1200);
      controle('vrienden: zonder vrienden en zonder tweelingkaarten is de sectie verborgen', await p.locator('#tweeling-sectie').isHidden());
      await ctx.close();
    }
    {
      // galerij: de badge en de tekst in het detailvenster
      const tidA = '1234567890abcdef';
      const { ctx, p, fouten } = await nieuw(br, { spo_galerij: GAL.map((e) => Object.assign({ kaart: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }, e)), spo_profiel: { bijnaam: 'Pip' },
        spo_tweeling: { v: 1, kaarten: { [tidA]: { vriend: IDS.B, rol: 'vraag', status: 'actief', eigen: 'p1', b: 3, g: 'exact', naam: 'Sam', sinds: 1, laatst: 1, bevestigd: true, beloond: true }, '2222222222222222': { vriend: IDS.C, rol: 'vraag', status: 'verzonden', eigen: 'p2', b: 3, g: 'talen', naam: 'Noor', sinds: 1, laatst: 1, bevestigd: false, beloond: false } }, verzoeken: {}, seq: {}, betaald: {} } });
      await p.goto(WEB + '/galerij.html'); await p.waitForSelector('#raster .item', { timeout: 8000 }); await slaap(300);
      const badges = p.locator('#raster .tw-badge');
      controle('galerij: precies één kaart heeft een tweeling-badge (de actieve, niet het openstaande voorstel)', (await badges.count()) === 1);
      controle('galerij: de badge toont beide avatars (P en S) en het woord TWEELING', (await badges.locator('.tw-avatar').allInnerTexts()).join() === 'P,S' && /TWEELING/.test(await badges.innerText()) && (await badges.getAttribute('title')) === 'Tweelingkaart met Sam');
      const item = p.locator('#raster .item', { has: p.locator('.tw-badge') });
      controle('galerij: de knop noemt de tweelingkaart voor schermlezers', /tweelingkaart met Sam/.test(await item.getAttribute('aria-label')), await item.getAttribute('aria-label'));
      await item.click(); await slaap(300);
      controle('galerij: het detailvenster toont "Tweelingkaart: Pip en Sam"', (await p.locator('#d-tweeling').isVisible()) && (await p.locator('#d-tweeling').innerText()) === 'Tweelingkaart: Pip en Sam', await p.locator('#d-tweeling').innerText());
      await p.keyboard.press('Escape'); await slaap(200);
      await p.locator('#raster .item').nth(1).click(); await slaap(300);
      controle('galerij: een gewone kaart toont geen tweelingregel', await p.locator('#d-tweeling').isHidden());
      controle('galerij: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    {
      // XSS in de vriendennaam in de opslag: wordt als tekst getoond
      const { ctx, p } = await nieuw(br, { spo_galerij: GAL.map((e) => Object.assign({ kaart: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }, e)),
        spo_tweeling: { v: 1, kaarten: { '1234567890abcdef': { vriend: IDS.B, rol: 'vraag', status: 'actief', eigen: 'p1', b: 3, g: 'exact', naam: '<img src=x onerror=alert(1)>', sinds: 1, laatst: 1, bevestigd: true, beloond: true } }, verzoeken: {}, seq: {}, betaald: {} } });
      await p.goto(WEB + '/galerij.html'); await p.waitForSelector('#raster .item', { timeout: 8000 }); await slaap(300);
      controle('galerij: een naam met html/rommel wordt nooit als element getoond', (await p.locator('#raster img[onerror], .tw-badge img').count()) === 0);
      await ctx.close();
    }
  } finally {
    await br.close();
    web.kill();
  }
  console.log(`v3-tweeling.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.log('FOUT', e); process.exit(1); });
