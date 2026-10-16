/*
 * Somtoday Pack Opener v3.0: het Snelspel in de Arcade-hoek (arcade.html, tabblad 'Snelspel'): vier mini-games van ongeveer 20 seconden.
 * De regels staan in snelspellib.js; de munten en de dagelijkse limiet (15 potjes, 2 munten per goed potje) bewaakt economie.js (SPOEco.miniKlaar).
 * Alles blijft in deze browser en er zijn geen tekstvelden. Toegankelijk: alles is een knop (Tab en Enter), de toetsen 1 t/m 4 kiezen,
 * uitslagen worden voorgelezen via aria-live, en 'Zonder tijdsdruk' haalt de klok en de snelheidseis weg. Bij 'minder beweging' zijn animaties uit.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const E = globalThis.SPOEco;
  const S = globalThis.SPOSnelspel;
  const $ = (id) => document.getElementById(id);
  if (!E || !S || !$('deel-snel')) return;
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst != null) e.textContent = tekst; return e; };
  const fmt1 = (c) => (Math.round(c * 10) / 10).toFixed(1).replace('.', ',');
  const munten = (n) => `${n} ${n === 1 ? 'munt' : 'munten'}`;

  let gekozen = 'reactie';
  let potje = null; // { id, spel, rustig, ronde, goed, einde(), stop }

  // ───────── Tabbladen: Muntenspellen en Snelspel ─────────
  function kiesDeel(snel, focus) {
    $('dtab-munten').setAttribute('aria-selected', String(!snel)); $('dtab-munten').tabIndex = snel ? -1 : 0;
    $('dtab-snel').setAttribute('aria-selected', String(snel)); $('dtab-snel').tabIndex = snel ? 0 : -1;
    $('deel-munten').hidden = snel; $('deel-snel').hidden = !snel;
    if (focus) $(snel ? 'dtab-snel' : 'dtab-munten').focus();
    if (snel) status().catch(() => {});
  }

  async function status() {
    const s = await E.miniStatus();
    $('mini-info').textContent = s.over > 0 ? `Vandaag nog ${s.over} van ${s.max} potjes (2 munten per goed potje).` : `Vandaag heb je alle ${s.max} potjes gespeeld. Kom morgen terug!`;
    return s;
  }
  function zetMeld(t) { $('mini-stand').textContent = t; }

  // ───────── Spelkeuze ─────────
  function kies(spel) {
    if (potje) return;
    gekozen = spel;
    document.querySelectorAll('.snelknop').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.spel === spel)));
    uitleg();
  }
  function uitleg() {
    const sp = S.SPELLEN[gekozen];
    $('mini-uitleg').textContent = `${sp.naam}: ${$('mini-rustig').checked ? sp.uitlegRustig : sp.uitleg} Je moet ${sp.goed} van de ${sp.rondes} rondes goed hebben${$('mini-rustig').checked ? '' : ' binnen ' + S.DUUR + ' seconden'}.`;
  }
  function setKnoppen() {
    const bezig = !!potje;
    $('mini-start').disabled = bezig;
    $('mini-rustig').disabled = bezig;
    document.querySelectorAll('.snelknop').forEach((b) => { b.disabled = bezig; });
  }

  async function galerij() {
    try {
      if (chrome && chrome.storage && chrome.storage.local) { const r = await chrome.storage.local.get('spo_galerij'); return Array.isArray(r.spo_galerij) ? r.spo_galerij : []; }
      const t = localStorage.getItem('spo_galerij'); const g = t ? JSON.parse(t) : []; return Array.isArray(g) ? g : [];
    } catch (e) { return []; }
  }
  const stil = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // ───────── Een potje ─────────
  async function start() {
    if (potje) return;
    const s = await status();
    if (s.over <= 0) { zetMeld('Je hebt vandaag al 15 potjes gespeeld. Kom morgen terug!'); return; }
    const rustig = $('mini-rustig').checked;
    const sp = S.SPELLEN[gekozen];
    const bord = $('mini-bord');
    bord.replaceChildren(); bord.hidden = false;
    const p = potje = { id: S.potjeId(), spel: gekozen, rustig, ronde: 0, goed: 0, timers: [], klaar: false, keuze: null, tot: 0 };
    p.pool = gekozen === 'hoogste' ? await galerij() : null;
    setKnoppen();
    zetMeld('');
    const klok = $('mini-klok');
    klok.hidden = rustig;
    if (!rustig) {
      p.tot = performance.now() + S.DUUR * 1000;
      const tik = () => {
        const over = Math.max(0, p.tot - performance.now());
        $('mini-klok-tekst').textContent = `Nog ${Math.ceil(over / 1000)} s`;
        $('mini-klok-balk').style.width = (over / (S.DUUR * 10)).toFixed(1) + '%';
        if (over <= 0) eind(p);
      };
      p.klok = setInterval(tik, 100);
      tik();
    }
    volgende(p, sp);
  }
  const wacht = (p, f, ms) => { const t = setTimeout(() => { if (!p.klaar) f(); }, ms); p.timers.push(t); return t; };
  const ronde = (p) => `Ronde ${Math.min(p.ronde + 1, S.SPELLEN[p.spel].rondes)} van ${S.SPELLEN[p.spel].rondes}. Goed: ${p.goed}.`;

  function volgende(p, sp) {
    if (p.klaar) return;
    if (p.ronde >= sp.rondes) { eind(p); return; }
    p.keuze = null;
    ({ reactie: rReactie, schatting: rSchatting, hoogste: rHoogste, sorteer: rSorteer })[p.spel](p, sp);
  }
  // Uitslag van een ronde: kort laten zien en door naar de volgende.
  function antwoord(p, goed, tekst, knop) {
    if (p.klaar || p.keuze === 'af') return;
    p.keuze = 'af';
    if (goed) p.goed++;
    p.ronde++;
    zetMeld(`${goed ? 'Goed.' : 'Fout.'} ${tekst || ''} ${ronde(p)}`.replace(/\s+/g, ' ').trim());
    if (knop) knop.classList.add(goed ? 'goed' : 'fout');
    wacht(p, () => volgende(p, S.SPELLEN[p.spel]), stil() ? 900 : p.rustig ? 800 : 450);
  }
  // Maakt een rij knoppen. Elke knop heeft een naam; de toetsen 1 t/m 4 kiezen ook.
  function knoppen(bord, aantal, klas, maak, bijKlik) {
    const rij = el('div', 'mini-rij ' + klas);
    const lijst = [];
    for (let i = 0; i < aantal; i++) {
      const b = el('button', 'mini-knop'); b.type = 'button';
      maak(b, i);
      b.addEventListener('click', () => bijKlik(i, b));
      rij.append(b); lijst.push(b);
    }
    bord.replaceChildren(rij);
    return lijst;
  }

  // 1. Reactietest
  function rReactie(p) {
    const bord = $('mini-bord');
    const r = S.reactieRonde();
    const tok = p.tok = (p.tok || 0) + 1; // een oude timer van een vorige ronde doet niets meer
    const nu = () => !p.klaar && p.tok === tok && !p.keuze;
    let goudOp = 0;
    const lijst = knoppen(bord, 4, 'kaarten4', (b, i) => { b.append(el('span', 'rk', String(i + 1))); b.setAttribute('aria-label', `Kaart ${i + 1}, dicht`); }, (i, b) => {
      if (!nu()) return;
      if (!goudOp) { antwoord(p, false, 'Te vroeg.', b); return; }
      const ms = performance.now() - goudOp;
      const goed = S.reactieGoed(r, i, ms, p.rustig);
      antwoord(p, goed, goed ? (p.rustig ? '' : `${Math.round(ms)} milliseconden.`) : (i !== r.doel ? 'Dat was niet de gouden kaart.' : `Te traag: ${Math.round(ms)} milliseconden.`), b);
    });
    const goud = () => {
      if (!nu()) return;
      goudOp = performance.now();
      lijst[r.doel].classList.add('goud'); lijst[r.doel].setAttribute('aria-label', `Kaart ${r.doel + 1}, goud. Kies nu!`);
      zetMeld(`Kaart ${r.doel + 1} is goud!`);
      if (!p.rustig) wacht(p, () => { if (nu()) antwoord(p, false, 'Te traag.', null); }, 1500);
    };
    zetMeld(`${ronde(p)} Wacht tot een kaart goud wordt.`);
    if (p.rustig) goud(); else wacht(p, goud, r.wacht);
  }

  // 2. Cijferschatting
  function rSchatting(p) {
    const r = S.schattingRonde();
    const bord = $('mini-bord');
    const kaartjes = el('div', 'mini-cijfers');
    r.cijfers.forEach((c) => kaartjes.append(el('span', 'mini-cijfer', fmt1(c))));
    kaartjes.setAttribute('role', 'img');
    kaartjes.setAttribute('aria-label', `Drie cijfers: ${r.cijfers.map(fmt1).join(', ')}. Wat is het gemiddelde?`);
    const lijst = knoppen(bord, 3, 'opties3', (b, i) => { b.append(el('span', 'ok', String(i + 1)), document.createTextNode(' ' + fmt1(r.opties[i]))); b.setAttribute('aria-label', `Antwoord ${i + 1}: ${fmt1(r.opties[i])}`); }, (i, b) => {
      if (p.keuze) return;
      antwoord(p, i === r.goed, i === r.goed ? '' : `Het gemiddelde was ${fmt1(r.gem)}.`, b);
      lijst.forEach((x) => { x.disabled = true; });
    });
    bord.prepend(el('p', 'mini-vraag', 'Wat is het gemiddelde?'));
    bord.insertBefore(kaartjes, bord.children[1]);
    zetMeld(`${ronde(p)} Drie cijfers: ${r.cijfers.map(fmt1).join(', ')}. Wat is het gemiddelde? Antwoord 1: ${fmt1(r.opties[0])}, 2: ${fmt1(r.opties[1])}, 3: ${fmt1(r.opties[2])}.`);
  }

  // 3. Hoogste kaart
  function rHoogste(p) {
    const r = S.hoogsteRonde(p.pool);
    const bord = $('mini-bord');
    const lijst = knoppen(bord, 4, 'kaarten4', (b, i) => {
      b.append(el('span', 'ok', String(i + 1)), el('span', 'hk-cijfer', fmt1(r.kaarten[i].cijfer)), el('span', 'hk-vak', r.kaarten[i].vak));
      b.setAttribute('aria-label', `Kaart ${i + 1}: ${r.kaarten[i].vak}, ${fmt1(r.kaarten[i].cijfer)}`);
    }, (i, b) => {
      if (p.keuze) return;
      antwoord(p, i === r.goed, i === r.goed ? '' : `De hoogste was kaart ${r.goed + 1}: ${fmt1(r.kaarten[r.goed].cijfer)}.`, b);
      lijst.forEach((x) => { x.disabled = true; }); lijst[r.goed].classList.add('goed');
    });
    bord.prepend(el('p', 'mini-vraag', 'Welke kaart heeft het hoogste cijfer?'));
    zetMeld(`${ronde(p)} Welke kaart heeft het hoogste cijfer?`);
  }

  // 4. Sorteer op ladder
  function rSorteer(p) {
    const r = S.sorteerRonde();
    const bord = $('mini-bord');
    const al = [];
    const lijst = knoppen(bord, 4, 'kaarten4', (b, i) => { b.append(el('span', 'ok', String(i + 1)), el('span', 'hk-cijfer sl', S.TREDEN[r.treden[i]])); b.setAttribute('aria-label', `Kaartje ${i + 1}: ${S.TREDEN[r.treden[i]]}`); }, (i, b) => {
      if (p.keuze || al.includes(i)) return;
      const u = S.sorteerStap(r, al, i);
      if (u === 'fout') { lijst.forEach((x) => { x.disabled = true; }); antwoord(p, false, `Dat was niet de volgende. De goede volgorde was: ${r.volgorde.map((x) => S.TREDEN[r.treden[x]]).join(', ')}.`, b); return; }
      al.push(i); b.disabled = true; b.classList.add('gekozen'); b.setAttribute('aria-label', `Kaartje ${i + 1}: ${S.TREDEN[r.treden[i]]}, als nummer ${al.length} gekozen`);
      if (u === 'klaar') antwoord(p, true, '', b); else zetMeld(`Goed. Kies nu het volgende kaartje. ${ronde(p)}`);
    });
    bord.prepend(el('p', 'mini-vraag', 'Klik de kaartjes van laag naar hoog.'));
    zetMeld(`${ronde(p)} Klik de kaartjes van laag naar hoog.`);
  }

  // ───────── Einde ─────────
  async function eind(p) {
    if (p.klaar) return;
    p.klaar = true;
    clearInterval(p.klok); p.timers.forEach(clearTimeout);
    const sp = S.SPELLEN[p.spel];
    const goed = S.gehaald(p.spel, p.goed);
    $('mini-klok').hidden = true;
    $('mini-bord').hidden = true; $('mini-bord').replaceChildren();
    let uit;
    try { uit = await E.miniKlaar(p.id, p.spel, goed); } catch (e) { uit = { ok: false }; }
    potje = null;
    setKnoppen();
    let t = `${sp.naam}: ${p.goed} van ${sp.rondes} goed. `;
    if (!uit.ok) t += 'De uitbetaling is niet gelukt. Er is niets afgeschreven.';
    else if (uit.dagmax) t += goed ? 'Gehaald, maar je hebt vandaag al 15 potjes gespeeld, dus geen munten meer.' : 'Niet gehaald. Je hebt vandaag al 15 potjes gespeeld.';
    else t += goed ? `Gehaald! Je wint ${munten(uit.munten)}.` : `Niet gehaald: je had ${sp.goed} goed nodig.`;
    zetMeld(t);
    try { await status(); const s = await E.miniStatus(); $('saldo').textContent = String(s.saldo); } catch (e) { /* de volgende keer */ }
    $('mini-start').focus();
  }

  // ───────── Toetsen ─────────
  document.addEventListener('keydown', (ev) => {
    if (!potje || potje.klaar || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const n = ev.key >= '1' && ev.key <= '4' ? Number(ev.key) - 1 : -1;
    if (n < 0) return;
    const knop = $('mini-bord').querySelectorAll('.mini-knop')[n];
    if (knop && !knop.disabled) { ev.preventDefault(); knop.click(); }
  });
  const tabs = ['dtab-munten', 'dtab-snel'];
  for (const id of tabs) {
    $(id).addEventListener('click', () => kiesDeel(id === 'dtab-snel', false));
    $(id).addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft' || ev.key === 'Home' || ev.key === 'End') {
        ev.preventDefault();
        kiesDeel(ev.key === 'ArrowRight' || ev.key === 'End' ? true : ev.key === 'Home' || ev.key === 'ArrowLeft' ? false : id !== 'dtab-snel', true);
      }
    });
  }
  document.querySelectorAll('.snelknop').forEach((b) => b.addEventListener('click', () => kies(b.dataset.spel)));
  $('mini-start').addEventListener('click', () => { start().catch(() => { potje = null; setKnoppen(); zetMeld('Het spel kan nu niet starten.'); }); });
  $('mini-rustig').addEventListener('change', uitleg);
  uitleg();
})();
