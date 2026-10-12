/*
 * Somtoday Pack Opener v3.0: AARTSRIVAAL.
 * Je kiest één vriend als rivaal. Het werkt alleen als die vriend ook akkoord gaat (wederzijds). Elk van jullie kan stoppen.
 *
 * Berichten (gewone versleutelde berichten tussen twee vrienden, de server ziet de inhoud nooit; alles gaat door schoonBericht):
 *   { t: 'rivaal' }       ik vraag jou als aartsrivaal
 *   { t: 'rivaal-ja' }    ik accepteer (of: ik ben nog steeds jouw rivaal; dit gaat ook als hartslag, zodat een kwijtgeraakt bericht niet erg is)
 *   { t: 'rivaal-nee' }   ik wil niet
 *   { t: 'rivaal-stop' }  ik stop (of: ik ken je niet als rivaal)
 * Berichten verdwijnen na 10 minuten op de server. Daarom stuurt onderhoud() een open verzoek en de hartslag opnieuw, en
 * onthouden we per vriend het laatste volgnummer dat we verwerkten (een oud bericht kan niets terughalen).
 *
 * Opslag: spo_rivaal { v:1, id, status: null|'verzonden'|'actief', sinds, laatst, verzoeken:{[id]:ts}, seq:{[id]:n}, gezien:[ts], betaald:{[dag]:munten} }
 * Rivaalmunten: 10 per gevecht dat je tegen je rivaal wint, hoogstens 30 per dag (spo_gevechten wordt alleen gelezen).
 * Werkt zonder DOM (ook in Node en in de achtergrond); alleen teken() gebruikt de pagina.
 */
