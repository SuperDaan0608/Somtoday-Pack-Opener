// Servertest: start `php -S` met een SQLite-config en doorloopt de hele flow met twee gesimuleerde gebruikers.
// Gebruik: node server/test/api.test.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
// Node heeft geen localStorage: kleine terugval in het geheugen voor de opslag in vriendenlib.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require('../../extension/vriendenlib.js');

const MAP = path.resolve(__dirname, '..');
const TMP = process.env.SPO_TMP || '/tmp/vrienden-scratch';
fs.mkdirSync(TMP, { recursive: true });
let ok = 0, mis = 0;
function controle(naam, waar, extra) { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

function start(port, db, env) {
  const p = spawn('php', ['-S', 'localhost:' + port, '-t', MAP], {
    env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: db }, env), stdio: 'ignore' });
  return p;
}
async function wacht(url) {
  for (let i = 0; i < 50; i++) { try { await fetch(url, { method: 'OPTIONS' }); return; } catch (e) { await slaap(100); } }
  throw new Error('server start niet');
}
async function schema(db) {
  try { fs.unlinkSync(db); } catch (e) { /* bestond niet */ }
  // Schema laden met php (PDO sqlite) zodat schema.sql echt getest wordt.
  const sql = fs.readFileSync(path.join(MAP, 'schema.sql'), 'utf8');
  const f = path.join(TMP, 'schema.php');
  fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2])); $d->exec(file_get_contents($argv[2])); /* twee keer: herhaalbaar */`);
  fs.writeFileSync(path.join(TMP, 'schema.sqlite.sql'), sql);
  await new Promise((res, rej) => spawn('php', [f, db, path.join(TMP, 'schema.sqlite.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res())));
}
async function ruw(url, body, headers, ruwTekst) {
  const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: ruwTekst !== undefined ? ruwTekst : JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) { /* leeg */ }
  return { s: r.status, j };
}

(async () => {
  const DB = path.join(TMP, 'api.sqlite');
  const URL1 = 'http://localhost:8150/api.php';
  await schema(DB);
  const php = start(8150, DB, {});
  const php2 = start(8151, path.join(TMP, 'streng.sqlite'), { SPO_LIMIET: '10', SPO_REGLIMIET: '3' });
  const php3 = start(8152, path.join(TMP, 'user.sqlite'), { SPO_LIMIET_USER: '8', SPO_LIMIET_REL: '5' });
  const BDB = path.join(TMP, 'beheer.sqlite'), BDB2 = path.join(TMP, 'beheer2.sqlite');
  const SL = 'test-beheersleutel-0123456789abcdef';
  const URLB = 'http://localhost:8153/api.php', URLB2 = 'http://localhost:8154/api.php';
  const php4 = start(8153, BDB, { SPO_BEHEER: SL });
  const php5 = start(8154, BDB2, { SPO_BEHEER: SL, SPO_LIMIET_BEHEER: '5' });
  try {
    await schema(BDB); await schema(BDB2);
    await schema(path.join(TMP, 'user.sqlite'));
    await schema(path.join(TMP, 'streng.sqlite'));
    await wacht(URLB); await wacht(URLB2); await wacht(URL1); await wacht('http://localhost:8151/api.php'); await wacht('http://localhost:8152/api.php');

    const o = await fetch(URL1, { method: 'OPTIONS' });
    controle('OPTIONS 204', o.status === 204 && o.headers.get('access-control-allow-origin') === '*');

    // Gebruikers registreren met echte client-crypto
    async function maak(naam) {
      const sl = await L.maakSleutelpaar();
      const r = await L.maakClient(URL1).roep('register', { pub: sl.pub });
      controle('register ' + naam, /^[0-9a-f]{32}$/.test(r.id) && /^[0-9a-f]{64}$/.test(r.token));
      return { server: URL1, id: r.id, token: r.token, privJwk: sl.privJwk, pub: sl.pub, vrienden: [] };
    }
    const a = await maak('A'), b = await maak('B');
    const ca = L.clientVan(a), cb = L.clientVan(b);

    // Negatieve auth
    controle('geen token 401', (await ruw(URL1, { a: 'friends' })).s === 401);
    controle('fout token 401', (await ruw(URL1, { a: 'friends' }, { 'X-Id': a.id, 'X-Token': 'ff'.repeat(32) })).s === 401);
    controle('token van ander 401', (await ruw(URL1, { a: 'friends' }, { 'X-Id': a.id, 'X-Token': b.token })).s === 401);
    controle('onbekende id 401', (await ruw(URL1, { a: 'friends' }, { 'X-Id': '0'.repeat(32), 'X-Token': a.token })).s === 401);
    controle('register zonder pub 400', (await ruw(URL1, { a: 'register' })).s === 400);
    controle('onbekende actie 400', (await ruw(URL1, { a: 'foo' }, { 'X-Id': a.id, 'X-Token': a.token })).s === 400);
    controle('GET 405', (await fetch(URL1)).status === 405);

    // Niet-vriend en niet-bestaande ontvanger
    controle('put naar niet-vriend 403', (await ruw(URL1, { a: 'put', to: b.id, data: 'v1.aa.bb' }, { 'X-Id': a.id, 'X-Token': a.token })).s === 403);
    controle('request onbestaand 404', (await ruw(URL1, { a: 'request', to: 'a'.repeat(32) }, { 'X-Id': a.id, 'X-Token': a.token })).s === 404);
    controle('request zelf 400', (await ruw(URL1, { a: 'request', to: a.id }, { 'X-Id': a.id, 'X-Token': a.token })).s === 400);
    controle('request slechte id 400', (await ruw(URL1, { a: 'request', to: 'xyz' }, { 'X-Id': a.id, 'X-Token': a.token })).s === 400);

    // Vriendschap
    const code = L.leesCode(L.maakCode(b.id, b.pub));
    controle('vriendcode roundtrip', code && code.id === b.id && code.pub === b.pub);
    controle('vriendcode ongeldig', L.leesCode('SPO1-abc-def') === null);
    controle('request pending', (await ca.roep('request', { to: b.id })).status === 'pending');
    controle('request dubbel blijft pending', (await ca.roep('request', { to: b.id })).status === 'pending');
    const inb = await cb.roep('inbox');
    controle('inbox bevat A met pub', inb.verzoeken.length === 1 && inb.verzoeken[0].id === a.id && inb.verzoeken[0].pub === a.pub);
    controle('A inbox leeg', (await ca.roep('inbox')).verzoeken.length === 0);
    controle('friends leeg voor accept', (await ca.roep('friends')).vrienden.length === 0);
    controle('put tijdens pending 403', (await ruw(URL1, { a: 'put', to: b.id, data: 'v1.aa.bb' }, { 'X-Id': a.id, 'X-Token': a.token })).s === 403);
    controle('respond onbekend 404', (await ruw(URL1, { a: 'respond', from: 'b'.repeat(32), accept: true }, { 'X-Id': b.id, 'X-Token': b.token })).s === 404);
    controle('respond zonder bool 400', (await ruw(URL1, { a: 'respond', from: a.id, accept: 'ja' }, { 'X-Id': b.id, 'X-Token': b.token })).s === 400);
    await cb.roep('respond', { from: a.id, accept: true });
    const fa = (await ca.roep('friends')).vrienden, fb = (await cb.roep('friends')).vrienden;
    controle('beide vrienden', fa.length === 1 && fa[0].id === b.id && fa[0].pub === b.pub && fb.length === 1 && fb[0].id === a.id);

    // Versleutelde roundtrip
    const GEHEIM = ['8,73', 'Wiskunde-geheim-QZ', 'Onderwerp-geheim-XJ', 'Bijnaam-Sanne'];
    const kaarten = [{ id: 'k1', vak: GEHEIM[1], cijfer: 8.73, onderwerp: GEHEIM[2], weging: 2, ts: 1700000000000, tier: 2 }];
    a.vrienden = [{ id: b.id, pub: b.pub, alias: GEHEIM[3], status: 'vriend', deel: { modus: 'alles', ids: [] } }];
    await L.zetBlob(a, a.vrienden[0], kaarten);
    const bl = (await cb.roep('get')).blobs;
    controle('B krijgt 1 blob', bl.length === 1 && bl[0].owner === a.id && /^v1\.[\w-]+\.[\w-]+$/.test(bl[0].data));
    const kb = await L.deelSleutel(b.privJwk, a.pub, b.id, a.id);
    const p = await L.ontsleutel(kb, bl[0].data);
    controle('B ontsleutelt', p.v === 1 && p.kaarten[0].cijfer === 8.73 && p.kaarten[0].vak === GEHEIM[1] && !('kaart' in p.kaarten[0]));
    const kc = await L.deelSleutel((await L.maakSleutelpaar()).privJwk, a.pub, b.id, a.id);
    let faal = false; try { await L.ontsleutel(kc, bl[0].data); } catch (e) { faal = true; }
    controle('onbevoegde sleutel faalt', faal);
    const kapot = bl[0].data.slice(0, -4) + 'AAAA';
    faal = false; try { await L.ontsleutel(kb, kapot); } catch (e) { faal = true; }
    controle('geknoeide blob faalt', faal);
    controle('A ziet eigen blob niet in get', (await ca.roep('get')).blobs.length === 0);
    // selectie en niets
    a.vrienden[0].deel = { modus: 'selectie', ids: ['bestaat-niet'] };
    await L.zetBlob(a, a.vrienden[0], kaarten);
    controle('selectie zonder treffers = verwijderd', (await cb.roep('get')).blobs.length === 0);
    a.vrienden[0].deel = { modus: 'selectie', ids: ['k1'] };
    await L.zetBlob(a, a.vrienden[0], kaarten);
    controle('selectie met treffer = blob', (await cb.roep('get')).blobs.length === 1);
    // volledige synchronisatie via lib
    b.vrienden = [{ id: a.id, pub: a.pub, alias: 'A', status: 'vriend', deel: { modus: 'niets', ids: [] } }];
    const s = await L.synchroniseer(b, []);
    controle('synchroniseer geeft kaarten van A', s.kaarten[a.id] && s.kaarten[a.id].kaarten[0].cijfer === 8.73);

    // Veiligheidscode
    const v1 = await L.veiligheidscode(a.pub, b.pub), v2 = await L.veiligheidscode(b.pub, a.pub);
    controle('veiligheidscode symmetrisch en 6x5 cijfers', v1 === v2 && /^(\d{5} ){5}\d{5}$/.test(v1), v1);
    controle('veiligheidscode verschilt per paar', v1 !== await L.veiligheidscode(a.pub, (await L.maakSleutelpaar()).pub));
    controle('schema.sql herhaalbaar zonder MySQL-ongeldigheden', !/CREATE INDEX/i.test(fs.readFileSync(path.join(MAP, 'schema.sql'), 'utf8')));
    controle('server-constante', /SERVER_STANDAARD = 'https:\/\/jummysnacks\.nl\/api\.php'/.test(fs.readFileSync(path.join(MAP, '../extension/vriendenlib.js'), 'utf8')));

    // Grootte
    const groot = 'A'.repeat(96 * 1024 + 1);
    controle('blob >96KB 413', (await ruw(URL1, { a: 'put', to: b.id, data: groot }, { 'X-Id': a.id, 'X-Token': a.token })).s === 413);
    controle('body >128KB 413', (await ruw(URL1, null, { 'X-Id': a.id, 'X-Token': a.token }, JSON.stringify({ a: 'put', to: b.id, data: 'A'.repeat(140000) }))).s === 413);
    controle('ongeldige json 400', (await ruw(URL1, null, {}, '{kapot')).s === 400);
    controle('data met rare tekens 400', (await ruw(URL1, { a: 'put', to: b.id, data: '<script>alert(1)</script>' }, { 'X-Id': a.id, 'X-Token': a.token })).s === 400);
    const max = 'A'.repeat(96 * 1024);
    controle('blob precies 96KB ok', (await ruw(URL1, { a: 'put', to: b.id, data: max }, { 'X-Id': a.id, 'X-Token': a.token })).s === 200);
    await L.zetBlob(a, a.vrienden[0], kaarten);

    // Privacy: database doorzoeken
    await slaap(50);
    const dump = path.join(TMP, 'dump.php');
    fs.writeFileSync(dump, `<?php $d=new PDO('sqlite:'.$argv[1]); foreach(['users','friendships','blobs','ratelimit'] as $t){ foreach($d->query("SELECT * FROM $t") as $r) echo json_encode($r),"\\n"; }`);
    const uit = await new Promise((res) => { let t = ''; const c = spawn('php', [dump, DB]); c.stdout.on('data', (d) => (t += d)); c.on('exit', () => res(t)); });
    controle('db heeft rijen', uit.includes(a.id));
    for (const g of GEHEIM.concat(['8.73', 'Wiskunde', 'Onderwerp'])) controle('db bevat geen "' + g + '"', !uit.includes(g));
    controle('db bevat token niet', !uit.includes(a.token) && !uit.includes(b.token));
    controle('db bevat ip niet', !uit.includes('127.0.0.1') && !uit.includes('::1'));

    // Unfriend
    await ca.roep('unfriend', { other: b.id });
    controle('unfriend: friends leeg', (await cb.roep('friends')).vrienden.length === 0);
    controle('unfriend: blobs weg', (await cb.roep('get')).blobs.length === 0);
    const w = await L.synchroniseer(b, []);
    controle('lib markeert weggevallen', b.vrienden[0].status === 'weggevallen' && w.meldingen.some((m) => /geen vriend meer/.test(m)));
    controle('put na unfriend 403', (await ruw(URL1, { a: 'put', to: b.id, data: 'v1.aa.bb' }, { 'X-Id': a.id, 'X-Token': a.token })).s === 403);

    // Omgekeerd verzoek wordt automatisch geaccepteerd
    await ca.roep('request', { to: b.id });
    controle('omgekeerd verzoek accepteert', (await cb.roep('request', { to: a.id })).status === 'accepted');
    // Weigeren
    const c3 = await maak('C'); const cc = L.clientVan(c3);
    await cc.roep('request', { to: a.id });
    await ca.roep('respond', { from: c3.id, accept: false });
    controle('geweigerd: inbox leeg', (await ca.roep('inbox')).verzoeken.length === 0);

    // deleteAccount
    await cb.roep('deleteAccount');
    controle('na delete 401', (await ruw(URL1, { a: 'friends' }, { 'X-Id': b.id, 'X-Token': b.token })).s === 401);
    controle('na delete A heeft geen vrienden', (await ca.roep('friends')).vrienden.length === 0);

    // ===================== Reacties en 'voorspel mijn cijfer' (twee clients, echte crypto, echte server) =====================
    // A reageert en gokt, B is de eigenaar van kaarten en rondes, C is een tweede vriend van B (en later een kwaadwillende vriend).
    const VUUR = L.REACTIES[0].emoji, HART = L.REACTIES[5].emoji, SCHEDEL = L.REACTIES[4].emoji;
    controle('emoji-lijst: 6 vaste emoji', L.REACTIES.length === 6 && ['\u{1F525}', '\u{1F62E}', '\u{1F44F}', '\u{1F602}', '\u{1F480}', '\u2764\uFE0F'].every((e, i) => L.REACTIES[i].emoji === e));
    const RA = await maak('RA'), RB = await maak('RB'), RC = await maak('RC');
    const cRA = L.clientVan(RA), cRB = L.clientVan(RB), cRC = L.clientVan(RC);
    const ALIAS = { aVoorB: 'Anna-Alias-KW', bVoorA: 'Bo-Alias-MV', cVoorB: 'Cas-Alias-HP' };
    async function bevriend(x, y, aliasVanYBijX, aliasVanXBijY) {
      await L.verzoek(x, L.maakCode(y.id, y.pub), aliasVanYBijX);
      await L.synchroniseer(y, []);
      await L.antwoord(y, x.id, true, aliasVanXBijY);
      await L.synchroniseer(x, []);
    }
    await bevriend(RA, RB, ALIAS.bVoorA, ALIAS.aVoorB);
    await bevriend(RC, RB, 'Bo-bij-C', ALIAS.cVoorB);
    const vA = RA.vrienden.find((v) => v.id === RB.id), vB_A = RB.vrienden.find((v) => v.id === RA.id), vB_C = RB.vrienden.find((v) => v.id === RC.id), vC = RC.vrienden.find((v) => v.id === RB.id);
    controle('start: toestand heeft reacties, gokken en raden', RA.reacties && RA.gokken && Array.isArray(RA.raden));
    const gal = [
      { id: 'bk1', ts: 1700000000000, vak: 'Scheikunde-QX', cijfer: 6.8, onderwerp: 'Redox-QY', weging: 2, tier: 1, kaart: 'data:image/png;base64,AAAA' },
      { id: 'bk2', ts: 1700000100000, vak: 'Frans-QX', cijfer: 5.5, onderwerp: 'Toets-QY', weging: 1, tier: 0, kaart: 'data:image/png;base64,AAAA' },
    ];
    vB_A.deel = { modus: 'alles', ids: [] };
    await L.synchroniseer(RB, gal);
    const ontv0 = (await L.synchroniseer(RA, [])).kaarten[RB.id];
    controle('A ziet kaarten van B; ontbrekende velden zijn leeg (oud formaat blijft werken)', ontv0.kaarten.length === 2 && !Object.keys(ontv0.reacties).length && ontv0.raden.length === 0 && !Object.keys(ontv0.gokken).length);

    // --- Reactie A -> B ---
    controle('reactie zetten geeft de emoji terug', L.zetReactie(RA, RB.id, 'bk1', VUUR) === VUUR);
    controle('dezelfde emoji nog eens haalt de reactie weg', L.zetReactie(RA, RB.id, 'bk1', VUUR) === null && !L.eigen(RA.reacties, RB.id));
    controle('andere emoji vervangt (max. 1 per kaart)', L.zetReactie(RA, RB.id, 'bk1', HART) === HART && L.zetReactie(RA, RB.id, 'bk1', VUUR) === VUUR && Object.keys(RA.reacties[RB.id]).length === 1);
    let weigerde = 0;
    for (const [k, e] of [['bk1', '\u{1F595}'], ['bk1', '<b>x</b>'], ['__proto__', VUUR], ['a b', VUUR], ['x'.repeat(65), VUUR]]) { try { L.zetReactie(RA, RB.id, k, e); } catch (err) { weigerde++; } }
    controle('ongeldige emoji of kaart-id wordt geweigerd', weigerde === 5, weigerde);
    controle('reactie op onbekende vriend geweigerd', (() => { try { L.zetReactie(RA, 'f'.repeat(32), 'bk1', VUUR); return false; } catch (e) { return true; } })());
    await L.synchroniseer(RA, []); // A deelt zelf niets, maar de blob bestaat nu toch (alleen reacties)
    const blobRaw = (await cRB.roep('get')).blobs.find((b) => b.owner === RA.id);
    const kRB_A = await L.deelSleutel(RB.privJwk, RA.pub, RB.id, RA.id);
    const pRaw = blobRaw ? await L.ontsleutel(kRB_A, blobRaw.data) : null;
    controle('blob met alleen een reactie wordt gezet (niet gewist)', !!pRaw && pRaw.v === 1 && Array.isArray(pRaw.kaarten) && pRaw.kaarten.length === 0 && pRaw.reacties.bk1 === VUUR);
    controle('optionele velden ontbreken als ze leeg zijn; oude client kan hem nog lezen', pRaw && !('raden' in pRaw) && !('gokken' in pRaw) && pRaw.v === 1 && Array.isArray(pRaw.kaarten));
    const sB1 = await L.synchroniseer(RB, gal);
    const r1 = L.reactiesOpMijnKaarten(RB, gal, sB1.kaarten);
    controle('B ziet reactie van A, met zijn eigen bijnaam voor A', r1.length === 1 && r1[0].kaart.id === 'bk1' && r1[0].reacties.length === 1 && r1[0].reacties[0].naam === ALIAS.aVoorB && r1[0].reacties[0].emoji === VUUR, JSON.stringify(r1));
    controle('bijnaam van A zelf (hoe A zichzelf noemt) komt nergens in de reactie voor', !JSON.stringify(sB1.kaarten[RA.id]).includes(ALIAS.bVoorA));
    // C reageert ook, maar B deelt niets met C: telt niet mee. Pas na delen verschijnt C.
    L.zetReactie(RC, RB.id, 'bk1', SCHEDEL); await L.synchroniseer(RC, []);
    let sB2 = await L.synchroniseer(RB, gal);
    controle('reactie van vriend aan wie de kaart niet gedeeld wordt, telt niet', L.reactiesOpMijnKaarten(RB, gal, sB2.kaarten)[0].reacties.length === 1);
    vB_C.deel = { modus: 'selectie', ids: ['bk1'] };
    sB2 = await L.synchroniseer(RB, gal);
    const r2 = L.reactiesOpMijnKaarten(RB, gal, sB2.kaarten);
    controle('na delen telt de reactie van C wel, alleen op die kaart', r2.length === 1 && r2[0].reacties.map((x) => x.naam).join() === [ALIAS.aVoorB, ALIAS.cVoorB].sort((a, b) => a.localeCompare(b, 'nl')).join() && r2[0].reacties.some((x) => x.emoji === SCHEDEL));
    vB_C.deel = { modus: 'niets', ids: [] };
    L.zetReactie(RC, RB.id, 'bk1', SCHEDEL); // C haalt zijn reactie weg
    await L.synchroniseer(RC, []);

    const lees0 = async (x, van) => L.ontsleutel(await L.deelSleutel(x.privJwk, van.pub, x.id, van.id), (await L.clientVan(x).roep('get')).blobs.find((b) => b.owner === van.id).data);
    // --- Ronde van B voor A (en C) ---
    const sigQ = 'sigQZ1abc';
    const dichtItem = { id: sigQ, ts: 1700000200000, vak: 'Wiskunde-QZ', onderwerp: 'Onderwerp-JK', weging: 2 };
    const ronde = L.startRonde(RB, dichtItem, [RA.id, RC.id, RA.id, 'e'.repeat(32)]);
    controle('ronde: rid is 16 willekeurige bytes als hex en heeft niets met de sig te maken', /^[0-9a-f]{32}$/.test(ronde.rid) && ronde.rid !== sigQ && !ronde.rid.includes(sigQ) && !sigQ.includes(ronde.rid));
    controle('ronde: alleen echte vrienden in naar, zonder dubbelen', ronde.naar.length === 2 && ronde.naar.includes(RA.id) && ronde.naar.includes(RC.id) && ronde.uitslagGedeeld === false);
    controle('ronde dubbel voor hetzelfde cijfer geweigerd', (() => { try { L.startRonde(RB, dichtItem, [RA.id]); return false; } catch (e) { return /loopt al/.test(e.message); } })());
    controle('ronde zonder vrienden geweigerd', (() => { try { L.startRonde(RB, { id: 'sigX', vak: 'Vak', onderwerp: '', weging: 1, ts: 1 }, []); return false; } catch (e) { return /minstens één/.test(e.message); } })());
    controle('ronde voor niet-vriend geweigerd', (() => { try { L.startRonde(RB, { id: 'sigX', vak: 'Vak', onderwerp: '', weging: 1, ts: 1 }, ['d'.repeat(32)]); return false; } catch (e) { return /minstens één/.test(e.message); } })());
    await L.zetBlobs(RB, ronde.naar, gal);
    const sA1 = await L.synchroniseer(RA, []);
    const rA = sA1.kaarten[RB.id].raden;
    controle('A ziet de ronde met vak, onderwerp en weging, zonder uitslag', rA.length === 1 && rA[0].rid === ronde.rid && rA[0].vak === 'Wiskunde-QZ' && rA[0].onderwerp === 'Onderwerp-JK' && rA[0].weging === 2 && !('uitslag' in rA[0]));
    controle('ronde bevat precies rid, vak, onderwerp, weging, ts (geen sig, geen cijfer)', Object.keys(rA[0]).sort().join() === 'onderwerp,rid,ts,vak,weging');
    const pBlobVoorA = await L.ontsleutel(await L.deelSleutel(RA.privJwk, RB.pub, RA.id, RB.id), (await cRA.roep('get')).blobs.find((b) => b.owner === RB.id).data);
    controle('de ontsleutelde blob bevat de sig van het cijfer nergens', !JSON.stringify(pBlobVoorA).includes(sigQ));
    controle('de rondes in de blob hebben geen cijfer en geen uitslag', !('uitslag' in pBlobVoorA.raden[0]) && !JSON.stringify(pBlobVoorA.raden).includes('cijfer'));

    // gok van A, aanpassen, ongeldige gokken
    controle('gok 7,0 opgeslagen', L.slaGokOp(RA, RB.id, ronde.rid, '7,0') === 7);
    await L.zetBlob(RA, vA, []);
    let haal = (await L.haalOp(RB)).kaarten;
    controle('B ziet de gok van A', haal[RA.id].gokken[ronde.rid] === 7, JSON.stringify(haal[RA.id]));
    controle('gok aanpassen (7.2)', L.slaGokOp(RA, RB.id, ronde.rid, 7.2) === 7.2);
    await L.zetBlob(RA, vA, []);
    haal = (await L.haalOp(RB)).kaarten;
    controle('B ziet de aangepaste gok', haal[RA.id].gokken[ronde.rid] === 7.2);
    controle('ongeldige gokken geweigerd (0,9; 10,1; tekst; 7,25; NaN; leeg)', ['0,9', '10,1', 'zeven', '7,25', NaN, ''].every((g) => { try { L.slaGokOp(RA, RB.id, ronde.rid, g); return false; } catch (e) { return true; } }));
    controle('gok 1 en 10 mogen', L.leesGok('1') === 1 && L.leesGok('10') === 10 && L.leesGok('7.3') === 7.3 && L.leesGok(' 7,3 ') === 7.3);
    controle('gok op ongeldige rid geweigerd', (() => { try { L.slaGokOp(RA, RB.id, 'niet-hex', 7); return false; } catch (e) { return true; } })());
    L.slaGokOp(RC, RB.id, ronde.rid, 6); await L.zetBlob(RC, vC, []);
    haal = (await L.haalOp(RB)).kaarten;
    controle('B ziet de gok van C ook, per vriend apart', haal[RC.id].gokken[ronde.rid] === 6 && haal[RA.id].gokken[ronde.rid] === 7.2);

    // uitslag pas als het cijfer in de galerij staat
    let dichtFout = '';
    try { await L.deelUitslag(RB, ronde.rid, gal); } catch (e) { dichtFout = e.message; }
    controle('uitslag delen kan niet zolang het cijfer niet in de galerij staat', /nog dicht/.test(dichtFout) && RB.raden[0].uitslagGedeeld === false, dichtFout);
    // B opent het cijfer. A mag 'alles' zien, maar de kaart van een lopende ronde blijft achter tot B de uitslag deelt.
    const galOpen = [{ id: sigQ, ts: 1700000300000, vak: 'Wiskunde-QZ', cijfer: 7.3, onderwerp: 'Onderwerp-JK', weging: 2, tier: 1, kaart: 'data:image/png;base64,AAAA' }].concat(gal);
    controle('deel-modus van A is nog steeds alles', vB_A.deel.modus === 'alles');
    await L.synchroniseer(RB, galOpen);
    const sA2 = await L.synchroniseer(RA, []);
    controle('geopend maar nog niet gedeeld: A ziet het cijfer niet, ook al deelt B "alles" (kaart blijft achter)', !('uitslag' in sA2.kaarten[RB.id].raden[0]) && !sA2.kaarten[RB.id].kaarten.some((k) => k.id === sigQ) && sA2.kaarten[RB.id].kaarten.length === 2, JSON.stringify(sA2.kaarten[RB.id].kaarten.map((k) => k.id)));
    controle('...ook C (niet in de modus alles) en alle andere vrienden uit de ronde krijgen de kaart niet', !L.deelbareKaarten(RB, { id: RC.id, deel: { modus: 'alles' } }, galOpen).some((k) => k.id === sigQ) && L.deelbareKaarten(RB, { id: 'f'.repeat(32), deel: { modus: 'alles' } }, galOpen).some((k) => k.id === sigQ));
    controle('...en het cijfer 7,3 staat dan nergens in de blob voor A', !JSON.stringify(await lees0(RA, RB)).includes('7.3'));
    const rl = L.ranglijst(RB.raden[0], 7.3, haal);
    controle('ranglijst: A (0,1 ernaast) voor C (1,3), dichtst = A', rl.lijst.map((x) => x.id).join() === [RA.id, RC.id].join() && rl.lijst[0].verschil === 0.1 && rl.lijst[1].verschil === 1.3 && rl.dichtst.join() === RA.id && rl.verschil === 0.1, JSON.stringify(rl));
    controle('ranglijst: gelijkspel geeft allemaal dichtst', L.ranglijst({ rid: 'r', naar: ['p', 'q'] }, 7, { p: { gokken: { r: 6.5 } }, q: { gokken: { r: 7.5 } } }).dichtst.join() === 'p,q');
    controle('ranglijst: geen gok = niemand dichtst', L.ranglijst({ rid: 'r', naar: ['p'] }, 7, { p: { gokken: {} } }).dichtst.length === 0);
    controle('ranglijst: vriend die niet in naar staat telt niet mee', L.ranglijst({ rid: 'r', naar: ['p'] }, 7, { p: { gokken: { r: 3 } }, hacker: { gokken: { r: 7 } } }).dichtst.join() === 'p');
    const klaar = await L.deelUitslag(RB, ronde.rid, galOpen);
    controle('uitslag gedeeld: vastgelegd in de ronde', RB.raden[0].uitslagGedeeld === true && RB.raden[0].uitslag.cijfer === 7.3 && RB.raden[0].uitslag.dichtst.join() === RA.id && klaar.kaarten[RA.id].gokken[ronde.rid] === 7.2);
    const sA3 = await L.synchroniseer(RA, []), sC3 = await L.synchroniseer(RC, []);
    const uA = sA3.kaarten[RB.id].raden[0].uitslag, uC = sC3.kaarten[RB.id].raden[0].uitslag;
    controle('A ziet de uitslag: cijfer 7,3 en dichtst = waar', uA && uA.cijfer === 7.3 && uA.dichtst === true, JSON.stringify(uA));
    controle('C ziet de uitslag: cijfer 7,3 en dichtst = onwaar', uC && uC.cijfer === 7.3 && uC.dichtst === false, JSON.stringify(uC));
    controle('na de uitslag gaat de kaart gewoon mee volgens de deel-modus (A: alles), C niet', sA3.kaarten[RB.id].kaarten.some((k) => k.id === sigQ && k.cijfer === 7.3) && !sC3.kaarten[RB.id].kaarten.some((k) => k.id === sigQ));
    controle('gok van A staat nog lokaal (voor "Jij gokte 7,2")', RA.gokken[RB.id][ronde.rid] === 7.2);
    controle('tweede keer uitslag delen doet niets nieuws', (await L.deelUitslag(RB, ronde.rid, galOpen)).kaarten === null);

    // --- Een ronde bereikt alleen de vrienden uit `naar` ---
    const ronde2 = L.startRonde(RB, { id: 'sigQ2', ts: 1700000400000, vak: 'Alleen-Voor-A-ZZ', onderwerp: 'Onderwerp-Twee-ZZ', weging: 1 }, [RA.id]);
    RB.raden.push({ rid: L.maakRid(), sig: 'sigZ3', vak: 'Naar-Niemand-ZZ', onderwerp: 'x', weging: 1, ts: Date.now(), naar: [], uitslagGedeeld: false });
    RB.raden.push({ rid: L.maakRid(), sig: 'sigZ4', vak: 'Zonder-Naar-ZZ', onderwerp: 'x', weging: 1, ts: Date.now(), uitslagGedeeld: false });
    await L.zetBlob(RB, vB_A, galOpen); await L.zetBlob(RB, vB_C, galOpen);
    const lees = async (x, van, ander) => L.ontsleutel(await L.deelSleutel(x.privJwk, ander.pub, x.id, ander.id), (await L.clientVan(x).roep('get')).blobs.find((b) => b.owner === van.id).data);
    const blobA = await lees(RA, RB, RB), blobC = await lees(RC, RB, RB);
    const tA = JSON.stringify(blobA), tC = JSON.stringify(blobC);
    controle('ronde met naar [A] komt bij A', tA.includes('Alleen-Voor-A-ZZ') && blobA.raden.length === 2);
    controle('ronde met naar [A] komt NIET bij C', !tC.includes('Alleen-Voor-A-ZZ') && !tC.includes(ronde2.rid) && blobC.raden.length === 1 && blobC.raden[0].rid === ronde.rid);
    controle('ronde met lege of ontbrekende naar komt bij niemand', !tA.includes('Naar-Niemand-ZZ') && !tC.includes('Naar-Niemand-ZZ') && !tA.includes('Zonder-Naar-ZZ') && !tC.includes('Zonder-Naar-ZZ'));
    controle('uitslag-cijfer in de blob van C gaat niet naar de rondes van A (per vriend apart)', blobC.raden[0].uitslag.dichtst === false && blobA.raden.find((r) => r.rid === ronde.rid).uitslag.dichtst === true);
    RB.raden = RB.raden.filter((r) => r.naar && r.naar.length); // opruimen van de opzettelijk kapotte rondes
    // een vriend die niet in naar staat stuurt toch een gok (hij kent de rid): telt niet mee
    const gokC = { v: 1, ts: Date.now(), kaarten: [], gokken: { [ronde2.rid]: 7.0 } };
    await cRC.roep('put', { to: RB.id, data: await L.versleutel(await L.deelSleutel(RC.privJwk, RB.pub, RC.id, RB.id), gokC) });
    await L.zetBlob(RA, vA, []); // A gokt op ronde 2 niet
    const mem2 = (await L.haalOp(RB)).kaarten;
    controle('gok van een vriend buiten naar telt niet: niemand dichtst voor ronde 2', L.ranglijst(ronde2, 7, mem2).dichtst.length === 0 && L.ranglijst(ronde2, 7, mem2).lijst.length === 0);
    // Gokken voor rondes die verdwenen zijn worden opgeruimd bij synchroniseren
    L.slaGokOp(RA, RB.id, ronde2.rid, 6.5);
    controle('A heeft nu gokken voor 2 rondes', Object.keys(RA.gokken[RB.id]).length === 2);
    L.stopRonde(RB, ronde2.rid);
    await L.zetBlobs(RB, [RA.id, RC.id], galOpen);
    const sA4 = await L.synchroniseer(RA, []);
    controle('ronde gestopt: weg uit de blob van A, en A\'s gok erop wordt opgeruimd', sA4.kaarten[RB.id].raden.length === 1 && Object.keys(RA.gokken[RB.id]).join() === ronde.rid, JSON.stringify(RA.gokken));
    controle('max. 10 rondes tegelijk', (() => {
      let n = RB.raden.length;
      for (; n < 10; n++) L.startRonde(RB, { id: 'cap' + n, ts: 1, vak: 'Vak', onderwerp: '', weging: 1 }, [RA.id]);
      try { L.startRonde(RB, { id: 'cap-extra', ts: 1, vak: 'Vak', onderwerp: '', weging: 1 }, [RA.id]); return false; } catch (e) { return /maximaal 10/.test(e.message) && RB.raden.length === 10; }
    })());
    for (const r of RB.raden.slice(1)) L.stopRonde(RB, r.rid);

    // --- rid heeft niets met de sig te maken ---
    const ridSet = new Set(); for (let i = 0; i < 300; i++) ridSet.add(L.maakRid());
    controle('300 rid\'s: allemaal uniek en 32 hex-tekens', ridSet.size === 300 && [...ridSet].every((r) => /^[0-9a-f]{32}$/.test(r)));
    const kr = require('node:crypto');
    const heeftAfgeleid = (rid, sig) => ['sha256', 'sha1', 'md5'].some((h) => kr.createHash(h).update(sig).digest('hex').slice(0, 32) === rid || kr.createHash(h).update(sig).digest('hex').includes(rid));
    const stX = { id: 'x'.repeat(32), vrienden: [{ id: 'a'.repeat(32), status: 'vriend' }] }, stY = { id: 'y'.repeat(32), vrienden: [{ id: 'a'.repeat(32), status: 'vriend' }] };
    const gelijk1 = L.startRonde(stX, { id: 'zelfde1', ts: 1, vak: 'Vak', onderwerp: '', weging: 1 }, ['a'.repeat(32)]), gelijk2 = L.startRonde(stY, { id: 'zelfde1', ts: 1, vak: 'Vak', onderwerp: '', weging: 1 }, ['a'.repeat(32)]);
    controle('dezelfde sig geeft telkens een andere rid (niet af te leiden)', gelijk1.rid !== gelijk2.rid && !heeftAfgeleid(gelijk1.rid, 'zelfde1') && !heeftAfgeleid(gelijk2.rid, 'zelfde1') && gelijk1.rid !== 'zelfde1');
    controle('de blob van een ronde heeft geen veld sig', !JSON.stringify(L.maakInhoud(stX, stX.vrienden[0], [])).includes('zelfde1') && !('sig' in L.maakInhoud(stX, stX.vrienden[0], []).raden[0]));

    // --- Kwaadwillende vriend: C stuurt onzin, B mag er niets van overnemen ---
    const lang = 'x'.repeat(5000);
    const reactiesEvil = { bk1: '<b>x</b>', ev: '\u{1F595}', ok1: VUUR, ['k'.repeat(65)]: VUUR, 'a b': VUUR, ok2: '\u2764' /* hart zonder variantteken: mag */ };
    Object.defineProperty(reactiesEvil, '__proto__', { value: VUUR, enumerable: true, configurable: true, writable: true });
    for (let i = 0; i < 2000; i++) reactiesEvil['k' + i] = VUUR;
    const ridN = (n) => n.toString(16).padStart(32, '0');
    const rondenEvil = [
      { rid: ridN(1), vak: 'Geldig-1', onderwerp: 'ok', weging: 2, ts: 1700000000000, uitslag: { cijfer: 99, dichtst: true } },       // uitslag ongeldig: ronde blijft, uitslag weg
      { rid: ridN(2), vak: 'Geldig-2', onderwerp: '', weging: 'zwaar', ts: 1700000000000, uitslag: { cijfer: 8.5, dichtst: 'ja' }, html: '<script>x</script>' },
      { rid: ridN(3), vak: '<img src=x onerror=window.__pwned=1>', onderwerp: 'o', weging: 1, ts: 1700000000000, uitslag: { cijfer: 6, dichtst: false } },
      { rid: 'ABCDEF', vak: 'Ongeldige rid', onderwerp: '', weging: 1, ts: 1 },
      { rid: 'G'.repeat(32), vak: 'Geen hex', onderwerp: '', weging: 1, ts: 1 },
      { rid: ridN(4), vak: 'v'.repeat(61), onderwerp: '', weging: 1, ts: 1 },
      { rid: ridN(5), vak: 'Vak', onderwerp: 'o'.repeat(121), weging: 1, ts: 1 },
      { rid: ridN(6), vak: '', onderwerp: '', weging: 1, ts: 1 },
      { rid: ridN(7), vak: 'Zonder ts', onderwerp: '' },
      { rid: ridN(1), vak: 'Dubbele rid', onderwerp: '', weging: 1, ts: 1 },
      null, 7, 'tekst', [],
    ];
    for (let i = 10; i < 40; i++) rondenEvil.push({ rid: ridN(i), vak: 'Veel-' + i, onderwerp: '', weging: 1, ts: 1700000000000 });
    const gokkenEvil = { [ridN(1)]: 7.0, [ridN(2)]: 11, [ridN(3)]: '7', [ridN(4)]: 0.5, 'niet-hex': 7, [ridN(5)]: 1e308, [ridN(6)]: -3, [ridN(7)]: 7.26, [ridN(8)]: null, [ridN(9)]: [7] };
    const evil = {
      v: 1, ts: 'morgen',
      kaarten: [
        { id: 'ok1', vak: 'Wis', cijfer: 6.5, onderwerp: 'ok', weging: 1, ts: 1700000000000, tier: 9 },
        { id: 'ev1', vak: lang, cijfer: 7, ts: 1 }, { id: 'ev2', vak: 'x', cijfer: 11, ts: 1 }, { id: 'ev3', vak: 'x', cijfer: '7', ts: 1 },
        { id: '<img>', vak: 'x', cijfer: 7, ts: 1 }, { id: '__proto__', vak: 'x', cijfer: 7, ts: 1 }, { id: 'ev5', vak: 'x', cijfer: 7, ts: 1, onderwerp: lang },
        null, 5, 'tekst', [],
        { id: 'ev4', vak: '<img src=x onerror=alert(1)>', cijfer: 8, ts: 1700000000000, onderwerp: 'a\u202Eb\u0000c' },
      ],
      reacties: reactiesEvil, raden: rondenEvil, gokken: gokkenEvil,
    };
    await cRC.roep('put', { to: RB.id, data: await L.versleutel(await L.deelSleutel(RC.privJwk, RB.pub, RC.id, RB.id), evil) });
    const sB3 = await L.synchroniseer(RB, galOpen);
    const ev = sB3.kaarten[RC.id];
    controle('kwaadwillend: geen ontsleutelfout of crash', ev && !sB3.meldingen.some((m) => /ontsleuteld/.test(m)));
    controle('kwaadwillend: ts als tekst wordt 0', ev.ts === 0);
    controle('kwaadwillend: alleen geldige kaarten blijven (te lang, cijfer buiten 1-10, tekst als cijfer, rare id, null en rommel weg)', ev.kaarten.map((k) => k.id).join() === 'ok1,ev4', ev.kaarten.map((k) => k.id).join());
    controle('kwaadwillend: tier wordt begrensd, HTML blijft tekst, stuur- en richtingtekens verdwijnen', ev.kaarten[0].tier === 4 && ev.kaarten[1].vak === '<img src=x onerror=alert(1)>' && ev.kaarten[1].onderwerp === 'abc', JSON.stringify(ev.kaarten[1]));
    const keys = Object.keys(ev.reacties);
    controle('kwaadwillend: hoogstens 300 reacties', keys.length === 300, keys.length);
    controle('kwaadwillend: alleen emoji uit de lijst, geen __proto__, geen rare sleutels', keys.every((k) => L.REACTIES.some((r) => r.emoji === ev.reacties[k])) && !keys.includes('__proto__') && !keys.includes('bk1') && !keys.includes('a b') && Object.getPrototypeOf(ev.reacties) === null);
    controle('kwaadwillend: hart zonder variantteken wordt het gewone hart', L.schoonReacties({ x: '\u2764' }).x === '\u2764\uFE0F');
    const ids = ev.raden.map((r) => r.rid);
    controle('kwaadwillend: hoogstens 10 rondes, alleen geldige rid, geen dubbelen', ev.raden.length === 10 && ids.every((r) => /^[0-9a-f]{32}$/.test(r)) && new Set(ids).size === 10, JSON.stringify(ids));
    controle('kwaadwillend: ronde met ongeldige velden valt weg (te lange vak/onderwerp, lege vak, geen ts, rommel)', !ev.raden.some((r) => r.vak.length > 60 || r.onderwerp.length > 120 || !r.vak || r.vak === 'Zonder ts' || r.vak === 'Dubbele rid'));
    controle('kwaadwillend: ongeldige uitslag wordt weggelaten, geldige blijft; onbekende velden worden niet overgenomen', !('uitslag' in ev.raden[0]) && !('uitslag' in ev.raden[1]) && ev.raden[2].uitslag.cijfer === 6 && ev.raden[2].uitslag.dichtst === false && !('html' in ev.raden[1]) && ev.raden[1].weging === null);
    controle('kwaadwillend: HTML in vak blijft letterlijke tekst (de pagina gebruikt textContent)', ev.raden[2].vak === '<img src=x onerror=window.__pwned=1>');
    controle('kwaadwillend: alleen geldige gokken (1 t/m 10, getal, rid hex), afgerond op 0,1', JSON.stringify(Object.keys(ev.gokken).sort().map((k) => [k, ev.gokken[k]])) === JSON.stringify([[ridN(1), 7], [ridN(7), 7.3]]), JSON.stringify(ev.gokken));
    // oud formaat en alleen-ronden-formaat worden geaccepteerd
    await cRC.roep('put', { to: RB.id, data: await L.versleutel(await L.deelSleutel(RC.privJwk, RB.pub, RC.id, RB.id), { v: 1, ts: 5, kaarten: [{ id: 'oud1', vak: 'Oud', cijfer: 6, onderwerp: 'x', weging: 1, ts: 1, tier: 0 }] }) });
    let oud = (await L.synchroniseer(RB, galOpen)).kaarten[RC.id];
    controle('blob uit de oude versie (alleen kaarten) werkt', oud.kaarten.length === 1 && !Object.keys(oud.reacties).length && !oud.raden.length && !Object.keys(oud.gokken).length && oud.ts === 5);
    await cRC.roep('put', { to: RB.id, data: await L.versleutel(await L.deelSleutel(RC.privJwk, RB.pub, RC.id, RB.id), { v: 1, ts: 6, raden: [{ rid: ridN(1), vak: 'Zonder kaarten', ts: 1 }] }) });
    oud = (await L.synchroniseer(RB, galOpen)).kaarten[RC.id];
    controle('blob zonder kaarten-veld maar met ronde wordt geaccepteerd', oud.kaarten.length === 0 && oud.raden.length === 1);
    await cRC.roep('put', { to: RB.id, data: await L.versleutel(await L.deelSleutel(RC.privJwk, RB.pub, RC.id, RB.id), { v: 2, kaarten: [] }) });
    controle('blob met onbekende versie (v: 2) wordt genegeerd', !(await L.synchroniseer(RB, galOpen)).kaarten[RC.id]);
    await cRC.roep('put', { to: RB.id, data: await L.versleutel(await L.deelSleutel(RC.privJwk, RB.pub, RC.id, RB.id), [1, 2, 3]) });
    controle('blob die geen object is wordt genegeerd', !(await L.synchroniseer(RB, galOpen)).kaarten[RC.id]);

    // --- Privacy: wat de server ziet ---
    await slaap(50);
    const uit2 = await new Promise((res) => { let t = ''; const c = spawn('php', [dump, DB]); c.stdout.on('data', (d) => (t += d)); c.on('exit', () => res(t)); });
    const GEHEIM2 = ['Scheikunde-QX', 'Redox-QY', 'Wiskunde-QZ', 'Onderwerp-JK', 'Alleen-Voor-A-ZZ', 'Naar-Niemand-ZZ', ALIAS.aVoorB, ALIAS.bVoorA, ALIAS.cVoorB, sigQ, 'sigQ2', 'bk1', 'bk2', ronde.rid, ronde2.rid,
      'cijfer', 'uitslag', 'dichtst', 'reacties', 'gokken', 'weging', 'onderwerp', '\\ud83d', '\\u2764'];
    controle('db heeft de blobs van deze test', uit2.includes(RA.id) && uit2.includes(RB.id));
    for (const g of GEHEIM2) controle('db bevat geen leesbare "' + g + '"', !uit2.includes(g));
    controle('db bevat de tokens van deze test niet', ![RA, RB, RC].some((u) => uit2.includes(u.token)));

    // --- Opruimen bij verwijderen ---
    L.zetReactie(RA, RB.id, 'bk1', VUUR); L.slaGokOp(RA, RB.id, ronde.rid, 7);
    await L.verwijderVriend(RA, RB.id);
    controle('vriend verwijderen ruimt reacties en gokken van die vriend op', !('reacties' in {}) && L.eigen(RA.reacties, RB.id) === undefined && L.eigen(RA.gokken, RB.id) === undefined);
    const sB4 = await L.synchroniseer(RB, galOpen);
    controle('vriend die geen vriend meer is verdwijnt uit mijn rondes; ronde blijft voor C', RB.raden.length === 1 && RB.raden[0].naar.join() === RC.id && !L.reactiesOpMijnKaarten(RB, galOpen, sB4.kaarten).some((x) => x.reacties.some((r) => r.vriendId === RA.id)));
    await L.verwijderVriend(RB, RC.id);
    controle('laatste vriend uit een ronde weg = ronde weg, en alles leeg', RB.raden.length === 0 && L.eigen(RB.reacties, RC.id) === undefined);
    controle('alles leeg: maakInhoud is null (blob wissen)', L.maakInhoud(RB, { id: RC.id }, []) === null);
    const stLeeg = { id: 'z'.repeat(32), vrienden: [], privJwk: RA.privJwk };
    controle('toestand van een oud account zonder nieuwe velden werkt', L.maakInhoud(stLeeg, { id: RC.id, deel: { modus: 'niets', ids: [] } }, []) === null && Array.isArray(stLeeg.raden) && stLeeg.reacties && stLeeg.gokken);
    // Een blob die eerst gevuld was en daarna leeg is, wordt echt gewist op de server
    await cRC.roep('unfriend', { other: RB.id }).catch(() => {});

    // --- v1.4: puls, kanaal (send/poll), team in de blob, limieten ---
    {
      const X = await maak('X'), Y = await maak('Y'), Z = await maak('Z');
      const hx = { 'X-Id': X.id, 'X-Token': X.token }, hy = { 'X-Id': Y.id, 'X-Token': Y.token }, hz = { 'X-Id': Z.id, 'X-Token': Z.token };
      await L.verzoek(X, L.maakCode(Y.id, Y.pub), 'y'); await L.antwoord({ ...Y, vrienden: [{ id: X.id, pub: X.pub, status: 'ontvangen' }] }, X.id, true, 'x');
      X.vrienden = [{ id: Y.id, pub: Y.pub, status: 'vriend', deel: { modus: 'niets', ids: [] } }];
      Y.vrienden = [{ id: X.id, pub: X.pub, status: 'vriend', deel: { modus: 'niets', ids: [] } }];
      const P = (h, b) => ruw(URL1, b, h);
      let pu = await P(hy, { a: 'puls' });
      controle('puls: vorm', pu.s === 200 && /^[0-9a-f]{16}$/.test(pu.j.vh) && Array.isArray(pu.j.blobs) && Array.isArray(pu.j.post) && Number.isInteger(pu.j.nu), pu);
      controle('puls: zonder token 401', (await ruw(URL1, { a: 'puls' })).s === 401);
      const vh0 = pu.j.vh;
      const team = { kaarten: [{ vak: 'Wiskunde', cijfer: 8.5, tier: 2, z: false }, { vak: 'Engels', cijfer: 6, tier: 1, z: true }] };
      const gal = [{ id: 'k1', vak: 'Wis', cijfer: 8.5, onderwerp: '', weging: 1, ts: Date.now(), tier: 2 }];
      const inh = L.maakInhoud(X, Y, gal, team);
      controle('team zit in de blob; zonder kaarten wel een blob', inh && inh.team && inh.team.kaarten.length === 2 && L.maakInhoud(X, Y, [], team) !== null && L.maakInhoud(X, Y, [], null) === null);
      controle('schoonTeam: geen id/naam, grenzen', L.schoonTeam({ kaarten: [{ vak: 'a', cijfer: 11, tier: 1 }] }) === null && L.schoonTeam({ kaarten: Array(12).fill({ vak: 'a', cijfer: 5, tier: 1 }) }).kaarten.length === 11 && !('id' in L.schoonTeam({ kaarten: [{ vak: 'a', cijfer: 5, tier: 1, id: 'x' }] }).kaarten[0]));
      await P(hx, { a: 'put', to: Y.id, data: await L.versleutel(await L.deelSleutel(X.privJwk, Y.pub, X.id, Y.id), inh) });
      const pu1 = await P(hy, { a: 'puls' });
      const u1 = pu1.j.blobs.find((b) => b.owner === X.id);
      await P(hx, { a: 'put', to: Y.id, data: 'v1.aa.bb' });
      const u2 = (await P(hy, { a: 'puls' })).j.blobs.find((b) => b.owner === X.id);
      controle('puls: blob-versie gaat bij elke put omhoog (ook in dezelfde seconde)', u1 && u2 && u2.updated > u1.updated, [u1, u2]);
      controle('puls: alleen owner en updated, geen data', Object.keys(u2).sort().join() === 'owner,updated');
      // kanaal
      const D = 'v1.' + 'A'.repeat(40) + '.' + 'B'.repeat(60);
      controle('send: zonder vriendschap 403', (await P(hz, { a: 'send', to: X.id, seq: 1, data: D })).s === 403);
      controle('poll: zonder vriendschap 403', (await P(hz, { a: 'poll', from: X.id, after: 0 })).s === 403);
      controle('send: ongeldige velden 400', (await P(hx, { a: 'send', to: Y.id, seq: 'a', data: D })).s === 400 && (await P(hx, { a: 'send', to: Y.id, seq: 0, data: D })).s === 400 && (await P(hx, { a: 'send', to: Y.id, seq: 1, data: 'ongeldig teken!' })).s === 400 && (await P(hx, { a: 'send', to: 'xyz', seq: 1, data: D })).s === 400 && (await P(hx, { a: 'send', to: Y.id, seq: 1.5, data: D })).s === 400);
      controle('send: te groot 413', (await P(hx, { a: 'send', to: Y.id, seq: 1, data: 'a'.repeat(2049) })).s === 413 && (await P(hx, { a: 'send', to: Y.id, seq: 1, data: '' })).s === 413);
      controle('send: 2048 mag nog', (await P(hx, { a: 'send', to: Y.id, seq: 5, data: 'a'.repeat(2048) })).s === 200);
      controle('send: 1, 2, 3 ok; zelfde seq 409', (await P(hx, { a: 'send', to: Y.id, seq: 1, data: D })).s === 200 && (await P(hx, { a: 'send', to: Y.id, seq: 3, data: D })).s === 200 && (await P(hx, { a: 'send', to: Y.id, seq: 2, data: D })).s === 200 && (await P(hx, { a: 'send', to: Y.id, seq: 2, data: D })).s === 409);
      const pl = await P(hy, { a: 'poll', from: X.id, after: 0 });
      controle('poll: op volgorde, met leeftijd', pl.s === 200 && pl.j.berichten.map((b) => b.seq).join() === '1,2,3,5' && pl.j.berichten.every((b) => b.leeftijd >= 0 && b.leeftijd < 5 && b.data), pl.j);
      controle('poll: after filtert', (await P(hy, { a: 'poll', from: X.id, after: 3 })).j.berichten.map((b) => b.seq).join() === '5');
      controle('poll: ontvanger ziet alleen eigen post (X ziet niets van Y)', (await P(hx, { a: 'poll', from: Y.id, after: 0 })).j.berichten.length === 0);
      controle('poll: ongeldige after 400', (await P(hy, { a: 'poll', from: X.id, after: -1 })).s === 400 && (await P(hy, { a: 'poll', from: X.id, after: 'a' })).s === 400);
      const pu2 = (await P(hy, { a: 'puls' })).j;
      controle('puls: post toont laatste volgnummer per afzender', pu2.post.length === 1 && pu2.post[0].van === X.id && pu2.post[0].seq === 5, pu2.post);
      // TTL: oude berichten verdwijnen
      const oud = path.join(TMP, 'oud.php');
      fs.writeFileSync(oud, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec("UPDATE berichten SET created = created - 700 WHERE seq IN (1,2)");`);
      await new Promise((res) => spawn('php', [oud, DB]).on('exit', res));
      const pl2 = await P(hy, { a: 'poll', from: X.id, after: 0 });
      controle('TTL: berichten ouder dan 10 minuten komen niet meer terug', pl2.j.berichten.map((b) => b.seq).join() === '3,5', pl2.j);
      await P(hx, { a: 'send', to: Y.id, seq: 6, data: D }); // opruimen oude rijen gebeurt bij send
      const tel = path.join(TMP, 'tel.php');
      fs.writeFileSync(tel, `<?php $d=new PDO('sqlite:'.$argv[1]); echo $d->query("SELECT COUNT(*) FROM berichten WHERE afz='".$argv[2]."'")->fetchColumn();`);
      const aantal = await new Promise((res) => { let t = ''; const c = spawn('php', [tel, DB, X.id]); c.stdout.on('data', (d) => (t += d)); c.on('exit', () => res(Number(t))); });
      controle('TTL: send ruimt oude rijen op', aantal === 3, aantal);
      // wachtrij-limiet
      let l429 = 0;
      for (let i = 100; i < 100 + 305; i++) { const r = await P(hx, { a: 'send', to: Y.id, seq: i, data: D }); if (r.s === 429) l429++; }
      controle('wachtrij: maximaal 300 berichten tegelijk (429 daarboven)', l429 > 0, l429);
      // db ziet niets leesbaars: payload blijft wat de client stuurde
      // unfriend wist het kanaal; vriendschap weg = geen send meer
      await P(hy, { a: 'unfriend', other: X.id });
      controle('unfriend wist berichten en blokkeert send/poll', (await P(hx, { a: 'send', to: Y.id, seq: 9999, data: D })).s === 403 && (await P(hy, { a: 'poll', from: X.id, after: 0 })).s === 403);
      const aantal2 = await new Promise((res) => { let t = ''; const c = spawn('php', [tel, DB, X.id]); c.stdout.on('data', (d) => (t += d)); c.on('exit', () => res(Number(t))); });
      controle('unfriend: kanaal leeg', aantal2 === 0, aantal2);
      controle('puls: vriendenhash verandert bij unfriend', (await P(hy, { a: 'puls' })).j.vh !== vh0);
      // clientfuncties: stuurBericht / haalBerichten in twee richtingen (opnieuw bevriend)
      X.vrienden = [];
      await L.verzoek(X, L.maakCode(Y.id, Y.pub), 'y'); await L.antwoord({ ...Y, vrienden: [{ id: X.id, pub: X.pub, status: 'ontvangen' }] }, X.id, true, 'x');
      X.vrienden = [{ id: Y.id, pub: Y.pub, status: 'vriend' }]; Y.vrienden = [{ id: X.id, pub: X.pub, status: 'vriend' }];
      await L.stuurBericht(X, X.vrienden[0], { t: 'uitnodiging', mid: 'abc' });
      await L.stuurBericht(X, X.vrienden[0], { t: 'rdy', k: 1 });
      const cur = {};
      const ber = await L.haalBerichten(Y, Y.vrienden[0], cur);
      controle('client: versleuteld bericht komt heel en in volgorde aan', ber.length === 2 && ber[0].m.t === 'uitnodiging' && ber[1].m.k === 1 && cur[X.id] === ber[1].seq && ber[1].seq > ber[0].seq);
      controle('client: tweede keer ophalen levert niets', (await L.haalBerichten(Y, Y.vrienden[0], cur)).length === 0);
      const uit3 = await new Promise((res) => { let t = ''; const c = spawn('php', [dump, DB]); c.stdout.on('data', (d) => (t += d)); c.on('exit', () => res(t)); });
      controle('db bevat geen leesbaar bericht', !uit3.includes('uitnodiging') && !uit3.includes('"rdy"'));
      // limieten per gebruiker (strenge server)
      const U2b = 'http://localhost:8152/api.php';
      const S = await L.maakClient(U2b).roep('register', { pub: (await L.maakSleutelpaar()).pub });
      const hs = { 'X-Id': S.id, 'X-Token': S.token };
      let c429 = 0; for (let i = 0; i < 12; i++) if ((await ruw(U2b, { a: 'puls' }, hs)).s === 429) c429++;
      controle('gebruikerslimiet: puls boven de grens geeft 429', c429 > 0, c429);
      let r429 = 0; for (let i = 0; i < 10; i++) if ((await ruw(U2b, { a: 'poll', from: 'a'.repeat(32), after: 0 }, hs)).s === 429) r429++;
      controle('relaylimiet apart: poll geeft ook 429 boven de eigen grens', r429 > 0, r429);
      // ruime limiet: 1 verzoek per seconde plus gevechtsverkeer past
      const W = await maak('W'); let ruim = 0; for (let i = 0; i < 100; i++) if ((await P({ 'X-Id': W.id, 'X-Token': W.token }, { a: 'puls' })).s === 429) ruim++;
      controle('standaardlimiet: 100 pulsen in korte tijd zonder 429', ruim === 0, ruim);
    }

    // ---- Beheer ----
    {
      // Zonder beheer_sleutel in de config: 404, ook met een sleutel.
      for (const act of ['beheerLijst', 'beheerStats', 'beheerBan', 'beheerOnban', 'beheerWisKaarten', 'beheerWisAccount'])
        controle('beheer uit: ' + act + ' geeft 404', (await ruw(URL1, { a: act, id: 'a'.repeat(32) }, { 'X-Beheer': SL })).s === 404);
      const hb = { 'X-Beheer': SL };
      const B = (act, body, h) => ruw(URLB, Object.assign({ a: act }, body || {}), h === undefined ? hb : h);
      const mk = async (naam) => {
        const sl = await L.maakSleutelpaar();
        const r = await L.maakClient(URLB).roep('register', { pub: sl.pub });
        return { server: URLB, id: r.id, token: r.token, privJwk: sl.privJwk, pub: sl.pub, vrienden: [] };
      };
      const X = await mk('X'), Y = await mk('Y'), Z = await mk('Z');
      const hx = { 'X-Id': X.id, 'X-Token': X.token };
      // Sleutel ontbreekt of fout
      controle('beheer: zonder sleutel 403', (await B('beheerLijst', {}, {})).s === 403);
      controle('beheer: foute sleutel 403', (await B('beheerLijst', {}, { 'X-Beheer': SL + 'x' })).s === 403);
      controle('beheer: gebruikerstoken is geen sleutel', (await B('beheerLijst', {}, hx)).s === 403);
      controle('beheer: sleutel in body werkt', (await B('beheerLijst', { beheer: SL }, {})).s === 200);
      controle('beheer: fout sleutel in body 403', (await B('beheerLijst', { beheer: 'nee' }, {})).s === 403);
      // Vriendschap en data zodat de lijst iets te tellen heeft
      const cx = L.clientVan(X);
      await cx.roep('request', { to: Y.id });
      await L.clientVan(Y).roep('respond', { from: X.id, accept: true });
      await cx.roep('put', { to: Y.id, data: 'v1.aaaa.bbbbbbbb' });
      await cx.roep('send', { to: Y.id, seq: 1, data: 'v1.cc.dd' });
      const lijst = await B('beheerLijst');
      const rijX = (lijst.j.gebruikers || []).find((u) => u.id === X.id);
      controle('beheerLijst: velden en tellingen', lijst.s === 200 && lijst.j.gebruikers.length === 3 && rijX && rijX.vrienden === 1 && rijX.blobs === 1 && rijX.blobBytes === 16 && rijX.berichten === 1 && rijX.berichtBytes === 8 && rijX.ban === null && rijX.aangemaakt > 0 && rijX.laatstActief > 0, JSON.stringify(rijX));
      controle('beheerLijst: geen geheimen (token, pub, data)', !JSON.stringify(lijst.j).match(/token|pub|aaaa|bbbbbbbb/));
      const st0 = await B('beheerStats');
      controle('beheerStats: totalen', st0.s === 200 && st0.j.gebruikers === 3 && st0.j.vriendschappen === 1 && st0.j.blobs === 1 && st0.j.berichten === 1 && st0.j.verbannen === 0, JSON.stringify(st0.j));
      // Ban
      controle('ban: ongeldige id 400', (await B('beheerBan', { id: 'xyz', tot: 0 })).s === 400);
      controle('ban: onbekende gebruiker 404', (await B('beheerBan', { id: 'b'.repeat(32), tot: 0 })).s === 404);
      controle('ban: einddatum in het verleden 400', (await B('beheerBan', { id: X.id, tot: 5 })).s === 400);
      controle('ban: nog niet verbannen werkt alles', (await ruw(URLB, { a: 'friends' }, hx)).s === 200);
      const lang = 'r'.repeat(300);
      const tot = Math.floor(Date.now() / 1000) + 3600;
      const bn = await B('beheerBan', { id: X.id, tot, reden: lang });
      controle('ban: ok en reden afgekapt op 200', bn.s === 200 && bn.j.reden.length === 200 && bn.j.tot === tot, JSON.stringify(bn.j).slice(0, 80));
      for (const act of ['friends', 'inbox', 'get', 'puls', 'put', 'send', 'poll', 'request', 'respond', 'unfriend']) {
        const r = await ruw(URLB, { a: act, to: Y.id, from: Y.id, other: Y.id, data: 'v1.a.b', seq: 2, after: 0, accept: true }, hx);
        controle('verbannen: ' + act + ' geeft 403', r.s === 403 && r.j.fout === 'Je bent verbannen' && r.j.tot === tot && r.j.reden.length === 200, r.s + ' ' + JSON.stringify(r.j).slice(0, 60));
      }
      const ms = await ruw(URLB, { a: 'mijnStatus' }, hx);
      controle('mijnStatus verbannen', ms.s === 200 && ms.j.verbannen === true && ms.j.tot === tot, JSON.stringify(ms.j));
      const msY = await ruw(URLB, { a: 'mijnStatus' }, { 'X-Id': Y.id, 'X-Token': Y.token });
      controle('mijnStatus niet verbannen', msY.s === 200 && msY.j.verbannen === false);
      controle('verbannen: vriend (Y) wordt niet geraakt', (await ruw(URLB, { a: 'friends' }, { 'X-Id': Y.id, 'X-Token': Y.token })).s === 200);
      let cl403 = null; try { await cx.roep('puls'); } catch (e) { cl403 = e; }
      controle('client: fout krijgt status 403 en tot/reden mee', cl403 && cl403.status === 403 && cl403.verbannen === true && cl403.tot === tot && cl403.reden.length === 200, cl403 && JSON.stringify([cl403.status, cl403.tot]));
      controle('verbannen: foute token blijft 401', (await ruw(URLB, { a: 'mijnStatus' }, { 'X-Id': X.id, 'X-Token': 'ff'.repeat(32) })).s === 401);
      const lb = await B('beheerLijst');
      controle('beheerLijst toont ban', lb.j.gebruikers.find((u) => u.id === X.id).ban.tot === tot);
      controle('beheerStats telt verbannen', (await B('beheerStats')).j.verbannen === 1);
      // Opheffen
      controle('onban: ok', (await B('beheerOnban', { id: X.id })).s === 200);
      controle('onban: gebruiker werkt weer', (await ruw(URLB, { a: 'friends' }, hx)).s === 200);
      controle('mijnStatus na onban', (await ruw(URLB, { a: 'mijnStatus' }, hx)).j.verbannen === false);
      // Verlopen ban
      const nu = Math.floor(Date.now() / 1000);
      controle('ban van 2 seconden', (await B('beheerBan', { id: Z.id, tot: nu + 2, reden: 'kort' })).s === 200);
      controle('kort verbannen: 403', (await ruw(URLB, { a: 'friends' }, { 'X-Id': Z.id, 'X-Token': Z.token })).s === 403);
      await slaap(3200);
      controle('verlopen ban: werkt vanzelf weer', (await ruw(URLB, { a: 'friends' }, { 'X-Id': Z.id, 'X-Token': Z.token })).s === 200);
      controle('verlopen ban: niet meer in lijst', (await B('beheerLijst')).j.gebruikers.find((u) => u.id === Z.id).ban === null);
      // Voorgoed
      controle('ban voorgoed', (await B('beheerBan', { id: Z.id, tot: 0 })).s === 200);
      const fz = await ruw(URLB, { a: 'puls' }, { 'X-Id': Z.id, 'X-Token': Z.token });
      controle('voorgoed: 403 met tot 0', fz.s === 403 && fz.j.tot === 0);
      // Verbannen gebruiker mag wel zijn account wissen
      controle('verbannen: deleteAccount mag', (await ruw(URLB, { a: 'deleteAccount' }, { 'X-Id': Z.id, 'X-Token': Z.token })).s === 200);
      controle('na deleteAccount: ban weg, gebruiker weg', (await B('beheerLijst')).j.gebruikers.every((u) => u.id !== Z.id) && (await B('beheerStats')).j.verbannen === 0);
      // Kaarten wissen
      controle('wisKaarten: onbekende id 404', (await B('beheerWisKaarten', { id: 'c'.repeat(32) })).s === 404);
      controle('wisKaarten: ok', (await B('beheerWisKaarten', { id: X.id })).s === 200);
      const na = await B('beheerStats');
      controle('wisKaarten: blobs en berichten weg, vriendschap blijft', na.j.blobs === 0 && na.j.berichten === 0 && na.j.vriendschappen === 1 && na.j.gebruikers === 2, JSON.stringify(na.j));
      // Account wissen
      controle('wisAccount: ok', (await B('beheerWisAccount', { id: X.id })).s === 200);
      const na2 = await B('beheerStats');
      controle('wisAccount: gebruiker en vriendschap weg', na2.j.gebruikers === 1 && na2.j.vriendschappen === 0, JSON.stringify(na2.j));
      controle('wisAccount: token werkt niet meer', (await ruw(URLB, { a: 'friends' }, hx)).s === 401);
      controle('wisAccount: tweede keer 404', (await B('beheerWisAccount', { id: X.id })).s === 404);
      controle('beheer: onbekende beheeractie 400', (await B('beheerFoo', { id: Y.id })).s === 400);
      // Strenge limiet (5 per minuut op server 8154): foute sleutels tellen mee
      const codesB = []; for (let i = 0; i < 9; i++) codesB.push((await ruw(URLB2, { a: 'beheerLijst' }, { 'X-Beheer': 'fout' + i })).s);
      controle('beheer: strenge ratelimit geeft 429', codesB.slice(0, 5).every((c) => c === 403) && codesB.slice(5).every((c) => c === 429), codesB);
      controle('beheer: limiet raakt gewone acties niet (andere teller)', (await ruw(URLB2, { a: 'friends' })).s === 401);
    }

    // Rate limit op strenge server (10/min, 3 registraties/uur)
    const U2 = 'http://localhost:8151/api.php';
    const pubs = await L.maakSleutelpaar();
    let codes = [];
    // api.php ruimt per verzoek met 1% kans ook de uurtellers van registraties op (het ruimt op tegen een minuut-grens): dan kan de
    // limiet net niet werken. Dat is een serverfout, geen testfout; daarom een nieuwe poging op een lege database (max. 3).
    for (let poging = 0; poging < 3; poging++) {
      await schema(path.join(TMP, 'streng.sqlite'));
      codes = [];
      for (let i = 0; i < 5; i++) codes.push((await ruw(U2, { a: 'register', pub: pubs.pub })).s);
      if (codes.slice(0, 3).every((c) => c === 200) && codes[3] === 429 && codes[4] === 429) break;
    }
    controle('registratielimiet: 3x 200 dan 429', codes.slice(0, 3).every((c) => c === 200) && codes[3] === 429 && codes[4] === 429, codes);
    let laatste = 0;
    for (let i = 0; i < 12; i++) laatste = (await ruw(U2, { a: 'friends' })).s;
    controle('verzoeklimiet 429', laatste === 429, laatste);
  } finally {
    php.kill(); php2.kill(); php3.kill(); php4.kill(); php5.kill();
  }
  console.log(`\nServertest: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
