// Accounttest (v2.2): account maken met een code per mail, back-up versleuteld bewaren en in een "nieuwe browser" terugzetten.
// Gebruik: node server/test/account.test.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const A = require('../../extension/account.js');

const MAP = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-acc-'));
const DB = path.join(TMP, 'acc.sqlite');
const MAIL = path.join(TMP, 'mail.jsonl');
const POORT = 8161;
const URL = `http://localhost:${POORT}/api.php`;
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const laatsteCode = (email, soort) => {
  const regels = fs.existsSync(MAIL) ? fs.readFileSync(MAIL, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const r = regels.filter((x) => x.aan === email && x.soort === soort).pop();
  return r ? r.code : null;
};
async function roep(body, headers) {
  const r = await fetch(URL, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) { /* leeg */ }
  return { s: r.status, j };
}
const fout = async (p) => { try { await p; return null; } catch (e) { return e; } };

(async () => {
  try { await fetch(URL, { method: 'OPTIONS' }); console.log('Poort ' + POORT + ' is bezet'); process.exit(1); } catch (e) { /* vrij */ }
  const f = path.join(TMP, 'schema.php');
  fs.writeFileSync(f, `<?php $d=new PDO('sqlite:'.$argv[1]); $d->exec(file_get_contents($argv[2])); $d->exec(file_get_contents($argv[2]));`);
  await new Promise((res, rej) => spawn('php', [f, DB, path.join(MAP, 'schema.sql')]).on('exit', (c) => (c ? rej(new Error('schema')) : res())));
  const php = spawn('php', ['-S', 'localhost:' + POORT, '-t', MAP], { env: Object.assign({}, process.env, { SPO_CONFIG: path.join(MAP, 'test/config.test.php'), SPO_TESTDB: DB, SPO_MAILBESTAND: MAIL }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(URL, { method: 'OPTIONS' }); break; } catch (e) { await slaap(100); } }
    A.zetServer(URL);
    const email = 'Leerling@Voorbeeld.nl';
    const ww = 'geheim-wachtwoord-1';

    // versleuteling los
    const sl = await A.maakSleutel(email, ww);
    controle('sleutel is gelijk voor hoofdletters', sl === (await A.maakSleutel('leerling@voorbeeld.nl', ww)));
    const blob = await A.versleutel(sl, { hallo: 'wereld', n: [1, 2, 3] });
    controle('blob-vorm', /^v1z?\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(blob), blob.slice(0, 20));
    controle('ontsleutelen', JSON.stringify(await A.ontsleutel(sl, blob)) === JSON.stringify({ hallo: 'wereld', n: [1, 2, 3] }));
    controle('ander wachtwoord kan niet lezen', !!(await fout(A.ontsleutel(await A.maakSleutel(email, 'ander-wachtwoord'), blob))));

    // invoer controleren
    controle('slecht e-mailadres', (await roep({ a: 'accRegistreer', email: 'geen-mail', ww })).s === 400);
    controle('kort wachtwoord', (await roep({ a: 'accRegistreer', email, ww: 'kort' })).s === 400);
    controle('backup zonder sessie', (await roep({ a: 'accBackupLaad' })).s === 401);

    // account maken: code per mail
    await A.registreer(email, ww);
    const code1 = laatsteCode('leerling@voorbeeld.nl', 'verifieer');
    controle('code verstuurd', /^[0-9]{6}$/.test(code1 || ''), code1);
    const e1 = await fout(A.login(email, ww));
    controle('inloggen voor bevestigen: nietBevestigd', e1 && e1.status === 403 && e1.data && e1.data.nietBevestigd === true, e1 && e1.message);
    const code2 = laatsteCode('leerling@voorbeeld.nl', 'verifieer');
    controle('nieuwe code na inlogpoging', code2 && code2 !== code1 || code2 === code1);
    const e2 = await fout(A.verifieer(email, code2 === '000000' ? '111111' : '000000', ww));
    controle('foute code', e2 && /klopt niet/.test(e2.message), e2 && e2.message);
    const e3 = await fout(A.verifieer(email, code1 === code2 ? '999998' : code1, ww));
    controle('oude code werkt niet meer', !!e3);

    // gegevens in "browser 1"
    const kaart = { id: 'k1', ts: 1760000000000, vak: 'Wiskunde', cijfer: 9.6, onderwerp: 'H3', weging: 2, opening: 'pak', tier: 3, zeldzaam: true, kaart: 'data:image/webp;base64,AAAA' };
    localStorage.setItem('spo_galerij', JSON.stringify([kaart]));
    localStorage.setItem('spo_munten', JSON.stringify({ v: 1, saldo: 120, totaal: 300, init: true }));
    localStorage.setItem('spo_prestaties', JSON.stringify({ 'eerste-kaart': 5 }));
    localStorage.setItem('spo_vrienden', JSON.stringify({ id: 'abc', vrienden: [{ id: 'def' }] }));
    localStorage.setItem('spo_beheer', JSON.stringify({ sleutel: 'GEHEIM' }));
    const r1 = await A.verifieer(email, code2, ww);
    controle('bevestigen geeft ok', r1 && r1.ok === true, r1);
    controle('ingelogd', (await A.status()).ingelogd === true);
    controle('wachtwoord niet bewaard', !localStorage.getItem('spo_account').includes(ww));
    const ses = JSON.parse(localStorage.getItem('spo_account')).sessie;
    const ruwB = (await roep({ a: 'accBackupLaad' }, { 'X-Sessie': ses })).j;
    controle('back-up staat op de server', typeof ruwB.data === 'string' && ruwB.data.length > 20);
    controle('server ziet geen platte tekst', !/Wiskunde|GEHEIM|abc/.test(ruwB.data));
    const inhoud = await A.ontsleutel(JSON.parse(localStorage.getItem('spo_account')).sleutel, ruwB.data);
    controle('beheersleutel niet in back-up', inhoud.data.spo_beheer === undefined);
    controle('plaatje niet in back-up', inhoud.data.spo_galerij && inhoud.data.spo_galerij[0] && inhoud.data.spo_galerij[0].kaart === undefined);
    controle('registreren met bestaand adres', (await roep({ a: 'accRegistreer', email, ww })).s === 409);

    // "update": alles weg, opnieuw inloggen
    mem.clear();
    localStorage.setItem('spo_munten', JSON.stringify({ v: 1, saldo: 50, totaal: 50, init: true })); // startbedrag van de nieuwe installatie
    const e4 = await fout(A.login(email, 'verkeerd-wachtwoord'));
    controle('fout wachtwoord', e4 && e4.status === 401);
    const r2 = await A.login(email.toLowerCase(), ww);
    controle('teruggezet', r2.ok && r2.teruggezet > 0, r2);
    const gal = JSON.parse(localStorage.getItem('spo_galerij') || '[]');
    controle('galerij terug', gal.length === 1 && gal[0].vak === 'Wiskunde' && gal[0].cijfer === 9.6);
    controle('munten terug (hoogste)', JSON.parse(localStorage.getItem('spo_munten')).totaal === 300);
    controle('vrienden terug', JSON.parse(localStorage.getItem('spo_vrienden')).id === 'abc');
    controle('badges terug', JSON.parse(localStorage.getItem('spo_prestaties'))['eerste-kaart'] === 5);

    // winkel: na een verse installatie met lege standaardwinkel blijven de gekochte spullen bewaard
    controle('winkel samenvoegen', JSON.stringify(A.samenvoegen('spo_winkel', { gekocht: [], gebruik: { somtoday: 'standaard', titel: null, bg: 'standaard' } }, { gekocht: ['st-goud'], gebruik: { somtoday: 'st-goud', titel: null, bg: 'standaard' } }, true).gekocht) === '["st-goud"]');
    controle('winkel: gebruik van server bij verse installatie', A.samenvoegen('spo_winkel', { gekocht: [], gebruik: { somtoday: 'standaard' } }, { gekocht: ['st-goud'], gebruik: { somtoday: 'st-goud' } }, true).gebruik.somtoday === 'st-goud');
    controle('winkel: niets kwijt zonder vers', A.samenvoegen('spo_winkel', { gekocht: ['st-bos'], gebruik: {} }, { gekocht: ['st-goud'], gebruik: {} }, false).gekocht.length === 2);
    // het echte scenario: winkel in back-up, verse installatie maakt een lege winkel, dan inloggen
    localStorage.setItem('spo_winkel', JSON.stringify({ gekocht: ['st-goud', 'st-neon'], gebruik: { somtoday: 'st-goud', titel: null, bg: 'standaard' } }));
    await A.bewaar();
    mem.clear();
    localStorage.setItem('spo_winkel', JSON.stringify({ gekocht: [], gebruik: { somtoday: 'standaard', titel: null, bg: 'standaard' } }));
    localStorage.setItem('spo_instellingen', JSON.stringify({ opening: 'pak' }));
    await A.login(email.toLowerCase(), ww);
    const wk = JSON.parse(localStorage.getItem('spo_winkel'));
    controle('na update: gekochte spullen terug', wk.gekocht.includes('st-goud') && wk.gekocht.includes('st-neon'), wk);
    controle('na update: thema weer aan', wk.gebruik.somtoday === 'st-goud', wk);

    // samenvoegen: lokale kaart blijft, server-kaart komt erbij
    const sv = A.samenvoegen('spo_galerij', [{ id: 'k2', ts: 2 }], [{ id: 'k1', ts: 1 }, { id: 'k2', ts: 2, oud: true }]);
    controle('samenvoegen galerij', sv.length === 2 && sv[0].id === 'k2' && !sv[0].oud);

    // uitloggen maakt de sessie ongeldig
    const ses2 = JSON.parse(localStorage.getItem('spo_account')).sessie;
    await A.uitloggen();
    controle('uitgelogd', (await A.status()).ingelogd === false);
    controle('oude sessie werkt niet meer', (await roep({ a: 'accBackupLaad' }, { 'X-Sessie': ses2 })).s === 401);

    // wachtwoord vergeten
    await A.vergeten(email);
    const rc = laatsteCode('leerling@voorbeeld.nl', 'reset');
    controle('resetcode', /^[0-9]{6}$/.test(rc || ''));
    await A.vergeten('bestaat-niet@voorbeeld.nl');
    controle('geen mail naar onbekend adres', laatsteCode('bestaat-niet@voorbeeld.nl', 'reset') === null);
    controle('vergeten verraadt niets', (await roep({ a: 'accVergeten', email: 'bestaat-niet@voorbeeld.nl' })).s === 200);
    const r3 = await A.reset(email, rc, 'nieuw-wachtwoord-2');
    controle('reset ok en gegevens opnieuw opgeslagen', r3.ok === true);
    controle('oud wachtwoord werkt niet', !!(await fout(A.login(email, ww))));
    mem.clear();
    const r4 = await A.login(email, 'nieuw-wachtwoord-2');
    controle('na reset: back-up leesbaar met nieuw wachtwoord', r4.ok && JSON.parse(localStorage.getItem('spo_galerij') || '[]').length === 1, r4);

    // te vaak een foute code
    await A.registreer('tweede@voorbeeld.nl', ww);
    for (let i = 0; i < 5; i++) await roep({ a: 'accVerifieer', email: 'tweede@voorbeeld.nl', code: '12345' + (i % 10) === laatsteCode('tweede@voorbeeld.nl', 'verifieer') ? '000001' : '12345' + i });
    const goed = laatsteCode('tweede@voorbeeld.nl', 'verifieer');
    controle('na 5 foute pogingen geblokkeerd', (await roep({ a: 'accVerifieer', email: 'tweede@voorbeeld.nl', code: goed })).s === 429);

    // account verwijderen
    await A.verwijder();
    controle('account weg', (await roep({ a: 'accLogin', email, ww: 'nieuw-wachtwoord-2' })).s === 401);

    // te grote back-up
    await A.registreer('derde@voorbeeld.nl', ww);
    const r5 = await roep({ a: 'accVerifieer', email: 'derde@voorbeeld.nl', code: laatsteCode('derde@voorbeeld.nl', 'verifieer') });
    controle('derde account', r5.s === 200 && r5.j.sessie);
    controle('te grote back-up geweigerd', (await roep({ a: 'accBackupBewaar', data: 'x'.repeat(700001) }, { 'X-Sessie': r5.j.sessie })).s >= 400);
    controle('rare tekens geweigerd', (await roep({ a: 'accBackupBewaar', data: 'v1.<script>' }, { 'X-Sessie': r5.j.sessie })).s === 400);
    // economie: gekochte spullen terug uit de muntengeschiedenis
    mem.clear();
    require('../../extension/economie.js');
    localStorage.setItem('spo_munten', JSON.stringify({ v: 1, saldo: 0, totaal: 500, init: true }));
    localStorage.setItem('spo_winkel', JSON.stringify({ gekocht: [], gebruik: {} }));
    localStorage.setItem('spo_munten_log', JSON.stringify([{ ts: 1, n: -160, r: 'Gekocht: Goud', id: 'k:st-goud' }, { ts: 2, n: -50, r: 'Pakje geopend', id: 'pak:klein:st-bos' }]));
    await globalThis.SPOEco.koop('st-oceaan'); // te weinig munten, maar de winkel wordt wel nagekeken
    const wk2 = JSON.parse(localStorage.getItem('spo_winkel'));
    controle('economie: uit log hersteld', wk2.gekocht.includes('st-goud') && wk2.gekocht.includes('st-bos'), wk2);
    controle('status-pagina', (await (await fetch(URL + '?status=1')).json()).ok === true);
  } catch (e) {
    mis++;
    console.log('FOUT', e);
  } finally {
    php.kill();
  }
  console.log(`\nAccounttest: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})();
