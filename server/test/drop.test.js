// Servertest voor de wekelijkse drop (v3): acties dropMelden en dropTelling. Start `php -S` met een SQLite-testdatabase.
// Gebruik: node server/test/drop.test.js
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require('../../extension/vriendenlib.js');

const MAP = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-drop-'));
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

function start(port, db, env) {
  return spawn('php', ['-S', 'localhost:' + port, '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: db }, env), stdio: 'ignore' });
}
async function wacht(url) {
  for (let i = 0; i < 50; i++) { try { await fetch(url, { method: 'OPTIONS' }); return; } catch (e) { await slaap(100); } }
  throw new Error('server start niet');
}
function maakSchema(db, sqlTekst) {
  fs.writeFileSync(path.join(TMP, 's.sql'), sqlTekst);
  fs.writeFileSync(path.join(TMP, 's.php'), `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2]));`);
  execFileSync('php', [path.join(TMP, 's.php'), db, path.join(TMP, 's.sql')]);
}
function sql(db, q, params) {
  const out = execFileSync('php', ['-r', '$d=new PDO("sqlite:".$argv[1]);$s=$d->prepare($argv[2]);$s->execute(json_decode($argv[3],true));echo json_encode($s->columnCount()?$s->fetchAll(PDO::FETCH_ASSOC):[]);', '--', db, q, JSON.stringify(params || [])]);
  return JSON.parse(out.toString() || '[]');
}
async function post(url, body, headers) {
  const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) { /* leeg */ }
  return { s: r.status, j };
}
// UTC ISO-week, onafhankelijk van PHP uitgerekend (donderdag-regel).
function isoWeek(ts) {
  const d = new Date(ts); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const j = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(j, 0, 1)) / 86400000 + 1) / 7);
  return `${j}-W${String(w).padStart(2, '0')}`;
}

