// v3.0: het Snelspel (vier mini-games van ~20 seconden): de regels (snelspellib.js), de munten en de dagelijkse limiet (economie.js)
// en de pagina (arcade.html, tabblad Snelspel) in headless Chromium met een nagemaakte chrome.storage.
// Gebruik: node server/test/v3-snelspel.test.js   (start zelf een kleine webserver op poort 8190; NODE_PATH moet naar de globale modules wijzen)
process.env.TZ = 'Europe/Amsterdam';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const EXT = path.resolve(__dirname, '../../extension');
require(EXT + '/prestatieslib.js');
require(EXT + '/gevecht.js');
require(EXT + '/economie.js');
const E = globalThis.SPOEco;
const S = require(EXT + '/snelspellib.js');
const ACC = require(EXT + '/account.js');

let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const lees = (s) => { const t = mem.get(s); return t === undefined ? undefined : JSON.parse(t); };
const zet = (s, w) => mem.set(s, JSON.stringify(w));
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const MUNTEN = (saldo) => ({ v: 1, init: true, saldo, totaal: 500, gev: { w: 0, g: 0, v: 0 }, ts: 1 });
const lokaleDag = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hex = (n) => (n.toString(16).padStart(16, '0'));

(async () => {
  // ───────── 1. De regels ─────────
  controle('vier spellen met rondes en drempel', S.IDS.join() === 'reactie,schatting,hoogste,sorteer' && S.IDS.every((i) => S.SPELLEN[i].rondes > 0 && S.SPELLEN[i].goed > 0 && S.SPELLEN[i].goed <= S.SPELLEN[i].rondes));
  controle('een potje duurt 20 seconden', S.DUUR === 20);
  controle('gehaald: drempel', S.gehaald('reactie', 4) && !S.gehaald('reactie', 3) && S.gehaald('hoogste', 8) && !S.gehaald('hoogste', 5) && !S.gehaald('onbekend', 9) && !S.gehaald('__proto__', 9) && !S.gehaald('sorteer', 2.5));
  const r1 = seeded(7);
  const id = S.potjeId(r1);
  controle('potje-id is 16 hex tekens en verschilt per potje', /^[0-9a-f]{16}$/.test(id) && id !== S.potjeId(r1));
  controle('willekeur ligt in [0,1)', Array.from({ length: 200 }, () => S.willekeur()).every((x) => x >= 0 && x < 1));

  // reactietest
  const rr = S.reactieRonde(seeded(1));
  controle('reactie: wacht tussen 0,6 en 1,7 s en doel 0..3', rr.wacht >= 600 && rr.wacht < 1700 && rr.doel >= 0 && rr.doel <= 3, rr);
  controle('reactie: goede kaart snel genoeg telt', S.reactieGoed({ doel: 2 }, 2, 650, false) && S.reactieGoed({ doel: 2 }, 2, 700, false));
  controle('reactie: te traag, te vroeg, verkeerde kaart tellen niet', !S.reactieGoed({ doel: 2 }, 2, 701, false) && !S.reactieGoed({ doel: 2 }, 2, -5, false) && !S.reactieGoed({ doel: 2 }, 2, NaN, false) && !S.reactieGoed({ doel: 2 }, 1, 100, false) && !S.reactieGoed(null, 0, 100, false));
  controle('reactie zonder tijdsdruk: alleen de goede kaart, tijd maakt niet uit', S.reactieGoed({ doel: 2 }, 2, 99999, true) && S.reactieGoed({ doel: 2 }, 2, NaN, true) && !S.reactieGoed({ doel: 2 }, 3, 1, true));
  const doelen = new Set(Array.from({ length: 200 }, (_, i) => S.reactieRonde(seeded(i)).doel));
  controle('reactie: alle vier de kaarten komen voor als doel', doelen.size === 4);

  // schatting
  let schattingOk = true, uitleg = '';
  for (let i = 0; i < 500; i++) {
    const x = S.schattingRonde(seeded(i + 100));
    const gem = Math.round(x.cijfers.reduce((a, b) => a + b, 0) / 3 * 10) / 10;
    const dichtst = x.opties.reduce((b, o, j) => (Math.abs(o - x.gem) < Math.abs(x.opties[b] - x.gem) ? j : b), 0);
    const uniek = new Set(x.opties).size === 3;
    const afstand = x.opties.every((o, j) => x.opties.every((p, k) => j === k || Math.abs(o - p) >= 0.39));
    if (x.cijfers.length !== 3 || !x.cijfers.every((c) => c >= 1 && c <= 10) || x.gem !== gem || x.opties[x.goed] !== gem || dichtst !== x.goed || !uniek || !afstand || !x.opties.every((o) => o >= 1 && o <= 10)) { schattingOk = false; uitleg = JSON.stringify(x); break; }
  }
  controle('schatting: 500 rondes: goed antwoord = gemiddelde, drie verschillende antwoorden ver uit elkaar, binnen 1..10', schattingOk, uitleg);

  // hoogste kaart
  let hoogsteOk = true;
  const pool = Array.from({ length: 30 }, (_, i) => ({ vak: 'Vak' + (i % 5), cijfer: 1 + (i % 10) + (i % 3) * 0.1 }));
  for (let i = 0; i < 300; i++) {
    const x = S.hoogsteRonde(i % 3 === 0 ? [] : i % 3 === 1 ? pool.slice(0, 2) : pool, seeded(i + 900));
    const cs = x.kaarten.map((k) => k.cijfer);
    if (x.kaarten.length !== 4 || new Set(cs).size !== 4 || Math.max(...cs) !== cs[x.goed] || !x.kaarten.every((k) => typeof k.vak === 'string' && k.vak.length > 0 && k.cijfer >= 1 && k.cijfer <= 10)) { hoogsteOk = false; break; }
  }
  controle('hoogste: 300 rondes (lege pool, kleine pool, gewone pool): vier verschillende cijfers, de hoogste is eenduidig', hoogsteOk);
  const rommel = S.hoogsteRonde([null, 5, { vak: '<b>x</b>\u0000', cijfer: 'a' }, { vak: '<script>', cijfer: 7.04 }, { vak: 'A', cijfer: 99 }], seeded(3));
  controle('hoogste: rommel in de pool wordt overgeslagen of schoongemaakt', rommel.kaarten.length === 4 && rommel.kaarten.every((k) => !/[<>\u0000]/.test(k.vak) && k.cijfer <= 10));

  // sorteren
  let sorteerOk = true;
  for (let i = 0; i < 300; i++) {
    const x = S.sorteerRonde(seeded(i + 5));
    const t = x.treden;
    const goed = x.volgorde.map((j) => t[j]);
    if (t.length !== 4 || new Set(t).size !== 4 || !t.every((v) => v >= 0 && v <= 4) || goed.some((v, j) => j && goed[j - 1] >= v)) { sorteerOk = false; break; }
  }
  controle('sorteer: vier verschillende treden en een goede volgorde', sorteerOk);
  const sx = { treden: [3, 0, 2, 4], volgorde: [1, 2, 0, 3] };
  controle('sorteer: goede klikken lopen door en eindigen met klaar', S.sorteerStap(sx, [], 1) === 'goed' && S.sorteerStap(sx, [1], 2) === 'goed' && S.sorteerStap(sx, [1, 2], 0) === 'goed' && S.sorteerStap(sx, [1, 2, 0], 3) === 'klaar');
  controle('sorteer: een verkeerde klik is fout', S.sorteerStap(sx, [], 0) === 'fout' && S.sorteerStap(sx, [1], 3) === 'fout' && S.sorteerStap(sx, [], 'x') === 'fout' && S.sorteerStap(null, [], 0) === 'fout');
  controle('treden heten Gewoon t/m Mythisch', S.TREDEN.join() === 'Gewoon,Zeldzaam,Glim,Kosmisch,Mythisch');
  controle('elk spel heeft een uitleg met en zonder tijdsdruk', S.IDS.every((i) => S.SPELLEN[i].uitleg.length > 20 && S.SPELLEN[i].uitlegRustig.length > 20));
  // geen merknaam in de teksten
  controle('geen merknaam in snelspellib.js, snelspel.js', !/somtoday/i.test(fs.readFileSync(EXT + '/snelspellib.js', 'utf8').replace(/Somtoday Pack Opener/g, '')) && !/somtoday/i.test(fs.readFileSync(EXT + '/snelspel.js', 'utf8').replace(/Somtoday Pack Opener/g, '')));

  // ───────── 2. De economie: 2 munten per goed potje, 15 per dag ─────────
  mem.clear(); zet('spo_munten', MUNTEN(50));
  controle('constanten: 15 potjes, 2 munten', E.MINI_PER_DAG === 15 && E.MINI_MUNTEN === 2 && E.MINI_SPELLEN.join() === S.IDS.join());
  let st = await E.miniStatus();
  controle('begin: 15 over', st.over === 15 && st.gespeeld === 0 && st.max === 15 && st.saldo === 50, st);
  let u = await E.miniKlaar(hex(1), 'reactie', true);
  controle('goed potje: 2 munten', u.ok && u.munten === 2 && u.saldo === 52 && u.over === 14 && !u.dagmax, u);
  controle('de slot en de uitbetaling staan in spo_munten_ids', lees('spo_munten_ids')['mn:' + lokaleDag() + ':1'] === 1 && lees('spo_munten_ids')['mnw:' + hex(1)] === 1);
  u = await E.miniKlaar(hex(1), 'reactie', true);
  controle('hetzelfde potje twee keer: al-betaald, saldo gelijk', !u.ok && u.reden === 'al-betaald' && lees('spo_munten').saldo === 52, u);
  u = await E.miniKlaar(hex(2), 'schatting', false);
  controle('niet gehaald: 0 munten, maar het telt wel voor de limiet', u.ok && u.munten === 0 && u.over === 13 && lees('spo_munten').saldo === 52, u);
  for (const slecht of [['', 'reactie', true], ['abc', 'reactie', true], [hex(3), 'rad', true], [hex(3), '__proto__', true], [hex(3), 'reactie', 'ja'], [hex(3), 'reactie', 1], [null, 'reactie', true], [hex(3) + 'zz', 'reactie', true]]) {
    const x = await E.miniKlaar(...slecht);
    controle('ongeldig potje geweigerd: ' + JSON.stringify(slecht), !x.ok && x.reden === 'onbekend', x);
  }
  controle('ongeldige potjes kosten niets en tellen niet', lees('spo_munten').saldo === 52 && (await E.miniStatus()).gespeeld === 2);
  // tot en met de limiet
  for (let i = 10; i < 10 + 13; i++) u = await E.miniKlaar(hex(i), S.IDS[i % 4], true);
  st = await E.miniStatus();
  controle('na 15 potjes: limiet bereikt', st.over === 0 && st.gespeeld === 15, st);
  controle('13 goede potjes erbij: 26 munten, dus 12 goede = 24 + 2 (eerste) = 28 + ... saldo klopt', lees('spo_munten').saldo === 52 + 13 * 2, lees('spo_munten').saldo);
  const voor = lees('spo_munten').saldo;
  u = await E.miniKlaar(hex(99), 'hoogste', true);
  controle('16e potje: ok maar dagmax en geen munten', u.ok && u.dagmax === true && u.munten === 0 && lees('spo_munten').saldo === voor, u);
  controle('de uitbetaling van het 16e potje is wel gemarkeerd (niet opnieuw te proberen)', (await E.miniKlaar(hex(99), 'hoogste', true)).reden === 'al-betaald');
  const maxDag = Object.keys(lees('spo_munten_ids')).filter((k) => k.startsWith('mn:' + lokaleDag())).length;
  controle('nooit meer dan 15 slots per dag en dus hoogstens 30 munten', maxDag === 15 && E.MINI_PER_DAG * E.MINI_MUNTEN === 30);
  // een andere dag: weer 15
  const ids = lees('spo_munten_ids');
  for (const k of Object.keys(ids)) if (k.startsWith('mn:')) { ids[k.replace(lokaleDag(), '2020-01-01')] = 1; delete ids[k]; }
  zet('spo_munten_ids', ids);
  controle('een nieuwe dag: weer 15 over', (await E.miniStatus()).over === 15);
  // parallel afrekenen mag niet dubbel
  mem.clear(); zet('spo_munten', MUNTEN(0));
  const parallel = await Promise.all(Array.from({ length: 6 }, () => E.miniKlaar(hex(500), 'sorteer', true)));
  controle('zes gelijktijdige afrekeningen van één potje: precies één uitbetaling', parallel.filter((x) => x.ok).length === 1 && lees('spo_munten').saldo === 2, parallel.map((x) => x.reden || 'ok').join());
  const par2 = await Promise.all(Array.from({ length: 20 }, (_, i) => E.miniKlaar(hex(600 + i), 'sorteer', true)));
  controle('twintig gelijktijdige potjes: hoogstens 15 tellen', (await E.miniStatus()).gespeeld === 15 && lees('spo_munten').saldo <= 2 + 30 && par2.filter((x) => x.munten === 2).length === 14, JSON.stringify([lees('spo_munten').saldo, par2.filter((x) => x.munten === 2).length]));
  controle('back-up: spo_munten_ids staat erin en wordt samengevoegd', ACC.BACKUP_SLEUTELS.includes('spo_munten_ids') && ACC.samenvoegen('spo_munten_ids', { a: 1 }, { 'mn:2026-01-01:1': 1 }).a === 1);
  const eco = fs.readFileSync(EXT + '/economie.js', 'utf8');
  controle('munten hebben geen invloed op cijfers (geen verwijzing naar echte cijfers in miniKlaar)', !/cijfer/.test(eco.slice(eco.indexOf('function miniKlaar'), eco.indexOf('function miniKlaar') + 1200)));

  // ───────── 3. De pagina ─────────
  const { chromium } = require('playwright');
  const WEB = 'http://localhost:8190';
  const web = spawn(process.execPath, [path.join(process.env.NODE_PATH || '', 'http-server/bin/http-server'), '-p', '8190', '-s', '-c-1', EXT], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(WEB + '/arcade.html'); break; } catch (e) { await slaap(100); } }
  const kaarten = (n) => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, ts: 1000 + i, vak: ['Wiskunde', 'Engels', 'Frans', 'Duits', 'Biologie', 'Geschiedenis', 'Latijn', 'Economie'][i % 8], cijfer: 4 + (i % 6) + (i % 3) / 10, onderwerp: 'T', weging: 1, opening: 'pak', tier: 1, zeldzaam: false, trede: 0 }));
  const NEP = ({ zaad, vast }) => {
    const P = 'mock:';
    if (!localStorage.getItem(P + '__klaar')) { localStorage.setItem(P + '__klaar', '1'); for (const [k, v] of Object.entries(zaad)) localStorage.setItem(P + k, JSON.stringify(v)); }
    const luisteraars = [];
    const les = (k) => { const t = localStorage.getItem(P + k); return t == null ? undefined : JSON.parse(t); };
    const sleutels = (s) => (s == null ? Object.keys(localStorage).filter((x) => x.startsWith(P) && x !== P + '__klaar').map((x) => x.slice(P.length)) : [].concat(typeof s === 'object' && !Array.isArray(s) ? Object.keys(s) : s));
    const local = {
      async get(s) { const r = {}; for (const k of sleutels(s)) { const v = les(k); if (v !== undefined) r[k] = v; } return r; },
      async set(o) { const w = {}; for (const [k, v] of Object.entries(o)) { w[k] = { oldValue: les(k), newValue: v }; localStorage.setItem(P + k, JSON.stringify(v)); } luisteraars.forEach((f) => f(w, 'local')); },
      async remove(s) { for (const k of [].concat(s)) localStorage.removeItem(P + k); },
    };
    window.chrome = { storage: { local, onChanged: { addListener: (f) => luisteraars.push(f) } }, runtime: { getManifest: () => ({ version: '2.4.4' }), id: 'nep', sendMessage: () => Promise.resolve() } };
    if (vast) { let a = 12345; Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
  };
  const nieuw = async (br, { zaad = {}, beweging = 'no-preference', breed = 900 } = {}) => {
    const ctx = await br.newContext({ viewport: { width: breed, height: 900 }, reducedMotion: beweging });
    await ctx.addInitScript(NEP, { zaad });
    const p = await ctx.newPage();
    const fouten = [];
    p.on('pageerror', (e) => fouten.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error' && !/jummysnacks|ERR_FAILED|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
    return { ctx, p, fouten };
  };
  const opslag = (p, k) => p.evaluate((x) => { const t = localStorage.getItem('mock:' + x); return t == null ? undefined : JSON.parse(t); }, k);
  const stand = (p) => p.locator('#mini-stand').innerText();
  // Speelt het goede antwoord met de toetsen of klikken; haalt het antwoord uit de aria-labels / de pagina.
  async function speelUit(p, spel, rondes, opties) {
    const o = opties || {};
    for (let ronde = 0; ronde < rondes; ronde++) {
      if (process.env.DBG) console.log(' ronde', ronde, await p.locator('#mini-stand').innerText());
      await p.waitForFunction(() => document.querySelectorAll('#mini-bord .mini-knop').length > 0 && ![...document.querySelectorAll('#mini-bord .mini-knop')].every((b) => b.disabled && !b.classList.contains('goed')), null, { timeout: 8000 });
      if (spel === 'reactie') {
        await p.evaluate((fout) => new Promise((res, rej) => {
          const eind = Date.now() + 6000;
          const t = setInterval(() => {
            const l = [...document.querySelectorAll('#mini-bord .mini-knop')];
            const n = l.findIndex((b) => b.classList.contains('goud'));
            if (n >= 0) { clearInterval(t); window.__alt = l[0]; l[fout ? (n + 1) % 4 : n].click(); res(); } else if (Date.now() > eind) { clearInterval(t); rej(new Error('geen goud')); }
          }, 5);
        }), !!o.fout);
        await p.waitForFunction(() => !document.contains(window.__alt) || document.getElementById('mini-bord').hidden, null, { timeout: 4000 });
      } else if (spel === 'schatting') {
        const tekst = await p.locator('.mini-cijfers').getAttribute('aria-label');
        const c = tekst.match(/\d+,\d/g).map((x) => Number(x.replace(',', '.')));
        const gem = Math.round(c.reduce((a, b) => a + b, 0) / 3 * 10) / 10;
        const labels = await p.$$eval('#mini-bord .mini-knop', (l) => l.map((b) => b.getAttribute('aria-label')));
        let n = labels.findIndex((l) => Number(l.match(/\d+,\d/)[0].replace(',', '.')) === gem);
        if (o.fout) n = (n + 1) % 3;
        await p.locator('#mini-bord .mini-knop').nth(n).click();
      } else if (spel === 'hoogste') {
        const labels = await p.$$eval('#mini-bord .mini-knop', (l) => l.map((b) => b.getAttribute('aria-label')));
        const w = labels.map((l) => Number(l.match(/(\d+,\d)$/)[1].replace(',', '.')));
        let n = w.indexOf(Math.max(...w));
        if (o.fout) n = (n + 1) % 4;
        await p.keyboard.press(String(n + 1));
      } else if (spel === 'sorteer') {
        const labels = await p.$$eval('#mini-bord .mini-knop', (l) => l.map((b) => b.getAttribute('aria-label')));
        const rang = labels.map((l) => S.TREDEN.findIndex((t) => l.includes(': ' + t)));
        const volgorde = rang.map((r, i) => i).sort((a, b) => rang[a] - rang[b]);
        if (o.fout) { await p.keyboard.press(String(volgorde[1] + 1)); }
        else for (const i of volgorde) await p.keyboard.press(String(i + 1));
      }
      await slaap(60);
      // wacht tot de volgende ronde er staat of het potje voorbij is
      if (spel !== 'reactie') await p.waitForFunction((r) => /van \d+ goed/.test(document.getElementById('mini-stand').textContent) || new RegExp('Ronde ' + (r + 2) + ' van').test(document.getElementById('mini-stand').textContent) || document.getElementById('mini-bord').hidden, ronde, { timeout: 8000 }).catch(() => {});
      if (spel !== 'reactie') await slaap(900);
    }
  }
  const br = await chromium.launch();
  try {
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(10), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      controle('tabs: Muntenspellen gekozen, Snelspel verborgen', (await p.locator('#dtab-munten').getAttribute('aria-selected')) === 'true' && (await p.locator('#deel-snel').isHidden()) && (await p.locator('#deel-munten').isVisible()));
      controle('tabs: rollen en koppeling', (await p.locator('.deeltabs').getAttribute('role')) === 'tablist' && (await p.locator('#dtab-snel').getAttribute('aria-controls')) === 'deel-snel' && (await p.locator('#deel-snel').getAttribute('aria-labelledby')) === 'dtab-snel');
      await p.focus('#dtab-munten'); await p.keyboard.press('ArrowRight'); await slaap(300);
      controle('tabs: pijltje rechts opent Snelspel en verplaatst de focus', (await p.locator('#deel-snel').isVisible()) && (await p.locator('#deel-munten').isHidden()) && (await p.evaluate(() => document.activeElement.id)) === 'dtab-snel' && (await p.locator('#dtab-snel').getAttribute('aria-selected')) === 'true');
      controle('snelspel: info 15 potjes', /Vandaag nog 15 van 15 potjes/.test(await p.locator('#mini-info').innerText()), await p.locator('#mini-info').innerText());
      controle('snelspel: vier keuzes, reactie gekozen, uitleg zichtbaar', (await p.locator('.snelknop').count()) === 4 && (await p.locator('.snelknop[aria-pressed="true"]').count()) === 1 && /Reactietest/.test(await p.locator('#mini-uitleg').innerText()));
      controle('snelspel: uitleg noemt de klok, en zonder tijdsdruk niet', /binnen 20 seconden/.test(await p.locator('#mini-uitleg').innerText()));
      await p.check('#mini-rustig');
      controle('snelspel: zonder tijdsdruk past de uitleg aan', !/binnen 20 seconden/.test(await p.locator('#mini-uitleg').innerText()) && /Je hoeft niet snel/.test(await p.locator('#mini-uitleg').innerText()));
      await p.uncheck('#mini-rustig');
      const naamloos = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
      controle('snelspel: alle knoppen hebben een naam', naamloos === 0);
      controle('snelspel: geen tekstvelden', (await p.locator('input:not([type=checkbox]), textarea, [contenteditable]').count()) === 0);
      controle('snelspel: checkbox heeft een zichtbaar label', (await p.locator('label.rustig').innerText()).includes('Zonder tijdsdruk'));
      controle('snelspel: klok verborgen voor het spel start, bord ook', (await p.locator('#mini-klok').isHidden()) && (await p.locator('#mini-bord').isHidden()));
      controle('snelspel: geen fouten bij laden', fouten.length === 0, fouten);
      // een spel kiezen met het toetsenbord
      await p.focus('.snelknop[data-spel="schatting"]'); await p.keyboard.press('Enter');
      controle('snelspel: Enter kiest Cijferschatting', (await p.locator('.snelknop[data-spel="schatting"]').getAttribute('aria-pressed')) === 'true' && /Cijferschatting/.test(await p.locator('#mini-uitleg').innerText()));
      await ctx.close();
    }

    // elk spel: zonder tijdsdruk alles goed -> gehaald, 2 munten
    for (const spel of S.IDS) {
      if (process.env.DBG) console.log('spel', spel);
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(10), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await p.click('#dtab-snel'); await slaap(300);
      await p.click(`.snelknop[data-spel="${spel}"]`);
      await p.check('#mini-rustig');
      await p.click('#mini-start'); await slaap(400);
      controle(`${spel} rustig: bord zichtbaar, geen klok, start geblokkeerd tijdens het spel`, (await p.locator('#mini-bord').isVisible()) && (await p.locator('#mini-klok').isHidden()) && (await p.locator('#mini-start').isDisabled()) && (await p.locator('.snelknop').first().isDisabled()) && (await p.locator('#mini-rustig').isDisabled()));
      await speelUit(p, spel, S.SPELLEN[spel].rondes, { rustig: true });
      await p.waitForFunction(() => /van \d+ goed/.test(document.getElementById('mini-stand').textContent), null, { timeout: 8000 });
      const t = await stand(p);
      controle(`${spel} rustig: alles goed is gehaald en levert 2 munten`, new RegExp(`${S.SPELLEN[spel].rondes} van ${S.SPELLEN[spel].rondes} goed. Gehaald! Je wint 2 munten`).test(t) && (await opslag(p, 'spo_munten')).saldo === 12 && (await p.locator('#saldo').innerText()) === '12', t);
      controle(`${spel} rustig: limiet 1 gebruikt, start weer mogelijk, focus op Start`, /Vandaag nog 14 van 15/.test(await p.locator('#mini-info').innerText()) && (await p.locator('#mini-start').isEnabled()) && (await p.evaluate(() => document.activeElement.id)) === 'mini-start');
      controle(`${spel} rustig: geen paginafouten`, fouten.length === 0, fouten);
      await ctx.close();
    }
    // alles fout -> niet gehaald, 0 munten, wel een slot gebruikt
    for (const spel of ['schatting', 'hoogste']) {
      const { ctx, p } = await nieuw(br, { zaad: { spo_munten: MUNTEN(10), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await p.click('#dtab-snel'); await slaap(300);
      await p.click(`.snelknop[data-spel="${spel}"]`); await p.check('#mini-rustig'); await p.click('#mini-start'); await slaap(300);
      await speelUit(p, spel, S.SPELLEN[spel].rondes, { rustig: true, fout: true });
      await p.waitForFunction(() => /van \d+ goed/.test(document.getElementById('mini-stand').textContent), null, { timeout: 8000 });
      controle(`${spel}: alles fout is niet gehaald, geen munten, slot telt`, /Niet gehaald/.test(await stand(p)) && (await opslag(p, 'spo_munten')).saldo === 10 && /Vandaag nog 14 van 15/.test(await p.locator('#mini-info').innerText()), await stand(p));
      await ctx.close();
    }
    // reactietest met tijd: klok, te vroeg klikken, en goed met de toetsen
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(10), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await p.click('#dtab-snel'); await slaap(300);
      await p.click('#mini-start'); await slaap(250);
      controle('reactie met tijd: klok zichtbaar met seconden en role timer', (await p.locator('#mini-klok').isVisible()) && /^Nog \d+ s$/.test(await p.locator('#mini-klok-tekst').innerText()) && (await p.locator('#mini-klok').getAttribute('role')) === 'timer');
      controle('reactie met tijd: vier dichte kaarten met een naam, geen goud', (await p.locator('#mini-bord .mini-knop').count()) === 4 && (await p.locator('#mini-bord .mini-knop.goud').count()) === 0 && (await p.locator('#mini-bord .mini-knop[aria-label$="dicht"]').count()) === 4);
      await p.keyboard.press('1'); await slaap(150);
      controle('reactie: te vroeg drukken is fout', /Fout\. Te vroeg\./.test(await stand(p)), await stand(p));
      await slaap(900);
      await speelUit(p, 'reactie', 4);
      await p.waitForFunction(() => /van \d+ goed/.test(document.getElementById('mini-stand').textContent), null, { timeout: 15000 });
      const t = await stand(p);
      controle('reactie met tijd: 4 goed na 1 te vroeg = gehaald (4 van 5)', /4 van 5 goed\. Gehaald! Je wint 2 munten/.test(t), t);
      controle('reactie: klok weg na afloop', await p.locator('#mini-klok').isHidden());
      controle('reactie: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    // de klok loopt af: wat niet af is telt als fout
    {
      const { ctx, p } = await nieuw(br, { zaad: { spo_munten: MUNTEN(10), spo_galerij: kaarten(8) } });
      await p.clock.install();
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await p.click('#dtab-snel'); await p.clock.runFor(300);
      await p.click('.snelknop[data-spel="hoogste"]'); await p.click('#mini-start'); await p.clock.runFor(500);
      controle('klok: begint rond 20 seconden', /^Nog (19|20) s$/.test(await p.locator('#mini-klok-tekst').innerText()), await p.locator('#mini-klok-tekst').innerText());
      await p.clock.runFor(21000);
      const t = await stand(p);
      controle('klok: na 20 seconden zonder antwoord is het potje voorbij, niet gehaald, 0 munten', /0 van 8 goed\. Niet gehaald/.test(t) && (await opslag(p, 'spo_munten')).saldo === 10 && (await p.locator('#mini-bord').isHidden()), t);
      controle('klok: het potje telde wel mee voor de limiet', /Vandaag nog 14 van 15/.test(await p.locator('#mini-info').innerText()));
      await ctx.close();
    }
    // limiet: na 15 potjes kan niet meer worden gestart
    {
      const dag = lokaleDag();
      const ids = {}; for (let i = 1; i <= 15; i++) ids['mn:' + dag + ':' + i] = 1;
      const { ctx, p } = await nieuw(br, { zaad: { spo_munten: MUNTEN(10), spo_munten_ids: ids, spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await p.click('#dtab-snel'); await slaap(300);
      controle('limiet: info zegt dat het op is', /alle 15 potjes gespeeld/.test(await p.locator('#mini-info').innerText()));
      await p.click('#mini-start'); await slaap(300);
      controle('limiet: starten geeft uitleg en geen bord', /al 15 potjes gespeeld/.test(await stand(p)) && (await p.locator('#mini-bord').isHidden()));
      await ctx.close();
    }
    // minder beweging, smal scherm en geen horizontale scroll
    {
      const { ctx, p } = await nieuw(br, { beweging: 'reduce', breed: 360, zaad: { spo_munten: MUNTEN(10), spo_galerij: kaarten(2) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await p.click('#dtab-snel'); await slaap(300);
      await p.click('.snelknop[data-spel="hoogste"]'); await p.check('#mini-rustig'); await p.click('#mini-start'); await slaap(300);
      controle('hoogste met bijna lege galerij: toch vier kaarten', (await p.locator('#mini-bord .mini-knop').count()) === 4);
      const breedte = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      controle('smal scherm: geen horizontale scroll', breedte[0] <= breedte[1], breedte);
      const stijl = await p.evaluate(() => getComputedStyle(document.querySelector('.rad')).transitionDuration);
      controle('minder beweging: geen overgangen op het rad (bestaande regel blijft)', /^0s/.test(stijl), stijl);
      await ctx.close();
    }
    // in het paneel van de hub
    {
      const { ctx, p } = await nieuw(br, { zaad: { spo_munten: MUNTEN(10), spo_rondleiding: 1, spo_nieuw_gezien: '2.4.4', spo_account: { email: 't@t.nl', sessie: 's', account: 'a', sleutel: 'k', laatsteBackup: 1 } } });
      await p.setViewportSize({ width: 1100, height: 800 });
      await p.goto(WEB + '/hub.html'); await p.waitForSelector('#tab-arcade'); await p.click('#tab-arcade'); await slaap(900);
      const f = p.frameLocator('#paneel-arcade iframe');
      await f.locator('#dtab-snel').click(); await slaap(300);
      controle('hub: Snelspel werkt in het Arcade-paneel', await f.locator('#deel-snel').isVisible() && /Vandaag nog 15 van 15/.test(await f.locator('#mini-info').innerText()));
      await ctx.close();
    }
  } finally {
    await br.close();
    web.kill();
  }
  console.log(`v3-snelspel.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.log('FOUT', e); process.exit(1); });
