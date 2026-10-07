// Winkel: Somtoday-thema's, kaartkleuren en -randen, profieltitels en -achtergronden, en pakjes. Alles met munten, alles alleen cosmetisch.
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const E = globalThis.SPOEco;
  const $ = (id) => document.getElementById(id);
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst != null) e.textContent = tekst; return e; };
  const ZK = ['#a5aec4', '#5fd0ff', '#c58bff', '#ffb020'];
  let staat = null;
  let inst = {};
  let wacht = new Map();
  let melTimer = 0;

  function meld(t, fout) { const m = $('melding'); m.textContent = t; m.classList.toggle('fout', !!fout); clearTimeout(melTimer); melTimer = setTimeout(() => (m.textContent = ''), 5000); }

  async function laad() {
    staat = await E.lees();
    try { inst = (await chrome.storage.local.get('spo_instellingen')).spo_instellingen || {}; } catch (e) { inst = {}; }
    teken();
    const d = await E.dagStatus();
    $('dag-info').textContent = d.gehaald ? `Dagelijkse beloning gehaald. Reeks: dag ${d.reeks} van 7.` : 'Je dagelijkse beloning is nog niet gehaald. Open Somtoday om hem te pakken.';
  }

  function voorbeeld(it) {
    const v = el('div', 'voorbeeld');
    if (it.soort === 'somtoday') {
      v.style.background = it.kleuren[0];
      const m = el('div', 'mini'); m.style.background = it.kleuren[1]; m.style.boxShadow = `inset 0 3px 0 ${it.kleuren[2]}`; v.append(m);
    } else if (it.soort === 'kaartthema') {
      v.style.background = it.pal ? `linear-gradient(135deg, ${it.pal.join(', ')})` : '#222';
    } else if (it.soort === 'rand') {
      v.style.background = '#14183a';
      const m = el('div', 'mini'); m.style.background = '#1f2560';
      m.style.border = it.rand === 'dubbel' ? '4px double #ffd24a' : '2px solid #5fd0ff';
      if (it.rand === 'neon') m.style.boxShadow = '0 0 12px #5fd0ff, inset 0 0 8px #5fd0ff';
      v.append(m);
    } else if (it.soort === 'titel') {
      v.style.background = 'linear-gradient(135deg,#10163a,#3b1d70)'; v.append(el('span', 'tekst', it.naam.toUpperCase()));
    } else {
      v.style.background = E.bgCss(it.id);
    }
    return v;
  }

  // 'Gebruik' voor kaartkleuren en -randen: zet het op alle vijf de niveaus (fijner afstellen kan bij Kaart ontwerpen).
  async function gebruikKaart(it) {
    const r = (await chrome.storage.local.get('spo_instellingen')).spo_instellingen || {};
    const o = r.kaartOntwerp && typeof r.kaartOntwerp === 'object' ? r.kaartOntwerp : {};
    const nieuw = {};
    for (let i = 0; i < 5; i++) {
      const e = o[i] && typeof o[i] === 'object' ? o[i] : {};
      nieuw[i] = { thema: e.thema || r.kaartThema || 'auto', rand: e.rand || r.kaartRand || 'standaard' };
      if (it.soort === 'kaartthema') nieuw[i].thema = it.thema; else nieuw[i].rand = it.rand;
    }
    await chrome.storage.local.set({ spo_instellingen: Object.assign({}, r, { kaartOntwerp: nieuw }) });
  }
  async function standaardKaart(soort) {
    const r = (await chrome.storage.local.get('spo_instellingen')).spo_instellingen || {};
    const o = r.kaartOntwerp && typeof r.kaartOntwerp === 'object' ? r.kaartOntwerp : {};
    const nieuw = {};
    for (let i = 0; i < 5; i++) { const e = o[i] && typeof o[i] === 'object' ? o[i] : {}; nieuw[i] = { thema: e.thema || 'auto', rand: e.rand || 'standaard' }; nieuw[i][soort] = soort === 'thema' ? 'auto' : 'standaard'; }
    await chrome.storage.local.set({ spo_instellingen: Object.assign({}, r, { kaartOntwerp: nieuw }) });
  }
  function kaartInGebruik(it) {
    const o = inst.kaartOntwerp && typeof inst.kaartOntwerp === 'object' ? inst.kaartOntwerp : {};
    const sleutel = it.soort === 'kaartthema' ? 'thema' : 'rand';
    const waarde = it.soort === 'kaartthema' ? it.thema : it.rand;
    return [0, 1, 2, 3, 4].every((i) => o[i] && o[i][sleutel] === waarde);
  }
  const inGebruik = (it) => {
    const g = staat.winkel.gebruik;
    if (it.soort === 'somtoday') return g.somtoday === it.id;
    if (it.soort === 'titel') return g.titel === it.id;
    if (it.soort === 'bg') return g.bg === it.id;
    return kaartInGebruik(it);
  };

  function tweestaps(knop, tekst, bevestig, actie) {
    const reset = () => { clearTimeout(wacht.get(knop)); knop.classList.remove('zeker'); knop.textContent = tekst; };
    knop.addEventListener('click', () => {
      if (knop.classList.contains('zeker')) { reset(); actie(); return; }
      knop.classList.add('zeker'); knop.textContent = bevestig;
      clearTimeout(wacht.get(knop)); wacht.set(knop, setTimeout(reset, 4000));
    });
    knop.addEventListener('blur', reset);
  }

  function itemKaart(it) {
    const li = el('li', 'item z' + it.zeld);
    li.append(voorbeeld(it));
    li.append(el('span', 'soort', E.SOORTEN[it.soort]));
    li.append(el('h3', '', it.naam));
    li.append(el('span', 'zeld', E.ZELD[it.zeld]));
    li.append(el('p', '', it.uitleg));
    const regel = el('div', 'prijs-regel');
    const heeft = it.gratis || staat.winkel.gekocht.includes(it.id);
    if (!heeft) {
      if (it.prijs == null) { regel.append(el('span', 'gekocht', 'Alleen te winnen')); }
      else {
        regel.append(el('span', 'prijs-tag', `${it.prijs} munten`));
        const k = el('button', 'knop goud', 'Kopen'); k.type = 'button';
        if (staat.munten.saldo < it.prijs) { k.disabled = true; k.title = 'Je hebt te weinig munten.'; }
        k.setAttribute('aria-label', `${it.naam} kopen voor ${it.prijs} munten`);
        tweestaps(k, 'Kopen', 'Zeker?', async () => {
          const r = await E.koop(it.id);
          if (r.ok) meld(`${it.naam} is van jou! Je kunt hem nu gebruiken.`); else meld(r.reden === 'te-weinig' ? 'Je hebt te weinig munten.' : 'Dat lukte niet.', true);
          laad();
        });
        regel.append(k);
      }
    } else {
      const aan = it.gratis ? it.aan() : inGebruik(it);
      if (aan) regel.append(el('span', 'gekocht', 'In gebruik'));
      else {
        regel.append(el('span', 'gekocht', it.gratis ? '' : 'Van jou'));
        const g = el('button', 'knop', 'Gebruik'); g.type = 'button';
        g.setAttribute('aria-label', `${it.naam} gebruiken`);
        g.addEventListener('click', async () => {
          try {
            if (it.gratis) await it.zet();
            else if (it.soort === 'kaartthema' || it.soort === 'rand') await gebruikKaart(it);
            else await E.gebruik(it.soort, it.id);
            meld(`${it.naam} staat aan.`);
          } catch (e) { meld('Dat lukte niet.', true); }
          laad();
        });
        regel.append(g);
      }
    }
    li.append(regel);
    return li;
  }

  function teken() {
    $('saldo').textContent = String(staat.munten.saldo);
    // pakjes
    const pl = $('pakjes'); pl.replaceChildren();
    for (const pak of E.PAKJES) {
      const li = el('li', 'pakkaart');
      const plaat = el('div', 'pak-plaat'); plaat.style.setProperty('--pk', pak.kleur);
      plaat.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 6.1L21 12l-6.6 2.9L12 21l-2.4-6.1L3 12l6.6-2.9z"/></svg>';
      li.append(plaat, el('h3', '', pak.naam));
      const tot = pak.kans.reduce((a, b) => a + b, 0);
      li.append(el('span', 'kansen', pak.kans.map((k, i) => (k ? `${E.ZELD[i]} ${Math.round((k / tot) * 100)}%` : '')).filter(Boolean).join(', ')));
      const k = el('button', 'knop goud', `Openen: ${pak.prijs} munten`); k.type = 'button';
      if (staat.munten.saldo < pak.prijs) { k.disabled = true; k.title = 'Je hebt te weinig munten.'; }
      tweestaps(k, `Openen: ${pak.prijs} munten`, 'Zeker?', () => openPak(pak));
      li.append(k);
      pl.append(li);
    }
    // rijen
    const gratis = {
      somtoday: [{ id: 'st-standaard', soort: 'somtoday', naam: 'Standaard', zeld: 0, uitleg: 'Het gewone uiterlijk van Somtoday.', kleuren: ['#ffffff', '#eaedf0', '#0068cc'], gratis: true, aan: () => staat.winkel.gebruik.somtoday === 'standaard', zet: () => E.gebruik('somtoday', null) }],
      kaartthema: [], rand: [],
      titel: [{ id: 'ti-geen', soort: 'titel', naam: 'Geen titel', zeld: 0, uitleg: 'Je kaart zegt gewoon "Speler".', gratis: true, aan: () => !staat.winkel.gebruik.titel, zet: () => E.gebruik('titel', null) }],
      bg: [{ id: 'bg-standaard', soort: 'bg', naam: 'Standaard', zeld: 0, uitleg: 'Blauw met paars.', gratis: true, aan: () => staat.winkel.gebruik.bg === 'standaard', zet: () => E.gebruik('bg', null) }],
    };
    const koppen = { somtoday: "Somtoday-thema's", kaartthema: 'Kaartkleuren', rand: 'Kaartranden', titel: 'Profieltitels', bg: 'Profielachtergronden' };
    const uitleg = { somtoday: 'Hertekent de hele Somtoday-pagina. Uitzetten kan altijd: kies Standaard.', kaartthema: 'Extra kleuren voor je kaarten. Fijn afstellen per niveau kan bij Kaart ontwerpen.', rand: 'De gewone rand en Dun zijn gratis. Deze zijn extra.', titel: 'Staat op je profielkaart.', bg: 'Achter je profielkaart.' };
    const r = $('rijen'); r.replaceChildren();
    for (const soort of Object.keys(koppen)) {
      r.append(el('h2', '', koppen[soort]), el('p', 'uitleg', uitleg[soort]));
      const ul = el('ul', 'raster');
      for (const it of gratis[soort].concat(E.ITEMS.filter((i) => i.soort === soort))) ul.append(itemKaart(it));
      r.append(ul);
    }
  }

  // ── Pakje openen ──
  let bezig = false;
  async function openPak(pak) {
    if (bezig) return;
    bezig = true;
    const ov = $('overlay');
    ov.classList.remove('open');
    $('ov-prijs').replaceChildren();
    $('ov-tekst').textContent = 'Daar gaat hij...';
    $('ov-sluit').hidden = true;
    $('ov-kop').textContent = pak.naam;
    $('ov-pak').style.setProperty('--pk', pak.kleur);
    ov.hidden = false;
    $('ov-sluit').previousElementSibling;
    ov.querySelector('.venster').focus();
    const [r] = await Promise.all([E.openPakje(pak.id), new Promise((k) => setTimeout(k, 1300))]);
    if (!r.ok) {
      ov.hidden = true; bezig = false;
      meld(r.reden === 'te-weinig' ? 'Je hebt te weinig munten.' : 'Dat lukte niet.', true); laad(); return;
    }
    const it = E.PER_ID.get(r.item);
    ov.style.setProperty('--zc', ZK[it.zeld]);
    ov.querySelector('.gloed').style.setProperty('--zc', ZK[it.zeld]);
    const p = $('ov-prijs');
    const voor = el('div', 'voor'); const kopie = voorbeeld(it); kopie.style.height = '70px'; kopie.style.borderRadius = '10px'; kopie.className = 'voorbeeld voor';
    p.append(kopie, el('b', '', it.naam));
    const z = el('span', '', `${E.ZELD[it.zeld]}: ${E.SOORTEN[it.soort].toLowerCase()}`); z.style.color = ZK[it.zeld]; p.append(z);
    void voor;
    ov.classList.add('open');
    $('ov-tekst').textContent = r.dubbel ? `Die had je al. Je krijgt ${r.terug} munten terug.` : 'Nieuw item! Je vindt het hieronder en kunt het meteen gebruiken.';
    setTimeout(() => { $('ov-sluit').hidden = false; $('ov-sluit').focus(); }, 900);
    laad();
  }
  function sluitOv() { $('overlay').hidden = true; bezig = false; laad(); }
  $('ov-sluit').addEventListener('click', sluitOv);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('overlay').hidden && !$('ov-sluit').hidden) { e.preventDefault(); e.stopPropagation(); sluitOv(); } }, true);

  try {
    chrome.storage.onChanged.addListener((w, g) => { if (g === 'local' && (w.spo_munten || w.spo_winkel || w.spo_instellingen) && $('overlay').hidden) laad(); });
  } catch (e) { /* geen opslag */ }
  E.sweep().catch(() => {}).then(laad);
})();
