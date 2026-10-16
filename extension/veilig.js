/*
 * Somtoday Pack Opener v3.0: veiligheid in Vrienden. Drie vensters:
 *  - blokkeerVenster: iemand blokkeren (met uitleg en bevestiging);
 *  - meldVenster: iemand melden bij de beheerder (reden, uitleg en een voorbeeld van het bewijs dat meegaat);
 *  - waarschuwingVenster: een waarschuwing van de beheerder die je niet kunt missen (blijft staan tot je op Begrepen drukt).
 * De server ziet nooit inhoud van je kaarten. Een melding is wel leesbaar voor de beheerder (zie de uitleg in het venster).
 * Alles wat de gebruiker typt gaat door het tekstfilter (SPOTekst); het bewijs wordt NIET getypt maar door de app gehaald uit wat
 * de client van die persoon al ontsleuteld had (vriendenlib.js: bewijsTekst).
 */
(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const T = globalThis.SPOTekst;
  if (!L) return;

  function el(tag, klas, tekst) {
    const e = document.createElement(tag);
    if (klas) e.className = klas;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
  }
  const hoofd = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1); // 'deze persoon' aan het begin van een zin
  const FOCUSBAAR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  // Houdt Tab binnen het venster (showModal doet dit ook, dit is de zekerheid erbovenop, bijvoorbeeld in een paneel met een iframe).
  function houdFocusVast(dlg) {
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const lijst = [...dlg.querySelectorAll(FOCUSBAAR)].filter((x) => !x.hidden && x.offsetParent !== null);
      if (!lijst.length) { e.preventDefault(); return; }
      const eerste = lijst[0], laatste = lijst[lijst.length - 1];
      if (e.shiftKey && (document.activeElement === eerste || !dlg.contains(document.activeElement))) { e.preventDefault(); laatste.focus(); }
      else if (!e.shiftKey && (document.activeElement === laatste || !dlg.contains(document.activeElement))) { e.preventDefault(); eerste.focus(); }
    });
  }
  function toon(dlg, focus, terugNaar) {
    document.body.append(dlg);
    houdFocusVast(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); if (terugNaar && terugNaar.isConnected) { try { terugNaar.focus(); } catch (e) { /* weg */ } } });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (focus) focus.focus();
  }
  function maakVenster(id, titel, klas) {
    const oud = document.getElementById(id);
    if (oud) oud.remove();
    const dlg = el('dialog', 'veilig-venster' + (klas ? ' ' + klas : '')); dlg.id = id;
    const kop = el('h2', '', titel); kop.id = id + '-titel';
    dlg.setAttribute('aria-labelledby', kop.id);
    dlg.append(kop);
    return { dlg, kop };
  }

  // ---- blokkeren ----
  // c: { st, id, naam, melding(tekst, fout), na() }
  function blokkeerVenster(c) {
    const terug = document.activeElement;
    const { dlg } = maakVenster('blokkeer-venster', `${hoofd(c.naam)} blokkeren?`);
    dlg.append(el('p', 'bv-uitleg', 'Jullie zijn dan geen vrienden meer en deze persoon kan je niet meer toevoegen.'));
    dlg.append(el('p', 'uitleg', 'Wat jullie deelden wordt weggehaald, op de server en op dit apparaat. Deze persoon krijgt geen bericht. Je kunt hem of haar later weer deblokkeren bij ‘Geblokkeerd’.'));
    const status = el('p', 'bv-status', ''); status.setAttribute('role', 'alert');
    const acties = el('div', 'acties');
    const ja = el('button', 'knop gevaar', 'Blokkeer'); ja.type = 'button'; ja.id = 'blokkeer-bevestig';
    const nee = el('button', 'knop', 'Annuleren'); nee.type = 'button'; nee.id = 'blokkeer-annuleer';
    nee.addEventListener('click', () => dlg.close());
    ja.addEventListener('click', async () => {
      ja.disabled = true; nee.disabled = true; status.textContent = 'Bezig...';
      try {
        await L.blokkeer(c.st, c.id);
        dlg.close();
        c.melding(`${hoofd(c.naam)} is geblokkeerd.`);
        if (c.na) await c.na();
      } catch (e) {
        status.textContent = (e && e.message ? e.message : 'Blokkeren is niet gelukt.') + ' Probeer het later opnieuw.';
        ja.disabled = false; nee.disabled = false;
      }
    });
    acties.append(ja, nee);
    dlg.append(status, acties);
    toon(dlg, nee, terug);
    return dlg;
  }

  // ---- melden ----
  // c: { st, id, naam, vriend (true = een vriend, false = een binnenkomend verzoek), melding(tekst, fout), na() }
  function meldVenster(c) {
    const terug = document.activeElement;
    const { dlg } = maakVenster('meld-venster', `${hoofd(c.naam)} melden`);
    dlg.append(el('p', 'bv-uitleg', 'Meld iemand die zich niet netjes gedraagt. Alleen de beheerder ziet je melding. De andere persoon hoort er niets van.'));
    const form = el('form', 'mv-form'); form.noValidate = true;

    const labR = el('label', 'veld'); labR.append(el('span', '', 'Reden'));
    const sel = el('select'); sel.id = 'meld-reden';
    for (const [w, t] of L.MELD_REDENEN) { const o = el('option', '', t); o.value = w; sel.append(o); }
    labR.append(sel);

    const labU = el('label', 'veld'); labU.append(el('span', '', 'Uitleg (niet verplicht, hoogstens 300 tekens)'));
    const uitleg = el('textarea'); uitleg.id = 'meld-uitleg'; uitleg.rows = 3; uitleg.maxLength = 300; uitleg.dataset.tekstfilter = 'tekst';
    uitleg.setAttribute('aria-describedby', 'meld-teller');
    labU.append(uitleg);
    const teller = el('p', 'uitleg mv-teller', '0 van 300 tekens'); teller.id = 'meld-teller';
    if (T) T.koppel(uitleg, { soort: 'tekst', max: 300 }); // streng filter: ook deze uitleg gaat erdoor
    uitleg.addEventListener('input', () => { teller.textContent = `${[...uitleg.value].length} van 300 tekens`; });

    // Wat we meesturen
    const wat = el('fieldset', 'mv-wat');
    wat.append(el('legend', '', 'Wat we meesturen'));
    wat.append(el('p', 'uitleg', 'Altijd: jouw id, het id van deze persoon (dus geen namen), de reden en je uitleg. De beheerder kan dit lezen; het is niet versleuteld. Je cijfers en kaarten gaan nooit mee.'));
    const voorbeeld = el('div', 'mv-voorbeeld'); voorbeeld.id = 'meld-voorbeeld';
    voorbeeld.setAttribute('role', 'group'); voorbeeld.setAttribute('aria-label', 'Voorbeeld van het bewijs dat wordt meegestuurd');
    const geen = el('p', 'uitleg', 'Er is geen tekst van deze persoon om mee te sturen. Je melding gaat dan alleen met je reden en je uitleg.'); geen.id = 'meld-geen-bewijs';
    const labV = el('label', 'bevestig');
    const vink = el('input'); vink.type = 'checkbox'; vink.id = 'meld-bewijs-vink'; vink.checked = true;
    labV.append(vink, el('span', '', 'Stuur deze tekst mee als bewijs'));
    const toonKnop = el('button', 'knop klein', 'Toon verborgen regels'); toonKnop.type = 'button'; toonKnop.id = 'meld-toon'; toonKnop.hidden = true;
    toonKnop.setAttribute('aria-pressed', 'false');
    wat.append(el('p', 'mv-vb-kop', 'Dit is precies de tekst die we meesturen:'), voorbeeld, geen, toonKnop, labV);

    let bewijs = '';
    let verborgenToon = false;
    function tekenVoorbeeld() {
      bewijs = c.vriend ? L.bewijsTekst(c.id, sel.value) : '';
      voorbeeld.replaceChildren();
      let verborgen = 0;
      for (const regel of bewijs ? bewijs.split('\n') : []) {
        const r = el('div', 'mv-regel');
        r.textContent = regel; // precies de tekst die wordt meegestuurd
        // Past de regel niet door het filter, dan staat hij onscherp tot jij kiest hem te tonen (de tekst wordt wel meegestuurd).
        if (T && T.toon(regel) !== regel) {
          verborgen++;
          r.classList.add('verborgen');
          r.setAttribute('aria-label', 'Verborgen regel, wordt wel meegestuurd');
          if (!verborgenToon) r.setAttribute('aria-hidden', 'true');
          if (verborgenToon) r.classList.add('open');
        }
        voorbeeld.append(r);
      }
      voorbeeld.hidden = !bewijs;
      geen.hidden = !!bewijs;
      labV.hidden = !bewijs;
      toonKnop.hidden = verborgen === 0;
      vink.disabled = !bewijs;
      if (!bewijs) vink.checked = false; else if (!vink.dataset.aangeraakt) vink.checked = true;
    }
    vink.addEventListener('change', () => { vink.dataset.aangeraakt = '1'; });
    toonKnop.addEventListener('click', () => {
      verborgenToon = !verborgenToon;
      toonKnop.setAttribute('aria-pressed', String(verborgenToon));
      toonKnop.textContent = verborgenToon ? 'Verberg regels weer' : 'Toon verborgen regels';
      for (const r of voorbeeld.querySelectorAll('.verborgen')) { r.classList.toggle('open', verborgenToon); if (verborgenToon) r.removeAttribute('aria-hidden'); else r.setAttribute('aria-hidden', 'true'); }
    });
    sel.addEventListener('change', tekenVoorbeeld);
    tekenVoorbeeld();

    const status = el('p', 'bv-status', ''); status.setAttribute('role', 'alert'); status.id = 'meld-status';
    const acties = el('div', 'acties');
    const stuur = el('button', 'knop goud', 'Melding versturen'); stuur.type = 'submit'; stuur.id = 'meld-stuur';
    const nee = el('button', 'knop', 'Annuleren'); nee.type = 'button'; nee.id = 'meld-annuleer';
    nee.addEventListener('click', () => dlg.close());
    acties.append(stuur, nee);
    form.append(labR, labU, teller, wat, status, acties);
    dlg.append(form);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      status.textContent = '';
      if (T && !T.geldig(uitleg, { soort: 'tekst', max: 300 })) { uitleg.focus(); return; }
      stuur.disabled = true; nee.disabled = true; status.textContent = 'Bezig met versturen...';
      try {
        await L.meld(c.st, c.id, sel.value, uitleg.value.trim(), vink.checked && bewijs ? bewijs : '');
        bedankt();
      } catch (e) {
        status.textContent = L.meldFoutTekst(e);
        stuur.disabled = false; nee.disabled = false;
        if (e && (e.status === 429 || e.status === 404)) { stuur.disabled = true; stuur.title = 'Dit kan nu niet'; nee.focus(); }
      }
    });

    function bedankt() {
      form.remove();
      dlg.querySelector('.bv-uitleg').remove();
      const kop = dlg.querySelector('h2'); kop.textContent = 'Bedankt';
      const wrap = el('div', 'mv-bedankt'); wrap.id = 'meld-bedankt'; wrap.setAttribute('role', 'status');
      wrap.append(el('p', 'bv-uitleg', 'Bedankt. De beheerder kijkt ernaar. Wil je deze persoon ook blokkeren?'));
      wrap.append(el('p', 'uitleg', 'Blokkeren kan altijd, ook zonder melding. Jullie zijn dan geen vrienden meer en deze persoon kan je niet meer toevoegen.'));
      const ac = el('div', 'acties');
      const bl = el('button', 'knop gevaar', 'Ja, blokkeer'); bl.type = 'button'; bl.id = 'meld-blokkeer';
      const sl = el('button', 'knop', 'Nee, sluiten'); sl.type = 'button'; sl.id = 'meld-sluit';
      const st2 = el('p', 'bv-status', ''); st2.setAttribute('role', 'alert');
      sl.addEventListener('click', () => dlg.close());
      bl.addEventListener('click', async () => {
        bl.disabled = true; sl.disabled = true; st2.textContent = 'Bezig...';
        try { await L.blokkeer(c.st, c.id); dlg.close(); c.melding(`${hoofd(c.naam)} is geblokkeerd.`); } // bij 'close' tekent de pagina de lijst opnieuw
        catch (e) { st2.textContent = (e && e.message ? e.message : 'Blokkeren is niet gelukt.') + ' Probeer het later opnieuw.'; bl.disabled = false; sl.disabled = false; }
      });
      ac.append(bl, sl);
      wrap.append(st2, ac);
      dlg.append(wrap);
      sl.focus();
      if (c.na) dlg.addEventListener('close', () => { c.na(); }, { once: true });
    }
    toon(dlg, sel, terug);
    return dlg;
  }

  // ---- waarschuwing van de beheerder ----
  let waarschuwingOpen = false;
  const dagtijd = (ts) => { try { return new Date(ts * 1000).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  // c: { st, melding(tekst, fout), na() }. Doet niets als er geen ongelezen waarschuwingen zijn of als het venster al open staat.
  async function waarschuwingVenster(c) {
    if (waarschuwingOpen) return null;
    waarschuwingOpen = true;
    let lijst;
    try { lijst = await L.haalWaarschuwingen(c.st); }
    catch (e) { waarschuwingOpen = false; return null; }
    if (!lijst.length) { waarschuwingOpen = false; return null; }
    const terug = document.activeElement;
    const { dlg } = maakVenster('waarschuwing-venster', 'Waarschuwing van de beheerder', 'waarschuwing');
    dlg.setAttribute('role', 'alertdialog');
    dlg.setAttribute('aria-describedby', 'waarschuwing-tekst');
    const uitleg = el('p', 'bv-uitleg', lijst.length === 1 ? 'De beheerder heeft je een waarschuwing gestuurd.' : `De beheerder heeft je ${lijst.length} waarschuwingen gestuurd.`);
    uitleg.id = 'waarschuwing-tekst';
    dlg.append(uitleg);
    const ul = el('ul', 'wa-lijst');
    for (const w of lijst) {
      const li = el('li', 'wa-item');
      if (w.ts) li.append(el('span', 'wa-tijd', dagtijd(w.ts)));
      li.append(el('p', 'wa-reden', w.reden ? 'Reden: ' + w.reden : 'Er is geen reden opgegeven.'));
      ul.append(li);
    }
    dlg.append(ul);
    dlg.append(el('p', 'uitleg', 'Houd je aan de regels van de Pack Opener: wees aardig tegen anderen en gebruik geen namen of teksten die kwetsen. Gebeurt het vaker, dan kan de beheerder je van de vriendenfunctie weren.'));
    const status = el('p', 'bv-status', ''); status.setAttribute('role', 'alert');
    const ok = el('button', 'knop goud', 'Begrepen'); ok.type = 'button'; ok.id = 'waarschuwing-begrepen';
    ok.addEventListener('click', async () => {
      ok.disabled = true; status.textContent = 'Bezig...';
      try {
        for (const w of lijst) {
          try { await L.waarschuwingGezien(c.st, w.id); }
          catch (e) { if (e.status !== 404) throw e; } // 404: al weg, dan is het goed
        }
      } catch (e) {
        status.textContent = (e && e.message ? e.message : 'Dat lukte niet.') + ' Probeer het nog een keer.';
        ok.disabled = false;
        return;
      }
      dlg.close();
      if (c.na) c.na();
    });
    // Alleen 'Begrepen' sluit dit venster (Escape niet): een waarschuwing mag je niet per ongeluk wegklikken.
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    dlg.addEventListener('close', () => { waarschuwingOpen = false; });
    dlg.append(status, el('div', 'acties'));
    dlg.lastChild.append(ok);
    toon(dlg, ok, terug);
    return dlg;
  }

  globalThis.SPOVeilig = { blokkeerVenster, meldVenster, waarschuwingVenster };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.SPOVeilig;
})();
