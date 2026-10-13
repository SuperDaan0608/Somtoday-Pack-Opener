/*
 * Somtoday Pack Opener v3.0: de Arcade-hoek (arcade.html). Vier mini-games: memory met je eigen kaarten, hoger of lager, kraslot en rad van fortuin.
 * Elk spel kost 5 munten (SPOEco.arcadeStart) en betaalt na afloop uit (SPOEco.arcadeKlaar). De dagelijkse limiet (10 spellen) en de
 * maximale winst per spel bewaakt economie.js. De spelregels en kansen staan in arcadelib.js. Alles blijft in deze browser; er zijn geen tekstvelden.
 * Toegankelijk: alles is een knop (Tab en Enter of spatie), uitslagen worden voorgelezen via aria-live, en bij 'minder beweging' zijn de animaties uit.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const E = globalThis.SPOEco;
  const A = globalThis.SPOArcade;
  const $ = (id) => document.getElementById(id);
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst != null) e.textContent = tekst; return e; };
  const fmt = (c) => String(Math.round(c * 10) / 10).replace('.', ',');
  const fmt1 = (c) => (Math.round(c * 10) / 10).toFixed(1).replace('.', ','); // altijd één decimaal: 8,0
  const stil = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const munten = (n) => `${n} ${n === 1 ? 'munt' : 'munten'}`;
  let melTimer = 0;
  let bezig = false; // er loopt een spel: niet nog een starten
  let huidig = 'memory';

  function meld(t, fout) { const m = $('melding'); m.textContent = t; m.classList.toggle('fout', !!fout); clearTimeout(melTimer); melTimer = setTimeout(() => (m.textContent = ''), 7000); }

  async function status() {
    const s = await E.arcadeStatus();
    $('saldo').textContent = String(s.saldo);
    $('dag-info').textContent = s.over > 0 ? `Vandaag nog ${s.over} van ${s.max} spellen.` : `Vandaag heb je alle ${s.max} spellen gespeeld. Kom morgen terug!`;
    return s;
  }
  const REDEN = { dagmax: 'Je hebt vandaag al 10 spellen gespeeld. Kom morgen terug!', 'te-weinig': 'Je hebt te weinig munten: een spel kost 5 munten.', onbekend: 'Dit spel kan nu niet starten.' };
  // Betaalt de inzet. Geeft het slot of null (met uitleg in de melding).
  async function betaal(spel) {
    if (bezig) return null;
    const r = await E.arcadeStart(spel);
    await status();
    if (!r.ok) { meld(REDEN[r.reden] || REDEN.onbekend, true); return null; }
    bezig = true;
    setKnoppen();
    return r.slot;
  }
  async function klaar(slot, spel, winst, tekst) {
    const r = await E.arcadeKlaar(slot, spel, winst);
    bezig = false;
    await status();
    setKnoppen();
    if (!r.ok) { meld('De uitbetaling is niet gelukt. Er is niets afgeschreven.', true); return; }
    meld(winst > 0 ? `${tekst} Je wint ${munten(winst)}!` : `${tekst} Helaas, je wint niets.`);
  }
  // Startknoppen aan of uit, afhankelijk van of er een spel loopt.
  function setKnoppen() {
    for (const id of ['memory-start', 'hoger-start', 'kras-start', 'rad-start']) $(id).disabled = bezig;
    document.querySelectorAll('.spelknop').forEach((b) => { b.disabled = bezig; });
  }

  // ───────── Spelkeuze ─────────
  function kies(spel) {
    if (bezig) return;
    huidig = spel;
    document.querySelectorAll('.spelknop').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.spel === spel)));
    for (const s of ['memory', 'hoger', 'kras', 'rad']) $('spel-' + s).hidden = s !== spel;
  }

  // ───────── 1. Memory ─────────
  async function leesGalerij() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) { const r = await chrome.storage.local.get('spo_galerij'); return Array.isArray(r.spo_galerij) ? r.spo_galerij : []; }
      const t = localStorage.getItem('spo_galerij'); const g = t ? JSON.parse(t) : []; return Array.isArray(g) ? g : []; // buiten de extensie (tests)
    } catch (e) { return []; }
  }
  async function memoryStart() {
    const tegels = A.memoryTegels(await leesGalerij());
    if (!tegels) { $('memory-stand').textContent = ''; meld(`Je hebt minstens ${A.MEMORY_PAREN} verschillende kaarten in je galerij nodig. Open eerst wat meer cijfers.`, true); return; }
    const slot = await betaal('memory');
    if (!slot) return;
    const bord = $('memory-bord');
    bord.replaceChildren();
    bord.hidden = false;
    let open = [], beurten = 0, gevonden = 0, wacht = false;
    const stand = () => { $('memory-stand').textContent = `Beurten: ${beurten}. Paren gevonden: ${gevonden} van ${A.MEMORY_PAREN}.`; };
    const naam = (t, i, toestand) => `Kaart ${i + 1} van ${tegels.length}, ${toestand}${toestand === 'dicht' ? '' : ': ' + t.vak + ' ' + fmt(t.cijfer)}`;
    const knoppen = tegels.map((t, i) => {
      const b = el('button', 'mem'); b.type = 'button';
      const voor = el('span', 'voor');
      if (t.kaart) { const img = new Image(); img.src = t.kaart; img.alt = ''; img.draggable = false; voor.append(img); }
      else { voor.append(el('span', 'cj', fmt(t.cijfer)), el('span', 'vk', t.vak)); }
      b.append(voor);
      b.setAttribute('aria-label', naam(t, i, 'dicht'));
      b.addEventListener('click', () => draai(i));
      bord.append(b);
      return b;
    });
    const zet = (i, toestand) => {
      const b = knoppen[i];
      b.classList.toggle('open', toestand === 'open');
      b.classList.toggle('klaar', toestand === 'gevonden');
      b.setAttribute('aria-label', naam(tegels[i], i, toestand));
      b.disabled = toestand === 'gevonden';
    };
    function draai(i) {
      if (wacht || open.includes(i) || knoppen[i].classList.contains('klaar')) return;
      open.push(i); zet(i, 'open');
      if (open.length < 2) return;
      beurten++;
      const [a, b] = open;
      if (tegels[a].paar === tegels[b].paar) {
        gevonden++; open = []; zet(a, 'gevonden'); zet(b, 'gevonden'); stand();
        if (gevonden === A.MEMORY_PAREN) { const w = A.memoryWinst(beurten); klaar(slot, 'memory', w, `Alle paren gevonden in ${beurten} beurten.`); }
        else meld('Een paar!');
      } else {
        wacht = true; stand();
        setTimeout(() => { zet(a, 'dicht'); zet(b, 'dicht'); open = []; wacht = false; knoppen[a].focus(); }, stil() ? 1400 : 900);
      }
    }
    stand();
    knoppen[0].focus();
  }

  // ───────── 2. Hoger of lager ─────────
  async function hogerStart() {
    const slot = await betaal('hoger');
    if (!slot) return;
    let c = A.hogerCijfer(), reeks = 0, klaarMet = false;
    const bord = $('hoger-bord');
    bord.hidden = false;
    const toon = (uitleg) => {
      $('hoger-cijfer').textContent = fmt1(c);
      const k = A.hogerKans(c);
      $('hoger-kans').textContent = uitleg || `Kans op hoger: ${Math.round(k * 100)}%. Kans op lager: ${Math.round((1 - k) * 100)}%.`;
      $('hoger-stand').textContent = `Goede gokken: ${reeks}. ${reeks ? 'Nu stoppen geeft ' + munten(A.hogerWinst(reeks)) + '.' : ''}`;
      $('hoger-stop').hidden = reeks < 1;
      $('hoger-stop').textContent = `Stoppen (${munten(A.hogerWinst(reeks))})`;
    };
    const eind = (winst, tekst) => {
      klaarMet = true;
      $('hoger-hoger').disabled = $('hoger-lager').disabled = $('hoger-stop').disabled = true;
      klaar(slot, 'hoger', winst, tekst);
    };
    const gok = (soort) => {
      if (klaarMet) return;
      const n = A.hogerVolgend(c);
      const goed = A.hogerGoed(c, n, soort);
      const was = c; c = n;
      if (!goed) { $('hoger-cijfer').textContent = fmt1(c); $('hoger-kans').textContent = `Het volgende cijfer was ${fmt1(c)}, na ${fmt1(was)}.`; $('hoger-stop').hidden = true; eind(0, `Fout: ${fmt1(c)} is niet ${soort} dan ${fmt1(was)}.`); return; }
      reeks++;
      if (reeks >= A.HOGER_MAX) { toon(`Het volgende cijfer was ${fmt1(c)}. Vijf keer goed!`); eind(A.hogerWinst(reeks), 'Vijf keer goed gegokt.'); return; }
      toon(`Goed! Het volgende cijfer was ${fmt1(c)}.`);
    };
    $('hoger-hoger').disabled = $('hoger-lager').disabled = $('hoger-stop').disabled = false;
    $('hoger-hoger').onclick = () => gok('hoger');
    $('hoger-lager').onclick = () => gok('lager');
    $('hoger-stop').onclick = () => { if (reeks >= 1) eind(A.hogerWinst(reeks), `Je stopt na ${reeks} goede ${reeks === 1 ? 'gok' : 'gokken'}.`); };
    toon();
    $('hoger-hoger').focus();
  }

  // ───────── 3. Kraslot ─────────
  async function krasStart() {
    const slot = await betaal('kras');
    if (!slot) return;
    const lot = A.krasLot();
    const sym = new Map(A.SYMBOLEN.map((s) => [s.id, s]));
    const bord = $('kras-bord');
    bord.replaceChildren();
    bord.hidden = false;
    const open = new Set();
    let afgelopen = false;
    const knoppen = lot.cellen.map((id, i) => {
      const b = el('button', 'kras'); b.type = 'button';
      b.append(el('span', '', 'Kras'));
      b.setAttribute('aria-label', `Vakje ${i + 1} van 6, nog dicht. Druk om open te krassen.`);
      b.addEventListener('click', () => onthul(i));
      bord.append(b);
      return b;
    });
    function onthul(i) {
      if (open.has(i) || afgelopen) return;
      open.add(i);
      const s = sym.get(lot.cellen[i]);
      const b = knoppen[i];
      b.classList.add('open'); b.replaceChildren(document.createTextNode(s.teken)); b.disabled = true;
      b.setAttribute('aria-label', `Vakje ${i + 1}: ${s.naam}`);
      $('kras-stand').textContent = `Open: ${open.size} van 6.`;
      if (open.size === 6) {
        afgelopen = true;
        $('kras-alles').hidden = true;
        if (lot.prijs > 0) knoppen.forEach((k, j) => { if (A.SYMBOLEN.find((x) => x.id === lot.cellen[j]).prijs === lot.prijs) k.classList.add('win'); });
        const win = lot.cellen.length && lot.prijs > 0 ? [...new Set(lot.cellen)].find((id) => lot.cellen.filter((x) => x === id).length >= 3 && sym.get(id).prijs === lot.prijs) : null;
        klaar(slot, 'kras', lot.prijs, win ? `Drie keer ${sym.get(win).naam.toLowerCase()}!` : 'Geen drie dezelfde.');
      }
    }
    $('kras-alles').hidden = false;
    $('kras-alles').onclick = () => { for (let i = 0; i < 6; i++) onthul(i); $('kras-start').focus(); };
    $('kras-stand').textContent = 'Open: 0 van 6.';
    knoppen[0].focus();
  }

  // ───────── 4. Rad van fortuin ─────────
  const KLEUREN = ['#ffd24a', '#5fd0ff', '#c58bff', '#7be39a', '#ff9b7a', '#ff7ac8'];
  let radHoek = 0;
  function tekenRad() {
    const svg = $('rad');
    const n = A.RAD.length, stap = 360 / n;
    const NS = 'http://www.w3.org/2000/svg';
    const punt = (hoek, r) => { const a = (hoek - 90) * Math.PI / 180; return [(r * Math.cos(a)).toFixed(2), (r * Math.sin(a)).toFixed(2)]; };
    A.RAD.forEach((w, i) => {
      const [x1, y1] = punt(i * stap, 100), [x2, y2] = punt((i + 1) * stap, 100);
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M0 0 L${x1} ${y1} A100 100 0 0 1 ${x2} ${y2} Z`);
      p.setAttribute('fill', w === 0 ? '#3a4060' : KLEUREN[i % KLEUREN.length]);
      p.setAttribute('stroke', '#0b0d1c'); p.setAttribute('stroke-width', '1.5');
      svg.append(p);
      const [tx, ty] = punt(i * stap + stap / 2, 68);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', tx); t.setAttribute('y', ty);
      t.setAttribute('transform', `rotate(${i * stap + stap / 2} ${tx} ${ty})`);
      if (w === 0) t.setAttribute('style', 'fill:#a5aec4');
      t.textContent = String(w);
      svg.append(t);
    });
  }
  async function radStart() {
    const slot = await betaal('rad');
    if (!slot) return;
    const i = A.radDraai();
    const n = A.RAD.length, stap = 360 / n;
    // Het midden van vak i moet onder de pijl (bovenaan) komen: draai het rad zodat dat vak op 0 graden staat, plus een paar volle rondes.
    radHoek += 360 * 4 + ((360 - ((i + 0.5) * stap) - (radHoek % 360)) % 360 + 360) % 360;
    $('rad-stand').textContent = 'Het rad draait...';
    const svg = $('rad');
    const winst = A.RAD[i];
    let gedaan = false;
    const af = () => { if (gedaan) return; gedaan = true; $('rad-stand').textContent = ''; klaar(slot, 'rad', winst, winst > 0 ? `Het rad stopt op ${winst}.` : 'Het rad stopt op niets.'); };
    if (stil()) { svg.style.transform = `rotate(${radHoek}deg)`; af(); return; }
    svg.addEventListener('transitionend', af, { once: true });
    setTimeout(af, 3600);
    requestAnimationFrame(() => { svg.style.transform = `rotate(${radHoek}deg)`; });
  }

  function start() {
    if (!E || !A) { meld('De arcade kan hier niet laden.', true); return; }
    tekenRad();
    document.querySelectorAll('.spelknop').forEach((b) => b.addEventListener('click', () => kies(b.dataset.spel)));
    $('memory-start').addEventListener('click', memoryStart);
    $('hoger-start').addEventListener('click', hogerStart);
    $('kras-start').addEventListener('click', krasStart);
    $('rad-start').addEventListener('click', radStart);
    status().catch(() => meld('Je munten konden niet worden gelezen.', true));
    try { if (chrome && chrome.storage) chrome.storage.onChanged.addListener((w, gebied) => { if (gebied === 'local' && (w.spo_munten || w.spo_munten_ids) && !bezig) status().catch(() => {}); }); } catch (e) { /* geen opslag */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
