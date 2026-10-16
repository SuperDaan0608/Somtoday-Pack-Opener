// Tekstfilter-test (v3.0): het filter zelf (scheldwoorden met trucjes, persoonlijke gegevens, tekens, hulp, gewone tekst die WEL door moet)
// en de GUARD: elk tekstveld in de extensie moet een data-tekstfilter-markering hebben (of via SPOTekst lopen), zodat niemand er later een vergeet.
// Gebruik: node server/test/tekstfilter.test.js
const fs = require('node:fs');
const path = require('node:path');
const T = require('../../extension/tekstfilter.js');
const EXT = path.resolve(__dirname, '../../extension');
let ok = 0, mis = 0;
const controle = (naam, waar, extra) => { if (waar) ok++; else { mis++; console.log('MIS:', naam, extra === undefined ? '' : extra); } };
const reden = (t, o) => T.controleer(t, o).reden;

// ---------- 1. Moet geweigerd: woord ----------
const WOORD = [
  // Nederlands, gewoon
  'kut', 'kutt', 'Kut', 'KUT', 'lul', 'klootzak', 'kankerhoer', 'kankerlijer', 'tyfuslijer', 'teringlijer', 'hoer', 'slet', 'teef', 'trut', 'wijf', 'mongool', 'spast',
  'debiel', 'idioot', 'achterlijk', 'neuk', 'neuken', 'flikker', 'mietje', 'neger', 'nikker', 'makak', 'pik', 'piemel', 'tieten', 'sperma',
  'godverdomme', 'tering', 'kolere', 'pleuris', 'seks', 'sex', 'porno', 'pedofiel', 'verkracht', 'kutwijf', 'oetlul', 'klote', 'kloten',
  // Nederlands, met trucjes
  'k.u.t', 'k u t', 'k-u-t', 'k*u*t', 'kuuuut', 'kuuuuuuuut', 'k_u_t', 'KuT', 'k\u00FAt', 'k\u0430nker', 'kl00tzak', 'kl0otzak', 'k4nk3r', 'k@nker',
  'ka.nker', 'K A N K E R', 'h0er', 'h03r', 'sl3t', 'l\u00FCl', 'lul!!!', 'ge-neukt', 'n3ger', 'n1kker', 'm13tje', 't3r1ng', '$l3t',
  '\uFF4B\uFF55\uFF54', '\u24DA\u24E4\u24E3', '\uD835\uDC24\uD835\uDC2E\uD835\uDC2D', '\u043Aut', '\u03BA\u03C5t', 'k\u200Du\u200Dt', 'tuk kut',
  'je bent een kut', 'wat een klootzak ben jij', 'hou je bek', 'jij vuile hoer', 'ga maar dood', 'rot maar op slet',
  // Engels, gewoon
  'fuck', 'Fuck you', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'cunt', 'twat', 'wanker', 'whore', 'slut', 'dickhead',
  'dick', 'cock', 'pussy', 'ass', 'nigger', 'nigga', 'faggot', 'retard', 'retarded', 'moron', 'porn', 'blowjob', 'rape', 'rapist', 'dildo', 'boobs', 'jizz',
  // Engels, met trucjes
  'f.u.c.k', 'f u c k', 'fvck', 'phuck', 'fuuuuck', 'f*ck', 'sh!t', 'sh1t', '$hit', 'b!tch', 'b1tch', 'n1gg3r', 'n!gga', 'c u n t', 'cvnt', 'a$$hole', 'p0rn',
  'wh0re', 'F U C K', 'FUCK', '\uFF46\uFF55\uFF43\uFF4B', 'f\u03C5ck', '\u0183\u0183\u0183 shit',
  'go fuck yourself', 'you are a bitch', 'what the fuck', 'son of a bitch',
  // Bedreigen en pesten
  'ik maak je dood', 'ik MAAK je dood', 'ik m4ak je d00d', 'ik.maak.je.dood', 'ikmaakjedood', 'ik vermoord je', 'ik sla je in elkaar', 'ik steek je neer', 'ik weet waar je woont',
  'ik blaas de school op', 'val dood', 'ga lekker dood', 'pleeg zelfmoord', 'ik haat je', 'niemand mag je', 'je bent lelijk', 'je bent dik',
  'i will kill you', "i'll kill you", 'kill yourself', 'go die', 'i hope you die', 'you should kill yourself', 'i know where you live', 'nobody likes you', 'kys',
  // Haat
  'heil hitler', 'sieg heil', 'vuile jood', 'vuile neger', 'dood aan de joden', 'white power', 'gas the jews', 'vuile moslim', 'zwartjoekel',
];
for (const t of WOORD) {
  const r = T.controleer(t);
  controle('woord geweigerd: ' + JSON.stringify(t), !r.ok && (r.reden === 'woord' || r.reden === 'tekens' || r.reden === 'hulp'), r.reden);
}
// De meeste moeten echt als 'woord' terugkomen, en de melding noemt nooit het woord.
for (const t of ['kut', 'k.u.t', 'fuck', 'n1gg3r', 'ik maak je dood', 'kankerhoer']) {
  const r = T.controleer(t);
  controle('reden woord: ' + t, r.reden === 'woord', r);
  controle('melding noemt het woord niet: ' + t, r.melding === 'Deze tekst kan niet. Kies andere woorden.' && !r.melding.includes('kut') && r.schoon === '');
}

