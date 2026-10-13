// Wat is nieuw en Feedback in het paneel (hub.html), in headless Chromium met een nagemaakte chrome.storage en een nagemaakte server.
// Gebruik: export NODE_PATH=$(npm root -g); (cd extension && npx http-server -p 8190 -s -c-1 . &) ; node server/test/feedback-client.test.js
// Foto's: SPO_FOTO=/pad/naar/map node server/test/feedback-client.test.js
const fs = require('node:fs');
const { chromium } = require('playwright');
const WEB = process.env.SPO_WEB || 'http://localhost:8190';
const FOTO = process.env.SPO_FOTO || '';
if (FOTO) fs.mkdirSync(FOTO, { recursive: true });
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const SERVER = 'https://jummysnacks.nl/api.php';
const ACCOUNT = { email: 't@t.nl', sessie: 's', account: 'a', sleutel: 'k', laatsteBackup: 1 };
const VRIENDEN = { server: SERVER, id: 'ab'.repeat(16), token: 'geheim-token', privJwk: {}, pub: 'p', vrienden: [] };
const SLEUTEL = 'spo_nieuw_gezien';

// Nagemaakte chrome: opslag in localStorage (overleeft een herlaad), met onChanged.
const NEP_CHROME = ({ versie, zaad, eenmalig }) => {
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
  window.chrome = { storage: { local, onChanged: { addListener: (f) => luisteraars.push(f) } }, runtime: { getManifest: () => ({ version: versie }), id: 'nep', sendMessage: () => Promise.resolve() } };
};

async function nieuweContext(br, { versie = '2.4.4', zaad = {}, breed = 1100, hoog = 800, beweging } = {}) {
  const ctx = await br.newContext({ viewport: { width: breed, height: hoog }, reducedMotion: beweging || 'no-preference' });
  await ctx.addInitScript(NEP_CHROME, { versie, zaad });
  const log = { verzoeken: [], modus: { type: 'ok' } };
  await ctx.route(/jummysnacks\.nl/, async (route) => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body = {};
    try { body = JSON.parse(r.postData() || '{}'); } catch (e) { /* leeg */ }
    log.verzoeken.push({ body, headers: r.headers() });
    if (body.a !== 'feedback') return route.abort(); // back-up e.d.: nergens heen
    const m = log.modus;
    if (m.type === 'offline') return route.abort();
    const antwoord = m.type === 'ok' ? { status: 200, j: { ok: true } } : { status: m.status, j: m.j || {} };
    return route.fulfill({ status: antwoord.status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(antwoord.j) });
  });
  const pagina = await ctx.newPage();
  const fouten = [];
  pagina.on('pageerror', (e) => fouten.push(String(e)));
  return { ctx, pagina, log, fouten };
}
const dialoog = (p) => p.locator('.nv-kaart');
const opslag = (p, k) => p.evaluate((x) => { const t = localStorage.getItem('mock:' + x); return t == null ? undefined : JSON.parse(t); }, k);
const feedbackVerzoeken = (log) => log.verzoeken.filter((v) => v.body.a === 'feedback');
async function openHub(p) { await p.goto(WEB + '/hub.html'); await p.waitForSelector('#b-nieuw'); await slaap(700); }

