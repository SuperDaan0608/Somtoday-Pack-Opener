/*
 * Somtoday Pack Opener v3.0: TWEELINGKAART.
 * Hebben jij en een vriend bij hetzelfde soort vak ongeveer hetzelfde cijfer (hoogstens 0,3 verschil), dan kan een van jullie een tweelingkaart voorstellen.
 * Het werkt alleen als de ander ook akkoord gaat (wederzijds). Een gedeelde tweelingkaart krijgt in allebei de galerijen een speciale badge met jullie beide
 * namen (alleen de bijnaam van de vriend zoals die al zichtbaar is), en jullie krijgen allebei eenmalig munten.
 *
 * PRIVACY: er gaat nooit een vaknaam, een exact cijfer of een kaart-id over de lijn. Elk deelt alleen
 *   - een CIJFERBAND: de cijfers van 1,0 tot 10,0 zijn verdeeld in banden van vier tienden (0 = 1,0 t/m 1,3; 1 = 1,4 t/m 1,7; ...; 22 = 9,8 t/m 10,0).
 *     Twee cijfers in dezelfde band verschillen dus hoogstens 0,3. Het nadeel: twee cijfers vlak naast een bandgrens (bijv. 4,3 en 4,4) vormen geen paar.
 *   - een VAKGROEP: exact, talen, mens (mens en maatschappij) of kunst (kunst en sport).
 * Of het om precies hetzelfde vak gaat, kan de ander dus niet worden afgedwongen: dat is een afspraak tussen jullie (de knoppen zeggen het ook). Het echte
 * cijfer en het vak blijven op je eigen computer. De vergelijking gebeurt ook alleen daar: jouw kaarten worden lokaal tegen de band en groep van het verzoek gelegd.
 *
 * Berichten (gewone versleutelde berichten tussen twee vrienden, de server ziet de inhoud nooit; alles gaat door schoonBericht):
 *   { t:'tw-vraag', id, b, g }   ik stel voor (id = willekeurig nummer van dit voorstel, b = cijferband, g = vakgroep)
 *   { t:'tw-ja',    id, b, g }   ik doe mee met een kaart in dezelfde band en groep (ook: 'ik zie dat jij ja zei', zodat het bericht niet verloren gaat)
 *   { t:'tw-nee',   id }         ik wil niet (of: ik haal de tweelingkaart weg)
 * Berichten verdwijnen na 10 minuten op de server. Daarom stuurt onderhoud() een open voorstel en een onbevestigd 'ja' opnieuw, en onthouden we per vriend
 * het laatste volgnummer dat we verwerkten.
 *
 * Opslag: spo_tweeling { v:1, kaarten:{ [id]: { vriend, rol:'vraag'|'antwoord', status:'verzonden'|'actief', eigen (kaart-id uit de galerij, blijft hier), b, g, naam, sinds, laatst, bevestigd, beloond } },
 *   verzoeken:{ [id]: { van, b, g, ts } }, seq:{ [vriendId]: n }, betaald:{ [dag]: munten } }  (mee in de back-up, samengevoegd)
 * Beloning: 25 munten per tweelingkaart (eenmalig, via SPOEco.bonusMunten 'tw:<id>'), hoogstens 50 munten per dag; hoogstens 5 tweelingkaarten per account.
 * Een beloning telt pas als de ander echt akkoord is (de vragende kant: bij het 'ja'; de antwoordende kant: als het 'ja' door de vrager is bevestigd).
 * Werkt zonder DOM (ook in Node); alleen teken() gebruikt de pagina.
 */
