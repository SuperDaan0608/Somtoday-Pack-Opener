/*
 * Somtoday Pack Opener v2.2: je account (e-mail + wachtwoord) en de back-up van je voortgang.
 * Werkt in de extensiepagina's, in de achtergrond (update.js) en in Node (tests).
 *
 * Waarom: bij een update laad je de extensie opnieuw in en begint de browser met lege opslag. Met een account
 * komt na het inloggen alles terug: kaarten, munten, badges, team, vrienden en instellingen.
 *
 * Privacy:
 *  - De server bewaart je e-mailadres niet, alleen een hash ervan (het adres gaat alleen mee om de code te mailen).
 *  - De back-up wordt hier versleuteld (AES-GCM) met een sleutel die uit je wachtwoord en e-mailadres komt (PBKDF2).
 *    De server, en dus ook de beheerder, kan hem niet lezen. Je wachtwoord zelf wordt nergens bewaard, alleen die sleutel.
 *  - Wachtwoord vergeten = een nieuwe sleutel: de oude back-up is dan niet meer te lezen. De gegevens in deze browser
 *    blijven staan en worden met de nieuwe sleutel opnieuw opgeslagen.
 *  - De kaartplaatjes gaan niet mee (te groot); die tekent content.js na het terugzetten opnieuw.
 *
 * Opslag (chrome.storage.local): spo_account { email, sessie, account, sleutel, laatsteBackup }
 */
