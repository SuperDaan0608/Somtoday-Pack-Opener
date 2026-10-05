/*
 * Somtoday Pack Opener — de pakket-animatie.
 *
 * Draait op drie manieren:
 *  - content.js roept window.__somPackRun() aan als je op een afgedekt cijfer klikt;
 *  - de popup injecteert dit bestand voor een handmatig pakket;
 *  - stage.html laadt het als reservepagina.
 *
 * De gegevens staan in window.__somPack:
 *   { vak, cijfer, onderwerp, weging, snel, stil,
 *     direct,       // sla het startscherm over (je hebt al op het cijfer geklikt)
 *     opOnthuld,    // wordt aangeroepen op het moment dat het cijfer onthuld wordt
 *     opGesloten }  // wordt aangeroepen als de overlay dicht gaat
 */
(function () {
  'use strict';

  function run() {
  const d = window.__somPack;
  if (!d) return;

    const HOST_ID = '__somPackHost';
    const vorige = document.getElementById(HOST_ID);
    if (vorige && vorige.__spoSluit) vorige.__spoSluit();
    else if (vorige) vorige.remove();
    const oud = document.getElementById('__somPackOverlay'); // overblijfsel van versie 1
    if (oud) oud.remove();

    // ───────────────────────── Hulpjes ─────────────────────────
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const easeOut = (p) => 1 - Math.pow(1 - p, 3);
    const smooth = (p) => p * p * (3 - 2 * p);
    const veer = (p) => (p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(p * 9)); // verende ‘pop’
    const tekst = (v, reserve, max) => (String(v == null ? '' : v).replace(/\s+/g, ' ').trim() || reserve).slice(0, max);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    // ───────────────────────── Gegevens ─────────────────────────
    const g = (() => {
      const n = parseFloat(String(d.cijfer).replace(',', '.'));
      return Number.isFinite(n) ? Math.round(clamp(n, 1, 10) * 10) / 10 : 1;
    })();
    const I = g / 10; // intensiteit: een 10 is tien keer zo heftig als een 1
    const tier = g >= 9.95 ? 4 : g >= 9 ? 3 : g >= 7 ? 2 : g >= 5.5 ? 1 : 0;
    const walkout = g >= 7;
    const vak = tekst(d.vak, 'Vak', 40);
    const onder = tekst(d.onderwerp, 'Toets', 80);
    const weging = clamp(Math.round(+d.weging) || 1, 1, 10);
    const snel = !!d.snel;
    const direct = !!d.direct;
    const roep = (naam) => {
      try {
        if (typeof d[naam] === 'function') d[naam]();
      } catch (e) {
        /* een fout in de koppeling mag de animatie niet stoppen */
      }
    };
    let stil = !!d.stil;
    const minderBeweging = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fmt = (v) => v.toFixed(1).replace('.', ',');
    const cijferTekst = fmt(g);
    const datum = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());

    const TIERS = [
      { naam: 'Brons', label: 'Oei…', sub: 'Volgende keer beter!', pal: ['#4a2a12', '#a8692f', '#e3b07e'], tekst: '#2b1808', gloed: '#e08a4a' },
      { naam: 'Zilver', label: 'Voldoende!', sub: 'Netjes gehaald.', pal: ['#5d6878', '#c3cdd9', '#f4f7fa'], tekst: '#202833', gloed: '#dfe9f5' },
      { naam: 'Goud', label: g >= 8 ? 'Topper!' : 'Walkout!', sub: g >= 8 ? 'Dit is een topcijfer.' : 'Goud waard.', pal: ['#6e4f08', '#e6b41f', '#fff1a6'], tekst: '#302103', gloed: '#ffcc33' },
      { naam: 'Speciaal', label: 'Speciaal!', sub: 'Bijna perfect.', pal: ['#030622', '#10308f', '#1d7fd0'], tekst: '#eaffff', gloed: '#38e1ff' },
      { naam: 'Icoon', label: 'Icoon! Perfect!', sub: 'Een tien. Een TIEN.', pal: ['#b88f37', '#fff0b8', '#ffffff'], tekst: '#2e2207', gloed: '#ffe27a' },
    ];
    const T = TIERS[tier];
    const tierKleur = (t) => (tier === 4 ? `hsl(${(t * 0.12) % 360},100%,62%)` : T.gloed);

    // Eigen stats per vak, maar altijd rond het cijfer.
    let seed = 0;
    for (const ch of vak) seed += ch.charCodeAt(0);
    const statWaarde = (i) => clamp(Math.round(g * 10 + ((((seed * (i + 7) * 9301 + 49297) % 233280) / 233280) - 0.5) * 18), 5, 99);
    const STATS = ['INZ', 'FOC', 'KEN', 'TMP', 'TEC', 'MOT'];
    const afkorting = vak.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase() || 'VAK';

    // ───────────────────────── Lettertypes ─────────────────────────
    const F_DISPLAY = '"SPO Display", "Arial Black", system-ui, sans-serif';
    const F_TEKST = '"SPO Text", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
    const fontBasis = window.chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('fonts/') : 'fonts/';
    const fontsKlaar = (async () => {
      try {
        if (!window.FontFace || !document.fonts) return;
        const faces = [
          new FontFace('SPO Display', `url("${fontBasis}unbounded.woff2")`, { weight: '200 900' }),
          new FontFace('SPO Text', `url("${fontBasis}inter.woff2")`, { weight: '100 900' }),
        ];
        await Promise.race([
          Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff)))),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      } catch (e) {
        /* dan maar systeemletters */
      }
    })();

    // ───────────────────────── Geluid ─────────────────────────
    // Alle geluiden zijn echte opnames (gemaakt met ElevenLabs, zie geluiden/README.md) die hier met
    // Web Audio worden afgespeeld. Ze staan als mp3 in sounds/ en zijn gelijkgetrokken op een piek van
    // ongeveer -1 dB; NIVEAU zet elk geluid op het goede volume ten opzichte van de rest.
    const VOLUME = 0.8; // hoofdvolume; laat wat ruimte vóór de compressor
    const GELUIDEN = ['tear', 'whoosh', 'riser', 'boem', 'hartslag', 'stap', 'menigte', 'gejuich', 'tik', 'sluiter', 'vuurwerk', 'brons', 'zilver', 'goud', 'speciaal', 'icoon', 'klik'];
    const NIVEAU = {
      tear: -3, whoosh: -7, riser: -8, boem: 0, hartslag: -4, stap: -4, menigte: -13, gejuich: -8,
      tik: -14, sluiter: -12, vuurwerk: -7, brons: -4, zilver: -5, goud: -4, speciaal: -4, icoon: -4, klik: -14,
    };

    const geluid = (() => {
      let AC = null;
      let master = null;
      let galm = null;
      let geladen = null;
      const buffers = {};
      const actief = new Set();
      const dB = (x) => Math.pow(10, x / 20);
      const basis = window.chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('sounds/') : 'sounds/';

      function init() {
        if (AC) return AC;
        try {
          AC = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
          return null;
        }
        // Eén compressor over alles, zodat veel geluiden tegelijk nooit gaan vervormen.
        const comp = AC.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 5;
        comp.attack.value = 0.002;
        comp.release.value = 0.25;
        comp.connect(AC.destination);
        master = AC.createGain();
        master.gain.value = stil ? 0 : VOLUME;
        master.connect(comp);

        // Een kleine, gegenereerde ruimte voor wat galm op de grote geluiden.
        const conv = AC.createConvolver();
        const len = Math.floor(AC.sampleRate * 1.8);
        const ir = AC.createBuffer(2, len, AC.sampleRate);
        for (let c = 0; c < 2; c++) {
          const ch = ir.getChannelData(c);
          for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        }
        conv.buffer = ir;
        galm = AC.createGain();
        galm.gain.value = 0.3;
        galm.connect(conv);
        conv.connect(master);
        return AC;
      }

      // Laadt en decodeert alle opnames. Een geluid dat niet laadt, wordt gewoon overgeslagen.
      function laad() {
        if (geladen) return geladen;
        if (!init()) return (geladen = Promise.resolve());
        geladen = Promise.all(
          GELUIDEN.map(async (naam) => {
            try {
              const r = await fetch(basis + naam + '.mp3');
              if (!r.ok) throw new Error('HTTP ' + r.status);
              buffers[naam] = await AC.decodeAudioData(await r.arrayBuffer());
            } catch (e) {
              /* zonder dit geluid gaat de animatie gewoon door */
            }
          }),
        );
        return geladen;
      }

      // Speelt één opname af. offset en duur in seconden van de opname; rate verandert snelheid en toonhoogte.
      function speel(naam, { gain = 1, rate = 1, offset = 0, duur, fadeIn = 0.004, fadeOut = 0.06, galmen = 0, pan = 0 } = {}) {
        const buf = buffers[naam];
        if (!AC || !master || !buf) return;
        const nu = AC.currentTime;
        const max = Math.max(0.05, (buf.duration - offset) / rate);
        const d = Math.min(duur || max, max);
        const vol = dB(NIVEAU[naam] || 0) * gain;
        const src = AC.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        const g = AC.createGain();
        const fi = Math.min(fadeIn, d / 2);
        const fo = Math.min(fadeOut, d / 2);
        g.gain.setValueAtTime(0.0001, nu);
        g.gain.linearRampToValueAtTime(vol, nu + fi);
        g.gain.setValueAtTime(vol, nu + Math.max(fi, d - fo));
        g.gain.linearRampToValueAtTime(0.0001, nu + d);
        src.connect(g);
        let uit = g;
        if (pan && AC.createStereoPanner) {
          const p = AC.createStereoPanner();
          p.pan.value = pan;
          g.connect(p);
          uit = p;
        }
        uit.connect(master);
        if (galmen) {
          const send = AC.createGain();
          send.gain.value = galmen;
          uit.connect(send);
          send.connect(galm);
        }
        src.start(nu, offset, d * rate);
        src.stop(nu + d + 0.05);
        const spoor = { g };
        actief.add(spoor);
        src.onended = () => actief.delete(spoor);
      }

      return {
        laad,
        start() {
          init();
          if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
        },
        stil(aan) {
          if (master) master.gain.setTargetAtTime(aan ? 0 : VOLUME, AC.currentTime, 0.03);
        },
        // Alles wat nog klinkt snel laten wegsterven (bij overslaan en opnieuw).
        stopAlles() {
          if (!AC) return;
          const nu = AC.currentTime;
          for (const { g } of actief) {
            g.gain.cancelScheduledValues(nu);
            g.gain.setTargetAtTime(0, nu, 0.04);
          }
        },
        sluit() {
          try {
            if (AC) AC.close();
          } catch (e) {
            /* al dicht */
          }
        },
        whoosh(vol = 1) {
          speel('whoosh', { gain: vol, rate: rnd(0.95, 1.05), fadeOut: 0.3 });
        },
        // De opbouw moet precies op het scheurmoment pieken: we spelen het laatste stuk van de opname.
        riser(dur, vol = 1) {
          const b = buffers.riser;
          if (!b) return;
          let rate = 1;
          let offset = Math.max(0, b.duration - dur);
          if (dur > b.duration) {
            rate = clamp(b.duration / dur, 0.75, 1);
            offset = Math.max(0, b.duration - dur * rate);
          }
          speel('riser', { gain: vol, rate, offset, fadeIn: 0.15, fadeOut: 0.02 });
        },
        scheur(vol = 1) {
          speel('tear', { gain: vol, galmen: 0.15 });
        },
        boem(vol = 1) {
          speel('boem', { gain: vol, galmen: 0.3 });
        },
        hartslag(vol = 1) {
          speel('hartslag', { gain: vol, fadeOut: 0.12 });
        },
        publiek(dur, vol = 1) {
          const b = buffers.menigte;
          if (!b) return;
          const rate = dur > b.duration - 0.2 ? clamp((b.duration - 0.2) / dur, 0.8, 1) : 1;
          speel('menigte', { gain: vol, rate, duur: dur, fadeIn: 0.5, fadeOut: 0.8, galmen: 0.1 });
        },
        gejuich(dur, vol = 1) {
          speel('gejuich', { gain: vol, duur: dur, fadeIn: 0.05, fadeOut: 0.8, galmen: 0.15 });
        },
        inslag(vol = 1) {
          speel('stap', { gain: vol, pan: rnd(-0.2, 0.2), galmen: 0.35 });
        },
        // voortgang: 0 (begin van het optellen) tot 1 (het eindcijfer): de tikken worden steeds hoger
        tik(voortgang) {
          speel('tik', { rate: 0.85 + 0.75 * clamp(voortgang, 0, 1) });
        },
        sluiter() {
          speel('sluiter', { gain: rnd(0.7, 1), rate: rnd(0.92, 1.08), pan: rnd(-0.7, 0.7) });
        },
        vuurwerk() {
          speel('vuurwerk', { gain: rnd(0.7, 1), rate: rnd(0.9, 1.12), pan: rnd(-0.8, 0.8), galmen: 0.4 });
        },
        onthulling(vol = 1) {
          speel(['brons', 'zilver', 'goud', 'speciaal', 'icoon'][tier], { gain: vol, galmen: 0.2 });
        },
        knop() {
          speel('klik');
        },
      };
    })();

    // ───────────────────────── Overlay (shadow DOM) ─────────────────────────
    const LOGO = `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><defs><linearGradient id="spo-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".5" stop-color="#ffb020"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient></defs><rect x="5.5" y="5" width="14" height="20" rx="3" transform="rotate(-14 12.5 15)" fill="#fff" opacity=".25"/><rect x="11" y="6" width="15" height="21" rx="3.2" transform="rotate(9 18.5 16.5)" fill="url(#spo-g)"/><path d="M18.6 11.2l1.25 3.05 3.05 1.25-3.05 1.25-1.25 3.05-1.25-3.05-3.05-1.25 3.05-1.25z" fill="#fff"/></svg>`;
    const ICOON = {
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      aan: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
      uit: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6M16 9l6 6"/>',
      opnieuw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
      opslaan: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
      pakket: '<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    };
    const svg = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOON[k]}</svg>`;

    const CSS = `
      :host { all: initial; }
      .wrap { position: fixed; inset: 0; font-family: ${F_TEKST}; color: #fff; -webkit-font-smoothing: antialiased; user-select: none; -webkit-user-select: none; }
      canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: pointer; }
      button { font: inherit; color: inherit; cursor: pointer; }
      button:focus-visible { outline: 2px solid #ffd24a; outline-offset: 3px; }
      .top { position: absolute; top: 16px; left: 20px; right: 16px; display: flex; align-items: center; justify-content: space-between; pointer-events: none; }
      .merk { display: flex; align-items: center; gap: 10px; opacity: .9; }
      .merk span { display: flex; flex-direction: column; line-height: 1.1; font-weight: 650; font-size: 14px; font-family: ${F_DISPLAY}; letter-spacing: -.01em; }
      .merk small { font-family: ${F_TEKST}; font-size: 9.5px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: rgba(255,255,255,.55); }
      .knoppen { display: flex; gap: 8px; pointer-events: auto; }
      .ik { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.07); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: background .2s, transform .15s; }
      .ik:hover { background: rgba(255,255,255,.14); }
      .ik:active { transform: scale(.94); }
      .hint { position: absolute; left: 0; right: 0; bottom: 26px; text-align: center; font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,.62); letter-spacing: .02em; pointer-events: none; opacity: 0; transition: opacity .5s; }
      .hint.aan { opacity: 1; }
      .intro { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; transition: opacity .45s, transform .6s cubic-bezier(.16,1,.3,1); }
      .intro.weg { opacity: 0; transform: scale(.94); pointer-events: none; }
      .melding { position: relative; width: min(390px, 100%); padding: 20px 22px 22px; border-radius: 26px; background: linear-gradient(180deg, rgba(30,34,58,.86), rgba(14,16,30,.9)); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 40px 120px -20px rgba(0,0,0,.85), 0 0 0 1px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); animation: in .8s cubic-bezier(.16,1,.3,1) both; }
      .melding::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; background: linear-gradient(140deg, rgba(255,210,74,.7), transparent 40%, transparent 60%, rgba(255,122,61,.6)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
      @keyframes in { from { opacity: 0; transform: translateY(24px) scale(.96); } }
      .m-kop { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; color: rgba(255,255,255,.55); }
      .m-app { display: flex; align-items: center; gap: 8px; font-weight: 600; color: rgba(255,255,255,.75); }
      .m-app svg { width: 20px; height: 20px; }
      .m-titel { margin-top: 14px; font-family: ${F_DISPLAY}; font-size: 26px; font-weight: 700; letter-spacing: -.03em; }
      .m-tekst { margin-top: 6px; font-size: 15px; line-height: 1.5; color: rgba(255,255,255,.78); }
      .m-tekst b { color: #fff; font-weight: 700; }
      .m-sub { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
      .chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); font-size: 12px; font-weight: 600; color: rgba(255,255,255,.75); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .knop { display: inline-flex; align-items: center; justify-content: center; gap: 9px; height: 48px; padding: 0 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); font-size: 14.5px; font-weight: 650; transition: transform .15s, filter .2s, background .2s; }
      .knop:hover { background: rgba(255,255,255,.14); }
      .knop:active { transform: scale(.97); }
      .knop.goud { border: 0; color: #241703; background: linear-gradient(135deg, #fff0b3 0%, #ffd24a 40%, #ff7a3d 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 12px 32px -10px rgba(255,140,40,.8); }
      .knop.goud:hover { filter: brightness(1.07); }
      .m-knop { width: 100%; margin-top: 20px; height: 54px; font-size: 16px; }
      .m-hint { margin-top: 10px; text-align: center; font-size: 12px; color: rgba(255,255,255,.4); }
      .acties { position: absolute; left: 0; right: 0; bottom: 24px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; padding: 0 16px; opacity: 0; transform: translateY(14px); pointer-events: none; transition: opacity .5s, transform .6s cubic-bezier(.16,1,.3,1); }
      .acties.aan { opacity: 1; transform: none; pointer-events: auto; }
      @media (max-width: 520px) { .knop span { display: none; } .acties .knop.goud span { display: inline; } }
    `;

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
      <div class="wrap" role="dialog" aria-modal="true" aria-label="Pakket openen: ${esc(vak)}">
        <canvas></canvas>
        <div class="top">
          <div class="merk">${LOGO}<span><small>Somtoday</small>Pack Opener</span></div>
          <div class="knoppen">
            <button class="ik" data-a="geluid"></button>
            <button class="ik" data-a="sluit" aria-label="Sluiten" title="Sluiten (Esc)">${svg('x')}</button>
          </div>
        </div>
        <div class="intro">
          <div class="melding">
            <div class="m-kop"><span class="m-app">${LOGO}Somtoday Pack Opener</span><span>nu</span></div>
            <div class="m-titel">Nieuw cijfer!</div>
            <div class="m-tekst">Er staat een nieuw cijfer klaar voor <b>${esc(vak)}</b>. Durf jij het pakket te openen?</div>
            <div class="m-sub"><span class="chip">${esc(onder)}</span><span class="chip">Weging ${weging}×</span></div>
            <button class="knop goud m-knop" data-a="start">${svg('pakket')}<span>Pakket openen</span></button>
            <div class="m-hint">of druk op spatie</div>
          </div>
        </div>
        <div class="hint"></div>
        <div class="acties">
          <button class="knop" data-a="opnieuw">${svg('opnieuw')}<span>Opnieuw</span></button>
          <button class="knop" data-a="opslaan">${svg('opslaan')}<span>Opslaan als afbeelding</span></button>
          <button class="knop goud" data-a="sluit"><span>Sluiten</span></button>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    const $ = (s) => root.querySelector(s);
    const cv = $('canvas');
    const ctx = cv.getContext('2d');
    const hintEl = $('.hint');
    const introEl = $('.intro');
    const actiesEl = $('.acties');
    const geluidKnop = $('[data-a="geluid"]');

    const oudeOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    function zetGeluidKnop() {
      geluidKnop.innerHTML = svg(stil ? 'uit' : 'aan');
      geluidKnop.setAttribute('aria-label', stil ? 'Geluid aanzetten' : 'Geluid uitzetten');
      geluidKnop.title = stil ? 'Geluid aanzetten' : 'Geluid uitzetten';
    }
    zetGeluidKnop();

    let hintTekst = '';
    function hint(s) {
      if (s === hintTekst) return;
      hintTekst = s;
      hintEl.classList.remove('aan');
      if (s) {
        hintEl.textContent = s;
        requestAnimationFrame(() => hintEl.classList.add('aan'));
      }
    }

    // ───────────────────────── Canvas ─────────────────────────
    let W = 0;
    let H = 0;
    let dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth;
      H = innerHeight;
      cv.width = Math.floor(W * dpr);
      cv.height = Math.floor(H * dpr);
    }
    resize();
    addEventListener('resize', resize);

    const rr = (c, x, y, w, h, r) => {
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, w, h, r);
      else c.rect(x, y, w, h);
    };
    const spatie = (c, px) => {
      if ('letterSpacing' in c) c.letterSpacing = px + 'px';
    };

    // ───────────────────────── Tijdlijn ─────────────────────────
    let fase = 'intro'; // intro → reeks → klaar
    let TL = null;
    let start = 0;
    let laatst = performance.now();
    let raf = 0;
    let gesloten = false;
    let S = null; // toestand van de huidige reeks

    function maakTijdlijn() {
      if (snel) {
        const C = 0;
        const D = 700;
        const E = D + 600 + 700 * I;
        const F = E + 750;
        const WO = walkout ? 2400 + 600 * I : 0;
        const Sk = F + WO;
        return { A: -1, B: -1, C, D, E, F, WO, S: Sk, RV: Sk + 1500 };
      }
      const A = 500;
      const B = 2600;
      const C = 4700;
      const D = 5900;
      const E = D + 1100 + 1400 * I;
      const F = E + 800;
      const WO = walkout ? 5200 + 1400 * I : 0;
      const Sk = F + WO;
      return { A, B, C, D, E, F, WO, S: Sk, RV: Sk + 1900 };
    }

    function nieuweReeks() {
      TL = maakTijdlijn();
      S = {
        tunnel: 0,
        onthuld: false,
        deeltjes: [],
        confetti: [],
        golven: [],
        vuurwerk: [],
        flitsen: [],
        laatsteTel: 0,
        volgendeSluiter: 0,
        events: [],
        sterren: Array.from({ length: Math.floor(30 + 230 * I) }, () => ({ a: rnd(0, 6.283), r: rnd(0, 1), s: rnd(0.4, 1) })),
        nevel: Array.from({ length: 7 }, () => ({ x: rnd(-0.2, 1.2), y: rnd(0.5, 0.95), r: rnd(0.25, 0.5), v: rnd(-0.015, 0.015) })),
        scheur: Array.from({ length: 21 }, (_, i) => (i === 0 || i === 20 ? 0 : rnd(-7, 7))),
      };
      const at = (time, fn) => S.events.push({ time, fn, done: false });
      const flits = (t0, p, dec) => S.flitsen.push({ t0, p, dec });
      const { A, B, C, D, E, F, WO, RV } = TL;

      if (A >= 0) at(A, () => geluid.whoosh(0.55 + 0.4 * I));
      if (B >= 0) at(B, () => geluid.whoosh(0.55 + 0.4 * I));
      at(C, () => geluid.whoosh(0.7 + 0.3 * I));
      at(D, () => geluid.riser((E - D) / 1000, 0.6 + 0.4 * I));
      // Het scheurgeluid heeft zijn eerste klap na 0,1 s, dus starten we iets eerder: dan valt die precies op E.
      at(E - 100, () => geluid.scheur(0.8 + 0.2 * I));
      at(E, (t) => {
        geluid.boem(0.6 + 0.4 * I);
        flits(t, 0.4 + 0.6 * I, 200 + 500 * I);
        trillen([30, 20, 60]);
      });
      if (walkout) {
        at(F, () => geluid.publiek(WO / 1000, 0.5 + 0.5 * I));
        // De hartslag wordt luider naarmate de leerling dichterbij komt.
        const slagen = Math.floor(WO / 520);
        for (let k = 0; k < slagen; k++) at(F + k * (WO / slagen), () => geluid.hartslag((0.45 + 0.55 * (k / slagen)) * (0.6 + 0.4 * I)));
        [0.16, 0.38, 0.62].forEach((p) => at(F + WO * p, () => geluid.inslag(0.7 + 0.3 * I)));
        at(TL.S - 60, (t) => flits(t, 0.6 + 0.4 * I, 500));
      }
      at(TL.S, () => geluid.whoosh(0.6));
      at(RV, (t) => {
        geluid.boem(tier === 0 ? 0.35 : 0.7 + 0.3 * I);
        geluid.onthulling(0.8 + 0.2 * I);
        if (g >= 6) geluid.gejuich(2.5 + 1.5 * I, 0.5 + 0.5 * I);
        flits(t, 0.3 + 0.7 * I, 150 + 700 * I);
        onthul(t);
        trillen(tier >= 3 ? [60, 40, 60, 40, 200] : tier >= 2 ? [40, 30, 80] : 30);
      });
      S.events.sort((a, b) => a.time - b.time);
    }

    function trillen(p) {
      if (navigator.vibrate && !minderBeweging) {
        try {
          navigator.vibrate(p);
        } catch (e) {
          /* niet ondersteund */
        }
      }
    }

    // ───────────────────────── Tekenwerk: achtergrond & tunnel ─────────────────────────
    function achtergrond(t, kracht) {
      const g0 = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g0.addColorStop(0, '#0c1024');
      g0.addColorStop(1, '#010206');
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, W, H);
      if (kracht > 0) gloed(W / 2, H / 2, Math.hypot(W, H) * 0.5, tierKleur(t), kracht);
    }

    function gloed(x, y, r, kleur, a) {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
      gr.addColorStop(0, kleur);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = gr;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }

    function tunnel(t, dt, alpha, snelheid) {
      const cx = W / 2;
      const cy = H / 2;
      const f = H * 0.9;
      const zmax = 24;
      const HX = 1.3;
      const HY = 0.8;
      S.tunnel += dt * (3 + 9 * I) * snelheid;
      const kleur = fase !== 'intro' && (tier >= 2 || t > TL.C) ? tierKleur(t) : '#9fb4ff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = kleur;
      for (let i = 0; i < 12; i++) {
        const z = ((((i * 2 - S.tunnel) % zmax) + zmax) % zmax) + 0.25;
        ctx.globalAlpha = alpha * Math.pow(Math.max(0, 1 - z / zmax), 1.2);
        ctx.lineWidth = Math.min(7, 1 + 2 / z);
        rr(ctx, cx - (HX * f) / z, cy - (HY * f) / z, (2 * HX * f) / z, (2 * HY * f) / z, 12 / z);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha * 0.8;
      for (const [X, Y] of [[-HX, -HY], [HX, -HY], [-HX, HY], [HX, HY], [-HX, 0], [HX, 0], [-0.65, HY], [0, HY], [0.65, HY], [-0.65, -HY], [0, -HY], [0.65, -HY]]) {
        const xf = cx + (X * f) / zmax;
        const yf = cy + (Y * f) / zmax;
        const xn = cx + (X * f) / 0.25;
        const yn = cy + (Y * f) / 0.25;
        const gr = ctx.createLinearGradient(xf, yf, xn, yn);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.5, kleur);
        gr.addColorStop(1, kleur);
        ctx.strokeStyle = gr;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xf, yf);
        ctx.lineTo(xn, yn);
        ctx.stroke();
      }
      const D2 = Math.hypot(W, H) / 2;
      ctx.strokeStyle = kleur;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const s of S.sterren) {
        s.r += dt * (0.1 + s.r * 1.6) * s.s * snelheid * (0.6 + I);
        if (s.r > 1) {
          s.r = rnd(0, 0.05);
          s.a = rnd(0, 6.283);
        }
        const r1 = s.r * D2;
        const r2 = r1 + s.r * s.r * D2 * 0.15 * (0.5 + I);
        ctx.globalAlpha = alpha * s.r * 0.85;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
        ctx.lineTo(cx + Math.cos(s.a) * r2, cy + Math.sin(s.a) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function zoomTekst(label, str, p) {
      if (p < 0 || p > 1) return;
      const schaal = 0.03 * Math.pow(45, p);
      const basis = Math.min(H * 0.16, (W * 0.72) / (Math.max(4, str.length) * 0.72));
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.1));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(W / 2, H / 2);
      ctx.scale(schaal, schaal);
      ctx.font = `700 ${basis * 0.16}px ${F_TEKST}`;
      spatie(ctx, basis * 0.05);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fillText(label, 0, -basis * 0.78);
      spatie(ctx, 0);
      ctx.font = `800 ${basis}px ${F_DISPLAY}`;
      ctx.shadowColor = tierKleur(0);
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#fff';
      ctx.fillText(str.toUpperCase(), 0, 0);
      ctx.restore();
    }

    function stralen(cx, cy, t, alpha, n) {
      const D2 = Math.hypot(W, H);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, D2 * 0.7);
      gr.addColorStop(0, tierKleur(t));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.283 + t * 0.0004 * (1 + 3 * I);
        const w = 0.035;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a - w) * D2, cy + Math.sin(a - w) * D2);
        ctx.lineTo(cx + Math.cos(a + w) * D2, cy + Math.sin(a + w) * D2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ───────────────────────── Het pakje ─────────────────────────
    const PW = 240;
    const PH = 360;
    const SCHEUR_Y = -PH / 2 + 78;

    function pakVorm(c) {
      const tand = 7;
      const stap = 12;
      c.beginPath();
      c.moveTo(-PW / 2, -PH / 2 + tand);
      for (let x = -PW / 2; x < PW / 2; x += stap) {
        c.lineTo(x + stap / 2, -PH / 2);
        c.lineTo(x + stap, -PH / 2 + tand);
      }
      c.lineTo(PW / 2, PH / 2 - tand);
      for (let x = PW / 2; x > -PW / 2; x -= stap) {
        c.lineTo(x - stap / 2, PH / 2);
        c.lineTo(x - stap, PH / 2 - tand);
      }
      c.closePath();
    }

    function scheurLijn(c, boven) {
      const n = S.scheur.length - 1;
      c.beginPath();
      if (boven) {
        c.moveTo(-PW, -PH);
        c.lineTo(PW, -PH);
        for (let i = n; i >= 0; i--) c.lineTo(-PW / 2 + (i / n) * PW, SCHEUR_Y + S.scheur[i]);
        c.lineTo(-PW, SCHEUR_Y);
      } else {
        c.moveTo(-PW, SCHEUR_Y);
        for (let i = 0; i <= n; i++) c.lineTo(-PW / 2 + (i / n) * PW, SCHEUR_Y + S.scheur[i]);
        c.lineTo(PW, SCHEUR_Y);
        c.lineTo(PW, PH);
        c.lineTo(-PW, PH);
      }
      c.closePath();
    }

    function pakje(px, py, s, rot, glow, t, deel, alpha) {
      const c = ctx;
      c.save();
      c.globalAlpha = alpha == null ? 1 : alpha;
      c.translate(px, py);
      c.rotate(rot);
      c.scale(s, s);
      if (deel) {
        scheurLijn(c, deel === 'boven');
        c.clip();
      }
      // gloed eromheen
      c.shadowColor = tierKleur(t);
      c.shadowBlur = glow;
      pakVorm(c);
      const bg = c.createLinearGradient(-PW / 2, -PH / 2, PW / 2, PH / 2);
      bg.addColorStop(0, '#1d2350');
      bg.addColorStop(0.45, '#0d1030');
      bg.addColorStop(1, '#05060f');
      c.fillStyle = bg;
      c.fill();
      c.shadowBlur = 0;

      c.save();
      pakVorm(c);
      c.clip();
      // folie-kreukels
      c.globalAlpha = 0.07;
      c.fillStyle = '#fff';
      for (let i = -6; i < 8; i++) {
        c.beginPath();
        c.moveTo(i * 40 - 30, -PH / 2);
        c.lineTo(i * 40, -PH / 2);
        c.lineTo(i * 40 + 60, PH / 2);
        c.lineTo(i * 40 + 40, PH / 2);
        c.fill();
      }
      c.globalAlpha = 1;
      // stippen
      c.fillStyle = 'rgba(255,255,255,.08)';
      for (let y = -PH / 2 + 100; y < PH / 2 - 40; y += 10) for (let x = -PW / 2 + 6; x < PW / 2; x += 10) c.fillRect(x, y, 1.4, 1.4);
      // seal-randen
      c.fillStyle = 'rgba(255,255,255,.08)';
      c.fillRect(-PW / 2, -PH / 2, PW, 30);
      c.fillRect(-PW / 2, PH / 2 - 30, PW, 30);
      c.strokeStyle = 'rgba(255,255,255,.18)';
      c.lineWidth = 1.2;
      for (let x = -PW / 2 + 4; x < PW / 2; x += 6) {
        c.beginPath();
        c.moveTo(x, -PH / 2);
        c.lineTo(x, -PH / 2 + 30);
        c.moveTo(x, PH / 2 - 30);
        c.lineTo(x, PH / 2);
        c.stroke();
      }
      // scheurlijn
      c.setLineDash([5, 5]);
      c.strokeStyle = 'rgba(255,255,255,.35)';
      c.beginPath();
      c.moveTo(-PW / 2 + 14, SCHEUR_Y);
      c.lineTo(PW / 2 - 14, SCHEUR_Y);
      c.stroke();
      c.setLineDash([]);
      c.font = `700 8px ${F_TEKST}`;
      spatie(c, 2);
      c.fillStyle = 'rgba(255,255,255,.45)';
      c.textAlign = 'right';
      c.fillText('SCHEUR HIER', PW / 2 - 14, SCHEUR_Y + 13);
      spatie(c, 0);
      // glans
      const off = (((t * 0.0006) % 2) - 0.5) * PW * 2.4;
      const sh = c.createLinearGradient(off - 70, -PH / 2, off + 70, PH / 2);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,.22)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sh;
      c.fillRect(-PW / 2, -PH / 2, PW, PH);
      c.restore();

      // rand (goud als het een hoog cijfer is: een hint, net als bij FIFA)
      pakVorm(c);
      c.strokeStyle = g >= 9 ? '#ffd24a' : 'rgba(200,210,240,.65)';
      c.lineWidth = 3;
      c.stroke();

      // opdruk
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 10px ${F_TEKST}`;
      spatie(c, 4);
      c.fillStyle = 'rgba(255,255,255,.7)';
      c.fillText('SOMTODAY', 2, -PH / 2 + 52);
      spatie(c, 0);
      c.font = `800 17px ${F_DISPLAY}`;
      c.fillStyle = '#fff';
      c.fillText('PACK OPENER', 0, SCHEUR_Y + 32);
      // embleem
      const ey = 30;
      const ring = c.createLinearGradient(-70, ey - 70, 70, ey + 70);
      ring.addColorStop(0, '#ffe27a');
      ring.addColorStop(0.5, g >= 9 ? '#ffb020' : '#8fa2ff');
      ring.addColorStop(1, '#ff6a3d');
      c.beginPath();
      c.arc(0, ey, 66, 0, 6.283);
      c.fillStyle = 'rgba(255,255,255,.05)';
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = ring;
      c.stroke();
      c.beginPath();
      c.arc(0, ey, 56, 0, 6.283);
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(255,255,255,.2)';
      c.stroke();
      c.font = `800 92px ${F_DISPLAY}`;
      c.shadowColor = tierKleur(t);
      c.shadowBlur = 24;
      c.fillStyle = '#fff';
      c.fillText('?', 2, ey + 6);
      c.shadowBlur = 0;
      c.font = `700 10px ${F_TEKST}`;
      spatie(c, 3);
      c.fillStyle = 'rgba(255,255,255,.65)';
      c.fillText('1 CIJFER · SEIZOEN 1', 3, PH / 2 - 56);
      spatie(c, 0);
      c.restore();
    }

    // ───────────────────────── Walkout ─────────────────────────
    function figuur(x, voetY, h, ph, amp, t) {
      const c = ctx;
      const kleur = tierKleur(t);
      const heup = voetY - h * 0.48;
      const schouder = voetY - h * 0.8;
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = '#04050a';
      c.fillStyle = '#04050a';
      c.shadowColor = kleur;
      c.shadowBlur = 22 + 40 * I;
      const bob = Math.abs(Math.sin(ph)) * h * 0.012 * amp;
      c.translate(0, -bob);
      // benen: van voren gezien stappen ze vooral op en neer
      for (const s of [-1, 1]) {
        const til = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI))) * amp;
        const vx = x + s * h * 0.075;
        const vy = voetY - til * h * 0.07;
        const kx = x + s * h * (0.085 + til * 0.02);
        const ky = heup + (vy - heup) * 0.5 - til * h * 0.03;
        c.lineWidth = h * 0.08;
        c.beginPath();
        c.moveTo(x + s * h * 0.06, heup);
        c.lineTo(kx, ky);
        c.lineTo(vx, vy);
        c.stroke();
      }
      // armen hangen langs het lichaam en zwaaien een beetje mee
      for (const s of [-1, 1]) {
        const zwaai = Math.sin(ph + (s > 0 ? Math.PI : 0)) * amp;
        c.lineWidth = h * 0.055;
        c.beginPath();
        c.moveTo(x + s * h * 0.15, schouder + h * 0.03);
        c.lineTo(x + s * h * 0.19, schouder + h * 0.19 + zwaai * h * 0.01);
        c.lineTo(x + s * h * 0.18, schouder + h * 0.36 - zwaai * h * 0.04);
        c.stroke();
      }
      // romp
      c.beginPath();
      c.moveTo(x - h * 0.15, schouder);
      c.quadraticCurveTo(x, schouder - h * 0.03, x + h * 0.15, schouder);
      c.lineTo(x + h * 0.11, heup + h * 0.02);
      c.lineTo(x - h * 0.11, heup + h * 0.02);
      c.closePath();
      c.fill();
      // nek + hoofd
      c.lineWidth = h * 0.05;
      c.beginPath();
      c.moveTo(x, schouder);
      c.lineTo(x, schouder - h * 0.06);
      c.stroke();
      c.beginPath();
      c.arc(x, voetY - h * 0.92, h * 0.066, 0, 6.283);
      c.fill();
      c.shadowBlur = 0;
      // rugzakbandjes (randlicht)
      c.strokeStyle = 'rgba(255,255,255,.12)';
      c.lineWidth = h * 0.012;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(x + s * h * 0.075, schouder - h * 0.005);
        c.quadraticCurveTo(x + s * h * 0.09, schouder + h * 0.12, x + s * h * 0.08, heup - h * 0.04);
        c.stroke();
      }
      c.restore();
    }

    function plaatje(label, waarde, x, y, q, t) {
      if (q <= 0) return;
      const sc = veer(clamp(q, 0, 1));
      const c = ctx;
      c.save();
      c.translate(x, y);
      c.scale(Math.max(0.01, sc), Math.max(0.01, sc));
      const fs = clamp(Math.min(W, H) * 0.04, 16, 28);
      c.font = `800 ${fs}px ${F_DISPLAY}`;
      let s = waarde.toUpperCase();
      const maxW = W * 0.28;
      if (c.measureText(s).width > maxW) {
        while (c.measureText(s + '…').width > maxW && s.length > 3) s = s.slice(0, -1);
        s += '…';
      }
      const w = Math.max(c.measureText(s).width, fs * 3) + fs * 1.8;
      const h = fs * 2.7;
      c.shadowColor = tierKleur(t);
      c.shadowBlur = 30;
      rr(c, -w / 2, -h / 2, w, h, 14);
      const bg = c.createLinearGradient(0, -h / 2, 0, h / 2);
      bg.addColorStop(0, 'rgba(20,24,46,.92)');
      bg.addColorStop(1, 'rgba(6,8,18,.92)');
      c.fillStyle = bg;
      c.fill();
      c.shadowBlur = 0;
      c.lineWidth = 2;
      c.strokeStyle = tierKleur(t);
      c.stroke();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 ${fs * 0.42}px ${F_TEKST}`;
      spatie(c, fs * 0.12);
      c.fillStyle = 'rgba(255,255,255,.6)';
      c.fillText(label, 0, -h * 0.22);
      spatie(c, 0);
      c.font = `800 ${fs}px ${F_DISPLAY}`;
      c.fillStyle = '#fff';
      c.fillText(s, 0, h * 0.13);
      c.restore();
    }

    function walkoutScene(t, dt) {
      const q = (t - TL.F) / TL.WO;
      const cx = W / 2;
      const horizon = H * 0.66;
      const kleur = tierKleur(t);
      tunnel(t, dt, 0.25, 0.2);

      // vloer
      const vloer = ctx.createLinearGradient(0, horizon, 0, H);
      vloer.addColorStop(0, 'rgba(255,255,255,.05)');
      vloer.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vloer;
      ctx.fillRect(0, horizon, W, H - horizon);

      // tunnelopening met tegenlicht
      gloed(cx, horizon - H * 0.2, H * (0.3 + 0.25 * q), '#ffffff', 0.5);
      gloed(cx, horizon - H * 0.2, H * 0.95, kleur, 0.55);

      // spots
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) {
        const a = Math.sin(t * 0.0012 + (s > 0 ? 0 : 2)) * 0.35;
        const bx = cx + s * W * 0.55;
        const gr = ctx.createLinearGradient(bx, 0, cx, horizon);
        gr.addColorStop(0, kleur);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.16 + 0.12 * I;
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(bx, -20);
        ctx.lineTo(cx + Math.sin(a) * W * 0.4 - W * 0.12, horizon + 40);
        ctx.lineTo(cx + Math.sin(a) * W * 0.4 + W * 0.12, horizon + 40);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // camera-flitsen van de ‘fotografen’
      const n = Math.floor(Math.random() * (1 + 8 * I));
      for (let i = 0; i < n; i++) {
        const x = rnd(W * 0.03, W * 0.97);
        const y = rnd(horizon - H * 0.15, horizon + H * 0.1);
        gloed(x, y, rnd(10, 30 + 40 * I), '#ffffff', 0.9);
      }
      // Bij flitsen van de fotografen hoort een camerageklik: onregelmatig, en steeds sneller naarmate
      // de leerling dichterbij komt, maar niet als een machinegeweer.
      if (n > 0 && t >= S.volgendeSluiter) {
        S.volgendeSluiter = t + rnd(220, 520) * (1.5 - q);
        geluid.sluiter();
      }

      // de leerling loopt naar voren
      const p = clamp(q / 0.82, 0, 1);
      const sc = 0.12 + 0.88 * easeOut(p);
      const h = H * 0.6 * sc;
      const voet = horizon - H * 0.06 + H * 0.3 * easeOut(p);
      const loopt = q < 0.82 ? 1 : Math.max(0, 1 - (q - 0.82) / 0.06);
      // schaduw op de vloer
      ctx.save();
      ctx.globalAlpha = 0.5 * sc;
      const sch = ctx.createRadialGradient(cx, voet, 0, cx, voet, h * 0.3);
      sch.addColorStop(0, 'rgba(0,0,0,.9)');
      sch.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sch;
      ctx.fillRect(cx - h * 0.3, voet - h * 0.06, h * 0.6, h * 0.12);
      ctx.restore();
      figuur(cx, voet, h, t * 0.0075, loopt, t);

      // nevel
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of S.nevel) {
        m.x += m.v * dt;
        gloed(m.x * W, m.y * H, m.r * W, 'rgba(160,170,210,.5)', 0.12);
      }
      ctx.restore();

      // informatie-plaatjes zoals bij een echte walkout
      plaatje('VAK', vak, W * 0.2, H * 0.17, (q - 0.16) * 4, t);
      plaatje('ONDERWERP', onder, W * 0.8, H * 0.17, (q - 0.38) * 4, t);
      plaatje(`WEGING ${weging}×`, 'Cijfer ???', cx, H * 0.1, (q - 0.62) * 4, t);
    }

    // ───────────────────────── De kaart ─────────────────────────
    const CW = 300;
    const CH = 440;

    function kaartVorm(c) {
      c.beginPath();
      c.moveTo(-CW / 2, -CH / 2 + 44);
      c.quadraticCurveTo(-CW / 2 + 6, -CH / 2 + 6, -CW / 2 + 44, -CH / 2);
      c.lineTo(-CW / 2 + 92, -CH / 2);
      c.quadraticCurveTo(0, -CH / 2 + 22, CW / 2 - 92, -CH / 2);
      c.lineTo(CW / 2 - 44, -CH / 2);
      c.quadraticCurveTo(CW / 2 - 6, -CH / 2 + 6, CW / 2, -CH / 2 + 44);
      c.lineTo(CW / 2, CH / 2 - 76);
      c.quadraticCurveTo(CW / 2, CH / 2 - 22, 0, CH / 2);
      c.quadraticCurveTo(-CW / 2, CH / 2 - 22, -CW / 2, CH / 2 - 76);
      c.closePath();
    }

    function pas(c, s, maxW) {
      if (c.measureText(s).width <= maxW) return s;
      while (c.measureText(s + '…').width > maxW && s.length > 3) s = s.slice(0, -1);
      return s + '…';
    }

    function buste(c, x, y, h, kleur) {
      c.save();
      const gr = c.createLinearGradient(0, y - h * 0.5, 0, y + h * 0.5);
      gr.addColorStop(0, kleur);
      gr.addColorStop(0.75, kleur);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.globalAlpha = 0.82;
      // hoofd
      c.beginPath();
      c.ellipse(x, y - h * 0.18, h * 0.17, h * 0.2, 0, 0, 6.283);
      c.fill();
      // nek + schouders
      c.beginPath();
      c.moveTo(x - h * 0.07, y + h * 0.0);
      c.lineTo(x + h * 0.07, y + h * 0.0);
      c.quadraticCurveTo(x + h * 0.1, y + h * 0.1, x + h * 0.38, y + h * 0.2);
      c.quadraticCurveTo(x + h * 0.48, y + h * 0.26, x + h * 0.48, y + h * 0.5);
      c.lineTo(x - h * 0.48, y + h * 0.5);
      c.quadraticCurveTo(x - h * 0.48, y + h * 0.26, x - h * 0.38, y + h * 0.2);
      c.quadraticCurveTo(x - h * 0.1, y + h * 0.1, x - h * 0.07, y);
      c.closePath();
      c.fill();
      // rugzakbandjes
      c.globalAlpha = 0.25;
      c.strokeStyle = tier === 3 ? '#000' : '#fff';
      c.lineWidth = h * 0.05;
      c.lineCap = 'round';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(x + s * h * 0.2, y + h * 0.16);
        c.quadraticCurveTo(x + s * h * 0.24, y + h * 0.32, x + s * h * 0.22, y + h * 0.48);
        c.stroke();
      }
      c.restore();
    }

    function kaart(c, voorkant, waarde, t, glow) {
      const pal = T.pal;
      const tk = T.tekst;
      c.save();
      c.shadowColor = tierKleur(t);
      c.shadowBlur = glow;
      kaartVorm(c);
      const gr = c.createLinearGradient(-CW / 2, -CH / 2, CW / 2, CH / 2);
      if (voorkant) {
        gr.addColorStop(0, pal[0]);
        gr.addColorStop(0.45, pal[1]);
        gr.addColorStop(0.7, pal[2]);
        gr.addColorStop(1, pal[1]);
      } else {
        gr.addColorStop(0, '#171c42');
        gr.addColorStop(1, '#04050c');
      }
      c.fillStyle = gr;
      c.fill();
      c.shadowBlur = 0;

      c.save();
      kaartVorm(c);
      c.clip();
      if (voorkant) {
        // patroon
        c.globalAlpha = tier === 3 ? 0.18 : 0.1;
        c.strokeStyle = tier === 3 ? '#38e1ff' : '#fff';
        c.lineWidth = 1;
        for (let i = -CH; i < CH; i += 14) {
          c.beginPath();
          c.moveTo(-CW / 2, i);
          c.lineTo(CW / 2, i + CW * 0.6);
          c.stroke();
        }
        c.globalAlpha = 1;
        const hl = c.createRadialGradient(-40, -CH / 2 + 60, 0, -40, -CH / 2 + 60, 260);
        hl.addColorStop(0, `rgba(255,255,255,${tier === 3 ? 0.14 : 0.35})`);
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = hl;
        c.fillRect(-CW, -CH, CW * 2, CH * 2);
        if (tier === 4 || tier === 3) {
          const hg = c.createLinearGradient(-CW, -CH, CW, CH);
          for (let i = 0; i <= 6; i++) hg.addColorStop(i / 6, `hsla(${(t * 0.08 + i * 60) % 360},100%,65%,${tier === 4 ? 0.3 : 0.14})`);
          c.fillStyle = hg;
          c.globalCompositeOperation = tier === 4 ? 'source-over' : 'overlay';
          c.fillRect(-CW, -CH, CW * 2, CH * 2);
          c.globalCompositeOperation = 'source-over';
        }
        buste(c, 52, -CH / 2 + 158, 210, tier === 3 ? 'rgba(220,250,255,.9)' : 'rgba(0,0,0,.55)');
        // donkere band onder
        const band = c.createLinearGradient(0, CH / 2 - 190, 0, CH / 2);
        band.addColorStop(0, 'rgba(0,0,0,0)');
        band.addColorStop(1, tier === 3 ? 'rgba(0,0,20,.35)' : 'rgba(0,0,0,.12)');
        c.fillStyle = band;
        c.fillRect(-CW, CH / 2 - 190, CW * 2, 190);
      } else {
        c.strokeStyle = 'rgba(255,255,255,.05)';
        for (let i = -CH; i < CH; i += 10) {
          c.beginPath();
          c.moveTo(-CW / 2, i);
          c.lineTo(CW / 2, i + CW);
          c.stroke();
        }
      }
      const off = (((t * 0.0005) % 2) - 0.5) * CW * 2.6;
      const sh = c.createLinearGradient(off - 80, -CH / 2, off + 80, CH / 2);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, `rgba(255,255,255,${voorkant ? 0.38 : 0.12})`);
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sh;
      c.fillRect(-CW, -CH, CW * 2, CH * 2);
      c.restore();

      // randen
      kaartVorm(c);
      c.strokeStyle = voorkant ? pal[2] : tierKleur(t);
      c.lineWidth = 5;
      c.stroke();
      c.save();
      c.scale(0.94, 0.955);
      kaartVorm(c);
      c.strokeStyle = voorkant ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.1)';
      c.lineWidth = 1.2;
      c.stroke();
      c.restore();

      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      if (!voorkant) {
        c.beginPath();
        c.arc(0, -10, 74, 0, 6.283);
        c.strokeStyle = tierKleur(t);
        c.lineWidth = 3;
        c.stroke();
        c.font = `800 110px ${F_DISPLAY}`;
        c.fillStyle = '#fff';
        c.shadowColor = tierKleur(t);
        c.shadowBlur = 30;
        c.textBaseline = 'middle';
        c.fillText('?', 3, -4);
        c.shadowBlur = 0;
        c.font = `700 11px ${F_TEKST}`;
        spatie(c, 4);
        c.fillStyle = 'rgba(255,255,255,.55)';
        c.fillText('PACK OPENER', 2, CH / 2 - 90);
        spatie(c, 0);
        c.restore();
        return;
      }

      c.fillStyle = tk;
      // cijfer
      c.font = `800 ${waarde.length > 3 ? 40 : 50}px ${F_DISPLAY}`;
      spatie(c, -1.5);
      c.fillText(waarde, -CW / 2 + 74, -CH / 2 + 100);
      spatie(c, 0);
      c.font = `800 20px ${F_TEKST}`;
      spatie(c, 2);
      c.fillText(afkorting, -CW / 2 + 72, -CH / 2 + 132);
      spatie(c, 0);
      c.globalAlpha = 0.5;
      c.fillRect(-CW / 2 + 48, -CH / 2 + 144, 48, 2);
      c.globalAlpha = 1;
      // embleem met beginletter
      c.beginPath();
      c.arc(-CW / 2 + 72, -CH / 2 + 178, 21, 0, 6.283);
      c.fillStyle = tk;
      c.globalAlpha = 0.14;
      c.fill();
      c.globalAlpha = 1;
      c.lineWidth = 2;
      c.strokeStyle = tk;
      c.stroke();
      c.font = `800 18px ${F_DISPLAY}`;
      c.textBaseline = 'middle';
      c.fillText(vak.charAt(0).toUpperCase(), -CW / 2 + 72, -CH / 2 + 179);
      // weging
      c.font = `800 13px ${F_TEKST}`;
      c.fillText(`${weging}×`, -CW / 2 + 72, -CH / 2 + 222);
      c.textBaseline = 'alphabetic';

      // naam
      c.font = `800 27px ${F_DISPLAY}`;
      spatie(c, -0.5);
      c.fillText(pas(c, vak.toUpperCase(), CW - 50), 0, CH / 2 - 162);
      spatie(c, 0);
      c.globalAlpha = 0.45;
      c.fillRect(-CW / 2 + 40, CH / 2 - 150, CW - 80, 1.5);
      c.globalAlpha = 1;
      c.font = `600 14px ${F_TEKST}`;
      c.fillText(pas(c, onder, CW - 60), 0, CH / 2 - 128);
      // stats
      for (let i = 0; i < 6; i++) {
        const x = -84 + (i % 3) * 84;
        const y = CH / 2 - 92 + Math.floor(i / 3) * 30;
        c.textAlign = 'right';
        c.font = `800 19px ${F_DISPLAY}`;
        c.fillText(String(statWaarde(i)), x + 4, y);
        c.textAlign = 'left';
        c.font = `600 13px ${F_TEKST}`;
        c.globalAlpha = 0.8;
        c.fillText(STATS[i], x + 9, y - 1);
        c.globalAlpha = 1;
      }
      c.textAlign = 'center';
      c.globalAlpha = 0.55;
      c.font = `700 9.5px ${F_TEKST}`;
      spatie(c, 2);
      c.fillText(`${T.naam.toUpperCase()} · ${datum.toUpperCase()}`, 0, CH / 2 - 26);
      spatie(c, 0);
      c.restore();
    }

    // ───────────────────────── Effecten bij de onthulling ─────────────────────────
    function onthul(t) {
      S.onthuld = true;
      roep('opOnthuld');
      const cx = W / 2;
      const cy = kaartY();
      const n = Math.floor(20 + 480 * I);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.283);
        const sp = rnd(100, 300 + 1200 * I);
        S.deeltjes.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.7, 1.4 + I), size: rnd(1.2, 2.5 + 3.5 * I), g: 160, hue: tier === 4 ? rnd(0, 360) : null, streep: Math.random() < 0.5 });
      }
      for (let i = 0; i < 1 + Math.round(5 * I); i++) S.golven.push({ delay: i * 0.12, v: 500 + 900 * I });
      if (tier === 0) {
        for (let i = 0; i < 160; i++) S.confetti.push({ regen: true, x: rnd(0, W), y: rnd(-H, 0), vy: rnd(500, 900), l: rnd(10, 22) });
      } else if (g >= 6) {
        const nc = Math.floor(400 * (I - 0.5) * 2 * (g >= 9 ? 1.5 : 1)) + 30;
        for (let i = 0; i < nc; i++) S.confetti.push({ x: rnd(0, W), y: rnd(-H * 0.6, -10), vx: rnd(-60, 60), vy: rnd(120, 360), w: rnd(6, 12), h: rnd(4, 8), rot: rnd(0, 6), vr: rnd(-8, 8), hue: rnd(0, 360) });
      }
      if (g >= 9) for (let i = 0; i < (g >= 9.95 ? 14 : 5); i++) S.vuurwerk.push(t + 400 + i * 380);
    }

    function knal(x, y) {
      const hue = rnd(0, 360);
      const n = 80 + Math.floor(60 * I);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.283);
        const sp = rnd(60, 380);
        S.deeltjes.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(1, 1.8), size: rnd(1.2, 3), g: 160, hue: hue + rnd(-20, 20), streep: true });
      }
      geluid.vuurwerk();
    }

    function kaartSchaal() {
      return Math.min((W * 0.82) / CW, (H - 310) / CH, 1.3) * (0.86 + 0.14 * I);
    }
    const kaartY = () => H / 2 + 4;

    // ───────────────────────── Hoofdlus ─────────────────────────
    function lus(nu) {
      if (gesloten) return;
      const dt = Math.min(0.05, (nu - laatst) / 1000);
      laatst = nu;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (fase === 'intro') {
        achtergrond(nu, 0);
        if (!S) nieuweReeks();
        tunnel(nu, dt, 0.35, 0.15);
        raf = requestAnimationFrame(lus);
        return;
      }

      const t = nu - start;
      for (const e of S.events) {
        if (!e.done && t >= e.time) {
          e.done = true;
          try {
            e.fn(t);
          } catch (x) {
            /* één effect mag de rest niet slopen */
          }
        }
      }

      const { A, B, C, D, E, F, RV } = TL;
      const Sk = TL.S;
      const cx = W / 2;
      const cy = H / 2;
      achtergrond(t, t >= Sk ? 0.18 + 0.2 * I : 0);

      let amp = 0;
      if (t > D && t < E) amp = (2 + 30 * I) * Math.pow((t - D) / (E - D), 1.6);
      else if (t >= E && t < F) amp = (8 + 34 * I) * Math.exp(-(t - E) / 300);
      else if (t >= F && t < Sk) amp = (0.5 + 3 * I) * Math.abs(Math.sin(t * 0.006)) + (Sk - t < 600 ? 2 + 8 * I : 0);
      else if (t >= RV) amp = (10 + 50 * I) * Math.exp(-(t - RV) / (300 + 500 * I));
      if (minderBeweging) amp *= 0.15;
      ctx.save();
      ctx.translate(rnd(-amp, amp), rnd(-amp, amp));

      const psc = (Math.min(W, H) / 700) * 1.2;
      if (t < F) {
        const tA = Math.min(1, t / 600) * (t < C ? 1 : 0.5);
        tunnel(t, dt, tA, t < D ? 1 : 0.3);
        if (A >= 0) {
          zoomTekst('VAK', vak, (t - A) / (B - A));
          zoomTekst('ONDERWERP', onder, (t - B) / (C - B));
        }
        if (t >= C && t < E) {
          let s;
          let rot = 0;
          let jx = 0;
          let jy = 0;
          let ramp = 0;
          if (t < D) {
            const p = (t - C) / (D - C);
            s = 0.03 * Math.pow(33.3, p);
            rot = (1 - p) * 0.6;
          } else {
            s = 1;
            ramp = (t - D) / (E - D);
            const j = (2 + 20 * I) * ramp * (minderBeweging ? 0.2 : 1);
            jx = rnd(-j, j);
            jy = rnd(-j, j) + Math.sin(t * 0.004) * 6;
            rot = rnd(-j, j) * 0.004;
            if (I > 0.2) stralen(cx, cy, t, ramp * (0.12 + 0.35 * I), 6 + Math.floor(20 * I));
            gloed(cx, cy, H * (0.2 + 0.6 * ramp * I), tierKleur(t), ramp * (0.2 + 0.5 * I));
          }
          pakje(cx + jx, cy + jy, s * psc, rot, 10 + (20 + 120 * I) * Math.max(ramp, 0.2), t);
        } else if (t >= E) {
          const p = (t - E) / (F - E);
          const e = p * p;
          gloed(cx, cy, H * (0.4 + 1.2 * p), tierKleur(t), 0.5 + 0.4 * I);
          const bw = W * (0.02 + 0.5 * p) * (0.4 + I);
          const gr = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)');
          gr.addColorStop(0.5, '#fff');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(cx - bw, 0, bw * 2, H);
          pakje(cx - e * W * 0.15, cy - e * H * 0.7, psc, -e * 1.8, 40, t, 'boven', 1 - p);
          pakje(cx, cy + e * H * 0.35, psc, e * 0.3, 40, t, 'onder', 1 - p);
          stralen(cx, cy, t, 0.55, 10 + Math.floor(30 * I));
        }
      } else if (t < Sk) {
        walkoutScene(t, dt);
      } else {
        kaartScene(t, dt);
      }
      ctx.restore();

      let fa = 0;
      for (const f of S.flitsen) fa += f.p * Math.exp(-(t - f.t0) / f.dec);
      if (fa > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, fa * (minderBeweging ? 0.4 : 1))})`;
        ctx.fillRect(0, 0, W, H);
      }

      // hints & knoppen
      if (t >= RV + 1300 && fase !== 'klaar') {
        fase = 'klaar';
        hint('');
        actiesEl.classList.add('aan');
        actiesEl.querySelector('.goud').focus({ preventScroll: true });
      } else if (fase === 'reeks') {
        hint(t > 1200 && t < RV - 1200 ? 'Klik om over te slaan' : '');
      }
      raf = requestAnimationFrame(lus);
    }

    function kaartScene(t, dt) {
      const { RV } = TL;
      const Sk = TL.S;
      const cx = W / 2;
      const cy = kaartY();
      const q = (t - Sk) / 1000;
      gloed(cx, cy, Math.hypot(W, H) * (0.3 + 0.4 * I), tierKleur(t), 0.25 + 0.3 * I);
      stralen(cx, cy, t, 0.1 + 0.28 * I, 8 + Math.floor(24 * I));

      const sc = kaartSchaal() * (S.onthuld ? 1 + 0.015 * Math.sin(t * 0.004) : 1);
      const enter = clamp(q / 0.6, 0, 1);
      const es = 1 - Math.pow(1 - enter, 3) * Math.cos(enter * 5);
      const fp = clamp((t - Sk - 300) / 1100, 0, 1);
      const hoek = (1 - smooth(fp)) * Math.PI;
      const sx = Math.max(0.02, Math.abs(Math.cos(hoek)));
      const voor = hoek < Math.PI / 2;
      const cp = clamp((t - Sk - 1300) / (RV - Sk - 1300), 0, 1);
      const val = 1 + (g - 1) * (1 - Math.pow(1 - cp, 2));
      const getoond = t >= RV ? cijferTekst : fmt(Math.min(g, Math.round(val * 10) / 10));
      if (voor && t < RV && cp > 0) {
        const stap = Math.floor(val * 3);
        if (stap !== S.laatsteTel) {
          S.laatsteTel = stap;
          geluid.tik(g > 1 ? (val - 1) / (g - 1) : 1);
        }
      }

      ctx.save();
      ctx.translate(cx, cy + (1 - enter) * 60);
      ctx.scale(sx * sc * Math.max(0.01, es), sc * Math.max(0.01, es));
      kaart(ctx, voor, getoond, t, 20 + (30 + 150 * I) * (S.onthuld ? 1 : 0.4));
      ctx.restore();

      if (!S.onthuld) return;
      const rq = (t - RV) / 1000;
      for (const sw of S.golven) {
        if (rq < sw.delay) continue;
        const r = (rq - sw.delay) * sw.v;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - r / (Math.hypot(W, H) * 0.6));
        ctx.strokeStyle = tierKleur(t);
        ctx.lineWidth = 3 + 10 * I;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 6.283);
        ctx.stroke();
        ctx.restore();
      }
      while (S.vuurwerk.length && t >= S.vuurwerk[0]) {
        S.vuurwerk.shift();
        knal(rnd(W * 0.15, W * 0.85), rnd(H * 0.12, H * 0.45));
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      S.deeltjes = S.deeltjes.filter((p) => p.life > 0);
      for (const p of S.deeltjes) {
        p.life -= dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        ctx.globalAlpha = Math.min(1, p.life);
        const kleur = p.hue != null ? `hsl(${p.hue},100%,62%)` : tierKleur(t);
        if (p.streep) {
          ctx.strokeStyle = kleur;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
        } else {
          ctx.fillStyle = kleur;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.283);
          ctx.fill();
        }
      }
      ctx.restore();
      S.confetti = S.confetti.filter((c) => c.y < H + 30);
      for (const c of S.confetti) {
        if (c.regen) {
          c.y += c.vy * dt;
          ctx.strokeStyle = 'rgba(150,170,200,.45)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x - 2, c.y - c.l);
          ctx.stroke();
          continue;
        }
        c.x += c.vx * dt + Math.sin(c.rot) * 20 * dt;
        c.y += c.vy * dt;
        c.rot += c.vr * dt;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.scale(1, Math.cos(c.rot * 1.7));
        ctx.fillStyle = `hsl(${c.hue},90%,62%)`;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }

      // titel boven en tier onder de kaart
      const la = clamp(rq * 3, 0, 1);
      const top = cy - (CH / 2) * sc;
      const fs = clamp(Math.min(W, H) * (0.045 + 0.04 * I), 26, 64);
      ctx.save();
      ctx.globalAlpha = la;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `800 ${fs}px ${F_DISPLAY}`;
      spatie(ctx, -fs * 0.03);
      ctx.translate(cx, Math.max(fs + 52, top - 24));
      const pop = veer(clamp(rq * 1.6, 0, 1));
      ctx.scale(pop, pop);
      ctx.fillStyle = tierKleur(t);
      ctx.shadowColor = tierKleur(t);
      ctx.shadowBlur = 20 * I + 6;
      ctx.fillText(T.label.toUpperCase(), 0, 0);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = clamp((rq - 0.4) * 2, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = `600 15px ${F_TEKST}`;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(`${T.naam} · ${T.sub}`, cx, cy + (CH / 2) * sc + 30);
      ctx.restore();
    }

    // ───────────────────────── Bediening ─────────────────────────
    function begin() {
      if (fase !== 'intro') return;
      geluid.start();
      geluid.knop();
      introEl.classList.add('weg');
      fase = 'reeks';
      if (!S) nieuweReeks();
      S.tunnel = 0;
      start = performance.now();
      cv.focus && cv.focus();
    }

    function overslaan() {
      if (fase !== 'reeks') return;
      const t = performance.now() - start;
      const doel = TL.S - 250;
      if (t >= doel) return;
      for (const e of S.events) if (e.time < doel) e.done = true;
      S.flitsen.push({ t0: doel, p: 0.7, dec: 400 });
      geluid.stopAlles();
      geluid.whoosh(0.5);
      start = performance.now() - doel;
    }

    function opnieuw() {
      geluid.stopAlles();
      actiesEl.classList.remove('aan');
      fase = 'reeks';
      nieuweReeks();
      start = performance.now();
      geluid.knop();
    }

    function opslaan() {
      const sch = 2;
      const pad = 40;
      const off = document.createElement('canvas');
      off.width = (CW + pad * 2) * sch;
      off.height = (CH + pad * 2) * sch;
      const c = off.getContext('2d');
      c.scale(sch, sch);
      c.translate(CW / 2 + pad, CH / 2 + pad);
      kaart(c, true, cijferTekst, performance.now() - start, 30);
      const naam = `pakket-${vak.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${cijferTekst.replace(',', '-')}.png`;
      off.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = naam;
        root.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, 'image/png');
      geluid.knop();
    }

    function sluit() {
      if (gesloten) return;
      gesloten = true;
      cancelAnimationFrame(raf);
      removeEventListener('keydown', toets, true);
      removeEventListener('resize', resize);
      document.documentElement.style.overflow = oudeOverflow;
      geluid.sluit();
      host.remove();
      roep('opGesloten');
      if (location.protocol === 'chrome-extension:' || /stage\.html$/.test(location.pathname)) {
        document.body && (document.body.innerHTML = '<p style="font:15px system-ui;color:#aab;text-align:center;margin-top:40vh">Je kunt dit tabblad sluiten.</p>');
        try {
          window.close();
        } catch (e) {
          /* niet toegestaan */
        }
      }
    }
    host.__spoSluit = sluit;

    function toets(e) {
      if (gesloten) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        sluit();
        return;
      }
      const opKnop = e.composedPath && e.composedPath().some((n) => n.tagName === 'BUTTON');
      if ((e.key === ' ' || e.key === 'Enter') && !opKnop) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (fase === 'intro') begin();
        else if (fase === 'reeks') overslaan();
      }
    }
    addEventListener('keydown', toets, true);

    root.addEventListener('click', (e) => {
      const knop = e.target.closest && e.target.closest('[data-a]');
      if (knop) {
        const a = knop.dataset.a;
        if (a === 'sluit') sluit();
        else if (a === 'start') begin();
        else if (a === 'opnieuw') opnieuw();
        else if (a === 'opslaan') opslaan();
        else if (a === 'geluid') {
          stil = !stil;
          geluid.start();
          geluid.stil(stil);
          zetGeluidKnop();
        }
        return;
      }
      if (e.target === cv || e.target === introEl) {
        if (fase === 'intro') begin();
        else if (fase === 'reeks' && performance.now() - start > 700) overslaan();
      }
    });

    geluid.laad();
    const geluidenKlaar = Promise.race([geluid.laad(), new Promise((r) => setTimeout(r, 1500))]);
    Promise.all([fontsKlaar, geluidenKlaar]).then(() => {
      if (gesloten) return;
      if (direct) begin();
      raf = requestAnimationFrame(lus);
      const startKnop = root.querySelector('[data-a="start"]');
      if (startKnop && !direct) startKnop.focus({ preventScroll: true });
    });
  }

  window.__somPackRun = run;
  if (window.__somPack) run();
})();
