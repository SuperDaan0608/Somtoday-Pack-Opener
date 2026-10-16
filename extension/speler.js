// Tabblad Speler: de editor voor je eigen voetballer (avatar) en je eigen stadion.
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const E = globalThis.SPOEco;
  const V = globalThis.SPOVoetbal;
  const $ = (id) => document.getElementById(id);
  let staat = null;       // { avatar, stadion } (schoon)
  let gekocht = [];
  let juichen = false;
  let melTimer = 0;
  let nummerTimer = 0, naamTimer = 0;

  function meld(t, fout) {
    const m = $('melding');
    m.textContent = t;
    m.classList.toggle('fout', !!fout);
    clearTimeout(melTimer);
    melTimer = setTimeout(() => (m.textContent = ''), 4000);
  }
  const heeft = (o) => !o.item || gekocht.includes(o.item);

  // Een groep keuzeknoppen (radiogroup): pijltjestoetsen verplaatsen de keuze, Tab gaat de groep uit.
  function groep(id, opties, waarde, kleur, onKies) {
    const box = $(id);
    // het toetsenbord blijft waar het was, ook als de knoppen opnieuw getekend worden
    const focusIdx = box.contains(document.activeElement) ? Array.from(box.querySelectorAll('button')).indexOf(document.activeElement) : -1;
    box.replaceChildren();
    opties.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      const vrij = o.vrij !== false && heeft(o);
      const aan = o.id === waarde;
      b.setAttribute('aria-checked', aan ? 'true' : 'false');
      b.setAttribute('aria-label', o.naam + (vrij ? '' : ' (vergrendeld, te koop in de winkel)'));
      if (!vrij) b.setAttribute('aria-disabled', 'true');
      b.tabIndex = aan || (!opties.some((x) => x.id === waarde) && i === 0) ? 0 : -1;
      b.title = vrij ? o.naam : o.naam + ': koop dit in de winkel';
      if (kleur) b.style.background = o.kleur;
      else b.textContent = (vrij ? '' : '🔒 ') + o.naam;
      b.addEventListener('click', () => {
        if (!vrij) { meld(`${o.naam} koop je in de winkel.`, true); return; }
        onKies(o.id);
      });
      box.append(b);
    });
    if (focusIdx >= 0 && box.children[focusIdx]) box.children[focusIdx].focus();
    box.onkeydown = (e) => {
      const kn = Array.from(box.querySelectorAll('button'));
      const nu = kn.indexOf(document.activeElement);
      if (nu < 0) return;
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (nu + 1) % kn.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (nu - 1 + kn.length) % kn.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = kn.length - 1;
      if (n < 0) return;
      e.preventDefault();
      kn.forEach((k, i) => (k.tabIndex = i === n ? 0 : -1));
      kn[n].focus();
    };
  }
  const kleurOpties = (namen, kleuren) => kleuren.map((k, i) => ({ id: i, naam: namen[i], kleur: k }));
  const kitOpties = () => V.KIT.map((k) => Object.assign({}, k, { kleur: k.shirt }));
  const tribuneOpties = () => V.TRIBUNE.map((k) => Object.assign({}, k));

  function tekenAlles() {
    const a = staat.avatar, s = staat.stadion;
    V.tekenAvatar($('av-canvas'), a, { pose: juichen ? a.juich : 'staan', schaal: 1.6 });
    $('av-canvas').setAttribute('aria-label', V.beschrijfAvatar(a));
    V.tekenStadion($('sd-canvas'), s, { schaal: 1.5 });
    $('sd-canvas').setAttribute('aria-label', V.beschrijfStadion(s));
    $('av-juich').setAttribute('aria-pressed', juichen ? 'true' : 'false');
    $('av-juich').textContent = juichen ? 'Weer rustig staan' : 'Bekijk het juichen';
    const q = new URLSearchParams({ strafschop: '1', av: JSON.stringify(V.naarSchutter(a)), thema: JSON.stringify(V.naarThema(s)) });
    $('proef').href = 'stage.html?' + q.toString();
  }
  function tekenKeuzes() {
    const a = staat.avatar, s = staat.stadion;
    groep('k-huid', kleurOpties(V.HUID_NAMEN, V.HUID), a.huid, true, (i) => bewaar({ avatar: { huid: i } }));
    groep('k-haar', V.HAAR, a.haar, false, (i) => bewaar({ avatar: { haar: i } }));
    groep('k-haarkleur', kleurOpties(V.HAARKLEUR_NAMEN, V.HAARKLEUR), a.haarkleur, true, (i) => bewaar({ avatar: { haarkleur: i } }));
    groep('k-kit', kitOpties(), a.kit, true, (i) => bewaar({ avatar: { kit: i } }));
    groep('k-juich', V.JUICH, a.juich, false, (i) => { juichen = true; bewaar({ avatar: { juich: i } }); });
    groep('k-thema', V.THEMA, s.thema, false, (i) => bewaar({ stadion: { thema: i } }));
    groep('k-tribune', tribuneOpties(), s.tribune, true, (i) => bewaar({ stadion: { tribune: i } }));
    groep('k-vlag', V.VLAG, s.vlag, false, (i) => bewaar({ stadion: { vlag: i } }));
    groep('k-veld', V.VELD, s.veld, false, (i) => bewaar({ stadion: { veld: i } }));
  }
  // De kleurknoppen voor huid en haar gebruiken een getal als sleutel; de lijst van de kleurgroepen moet dus 'id' als getal houden.
  async function laad(vulVelden) {
    const r = await E.leesVoetbal();
    if (!r) { meld('Deze pagina werkt niet zonder voetbal.js.', true); return; }
    staat = r.staat; gekocht = r.gekocht;
    if (vulVelden) {
      $('nummer').value = String(staat.avatar.nummer);
      $('sd-naam').value = staat.stadion.naam;
      const p = (await E.lees()).profiel;
      $('deel').checked = p.deel;
    }
    tekenKeuzes();
    tekenAlles();
  }
  async function bewaar(wijzig) {
    try { staat = await E.bewaarVoetbal(wijzig); } catch (e) { meld('Opslaan lukte niet.', true); return; }
    const r = await E.leesVoetbal();
    if (r) gekocht = r.gekocht;
    tekenKeuzes();
    tekenAlles();
    meld('Opgeslagen.');
  }

  // Rugnummer: een getal van 1 tot en met 99.
  $('nummer').addEventListener('input', () => {
    clearTimeout(nummerTimer);
    const n = parseInt($('nummer').value, 10);
    const ok = Number.isInteger(n) && n >= 1 && n <= 99;
    $('nummer').setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (!ok) return;
    nummerTimer = setTimeout(() => bewaar({ avatar: { nummer: n } }), 250);
  });
  $('nummer').addEventListener('blur', () => { if (staat) { $('nummer').value = String(staat.avatar.nummer); $('nummer').setAttribute('aria-invalid', 'false'); } });

  // Stadionnaam: door het tekstfilter (hooguit 24 tekens). Een naam die niet door het filter komt wordt niet bewaard.
  SPOTekst.koppel($('sd-naam'), { soort: 'naam', max: V.NAAM_MAX });
  $('sd-naam').addEventListener('input', () => {
    clearTimeout(naamTimer);
    if (!SPOTekst.geldig($('sd-naam'), { soort: 'naam', max: V.NAAM_MAX })) return;
    naamTimer = setTimeout(() => bewaar({ stadion: { naam: $('sd-naam').value } }), 350);
  });

  $('av-juich').addEventListener('click', () => { juichen = !juichen; tekenAlles(); });
  $('deel').addEventListener('change', async () => { await E.bewaarProfiel({ deel: $('deel').checked }); meld('Opgeslagen.'); });

  try {
    chrome.storage.onChanged.addListener((w, g) => { if (g === 'local' && (w.spo_winkel || w.spo_voetbal)) laad(false); });
  } catch (e) { /* geen opslag */ }
  E.sweep().catch(() => {}).then(() => laad(true));
})();
