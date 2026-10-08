(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toFixed(1).replace('.', ',');
  const datum = (ts) => new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  const tijd = (ts) => new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  // Eén decimaal (7,3), of twee als het cijfer er twee heeft (9,97): zo klopt 'ernaast' altijd met wat er staat.
  const fmtFlex = (n) => { const v = Math.round(Number(n) * 100) / 100; return v.toFixed(Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2).replace('.', ','); };
  function kaartTitel(x) {
    let t = x.vak;
    if (x.onderwerp) t += ', ' + x.onderwerp;
    if (Number.isFinite(x.weging)) t += ` (weging ${String(x.weging).replace('.', ',')})`;
    return t;
  }
  const actieveVrienden = () => st.vrienden.filter((v) => v.status === 'vriend');
  const lijstTekst = (namen) => namen.length < 2 ? namen.join('') : namen.slice(0, -1).join(', ') + ' en ' + namen[namen.length - 1];
  const verschilTekst = (d) => (d === 0 ? 'precies goed' : fmtFlex(d) + ' ernaast');

  let st = null;          // lokale toestand (bevat geen namen of cijfers van vrienden, wel bijnamen)
  let galerij = [];       // eigen kaarten
  let vriendKaarten = {}; // wat vrienden met jou delen (cijfers, reacties, rondes, gokken): alleen in het geheugen
  let dicht = [];         // je nog ongeopende cijfers (zonder het cijfer zelf), uit spo_dicht
  let opgehaald = false;  // is er al eens met de server gesynchroniseerd (anders weten we nog niets over gokken van vrienden)
  let raadForm = null;    // { sig, naar: Set } zolang het formulier 'Laat vrienden raden' openstaat
  const concept = new Map(); // gokken die nog niet zijn opgeslagen: blijven staan als de lijst opnieuw wordt getekend
  const timers = new Map();
  const wacht = new Map();
  let bezig = false;
  let gevechten = {};     // uitslagen van gevechten met vrienden (spo_gevechten)
  let uitdagingen = new Set(); // vrienden die je uitdagen (alleen om te melden)
  let live = null;
  let banGemeld = false;  // de verbanningsmelding maar één keer tonen

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
        try { await L.antwoord(st, v.id, true, alias); melding(`${alias} is nu je vriend. Bij Meer opties kies je wat die mag zien.`); renderAlles(); await sync(true); }
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

  // Zes emoji-knoppen onder een kaart van een vriend. Eén reactie per kaart: een andere emoji vervangt hem, dezelfde haalt hem weg.
  function reageerRij(v, naam, k) {
    const g = el('div', 'reageer');
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', 'Reacties op ' + (k.vak || 'deze kaart') + (k.onderwerp ? ', ' + k.onderwerp : ''));
    const huidig = L.eigen(L.eigen(st.reacties, v.id), k.id);
    L.REACTIES.forEach((r, i) => {
      const b = el('button', '', r.emoji);
      b.type = 'button'; b.id = `re-${v.id}-${k.id}-${i}`;
      b.setAttribute('aria-label', 'Reageer met ' + r.naam); b.title = 'Reageer met ' + r.naam;
      b.setAttribute('aria-pressed', String(huidig === r.emoji));
      b.addEventListener('click', async () => {
        try { L.zetReactie(st, v.id, k.id, r.emoji); } catch (e) { melding(foutTekst(e), true); return; }
        const nu = L.eigen(L.eigen(st.reacties, v.id), k.id);
        g.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(nu === L.REACTIES[j].emoji)));
        try { await bewaar(); } catch (e) { melding(foutTekst(e), true); }
        planPut(v);
      });
      g.append(b);
    });
    return g;
  }

  function kaartje(k, v, naam) {
    const li = el('li', 'cijferkaart t' + Math.max(0, Math.min(4, k.tier | 0)));
    li.append(el('span', 'cj', fmt(k.cijfer)), el('span', 'vk', k.vak || ''));
    if (k.onderwerp) li.append(el('span', 'on', k.onderwerp));
    li.append(el('span', 'nv', `${NIVEAUS[Math.max(0, Math.min(4, k.tier | 0))]} · ${datum(k.ts)}`));
    li.append(reageerRij(v, naam, k));
    return li;
  }

  // Rondes van een vriend ('X laat je raden'): een gok invullen zolang er geen uitslag is, daarna de uitslag.
  function gokItem(v, naam, r) {
    const li = el('li', 'gok');
    const mijn = L.eigen(L.eigen(st.gokken, v.id), r.rid);
    if (r.uitslag) {
      const c = r.uitslag.cijfer;
      li.append(el('p', 'gok-vraag', kaartTitel(r)));
      li.append(el('p', 'gok-uitslag', mijn === undefined
        ? `Het cijfer was ${fmtFlex(c)}. Je had niet gegokt.`
        : `Het cijfer was ${fmtFlex(c)}. Jij gokte ${fmt(mijn)} (${verschilTekst(Math.round(Math.abs(mijn - c) * 100) / 100)}).`));
      if (mijn !== undefined) li.append(el('p', 'gok-dichtst', r.uitslag.dichtst ? 'Jij zat het dichtst bij.' : 'Een andere vriend zat er dichter bij.'));
      return li;
    }
    const sleutel = v.id + '|' + r.rid;
    const f = el('form', 'gok-form'); f.noValidate = true;
    f.append(el('p', 'gok-vraag', `${naam} laat je raden: ${kaartTitel(r)}. Wat denk je dat ${naam} haalde?`));
    const lab = el('label', 'veld');
    lab.append(el('span', '', 'Jouw gok (1,0 tot 10,0)'));
    const inv = el('input'); inv.type = 'text'; inv.id = `gok-${v.id}-${r.rid}`; inv.inputMode = 'decimal'; inv.maxLength = 5;
    inv.autocomplete = 'off'; inv.spellcheck = false;
    inv.value = concept.has(sleutel) ? concept.get(sleutel) : (mijn === undefined ? '' : fmt(mijn));
    inv.addEventListener('input', () => concept.set(sleutel, inv.value));
    lab.append(inv);
    const knop = el('button', 'knop goud klein', 'Gok opslaan'); knop.type = 'submit';
    const status = el('p', 'gok-status', mijn === undefined ? '' : `Je gok is ${fmt(mijn)}. Je kunt hem aanpassen tot ${naam} de uitslag deelt.`);
    status.setAttribute('role', 'status');
    f.append(lab, knop, status);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      status.classList.remove('fout-tekst');
      const g = L.leesGok(inv.value);
      if (g === null) {
        status.textContent = 'Vul een cijfer in van 1,0 tot 10,0, met hoogstens één decimaal (bijvoorbeeld 7,3).';
        status.classList.add('fout-tekst'); inv.setAttribute('aria-invalid', 'true'); inv.focus();
        return;
      }
      inv.removeAttribute('aria-invalid');
      try { L.slaGokOp(st, v.id, r.rid, g); await bewaar(); }
      catch (e) { status.textContent = foutTekst(e); status.classList.add('fout-tekst'); return; }
      concept.delete(sleutel); inv.value = fmt(g);
      status.textContent = `Je gok is ${fmt(g)}. Hij wordt verstuurd...`;
      try {
        await L.zetBlob(st, v, galerij);
        status.textContent = `Je gok is ${fmt(g)} en verstuurd naar ${naam}. Je kunt hem aanpassen tot ${naam} de uitslag deelt.`;
      } catch (e) {
        status.textContent = `Je gok is ${fmt(g)}, maar versturen mislukte: ${foutTekst(e)} Druk op Synchroniseren om het opnieuw te proberen.`;
        status.classList.add('fout-tekst');
      }
    });
    li.append(f);
    return li;
  }
  function raadBlok(v, naam, gek) {
    if (!gek || !gek.raden.length) return null;
    const wrap = el('div', 'raadblok');
    wrap.append(el('h4', 'v-sub', `${naam} laat je raden`));
    const ul = el('ul', 'gok-lijst');
    gek.raden.forEach((r) => ul.append(gokItem(v, naam, r)));
    wrap.append(ul);
    return wrap;
  }

  // "Zojuist actief", "12 minuten geleden", "vandaag 14:05" of een datum: van het moment dat de vriend zijn gegevens voor jou bijwerkte.
  function geziendTekst(ts) {
    if (!ts) return 'Nog niet gezien';
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 120) return 'Zojuist actief';
    if (s < 3600) return `Gezien ${Math.round(s / 60)} minuten geleden`;
    const d = new Date(ts), nu = new Date();
    if (d.toDateString() === nu.toDateString()) return 'Gezien vandaag om ' + tijd(ts);
    return 'Laatst gezien op ' + datum(ts);
  }
  const eersteLetter = (naam) => (String(naam).trim().charAt(0) || '?').toUpperCase();

  // Alles wat je zelden nodig hebt voor één vriend: wat deel je, de veiligheidscode en de vriend verwijderen.
  function vriendMeer(v, naam) {
    const det = el('details', 'v-meer');
    det.id = 'meer-' + v.id;
    det.append(el('summary', '', v.geverifieerd ? 'Meer opties' : 'Meer opties (code nog niet vergeleken)'));
    const d = v.deel || (v.deel = { modus: 'niets', ids: [] });
    const wrap = el('div', 'v-deel');
    const lab = el('label', 'veld'); lab.append(el('span', '', 'Wat mag deze vriend zien?'));
    const sel = el('select');
    [['niets', 'Niets'], ['alles', 'Alles'], ['selectie', 'Alleen geselecteerde']].forEach(([w, t]) => {
      const o = el('option', '', t); o.value = w; sel.append(o);
    });
    sel.id = 'deel-' + v.id; sel.value = d.modus; lab.append(sel); wrap.append(lab);
    det.append(wrap);

    const lijst = el('div', 'selectie');
    lijst.setAttribute('role', 'group');
    lijst.setAttribute('aria-label', 'Kaarten die ' + naam + ' mag zien');
    lijst.hidden = d.modus !== 'selectie';
    if (!galerij.length) lijst.append(el('p', 'geen', 'Je galerij is nog leeg.'));
    for (const g of galerij) {
      const r = el('label');
      const cb = el('input'); cb.type = 'checkbox'; cb.id = `sel-${v.id}-${g.id}`; cb.checked = (d.ids || []).includes(g.id);
      cb.addEventListener('change', () => {
        const s = new Set(d.ids || []);
        if (cb.checked) s.add(g.id); else s.delete(g.id);
        d.ids = [...s]; planPut(v);
      });
      r.append(cb, el('span', 's-cj', fmt(g.cijfer)), el('span', 's-vak', `${g.vak || ''} · ${datum(g.ts)}`));
      lijst.append(r);
    }
    det.append(lijst);
    sel.addEventListener('change', () => { d.modus = sel.value; lijst.hidden = d.modus !== 'selectie'; planPut(v); });

    const vb = veiligBlok(v);
    if (v.geverifieerd) vb.append(el('p', 'geverifieerd', '✓ Geverifieerd'));
    else {
      const kn = el('button', 'knop klein', 'Code komt overeen'); kn.type = 'button';
      kn.addEventListener('click', async () => { v.geverifieerd = true; await bewaar(); renderVrienden(); const n = $('meer-' + v.id); if (n) n.open = true; melding('Code als geverifieerd opgeslagen.'); });
      vb.append(kn);
    }
    det.append(vb);
    det.append(verwijderKnop(v, naam));
    return det;
  }
  function verwijderKnop(v, naam) {
    const voet = el('div', 'v-voet');
    const weg = el('button', 'knop gevaar klein', 'Verwijderen'); weg.type = 'button';
    weg.setAttribute('aria-label', `${naam} verwijderen`);
    tweestaps(weg, 'Verwijderen', 'Zeker weten?', async () => {
      try { await L.verwijderVriend(st, v.id); delete vriendKaarten[v.id]; melding(`${naam} is verwijderd.`); renderAlles(); }
      catch (e) { melding(foutTekst(e), true); }
    });
    voet.append(weg);
    return voet;
  }

  // Tab 1: één rij per vriend. Kaarten, gokken en gevechten staan op hun eigen tab.
  function vriendItem(v) {
    const li = el('li', 'vriend');
    li.dataset.id = v.id;
    const naam = L.naam(v);
    const gek = vriendKaarten[v.id];
    const kop = el('div', 'v-kop');
    const wie = el('div', 'v-wie');
    wie.append(el('span', 'v-avatar', eersteLetter(naam)));
    const tekst = el('div', 'v-tekst');
    const h = el('h3', 'v-naam', naam);
    h.append(el('span', 'badge' + (v.status === 'weggevallen' || v.andereVersie ? ' weg' : ''),
      v.status === 'verzonden' ? 'Wacht op antwoord' : v.status === 'weggevallen' ? 'Weggevallen' : v.andereVersie ? 'Andere versie' : 'Vriend'));
    tekst.append(h);
    wie.append(tekst);
    kop.append(wie);
    li.append(kop);

    if (v.status === 'vriend' && v.andereVersie) {
      tekst.append(el('p', 'v-status', `Andere versie (${v.zijnVersie || 'oud'}). Jullie moeten allebei de nieuwste versie hebben; tot dan zie je elkaars kaarten niet en kun je niet battelen.`));
    }
    if (v.status === 'weggevallen') {
      tekst.append(el('p', 'v-status', 'Geen vriend meer'));
      li.append(el('p', 'uitleg', 'Deze persoon is geen vriend meer (verwijderd of account gewist). Jullie delen niets meer.'));
      li.append(verwijderKnop(v, naam));
      return li;
    }
    if (v.status === 'verzonden') {
      tekst.append(el('p', 'v-status', 'Wacht op antwoord'));
      li.append(el('p', 'uitleg', 'Je verzoek is verstuurd. Zodra je vriend accepteert, kun je kaarten delen.'));
      li.append(verwijderKnop(v, naam));
      return li;
    }
    const delen = [geziendTekst(gek && gek.ts)];
    if (gek && gek.team) delen.push(`Team: ${gek.team.kaarten.length} ${gek.team.kaarten.length === 1 ? 'kaart' : 'kaarten'}`);
    else if (gek) delen.push('Nog geen team');
    const status = el('p', 'v-status', delen.join(' · '));
    if (gek && gek.ts) { status.dataset.ts = String(gek.ts); status.dataset.rest = delen.slice(1).join(' · '); }
    tekst.append(status);
    const acties = el('div', 'v-acties');
    const uit = el('a', 'knop goud klein', 'Uitdagen'); uit.href = 'team.html'; uit.dataset.ga = 'team';
    uit.setAttribute('aria-label', `${naam} uitdagen voor een gevecht`);
    acties.append(uit);
    kop.append(acties);
    if (uitdagingen.has(v.id)) li.append(el('p', 'geverifieerd', `${naam} daagt je uit! Open Team om te accepteren.`));

    if (gek && gek.profiel) {
      const det = el('details', 'v-profiel'); det.id = 'prof-' + v.id;
      det.append(el('summary', '', `Profielkaart${gek.profiel.bn ? ' (' + gek.profiel.bn + ')' : ''}`));
      det.addEventListener('toggle', () => {
        if (!det.open || det.querySelector('canvas')) return;
        const cv = document.createElement('canvas');
        cv.style.cssText = 'width:min(240px,100%);height:auto;border-radius:16px;margin-top:8px';
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', `Profielkaart van ${naam}: ${gek.profiel.bn || 'speler'}, niveau ${gek.profiel.ovr}`);
        det.append(cv);
        globalThis.SPOEco.tekenProfiel(cv, gek.profiel);
      });
      li.append(det);
    }
    li.append(vriendMeer(v, naam));
    return li;
  }

  // 'Zojuist actief' wordt vanzelf 'Gezien 3 minuten geleden', zonder de lijst opnieuw te tekenen.
  setInterval(() => {
    for (const p of document.querySelectorAll('.v-status[data-ts]')) p.textContent = [geziendTekst(Number(p.dataset.ts)), p.dataset.rest].filter(Boolean).join(' · ');
  }, 30000);

  function renderVrienden() {
    const open = new Set([...document.querySelectorAll('#vrienden details[open]')].map((d) => d.id));
    const lijst = st.vrienden.filter((v) => v.status !== 'ontvangen');
    $('geen-vrienden').hidden = lijst.length > 0;
    $('vrienden').replaceChildren(...lijst.map(vriendItem));
    for (const d of document.querySelectorAll('#vrienden details')) if (open.has(d.id)) d.open = true;
  }

  // Tab 2: per vriend de gedeelde kaarten met emoji-reacties.
  function renderKaartenVanVrienden() {
    const actief = actieveVrienden();
    $('geen-kaarten-vrienden').hidden = actief.length > 0;
    $('vk-lijst').replaceChildren(...actief.map((v) => {
      const naam = L.naam(v), gek = vriendKaarten[v.id];
      const li = el('li', 'vk-groep');
      li.dataset.id = v.id;
      li.append(el('h2', 'vk-naam', `Kaarten van ${naam}`));
      if (gek && gek.kaarten.length) {
        const ul = el('ul', 'v-cijfers');
        gek.kaarten.slice().sort((a, b) => b.ts - a.ts).forEach((k) => ul.append(kaartje(k, v, naam)));
        li.append(ul);
      } else li.append(el('p', 'geen', gek ? `${naam} deelt op dit moment geen kaarten met jou. Vraag ${naam} om kaarten te delen.` : 'Nog niet opgehaald. Druk op Synchroniseren.'));
      return li;
    }));
  }

  // Tab 3: gevechten en de gokken die vrienden bij jou doen.
  function renderUitdagingenTab() {
    const actief = actieveVrienden();
    $('geen-uitdagingen').hidden = actief.length > 0;
    $('uitdagingen-inhoud').hidden = !actief.length;
    const rijen = [];
    for (const v of actief) {
      const naam = L.naam(v);
      const gv = Array.isArray(gevechten[v.id]) ? gevechten[v.id] : [];
      const daagt = uitdagingen.has(v.id);
      if (!gv.length && !daagt) continue;
      const li = el('li', 'gv-rij');
      li.append(el('strong', 'gv-naam', naam));
      if (gv.length) {
        const w = gv.filter((x) => x.mijn > x.hun).length, g = gv.filter((x) => x.mijn === x.hun).length, l = gv.length - w - g;
        li.append(el('span', 'gv-stand', `${w} gewonnen, ${g} gelijk, ${l} verloren. Laatste uitslag: ${gv[0].mijn}-${gv[0].hun}.`));
      }
      if (daagt) { const a = el('a', 'knop goud klein', 'Gevecht accepteren'); a.href = 'team.html'; a.dataset.ga = 'team'; li.append(el('span', 'geverifieerd', `${naam} daagt je uit!`), a); }
      rijen.push(li);
    }
    $('gevechten').replaceChildren(...rijen);
    $('geen-gevechten').hidden = rijen.length > 0;
    const blokken = [];
    for (const v of actief) { const b = raadBlok(v, L.naam(v), vriendKaarten[v.id]); if (b) blokken.push(b); }
    $('raden-van').replaceChildren(...blokken);
    $('geen-raden-van').hidden = blokken.length > 0;
  }

  // ---- voorspel mijn cijfer (mijn eigen rondes) ----
  // Eén ongeopend cijfer, met de knop (of het formulier) om vrienden te laten raden.
  function dichtItem(d, heeftRonde, actief) {
    const li = el('li', 'dicht-item'); li.dataset.sig = d.id;
    const kop = el('div', 'di-kop');
    const t = el('div', 'di-tekst');
    t.append(el('span', 'di-vak', d.vak));
    t.append(el('span', 'di-on', [d.onderwerp, Number.isFinite(d.weging) ? 'weging ' + String(d.weging).replace('.', ',') : ''].filter(Boolean).join(' · ')));
    kop.append(t);
    const open = !!raadForm && raadForm.sig === d.id;
    if (heeftRonde) kop.append(el('span', 'badge', 'Ronde loopt'));
    else {
      const kn = el('button', 'knop klein', 'Laat vrienden raden'); kn.type = 'button'; kn.id = 'raad-' + d.id;
      kn.setAttribute('aria-expanded', String(open));
      kn.setAttribute('aria-label', 'Laat vrienden raden: ' + kaartTitel(d));
      kn.addEventListener('click', () => {
        raadForm = open ? null : { sig: d.id, naar: new Set(actief.map((v) => v.id)) };
        renderVoorspel();
        const f = document.querySelector(`.dicht-item[data-sig="${CSS.escape(d.id)}"] .raadform input`);
        (open ? $('raad-' + d.id) : f)?.focus();
      });
      kop.append(kn);
    }
    li.append(kop);
    if (open && !heeftRonde) li.append(raadFormulier(d, actief));
    return li;
  }
  function raadFormulier(d, actief) {
    const f = el('form', 'raadform'); f.noValidate = true;
    const fs = el('fieldset');
    fs.append(el('legend', '', 'Welke vrienden mogen raden?'));
    for (const v of actief) {
      const lab = el('label', 'keuze');
      const cb = el('input'); cb.type = 'checkbox'; cb.value = v.id; cb.id = `raadkeuze-${d.id}-${v.id}`; cb.checked = raadForm.naar.has(v.id);
      cb.addEventListener('change', () => { if (cb.checked) raadForm.naar.add(v.id); else raadForm.naar.delete(v.id); });
      lab.append(cb, el('span', '', L.naam(v)));
      fs.append(lab);
    }
    f.append(fs);
    f.append(el('p', 'uitleg', 'Deze vrienden zien het vak, het onderwerp en de weging van dit cijfer, maar niet het cijfer zelf. Het cijfer krijgen ze pas als jij later zelf op ‘Toon uitslag aan vrienden’ drukt. Zolang de ronde loopt, deel je dit cijfer ook niet als kaart met hen, ook niet als je ze ‘Alles’ laat zien.'));
    const status = el('p', 'gok-status', ''); status.setAttribute('role', 'status');
    const acties = el('div', 'acties');
    const ja = el('button', 'knop goud klein', 'Ronde starten'); ja.type = 'submit';
    const nee = el('button', 'knop klein', 'Annuleren'); nee.type = 'button';
    nee.addEventListener('click', () => { raadForm = null; renderVoorspel(); $('raad-' + d.id)?.focus(); });
    acties.append(ja, nee);
    f.append(status, acties);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      status.classList.remove('fout-tekst');
      const naar = [...raadForm.naar];
      if (!naar.length) { status.textContent = 'Kies minstens één vriend.'; status.classList.add('fout-tekst'); return; }
      let r;
      try { r = L.startRonde(st, d, naar); await bewaar(); }
      catch (e) { status.textContent = foutTekst(e); status.classList.add('fout-tekst'); return; }
      raadForm = null;
      const namen = lijstTekst(r.naar.map((id) => L.naam(st.vrienden.find((x) => x.id === id))));
      try { await L.zetBlobs(st, r.naar, galerij); melding(`Ronde gestart. ${namen} kan nu raden.`); }
      catch (e) { melding(`De ronde staat klaar, maar versturen mislukte: ${foutTekst(e)} Druk op Synchroniseren om het opnieuw te proberen.`, true); }
      renderAlles();
      $('ronde-' + r.rid)?.focus();
    });
    return f;
  }

  function rondeItem(r, vriendenVanRonde) {
    const li = el('li', 'ronde');
    const h = el('h4', 'r-kop', kaartTitel(r)); h.id = 'ronde-' + r.rid; h.tabIndex = -1;
    li.append(h);
    const g = galerij.find((e) => e.id === r.sig && Number.isFinite(e.cijfer));
    const klaar = !!(r.uitslagGedeeld && r.uitslag);
    const cijfer = klaar ? r.uitslag.cijfer : g ? g.cijfer : null;
    const namen = vriendenVanRonde.map((v) => L.naam(v));
    li.append(el('p', 'r-status', klaar ? `Uitslag gedeeld met ${lijstTekst(namen)}. Het cijfer was ${fmtFlex(cijfer)}.`
      : g ? `Geopend: het cijfer is ${fmtFlex(cijfer)}. Je hebt de uitslag nog niet gedeeld.` : 'Nog dicht.'));

    const rl = cijfer === null || !opgehaald ? null : L.ranglijst({ rid: r.rid, naar: vriendenVanRonde.map((v) => v.id) }, cijfer, vriendKaarten);
    const ul = el('ul', 'gokken');
    for (const v of vriendenVanRonde) {
      const x = rl && rl.lijst.find((y) => y.id === v.id);
      const gok = L.eigen(L.eigen(L.eigen(vriendKaarten, v.id), 'gokken'), r.rid);
      const item = el('li');
      item.append(el('span', 'g-naam', L.naam(v)), el('span', 'g-gok', !opgehaald ? 'nog niet opgehaald' : gok === undefined ? 'nog niet gegokt' : fmt(gok)));
      if (x) item.append(el('span', 'g-extra', `(${verschilTekst(x.verschil)})`));
      ul.append(item);
    }
    li.append(ul);
    if (rl) {
      const winnaars = klaar ? r.uitslag.dichtst.filter((id) => vriendenVanRonde.some((v) => v.id === id)) : rl.dichtst;
      const eerste = rl.lijst.find((y) => winnaars.includes(y.id));
      li.append(el('p', 'r-dichtst', winnaars.length
        ? `Dichtstbij: ${lijstTekst(winnaars.map((id) => L.naam(vriendenVanRonde.find((v) => v.id === id))))}${eerste ? ` (${verschilTekst(eerste.verschil)})` : ''}`
        : 'Niemand heeft gegokt.'));
    }

    const acties = el('div', 'acties');
    if (!klaar) {
      const hulp = el('p', 'uitleg', g
        ? `Als je dit doet, krijgen ${lijstTekst(namen)} het cijfer ${fmtFlex(cijfer)} te zien. Dat kun je daarna niet meer terughalen.`
        : 'Je kunt de uitslag pas delen als je dit cijfer hebt geopend.');
      hulp.id = 'uitslag-hulp-' + r.rid;
      li.append(hulp);
      const kn = el('button', 'knop goud klein', 'Toon uitslag aan vrienden'); kn.type = 'button'; kn.id = 'uitslag-' + r.rid;
      kn.disabled = !g;
      kn.setAttribute('aria-describedby', hulp.id);
      tweestaps(kn, 'Toon uitslag aan vrienden', 'Zeker? Cijfer delen', async () => {
        kn.disabled = true;
        try {
          const res = await L.deelUitslag(st, r.rid, galerij);
          if (res.kaarten) { vriendKaarten = res.kaarten; opgehaald = true; }
          melding(`Uitslag gedeeld met ${lijstTekst(namen)}.`);
        } catch (e) {
          melding(r.uitslagGedeeld ? `De uitslag staat klaar, maar versturen mislukte: ${foutTekst(e)} Druk op Synchroniseren om het opnieuw te proberen.` : foutTekst(e), true);
        }
        renderAlles();
        $('ronde-' + r.rid)?.focus();
      });
      acties.append(kn);
    }
    const stop = el('button', 'knop gevaar klein', klaar ? 'Ronde verwijderen' : 'Ronde stoppen'); stop.type = 'button';
    stop.setAttribute('aria-describedby', h.id); // welke ronde, zonder de zichtbare tekst ('Zeker weten?') te overschrijven
    tweestaps(stop, klaar ? 'Ronde verwijderen' : 'Ronde stoppen', 'Zeker weten?', async () => {
      const ids = L.stopRonde(st, r.rid);
      try { await bewaar(); await L.zetBlobs(st, ids, galerij); melding('Ronde gestopt. Vrienden zien hem niet meer.'); }
      catch (e) { melding(`De ronde is gestopt, maar versturen mislukte: ${foutTekst(e)} Druk op Synchroniseren om het opnieuw te proberen.`, true); }
      renderAlles();
      $('ro-kop').focus();
    });
    acties.append(stop);
    li.append(acties);
    return li;
  }

  function renderVoorspel() {
    const actief = actieveVrienden();
    $('raden-sectie').hidden = !actief.length;
    if (!actief.length) return;
    const opengemaakt = new Set(galerij.map((e) => e.id));
    const metRonde = new Set(st.raden.map((r) => r.sig));
    const lijst = dicht.filter((d) => !opengemaakt.has(d.id));
    if (raadForm && !lijst.some((d) => d.id === raadForm.sig)) raadForm = null;
    $('geen-dicht').hidden = lijst.length > 0;
    $('dicht').replaceChildren(...lijst.map((d) => dichtItem(d, metRonde.has(d.id), actief)));
    const perId = new Map(actief.map((v) => [v.id, v]));
    const rondes = st.raden.map((r) => ({ r, vr: r.naar.map((id) => perId.get(id)).filter(Boolean) })).filter((x) => x.vr.length);
    $('geen-rondes').hidden = rondes.length > 0;
    $('rondes').replaceChildren(...rondes.map((x) => rondeItem(x.r, x.vr)));
  }

  // ---- reacties van vrienden op mijn eigen kaarten ----
  function renderReacties() {
    $('reacties-sectie').hidden = !actieveVrienden().length;
    const lijst = L.reactiesOpMijnKaarten(st, galerij, vriendKaarten);
    $('geen-reacties').hidden = lijst.length > 0;
    $('reacties').replaceChildren(...lijst.map(({ kaart, reacties }) => {
      const li = el('li', 'rkaart t' + Math.max(0, Math.min(4, kaart.tier | 0)));
      li.append(el('span', 'cj', fmt(kaart.cijfer)));
      const info = el('div', 'r-info');
      info.append(el('span', 'vk', kaart.vak || ''));
      if (kaart.onderwerp) info.append(el('span', 'on', kaart.onderwerp));
      li.append(info);
      const ul = el('ul', 'r-lijst');
      for (const r of reacties) {
        const x = el('li', 'reactie');
        const em = el('span', 'r-emoji', r.emoji);
        const info2 = L.REACTIES.find((y) => y.emoji === r.emoji);
        em.setAttribute('role', 'img'); em.setAttribute('aria-label', info2 ? info2.naam : 'reactie');
        x.append(el('span', 'r-naam', r.naam), em);
        ul.append(x);
      }
      li.append(ul);
      return li;
    }));
  }

  // Kleine getalletjes op de tabs: aantal vrienden, openstaande verzoeken en dingen waar jij iets mee moet.
  function renderTellers() {
    const n = (id, aantal) => { $(id).hidden = !aantal; $(id).textContent = String(aantal); };
    n('n-vrienden', actieveVrienden().length);
    n('n-toevoegen', st.vrienden.filter((v) => v.status === 'ontvangen').length);
    let todo = uitdagingen.size;
    for (const v of actieveVrienden()) { const g = vriendKaarten[v.id]; for (const r of (g && g.raden) || []) if (!r.uitslag && L.eigen(L.eigen(st.gokken, v.id), r.rid) === undefined) todo++; }
    n('n-uitdagingen', todo);
  }

  // ---- onderdelen (tabs) ----
  const SECTIES = ['vrienden', 'kaarten', 'uitdagingen', 'toevoegen'];
  function toonSectie(naam, focus) {
    if (!SECTIES.includes(naam)) naam = 'vrienden';
    for (const s of SECTIES) {
      const knop = $('stab-' + s), actief = s === naam;
      knop.setAttribute('aria-selected', String(actief)); knop.tabIndex = actief ? 0 : -1;
      $('sec-' + s).hidden = !actief;
    }
    $('kop-toevoegen').classList.toggle('verberg', naam === 'toevoegen');
    const balk = $('subtabs'), k = $('stab-' + naam); // het gekozen onderdeel blijft in beeld op een smal scherm
    balk.scrollLeft = Math.max(0, k.offsetLeft - 12);
    if (focus) k.focus();
    try { sessionStorage.setItem('spo_vrienden_sec', naam); } catch (e) { /* niet erg */ }
  }
  $('subtabs').addEventListener('click', (e) => { const k = e.target.closest('[data-sec]'); if (k) toonSectie(k.dataset.sec); });
  $('subtabs').addEventListener('keydown', (e) => {
    const i = SECTIES.findIndex((s) => $('stab-' + s).getAttribute('aria-selected') === 'true');
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % SECTIES.length; else if (e.key === 'ArrowLeft') n = (i + SECTIES.length - 1) % SECTIES.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = SECTIES.length - 1;
    if (n < 0) return;
    e.preventDefault(); toonSectie(SECTIES[n], true);
  });
  // Knoppen in een lege toestand ("Vriend toevoegen") brengen je naar de juiste tab.
  document.addEventListener('click', (e) => { const k = e.target.closest('button[data-sec]'); if (k && !k.closest('#subtabs')) { toonSectie(k.dataset.sec); $('sec-' + k.dataset.sec).focus(); } });

  // Tekent alles opnieuw en houdt de focus (en de cursor in een invoerveld) op hetzelfde element.
  let uitstel = null;
  function renderAlles() {
    // Wacht een knop op 'Zeker weten?', dan tekenen we even niet opnieuw: anders verdwijnt de bevestiging door een live-update.
    if (st && document.querySelector('#app .knop.zeker')) { clearTimeout(uitstel); uitstel = setTimeout(renderAlles, 1000); return; }
    const a = document.activeElement;
    const sleutel = a && a.id && $('app').contains(a) ? a.id : null;
    const cursor = sleutel && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    renderVerzoeken(); renderVoorspel(); renderReacties(); renderVrienden(); renderKaartenVanVrienden(); renderUitdagingenTab(); renderTellers();
    const n = sleutel && document.getElementById(sleutel);
    if (n && n !== document.activeElement) { n.focus(); try { if (cursor) n.setSelectionRange(cursor[0], cursor[1]); } catch (e) { /* geen tekstveld */ } }
  }

  // Wijziging in delen: kort wachten en dan alleen deze vriend bijwerken.
  function planPut(v) {
    clearTimeout(timers.get(v.id));
    timers.set(v.id, setTimeout(async () => {
      try { await bewaar(); await L.zetBlob(st, v, galerij); $('sync-status').textContent = 'Delen bijgewerkt om ' + tijd(Date.now()) + '.'; }
      catch (e) { melding(foutTekst(e), true); }
    }, 500));
  }

  // Handmatig synchroniseren (de knop): altijd een volledige ronde. Het automatische synchroniseren doet `live` elke seconde.
  async function sync(stil) {
    if (bezig) return;
    bezig = true; $('sync').disabled = true; $('sync-status').textContent = 'Bezig met synchroniseren...';
    try {
      galerij = await L.leesGalerij();
      dicht = await L.leesDicht();
      gevechten = await L.leesGevechten();
      const r = await L.synchroniseer(st, galerij);
      vriendKaarten = r.kaarten; opgehaald = true;
      [...new Set(r.meldingen)].forEach((m) => melding(m));
      zetStatus(true);
      renderAlles();
    } catch (e) {
      $('sync-status').textContent = e.verbannen ? e.message : 'Synchroniseren mislukt.';
      if (e.verbannen) { if (!banGemeld) { banGemeld = true; melding(e.message, true); } }
      else if (e.status === 401) melding('Je account is niet meer geldig op de server. Wis alles en zet de functie opnieuw aan.', true);
      else melding(foutTekst(e), true);
    } finally { bezig = false; $('sync').disabled = false; }
  }
  function zetStatus(ok) { $('stip').className = 'stip ' + (ok ? 'aan' : 'uit'); $('sync-status').textContent = ok ? 'Live. Laatst bijgewerkt om ' + tijd(Date.now()) + '.' : 'Verbinding haperde, ik probeer het opnieuw.'; }
  // Elke seconde, alleen zolang de pagina zichtbaar is (zie vriendenlib maakLive).
  function startLive() {
    if (live) return;
    live = L.maakLive({
      st: () => st, galerij: () => galerij,
      herlaad: async () => { const n = await L.laad(); if (n) { st = n; galerij = await L.leesGalerij(); gevechten = await L.leesGevechten(); renderAlles(); } return st; },
      bij(g) {
        if (!st) return;
        // Alleen opnieuw tekenen als er echt iets veranderd is: anders raak je wat je net intikte kwijt.
        const handtekening = () => JSON.stringify([vriendKaarten, st.vrienden.map((v) => [v.id, v.status, v.alias])]);
        const voor = handtekening();
        if (g.type === 'sync') {
          vriendKaarten = g.kaarten; opgehaald = true;
          [...new Set(g.meldingen)].forEach((m) => melding(m));
          if (handtekening() !== voor) renderAlles();
        } else if (g.type === 'kaarten') {
          for (const id of Object.keys(g.kaarten)) vriendKaarten[id] = g.kaarten[id];
          if (handtekening() !== voor) renderAlles();
        } else if (g.type === 'berichten') {
          if (g.berichten.some((b) => b.m.t === 'uitnodiging' && b.leeftijd < 300)) { uitdagingen.add(g.van); melding(`${L.naam(st.vrienden.find((v) => v.id === g.van) || { id: g.van })} daagt je uit voor een gevecht. Open Team om te accepteren.`); renderAlles(); }
        } else if (g.type === 'ok') { if (!bezig) zetStatus(true); }
        else if (g.type === 'fout') {
          if (g.fout.verbannen) { $('sync-status').textContent = g.fout.message; if (!banGemeld) { banGemeld = true; melding(g.fout.message, true); } }
          else if (g.fout.status === 401) { $('sync-status').textContent = 'Je account is niet meer geldig.'; live.stop(); }
          else { $('sync-status').textContent = 'Verbinding haperde, ik probeer het opnieuw.'; $('stip').className = 'stip uit'; }
        }
      },
    });
    live.start();
  }

  function toonApp() {
    $('uitleg').hidden = true; $('app').hidden = false; $('kop-toevoegen').hidden = false;
    toonCode();
    $('server-tekst').textContent = st.server || '';
    let s = 'vrienden'; try { s = sessionStorage.getItem('spo_vrienden_sec') || s; } catch (e) { /* niet erg */ }
    toonSectie(s);
  }

  async function init() {
    const standaard = new URLSearchParams(location.search).get('server') || L.STANDAARD_SERVER;
    $('server').value = standaard;
    st = await L.laad();
    galerij = await L.leesGalerij();
    dicht = await L.leesDicht();
    // Een cijfer wordt geopend (galerij) of er komt een nieuw cijfer bij (dicht): het scherm volgt zonder opnieuw te synchroniseren.
    L.opOpslagWijziging(async () => {
      try { galerij = await L.leesGalerij(); dicht = await L.leesDicht(); gevechten = await L.leesGevechten(); if (st) renderAlles(); } catch (e) { /* pagina blijft zoals hij was */ }
    });
    if (!st) { $('uitleg').hidden = false; return; }
    toonApp(); renderAlles();
    gevechten = await L.leesGevechten();
    await sync();
    startLive();
  }

  $('aanzetten').addEventListener('click', async () => {
    const knop = $('aanzetten');
    knop.disabled = true;
    try {
      st = await L.aanzetten($('server').value.trim() || L.STANDAARD_SERVER);
      toonApp(); renderAlles(); melding('Vriendenfunctie staat aan.');
      $('sync').focus();
      await sync(true);
      startLive();
    } catch (e) { melding(foutTekst(e), true); }
    knop.disabled = false;
  });

  $('sync').addEventListener('click', () => { if (live) live.vergeet(); sync(); });

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
    if (live) { live.stop(); await live.klaar(); }
    try {
      await L.verwijderAccount(st);
    } catch (e) {
      if (e.status !== 401) { melding(foutTekst(e), true); return; }
      await L.wis('spo_vrienden'); // account bestond al niet meer op de server
    }
    if (live) { live.stop(); live = null; }
    st = null; vriendKaarten = {}; opgehaald = false; raadForm = null; concept.clear();
    $('app').hidden = true; $('uitleg').hidden = false; $('meer').open = false; $('kop-toevoegen').hidden = true;
    melding('Je account en al je gedeelde gegevens zijn gewist.');
    $('aanzetten').focus();
  });

  init().catch((e) => melding(foutTekst(e), true));
})();
