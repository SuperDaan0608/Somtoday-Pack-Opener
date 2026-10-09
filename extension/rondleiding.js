/*
 * Somtoday Pack Opener v2.4: de rondleiding voor nieuwe spelers (in hub.html).
 * Negen korte stappen, elk met een spotlight op het juiste tabblad of onderdeel. De vlag 'spo_rondleiding' (een versienummer)
 * staat in chrome.storage.local en in de account-back-up (account.js), zodat de rondleiding na een update niet opnieuw komt.
 * hub.js geeft ons via window.SPOHub de tabs: { kies(naam), huidig() }.
 * Gebruik: SPORondleiding.autostart() (één keer per paginalading, alleen als je bent ingelogd en hem nog niet zag)
 *          SPORondleiding.start() (altijd, bijvoorbeeld met de knop bij Instellingen).
 */
(function () {
  'use strict';
  const chrome = typeof browser !== 'undefined' && browser.runtime ? browser : globalThis.chrome;
  const SLEUTEL = 'spo_rondleiding';
  const VERSIE = 1; // hoger maken = iedereen krijgt de rondleiding nog een keer te zien

  const maak = (tag, klas, tekst) => {
    const el = document.createElement(tag);
    if (klas) el.className = klas;
    if (tekst != null) el.textContent = tekst;
    return el;
  };
  const L = globalThis.SPOLadder || { NAAM: ['', 'Zeldzaam', 'Glim', 'Kosmisch', 'Mythisch'], KANS: ['', '1/10', '1/40', '1/150', '1/1000'] };

  // ───── Extra's onder de tekst ─────
  const TREDEN = [
    { naam: 'Brons', wat: 'onder de 5,5', kleur: '#e08a4a' },
    { naam: 'Zilver', wat: '5,5 tot 7', kleur: '#dfe9f5' },
    { naam: 'Goud', wat: 'vanaf 7', kleur: '#ffcc33' },
    { naam: 'Speciaal', wat: 'vanaf 9', kleur: '#38e1ff' },
  ];
  function extraNiveaus() {
    const ul = maak('ul', 'rl-chips');
    ul.setAttribute('aria-label', 'Niveaus van een kaart');
    for (const t of TREDEN) {
      const li = maak('li');
      const punt = maak('i');
      punt.style.background = t.kleur;
      punt.setAttribute('aria-hidden', 'true');
      li.append(punt, maak('b', '', t.naam), maak('span', '', t.wat));
      ul.append(li);
    }
    return ul;
  }
  function extraLadder() {
    const ul = maak('ul', 'rl-ladder');
    ul.setAttribute('aria-label', 'De ladder');
    for (let n = 1; n <= 4; n++) {
      const li = maak('li', 'rl-trede rl-t' + n);
      li.append(maak('b', '', L.NAAM[n]), maak('span', '', '1 op ' + L.KANS[n].split('/')[1]));
      ul.append(li);
    }
    return ul;
  }
  function extraVloek() {
    const p = maak('p', 'rl-vloek');
    p.append(maak('b', '', 'Vervloekte kaart. '), document.createTextNode('Haal je een onvoldoende (onder de 5,5) op een zeldzame of hogere trede? Dan is de kaart in 1 van de 15 gevallen vervloekt: sterker, maar hij kan zich tegen je keren.'));
    return p;
  }
  const tot = (...fns) => () => {
    const f = document.createDocumentFragment();
    for (const fn of fns) f.append(fn());
    return f;
  };

  const STAPPEN = [
    { tab: 'overzicht', doel: '#hero', titel: 'Welkom bij de Pack Opener',
      tekst: 'Je cijfers worden pakjes. Open een nieuw cijfer op Somtoday en je krijgt een kaart. Je cijfers zelf veranderen nooit: dit is alleen voor de lol.' },
    { tab: 'proberen', doel: '.voorbeeld', titel: 'Kaarten en niveaus',
      tekst: 'Elk cijfer wordt een kaart. Hoe hoger je cijfer, hoe mooier de kaart. Bij een 10 krijg je een icoon.', extra: extraNiveaus },
    { tab: 'proberen', doel: '.veld.proef', titel: 'De ladder',
      tekst: 'Soms is een kaart extra bijzonder. Dan staat hij hoger op de ladder. Dit zijn de kansen. Welke trede je krijgt ligt vast per cijfer: opnieuw openen helpt niet.', extra: tot(extraLadder, extraVloek) },
    { tab: 'galerij', doel: '#tab-galerij', titel: 'Galerij',
      tekst: 'Elke kaart die je opent blijft bewaard in je Galerij. Bekijk ze, zoek ze en laat ze zien aan je vrienden.' },
    { tab: 'winkel', doel: '#tab-winkel', ook: '#munten', titel: 'Munten en Winkel',
      tekst: 'Munten verdien je met cijfers openen, duels winnen, prestaties en een beloning per dag. Je begint met 50. In de Winkel koop je thema\'s, kaartranden en titels. Het is alleen voor de sier.' },
    { tab: 'team', doel: '#tab-team', titel: 'Team en duels',
      tekst: 'Zet je beste kaarten in je Team en speel duels tegen vrienden. Hoe hoger de trede op de ladder, hoe sterker je kaart. Een autoclicker telt niet mee: alleen echte klikken.' },
    { tab: 'vrienden', doel: '#tab-vrienden', titel: 'Vrienden',
      tekst: 'Geef je vriendcode aan een klasgenoot en vul de zijne in. Dan zien jullie elkaars kaarten, kun je GG sturen bij een zeldzame trekking en kunnen vrienden meekijken als jij iets kosmisch of mythisch opent. Dat kan alleen met vrienden die dezelfde versie hebben.' },
    { tab: 'prestaties', doel: '#tab-prestaties', titel: 'Huisdier en Prestaties',
      tekst: 'Linksonder op Somtoday woont een draakje. Het groeit met je cijfers en is blij na een voldoende. Bij Prestaties verzamel je beloningen voor bijzondere dingen.' },
    { tab: 'instellingen', doel: '#rondleiding-opnieuw', titel: 'Klaar!',
      tekst: 'Dat was alles. Wil je dit nog eens zien? Druk hier bij Instellingen op Rondleiding opnieuw. Veel plezier met je cijfers!' },
  ];

  // ───── Opslag ─────
  async function gezien() {
    try {
      const r = await chrome.storage.local.get(SLEUTEL);
      return Number(r[SLEUTEL]) >= VERSIE;
    } catch (e) {
      return true; // geen opslag: niet elke keer zeuren
    }
  }
  function bewaarGezien() {
    try { chrome.storage.local.set({ [SLEUTEL]: VERSIE }); } catch (e) { /* geen opslag */ }
  }

  // ───── De rondleiding zelf ─────
  let open = null; // { sluit }
  let autoGestart = false;

  function start() {
    if (open) return;
    const hub = window.SPOHub;
    const hubEl = document.getElementById('hub');
    if (!hub || !hubEl) return;
    const terugTab = hub.huidig();
    const terugFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const smal = matchMedia('(max-width: 760px)');
    let i = 0;

    const wortel = maak('div', 'rl');
    const licht = maak('div', 'rl-licht');
    const ring = maak('div', 'rl-ring');
    const kaart = maak('div', 'rl-kaart');
    kaart.setAttribute('role', 'dialog');
    kaart.setAttribute('aria-modal', 'true');
    kaart.setAttribute('aria-labelledby', 'rl-titel');
    kaart.setAttribute('aria-describedby', 'rl-tekst');
    kaart.tabIndex = -1;
    const stap = maak('p', 'rl-stap');
    const titel = maak('h2', '');
    titel.id = 'rl-titel';
    const tekst = maak('p', 'rl-tekst');
    tekst.id = 'rl-tekst';
    const extra = maak('div', 'rl-extra');
    const voet = maak('div', 'rl-voet');
    const bollen = maak('div', 'rl-bollen');
    bollen.setAttribute('aria-hidden', 'true');
    for (let n = 0; n < STAPPEN.length; n++) bollen.append(maak('i'));
    const overslaan = maak('button', 'rl-over', 'Overslaan');
    overslaan.type = 'button';
    const terug = maak('button', 'knop', 'Terug');
    terug.type = 'button';
    const volgende = maak('button', 'knop goud', 'Volgende');
    volgende.type = 'button';
    const knoppen = maak('div', 'rl-knoppen');
    knoppen.append(overslaan, terug, volgende);
    voet.append(bollen, knoppen);
    kaart.append(stap, titel, tekst, extra, voet);
    const live = maak('p', 'rl-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    wortel.append(licht, ring, kaart, live);
    document.body.append(wortel);
    hubEl.inert = true;

    const rect = (sel) => {
      const el = sel ? document.querySelector(sel) : null;
      if (!el || !el.getClientRects().length) return null;
      return el.getBoundingClientRect();
    };
    const zetBlok = (el, r, marge) => {
      if (!r) { el.hidden = true; return; }
      el.hidden = false;
      el.style.left = r.left - marge + 'px';
      el.style.top = r.top - marge + 'px';
      el.style.width = r.width + 2 * marge + 'px';
      el.style.height = r.height + 2 * marge + 'px';
    };

    // Zet doel(en) in beeld en de kaart ernaast (breed scherm) of onderaan (smal scherm).
    function plaats() {
      const s = STAPPEN[i];
      const doel = document.querySelector(s.doel);
      if (doel && doel.getClientRects().length) {
        try { doel.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* geen scrollen */ }
      }
      const vw = innerWidth, vh = innerHeight;
      const h = kaart.offsetHeight, w = kaart.offsetWidth;
      let r = rect(s.doel);
      if (r && smal.matches) {
        // het doel mag niet onder het kaartje verdwijnen: schuif het paneel zo nodig
        const vrij = vh - h - 24;
        if (r.bottom > vrij) {
          const paneel = doel.closest('.paneel');
          if (paneel) {
            paneel.scrollTop += Math.min(r.bottom - vrij + 8, Math.max(0, r.top - 70));
            r = rect(s.doel);
          }
        }
      }
      wortel.classList.toggle('rl-geen', !r);
      zetBlok(licht, r, 6);
      zetBlok(ring, rect(s.ook), 4);
      let x, y;
      if (smal.matches) {
        // staat het doel nog onder het kaartje, dan gaat het kaartje bovenaan staan
        const boven = !!r && r.bottom > vh - h - 20 && r.top > h + 24;
        kaart.classList.add('rl-onder');
        kaart.classList.toggle('rl-boven', boven);
        kaart.style.left = kaart.style.top = '';
        return;
      }
      kaart.classList.remove('rl-onder', 'rl-boven');
      if (!r) {
        x = (vw - w) / 2; y = (vh - h) / 2;
      } else if (r.right + 20 + w <= vw - 16) {
        x = r.right + 20; y = Math.min(Math.max(16, r.top + r.height / 2 - h / 2), vh - h - 16);
      } else if (r.bottom + 16 + h <= vh - 16) {
        x = Math.min(Math.max(16, r.left), vw - w - 16); y = r.bottom + 16;
      } else if (r.top - 16 - h >= 16) {
        x = Math.min(Math.max(16, r.left), vw - w - 16); y = r.top - 16 - h;
      } else if (r.left - 20 - w >= 16) {
        x = r.left - 20 - w; y = Math.min(Math.max(16, r.top), vh - h - 16);
      } else {
        x = (vw - w) / 2; y = vh - h - 16;
      }
      kaart.style.left = Math.round(x) + 'px';
      kaart.style.top = Math.round(y) + 'px';
    }

    function toon(nieuw, focus = true) {
      i = Math.max(0, Math.min(STAPPEN.length - 1, nieuw));
      const s = STAPPEN[i];
      hub.kies(s.tab);
      stap.textContent = `Stap ${i + 1} van ${STAPPEN.length}`;
      titel.textContent = s.titel;
      tekst.textContent = s.tekst;
      extra.replaceChildren();
      if (s.extra) extra.append(s.extra());
      extra.hidden = !s.extra;
      terug.hidden = i === 0;
      overslaan.hidden = i === STAPPEN.length - 1;
      volgende.textContent = i === STAPPEN.length - 1 ? 'Aan de slag' : 'Volgende';
      Array.from(bollen.children).forEach((b, n) => { b.className = n === i ? 'nu' : n < i ? 'af' : ''; });
      live.textContent = `Stap ${i + 1} van ${STAPPEN.length}: ${s.titel}`;
      kaart.classList.remove('rl-in');
      void kaart.offsetWidth;
      kaart.classList.add('rl-in');
      kaart.scrollTop = 0;
      plaats();
      requestAnimationFrame(plaats); // na de eerste layout van het nieuwe tabblad
      if (focus) volgende.focus({ preventScroll: true });
    }

    function sluit() {
      if (!open) return;
      open = null;
      document.removeEventListener('keydown', toets, true);
      removeEventListener('resize', plaats);
      smal.removeEventListener('change', plaats);
      wortel.remove();
      hubEl.inert = false;
      bewaarGezien();
      hub.kies(terugTab);
      const fok = terugFocus && terugFocus.isConnected && !terugFocus.closest('[hidden]') ? terugFocus : document.getElementById('tab-' + terugTab);
      if (fok) fok.focus({ preventScroll: true });
    }

    function toets(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        sluit();
      } else if (e.key === 'ArrowRight' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (i < STAPPEN.length - 1) toon(i + 1, false);
      } else if (e.key === 'ArrowLeft' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (i > 0) toon(i - 1, false);
      } else if (e.key === 'Tab') {
        // focus-val: alleen de knoppen van het kaartje
        const lijst = Array.from(kaart.querySelectorAll('button')).filter((b) => !b.hidden);
        if (!lijst.length) return;
        const eerste = lijst[0], laatste = lijst[lijst.length - 1];
        const nu = document.activeElement;
        if (!kaart.contains(nu) || nu === kaart) {
          e.preventDefault();
          (e.shiftKey ? laatste : eerste).focus();
        } else if (e.shiftKey && nu === eerste) {
          e.preventDefault();
          laatste.focus();
        } else if (!e.shiftKey && nu === laatste) {
          e.preventDefault();
          eerste.focus();
        }
      }
    }

    volgende.addEventListener('click', () => (i >= STAPPEN.length - 1 ? sluit() : toon(i + 1)));
    terug.addEventListener('click', () => toon(i - 1));
    overslaan.addEventListener('click', sluit);
    document.addEventListener('keydown', toets, true);
    addEventListener('resize', plaats);
    smal.addEventListener('change', plaats);
    open = { sluit };
    toon(0);
  }

  async function autostart() {
    if (autoGestart) return;
    autoGestart = true;
    const A = globalThis.SPOAccount;
    try {
      // Pas na het inloggen: tot dan staat het inlogscherm (poort.js) over het paneel.
      if (!A || !(await A.status()).ingelogd) return;
      if (await gezien()) return;
    } catch (e) {
      return;
    }
    start();
  }

  globalThis.SPORondleiding = { start, autostart, VERSIE, SLEUTEL, STAPPEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.SPORondleiding;
  if (window.SPOHub && window.SPOHub.klaar) autostart();
  else document.addEventListener('spo-hub-klaar', autostart, { once: true });
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('#rondleiding-opnieuw')) start();
  });
})();
