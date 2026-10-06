// Paginatest in headless Chromium: twee browsercontexts vinden elkaar via de php-server.
// Gebruik: export NODE_PATH=$(npm root -g); (cd extension && npx http-server -p 8123 -s -c-1 . &) ; node server/test/pagina.test.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
// De lib draait hier ook in Node (voor een 'kwaadwillende vriend' die rechtstreeks een blob naar de server stuurt).
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require('../../extension/vriendenlib.js');

const MAP = path.resolve(__dirname, '..');
const TMP = process.env.SPO_TMP || '/tmp/vrienden-scratch';
fs.mkdirSync(TMP, { recursive: true });
const DB = path.join(TMP, 'pagina.sqlite');
const WEB = 'http://localhost:8123';
const PAGINA = WEB + '/vrienden.html?server=' + encodeURIComponent('http://localhost:8150/api.php');
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

    // ===================== Reacties, raden en uitslag in de pagina =====================
    // A (bijnaam 'Sanne' voor B) reageert op kaarten van B; B (bijnaam 'Daan' voor A) laat A raden.
    await A.p.setViewportSize({ width: 900, height: 900 });
    await A.p.click('#sync'); await B.p.click('#sync');
    await A.p.waitForFunction(() => document.querySelectorAll('.v-cijfers .cijferkaart').length === 2);
    const idB = await B.p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')).id);
    const idA = await A.p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')).id);
    const kaartA = (n) => A.p.locator('.vriend .cijferkaart').nth(n);
    const knopNaam = (n, naam) => kaartA(n).getByRole('button', { name: naam, exact: true });
    controle('Raden-sectie en reactie-sectie zijn er voor wie vrienden heeft', await A.p.locator('#raden-sectie').isVisible() && await A.p.locator('#reacties-sectie').isVisible());
    controle('elke kaart van een vriend heeft zes emoji-knoppen met Nederlandse labels', (await A.p.locator('.cijferkaart .reageer button').count()) === 12
      && JSON.stringify(await kaartA(0).locator('.reageer button').evaluateAll((l) => l.map((b) => b.getAttribute('aria-label')))) === JSON.stringify(['Reageer met vuur', 'Reageer met verbazing', 'Reageer met applaus', 'Reageer met lachen', 'Reageer met schedel', 'Reageer met hart']));
    controle('de emoji-knoppen staan in een groep met een label', /^Reacties op Engels/.test(await kaartA(0).locator('.reageer').getAttribute('aria-label')) && (await kaartA(0).locator('.reageer').getAttribute('role')) === 'group');
    const gedrukt = async (n) => kaartA(n).locator('.reageer button').evaluateAll((l) => l.map((b) => b.getAttribute('aria-pressed')).join());
    controle('begin: geen reactie gekozen', (await gedrukt(0)) === 'false,false,false,false,false,false');
    await knopNaam(0, 'Reageer met vuur').click();
    controle('klik op vuur: alleen vuur ingedrukt', (await gedrukt(0)) === 'true,false,false,false,false,false');
    controle('de focus blijft op de knop na klikken', await A.p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Reageer met vuur');
    await knopNaam(0, 'Reageer met applaus').click();
    controle('andere emoji vervangt de eerste (max. 1 per kaart)', (await gedrukt(0)) === 'false,false,true,false,false,false');
    await knopNaam(0, 'Reageer met applaus').click();
    controle('opnieuw klikken haalt de reactie weg', (await gedrukt(0)) === 'false,false,false,false,false,false');
    await knopNaam(0, 'Reageer met vuur').focus(); await A.p.keyboard.press('Enter');
    controle('werkt ook met het toetsenbord', (await gedrukt(0)) === 'true,false,false,false,false,false');
    await knopNaam(1, 'Reageer met hart').click();
    const reA = await A.p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')).reacties);
    controle('reacties lokaal opgeslagen als { vriendId: { kaartId: emoji } }', JSON.stringify(reA[idB]) === JSON.stringify({ 'Engels-4': '\u{1F525}', 'Engels-1': '\u2764\uFE0F' }), JSON.stringify(reA));
    await slaap(1300);

    // B ziet de reacties met de bijnaam die hij zelf voor A koos
    await B.p.click('#sync');
    await B.p.waitForFunction(() => document.querySelectorAll('#reacties .rkaart').length === 2);
    const tekstReB = await B.p.textContent('#reacties');
    controle('B ziet bij zijn kaarten wie reageerde, met zijn eigen bijnaam (Daan)', /Daan/.test(tekstReB) && !/Sanne/.test(tekstReB) && /Engels/.test(tekstReB));
    controle('de reacties hebben een naam voor schermlezers', JSON.stringify(await B.p.locator('#reacties .r-emoji').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')).sort())) === JSON.stringify(['hart', 'vuur']));
    controle('de sectie met reacties heeft een kop', /Reacties op jouw kaarten/.test(await B.p.textContent('#re-titel')));

    // --- Voorspel mijn cijfer: B heeft twee ongeopende cijfers (de extensie bewaart ze in spo_dicht) ---
    const hulpB = await B.ctx.newPage(); await hulpB.goto(WEB + '/vrienden.css'); // zelfde herkomst: schrijft in de opslag, B's pagina krijgt een storage-gebeurtenis
    await hulpB.evaluate(() => localStorage.setItem('spo_dicht', JSON.stringify([
      { id: 'sigE1', ts: 1760000000000, vak: 'Engels', onderwerp: 'Hoofdstuk 3', weging: 2 },
      { id: 'sigE2', ts: 1760000100000, vak: 'Aardrijkskunde', onderwerp: '', weging: 1 }])));
    await B.p.waitForFunction(() => document.querySelectorAll('#dicht .dicht-item').length === 2);
    controle('B ziet zijn ongeopende cijfers zonder opnieuw te synchroniseren (storage-gebeurtenis)', true);
    const dichtTekst = await B.p.textContent('#dicht');
    controle('ongeopende cijfers: vak, onderwerp en weging, geen cijfer', /Engels/.test(dichtTekst) && /Hoofdstuk 3 · weging 2/.test(dichtTekst) && /Aardrijkskunde/.test(dichtTekst) && !/\d,\d/.test(dichtTekst), dichtTekst);
    const raadKnop = B.p.locator('.dicht-item').first().getByRole('button', { name: 'Laat vrienden raden' });
    controle('knop Laat vrienden raden is er en heeft aria-expanded', (await raadKnop.getAttribute('aria-expanded')) === 'false');
    await raadKnop.click();
    controle('formulier opent met alle vrienden aangevinkt en uitleg over wat vrienden zien', await B.p.locator('.raadform').isVisible() && (await B.p.locator('.raadform input[type=checkbox]:checked').count()) === 1
      && /Daan/.test(await B.p.textContent('.raadform fieldset')) && /niet het cijfer zelf/.test(await B.p.textContent('.raadform')) && (await raadKnop.getAttribute('aria-expanded')) === 'true');
    controle('de focus gaat naar het formulier', await B.p.evaluate(() => !!document.activeElement.closest('.raadform')));
    await B.p.setViewportSize({ width: 390, height: 844 });
    await B.p.locator('.raadform').scrollIntoViewIfNeeded();
    await B.p.screenshot({ path: path.join(TMP, '9-raadformulier-telefoon-B.png'), fullPage: true });
    await B.p.setViewportSize({ width: 900, height: 900 });
    await B.p.uncheck('.raadform input[type=checkbox]');
    await B.p.getByRole('button', { name: 'Ronde starten' }).click();
    controle('zonder vrienden geen ronde: melding bij het formulier', /minstens één vriend/.test(await B.p.textContent('.raadform .gok-status')) && (await B.p.locator('#rondes .ronde').count()) === 0);
    await B.p.check('.raadform input[type=checkbox]');
    await B.p.getByRole('button', { name: 'Ronde starten' }).click();
    await B.p.waitForSelector('#rondes .ronde');
    const rondeB = B.p.locator('#rondes .ronde').first();
    controle('ronde gestart: titel, status Nog dicht, knop Toon uitslag is uitgeschakeld', /Engels, Hoofdstuk 3 \(weging 2\)/.test(await rondeB.locator('.r-kop').textContent()) && /Nog dicht/.test(await rondeB.locator('.r-status').textContent())
      && await rondeB.getByRole('button', { name: 'Toon uitslag aan vrienden' }).isDisabled() && /pas delen als je dit cijfer hebt geopend/.test(await rondeB.locator('.uitleg').textContent()));
    controle('de ronde-kop krijgt de focus', await B.p.evaluate(() => document.activeElement.classList.contains('r-kop')));
    controle('het cijfer met een ronde toont Ronde loopt (geen tweede ronde mogelijk)', /Ronde loopt/.test(await B.p.locator('.dicht-item').first().textContent()) && (await B.p.locator('.dicht-item').first().getByRole('button', { name: 'Laat vrienden raden' }).count()) === 0);
    const stB = await B.p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')));
    const ronde1 = stB.raden[0];
    controle('lokaal opgeslagen als ronde met willekeurige rid, sig, naar en uitslagGedeeld=false', stB.raden.length === 1 && /^[0-9a-f]{32}$/.test(ronde1.rid) && ronde1.sig === 'sigE1' && ronde1.rid !== 'sigE1' && !ronde1.rid.includes('sigE1')
      && ronde1.naar.join() === idA && ronde1.uitslagGedeeld === false && ronde1.vak === 'Engels' && ronde1.onderwerp === 'Hoofdstuk 3' && ronde1.weging === 2);

    // A ziet de ronde en gokt
    await A.p.click('#sync');
    await A.p.waitForSelector('.raadblok');
    const vraag = (await A.p.textContent('.raadblok .gok-vraag')).trim();
    controle('A ziet: "Sanne laat je raden: Engels, Hoofdstuk 3 (weging 2). Wat denk je dat Sanne haalde?"', vraag === 'Sanne laat je raden: Engels, Hoofdstuk 3 (weging 2). Wat denk je dat Sanne haalde?', vraag);
    controle('het veld heeft een label en de gok-knop heet Gok opslaan', /Jouw gok/.test(await A.p.locator('.gok-form label').textContent()) && (await A.p.getByRole('button', { name: 'Gok opslaan' }).count()) === 1 && (await A.p.locator('.gok-status').getAttribute('role')) === 'status');
    const gokVeld = A.p.locator('.gok-form input');
    for (const slecht of ['abc', '11', '0,9', '7,25', '']) {
      await gokVeld.fill(slecht);
      await A.p.getByRole('button', { name: 'Gok opslaan' }).click();
      controle('ongeldige gok "' + slecht + '" geeft een melding', /Vul een cijfer in van 1,0 tot 10,0/.test(await A.p.textContent('.gok-status')) && (await gokVeld.getAttribute('aria-invalid')) === 'true', await A.p.textContent('.gok-status'));
    }
    controle('niets opgeslagen bij ongeldige gok', !(await A.p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')).gokken[Object.keys(JSON.parse(localStorage.getItem('spo_vrienden')).gokken)[0]])));
    await gokVeld.fill('7,0');
    await A.p.getByRole('button', { name: 'Gok opslaan' }).click();
    await A.p.waitForFunction(() => /verstuurd naar Sanne/.test(document.querySelector('.gok-status').textContent));
    controle('gok 7,0 opgeslagen, verstuurd en aangekondigd', /Je gok is 7,0 en verstuurd naar Sanne/.test(await A.p.textContent('.gok-status')) && (await gokVeld.getAttribute('aria-invalid')) === null);
    const gokkenA = await A.p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')).gokken);
    controle('gok lokaal opgeslagen als { vriendId: { rid: getal } }', JSON.stringify(gokkenA) === JSON.stringify({ [idB]: { [ronde1.rid]: 7 } }), JSON.stringify(gokkenA));
    await B.p.click('#sync');
    await B.p.waitForFunction(() => /7,0/.test(document.querySelector('#rondes .gokken').textContent));
    controle('B ziet de gok van A met zijn bijnaam', /Daan/.test(await B.p.textContent('#rondes .gokken')) && /7,0/.test(await B.p.textContent('#rondes .gokken')));
    controle('A\'s pagina toont het cijfer nergens (de uitslag is nog niet gedeeld)', !/7,3/.test(await A.p.evaluate(() => document.body.innerText)));
    // gok aanpassen met een punt; concept blijft staan bij opnieuw tekenen en de focus ook
    await gokVeld.fill('7.2');
    await A.p.getByRole('button', { name: 'Gok opslaan' }).click();
    await A.p.waitForFunction(() => /Je gok is 7,2 en verstuurd/.test(document.querySelector('.gok-status').textContent));
    await gokVeld.fill('6,5'); // nog niet opgeslagen
    const hulpA = await A.ctx.newPage(); await hulpA.goto(WEB + '/vrienden.css');
    await hulpA.evaluate(() => localStorage.setItem('spo_dicht', '[]')); // laat A's pagina opnieuw tekenen
    await slaap(400);
    controle('opnieuw tekenen: nog niet opgeslagen gok en focus blijven behouden', (await A.p.inputValue('.gok-form input')) === '6,5' && await A.p.evaluate(() => document.activeElement.tagName === 'INPUT' && document.activeElement.id.startsWith('gok-')));
    await A.p.fill('.gok-form input', '7,2');
    await A.p.getByRole('button', { name: 'Gok opslaan' }).click();
    await A.p.waitForFunction(() => /Je gok is 7,2 en verstuurd/.test(document.querySelector('.gok-status').textContent));
    await B.p.click('#sync');
    await B.p.waitForFunction(() => /7,2/.test(document.querySelector('#rondes .gokken').textContent));
    controle('B ziet de aangepaste gok 7,2', true);

    // het cijfer wordt geopend: B's galerij krijgt de kaart (id === sig)
    await hulpB.evaluate(() => {
      const g = JSON.parse(localStorage.getItem('spo_galerij'));
      g.unshift({ id: 'sigE1', ts: 1760000500000, vak: 'Engels', cijfer: 7.3, onderwerp: 'Hoofdstuk 3', weging: 2, opening: 'pak', tier: 1, kaart: 'data:image/png;base64,AAAA' });
      localStorage.setItem('spo_galerij', JSON.stringify(g));
      localStorage.setItem('spo_dicht', JSON.stringify([{ id: 'sigE2', ts: 1760000100000, vak: 'Aardrijkskunde', onderwerp: '', weging: 1 }]));
    });
    await B.p.waitForFunction(() => !document.querySelector('#rondes .ronde .knop.goud').disabled);
    controle('uitslag-knop wordt actief zodra de galerij het cijfer heeft', true);
    const rB = B.p.locator('#rondes .ronde').first();
    controle('B ziet lokaal het cijfer en wie het dichtst zat', /Geopend: het cijfer is 7,3/.test(await rB.locator('.r-status').textContent()) && /Dichtstbij: Daan \(0,1 ernaast\)/.test(await rB.locator('.r-dichtst').textContent()) && /Als je dit doet, krijgen Daan het cijfer 7,3 te zien/.test(await rB.locator('.uitleg').textContent()));
    controle('het geopende cijfer staat niet meer bij Nog dicht', (await B.p.locator('#dicht .dicht-item').count()) === 1 && !/Engels/.test(await B.p.textContent('#dicht')));
    await A.p.click('#sync');
    await A.p.waitForSelector('.gok-form');
    controle('A ziet het cijfer nog niet (alleen B drukte nog niet op de knop)', !/7,3/.test(await A.p.evaluate(() => document.body.innerText)) && (await A.p.locator('.gok-uitslag').count()) === 0);
    // (de knoptekst verandert bij de eerste klik, dus de knop wordt hier op zijn plek gevonden en niet op zijn naam)
    const uitslagKnop = B.p.locator('#rondes .ronde').first().locator('.knop.goud');
    await rB.getByRole('button', { name: 'Toon uitslag aan vrienden' }).click();
    controle('uitslag delen vraagt eerst om bevestiging', /Zeker\? Cijfer delen/.test(await uitslagKnop.textContent()) && (await B.p.locator('#rondes .ronde .r-status').first().textContent()).includes('Geopend') && (await B.p.locator('#melding').textContent()).indexOf('Uitslag gedeeld') === -1);
    await uitslagKnop.click();
    await B.p.waitForFunction(() => /Uitslag gedeeld met Daan/.test(document.querySelector('#rondes .r-status').textContent));
    controle('uitslag gedeeld: status, melding en geen knop Toon uitslag meer; wel Ronde verwijderen', /Uitslag gedeeld met Daan\. Het cijfer was 7,3/.test(await B.p.textContent('#rondes .r-status')) && /Uitslag gedeeld met Daan/.test(await B.p.textContent('#melding'))
      && (await B.p.getByRole('button', { name: 'Toon uitslag aan vrienden' }).count()) === 0 && (await B.p.getByRole('button', { name: 'Ronde verwijderen' }).count()) === 1);
    const stB2 = await B.p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')));
    controle('lokaal: uitslagGedeeld, cijfer en dichtst vastgelegd', stB2.raden[0].uitslagGedeeld === true && stB2.raden[0].uitslag.cijfer === 7.3 && stB2.raden[0].uitslag.dichtst.join() === idA);
    await A.p.click('#sync');
    await A.p.waitForSelector('.gok-uitslag');
    const uitslagA = (await A.p.textContent('.gok-uitslag')).trim();
    controle('A ziet: "Het cijfer was 7,3. Jij gokte 7,2 (0,1 ernaast)"', uitslagA === 'Het cijfer was 7,3. Jij gokte 7,2 (0,1 ernaast).', uitslagA);
    controle('A ziet dat hij het dichtst zat; geen invulveld meer', /Jij zat het dichtst bij/.test(await A.p.textContent('.gok-dichtst')) && (await A.p.locator('.gok-form').count()) === 0);

    // tweede ronde (blijft open voor de screenshots) en een ronde stoppen
    await B.p.locator('.dicht-item').first().getByRole('button', { name: 'Laat vrienden raden' }).click();
    await B.p.getByRole('button', { name: 'Ronde starten' }).click();
    await B.p.waitForFunction(() => document.querySelectorAll('#rondes .ronde').length === 2);
    await A.p.click('#sync');
    await A.p.waitForFunction(() => document.querySelectorAll('.raadblok .gok').length === 2);
    controle('A ziet de tweede ronde zonder onderwerp netjes: "Aardrijkskunde (weging 1)"', /Aardrijkskunde \(weging 1\)/.test(await A.p.textContent('.raadblok')) && !/Aardrijkskunde, /.test(await A.p.textContent('.raadblok')));
    await A.p.locator('.gok-form input').fill('5,5'); await A.p.getByRole('button', { name: 'Gok opslaan' }).click();
    await A.p.waitForFunction(() => /verstuurd naar Sanne/.test(document.querySelector('.gok-form .gok-status').textContent));
    await B.p.click('#sync');
    await A.p.screenshot({ path: path.join(TMP, '6-raden-desktop-a.png'), fullPage: true });
    await B.p.screenshot({ path: path.join(TMP, '6b-raden-desktop-b.png'), fullPage: true });
    for (const [b, h, naam] of [[390, 844, 'telefoon'], [1280, 800, 'breed']]) {
      await A.p.setViewportSize({ width: b, height: h }); await B.p.setViewportSize({ width: b, height: h });
      await A.p.screenshot({ path: path.join(TMP, `7-vrienden-${naam}-A.png`), fullPage: true });
      await B.p.screenshot({ path: path.join(TMP, `7-vrienden-${naam}-B.png`), fullPage: true });
    }
    for (const b of [360, 390]) {
      await A.p.setViewportSize({ width: b, height: 800 }); await B.p.setViewportSize({ width: b, height: 800 });
      controle(`geen horizontale scroll bij ${b}px (A en B met reacties, rondes en uitslag)`, await A.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && await B.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        [await A.p.evaluate(() => document.documentElement.scrollWidth), await B.p.evaluate(() => document.documentElement.scrollWidth)]);
    }
    await A.p.setViewportSize({ width: 900, height: 900 }); await B.p.setViewportSize({ width: 900, height: 900 });
    const stop = B.p.locator('#rondes .ronde').nth(1).locator('.knop.gevaar');
    await B.p.locator('#rondes .ronde').nth(1).getByRole('button', { name: 'Ronde stoppen' }).click();
    controle('ronde stoppen vraagt eerst om bevestiging', /Zeker weten/.test(await stop.textContent()) && (await B.p.locator('#rondes .ronde').count()) === 2);
    await stop.click();
    await B.p.waitForFunction(() => document.querySelectorAll('#rondes .ronde').length === 1);
    await A.p.click('#sync');
    await A.p.waitForFunction(() => document.querySelectorAll('.raadblok .gok').length === 1);
    controle('gestopte ronde verdwijnt bij A, en zijn gok erop wordt opgeruimd', (await A.p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('spo_vrienden')).gokken[Object.keys(JSON.parse(localStorage.getItem('spo_vrienden')).gokken)[0]]).length)) === 1);

    // Een kwaadwillende vriend: B (met de echte sleutels) stuurt A een blob vol HTML en te grote velden
    const sB = stB2;
    const sleutelBA = await L.deelSleutel(sB.privJwk, sB.vrienden[0].pub, sB.id, sB.vrienden[0].id);
    const evil = {
      v: 1, ts: Date.now(),
      kaarten: [
        { id: 'ev1', vak: '<img src=x onerror=window.__pwned=1>', cijfer: 8, onderwerp: '<script>window.__pwned=2</script>', weging: 1, ts: 1760000000000, tier: 2 },
        { id: 'ev2', vak: 'x'.repeat(5000), cijfer: 7, ts: 1 }, { id: 'ev3', vak: 'Te hoog', cijfer: 11, ts: 1 },
      ],
      reacties: { 'Wiskunde-0': '\u{1F525}', 'Wiskunde-1': '<b>x</b>', 'Wiskunde-2': '\u{1F595}' },
      raden: [{ rid: 'a'.repeat(32), vak: '<b>vet</b>', onderwerp: '<i>cursief</i>', weging: 1, ts: 1760000000000 }, { rid: 'zz', vak: 'Ongeldig', ts: 1 }],
      gokken: { ['b'.repeat(32)]: 7 },
    };
    const putResp = await fetch('http://localhost:8150/api.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Id': sB.id, 'X-Token': sB.token }, body: JSON.stringify({ a: 'put', to: idA, data: await L.versleutel(sleutelBA, evil) }) });
    controle('kwaadwillende blob is door de server aangenomen (hij ziet alleen onleesbare data)', putResp.status === 200);
    await A.p.click('#sync');
    await A.p.waitForFunction(() => /<img src=x/.test(document.querySelector('.v-cijfers')?.textContent || ''));
    const ev = await A.p.evaluate(() => ({
      pwned: window.__pwned, elementen: document.querySelectorAll('.vriend img, .vriend script, .vriend b, .vriend i, #reacties img, #reacties b').length,
      kaarten: [...document.querySelectorAll('.v-cijfers .cijferkaart .vk')].map((e) => e.textContent), raad: document.querySelector('.raadblok')?.textContent || '',
      reactiekaarten: document.querySelectorAll('#reacties .rkaart').length, lang: document.body.textContent.includes('x'.repeat(100)),
    }));
    controle('kwaadwillend: geen script uitgevoerd en geen HTML-element ontstaan', ev.pwned === undefined && ev.elementen === 0, JSON.stringify(ev));
    controle('kwaadwillend: HTML staat als letterlijke tekst op de pagina', ev.kaarten.length === 1 && ev.kaarten[0] === '<img src=x onerror=window.__pwned=1>' && /<b>vet<\/b>, <i>cursief<\/i> \(weging 1\)/.test(ev.raad), JSON.stringify(ev));
    controle('kwaadwillend: te grote en ongeldige velden worden genegeerd', !ev.lang && !/Ongeldig/.test(ev.raad) && ev.reactiekaarten === 1, JSON.stringify(ev));
    controle('kwaadwillend: alleen de geldige reactie komt in "Reacties op jouw kaarten", met A\'s bijnaam voor B', /Sanne/.test(await A.p.textContent('#reacties')) && (await A.p.locator('#reacties .reactie').count()) === 1);
    await A.p.screenshot({ path: path.join(TMP, '8-kwaadwillend.png'), fullPage: true });
    // Toegankelijkheid: alle knoppen en velden hebben een naam, de meldingen zijn live-regio's
    const zonderNaam = async (p) => p.evaluate(() => [...document.querySelectorAll('#app button, #app input, #app select')].filter((e) => !e.hidden && !e.closest('[hidden]')).filter((e) => {
      if (e.tagName === 'BUTTON') return !(e.getAttribute('aria-label') || e.textContent).trim();
      return !((e.labels && e.labels.length) || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'));
    }).map((e) => e.outerHTML.slice(0, 80)));
    controle('alle knoppen en velden hebben een naam (A en B)', (await zonderNaam(A.p)).length === 0 && (await zonderNaam(B.p)).length === 0, [await zonderNaam(A.p), await zonderNaam(B.p)]);
    controle('meldingen zijn live-regio\'s', (await A.p.locator('#melding').getAttribute('aria-live')) === 'polite' && (await A.p.locator('#sync-status').getAttribute('aria-live')) === 'polite' && (await A.p.locator('.gok-status[role=status]').count()) >= 1);
    await hulpA.close(); await hulpB.close();


    // Verwijderen met bevestiging
    const weg = B.p.locator('.vriend .knop.gevaar');
    await weg.click();
    controle('bevestiging gevraagd', /Zeker/.test(await weg.textContent()) && (await B.p.locator('.vriend').count()) === 1);
    await weg.click();
    await B.p.waitForFunction(() => !document.querySelector('.vriend'));
    await A.p.click('#sync');
    await A.p.waitForFunction(() => /Weggevallen/.test(document.querySelector('.vriend .badge')?.textContent || ''));
    controle('A ziet vriend weggevallen', true);
    const nB = await B.p.evaluate(() => { const o = JSON.parse(localStorage.getItem('spo_vrienden')); return [o.raden.length, Object.keys(o.reacties).length, Object.keys(o.gokken).length, document.getElementById('raden-sectie').hidden, document.getElementById('reacties-sectie').hidden]; });
    controle('vriend verwijderen ruimt rondes, reacties en gokken van B op en verbergt de secties', JSON.stringify(nB) === JSON.stringify([0, 0, 0, true, true]), nB);
    const nA = await A.p.evaluate(() => [document.querySelectorAll('.raadblok').length, document.getElementById('raden-sectie').hidden, document.getElementById('reacties-sectie').hidden]);
    controle('A: rondes en reacties van een weggevallen vriend verdwijnen uit de weergave', JSON.stringify(nA) === JSON.stringify([0, true, true]), nA);
    const wegA = A.p.locator('.vriend .knop.gevaar');
    await wegA.click(); await wegA.click();
    await A.p.waitForFunction(() => !document.querySelector('.vriend'));
    const oA = await A.p.evaluate(() => { const o = JSON.parse(localStorage.getItem('spo_vrienden')); return [Object.keys(o.reacties).length, Object.keys(o.gokken).length, o.raden.length]; });
    controle('A: ook zijn eigen reacties en gokken op die vriend worden opgeruimd', JSON.stringify(oA) === JSON.stringify([0, 0, 0]), oA);
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
