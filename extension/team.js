// Team maken en gevechten tegen vrienden (of de computer). De wedstrijd zelf staat in gevecht.js.
(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const G = globalThis.SPOGevecht;
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const GLOED = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toFixed(1).replace('.', ',');
  const fmtFlex = (n) => { const v = Math.round(Number(n) * 100) / 100; return v.toFixed(Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2).replace('.', ','); };
  const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
  const tijd = (ts) => new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const VERLIES_MS = 10000;       // zo lang mag de ander stil zijn
  const KLIK_MS = 3000;           // zo lang mag je klikken in een duel
  const params = new URLSearchParams(location.search);
  const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let st = null;          // vriendenstatus (alleen lezen; opslaan doet de vriendenpagina en synchroniseer)
  let galerij = [];
  let team = null;        // { ids: [keeperId, ...] }
  let vriendKaarten = {}; // wat vrienden delen (hier: hun team)
  let gevechten = {};
  let live = null;
  let banGemeld = false;  // de verbanningsmelding maar één keer tonen
  let uitnodigingen = []; // binnengekomen: { mid, van, team, nonce, ts }
  let actief = null;      // lopend gevecht of lopende uitnodiging die ik stuurde
  let geluidAan = true;

  function el(tag, klas, tekst) { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst !== undefined) e.textContent = tekst; return e; }
  function melding(tekst, fout) { const p = el('p', fout ? 'fout' : '', tekst); $('melding').append(p); setTimeout(() => p.remove(), fout ? 9000 : 5000); }
  const foutTekst = (e) => (e && e.message ? e.message : 'Er ging iets mis.');
  const actieveVrienden = () => (st ? st.vrienden.filter((v) => v.status === 'vriend') : []);
  const vriendNaam = (id) => { const v = st && st.vrienden.find((x) => x.id === id); return v ? L.naam(v) : 'Vriend'; };

  // ---- geluid en trillen ----
  const geluiden = {};
  function speel(naam, vol, herhaal) {
    if (!geluidAan) return null;
    try {
      const a = new Audio('sounds/' + naam + '.mp3');
      a.volume = vol === undefined ? 0.7 : vol; a.loop = !!herhaal;
      const p = a.play(); if (p && p.catch) p.catch(() => {});
      return a;
    } catch (e) { return null; }
  }
  function stopGeluid(a) { try { if (a) { a.pause(); a.currentTime = 0; } } catch (e) { /* niets */ } }
  function trilVoor(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* geen trilling */ } }

  // ---- kaartjes ----
  // Eigen kaarten: de echte plaatjes uit de galerij. Kaarten van de tegenstander hebben we alleen als gegevens: die tekenen we als kaart in dezelfde kleuren.
  function kaartEl(k, naam) {
    const d = el('div', 'mk t' + Math.max(0, Math.min(4, k.tier | 0)));
    d.style.setProperty('--gl', GLOED[Math.max(0, Math.min(4, k.tier | 0))]);
    if (k.kaart) {
      const img = new Image(); img.src = k.kaart; img.alt = ''; img.draggable = false; d.append(img); d.classList.add('met-plaatje');
    } else {
      d.append(el('span', 'mk-cj', fmt(k.cijfer)), el('span', 'mk-vk', k.vak || ''));
      const tr = Number.isInteger(k.t) ? k.t : k.z ? 1 : 0;
      if (tr) { const b = el('i', 'mk-z mk-t' + tr, globalThis.SPOLadder.KORT[tr]); b.title = globalThis.SPOLadder.label(tr); d.append(b); }
    }
    if (k.v) { d.classList.add('vloek'); d.append(el('i', 'vloek-badge', 'VLOEK')); }
    if (naam) d.setAttribute('aria-label', naam);
    return d;
  }
  const mijnKaart = (e) => ({ vak: e.vak, cijfer: e.cijfer, tier: e.tier | 0, z: e.zeldzaam === true || (e.trede | 0) >= 1, t: Math.max(0, Math.min(4, e.trede | 0)) || (e.zeldzaam === true ? 1 : 0), kaart: e.kaart, id: e.id, v: e.vloek === true });

  // ---- prestaties: reddingen onthouden en een melding bij een nieuwe badge ----
  async function nieuweBadges(reddingen) {
    const P = globalThis.SPOPrestaties;
    if (!P) return;
    try {
      if (reddingen) await P.telOp('reddingen', reddingen);
      for (const b of await P.controleer()) melding(`Nieuwe badge: ${b.naam}. ${b.tekst}`);
    } catch (e) { /* prestaties zijn een extraatje */ }
  }

  // ---- team ----
  function teamLijst() { return L.teamKaarten(team, galerij); }
  function opschonenTeam() {
    if (!team) return;
    const ids = new Set(galerij.map((e) => e.id));
    team.ids = team.ids.filter((i) => ids.has(i)).slice(0, 11);
    if (!team.ids.length) team = null;
  }

  function schaalBouw(p) { return { x: p.x, y: 0.06 + (p.y - 0.5) * 2 * 0.88 }; }

  // Zet kaarten op een veld. `plekken[i]` = {x, y} (0 tot 1). Geeft de elementen terug.
  function leg(veld, kaarten, plekken, kw, klas) {
    const w = veld.clientWidth, h = veld.clientHeight;
    const els = [];
    kaarten.forEach((k, i) => {
      let e = veld._els && veld._els[i];
      if (!e) { e = el('div', 'speler ' + (klas || '')); e.append(kaartEl(k)); veld.append(e); }
      e.style.width = kw + 'px'; e.style.height = (kw / 0.68) + 'px'; e.style.setProperty('--kw', kw + 'px');
      e.style.transform = `translate(${plekken[i].x * w - kw / 2}px, ${plekken[i].y * h - kw / 0.68 / 2}px)`;
      els.push(e);
    });
    return els;
  }
  function kaartBreedte(veld, n) {
    const w = veld.clientWidth, h = veld.clientHeight;
    return Math.max(24, Math.min(w * 0.17, h * 0.085 * (n <= 4 ? 1.5 : 1.0) * 0.68 * 1.45, 110));
  }

  // ---- chemie: meter, groepen, tips en lijntjes tussen kaarten ----
  const SVGNS = 'http://www.w3.org/2000/svg';
  function tekenChemie(veld, gesorteerd, plekken, kw) {
    veld.querySelectorAll('.chemie-lijnen').forEach((e) => e.remove());
    const paneel = $('chemie');
    const n = gesorteerd.length;
    paneel.hidden = !n;
    if (!n) return;
    const c = G.chemie(gesorteerd);
    const w = veld.clientWidth, h = veld.clientHeight;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'chemie-lijnen'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('aria-hidden', 'true');
    const kleurVan = (id) => (G.GROEPEN.find((g) => g.id === id) || {}).kleur || '#fff';
    for (const [i, j] of c.lijnen) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', plekken[i].x * w); l.setAttribute('y1', plekken[i].y * h);
      l.setAttribute('x2', plekken[j].x * w); l.setAttribute('y2', plekken[j].y * h);
      l.setAttribute('stroke', kleurVan(c.groepen[i]));
      l.setAttribute('stroke-width', Math.max(3, kw * 0.07));
      l.setAttribute('stroke-linecap', 'round');
      svg.append(l);
    }
    veld.prepend(svg);
    // Een gekleurd bolletje op elke kaart die bij een groep hoort.
    veld.querySelectorAll('.speler').forEach((e, i) => {
      e.querySelectorAll('.groep-stip').forEach((x) => x.remove());
      if (c.groepen[i]) { const d = el('i', 'groep-stip'); d.style.background = kleurVan(c.groepen[i]); d.title = (G.GROEPEN.find((g) => g.id === c.groepen[i]) || {}).naam || ''; e.append(d); }
    });
    $('chemie-getal').textContent = c.score;
    $('chemie-meter').setAttribute('aria-valuenow', c.score);
    $('chemie-meter').setAttribute('aria-valuetext', `${c.score} van 100`);
    $('chemie-vul').style.width = c.score + '%';
    paneel.dataset.niveau = c.score >= 75 ? 'hoog' : c.score >= 40 ? 'midden' : 'laag';
    const ul = $('chemie-groepen');
    ul.replaceChildren();
    for (const g of c.lijst) {
      const li = el('li', g.n >= 3 ? 'vol' : g.n === 2 ? 'half' : g.n ? 'een' : 'leeg');
      const stip = el('i', 'groep-stip'); stip.style.background = g.kleur;
      li.append(stip, el('span', 'g-naam', g.naam), el('b', '', String(g.n)));
      li.title = g.n >= 3 ? 'Volle bonus' : g.n === 2 ? 'Halve bonus. Nog één kaart uit deze groep geeft de volle bonus.' : 'Geen bonus';
      ul.append(li);
    }
    const pct = (x) => (x * 100).toFixed(1).replace('.', ',');
    $('chemie-bonus').textContent = c.score ? `In een gevecht: +${pct(G.chemieBonus(c.score))}% passkans en +${pct(G.chemieBonus(c.score))}% klikkracht.` : 'Nog geen bonus in een gevecht.';
    $('chemie-tip').textContent = chemieTip(c, n);
    const vl = $('chemie-vakken');
    if (!vl.children.length) for (const g of G.GROEPEN) { const li = el('li'); const st = el('i', 'groep-stip'); st.style.background = g.kleur; li.append(st, el('strong', '', g.naam + ': '), document.createTextNode(g.vakken)); vl.append(li); }
  }
  function chemieTip(c, n) {
    if (n < 2) return 'Tip: zet meer kaarten in je team. Chemie krijg je met kaarten uit dezelfde groep.';
    if (c.score >= 100) return 'Perfecte chemie! Je team past helemaal bij elkaar.';
    const naam = (g) => g.naam;
    const grootste = c.lijst.slice().sort((a, b) => b.n - a.n)[0];
    const nietHerkend = c.groepen.filter((g) => !g).length;
    if (grootste.n === 0) return 'Tip: geen van je kaarten hoort bij een groep. Kies kaarten van vakken zoals wiskunde, Engels of geschiedenis.';
    if (grootste.n === 2 && c.lijst.filter((g) => g.n === 2).length === 1) return `Tip: je hebt 2 kaarten uit ${naam(grootste)}. Met nog één kaart uit die groep krijg je de volle bonus.`;
    const verspreid = n - c.lijst.filter((g) => g.n >= 3).reduce((a, g) => a + g.n, 0);
    if (verspreid > 0) {
      const lossen = c.lijst.filter((g) => g.n > 0 && g.n < 3);
      const tekst = lossen.length ? ` Je ${verspreid === 1 ? 'kaart' : 'kaarten'} uit ${lossen.map(naam).join(' en ')} ${verspreid === 1 ? 'telt' : 'tellen'} nog niet mee.` : '';
      return `Tip: ${naam(grootste)} is je sterkste groep (${grootste.n}).${tekst} Wissel ze om voor kaarten uit ${naam(grootste)}.` + (nietHerkend ? ` ${nietHerkend} ${nietHerkend === 1 ? 'kaart heeft' : 'kaarten hebben'} een vak dat we niet herkennen.` : '');
    }
    return 'Tip: de kaarten van één groep staan niet allemaal naast elkaar. Het veld ordent op sterkte, dus een andere keeper of andere cijfers veranderen de plekken.';
  }

  function tekenBouw() {
    const veld = $('bouwveld');
    veld.querySelectorAll('.speler').forEach((e) => e.remove());
    veld.querySelectorAll('.chemie-lijnen').forEach((e) => e.remove());
    veld._els = null;
    const lijst = teamLijst();
    const n = lijst.length;
    $('team-leeg').disabled = n === 0;
    if (!n) {
      $('chemie').hidden = true;
      veld.dataset.leeg = '1';
      $('team-info').textContent = 'Nog geen team. Kies kaarten rechts.';
      return;
    }
    delete veld.dataset.leeg;
    const keeper = mijnKaart(lijst[0]);
    const rest = lijst.slice(1).map(mijnKaart);
    const gesorteerd = G.ordenTeam([keeper].concat(rest), 0);
    const plekken = G.posities(n, 'A').map(schaalBouw);
    const kw = kaartBreedte(veld, n);
    const els = leg(veld, gesorteerd, plekken, kw, 'bouw-speler');
    els.forEach((e, i) => {
      e.tabIndex = 0; e.setAttribute('role', 'button');
      e.setAttribute('aria-label', `${gesorteerd[i].vak} ${fmt(gesorteerd[i].cijfer)}${i === 0 ? ', keeper' : '. Klik om keeper te maken'}`);
      if (i === 0) { const b = el('b', 'keeper-label', 'Keeper'); e.append(b); }
      const kies = () => { if (i === 0) return; team.ids = [gesorteerd[i].id].concat(team.ids.filter((x) => x !== gesorteerd[i].id)); wijzig(); };
      e.addEventListener('click', kies);
      e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); kies(); } });
    });
    tekenChemie(veld, gesorteerd, plekken, kw);
    const gem = lijst.reduce((a, k) => a + G.sterkte(mijnKaart(k)), 0) / n;
    $('team-info').textContent = `${n} ${n === 1 ? 'kaart' : 'kaarten'} · gemiddelde sterkte ${fmt(gem)}${n === 1 ? ' · één kaart is keeper en schutter tegelijk' : ''}`;
  }

  function tekenKies() {
    const ul = $('kies');
    ul.replaceChildren();
    $('geen-galerij').hidden = galerij.length > 0;
    const gekozen = new Set(team ? team.ids : []);
    const vol = gekozen.size >= 11;
    const lijst = galerij.slice().sort((a, b) => b.cijfer - a.cijfer || b.ts - a.ts);
    for (const e of lijst) {
      const li = el('li');
      const b = el('button', 'kies-kaart'); b.type = 'button';
      const aan = gekozen.has(e.id);
      b.setAttribute('aria-pressed', String(aan));
      b.setAttribute('aria-label', `${e.vak} ${fmt(e.cijfer)}, ${NIVEAUS[e.tier | 0]}${aan ? ', in je team' : ''}`);
      b.disabled = !aan && vol;
      b.style.setProperty('--gl', GLOED[e.tier | 0]);
      const img = new Image(); img.src = e.kaart; img.alt = ''; img.loading = 'lazy'; img.draggable = false;
      b.append(img, el('span', 'kies-cj', fmt(e.cijfer)));
      if (e.vloek) { b.classList.add('vloek'); b.append(el('i', 'vloek-badge', 'VLOEK')); b.setAttribute('aria-label', b.getAttribute('aria-label') + ', vervloekt'); }
      if (aan) b.append(el('i', 'kies-vink', team.ids[0] === e.id ? 'K' : '✓'));
      b.addEventListener('click', () => {
        if (aan) { team.ids = team.ids.filter((x) => x !== e.id); if (!team.ids.length) team = null; }
        else { if (!team) team = { ids: [] }; if (team.ids.length >= 11) return; team.ids.push(e.id); }
        wijzig();
      });
      li.append(b); ul.append(li);
    }
  }

  let deelTimer = null;
  async function wijzig() {
    tekenBouw(); tekenKies(); tekenVrienden();
    try { await L.bewaarTeam(team); } catch (e) { melding(foutTekst(e), true); }
    clearTimeout(deelTimer);
    deelTimer = setTimeout(async () => {
      if (!st) return;
      try { await L.zetBlobs(st, actieveVrienden().map((v) => v.id), galerij); } catch (e) { melding('Je team delen met vrienden mislukte: ' + foutTekst(e), true); }
    }, 800);
  }

  // ---- vrienden en uitdagen ----
  function teamVan(id) { const k = vriendKaarten[id]; return k && k.team ? k.team : null; }
  function uitdaagStatus(v) {
    const mijn = teamLijst().length, hun = teamVan(v.id);
    if (!mijn) return { ok: false, tekst: 'Maak eerst een team.' };
    if (!hun) return { ok: false, tekst: `${L.naam(v)} heeft nog geen team (of is nog niet gesynchroniseerd).` };
    if (hun.kaarten.length !== mijn) return { ok: false, tekst: `Jouw team heeft ${mijn} ${mijn === 1 ? 'kaart' : 'kaarten'}, het team van ${L.naam(v)} heeft er ${hun.kaarten.length}. Jullie teams moeten evenveel kaarten hebben.` };
    return { ok: true, tekst: `Team van ${L.naam(v)}: ${hun.kaarten.length} ${hun.kaarten.length === 1 ? 'kaart' : 'kaarten'}. Jullie zijn even groot.` };
  }
  function tekenVrienden() {
    $('vriend-uitleg').hidden = !!st;
    const ul = $('gv-vrienden');
    ul.replaceChildren();
    $('oefen').disabled = !teamLijst().length || !!actief;
    $('oefen-info').textContent = teamLijst().length ? '' : 'Maak eerst een team.';
    if (!st) return;
    for (const v of actieveVrienden()) {
      const li = el('li', 'gv-vriend');
      const kop = el('div', 'gv-kop');
      kop.append(el('strong', '', L.naam(v)));
      const gv = Array.isArray(gevechten[v.id]) ? gevechten[v.id] : [];
      if (gv.length) {
        const w = gv.filter((x) => x.mijn > x.hun).length, g = gv.filter((x) => x.mijn === x.hun).length, l = gv.length - w - g;
        kop.append(el('span', 'gv-uitslag', `${w} gewonnen · ${g} gelijk · ${l} verloren`));
      }
      const s = uitdaagStatus(v);
      const b = el('button', 'knop klein goud', 'Uitdagen'); b.type = 'button';
      b.disabled = !s.ok || !!actief;
      b.id = 'uitdaag-' + v.id;
      b.addEventListener('click', () => uitdagen(v));
      const p = el('p', 'uitleg' + (s.ok ? '' : ' uit-uitleg'), s.tekst);
      p.id = 'uitleg-' + v.id; b.setAttribute('aria-describedby', p.id);
      li.append(kop, p, b);
      ul.append(li);
    }
    if (!ul.children.length) ul.append(el('li', 'geen', 'Je hebt nog geen vrienden. Voeg ze toe op het tabblad Vrienden.'));
  }
  function tekenUitnodigingen() {
    const w = $('uitnodigingen');
    w.replaceChildren();
    uitnodigingen = uitnodigingen.filter((u) => Date.now() - u.ts < 300000);
    for (const u of uitnodigingen) {
      const naam = vriendNaam(u.van);
      const d = el('div', 'uitnodiging');
      d.append(el('p', 'un-tekst', `${naam} daagt je uit voor een gevecht met ${u.team.kaarten.length} ${u.team.kaarten.length === 1 ? 'kaart' : 'kaarten'}.`));
      const mijn = teamLijst().length;
      const kan = mijn === u.team.kaarten.length && !actief;
      const ja = el('button', 'knop goud klein', 'Accepteren'); ja.type = 'button'; ja.disabled = !kan;
      const nee = el('button', 'knop klein', 'Weigeren'); nee.type = 'button';
      ja.addEventListener('click', () => accepteer(u));
      nee.addEventListener('click', async () => {
        uitnodigingen = uitnodigingen.filter((x) => x !== u); tekenUitnodigingen();
        const v = st.vrienden.find((x) => x.id === u.van);
        try { if (v) await L.stuurBericht(st, v, { t: 'weiger', mid: u.mid }); } catch (e) { /* de uitdager ziet het vanzelf */ }
      });
      const rij = el('div', 'acties'); rij.append(ja, nee);
      d.append(rij);
      if (!kan && !actief) d.append(el('p', 'uitleg uit-uitleg', mijn ? `Je team heeft ${mijn} ${mijn === 1 ? 'kaart' : 'kaarten'}. Maak het even groot als dat van ${naam} om te accepteren.` : 'Maak eerst een team om te accepteren.'));
      w.append(d);
    }
  }

  // ---- berichten van vrienden (via de live-synchronisatie) ----
  function opBerichten(van, lijst) {
    for (const { m, leeftijd } of lijst) {
      if (typeof m.mid !== 'string' || !/^[0-9a-f]{16,32}$/.test(m.mid)) continue;
      if (actief && actief.mid === m.mid && actief.kanaal) { actief.kanaal.voer(m); continue; }
      if (m.t === 'uitnodiging' && leeftijd < 300) {
        const t = L.schoonTeam(m.team);
        if (!t || typeof m.nonce !== 'string' || m.nonce.length > 40) continue;
        if (uitnodigingen.some((u) => u.mid === m.mid)) continue;
        uitnodigingen.push({ mid: m.mid, van, team: t, nonce: m.nonce, ts: Date.now() - leeftijd * 1000 });
        speel('klik', 0.5);
      } else if (m.t === 'weiger' || m.t === 'annuleer' || m.t === 'stop') {
        uitnodigingen = uitnodigingen.filter((u) => u.mid !== m.mid);
      }
    }
    tekenUitnodigingen(); tekenVrienden();
  }

  function startLive() {
    if (!st || live) return;
    live = L.maakLive({
      st: () => st, galerij: () => galerij,
      herlaad: async () => { const n = await L.laad(); if (n) st = n; galerij = await L.leesGalerij(); team = await L.leesTeam(); opschonenTeam(); gevechten = await L.leesGevechten(); tekenBouw(); tekenKies(); tekenVrienden(); return st; },
      bij(g) {
        if (g.type === 'sync') { vriendKaarten = g.kaarten; [...new Set(g.meldingen)].forEach((m) => melding(m)); tekenVrienden(); tekenUitnodigingen(); }
        else if (g.type === 'kaarten') { for (const id of Object.keys(g.kaarten)) vriendKaarten[id] = g.kaarten[id]; tekenVrienden(); tekenUitnodigingen(); }
        else if (g.type === 'berichten') opBerichten(g.van, g.berichten);
        else if (g.type === 'ok') $('sync-status').textContent = 'Live. Laatst bijgewerkt om ' + tijd(Date.now()) + '.';
        else if (g.type === 'fout') {
          if (g.fout.verbannen) { $('sync-status').textContent = g.fout.message; if (!banGemeld) { banGemeld = true; melding(g.fout.message, true); } }
          else if (g.fout.status === 401) { $('sync-status').textContent = 'Je account is niet meer geldig.'; live.stop(); }
          else $('sync-status').textContent = 'Verbinding haperde, ik probeer het opnieuw.';
        }
      },
    });
    live.start();
  }

  // ---- kanaal voor een gevecht ----
  // Berichten zijn { mid, t, k?, ... }. Types: uitnodiging, accepteer, weiger, annuleer, rdy (klaar voor duel k), kl (klikken in duel k, f = klaar), eind, stop, hb.
  function maakKanaal(zendFn) {
    const inbox = new Map(), wachters = new Set(), luisteraars = [];
    const k = { laatst: Date.now(), dood: null, gestopt: false };
    const sl = (m) => m.t + ':' + (m.k === undefined ? '' : m.k) + (m.f ? ':f' : '');
    function controleer() { for (const w of [...wachters]) w(); }
    k.voer = (m) => {
      k.laatst = Date.now();
      if (m.t === 'hb') return;
      if (m.t === 'stop' || m.t === 'annuleer' || m.t === 'weiger') k.dood = k.dood || new Error(m.t === 'stop' ? 'gestopt' : m.t);
      inbox.set(sl(m), m);
      luisteraars.forEach((f) => f(m));
      controleer();
    };
    k.heeft = (naam) => inbox.get(naam);
    k.luister = (f) => luisteraars.push(f);
    k.wacht = (naam, ms) => new Promise((res, rej) => {
      const einde = Date.now() + (ms || 120000);
      const iv = setInterval(w, 200);
      function klaar() { clearInterval(iv); wachters.delete(w); }
      function w() {
        const v = inbox.get(naam);
        if (v) { klaar(); res(v); return; }
        if (k.dood || k.gestopt) { klaar(); rej(k.dood || new Error('afgebroken')); return; }
        if (Date.now() - k.laatst > VERLIES_MS || Date.now() > einde) { klaar(); k.dood = k.dood || new Error('verlies'); rej(k.dood); }
      }
      wachters.add(w); w();
    });
    k.zend = (m) => zendFn(m);
    k.stop = () => { k.gestopt = true; controleer(); };
    return k;
  }
  function kanaalVriend(v, mid) {
    let rij = Promise.resolve(), wachtend = 0, fouten = 0;
    const kn = maakKanaal((m) => {
      if (!m.f && m.t === 'kl' && wachtend > 2) return rij; // tussenstanden mogen wegvallen als het even stroef gaat
      wachtend++;
      rij = rij.then(() => L.stuurBericht(st, v, Object.assign({ mid }, m))).then(() => { fouten = 0; }, () => { fouten++; }).then(() => { wachtend--; });
      return rij;
    });
    let stopPoll = false;
    kn.start = () => {
      (async () => {
        while (!stopPoll) {
          const t0 = Date.now();
          try { for (const b of await L.haalBerichten(st, v, live.cursor)) if (b.m.mid === mid) kn.voer(b.m); } catch (e) { /* kn.laatst loopt op; na 10 s is de verbinding verloren */ }
          await slaap(Math.max(60, 250 - (Date.now() - t0)));
        }
      })();
      kn.hb = setInterval(() => kn.zend({ t: 'hb' }), 2000);
      kn.bewaker = setInterval(() => { if (Date.now() - kn.laatst > VERLIES_MS) { kn.dood = kn.dood || new Error('verlies'); } }, 1000);
    };
    const oud = kn.stop;
    kn.stop = () => { stopPoll = true; clearInterval(kn.hb); clearInterval(kn.bewaker); oud(); };
    return kn;
  }
  // De computer: antwoordt meteen op 'klaar' en klikt in een duel zoals een mens (met tussenstanden).
  function kanaalComputer(rng, kaartVoor) {
    const kn = maakKanaal((m) => {
      if (m.t === 'rdy') {
        setTimeout(() => kn.voer({ t: 'rdy', k: m.k }), 250);
        const kaart = kaartVoor(m.k);
        const totaal = Math.max(0, G.computerKliks(rng, kaart));
        const start = 250 + 3000; // na het aftellen
        const stappen = 12;
        for (let i = 1; i <= stappen; i++) {
          const c = Math.round(totaal * (i / stappen) * (0.85 + 0.3 * (i % 3) / 2));
          const laatste = i === stappen;
          setTimeout(() => kn.voer({ t: 'kl', k: m.k, c: laatste ? totaal : Math.min(totaal, c), f: laatste ? 1 : 0 }), start + (KLIK_MS * i) / stappen);
        }
      } else if (m.t === 'eind') setTimeout(() => kn.voer({ t: 'eind', a: m.a, b: m.b }), 50);
    });
    kn.start = () => { kn.hb = setInterval(() => { kn.laatst = Date.now(); }, 1000); }; // de computer is nooit stil
    const oud = kn.stop;
    kn.stop = () => { clearInterval(kn.hb); oud(); };
    return kn;
  }

  // ---- uitdagen, accepteren ----
  const maakMid = () => L.maakRid().slice(0, 16);
  async function uitdagen(v) {
    if (actief) return;
    const mijn = teamLijst();
    const s = uitdaagStatus(v);
    if (!s.ok) { melding(s.tekst, true); return; }
    const mid = maakMid(), nonce = L.maakRid().slice(0, 16);
    const kn = kanaalVriend(v, mid);
    actief = { mid, kanaal: kn, vriend: v, rol: 'A' };
    tekenVrienden();
    const wachtTekst = el('p', 'uitnodiging-wacht');
    toonWachten(`Uitnodiging gestuurd naar ${L.naam(v)}. Wachten op antwoord...`, async () => {
      try { await kn.zend({ t: 'annuleer' }); } catch (e) { /* weg is weg */ }
      kn.stop(); actief = null; verbergScherm(); tekenVrienden();
    });
    void wachtTekst;
    try {
      const snap = L.teamMomentopname(mijn);
      await L.stuurBericht(st, v, { t: 'uitnodiging', mid, nonce, team: snap });
      kn.start(); live.pauze(true);
      const a = await kn.wacht('accepteer:', 90000);
      const hunTeam = L.schoonTeam(a.team);
      if (!hunTeam || hunTeam.kaarten.length !== mijn.length) throw new Error('Het team van je vriend klopt niet.');
      await speelGevecht({ mid, rol: 'A', kanaal: kn, vriend: v, seedTekst: `${mid}|${nonce}|${a.nonce}`, mijnTeam: mijn.map(mijnKaart), hunTeam: hunTeam.kaarten, mijnCh: snap.ch, hunCh: hunTeam.ch, hunNaam: L.naam(v) });
    } catch (e) {
      afbreken(e, v);
    }
  }
  async function accepteer(u) {
    if (actief) return;
    const v = st.vrienden.find((x) => x.id === u.van && x.status === 'vriend');
    const mijn = teamLijst();
    if (!v || mijn.length !== u.team.kaarten.length) return;
    uitnodigingen = uitnodigingen.filter((x) => x !== u); tekenUitnodigingen();
    const kn = kanaalVriend(v, u.mid);
    actief = { mid: u.mid, kanaal: kn, vriend: v, rol: 'B' };
    tekenVrienden();
    toonWachten('Gevecht starten...', () => { kn.zend({ t: 'stop' }); kn.stop(); actief = null; verbergScherm(); tekenVrienden(); });
    try {
      const nonce = L.maakRid().slice(0, 16);
      kn.start(); live.pauze(true);
      const snap = L.teamMomentopname(mijn);
      await L.stuurBericht(st, v, { t: 'accepteer', mid: u.mid, nonce, team: snap });
      await speelGevecht({ mid: u.mid, rol: 'B', kanaal: kn, vriend: v, seedTekst: `${u.mid}|${u.nonce}|${nonce}`, mijnTeam: mijn.map(mijnKaart), hunTeam: u.team.kaarten, mijnCh: snap.ch, hunCh: u.team.ch, hunNaam: L.naam(v) });
    } catch (e) { afbreken(e, v); }
  }
  async function oefenen() {
    if (actief) return;
    const mijn = teamLijst();
    if (!mijn.length) return;
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    const hun = G.maakComputerTeam(seed, mijn.length, mijn.map(mijnKaart));
    const rng = G.maakRng(seed ^ 0x5bd1e995);
    const kn = kanaalComputer(rng, () => hun[0]);
    actief = { mid: 'oefen', kanaal: kn, computer: true, rol: 'A' };
    tekenVrienden();
    kn._hun = hun; kn.start();
    try {
      await speelGevecht({ mid: 'oefen', rol: 'A', kanaal: kn, computer: true, seed, mijnTeam: mijn.map(mijnKaart), hunTeam: hun, mijnCh: G.chemie(G.ordenTeam(mijn.map(mijnKaart), 0)).score, hunCh: G.chemie(G.ordenTeam(hun, 0)).score, hunNaam: 'Computer', rngKeeper: (k) => hun[0] });
    } catch (e) { afbreken(e, null); }
  }
  function afbreken(e, v) {
    const msg = e && e.message;
    if (actief && actief.kanaal) { actief.kanaal.stop(); }
    const naam = v ? L.naam(v) : 'de tegenstander';
    let uitleg = msg === 'verlies' ? 'Verbinding verloren. Het gevecht is gestopt.' : msg === 'gestopt' ? `${naam} is gestopt.` : msg === 'weiger' ? `${naam} wil nu niet vechten.` : msg === 'annuleer' ? `${naam} heeft de uitnodiging ingetrokken.` : msg === 'afgebroken' ? 'Je hebt het gevecht gestopt.' : foutTekst(e);
    if (msg === 'verlies' && actief && !actief.begonnen) uitleg = `Geen antwoord van ${naam}. De uitnodiging is verlopen.`;
    toonEinde({ kop: msg === 'afgebroken' ? 'Gestopt' : 'Gevecht afgelopen', stand: '', tekst: uitleg });
    if (live) live.pauze(false);
    actief = null; tekenVrienden(); tekenUitnodigingen();
  }

  // ---- scherm ----
  function toonScherm() { $('scherm').hidden = false; document.body.classList.add('in-gevecht'); }
  function verbergScherm() { $('scherm').hidden = true; document.body.classList.remove('in-gevecht'); $('duel').hidden = true; $('einde').hidden = true; }
  let wachtStop = null;
  function toonWachten(tekst, stop) {
    toonScherm();
    $('duel').hidden = true; $('einde').hidden = true;
    $('bord-status').textContent = tekst;
    $('naam-a').textContent = ''; $('naam-b').textContent = '';
    $('wveld').querySelectorAll('.speler').forEach((e) => e.remove());
    wachtStop = stop;
  }
  function toonEinde(o) {
    toonScherm();
    $('duel').hidden = true;
    $('einde-kop').textContent = o.kop; $('einde-stand').textContent = o.stand; $('einde-tekst').textContent = o.tekst;
    $('einde').hidden = false;
    $('einde-terug').focus();
  }
  $('einde-terug').addEventListener('click', () => { verbergScherm(); if (live) live.pauze(false); });
  $('stop').addEventListener('click', async () => {
    if (wachtStop && (!actief || !actief.begonnen)) { const f = wachtStop; wachtStop = null; f(); return; }
    if (actief && actief.kanaal) { try { actief.kanaal.zend({ t: 'stop' }); } catch (e) { /* niets */ } actief.kanaal.gestopt = true; actief.kanaal.dood = new Error('afgebroken'); actief.kanaal.voer({ t: 'hb' }); }
  });

  // ---- de wedstrijd ----
  async function speelGevecht(o) {
    const kn = o.kanaal;
    actief.begonnen = true; wachtStop = null;
    const seed = o.computer ? o.seed : await G.seedUitHash(o.seedTekst);
    const ik = o.rol; // 'A' = uitdager (onderaan in het canonieke veld), 'B' = de ander
    // Beide computers zetten hetzelfde team A en team B neer: eerst de keeper, dan de rest op sterkte.
    const mijnVol = G.ordenTeam(o.mijnTeam, 0), hunVol = G.ordenTeam(o.hunTeam, 0);
    const teams = ik === 'A' ? { A: mijnVol, B: hunVol } : { A: hunVol, B: mijnVol };
    // Chemie komt uit de teamgegevens die beide kanten kregen (`ch` bij het team). Heeft een van beide geen `ch` (oude versie), dan is het voor allebei 0.
    const heeftCh = Number.isInteger(o.mijnCh) && Number.isInteger(o.hunCh);
    const chemie = heeftCh ? (ik === 'A' ? { A: o.mijnCh, B: o.hunCh } : { A: o.hunCh, B: o.mijnCh }) : { A: 0, B: 0 };
    const sim = G.maakSim(seed, teams, { chemie });
    const mijnChem = chemie[ik], hunChem = chemie[ik === 'A' ? 'B' : 'A'];
    const n = sim.n;
    const hun = ik === 'A' ? 'B' : 'A';
    const flip = ik === 'B';

    // opbouw van het scherm
    toonScherm();
    $('einde').hidden = true; $('duel').hidden = true;
    const veld = $('wveld');
    veld.querySelectorAll('.speler').forEach((e) => e.remove());
    $('naam-a').textContent = 'Jij'; $('naam-b').textContent = o.hunNaam;
    $('score-a').textContent = '0'; $('score-b').textContent = '0'; $('klok').textContent = "0'";
    $('bord-status').textContent = 'Wachten tot het begint...';
    $('kl-naam').textContent = o.hunNaam;
    const kaartEls = { A: [], B: [] };
    function plekPx(z, i) {
      let p = sim.pos[z][i];
      if (flip) p = { x: 1 - p.x, y: 1 - p.y };
      return { x: p.x * veld.clientWidth, y: p.y * veld.clientHeight };
    }
    function layout() {
      const kw = kaartBreedte(veld, n);
      for (const z of ['A', 'B']) {
        teams[z].forEach((k, i) => {
          let e = kaartEls[z][i];
          if (!e) {
            e = el('div', 'speler ' + (z === ik ? 'mijn' : 'hun'));
            e.append(kaartEl(z === ik ? k : Object.assign({}, k, { kaart: null })));
            if (i === 0) e.append(el('b', 'keeper-label', 'K'));
            veld.append(e); kaartEls[z][i] = e;
          }
          const p = plekPx(z, i);
          e.style.width = kw + 'px'; e.style.height = (kw / 0.68) + 'px'; e.style.setProperty('--kw', kw + 'px');
          e._x = p.x; e._y = p.y; e._kw = kw;
          e.style.transform = `translate(${p.x - kw / 2}px, ${p.y - kw / 0.68 / 2}px)`;
        });
      }
      zetBal(balPos());
    }
    let houder = sim.houder;
    const bal = $('bal');
    let balXY = { x: 0, y: 0 };
    function rustPlek(z, i) { const e = kaartEls[z][i]; return { x: e._x + e._kw * 0.3, y: e._y + e._kw / 0.68 * 0.34 }; }
    function balPos() { return rustPlek(houder.z, houder.i); }
    function zetBal(p, s) { balXY = p; bal.style.transform = `translate(${p.x - 9}px, ${p.y - 9}px) scale(${s || 1})`; }
    function markeerHouder() {
      for (const z of ['A', 'B']) kaartEls[z].forEach((e, i) => e.classList.toggle('heeft-bal', houder.z === z && houder.i === i));
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;
    if (ro) ro.observe(veld);
    await new Promise((r) => requestAnimationFrame(r));
    layout(); markeerHouder();

    const stand = { A: 0, B: 0 };
    let reddingen = 0;      // duels die mijn keeper stopte (voor de prestaties)
    function zetStand() { $('score-a').textContent = stand[ik]; $('score-b').textContent = stand[hun]; }
    const controleer = () => { if (kn.dood || kn.gestopt) throw kn.dood || new Error('afgebroken'); };
    let klok = 0;
    function zetKlok(m) { klok = m; $('klok').textContent = Math.min(90, Math.floor(m)) + "'"; }
    function tekst(t, ms) { const e = $('veld-tekst'); e.textContent = t; e.classList.remove('toon'); void e.offsetWidth; e.classList.add('toon'); clearTimeout(tekst.t); tekst.t = setTimeout(() => e.classList.remove('toon'), ms || 1100); }

    // Gelijk beginnen: allebei zeggen dat ze klaar zijn, en wachten op de ander.
    await kn.zend({ t: 'rdy', k: 0 });
    $('bord-status').textContent = 'Wachten op ' + o.hunNaam + '...';
    await kn.wacht('rdy:0', 30000);
    await aftellenGroot(controleer);
    $('bord-status').textContent = 'Aftrap!';
    if (mijnChem || hunChem) tekst(`Chemie: jij ${mijnChem}, ${o.hunNaam} ${hunChem}`, 1800);
    speel('menigte', 0.25);

    function vlieg(van, naar, dur, boog) {
      return new Promise((res) => {
        const t0 = performance.now();
        function f(nu) {
          const t = Math.min(1, (nu - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const s = Math.sin(Math.PI * t);
          zetBal({ x: van.x + (naar.x - van.x) * e, y: van.y + (naar.y - van.y) * e - s * boog }, 1 + 0.45 * s);
          if (t < 1) requestAnimationFrame(f); else res();
        }
        requestAnimationFrame(f);
      });
    }
    function klokTot(naar, dur) {
      const van = klok, t0 = performance.now();
      (function f(nu) { const t = Math.min(1, (nu - t0) / dur); zetKlok(van + (naar - van) * t); if (t < 1) requestAnimationFrame(f); })(t0);
    }
    const wacht = async (ms) => { await slaap(ms); controleer(); };
    const snel = rustig ? 0.6 : 1;

    // Elke gebeurtenis in de wedstrijd, op beide computers dezelfde.
    for (;;) {
      controleer();
      const ev = sim.volgende();
      if (ev.t === 'eind') break;
      if (ev.t === 'pass' || ev.t === 'onderschep') {
        const dur = Math.round(ev.dur * snel);
        klokTot(ev.min, dur);
        const van = rustPlek(ev.van.z, ev.van.i), naar = rustPlek(ev.naar.z, ev.naar.i);
        const dist = Math.hypot(van.x - naar.x, van.y - naar.y);
        const boog = Math.min(40, dist * 0.18);
        speel('tik', 0.35);
        if (ev.t === 'pass') {
          await vlieg(van, naar, dur, boog);
          houder = ev.naar;
        } else {
          // De bal vliegt richting de ontvanger, maar een tegenstander stapt ertussen.
          const tussen = { x: van.x + (naar.x - van.x) * 0.62, y: van.y + (naar.y - van.y) * 0.62 };
          const vang = kaartEls[ev.door.z][ev.door.i];
          vang.classList.add('onderschept');
          vang.style.transform = `translate(${vang._x + (tussen.x - vang._x) * 0.35 - vang._kw / 2}px, ${vang._y + (tussen.y - vang._y) * 0.35 - vang._kw / 0.68 / 2}px)`;
          await vlieg(van, tussen, Math.round(dur * 0.65), boog);
          const dicht = rustPlek(ev.door.z, ev.door.i);
          await vlieg(tussen, dicht, 220 * snel, 6);
          vang.style.transform = `translate(${vang._x - vang._kw / 2}px, ${vang._y - vang._kw / 0.68 / 2}px)`;
          vang.classList.remove('onderschept');
          houder = ev.door;
          if (ev.door.z === ik) tekst('Gewonnen!', 700); else tekst('Bal verloren', 700);
        }
        markeerHouder();
      } else if (ev.t === 'kans') {
        zetKlok(ev.min);
        const uitkomst = await duel(ev);
        if (uitkomst.goal) {
          stand[ev.schutter.z]++; zetStand();
        } else if (ev.keeper.z === ik) reddingen++;
        houder = sim.houder;
        const dicht = rustPlek(houder.z, houder.i);
        await vlieg(balXY, dicht, 450 * snel, 14);
        markeerHouder();
      }
    }
    zetKlok(90);

    // ---- een klikduel ----
    async function duel(ev) {
      const k = ev.k;
      const ikSchiet = ev.schutter.z === ik;
      const schutterKaart = teams[ev.schutter.z][ev.schutter.i], keeperKaart = teams[ev.keeper.z][ev.keeper.i];
      const mijnKaartD = ikSchiet ? schutterKaart : keeperKaart;
      const hunKaartD = ikSchiet ? keeperKaart : schutterKaart;
      // zoom in op de schutter en de keeper op het veld
      $('bord-status').textContent = 'Kans!';
      kaartEls[ev.schutter.z][ev.schutter.i].classList.add('in-duel');
      kaartEls[ev.keeper.z][ev.keeper.i].classList.add('in-duel');
      speel('whoosh', 0.5);
      // klaar-melding en wachten op de ander
      const duelEl = $('duel');
      $('duel-schutter').replaceChildren(kaartEl(ev.schutter.z === ik ? schutterKaart : Object.assign({}, schutterKaart, { kaart: null })));
      $('duel-keeper').replaceChildren(kaartEl(ev.keeper.z === ik ? keeperKaart : Object.assign({}, keeperKaart, { kaart: null })));
      $('duel-schutter').className = 'duel-kaart schutter'; $('duel-keeper').className = 'duel-kaart keeper';
      $('duel-rol').textContent = ikSchiet ? 'Jij schiet! Klik zo snel als je kunt.' : 'Jij verdedigt! Klik zo snel als je kunt.';
      const mf = G.klikFactor(mijnKaartD, mijnChem, G.auraVan ? G.auraVan(teams[ik]) : 0), hf = G.klikFactor(hunKaartD, hunChem, G.auraVan ? G.auraVan(teams[ik === 'A' ? 'B' : 'A']) : 0);
      $('duel-bonus').textContent = `Jouw ${ikSchiet ? 'schutter' : 'keeper'} (${fmt(mijnKaartD.cijfer)}): elke klik telt ×${fmtFlex(mf)}${mijnChem ? ` (chemie ${mijnChem})` : ''}. Bij ${o.hunNaam} ×${fmtFlex(hf)}${hunChem ? ` (chemie ${hunChem})` : ''}.`;
      if (mijnKaartD.v || hunKaartD.v) $('duel-bonus').textContent += ` ${mijnKaartD.v ? 'Jouw kaart is vervloekt: sterker, maar de vloek kan toeslaan.' : ''}${hunKaartD.v ? ` De kaart van ${o.hunNaam} is vervloekt.` : ''}`;
      $('kl-mijn').textContent = '0'; $('kl-hun').textContent = '0';
      $('meter-mijn').style.width = '50%'; $('meter-hun').style.width = '50%';
      $('duel-teller').textContent = ''; $('duel-teller').className = 'duel-teller';
      $('klik').disabled = true; $('klik').textContent = 'Wachten...';
      duelEl.hidden = false; duelEl.classList.remove('uit'); duelEl.classList.add('in');
      await kn.zend({ t: 'rdy', k });
      await kn.wacht('rdy:' + k, 30000);
      const hart = speel('hartslag', 0.8, true);
      // 3, 2, 1
      for (const c of ['3', '2', '1']) {
        $('duel-teller').textContent = c; $('duel-teller').classList.remove('pop'); void $('duel-teller').offsetWidth; $('duel-teller').classList.add('pop');
        trilVoor(30); speel('tik', 0.5);
        await wacht(1000);
      }
      // klikken
      let mijn = 0, vorige = 0;
      const verwerkHun = (m) => {
        if (m.t !== 'kl' || m.k !== k) return;
        $('kl-hun').textContent = G.schoonKlik(m.c);
        meter();
      };
      kn.luister(verwerkHun);
      const meter = () => {
        const a = G.schoonKlik(mijn) * mf, b = G.schoonKlik(Number($('kl-hun').textContent) || 0) * hf;
        const p = a + b > 0 ? (a / (a + b)) * 100 : 50;
        $('meter-mijn').style.width = p + '%'; $('meter-hun').style.width = (100 - p) + '%';
      };
      const eerder = kn.heeft('kl:' + k); // de ander kan al zijn begonnen
      if (eerder) verwerkHun(eerder);
      let open = true;
      // Anti-autoclicker: alleen echte klikken (isTrusted), hoogstens ~15 per seconde, en een autoclicker klikt veel te
      // regelmatig (een mens wisselt altijd een beetje). Zien we dat, dan tellen je kliks in dit duel niet.
      const momenten = [];
      let autoclicker = false;
      // Alleen een machine klikt zó strak: over de laatste 30 kliks wijkt elke tussentijd gemiddeld minder dan 2,5 ms af
      // (en minder dan 3%). Een mens die op een beat tikt, zit daar ruim boven (meestal 10-30 ms).
      const teRegelmatig = () => {
        if (momenten.length < 31) return false;
        const m = momenten.slice(-31), d = [];
        for (let i = 1; i < m.length; i++) d.push(m[i] - m[i - 1]);
        const gem = d.reduce((a, x) => a + x, 0) / d.length;
        const sd = Math.sqrt(d.reduce((a, x) => a + (x - gem) * (x - gem), 0) / d.length);
        return gem > 0 && sd < 2.5 && sd / gem < 0.03;
      };
      const tik = (e) => {
        if (!open || autoclicker) return;
        if (e && e.isTrusted === false) return;
        const nu = performance.now();
        if (nu - vorige < 65) return; // sneller dan ~15 per seconde is geen hand meer
        vorige = nu;
        momenten.push(nu);
        if (teRegelmatig()) {
          autoclicker = true;
          mijn = 0;
          $('kl-mijn').textContent = '0';
          $('duel-rol').textContent = 'Autoclicker gezien: je kliks tellen in dit duel niet.';
          meter();
          return;
        }
        if (mijn >= G.KLIK_MAX) return;
        mijn++;
        $('kl-mijn').textContent = mijn;
        meter();
        const b = $('klik'); b.classList.remove('druk'); void b.offsetWidth; b.classList.add('druk');
        duelEl.classList.remove('schud'); void duelEl.offsetWidth; duelEl.classList.add('schud');
        trilVoor(12);
        if (mijn % 3 === 0) speel('klik', 0.3);
      };
      const onKey = (e) => { if ((e.code === 'Space' || e.key === ' ') && !e.repeat) { e.preventDefault(); tik(e); } };
      const onPtr = (e) => { e.preventDefault(); tik(e); };
      $('klik').disabled = false; $('klik').textContent = 'KLIK!';
      $('klik').addEventListener('pointerdown', onPtr);
      document.addEventListener('keydown', onKey, true);
      $('klik').focus({ preventScroll: true });
      $('duel-teller').textContent = 'KLIK!'; $('duel-teller').className = 'duel-teller klik-nu';
      const t0 = performance.now();
      let laatsteZend = 0;
      while (performance.now() - t0 < KLIK_MS) {
        await slaap(60);
        if (kn.dood || kn.gestopt) break;
        if (performance.now() - laatsteZend > 220) { laatsteZend = performance.now(); kn.zend({ t: 'kl', k, c: mijn, f: 0 }); }
        $('duel-teller').textContent = ((KLIK_MS - (performance.now() - t0)) / 1000).toFixed(1).replace('.', ',');
      }
      open = false;
      if (!autoclicker && teRegelmatig()) { autoclicker = true; mijn = 0; }
      $('klik').removeEventListener('pointerdown', onPtr);
      document.removeEventListener('keydown', onKey, true);
      $('klik').disabled = true;
      stopGeluid(hart);
      if (kn.dood || kn.gestopt) throw kn.dood || new Error('afgebroken');
      await kn.zend({ t: 'kl', k, c: mijn, f: 1 });
      $('duel-teller').textContent = '...'; $('duel-teller').className = 'duel-teller';
      const hunEind = await kn.wacht('kl:' + k + ':f', 30000);
      const hunC = G.schoonKlik(hunEind.c);
      $('kl-hun').textContent = hunC; meter();
      const ca = ikSchiet ? mijn : hunC, ck = ikSchiet ? hunC : mijn;
      const u = sim.duelUitslag(ca, ck);
      // wie wint?
      const goal = u.goal;
      const iktel = ikSchiet ? u.sa : u.sk, hunTel = ikSchiet ? u.sk : u.sa;
      const jijWint = u.keert ? goal === ikSchiet : iktel > hunTel;
      $('duel-teller').textContent = u.keert ? 'VLOEK!' : goal ? 'GOAL!' : 'GEREDDEN!';
      $('duel-teller').className = 'duel-teller uit-' + (goal ? 'goal' : 'redding') + (jijWint ? ' win' : ' verlies');
      $('duel-bonus').textContent = `Jij: ${mijn} kliks ×${fmtFlex(mf)} = ${fmtFlex(iktel)}. ${o.hunNaam}: ${hunC} kliks ×${fmtFlex(hf)} = ${fmtFlex(hunTel)}.`;
      if (u.keert) {
        // De vloek sloeg toe: de uitslag van de kliks telt niet. Voor het team van de vervloekte kaart is dit een minpunt.
        const mijnVloek = u.keert.z === ik;
        const wat = u.keert.rol === 'schutter' ? 'schoot er expres naast' : 'liet de bal er expres in';
        $('duel-bonus').textContent = mijnVloek
          ? `VLOEK! Jouw vervloekte kaart keerde zich tegen je en ${wat}. Een minpunt voor jouw team.`
          : `VLOEK! De vervloekte kaart van ${o.hunNaam} keerde zich tegen zijn eigen team en ${wat}. Een punt voor jou.`;
        melding(mijnVloek ? 'De vloek sloeg toe: je eigen kaart werkte tegen.' : `De vloek sloeg toe bij ${o.hunNaam}.`, mijnVloek);
      }
      if (goal) { speel('gejuich', 0.8); speel('boem', 0.6); trilVoor([80, 40, 160]); } else { speel('boem', 0.5); trilVoor(60); }
      duelEl.classList.add('schud-groot');
      await wacht(2300);
      duelEl.classList.remove('schud-groot', 'in');
      duelEl.hidden = true;
      kaartEls[ev.schutter.z][ev.schutter.i].classList.remove('in-duel');
      kaartEls[ev.keeper.z][ev.keeper.i].classList.remove('in-duel');
      $('bord-status').textContent = goal ? 'Goal!' : 'Gered';
      if (goal) tekst('GOAL!', 1300);
      return u;
    }

    // ---- einde ----
    if (ro) ro.disconnect();
    const mijnS = stand[ik], hunS = stand[hun];
    await kn.zend({ t: 'eind', a: stand.A, b: stand.B });
    let afwijking = false;
    try { const e = await kn.wacht('eind:', 8000); afwijking = e.a !== stand.A || e.b !== stand.B; } catch (e) { /* ander is al weg: de uitslag staat vast */ }
    const kop = mijnS > hunS ? 'Gewonnen!' : mijnS < hunS ? 'Verloren' : 'Gelijkspel';
    let uitleg = mijnS > hunS ? 'Goed gedaan.' : mijnS < hunS ? `${o.hunNaam} was dit keer beter.` : 'Niemand won.';
    if (afwijking) uitleg += ' Let op: jullie schermen toonden niet precies dezelfde uitslag.';
    if (o.vriend) {
      try { gevechten = await L.bewaarUitslag(o.vriend.id, { ts: Date.now(), mijn: mijnS, hun: hunS, n }); } catch (e) { /* uitslag niet bewaard */ }
    }
    nieuweBadges(reddingen);
    speel(mijnS > hunS ? 'gejuich' : 'menigte', 0.7);
    kn.stop();
    if (live) live.pauze(false);
    actief = null;
    toonEinde({ kop, stand: `Jij ${mijnS} - ${hunS} ${o.hunNaam}`, tekst: uitleg });
    tekenVrienden(); tekenUitnodigingen();
  }

  async function aftellenGroot(controleer) {
    const d = $('veld-tekst');
    for (const c of ['3', '2', '1']) { d.textContent = c; d.classList.remove('toon'); void d.offsetWidth; d.classList.add('toon', 'groot'); await slaap(550); controleer(); }
    d.classList.remove('toon', 'groot');
  }

  // ---- start ----
  async function init() {
    try { const i = await L.lees('spo_instellingen'); geluidAan = !i || i.geluid !== false; } catch (e) { /* standaard aan */ }
    galerij = await L.leesGalerij();
    team = await L.leesTeam();
    opschonenTeam();
    st = await L.laad();
    gevechten = await L.leesGevechten();
    tekenBouw(); tekenKies(); tekenVrienden(); tekenUitnodigingen();
    window.addEventListener('resize', () => tekenBouw());
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!$('bouwveld')._breed || Math.abs($('bouwveld')._breed - $('bouwveld').clientWidth) > 4) { $('bouwveld')._breed = $('bouwveld').clientWidth; tekenBouw(); } }).observe($('bouwveld'));
    L.opOpslagWijziging(async () => {
      if (actief) return;
      galerij = await L.leesGalerij(); team = await L.leesTeam(); opschonenTeam(); gevechten = await L.leesGevechten();
      tekenBouw(); tekenKies(); tekenVrienden();
    });
    if (!st) { $('sync-status').textContent = 'Vriendenfunctie staat uit.'; $('sync').hidden = true; return; }
    startLive();
  }
  // Esc sluit het paneel; tijdens een gevecht niet per ongeluk.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('in-gevecht')) e.preventDefault(); }, true);
  $('sync').addEventListener('click', () => { if (live) { live.vergeet(); live.tik(); } });
  $('oefen').addEventListener('click', oefenen);
  $('team-leeg').addEventListener('click', () => { team = null; wijzig(); });
  init().catch((e) => melding(foutTekst(e), true));
  globalThis.SPOTeam = { oefenen };
})();
