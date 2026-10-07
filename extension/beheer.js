// Beheerpagina voor de eigenaar van de vriendenserver. Zit alleen in de OWNER-build (scripts/package-owner.sh).
// De beheersleutel staat nergens in de code: hij wordt één keer gevraagd en bewaard in chrome.storage.local (spo_beheer).
// De server laat alleen id's, tijden en aantallen zien. Bijnamen komen uit je eigen vriendenlijst op dit apparaat.
(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const OPSLAG = 'spo_beheer';
  const $ = (id) => document.getElementById(id);
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst !== undefined) e.textContent = tekst; return e; };

  let cfg = null;        // { server, sleutel }
  let gebruikers = [];
  let stats = null;
  let namen = new Map(); // id -> bijnaam uit je eigen vriendenlijst
  let mijnId = null;
  let nuServer = 0;
  let open = null;       // id van de rij met het banformulier open
  let bezig = false;

  function melding(tekst, fout) {
    const p = el('p', fout ? 'fout' : '', tekst);
    $('melding').append(p);
    setTimeout(() => p.remove(), fout ? 9000 : 4000);
  }

  // ---- server ----
  async function beheer(a, body) {
    let r;
    try { r = await fetch(cfg.server, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Beheer': cfg.sleutel }, body: JSON.stringify(Object.assign({ a }, body || {})) }); }
    catch (e) { const f = new Error('Geen verbinding met de server.'); f.status = 0; throw f; }
    let j = {};
    try { j = await r.json(); } catch (e) { /* leeg */ }
    if (!r.ok) {
      const f = new Error(r.status === 404 && /^beheer/.test(a) && !body ? 'Beheer staat uit op de server (geen beheer_sleutel in config.php).' : j.fout || 'Serverfout ' + r.status);
      f.status = r.status; throw f;
    }
    return j;
  }

  // ---- opmaak ----
  const nl = (n) => n.toLocaleString('nl-NL');
  function grootte(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1).replace('.', ',') + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  function datum(s) { return new Date(s * 1000).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function geleden(s) {
    const d = Math.max(0, nuServer - s);
    if (d < 90) return 'zojuist';
    if (d < 3600) return Math.round(d / 60) + ' min geleden';
    if (d < 86400) return Math.round(d / 3600) + ' uur geleden';
    return Math.round(d / 86400) + ' dagen geleden';
  }
  const bytes = (u) => u.blobBytes + u.berichtBytes;

  // ---- tekenen ----
  function tekenStats() {
    const s = $('stats'); s.textContent = '';
    if (!stats) return;
    const items = [
      ['Gebruikers', nl(stats.gebruikers)], ['Actief 24 uur', nl(stats.actief24u)], ['Actief 7 dagen', nl(stats.actief7d)], ['Nieuw 24 uur', nl(stats.nieuw24u)],
      ['Vriendschappen', nl(stats.vriendschappen)], ['Open verzoeken', nl(stats.verzoeken)], ['Kaartblobs', nl(stats.blobs)], ['Data', grootte(stats.blobBytes)], ['Verbannen', nl(stats.verbannen)],
    ];
    for (const [l, w] of items) { const d = el('div', 'stat'); d.append(el('b', '', w), el('span', '', l)); s.append(d); }
  }

  function zichtbaar() {
    const z = $('zoek').value.trim().toLowerCase();
    const f = $('filter').value;
    let l = gebruikers.filter((u) => {
      if (z && !(u.id.includes(z) || (namen.get(u.id) || '').toLowerCase().includes(z))) return false;
      if (f === 'verbannen') return !!u.ban;
      if (f === 'actief') return nuServer - u.laatstActief < 86400;
      if (f === 'stil') return nuServer - u.laatstActief > 30 * 86400;
      if (f === 'bekend') return namen.has(u.id) || u.id === mijnId;
      if (f === 'onbekend') return !namen.has(u.id) && u.id !== mijnId;
      return true;
    });
    const s = $('sorteer').value;
    const sleutel = { actief: (u) => -u.laatstActief, nieuw: (u) => -u.aangemaakt, grootte: (u) => -bytes(u), vrienden: (u) => -u.vrienden }[s];
    l = l.map((u) => [sleutel(u), u]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    return l;
  }

  function tweestaps(knop, tekst, bevestig, actie) {
    let t = 0;
    const reset = () => { knop.textContent = tekst; knop.classList.remove('zeker'); t = 0; };
    knop.addEventListener('click', () => {
      if (!t) { knop.textContent = bevestig; knop.classList.add('zeker'); t = setTimeout(reset, 4000); return; }
      clearTimeout(t); reset(); actie();
    });
  }

  function banForm(u) {
    const f = el('form', 'banform');
    f.autocomplete = 'off';
    const duur = el('label', 'veld'); duur.append(el('span', '', 'Duur'));
    const sel = el('select');
    for (const [w, t] of [['3600', '1 uur'], ['86400', '1 dag'], ['604800', '7 dagen'], ['2592000', '30 dagen'], ['0', 'Voorgoed'], ['eigen', 'Eigen datum']]) { const o = el('option', '', t); o.value = w; sel.append(o); }
    sel.value = '86400'; duur.append(sel);
    const eigen = el('label', 'veld'); eigen.append(el('span', '', 'Tot'));
    const dt = el('input'); dt.type = 'datetime-local'; dt.disabled = true; eigen.append(dt);
    const reden = el('label', 'veld'); reden.append(el('span', '', 'Reden (zien zij zelf, max 200 tekens)'));
    const ri = el('input'); ri.type = 'text'; ri.maxLength = 200; ri.placeholder = 'bijv. misbruik'; reden.append(ri);
    sel.addEventListener('change', () => { dt.disabled = sel.value !== 'eigen'; if (!dt.disabled) dt.focus(); });
    const knoppen = el('div', 'rij-knoppen');
    const ok = el('button', 'knop klein goud', 'Verban'); ok.type = 'submit';
    const nee = el('button', 'knop klein', 'Annuleren'); nee.type = 'button';
    nee.addEventListener('click', () => { open = null; teken(); });
    knoppen.append(ok, nee);
    f.append(duur, eigen, reden, knoppen);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      let tot;
      if (sel.value === 'eigen') {
        tot = Math.floor(new Date(dt.value).getTime() / 1000);
        if (!dt.value || !(tot > nuServer)) { melding('Kies een einddatum in de toekomst.', true); return; }
      } else tot = sel.value === '0' ? 0 : Math.floor(Date.now() / 1000) + Number(sel.value);
      await doe(() => beheer('beheerBan', { id: u.id, tot, reden: ri.value.trim().slice(0, 200) }), 'Gebruiker verbannen.');
    });
    return f;
  }

  function teken() {
    const l = zichtbaar();
    const tb = $('rijen'); tb.textContent = '';
    $('leeg').hidden = l.length > 0;
    $('tabel').hidden = l.length === 0;
    $('status').textContent = `${nl(l.length)} van ${nl(gebruikers.length)} gebruikers.`;
    for (const u of l) {
      const tr = el('tr', u.ban ? 'verbannen' : '');
      const naam = namen.get(u.id);
      const wie = el('td', 'wie');
      wie.append(el('strong', u.id === mijnId ? 'ik' : '', u.id === mijnId ? (naam ? naam + ' (jij)' : 'Jij') : naam || 'Onbekend'), el('small', '', u.id));
      const act = el('td', 'nu', geleden(u.laatstActief)); act.title = datum(u.laatstActief);
      const aan = el('td', 'nu', datum(u.aangemaakt));
      const st = el('td');
      if (u.ban) {
        st.append(el('span', 'badge weg', u.ban.tot ? 'Verbannen tot ' + datum(u.ban.tot) : 'Voorgoed verbannen'));
        if (u.ban.reden) st.append(el('span', 'ban-info', u.ban.reden));
      } else st.append(el('span', 'badge', 'Actief'));
      const ac = el('td');
      const rij = el('div', 'acties');
      const ban = el('button', 'knop klein', u.ban ? 'Ban wijzigen' : 'Ban'); ban.type = 'button';
      ban.addEventListener('click', () => { open = open === u.id ? null : u.id; teken(); });
      rij.append(ban);
      if (u.ban) {
        const op = el('button', 'knop klein', 'Opheffen'); op.type = 'button';
        op.addEventListener('click', () => doe(() => beheer('beheerOnban', { id: u.id }), 'Ban opgeheven.'));
        rij.append(op);
      }
      const wk = el('button', 'knop klein gevaar', 'Kaarten wissen'); wk.type = 'button';
      tweestaps(wk, 'Kaarten wissen', 'Zeker weten?', () => doe(() => beheer('beheerWisKaarten', { id: u.id }), 'Kaarten gewist.'));
      const wa = el('button', 'knop klein gevaar', 'Account wissen'); wa.type = 'button';
      tweestaps(wa, 'Account wissen', 'Zeker? Alles weg', () => doe(() => beheer('beheerWisAccount', { id: u.id }), 'Account gewist.'));
      rij.append(wk, wa);
      ac.append(rij);
      tr.append(wie, act, aan, el('td', 'num', nl(u.vrienden)), el('td', 'num', nl(u.blobs)), el('td', 'num', nl(u.berichten)), el('td', 'num nu', grootte(bytes(u))), st, ac);
      tb.append(tr);
      if (open === u.id) { const br = el('tr', 'banrij'); const td = el('td'); td.colSpan = 9; td.append(banForm(u)); br.append(td); tb.append(br); }
    }
  }

  async function doe(fn, ok) {
    if (bezig) return;
    bezig = true;
    try { await fn(); open = null; if (ok) melding(ok); await laadAlles(); }
    catch (e) { fouten(e); }
    finally { bezig = false; }
  }
  function fouten(e) {
    if (e.status === 403) { melding('De beheersleutel klopt niet. Vul hem opnieuw in.', true); toonInloggen(); }
    else melding(e.message || 'Er ging iets mis.', true);
  }

  async function laadAlles() {
    $('status').textContent = 'Laden...';
    const [lijst, s] = await Promise.all([beheer('beheerLijst'), beheer('beheerStats')]);
    gebruikers = lijst.gebruikers || []; nuServer = lijst.nu || Math.floor(Date.now() / 1000); stats = s;
    tekenStats(); teken();
  }

  async function leesNamen() {
    namen = new Map(); mijnId = null;
    try {
      const st = await L.laad();
      if (st) { mijnId = st.id; for (const v of st.vrienden || []) if (v.alias) namen.set(v.id, v.alias); }
    } catch (e) { /* geen vriendenopslag: dan blijven het id's */ }
  }

  // ---- inloggen ----
  function toonInloggen() {
    $('app').hidden = true; $('inloggen').hidden = false;
    $('sleutel').value = '';
    $('server').value = (cfg && cfg.server) || $('server').value || L.STANDAARD_SERVER;
    $('sleutel').focus();
  }
  async function toonApp() {
    $('inloggen').hidden = true; $('app').hidden = false;
    await leesNamen();
    try { await laadAlles(); } catch (e) { fouten(e); $('status').textContent = ''; }
  }

  $('sleutel-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const sleutel = $('sleutel').value.trim(), server = $('server').value.trim();
    if (!sleutel || !/^https?:\/\//.test(server)) return;
    cfg = { server, sleutel };
    try { await beheer('beheerStats'); }
    catch (e) { cfg = null; melding(e.status === 403 ? 'De beheersleutel klopt niet.' : e.message, true); return; }
    await L.schrijf(OPSLAG, cfg);
    await toonApp();
  });
  $('vergeet').addEventListener('click', async () => { await L.wis(OPSLAG); cfg = null; gebruikers = []; toonInloggen(); melding('Sleutel verwijderd uit deze browser.'); });
  $('ververs').addEventListener('click', () => doe(async () => { await leesNamen(); }, ''));
  for (const id of ['zoek', 'filter', 'sorteer']) $(id).addEventListener('input', () => teken());

  async function init() {
    const p = new URLSearchParams(location.search).get('server');
    const bewaard = await L.lees(OPSLAG);
    if (bewaard && typeof bewaard.sleutel === 'string' && typeof bewaard.server === 'string') { cfg = bewaard; if (p) cfg = { server: p, sleutel: bewaard.sleutel }; await toonApp(); return; }
    let server = p;
    if (!server) { try { const st = await L.laad(); server = st && st.server; } catch (e) { /* standaard */ } }
    $('server').value = server || L.STANDAARD_SERVER;
    toonInloggen();
  }
  init().catch((e) => melding(e.message || 'Er ging iets mis.', true));
})();
