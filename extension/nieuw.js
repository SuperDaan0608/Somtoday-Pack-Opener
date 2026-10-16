/*
 * Somtoday Pack Opener v3.0: "Wat is nieuw" (in hub.html) en het gedeelde venstertje voor ook de feedbackknop (feedback.js).
 *
 * De teksten staan in nieuw-data.js (window.SPONieuwData, in de extensie zelf; geen netwerk).
 * Opslag (chrome.storage.local): spo_nieuw_gezien = het versienummer waarbij je Wat is nieuw het laatst zag, bijv. '2.4.4'.
 *   - Geen waarde (verse installatie): niets tonen, geen bolletje, en de huidige versie onthouden (de rondleiding doet het welkom al).
 *   - Wel een oudere versie dan het manifest (je hebt geüpdatet): het bolletje bij de knop, en bij het eerste openen van het paneel
 *     komt het venster één keer vanzelf, met alleen de nieuwe versies. Na sluiten wordt de versie onthouden.
 *   - Het staat ook in de back-up van je account (account.js; de hoogste versie wint).
 * Gebruik: SPONieuw.open() (altijd, met alle versies), SPONieuw.autostart() (één keer per paginalading).
 * SPOVenster.maak(...) is het gedeelde venster: role=dialog, focus-val, Esc sluit, focus gaat terug naar waar je was.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const SLEUTEL = 'spo_nieuw_gezien';

  // ───── Versies vergelijken (numeriek: 2.10.0 is nieuwer dan 2.9.0) ─────
  const delen = (v) => String(v == null ? '' : v).replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  function vergelijk(a, b) {
    const x = delen(a), y = delen(b);
    for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  const geldigeVersie = (v) => typeof v === 'string' && /^\d+(\.\d+){1,2}$/.test(v);

  // Wat moet er gebeuren met deze opgeslagen versie en deze huidige versie?
  //   { soort: 'vers' }                    nog niets opgeslagen: huidige versie onthouden, niets tonen
  //   { soort: 'niets' }                   al bij
  //   { soort: 'nieuw', lijst: [...] }     nieuwe versies (nieuwer dan gezien en hoogstens de huidige), nieuwste eerst
  function bepaal(gezien, huidig, data) {
    if (!geldigeVersie(gezien)) return { soort: 'vers' };
    if (!geldigeVersie(huidig) || vergelijk(gezien, huidig) >= 0) return { soort: 'niets' };
    const lijst = (data || []).filter((v) => vergelijk(v.versie, gezien) > 0 && vergelijk(v.versie, huidig) <= 0);
    lijst.sort((a, b) => vergelijk(b.versie, a.versie));
    return { soort: 'nieuw', lijst };
  }

  // 'jjjj-mm-dd' -> '9 oktober 2026'. Leeg of ongeldig geeft '' (dan laten we de datum weg).
  function datumTekst(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
    if (!m) return '';
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (isNaN(t.getTime()) || t.getUTCMonth() !== +m[2] - 1) return '';
    try { return t.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return m[3] + '-' + m[2] + '-' + m[1]; }
  }

  const maak = (tag, klas, tekst) => {
    const el = document.createElement(tag);
    if (klas) el.className = klas;
    if (tekst != null) el.textContent = tekst;
    return el;
  };

  // ───── Gedeeld venster ─────
  let openVenster = null;
  const FOCUSBAAR = 'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

  // opties: { klas, titel, onderdeel (id voor aria), onSluit }. Geeft { kaart, kop, inhoud, voet, sluit } of null als er al een venster open is.
  function maakVenster(o) {
    if (openVenster) return null;
    const hubEl = document.getElementById('hub');
    const terugFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = 'nv-' + (o.onderdeel || 'venster');
    const wortel = maak('div', 'nv ' + (o.klas || ''));
    const kaart = maak('div', 'nv-kaart');
    kaart.setAttribute('role', 'dialog');
    kaart.setAttribute('aria-modal', 'true');
    kaart.setAttribute('aria-labelledby', id + '-titel');
    kaart.tabIndex = -1;
    const kop = maak('div', 'nv-kop');
    const titel = maak('h2', '', o.titel);
    titel.id = id + '-titel';
    const dicht = maak('button', 'nv-x');
    dicht.type = 'button';
    dicht.setAttribute('aria-label', 'Sluiten');
    dicht.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-sluiten"/></svg>';
    kop.append(titel, dicht);
    const inhoud = maak('div', 'nv-inhoud');
    const voet = maak('div', 'nv-voet');
    kaart.append(kop, inhoud, voet);
    wortel.append(kaart);
    document.body.append(wortel);
    if (hubEl) hubEl.inert = true;

    let dichtGedaan = false;
    function sluit() {
      if (dichtGedaan) return;
      dichtGedaan = true;
      openVenster = null;
      document.removeEventListener('keydown', toets, true);
      wortel.remove();
      if (hubEl) hubEl.inert = false;
      try { if (o.onSluit) o.onSluit(); } catch (e) { /* de pagina gaat door */ }
      const fok = terugFocus && terugFocus !== document.body && terugFocus.isConnected && !terugFocus.closest('[hidden]') ? terugFocus : document.getElementById('b-nieuw');
      if (fok) fok.focus({ preventScroll: true });
    }
    function toets(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        sluit();
      } else if (e.key === 'Tab') {
        const lijst = Array.from(kaart.querySelectorAll(FOCUSBAAR)).filter((b) => b.getClientRects().length);
        if (!lijst.length) { e.preventDefault(); kaart.focus(); return; }
        const eerste = lijst[0], laatste = lijst[lijst.length - 1];
        const nu = document.activeElement;
        if (!kaart.contains(nu) || nu === kaart) { e.preventDefault(); (e.shiftKey ? laatste : eerste).focus(); }
        else if (e.shiftKey && nu === eerste) { e.preventDefault(); laatste.focus(); }
        else if (!e.shiftKey && nu === laatste) { e.preventDefault(); eerste.focus(); }
      }
    }
    dicht.addEventListener('click', sluit);
    wortel.addEventListener('mousedown', (e) => { if (e.target === wortel) sluit(); });
    document.addEventListener('keydown', toets, true);
    openVenster = { sluit };
    return { kaart, kop, inhoud, voet, sluit, wortel };
  }
  const venster = { maak: maakVenster, isOpen: () => !!openVenster, sluitAlles: () => { if (openVenster) openVenster.sluit(); } };

  // ───── Opslag ─────
  async function leesGezien() {
    try { return (await chrome.storage.local.get(SLEUTEL))[SLEUTEL]; } catch (e) { return null; }
  }
  function bewaarGezien(v) {
    try { return Promise.resolve(chrome.storage.local.set({ [SLEUTEL]: v })).catch(() => {}); } catch (e) { return Promise.resolve(); }
  }
  function huidigeVersie() {
    try { return chrome.runtime.getManifest().version; } catch (e) { return ''; }
  }
  const data = () => (Array.isArray(globalThis.SPONieuwData) ? globalThis.SPONieuwData : []);

  // ───── Het bolletje bij de knop ─────
  let bolStand = false;
  function zetBol(aan) {
    bolStand = !!aan;
    const bol = document.getElementById('nieuw-bol');
    const sr = document.getElementById('nieuw-sr');
    if (bol) bol.hidden = !aan;
    if (sr) sr.textContent = aan ? ' (er is iets nieuws)' : '';
  }
  async function ververBol() {
    const huidig = huidigeVersie();
    const gezien = await leesGezien();
    const b = bepaal(gezien, huidig, data());
    zetBol(b.soort === 'nieuw' && b.lijst.length > 0);
    return b;
  }

  // ───── Het venster zelf ─────
  function tekenVersie(v, nieuw) {
    const art = maak('section', 'nv-versie' + (nieuw ? ' is-nieuw' : ''));
    const kop = maak('h3');
    kop.append(maak('span', 'nv-nr', 'Versie ' + v.versie));
    if (v.titel) kop.append(maak('span', 'nv-vtitel', v.titel));
    if (nieuw) kop.append(maak('span', 'nv-tag', 'Nieuw'));
    art.append(kop);
    const dt = datumTekst(v.datum);
    if (dt) art.append(maak('p', 'nv-datum', dt));
    const ul = maak('ul', 'nv-punten');
    for (const p of (v.punten || []).slice(0, 6)) ul.append(maak('li', '', p));
    art.append(ul);
    return art;
  }

  async function open(opties) {
    const auto = !!(opties && opties.auto);
    if (openVenster) return;
    const huidig = huidigeVersie();
    const gezien = await leesGezien();
    const alles = data().slice().sort((a, b) => vergelijk(b.versie, a.versie));
    const b = bepaal(gezien, huidig, alles);
    const nieuweIds = new Set(b.soort === 'nieuw' ? b.lijst.map((v) => v.versie) : []);
    const lijst = auto && b.soort === 'nieuw' ? b.lijst : alles;
    const v = maakVenster({
      klas: 'nv-nieuw', onderdeel: 'nieuw', titel: 'Wat is nieuw',
      onSluit() {
        zetBol(false);
        if (geldigeVersie(huidig)) bewaarGezien(huidig);
      },
    });
    if (!v) return;
    const intro = maak('p', 'nv-intro', auto ? 'Je hebt de Pack Opener geüpdatet. Dit is er veranderd sinds de vorige keer.' : 'Dit is er veranderd, per versie. De nieuwste staat bovenaan.');
    v.inhoud.append(intro);
    if (!lijst.length) v.inhoud.append(maak('p', 'nv-leeg', 'Er is nog niets om te laten zien.'));
    for (const e of lijst) v.inhoud.append(tekenVersie(e, nieuweIds.has(e.versie)));
    const klaar = maak('button', 'knop goud', 'Sluiten');
    klaar.type = 'button';
    klaar.addEventListener('click', v.sluit);
    v.voet.append(klaar);
    zetBol(false);
    klaar.focus({ preventScroll: true });
  }

  // ───── Automatisch, één keer ─────
  let autoGestart = false;
  async function autostart() {
    if (autoGestart) return;
    autoGestart = true;
    const huidig = huidigeVersie();
    if (!geldigeVersie(huidig)) return;
    try {
      const gezien = await leesGezien();
      const b = bepaal(gezien, huidig, data());
      if (b.soort === 'vers') { await bewaarGezien(huidig); zetBol(false); return; }
      if (b.soort === 'niets') { zetBol(false); return; }
      if (!b.lijst.length) { await bewaarGezien(huidig); zetBol(false); return; } // geen tekst voor deze versie: stil bijwerken
      zetBol(true);
      // Pas na het inloggen (tot dan staat het inlogscherm over het paneel) en niet boven de rondleiding of een ander venster.
      const A = globalThis.SPOAccount;
      if (!A || !(await A.status()).ingelogd) return;
      if (openVenster || document.querySelector('.rl')) return;
      open({ auto: true });
    } catch (e) { /* geen opslag: niet zeuren */ }
  }

  function start() {
    const knop = document.getElementById('b-nieuw');
    if (knop) knop.addEventListener('click', () => open());
    try {
      chrome.storage.onChanged.addListener((w, gebied) => {
        if (gebied === 'local' && w[SLEUTEL] && !openVenster) ververBol();
      });
    } catch (e) { /* geen opslag */ }
    if (window.SPOHub && window.SPOHub.klaar) autostart();
    else document.addEventListener('spo-hub-klaar', autostart, { once: true });
  }

  const SPONieuw = { open, autostart, bepaal, vergelijk, datumTekst, geldigeVersie, SLEUTEL, bol: () => bolStand };
  globalThis.SPONieuw = SPONieuw;
  globalThis.SPOVenster = venster;
  if (typeof module !== 'undefined' && module.exports) module.exports = SPONieuw;
  if (typeof document !== 'undefined' && document.getElementById && !globalThis.__SPO_TEST_ZONDER_START) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
