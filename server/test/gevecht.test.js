// Test van Team en Gevecht in headless Chromium: twee spelers (twee browsercontexts) spelen een volledig gevecht via de php-server,
// inclusief klikduels, en moeten dezelfde uitslag zien. Daarna een oefengevecht tegen de computer.
// Gebruik: export NODE_PATH=$(npm root -g); node server/test/gevecht.test.js   (php en http-server nodig; screenshots in $SPO_TMP)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require('../../extension/vriendenlib.js');
const G = require('../../extension/gevecht.js');

const MAP = path.resolve(__dirname, '..');
const TMP = process.env.SPO_TMP || '/tmp/vrienden-scratch';
fs.mkdirSync(TMP, { recursive: true });
const DB = path.join(TMP, 'gevecht.sqlite');
const API = 'http://localhost:8150/api.php';
const WEB = 'http://localhost:8123';
let ok = 0, mis = 0;
function controle(naam, waar, extra) { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

// Een mooi genoeg kaartplaatje (SVG) voor in de galerij.
const KLEUR = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
function kaartPlaat(vak, cijfer, tier) {
  const k = KLEUR[tier];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="272" height="400" viewBox="0 0 272 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${k}"/><stop offset=".55" stop-color="#1b2038"/><stop offset="1" stop-color="#0b0e1c"/></linearGradient></defs><rect x="4" y="4" width="264" height="392" rx="26" fill="url(#g)" stroke="${k}" stroke-width="6"/><text x="136" y="170" font-family="Arial Black, sans-serif" font-size="110" font-weight="900" fill="#fff" text-anchor="middle">${String(cijfer).replace('.', ',')}</text><text x="136" y="260" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${k}" text-anchor="middle">${vak.toUpperCase()}</text><text x="136" y="360" font-family="Arial, sans-serif" font-size="22" fill="#fff9" text-anchor="middle">${['BRONS', 'ZILVER', 'GOUD', 'SPECIAAL', 'ICOON'][tier]}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
function galerijVan(lijst, basis) {
  return lijst.map(([vak, c], i) => { const tier = c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0; return { id: `${vak}-${basis}-${i}`, ts: 1760000000000 + (basis + i) * 86400000, vak, cijfer: c, onderwerp: 'Toets', weging: 1, opening: 'pak', tier, zeldzaam: i === 1, kaart: kaartPlaat(vak, c, tier) }; });
}

(async () => {
  try { fs.unlinkSync(DB); } catch (e) { /* nieuw */ }
  await new Promise((res, rej) => {
    const f = path.join(TMP, 'schema3.php');
    fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2]));`);
    spawn('php', [f, DB, path.join(MAP, 'schema.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res()));
  });
  const php = spawn('php', ['-S', 'localhost:8150', '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB }), stdio: 'ignore' });
  const web = spawn('http-server', ['-p', '8123', '-s', '-c-1', path.resolve(MAP, '../extension')], { stdio: 'ignore' });
  // --- Teamchemie (zonder browser): vakherkenning, uitrekenen, en dat beide kanten dezelfde wedstrijd krijgen ---
  {
    const gr = (v) => G.groepVan(v);
    controle('vakherkenning: hoofdletters, afkortingen en toevoegingen', gr('WISKUNDE') === 'exact' && gr('na') === 'exact' && gr('Wiskunde B') === 'exact' && gr('NLT') === 'exact' && gr('ne') === 'talen' && gr('Engels havo') === 'talen' && gr('Latijn') === 'talen' && gr('GS') === 'mens' && gr('Aardrijkskunde') === 'mens' && gr('maatschappijleer') === 'mens' && gr('lo') === 'kunst' && gr('Lichamelijke opvoeding') === 'kunst' && gr('CKV') === 'kunst' && gr('Xyzvak') === null && gr('') === null);
    const kaart = (vak, c) => ({ vak, cijfer: c, tier: 2, z: false });
    const ch = (vakken) => G.chemie(G.ordenTeam(vakken.map((v, i) => kaart(v, 7 + i / 10)), 0)).score;
    controle('chemie: een kaart of geen groep geeft 0', ch(['Wiskunde']) === 0 && ch(['Wiskunde', 'Engels', 'Geschiedenis', 'Muziek']) === 0 && ch(['Xyzvak', 'Iets']) === 0);
    controle('chemie: 3+ uit een groep geeft veel meer dan een paar', ch(['Wiskunde', 'Natuurkunde', 'Scheikunde']) > ch(['Wiskunde', 'Natuurkunde', 'Engels']) && ch(['Wiskunde', 'Natuurkunde', 'Engels']) > 0);
    controle('chemie: een team vol uit een groep is 100 en blijft tussen 0 en 100', ch(['Wiskunde', 'Natuurkunde', 'Scheikunde', 'Biologie', 'Informatica']) === 100 && [1, 2, 3, 5, 8, 11].every((n) => { const c = ch(Array(n).fill('Wiskunde')); return Number.isInteger(c) && c >= 0 && c <= 100; }));
    controle('chemie: lijntjes alleen tussen buren van dezelfde groep', G.chemie(G.ordenTeam(['Wiskunde', 'Natuurkunde', 'Scheikunde', 'Engels'].map((v) => kaart(v, 7)), 0)).lijnen.every(([i, j]) => i !== j));
    // dezelfde seed en teams: zonder chemie hetzelfde als vroeger; met chemie nog steeds op beide kanten hetzelfde
    const teamsX = { A: G.ordenTeam(['Wiskunde', 'Natuurkunde', 'Engels', 'Frans', 'Muziek', 'Biologie'].map((v, i) => kaart(v, 6 + i / 2)), 0), B: G.ordenTeam(['Geschiedenis', 'Economie', 'Duits', 'LO', 'Scheikunde', 'Latijn'].map((v, i) => kaart(v, 6.2 + i / 2)), 0) };
    const speel = (seed, opties) => {
      const sim = G.maakSim(seed, teamsX, opties), uit = [];
      for (let i = 0; i < 400 && !sim.klaar; i++) { const e = sim.volgende(); if (e.t === 'eind') break; uit.push(e.t + (e.naar ? e.naar.z + e.naar.i : '') + (e.min || '')); if (e.t === 'kans') uit.push(sim.duelUitslag(20 + (i % 7), 19 + (i % 5)).goal ? 'G' : 'N'); }
      return uit.join(',') + '|' + sim.stand.A + '-' + sim.stand.B;
    };
    controle('seed-simulatie: zonder chemie gelijk aan chemie 0', [1, 2, 3, 99, 123456].every((sd) => speel(sd) === speel(sd, { chemie: { A: 0, B: 0 } }) && speel(sd) === speel(sd, {})));
    controle('seed-simulatie: met chemie twee keer precies hetzelfde', [1, 2, 3, 99, 123456].every((sd) => speel(sd, { chemie: { A: 70, B: 35 } }) === speel(sd, { chemie: { A: 70, B: 35 } })));
    controle('chemie verandert de uitkomst echt (klikken en passes)', [1, 2, 3, 4, 5, 6, 7, 8].some((sd) => speel(sd, { chemie: { A: 100, B: 0 } }) !== speel(sd)) && G.duelUitslag(kaart('a', 7), kaart('b', 7), 20, 21, 0, 0).goal === false && G.duelUitslag(kaart('a', 7), kaart('b', 7), 20, 21, 100, 0).goal === true);
    // team met `ch` bij een vriend; oude versie zonder `ch` blijft een geldig team
    const snap = L.teamMomentopname([{ vak: 'Wiskunde', cijfer: 8, tier: 2 }, { vak: 'Natuurkunde', cijfer: 7, tier: 2 }, { vak: 'Scheikunde', cijfer: 6, tier: 1 }]);
    controle('team delen: ch zit mee in het teamdeel', Number.isInteger(snap.ch) && snap.ch > 0 && L.schoonTeam(snap).ch === snap.ch);
    controle('oude versie zonder ch: team geldig, ch ontbreekt (dan chemie 0)', L.schoonTeam({ kaarten: snap.kaarten }) !== null && !('ch' in L.schoonTeam({ kaarten: snap.kaarten })) && !('ch' in L.schoonTeam(Object.assign({}, snap, { ch: 101 }))) && !('ch' in L.schoonTeam(Object.assign({}, snap, { ch: 'x' }))));
  }
  const br = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (let i = 0; i < 80; i++) { try { await fetch(API, { method: 'OPTIONS' }); await fetch(WEB + '/team.html'); break; } catch (e) { await slaap(100); } }

    // Twee gebruikers en een vriendschap, opgezet met de echte client-bibliotheek.
    async function maak() {
      const sl = await L.maakSleutelpaar();
      const r = await L.maakClient(API).roep('register', { pub: sl.pub });
      return { server: API, id: r.id, token: r.token, privJwk: sl.privJwk, pub: sl.pub, vrienden: [], reacties: {}, gokken: {}, raden: [] };
    }
    const A = await maak(), B = await maak();
    await L.verzoek(A, L.maakCode(B.id, B.pub), 'Sanne');
    await L.antwoord(Object.assign({}, B, { vrienden: [{ id: A.id, pub: A.pub, status: 'ontvangen' }] }), A.id, true, 'Daan');
    A.vrienden[0].status = 'vriend';
    B.vrienden = [{ id: A.id, pub: A.pub, alias: 'Daan', status: 'vriend', deel: { modus: 'niets', ids: [] } }];
    A.vrienden[0].alias = 'Sanne';
    const galA = galerijVan([['Wiskunde', 8.6], ['Engels', 9.1], ['Biologie', 6.2], ['Nederlands', 7.4], ['Frans', 5.0]], 0);
    const galB = galerijVan([['Geschiedenis', 7.9], ['Scheikunde', 6.8], ['Economie', 9.97], ['Duits', 5.8], ['Muziek', 8.2]], 10);
    const teamA = { v: 1, ids: [galA[0].id, galA[1].id, galA[2].id] };
    const teamB = { v: 1, ids: [galB[2].id, galB[0].id, galB[3].id] };

    const speler = async (naam, st, gal, tm, viewport) => {
      const ctx = await br.newContext({ viewport: viewport || { width: 1000, height: 900 } });
      await ctx.addInitScript(([s, g, t]) => { if (!localStorage.getItem('spo_vrienden')) { localStorage.setItem('spo_vrienden', JSON.stringify(s)); localStorage.setItem('spo_galerij', JSON.stringify(g)); if (t) localStorage.setItem('spo_team', JSON.stringify(t)); } }, [st, gal, tm]);
      const p = await ctx.newPage();
      const fouten = [], verzoeken = [];
      p.on('pageerror', (e) => fouten.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) fouten.push(m.text() + ' ' + (m.location().url || '')); });
      p.on('request', (r) => { if (r.url().includes('api.php') && r.method() === 'POST') { try { verzoeken.push({ t: Date.now(), a: JSON.parse(r.postData()).a }); } catch (e) { /* geen json */ } } });
      await p.goto(WEB + '/team.html');
      return { ctx, p, fouten, verzoeken, naam };
    };
    const PA = await speler('A', A, galA, teamA), PB = await speler('B', B, galB, teamB);

    // --- Team maken ---
    await PA.p.waitForSelector('#bouwveld .speler');
    controle('team A: 3 kaarten op het veld', (await PA.p.locator('#bouwveld .speler').count()) === 3);
    controle('team A: precies één keeper', (await PA.p.locator('#bouwveld .keeper-label').count()) === 1);
    controle('team A: echte plaatjes op het veld', (await PA.p.locator('#bouwveld .speler img').count()) === 3);
    await PA.p.screenshot({ path: path.join(TMP, 'team-1-bouwen.png') });
    // Kaart uit team halen en weer erbij; elfde kaart kan er niet bij
    await PA.p.locator('#kies .kies-kaart[aria-pressed=true]').first().click();
    controle('kaart uit team halen', (await PA.p.locator('#bouwveld .speler').count()) === 2);
    await PA.p.locator('#kies .kies-kaart[aria-pressed=false]').first().click();
    controle('kaart toevoegen', (await PA.p.locator('#bouwveld .speler').count()) === 3);
    // keeper wisselen door op een kaart op het veld te klikken
    const keeperVoor = await PA.p.evaluate(() => JSON.parse(localStorage.getItem('spo_team')).ids[0]);
    await PA.p.locator('#bouwveld .speler:not(:has(.keeper-label))').first().click();
    const keeperNa = await PA.p.evaluate(() => JSON.parse(localStorage.getItem('spo_team')).ids[0]);
    controle('keeper wisselen', keeperVoor !== keeperNa);
    const teamOpgeslagen = await PA.p.evaluate(() => JSON.parse(localStorage.getItem('spo_team')));
    controle('team bewaard (spo_team) met 3 id\'s', teamOpgeslagen.ids.length === 3);
    // team terugzetten naar de afgesproken opstelling
    await PA.p.evaluate((t) => { localStorage.setItem('spo_team', JSON.stringify(t)); }, teamA);
    await PA.p.reload();
    await PA.p.waitForSelector('#bouwveld .speler');
    // Te grote teams: 11 maximaal
    const grootGal = galerijVan(Array.from({ length: 13 }, (_, i) => ['Vak' + i, 5 + (i % 5)]), 40);
    // C is een eigen account zonder vrienden: met het account van A zou C de blob van A voor B overschrijven (zonder team, met 13 kaarten).
    const PC = await speler('C', await maak(), grootGal, null, { width: 900, height: 800 });
    await PC.p.waitForSelector('#kies .kies-kaart');
    const knoppen = PC.p.locator('#kies .kies-kaart');
    for (let i = 0; i < 12; i++) { const b = PC.p.locator('#kies .kies-kaart[aria-pressed=false]:not([disabled])').first(); if (await b.count()) await b.click(); }
    controle('maximaal 11 kaarten in een team', (await PC.p.locator('#bouwveld .speler').count()) === 11 && (await PC.p.locator('#kies .kies-kaart:disabled').count()) === 2);
    await PC.p.screenshot({ path: path.join(TMP, 'team-2-elf.png') });
    await PC.p.click('#team-leeg');
    controle('team leegmaken', (await PC.p.locator('#bouwveld .speler').count()) === 0 && (await PC.p.evaluate(() => localStorage.getItem('spo_team'))) === null);
    await PC.ctx.close();

    // --- Live synchroniseren: elke seconde, licht ---
    await PA.p.waitForFunction(() => /Live/.test(document.getElementById('sync-status').textContent), null, { timeout: 15000 });
    await PB.p.waitForFunction(() => /Live/.test(document.getElementById('sync-status').textContent), null, { timeout: 15000 });
    controle('status toont Live', true);
    // team van de ander verschijnt
    await PA.p.waitForFunction(() => /Jullie zijn even groot/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 15000 });
    await PB.p.waitForFunction(() => /Jullie zijn even groot/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 15000 });
    controle('A en B zien elkaars teamgrootte', true);
    const t0 = Date.now(); await slaap(6000);
    const sinds = PA.verzoeken.filter((v) => v.t >= t0);
    const puls = sinds.filter((v) => v.a === 'puls').length, zwaar = sinds.filter((v) => ['get', 'friends', 'inbox', 'put'].includes(v.a)).length;
    controle('ongeveer 1 puls per seconde (4 t/m 8 in 6 s)', puls >= 4 && puls <= 8, puls);
    controle('rustige sync haalt geen blobs op (alleen puls)', zwaar === 0, sinds.map((v) => v.a));
    // overlappen: nooit twee verzoeken binnen 150 ms van een puls-ritme
    // niet zichtbaar = geen verzoeken
    await PA.p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); });
    await slaap(1500); const t1 = Date.now(); await slaap(3500);
    controle('verborgen pagina stuurt geen verzoeken', PA.verzoeken.filter((v) => v.t > t1).length === 0, PA.verzoeken.filter((v) => v.t > t1).length);
    await PA.p.evaluate(() => { delete document.visibilityState; });
    await PA.p.screenshot({ path: path.join(TMP, 'team-3-gevecht-keuze.png'), fullPage: true });

    // Verschillende teamgrootte: knop uit met uitleg
    await PB.p.evaluate((t) => { localStorage.setItem('spo_team', JSON.stringify(t)); }, { v: 1, ids: teamB.ids.slice(0, 2) });
    await PB.p.reload();
    await PA.p.waitForFunction(() => /heeft er 2/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 20000 }).catch(() => {});
    // (B's team van 2 wordt pas gedeeld na de eerste sync van B; geef het even de tijd)
    const uitTekst = await PA.p.textContent('#gv-vrienden');
    controle('ongelijke teams: uitdagen uit met uitleg', /heeft er 2/.test(uitTekst) && (await PA.p.locator('#gv-vrienden button').first().isDisabled()), uitTekst);
    await PA.p.screenshot({ path: path.join(TMP, 'team-4-ongelijk.png'), fullPage: true });
    await PB.p.evaluate((t) => { localStorage.setItem('spo_team', JSON.stringify(t)); }, teamB);
    await PB.p.reload();
    await PA.p.waitForFunction(() => /Jullie zijn even groot/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 20000 });
    await PA.p.waitForFunction(() => !document.querySelector('#gv-vrienden button').disabled, null, { timeout: 20000 });
    controle('even grote teams: uitdagen aan', true);

    // --- Gevecht A tegen B ---
    const klikker = (p, ms) => p.evaluate((ms) => { setInterval(() => { const b = document.getElementById('klik'); if (b && !b.disabled && !document.getElementById('duel').hidden) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, ms); }, ms);
    await klikker(PA.p, 90); await klikker(PB.p, 140);
    await PA.p.click('#gv-vrienden button');
    await PB.p.waitForSelector('#uitnodigingen .uitnodiging', { timeout: 20000 });
    controle('B ziet de uitnodiging', /daagt je uit/.test(await PB.p.textContent('#uitnodigingen')));
    await PB.p.screenshot({ path: path.join(TMP, 'team-5-uitnodiging.png'), fullPage: true });
    await PB.p.click('#uitnodigingen .knop.goud');
    await PA.p.waitForFunction(() => !document.getElementById('scherm').hidden && document.querySelectorAll('#wveld .speler').length === 6, null, { timeout: 30000 });
    await PB.p.waitForFunction(() => !document.getElementById('scherm').hidden && document.querySelectorAll('#wveld .speler').length === 6, null, { timeout: 30000 });
    controle('beide spelers zien 6 kaarten op het veld', true);
    await slaap(9000);
    await PA.p.screenshot({ path: path.join(TMP, 'gevecht-1-veld-A.png') });
    await PB.p.screenshot({ path: path.join(TMP, 'gevecht-1-veld-B.png') });
    const ballPos = await PA.p.evaluate(() => document.getElementById('bal').style.transform);
    controle('bal beweegt', /translate/.test(ballPos));
    await PA.p.waitForSelector('#duel:not([hidden])', { timeout: 90000 });
    await PB.p.waitForSelector('#duel:not([hidden])', { timeout: 30000 });
    await PA.p.waitForFunction(() => +document.getElementById('kl-mijn').textContent > 5 && +document.getElementById('kl-hun').textContent > 3, null, { timeout: 20000 }).catch(() => {});
    await PA.p.screenshot({ path: path.join(TMP, 'gevecht-2-duel-A.png') });
    await PB.p.screenshot({ path: path.join(TMP, 'gevecht-2-duel-B.png') });
    const bonusA = await PA.p.textContent('#duel-bonus'), bonusB = await PB.p.textContent('#duel-bonus');
    const chA = [...bonusA.matchAll(/×(\d+,\d+)/g)].map((m) => m[1]), chB = [...bonusB.matchAll(/×(\d+,\d+)/g)].map((m) => m[1]);
    controle('klikfactoren (met chemie) in het duel: beide kanten zien dezelfde twee getallen (gespiegeld)', chA.length === 2 && chB.length === 2 && chA[0] === chB[1] && chA[1] === chB[0], [bonusA, bonusB]);
    const meterTekst = await PA.p.evaluate(() => [document.getElementById('kl-mijn').textContent, document.getElementById('kl-hun').textContent]);
    controle('live meter: A ziet kliks van beide kanten', Number(meterTekst[0]) > 0 && Number(meterTekst[1]) > 0, meterTekst);
    await PA.p.waitForFunction(() => /GOAL|GEREDDEN/.test(document.getElementById('duel-teller').textContent), null, { timeout: 30000 });
    await PB.p.waitForFunction(() => /GOAL|GEREDDEN/.test(document.getElementById('duel-teller').textContent), null, { timeout: 30000 });
    const uA = await PA.p.textContent('#duel-teller'), uB = await PB.p.textContent('#duel-teller');
    controle('eerste duel: beide zien dezelfde uitkomst', uA === uB, [uA, uB]);
    await PA.p.screenshot({ path: path.join(TMP, 'gevecht-3-uitkomst-A.png') });
    await PA.p.waitForSelector('#einde:not([hidden])', { timeout: 240000 });
    await PB.p.waitForSelector('#einde:not([hidden])', { timeout: 60000 });
    const eA = [await PA.p.textContent('#einde-kop'), await PA.p.textContent('#einde-stand')], eB = [await PB.p.textContent('#einde-kop'), await PB.p.textContent('#einde-stand')];
    const mA = /Jij (\d+) - (\d+)/.exec(eA[1]), mB = /Jij (\d+) - (\d+)/.exec(eB[1]);
    console.log('Uitslag A:', eA.join(' | '), ' Uitslag B:', eB.join(' | '));
    controle('uitslag: A en B zien dezelfde stand (gespiegeld)', mA && mB && mA[1] === mB[2] && mA[2] === mB[1], [eA, eB]);
    const winA = mA && +mA[1] > +mA[2], winB = mB && +mB[1] > +mB[2];
    controle('uitslag: winnaar klopt aan beide kanten', mA && mB && eA[0] === (winA ? 'Gewonnen!' : +mA[1] < +mA[2] ? 'Verloren' : 'Gelijkspel') && eB[0] === (winB ? 'Gewonnen!' : +mB[1] < +mB[2] ? 'Verloren' : 'Gelijkspel') && !(winA && winB), [eA, eB]);
    controle('geen fouten in de console (A, B)', PA.fouten.length === 0 && PB.fouten.length === 0, [PA.fouten, PB.fouten]);
    await PA.p.screenshot({ path: path.join(TMP, 'gevecht-4-einde-A.png') });
    const opgeslagen = await PA.p.evaluate(() => JSON.parse(localStorage.getItem('spo_gevechten') || '{}'));
    controle('uitslag bewaard in spo_gevechten', Object.values(opgeslagen).flat().length === 1 && Object.values(opgeslagen).flat()[0].mijn === +mA[1]);
    await PA.p.click('#einde-terug'); await PB.p.click('#einde-terug');
    await PA.p.waitForFunction(() => /1 gewonnen|1 gelijk|1 verloren/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 10000 });
    controle('uitslag zichtbaar bij de vriend', true);
    await PA.p.screenshot({ path: path.join(TMP, 'team-6-na-gevecht.png'), fullPage: true });

    // --- Oefenen tegen de computer ---
    await PA.p.click('#oefen');
    await PA.p.waitForFunction(() => document.querySelectorAll('#wveld .speler').length === 6, null, { timeout: 15000 });
    await PA.p.waitForSelector('#duel:not([hidden])', { timeout: 90000 });
    await PA.p.waitForSelector('#einde:not([hidden])', { timeout: 240000 });
    controle('oefengevecht eindigt met een uitslag', /Jij \d+ - \d+ Computer/.test(await PA.p.textContent('#einde-stand')), [await PA.p.textContent('#einde-kop'), await PA.p.textContent('#einde-stand'), await PA.p.textContent('#einde-tekst')]);
    await PA.p.screenshot({ path: path.join(TMP, 'gevecht-6-oefenen-einde.png') });
    await PA.p.click('#einde-terug');

    // --- Verbinding verloren: B verdwijnt tijdens een gevecht ---
    await PA.p.click('#gv-vrienden button');
    await PB.p.waitForSelector('#uitnodigingen .uitnodiging', { timeout: 20000 });
    await PB.p.click('#uitnodigingen .knop.goud');
    await PA.p.waitForFunction(() => document.querySelectorAll('#wveld .speler').length === 6, null, { timeout: 30000 });
    await slaap(3000);
    await PB.ctx.close();
    await PA.p.waitForSelector('#einde:not([hidden])', { timeout: 60000 });
    controle('verbinding verloren: nette melding', /Verbinding verloren/.test(await PA.p.textContent('#einde-tekst')), await PA.p.textContent('#einde-tekst'));
    await PA.p.screenshot({ path: path.join(TMP, 'gevecht-5-verloren.png') });
  } finally {
    await br.close().catch(() => {}); php.kill(); web.kill();
  }
  console.log(`\nGevechttest: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
