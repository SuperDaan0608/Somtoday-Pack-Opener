// Wat is nieuw (v3.0): de data in extension/nieuw-data.js, de regels (wanneer verschijnt het venster) en de guard op het manifest.
// Gebruik: node server/test/nieuw.test.js
const fs = require('node:fs');
const path = require('node:path');
const EXT = path.resolve(__dirname, '../../extension');
const DATA = require(EXT + '/nieuw-data.js');
globalThis.__SPO_TEST_ZONDER_START = true;
const N = require(EXT + '/nieuw.js');
const F = require(EXT + '/feedback.js');
const A = require(EXT + '/account.js');
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };

// ───────── 1. De data ─────────
controle('data is een lijst met minstens 8 versies', Array.isArray(DATA) && DATA.length >= 8, DATA.length);
controle('versies staan aflopend (nieuwste bovenaan, geen dubbele)', DATA.every((v, i) => i === 0 || N.vergelijk(DATA[i - 1].versie, v.versie) > 0));
for (const v of DATA) {
  controle(`v${v.versie}: versienummer ziet er goed uit`, /^\d+\.\d+\.\d+$/.test(v.versie));
  controle(`v${v.versie}: titel is gevuld`, typeof v.titel === 'string' && v.titel.trim().length > 0);
  controle(`v${v.versie}: punten niet leeg en hooguit 6`, Array.isArray(v.punten) && v.punten.length >= 1 && v.punten.length <= 6, v.punten && v.punten.length);
  controle(`v${v.versie}: elk punt is tekst, niet leeg en kort`, v.punten.every((p) => typeof p === 'string' && p.trim().length > 0 && p.length <= 220));
  controle(`v${v.versie}: datum is leeg of jjjj-mm-dd`, typeof v.datum === 'string' && (v.datum === '' || N.datumTekst(v.datum) !== ''), v.datum);
  // geen technisch jargon of ontwikkelaarsgeheimen
  controle(`v${v.versie}: geen jargon`, !v.punten.concat(v.titel).some((p) => /api\.php|schema\.sql|sqlite|php|config\.php|token|webgl|localStorage|chrome\.storage|\bETag\b/i.test(p)));
}

// ───────── 2. GUARD: het manifest heeft een entry ─────────
// De regel: er moet een entry zijn voor de versie in manifest.json OF voor een hogere versie (de v3.0.0-entry staat er al voordat
// de coordinator het manifest bij de release naar 3.0.0 zet). Staat het manifest HOGER dan de hoogste entry, dan is de release vergeten.
const manifest = JSON.parse(fs.readFileSync(EXT + '/manifest.json', 'utf8'));
const hoogste = DATA.map((v) => v.versie).sort((a, b) => N.vergelijk(b, a))[0];
controle(`guard: manifest ${manifest.version} heeft een entry (of er is een nieuwere: ${hoogste})`, DATA.some((v) => v.versie === manifest.version) || N.vergelijk(hoogste, manifest.version) > 0);
controle('guard: manifestversie ziet er goed uit', N.geldigeVersie(manifest.version));
// de scripts doen dezelfde controle
for (const s of ['package.sh', 'package-firefox.sh']) {
  const t = fs.readFileSync(path.resolve(__dirname, '../../scripts', s), 'utf8');
  controle(`${s} controleert nieuw-data.js`, /nieuw-data\.js/.test(t));
}

// ───────── 3. Versies vergelijken ─────────
controle('2.10.0 is nieuwer dan 2.9.0', N.vergelijk('2.10.0', '2.9.0') === 1);
controle('2.4.4 < 3.0.0', N.vergelijk('2.4.4', '3.0.0') === -1);
controle('3.0 = 3.0.0', N.vergelijk('3.0', '3.0.0') === 0);
controle('v-voorvoegsel', N.vergelijk('v2.4.4', '2.4.4') === 0);
controle('geldigeVersie', N.geldigeVersie('2.4.4') && !N.geldigeVersie('') && !N.geldigeVersie(undefined) && !N.geldigeVersie('abc') && !N.geldigeVersie(3));

// ───────── 4. Wanneer verschijnt het venster? ─────────
const bp = (g, h) => N.bepaal(g, h, DATA);
controle('verse installatie: geen venster', bp(undefined, '2.4.4').soort === 'vers' && bp(null, '2.4.4').soort === 'vers' && bp('rommel', '2.4.4').soort === 'vers');
controle('al bij: niets', bp('2.4.4', '2.4.4').soort === 'niets');
controle('nieuwer opgeslagen dan manifest: niets', bp('3.0.0', '2.4.4').soort === 'niets');
const b1 = bp('2.2.0', '2.4.4');
controle('update: alleen nieuwe versies, nieuwste eerst', b1.soort === 'nieuw' && b1.lijst[0].versie === '2.4.4' && b1.lijst.every((v) => N.vergelijk(v.versie, '2.2.0') > 0) && b1.lijst.every((v) => N.vergelijk(v.versie, '2.4.4') <= 0), b1.lijst && b1.lijst.map((v) => v.versie));
controle('de nog niet uitgebrachte versie 3.0.0 hoort er niet bij zolang het manifest 2.4.4 is', !b1.lijst.some((v) => v.versie === '3.0.0'));
const b2 = bp('2.4.4', '3.0.0');
controle('naar 3.0.0: alleen 3.0.0', b2.soort === 'nieuw' && b2.lijst.length === 1 && b2.lijst[0].versie === '3.0.0');
controle('update zonder tekst voor die versie: lege lijst', N.bepaal('2.4.4', '2.5.0', DATA).lijst.length === 0);