(async () => {
  const schemaTekst = fs.readFileSync(path.join(MAP, 'schema.sql'), 'utf8');
  const migratie = fs.readFileSync(path.join(MAP, 'migratie-v3.sql'), 'utf8');
  controle('schema.sql heeft de tabel week_teller', /CREATE TABLE IF NOT EXISTS week_teller/.test(schemaTekst));
  controle('migratie-v3.sql heeft de tabel week_teller', /CREATE TABLE IF NOT EXISTS week_teller/.test(migratie));
  const blok = (t) => /CREATE TABLE IF NOT EXISTS week_teller \(([^;]*)\);/.exec(t)[1].replace(/\s+/g, ' ').trim();
  controle('schema en migratie hebben dezelfde tabel', blok(schemaTekst) === blok(migratie));
  controle('de tabel bewaart alleen week en aantal', /^week CHAR\(8\) NOT NULL PRIMARY KEY, aantal INT NOT NULL$/.test(blok(schemaTekst)), blok(schemaTekst));

  // weekVan uit api.php: ook rond de jaarwisseling (2026 heeft 53 ISO-weken)
  const bron = fs.readFileSync(path.join(MAP, 'api.php'), 'utf8');
  const m = /function weekVan\(int \$ts\): string \{[^}]*\}/.exec(bron);
  controle('weekVan staat in api.php', !!m);
  const nuTs = Math.floor(Date.now() / 1000);
  const tijden = ['2026-01-01T00:00:00Z', '2026-12-27T23:59:59Z', '2026-12-28T00:00:00Z', '2027-01-03T23:59:59Z', '2027-01-04T00:00:00Z', '2025-12-29T10:00:00Z', '2024-12-30T00:00:00Z', '2026-10-12T12:00:00Z']
    .map((t) => Math.floor(Date.parse(t) / 1000)).concat([nuTs]);
  const uit = JSON.parse(execFileSync('php', ['-r', m[0] + ' echo json_encode(array_map("weekVan", json_decode($argv[1])));', '--', JSON.stringify(tijden)]).toString());
  controle('weekVan geeft JJJJ-Www in UTC en klopt met de ISO-week (jaarwisseling, 53 weken)', uit.every((w, i) => w === isoWeek(tijden[i] * 1000) && /^\d{4}-W\d{2}$/.test(w)), JSON.stringify(uit));
  controle('weekVan: 2027-01-03 is nog week 53 van 2026 en 2027-01-04 is week 1', uit[3] === '2026-W53' && uit[4] === '2027-W01', uit.slice(3, 5).join(' '));

  const DB = path.join(TMP, 'drop.sqlite'), DBOUD = path.join(TMP, 'oud.sqlite');
  maakSchema(DB, schemaTekst); maakSchema(DB, schemaTekst); // twee keer: herhaalbaar
  maakSchema(DBOUD, schemaTekst.split('\n-- v3 (zelfde tabellen')[0]);
  const URL = 'http://localhost:8191/api.php', URLOUD = 'http://localhost:8192/api.php';
  const p1 = start(8191, DB, {}), p2 = start(8192, DBOUD, {});
  try {
    await wacht(URL); await wacht(URLOUD);
    const maak = async (url) => { const sl = await L.maakSleutelpaar(); return (await post(url || URL, { a: 'register', pub: sl.pub })).j; };
    const h = (u) => ({ 'X-Id': u.id, 'X-Token': u.token });
    const week = isoWeek(Date.now());
    const A = await maak(), B = await maak();

    // zonder account werkt het niet
    let r = await post(URL, { a: 'dropTelling' });
    controle('dropTelling zonder account: 401', r.s === 401, r.s);
    r = await post(URL, { a: 'dropMelden' });
    controle('dropMelden zonder account: 401', r.s === 401, r.s);
    r = await post(URL, { a: 'dropMelden' }, { 'X-Id': A.id, 'X-Token': 'fout' });
    controle('dropMelden met een fout token: 401', r.s === 401, r.s);
    controle('zonder account is er niets geteld', sql(DB, 'SELECT COUNT(*) AS n FROM week_teller')[0].n == 0);

    // tellen
    r = await post(URL, { a: 'dropTelling' }, h(A));
    controle('begin: 0 deze week', r.s === 200 && r.j.aantal === 0 && r.j.week === week, JSON.stringify(r));
    r = await post(URL, { a: 'dropMelden' }, h(A));
    controle('melden: ok en teller 1', r.s === 200 && r.j.ok === true && r.j.aantal === 1 && r.j.week === week, JSON.stringify(r));
    r = await post(URL, { a: 'dropMelden', aantal: 500, week: '1999-W01', naam: 'Piet' }, h(B));
    controle('melden met extra velden telt maar 1 (de client bepaalt het aantal niet)', r.s === 200 && r.j.aantal === 2, JSON.stringify(r));
    r = await post(URL, { a: 'dropTelling' }, h(A));
    controle('alle spelers samen: 2', r.s === 200 && r.j.aantal === 2, JSON.stringify(r));
    controle('het antwoord bevat alleen week en aantal (anoniem)', Object.keys(r.j).sort().join() === 'aantal,week', Object.keys(r.j).join());

    // anoniem opgeslagen
    const rijen = sql(DB, 'SELECT * FROM week_teller');
    controle('een rij voor deze week', rijen.length === 1 && rijen[0].week === week && Number(rijen[0].aantal) === 2, JSON.stringify(rijen));
    controle('de tabel heeft alleen week en aantal', Object.keys(rijen[0]).sort().join() === 'aantal,week');
    controle('geen account-id of token in de tabel', !JSON.stringify(rijen).includes(A.id) && !JSON.stringify(rijen).includes(B.id) && !JSON.stringify(rijen).includes(A.token));

    // eigen limiet per dag (5) per account; een ander account blijft werken
    const C = await maak();
    let tot429 = 0, laatste = 0;
    for (let i = 0; i < 6; i++) { r = await post(URL, { a: 'dropMelden' }, h(C)); if (r.s === 429) tot429++; else laatste = r.j.aantal; }
    controle('limiet per account: na 5 meldingen 429', tot429 === 1 && laatste === 7, `${tot429} ${laatste}`);
    controle('429 heeft een nette fout', typeof r.j.fout === 'string' && /morgen/i.test(r.j.fout), JSON.stringify(r.j));
    r = await post(URL, { a: 'dropMelden' }, h(B));
    controle('een ander account zit niet in dezelfde limiet', r.s === 200 && r.j.aantal === 8, JSON.stringify(r));
    r = await post(URL, { a: 'dropTelling' }, h(C));
    controle('lezen blijft kunnen na de meldlimiet', r.s === 200 && r.j.aantal === 8, JSON.stringify(r));

    // oude weken worden niet meegeteld
    sql(DB, 'INSERT INTO week_teller (week, aantal) VALUES (?, ?)', ['2020-W10', 99]);
    r = await post(URL, { a: 'dropTelling' }, h(A));
    controle('een oude week telt niet mee', r.j.aantal === 8, JSON.stringify(r));

    // ongeldige acties/lege body
    r = await fetch(URL, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h(A)), body: '{"a":["dropMelden"]}' });
    controle('actie als lijst: 400', r.status === 400, r.status);

    // server zonder de nieuwe tabel: duidelijke melding, geen details
    const sl = await L.maakSleutelpaar();
    const O = (await post(URLOUD, { a: 'register', pub: sl.pub })).j;
    r = await post(URLOUD, { a: 'dropTelling' }, h(O));
    controle('zonder tabel: 503 (nog niet bijgewerkt)', r.s === 503 && /bijgewerkt/.test(r.j.fout || ''), JSON.stringify(r));
    r = await post(URLOUD, { a: 'dropMelden' }, h(O));
    controle('melden zonder tabel: 503', r.s === 503, JSON.stringify(r));
  } finally {
    p1.kill(); p2.kill();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`drop.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.log('FOUT', e); process.exit(1); });
