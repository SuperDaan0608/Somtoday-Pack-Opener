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
      sel.id = 'deel-' + v.id; sel.value = d.modus; lab.append(sel); wrap.append(lab);
      li.append(wrap);

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
      li.append(lijst);
      sel.addEventListener('change', () => { d.modus = sel.value; lijst.hidden = d.modus !== 'selectie'; planPut(v); });

      const gek = vriendKaarten[v.id];
      const raad = raadBlok(v, naam, gek);
      if (raad) li.append(raad);
      const kop2 = el('h4', '', `Cijfers van ${naam}`);
      kop2.style.cssText = 'margin:6px 0 8px;font-size:14px';
      li.append(kop2);
      if (gek && gek.kaarten.length) {
        li.append(el('p', 'uitleg', `Reageer met één emoji. ${naam} ziet je reactie. Klik nogmaals op dezelfde emoji om je reactie weg te halen.`));
        const ul = el('ul', 'v-cijfers');
        gek.kaarten.slice().sort((a, b) => b.ts - a.ts).forEach((k) => ul.append(kaartje(k, v, naam)));
        li.append(ul);
      } else li.append(el('p', 'geen', gek ? `${naam} deelt op dit moment geen kaarten met jou.` : 'Nog niet opgehaald. Druk op Synchroniseren.'));
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

  // Tekent alles opnieuw en houdt de focus (en de cursor in een invoerveld) op hetzelfde element.
  function renderAlles() {
    const a = document.activeElement;
    const sleutel = a && a.id && $('app').contains(a) ? a.id : null;
    const cursor = sleutel && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    renderVerzoeken(); renderVoorspel(); renderReacties(); renderVrienden();
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

  async function sync(stil) {
    if (bezig) return;
    bezig = true; $('sync').disabled = true; $('sync-status').textContent = 'Bezig met synchroniseren...';
    try {
      galerij = await L.leesGalerij();
      dicht = await L.leesDicht();
      const r = await L.synchroniseer(st, galerij);
      vriendKaarten = r.kaarten; opgehaald = true;
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
    dicht = await L.leesDicht();
    // Een cijfer wordt geopend (galerij) of er komt een nieuw cijfer bij (dicht): het scherm volgt zonder opnieuw te synchroniseren.
    L.opOpslagWijziging(async () => {
      try { galerij = await L.leesGalerij(); dicht = await L.leesDicht(); if (st) renderAlles(); } catch (e) { /* pagina blijft zoals hij was */ }
    });
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
    st = null; vriendKaarten = {}; opgehaald = false; raadForm = null; concept.clear();
    $('app').hidden = true; $('uitleg').hidden = false;
    melding('Je account en al je gedeelde gegevens zijn gewist.');
    $('aanzetten').focus();
  });

  init().catch((e) => melding(foutTekst(e), true));
})();
