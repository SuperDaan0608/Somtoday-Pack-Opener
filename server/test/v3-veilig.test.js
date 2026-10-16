// v3.0 Veiligheid aan de kant van de extensie: blokkeren, melden, waarschuwingen, ban-meldingen, aanmeldmelding en de e-mailban-koppeling.
// Meerdere browsercontexten vinden elkaar via de php-server. Gebruik: export NODE_PATH=$(npm root -g); node server/test/v3-veilig.test.js
// Eigen poorten: 8170 (webserver voor de extensiepagina's) en 8171 (php). Schermafbeeldingen: SPO_SHOTS=/map
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const MAP = path.resolve(__dirname, '..');
const EXT = path.resolve(MAP, '..', 'extension');
const TMP = process.env.SPO_TMP || '/tmp/v3-veilig-scratch';
const SHOTS = process.env.SPO_SHOTS || '';
fs.mkdirSync(TMP, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const DB = path.join(TMP, 'veilig.sqlite');
const MAIL = path.join(TMP, 'mail.jsonl');
const WEB = 'http://localhost:8170';
const SERVER = 'http://localhost:8171/api.php';
const SL = 'veilig-test-beheersleutel-0123456789abcdef';
const PAGINA = WEB + '/vrienden.html?server=' + encodeURIComponent(SERVER);
let ok = 0, mis = 0;
function controle(naam, waar, extra) { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const AANMELD = 'Aanmelden lukt nu niet met dit e-mailadres of op dit netwerk. Probeer het later opnieuw of gebruik een ander netwerk.';

// ---- Node-kant: de bibliotheken met een nepopslag ----
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require(path.join(EXT, 'vriendenlib.js'));
const Acc = require(path.join(EXT, 'account.js'));
const hex = (n) => n.toString(16).padStart(32, '0');
const ruw = async (body, headers) => {
  const r = await fetch(SERVER, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) { /* leeg */ }
  return { s: r.status, j };
};
const beheer = (a, extra) => ruw(Object.assign({ a }, extra || {}), { 'X-Beheer': SL });
const laatsteCode = (email, soort) => {
  const regels = fs.existsSync(MAIL) ? fs.readFileSync(MAIL, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const r = regels.filter((x) => x.aan === email && x.soort === soort).pop();
  return r ? r.code : null;
};

async function logicaTests() {
  // --- ban-tekst ---
  const t0 = L.banTekst(0, 'Spam');
  controle('banTekst permanent: leesbaar, met reden', t0 === 'Je bent permanent verbannen (Spam).', t0);
  const t1 = L.banTekst(Math.floor(Date.now() / 1000) + 3600, 'Pesten');
  controle('banTekst tijdelijk: tot een datum, met reden', /^Je bent verbannen tot .+ \(Pesten\)\.$/.test(t1), t1);
  controle('banTekst zonder reden', L.banTekst(0, '') === 'Je bent permanent verbannen.' && !/\(\)/.test(L.banTekst(4102444800, '')));
  controle('banWanneer', L.banWanneer(0) === 'permanent' && /^tot /.test(L.banWanneer(4102444800)));

  // --- samenvoegen van de blokkadelijst in de back-up: unie ---
  controle('spo_blokkades staat in de back-up', Acc.BACKUP_SLEUTELS.includes('spo_blokkades'));
  const u = Acc.samenvoegen('spo_blokkades', { [hex(1)]: { ts: 5, alias: '' }, [hex(2)]: { ts: 6, alias: 'Bob' } }, { [hex(1)]: { ts: 3, alias: 'Ann' }, [hex(3)]: { ts: 4, alias: 'Cy' } }, false);
  controle('samenvoegen = unie van beide lijsten', Object.keys(u).length === 3 && u[hex(1)].alias === 'Ann' && u[hex(2)].alias === 'Bob' && u[hex(3)].alias === 'Cy', JSON.stringify(u));
  controle('samenvoegen met een lege lijst', JSON.stringify(Acc.samenvoegen('spo_blokkades', {}, { [hex(1)]: { ts: 1, alias: '' } }, true)) === JSON.stringify({ [hex(1)]: { ts: 1, alias: '' } }));
  const vuil = L.schoonBlokkades({ '__proto__': { ts: 1 }, nep: { ts: 1 }, [hex(4)]: { ts: 'x', alias: 'A'.repeat(99) }, [hex(5)]: 5 });
  controle('schoonBlokkades herstelt rommel', Object.keys(vuil).length === 2 && vuil[hex(4)].alias.length === 24 && vuil[hex(4)].ts === 0 && !('nep' in vuil));

  // --- het bewijs: alleen uit wat de client ontsleuteld had, hoogstens 400 tekens ---
  L.onthoudBewijs(hex(10), { profiel: { bn: 'Naampje' }, kaarten: [{ vak: 'Wiskunde', onderwerp: 'Toets 1' }, { vak: 'Engels', onderwerp: '' }] });
  controle('bewijs bij reden naam: alleen de bijnaam', L.bewijsTekst(hex(10), 'naam') === 'Bijnaam: Naampje', L.bewijsTekst(hex(10), 'naam'));
  controle('bewijs bij reden tekst: alleen de kaarten', L.bewijsTekst(hex(10), 'tekst') === 'Kaart: Wiskunde - Toets 1\nKaart: Engels', L.bewijsTekst(hex(10), 'tekst'));
  controle('bewijs bij pesten: allebei', L.bewijsTekst(hex(10), 'pesten') === 'Bijnaam: Naampje\nKaart: Wiskunde - Toets 1\nKaart: Engels');
  L.onthoudBewijs(hex(11), { kaarten: Array.from({ length: 40 }, (_, i) => ({ vak: 'Vak' + i, onderwerp: 'O'.repeat(100) })) });
  controle('bewijs is nooit langer dan 400 tekens', L.bewijsTekst(hex(11), 'anders').length <= 400 && L.bewijsTekst(hex(11), 'anders').length > 100);
  controle('onbekende persoon: geen bewijs', L.bewijsTekst(hex(12), 'anders') === '' && L.bewijsVan(hex(12)) === null);
  L.onthoudBewijs(hex(13), { kaarten: [{ vak: 'a‮b\u0000c', onderwerp: 'x\n\ny' }] });
  controle('onzichtbare tekens en regeleinden uit het bewijs', L.bewijsTekst(hex(13), 'tekst') === 'Kaart: a b c - x y', JSON.stringify(L.bewijsTekst(hex(13), 'tekst')));

  // --- foutteksten bij melden ---
  const f = (status, message, extra) => Object.assign(new Error(message), { status }, extra || {});
  controle('melden: 429 dag-limiet', /5 meldingen/.test(L.meldFoutTekst(f(429, 'Je hebt vandaag al 5 meldingen gedaan. Probeer het morgen opnieuw.'))));
  controle('melden: 429 al gemeld', /al gemeld/.test(L.meldFoutTekst(f(429, 'Je hebt deze persoon vandaag al gemeld.'))));
  controle('melden: 404 en 503 netjes', /bestaat niet meer/.test(L.meldFoutTekst(f(404, 'x'))) && /later/.test(L.meldFoutTekst(f(503, 'x'))));
  controle('melden: onbekende fout heeft een tekst', L.meldFoutTekst({}).length > 10);

  // --- een geblokkeerd id komt nooit terug, ook niet als de server iets laat doorkomen ---
  const echteFetch = globalThis.fetch;
  const X = hex(900), Y = hex(901), pub = 'A'.repeat(87);
  const aanroepen = [];
  let blokkadesAntwoord = { s: 200, j: { ids: [X] } };
  globalThis.fetch = async (url, opt) => {
    const b = JSON.parse(opt.body); aanroepen.push(b.a + (b.id ? ':' + b.id.slice(-3) : ''));
    const antw = (s, j) => ({ ok: s < 400, status: s, json: async () => j });
    if (b.a === 'friends') return antw(200, { vrienden: [{ id: X, pub }, { id: Y, pub }] });
    if (b.a === 'inbox') return antw(200, { verzoeken: [{ id: X, pub }] });
    if (b.a === 'blokkades') return antw(blokkadesAntwoord.s, blokkadesAntwoord.j);
    if (b.a === 'blokkeer') return antw(200, { ok: true });
    if (b.a === 'get') return antw(200, { blobs: [] });
    return antw(200, {});
  };
  try {
    mem.clear();
    const st = { server: SERVER, id: hex(1), token: 't', privJwk: {}, pub, vrienden: [{ id: X, pub, alias: 'Xander', status: 'vriend', deel: { modus: 'niets', ids: [] } }], reacties: { [X]: { k: '🔥' } }, gokken: {}, raden: [{ rid: hex(77), sig: 's', vak: 'v', onderwerp: '', weging: 1, ts: 1, naar: [X], uitslagGedeeld: false }] };
    mem.set('spo_blokkades', JSON.stringify({ [X]: { ts: 1, alias: 'Xander' } }));
    mem.set('spo_gevechten', JSON.stringify({ [X]: [{ ts: 1, mijn: 1, hun: 0, n: 1 }] }));
    mem.set('spo_rivaal', JSON.stringify({ v: 1, id: X, status: 'actief', sinds: 5, laatst: 5, verzoeken: { [X]: 4 }, seq: { [X]: 9 }, gezien: [], betaald: {} }));
    mem.set('spo_uitnodigingen', JSON.stringify({ v: 1, link: 1, n: 1, bekend: { [X]: 1 }, beloond: { [X]: 2 }, door: { [X]: { s: 'wacht', laatst: 3 } } }));
    mem.set('spo_gg', JSON.stringify({ 1700000000000: [X, Y] }));
    await L.synchroniseer(st, []);
    controle('server laat een geblokkeerde vriend en verzoek doorkomen: ze komen niet in de lijst', !st.vrienden.some((v) => v.id === X) && st.vrienden.some((v) => v.id === Y && v.status === 'vriend') && st.vrienden.length === 1, JSON.stringify(st.vrienden.map((v) => [v.id.slice(-3), v.status])));
    controle('lokale restanten zijn opgeruimd (reacties, rondes)', !st.reacties[X] && st.raden.length === 0);
    const riv = JSON.parse(mem.get('spo_rivaal')), un = JSON.parse(mem.get('spo_uitnodigingen')), gv = JSON.parse(mem.get('spo_gevechten')), gg = JSON.parse(mem.get('spo_gg'));
    controle('rivaal opgeruimd', riv.id === null && riv.status === null && !riv.verzoeken[X] && !riv.seq[X], JSON.stringify(riv));
    controle('uitnodigingen: tellers van die persoon weg (beloning blijft onthouden)', !un.bekend[X] && !un.door[X] && un.beloond[X] === 2, JSON.stringify(un));
    controle('gevechten en GG opgeruimd', !gv[X] && JSON.stringify(gg['1700000000000']) === JSON.stringify([Y]), JSON.stringify([gv, gg]));
    // de server kent de blokkade nog niet (lokaal wel): wordt nagestuurd
    aanroepen.length = 0; blokkadesAntwoord = { s: 200, j: { ids: [] } };
    st.vrienden = []; await L.synchroniseer(st, []);
    controle('lokaal geblokkeerd maar de server weet het niet: blokkeer wordt nagestuurd', aanroepen.includes('blokkeer:' + X.slice(-3)), aanroepen.join(','));
    controle('en X blijft weg', !st.vrienden.some((v) => v.id === X));
    // de server kent een blokkade die ik niet ken (ander apparaat): komt erbij
    mem.set('spo_blokkades', JSON.stringify({})); blokkadesAntwoord = { s: 200, j: { ids: [X] } };
    await L.synchroniseer(st, []);
    controle('blokkade van een ander apparaat komt erbij en werkt meteen', !!(await L.leesBlokkades())[X] && !st.vrienden.some((v) => v.id === X));
    // de server is nog niet bijgewerkt (503): alleen de lokale lijst telt, geen crash
    blokkadesAntwoord = { s: 503, j: { fout: 'nog niet bijgewerkt' } };
    st.vrienden = []; await L.synchroniseer(st, []);
    controle('server zonder blokkades (503): lokale lijst telt nog steeds', !st.vrienden.some((v) => v.id === X) && !!(await L.leesBlokkades())[X]);
    // een vriendverzoek aan een geblokkeerde persoon via de code wordt lokaal tegengehouden
    const code = L.maakCode(X, pub);
    let e = null; try { await L.verzoek(st, code, 'X'); } catch (er) { e = er; }
    controle('geen vriendverzoek aan een geblokkeerde persoon', e && /geblokkeerd/.test(e.message), e && e.message);
  } finally { globalThis.fetch = echteFetch; }
}

(async () => {
  await logicaTests();
  try { fs.unlinkSync(DB); } catch (e) { /* nieuw */ }
  try { fs.unlinkSync(MAIL); } catch (e) { /* nieuw */ }
  await new Promise((res, rej) => {
    const f = path.join(TMP, 'schema.php');
    fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2]));`);
    spawn('php', [f, DB, path.join(MAP, 'schema.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res()));
  });
  // een kleine pagina met alleen het inlogscherm (poort.js), op het testadres van de server
  const poortHtml = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Inloggen</title></head><body style="margin:0;background:#080a14">
<script src="tekstfilter-woorden.js"></script><script src="tekstfilter.js"></script><script src="account.js"></script>
<script>SPOAccount.zetServer(${JSON.stringify(SERVER)});</script><script src="poort.js"></script></body></html>`;
  const web = http.createServer((q, s) => {
    const pad = decodeURIComponent(new URL(q.url, WEB).pathname);
    if (pad === '/poort-test.html') { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end(poortHtml); return; }
    const p = path.join(EXT, pad);
    if (!p.startsWith(EXT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(s);
  }).listen(8170);
  const dienst = path.join(TMP, 'spo-veilig-dienst'); // eigen naam, zodat een 'pkill php' van een andere test ons niet raakt
  try { fs.unlinkSync(dienst); } catch (e) { /* nieuw */ }
  fs.symlinkSync(require('node:child_process').execSync('command -v php', { shell: '/bin/sh' }).toString().trim(), dienst);
  const php = spawn(dienst, ['-S', 'localhost:8171', '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB, SPO_BEHEER: SL, SPO_MAILBESTAND: MAIL, SPO_LIMIET_BEHEER: '1000', SPO_NIEUWLIMIET: '50', SPO_LIMIET_USER: '5000', SPO_LIMIET_LOGIN: '1000', SPO_LIMIET_MAIL: '1000', SPO_REGLIMIET: '1000' }), stdio: ['ignore', 'ignore', fs.openSync(path.join(TMP, 'php.log'), 'w')] });
  const br = await chromium.launch();
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(SERVER, { method: 'OPTIONS' }); break; } catch (e) { await slaap(100); } }
    const galerij = (vak, basis) => [[4.9, 0], [6.4, 1], [8.1, 2]].map(([c, tier], i) => ({ id: `${vak}-${i}`, ts: 1760000000000 + (basis + i) * 86400000, vak, cijfer: c, onderwerp: 'Toets ' + (i + 1), weging: 2, opening: 'pak', tier, trede: 0, kaart: 'data:image/png;base64,AAAA' }));
    const maak = async (naam, gal) => {
      const ctx = await br.newContext({ viewport: { width: 900, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
      await ctx.addInitScript((g) => { if (!localStorage.getItem('spo_galerij')) localStorage.setItem('spo_galerij', JSON.stringify(g)); }, gal);
      const p = await ctx.newPage();
      const fouten = [];
      p.on('pageerror', (e) => fouten.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
      await p.goto(PAGINA);
      await p.click('#aanzetten');
      await p.waitForSelector('#stab-toevoegen');
      await p.click('#stab-toevoegen');
      await p.waitForFunction(() => document.getElementById('mijn-code').value.startsWith('SPO1-'));
      const code = await p.inputValue('#mijn-code');
      const id = await p.evaluate(() => JSON.parse(localStorage.getItem('spo_vrienden')).id);
      return { ctx, p, fouten, naam, code, id };
    };
    const sec = (P, n) => P.p.click('#stab-' + n);
    const schot = async (P, naam, el) => { if (!SHOTS) return; const f = path.join(SHOTS, naam + '.png'); if (el) await P.p.locator(el).screenshot({ path: f }); else await P.p.screenshot({ path: f, fullPage: true }); };
    const lees = (P, sleutel) => P.p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), sleutel);
    const bevriend = async (X, Y, aliasY, aliasX) => {
      await sec(X, 'toevoegen');
      await X.p.fill('#t-code', Y.code); await X.p.fill('#t-alias', aliasY);
      await X.p.click('#toevoegen button[type=submit]');
      await Y.p.click('#sync'); await sec(Y, 'toevoegen');
      await Y.p.waitForSelector('#verzoeken .verzoek');
      await slaap(2500); // eerst laten de live-updates van de pagina uitrazen: een nieuwe tekening wist wat je net intikte
      await Y.p.fill('#verzoeken .verzoek input[type=text]', aliasX);
      await Y.p.check('#verzoeken .verzoek input[type=checkbox]');
      await Y.p.click('#verzoeken .verzoek >> text=Accepteren');
      try { await Y.p.waitForFunction((id) => JSON.parse(localStorage.getItem('spo_vrienden')).vrienden.some((v) => v.id === id && v.status === 'vriend'), X.id, { timeout: 8000 }); } catch (e) { console.log('DEBUG', await Y.p.textContent('#melding'), Y.fouten, await Y.p.locator('#verzoeken').innerHTML()); throw e; }
      await X.p.click('#sync');
      await X.p.waitForFunction((id) => JSON.parse(localStorage.getItem('spo_vrienden')).vrienden.some((v) => v.id === id && v.status === 'vriend'), Y.id);
    };
    const A = await maak('A', galerij('Wiskunde', 0));
    const B = await maak('B', galerij('Engels', 10));
    const C = await maak('C', galerij('Frans', 20));
    const E = await maak('E', galerij('Duits', 30));
    const D = await maak('D', galerij('Aardrijkskunde', 40));
    const meer = async (rij) => { if (!(await rij.locator('.v-meer').evaluate((e) => e.open))) await rij.locator('.v-meer summary').click(); };
    await bevriend(A, B, 'Sanne', 'Daan');
    await bevriend(A, C, 'Cas', 'Daan');
    await bevriend(A, E, 'Eva', 'Daan');
    await sec(A, 'vrienden');
    controle('A heeft drie vrienden', (await A.p.locator('#vrienden > li').count()) === 3);
    controle('geen Geblokkeerd-kopje zolang je niemand blokkeerde', await A.p.locator('#geblokkeerd-sectie').isHidden());
    const stA = await lees(A, 'spo_vrienden');

    // ---- C is lastig: zijn client stuurt een slechte bijnaam en een slecht kaartonderwerp (een aangepaste client; de gewone filtert al bij het schrijven) ----
    const stC = await lees(C, 'spo_vrienden');
    await C.ctx.close(); // zodat zijn pagina onze zelfgemaakte blob niet overschrijft
    const slechteBlob = { v: 1, ts: Date.now(), kaarten: [{ id: 'k1', vak: 'Wiskunde', cijfer: 7.5, onderwerp: 'lul toets', weging: 1, ts: Date.now(), tier: 2 }], profiel: { bn: 'kut', s: [], ovr: 50, niv: 1, z: 0, k: 1, w: 0, g: 0, l: 0, t: '', bg: 'standaard' } };
    const slC = await L.deelSleutel(stC.privJwk, stA.pub, stC.id, stA.id);
    await L.maakClient(SERVER, stC.id, stC.token).roep('put', { to: stA.id, data: await L.versleutel(slC, slechteBlob) });
    await A.p.waitForFunction((id) => !!(globalThis.SPOVrienden && SPOVrienden.bewijsVan(id)), C.id, { timeout: 15000 });
    controle('A zag van C alleen "•••" (het filter werkt gewoon door)', !/kut|lul/.test(await A.p.locator('.vriend', { hasText: 'Cas' }).textContent()));

    // ======== MELDEN ========
    const rijC = A.p.locator('.vriend', { hasText: 'Cas' });
    await meer(rijC);
    controle('bij elke vriend staan Melden en Blokkeer onder Meer opties', await rijC.getByRole('button', { name: 'Cas melden bij de beheerder' }).isVisible() && await rijC.getByRole('button', { name: 'Cas blokkeren' }).isVisible());
    await schot(A, '0-meer-opties-melden-blokkeer', '.vriend:has-text("Cas")');
    await rijC.getByRole('button', { name: 'Cas melden bij de beheerder' }).click();
    await A.p.waitForSelector('#meld-venster[open]');
    const opties = await A.p.locator('#meld-reden option').allTextContents();
    controle('redenen: Naam of bijnaam, Tekst, Pesten, Spam, Anders', JSON.stringify(opties) === JSON.stringify(['Naam of bijnaam', 'Tekst', 'Pesten', 'Spam', 'Anders']), JSON.stringify(opties));
    controle('uitleg is een textarea met max 300 en tekstfilter', await A.p.evaluate(() => { const t = document.getElementById('meld-uitleg'); return t.tagName === 'TEXTAREA' && t.maxLength === 300 && t.dataset.tekstfilter === 'tekst' && !!t._spoGekoppeld; }));
    controle('het venster zegt eerlijk dat alleen de beheerder het ziet', /Alleen de beheerder ziet je melding/.test(await A.p.textContent('#meld-venster')) && /Wat we meesturen/.test(await A.p.textContent('#meld-venster')) && /niet versleuteld/.test(await A.p.textContent('#meld-venster')));
    const voorbeeld = () => A.p.evaluate(() => [...document.querySelectorAll('#meld-voorbeeld .mv-regel')].map((r) => r.textContent).join('\n'));
    controle('voorbeeld bij reden Naam: precies de bijnaam zoals hij binnenkwam (kut)', (await voorbeeld()) === 'Bijnaam: kut', await voorbeeld());
    controle('de regel is onscherp (het filter verbergt hem) maar er is een knop om hem te tonen', await A.p.locator('#meld-voorbeeld .mv-regel.verborgen').count() === 1 && await A.p.locator('#meld-toon').isVisible());
    controle('bewijs staat standaard aan', await A.p.isChecked('#meld-bewijs-vink'));
    await A.p.selectOption('#meld-reden', 'tekst');
    controle('voorbeeld bij reden Tekst: het kaartonderwerp', (await voorbeeld()) === 'Kaart: Wiskunde - lul toets', await voorbeeld());
    await A.p.selectOption('#meld-reden', 'pesten');
    controle('voorbeeld bij Pesten: allebei', (await voorbeeld()) === 'Bijnaam: kut\nKaart: Wiskunde - lul toets', await voorbeeld());
    await A.p.selectOption('#meld-reden', 'naam');
    await schot(A, '2a-meldvenster-verborgen-regel', '#meld-venster');
    await A.p.click('#meld-toon');
    controle('Toon verborgen regels maakt de regel leesbaar', (await A.p.locator('#meld-voorbeeld .mv-regel.open').count()) === 1 && (await A.p.getAttribute('#meld-toon', 'aria-pressed')) === 'true');
    // streng filter op de uitleg
    await A.p.fill('#meld-uitleg', 'Hij is een kut');
    await A.p.click('#meld-stuur');
    controle('slechte uitleg wordt tegengehouden door het filter (zonder het woord te noemen)', (await A.p.locator('#meld-venster[open]').count()) === 1 && /Deze tekst kan niet/.test(await A.p.textContent('#meld-venster')) && !(await A.p.textContent('#meld-venster .tekstfilter-melding, #meld-venster [role=alert]')).includes('kut'));
    controle('en er is niets verstuurd', (await beheer('beheerMeldingen')).j.meldingen.length === 0);
    await A.p.fill('#meld-uitleg', 'Zijn bijnaam is gemeen tegen mij.');
    await schot(A, '2-meldvenster-bewijs-voorbeeld', '#meld-venster');
    await A.p.setViewportSize({ width: 390, height: 844 });
    await schot(A, '2b-meldvenster-telefoon', '#meld-venster');
    controle('meldvenster op telefoonbreedte: geen horizontale scroll', await A.p.evaluate(() => { const d = document.getElementById('meld-venster'); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1; }));
    await A.p.setViewportSize({ width: 900, height: 1000 });
    await A.p.click('#meld-stuur');
    await A.p.waitForSelector('#meld-bedankt');
    controle('bedankt-bericht met de vraag of je ook wilt blokkeren', /Bedankt\. De beheerder kijkt ernaar\. Wil je deze persoon ook blokkeren\?/.test(await A.p.textContent('#meld-bedankt')) && await A.p.locator('#meld-blokkeer').isVisible());
    await schot(A, '2c-meld-bedankt', '#meld-venster');
    const m1 = (await beheer('beheerMeldingen')).j.meldingen;
    controle('de melding staat bij de beheerder met de goede velden', m1.length === 1 && m1[0].van === A.id && m1[0].tegen === C.id && m1[0].reden === 'naam' && m1[0].uitleg === 'Zijn bijnaam is gemeen tegen mij.' && m1[0].heeftBewijs === true, JSON.stringify(m1));
    const bew = await beheer('beheerBewijs', { id: m1[0].id });
    controle('het bewijs is precies het voorbeeld ("Bijnaam: kut")', bew.j.bewijs === 'Bijnaam: kut', JSON.stringify(bew.j));
    await A.p.click('#meld-sluit');
    await A.p.waitForSelector('#meld-venster', { state: 'detached' });
    controle('Nee, sluiten: C blijft vriend', (await A.p.locator('.vriend', { hasText: 'Cas' }).count()) === 1 && (await lees(A, 'spo_vrienden')).vrienden.some((v) => v.id === C.id));

    // dezelfde persoon nog eens: de server zegt nee, de app legt het uit
    await meer(A.p.locator('.vriend', { hasText: 'Cas' }));
    await A.p.locator('.vriend', { hasText: 'Cas' }).getByRole('button', { name: 'Cas melden bij de beheerder' }).click();
    await A.p.waitForSelector('#meld-venster[open]');
    await A.p.click('#meld-stuur');
    await A.p.waitForFunction(() => /al gemeld/.test(document.getElementById('meld-status').textContent));
    controle('nog eens dezelfde persoon melden: nette melding (al gemeld)', /Je hebt deze persoon vandaag al gemeld/.test(await A.p.textContent('#meld-status')) && await A.p.locator('#meld-stuur').isDisabled());
    await A.p.click('#meld-annuleer');
    await A.p.waitForSelector('#meld-venster', { state: 'detached' });

    // E heeft niets te laten zien: geen bewijs. Melden en dan wel blokkeren.
    const rijE = A.p.locator('.vriend', { hasText: 'Eva' });
    await meer(rijE);
    await rijE.getByRole('button', { name: 'Eva melden bij de beheerder' }).click();
    await A.p.waitForSelector('#meld-venster[open]');
    controle('zonder tekst van die persoon: uitleg dat er niets meegaat, vinkje uit en uitgeschakeld', await A.p.locator('#meld-geen-bewijs').isVisible() && !(await A.p.isChecked('#meld-bewijs-vink')) && await A.p.locator('#meld-bewijs-vink').isDisabled());
    await A.p.selectOption('#meld-reden', 'spam');
    await A.p.click('#meld-stuur');
    await A.p.waitForSelector('#meld-bedankt');
    const m2 = (await beheer('beheerMeldingen')).j.meldingen.find((x) => x.tegen === E.id);
    controle('melding zonder bewijs: heeftBewijs is false, uitleg leeg', m2 && m2.heeftBewijs === false && m2.reden === 'spam' && m2.uitleg === '', JSON.stringify(m2));
    await A.p.click('#meld-blokkeer');
    await A.p.waitForSelector('#meld-venster', { state: 'detached' });
    await A.p.waitForFunction(() => !document.querySelector('.vriend[data-id]') || ![...document.querySelectorAll('.vriend')].some((v) => /Eva/.test(v.textContent)));
    controle('Ja, blokkeer: Eva is meteen uit de lijst', (await A.p.locator('.vriend', { hasText: 'Eva' }).count()) === 0 && (await A.p.locator('#vrienden > li').count()) === 2);
    controle('Eva staat onder Geblokkeerd (en de lijst is open)', await A.p.locator('#geblokkeerd-sectie').isVisible() && await A.p.locator('#geblokkeerd-sectie[open]').count() === 1 && /Eva/.test(await A.p.textContent('#geblokkeerd')));
    controle('serverlijst blokkades bevat Eva', (await ruw({ a: 'blokkades' }, { 'X-Id': stA.id, 'X-Token': stA.token })).j.ids.includes(E.id));

    // een binnenkomend vriendverzoek van D melden
    const stD = await lees(D, 'spo_vrienden');
    await sec(D, 'toevoegen');
    await D.p.fill('#t-code', A.code); await D.p.fill('#t-alias', 'Anna');
    await D.p.click('#toevoegen button[type=submit]');
    await sec(A, 'toevoegen');
    await A.p.waitForSelector('#verzoeken .verzoek', { timeout: 15000 });
    controle('bij een vriendverzoek staan Melden en Blokkeer', await A.p.locator('#verzoeken .verzoek').getByRole('button', { name: /melden/ }).isVisible() && await A.p.locator('#verzoeken .verzoek').getByRole('button', { name: /blokkeren/ }).isVisible());
    await A.p.locator('#verzoeken .verzoek').getByRole('button', { name: /melden/ }).click();
    await A.p.waitForSelector('#meld-venster[open]');
    controle('bij een verzoek is er geen bewijs-tekst (van een vreemde hebben we niets ontsleuteld)', await A.p.locator('#meld-geen-bewijs').isVisible());
    await A.p.selectOption('#meld-reden', 'anders'); await A.p.fill('#meld-uitleg', 'Ik ken deze persoon niet.');
    await A.p.click('#meld-stuur');
    await A.p.waitForSelector('#meld-bedankt');
    await A.p.click('#meld-sluit');
    await A.p.waitForSelector('#meld-venster', { state: 'detached' });
    controle('3 meldingen bij de beheerder (C, E, D)', (await beheer('beheerMeldingen')).j.meldingen.length === 3);
    // de dag-limiet: 5 per dag
    const cA = L.maakClient(SERVER, stA.id, stA.token);
    for (let i = 0; i < 2; i++) { const sl = await L.maakSleutelpaar(); const f = await L.maakClient(SERVER).roep('register', { pub: sl.pub }); await cA.roep('meld', { tegen: f.id, reden: 'spam', uitleg: '', bewijs: '' }); }
    await sec(A, 'vrienden');
    const rijB = A.p.locator('.vriend', { hasText: 'Sanne' });
    await meer(rijB);
    await rijB.getByRole('button', { name: 'Sanne melden bij de beheerder' }).click();
    await A.p.waitForSelector('#meld-venster[open]');
    await A.p.click('#meld-stuur');
    await A.p.waitForFunction(() => /5 meldingen/.test(document.getElementById('meld-status').textContent));
    controle('dag-limiet (5): nette melding en niets verstuurd', /Je hebt vandaag al 5 meldingen gedaan/.test(await A.p.textContent('#meld-status')) && (await beheer('beheerMeldingen')).j.meldingen.length === 5);
    await schot(A, '2d-meld-daglimiet', '#meld-venster');
    await A.p.click('#meld-annuleer');

    // ======== BLOKKEREN ========
    // eerst wat lokale restanten die opgeruimd moeten worden
    await A.p.evaluate((idB) => {
      localStorage.setItem('spo_rivaal', JSON.stringify({ v: 1, id: idB, status: 'actief', sinds: 5, laatst: 5, verzoeken: {}, seq: {}, gezien: [], betaald: {} }));
      localStorage.setItem('spo_uitnodigingen', JSON.stringify({ v: 1, link: 1, n: 1, bekend: { [idB]: 1 }, beloond: { [idB]: 2 }, door: { [idB]: { s: 'wacht', laatst: 3 } } }));
      localStorage.setItem('spo_gevechten', JSON.stringify({ [idB]: [{ ts: 1, mijn: 3, hun: 1, n: 3 }] }));
    }, B.id);
    await A.p.reload(); await A.p.waitForSelector('#vrienden > li');
    const rijB2 = A.p.locator('.vriend', { hasText: 'Sanne' });
    controle('Sanne is rivaal (testopzet)', (await rijB2.locator('.rivaal-label').count()) === 1);
    await meer(rijB2);
    await rijB2.getByRole('button', { name: 'Sanne blokkeren' }).click();
    await A.p.waitForSelector('#blokkeer-venster[open]');
    controle('bevestiging met de uitleg in één zin', /Jullie zijn dan geen vrienden meer en deze persoon kan je niet meer toevoegen\./.test(await A.p.textContent('#blokkeer-venster')) && /Sanne blokkeren\?/.test(await A.p.textContent('#blokkeer-venster h2')));
    controle('focus staat op Annuleren (de veilige keuze)', await A.p.evaluate(() => document.activeElement.id === 'blokkeer-annuleer'));
    await schot(A, '1-blokkeer-bevestiging', '#blokkeer-venster');
    await A.p.setViewportSize({ width: 390, height: 844 });
    await schot(A, '1b-blokkeer-bevestiging-telefoon', '#blokkeer-venster');
    await A.p.setViewportSize({ width: 900, height: 1000 });
    await A.p.click('#blokkeer-annuleer');
    await A.p.waitForSelector('#blokkeer-venster', { state: 'detached' });
    controle('Annuleren: Sanne blijft vriend en niets is geblokkeerd', (await A.p.locator('.vriend', { hasText: 'Sanne' }).count()) === 1 && (await ruw({ a: 'blokkades' }, { 'X-Id': stA.id, 'X-Token': stA.token })).j.ids.length === 1);
    await A.p.locator('.vriend', { hasText: 'Sanne' }).getByRole('button', { name: 'Sanne blokkeren' }).click();
    await A.p.waitForSelector('#blokkeer-venster[open]');
    await A.p.click('#blokkeer-bevestig');
    await A.p.waitForSelector('#blokkeer-venster', { state: 'detached' });
    controle('na blokkeren is Sanne meteen uit je lijst', (await A.p.locator('.vriend', { hasText: 'Sanne' }).count()) === 0 && (await A.p.locator('#vrienden > li').count()) === 1);
    controle('de rivaalkaart is weg', await A.p.locator('#rivaal-sectie').isHidden());
    const opruim = await A.p.evaluate(() => ({ r: JSON.parse(localStorage.getItem('spo_rivaal')), u: JSON.parse(localStorage.getItem('spo_uitnodigingen')), g: JSON.parse(localStorage.getItem('spo_gevechten')), b: JSON.parse(localStorage.getItem('spo_blokkades')), v: JSON.parse(localStorage.getItem('spo_vrienden')) }));
    controle('lokale restanten opgeruimd: rivaal, uitnodig-tellers, gevechten', opruim.r.id === null && !opruim.u.bekend[B.id] && !opruim.u.door[B.id] && !opruim.g[B.id], JSON.stringify(opruim));
    controle('spo_blokkades bevat Sanne en Eva, Sanne staat niet meer als vriend', !!opruim.b[B.id] && !!opruim.b[E.id] && opruim.b[B.id].alias === 'Sanne' && !opruim.v.vrienden.some((v) => v.id === B.id));
    await schot(A, '1c-geblokkeerd-lijst', '#sec-vrienden');
    controle('Geblokkeerd (2) is inklapbaar met Deblokkeer-knoppen', (await A.p.locator('#geblokkeerd .g-rij').count()) === 2 && (await A.p.locator('#geblokkeerd').getByRole('button', { name: /^Sanne deblokkeren$/ }).count()) === 1 && /2/.test(await A.p.textContent('#n-geblokkeerd')));
    await A.p.click('#geblokkeerd-sectie > summary');
    controle('inklappen verbergt de lijst', await A.p.locator('#geblokkeerd').isHidden());
    await A.p.click('#geblokkeerd-sectie > summary');
    // B probeert A weer toe te voegen: A merkt niets
    await sec(B, 'toevoegen');
    await B.p.fill('#t-code', A.code); await B.p.fill('#t-alias', 'Daan2');
    await B.p.click('#toevoegen button[type=submit]');
    await slaap(1500);
    await A.p.click('#sync'); await slaap(800);
    await sec(A, 'toevoegen');
    controle('een geblokkeerde die opnieuw een verzoek stuurt, komt niet in de lijst van A', (await A.p.locator('#verzoeken .verzoek').count()) === 1 /* alleen D */ && !(await lees(A, 'spo_vrienden')).vrienden.some((v) => v.id === B.id));
    // D blokkeren vanuit het verzoek
    await A.p.locator('#verzoeken .verzoek').getByRole('button', { name: /blokkeren/ }).click();
    await A.p.waitForSelector('#blokkeer-venster[open]');
    await A.p.click('#blokkeer-bevestig');
    await A.p.waitForSelector('#blokkeer-venster', { state: 'detached' });
    controle('verzoek van D geblokkeerd: verzoek weg, D onder Geblokkeerd', (await A.p.locator('#verzoeken .verzoek').count()) === 0 && !!(await lees(A, 'spo_blokkades'))[D.id]);
    // A zelf kan een geblokkeerde niet toevoegen
    await A.p.fill('#t-code', B.code); await A.p.fill('#t-alias', 'Sanne');
    await A.p.click('#toevoegen button[type=submit]');
    await A.p.waitForSelector('#melding p.fout');
    controle('A kan een geblokkeerde niet toevoegen (uitleg)', /Je hebt deze persoon geblokkeerd/.test(await A.p.textContent('#melding p.fout')));
    // D en B proberen A weer te bereiken
    await D.p.click('#sync'); await slaap(800);
    controle('D (geblokkeerd) kan A niet meer bereiken: geen vriendschap', !(await lees(D, 'spo_vrienden')).vrienden.some((v) => v.id === A.id && v.status === 'vriend'));
    // deblokkeren
    await sec(A, 'vrienden');
    await A.p.locator('#geblokkeerd').getByRole('button', { name: /^Sanne deblokkeren$/ }).click();
    await A.p.waitForFunction(() => ![...document.querySelectorAll('#geblokkeerd .g-rij')].some((r) => /Sanne/.test(r.textContent)));
    controle('Deblokkeer: Sanne is van de lijst en van de server', !(await lees(A, 'spo_blokkades'))[B.id] && !(await ruw({ a: 'blokkades' }, { 'X-Id': stA.id, 'X-Token': stA.token })).j.ids.includes(B.id) && (await A.p.locator('#geblokkeerd .g-rij').count()) === 2);
    controle('en na deblokkeren zijn jullie niet vanzelf vrienden', (await A.p.locator('.vriend', { hasText: 'Sanne' }).count()) === 0);
    // opnieuw toevoegen kan weer
    await sec(A, 'toevoegen');
    await A.p.fill('#t-code', B.code); await A.p.fill('#t-alias', 'Sanne');
    await A.p.click('#toevoegen button[type=submit]');
    await A.p.waitForFunction(() => /Verzoek verstuurd|is nu je vriend|geblokkeerd\.$/.test(document.getElementById('melding').textContent) && /Verzoek verstuurd/.test(document.getElementById('melding').textContent), null, { timeout: 8000 }).catch(() => {});
    controle('na deblokkeren kan A weer een verzoek sturen', /Verzoek verstuurd|is nu je vriend/.test(await A.p.textContent('#melding')), await A.p.textContent('#melding'));
    controle('A had geen fouten in de console (de verwachte 429 van melden niet meegeteld)', A.fouten.filter((f) => !/429/.test(f)).length === 0, A.fouten.join('|'));

    // ======== WAARSCHUWING ========
    await sec(A, 'vrienden');
    controle('zonder waarschuwing geen venster', (await A.p.locator('#waarschuwing-venster').count()) === 0);
    await beheer('beheerWaarschuw', { id: stA.id, reden: 'Je bijnaam was kwetsend.' });
    await A.p.waitForSelector('#waarschuwing-venster[open]', { timeout: 15000 });
    controle('waarschuwingsvenster: role alertdialog, titel en reden', (await A.p.getAttribute('#waarschuwing-venster', 'role')) === 'alertdialog' && /Waarschuwing van de beheerder/.test(await A.p.textContent('#waarschuwing-venster h2')) && /Reden: Je bijnaam was kwetsend\./.test(await A.p.textContent('#waarschuwing-venster')));
    controle('het venster is modaal en benoemd (aria-labelledby, aria-describedby)', await A.p.evaluate(() => { const d = document.getElementById('waarschuwing-venster'); return d.matches(':modal') && !!document.getElementById(d.getAttribute('aria-labelledby')) && !!document.getElementById(d.getAttribute('aria-describedby')); }));
    controle('focus staat op Begrepen', await A.p.evaluate(() => document.activeElement.id === 'waarschuwing-begrepen'));
    await schot(A, '3-waarschuwingsvenster');
    await A.p.setViewportSize({ width: 390, height: 844 });
    await schot(A, '3b-waarschuwingsvenster-telefoon');
    controle('waarschuwingsvenster op telefoonbreedte: geen horizontale scroll', await A.p.evaluate(() => { const d = document.getElementById('waarschuwing-venster'); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1; }));
    await A.p.setViewportSize({ width: 900, height: 1000 });
    await A.p.keyboard.press('Escape');
    await A.p.keyboard.press('Tab'); await A.p.keyboard.press('Tab'); await A.p.keyboard.press('Shift+Tab');
    controle('Escape sluit hem niet en Tab houdt de focus in het venster (focus-trap)', (await A.p.locator('#waarschuwing-venster[open]').count()) === 1 && await A.p.evaluate(() => document.getElementById('waarschuwing-venster').contains(document.activeElement)));
    await slaap(2500);
    controle('hij blijft precies één keer open staan (geen tweede venster)', (await A.p.locator('#waarschuwing-venster').count()) === 1);
    await A.p.click('#waarschuwing-begrepen');
    await A.p.waitForSelector('#waarschuwing-venster', { state: 'detached' });
    const gezien = await ruw({ a: 'waarschuwingen' }, { 'X-Id': stA.id, 'X-Token': stA.token });
    controle('Begrepen: de waarschuwing is gelezen op de server (puls w = 0)', gezien.j.lijst.length === 0 && (await ruw({ a: 'puls' }, { 'X-Id': stA.id, 'X-Token': stA.token })).j.w === 0);
    await slaap(3000);
    controle('hij komt niet meer terug', (await A.p.locator('#waarschuwing-venster').count()) === 0);
    await A.p.reload(); await A.p.waitForSelector('#vrienden'); await slaap(2500);
    controle('ook niet na opnieuw laden', (await A.p.locator('#waarschuwing-venster').count()) === 0);
    // twee waarschuwingen tegelijk
    await beheer('beheerWaarschuw', { id: stA.id, reden: 'Eerste reden' });
    await beheer('beheerWaarschuw', { id: stA.id, reden: 'Tweede reden' });
    await A.p.waitForSelector('#waarschuwing-venster[open]', { timeout: 15000 });
    controle('twee waarschuwingen staan allebei in het venster', (await A.p.locator('#waarschuwing-venster .wa-item').count()) === 2 && /2 waarschuwingen/.test(await A.p.textContent('#waarschuwing-venster')));
    await A.p.click('#waarschuwing-begrepen');
    await A.p.waitForSelector('#waarschuwing-venster', { state: 'detached' });
    controle('en na één keer Begrepen zijn ze allebei weg', (await ruw({ a: 'puls' }, { 'X-Id': stA.id, 'X-Token': stA.token })).j.w === 0);
    // de toast in update.js (achtergrond) kijkt naar p.w: hier alleen gecontroleerd dat de bron het veld gebruikt
    const upd = fs.readFileSync(path.join(EXT, 'update.js'), 'utf8');
    controle('update.js: waarschuwing-toast hoogstens 1x per uur (met opslag), ban-toast 1x per 6 uur', /p\.w > 0/.test(upd) && /TOAST_WAARSCHUWING = 60 \* 60 \* 1000/.test(upd) && /TOAST_BAN = 6 \* 60 \* 60 \* 1000/.test(upd));

    // ======== BAN-MELDING ========
    const verzoekenD = [];
    D.p.on('request', (r) => { if (r.url().startsWith(SERVER) && r.method() === 'POST') verzoekenD.push(r.postData()); });
    await sec(D, 'vrienden');
    const tot = Math.floor(Date.now() / 1000) + 2 * 86400;
    await beheer('beheerBan', { id: stD.id, tot, reden: 'Te veel spam', ook_email: false, ook_ip: false });
    await D.p.waitForSelector('#ban-banner:not([hidden])', { timeout: 15000 });
    const banTxt = await D.p.textContent('#ban-banner');
    controle('ban-banner: titel, einddatum, reden en wat nog wel kan', /Je bent verbannen van de vriendenfunctie/.test(banTxt) && /Dit duurt tot .+\d{4}/.test(banTxt) && /Reden: Te veel spam/.test(banTxt) && /kaarten, munten en prestaties werken gewoon/.test(banTxt), banTxt);
    controle('de statusregel toont dezelfde tekst als de server-melding', /^Je bent verbannen tot .+ \(Te veel spam\)\.$/.test(await D.p.textContent('#sync-status')));
    await schot(D, '4-ban-melding');
    await D.p.setViewportSize({ width: 390, height: 844 });
    await schot(D, '4b-ban-melding-telefoon');
    controle('ban-banner op telefoonbreedte: geen horizontale scroll', await D.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await D.p.setViewportSize({ width: 900, height: 1000 });
    const n0 = verzoekenD.length;
    await slaap(6000);
    controle('geen herhaalde pogingen: in 6 seconden geen nieuwe verzoeken naar de server', verzoekenD.length === n0, verzoekenD.length - n0);
    await beheer('beheerBan', { id: stD.id, tot: 0, reden: 'Voor altijd', ook_email: false, ook_ip: false });
    await D.p.click('#sync');
    await D.p.waitForFunction(() => /permanent/.test(document.getElementById('ban-wanneer').textContent), null, { timeout: 15000 });
    controle('permanent verbannen: "Dit is permanent." en de statusregel zegt permanent', /Dit is permanent\./.test(await D.p.textContent('#ban-wanneer')) && /permanent verbannen \(Voor altijd\)/.test(await D.p.textContent('#sync-status')));
    await beheer('beheerOnban', { id: stD.id });
    await D.p.click('#sync');
    await D.p.waitForSelector('#ban-banner', { state: 'hidden', timeout: 15000 });
    controle('na opheffen verdwijnt de banner weer', true);

    // ======== AANMELDEN: e-mailban-koppeling en de nette melding ========
    const poortCtx = async (identiteit, breedte) => {
      const ctx = await br.newContext({ viewport: { width: breedte || 900, height: 900 } });
      if (identiteit) await ctx.addInitScript((i) => { if (!localStorage.getItem('spo_vrienden')) localStorage.setItem('spo_vrienden', JSON.stringify(i)); }, identiteit);
      const p = await ctx.newPage();
      const verz = [];
      p.on('request', (r) => { if (r.url().startsWith(SERVER) && r.method() === 'POST') { try { verz.push({ a: JSON.parse(r.postData()).a, h: r.headers() }); } catch (e) { /* geen json */ } } });
      await p.goto(WEB + '/poort-test.html');
      await p.waitForSelector('.spo-poort');
      return { ctx, p, verz };
    };
    const maakAccount = async (P, email, ww) => {
      await P.p.click('[data-naar="maken"]');
      await P.p.fill('#p-email', email); await P.p.fill('#p-ww', ww); await P.p.fill('#p-ww2', ww);
      await P.p.click('.spo-poort .knop');
      await P.p.waitForSelector('#p-code');
      const code = laatsteCode(email, 'verifieer');
      await P.p.fill('#p-code', code);
      await P.p.click('.spo-poort .knop');
      await P.p.waitForSelector('.spo-poort .info');
    };
    const sl1 = await L.maakSleutelpaar(); const u1 = await L.maakClient(SERVER).roep('register', { pub: sl1.pub });
    const P1 = await poortCtx({ id: u1.id, token: u1.token, server: SERVER, vrienden: [] });
    await maakAccount(P1, 'ban-test@voorbeeld.nl', 'geheim-wachtwoord-1');
    const kopHeaders = (P, a) => P.verz.filter((x) => x.a === a);
    controle('met een vrienden-identiteit: X-Id en X-Token mee bij accRegistreer en accVerifieer', ['accRegistreer', 'accVerifieer'].every((a) => kopHeaders(P1, a).length === 1 && kopHeaders(P1, a)[0].h['x-id'] === u1.id && kopHeaders(P1, a)[0].h['x-token'] === u1.token), JSON.stringify(P1.verz.map((x) => [x.a, !!x.h['x-id']])));
    const sl2 = await L.maakSleutelpaar(); const u2 = await L.maakClient(SERVER).roep('register', { pub: sl2.pub });
    // zonder vrienden-identiteit: geen headers
    const P2 = await poortCtx(null);
    await maakAccount(P2, 'zonder-id@voorbeeld.nl', 'geheim-wachtwoord-2');
    controle('zonder vrienden-identiteit: geen X-Id of X-Token', P2.verz.length >= 2 && P2.verz.every((x) => !x.h['x-id'] && !x.h['x-token']), JSON.stringify(P2.verz.map((x) => [x.a, x.h['x-id']])));
    await P2.ctx.close();
    // de beheerder blokkeert de gebruiker en het e-mailadres
    const ban = await beheer('beheerBan', { id: u1.id, tot: 0, reden: 'Test', ook_email: true, ook_ip: false });
    controle('beheerBan ook_email: het e-mailadres van die gebruiker is geblokkeerd (koppeling werkt)', ban.s === 200 && ban.j.emailGeblokkeerd === 1, JSON.stringify(ban.j));
    const ban2 = await beheer('beheerBan', { id: u2.id, tot: 0, reden: 'Test', ook_email: true, ook_ip: false });
    controle('en een gebruiker zonder koppeling heeft geen e-mailadres om te blokkeren', ban2.s === 200 && ban2.j.emailGeblokkeerd === 0, JSON.stringify(ban2.j));
    await P1.ctx.close();
    // een nieuwe browser probeert dat adres: vriendelijke tekst
    const P3 = await poortCtx(null);
    await P3.p.click('[data-naar="maken"]');
    await P3.p.fill('#p-email', 'ban-test@voorbeeld.nl'); await P3.p.fill('#p-ww', 'geheim-wachtwoord-1'); await P3.p.fill('#p-ww2', 'geheim-wachtwoord-1');
    await P3.p.click('.spo-poort .knop');
    await P3.p.waitForFunction(() => document.querySelector('.spo-poort .fout').textContent.length > 0);
    const f1 = await P3.p.textContent('.spo-poort .fout');
    controle('registreren met een geblokkeerd e-mailadres: vriendelijke, niet beschuldigende tekst', f1 === AANMELD, f1);
    controle('de tekst verraadt niets over een ban', !/ban|verbann|geblokkeerd|weiger/i.test(f1));
    await schot({ p: P3.p }, '5-aanmeldmelding');
    await P3.p.setViewportSize({ width: 390, height: 844 });
    await schot({ p: P3.p }, '5b-aanmeldmelding-telefoon');
    controle('aanmeldscherm op telefoonbreedte: geen horizontale scroll', await P3.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await P3.p.click('[data-naar="inloggen"]');
    await P3.p.fill('#p-email', 'ban-test@voorbeeld.nl'); await P3.p.fill('#p-ww', 'geheim-wachtwoord-1');
    await P3.p.click('.spo-poort .knop');
    await P3.p.waitForFunction(() => document.querySelector('.spo-poort .fout').textContent.length > 0);
    controle('inloggen met dat adres: dezelfde tekst', (await P3.p.textContent('.spo-poort .fout')) === AANMELD);
    // een normaal fout wachtwoord blijft een gewone melding (niet de aanmeldtekst)
    await P3.p.fill('#p-email', 'bestaat-niet@voorbeeld.nl');
    await P3.p.click('.spo-poort .knop');
    await slaap(1200);
    controle('een gewone inlogfout geeft niet de aanmeldtekst', (await P3.p.textContent('.spo-poort .fout')) !== AANMELD);
    await P3.ctx.close();
    // opheffen: het adres werkt weer
    await beheer('beheerOnban', { id: u1.id });
    const P4 = await poortCtx(null);
    await P4.p.fill('#p-email', 'ban-test@voorbeeld.nl'); await P4.p.fill('#p-ww', 'geheim-wachtwoord-1');
    await P4.p.click('.spo-poort .knop');
    await P4.p.waitForFunction(() => document.querySelector('.spo-poort h1').textContent === 'Gelukt!' || document.querySelector('.spo-poort .fout').textContent.length > 0);
    controle('na beheerOnban kan het adres weer inloggen', (await P4.p.textContent('.spo-poort h1')) === 'Gelukt!');
    await P4.ctx.close();
    // Node: dezelfde koppeling via account.js (koppeling met opslag in localStorage), en 403 nietBevestigd blijft zichtbaar anders
    mem.clear();
    mem.set('spo_vrienden', JSON.stringify({ id: u2.id, token: u2.token }));
    Acc.zetServer(SERVER);
    const gezien2 = [];
    const echt = globalThis.fetch;
    globalThis.fetch = async (url, opt) => { gezien2.push(opt.headers); return echt(url, opt); };
    await beheer('beheerOnban', { id: u2.id });
    await Acc.registreer('node-account@voorbeeld.nl', 'geheim-wachtwoord-3');
    await Acc.verifieer('node-account@voorbeeld.nl', laatsteCode('node-account@voorbeeld.nl', 'verifieer'), 'geheim-wachtwoord-3');
    await Acc.bewaar();
    globalThis.fetch = echt;
    const metId = gezien2.filter((h) => h['X-Id'] === u2.id && h['X-Token'] === u2.token).length;
    controle('account.js stuurt X-Id/X-Token bij registreren, verifiëren en back-up bewaren', metId >= 3, metId + ' van ' + gezien2.length);
    const ban3 = await beheer('beheerBan', { id: u2.id, tot: 0, reden: 'Test', ook_email: true, ook_ip: false });
    controle('e-mailban werkt end-to-end vanuit account.js (id/token meegestuurd -> ook_email -> 403)', ban3.j.emailGeblokkeerd >= 1, JSON.stringify(ban3.j));
    const e403 = await (async () => { try { await Acc.registreer('node-account@voorbeeld.nl', 'geheim-wachtwoord-3'); return null; } catch (er) { return er; } })();
    controle('registreren met dat adres: 403 en de vriendelijke tekst', e403 && e403.status === 403 && e403.message === AANMELD, e403 && e403.message);
    await beheer('beheerOnban', { id: u2.id });

    // ---- netwerkban: ook de vriendenfunctie aanzetten geeft de vriendelijke tekst ----
    const stIp = await L.maakClient(SERVER).roep('register', { pub: (await L.maakSleutelpaar()).pub });
    const banIp = await beheer('beheerBan', { id: u1.id, tot: Math.floor(Date.now() / 1000) + 3600, reden: 'Test', ook_email: false, ook_ip: true });
    if (banIp.j.ipGeblokkeerd) {
      const Z = await br.newContext({ viewport: { width: 900, height: 900 } });
      const zp = await Z.newPage();
      await zp.goto(PAGINA);
      await zp.click('#aanzetten');
      await zp.waitForSelector('#melding p.fout');
      controle('netwerk geblokkeerd: Vriendenfunctie aanzetten geeft de vriendelijke tekst', (await zp.textContent('#melding p.fout')) === AANMELD, await zp.textContent('#melding p.fout'));
      await Z.close();
    } else controle('ip-ban kon niet worden gezet (geen ip-geheugen voor deze gebruiker)', false, JSON.stringify(banIp.j));
    await beheer('beheerOnban', { id: u1.id });
    void stIp;

    controle('A had geen fouten in de console (einde)', A.fouten.filter((f) => !/429/.test(f)).length === 0, A.fouten.join('|'));
    controle('D had geen fouten in de console, behalve de 403 van de ban', D.fouten.every((f) => /403/.test(f)), D.fouten.join('|'));
  } finally {
    await br.close();
    web.close();
    php.kill();
  }
  console.log(`${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
