/*
 * Somtoday Pack Opener v3.0: de vloek opheffen.
 * Een vervloekte kaart (onvoldoende met een vloek) wordt opgeheven als je later in HETZELFDE vak een voldoende opent.
 *   - Voldoende: een cijfer van 5,5 of hoger (HEEL_VANAF). Dat is dezelfde grens als 'voldoende' overal in de extensie.
 *     De geheime prestatie 'Heel gemaakt' blijft strenger (een 8 of hoger) en wordt hier niet veranderd: de kaart blijft
 *     gewoon als vervloekt gemarkeerd (vloek: true), zodat die prestatie klopt. De kaart krijgt er `heel` bij (tijdstip).
 *   - Per nieuwe voldoende kaart wordt hoogstens één vervloekte kaart opgeheven (de oudste die nog vervloekt is).
 *   - De nieuwe kaart moet echt nieuw zijn (niet een kaart die je opnieuw opent) en later dan de vervloekte kaart.
 *   - Een opgeheven kaart is sterker in duels: één trede hoger (zie gevecht.js, k.h) en de vloek keert zich niet meer tegen je.
 * Opslag (alleen in deze browser):
 *   spo_heel  { [kaartId]: { ts, door } }   welke kaart wanneer en door welke kaart is opgeheven (gaat mee in de back-up)
 *   spo_galerij  de opgeheven kaart krijgt `heel: ts`; de rest van het veld blijft zoals het was
 * Er staat geen vaknaam of ander persoonlijk gegeven in spo_heel: alleen kaart-id's.
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  const SLEUTEL = 'spo_heel';
  const GALERIJ = 'spo_galerij';
  const HEEL_VANAF = 5.5;

  const vakSleutel = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  // Pure keuze (te testen): welke vervloekte kaart wordt door deze nieuwe kaart opgeheven? Geeft het id of null.
  // galerij: lijst kaarten ({ id, ts, vak, cijfer, vloek, heel }), nieuw: { id, ts, vak, cijfer }, heel: de map uit spo_heel.
  function kiesVloek(galerij, nieuw, heel) {
    if (!nieuw || !Number.isFinite(nieuw.cijfer) || nieuw.cijfer < HEEL_VANAF || !Number.isFinite(nieuw.ts)) return null;
    const h = obj(heel);
    let beste = null;
    for (const e of Array.isArray(galerij) ? galerij : []) {
      if (!e || e.vloek !== true || e.id === nieuw.id || h[e.id] || e.heel > 0) continue;
      if (!(e.ts < nieuw.ts) || vakSleutel(e.vak) !== vakSleutel(nieuw.vak)) continue;
      if (!beste || e.ts < beste.ts) beste = e;
    }
    return beste ? beste.id : null;
  }

  async function leesAlles(sleutels) {
    if (heeftOpslag) return api.storage.local.get(sleutels);
    const r = {};
    for (const s of sleutels) { try { const t = globalThis.localStorage.getItem(s); if (t) r[s] = JSON.parse(t); } catch (e) { /* leeg */ } }
    return r;
  }
  async function schrijfAlles(o) {
    if (heeftOpslag) return api.storage.local.set(o);
    for (const [s, w] of Object.entries(o)) globalThis.localStorage.setItem(s, JSON.stringify(w));
  }
  // Eén taak tegelijk, zodat twee kaarten kort na elkaar niet dezelfde vloek opheffen.
  let ketting = Promise.resolve();

  // Probeert met een net geopende kaart een vloek op te heffen. opties.eerder = true: de kaart stond al in de galerij (opnieuw geopend): dan niets.
  // Geeft { ok:true, id, vak, cijfer } (de opgeheven kaart) of { ok:false }.
  function na(nieuw, opties) {
    const taak = ketting.then(async () => {
      if (!nieuw || typeof nieuw.id !== 'string' || (opties && opties.eerder)) return { ok: false };
      const r = await leesAlles([GALERIJ, SLEUTEL]);
      const gal = Array.isArray(r[GALERIJ]) ? r[GALERIJ] : [];
      const heel = Object.assign({}, obj(r[SLEUTEL]));
      const id = kiesVloek(gal, nieuw, heel);
      if (!id) return { ok: false };
      const ts = Date.now();
      heel[id] = { ts, door: nieuw.id.slice(0, 60) };
      const lijst = gal.map((e) => (e && e.id === id ? Object.assign({}, e, { heel: ts }) : e));
      const kaart = gal.find((e) => e && e.id === id);
      await schrijfAlles({ [SLEUTEL]: heel, [GALERIJ]: lijst });
      return { ok: true, id, vak: kaart ? String(kaart.vak || '') : '', cijfer: kaart ? kaart.cijfer : 0 };
    });
    ketting = taak.catch(() => {});
    return taak;
  }

  // ───────── Korte animatie en toast (alleen in het Somtoday-venster) ─────────
  let host = null;
  const fmt = (c) => String(Math.round(c * 10) / 10).replace('.', ',');
  function toon(uit, opties) {
    if (typeof document === 'undefined' || !document.body) return;
    if (host) host.remove();
    const stil = !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    host = document.createElement('spo-heel');
    host.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;display:block;width:min(380px,calc(100vw - 24px));';
    const w = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `
      .k { display: flex; gap: 12px; align-items: flex-start; padding: 12px 12px 12px 14px; border-radius: 16px; color: #eef1f8; background: #14182e;
        border: 1px solid rgba(120,230,170,.6); box-shadow: 0 16px 40px -8px rgba(0,0,0,.75), 0 0 28px rgba(120,230,170,.25); font: 600 14px/1.35 system-ui, sans-serif; animation: erin .45s cubic-bezier(.2,1.2,.4,1); }
      .i { font-size: 28px; line-height: 1; animation: gloei 1.6s ease-in-out .3s 2; }
      .t { flex: 1; min-width: 0; }
      .kop { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #7be6aa; font-weight: 800; }
      .z { margin: 3px 0 4px; font-size: 15px; font-weight: 700; }
      .o { font-size: 12.5px; font-weight: 500; color: #a5aec4; }
      button { flex: none; background: none; border: 0; color: #fff; opacity: .6; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 2px; }
      button:hover, button:focus-visible { opacity: 1; }
      .k.weg { animation: uit .3s ease forwards; }
      @keyframes erin { from { opacity: 0; transform: translateY(24px); } }
      @keyframes uit { to { opacity: 0; transform: translateY(24px); } }
      @keyframes gloei { 0%, 100% { transform: none; filter: none; } 50% { transform: scale(1.25) rotate(8deg); filter: drop-shadow(0 0 8px #7be6aa); } }
      ${stil ? '.k, .i, .k.weg { animation: none; }' : ''}`;
    const k = document.createElement('div'); k.className = 'k'; k.setAttribute('role', 'status');
    const i = document.createElement('span'); i.className = 'i'; i.setAttribute('aria-hidden', 'true'); i.textContent = '✨';
    const t = document.createElement('div'); t.className = 't';
    const kop = document.createElement('div'); kop.className = 'kop'; kop.textContent = 'Vloek opgeheven';
    const z = document.createElement('div'); z.className = 'z'; z.textContent = 'De vloek is weg!';
    const o = document.createElement('div'); o.className = 'o';
    o.textContent = `Je vervloekte kaart${uit.vak ? ' van ' + uit.vak : ''}${uit.cijfer ? ' (' + fmt(uit.cijfer) + ')' : ''} is weer heel en sterker in duels.`;
    t.append(kop, z, o);
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Sluiten'); x.textContent = '×';
    const mijn = host;
    const weg = () => { k.classList.add('weg'); setTimeout(() => { if (host === mijn) { host.remove(); host = null; } }, stil ? 0 : 300); };
    x.addEventListener('click', weg);
    k.append(i, t, x);
    w.append(st, k);
    document.documentElement.appendChild(host);
    setTimeout(weg, 9000);
  }

  // Voor content.js: probeert op te heffen en laat zien dat het gelukt is.
  async function naEnToon(nieuw, opties) {
    let uit;
    try { uit = await na(nieuw, opties); } catch (e) { return { ok: false }; }
    if (uit && uit.ok) { try { toon(uit); } catch (e) { /* geen toast is ook goed */ } }
    return uit;
  }

  globalThis.SPOHeel = { SLEUTEL, HEEL_VANAF, kiesVloek, na, naEnToon, toon };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.SPOHeel;
})();
