/*
 * Somtoday Pack Opener v3.0 (content script): "Je week in 10 seconden".
 * Op maandag (de eerste keer dat je die dag Somtoday opent), of als je 7 dagen of langer geen overzicht kreeg, laat een klein
 * venster zien wat er de week ervoor gebeurde. Alles komt uit gegevens in deze browser; er gaat niets naar een server.
 *
 * Opslag (chrome.storage.local): spo_weekoverzicht  'JJJJ-MM-DD'  de dag waarop het overzicht voor het laatst verscheen (verder niets).
 * Instelling: spo_instellingen.weekoverzicht (standaard aan; 'Weekoverzicht tonen' in de hub-instellingen).
 * Gelezen: spo_galerij, spo_gevechten, spo_huisdier. Is er niets te melden, dan verschijnt er niets.
 * De logica (moetTonen, venster, samenvatting) werkt zonder DOM en is te testen in Node.
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  const SLEUTEL = 'spo_weekoverzicht';
  const TREDE_NAAM = ['', 'Zeldzaam', 'Glim', 'Kosmisch', 'Mythisch'];

  const dagTekst = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dagNr = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  const dagVanTekst = (t) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t || '')); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; };
  const tredeVan = (e) => Math.max(0, Math.min(4, (e && e.trede) | 0)) || (e && e.zeldzaam === true ? 1 : 0);
  const fmt = (c) => String(Math.round(c * 10) / 10).replace('.', ',');

  // Moet het overzicht nu verschijnen? laatste = 'JJJJ-MM-DD' of ''.
  //  - nooit: alleen op maandag;  - vandaag al gehad: nee;  - 7 dagen of meer geleden: ja, op elke dag;  - anders: op maandag.
  function moetTonen(nu, laatste, aan) {
    if (aan === false) return false;
    const vandaag = dagNr(nu);
    const l = dagVanTekst(laatste);
    const maandag = nu.getDay() === 1;
    if (l == null) return maandag;
    if (l >= vandaag) return false; // vandaag al gehad (of de klok staat terug)
    return maandag || vandaag - l >= 7;
  }
  // De 7 dagen voor vandaag: op maandag precies de vorige week (maandag t/m zondag).
  function venster(nu) {
    const tot = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
    const van = new Date(tot.getFullYear(), tot.getMonth(), tot.getDate() - 7);
    return { van: van.getTime(), tot: tot.getTime() };
  }
  // Wat er in dat venster gebeurde, of null als er niets te melden is.
  // huisdier: { xp } en H: SPOHuisdier-hulpfuncties { xpVoor, stadiumVan, STADIA } (mogen ontbreken).
  function samenvatting(gal, gev, huisdier, v, H) {
    const kaarten = (Array.isArray(gal) ? gal : []).filter((e) => e && Number.isFinite(e.cijfer) && Number.isFinite(e.ts) && e.ts >= v.van && e.ts < v.tot);
    let w = 0, l = 0, g = 0;
    if (gev && typeof gev === 'object' && !Array.isArray(gev)) {
      for (const lijst of Object.values(gev)) for (const x of Array.isArray(lijst) ? lijst : []) {
        if (!x || !Number.isFinite(x.ts) || x.ts < v.van || x.ts >= v.tot || !Number.isFinite(x.mijn) || !Number.isFinite(x.hun)) continue;
        if (x.mijn > x.hun) w++; else if (x.mijn < x.hun) l++; else g++;
      }
    }
    if (!kaarten.length && !w && !l && !g) return null;
    const uit = { kaarten: kaarten.length, beste: null, trede: 0, w, v: l, g, xp: 0, stadium: null };
    for (const e of kaarten) {
      if (!uit.beste || e.cijfer > uit.beste.cijfer) uit.beste = { vak: String(e.vak || '').slice(0, 40), cijfer: e.cijfer };
      uit.trede = Math.max(uit.trede, tredeVan(e));
    }
    if (H && H.xpVoor && kaarten.length) {
      uit.xp = kaarten.reduce((a, e) => a + H.xpVoor(e.cijfer, tredeVan(e)), 0);
      const totaal = huisdier && Number.isFinite(huisdier.xp) ? huisdier.xp : 0;
      if (totaal >= uit.xp && H.stadiumVan(totaal) > H.stadiumVan(totaal - uit.xp)) uit.stadium = H.STADIA[H.stadiumVan(totaal)].naam;
    }
    return uit;
  }
  // De regels die in het venster komen (gewone tekst, geen html).
  function regels(s) {
    const r = [];
    if (s.kaarten) r.push(['\u{1F0CF}', `${s.kaarten} ${s.kaarten === 1 ? 'kaart' : 'kaarten'} geopend`]);
    if (s.beste) r.push(['⭐', `Beste kaart: ${s.beste.vak}, ${fmt(s.beste.cijfer)}`]);
    if (s.trede) r.push(['\u{1F48E}', `Hoogste trede: ${TREDE_NAAM[s.trede].toLowerCase()}`]);
    if (s.w || s.v || s.g) r.push(['⚔️', `Gevechten: ${s.w} gewonnen, ${s.v} verloren${s.g ? ', ' + s.g + ' gelijk' : ''}`]);
    if (s.xp) r.push(['\u{1F409}', `Huisdier: +${s.xp} XP${s.stadium ? ', nu een ' + s.stadium.toLowerCase() : ''}`]);
    return r;
  }

  // ---- opslag ----
  async function lees(sleutels) {
    if (heeftOpslag) return api.storage.local.get(sleutels);
    const r = {};
    for (const s of [].concat(sleutels)) { try { const t = localStorage.getItem(s); if (t) r[s] = JSON.parse(t); } catch (e) { /* leeg */ } }
    return r;
  }
  async function schrijf(o) {
    if (heeftOpslag) return api.storage.local.set(o);
    for (const [s, w] of Object.entries(o)) localStorage.setItem(s, JSON.stringify(w));
  }

  // ---- het venster ----
  let host = null;
  function toon(s) {
    if (!document.body) return;
    if (host) host.remove();
    host = document.createElement('spo-week');
    host.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483645;display:block;width:min(380px,calc(100vw - 24px));';
    const w = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      .k { padding: 14px 14px 12px 16px; border-radius: 18px; color: #eef1f8; background: linear-gradient(160deg, #1a2160, #101428 70%);
        border: 1px solid rgba(255,210,74,.5); box-shadow: 0 18px 44px -8px rgba(0,0,0,.75); font: 600 14px/1.35 system-ui, sans-serif; animation: erin .45s cubic-bezier(.2,1.2,.4,1); }
      .kop { display: flex; align-items: flex-start; gap: 10px; }
      .kop div { flex: 1; }
      .klein { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #ffd24a; font-weight: 800; }
      h2 { margin: 2px 0 0; font-size: 19px; font-weight: 800; }
      ul { list-style: none; margin: 10px 0 6px; padding: 0; display: grid; gap: 7px; }
      li { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.07); font-size: 14px; font-weight: 600; }
      li span { font-size: 18px; line-height: 1; flex: none; }
      .v { margin: 6px 0 0; font-size: 11.5px; font-weight: 400; color: #8f99b3; }
      button { flex: none; background: none; border: 0; color: #fff; opacity: .6; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px; }
      button:hover, button:focus-visible { opacity: 1; }
      .k.weg { animation: uit .3s ease forwards; }
      @keyframes erin { from { opacity: 0; transform: translateY(-16px); } }
      @keyframes uit { to { opacity: 0; transform: translateY(-16px); } }
      @media (prefers-reduced-motion: reduce) { .k, .k.weg { animation: none; } }`;
    const k = document.createElement('div'); k.className = 'k'; k.setAttribute('role', 'status');
    const kop = document.createElement('div'); kop.className = 'kop';
    const kt = document.createElement('div');
    const kl = document.createElement('div'); kl.className = 'klein'; kl.textContent = 'Vorige week';
    const h = document.createElement('h2'); h.textContent = 'Je week in 10 seconden';
    kt.append(kl, h);
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Sluiten'); x.textContent = '×';
    kop.append(kt, x);
    const ul = document.createElement('ul');
    for (const [ic, t] of regels(s)) {
      const li = document.createElement('li');
      const i = document.createElement('span'); i.setAttribute('aria-hidden', 'true'); i.textContent = ic;
      li.append(i, document.createTextNode(t)); ul.append(li);
    }
    const v = document.createElement('p'); v.className = 'v'; v.textContent = 'Berekend op jouw computer. Uitzetten kan bij Instellingen.';
    k.append(kop, ul, v);
    w.append(st, k);
    document.documentElement.appendChild(host);
    const mijn = host;
    const weg = () => { k.classList.add('weg'); setTimeout(() => { if (host === mijn) { mijn.remove(); host = null; } }, 300); };
    x.addEventListener('click', weg);
    setTimeout(weg, 30000);
  }

  // Kijkt of het overzicht moet verschijnen en bewaart dan de datum. Geeft de samenvatting terug (of null).
  async function controleer(nu) {
    nu = nu || new Date();
    const r = await lees([SLEUTEL, 'spo_instellingen', 'spo_galerij', 'spo_gevechten', 'spo_huisdier']);
    const inst = r.spo_instellingen && typeof r.spo_instellingen === 'object' ? r.spo_instellingen : {};
    if (!moetTonen(nu, typeof r[SLEUTEL] === 'string' ? r[SLEUTEL] : '', inst.weekoverzicht !== false)) return null;
    await schrijf({ [SLEUTEL]: dagTekst(nu) }); // meteen bewaren: één keer per week, ook als er niets te melden is
    return samenvatting(r.spo_galerij, r.spo_gevechten, r.spo_huisdier, venster(nu), globalThis.SPOHuisdier);
  }
  // Wacht tot de dagelijkse beloning weg is (dat venster staat er al), zodat ze elkaar niet overlappen.
  function start() {
    if (window !== window.top || window.__spoWeek) return;
    window.__spoWeek = true;
    setTimeout(async () => {
      try {
        let s = null;
        for (let i = 0; i < 30 && document.querySelector('spo-dagelijks'); i++) await new Promise((ok) => setTimeout(ok, 2000));
        s = await controleer();
        if (s) toon(s);
      } catch (e) { /* een extraatje: nooit storen */ }
    }, 5000);
  }

  const lib = { SLEUTEL, moetTonen, venster, samenvatting, regels, controleer, toon, dagTekst };
  globalThis.SPOWeek = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && !globalThis.__SPO_TEST_ZONDER_START) start();
})();
