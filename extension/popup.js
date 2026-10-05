// Popup: invoer, live voorbeeld, geschiedenis en het starten van de animatie.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const vakEl = $('vak');
  const cijferEl = $('cijfer');
  const schuifEl = $('schuif');
  const onderEl = $('onderwerp');
  const fout = $('fout');

  // Zelfde sleutels als versie 1, zodat oude invoer blijft staan.
  const opslag = {
    lees(k, reserve) {
      try {
        const v = localStorage.getItem('sp_' + k);
        return v == null ? reserve : v;
      } catch (e) {
        return reserve;
      }
    },
    schrijf(k, v) {
      try {
        localStorage.setItem('sp_' + k, v);
      } catch (e) {
        /* opslag vol of geblokkeerd */
      }
    },
  };

  const TIERS = [
    { naam: 'Brons', label: 'Oei…', uitleg: 'Onder de 5,5. Het pakket gaat toch open.', kleur: '#e08a4a', pal: ['#4a2a12', '#a8692f', '#e3b07e'], tekst: '#2b1808' },
    { naam: 'Zilver', label: 'Voldoende!', uitleg: 'Nog net geen walkout (vanaf een 7).', kleur: '#dfe9f5', pal: ['#5d6878', '#c3cdd9', '#f4f7fa'], tekst: '#202833' },
    { naam: 'Goud', label: 'Walkout!', uitleg: 'Vanaf een 7 krijg je een walkout.', kleur: '#ffcc33', pal: ['#6e4f08', '#e6b41f', '#fff1a6'], tekst: '#302103' },
    { naam: 'Speciaal', label: 'Speciaal!', uitleg: 'Een 9 of hoger: vuurwerk gegarandeerd.', kleur: '#38e1ff', pal: ['#030622', '#10308f', '#1d7fd0'], tekst: '#eaffff' },
    { naam: 'Icoon', label: 'Icoon! Perfect!', uitleg: 'Een tien. Zet je geluid maar hard.', kleur: '#ffe27a', pal: ['#b88f37', '#fff0b8', '#ffffff'], tekst: '#2e2207' },
  ];

  const leesCijfer = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? Math.round(Math.min(10, Math.max(1, n)) * 10) / 10 : null;
  };
  const tierVan = (g) => (g >= 9.95 ? 4 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5.5 ? 1 : 0);
  const fmt = (g) => g.toFixed(1).replace('.', ',');

  // ── Begintoestand ──────────────────────────────────────────────────────
  vakEl.value = opslag.lees('vak', '');
  onderEl.value = opslag.lees('onderwerp', '');
  const startCijfer = leesCijfer(opslag.lees('cijfer', ''));
  cijferEl.value = startCijfer ? fmt(startCijfer) : '';
  schuifEl.value = startCijfer || 7.5;
  let weging = Math.min(4, Math.max(1, parseInt(opslag.lees('weging', '1'), 10) || 1));
  $('geluid').checked = opslag.lees('geluid', '1') === '1';
  $('snel').checked = opslag.lees('snel', '0') === '1';

  // ── Live voorbeeld ─────────────────────────────────────────────────────
  let vorigeTier = -1;
  function werkVoorbeeldBij() {
    const g = leesCijfer(cijferEl.value) ?? Number(schuifEl.value);
    const t = tierVan(g);
    const T = TIERS[t];
    const vak = vakEl.value.trim() || 'Vak';
    const kaart = $('mini-kaart');
    document.documentElement.style.setProperty('--tier', T.kleur);
    kaart.style.setProperty('--c1', T.pal[0]);
    kaart.style.setProperty('--c2', T.pal[1]);
    kaart.style.setProperty('--c3', T.pal[2]);
    kaart.style.setProperty('--ct', T.tekst);
    kaart.classList.toggle('icoon', t === 4);
    $('mk-cijfer').textContent = fmt(g);
    $('mk-vak').textContent = vak.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase() || 'VAK';
    $('mk-naam').textContent = vak;
    $('tier-naam').textContent = T.naam;
    $('tier-label').textContent = T.label;
    $('tier-uitleg').textContent = T.uitleg;
    if (t !== vorigeTier && vorigeTier !== -1) {
      kaart.classList.remove('pop');
      void kaart.offsetWidth;
      kaart.classList.add('pop');
    }
    vorigeTier = t;
  }

  vakEl.addEventListener('input', () => {
    opslag.schrijf('vak', vakEl.value);
    werkVoorbeeldBij();
  });
  onderEl.addEventListener('input', () => opslag.schrijf('onderwerp', onderEl.value));
  cijferEl.addEventListener('input', () => {
    cijferEl.value = cijferEl.value.replace(/[^0-9.,]/g, '');
    const g = leesCijfer(cijferEl.value);
    if (g != null) schuifEl.value = g;
    opslag.schrijf('cijfer', cijferEl.value);
    fout.textContent = '';
    werkVoorbeeldBij();
  });
  cijferEl.addEventListener('blur', () => {
    const g = leesCijfer(cijferEl.value);
    if (g != null) cijferEl.value = fmt(g);
  });
  schuifEl.addEventListener('input', () => {
    cijferEl.value = fmt(Number(schuifEl.value));
    opslag.schrijf('cijfer', cijferEl.value);
    fout.textContent = '';
    werkVoorbeeldBij();
  });

  function zetWeging(w) {
    weging = w;
    opslag.schrijf('weging', String(w));
    document.querySelectorAll('#weging button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w)));
  }
  $('weging').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) zetWeging(Number(b.dataset.w));
  });
  zetWeging(weging);

  $('geluid').addEventListener('change', (e) => opslag.schrijf('geluid', e.target.checked ? '1' : '0'));
  $('snel').addEventListener('change', (e) => opslag.schrijf('snel', e.target.checked ? '1' : '0'));

  // ── Geschiedenis ───────────────────────────────────────────────────────
  function leesGeschiedenis() {
    try {
      const lijst = JSON.parse(opslag.lees('geschiedenis', '[]'));
      return Array.isArray(lijst) ? lijst.filter((x) => x && typeof x.cijfer === 'number') : [];
    } catch (e) {
      return [];
    }
  }

  function toonGeschiedenis() {
    const lijst = leesGeschiedenis();
    const sectie = $('geschiedenis');
    sectie.hidden = lijst.length === 0;
    if (!lijst.length) return;

    const totaalW = lijst.reduce((s, x) => s + (x.weging || 1), 0);
    const gem = lijst.reduce((s, x) => s + x.cijfer * (x.weging || 1), 0) / totaalW;
    const gemEl = $('gemiddelde');
    gemEl.textContent = 'Gemiddelde ';
    const b = document.createElement('b');
    b.textContent = fmt(Math.round(gem * 10) / 10);
    gemEl.appendChild(b);

    const ul = $('lijst');
    ul.textContent = '';
    lijst.slice(0, 5).forEach((x) => {
      const T = TIERS[tierVan(x.cijfer)];
      const li = document.createElement('li');
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.title = 'Opnieuw invullen';
      const c = document.createElement('span');
      c.className = 'l-cijfer' + (x.cijfer < 5.5 ? ' onv' : '');
      c.style.background = `linear-gradient(135deg, ${T.pal[1]}, ${T.pal[2]})`;
      if (x.cijfer < 5.5) c.style.background = 'linear-gradient(135deg, #b4232f, #ff5a64)';
      c.textContent = fmt(x.cijfer);
      const tekst = document.createElement('span');
      tekst.className = 'l-tekst';
      const naam = document.createElement('b');
      naam.textContent = x.vak;
      const onder = document.createElement('span');
      onder.textContent = x.onderwerp;
      tekst.append(naam, onder);
      const w = document.createElement('span');
      w.className = 'l-weging';
      w.textContent = `${x.weging || 1}×`;
      knop.append(c, tekst, w);
      knop.addEventListener('click', () => {
        vakEl.value = x.vak;
        onderEl.value = x.onderwerp;
        cijferEl.value = fmt(x.cijfer);
        schuifEl.value = x.cijfer;
        zetWeging(x.weging || 1);
        ['vak', 'onderwerp', 'cijfer'].forEach((k) => opslag.schrijf(k, $(k).value));
        werkVoorbeeldBij();
      });
      li.appendChild(knop);
      ul.appendChild(li);
    });
  }

  $('wis').addEventListener('click', () => {
    opslag.schrijf('geschiedenis', '[]');
    toonGeschiedenis();
  });

  // ── Openen ─────────────────────────────────────────────────────────────
  $('formulier').addEventListener('submit', async (e) => {
    e.preventDefault();
    fout.textContent = '';
    const g = leesCijfer(cijferEl.value);
    if (g == null) {
      fout.textContent = 'Vul een cijfer in tussen 1 en 10.';
      cijferEl.focus();
      return;
    }
    const data = {
      vak: vakEl.value.trim() || 'Vak',
      cijfer: g,
      onderwerp: onderEl.value.trim() || 'Toets',
      weging,
      snel: $('snel').checked,
      stil: !$('geluid').checked,
    };

    const lijst = leesGeschiedenis();
    lijst.unshift({ vak: data.vak, cijfer: g, onderwerp: data.onderwerp, weging, ts: Date.now() });
    opslag.schrijf('geschiedenis', JSON.stringify(lijst.slice(0, 20)));

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (d) => {
          window.__somPack = d;
        },
        args: [data],
      });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['pack.js'] });
    } catch (err) {
      // Op chrome://-pagina's, de Web Store of pdf's mag niets geïnjecteerd worden:
      // dan openen we het pakket in een eigen tabblad.
      const q = new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)]));
      await chrome.tabs.create({ url: chrome.runtime.getURL('stage.html?' + q.toString()) });
    }
    window.close();
  });

  werkVoorbeeldBij();
  toonGeschiedenis();
  (cijferEl.value ? $('open') : vakEl.value ? cijferEl : vakEl).focus();
})();