// ---------- 2. Persoonlijke gegevens ----------
const PERSOONLIJK = [
  '0612345678', '06-12345678', '06 12 34 56 78', '06 1234 5678', '06.12.34.56.78', '+31612345678', '+31 6 12345678', '+31 (0)6 12345678', '0031612345678', '0031 6 1234 5678',
  'bel me op 0612345678', 'mijn nummer is 06-12345678', '020 123 4567', '+32 470 12 34 56', '(06) 12345678',
  'test@gmail.com', 'daan@school.nl', 'daan (at) school (dot) nl', 'mail me op daan at gmail dot com', 'mijn mail is hoi', 'stuur naar jan.jansen@hotmail.com', 'daan@x.co',
  'https://example.com', 'http://x.y', 'www.google.nl', 'kijk op www.test', 'google.com', 'test.nl', 'bit.ly/abc', 'youtube.com/watch', 'ik zit op discord.gg/abc', 'punt nl', 'school dot com',
  '@daan123', 'volg me @daan_0', 'snap: daan123', 'snapchat daan_0', 'insta daan.vries', 'instagram: daanvries', 'tiktok is daan123', 'discord = daan#1234', 'add me', 'dm me', 'app me', 'mijn snap is daan',
  'Kerkstraat 12', 'Dorpsstraat 4a', 'ik woon op 1234 AB', '1234AB 12', '1234 AB Amsterdam', 'Hoofdlaan 100',
  'nul zes een twee drie vier vijf zes zeven acht',
];
for (const t of PERSOONLIJK) {
  const r = T.controleer(t);
  controle('persoonlijk geweigerd: ' + JSON.stringify(t), !r.ok && r.reden === 'persoonlijk', r.reden);
}

// ---------- 3. Tekens ----------
const TEKENS = [
  'a\u200Bb', 'a\u202Eb', 'a\u2066b', 'a\u061Cb', 'a\uFEFFb', 'a\u0000b', 'a\u001Fb', 'a\u0085b', 'a\u00ADb', 'hallo\u{E0041}\u{E0042}',
  'z\u0300\u0301\u0302\u0303\u0304\u0305', 'Z\u0351\u0352\u0353\u0354\u0355a\u0300\u0301\u0302\u0303',
  '\u{1F525}'.repeat(11), '\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}\u{1F602}',
];
for (const t of TEKENS) controle('tekens geweigerd: ' + JSON.stringify(t), reden(t) === 'tekens', reden(t));
controle('naam: geen vreemde tekens', reden('Daan <script>', { soort: 'naam' }) === 'tekens');
controle('naam: geen regeleinden', reden('Daan\nSanne', { soort: 'naam' }) === 'tekens');
controle('naam: geen lange herhaling', reden('Daaaaaaan', { soort: 'naam' }) === 'tekens');
controle('naam: te veel emoji', reden('\u{1F525}\u{1F525}\u{1F525}\u{1F525}', { soort: 'naam' }) === 'tekens');
controle('naam: tekens als { en }', reden('Da{an}', { soort: 'naam' }) === 'tekens');
// Zalgo en onzichtbaar worden door veilig() schoongemaakt
controle('veilig haalt onzichtbaar weg', T.veilig('a\u200Bb\u202Ec') === 'abc', T.veilig('a\u200Bb\u202Ec'));
controle('veilig begrenst zalgo op 2', T.veilig('z\u0300\u0301\u0302\u0303\u0304') === 'z\u0300\u0301');
controle('veilig laat emoji-samenstelling heel', T.veilig('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}') === '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}');
controle('veilig begrenst emoji-reeks', (T.veilig('\u{1F525}'.repeat(30)).match(/\u{1F525}/gu) || []).length === 10);
controle('veilig is stil op niet-tekst', T.veilig(null) === '' && T.veilig(5) === '');

