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

  async function geefKaart() {
    const f = leesForm();
    if (!f) return;
    const id = 'debug:' + NU().toString(36) + Math.random().toString(36).slice(2, 6);
    const e = { id, ts: NU(), vak: f.vak, cijfer: f.cijfer, onderwerp: f.onderwerp, weging: f.weging, opening: f.opening, tier: tierVan(f.cijfer), zeldzaam: f.trede >= 1, trede: f.trede };
    if (f.vloek) e.vloek = true;
    if ($('k-galerij').checked) {
      let g = await get('spo_galerij');
      g = Array.isArray(g) ? g : [];
      g.unshift(e);
      // Maximaal 150 kaarten: eerst gaan de oudste debugkaarten eraf, nooit een echte kaart.
      while (g.length > 150) {
        let i = g.length - 1;
        while (i > 0 && !(g[i] && String(g[i].id).startsWith('debug:'))) i--;
        if (i <= 0) throw new Error('de galerij zit vol met echte kaarten (150)');
        g.splice(i, 1);
      }
      await set({ spo_galerij: g });
      if (!$('k-munten').checked) { const ids = (await get('spo_munten_ids')) || {}; ids['c:' + id] = 1; await set({ spo_munten_ids: ids }); }
    }
    if ($('k-speel').checked) await speel({ opening: f.opening });
    melding(`Kaart gegeven: ${f.vak} ${f.cijfer} (${TREDE_NAAM[f.trede]}${f.vloek ? ', vloek' : ''}), id ${id}.`);
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
  })();
  chrome.storage.onChanged.addListener((w, gebied) => {
    if (gebied !== 'local') return;
    if (w.spo_debug) pasSlaapToe((w.spo_debug.newValue || {}).slaap);
    if (w.spo_munten || w.spo_huisdier || w.spo_galerij || w.spo_winkel || w.spo_update || w.spo_prestaties) opslag().catch(() => {});
  });
})();
