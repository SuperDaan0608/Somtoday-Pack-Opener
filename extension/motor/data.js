/*
 * Somtoday Pack Opener — data.js
 * De gegevens van één pakket: cijfer, niveau (tier), teksten en kleuren. Alle andere bestanden
 * van de animatie lezen hieruit, zodat ze het over dezelfde cijfers hebben.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});

  const klem = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, p) => a + (b - a) * p;
  const glad = (p) => {
    p = klem(p, 0, 1);
    return p * p * (3 - 2 * p);
  };
  const uitEase = (p) => 1 - Math.pow(1 - klem(p, 0, 1), 3);
  const inEase = (p) => Math.pow(klem(p, 0, 1), 3);
  const uitEase5 = (p) => 1 - Math.pow(1 - klem(p, 0, 1), 5);
  // een verende ‘pop’ die even over de rand schiet en dan rustig landt
  const veer = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(p * 9));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const tekst = (v, reserve, max) => (String(v == null ? '' : v).replace(/\s+/g, ' ').trim() || reserve).slice(0, max);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const hex3 = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  function hsv(h, s, v, uit) {
    h = ((h % 1) + 1) % 1;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    const r = [v, q, p, p, t, v][i % 6];
    const gr = [t, v, v, q, p, p][i % 6];
    const b = [p, p, t, v, v, q][i % 6];
    if (uit) {
      uit[0] = r;
      uit[1] = gr;
      uit[2] = b;
      return uit;
    }
    return [r, gr, b];
  }

  // Vijf niveaus, net als bij FIFA. kleur = de hoofdkleur van het licht, kleur2 = de tweede kleur.
  const TIERS = [
    { naam: 'Brons', label: 'Oei…', sub: 'Volgende keer beter!', pal: ['#3d220e', '#a8692f', '#e3b07e'], tekst: '#2b1808', gloed: '#e08a4a', gloed2: '#8a4a22' },
    { naam: 'Zilver', label: 'Voldoende!', sub: 'Netjes gehaald.', pal: ['#556070', '#c3cdd9', '#f4f7fa'], tekst: '#1b222c', gloed: '#dbe8ff', gloed2: '#7aa2ff' },
    { naam: 'Goud', label: 'Walkout!', sub: 'Goud waard.', pal: ['#6a4a06', '#e6b41f', '#fff1a6'], tekst: '#2b1d02', gloed: '#ffc933', gloed2: '#ff7a1a' },
    { naam: 'Speciaal', label: 'Speciaal!', sub: 'Bijna perfect.', pal: ['#030622', '#0d2a80', '#1d7fd0'], tekst: '#eaffff', gloed: '#34dcff', gloed2: '#7a4dff' },
    { naam: 'Icoon', label: 'Icoon! Perfect!', sub: 'Een tien. Een TIEN.', pal: ['#b88f37', '#fff0b8', '#ffffff'], tekst: '#2e2207', gloed: '#ffe27a', gloed2: '#ff5fd2' },
  ];
  TIERS.forEach((t) => {
    t.kleur = hex3(t.gloed);
    t.kleur2 = hex3(t.gloed2);
  });

  // Eigen kaartontwerp (instellingen): alleen de kleuren van de kaart zelf. De kleur van de show blijft bij je cijfer.
  const KAART_THEMAS = {
    auto: { naam: 'Bij je cijfer', pal: null },
    nacht: { naam: 'Nacht', pal: ['#03030a', '#15153d', '#3f3f9a'], tekst: '#e8ecff' },
    roze: { naam: 'Roze', pal: ['#4a0a2e', '#d63a8a', '#ffc2e0'], tekst: '#2a0517' },
    mint: { naam: 'Mint', pal: ['#06382c', '#1fb88a', '#bff5e2'], tekst: '#04251c' },
    rood: { naam: 'Rood', pal: ['#3d0606', '#c71f1f', '#ffb3a6'], tekst: '#2a0505' },
    oceaan: { naam: 'Oceaan', pal: ['#031b3a', '#0a74c9', '#9ad8ff'], tekst: '#021326' },
    paars: { naam: 'Paars', pal: ['#1f0a3d', '#7a3bd8', '#d9c2ff'], tekst: '#150726' },
    zonsondergang: { naam: 'Zonsondergang', pal: ['#3d0a2a', '#ff6a3d', '#ffd98a'], tekst: '#2a0d05' },
    zwartgoud: { naam: 'Zwart en goud', pal: ['#050505', '#2c2410', '#9a7a22'], tekst: '#ffe9a6' },
  };
  const KAART_RANDEN = { standaard: 'Standaard', dubbel: 'Dubbele lijn', neon: 'Neon', dun: 'Dun' };

  const STATS = ['INZ', 'FOC', 'KEN', 'TMP', 'TEC', 'MOT'];

  // De manieren waarop je een cijfer kunt openen. De animatie zelf staat per opening in motor/openingen/;
  // dit zijn alleen de teksten, zodat het startscherm, de popup en content.js ze kennen zonder de rest te laden.
  const OPENINGEN = {
    pak: { naam: 'Pakje', knop: 'Pakket openen', tekst: 'Durf jij het pakket te openen?', aria: 'Pakket openen' },
    kluis: { naam: 'Kluis kraken', knop: 'Kluis kraken', tekst: 'Durf jij de kluis te kraken?', aria: 'Kluis kraken' },
    plinko: { naam: 'Plinko', knop: 'Bal laten vallen', tekst: 'Laat de bal vallen: waar komt hij terecht?', aria: 'Plinko spelen' },
    ster: { naam: 'Wensster', knop: 'Doe een wens', tekst: 'Een ster valt voor jou. Wat brengt hij mee?', aria: 'Een wens doen' },
    raket: { naam: 'Raket', knop: 'Lanceren', tekst: 'Hoe hoog komt jouw raket?', aria: 'Raket lanceren' },
    dans: { naam: 'Dansje', knop: 'Laat hem dansen', tekst: 'Hoe beter hij danst, hoe beter je cijfer. Wat wordt het?', aria: 'Dansje' },
    schiet: { naam: 'Schietkraam', knop: 'Beginnen met schieten', tekst: 'Schiet de andere cijfers weg: welk cijfer blijft over?', aria: 'Schietkraam' },
  };
  const OPENING_LIJST = Object.keys(OPENINGEN);

  // Seizoensthema's: een tijdje per jaar krijgt het pakje een ander uiterlijk en andere geluiden (alleen de opening 'pak').
  // van en tot zijn [maand, dag], allebei inclusief. Staat de begindatum later in het jaar dan de einddatum (kerst), dan loopt het thema over de jaarwisseling.
  const SEIZOENEN = {
    halloween: {
      naam: 'Halloween',
      van: [10, 1],
      tot: [11, 2],
      knop: 'Spookpakje openen',
      tekst: 'Een spookpakje. Trick or treat: wat zit erin?',
      aria: 'Spookpakje openen',
    },
  };
  // keuze: 'auto' (volgens de datum), 'geen' (uit) of de naam van een thema (om het te proberen). nu: een Date, voor de tests.
  const seizoenNu = (keuze, nu) => {
    if (keuze === 'geen') return null;
    if (SEIZOENEN[keuze]) return keuze;
    const n = nu || new Date();
    const dag = (n.getMonth() + 1) * 100 + n.getDate();
    for (const naam of Object.keys(SEIZOENEN)) {
      const s = SEIZOENEN[naam];
      const a = s.van[0] * 100 + s.van[1];
      const b = s.tot[0] * 100 + s.tot[1];
      if (a <= b ? dag >= a && dag <= b : dag >= a || dag <= b) return naam;
    }
    return null;
  };
  // Bij 'willekeurig' kiezen we er één. Dat gebeurt één keer per cijfer (content.js), zodat het opwarmen en het openen hetzelfde kiezen.
  // Een opening telt alleen mee als haar module ook echt geladen is (motor/openingen/<naam>.js).
  const kiesOpening = (v) => {
    const ok = (n) => n === 'pak' || !!(SPO.openingen && SPO.openingen[n]);
    if (v === 'willekeurig') {
      const l = OPENING_LIJST.filter(ok);
      return l[Math.floor(Math.random() * l.length)];
    }
    return OPENINGEN[v] && ok(v) ? v : 'pak';
  };

  // HTML uit een tekst op een veilige manier in een element zetten (zonder de HTML-eigenschap van het element, want Firefox is daar streng op):
  // we laten de browser de tekst eerst in een los document ontleden en zetten die knopen over.
  SPO.zetHtml = function (el, html) {
    const doc = new DOMParser().parseFromString('<!doctype html><html><body>' + html + '</body></html>', 'text/html');
    el.replaceChildren(...Array.from(doc.body.childNodes, (n) => document.importNode(n, true)));
  };

  SPO.KAART_THEMAS = KAART_THEMAS;
  SPO.KAART_RANDEN = KAART_RANDEN;
  SPO.klem = klem;
  SPO.mix = mix;
  SPO.glad = glad;
  SPO.uitEase = uitEase;
  SPO.inEase = inEase;
  SPO.uitEase5 = uitEase5;
  SPO.veer = veer;
  SPO.rnd = rnd;
  SPO.esc = esc;
  SPO.hex3 = hex3;
  SPO.hsv = hsv;
  SPO.TIERS = TIERS;
  SPO.OPENINGEN = OPENINGEN;
  SPO.OPENING_LIJST = OPENING_LIJST;
  SPO.kiesOpening = kiesOpening;
  SPO.SEIZOENEN = SEIZOENEN;
  SPO.seizoenNu = seizoenNu;
  // De teksten van de opening, met het seizoensthema erbij als dat meedoet.
  SPO.openingTekst = (d) => (d.seizoen && SEIZOENEN[d.seizoen] ? SEIZOENEN[d.seizoen] : OPENINGEN[d.opening]);

  SPO.maakData = function (d) {
    const n = parseFloat(String(d.cijfer).replace(',', '.'));
    const g = Number.isFinite(n) ? Math.round(klem(n, 1, 10) * 10) / 10 : 1;
    const I = g / 10; // intensiteit: een 10 is tien keer zo heftig als een 1
    const tier = g >= 9.95 ? 4 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5.5 ? 1 : 0;
    const T = Object.assign({}, TIERS[tier]);
    if (tier === 2 && g >= 8) {
      T.label = 'Topper!';
      T.sub = 'Dit is een topcijfer.';
    }
    const thema = KAART_THEMAS[d.kaartThema];
    if (thema && thema.pal) {
      T.pal = thema.pal;
      T.tekst = thema.tekst;
    }
    const vak = tekst(d.vak, 'Vak', 40);
    let seed = 0;
    for (const ch of vak) seed += ch.charCodeAt(0);
    const fmt = (v) => v.toFixed(1).replace('.', ',');
    const opening = kiesOpening(d.opening);
    const zeldzaam = d.zeldzaam === true || d.zeldzaam === 'true' || d.zeldzaam === 1;
    return {
      g,
      I,
      tier,
      T,
      walkout: g >= 7,
      opening,
      // het seizoensthema geldt alleen voor het pakje; de andere openingen houden hun eigen uiterlijk
      seizoen: opening === 'pak' ? seizoenNu(d.seizoen) : null,
      // een zeldzame kaart: een extra spectaculaire onthulling, los van je cijfer (content.js dobbelt er één op de tien)
      zeldzaam,
      vak,
      onder: tekst(d.onderwerp, 'Toets', 80),
      weging: klem(Math.round(+d.weging) || 1, 1, 10),
      snel: !!d.snel,
      laag: !!d.laag,
      // de naam komt live van de Somtoday-pagina en wordt nergens opgeslagen (ook niet in de galerij)
      persoon: tekst(d.persoon, '', 40),
      rand: KAART_RANDEN[d.kaartRand] ? d.kaartRand : 'standaard',
      direct: !!d.direct,
      fmt,
      cijferTekst: fmt(g),
      afkorting: vak.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase() || 'VAK',
      statWaarde: (i) => klem(Math.round(g * 10 + ((((seed * (i + 7) * 9301 + 49297) % 233280) / 233280) - 0.5) * 18), 5, 99),
      STATS,
      datum: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()),
    };
  };
})();
