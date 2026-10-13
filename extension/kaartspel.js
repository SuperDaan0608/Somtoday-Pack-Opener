/*
 * Somtoday Pack Opener v3.0: het Kaartspel (kaartspel.html). Deck tegen deck, tegen de computer of tegen een vriend.
 * De spelregels staan in kaartspellib.js, de munten (met dagelijkse limiet) in economie.js (kaartspelKlaar).
 * Vrienden spelen via de bestaande versleutelde berichten (vriendenlib.js): uitnodiging, vergelijking en gekozen kaart. Wat binnenkomt gaat door SPOKaartspel.schoonBericht.
 * Er zijn geen tekstvelden. Toegankelijk: alles is een knop (Tab, Enter, spatie; cijfertoetsen 1 tot 5 spelen een kaart), uitslagen worden voorgelezen via aria-live,
 * en bij 'minder beweging' zijn de animaties kort of uit.
 */
(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const G = globalThis.SPOGevecht;
  const K = globalThis.SPOKaartspel;
  const E = globalThis.SPOEco;
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const GLOED = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
  const $ = (id) => document.getElementById(id);
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst != null) e.textContent = tekst; return e; };
  const fmt = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',');
  const stil = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const slaap = (ms) => new Promise((r) => setTimeout(r, stil() ? Math.min(ms, 250) : ms));
  const OPSLAG = 'spo_kaartspel';
  const munten = (n) => `${n} ${n === 1 ? 'munt' : 'munten'}`;

  let st = null, galerij = [], deckIds = [], live = null, geluidAan = true, melTimer = 0;
  let uitnodigingen = [];   // binnengekomen: { mid, van, deck, ts }
  let uitgezet = null;      // mijn uitnodiging: { mid, vriend, timer }
  let spel = null;          // lopend potje
  let afgehandeld = [];     // mid's die klaar zijn (zodat een oude uitnodiging niet terugkomt)

  function meld(t, fout) { const m = $('melding'); m.textContent = t; m.classList.toggle('fout', !!fout); clearTimeout(melTimer); melTimer = setTimeout(() => (m.textContent = ''), 8000); }
  const actieveVrienden = () => (st ? st.vrienden.filter((v) => v.status === 'vriend' && !v.andereVersie) : []);
  const vriendNaam = (id) => { const v = st && st.vrienden.find((x) => x.id === id); return v ? L.naam(v) : 'Vriend'; };

  // ---- geluid ----
  function speel(naam, vol) {
    if (!geluidAan) return;
    try { const a = new Audio('sounds/' + naam + '.mp3'); a.volume = vol === undefined ? 0.6 : vol; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* geen geluid */ }
  }

  // ---- kaarten ----
  const mijnKaart = (e) => { const t = Math.max(0, Math.min(4, e.trede | 0)) || (e.zeldzaam === true ? 1 : 0); return { vak: e.vak, cijfer: e.cijfer, tier: e.tier | 0, t, z: t >= 1, v: e.vloek === true && !(e.heel > 0), h: e.vloek === true && e.heel > 0, kaart: e.kaart, id: e.id }; };
  const sterkteVan = (e) => G.sterkte(mijnKaart(e));
  function kaartNaam(k) {
    const g = K.groepVan(k);
    return `${k.vak} ${fmt(k.cijfer)}, ${NIVEAUS[k.tier | 0]}${k.t ? ', ' + globalThis.SPOLadder.label(k.t) : ''}${g ? ', ' + K.GROEP_NAAM[g] : ''}${k.v ? ', vervloekt' : k.h ? ', vloek opgeheven' : ''}`;
  }
  function kaartEl(k) {
    const d = el('div', 'mk');
    d.style.setProperty('--gl', GLOED[Math.max(0, Math.min(4, k.tier | 0))]);
    if (k.kaart) { const img = new Image(); img.src = k.kaart; img.alt = ''; img.draggable = false; d.append(img); d.classList.add('met-plaatje'); }
    else {
      d.append(el('span', 'mk-cj', fmt(k.cijfer)), el('span', 'mk-vk', k.vak || ''));
      if (k.t) { const b = el('i', 'mk-z', globalThis.SPOLadder.KORT[k.t]); d.append(b); }
    }
    const g = K.groepVan(k), gr = el('span', 'mk-gr');
    const def = G.GROEPEN.find((x) => x.id === g);
    if (def) gr.style.setProperty('--gr', def.kleur);
    d.append(gr);
    if (k.v) d.append(el('i', 'vloek-badge', 'VLOEK')); else if (k.h) d.append(el('i', 'heel-badge', 'HEEL'));
    d.setAttribute('role', 'img'); d.setAttribute('aria-label', kaartNaam(k));
    return d;
  }
  const rugEl = () => { const d = el('div', 'mk rug'); d.setAttribute('role', 'img'); d.setAttribute('aria-label', 'Kaart met de rug naar boven'); return d; };

  // ---- opslag ----
  async function bewaar() { try { await L.schrijf(OPSLAG, { v: 1, ids: deckIds.slice(0, K.DECK), mids: afgehandeld.slice(-30), ts: Date.now() }); } catch (e) { /* niet erg */ } }
  async function leesOpslag() {
    try { const o = await L.lees(OPSLAG); if (o && typeof o === 'object') { deckIds = (Array.isArray(o.ids) ? o.ids : []).filter((x) => typeof x === 'string').slice(0, K.DECK); afgehandeld = (Array.isArray(o.mids) ? o.mids : []).filter((x) => typeof x === 'string').slice(-30); } } catch (e) { /* leeg */ }
  }
  async function status() {
    const s = await E.kaartspelStatus();
    $('saldo').textContent = String(s.saldo);
    $('dag-info').textContent = s.over > 0 ? `Vandaag nog ${s.over} van ${s.max} potjes die munten opleveren.` : `Vandaag heb je alle ${s.max} potjes met munten gehad. Spelen mag nog, maar je krijgt geen munten meer.`;
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
      if (e) { const k = mijnKaart(e); const c = kaartEl(k); c.style.setProperty('--kw', '56px'); s.append(c); } else s.setAttribute('aria-label', `Plek ${i + 1}, nog leeg`);
      rij.append(s);
    }
    $('deck-stand').textContent = `${deckIds.length} van ${K.DECK} kaarten gekozen.`;
    $('start-pc').disabled = !deckKlaar() || !!spel;
    $('deck-leeg').disabled = !deckIds.length;
    $('geen-galerij').hidden = galerij.length >= K.DECK;
    $('deck-beste').disabled = galerij.length < K.DECK;
    tekenKies(); tekenVrienden();
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
      const img = new Image(); img.src = e.kaart; img.alt = ''; img.loading = 'lazy'; img.draggable = false;
      b.append(img);
      if (aan) b.append(el('i', 'kies-vink', String(deckIds.indexOf(e.id) + 1)));
      b.addEventListener('click', () => { deckIds = aan ? deckIds.filter((x) => x !== e.id) : deckIds.concat(e.id); bewaar(); tekenDeck(); });
      li.append(b); ul.append(li);
    }
  }
  $('deck-beste').addEventListener('click', () => { deckIds = galerij.slice().sort((a, b) => sterkteVan(b) - sterkteVan(a)).slice(0, K.DECK).map((e) => e.id); bewaar(); tekenDeck(); });
  $('deck-leeg').addEventListener('click', () => { deckIds = []; bewaar(); tekenDeck(); });
  $('geluid').addEventListener('click', () => { geluidAan = !geluidAan; $('geluid').setAttribute('aria-pressed', String(geluidAan)); $('geluid').textContent = geluidAan ? 'Geluid aan' : 'Geluid uit'; });

  // ---- vrienden en uitnodigingen ----
  function tekenVrienden() {
    $('vriend-uitleg').hidden = !!st;
    const ul = $('vrienden'); ul.replaceChildren();
    if (!st) return;
    const lijst = actieveVrienden();
    if (!lijst.length) { $('vriend-uitleg').hidden = false; $('vriend-uitleg').textContent = 'Je hebt nog geen vrienden die ook de nieuwste versie hebben.'; }
    for (const v of lijst) {
      const li = el('li'); li.append(el('span', '', L.naam(v)));
      const b = el('button', 'knop goud', uitgezet && uitgezet.vriend === v.id ? 'Wachten…' : 'Uitdagen'); b.type = 'button';
      b.setAttribute('aria-label', `${L.naam(v)} uitdagen voor een potje kaartspel`);
      b.disabled = !deckKlaar() || !!spel || !!uitgezet;
      b.addEventListener('click', () => uitdagen(v));
      li.append(b); ul.append(li);
    }
  }
  function tekenUitnodigingen() {
    const w = $('uitnodigingen'); w.replaceChildren();
    const nu = Date.now();
    uitnodigingen = uitnodigingen.filter((u) => nu - u.ts < 300000);
    if (uitgezet) {
      const d = el('div', 'uitn'); d.append(el('span', '', `Wachten tot ${vriendNaam(uitgezet.vriend)} je uitdaging accepteert…`));
      const b = el('button', 'knop klein', 'Annuleren'); b.type = 'button';
      b.addEventListener('click', async () => { const u = uitgezet; zetUit(null); const v = st.vrienden.find((x) => x.id === u.vriend); try { if (v) await L.stuurBericht(st, v, { t: 'ks_stop', mid: u.mid }); } catch (e) { /* de ander ziet het vanzelf */ } tekenUitnodigingen(); tekenVrienden(); });
      d.append(b); w.append(d);
    }
    for (const u of uitnodigingen) {
      const naam = vriendNaam(u.van);
      const d = el('div', 'uitn'); d.setAttribute('role', 'group'); d.setAttribute('aria-label', `Uitdaging van ${naam}`);
      d.append(el('span', '', `${naam} daagt je uit voor een potje kaartspel.`));
      const ja = el('button', 'knop goud', 'Accepteren'); ja.type = 'button'; ja.disabled = !!spel || !deckKlaar();
      ja.setAttribute('aria-label', `Uitdaging van ${naam} accepteren`);
      const nee = el('button', 'knop', 'Weigeren'); nee.type = 'button'; nee.setAttribute('aria-label', `Uitdaging van ${naam} weigeren`);
      ja.addEventListener('click', () => accepteer(u));
      nee.addEventListener('click', async () => { uitnodigingen = uitnodigingen.filter((x) => x !== u); onthoud(u.mid); tekenUitnodigingen(); const v = st.vrienden.find((x) => x.id === u.van); try { if (v) await L.stuurBericht(st, v, { t: 'ks_nee', mid: u.mid }); } catch (e) { /* niet erg */ } });
      const rij = el('div', 'spelrij'); rij.append(ja, nee); d.append(rij);
      if (!deckKlaar()) d.append(el('p', 'uitleg', 'Kies eerst een deck van 5 kaarten om te accepteren.'));
      w.append(d);
    }
  }
  function onthoud(mid) { if (!afgehandeld.includes(mid)) afgehandeld.push(mid); bewaar(); }
  function zetUit(u) { if (uitgezet) clearTimeout(uitgezet.timer); uitgezet = u; }
  async function uitdagen(v) {
    if (!deckKlaar() || spel || uitgezet) return;
    const mid = L.maakRid();
    try { await L.stuurBericht(st, v, { t: 'ks_uit', mid, deck: deckKaarten().map(K.deelKaart) }); } catch (e) { meld(e && e.message ? e.message : 'Versturen mislukte.', true); return; }
    zetUit({ mid, vriend: v.id, timer: setTimeout(() => { if (uitgezet && uitgezet.mid === mid) { zetUit(null); meld('Je uitdaging is verlopen.'); tekenUitnodigingen(); tekenVrienden(); } }, 300000) });
    tekenUitnodigingen(); tekenVrienden();
    meld(`Uitdaging verstuurd naar ${v.alias ? L.naam(v) : 'je vriend'}.`);
  }
  async function accepteer(u) {
    if (spel || !deckKlaar()) return;
    const v = st.vrienden.find((x) => x.id === u.van);
    if (!v) return;
    uitnodigingen = uitnodigingen.filter((x) => x !== u); onthoud(u.mid);
    try { await L.stuurBericht(st, v, { t: 'ks_ja', mid: u.mid, deck: deckKaarten().map(K.deelKaart) }); } catch (e) { meld('Accepteren mislukte: ' + (e && e.message ? e.message : 'onbekende fout'), true); tekenUitnodigingen(); return; }
    startPotje({ mid: u.mid, tegen: 'vriend', vriend: v, hun: u.deck, beginner: 'zij' });
  }
  function opBerichten(van, lijst) {
    for (const { m, leeftijd } of lijst) {
      const s = K.schoonBericht(m, leeftijd);
      if (!s) continue;
      if (spel && spel.mid === s.mid) { if (spel.vriend && spel.vriend.id === van) spel.ontvang(s); continue; }
      if (afgehandeld.includes(s.mid)) continue;
      if (s.t === 'ks_uit') { if (!uitnodigingen.some((u) => u.mid === s.mid)) { uitnodigingen.push({ mid: s.mid, van, deck: s.deck, ts: Date.now() - leeftijd * 1000 }); speel('klik', 0.5); } }
      else if (s.t === 'ks_ja' && uitgezet && uitgezet.mid === s.mid && uitgezet.vriend === van && !spel) {
        const v = st.vrienden.find((x) => x.id === van);
        zetUit(null); onthoud(s.mid);
        if (v) startPotje({ mid: s.mid, tegen: 'vriend', vriend: v, hun: s.deck, beginner: 'ik' });
      } else if ((s.t === 'ks_nee' || s.t === 'ks_stop')) {
        uitnodigingen = uitnodigingen.filter((u) => u.mid !== s.mid);
        if (uitgezet && uitgezet.mid === s.mid && uitgezet.vriend === van) { zetUit(null); onthoud(s.mid); meld(s.t === 'ks_nee' ? `${vriendNaam(van)} wil nu niet spelen.` : 'De uitdaging is ingetrokken.'); }
      }
    }
    tekenUitnodigingen(); tekenVrienden();
  }
  function startLive() {
    if (!st || live) return;
    live = L.maakLive({
      st: () => st, galerij: () => galerij,
      herlaad: async () => { const n = await L.laad(); if (n) st = n; galerij = await L.leesGalerij(); if (!spel) tekenDeck(); return st; },
      bij(g) {
        if (g.type === 'berichten') opBerichten(g.van, g.berichten);
        else if (g.type === 'ok') $('sync-status').textContent = 'Live. Laatst bijgewerkt om ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) + '.';
        else if (g.type === 'sync') { [...new Set(g.meldingen)].forEach((x) => meld(x)); tekenVrienden(); }
        else if (g.type === 'fout') {
          if (g.fout.verbannen) { $('sync-status').textContent = g.fout.message; meld(g.fout.message, true); }
          else if (g.fout.status === 401) { $('sync-status').textContent = 'Je account is niet meer geldig.'; live.stop(); }
          else $('sync-status').textContent = 'Verbinding haperde, ik probeer het opnieuw.';
        }
      },
    });
    live.start();
  }

  // ---- het potje ----
  // Een wachtrij: wacht(fn) wacht tot fn() iets teruggeeft (niet undefined/null/false); stop() breekt alles af.
  function maakSpel(o) {
    const sp = Object.assign({ wachters: [], keuze: { vgl: null, kaart: null }, ontv: { vgl: {}, kaart: {} }, dood: null, klaar: false, pcKeuze: null }, o);
    sp.ping = () => { for (const w of sp.wachters.slice()) { if (sp.dood) { sp.wachters = sp.wachters.filter((x) => x !== w); clearTimeout(w.t); w.rej(sp.dood); continue; } const r = w.fn(); if (r !== undefined && r !== null && r !== false) { sp.wachters = sp.wachters.filter((x) => x !== w); clearTimeout(w.t); w.res(r); } } };
    sp.wacht = (fn, ms) => new Promise((res, rej) => { const w = { fn, res, rej, t: ms ? setTimeout(() => { sp.dood = sp.dood || new Error('De tegenstander reageert niet meer.'); sp.ping(); }, ms) : 0 }; sp.wachters.push(w); sp.ping(); });
    sp.stop = (e) => { sp.dood = sp.dood || e || new Error('gestopt'); sp.ping(); };
    sp.ontvang = (s) => {
      if (s.t === 'ks_vgl' && K.kiezer(sp.p, s.r) !== 'ik' && sp.ontv.vgl[s.r] === undefined) sp.ontv.vgl[s.r] = s.v;
      else if (s.t === 'ks_kaart' && sp.ontv.kaart[s.r] === undefined) sp.ontv.kaart[s.r] = s.i;
      else if (s.t === 'ks_stop') sp.stop(new Error(`${sp.naam} heeft het potje verlaten.`));
      sp.ping();
    };
    return sp;
  }
  function startPotje(o) {
    if (spel) return;
    const mijn = deckKaarten();
    if (mijn.length !== K.DECK) return;
    let hun = o.hun, naam = o.vriend ? L.naam(o.vriend) : 'Computer', beginner = o.beginner;
    if (o.tegen === 'pc') { hun = K.maakComputerDeck(Math.random, mijn); beginner = Math.random() < 0.5 ? 'ik' : 'zij'; }
    const p = K.nieuwPotje(mijn, hun, beginner);
    spel = maakSpel({ mid: o.mid || L.maakRid(), tegen: o.tegen, vriend: o.vriend || null, p, naam });
    $('voorbereiding').hidden = true; $('tafel').hidden = false; $('einde').hidden = true;
    $('naam-zij').textContent = naam;
    $('score-ik').textContent = '0'; $('score-zij').textContent = '0';
    tekenHunDeck(); tekenHand(); wisArena();
    if (live) live.pauze(false);
    $('t-titel').focus && $('t-titel').setAttribute('tabindex', '-1');
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
    if (!spel || spel.keuze.kaart !== null || !spel.kaartOpen || !K.over(spel.p, 'ik').includes(i)) return;
    spel.kaartOpen = false; spel.keuze.kaart = i; zetHand(false); spel.ping();
  }
  function zetHand(aan) {
    const gespeeld = spel ? spel.p.gebruikt.ik : [];
    document.querySelectorAll('.hand-kaart').forEach((b, i) => { b.disabled = !aan || gespeeld.includes(i); });
    $('hand').classList.toggle('wacht', !aan);
  }
  function wisArena() { for (const id of ['slot-ik', 'slot-zij']) { const s = $(id); s.replaceChildren(); s.classList.remove('wint', 'verliest'); } $('vgl-badge').textContent = ''; $('vgl-knoppen').hidden = true; }
  function tekst(t) { $('tafel-tekst').textContent = t; }
  function vglKnoppen(aan) {
    const w = $('vgl-knoppen'); w.replaceChildren(); w.hidden = !aan;
    if (!aan) return;
    K.VGL_IDS.forEach((id, n) => {
      const b = el('button', 'vgl-knop'); b.type = 'button'; b.dataset.vgl = id; b.setAttribute('aria-keyshortcuts', String(n + 1));
      b.append(el('strong', '', K.VGL[id].naam), el('small', '', K.VGL[id].uitleg));
      b.addEventListener('click', () => { if (spel && !spel.keuze.vgl) { spel.keuze.vgl = id; spel.ping(); } });
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

  async function stuur(m) { if (spel.tegen === 'vriend') { try { await L.stuurBericht(st, spel.vriend, Object.assign({ mid: spel.mid }, m)); } catch (e) { spel.stop(new Error('Versturen mislukte: ' + (e && e.message ? e.message : 'onbekende fout'))); } } }

  async function speelPotje(sp) {
    const p = sp.p;
    try {
      while (!K.eind(p)) {
        const r = p.r, kz = K.kiezer(p);
        sp.pcKeuze = null; sp.keuze = { vgl: null, kaart: null };
        $('ronde-info').textContent = `Ronde ${r + 1} van ${K.DECK}`;
        $('kiezer-info').textContent = kz === 'ik' ? 'Jij kiest de vergelijking' : `${sp.naam} kiest de vergelijking`;
        wisArena(); zetHand(false);
        let vgl;
        if (kz === 'ik') {
          tekst('Jij kiest hoe de kaarten worden vergeleken.'); vglKnoppen(true);
          vgl = await sp.wacht(() => sp.keuze.vgl);
          vglKnoppen(false); await stuur({ t: 'ks_vgl', r, v: vgl });
        } else if (sp.tegen === 'pc') {
          tekst(`${sp.naam} kiest de vergelijking…`); await slaap(900);
          sp.pcKeuze = K.computerKiest(p, Math.random); vgl = sp.pcKeuze.vgl;
        } else {
          tekst(`Wachten tot ${sp.naam} de vergelijking kiest…`);
          vgl = await sp.wacht(() => sp.ontv.vgl[r], 90000);
        }
        const badge = $('vgl-badge'); badge.textContent = K.VGL[vgl].naam; badge.classList.remove('nieuw'); void badge.offsetWidth; badge.classList.add('nieuw'); speel('tik', 0.5);
        tekst(`${K.VGL[vgl].naam}: ${K.VGL[vgl].uitleg} Kies een kaart.`);
        sp.kaartOpen = true; zetHand(true);
        const eerste = document.querySelector('.hand-kaart:not(:disabled)'); if (eerste) eerste.focus();
        const i = await sp.wacht(() => sp.keuze.kaart);
        await stuur({ t: 'ks_kaart', r, i });
        tekst('Wachten op de kaart van de tegenstander…');
        let j;
        if (sp.tegen === 'pc') { j = kz === 'zij' && sp.pcKeuze ? sp.pcKeuze.j : K.computerAntwoordt(p, vgl, Math.random); }
        else j = await sp.wacht(() => sp.ontv.kaart[r], 90000);
        await onthul(sp, r, i, j, vgl);
      }
      await afronden(sp, false);
    } catch (e) {
      if (!sp.klaar) await afronden(sp, true, e && e.message ? e.message : 'Het potje is gestopt.');
    }
  }
  async function onthul(sp, r, i, j, vgl) {
    const p = sp.p;
    if (!K.over(p, 'zij').includes(j)) throw new Error(`${sp.naam} speelde een ongeldige kaart.`);
    const hb = $('hand-' + i);
    vlieg($('slot-ik'), kaartEl(p.ik[i]), hb ? hb.querySelector('.mk') : null);
    if (hb) hb.classList.add('gespeeld');
    speel('whoosh', 0.5);
    await draai($('slot-zij'), kaartEl(p.zij[j]));
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
    tekst(`Ronde ${r + 1}, ${K.VGL[vgl].naam}: ${a.vak} ${fmt(a.cijfer)} tegen ${b.vak} ${fmt(b.cijfer)}. ${w === 'ik' ? 'Jij wint de ronde!' : w === 'zij' ? sp.naam + ' wint de ronde.' : 'Gelijkspel, niemand krijgt een punt.'} Stand: ${p.score.ik} - ${p.score.zij}.`);
    speel(w === 'ik' ? 'goud' : w === 'zij' ? 'boem' : 'stap', 0.5);
    await slaap(K.eind(p) ? 1500 : 2200);
  }
  async function afronden(sp, afgebroken, reden) {
    if (sp.klaar) return;
    sp.klaar = true;
    const p = sp.p;
    $('hand').querySelectorAll('button').forEach((b) => { b.disabled = true; });
    if (afgebroken && sp.tegen === 'vriend' && !sp.eigenStop && !String(reden).includes('verlaten')) await stuur0(sp, { t: 'ks_stop' });
    onthoud(sp.mid);
    let u = afgebroken ? null : K.uitslag(p), tekstUit = '';
    if (u) {
      try {
        const r = await E.kaartspelKlaar(sp.mid, u);
        if (r.ok) tekstUit = r.munten > 0 ? `Je krijgt ${munten(r.munten)}.` : 'Je hebt vandaag al 5 potjes met munten gehad, dus nu geen munten meer. Morgen weer!';
        else tekstUit = 'De munten zijn niet uitbetaald.';
      } catch (e) { tekstUit = 'De munten zijn niet uitbetaald.'; }
      await status();
    } else tekstUit = (reden || 'Het potje is gestopt.') + ' Dit potje levert geen munten op.';
    const e = $('einde');
    $('einde-kop').textContent = !u ? 'Potje gestopt' : u === 'w' ? 'Je wint het potje!' : u === 'g' ? 'Gelijkspel' : `${sp.naam} wint het potje`;
    $('einde-stand').textContent = `${p.score.ik} - ${p.score.zij}`;
    $('einde-tekst').textContent = tekstUit;
    e.hidden = false; $('einde-kop').focus();
    if (u === 'w') { speel('gejuich', 0.7); confetti(); } else if (u === 'v') speel('sluiter', 0.4);
    sp.eindUitslag = u;
  }
  async function stuur0(sp, m) { try { await L.stuurBericht(st, sp.vriend, Object.assign({ mid: sp.mid }, m)); } catch (e) { /* de ander ziet het vanzelf */ } }

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

  function naarVoorbereiding() {
    if (spel) { spel.stop(new Error('gestopt')); spel = null; }
    $('einde').hidden = true; $('tafel').hidden = true; $('voorbereiding').hidden = false;
    tekenDeck(); tekenUitnodigingen(); status();
    $('v-titel').setAttribute('tabindex', '-1'); $('v-titel').focus();
  }
  $('start-pc').addEventListener('click', () => startPotje({ tegen: 'pc' }));
  $('einde-terug').addEventListener('click', naarVoorbereiding);
  $('einde-nog').addEventListener('click', () => {
    const sp = spel; const tegen = sp ? sp.tegen : 'pc';
    naarVoorbereiding();
    if (tegen === 'pc') startPotje({ tegen: 'pc' }); else $('vrienden').querySelector('button') && $('vrienden').querySelector('button').focus();
  });
  $('opgeven').addEventListener('click', async () => {
    if (!spel || spel.klaar) return;
    const sp = spel; sp.eigenStop = true;
    if (sp.tegen === 'vriend') await stuur0(sp, { t: 'ks_stop' });
    sp.stop(new Error('Je hebt het potje opgegeven.'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && spel && !spel.klaar) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Escape' && !$('einde').hidden) { e.preventDefault(); e.stopPropagation(); naarVoorbereiding(); return; }
    if (!spel || spel.klaar || e.ctrlKey || e.metaKey || e.altKey || !/^[1-5]$/.test(e.key)) return;
    const n = Number(e.key) - 1;
    if (!$('vgl-knoppen').hidden) { const b = $('vgl-knoppen').children[n]; if (b) b.click(); } else kiesKaart(n);
  }, true);

  async function init() {
    try { const i = await L.lees('spo_instellingen'); geluidAan = !i || i.geluid !== false; } catch (e) { /* standaard aan */ }
    $('geluid').setAttribute('aria-pressed', String(geluidAan)); $('geluid').textContent = geluidAan ? 'Geluid aan' : 'Geluid uit';
    galerij = await L.leesGalerij();
    await leesOpslag();
    st = await L.laad();
    tekenDeck(); tekenUitnodigingen(); await status();
    L.opOpslagWijziging(async () => { if (spel) return; galerij = await L.leesGalerij(); tekenDeck(); status(); });
    if (!st) { $('sync-status').textContent = 'Vriendenfunctie staat uit.'; return; }
    startLive();
  }
  init().catch((e) => meld(e && e.message ? e.message : 'Er ging iets mis.', true));
  globalThis.SPOKaartspelUI = { startPotje, opBerichten, zetSt(s) { st = s; tekenVrienden(); tekenUitnodigingen(); } }; // opBerichten en zetSt zijn voor de tests
})();
