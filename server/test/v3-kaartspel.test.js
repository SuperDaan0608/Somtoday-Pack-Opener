// Het Kaartspel (kaartspellib.js, economie.js kaartspelKlaar, kaartspel.html) en het tabblad in het paneel, in headless Chromium met een nagemaakte chrome.storage.
// Gebruik: node server/test/v3-kaartspel.test.js   (start zelf een kleine webserver op poort 8128; NODE_PATH moet naar de globale modules wijzen)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const EXT = path.resolve(__dirname, '../../extension');
const K = require(EXT + '/kaartspellib.js');
const WEB = 'http://localhost:8128';
const SERVER = 'https://jummysnacks.nl/api.php';
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const VRIENDEN = { server: SERVER, id: 'ab'.repeat(16), token: 'geheim-token', privJwk: {}, pub: 'p', vrienden: [] };
const MUNTEN = (saldo) => ({ v: 1, init: true, saldo, totaal: 500, gev: { w: 0, g: 0, v: 0 }, ts: 1 });
const VAKKEN = ['Wiskunde', 'Engels', 'Geschiedenis', 'Muziek', 'Biologie', 'Frans', 'Economie', 'LO'];
const kaarten = (n) => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, ts: 1000 + i, vak: VAKKEN[i % 8], cijfer: 5 + (i % 5), onderwerp: 'T', weging: 1, opening: 'pak', tier: 1, zeldzaam: false, trede: 0, kaart: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }));
const kaart = (vak, cijfer, t = 0) => ({ vak, cijfer, tier: 1, t, z: t > 0, v: false, h: false });
const NEP_CHROME = ({ zaad }) => {
  const P = 'mock:';
  if (!localStorage.getItem(P + '__klaar')) {
    localStorage.setItem(P + '__klaar', '1');
    for (const [k, v] of Object.entries(zaad)) localStorage.setItem(P + k, JSON.stringify(v));
  }
  const luisteraars = [];
  const lees = (k) => { const t = localStorage.getItem(P + k); return t == null ? undefined : JSON.parse(t); };
  const sleutels = (s) => (s == null ? Object.keys(localStorage).filter((x) => x.startsWith(P) && x !== P + '__klaar').map((x) => x.slice(P.length)) : [].concat(typeof s === 'object' && !Array.isArray(s) ? Object.keys(s) : s));
  const local = {
    async get(s) { const r = {}; for (const k of sleutels(s)) { const v = lees(k); if (v !== undefined) r[k] = v; } return r; },
    async set(o) { const w = {}; for (const [k, v] of Object.entries(o)) { w[k] = { oldValue: lees(k), newValue: v }; localStorage.setItem(P + k, JSON.stringify(v)); } luisteraars.forEach((f) => f(w, 'local')); },
    async remove(s) { for (const k of [].concat(s)) localStorage.removeItem(P + k); },
  };
  window.chrome = { storage: { local, onChanged: { addListener: (f) => luisteraars.push(f) } }, runtime: { getManifest: () => ({ version: '3.0.0' }), id: 'nep', sendMessage: () => Promise.resolve() } };
};
async function nieuw(br, { zaad = {}, beweging = 'no-preference', breed = 900, hoog = 900, drop } = {}) {
  const ctx = await br.newContext({ viewport: { width: breed, height: hoog }, reducedMotion: beweging });
  await ctx.addInitScript(NEP_CHROME, { zaad });
  const verzoeken = [];
  await ctx.route(/jummysnacks\.nl/, async (route) => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body = {}; try { body = JSON.parse(r.postData() || '{}'); } catch (e) { /* leeg */ }
    verzoeken.push({ body, headers: r.headers() });
    if (body.a === 'dropTelling' && drop) return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(drop) });
    return route.abort();
  });
  const p = await ctx.newPage();
  const fouten = [];
  p.on('pageerror', (e) => fouten.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/jummysnacks|ERR_FAILED|Failed to load resource/.test(m.text())) fouten.push(m.text()); });
  return { ctx, p, fouten, verzoeken };
}
const opslag = (p, k) => p.evaluate((x) => { const t = localStorage.getItem('mock:' + x); return t == null ? undefined : JSON.parse(t); }, k);
const saldo = async (p) => (await opslag(p, 'spo_munten')).saldo;

