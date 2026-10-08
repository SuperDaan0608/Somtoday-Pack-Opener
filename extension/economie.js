/*
 * Somtoday Pack Opener v2: munten, winkel, dagelijkse beloning en profiel (gedeelde code).
 * Draait in het Somtoday-venster (content script) en op de pagina's van de extensie. Alles blijft in deze browser.
 *
 * Opslag (chrome.storage.local):
 *   spo_munten      { v:1, saldo, totaal, gev:{w,g,v}, ts }       de portemonnee
 *   spo_munten_log  [{ ts, n, r, id }]                              laatste 100 mutaties
 *   spo_munten_ids  { [id]: 1 }                                     wat al is uitbetaald (cijfer c:, gevecht g:, prestatie p:), zodat niets dubbel telt
 *   spo_dagelijks   { laatste:'JJJJ-MM-DD', reeks:1..7, dagen }     dagelijkse beloning
 *   spo_winkel      { gekocht:[itemId], gebruik:{somtoday, titel, bg} }
 *   spo_profiel     { bijnaam, deel }
 * De munten hebben nooit invloed op cijfers: het zijn alleen cosmetische dingen.
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  const K = { munten: 'spo_munten', log: 'spo_munten_log', ids: 'spo_munten_ids', dag: 'spo_dagelijks', winkel: 'spo_winkel', profiel: 'spo_profiel', galerij: 'spo_galerij', gev: 'spo_gevechten', prest: 'spo_prestaties', inst: 'spo_instellingen' };

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
  const PER_ID = new Map(ITEMS.map((i) => [i.id, i]));
  const SOORTEN = { somtoday: 'Somtoday-thema', kaartthema: 'Kaartkleuren', rand: 'Kaartrand', titel: 'Profieltitel', bg: 'Profielachtergrond' };
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

  const cijferMunten = (c, zeldzaam) => {
    const basis = c >= 10 ? 30 : c >= 9 ? 18 : c >= 8 ? 12 : c >= 7 ? 8 : c >= 5.5 ? 5 : 2;
    return basis * (zeldzaam ? 3 : 1);
  };

  // Een geopend cijfer. id = de sig van het cijfer (ook de id in de galerij), dus galerij en direct tellen niet dubbel.
  function verdienCijfer(id, cijfer, zeldzaam) {
    if (!id || !Number.isFinite(cijfer)) return Promise.resolve(0);
    return werk((s) => {
      if (s.nieuw) return 0; // de eerste keer regelt sweep() het startbedrag
      const n = cijferMunten(cijfer, zeldzaam);
      return verdien(s, 'c:' + id, n, zeldzaam ? 'Zeldzaam cijfer geopend' : 'Cijfer geopend') ? n : 0;
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
        if (e && typeof e.id === 'string' && Number.isFinite(e.cijfer)) telop('c:' + e.id, cijferMunten(e.cijfer, e.zeldzaam === true), e.zeldzaam === true ? 'Zeldzaam cijfer geopend' : 'Cijfer geopend');
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
  // Koopt en opent een pakje. Dubbel item: je krijgt een deel van de waarde terug.
  function openPakje(pakId) {
    return werk((s) => {
      const pak = PAKJES.find((x) => x.id === pakId);
      if (!pak) return { ok: false, reden: 'onbekend' };
      if (s.munten.saldo < pak.prijs) return { ok: false, reden: 'te-weinig' };
      let z = kiesKans(pak.kans);
      while (z > 0 && !ITEMS.some((i) => i.zeld === z)) z--;
      const it = lootUit(ITEMS.filter((i) => i.zeld === z));
      boek(s, -pak.prijs, pak.naam + ' geopend', 'pak:' + pak.id + ':' + it.id); // met het item erbij, zodat het terug te vinden is
      const dubbel = s.winkel.gekocht.includes(it.id);
      let terug = 0;
      if (dubbel) { terug = Math.max(1, Math.round(waarde(it) * TERUG)); boek(s, terug, 'Dubbel: ' + it.naam, 'dubbel:' + it.id); }
      else s.winkel.gekocht.push(it.id);
      return { ok: true, item: it.id, dubbel, terug, saldo: s.munten.saldo };
    });
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
        const over = ITEMS.filter((i) => i.prijs == null && !s.winkel.gekocht.includes(i.id));
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
  const schoonBijnaam = (t) => String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
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
    return { bn: schoonBijnaam(obj(profiel).bijnaam), s: stats, ovr: Math.round(gem * 10), niv: wsom ? tierVan(gem) : 0, z: Math.min(999, zeldz), k: Math.min(9999, (galerij || []).length), w: m.gev.w, g: m.gev.g, l: m.gev.v, t: w.titel || '', bg: w.bg || 'standaard' };
  }
  // Wat een vriend stuurt, streng schoongemaakt (alleen vaste vormen en lengtes).
  function schoonProfiel(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const getal = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    const id = (v) => (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v) ? v : '');
    const s = (Array.isArray(p.s) ? p.s : []).slice(0, 6).filter((x) => x && typeof x.v === 'string' && Number.isFinite(x.n))
      .map((x) => ({ v: x.v.replace(/[^A-Za-zÀ-ÿ?]/g, '').slice(0, 3).toUpperCase() || '?', n: getal(x.n, 100) }));
    return { bn: schoonBijnaam(p.bn), s, ovr: getal(p.ovr, 100), niv: Math.min(4, getal(p.niv, 4)), z: getal(p.z, 999), k: getal(p.k, 9999), w: getal(p.w, 99999), g: getal(p.g, 99999), l: getal(p.l, 99999), t: id(p.t), bg: id(p.bg) || 'standaard' };
  }
  // Wat er naar vrienden gaat (of null als de gebruiker niet deelt of nog niets heeft).
  async function mijnProfielDeelbaar(galerij) {
    const r = await leesAlles([K.munten, K.winkel, K.profiel]);
    const prof = schoonEigenProfiel(r[K.profiel]);
    if (!prof.deel) return null;
    const p = maakProfiel(galerij, r[K.munten], r[K.winkel], prof);
    return p.k || p.bn || p.w || p.g || p.l ? schoonProfiel(p) : null;
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
    waarde, cijferMunten, verdienCijfer, sweep, koop, openPakje, gebruik, claimDagelijks, dagStatus, lees, registreerThemas,
    maakProfiel, schoonProfiel, mijnProfielDeelbaar, bewaarProfiel, schoonBijnaam, schoonWinkel, schoonMunten, vandaag,
  };
})();