(async () => {
  const br = await chromium.launch();
  try {
    // ───────── 1. Verse installatie: niets tonen, wel onthouden ─────────
    {
      const { ctx, pagina: p, fouten } = await nieuweContext(br, { zaad: { spo_account: ACCOUNT } });
      await openHub(p);
      controle('vers: geen venster', await dialoog(p).count() === 0);
      controle('vers: geen bolletje', await p.locator('#nieuw-bol').isHidden());
      controle('vers: huidige versie onthouden', await opslag(p, SLEUTEL) === '2.4.4', await opslag(p, SLEUTEL));
      controle('knoppen Wat is nieuw en Feedback staan in de kop', await p.locator('.kop #b-nieuw').isVisible() && await p.locator('.kop #b-feedback').isVisible());
      controle('vers: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }

    // ───────── 2. Na een update: één keer vanzelf, alleen de nieuwe versies ─────────
    {
      const { ctx, pagina: p, fouten } = await nieuweContext(br, { zaad: { spo_account: ACCOUNT, spo_rondleiding: 1, [SLEUTEL]: '2.3.0' } });
      await openHub(p);
      controle('update: venster verschijnt vanzelf', await dialoog(p).count() === 1);
      const d = dialoog(p);
      controle('update: role en naam', await d.getAttribute('aria-modal') === 'true' && (await p.locator('#nv-nieuw-titel').textContent()) === 'Wat is nieuw');
      const nrs = await p.locator('.nv-nr').allTextContents();
      controle('update: nieuwste bovenaan en alleen nieuwere dan 2.3.0', nrs[0] === 'Versie 2.4.4' && nrs.every((t) => !/2\.3\.0|2\.2\.0|3\.0\.0/.test(t)) && nrs.includes('Versie 2.3.4'), nrs);
      controle('update: de versies zijn gemarkeerd als Nieuw', await p.locator('.nv-tag').count() === nrs.length);
      controle('update: focus staat in het venster', await p.evaluate(() => !!document.activeElement.closest('.nv-kaart')));
      // focus-val: veel keer Tab blijft binnen het venster
      let binnen = true;
      for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); binnen = binnen && await p.evaluate(() => !!document.activeElement.closest('.nv-kaart')); }
      for (let i = 0; i < 4; i++) { await p.keyboard.press('Shift+Tab'); binnen = binnen && await p.evaluate(() => !!document.activeElement.closest('.nv-kaart')); }
      controle('update: focus-val', binnen);
      controle('update: de rest van het paneel is niet bruikbaar (inert)', await p.evaluate(() => document.getElementById('hub').inert));
      if (FOTO) await p.screenshot({ path: FOTO + '/nieuw-breed-update.png' });
      await p.keyboard.press('Escape');
      await slaap(150);
      controle('update: Esc sluit', await dialoog(p).count() === 0);
      controle('update: hub sluit niet mee (paneel is er nog)', await p.locator('#hub').isVisible());
      controle('update: versie onthouden', await opslag(p, SLEUTEL) === '2.4.4');
      controle('update: bolletje weg', await p.locator('#nieuw-bol').isHidden());
      controle('update: focus terug op een knop in het paneel', await p.evaluate(() => document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('.nv-kaart')));
      await p.reload(); await p.waitForSelector('#b-nieuw'); await slaap(700);
      controle('update: na herladen niet nog een keer', await dialoog(p).count() === 0);
      controle('update: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }

    // ───────── 3. Al bij: knop opent alles, 3.0.0 bovenaan, lege datum weggelaten ─────────
    {
      const { ctx, pagina: p } = await nieuweContext(br, { zaad: { spo_account: ACCOUNT, spo_rondleiding: 1, [SLEUTEL]: '2.4.4' } });
      await openHub(p);
      controle('bij: niet vanzelf', await dialoog(p).count() === 0);
      await p.click('#b-nieuw');
      await p.waitForSelector('.nv-kaart');
      const nrs = await p.locator('.nv-nr').allTextContents();
      controle('knop: alle versies, 3.0.0 bovenaan', nrs[0] === 'Versie 3.0.0' && nrs.includes('Versie 2.2.0'), nrs);
      controle('knop: titel Grote update', (await p.locator('.nv-versie').first().locator('.nv-vtitel').textContent()) === 'Grote update');
      controle('knop: lege datum wordt weggelaten', await p.locator('.nv-versie').first().locator('.nv-datum').count() === 0);
      controle('knop: wel een datum bij 2.4.4', /oktober 2026/.test(await p.locator('.nv-versie').nth(1).locator('.nv-datum').textContent()));
      controle('knop: hooguit 6 punten per versie', (await p.locator('.nv-punten').evaluateAll((l) => l.every((u) => u.children.length >= 1 && u.children.length <= 6))));
      controle('knop: geen Nieuw-labels (alles al gezien)', await p.locator('.nv-tag').count() === 0);
      if (FOTO) await p.screenshot({ path: FOTO + '/nieuw-breed.png' });
      // knop wordt onthouden als terug-focus
      await p.keyboard.press('Escape');
      await slaap(100);
      controle('knop: Esc sluit en focus terug op de knop', await dialoog(p).count() === 0 && await p.evaluate(() => document.activeElement.id === 'b-nieuw'));
      await p.click('#b-nieuw');
      await p.waitForSelector('.nv-kaart');
      await p.mouse.click(5, 5); // naast het venster
      await slaap(150);
      controle('knop: klik naast het venster sluit', await dialoog(p).count() === 0);
      await p.click('#b-nieuw');
      await p.click('.nv-voet .knop');
      await slaap(100);
      controle('knop: Sluiten-knop sluit', await dialoog(p).count() === 0);
      await ctx.close();
    }

    // ───────── 4. Bolletje: er is iets nieuws maar je bent niet ingelogd (dus niet vanzelf) ─────────
    {
      const { ctx, pagina: p } = await nieuweContext(br, { zaad: { [SLEUTEL]: '2.2.0' } });
      await openHub(p);
      controle('bolletje zichtbaar bij nog niet gezien', await p.locator('#nieuw-bol').isVisible());
      controle('bolletje: knop zegt het ook in woorden', /iets nieuws/.test(await p.locator('#b-nieuw').innerText().catch(() => '') + await p.locator('#nieuw-sr').textContent()));
      controle('niet ingelogd: niet vanzelf', await dialoog(p).count() === 0);
      await p.evaluate(() => document.getElementById('b-nieuw').click());
      await p.waitForSelector('.nv-kaart');
      controle('bolletje: weg zodra je het venster opent', await p.locator('#nieuw-bol').isHidden());
      await ctx.close();
    }

    // ───────── 5. Smal scherm en minder beweging ─────────
    {
      const { ctx, pagina: p } = await nieuweContext(br, { zaad: { spo_account: ACCOUNT, spo_rondleiding: 1, [SLEUTEL]: '2.4.4' }, breed: 390, hoog: 780, beweging: 'reduce' });
      await openHub(p);
      const kop = await p.evaluate(() => { const k = document.querySelector('.kop'); return { sw: k.scrollWidth, cw: k.clientWidth, doc: document.documentElement.scrollWidth, bw: innerWidth }; });
      controle('390px: kop past (geen horizontaal scrollen)', kop.sw <= kop.cw && kop.doc <= kop.bw, kop);
      controle('390px: knoppen zijn te bedienen (min 34px)', await p.evaluate(() => ['b-nieuw', 'b-feedback'].every((i) => { const r = document.getElementById(i).getBoundingClientRect(); return r.width >= 34 && r.height >= 34; })));
      controle('390px: knoppen hebben een toegankelijke naam', (await p.getByRole('button', { name: 'Wat is nieuw' }).count()) === 1 && (await p.getByRole('button', { name: 'Feedback' }).count()) === 1);
      if (FOTO) await p.screenshot({ path: FOTO + '/kop-390.png' });
      await p.click('#b-nieuw');
      await p.waitForSelector('.nv-kaart');
      const m = await p.evaluate(() => { const r = document.querySelector('.nv-kaart').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight, anim: getComputedStyle(document.querySelector('.nv-kaart')).animationName }; });
      controle('390px: venster past op het scherm', m.l >= 0 && m.r <= m.w && m.t >= 0 && m.b <= m.h, m);
      controle('minder beweging: geen animatie', m.anim === 'none', m.anim);
      if (FOTO) await p.screenshot({ path: FOTO + '/nieuw-390.png' });
      await ctx.close();
    }

    // ───────── 6. Feedback ─────────
    {
      const { ctx, pagina: p, log, fouten } = await nieuweContext(br, { zaad: { spo_account: ACCOUNT, spo_rondleiding: 1, [SLEUTEL]: '2.4.4', spo_instellingen: { laag: true } } });
      await openHub(p);
      await p.click('#tab-instellingen');
      await p.click('#b-feedback');
      await p.waitForSelector('.nv-kaart');
      controle('feedback: venster met naam', (await p.locator('.nv-kop h2').textContent()) === 'Feedback');
      controle('feedback: uitleg in een zin', (await p.locator('.nv-intro').textContent()) === 'Alleen de beheerder leest dit. Schrijf geen persoonlijke gegevens.');
      const soorten = await p.locator('input[name=fb-soort]').evaluateAll((l) => l.map((i) => i.value));
      controle('feedback: drie soorten, Fout melden eerst gekozen', soorten.join() === 'fout,idee,anders' && await p.locator('input[name=fb-soort]').first().isChecked());
      controle('feedback: vinkje staat standaard aan', await p.locator('.fb-vink input').isChecked());
      const voorb = await p.locator('.fb-info').textContent();
      controle('feedback: voorbeeld toont wat meegaat', voorb === 'Dit sturen we mee: versie 2.4.4; browser Chrome ' + voorb.match(/Chrome (\d+)/)[1] + '; systeem Linux; animaties lage kwaliteit; WebGL ' + (/WebGL ja/.test(voorb) ? 'ja' : 'nee') + '; tabblad instellingen', voorb);
      controle('feedback: voorbeeld heeft geen volledige user agent of persoonsgegevens', !/Mozilla|AppleWebKit|Headless|@|cijfer|kaart|vriend/i.test(voorb.replace(/tabblad instellingen/, '')), voorb);
      if (FOTO) await p.screenshot({ path: FOTO + '/feedback-breed.png' });
      controle('feedback: teller', (await p.locator('.fb-teller').textContent()) === '0 / 500');
      await p.fill('#fb-tekst', 'Hallo');
      controle('feedback: teller telt mee', (await p.locator('.fb-teller').textContent()) === '5 / 500');

      // slechte tekst: geweigerd door het filter, er gaat niets weg
      for (const slecht of ['kut', 'Mail me op daan@gmail.com', 'bel 0612345678', 'ik maak je dood']) {
        await p.fill('#fb-tekst', slecht);
        await p.click('.nv-voet [type=submit]');
        await slaap(100);
        const melding = await p.locator('.nv-kaart .spo-tekst-melding').first().innerText();
        controle('feedback: filter weigert ' + JSON.stringify(slecht), melding.length > 3 && !melding.toLowerCase().includes('kut') && await dialoog(p).count() === 1 && feedbackVerzoeken(log).length === 0, melding);
      }
      await p.fill('#fb-tekst', 'kut');
      if (FOTO) await p.screenshot({ path: FOTO + '/feedback-weiger.png' });
      controle('feedback: veld is gemarkeerd als ongeldig', await p.locator('#fb-tekst').getAttribute('aria-invalid') === 'true');
      await p.fill('#fb-tekst', '   ');
      await p.click('.nv-voet [type=submit]');
      controle('feedback: leeg bericht wordt niet verstuurd', feedbackVerzoeken(log).length === 0 && /Schrijf eerst/.test(await p.locator('.fb-fout').textContent()));
      await p.fill('#fb-tekst', 'x'.repeat(501));
      await p.click('.nv-voet [type=submit]');
      controle('feedback: meer dan 500 tekens wordt geweigerd', feedbackVerzoeken(log).length === 0 && /te lang/.test(await p.locator('.nv-kaart .spo-tekst-melding').first().innerText()));
      controle('feedback: teller wordt rood bij te lang', await p.locator('.fb-teller.is-over').count() === 1);

      // goed bericht: zonder vrienden-identiteit
      await p.check('input[name=fb-soort][value=idee]');
      await p.fill('#fb-tekst', 'Een donkere modus voor de galerij lijkt me mooi!');
      await p.click('.nv-voet [type=submit]');
      await p.waitForSelector('.fb-bedankt');
      const v1 = feedbackVerzoeken(log);
      controle('verzenden: precies één verzoek', v1.length === 1, v1.length);
      controle('verzenden: actie en velden kloppen', v1[0].body.a === 'feedback' && v1[0].body.soort === 'idee' && v1[0].body.tekst === 'Een donkere modus voor de galerij lijkt me mooi!' && Object.keys(v1[0].body).sort().join() === 'a,info,soort,tekst', JSON.stringify(v1[0].body));
      controle('verzenden: info is precies het getoonde voorbeeld', 'Dit sturen we mee: ' + v1[0].body.info === voorb, v1[0].body.info);
      controle('verzenden: info past in 300 tekens', v1[0].body.info.length <= 300);
      controle('verzenden: zonder vrienden-identiteit geen X-Id of X-Token', !v1[0].headers['x-id'] && !v1[0].headers['x-token']);
      controle('verzenden: versie wordt zoals altijd meegestuurd in de kop', v1[0].headers['x-versie'] === '2.4.4');
      controle('bedankt-melding', /Bedankt/.test(await p.locator('.fb-bedankt').textContent()));
      if (FOTO) await p.screenshot({ path: FOTO + '/feedback-bedankt.png' });
      await p.keyboard.press('Escape');
      await slaap(100);
      controle('feedback: na bedankt sluit Esc', await dialoog(p).count() === 0);

      // vinkje uit: geen info; met vrienden-identiteit
      await p.click('#b-feedback');
      await p.waitForSelector('.nv-kaart');
      await p.uncheck('.fb-vink input');
      controle('feedback: vinkje uit toont dat er niets meegaat', /geen technische info/.test(await p.locator('.fb-info').textContent()));
      await p.fill('#fb-tekst', 'De knop is te klein op mijn telefoon');
      await p.click('.nv-voet [type=submit]');
      await p.waitForSelector('.fb-bedankt');
      const v2 = feedbackVerzoeken(log)[1];
      controle('verzenden zonder info: info is leeg', v2.body.info === '' && v2.body.soort === 'fout', JSON.stringify(v2.body));
      await p.keyboard.press('Escape');

      // fouten van de server
      const fout = async (modus, test, naam, vooraf) => {
        log.modus = modus;
        await p.click('#b-feedback');
        await p.waitForSelector('.nv-kaart');
        await p.fill('#fb-tekst', 'Dit is een gewone melding');
        await p.click('.nv-voet [type=submit]');
        await p.waitForSelector('.fb-fout:not(:empty)');
        const t = await p.locator('.fb-fout').textContent();
        controle(naam, test(t), t);
        controle(naam + ': je kunt het opnieuw proberen', await p.locator('.nv-voet [type=submit]').isEnabled() && await p.locator('#fb-tekst').inputValue() === 'Dit is een gewone melding');
        if (vooraf) await vooraf();
        await p.keyboard.press('Escape');
        await slaap(80);
      };
      await fout({ type: 'fout', status: 429, j: { fout: 'Te veel.' } }, (t) => /vandaag al drie keer/.test(t), 'feedback: 429 te veel', async () => { if (FOTO) await p.screenshot({ path: FOTO + '/feedback-429.png' }); });
      await fout({ type: 'offline' }, (t) => /Geen verbinding/.test(t), 'feedback: geen verbinding');
      await fout({ type: 'fout', status: 400, j: { fout: 'Onbekende actie.' } }, (t) => t === 'Feedback versturen kan nu nog niet. Probeer het later opnieuw.', 'feedback: server kent de actie nog niet');
      await fout({ type: 'fout', status: 403, j: { fout: 'Verbannen.', verbannen: true, tot: 0, reden: 'Spam' } }, (t) => t === 'Je bent permanent verbannen (Spam).', 'feedback: verbannen krijgt de ban-tekst');
      controle('feedback: geen paginafouten', fouten.length === 0, fouten);
      await ctx.close();
    }

    // ───────── 7. Feedback met vrienden-identiteit; smal scherm ─────────
    {
      const { ctx, pagina: p, log } = await nieuweContext(br, { zaad: { spo_account: ACCOUNT, spo_rondleiding: 1, [SLEUTEL]: '2.4.4', spo_vrienden: VRIENDEN }, breed: 390, hoog: 780 });
      await openHub(p);
      await p.click('#b-feedback');
      await p.waitForSelector('.nv-kaart');
      const m = await p.evaluate(() => { const r = document.querySelector('.nv-kaart').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight, sw: document.querySelector('.nv-inhoud').scrollWidth, cw: document.querySelector('.nv-inhoud').clientWidth }; });
      controle('390px: feedbackvenster past', m.l >= 0 && m.r <= m.w && m.t >= 0 && m.b <= m.h && m.sw <= m.cw, m);
      await p.fill('#fb-tekst', 'Het werkt fijn');
      if (FOTO) await p.screenshot({ path: FOTO + '/feedback-390.png' });
      await p.click('.nv-voet [type=submit]');
      await p.waitForSelector('.fb-bedankt');
      const v = feedbackVerzoeken(log)[0];
      controle('met vrienden-identiteit: X-Id en X-Token mee', v.headers['x-id'] === VRIENDEN.id && v.headers['x-token'] === VRIENDEN.token);
      controle('met vrienden-identiteit: body bevat geen id of token', !/geheim-token|abab/.test(JSON.stringify(v.body)));
      await ctx.close();
    }
  } finally {
    await br.close();
  }
  console.log(`${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
