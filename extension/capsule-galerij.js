/*
 * Somtoday Pack Opener v3.0: de tijdcapsule in de galerij (venster, icoon in het raster en de opening).
 * De regels en de opslag staan in capsule.js (SPOCapsule). galerij.js roept hier init(), icoon(e) en bijDetail(e) aan.
 */
(function () {
  'use strict';
  const C = globalThis.SPOCapsule;
  if (!C) return;
  const $ = (id) => document.getElementById(id);
  const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const datumLang = (ts) => new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  let capsules = [];
  let kaart = null; // de kaart waarvan het venster nu open is
  let opWijzig = () => {};
  let timer = null;
  let wachtWeg = 0;

  const van = (id) => capsules.find((c) => c.kaartId === id) || null;
  const SVG = 'http://www.w3.org/2000/svg';
  // Een klein zandloper-icoontje (lijntekening)
  function zandloper() {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M6 3h12 M6 21h12 M7 3v3.5a5 5 0 0 0 2 4L12 12l-3 1.5a5 5 0 0 0-2 4V21 M17 3v3.5a5 5 0 0 1-2 4L12 12l3 1.5a5 5 0 0 1 2 4V21');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.9'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
    return s;
  }

  // Het icoontje in het raster, of null als de kaart geen capsule heeft.
  function icoon(e) {
    const c = e && van(e.id);
    if (!c) return null;
    const open = C.isOpen(c);
    const i = document.createElement('span');
    i.className = 'cp-icoon' + (open && !c.geopend ? ' klaar' : '');
    i.title = open ? (c.geopend ? 'Tijdcapsule (geopend)' : 'Je tijdcapsule kan open!') : 'Tijdcapsule: open op ' + datumLang(c.opent);
    i.append(zandloper());
    return i;
  }

  function toonDeel(naam) {
    for (const id of ['cp-schrijf', 'cp-dicht', 'cp-klaar', 'cp-anim', 'cp-open']) $(id).hidden = id !== naam;
  }
  function tekenKaart(doel) {
    const img = $(doel); img.src = kaart ? kaart.kaart : ''; img.alt = kaart ? `Kaart ${kaart.vak}` : '';
  }
  function knopTekst() {
    const b = $('d-capsule');
    if (!b) return;
    const c = kaart && van(kaart.id);
    b.textContent = !c ? 'Tijdcapsule' : C.isOpen(c) && !c.geopend ? 'Tijdcapsule (open!)' : 'Tijdcapsule (bekijken)';
  }

  function zetWeg(knop) {
    knop.classList.remove('zeker'); knop.textContent = 'Capsule weggooien'; clearTimeout(wachtWeg);
  }
  async function gooiWeg() {
    if (!kaart) return;
    await C.weg(kaart.id);
    await laad();
    $('capsule').close();
  }

  function toonVenster() {
    if (!kaart) return;
    const c = van(kaart.id);
    const dlg = $('capsule');
    clearTimeout(timer);
    zetWeg($('cp-weg1')); zetWeg($('cp-weg2'));
    $('cp-fout').textContent = '';
    if (!c) {
      $('cp-tekst').value = ''; teller();
      const g = C.grenzen();
      const dat = $('cp-datum'); dat.min = g.min; dat.max = g.max; dat.value = C.standaardDatum();
      toonDeel('cp-schrijf');
    } else if (!C.isOpen(c)) {
      const n = C.dagenTot(c);
      $('cp-dicht-tekst').textContent = `Deze capsule gaat open op ${datumLang(c.opent)}. Nog ${n} ${n === 1 ? 'dag' : 'dagen'}.`;
      $('cp-gemaakt1').textContent = `Dichtgedaan op ${datumLang(c.gemaakt)}. Wat erin staat, zie je pas dan.`;
      toonDeel('cp-dicht');
    } else if (!c.geopend) {
      toonDeel('cp-klaar');
      tekenKaart('cp-img0');
    } else {
      toonNotitie(c);
    }
    if (!dlg.open) dlg.showModal();
    if (!c) $('cp-tekst').focus();
  }
  function toonNotitie(c) {
    $('cp-notitie').textContent = c.tekst; // textContent: de tekst wordt nooit als html gelezen
    $('cp-gemaakt2').textContent = `Geschreven op ${datumLang(c.gemaakt)}, geopend vanaf ${datumLang(c.opent)}.`;
    tekenKaart('cp-img');
    toonDeel('cp-open');
  }

  async function bewaar() {
    if (!kaart) return;
    const r = await C.maak(kaart.id, $('cp-tekst').value, $('cp-datum').value);
    if (!r.ok) { $('cp-fout').textContent = r.reden || 'Dat lukt niet.'; return; }
    await laad();
    $('capsule').close();
  }
  function teller() {
    const n = $('cp-tekst').value.length;
    $('cp-teller').textContent = `${n} / ${C.MAX_TEKENS}`;
    $('cp-teller').classList.toggle('vol', n >= C.MAX_TEKENS);
  }

  // De opening: de capsule gaat open, er stijgt licht en stof op, daarna verschijnt de notitie met de kaart (ongeveer 3 seconden).
  async function speelOpening() {
    if (!kaart) return;
    const c = await C.openen(kaart.id);
    if (!c) { toonVenster(); return; }
    await laad();
    if (rustig) { toonNotitie(c); return; }
    const stof = $('cp-stof');
    stof.replaceChildren();
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('i');
      s.style.setProperty('--x', Math.round((Math.random() - 0.5) * 220) + 'px');
      s.style.setProperty('--y', -Math.round(80 + Math.random() * 150) + 'px');
      s.style.setProperty('--d', (0.9 + Math.random() * 0.9).toFixed(2) + 's');
      s.style.setProperty('--w', (1.1 + Math.random() * 0.7).toFixed(2) + 's');
      stof.append(s);
    }
    const bod = $('cp-anim');
    bod.classList.remove('speel'); void bod.offsetWidth;
    toonDeel('cp-anim');
    bod.classList.add('speel');
    timer = setTimeout(() => { bod.classList.remove('speel'); toonNotitie(c); $('cp-open').classList.add('inkomst'); }, 3300);
  }

  async function laad() {
    try { capsules = await C.lijst(); } catch (e) { capsules = []; }
    knopTekst();
    opWijzig();
  }

  function init(opties) {
    opWijzig = (opties && opties.opWijzig) || (() => {});
    const F = globalThis.SPOTekst;
    if (F && typeof F.koppel === 'function') { try { F.koppel($('cp-tekst'), { max: C.MAX_TEKENS, soort: 'tekst', streng: true }); } catch (e) { /* zonder filter op het veld: bewaar() controleert toch */ } }
    $('d-capsule').addEventListener('click', toonVenster);
    $('cp-tekst').addEventListener('input', () => { teller(); $('cp-fout').textContent = ''; });
    $('cp-datum').addEventListener('input', () => { $('cp-fout').textContent = ''; });
    $('cp-bewaar').addEventListener('click', bewaar);
    $('cp-annuleer').addEventListener('click', () => $('capsule').close());
    $('cp-sluit').addEventListener('click', () => $('capsule').close());
    $('cp-open-knop').addEventListener('click', speelOpening);
    for (const id of ['cp-sluit1', 'cp-sluit2', 'cp-sluit3']) $(id).addEventListener('click', () => $('capsule').close());
    // weggooien vraagt om bevestiging (twee klikken)
    for (const id of ['cp-weg1', 'cp-weg2']) {
      const k = $(id);
      k.addEventListener('click', () => {
        if (k.classList.contains('zeker')) { zetWeg(k); gooiWeg(); return; }
        k.classList.add('zeker'); k.textContent = 'Zeker weten? Dan is de notitie weg';
        clearTimeout(wachtWeg); wachtWeg = setTimeout(() => zetWeg(k), 4000);
      });
      k.addEventListener('blur', () => zetWeg(k));
    }
    $('capsule').addEventListener('close', () => { clearTimeout(timer); $('cp-notitie').textContent = ''; $('cp-open').classList.remove('inkomst'); });
    $('capsule').addEventListener('click', (ev) => { if (ev.target === $('capsule')) $('capsule').close(); });
    try {
      const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
      if (api && api.storage && api.storage.onChanged) api.storage.onChanged.addListener((c, gebied) => { if (gebied === 'local' && c[C.SLEUTEL]) laad(); });
    } catch (e) { /* zonder live bijwerken kan ook */ }
    return laad();
  }
  function bijDetail(e) { kaart = e; knopTekst(); }

  globalThis.SPOCapsuleUI = { init, icoon, bijDetail, laad };
})();
