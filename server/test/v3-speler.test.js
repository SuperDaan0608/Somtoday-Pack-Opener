// v3.0 Speler en stadion: eigen voetballer (avatar) en eigen stadion. Logica in Node, de pagina's en de strafschop in headless Chromium.
// Gebruik: export NODE_PATH=$(npm root -g); node server/test/v3-speler.test.js   (SPO_SHOTS=/map voor schermafbeeldingen, SPO_ALLEEN_LOGICA=1 slaat de browser over)
// Het bestand start zelf een kleine webserver voor de extensiepagina's (een vrije poort). PHP is niet nodig.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const EXT = path.resolve(__dirname, '..', '..', 'extension');
const SHOTS = process.env.SPO_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let WEB = 'http://localhost:0'; // wordt gezet zodra de webserver een vrije poort heeft
let ok = 0, mis = 0;
function controle(naam, waar, extra) { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.mp3': 'audio/mpeg' };

// ---- Node-kant: de bibliotheken met een nepopslag ----
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const V = require(path.join(EXT, 'voetbal.js'));
const L = require(path.join(EXT, 'vriendenlib.js'));
require(path.join(EXT, 'economie.js'));
const E = globalThis.SPOEco;

async function logicaTests() {
  // --- de lijsten ---
  const ids = E.ITEMS.map((i) => i.id);
  controle('alle winkel-id\'s zijn uniek', new Set(ids).size === ids.length);
  controle('alle winkelnamen zijn uniek (de geschiedenis zoekt een item op naam terug)', new Set(E.ITEMS.map((i) => i.naam)).size === E.ITEMS.length, E.ITEMS.map((i) => i.naam).filter((n, i, a) => a.indexOf(n) !== i));
  controle('voetbal-items staan in de winkel met naam, soort, zeldzaamheid en prijs', V.ITEMS.every((i) => E.PER_ID.get(i.id) === i && E.SOORTEN[i.soort] && i.naam && i.zeld >= 0 && i.zeld <= 3 && (i.prijs === null || i.prijs > 0)));
  const opties = [].concat(V.HAAR, V.KIT, V.JUICH, V.THEMA, V.VELD, V.VLAG);
  controle('elke betaalde keuze heeft een winkelitem en omgekeerd', opties.filter((o) => o.item).every((o) => E.PER_ID.has(o.item)) && V.ITEMS.every((i) => V.LIJST_VAN[i.soort].some((o) => o.item === i.id && o.id === i.sleutel)));
  controle('elke soort hoort bij een veld van avatar of stadion', V.ITEMS.every((i) => V.VELD_VAN[i.soort]));
  controle('er zijn gratis keuzes in elke lijst (je kunt altijd beginnen)', [V.HAAR, V.KIT, V.JUICH, V.THEMA, V.VELD, V.VLAG].every((l) => l.some((o) => !o.item)));

  // --- avatar schoonmaken ---
  const std = V.schoonAvatar(undefined);
  controle('lege avatar valt terug op de standaard', JSON.stringify(std) === JSON.stringify(V.STANDAARD_AVATAR), std);
  const vuil = V.schoonAvatar({ huid: 99, haar: '__proto__', haarkleur: -1, kit: { x: 1 }, nummer: 'abc', juich: 'constructor', extra: 'x' });
  controle('rommel in een avatar wordt standaard', JSON.stringify(vuil) === JSON.stringify(V.STANDAARD_AVATAR), vuil);
  controle('rugnummer: 1 t/m 99, heel getal', [[0, 9], [100, 9], [-5, 9], [5.7, 5], ['42', 42], [NaN, 9], [Infinity, 9], [null, 9], [99, 99], [1, 1]].every(([i, u]) => V.schoonAvatar({ nummer: i }).nummer === u));
  controle('een vriend mag een betaalde haarstijl hebben (we kunnen het niet nagaan)', V.schoonAvatar({ haar: 'afro' }).haar === 'afro');
  controle('eigen betaalde haarstijl zonder aankoop valt terug', V.schoonAvatar({ haar: 'afro', kit: 'goud', juich: 'salto' }, []).haar === 'kort' && V.schoonAvatar({ kit: 'goud' }, []).kit === 'rood' && V.schoonAvatar({ juich: 'salto' }, []).juich === 'armen');
  controle('eigen betaalde keuze blijft na aankoop', V.schoonAvatar({ haar: 'afro', kit: 'goud', juich: 'salto' }, ['ha-afro', 'kk-goud', 'ju-salto']).haar === 'afro');
  const s = V.naarSchutter({ huid: 2, kit: 'neon', nummer: 7, juich: 'dans', haarkleur: 3 });
  controle('naarSchutter geeft hex-kleuren voor de strafschop', /^#[0-9a-f]{6}$/.test(s.huid) && /^#[0-9a-f]{6}$/.test(s.shirt) && /^#[0-9a-f]{6}$/.test(s.haar) && s.nummer === 7 && s.juich === 'dans', s);

  // --- stadion schoonmaken ---
  controle('lege stadion valt terug op de standaard', JSON.stringify(V.schoonStadion(null)) === JSON.stringify(V.STANDAARD_STADION));
  controle('een nette stadionnaam blijft', V.schoonStadion({ naam: 'De Kuil' }).naam === 'De Kuil' && V.schoonStadion({ naam: '  Mijn   Arena  ' }).naam === 'Mijn Arena');
  controle('een stadionnaam met een scheldwoord wordt leeg', ['kut', 'jij kankerhoer', 'Kut', 'k\u200du\u200dt'].every((t) => V.schoonStadion({ naam: t }).naam === ''));
  controle('een stadionnaam van meer dan 24 tekens wordt leeg', V.schoonStadion({ naam: 'Abcdefghij Klmnopqrstuvwx' }).naam === '' && V.schoonStadion({ naam: 'Abcdefghij Klmnopqrstuvw' }).naam === 'Abcdefghij Klmnopqrstuvw');
  controle('html en besturingstekens in de naam verdwijnen', !/[<>]/.test(V.schoonStadion({ naam: 'Arena <b>1</b>' }).naam) && V.schoonStadion({ naam: 'Are\u0000na\u202e' }).naam === 'Arena');
  controle('rommel in een stadion wordt standaard', JSON.stringify(V.schoonStadion({ thema: 'x', tribune: 5, vlag: [], veld: {} })) === JSON.stringify(V.STANDAARD_STADION));

  // --- opslaan: kopen en kiezen ---
  mem.clear();
  mem.set('spo_munten', JSON.stringify({ v: 1, init: true, saldo: 200, totaal: 200 }));
  let r = await E.leesVoetbal();
  controle('nog niets gekozen: standaard, geen keuzes bewaard', r.staat.avatar.haar === 'kort' && r.gekozen.avatar === false && r.gekozen.stadion === false);
  await E.bewaarVoetbal({ avatar: { haar: 'afro', nummer: 10 } });
  r = await E.leesVoetbal();
  controle('niet gekocht: de betaalde keuze wordt niet bewaard, de rest wel', r.staat.avatar.haar === 'kort' && r.staat.avatar.nummer === 10);
  const koop = await E.koop('ha-afro');
  controle('kopen kost munten', koop.ok && koop.saldo === 155, koop);
  await E.bewaarVoetbal({ avatar: { haar: 'afro' } });
  r = await E.leesVoetbal();
  controle('na het kopen kan de keuze wel', r.staat.avatar.haar === 'afro' && r.staat.avatar.nummer === 10 && r.gekozen.avatar === true);
  controle('te koop: alleen-te-winnen item is niet te koop', (await E.koop('kk-diamant')).ok === false);
  await E.bewaarVoetbal({ stadion: { naam: 'Het Fort', tribune: 'blauw', thema: 'goud' } });
  r = await E.leesVoetbal();
  controle('stadion bewaard (naam, tribune), betaald thema niet', r.staat.stadion.naam === 'Het Fort' && r.staat.stadion.tribune === 'blauw' && r.staat.stadion.thema === 'klassiek');
  controle('de avatar bleef bij het wijzigen van het stadion', r.staat.avatar.haar === 'afro');
  const opgeslagen = JSON.parse(mem.get('spo_voetbal'));
  controle('opgeslagen vorm: v, avatar, stadion', opgeslagen.v === 1 && opgeslagen.avatar && opgeslagen.stadion && !/omtoday/i.test(mem.get('spo_voetbal')));
  // winkel kwijt (bijv. na terugzetten): premium valt weg, gratis blijft
  mem.set('spo_winkel', JSON.stringify({ gekocht: [] }));
  r = await E.leesVoetbal();
  controle('zonder aankoop valt een eerder gekozen betaalde keuze terug', r.staat.avatar.haar === 'kort' && r.staat.avatar.nummer === 10);

  const du = await E.duelUiterlijk();
  controle('duelUiterlijk geeft avatar en thema in de vorm van de strafschop', du && du.av.nummer === 10 && /^#[0-9a-f]{6}$/.test(du.av.shirt) && Array.isArray(du.thema.gras) && /^#[0-9a-f]{6}$/.test(du.thema.tribune) && du.thema.naam === 'Het Fort', du);
  // --- vrienden: profiel met avatar en stadion ---
  mem.set('spo_winkel', JSON.stringify({ gekocht: ['ha-afro', 'kk-goud', 'sd-nacht'] }));
  await E.bewaarVoetbal({ avatar: { kit: 'goud', juich: 'dans', haarkleur: 3 }, stadion: { thema: 'nacht', naam: 'Het Fort' } });
  mem.set('spo_profiel', JSON.stringify({ bijnaam: 'Daan', deel: true }));
  const gal = [{ id: 'a', vak: 'Wiskunde', cijfer: 8, ts: 1 }];
  const deel = await E.mijnProfielDeelbaar(gal);
  controle('mijn profiel voor vrienden bevat avatar en stadion', deel && deel.av && deel.av.kit === 'goud' && deel.sd && deel.sd.naam === 'Het Fort' && deel.sd.thema === 'nacht', deel);
  mem.set('spo_profiel', JSON.stringify({ bijnaam: 'Daan', deel: false }));
  controle('niet delen: niets voor vrienden', (await E.mijnProfielDeelbaar(gal)) === null);
  mem.set('spo_profiel', JSON.stringify({ bijnaam: 'Daan', deel: true }));
  mem.delete('spo_voetbal');
  controle('zonder avatar en stadion: geen av/sd in het profiel (oudere versies blijven werken)', !('av' in (await E.mijnProfielDeelbaar(gal))) && !('sd' in (await E.mijnProfielDeelbaar(gal))));
  const oud = E.schoonProfiel({ bn: 'Oud', s: [], ovr: 70, niv: 2, z: 0, k: 3, w: 1, g: 0, l: 0, t: '', bg: 'standaard' });
  controle('profiel van een oudere versie zonder av/sd werkt', oud && oud.bn === 'Oud' && !('av' in oud) && !('sd' in oud));
  // een kwaadwillende vriend
  const kwaad = { bn: 'X', s: [], ovr: 1, niv: 1, z: 0, k: 1, w: 0, g: 0, l: 0, t: '', bg: 'standaard', av: { huid: '<script>', haar: { toString: 1 }, kit: '../../x', nummer: 1e9, juich: 'alert(1)', extra: 'x' }, sd: { naam: 'jij kankerhoer', thema: '__proto__', tribune: 'x'.repeat(5000), vlag: 7, veld: null, extra: 1 } };
  const sk = E.schoonProfiel(kwaad);
  controle('een vriend met rommel in av en sd krijgt de standaardwaarden', JSON.stringify(sk.av) === JSON.stringify(V.STANDAARD_AVATAR) && JSON.stringify(sk.sd) === JSON.stringify(V.STANDAARD_STADION), sk);
  controle('geen extra velden van een vriend in av of sd', Object.keys(sk.av).length === 6 && Object.keys(sk.sd).length === 5);
  controle('av als tekst of lijst wordt genegeerd', ['x', [], 5, null].every((a) => !('av' in E.schoonProfiel(Object.assign({}, kwaad, { av: a, sd: a })))));
  const blob = L.schoonBlob({ v: 1, ts: 1, kaarten: [], profiel: { bn: 'Zoe', s: [], ovr: 50, niv: 1, z: 0, k: 1, w: 0, g: 0, l: 0, t: '', bg: 'standaard', av: { kit: 'neon', nummer: 23 }, sd: { naam: 'Zoe Arena', veld: 'ruiten' } } });
  controle('schoonBlob bewaart avatar en stadion van een vriend', blob && blob.profiel && blob.profiel.av.kit === 'neon' && blob.profiel.av.nummer === 23 && blob.profiel.sd.naam === 'Zoe Arena' && blob.profiel.sd.veld === 'ruiten', blob);
  const st = { vrienden: [], reacties: {}, gokken: {}, raden: [] };
  const inh = L.maakInhoud(st, { id: 'f'.repeat(32), pub: 'p', status: 'vriend', deel: { modus: 'niets', ids: [] } }, [], null, E.schoonProfiel(Object.assign({}, oud, { av: { kit: 'blauw' }, sd: { naam: 'Mijn Veld' } })));
  controle('maakInhoud neemt avatar en stadion mee in de blob', inh && inh.profiel && inh.profiel.av.kit === 'blauw' && inh.profiel.sd.naam === 'Mijn Veld', inh);
  controle('de naam Somtoday wordt nergens opgeslagen', !/somtoday/i.test(JSON.stringify([...mem.entries()])) && !/somtoday/i.test(JSON.stringify(inh)));

  // --- beschrijvingen voor schermlezers ---
  controle('beschrijving van de avatar noemt rugnummer en kleur', /rugnummer 23/.test(V.beschrijfAvatar({ nummer: 23 })) && /tenue/.test(V.beschrijfAvatar({})));
  controle('beschrijving van het stadion noemt de naam of een standaardnaam', /Mijn stadion/.test(V.beschrijfStadion({})) && /Het Fort/.test(V.beschrijfStadion({ naam: 'Het Fort' })));
}

// ---- Browser ----
const pixels = (p, sel) => p.evaluate((s) => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; }, sel);
const foto = async (p, naam) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, naam + '.png') }); };
// Nagemaakte chrome voor het paneel (hub.html): opslag in localStorage met onChanged, en een ingelogd account.
const NEP_CHROME = (zaad) => {
  const P = 'mock:';
  if (!localStorage.getItem(P + '__klaar')) { localStorage.setItem(P + '__klaar', '1'); for (const [k, v] of Object.entries(zaad)) localStorage.setItem(P + k, JSON.stringify(v)); }
  const luisteraars = [];
  const lees = (k) => { const x = localStorage.getItem(P + k); return x == null ? undefined : JSON.parse(x); };
  const sleutels = (s) => (s == null ? Object.keys(localStorage).filter((x) => x.startsWith(P) && x !== P + '__klaar').map((x) => x.slice(P.length)) : [].concat(typeof s === 'object' && !Array.isArray(s) ? Object.keys(s) : s));
  const local = {
    async get(s) { const r = {}; for (const k of sleutels(s)) { const v = lees(k); if (v !== undefined) r[k] = v; } return r; },
    async set(o) { const w = {}; for (const [k, v] of Object.entries(o)) { w[k] = { oldValue: lees(k), newValue: v }; localStorage.setItem(P + k, JSON.stringify(v)); } luisteraars.forEach((f) => f(w, 'local')); },
    async remove(s) { for (const k of [].concat(s)) localStorage.removeItem(P + k); },
  };
  window.chrome = { storage: { local, onChanged: { addListener: (f) => luisteraars.push(f) } }, runtime: { getManifest: () => ({ version: '3.0.0' }), id: 'nep', sendMessage: () => Promise.resolve(), getURL: (x) => x } };
};
const ACCOUNT = { email: 't@t.nl', sessie: 's', account: 'a', sleutel: 'k', laatsteBackup: 1 };
const SEED = { spo_munten: { v: 1, init: true, saldo: 400, totaal: 400, gev: { w: 0, g: 0, v: 0 }, ts: 1 }, spo_winkel: { gekocht: [] } };