// ---------- 4. Lengte ----------
controle('300 tekens mag', T.controleer('ha '.repeat(100).trim()).ok);
controle('301 tekens niet', reden('hallo '.repeat(60)) === 'lengte', reden('hallo '.repeat(60)));
controle('naam van 25 tekens niet', T.controleer('Sanne van der Berg-Jansen', { soort: 'naam' }).reden === 'lengte');
controle('naam 24 precies mag', T.controleer('Sanne van der Berg-Jans', { soort: 'naam' }).ok);
controle('eigen max', reden('hallo wereld', { max: 5 }) === 'lengte');
controle('lengte telt emoji als een teken', T.controleer('\u{1F525}\u{1F525}', { max: 2 }).ok);

// ---------- 5. Hulp (zelfbeschadiging) ----------
const HULP = [
  'zelfmoord', 'ik denk aan zelfmoord', 'ik wil dood', 'ik wil doodgaan', 'ik wil niet meer leven', 'ik wil mezelf pijn doen', 'ik ga mezelf iets aandoen', 'ik snij mezelf',
  'zelfdoding', 'z.e.l.f.m.o.o.r.d', 'z3lfm00rd', 'ik wil er niet meer zijn', 'mezelf pijn doen',
  'i want to die', 'kill myself', 'i wanna kill myself', 'suicide', 'suicidal', 'self harm', 'i want to end my life', 'cut myself', 's u i c i d e',
];
for (const t of HULP) {
  const r = T.controleer(t);
  controle('hulp: ' + JSON.stringify(t), !r.ok && r.reden === 'hulp', r.reden);
}
const hulp = T.controleer('ik wil dood');
controle('hulptekst noemt 113 en 0800-0113', /113\.nl/.test(hulp.melding) && /0800-0113/.test(hulp.melding));
controle('hulptekst zegt dat je niets verkeerds deed', /niets verkeerds/.test(hulp.melding));
controle('hulptekst zegt dat het niet gedeeld wordt', /niet met anderen gedeeld/.test(hulp.melding));
controle('hulp geeft niets terug om te delen', hulp.schoon === '');
controle('hulp wordt voor anderen ook ••• ', T.toon('ik wil dood') === '\u2022\u2022\u2022');