(function () {
  'use strict';
  const SLEUTEL = 'spo_tweeling';
  const TYPES = ['tw-vraag', 'tw-ja', 'tw-nee'];
  const GROEPEN = ['exact', 'talen', 'mens', 'kunst'];
  const GROEP_NAAM = { exact: 'exacte vakken', talen: 'talen', mens: 'mens en maatschappij', kunst: 'kunst en sport' };
  const BANDEN = 23;                   // 0..22
  const MAX_TWEELING = 5;              // tweelingkaarten (actief of openstaand) per account
  const MAX_VERZOEKEN = 10;            // openstaande verzoeken van vrienden
  const MAX_OPEN_PER_VRIEND = 2;       // door mij verstuurde, nog onbeantwoorde voorstellen per vriend
  const MUNTEN = 25;
  const MUNTEN_MAX_DAG = 50;
  const MAX_LEEFTIJD = 600;            // seconden: zo lang bewaart de server een bericht
  const HARTSLAG = 5 * 60 * 1000;
  const VERLOOP = 7 * 864e5;           // een voorstel zonder antwoord vervalt na een week
  const isId = (t) => typeof t === 'string' && /^[0-9a-f]{32}$/.test(t);
  const isTid = (t) => typeof t === 'string' && /^[0-9a-f]{16,32}$/.test(t);
  const heeft = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const eigen = (o, k) => (o && typeof o === 'object' && heeft(o, k) ? o[k] : undefined);
  const nat = (x, max) => (Number.isFinite(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

  // ---- band en groep ----
  // Alle cijfers in een band verschillen hoogstens 0,3 (vier tienden: het verschil tussen de eerste en de laatste is drie).
  function band(cijfer) {
    if (typeof cijfer !== 'number' || !Number.isFinite(cijfer) || cijfer < 1 || cijfer > 10) return -1;
    return Math.min(BANDEN - 1, Math.floor((Math.round(cijfer * 10) - 10) / 4));
  }
  const bandVan = (b) => ({ van: (10 + b * 4) / 10, tot: Math.min(10, (10 + b * 4 + 3) / 10) });
  const bandTekst = (b) => { const x = bandVan(b); return `${fmt(x.van)} tot ${fmt(x.tot)}`; };
  function groepVan(vak) {
    const G = globalThis.SPOGevecht;
    const g = G && G.groepVan ? G.groepVan(vak) : null;
    return GROEPEN.includes(g) ? g : null;
  }
  // Past een kaart bij een band en vakgroep? (Alleen lokaal.)
  const past = (e, b, g) => !!e && band(e.cijfer) === b && groepVan(e.vak) === g;

  // Een bericht van een vriend: alleen een vaste vorm, niet te oud. Anders null. Er komt nooit iets anders uit dan t, id, b en g.
  function schoonBericht(m, leeftijd) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string' || !TYPES.includes(m.t)) return null;
    if (!(Number.isFinite(leeftijd) && leeftijd >= 0 && leeftijd < MAX_LEEFTIJD)) return null;
    if (!isTid(m.id)) return null;
    if (m.t === 'tw-nee') return { t: m.t, id: m.id };
    if (!Number.isInteger(m.b) || m.b < 0 || m.b >= BANDEN || typeof m.g !== 'string' || !GROEPEN.includes(m.g)) return null;
    return { t: m.t, id: m.id, b: m.b, g: m.g };
  }

  // ---- toestand ----
  function schoonStaat(x) {
    const o = obj(x);
    const uit = { v: 1, kaarten: {}, verzoeken: {}, seq: {}, betaald: {} };
    for (const id of Object.keys(obj(o.kaarten)).slice(0, 20)) {
      const k = obj(o.kaarten[id]);
      if (!isTid(id) || !isId(k.vriend) || (k.rol !== 'vraag' && k.rol !== 'antwoord') || (k.status !== 'verzonden' && k.status !== 'actief')) continue;
      if (!Number.isInteger(k.b) || k.b < 0 || k.b >= BANDEN || !GROEPEN.includes(k.g) || typeof k.eigen !== 'string' || k.eigen.length > 80) continue;
      uit.kaarten[id] = {
        vriend: k.vriend, rol: k.rol, status: k.rol === 'antwoord' ? 'actief' : k.status, eigen: k.eigen, b: k.b, g: k.g,
        naam: typeof k.naam === 'string' ? k.naam.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 24) : '',
        sinds: nat(k.sinds, 4.1e12), laatst: nat(k.laatst, 4.1e12), bevestigd: k.bevestigd === true || k.rol === 'vraag' && k.status === 'actief', beloond: k.beloond === true,
      };
    }
    for (const id of Object.keys(obj(o.verzoeken)).slice(0, MAX_VERZOEKEN)) {
      const v = obj(o.verzoeken[id]);
      if (isTid(id) && isId(v.van) && Number.isInteger(v.b) && v.b >= 0 && v.b < BANDEN && GROEPEN.includes(v.g)) uit.verzoeken[id] = { van: v.van, b: v.b, g: v.g, ts: nat(v.ts, 4.1e12) };
    }
    for (const k of Object.keys(obj(o.seq)).slice(0, 100)) if (isId(k) && Number.isFinite(o.seq[k]) && o.seq[k] >= 0) uit.seq[k] = o.seq[k];
    for (const k of Object.keys(obj(o.betaald)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-7)) uit.betaald[k] = nat(o.betaald[k], MUNTEN_MAX_DAG);
    return uit;
  }
  const telTweelingen = (s) => Object.keys(s.kaarten).length;
  const actieve = (s) => Object.entries(s.kaarten).filter(([, k]) => k.status === 'actief');

  let keten = Promise.resolve();
  function serieel(fn) { const r = keten.then(fn, fn); keten = r.catch(() => {}); return r; }
  const Lib = () => globalThis.SPOVrienden;
  async function laad() { return schoonStaat(await Lib().lees(SLEUTEL)); }
  function wijzig(fn) {
    return serieel(async () => {
      const s = schoonStaat(await Lib().lees(SLEUTEL));
      const r = await fn(s);
      await Lib().schrijf(SLEUTEL, s);
      return r;
    });
  }
  const actiefVriend = (st, id) => st.vrienden.find((v) => v.id === id && v.status === 'vriend' && !v.andereVersie);
  async function stuur(st, id, m) {
    const v = actiefVriend(st, id);
    if (!v) return false;
    try { await Lib().stuurBericht(st, v, m); return true; } catch (e) { return false; }
  }
  const maakId = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  const dagTekst = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---- welke kaarten van mij passen bij een band en groep (alleen lokaal) ----
  // Kaarten die al in een tweelingkaart zitten, doen niet nog een keer mee.
  function passendeKaarten(galerij, s, b, g) {
    const bezet = new Set(Object.values(s.kaarten).map((k) => k.eigen));
    return (Array.isArray(galerij) ? galerij : []).filter((e) => e && typeof e.id === 'string' && past(e, b, g) && !bezet.has(e.id)).sort((x, y) => y.ts - x.ts);
  }
  // Welke van mijn kaarten liggen dicht bij een kaart die deze vriend zelf met mij deelt (zelfde vak, dezelfde band)? Een hint, lokaal berekend: er gaat niets over de lijn.
  function hint(galerij, gekKaarten) {
    const uit = new Set();
    const norm = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
    for (const e of Array.isArray(galerij) ? galerij : []) {
      if (!e || typeof e.id !== 'string' || band(e.cijfer) < 0) continue;
      for (const k of Array.isArray(gekKaarten) ? gekKaarten : []) if (k && norm(k.vak) === norm(e.vak) && band(k.cijfer) === band(e.cijfer)) { uit.add(e.id); break; }
    }
    return uit;
  }

  // ---- acties van de gebruiker ----
  // Stelt een vriend een tweelingkaart voor met een van mijn kaarten. Geeft het id van het voorstel.
  function vraag(st, vriendId, kaart) {
    return wijzig(async (s) => {
      if (!actiefVriend(st, vriendId)) throw new Error('Deze vriend is nu niet beschikbaar.');
      if (!kaart || typeof kaart.id !== 'string') throw new Error('Kies eerst een kaart.');
      const g = groepVan(kaart.vak), b = band(kaart.cijfer);
      if (!g || b < 0) throw new Error('Van deze kaart kan geen tweelingkaart worden gemaakt.');
      if (telTweelingen(s) >= MAX_TWEELING) throw new Error(`Je hebt al ${MAX_TWEELING} tweelingkaarten. Haal er eerst een weg.`);
      if (Object.values(s.kaarten).some((k) => k.eigen === kaart.id)) throw new Error('Deze kaart zit al in een tweelingkaart.');
      if (Object.values(s.kaarten).filter((k) => k.vriend === vriendId && k.status === 'verzonden').length >= MAX_OPEN_PER_VRIEND) throw new Error('Wacht eerst op antwoord op je vorige voorstellen aan deze vriend.');
      const id = maakId(), nu = Date.now();
      const v = actiefVriend(st, vriendId);
      s.kaarten[id] = { vriend: vriendId, rol: 'vraag', status: 'verzonden', eigen: kaart.id, b, g, naam: Lib().naam(v), sinds: nu, laatst: nu, bevestigd: false, beloond: false };
      await stuur(st, vriendId, { t: 'tw-vraag', id, b, g });
      return id;
    });
  }
  // Gaat in op een voorstel met een van mijn kaarten die erbij past.
  function accepteer(st, id, kaart) {
    return wijzig(async (s) => {
      const vz = eigen(s.verzoeken, id);
      if (!vz) throw new Error('Dit voorstel bestaat niet meer.');
      if (!actiefVriend(st, vz.van)) throw new Error('Deze vriend is nu niet beschikbaar.');
      if (!kaart || typeof kaart.id !== 'string' || !past(kaart, vz.b, vz.g)) throw new Error('Die kaart past niet bij dit voorstel.');
      if (Object.values(s.kaarten).some((k) => k.eigen === kaart.id)) throw new Error('Deze kaart zit al in een tweelingkaart.');
      if (telTweelingen(s) >= MAX_TWEELING) throw new Error(`Je hebt al ${MAX_TWEELING} tweelingkaarten. Haal er eerst een weg.`);
      const nu = Date.now();
      s.kaarten[id] = { vriend: vz.van, rol: 'antwoord', status: 'actief', eigen: kaart.id, b: vz.b, g: vz.g, naam: Lib().naam(actiefVriend(st, vz.van)), sinds: nu, laatst: nu, bevestigd: false, beloond: false };
      delete s.verzoeken[id];
      await stuur(st, vz.van, { t: 'tw-ja', id, b: vz.b, g: vz.g });
    });
  }
  function weiger(st, id) {
    return wijzig(async (s) => {
      const vz = eigen(s.verzoeken, id);
      delete s.verzoeken[id];
      if (vz) await stuur(st, vz.van, { t: 'tw-nee', id });
    });
  }
  // Haalt een tweelingkaart (of een openstaand voorstel van mij) weg; de ander krijgt een bericht en haalt hem ook weg.
  function stop(st, id) {
    return wijzig(async (s) => {
      const k = eigen(s.kaarten, id);
      if (!k) return;
      delete s.kaarten[id];
      await stuur(st, k.vriend, { t: 'tw-nee', id });
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
      for (const b of lijst.filter((x) => x && typeof x === 'object' && Number.isFinite(x.seq)).sort((x, y) => x.seq - y.seq)) {
        const m = schoonBericht(b && b.m, b && b.leeftijd);
        const seq = b && b.seq;
        if (!m || !Number.isFinite(seq) || seq <= (eigen(s.seq, van) || 0)) continue;
        s.seq[van] = seq;
        const k = eigen(s.kaarten, m.id);
        const nu = Date.now();
        if (m.t === 'tw-vraag') {
          if (k || eigen(s.verzoeken, m.id) || Object.keys(s.verzoeken).length >= MAX_VERZOEKEN) continue;
          s.verzoeken[m.id] = { van, b: m.b, g: m.g, ts: nu };
          uit.meldingen.push(`${naam} stelt een tweelingkaart voor: een kaart in de cijferband ${bandTekst(m.b)} bij ${GROEP_NAAM[m.g]}.`); uit.veranderd = true;
        } else if (m.t === 'tw-ja') {
          if (!k || k.vriend !== van || k.b !== m.b || k.g !== m.g) continue; // een ja dat niet bij een voorstel van mij hoort, doen we niets mee
          if (k.rol === 'vraag') {
            if (k.status === 'verzonden') { k.status = 'actief'; k.sinds = nu; uit.meldingen.push(`${naam} doet mee: jullie hebben een tweelingkaart!`); uit.veranderd = true; }
            k.bevestigd = true;
            await stuur(st, van, { t: 'tw-ja', id: m.id, b: k.b, g: k.g }); // bevestiging, ook als het eerdere ja al binnen was (dan raakt een verloren bevestiging niet kwijt)
          } else if (!k.bevestigd) { k.bevestigd = true; uit.veranderd = true; }
        } else if (m.t === 'tw-nee') {
          if (eigen(s.verzoeken, m.id) && s.verzoeken[m.id].van === van) { delete s.verzoeken[m.id]; uit.veranderd = true; }
          if (k && k.vriend === van) { delete s.kaarten[m.id]; uit.meldingen.push(k.status === 'actief' ? `${naam} heeft jullie tweelingkaart weggehaald.` : `${naam} wil nu geen tweelingkaart.`); uit.veranderd = true; }
        }
      }
      return uit;
    });
  }

  // Opruimen, opnieuw sturen en beloningen betalen. Roep dit aan na elke synchronisatie en af en toe (bijv. elke minuut).
  // Geeft { munten, meldingen }.
  function onderhoud(st) {
    return wijzig(async (s) => {
      const nu = Date.now();
      const uit = { munten: 0, meldingen: [] };
      const alleVrienden = new Set(st.vrienden.map((v) => v.id));
      const actief = new Set(st.vrienden.filter((v) => v.status === 'vriend').map((v) => v.id));
      for (const [id, k] of Object.entries(s.kaarten)) {
        if (!actief.has(k.vriend) || (k.status === 'verzonden' && nu - k.sinds > VERLOOP)) delete s.kaarten[id]; // geen vriend meer (of een voorstel zonder antwoord): de kaart gaat weg
        else { const v = actiefVriend(st, k.vriend); if (v) k.naam = Lib().naam(v); } // de naam zoals die nu zichtbaar is
      }
      for (const id of Object.keys(s.verzoeken)) if (!actief.has(s.verzoeken[id].van) || nu - s.verzoeken[id].ts > VERLOOP) delete s.verzoeken[id];
      for (const k of Object.keys(s.seq)) if (!alleVrienden.has(k)) delete s.seq[k];
      for (const [id, k] of Object.entries(s.kaarten)) {
        if (!actief.has(k.vriend) || nu - k.laatst < HARTSLAG) continue;
        if (k.rol === 'vraag' && k.status === 'verzonden') { k.laatst = nu; await stuur(st, k.vriend, { t: 'tw-vraag', id, b: k.b, g: k.g }); }
        else if (k.rol === 'antwoord' && !k.bevestigd && nu - k.sinds < VERLOOP) { k.laatst = nu; await stuur(st, k.vriend, { t: 'tw-ja', id, b: k.b, g: k.g }); }
      }
      // beloningen: een keer per tweelingkaart, pas als de ander akkoord is, hoogstens MUNTEN_MAX_DAG per dag
      const E = globalThis.SPOEco;
      if (E && typeof E.bonusMunten === 'function') {
        const dag = dagTekst(nu);
        for (const [id, k] of Object.entries(s.kaarten)) {
          if (k.status !== 'actief' || !k.bevestigd || k.beloond) continue;
          const al = s.betaald[dag] || 0;
          if (al + MUNTEN > MUNTEN_MAX_DAG) break;
          const n = await E.bonusMunten('tw:' + id, MUNTEN, 'Tweelingkaart');
          k.beloond = true; // ook als hij al eens was uitbetaald (bijv. na een back-up): niet nog een keer proberen
          if (n > 0) { s.betaald[dag] = al + n; uit.munten += n; }
        }
        const dagen = Object.keys(s.betaald).sort();
        for (const d of dagen.slice(0, Math.max(0, dagen.length - 7))) delete s.betaald[d];
      }
      return uit;
    });
  }

  // ---- weergave ----
  function el(tag, klas, tekst) {
    const e = document.createElement(tag);
    if (klas) e.className = klas;
    if (tekst !== undefined) e.textContent = tekst;
    return e;
  }
  const eerste = (t) => { const x = Array.from(String(t || '').trim())[0]; return x ? x.toUpperCase() : '?'; };
  // Een rondje met een letter: de avatar van een naam (zoals die al zichtbaar is).
  function avatar(naam, klas) { const a = el('span', 'tw-avatar ' + (klas || ''), eerste(naam)); a.setAttribute('aria-hidden', 'true'); return a; }

  // Tekent de hele sectie in `doel`. c: { s, st, galerij, gekKaarten(vriendId), naamVan(id), eigenNaam, acties: { vraag(vriendId, kaartId), accepteer(id, kaartId), weiger(id), stop(id) }, tweestaps }
  // Geeft true terug als er iets te laten zien is (anders blijft de sectie verborgen).
  function teken(doel, c) {
    const s = c.s;
    doel.replaceChildren();
    const vrienden = c.st.vrienden.filter((v) => v.status === 'vriend' && !v.andereVersie);
    const verzoeken = Object.keys(s.verzoeken).filter((id) => actiefVriend(c.st, s.verzoeken[id].van));
    const kaarten = Object.entries(s.kaarten);
    if (!vrienden.length && !kaarten.length) return false;
    const kop = el('h2', '', 'Tweelingkaarten'); kop.id = 'tw-titel';
    doel.append(kop);
    doel.append(el('p', 'uitleg', `Hebben jij en een vriend bij hetzelfde soort vak ongeveer hetzelfde cijfer (hoogstens 0,3 verschil)? Stel dan een tweelingkaart voor. Het werkt pas als je vriend ook ja zegt. Jullie krijgen allebei ${MUNTEN} munten (hoogstens ${MUNTEN_MAX_DAG} per dag, en je kunt ${MAX_TWEELING} tweelingkaarten hebben).`));

    // voorstellen van vrienden
    if (verzoeken.length) {
      const ul = el('ul', 'tw-verzoeken');
      for (const id of verzoeken) {
        const vz = s.verzoeken[id], naam = c.naamVan(vz.van);
        const li = el('li', 'tw-verzoek'); li.dataset.id = id;
        li.append(el('p', '', `${naam} stelt een tweelingkaart voor: een kaart in de cijferband ${bandTekst(vz.b)}, bij ${GROEP_NAAM[vz.g]}. Jullie spreken af dat het hetzelfde vak is. ${naam} ziet jouw vak en cijfer niet.`));
        const opties = passendeKaarten(c.galerij, s, vz.b, vz.g);
        const acties = el('div', 'tw-acties');
        if (!opties.length) li.append(el('p', 'uitleg', 'Je hebt geen kaart die hierbij past.'));
        else {
          const lab = el('label', 'tw-label', 'Jouw kaart:'); const sel = el('select', 'tw-select'); sel.id = 'tw-kies-' + id; lab.htmlFor = sel.id;
          const hints = hint(c.galerij, c.gekKaarten ? c.gekKaarten(vz.van) : []);
          for (const e of opties.slice(0, 80)) { const o = el('option', '', `${e.vak} ${fmt(e.cijfer)}${hints.has(e.id) ? ' (ook bij een kaart van ' + naam + ')' : ''}`); o.value = e.id; sel.append(o); }
          const ja = el('button', 'knop goud klein', 'Tweelingkaart maken'); ja.type = 'button';
          ja.setAttribute('aria-label', `Tweelingkaart maken met ${naam}`);
          ja.disabled = telTweelingen(s) >= MAX_TWEELING;
          ja.addEventListener('click', () => c.acties.accepteer(id, sel.value));
          li.append(lab, sel); acties.append(ja);
        }
        const nee = el('button', 'knop klein', 'Weigeren'); nee.type = 'button';
        nee.setAttribute('aria-label', `Voorstel van ${naam} weigeren`);
        nee.addEventListener('click', () => c.acties.weiger(id));
        acties.append(nee);
        li.append(acties);
        ul.append(li);
      }
      doel.append(ul);
    }

    // mijn tweelingkaarten en openstaande voorstellen
    if (kaarten.length) {
      const ul = el('ul', 'tw-lijst'); ul.setAttribute('aria-label', 'Jouw tweelingkaarten');
      for (const [id, k] of kaarten.sort((x, y) => y[1].sinds - x[1].sinds)) {
        const naam = c.naamVan(k.vriend) || k.naam;
        const e = (Array.isArray(c.galerij) ? c.galerij : []).find((x) => x && x.id === k.eigen);
        const li = el('li', 'tw-kaart' + (k.status === 'actief' ? ' actief' : '')); li.dataset.id = id;
        const paar = el('span', 'tw-paar'); paar.append(avatar(c.eigenNaam || 'Jij'), el('span', 'tw-plus', '+'), avatar(naam));
        li.append(paar);
        const tekst = el('div', 'tw-tekst');
        tekst.append(el('p', 'tw-naam', k.status === 'actief' ? `Tweelingkaart: ${c.eigenNaam || 'Jij'} en ${naam}` : `Voorstel aan ${naam}`));
        tekst.append(el('p', 'uitleg', (e ? `Jouw kaart: ${e.vak} ${fmt(e.cijfer)}. ` : 'Jouw kaart is niet meer in je galerij. ') + `Gedeeld: alleen de band ${bandTekst(k.b)} en ${GROEP_NAAM[k.g]}.` + (k.status === 'actief' ? (k.beloond ? ` Beloning gekregen (${MUNTEN} munten).` : k.bevestigd ? ' Je beloning komt eraan.' : ' Wachten op bevestiging van je vriend.') : ` Wachten tot ${naam} ja zegt.`)));
        li.append(tekst);
        const stopKnop = el('button', 'knop gevaar klein', k.status === 'actief' ? 'Weghalen' : 'Intrekken'); stopKnop.type = 'button';
        stopKnop.setAttribute('aria-label', `${k.status === 'actief' ? 'Tweelingkaart met' : 'Voorstel aan'} ${naam} ${k.status === 'actief' ? 'weghalen' : 'intrekken'}`);
        c.tweestaps(stopKnop, stopKnop.textContent, 'Zeker weten?', () => c.acties.stop(id));
        li.append(stopKnop);
        ul.append(li);
      }
      doel.append(ul);
    }

    // een nieuw voorstel
    if (vrienden.length && telTweelingen(s) < MAX_TWEELING) {
      const form = el('div', 'tw-form'); form.setAttribute('role', 'group'); form.setAttribute('aria-labelledby', 'tw-nieuw-kop');
      const h = el('h3', '', 'Een tweelingkaart voorstellen'); h.id = 'tw-nieuw-kop';
      const l1 = el('label', 'tw-label', 'Vriend:'); const sv = el('select', 'tw-select'); sv.id = 'tw-vriend'; l1.htmlFor = sv.id;
      for (const v of vrienden) { const o = el('option', '', c.naamVan(v.id)); o.value = v.id; sv.append(o); }
      const l2 = el('label', 'tw-label', 'Jouw kaart:'); const sk = el('select', 'tw-select'); sk.id = 'tw-kaart'; l2.htmlFor = sk.id;
      const knop = el('button', 'knop goud klein', 'Voorstel versturen'); knop.type = 'button';
      const uitleg = el('p', 'uitleg tw-deelt'); uitleg.setAttribute('role', 'status'); uitleg.setAttribute('aria-live', 'polite');
      const bezet = new Set(Object.values(s.kaarten).map((k) => k.eigen));
      const gemaakt = (Array.isArray(c.galerij) ? c.galerij : []).filter((e) => e && typeof e.id === 'string' && !bezet.has(e.id) && groepVan(e.vak) && band(e.cijfer) >= 0);
      const vulKaarten = () => {
        const hints = hint(gemaakt, c.gekKaarten ? c.gekKaarten(sv.value) : []);
        sk.replaceChildren();
        for (const e of gemaakt.slice().sort((x, y) => (hints.has(y.id) ? 1 : 0) - (hints.has(x.id) ? 1 : 0) || y.cijfer - x.cijfer).slice(0, 80)) {
          const o = el('option', '', `${e.vak} ${fmt(e.cijfer)}${hints.has(e.id) ? ' (past bij een kaart van deze vriend)' : ''}`); o.value = e.id; sk.append(o);
        }
        zegDelen();
      };
      const zegDelen = () => {
        const e = gemaakt.find((x) => x.id === sk.value);
        knop.disabled = !e;
        uitleg.textContent = e
          ? `Je deelt alleen: de cijferband ${bandTekst(band(e.cijfer))} en de soort vak: ${GROEP_NAAM[groepVan(e.vak)]}. Niet je vak, niet je exacte cijfer. Je vriend kiest zelf een kaart die erbij past.`
          : 'Je hebt nog geen kaart waar een tweelingkaart van kan worden.';
      };
      sv.addEventListener('change', vulKaarten);
      sk.addEventListener('change', zegDelen);
      knop.addEventListener('click', () => { const e = gemaakt.find((x) => x.id === sk.value); if (e) c.acties.vraag(sv.value, e.id); });
      form.append(h, l1, sv, l2, sk, uitleg, knop);
      doel.append(form);
      vulKaarten();
    } else if (vrienden.length) doel.append(el('p', 'uitleg', `Je hebt ${MAX_TWEELING} tweelingkaarten: dat is het maximum. Haal er een weg om een nieuwe te maken.`));
    return true;
  }

  // Voor de galerij: welke van mijn kaarten zijn een tweelingkaart, met wie? { [galerij-id]: { naam } }
  function perKaart(s, naamVan) {
    const uit = {};
    for (const [, k] of Object.entries(schoonStaat(s).kaarten)) if (k.status === 'actief') uit[k.eigen] = { naam: (naamVan ? naamVan(k.vriend) : '') || k.naam || 'Vriend' };
    return uit;
  }

  const lib = {
    SLEUTEL, TYPES, GROEPEN, GROEP_NAAM, BANDEN, MAX_TWEELING, MUNTEN, MUNTEN_MAX_DAG,
    band, bandVan, bandTekst, groepVan, past, schoonBericht, schoonStaat, laad, passendeKaarten, hint, vraag, accepteer, weiger, stop, opBerichten, onderhoud, teken, perKaart, avatar, eerste,
  };
  globalThis.SPOTweeling = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
