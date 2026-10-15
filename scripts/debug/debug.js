/*
 * Somtoday Pack Opener DEBUG-BUILD: het testmenu (debug.html, ook als tab "Debug" in de hub).
 * Gebruikt zoveel mogelijk de bestaande code: SPOEco (munten, winkel, pakjes), SPOPrestaties (badges), SPOHuisdier (stadia),
 * SPOAccount (back-up) en voor animaties de bestaande route spo_replay (content.js, startProef).
 * Wat op Somtoday moet gebeuren (toast, emoji, uitval-feest) gaat via 'spo_debug_cmd' naar debug-somtoday.js.
 * Dit bestand zit ALLEEN in de debug-zip (scripts/package-debug.sh).
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const S = chrome.storage.local;
  const $ = (id) => document.getElementById(id);
  const NU = () => Date.now();
  const ingebed = new URLSearchParams(location.search).get('embed') === '1';
  const Eco = globalThis.SPOEco, Prest = globalThis.SPOPrestaties, Dier = globalThis.SPOHuisdier, Acc = globalThis.SPOAccount;
  const Tekst = globalThis.SPOTekst, Vr = globalThis.SPOVrienden, Nep = globalThis.__spoDebugNep || { uitkomst: {}, verstuurd: [], waarschuwingen: [] };
  const VAKKEN = ['Wiskunde', 'Nederlands', 'Engels', 'Natuurkunde', 'Scheikunde', 'Biologie', 'Geschiedenis', 'Aardrijkskunde', 'Frans', 'Duits', 'Informatica', 'Tekenen'];
  const DAG = 864e5;

  const OPENINGEN = ['pak', 'kluis', 'plinko', 'ster', 'raket', 'schiet', 'dans'];
  const OPENING_NAAM = { pak: 'Pakje', kluis: 'Kluis', plinko: 'Plinko', ster: 'Wensster', raket: 'Raket', schiet: 'Schieten', dans: 'Dansje', willekeurig: 'Verras me' };
  const TREDE_NAAM = ['Gewoon', 'Zeldzaam', 'Glim', 'Kosmisch', 'Mythisch'];
  const SEIZOENEN = [['geen', 'Geen'], ['auto', 'Automatisch (datum)'], ['halloween', 'Halloween'], ['kerst', 'Kerst'], ['zomer', 'Zomer']];
  const URL_RELEASES = 'https://github.com/SuperDaan0608/Somtoday-Pack-Opener/releases/latest';

  const get = async (k) => (await S.get(k))[k];
  const set = (o) => S.set(o);
  const tierVan = (c) => (c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0); // zelfde als economie.js
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

  let meldTimer = 0;
  function melding(tekst, fout) {
    const m = $('melding');
    m.textContent = tekst;
    m.classList.toggle('fout', !!fout);
    clearTimeout(meldTimer);
    meldTimer = setTimeout(() => { m.textContent = ''; }, 7000);
  }
  // Voert een actie uit en meldt het resultaat (of de fout).
  const doe = (fn, ok) => async (...a) => {
    try { const r = await fn(...a); const t = typeof ok === 'function' ? ok(r) : ok; if (t) melding(t); return r; }
    catch (e) { melding('Mislukt: ' + (e && e.message ? e.message : e), true); }
  };
  async function stuur(cmd) { await set({ spo_debug_cmd: Object.assign({ ts: NU() }, cmd) }); }
  async function zetDebug(patch) { const d = Object.assign({}, await get('spo_debug'), patch); await set({ spo_debug: d }); return d; }

  function vul(sel, lijst, waarde) {
    for (const [v, t] of lijst) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); }
    if (waarde != null) sel.value = waarde;
  }
  function knop(ouder, tekst, klik, klas) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'knop' + (klas ? ' ' + klas : ''); b.textContent = tekst;
    b.addEventListener('click', klik); ouder.append(b); return b;
  }

  // ───────── Kaarten en animaties ─────────
  vul($('k-trede'), TREDE_NAAM.map((n, i) => [String(i), `${i} · ${n}`]), '0');
  vul($('k-opening'), Object.entries(OPENING_NAAM), 'pak');
  vul($('k-seizoen'), SEIZOENEN, 'geen');

  function leesForm() {
    const cijfer = Math.round(parseFloat($('k-cijfer').value.replace(',', '.')) * 10) / 10;
    if (!(cijfer >= 1 && cijfer <= 10)) { melding('Het cijfer moet tussen 1 en 10 liggen.', true); return null; }
    let opening = $('k-opening').value;
    if (!OPENINGEN.includes(opening)) opening = OPENINGEN[Math.floor(Math.random() * OPENINGEN.length)];
    return {
      vak: $('k-vak').value.trim().slice(0, 40) || 'Vak', cijfer,
      weging: Math.max(1, Math.min(4, parseInt($('k-weging').value, 10) || 1)),
      onderwerp: $('k-onderwerp').value.trim().slice(0, 80) || 'Toets (debug)',
      trede: parseInt($('k-trede').value, 10) | 0, vloek: $('k-vloek').checked, opening, seizoen: $('k-seizoen').value,
    };
  }
  const drie = (id) => ($(id).value === 'true' ? true : $(id).value === 'false' ? false : undefined);

  // Animatie: dezelfde route als "Animatie opnieuw" in de galerij (spo_replay), met een paar extra velden die alleen de debug-build doorgeeft.
  async function speel(extra) {
    const f = leesForm();
    if (!f) return false;
    const d = Object.assign({}, f, extra);
    await set({ spo_replay: { ts: NU(), vak: d.vak, cijfer: d.cijfer, onderwerp: d.onderwerp, weging: d.weging, trede: d.trede, zeldzaam: d.trede >= 1,
      opening: d.opening, seizoen: d.seizoen, valsAlarm: 'valsAlarm' in d ? d.valsAlarm : drie('a-vals'), upgrade: 'upgrade' in d ? d.upgrade : drie('a-upg'), vloek: !!d.vloek, debug: true } });
    melding(`Animatie gestart: ${OPENING_NAAM[d.opening]}, ${TREDE_NAAM[d.trede]}, ${d.cijfer}. Kijk op het zichtbare Somtoday-tabblad.`);
    return true;
  }

  const nieuwId = (i) => 'debug:' + NU().toString(36) + Math.random().toString(36).slice(2, 6) + (i || 0).toString(36);
  const maakEntry = (f, i, ts) => {
    const id = nieuwId(i);
    const e = { id, ts: ts || NU() + (i || 0), vak: f.vak, cijfer: f.cijfer, onderwerp: f.onderwerp, weging: f.weging, opening: f.opening, tier: tierVan(f.cijfer), zeldzaam: f.trede >= 1, trede: f.trede };
    if (f.vloek) e.vloek = true;
    return e;
  };
  // Zet kaarten (oudste eerst in `lijst`) bovenaan de galerij. Maximaal 150 kaarten: eerst gaan de oudste debugkaarten eraf, nooit een echte kaart.
  async function bewaarKaarten(lijst, betaal) {
    let g = await get('spo_galerij');
    g = Array.isArray(g) ? g : [];
    g = lijst.slice().reverse().concat(g);
    while (g.length > 150) {
      let i = g.length - 1;
      while (i > 0 && !(g[i] && String(g[i].id).startsWith('debug:'))) i--;
      if (i <= 0) throw new Error('de galerij zit vol met echte kaarten (150)');
      g.splice(i, 1);
    }
    await set({ spo_galerij: g });
    if (!betaal) { const ids = (await get('spo_munten_ids')) || {}; for (const e of lijst) ids['c:' + e.id] = 1; await set({ spo_munten_ids: ids }); }
  }
  async function geefKaart() {
    const f = leesForm();
    if (!f) return;
    const e = maakEntry(f, 0);
    if ($('k-galerij').checked) await bewaarKaarten([e], $('k-munten').checked);
    if ($('k-speel').checked) await speel({ opening: f.opening });
    melding(`Kaart gegeven: ${f.vak} ${f.cijfer} (${TREDE_NAAM[f.trede]}${f.vloek ? ', vloek' : ''}), id ${e.id}.`);
  }
  // Meerdere debugkaarten: per trede (vak van het formulier), per vak (trede van het formulier) of elke trede in elk vak.
  async function geefMeer(soort) {
    const f = leesForm();
    if (!f) return;
    const lijst = [];
    const treden = soort === 'vakken' ? [f.trede] : [0, 1, 2, 3, 4];
    const vakken = soort === 'ladder' ? [f.vak] : VAKKEN;
    let i = 0;
    for (const vak of vakken) for (const trede of treden) lijst.push(maakEntry(Object.assign({}, f, { vak, trede }), i++));
    await bewaarKaarten(lijst, $('k-munten').checked);
    return lijst.length;
  }
  async function wisDebugKaarten() {
    const g = await get('spo_galerij');
    const rest = (Array.isArray(g) ? g : []).filter((e) => !(e && String(e.id).startsWith('debug:')));
    const n = (Array.isArray(g) ? g.length : 0) - rest.length;
    await set({ spo_galerij: rest });
    return n;
  }
  $('k-geef').addEventListener('click', doe(geefKaart));
  $('k-speel-nu').addEventListener('click', doe(() => speel({})));
  $('k-ladder').addEventListener('click', doe(() => geefMeer('ladder'), (n) => `${n} debugkaarten gegeven: elke trede in ${$('k-vak').value.trim() || 'het vak'}.`));
  $('k-vakken').addEventListener('click', doe(() => geefMeer('vakken'), (n) => `${n} debugkaarten gegeven: trede ${TREDE_NAAM[parseInt($('k-trede').value, 10) | 0]} in elk vak.`));
  $('k-matrix').addEventListener('click', doe(() => geefMeer('matrix'), (n) => `${n} debugkaarten gegeven: elke trede in elk vak.`));
  $('k-wis').addEventListener('click', doe(wisDebugKaarten, (n) => `${n} debugkaart(en) verwijderd.`));

  for (const o of OPENINGEN) knop($('a-openingen'), OPENING_NAAM[o], doe(() => speel({ opening: o })));
  TREDE_NAAM.forEach((n, i) => knop($('a-treden'), `${i} · ${n}`, doe(() => speel({ trede: i }))));
  for (const [s, n] of SEIZOENEN.slice(2)) knop($('a-seizoenen'), n, doe(() => speel({ opening: 'pak', seizoen: s })));
  const preset = {
    ultiem3: () => speel({ cijfer: 10, trede: 3 }),
    ultiem4: () => speel({ cijfer: 10, trede: 4 }),
    vals: () => speel({ trede: 0, cijfer: 7.5, valsAlarm: true, upgrade: false }),
    upgrade: () => speel({ trede: Math.max(2, Math.min(3, parseInt($('k-trede').value, 10) | 0)), cijfer: 8.6, upgrade: true, valsAlarm: false }),
    vloek: () => speel({ trede: 0, cijfer: 4.2, vloek: true }),
  };
  document.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', doe(preset[b.dataset.a])));

  // ───────── Munten, winkel, pakjes, dagelijkse beloning ─────────
  // Schrijft het saldo met een regel in de geschiedenis. telTotaal: telt ook mee als 'verdiend'.
  async function muntenWijzig(fn, reden, telTotaal) {
    const { munten, log } = await Eco.lees();
    const voor = munten.saldo;
    const m = Object.assign({}, munten, { init: true, ts: NU() });
    m.saldo = Math.max(0, Math.floor(fn(m.saldo)));
    if (telTotaal && m.saldo > voor) m.totaal += m.saldo - voor;
    const l = log.slice(); l.unshift({ ts: NU(), n: m.saldo - voor, r: reden.slice(0, 60), id: 'debug:' + NU() });
    await set({ spo_munten: Eco.schoonMunten(m), spo_munten_log: l.slice(0, 100) });
    return m.saldo;
  }
  const aantal = () => Math.max(0, Math.floor(Number($('m-getal').value) || 0));
  $('m-zet').addEventListener('click', doe(() => muntenWijzig(() => aantal(), 'Debug: saldo gezet', false), (s) => `Saldo is nu ${s}.`));
  $('m-plus').addEventListener('click', doe(() => muntenWijzig((x) => x + aantal(), 'Debug: munten gegeven', true), (s) => `Saldo is nu ${s}.`));
  $('m-nul').addEventListener('click', doe(() => muntenWijzig(() => 0, 'Debug: saldo naar 0', false), () => 'Saldo is 0.'));

  vul($('w-item'), Eco.ITEMS.map((i) => [i.id, `${i.naam} (${Eco.SOORTEN[i.soort]})`]));
  async function winkelZet(gekocht) {
    const w = Eco.schoonWinkel(await get('spo_winkel'));
    w.gekocht = gekocht;
    await set({ spo_winkel: Eco.schoonWinkel(w) });
  }
  $('w-alles').addEventListener('click', doe(() => winkelZet(Eco.ITEMS.map((i) => i.id)), 'Alle winkelitems ontgrendeld.'));
  $('w-een').addEventListener('click', doe(async () => {
    const w = Eco.schoonWinkel(await get('spo_winkel'));
    if (!w.gekocht.includes($('w-item').value)) w.gekocht.push($('w-item').value);
    await set({ spo_winkel: Eco.schoonWinkel(w) });
  }, 'Item ontgrendeld.'));
  $('w-geen').addEventListener('click', doe(async () => {
    // economie.js zet gekochte items terug uit de geschiedenis (herstelUitLog), dus die regels halen we hier ook weg.
    const log = (await get('spo_munten_log')) || [];
    const schoon = log.filter((e) => { const id = String(e && e.id || ''), r = String(e && e.r || ''); return !(id.startsWith('k:') || id.startsWith('pak:') || r.startsWith('Dagelijkse beloning: ')); });
    await set({ spo_munten_log: schoon });
    await winkelZet([]);
  }, 'Alle winkelitems vergrendeld (en de koop-regels uit de geschiedenis gehaald).'));

  for (const p of Eco.PAKJES) {
    knop($('p-pakjes'), `${p.naam} (waarde ${p.prijs})`, doe(async () => {
      await muntenWijzig((x) => x + p.prijs, 'Debug: gratis ' + p.naam.toLowerCase(), false); // eerst de prijs erbij, dan kopen: netto gratis
      const r = await Eco.openPakje(p.id);
      if (!r.ok) throw new Error(r.reden);
      const it = Eco.PER_ID.get(r.item);
      $('p-uitslag').textContent = `Je kreeg: ${it.naam} (${Eco.ZELD[it.zeld]}, ${Eco.SOORTEN[it.soort]})${r.dubbel ? `. Dubbel: ${r.terug} munten terug.` : '.'}`;
    }));
  }

  vul($('d-dag'), [1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), String(n) + (n === 7 ? ' (zeldzaam item)' : '')]), '1');
  const dagTekst = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  async function dagZet(n) {
    const huidig = (await get('spo_dagelijks')) || {};
    const g = new Date(); g.setHours(12, 0, 0, 0); g.setDate(g.getDate() - 1);
    await set({ spo_dagelijks: { laatste: n > 1 ? dagTekst(g) : '', reeks: n > 1 ? n - 1 : 0, dagen: Math.max(0, huidig.dagen | 0) } });
  }
  $('d-reset').addEventListener('click', doe(() => dagZet(1), 'Dagelijkse beloning gereset: vandaag kun je weer ophalen (dag 1).'));
  $('d-zet').addEventListener('click', doe(() => dagZet(parseInt($('d-dag').value, 10)), () => `De volgende dagelijkse beloning is dag ${$('d-dag').value}.`));

  // ───────── Huisdier ─────────
  vul($('h-stad'), Dier.STADIA.map((s, i) => [String(i), `${i} · ${s.naam} (vanaf ${s.vanaf} XP)`]), '0');
  async function dierZet(wijzig) {
    const h = Dier.schoon(await get('spo_huisdier'));
    wijzig(h);
    await set({ spo_huisdier: Dier.schoon(h) });
  }
  $('h-zet').addEventListener('click', doe(() => dierZet((h) => { h.xp = Math.max(0, Math.floor(Number($('h-getal').value) || 0)); h.gezien = Dier.stadiumVan(h.xp); }), 'XP gezet (zonder evolutie-animatie).'));
  $('h-zet-stad').addEventListener('click', doe(() => dierZet((h) => { const n = parseInt($('h-stad').value, 10); h.xp = Dier.STADIA[n].vanaf; h.gezien = n; }), 'Stadium gezet (zonder evolutie-animatie).'));
  document.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', doe(() => dierZet((h) => {
    h.humeur = b.dataset.h === 'rustig' ? null : { s: b.dataset.h, ts: NU() };
  }), () => 'Humeur gezet. Slaapt het beestje? Kies dan "Wakker" of "Volg de klok".')));
  document.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', doe(async () => {
    const w = b.dataset.s === 'true' ? true : b.dataset.s === 'false' ? false : null;
    await zetDebug({ slaap: w });
  }, 'Slaapstand gezet.')));
  function pasSlaapToe(w) { globalThis.__spoDebugSlaap = typeof w === 'boolean' ? w : undefined; try { Dier.tekenNu(); } catch (e) { /* geen huisdier */ } }
  // Evolutie: eerst net onder het stadium, dan eroverheen. huisdier.js speelt de animatie (hier en op Somtoday).
  async function evolutie(n) {
    const doel = Dier.STADIA[n].vanaf;
    await dierZet((h) => { h.xp = Math.max(0, doel - 1); h.gezien = n - 1; });
    await wacht(900);
    await dierZet((h) => { h.xp = doel; h.gezien = n - 1; });
  }
  for (let n = 1; n < Dier.STADIA.length; n++) knop($('h-evo'), `→ ${Dier.STADIA[n].naam}`, doe(() => evolutie(n), `Evolutie naar ${Dier.STADIA[n].naam} gestart.`));

  // ───────── Meldingen ─────────
  const TOAST = {
    verzoek: { soort: 'verzoek', tekst: 'Je hebt een nieuw vriendverzoek.' },
    duel: { soort: 'duel', tekst: 'Debug-vriend daagt je uit voor een duel!' },
    gg3: { soort: 'gg', tekst: 'Debug-vriend zegt GG op je KOSMISCHE (1/150) kaart (Wiskunde)!' },
    gg4: { soort: 'gg', tekst: 'Debug-vriend zegt GG op je MYTHISCHE (1/1000) kaart (Wiskunde)!' },
    kijk3: { soort: 'kijk', van: 'debug', naam: 'Debug-vriend', rest: 60, kijk: { vak: 'Wiskunde', cijfer: 9.4, trede: 3, opening: 'pak', seizoen: 'geen' }, tekst: 'Debug-vriend opent nu iets KOSMISCHS (kans 1/150): kijk mee!' },
    kijk4: { soort: 'kijk', van: 'debug', naam: 'Debug-vriend', rest: 60, kijk: { vak: 'Wiskunde', cijfer: 9.4, trede: 4, opening: 'pak', seizoen: 'geen' }, tekst: 'Debug-vriend opent nu iets MYTHISCHS (kans 1/1000): kijk mee!' },
  };
  document.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', doe(async () => {
    const t = b.dataset.t;
    if (t === 'emoji') await stuur({ cmd: 'emoji', emoji: ['\u{1F525}', '\u{1F62E}', '\u{1F44F}', '\u{1F602}'], aantal: 16 });
    else if (t === 'uitval') await stuur({ cmd: 'uitval' });
    else await stuur({ cmd: 'toast', melding: TOAST[t] });
  }, 'Opdracht verstuurd naar het zichtbare Somtoday-tabblad.')));
  $('u-reset').addEventListener('click', doe(() => S.remove(['spo_uitval_gezien', 'spo_rooster_vorig']), 'Uitval-geschiedenis gewist.'));

  // ───────── Prestaties ─────────
  $('pr-alles').addEventListener('click', doe(async () => {
    const nu = (await get('spo_prestaties')) || {};
    const ids = Prest.BADGES.map((b) => b.id);
    for (const id of ids) if (!nu[id]) nu[id] = NU();
    await set({ spo_prestaties: nu, spo_prestaties_gezien: NU() });
    return ids.length;
  }, (n) => `${n} prestaties ontgrendeld.`));
  $('pr-reset').addEventListener('click', doe(() => S.remove(['spo_prestaties', 'spo_prestaties_gezien', 'spo_stats']), 'Prestaties gereset. Staan er kaarten in je galerij, dan komen sommige vanzelf terug.'));
  // Geheime prestaties (tier 5): Pure Aura en de zes andere. Alleen spo_prestaties verandert; de rest rekent de prestatiepagina zelf uit.
  const AURA = 'fout-in-de-werkelijkheid';
  const geheim = () => Prest.BADGES.filter((b) => b.tier === 5);
  async function geheimZet(ids, aan) {
    const nu = Object.assign({}, await get('spo_prestaties'));
    for (const id of ids) { if (aan) { if (!nu[id]) nu[id] = NU(); } else delete nu[id]; }
    await set({ spo_prestaties: nu });
    return ids.length;
  }
  $('pr-geheim').addEventListener('click', doe(() => geheimZet(geheim().map((b) => b.id), true), (n) => `${n} geheime prestaties ontgrendeld (inclusief Pure Aura).`));
  $('pr-aura').addEventListener('click', doe(() => geheimZet([AURA], true), 'Pure Aura ontgrendeld.'));
  $('pr-geheim-weg').addEventListener('click', doe(() => geheimZet(geheim().map((b) => b.id), false), 'Geheime prestaties weer vergrendeld. Heb je er echt recht op (bijvoorbeeld een 5,5), dan komt hij vanzelf terug.'));
  async function geheimLijst() {
    const nu = (await get('spo_prestaties')) || {};
    const ul = $('pr-lijst'); ul.textContent = '';
    for (const b of geheim()) {
      const li = document.createElement('li');
      const s = document.createElement('span'); const ja = !!nu[b.id];
      s.className = ja ? 'ja' : 'nee'; s.textContent = ja ? 'ontgrendeld' : 'vergrendeld';
      li.append(s, document.createTextNode(' ' + b.naam));
      ul.append(li);
    }
  }

  // ───────── Rondleiding, update, duel ─────────
  $('r-start').addEventListener('click', doe(async () => {
    await S.remove('spo_rondleiding');
    try { if (parent !== window && parent.SPORondleiding) { parent.SPORondleiding.start(); return 'Rondleiding gestart.'; } } catch (e) { /* ander venster */ }
    window.open(chrome.runtime.getURL('hub.html'), '_blank');
    return 'Het hub-paneel is geopend; de rondleiding begint daar vanzelf.';
  }, (t) => t));

  let updateTimer = 0;
  async function updateOpheffen() {
    clearTimeout(updateTimer);
    const d = (await get('spo_debug')) || {};
    if (d.updateOrigineel) await set({ spo_update: d.updateOrigineel }); else await S.remove('spo_update');
    await zetDebug({ updateOrigineel: null, updateNep: false });
    try { await chrome.runtime.sendMessage({ type: 'spo-update-check' }); } catch (e) { /* achtergrond slaapt */ }
  }
  $('v-aan').addEventListener('click', doe(async () => {
    const d = (await get('spo_debug')) || {};
    const nu = await get('spo_update');
    if (!d.updateNep) await zetDebug({ updateOrigineel: nu || null, updateNep: true });
    // ts ver in de toekomst: update.js haalt dan niet opnieuw op en overschrijft de nepversie niet.
    await set({ spo_update: { ts: NU() + 3.15e10, versie: $('v-versie').value.trim() || '99.0.0', pagina: URL_RELEASES, zipChrome: '', zipFirefox: '', later: '', etag: '' } });
    clearTimeout(updateTimer);
    if ($('v-auto').checked) updateTimer = setTimeout(() => updateOpheffen().catch(() => {}), 120000);
  }, 'Verouderd nagebootst: Somtoday en het hub-paneel zijn nu geblokkeerd.'));
  $('v-uit').addEventListener('click', doe(updateOpheffen, 'Blokkade opgeheven.'));

  // ───────── Account-back-up ─────────
  async function accountStatus() {
    try {
      const s = await Acc.status();
      $('b-status').textContent = s.ingelogd ? `Ingelogd als ${s.email}. Laatste back-up: ${s.laatsteBackup ? new Date(s.laatsteBackup).toLocaleString('nl-NL') : 'nog nooit'}.` : 'Niet ingelogd: back-up en herstel werken niet.';
    } catch (e) { $('b-status').textContent = 'Status onbekend.'; }
  }
  $('b-nu').addEventListener('click', doe(async () => { const r = await Acc.bewaar(); await accountStatus(); if (r && r.ok === false) throw new Error('niet ingelogd'); }, 'Back-up verstuurd (let op: debugkaarten gaan mee).'));
  $('b-herstel').addEventListener('click', doe(async () => { const r = await Acc.herstel(); await accountStatus(); if (!r || !r.ok) throw new Error((r && r.fout) || 'niet ingelogd'); return r; }, (r) => `Hersteld: ${r.teruggezet} onderdeel/onderdelen bijgewerkt.`));

  // ───────── Opslag ─────────
  const kb = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(2) + ' MB');
  let alles = {};
  async function opslag() {
    alles = await S.get(null);
    const sleutels = Object.keys(alles).filter((k) => k.startsWith('spo_')).sort();
    const tb = $('o-tabel').tBodies[0]; tb.textContent = '';
    let tot = 0;
    for (const k of sleutels) {
      const n = (JSON.stringify(alles[k]) || '').length; tot += n;
      const tr = document.createElement('tr'); tr.tabIndex = 0;
      const a = document.createElement('td'); a.textContent = k;
      const b = document.createElement('td'); b.textContent = kb(n);
      tr.append(a, b);
      const toon = () => { const p = $('o-voorbeeld'); const t = JSON.stringify(alles[k], null, 1) || ''; p.textContent = k + '\n' + t.slice(0, 3000) + (t.length > 3000 ? '\n... (ingekort)' : ''); p.hidden = false; };
      tr.addEventListener('click', toon);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') toon(); });
      tb.append(tr);
    }
    const tr = document.createElement('tr'); const a = document.createElement('td'); a.textContent = `Totaal (${sleutels.length} sleutels)`; a.style.fontWeight = '700';
    const b = document.createElement('td'); b.textContent = kb(tot); tr.append(a, b); tb.append(tr);
    $('m-saldo').textContent = String(Eco.schoonMunten(alles.spo_munten).saldo);
    const h = Dier.schoon(alles.spo_huisdier);
    $('h-xp').textContent = String(h.xp); $('h-stadium').textContent = Dier.STADIA[Dier.stadiumVan(h.xp)].naam;
  }
  $('o-ververs').addEventListener('click', doe(opslag, 'Vernieuwd.'));
  $('o-export').addEventListener('click', doe(async () => {
    const all = await S.get(null);
    const uit = {};
    for (const k of Object.keys(all).sort()) if (k.startsWith('spo_') && k !== 'spo_account') uit[k] = all[k]; // zonder inlog-sleutels
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ versie: chrome.runtime.getManifest().version_name, ts: NU(), data: uit }, null, 1)], { type: 'application/json' }));
    a.download = `spo-opslag-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'Geëxporteerd (zonder spo_account).'));
  $('o-wis').addEventListener('click', () => { $('o-bevestig').hidden = false; $('o-ja').focus(); });
  $('o-nee').addEventListener('click', () => { $('o-bevestig').hidden = true; });
  $('o-ja').addEventListener('click', doe(async () => {
    const all = await S.get(null);
    const weg = Object.keys(all).filter((k) => k.startsWith('spo_') && k !== 'spo_debug' && (k !== 'spo_account' || $('o-account').checked));
    await S.remove(weg);
    $('o-bevestig').hidden = true;
    return weg.length;
  }, (n) => `${n} sleutels gewist.`));

  // ═════════════════════════ v3.0 ═════════════════════════
  const dagTekstNu = () => Eco.vandaag();
  const middernacht = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const naarSomtoday = () => $('waar-som').checked;
  async function wisIds(test) {
    const ids = Object.assign({}, await get('spo_munten_ids'));
    let n = 0;
    for (const k of Object.keys(ids)) if (test(k)) { delete ids[k]; n++; }
    await set({ spo_munten_ids: ids });
    return n;
  }
  const telIds = (ids, voor) => Object.keys(ids || {}).filter((k) => k.startsWith(voor)).length;

  // ───────── Tekstfilter-tester ─────────
  const TF_VOORBEELDEN = [
    ['Gewoon', 'Hoi, ik ben Sam!'], ['Telefoonnummer', 'Bel mij op 06 12345678'], ['E-mailadres', 'mail me: naam@voorbeeld.nl'], ['Link', 'https://voorbeeld.nl'],
    ['Gebruikersnaam', '@gebruikersnaam'], ['Scheldwoord', 'klootzak'], ['Zwaar bericht (hulp)', 'Ik wil niet meer leven'],
    ['Onzichtbaar teken', 'Hal​lo'], ['Gestapelde tekens', 'z̸a̷l̶g̵o͆͑͆͑ tekst'], ['Te lang', 'a'.repeat(320)],
  ];
  function tekstTest() {
    if (!Tekst) { $('tf-ok').textContent = 'tekstfilter.js niet geladen'; return; }
    const tekst = $('tf-in').value, soort = $('tf-soort').value, max = Math.max(1, parseInt($('tf-max').value, 10) || 300);
    const r = Tekst.controleer(tekst, { max, soort });
    const ok = $('tf-ok');
    ok.textContent = r.ok ? 'Toegestaan' : 'Geweigerd'; ok.className = r.ok ? 'ja' : 'nee';
    $('tf-reden').textContent = r.reden || '(geen)';
    $('tf-melding').textContent = r.melding || '(geen)';
    $('tf-schoon').textContent = r.schoon === undefined ? '(geen)' : JSON.stringify(r.schoon);
    $('tf-toon').textContent = JSON.stringify(soort === 'naam' ? Tekst.toonNaam(tekst, 'Vriend a1b2') : Tekst.toon(tekst));
    $('tf-veilig').textContent = JSON.stringify(Tekst.veilig(tekst));
  }
  for (const [naam, tekst] of TF_VOORBEELDEN) knop($('tf-voorbeelden'), naam, () => { $('tf-in').value = tekst; tekstTest(); }, 'klein');
  $('tf-in').addEventListener('input', tekstTest);
  $('tf-soort').addEventListener('change', tekstTest);
  $('tf-max').addEventListener('input', tekstTest);

  // ───────── Troostpakje ─────────
  const TROOST_REDEN = { 'al-gehad': 'Voor deze kaart was er al een troostpakje.', dagmax: 'Vandaag zijn er al 3 troostpakjes geweest. Reset de limiet.', voldoende: 'Dat is een voldoende: geen troostpakje.', ongeldig: 'Ongeldig cijfer.', fout: 'Er ging iets mis.' };
  async function troostGeef() {
    const c = Math.round(parseFloat($('t-cijfer').value.replace(',', '.')) * 10) / 10;
    if (!(c >= 1 && c < 5.5)) throw new Error('Een troostpakje is voor een cijfer onder de 5,5.');
    const id = nieuwId(0);
    if (naarSomtoday()) { await stuur({ cmd: 'troost', id, cijfer: c }); return 'Opdracht naar Somtoday gestuurd: kijk op het zichtbare Somtoday-tabblad.'; }
    const r = await globalThis.SPOTroost.na({ id, cijfer: c });
    if (!r || !r.ok) return (r && TROOST_REDEN[r.reden]) || 'Geen troostpakje.';
    const it = Eco.PER_ID.get(r.item);
    return `Troostpakje: ${it ? it.naam : r.item}${r.dubbel ? ` (dubbel, ${r.terug} munten terug)` : ''} en ${r.munten} munten. "${r.tekst}"`;
  }
  $('t-geef').addEventListener('click', doe(troostGeef, (t) => t));
  $('t-reset').addEventListener('click', doe(() => wisIds((k) => k.startsWith('td:' + dagTekstNu() + ':')), (n) => `Troost-limiet van vandaag gereset (${n} sleutel(s)). Per kaart kan er nog steeds maar één pakje.`));

  // ───────── Weekoverzicht ─────────
  const WEEK_VOORBEELD = { kaarten: 7, beste: { vak: 'Wiskunde', cijfer: 9.4 }, trede: 3, w: 2, v: 1, g: 1, xp: 84, stadium: 'Jong draakje' };
  async function weekToon(s) {
    if (naarSomtoday()) { await stuur({ cmd: 'week', s }); return 'Opdracht naar Somtoday gestuurd: kijk op het zichtbare Somtoday-tabblad.'; }
    globalThis.SPOWeek.toon(s);
    return 'Weekoverzicht getoond (rechtsboven in dit menu).';
  }
  $('w-voorbeeld').addEventListener('click', doe(() => weekToon(WEEK_VOORBEELD), (t) => t));
  $('w-echt').addEventListener('click', doe(async () => {
    const r = await S.get(['spo_galerij', 'spo_gevechten', 'spo_huisdier']);
    const s = globalThis.SPOWeek.samenvatting(r.spo_galerij, r.spo_gevechten, r.spo_huisdier, { van: NU() - 7 * DAG, tot: NU() + DAG }, Dier);
    if (!s) return 'Geen kaarten of gevechten in de afgelopen 7 dagen: dan toont het echte overzicht ook niets. Geef eerst een paar debugkaarten.';
    return weekToon(s);
  }, (t) => t));
  $('w-oud').addEventListener('click', doe(() => set({ spo_weekoverzicht: globalThis.SPOWeek.dagTekst(new Date(NU() - 8 * DAG)) }), 'Gezet op 8 dagen geleden: bij het eerstvolgende laden van Somtoday (na 5 seconden) komt het overzicht, als je kaarten of gevechten in de laatste 7 dagen hebt.'));
  $('w-wis').addEventListener('click', doe(() => S.remove('spo_weekoverzicht'), 'Gewist: het overzicht komt de eerstvolgende maandag (of bij het eerstvolgende laden van Somtoday op een maandag).'));
  async function weekStatus() {
    const r = await S.get(['spo_weekoverzicht', 'spo_instellingen']);
    const W = globalThis.SPOWeek, laatste = typeof r.spo_weekoverzicht === 'string' ? r.spo_weekoverzicht : '';
    const aan = !(r.spo_instellingen && r.spo_instellingen.weekoverzicht === false);
    $('w-status').textContent = `Laatst getoond: ${laatste || 'nooit'}. Instelling: ${aan ? 'aan' : 'uit'}. Zou nu bij het openen van Somtoday verschijnen: ${W.moetTonen(new Date(), laatste, aan) ? 'ja' : 'nee'}.`;
  }

  // ───────── Tijdcapsule ─────────
  const caps = async () => globalThis.SPOCapsule.schoonLijst(await get('spo_capsules'));
  $('c-maak').addEventListener('click', doe(async () => {
    const g = await get('spo_galerij');
    const k = Array.isArray(g) ? g[0] : null;
    if (!k || typeof k.id !== 'string') throw new Error('Je galerij is leeg. Geef eerst een kaart.');
    const l = (await caps()).filter((c) => c.kaartId !== k.id);
    const nu = new Date();
    l.unshift({ kaartId: k.id, tekst: 'Hoi toekomst-ik! Dit is een debug-capsule. Ik hoop dat het een goed schooljaar was.', opent: middernacht(nu) - DAG, gemaakt: NU() - 31 * DAG });
    await set({ spo_capsules: l });
    return `${k.vak} ${k.cijfer}`;
  }, (t) => `Open capsule gemaakt bij je nieuwste kaart (${t}). Kijk in de Galerij bij die kaart.`));
  $('c-open').addEventListener('click', doe(async () => {
    const l = await caps(); const t0 = middernacht(new Date());
    for (const c of l) if (c.opent > t0) c.opent = t0;
    await set({ spo_capsules: l });
    return l.length;
  }, (n) => `${n} capsule(s) kunnen nu open (datum = vandaag).`));
  $('c-dicht').addEventListener('click', doe(async () => {
    const l = await caps(); const t0 = middernacht(new Date()) + 30 * DAG;
    for (const c of l) { c.opent = t0; delete c.geopend; delete c.gemeld; }
    await set({ spo_capsules: l });
    return l.length;
  }, (n) => `${n} capsule(s) zijn weer 30 dagen dicht.`));
  $('c-nieuw').addEventListener('click', doe(async () => {
    const l = await caps();
    for (const c of l) { delete c.geopend; delete c.gemeld; }
    await set({ spo_capsules: l });
    return l.length;
  }, (n) => `${n} capsule(s): weer ongeopend en nog niet gemeld. De melding komt bij het eerstvolgende laden van Somtoday (na 4 seconden).`));
  $('c-melding').addEventListener('click', doe(async () => {
    if (naarSomtoday()) { await stuur({ cmd: 'capsule-melding' }); return 'Opdracht naar Somtoday gestuurd.'; }
    globalThis.SPOCapsule.toonMelding(1);
    return 'Melding getoond (rechtsonder in dit menu; een klik opent de Galerij).';
  }, (t) => t));
  async function capsuleStatus() {
    const l = await caps(), nu = NU();
    $('c-status').textContent = `${l.length} capsule(s): ${l.filter((c) => globalThis.SPOCapsule.isOpen(c, nu)).length} kunnen open, ${l.filter((c) => c.geopend).length} geopend, ${l.filter((c) => !globalThis.SPOCapsule.isOpen(c, nu)).length} dicht.`;
  }

  // ───────── Vloek opheffen simuleren ─────────
  async function heelKaarten(vloek, goed) {
    const f = leesForm();
    if (!f) return null;
    const lijst = [];
    const basis = { vak: f.vak, weging: f.weging, onderwerp: f.onderwerp, opening: f.opening, trede: 0 };
    if (vloek) lijst.push(maakEntry(Object.assign({}, basis, { cijfer: 4.2, vloek: true }), 0, NU() - 120000));
    if (goed) lijst.push(maakEntry(Object.assign({}, basis, { cijfer: 8.4, vloek: false }), 1, NU()));
    await bewaarKaarten(lijst, $('k-munten').checked);
    return lijst;
  }
  async function heelDoe(vloek, goed) {
    const lijst = await heelKaarten(vloek, goed);
    if (!lijst) return;
    if (!goed) return `Vervloekte kaart gegeven (${lijst[0].vak} 4,2). Open nu zelf (of met de knop) een voldoende in dit vak.`;
    const nieuw = lijst[lijst.length - 1];
    const r = await globalThis.SPOHeel.na({ id: nieuw.id, ts: nieuw.ts, vak: nieuw.vak, cijfer: nieuw.cijfer });
    if (!r || !r.ok) return 'Geen vloek opgeheven: staat er een vervloekte kaart (ouder dan de nieuwe) in dit vak?';
    if (naarSomtoday()) await stuur({ cmd: 'heel', uit: r }); else globalThis.SPOHeel.toon(r);
    return `Vloek opgeheven: ${r.vak} ${String(r.cijfer).replace('.', ',')} is weer heel. Kijk in de Galerij (HEEL-label) en in Team.`;
  }
  $('hl-alles').addEventListener('click', doe(() => heelDoe(true, true), (t) => t));
  $('hl-vloek').addEventListener('click', doe(() => heelDoe(true, false), (t) => t));
  $('hl-goed').addEventListener('click', doe(async () => {
    // een voldoende kaart zonder nieuwe vloek: heft de oudste vervloekte kaart in dit vak op
    const lijst = await heelKaarten(false, true);
    if (!lijst) return;
    const e = lijst[0];
    const r = await globalThis.SPOHeel.na({ id: e.id, ts: e.ts, vak: e.vak, cijfer: e.cijfer });
    if (!r || !r.ok) return 'Voldoende kaart gegeven. Er was geen vervloekte kaart in dit vak om op te heffen.';
    if (naarSomtoday()) await stuur({ cmd: 'heel', uit: r }); else globalThis.SPOHeel.toon(r);
    return `Vloek opgeheven: ${r.vak} ${String(r.cijfer).replace('.', ',')} is weer heel.`;
  }, (t) => t));
  $('k-vak').addEventListener('input', () => { $('hl-vak').textContent = $('k-vak').value.trim() || 'Vak'; });

  // ───────── Wekelijkse Drop ─────────
  async function dropToon() {
    const d = (await get('spo_debug')) || {};
    const n = Number.isInteger(d.dropTeller) ? d.dropTeller : null;
    $('dr-nu').textContent = n === null ? 'niet gezet (het Overzicht vraagt de echte server)' : String(n);
    $('dr-tekst').textContent = n === null || !Vr ? '' : Vr.dropTekst(n) + '.';
  }
  const dropZet = async (n) => { await zetDebug({ dropTeller: Math.max(0, Math.floor(n)) }); return n; };
  const dropNu = async () => { const d = (await get('spo_debug')) || {}; return Number.isInteger(d.dropTeller) ? d.dropTeller : 0; };
  $('dr-zet').addEventListener('click', doe(() => dropZet(Number($('dr-getal').value) || 0), (n) => `Lokale teller is ${Math.max(0, Math.floor(n))}.`));
  $('dr-plus').addEventListener('click', doe(async () => dropZet((await dropNu()) + 1), (n) => `Lokale teller is ${n}.`));
  $('dr-tien').addEventListener('click', doe(async () => dropZet((await dropNu()) + 10), (n) => `Lokale teller is ${n}.`));
  $('dr-wis').addEventListener('click', doe(() => zetDebug({ dropTeller: null }), 'De echte teller (server) wordt weer gebruikt.'));

  // ───────── Arcade en kaartspel ─────────
  async function spelStatus() {
    const [a, k] = await Promise.all([Eco.arcadeStatus(), Eco.kaartspelStatus()]);
    $('sp-status').textContent = `Arcade: ${a.gespeeld} van ${a.max} gespeeld vandaag (nog ${a.over}), inzet ${a.inzet}. Kaartspel: ${k.gespeeld} van ${k.max} potjes met munten vandaag (nog ${k.over}). Saldo: ${a.saldo}.`;
    const ids = (await get('spo_munten_ids')) || {};
    $('t-status').textContent = `Troostpakjes vandaag: ${telIds(ids, 'td:' + dagTekstNu() + ':')} van ${Eco.TROOST_PER_DAG}.`;
  }
  $('sp-munten').addEventListener('click', doe(() => muntenWijzig((x) => x + aantalSp(), 'Debug: munten voor arcade en kaartspel', true), (s) => `Saldo is nu ${s}.`));
  const aantalSp = () => Math.max(0, Math.floor(Number($('sp-getal').value) || 0));
  $('sp-arcade').addEventListener('click', doe(() => wisIds((k) => k.startsWith('ar:' + dagTekstNu() + ':') || k.startsWith('arw:' + dagTekstNu() + ':')), (n) => `Arcade-limiet van vandaag gereset (${n} sleutel(s)).`));
  $('sp-kaartspel').addEventListener('click', doe(() => wisIds((k) => k.startsWith('ks:' + dagTekstNu() + ':')), (n) => `Kaartspel-limiet van vandaag gereset (${n} sleutel(s)).`));
  $('sp-alles').addEventListener('click', doe(() => wisIds((k) => ['ar:', 'arw:', 'ks:', 'td:'].some((v) => k.startsWith(v + dagTekstNu() + ':'))), (n) => `Alle dag-limieten van vandaag gereset (${n} sleutel(s)): arcade, kaartspel en troostpakje.`));

  // ───────── Avatar en stadion ─────────
  const VB = globalThis.SPOVoetbal;
  const vbIds = () => (VB ? VB.ITEMS.map((i) => i.id) : []);
  $('vb-alles').addEventListener('click', doe(async () => {
    if (!VB) throw new Error('voetbal.js niet geladen');
    const w = Eco.schoonWinkel(await get('spo_winkel'));
    for (const id of vbIds()) if (!w.gekocht.includes(id)) w.gekocht.push(id);
    await set({ spo_winkel: Eco.schoonWinkel(w) });
    return vbIds().length;
  }, (n) => `${n} voetballer- en stadionitems ontgrendeld (haar, kitten, juichstijlen, stadionthema's en velden). Kies ze bij Speler.`));
  $('vb-weg').addEventListener('click', doe(async () => {
    const w = Eco.schoonWinkel(await get('spo_winkel'));
    const weg = new Set(vbIds());
    w.gekocht = w.gekocht.filter((id) => !weg.has(id));
    await set({ spo_winkel: Eco.schoonWinkel(w) });
    // economie.js zet gekochte items terug uit de geschiedenis: de koop-regels van deze items halen we dus ook weg
    const log = (await get('spo_munten_log')) || [];
    await set({ spo_munten_log: log.filter((e) => !(e && (String(e.id).startsWith('k:') || String(e.id).startsWith('pak:')) && weg.has(String(e.id).replace(/^(k:|pak:[a-z]+:)/, '')))) });
  }, 'Voetballer- en stadionitems weer vergrendeld.'));
  async function voetbalStatus() {
    if (!VB) { $('vb-status').textContent = 'voetbal.js niet geladen.'; return; }
    const w = Eco.schoonWinkel(await get('spo_winkel'));
    $('vb-status').textContent = `${vbIds().filter((id) => w.gekocht.includes(id)).length} van ${vbIds().length} voetballer- en stadionitems ontgrendeld.`;
  }

  // ───────── Aartsrivaal en uitnodig-link ─────────
  const RIVAAL_ID = '0123456789abcdef0123456789abcdef';
  const rvStand = () => $('rv-stand').value;
  async function rivaalTeken() {
    const R = globalThis.SPORivaal, stand = rvStand();
    const doel = $('rv-kaart');
    if (!R) return;
    const s = R.schoonStaat({ id: stand === 'binnen' || stand === 'geen' ? null : RIVAAL_ID, status: stand === 'binnen' || stand === 'geen' ? null : stand, sinds: NU() - 3 * DAG, laatst: NU(), verzoeken: stand === 'binnen' ? { [RIVAAL_ID]: NU() } : {} });
    const st = { vrienden: [{ id: RIVAAL_ID, status: 'vriend', alias: 'Debug-vriend' }] };
    let galerij = await get('spo_galerij'); galerij = (Array.isArray(galerij) ? galerij : []).filter((e) => e && Number.isFinite(e.cijfer));
    if (!galerij.length) galerij = [8.1, 6.4, 9.2, 5.8, 7.5, 9.9].map((c, i) => ({ id: 'x' + i, cijfer: c, weging: 1, tier: tierVan(c), trede: i === 2 ? 3 : 0 }));
    const gek = { kaarten: [7.8, 6.1, 8.9, 5.5, 9.4, 7.2, 8.0, 6.7].map((c, i) => ({ cijfer: c, weging: 1, tier: tierVan(c) })), profiel: null, top: [{ t: 3 }, { t: 4 }, { t: 1 }] };
    const gevechten = { [RIVAAL_ID]: [{ ts: NU() - 3600e3, mijn: 3, hun: 1 }, { ts: NU() - 20 * 3600e3, mijn: 4, hun: 0 }, { ts: NU() - 2 * DAG, mijn: 1, hun: 2 }, { ts: NU() - 9 * DAG, mijn: 2, hun: 2 }, { ts: NU() - 10 * DAG, mijn: 0, hun: 1 }] };
    const zet = (w) => { $('rv-stand').value = w; rivaalTeken(); };
    const tweestaps = (b, a, bv, fn) => b.addEventListener('click', () => { if (b.dataset.zeker) fn(); else { b.dataset.zeker = '1'; b.textContent = bv; } });
    const zichtbaar = R.teken(doel, { s, st, naamVan: () => 'Debug-vriend', galerij, gek: stand === 'actief' ? gek : undefined, gevechten, nu: NU(),
      acties: { accepteer: async () => zet('actief'), weiger: async () => zet('geen'), stop: async () => zet('geen') }, tweestaps });
    doel.hidden = !zichtbaar;
  }
  $('rv-stand').addEventListener('change', () => rivaalTeken().catch(() => {}));
  $('rv-munten').addEventListener('click', doe(() => Eco.bonusMunten('debug:r:' + NU(), 10, 'Debug: aartsrivaal verslagen'), (n) => (n ? `${n} rivaalmunten gegeven.` : 'Niet gegeven (grens bereikt).')));
  const willekeurTekst = (n, tekens) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, (x) => tekens[x % tekens.length]).join(''); };
  let proefLink = '', proefCode = '';
  $('un-server').value = (Vr && Vr.STANDAARD_SERVER) || '';
  $('un-maak').addEventListener('click', doe(() => {
    const U = globalThis.SPOUitnodiging;
    proefCode = 'SPO1-' + willekeurTekst(32, '0123456789abcdef') + '-' + willekeurTekst(90, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
    proefLink = U.maakLink($('un-server').value.trim(), proefCode);
    $('un-link').textContent = proefLink;
  }, 'Voorbeeldlink gemaakt (met een nep-code; hij werkt nergens).'));
  $('un-lees').addEventListener('click', doe(() => {
    if (!proefLink) throw new Error('Maak eerst een voorbeeldlink.');
    const U = globalThis.SPOUitnodiging;
    const a = U.leesInvoer(proefLink), b = U.leesInvoer(proefCode);
    $('un-uitslag').textContent = `Hele link plakken: code ${a.code === proefCode ? 'herkend' : 'NIET herkend'}, via uitnodiging: ${a.via ? 'ja' : 'nee'}. Alleen de code plakken: via uitnodiging: ${b.via ? 'ja' : 'nee'} (de ontvanger moet dan het vakje aanvinken).`;
  }));
  $('un-pakje').addEventListener('click', doe(async () => {
    const r = await Eco.gratisPakje('normaal', 'Uitnodiging (debug)', 'debug:u:' + NU());
    if (!r.ok) throw new Error(r.reden);
    const it = Eco.PER_ID.get(r.item);
    $('un-uitslag').textContent = `Beloning-pakje: ${it ? it.naam : r.item}${r.dubbel ? ` (dubbel, ${r.terug} munten terug)` : ''}.`;
  }));

  // ───────── Veiligheid: waarschuwing, ban-banner, melden, blokkeren ─────────
  const NEP_ST = { id: '0123456789abcdef0123456789abcdef', token: 'nep', server: 'nep', vrienden: [] };
  const VL = () => globalThis.SPOVeilig;
  function nepLog() {
    $('vl-log').textContent = Nep.verstuurd.length ? Nep.verstuurd.map((v) => `${new Date(v.ts).toLocaleTimeString('nl-NL')}  ${v.actie}  ${JSON.stringify(v.body)}`).join('\n') + '\n(NEP: niets hiervan is echt verstuurd)' : 'Nog niets (nep) verstuurd.';
  }
  Nep.luister = nepLog;
  const koppelUitkomst = (sel, soort) => $(sel).addEventListener('change', () => { Nep.uitkomst[soort] = $(sel).value; });
  koppelUitkomst('vl-meld', 'meld'); koppelUitkomst('vl-blok', 'blokkeer'); koppelUitkomst('fb-uitkomst', 'feedback');
  const mel = (t, f) => melding(t, f);
  async function waarschuwing(n) {
    Nep.waarschuwingen = [{ id: 101, reden: 'Debug: zo praat je niet tegen een ander.', ts: Math.floor(NU() / 1000) }];
    if (n > 1) Nep.waarschuwingen.push({ id: 102, reden: 'Debug: nog een voorbeeld van een waarschuwing.', ts: Math.floor(NU() / 1000) - 7200 });
    const v = await VL().waarschuwingVenster({ st: NEP_ST, melding: mel, na: () => melding('Waarschuwing gelezen (nep).') });
    if (!v) throw new Error('Het waarschuwingsvenster staat al open.');
  }
  $('vl-waarsch').addEventListener('click', doe(() => waarschuwing(1)));
  $('vl-waarsch2').addEventListener('click', doe(() => waarschuwing(2)));
  $('vl-melden').addEventListener('click', doe(() => { Nep.uitkomst.meld = $('vl-meld').value; VL().meldVenster({ st: NEP_ST, id: RIVAAL_ID, naam: 'deze persoon', vriend: true, melding: mel, na: () => {} }); }));
  $('vl-blokkeren').addEventListener('click', doe(() => { Nep.uitkomst.blokkeer = $('vl-blok').value; VL().blokkeerVenster({ st: NEP_ST, id: RIVAAL_ID, naam: 'deze persoon', melding: mel, na: () => {} }); }));
  function banToon(tot) {
    const reden = 'Debug-voorbeeld: dit is een test.';
    $('vl-ban-wanneer').textContent = tot > 0 ? 'Dit duurt ' + Vr.banWanneer(tot) + '. Daarna werkt alles vanzelf weer.' : 'Dit is permanent.';
    $('vl-ban-reden').hidden = false; $('vl-ban-reden').textContent = 'Reden: ' + reden;
    $('vl-banner').hidden = false;
    $('vl-ban-tekst').textContent = 'Tekst in de statusregel en de melding: ' + Vr.banTekst(tot, reden);
  }
  $('vl-ban-tijd').addEventListener('click', doe(() => banToon(Math.floor(NU() / 1000) + 3 * 86400)));
  $('vl-ban-perm').addEventListener('click', doe(() => banToon(0)));
  $('vl-ban-weg').addEventListener('click', doe(() => { $('vl-banner').hidden = true; $('vl-ban-tekst').textContent = ''; }));

  // ───────── Feedback-venster en Wat is nieuw ─────────
  function heeftGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
  async function feedbackInfo() {
    const F = globalThis.SPOFeedback;
    if (!F) return;
    const inst = ((await get('spo_instellingen')) || {});
    $('fb-info').textContent = F.maakInfo({ versie: chrome.runtime.getManifest().version, ua: navigator.userAgent, laag: !!inst.laag, webgl: heeftGL(), tab: 'debug' });
  }
  $('fb-open').addEventListener('click', doe(async () => {
    Nep.uitkomst.feedback = $('fb-uitkomst').value;
    if (!globalThis.SPOFeedback) throw new Error('feedback.js niet geladen');
    await globalThis.SPOFeedback.open();
  }));
  $('nw-open').addEventListener('click', doe(() => {
    // in het hub-paneel liever het venster van het paneel zelf (zelfde extensie); anders dat van deze pagina
    let N = globalThis.SPONieuw;
    try { if (ingebed && parent !== window && parent.SPONieuw) N = parent.SPONieuw; } catch (e) { /* ander venster */ }
    if (!N) throw new Error('nieuw.js niet geladen');
    N.open();
  }));
  $('nw-oud').addEventListener('click', doe(() => set({ spo_nieuw_gezien: '2.4.3' }), "'Gezien' staat nu op 2.4.3. Open het hub-paneel opnieuw: het bolletje bij 'Wat is nieuw' en het venster komen vanzelf (alleen als het manifest nieuwer is dan 2.4.3 en er tekst is)."));
  $('nw-wis').addEventListener('click', doe(() => S.remove('spo_nieuw_gezien'), "'Gezien' gewist: bij de eerstvolgende keer onthoudt het paneel de huidige versie en toont het niets (zoals bij een verse installatie)."));
  async function nieuwStatus() { $('nw-status').textContent = `Nu opgeslagen als 'gezien': ${(await get('spo_nieuw_gezien')) || 'niets'}. Versie van deze build: ${chrome.runtime.getManifest().version}.`; }

  // ───────── Strafschop-testlinks ─────────
  const SF_UITKOMSTEN = [['goal', 'Goal'], ['redding', 'Redding'], ['paal', 'Paal'], ['over', 'Over']];
  const SF_VARIANTEN = [['Gewoon', {}], ['laag=true', { laag: 'true' }], ['mesh=1', { mesh: '1' }], ['volledig=1', { volledig: '1' }], ['forceerfout=1', { forceerfout: '1' }], ['forceerfout=2', { forceerfout: '2' }], ['forceerfout=3', { forceerfout: '3' }]];
  function strafLink(uitkomst, extra) {
    const q = new URLSearchParams(Object.assign({ strafschop: '1', uitkomst, richting: $('sf-richting').value, hoogte: $('sf-hoogte').value, kracht: '0.8', debug: '1' }, extra));
    return chrome.runtime.getURL('stage.html') + '?' + q.toString();
  }
  function strafTeken() {
    const tb = document.createElement('table'); tb.className = 'tab sf-tabel';
    const kop = tb.createTHead().insertRow(); kop.append(document.createElement('th'));
    for (const [v] of SF_VARIANTEN) { const th = document.createElement('th'); th.textContent = v; kop.append(th); }
    const body = tb.createTBody();
    for (const [u, naam] of SF_UITKOMSTEN) {
      const r = body.insertRow(); const th = document.createElement('th'); th.textContent = naam; r.append(th);
      for (const [v, extra] of SF_VARIANTEN) {
        const td = r.insertCell(); const a = document.createElement('a');
        a.href = strafLink(u, extra); a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'open';
        a.setAttribute('aria-label', `${naam}, ${v}`); td.append(a);
      }
    }
    $('sf-tabel').replaceChildren(tb);
  }
  $('sf-richting').addEventListener('change', strafTeken); $('sf-hoogte').addEventListener('change', strafTeken);
  $('sf-wis').addEventListener('click', doe(() => { for (const k of ['spo_strafschop_poging', 'spo_strafschop_licht', 'spo_strafschop_licht_ts']) localStorage.removeItem(k); }, 'Strafschop-geheugen gewist: de volgende keer begint hij weer met de volle variant.'));
  strafTeken();

  // ───────── Alle debugdata van v3.0 opruimen ─────────
  const isDbg = (x) => String(x == null ? '' : x).includes('debug:');
  $('rm-alles').addEventListener('click', doe(async () => {
    const kaarten = await wisDebugKaarten();
    const l = await caps();
    await set({ spo_capsules: l.filter((c) => !isDbg(c.kaartId)) });
    const heel = Object.assign({}, await get('spo_heel'));
    for (const k of Object.keys(heel)) if (isDbg(k) || isDbg(heel[k] && heel[k].door)) delete heel[k];
    await set({ spo_heel: heel });
    const ids = await wisIds(isDbg);
    const log = (await get('spo_munten_log')) || [];
    await set({ spo_munten_log: log.filter((e) => !(e && isDbg(e.id))) });
    await zetDebug({ dropTeller: null });
    return `${kaarten} kaart(en), ${l.length - (await caps()).length} capsule(s), ${ids} sleutel(s)`;
  }, (t) => `Opgeruimd: ${t}.`));

  async function v3Status() {
    await Promise.all([geheimLijst(), weekStatus(), capsuleStatus(), spelStatus(), voetbalStatus(), dropToon(), nieuwStatus(), feedbackInfo()]);
  }

  // ───────── Start ─────────
  $('versie').textContent = chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version;
  if (ingebed) $('los').addEventListener('click', () => window.open(chrome.runtime.getURL('debug.html'), '_blank')); else $('los').hidden = true;
  $('niet-delen').addEventListener('change', doe(() => zetDebug({ deelDebug: !$('niet-delen').checked }), () => ($('niet-delen').checked ? 'Debugkaarten worden niet met vrienden gedeeld.' : 'Let op: debugkaarten kunnen nu naar vrienden gaan.')));
  (async () => {
    const d = (await get('spo_debug')) || {};
    $('niet-delen').checked = d.deelDebug !== true;
    if (d.deelDebug === undefined) await zetDebug({ deelDebug: false });
    pasSlaapToe(d.slaap);
    await opslag(); await accountStatus();
    tekstTest(); rivaalTeken().catch(() => {}); nepLog(); await v3Status();
    $('hl-vak').textContent = $('k-vak').value.trim() || 'Vak';
  })();
  chrome.storage.onChanged.addListener((w, gebied) => {
    if (gebied !== 'local') return;
    if (w.spo_debug) pasSlaapToe((w.spo_debug.newValue || {}).slaap);
    if (w.spo_munten || w.spo_huisdier || w.spo_galerij || w.spo_winkel || w.spo_update || w.spo_prestaties) opslag().catch(() => {});
    if (w.spo_munten_ids || w.spo_capsules || w.spo_weekoverzicht || w.spo_instellingen || w.spo_debug || w.spo_winkel || w.spo_prestaties || w.spo_nieuw_gezien) v3Status().catch(() => {});
  });
})();
