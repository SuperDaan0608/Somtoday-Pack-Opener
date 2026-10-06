(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toFixed(1).replace('.', ',');
  const datum = (ts) => new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  const tijd = (ts) => new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  let st = null;          // lokale toestand (bevat geen namen of cijfers van vrienden, wel bijnamen)
  let galerij = [];       // eigen kaarten
  let vriendKaarten = {}; // cijfers van vrienden: alleen in het geheugen
  const timers = new Map();
  const wacht = new Map();
  let bezig = false;

  function el(tag, klas, tekst) {
    const e = document.createElement(tag);
    if (klas) e.className = klas;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
  }

  function melding(tekst, fout) {
    const p = el('p', fout ? 'fout' : '', tekst);
    $('melding').append(p);
    setTimeout(() => p.remove(), fout ? 9000 : 5000);
  }
  function foutTekst(e) { return e && e.message ? e.message : 'Er ging iets mis.'; }

  // Tweestaps knop: eerste klik vraagt om bevestiging, tweede voert uit.
  function tweestaps(knop, tekst, bevestig, actie) {
    function reset() { clearTimeout(wacht.get(knop)); knop.classList.remove('zeker'); knop.textContent = tekst; }
    knop.addEventListener('click', () => {
      if (knop.classList.contains('zeker')) { reset(); actie(); return; }
      knop.classList.add('zeker'); knop.textContent = bevestig;
      clearTimeout(wacht.get(knop)); wacht.set(knop, setTimeout(reset, 4000));
    });
    knop.addEventListener('blur', reset);
  }

  async function bewaar() { await L.bewaar(st); }

  // ---- weergave ----
  function toonCode() { $('mijn-code').value = L.maakCode(st.id, st.pub); }

  const VEILIG_UITLEG = 'Vergelijk deze code met je vriend, bijvoorbeeld via WhatsApp of op school. Zijn ze gelijk, dan weet je zeker dat niemand meeleest.';
  function veiligBlok(v) {
    const d = el('div', 'veilig');
    d.append(el('p', 'v-label', 'Veiligheidscode'));
    const c = el('p', 'v-code', '...'); c.setAttribute('data-veilig', v.id);
    d.append(c, el('p', 'uitleg', VEILIG_UITLEG));
    L.veiligheidscode(st.pub, v.pub).then((t) => { c.textContent = t; });
    return d;
  }

  function renderVerzoeken() {
    const lijst = st.vrienden.filter((v) => v.status === 'ontvangen');
    $('verzoeken-sectie').hidden = !lijst.length;
    const ul = $('verzoeken');
    ul.replaceChildren();
    for (const v of lijst) {
      const li = el('li', 'verzoek');
      const id = 'vz-' + v.id;
      const lab = el('label', 'veld');
      lab.append(el('span', '', 'Bijnaam voor deze vriend (alleen voor jou)'));
      const inv = el('input'); inv.type = 'text'; inv.id = id; inv.maxLength = 30; inv.value = v.alias || '';
      lab.append(inv);
      const bev = el('label', 'bevestig');
      const cb0 = el('input'); cb0.type = 'checkbox';
      bev.append(cb0, el('span', '', 'Ik ken de veiligheidscode (of ga bewust door zonder te vergelijken)'));
      const acties = el('div', 'acties');
      const ja = el('button', 'knop goud klein', 'Accepteren'); ja.type = 'button';
      const nee = el('button', 'knop klein', 'Weigeren'); nee.type = 'button';
      ja.addEventListener('click', async () => {
        const alias = inv.value.trim();
        if (!alias) { melding('Kies eerst een bijnaam voor deze vriend.', true); inv.focus(); return; }
        if (!cb0.checked) { melding('Bevestig eerst dat je de veiligheidscode kent of bewust doorgaat.', true); cb0.focus(); return; }
        try { await L.antwoord(st, v.id, true, alias); melding(`${alias} is nu je vriend. Kies hieronder wat die mag zien.`); renderAlles(); await sync(true); }
        catch (e) { melding(foutTekst(e), true); }
      });
      nee.addEventListener('click', async () => {
        try { await L.antwoord(st, v.id, false); melding('Verzoek geweigerd.'); renderAlles(); }
        catch (e) { melding(foutTekst(e), true); }
      });
      acties.append(ja, nee);
      li.append(el('p', '', 'Iemand wil vrienden worden. Je kent deze persoon alleen via een onleesbare code.'), veiligBlok(v), lab, bev, acties);
      ul.append(li);
    }
  }

  function kaartje(k) {
    const li = el('li', 'cijferkaart t' + Math.max(0, Math.min(4, k.tier | 0)));
    li.append(el('span', 'cj', fmt(k.cijfer)), el('span', 'vk', k.vak || ''));
    if (k.onderwerp) li.append(el('span', 'on', k.onderwerp));
    li.append(el('span', 'nv', `${NIVEAUS[Math.max(0, Math.min(4, k.tier | 0))]} · ${datum(k.ts)}`));
    return li;
  }

  function vriendItem(v) {
    const li = el('li', 'vriend');
    const naam = L.naam(v);
    const kop = el('div', 'v-kop');
    const h = el('h3', 'v-naam', naam);
    h.style.margin = '0';
    const badge = el('span', 'badge' + (v.status === 'weggevallen' ? ' weg' : ''),
      v.status === 'verzonden' ? 'Wacht op antwoord' : v.status === 'weggevallen' ? 'Weggevallen' : 'Vriend');
    h.append(badge);
    kop.append(h);
    li.append(kop);

    if (v.status === 'weggevallen') {
      li.append(el('p', 'uitleg', 'Deze persoon is geen vriend meer (verwijderd of account gewist). Jullie delen niets meer.'));
    } else if (v.status === 'verzonden') {
      li.append(el('p', 'uitleg', 'Je verzoek is verstuurd. Zodra je vriend accepteert, kun je kaarten delen.'));
    } else {
      const vb = veiligBlok(v);
      if (v.geverifieerd) { const ok = el('p', 'geverifieerd', '\u2713 Geverifieerd'); vb.append(ok); }
      else {
        const kn = el('button', 'knop klein', 'Code komt overeen'); kn.type = 'button';
        kn.addEventListener('click', async () => { v.geverifieerd = true; await bewaar(); renderVrienden(); melding('Code als geverifieerd opgeslagen.'); });
        vb.append(kn);
      }
      li.append(vb);
      const d = v.deel || (v.deel = { modus: 'niets', ids: [] });
      const wrap = el('div', 'v-deel');
      const lab = el('label', 'veld'); lab.append(el('span', '', 'Wat mag deze vriend zien?'));
      const sel = el('select');
      [['niets', 'Niets'], ['alles', 'Alles'], ['selectie', 'Alleen geselecteerde']].forEach(([w, t]) => {
        const o = el('option', '', t); o.value = w; sel.append(o);
      });
      sel.value = d.modus; lab.append(sel); wrap.append(lab);
      li.append(wrap);

      const lijst = el('div', 'selectie');
      lijst.setAttribute('role', 'group');
      lijst.setAttribute('aria-label', 'Kaarten die ' + naam + ' mag zien');
      lijst.hidden = d.modus !== 'selectie';
      if (!galerij.length) lijst.append(el('p', 'geen', 'Je galerij is nog leeg.'));
      for (const g of galerij) {
        const r = el('label');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = (d.ids || []).includes(g.id);
        cb.addEventListener('change', () => {
          const s = new Set(d.ids || []);
          if (cb.checked) s.add(g.id); else s.delete(g.id);
          d.ids = [...s]; planPut(v);
        });
        r.append(cb, el('span', 's-cj', fmt(g.cijfer)), el('span', 's-vak', `${g.vak || ''} · ${datum(g.ts)}`));
        lijst.append(r);
      }
      li.append(lijst);
      sel.addEventListener('change', () => { d.modus = sel.value; lijst.hidden = d.modus !== 'selectie'; planPut(v); });

      const kop2 = el('h4', '', `Cijfers van ${naam}`);
      kop2.style.cssText = 'margin:6px 0 8px;font-size:14px';
      li.append(kop2);
      const gek = vriendKaarten[v.id];
      if (gek && gek.kaarten.length) {
        const ul = el('ul', 'v-cijfers');
        gek.kaarten.slice().sort((a, b) => b.ts - a.ts).forEach((k) => ul.append(kaartje(k)));
        li.append(ul);
      } else li.append(el('p', 'geen', gek ? `${naam} deelt op dit moment niets met jou.` : 'Nog niet opgehaald. Druk op Synchroniseren.'));
    }

    const voet = el('div', 'v-voet');
    const weg = el('button', 'knop gevaar klein', 'Verwijderen'); weg.type = 'button';
    weg.setAttribute('aria-label', `${naam} verwijderen`);
    tweestaps(weg, 'Verwijderen', 'Zeker weten?', async () => {
      try { await L.verwijderVriend(st, v.id); delete vriendKaarten[v.id]; melding(`${naam} is verwijderd.`); renderAlles(); }
      catch (e) { melding(foutTekst(e), true); }
    });
    voet.append(weg);
    li.append(voet);
    return li;
  }

  function renderVrienden() {
    const lijst = st.vrienden.filter((v) => v.status !== 'ontvangen');
    $('geen-vrienden').hidden = lijst.length > 0;
    $('vrienden').replaceChildren(...lijst.map(vriendItem));
  }
  function renderAlles() { renderVerzoeken(); renderVrienden(); }

  // Wijziging in delen: kort wachten en dan alleen deze vriend bijwerken.
  function planPut(v) {
    clearTimeout(timers.get(v.id));
    timers.set(v.id, setTimeout(async () => {
      try { await bewaar(); await L.zetBlob(st, v, galerij); $('sync-status').textContent = 'Delen bijgewerkt om ' + tijd(Date.now()) + '.'; }
      catch (e) { melding(foutTekst(e), true); }
    }, 500));
  }

  async function sync(stil) {
    if (bezig) return;
    bezig = true; $('sync').disabled = true; $('sync-status').textContent = 'Bezig met synchroniseren...';
    try {
      galerij = await L.leesGalerij();
      const r = await L.synchroniseer(st, galerij);
      vriendKaarten = r.kaarten;
      [...new Set(r.meldingen)].forEach((m) => melding(m));
      $('sync-status').textContent = 'Gesynchroniseerd om ' + tijd(Date.now()) + '.';
      renderAlles();
    } catch (e) {
      $('sync-status').textContent = 'Synchroniseren mislukt.';
      if (e.status === 401) melding('Je account is niet meer geldig op de server. Wis alles en zet de functie opnieuw aan.', true);
      else if (!stil || true) melding(foutTekst(e), true);
    } finally { bezig = false; $('sync').disabled = false; }
  }

  function toonApp() {
    $('uitleg').hidden = true; $('app').hidden = false;
    toonCode();
  }

  async function init() {
    const standaard = new URLSearchParams(location.search).get('server') || L.STANDAARD_SERVER;
    $('server').value = standaard;
    st = await L.laad();
    galerij = await L.leesGalerij();
    if (!st) { $('uitleg').hidden = false; return; }
    toonApp(); renderAlles();
    await sync();
  }

  $('aanzetten').addEventListener('click', async () => {
    const knop = $('aanzetten');
    knop.disabled = true;
    try {
      st = await L.aanzetten($('server').value.trim() || L.STANDAARD_SERVER);
      toonApp(); renderAlles(); melding('Vriendenfunctie staat aan.');
      $('sync').focus();
      await sync(true);
    } catch (e) { melding(foutTekst(e), true); }
    knop.disabled = false;
  });

  $('sync').addEventListener('click', () => sync());

  $('kopieer').addEventListener('click', async () => {
    const t = $('mijn-code').value;
    try { await navigator.clipboard.writeText(t); melding('Vriendcode gekopieerd.'); }
    catch (e) { $('mijn-code').select(); melding('Kopieer de geselecteerde code zelf (Ctrl+C).'); }
  });

  $('toevoegen').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const alias = $('t-alias').value.trim();
    if (!alias) { melding('Kies een bijnaam voor je vriend.', true); return; }
    try {
      const s = await L.verzoek(st, $('t-code').value, alias);
      $('t-code').value = ''; $('t-alias').value = '';
      melding(s === 'accepted' ? `${alias} is nu je vriend.` : `Verzoek verstuurd naar ${alias}.`);
      renderAlles();
      if (s === 'accepted') await sync(true);
    } catch (e) { melding(foutTekst(e), true); }
  });

  tweestaps($('wis'), 'Alles wissen en account verwijderen', 'Zeker weten? Klik nogmaals', async () => {
    try {
      await L.verwijderAccount(st);
    } catch (e) {
      if (e.status !== 401) { melding(foutTekst(e), true); return; }
      await L.wis('spo_vrienden'); // account bestond al niet meer op de server
    }
    st = null; vriendKaarten = {};
    $('app').hidden = true; $('uitleg').hidden = false;
    melding('Je account en al je gedeelde gegevens zijn gewist.');
    $('aanzetten').focus();
  });

  init().catch((e) => melding(foutTekst(e), true));
})();