(function () {
  'use strict';
  const api = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const heeftOpslag = !!(api && api.storage && api.storage.local);
  const SERVER_STANDAARD = 'https://jummysnacks.nl/api.php';
  const SLEUTEL = 'spo_account';
  // Wat er in de back-up gaat. Niet: spo_account zelf, spo_beheer (de beheersleutel), spo_update, spo_proef en spo_hub_open.
  const BACKUP_SLEUTELS = [
    'spo_galerij', 'spo_geopend', 'spo_dicht', 'spo_instellingen', 'spo_munten', 'spo_munten_log', 'spo_munten_ids',
    'spo_dagelijks', 'spo_winkel', 'spo_profiel', 'spo_prestaties', 'spo_prestaties_gezien', 'spo_stats', 'spo_team',
    'spo_gevechten', 'spo_vrienden', 'spo_vrienden_sec', 'spo_uitval_gezien', 'spo_huisdier', 'spo_rondleiding',
    'spo_capsules', 'spo_weekoverzicht',
    'spo_rivaal', 'spo_uitnodigingen', 'spo_blokkades', 'spo_nieuw_gezien',
  ];
  const ITERATIES = 250000;

  // ---- opslag ----
  async function lees(sleutels) {
    if (heeftOpslag) return api.storage.local.get(sleutels);
    const r = {};
    for (const s of [].concat(sleutels)) { try { const t = globalThis.localStorage.getItem(s); if (t) r[s] = JSON.parse(t); } catch (e) { /* leeg */ } }
    return r;
  }
  async function schrijf(o) {
    if (heeftOpslag) return api.storage.local.set(o);
    for (const [s, w] of Object.entries(o)) globalThis.localStorage.setItem(s, JSON.stringify(w));
  }
  async function wis(s) {
    if (heeftOpslag) return api.storage.local.remove(s);
    globalThis.localStorage.removeItem(s);
  }
  async function account() {
    const a = (await lees(SLEUTEL))[SLEUTEL];
    return a && typeof a === 'object' && typeof a.sessie === 'string' && typeof a.sleutel === 'string' ? a : null;
  }

  // ---- server ----
  let server = SERVER_STANDAARD;
  // v3.0: bij deze acties sturen we (als je de vriendenfunctie aan hebt) ook X-Id en X-Token mee. Daarmee kan de beheerder bij een ban ook het
  // e-mailadres blokkeren. De server bewaart dan alleen de id's van gebruiker en account, nooit het adres.
  const KOPPEL_ACTIES = ['accRegistreer', 'accVerifieer', 'accLogin', 'accReset', 'accBackupBewaar'];
  const AANMELD_ACTIES = ['accRegistreer', 'accVerifieer', 'accLogin', 'accReset'];
  const AANMELD_TEKST = 'Aanmelden lukt nu niet met dit e-mailadres of op dit netwerk. Probeer het later opnieuw of gebruik een ander netwerk.';
  async function identiteitHeaders(actie) {
    if (!KOPPEL_ACTIES.includes(actie)) return {};
    try {
      const v = (await lees('spo_vrienden')).spo_vrienden;
      if (v && typeof v.id === 'string' && /^[0-9a-f]{32}$/.test(v.id) && typeof v.token === 'string' && v.token) return { 'X-Id': v.id, 'X-Token': v.token };
    } catch (e) { /* geen vriendenidentiteit: dan sturen we niets mee */ }
    return {};
  }
  async function roep(actie, body, sessie) {
    let r;
    const koppel = await identiteitHeaders(actie);
    try {
      r = await fetch(server, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, sessie ? { 'X-Sessie': sessie } : {}, koppel),
        body: JSON.stringify(Object.assign({ a: actie }, body || {})),
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (e) {
      const f = new Error('Geen verbinding met de server. Controleer je internet en probeer het opnieuw.');
      f.status = 0;
      throw f;
    }
    let j = {};
    try { j = await r.json(); } catch (e) { /* leeg */ }
    if (!r.ok) {
      const f = new Error(j.fout || 'Er ging iets mis (' + r.status + ').');
      f.status = r.status;
      // Geblokkeerd e-mailadres of netwerk: altijd dezelfde vriendelijke tekst, zonder te zeggen wat er speelt. ('nog niet bevestigd' is iets anders.)
      if (r.status === 403 && AANMELD_ACTIES.includes(actie) && !j.nietBevestigd) { f.message = AANMELD_TEKST; f.aanmeldGeweigerd = true; }
      f.data = j;
      throw f;
    }
    return j;
  }

  // ---- versleuteling ----
  const b64u = (buf) => {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const vanB64u = (t) => {
    const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  };
  const schoonEmail = (e) => String(e || '').trim().toLowerCase();
  async function maakSleutel(email, ww) {
    const basis = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(ww)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('spo-backup-v1:' + schoonEmail(email)), iterations: ITERATIES }, basis, 256);
    return b64u(bits);
  }
  const aesSleutel = (s) => crypto.subtle.importKey('raw', vanB64u(s), 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function inpakken(bytes) {
    if (typeof CompressionStream !== 'function') return { z: false, b: bytes };
    const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return { z: true, b: new Uint8Array(await new Response(s).arrayBuffer()) };
  }
  async function uitpakken(bytes) {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function versleutel(sleutel, obj) {
    const { z, b } = await inpakken(new TextEncoder().encode(JSON.stringify(obj)));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesSleutel(sleutel), b);
    return (z ? 'v1z.' : 'v1.') + b64u(iv) + '.' + b64u(ct);
  }
  async function ontsleutel(sleutel, tekst) {
    const m = /^(v1z?)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(tekst || ''));
    if (!m) throw new Error('Onbekende back-up.');
    let b = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: vanB64u(m[2]) }, await aesSleutel(sleutel), vanB64u(m[3])));
    if (m[1] === 'v1z') b = await uitpakken(b);
    return JSON.parse(new TextDecoder().decode(b));
  }

  // ---- de back-up maken en terugzetten ----
  const leeg = (x) => x === undefined || x === null || (Array.isArray(x) ? x.length === 0 : typeof x === 'object' && Object.keys(x).length === 0);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  async function momentopname() {
    const r = await lees(BACKUP_SLEUTELS);
    const data = {};
    for (const k of BACKUP_SLEUTELS) {
      if (r[k] === undefined) continue;
      // de plaatjes zijn te groot voor de back-up: die worden na het terugzetten opnieuw getekend
      data[k] = k === 'spo_galerij' && Array.isArray(r[k]) ? r[k].map((e) => { const c = Object.assign({}, e); delete c.kaart; return c; }) : r[k];
    }
    return data;
  }
  // Voegt de back-up samen met wat er al in deze browser staat. Niets wat hier staat gaat verloren.
  // vers: deze browser is net (opnieuw) geïnstalleerd: wat hier staat zijn alleen standaardwaarden, dus de back-up gaat voor.
  function samenvoegen(k, hier, daar, vers) {
    if (leeg(hier)) return daar;
    if (leeg(daar)) return hier;
    switch (k) {
      case 'spo_winkel': {
        // gekochte spullen gaan nooit verloren: van allebei samen
        const h = obj(hier), d = obj(daar);
        const gekocht = Array.from(new Set([].concat(Array.isArray(d.gekocht) ? d.gekocht : [], Array.isArray(h.gekocht) ? h.gekocht : [])));
        const hg = obj(h.gebruik), dg = obj(d.gebruik);
        const kies = (x, y, std) => (x && x !== std ? x : y || x || std);
        return Object.assign({}, d, h, { gekocht, gebruik: vers ? Object.assign({}, hg, dg) : { somtoday: kies(hg.somtoday, dg.somtoday, 'standaard'), titel: kies(hg.titel, dg.titel, null), bg: kies(hg.bg, dg.bg, 'standaard') } });
      }
      case 'spo_galerij': {
        if (!Array.isArray(hier) || !Array.isArray(daar)) return hier;
        const ids = new Set(hier.map((e) => e && e.id));
        return hier.concat(daar.filter((e) => e && !ids.has(e.id))).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 150);
      }
      case 'spo_prestaties': {
        const u = Object.assign({}, obj(daar));
        for (const [id, ts] of Object.entries(obj(hier))) u[id] = u[id] ? Math.min(u[id], ts) : ts;
        return u;
      }
      case 'spo_geopend': {
        const u = Object.assign({}, obj(daar));
        for (const [id, n] of Object.entries(obj(hier))) u[id] = Math.max(u[id] || 0, n || 0);
        return u;
      }
      case 'spo_blokkades': {
        // geblokkeerd blijft geblokkeerd: de unie van allebei (van wie ik de bijnaam al kende, blijft die)
        const h = obj(hier), d = obj(daar), u = Object.assign({}, d, h);
        for (const [id, w] of Object.entries(u)) if (obj(w) && !obj(w).alias && obj(d[id]).alias) u[id] = Object.assign({}, w, { alias: d[id].alias });
        return u;
      }
      case 'spo_munten_ids':
      case 'spo_uitval_gezien':
        return Object.assign({}, obj(daar), obj(hier));
      case 'spo_munten':
        return vers || (obj(daar).totaal || 0) > (obj(hier).totaal || 0) ? daar : hier;
      case 'spo_munten_log':
        return (Array.isArray(hier) ? hier.length : 0) >= (Array.isArray(daar) ? daar.length : 0) ? hier : daar;
      case 'spo_stats': {
        const u = Object.assign({}, obj(daar), obj(hier));
        for (const [s, w] of Object.entries(obj(daar))) {
          const h = obj(hier)[s];
          if (Array.isArray(w) || Array.isArray(h)) u[s] = Array.from(new Set([].concat(w || [], h || [])));
          else if (typeof w === 'number' && typeof h === 'number') u[s] = Math.max(w, h);
        }
        return u;
      }
      case 'spo_uitnodigingen': {
        // beloningen gaan nooit verloren en tellen niet dubbel: de grootste teller, van allebei wie er beloond is
        const h = obj(hier), d = obj(daar);
        const link = [h.link, d.link].filter((x) => x > 0);
        return Object.assign({}, d, h, {
          v: 1, n: Math.min(10, Math.max(h.n || 0, d.n || 0)), link: link.length ? Math.min(...link) : 0,
          bekend: Object.assign({}, obj(d.bekend), obj(h.bekend)), beloond: Object.assign({}, obj(d.beloond), obj(h.beloond)),
          door: Object.assign({}, obj(d.door), obj(h.door)),
        });
      }
      case 'spo_capsules': {
        // tijdcapsules (v3.0): per kaart de nieuwste; is het dezelfde capsule, dan blijft 'geopend' en 'gemeld' staan
        const per = new Map();
        for (const c of [].concat(Array.isArray(daar) ? daar : [], Array.isArray(hier) ? hier : [])) {
          if (!c || typeof c.kaartId !== 'string') continue;
          const oud = per.get(c.kaartId);
          if (!oud || (c.gemaakt || 0) > (oud.gemaakt || 0)) per.set(c.kaartId, c);
          else if ((c.gemaakt || 0) === (oud.gemaakt || 0)) per.set(c.kaartId, Object.assign({}, oud, c, { geopend: Math.max(oud.geopend || 0, c.geopend || 0) || undefined, gemeld: Math.max(oud.gemeld || 0, c.gemeld || 0) || undefined }));
        }
        return [...per.values()].sort((x, y) => (y.gemaakt || 0) - (x.gemaakt || 0)).slice(0, 150);
      }
      case 'spo_weekoverzicht':
        return String(hier || '') > String(daar || '') ? hier : daar; // de laatste datum wint: zo komt het overzicht niet dubbel
      case 'spo_nieuw_gezien': {
        // Wat is nieuw (v3.0): de hoogste versie wint, numeriek vergeleken (2.10.0 is nieuwer dan 2.9.0)
        const dl = (v) => String(v == null ? '' : v).replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
        const x = dl(hier), y = dl(daar);
        for (let i = 0; i < Math.max(x.length, y.length, 3); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? hier : daar; }
        return hier;
      }
      case 'spo_rondleiding':
        return Math.max(Number(hier) || 0, Number(daar) || 0); // eenmaal gezien blijft gezien
      case 'spo_huisdier': {
        // het huisdier groeit alleen: de hoogste xp wint (en de bijbehorende naam en gezien-lijst gaan mee)
        const h = obj(hier), d = obj(daar);
        const w = (d.xp || 0) > (h.xp || 0) ? d : h, a = w === d ? h : d;
        return Object.assign({}, a, w, { xp: Math.max(h.xp || 0, d.xp || 0), ids: Array.from(new Set([].concat(Array.isArray(d.ids) ? d.ids : [], Array.isArray(h.ids) ? h.ids : []))).slice(-400) });
      }
      default:
        return vers ? daar : hier; // de rest (instellingen, team, vrienden, ...): deze browser gaat voor, behalve na een nieuwe installatie
    }
  }
  // Haalt de back-up op en zet hem terug (samengevoegd). Daarna gaat de nieuwe stand weer naar de server.
  async function herstel(vers) {
    const a = await account();
    if (!a) return { ok: false };
    const r = await roep('accBackupLaad', {}, a.sessie);
    let teruggezet = 0;
    if (r.data) {
      let pakket;
      try {
        pakket = await ontsleutel(a.sleutel, r.data);
      } catch (e) {
        // Niet te lezen (bijv. ander wachtwoord): niet overschrijven, wel melden.
        return { ok: false, fout: 'De back-up kon niet worden gelezen.' };
      }
      const data = obj(pakket && pakket.data);
      const hier = await lees(BACKUP_SLEUTELS);
      const nieuw = {};
      for (const k of BACKUP_SLEUTELS) {
        if (data[k] === undefined) continue;
        const w = samenvoegen(k, hier[k], data[k], vers === true);
        if (JSON.stringify(w) !== JSON.stringify(hier[k])) { nieuw[k] = w; teruggezet++; }
      }
      if (teruggezet) {
        bezigMetHerstel = true;
        try { await schrijf(nieuw); } finally { bezigMetHerstel = false; }
      }
    }
    await bewaar();
    return { ok: true, teruggezet };
  }
  let bezigMetHerstel = false;
  let bewaarKetting = Promise.resolve();
  function bewaar() {
    bewaarKetting = bewaarKetting.catch(() => {}).then(async () => {
      const a = await account();
      if (!a) return { ok: false };
      const data = await versleutel(a.sleutel, { v: 1, ts: Date.now(), data: await momentopname() });
      try {
        await roep('accBackupBewaar', { data }, a.sessie);
      } catch (e) {
        if (e.status === 401) await wis(SLEUTEL); // sessie verlopen of ingetrokken: opnieuw inloggen
        throw e;
      }
      await schrijf({ [SLEUTEL]: Object.assign({}, a, { laatsteBackup: Date.now() }) });
      return { ok: true };
    });
    return bewaarKetting;
  }

  // ---- inloggen en zo ----
  async function ingelogd(email, ww, r) {
    // Geen kaarten en geen geopende cijfers in deze browser? Dan is hij net geïnstalleerd en gaat de back-up voor.
    const hier = await lees(['spo_galerij', 'spo_geopend']);
    const vers = leeg(hier.spo_galerij) && leeg(hier.spo_geopend);
    const sleutel = await maakSleutel(email, ww);
    await schrijf({ [SLEUTEL]: { email: schoonEmail(email), sessie: r.sessie, account: r.account, sleutel, sinds: Date.now() } });
    return herstel(vers);
  }
  const SPOAccount = {
    SLEUTEL, BACKUP_SLEUTELS,
    zetServer(url) { server = url || SERVER_STANDAARD; },
    async status() {
      const a = await account();
      return a ? { ingelogd: true, email: a.email, laatsteBackup: a.laatsteBackup || 0 } : { ingelogd: false };
    },
    registreer: (email, ww) => roep('accRegistreer', { email, ww }),
    codeOpnieuw: (email) => roep('accCodeOpnieuw', { email }),
    vergeten: (email) => roep('accVergeten', { email }),
    async verifieer(email, code, ww) {
      const r = await roep('accVerifieer', { email, code });
      return ingelogd(email, ww, r);
    },
    async login(email, ww) {
      const r = await roep('accLogin', { email, ww });
      return ingelogd(email, ww, r);
    },
    async reset(email, code, ww) {
      const r = await roep('accReset', { email, code, ww });
      return ingelogd(email, ww, r);
    },
    async uitloggen() {
      const a = await account();
      try { if (a) await bewaar(); } catch (e) { /* toch uitloggen */ }
      try { if (a) await roep('accUitloggen', {}, a.sessie); } catch (e) { /* al weg */ }
      await wis(SLEUTEL);
    },
    async verwijder() {
      const a = await account();
      if (a) await roep('accVerwijder', {}, a.sessie);
      await wis(SLEUTEL);
    },
    herstel,
    bewaar,
    get bezigMetHerstel() { return bezigMetHerstel; },
    // voor tests
    maakSleutel, versleutel, ontsleutel, samenvoegen, momentopname,
  };
  globalThis.SPOAccount = SPOAccount;
  if (typeof module !== 'undefined' && module.exports) module.exports = SPOAccount;
})();
