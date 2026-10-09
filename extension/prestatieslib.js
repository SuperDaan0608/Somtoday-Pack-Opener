// Prestaties (badges): de lijst met badges, het uitrekenen uit lokale gegevens en de iconen.
// Alles blijft in deze browser. Werkt zonder DOM (ook in Node); alleen icoon() en maakToast() hebben een document nodig.
//
// Opslag (chrome.storage.local, in tests localStorage):
//   spo_prestaties  { [badgeId]: tijdstip waarop je de badge kreeg }
//   spo_stats       { openingen: [naam...], seizoenen: [naam...], reddingen: getal, chemieMax: getal, teamMax: getal }
// Gelezen: spo_galerij, spo_gevechten, spo_team.
(function () {
  'use strict';

  const SLEUTEL_PRESTATIES = 'spo_prestaties';
  const SLEUTEL_STATS = 'spo_stats';
  const VOLDOENDE = 5.5;
  const OPENINGEN = ['pak', 'kluis', 'plinko', 'ster', 'raket', 'schiet', 'dans'];

  // ---- opslag ----
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  async function lees(sleutel) {
    if (heeftOpslag) { const r = await api.storage.local.get(sleutel); return r[sleutel]; }
    try { const t = localStorage.getItem(sleutel); return t ? JSON.parse(t) : undefined; } catch (e) { return undefined; }
  }
  async function schrijf(sleutel, waarde) {
    if (heeftOpslag) { await api.storage.local.set({ [sleutel]: waarde }); return; }
    localStorage.setItem(sleutel, JSON.stringify(waarde));
  }

  const G = () => globalThis.SPOGevecht || null;
  const tredeVan = (e) => Math.max(0, Math.min(4, (e && e.trede) | 0)) || (e && e.zeldzaam === true ? 1 : 0);
  const getal = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

  // ---- iconen: een medaille (zeshoek) in de kleur van het niveau, met een lijntekening erin ----
  const KLEUREN = [
    ['#f4b27a', '#a35d2a'], // brons
    ['#f6f9ff', '#8e9bb5'], // zilver
    ['#ffe58a', '#d98a1c'], // goud
    ['#8bf3ff', '#2f82d6'], // speciaal
    ['#ffc9f3', '#a24fdb'], // icoon
  ];
  const TIER_NAMEN = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  // Lijntekeningen op 24 x 24 (stijl: Lucide, ISC, of zelf getekend).
  const GLYPHS = {
    kaart: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 8.5l1.1 2.4 2.6.3-1.9 1.8.5 2.6-2.3-1.3-2.3 1.3.5-2.6-1.9-1.8 2.6-.3z',
    stapel: 'M9 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M4 16V6a2 2 0 0 1 2-2h8',
    stapels: 'M10 8h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z M5 16V7a2 2 0 0 1 2-2h8 M2 13V5a2 2 0 0 1 2-2h7',
    vlam: 'M12 3c.6 3.2 5 5.2 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2.2-4.2.1 1.8.8 2.7 1.8 3C10.5 8.5 10.8 5.5 12 3z',
    pijl: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
    beker: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H4v1a4 4 0 0 0 4 4 M16 6h4v1a4 4 0 0 1-4 4 M12 13v4 M8 20h8 M10 17h4',
    diamant: 'M6 4h12l3 5-9 11L3 9z M3 9h18 M9 4L7 9l5 11 5-11-2-5',
    kroon: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
    ster: 'M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.800z',
    boeken: 'M4 19.5V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2 M4 19.5A2 2 0 0 0 6 21h14v-4',
    groepen: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
    spook: 'M6 20V11a6 6 0 0 1 12 0v9l-3-2-3 2-3-2z M9.5 11h.01 M14.5 11h.01',
    pakket: 'M7.5 4.3l9 5.2 M21 8l-9-5-9 5v8l9 5 9-5z M3.3 7l8.7 5 8.7-5 M12 22V12',
    schild: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
    zwaard: 'M14.5 17.5L3 6V3h3l11.5 11.5 M13 19l6-6 M16 16l4 4 M19 21l2-2',
    handen: 'M7 12V6.5a1.5 1.5 0 0 1 3 0V11 M10 10.5V4.5a1.5 1.5 0 0 1 3 0V11 M13 11V5.5a1.5 1.5 0 0 1 3 0V12 M16 9.5a1.5 1.5 0 0 1 3 0V15a6.5 6.5 0 0 1-6.5 6.5h-.500A6.5 6.5 0 0 1 7 18l-3.2-5.2a1.5 1.5 0 0 1 2.5-1.6L8 13.5',
    muur: 'M3 5h18v4H3z M3 9h18v5H3z M3 14h18v5H3z M9 5v4 M15 9v5 M9 14v5',
    doel: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z M12 12h.01',
    team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
    schakel: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.500l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    kolf: 'M10 2v7.5L4.7 20a1 1 0 0 0 .900 1.5h12.8a1 1 0 0 0 .900-1.5L14 9.5V2 M8.5 2h7 M7 16h10',
    bal: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4z M12 3v5 M15.5 10.5L20 9 M14.2 14.5L17 18.5 M9.8 14.5L7 18.5 M8.5 10.5L4 9',
  };

  let iconTeller = 0;
  // Geeft een <svg> terug (64 x 64). `vergrendeld` maakt hem grijs.
  function icoon(doc, badge, vergrendeld) {
    const NS = 'http://www.w3.org/2000/svg';
    const maak = (naam, attr) => { const e = doc.createElementNS(NS, naam); for (const k of Object.keys(attr || {})) e.setAttribute(k, attr[k]); return e; };
    const gid = 'pg' + (++iconTeller) + '-' + Math.floor(Math.random() * 1e6);
    const [licht, donker] = vergrendeld ? ['#4a5068', '#2b3042'] : KLEUREN[badge.tier] || KLEUREN[0];
    const svg = maak('svg', { viewBox: '0 0 64 64', width: '64', height: '64', 'aria-hidden': 'true', focusable: 'false' });
    const defs = maak('defs');
    const lg = maak('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' });
    lg.append(maak('stop', { offset: '0', 'stop-color': licht }), maak('stop', { offset: '1', 'stop-color': donker }));
    defs.append(lg); svg.append(defs);
    const hex = 'M32 3.5L57 17.5V46.5L32 60.5L7 46.5V17.5Z';
    svg.append(maak('path', { d: hex, fill: 'url(#' + gid + ')', stroke: vergrendeld ? '#5d6482' : '#ffffff', 'stroke-opacity': vergrendeld ? '1' : '.7', 'stroke-width': '2', 'stroke-linejoin': 'round' }));
    svg.append(maak('path', { d: 'M32 9L52 20.5V43.5L32 55L12 43.5V20.5Z', fill: 'none', stroke: vergrendeld ? '#ffffff' : '#ffffff', 'stroke-opacity': vergrendeld ? '.08' : '.45', 'stroke-width': '1.2', 'stroke-linejoin': 'round' }));
    if (!vergrendeld) svg.append(maak('path', { d: 'M12 20.5L32 9l20 11.5', fill: 'none', stroke: '#fff', 'stroke-opacity': '.55', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const g = maak('g', { transform: 'translate(19 19) scale(1.1)', fill: 'none', stroke: vergrendeld ? '#7d86a4' : '#1a1d2e', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    for (const d of (GLYPHS[badge.icoon] || GLYPHS.ster).split(' M').map((x, i) => (i ? 'M' + x : x))) g.append(maak('path', { d }));
    svg.append(g);
    return svg;
  }

  // ---- de badges ----
  // meet(d) geeft { nu, doel } terug; klaar als nu >= doel (tenzij `klaar` zelf gegeven is).
  const vooruit = (n, doel) => ({ nu: Math.min(n, doel), doel });
  const BADGES = [
    { id: 'eerste-kaart', naam: 'Eerste kaart', tekst: 'Open je eerste pakket.', tier: 0, icoon: 'kaart', meet: (d) => vooruit(d.gal.length, 1) },
    { id: 'tien-kaarten', naam: 'Tien kaarten', tekst: 'Open 10 pakketten.', tier: 0, icoon: 'stapel', meet: (d) => vooruit(d.gal.length, 10) },
    { id: 'vijftig-kaarten', naam: 'Verzamelaar', tekst: 'Heb 50 kaarten in je galerij.', tier: 1, icoon: 'stapels', meet: (d) => vooruit(d.gal.length, 50) },
    { id: 'honderd-kaarten', naam: 'Complete collectie', tekst: 'Heb 100 kaarten in je galerij.', tier: 2, icoon: 'stapels', meet: (d) => vooruit(d.gal.length, 100) },
    { id: 'vijf-op-rij', naam: 'Vijf op rij', tekst: 'Haal 5 voldoendes (5,5 of hoger) achter elkaar.', tier: 1, icoon: 'vlam', meet: (d) => vooruit(d.reeks, 5) },
    { id: 'tien-op-rij', naam: 'Tien op rij', tekst: 'Haal 10 voldoendes (5,5 of hoger) achter elkaar.', tier: 2, icoon: 'vlam', meet: (d) => vooruit(d.reeks, 10) },
    { id: 'comeback', naam: 'Comeback', tekst: 'Haal in een vak minstens 2 punten meer dan je vorige cijfer.', tier: 1, icoon: 'pijl', meet: (d) => ({ nu: Math.min(2, Math.max(0, d.besteStijging)), doel: 2 }) },
    { id: 'alles-goud', naam: 'Alles goud', tekst: 'Heb in al je vakken een goudkaart (7 of hoger), in minstens 3 vakken.', tier: 3, icoon: 'kroon', meet: (d) => ({ nu: d.vakkenMetGoud, doel: Math.max(3, d.vakken) }) },
    { id: 'zeldzaam', naam: 'Zeldzaam!', tekst: 'Trek een zeldzame kaart (kans 1/10).', tier: 2, icoon: 'diamant', meet: (d) => vooruit(d.zeldzaam, 1) },
    { id: 'drie-zeldzaam', naam: 'Zeldzaam geluk', tekst: 'Trek 3 zeldzame kaarten.', tier: 3, icoon: 'diamant', meet: (d) => vooruit(d.zeldzaam, 3) },
    { id: 'legendarisch', naam: 'Legendarisch', tekst: 'Trek een zeldzame kaart met een 9,5 of hoger.', tier: 4, icoon: 'kroon', meet: (d) => vooruit(d.legendarisch, 1) },
    { id: 'eerste-glim', naam: 'Eerste glim', tekst: 'Trek een glimkaart (kans 1/40, of nog zeldzamer).', tier: 3, icoon: 'ster', meet: (d) => vooruit(d.trede[2], 1) },
    { id: 'sterrenkijker', naam: 'Sterrenkijker', tekst: 'Trek 3 kosmische (kans 1/150) of mythische kaarten.', tier: 4, icoon: 'ster', meet: (d) => vooruit(d.trede[3], 3) },
    { id: 'mythe', naam: 'Mythe', tekst: 'Trek een mythische kaart (kans 1/1000).', tier: 4, icoon: 'kroon', meet: (d) => vooruit(d.trede[4], 1) },
    { id: 'volle-ladder', naam: 'Volle ladder', tekst: 'Heb van elke trede een kaart: zeldzaam (1/10), glim (1/40), kosmisch (1/150) en mythisch (1/1000).', tier: 4, icoon: 'kroon', meet: (d) => vooruit(d.ladderVol, 4) },
    { id: 'perfecte-kaart', naam: 'De perfecte kaart', tekst: 'Haal een 10 op een kosmische of mythische kaart.', tier: 4, icoon: 'beker', meet: (d) => vooruit(d.perfect, 1) },
    { id: 'topcijfer', naam: 'Topcijfer', tekst: 'Haal een 9 of hoger.', tier: 2, icoon: 'ster', meet: (d) => vooruit(d.negenPlus, 1) },
    { id: 'icoon', naam: 'Icoonkaart', tekst: 'Haal een 10.', tier: 4, icoon: 'beker', meet: (d) => vooruit(d.tien, 1) },
    { id: 'vijf-vakken', naam: 'Veelzijdig', tekst: 'Heb kaarten van 5 verschillende vakken.', tier: 0, icoon: 'boeken', meet: (d) => vooruit(d.vakken, 5) },
    { id: 'vier-groepen', naam: 'Van alles wat', tekst: 'Heb een kaart uit elke vakgroep: Exact, Talen, Mens & maatschappij en Kunst & sport.', tier: 1, icoon: 'groepen', meet: (d) => vooruit(d.groepen, 4) },
    { id: 'vervloekt', naam: 'Vervloekt', tekst: 'Trek een vervloekte kaart: een zeldzame kaart met een onvoldoende.', tier: 3, icoon: 'spook', meet: (d) => vooruit(d.vloek, 1) },
    { id: 'halloween', naam: 'Spookpakje', tekst: 'Open het Halloween-pakje (1 oktober tot en met 2 november).', tier: 3, icoon: 'spook', meet: (d) => vooruit(d.halloween ? 1 : 0, 1) },
    { id: 'alle-openingen', naam: 'Alles geprobeerd', tekst: 'Open een pakket met elk van de 7 openingen.', tier: 2, icoon: 'pakket', meet: (d) => vooruit(d.openingen, OPENINGEN.length) },
    { id: 'eerste-zege', naam: 'Eerste zege', tekst: 'Win je eerste gevecht tegen een vriend.', tier: 0, icoon: 'schild', meet: (d) => vooruit(d.zeges, 1) },
    { id: 'vijf-zeges', naam: 'Vijf zeges', tekst: 'Win 5 gevechten.', tier: 1, icoon: 'zwaard', meet: (d) => vooruit(d.zeges, 5) },
    { id: 'tien-gevechten', naam: 'Tien gevechten', tekst: 'Speel 10 gevechten tegen vrienden.', tier: 1, icoon: 'bal', meet: (d) => vooruit(d.gevechten, 10) },
    { id: 'keeper-held', naam: 'Keeper-held', tekst: 'Stop een schot in een klikduel.', tier: 0, icoon: 'handen', meet: (d) => vooruit(d.reddingen, 1) },
    { id: 'onverslaanbare-muur', naam: 'Onverslaanbare muur', tekst: 'Stop 10 schoten in klikduels.', tier: 2, icoon: 'muur', meet: (d) => vooruit(d.reddingen, 10) },
    { id: 'clean-sheet', naam: 'Clean sheet', tekst: 'Win een gevecht zonder tegendoelpunt.', tier: 1, icoon: 'schild', meet: (d) => vooruit(d.cleanSheets, 1) },
    { id: 'doelpuntenmachine', naam: 'Doelpuntenmachine', tekst: 'Scoor 25 doelpunten in gevechten.', tier: 2, icoon: 'doel', meet: (d) => vooruit(d.doelpunten, 25) },
    { id: 'vol-team', naam: 'Vol team', tekst: 'Zet 11 kaarten in je team.', tier: 1, icoon: 'team', meet: (d) => vooruit(d.teamMax, 11) },
    { id: 'goede-chemie', naam: 'Goede chemie', tekst: 'Haal teamchemie 60 of hoger.', tier: 1, icoon: 'schakel', meet: (d) => vooruit(d.chemieMax, 60) },
    { id: 'chemie-100', naam: 'Perfecte chemie', tekst: 'Haal teamchemie 100.', tier: 3, icoon: 'kolf', meet: (d) => vooruit(d.chemieMax, 100) },
  ];

  // ---- gegevens verzamelen en badges uitrekenen ----
  async function verzamelBron() {
    const [gal, gev, team, stats, behaald] = await Promise.all([lees('spo_galerij'), lees('spo_gevechten'), lees('spo_team'), lees(SLEUTEL_STATS), lees(SLEUTEL_PRESTATIES)]);
    return {
      gal: Array.isArray(gal) ? gal.filter((e) => e && typeof e === 'object' && typeof e.vak === 'string' && Number.isFinite(e.cijfer)) : [],
      gev: gev && typeof gev === 'object' && !Array.isArray(gev) ? gev : {},
      team: team && Array.isArray(team.ids) ? team.ids.filter((x) => typeof x === 'string') : [],
      stats: stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {},
      behaald: behaald && typeof behaald === 'object' && !Array.isArray(behaald) ? behaald : {},
    };
  }
  // Teamchemie en teamgrootte nu (uit je galerij en team), op dezelfde manier als op de teampagina.
  function teamNu(bron) {
    const per = new Map(bron.gal.map((e) => [e.id, e]));
    const kaarten = bron.team.map((id) => per.get(id)).filter(Boolean).slice(0, 11);
    let chemie = 0;
    const g = G();
    if (g && kaarten.length > 1) chemie = g.chemie(g.ordenTeam(kaarten.map((k) => ({ vak: k.vak, cijfer: k.cijfer, tier: k.tier | 0, z: k.zeldzaam === true })), 0)).score;
    return { n: kaarten.length, chemie };
  }
  function afgeleid(bron) {
    const gal = bron.gal.slice().sort((a, b) => getal(a.ts) - getal(b.ts));
    const g = G();
    // voldoendes achter elkaar (op volgorde van openen)
    let reeks = 0, nu = 0;
    for (const e of gal) { if (e.cijfer >= VOLDOENDE) { nu++; reeks = Math.max(reeks, nu); } else nu = 0; }
    // grootste stijging ten opzichte van het vorige cijfer in hetzelfde vak
    const laatsteVak = new Map();
    let besteStijging = 0;
    const vakSleutel = (v) => String(v).trim().toLowerCase();
    for (const e of gal) {
      const s = vakSleutel(e.vak);
      if (laatsteVak.has(s)) besteStijging = Math.max(besteStijging, Math.round((e.cijfer - laatsteVak.get(s)) * 100) / 100);
      laatsteVak.set(s, e.cijfer);
    }
    const vakkenSet = new Set(gal.map((e) => vakSleutel(e.vak)));
    const goudVakken = new Set(gal.filter((e) => (e.tier | 0) >= 2 || e.cijfer >= 7).map((e) => vakSleutel(e.vak)));
    const groepen = new Set();
    if (g) for (const e of gal) { const x = g.groepVan(e.vak); if (x) groepen.add(x); }
    // gevechten
    const alle = [];
    for (const v of Object.keys(bron.gev)) if (Array.isArray(bron.gev[v])) for (const x of bron.gev[v]) if (x && Number.isFinite(x.mijn) && Number.isFinite(x.hun)) alle.push(x);
    const st = bron.stats;
    const t = teamNu(bron);
    return {
      gal, reeks, besteStijging,
      vakken: vakkenSet.size,
      vakkenMetGoud: [...vakkenSet].filter((v) => goudVakken.has(v)).length,
      zeldzaam: gal.filter((e) => e.zeldzaam === true).length,
      negenPlus: gal.filter((e) => e.cijfer >= 9).length,
      legendarisch: gal.filter((e) => e.zeldzaam === true && e.cijfer >= 9.5).length,
      // aantal kaarten van deze trede of hoger (trede[2] = glim, kosmisch en mythisch samen)
      trede: [0, 1, 2, 3, 4].map((t) => gal.filter((e) => tredeVan(e) >= t).length),
      ladderVol: [1, 2, 3, 4].filter((t) => gal.some((e) => tredeVan(e) === t)).length,
      perfect: gal.filter((e) => tredeVan(e) >= 3 && e.cijfer >= 9.95).length,
      tien: gal.filter((e) => e.cijfer >= 9.95).length,
      groepen: groepen.size,
      vloek: gal.filter((e) => e.vloek === true).length,
      halloween: Array.isArray(st.seizoenen) && st.seizoenen.includes('halloween'),
      openingen: Array.isArray(st.openingen) ? new Set(st.openingen.filter((x) => OPENINGEN.includes(x))).size : 0,
      gevechten: alle.length,
      zeges: alle.filter((x) => x.mijn > x.hun).length,
      cleanSheets: alle.filter((x) => x.mijn > x.hun && x.hun === 0).length,
      doelpunten: alle.reduce((a, x) => a + x.mijn, 0),
      reddingen: getal(st.reddingen),
      teamMax: Math.max(getal(st.teamMax), t.n),
      chemieMax: Math.max(getal(st.chemieMax), t.chemie),
      teamNu: t,
    };
  }
  function uitrekenen(bron) {
    const d = afgeleid(bron);
    return BADGES.map((b) => {
      const m = b.meet(d);
      const ts = getal(bron.behaald[b.id]);
      return Object.assign({}, b, { nu: m.nu, doel: m.doel, klaar: !!ts || m.nu >= m.doel, ts: ts || 0, meet: undefined });
    });
  }
  // Rekent alles uit, bewaart nieuwe badges (met tijdstip) en nieuwe records, en geeft de nieuw behaalde badges terug.
  async function controleer() {
    const bron = await verzamelBron();
    const d = afgeleid(bron);
    const stats = Object.assign({}, bron.stats);
    let statsNieuw = false;
    if (d.teamMax > getal(stats.teamMax)) { stats.teamMax = d.teamMax; statsNieuw = true; }
    if (d.chemieMax > getal(stats.chemieMax)) { stats.chemieMax = d.chemieMax; statsNieuw = true; }
    if (statsNieuw) await schrijf(SLEUTEL_STATS, stats);
    const nieuw = [];
    const behaald = Object.assign({}, bron.behaald);
    const nu = Date.now();
    for (const b of BADGES) {
      if (behaald[b.id]) continue;
      const m = b.meet(d);
      if (m.nu >= m.doel) { behaald[b.id] = nu; nieuw.push({ id: b.id, naam: b.naam, tekst: b.tekst, tier: b.tier, icoon: b.icoon }); }
    }
    if (nieuw.length) {
      // Net opnieuw lezen, zodat een gelijktijdige controle (ander tabblad) niets overschrijft of dubbel meldt.
      const vers = await lees(SLEUTEL_PRESTATIES);
      const huidig = vers && typeof vers === 'object' && !Array.isArray(vers) ? vers : {};
      const echtNieuw = nieuw.filter((b) => !huidig[b.id]);
      if (!echtNieuw.length) return [];
      for (const b of echtNieuw) huidig[b.id] = behaald[b.id];
      await schrijf(SLEUTEL_PRESTATIES, huidig);
      return echtNieuw;
    }
    return [];
  }
  // Een teller of lijst in spo_stats bijhouden: telOp('reddingen', 2) of voegToe('openingen', 'kluis').
  async function telOp(sleutel, n) {
    const s = Object.assign({}, await lees(SLEUTEL_STATS));
    s[sleutel] = getal(s[sleutel]) + (n || 1);
    await schrijf(SLEUTEL_STATS, s);
  }
  async function voegToe(sleutel, waarde) {
    const s = Object.assign({}, await lees(SLEUTEL_STATS));
    const lijst = Array.isArray(s[sleutel]) ? s[sleutel].slice(0, 30) : [];
    if (lijst.includes(waarde)) return;
    lijst.push(waarde);
    s[sleutel] = lijst;
    await schrijf(SLEUTEL_STATS, s);
  }
  async function overzicht() { return uitrekenen(await verzamelBron()); }

  // ---- toast-melding (eigen stijl in het element, zodat het ook in een shadow root werkt) ----
  function maakToast(doc, lijst) {
    const el = (tag, css, tekst) => { const e = doc.createElement(tag); if (css) e.style.cssText = css; if (tekst !== undefined) e.textContent = tekst; return e; };
    const kaart = el('div', 'display:flex;align-items:center;gap:12px;max-width:340px;padding:10px 16px 10px 10px;border-radius:14px;color:#eef1f8;background:#14182e;border:1px solid rgba(255,210,74,.55);box-shadow:0 14px 34px -8px rgba(0,0,0,.7);font:600 14px/1.3 system-ui,sans-serif;');
    kaart.setAttribute('role', 'status');
    const tekst = el('div', 'min-width:0;');
    tekst.append(el('div', 'font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#ffd24a;font-weight:800;', lijst.length === 1 ? 'Nieuwe badge' : lijst.length + ' nieuwe badges'));
    tekst.append(el('div', 'font-size:15px;font-weight:800;', lijst.slice(0, 2).map((b) => b.naam).join(', ') + (lijst.length > 2 ? ' en ' + (lijst.length - 2) + ' meer' : '')));
    if (lijst.length === 1) tekst.append(el('div', 'font-size:12.5px;font-weight:500;color:#a5aec4;', lijst[0].tekst));
    const ic = icoon(doc, lijst[0], false);
    ic.style.cssText = 'width:52px;height:52px;flex:none;';
    kaart.append(ic, tekst);
    return kaart;
  }

  const lib = { BADGES, GLYPHS, TIER_NAMEN, OPENINGEN, SLEUTEL_PRESTATIES, SLEUTEL_STATS, VOLDOENDE, verzamelBron, afgeleid, uitrekenen, controleer, overzicht, telOp, voegToe, icoon, maakToast, lees, schrijf };
  globalThis.SPOPrestaties = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