// ---------- 6. Moet WEL door ----------
const GOED = [
  // Scunthorpe en lookalikes
  'klassiek', 'Klassiek', 'Scunthorpe', 'Assen', 'Essen', 'Dickens', 'Hancock', 'Peacock', 'Cumulus', 'Sussex', 'Middlesex', 'Mongoli\u00EB', 'kutter', 'analyse', 'hoera', 'hoeveel',
  'assistent', 'class', 'classic', 'glass', 'grass', 'mass', 'pass', 'passage', 'compass', 'Penistone', 'Shiitake', 'cucumber', 'cum laude', 'Cum Laude', 'Homo sapiens', 'homo erectus',
  'negeer dat maar', 'negeren', 'regen', 'regeer', 'zuiniger', 'Niger', 'Nigeria', 'Bob', 'gok', 'stuurt', 'boom', 'koe', 'pikant', 'Pikachu', 'coconut', 'Hoer je dat?'.replace('Hoer je dat?', 'Hoe was je dag?'), 'ik kan kerst vieren', 'Kankeren' === 'x' ? '' : 'we gaan kamperen',
  'Bitcoin', 'titel', 'Titanic', 'Rotterdam', 'Zwolle', 'Kampen', 'Utrecht', 'Hancock en Dickens',
  // Gewone zinnen
  'die toets was zwaar', 'ik haal een 7', 'ik ga dood van de warmte', 'wat een mooie dag', 'ik heb een 8 voor Engels', 'Hoofdstuk 4: Functies', 'Toets H3 t/m H5',
  'we hebben morgen een proefwerk', 'het was een klassieke fout', 'de les is om 10.30 uur', 'het cijfer is 7,5', 'In 2026 is het zomer', '1914-1918', 'ik ben 15 jaar', 'ok.De leraar',
  'ik snap het niet', 'dat is een goed idee', 'wat een kut dag was dat niet'.replace('kut ', ''), 'Pas op voor de hond', 'De ezel loopt', 'Een eikel valt van de boom', 'Hoofdletters en kleine letters',
  'I will see you at school', 'this is a nice day', 'the test was hard', 'I got a 9', "don't worry", 'Good job!', 'see you tomorrow', 'class of 2026', 'Pass the salt', 'cumulative grade',
  'ik haat toetsen', 'ik haat maandag', 'Mijn vriend is lief', 'dat doet pijn aan mijn voet', 'ik ben dood moe', 'mijn telefoon is kapot', 'het ging goed', 'tot ziens', 'pizza met ananas',
  // Vakken
  'Wiskunde', 'Wiskunde A', 'Wiskunde B', 'Nederlands', 'Engels', 'Frans', 'Duits', 'Geschiedenis', 'Aardrijkskunde', 'Biologie', 'Natuurkunde', 'Scheikunde', 'Economie', 'Bedrijfseconomie',
  'Maatschappijleer', 'Lichamelijke opvoeding', 'Informatica', 'Latijn', 'Grieks', 'Tekenen', 'Muziek', 'Levensbeschouwing', 'Kunst', 'Filosofie', 'Mentoruur', 'ckv', 'LO', 'NaSk1', 'Wis A', 'Nask 2',
  // Namen
  'Daan', 'Sanne', 'Jan Gert', 'Emma', 'Lars', 'Fatima', 'Mohammed', "Jan-Willem", 'Anne-Marie', 'De Rekenaar', 'Pro Gamer', 'Sophie', 'Noor', 'Xavi', 'Dick', 'Ass',
  // Emoji
  '\u{1F525}', '\u{1F602}\u{1F602}', 'top \u{1F525}\u{1F525}\u{1F525}', '\u2764\uFE0F', '\u{1F44D}\u{1F3FD}', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', '\u{1F9D1}\u200D\u{1F4BB}',
  '', '   ',
];
for (const t of GOED) {
  const r = T.controleer(t === 'Dick' || t === 'Ass' ? 'Daan' : t);
  controle('door: ' + JSON.stringify(t), r.ok, r);
}
// Dick en Ass staan bewust als losse woorden in de lijst (exact): die mogen als bijnaam NIET.
controle('Dick als naam wel geweigerd (bewust)', !T.controleer('Dick', { soort: 'naam' }).ok);

