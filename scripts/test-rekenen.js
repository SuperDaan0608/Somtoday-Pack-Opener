// Test van de rekenfuncties van de Cijfercalculator (extension/rekenen.js).
// Draaien: node scripts/test-rekenen.js (geen extra pakketten nodig).
const assert = require('node:assert/strict');
const R = require('../extension/rekenen.js');

let aantal = 0;
function test(naam, fn) {
  try { fn(); aantal++; console.log('ok   ' + naam); }
  catch (e) { console.error('FOUT ' + naam + '\n' + (e && e.stack || e)); process.exitCode = 1; }
}
const dichtbij = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is niet ${b}`);

// ----- invoer lezen -----
test('parseGetal: komma en punt', () => {
  assert.equal(R.parseGetal('7,5'), 7.5);
  assert.equal(R.parseGetal('7.5'), 7.5);
  assert.equal(R.parseGetal('  7,5 '), 7.5);
  assert.equal(R.parseGetal('10'), 10);
  assert.equal(R.parseGetal('0,5'), 0.5);
  assert.equal(R.parseGetal(',5'), 0.5);
  assert.equal(R.parseGetal('7,'), 7);   // halverwege typen
  assert.equal(R.parseGetal('7.'), 7);
  assert.equal(R.parseGetal(' 7,5 '), 7.5); // harde spaties
  assert.equal(R.parseGetal(7.5), 7.5);
});
test('parseGetal: rare invoer geeft NaN, nooit een uitzondering', () => {
  for (const s of ['', ' ', 'abc', '7,5,3', '7.5.3', '1e3', '-5', '+5', '0x10', 'NaN', 'Infinity', '7 5', '7,5x', '1.000,5', ',', '.', null, undefined, {}, [], true, NaN, Infinity, '9'.repeat(400)]) {
    assert.ok(Number.isNaN(R.parseGetal(s)), `verwacht NaN voor ${JSON.stringify(s)}`);
  }
});
test('leesVeld: bereik, heel getal en leeg', () => {
  assert.deepEqual(R.leesVeld('gemiddelde', '6,8'), { waarde: 6.8, fout: null });
  assert.equal(R.leesVeld('gemiddelde', '1').fout, null);
  assert.equal(R.leesVeld('gemiddelde', '10,0').fout, null);
  assert.equal(R.leesVeld('gemiddelde', '0,9').fout, 'ongeldig');
  assert.equal(R.leesVeld('gemiddelde', '10,1').fout, 'ongeldig');
  assert.equal(R.leesVeld('gemiddelde', '').fout, 'leeg');
  assert.equal(R.leesVeld('gemiddelde', '   ').fout, 'leeg');
  assert.equal(R.leesVeld('gemiddelde', undefined).fout, 'leeg');
  assert.equal(R.leesVeld('gemiddelde', 'zes').fout, 'ongeldig');
  assert.equal(R.leesVeld('weging', '12').waarde, 12);
  assert.equal(R.leesVeld('weging', '12,0').waarde, 12);  // 12,0 is een heel getal
  assert.equal(R.leesVeld('weging', '2,5').fout, 'ongeldig');
  assert.equal(R.leesVeld('weging', '0').fout, 'ongeldig');
  assert.equal(R.leesVeld('toetsWeging', '10').fout, null);
  assert.equal(R.leesVeld('toetsWeging', '11').fout, 'ongeldig');
  assert.equal(R.leesVeld('toetsWeging', '0').fout, 'ongeldig');
  assert.equal(R.leesVeld('aantal', '5').fout, null);
  assert.equal(R.leesVeld('aantal', '6').fout, 'ongeldig');
  assert.equal(R.leesVeld('aantal', '0').fout, 'ongeldig');
  assert.equal(R.leesVeld('totaalWeging', '2,5').waarde, 2.5);
});

// ----- afronden -----
test('rondOmhoog: precies op een tiende blijft staan (5,5 en 6,0 randgevallen)', () => {
  assert.equal(R.rondOmhoog(5.5), 5.5);
  assert.equal(R.rondOmhoog(6), 6);
  assert.equal(R.rondOmhoog(6.0), 6.0);
  assert.equal(R.rondOmhoog(5.500000000001), 5.5);   // rekenfoutje van de computer
  assert.equal(R.rondOmhoog(5.499999999999), 5.5);
  assert.equal(R.rondOmhoog(6.000000000000002), 6);
  assert.equal(R.rondOmhoog(0.1 + 0.2), 0.3);
  assert.equal(R.rondOmhoog(1.1 * 3), 3.3);          // 3.3000000000000003
  assert.equal(R.rondOmhoog(4.35 * 2), 8.7);
});
test('rondOmhoog: iets erboven gaat wel omhoog', () => {
  assert.equal(R.rondOmhoog(5.51), 5.6);
  assert.equal(R.rondOmhoog(5.501), 5.6);
  assert.equal(R.rondOmhoog(5.5001), 5.6);
  assert.equal(R.rondOmhoog(6.01), 6.1);
  assert.equal(R.rondOmhoog(6.0001), 6.1);
  assert.equal(R.rondOmhoog(9.91), 10);
  assert.equal(R.rondOmhoog(10.01), 10.1);
});
test('rondOmhoog: negatieve waarden en nul geven geen -0', () => {
  assert.equal(R.rondOmhoog(-0.04), 0);
  assert.ok(Object.is(R.rondOmhoog(-0.04), 0));
  assert.equal(R.rondOmhoog(-3.26), -3.2);
});
test('rondOmlaag en rondAf', () => {
  assert.equal(R.rondOmlaag(7.99), 7.9);
  assert.equal(R.rondOmlaag(8), 8);
  assert.equal(R.rondOmlaag(7.999999999999), 8);
  assert.equal(R.rondOmlaag(5.55), 5.5);
  assert.equal(R.rondAf(5.45), 5.5);
  assert.equal(R.rondAf(5.449), 5.4);
  assert.equal(R.rondAf(7.25), 7.3);
  assert.equal(R.rondAf(6.0499), 6);
  assert.equal(R.rondAf(6.05), 6.1);
});
test('formatCijfer en formatGetal: komma op het scherm', () => {
  assert.equal(R.formatCijfer(5.5), '5,5');
  assert.equal(R.formatCijfer(6), '6,0');
  assert.equal(R.formatCijfer(10), '10,0');
  assert.equal(R.formatCijfer(1), '1,0');
  assert.equal(R.formatCijfer(7.3000000000000001), '7,3');
  assert.equal(R.formatCijfer(0.1 + 0.2), '0,3');
  assert.equal(R.formatGetal(12), '12');
  assert.equal(R.formatGetal(2.5), '2,5');
  assert.equal(R.formatGetal(64.50000001, 4), '64,5');
  assert.equal(R.formatGetal(21.75), '21,75');
});

// ----- het rekenen zelf -----
test('benodigdCijfer: gewone gevallen', () => {
  // gemiddelde 6,0 met weging 10, gewenst 6,0, toets weging 2: een 6,0 houdt je op 6,0
  let r = R.benodigdCijfer({ som: 60, weging: 10, gewenst: 6, toetsWeging: 2 });
  assert.equal(r.status, 'haalbaar'); assert.equal(r.nodig, 6);
  // gemiddelde 5,0 weging 10 (som 50), gewenst 5,5, weging 2: (5,5*12 - 50)/2 = 8
  r = R.benodigdCijfer({ som: 50, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.status, 'haalbaar'); assert.equal(r.nodig, 8);
  // gemiddelde 5,5 houden: een 5,5
  r = R.benodigdCijfer({ som: 55, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.nodig, 5.5);
  // niets behaald (weging 0 mag in de som, maar de pagina laat het niet toe): gewenst = nodig
  r = R.benodigdCijfer({ som: 0, weging: 0, gewenst: 5.5, toetsWeging: 3 });
  assert.equal(r.nodig, 5.5);
  // naar boven afgerond: 5,0 / weging 3 (som 15), gewenst 5,5, weging 1: 5,5*4 - 15 = 7
  r = R.benodigdCijfer({ som: 15, weging: 3, gewenst: 5.5, toetsWeging: 1 });
  assert.equal(r.nodig, 7);
  // som 20 weging 3 (6,67), gewenst 7, weging 2: (7*5-20)/2 = 7.5
  r = R.benodigdCijfer({ som: 20, weging: 3, gewenst: 7, toetsWeging: 2 });
  assert.equal(r.nodig, 7.5);
  // oneindig lange breuk: som 20 weging 3, gewenst 6, weging 1: (6*4-20)/1 = 4
  assert.equal(R.benodigdCijfer({ som: 20, weging: 3, gewenst: 6, toetsWeging: 1 }).nodig, 4);
  // 1/3-geval: som 10 weging 3, gewenst 7,5, weging 3: (7,5*6 - 10)/3 = 11,67 -> onhaalbaar
  r = R.benodigdCijfer({ som: 10, weging: 3, gewenst: 7.5, toetsWeging: 3 });
  assert.equal(r.status, 'onhaalbaar');
  // 8,6667 -> 8,7
  r = R.benodigdCijfer({ som: 60, weging: 10, gewenst: 7, toetsWeging: 2, aantal: 3 });
  assert.equal(r.nodig, 8.7); assert.equal(r.status, 'haalbaar');
});
test('benodigdCijfer: al gehaald (nodig <= 1,0)', () => {
  // gemiddelde 7,0 weging 10, gewenst 5,5: ver onder wat nodig is
  let r = R.benodigdCijfer({ som: 70, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.status, 'gehaald'); assert.ok(r.nodig <= 1);
  // precies op de grens: nodig is 1,0 -> gehaald. som 64, weging 10, gewenst 5,5, toets 2: (66-64)/2 = 1
  r = R.benodigdCijfer({ som: 64, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.nodig, 1); assert.equal(r.status, 'gehaald');
  // net erboven: som 63,9 -> ruw 1,05 -> 1,1 -> haalbaar
  r = R.benodigdCijfer({ som: 63.9, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.nodig, 1.1); assert.equal(r.status, 'haalbaar');
  // net onder 1,0 door een rekenfoutje blijft gehaald
  r = R.benodigdCijfer({ som: 64.000000000001, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.status, 'gehaald');
  // gewenst 1,0 is altijd gehaald
  r = R.benodigdCijfer({ som: 10, weging: 10, gewenst: 1, toetsWeging: 2 });
  assert.equal(r.status, 'gehaald');
});
test('benodigdCijfer: niet haalbaar (nodig > 10) met hoogste gemiddelde naar beneden afgerond', () => {
  // som 46, weging 10, gewenst 5,5, toets 2: ruw 10 -> nog net haalbaar
  let r = R.benodigdCijfer({ som: 46, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.nodig, 10); assert.equal(r.status, 'haalbaar');
  // som 45,9: ruw 10,05 -> 10,1 -> niet haalbaar. Hoogste: (45,9 + 20)/12 = 5,4917 -> 5,4 (niet 5,5)
  r = R.benodigdCijfer({ som: 45.9, weging: 10, gewenst: 5.5, toetsWeging: 2 });
  assert.equal(r.status, 'onhaalbaar'); assert.equal(r.hoogste, 5.4);
  // gemiddelde 5,0 weging 20, gewenst 9 met een toets van weging 1: hoogste (100+10)/21 = 5,238 -> 5,2
  r = R.benodigdCijfer({ som: 100, weging: 20, gewenst: 9, toetsWeging: 1 });
  assert.equal(r.status, 'onhaalbaar'); assert.equal(r.hoogste, 5.2);
  // met meer toetsen komt het misschien wel binnen bereik
  r = R.benodigdCijfer({ som: 100, weging: 20, gewenst: 5.5, toetsWeging: 1, aantal: 5 }); // (5,5*25 - 100)/5
  assert.equal(r.status, 'haalbaar'); assert.equal(r.nodig, 7.5);
  // hoogste ligt nooit boven het gewenste gemiddelde als het niet haalbaar is
  for (const gewenst of [5.5, 6, 7, 8, 9, 10]) {
    const q = R.benodigdCijfer({ som: 30, weging: 6, gewenst, toetsWeging: 1 });
    if (q.status === 'onhaalbaar') assert.ok(q.hoogste < gewenst, `${q.hoogste} < ${gewenst}`);
  }
});
test('benodigdCijfer: een 10,0 als gewenst gemiddelde met alleen tienen is haalbaar', () => {
  const r = R.benodigdCijfer({ som: 100, weging: 10, gewenst: 10, toetsWeging: 2 });
  assert.equal(r.nodig, 10); assert.equal(r.status, 'haalbaar');
});
test('benodigdCijfer: het uitgerekende cijfer haalt het gemiddelde zeker, een tiende minder net niet (1000 willekeurige gevallen)', () => {
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let haalbaar = 0;
  for (let i = 0; i < 1000; i++) {
    const weging = 1 + Math.floor(rnd() * 40);
    const gem = Math.round((1 + rnd() * 9) * 10) / 10;
    const som = gem * weging;
    const gewenst = Math.round((1 + rnd() * 9) * 10) / 10;
    const toetsWeging = 1 + Math.floor(rnd() * 10);
    const aantal = 1 + Math.floor(rnd() * 5);
    const r = R.benodigdCijfer({ som, weging, gewenst, toetsWeging, aantal });
    if (r.status === 'haalbaar') {
      haalbaar++;
      const hoog = R.nieuwGemiddelde({ som, weging, cijfer: r.nodig, toetsWeging, aantal }).nieuw;
      assert.ok(hoog >= gewenst - 1e-9, `met ${r.nodig} haal je ${hoog}, gewenst ${gewenst}`);
      if (r.nodig - 0.1 >= 1) {
        const laag = R.nieuwGemiddelde({ som, weging, cijfer: r.nodig - 0.1, toetsWeging, aantal }).nieuw;
        assert.ok(laag < gewenst + 1e-9, `met ${r.nodig - 0.1} haal je ${laag} en dat is al genoeg voor ${gewenst}`);
      }
    } else if (r.status === 'gehaald') {
      assert.ok(R.nieuwGemiddelde({ som, weging, cijfer: 1, toetsWeging, aantal }).nieuw >= gewenst - 1e-9, 'gehaald, maar een 1,0 is niet genoeg');
    } else {
      assert.ok(R.nieuwGemiddelde({ som, weging, cijfer: 10, toetsWeging, aantal }).nieuw < gewenst + 1e-9, 'onhaalbaar, maar een 10,0 is genoeg');
    }
  }
  assert.ok(haalbaar > 100, 'te weinig haalbare gevallen getest');
});
test('nieuwGemiddelde', () => {
  let r = R.nieuwGemiddelde({ som: 60, weging: 10, cijfer: 8, toetsWeging: 2 });
  dichtbij(r.nu, 6); dichtbij(r.nieuw, 76 / 12);
  r = R.nieuwGemiddelde({ som: 60, weging: 10, cijfer: 8, toetsWeging: 2, aantal: 3 }); // drie keer een 8
  dichtbij(r.nieuw, (60 + 48) / 16);
  r = R.nieuwGemiddelde({ som: 60, weging: 10, cijfer: 6, toetsWeging: 4 }); // zelfde als gemiddelde: verandert niet
  dichtbij(r.nieuw, 6);
});


// ----- tabel -----
test('tabelRijen: zeven rijen met tekst voor haalbaar, al gehaald en niet haalbaar', () => {
  const rijen = R.tabelRijen({ som: 60, weging: 10 }, 2, 1); // gemiddelde 6,0 en een toets van weging 2
  assert.deepEqual(rijen.map((r) => r.gewenstTekst), ['5,5', '6,0', '6,5', '7,0', '7,5', '8,0', '9,0']);
  assert.deepEqual(rijen.map((r) => r.nodigTekst), ['3,0', '6,0', '9,0', 'meer dan 10,0', 'meer dan 10,0', 'meer dan 10,0', 'meer dan 10,0']);
  assert.deepEqual(rijen.slice(0, 3).map((r) => r.statusTekst), ['Haalbaar', 'Haalbaar', 'Haalbaar']);
  assert.equal(rijen[3].status, 'onhaalbaar');
  assert.equal(rijen[3].statusTekst, 'Niet haalbaar');
  assert.equal(rijen[3].hoogsteTekst, '6,6'); // (60+20)/12 = 6,67 -> 6,6, niet 6,7
  assert.equal(rijen[0].hoogsteTekst, undefined);
  // een gemiddelde dat al hoog is: de lage doelen zijn al gehaald
  const hoog = R.tabelRijen({ som: 90, weging: 10 }, 2, 1);
  assert.equal(hoog[0].status, 'gehaald'); assert.equal(hoog[0].statusTekst, 'Al gehaald'); assert.equal(hoog[0].nodigTekst, '1,0 of lager');
  assert.equal(hoog[6].status, 'haalbaar'); assert.equal(hoog[6].nodigTekst, '9,0');
  // eigen lijst
  assert.equal(R.tabelRijen({ som: 60, weging: 10 }, 2, 1, [6]).length, 1);
});
test('tabelRijen: 5,5 en 6,0 op het randje geven geen 5,6 of 6,1 door rekenfoutjes', () => {
  assert.equal(R.tabelRijen({ som: 5.5 * 7, weging: 7 }, 3, 1)[0].nodigTekst, '5,5');
  assert.equal(R.tabelRijen({ som: 6 * 9, weging: 9 }, 1, 1)[1].nodigTekst, '6,0');
  assert.equal(R.tabelRijen({ som: 6.1 * 7, weging: 7 }, 3, 1)[1].nodigTekst, '5,8'); // (6*10 - 42,7)/3 = 5,77
  for (let weging = 1; weging <= 60; weging++) {
    for (const g of [5.5, 6]) {
      const rij = R.tabelRijen({ som: g * weging, weging }, 2, 1, [g])[0];
      assert.equal(rij.nodigTekst, R.formatCijfer(g), `weging ${weging}, gemiddelde ${g}`);
    }
  }
});

// ----- uitkomst in woorden -----
const START = { som: 60, weging: 10 };
function zin(som, weging, gewenst, toetsWeging, aantal = 1) {
  const start = { som, weging };
  return R.uitkomstZin(R.benodigdCijfer({ som, weging, gewenst, toetsWeging, aantal }), { start, toetsWeging, aantal });
}
test('uitkomstZin: haalbaar', () => {
  const z = zin(50, 10, 5.5, 2);
  assert.equal(z.soort, 'haalbaar');
  assert.equal(z.tekst, 'Je moet gemiddeld een 8,0 halen');
  assert.equal(z.getal, '8,0');
  assert.match(z.detail, /Nu sta je op een 5,0 bij een totale weging van 10\./);
  assert.match(z.detail, /weging 2\./);
});
test('uitkomstZin: al gehaald', () => {
  const z = zin(90, 10, 5.5, 2);
  assert.equal(z.soort, 'gehaald');
  assert.equal(z.tekst, 'Je staat er al, zelfs met een 1,0 haal je het.');
});
test('uitkomstZin: niet haalbaar, met enkelvoud en meervoud', () => {
  let z = zin(60, 10, 8, 2);
  assert.equal(z.soort, 'onhaalbaar');
  assert.equal(z.tekst, 'Dat gemiddelde is niet meer haalbaar met deze toets. Het hoogste dat nog kan is 6,6.');
  z = zin(60, 10, 9, 2, 2); // twee toetsen: (60+40)/14 = 7,14
  assert.equal(z.tekst, 'Dat gemiddelde is niet meer haalbaar met deze toetsen. Het hoogste dat nog kan is 7,1.');
  assert.match(z.detail, /voor alle 2 toetsen kom je niet verder dan een 7,1\./);
});
test('uitkomstZin: meerdere toetsen noemt het aantal', () => {
  const z = zin(60, 10, 7, 2, 3);
  assert.equal(z.tekst, 'Je moet gemiddeld een 8,7 halen');
  assert.match(z.detail, /3 toetsen/);
});

// ----- wat als ik een X haal? -----
test('watAlsZin: hoger, lager, gelijk en doel gehaald', () => {
  let w = R.watAlsZin(START, 2, 1, 8, 5.5);
  assert.equal(w.getal, '6,3'); // 76/12 = 6,333
  assert.equal(w.voor, 'Als je een 8,0 haalt, wordt je gemiddelde een ');
  assert.match(w.detail, /Nu sta je op 6,0\. Dat is 0,3 hoger\./);
  assert.match(w.detail, /Daarmee haal je je gewenste gemiddelde van 5,5\./);
  w = R.watAlsZin(START, 2, 1, 3, 6);
  assert.equal(w.getal, '5,5'); // 66/12
  assert.match(w.detail, /Dat is 0,5 lager\./);
  assert.match(w.detail, /van 6,0 nog niet\./);
  w = R.watAlsZin(START, 4, 1, 6, 6);
  assert.equal(w.getal, '6,0');
  assert.match(w.detail, /afgerond hetzelfde/);
  w = R.watAlsZin(START, 2, 3, 7, 7); // drie keer een 7 -> (60+42)/16 = 6,375
  assert.match(w.voor, /op alle 3 toetsen een 7,0/);
  assert.equal(w.getal, '6,4');
  assert.match(w.detail, /nog niet/);
  // precies het gewenste gemiddelde telt als gehaald (zonder afrondfout)
  w = R.watAlsZin({ som: 55, weging: 10 }, 2, 1, 5.5, 5.5);
  assert.match(w.detail, /Daarmee haal je je gewenste gemiddelde van 5,5\./);
  // zonder (geldig) gewenst gemiddelde alleen het nieuwe gemiddelde
  w = R.watAlsZin(START, 2, 1, 8, NaN);
  assert.ok(!/gewenste/.test(w.detail));
});

// ----- galerij -----
const GALERIJ = [
  { id: 'a', ts: 1, vak: 'Wiskunde', cijfer: 7.5, onderwerp: 'SO H1', weging: 2, tier: 2 },
  { id: 'b', ts: 2, vak: 'Wiskunde', cijfer: '6,5', onderwerp: 'PW', weging: 3, tier: 1 },
  { id: 'c', ts: 3, vak: 'Wiskunde', cijfer: 8, onderwerp: 'Mondeling', tier: 3 }, // weging ontbreekt: telt als 1
  { id: 'd', ts: 4, vak: 'Engels', cijfer: 5.5, onderwerp: 'Toets', weging: 1, tier: 0 },
  { id: 'e', ts: 5, vak: 'Engels', cijfer: 'abc', weging: 2 },     // geen cijfer: overslaan
  { id: 'f', ts: 6, vak: 'Engels', cijfer: 11, weging: 2 },        // geen geldig cijfer: overslaan
  { id: 'g', ts: 7, vak: '', cijfer: 7, weging: 2 },               // geen vak: overslaan
  null, 'rommel', 42,
  { id: 'h', ts: 8, vak: 'Aardrijkskunde', cijfer: 7, weging: '2,5' }, // weging als tekst
  { id: 'i', ts: 9, vak: 'Aardrijkskunde', cijfer: 9, weging: 0 },     // weging 0: telt als 1
];
test('galerij: vakken met aantal, alfabetisch', () => {
  assert.deepEqual(R.vakkenUitGalerij(GALERIJ), [
    { vak: 'Aardrijkskunde', aantal: 2 }, { vak: 'Engels', aantal: 1 }, { vak: 'Wiskunde', aantal: 3 },
  ]);
  assert.deepEqual(R.vakkenUitGalerij([]), []);
  assert.deepEqual(R.vakkenUitGalerij(undefined), []);
  assert.deepEqual(R.vakkenUitGalerij('geen lijst'), []);
});
test('galerij: som van cijfer maal weging en som van wegingen', () => {
  const w = R.somUitGalerij(GALERIJ, 'Wiskunde');
  assert.equal(w.aantal, 3);
  dichtbij(w.som, 7.5 * 2 + 6.5 * 3 + 8 * 1); // 42,5
  assert.equal(w.weging, 6);
  const a = R.somUitGalerij(GALERIJ, 'Aardrijkskunde');
  dichtbij(a.som, 7 * 2.5 + 9 * 1); assert.equal(a.weging, 3.5);
  assert.deepEqual(R.somUitGalerij(GALERIJ, 'Bestaat niet'), { som: 0, weging: 0, aantal: 0, kaarten: [] });
});
test('galerij: twee kaarten die er hetzelfde uitzien tellen allebei mee', () => {
  const g = [{ vak: 'Nask', cijfer: 6, weging: 2, onderwerp: 'SO' }, { vak: 'Nask', cijfer: 6, weging: 2, onderwerp: 'SO' }];
  const r = R.somUitGalerij(g, 'Nask');
  assert.equal(r.aantal, 2); assert.equal(r.som, 24); assert.equal(r.weging, 4);
});

// ----- alles samen -----
const BASIS = { modus: 'zelf', gemiddelde: '6,0', weging: '10', gewenst: '5,5', toetsWeging: '2', aantal: '1', mogelijk: '' };
const met = (extra) => R.bereken(Object.assign({}, BASIS, extra));
test('bereken: zelf invullen met komma en met punt geeft hetzelfde', () => {
  const a = met({ gemiddelde: '5,0', gewenst: '5,5' });
  const b = met({ gemiddelde: '5.0', gewenst: '5.5' });
  assert.equal(a.uitkomst.tekst, 'Je moet gemiddeld een 8,0 halen');
  assert.equal(b.uitkomst.tekst, a.uitkomst.tekst);
  assert.equal(a.melding, null);
  assert.deepEqual(a.fouten, {});
  assert.equal(a.tabel.length, 7);
});
test('bereken: de beginwaarden van de pagina (gewenst 5,5, weging 2, een toets)', () => {
  assert.equal(met({ gemiddelde: '6,8', weging: '12' }).uitkomst.soort, 'gehaald'); // 5,5*14 = 77 < 81,6
  assert.equal(met({ gemiddelde: '5,2', weging: '12' }).uitkomst.tekst, 'Je moet gemiddeld een 7,3 halen'); // (77-62,4)/2
});
test('bereken: lege of rare invoer geeft een vriendelijke melding en geen uitkomst', () => {
  let r = met({ gemiddelde: '' });
  assert.equal(r.uitkomst, null); assert.equal(r.tabel, null);
  assert.equal(r.melding, 'Vul je huidige gemiddelde in om te beginnen.');
  assert.deepEqual(r.fouten, {}); // leeg is nog geen fout
  r = met({ gemiddelde: 'zes' });
  assert.equal(r.uitkomst, null);
  assert.match(r.melding, /Je huidige gemiddelde/);
  assert.match(r.melding, /1,0 tot en met 10,0/);
  assert.ok(r.fouten.gemiddelde);
  r = met({ gemiddelde: '11' });
  assert.ok(r.fouten.gemiddelde); assert.equal(r.uitkomst, null);
  r = met({ weging: '0' });
  assert.ok(r.fouten.weging); assert.equal(r.uitkomst, null);
  r = met({ weging: '2,5' });
  assert.ok(r.fouten.weging);
  r = met({ toetsWeging: '0' });
  assert.ok(r.fouten.toetsWeging); assert.equal(r.uitkomst, null); assert.equal(r.tabel, null);
  r = met({ aantal: '9' });
  assert.ok(r.fouten.aantal); assert.equal(r.uitkomst, null);
  r = met({ gewenst: '' });
  assert.equal(r.uitkomst, null); assert.equal(r.melding, 'Vul in welk gemiddelde je wilt halen.');
  assert.equal(r.tabel.length, 7); // de tabel heeft het gewenste gemiddelde niet nodig
});
test('bereken: het eerste probleem in het formulier bepaalt de melding', () => {
  const r = R.bereken({ modus: 'zelf', gemiddelde: '', weging: 'x', gewenst: 'y', toetsWeging: '', aantal: '1', mogelijk: '' });
  assert.equal(r.melding, 'Vul je huidige gemiddelde in om te beginnen.');
});
test('bereken: ontbrekende invoer-eigenschappen geven geen uitzondering', () => {
  assert.doesNotThrow(() => R.bereken({}));
  assert.doesNotThrow(() => R.bereken());
  assert.doesNotThrow(() => R.bereken(null));
  assert.equal(R.bereken({}).uitkomst, null);
});
test('bereken: wat als ik een X haal', () => {
  let r = met({ mogelijk: '8' });
  assert.equal(r.watAls.soort, 'ok'); assert.equal(r.watAls.getal, '6,3');
  assert.equal(met({ mogelijk: '8,0' }).watAls.getal, '6,3');
  r = met({ mogelijk: '' });
  assert.equal(r.watAls.soort, 'leeg'); assert.deepEqual(r.fouten, {});
  r = met({ mogelijk: 'veel' });
  assert.equal(r.watAls.soort, 'fout'); assert.ok(r.fouten.mogelijk);
  assert.equal(met({ mogelijk: '12' }).watAls.soort, 'fout');
  assert.equal(met({ mogelijk: '0,5' }).watAls.soort, 'fout');
  assert.equal(met({ gemiddelde: '', mogelijk: '8' }).watAls.soort, 'wacht');
  // werkt ook als het gewenste gemiddelde ontbreekt
  r = met({ gewenst: '', mogelijk: '8' });
  assert.equal(r.watAls.soort, 'ok'); assert.ok(!/gewenste/.test(r.watAls.detail));
  // meerdere toetsen
  assert.equal(met({ aantal: '3', mogelijk: '7' }).watAls.getal, '6,4'); // (60 + 3*2*7)/16 = 6,375
});
test('bereken: galerij-modus met voorgestelde som en weging', () => {
  const w = R.somUitGalerij(GALERIJ, 'Wiskunde'); // som 42,5, weging 6
  const inv = { modus: 'galerij', vak: 'Wiskunde', som: R.formatGetal(w.som), totaalWeging: R.formatGetal(w.weging), gewenst: '7', toetsWeging: '2', aantal: '1', mogelijk: '' };
  assert.equal(inv.som, '42,5');
  const r = R.bereken(inv);
  assert.equal(r.uitkomst.tekst, 'Je moet gemiddeld een 6,8 halen'); // (7*8 - 42,5)/2 = 6,75
  dichtbij(r.start.gemiddelde, 42.5 / 6);
  const leeg = R.bereken(Object.assign({}, inv, { vak: '', som: '', totaalWeging: '' }));
  assert.equal(leeg.melding, 'Kies een vak om te beginnen.'); assert.equal(leeg.uitkomst, null);
  // de gebruiker past het voorstel aan (er was nog een cijfer buiten de extensie: een 9 met weging 3)
  const aangepast = R.bereken(Object.assign({}, inv, { som: '69,5', totaalWeging: '9' }));
  assert.equal(aangepast.uitkomst.tekst, 'Je moet gemiddeld een 3,8 halen'); // (7*11 - 69,5)/2 = 3,75
  // onzin in de aangepaste velden
  const kapot = R.bereken(Object.assign({}, inv, { som: 'veel' }));
  assert.equal(kapot.uitkomst, null); assert.ok(kapot.fouten.som); assert.match(kapot.melding, /Cijfers maal weging, opgeteld/);
  // gemiddelde buiten 1-10
  const buiten = R.bereken(Object.assign({}, inv, { som: '99', totaalWeging: '6' }));
  assert.equal(buiten.uitkomst, null); assert.ok(buiten.fouten.som);
  // de zelf-velden doen niet mee in galerij-modus
  assert.ok(R.bereken(Object.assign({}, inv, { gemiddelde: 'kapot', weging: 'kapot' })).uitkomst);
  // weging mag in de galerij-modus een komma hebben
  const komma = R.bereken(Object.assign({}, inv, { som: '24,5', totaalWeging: '3,5' }));
  assert.ok(komma.uitkomst); dichtbij(komma.start.gemiddelde, 7);
});
test('bereken: 5,5 en 6,0 als randgeval, ook met een gemiddelde dat precies op het doel zit', () => {
  assert.equal(met({ gemiddelde: '5,5', weging: '13', gewenst: '5,5', toetsWeging: '3' }).uitkomst.tekst, 'Je moet gemiddeld een 5,5 halen');
  assert.equal(met({ gemiddelde: '6,0', weging: '17', gewenst: '6,0', toetsWeging: '7' }).uitkomst.tekst, 'Je moet gemiddeld een 6,0 halen');
  assert.equal(met({ gemiddelde: '5.9', weging: '17', gewenst: '6.0', toetsWeging: '7' }).uitkomst.tekst, 'Je moet gemiddeld een 6,3 halen'); // (144 - 100,3)/7 = 6,24
  assert.equal(met({ gemiddelde: '6', weging: '10', gewenst: '6', toetsWeging: '2', aantal: '5' }).uitkomst.tekst, 'Je moet gemiddeld een 6,0 halen');
});
test('bereken: nooit NaN, undefined of Infinity op het scherm, wat je ook invult', () => {
  const rommel = ['', ' ', 'abc', '7,5,3', '-1', '0', '1e9', 'NaN', 'Infinity', '10000000', '0,0001', '99999999999999999999', '5,5', '6', '2', ',', '.', '10', '1', '7', '3,3333'];
  const kijk = (v, pad) => {
    if (typeof v === 'string') assert.ok(!/NaN|undefined|Infinity|null|\[object/.test(v), `${pad}: ${v}`);
    else if (typeof v === 'number') assert.ok(Number.isFinite(v), `${pad} is geen getal: ${v}`);
    else if (Array.isArray(v)) v.forEach((x, i) => kijk(x, `${pad}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) kijk(x, `${pad}.${k}`);
  };
  let s = 7;
  const rnd = (n) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
  const pak = () => rommel[rnd(rommel.length)];
  for (let i = 0; i < 3000; i++) {
    const modus = rnd(2) ? 'galerij' : 'zelf';
    const r = R.bereken({ modus, vak: rnd(3) ? 'Wiskunde' : '', som: pak(), totaalWeging: pak(), gemiddelde: pak(), weging: pak(), gewenst: pak(), toetsWeging: pak(), aantal: pak(), mogelijk: pak() });
    kijk(r, `geval ${i}`);
  }
});
console.log(`\n${aantal} tests gelukt${process.exitCode ? ', maar er zijn fouten' : ''}.`);
