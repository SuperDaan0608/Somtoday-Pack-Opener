// v3.0 Campagne: regels en gegevens (campagnelib.js), beloningen (economie.js campagneKlaar), back-up, prestaties en de pagina in headless Chromium (campagne.html, hub-tabblad).
// Gebruik: node server/test/v3-campagne.test.js   (start zelf een kleine webserver op poort 8129; NODE_PATH moet naar de globale modules wijzen)
process.env.TZ = 'Europe/Amsterdam';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const EXT = path.resolve(__dirname, '../../extension');
const P = require(EXT + '/prestatieslib.js');
const G = require(EXT + '/gevecht.js');
require(EXT + '/economie.js');
const E = globalThis.SPOEco;
const K = require(EXT + '/kaartspellib.js');
const C = require(EXT + '/campagnelib.js');
const ACC = require(EXT + '/account.js');
const { chromium } = require('playwright');
const WEB = 'http://localhost:8129';
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const lees = (s) => { const t = mem.get(s); return t === undefined ? undefined : JSON.parse(t); };
const zet = (s, w) => mem.set(s, JSON.stringify(w));
const MUNTEN = (saldo) => ({ v: 1, init: true, saldo, totaal: 500, gev: { w: 0, g: 0, v: 0 }, ts: 1 });
const gem = (d) => d.reduce((a, k) => a + G.sterkte(k), 0) / d.length;

// ───────── 1. De werelden en de decks ─────────
{
  controle('4 werelden, elk met een eigen wezen, vakgroep en 4 tegenstandersnamen', C.WERELDEN.length === 4 && new Set(C.WERELDEN.map((w) => w.wezen)).size === 4 && C.WERELDEN.every((w) => w.tegenstanders.length === 4));
  controle('wezens: draak/exact, feniks/talen, kraken/mens, griffioen/kunst', ['exact:draak', 'talen:feniks', 'mens:kraken', 'kunst:griffioen'].every((x) => { const [i, z] = x.split(':'); return C.wereld(i) && C.wereld(i).wezen === z; }));
  for (const w of C.WERELDEN) {
    const decks = [1, 2, 3, 4, 5].map((n) => C.maakDeck(w.id, n));
    controle(`${w.id}: elk niveau heeft een deck van 5 geldige kaarten`, decks.every((d) => d.length === 5 && d.every((k) => k.cijfer >= 1 && k.cijfer <= 10 && G.groepVan(k.vak))));
    controle(`${w.id}: de sterkte loopt op per niveau`, decks.every((d, i) => i === 0 || gem(d) > gem(decks[i - 1])), decks.map(gem));
    controle(`${w.id}: een deck is altijd hetzelfde`, JSON.stringify(C.maakDeck(w.id, 3)) === JSON.stringify(decks[2]));
    const baas = decks[4];
    controle(`${w.id}: de baas speelt alleen kaarten uit ${w.groep}, met precies één baaskaart met een eigen naam`, baas.every((k) => G.groepVan(k.vak) === w.id) && baas.filter((k) => k.baas).length === 1 && baas.find((k) => k.baas).naam === w.baas);
    controle(`${w.id}: de baaskaart is kosmisch of beter; gewone tegenstanders hebben geen baaskaart`, baas.find((k) => k.baas).t >= 3 && decks.slice(0, 4).every((d) => d.every((k) => !k.baas)));
    controle(`${w.id}: gewone tegenstanders kennen meer dan een vakgroep, de baas niet`, decks.slice(0, 4).every((d) => new Set(d.map((k) => G.groepVan(k.vak))).size > 1));
    // een potje met de decks werkt in kaartspellib
    const p = K.nieuwPotje(decks[0], decks[4], 'ik');
    let r = 0; while (!K.eind(p) && r++ < 10) K.speelRonde(p, 'ladder', K.over(p, 'ik')[0], K.over(p, 'zij')[0]);
    controle(`${w.id}: een potje met deze decks loopt tot het einde`, K.eind(p) && !!K.uitslag(p));
  }
  controle('thema-voordeel: de baas is gemiddeld sterker dan niveau 4 van dezelfde wereld', C.WERELDEN.every((w) => gem(C.maakDeck(w.id, 5)) > gem(C.maakDeck(w.id, 4))));
  controle('maakDeck weigert onbekende wereld, niveau 0 en 6, en __proto__', C.maakDeck('nep', 1) === null && C.maakDeck('exact', 0) === null && C.maakDeck('exact', 6) === null && C.maakDeck('__proto__', 1) === null);
  controle('tegenstanderNaam: niveau 1..4 en baas', C.tegenstanderNaam('exact', 1) === 'Lavaslak' && C.tegenstanderNaam('exact', 5) === 'Vulkaandraak');
  controle('sterren: 3-0 is 3, 3-1 is 2, 3-2 is 1, verlies of gelijk is 0', C.sterren({ ik: 3, zij: 0 }) === 3 && C.sterren({ ik: 3, zij: 1 }) === 2 && C.sterren({ ik: 3, zij: 2 }) === 1 && C.sterren({ ik: 1, zij: 3 }) === 0 && C.sterren({ ik: 2, zij: 2 }) === 0);
}