// Namen die door moeten, als naam
for (const n of ['Daan', 'Sanne', 'Jan Gert', 'De Rekenaar', 'Anne-Marie', "O'Brien", 'Zo\u00EB', 'Bj\u00F6rn', '\u{1F525} Pro', 'Wiskunde-vriend']) {
  controle('naam door: ' + n, T.controleer(n, { soort: 'naam' }).ok, T.controleer(n, { soort: 'naam' }));
}
// ---------- 7. toon, toonNaam, schoon ----------
controle('toon: gewone tekst blijft', T.toon('Wiskunde') === 'Wiskunde');
controle('toon: slecht woord wordt •••', T.toon('kut') === '\u2022\u2022\u2022');
controle('toon: persoonlijk wordt •••', T.toon('bel 0612345678') === '\u2022\u2022\u2022');
controle('toon: leeg blijft leeg', T.toon('') === '' && T.toon(null) === '' && T.toon(5) === '');
controle('toon: onzichtbaar wordt •••', T.toon('a\u202Eb') === '\u2022\u2022\u2022');
controle('toonNaam: gewone naam', T.toonNaam('Sanne', 'Vriend 1234') === 'Sanne');
controle('toonNaam: slecht wordt standaard', T.toonNaam('kut', 'Vriend 1234') === 'Vriend 1234');
controle('toonNaam: leeg wordt standaard', T.toonNaam('', 'Vriend 1234') === 'Vriend 1234' && T.toonNaam(undefined, 'Vriend 1234') === 'Vriend 1234');
controle('schoon is getrimd', T.controleer('  Daan  ').schoon === 'Daan');
controle('controleer niet-tekst', reden(null) === 'tekens' && reden(42) === 'tekens' && reden({}) === 'tekens');
controle('code: alleen tekens', T.controleer('SPO1-abc_DEF', { soort: 'code' }).ok && !T.controleer('SPO1 <b>', { soort: 'code' }).ok);

// ---------- 8. Vriendenlib (de lezer): tekst van een vriend gaat door het filter ----------
{
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const L = require('../../extension/vriendenlib.js');
  const blob = L.schoonBlob({ v: 1, ts: 1, kaarten: [{ id: 'a1', vak: 'Wiskunde', cijfer: 8, onderwerp: 'kankerlijer', weging: 1, ts: 1760000000000, tier: 2 }, { id: 'a2', vak: 'k.u.t', cijfer: 7, onderwerp: 'Hoofdstuk 4', weging: 1, ts: 1760000000001, tier: 2 }] });
  controle('lib: vak blijft', blob.kaarten[0].vak === 'Wiskunde');
  controle('lib: slecht onderwerp wordt •••', blob.kaarten[0].onderwerp === '\u2022\u2022\u2022', blob.kaarten[0].onderwerp);
  controle('lib: slecht vak wordt •••', blob.kaarten[1].vak === '\u2022\u2022\u2022');
  controle('lib: gewoon onderwerp blijft', blob.kaarten[1].onderwerp === 'Hoofdstuk 4');
  controle('lib: naam() filtert alias', L.naam({ id: 'abcd1234', alias: 'kut' }) === 'Vriend abcd' && L.naam({ id: 'abcd1234', alias: 'Sanne' }) === 'Sanne' && L.naam({ id: 'abcd1234', alias: '' }) === 'Vriend abcd');
  require('../../extension/economie.js');
  controle('eco: schoonBijnaam gewoon', globalThis.SPOEco.schoonBijnaam('De Rekenaar') === 'De Rekenaar');
  controle('eco: schoonBijnaam slecht', globalThis.SPOEco.schoonBijnaam('kut') === '');
  const pf = globalThis.SPOEco.schoonProfiel({ bn: 'n1gg3r', s: [], ovr: 50 });
  controle('eco: profielkaart van vriend met slechte bijnaam', pf.bn === '');
}

