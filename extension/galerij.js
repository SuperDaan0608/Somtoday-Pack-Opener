(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const GLOED = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
  const OPENING = { pak: 'Pakje', kluis: 'Kluis kraken', plinko: 'Plinko', ster: 'Wensster', raket: 'Raket', schiet: 'Schietkraam' };
  const $ = (id) => document.getElementById(id);
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => Number(n).toFixed(1).replace('.', ',');
  const datum = (ts) => new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  const datumTijd = (ts) => new Date(ts).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  let alle = [];
  const filter = { vak: '', niv: new Set(), sort: 'nieuw' };
  let zichtbaar = [];
  let open = -1;
  let openId = null;
  const wacht = new Map(); // knop -> timer voor tweestaps-bevestiging

  function schoon(a) {
    return (Array.isArray(a) ? a : []).filter((e) => e && typeof e.id === 'string' && typeof e.kaart === 'string' && Number.isFinite(e.cijfer))
      .map((e) => Object.assign({}, e, { tier: Math.max(0, Math.min(4, e.tier | 0)) }));
  }

  // Tweestaps knop: eerste klik vraagt om bevestiging, tweede voert uit.
  function tweestaps(knop, tekst, bevestig, actie) {
    knop.addEventListener('click', () => {
      if (knop.classList.contains('zeker')) { reset(); actie(); return; }
      knop.classList.add('zeker'); knop.textContent = bevestig;
      clearTimeout(wacht.get(knop)); wacht.set(knop, setTimeout(reset, 4000));
    });
    knop.addEventListener('blur', reset);
    function reset() { clearTimeout(wacht.get(knop)); knop.classList.remove('zeker'); knop.textContent = tekst; }
    knop.resetTweestaps = reset;
  }

  function tilt(kaart) {
    if (rustig) return;
    const vak = kaart.parentElement;
    vak.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'touch') return;
      const r = kaart.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      kaart.classList.add('aktief');
      kaart.style.transform = `rotateY(${((x - .5) * 18).toFixed(1)}deg) rotateX(${((.5 - y) * 18).toFixed(1)}deg) scale(1.04)`;
      kaart.style.setProperty('--gx', (x * 100).toFixed(0) + '%');
      kaart.style.setProperty('--gy', (y * 100).toFixed(0) + '%');
    });
    vak.addEventListener('pointerleave', () => { kaart.classList.remove('aktief'); kaart.style.transform = ''; });
  }

  function gemiddelde(l) {
    let s = 0, w = 0;
    for (const e of l) { const g = Number.isFinite(e.weging) && e.weging > 0 ? e.weging : 1; s += e.cijfer * g; w += g; }
    return w ? s / w : 0;
  }

  function kop() {
    const heeft = alle.length > 0;
    for (const id of ['stats', 'collectie', 'filters', 'voet']) $(id).hidden = !heeft;
    $('leeg').hidden = heeft;
    if (!heeft) return;
    $('st-aantal').textContent = alle.length;
    $('st-gem').textContent = fmt(gemiddelde(alle));
    const beste = alle.reduce((b, e) => (e.cijfer > b.cijfer ? e : b), alle[0]);
    $('st-beste').textContent = `${fmt(beste.cijfer)} ${beste.vak}`;
    const tel = [0, 0, 0, 0, 0];
    alle.forEach((e) => tel[e.tier]++);
    $('balk').replaceChildren();
    $('legenda').replaceChildren();
    tel.forEach((n, t) => {
      if (n) { const i = document.createElement('i'); i.className = 'n' + t; i.style.flexGrow = n; i.title = `${NIVEAUS[t]}: ${n}`; $('balk').append(i); }
      const li = document.createElement('li');
      const stip = document.createElement('span'); stip.className = 'stip n' + t;
      const bd = document.createElement('b'); bd.textContent = n;
      li.append(stip, document.createTextNode(NIVEAUS[t] + ' '), bd);
      $('legenda').append(li);
    });
    $('balk').setAttribute('aria-label', 'Verdeling: ' + tel.map((n, t) => `${NIVEAUS[t]} ${n}`).join(', '));
    // filters
    const sel = $('f-vak'), huidig = filter.vak;
    const vakken = [...new Set(alle.map((e) => e.vak))].sort((a, b) => a.localeCompare(b, 'nl'));
    if (huidig && !vakken.includes(huidig)) filter.vak = '';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Alle vakken';
    sel.replaceChildren(o0);
    vakken.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.append(o); });
    sel.value = filter.vak;
    $('chips').replaceChildren();
    tel.forEach((n, t) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.t = t;
      b.setAttribute('aria-pressed', filter.niv.has(t));
      const st = document.createElement('span'); st.className = 'stip n' + t;
      b.append(st, document.createTextNode(NIVEAUS[t]));
      $('chips').append(b);
    });
  }

  function raster() {
    let l = alle.filter((e) => (!filter.vak || e.vak === filter.vak) && (!filter.niv.size || filter.niv.has(e.tier)));
    const s = { nieuw: (a, b) => b.ts - a.ts, hoog: (a, b) => b.cijfer - a.cijfer || b.ts - a.ts, laag: (a, b) => a.cijfer - b.cijfer || b.ts - a.ts, vak: (a, b) => a.vak.localeCompare(b.vak, 'nl') || b.ts - a.ts }[filter.sort];
    zichtbaar = l.sort(s);
    const ul = $('raster');
    ul.textContent = '';
    const frag = document.createDocumentFragment();
    zichtbaar.forEach((e, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'item'; b.dataset.i = i;
      b.setAttribute('aria-label', `${e.vak}, ${fmt(e.cijfer)}, ${NIVEAUS[e.tier]}, ${datum(e.ts)}`);
      b.style.setProperty('--gl', GLOED[e.tier]);
      const vak = document.createElement('span'); vak.className = 'kaartvak';
      const k = document.createElement('span'); k.className = 'kaart';
      const img = new Image(); img.src = e.kaart; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
      const g = document.createElement('i'); g.className = 'glans';
      k.append(img, g); vak.append(k); tilt(k);
      const m = document.createElement('span'); m.className = 'meta';
      const v = document.createElement('span'); v.className = 'vak'; v.textContent = e.vak;
      const c = document.createElement('span'); c.className = 'cj'; c.textContent = fmt(e.cijfer);
      const d = document.createElement('span'); d.className = 'dt'; d.textContent = datum(e.ts);
      m.append(v, c, d); b.append(vak, m); li.append(b); frag.append(li);
    });
    ul.append(frag);
    $('geen').hidden = alle.length === 0 || zichtbaar.length > 0;
  }

  function toon(i) {
    const e = zichtbaar[i];
    if (!e) return;
    open = i; openId = e.id;
    const dlg = $('detail');
    dlg.style.setProperty('--gl', GLOED[e.tier]);
    $('d-img').src = e.kaart; $('d-img').alt = `Kaart ${e.vak} ${fmt(e.cijfer)}`;
    $('d-niveau').textContent = NIVEAUS[e.tier];
    $('d-vak').textContent = e.vak;
    $('d-cijfer').textContent = fmt(e.cijfer);
    $('d-onderwerp').textContent = e.onderwerp || '-';
    $('d-weging').textContent = Number.isFinite(e.weging) ? e.weging + 'x' : '-';
    $('d-datum').textContent = datumTijd(e.ts);
    $('d-opening').textContent = OPENING[e.opening] || '-';
    const dl = $('d-dl');
    dl.href = e.kaart;
    dl.download = `kaart-${e.vak}-${fmt(e.cijfer)}`.toLowerCase().replace(/[^a-z0-9,-]+/g, '-') + (e.kaart.startsWith('data:image/png') ? '.png' : '.webp');
    $('d-vorige').disabled = i <= 0;
    $('d-volgende').disabled = i >= zichtbaar.length - 1;
    $('d-weg').resetTweestaps();
    if (!dlg.open) dlg.showModal();
  }

  async function verwijder(ids) {
    const set = new Set(ids);
    const rest = alle.filter((e) => !set.has(e.id));
    alle = rest;
    if (!demo) { try { await chrome.storage.local.set({ spo_galerij: rest }); } catch (_) { /* onChanged herstelt */ } }
    render();
  }

  function render() {
    kop(); raster();
    const dlg = $('detail');
    if (dlg.open) {
      const i = zichtbaar.findIndex((e) => e.id === openId);
      if (i >= 0) toon(i);
      else if (zichtbaar.length) toon(Math.min(open, zichtbaar.length - 1));
      else dlg.close();
    }
  }

  // Events
  $('f-vak').addEventListener('change', (e) => { filter.vak = e.target.value; raster(); });
  $('f-sort').addEventListener('change', (e) => { filter.sort = e.target.value; raster(); });
  $('chips').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    const t = +b.dataset.t;
    filter.niv.has(t) ? filter.niv.delete(t) : filter.niv.add(t);
    b.setAttribute('aria-pressed', filter.niv.has(t)); raster();
  });
  $('raster').addEventListener('click', (ev) => { const b = ev.target.closest('.item'); if (b) toon(+b.dataset.i); });
  tilt($('d-kaart'));
  $('d-sluit').addEventListener('click', () => $('detail').close());
  $('d-vorige').addEventListener('click', () => toon(open - 1));
  $('d-volgende').addEventListener('click', () => toon(open + 1));
  $('detail').addEventListener('click', (ev) => { if (ev.target === $('detail')) $('detail').close(); });
  $('detail').addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); toon(Math.max(0, open - 1)); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); toon(Math.min(zichtbaar.length - 1, open + 1)); }
  });
  tweestaps($('d-weg'), 'Verwijderen', 'Zeker weten?', () => { const id = openId; verwijder([id]); });
  tweestaps($('alles-weg'), 'Galerij leegmaken', 'Zeker weten? Alles weg', () => verwijder(alle.map((e) => e.id)));

  function script(src) {
    return new Promise((ok, fout) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fout; document.head.append(s); });
  }

  async function demoData() {
    await script('motor/data.js'); await script('motor/art.js');
    const art = window.__SPO.art;
    await art.laadLettertypes();
    const lijst = [['Wiskunde', 9.9, 'Hoofdstuk 4'], ['Nederlands', 6.8, 'Betoog'], ['Engels', 8.4, 'Writing'], ['Biologie', 4.2, 'Toets cellen'], ['Natuurkunde', 7.6, 'Krachten'], ['Geschiedenis', 10, 'Mondeling'], ['Scheikunde', 5.9, 'Zuren'], ['Frans', 9.3, 'Luisteren'], ['Aardrijkskunde', 3.7, 'Kaartvaardig'], ['Economie', 7.1, 'Markt'], ['Wiskunde', 8.0, 'Hoofdstuk 5'], ['Latijn', 6.1, 'Vertalen'], ['Engels', 9.6, 'Speech'], ['Informatica', 7.9, 'Python']];
    const op = Object.keys(OPENING);
    const uit = [];
    for (let i = 0; i < lijst.length; i++) {
      const [vak, cijfer, onderwerp] = lijst[i];
      const d = window.__SPO.maakData({ vak, cijfer, onderwerp, weging: i % 3 + 1 });
      const lagen = art.maakKaartLagen(d);
      const kaart = art.maakMiniatuur ? art.maakMiniatuur(d, lagen) : art.maakAfbeelding(d, lagen).toDataURL('image/webp', 0.88);
      uit.push({ id: 'demo' + i, ts: Date.now() - i * 86400000 * 1.7, vak, cijfer, onderwerp, weging: i % 3 + 1, opening: op[i % op.length], tier: d.tier, kaart });
    }
    return uit;
  }

  async function start() {
    if (demo) { alle = await demoData(); render(); return; }
    try {
      const r = await chrome.storage.local.get('spo_galerij');
      alle = schoon(r.spo_galerij);
    } catch (_) { alle = []; }
    render();
    chrome.storage.onChanged.addListener((c, gebied) => {
      if (gebied === 'local' && c.spo_galerij) { alle = schoon(c.spo_galerij.newValue); render(); }
    });
  }
  start();
})();
