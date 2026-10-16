/*
 * Somtoday Pack Opener v3.0: de tijdcapsule (gedeelde code).
 * Bij een kaart in de galerij schrijf je een korte notitie aan jezelf die pas open kan op een datum die jij kiest
 * (minstens 30 en hoogstens 400 dagen vooruit). Het is een spelletje: de notitie staat gewoon in deze browser, onder
 * de sleutel spo_capsules. Er gaat niets naar een server; wel mee in de versleutelde back-up van je account (account.js).
 *
 * Opslag (chrome.storage.local): spo_capsules  [{ kaartId, tekst, opent, gemaakt, geopend?, gemeld? }]
 *   kaartId  de id van de kaart in de galerij (hoogstens één capsule per kaart)
 *   opent    tijdstip (ms) van middernacht van de gekozen dag
 *   gemaakt  tijdstip waarop je hem schreef;  geopend  tijdstip waarop je hem opende (de animatie is dan geweest);
 *   gemeld   tijdstip van de laatste melding 'je capsule is open' (hoogstens één keer per dag)
 *
 * De regels (datum, tekst) staan hier en werken ook in Node. Het tekstfilter (SPOTekst, tekstfilter.js) wordt gebruikt als het er is.
 * Een melding 'je capsule is open' verschijnt bij het openen van Somtoday (content script) en van de hub (los tabblad).
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  const SLEUTEL = 'spo_capsules';
  const MIN_DAGEN = 30;
  const MAX_DAGEN = 400;
  const MAX_TEKENS = 300;
  const MAX_LIJST = 150; // zoveel kaarten bewaart de galerij ook
  const DAG = 864e5;

  const dagNr = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAG);
  const pad = (n) => String(n).padStart(2, '0');
  const dagTekst = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const vanDagTekst = (t) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t || '')); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null; };
  const plusDagen = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  // ---- de regels ----
  // Het laagste en hoogste toegestane tijdstip voor de openingsdatum, als datum-teksten (voor <input type="date">).
  function grenzen(nu) {
    nu = nu || new Date();
    return { min: dagTekst(plusDagen(nu, MIN_DAGEN)), max: dagTekst(plusDagen(nu, MAX_DAGEN)) };
  }
  // Handige standaard: het eind van het schooljaar (15 juli), of anders over een jaar.
  function standaardDatum(nu) {
    nu = nu || new Date();
    const g = grenzen(nu);
    for (const jaar of [nu.getFullYear(), nu.getFullYear() + 1]) {
      const t = `${jaar}-07-15`;
      if (t >= g.min && t <= g.max) return t;
    }
    return dagTekst(plusDagen(nu, 365));
  }
  // Is deze datum-tekst ('JJJJ-MM-DD') toegestaan? Geeft { ok, reden?, opent? } (opent = ms van middernacht).
  function controleerDatum(tekst, nu) {
    nu = nu || new Date();
    const d = vanDagTekst(tekst);
    if (!d) return { ok: false, reden: 'Kies een datum.' };
    const dagen = dagNr(d) - dagNr(nu);
    if (dagen < MIN_DAGEN) return { ok: false, reden: `De capsule moet minstens ${MIN_DAGEN} dagen dicht blijven.` };
    if (dagen > MAX_DAGEN) return { ok: false, reden: `Kies een datum binnen ${MAX_DAGEN} dagen.` };
    return { ok: true, opent: d.getTime() };
  }
  // De tekst: opschonen, lengte en het tekstfilter (streng). Geeft { ok, schoon, reden? }.
  function controleerTekst(tekst) {
    const schoon = String(tekst == null ? '' : tekst).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!schoon) return { ok: false, schoon, reden: 'Schrijf eerst een korte notitie.' };
    if (schoon.length > MAX_TEKENS) return { ok: false, schoon, reden: `Maximaal ${MAX_TEKENS} tekens.` };
    const F = globalThis.SPOTekst;
    if (F && typeof F.controleer === 'function') {
      const r = F.controleer(schoon, { max: MAX_TEKENS, soort: 'tekst' });
      if (r && r.ok === false) return { ok: false, schoon, reden: r.melding || 'Deze tekst kan niet. Kies andere woorden.' };
      if (r && typeof r.schoon === 'string' && r.schoon) return { ok: true, schoon: r.schoon.slice(0, MAX_TEKENS) };
    }
    // Is het filter in een echte pagina niet geladen, dan weigeren we liever dan dat er ongefilterde tekst wordt bewaard.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') return { ok: false, schoon, reden: 'Het tekstfilter is niet geladen. Probeer de pagina te verversen.' };
    return { ok: true, schoon };
  }
  const isOpen = (c, nu) => !!c && (nu == null ? Date.now() : +nu) >= c.opent;
  const dagenTot = (c, nu) => Math.max(0, dagNr(new Date(c.opent)) - dagNr(nu || new Date()));

  // ---- opslag (schrijfacties één voor één, zodat er niets kwijtraakt) ----
  async function leesRuw() {
    if (heeftOpslag) return (await api.storage.local.get(SLEUTEL))[SLEUTEL];
    try { const t = globalThis.localStorage.getItem(SLEUTEL); return t ? JSON.parse(t) : undefined; } catch (e) { return undefined; }
  }
  async function schrijfRuw(lijst) {
    if (heeftOpslag) await api.storage.local.set({ [SLEUTEL]: lijst });
    else globalThis.localStorage.setItem(SLEUTEL, JSON.stringify(lijst));
  }
  const tijd = (x) => (Number.isFinite(x) && x > 0 && x < 4.1e12 ? Math.floor(x) : 0);
  // Houdt alleen geldige capsules over; per kaart de nieuwste.
  function schoonLijst(a) {
    const per = new Map();
    for (const c of Array.isArray(a) ? a : []) {
      if (!c || typeof c.kaartId !== 'string' || !c.kaartId || c.kaartId.length > 80 || typeof c.tekst !== 'string' || !tijd(c.opent)) continue;
      const x = { kaartId: c.kaartId, tekst: c.tekst.slice(0, MAX_TEKENS), opent: tijd(c.opent), gemaakt: tijd(c.gemaakt) };
      if (tijd(c.geopend)) x.geopend = tijd(c.geopend);
      if (tijd(c.gemeld)) x.gemeld = tijd(c.gemeld);
      const oud = per.get(x.kaartId);
      if (!oud || x.gemaakt > oud.gemaakt) per.set(x.kaartId, x);
    }
    return [...per.values()].sort((a, b) => b.gemaakt - a.gemaakt).slice(0, MAX_LIJST);
  }
  let ketting = Promise.resolve();
  function werk(fn) {
    const taak = ketting.then(async () => {
      const lijst = schoonLijst(await leesRuw());
      const uit = await fn(lijst);
      await schrijfRuw(lijst);
      return uit;
    });
    ketting = taak.catch(() => {});
    return taak;
  }
  const lijst = async () => schoonLijst(await leesRuw());

  // Bewaart een nieuwe capsule voor een kaart (vervangt een bestaande, mits die nog niet open is). Geeft { ok, capsule } of { ok:false, reden }.
  function maak(kaartId, tekst, datum, nu) {
    nu = nu || new Date();
    const d = controleerDatum(datum, nu);
    if (!d.ok) return Promise.resolve(d);
    const t = controleerTekst(tekst);
    if (!t.ok) return Promise.resolve(t);
    if (typeof kaartId !== 'string' || !kaartId || kaartId.length > 80) return Promise.resolve({ ok: false, reden: 'Onbekende kaart.' });
    return werk((l) => {
      const i = l.findIndex((c) => c.kaartId === kaartId);
      if (i >= 0 && isOpen(l[i], nu.getTime())) return { ok: false, reden: 'Deze capsule is al open. Gooi hem eerst weg om een nieuwe te maken.' };
      const c = { kaartId, tekst: t.schoon, opent: d.opent, gemaakt: nu.getTime() };
      if (i >= 0) l.splice(i, 1);
      l.unshift(c);
      return { ok: true, capsule: c };
    });
  }
  // Gooit de capsule van een kaart weg (de aanroeper vraagt eerst om bevestiging).
  function weg(kaartId) {
    return werk((l) => { const i = l.findIndex((c) => c.kaartId === kaartId); if (i >= 0) l.splice(i, 1); return i >= 0; });
  }
  // Opent de capsule (alleen op of na de datum). Geeft de capsule terug, of null als het nog niet kan.
  function openen(kaartId, nu) {
    return werk((l) => {
      const c = l.find((x) => x.kaartId === kaartId);
      if (!c || !isOpen(c, nu)) return null;
      if (!c.geopend) c.geopend = nu == null ? Date.now() : +nu;
      return Object.assign({}, c);
    });
  }
  // Capsules die open kunnen en waarover we je nog moeten vertellen (hoogstens één keer per dag per capsule).
  const meldbaar = (l, nu) => l.filter((c) => isOpen(c, nu) && !c.geopend && (!c.gemeld || nu - c.gemeld > 20 * 3600 * 1000));

  // ---- melding bij het openen van Somtoday of de hub ----
  let host = null;
  function toonMelding(n) {
    if (!document.body) return;
    if (host) host.remove();
    host = document.createElement('spo-capsule-melding');
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483640;display:block;width:min(360px,calc(100vw - 32px));';
    const w = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      .m { display: flex; gap: 12px; align-items: center; padding: 12px 12px 12px 14px; border-radius: 14px; color: #fff; background: #14162a; border: 1px solid #9ad7ff;
        box-shadow: 0 12px 34px rgba(0,0,0,.55); font: 600 14px/1.35 system-ui, sans-serif; cursor: pointer; animation: erin .4s cubic-bezier(.2,1.3,.4,1); }
      .i { font-size: 26px; line-height: 1; }
      .t { flex: 1; } .s { display: block; font-weight: 400; font-size: 12px; opacity: .75; margin-top: 2px; }
      button { background: none; border: 0; color: #fff; opacity: .6; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px; }
      button:hover, button:focus-visible { opacity: 1; }
      @keyframes erin { from { opacity: 0; transform: translateY(20px); } }
      @media (prefers-reduced-motion: reduce) { .m { animation: none; } }`;
    const m = document.createElement('div'); m.className = 'm'; m.setAttribute('role', 'status');
    const i = document.createElement('span'); i.className = 'i'; i.setAttribute('aria-hidden', 'true'); i.textContent = '⏳';
    const t = document.createElement('span'); t.className = 't';
    t.textContent = n === 1 ? 'Een tijdcapsule is open!' : n + ' tijdcapsules zijn open!';
    const s = document.createElement('span'); s.className = 's'; s.textContent = 'Klik om je galerij te openen.'; t.append(s);
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Sluiten'); x.textContent = '×';
    const sluit = () => { if (host) { host.remove(); host = null; } };
    x.addEventListener('click', (e) => { e.stopPropagation(); sluit(); });
    m.addEventListener('click', () => {
      sluit();
      // op Somtoday: het paneel met de galerij (net als bij de andere meldingen); anders het galerij-tabblad zelf
      if (/(^|\.)somtoday\.nl$/.test(location.hostname)) document.dispatchEvent(new CustomEvent('spo-open-tab', { detail: 'galerij' }));
      else if (api && api.runtime && api.runtime.getURL) window.open(api.runtime.getURL('galerij.html'), '_blank');
    });
    m.append(i, t, x);
    w.append(st, m);
    document.documentElement.appendChild(host);
    setTimeout(sluit, 20000);
  }
  // Kijkt of er een capsule open kan en toont dan één melding (en onthoudt dat, zodat hij niet bij elke pagina terugkomt).
  async function meldOpen(nu) {
    nu = nu == null ? Date.now() : +nu;
    const uit = await werk(async (l) => {
      const m = meldbaar(l, nu);
      if (!m.length) return [];
      // alleen capsules waarvan de kaart nog in de galerij staat (anders is er niets om te openen)
      let ids = null;
      try {
        const g = heeftOpslag ? (await api.storage.local.get('spo_galerij')).spo_galerij : JSON.parse(globalThis.localStorage.getItem('spo_galerij') || 'null');
        if (Array.isArray(g)) ids = new Set(g.map((e) => e && e.id));
      } catch (e) { /* geen galerij te lezen: dan melden we gewoon */ }
      const echt = m.filter((c) => !ids || ids.has(c.kaartId));
      for (const c of echt) c.gemeld = nu;
      return echt.map((c) => c.kaartId);
    });
    return uit;
  }
  function startMelding() {
    if (window !== window.top || window.__spoCapsuleMelding || /galerij\.html$/.test(location.pathname)) return;
    window.__spoCapsuleMelding = true;
    setTimeout(async () => {
      try { const l = await meldOpen(); if (l.length) toonMelding(l.length); } catch (e) { /* een extraatje: nooit storen */ }
    }, 4000);
  }

  const lib = { SLEUTEL, MIN_DAGEN, MAX_DAGEN, MAX_TEKENS, grenzen, standaardDatum, controleerDatum, controleerTekst, isOpen, dagenTot, schoonLijst, lijst, maak, weg, openen, meldbaar, meldOpen, toonMelding, dagTekst };
  globalThis.SPOCapsule = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && !globalThis.__SPO_TEST_ZONDER_START) startMelding();
})();
