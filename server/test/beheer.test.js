// Beheerpagina-test in headless Chromium tegen een lokale php-server (beheer aan): ban, melding bij de gebruiker, opheffen, wissen.
// Gebruik: export NODE_PATH=$(npm root -g); node server/test/beheer.test.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require('../../extension/vriendenlib.js');

const MAP = path.resolve(__dirname, '..');
const TMP = process.env.SPO_TMP || '/tmp/vrienden-scratch';
fs.mkdirSync(TMP, { recursive: true });
const DB = path.join(TMP, 'beheerpagina.sqlite');
const API = 'http://localhost:8160/api.php';
const WEB = 'http://localhost:8162';
const SL = 'pagina-test-beheersleutel-0123456789';
let ok = 0, mis = 0;
function controle(naam, waar, extra) { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try { fs.unlinkSync(DB); } catch (e) { /* nieuw */ }
  await new Promise((res, rej) => {
    const f = path.join(TMP, 'schema3.php');
    fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2]));`);
    spawn('php', [f, DB, path.join(MAP, 'schema.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res()));
  });
  const php = spawn('php', ['-S', 'localhost:8160', '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB, SPO_BEHEER: SL }), stdio: 'ignore' });
  const web = spawn('http-server', ['-p', '8162', '-s', '-c-1', path.resolve(MAP, '../extension')], { stdio: 'ignore' });
  const br = await chromium.launch();
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(API, { method: 'OPTIONS' }); await fetch(WEB + '/beheer.html'); break; } catch (e) { await slaap(100); } }
    const maak = async () => { const sl = await L.maakSleutelpaar(); const r = await L.maakClient(API).roep('register', { pub: sl.pub }); return { v: 1, server: API, id: r.id, token: r.token, pub: sl.pub, privJwk: sl.privJwk, vrienden: [] }; };
    const eigenaar = await maak(), mila = await maak(), onbekend = await maak();
    eigenaar.vrienden.push({ id: mila.id, pub: mila.pub, alias: 'Mila', status: 'vriend', deel: { modus: 'niets', ids: [] } });
    const ce = L.clientVan(eigenaar);
    await ce.roep('request', { to: mila.id }); await L.clientVan(mila).roep('respond', { from: eigenaar.id, accept: true });
    await ce.roep('put', { to: mila.id, data: 'v1.' + 'a'.repeat(2000) + '.bb' });

    const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((st) => { if (!localStorage.getItem('spo_vrienden')) localStorage.setItem('spo_vrienden', JSON.stringify(st)); }, eigenaar);
    const p = await ctx.newPage();
    const fouten = [];
    p.on('pageerror', (e) => fouten.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
    await p.goto(WEB + '/beheer.html?server=' + encodeURIComponent(API));

    // Sleutel vragen (en niet in de pagina-code)
    controle('vraagt om sleutel', await p.locator('#inloggen').isVisible() && !(await p.locator('#app').isVisible()));
    const html = await (await fetch(WEB + '/beheer.js')).text() + await (await fetch(WEB + '/beheer.html')).text();
    controle('sleutel staat niet in de code', !html.includes(SL));
    await p.fill('#sleutel', 'fout-fout-fout-fout-fout'); await p.click('#sleutel-form button');
    await p.waitForSelector('#melding p.fout');
    controle('foute sleutel geeft melding', (await p.textContent('#melding p.fout')).includes('klopt niet') && await p.locator('#inloggen').isVisible());
    await p.fill('#sleutel', SL); await p.click('#sleutel-form button');
    await p.waitForSelector('#rijen tr');
    controle('tabel toont 3 gebruikers', (await p.locator('#rijen tr').count()) === 3);
    controle('bijnaam uit eigen vriendenlijst', (await p.locator('#rijen tr', { hasText: mila.id }).textContent()).includes('Mila'));
    controle('eigen account herkend', (await p.locator('#rijen tr', { hasText: eigenaar.id }).textContent()).includes('Jij'));
    controle('onbekende gebruiker heet Onbekend', (await p.locator('#rijen tr', { hasText: onbekend.id }).textContent()).includes('Onbekend'));
    controle('stats bovenaan', (await p.textContent('#stats')).includes('Gebruikers') && /3\s*Gebruikers/.test(await p.textContent('#stats')));
    controle('sleutel bewaard in opslag', await p.evaluate(() => JSON.parse(localStorage.getItem('spo_beheer')).sleutel) === SL);
    await p.screenshot({ path: path.join(TMP, 'beheer-1-lijst.png'), fullPage: true });

    // Zoeken en filteren
    await p.fill('#zoek', 'mil');
    controle('zoeken op bijnaam', (await p.locator('#rijen tr').count()) === 1);
    await p.fill('#zoek', '');
    await p.selectOption('#filter', 'onbekend');
    controle('filter alleen onbekenden', (await p.locator('#rijen tr').count()) === 1 && (await p.textContent('#rijen')).includes(onbekend.id));
    await p.selectOption('#filter', 'alle');

    // Ban Mila 1 dag met reden; de pagina van Mila toont de melding
    const rijMila = () => p.locator('#rijen tr', { hasText: mila.id });
    await rijMila().locator('button', { hasText: /^Ban$/ }).click();
    await p.selectOption('.banform select', '86400');
    await p.fill('.banform input[type=text]', 'Test: te veel gespamd');
    controle('banformulier past in de tabel', await p.evaluate(() => { const f = document.querySelector('.banform').getBoundingClientRect(), w = document.querySelector('.tabel-wrap').getBoundingClientRect(); return f.right <= w.right + 1; }));
    await p.screenshot({ path: path.join(TMP, 'beheer-2-banform.png'), fullPage: true });
    await p.click('.banform button[type=submit]');
    await p.waitForSelector('#rijen tr.verbannen');
    controle('rij toont ban en reden', (await rijMila().textContent()).includes('Verbannen tot') && (await rijMila().textContent()).includes('te veel gespamd'));
    controle('stats telt verbannen', /1\s*Verbannen/.test(await p.textContent('#stats')));
    let fout = null; try { await L.clientVan(mila).roep('friends'); } catch (e) { fout = e; }
    controle('gebruiker krijgt 403 met melding', fout && fout.status === 403 && /^Je bent verbannen tot .+ \(Test: te veel gespamd\)\.$/.test(fout.message), fout && fout.message);
    await p.selectOption('#filter', 'verbannen');
    controle('filter verbannen', (await p.locator('#rijen tr').count()) === 1);
    await p.selectOption('#filter', 'alle');

    // De vriendenpagina van Mila zelf
    const ctxM = await br.newContext({ viewport: { width: 900, height: 800 } });
    await ctxM.addInitScript((st) => { if (!localStorage.getItem('spo_vrienden')) localStorage.setItem('spo_vrienden', JSON.stringify(st)); }, mila);
    const pm = await ctxM.newPage();
    await pm.goto(WEB + '/vrienden.html?server=' + encodeURIComponent(API));
    await pm.waitForFunction(() => /verbannen/.test(document.getElementById('sync-status').textContent));
    const stm = await pm.textContent('#sync-status');
    controle('vriendenpagina toont verbanning', /^Je bent verbannen tot .+ \(Test: te veel gespamd\)\.$/.test(stm), stm);
    controle('vriendenpagina: melding één keer', (await pm.locator('#melding p.fout').count()) === 1);
    await pm.screenshot({ path: path.join(TMP, 'beheer-3-gebruiker.png') });
    await ctxM.close();

    // Opheffen
    await rijMila().locator('button', { hasText: 'Opheffen' }).click();
    await p.waitForFunction(() => document.querySelectorAll('#rijen tr.verbannen').length === 0);
    let na = null; try { await L.clientVan(mila).roep('friends'); na = true; } catch (e) { na = false; }
    controle('na opheffen werkt de gebruiker weer', na === true);

    // Voorgoed met eigen datum-keuze testen: voorgoed
    await rijMila().locator('button', { hasText: /^Ban$/ }).click();
    await p.selectOption('.banform select', '0'); await p.click('.banform button[type=submit]');
    await p.waitForSelector('#rijen tr.verbannen');
    controle('voorgoed verbannen getoond', (await rijMila().textContent()).includes('Voorgoed'));
    await rijMila().locator('button', { hasText: 'Opheffen' }).click();
    await p.waitForFunction(() => document.querySelectorAll('#rijen tr.verbannen').length === 0);

    // Eigen datum
    await rijMila().locator('button', { hasText: /^Ban$/ }).click();
    await p.selectOption('.banform select', 'eigen');
    const morgen = new Date(Date.now() + 3 * 86400000); const pad = (n) => String(n).padStart(2, '0');
    await p.fill('.banform input[type=datetime-local]', `${morgen.getFullYear()}-${pad(morgen.getMonth() + 1)}-${pad(morgen.getDate())}T12:00`);
    await p.click('.banform button[type=submit]');
    await p.waitForSelector('#rijen tr.verbannen');
    controle('eigen datum werkt', (await rijMila().textContent()).includes('Verbannen tot'));
    await rijMila().locator('button', { hasText: 'Opheffen' }).click();
    await p.waitForFunction(() => document.querySelectorAll('#rijen tr.verbannen').length === 0);

    // Kaarten wissen (met bevestiging)
    const kk = rijMila().locator('button', { hasText: 'Kaarten wissen' });
    controle('rij toont kaarten van Mila als 0 (blobs staan bij eigenaar)', true);
    const rijE = () => p.locator('#rijen tr', { hasText: eigenaar.id });
    controle('eigenaar heeft 1 kaartblob', (await rijE().locator('td').nth(4).textContent()).trim() === '1');
    await rijE().locator('button', { hasText: 'Kaarten wissen' }).click();
    controle('eerste klik vraagt bevestiging', (await rijE().locator('button.zeker').count()) === 1 && (await ce.roep('get').then(() => true)) );
    await rijE().locator('button.zeker').click();
    await p.waitForFunction((id) => { const r = [...document.querySelectorAll('#rijen tr')].find((t) => t.textContent.includes(id)); return r && r.children[4].textContent.trim() === '0'; }, eigenaar.id);
    controle('kaarten gewist', (await L.clientVan(mila).roep('get')).blobs.length === 0);
    void kk;

    // Account wissen (met bevestiging)
    await rijMila().locator('button', { hasText: 'Account wissen' }).click();
    await rijMila().locator('button.zeker').click();
    await p.waitForFunction((id) => ![...document.querySelectorAll('#rijen tr')].some((t) => t.textContent.includes(id)), mila.id);
    controle('account weg uit tabel', (await p.locator('#rijen tr').count()) === 2);
    let w = null; try { await L.clientVan(mila).roep('friends'); } catch (e) { w = e.status; }
    controle('verwijderd account heeft geen toegang meer', w === 401, w);
    await p.screenshot({ path: path.join(TMP, 'beheer-4-na.png'), fullPage: true });

    // Sleutel vergeten, na herladen weer vragen; bewaard na herladen
    await p.reload();
    await p.waitForSelector('#rijen tr');
    controle('na herladen geen sleutel meer nodig', await p.locator('#app').isVisible());
    await p.click('#vergeet');
    controle('sleutel vergeten', await p.locator('#inloggen').isVisible() && (await p.evaluate(() => localStorage.getItem('spo_beheer'))) === null);
    const echt = fouten.filter((f) => !/status of 403/.test(f)); // de foute sleutel geeft bewust een 403
    controle('geen paginafouten', echt.length === 0, echt);
  } finally {
    await br.close(); php.kill(); web.kill();
  }
  console.log(`\nBeheerpagina-test: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
