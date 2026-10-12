// Beheerpagina-test in headless Chromium tegen een lokale php-server (beheer aan): ban, melding bij de gebruiker, opheffen, wissen, tabblad Meldingen (v3).
// Gebruik: export NODE_PATH=$(npm root -g); node server/test/beheer.test.js
const { spawn, execFileSync } = require('node:child_process');
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
  const php = spawn('php', ['-S', 'localhost:8160', '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB, SPO_BEHEER: SL, SPO_LIMIET_BEHEER: '1000' }), stdio: 'ignore' });
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

    // ===== v3: tabblad Meldingen =====
    {
      const sqlDb = (q, par) => JSON.parse(execFileSync('php', ['-r', '$d=new PDO("sqlite:".$argv[1]);$s=$d->prepare($argv[2]);$s->execute(json_decode($argv[3],true));echo json_encode($s->columnCount()?$s->fetchAll(PDO::FETCH_ASSOC):[]);', '--', DB, q, JSON.stringify(par || [])]).toString() || '[]');
      const [r1, r2, t1, t2, t3, t4] = [await maak(), await maak(), await maak(), await maak(), await maak(), await maak()];
      const BEW = 'GEHEIM-BEWIJS: ' + 'x'.repeat(30) + ' <b>niet vet</b>';
      await L.clientVan(r1).roep('meld', { tegen: t1.id, reden: 'pesten', uitleg: 'Scheldt in zijn naam.', bewijs: BEW });
      await L.clientVan(r2).roep('meld', { tegen: t1.id, reden: 'naam', uitleg: 'Rare naam.' });
      await L.clientVan(r1).roep('meld', { tegen: t2.id, reden: 'spam', uitleg: 'Stuurt steeds verzoeken.' });
      await L.clientVan(r1).roep('meld', { tegen: t3.id, reden: 'tekst', uitleg: 'Onbetamelijke tekst.', bewijs: 'tekst die niet mag' });
      await L.clientVan(r2).roep('meld', { tegen: t4.id, reden: 'anders', uitleg: 'Vervelend.' });
      await p.click('#ververs');
      await p.waitForFunction(() => document.getElementById('meld-teller') && !document.getElementById('meld-teller').hidden);
      controle('teller bij tabblad Meldingen', (await p.textContent('#meld-teller')) === '5');
      controle('tabblad Gebruikers staat open, meldingen verborgen', await p.locator('#paneel-gebruikers').isVisible() && !(await p.locator('#paneel-meldingen').isVisible()) && (await p.getAttribute('#tab-gebruikers', 'aria-selected')) === 'true');
      await p.click('#tab-meldingen');
      controle('tab Meldingen: aria-selected en paneel zichtbaar', (await p.getAttribute('#tab-meldingen', 'aria-selected')) === 'true' && await p.locator('#paneel-meldingen').isVisible() && !(await p.locator('#paneel-gebruikers').isVisible()));
      await p.keyboard.press('ArrowLeft');
      controle('pijltjestoets wisselt van tab', await p.locator('#paneel-gebruikers').isVisible());
      await p.keyboard.press('ArrowRight');
      controle('en weer terug', await p.locator('#paneel-meldingen').isVisible());
      const kaart = (id) => p.locator('#meldlijst .meld', { hasText: id });
      controle('5 nieuwe meldingen getoond (nieuw eerst)', (await p.locator('#meldlijst .meld').count()) === 5);
      const tekstK = await kaart(t1.id).first().textContent();
      controle('kaart toont reden, ids en aantal meldingen tegen dit id', /Pesten|Naam/.test(tekstK) && tekstK.includes(r1.id) && tekstK.includes(t1.id) && /Meldingen tegen dit id2/.test(tekstK), tekstK);
      controle('bewijs staat niet in de pagina voor het klikken', !(await p.content()).includes('GEHEIM-BEWIJS') && (await kaart(t1.id).locator('blockquote.bewijs:visible').count()) === 0);
      controle('melding zonder bewijs: geen knop, wel tekst', (await kaart(t2.id).locator('button', { hasText: 'Toon bewijs' }).count()) === 0 && (await kaart(t2.id).textContent()).includes('Geen bewijs meegestuurd'));
      controle('rode IP-waarschuwing bij veel accounts', /Dit IP is de laatste 30 dagen door \d+ accounts gebruikt: waarschijnlijk een school of gedeeld wifi/.test(await kaart(t2.id).locator('.ip-waarschuwing').textContent()) && (await kaart(t2.id).locator('.ip-waarschuwing').getAttribute('role')) === 'alert');
      const kBew = kaart(t1.id).filter({ hasText: 'Scheldt' });
      await kBew.locator('button', { hasText: 'Toon bewijs' }).click();
      await p.waitForSelector('blockquote.bewijs:visible');
      controle('na klikken staat het bewijs er (als tekst, niet als html)', (await kBew.locator('blockquote.bewijs').textContent()) === BEW && (await kBew.locator('blockquote.bewijs b').count()) === 0 && (await kBew.locator('button', { hasText: 'Verberg bewijs' }).getAttribute('aria-expanded')) === 'true');
      await p.screenshot({ path: path.join(TMP, 'beheer-5-meldingen.png'), fullPage: true });
      await kBew.locator('button', { hasText: 'Verberg bewijs' }).click();
      controle('bewijs weer te verbergen en uit de pagina', (await kBew.locator('blockquote.bewijs:visible').count()) === 0 && !(await kBew.locator('blockquote.bewijs').textContent()));

      // Negeren
      await kaart(t4.id).locator('button', { hasText: 'Negeren' }).click();
      await p.waitForFunction(() => document.querySelectorAll('#meldlijst .meld').length === 4);
      controle('negeren: melding uit de lijst, teller 4', (await p.textContent('#meld-teller')) === '4');
      await p.selectOption('#meld-filter', 'klaar');
      controle('afgehandeld: toont de uitkomst', (await p.locator('#meldlijst .meld').count()) === 1 && (await p.textContent('#meldlijst')).includes('Genegeerd'));
      await p.selectOption('#meld-filter', 'nieuw');

      // Waarschuwen (reden verplicht)
      await kaart(t3.id).locator('button', { hasText: 'Waarschuwen' }).click();
      await p.click('.meldform button[type=submit]');
      controle('waarschuwen zonder reden lukt niet', (await p.locator('.meldform').count()) === 1 && (await L.clientVan(t3).roep('puls')).w === 0);
      await p.fill('.meldform input[type=text]', 'Houd het netjes');
      controle('waarschuwen: geen vinkjes voor bans', (await p.locator('.meldform input[type=checkbox]').count()) === 0);
      await p.click('.meldform button[type=submit]');
      await p.waitForFunction(() => document.querySelectorAll('#meldlijst .meld').length === 3);
      const wl = await L.clientVan(t3).roep('waarschuwingen');
      controle('waarschuwing is aangekomen bij de gebruiker', (await L.clientVan(t3).roep('puls')).w === 1 && wl.lijst.length === 1 && wl.lijst[0].reden === 'Houd het netjes');

      // Tijdelijk bannen: bevestigingsvenster, annuleren, dan echt
      await kaart(t2.id).locator('button', { hasText: 'Tijdelijk bannen' }).click();
      controle('tijdelijk: duurkeuze 1 uur, 1 dag, 7 dagen, 30 dagen', (await p.locator('.meldform select option').allTextContents()).join('|') === '1 uur|1 dag|7 dagen|30 dagen');
      controle('IP-vinkje staat standaard uit bij veel accounts op het ip', (await p.locator('.meldform input[type=checkbox]').nth(1).isChecked()) === false && (await p.locator('.meldform input[type=checkbox]').nth(0).isChecked()) === false);
      controle('uitleg waarom het IP-vinkje uit staat', (await p.textContent('.meldform')).includes('gedeeld'));
      await p.selectOption('.meldform select', '3600');
      await p.fill('.meldform input[type=text]', 'Spam');
      await p.check('.meldform input[type=checkbox] >> nth=0');
      await p.click('.meldform button[type=submit]');
      await p.waitForSelector('dialog#bevestig[open]');
      const bevT = await p.textContent('#bev-regels');
      controle('bevestigingsvenster toont wie, hoe lang en de keuzes', bevT.includes(t2.id) && /1 uur/.test(bevT) && /Spam/.test(bevT) && /e-mailadres blokkeren: ja/.test(bevT) && /IP blokkeren \(max\. 7 dagen\): nee/.test(bevT), bevT);
      controle('focus staat op Annuleren (veilige keuze)', await p.evaluate(() => document.activeElement && document.activeElement.id === 'bev-nee'));
      await p.screenshot({ path: path.join(TMP, 'beheer-6-bevestig.png') });
      await p.click('#bev-nee');
      controle('annuleren: er is niets gebeurd', (await L.clientVan(t2).roep('mijnStatus')).verbannen === false && (await p.locator('#meldlijst .meld').count()) === 3);
      await p.click('.meldform button[type=submit]');
      await p.waitForSelector('dialog#bevestig[open]');
      await p.click('#bev-ja');
      await p.waitForFunction(() => document.querySelectorAll('#meldlijst .meld').length === 2);
      const stT2 = await L.clientVan(t2).roep('mijnStatus');
      controle('ban is gezet voor 1 uur met reden', stT2.verbannen === true && Math.abs(stT2.tot - (Math.floor(Date.now() / 1000) + 3600)) < 30 && stT2.reden === 'Spam', stT2);
      controle('IP niet geblokkeerd (vinkje stond uit)', Number(sqlDb('SELECT COUNT(*) AS n FROM ban_ip')[0].n) === 0);
      await p.selectOption('#meld-filter', 'klaar');
      controle('afgehandelde melding noemt de uitkomst', (await p.textContent('#meldlijst')).includes('Verbannen (1 uur)'));
      await p.selectOption('#meld-filter', 'nieuw');

      // Weinig accounts op het ip: vinkje standaard aan; permanent bannen met ook IP (altijd max. 7 dagen)
      sqlDb('DELETE FROM acc_ip WHERE account <> ? AND account <> ?', [t1.id, r1.id]);
      await p.click('#meld-ververs');
      await p.waitForFunction(() => !document.querySelector('#meldlijst .ip-waarschuwing'));
      controle('geen rode waarschuwing bij 2 accounts op het ip', (await p.locator('#meldlijst .ip-waarschuwing').count()) === 0);
      await kaart(t1.id).first().locator('button', { hasText: 'Permanent bannen' }).click();
      controle('permanent: geen duurkeuze, IP-vinkje staat aan', (await p.locator('.meldform select').count()) === 0 && (await p.locator('.meldform input[type=checkbox]').nth(1).isChecked()) === true);
      await p.click('.meldform button[type=submit]');
      controle('reden is verplicht bij een ban (formulier blijft)', (await p.locator('dialog#bevestig[open]').count()) === 0 && (await p.locator('.meldform').count()) === 1);
      await p.fill('.meldform input[type=text]', 'Pesten');
      await p.click('.meldform button[type=submit]');
      await p.waitForSelector('dialog#bevestig[open]');
      controle('bevestiging noemt voorgoed en ook IP', /voorgoed/.test(await p.textContent('#bev-regels')) && /IP blokkeren \(max\. 7 dagen\): ja/.test(await p.textContent('#bev-regels')));
      await p.click('#bev-ja');
      await p.waitForFunction(() => document.querySelectorAll('#meldlijst .meld').length === 0);
      const stT1 = await L.clientVan(t1).roep('mijnStatus');
      const ipb = sqlDb('SELECT tot FROM ban_ip');
      controle('permanent verbannen, maar de ip-ban duurt hoogstens 7 dagen', stT1.verbannen === true && stT1.tot === 0 && ipb.length === 1 && Number(ipb[0].tot) > 0 && Number(ipb[0].tot) - Math.floor(Date.now() / 1000) <= 604800 + 10, [stT1, ipb]);
      await p.selectOption('#meld-filter', 'alle');
      controle('Alle meldingen: 5 stuks', (await p.locator('#meldlijst .meld').count()) === 5);
      controle('beide meldingen over t1 staan op afgehandeld', (await p.locator('#meldlijst .meld.klaar').count()) === 5 || (await p.locator('#meldlijst .meld.klaar').count()) >= 4);
      await p.screenshot({ path: path.join(TMP, 'beheer-7-meldingen-klaar.png'), fullPage: true });
      // Ban opheffen vanuit de melding ruimt ook het ip op
      controle('meldingen bevatten geen onverwachte gegevens (geen e-mail/ip in de pagina)', !/@|127\.0\.0\.1/.test(await p.textContent('#paneel-meldingen')));
      await L.clientVan(t1).roep('mijnStatus');
      await p.selectOption('#meld-filter', 'nieuw');
      await p.click('#tab-gebruikers');
      const rijT1 = p.locator('#rijen tr', { hasText: t1.id });
      await rijT1.locator('button', { hasText: 'Opheffen' }).click();
      await p.waitForFunction(() => document.querySelectorAll('#rijen tr.verbannen').length === 1);
      controle('opheffen via gebruikerstab ruimt ook ban_ip op', Number(sqlDb('SELECT COUNT(*) AS n FROM ban_ip')[0].n) === 0);
      // mobiel
      await p.setViewportSize({ width: 390, height: 800 });
      await p.click('#tab-meldingen'); await p.selectOption('#meld-filter', 'alle');
      controle('mobiel: geen horizontale scroll in het meldingenpaneel', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]));
      await p.screenshot({ path: path.join(TMP, 'beheer-8-mobiel.png'), fullPage: true });
      await p.setViewportSize({ width: 1280, height: 900 });
      await p.click('#tab-gebruikers');
    }

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
