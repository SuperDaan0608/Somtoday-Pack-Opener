// Vriendenfunctie: versleuteling (WebCrypto) en API-client. Werkt zonder DOM (ook in Node).
// De server ziet nooit namen of cijfers: alles wordt hier versleuteld voordat het wordt verstuurd.
//
// Blob die ik voor vriend X op de server zet (versleuteld met de gedeelde ECDH/HKDF/AES-GCM-sleutel van mij en X):
//   { v: 1, ts,
//     kaarten:  [{ id, vak, cijfer, onderwerp, weging, ts, tier }],          kaarten die ik X laat zien
//     reacties?: { [kaartId]: emoji },                                         mijn reacties op kaarten van X (kaartId = id uit X' galerij)
//     raden?:   [{ rid, vak, onderwerp, weging, ts, uitslag?: { cijfer, dichtst } }],   rondes 'Voorspel mijn cijfer' waar X in `naar` staat
//     gokken?:  { [rid]: getal } }                                             mijn gokken op rondes van X
// De velden na `kaarten` zijn optioneel (oudere versies sturen en lezen ze niet). Is alles leeg, dan wordt de blob gewist (data = '').
// Alles wat van een vriend komt gaat door schoonBlob() (typen, lengtes, vaste emoji-lijst, maxima) voordat het wordt getoond.
// Standaard serveradres (overschrijfbaar via ?server= op de pagina of het veld Geavanceerd).
const SERVER_STANDAARD = 'https://jummysnacks.nl/api.php';
(function () {
  'use strict';
  const STANDAARD_SERVER = SERVER_STANDAARD;
  const SLEUTEL = 'spo_vrienden';
  const GALERIJ = 'spo_galerij';
  const TEAM = 'spo_team';             // mijn team: { ids: [keeperId, ...veldspelers] }, verwijst naar kaarten uit de galerij
  const GEVECHTEN = 'spo_gevechten';  // uitslagen: { [vriendId]: [{ ts, mijn, hun, n }] }
  const DICHT = 'spo_dicht'; // door de content-script bijgehouden: je nog ongeopende cijfers (zonder het cijfer zelf)
  const subtle = globalThis.crypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // ---- opslag: chrome.storage.local, alleen als terugval (tests) localStorage ----
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome; // Firefox heeft `browser`, Chrome `chrome`
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  async function lees(sleutel) {
    if (heeftOpslag) { const r = await api.storage.local.get(sleutel); return r[sleutel]; }
    try { const t = localStorage.getItem(sleutel); return t ? JSON.parse(t) : undefined; } catch (e) { return undefined; }
  }
  async function schrijf(sleutel, waarde) {
    if (heeftOpslag) { await api.storage.local.set({ [sleutel]: waarde }); return; }
    localStorage.setItem(sleutel, JSON.stringify(waarde));
  }
  async function wis(sleutel) {
    if (heeftOpslag) { await api.storage.local.remove(sleutel); return; }
    localStorage.removeItem(sleutel);
  }

  // ---- reacties en 'voorspel mijn cijfer': vaste lijsten, grenzen en strenge controle van alles wat een vriend stuurt ----
  // De emoji staan als escapes in de code (zelfde bestand blijft zo overal goed lezen).
  const REACTIES = [
    { emoji: '\u{1F525}', naam: 'vuur' },
    { emoji: '\u{1F62E}', naam: 'verbazing' },
    { emoji: '\u{1F44F}', naam: 'applaus' },
    { emoji: '\u{1F602}', naam: 'lachen' },
    { emoji: '\u{1F480}', naam: 'schedel' },
    { emoji: '\u2764\uFE0F', naam: 'hart' },
  ];
  const GRENS = { vak: 60, onderwerp: 120, kaarten: 150, reacties: 300, rondes: 10, gokken: 50, dicht: 20 };
  const heeft = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // Veilig één waarde uit een lijst van (vriend)gegevens lezen: nooit iets erven van Object.prototype.
  const eigen = (o, k) => (o && typeof o === 'object' && heeft(o, k) ? o[k] : undefined);
  const STUUR_TEKENS = /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g; // besturings- en richtingtekens
  const getal = (x, min, max) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  const rond1 = (x) => Math.round(x * 10) / 10;
  const rond2 = (x) => Math.round(x * 100) / 100;

  // Tekst van een vriend: alleen een string, niet langer dan toegestaan (anders wordt het hele veld genegeerd).
  function tekstVeld(t, max, min) {
    if (typeof t !== 'string' || t.length > max) return null;
    const s = t.replace(STUUR_TEKENS, '').trim();
    return s.length >= min ? s : null;
  }
  // Id van een kaart (de id uit de galerij) of van een ronde-sleutel: korte, rustige tekens, nooit '__proto__'.
  function sleutelTekst(t) { return typeof t === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(t) && t !== '__proto__' ? t : null; }
  function isRid(t) { return typeof t === 'string' && /^[0-9a-f]{32}$/.test(t); }
  function schoonEmoji(e) {
    if (typeof e !== 'string' || e.length > 4) return null;
    const kaal = e.replace(/\uFE0F/g, '');
    const r = REACTIES.find((x) => x.emoji.replace(/\uFE0F/g, '') === kaal);
    return r ? r.emoji : null;
  }
  function schoonKaart(k) {
    if (!k || typeof k !== 'object' || Array.isArray(k)) return null;
    const id = sleutelTekst(k.id), vak = tekstVeld(k.vak, GRENS.vak, 0);
    const onderwerp = k.onderwerp === undefined || k.onderwerp === null ? '' : tekstVeld(k.onderwerp, GRENS.onderwerp, 0);
    if (!id || vak === null || onderwerp === null || !getal(k.cijfer, 1, 10) || !getal(k.ts, 0, 4.1e12)) return null;
    return { id, vak, cijfer: k.cijfer, onderwerp, weging: getal(k.weging, 0, 100) ? k.weging : null, ts: k.ts, tier: Number.isInteger(k.tier) ? Math.max(0, Math.min(4, k.tier)) : 0 };
  }
  function schoonKaarten(a) {
    const uit = [], gezien = new Set();
    if (!Array.isArray(a)) return uit;
    for (const k of a) {
      if (uit.length >= GRENS.kaarten) break;
      const s = schoonKaart(k);
      if (s && !gezien.has(s.id)) { gezien.add(s.id); uit.push(s); }
    }
    return uit;
  }
  // { [kaartId]: emoji }, hoogstens 300, alleen emoji uit de vaste lijst.
  function schoonReacties(o) {
    const uit = Object.create(null);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return uit;
    let n = 0;
    for (const k of Object.keys(o)) {
      if (n >= GRENS.reacties) break;
      const id = sleutelTekst(k), e = schoonEmoji(o[k]);
      if (id && e) { uit[id] = e; n++; }
    }
    return uit;
  }
  // { [rid]: getal 1 t/m 10 }, afgerond op één decimaal.
  function schoonGokken(o) {
    const uit = Object.create(null);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return uit;
    let n = 0;
    for (const k of Object.keys(o)) {
      if (n >= GRENS.gokken) break;
      if (isRid(k) && getal(o[k], 1, 10)) { uit[k] = rond1(o[k]); n++; }
    }
    return uit;
  }
  function schoonRonde(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const vak = tekstVeld(r.vak, GRENS.vak, 1);
    const onderwerp = r.onderwerp === undefined || r.onderwerp === null ? '' : tekstVeld(r.onderwerp, GRENS.onderwerp, 0);
    if (!isRid(r.rid) || vak === null || onderwerp === null || !getal(r.ts, 0, 4.1e12)) return null;
    const uit = { rid: r.rid, vak, onderwerp, weging: getal(r.weging, 0, 100) ? r.weging : null, ts: r.ts };
    const u = r.uitslag;
    if (u && typeof u === 'object' && !Array.isArray(u) && getal(u.cijfer, 1, 10) && typeof u.dichtst === 'boolean') uit.uitslag = { cijfer: u.cijfer, dichtst: u.dichtst };
    return uit;
  }
  function schoonRonden(a) {
    const uit = [], gezien = new Set();
    if (!Array.isArray(a)) return uit;
    for (const r of a) {
      if (uit.length >= GRENS.rondes) break;
      const s = schoonRonde(r);
      if (s && !gezien.has(s.rid)) { gezien.add(s.rid); uit.push(s); }
    }
    return uit;
  }
  // Team van een vriend: alleen vak, cijfer, niveau en zeldzaam per kaart (geen namen, geen id's). De eerste kaart is de keeper.
  function schoonTeam(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t) || !Array.isArray(t.kaarten)) return null;
    const kaarten = [];
    for (const k of t.kaarten.slice(0, 11)) {
      if (!k || typeof k !== 'object') return null;
      const vak = tekstVeld(k.vak, GRENS.vak, 0);
      if (vak === null || !getal(k.cijfer, 1, 10) || !Number.isInteger(k.tier)) return null;
      kaarten.push({ vak, cijfer: rond2(k.cijfer), tier: Math.max(0, Math.min(4, k.tier)), z: k.z === true });
    }
    return kaarten.length >= 1 ? { kaarten } : null;
  }
  // Een ontsleutelde blob van een vriend, schoongemaakt. Ontbrekende velden zijn gewoon leeg (oudere versies sturen ze niet).
  function schoonBlob(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || p.v !== 1) return null;
    return { ts: getal(p.ts, 0, 4.1e12) ? p.ts : 0, kaarten: schoonKaarten(p.kaarten), reacties: schoonReacties(p.reacties), raden: schoonRonden(p.raden), gokken: schoonGokken(p.gokken), team: schoonTeam(p.team) };
  }

  // ---- base64url ----
  function naB64(bytes) {
    const b = new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function vanB64(t) {
    const s = atob(String(t).replace(/-/g, '+').replace(/_/g, '/'));
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  // ---- sleutels ----
  async function maakSleutelpaar() {
    const paar = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const privJwk = await subtle.exportKey('jwk', paar.privateKey);
    const pub = naB64(await subtle.exportKey('raw', paar.publicKey)); // 65 bytes
    return { privJwk, pub };
  }
  // Gedeelde AES-GCM-sleutel via ECDH + HKDF (salt = de twee id's gesorteerd en samengevoegd).
  async function deelSleutel(privJwk, anderPub, mijnId, anderId) {
    const priv = await subtle.importKey('jwk', privJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const pub = await subtle.importKey('raw', vanB64(anderPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const bits = await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
    const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    const salt = enc.encode([mijnId, anderId].sort().join(''));
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('spo-v1') }, hk,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function versleutel(sleutel, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, sleutel, enc.encode(JSON.stringify(obj)));
    return 'v1.' + naB64(iv) + '.' + naB64(ct);
  }
  async function ontsleutel(sleutel, tekst) {
    const d = String(tekst).split('.');
    if (d.length !== 3 || d[0] !== 'v1') throw new Error('Onbekend formaat');
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: vanB64(d[1]) }, sleutel, vanB64(d[2]));
    return JSON.parse(dec.decode(pt));
  }

  // ---- vriendcode: SPO1-<id>-<pub> ----
  function maakCode(id, pub) { return `SPO1-${id}-${pub}`; }
  function leesCode(tekst) {
    const m = /^SPO1-([0-9a-f]{32})-([A-Za-z0-9_-]{80,100})$/.exec(String(tekst || '').trim());
    if (!m) return null;
    try { if (vanB64(m[2]).length !== 65) return null; } catch (e) { return null; }
    return { id: m[1], pub: m[2] };
  }

  // Veiligheidscode: SHA-256 over de twee publieke sleutels (gesorteerd), als 6 groepen van 5 cijfers.
  async function veiligheidscode(pubA, pubB) {
    const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode([pubA, pubB].sort().join('|'))));
    const g = [];
    for (let i = 0; i < 6; i++) g.push(String((h[2 * i] * 65536 + h[2 * i + 1] * 256 + h[2 * i + 2]) % 100000).padStart(5, '0'));
    return g.join(' ');
  }

  // ---- API-client ----
  function maakClient(server, id, token) {
    async function roep(a, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (id) { headers['X-Id'] = id; headers['X-Token'] = token; }
      let r;
      try { r = await fetch(server, { method: 'POST', headers, body: JSON.stringify(Object.assign({ a }, body || {})) }); }
      catch (e) { const f = new Error('Geen verbinding met de server.'); f.status = 0; throw f; }
      let j = {};
      try { j = await r.json(); } catch (e) { /* leeg antwoord */ }
      if (!r.ok) { const f = new Error(j.fout || 'Serverfout ' + r.status); f.status = r.status; throw f; }
      return j;
    }
    return { roep };
  }
  function clientVan(st) { return maakClient(st.server, st.id, st.token); }

  // ---- toestand ----
  // st.reacties = { [vriendId]: { [kaartId]: emoji } }          mijn reacties op kaarten van vrienden
  // st.gokken   = { [vriendId]: { [rid]: getal } }               mijn gokken op rondes van vrienden
  // st.raden    = [{ rid, sig, vak, onderwerp, weging, ts, naar: [vriendId], uitslagGedeeld, uitslag?: { cijfer, dichtst: [vriendId] } }]
  //                                                              mijn eigen rondes ('Voorspel mijn cijfer')
  function zorgToestand(st) {
    const obj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    if (!obj(st.reacties)) st.reacties = {};
    if (!obj(st.gokken)) st.gokken = {};
    if (!Array.isArray(st.raden)) st.raden = [];
    return st;
  }
  async function laad() { const s = await lees(SLEUTEL); return s && s.id ? zorgToestand(s) : null; }
  function bewaar(st) { return schrijf(SLEUTEL, st); }
  async function leesGalerij() { const g = await lees(GALERIJ); return Array.isArray(g) ? g : []; }
  // Je nog ongeopende cijfers: vak, onderwerp, weging en een id. Nooit het cijfer zelf.
  function schoonDichtItem(x) {
    if (!x || typeof x !== 'object') return null;
    const id = sleutelTekst(x.id);
    const vak = typeof x.vak === 'string' ? x.vak.replace(STUUR_TEKENS, '').trim().slice(0, GRENS.vak) : '';
    if (!id || !vak) return null;
    const onderwerp = typeof x.onderwerp === 'string' ? x.onderwerp.replace(STUUR_TEKENS, '').trim().slice(0, GRENS.onderwerp) : '';
    return { id, vak, onderwerp, weging: getal(x.weging, 0.01, 100) ? x.weging : 1, ts: getal(x.ts, 1, 4.1e12) ? x.ts : Date.now() };
  }
  async function leesDicht() {
    const d = await lees(DICHT);
    return (Array.isArray(d) ? d : []).slice(0, GRENS.dicht * 2).map(schoonDichtItem).filter(Boolean).slice(0, GRENS.dicht);
  }
  // Roept `fn` aan als de galerij of de lijst met ongeopende cijfers verandert (andere pagina of de content-script).
  function opOpslagWijziging(fn) {
    const sleutels = [GALERIJ, DICHT, TEAM, GEVECHTEN];
    if (heeftOpslag && api.storage.onChanged) {
      api.storage.onChanged.addListener((c, gebied) => { if (gebied === 'local' && sleutels.some((k) => k in c)) fn(); });
    } else if (typeof addEventListener === 'function') {
      addEventListener('storage', (e) => { if (e.key === null || sleutels.includes(e.key)) fn(); });
    }
  }

  // Maakt account en sleutelpaar; pas hierna wordt de server benaderd.
  async function aanzetten(server) {
    const sl = await maakSleutelpaar();
    const r = await maakClient(server || STANDAARD_SERVER).roep('register', { pub: sl.pub });
    const st = zorgToestand({ server: server || STANDAARD_SERVER, id: r.id, token: r.token, privJwk: sl.privJwk, pub: sl.pub, vrienden: [] });
    await bewaar(st);
    return st;
  }

  function kaartenVoor(vriend, galerij) {
    const d = vriend.deel || { modus: 'niets', ids: [] };
    let l = [];
    if (d.modus === 'alles') l = galerij;
    else if (d.modus === 'selectie') { const s = new Set(d.ids || []); l = galerij.filter((e) => s.has(e.id)); }
    return l.map((e) => ({ id: e.id, vak: e.vak, cijfer: e.cijfer, onderwerp: e.onderwerp, weging: e.weging, ts: e.ts, tier: e.tier }));
  }

  // Kaarten die ik deze vriend laat zien. Het cijfer van een ronde die nog loopt (uitslag niet gedeeld) blijft achter: dat gaat alleen
  // via 'Toon uitslag aan vrienden' naar de vrienden uit de ronde, ook als ik ze 'Alles' laat zien.
  function deelbareKaarten(st, vriend, galerij) {
    zorgToestand(st);
    const achter = new Set(st.raden.filter((r) => r && Array.isArray(r.naar) && r.naar.includes(vriend.id) && !r.uitslagGedeeld).map((r) => r.sig));
    return kaartenVoor(vriend, galerij).filter((k) => !achter.has(k.id));
  }

  // Wat er voor één vriend in de versleutelde blob komt: { v: 1, ts, kaarten, reacties?, raden?, gokken? }, of null als alles leeg is
  // (dan wordt de blob op de server gewist). Zonder `naar` komt een ronde bij niemand terecht; de sig van een cijfer zit er nooit in.
  function maakInhoud(st, vriend, galerij, team) {
    zorgToestand(st);
    const inhoud = { v: 1, ts: Date.now(), kaarten: deelbareKaarten(st, vriend, galerij) };
    const reacties = schoonReacties(eigen(st.reacties, vriend.id));
    const raden = [];
    for (const r of st.raden) {
      if (!r || !Array.isArray(r.naar) || !r.naar.includes(vriend.id)) continue;
      const x = { rid: r.rid, vak: r.vak, onderwerp: r.onderwerp, weging: r.weging, ts: r.ts };
      if (r.uitslagGedeeld && r.uitslag && getal(r.uitslag.cijfer, 1, 10)) {
        x.uitslag = { cijfer: r.uitslag.cijfer, dichtst: Array.isArray(r.uitslag.dichtst) && r.uitslag.dichtst.includes(vriend.id) };
      }
      const s = schoonRonde(x);
      if (s) raden.push(s);
    }
    const gokken = schoonGokken(eigen(st.gokken, vriend.id));
    if (Object.keys(reacties).length) inhoud.reacties = reacties;
    if (raden.length) inhoud.raden = raden.slice(0, GRENS.rondes);
    if (Object.keys(gokken).length) inhoud.gokken = gokken;
    const tm = schoonTeam(team);
    if (tm) inhoud.team = tm;
    return inhoud.kaarten.length || inhoud.reacties || inhoud.raden || inhoud.gokken || inhoud.team ? inhoud : null;
  }
  // Stuurt (of verwijdert) de blob voor één vriend.
  async function zetBlob(st, vriend, galerij) {
    const inhoud = maakInhoud(st, vriend, galerij, await mijnTeamDeelbaar(galerij));
    let data = '';
    if (inhoud) {
      const sl = await deelSleutel(st.privJwk, vriend.pub, st.id, vriend.id);
      data = await versleutel(sl, inhoud);
    }
    await clientVan(st).roep('put', { to: vriend.id, data });
  }
  // Stuurt de blobs van een paar vrienden (na een wijziging in een ronde). Een vriend die geen vriend meer blijkt, wordt gemarkeerd.
  async function zetBlobs(st, ids, galerij) {
    let eerste = null;
    for (const v of st.vrienden.filter((x) => x.status === 'vriend' && ids.includes(x.id))) {
      try { await zetBlob(st, v, galerij); }
      catch (e) { if (e.status === 403) v.status = 'weggevallen'; else if (!eerste) eerste = e; }
    }
    if (eerste) throw eerste;
  }

  // Vriendenlijst-wijzigingen en synchroniseren lopen na elkaar, nooit door elkaar (de live-sync loopt elke seconde).
  let ketting = Promise.resolve();
  function serieel(fn) { const r = ketting.then(fn, fn); ketting = r.catch(() => {}); return r; }
  const verzoek = (...a) => serieel(() => verzoek_(...a));
  const antwoord = (...a) => serieel(() => antwoord_(...a));
  const verwijderVriend = (...a) => serieel(() => verwijderVriend_(...a));
  const synchroniseer = (...a) => serieel(() => synchroniseer_(...a));
  async function verzoek_(st, code, alias) {
    const c = leesCode(code);
    if (!c) throw new Error('Dit is geen geldige vriendcode.');
    if (c.id === st.id) throw new Error('Dit is je eigen vriendcode.');
    if (st.vrienden.some((v) => v.id === c.id && v.status !== 'weggevallen')) throw new Error('Deze vriend staat al in je lijst.');
    const r = await clientVan(st).roep('request', { to: c.id });
    st.vrienden = st.vrienden.filter((v) => v.id !== c.id);
    ruimOp(st, c.id); // reacties, gokken en rondes uit een eerdere vriendschap met dezelfde id horen hier niet meer bij
    st.vrienden.push({ id: c.id, pub: c.pub, alias: alias || '', status: r.status === 'accepted' ? 'vriend' : 'verzonden', deel: { modus: 'niets', ids: [] } });
    await bewaar(st);
    return r.status;
  }
  async function antwoord_(st, id, accepteer, alias) {
    await clientVan(st).roep('respond', { from: id, accept: accepteer });
    const v = st.vrienden.find((x) => x.id === id);
    if (accepteer && v) { v.status = 'vriend'; v.alias = alias || v.alias; }
    else { st.vrienden = st.vrienden.filter((x) => x.id !== id); ruimOp(st, id); }
    await bewaar(st);
  }
  async function verwijderVriend_(st, id) {
    try { await clientVan(st).roep('unfriend', { other: id }); } catch (e) { if (e.status !== 404) throw e; }
    st.vrienden = st.vrienden.filter((x) => x.id !== id);
    ruimOp(st, id);
    await bewaar(st);
  }
  // Ruimt alles op wat bij een vriend hoort: mijn reacties, mijn gokken en die vriend in mijn rondes (een ronde zonder vrienden verdwijnt).
  function ruimOp(st, id) {
    zorgToestand(st);
    delete st.reacties[id];
    delete st.gokken[id];
    st.raden = st.raden.filter((r) => { r.naar = (r.naar || []).filter((x) => x !== id); return r.naar.length > 0; });
  }
  // Na een synchronisatie: in mijn rondes blijven alleen vrienden over die nog vriend zijn.
  function ruimRondesOp(st) {
    zorgToestand(st);
    const actief = new Set(st.vrienden.filter((v) => v.status === 'vriend').map((v) => v.id));
    st.raden = st.raden.filter((r) => { r.naar = (r.naar || []).filter((x) => actief.has(x)); return r.naar.length > 0; });
  }
  async function verwijderAccount(st) {
    await clientVan(st).roep('deleteAccount');
    await wis(SLEUTEL);
  }

  // Synchroniseert: verzoeken en vrienden ophalen, eigen blobs sturen, blobs van vrienden ontsleutelen.
  // Geeft { meldingen, kaarten: { [vriendId]: { ts, kaarten, reacties, raden, gokken } } } terug; wat vrienden delen blijft in het geheugen.
  async function synchroniseer_(st, galerij) {
    const cl = clientVan(st);
    const meldingen = [];
    const [fr, inb] = await Promise.all([cl.roep('friends'), cl.roep('inbox')]);
    const vrienden = fr.vrienden || [];
    const vraag = inb.verzoeken || [];

    for (const f of vrienden) {
      let v = st.vrienden.find((x) => x.id === f.id);
      if (!v) { v = { id: f.id, pub: f.pub, alias: '', status: 'vriend', deel: { modus: 'niets', ids: [] } }; st.vrienden.push(v); }
      else if (v.pub !== f.pub) { v.status = 'weggevallen'; v.sleutelFout = true; meldingen.push('De sleutel van een vriend klopt niet meer; die vriend is uit voorzorg uitgeschakeld.'); continue; }
      else if (v.status !== 'vriend') {
        if (v.status === 'verzonden') meldingen.push(`${naam(v)} heeft je verzoek geaccepteerd.`);
        v.status = 'vriend';
      }
      delete v.sleutelFout;
    }
    for (const v of st.vrienden) {
      if (v.status === 'vriend' && !vrienden.some((f) => f.id === v.id)) {
        v.status = 'weggevallen';
        meldingen.push(`${naam(v)} is geen vriend meer (verwijderd of account gewist).`);
      }
    }
    for (const r of vraag) {
      let v = st.vrienden.find((x) => x.id === r.id);
      if (v && (v.status === 'vriend' || v.status === 'ontvangen')) continue;
      if (v) { st.vrienden = st.vrienden.filter((x) => x !== v); ruimOp(st, r.id); }
      st.vrienden.push({ id: r.id, pub: r.pub, alias: '', status: 'ontvangen', deel: { modus: 'niets', ids: [] } });
      meldingen.push('Je hebt een nieuw vriendverzoek.');
    }
    st.vrienden = st.vrienden.filter((v) => v.status !== 'ontvangen' || vraag.some((r) => r.id === v.id));

    ruimRondesOp(st);

    // Eigen gegevens versturen en die van vrienden ophalen.
    for (const v of st.vrienden.filter((x) => x.status === 'vriend')) {
      try { await zetBlob(st, v, galerij); } catch (e) { if (e.status === 403) v.status = 'weggevallen'; else throw e; }
    }
    const { kaarten, mislukt } = await haalOp(st, meldingen);
    // Mijn gokken op rondes die er niet meer zijn (de vriend stopte ze) hoeven niet te blijven staan.
    for (const v of st.vrienden) {
      if (v.status !== 'vriend' || mislukt.has(v.id) || !st.gokken[v.id]) continue;
      const rids = new Set(((kaarten[v.id] || {}).raden || []).map((r) => r.rid));
      for (const rid of Object.keys(st.gokken[v.id])) if (!rids.has(rid)) delete st.gokken[v.id][rid];
      if (!Object.keys(st.gokken[v.id]).length) delete st.gokken[v.id];
    }
    await bewaar(st);
    return { meldingen, kaarten };
  }
  // Haalt de blobs van vrienden op en ontsleutelt ze. Alles wat een vriend stuurt wordt streng gecontroleerd (schoonBlob).
  // Geeft { kaarten: { [vriendId]: { ts, kaarten, reacties, raden, gokken } }, mislukt: Set } terug; het blijft in het geheugen.
  async function haalOp(st, meldingen) {
    const bl = await clientVan(st).roep('get');
    const kaarten = {}, mislukt = new Set();
    for (const b of bl.blobs || []) {
      const v = st.vrienden.find((x) => x.id === b.owner && x.status === 'vriend');
      if (!v) continue;
      try {
        const sl = await deelSleutel(st.privJwk, v.pub, st.id, v.id);
        const p = schoonBlob(await ontsleutel(sl, b.data));
        if (p) kaarten[v.id] = p; else mislukt.add(v.id); // onbekende versie: niets overnemen en niets opruimen
      } catch (e) { mislukt.add(v.id); if (meldingen) meldingen.push(`De cijfers van ${naam(v)} konden niet worden ontsleuteld.`); }
    }
    return { kaarten, mislukt };
  }

  // ---- team en gevechten ----
  async function leesTeam() { const t = await lees(TEAM); return t && Array.isArray(t.ids) ? { ids: t.ids.filter((x) => typeof x === 'string').slice(0, 11) } : null; }
  function bewaarTeam(team) { return team && team.ids.length ? schrijf(TEAM, { v: 1, ids: team.ids.slice(0, 11), ts: Date.now() }) : wis(TEAM); }
  // Kaarten van het team in volgorde (eerste = keeper); kaarten die niet meer in de galerij staan vallen weg.
  function teamKaarten(team, galerij) {
    if (!team) return [];
    const per = new Map(galerij.map((e) => [e.id, e]));
    return team.ids.map((id) => per.get(id)).filter(Boolean).slice(0, 11);
  }
  // Wat vrienden van mijn team zien: vak, cijfer, niveau en zeldzaam. Geen id's, geen namen.
  function teamMomentopname(kaarten) {
    return { kaarten: kaarten.map((e) => ({ vak: String(e.vak || '').slice(0, 24), cijfer: Math.round(e.cijfer * 100) / 100, tier: Math.max(0, Math.min(4, e.tier | 0)), z: e.zeldzaam === true })) };
  }
  async function mijnTeamDeelbaar(galerij) {
    const k = teamKaarten(await leesTeam(), galerij || []);
    return k.length ? teamMomentopname(k) : null;
  }
  async function leesGevechten() { const g = await lees(GEVECHTEN); return g && typeof g === 'object' && !Array.isArray(g) ? g : {}; }
  async function bewaarUitslag(vriendId, u) {
    const g = await leesGevechten();
    const l = Array.isArray(g[vriendId]) ? g[vriendId] : [];
    l.unshift({ ts: u.ts, mijn: u.mijn, hun: u.hun, n: u.n });
    g[vriendId] = l.slice(0, 20);
    await schrijf(GEVECHTEN, g);
    return g;
  }

  // ---- kanaal: kleine versleutelde berichten tussen twee vrienden (voor gevechten) ----
  const sleutelCache = new Map();
  async function sleutelVoor(st, v) {
    const k = st.id + ':' + v.id + ':' + v.pub;
    if (!sleutelCache.has(k)) sleutelCache.set(k, deelSleutel(st.privJwk, v.pub, st.id, v.id));
    return sleutelCache.get(k);
  }
  let laatsteSeq = 0;
  // Volgnummer: altijd hoger dan het vorige, en gebaseerd op de tijd zodat een nieuwe sessie niet opnieuw bij 1 begint.
  function volgSeq() { laatsteSeq = Math.max(laatsteSeq + 1, Date.now()); return laatsteSeq; }
  async function stuurBericht(st, v, obj) {
    const data = await versleutel(await sleutelVoor(st, v), obj);
    for (let i = 0; i < 3; i++) {
      try { await clientVan(st).roep('send', { to: v.id, seq: volgSeq(), data }); return; }
      catch (e) { if (e.status !== 409) throw e; }
    }
  }
  // Haalt nieuwe berichten van één vriend op. `cursor` is { [vriendId]: laatste seq }. Onleesbare berichten worden overgeslagen.
  async function haalBerichten(st, v, cursor) {
    const r = await clientVan(st).roep('poll', { from: v.id, after: cursor[v.id] || 0 });
    const uit = [];
    for (const b of r.berichten || []) {
      cursor[v.id] = Math.max(cursor[v.id] || 0, b.seq);
      try { const m = await ontsleutel(await sleutelVoor(st, v), b.data); if (m && typeof m === 'object' && !Array.isArray(m)) uit.push({ seq: b.seq, leeftijd: b.leeftijd | 0, m }); } catch (e) { /* niet van deze vriend */ }
    }
    return uit;
  }

  // ---- live synchroniseren ----
  // Elke seconde (alleen als de pagina echt zichtbaar is) een goedkope 'puls'. Pas als daar iets in verandert wordt er meer opgehaald:
  // vrienden/verzoeken veranderd = volledige sync, een blob van een vriend veranderd = alleen 'get', nieuw bericht = alleen 'poll'.
  // Nooit twee verzoeken tegelijk. Opties: { st: () => st, galerij: () => [], herlaad: async () => st, bij: (gebeurtenis) => {}, interval }
  function zichtbaar() {
    try { return document.visibilityState === 'visible' && innerWidth > 0 && innerHeight > 0; } catch (e) { return true; }
  }
  function maakLive(opt) {
    const interval = opt.interval || 1000;
    let timer = null, bezig = false, pauze = false, vorigZichtbaar = false, vh = null, eerste = true;
    const blobs = new Map();
    const cursor = {};
    let aantal = 0;
    async function tik(geforceerd) {
      if (bezig || (pauze && !geforceerd)) return;
      const zicht = zichtbaar();
      if (!zicht) { vorigZichtbaar = false; return; }
      bezig = true;
      try {
        let st = opt.st();
        if (!vorigZichtbaar) { // net weer zichtbaar: de andere pagina kan intussen iets bewaard hebben
          vorigZichtbaar = true;
          if (opt.herlaad && !eerste) { st = (await opt.herlaad()) || st; vh = null; }
        }
        eerste = false;
        const p = await clientVan(st).roep('puls');
        aantal++;
        const g = opt.galerij();
        if (vh === null || p.vh !== vh) {
          const r = await synchroniseer(st, g);
          vh = p.vh;
          for (const b of p.blobs || []) blobs.set(b.owner, b.updated);
          opt.bij({ type: 'sync', meldingen: r.meldingen, kaarten: r.kaarten });
        } else if ((p.blobs || []).some((b) => blobs.get(b.owner) !== b.updated)) {
          const { kaarten, mislukt } = await haalOp(st, []);
          for (const b of p.blobs) blobs.set(b.owner, b.updated);
          opt.bij({ type: 'kaarten', kaarten, mislukt });
        }
        for (const x of p.post || []) {
          if (x.seq <= (cursor[x.van] || 0)) continue;
          const v = st.vrienden.find((y) => y.id === x.van && y.status === 'vriend');
          if (!v) continue;
          const lijst = await haalBerichten(st, v, cursor);
          if (lijst.length) opt.bij({ type: 'berichten', van: v.id, berichten: lijst });
        }
        opt.bij({ type: 'ok' });
      } catch (e) { opt.bij({ type: 'fout', fout: e }); }
      finally { bezig = false; }
    }
    return {
      start() { if (!timer) { timer = setInterval(() => tik(false), interval); tik(false); } },
      stop() { clearInterval(timer); timer = null; },
      pauze(p) { pauze = !!p; }, tik: () => tik(true), cursor, get verzoeken() { return aantal; },
      vergeet() { vh = null; },
    };
  }

  // ---- reacties ----
  // Zet, wijzigt of haalt weg (zelfde emoji nog eens) mijn reactie op een kaart van een vriend. Geeft de nieuwe emoji of null terug.
  function zetReactie(st, vriendId, kaartId, emoji) {
    zorgToestand(st);
    const kid = sleutelTekst(kaartId), e = schoonEmoji(emoji);
    if (!kid || !e || !st.vrienden.some((v) => v.id === vriendId)) throw new Error('Deze reactie kan niet worden opgeslagen.');
    const m = heeft(st.reacties, vriendId) ? st.reacties[vriendId] : (st.reacties[vriendId] = {});
    if (heeft(m, kid) && m[kid] === e) {
      delete m[kid];
      if (!Object.keys(m).length) delete st.reacties[vriendId];
      return null;
    }
    if (!heeft(m, kid) && Object.keys(m).length >= GRENS.reacties) throw new Error('Je kunt op maximaal 300 kaarten van één vriend reageren.');
    m[kid] = e;
    return e;
  }
  // Reacties van vrienden op mijn eigen kaarten, alleen van vrienden aan wie ik die kaart nu deel.
  // Geeft [{ kaart, reacties: [{ vriendId, naam, emoji }] }] terug in de volgorde van de galerij.
  function reactiesOpMijnKaarten(st, galerij, ontvangen) {
    const perKaart = new Map();
    for (const v of st.vrienden) {
      if (v.status !== 'vriend') continue;
      const o = eigen(ontvangen, v.id);
      if (!o || !o.reacties) continue;
      const gedeeld = new Set(deelbareKaarten(st, v, galerij).map((k) => k.id));
      for (const kid of Object.keys(o.reacties)) {
        if (!gedeeld.has(kid)) continue;
        if (!perKaart.has(kid)) perKaart.set(kid, []);
        perKaart.get(kid).push({ vriendId: v.id, naam: naam(v), emoji: o.reacties[kid] });
      }
    }
    return galerij.filter((e) => perKaart.has(e.id)).map((e) => ({ kaart: e, reacties: perKaart.get(e.id).sort((a, b) => a.naam.localeCompare(b.naam, 'nl')) }));
  }

  // ---- voorspel mijn cijfer ----
  // De rid is puur willekeurig. Nooit de sig (een ongezouten hash van het cijfer) of iets daarvan afgeleids: met 91 mogelijke cijfers
  // zou een vriend het cijfer zo terugrekenen.
  function maakRid() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); }
  // Leest een gok die iemand intikt: "7,3" of "7.3", 1 t/m 10 met hoogstens één decimaal. Anders null.
  function leesGok(tekst) {
    const t = String(tekst === undefined || tekst === null ? '' : tekst).trim().replace(',', '.');
    if (!/^\d{1,2}(\.\d)?$/.test(t)) return null;
    const n = Number(t);
    return n >= 1 && n <= 10 ? rond1(n) : null;
  }
  // Start een ronde voor een nog ongeopend cijfer (een item uit leesDicht) en de gekozen vrienden. Verstuurt zelf niets.
  function startRonde(st, dicht, naarIds) {
    zorgToestand(st);
    const d = schoonDichtItem(dicht);
    if (!d) throw new Error('Dit cijfer is niet meer beschikbaar.');
    if (st.raden.length >= GRENS.rondes) throw new Error('Je kunt maximaal 10 rondes tegelijk hebben. Stop eerst een ronde.');
    if (st.raden.some((r) => r.sig === d.id)) throw new Error('Voor dit cijfer loopt al een ronde.');
    const actief = new Set(st.vrienden.filter((v) => v.status === 'vriend').map((v) => v.id));
    const naar = [...new Set(Array.isArray(naarIds) ? naarIds : [])].filter((id) => actief.has(id));
    if (!naar.length) throw new Error('Kies minstens één vriend.');
    const r = { rid: maakRid(), sig: d.id, vak: d.vak, onderwerp: d.onderwerp, weging: d.weging, ts: d.ts, naar, uitslagGedeeld: false };
    st.raden.push(r);
    return r;
  }
  // Stopt (verwijdert) een ronde. Geeft de vrienden terug van wie de blob opnieuw moet.
  function stopRonde(st, rid) {
    zorgToestand(st);
    const r = st.raden.find((x) => x.rid === rid);
    st.raden = st.raden.filter((x) => x.rid !== rid);
    return r ? r.naar.slice() : [];
  }
  function verschil(gok, cijfer) { return rond2(Math.abs(gok - cijfer)); }
  // Wie zit het dichtst bij? `ontvangen` is wat synchroniseer/haalOp teruggaf. Alleen gokken van vrienden uit `naar` tellen.
  // Geeft { lijst: [{ id, gok, verschil }] (dichtstbij eerst), dichtst: [id] (bij gelijkspel allemaal), verschil } terug.
  function ranglijst(ronde, cijfer, ontvangen) {
    const lijst = [];
    for (const id of ronde.naar) {
      const g = eigen(eigen(eigen(ontvangen, id), 'gokken'), ronde.rid);
      if (getal(g, 1, 10)) lijst.push({ id, gok: g, verschil: verschil(g, cijfer) });
    }
    lijst.sort((a, b) => a.verschil - b.verschil);
    const min = lijst.length ? lijst[0].verschil : null;
    return { lijst, dichtst: lijst.filter((x) => x.verschil === min).map((x) => x.id), verschil: min };
  }
  // Deelt de uitslag: pas mogelijk als het cijfer in de galerij staat (id === sig). Haalt eerst de nieuwste gokken op, legt vast wie
  // het dichtst zat, en stuurt dan (en alleen dan) het cijfer naar de vrienden uit `naar`. Het cijfer verlaat het apparaat nergens anders.
  async function deelUitslag(st, rid, galerij) {
    zorgToestand(st);
    const r = st.raden.find((x) => x.rid === rid);
    if (!r) throw new Error('Deze ronde bestaat niet meer.');
    if (r.uitslagGedeeld) return { ronde: r, kaarten: null };
    const g = galerij.find((e) => e.id === r.sig && getal(e.cijfer, 1, 10));
    if (!g) throw new Error('Dit cijfer is nog dicht. Je kunt de uitslag pas delen als je het hebt geopend.');
    const { kaarten } = await haalOp(st);
    const rl = ranglijst({ rid: r.rid, naar: r.naar.filter((id) => st.vrienden.some((v) => v.id === id && v.status === 'vriend')) }, g.cijfer, kaarten);
    r.uitslagGedeeld = true;
    r.uitslag = { cijfer: g.cijfer, dichtst: rl.dichtst };
    await bewaar(st);
    await zetBlobs(st, r.naar, galerij);
    return { ronde: r, kaarten };
  }
  // Mijn gok op een ronde van een vriend. Aanpassen kan tot de vriend de uitslag deelt (dat bewaakt de pagina).
  function slaGokOp(st, vriendId, rid, gok) {
    zorgToestand(st);
    const g = typeof gok === 'number' ? gok : leesGok(gok);
    if (!isRid(rid) || !getal(g, 1, 10) || !st.vrienden.some((v) => v.id === vriendId)) throw new Error('Deze gok kan niet worden opgeslagen.');
    const m = heeft(st.gokken, vriendId) ? st.gokken[vriendId] : (st.gokken[vriendId] = {});
    if (!heeft(m, rid) && Object.keys(m).length >= GRENS.gokken) throw new Error('Je hebt al te veel gokken openstaan bij deze vriend.');
    m[rid] = rond1(g);
    return m[rid];
  }

  function naam(v) { return v.alias || 'Vriend ' + v.id.slice(0, 4); }

  const lib = {
    STANDAARD_SERVER, naB64, vanB64, maakSleutelpaar, deelSleutel, versleutel, ontsleutel, maakCode, leesCode, veiligheidscode,
    maakClient, clientVan, laad, bewaar, leesGalerij, aanzetten, kaartenVoor, zetBlob, verzoek, antwoord,
    verwijderVriend, verwijderAccount, synchroniseer, naam,
    TEAM, GEVECHTEN, schoonTeam, leesTeam, bewaarTeam, teamKaarten, teamMomentopname, mijnTeamDeelbaar, leesGevechten, bewaarUitslag, stuurBericht, haalBerichten, maakLive, zichtbaar, lees, schrijf, wis, heeftOpslag,
    // reacties en 'voorspel mijn cijfer'
    REACTIES, GRENS, eigen, deelbareKaarten, schoonBlob, schoonKaarten, schoonReacties, schoonRonden, schoonGokken, maakInhoud, zetBlobs, haalOp, zetReactie,
    reactiesOpMijnKaarten, maakRid, leesGok, startRonde, stopRonde, ranglijst, deelUitslag, slaGokOp, ruimOp, leesDicht, opOpslagWijziging,
  };
  globalThis.SPOVrienden = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