(function () {
  'use strict';
  const SLEUTEL = 'spo_rivaal';
  const TYPES = ['rivaal', 'rivaal-ja', 'rivaal-nee', 'rivaal-stop'];
  const MAX_LEEFTIJD = 600;            // seconden: zo lang bewaart de server een bericht
  const HARTSLAG = 5 * 60 * 1000;      // opnieuw sturen: open verzoek of 'ik ben nog je rivaal'
  const VERLOOP = 7 * 864e5;           // een verzoek zonder antwoord vervalt na een week
  const MUNTEN_PER_WINST = 10;
  const MUNTEN_MAX_DAG = 30;
  const NIVEAUS = ['Brons', 'Zilver', 'Goud', 'Speciaal', 'Icoon'];
  const isId = (t) => typeof t === 'string' && /^[0-9a-f]{32}$/.test(t);
  const eigen = (o, k) => (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  const nat = (x, max) => (Number.isFinite(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0);

  // Een bericht van een vriend: alleen een type uit de lijst, niet te oud. Anders null.
  function schoonBericht(m, leeftijd) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
    if (!TYPES.includes(m.t)) return null;
    if (!(Number.isFinite(leeftijd) && leeftijd >= 0 && leeftijd < MAX_LEEFTIJD)) return null;
    return m.t;
  }

  // ---- toestand ----
  function schoonStaat(x) {
    const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
    const uit = { v: 1, id: isId(o.id) ? o.id : null, status: null, sinds: nat(o.sinds, 4.1e12), laatst: nat(o.laatst, 4.1e12), verzoeken: {}, seq: {}, gezien: [], betaald: {} };
    if (uit.id && (o.status === 'verzonden' || o.status === 'actief')) uit.status = o.status; else uit.id = null;
    const kopieer = (van, naar, max, waarde) => {
      if (!van || typeof van !== 'object' || Array.isArray(van)) return;
      for (const k of Object.keys(van).slice(0, max)) { const w = waarde(van[k]); if (isId(k) && w !== null) naar[k] = w; }
    };
    kopieer(o.verzoeken, uit.verzoeken, 10, (w) => (Number.isFinite(w) ? nat(w, 4.1e12) : null));
    kopieer(o.seq, uit.seq, 100, (w) => (Number.isFinite(w) && w >= 0 ? w : null));
    if (Array.isArray(o.gezien)) uit.gezien = o.gezien.filter((t) => Number.isFinite(t)).slice(-60);
    if (o.betaald && typeof o.betaald === 'object' && !Array.isArray(o.betaald)) {
      for (const k of Object.keys(o.betaald).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-7)) uit.betaald[k] = nat(o.betaald[k], MUNTEN_MAX_DAG);
    }
    return uit;
  }

  let keten = Promise.resolve();
  function serieel(fn) { const r = keten.then(fn, fn); keten = r.catch(() => {}); return r; }
  const Lib = () => globalThis.SPOVrienden;
  async function laad() { return schoonStaat(await Lib().lees(SLEUTEL)); }
  // Leest, laat fn de staat aanpassen en bewaart. Alles na elkaar, zodat twee acties elkaar niet overschrijven.
  function wijzig(fn) {
    return serieel(async () => {
      const s = schoonStaat(await Lib().lees(SLEUTEL));
      const r = await fn(s);
      await Lib().schrijf(SLEUTEL, s);
      return r;
    });
  }
  const actiefVriend = (st, id) => st.vrienden.find((v) => v.id === id && v.status === 'vriend' && !v.andereVersie);
  async function stuur(st, id, t) {
    const v = actiefVriend(st, id);
    if (!v) return false;
    try { await Lib().stuurBericht(st, v, { t }); return true; } catch (e) { return false; }
  }

  // ---- acties van de gebruiker ----
  // Vraagt een vriend als aartsrivaal. Had die vriend jou al gevraagd, dan zijn jullie meteen rivalen.
  function vraag(st, id) {
    return wijzig(async (s) => {
      if (!actiefVriend(st, id)) throw new Error('Deze vriend is nu niet beschikbaar.');
      if (s.id) throw new Error('Je hebt al een aartsrivaal. Stop eerst die rivaliteit.');
      const nu = Date.now();
      if (eigen(s.verzoeken, id) !== undefined) { // de ander vroeg al
        delete s.verzoeken[id]; s.id = id; s.status = 'actief'; s.sinds = nu; s.laatst = nu;
        await stuur(st, id, 'rivaal-ja');
        return 'actief';
      }
      s.id = id; s.status = 'verzonden'; s.sinds = nu; s.laatst = nu;
      await stuur(st, id, 'rivaal');
      return 'verzonden';
    });
  }
  function accepteer(st, id) {
    return wijzig(async (s) => {
      if (eigen(s.verzoeken, id) === undefined) throw new Error('Dit verzoek bestaat niet meer.');
      if (s.id && s.id !== id) throw new Error('Je hebt al een aartsrivaal. Stop eerst die rivaliteit.');
      if (!actiefVriend(st, id)) throw new Error('Deze vriend is nu niet beschikbaar.');
      const nu = Date.now();
      delete s.verzoeken[id]; s.id = id; s.status = 'actief'; s.sinds = nu; s.laatst = nu;
      await stuur(st, id, 'rivaal-ja');
    });
  }
  function weiger(st, id) {
    return wijzig(async (s) => {
      delete s.verzoeken[id];
      await stuur(st, id, 'rivaal-nee');
    });
  }
  // Stopt de rivaliteit (of trekt een verzoek in).
  function stop(st) {
    return wijzig(async (s) => {
      const id = s.id;
      s.id = null; s.status = null; s.sinds = 0; s.laatst = 0;
      if (id) await stuur(st, id, 'rivaal-stop');
    });
  }

  // ---- berichten van vrienden ----
  // `lijst` is wat haalBerichten teruggeeft: [{ seq, leeftijd, m }]. Geeft { meldingen: [tekst], veranderd } terug.
  function opBerichten(st, van, lijst) {
    return wijzig(async (s) => {
      const uit = { meldingen: [], veranderd: false };
      const v = actiefVriend(st, van);
      if (!v || !isId(van) || !Array.isArray(lijst)) return uit;
      const naam = Lib().naam(v);
      for (const b of lijst.slice().sort((x, y) => x.seq - y.seq)) {
        const t = schoonBericht(b && b.m, b && b.leeftijd);
        const seq = b && b.seq;
        if (!t || !Number.isFinite(seq) || seq <= (eigen(s.seq, van) || 0)) continue;
        s.seq[van] = seq;
        const nu = Date.now();
        if (t === 'rivaal') {
          if (s.id === van) {
            if (s.status === 'verzonden') { s.status = 'actief'; s.sinds = nu; uit.meldingen.push(`${naam} en jij zijn nu aartsrivalen!`); uit.veranderd = true; }
            await stuur(st, van, 'rivaal-ja');
          } else if (eigen(s.verzoeken, van) === undefined && Object.keys(s.verzoeken).length < 10) {
            s.verzoeken[van] = nu; uit.meldingen.push(`${naam} wil jouw aartsrivaal worden.`); uit.veranderd = true;
          }
        } else if (t === 'rivaal-ja') {
          if (s.id === van && s.status === 'verzonden') { s.status = 'actief'; s.sinds = nu; uit.meldingen.push(`${naam} heeft ja gezegd: jullie zijn nu aartsrivalen!`); uit.veranderd = true; }
          else if (s.id !== van) await stuur(st, van, 'rivaal-stop'); // die vriend denkt dat wij rivalen zijn, maar dat is niet zo
        } else if (t === 'rivaal-nee') {
          if (s.id === van && s.status === 'verzonden') { s.id = null; s.status = null; s.sinds = 0; uit.meldingen.push(`${naam} wil nu geen aartsrivaal zijn.`); uit.veranderd = true; }
        } else if (t === 'rivaal-stop') {
          if (s.id === van) { const was = s.status; s.id = null; s.status = null; s.sinds = 0; uit.meldingen.push(was === 'actief' ? `${naam} is gestopt als aartsrivaal.` : `${naam} wil nu geen aartsrivaal zijn.`); uit.veranderd = true; }
          if (eigen(s.verzoeken, van) !== undefined) { delete s.verzoeken[van]; uit.veranderd = true; }
        }
      }
      return uit;
    });
  }

  // Opruimen en opnieuw sturen. Roep dit aan na elke synchronisatie en af en toe (bijv. elke minuut).
  function onderhoud(st) {
    return wijzig(async (s) => {
      const nu = Date.now();
      let veranderd = false;
      const actief = new Set(st.vrienden.filter((v) => v.status === 'vriend').map((v) => v.id));
      if (s.id && !actief.has(s.id) && st.vrienden.every((v) => v.id !== s.id || v.status === 'weggevallen')) { s.id = null; s.status = null; s.sinds = 0; veranderd = true; } // geen vriend meer
      if (s.id && s.status === 'verzonden' && nu - s.sinds > VERLOOP) { s.id = null; s.status = null; s.sinds = 0; veranderd = true; }
      for (const k of Object.keys(s.verzoeken)) if (!actief.has(k) || nu - s.verzoeken[k] > VERLOOP) { delete s.verzoeken[k]; veranderd = true; }
      for (const k of Object.keys(s.seq)) if (!actief.has(k) && !st.vrienden.some((v) => v.id === k)) delete s.seq[k];
      if (s.id && actief.has(s.id) && nu - s.laatst >= HARTSLAG) {
        s.laatst = nu;
        await stuur(st, s.id, s.status === 'actief' ? 'rivaal-ja' : 'rivaal');
      }
      return veranderd;
    });
  }

  // ---- munten voor een gewonnen gevecht tegen je rivaal ----
  const dagTekst = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // Leest de uitslagen (spo_gevechten) en betaalt per gewonnen gevecht tegen de rivaal 10 munten, hoogstens 30 per dag.
  // Alleen gevechten na het begin van de rivaliteit en van de laatste drie dagen. Geeft het aantal munten terug.
  function verwerkGevechten(gevechten) {
    return wijzig(async (s) => {
      const E = globalThis.SPOEco;
      if (!E || typeof E.bonusMunten !== 'function' || s.status !== 'actief' || !s.id) return 0;
      const lijst = Array.isArray(eigen(gevechten, s.id)) ? gevechten[s.id] : [];
      const nu = Date.now();
      let totaal = 0;
      for (const u of lijst.slice().sort((a, b) => a.ts - b.ts)) {
        if (!u || !Number.isFinite(u.ts) || !Number.isFinite(u.mijn) || !Number.isFinite(u.hun) || !(u.mijn > u.hun)) continue;
        if (u.ts < s.sinds || s.gezien.includes(u.ts)) continue;
        s.gezien.push(u.ts);
        if (nu - u.ts > 3 * 864e5) continue;
        const dag = dagTekst(u.ts);
        const al = s.betaald[dag] || 0;
        if (al + MUNTEN_PER_WINST > MUNTEN_MAX_DAG) continue;
        const n = await E.bonusMunten(`r:${s.id}:${u.ts}`, MUNTEN_PER_WINST, 'Aartsrivaal verslagen');
        if (n > 0) { s.betaald[dag] = al + n; totaal += n; }
      }
      s.gezien = s.gezien.slice(-60);
      const dagen = Object.keys(s.betaald).sort();
      for (const d of dagen.slice(0, Math.max(0, dagen.length - 7))) delete s.betaald[d];
      return totaal;
    });
  }

  // ---- vergelijking (alleen wat de rivaal zelf deelt) ----
  function kaartStats(kaarten) {
    const lijst = (Array.isArray(kaarten) ? kaarten : []).filter((k) => k && Number.isFinite(k.cijfer));
    if (!lijst.length) return null;
    let som = 0, ws = 0, beste = 0;
    const treden = [0, 0, 0, 0, 0];
    for (const k of lijst) {
      const w = Number.isFinite(k.weging) && k.weging > 0 ? k.weging : 1;
      som += k.cijfer * w; ws += w; beste = Math.max(beste, k.cijfer);
      treden[Math.max(0, Math.min(4, k.tier | 0))]++;
    }
    return { n: lijst.length, gem: som / ws, beste, treden };
  }
  function weekStart(nu) {
    const d = new Date(nu); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // maandag
    return d.getTime();
  }
  function telUit(lijst) {
    let w = 0, g = 0, l = 0;
    for (const u of lijst) { if (u.mijn > u.hun) w++; else if (u.mijn === u.hun) g++; else l++; }
    return { w, g, l, n: lijst.length };
  }
  // Wie wint er nu achter elkaar? De nieuwste uitslag staat voorop. Gelijkspel breekt een reeks.
  function reeks(lijst) {
    if (!lijst.length || lijst[0].mijn === lijst[0].hun) return { wie: null, n: 0 };
    const ik = lijst[0].mijn > lijst[0].hun;
    let n = 0;
    for (const u of lijst) { if ((u.mijn > u.hun) !== ik || u.mijn === u.hun) break; n++; }
    return { wie: ik ? 'ik' : 'zij', n };
  }
  // c: { galerij, gek (wat de rivaal deelt, uit schoonBlob; undefined = nog niet opgehaald), gevechten (de lijst tegen deze rivaal), nu }
  function vergelijk(c) {
    const nu = c.nu || Date.now();
    const uitslagen = (Array.isArray(c.gevechten) ? c.gevechten : []).filter((u) => u && Number.isFinite(u.ts) && Number.isFinite(u.mijn) && Number.isFinite(u.hun));
    const wk = weekStart(nu);
    const gek = c.gek;
    const zijKaarten = gek ? kaartStats(gek.kaarten) : null;
    const top = (a) => ({ kosmisch: (a || []).filter((x) => x.t === 3).length, mythisch: (a || []).filter((x) => x.t === 4).length });
    return {
      bekend: !!gek,
      ik: kaartStats(c.galerij),
      zij: zijKaarten,
      zijProfiel: gek && gek.profiel ? gek.profiel : null,
      ikTop: top((c.galerij || []).map((e) => ({ t: (e && e.trede) | 0 }))),
      zijTop: gek ? top(gek.top) : null,
      onderling: telUit(uitslagen),
      reeks: reeks(uitslagen),
      dezeWeek: telUit(uitslagen.filter((u) => u.ts >= wk)),
      vorigeWeek: telUit(uitslagen.filter((u) => u.ts >= wk - 7 * 864e5 && u.ts < wk)),
    };
  }

  // ---- weergave ----
  function el(tag, klas, tekst) {
    const e = document.createElement(tag);
    if (klas) e.className = klas;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
  }
  const fmt = (n) => Number(n).toFixed(1).replace('.', ',');
  const fmt2 = (n) => Number(n).toFixed(2).replace('.', ',');
  const MIS = 'deelt dit niet';

  function wekenTekst(naam, x, leeg) {
    if (!x.w && !x.l) return x.g ? `${leeg} Alleen gelijkspel.` : leeg;
    if (x.w === x.l) return `Gelijk: jij won ${x.w}, ${naam} won ${x.l}.`;
    return x.w > x.l ? `Jij leidt: jij won ${x.w}, ${naam} won ${x.l}.` : `${naam} leidt: ${naam} won ${x.l}, jij won ${x.w}.`;
  }

  // Tekent de hele sectie in `doel`. c: { s (staat), st, L, naamVan(id), galerij, gek, gevechten (alle), acties, tweestaps, nu }
  // Geeft true terug als er iets te laten zien is (anders blijft de sectie verborgen).
  function teken(doel, c) {
    const s = c.s;
    doel.replaceChildren();
    const verzoeken = Object.keys(s.verzoeken).filter((id) => actiefVriend(c.st, id));
    if (!s.id && !verzoeken.length) return false;
    doel.append(el('h2', '', 'Aartsrivaal'));
    doel.querySelector('h2').id = 'rv-titel';

    if (verzoeken.length) {
      const ul = el('ul', 'rv-verzoeken');
      for (const id of verzoeken) {
        const naam = c.naamVan(id);
        const li = el('li', 'rv-verzoek'); li.dataset.id = id;
        li.append(el('p', '', `${naam} wil jouw aartsrivaal worden. Jullie zien dan op een rivalenkaart naast elkaar wat jullie zelf delen.`));
        const bezet = !!s.id;
        if (bezet) li.append(el('p', 'uitleg', 'Je hebt al een aartsrivaal. Stop die rivaliteit als je dit verzoek wilt accepteren.'));
        const acties = el('div', 'rv-acties');
        const ja = el('button', 'knop goud klein', 'Accepteren'); ja.type = 'button'; ja.disabled = bezet;
        ja.setAttribute('aria-label', `${naam} accepteren als aartsrivaal`);
        const nee = el('button', 'knop klein', 'Weigeren'); nee.type = 'button';
        nee.setAttribute('aria-label', `Verzoek van ${naam} weigeren`);
        ja.addEventListener('click', () => c.acties.accepteer(id));
        nee.addEventListener('click', () => c.acties.weiger(id));
        acties.append(ja, nee);
        li.append(acties);
        ul.append(li);
      }
      doel.append(ul);
    }
    if (!s.id) return true;

    const naam = c.naamVan(s.id);
    if (s.status === 'verzonden') {
      doel.append(el('p', 'rv-wacht', `Je hebt ${naam} gevraagd als aartsrivaal. Zodra ${naam} ja zegt, zie je hier jullie rivalenkaart.`));
      const intrek = el('button', 'knop klein', 'Verzoek intrekken'); intrek.type = 'button';
      intrek.addEventListener('click', () => c.acties.stop());
      doel.append(intrek);
      return true;
    }

    const w = vergelijk({ galerij: c.galerij, gek: c.gek, gevechten: eigen(c.gevechten, s.id), nu: c.nu });
    const kop = el('div', 'rv-kop');
    kop.append(el('span', 'rv-vs', 'VS'), el('p', 'rv-naam', `Jij tegen ${naam}`));
    doel.append(kop);
    doel.append(el('p', 'rv-week', 'Deze week: ' + wekenTekst(naam, w.dezeWeek, 'Nog geen gevecht tegen elkaar. Daag ' + naam + ' uit!')));
    if (w.vorigeWeek.w || w.vorigeWeek.l) doel.append(el('p', 'rv-week rv-week-vorig', 'Vorige week: ' + (w.vorigeWeek.w === w.vorigeWeek.l ? `gelijk (${w.vorigeWeek.w}-${w.vorigeWeek.l}).` : w.vorigeWeek.w > w.vorigeWeek.l ? `jij won met ${w.vorigeWeek.w}-${w.vorigeWeek.l}.` : `${naam} won met ${w.vorigeWeek.l}-${w.vorigeWeek.w}.`)));

    const tab = el('table', 'rv-tabel');
    const cap = el('caption', 'sr-only', `Rivalenkaart: jij en ${naam} naast elkaar`);
    const kp = el('thead'); const kr = el('tr');
    for (const t of ['', 'Jij', naam]) { const th = el('th', '', t); th.scope = 'col'; kr.append(th); }
    kp.append(kr);
    const body = el('tbody');
    // een rij: label, mijn waarde, hun waarde. Een waarde is { w: getal om te vergelijken (of null), t: tekst },
    // null (de rivaal deelt dit niet) of undefined (nog niet opgehaald). Het hoogste getal wint.
    const rij = (label, m, h) => {
      const tr = el('tr'); const th = el('th', '', label); th.scope = 'row'; tr.append(th);
      const wint = m && h && m.w !== null && h.w !== null && m.w !== h.w;
      const cel = (x, voor) => {
        const td = el('td');
        if (x === undefined) { td.className = 'mis'; td.textContent = 'nog niet opgehaald'; }
        else if (x === null) { td.className = 'mis'; td.textContent = MIS; }
        else td.textContent = x.t;
        if (voor) { td.classList.add('voor'); td.append(el('span', 'sr-only', ' (beter)')); }
        return td;
      };
      tr.append(cel(m, wint && m.w > h.w), cel(h, wint && h.w > m.w));
      body.append(tr);
    };
    const X = (getal, tekst) => ({ w: getal, t: tekst });
    const leeg = X(null, '-');
    const onbekend = w.bekend ? null : undefined;
    const zij = (f) => (w.zij ? f(w.zij) : onbekend);
    rij('Gemiddelde', w.ik ? X(w.ik.gem, fmt2(w.ik.gem)) : leeg, zij((z) => X(z.gem, fmt2(z.gem))));
    rij('Beste kaart', w.ik ? X(w.ik.beste, fmt(w.ik.beste)) : leeg, zij((z) => X(z.beste, fmt(z.beste))));
    rij('Aantal kaarten', X(w.ik ? w.ik.n : 0, String(w.ik ? w.ik.n : 0)), w.zijProfiel ? X(w.zijProfiel.k, String(w.zijProfiel.k)) : zij((z) => X(z.n, String(z.n))));
    NIVEAUS.forEach((nv, i) => rij(nv, X(w.ik ? w.ik.treden[i] : 0, String(w.ik ? w.ik.treden[i] : 0)), zij((z) => X(z.treden[i], String(z.treden[i])))));
    rij('Kosmisch', X(w.ikTop.kosmisch, String(w.ikTop.kosmisch)), w.zijTop ? X(w.zijTop.kosmisch, String(w.zijTop.kosmisch)) : onbekend);
    rij('Mythisch', X(w.ikTop.mythisch, String(w.ikTop.mythisch)), w.zijTop ? X(w.zijTop.mythisch, String(w.zijTop.mythisch)) : onbekend);
    const o = w.onderling;
    rij('Gevechten onderling gewonnen', X(o.w, String(o.w)), X(o.l, String(o.l)));
    const r = w.reeks;
    rij('Huidige reeks', r.wie === 'ik' ? X(r.n, r.n + ' op rij') : X(0, '-'), r.wie === 'zij' ? X(r.n, r.n + ' op rij') : X(0, '-'));
    tab.append(cap, kp, body);
    const wrap = el('div', 'rv-scroll'); wrap.append(tab);
    doel.append(wrap);

    const noten = [];
    if (!w.bekend) noten.push(`De gegevens van ${naam} zijn nog niet opgehaald. Druk op Synchroniseren.`);
    else if (!w.zij) noten.push(`${naam} deelt geen kaarten met jou, dus je ziet alleen wat ${naam} verder deelt.`);
    else noten.push(`Je ziet alleen wat ${naam} zelf met jou deelt: ${w.zij.n} ${w.zij.n === 1 ? 'kaart' : 'kaarten'}.`);
    noten.push(`Gevechten telt de laatste ${Math.min(20, o.n) || 20} uitslagen tegen ${naam}. Elke gewonnen gevecht tegen je rivaal geeft ${MUNTEN_PER_WINST} extra munten (hoogstens ${MUNTEN_MAX_DAG} per dag).`);
    doel.append(el('p', 'uitleg rv-noot', noten.join(' ')));

    const stopKnop = el('button', 'knop gevaar klein', 'Rivaliteit stoppen'); stopKnop.type = 'button';
    stopKnop.setAttribute('aria-label', `Rivaliteit met ${naam} stoppen`);
    c.tweestaps(stopKnop, 'Rivaliteit stoppen', 'Zeker weten?', () => c.acties.stop());
    doel.append(stopKnop);
    return true;
  }

  const lib = {
    SLEUTEL, TYPES, MUNTEN_PER_WINST, MUNTEN_MAX_DAG, schoonBericht, schoonStaat, laad, vraag, accepteer, weiger, stop, opBerichten, onderhoud,
    verwerkGevechten, vergelijk, kaartStats, weekStart, reeks, teken,
  };
  globalThis.SPORivaal = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