async function browserTests() {
  const { chromium } = require('playwright');
  const web = http.createServer((q, s) => {
    const p = path.join(EXT, decodeURIComponent(new URL(q.url, 'http://localhost').pathname));
    if (!p.startsWith(EXT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(s);
  }).listen(0);
  await new Promise((r) => web.on('listening', r));
  WEB = 'http://localhost:' + web.address().port;
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const nieuw = async (seed, vp) => {
    const ctx = await br.newContext({ viewport: vp || { width: 1100, height: 900 }, locale: 'nl-NL' });
    await ctx.addInitScript((s) => { if (!sessionStorage.getItem('spo_seed')) { sessionStorage.setItem('spo_seed', '1'); for (const [k, w] of Object.entries(s || {})) localStorage.setItem(k, JSON.stringify(w)); } }, seed);
    const p = await ctx.newPage();
    const fouten = [];
    p.on('pageerror', (e) => fouten.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    return { ctx, p, fouten };
  };
  const opslag = (p, k) => p.evaluate((s) => { const t = localStorage.getItem(s); return t ? JSON.parse(t) : null; }, k);
  try {
    // ── de editor ──
    {
      const { ctx, p, fouten } = await nieuw(SEED);
      await p.goto(WEB + '/speler.html?embed=1');
      await p.waitForSelector('#k-haar button');
      controle('editor: aantallen keuzes (haar 7, tenue 10, juichstijl 6, thema 5, veld 5, vlag 5, tribune 6, huid 6)', JSON.stringify(await p.evaluate(() => ['k-haar', 'k-kit', 'k-juich', 'k-thema', 'k-veld', 'k-vlag', 'k-tribune', 'k-huid', 'k-haarkleur'].map((i) => document.querySelectorAll('#' + i + ' button').length))) === '[7,10,6,5,5,5,6,6,6]');
      controle('editor: elke groep is een radiogroup met een naam en precies één gekozen knop', await p.evaluate(() => ['k-haar', 'k-kit', 'k-juich', 'k-thema', 'k-veld', 'k-vlag', 'k-tribune', 'k-huid', 'k-haarkleur'].every((i) => { const g = document.getElementById(i); return g.getAttribute('role') === 'radiogroup' && g.getAttribute('aria-labelledby') && g.querySelectorAll('[aria-checked="true"]').length === 1 && g.querySelectorAll('[tabindex="0"]').length === 1 && Array.from(g.querySelectorAll('button')).every((b) => b.getAttribute('aria-label')); })));
      controle('editor: de tekstvelden hebben data-tekstfilter', await p.evaluate(() => Array.from(document.querySelectorAll('input[type=text], input[type=number], textarea')).every((i) => i.hasAttribute('data-tekstfilter'))));
      controle('editor: stadionnaamveld is maximaal 24 tekens en filtert als naam', await p.evaluate(() => { const i = document.getElementById('sd-naam'); return i.maxLength === 24 && i.dataset.tekstfilter === 'naam'; }));
      controle('editor: avatar en stadion zijn getekend', (await pixels(p, '#av-canvas')) > 8000 && (await pixels(p, '#sd-canvas')) > 100000);
      controle('editor: canvassen hebben een beschrijving', /rugnummer 9/.test(await p.getAttribute('#av-canvas', 'aria-label')) && /Mijn stadion/.test(await p.getAttribute('#sd-canvas', 'aria-label')));
      await foto(p, 'editor-begin');
      // vergrendeld
      const slot = p.locator('#k-haar button[aria-disabled="true"]').first();
      controle('editor: betaalde haarstijlen zijn vergrendeld', (await p.locator('#k-haar button[aria-disabled="true"]').count()) === 4 && /vergrendeld/.test(await slot.getAttribute('aria-label')));
      await slot.click({ force: true });
      controle('editor: klikken op een slot geeft een melding en verandert niets', /winkel/i.test(await p.textContent('#melding')) && (await opslag(p, 'spo_voetbal')) === null);
      // toetsenbord
      await p.focus('#k-haar button[aria-checked="true"]');
      await p.keyboard.press('ArrowRight');
      controle('editor: pijltje naar rechts verplaatst de focus in de groep', await p.evaluate(() => document.activeElement.textContent === 'Krullen'));
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => document.querySelector('#k-haar [aria-checked="true"]').textContent === 'Krullen');
      controle('editor: Enter kiest, en de focus blijft in de groep', await p.evaluate(() => document.getElementById('k-haar').contains(document.activeElement)));
      controle('editor: keuze is bewaard', (await opslag(p, 'spo_voetbal')).avatar.haar === 'krullen');
      await p.focus('#k-haar button[aria-checked="true"]');
      await p.keyboard.press('End');
      controle('editor: End gaat naar de laatste keuze', await p.evaluate(() => document.activeElement === document.querySelector('#k-haar button:last-child')));
      await p.keyboard.press('Home');
      controle('editor: Home gaat naar de eerste keuze', await p.evaluate(() => document.activeElement === document.querySelector('#k-haar button:first-child')));
      // kleuren
      await p.click('#k-kit button[aria-label="Blauw"]');
      await p.click('#k-huid button:nth-child(4)');
      await p.click('#k-juich button[aria-label="Op de knieën"]');
      await p.click('#k-tribune button[aria-label="Groen"]');
      await p.click('#k-vlag button[aria-label="Geen vlaggen"]');
      await p.click('#k-veld button[aria-label="Ruiten"]');
      await p.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('spo_voetbal')).stadion.veld === 'ruiten'; } catch (e) { return false; } });
      const o = await opslag(p, 'spo_voetbal');
      controle('editor: alle keuzes bewaard', o.avatar.kit === 'blauw' && o.avatar.huid === 3 && o.avatar.juich === 'knie' && o.stadion.tribune === 'groen' && o.stadion.vlag === 'geen' && o.stadion.veld === 'ruiten', o);
      // rugnummer
      await p.fill('#nummer', '42');
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_voetbal')).avatar.nummer === 42);
      await p.fill('#nummer', '150');
      await slaap(500);
      controle('editor: rugnummer 150 wordt niet bewaard en is ongeldig gemarkeerd', (await opslag(p, 'spo_voetbal')).avatar.nummer === 42 && (await p.getAttribute('#nummer', 'aria-invalid')) === 'true');
      await p.fill('#nummer', '0');
      await slaap(400);
      controle('editor: rugnummer 0 wordt niet bewaard', (await opslag(p, 'spo_voetbal')).avatar.nummer === 42);
      await p.fill('#nummer', '7');
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_voetbal')).avatar.nummer === 7);
      // naam
      await p.fill('#sd-naam', 'De Kuil');
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_voetbal')).stadion.naam === 'De Kuil');
      controle('editor: stadionnaam bewaard en op het stadion getekend (beschrijving)', /De Kuil/.test(await p.getAttribute('#sd-canvas', 'aria-label')));
      await p.fill('#sd-naam', 'kut');
      await slaap(700);
      controle('editor: een scheldwoord als naam wordt niet bewaard en het veld is ongeldig', (await opslag(p, 'spo_voetbal')).stadion.naam === 'De Kuil' && !(await p.evaluate(() => document.getElementById('sd-naam').validity.valid)));
      await p.evaluate(() => { const i = document.getElementById('sd-naam'); i.removeAttribute('maxlength'); i.value = 'Abcdefghij Klmnopqrstuvwx'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      await slaap(700);
      controle('editor: een naam van 25 tekens wordt niet bewaard', (await opslag(p, 'spo_voetbal')).stadion.naam === 'De Kuil');
      await p.fill('#sd-naam', 'Arena 24');
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_voetbal')).stadion.naam === 'Arena 24');
      // juichen bekijken
      controle('editor: na het kiezen van een juichstijl laat het voorbeeld het juichen zien', (await p.getAttribute('#av-juich', 'aria-pressed')) === 'true');
      await p.click('#av-juich');
      controle('editor: de knop Weer rustig staan zet het juichen uit', (await p.getAttribute('#av-juich', 'aria-pressed')) === 'false' && /Bekijk/.test(await p.textContent('#av-juich')));
      await p.click('#av-juich');
      controle('editor: Bekijk het juichen zet de knop op ingedrukt', (await p.getAttribute('#av-juich', 'aria-pressed')) === 'true');
      // proefstrafschop-link
      const href = await p.getAttribute('#proef', 'href');
      const q = new URL(href, WEB).searchParams;
      controle('editor: proefstrafschop geeft avatar en thema mee', q.get('strafschop') === '1' && JSON.parse(q.get('av')).nummer === 7 && /^#[0-9a-f]{6}$/.test(JSON.parse(q.get('thema')).tribune) && !/omtoday/i.test(href), href);
      // delen aan/uit
      await p.uncheck('#deel');
      await p.waitForFunction(() => JSON.parse(localStorage.getItem('spo_profiel')).deel === false);
      controle('editor: delen uitzetten wordt bewaard', true);
      // opnieuw laden: alles terug
      await p.reload();
      await p.waitForSelector('#k-haar button');
      controle('editor: na opnieuw laden staat alles er nog (nummer, naam, haar, kit)', (await p.inputValue('#nummer')) === '7' && (await p.inputValue('#sd-naam')) === 'Arena 24' && (await p.textContent('#k-haar [aria-checked="true"]')) === 'Krullen' && (await p.getAttribute('#k-kit [aria-checked="true"]', 'aria-label')) === 'Blauw');
      await foto(p, 'editor-na');
      controle('editor: geen scriptfouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    // ── een niet gekochte keuze in de opslag (bijv. een kapotte back-up) valt terug ──
    {
      const { ctx, p, fouten } = await nieuw(Object.assign({}, SEED, { spo_voetbal: { v: 1, avatar: { haar: 'afro', kit: 'goud', juich: 'salto', nummer: 33 }, stadion: { thema: 'goud', veld: 'neon', vlag: 'regenboog' } } }));
      await p.goto(WEB + '/speler.html?embed=1');
      await p.waitForSelector('#k-haar button');
      controle('editor: gratis rugnummer blijft, niet-gekochte keuzes vallen terug', (await p.textContent('#k-haar [aria-checked="true"]')) === 'Kort' && (await p.getAttribute('#k-kit [aria-checked="true"]', 'aria-label')) === 'Rood' && (await p.inputValue('#nummer')) === '33' && (await p.textContent('#k-thema [aria-checked="true"]')) === 'Klassiek');
      controle('editor: geen scriptfouten (terugval)', fouten.length === 0, fouten);
      await ctx.close();
    }
    // ── winkel: kopen en gebruiken ──
    {
      const { ctx, p, fouten } = await nieuw(SEED);
      await p.goto(WEB + '/winkel.html?embed=1');
      await p.waitForSelector('.item');
      const koppen = await p.locator('#rijen h2').allInnerTexts();
      controle('winkel: rijen voor haarstijlen, tenues, juichstijlen, stadionthema\'s, veldstijlen en vlaggen', ['Haarstijlen', 'Tenues', 'Juichstijlen', "Stadionthema's", 'Veldstijlen', 'Vlaggen'].every((k) => koppen.includes(k)), koppen);
      controle('winkel: de oude rijen zijn er nog', ['Somtoday-thema\'s', 'Kaartkleuren', 'Profieltitels'].every((k) => koppen.includes(k)));
      controle('winkel: voorbeelden van de nieuwe soorten zijn getekend', (await p.locator('.item canvas').count()) === 22);
      await foto(p, 'winkel');
      const kopen = p.locator('button[aria-label="Lang haar kopen voor 25 munten"]');
      await kopen.click();
      await kopen.click();
      await p.waitForSelector('button[aria-label="Lang haar gebruiken"]');
      controle('winkel: kopen kost 25 munten', (await opslag(p, 'spo_munten')).saldo === 375);
      await p.click('button[aria-label="Lang haar gebruiken"]');
      await p.waitForSelector('.item:has-text("Lang haar") .gekocht:has-text("In gebruik")');
      controle('winkel: gebruik zet het haar van de voetballer', (await opslag(p, 'spo_voetbal')).avatar.haar === 'lang');
      await p.click('button[aria-label="Nachtstadion kopen voor 40 munten"]');
      await p.click('button[aria-label="Nachtstadion kopen voor 40 munten"]');
      await p.waitForSelector('button[aria-label="Nachtstadion gebruiken"]');
      await p.click('button[aria-label="Nachtstadion gebruiken"]');
      await p.waitForSelector('.item:has-text("Nachtstadion") .gekocht:has-text("In gebruik")');
      controle('winkel: stadionthema gekozen na kopen', (await opslag(p, 'spo_voetbal')).stadion.thema === 'nacht');
      controle('winkel: alleen-te-winnen item heeft geen koopknop', (await p.locator('.item:has-text("Diamanttenue") button').count()) === 0 && /Alleen te winnen/.test(await p.locator('.item:has-text("Diamanttenue")').innerText()));
      controle('winkel: geen scriptfouten', fouten.length === 0, fouten);
      // pakje dat een nieuw item kan geven: geen crash, ook niet bij onze soorten
      await ctx.close();
    }
    // ── het paneel: tabblad en overzicht ──
    {
      const ctx = await br.newContext({ viewport: { width: 1100, height: 900 }, locale: 'nl-NL' });
      await ctx.addInitScript(NEP_CHROME, Object.assign({}, SEED, { spo_account: ACCOUNT, spo_rondleiding: 1, spo_nieuw_gezien: '3.0.0', spo_voetbal: { v: 1, avatar: { nummer: 17, kit: 'groen' }, stadion: { naam: 'Mijn Burcht' } } }));
      const p = await ctx.newPage();
      const fouten = [];
      p.on('pageerror', (e) => fouten.push(String(e)));
      await p.goto(WEB + '/hub.html');
      await p.waitForSelector('#tab-speler');
      controle('paneel: tabblad Speler en stadion in de zijbalk (na Profiel)', await p.evaluate(() => { const t = Array.from(document.querySelectorAll('#tabs [role="tab"]')).map((x) => x.dataset.tab); return t.indexOf('speler') === t.indexOf('profiel') + 1 && !!document.getElementById('paneel-speler'); }));
      controle('paneel: overzicht toont de voetballer en het stadion', (await pixels(p, '#hs-avatar')) > 3000 && (await pixels(p, '#hs-stadion')) > 20000);
      controle('paneel: beschrijving noemt de naam en het rugnummer', /Mijn Burcht/.test(await p.textContent('#hs-tekst')) && /rugnummer 17/.test(await p.textContent('#hs-tekst')) && /rugnummer 17/.test(await p.getAttribute('#hs-avatar', 'aria-label')), await p.textContent('#hs-tekst'));
      await p.click('#tab-speler');
      await p.waitForSelector('#paneel-speler iframe');
      controle('paneel: het tabblad laadt de editor', /speler\.html\?embed=1/.test(await p.getAttribute('#paneel-speler iframe', 'src')));
      // pijltjestoetsen door de tabs lopen ook langs het nieuwe tabblad
      await p.click('#tab-profiel');
      await p.focus('#tab-profiel');
      await p.keyboard.press('ArrowDown');
      controle('paneel: pijltje omlaag van Profiel gaat naar Speler en stadion', await p.evaluate(() => document.activeElement.id === 'tab-speler'));
      await foto(p, 'paneel-speler');
      controle('paneel: geen scriptfouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    // ── de strafschop ──
    {
      const { ctx, p, fouten } = await nieuw({});
      await p.goto(WEB + '/stage.html?strafschop=1&pauze=1&debug=1&stil=true&uitkomst=goal');
      await p.waitForFunction(() => window.__somPackDebug, null, { timeout: 30000 });
      controle('strafschop: werkt zonder avatar en thema zoals voorheen', await p.evaluate(() => { const i = window.__SPO.strafschop.maakInvoer({}); return i.thema === null && i.schutter.av === null && i.keeper.av === null && i.schutter.vak === 'Wiskunde'; }));
      controle('strafschop: bestaande aanroep met alleen vak/cijfer breekt niet', await p.evaluate(() => { const i = window.__SPO.strafschop.maakInvoer({ schutter: { vak: 'Frans', cijfer: '7,5', tier: 2 }, keeper: { cijfer: 4 } }); return i.schutter.tekst === '7,5' && i.schutter.tier === 2 && i.keeper.av === null; }));
      controle('strafschop: avatar met rommel wordt genegeerd', await p.evaluate(() => { const S = window.__SPO.strafschop; return ['x', 5, [], { huid: 'rood', shirt: 'url(x)', nummer: 'abc', juich: 'hack' }, { huid: '#12345' }].every((a) => S.maakInvoer({ schutter: { av: a } }).schutter.av === null) && S.maakInvoer({ schutter: { av: { shirt: '#ff0000', juich: 'hack', nummer: 500 } } }).schutter.av.juich === 'knie' && S.maakInvoer({ schutter: { av: { shirt: '#ff0000', nummer: 500 } } }).schutter.av.nummer === 0; }));
      controle('strafschop: thema met rommel wordt genegeerd', await p.evaluate(() => { const S = window.__SPO.strafschop; return ['x', 5, [], { tribune: 'rood', gras: ['#fff'], veld: 'a' }].every((t) => S.maakInvoer({ thema: t }).thema === null) && S.maakInvoer({ thema: { tribune: '#112233', veld: 9 } }).thema.veld === 2; }));
      await ctx.close();
    }
    for (const juich of ['knie', 'armen', 'wijd', 'vuist', 'dans', 'salto']) {
      const { ctx, p, fouten } = await nieuw({}, { width: 960, height: 540 });
      const av = { huid: '#7a4a2b', haar: '#d7b45a', shirt: '#ff2fd0', broek: '#14102a', acc: '#2cf5a0', nummer: 17, juich };
      const thema = { tribune: '#e6b41f', gras: ['#0a6e55', '#10a07a'], veld: 1 };
      await p.goto(WEB + '/stage.html?' + new URLSearchParams({ strafschop: '1', pauze: '1', debug: '1', stil: 'true', uitkomst: 'goal', av: JSON.stringify(av), thema: JSON.stringify(thema) }));
      await p.waitForFunction(() => window.__somPackDebug, null, { timeout: 30000 });
      const tl = await p.evaluate(() => window.__somPackDebug.tl);
      const kleurOp = async (t) => { await p.evaluate((t) => window.__somPackDebug.seek(t), t); const buf = await p.screenshot(); return buf; };
      const a = await kleurOp(tl.tKick - 1.2);
      const b = await kleurOp(tl.tReactie + 1.8);
      controle(`strafschop (${juich}): twee beelden zonder fout getekend`, a.length > 5000 && b.length > 5000 && fouten.length === 0, fouten);
      if (SHOTS) fs.writeFileSync(path.join(SHOTS, `strafschop-${juich}.png`), b);
      await ctx.close();
    }
    {
      // zonder avatar is het beeld anders dan met (kleur van het shirt en van het publiek)
      const { ctx, p } = await nieuw({}, { width: 960, height: 540 });
      const foto2 = async (extra) => {
        await p.goto(WEB + '/stage.html?' + new URLSearchParams(Object.assign({ strafschop: '1', pauze: '1', debug: '1', stil: 'true', uitkomst: 'goal' }, extra)));
        await p.waitForFunction(() => window.__somPackDebug, null, { timeout: 30000 });
        const tl = await p.evaluate(() => window.__somPackDebug.tl);
        await p.evaluate((t) => window.__somPackDebug.seek(t), tl.tKick - 1.2);
        return p.evaluate(() => { const c = document.querySelector('#__somStrafschop canvas'); const g = document.createElement('canvas'); g.width = 64; g.height = 36; const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let r = 0, gr = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; } return [r, gr, b]; });
      };
      const zonder = await foto2({});
      const met = await foto2({ av: JSON.stringify({ shirt: '#ff2fd0', huid: '#4f2f1c', nummer: 3 }), thema: JSON.stringify({ tribune: '#2a5fc4', gras: ['#0a6e55', '#10a07a'], veld: 2 }) });
      controle('strafschop: met eigen avatar en thema ziet het beeld er anders uit', Math.abs(zonder[0] - met[0]) + Math.abs(zonder[1] - met[1]) + Math.abs(zonder[2] - met[2]) > 3000, [zonder, met]);
      await ctx.close();
    }
  } finally {
    await br.close();
    web.close();
  }
}

(async () => {
  try {
    await logicaTests();
    if (!process.env.SPO_ALLEEN_LOGICA) await browserTests();
  } catch (e) {
    mis++;
    console.log('FOUT:', e && e.stack ? e.stack : e);
  }
  console.log(`${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})();
