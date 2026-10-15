/*
 * Somtoday Pack Opener v3.0: JOUW JAAR, een terugblik op je schooljaar.
 *
 * Alles wordt lokaal uitgerekend uit wat al in deze browser staat (spo_galerij, spo_prestaties). Je opent hem met de knop 'Jaar bekijken' in het Overzicht;
 * van 1 juli tot en met 31 augustus wordt hij ook aangeboden (een blokje in het Overzicht). Er gaat niets naar een server, behalve in dit ene geval:
 *   - Wil je de terugblik door een AI laten schrijven, dan zie je eerst een voorbeeld van PRECIES de gegevens die worden verstuurd, en moet je per keer
 *     een vinkje zetten. Verstuurd worden alleen getallen: gemiddelde en stijging per soort vak (exact, talen, mens, kunst), aantal kaarten per ladder,
 *     hoogste en laagste cijfer, aantal pakjes en prestaties en het nummer van de maand van je slechtste week. Geen namen, geen vaknamen, geen school, geen tekst.
 *     Je komt dan in een wachtrij (server/api.php: jaarAanvraag en jaarStatus). De server schrijft de tekst via Groq en bewaart hem niet.
 *   - De tekst van de AI wordt niet vertrouwd: begrensd op 800 tekens, tags en links eruit, door het tekstfilter (SPOTekst.controleer), en alleen met textContent getoond.
 *     Wordt hij afgekeurd, is er geen account, geen toestemming, een fout, een time-out of is de dagelijkse limiet op, dan krijg je de lokale terugblik zonder AI.
 *   - 'Deel' maakt een plaatje (canvas, png) om te downloaden. Er staan geen naam en geen vaknamen op, alleen cijfers en ladders. Er wordt niets geüpload.
 *
 * Opslag: spo_jaar { v:1, gezien:{ '2025-2026': ts }, uitgesteld: ts }  (mee in de back-up)
 * Toegankelijk: dialoog met aria-modal, Esc sluit, pijltjes bladeren, Tab blijft in de dialoog, uitslagen via aria-live en bij 'minder beweging' staat de animatie stil.
 * Werkt ook in Node (tests): alleen de rekenfuncties; open() en koppel() hebben een pagina nodig.
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const SLEUTEL = 'spo_jaar';
  const LIMIET_TEKST = 'Helaas is de dagelijkse limiet van het jaaroverzicht maken op. Probeer het morgen opnieuw, sorry voor het ongemak.';
  const AI_UITLEG = 'Deze cijfers gaan eenmalig naar een AI-dienst (Groq) om je terugblik te schrijven.';
  const CONFIG = { pollMs: 3000, maxMs: 130000 };
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const TREDEN = ['Gewoon', 'Zeldzaam', 'Glim', 'Kosmisch', 'Mythisch'];
  const OPENING_NAAM = { pak: 'Pakje', kluis: 'Kluis kraken', plinko: 'Plinko', ster: 'Wensster', raket: 'Raket', schiet: 'Schietkraam', dans: 'Dansje' };
  const GROEPEN = ['exact', 'talen', 'mens', 'kunst'];
  const GROEP_NAAM = { exact: 'exacte vakken', talen: 'talen', mens: 'mens en maatschappij', kunst: 'kunst en sport' };
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
  const fmtPlus = (n) => (n > 0 ? '+' : '') + fmt(n);
  const rond1 = (x) => Math.round(x * 10) / 10;
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const tredeVan = (e) => Math.max(0, Math.min(4, (e && e.trede) | 0)) || (e && e.zeldzaam === true ? 1 : 0);

  // ───────── Het schooljaar ─────────
  // Een schooljaar loopt van 1 augustus tot en met 31 juli. In juli en augustus kijk je terug op het jaar dat net eindigt (of eindigde).
  function schooljaar(nu) {
    const d = new Date(nu);
    const m = d.getMonth(), y = d.getFullYear();
    const startJaar = m >= 8 ? y : y - 1;
    return { label: `${startJaar}-${startJaar + 1}`, start: new Date(startJaar, 7, 1).getTime(), eind: new Date(startJaar + 1, 7, 1).getTime() };
  }
  const schoonStaat = (x) => {
    const o = obj(x);
    const gezien = {};
    for (const k of Object.keys(obj(o.gezien)).slice(0, 30)) if (/^\d{4}-\d{4}$/.test(k) && Number.isFinite(o.gezien[k])) gezien[k] = o.gezien[k];
    return { v: 1, gezien, uitgesteld: Number.isFinite(o.uitgesteld) ? o.uitgesteld : 0 };
  };
  // Wordt de terugblik nu aangeboden? Van 1 juli tot en met 31 augustus, eenmaal per schooljaar, en niet als je 'later' koos (tot morgen).
  function aanbod(nu, staat) {
    const m = new Date(nu).getMonth();
    if (m !== 6 && m !== 7) return null;
    const j = schooljaar(nu);
    const s = schoonStaat(staat);
    if (s.gezien[j.label]) return null;
    const dag = (t) => { const d = new Date(t); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); };
    if (s.uitgesteld && dag(s.uitgesteld) === dag(nu)) return null;
    return j.label;
  }

  // ───────── Rekenen (alles lokaal) ─────────
  const gewicht = (e) => (Number.isFinite(e.weging) && e.weging > 0 ? e.weging : 1);
  function gemiddelde(lijst) {
    let s = 0, w = 0;
    for (const e of lijst) { s += e.cijfer * gewicht(e); w += gewicht(e); }
    return w ? s / w : null;
  }
  function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  // galerij: lijst kaarten; prest: { [id]: ts }; bereik: { label, start, eind }.
  function bereken(galerij, prest, bereik) {
    const b = bereik || schooljaar(Date.now());
    const kaarten = (Array.isArray(galerij) ? galerij : []).filter((e) => e && Number.isFinite(e.cijfer) && e.cijfer >= 1 && e.cijfer <= 10 && Number.isFinite(e.ts) && e.ts >= b.start && e.ts < b.eind);
    const uit = { label: b.label, n: kaarten.length, gem: gemiddelde(kaarten), beste: null, laagste: null, stijging: null, week: null, lad: [0, 0, 0, 0, 0], animatie: null, prestaties: 0, perVak: [] };
    uit.prestaties = Object.values(obj(prest)).filter((t) => Number.isFinite(t) && t >= b.start && t < b.eind).length;
    if (!kaarten.length) return uit;
    for (const e of kaarten) {
      if (!uit.beste || e.cijfer > uit.beste.cijfer || (e.cijfer === uit.beste.cijfer && e.ts < uit.beste.ts)) uit.beste = { cijfer: e.cijfer, vak: String(e.vak || ''), ts: e.ts };
      if (!uit.laagste || e.cijfer < uit.laagste.cijfer) uit.laagste = { cijfer: e.cijfer, vak: String(e.vak || ''), ts: e.ts };
      uit.lad[tredeVan(e)]++;
    }
    // per vak: eerste helft van het jaar tegenover de tweede helft (op volgorde van de kaarten)
    const perVak = new Map();
    for (const e of kaarten.slice().sort((x, y) => x.ts - y.ts)) {
      const sl = String(e.vak || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!sl) continue;
      if (!perVak.has(sl)) perVak.set(sl, { vak: String(e.vak).trim(), kaarten: [] });
      perVak.get(sl).kaarten.push(e);
    }
    for (const v of perVak.values()) {
      const n = v.kaarten.length;
      let delta = null, van = null, naar = null;
      if (n >= 2) {
        const h = Math.floor(n / 2);
        van = gemiddelde(v.kaarten.slice(0, h)); naar = gemiddelde(v.kaarten.slice(h));
        delta = naar - van;
      }
      uit.perVak.push({ vak: v.vak, n, gem: gemiddelde(v.kaarten), delta, van, naar });
    }
    for (const v of uit.perVak) if (v.delta !== null && v.delta > 0.05 && (!uit.stijging || v.delta > uit.stijging.delta)) uit.stijging = { vak: v.vak, delta: v.delta, van: v.van, naar: v.naar };
    // je ergste week: de laagste weekgemiddelde, bij voorkeur van weken met minstens 2 kaarten
    const weken = new Map();
    for (const e of kaarten) { const w = weekStart(e.ts); if (!weken.has(w)) weken.set(w, []); weken.get(w).push(e); }
    let lijst = [...weken].map(([w, l]) => ({ start: w, n: l.length, gem: gemiddelde(l) }));
    if (lijst.some((x) => x.n >= 2)) lijst = lijst.filter((x) => x.n >= 2);
    for (const x of lijst) if (!uit.week || x.gem < uit.week.gem) uit.week = x;
    // favoriete animatie
    const tel = {};
    for (const e of kaarten) if (Object.prototype.hasOwnProperty.call(OPENING_NAAM, e.opening)) tel[e.opening] = (tel[e.opening] || 0) + 1;
    for (const id of Object.keys(OPENING_NAAM)) if (tel[id] && (!uit.animatie || tel[id] > uit.animatie.n)) uit.animatie = { id, naam: OPENING_NAAM[id], n: tel[id] };
    return uit;
  }

  // ───────── Wat naar de AI gaat (alleen getallen) ─────────
  function aiGegevens(s, groepVan) {
    const gv = groepVan || (globalThis.SPOGevecht && globalThis.SPOGevecht.groepVan) || (() => null);
    const gem = {}, stijg = {};
    for (const g of GROEPEN) {
      const vakken = s.perVak.filter((v) => gv(v.vak) === g);
      let som = 0, w = 0;
      for (const v of vakken) { som += v.gem * v.n; w += v.n; }
      gem[g] = w ? rond1(som / w) : null;
      const metDelta = vakken.filter((v) => v.delta !== null).sort((a, b) => b.delta - a.delta);
      stijg[g] = metDelta.length ? Math.max(-9, Math.min(9, rond1(metDelta[0].delta))) : null;
    }
    return {
      v: 1, gem, stijg, lad: s.lad.map((x) => Math.min(9999, x)),
      hoog: s.beste ? rond1(s.beste.cijfer) : null, laag: s.laagste ? rond1(s.laagste.cijfer) : null,
      pak: Math.min(99999, s.n), prest: Math.min(999, s.prestaties), slecht: s.week ? new Date(s.week.start).getMonth() + 1 : null,
    };
  }
  // Dezelfde gegevens in gewone taal: dit is het voorbeeld dat de gebruiker ziet voor hij toestemming geeft.
  function aiVoorbeeld(d) {
    const r = [];
    for (const g of GROEPEN) r.push(`Gemiddeld cijfer ${GROEP_NAAM[g]}: ${d.gem[g] === null ? 'geen cijfers' : fmt(d.gem[g])}${d.stijg[g] === null ? '' : ', verandering over het jaar: ' + fmtPlus(d.stijg[g])}`);
    r.push('Aantal kaarten per ladder: ' + TREDEN.map((t, i) => `${t.toLowerCase()} ${d.lad[i]}`).join(', '));
    if (d.hoog !== null) r.push('Hoogste cijfer: ' + fmt(d.hoog));
    if (d.laag !== null) r.push('Laagste cijfer: ' + fmt(d.laag));
    r.push('Aantal geopende pakjes: ' + d.pak);
    r.push('Aantal prestaties: ' + d.prest);
    if (d.slecht !== null) r.push('Maand van je slechtste week: ' + MAANDEN[d.slecht - 1]);
    return r;
  }

  // ───────── De tekst: lokaal, of van de AI (niet vertrouwd) ─────────
  function lokaleTekst(s) {
    if (!s.n) return `In schooljaar ${s.label} heb je nog geen kaarten geopend. Zodra je een cijfer opent, komt je terugblik hier.`;
    const z = [];
    z.push(`In schooljaar ${s.label} opende je ${s.n} ${s.n === 1 ? 'pakje' : 'pakjes'}, met een gemiddelde van ${fmt(s.gem)}.`);
    z.push(`Je beste kaart was een ${fmt(s.beste.cijfer)}${s.beste.vak ? ' voor ' + s.beste.vak : ''}.`);
    if (s.stijging) z.push(`Je grootste stijging was ${s.stijging.vak}: ${fmtPlus(s.stijging.delta)}.`);
    if (s.week) z.push(`Je zwaarste week was in ${MAANDEN[new Date(s.week.start).getMonth()]}, met een gemiddelde van ${fmt(s.week.gem)}. Iedereen heeft weleens een zware week.`);
    const hoog = s.lad[3] + s.lad[4];
    if (hoog) z.push(`Je trok ${hoog} ${hoog === 1 ? 'kosmische of mythische kaart' : 'kosmische of mythische kaarten'}.`);
    if (s.prestaties) z.push(`Je haalde ${s.prestaties} ${s.prestaties === 1 ? 'prestatie' : 'prestaties'}.`);
    z.push('Goed gedaan, en veel plezier in de vakantie!');
    return z.join(' ');
  }
  // De tekst van de AI: tags, links en opmaak eruit, hoogstens 800 tekens, en door het strenge tekstfilter. Komt hij er niet doorheen: null.
  function schoonAI(t) {
    if (typeof t !== 'string') return null;
    let x = t.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/(?:https?:\/\/|www\.)\S*/gi, ' ');
    x = x.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁩﻿<>*#_`\[\]{}|\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (x.length > 800) { const k = x.slice(0, 800); const p = Math.max(k.lastIndexOf('. '), k.lastIndexOf('! '), k.lastIndexOf('? ')); x = p > 300 ? k.slice(0, p + 1) : k; }
    if (x.length < 40) return null;
    const T = globalThis.SPOTekst;
    if (!T) return null; // zonder filter liever geen tekst van buiten
    const c = T.controleer(x, { max: 900, soort: 'tekst' });
    return c.ok ? c.schoon : null;
  }

  // ───────── De schermen ─────────
  function schermen(s, tekst, notitie) {
    const l = [];
    if (!s.n) return [{ id: 'leeg', kleur: 40, titel: `Jouw jaar ${s.label}`, groot: '0', regel: 'pakjes geopend', uitleg: lokaleTekst(s) }];
    l.push({ id: 'start', kleur: 45, titel: `Jouw jaar ${s.label}`, groot: String(s.n), regel: s.n === 1 ? 'pakje geopend' : 'pakjes geopend', uitleg: `Je gemiddelde dit schooljaar was ${fmt(s.gem)}.` });
    l.push({ id: 'beste', kleur: 50, titel: 'Je beste kaart', groot: fmt(s.beste.cijfer), regel: s.beste.vak, uitleg: `Geopend op ${new Date(s.beste.ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}.` });
    l.push(s.stijging
      ? { id: 'stijging', kleur: 140, titel: 'Je grootste stijging', groot: fmtPlus(s.stijging.delta), regel: s.stijging.vak, uitleg: `Van gemiddeld ${fmt(s.stijging.van)} naar ${fmt(s.stijging.naar)}.` }
      : { id: 'stijging', kleur: 140, titel: 'Je grootste stijging', groot: '-', regel: 'Nog geen stijging', uitleg: 'Voor een stijging heb je in een vak minstens twee kaarten nodig, waarvan de latere hoger zijn.' });
    l.push(s.week
      ? { id: 'week', kleur: 350, titel: 'Je zwaarste week', groot: fmt(s.week.gem), regel: `Week van ${new Date(s.week.start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`, uitleg: 'Iedereen heeft weleens een zware week. Het gaat om wat je daarna doet.' }
      : { id: 'week', kleur: 350, titel: 'Je zwaarste week', groot: '-', regel: 'Geen zware week', uitleg: 'Er is geen week om uit te kiezen.' });
    l.push({ id: 'ladder', kleur: 270, titel: 'Je kaarten per ladder', groot: String(s.n), regel: 'kaarten', lijst: TREDEN.map((t, i) => `${t}: ${s.lad[i]}`), uitleg: 'Hoe hoger op de ladder, hoe zeldzamer de kaart.' });
    l.push(s.animatie
      ? { id: 'animatie', kleur: 190, titel: 'Je favoriete animatie', groot: s.animatie.naam, regel: `${s.animatie.n}x gekozen`, uitleg: 'Zo opende je de meeste cijfers.' }
      : { id: 'animatie', kleur: 190, titel: 'Je favoriete animatie', groot: '-', regel: 'Geen favoriet', uitleg: '' });
    l.push({ id: 'prestaties', kleur: 100, titel: 'Je prestaties', groot: String(s.prestaties), regel: s.prestaties === 1 ? 'prestatie behaald' : 'prestaties behaald', uitleg: '' });
    l.push({ id: 'terugblik', kleur: 320, titel: 'Je terugblik', groot: '', regel: '', tekst: tekst.tekst, bron: tekst.bron, uitleg: notitie || '' });
    return l;
  }

  // Wat er op het plaatje komt: alleen getallen en ladders. Geen naam, geen vaknamen.
  function deelbaar(s) {
    return { jaar: s.label, n: s.n, gem: s.gem === null ? null : rond1(s.gem), beste: s.beste ? rond1(s.beste.cijfer) : null, stijging: s.stijging ? rond1(s.stijging.delta) : null, week: s.week ? rond1(s.week.gem) : null, lad: s.lad.slice(), animatie: s.animatie ? s.animatie.naam : null, prestaties: s.prestaties };
  }
  function tekenDeel(c, d) {
    const w = c.width, h = c.height, x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a1f3a'); g.addColorStop(1, '#080a14');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,210,74,.12)'; x.beginPath(); x.arc(w * 0.85, h * 0.12, w * 0.4, 0, Math.PI * 2); x.fill();
    const font = (px, zwaar) => `${zwaar ? '800' : '500'} ${px}px system-ui, -apple-system, Segoe UI, sans-serif`;
    x.textAlign = 'center';
    x.fillStyle = '#ffd24a'; x.font = font(Math.round(w * 0.075), true); x.fillText(`Mijn schooljaar ${d.jaar}`, w / 2, h * 0.11);
    const tegels = [
      ['Beste kaart', d.beste === null ? '-' : fmt(d.beste)],
      ['Grootste stijging', d.stijging === null ? '-' : fmtPlus(d.stijging)],
      ['Zwaarste week', d.week === null ? '-' : fmt(d.week)],
      ['Pakjes geopend', String(d.n)],
    ];
    const tw = w * 0.42, th = h * 0.15;
    tegels.forEach((t, i) => {
      const tx = w * (i % 2 ? 0.53 : 0.05), ty = h * (0.17 + Math.floor(i / 2) * 0.185);
      x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(tx, ty, tw, th);
      x.fillStyle = '#a5aec4'; x.font = font(Math.round(w * 0.032)); x.fillText(t[0], tx + tw / 2, ty + th * 0.3);
      x.fillStyle = '#ffffff'; x.font = font(Math.round(w * 0.08), true); x.fillText(t[1], tx + tw / 2, ty + th * 0.8);
    });
    x.fillStyle = '#eef1f8'; x.font = font(Math.round(w * 0.04), true); x.fillText('Kaarten per ladder', w / 2, h * 0.58);
    const kl = ['#e08a4a', '#dfe9f5', '#ffcc33', '#38e1ff', '#ff9ee8'];
    d.lad.forEach((n, i) => {
      const bx = w * (0.07 + i * 0.18), by = h * 0.61, bw = w * 0.16;
      x.fillStyle = kl[i]; x.globalAlpha = 0.22; x.fillRect(bx, by, bw, h * 0.1); x.globalAlpha = 1;
      x.fillStyle = kl[i]; x.font = font(Math.round(w * 0.06), true); x.fillText(String(n), bx + bw / 2, by + h * 0.055);
      x.fillStyle = '#a5aec4'; x.font = font(Math.round(w * 0.026)); x.fillText(TREDEN[i], bx + bw / 2, by + h * 0.09);
    });
    x.fillStyle = '#eef1f8'; x.font = font(Math.round(w * 0.036));
    x.fillText(`${d.prestaties} ${d.prestaties === 1 ? 'prestatie' : 'prestaties'}${d.animatie ? ' · favoriete animatie: ' + d.animatie : ''}`, w / 2, h * 0.79);
    if (d.gem !== null) { x.fillStyle = '#ffd24a'; x.font = font(Math.round(w * 0.05), true); x.fillText(`Gemiddelde ${fmt(d.gem)}`, w / 2, h * 0.87); }
    x.fillStyle = '#8790a8'; x.font = font(Math.round(w * 0.03)); x.fillText('Pack Opener', w / 2, h * 0.95);
  }

  // ───────── Opslag ─────────
  async function leesAlles(sleutels) {
    try {
      if (api && api.storage && api.storage.local) return await api.storage.local.get(sleutels);
      const r = {};
      for (const k of sleutels) { const t = globalThis.localStorage && localStorage.getItem(k); if (t) r[k] = JSON.parse(t); }
      return r;
    } catch (e) { return {}; }
  }
  async function schrijfStaat(s) {
    try {
      if (api && api.storage && api.storage.local) await api.storage.local.set({ [SLEUTEL]: s });
      else if (globalThis.localStorage) localStorage.setItem(SLEUTEL, JSON.stringify(s));
    } catch (e) { /* niet bewaren is niet erg */ }
  }
  async function markeerGezien(label) {
    const s = schoonStaat((await leesAlles([SLEUTEL]))[SLEUTEL]);
    if (!s.gezien[label]) { s.gezien[label] = Date.now(); await schrijfStaat(s); }
  }
  async function uitstellen() {
    const s = schoonStaat((await leesAlles([SLEUTEL]))[SLEUTEL]);
    s.uitgesteld = Date.now();
    await schrijfStaat(s);
  }

  // ───────── De AI vragen (via de vriendenserver, na toestemming) ─────────
  // Geeft { status: 'klaar', tekst } | { status: 'limiet' | 'fout' | 'tijd' | 'geen-account' | 'geannuleerd' }. `ui.positie(n, status)` krijgt de wachtrijplek.
  async function vraagAI(d, ui) {
    const L = globalThis.SPOVrienden;
    if (!L) return { status: 'geen-account' };
    let st = null;
    try { st = await L.laad(); } catch (e) { st = null; }
    if (!st) return { status: 'geen-account' };
    const c = L.clientVan(st);
    const t0 = Date.now();
    let r;
    try {
      r = await c.roep('jaarAanvraag', { d });
      for (;;) {
        if (ui && ui.geannuleerd && ui.geannuleerd()) return { status: 'geannuleerd' };
        if (r.status === 'klaar') return { status: 'klaar', tekst: r.tekst };
        if (r.status === 'limiet') return { status: 'limiet' };
        if (r.status === 'tijd') return { status: 'tijd' };
        if (r.status !== 'wacht' && r.status !== 'bezig') return { status: 'fout' };
        if (ui && ui.positie) ui.positie(Number.isInteger(r.positie) ? r.positie : 0, r.status);
        if (Date.now() - t0 > CONFIG.maxMs) return { status: 'tijd' };
        await new Promise((ok) => setTimeout(ok, CONFIG.pollMs));
        if (ui && ui.geannuleerd && ui.geannuleerd()) return { status: 'geannuleerd' };
        r = await c.roep('jaarStatus');
      }
    } catch (e) { return { status: 'fout' }; }
  }

  // ───────── Weergave ─────────
  const el = (tag, klas, tekst) => { const e = document.createElement(tag); if (klas) e.className = klas; if (tekst != null) e.textContent = tekst; return e; };
  const stil = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // Achtergrond op canvas: zachte lichtdeeltjes in de kleur van het scherm. Bij 'minder beweging' of een verborgen pagina staat hij stil.
  function achtergrond(canvas) {
    const x = canvas.getContext('2d');
    let kleur = 45, raf = 0, deeltjes = [], uitbarsting = [];
    const maak = () => { deeltjes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3, v: 0.00008 + Math.random() * 0.0002, f: Math.random() * 6.28 })); };
    const pas = () => { const b = canvas.getBoundingClientRect(); canvas.width = Math.max(1, Math.round(b.width)); canvas.height = Math.max(1, Math.round(b.height)); };
    function teken(t) {
      const w = canvas.width, h = canvas.height;
      const g = x.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.5, Math.max(w, h) * 0.8);
      g.addColorStop(0, `hsl(${kleur} 55% 20%)`); g.addColorStop(1, '#080a14');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (const p of deeltjes) {
        const y = ((p.y - (t || 0) * p.v) % 1 + 1) % 1;
        x.globalAlpha = 0.25 + 0.35 * Math.sin((t || 0) * 0.002 + p.f) ** 2;
        x.fillStyle = `hsl(${kleur} 90% 70%)`;
        x.beginPath(); x.arc(p.x * w, y * h, p.r, 0, 6.283); x.fill();
      }
      for (const b of uitbarsting) {
        const leef = ((t || 0) - b.t0) / 1400;
        if (leef < 0 || leef > 1) continue;
        x.globalAlpha = 1 - leef; x.fillStyle = `hsl(${(kleur + b.tint) % 360} 95% 65%)`;
        x.beginPath(); x.arc(w / 2 + Math.cos(b.hoek) * b.snel * leef * w * 0.5, h * 0.4 + Math.sin(b.hoek) * b.snel * leef * h * 0.5 + 80 * leef * leef, b.r * (1 - leef * 0.5), 0, 6.283); x.fill();
      }
      uitbarsting = uitbarsting.filter((b) => ((t || 0) - b.t0) / 1400 <= 1);
      x.globalAlpha = 1;
    }
    function lus(t) { raf = 0; if (document.hidden) return; teken(t); raf = requestAnimationFrame(lus); }
    return {
      start() { maak(); pas(); if (stil()) teken(0); else raf = requestAnimationFrame(lus); window.addEventListener('resize', this.pas = () => { pas(); if (stil()) teken(0); }); document.addEventListener('visibilitychange', this.zicht = () => { if (!document.hidden && !stil() && !raf) raf = requestAnimationFrame(lus); }); },
      kleur(k) { kleur = k; if (stil()) teken(0); },
      // een stoot lichtdeeltjes bij een nieuw scherm (niet bij 'minder beweging')
      stoot() { if (stil()) return; const t0 = performance.now(); uitbarsting = Array.from({ length: 36 }, () => ({ t0, hoek: Math.random() * 6.283, snel: 0.2 + Math.random() * 0.6, r: 2 + Math.random() * 3, tint: Math.random() * 60 - 30 })); },
      stop() { if (raf) cancelAnimationFrame(raf); raf = 0; window.removeEventListener('resize', this.pas); document.removeEventListener('visibilitychange', this.zicht); },
    };
  }

  let open_ = null; // er is hooguit één venster tegelijk
  // Opent de terugblik. Geeft een belofte die klaar is als het venster sluit. opties: { nu, galerij, prest } (voor tests).
  async function openJaar(opties) {
    if (open_) return open_.belofte;
    const o = opties || {};
    const r = await leesAlles(['spo_galerij', 'spo_prestaties']);
    const nu = o.nu || Date.now();
    const s = bereken(o.galerij || r.spo_galerij, o.prest || r.spo_prestaties, schooljaar(nu));
    const terug = document.activeElement;
    const wortel = el('div', 'jaar-overlay');
    wortel.setAttribute('role', 'dialog'); wortel.setAttribute('aria-modal', 'true'); wortel.setAttribute('aria-labelledby', 'jaar-titel');
    const canvas = el('canvas', 'jaar-canvas'); canvas.setAttribute('aria-hidden', 'true');
    const doos = el('div', 'jaar-doos');
    const kop = el('div', 'jaar-kop');
    const teller = el('p', 'jaar-teller'); teller.setAttribute('aria-hidden', 'true');
    const sluit = el('button', 'jaar-knop jaar-sluit', 'Sluiten'); sluit.type = 'button'; sluit.setAttribute('aria-label', 'Jouw jaar sluiten');
    kop.append(teller, sluit);
    const inhoud = el('div', 'jaar-inhoud'); inhoud.setAttribute('aria-live', 'polite');
    const voet = el('div', 'jaar-voet');
    const vorige = el('button', 'jaar-knop', 'Vorige'); vorige.type = 'button';
    const volgende = el('button', 'jaar-knop jaar-goud', 'Volgende'); volgende.type = 'button';
    const deel = el('button', 'jaar-knop', 'Deel'); deel.type = 'button';
    deel.setAttribute('aria-label', 'Deel: sla een plaatje zonder naam en zonder vaknamen op');
    voet.append(vorige, deel, volgende);
    const melding = el('p', 'jaar-melding'); melding.setAttribute('role', 'status'); melding.setAttribute('aria-live', 'polite');
    doos.append(kop, inhoud, melding, voet);
    wortel.append(canvas, doos);
    document.body.append(wortel);
    document.documentElement.classList.add('jaar-open');
    const ach = achtergrond(canvas); ach.start();

    let klaarFn;
    const belofte = new Promise((ok) => { klaarFn = ok; });
    let lijst = [], i = 0, fase = 'keuze', annuleer = false, besteld = false, tekstBron = { tekst: lokaleTekst(s), bron: 'lokaal' }, notitie = '';
    const rustig = stil();

    function sluiten() {
      annuleer = true;
      ach.stop();
      document.removeEventListener('keydown', toets, true);
      wortel.remove();
      document.documentElement.classList.remove('jaar-open');
      open_ = null;
      if (besteld || fase === 'scherm') markeerGezien(s.label).catch(() => {});
      try { if (terug && terug.focus) terug.focus(); } catch (e) { /* weg */ }
      klaarFn();
    }
    function zetMelding(t) { melding.textContent = t || ''; }
    function toets(ev) {
      if (!document.body.contains(wortel)) return;
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); sluiten(); return; }
      if (fase === 'scherm' && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && !(ev.target instanceof HTMLInputElement)) { ev.preventDefault(); ga(i + (ev.key === 'ArrowRight' ? 1 : -1)); return; }
      if (ev.key === 'Tab') { // focus blijft in de dialoog
        const k = [...wortel.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter((b) => !b.closest('[hidden]') && b.offsetParent !== null);
        if (!k.length) return;
        const eerste = k[0], laatste = k[k.length - 1];
        if (ev.shiftKey && (document.activeElement === eerste || !wortel.contains(document.activeElement))) { ev.preventDefault(); laatste.focus(); }
        else if (!ev.shiftKey && (document.activeElement === laatste || !wortel.contains(document.activeElement))) { ev.preventDefault(); eerste.focus(); }
      }
    }
    document.addEventListener('keydown', toets, true);
    sluit.addEventListener('click', sluiten);
    open_ = { belofte };

    // ---- 1. Keuze: met of zonder AI ----
    function toonKeuze() {
      fase = 'keuze';
      voet.hidden = true; teller.textContent = ''; ach.kleur(45);
      inhoud.replaceChildren();
      const h = el('h2', 'jaar-titel', `Jouw jaar ${s.label}`); h.id = 'jaar-titel'; h.tabIndex = -1;
      inhoud.append(h, el('p', 'jaar-uitleg', 'Kijk terug op je schooljaar. Alles wordt op jouw computer uitgerekend uit de kaarten die je hebt geopend. Er gaat niets naar een server, tenzij je hieronder zelf voor de AI-terugblik kiest.'));
      const d = aiGegevens(s);
      const blok = el('section', 'jaar-ai'); blok.setAttribute('aria-labelledby', 'jaar-ai-kop');
      const bk = el('h3', '', 'Wil je dat een AI je terugblik schrijft?'); bk.id = 'jaar-ai-kop';
      blok.append(bk, el('p', 'jaar-uitleg jaar-sterk', AI_UITLEG));
      blok.append(el('p', 'jaar-uitleg', 'Er worden alleen deze getallen verstuurd. Geen naam, geen vaknamen, geen school en geen tekst van jou:'));
      const ul = el('ul', 'jaar-voorbeeld'); ul.setAttribute('aria-label', 'De gegevens die worden verstuurd');
      for (const regel of aiVoorbeeld(d)) ul.append(el('li', '', regel));
      blok.append(ul);
      const lab = el('label', 'jaar-vink');
      const vink = el('input'); vink.type = 'checkbox'; vink.id = 'jaar-toestemming';
      lab.append(vink, document.createTextNode(' Ja, ik geef toestemming om precies deze gegevens nu eenmalig te versturen.'));
      const ai = el('button', 'jaar-knop jaar-goud', 'Schrijf mijn terugblik met AI'); ai.type = 'button'; ai.disabled = true;
      let geenAccount = false;
      const accNoot = el('p', 'jaar-uitleg jaar-let', 'Voor de AI-terugblik heb je de vriendenfunctie (met een account) nodig. Je kunt wel de gewone terugblik bekijken.'); accNoot.hidden = true;
      vink.addEventListener('change', () => { ai.disabled = !vink.checked || geenAccount; });
      (async () => {
        let st = null;
        try { st = globalThis.SPOVrienden ? await globalThis.SPOVrienden.laad() : null; } catch (e) { st = null; }
        if (!st) { geenAccount = true; ai.disabled = true; accNoot.hidden = false; }
      })();
      const zonder = el('button', 'jaar-knop', 'Bekijk zonder AI'); zonder.type = 'button';
      const acties = el('div', 'jaar-acties'); acties.append(ai, zonder);
      blok.append(lab, accNoot, acties);
      inhoud.append(blok);
      ai.addEventListener('click', () => { if (vink.checked) wachtrij(d); });
      zonder.addEventListener('click', () => start());
      h.focus();
    }

    // ---- 2. De wachtrij ----
    async function wachtrij(d) {
      fase = 'wacht'; besteld = true; annuleer = false;
      inhoud.replaceChildren();
      const h = el('h2', 'jaar-titel', 'Je terugblik wordt geschreven'); h.id = 'jaar-titel'; h.tabIndex = -1;
      const st = el('p', 'jaar-wacht', 'Je aanvraag wordt verstuurd...'); st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
      const stip = el('span', 'jaar-stip'); stip.setAttribute('aria-hidden', 'true');
      const stop = el('button', 'jaar-knop', 'Toch zonder AI'); stop.type = 'button';
      const acties = el('div', 'jaar-acties'); acties.append(stop);
      inhoud.append(h, stip, st, acties);
      h.focus();
      stop.addEventListener('click', () => { annuleer = true; notitie = ''; start(); });
      const res = await vraagAI(d, {
        geannuleerd: () => annuleer || !document.body.contains(wortel),
        positie: (n, status) => { st.textContent = status === 'bezig' || n <= 1 ? (status === 'bezig' ? 'Je terugblik wordt nu geschreven...' : 'Je bent de volgende in de wachtrij...') : `Je zit in de wachtrij. Er zijn nog ${n - 1} aanvragen voor je.`; },
      });
      if (annuleer || !document.body.contains(wortel)) return;
      if (res.status === 'klaar') {
        const t = schoonAI(res.tekst);
        if (t) tekstBron = { tekst: t, bron: 'ai' };
        else notitie = 'De tekst van de AI kon niet worden gebruikt. Dit is de gewone terugblik.';
        start();
      } else if (res.status === 'limiet') {
        st.textContent = LIMIET_TEKST;
        stop.textContent = 'Bekijk zonder AI';
        stop.focus();
      } else {
        notitie = res.status === 'geen-account' ? 'Je hebt geen account of vriendenfunctie, dus dit is de gewone terugblik zonder AI.'
          : res.status === 'tijd' ? 'Het duurde te lang. Dit is de gewone terugblik zonder AI.' : 'De AI-terugblik werkt nu niet. Dit is de gewone terugblik zonder AI.';
        zetMelding(notitie);
        start();
      }
    }

    // ---- 3. De schermen ----
    function start() {
      fase = 'scherm'; i = 0;
      lijst = schermen(s, tekstBron, notitie);
      voet.hidden = false;
      ga(0);
    }
    function ga(n) {
      if (n < 0 || n >= lijst.length) return;
      i = n;
      const sc = lijst[i];
      ach.kleur(sc.kleur); ach.stoot();
      teller.textContent = `Scherm ${i + 1} van ${lijst.length}`;
      vorige.disabled = i === 0;
      volgende.disabled = i === lijst.length - 1;
      deel.hidden = false;
      inhoud.replaceChildren();
      const h = el('h2', 'jaar-titel', sc.titel); h.id = 'jaar-titel'; h.tabIndex = -1;
      const sec = el('div', 'jaar-scherm' + (rustig ? '' : ' jaar-in'));
      if (sc.groot) { const g = el('p', 'jaar-groot', sc.groot); sec.append(g); if (sc.regel) sec.append(el('p', 'jaar-regel', sc.regel)); }
      if (sc.lijst) { const ul = el('ul', 'jaar-ladder'); sc.lijst.forEach((t) => ul.append(el('li', '', t))); sec.append(ul); }
      if (sc.tekst) { const p = el('p', 'jaar-tekst', sc.tekst); p.dataset.bron = sc.bron; sec.append(p); sec.append(el('p', 'jaar-bron', sc.bron === 'ai' ? 'Geschreven door een AI op basis van je getallen.' : 'Automatisch gemaakt op jouw computer, zonder AI.')); }
      if (sc.uitleg) sec.append(el('p', 'jaar-uitleg', sc.uitleg));
      inhoud.append(h, sec);
      h.focus();
    }
    vorige.addEventListener('click', () => ga(i - 1));
    volgende.addEventListener('click', () => ga(i + 1));
    deel.addEventListener('click', async () => {
      try {
        const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
        tekenDeel(c, deelbaar(s));
        const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
        if (!blob) throw new Error('geen plaatje');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `mijn-jaar-${s.label}.png`;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        zetMelding('Het plaatje is opgeslagen. Er staan geen naam en geen vaknamen op, alleen cijfers en ladders.');
      } catch (e) { zetMelding('Het plaatje maken lukte niet.'); }
    });
    toonKeuze();
    return belofte;
  }

  // ───────── Knoppen in het Overzicht ─────────
  // #b-jaar opent de terugblik; #jaar-aanbod (met #jaar-aanbod-open en #jaar-aanbod-later) verschijnt van 1 juli tot 1 september.
  async function koppel() {
    const knop = document.getElementById('b-jaar');
    if (knop && !knop.dataset.jaar) { knop.dataset.jaar = '1'; knop.addEventListener('click', () => { openJaar(); }); }
    const blok = document.getElementById('jaar-aanbod');
    if (!blok || blok.dataset.jaar) return;
    blok.dataset.jaar = '1';
    const r = await leesAlles([SLEUTEL]);
    const label = aanbod(Date.now(), r[SLEUTEL]);
    blok.hidden = !label;
    const tekst = document.getElementById('jaar-aanbod-tekst');
    if (label && tekst) tekst.textContent = `Het schooljaar ${label} zit erop. Bekijk jouw jaar: je beste kaart, je grootste stijging en meer.`;
    const open = document.getElementById('jaar-aanbod-open'), later = document.getElementById('jaar-aanbod-later');
    if (open) open.addEventListener('click', () => { openJaar(); });
    if (later) later.addEventListener('click', async () => { await uitstellen(); blok.hidden = true; if (knop) knop.focus(); });
  }

  const lib = {
    SLEUTEL, LIMIET_TEKST, AI_UITLEG, CONFIG, MAANDEN, TREDEN, GROEPEN,
    schooljaar, schoonStaat, aanbod, bereken, aiGegevens, aiVoorbeeld, lokaleTekst, schoonAI, schermen, deelbaar, tekenDeel, vraagAI,
    open: openJaar, koppel, uitstellen, markeerGezien,
  };
  globalThis.SPOJaar = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { koppel(); }); else koppel();
  }
})();
