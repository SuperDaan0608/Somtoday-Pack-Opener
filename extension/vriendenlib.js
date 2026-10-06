// Vriendenfunctie: versleuteling (WebCrypto) en API-client. Werkt zonder DOM (ook in Node).
// De server ziet nooit namen of cijfers: alles wordt hier versleuteld voordat het wordt verstuurd.
// Standaard serveradres (overschrijfbaar via ?server= op de pagina of het veld Geavanceerd).
const SERVER_STANDAARD = 'https://570882340.swh.strato-hosting.eu/api.php';
(function () {
  'use strict';
  const STANDAARD_SERVER = SERVER_STANDAARD;
  const SLEUTEL = 'spo_vrienden';
  const GALERIJ = 'spo_galerij';
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
  async function laad() { const s = await lees(SLEUTEL); return s && s.id ? s : null; }
  function bewaar(st) { return schrijf(SLEUTEL, st); }
  async function leesGalerij() { const g = await lees(GALERIJ); return Array.isArray(g) ? g : []; }

  // Maakt account en sleutelpaar; pas hierna wordt de server benaderd.
  async function aanzetten(server) {
    const sl = await maakSleutelpaar();
    const r = await maakClient(server || STANDAARD_SERVER).roep('register', { pub: sl.pub });
    const st = { server: server || STANDAARD_SERVER, id: r.id, token: r.token, privJwk: sl.privJwk, pub: sl.pub, vrienden: [] };
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
  // Stuurt (of verwijdert) de blob voor één vriend.
  async function zetBlob(st, vriend, galerij) {
    const kaarten = kaartenVoor(vriend, galerij);
    let data = '';
    if (kaarten.length) {
      const sl = await deelSleutel(st.privJwk, vriend.pub, st.id, vriend.id);
      data = await versleutel(sl, { v: 1, ts: Date.now(), kaarten });
    }
    await clientVan(st).roep('put', { to: vriend.id, data });
  }

  async function verzoek(st, code, alias) {
    const c = leesCode(code);
    if (!c) throw new Error('Dit is geen geldige vriendcode.');
    if (c.id === st.id) throw new Error('Dit is je eigen vriendcode.');
    if (st.vrienden.some((v) => v.id === c.id && v.status !== 'weggevallen')) throw new Error('Deze vriend staat al in je lijst.');
    const r = await clientVan(st).roep('request', { to: c.id });
    st.vrienden = st.vrienden.filter((v) => v.id !== c.id);
    st.vrienden.push({ id: c.id, pub: c.pub, alias: alias || '', status: r.status === 'accepted' ? 'vriend' : 'verzonden', deel: { modus: 'niets', ids: [] } });
    await bewaar(st);
    return r.status;
  }
  async function antwoord(st, id, accepteer, alias) {
    await clientVan(st).roep('respond', { from: id, accept: accepteer });
    const v = st.vrienden.find((x) => x.id === id);
    if (accepteer && v) { v.status = 'vriend'; v.alias = alias || v.alias; }
    else st.vrienden = st.vrienden.filter((x) => x.id !== id);
    await bewaar(st);
  }
  async function verwijderVriend(st, id) {
    try { await clientVan(st).roep('unfriend', { other: id }); } catch (e) { if (e.status !== 404) throw e; }
    st.vrienden = st.vrienden.filter((x) => x.id !== id);
    await bewaar(st);
  }
  async function verwijderAccount(st) {
    await clientVan(st).roep('deleteAccount');
    await wis(SLEUTEL);
  }

  // Synchroniseert: verzoeken en vrienden ophalen, eigen blobs sturen, blobs van vrienden ontsleutelen.
  // Geeft { meldingen, kaarten: { [vriendId]: {ts, kaarten} } } terug; cijfers van vrienden blijven in het geheugen.
  async function synchroniseer(st, galerij) {
    const cl = clientVan(st);
    const meldingen = [];
    const [fr, inb] = await Promise.all([cl.roep('friends'), cl.roep('inbox')]);
    const vrienden = fr.vrienden || [];
    const vraag = inb.verzoeken || [];
    const kaarten = {};

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
      if (v) st.vrienden = st.vrienden.filter((x) => x !== v);
      st.vrienden.push({ id: r.id, pub: r.pub, alias: '', status: 'ontvangen', deel: { modus: 'niets', ids: [] } });
      meldingen.push('Je hebt een nieuw vriendverzoek.');
    }
    st.vrienden = st.vrienden.filter((v) => v.status !== 'ontvangen' || vraag.some((r) => r.id === v.id));

    // Eigen cijfers versturen en die van vrienden ophalen.
    for (const v of st.vrienden.filter((x) => x.status === 'vriend')) {
      try { await zetBlob(st, v, galerij); } catch (e) { if (e.status === 403) v.status = 'weggevallen'; else throw e; }
    }
    const bl = await cl.roep('get');
    for (const b of bl.blobs || []) {
      const v = st.vrienden.find((x) => x.id === b.owner && x.status === 'vriend');
      if (!v) continue;
      try {
        const sl = await deelSleutel(st.privJwk, v.pub, st.id, v.id);
        const p = await ontsleutel(sl, b.data);
        if (p && p.v === 1 && Array.isArray(p.kaarten)) kaarten[v.id] = { ts: p.ts, kaarten: p.kaarten };
      } catch (e) { meldingen.push(`De cijfers van ${naam(v)} konden niet worden ontsleuteld.`); }
    }
    await bewaar(st);
    return { meldingen, kaarten };
  }
  function naam(v) { return v.alias || 'Vriend ' + v.id.slice(0, 4); }

  const lib = {
    STANDAARD_SERVER, naB64, vanB64, maakSleutelpaar, deelSleutel, versleutel, ontsleutel, maakCode, leesCode, veiligheidscode,
    maakClient, clientVan, laad, bewaar, leesGalerij, aanzetten, kaartenVoor, zetBlob, verzoek, antwoord,
    verwijderVriend, verwijderAccount, synchroniseer, naam, lees, schrijf, wis, heeftOpslag,
  };
  globalThis.SPOVrienden = lib;
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
})();