// ───────── 5. Datum ─────────
controle('lege datum wordt weggelaten', N.datumTekst('') === '' && N.datumTekst(undefined) === '');
controle('ongeldige datum wordt weggelaten', N.datumTekst('morgen') === '' && N.datumTekst('2026-13-40') === '' && N.datumTekst('2026-02-31') === '');
controle('datum netjes', /9 oktober 2026/.test(N.datumTekst('2026-10-09')), N.datumTekst('2026-10-09'));

// ───────── 6. Back-up: samenvoegen, de hoogste versie wint ─────────
controle('back-up bevat spo_nieuw_gezien', fs.readFileSync(EXT + '/account.js', 'utf8').includes("'spo_nieuw_gezien'"));
controle('samenvoegen: hoogste wint (hier)', A.samenvoegen('spo_nieuw_gezien', '2.10.0', '2.9.0') === '2.10.0');
controle('samenvoegen: hoogste wint (daar)', A.samenvoegen('spo_nieuw_gezien', '2.4.4', '3.0.0') === '3.0.0');
controle('samenvoegen: leeg hier geeft daar', A.samenvoegen('spo_nieuw_gezien', undefined, '2.4.4') === '2.4.4');
controle('samenvoegen: gelijk blijft gelijk', A.samenvoegen('spo_nieuw_gezien', '2.4.4', '2.4.4') === '2.4.4');

// ───────── 7. Feedback: info en meldingen ─────────
const UA_WIN_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36';
const UA_EDGE = UA_WIN_CHROME + ' Edg/126.0.2592.81';
const UA_FF = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
controle('browser Chrome', F.browserVan(UA_WIN_CHROME) === 'Chrome 126');
controle('browser Edge (niet Chrome)', F.browserVan(UA_EDGE) === 'Edge 126');
controle('browser Firefox', F.browserVan(UA_FF) === 'Firefox 128');
controle('browser Safari op iOS', F.browserVan(UA_IOS) === 'Safari 17');
controle('browser onbekend', F.browserVan('iets anders') === 'onbekend' && F.browserVan('') === 'onbekend');
controle('systeem Windows / Mac / Linux / Android / iOS', F.systeemVan(UA_WIN_CHROME) === 'Windows' && F.systeemVan(UA_FF) === 'Mac' && F.systeemVan(UA_LINUX) === 'Linux' && F.systeemVan(UA_ANDROID) === 'Android' && F.systeemVan(UA_IOS) === 'iOS');
const info = F.maakInfo({ versie: '2.4.4', ua: UA_WIN_CHROME, laag: false, webgl: true, tab: 'vrienden' });
controle('info: precies de zes onderdelen', info === 'versie 2.4.4; browser Chrome 126; systeem Windows; animaties hoge kwaliteit; WebGL ja; tabblad vrienden', info);
controle('info: lage kwaliteit en geen WebGL', F.maakInfo({ versie: '3.0.0', ua: UA_FF, laag: true, webgl: false, tab: 'instellingen' }) === 'versie 3.0.0; browser Firefox 128; systeem Mac; animaties lage kwaliteit; WebGL nee; tabblad instellingen');
controle('info: bevat niet de volledige user agent', !info.includes('Mozilla') && !info.includes('AppleWebKit') && !info.includes('6478'));
controle('info: past in 300 tekens', info.length <= F.MAX_INFO);
const gek = F.maakInfo({ versie: 'x; kaart Wiskunde 9,5', ua: UA_WIN_CHROME, tab: 'Daan de Vries <b>' });
controle('info: vreemde waarden komen er niet in', !/Wiskunde|Daan|<b>/.test(gek) && /versie onbekend/.test(gek) && /tabblad onbekend/.test(gek), gek);
controle('melding 429', /vandaag al drie keer/.test(F.foutTekst({ status: 429, message: 'x' })));
controle('melding geen verbinding', /Geen verbinding/.test(F.foutTekst({ status: 0, message: 'Geen verbinding met de server.' })));
controle('melding actie onbekend (400)', F.foutTekst({ status: 400, message: 'Onbekende actie.' }) === 'Feedback versturen kan nu nog niet. Probeer het later opnieuw.');
controle('melding ban', F.foutTekst({ status: 403, verbannen: true, message: 'Je bent permanent verbannen.' }) === 'Je bent permanent verbannen.');

console.log(`${ok} goed, ${mis} mis`);
process.exit(mis ? 1 : 0);
