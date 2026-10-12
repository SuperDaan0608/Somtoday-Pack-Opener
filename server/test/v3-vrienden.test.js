// v3.0 Vrienden: aartsrivaal en uitnodig-link. Twee tot vier browsercontexten vinden elkaar via de php-server.
// Gebruik: export NODE_PATH=$(npm root -g); node server/test/v3-vrienden.test.js
// Het bestand start zelf een kleine webserver voor de extensiepagina's (poort 8125) en php (poort 8161).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const MAP = path.resolve(__dirname, '..');
const EXT = path.resolve(MAP, '..', 'extension');
const TMP = process.env.SPO_TMP || '/tmp/v3-vrienden-scratch';
const SHOTS = process.env.SPO_SHOTS || '';
fs.mkdirSync(TMP, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const DB = path.join(TMP, 'v3.sqlite');
const WEB = 'http://localhost:8125';
const SERVER = 'http://localhost:8161/api.php';
const PAGINA = WEB + '/vrienden.html?server=' + encodeURIComponent(SERVER);
let ok = 0, mis = 0;
function controle(naam, waar, extra) { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.mp3': 'audio/mpeg' };

// ---- Node-kant: de bibliotheken met een nepopslag, voor de logica zonder browser ----
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require(path.join(EXT, 'vriendenlib.js'));
const E = require(path.join(EXT, 'economie.js')) && globalThis.SPOEco;
const R = require(path.join(EXT, 'rivaal.js'));
const U = require(path.join(EXT, 'uitnodiging.js'));
const hex = (n) => n.toString(16).padStart(32, '0');

async function logicaTests() {
  // --- berichten van een kwaadwillende vriend ---
  const slecht = [null, undefined, 5, 'rivaal', [], ['rivaal'], {}, { t: 5 }, { t: ['rivaal'] }, { t: '__proto__' }, { t: 'constructor' }, { t: 'toString' }, { t: 'RIVAAL' }, { t: 'rivaal ' }, { t: 'uitnodiging' }, { t: 'rivaal-ja\u0000' }];
  controle('schoonBericht (rivaal) negeert vreemde berichten', slecht.every((m) => R.schoonBericht(m, 1) === null && U.schoonBericht(m, 1) === null));
  controle('schoonBericht kent alleen de vier rivaaltypes', ['rivaal', 'rivaal-ja', 'rivaal-nee', 'rivaal-stop'].every((t) => R.schoonBericht({ t }, 1) === t));
  controle('schoonBericht negeert te oude of vreemde leeftijden', [600, 9999, -1, NaN, '5', undefined, Infinity].every((l) => R.schoonBericht({ t: 'rivaal' }, l) === null));
  controle('schoonBericht (uitnodiging) kent alleen bedankt en ok', U.schoonBericht({ t: 'uitnodiging-bedankt' }, 0) === 'uitnodiging-bedankt' && U.schoonBericht({ t: 'uitnodiging-ok' }, 0) === 'uitnodiging-ok' && U.schoonBericht({ t: 'rivaal' }, 0) === null);
  const vuil = R.schoonStaat({ id: 'x', status: 'actief', verzoeken: { '__proto__': 1, [hex(1)]: 5, nepid: 3 }, seq: { [hex(2)]: 'a' }, gezien: ['a', 3], betaald: { '2026-01-01': 9999, nep: 1 } });
  controle('schoonStaat (rivaal) herstelt rommel', vuil.id === null && vuil.status === null && Object.keys(vuil.verzoeken).length === 1 && Object.keys(vuil.seq).length === 0 && vuil.gezien.length === 1 && vuil.betaald['2026-01-01'] === 30 && !('nep' in vuil.betaald));
  controle('schoonStaat (uitnodiging) begrenst n op 10', U.schoonStaat({ n: 99, door: { [hex(1)]: { s: 'raar' } } }).n === 10 && Object.keys(U.schoonStaat({ door: { [hex(1)]: { s: 'raar' } } }).door).length === 0);

  // --- link en invoer ---
  const code = L.maakCode(hex(7), 'A'.repeat(87));
  const link = U.maakLink('https://jummysnacks.nl/api.php', code);
  controle('link bevat de goede code', link === 'https://jummysnacks.nl/api.php?uitnodiging=' + code && new URL(link).searchParams.get('uitnodiging') === code, link);
  controle('link met ander serveradres en oude parameters', U.maakLink('http://localhost:8161/api.php?x=1#y', code) === 'http://localhost:8161/api.php?uitnodiging=' + code);
  controle('link met kapot of gevaarlijk serveradres valt terug op de standaard', U.maakLink('javascript:alert(1)', code).startsWith('https://jummysnacks.nl/') && U.maakLink('onzin', code).startsWith('https://jummysnacks.nl/'));
  const inv = U.leesInvoer(link);
  controle('leesInvoer haalt de code uit een uitnodigingslink', inv.via === true && inv.code === code);
  controle('leesInvoer laat een gewone code ongemoeid', U.leesInvoer('  ' + code + ' ').via === false && U.leesInvoer(code).code === code && U.leesInvoer(null).code === '');
  controle('een link zonder geldige code telt niet als uitnodiging', U.leesInvoer('https://x.nl/api.php?uitnodiging=onzin').via === false);

  // --- beloningen: maximaal 10, eenmalig per vriend, alleen na de eerste link ---
  const pakjes = async () => (await E.lees()).log.filter((x) => x.id.startsWith('pak:gratis:')).length;
  const vrienden = [];
  for (let i = 1; i <= 14; i++) vrienden.push({ id: hex(i), pub: 'p', alias: 'V' + i, status: 'vriend', deel: { modus: 'niets', ids: [] } });
  const verstuurd = [];
  const st = { id: hex(900), pub: 'A'.repeat(87), server: SERVER, vrienden: vrienden.slice(0, 2) };
  const echt = L.stuurBericht;
  // we onderscheppen het versturen via de bibliotheek (die hier geen server heeft)
  L.stuurBericht = async (s, v, obj) => { verstuurd.push([v.id, obj.t]); };
  const bedankt = (id, leeftijd) => U.opBerichten(st, id, [{ seq: 1, leeftijd: leeftijd === undefined ? 5 : leeftijd, m: { t: 'uitnodiging-bedankt' } }]);
  let r = await bedankt(hex(1));
  controle('zonder uitnodigingslink geen beloning (vriend was er al)', r.meldingen.length === 0 && (await pakjes()) === 0 && (await U.laad()).n === 0);
  controle('toch krijgt de vriend een ok terug (hij stopt met sturen)', verstuurd.some(([id, t]) => id === hex(1) && t === 'uitnodiging-ok'));
  const l = await U.maakMijnLink(st);
  controle('maakMijnLink geeft een link met mijn code', l === U.maakLink(SERVER, L.maakCode(st.id, st.pub)));
  r = await bedankt(hex(1));
  controle('een vriend die er al was voor de link, telt nog steeds niet', r.meldingen.length === 0 && (await U.laad()).n === 0);
  await slaap(5);
  let n = 0;
  for (let i = 3; i <= 14; i++) {
    st.vrienden.push(vrienden[i - 1]);
    await U.onderhoud(st); // noteert de nieuwe vriend (na de link)
    r = await bedankt(hex(i));
    if (r.meldingen.length) n++;
    if (i === 3) {
      const s1 = await U.laad();
      controle('eerste beloning: 1 gratis pakje plus bonus (klein)', s1.n === 1 && (await pakjes()) === 2 && /gratis pakje/.test(r.meldingen[0]) && /bonus/.test(r.meldingen[0]), r.meldingen[0]);
      const again = await bedankt(hex(3));
      controle('dezelfde vriend nog eens bedankt: geen tweede beloning', again.meldingen.length === 0 && (await U.laad()).n === 1 && (await pakjes()) === 2);
    }
  }
  const sNa = await U.laad();
  controle('na 12 uitnodigingen: precies 10 beloningen', n === 10 && sNa.n === 10, `${n} ${sNa.n}`);
  controle('10 gewone pakjes en 3 bonuspakjes (1, 5 en 10)', (await pakjes()) === 13, String(await pakjes()));
  r = await bedankt(hex(14), 5);
  controle('over het maximum: nog steeds geen beloning', r.meldingen.length === 0 && (await U.laad()).n === 10);
  L.stuurBericht = echt;
  const nepVerz = await U.opBerichten(st, hex(555), [{ seq: 1, leeftijd: 1, m: { t: 'uitnodiging-bedankt' } }]); // geen vriend
  controle('bedankt van iemand die geen vriend is, doet niets', nepVerz.meldingen.length === 0 && nepVerz.veranderd === false);

  // --- aartsrivaal in Node: de berichtenstroom met een nep-verzender ---
  mem.clear();
  const sA = { id: hex(1), pub: 'p', vrienden: [{ id: hex(2), pub: 'p', alias: 'Bram', status: 'vriend', deel: { modus: 'niets', ids: [] } }, { id: hex(3), pub: 'p', alias: 'Cas', status: 'vriend', deel: { modus: 'niets', ids: [] } }] };
  const uit = [];
  L.stuurBericht = async (s, v, obj) => { uit.push([v.id, obj.t]); };
  const bm = (id, seq, t, leeftijd) => R.opBerichten(sA, id, [{ seq, leeftijd: leeftijd === undefined ? 1 : leeftijd, m: typeof t === 'string' ? { t } : t }]);
  let x = await bm(hex(2), 10, 'rivaal');
  controle('verzoek van een vriend komt in de lijst met een melding', x.meldingen.length === 1 && /Bram wil jouw aartsrivaal worden/.test(x.meldingen[0]) && Object.keys((await R.laad()).verzoeken).length === 1);
  x = await bm(hex(2), 10, 'rivaal');
  controle('hetzelfde bericht (zelfde volgnummer) nog eens: genegeerd', x.meldingen.length === 0);
  x = await bm(hex(3), 11, { t: 'rivaal-ja' });
  controle('"ja" van iemand die ik niets vroeg: ik zeg dat we geen rivalen zijn', uit.some(([id, t]) => id === hex(3) && t === 'rivaal-stop') && (await R.laad()).id === null);
  await R.accepteer(sA, hex(2));
  let s = await R.laad();
  controle('accepteren maakt de rivaliteit actief en stuurt ja', s.id === hex(2) && s.status === 'actief' && uit.some(([id, t]) => id === hex(2) && t === 'rivaal-ja') && !Object.keys(s.verzoeken).length);
  await bm(hex(3), 12, 'rivaal');
  let geweigerd = false;
  try { await R.accepteer(sA, hex(3)); } catch (e) { geweigerd = /al een aartsrivaal/.test(e.message); }
  controle('maximaal één rivaal: een tweede accepteren mislukt', geweigerd && (await R.laad()).id === hex(2));
  geweigerd = false;
  try { await R.vraag(sA, hex(3)); } catch (e) { geweigerd = /al een aartsrivaal/.test(e.message); }
  controle('maximaal één rivaal: een tweede vragen mislukt', geweigerd);
  await bm(hex(3), 13, 'rivaal-stop');
  controle('stop van iemand die niet mijn rivaal is, verandert niets', (await R.laad()).id === hex(2) && !('hex3' in (await R.laad()).verzoeken) && !(hex(3) in (await R.laad()).verzoeken));
  await bm(hex(2), 14, 'rivaal-ja');
  controle('ja van mijn actieve rivaal laat alles zoals het is', (await R.laad()).status === 'actief');
  await bm(hex(2), 15, 'rivaal-stop');
  s = await R.laad();
  controle('stop van de rivaal beëindigt de rivaliteit', s.id === null && s.status === null);
  await bm(hex(2), 16, { t: 'rivaal', extra: 'x'.repeat(5000), '__proto__': { t: 'rivaal-ja' } });
  controle('extra velden in een bericht doen niets (alleen het type telt)', Object.keys((await R.laad()).verzoeken).length === 2 || Object.keys((await R.laad()).verzoeken).length === 1);
  controle('een verzoek van iemand die geen vriend is, wordt genegeerd', (await R.opBerichten(sA, hex(77), [{ seq: 1, leeftijd: 1, m: { t: 'rivaal' } }])).meldingen.length === 0);
  // vragen en wederzijds
  mem.clear(); uit.length = 0;
  await R.vraag(sA, hex(2));
  s = await R.laad();
  controle('vragen: status verzonden en verzoek verstuurd', s.status === 'verzonden' && uit.some(([id, t]) => id === hex(2) && t === 'rivaal'));
  x = await bm(hex(2), 20, 'rivaal-nee');
  controle('nee van de ander wist mijn verzoek', (await R.laad()).id === null && /geen aartsrivaal/.test(x.meldingen[0]));
  await R.vraag(sA, hex(2));
  x = await bm(hex(2), 21, 'rivaal');
  controle('wij vragen elkaar tegelijk: meteen actief', (await R.laad()).status === 'actief' && x.meldingen.length === 1);
  L.stuurBericht = echt;

  // --- rivaalmunten: 10 per gewonnen gevecht, hoogstens 30 per dag, geen dubbele uitbetaling ---
  const voor = (await E.lees()).munten.saldo;
  const nu = Date.now();
  const gv = { [hex(2)]: [1, 2, 3, 4, 5].map((i) => ({ ts: nu + i, mijn: 3, hun: 1, n: 3 })).concat([{ ts: nu + 50, mijn: 1, hun: 3, n: 3 }, { ts: nu - 5 * 864e5, mijn: 3, hun: 0, n: 3 }]) };
  const m1 = await R.verwerkGevechten(gv);
  const m2 = await R.verwerkGevechten(gv);
  controle('rivaalmunten: 3 winsten betaald (max 30 per dag), verlies en oude winst niet', m1 === 30 && m2 === 0 && (await E.lees()).munten.saldo === voor + 30, `${m1} ${m2}`);
  const gevechtAnder = { [hex(3)]: [{ ts: nu, mijn: 3, hun: 1, n: 3 }] };
  controle('winst op een vriend die niet mijn rivaal is, geeft niets', (await R.verwerkGevechten(gevechtAnder)) === 0);
  // vergelijking
  const w = R.vergelijk({ galerij: [{ cijfer: 8, weging: 1, tier: 2 }], gek: { kaarten: [], top: [], profiel: null }, gevechten: [{ ts: nu, mijn: 2, hun: 1 }, { ts: nu - 1, mijn: 1, hun: 2 }, { ts: nu - 2, mijn: 2, hun: 1 }], nu });
  controle('vergelijking: de rivaal deelt geen kaarten = zij is null, niets verzonnen', w.zij === null && w.bekend === true && w.ik.gem === 8 && w.onderling.w === 2 && w.onderling.l === 1 && w.reeks.wie === 'ik' && w.reeks.n === 1);
  controle('vergelijking: niet opgehaald is iets anders dan niet delen', R.vergelijk({ galerij: [], gek: undefined, gevechten: [], nu }).bekend === false);
}

(async () => {
  await logicaTests();
  try { fs.unlinkSync(DB); } catch (e) { /* nieuw */ }
  await new Promise((res, rej) => {
    const f = path.join(TMP, 'schema.php');
    fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2]));`);
    spawn('php', [f, DB, path.join(MAP, 'schema.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res()));
  });
  const web = http.createServer((q, s) => {
    const p = path.join(EXT, decodeURIComponent(new URL(q.url, WEB).pathname));
    if (!p.startsWith(EXT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(s);
  }).listen(8125);
  // Andere tests op deze machine draaien soms 'pkill php': onze server krijgt daarom een eigen naam (een symlink naar php).
  const dienst = path.join(TMP, 'spo-v3-dienst');
  try { fs.unlinkSync(dienst); } catch (e) { /* nieuw */ }
  fs.symlinkSync(require('node:child_process').execSync('command -v php', { shell: '/bin/sh' }).toString().trim(), dienst);
  const php = spawn(dienst, ['-S', 'localhost:8161', '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB }), stdio: ['ignore', 'ignore', fs.openSync(path.join(TMP, 'php.log'), 'w')] });
  const br = await chromium.launch();
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(SERVER, { method: 'OPTIONS' }); break; } catch (e) { await slaap(100); } }
    const galerij = (vak, basis) => [[4.9, 0], [6.4, 1], [8.1, 2], [9.4, 3], [9.97, 4]].map(([c, tier], i) => ({ id: `${vak}-${i}`, ts: 1760000000000 + (basis + i) * 86400000, vak, cijfer: c, onderwerp: 'Toets ' + (i + 1), weging: 2, opening: 'pak', tier, trede: tier === 3 ? 3 : 0, kaart: 'data:image/png;base64,AAAA' }));
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
    // X stuurt Y een verzoek met een bijnaam; Y accepteert met een andere bijnaam
    const bevriend = async (X, Y, aliasY, aliasX, codeInvoer, vink) => {
      await sec(X, 'toevoegen');
      await X.p.fill('#t-code', codeInvoer || Y.code); await X.p.fill('#t-alias', aliasY);
      if (vink) await X.p.check('#t-uitnodiging');
      await X.p.click('#toevoegen button[type=submit]');
      await Y.p.click('#sync'); await sec(Y, 'toevoegen');
      await Y.p.waitForSelector('#verzoeken .verzoek');
      await Y.p.fill('#verzoeken .verzoek input[type=text]', aliasX);
      await Y.p.check('#verzoeken .verzoek input[type=checkbox]');
      await Y.p.click('#verzoeken .verzoek >> text=Accepteren');
      await X.p.click('#sync');
      await X.p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_vrienden')).vrienden.some((v) => v.status === 'vriend'));
    };
    const lees = (P, sleutel) => P.p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), sleutel);
    const A = await maak('A', galerij('Wiskunde', 0));
    const B = await maak('B', galerij('Engels', 10));
    const C = await maak('C', galerij('Frans', 20));
    await bevriend(A, B, 'Sanne', 'Daan');
    await bevriend(A, C, 'Cas', 'Daan');
    await sec(A, 'vrienden'); await sec(B, 'vrienden'); await sec(C, 'vrienden');
    controle('zonder rivaal en zonder verzoek: geen rivalenkaart', await A.p.locator('#rivaal-sectie').isHidden());
    controle('A ziet bij elke vriend de knop Maak rivaal', (await A.p.getByRole('button', { name: /als aartsrivaal$/ }).count()) === 2);

    // --- rivaalverzoek -> accepteren ---
    await A.p.locator('.vriend', { hasText: 'Sanne' }).getByRole('button', { name: /^Maak rivaal/ }).click();
    await A.p.waitForSelector('.vriend:has-text("Sanne") .rivaal-label');
    controle('A ziet "Rivaalverzoek verstuurd" bij Sanne', /Rivaalverzoek verstuurd/.test(await A.p.textContent('.vriend:has-text("Sanne") .rivaal-label')));
    controle('A heeft nu geen Maak rivaal-knoppen meer (één rivaal tegelijk)', (await A.p.getByRole('button', { name: /als aartsrivaal$/ }).count()) === 0);
    controle('A ziet dat hij wacht op antwoord', /Wacht|wacht|ja zegt/.test(await A.p.textContent('#rivaal-sectie')));
    await B.p.waitForSelector('#rivaal-sectie:not([hidden]) .rv-verzoek', { timeout: 15000 });
    controle('B ziet het verzoek van Daan', /Daan wil jouw aartsrivaal worden/.test(await B.p.textContent('#rivaal-sectie')));
    await schot(B, '1-rivaalverzoek', '#rivaal-sectie');
    await B.p.getByRole('button', { name: 'Accepteren' }).click();
    await B.p.waitForSelector('.rv-tabel');
    await A.p.waitForSelector('.rv-tabel', { timeout: 15000 });
    controle('A en B zijn nu allebei rivalen', /Rivaal/.test(await A.p.textContent('.vriend:has-text("Sanne") .rivaal-label')) && /Rivaal/.test(await B.p.textContent('.vriend:has-text("Daan") .rivaal-label')));
    controle('de staat is bewaard als spo_rivaal', (await lees(A, 'spo_rivaal')).status === 'actief' && (await lees(A, 'spo_rivaal')).id === B.id && (await lees(B, 'spo_rivaal')).id === A.id);

    // --- de kaart toont alleen wat de rivaal zelf deelt ---
    const kaartTekst = () => A.p.textContent('#rivaal-sectie');
    const cel = async (P, rij, kolom) => (await P.p.locator('.rv-tabel tbody tr', { has: P.p.locator('th', { hasText: new RegExp('^' + rij + '$') }) }).locator('td').nth(kolom).textContent()).replace(/\s+/g, ' ').trim();
    await A.p.click('#sync'); await slaap(500);
    controle('B deelt niets: gemiddelde van Sanne staat er niet, "deelt dit niet"', /deelt dit niet/.test(await cel(A, 'Gemiddelde', 1)) && !/9,97/.test(await cel(A, 'Beste kaart', 1)), await cel(A, 'Gemiddelde', 1));
    controle('en A\'s eigen gemiddelde (7,75) staat er wel', /7,75/.test(await cel(A, 'Gemiddelde', 0)), await cel(A, 'Gemiddelde', 0));
    controle('B deelt niets: ook beste kaart en niveaus ontbreken netjes', /deelt dit niet/.test(await cel(A, 'Beste kaart', 1)) && /deelt dit niet/.test(await cel(A, 'Goud', 1)));
    await schot(A, '2-rivalenkaart-niets-gedeeld', '#rivaal-sectie');
    // B gaat delen
    await B.p.locator('.vriend .v-meer summary').first().click();
    await B.p.selectOption('.vriend select', 'selectie');
    await B.p.check('#sel-' + A.id + '-Engels-2'); await B.p.check('#sel-' + A.id + '-Engels-4');
    await B.p.waitForTimeout(1500);
    await A.p.click('#sync');
    await A.p.waitForFunction(() => !/deelt dit niet/.test(document.querySelector('.rv-tabel tbody tr td:nth-child(3)').textContent), null, { timeout: 15000 });
    controle('B deelt twee kaarten: gemiddelde (8,1 en 9,97 met weging 2) en beste kaart zichtbaar', /9,0[34]/.test(await cel(A, 'Gemiddelde', 1)) && /9,97/.test(await cel(A, 'Beste kaart', 1)), await cel(A, 'Gemiddelde', 1) + ' / ' + await cel(A, 'Beste kaart', 1));
    controle('B deelt maar twee kaarten: Brons van B ontbreekt, Goud en Icoon staan er', (await cel(A, 'Brons', 1)).startsWith('0') && (await cel(A, 'Goud', 1)).startsWith('1') && (await cel(A, 'Icoon', 1)).startsWith('1'));
    controle('de noot zegt hoeveel kaarten hij deelt', /2 kaarten/.test(await A.p.textContent('.rv-noot')));
    controle('beste kaart 9,97 wordt niet afgerond naar 10,0', !/10,0/.test(await cel(A, 'Beste kaart', 1)));

    // --- gevechten, week en rivaalmunten ---
    await A.p.evaluate((idB) => {
      const nu = Date.now();
      const g = {}; g[idB] = [1, 2, 3, 4, 5].map((i) => ({ ts: nu + i * 10, mijn: 3, hun: 1, n: 3 }));
      localStorage.setItem('spo_gevechten', JSON.stringify(g));
    }, B.id);
    await A.p.reload(); await A.p.waitForSelector('.rv-tabel');
    await A.p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('spo_munten')).saldo >= 30; } catch (e) { return false; } }, null, { timeout: 10000 });
    const munten = await lees(A, 'spo_munten');
    controle('vijf gewonnen gevechten tegen de rivaal: 30 munten (maximum per dag)', munten.saldo === 30 && munten.totaal === 30, JSON.stringify(munten));
    await A.p.reload(); await A.p.waitForSelector('.rv-tabel'); await slaap(800);
    controle('na opnieuw laden geen dubbele munten', (await lees(A, 'spo_munten')).saldo === 30);
    controle('stand: "Jij leidt: jij won 5, Sanne won 0"', /Deze week: jij leidt met 5-0/.test(await A.p.textContent('.rv-week')), await A.p.textContent('.rv-week'));
    controle('gevechten onderling en reeks kloppen', (await cel(A, 'Gevechten onderling gewonnen', 0)).startsWith('5') && (await cel(A, 'Gevechten onderling gewonnen', 1)).startsWith('0') && /5 op rij/.test(await cel(A, 'Huidige reeks', 0)));
    await schot(A, '3-rivalenkaart', '#rivaal-sectie');
    await A.p.setViewportSize({ width: 390, height: 900 });
    await schot(A, '3b-rivalenkaart-telefoon', '#rivaal-sectie');
    controle('geen horizontale scroll op de pagina (telefoon)', await A.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await A.p.setViewportSize({ width: 900, height: 1000 });

    // --- maximaal één rivaal; kwaadaardige berichten van een vriend ---
    await C.p.locator('.vriend', { hasText: 'Daan' }).getByRole('button', { name: /^Maak rivaal/ }).click();
    await A.p.waitForSelector('.rv-verzoek', { timeout: 15000 });
    controle('A ziet het verzoek van Cas, maar kan het niet accepteren (heeft al een rivaal)', /Cas wil jouw aartsrivaal worden/.test(await A.p.textContent('.rv-verzoek')) && await A.p.locator('.rv-verzoek button:has-text("Accepteren")').isDisabled() && /al een aartsrivaal/.test(await A.p.textContent('.rv-verzoek')));
    await schot(A, '4-tweede-verzoek-geblokkeerd', '#rivaal-sectie');
    await A.p.locator('.rv-verzoek').getByRole('button', { name: 'Weigeren' }).click();
    try { await C.p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_rivaal') || '{}').id === null, null, { timeout: 15000 }); } catch (e) { console.log('DEBUG C', JSON.stringify(await lees(C, 'spo_rivaal')), 'A', JSON.stringify(await lees(A, 'spo_rivaal')), C.fouten, await C.p.textContent('#sync-status')); }
    controle('na weigeren is Cas weer vrij en A heeft nog steeds Sanne', (await lees(A, 'spo_rivaal')).id === B.id && !Object.keys((await lees(A, 'spo_rivaal')).verzoeken).length);
    const stuurC = (obj) => C.p.evaluate(async ({ idA, obj }) => { const st = await SPOVrienden.laad(); const v = st.vrienden.find((x) => x.id === idA); await SPOVrienden.stuurBericht(st, v, obj); }, { idA: A.id, obj });
    const voorA = JSON.stringify((await lees(A, 'spo_rivaal')).verzoeken) + (await lees(A, 'spo_rivaal')).id + (await lees(A, 'spo_uitnodigingen') ? 'u' : '');
    for (const m of [{ t: '__proto__' }, { t: 'constructor' }, { t: ['rivaal-stop'] }, ['rivaal'], 'rivaal', { t: 'rivaal-ja' }, { t: 'rivaal-stop' }, { t: 'rivaal-nee' }, { t: 'uitnodiging-bedankt' }, { t: 'uitnodiging-ok' }, { t: 'rivaal', x: 'x'.repeat(1500) }]) {
      try { await stuurC(m); } catch (e) { /* te groot e.d. */ }
    }
    await slaap(3500);
    const sa = await lees(A, 'spo_rivaal');
    controle('kwaadaardige berichten van Cas: Sanne blijft rivaal, geen nieuwe rivaal', sa.id === B.id && sa.status === 'actief');
    controle('alleen een geldig "rivaal"-bericht wordt een (geblokkeerd) verzoek, de rest niets', Object.keys(sa.verzoeken).length <= 1);
    controle('geen beloning voor een "bedankt" zonder uitnodiging', !(await lees(A, 'spo_uitnodigingen')) || (await lees(A, 'spo_uitnodigingen')).n === 0);
    controle('A had geen fouten in de console', A.fouten.length === 0, A.fouten.join('|'));
    if ((await A.p.locator('.rv-verzoek').count())) await A.p.locator('.rv-verzoek').getByRole('button', { name: 'Weigeren' }).click();

    // --- stoppen ---
    await B.p.getByRole('button', { name: /Rivaliteit met .* stoppen/ }).click();
    await B.p.getByRole('button', { name: /Rivaliteit met .* stoppen/ }).click();
    await A.p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_rivaal') || '{}').id === null, null, { timeout: 15000 });
    controle('B stopt: A is ook geen rivaal meer, kaart verdwijnt', await A.p.locator('#rivaal-sectie').isHidden() && await B.p.locator('#rivaal-sectie').isHidden() && (await lees(B, 'spo_rivaal')).id === null);
    controle('en de Rivaal-labels zijn weg', (await A.p.locator('.rivaal-label').count()) === 0 && (await A.p.getByRole('button', { name: /als aartsrivaal$/ }).count()) === 2);
    // stoppen door A zelf, na opnieuw vragen
    await A.p.locator('.vriend', { hasText: 'Sanne' }).getByRole('button', { name: /^Maak rivaal/ }).click();
    await B.p.waitForSelector('.rv-verzoek', { timeout: 15000 });
    await B.p.getByRole('button', { name: 'Accepteren' }).click();
    await A.p.waitForSelector('.rv-tabel', { timeout: 15000 });
    await A.p.getByRole('button', { name: /Rivaliteit met .* stoppen/ }).click();
    await A.p.getByRole('button', { name: /Rivaliteit met .* stoppen/ }).click();
    await B.p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_rivaal') || '{}').id === null, null, { timeout: 15000 });
    controle('A stopt: B is ook geen rivaal meer', (await lees(B, 'spo_rivaal')).id === null && (await lees(A, 'spo_rivaal')).id === null);

    // --- uitnodig-link ---
    await sec(A, 'vrienden');
    await A.p.click('#nodig-uit');
    await A.p.waitForSelector('#uitnodig-venster[open]');
    const linkA = await A.p.inputValue('#un-link');
    controle('de uitnodigingslink hoort bij het serveradres en bevat mijn vriendcode', linkA === SERVER + '?uitnodiging=' + A.code, linkA);
    controle('het venster is eerlijk: extensie staat niet in de winkel', /niet in de Chrome Web Store/.test(await A.p.textContent('#uitnodig-venster')));
    await A.p.click('#un-kopieer');
    controle('Kopieer link zet de link op het klembord', (await A.p.evaluate(() => navigator.clipboard.readText())) === linkA);
    controle('het venster toont de teller', /0 van 10/.test(await A.p.textContent('#un-tel')));
    await schot(A, '5-uitnodigvenster');
    await A.p.keyboard.press('Escape');
    await A.p.waitForSelector('#uitnodig-venster', { state: 'detached' });
    controle('Escape sluit het venster', true);
    const D = await maak('D', galerij('Duits', 30));
    await bevriend(D, A, 'Alex', 'Dirk', linkA, false); // D plakt de hele link; A accepteert
    const gratis = async (P) => ((await lees(P, 'spo_munten_log')) || []).filter((x) => x.id.startsWith('pak:gratis:')).length;
    await D.p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('spo_uitnodigingen')).n === 1; } catch (e) { return false; } }, null, { timeout: 20000 });
    controle('D (kwam via de link) kreeg een pakje plus bonus', (await gratis(D)) === 2 && (await lees(D, 'spo_vrienden')).vrienden.find((v) => v.id === A.id).via === true);
    await A.p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('spo_uitnodigingen')).n === 1; } catch (e) { return false; } }, null, { timeout: 25000 });
    const ua = await lees(A, 'spo_uitnodigingen');
    controle('A (nodigde uit) kreeg ook een pakje plus bonus, precies één keer', (await gratis(A)) === 2 && ua.n === 1 && Object.keys(ua.beloond).length === 1 && ua.beloond[D.id] > 0, JSON.stringify(ua));
    await slaap(2500);
    controle('D stopt met bedanken na het ok van A', (await lees(D, 'spo_uitnodigingen')).door[A.id].s === 'klaar');
    controle('geen dubbele pakjes na wachten', (await gratis(A)) === 2 && (await gratis(D)) === 2);
    await sec(A, 'vrienden');
    await A.p.click('#nodig-uit'); await A.p.waitForSelector('#uitnodig-venster[open]');
    controle('de teller staat nu op 1 van 10', /1 van 10/.test(await A.p.textContent('#un-tel')));
    await A.p.keyboard.press('Escape');
    // E: voegt A toe met alleen de code en zonder vinkje: telt niet als uitnodiging
    const Ev = await maak('E', galerij('Latijn', 40));
    await bevriend(Ev, A, 'Alex', 'Eva', null, false);
    await slaap(4000);
    controle('een gewone code zonder vinkje telt niet als uitnodiging', (await gratis(Ev)) === 0 && (await gratis(A)) === 2 && (await lees(A, 'spo_uitnodigingen')).n === 1);
    controle('geen fouten in de consoles', [A, B, D, Ev].every((P) => P.fouten.length === 0), [A, B, D, Ev].map((P) => P.fouten.join('|')).join(' // '));
  } finally {
    await br.close(); php.kill(); web.close();
  }
  console.log(`${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
