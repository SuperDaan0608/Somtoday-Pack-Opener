// Overzicht in de Pack Opener: je eigen voetballer en je eigen stadion (voetbal.js tekent ze).
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const V = globalThis.SPOVoetbal;
  const av = document.getElementById('hs-avatar'), sd = document.getElementById('hs-stadion'), tekst = document.getElementById('hs-tekst');
  if (!V || !av || !sd || !tekst) return;
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  async function toon() {
    let r = {};
    try { r = await chrome.storage.local.get(['spo_voetbal', 'spo_winkel']); } catch (e) { /* geen opslag */ }
    const gekocht = Array.isArray(obj(r.spo_winkel).gekocht) ? r.spo_winkel.gekocht.filter((x) => typeof x === 'string') : [];
    const t = V.schoonToestand(r.spo_voetbal, gekocht);
    V.tekenAvatar(av, t.avatar, { pose: 'staan', schaal: 1 });
    V.tekenStadion(sd, t.stadion, { schaal: 0.67 });
    av.setAttribute('aria-label', V.beschrijfAvatar(t.avatar));
    sd.setAttribute('aria-label', V.beschrijfStadion(t.stadion));
    tekst.textContent = obj(r.spo_voetbal).avatar || obj(r.spo_voetbal).stadion
      ? `${t.stadion.naam || 'Je stadion'}, met rugnummer ${t.avatar.nummer}.`
      : 'Je hebt nog geen eigen voetballer of stadion gemaakt. Maak ze nu: het kost niets.';
  }
  try { chrome.storage.onChanged.addListener((w, g) => { if (g === 'local' && (w.spo_voetbal || w.spo_winkel)) toon(); }); } catch (e) { /* geen opslag */ }
  toon();
})();
