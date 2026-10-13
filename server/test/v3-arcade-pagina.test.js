// De Arcade-hoek (arcade.html), het tabblad in het paneel en de wekelijkse-drop-regel in het Overzicht, in headless Chromium met een nagemaakte chrome.storage.
// Gebruik: node server/test/v3-arcade-pagina.test.js   (start zelf een kleine webserver op poort 8127; NODE_PATH moet naar de globale modules wijzen)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const EXT = path.resolve(__dirname, '../../extension');
const AR = require(EXT + '/arcadelib.js');
const WEB = 'http://localhost:8127';
const SERVER = 'https://jummysnacks.nl/api.php';
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const VRIENDEN = { server: SERVER, id: 'ab'.repeat(16), token: 'geheim-token', privJwk: {}, pub: 'p', vrienden: [] };
const MUNTEN = (saldo) => ({ v: 1, init: true, saldo, totaal: 500, gev: { w: 0, g: 0, v: 0 }, ts: 1 });
const kaarten = (n) => Array.from({ length: n }, (_, i) => ({ id: 'k' + i, ts: 1000 + i, vak: ['Wiskunde', 'Engels', 'Frans', 'Duits', 'Biologie', 'Geschiedenis', 'Latijn', 'Economie'][i % 8], cijfer: 5 + (i % 5), onderwerp: 'T', weging: 1, opening: 'pak', tier: 1, zeldzaam: false, trede: 0 }));
const lokaleDag = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

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
  window.chrome = { storage: { local, onChanged: { addListener: (f) => luisteraars.push(f) } }, runtime: { getManifest: () => ({ version: '2.4.4' }), id: 'nep', sendMessage: () => Promise.resolve() } };
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
const meldingTekst = (p) => p.locator('#melding').innerText();