// ───────── 2. Voortgang en opslag ─────────
{
  let s = C.schoon(undefined);
  controle('leeg: niveau 1 open, niets gewonnen', C.openNiveau(s, 'exact') === 1 && C.gewonnen(s, 'exact') === 0 && C.aantalVoltooid(s) === 0);
  s = C.registreer(s, 'exact', 3, 3);
  controle('een niveau overslaan telt niet', C.gewonnen(s, 'exact') === 0);
  s = C.registreer(s, 'exact', 1, 2); s = C.registreer(s, 'exact', 2, 3);
  controle('winnen opent het volgende niveau', C.openNiveau(s, 'exact') === 3 && C.gewonnen(s, 'exact') === 2);
  s = C.registreer(s, 'exact', 1, 1);
  controle('minder sterren overschrijft niet', s.w.exact.s[0] === 2);
  s = C.registreer(s, 'exact', 1, 3);
  controle('meer sterren wel', s.w.exact.s[0] === 3);
  s = C.registreer(s, 'exact', 3, 1); s = C.registreer(s, 'exact', 4, 1); s = C.registreer(s, 'exact', 5, 2);
  controle('wereld voltooid na de baas', C.voltooid(s, 'exact') && C.aantalVoltooid(s) === 1 && C.openNiveau(s, 'exact') === 5 && C.totaalSterren(s) === 3 + 3 + 1 + 1 + 2);
  controle('onbekende wereld en onzin worden genegeerd', JSON.stringify(C.registreer(s, 'nep', 1, 3)) === JSON.stringify(s) && C.registreer(s, 'talen', 1, 0).w.talen.s[0] === 0 && C.registreer(s, 'talen', 1.5, 3).w.talen.s[0] === 0);
  const vuil = C.schoon({ v: 9, w: { exact: { s: [3, 0, 3, 9, -4] }, talen: 'x', __proto__: { s: [3] } }, deck: ['a', 'a', 5, 'b'.repeat(80), 'c', 'd', 'e', 'f', 'g', 'h'], extra: 'x' });
  controle('schoon: sterren begrensd en niets na een gat, deck uniek en kort, geen extra velden', vuil.w.exact.s.join() === '3,0,0,0,0' && vuil.deck.join() === 'a,c,d,e,f' && !('extra' in vuil) && vuil.w.talen.s.join() === '0,0,0,0,0');
  const j = JSON.stringify(s);
  controle('opgeslagen vorm bevat geen vaknamen en niets van de school-site', !/wiskunde|nederlands|engels|geschiedenis|muziek|somtoday/i.test(j) && Object.keys(s).sort().join() === 'deck,ts,v,w');
  const a = C.registreer(C.registreer(C.schoon(null), 'talen', 1, 1), 'talen', 2, 2);
  const b = C.registreer(C.schoon(null), 'exact', 1, 3);
  const m = C.samenvoegen(a, b);
  controle('samenvoegen: hoogste voortgang van allebei', m.w.talen.s[1] === 2 && m.w.exact.s[0] === 3 && C.samenvoegen(b, a).w.talen.s[1] === 2);
  controle('samenvoegen: per niveau de meeste sterren, nooit een gat', C.samenvoegen(C.registreer(C.schoon(null), 'exact', 1, 1), C.registreer(C.schoon(null), 'exact', 1, 3)).w.exact.s[0] === 3);
  // account.js (de back-up)
  controle('spo_campagne zit in BACKUP_SLEUTELS', ACC.BACKUP_SLEUTELS.includes('spo_campagne'));
  const am = ACC.samenvoegen('spo_campagne', a, b, false);
  controle('back-up: samenvoegen houdt de hoogste voortgang van allebei', am.w.talen.s.join() === '1,2,0,0,0' && am.w.exact.s[0] === 3);
  controle('back-up: leeg + vol = vol, en een kapotte back-up levert geen fout', JSON.stringify(ACC.samenvoegen('spo_campagne', undefined, a, false)) === JSON.stringify(a) && ACC.samenvoegen('spo_campagne', { w: 5 }, { w: { exact: { s: 'x' } } }, false).v === 1);
  controle('back-up: per niveau de meeste sterren, en nooit een gat', ACC.samenvoegen('spo_campagne', { w: { exact: { s: [1, 1, 0, 0, 0] } } }, { w: { exact: { s: [3, 0, 0, 0, 0] } } }, false).w.exact.s.join() === '3,1,0,0,0' && ACC.samenvoegen('spo_campagne', { w: { exact: { s: [0, 3, 3, 0, 0] } } }, { w: { exact: { s: [1, 0, 0, 0, 0] } } }, false).w.exact.s.join() === '1,3,3,0,0');
}