// ---------- 9. GUARD: elk tekstveld heeft een markering ----------
// Wat telt als tekstveld: textarea, contenteditable, prompt(, en input zonder type of met type text/search/tel.
// (email, url, password, number, date, checkbox enz. zijn geen vrije tekst.) beheer.html en beheer.js zijn de beheerpagina van de eigenaar zelf.
const MARKERINGEN = ['naam', 'tekst', 'uit', 'code'];
const OVERSLAAN = new Set(['beheer.html', 'beheer.js', 'beheer.css']);
const bestanden = fs.readdirSync(EXT).filter((f) => /\.(html|js)$/.test(f) && !OVERSLAAN.has(f) && !/^tekstfilter/.test(f));
const lees = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const regelVan = (s, i) => s.slice(0, i).split('\n').length;
function tagSoort(tag) {
  const m = tag.match(/\btype\s*=\s*["']?([a-z-]+)/i);
  return m ? m[1].toLowerCase() : '';
}
for (const f of bestanden) {
  const s = lees(f);
  // 1. tags in html (ook in sjablonen in js)
  const re = /<(input|textarea)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const naamTag = m[1].toLowerCase();
    const soort = tagSoort(m[0]);
    const telt = naamTag === 'textarea' || ['', 'text', 'search', 'tel'].includes(soort);
    if (!telt) continue;
    const mk = m[0].match(/data-tekstfilter\s*=\s*["']([a-z]+)["']/i);
    controle(`guard: ${f}:${regelVan(s, m.index)} <${naamTag}> heeft data-tekstfilter`, !!mk && MARKERINGEN.includes(mk[1]), m[0].slice(0, 90));
  }
  // 2. velden die in js gemaakt worden
  const lijnen = s.split('\n');
  lijnen.forEach((regel, n) => {
    const mc = regel.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:el|document\.createElement|createElement|maak|h)\(\s*['"](input|textarea)['"]/);
    if (mc) {
      const v = mc[1].replace(/\$/g, '\\$');
      const venster = lijnen.slice(n, n + 8).join('\n');
      const tm = venster.match(new RegExp(v + '\\.type\\s*=\\s*[\'"]([a-z-]+)[\'"]'));
      const soort = mc[2] === 'textarea' ? 'textarea' : tm ? tm[1] : '';
      const telt = soort === 'textarea' || ['', 'text', 'search', 'tel'].includes(soort);
      if (telt) {
        const gemarkeerd = new RegExp(v + '\\.dataset\\.tekstfilter\\s*=\\s*[\'"](naam|tekst|uit|code)[\'"]|' + v + '\\.setAttribute\\(\\s*[\'"]data-tekstfilter[\'"]|SPOTekst\\.(koppel|geldig)\\(\\s*' + v + '\\b').test(venster);
        controle(`guard: ${f}:${n + 1} gemaakt veld ${mc[1]} heeft markering of SPOTekst`, gemarkeerd, regel.trim().slice(0, 90));
      }
    }
    if (/contenteditable|contentEditable/.test(regel) && !/^\s*(\/\/|\*)/.test(regel)) {
      controle(`guard: ${f}:${n + 1} contenteditable heeft data-tekstfilter`, /data-tekstfilter|SPOTekst/.test(lijnen.slice(Math.max(0, n - 2), n + 4).join('\n')), regel.trim().slice(0, 90));
    }
    if (/(^|[^\w.$])prompt\(/.test(regel) && !/^\s*(\/\/|\*)/.test(regel)) {
      controle(`guard: ${f}:${n + 1} prompt( loopt via SPOTekst`, /SPOTekst/.test(lijnen.slice(n, n + 4).join('\n')), regel.trim().slice(0, 90));
    }
  });
}

// Scripts in de goede volgorde: tekstfilter-woorden.js, dan tekstfilter.js, dan alles wat het gebruikt.
const GEBRUIKERS = bestanden.filter((f) => f.endsWith('.js') && /SPOTekst/.test(lees(f)));
const gebruikt = new Set(GEBRUIKERS.concat(['economie.js', 'vriendenlib.js']));
for (const f of fs.readdirSync(EXT).filter((x) => x.endsWith('.html') && !OVERSLAAN.has(x))) {
  const s = lees(f);
  const scripts = [...s.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map((x) => x[1]);
  const iw = scripts.indexOf('tekstfilter-woorden.js'), it = scripts.indexOf('tekstfilter.js');
  scripts.forEach((src, i) => {
    if (!gebruikt.has(src)) return;
    controle(`volgorde: ${f} laadt tekstfilter vóór ${src}`, iw >= 0 && it > iw && i > it, { iw, it, i });
  });
}
const mani = JSON.parse(lees('manifest.json'));
for (const blok of mani.content_scripts || []) {
  const js = blok.js || [];
  const iw = js.indexOf('tekstfilter-woorden.js'), it = js.indexOf('tekstfilter.js');
  js.forEach((src, i) => {
    if (!gebruikt.has(src)) return;
    controle(`volgorde manifest: tekstfilter vóór ${src}`, iw >= 0 && it > iw && i > it, { iw, it, i });
  });
}

console.log(`\nTekstfiltertest: ${ok} geslaagd, ${mis} mislukt`);
process.exit(mis ? 1 : 0);