// Speelt een heel potje door de knoppen te gebruiken (net als een mens met het toetsenbord).
async function speelUit(p, maxMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await p.locator('#einde').isVisible()) return true;
    if (await p.locator('#vgl-knoppen').isVisible()) { await p.locator('.vgl-knop').first().click(); await slaap(100); continue; }
    const k = p.locator('.hand-kaart:not(:disabled)');
    if ((await k.count()) > 0) { await k.first().click(); await slaap(100); continue; }
    await slaap(80);
  }
  return false;
}

// ───────── 1. De spelregels (zonder pagina) ─────────
{
  const hoog = kaart('Wiskunde', 9), laag = kaart('Engels', 5);
  controle('cijfer: hoger wint, lager verliest, gelijk is gelijk', K.vergelijk(hoog, laag, 'cijfer') === 1 && K.vergelijk(laag, hoog, 'cijfer') === -1 && K.vergelijk(hoog, kaart('Natuurkunde', 9), 'cijfer') === 0);
  controle('ladder: een hogere trede wint ook met een lager cijfer', K.vergelijk(kaart('Engels', 6, 3), kaart('Wiskunde', 9, 0), 'ladder') === 1);
  controle('cijfer negeert de trede', K.vergelijk(kaart('Engels', 6, 3), kaart('Wiskunde', 9, 0), 'cijfer') === -1);
  const ex = kaart('Wiskunde', 5), ta = kaart('Engels', 9), me = kaart('Geschiedenis', 5), ku = kaart('Muziek', 5);
  controle('groep: Exact slaat Talen ondanks lager cijfer', K.vergelijk(ex, ta, 'groep') === 1 && K.vergelijk(ta, ex, 'groep') === -1);
  controle('groep: Talen slaat Mens, Mens slaat Kunst, Kunst slaat Exact', K.vergelijk(ta, me, 'groep') === 1 && K.vergelijk(me, ku, 'groep') === 1 && K.vergelijk(ku, ex, 'groep') === 1);
  controle('groep: Exact tegen Mens (niet aangrenzend) en dezelfde groep: hoogste cijfer', K.vergelijk(kaart('Wiskunde', 8), me, 'groep') === 1 && K.vergelijk(kaart('Wiskunde', 4), kaart('Biologie', 6), 'groep') === -1);
  controle('groep: onbekend vak valt terug op cijfer', K.vergelijk(kaart('Kokkerellen', 8), ta, 'groep') === -1);
  // een potje: beste van 5, eerst 3
  const deck = (c) => [c, c, c, c, c].map((x, i) => kaart(VAKKEN[i], x + i * 0.1));
  const p = K.nieuwPotje(deck(9), deck(5), 'ik');
  controle('kiezer wisselt af (ik, zij, ik...)', K.kiezer(p, 0) === 'ik' && K.kiezer(p, 1) === 'zij' && K.kiezer(p, 2) === 'ik');
  let n = 0; while (!K.eind(p)) { K.speelRonde(p, 'cijfer', K.over(p, 'ik')[0], K.over(p, 'zij')[0]); n++; }
  controle('wie het eerst 3 wint, stopt het potje (3 rondes)', n === 3 && p.score.ik === 3 && K.uitslag(p) === 'w', [n, p.score]);
  controle('een kaart mag maar één keer, ook niet buiten het deck', K.speelRonde(K.nieuwPotje(deck(5), deck(5), 'ik'), 'cijfer', 9, 0) === null && K.speelRonde(K.nieuwPotje(deck(5), deck(5), 'ik'), 'onzin', 0, 0) === null);
  const q = K.nieuwPotje(deck(5), deck(5), 'ik'); K.speelRonde(q, 'cijfer', 0, 0);
  controle('een gespeelde kaart kan niet nog eens', K.speelRonde(q, 'cijfer', 0, 1) === null && K.over(q, 'ik').length === 4);
  const gelijk = K.nieuwPotje([1, 2, 3, 4, 5].map(() => kaart('Wiskunde', 7)), [1, 2, 3, 4, 5].map(() => kaart('Wiskunde', 7)), 'zij');
  while (!K.eind(gelijk)) K.speelRonde(gelijk, 'cijfer', K.over(gelijk, 'ik')[0], K.over(gelijk, 'zij')[0]);
  controle('5 gelijke rondes is gelijkspel (na 5 rondes)', K.uitslag(gelijk) === 'g' && gelijk.r === 5);
  // computer
  let s = 1; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cd = K.maakComputerDeck(rng, deck(7));
  controle('computerdeck: 5 geldige kaarten met verschillende vakken', K.schoonDeck(cd) && new Set(cd.map((k) => k.vak)).size === 5, cd);
  let w = 0, v = 0;
  for (let g = 0; g < 200; g++) {
    const pp = K.nieuwPotje(deck(7), K.maakComputerDeck(rng, deck(7)), g % 2 ? 'ik' : 'zij');
    while (!K.eind(pp)) {
      let vgl, i, j;
      if (K.kiezer(pp) === 'zij') { const c = K.computerKiest(pp, rng); vgl = c.vgl; j = c.j; i = K.over(pp, 'ik')[Math.floor(rng() * K.over(pp, 'ik').length)]; }
      else { vgl = K.VGL_IDS[Math.floor(rng() * 3)]; i = K.over(pp, 'ik')[Math.floor(rng() * K.over(pp, 'ik').length)]; j = K.computerAntwoordt(pp, vgl, rng); }
      K.speelRonde(pp, vgl, i, j);
    }
    const u = K.uitslag(pp); if (u === 'w') w++; if (u === 'v') v++;
  }
  controle('computer wint vaker dan een willekeurige speler maar is te verslaan', v > w && w > 20, [w, v]);
  // schoonmaak
  const mid = 'ab'.repeat(8);
  const goed = [1, 2, 3, 4, 5].map((i) => ({ vak: 'Wis' + i, cijfer: 6.5, tier: 1, t: 0 }));
  controle('schoonBericht: uitnodiging met deck wordt aangenomen', K.schoonBericht({ t: 'ks_uit', mid, deck: goed }, 5) && K.schoonBericht({ t: 'ks_uit', mid, deck: goed }, 5).deck.length === 5);
  controle('schoonBericht: oude uitnodiging (> 5 minuten) wordt geweigerd', K.schoonBericht({ t: 'ks_uit', mid, deck: goed }, 301) === null);
  controle('schoonBericht: verkeerde decklengte, cijfer buiten bereik, raar mid, onbekend type en niet-object', K.schoonBericht({ t: 'ks_uit', mid, deck: goed.slice(1) }, 1) === null && K.schoonBericht({ t: 'ks_ja', mid, deck: goed.map((k) => Object.assign({}, k, { cijfer: 99 })) }, 1) === null && K.schoonBericht({ t: 'ks_stop', mid: '../x' }, 1) === null && K.schoonBericht({ t: 'ks_boem', mid }, 1) === null && K.schoonBericht('tekst', 1) === null && K.schoonBericht(null, 1) === null && K.schoonBericht([], 1) === null);
  controle('schoonBericht: vgl en kaart controleren r, v en i', K.schoonBericht({ t: 'ks_vgl', mid, r: 2, v: 'groep' }, 1).v === 'groep' && K.schoonBericht({ t: 'ks_vgl', mid, r: 2, v: '__proto__' }, 1) === null && K.schoonBericht({ t: 'ks_vgl', mid, r: 7, v: 'groep' }, 1) === null && K.schoonBericht({ t: 'ks_kaart', mid, r: 0, i: 5 }, 1) === null && K.schoonBericht({ t: 'ks_kaart', mid, r: 0, i: 4 }, 1).i === 4 && K.schoonBericht({ t: 'ks_kaart', mid, r: 0, i: '1' }, 1) === null);
  const smerig = K.schoonKaart({ vak: '<img src=x onerror=1>Wis'.padEnd(60, 'x'), cijfer: 7.123, tier: 99, t: -3, v: true, h: true, extra: 'x' });
  controle('schoonKaart: tekens en lengte beperkt, niveaus begrensd, geen extra velden, v en h niet allebei', smerig && !/[<>]/.test(smerig.vak) && smerig.vak.length <= 24 && smerig.tier === 4 && smerig.t === 0 && !('extra' in smerig) && !(smerig.v && smerig.h), smerig);
}