(async () => {
  const web = spawn(process.execPath, [path.join(process.env.NODE_PATH || '', 'http-server/bin/http-server'), '-p', '8127', '-s', '-c-1', EXT], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(WEB + '/arcade.html'); break; } catch (e) { await slaap(100); } }
  const br = await chromium.launch();
  try {
    // ───────── 1. Pagina, toetsenbord en toegankelijkheid ─────────
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html');
      await p.waitForSelector('#saldo');
      await slaap(300);
      controle('pagina: saldo 100 en 10 spellen over', (await p.locator('#saldo').innerText()) === '100' && /Vandaag nog 10 van 10/.test(await p.locator('#dag-info').innerText()), await p.locator('#dag-info').innerText());
      controle('pagina: geen fouten bij laden', fouten.length === 0, fouten);
      controle('pagina: taal nl en één h1', (await p.locator('html').getAttribute('lang')) === 'nl' && (await p.locator('h1').count()) === 1);
      controle('spelkeuze: vier knoppen met aria-pressed, Memory actief', (await p.locator('.spelknop').count()) === 4 && (await p.locator('.spelknop[aria-pressed="true"]').count()) === 1 && (await p.locator('#spel-memory').isVisible()) && (await p.locator('#spel-hoger').isHidden()));
      const naamloos = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
      controle('alle knoppen hebben een naam', naamloos === 0, naamloos);
      controle('geen tekstvelden op de pagina', (await p.locator('input, textarea, [contenteditable]').count()) === 0);
      controle('het rad is verborgen voor schermlezers (de tekst staat er al)', (await p.locator('.rad-wrap').getAttribute('aria-hidden')) === 'true');
      // toetsenbord: Tab komt langs de skip-link en de spelknoppen; spatie kiest een spel
      await p.keyboard.press('Tab');
      controle('Tab 1: skip-link', await p.evaluate(() => document.activeElement.className) === 'skip');
      await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
      controle('Tab 3: tweede spelknop (Hoger of lager)', await p.evaluate(() => document.activeElement.dataset.spel) === 'hoger');
      await p.keyboard.press('Space');
      controle('spatie kiest het spel', (await p.locator('#spel-hoger').isVisible()) && (await p.locator('#spel-memory').isHidden()) && (await p.locator('.spelknop[data-spel="hoger"]').getAttribute('aria-pressed')) === 'true');
      const focusStijl = await p.evaluate(() => { const b = document.querySelector('.spelknop'); b.focus(); return getComputedStyle(b).outlineStyle; });
      controle('focus is zichtbaar', focusStijl !== 'none', focusStijl);
      await ctx.close();
    }

    // ───────── 2. Memory ─────────
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.focus('#memory-start'); await p.keyboard.press('Enter'); await slaap(300);
      controle('memory: inzet 5 afgeschreven', (await saldo(p)) === 95 && (await p.locator('#saldo').innerText()) === '95', await saldo(p));
      controle('memory: 12 kaarten, allemaal dicht met een naam', (await p.locator('.mem').count()) === 12 && (await p.locator('.mem[aria-label*="dicht"]').count()) === 12);
      controle('memory: tweede spel starten kan niet tijdens het spel', await p.locator('#memory-start').isDisabled() && await p.locator('.spelknop').first().isDisabled());
      // Eerst alles leren (steeds twee omdraaien), dan de paren pakken.
      const labels = new Array(12).fill('');
      const geef = async (i) => { await p.locator('.mem').nth(i).click(); return (await p.locator('.mem').nth(i).getAttribute('aria-label')).replace(/^Kaart \d+ van 12, /, ''); };
      for (let i = 0; i < 12; i += 2) { labels[i] = await geef(i); labels[i + 1] = await geef(i + 1); await slaap(1050); }
      controle('memory: geopende kaart noemt vak en cijfer', labels.every((l) => /^(open|gevonden): \S+ \d+(,\d)?$/.test(l)), labels.join(' | '));
      const sleutel = labels.map((l) => l.replace(/^[a-z]+: /, ''));
      const gebruikt = new Set();
      let beurten = 6;
      // Paren die tijdens het leren toevallig al raak waren, staan al open (gevonden): die slaan we over.
      const nu = await p.$$eval('.mem', (l) => l.map((b) => b.getAttribute('aria-label')));
      nu.forEach((t, i) => { if (/, gevonden:/.test(t)) gebruikt.add(i); });
      for (let i = 0; i < 12; i++) {
        if (gebruikt.has(i)) continue;
        const j = sleutel.findIndex((s, x) => x !== i && !gebruikt.has(x) && s === sleutel[i]);
        gebruikt.add(i); gebruikt.add(j);
        await p.locator('.mem').nth(i).click(); await p.locator('.mem').nth(j).click(); beurten++;
      }
      await slaap(400);
      const t = await meldingTekst(p);
      controle('memory: alle paren gevonden, melding voorgelezen', new RegExp(`Alle paren gevonden in ${beurten} beurten`).test(t) && new RegExp(`wint ${AR.memoryWinst(beurten)} munt`).test(t), t);
      controle('memory: de uitbetaling volgt uit het aantal beurten (' + beurten + ')', (await saldo(p)) === 95 + AR.memoryWinst(beurten), await saldo(p));
      controle('memory: gevonden kaarten zijn uitgeschakeld', (await p.locator('.mem.klaar').count()) === 12 && (await p.locator('.mem:disabled').count()) === 12);
      controle('memory: daarna weer te starten', await p.locator('#memory-start').isEnabled());
      controle('memory: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    // Memory met te weinig kaarten: geen kosten
    {
      const { ctx, p } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100), spo_galerij: kaarten(5) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('#memory-start'); await slaap(300);
      controle('memory met 5 kaarten: uitleg, geen kosten, geen bord', /minstens 6/.test(await meldingTekst(p)) && (await saldo(p)) === 100 && (await p.locator('.mem').count()) === 0);
      await ctx.close();
    }

    // ───────── 3. Hoger of lager ─────────
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('.spelknop[data-spel="hoger"]');
      await p.click('#hoger-start'); await slaap(300);
      controle('hoger: inzet af en een cijfer zichtbaar', (await saldo(p)) === 95 && /^\d{1,2},\d$/.test(await p.locator('#hoger-cijfer').innerText()), await p.locator('#hoger-cijfer').innerText());
      controle('hoger: Stoppen pas na een goede gok', await p.locator('#hoger-stop').isHidden());
      let goed = 0, einde = false;
      for (let i = 0; i < 6 && !einde; i++) {
        const c = Number((await p.locator('#hoger-cijfer').innerText()).replace(',', '.'));
        await p.click(c >= 5.5 ? '#hoger-lager' : '#hoger-hoger'); await slaap(250);
        einde = await p.locator('#hoger-hoger').isDisabled();
        if (!einde) goed++;
      }
      const w = [0, 6, 8, 10, 12, 16];
      const t = await meldingTekst(p);
      if (!einde) { // we spelen door tot het eindigt: stoppen als er een goede gok is
        controle('hoger: Stoppen verschijnt na een goede gok', await p.locator('#hoger-stop').isVisible());
        await p.click('#hoger-stop'); await slaap(300);
      }
      const nu = await saldo(p);
      controle('hoger: einde, saldo klopt met een uitbetaling uit de tabel', w.some((x) => nu === 95 + x), nu);
      controle('hoger: melding zegt wat er gebeurde', /(wint \d+ munt|niets)/.test(await meldingTekst(p)), await meldingTekst(p));
      controle('hoger: knoppen uit na het einde en daarna opnieuw te starten', await p.locator('#hoger-hoger').isDisabled() && await p.locator('#hoger-start').isEnabled());
      controle('hoger: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }

    // ───────── 4. Kraslot ─────────
    {
      const { ctx, p, fouten } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('.spelknop[data-spel="kras"]');
      await p.click('#kras-start'); await slaap(300);
      controle('kras: inzet af, zes dichte vakjes', (await saldo(p)) === 95 && (await p.locator('.kras').count()) === 6 && (await p.locator('.kras[aria-label*="nog dicht"]').count()) === 6);
      await p.locator('.kras').nth(2).focus(); await p.keyboard.press('Enter');
      controle('kras: Enter krast een vakje open met een naam', (await p.locator('.kras.open').count()) === 1 && /Vakje 3: (Munt|Ster|Klaver|Diamant|Kroon)/.test(await p.locator('.kras').nth(2).getAttribute('aria-label')), await p.locator('.kras').nth(2).getAttribute('aria-label'));
      await p.click('#kras-alles'); await slaap(400);
      const nu = await saldo(p);
      controle('kras: alles open en uitbetaald volgens de tabel', (await p.locator('.kras.open').count()) === 6 && [0, 5, 8, 15, 25, 50].some((x) => nu === 95 + x), nu);
      const namen = await p.$$eval('.kras', (l) => l.map((b) => b.getAttribute('aria-label').replace(/^Vakje \d: /, '')));
      const tel = {}; namen.forEach((n) => { tel[n] = (tel[n] || 0) + 1; });
      const winst = nu - 95, prijzen = { Munt: 5, Ster: 8, Klaver: 15, Diamant: 25, Kroon: 50 };
      const verwacht = Math.max(0, ...Object.entries(tel).filter(([, n]) => n >= 3).map(([naam]) => prijzen[naam]));
      controle('kras: uitbetaling = de drie dezelfde symbolen op het lot', winst === verwacht, JSON.stringify({ tel, winst }));
      controle('kras: melding', /(Drie keer|Geen drie dezelfde)/.test(await meldingTekst(p)), await meldingTekst(p));
      controle('kras: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }

    // ───────── 5. Rad van fortuin (met en zonder animatie) ─────────
    for (const beweging of ['reduce', 'no-preference']) {
      const { ctx, p, fouten } = await nieuw(br, { beweging, zaad: { spo_munten: MUNTEN(100) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('.spelknop[data-spel="rad"]');
      controle(`rad (${beweging}): twaalf vakken getekend`, (await p.locator('#rad path').count()) === 12 && (await p.locator('#rad text').count()) === 12);
      await p.click('#rad-start');
      if (beweging === 'no-preference') { controle('rad: tijdens het draaien kan niet nog eens', await p.locator('#rad-start').isDisabled()); await slaap(4000); } else await slaap(400);
      const nu = await saldo(p);
      controle(`rad (${beweging}): uitbetaling uit het rad`, [0, 2, 3, 5, 8, 10, 20].some((x) => nu === 95 + x), nu);
      controle(`rad (${beweging}): uitslag in de melding`, /Het rad stopt op/.test(await meldingTekst(p)), await meldingTekst(p));
      controle(`rad (${beweging}): weer te starten`, await p.locator('#rad-start').isEnabled());
      controle(`rad (${beweging}): geen paginafouten`, fouten.length === 0, fouten);
      await ctx.close();
    }

    // ───────── 6. Limieten ─────────
    {
      const dag = lokaleDag();
      const ids = {}; for (let i = 1; i <= 9; i++) ids[`ar:${dag}:${i}`] = 1;
      const { ctx, p } = await nieuw(br, { beweging: 'reduce', zaad: { spo_munten: MUNTEN(100), spo_munten_ids: ids } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      controle('limiet: 9 gespeeld, nog 1 over', /Vandaag nog 1 van 10/.test(await p.locator('#dag-info').innerText()), await p.locator('#dag-info').innerText());
      await p.click('.spelknop[data-spel="rad"]'); await p.click('#rad-start'); await slaap(500);
      controle('limiet: het 10e spel lukt', (await saldo(p)) >= 95);
      const na10 = await saldo(p);
      controle('limiet: daarna "alle 10 gespeeld"', /alle 10 spellen gespeeld/.test(await p.locator('#dag-info').innerText()), await p.locator('#dag-info').innerText());
      await p.click('#rad-start'); await slaap(300);
      controle('limiet: het 11e spel geweigerd met uitleg, saldo ongewijzigd', /al 10 spellen gespeeld/.test(await meldingTekst(p)) && (await saldo(p)) === na10, await meldingTekst(p));
      await p.click('.spelknop[data-spel="kras"]'); await p.click('#kras-start'); await slaap(300);
      controle('limiet geldt voor alle spellen samen', /al 10 spellen gespeeld/.test(await meldingTekst(p)) && (await saldo(p)) === na10 && (await p.locator('.kras').count()) === 0);
      await p.reload(); await p.waitForSelector('#saldo'); await slaap(300);
      controle('limiet blijft na herladen', /alle 10 spellen gespeeld/.test(await p.locator('#dag-info').innerText()));
      await ctx.close();
    }
    {
      const { ctx, p } = await nieuw(br, { beweging: 'reduce', zaad: { spo_munten: MUNTEN(4), spo_galerij: kaarten(8) } });
      await p.goto(WEB + '/arcade.html'); await p.waitForSelector('#saldo'); await slaap(300);
      await p.click('#memory-start'); await slaap(300);
      controle('te weinig munten: uitleg, niets afgeschreven, geen bord', /te weinig munten/.test(await meldingTekst(p)) && (await saldo(p)) === 4 && (await p.locator('.mem').count()) === 0);
      await ctx.close();
    }

    // ───────── 7. Het paneel (hub): tabblad Arcade en de wekelijkse drop ─────────
    {
      const { ctx, p, fouten, verzoeken } = await nieuw(br, { breed: 1100, hoog: 800, drop: { week: '2026-W42', aantal: 42 }, zaad: { spo_munten: MUNTEN(100), spo_rondleiding: 1, spo_nieuw_gezien: '2.4.4', spo_vrienden: VRIENDEN, spo_account: { email: 't@t.nl', sessie: 's', account: 'a', sleutel: 'k', laatsteBackup: 1 } } });
      await p.goto(WEB + '/hub.html'); await p.waitForSelector('#tab-arcade'); await slaap(900);
      controle('hub: Deze week: 42 mythische kaarten door alle spelers', /Deze week: 42 mythische kaarten door alle spelers\./.test(await p.locator('#drop-week').innerText()) && await p.locator('#drop-week').isVisible(), await p.locator('#drop-week').innerText());
      controle('hub: het verzoek is alleen de actie, met de account-headers', verzoeken.filter((v) => v.body.a === 'dropTelling').length >= 1 && verzoeken.filter((v) => v.body.a === 'dropTelling').every((v) => Object.keys(v.body).join() === 'a' && v.headers['x-id'] === VRIENDEN.id));
      controle('hub: de regel wordt voorgelezen (role status, aria-live)', (await p.locator('#drop-week').getAttribute('role')) === 'status' && (await p.locator('#drop-week').getAttribute('aria-live')) === 'polite');
      await p.click('#tab-arcade'); await slaap(900);
      controle('hub: tabblad Arcade toont de pagina in een iframe', (await p.locator('#tab-arcade').getAttribute('aria-selected')) === 'true' && (await p.locator('#paneel-arcade iframe').count()) === 1 && (await p.locator('#paneel-arcade iframe').getAttribute('src')) === 'arcade.html?embed=1', await p.locator('#paneel-arcade iframe').count());
      const f = p.frameLocator('#paneel-arcade iframe');
      controle('hub: de arcade werkt in het paneel (saldo en spelknoppen)', (await f.locator('#saldo').innerText()) === '100' && (await f.locator('.spelknop').count()) === 4);
      controle('hub: tab-volgorde met pijltjestoets: van Arcade naar Winkel', await (async () => { await p.focus('#tab-arcade'); await p.keyboard.press('ArrowDown'); await slaap(300); return (await p.evaluate(() => document.activeElement.id)) === 'tab-winkel'; })());
      controle('hub: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }
    {
      // zonder account: geen drop-regel en geen verzoek
      const { ctx, p, verzoeken } = await nieuw(br, { zaad: { spo_munten: MUNTEN(100), spo_rondleiding: 1, spo_nieuw_gezien: '2.4.4' } });
      await p.goto(WEB + '/hub.html'); await p.waitForSelector('#tab-arcade'); await slaap(900);
      controle('zonder account: drop-regel verborgen en geen verzoek naar de server', (await p.locator('#drop-week').isHidden()) && verzoeken.filter((v) => /drop/.test(v.body.a || '')).length === 0);
      await ctx.close();
    }
    {
      // server geeft rommel of is er niet: de regel blijft verborgen
      const { ctx, p } = await nieuw(br, { drop: { week: 'rommel', aantal: -3 }, zaad: { spo_munten: MUNTEN(100), spo_rondleiding: 1, spo_nieuw_gezien: '2.4.4', spo_vrienden: VRIENDEN } });
      await p.goto(WEB + '/hub.html'); await p.waitForSelector('#tab-arcade'); await slaap(900);
      controle('ongeldig antwoord van de server: regel verborgen', await p.locator('#drop-week').isHidden());
      await ctx.close();
    }
  } finally {
    await br.close();
    web.kill();
  }
  console.log(`v3-arcade-pagina.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.log('FOUT', e); process.exit(1); });
