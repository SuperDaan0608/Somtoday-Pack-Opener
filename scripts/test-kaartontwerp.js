// Test van het ontwerp per niveau in "Kaart ontwerpen" (extension/kaart.html, motor/data.js).
// Draaien: export NODE_PATH=$(npm root -g); node scripts/test-kaartontwerp.js
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  const fouten = [];
  p.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
  p.on('pageerror', (e) => fouten.push(String(e)));
  await p.goto('file://' + path.resolve(__dirname, '../extension/kaart.html'));
  await p.waitForFunction(() => document.querySelector('#voor').src.startsWith('data:'));

  // pure logica: maakData kiest per niveau, met terugval op de globale keuze
  const r = await p.evaluate(() => {
    const S = window.__SPO, c = [4.2, 6.1, 8.4, 9.6, 10];
    const o = { 0: { thema: 'roze', rand: 'neon' } };
    const pal = (cijfer, extra) => { const d = S.maakData({ vak: 'X', cijfer, ...extra }); return [d.T.pal.join(), d.rand]; };
    return {
      ontwerp: c.map((g) => pal(g, { kaartOntwerp: o })),
      terugval: c.map((g) => pal(g, { kaartOntwerp: o, kaartThema: 'mint', kaartRand: 'dun' })),
      kaal: c.map((g) => pal(g, {})),
    };
  });
  assert.equal(r.ontwerp[0][1], 'neon');
  assert.notDeepEqual(r.ontwerp[0], r.kaal[0]);
  for (let i = 1; i < 5; i++) assert.deepEqual(r.ontwerp[i], r.kaal[i], 'niveau ' + i + ' onveranderd');
  for (let i = 1; i < 5; i++) assert.equal(r.terugval[i][1], 'dun', 'terugval rand');
  assert.equal(r.terugval[0][1], 'neon', 'niveau-ontwerp wint van terugval');

  // UI: Brons aanpassen laat Goud ongemoeid
  const goud = () => p.evaluate(() => document.querySelector('#voor').src);
  await p.click('#niveaus button:nth-child(3)');
  await p.waitForTimeout(800);
  const vooraf = await goud();
  await p.click('#niveaus button:nth-child(1)');
  await p.click('#themas .zwatch[data-id="roze"]');
  await p.waitForTimeout(800);
  await p.click('#niveaus button:nth-child(3)');
  await p.waitForTimeout(800);
  assert.equal(await goud(), vooraf, 'Goud is veranderd na aanpassen van Brons');
  const o = await p.evaluate(() => JSON.parse(localStorage.getItem('spo_instellingen')).kaartOntwerp);
  assert.equal(o[0].thema, 'roze');
  assert.equal(o[2].thema, 'auto');
  assert.deepEqual(fouten, [], 'consolefouten: ' + fouten.join('; '));
  console.log('ok   kaartontwerp per niveau');
  await b.close();
})().catch((e) => { console.error('FOUT', e); process.exit(1); });
