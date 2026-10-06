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
const TMP = '/tmp/claude-0/-home-user/fa7dcd47-c58c-5823-9bf8-08f642143e43/scratchpad/vrienden';
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
  try {
    await schema(path.join(TMP, 'streng.sqlite'));
    await wacht(URL1); await wacht('http://localhost:8151/api.php');

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

    // Rate limit op strenge server (10/min, 3 registraties/uur)
    const U2 = 'http://localhost:8151/api.php';
    const pubs = await L.maakSleutelpaar();
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await ruw(U2, { a: 'register', pub: pubs.pub })).s);
    controle('registratielimiet: 3x 200 dan 429', codes.slice(0, 3).every((c) => c === 200) && codes[3] === 429 && codes[4] === 429, codes);
    let laatste = 0;
    for (let i = 0; i < 12; i++) laatste = (await ruw(U2, { a: 'friends' })).s;
    controle('verzoeklimiet 429', laatste === 429, laatste);
  } finally {
    php.kill(); php2.kill();
  }
  console.log(`\nServertest: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
