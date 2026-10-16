/*
 * Somtoday Pack Opener v3.0: de feedbackknop (in hub.html).
 * Je kiest een soort (Fout melden, Idee, Iets anders), schrijft een tekst (hoogstens 500 tekens, door het strenge tekstfilter) en
 * stuurt dat naar de beheerder via de server-actie `feedback` { soort: 'fout'|'idee'|'anders', tekst (1..500), info (0..300) }.
 * Technische info meesturen kan (standaard aan) en je ziet er precies het voorbeeld van. Er gaat nooit meer weg dan dat voorbeeld:
 *   versie van de extensie, browser (alleen naam en hoofdnummer), besturingssysteem (alleen het type), kwaliteit van de animaties,
 *   WebGL ja/nee en het tabblad waar je was. Geen cijfers, vakken, kaarten, namen, e-mailadres, vrienden of andere persoonlijke gegevens.
 * Het verzoek gaat via de gewone client uit vriendenlib.js (met je vrienden-identiteit als je die hebt, anders zonder).
 * Er wordt niets opgeslagen op deze computer.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const MAX_TEKST = 500;
  const MAX_INFO = 300;
  const SOORTEN = [
    ['fout', 'Fout melden'],
    ['idee', 'Idee'],
    ['anders', 'Iets anders'],
  ];

  const maak = (tag, klas, tekst) => {
    const el = document.createElement(tag);
    if (klas) el.className = klas;
    if (tekst != null) el.textContent = tekst;
    return el;
  };

  // ───── Technische info: alleen deze zes dingen ─────
  function browserVan(ua) {
    ua = String(ua || '');
    let m;
    if ((m = /\bEdg(?:e|A|iOS)?\/(\d+)/.exec(ua))) return 'Edge ' + m[1];
    if ((m = /\bOPR\/(\d+)/.exec(ua))) return 'Opera ' + m[1];
    if ((m = /\b(?:Firefox|FxiOS)\/(\d+)/.exec(ua))) return 'Firefox ' + m[1];
    if ((m = /(?:Chrome|CriOS)\/(\d+)/.exec(ua))) return 'Chrome ' + m[1];
    if ((m = /\bVersion\/(\d+)[^]*Safari\//.exec(ua))) return 'Safari ' + m[1];
    return 'onbekend';
  }
  function systeemVan(ua) {
    ua = String(ua || '');
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Windows/.test(ua)) return 'Windows';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
    if (/Linux|X11/.test(ua)) return 'Linux';
    return 'onbekend';
  }
  function heeftWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }
  // gegevens: { versie, ua, laag, webgl, tab }. Geeft één korte regel, nooit langer dan MAX_INFO.
  function maakInfo(g) {
    const tab = /^[a-z]{3,20}$/.test(String(g.tab || '')) ? g.tab : 'onbekend';
    const versie = /^[0-9][0-9.]{0,15}$/.test(String(g.versie || '')) ? g.versie : 'onbekend';
    return [
      'versie ' + versie,
      'browser ' + browserVan(g.ua),
      'systeem ' + systeemVan(g.ua),
      'animaties ' + (g.laag ? 'lage kwaliteit' : 'hoge kwaliteit'),
      'WebGL ' + (g.webgl ? 'ja' : 'nee'),
      'tabblad ' + tab,
    ].join('; ').slice(0, MAX_INFO);
  }
  async function verzamelInfo() {
    let laag = false, versie = '';
    try { laag = !!((await chrome.storage.local.get('spo_instellingen')).spo_instellingen || {}).laag; } catch (e) { /* standaard */ }
    try { versie = chrome.runtime.getManifest().version; } catch (e) { /* onbekend */ }
    let tab = '';
    try { tab = window.SPOHub ? window.SPOHub.huidig() : ''; } catch (e) { /* onbekend */ }
    return maakInfo({ versie, ua: navigator.userAgent, laag, webgl: heeftWebGL(), tab });
  }

  // ───── Meldingen ─────
  const TE_VEEL = 'Je hebt vandaag al drie keer feedback gestuurd. Probeer het morgen weer.';
  const NIET_NU = 'Feedback versturen kan nu nog niet. Probeer het later opnieuw.';
  const GEEN_VERBINDING = 'Geen verbinding met de server. Controleer je internet en probeer het opnieuw.';
  function foutTekst(e) {
    if (e && e.verbannen) return e.message; // de bestaande ban-tekst
    const s = e && e.status;
    if (s === 429) return TE_VEEL;
    if (s === 0) return GEEN_VERBINDING;
    if (s === 404 || s === 405 || s === 501 || s === 503) return NIET_NU;
    if (s === 400) return /onbekende actie/i.test(String((e && e.message) || '')) ? NIET_NU : 'Deze feedback kan zo niet worden verstuurd. Pas de tekst aan en probeer het opnieuw.';
    return 'Versturen is niet gelukt. Probeer het later opnieuw.';
  }

  // De client uit vriendenlib.js: met je vrienden-identiteit als die er is, anders zonder id en token.
  async function client() {
    const V = globalThis.SPOVrienden;
    if (!V) throw new Error('Feedback versturen kan nu nog niet. Probeer het later opnieuw.');
    let st = null;
    try { st = await V.laad(); } catch (e) { st = null; }
    return st ? V.clientVan(st) : V.maakClient(V.STANDAARD_SERVER);
  }

  // Het verzoek zelf. Los gehouden zodat het te testen is.
  async function stuur(soort, tekst, info) {
    const cl = await client();
    return cl.roep('feedback', { soort, tekst, info: info || '' });
  }

  // ───── Het venster ─────
  async function open() {
    const W = globalThis.SPOVenster;
    if (!W || W.isOpen()) return;
    const info = await verzamelInfo();
    const v = W.maak({ klas: 'nv-feedback', onderdeel: 'feedback', titel: 'Feedback' });
    if (!v) return;

    const uitleg = maak('p', 'nv-intro', 'Alleen de beheerder leest dit. Schrijf geen persoonlijke gegevens.');
    const vorm = maak('form', 'fb-vorm');
    vorm.noValidate = true;
    vorm.autocomplete = 'off';

    const groep = maak('fieldset', 'fb-soort');
    groep.append(maak('legend', '', 'Wat wil je kwijt?'));
    SOORTEN.forEach(([waarde, naam], n) => {
      const l = maak('label', 'fb-chip');
      const r = maak('input');
      r.type = 'radio';
      r.name = 'fb-soort';
      r.value = waarde;
      r.checked = n === 0;
      l.append(r, maak('span', '', naam));
      groep.append(l);
    });

    const tekstLabel = maak('label', 'fb-label', 'Jouw bericht');
    const veld = maak('textarea', 'fb-tekst');
    veld.dataset.tekstfilter = 'tekst';
    veld.id = 'fb-tekst';
    veld.rows = 5;
    veld.placeholder = 'Wat ging er mis, of wat zou je graag willen?';
    tekstLabel.htmlFor = 'fb-tekst';
    const teller = maak('p', 'fb-teller', '0 / ' + MAX_TEKST);
    teller.setAttribute('aria-hidden', 'true');

    const vinkRij = maak('label', 'fb-vink');
    const vink = maak('input');
    vink.type = 'checkbox';
    vink.checked = true;
    vinkRij.append(vink, maak('span', '', 'Stuur technische info mee'));
    const voorbeeld = maak('p', 'fb-info');
    voorbeeld.setAttribute('aria-live', 'polite');

    const fout = maak('p', 'fb-fout');
    fout.setAttribute('role', 'alert');

    vorm.append(groep, tekstLabel, veld, teller, vinkRij, voorbeeld, fout);
    v.inhoud.append(uitleg, vorm);

    const zetVoorbeeld = () => {
      voorbeeld.replaceChildren();
      if (vink.checked) voorbeeld.append('Dit sturen we mee: ', maak('code', '', info));
      else voorbeeld.append('Er gaat geen technische info mee.');
    };
    zetVoorbeeld();
    vink.addEventListener('change', zetVoorbeeld);

    const tel = () => {
      const n = Array.from(veld.value.trim()).length;
      teller.textContent = n + ' / ' + MAX_TEKST;
      teller.classList.toggle('is-over', n > MAX_TEKST);
    };
    veld.addEventListener('input', tel);
    if (globalThis.SPOTekst) globalThis.SPOTekst.koppel(veld, { soort: 'tekst', max: MAX_TEKST });

    const annuleer = maak('button', 'knop', 'Annuleren');
    annuleer.type = 'button';
    annuleer.addEventListener('click', v.sluit);
    const verstuur = maak('button', 'knop goud', 'Versturen');
    verstuur.type = 'submit';
    verstuur.setAttribute('form', 'fb-vorm');
    vorm.id = 'fb-vorm';
    v.voet.append(annuleer, verstuur);

    let bezig = false;
    vorm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (bezig) return;
      fout.textContent = '';
      const T = globalThis.SPOTekst;
      if (!T || !T.geldig(veld, { soort: 'tekst', max: MAX_TEKST })) { veld.focus(); return; } // het filter toont zelf waarom niet
      const schoon = T.controleer(veld.value, { soort: 'tekst', max: MAX_TEKST }).schoon;
      if (!schoon) { fout.textContent = 'Schrijf eerst wat je wilt vertellen.'; veld.focus(); return; }
      const gekozen = vorm.querySelector('input[name="fb-soort"]:checked');
      const soort = gekozen && SOORTEN.some((s) => s[0] === gekozen.value) ? gekozen.value : 'anders';
      bezig = true;
      verstuur.disabled = true;
      verstuur.textContent = 'Bezig…';
      try {
        await stuur(soort, schoon, vink.checked ? info : '');
        v.inhoud.replaceChildren(maak('p', 'fb-bedankt', 'Bedankt! Je feedback is verstuurd.'), maak('p', 'nv-intro', 'Alleen de beheerder leest dit.'));
        v.voet.replaceChildren();
        const klaar = maak('button', 'knop goud', 'Sluiten');
        klaar.type = 'button';
        klaar.addEventListener('click', v.sluit);
        v.voet.append(klaar);
        klaar.focus({ preventScroll: true });
      } catch (err) {
        fout.textContent = foutTekst(err);
        verstuur.disabled = false;
        verstuur.textContent = 'Versturen';
        bezig = false;
      }
    });
    veld.focus({ preventScroll: true });
  }

  function start() {
    const knop = document.getElementById('b-feedback');
    if (knop) knop.addEventListener('click', () => open());
  }

  const SPOFeedback = { open, stuur, maakInfo, browserVan, systeemVan, foutTekst, MAX_TEKST, MAX_INFO, SOORTEN };
  globalThis.SPOFeedback = SPOFeedback;
  if (typeof module !== 'undefined' && module.exports) module.exports = SPOFeedback;
  if (typeof document !== 'undefined' && document.getElementById && !globalThis.__SPO_TEST_ZONDER_START) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
