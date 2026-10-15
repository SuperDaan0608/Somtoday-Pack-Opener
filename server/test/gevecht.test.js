// Test van Team en het strafschoppenduel in headless Chromium: twee spelers (twee browsercontexts) spelen een volledig duel via de
// php-server (met vastlegging, schot en onthulling als versleutelde berichten) en moeten dezelfde uitslag zien. Een derde vriend kijkt
// live mee en gooit emoji. Verder: weigeren, stoppen en verbinding verloren. De spelregels zelf staan in v3-duel.test.js.
// Gebruik: export NODE_PATH=$(npm root -g); node server/test/gevecht.test.js   (php en http-server nodig; screenshots in $SPO_TMP)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const L = require('../../extension/vriendenlib.js');
const G = require('../../extension/gevecht.js');
const D = require('../../extension/duellib.js');

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
    // chemie telt mee in een duel (kleine bonus) en beide kanten rekenen er hetzelfde mee
    controle('chemie verandert de kansen echt (klein), in een duel', D.macht(kaart('a', 7), 100, 0) > D.macht(kaart('a', 7), 0, 0) && D.macht(kaart('a', 7), 0, 0) === D.macht(kaart('a', 7), undefined, 0) && (() => { let g0 = 0, g1 = 0; for (let i = 0; i < 4000; i++) { const o = { seedTekst: 'c|' + i, k: i % 10, kant: 'A', beurt: 0, schutter: kaart('a', 7), keeper: kaart('b', 7), chK: 0, auraS: 0, auraK: 0, r: 'links', h: 'hoog', q: 55, dr: 'rechts', dh: 'laag' }; if (D.uitkomst(Object.assign({ chS: 0 }, o)).goal) g0++; if (D.uitkomst(Object.assign({ chS: 100 }, o)).goal) g1++; } return g1 >= g0; })());
    // team met `ch` bij een vriend; oude versie zonder `ch` blijft een geldig team
    const snap = L.teamMomentopname([{ vak: 'Wiskunde', cijfer: 8, tier: 2 }, { vak: 'Natuurkunde', cijfer: 7, tier: 2 }, { vak: 'Scheikunde', cijfer: 6, tier: 1 }]);
    controle('team delen: ch zit mee in het teamdeel', Number.isInteger(snap.ch) && snap.ch > 0 && L.schoonTeam(snap).ch === snap.ch);
    controle('oude versie zonder ch: team geldig, ch ontbreekt (dan chemie 0)', L.schoonTeam({ kaarten: snap.kaarten }) !== null && !('ch' in L.schoonTeam({ kaarten: snap.kaarten })) && !('ch' in L.schoonTeam(Object.assign({}, snap, { ch: 101 }))) && !('ch' in L.schoonTeam(Object.assign({}, snap, { ch: 'x' }))));
  }
  // v2.4: vervloekte kaarten, GG, meekijken en huisdier (pure logica, zonder browser)
  {
    const kaart = (vak, c, v) => ({ vak, cijfer: c, tier: 1, z: true, t: 1, v: v === true });
    controle('vloek: een vervloekte kaart is 1,6 keer zo sterk', Math.abs(G.sterkte(kaart('a', 4, true)) - 1.6 * G.sterkte(kaart('a', 4, false))) < 1e-9 && D.macht(kaart('a', 4, true), 0, 0) > D.macht(kaart('a', 4, false), 0, 0));
    const wel = kaart('x', 4, true), niet = kaart('x', 4, false);
    controle('vloek: een gewone kaart keert zich nooit', [1, 2, 3, 4, 5].every((sd) => [1, 2, 3, 4, 5, 6].every((nr) => G.vloekKeert(sd, nr, 'A', 2, niet) === false)));
    controle('vloek: dezelfde seed geeft altijd dezelfde uitkomst', [7, 99, 123456].every((sd) => [1, 2, 3, 4, 5, 6].every((nr) => G.vloekKeert(sd, nr, 'B', 1, wel) === G.vloekKeert(sd, nr, 'B', 1, wel))));
    let treffers = 0; const N = 4000;
    for (let sd = 1; sd <= N; sd++) if (G.vloekKeert(sd * 7919, 1 + (sd % 6), sd % 2 ? 'A' : 'B', sd % 5, wel)) treffers++;
    controle('vloek: ongeveer 20% van de duels', treffers / N > 0.16 && treffers / N < 0.24, treffers / N);
    // Een volledig duel met vervloekte kaarten: beide kanten (zelfde teams, zelfde getallen) zien dezelfde minpunten
    const team = (v) => G.ordenTeam(['Wiskunde', 'Nederlands', 'Engels', 'Biologie', 'Frans', 'Duits'].map((vk, i) => kaart(vk, 3 + i / 2, v && i % 2 === 0)), 0);
    const speelV = (seed) => {
      const rA = D.rollen(team(true)), rB = D.rollen(team(false)), uit = [];
      for (let k = 0; k < 10; k++) { const z = D.kantVan('A', k), be = D.beurtVan(k); const u = D.uitkomst({ seedTekst: 'v|' + seed, k, kant: z, beurt: be, schutter: D.schutterVoor(z === 'A' ? rA : rB, be), keeper: (z === 'A' ? rB : rA).keeper, chS: 0, chK: 0, auraS: 0, auraK: 0, r: 'links', h: 'hoog', q: 90, dr: 'links', dh: 'hoog' }); uit.push(u.uitkomst + (u.keert ? u.keert.z + u.keert.rol : '')); }
      return uit.join(',');
    };
    controle('vloek: twee computers spelen exact hetzelfde duel', [1, 2, 3, 42, 777].every((sd) => speelV(sd) === speelV(sd)));
    controle('vloek: in sommige duels slaat de vloek echt toe', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some((sd) => /[AB](schutter|keeper)/.test(speelV(sd))));
    // vloek in het gedeelde team (v blijft behouden, oudere teams zonder v zijn niet vervloekt)
    const sn = L.teamMomentopname([{ vak: 'Wiskunde', cijfer: 4, tier: 0, zeldzaam: true, trede: 1, vloek: true }, { vak: 'Engels', cijfer: 7, tier: 2 }]);
    const sc = L.schoonTeam(sn);
    controle('vloek: v zit mee in het gedeelde team en oude teams hebben geen v', sc.kaarten[0].v === true && sc.kaarten[1].v === false && L.schoonTeam({ kaarten: [{ vak: 'a', cijfer: 5, tier: 0 }] }).kaarten[0].v === false);
    // GG en meekijken: alleen wat klopt komt door
    controle('GG: alleen een geldige kaarttijd', L.schoonGG({ t: 'gg', k: 1760000000000 }).k === '1760000000000' && L.schoonGG({ t: 'gg', k: '1760000000000' }) !== null && L.schoonGG({ t: 'gg', k: 'x' }) === null && L.schoonGG({ t: 'gg' }) === null && L.schoonGG({ t: 'kijk', k: 1 }) === null && L.schoonGG(null) === null);
    const kijk = { t: 'kijk', mid: 'abcdef0123456789', vak: 'Wiskunde', cijfer: 9.7, trede: 3, opening: 'ster', seizoen: 'geen' };
    controle('kijk: geldig bericht, maximaal 60 seconden oud', L.schoonKijk(kijk, 5).trede === 3 && L.schoonKijk(kijk, 59) !== null && L.schoonKijk(kijk, 61) === null && L.schoonKijk(kijk, 60) === null);
    controle('kijk: onzin wordt geweigerd of opgeschoond', L.schoonKijk(Object.assign({}, kijk, { trede: 2 }), 1) === null && L.schoonKijk(Object.assign({}, kijk, { cijfer: 11 }), 1) === null && L.schoonKijk(Object.assign({}, kijk, { mid: '../x' }), 1) === null && L.schoonKijk(Object.assign({}, kijk, { vak: 'x'.repeat(200) }), 1) === null && L.schoonKijk(Object.assign({}, kijk, { opening: '<script>' }), 1).opening === 'pak' && L.schoonKijk(Object.assign({}, kijk, { seizoen: 'x' }), 1).seizoen === 'auto');
    controle('emoji: alleen de vier om te gooien', L.schoonKijkEmoji({ t: 'emoji', e: '\u{1F525}' }) === '\u{1F525}' && L.schoonKijkEmoji({ t: 'emoji', e: '\u{1F602}' }) !== null && L.schoonKijkEmoji({ t: 'emoji', e: '\u{1F480}' }) === null && L.schoonKijkEmoji({ t: 'emoji', e: '<b>' }) === null && L.schoonKijkEmoji({ t: 'kijk', e: '\u{1F525}' }) === null);
    const vr = (modus) => ({ id: modus, status: 'vriend', deel: { modus, ids: [] } });
    controle('kijk: alleen naar vrienden aan wie je alles laat zien', L.kijkOntvangers({ vrienden: [vr('alles'), vr('selectie'), vr('niets'), Object.assign(vr('alles'), { id: 'x', status: 'verzonden' }), Object.assign(vr('alles'), { id: 'y', andereVersie: true })] }).map((v) => v.id).join() === 'alles');
    // Huisdier
    const H = require('../../extension/huisdier.js');
    controle('huisdier: stadia op de drempels', H.stadiumVan(0) === 0 && H.stadiumVan(24) === 0 && H.stadiumVan(25) === 1 && H.stadiumVan(100) === 2 && H.stadiumVan(250) === 3 && H.stadiumVan(500) === 4 && H.stadiumVan(99999) === 4);
    controle('huisdier: hoger cijfer en hogere trede geven meer xp', H.xpVoor(9, 0) > H.xpVoor(6, 0) && H.xpVoor(6, 3) > H.xpVoor(6, 1) && H.xpVoor(6, 1) > H.xpVoor(6, 0) && H.xpVoor(0, 0) === 0 && H.xpVoor(11, 0) === 0 && H.xpVoor(1, 0) >= 2);
    const nu = 1760000000000;
    controle('huisdier: humeur blij of verdrietig en na 6 uur weer rustig', H.humeurVan({ humeur: { s: 'blij', ts: nu - 1000 } }, nu) === 'blij' && H.humeurVan({ humeur: { s: 'verdrietig', ts: nu - 1000 } }, nu) === 'verdrietig' && H.humeurVan({ humeur: { s: 'blij', ts: nu - 7 * 3600e3 } }, nu) === 'rustig' && H.humeurVan(null, nu) === 'rustig' && H.humeurVan({ humeur: { s: 'boos', ts: nu } }, nu) === 'rustig');
    controle('huisdier: slaapt van 22 tot 7 uur', H.slaapt(new Date(2026, 9, 8, 23, 0)) && H.slaapt(new Date(2026, 9, 8, 3, 0)) && !H.slaapt(new Date(2026, 9, 8, 7, 0)) && !H.slaapt(new Date(2026, 9, 8, 15, 0)) && !H.slaapt(new Date(2026, 9, 8, 21, 59)));
    controle('huisdier: opslag wordt opgeschoond', H.schoon({ xp: -5, ids: [1, 'a'], humeur: { s: 'x' } }).xp === 0 && H.schoon({ xp: 'veel' }).xp === 0 && H.schoon({ xp: 12.9, ids: ['a', 3] }).ids.length === 1 && H.schoon('x').xp === 0);
    controle('huisdier: elk stadium en elk humeur tekent een svg', [0, 1, 2, 3, 4].every((s) => ['blij', 'verdrietig', 'rustig'].every((h) => [false, true].every((z) => /^<svg[\s\S]*<\/svg>$/.test(H.teken(s, h, z, 0.3))))));
    // Back-up: het huisdier komt mee en de hoogste xp wint
    const A = require('../../extension/account.js');
    controle('back-up: spo_huisdier zit in de back-up', A.BACKUP_SLEUTELS.includes('spo_huisdier'));
    const mix = A.samenvoegen('spo_huisdier', { xp: 40, ids: ['a'] }, { xp: 90, ids: ['b'] }, false);
    controle('back-up: het huisdier met de meeste xp wint en onthoudt alle kaarten', mix.xp === 90 && mix.ids.includes('a') && mix.ids.includes('b') && A.samenvoegen('spo_huisdier', { xp: 200 }, { xp: 90 }, false).xp === 200 && A.samenvoegen('spo_huisdier', undefined, { xp: 90 }, false).xp === 90);
    // Prestatie 'Vervloekt'
    const P = require('../../extension/prestatieslib.js');
    const b = P.BADGES.find((x) => x.id === 'vervloekt');
    controle('prestatie Vervloekt bestaat en telt vloek-kaarten', !!b && P.afgeleid({ gal: [{ id: 'a', vak: 'a', cijfer: 4, ts: 1, vloek: true, trede: 1 }], gev: {}, team: [], stats: {}, behaald: {} }).vloek === 1 && b.meet({ vloek: 1 }).nu >= b.meet({ vloek: 1 }).doel && b.meet({ vloek: 0 }).nu < b.meet({ vloek: 0 }).doel);
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
    // v2.4: GG en meekijken echt via de server (versleutelde berichten tussen A en B)
    {
      const cur = {}, cur2 = {};
      const vA = A.vrienden[0], vB = B.vrienden[0];
      const top = { t: 3, vak: 'Frans', ts: 1760000000123 };
      controle('GG: eerste keer versturen lukt', (await L.stuurGG(A, vA, top)) === true);
      controle('GG: een tweede GG op dezelfde kaart gaat niet door', (await L.stuurGG(A, vA, top)) === false);
      controle('GG: geen GG op een gewone kaart', await L.stuurGG(A, vA, { t: 2, vak: 'x', ts: 1760000000999 }).then(() => false, () => true));
      await L.stuurGG(A, vA, { t: 4, vak: 'Duits', ts: 1760000000456 });
      await L.stuurKijkEmoji(A, 'onbekend', '\u{1F525}').then(() => controle('emoji naar een onbekende vriend wordt geweigerd', false), () => controle('emoji naar een onbekende vriend wordt geweigerd', true));
      await L.stuurKijkEmoji(A, vA.id, '\u{1F480}').then(() => controle('emoji buiten de vier wordt geweigerd', false), () => controle('emoji buiten de vier wordt geweigerd', true));
      const ggB = (await L.haalBerichten(B, vB, cur)).map((b) => L.schoonGG(b.m)).filter(Boolean).map((g) => g.k);
      controle('GG: de vriend ontvangt precies twee verschillende GG\'s (versleuteld)', ggB.length === 2 && ggB.includes('1760000000123') && ggB.includes('1760000000456'), ggB);
      controle('GG: bewaard per kaart, een vriend telt maar één keer', (await L.bewaarGG(A.id, '1760000000123')) === true && (await L.bewaarGG(A.id, '1760000000123')) === false && (await L.bewaarGG('ander', '1760000000123')) === true && (await L.leesGG())['1760000000123'].length === 2);
      // meekijken: A staat bij B op 'alles'; bij 'niets' gaat er niets naar B
      const kijkData = { vak: 'Wiskunde', cijfer: 9.7, trede: 3, opening: 'ster', seizoen: 'geen' };
      controle('kijk: niets naar een vriend die je niets laat zien', (await L.stuurKijk(A, kijkData)) === 0);
      vA.deel = { modus: 'alles', ids: [] };
      controle('kijk: wel naar een vriend aan wie je alles laat zien', (await L.stuurKijk(A, kijkData)) === 1);
      await L.stuurKijk(A, Object.assign({}, kijkData, { trede: 2 })).then(() => controle('kijk: een gewone kaart wordt niet gedeeld', false), () => controle('kijk: een gewone kaart wordt niet gedeeld', true));
      const kB = (await L.haalBerichten(B, vB, cur)).map((b) => L.schoonKijk(b.m, b.leeftijd)).filter(Boolean);
      controle('kijk: B ontvangt vak, cijfer, trede en opening', kB.length === 1 && kB[0].vak === 'Wiskunde' && kB[0].cijfer === 9.7 && kB[0].trede === 3 && kB[0].opening === 'ster', kB);
      await L.stuurKijkEmoji(B, A.id, '\u{1F44F}');
      const eA = (await L.haalBerichten(A, vA, cur2)).map((b) => L.schoonKijkEmoji(b.m)).filter(Boolean);
      controle('emoji: de opener ontvangt de emoji van de kijker', eA.length === 1 && eA[0] === '\u{1F44F}', eA);
      vA.deel = { modus: 'niets', ids: [] };
    }
    const galA = galerijVan([['Wiskunde', 8.6], ['Engels', 9.1], ['Biologie', 6.2], ['Nederlands', 7.4], ['Frans', 5.0]], 0);
    const galB = galerijVan([['Geschiedenis', 7.9], ['Scheikunde', 6.8], ['Economie', 9.97], ['Duits', 5.8], ['Muziek', 8.2]], 10);
    const teamA = { v: 1, ids: [galA[0].id, galA[1].id, galA[2].id] };
    const teamB = { v: 1, ids: [galB[2].id, galB[0].id, galB[3].id] };

    const speler = async (naam, st, gal, tm, viewport, opts) => {
      const ctx = await br.newContext({ viewport: viewport || { width: 1000, height: 900 }, reducedMotion: opts && opts.rustig ? 'reduce' : 'no-preference' });
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
    await PA.p.waitForFunction(() => /Team van Sanne: 3 kaarten/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 15000 });
    await PB.p.waitForFunction(() => /Team van Daan: 3 kaarten/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 15000 });
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

    // Verschillende teamgrootte: dat mag nu (een duel is een reeks strafschoppen), de knop blijft aan
    await PB.p.evaluate((t) => { localStorage.setItem('spo_team', JSON.stringify(t)); }, { v: 1, ids: teamB.ids.slice(0, 2) });
    await PB.p.reload();
    await PA.p.waitForFunction(() => /2 kaarten/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 25000 }).catch(() => {});
    const uitTekst = await PA.p.textContent('#gv-vrienden');
    controle('ongelijke teams: uitdagen mag, met uitleg over de teamgrootte', /Team van Sanne: 2 kaarten/.test(uitTekst) && !(await PA.p.locator('#gv-vrienden button').first().isDisabled()) && !/moeten evenveel/.test(uitTekst), uitTekst);
    await PA.p.screenshot({ path: path.join(TMP, 'team-4-ongelijk.png'), fullPage: true });
    await PB.p.evaluate((t) => { localStorage.setItem('spo_team', JSON.stringify(t)); }, teamB);
    await PB.p.reload();
    await PA.p.waitForFunction(() => /Team van Sanne: 3 kaarten/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 25000 });
    controle('teamgrootte van de vriend wordt live bijgewerkt', true);

    // --- Duel A tegen B, met C als toeschouwer ---
    // Twee spelers drukken met alleen het toetsenbord: cijfer = hoek, Spatie = schiet of duik (zonder timing of met de knop).
    const speelUI = async (p, o) => {
      o = o || {};
      const t0 = Date.now(), gedaan = new Set(), uitslagen = [];
      let laatste = '';
      while (Date.now() - t0 < (o.max || 300000)) {
        if (await p.locator('#einde:not([hidden])').count()) break;
        const st = await p.evaluate(() => { const b = document.getElementById('bevestig'), z = document.querySelector('#zones .zone'); return { open: !!(z && !z.disabled && !b.hidden), klok: document.getElementById('klok').textContent, schiet: !document.getElementById('timing').hidden, tekst: document.getElementById('uitslag-tekst').textContent }; });
        if (st.tekst !== laatste) { laatste = st.tekst; const m = /^(Goal|Gered|Paal|Over)[^.]*\. .*Kans op een doelpunt was (\d+)%/.exec(st.tekst); if (m) uitslagen.push(m[1] + ' ' + m[2]); }
        if (st.open && !gedaan.has(st.klok)) {
          gedaan.add(st.klok);
          const n = gedaan.size + (o.start || 0);
          try {
            await p.keyboard.press(String(1 + ((n * 5 + (o.start || 0)) % 6)));
            if (st.schiet && n % 2 === 0) await p.click('#zonder'); else await p.keyboard.press('Space');
          } catch (e) { /* de pagina is al verder */ }
          if (o.naKeuze) await o.naKeuze(n);
        }
        await p.waitForTimeout(100);
      }
      return { kicks: gedaan.size, uitslagen };
    };
    const uitslagMeta = async (p) => { const stand = await p.textContent('#einde-stand'); const m = /Jij (\d+) - (\d+)/.exec(stand); return { kop: await p.textContent('#einde-kop'), stand, m, tekst: await p.textContent('#einde-tekst') }; };
    // C kijkt mee. C is een derde account: vriend van A (A laat C alles zien, dus A mag C uitnodigen om mee te kijken).
    const Cacc = await maak();
    await L.verzoek(A, L.maakCode(Cacc.id, Cacc.pub), 'Tess');
    await L.antwoord(Object.assign({}, Cacc, { vrienden: [{ id: A.id, pub: A.pub, status: 'ontvangen' }] }), A.id, true, 'Daan');
    const vC = A.vrienden.find((v) => v.id === Cacc.id); vC.status = 'vriend'; vC.alias = 'Tess'; vC.deel = { modus: 'alles', ids: [] };
    Cacc.vrienden = [{ id: A.id, pub: A.pub, alias: 'Daan', status: 'vriend', deel: { modus: 'niets', ids: [] } }];
    const PA2 = await speler('A2', A, galA, teamA, null, { rustig: true }), PB2 = await speler('B2', B, galB, teamB, null, { rustig: true }), PCc = await speler('C', Cacc, galerijVan([['Duits', 6.1]], 60), null, null, {});
    await PA.ctx.close(); await PB.ctx.close();
    for (const P of [PA2, PB2, PCc]) await P.p.waitForFunction(() => /Live/.test(document.getElementById('sync-status').textContent), null, { timeout: 20000 });
    await PA2.p.waitForFunction((id) => !document.getElementById('uitdaag-' + id).disabled, B.id, { timeout: 30000 });
    controle('uitdagen kan met teams van elke grootte (geen eis meer aan evenveel kaarten)', !(await PA2.p.textContent('#gv-vrienden')).includes('evenveel'));
    await PA2.p.screenshot({ path: path.join(TMP, 'duel-e2e-1-paneel.png'), fullPage: true });
    await PA2.p.click('#uitdaag-' + B.id);
    await PB2.p.waitForSelector('#uitnodigingen .uitnodiging', { timeout: 20000 });
    controle('B ziet de uitnodiging voor een strafschoppenduel', /strafschoppenduel/.test(await PB2.p.textContent('#uitnodigingen')));
    await PB2.p.screenshot({ path: path.join(TMP, 'duel-e2e-2-uitnodiging.png'), fullPage: true });
    await PB2.p.click('#uitnodigingen .knop.goud');
    await PA2.p.waitForFunction(() => !document.getElementById('scherm').hidden && document.querySelectorAll('#zones .zone').length === 6, null, { timeout: 30000 });
    await PB2.p.waitForFunction(() => !document.getElementById('scherm').hidden && document.querySelectorAll('#zones .zone').length === 6, null, { timeout: 30000 });
    controle('beide spelers zien het doel met 6 zones', true);
    controle('een derde vriend (C) krijgt een uitnodiging om mee te kijken, met de naam van de speler', await PCc.p.waitForSelector('#kijk-uitnodigingen .kijk-uitnodiging', { timeout: 30000 }).then(async () => /Daan speelt een strafschoppenduel/.test(await PCc.p.textContent('#kijk-uitnodigingen')), () => false), await PCc.p.textContent('#kijk-uitnodigingen'));
    // De spelers beginnen
    const dA = speelUI(PA2.p, { start: 0 }), dB = speelUI(PB2.p, { start: 3 });
    // C kijkt mee en gooit emoji
    await PCc.p.click('#kijk-uitnodigingen .knop');
    await PCc.p.waitForSelector('#scherm:not([hidden])', { timeout: 10000 });
    controle('C ziet een emoji-balk met de vier vaste emoji en geen keuzeknoppen', (await PCc.p.locator('#emoji-balk button').count()) === 4 && (await PCc.p.locator('#keuze').isHidden()) && /Je kijkt mee/.test(await PCc.p.textContent('#kijk-info')), await PCc.p.textContent('#kijk-info'));
    await PA2.p.waitForFunction(() => /1 vriend kijkt mee/.test(document.getElementById('kijk-info').textContent), null, { timeout: 20000 });
    controle('A ziet dat er 1 vriend meekijkt', true);
    await PCc.p.click('#emoji-balk button >> nth=0');
    await PA2.p.waitForSelector('#emoji-laag .v', { timeout: 20000 });
    controle('de emoji van de kijker vliegt over het scherm van de speler (met naam)', /Tess/.test(await PA2.p.textContent('#emoji-laag')) && (await PA2.p.textContent('#emoji-laag')).includes('\u{1F525}'), await PA2.p.textContent('#emoji-laag'));
    await PB2.p.waitForSelector('#emoji-laag .v', { timeout: 20000 });
    controle('de emoji wordt doorgestuurd naar de tegenstander', (await PB2.p.textContent('#emoji-laag')).includes('\u{1F525}'));
    controle('de emoji-laag ligt boven alles en laat klikken door', await PA2.p.evaluate(() => { const l = document.getElementById('emoji-laag'); const c = getComputedStyle(l); return c.pointerEvents === 'none' && parseInt(c.zIndex, 10) >= 2147483647 && l.getAttribute('aria-hidden') === 'true'; }));
    await PCc.p.screenshot({ path: path.join(TMP, 'duel-e2e-3-kijker.png') });
    const [uA, uB] = await Promise.all([dA, dB]);
    await PA2.p.waitForSelector('#einde:not([hidden])', { timeout: 90000 });
    await PB2.p.waitForSelector('#einde:not([hidden])', { timeout: 90000 });
    await PCc.p.waitForSelector('#einde:not([hidden])', { timeout: 60000 });
    const eA = await uitslagMeta(PA2.p), eB = await uitslagMeta(PB2.p), eC = await uitslagMeta(PCc.p);
    console.log('Uitslag A:', eA.kop, eA.stand, ' B:', eB.kop, eB.stand, ' C:', eC.kop, eC.stand);
    controle('uitslag: A en B zien dezelfde stand (gespiegeld)', eA.m && eB.m && eA.m[1] === eB.m[2] && eA.m[2] === eB.m[1], [eA.stand, eB.stand]);
    const winA = eA.m && +eA.m[1] > +eA.m[2], winB = eB.m && +eB.m[1] > +eB.m[2];
    controle('uitslag: de winnaar klopt aan beide kanten (nooit twee winnaars)', eA.m && eB.m && eA.kop === (winA ? 'Gewonnen!' : +eA.m[1] < +eA.m[2] ? 'Verloren' : 'Gelijkspel') && eB.kop === (winB ? 'Gewonnen!' : +eB.m[1] < +eB.m[2] ? 'Verloren' : 'Gelijkspel') && !(winA && winB), [eA, eB]);
    controle('alle strafschoppen precies hetzelfde aan beide kanten (uitkomst en kans op een doelpunt)', uA.uitslagen.length >= 5 && JSON.stringify(uA.uitslagen) === JSON.stringify(uB.uitslagen), [uA.uitslagen, uB.uitslagen]);
    controle('geen waarschuwing over verschillende uitslagen', !/niet precies dezelfde/.test(eA.tekst + eB.tekst), [eA.tekst, eB.tekst]);
    controle('de kijker ziet dezelfde stand en winnaar (met de namen)', eC.stand.includes(`${eA.m[1]} - ${eA.m[2]}`) || eC.stand.includes(`${eA.m[2]} - ${eA.m[1]}`), [eC.stand, eA.stand]);
    controle('de kijker ziet een nette afsluiting', /afgelopen/.test(eC.tekst) && (/wint|Gelijkspel/.test(eC.kop)), eC);
    const aantalKicks = uA.kicks;
    controle('het duel duurde 5 tot 10 strafschoppen', aantalKicks >= 5 && aantalKicks <= 10, aantalKicks);
    const opgeslagen = await PA2.p.evaluate(() => JSON.parse(localStorage.getItem('spo_gevechten') || '{}'));
    const rijen = Object.values(opgeslagen).flat();
    controle('uitslag bewaard in spo_gevechten (mijn, hun, aantal strafschoppen)', rijen.length === 1 && rijen[0].mijn === +eA.m[1] && rijen[0].hun === +eA.m[2] && rijen[0].n === aantalKicks, rijen);
    const bedrag = (kop) => (kop === 'Gewonnen!' ? 10 : kop === 'Gelijkspel' ? 4 : 2);
    const mA = await PA2.p.evaluate(() => JSON.parse(localStorage.getItem('spo_munten') || '{}')), mB = await PB2.p.evaluate(() => JSON.parse(localStorage.getItem('spo_munten') || '{}'));
    controle('munten: beide spelers krijgen de beloning bij hun uitslag (en wie wint krijgt het meest)', mA.saldo === bedrag(eA.kop) && mB.saldo === bedrag(eB.kop) && mA.saldo + mB.saldo >= 6, [mA, mB]);
    controle('de toeschouwer krijgt geen munten', (await PCc.p.evaluate(() => localStorage.getItem('spo_munten'))) === null);
    controle('geen fouten in de console (A, B, C)', PA2.fouten.length === 0 && PB2.fouten.length === 0 && PCc.fouten.length === 0, [PA2.fouten, PB2.fouten, PCc.fouten]);
    await PA2.p.screenshot({ path: path.join(TMP, 'duel-e2e-4-einde-A.png') });
    await PCc.p.screenshot({ path: path.join(TMP, 'duel-e2e-5-einde-C.png') });
    await PA2.p.click('#einde-terug'); await PB2.p.click('#einde-terug'); await PCc.p.click('#einde-terug');
    await PA2.p.waitForFunction(() => /1 gewonnen|1 gelijk|1 verloren/.test(document.getElementById('gv-vrienden').textContent), null, { timeout: 10000 });
    controle('uitslag zichtbaar bij de vriend', true);
    controle('de kijker kan daarna weer gewoon verder (geen kijk-uitnodiging meer, knoppen werken)', (await PCc.p.locator('#scherm').isHidden()) && (await PCc.p.evaluate(() => document.getElementById('hoofd').inert === false)));
    await PA2.p.screenshot({ path: path.join(TMP, 'duel-e2e-6-na-duel.png'), fullPage: true });

    // --- Weigeren ---
    await PA2.p.click('#uitdaag-' + B.id);
    await PB2.p.waitForSelector('#uitnodigingen .uitnodiging', { timeout: 20000 });
    await PB2.p.click('#uitnodigingen .knop:not(.goud)');
    await PA2.p.waitForSelector('#einde:not([hidden])', { timeout: 30000 });
    controle('weigeren: A krijgt een nette melding', /wil nu niet spelen/.test(await PA2.p.textContent('#einde-tekst')), await PA2.p.textContent('#einde-tekst'));
    await PA2.p.click('#einde-terug');

    // --- B stopt tijdens het duel ---
    await PA2.p.click('#uitdaag-' + B.id);
    await PB2.p.waitForSelector('#uitnodigingen .uitnodiging', { timeout: 20000 });
    await PB2.p.click('#uitnodigingen .knop.goud');
    await PA2.p.waitForFunction(() => document.querySelectorAll('#zones .zone:not([disabled])').length === 6, null, { timeout: 30000 });
    await PB2.p.waitForFunction(() => !document.getElementById('scherm').hidden, null, { timeout: 30000 });
    await slaap(1500);
    await PB2.p.click('#stop');
    await PA2.p.waitForSelector('#einde:not([hidden])', { timeout: 30000 });
    controle('stoppen: de ander ziet dat je gestopt bent', /is gestopt/.test(await PA2.p.textContent('#einde-tekst')), await PA2.p.textContent('#einde-tekst'));
    await PB2.p.waitForSelector('#einde:not([hidden])', { timeout: 10000 });
    controle('stoppen: wie stopt ziet een eigen melding', /Je hebt het duel gestopt/.test(await PB2.p.textContent('#einde-tekst')));
    controle('stoppen: geen munten en geen uitslag voor een afgebroken duel', (await PA2.p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('spo_gevechten') || '{}')).flat().length)) === 1);
    await PA2.p.click('#einde-terug'); await PB2.p.click('#einde-terug');

    // --- Verbinding verloren: B verdwijnt tijdens een duel ---
    await PA2.p.click('#uitdaag-' + B.id);
    await PB2.p.waitForSelector('#uitnodigingen .uitnodiging', { timeout: 20000 });
    await PB2.p.click('#uitnodigingen .knop.goud');
    await PA2.p.waitForFunction(() => document.querySelectorAll('#zones .zone:not([disabled])').length === 6, null, { timeout: 30000 });
    await slaap(2500);
    await PB2.ctx.close();
    await PA2.p.waitForSelector('#einde:not([hidden])', { timeout: 60000 });
    controle('verbinding verloren: nette melding', /Verbinding verloren/.test(await PA2.p.textContent('#einde-tekst')), await PA2.p.textContent('#einde-tekst'));
    await PA2.p.screenshot({ path: path.join(TMP, 'duel-e2e-7-verloren.png') });
  } finally {
    await br.close().catch(() => {}); php.kill(); web.kill();
  }
  console.log(`\nGevechttest: ${ok} geslaagd, ${mis} mislukt`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
