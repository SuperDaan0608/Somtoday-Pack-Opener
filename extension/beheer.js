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
  let meldingen = [];    // meldingen van gebruikers (nieuw eerst)
  let meldFout = '';     // tekst als de server nog geen meldingen kent
  const bewijsOpen = new Map(); // meldingsid -> bewijs (alleen na klikken opgehaald)
  let meldForm = null;   // { id, soort } van de melding met een open formulier

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
      ['Vriendschappen', nl(stats.vriendschappen)], ['Open verzoeken', nl(stats.verzoeken)], ['Kaartblobs', nl(stats.blobs)], ['Data', grootte(stats.blobBytes)], ['Verbannen', nl(stats.verbannen)], ['Nieuwe meldingen', nl(stats.nieuweMeldingen || 0)],
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

  // ---- tabbladen ----
  function kiesTab(naam, focus) {
    for (const t of ['gebruikers', 'meldingen']) {
      const knop = $('tab-' + t), actief = t === naam;
      knop.setAttribute('aria-selected', actief ? 'true' : 'false');
      knop.tabIndex = actief ? 0 : -1;
      $('paneel-' + t).hidden = !actief;
      if (actief && focus) knop.focus();
    }
  }
  for (const t of ['gebruikers', 'meldingen']) {
    $('tab-' + t).addEventListener('click', () => kiesTab(t));
    $('tab-' + t).addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); kiesTab(t === 'gebruikers' ? 'meldingen' : 'gebruikers', true); }
    });
  }

  // ---- meldingen ----
  const REDEN = { naam: 'Naam', tekst: 'Tekst', pesten: 'Pesten', spam: 'Spam', anders: 'Anders' };
  const DUREN = [['3600', '1 uur'], ['86400', '1 dag'], ['604800', '7 dagen'], ['2592000', '30 dagen']];

  // Bevestigingsvenster (voor elke ban). Geeft een belofte met true bij "ja".
  function bevestig(regels, jaTekst) {
    const d = $('bevestig'), lijst = $('bev-regels');
    lijst.textContent = '';
    for (const r of regels) lijst.append(el('li', '', r));
    $('bev-ja').textContent = jaTekst;
    return new Promise((klaar) => {
      d.returnValue = 'nee';
      d.addEventListener('close', () => klaar(d.returnValue === 'ja'), { once: true });
      if (typeof d.showModal === 'function') d.showModal(); else { klaar(window.confirm(regels.join('\n'))); return; }
      $('bev-nee').focus();
    });
  }

  function meldKaart(m) {
    const li = el('li', 'meld' + (m.status === 'klaar' ? ' klaar' : ''));
    li.dataset.id = String(m.id);
    const kop = el('div', 'meld-kop');
    kop.append(el('span', 'badge reden', REDEN[m.reden] || m.reden), el('strong', '', 'Melding ' + m.id));
    const tijd = el('span', 'nu', geleden(m.ts)); tijd.title = datum(m.ts);
    kop.append(tijd, el('span', 'badge' + (m.status === 'klaar' ? '' : ' nieuw'), m.status === 'klaar' ? 'Afgehandeld' : 'Nieuw'));
    li.append(kop);

    const dl = el('dl', 'meld-gegevens');
    const rij = (k, w, mono) => { dl.append(el('dt', '', k)); dl.append(el('dd', mono ? 'mono' : '', w)); };
    rij('Gemeld door', m.van, true);
    rij('Tegen', m.tegen + (namen.has(m.tegen) ? ' (' + namen.get(m.tegen) + ')' : ''), true);
    rij('Uitleg van de melder', m.uitleg || 'Geen uitleg meegestuurd.');
    rij('Meldingen tegen dit id', nl(m.aantalTegen));
    rij('Waarschuwingen eerder', nl(m.waarschuwingen));
    let ban = 'Geen ban';
    if (m.banStatus) {
      ban = (m.banStatus.tot ? 'Verbannen tot ' + datum(m.banStatus.tot) : 'Voorgoed verbannen') + (m.banStatus.ookEmail ? ', ook e-mailadres' : '') + (m.banStatus.ookIp ? ', ook IP' : '');
    }
    rij('Ban', ban);
    rij('Accounts op hetzelfde IP (30 dagen)', m.ipBekend ? nl(m.ipAccounts) : 'Geen IP bekend');
    li.append(dl);
    if (m.ipAccounts > 3) {
      const w = el('p', 'ip-waarschuwing', 'Dit IP is de laatste 30 dagen door ' + m.ipAccounts + ' accounts gebruikt: waarschijnlijk een school of gedeeld wifi');
      w.setAttribute('role', 'alert');
      li.append(w);
    }

    // Bewijs: standaard verborgen, apart opgehaald
    const bw = el('div', 'bewijs-blok');
    if (!m.heeftBewijs) bw.append(el('span', 'bewijs-geen', 'Geen bewijs meegestuurd.'));
    else {
      const kn = el('button', 'knop klein', bewijsOpen.has(m.id) ? 'Verberg bewijs' : 'Toon bewijs'); kn.type = 'button';
      kn.setAttribute('aria-expanded', bewijsOpen.has(m.id) ? 'true' : 'false');
      const uit = el('blockquote', 'bewijs'); uit.hidden = !bewijsOpen.has(m.id);
      if (bewijsOpen.has(m.id)) uit.textContent = bewijsOpen.get(m.id);
      kn.addEventListener('click', async () => {
        if (bewijsOpen.has(m.id)) { bewijsOpen.delete(m.id); kn.textContent = 'Toon bewijs'; kn.setAttribute('aria-expanded', 'false'); uit.hidden = true; uit.textContent = ''; return; }
        try {
          kn.disabled = true;
          const r = await beheer('beheerBewijs', { id: m.id });
          bewijsOpen.set(m.id, String(r.bewijs || ''));
          uit.textContent = bewijsOpen.get(m.id); uit.hidden = false; kn.textContent = 'Verberg bewijs'; kn.setAttribute('aria-expanded', 'true');
        } catch (e) { fouten(e); } finally { kn.disabled = false; }
      });
      bw.append(kn, uit);
    }
    li.append(bw);

    if (m.status === 'klaar') {
      if (m.uitkomst) li.append(el('p', 'uitkomst', 'Uitkomst: ' + m.uitkomst));
      return li;
    }

    // Acties
    const acties = el('div', 'acties meld-acties');
    const knop = (tekst, soort, gevaar) => {
      const k = el('button', 'knop klein' + (gevaar ? ' gevaar' : ''), tekst); k.type = 'button';
      if (soort) { k.setAttribute('aria-expanded', meldForm && meldForm.id === m.id && meldForm.soort === soort ? 'true' : 'false'); k.addEventListener('click', () => { meldForm = meldForm && meldForm.id === m.id && meldForm.soort === soort ? null : { id: m.id, soort }; tekenMeldingen(); }); }
      return k;
    };
    const negeer = knop('Negeren');
    negeer.addEventListener('click', () => doe(() => beheer('beheerMeldingKlaar', { id: m.id, uitkomst: 'Genegeerd' }), 'Melding genegeerd.'));
    acties.append(negeer, knop('Waarschuwen', 'waarschuw'), knop('Tijdelijk bannen', 'tijdelijk', true), knop('Permanent bannen', 'permanent', true));
    if (m.banStatus) {
      const op = el('button', 'knop klein', 'Ban opheffen'); op.type = 'button';
      op.addEventListener('click', () => doe(() => beheer('beheerOnban', { id: m.tegen }), 'Ban opgeheven.'));
      acties.append(op);
    }
    li.append(acties);
    if (meldForm && meldForm.id === m.id) li.append(meldFormulier(m, meldForm.soort));
    return li;
  }

  function meldFormulier(m, soort) {
    const f = el('form', 'meldform');
    f.autocomplete = 'off';
    const ban = soort !== 'waarschuw';
    let sel = null;
    if (soort === 'tijdelijk') {
      const duur = el('label', 'veld'); duur.append(el('span', '', 'Duur'));
      sel = el('select'); for (const [w, t] of DUREN) { const o = el('option', '', t); o.value = w; sel.append(o); }
      sel.value = '86400'; duur.append(sel); f.append(duur);
    }
    const reden = el('label', 'veld'); reden.append(el('span', '', ban ? 'Reden (verplicht, zien zij zelf, max 200 tekens)' : 'Reden van de waarschuwing (verplicht, max 200 tekens)'));
    const ri = el('input'); ri.type = 'text'; ri.maxLength = 200; ri.required = true; ri.placeholder = ban ? 'bijv. pesten' : 'bijv. houd het netjes'; reden.append(ri); f.append(reden);
    let ceE = null, ceI = null;
    if (ban) {
      const keuzes = el('fieldset', 'meld-vinkjes'); keuzes.append(el('legend', '', 'Ook blokkeren'));
      const vink = (tekst, aan, uit) => { const l = el('label', 'vink'); const c = el('input'); c.type = 'checkbox'; c.checked = aan; c.disabled = !!uit; l.append(c, document.createTextNode(' ' + tekst)); keuzes.append(l); return c; };
      ceE = vink('ook e-mailadres', false);
      const ipDruk = m.ipAccounts > 3;
      ceI = vink('ook IP (max. 7 dagen)' + (m.ipBekend ? '' : ' (geen IP bekend)'), m.ipBekend && !ipDruk, !m.ipBekend);
      if (ipDruk) keuzes.append(el('small', 'vink-uitleg', 'Standaard uit: dit IP wordt door veel accounts gedeeld.'));
      f.append(keuzes);
    }
    const knoppen = el('div', 'rij-knoppen');
    const ok = el('button', 'knop klein goud', soort === 'waarschuw' ? 'Waarschuw' : soort === 'permanent' ? 'Permanent bannen' : 'Tijdelijk bannen'); ok.type = 'submit';
    const nee = el('button', 'knop klein', 'Annuleren'); nee.type = 'button';
    nee.addEventListener('click', () => { meldForm = null; tekenMeldingen(); });
    knoppen.append(ok, nee); f.append(knoppen);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const tekst = ri.value.trim().slice(0, 200);
      if (!tekst) { melding('Vul een reden in.', true); ri.focus(); return; }
      if (!ban) { await doe(async () => { await beheer('beheerWaarschuw', { id: m.tegen, reden: tekst }); await beheer('beheerMeldingKlaar', { id: m.id, uitkomst: 'Gewaarschuwd' }); }, 'Waarschuwing verstuurd.'); return; }
      const duurTekst = soort === 'permanent' ? 'voorgoed' : DUREN.find((d) => d[0] === sel.value)[1];
      const regels = ['Je verbant ' + m.tegen + ' ' + (soort === 'permanent' ? 'voorgoed' : 'voor ' + duurTekst) + '.', 'Reden: ' + tekst,
        'Ook e-mailadres blokkeren: ' + (ceE.checked ? 'ja' : 'nee'), 'Ook IP blokkeren (max. 7 dagen): ' + (ceI.checked ? 'ja' : 'nee')];
      if (!(await bevestig(regels, 'Ja, verbannen'))) return;
      const tot = soort === 'permanent' ? 0 : Math.floor(Date.now() / 1000) + Number(sel.value);
      await doe(async () => {
        await beheer('beheerBan', { id: m.tegen, tot, reden: tekst, ook_email: ceE.checked, ook_ip: ceI.checked });
        await beheer('beheerMeldingKlaar', { id: m.id, uitkomst: 'Verbannen (' + duurTekst + ')' });
      }, 'Gebruiker verbannen.');
    });
    return f;
  }

  function tekenMeldingen() {
    const f = $('meld-filter').value;
    const l = meldingen.filter((m) => f === 'alle' || (f === 'nieuw' ? m.status !== 'klaar' : m.status === 'klaar'));
    const ul = $('meldlijst'); ul.textContent = '';
    for (const m of l) ul.append(meldKaart(m));
    const nieuw = meldingen.filter((m) => m.status !== 'klaar').length;
    $('meld-teller').hidden = nieuw === 0; $('meld-teller').textContent = String(nieuw);
    $('meld-leeg').hidden = l.length > 0 || !!meldFout;
    $('meld-status').textContent = meldFout || `${nl(l.length)} van ${nl(meldingen.length)} meldingen.`;
    $('meld-status').classList.toggle('fout-tekst', !!meldFout);
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
    const [lijst, s, ml] = await Promise.all([beheer('beheerLijst'), beheer('beheerStats'), beheer('beheerMeldingen').catch((e) => { if (e.status === 403) throw e; return { fout: e }; })]);
    gebruikers = lijst.gebruikers || []; nuServer = lijst.nu || Math.floor(Date.now() / 1000); stats = s;
    if (ml.fout) { meldingen = []; meldFout = ml.fout.status === 503 ? 'De server mist nog tabellen: voer migratie-v3.sql uit.' : ml.fout.status === 400 || ml.fout.status === 404 ? 'De server kent nog geen meldingen: upload de nieuwe api.php.' : 'Meldingen laden lukte niet: ' + ml.fout.message; }
    else { meldFout = ''; meldingen = ml.meldingen || []; }
    // Bewijs dat open stond blijft alleen open voor meldingen die er nog zijn
    for (const id of [...bewijsOpen.keys()]) if (!meldingen.some((m) => m.id === id)) bewijsOpen.delete(id);
    const tf = $('tabel-fout');
    const mist = (s.ontbrekendeTabellen || []);
    tf.hidden = mist.length === 0;
    tf.textContent = mist.length ? 'De server mist tabellen: ' + mist.join(', ') + '. Voer migratie-v3.sql uit in phpMyAdmin.' : '';
    tekenStats(); teken(); tekenMeldingen();
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
  $('meld-filter').addEventListener('input', () => tekenMeldingen());
  $('meld-ververs').addEventListener('click', () => doe(async () => { await leesNamen(); }, ''));

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
