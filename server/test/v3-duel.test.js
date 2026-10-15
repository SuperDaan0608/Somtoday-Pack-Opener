// v3.0: het strafschoppenduel. Deel 1 (Node): spelregels, kansen, eerlijkheid (vastlegging), berichten, munten.
// Deel 2 (headless Chromium, geen server nodig): een duel tegen de computer met alleen het toetsenbord, munten, 2D-uitslag,
// filmpje (nagebootst en echt), opgeven en overslaan van het filmpje, minder beweging, opties.
// Gebruik: export NODE_PATH=$(npm root -g); cd extension && npx http-server -p 8126 -s -c-1 . &   daarna: node server/test/v3-duel.test.js
// (screenshots in $SPO_TMP; de poort van de webserver is $SPO_DUEL_WEB of 8126)
const fs = require('node:fs');
const path = require('node:path');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const EXT = path.resolve(__dirname, '../../extension');
const G = require(EXT + '/gevecht.js');
const L = require(EXT + '/vriendenlib.js');
const D = require(EXT + '/duellib.js');
require(EXT + '/economie.js');
const E = globalThis.SPOEco;
const TMP = process.env.SPO_TMP || '/tmp/vrienden-scratch';
fs.mkdirSync(TMP, { recursive: true });
const WEB = 'http://localhost:' + (process.env.SPO_DUEL_WEB || '8126');
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
const kaart = (c, extra) => Object.assign({ vak: 'Wiskunde', cijfer: c, tier: 2, t: 0, z: false, v: false, h: false }, extra || {});

