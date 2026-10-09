// Het tabblad Prestaties: alle badges met voortgang. De regels en het uitrekenen staan in prestatieslib.js.
(function () {
  'use strict';
  const P = globalThis.SPOPrestaties;
  const $ = (id) => document.getElementById(id);
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst !== undefined) e.textContent = tekst; return e; };
  const datum = (ts) => new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const NIEUW_SLEUTEL = 'spo_prestaties_gezien'; // tijdstip waarop je dit tabblad voor het laatst bekeek
  let filter = 'alle';
  let lijst = [];
  let gezien = 0;
  let toastTimer = null;

  function teken() {
    const ul = $('badges');
    ul.replaceChildren();
    const klaar = lijst.filter((b) => b.klaar).length;
    $('samen-nu').textContent = klaar; $('samen-tot').textContent = lijst.length;
    const pct = lijst.length ? Math.round((klaar / lijst.length) * 100) : 0;
    $('samen-vul').style.width = pct + '%';
    $('samen-balk').setAttribute('aria-valuenow', pct);
    $('samen-sub').textContent = klaar === lijst.length ? 'Alles behaald. Goed gedaan!' : klaar ? `Nog ${lijst.length - klaar} te gaan.` : 'Open een pakket of speel een gevecht om je eerste badge te halen.';
    const zichtbaar = lijst.filter((b) => filter === 'alle' || (filter === 'behaald' ? b.klaar : !b.klaar));
    // Behaalde badges eerst (nieuwste bovenaan), daarna de verste voortgang.
    zichtbaar.sort((a, b) => (b.klaar - a.klaar) || (a.klaar ? b.ts - a.ts : (b.nu / b.doel) - (a.nu / a.doel)));
    $('geen').hidden = zichtbaar.length > 0;
    for (const b of zichtbaar) {
      const li = el('li', 'badge-kaart ' + (b.klaar ? 'behaald' : 'vergrendeld') + (b.tier === 5 ? ' glitch' : ''));
      const nieuw = b.klaar && b.ts > gezien && gezien > 0;
      if (nieuw) li.classList.add('nieuw');
      const ic = el('div', 'b-icoon'); ic.append(P.icoon(document, b, !b.klaar));
      const t = el('div', 'b-tekst');
      t.append(el('h3', 'b-naam', b.naam), el('span', 'b-niveau', P.TIER_NAMEN[b.tier] || ''));
      t.append(el('p', 'b-uitleg', (b.klaar ? '' : 'Hint: ') + b.tekst));
      if (b.klaar) t.append(el('p', 'b-datum', b.ts ? 'Behaald op ' + datum(b.ts) : 'Behaald'));
      else {
        const v = el('div', 'b-voortgang');
        const balk = el('div', 'balk'); balk.setAttribute('role', 'progressbar'); balk.setAttribute('aria-label', 'Voortgang ' + b.naam);
        balk.setAttribute('aria-valuemin', '0'); balk.setAttribute('aria-valuemax', String(b.doel)); balk.setAttribute('aria-valuenow', String(b.nu));
        const vul = el('span'); vul.style.width = Math.round((b.nu / b.doel) * 100) + '%'; balk.append(vul);
        v.append(balk, el('small', '', `${fmt(b.nu)} / ${fmt(b.doel)}`));
        t.append(v);
      }
      li.append(ic, t);
      if (nieuw) li.append(el('span', 'b-nieuw', 'Nieuw'));
      ul.append(li);
    }
  }

  function toon(nieuw) {
    if (!nieuw.length) return;
    const plek = $('toast-plek');
    plek.replaceChildren(P.maakToast(document, nieuw));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => plek.replaceChildren(), 7000);
  }

  async function ververs(meldNieuw) {
    let nieuw = [];
    try { nieuw = await P.controleer(); } catch (e) { /* badges zijn een extraatje */ }
    lijst = await P.overzicht();
    teken();
    if (meldNieuw) toon(nieuw);
  }

  async function start() {
    try { gezien = Number(await P.lees(NIEUW_SLEUTEL)) || 0; } catch (e) { gezien = 0; }
    await ververs(true);
    try { await P.schrijf(NIEUW_SLEUTEL, Date.now()); } catch (e) { /* niet erg */ }
    for (const b of document.querySelectorAll('[data-filter]')) {
      b.addEventListener('click', () => {
        filter = b.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        teken();
      });
    }
    // Verandert er iets in de opslag (een pakket geopend, een gevecht gespeeld), dan werken we bij.
    try {
      if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
        let wacht = null;
        chrome.storage.onChanged.addListener((c, gebied) => {
          if (gebied !== 'local' || !Object.keys(c).some((k) => /^spo_(galerij|gevechten|team|stats|prestaties)$/.test(k))) return;
          clearTimeout(wacht); wacht = setTimeout(() => ververs(true), 300);
        });
      }
    } catch (e) { /* zonder live bijwerken kan ook */ }
  }
  start().catch(() => { $('geen').hidden = false; $('geen').textContent = 'Er ging iets mis bij het laden van je prestaties.'; });
})();
