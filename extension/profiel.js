// Tabblad Profiel: je eigen spelerskaart, bijnaam, titel en achtergrond, delen met vrienden en downloaden als plaatje.
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const E = globalThis.SPOEco;
  const $ = (id) => document.getElementById(id);
  let galerij = [];
  let teken = 0;
  let timer = 0;

  async function huidig() {
    const s = await E.lees();
    let g = [];
    try { g = (await chrome.storage.local.get('spo_galerij')).spo_galerij; } catch (e) { /* leeg */ }
    galerij = Array.isArray(g) ? g.filter((x) => x && Number.isFinite(x.cijfer)) : [];
    return s;
  }
  function vulKeuze(sel, soort, standaard, gekocht, gekozen) {
    sel.replaceChildren();
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = standaard; sel.append(o0);
    for (const it of E.ITEMS) if (it.soort === soort && gekocht.includes(it.id)) { const o = document.createElement('option'); o.value = it.id; o.textContent = it.naam; sel.append(o); }
    sel.value = gekozen || '';
  }
  async function toon(vulFormulier) {
    const mijn = ++teken;
    const s = await huidig();
    if (vulFormulier) {
      $('bijnaam').value = s.profiel.bijnaam;
      $('deel').checked = s.profiel.deel;
      vulKeuze($('titel'), 'titel', 'Geen titel', s.winkel.gekocht, s.winkel.gebruik.titel);
      vulKeuze($('bg'), 'bg', 'Standaard', s.winkel.gekocht, s.winkel.gebruik.bg === 'standaard' ? '' : s.winkel.gebruik.bg);
    }
    const p = E.maakProfiel(galerij, s.munten, s.winkel, { bijnaam: $('bijnaam').value });
    if (mijn !== teken) return;
    await E.tekenProfiel($('kaart'), p);
    $('kaart').setAttribute('aria-label', `Je profielkaart: ${p.bn || 'speler'}, niveau ${p.ovr}, ${p.s.map((x) => x.v + ' ' + x.n).join(', ')}`);
  }
  function meld(t) { $('melding').textContent = t; setTimeout(() => ($('melding').textContent = ''), 3000); }

  $('bijnaam').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { await E.bewaarProfiel({ bijnaam: $('bijnaam').value }); toon(false); }, 300);
  });
  $('deel').addEventListener('change', async () => { await E.bewaarProfiel({ deel: $('deel').checked }); meld('Opgeslagen.'); });
  $('titel').addEventListener('change', async () => { await E.gebruik('titel', $('titel').value || null); toon(false); });
  $('bg').addEventListener('change', async () => { await E.gebruik('bg', $('bg').value || null); toon(false); });
  $('naar-winkel').addEventListener('click', () => { try { parent.postMessage({ bron: 'spo-embed', versie: 1, type: 'ga', tab: 'winkel' }, location.origin); } catch (e) { /* los */ } });
  $('download').addEventListener('click', () => {
    $('kaart').toBlob((b) => {
      if (!b) return meld('Downloaden lukte niet.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'profielkaart.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  });
  try {
    chrome.storage.onChanged.addListener((w, g) => { if (g === 'local' && (w.spo_galerij || w.spo_munten || w.spo_winkel)) toon(!!w.spo_winkel); });
  } catch (e) { /* geen opslag */ }
  E.sweep().catch(() => {}).then(() => toon(true));
})();