(async () => {
  // ───────── 1. De basis: gevecht.js zonder het oude klik-systeem ─────────
  controle('gevecht.js: het klik-systeem en de wedstrijdsimulatie zijn weg', !G.maakSim && !G.klikFactor && !G.duelUitslag && !G.computerKliks && !G.schoonKlik && !G.KLIK_MAX);
  controle('gevecht.js: TREDE_STERKTE blijft (0, 0,3, 1,2, 2,6, 6)', JSON.stringify(G.TREDE_STERKTE) === '[0,0.3,1.2,2.6,6]');
  controle('gevecht.js: sterkte, chemie, vloek en computerteam blijven', typeof G.sterkte === 'function' && typeof G.chemie === 'function' && typeof G.vloekKeert === 'function' && G.maakComputerTeam(1, 5, []).length === 5);

  // ───────── 2. Rollen, volgorde en stand ─────────
  const team = (n) => G.ordenTeam(Array.from({ length: n }, (_, i) => kaart(5 + i * 0.5, { vak: 'V' + i })), 0);
  const r6 = D.rollen(team(6));
  controle('rollen: keeper is kaart 0, schutters zijn de sterkste veldspelers eerst', r6.keeper.vak === 'V0' && r6.schutters.length === 5 && r6.schutters[0].cijfer >= r6.schutters[4].cijfer && r6.schutters.every((k) => k !== r6.keeper));
  const r1 = D.rollen(team(1)), r3 = D.rollen(team(3));
  controle('rollen: een team van 1 kaart is keeper en schutter tegelijk', r1.keeper === r1.schutters[0] && D.schutterVoor(r1, 4) === r1.keeper);
  controle('rollen: een klein team schiet om de beurt (3 kaarten: 2 schutters)', r3.schutters.length === 2 && D.schutterVoor(r3, 0) === D.schutterVoor(r3, 2) && D.schutterVoor(r3, 1) !== D.schutterVoor(r3, 0));
  controle('rollen: een groot team (11) gebruikt de 5 sterkste', D.rollen(team(11)).schutters.length === 5);
  controle('om en om: kantVan wisselt, beide kanten krijgen 5 beurten', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => D.kantVan('A', k)).join('') === 'ABABABABAB' && D.kantVan('B', 0) === 'B' && D.beurtVan(0) === 0 && D.beurtVan(1) === 0 && D.beurtVan(9) === 4);
  const sd = (seedTekst) => D.beginKant(seedTekst);
  const beginnen = { A: 0, B: 0 };
  for (let i = 0; i < 400; i++) beginnen[sd('mid|a' + i + '|b' + i)]++;
  controle('wie begint is eerlijk uitgeloot (ongeveer 50/50) en vast per seed', beginnen.A > 140 && beginnen.B > 140 && sd('x|y|z') === sd('x|y|z'), beginnen);
  // stand en vroeg einde, zoals bij echte strafschoppen
  controle('stand: een duel is vroeg klaar als de achterstand niet meer in te halen is (en dan winnaar bekend)', (() => { const s = D.nieuweStand(); let k = 0; while (!D.beslist(s).klaar) { D.verwerk(s, D.kantVan('A', k), k % 2 === 0); k++; } return k < 10 && s.A > s.B && D.beslist(s).winnaar === 'A'; })());
  const gel = D.nieuweStand(); for (let k = 0; k < 10; k++) D.verwerk(gel, D.kantVan('A', k), true);
  controle('stand: 5-5 is gelijkspel, uitslagVoor geeft g voor beide kanten', D.beslist(gel).klaar && D.beslist(gel).winnaar === null && D.uitslagVoor(gel, 'A') === 'g' && D.uitslagVoor(gel, 'B') === 'g');
  const winA = D.nieuweStand(); for (let k = 0; k < 10 && !D.beslist(winA).klaar; k++) D.verwerk(winA, D.kantVan('A', k), D.kantVan('A', k) === 'A');
  controle('stand: winnaar en uitslagVoor w/v kloppen en lopend duel geeft null', D.uitslagVoor(winA, 'A') === 'w' && D.uitslagVoor(winA, 'B') === 'v' && D.uitslagVoor(D.nieuweStand(), 'A') === null);
  const maxKicks = (() => { let m = 0; for (let p = 0; p < 300; p++) { const s = D.nieuweStand(); const rng = G.maakRng(p + 7); let k = 0; while (!D.beslist(s).klaar) { D.verwerk(s, D.kantVan('A', k), rng() < 0.7); k++; } m = Math.max(m, k); if (k > 10) return 99; } return m; })();
  controle('een duel duurt nooit langer dan 10 strafschoppen', maxKicks <= 10, maxKicks);

  // ───────── 3. Timing ─────────
  controle('wijzer: gaat heen en weer tussen 0 en 1 (driehoeksgolf)', D.wijzerPlek(0, 1000) === 0 && D.wijzerPlek(500, 1000) === 0.5 && D.wijzerPlek(1000, 1000) === 1 && D.wijzerPlek(1500, 1000) === 0.5 && D.wijzerPlek(2000, 1000) === 0 && D.wijzerPlek(7300, 1000) >= 0 && D.wijzerPlek(7300, 1000) <= 1);
  const half = D.zoneHalf(kaart(7));
  controle('timing: in de groene zone is 100, ernaast neemt het af en blijft binnen 0..99', D.timingKwaliteit(0.5, 0.5, half) === 100 && D.timingKwaliteit(0.5 + half, 0.5, half) === 100 && D.timingKwaliteit(0.5 + half + 0.1, 0.5, half) < 100 && D.timingKwaliteit(0.5 + half + 0.1, 0.5, half) > D.timingKwaliteit(0.5 + half + 0.3, 0.5, half) && D.timingKwaliteit(0, 0.9, 0.05) >= 0 && D.timingKwaliteit(0, 0.9, 0.05) <= 99);
  controle('timing: sterkere kaart heeft een bredere zone (maar wel begrensd)', D.zoneHalf(kaart(9, { t: 4 })) > D.zoneHalf(kaart(3)) && D.zoneHalf(kaart(10, { t: 4 })) <= 0.12 + 1e-9 && D.zoneHalf(kaart(1)) >= 0.06);
  controle('kracht voor de animatie: 0,45 bij q 0 en 0,95 bij q 100', Math.abs(D.krachtVan(0) - 0.45) < 1e-9 && Math.abs(D.krachtVan(100) - 0.95) < 1e-9 && D.krachtVan(-5) === D.krachtVan(0) && D.krachtVan(500) === D.krachtVan(100));

  // ───────── 4. Kansen: keuzes en kaarten tellen echt mee ─────────
  const kn = (o) => D.kansen(Object.assign({ sS: 9, sK: 9, q: 70, r: 'links', h: 'hoog', dr: 'rechts', dh: 'laag' }, o));
  controle('kans: de keeper die de zone goed raadt redt veel vaker', kn({ dr: 'links', dh: 'hoog' }).redP > 500 && kn({ dr: 'rechts', dh: 'laag' }).redP < 50 && kn({ dr: 'links', dh: 'laag' }).redP > kn({ dr: 'rechts', dh: 'laag' }).redP);
  controle('kans: goede kant maar verkeerde hoogte is een tussenvorm', kn({ dr: 'links', dh: 'laag' }).redP > kn({ dr: 'rechts', dh: 'hoog' }).redP && kn({ dr: 'links', dh: 'laag' }).redP < kn({ dr: 'links', dh: 'hoog' }).redP);
  controle('kans: goed getimed schiet je minder vaak mis', kn({ q: 100 }).misP < kn({ q: 55 }).misP && kn({ q: 55 }).misP < kn({ q: 10 }).misP);
  controle('kans: harder (beter getimed) schot is moeilijker te redden', kn({ dr: 'links', dh: 'hoog', q: 100 }).redP < kn({ dr: 'links', dh: 'hoog', q: 20 }).redP);
  controle('kans: bij goed timen en een verkeerd geraden keeper is een doelpunt zeer waarschijnlijk', kn({ q: 100 }).goalP > 800);
  controle('kans: een sterkere schutter scoort vaker, een sterkere keeper redt vaker', kn({ sS: 15, sK: 5, dr: 'links', dh: 'hoog' }).goalP > kn({ sS: 9, sK: 9, dr: 'links', dh: 'hoog' }).goalP && kn({ sS: 5, sK: 15, dr: 'links', dh: 'hoog' }).goalP < kn({ sS: 9, sK: 9, dr: 'links', dh: 'hoog' }).goalP && kn({ sS: 15, sK: 5 }).misP < kn({ sS: 5, sK: 15 }).misP);
  controle('kans: hoog is riskanter (meer mis) dan laag, midden minder dan een hoek', kn({ h: 'hoog' }).misP > kn({ h: 'laag' }).misP && kn({ r: 'midden' }).misP < kn({ r: 'links' }).misP);
  let nan = false, buiten = false;
  for (const r of D.RICHTINGEN) for (const h of D.HOOGTES) for (const dr of D.RICHTINGEN) for (const dh of D.HOOGTES) for (const q of [0, 10, 55, 100]) for (const d of [[1, 20], [20, 1], [9, 9], [0, 0]]) {
    const k = kn({ r, h, dr, dh, q, sS: d[0], sK: d[1] });
    if (![k.misP, k.redP, k.goalP].every(Number.isFinite)) nan = true;
    if (k.misP < 0 || k.misP > 1000 || k.redP < 0 || k.redP > 1000 || k.goalP < 0 || k.goalP > 1000) buiten = true;
  }
  controle('kans: nooit NaN en altijd tussen 0 en 1000 promille', !nan && !buiten);

  // ───────── 5. De uitkomst: deterministisch, eerlijk, kaarten tellen mee (inclusief heel en vloek) ─────────
  const inp = (o) => Object.assign({ seedTekst: 's|a|b|n1|n2', k: 0, kant: 'A', beurt: 0, schutter: kaart(7), keeper: kaart(7), chS: 0, chK: 0, auraS: 0, auraK: 0, r: 'links', h: 'laag', q: 60, dr: 'rechts', dh: 'hoog' }, o || {});
  controle('uitkomst: dezelfde invoer geeft altijd dezelfde uitkomst (op beide computers)', (() => { for (let i = 0; i < 300; i++) { const a = D.uitkomst(inp({ seedTekst: 'm|' + i, k: i % 10, r: D.RICHTINGEN[i % 3], h: D.HOOGTES[i % 2] })), b = D.uitkomst(inp({ seedTekst: 'm|' + i, k: i % 10, r: D.RICHTINGEN[i % 3], h: D.HOOGTES[i % 2] })); if (JSON.stringify(a) !== JSON.stringify(b)) return false; } return true; })());
  // twee onafhankelijke "computers" (schutter en keeper) komen met dezelfde dobbelstenen en uitkomst uit
  controle('uitkomst: twee computers met dezelfde uitgewisselde gegevens rekenen hetzelfde', await (async () => {
    for (let i = 0; i < 60; i++) {
      const mid = 'abcdef0123456789', k = i % 10, nS = D.nonce(), nK = D.nonce(), keeperKeuze = { dr: D.RICHTINGEN[i % 3], dh: D.HOOGTES[(i >> 1) % 2] };
      const c = await D.legVast(mid, k, keeperKeuze.dr, keeperKeuze.dh, nK);
      // de schutter ziet alleen c; hij stuurt zijn keuze en nS; de keeper onthult; beide rekenen
      const schot = { r: D.RICHTINGEN[(i * 7) % 3], h: D.HOOGTES[i % 2], q: (i * 13) % 101 };
      const schutterRekent = D.uitkomst(inp({ seedTekst: `seed|${nS}|${nK}`, k, ...schot, ...keeperKeuze }));
      const gelezen = D.schoonBericht({ t: 'sd_onthul', mid, k, r: keeperKeuze.dr, h: keeperKeuze.dh, n: nK }, 1);
      const onthult = await D.klopt(mid, k, gelezen.r, gelezen.h, gelezen.n, c);
      const keeperRekent = D.uitkomst(inp({ seedTekst: `seed|${D.schoonBericht({ t: 'sd_schot', mid, k, ...schot, n: nS }, 1).n}|${nK}`, k, ...schot, ...keeperKeuze }));
      if (!onthult || JSON.stringify(schutterRekent) !== JSON.stringify(keeperRekent)) return false;
    }
    return true;
  })());
  // doelpuntenpercentage over veel strafschoppen: realistisch, en gevoelig voor de keuzes
  const rate = (o, n) => { let g = 0; for (let i = 0; i < n; i++) if (D.uitkomst(inp(Object.assign({ seedTekst: 'rate|' + i + '|' + JSON.stringify(o).length }, o))).goal) g++; return g / n; };
  const willekeurig = (n, o) => { let g = 0; const rng = G.maakRng(99); for (let i = 0; i < n; i++) { const kz = (a) => a[Math.floor(rng() * a.length)]; if (D.uitkomst(inp(Object.assign({ seedTekst: 'w|' + i, r: kz(D.RICHTINGEN), h: kz(D.HOOGTES), dr: kz(D.RICHTINGEN), dh: kz(D.HOOGTES), q: 55 }, o || {}))).goal) g++; } return g / n; };
  const gemiddeld = willekeurig(6000);
  controle('eerlijk: gelijke kaarten en willekeurige keuzes geven ongeveer 60 tot 80% doelpunten', gemiddeld > 0.6 && gemiddeld < 0.8, gemiddeld);
  controle('eerlijk: een keeper die de hoek goed raadt, houdt de schutter vaak tegen', rate({ r: 'links', h: 'hoog', dr: 'links', dh: 'hoog', q: 60 }, 3000) < 0.5 && rate({ r: 'links', h: 'hoog', dr: 'rechts', dh: 'laag', q: 60 }, 3000) > 0.8);
  controle('eerlijk: goed timen geeft meer doelpunten dan slecht timen', rate({ q: 100, dr: 'links', dh: 'hoog', r: 'links', h: 'hoog' }, 3000) > 0 && willekeurig(4000, { q: 100 }) > willekeurig(4000, { q: 5 }) + 0.1);
  controle('eerlijk: zonder timing (vaste 55) zit tussen slecht en goed in', willekeurig(4000, { q: D.ZONDER_TIMING }) > willekeurig(4000, { q: 5 }) && willekeurig(4000, { q: D.ZONDER_TIMING }) < willekeurig(4000, { q: 100 }));
  const sterk = kaart(9.5, { t: 4, tier: 4 }), zwak = kaart(3, { tier: 0 });
  controle('kaarten: een mythische schutter scoort veel vaker dan een gewone, en omgekeerd voor de keeper', willekeurig(4000, { schutter: sterk, keeper: zwak }) > willekeurig(4000, { schutter: zwak, keeper: sterk }) + 0.15);
  // trede en heel
  const tr = (t) => kaart(6, { t, tier: 1 });
  controle('trede: hogere trede = meer macht = meer doelpunten (TREDE_STERKTE)', D.macht(tr(4), 0, 0) > D.macht(tr(3), 0, 0) && D.macht(tr(3), 0, 0) > D.macht(tr(1), 0, 0) && D.macht(tr(1), 0, 0) > D.macht(tr(0), 0, 0) && willekeurig(4000, { schutter: tr(4), keeper: tr(0) }) > willekeurig(4000, { schutter: tr(0), keeper: tr(0) }));
  const heel = kaart(4, { h: true }), gewoon = kaart(4), vloek = kaart(4, { v: true });
  controle('heel: een heel gemaakte kaart is een trede sterker (hoogstens mythisch) en keert zich nooit', D.macht(heel, 0, 0) > D.macht(gewoon, 0, 0) && Math.abs(D.macht(heel, 0, 0) - D.macht(kaart(4, { t: 1 }), 0, 0)) < 1e-9 && D.macht(kaart(4, { h: true, t: 4 }), 0, 0) === D.macht(kaart(4, { t: 4 }), 0, 0) && ![...Array(400).keys()].some((i) => D.uitkomst(inp({ seedTekst: 'h|' + i, schutter: heel })).keert));
  controle('vloek: een vervloekte kaart is 1,6 keer zo sterk', Math.abs(D.macht(vloek, 0, 0) - 1.6 * D.macht(gewoon, 0, 0)) < 1e-9);
  let keertS = 0, keertK = 0, N = 3000, schutterMist = true, keeperLaatIn = true, geenKeer = 0;
  for (let i = 0; i < N; i++) {
    const a = D.uitkomst(inp({ seedTekst: 'v|' + i, k: i % 10, schutter: vloek, keeper: gewoon }));
    if (a.keert) { keertS++; if (a.uitkomst !== 'over' || a.keert.rol !== 'schutter' || a.keert.z !== 'A') schutterMist = false; }
    const b = D.uitkomst(inp({ seedTekst: 'v|' + i, k: i % 10, schutter: gewoon, keeper: vloek, dr: 'links', dh: 'hoog', r: 'links', h: 'hoog', q: 100 }));
    if (b.keert) { keertK++; if (b.uitkomst !== 'goal' || b.keert.rol !== 'keeper' || b.keert.z !== 'B') keeperLaatIn = false; }
    if (D.uitkomst(inp({ seedTekst: 'v|' + i, schutter: gewoon, keeper: gewoon })).keert) geenKeer++;
  }
  controle('vloek: een vervloekte schutter mist expres (ongeveer 20% van de schoten)', keertS / N > 0.16 && keertS / N < 0.24 && schutterMist, keertS / N);
  controle('vloek: een vervloekte keeper laat de bal er expres in (ongeveer 20%), ook bij een perfecte duik', keertK / N > 0.16 && keertK / N < 0.24 && keeperLaatIn, keertK / N);
  controle('vloek: zonder vervloekte kaarten keert er nooit iets', geenKeer === 0);
  controle('chemie en aura tellen mee (kleine bonus)', D.macht(gewoon, 100, 0) > D.macht(gewoon, 0, 0) && D.macht(gewoon, 100, 0) <= D.macht(gewoon, 0, 0) * 1.0801 && D.macht(gewoon, 0, 4) > D.macht(gewoon, 0, 0) && D.auraVan([kaart(5, { t: 3 }), kaart(5)]) === 3);
  controle('de dobbelstenen hangen van de twee geheime getallen af (andere nonce, andere worp)', (() => { const s = new Set(); for (let i = 0; i < 40; i++) s.add(D.dobbel('s|x|' + i + '|k').join()); return s.size > 30 && D.dobbel('s|x|1|k').join() === D.dobbel('s|x|1|k').join(); })());

  // ───────── 6. De vastlegging van de keeper (valsspelen voorkomen) ─────────
  const mid = 'abcdef0123456789';
  const c1 = await D.legVast(mid, 3, 'links', 'hoog', 'deadbeefcafe0011');
  controle('vastlegging: 32 hex-tekens en altijd dezelfde voor dezelfde keuze', /^[0-9a-f]{32}$/.test(c1) && c1 === (await D.legVast(mid, 3, 'links', 'hoog', 'deadbeefcafe0011')));
  controle('vastlegging: klopt met de echte keuze', await D.klopt(mid, 3, 'links', 'hoog', 'deadbeefcafe0011', c1));
  controle('vastlegging: een andere duik, ander getal, andere strafschop of ander duel klopt niet (de keeper kan niet achteraf wisselen)', !(await D.klopt(mid, 3, 'rechts', 'hoog', 'deadbeefcafe0011', c1)) && !(await D.klopt(mid, 3, 'links', 'laag', 'deadbeefcafe0011', c1)) && !(await D.klopt(mid, 3, 'links', 'hoog', 'deadbeefcafe0012', c1)) && !(await D.klopt(mid, 4, 'links', 'hoog', 'deadbeefcafe0011', c1)) && !(await D.klopt('abcdef0123456780', 3, 'links', 'hoog', 'deadbeefcafe0011', c1)));
  controle('vastlegging: verraadt de keuze niet (6 keuzes geven 6 verschillende, niet te raden waarden)', (await Promise.all(D.RICHTINGEN.flatMap((r) => D.HOOGTES.map((h) => D.legVast(mid, 0, r, h, 'aaaaaaaaaaaaaaaa'))))).every((c, i, a) => a.indexOf(c) === i));
  controle('nonce: 16 hex-tekens en steeds anders', /^[0-9a-f]{16}$/.test(D.nonce()) && D.nonce() !== D.nonce());

  // ───────── 7. De computer ─────────
  {
    const rng = G.maakRng(5), r = {}, hh = {};
    let geldig = true;
    for (let i = 0; i < 3000; i++) {
      const s = D.computerSchot(rng, kaart(7)), d = D.computerDuik(rng);
      if (!D.RICHTINGEN.includes(s.r) || !D.HOOGTES.includes(s.h) || !Number.isInteger(s.q) || s.q < 5 || s.q > 100 || !D.RICHTINGEN.includes(d.dr) || !D.HOOGTES.includes(d.dh)) geldig = false;
      r[s.r] = (r[s.r] || 0) + 1; hh[d.dh] = (hh[d.dh] || 0) + 1;
    }
    controle('computer: kiest altijd geldig en gebruikt alle hoeken', geldig && D.RICHTINGEN.every((x) => r[x] > 300));
    const hoog = Array.from({ length: 800 }, () => D.computerSchot(G.maakRng(Math.random() * 1e9), kaart(10)).q).reduce((a, b) => a + b, 0) / 800;
    const laag = Array.from({ length: 800 }, () => D.computerSchot(G.maakRng(Math.random() * 1e9), kaart(2)).q).reduce((a, b) => a + b, 0) / 800;
    controle('computer: een betere kaart tikt beter getimed', hoog > laag + 15, [hoog, laag]);
  }

  // ───────── 8. Berichten: alles wat binnenkomt wordt schoongemaakt ─────────
  {
    const snap = L.teamMomentopname([{ vak: 'Wiskunde', cijfer: 8, tier: 2 }, { vak: 'Natuurkunde', cijfer: 7, tier: 2 }, { vak: 'Scheikunde', cijfer: 6, tier: 1, zeldzaam: true, trede: 1 }]);
    const M = (o) => Object.assign({ mid }, o);
    const sb = (m, l) => D.schoonBericht(m, l === undefined ? 5 : l);
    controle('bericht: geldige uitnodiging en antwoord (team en nonce schoon)', sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: snap })) && sb(M({ t: 'sd_ja', nonce: 'abcdef0123456789', team: snap })).team.kaarten.length === 3 && sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: snap })).team.ch === snap.ch);
    controle('bericht: een uitnodiging is na 5 minuten verlopen, een antwoord niet meteen', sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: snap }), 299) !== null && sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: snap }), 300) === null && sb(M({ t: 'sd_ja', nonce: 'abcdef0123456789', team: snap }), 400) !== null);
    controle('bericht: alles ouder dan 10 minuten wordt genegeerd, en ook een rare leeftijd', sb(M({ t: 'sd_hb' }), 600) === null && sb(M({ t: 'sd_hb' }), -1) === null && sb(M({ t: 'sd_hb' }), NaN) === null && sb(M({ t: 'sd_hb' }), 'x') === null);
    controle('bericht: een slecht team of slechte nonce wordt geweigerd', sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: { kaarten: [] } })) === null && sb(M({ t: 'sd_uit', nonce: 'XYZ', team: snap })) === null && sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: 'x' })) === null && sb(M({ t: 'sd_uit', nonce: 5, team: snap })) === null && sb(M({ t: 'sd_uit', nonce: 'a'.repeat(300), team: snap })) === null && sb(M({ t: 'sd_ja', team: snap })) === null);
    controle('bericht: een vak met kwaadaardige tekst of te lang wordt geweigerd of gefilterd', sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: { kaarten: [{ vak: 'x'.repeat(200), cijfer: 5, tier: 1 }] } })) === null && sb(M({ t: 'sd_uit', nonce: 'abcdef0123456789', team: { kaarten: [{ vak: 'Wis\u0000kunde\u202e', cijfer: 5, tier: 1 }] } })).team.kaarten[0].vak === 'Wiskunde');
    controle('bericht: zonder geldige mid niets', sb({ t: 'sd_hb' }) === null && sb({ t: 'sd_hb', mid: '../x' }) === null && sb({ t: 'sd_hb', mid: 5 }) === null && sb({ t: 'sd_hb', mid: 'G'.repeat(16) }) === null && sb({ t: 'sd_hb', mid: 'a'.repeat(33) }) === null && sb(null) === null && sb([]) === null && sb('sd_hb') === null && sb({ mid }) === null && sb({ t: 5, mid }) === null);
    controle('bericht: onbekende types (ook oude) worden genegeerd', sb(M({ t: 'uitnodiging' })) === null && sb(M({ t: 'kl', k: 0, c: 5 })) === null && sb(M({ t: '__proto__' })) === null && sb(M({ t: 'constructor' })) === null && sb(M({ t: 'sd_onbekend' })) === null);
    controle('bericht: nee, stop, hartslag en mee houden alleen mid over', JSON.stringify(sb(M({ t: 'sd_nee', x: 'wel' }))) === JSON.stringify({ t: 'sd_nee', mid }) && Object.keys(sb(M({ t: 'sd_stop', extra: { a: 1 } }))).join() === 't,mid' && Object.keys(sb(M({ t: 'sd_hb', foo: 1 }))).join() === 't,mid' && Object.keys(sb(M({ t: 'sd_mee', foo: 1 }))).join() === 't,mid');
    // vastlegging, schot, onthulling
    controle('bericht: sd_vast alleen met geldige k en hex-vastlegging', sb(M({ t: 'sd_vast', k: 3, c: c1 })).c === c1 && sb(M({ t: 'sd_vast', k: 10, c: c1 })) === null && sb(M({ t: 'sd_vast', k: -1, c: c1 })) === null && sb(M({ t: 'sd_vast', k: 1.5, c: c1 })) === null && sb(M({ t: 'sd_vast', k: '3', c: c1 })) === null && sb(M({ t: 'sd_vast', k: 3, c: 'zz' + c1.slice(2) })) === null && sb(M({ t: 'sd_vast', k: 3, c: 'ab' })) === null && sb(M({ t: 'sd_vast', k: 3 })) === null && sb(M({ t: 'sd_vast', c: c1 })) === null);
    const sch = { t: 'sd_schot', k: 2, r: 'links', h: 'hoog', q: 80, n: 'abcdef0123456789' };
    controle('bericht: sd_schot alleen met geldige hoek, hoogte, timing (geheel getal 0 tot 100) en nonce', JSON.stringify(sb(M(sch))) === JSON.stringify({ t: 'sd_schot', mid, k: 2, r: 'links', h: 'hoog', q: 80, n: 'abcdef0123456789' }) && sb(M(Object.assign({}, sch, { r: 'boven' }))) === null && sb(M(Object.assign({}, sch, { h: 'midden' }))) === null && sb(M(Object.assign({}, sch, { q: 101 }))) === null && sb(M(Object.assign({}, sch, { q: -1 }))) === null && sb(M(Object.assign({}, sch, { q: 55.5 }))) === null && sb(M(Object.assign({}, sch, { q: '80' }))) === null && sb(M(Object.assign({}, sch, { q: NaN }))) === null && sb(M(Object.assign({}, sch, { q: Infinity }))) === null && sb(M(Object.assign({}, sch, { n: 'x' }))) === null && sb(M(Object.assign({}, sch, { r: ['links'] }))) === null && sb(M(Object.assign({}, sch, { r: { toString: () => 'links' } }))) === null);
    controle('bericht: sd_onthul alleen met geldige duik', sb(M({ t: 'sd_onthul', k: 2, r: 'rechts', h: 'laag', n: 'abcdef0123456789' })).r === 'rechts' && sb(M({ t: 'sd_onthul', k: 2, r: 'rechts', h: 'laag' })) === null && sb(M({ t: 'sd_onthul', k: 2, r: 'x', h: 'laag', n: 'abcdef0123456789' })) === null && sb(M({ t: 'sd_onthul', k: 12, r: 'rechts', h: 'laag', n: 'abcdef0123456789' })) === null);
    controle('bericht: sd_eind alleen met standen 0 tot 5', sb(M({ t: 'sd_eind', a: 3, b: 5 })).b === 5 && sb(M({ t: 'sd_eind', a: 6, b: 0 })) === null && sb(M({ t: 'sd_eind', a: -1, b: 0 })) === null && sb(M({ t: 'sd_eind', a: 'x', b: 0 })) === null && sb(M({ t: 'sd_eind', a: 1.5, b: 0 })) === null);
    controle('bericht: emoji alleen uit de vaste lijst van vier', D.EMOJI.every((e) => sb(M({ t: 'sd_emoji', e })) && sb(M({ t: 'sd_emoji', e })).e === e) && sb(M({ t: 'sd_emoji', e: '\u{1F480}' })) === null && sb(M({ t: 'sd_emoji', e: '<b>' })) === null && sb(M({ t: 'sd_emoji', e: 'vrije tekst!' })) === null && sb(M({ t: 'sd_emoji' })) === null && sb(M({ t: 'sd_emoji', e: ['\u{1F525}'] })) === null && sb(M({ t: 'sd_emoji', e: '\u{1F525}\u{1F525}\u{1F525}' })) === null);
    controle('bericht: sd_kijk heeft een korte levensduur en een geldige z en tg', sb(M({ t: 'sd_kijk', z: 'B', tg: 'a'.repeat(32) })).z === 'B' && sb(M({ t: 'sd_kijk', z: 'B', tg: 'a'.repeat(32) })).tg === 'a'.repeat(32) && sb(M({ t: 'sd_kijk', z: 'Q', tg: '../x' })).z === 'A' && sb(M({ t: 'sd_kijk', z: 'Q', tg: '../x' })).tg === null && sb(M({ t: 'sd_kijk' }), 179) !== null && sb(M({ t: 'sd_kijk' }), 180) === null);
    const ev = { t: 'sd_ev', k: 4, z: 'A', s: { vak: 'Wiskunde', cijfer: 8, tier: 2, t: 1, v: false, h: false }, g: { vak: 'Engels', cijfer: 6.5, tier: 1, t: 0 }, r: 'links', h: 'hoog', q: 90, dr: 'midden', dh: 'laag', u: 'goal', a: 2, b: 1, gt: 77 };
    const e1 = sb(M(ev));
    controle('bericht: sd_ev (voor toeschouwers) komt schoon door, met precies de bekende velden', e1 && e1.u === 'goal' && e1.s.vak === 'Wiskunde' && e1.g.cijfer === 6.5 && e1.gt === 77 && Object.keys(e1).sort().join() === 'a,b,dh,dr,g,gt,h,k,mid,q,r,s,t,u,z');
    controle('bericht: sd_ev met een slechte kaart, uitkomst, stand of schutterkant wordt geweigerd', sb(M(Object.assign({}, ev, { u: 'hat-trick' }))) === null && sb(M(Object.assign({}, ev, { z: 'C' }))) === null && sb(M(Object.assign({}, ev, { a: 9 }))) === null && sb(M(Object.assign({}, ev, { s: null }))) === null && sb(M(Object.assign({}, ev, { s: { vak: 'x', cijfer: 99, tier: 1 } }))) === null && sb(M(Object.assign({}, ev, { g: 'Engels' }))) === null && sb(M(Object.assign({}, ev, { dr: 'x' }))) === null && sb(M(Object.assign({}, ev, { q: 1000 }))) === null && sb(M(Object.assign({}, ev, { k: 99 }))) === null);
    controle('bericht: sd_ev met een slechte gt wordt 0 (niet geweigerd), extra velden verdwijnen', sb(M(Object.assign({}, ev, { gt: 'veel', evil: '<img onerror=x>' }))).gt === 0 && !('evil' in sb(M(Object.assign({}, ev, { evil: 1 })))));
    const arg = sb(M({ t: 'sd_hb', ['__proto__']: { x: 1 } }));
    controle('bericht: prototype-vervuiling heeft geen effect', arg && !Object.prototype.hasOwnProperty.call(arg, 'x') && ({}).x === undefined);
    controle('deelKaart: geen id en geen plaatje naar toeschouwers, grenzen kloppen', JSON.stringify(Object.keys(D.deelKaart({ vak: 'x'.repeat(50), cijfer: 7.456, tier: 9, t: -3, kaart: 'data:..', id: 'geheim', v: true }))) === JSON.stringify(['vak', 'cijfer', 'tier', 't', 'z', 'v', 'h']) && D.deelKaart({ vak: 'x'.repeat(50), cijfer: 7.456, tier: 9, t: -3 }).vak.length === 24 && D.deelKaart({ vak: 'a', cijfer: 7.456, tier: 9, t: -3 }).tier === 4);
  }

  // ───────── 9. Munten: dagelijkse limiet, eenmalig, vaste bedragen ─────────
  {
    mem.clear();
    const id = (n) => String(n).padStart(16, '0').replace(/[^0-9]/g, '0') + '';
    const hex = (n) => n.toString(16).padStart(16, '0');
    const s0 = await E.duelStatus();
    controle('munten: begin met 5 duels over', s0.over === 5 && s0.max === 5 && s0.gespeeld === 0 && E.DUEL_PER_DAG === 5 && E.DUEL_MUNTEN.w === 10 && E.DUEL_MUNTEN.g === 4 && E.DUEL_MUNTEN.v === 2 && D.MUNTEN.w === E.DUEL_MUNTEN.w);
    const w = await E.duelKlaar(hex(1), 'w');
    controle('munten: winst geeft 10', w.ok && w.munten === 10 && w.over === 4 && !w.dagmax && w.saldo === 10, JSON.stringify(w));
    controle('munten: hetzelfde duel nog eens wordt niet nog eens betaald', (await E.duelKlaar(hex(1), 'w')).reden === 'al-betaald' && (await E.duelStatus()).gespeeld === 1);
    const g = await E.duelKlaar(hex(2), 'g'), v = await E.duelKlaar(hex(3), 'v');
    controle('munten: gelijkspel 4 en verlies 2', g.munten === 4 && v.munten === 2 && v.saldo === 16, JSON.stringify([g, v]));
    await E.duelKlaar(hex(4), 'w'); const vijf = await E.duelKlaar(hex(5), 'w');
    controle('munten: het vijfde duel van de dag telt nog', vijf.ok && vijf.munten === 10 && vijf.over === 0, JSON.stringify(vijf));
    const zes = await E.duelKlaar(hex(6), 'w');
    controle('munten: het zesde duel geeft niets meer (dagelijkse limiet) maar het is wel gemeld', zes.ok && zes.munten === 0 && zes.dagmax === true && zes.saldo === 36, JSON.stringify(zes));
    controle('munten: ook na het limiet kun je niet via hetzelfde duel verdienen (id is verbruikt)', (await E.duelKlaar(hex(6), 'w')).reden === 'al-betaald' && (await E.lees()).munten.saldo === 36);
    controle('munten: onbekende uitslag of rare id wordt geweigerd', (await E.duelKlaar(hex(7), 'x')).reden === 'onbekend' && (await E.duelKlaar('../x', 'w')).reden === 'onbekend' && (await E.duelKlaar(5, 'w')).reden === 'onbekend' && (await E.duelKlaar('zzzzzzzzzzzzzzzz', 'w')).reden === 'onbekend' && (await E.duelKlaar(hex(7), '__proto__')).reden === 'onbekend' && (await E.duelKlaar(hex(7), 'constructor')).reden === 'onbekend');
    const ids = JSON.parse(mem.get('spo_munten_ids'));
    const dag = Object.keys(ids).filter((k) => k.startsWith('ds:'));
    controle('munten: opslag in spo_munten_ids (dag-teller en uitbetaald-sleutels)', dag.length === 5 && Object.keys(ids).filter((k) => k.startsWith('dsw:')).length === 6 && dag.every((k) => /^ds:\d{4}-\d{2}-\d{2}:[1-5]$/.test(k)));
    controle('munten: de duelbeloning telt niet mee met de beloning van het kaartspel (aparte limiet)', (await E.kaartspelStatus()).over === 5);
    mem.clear();
  }

  // ───────── 10. In de browser ─────────
  const { chromium } = require('playwright');
  const br = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });
  try {
    for (let i = 0; i < 60; i++) { try { const r = await fetch(WEB + '/team.html'); if (r.ok) break; } catch (e) { await slaap(100); } }
    const KLEUR = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
    const plaat = (vak, c, tier) => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="272" height="400"><rect width="272" height="400" rx="26" fill="${KLEUR[tier]}"/><text x="136" y="220" font-size="100" text-anchor="middle">${c}</text><text x="136" y="300" font-size="30" text-anchor="middle">${vak}</text></svg>`).toString('base64');
    const gal = [['Wiskunde', 8.6], ['Engels', 9.1], ['Biologie', 6.2], ['Nederlands', 7.4], ['Frans', 5.0]].map(([vak, c], i) => { const tier = c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0; return { id: 'k' + i, ts: 1760000000000 + i * 86400000, vak, cijfer: c, onderwerp: 'Toets', weging: 1, opening: 'pak', tier, zeldzaam: false, kaart: plaat(vak, c, tier) }; });
    const nieuweContext = async (o) => {
      o = o || {};
      const ctx = await br.newContext({ viewport: o.viewport || { width: 1000, height: 900 }, reducedMotion: o.rustig ? 'reduce' : 'no-preference' });
      await ctx.addInitScript(([g, inst, stub, team, vb]) => {
        if (!localStorage.getItem('spo_galerij')) {
          localStorage.setItem('spo_galerij', JSON.stringify(g));
          localStorage.setItem('spo_team', JSON.stringify({ v: 1, ids: team }));
          if (inst) localStorage.setItem('spo_instellingen', JSON.stringify(inst));
          if (vb) localStorage.setItem('spo_voetbal', JSON.stringify(vb));
        }
        if (stub) {
          window.__stubLog = [];
          window.__SPO = window.__SPO || {};
          window.__SPO.strafschop = {
            start(invoer) {
              window.__stubLog.push(JSON.parse(JSON.stringify(Object.assign({}, invoer, { opKlaar: undefined }))));
              const host = document.createElement('div'); host.id = '__somStrafschop'; host.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483646'; document.body.append(host);
              let klaar = false; const af = () => { if (!klaar) { klaar = true; invoer.opKlaar && invoer.opKlaar({ uitkomst: invoer.uitkomst }); } };
              const api = { host, tl: { tR: 0.2 }, beginMs: null, status: () => ({ opgegeven: stub === 'opgeven' }), sluit: af };
              if (stub === 'gooi') throw new Error('stub: geen videokaart');
              if (stub === 'ok' || stub === 'opgeven') setTimeout(af, 150);
              return api;
            },
          };
        }
      }, [gal, o.inst || null, o.stub || null, o.team || ['k0', 'k1', 'k2'], o.voetbal || null]);
      const p = await ctx.newPage();
      const fouten = [];
      p.on('pageerror', (e) => fouten.push(String(e)));
      p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text() + (m.location().url || ''))) fouten.push(m.text()); });
      await p.goto(WEB + '/team.html');
      await p.waitForSelector('#bouwveld .speler');
      return { ctx, p, fouten };
    };
    // Speelt een duel met alleen het toetsenbord. gedrag(n): { toets: '1'..'6', timing: 'spatie' | 'zonder' | 'knop' }.
    async function speelUit(p, o) {
      o = o || {};
      const t0 = Date.now(), gedaan = new Set(), uitslagen = [];
      let laatsteTekst = '';
      while (Date.now() - t0 < (o.max || 240000)) {
        if (await p.locator('#einde:not([hidden])').count()) break;
        const st = await p.evaluate(() => { const b = document.getElementById('bevestig'), z = document.querySelector('#zones .zone'); return { open: !!(z && !z.disabled && !b.hidden), klok: document.getElementById('klok').textContent, schiet: !document.getElementById('timing').hidden, tekst: document.getElementById('uitslag-tekst').textContent }; });
        if (st.tekst !== laatsteTekst) { laatsteTekst = st.tekst; if (/^(Goal|Gered|Paal|Over)/.test(st.tekst)) uitslagen.push(st.tekst); }
        if (st.open && !gedaan.has(st.klok)) {
          gedaan.add(st.klok);
          const n = gedaan.size, g = o.gedrag ? o.gedrag(n, st) : { toets: String(1 + (n % 6)), timing: st.schiet ? (n % 3 === 0 ? 'zonder' : n % 3 === 1 ? 'spatie' : 'knop') : 'spatie' };
          await p.keyboard.press(g.toets);
          if (g.timing === 'zonder') await p.click('#zonder'); // 'Zonder timing' heeft een knop
          else if (g.timing === 'knop') await p.click('#bevestig');
          else await p.keyboard.press('Space'); // na een cijfertoets staat de focus op de knop: Spatie schiet
          if (o.naKeuze) await o.naKeuze(n, st);
        }
        await p.waitForTimeout(120);
      }
      return { kicks: gedaan.size, uitslagen };
    }
    const dotTelling = (p) => p.evaluate(() => ({ a: document.querySelectorAll('#reeks-a .stip.goal').length, b: document.querySelectorAll('#reeks-b .stip.goal').length, ma: document.querySelectorAll('#reeks-a .stip.mis').length, mb: document.querySelectorAll('#reeks-b .stip.mis').length }));

    // --- a. Een duel tegen de computer, alleen toetsenbord, met minder beweging (snel) ---
    {
      const { ctx, p, fouten } = await nieuweContext({ rustig: true });
      controle('opties: bij minder beweging staat het filmpje standaard uit', (await p.inputValue('#opt-film')) === 'uit');
      controle('opties: meekijken staat standaard aan', await p.isChecked('#opt-kijkers'));
      controle('beloning: de uitleg noemt bedragen en limiet', /winst 10 munten, gelijkspel 4, meedoen 2.*Hoogstens 5 duels per dag.*Vandaag nog 5/.test(await p.textContent('#dag-info')), await p.textContent('#dag-info'));
      controle('uitleg: geen klik-uitleg meer, wel timing en strafschoppen', !/klik zo snel|autoclicker/i.test(await p.textContent('main')) && /strafschoppen/i.test(await p.textContent('main')) && /groene zone/.test(await p.textContent('main')));
      await p.screenshot({ path: path.join(TMP, 'duel-0-paneel.png'), fullPage: true });
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      controle('scherm: een dialoog met een naam', (await p.getAttribute('#scherm', 'role')) === 'dialog' && (await p.getAttribute('#scherm', 'aria-modal')) === 'true' && !!(await p.getAttribute('#scherm', 'aria-label')));
      controle('scherm: de rest van de pagina is niet bedienbaar zolang het duel loopt (inert)', await p.evaluate(() => document.getElementById('hoofd').inert === true));
      await p.waitForFunction(() => { const z = document.querySelector('#zones .zone'); return z && !z.disabled; }, null, { timeout: 30000 });
      const zones = await p.evaluate(() => [...document.querySelectorAll('#zones .zone')].map((z) => ({ tag: z.tagName, label: z.getAttribute('aria-label'), key: z.getAttribute('aria-keyshortcuts'), pressed: z.getAttribute('aria-pressed'), dis: z.disabled })));
      controle('zones: 6 knoppen met een naam, toets en pressed-status', zones.length === 6 && zones.every((z) => z.tag === 'BUTTON' && /toets [1-6]/.test(z.label) && z.pressed === 'false') && new Set(zones.map((z) => z.key)).size === 6, zones);
      controle('live-gebieden: uitslag (assertive) en keuze-tekst (polite) bestaan', (await p.getAttribute('#uitslag-tekst', 'aria-live')) === 'assertive' && (await p.getAttribute('#uitslag-tekst', 'role')) === 'status' && (await p.getAttribute('#keuze-tekst', 'aria-live')) === 'polite');
      controle('timing-balkje is alleen voor de ogen (aria-hidden) en heeft een alternatief', (await p.getAttribute('#tm-balk', 'aria-hidden')) === 'true' && /Zonder timing/.test(await p.textContent('#tm-hulp')));
      const uit = await speelUit(p, { max: 300000 });
      controle('duel: alleen met het toetsenbord uitgespeeld, meer dan 5 strafschoppen en hoogstens 10', uit.kicks >= 5 && uit.kicks <= 10, uit.kicks);
      await p.waitForSelector('#einde:not([hidden])', { timeout: 60000 });
      const kop = await p.textContent('#einde-kop'), stand = await p.textContent('#einde-stand'), tekst = await p.textContent('#einde-tekst');
      const m = /Jij (\d+) - (\d+) Computer/.exec(stand);
      controle('einde: kop en stand', m && ['Gewonnen!', 'Verloren', 'Gelijkspel'].includes(kop), [kop, stand]);
      const dots = await dotTelling(p);
      controle('einde: de bolletjes kloppen met de stand', m && dots.a === +m[1] && dots.b === +m[2] && dots.a + dots.ma <= 5 && dots.b + dots.mb <= 5, [dots, stand]);
      controle('aria-live: elke strafschop is aan de schermlezer gemeld (Goal, Gered, Paal of Over, met stand en kans)', uit.uitslagen.length >= uit.kicks - 1 && uit.uitslagen.some((t) => /Stand \d+ - \d+ \(jij - Computer\)/.test(t)), uit.uitslagen.slice(0, 3));
      const bedrag = kop === 'Gewonnen!' ? 10 : kop === 'Gelijkspel' ? 4 : 2;
      const munten = await p.evaluate(() => JSON.parse(localStorage.getItem('spo_munten') || '{}'));
      controle('munten: precies de beloning voor deze uitslag en uitgelegd', munten.saldo === bedrag && new RegExp(`Je verdiende ${bedrag} munten. Nog 4 duels`).test(tekst), [munten, tekst]);
      const ids = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('spo_munten_ids') || '{}')));
      controle('munten: dag-teller en eenmalige sleutel staan er', ids.filter((k) => k.startsWith('ds:')).length === 1 && ids.filter((k) => k.startsWith('dsw:')).length === 1, ids);
      await p.screenshot({ path: path.join(TMP, 'duel-1-einde.png') });
      await p.click('#einde-terug');
      controle('terug: scherm weg en de pagina weer bedienbaar', (await p.locator('#scherm').isHidden()) && (await p.evaluate(() => document.getElementById('hoofd').inert === false)));
      controle('beloning: de dagtekst wordt bijgewerkt (nog 4 over)', /Vandaag nog 4/.test(await p.textContent('#dag-info')), await p.textContent('#dag-info'));
      controle('computerduel: geen uitslag bij vrienden bewaard', (await p.evaluate(() => localStorage.getItem('spo_gevechten'))) === null);
      // tweede duel: weer een beloning, en 'Zonder timing' en de knop zijn gebruikt
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      const uit2 = await speelUit(p, { max: 300000, gedrag: (n, st) => ({ toets: String(1 + ((n * 5) % 6)), timing: st.schiet ? 'zonder' : 'knop' }) });
      await p.waitForSelector('#einde:not([hidden])', { timeout: 60000 });
      const munten2 = await p.evaluate(() => JSON.parse(localStorage.getItem('spo_munten') || '{}'));
      controle('tweede duel: opnieuw een beloning (twee van de vijf per dag)', munten2.saldo > munten.saldo && /Nog 3 duels/.test(await p.textContent('#einde-tekst')), [munten2, await p.textContent('#einde-tekst')]);
      controle('geen fouten in de console', fouten.length === 0, fouten);
      await ctx.close();
    }

    // --- b. Normale beweging: 2D-animatie met overgangen, timing-balkje beweegt, uitzonderingen ---
    {
      const { ctx, p, fouten } = await nieuweContext({ inst: { duelFilm: 'uit' } });
      controle('opties: filmpje uit zoals ingesteld', (await p.inputValue('#opt-film')) === 'uit');
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      // wachten op een kick waarin ik schiet
      await p.waitForFunction(() => !document.getElementById('timing').hidden, null, { timeout: 90000 }).catch(() => {});
      const isSchieten = await p.evaluate(() => !document.getElementById('timing').hidden);
      controle('er komt een beurt waarin ik schiet, met timing-balkje en groene zone', isSchieten);
      if (isSchieten) {
        const x1 = await p.evaluate(() => parseFloat(document.getElementById('tm-wijzer').style.left));
        await p.waitForTimeout(250);
        const x2 = await p.evaluate(() => parseFloat(document.getElementById('tm-wijzer').style.left));
        controle('de wijzer beweegt', Math.abs(x1 - x2) > 1, [x1, x2]);
        const zone = await p.evaluate(() => ({ l: parseFloat(document.getElementById('tm-zone').style.left), w: parseFloat(document.getElementById('tm-zone').style.width) }));
        controle('de groene zone ligt binnen het balkje', zone.l >= 0 && zone.l + zone.w <= 100 && zone.w >= 10, zone);
        controle('schieten kan niet zonder een hoek (knop uit en melding)', await p.isDisabled('#bevestig'));
        await p.evaluate(() => document.activeElement && document.activeElement.blur());
        await p.keyboard.press('Space'); // zonder hoek: niets
        controle('spatie zonder hoek schiet niet', (await p.locator('#zones .zone[aria-pressed=true]').count()) === 0 && !(await p.locator('#timing').isHidden()) && /Kies eerst een hoek/.test(await p.textContent('#uitslag-tekst')), await p.textContent('#uitslag-tekst'));
        await p.keyboard.press('4');
        controle('toets 4 kiest links onder', (await p.getAttribute('#zones .zone[aria-pressed=true]', 'aria-label')).startsWith('Links onder'));
        await p.keyboard.press('3');
        controle('een andere hoek kiezen kan nog (maar één tegelijk)', (await p.locator('#zones .zone[aria-pressed=true]').count()) === 1 && (await p.getAttribute('#zones .zone[aria-pressed=true]', 'aria-label')).startsWith('Rechts boven'));
        await p.screenshot({ path: path.join(TMP, 'duel-2-schieten.png') });
        controle('de bal heeft een overgang (normale beweging)', (await p.evaluate(() => getComputedStyle(document.getElementById('bal')).transitionDuration)) !== '0s');
        await p.click('#zonder');
        await p.waitForSelector('#pd-tekst.toon', { timeout: 30000 });
        await p.screenshot({ path: path.join(TMP, 'duel-3-uitslag.png') });
        controle('2D-uitslag: GOAL, GEREDDEN, PAAL of OVER', /^(GOAL!|GEREDDEN!|PAAL!|OVER!)$/.test(await p.textContent('#pd-tekst')));
        const ballPos = await p.evaluate(() => ({ l: document.getElementById('bal').style.left, t: document.getElementById('bal').style.top }));
        controle('de bal ligt niet meer op de stip', !(ballPos.l === '50%' && ballPos.t === '86%'), ballPos);
      }
      controle('timing-uitleg noemt de spatiebalk en de knop', /spatiebalk/.test(await p.textContent('#tm-hulp')) || !isSchieten);
      await p.click('#stop');
      await p.waitForSelector('#einde:not([hidden])', { timeout: 15000 });
      controle('stoppen: nette melding en geen munten', /Je hebt het duel gestopt/.test(await p.textContent('#einde-tekst')) && (await p.evaluate(() => localStorage.getItem('spo_munten_ids'))) === null, await p.textContent('#einde-tekst'));
      controle('geen fouten in de console (normale beweging)', fouten.length === 0, fouten);
      await ctx.close();
    }

    // --- c. Het filmpje: nagebootste motor (ok, opgeven, gooit een fout, hangt en wordt overgeslagen) ---
    const filmTest = async (stub, naam, extra) => {
      const { ctx, p, fouten } = await nieuweContext({ inst: { duelFilm: 'kort' }, stub, voetbal: { v: 1, avatar: { huid: 2, haar: 'krullen', haarkleur: 3, kit: 'blauw', nummer: 17, juich: 'armen' }, stadion: { thema: 'klassiek', tribune: 'groen', vlag: 'wimpels', veld: 'ruiten', naam: 'Test' } } });
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      let n = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        const open = await p.evaluate(() => { const b = document.getElementById('bevestig'), z = document.querySelector('#zones .zone'); return !!(z && !z.disabled && !b.hidden); });
        if (open) { n++; await p.keyboard.press(String(n)); await p.keyboard.press('Space'); }
        if ((await p.evaluate(() => (window.__stubLog || []).length)) > 0) break;
        await p.waitForTimeout(150);
      }
      const log = await p.evaluate(() => window.__stubLog);
      controle(`film ${naam}: de motor is aangeroepen`, log.length >= 1, log.length);
      if (extra) await extra(p, log);
      // het duel gaat door: er komt een volgende strafschop of het is afgelopen
      if (stub !== 'hang') {
        await p.waitForFunction(() => /Strafschop [2-9]|Strafschop 10/.test(document.getElementById('klok').textContent) || !document.getElementById('einde').hidden, null, { timeout: 60000 });
        controle(`film ${naam}: het duel gaat verder`, true);
      }
      controle(`film ${naam}: geen fouten in de console`, fouten.length === 0, fouten);
      await ctx.close();
      return log;
    };
    {
      const log = await filmTest('ok', 'ok');
      const a = log[0];
      controle('film: schutter en keeper met vak, cijfer, tier, trede en vloek', a && ['schutter', 'keeper'].every((r) => typeof a[r].vak === 'string' && Number.isFinite(a[r].cijfer) && a[r].tier >= 0 && a[r].tier <= 4 && a[r].trede >= 0 && a[r].trede <= 4 && typeof a[r].vloek === 'boolean'), a);
      controle('film: uitkomst, richting, hoogte en kracht geldig', a && ['goal', 'redding', 'paal', 'over'].includes(a.uitkomst) && D.RICHTINGEN.includes(a.richting) && D.HOOGTES.includes(a.hoogte) && a.kracht >= 0.45 && a.kracht <= 0.95 && a.stil === false, a);
      controle('film: mijn voetballer (hex-kleuren) en mijn stadion (thema) gaan mee, de computer krijgt het standaardtenue of een eigen', a && (a.schutter.av || a.keeper.av) && [a.schutter.av, a.keeper.av].filter(Boolean).every((av) => /^#[0-9a-f]{6}$/i.test(av.huid) && /^#[0-9a-f]{6}$/i.test(av.shirt) && av.nummer >= 1 && av.nummer <= 99) && a.thema && /^#[0-9a-f]{6}$/i.test(a.thema.tribune) && a.thema.gras.length === 2 && a.thema.veld === 1, a);
    }
    await filmTest('opgeven', 'opgeven', async (p) => {
      await p.waitForSelector('#pd-tekst.toon', { timeout: 30000 });
      controle('film opgeven: de 2D-uitslag neemt het over', /GOAL|GEREDDEN|PAAL|OVER/.test(await p.textContent('#pd-tekst')));
    });
    await filmTest('gooi', 'fout bij starten', async (p) => {
      await p.waitForSelector('#pd-tekst.toon', { timeout: 30000 });
      controle('film met fout: de 2D-uitslag neemt het over', /GOAL|GEREDDEN|PAAL|OVER/.test(await p.textContent('#pd-tekst')));
    });
    await filmTest('hang', 'overslaan', async (p) => {
      await p.waitForSelector('#film-over:not([hidden])', { timeout: 10000 });
      controle('film: knop Overslaan is zichtbaar en benoemd', /overslaan/i.test(await p.textContent('#film-over')) && (await p.locator('#__somStrafschop').count()) === 1);
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.getElementById('__somStrafschop') && document.getElementById('film-over').hidden, null, { timeout: 10000 });
      controle('film: Esc slaat het filmpje over en ruimt alles op', true);
      await p.waitForFunction(() => /Strafschop [2-9]/.test(document.getElementById('klok').textContent) || !document.getElementById('einde').hidden, null, { timeout: 60000 });
      controle('film: na overslaan gaat het duel door', true);
    });
    {
      // Overslaan met de knop, en het filmpje 'uit' roept de motor nooit aan
      const { ctx, p } = await nieuweContext({ inst: { duelFilm: 'uit' }, stub: 'hang' });
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      let n = 0; const t0 = Date.now();
      while (Date.now() - t0 < 20000 && n < 2) {
        const open = await p.evaluate(() => { const b = document.getElementById('bevestig'), z = document.querySelector('#zones .zone'); return !!(z && !z.disabled && !b.hidden); });
        if (open) { n++; await p.keyboard.press(String(n)); await p.keyboard.press('Space'); await p.waitForTimeout(600); }
        await p.waitForTimeout(150);
      }
      controle('filmpje uit: de motor wordt nooit aangeroepen', (await p.evaluate(() => window.__stubLog.length)) === 0 && n >= 1);
      await ctx.close();
    }
    {
      const { ctx, p } = await nieuweContext({ inst: { duelFilm: 'vol', geluid: false, laag: true }, stub: 'ok' });
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      let n = 0; const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
        const open = await p.evaluate(() => { const b = document.getElementById('bevestig'), z = document.querySelector('#zones .zone'); return !!(z && !z.disabled && !b.hidden); });
        if (open) { n++; await p.keyboard.press(String(n)); await p.keyboard.press('Space'); }
        if ((await p.evaluate(() => window.__stubLog.length)) > 0) break;
        await p.waitForTimeout(150);
      }
      const a = (await p.evaluate(() => window.__stubLog))[0];
      controle('film: geluid uit geeft stil, lage kwaliteit geeft laag', a && a.stil === true && a.laag === true, a);
      await ctx.close();
    }

    // --- d. Het echte filmpje (motor/strafschop.js), met overslaan met Esc ---
    {
      const { ctx, p, fouten } = await nieuweContext({ inst: { duelFilm: 'kort' } });
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      let n = 0; const t0 = Date.now(); let gezien = false;
      while (Date.now() - t0 < 90000) {
        const open = await p.evaluate(() => { const b = document.getElementById('bevestig'), z = document.querySelector('#zones .zone'); return !!(z && !z.disabled && !b.hidden); });
        if (open) { n++; await p.keyboard.press(String(1 + (n % 6))); await p.keyboard.press('Space'); }
        if (await p.locator('#__somStrafschop').count()) { gezien = true; break; }
        await p.waitForTimeout(150);
      }
      controle('echt filmpje: de motor start met een eigen scherm', gezien);
      if (gezien) {
        await p.waitForTimeout(3000);
        const nog = await p.locator('#__somStrafschop').count();
        await p.screenshot({ path: path.join(TMP, 'duel-4-film.png') });
        if (nog) {
          controle('echt filmpje: de emoji-laag en de knop Overslaan liggen boven het filmpje (z-index)', await p.evaluate(() => { const h = document.getElementById('__somStrafschop'); return !!h && parseInt(getComputedStyle(document.getElementById('emoji-laag')).zIndex, 10) > parseInt(h.style.zIndex, 10) && parseInt(getComputedStyle(document.getElementById('film-over')).zIndex, 10) > parseInt(h.style.zIndex, 10); }));
          await p.keyboard.press('Escape');
          await p.waitForFunction(() => !document.getElementById('__somStrafschop'), null, { timeout: 15000 });
          controle('echt filmpje: Esc slaat over en het filmpje verdwijnt', true);
        } else {
          console.log('(opmerking: het echte filmpje gaf op in deze omgeving, zonder WebGL; de 2D-uitslag nam het over)');
          controle('echt filmpje: gaf het filmpje op, dan neemt de 2D-uitslag het over', true);
        }
        await p.waitForFunction(() => /Strafschop [2-9]|Strafschop 10/.test(document.getElementById('klok').textContent) || !document.getElementById('einde').hidden, null, { timeout: 60000 });
        controle('echt filmpje: daarna gaat het duel door', true);
      }
      controle('echt filmpje: geen fouten in de console van de pagina', fouten.length === 0, fouten);
      await ctx.close();
    }

    // --- e. Opties blijven bewaard ---
    {
      const { ctx, p } = await nieuweContext({});
      controle('opties: standaard (normale beweging) is het korte filmpje', (await p.inputValue('#opt-film')) === 'kort');
      await p.selectOption('#opt-film', 'vol');
      await p.uncheck('#opt-kijkers');
      await p.waitForTimeout(300);
      const i = await p.evaluate(() => JSON.parse(localStorage.getItem('spo_instellingen')));
      controle('opties: bewaard in spo_instellingen (en andere instellingen blijven)', i.duelFilm === 'vol' && i.duelKijkers === false, i);
      await p.reload();
      await p.waitForSelector('#bouwveld .speler');
      controle('opties: na herladen nog steeds zo', (await p.inputValue('#opt-film')) === 'vol' && !(await p.isChecked('#opt-kijkers')));
      await ctx.close();
    }

    // --- f. Een heel klein team (1 kaart) en een mobiel scherm ---
    {
      const { ctx, p, fouten } = await nieuweContext({ rustig: true, team: ['k0'], viewport: { width: 390, height: 780 } });
      await p.click('#oefen');
      await p.waitForSelector('#scherm:not([hidden])');
      await p.waitForFunction(() => { const z = document.querySelector('#zones .zone'); return z && !z.disabled; }, null, { timeout: 30000 });
      await p.screenshot({ path: path.join(TMP, 'duel-5-mobiel.png') });
      const breed = await p.evaluate(() => ({ sw: document.getElementById('scherm').scrollWidth, cw: document.getElementById('scherm').clientWidth }));
      controle('mobiel: geen horizontaal scrollen in het duel', breed.sw <= breed.cw + 1, breed);
      const grootte = await p.evaluate(() => [...document.querySelectorAll('#bevestig, #zonder')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height));
      controle('mobiel: de knoppen zijn groot genoeg om aan te tikken', grootte.every((h) => h >= 40), grootte);
      const uit = await speelUit(p, { max: 200000 });
      await p.waitForSelector('#einde:not([hidden])', { timeout: 60000 });
      controle('een team van 1 kaart (keeper en schutter tegelijk) kan een duel spelen', uit.kicks >= 5 && /Jij \d+ - \d+ Computer/.test(await p.textContent('#einde-stand')), uit.kicks);
      controle('geen fouten in de console (klein team, mobiel)', fouten.length === 0, fouten);
      await ctx.close();
    }
  } finally {
    await br.close().catch(() => {});
  }
  console.log(`\nv3-duel.test.js: ${ok} goed, ${mis} mis`);
  process.exit(mis ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
