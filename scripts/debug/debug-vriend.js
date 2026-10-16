/*
 * Somtoday Pack Opener DEBUG-BUILD: de NEP-VRIEND (alleen in de debug-zip, zie scripts/package-debug.sh).
 *
 * Doel: duel, meekijken en tweelingkaart testen zonder tweede account en zonder server. Dit bestand wordt in vrienden.html en team.html
 * geladen, direct na vriendenlib.js (en dus voor vrienden.js, team.js en tweeling.js), en in debug.html (daar alleen als hulpbestand).
 *
 * Het doet pas iets als in het Testmenu de nep-vriend-modus aan staat (spo_debug.nepVriend === true). Dan geldt in die twee pagina's:
 *   - SPOVrienden.laad() geeft een NEP-ACCOUNT terug (bewaard onder spo_debug_nep_st): jouw echte account (spo_vrienden) blijft onaangeroerd
 *     en wordt niet gelezen of overschreven. Er is precies een vriend: de Nep-vriend, die jouw kaarten mag zien.
 *   - Het nep-account heeft als server https://nep.invalid. Dat bestaat niet, dus zelfs als er per ongeluk iets over het netwerk wil, gaat er niets
 *     naar een echte server. De functies die normaal de server vragen (live ophalen, berichten sturen en ophalen, delen, vriend maken enz.) zijn vervangen.
 *   - Berichten aan de Nep-vriend (duel, meekijken, tweelingkaart) gaan niet over een lijn maar naar het "brein" hieronder; berichten van de
 *     Nep-vriend komen uit een geheugenlijstje of uit spo_debug_nep.inbox (daar zet het Testmenu uitnodigingen en voorstellen in).
 * Het brein speelt een duel volgens dezelfde regels als de computer-tegenstander (vastlegging, schot, onthulling), kijkt op verzoek mee
 * (sd_mee) en stuurt emoji (sd_emoji), en antwoordt op tweelingvoorstellen (ja, nee of niets).
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const S = api && api.storage && api.storage.local;
  const NEP_ID = 'deadbeefdeadbeefdeadbeefdeadbeef';
  const EIGEN_ID = 'feedfacefeedfacefeedfacefeedface';
  const SL_ST = 'spo_debug_nep_st';   // het nep-account (geschreven door de pagina's)
  const SL_MENU = 'spo_debug_nep';    // { inbox:[{seq,ts,m}], uitdagingen:{ [mid]: { nonce } } } (geschreven door het Testmenu)
  const DAG = 864e5;
  const get = async (k) => (S ? (await S.get(k))[k] : undefined);
  const zet = (o) => S.set(o);
  const tierVan = (c) => (c >= 9.95 ? 4 : c >= 9 ? 3 : c >= 7 ? 2 : c >= 5.5 ? 1 : 0);

  // ───────── hulpmiddelen (ook voor het Testmenu) ─────────
  function nepTeam() {
    const G = globalThis.SPOGevecht, L = globalThis.SPOVrienden;
    const kaarten = [['Wiskunde', 8.2], ['Engels', 7.6], ['Nederlands', 6.9], ['Natuurkunde', 7.4], ['Geschiedenis', 8.8], ['Biologie', 6.4]].map(([vak, c], i) => ({
      vak, cijfer: c, tier: tierVan(c), z: i === 4, t: i === 4 ? 1 : 0, v: false, h: false,
    }));
    const t = { kaarten };
    if (G && G.chemie && G.ordenTeam) t.ch = G.chemie(G.ordenTeam(kaarten.map((k) => Object.assign({}, k)), 0)).score;
    return (L && L.schoonTeam && L.schoonTeam(t)) || t;
  }
  function nepBlob() {
    const L = globalThis.SPOVrienden, nu = Date.now();
    const kaarten = [['Wiskunde', 7.4], ['Engels', 6.8], ['Geschiedenis', 8.1]].map(([vak, cijfer], i) => ({ id: 'nep' + i, vak, cijfer, onderwerp: 'Nep-toets ' + (i + 1), weging: 1, ts: nu - (i + 1) * DAG, tier: tierVan(cijfer) }));
    const ruw = { v: 1, ts: nu, kaarten, reacties: {}, raden: [], gokken: {}, team: nepTeam(), top: [] };
    return (L && L.schoonBlob && L.schoonBlob(ruw)) || { ts: nu, kaarten, reacties: {}, raden: [], gokken: {}, team: nepTeam(), top: [] };
  }
  // Zet een bericht van de Nep-vriend in de inbox van het Testmenu (een pagina met de nep-vriend pakt hem binnen een seconde op).
  async function zendNaarMij(m, extra) {
    const d = Object.assign({ inbox: [], uitdagingen: {} }, await get(SL_MENU));
    const nu = Date.now();
    const lijst = (Array.isArray(d.inbox) ? d.inbox : []).filter((b) => b && nu - b.ts < 240000).slice(-30);
    lijst.push({ seq: Math.max(nu, lijst.length ? lijst[lijst.length - 1].seq + 1 : 0), ts: nu, m });
    d.inbox = lijst;
    if (extra && extra.uitdaging) d.uitdagingen = Object.assign({}, d.uitdagingen, { [m.mid]: { nonce: m.nonce, ts: nu } });
    await zet({ [SL_MENU]: d });
  }
  const lib = globalThis.__spoDebugNepVriend = { NEP_ID, EIGEN_ID, SL_ST, SL_MENU, nepTeam, nepBlob, zendNaarMij };

  // Op debug.html (en andere pagina's met de testvlag) alleen de hulpmiddelen; geen vervangingen.
  const L = globalThis.SPOVrienden;
  if (!L || globalThis.__SPO_TEST_ZONDER_START || !S) return;

  // ───────── het nep-account ─────────
  let aan = false;
  async function nepSt() {
    let st = await get(SL_ST);
    if (!st || typeof st !== 'object' || st.nep !== true || !Array.isArray(st.vrienden)) {
      st = { nep: true, server: 'https://nep.invalid', id: EIGEN_ID, token: 'nep', privJwk: null, pub: 'nep-eigen', vrienden: [], reacties: {}, gokken: {}, raden: [] };
    }
    if (!st.vrienden.some((v) => v.id === NEP_ID)) st.vrienden.push({ id: NEP_ID, pub: 'nep-vriend', alias: 'Nep-vriend', status: 'vriend', deel: { modus: 'alles', ids: [] } });
    for (const sl of ['reacties', 'gokken']) if (!st[sl] || typeof st[sl] !== 'object' || Array.isArray(st[sl])) st[sl] = {};
    if (!Array.isArray(st.raden)) st.raden = [];
    return st;
  }
  const orig = {};
  const isNep = (st) => !!(st && st.nep === true);
  const wikkel = (naam, fn) => { orig[naam] = L[naam]; L[naam] = function () { return fn.apply(this, arguments); }; };

  wikkel('laad', async function () {
    const d = (await get('spo_debug')) || {};
    aan = d.nepVriend === true;
    return aan ? nepSt() : orig.laad.apply(L, arguments);
  });
  wikkel('bewaar', function (st) { return isNep(st) ? zet({ [SL_ST]: JSON.parse(JSON.stringify(st)) }) : orig.bewaar.apply(L, arguments); });

  // Alles wat de server zou vragen: bij het nep-account lokaal afgehandeld of geweigerd (nooit naar het netwerk).
  const stil = async () => undefined;
  const nietHier = (wat) => async () => { throw new Error(`${wat} kan niet met de nep-vriend (testmodus). Zet de nep-vriend-modus uit in het Testmenu voor het echte werk.`); };
  for (const [naam, nep] of [
    ['zetBlob', stil], ['zetBlobs', stil], ['stuurGG', stil], ['stuurKijk', async () => 0], ['stuurKijkEmoji', async () => 0],
    ['verzoek', nietHier('Een vriend toevoegen')], ['antwoord', nietHier('Een verzoek beantwoorden')], ['verwijderVriend', nietHier('Een vriend verwijderen')],
    ['verwijderAccount', nietHier('Het account wissen')], ['blokkeer', nietHier('Blokkeren')], ['deblokkeer', nietHier('Deblokkeren')], ['meld', nietHier('Melden')],
    ['haalWaarschuwingen', async () => []], ['waarschuwingGezien', stil], ['dropTelling', async () => ({ aantal: 0 })], ['dropMeld', stil],
  ]) {
    if (typeof L[naam] !== 'function') continue;
    wikkel(naam, function (st) { return isNep(st) ? nep.apply(L, arguments) : orig[naam].apply(L, arguments); });
  }
  wikkel('synchroniseer', async function (st) {
    if (!isNep(st)) return orig.synchroniseer.apply(L, arguments);
    return { meldingen: [], kaarten: { [NEP_ID]: nepBlob() } };
  });

  // ───────── berichten ─────────
  const mem = [];
  let memSeq = 0;
  const volg = () => (memSeq = Math.max(memSeq + 1, Date.now()));
  const duw = (m, na) => { const f = () => { mem.push({ seq: volg(), ts: Date.now(), m }); }; if (na) setTimeout(f, na); else f(); };

  async function nepHaal(v, cursor) {
    if (!v || v.id !== NEP_ID) return [];
    const na = cursor[v.id] || 0, nu = Date.now();
    const menu = (await get(SL_MENU)) || {};
    const uit = [];
    for (const b of Array.isArray(menu.inbox) ? menu.inbox : []) if (b && b.seq > na && nu - b.ts < 570000) uit.push({ seq: b.seq, leeftijd: Math.max(0, Math.floor((nu - b.ts) / 1000)), m: b.m });
    for (const b of mem) if (b.seq > na) uit.push({ seq: b.seq, leeftijd: Math.max(0, Math.floor((nu - b.ts) / 1000)), m: b.m });
    uit.sort((a, b) => a.seq - b.seq);
    if (uit.length) cursor[v.id] = Math.max(na, uit[uit.length - 1].seq);
    while (mem.length && nu - mem[0].ts > 120000) mem.shift();
    return uit;
  }
  wikkel('haalBerichten', function (st, v, cursor) { return isNep(st) ? nepHaal(v, cursor) : orig.haalBerichten.apply(L, arguments); });
  wikkel('stuurBericht', async function (st, v, obj) {
    if (!isNep(st)) return orig.stuurBericht.apply(L, arguments);
    if (v && v.id === NEP_ID) await brein(obj);
  });

  // De live-verbinding: elke 700 ms de berichten van de nep-vriend ophalen en doorgeven; geen server.
  wikkel('maakLive', function (opt) {
    if (!aan) return orig.maakLive.apply(L, arguments);
    const cursor = {};
    let timer = null, n = 0, bezig = false;
    const sync = () => { try { opt.bij({ type: 'sync', meldingen: [], kaarten: { [NEP_ID]: nepBlob() } }); } catch (e) { /* pagina weg */ } };
    async function tik() {
      if (bezig) return;
      bezig = true;
      try {
        const st = opt.st();
        const v = st && st.vrienden.find((x) => x.id === NEP_ID);
        if (v) {
          const lijst = await nepHaal(v, cursor);
          if (lijst.length) opt.bij({ type: 'berichten', van: v.id, berichten: lijst });
        }
        n++;
        opt.bij({ type: 'ok' });
      } catch (e) { opt.bij({ type: 'fout', fout: e }); } finally { bezig = false; }
    }
    return {
      start() { if (!timer) { timer = setInterval(tik, 700); sync(); tik(); } },
      stop() { clearInterval(timer); timer = null; },
      async klaar() { while (bezig) await new Promise((r) => setTimeout(r, 20)); },
      pauze() { /* altijd actief */ }, tik: () => tik(), cursor, get verzoeken() { return n; }, vergeet() { sync(); },
    };
  });

  // ───────── het brein van de nep-vriend ─────────
  const duels = new Map();   // mid -> { side, begin, rl, rng, keuzes, hb, gestopt }
  const meegekeken = new Set();
  let actiefMid = null, kijkMid = null;
  const instelling = async () => (await get('spo_debug')) || {};

  function startDuel(mid, side, seedTekst) {
    const D = globalThis.SPODuel, G = globalThis.SPOGevecht;
    if (!D || !G || duels.has(mid)) return;
    const team = nepTeam();
    const rl = D.rollen(G.ordenTeam(team.kaarten, 0));
    const begin = D.beginKant(seedTekst);
    const rng = G.maakRng(G.seedUitTekst('nep|' + seedTekst));
    const s = { mid, side, begin, rl, rng, keuzes: new Map(), gestopt: false, hb: 0 };
    s.hb = setInterval(() => { if (s.gestopt) clearInterval(s.hb); else duw({ t: 'sd_hb', mid }); }, 2000);
    duels.set(mid, s); actiefMid = mid;
    // Als keeper legt de nep-vriend zijn keuzes alvast vast (een bericht dat te vroeg komt blijft in het postvak liggen tot het scherm eraan toe is).
    (async () => {
      for (let k = 0; k < 2 * D.RONDES; k++) {
        if (D.kantVan(begin, k) === side) continue; // hier schiet de nep-vriend zelf
        const d = D.computerDuik(rng, rl.keeper), nn = D.nonce();
        const c = await D.legVast(mid, k, d.dr, d.dh, nn);
        s.keuzes.set(k, { dr: d.dr, dh: d.dh, n: nn });
        setTimeout(() => { if (!s.gestopt) duw({ t: 'sd_vast', mid, k, c }); }, 700 + k * 350);
      }
    })();
  }
  function stopDuel(mid) { const s = duels.get(mid); if (s) { s.gestopt = true; clearInterval(s.hb); } if (actiefMid === mid) actiefMid = null; }

  async function brein(m) {
    if (!m || typeof m !== 'object') return;
    const D = globalThis.SPODuel;
    const mid = m.mid;
    switch (m.t) {
      case 'sd_uit': { // jij daagt de nep-vriend uit
        if (!D) return;
        const nn = D.nonce();
        startDuel(mid, 'B', `${mid}|${m.nonce}|${nn}`);
        duw({ t: 'sd_ja', mid, nonce: nn, team: nepTeam() }, 1200);
        break;
      }
      case 'sd_ja': { // jij accepteert de uitdaging van de nep-vriend (uit het Testmenu)
        const u = ((await get(SL_MENU)) || {}).uitdagingen;
        const x = u && typeof u === 'object' ? u[mid] : null;
        if (x) startDuel(mid, 'A', `${mid}|${x.nonce}|${m.nonce}`);
        break;
      }
      case 'sd_vast': { // jij bent keeper en hebt vastgelegd: de nep-vriend schiet
        const s = duels.get(mid);
        if (!s || s.gestopt || D.kantVan(s.begin, m.k) !== s.side) return;
        const sch = D.computerSchot(s.rng, D.schutterVoor(s.rl, D.beurtVan(m.k)));
        duw({ t: 'sd_schot', mid, k: m.k, r: sch.r, h: sch.h, q: sch.q, n: D.nonce() }, 900 + Math.floor(s.rng() * 1500));
        break;
      }
      case 'sd_schot': { // jij schoot: de nep-vriend (keeper) onthult zijn keuze
        const s = duels.get(mid);
        const kz = s && s.keuzes.get(m.k);
        if (!s || s.gestopt || !kz) return;
        duw({ t: 'sd_onthul', mid, k: m.k, r: kz.dr, h: kz.dh, n: kz.n }, 400 + Math.floor(s.rng() * 500));
        break;
      }
      case 'sd_eind': duw({ t: 'sd_eind', mid, a: m.a, b: m.b }, 50); setTimeout(() => stopDuel(mid), 4000); break;
      case 'sd_stop': case 'sd_nee': stopDuel(mid); break;
      case 'sd_kijk': { // jij speelt een duel en nodigt je vrienden uit om mee te kijken
        kijkMid = mid;
        if ((await instelling()).nepKijkt !== false && !meegekeken.has(mid)) { meegekeken.add(mid); duw({ t: 'sd_mee', mid }, 1500); }
        break;
      }
      // tweelingkaart: de nep-vriend antwoordt op een voorstel van jou
      case 'tw-vraag': {
        const keuze = (await instelling()).nepTweeling || 'ja';
        if (keuze === 'ja') duw({ t: 'tw-ja', id: m.id, b: m.b, g: m.g }, 1200);
        else if (keuze === 'nee') duw({ t: 'tw-nee', id: m.id }, 1200);
        break;
      }
      case 'tw-ja': { // jij zei ja op een voorstel van de nep-vriend: die bevestigt (zoals een echte vriend doet)
        duw({ t: 'tw-ja', id: m.id, b: m.b, g: m.g }, 800);
        break;
      }
      default: break;
    }
  }

  // ───────── opdrachten van het Testmenu (spo_debug_cmd) ─────────
  const gedaan = new Set();
  const EMOJI = ['\u{1F525}', '\u{1F62E}', '\u{1F44F}', '\u{1F602}'];
  function startOefen() {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const b = document.getElementById('oefen');
      if (b && !b.disabled) { clearInterval(iv); S.remove('spo_debug_cmd').catch(() => {}); b.click(); }
      else if (Date.now() - t0 > 20000) clearInterval(iv);
    }, 300);
  }
  function opdracht(c) {
    if (!c || typeof c !== 'object' || typeof c.cmd !== 'string' || Date.now() - (c.ts || 0) > 15000 || gedaan.has(c.ts)) return;
    if (c.cmd === 'nep-emoji') {
      gedaan.add(c.ts);
      const mid = actiefMid || kijkMid;
      if (mid && EMOJI.includes(c.e)) duw({ t: 'sd_emoji', mid, e: c.e });
    } else if (c.cmd === 'duel-start' && document.getElementById('oefen')) { gedaan.add(c.ts); startOefen(); }
  }
  try { api.storage.onChanged.addListener((w, gebied) => { if (gebied === 'local' && w.spo_debug_cmd) opdracht(w.spo_debug_cmd.newValue); }); } catch (e) { /* geen opslag */ }
  const bijStart = () => get('spo_debug_cmd').then(opdracht).catch(() => {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bijStart, { once: true }); else bijStart();
})();