(async () => {
  const web = spawn(process.execPath, [path.join(process.env.NODE_PATH || '', 'http-server/bin/http-server'), '-p', '8128', '-s', '-c-1', EXT], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(WEB + '/kaartspel.html'); break; } catch (e) { await slaap(100); } }
  const br = await chromium.launch();
  try {
    // ───────── 2. Pagina, deck kiezen en toegankelijkheid ─────────
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/kaartspel.html'); await p.waitForSelector('#saldo'); await slaap(400);
      controle('pagina: saldo 100 en 5 potjes over', (await p.locator('#saldo').innerText()) === '100' && /Vandaag nog 5 van 5/.test(await p.locator('#dag-info').innerText()), await p.locator('#dag-info').innerText());
      controle('pagina: taal nl, één h1, geen fouten', (await p.locator('html').getAttribute('lang')) === 'nl' && (await p.locator('h1').count()) === 1 && fouten.length === 0, fouten);
      controle('pagina: start-knop uit zonder deck, 8 kaarten in de lijst', (await p.locator('#start-pc').isDisabled()) && (await p.locator('.kies-kaart').count()) === 8);
      controle('pagina: geen tekstvelden', (await p.locator('input, textarea, [contenteditable]').count()) === 0);
      const naamloos = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
      controle('alle knoppen hebben een naam', naamloos === 0, naamloos);
      await p.locator('.kies-kaart').nth(0).click();
      controle('een kaart kiezen: aria-pressed en teller', (await p.locator('.kies-kaart[aria-pressed="true"]').count()) === 1 && /1 van 5/.test(await p.locator('#deck-stand').innerText()));
      await p.click('#deck-beste');
      controle('Kies mijn beste 5: 5 gekozen, andere kaarten uit en start-knop aan', /5 van 5/.test(await p.locator('#deck-stand').innerText()) && (await p.locator('.kies-kaart:disabled').count()) === 3 && (await p.locator('#start-pc').isEnabled()));
      await p.reload(); await p.waitForSelector('#saldo'); await slaap(400);
      controle('het deck blijft bewaard na herladen', /5 van 5/.test(await p.locator('#deck-stand').innerText()));
      await p.click('#deck-leeg');
      controle('deck leegmaken', /0 van 5/.test(await p.locator('#deck-stand').innerText()) && (await p.locator('#start-pc').isDisabled()));
      await p.focus('#kies .kies-kaart'); await p.keyboard.press('Space');
      controle('toetsenbord: spatie kiest een kaart', (await p.locator('.kies-kaart[aria-pressed="true"]').count()) === 1);
      await ctx.close();
    }

    // ───────── 3. Een heel potje tegen de computer, met beloning en limiet ─────────
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: kaarten(8) }, beweging: 'reduce' });
      await p.goto(WEB + '/kaartspel.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('#deck-beste'); await p.click('#start-pc'); await slaap(300);
      controle('tafel: verborgen voorbereiding, vijf kaarten in de hand en bij de computer', (await p.locator('#tafel').isVisible()) && (await p.locator('#voorbereiding').isHidden()) && (await p.locator('.hand-kaart').count()) === 5 && (await p.locator('#hun-deck .mk').count()) === 5);
      controle('tafel: aria-live voor de uitslag van elke ronde', (await p.locator('#tafel-tekst').getAttribute('aria-live')) === 'polite');
      const klaar = await speelUit(p);
      controle('het potje loopt af en toont de uitslag', klaar);
      const kop = await p.locator('#einde-kop').innerText();
      const stand = await p.locator('#einde-stand').innerText();
      const [a, b] = stand.split(' - ').map(Number);
      controle('uitslag: kop past bij de stand, iemand heeft 3 of 5 rondes gespeeld', a >= 0 && b >= 0 && ((a > b && /Je wint/.test(kop)) || (a < b && /wint het potje/.test(kop)) || (a === b && /Gelijkspel/.test(kop))), [kop, stand]);
      controle('focus staat op de uitslag (schermlezer)', await p.evaluate(() => document.activeElement.id) === 'einde-kop');
      const na = await saldo(p);
      const verwacht = a > b ? 12 : a === b ? 5 : 2;
      controle('beloning: munten komen bij het saldo', na === 100 + verwacht, [na, verwacht]);
      controle('de melding noemt de munten', new RegExp(`${verwacht} munten`).test(await p.locator('#einde-tekst').innerText()), await p.locator('#einde-tekst').innerText());
      controle('geen fouten in de console', fouten.length === 0, fouten);
      // Nog 4 potjes: daarna geen munten meer
      for (let n = 0; n < 5; n++) {
        await p.click('#einde-nog'); await slaap(200);
        if (!(await speelUit(p))) { controle('potje ' + (n + 2) + ' loopt af', false); break; }
      }
      const eind = await saldo(p);
      const ids = await opslag(p, 'spo_munten_ids');
      controle('dagelijkse limiet: precies 5 potjes betaald (ks:-sleutels)', Object.keys(ids).filter((k) => /^ks:/.test(k)).length === 5, Object.keys(ids));
      controle('na 5 potjes staat er dat de limiet bereikt is', /geen munten meer/.test(await p.locator('#einde-tekst').innerText()), await p.locator('#einde-tekst').innerText());
      const log = await opslag(p, 'spo_munten_log');
      controle('het saldo steeg met 5 potjes, hoogstens 5 x 12', eind > 100 && eind <= 100 + 60, eind);
      await p.click('#einde-terug'); await slaap(200);
      controle('terug naar het deck: voorbereiding zichtbaar, info over de limiet', (await p.locator('#voorbereiding').isVisible()) && /alle 5 potjes/.test(await p.locator('#dag-info').innerText()), await p.locator('#dag-info').innerText());
      await ctx.close();
    }

    // ───────── 4. Toetsenbord, opgeven en geen beloning ─────────
    {
      const { ctx, p } = await nieuw(br, { zaad: { spo_munten: MUNTEN(50), spo_galerij: kaarten(8) }, beweging: 'reduce' });
      await p.goto(WEB + '/kaartspel.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('#deck-beste'); await p.click('#start-pc'); await slaap(1500);
      // Ronde 1: ofwel ik kies de vergelijking, ofwel de computer. Wacht tot een van de twee klaar staat.
      for (let i = 0; i < 60 && !(await p.locator('#vgl-knoppen').isVisible()) && (await p.locator('.hand-kaart:not(:disabled)').count()) === 0; i++) await slaap(100);
      if (await p.locator('#vgl-knoppen').isVisible()) {
        controle('vergelijkingsknoppen: drie knoppen met sneltoets en uitleg', (await p.locator('.vgl-knop').count()) === 3 && (await p.locator('.vgl-knop').first().getAttribute('aria-keyshortcuts')) === '1');
        controle('het eerste knopje heeft de focus', await p.evaluate(() => document.activeElement.classList.contains('vgl-knop')));
        controle('de hand is nog uit tot je een vergelijking kiest', (await p.locator('.hand-kaart:not(:disabled)').count()) === 0);
        await p.keyboard.press('2');
      }
      for (let i = 0; i < 60 && (await p.locator('.hand-kaart:not(:disabled)').count()) === 0; i++) await slaap(100);
      controle('na de vergelijking staat de badge op tafel', (await p.locator('#vgl-badge').innerText()).length > 2, await p.locator('#vgl-badge').innerText());
      await p.keyboard.press('3'); await slaap(1500);
      controle('cijfertoets speelt kaart 3: die kaart is weg uit de hand en staat op tafel', (await p.locator('#hand-2.gespeeld').count()) === 1 && (await p.locator('#slot-ik .mk').count()) === 1 && (await p.locator('#slot-zij .mk:not(.rug)').count()) === 1);
      controle('score en tekst zijn bijgewerkt', /Ronde 1/.test(await p.locator('#tafel-tekst').innerText()), await p.locator('#tafel-tekst').innerText());
      await p.click('#opgeven'); await slaap(400);
      controle('opgeven: potje gestopt en geen munten', /gestopt/.test(await p.locator('#einde-kop').innerText()) && (await saldo(p)) === 50);
      const ids = await opslag(p, 'spo_munten_ids');
      controle('opgeven: de dagelijkse teller blijft 0', !ids || Object.keys(ids).filter((k) => /^ks/.test(k)).length === 0);
      await ctx.close();
    }

    // ───────── 5. Uitnodigingen en een potje tegen een vriend (nagebootst kanaal) ─────────
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(0), spo_galerij: kaarten(8) }, beweging: 'reduce' });
      await p.goto(WEB + '/kaartspel.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('#deck-beste');
      const vriend = { id: 'cd'.repeat(16), status: 'vriend', alias: 'Sam', pub: 'x', deel: { modus: 'alles' } };
      await p.evaluate((v) => {
        window.__verstuurd = [];
        globalThis.SPOVrienden.stuurBericht = async (st, to, m) => { window.__verstuurd.push({ aan: to.id, m }); };
        globalThis.SPOKaartspelUI.zetSt({ id: 'ab'.repeat(16), vrienden: [v] });
      }, vriend);
      controle('vriendenlijst: een vriend met Uitdagen-knop', (await p.locator('#vrienden li').count()) === 1 && (await p.locator('#vrienden button').innerText()) === 'Uitdagen' && (await p.locator('#vrienden button').isEnabled()));
      // 5a. ik daag uit
      await p.click('#vrienden button'); await slaap(200);
      const uit = await p.evaluate(() => window.__verstuurd.slice());
      controle('uitdagen stuurt ks_uit met 5 kaarten zonder plaatje of id', uit.length === 1 && uit[0].m.t === 'ks_uit' && uit[0].m.deck.length === 5 && !JSON.stringify(uit[0].m).includes('data:') && !('id' in uit[0].m.deck[0]), JSON.stringify(uit));
      controle('wachtbericht met Annuleren', /Wachten tot Sam/.test(await p.locator('#uitnodigingen').innerText()));
      const mid = uit[0].m.mid;
      const hun = [9, 8, 7, 6, 5].map((c, i) => ({ vak: VAKKEN[i], cijfer: c, tier: 2, t: 0, v: false, h: false }));
      // 5b. een vreemd bericht met de verkeerde mid verandert niets
      await p.evaluate(({ v, hun }) => globalThis.SPOKaartspelUI.opBerichten(v.id, [{ m: { t: 'ks_ja', mid: 'ef'.repeat(8), deck: hun }, leeftijd: 1 }]), { v: vriend, hun });
      controle('een ks_ja met een andere mid start niets', (await p.locator('#tafel').isHidden()));
      // 5c. de vriend accepteert: het potje begint, ik kies als eerste
      await p.evaluate(({ v, hun, mid }) => globalThis.SPOKaartspelUI.opBerichten(v.id, [{ m: { t: 'ks_ja', mid, deck: hun }, leeftijd: 1 }]), { v: vriend, hun, mid });
      await slaap(300);
      controle('na ks_ja zit ik aan tafel en kies ik de vergelijking', (await p.locator('#tafel').isVisible()) && (await p.locator('#vgl-knoppen').isVisible()) && (await p.locator('#naam-zij').innerText()).length > 0);
      // Speel 3 rondes: de vriend (met een 9 als sterkste) antwoordt steeds met kaart 0..; ik speel mijn kaarten. Het resultaat volgt de regels.
      const gespeeld = [];
      for (let r = 0; r < 5; r++) {
        if (await p.locator('#einde').isVisible()) break;
        const kz = r % 2 === 0 ? 'ik' : 'zij';
        if (kz === 'ik') {
          for (let i = 0; i < 80 && !(await p.locator('#vgl-knoppen').isVisible()); i++) await slaap(60);
          await p.locator('.vgl-knop').nth(0).click();
        } else {
          await p.evaluate(({ v, mid, r }) => globalThis.SPOKaartspelUI.opBerichten(v.id, [{ m: { t: 'ks_vgl', mid, r, v: 'cijfer' }, leeftijd: 0 }]), { v: vriend, mid, r });
        }
        for (let i = 0; i < 80 && (await p.locator('.hand-kaart:not(:disabled)').count()) === 0; i++) await slaap(60);
        await p.locator('.hand-kaart:not(:disabled)').first().click();
        await p.evaluate(({ v, mid, r }) => globalThis.SPOKaartspelUI.opBerichten(v.id, [{ m: { t: 'ks_kaart', mid, r, i: r }, leeftijd: 0 }]), { v: vriend, mid, r });
        gespeeld.push(r);
        await slaap(600);
        for (let i = 0; i < 60 && !(await p.locator('#einde').isVisible()) && !/Ronde \d, /.test(await p.locator('#tafel-tekst').innerText()); i++) await slaap(60);
        await slaap(400);
      }
      for (let i = 0; i < 80 && !(await p.locator('#einde').isVisible()); i++) await slaap(100);
      controle('het vriendenpotje eindigt met een uitslag', await p.locator('#einde').isVisible(), await p.locator('#tafel-tekst').innerText());
      const verstuurd = await p.evaluate(() => window.__verstuurd.map((x) => x.m.t));
      controle('ik stuurde ks_vgl (rondes 1, 3, 5) en ks_kaart voor elke ronde', verstuurd.filter((t) => t === 'ks_kaart').length === gespeeld.length && verstuurd.filter((t) => t === 'ks_vgl').length >= 1, verstuurd);
      const stand = (await p.locator('#einde-stand').innerText()).split(' - ').map(Number);
      controle('de uitslag en de beloning kloppen', (await saldo(p)) === (stand[0] > stand[1] ? 12 : stand[0] === stand[1] ? 5 : 2), [stand, await saldo(p)]);
      controle('geen fouten in de console', fouten.length === 0, fouten);
      await p.click('#einde-terug'); await slaap(200);
      // 5d. binnenkomende uitnodiging
      const hun2 = hun.map((k) => Object.assign({}, k, { vak: '<b>' + k.vak }));
      await p.evaluate(({ v, hun2 }) => globalThis.SPOKaartspelUI.opBerichten(v.id, [{ m: { t: 'ks_uit', mid: '12'.repeat(8), deck: hun2 }, leeftijd: 3 }, { m: { t: 'ks_uit', mid: '34'.repeat(8), deck: hun2.slice(1) }, leeftijd: 3 }, { m: { t: 'ks_uit', mid: '56'.repeat(8), deck: hun2 }, leeftijd: 400 }]), { v: vriend, hun2 });
      controle('alleen de geldige, verse uitnodiging verschijnt', (await p.locator('.uitn').count()) === 1 && /Sam daagt je uit/.test(await p.locator('.uitn').innerText()), await p.locator('#uitnodigingen').innerText());
      await p.evaluate(() => { window.__verstuurd.length = 0; });
      await p.getByRole('button', { name: /Uitdaging van Sam accepteren/ }).click(); await slaap(300);
      const ja = await p.evaluate(() => window.__verstuurd.slice());
      controle('accepteren stuurt ks_ja en ik zit aan tafel; de uitdager kiest eerst', ja.length === 1 && ja[0].m.t === 'ks_ja' && ja[0].m.mid === '12'.repeat(8) && (await p.locator('#tafel').isVisible()) && /Sam kiest|Wachten tot/.test(await p.locator('#tafel-tekst').innerText()), [JSON.stringify(ja).slice(0, 80), await p.locator('#tafel-tekst').innerText()]);
      controle('tekens uit de kaartnaam van een vriend worden niet als HTML gezien', (await p.locator('#hun-deck b').count()) === 0 && (await p.locator('#hun-deck .mk').count()) === 5);
      // 5e. de vriend stopt
      await p.evaluate(({ v }) => globalThis.SPOKaartspelUI.opBerichten(v.id, [{ m: { t: 'ks_stop', mid: '12'.repeat(8) }, leeftijd: 0 }]), { v: vriend });
      await slaap(400);
      controle('als de vriend stopt eindigt het potje zonder munten', /gestopt/.test(await p.locator('#einde-kop').innerText()) && /verlaten/.test(await p.locator('#einde-tekst').innerText()), await p.locator('#einde-tekst').innerText());
      await ctx.close();
    }

    // ───────── 6. Het tabblad in het paneel ─────────
    {
      const { ctx, p } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: kaarten(8), spo_vrienden: VRIENDEN } });
      await p.goto(WEB + '/hub.html'); await p.waitForSelector('#tab-kaartspel'); await slaap(900);
      controle('hub: tabblad Kaartspel bestaat tussen Arcade en Winkel', await p.evaluate(() => { const t = [...document.querySelectorAll('#tabs [role=tab]')].map((b) => b.id); return t.indexOf('tab-kaartspel') === t.indexOf('tab-arcade') + 1 && t.indexOf('tab-winkel') === t.indexOf('tab-kaartspel') + 1; }));
      await p.click('#tab-kaartspel'); await slaap(900);
      controle('hub: het tabblad toont de pagina in een iframe', (await p.locator('#tab-kaartspel').getAttribute('aria-selected')) === 'true' && (await p.locator('#paneel-kaartspel iframe').getAttribute('src')) === 'kaartspel.html?embed=1');
      const f = p.frameLocator('#paneel-kaartspel iframe');
      controle('hub: het kaartspel werkt in het paneel', (await f.locator('#saldo').innerText()) === '100' && (await f.locator('.kies-kaart').count()) === 8);
      await p.focus('#tab-arcade'); await p.keyboard.press('ArrowDown'); await slaap(300);
      controle('hub: pijltje omlaag van Arcade naar Kaartspel', (await p.evaluate(() => document.activeElement.id)) === 'tab-kaartspel');
      await ctx.close();
    }

    // ───────── 7. Bestanden: manifest, teksten en strafschop onaangeroerd ─────────
    {
      const man = JSON.parse(fs.readFileSync(EXT + '/manifest.json', 'utf8'));
      controle('manifest: kaartspel.html is bereikbaar vanuit het paneel', man.web_accessible_resources.some((r) => r.resources.includes('kaartspel.html')));
      const data = require(EXT + '/nieuw-data.js');
      const v3 = data.find((x) => x.versie === '3.0.0');
      controle('wat is nieuw: 3.0.0 noemt het Kaartspel en blijft op hooguit 6 punten', v3.punten.length <= 6 && v3.punten.some((t) => /Kaartspel/.test(t)), v3.punten.length);
      const bron = ['kaartspel.js', 'kaartspellib.js', 'kaartspel.html'].map((f) => fs.readFileSync(path.join(EXT, f), 'utf8')).join('\n');
      controle('de naam van de school-site staat nergens in de kaartspel-bestanden', !/somtoday/i.test(bron));
      controle('kaartspel.js zet vriendendata alleen via textContent op het scherm (geen innerHTML)', !/innerHTML|insertAdjacentHTML/.test(bron));
    }
  } finally {
    await br.close(); web.kill();
  }
  console.log(`v3-kaartspel.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