// ───────── 3. Beloningen en winkelitems (economie.js) ─────────
(async () => {
  mem.clear(); zet('spo_munten', MUNTEN(0)); zet('spo_winkel', { gekocht: [], gebruik: {} });
  const st0 = await E.campagneStatus();
  controle('status: 3 beloonde herhalingen per dag', st0.over === 3 && st0.max === 3 && E.CAMPAGNE_PER_DAG === 3);
  let r = await E.campagneKlaar('exact', 1);
  controle('eerste keer niveau 1: 15 munten, eenmalig', r.ok && r.eerste && r.munten === 15 && r.saldo === 15 && !r.wereldKlaar);
  r = await E.campagneKlaar('exact', 1);
  controle('herhaling: minder munten (4) en telt voor de dagelijkse limiet', r.ok && !r.eerste && r.munten === 4 && r.over === 2 && r.saldo === 19);
  r = await E.campagneKlaar('exact', 1); r = await E.campagneKlaar('exact', 1);
  controle('de derde herhaling telt nog, de vierde niet meer: geen munten meer vandaag', r.munten === 4 && r.over === 0 && r.saldo === 15 + 4 * 3);
  r = await E.campagneKlaar('exact', 1);
  controle('na 3 herhalingen: geen munten meer vandaag', r.dagmax === true && r.munten === 0 && r.saldo === 15 + 4 * 3, r);
  r = await E.campagneKlaar('exact', 2);
  controle('een nieuw niveau geeft altijd munten, ook na de dagelijkse limiet', r.eerste && r.munten === 20);
  const ids = lees('spo_munten_ids');
  controle('de limiet staat in spo_munten_ids (mee in de back-up)', ids['cf:exact:1'] && ids['cf:exact:2'] && Object.keys(ids).filter((k) => k.startsWith('cd:')).length === 3);
  controle('onbekende wereld, niveau 0 en 6, tekst als niveau en __proto__ worden geweigerd', (await E.campagneKlaar('nep', 1)).ok === false && (await E.campagneKlaar('exact', 0)).ok === false && (await E.campagneKlaar('exact', 6)).ok === false && (await E.campagneKlaar('exact', '1')).ok === false && (await E.campagneKlaar('__proto__', 1)).ok === false && (await E.campagneKlaar('constructor', 1)).ok === false);
  const voor = lees('spo_munten').saldo;
  r = await E.campagneKlaar('exact', 5);
  controle('de baas voor het eerst: 60 munten, wereld voltooid, titel en kaartkleuren erbij', r.ok && r.eerste && r.munten === 60 && r.wereldKlaar && r.items.join() === 'ti-drakendoder,kt-vulkaan' && lees('spo_munten').saldo === voor + 60, r);
  const wk = lees('spo_winkel').gekocht;
  controle('winkel: de beloningen staan in je spullen', wk.includes('ti-drakendoder') && wk.includes('kt-vulkaan'));
  r = await E.campagneKlaar('exact', 5);
  controle('de baas nog eens: geen tweede beloning', !r.wereldKlaar && r.items.length === 0 && lees('spo_winkel').gekocht.filter((x) => x === 'ti-drakendoder').length === 1);
  for (const w of ['talen', 'mens', 'kunst']) { const x = await E.campagneKlaar(w, 5); controle(`${w}: voltooid geeft twee items`, x.wereldKlaar && x.items.length === 2 && x.items.every((i) => E.PER_ID.has(i))); }
  const camp = E.ITEMS.filter((i) => i.campagne);
  controle('8 campagne-items: 4 titels en 4 kaartkleuren, alleen te winnen (geen prijs)', camp.length === 8 && camp.filter((i) => i.soort === 'titel').length === 4 && camp.filter((i) => i.soort === 'kaartthema').length === 4 && camp.every((i) => i.prijs === null && i.zeld === 3 && E.CAMPAGNE_WERELDEN[i.campagne].includes(i.id)));
  controle('items kunnen niet gekocht worden', (await E.koop('ti-drakendoder')).ok === false);
  controle('de uitleg van de items zegt dat het campagne-items zijn', camp.every((i) => /Campagne/.test(i.uitleg)));
  // niet in pakjes en niet in de dagelijkse beloning
  mem.clear(); zet('spo_munten', MUNTEN(1e6)); zet('spo_winkel', { gekocht: [], gebruik: {} });
  for (let i = 0; i < 120; i++) await E.openPakje('groot');
  controle('pakjes geven nooit een campagne-item', !lees('spo_winkel').gekocht.some((id) => E.PER_ID.get(id).campagne));
  zet('spo_winkel', { gekocht: E.ITEMS.filter((i) => i.prijs == null && !i.campagne).map((i) => i.id), gebruik: {} }); { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 1); zet('spo_dagelijks', { laatste: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, reeks: 6, dagen: 6 }); }
  mem.delete('spo_munten_ids');
  const dag = await E.claimDagelijks();
  controle('de dagelijkse beloning geeft geen campagne-item (alles gehad: 100 munten)', dag && dag.dag === 7 && dag.item === null && dag.munten === 100, dag);
  // profiel: de titel is te kiezen
  zet('spo_winkel', { gekocht: ['ti-drakendoder', 'kt-vulkaan'], gebruik: {} });
  await E.gebruik('titel', 'ti-drakendoder');
  controle('de titel is te dragen', lees('spo_winkel').gebruik.titel === 'ti-drakendoder');

  // ───────── 4. Prestaties ─────────
  mem.clear();
  zet('spo_campagne', { v: 1, w: { exact: { s: [3, 3, 3, 3, 1] }, talen: { s: [1, 0, 0, 0, 0] } }, deck: [], ts: 1 });
  let o = await P.overzicht();
  const b = (id) => o.find((x) => x.id === id);
  controle('prestatie: Drakendoder behaald, Feniksvriend niet, Heer van de werelden niet', b('camp-draak').klaar && !b('camp-feniks').klaar && !b('camp-alles').klaar && b('camp-alles').nu === 1);
  zet('spo_campagne', { v: 1, w: { exact: { s: [1, 1, 1, 1, 1] }, talen: { s: [1, 1, 1, 1, 1] }, mens: { s: [1, 1, 1, 1, 1] }, kunst: { s: [1, 1, 1, 1, 1] } }, deck: [], ts: 1 });
  o = await P.overzicht();
  controle('prestatie: alle vier de eindbazen geeft Heer van de werelden', ['camp-draak', 'camp-feniks', 'camp-kraken', 'camp-griffioen', 'camp-alles'].every((id) => b(id).klaar));
  const nieuw = await P.controleer();
  controle('controleer meldt de campagne-prestaties en bewaart ze', nieuw.length === 5 && Object.keys(lees('spo_prestaties')).includes('camp-alles'));
  controle('zonder campagne geen prestatie en geen fout', (mem.delete('spo_campagne'), mem.delete('spo_prestaties'), (await P.overzicht()).find((x) => x.id === 'camp-draak').klaar === false));
  const tekstFilter = require(EXT + '/tekstfilter.js');
  void tekstFilter;

  await paginaTests();
  console.log(`v3-campagne.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// ───────── 5. De pagina ─────────
const SERVER = 'https://jummysnacks.nl/api.php';
const VRIENDEN = { server: SERVER, id: 'ab'.repeat(16), token: 'geheim-token', privJwk: {}, pub: 'p', vrienden: [] };
const kaartPlaat = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const sterkeKaarten = (n, vak, cijfer, trede) => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, ts: 1000 + i, vak, cijfer: cijfer - i * 0.01, onderwerp: 'T', weging: 1, opening: 'pak', tier: 4, zeldzaam: true, trede, kaart: kaartPlaat }));
const gewoneKaarten = (n) => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, ts: 1000 + i, vak: ['Wiskunde', 'Engels', 'Geschiedenis', 'Muziek'][i % 4], cijfer: 5 + (i % 5), onderwerp: 'T', weging: 1, opening: 'pak', tier: 1, zeldzaam: false, trede: 0, kaart: kaartPlaat }));
const NEP_CHROME = ({ zaad }) => {
  const P2 = 'mock:';
  if (!localStorage.getItem(P2 + '__klaar')) { localStorage.setItem(P2 + '__klaar', '1'); for (const [k, v] of Object.entries(zaad)) localStorage.setItem(P2 + k, JSON.stringify(v)); }
  const luisteraars = [];
  const lees2 = (k) => { const t = localStorage.getItem(P2 + k); return t == null ? undefined : JSON.parse(t); };
  const sleutels = (s) => (s == null ? Object.keys(localStorage).filter((x) => x.startsWith(P2) && x !== P2 + '__klaar').map((x) => x.slice(P2.length)) : [].concat(typeof s === 'object' && !Array.isArray(s) ? Object.keys(s) : s));
  const local = {
    async get(s) { const r = {}; for (const k of sleutels(s)) { const v = lees2(k); if (v !== undefined) r[k] = v; } return r; },
    async set(o) { const w = {}; for (const [k, v] of Object.entries(o)) { w[k] = { oldValue: lees2(k), newValue: v }; localStorage.setItem(P2 + k, JSON.stringify(v)); } luisteraars.forEach((f) => f(w, 'local')); },
    async remove(s) { for (const k of [].concat(s)) localStorage.removeItem(P2 + k); },
  };
  window.chrome = { storage: { local, onChanged: { addListener: (f) => luisteraars.push(f) } }, runtime: { getManifest: () => ({ version: '2.4.4' }), id: 'nep', sendMessage: () => Promise.resolve() } };
};
async function nieuwe(br, { zaad = {}, beweging = 'no-preference', breed = 900, hoog = 900 } = {}) {
  const ctx = await br.newContext({ viewport: { width: breed, height: hoog }, reducedMotion: beweging });
  await ctx.addInitScript(NEP_CHROME, { zaad });
  await ctx.route(/jummysnacks\.nl/, (route) => route.abort());
  const p = await ctx.newPage();
  const fouten = [];
  p.on('pageerror', (e) => fouten.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/jummysnacks|ERR_FAILED|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
  return { ctx, p, fouten };
}
const opslag = (p, k) => p.evaluate((x) => { const t = localStorage.getItem('mock:' + x); return t == null ? undefined : JSON.parse(t); }, k);
async function speelUit(p, vgl, maxMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await p.locator('#einde').isVisible()) return true;
    if (await p.locator('#vgl-knoppen').isVisible()) { await p.locator(vgl ? `.vgl-knop[data-vgl=${vgl}]` : '.vgl-knop').first().click(); await slaap(100); continue; }
    const k = p.locator('.hand-kaart:not(:disabled)');
    if ((await k.count()) > 0) { await k.first().click(); await slaap(100); continue; }
    await slaap(80);
  }
  return false;
}
async function paginaTests() {
  const web = spawn(process.execPath, [path.join(process.env.NODE_PATH || '', 'http-server/bin/http-server'), '-p', '8129', '-s', '-c-1', EXT], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(WEB + '/campagne.html'); break; } catch (e) { await slaap(100); } }
  const br = await chromium.launch();
  try {
    // 5a. Overzicht, toegankelijkheid, zonder genoeg kaarten
    {
      const { ctx, p, fouten } = await nieuwe(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: gewoneKaarten(3) } });
      await p.goto(WEB + '/campagne.html'); await p.waitForSelector('.wereld-knop'); await slaap(300);
      controle('pagina: taal nl, één h1, geen fouten, 4 werelden', (await p.locator('html').getAttribute('lang')) === 'nl' && (await p.locator('h1').count()) === 1 && fouten.length === 0 && (await p.locator('.wereld-knop').count()) === 4, fouten);
      controle('pagina: geen tekstvelden', (await p.locator('input, textarea, [contenteditable]').count()) === 0);
      controle('pagina: melding dat je te weinig kaarten hebt', await p.locator('#geen-galerij').isVisible());
      await p.locator('.wereld-knop').first().click();
      controle('wereld: 5 niveaus, allemaal uit zonder deck, de uitleg staat er', (await p.locator('.niveau-knop').count()) === 5 && (await p.locator('.niveau-knop:not(:disabled)').count()) === 0 && await p.locator('#w-deck-melding').isVisible());
      controle('wereld: de focus staat op de kop', (await p.evaluate(() => document.activeElement.id)) === 'w-titel');
      const naamloos = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
      controle('alle knoppen hebben een naam', naamloos === 0, naamloos);
      await ctx.close();
    }
    // 5b. Een niveau winnen: sterren, munten, volgend niveau open, herhaling
    {
      const { ctx, p, fouten } = await nieuwe(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: sterkeKaarten(8, 'Wiskunde', 9.9, 4) } });
      await p.goto(WEB + '/campagne.html'); await p.waitForSelector('.wereld-knop'); await slaap(400);
      controle('deck: automatisch de beste 5 gekozen en bewaard', (await p.locator('#deck-stand').innerText()).startsWith('5 van 5') && (await opslag(p, 'spo_campagne')).deck.length === 5);
      await p.locator('.wereld-knop').first().click();
      controle('wereld: alleen niveau 1 is open', (await p.locator('.niveau-knop:not(:disabled)').count()) === 1 && (await p.locator('.niveau-knop').nth(1).isDisabled()));
      controle('wereld: de vijfde knop is de eindbaas met het thema-voordeel uitgelegd', /Eindbaas: Vulkaandraak/.test(await p.locator('.niveau-knop').nth(4).innerText()) && /Thema-voordeel/.test(await p.locator('#w-baas').innerText()));
      await p.locator('.niveau-knop').first().click();
      controle('tafel: tegenstander Lavaslak, 5 kaarten voor beide kanten', (await p.locator('#naam-zij').innerText()) === 'Lavaslak' && (await p.locator('.hun-deck .mk').count()) === 5 && (await p.locator('.hand-kaart').count()) === 5);
      controle('tafel: niveau in de kop voor schermlezers', /niveau 1/.test(await p.locator('#t-titel').innerText()));
      const klaar = await speelUit(p, 'cijfer');
      controle('niveau 1 is uitgespeeld', klaar);
      controle('winst met 3 sterren (3-0 met zeer sterke kaarten)', (await p.locator('#einde-kop').innerText()) === 'Je wint het niveau!' && (await p.locator('#einde-sterren').getAttribute('aria-label')) === '3 sterren van 3', await p.locator('#einde-kop').innerText());
      await p.waitForFunction(() => /Eerste keer gewonnen/.test(document.getElementById('einde-tekst').textContent));
      const o = await opslag(p, 'spo_campagne');
      controle('voortgang bewaard: 3 sterren op niveau 1, niveau 2 open', o.w.exact.s[0] === 3 && !/wiskunde/i.test(JSON.stringify(o)));
      controle('munten: +15 voor de eerste winst', (await opslag(p, 'spo_munten')).saldo === 115 && (await p.locator('#saldo').innerText()) === '115');
      controle('einde: focus op de kop, knop Volgend niveau zichtbaar', (await p.evaluate(() => document.activeElement.id)) === 'einde-kop' && await p.locator('#einde-volgende').isVisible());
      await p.locator('#einde-nog').click();
      controle('nog een keer: nieuw potje tegen dezelfde tegenstander', (await p.locator('#naam-zij').innerText()) === 'Lavaslak' && await p.locator('#tafel').isVisible());
      await speelUit(p, 'cijfer');
      await p.waitForFunction(() => /Je krijgt 4 munten/.test(document.getElementById('einde-tekst').textContent));
      controle('herhaling geeft 4 munten', (await opslag(p, 'spo_munten')).saldo === 119);
      await p.locator('#einde-volgende').click();
      controle('volgend niveau: niveau 2 (Asgeest)', (await p.locator('#naam-zij').innerText()) === 'Asgeest');
      await p.locator('#opgeven').click();
      controle('opgeven: terug in de wereld, niets bewaard of uitbetaald', await p.locator('#wereld-scherm').isVisible() && (await opslag(p, 'spo_munten')).saldo === 119 && (await opslag(p, 'spo_campagne')).w.exact.s[1] === 0);
      controle('pagina: geen fouten tijdens het hele traject', fouten.length === 0, fouten);
      await ctx.close();
    }
    // 5c. De eindbaas verslaan: wereld voltooid, items, scherm toont de beloning, baaskaart met plaatje
    {
      const voortgang = { v: 1, w: { exact: { s: [1, 1, 1, 1, 0] } }, deck: [], ts: 1 };
      const { ctx, p, fouten } = await nieuwe(br, { zaad: { spo_munten: MUNTEN(0), spo_winkel: { gekocht: [], gebruik: {} }, spo_galerij: sterkeKaarten(8, 'Wiskunde', 9.95, 4), spo_campagne: voortgang } });
      await p.goto(WEB + '/campagne.html'); await p.waitForSelector('.wereld-knop'); await slaap(300);
      await p.locator('.wereld-knop').first().click();
      await p.locator('.niveau-knop').nth(4).click();
      controle('baas: naam, regel en baaskaart met plaatje', (await p.locator('#naam-zij').innerText()) === 'Vulkaandraak' && await p.locator('#baas-regel').isVisible() && (await p.locator('.hun-deck .mk.met-plaatje').count()) === 1 && /baaskaart/.test(await p.locator('.hun-deck .mk.met-plaatje').getAttribute('aria-label')));
      const src = await p.locator('.hun-deck .mk.met-plaatje img').getAttribute('src');
      controle('baaskaart is een getekend plaatje (canvas, geen WebGL)', /^data:image\/png;base64,/.test(src) && src.length > 2000, src.slice(0, 40));
      await speelUit(p, 'cijfer');
      controle('baas verslagen', /Je verslaat Vulkaandraak/.test(await p.locator('#einde-kop').innerText()), await p.locator('#einde-kop').innerText());
      await p.waitForFunction(() => /Wereld voltooid/.test(document.getElementById('einde-tekst').textContent));
      const t = await p.locator('#einde-tekst').innerText();
      controle('beloningstekst noemt titel en kaartkleuren, 60 munten', /Drakendoder/.test(t) && /Vulkaan/.test(t) && /60 munten/.test(t), t);
      controle('geen volgend niveau na de baas', !(await p.locator('#einde-volgende').isVisible()));
      const w = await opslag(p, 'spo_winkel'), c = await opslag(p, 'spo_campagne');
      controle('winkel en voortgang bijgewerkt', w.gekocht.includes('ti-drakendoder') && w.gekocht.includes('kt-vulkaan') && c.w.exact.s[4] >= 1 && (await opslag(p, 'spo_munten')).saldo === 60);
      await p.keyboard.press('Escape');
      controle('Escape sluit het eindscherm en brengt je terug in de wereld', await p.locator('#wereld-scherm').isVisible() && !(await p.locator('#einde').isVisible()));
      await p.locator('#w-terug').click();
      controle('overzicht: wereld staat als voltooid', /Voltooid/.test(await p.locator('.wereld-knop').first().innerText()) && /1 van 4 werelden voltooid/.test(await p.locator('#k-voortgang').innerText()));
      controle('pagina: geen fouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    // 5d. Verliezen levert niets op; minder beweging; toetsenbord
    {
      const { ctx, p, fouten } = await nieuwe(br, { beweging: 'reduce', zaad: { spo_munten: MUNTEN(50), spo_galerij: Array.from({ length: 6 }, (_, i) => ({ id: 'z' + i, ts: i, vak: 'Muziek', cijfer: 2, onderwerp: 'T', weging: 1, opening: 'pak', tier: 0, zeldzaam: false, trede: 0, kaart: kaartPlaat })), spo_campagne: { v: 1, w: { kunst: { s: [1, 1, 1, 1, 0] } }, deck: [], ts: 1 } } });
      await p.goto(WEB + '/campagne.html'); await p.waitForSelector('.wereld-knop'); await slaap(300);
      await p.locator('.wereld-knop').nth(3).click();
      await p.locator('.niveau-knop').nth(4).click();
      const t0 = Date.now();
      // toetsenbord: 2 kiest Ladder, daarna 1 speelt de eerste kaart
      let klaar = false;
      while (Date.now() - t0 < 40000 && !klaar) {
        if (await p.locator('#einde').isVisible()) { klaar = true; break; }
        if (await p.locator('#vgl-knoppen').isVisible()) { await p.keyboard.press('2'); await slaap(100); continue; }
        const vrij = await p.evaluate(() => [...document.querySelectorAll('.hand-kaart')].findIndex((b) => !b.disabled));
        if (vrij >= 0) { await p.keyboard.press(String(vrij + 1)); await slaap(100); continue; }
        await slaap(60);
      }
      controle('met toetsenbord en minder beweging snel uitgespeeld', klaar && Date.now() - t0 < 30000, Date.now() - t0);
      controle('verloren: geen sterren, geen munten, baas blijft open', /wint/.test(await p.locator('#einde-kop').innerText()) && (await opslag(p, 'spo_munten')).saldo === 50 && (await opslag(p, 'spo_campagne')).w.kunst.s[4] === 0 && !(await p.locator('#einde-volgende').isVisible()), await p.locator('#einde-kop').innerText());
      controle('geen fouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    // 5e. Het tabblad in het paneel
    {
      const { ctx, p } = await nieuwe(br, { breed: 1100, hoog: 800, zaad: { spo_munten: MUNTEN(100), spo_galerij: gewoneKaarten(8), spo_rondleiding: 1, spo_nieuw_gezien: '2.4.4', spo_vrienden: VRIENDEN, spo_account: { email: 't@t.nl', sessie: 's', account: 'a', sleutel: 'k', laatsteBackup: 1 } } });
      await p.goto(WEB + '/hub.html'); await p.waitForSelector('#tab-campagne'); await slaap(900);
      controle('hub: tabblad Campagne staat in de lijst', await p.evaluate(() => { const t = [...document.querySelectorAll('#tabs [role=tab]')].map((b) => b.id); return t.includes('tab-campagne') && t.indexOf('tab-campagne') === t.indexOf('tab-team') + 1; }));
      await p.click('#tab-campagne'); await slaap(900);
      controle('hub: het tabblad toont de pagina in een iframe', (await p.locator('#tab-campagne').getAttribute('aria-selected')) === 'true' && (await p.locator('#paneel-campagne iframe').getAttribute('src')) === 'campagne.html?embed=1');
      const f = p.frameLocator('#paneel-campagne iframe');
      controle('hub: de campagne werkt in het paneel', (await f.locator('#saldo').innerText()) === '100' && (await f.locator('.wereld-knop').count()) === 4);
      await p.focus('#tab-campagne'); await p.keyboard.press('ArrowUp');
      controle('hub: pijltje omhoog van Campagne naar Team', (await p.evaluate(() => document.activeElement.id)) === 'tab-team');
      await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
      controle('hub: pijltje omlaag van Campagne naar Vrienden', (await p.evaluate(() => document.activeElement.id)) === 'tab-vrienden');
      await ctx.close();
    }
    // 5f. Bestanden
    {
      const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
      controle('manifest: campagne.html is bereikbaar vanuit het paneel', man.web_accessible_resources.some((r) => r.resources.includes('campagne.html')));
      const data = require(EXT + '/nieuw-data.js');
      const v3 = data.find((x) => x.versie === '3.0.0');
      controle('wat is nieuw: 3.0.0 noemt de Campagne en blijft op hooguit 6 punten van hooguit 220 tekens', v3.punten.length <= 6 && v3.punten.some((x) => /Campagne/.test(x)) && v3.punten.every((x) => x.length <= 220), v3.punten.length);
      const bron = ['campagne.js', 'campagnelib.js', 'campagne-art.js', 'campagne.html'].map((f2) => fs.readFileSync(path.join(EXT, f2), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
      controle('het woord van de school-site komt nergens voor (buiten de uitleg in de code)', !/somtoday/i.test(bron));
      controle('geen innerHTML en geen WebGL in de campagne', !/innerHTML|insertAdjacentHTML|webgl|THREE/i.test(bron));
      const html = fs.readFileSync(path.join(EXT, 'campagne.html'), 'utf8');
      controle('geen tekstveld zonder data-tekstfilter (er zijn er geen)', !/<(input|textarea)\b/i.test(html) || /data-tekstfilter/.test(html));
    }
  } finally {
    await br.close(); web.kill();
  }
}
