// Paginatest in headless Chromium: twee browsercontexts vinden elkaar via de php-server.
// Gebruik: export NODE_PATH=$(npm root -g); (cd extension && npx http-server -p 8123 -s -c-1 . &) ; node server/test/pagina.test.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const MAP = path.resolve(__dirname, '..');
const TMP = '/tmp/claude-0/-home-user/fa7dcd47-c58c-5823-9bf8-08f642143e43/scratchpad/vrienden';
fs.mkdirSync(TMP, { recursive: true });
const DB = path.join(TMP, 'pagina.sqlite');
const PAGINA = 'http://localhost:8123/vrienden.html?server=' + encodeURIComponent('http://localhost:8150/api.php');
let ok = 0, mis = 0;
function controle(naam, waar, extra) { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

function galerij(vak, basis) {
  const t = [[4.9, 0], [6.4, 1], [8.1, 2], [9.4, 3], [9.97, 4]];
  return t.map(([c, tier], i) => ({ id: `${vak}-${i}`, ts: 1760000000000 + (basis + i) * 86400000, vak, cijfer: c, onderwerp: 'Toets ' + (i + 1), weging: 2, opening: 'pak', tier, kaart: 'data:image/png;base64,AAAA' }));
}

(async () => {
  try { fs.unlinkSync(DB); } catch (e) { /* nieuw */ }
  await new Promise((res, rej) => {
    const f = path.join(TMP, 'schema2.php');
    fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2]));`);
    spawn('php', [f, DB, path.join(MAP, 'schema.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res()));
  });
  const php = spawn('php', ['-S', 'localhost:8150', '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB }), stdio: 'ignore' });
  const br = await chromium.launch();
  try {
    for (let i = 0; i < 50; i++) { try { await fetch('http://localhost:8150/api.php', { method: 'OPTIONS' }); break; } catch (e) { await slaap(100); } }
    const maak = async (naam, gal) => {
      const ctx = await br.newContext({ viewport: { width: 900, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
      await ctx.addInitScript((g) => { if (!localStorage.getItem('spo_galerij')) localStorage.setItem('spo_galerij', JSON.stringify(g)); }, gal);
      const p = await ctx.newPage();
      const fouten = [];
      p.on('pageerror', (e) => fouten.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
      await p.goto(PAGINA);
      return { ctx, p, fouten, naam };
    };
    const A = await maak('A', galerij('Wiskunde', 0));
    const B = await maak('B', galerij('Engels', 10));

    // Uitleg, nog niets naar de server
    controle('uitleg zichtbaar', await A.p.locator('#uitleg').isVisible() && !(await A.p.locator('#app').isVisible()));
    await A.p.screenshot({ path: path.join(TMP, '1-uitleg.png'), fullPage: true });
    await A.p.click('#aanzetten'); await B.p.click('#aanzetten');
    await A.p.waitForSelector('#mijn-code'); await B.p.waitForFunction(() => document.getElementById('mijn-code').value.startsWith('SPO1-'));
    await A.p.waitForFunction(() => document.getElementById('mijn-code').value.startsWith('SPO1-'));
    const codeB = await B.p.inputValue('#mijn-code'), codeA = await A.p.inputValue('#mijn-code');
    controle('codes hebben formaat', /^SPO1-[0-9a-f]{32}-[\w-]{87}$/.test(codeA) && codeA !== codeB);
    await A.p.click('#kopieer');
    controle('kopieer-knop zet klembord', (await A.p.evaluate(() => navigator.clipboard.readText())) === codeA);

    // A voegt B toe
    await A.p.fill('#t-code', 'onzin'); await A.p.fill('#t-alias', 'Fout');
    await A.p.click('#toevoegen button[type=submit]');
    await A.p.waitForSelector('#melding p.fout');
    controle('ongeldige code geeft melding', /geldige vriendcode/.test(await A.p.textContent('#melding p.fout')));
    await A.p.fill('#t-code', codeB); await A.p.fill('#t-alias', 'Sanne');
    await A.p.click('#toevoegen button[type=submit]');
    await A.p.waitForSelector('.vriend');
    controle('A ziet Sanne wacht op antwoord', /Sanne/.test(await A.p.textContent('.vriend')) && /Wacht op antwoord/.test(await A.p.textContent('.vriend')));

    // B synchroniseert en accepteert
    await B.p.click('#sync');
    await B.p.waitForSelector('#verzoeken .verzoek');
    await B.p.screenshot({ path: path.join(TMP, '2-verzoek.png'), fullPage: true });
    const vcB = (await B.p.textContent('#verzoeken .v-code')).trim();
    controle('verzoek toont veiligheidscode', /^(\d{5} ){5}\d{5}$/.test(vcB), vcB);
    await B.p.click('#verzoeken .knop.goud');
    await B.p.waitForSelector('#melding p.fout');
    await B.p.fill('#verzoeken input[type=text]', 'Daan');
    await B.p.click('#verzoeken .knop.goud');
    await B.p.waitForFunction(() => /Bevestig eerst/.test(document.getElementById('melding').textContent));
    controle('accepteren zonder bevestiging geweigerd', !!(await B.p.locator('#verzoeken .verzoek').count()));
    await B.p.check('#verzoeken .bevestig input');
    await B.p.click('#verzoeken .knop.goud');
    await B.p.waitForSelector('#vrienden .vriend');
    controle('B ziet Daan als vriend', /Daan/.test(await B.p.textContent('#vrienden')));

    await A.p.click('#sync');
    await A.p.waitForFunction(() => /Vriend/.test(document.querySelector('.vriend .badge')?.textContent || '') && !!document.querySelector('.vriend .v-code'));
    const vcA = (await A.p.textContent('.vriend .v-code')).trim();
    const vcB2 = (await B.p.textContent('.vriend .v-code')).trim();
    controle('beide kanten zelfde veiligheidscode', vcA === vcB2 && vcA === vcB, [vcA, vcB2]);
    await A.p.click('.vriend .veilig .knop');
    await A.p.waitForSelector('.vriend .geverifieerd');
    controle('geverifieerd met vinkje en lokaal opgeslagen', /\u2713/.test(await A.p.textContent('.geverifieerd')) && /"geverifieerd":true/.test(await A.p.evaluate(() => localStorage.getItem('spo_vrienden'))));

    // Delen: A deelt alles; B selecteert 2 kaarten
    await A.p.click('#sync');
    await A.p.waitForFunction(() => /Vriend/.test(document.querySelector('.vriend .badge')?.textContent || ''));
    await A.p.selectOption('.vriend select', 'alles');
    await B.p.selectOption('.vriend select', 'selectie');
    const vinks = B.p.locator('.vriend .selectie input');
    await vinks.nth(1).check(); await vinks.nth(4).check();
    await slaap(1200);
    await B.p.click('#sync'); await A.p.click('#sync');
    await A.p.waitForFunction(() => document.querySelectorAll('.v-cijfers .cijferkaart').length === 2);
    await B.p.waitForFunction(() => document.querySelectorAll('.v-cijfers .cijferkaart').length === 5);
    const tekstA = await A.p.textContent('.v-cijfers');
    controle('A ziet 2 gekozen kaarten van Sanne (Engels)', /Engels/.test(tekstA) && /6,4/.test(tekstA) && /9,97|10,0/.test(tekstA), tekstA);
    controle('B ziet 5 kaarten van Daan', (await B.p.locator('.v-cijfers .cijferkaart').count()) === 5);
    controle('tierklassen aanwezig', (await B.p.locator('.cijferkaart.t4').count()) === 1);
    await A.p.screenshot({ path: path.join(TMP, '3-vrienden-desktop.png'), fullPage: true });
    await B.p.screenshot({ path: path.join(TMP, '3b-vrienden-b.png'), fullPage: true });

    // Cijfers van vrienden niet op schijf
    const opslag = await A.p.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    controle('geen vriendcijfers in opslag', !/Engels/.test(opslag) && !/6,4|6\.4/.test(JSON.parse(JSON.parse(opslag).spo_vrienden ? JSON.stringify(JSON.parse(opslag).spo_vrienden) : '""')));
    controle('alias lokaal opgeslagen', /Sanne/.test(opslag));

    // Telefoon
    await A.p.setViewportSize({ width: 375, height: 800 });
    await A.p.screenshot({ path: path.join(TMP, '4-vrienden-telefoon.png'), fullPage: true });
    controle('geen horizontale scroll op telefoon', await A.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), await A.p.evaluate(() => document.documentElement.scrollWidth));

    // Verwijderen met bevestiging
    const weg = B.p.locator('.vriend .knop.gevaar');
    await weg.click();
    controle('bevestiging gevraagd', /Zeker/.test(await weg.textContent()) && (await B.p.locator('.vriend').count()) === 1);
    await weg.click();
    await B.p.waitForFunction(() => !document.querySelector('.vriend'));
    await A.p.click('#sync');
    await A.p.waitForFunction(() => /Weggevallen/.test(document.querySelector('.vriend .badge')?.textContent || ''));
    controle('A ziet vriend weggevallen', true);
    await A.p.screenshot({ path: path.join(TMP, '5-weggevallen.png'), fullPage: true });

    // Alles wissen
    const wis = A.p.locator('#wis');
    await wis.click(); await wis.click();
    await A.p.waitForSelector('#uitleg:not([hidden])');
    controle('na wissen terug naar uitleg en opslag leeg', await A.p.evaluate(() => localStorage.getItem('spo_vrienden') === null && !!localStorage.getItem('spo_galerij')));
    await A.p.reload();
    controle('na herladen uitleg', await A.p.locator('#uitleg').isVisible());
    controle('geen consolefouten', A.fouten.length === 0 && B.fouten.length === 0, A.fouten.concat(B.fouten));
  } finally { await br.close(); php.kill(); }
  console.log(`\nPaginatest: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
