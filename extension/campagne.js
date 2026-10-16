/*
 * Somtoday Pack Opener v3.0: de Campagne (campagne.html). Vier werelden met vijf niveaus; het vijfde niveau is de eindbaas.
 * De regels van een potje staan in kaartspellib.js, de werelden en de decks van de tegenstanders in campagnelib.js, de tekeningen in campagne-art.js (canvas 2D),
 * de munten en de eenmalige beloningen (met een dagelijkse limiet voor herhalingen) in economie.js (campagneKlaar).
 * Opslag: spo_campagne (voortgang per wereld, sterren en je deck; geen vaknamen). Geen tekstvelden.
 * Toegankelijk: alles is een knop (Tab, Enter, spatie; cijfertoetsen 1 tot 5 spelen een kaart of kiezen een vergelijking), uitslagen worden voorgelezen via aria-live,
 * en bij 'minder beweging' zijn de animaties kort of uit.
 */
(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const G = globalThis.SPOGevecht;
  const K = globalThis.SPOKaartspel;
  const E = globalThis.SPOEco;
  const C = globalThis.SPOCampagne;
  const ART = globalThis.SPOCampagneArt;
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const GLOED = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
  const $ = (id) => document.getElementById(id);
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst != null) e.textContent = tekst; return e; };
  const fmt = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',');
  const stil = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const slaap = (ms) => new Promise((r) => setTimeout(r, stil() ? Math.min(ms, 250) : ms));
  const munten = (n) => `${n} ${n === 1 ? 'munt' : 'munten'}`;
  const sterTekst = (n) => `${n} ${n === 1 ? 'ster' : 'sterren'} van 3`;

  let staat = C.schoon(null), galerij = [], deckIds = [], geluidAan = true, melTimer = 0;
  let huidig = null;   // { wereld, niveau } van het scherm of potje
  let spel = null;

  function meld(t, fout) { const m = $('melding'); m.textContent = t; m.classList.toggle('fout', !!fout); clearTimeout(melTimer); melTimer = setTimeout(() => (m.textContent = ''), 8000); }
  function speel(naam, vol) {
    if (!geluidAan) return;
    try { const a = new Audio('sounds/' + naam + '.mp3'); a.volume = vol === undefined ? 0.6 : vol; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* geen geluid */ }
  }

  // ---- kaarten ----
  const mijnKaart = (e) => { const t = Math.max(0, Math.min(4, e.trede | 0)) || (e.zeldzaam === true ? 1 : 0); return { vak: e.vak, cijfer: e.cijfer, tier: e.tier | 0, t, z: t >= 1, v: e.vloek === true && !(e.heel > 0), h: e.vloek === true && e.heel > 0, kaart: e.kaart, id: e.id }; };
  const sterkteVan = (e) => G.sterkte(mijnKaart(e));
  function kaartNaam(k) {
    const g = K.groepVan(k);
    return `${k.naam ? k.naam + ' (baaskaart), ' : ''}${k.vak} ${fmt(k.cijfer)}, ${NIVEAUS[k.tier | 0]}${k.t ? ', ' + globalThis.SPOLadder.label(k.t) : ''}${g ? ', ' + K.GROEP_NAAM[g] : ''}${k.v ? ', vervloekt' : k.h ? ', vloek opgeheven' : ''}`;
  }
  function kaartEl(k) {
    const d = el('div', 'mk');
    d.style.setProperty('--gl', GLOED[Math.max(0, Math.min(4, k.tier | 0))]);
    if (k.kaart) { const img = new Image(); img.src = k.kaart; img.alt = ''; img.draggable = false; d.append(img); d.classList.add('met-plaatje'); }
    else {
      d.append(el('span', 'mk-cj', fmt(k.cijfer)), el('span', 'mk-vk', k.naam || k.vak || ''));
      if (k.t) d.append(el('i', 'mk-z', globalThis.SPOLadder.KORT[k.t]));
    }
    const g = K.groepVan(k), gr = el('span', 'mk-gr');
    const def = G.GROEPEN.find((x) => x.id === g);
    if (def) gr.style.setProperty('--gr', def.kleur);
    d.append(gr);
    d.setAttribute('role', 'img'); d.setAttribute('aria-label', kaartNaam(k));
    return d;
  }
  const rugEl = () => { const d = el('div', 'mk rug'); d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'Kaart met de rug naar boven'); return d; };

  // ---- opslag ----
  async function leesOpslag() {
    try { staat = C.schoon(await L.lees(C.SLEUTEL)); deckIds = staat.deck.slice(); } catch (e) { staat = C.schoon(null); }
  }
  // Leest de nieuwste versie, past `fn` toe en bewaart (zodat een tweede tabblad niets overschrijft).
  async function wijzig(fn) {
    let nu; try { nu = C.schoon(await L.lees(C.SLEUTEL)); } catch (e) { nu = C.schoon(null); }
    const n = C.schoon(fn(nu) || nu);
    try { await L.schrijf(C.SLEUTEL, n); } catch (e) { /* niet erg */ }
    staat = n; return n;
  }
  const bewaarDeck = () => wijzig((s) => Object.assign(s, { deck: deckIds.slice(0, K.DECK), ts: Date.now() }));
  async function status() {
    const s = await E.campagneStatus();
    $('saldo').textContent = String(s.saldo);
    $('dag-info').textContent = s.over > 0 ? `Vandaag nog ${s.over} van ${s.max} herhalingen die munten opleveren. Een niveau voor het eerst winnen levert altijd munten op.` : `Vandaag heb je alle ${s.max} beloonde herhalingen gehad. Voor het eerst winnen levert nog wel munten op.`;
    return s;
  }

  // ---- deck kiezen ----
  const deckKaarten = () => deckIds.map((id) => galerij.find((e) => e.id === id)).filter(Boolean).map(mijnKaart);
  const deckKlaar = () => deckKaarten().length === K.DECK;
  function tekenDeck() {
    deckIds = deckIds.filter((id) => galerij.some((e) => e.id === id)).slice(0, K.DECK);
    const rij = $('deck-slots'); rij.replaceChildren();
    for (let i = 0; i < K.DECK; i++) {
      const e = galerij.find((x) => x.id === deckIds[i]);
      const s = el('div', 'deck-vak' + (e ? ' vol' : ''), e ? '' : String(i + 1)); s.setAttribute('role', 'listitem');
      if (e) { const c = kaartEl(mijnKaart(e)); c.style.setProperty('--kw', '56px'); s.append(c); } else s.setAttribute('aria-label', `Plek ${i + 1}, nog leeg`);
      rij.append(s);
    }
    $('deck-stand').textContent = `${deckIds.length} van ${K.DECK} kaarten gekozen.`;
    $('deck-leeg').disabled = !deckIds.length;
    $('geen-galerij').hidden = galerij.length >= K.DECK;
    $('deck-beste').disabled = galerij.length < K.DECK;
    $('w-deck-melding').hidden = deckKlaar();
    tekenKies();
    if (huidig && !$('wereld-scherm').hidden) tekenNiveaus();
  }
  function tekenKies() {
    const ul = $('kies'); ul.replaceChildren();
    const lijst = galerij.slice().sort((a, b) => sterkteVan(b) - sterkteVan(a));
    for (const e of lijst) {
      const li = el('li'); const b = el('button', 'kies-kaart'); b.type = 'button';
      const aan = deckIds.includes(e.id), vol = deckIds.length >= K.DECK;
      b.setAttribute('aria-pressed', String(aan));
      b.setAttribute('aria-label', kaartNaam(mijnKaart(e)) + (aan ? ', in je deck' : ''));
      b.disabled = !aan && vol;
      if (e.kaart) { const img = new Image(); img.src = e.kaart; img.alt = ''; img.loading = 'lazy'; img.draggable = false; b.append(img); }
      else { const c = kaartEl(mijnKaart(e)); c.style.setProperty('--kw', '78px'); c.style.width = '100%'; b.append(c); }
      if (aan) b.append(el('i', 'kies-vink', String(deckIds.indexOf(e.id) + 1)));
      b.addEventListener('click', () => { deckIds = aan ? deckIds.filter((x) => x !== e.id) : deckIds.concat(e.id); bewaarDeck(); tekenDeck(); });
      li.append(b); ul.append(li);
    }
  }
  $('deck-beste').addEventListener('click', () => { deckIds = galerij.slice().sort((a, b) => sterkteVan(b) - sterkteVan(a)).slice(0, K.DECK).map((e) => e.id); bewaarDeck(); tekenDeck(); });
  $('deck-leeg').addEventListener('click', () => { deckIds = []; bewaarDeck(); tekenDeck(); });
  $('geluid').addEventListener('click', () => { geluidAan = !geluidAan; $('geluid').setAttribute('aria-pressed', String(geluidAan)); $('geluid').textContent = geluidAan ? 'Geluid aan' : 'Geluid uit'; });

  // ---- de werelden en de niveaus ----
  function sterrenEl(n, klein) {
    const s = el('span', 'sterren'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', sterTekst(n));
    for (let i = 0; i < 3; i++) s.append(Object.assign(el('span', i < n ? '' : 'uit', i < n ? '★' : '☆'), { ariaHidden: 'true' }));
    return s;
  }
  function tekenWereldCanvas(c, w) {
    const x = c.getContext && c.getContext('2d');
    if (!x) return;
    ART.achtergrond(x, w.id, c.width, c.height);
    ART.teken(x, w.wezen, c.width, c.height);
  }
  function tekenWerelden() {
    const ul = $('werelden'); ul.replaceChildren();
    C.WERELDEN.forEach((w) => {
      const li = el('li'); const b = el('button', 'wereld-knop'); b.type = 'button'; b.style.setProperty('--wk', w.kleur);
      const gew = C.gewonnen(staat, w.id), klaar = C.voltooid(staat, w.id);
      const cv = el('canvas'); cv.width = 270; cv.height = 150; cv.setAttribute('aria-hidden', 'true'); tekenWereldCanvas(cv, w);
      b.append(cv, el('strong', '', w.naam), el('small', '', `Eindbaas: ${w.baas} (${w.groep})`), el('small', klaar ? 'klaar' : '', klaar ? 'Voltooid' : `${gew} van ${C.NIVEAUS} niveaus gewonnen`));
      b.setAttribute('aria-label', `${w.naam}, eindbaas ${w.baas}, vakgroep ${w.groep}. ${klaar ? 'Voltooid' : gew + ' van ' + C.NIVEAUS + ' niveaus gewonnen'}`);
      b.addEventListener('click', () => naarWereld(w.id));
      li.append(b); ul.append(li);
    });
    const v = C.aantalVoltooid(staat);
    $('k-voortgang').textContent = `${v} van ${C.WERELDEN.length} werelden voltooid, ${C.totaalSterren(staat)} van ${C.WERELDEN.length * C.NIVEAUS * 3} sterren.`;
  }
  function toon(scherm) {
    for (const id of ['kaart-scherm', 'wereld-scherm', 'tafel']) $(id).hidden = id !== scherm;
    $('einde').hidden = true;
  }
  function naarKaart() {
    if (spel) { spel.stop(); spel = null; }
    huidig = null; toon('kaart-scherm'); tekenWerelden(); tekenDeck(); status();
    $('k-titel').focus();
  }
  function naarWereld(id, focusNiveau) {
    if (spel) { spel.stop(); spel = null; }
    const w = C.wereld(id); if (!w) return;
    huidig = { wereld: id, niveau: 0 }; toon('wereld-scherm');
    $('wereld-scherm').style.setProperty('--wk', w.kleur);
    $('w-titel').textContent = w.naam; $('w-uitleg').textContent = w.beschrijving;
    $('w-baas').textContent = `Thema-voordeel van de baas: ${w.baas} speelt alleen met kaarten uit ${w.groep}, en die zijn ${fmt(C.BAAS_BONUS)} punt sterker. Hij heeft ook een eigen baaskaart.`;
    $('w-canvas').style.setProperty('--wk', w.kleur); tekenWereldCanvas($('w-canvas'), w);
    $('w-deck-melding').hidden = deckKlaar();
    tekenNiveaus(); status();
    const doel = focusNiveau && $('niveaus').children[focusNiveau - 1];
    if (doel && doel.querySelector('button:not(:disabled)')) doel.querySelector('button').focus(); else $('w-titel').focus();
  }
  function tekenNiveaus() {
    if (!huidig) return;
    const w = C.wereld(huidig.wereld), ol = $('niveaus'); ol.replaceChildren();
    const open = C.openNiveau(staat, w.id), s = staat.w[w.id].s;
    for (let n = 1; n <= C.NIVEAUS; n++) {
      const li = el('li'); const baas = n === C.NIVEAUS;
      const b = el('button', 'niveau-knop' + (baas ? ' baas' : '')); b.type = 'button';
      const slot = n > open, kan = !slot && deckKlaar();
      b.disabled = !kan;
      const naam = C.tegenstanderNaam(w.id, n);
      const deck = C.maakDeck(w.id, n), gem = deck.reduce((a, k) => a + k.cijfer, 0) / deck.length;
      b.append(el('span', 'nr', String(n)), el('strong', '', baas ? `Eindbaas: ${naam}` : naam), sterrenEl(s[n - 1]), el('small', '', slot ? `Win eerst niveau ${n - 1}.` : `Gemiddeld cijfer van het deck: ${fmt(gem)}${baas ? ', met thema-voordeel' : ''}`));
      b.setAttribute('aria-label', `Niveau ${n}, ${baas ? 'eindbaas ' : ''}${naam}. ${slot ? 'Nog op slot, win eerst niveau ' + (n - 1) + '.' : s[n - 1] ? sterTekst(s[n - 1]) + ' behaald.' : 'Nog niet gewonnen.'}${!slot && !deckKlaar() ? ' Kies eerst een deck van 5 kaarten.' : ''}`);
      b.addEventListener('click', () => startPotje(w.id, n));
      li.append(b); ol.append(li);
    }
  }
  $('w-terug').addEventListener('click', naarKaart);

  // ---- het potje ----
  function maakSpel(o) {
    const sp = Object.assign({ volg: null, dood: false, keuze: { vgl: null, kaart: null }, klaar: false }, o);
    sp.wacht = () => new Promise((res) => { sp.volg = res; if (sp.dood) res(null); });
    sp.geef = (v) => { const f = sp.volg; sp.volg = null; if (f) f(v); };
    sp.stop = () => { sp.dood = true; sp.geef(null); };
    return sp;
  }
  function startPotje(wereldId, niveau) {
    if (spel || !deckKlaar()) return;
    const w = C.wereld(wereldId), hun = C.maakDeck(wereldId, niveau);
    if (!w || !hun) return;
    const baasKaart = hun.find((k) => k.baas);
    if (baasKaart) baasKaart.kaart = ART.baasKaart(w.wezen, baasKaart.naam, fmt(baasKaart.cijfer), w.id);
    const mijn = deckKaarten();
    const p = K.nieuwPotje(mijn, hun, Math.random() < 0.5 ? 'ik' : 'zij');
    huidig = { wereld: wereldId, niveau };
    const naam = C.tegenstanderNaam(wereldId, niveau);
    spel = maakSpel({ p, naam, wereld: w, niveau });
    toon('tafel');
    $('tafel').style.setProperty('--wk', w.kleur);
    $('naam-zij').textContent = naam;
    $('score-ik').textContent = '0'; $('score-zij').textContent = '0';
    const br = $('baas-regel'); br.hidden = niveau !== C.NIVEAUS;
    br.textContent = `Eindbaas ${naam}: alleen kaarten uit ${w.groep}, ${fmt(C.BAAS_BONUS)} punt sterker, plus een baaskaart.`;
    tekenHunDeck(); tekenHand(); wisArena();
    $('t-titel').textContent = `${w.naam}, niveau ${niveau}: ${naam}`;
    $('t-titel').focus();
    speelPotje(spel);
  }
  function tekenHunDeck() {
    const w = $('hun-deck'); w.replaceChildren();
    spel.p.zij.forEach((k, j) => { const c = kaartEl(k); c.setAttribute('role', 'listitem'); c.id = 'hun-' + j; w.append(c); });
  }
  function tekenHand() {
    const h = $('hand'); h.replaceChildren();
    spel.p.ik.forEach((k, i) => {
      const b = el('button', 'hand-kaart'); b.type = 'button'; b.id = 'hand-' + i; b.disabled = true;
      b.style.setProperty('--rot', (i - 2) * 4 + 'deg'); b.style.setProperty('--y', Math.abs(i - 2) * 5 + 'px');
      b.setAttribute('aria-label', `Kaart ${i + 1}: ${kaartNaam(k)}`); b.setAttribute('aria-keyshortcuts', String(i + 1));
      b.append(kaartEl(k));
      b.addEventListener('click', () => kiesKaart(i));
      h.append(b);
    });
  }
  function kiesKaart(i) {
    if (!spel || !spel.kaartOpen || !K.over(spel.p, 'ik').includes(i)) return;
    spel.kaartOpen = false; zetHand(false); spel.geef(i);
  }
  function zetHand(aan) {
    const gespeeld = spel ? spel.p.gebruikt.ik : [];
    document.querySelectorAll('.hand-kaart').forEach((b, i) => { b.disabled = !aan || gespeeld.includes(i); });
    $('hand').classList.toggle('wacht', !aan);
  }
  function wisArena() { for (const id of ['slot-ik', 'slot-zij']) { const s = $(id); s.replaceChildren(); s.classList.remove('wint', 'verliest'); } $('vgl-badge').textContent = ''; $('vgl-knoppen').hidden = true; }
  const tekst = (t) => { $('tafel-tekst').textContent = t; };
  function vglKnoppen(aan) {
    const w = $('vgl-knoppen'); w.replaceChildren(); w.hidden = !aan;
    if (!aan) return;
    K.VGL_IDS.forEach((id, n) => {
      const b = el('button', 'vgl-knop'); b.type = 'button'; b.dataset.vgl = id; b.setAttribute('aria-keyshortcuts', String(n + 1));
      b.append(el('strong', '', K.VGL[id].naam), el('small', '', K.VGL[id].uitleg));
      b.addEventListener('click', () => { if (spel && spel.vglOpen) { spel.vglOpen = false; spel.geef(id); } });
      w.append(b);
    });
    w.firstChild.focus();
  }
  function vlieg(naar, kaart, vanEl) {
    naar.replaceChildren(kaart);
    if (stil() || !naar.animate || !vanEl) return;
    const a = vanEl.getBoundingClientRect(), b = naar.getBoundingClientRect();
    const s = a.width / Math.max(1, b.width);
    kaart.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${s}) rotate(-6deg)`, opacity: 0.9 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  async function draai(naar, kaart) {
    const rug = rugEl(); naar.replaceChildren(rug);
    if (!stil() && naar.animate) {
      await rug.animate([{ transform: 'translateY(-60px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'both' }).finished.catch(() => {});
      await slaap(250);
      await rug.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], { duration: 180, fill: 'forwards' }).finished.catch(() => {});
      naar.replaceChildren(kaart);
      await kaart.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], { duration: 220, easing: 'ease-out' }).finished.catch(() => {});
    } else naar.replaceChildren(kaart);
  }
  function pop(id) { const e = $(id); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }

  async function speelPotje(sp) {
    const p = sp.p;
    try {
      while (!K.eind(p)) {
        if (sp.dood) return;
        const r = p.r, kz = K.kiezer(p);
        sp.pcKeuze = null;
        $('ronde-info').textContent = `Ronde ${r + 1} van ${K.DECK}`;
        $('kiezer-info').textContent = kz === 'ik' ? 'Jij kiest de vergelijking' : `${sp.naam} kiest de vergelijking`;
        wisArena(); zetHand(false);
        let vgl;
        if (kz === 'ik') {
          tekst('Jij kiest hoe de kaarten worden vergeleken.'); sp.vglOpen = true; vglKnoppen(true);
          vgl = await sp.wacht(); vglKnoppen(false);
        } else {
          tekst(`${sp.naam} kiest de vergelijking…`); await slaap(900);
          sp.pcKeuze = K.computerKiest(p, Math.random); vgl = sp.pcKeuze.vgl;
        }
        if (sp.dood || !vgl) return;
        const badge = $('vgl-badge'); badge.textContent = K.VGL[vgl].naam; badge.classList.remove('nieuw'); void badge.offsetWidth; badge.classList.add('nieuw'); speel('tik', 0.5);
        tekst(`${K.VGL[vgl].naam}: ${K.VGL[vgl].uitleg} Kies een kaart.`);
        sp.kaartOpen = true; zetHand(true);
        const eerste = document.querySelector('.hand-kaart:not(:disabled)'); if (eerste) eerste.focus();
        const i = await sp.wacht();
        if (sp.dood || i === null) return;
        tekst('De tegenstander legt een kaart…');
        const j = kz === 'zij' && sp.pcKeuze ? sp.pcKeuze.j : K.computerAntwoordt(p, vgl, Math.random);
        await onthul(sp, r, i, j, vgl);
      }
      if (!sp.dood) await afronden(sp);
    } catch (e) {
      if (!sp.klaar && !sp.dood) { sp.klaar = true; meld(e && e.message ? e.message : 'Het potje is gestopt.', true); naarWereld(sp.wereld.id); }
    }
  }
  async function onthul(sp, r, i, j, vgl) {
    const p = sp.p;
    const hb = $('hand-' + i);
    vlieg($('slot-ik'), kaartEl(p.ik[i]), hb ? hb.querySelector('.mk') : null);
    if (hb) hb.classList.add('gespeeld');
    speel('whoosh', 0.5);
    await draai($('slot-zij'), kaartEl(p.zij[j]));
    if (sp.dood) return;
    speel('klik', 0.6);
    const rij = K.speelRonde(p, vgl, i, j);
    if (!rij) throw new Error('Deze ronde kon niet worden gespeeld.');
    const w = rij.winnaar;
    $('slot-ik').classList.toggle('wint', w === 'ik'); $('slot-ik').classList.toggle('verliest', w === 'zij');
    $('slot-zij').classList.toggle('wint', w === 'zij'); $('slot-zij').classList.toggle('verliest', w === 'ik');
    $('hun-' + j).classList.add('weg');
    $('score-ik').textContent = String(p.score.ik); $('score-zij').textContent = String(p.score.zij);
    if (w) pop(w === 'ik' ? 'score-ik' : 'score-zij');
    const a = p.ik[i], b = p.zij[j];
    tekst(`Ronde ${r + 1}, ${K.VGL[vgl].naam}: ${a.vak} ${fmt(a.cijfer)} tegen ${b.naam || b.vak} ${fmt(b.cijfer)}. ${w === 'ik' ? 'Jij wint de ronde!' : w === 'zij' ? sp.naam + ' wint de ronde.' : 'Gelijkspel, niemand krijgt een punt.'} Stand: ${p.score.ik} - ${p.score.zij}.`);
    speel(w === 'ik' ? 'goud' : w === 'zij' ? 'boem' : 'stap', 0.5);
    await slaap(K.eind(p) ? 1500 : 2200);
  }

  async function afronden(sp) {
    if (sp.klaar) return;
    sp.klaar = true;
    const p = sp.p, w = sp.wereld, n = sp.niveau;
    $('hand').querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const u = K.uitslag(p), gewonnen = u === 'w';
    const aantal = gewonnen ? C.sterren(p.score) : 0;
    let uitleg = '';
    let wereldKlaar = false;
    if (gewonnen) {
      const eerder = C.gewonnen(staat, w.id);
      await wijzig((s) => C.registreer(s, w.id, n, aantal));
      try {
        const r = await E.campagneKlaar(w.id, n);
        if (r && r.ok) {
          wereldKlaar = r.wereldKlaar;
          const delen = [];
          if (r.munten > 0) delen.push(r.eerste ? `Eerste keer gewonnen: je krijgt ${munten(r.munten)}.` : `Je krijgt ${munten(r.munten)}.`);
          else if (r.dagmax) delen.push('Je hebt vandaag al 3 herhalingen met munten gehad, dus nu geen munten meer. Morgen weer!');
          if (r.wereldKlaar) delen.push(`Wereld voltooid! Je krijgt de titel ${E.PER_ID.get(w.titel).naam} en de kaartkleuren ${E.PER_ID.get(w.thema).naam} (te kiezen in de Winkel).`);
          uitleg = delen.join(' ');
        } else uitleg = 'De beloning is niet uitgekeerd.';
      } catch (e) { uitleg = 'De beloning is niet uitgekeerd.'; }
      if (n > eerder && n < C.NIVEAUS) uitleg += ` Niveau ${n + 1} is nu open.`;
      await status();
    } else uitleg = u === 'g' ? 'Gelijkspel telt niet als winst. Probeer het nog eens.' : 'Niet gelukt. Pas eventueel je deck aan en probeer het nog eens.';
    $('einde-kop').textContent = gewonnen ? (n === C.NIVEAUS ? `Je verslaat ${sp.naam}!` : 'Je wint het niveau!') : u === 'g' ? 'Gelijkspel' : `${sp.naam} wint`;
    $('einde-stand').textContent = `${p.score.ik} - ${p.score.zij}`;
    const st = $('einde-sterren'); st.replaceChildren();
    if (gewonnen) { st.setAttribute('aria-label', sterTekst(aantal)); st.setAttribute('role', 'img'); for (let i = 0; i < 3; i++) st.append(Object.assign(el('span', i < aantal ? '' : 'uit', i < aantal ? '★' : '☆'), { ariaHidden: 'true' })); } else st.removeAttribute('aria-label');
    $('einde-tekst').textContent = uitleg;
    $('einde-volgende').hidden = !(gewonnen && n < C.NIVEAUS);
    const e = $('einde'); e.hidden = false; $('einde-kop').focus();
    if (gewonnen) { speel('gejuich', 0.7); confetti(); } else if (u === 'v') speel('sluiter', 0.4);
    sp.eindUitslag = u; sp.wereldKlaar = wereldKlaar;
  }

  function confetti() {
    if (stil()) return;
    const c = $('confetti'), ctx = c.getContext && c.getContext('2d');
    if (!ctx) return;
    c.width = innerWidth; c.height = innerHeight;
    const kleuren = ['#ffd24a', '#ff7a3d', '#5fd0ff', '#c58bff', '#7be39a'];
    const dl = Array.from({ length: 120 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, s: 4 + Math.random() * 6, k: kleuren[(Math.random() * kleuren.length) | 0], rot: Math.random() * 6 }));
    let f = 0;
    (function tik() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const d of dl) { d.x += d.vx; d.y += d.vy; d.rot += 0.1; ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.fillStyle = d.k; ctx.fillRect(-d.s / 2, -d.s / 2, d.s, d.s * 0.6); ctx.restore(); }
      if (++f < 180 && !$('einde').hidden) requestAnimationFrame(tik); else ctx.clearRect(0, 0, c.width, c.height);
    })();
  }

  $('einde-terug').addEventListener('click', () => { const id = huidig && huidig.wereld; if (id) naarWereld(id, huidig.niveau); else naarKaart(); });
  $('einde-nog').addEventListener('click', () => { const h = huidig; if (spel) { spel.stop(); spel = null; } if (h) startPotje(h.wereld, h.niveau); });
  $('einde-volgende').addEventListener('click', () => { const h = huidig; if (spel) { spel.stop(); spel = null; } if (h && h.niveau < C.NIVEAUS) startPotje(h.wereld, h.niveau + 1); });
  $('opgeven').addEventListener('click', () => {
    if (!spel || spel.klaar) return;
    const id = spel.wereld.id, n = spel.niveau; spel.stop(); spel.klaar = true; spel = null;
    meld('Je hebt het potje opgegeven. Dat levert niets op.'); naarWereld(id, n);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && spel && !spel.klaar) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Escape' && !$('einde').hidden) { e.preventDefault(); e.stopPropagation(); $('einde-terug').click(); return; }
    if (!spel || spel.klaar || e.ctrlKey || e.metaKey || e.altKey || !/^[1-5]$/.test(e.key)) return;
    const n = Number(e.key) - 1;
    if (!$('vgl-knoppen').hidden) { const b = $('vgl-knoppen').children[n]; if (b) b.click(); } else kiesKaart(n);
  }, true);

  async function init() {
    try { const i = await L.lees('spo_instellingen'); geluidAan = !i || i.geluid !== false; } catch (e) { /* standaard aan */ }
    $('geluid').setAttribute('aria-pressed', String(geluidAan)); $('geluid').textContent = geluidAan ? 'Geluid aan' : 'Geluid uit';
    galerij = await L.leesGalerij();
    await leesOpslag();
    // Nog geen deck? Neem automatisch je beste 5 kaarten (je kunt het daarna zelf aanpassen).
    deckIds = deckIds.filter((id) => galerij.some((e) => e.id === id));
    if (deckIds.length !== K.DECK && galerij.length >= K.DECK) { deckIds = galerij.slice().sort((a, b) => sterkteVan(b) - sterkteVan(a)).slice(0, K.DECK).map((e) => e.id); bewaarDeck(); }
    tekenWerelden(); tekenDeck(); await status();
    L.opOpslagWijziging(async () => {
      if (spel) return;
      galerij = await L.leesGalerij();
      try { staat = C.schoon(await L.lees(C.SLEUTEL)); } catch (e) { /* oude staat */ }
      if (huidig) tekenNiveaus(); else tekenWerelden();
      tekenDeck(); status();
    });
  }
  init().catch((e) => meld(e && e.message ? e.message : 'Er ging iets mis.', true));
})();
