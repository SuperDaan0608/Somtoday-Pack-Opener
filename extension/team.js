// Team maken en strafschoppenduels tegen vrienden (of de computer). De spelregels staan in duellib.js (en gevecht.js voor de sterkte van kaarten).
(function () {
  'use strict';
  const L = globalThis.SPOVrienden;
  const G = globalThis.SPOGevecht;
  const D = globalThis.SPODuel;
  const E = globalThis.SPOEco;
  const VB = globalThis.SPOVoetbal;
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const GLOED = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toFixed(1).replace('.', ',');
  const slaap = (ms) => new Promise((r) => setTimeout(r, ms));
  const tijd = (ts) => new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const VERLIES_MS = 10000;       // zo lang mag de ander stil zijn
  const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let st = null;          // vriendenstatus (alleen lezen; opslaan doet de vriendenpagina en synchroniseer)
  let galerij = [];
  let team = null;        // { ids: [keeperId, ...] }
  let vriendKaarten = {}; // wat vrienden delen (hier: hun team)
  let gevechten = {};
  let live = null;
  let banGemeld = false;  // de verbanningsmelding maar één keer tonen
  let uitnodigingen = []; // binnengekomen: { mid, van, team, nonce, ts }
  let actief = null;      // lopend duel of lopende uitnodiging die ik stuurde
  let geluidAan = true;
  let instellingen = {};  // spo_instellingen (geluid, laag, meekijken, duelFilm, duelKijkers)
  let film = 'kort';      // filmpje van de strafschop: 'kort' | 'vol' | 'uit'
  let kijkLijst = [];     // uitnodigingen om mee te kijken: { mid, van, z, tg, ts }
  let kijkSessie = null;  // ik kijk mee met het duel van een vriend

  function el(tag, klas, tekst) { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst !== undefined) e.textContent = tekst; return e; }
  function melding(tekst, fout) { const p = el('p', fout ? 'fout' : '', tekst); $('melding').append(p); setTimeout(() => p.remove(), fout ? 9000 : 5000); }
  const foutTekst = (e) => (e && e.message ? e.message : 'Er ging iets mis.');
  const actieveVrienden = () => (st ? st.vrienden.filter((v) => v.status === 'vriend') : []);
  const vriendNaam = (id) => { const v = st && st.vrienden.find((x) => x.id === id); return v ? L.naam(v) : 'Vriend'; };

  // ---- geluid en trillen ----
  function speel(naam, vol, herhaal) {
    if (!geluidAan) return null;
    try {
      const a = new Audio('sounds/' + naam + '.mp3');
      a.volume = vol === undefined ? 0.7 : vol; a.loop = !!herhaal;
      const p = a.play(); if (p && p.catch) p.catch(() => {});
      return a;
    } catch (e) { return null; }
  }
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
    else if (k.h) d.append(el('i', 'heel-badge', 'HEEL'));
    if (naam) d.setAttribute('aria-label', naam);
    return d;
  }
  const mijnKaart = (e) => ({ vak: e.vak, cijfer: e.cijfer, tier: e.tier | 0, z: e.zeldzaam === true || (e.trede | 0) >= 1, t: Math.max(0, Math.min(4, e.trede | 0)) || (e.zeldzaam === true ? 1 : 0), kaart: e.kaart, id: e.id, v: e.vloek === true && !(e.heel > 0), h: e.vloek === true && e.heel > 0 });

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
    $('chemie-bonus').textContent = c.score ? `In een duel: +${pct(G.chemieBonus(c.score))}% sterkte voor al je kaarten.` : 'Nog geen bonus in een duel.';
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
      if (e.vloek && !(e.heel > 0)) { b.classList.add('vloek'); b.append(el('i', 'vloek-badge', 'VLOEK')); b.setAttribute('aria-label', b.getAttribute('aria-label') + ', vervloekt'); }
      else if (e.vloek) { b.append(el('i', 'heel-badge', 'HEEL')); b.setAttribute('aria-label', b.getAttribute('aria-label') + ', vloek opgeheven'); }
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
    return { ok: true, tekst: `Team van ${L.naam(v)}: ${hun.kaarten.length} ${hun.kaarten.length === 1 ? 'kaart' : 'kaarten'}. Een duel kan met teams van elke grootte.` };
  }
  function tekenVrienden() {
    $('vriend-uitleg').hidden = !!st;
    const ul = $('gv-vrienden');
    ul.replaceChildren();
    $('oefen').disabled = !teamLijst().length || !!actief || !!kijkSessie;
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
      b.disabled = !s.ok || !!actief || !!kijkSessie;
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
      d.append(el('p', 'un-tekst', `${naam} daagt je uit voor een strafschoppenduel met ${u.team.kaarten.length} ${u.team.kaarten.length === 1 ? 'kaart' : 'kaarten'}.`));
      const mijn = teamLijst().length;
      const kan = mijn > 0 && !actief && !kijkSessie;
      const ja = el('button', 'knop goud klein', 'Accepteren'); ja.type = 'button'; ja.disabled = !kan;
      const nee = el('button', 'knop klein', 'Weigeren'); nee.type = 'button';
      ja.addEventListener('click', () => accepteer(u));
      nee.addEventListener('click', async () => {
        uitnodigingen = uitnodigingen.filter((x) => x !== u); tekenUitnodigingen();
        const v = st.vrienden.find((x) => x.id === u.van);
        try { if (v) await L.stuurBericht(st, v, { t: 'sd_nee', mid: u.mid }); } catch (e) { /* de uitdager ziet het vanzelf */ }
      });
      const rij = el('div', 'acties'); rij.append(ja, nee);
      d.append(rij);
      if (!kan && !actief && !kijkSessie) d.append(el('p', 'uitleg uit-uitleg', 'Maak eerst een team om te accepteren.'));
      w.append(d);
    }
  }
  // Uitnodigingen om live mee te kijken (alleen van vrienden). Ze blijven staan zolang de speler ze elke 2,5 minuut vernieuwt.
  function tekenKijkUitnodigingen() {
    const w = $('kijk-uitnodigingen');
    w.replaceChildren();
    kijkLijst = kijkLijst.filter((u) => Date.now() - u.ts < 200000);
    for (const u of kijkLijst) {
      const d = el('div', 'kijk-uitnodiging');
      d.append(el('p', '', `${vriendNaam(u.van)} speelt een strafschoppenduel. Kijk mee!`));
      const b = el('button', 'knop goud klein', 'Kijk mee'); b.type = 'button'; b.disabled = !!actief || !!kijkSessie;
      b.addEventListener('click', () => kijkMee(u));
      d.append(b); w.append(d);
    }
  }

  // ---- berichten van vrienden (via de live-synchronisatie) ----
  function opBerichten(van, lijst) {
    for (const { m, leeftijd } of lijst) {
      const s = D.schoonBericht(m, leeftijd);
      if (!s) continue;
      if (actief && actief.mid === s.mid) {
        if (actief.vriend && actief.vriend.id === van) actief.kanaal.voer(s);
        else opKijkerBericht(van, s);
        continue;
      }
      if (kijkSessie && kijkSessie.mid === s.mid && kijkSessie.van === van) { kijkSessie.ontvang(s); continue; }
      if (s.t === 'sd_uit') {
        if (uitnodigingen.some((u) => u.mid === s.mid)) continue;
        uitnodigingen.push({ mid: s.mid, van, team: s.team, nonce: s.nonce, ts: Date.now() - leeftijd * 1000 });
        speel('klik', 0.5);
      } else if (s.t === 'sd_nee' || s.t === 'sd_stop') {
        uitnodigingen = uitnodigingen.filter((u) => u.mid !== s.mid);
        if (s.t === 'sd_stop') kijkLijst = kijkLijst.filter((u) => u.mid !== s.mid);
      } else if (s.t === 'sd_kijk') {
        const bestaand = kijkLijst.find((u) => u.mid === s.mid);
        if (bestaand) bestaand.ts = Date.now();
        else kijkLijst.push({ mid: s.mid, van, z: s.z, tg: s.tg, ts: Date.now() });
      }
    }
    tekenUitnodigingen(); tekenKijkUitnodigingen(); tekenVrienden();
  }
  // Iemand die niet mijn tegenstander is, stuurt iets over mijn lopende duel: een toeschouwer.
  function opKijkerBericht(van, s) {
    if (!actief || !actief.kijkers) return;
    if (s.t === 'sd_mee') {
      const v = actief.kijkOntvangers().find((x) => x.id === van);
      if (v && actief.kijkers.size < 8) { actief.kijkers.set(van, v); actief.toonKijkers(); }
    } else if (s.t === 'sd_stop') {
      actief.kijkers.delete(van); actief.toonKijkers();
    } else if (s.t === 'sd_emoji' && actief.kijkers.has(van)) {
      vliegEmoji(s.e, vriendNaam(van));
      try { actief.kanaal.zend({ t: 'sd_emoji', e: s.e }); } catch (e) { /* de ander ziet het niet */ }
    }
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

  // ---- kanaal voor een duel ----
  // Berichten zijn { mid, t, k?, ... } en zijn al door D.schoonBericht gegaan. Types: zie duellib.js.
  function maakKanaal(zendFn) {
    const inbox = new Map(), wachters = new Set(), luisteraars = [];
    const k = { laatst: Date.now(), dood: null, gestopt: false };
    const sl = (m) => m.t + ':' + (m.k === undefined ? '' : m.k);
    function controleer() { for (const w of [...wachters]) w(); }
    k.voer = (m) => {
      k.laatst = Date.now();
      if (m.t === 'sd_hb') return;
      if (m.t === 'sd_stop' || m.t === 'sd_nee') k.dood = k.dood || new Error(m.t === 'sd_stop' ? 'gestopt' : 'weiger');
      inbox.set(sl(m), m);
      luisteraars.forEach((f) => f(m));
      controleer();
    };
    k.heeft = (naam) => inbox.get(naam);
    k.luister = (f) => luisteraars.push(f);
    // Wacht op een bericht. Bij `zacht` is een te lange wachttijd niet erg: dan komt er null terug in plaats van een fout.
    k.wacht = (naam, ms, zacht) => new Promise((res, rej) => {
      const einde = Date.now() + (ms || 120000);
      const iv = setInterval(w, 150);
      function klaar() { clearInterval(iv); wachters.delete(w); }
      function w() {
        const v = inbox.get(naam);
        if (v) { klaar(); res(v); return; }
        if (k.dood || k.gestopt) { klaar(); rej(k.dood || new Error('afgebroken')); return; }
        if (Date.now() - k.laatst > VERLIES_MS) { klaar(); k.dood = k.dood || new Error('verlies'); rej(k.dood); return; }
        if (Date.now() > einde) { klaar(); if (zacht) res(null); else { k.dood = k.dood || new Error('verlies'); rej(k.dood); } }
      }
      wachters.add(w); w();
    });
    k.zend = (m) => zendFn(m);
    k.stop = () => { k.gestopt = true; controleer(); };
    return k;
  }
  function kanaalVriend(v, mid) {
    let rij = Promise.resolve();
    const kn = maakKanaal((m) => {
      rij = rij.then(() => L.stuurBericht(st, v, Object.assign({ mid }, m))).then(() => {}, () => {});
      return rij;
    });
    let stopPoll = false;
    kn.start = () => {
      (async () => {
        while (!stopPoll) {
          const t0 = Date.now();
          try {
            for (const b of await L.haalBerichten(st, v, live.cursor)) {
              const s = D.schoonBericht(b.m, b.leeftijd);
              if (s && s.mid === mid) kn.voer(s);
            }
          } catch (e) { /* kn.laatst loopt op; na 10 s is de verbinding verloren */ }
          await slaap(Math.max(60, 250 - (Date.now() - t0)));
        }
      })();
      kn.hb = setInterval(() => kn.zend({ t: 'sd_hb' }), 2000);
      kn.bewaker = setInterval(() => { if (Date.now() - kn.laatst > VERLIES_MS) { kn.dood = kn.dood || new Error('verlies'); } }, 1000);
    };
    const oud = kn.stop;
    kn.stop = () => { stopPoll = true; clearInterval(kn.hb); clearInterval(kn.bewaker); oud(); };
    return kn;
  }
  // De computer: kiest als schutter en als keeper volgens dezelfde regels als een mens (vastlegging, schot, onthulling),
  // en weet niets van jouw keuze voor jij hem laat zien.
  function kanaalComputer(rng, kaartVoor, mid) {
    let keeperKeuze = null, wachtOpVast = null;
    const na = (ms, f) => setTimeout(() => { if (!kn.gestopt && !kn.dood) f(); }, ms);
    const kn = maakKanaal((m) => {
      if (m.t === 'sd_schot' && keeperKeuze && keeperKeuze.k === m.k) {
        const kk = keeperKeuze; keeperKeuze = null;
        na(400 + rng() * 500, () => kn.voer({ t: 'sd_onthul', mid, k: kk.k, r: kk.dr, h: kk.dh, n: kk.n }));
      } else if (m.t === 'sd_vast' && wachtOpVast && wachtOpVast.k === m.k) {
        const w = wachtOpVast; wachtOpVast = null;
        const s = D.computerSchot(rng, w.kaart);
        na(900 + rng() * 1800, () => kn.voer({ t: 'sd_schot', mid, k: w.k, r: s.r, h: s.h, q: s.q, n: D.nonce() }));
      } else if (m.t === 'sd_eind') na(50, () => kn.voer({ t: 'sd_eind', mid, a: m.a, b: m.b }));
    });
    // Bij elke strafschop meldt het scherm dat hij begint: de computer doet dan zijn deel.
    kn.beginKick = async (k, schutterKant, ik) => {
      if (schutterKant === ik) { // de computer is keeper: eerst vastleggen
        const d = D.computerDuik(rng, kaartVoor(k, false));
        const n = D.nonce();
        const c = await D.legVast(mid, k, d.dr, d.dh, n);
        keeperKeuze = { k, dr: d.dr, dh: d.dh, n };
        na(700 + rng() * 800, () => kn.voer({ t: 'sd_vast', mid, k, c }));
      } else wachtOpVast = { k, kaart: kaartVoor(k, true) };
    };
    kn.start = () => { kn.hb = setInterval(() => { kn.laatst = Date.now(); }, 1000); }; // de computer is nooit stil
    const oud = kn.stop;
    kn.stop = () => { clearInterval(kn.hb); oud(); };
    return kn;
  }

  // ---- uitdagen, accepteren ----
  const maakMid = () => L.maakRid().slice(0, 16);
  async function uitdagen(v) {
    if (actief || kijkSessie) return;
    const mijn = teamLijst();
    const s = uitdaagStatus(v);
    if (!s.ok) { melding(s.tekst, true); return; }
    const mid = maakMid(), nonce = L.maakRid().slice(0, 16);
    const kn = kanaalVriend(v, mid);
    actief = { mid, kanaal: kn, vriend: v, rol: 'A' };
    tekenVrienden();
    toonWachten(`Uitnodiging gestuurd naar ${L.naam(v)}. Wachten op antwoord...`, async () => {
      try { await kn.zend({ t: 'sd_stop' }); } catch (e) { /* weg is weg */ }
      kn.stop(); actief = null; verbergScherm(); tekenVrienden();
    });
    try {
      const snap = L.teamMomentopname(mijn);
      await L.stuurBericht(st, v, { t: 'sd_uit', mid, nonce, team: snap });
      kn.start();
      const a = await kn.wacht('sd_ja:', 90000);
      if (!a.team) throw new Error('Het team van je vriend klopt niet.');
      await speelDuel({ mid, rol: 'A', kanaal: kn, vriend: v, seedTekst: `${mid}|${nonce}|${a.nonce}`, mijn, snap, hunSnap: a.team, hunNaam: L.naam(v) });
    } catch (e) {
      afbreken(e, v);
    }
  }
  async function accepteer(u) {
    if (actief || kijkSessie) return;
    const v = st.vrienden.find((x) => x.id === u.van && x.status === 'vriend');
    const mijn = teamLijst();
    if (!v || !mijn.length) return;
    uitnodigingen = uitnodigingen.filter((x) => x !== u); tekenUitnodigingen();
    const kn = kanaalVriend(v, u.mid);
    actief = { mid: u.mid, kanaal: kn, vriend: v, rol: 'B' };
    tekenVrienden();
    toonWachten('Duel starten...', () => { kn.zend({ t: 'sd_stop' }); kn.stop(); actief = null; verbergScherm(); tekenVrienden(); });
    try {
      const nonce = L.maakRid().slice(0, 16);
      kn.start();
      const snap = L.teamMomentopname(mijn);
      await L.stuurBericht(st, v, { t: 'sd_ja', mid: u.mid, nonce, team: snap });
      await speelDuel({ mid: u.mid, rol: 'B', kanaal: kn, vriend: v, seedTekst: `${u.mid}|${u.nonce}|${nonce}`, mijn, snap, hunSnap: u.team, hunNaam: L.naam(v) });
    } catch (e) { afbreken(e, v); }
  }
  async function oefenen() {
    if (actief || kijkSessie) return;
    const mijn = teamLijst();
    if (!mijn.length) return;
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    const mijnK = mijn.map(mijnKaart);
    const hunK = G.maakComputerTeam(seed, Math.max(1, Math.min(11, mijn.length)), mijnK);
    const rng = G.maakRng(seed ^ 0x5bd1e995);
    const hunSnap = { kaarten: hunK.map((k) => ({ vak: k.vak, cijfer: k.cijfer, tier: k.tier, z: k.z, t: k.t, v: false, h: false })) };
    hunSnap.ch = G.chemie(G.ordenTeam(hunSnap.kaarten, 0)).score;
    // de computer-keeper en -schutters (kaartVoor wordt pas gebruikt als het duel zijn teams kent)
    const mid = L.maakRid();
    const kn = kanaalComputer(rng, (k, schiet) => (kn._rol ? (schiet ? D.schutterVoor(kn._rol, D.beurtVan(k)) : kn._rol.keeper) : hunSnap.kaarten[0]), mid);
    actief = { mid, kanaal: kn, computer: true, rol: 'A' };
    tekenVrienden();
    kn.start();
    try {
      await speelDuel({ mid, rol: 'A', kanaal: kn, computer: true, seedTekst: 'oefen|' + seed + '|' + D.nonce(), mijn, snap: L.teamMomentopname(mijn), hunSnap, hunNaam: 'Computer' });
    } catch (e) { afbreken(e, null); }
  }
  function afbreken(e, v) {
    const msg = e && e.message;
    if (actief && actief.kanaal) { actief.kanaal.stop(); }
    stopKijkMelding();
    const naam = v ? L.naam(v) : 'de tegenstander';
    let uitleg = msg === 'verlies' ? 'Verbinding verloren. Het duel is gestopt.' : msg === 'gestopt' ? `${naam} is gestopt.` : msg === 'weiger' ? `${naam} wil nu niet spelen.` : msg === 'afgebroken' ? 'Je hebt het duel gestopt.' : msg === 'vals' ? 'De onthulling van de keeper klopte niet met wat hij eerst vastlegde. Het duel is gestopt.' : foutTekst(e);
    if (msg === 'verlies' && actief && !actief.begonnen) uitleg = `Geen antwoord van ${naam}. De uitnodiging is verlopen.`;
    filmStop && filmStop();
    toonEinde({ kop: msg === 'afgebroken' ? 'Gestopt' : 'Duel afgelopen', stand: '', tekst: uitleg });
    actief = null; tekenVrienden(); tekenUitnodigingen();
  }

  // ---- scherm ----
  const achterScherm = () => [document.getElementById('hoofd'), document.querySelector('.kop')].filter(Boolean);
  function toonScherm() { $('scherm').hidden = false; document.body.classList.add('in-gevecht'); achterScherm().forEach((e) => { e.inert = true; }); }
  function verbergScherm() { $('scherm').hidden = true; $('scherm').classList.remove('met-balk'); document.body.classList.remove('in-gevecht'); $('einde').hidden = true; $('emoji-balk').hidden = true; achterScherm().forEach((e) => { e.inert = false; }); }
  let wachtStop = null;
  function toonWachten(tekst, stop) {
    toonScherm();
    $('einde').hidden = true;
    $('bord-status').textContent = tekst; $('klok').textContent = 'Duel';
    $('naam-a').textContent = ''; $('naam-b').textContent = '';
    $('keuze').hidden = true; $('kaart-rij').hidden = true; $('kijk-info').textContent = '';
    $('uitslag-tekst').textContent = tekst;
    wachtStop = stop;
  }
  function toonEinde(o) {
    toonScherm();
    $('einde-kop').textContent = o.kop; $('einde-stand').textContent = o.stand; $('einde-tekst').textContent = o.tekst;
    $('einde').hidden = false;
    $('emoji-balk').hidden = true; $('scherm').classList.remove('met-balk');
    $('einde-kop').focus();
  }
  $('einde-terug').addEventListener('click', () => { verbergScherm(); kijkSessie = null; tekenVrienden(); tekenUitnodigingen(); tekenKijkUitnodigingen(); if ($('oefen')) $('oefen').focus(); });
  $('stop').addEventListener('click', async () => {
    if (kijkSessie) { kijkSessie.stop(); return; }
    if (wachtStop && (!actief || !actief.begonnen)) { const f = wachtStop; wachtStop = null; f(); return; }
    if (actief && actief.kanaal) { try { actief.kanaal.zend({ t: 'sd_stop' }); } catch (e) { /* niets */ } actief.kanaal.gestopt = true; actief.kanaal.dood = new Error('afgebroken'); actief.kanaal.voer({ t: 'sd_hb', mid: actief.mid }); }
  });

  // ---- emoji over het scherm (ook over het filmpje heen) ----
  function vliegEmoji(emoji, naam) {
    const laag = $('emoji-laag');
    const v = el('span', 'v');
    v.style.left = (8 + Math.random() * 80) + '%';
    v.style.setProperty('--x', Math.round((Math.random() - 0.5) * 140) + 'px');
    v.style.setProperty('--d', (3 + Math.random() * 1.6).toFixed(2) + 's');
    v.append(document.createTextNode(emoji));
    if (naam) v.append(el('small', '', String(naam).slice(0, 24)));
    laag.append(v);
    while (laag.children.length > 40) laag.firstElementChild.remove();
    setTimeout(() => v.remove(), 5200);
  }

  // ---- uiterlijk: voetballer en stadion ----
  const NAMEN_ZONE = { 'hoog-links': 'Links boven', 'hoog-midden': 'Midden boven', 'hoog-rechts': 'Rechts boven', 'laag-links': 'Links onder', 'laag-midden': 'Midden onder', 'laag-rechts': 'Rechts onder' };
  // Mijn voetballer en stadion (en die van de computer of een vriend): { av (voor het tekenen), sd }
  async function mijnUiterlijk() {
    try { if (E && E.leesVoetbal) { const r = await E.leesVoetbal(); if (r) return { av: r.staat.avatar, sd: r.staat.stadion }; } } catch (e) { /* zonder uiterlijk */ }
    return { av: VB ? VB.STANDAARD_AVATAR : null, sd: VB ? VB.STANDAARD_STADION : null };
  }
  function vriendUiterlijk(id) {
    const p = vriendKaarten[id] && vriendKaarten[id].profiel;
    return { av: p && p.av ? p.av : null, sd: p && p.sd ? p.sd : null };
  }
  function computerUiterlijk(seedTekst) {
    if (!VB) return { av: null, sd: null };
    const r = G.maakRng(G.seedUitTekst('uiterlijk|' + seedTekst));
    const kies = (l) => l[Math.floor(r() * l.length)];
    return { av: VB.schoonAvatar({ huid: Math.floor(r() * 6), haar: kies(['kort', 'krullen', 'kaal']), haarkleur: Math.floor(r() * 6), kit: kies(['blauw', 'groen', 'oranje', 'wit', 'zwart']), nummer: 1 + Math.floor(r() * 30), juich: kies(['knie', 'armen']) }), sd: null };
  }
  const strafAv = (av) => (VB && av ? VB.naarSchutter(av) : null);
  function tekenFiguur(cv, av, pose) {
    try { if (VB && av && cv) VB.tekenAvatar(cv, av, { pose: pose || 'staan', schaal: 0.6 }); else if (cv) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); } } catch (e) { /* tekenen is een extraatje */ }
  }
  function tekenAchtergrond(sd) {
    const cv = $('pd-bg');
    try {
      if (VB) {
        VB.tekenStadion(cv, sd || VB.STANDAARD_STADION, { schaal: 1.2 });
        const th = VB.naarThema(sd || VB.STANDAARD_STADION);
        $('gras').style.setProperty('--gras1', th.gras[0]); $('gras').style.setProperty('--gras2', th.gras[1]);
      }
    } catch (e) { /* zonder achtergrond */ }
  }

  // ---- het doel en de bal (2D) ----
  // Het doel staat op 27% tot 73% breed en op 24% tot 49,6% hoog van het podium (zie team.css).
  const DOEL = { x0: 27, w: 46, y0: 24, h: 25.6 };
  const zoneMidden = (r, h) => ({ x: DOEL.x0 + ((D.RICHTINGEN.indexOf(r) + 0.5) / 3) * DOEL.w, y: DOEL.y0 + ((h === 'hoog' ? 0.5 : 1.5) / 2) * DOEL.h });
  function bouwZones() {
    const z = $('zones'); z.replaceChildren();
    let n = 0;
    for (const h of ['hoog', 'laag']) for (const r of D.RICHTINGEN) {
      n++;
      const b = el('button', 'zone'); b.type = 'button'; b.dataset.r = r; b.dataset.h = h; b.disabled = true;
      b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-keyshortcuts', String(n));
      b.setAttribute('aria-label', `${NAMEN_ZONE[h + '-' + r]}, toets ${n}`);
      b.append(el('span', 'zn', String(n)));
      z.append(b);
    }
  }
  function resetPodium() {
    const bal = $('bal'), kf = $('keeper-fig'), sf = $('schutter-fig');
    bal.style.left = '50%'; bal.style.top = '86%'; bal.style.transform = '';
    kf.style.transform = ''; sf.classList.remove('schop');
    $('podium').classList.remove('schud');
    $('zones').querySelectorAll('.zone').forEach((b) => { b.classList.remove('doel-raak', 'gered'); });
    $('pd-tekst').className = 'pd-tekst';
  }
  async function toon2D(o, kort) {
    // o: { r, h, dr, dh, uitkomst, sUit, kUit, wacht }
    if (!kort) {
      $('schutter-fig').classList.add('schop');
      await o.wacht(rustig ? 0 : 250);
    }
    zetEind(o);
    if (!kort) await o.wacht(rustig ? 0 : 650);
    // de uitslag
    const goal = o.uitkomst === 'goal';
    const txt = $('pd-tekst');
    txt.textContent = goal ? 'GOAL!' : o.uitkomst === 'redding' ? 'GEREDDEN!' : o.uitkomst === 'paal' ? 'PAAL!' : 'OVER!';
    txt.className = 'pd-tekst toon ' + (goal ? 'goal' : 'mis');
    if (o.uitkomst === 'goal' || o.uitkomst === 'redding') {
      const z = [...$('zones').children].find((b) => b.dataset.r === o.r && b.dataset.h === o.h);
      if (z) z.classList.add(goal ? 'doel-raak' : 'gered');
    }
    if (goal && !rustig) $('podium').classList.add('schud');
    tekenFiguur($('cv-schutter'), o.sUit, goal ? undefined : 'staan');
    tekenFiguur($('cv-keeper'), o.kUit, o.uitkomst === 'redding' ? undefined : 'staan');
  }
  // De bal gaat naar de hoek van het schot (of tegen de paal, of erover) en de keeper duikt naar zijn eigen keuze.
  function zetEind(o) {
    const bal = $('bal'), kf = $('keeper-fig');
    const m = zoneMidden(o.r, o.h);
    let x = m.x, y = m.y;
    if (o.uitkomst === 'paal') { x = o.r === 'midden' ? 50 : o.r === 'links' ? DOEL.x0 : DOEL.x0 + DOEL.w; y = o.r === 'midden' ? DOEL.y0 : m.y; }
    else if (o.uitkomst === 'over') { y = DOEL.y0 - 9; }
    bal.style.left = x + '%'; bal.style.top = y + '%';
    bal.style.transform = 'scale(.6)';
    const dm = zoneMidden(o.dr, o.dh);
    const dx = ((dm.x - 50) / DOEL.w * 100) / 20 * 100; // de keeper is 20% van de doelbreedte breed
    kf.style.transform = `translate(calc(-50% + ${Math.round(dx)}%), ${o.dh === 'hoog' ? -60 : 0}%) rotate(${o.dr === 'links' ? -40 : o.dr === 'rechts' ? 40 : 0}deg)`;
  }

  // ---- het filmpje (motor/strafschop.js) ----
  let filmBelofte = null, filmStop = null;
  function laadFilm() {
    if (globalThis.__SPO && globalThis.__SPO.strafschop) return Promise.resolve(true);
    if (filmBelofte) return filmBelofte;
    const lijst = ['motor/data.js', 'motor/audio.js', 'motor/shaders.js', 'motor/gl.js', 'motor/art.js', 'motor/strafschop.js'];
    filmBelofte = (async () => {
      try {
        for (const src of lijst) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.append(s); });
        return !!(globalThis.__SPO && globalThis.__SPO.strafschop);
      } catch (e) { return false; }
    })();
    return filmBelofte;
  }
  // Speelt het filmpje. Geeft true als het gelukt is. Bij elke fout, bij opgeven van het filmpje en bij 'geen filmpje' false: dan toont de 2D-scène de uitslag.
  async function speelFilm(p) {
    if (film === 'uit') return false;
    const ok = await laadFilm();
    if (!ok) return false;
    return new Promise((res) => {
      let api = null, klaar = false, iv = 0, vang = 0, vervaag = 0;
      const af = (gelukt) => {
        if (klaar) return;
        klaar = true; clearInterval(iv); clearTimeout(vang); clearTimeout(vervaag); filmStop = null; $('film-over').hidden = true;
        let opgegeven = false;
        try { opgegeven = !!(api && api.status && api.status().opgegeven); } catch (e) { /* niets */ }
        try { if (api && api.host) api.host.remove(); } catch (e) { /* niets */ }
        res(gelukt && !opgegeven);
      };
      const inv = {
        schutter: Object.assign({ vak: p.schutter.vak, cijfer: p.schutter.cijfer, tier: p.schutter.tier, trede: p.schutter.t, vloek: p.schutter.v === true }, strafAv(p.sUit) ? { av: strafAv(p.sUit) } : {}),
        keeper: Object.assign({ vak: p.keeper.vak, cijfer: p.keeper.cijfer, tier: p.keeper.tier, trede: p.keeper.t, vloek: p.keeper.v === true }, strafAv(p.kUit) ? { av: strafAv(p.kUit) } : {}),
        uitkomst: p.uitkomst, richting: p.r, hoogte: p.h, kracht: D.krachtVan(p.q),
        thema: p.thema || undefined, stil: !geluidAan, laag: instellingen.laag === true,
        opKlaar: () => af(true),
      };
      try { api = globalThis.__SPO.strafschop.start(inv); } catch (e) { af(false); return; }
      filmStop = () => { try { api.sluit(); } catch (e) { af(false); } };
      $('film-over').hidden = false;
      vang = setTimeout(() => { try { api.sluit(); } catch (e) { /* niets */ } af(false); }, 60000);
      if (film === 'kort' && api && api.tl) {
        const stopT = api.tl.tR + 0.3; // net na de reactie, voor de herhaling
        iv = setInterval(() => {
          if (api.beginMs == null || (performance.now() - api.beginMs) / 1000 < stopT) return;
          clearInterval(iv);
          try { api.host.style.transition = 'opacity .35s'; api.host.style.opacity = '0'; } catch (e) { /* niets */ }
          vervaag = setTimeout(() => filmStop && filmStop(), 380);
        }, 120);
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('in-gevecht')) { e.preventDefault(); if (filmStop) filmStop(); }
  }, true);
  $('film-over').addEventListener('click', () => { if (filmStop) filmStop(); });

  // ---- uitslag tonen: filmpje of 2D ----
  async function toonUitkomst(o) {
    const gespeeld = o.inhalen ? false : await speelFilm(o);
    resetPodium();
    await toon2D(o, gespeeld || o.inhalen);
    await o.wacht(o.inhalen ? 350 : gespeeld ? 900 : rustig ? 1200 : 1700);
  }

  // ---- een keuze vragen (schutter: hoek + timing, keeper: duikhoek) ----
  function vraagKeuze(o) {
    return new Promise((res) => {
      const zones = [...$('zones').children];
      const bev = $('bevestig'), zonder = $('zonder'), tm = $('timing');
      let gekozen = null, klaar = false, raf = 0, iv = 0, tijdUit = 0;
      const t0 = performance.now();
      const periode = rustig ? 1800 : 950;
      const zoneMid = 0.3 + 0.4 * Math.random(), half = o.schiet ? D.zoneHalf(o.kaart) : 0;
      let plek = 0;
      zones.forEach((b) => { b.disabled = false; b.className = 'zone'; b.setAttribute('aria-pressed', 'false'); });
      bev.disabled = true; bev.textContent = o.schiet ? 'Schiet!' : 'Duik!'; bev.hidden = false;
      zonder.hidden = !o.schiet; tm.hidden = !o.schiet;
      if (o.schiet) {
        $('tm-zone').style.left = ((zoneMid - half) * 100) + '%'; $('tm-zone').style.width = (half * 200) + '%';
        $('tm-hulp').textContent = rustig ? 'Je hebt minder beweging aan staan, daarom beweegt de wijzer trager. Stop de wijzer in de groene zone, of kies Zonder timing.' : 'Stop de wijzer in de groene zone met de knop of de spatiebalk. Of kies Zonder timing.';
        const lus = () => {
          plek = D.wijzerPlek(performance.now() - t0, periode);
          $('tm-wijzer').style.left = (plek * 100) + '%';
          raf = requestAnimationFrame(lus);
        };
        lus();
      }
      function kies(b, naarKnop) {
        if (klaar) return;
        zones.forEach((z) => { z.setAttribute('aria-pressed', String(z === b)); });
        gekozen = { r: b.dataset.r, h: b.dataset.h };
        bev.disabled = false;
        if (naarKnop) bev.focus({ preventScroll: true }); // na een cijfertoets: Spatie of Enter schiet (of duikt)
        $('uitslag-tekst').textContent = 'Gekozen: ' + NAMEN_ZONE[b.dataset.h + '-' + b.dataset.r] + '.';
      }
      function eind(q, auto) {
        if (klaar) return;
        klaar = true;
        cancelAnimationFrame(raf); clearInterval(iv); clearTimeout(tijdUit);
        document.removeEventListener('keydown', toets, true);
        zones.forEach((z) => { z.disabled = true; z.removeEventListener('click', klik); });
        bev.disabled = true; zonder.hidden = true; tm.hidden = true;
        const g = gekozen || { r: 'midden', h: 'laag' };
        res(o.schiet ? { r: g.r, h: g.h, q, auto: !!auto } : { dr: g.r, dh: g.h, auto: !!auto });
      }
      const bevestigNu = () => { if (!gekozen) { $('uitslag-tekst').textContent = 'Kies eerst een hoek.'; return; } eind(o.schiet ? D.timingKwaliteit(plek, zoneMid, half) : 0, false); };
      const klik = (e) => kies(e.currentTarget);
      zones.forEach((z) => z.addEventListener('click', klik));
      bev.onclick = bevestigNu;
      zonder.onclick = () => { if (!gekozen) { $('uitslag-tekst').textContent = 'Kies eerst een hoek.'; return; } eind(D.ZONDER_TIMING, false); };
      function toets(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^[1-6]$/.test(e.key)) { e.preventDefault(); kies(zones[Number(e.key) - 1], true); return; }
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); bevestigNu(); }
      }
      document.addEventListener('keydown', toets, true);
      iv = setInterval(() => { if (o.afgebroken()) { klaar = false; eind(0, true); } }, 200);
      tijdUit = setTimeout(() => {
        if (!gekozen) kies(zones[Math.floor(Math.random() * zones.length)]);
        $('uitslag-tekst').textContent = 'De tijd is om: het spel koos voor je.';
        eind(o.schiet ? Math.min(D.timingKwaliteit(plek, zoneMid, half), 40) : 0, true);
      }, o.ms);
      const eerste = zones[0]; if (eerste) eerste.focus({ preventScroll: true });
    });
  }

  // ---- toeschouwers van mijn duel ----
  function stopKijkMelding() {
    if (actief && actief.kijkTimer) { clearInterval(actief.kijkTimer); actief.kijkTimer = 0; }
  }

  // ---- het duel zelf ----
  async function speelDuel(o) {
    const kn = o.kanaal;
    actief.begonnen = true; wachtStop = null;
    const mid = o.mid;                       // voor de beloning en het bewaren van de uitslag
    const ik = o.rol, hun = D.anderKant(ik);
    const seedTekst = o.seedTekst;
    // Beide kanten rekenen met dezelfde, schoongemaakte teamgegevens (precies wat over de lijn ging).
    const mijnSn = L.schoonTeam(o.snap), hunSn = L.schoonTeam(o.hunSnap);
    if (!mijnSn || !hunSn) throw new Error('Het team klopt niet.');
    const mijnKaarten = mijnSn.kaarten.map((k, i) => Object.assign({}, k, { kaart: o.mijn[i] && o.mijn[i].kaart, id: o.mijn[i] && o.mijn[i].id }));
    const geord = { [ik]: G.ordenTeam(mijnKaarten, 0), [hun]: G.ordenTeam(hunSn.kaarten, 0) };
    const rl = { A: D.rollen(geord.A), B: D.rollen(geord.B) };
    if (o.computer) kn._rol = rl[hun];
    const ch = { [ik]: mijnSn.ch | 0, [hun]: hunSn.ch | 0 };
    const aura = { A: D.auraVan(geord.A), B: D.auraVan(geord.B) };
    const begin = D.beginKant(seedTekst);
    const stand = D.nieuweStand();
    const controleer = () => { if (kn.dood || kn.gestopt) throw kn.dood || new Error('afgebroken'); };
    const wacht = async (ms) => { await slaap(ms); controleer(); };
    const afgebroken = () => !!(kn.dood || kn.gestopt);
    let reddingen = 0;

    // uiterlijk: voetballers en het thuisstadion van de uitdager
    const mijnU = await mijnUiterlijk();
    const hunU = o.computer ? computerUiterlijk(seedTekst) : vriendUiterlijk(o.vriend.id);
    const uiterlijk = { [ik]: mijnU, [hun]: hunU };
    const thuis = ik === 'A' ? mijnU.sd : hunU.sd || mijnU.sd;
    const thema = VB && thuis ? VB.naarThema(thuis) : null;

    // scherm opbouwen
    toonScherm();
    $('einde').hidden = true; $('keuze').hidden = false; $('kaart-rij').hidden = false; $('emoji-balk').hidden = true;
    $('naam-a').textContent = 'Jij'; $('naam-b').textContent = o.hunNaam;
    $('score-a').textContent = '0'; $('score-b').textContent = '0'; $('klok').textContent = 'Duel';
    $('bord-status').textContent = 'Wachten tot het begint...';
    const stip = { [ik]: $('reeks-a'), [hun]: $('reeks-b') };
    for (const z of [ik, hun]) { stip[z].replaceChildren(); for (let i = 0; i < D.RONDES; i++) { const s = el('i', 'stip'); stip[z].append(s); } }
    bouwZones(); resetPodium(); tekenAchtergrond(thuis);
    const zetStand = () => { $('score-a').textContent = stand[ik]; $('score-b').textContent = stand[hun]; };

    // toeschouwers: vrienden aan wie ik alles laat zien en die meekijken mogen (alleen als de optie aan staat)
    actief.kijkers = new Map();
    actief.kijkOntvangers = () => (st && instellingen.duelKijkers !== false && instellingen.meekijken !== false ? L.kijkOntvangers(st).filter((v) => !o.vriend || v.id !== o.vriend.id).slice(0, 12) : []);
    actief.toonKijkers = () => { $('kijk-info').textContent = actief.kijkers.size ? `${actief.kijkers.size} ${actief.kijkers.size === 1 ? 'vriend kijkt' : 'vrienden kijken'} mee. Emoji van hen vliegen over je scherm.` : ''; };
    const stuurKijkUitnodiging = () => {
      for (const v of actief.kijkOntvangers()) L.stuurBericht(st, v, { t: 'sd_kijk', mid, z: ik, tg: o.vriend ? o.vriend.id : null }).catch(() => {});
    };
    if (st) { stuurKijkUitnodiging(); actief.kijkTimer = setInterval(stuurKijkUitnodiging, 150000); }
    kn.luister((m) => { if (m.t === 'sd_emoji') vliegEmoji(m.e, o.hunNaam); });

    // Gelijk beginnen: allebei zeggen dat ze klaar zijn.
    $('bord-status').textContent = `${begin === ik ? 'Jij schiet' : o.hunNaam + ' schiet'} als eerste.`;
    $('uitslag-tekst').textContent = `Het duel begint. ${begin === ik ? 'Jij schiet' : o.hunNaam + ' schiet'} als eerste.`;
    await wacht(rustig ? 400 : 1200);

    for (;;) {
      controleer();
      const bs = D.beslist(stand);
      if (bs.klaar) break;
      const k = D.volgendeK(stand), z = D.kantVan(begin, k), beurt = D.beurtVan(k), zk = D.anderKant(z);
      const ikSchiet = z === ik;
      const schutterKaart = D.schutterVoor(rl[z], beurt), keeperKaart = rl[zk].keeper;
      const sUit = uiterlijk[z].av, kUit = uiterlijk[zk].av;

      // het scherm voor deze strafschop
      resetPodium();
      stip[z].children[beurt] && stip[z].children[beurt].classList.add('nu');
      $('klok').textContent = `Strafschop ${k + 1}`;
      $('bord-status').textContent = ikSchiet ? 'Jij schiet' : `${o.hunNaam} schiet`;
      tekenFiguur($('cv-schutter'), sUit, 'staan'); tekenFiguur($('cv-keeper'), kUit, 'staan');
      $('kr-schutter').replaceChildren(kaartEl(z === ik ? schutterKaart : Object.assign({}, schutterKaart, { kaart: null })));
      $('kr-keeper').replaceChildren(kaartEl(zk === ik ? keeperKaart : Object.assign({}, keeperKaart, { kaart: null })));
      const sMacht = D.macht(schutterKaart, ch[z], aura[z]), kMacht = D.macht(keeperKaart, ch[zk], aura[zk]);
      $('kr-schutter-tekst').textContent = `Schutter${ikSchiet ? ' (jij)' : ''}: ${schutterKaart.vak} ${fmt(schutterKaart.cijfer)}, sterkte ${fmt(sMacht)}${schutterKaart.v ? ', vervloekt' : schutterKaart.h ? ', heel gemaakt' : ''}`;
      $('kr-keeper-tekst').textContent = `Keeper${ikSchiet ? '' : ' (jij)'}: ${keeperKaart.vak} ${fmt(keeperKaart.cijfer)}, sterkte ${fmt(kMacht)}${keeperKaart.v ? ', vervloekt' : keeperKaart.h ? ', heel gemaakt' : ''}`;
      $('keuze-tekst').textContent = ikSchiet ? 'Jij schiet! Kies een hoek en stop de wijzer in het groen.' : 'Jij staat in doel! Kies waar je naartoe duikt.';
      $('uitslag-tekst').textContent = `Strafschop ${k + 1} van ten hoogste ${2 * D.RONDES}. ${ikSchiet ? 'Jij schiet met ' : 'Jij staat in doel met '}${(ikSchiet ? schutterKaart : keeperKaart).vak} ${fmt((ikSchiet ? schutterKaart : keeperKaart).cijfer)}.`;
      if (kn.beginKick) kn.beginKick(k, z, ik);

      let r, h, q, dr, dh, nS, nK, strafpunt = false;
      if (ikSchiet) {
        const keuze = await vraagKeuze({ schiet: true, kaart: schutterKaart, ms: D.KEUZE_MS, afgebroken });
        controleer();
        r = keuze.r; h = keuze.h; q = keuze.q;
        $('keuze-tekst').textContent = `Timing ${q}%. Wachten tot de keeper kiest...`;
        const vast = await kn.wacht('sd_vast:' + k, D.KEUZE_MS + 20000);
        nS = D.nonce();
        await kn.zend({ t: 'sd_schot', k, r, h, q, n: nS });
        $('keuze-tekst').textContent = 'Schot genomen. Wachten op de keeper...';
        const on = await kn.wacht('sd_onthul:' + k, D.ONTHUL_MS, true);
        if (on) {
          if (!(await D.klopt(mid, k, on.r, on.h, on.n, vast.c))) throw new Error('vals');
          dr = on.r; dh = on.h; nK = on.n;
        } else { strafpunt = true; dr = 'midden'; dh = 'laag'; nK = '00000000'; } // de keeper onthulde niet: doelpunt voor de schutter
      } else {
        const keuze = await vraagKeuze({ schiet: false, kaart: keeperKaart, ms: D.KEUZE_MS, afgebroken });
        controleer();
        dr = keuze.dr; dh = keuze.dh; nK = D.nonce();
        const c = await D.legVast(mid, k, dr, dh, nK);
        await kn.zend({ t: 'sd_vast', k, c });
        $('keuze-tekst').textContent = `Gekozen. Wachten op het schot van ${o.hunNaam}...`;
        const sc = await kn.wacht('sd_schot:' + k, D.KEUZE_MS + 20000);
        r = sc.r; h = sc.h; q = sc.q; nS = sc.n;
        await kn.zend({ t: 'sd_onthul', k, r: dr, h: dh, n: nK });
      }
      controleer();
      $('keuze').hidden = true;

      // de uitkomst: beide kanten rekenen hetzelfde uit
      const u = strafpunt
        ? { uitkomst: 'goal', goal: true, keert: null, goalP: 1000, misP: 0, redP: 0 }
        : D.uitkomst({ seedTekst: `${seedTekst}|${nS}|${nK}`, k, kant: z, beurt, schutter: schutterKaart, keeper: keeperKaart, chS: ch[z], chK: ch[zk], auraS: aura[z], auraK: aura[zk], r, h, q, dr, dh });
      D.verwerk(stand, z, u.goal);
      const woord = u.goal ? 'Goal' : u.uitkomst === 'redding' ? 'Gered' : u.uitkomst === 'paal' ? 'Paal, geen doelpunt' : 'Over, geen doelpunt';
      const wie = ikSchiet ? 'Jij schiet' : `${o.hunNaam} schiet`;
      $('uitslag-tekst').textContent = `${woord}. ${wie}. Stand ${stand[ik]} - ${stand[hun]} (jij - ${o.hunNaam}). Kans op een doelpunt was ${Math.round(u.goalP / 10)}%.${u.keert ? ' De vloek sloeg toe!' : ''}${strafpunt ? ' De keeper onthulde niet op tijd: dat telt als doelpunt.' : ''}`;
      $('bord-status').textContent = woord;
      const dot = stip[z].children[beurt];
      if (dot) { dot.classList.remove('nu'); dot.classList.add(u.goal ? 'goal' : 'mis'); }
      if (!u.goal && zk === ik && u.uitkomst === 'redding') reddingen++;
      if (u.keert) {
        const mijnVloek = u.keert.z === ik;
        const wat = u.keert.rol === 'schutter' ? 'schoot er expres naast' : 'liet de bal er expres in';
        melding(mijnVloek ? `De vloek sloeg toe: je eigen kaart ${wat}.` : `De vloek sloeg toe bij ${o.hunNaam}: de kaart ${wat}.`, mijnVloek);
      }
      $('keuze-tekst').textContent = `Kans op een doelpunt was ${Math.round(u.goalP / 10)}%.${u.keert ? ' (De vloek besliste.)' : ''}`;
      $('keuze').hidden = false; $('bevestig').hidden = true; $('zonder').hidden = true; $('timing').hidden = true;
      if (u.goal) { speel('gejuich', 0.6); trilVoor([60, 30, 120]); } else { speel('boem', 0.5); trilVoor(40); }

      // voor toeschouwers
      const evBericht = { t: 'sd_ev', k, z, s: D.deelKaart(schutterKaart), g: D.deelKaart(keeperKaart), r, h, q, dr, dh, u: u.uitkomst, a: stand.A, b: stand.B, gt: Math.round(u.goalP / 10) };
      for (const v of actief.kijkers.values()) L.stuurBericht(st, v, Object.assign({ mid }, evBericht)).catch(() => {});

      await toonUitkomst({ r, h, dr, dh, q, uitkomst: u.uitkomst, schutter: schutterKaart, keeper: keeperKaart, sUit, kUit, thema, wacht });
      zetStand();
    }
    stopKijkMelding();

    // ---- einde ----
    const mijnS = stand[ik], hunS = stand[hun];
    await kn.zend({ t: 'sd_eind', a: stand.A, b: stand.B });
    let afwijking = false;
    try { const e = await kn.wacht('sd_eind:', 8000, true); afwijking = !!e && (e.a !== stand.A || e.b !== stand.B); } catch (e) { /* ander is al weg: de uitslag staat vast */ }
    const uitslag = D.uitslagVoor(stand, ik);
    const kop = uitslag === 'w' ? 'Gewonnen!' : uitslag === 'v' ? 'Verloren' : 'Gelijkspel';
    let uitleg = uitslag === 'w' ? 'Goed gedaan.' : uitslag === 'v' ? `${o.hunNaam} was dit keer beter.` : 'Niemand won.';
    if (afwijking) uitleg += ' Let op: jullie schermen toonden niet precies dezelfde uitslag.';
    if (o.vriend) {
      try { gevechten = await L.bewaarUitslag(o.vriend.id, { ts: Date.now(), mijn: mijnS, hun: hunS, n: stand.nA + stand.nB }); } catch (e) { /* uitslag niet bewaard */ }
    }
    // De beloning: munten met een dagelijkse limiet (economie.js).
    try {
      if (E && E.duelKlaar) {
        const b = await E.duelKlaar(mid, uitslag);
        if (b && b.ok) uitleg += b.dagmax ? ' Je hebt vandaag al 5 duels met beloning gespeeld: geen munten meer.' : ` Je verdiende ${b.munten} ${b.munten === 1 ? 'munt' : 'munten'}. Nog ${b.over} ${b.over === 1 ? 'duel' : 'duels'} met beloning vandaag.`;
        tekenDagInfo();
      }
    } catch (e) { /* munten zijn een extraatje */ }
    nieuweBadges(reddingen);
    speel(uitslag === 'w' ? 'gejuich' : 'menigte', 0.7);
    kn.stop();
    actief = null;
    toonEinde({ kop, stand: `Jij ${mijnS} - ${hunS} ${o.hunNaam}`, tekst: uitleg });
    $('uitslag-tekst').textContent = `${kop} Stand ${mijnS} - ${hunS}. ${uitleg}`;
    tekenVrienden(); tekenUitnodigingen();
  }

  async function tekenDagInfo() {
    try {
      if (!E || !E.duelStatus) return;
      const s = await E.duelStatus();
      $('dag-info').textContent = `Beloning: winst ${E.DUEL_MUNTEN.w} munten, gelijkspel ${E.DUEL_MUNTEN.g}, meedoen ${E.DUEL_MUNTEN.v}. Hoogstens ${s.max} duels per dag (ook tegen de computer). Vandaag nog ${s.over} te gaan.`;
    } catch (e) { /* geen munten-info */ }
  }

  // ---- meekijken als toeschouwer ----
  async function kijkMee(u) {
    if (actief || kijkSessie) return;
    const v = st && st.vrienden.find((x) => x.id === u.van && x.status === 'vriend');
    if (!v) return;
    const mid = u.mid;
    const namen = { [u.z]: L.naam(v), [D.anderKant(u.z)]: u.tg && st.vrienden.some((x) => x.id === u.tg) ? vriendNaam(u.tg) : 'Tegenstander' };
    const sessie = {
      mid, van: v.id, events: new Map(), volgende: null, stand: null, gestopt: false, klaar: false,
      ontvang(s) {
        if (s.t === 'sd_ev') { if (!this.events.has(s.k)) this.events.set(s.k, s); }
        else if (s.t === 'sd_stop') this.gestopt = true;
      },
      async stop() { this.gestopt = true; try { await L.stuurBericht(st, v, { t: 'sd_stop', mid }); } catch (e) { /* weg is weg */ } },
    };
    kijkSessie = sessie;
    kijkLijst = kijkLijst.filter((x) => x.mid !== mid);
    tekenVrienden(); tekenUitnodigingen(); tekenKijkUitnodigingen();
    toonScherm();
    $('einde').hidden = true; $('keuze').hidden = true; $('kaart-rij').hidden = true; $('scherm').classList.add('met-balk');
    $('naam-a').textContent = namen.A; $('naam-b').textContent = namen.B;
    $('score-a').textContent = '0'; $('score-b').textContent = '0'; $('klok').textContent = 'Kijken';
    $('bord-status').textContent = 'Wachten op de volgende strafschop...';
    $('kijk-info').textContent = `Je kijkt mee met ${namen[u.z]}. Gooi een emoji!`;
    $('uitslag-tekst').textContent = `Je kijkt mee met ${namen[u.z]}.`;
    const stip = { A: $('reeks-a'), B: $('reeks-b') };
    for (const z of ['A', 'B']) { stip[z].replaceChildren(); for (let i = 0; i < D.RONDES; i++) stip[z].append(el('i', 'stip')); }
    bouwZones(); resetPodium();
    const uiter = { [u.z]: vriendUiterlijk(v.id), [D.anderKant(u.z)]: (u.tg && vriendUiterlijk(u.tg)) || { av: null, sd: null } };
    tekenAchtergrond(uiter.A.sd || uiter.B.sd);
    // emoji sturen
    const balk = $('emoji-balk'); balk.replaceChildren();
    let laatste = 0;
    D.EMOJI.forEach((em, i) => {
      const b = el('button', '', em); b.type = 'button'; b.setAttribute('aria-label', 'Gooi ' + ['vuur', 'verbazing', 'applaus', 'lachen'][i]);
      b.addEventListener('click', async () => {
        if (Date.now() - laatste < 600) return;
        laatste = Date.now(); vliegEmoji(em);
        try { await L.stuurBericht(st, v, { t: 'sd_emoji', mid, e: em }); } catch (e) { /* offline: de emoji bleef bij jou */ }
      });
      balk.append(b);
    });
    balk.hidden = false;
    try { await L.stuurBericht(st, v, { t: 'sd_mee', mid }); } catch (e) { sessie.gestopt = true; }
    const stand = D.nieuweStand();
    let laatsteMelding = Date.now();
    const wacht = async (ms) => { await slaap(ms); };
    try {
      while (!sessie.gestopt) {
        const k = sessie.volgende === null ? Math.min(...sessie.events.keys(), Infinity) : sessie.volgende;
        const ev = Number.isFinite(k) ? sessie.events.get(k) : undefined;
        if (!ev) {
          if (Date.now() - laatsteMelding > 120000) { sessie.gestopt = true; break; }
          await slaap(250); continue;
        }
        laatsteMelding = Date.now();
        sessie.volgende = k + 1;
        // De stand klopt altijd met het bericht, ook als ik later binnenkwam.
        stand.A = ev.a; stand.B = ev.b;
        stand.nA = ev.z === 'A' ? Math.floor(ev.k / 2) + 1 : Math.floor((ev.k + 1) / 2);
        stand.nB = ev.z === 'B' ? Math.floor(ev.k / 2) + 1 : Math.floor((ev.k + 1) / 2);
        const inhalen = sessie.events.has(k + 1); // we lopen achter op de spelers: geen filmpje en korter tonen
        resetPodium();
        $('kaart-rij').hidden = false;
        $('klok').textContent = `Strafschop ${ev.k + 1}`;
        const goal = ev.u === 'goal';
        const nm = namen[ev.z];
        tekenFiguur($('cv-schutter'), uiter[ev.z].av, 'staan'); tekenFiguur($('cv-keeper'), uiter[D.anderKant(ev.z)].av, 'staan');
        $('kr-schutter').replaceChildren(kaartEl(ev.s)); $('kr-keeper').replaceChildren(kaartEl(ev.g));
        $('kr-schutter-tekst').textContent = `Schutter (${nm}): ${ev.s.vak} ${fmt(ev.s.cijfer)}`;
        $('kr-keeper-tekst').textContent = `Keeper: ${ev.g.vak} ${fmt(ev.g.cijfer)}`;
        const woord = goal ? 'Goal' : ev.u === 'redding' ? 'Gered' : ev.u === 'paal' ? 'Paal, geen doelpunt' : 'Over, geen doelpunt';
        $('bord-status').textContent = woord;
        $('uitslag-tekst').textContent = `${nm} schiet. ${woord}. Stand ${stand.A} - ${stand.B} (${namen.A} - ${namen.B}). Kans op een doelpunt was ${ev.gt}%.`;
        const dot = stip[ev.z].children[Math.floor(ev.k / 2)];
        if (dot) dot.classList.add(goal ? 'goal' : 'mis');
        $('score-a').textContent = stand.A; $('score-b').textContent = stand.B;
        if (goal) speel('gejuich', 0.5); else speel('boem', 0.4);
        const sUit = uiter[ev.z].av, kUit = uiter[D.anderKant(ev.z)].av;
        await toonUitkomst({ r: ev.r, h: ev.h, dr: ev.dr, dh: ev.dh, q: ev.q, uitkomst: ev.u, schutter: ev.s, keeper: ev.g, inhalen, sUit, kUit, thema: VB && (uiter.A.sd || uiter.B.sd) ? VB.naarThema(uiter.A.sd || uiter.B.sd) : null, wacht });
        if (D.beslist(stand).klaar) { sessie.klaar = true; break; }
      }
    } catch (e) { /* een kijker die iets mist, stopt gewoon */ }
    filmStop && filmStop();
    $('emoji-balk').hidden = true;
    const b = D.beslist(stand);
    if (sessie.klaar || b.klaar) {
      const w = b.winnaar;
      toonEinde({ kop: w === null ? 'Gelijkspel' : `${namen[w]} wint`, stand: `${namen.A} ${stand.A} - ${stand.B} ${namen.B}`, tekst: 'Het duel is afgelopen. Bedankt voor het meekijken!' });
    } else if (sessie.gestopt) {
      toonEinde({ kop: 'Meekijken gestopt', stand: '', tekst: 'Je kijkt niet meer mee.' });
    }
    try { await L.stuurBericht(st, v, { t: 'sd_stop', mid }); } catch (e) { /* niets */ }
    // kijkSessie blijft gezet tot 'Terug': dan pas kan er weer een duel starten
  }

  // ---- start ----
  async function init() {
    try { const i = await L.lees('spo_instellingen'); instellingen = i && typeof i === 'object' ? i : {}; geluidAan = instellingen.geluid !== false; } catch (e) { /* standaard aan */ }
    film = ['kort', 'vol', 'uit'].includes(instellingen.duelFilm) ? instellingen.duelFilm : (rustig ? 'uit' : 'kort');
    const sel = $('opt-film'); sel.value = film;
    sel.addEventListener('change', () => { film = sel.value; bewaarOptie('duelFilm', film); });
    const vk = $('opt-kijkers'); vk.checked = instellingen.duelKijkers !== false;
    vk.addEventListener('change', () => { instellingen.duelKijkers = vk.checked; bewaarOptie('duelKijkers', vk.checked); });
    galerij = await L.leesGalerij();
    team = await L.leesTeam();
    opschonenTeam();
    st = await L.laad();
    gevechten = await L.leesGevechten();
    tekenBouw(); tekenKies(); tekenVrienden(); tekenUitnodigingen(); tekenDagInfo();
    window.addEventListener('resize', () => tekenBouw());
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!$('bouwveld')._breed || Math.abs($('bouwveld')._breed - $('bouwveld').clientWidth) > 4) { $('bouwveld')._breed = $('bouwveld').clientWidth; tekenBouw(); } }).observe($('bouwveld'));
    L.opOpslagWijziging(async () => {
      if (actief || kijkSessie) return;
      galerij = await L.leesGalerij(); team = await L.leesTeam(); opschonenTeam(); gevechten = await L.leesGevechten();
      tekenBouw(); tekenKies(); tekenVrienden();
    });
    if (!st) { $('sync-status').textContent = 'Vriendenfunctie staat uit.'; $('sync').hidden = true; return; }
    startLive();
  }
  async function bewaarOptie(sleutel, waarde) {
    instellingen[sleutel] = waarde;
    try { const i = (await L.lees('spo_instellingen')) || {}; await L.schrijf('spo_instellingen', Object.assign({}, i, { [sleutel]: waarde })); } catch (e) { /* de keuze geldt nu, niet de volgende keer */ }
  }
  $('sync').addEventListener('click', () => { if (live) { live.vergeet(); live.tik(); } });
  $('oefen').addEventListener('click', oefenen);
  $('team-leeg').addEventListener('click', () => { team = null; wijzig(); });
  init().catch((e) => melding(foutTekst(e), true));
  globalThis.SPOTeam = { oefenen };
})();
