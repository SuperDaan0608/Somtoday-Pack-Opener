/*
 * Somtoday Pack Opener: controle op een nieuwe versie.
 * Hoogstens één keer per 6 uur één GET naar de GitHub-releases. Geen tracking, geen andere gegevens.
 * Het resultaat staat in chrome.storage.local onder 'spo_update'; de pagina's laten alleen dat zien.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const URL_LAATSTE = 'https://api.github.com/repos/SuperDaan0608/Somtoday-Pack-Opener/releases/latest';
  const SLEUTEL = 'spo_update';
  // Elke minuut (alleen als er een Somtoday-pagina of het paneel open is). Met een ETag: een antwoord 'niets veranderd' (304)
  // telt niet mee voor de limiet van GitHub, zodat een hele klas op één schoolnetwerk niet tegen die limiet aanloopt.
  const INTERVAL = 60 * 1000;

  const delen = (v) => String(v || '').replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  function nieuwer(a, b) {
    const x = delen(a), y = delen(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }

  async function controleer(forceer) {
    const r = await chrome.storage.local.get(SLEUTEL);
    const oud = r[SLEUTEL] && typeof r[SLEUTEL] === 'object' ? r[SLEUTEL] : {};
    if (!forceer && oud.ts && Date.now() - oud.ts < INTERVAL) return oud;
    let nieuw = { ...oud, ts: Date.now() };
    try {
      const kop = { Accept: 'application/vnd.github+json' };
      if (oud.etag && oud.versie) kop['If-None-Match'] = oud.etag;
      const res = await fetch(URL_LAATSTE, { headers: kop, credentials: 'omit', cache: 'no-store' });
      if (res.status === 304) nieuw = { ...oud, ts: Date.now() };
      else if (res.ok) {
        const j = await res.json();
        const versie = String(j.tag_name || '').replace(/^v/i, '');
        const zips = (Array.isArray(j.assets) ? j.assets : []).filter((a) => a && /\.zip$/i.test(a.name || '') && /^https:\/\//.test(a.browser_download_url || ''));
        const firefox = zips.find((a) => /firefox/i.test(a.name));
        const chromeZip = zips.find((a) => !/firefox/i.test(a.name));
        nieuw = {
          ts: Date.now(),
          versie,
          pagina: /^https:\/\/github\.com\//.test(j.html_url || '') ? j.html_url : 'https://github.com/SuperDaan0608/Somtoday-Pack-Opener/releases/latest',
          zipChrome: chromeZip ? chromeZip.browser_download_url : '',
          zipFirefox: firefox ? firefox.browser_download_url : '',
          later: oud.later || '',
          etag: res.headers.get('ETag') || '',
        };
      }
    } catch (e) { /* offline of geblokkeerd: probeer over 6 uur opnieuw */ }
    await chrome.storage.local.set({ [SLEUTEL]: nieuw });
    return nieuw;
  }

  chrome.runtime.onMessage.addListener((m, _afz, antwoord) => {
    if (!m || m.type !== 'spo-update-check') return;
    controleer(m.forceer === true && m.test === true).then(antwoord, () => antwoord(null));
    return true;
  });
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => controleer(false));
  controleer(false).catch(() => {});
  if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(() => controleer(false));
})();

/*
 * v2.2: automatische back-up van je voortgang naar je account (zie account.js).
 * Zodra er iets verandert dat in de back-up hoort, sturen we na 4 seconden rust de nieuwe (versleutelde) stand.
 * In Chrome is dit een service worker (account.js via importScripts); in Firefox staat account.js al in de lijst met achtergrondscripts.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  try {
    if (!globalThis.SPOAccount && typeof importScripts === 'function') importScripts('account.js');
  } catch (e) { /* zonder account geen back-up */ }
  const A = globalThis.SPOAccount;
  if (!A || !chrome.storage || !chrome.storage.onChanged) return;
  let timer = 0;
  chrome.storage.onChanged.addListener((wijz, gebied) => {
    if (gebied !== 'local' || A.bezigMetHerstel) return;
    if (!Object.keys(wijz).some((k) => A.BACKUP_SLEUTELS.includes(k))) return;
    clearTimeout(timer);
    timer = setTimeout(() => A.bewaar().catch(() => { /* offline: de volgende wijziging probeert het opnieuw */ }), 4000);
  });
  // Bij het opstarten van de browser: de back-up van een ander apparaat erbij halen.
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => A.herstel().catch(() => {}));
})();

/*
 * v2.4: meldingen rechtsboven op Somtoday bij een nieuw vriendverzoek of een uitdaging voor een duel.
 * De Somtoday-pagina (meldingen.js) vraagt elke paar seconden 'iets nieuws?'. Wij doen dan één goedkope 'puls' bij de server
 * en halen alleen meer op als daar iets veranderd is. Berichten worden hier alleen gelezen (eigen cursor), niet weggehaald:
 * de Team-pagina ziet ze daarna gewoon nog.
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  try {
    if (!globalThis.SPOVrienden && typeof importScripts === 'function') importScripts('vriendenlib.js');
  } catch (e) { /* zonder vriendenlib geen meldingen */ }
  const L = globalThis.SPOVrienden;
  if (!L) return;
  let bezig = null, laatst = 0, vh = null, eerste = true;
  const cursor = {};
  const gezienVerzoek = new Set();
  const gezienUitdaging = new Set();

  async function kijk() {
    const st = await L.laad();
    if (!st) return [];
    const cl = L.clientVan(st);
    const p = await cl.roep('puls');
    const uit = [];
    if (vh === null || p.vh !== vh) {
      vh = p.vh;
      const inb = await cl.roep('inbox');
      for (const r of inb.verzoeken || []) {
        if (gezienVerzoek.has(r.id)) continue;
        gezienVerzoek.add(r.id);
        const bekend = st.vrienden.find((v) => v.id === r.id && v.status === 'vriend');
        // Bij de eerste keer niet alle oude verzoeken melden die je al gezien had (die staan al als 'ontvangen' in je lijst).
        if (!bekend && !(eerste && st.vrienden.some((v) => v.id === r.id && v.status === 'ontvangen'))) uit.push({ soort: 'verzoek', tekst: 'Je hebt een nieuw vriendverzoek.' });
      }
    }
    for (const x of p.post || []) {
      if (x.seq <= (cursor[x.van] || 0)) continue;
      const v = st.vrienden.find((y) => y.id === x.van && y.status === 'vriend');
      if (!v) continue;
      const lijst = await L.haalBerichten(st, v, cursor);
      for (const b of lijst) {
        if (b.m.t !== 'uitnodiging' || b.leeftijd >= 300 || typeof b.m.mid !== 'string') continue;
        if (gezienUitdaging.has(b.m.mid)) continue;
        gezienUitdaging.add(b.m.mid);
        uit.push({ soort: 'duel', tekst: `${L.naam(v)} daagt je uit voor een duel!` });
      }
    }
    eerste = false;
    return uit;
  }

  chrome.runtime.onMessage.addListener((m, _afz, antwoord) => {
    if (!m || m.type !== 'spo-meldingen') return;
    // Meerdere tabbladen tegelijk: hoogstens één keer per 4 seconden echt bij de server kijken.
    if (bezig || Date.now() - laatst < 4000) { antwoord([]); return; }
    laatst = Date.now();
    bezig = kijk().catch(() => []).then((r) => { bezig = null; antwoord(r); });
    return true;
  });
})();
