/*
 * Somtoday Pack Opener v2: munten, winkel, dagelijkse beloning en profiel (gedeelde code).
 * Draait in het Somtoday-venster (content script) en op de pagina's van de extensie. Alles blijft in deze browser.
 *
 * Opslag (chrome.storage.local):
 *   spo_munten      { v:1, saldo, totaal, gev:{w,g,v}, ts }       de portemonnee
 *   spo_munten_log  [{ ts, n, r, id }]                              laatste 100 mutaties
 *   spo_munten_ids  { [id]: 1 }                                     wat al is uitbetaald (cijfer c:, gevecht g:, prestatie p:, troostpakje t: en td:), zodat niets dubbel telt
 *   spo_dagelijks   { laatste:'JJJJ-MM-DD', reeks:1..7, dagen }     dagelijkse beloning
 *   spo_winkel      { gekocht:[itemId], gebruik:{somtoday, titel, bg} }
 *   spo_profiel     { bijnaam, deel }
 *   (v3.0) spo_munten_ids bevat ook 'cf:<wereld>:<niveau>' / 'cd:<dag>:<nr>' / 'cw:<wereld>' (campagne: eerste winst, beloonde herhaling, wereld voltooid) en 'dm:<kaart>' (mythische kaart gemeld) en 'ar:<dag>:<nr>' / 'arw:<dag>:<nr>' (arcade gestart / uitbetaald) en 'ks:<dag>:<nr>' / 'ksw:<potje>' (kaartspel, dagelijkse limiet / uitbetaald)
 *   (v3.0) 'mn:<dag>:<nr>' / 'mnw:<potje>' (Snelspel: potje gespeeld, dagelijkse limiet / uitbetaald) en 'tw:<id>' (tweelingkaart: eenmalige beloning, via bonusMunten 'bm:tw:<id>')
 *   spo_voetbal     { v:1, avatar, stadion }                       je voetballer en je stadion (zie voetbal.js)
 * De munten hebben nooit invloed op cijfers: het zijn alleen cosmetische dingen.
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  const K = { munten: 'spo_munten', log: 'spo_munten_log', ids: 'spo_munten_ids', dag: 'spo_dagelijks', winkel: 'spo_winkel', profiel: 'spo_profiel', galerij: 'spo_galerij', gev: 'spo_gevechten', prest: 'spo_prestaties', inst: 'spo_instellingen', voetbal: 'spo_voetbal' };
  // v3.0: avatar en eigen stadion (voetbal.js). Zonder dat bestand werkt de rest gewoon, alleen zonder die items.
  if (!globalThis.SPOVoetbal && typeof require === 'function') { try { require('./voetbal.js'); } catch (e) { /* niet beschikbaar */ } }
  const VB = globalThis.SPOVoetbal || null;

  async function leesAlles(sleutels) {
    if (heeftOpslag) return api.storage.local.get(sleutels);
    const r = {};
    for (const s of sleutels) { try { const t = localStorage.getItem(s); if (t) r[s] = JSON.parse(t); } catch (e) { /* leeg */ } }
    return r;
  }
  async function schrijfAlles(o) {
    if (heeftOpslag) return api.storage.local.set(o);
    for (const [s, w] of Object.entries(o)) localStorage.setItem(s, JSON.stringify(w));
  }

  // ───────── Catalogus ─────────
  // zeld: 0 gewoon, 1 zeldzaam, 2 episch, 3 legendarisch. prijs null: alleen te winnen (pakjes of dagelijkse beloning).
  const ZELD = ['Gewoon', 'Zeldzaam', 'Episch', 'Legendarisch'];
  const ITEMS = [
    { id: 'st-donker', soort: 'somtoday', thema: 'donker', naam: 'Donker', prijs: 70, zeld: 0, uitleg: 'Rustig donker met een blauwe gloed.', kleuren: ['#12151c', '#1c212c', '#5b9dff'] },
    { id: 'st-oceaan', soort: 'somtoday', thema: 'oceaan', naam: 'Oceaan', prijs: 90, zeld: 1, uitleg: 'Diepblauw met turquoise.', kleuren: ['#06223a', '#0c3558', '#27d3e0'] },
    { id: 'st-bos', soort: 'somtoday', thema: 'bos', naam: 'Bos', prijs: 90, zeld: 1, uitleg: 'Donkergroen als een bos in de avond.', kleuren: ['#0e1f17', '#16301f', '#6fd08c'] },
    { id: 'st-neon', soort: 'somtoday', thema: 'neon', naam: 'Neon', prijs: 120, zeld: 2, uitleg: 'Zwart met felle roze en groene randen.', kleuren: ['#08070f', '#15112a', '#ff2fd0'] },
    { id: 'st-goud', soort: 'somtoday', thema: 'goud', naam: 'Goud', prijs: 160, zeld: 3, uitleg: 'Zwart en goud. Voor kampioenen.', kleuren: ['#0d0b06', '#1d1809', '#f0c04a'] },
    { id: 'kt-galaxy', soort: 'kaartthema', thema: 'galaxy', naam: 'Sterrenstelsel', prijs: 60, zeld: 1, uitleg: 'Kaartkleuren: diep paars met roze licht.', pal: ['#0b0420', '#4a1f9a', '#ff9be6'], tekst: '#fff0fb' },
    { id: 'kt-lava', soort: 'kaartthema', thema: 'lava', naam: 'Lava', prijs: 60, zeld: 1, uitleg: 'Kaartkleuren: gloeiend rood en oranje.', pal: ['#2a0400', '#e0400d', '#ffc36b'], tekst: '#2a0900' },
    { id: 'kt-ijs', soort: 'kaartthema', thema: 'ijs', naam: 'IJs', prijs: 60, zeld: 1, uitleg: 'Kaartkleuren: ijsblauw en wit.', pal: ['#0a2a40', '#5cc4e8', '#eefcff'], tekst: '#06222f' },
    { id: 'kt-smaragd', soort: 'kaartthema', thema: 'smaragd', naam: 'Smaragd', prijs: 80, zeld: 2, uitleg: 'Kaartkleuren: groen als een edelsteen.', pal: ['#01221a', '#0aa36b', '#a8ffd8'], tekst: '#012418' },
    { id: 'kt-diamant', soort: 'kaartthema', thema: 'diamant', naam: 'Diamant', prijs: null, zeld: 3, uitleg: 'Kaartkleuren: bijna wit met een blauwe gloed.', pal: ['#20324d', '#9fd0ff', '#ffffff'], tekst: '#10213a' },
    // v3.0 Campagne: alleen te winnen door de eindbaas van een wereld te verslaan (campagne: wereld-id). Nooit in pakjes of de dagelijkse beloning.
    { id: 'ti-drakendoder', soort: 'titel', naam: 'Drakendoder', prijs: null, zeld: 3, campagne: 'exact', uitleg: 'Profieltitel. Alleen te winnen: versla de vulkaandraak in de Campagne.' },
    { id: 'ti-feniksvriend', soort: 'titel', naam: 'Feniksvriend', prijs: null, zeld: 3, campagne: 'talen', uitleg: 'Profieltitel. Alleen te winnen: versla de zonnefeniks in de Campagne.' },
    { id: 'ti-krakenbedwinger', soort: 'titel', naam: 'Krakenbedwinger', prijs: null, zeld: 3, campagne: 'mens', uitleg: 'Profieltitel. Alleen te winnen: versla de kraken in de Campagne.' },
    { id: 'ti-griffioenmeester', soort: 'titel', naam: 'Griffioenmeester', prijs: null, zeld: 3, campagne: 'kunst', uitleg: 'Profieltitel. Alleen te winnen: versla de berggriffioen in de Campagne.' },
    { id: 'kt-vulkaan', soort: 'kaartthema', thema: 'vulkaan', naam: 'Vulkaan', prijs: null, zeld: 3, campagne: 'exact', uitleg: 'Kaartkleuren: zwart gesteente met gloeiend magma. Alleen te winnen in de Campagne.', pal: ['#1a0604', '#c2300a', '#ffb347'], tekst: '#2a0900' },
    { id: 'kt-zonnetempel', soort: 'kaartthema', thema: 'zonnetempel', naam: 'Zonnetempel', prijs: null, zeld: 3, campagne: 'talen', uitleg: 'Kaartkleuren: warm goud en zand. Alleen te winnen in de Campagne.', pal: ['#3a2504', '#e0a21b', '#fff2b8'], tekst: '#2a1a02' },
    { id: 'kt-diepzee', soort: 'kaartthema', thema: 'diepzee', naam: 'Diepzee', prijs: null, zeld: 3, campagne: 'mens', uitleg: 'Kaartkleuren: donkerblauw met lichtgevend turquoise. Alleen te winnen in de Campagne.', pal: ['#02122a', '#0b6e8f', '#7ff3e6'], tekst: '#031a2e' },
    { id: 'kt-bergtop', soort: 'kaartthema', thema: 'bergtop', naam: 'Bergtop', prijs: null, zeld: 3, campagne: 'kunst', uitleg: 'Kaartkleuren: sneeuw en blauwgrijs gesteente. Alleen te winnen in de Campagne.', pal: ['#222c3c', '#8da2bd', '#ffffff'], tekst: '#14202f' },
    { id: 'rd-dubbel', soort: 'rand', rand: 'dubbel', naam: 'Dubbele lijn', prijs: 30, zeld: 0, uitleg: 'Een rand met twee dunne lijnen.' },
    { id: 'rd-neon', soort: 'rand', rand: 'neon', naam: 'Neonrand', prijs: 45, zeld: 1, uitleg: 'Een rand die licht geeft.' },
    { id: 'ti-pakjesjager', soort: 'titel', naam: 'Pakjesjager', prijs: 25, zeld: 0, uitleg: 'Titel op je profielkaart.' },
    { id: 'ti-toetsenkoning', soort: 'titel', naam: 'Toetsenkoning', prijs: 40, zeld: 0, uitleg: 'Titel op je profielkaart.' },
    { id: 'ti-nachtbraker', soort: 'titel', naam: 'Nachtbraker', prijs: 40, zeld: 0, uitleg: 'Titel op je profielkaart.' },
    { id: 'ti-cijferjager', soort: 'titel', naam: 'Cijferjager', prijs: 55, zeld: 1, uitleg: 'Titel op je profielkaart.' },
    { id: 'ti-kampioen', soort: 'titel', naam: 'Kampioen', prijs: 80, zeld: 2, uitleg: 'Titel op je profielkaart.' },
    { id: 'ti-legende', soort: 'titel', naam: 'Legende', prijs: null, zeld: 3, uitleg: 'Titel op je profielkaart. Alleen te winnen.' },
    { id: 'bg-stadion', soort: 'bg', naam: 'Stadion', prijs: 30, zeld: 0, uitleg: 'Achtergrond van je profielkaart: groen gras.' },
    { id: 'bg-nacht', soort: 'bg', naam: 'Sterrennacht', prijs: 40, zeld: 0, uitleg: 'Achtergrond van je profielkaart: sterren.' },
    { id: 'bg-zonsondergang', soort: 'bg', naam: 'Zonsondergang', prijs: 50, zeld: 1, uitleg: 'Achtergrond van je profielkaart: oranje en roze.' },
    { id: 'bg-raster', soort: 'bg', naam: 'Neonraster', prijs: 70, zeld: 2, uitleg: 'Achtergrond van je profielkaart: een gloeiend raster.' },
    { id: 'bg-goud', soort: 'bg', naam: 'Goudglans', prijs: 100, zeld: 3, uitleg: 'Achtergrond van je profielkaart: goud.' },
    { id: 'bg-regenboog', soort: 'bg', naam: 'Regenboog', prijs: null, zeld: 3, uitleg: 'Achtergrond van je profielkaart. Alleen te winnen.' },
  ];
  if (VB) ITEMS.push(...VB.ITEMS);
  const PER_ID = new Map(ITEMS.map((i) => [i.id, i]));
  const SOORTEN = Object.assign({ somtoday: 'Somtoday-thema', kaartthema: 'Kaartkleuren', rand: 'Kaartrand', titel: 'Profieltitel', bg: 'Profielachtergrond' }, VB ? VB.SOORTEN : {});
  const PAKJES = [
    { id: 'klein', naam: 'Klein pakje', prijs: 40, kans: [72, 24, 4, 0], kleur: '#e08a4a' },
    { id: 'normaal', naam: 'Gewoon pakje', prijs: 100, kans: [40, 38, 19, 3], kleur: '#cfd9e6' },
    { id: 'groot', naam: 'Groot pakje', prijs: 220, kans: [8, 38, 42, 12], kleur: '#ffcc33' },
  ];
  const TERUG = 0.4; // dubbel item: dit deel van de waarde krijg je terug
  const waarde = (it) => (it.prijs != null ? it.prijs : 150);
  const DAG_BELONING = [5, 8, 10, 15, 20, 30]; // dag 1 t/m 6; dag 7 is een zeldzaam item

  // Extra kaartkleuren (premium): erbij zetten in de lijst van de motor, zonder de motor aan te raken.
  function registreerThemas() {
    const S = globalThis.__SPO;
    if (!S || !S.KAART_THEMAS) return;
    for (const it of ITEMS) if (it.soort === 'kaartthema' && !S.KAART_THEMAS[it.thema]) S.KAART_THEMAS[it.thema] = { naam: it.naam, pal: it.pal, tekst: it.tekst, premium: it.id };
  }
  registreerThemas();

  // ───────── Muntenwerk (altijd één voor één, anders raken twee schrijfacties elkaar kwijt) ─────────
  let ketting = Promise.resolve();
  const SL = [K.munten, K.log, K.ids, K.dag, K.winkel];
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const nat = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

  function schoonMunten(m) {
    m = obj(m);
    const g = obj(m.gev);
    return { v: 1, init: m.init === true, saldo: nat(m.saldo, 1e9), totaal: nat(m.totaal, 1e9), gev: { w: nat(g.w, 1e6), g: nat(g.g, 1e6), v: nat(g.v, 1e6) }, ts: nat(m.ts, 4.1e12) };
  }
  function schoonWinkel(w) {
    w = obj(w);
    const gekocht = (Array.isArray(w.gekocht) ? w.gekocht : []).filter((x, i, a) => typeof x === 'string' && PER_ID.has(x) && a.indexOf(x) === i);
    const g = obj(w.gebruik);
    const heeft = (id, soort) => typeof id === 'string' && gekocht.includes(id) && PER_ID.get(id).soort === soort;
    return { gekocht, gebruik: { somtoday: heeft(g.somtoday, 'somtoday') ? g.somtoday : 'standaard', titel: heeft(g.titel, 'titel') ? g.titel : null, bg: heeft(g.bg, 'bg') ? g.bg : 'standaard' } };
  }
  function schoonDag(d) {
    d = obj(d);
    return { laatste: typeof d.laatste === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.laatste) ? d.laatste : '', reeks: Math.max(0, Math.min(7, d.reeks | 0)), dagen: nat(d.dagen, 1e6) };
  }

  // Voert fn(staat) uit op de actuele opslag en bewaart de uitkomst. fn mag staat.munten/log/ids/winkel/dag aanpassen.
  function werk(fn) {
    const taak = ketting.then(async () => {
      const r = await leesAlles(SL);
      const staat = {
        munten: schoonMunten(r[K.munten]),
        log: Array.isArray(r[K.log]) ? r[K.log].filter((x) => x && Number.isFinite(x.n)).slice(0, 100) : [],
        ids: obj(r[K.ids]),
        winkel: schoonWinkel(r[K.winkel]),
        dag: schoonDag(r[K.dag]),
        nieuw: obj(r[K.munten]).init !== true,
      };
      herstelUitLog(staat);
      const uit = await fn(staat);
      staat.munten.ts = Date.now();
      const sleutels = Object.keys(staat.ids);
      if (sleutels.length > 4000) for (const s of sleutels.slice(0, sleutels.length - 4000)) delete staat.ids[s];
      await schrijfAlles({ [K.munten]: staat.munten, [K.log]: staat.log.slice(0, 100), [K.ids]: staat.ids, [K.winkel]: staat.winkel, [K.dag]: staat.dag });
      return uit;
    });
    ketting = taak.catch(() => {});
    return taak;
  }
  function boek(s, n, reden, id) {
    s.munten.saldo = Math.max(0, s.munten.saldo + n);
    if (n > 0) s.munten.totaal += n;
    s.log.unshift({ ts: Date.now(), n, r: String(reden).slice(0, 60), id: id ? String(id).slice(0, 60) : '' });
  }
  // Betaalt een item één keer uit. Geeft true als het meetelde.
  function verdien(s, id, n, reden) {
    if (s.ids[id] || n <= 0) return false;
    s.ids[id] = 1;
    boek(s, n, reden, id);
    return true;
  }

  // zeldzaam: true/false (oud) of de trede 0..4 (v2.4): zeldzaam ×3, glim ×5, kosmisch ×8, mythisch ×15
  const TREDE_KEER = [1, 3, 5, 8, 15];
  const TREDE_NAAM = ['', 'Zeldzaam', 'Glim', 'Kosmisch', 'Mythisch'];
  const cijferMunten = (c, zeldzaam) => {
    const basis = c >= 10 ? 30 : c >= 9 ? 18 : c >= 8 ? 12 : c >= 7 ? 8 : c >= 5.5 ? 5 : 2;
    const t = zeldzaam === true ? 1 : Math.max(0, Math.min(4, zeldzaam | 0));
    return basis * TREDE_KEER[t];
  };

  // Een geopend cijfer. id = de sig van het cijfer (ook de id in de galerij), dus galerij en direct tellen niet dubbel.
  function verdienCijfer(id, cijfer, zeldzaam) {
    if (!id || !Number.isFinite(cijfer)) return Promise.resolve(0);
    return werk((s) => {
      if (s.nieuw) return 0; // de eerste keer regelt sweep() het startbedrag
      const n = cijferMunten(cijfer, zeldzaam);
      const t = zeldzaam === true ? 1 : zeldzaam | 0;
      return verdien(s, 'c:' + id, n, t ? TREDE_NAAM[t] + ' cijfer geopend' : 'Cijfer geopend') ? n : 0;
    });
  }

  // Loopt galerij, gevechten en prestaties na en betaalt uit wat nog niet is geteld. De eerste keer: alles wat er al is telt als 'al gehad'
  // (geen munten), plus een startbedrag.
  function sweep() {
    return werk(async (s) => {
      const r = await leesAlles([K.galerij, K.gev, K.prest]);
      const eerste = s.nieuw;
      let erbij = 0;
      const telop = (id, n, reden) => {
        if (eerste) { s.ids[id] = 1; return; }
        if (verdien(s, id, n, reden)) erbij += n;
      };
      for (const e of Array.isArray(r[K.galerij]) ? r[K.galerij] : []) {
        if (e && typeof e.id === 'string' && Number.isFinite(e.cijfer)) telop('c:' + e.id, cijferMunten(e.cijfer, (e.trede | 0) || e.zeldzaam === true), e.zeldzaam === true ? 'Zeldzaam cijfer geopend' : 'Cijfer geopend');
      }
      const gev = obj(r[K.gev]);
      for (const [vid, lijst] of Object.entries(gev)) {
        for (const u of Array.isArray(lijst) ? lijst : []) {
          if (!u || !Number.isFinite(u.ts) || !Number.isFinite(u.mijn) || !Number.isFinite(u.hun)) continue;
          const id = `g:${vid}:${u.ts}`;
          if (s.ids[id]) continue;
          const w = u.mijn > u.hun, gl = u.mijn === u.hun;
          if (w) s.munten.gev.w++; else if (gl) s.munten.gev.g++; else s.munten.gev.v++;
          telop(id, w ? 20 : gl ? 8 : 0, w ? 'Gevecht gewonnen' : 'Gevecht gelijk');
          if (!w && !gl) s.ids[id] = 1;
        }
      }
      const p = r[K.prest];
      const pid = Array.isArray(p) ? p.map((x) => (typeof x === 'string' ? x : x && x.id)).filter((x) => typeof x === 'string')
        : Object.entries(obj(p)).filter(([, w]) => w).map(([k]) => k);
      for (const x of pid.slice(0, 500)) telop('p:' + x, 25, 'Prestatie behaald');
      if (eerste) { s.munten.init = true; boek(s, 50, 'Welkom: startbedrag', 'start'); }
      return erbij;
    });
  }

  // ───────── Winkel ─────────
  // Wat je ooit kocht of won staat ook in de geschiedenis (spo_munten_log). Ontbreekt iets in de winkel (bijv. na een update
  // waarbij de winkel leeg was geraakt), dan zetten we het hier terug.
  function herstelUitLog(s) {
    const naarId = new Map(ITEMS.map((i) => [i.naam, i.id]));
    for (const e of s.log) {
      const id = String(e && e.id || ''), r = String(e && e.r || '');
      let item = null;
      if (id.startsWith('k:')) item = id.slice(2);
      else if (/^pak:[^:]+:/.test(id)) item = id.split(':')[2];
      else if (/^cw:[^:]+:/.test(id)) item = id.split(':')[2];
      else if (r.startsWith('Dagelijkse beloning: ')) item = naarId.get(r.slice(21)) || null;
      if (item && PER_ID.has(item) && !s.winkel.gekocht.includes(item)) s.winkel.gekocht.push(item);
    }
  }
  function koop(itemId) {
    return werk((s) => {
      const it = PER_ID.get(itemId);
      if (!it || it.prijs == null) return { ok: false, reden: 'niet-te-koop' };
      if (s.winkel.gekocht.includes(itemId)) return { ok: false, reden: 'al-gekocht' };
      if (s.munten.saldo < it.prijs) return { ok: false, reden: 'te-weinig' };
      boek(s, -it.prijs, 'Gekocht: ' + it.naam, 'k:' + itemId);
      s.winkel.gekocht.push(itemId);
      return { ok: true, saldo: s.munten.saldo };
    });
  }
  function kiesKans(kans) {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    let x = (b[0] / 4294967296) * kans.reduce((a, c) => a + c, 0);
    for (let i = 0; i < kans.length; i++) { if (x < kans[i]) return i; x -= kans[i]; }
    return 0;
  }
  function lootUit(lijst) { const b = new Uint32Array(1); crypto.getRandomValues(b); return lijst[b[0] % lijst.length]; }
  // Trekt een item uit een pakje en boekt het (dubbel: je krijgt een deel van de waarde terug). Rekent het pakje zelf niet af.
  function trekItem(s, pak) {
    let z = kiesKans(pak.kans);
    while (z > 0 && !ITEMS.some((i) => i.zeld === z && !i.campagne)) z--;
    const it = lootUit(ITEMS.filter((i) => i.zeld === z && !i.campagne));
    const dubbel = s.winkel.gekocht.includes(it.id);
    let terug = 0;
    if (dubbel) { terug = Math.max(1, Math.round(waarde(it) * TERUG)); boek(s, terug, 'Dubbel: ' + it.naam, 'dubbel:' + it.id); }
    else s.winkel.gekocht.push(it.id);
    return { it, dubbel, terug };
  }
  // Koopt en opent een pakje. Dubbel item: je krijgt een deel van de waarde terug.
  function openPakje(pakId) {
    return werk((s) => {
      const pak = PAKJES.find((x) => x.id === pakId);
      if (!pak) return { ok: false, reden: 'onbekend' };
      if (s.munten.saldo < pak.prijs) return { ok: false, reden: 'te-weinig' };
      const t = trekItem(s, pak);
      boek(s, -pak.prijs, pak.naam + ' geopend', 'pak:' + pak.id + ':' + t.it.id); // met het item erbij, zodat het terug te vinden is
      return { ok: true, item: t.it.id, dubbel: t.dubbel, terug: t.terug, saldo: s.munten.saldo };
    });
  }

  // ───────── Troostpakje (v3.0) ─────────
  // Na een onvoldoende (onder 5,5) krijg je een gratis klein pakje en een paar munten. Niet te misbruiken:
  //   - per kaart-id maar één keer (spo_munten_ids, sleutel 't:<kaart>');
  //   - hoogstens TROOST_PER_DAG per dag (spo_munten_ids, sleutels 'td:<dag>:1..3'). Zo is er geen extra opslag en gaan beide mee in de back-up.
  const TROOST_PER_DAG = 3;
  const TROOST_MUNTEN = 5;
  const VOLDOENDE = 5.5;
  // Geeft { ok:true, item, dubbel, terug, munten, saldo } of { ok:false, reden: 'ongeldig' | 'voldoende' | 'al-gehad' | 'dagmax' }.
  function troostPakje(kaartId, cijfer) {
    return werk((s) => {
      const id = typeof kaartId === 'string' ? kaartId.slice(0, 60) : '';
      if (!id || !Number.isFinite(cijfer) || cijfer < 1 || cijfer > 10) return { ok: false, reden: 'ongeldig' };
      if (cijfer >= VOLDOENDE) return { ok: false, reden: 'voldoende' };
      if (s.ids['t:' + id]) return { ok: false, reden: 'al-gehad' };
      const nu = vandaag();
      let slot = 0;
      for (let n = 1; n <= TROOST_PER_DAG; n++) if (!s.ids['td:' + nu + ':' + n]) { slot = n; break; }
      if (!slot) return { ok: false, reden: 'dagmax' };
      s.ids['t:' + id] = 1;
      s.ids['td:' + nu + ':' + slot] = 1;
      const pak = PAKJES[0];
      const t = trekItem(s, pak);
      s.log.unshift({ ts: Date.now(), n: 0, r: 'Troostpakje: ' + t.it.naam, id: 'pak:troost:' + t.it.id });
      boek(s, TROOST_MUNTEN, 'Troostmunten', 'troost:' + id);
      return { ok: true, item: t.it.id, dubbel: t.dubbel, terug: t.terug, munten: TROOST_MUNTEN, saldo: s.munten.saldo };
    });
  }
  // ───────── Wekelijkse drop (v3.0) ─────────
  // Een mythische kaart telt één keer mee voor de teller van alle spelers (sleutel 'dm:<kaart>' in spo_munten_ids, dus ook mee in de back-up).
  async function dropGemeld(kaartId) {
    const r = await leesAlles([K.ids]);
    return !!obj(r[K.ids])['dm:' + String(kaartId).slice(0, 60)];
  }
  function dropMarkeer(kaartId) {
    return werk((s) => { const sl = 'dm:' + String(kaartId).slice(0, 60); if (s.ids[sl]) return false; s.ids[sl] = 1; return true; });
  }

  // ───────── Arcade (v3.0): vier mini-games met munten ─────────
  // Elk spel kost ARCADE_INZET munten en betaalt na afloop hoogstens `max` terug. Bij elk spel hoort een vaste kans- of puntentabel
  // (zie arcadelib.js) waarmee je gemiddeld iets minder terugkrijgt dan je inzet: de arcade is een muntensink, geen geldmachine.
  //   - Hoogstens ARCADE_PER_DAG spellen per dag (lokale dag). Dat staat in spo_munten_ids (sleutels 'ar:<dag>:<nr>'), net als het troostpakje,
  //     dus het gaat mee in de back-up en je kunt de limiet niet omzeilen door een back-up terug te zetten.
  //   - De uitbetaling hoort bij een gestart spel (sleutel 'arw:<dag>:<nr>') en kan maar één keer, nooit meer dan `max`.
  //   - Stop je halverwege (pagina dicht), dan is de inzet weg en is het spel gespeeld.
  const ARCADE_PER_DAG = 10;
  const ARCADE_INZET = 5;
  const ARCADE = { memory: { naam: 'Memory', max: 12 }, hoger: { naam: 'Hoger of lager', max: 16 }, kras: { naam: 'Kraslot', max: 50 }, rad: { naam: 'Rad van fortuin', max: 20 } };
  const SLOT = /^ar:\d{4}-\d{2}-\d{2}:\d{1,2}$/;
  const arcadeGespeeld = (s, nu) => { let n = 0; for (let i = 1; i <= ARCADE_PER_DAG; i++) if (s.ids['ar:' + nu + ':' + i]) n++; return n; };
  // Hoeveel spellen heb je vandaag nog?
  async function arcadeStatus() {
    const r = await leesAlles([K.ids, K.munten]);
    const s = { ids: obj(r[K.ids]) };
    const g = arcadeGespeeld(s, vandaag());
    return { gespeeld: g, over: Math.max(0, ARCADE_PER_DAG - g), max: ARCADE_PER_DAG, inzet: ARCADE_INZET, saldo: schoonMunten(r[K.munten]).saldo };
  }
  // Betaalt de inzet en geeft een slot terug: { ok:true, slot, saldo, over } of { ok:false, reden: 'onbekend' | 'dagmax' | 'te-weinig' }.
  function arcadeStart(spel) {
    return werk((s) => {
      const sp = ARCADE[spel];
      if (!sp || !Object.prototype.hasOwnProperty.call(ARCADE, spel)) return { ok: false, reden: 'onbekend' };
      const nu = vandaag();
      let nr = 0;
      for (let i = 1; i <= ARCADE_PER_DAG; i++) if (!s.ids['ar:' + nu + ':' + i]) { nr = i; break; }
      if (!nr) return { ok: false, reden: 'dagmax' };
      if (s.munten.saldo < ARCADE_INZET) return { ok: false, reden: 'te-weinig' };
      const slot = 'ar:' + nu + ':' + nr;
      s.ids[slot] = 1;
      boek(s, -ARCADE_INZET, 'Arcade: ' + sp.naam, slot);
      return { ok: true, slot, saldo: s.munten.saldo, over: ARCADE_PER_DAG - arcadeGespeeld(s, nu) };
    });
  }
  // Betaalt de winst van een gestart spel uit (0 mag). Geeft { ok:true, winst, saldo } of { ok:false, reden: 'onbekend' | 'ongeldig' | 'al-betaald' }.
  function arcadeKlaar(slot, spel, winst) {
    return werk((s) => {
      const sp = Object.prototype.hasOwnProperty.call(ARCADE, spel) ? ARCADE[spel] : null;
      if (!sp || typeof slot !== 'string' || !SLOT.test(slot) || !s.ids[slot]) return { ok: false, reden: 'onbekend' };
      if (!Number.isFinite(winst) || winst < 0 || winst > sp.max || Math.floor(winst) !== winst) return { ok: false, reden: 'ongeldig' };
      const sl = 'arw' + slot.slice(2);
      if (s.ids[sl]) return { ok: false, reden: 'al-betaald' };
      s.ids[sl] = 1;
      if (winst > 0) boek(s, winst, 'Arcade gewonnen: ' + sp.naam, sl);
      return { ok: true, winst, saldo: s.munten.saldo };
    });
  }

  // ───────── Kaartspel (v3.0): munten voor een uitgespeeld potje, met een dagelijkse limiet ─────────
  // Hoogstens KAARTSPEL_PER_DAG potjes per dag leveren munten op (sleutel 'ks:<dag>:<nr>'); elk potje (id van het potje, 'ksw:<id>') wordt maar één keer uitbetaald.
  const KAARTSPEL_PER_DAG = 5;
  const KAARTSPEL_MUNTEN = { w: 12, g: 5, v: 2 };
  const KS_MID = /^[0-9a-f]{16,32}$/;
  const kaartspelTelling = (s, nu) => { let n = 0; for (let i = 1; i <= KAARTSPEL_PER_DAG; i++) if (s.ids['ks:' + nu + ':' + i]) n++; return n; };
  async function kaartspelStatus() {
    const r = await leesAlles([K.ids, K.munten]);
    const g = kaartspelTelling({ ids: obj(r[K.ids]) }, vandaag());
    return { gespeeld: g, over: Math.max(0, KAARTSPEL_PER_DAG - g), max: KAARTSPEL_PER_DAG, saldo: schoonMunten(r[K.munten]).saldo };
  }
  // uitslag: 'w' | 'g' | 'v'. Geeft { ok:true, munten, dagmax, over, saldo } of { ok:false, reden: 'onbekend' | 'al-betaald' }.
  function kaartspelKlaar(id, uitslag) {
    return werk((s) => {
      if (typeof id !== 'string' || !KS_MID.test(id) || !Object.prototype.hasOwnProperty.call(KAARTSPEL_MUNTEN, uitslag)) return { ok: false, reden: 'onbekend' };
      const sl = 'ksw:' + id;
      if (s.ids[sl]) return { ok: false, reden: 'al-betaald' };
      s.ids[sl] = 1;
      const nu = vandaag();
      let nr = 0;
      for (let i = 1; i <= KAARTSPEL_PER_DAG; i++) if (!s.ids['ks:' + nu + ':' + i]) { nr = i; break; }
      if (!nr) return { ok: true, munten: 0, dagmax: true, over: 0, saldo: s.munten.saldo };
      s.ids['ks:' + nu + ':' + nr] = 1;
      const n = KAARTSPEL_MUNTEN[uitslag];
      boek(s, n, 'Kaartspel: ' + (uitslag === 'w' ? 'gewonnen' : uitslag === 'g' ? 'gelijkspel' : 'meegedaan'), sl);
      return { ok: true, munten: n, dagmax: false, over: KAARTSPEL_PER_DAG - kaartspelTelling(s, nu), saldo: s.munten.saldo };
    });
  }

  // ───────── Snelspel (v3.0): korte lesbeurt-mini-games van ~20 seconden, met een eigen dagelijkse limiet ─────────
  // Gratis te spelen (geen inzet). Elk afgerond potje telt voor de limiet van MINI_PER_DAG per dag (sleutel 'mn:<dag>:<nr>'); een goed potje
  // levert MINI_MUNTEN munten op. Elk potje (id, 'mnw:<id>') kan maar één keer worden afgerekend. Het maximum per dag is dus MINI_PER_DAG * MINI_MUNTEN.
  const MINI_PER_DAG = 15;
  const MINI_MUNTEN = 2;
  const MINI_SPELLEN = ['reactie', 'schatting', 'hoogste', 'sorteer'];
  const MINI_ID = /^[0-9a-f]{16,32}$/;
  const miniTelling = (s, nu) => { let n = 0; for (let i = 1; i <= MINI_PER_DAG; i++) if (s.ids['mn:' + nu + ':' + i]) n++; return n; };
  async function miniStatus() {
    const r = await leesAlles([K.ids, K.munten]);
    const g = miniTelling({ ids: obj(r[K.ids]) }, vandaag());
    return { gespeeld: g, over: Math.max(0, MINI_PER_DAG - g), max: MINI_PER_DAG, munten: MINI_MUNTEN, saldo: schoonMunten(r[K.munten]).saldo };
  }
  // goed: true als het potje gehaald is. Geeft { ok:true, munten, dagmax, over, saldo } of { ok:false, reden: 'onbekend' | 'al-betaald' }.
  function miniKlaar(id, spel, goed) {
    return werk((s) => {
      if (typeof id !== 'string' || !MINI_ID.test(id) || !MINI_SPELLEN.includes(spel) || typeof goed !== 'boolean') return { ok: false, reden: 'onbekend' };
      const sl = 'mnw:' + id;
      if (s.ids[sl]) return { ok: false, reden: 'al-betaald' };
      s.ids[sl] = 1;
      const nu = vandaag();
      let nr = 0;
      for (let i = 1; i <= MINI_PER_DAG; i++) if (!s.ids['mn:' + nu + ':' + i]) { nr = i; break; }
      if (!nr) return { ok: true, munten: 0, dagmax: true, over: 0, saldo: s.munten.saldo };
      s.ids['mn:' + nu + ':' + nr] = 1;
      if (goed) boek(s, MINI_MUNTEN, 'Snelspel: goed potje', sl);
      return { ok: true, munten: goed ? MINI_MUNTEN : 0, dagmax: false, over: MINI_PER_DAG - miniTelling(s, nu), saldo: s.munten.saldo };
    });
  }

  // ───────── Campagne (v3.0): vier werelden met vijf niveaus, de vijfde is een eindbaas ─────────
  // Alles in spo_munten_ids, dus mee in de back-up en niet te omzeilen: 'cf:<wereld>:<niveau>' (eerste winst, eenmalig meer munten),
  // 'cd:<dag>:<nr>' (beloonde herhalingen, hoogstens CAMPAGNE_PER_DAG per dag) en 'cw:<wereld>' (wereld voltooid: titel en kaartkleuren, eenmalig).
  const CAMPAGNE_WERELDEN = { exact: ['ti-drakendoder', 'kt-vulkaan'], talen: ['ti-feniksvriend', 'kt-zonnetempel'], mens: ['ti-krakenbedwinger', 'kt-diepzee'], kunst: ['ti-griffioenmeester', 'kt-bergtop'] };
  const CAMPAGNE_PER_DAG = 3;
  const CAMPAGNE_EERSTE = [15, 20, 25, 30, 60];   // eenmalig, per niveau (het vijfde is de baas)
  const CAMPAGNE_HERHALING = [4, 5, 6, 7, 10];    // per beloonde herhaling
  const campagneTelling = (s, nu) => { let n = 0; for (let i = 1; i <= CAMPAGNE_PER_DAG; i++) if (s.ids['cd:' + nu + ':' + i]) n++; return n; };
  async function campagneStatus() {
    const r = await leesAlles([K.ids, K.munten]);
    const g = campagneTelling({ ids: obj(r[K.ids]) }, vandaag());
    return { gespeeld: g, over: Math.max(0, CAMPAGNE_PER_DAG - g), max: CAMPAGNE_PER_DAG, saldo: schoonMunten(r[K.munten]).saldo };
  }
  // Na een gewonnen niveau. Geeft { ok:true, eerste, munten, dagmax, over, wereldKlaar, items:[itemId], saldo } of { ok:false, reden:'onbekend' }.
  function campagneKlaar(wereld, niveau) {
    return werk((s) => {
      if (typeof wereld !== 'string' || !Object.prototype.hasOwnProperty.call(CAMPAGNE_WERELDEN, wereld) || !Number.isInteger(niveau) || niveau < 1 || niveau > 5) return { ok: false, reden: 'onbekend' };
      const nu = vandaag();
      const uit = { ok: true, eerste: false, munten: 0, dagmax: false, over: 0, wereldKlaar: false, items: [] };
      const eerste = 'cf:' + wereld + ':' + niveau;
      if (!s.ids[eerste]) {
        s.ids[eerste] = 1; uit.eerste = true; uit.munten = CAMPAGNE_EERSTE[niveau - 1];
        boek(s, uit.munten, 'Campagne: niveau ' + niveau + ' gewonnen', eerste);
      } else {
        let nr = 0;
        for (let i = 1; i <= CAMPAGNE_PER_DAG; i++) if (!s.ids['cd:' + nu + ':' + i]) { nr = i; break; }
        if (!nr) uit.dagmax = true;
        else { s.ids['cd:' + nu + ':' + nr] = 1; uit.munten = CAMPAGNE_HERHALING[niveau - 1]; boek(s, uit.munten, 'Campagne: herhaling gewonnen', 'cd:' + nu + ':' + nr); }
      }
      if (niveau === 5 && !s.ids['cw:' + wereld]) {
        s.ids['cw:' + wereld] = 1; uit.wereldKlaar = true;
        for (const id of CAMPAGNE_WERELDEN[wereld]) if (!s.winkel.gekocht.includes(id)) { s.winkel.gekocht.push(id); uit.items.push(id); s.log.unshift({ ts: Date.now(), n: 0, r: 'Campagne voltooid: ' + PER_ID.get(id).naam, id: 'cw:' + wereld + ':' + id }); }
      }
      uit.over = Math.max(0, CAMPAGNE_PER_DAG - campagneTelling(s, nu)); uit.saldo = s.munten.saldo;
      return uit;
    });
  }

  // ───────── Beloningen van vrienden (v3.0: uitnodigen en aartsrivaal) ─────────
  // Een gratis pakje. `id` zorgt dat het maar één keer telt (spo_munten_ids, sleutel 'gp:<id>').
  function gratisPakje(pakId, reden, id) {
    return werk((s) => {
      const pak = PAKJES.find((x) => x.id === pakId);
      const sl = 'gp:' + String(id || '').slice(0, 80);
      if (!pak || !id) return { ok: false, reden: 'onbekend' };
      if (s.ids[sl]) return { ok: false, reden: 'al-gehad' };
      s.ids[sl] = 1;
      const t = trekItem(s, pak);
      s.log.unshift({ ts: Date.now(), n: 0, r: String(reden || 'Gratis pakje').slice(0, 40) + ': ' + t.it.naam, id: 'pak:gratis:' + t.it.id });
      return { ok: true, item: t.it.id, dubbel: t.dubbel, terug: t.terug, saldo: s.munten.saldo };
    });
  }
  // Een paar bonusmunten, één keer per id (de aanroeper bewaakt het maximum per dag).
  function bonusMunten(id, n, reden) {
    return werk((s) => (Number.isFinite(n) && n > 0 && n <= 100 && verdien(s, 'bm:' + String(id).slice(0, 80), Math.floor(n), reden) ? Math.floor(n) : 0));
  }
  function gebruik(soort, itemId) {
    return werk((s) => {
      const g = s.winkel.gebruik;
      if (soort === 'somtoday') g.somtoday = itemId && s.winkel.gekocht.includes(itemId) ? itemId : 'standaard';
      else if (soort === 'titel') g.titel = itemId && s.winkel.gekocht.includes(itemId) ? itemId : null;
      else if (soort === 'bg') g.bg = itemId && s.winkel.gekocht.includes(itemId) ? itemId : 'standaard';
      return true;
    });
  }

  // ───────── Voetballer en stadion (v3.0) ─────────
  // Keuzes die je niet (meer) hebt gekocht vallen terug op de standaard. Zonder voetbal.js is er niets te bewaren.
  async function leesVoetbal() {
    if (!VB) return null;
    const r = await leesAlles([K.voetbal, K.winkel]);
    const gekocht = schoonWinkel(r[K.winkel]).gekocht;
    const t = obj(r[K.voetbal]);
    return { staat: VB.schoonToestand(t, gekocht), gekocht, gekozen: { avatar: !!t.avatar, stadion: !!t.stadion } };
  }
  // wijzig: { avatar?: {...}, stadion?: {...} }; wat je meegeeft wordt over het oude heen gelegd en schoongemaakt.
  async function bewaarVoetbal(wijzig) {
    if (!VB) return null;
    const r = await leesAlles([K.voetbal, K.winkel]);
    const gekocht = schoonWinkel(r[K.winkel]).gekocht;
    const oud = obj(r[K.voetbal]);
    const w = obj(wijzig);
    const nu = { v: 1 };
    if (w.avatar || oud.avatar) nu.avatar = VB.schoonAvatar(Object.assign({}, obj(oud.avatar), obj(w.avatar)), gekocht);
    if (w.stadion || oud.stadion) nu.stadion = VB.schoonStadion(Object.assign({}, obj(oud.stadion), obj(w.stadion)), gekocht);
    await schrijfAlles({ [K.voetbal]: nu });
    return VB.schoonToestand(nu, gekocht);
  }
  // Mijn uiterlijk voor de strafschop (motor/strafschop.js): SPO.strafschop.start({ schutter: Object.assign({ vak, cijfer }, { av: u.av }), thema: u.thema }).
  // Zo kan een duel mijn voetballer als schutter en mijn stadion als thuisstadion laten zien. Zonder voetbal.js: null.
  async function duelUiterlijk() {
    const r = await leesVoetbal();
    return r ? { av: VB.naarSchutter(r.staat.avatar), thema: VB.naarThema(r.staat.stadion) } : null;
  }

  // ───────── Dagelijkse beloning ─────────
  const dagTekst = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const vandaag = () => dagTekst(new Date());
  const gisteren = () => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 1); return dagTekst(d); };

  // Pakt de beloning van vandaag, als dat nog niet is gebeurd. Geeft null als je vandaag al had, anders { dag, munten, item?, reeks }.
  function claimDagelijks() {
    return werk((s) => {
      const nu = vandaag();
      if (s.dag.laatste === nu) return null;
      const reeks = s.dag.laatste === gisteren() && s.dag.reeks >= 1 ? (s.dag.reeks % 7) + 1 : 1;
      s.dag = { laatste: nu, reeks, dagen: s.dag.dagen + 1 };
      const uit = { dag: reeks, munten: 0, item: null };
      if (reeks < 7) {
        uit.munten = DAG_BELONING[reeks - 1];
      } else {
        const over = ITEMS.filter((i) => i.prijs == null && !i.campagne && !s.winkel.gekocht.includes(i.id));
        if (over.length) { uit.item = lootUit(over).id; s.winkel.gekocht.push(uit.item); }
        else uit.munten = 100;
      }
      if (uit.munten) boek(s, uit.munten, `Dagelijkse beloning (dag ${reeks})`, 'dag:' + nu);
      else s.log.unshift({ ts: Date.now(), n: 0, r: 'Dagelijkse beloning: ' + PER_ID.get(uit.item).naam, id: 'dag:' + nu });
      return uit;
    });
  }
  async function dagStatus() {
    const d = schoonDag((await leesAlles([K.dag]))[K.dag]);
    const nu = vandaag();
    const loopt = d.laatste === nu || d.laatste === gisteren();
    return { gehaald: d.laatste === nu, reeks: loopt ? d.reeks : 0, volgende: d.laatste === nu ? (d.reeks % 7) + 1 : loopt && d.reeks ? (d.reeks % 7) + 1 : 1 };
  }

  async function lees() {
    const r = await leesAlles(SL.concat([K.profiel]));
    return { munten: schoonMunten(r[K.munten]), log: Array.isArray(r[K.log]) ? r[K.log] : [], winkel: schoonWinkel(r[K.winkel]), profiel: schoonEigenProfiel(r[K.profiel]) };
  }

  // ───────── Profiel ─────────
  const TIERNAMEN = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const tierVan = (c) => (c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0);
  const afk = (vak) => String(vak || '?').replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase() || '?';
  // Bijnaam (eigen of van een vriend): door het tekstfilter. Komt hij er niet door, of is het filter niet geladen, dan is hij leeg.
  if (!globalThis.SPOTekst && typeof require === 'function') { try { globalThis.SPOTekst = require('./tekstfilter.js'); } catch (e) { /* niet beschikbaar */ } }
  const schoonBijnaam = (t) => {
    const k = String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
    return k && globalThis.SPOTekst ? globalThis.SPOTekst.toonNaam(k, '') : '';
  };
  function schoonEigenProfiel(p) { p = obj(p); return { bijnaam: schoonBijnaam(p.bijnaam), deel: p.deel !== false }; }

  // De kaart die ik zelf laat zien (en aan vrienden stuur): geen echte naam, alleen wat de gebruiker koos.
  function maakProfiel(galerij, munten, winkel, profiel) {
    const per = new Map();
    let zeldz = 0, som = 0, wsom = 0;
    for (const e of galerij || []) {
      if (!e || !Number.isFinite(e.cijfer)) continue;
      const w = Number.isFinite(e.weging) && e.weging > 0 ? e.weging : 1;
      som += e.cijfer * w; wsom += w;
      if (e.zeldzaam) zeldz++;
      const v = String(e.vak || '?').toLowerCase();
      const x = per.get(v) || { vak: e.vak, s: 0, w: 0 };
      x.s += e.cijfer * w; x.w += w; per.set(v, x);
    }
    const stats = [...per.values()].map((x) => ({ vak: afk(x.vak), c: x.s / x.w })).sort((a, b) => b.c - a.c).slice(0, 6).map((x) => ({ v: x.vak, n: Math.round(x.c * 10) }));
    const gem = wsom ? som / wsom : 0;
    const w = schoonWinkel(winkel).gebruik;
    const m = schoonMunten(munten);
    const vb = VB ? VB.deelbaar(obj(profiel).voetbal, schoonWinkel(winkel).gekocht) : { av: null, sd: null };
    const uit = { bn: schoonBijnaam(obj(profiel).bijnaam), s: stats, ovr: Math.round(gem * 10), niv: wsom ? tierVan(gem) : 0, z: Math.min(999, zeldz), k: Math.min(9999, (galerij || []).length), w: m.gev.w, g: m.gev.g, l: m.gev.v, t: w.titel || '', bg: w.bg || 'standaard' };
    if (vb.av) uit.av = vb.av;
    if (vb.sd) uit.sd = vb.sd;
    return uit;
  }
  // Wat een vriend stuurt, streng schoongemaakt (alleen vaste vormen en lengtes).
  function schoonProfiel(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const getal = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    const id = (v) => (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v) ? v : '');
    const s = (Array.isArray(p.s) ? p.s : []).slice(0, 6).filter((x) => x && typeof x.v === 'string' && Number.isFinite(x.n))
      .map((x) => ({ v: x.v.replace(/[^A-Za-zÀ-ÿ?]/g, '').slice(0, 3).toUpperCase() || '?', n: getal(x.n, 100) }));
    const uit = { bn: schoonBijnaam(p.bn), s, ovr: getal(p.ovr, 100), niv: Math.min(4, getal(p.niv, 4)), z: getal(p.z, 999), k: getal(p.k, 9999), w: getal(p.w, 99999), g: getal(p.g, 99999), l: getal(p.l, 99999), t: id(p.t), bg: id(p.bg) || 'standaard' };
    // v3.0: voetballer en stadion van de vriend (oudere versies sturen ze niet mee)
    if (VB && p.av && typeof p.av === 'object' && !Array.isArray(p.av)) uit.av = VB.schoonAvatar(p.av);
    if (VB && p.sd && typeof p.sd === 'object' && !Array.isArray(p.sd)) uit.sd = VB.schoonStadion(p.sd);
    return uit;
  }
  // Wat er naar vrienden gaat (of null als de gebruiker niet deelt of nog niets heeft).
  async function mijnProfielDeelbaar(galerij) {
    const r = await leesAlles([K.munten, K.winkel, K.profiel, K.voetbal]);
    const prof = schoonEigenProfiel(r[K.profiel]);
    if (!prof.deel) return null;
    const p = maakProfiel(galerij, r[K.munten], r[K.winkel], Object.assign({}, prof, { voetbal: r[K.voetbal] }));
    return p.k || p.bn || p.w || p.g || p.l || p.av || p.sd ? schoonProfiel(p) : null;
  }
  async function bewaarProfiel(wijzig) {
    const r = await leesAlles([K.profiel]);
    const nu = Object.assign(schoonEigenProfiel(r[K.profiel]), wijzig);
    nu.bijnaam = schoonBijnaam(nu.bijnaam);
    await schrijfAlles({ [K.profiel]: nu });
    return nu;
  }

  globalThis.SPOEco = {
    K, ITEMS, PER_ID, SOORTEN, ZELD, PAKJES, TERUG, DAG_BELONING, TIERNAMEN,
    waarde, cijferMunten, verdienCijfer, sweep, koop, openPakje, gratisPakje, bonusMunten, gebruik, claimDagelijks, dagStatus, troostPakje, TROOST_PER_DAG, CAMPAGNE_WERELDEN, CAMPAGNE_PER_DAG, CAMPAGNE_EERSTE, CAMPAGNE_HERHALING, campagneStatus, campagneKlaar, dropGemeld, dropMarkeer, ARCADE, ARCADE_PER_DAG, ARCADE_INZET, arcadeStatus, arcadeStart, arcadeKlaar, KAARTSPEL_PER_DAG, KAARTSPEL_MUNTEN, kaartspelStatus, kaartspelKlaar, MINI_PER_DAG, MINI_MUNTEN, MINI_SPELLEN, miniStatus, miniKlaar, lees, registreerThemas, leesVoetbal, bewaarVoetbal, duelUiterlijk,
    maakProfiel, schoonProfiel, mijnProfielDeelbaar, bewaarProfiel, schoonBijnaam, schoonWinkel, schoonMunten, vandaag,
  };
})();
