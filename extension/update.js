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
  // Elke 10 minuten (alleen als er een Somtoday-pagina of het paneel open is). Met een ETag: een antwoord 'niets veranderd' (304)
  // telt niet mee voor de limiet van GitHub, zodat een hele klas op één schoolnetwerk niet tegen die limiet aanloopt.
  const INTERVAL = 10 * 60 * 1000;

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
