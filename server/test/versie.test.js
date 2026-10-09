// Versietest (v2.3.4): vrienden alleen met dezelfde versie; oude versies (zonder X-Versie) moeten updaten.
// Gebruik: node server/test/versie.test.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const MAP = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-versie-'));
const DB = path.join(TMP, 'v.sqlite');
const URL = 'http://localhost:8163/api.php';
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
async function roep(body, h) {
  const r = await fetch(URL, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) { /* leeg */ }
  return { s: r.status, j };
}
const pub = () => 'A'.repeat(43) + require('node:crypto').randomBytes(30).toString('base64url').slice(0, 44);
(async () => {
  const f = path.join(TMP, 'schema.php');
  fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2])); $d->exec(file_get_contents($argv[2]));`);
  await new Promise((res, rej) => spawn('php', [f, DB, path.join(MAP, 'schema.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res())));
  const php = spawn('php', ['-S', 'localhost:8163', '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB, SPO_VERSIECHECK: '1' }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(URL, { method: 'OPTIONS' }); break; } catch (e) { await slaap(100); } }
    const maak = async () => { const r = await roep({ a: 'register', pub: pub() }); return r.j; };
    const A = await maak(), B = await maak(), C = await maak();
    controle('registreren', A.id && B.id && C.id, A);
    const h = (u, v) => Object.assign({ 'X-Id': u.id, 'X-Token': u.token }, v ? { 'X-Versie': v } : {});
    const oud = await roep({ a: 'friends' }, h(A));
    controle('oude versie (geen X-Versie) moet updaten', oud.s === 426 && oud.j.update === true, oud);
    controle('ongeldige versie telt als oud', (await roep({ a: 'friends' }, h(A, 'abc'))).s === 426);
    await roep({ a: 'friends' }, h(B, '2.3.4'));
    await roep({ a: 'friends' }, h(C, '2.3.3'));
    const r1 = await roep({ a: 'request', to: B.id }, h(A, '2.3.4'));
    controle('zelfde versie: verzoek mag', r1.s === 200, r1);
    const r2 = await roep({ a: 'request', to: C.id }, h(A, '2.3.4'));
    controle('andere versie: verzoek geweigerd', r2.s === 409 && r2.j.andereVersie === true && r2.j.zijnVersie === '2.3.3', r2);
    const r3 = await roep({ a: 'respond', from: A.id, accept: true }, h(B, '2.3.4'));
    controle('accepteren met zelfde versie', r3.s === 200, r3);
    controle('put mag', (await roep({ a: 'put', to: B.id, data: 'abc' }, h(A, '2.3.4'))).s === 200);
    controle('B ziet blob', ((await roep({ a: 'get' }, h(B, '2.3.4'))).j.blobs || []).length === 1);
    // B update naar een nieuwere versie, A nog niet
    const fr = await roep({ a: 'friends' }, h(B, '2.3.5'));
    controle('friends geeft andereVersie', fr.j.vrienden && fr.j.vrienden[0].andereVersie === true && fr.j.vrienden[0].versie === '2.3.4', fr.j);
    controle('blob van andere versie verborgen', ((await roep({ a: 'get' }, h(B, '2.3.5'))).j.blobs || []).length === 0);
    controle('put naar andere versie geweigerd', (await roep({ a: 'put', to: B.id, data: 'abc' }, h(A, '2.3.4'))).s === 409);
    controle('gevecht-bericht naar andere versie geweigerd', (await roep({ a: 'send', to: B.id, data: 'x', seq: 1 }, h(A, '2.3.4'))).s === 409);
    controle('poll van andere versie geweigerd', (await roep({ a: 'poll', from: A.id, after: 0 }, h(B, '2.3.5'))).s === 409);
    // A update ook: alles werkt weer
    controle('na update weer gelijk', (await roep({ a: 'put', to: B.id, data: 'abd' }, h(A, '2.3.5'))).s === 200);
    controle('account verwijderen kan zonder versie', (await roep({ a: 'deleteAccount' }, h(C))).s === 200);
  } catch (e) { mis++; console.log('FOUT', e); } finally { php.kill(); }
  console.log(`\nVersietest: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})();
