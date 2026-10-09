/*
 * Somtoday Pack Opener — main.js
 * De pakket-animatie. Draait op drie manieren:
 *  - content.js roept window.__somPackRun() aan als je op een afgedekt cijfer klikt;
 *  - de popup injecteert de motor-bestanden voor een handmatig pakket;
 *  - stage.html laadt ze als reservepagina.
 *
 * De gegevens staan in window.__somPack:
 *   { vak, cijfer, onderwerp, weging, snel, stil,
 *     direct,       // sla het startscherm over (je hebt al op het cijfer geklikt)
 *     opOnthuld,    // wordt aangeroepen op het moment dat het cijfer onthuld wordt
 *     opGesloten }  // wordt aangeroepen als de overlay dicht gaat
 *
 * content.js kan ook window.__somPackWarm() aanroepen (bijvoorbeeld zodra je met de muis boven een
 * afgedekt cijfer komt): dan wordt de videokaart alvast klaargezet, zodat de animatie bij de klik
 * zonder haperen begint.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const { klem, esc } = SPO;

  const HOST_ID = '__somPackHost';
  let warmStaat = null; // een alvast klaargezette motor (zie warm)
  let artCache = null; // { sleutel, belofte }: de afbeeldingen van het cijfer waar je het laatst boven hing

  const sleutelVan = (d) => [d.vak, d.cijferTekst, d.onder, d.weging, d.snel ? 1 : 0, d.opening, d.persoon, d.T.pal.join(), d.rand, d.zeldzaam ? 'z' + (d.trede || '') : '', d.seizoen || ''].join('|');
  const pauzeRustig = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 150 }) : setTimeout(r, 12)));
  const pauzeSnel = () => new Promise((r) => setTimeout(r, 0));

  const F_DISPLAY = '"SPO Display", "Arial Black", system-ui, sans-serif';
  const F_TEKST = '"SPO Text", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

  const nuMs = () => performance.now();
  const volgendBeeld = () => new Promise((r) => requestAnimationFrame(() => r()));

  // ───────────────────────── Opwarmen ─────────────────────────
  function ontwarm() {
    if (!warmStaat) return;
    clearTimeout(warmStaat.timer);
    artCache = null;
    try {
      warmStaat.motor.verwijder();
    } catch (e) {
      /* al weg */
    }
    warmStaat = null;
  }

  // Wacht tot alle programma's van een warme motor klaar zijn en tekent ze dan één keer droog.
  function opwarmVolg(staat) {
    const poll = () => {
      if (warmStaat !== staat) return;
      if (staat.motor.alleKlaar()) {
        if (staat.motor.gelukt) {
          staat.motor.zetGrootte(64, 64);
          staat.motor.opwarmen();
        }
        staat.klaar = true;
      } else setTimeout(poll, 40);
    };
    poll();
  }

  // de programma's van de mythische film (mythisch.js): alleen bij een mythische kaart, per wezen
  function mythModule(d) {
    // kosmisch (trede 3) heeft ook eigen programma's: de ruimte met het zwarte gat (kosmisch.js)
    if (d && d.zeldzaam && (d.trede | 0) === 3 && SPO.kosmisch) return SPO.kosmisch.module();
    if (!d || !d.zeldzaam || (d.trede | 0) !== 4 || !SPO.mythisch || !SPO.zeldzaam || !SPO.zeldzaam.wezenVan) return null;
    return SPO.mythisch.module(SPO.zeldzaam.wezenVan(d));
  }

  function warm(data) {
    let mod = null;
    let mythMod = null;
    // De afbeeldingen van dit cijfer maken we alvast, in kleine stukjes tussen de rest door.
    if (data) {
      try {
        const dd = SPO.maakData(data);
        mod = dd.opening !== 'pak' ? SPO.openingen[dd.opening] : null;
        mythMod = mythModule(dd);
        SPO.audio.voorlaad(dd.opening, dd.seizoen, dd.zeldzaam);
        const sleutel = sleutelVan(dd);
        if (!artCache || artCache.sleutel !== sleutel) {
          const belofte = SPO.art.laadLettertypes().then(() => SPO.art.maakAllesAsync(dd, pauzeRustig));
          belofte.catch(() => {
            if (artCache && artCache.belofte === belofte) artCache = null;
          });
          artCache = { sleutel, belofte };
        }
      } catch (e) {
        artCache = null;
      }
    }
    if (!SPO.Motor) return;
    if (warmStaat) {
      // de motor staat al klaar; de programma's van deze opening komen er nog bij
      for (const m of [mod, mythMod]) {
        if (m && !warmStaat.motor.extra.has(m.naam) && !warmStaat.motor.gl.isContextLost()) {
          warmStaat.klaar = false;
          warmStaat.motor.voegToe(m);
          opwarmVolg(warmStaat);
        }
      }
      return;
    }
    try {
      SPO.art.laadLettertypes();
      SPO.audio.voorlaad();
      const canvas = document.createElement('canvas');
      const motor = SPO.Motor.maak(canvas, {});
      if (!motor) return;
      if (mod) motor.voegToe(mod);
      if (mythMod) motor.voegToe(mythMod);
      const staat = { canvas, motor, klaar: false, timer: 0 };
      warmStaat = staat;
      opwarmVolg(staat);
      // Een kwartier niets gedaan? Dan geven we de videokaart weer vrij.
      staat.timer = setTimeout(ontwarm, 15 * 60 * 1000);
    } catch (e) {
      warmStaat = null;
    }
  }

  // ───────────────────────── De hoofdfunctie ─────────────────────────
  function run() {
    const dRuw = window.__somPack;
    if (!dRuw) return;

    const vorige = document.getElementById(HOST_ID);
    if (vorige && vorige.__spoSluit) vorige.__spoSluit();
    else if (vorige) vorige.remove();
    const oud = document.getElementById('__somPackOverlay'); // overblijfsel van versie 1
    if (oud) oud.remove();

    const d = SPO.maakData(dRuw);
    const debug = !!dRuw.debug;
    const T0 = nuMs();
    const log = (m) => debug && console.log(`[pakket] +${Math.round(nuMs() - T0)}ms ${m}`);
    const roep = (naam, arg) => {
      try {
        if (typeof dRuw[naam] === 'function') dRuw[naam](arg);
      } catch (e) {
        /* een fout in de koppeling mag de animatie niet stoppen */
      }
    };
    let stil = !!dRuw.stil;
    const minderBeweging = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const trillen = (p) => {
      if (navigator.vibrate && !minderBeweging) {
        try {
          navigator.vibrate(p);
        } catch (e) {
          /* niet ondersteund */
        }
      }
    };

    // ───── geluid: de AudioContext moet tijdens de klik worden gemaakt ─────
    const audio = SPO.audio.maak({ tier: d.tier, stil, opening: d.opening, seizoen: d.seizoen, zeldzaam: d.zeldzaam });
    const geluidKlaar = audio.laad();

    // ───── overlay (shadow DOM) ─────
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

    // Let op: geen backdrop-filter in deze overlay. Onder een bewegend beeld moet de browser dat bij elk
    // frame opnieuw uitrekenen en dat is precies wat haperingen geeft.
    const CSS = `
      :host { all: initial; }
      .wrap { position: fixed; inset: 0; font-family: ${F_TEKST}; color: #fff; -webkit-font-smoothing: antialiased; user-select: none; -webkit-user-select: none; background: #02030a; animation: opkomen .25s ease-out both; }
      @keyframes opkomen { from { opacity: 0; } }
      canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: pointer; touch-action: none; }
      button { font: inherit; color: inherit; cursor: pointer; }
      button:focus-visible { outline: 2px solid #ffd24a; outline-offset: 3px; }
      .top { position: absolute; top: 16px; left: 20px; right: 16px; display: flex; align-items: center; justify-content: space-between; pointer-events: none; }
      .merk { display: flex; align-items: center; gap: 10px; opacity: .9; }
      .merk span { display: flex; flex-direction: column; line-height: 1.1; font-weight: 650; font-size: 14px; font-family: ${F_DISPLAY}; letter-spacing: -.01em; }
      .merk small { font-family: ${F_TEKST}; font-size: 9.5px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: rgba(255,255,255,.55); }
      .knoppen { display: flex; gap: 8px; pointer-events: auto; }
      .ik { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(24,28,52,.72); transition: background .2s, transform .15s; }
      .ik:hover { background: rgba(60,66,110,.85); }
      .ik:active { transform: scale(.94); }
      .hint { position: absolute; left: 0; right: 0; bottom: 26px; text-align: center; font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,.62); letter-spacing: .02em; pointer-events: none; opacity: 0; transition: opacity .5s; }
      .hint.aan { opacity: 1; }
      .intro { position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; transition: opacity .45s, transform .6s cubic-bezier(.16,1,.3,1); }
      .intro.weg { opacity: 0; transform: scale(.94); pointer-events: none; }
      .melding { position: relative; width: min(390px, 100%); padding: 20px 22px 22px; border-radius: 26px; background: linear-gradient(180deg, rgba(30,34,58,.97), rgba(14,16,30,.98)); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 40px 120px -20px rgba(0,0,0,.85), 0 0 0 1px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.1); animation: in .8s cubic-bezier(.16,1,.3,1) both; }
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
      .knop { display: inline-flex; align-items: center; justify-content: center; gap: 9px; height: 48px; padding: 0 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,.16); background: rgba(24,28,52,.78); font-size: 14.5px; font-weight: 650; transition: transform .15s, filter .2s, background .2s; }
      .knop:hover { background: rgba(60,66,110,.9); }
      .knop:active { transform: scale(.97); }
      .knop.goud { border: 0; color: #241703; background: linear-gradient(135deg, #fff0b3 0%, #ffd24a 40%, #ff7a3d 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 12px 32px -10px rgba(255,140,40,.8); }
      .knop.goud:hover { filter: brightness(1.07); }
      .m-knop { width: 100%; margin-top: 20px; height: 54px; font-size: 16px; }
      .m-hint { margin-top: 10px; text-align: center; font-size: 12px; color: rgba(255,255,255,.4); }
      .acties { position: absolute; left: 0; right: 0; bottom: 24px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; padding: 0 16px; opacity: 0; transform: translateY(14px); pointer-events: none; transition: opacity .5s, transform .6s cubic-bezier(.16,1,.3,1); }
      .acties.aan { opacity: 1; transform: none; pointer-events: auto; }
      .reserve { position: absolute; inset: 0; display: none; place-items: center; }
      .reserve.aan { display: grid; }
      .reserve img { max-height: 70vh; max-width: 80vw; filter: drop-shadow(0 20px 60px rgba(255,200,80,.35)); animation: in .9s cubic-bezier(.16,1,.3,1) both; }
      @media (max-width: 520px) { .knop span { display: none; } .acties .knop.goud span { display: inline; } }
    `;

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    SPO.zetHtml(root, `<style>${CSS}</style>
      <div class="wrap" role="dialog" aria-modal="true" aria-label="${esc(SPO.openingTekst(d).aria)}: ${esc(d.vak)}">
        <div class="canvasplek"></div>
        <div class="reserve"></div>
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
            <div class="m-tekst">Er staat een nieuw cijfer klaar voor <b>${esc(d.vak)}</b>. <span class="m-vraag">${esc(SPO.openingTekst(d).tekst)}</span></div>
            <div class="m-sub"><span class="chip">${esc(d.onder)}</span><span class="chip">Weging ${d.weging}×</span></div>
            <button class="knop goud m-knop" data-a="start">${svg('pakket')}<span class="m-knoptekst">${esc(SPO.openingTekst(d).knop)}</span></button>
            <div class="m-hint">of druk op spatie</div>
          </div>
        </div>
        <div class="hint"></div>
        <div class="acties">
          <button class="knop" data-a="opnieuw">${svg('opnieuw')}<span>Opnieuw</span></button>
          <button class="knop" data-a="opslaan">${svg('opslaan')}<span>Opslaan als afbeelding</span></button>
          <button class="knop" data-a="deel">${svg('opslaan')}<span>Delen</span></button>
          <button class="knop goud" data-a="sluit"><span>Sluiten</span></button>
        </div>
      </div>`);
    document.documentElement.appendChild(host);

    const $ = (s) => root.querySelector(s);
    const plek = $('.canvasplek');
    const hintEl = $('.hint');
    const introEl = $('.intro');
    const actiesEl = $('.acties');
    const reserveEl = $('.reserve');
    const geluidKnop = $('[data-a="geluid"]');

    const oudeOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    function zetGeluidKnop() {
      SPO.zetHtml(geluidKnop, svg(stil ? 'uit' : 'aan'));
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

    // ───── toestand ─────
    let fase = 'laden'; // laden → intro → reeks → klaar
    let motor = null;
    let canvas = null;
    let scene = null;
    let lagen = null;
    let gesloten = false;
    let actief = true;
    let raf = 0;
    let start = 0;
    let laatst = 0;
    let laatsteTeken = 0;
    let tHuidig = 0;
    let beeldTeller = 0;
    const inv = { tilt: [0, 0], afspelen: true };
    const tiltDoel = [0, 0];
    let laatsteBeweging = 0;
    let rustTeller = 0;
    let kwaliteit = 0;
    let trageBeelden = 0;
    let ema = 16;
    let laatsteStap = 0;
    let basisSchaal = 1;
    let regelaar = !debug || !!dRuw.regelaar;
    // Sommige openingen (Schietkraam) wachten op een klik: tl.pauzes = tijden waarop de klok stilstaat tot je klikt.
    let pauzeIdx = 0;
    let wachtOpKlik = false;
    let pauzeSinds = 0;
    let kaartBewaard = false;
    // Openingen met een eigen `invoer` (Kluis kraken): de aanwijzer en pijltjes gaan tijdens een pauze naar de opening.
    let aanwijzerId = -1;
    let negeerKlikTot = 0;

    // ───── canvas en kwaliteit ─────
    function resize() {
      if (!motor) return;
      const W = Math.max(1, innerWidth);
      const H = Math.max(1, innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const budget = [3.1e6, 2.3e6, 1.6e6, 1.0e6][kwaliteit];
      basisSchaal = Math.min(dpr, Math.sqrt(budget / (W * H)));
      const sc = Math.max(0.3, basisSchaal);
      motor.zetGrootte(W * sc, H * sc);
    }

    // Als het beeld niet vloeiend is, gaan we automatisch een stapje lager: kleiner beeld en minder deeltjes.
    function regel(nu, ft) {
      if (!regelaar || fase !== 'reeks' && fase !== 'klaar') return;
      ema = ema * 0.9 + Math.min(ft, 100) * 0.1;
      if (beeldTeller < 25) return;
      if (ema > 22) trageBeelden++;
      else trageBeelden = Math.max(0, trageBeelden - 2);
      if (trageBeelden > 14 && kwaliteit < 3 && nu - laatsteStap > 900) {
        kwaliteit++;
        motor.kwaliteit = kwaliteit;
        if (scene) scene.lod = [1, 0.7, 0.45, 0.25][kwaliteit];
        laatsteStap = nu;
        trageBeelden = 0;
        ema = 16;
        resize();
      }
    }

    // ───── tijdlijn ─────
    function tNu(nu) {
      return (nu - start) / 1000;
    }
    function lus(nu) {
      if (gesloten) return;
      raf = requestAnimationFrame(lus);
      if (!actief || !scene || motor.gl.isContextLost()) return;
      if (nu - laatsteTeken < 11.5) return; // hoogstens ~85 beelden per seconde, ook op schermen van 144 Hz
      // Ligt de kaart er een tijdje rustig bij, dan tekenen we maar de helft van de beelden: spaart accu en videokaart.
      if (fase === 'klaar' && nu - laatsteBeweging > 6000 && (rustTeller++ & 1)) return;
      const ft = nu - (laatst || nu - 16);
      laatst = nu;
      laatsteTeken = nu;
      const dt = Math.min(0.05, ft / 1000);
      // een tijdje niet gekeken (ander tabblad) of een grote hapering: de tijd loopt niet door
      if (fase === 'reeks' && ft > 700) start += ft - 16;
      // de kaart volgt je muis, met wat vertraging
      const k = 1 - Math.exp(-dt * 7);
      inv.tilt[0] += (tiltDoel[0] - inv.tilt[0]) * k;
      inv.tilt[1] += (tiltDoel[1] - inv.tilt[1]) * k;

      if (fase === 'intro') {
        // Op het startscherm tekenen we alleen een rustige achtergrond, en niet te vaak.
        if (nu - (lus.wacht || 0) > 60) {
          lus.wacht = nu;
          scene.wacht((nu / 1000) % 600);
        }
        return;
      }
      let t = tNu(nu);
      const tlx = scene.tl;
      if (fase === 'reeks' && tlx.pauzes && pauzeIdx < tlx.pauzes.length) {
        const pz = tlx.pauzes[pauzeIdx];
        if (t >= pz) {
          if (!wachtOpKlik) {
            wachtOpKlik = true;
            pauzeSinds = nu;
          } else if (nu - pauzeSinds > (tlx.pauzeAuto || 12) * 1000) hervat(); // niet klikken mag de animatie niet laten hangen
          if (wachtOpKlik) {
            start = nu - pz * 1000;
            t = pz;
          }
        }
      }
      tHuidig = t;
      for (const e of scene.ev) {
        if (!e.klaar && t >= e.tijd) {
          e.klaar = true;
          if (t - e.tijd < 0.6) {
            try {
              e.fn(t);
            } catch (x) {
              /* één effect mag de rest niet slopen */
            }
          }
        }
      }
      scene.teken(t, dt, inv);
      if (wachtOpKlik) {
        // een opening met invoer mag de pauze zelf beëindigen (bv. na een gelukte stap): true, een tijd of 'over'
        const io = scene.opening && scene.opening.invoer;
        const r = io && io.klaar && io.klaar();
        if (r) hervat(r);
      }
      beeldTeller++;
      regel(nu, ft);
      // Geeft de opening steeds een fout? Dan slaan we haar over en gaan we meteen naar de kaart.
      if (scene.opFouten > 4 && fase === 'reeks' && t < scene.tl.K0 - 0.4) {
        const doel = scene.tl.K0 - 0.4;
        for (const e of scene.ev) if (e.tijd < doel) e.klaar = true;
        audio.stopAlles();
        start = nuMs() - doel * 1000;
      }

      const tl = scene.tl;
      if (fase === 'reeks') {
        if (t >= tl.EIND) {
          fase = 'klaar';
          hint('');
          actiesEl.classList.add('aan');
          const g = actiesEl.querySelector('.goud');
          if (g) g.focus({ preventScroll: true });
        } else hint(wachtOpKlik ? tl.klikHint || 'Klik om verder te gaan' : tl.pauzes ? '' : (t > 1.2 && t < tl.RV - 1.2) || (tl.vier && t > tl.vier && t < tl.EIND - 0.4) ? 'Klik om over te slaan' : '');
      }
    }

    // ───── bediening ─────
    // De klik na een pauze: de klok loopt weer.
    // naar: undefined (klik/spatie/wachttijd), true (stap klaar, klok loopt door), een tijd (klok springt daarheen) of 'over'.
    // Bij een opening met invoer slaat undefined/'over' ook alle volgende pauzes over (dan loopt het vanzelf).
    function hervat(naar) {
      if (!wachtOpKlik || !scene) return;
      const pzl = scene.tl.pauzes;
      const pz = pzl[pauzeIdx];
      const doel = typeof naar === 'number' && naar > pz ? naar : pz;
      wachtOpKlik = false;
      pauzeIdx++;
      if (naar === 'over' || (naar === undefined && scene.opening && scene.opening.invoer)) pauzeIdx = pzl.length;
      if (doel > pz) {
        for (const e of scene.ev) if (e.tijd < doel) e.klaar = true;
        while (pauzeIdx < pzl.length && pzl[pauzeIdx] < doel) pauzeIdx++;
      }
      start = nuMs() - doel * 1000;
      laatst = 0;
    }

    function begin() {
      if (fase !== 'intro') return;
      pauzeIdx = 0;
      wachtOpKlik = false;
      audio.start();
      audio.knop();
      introEl.classList.add('weg');
      fase = 'reeks';
      start = nuMs();
      laatst = 0;
      if (scene) scene.reset();
      const c = canvas;
      if (c && c.focus) c.focus({ preventScroll: true });
    }

    function overslaan() {
      if (fase !== 'reeks' || !scene) return;
      const t = tNu(nuMs());
      const sp = scene.sprong(t);
      if (!sp) return;
      const doel = sp.doel;
      const pzl = scene.tl.pauzes;
      while (pzl && pauzeIdx < pzl.length && pzl[pauzeIdx] < doel) pauzeIdx++;
      for (const e of scene.ev) if (e.tijd < doel) e.klaar = true;
      audio.stopAlles();
      audio.zwiep(0.5);
      if (sp.riser) audio.riser(0.45, 0.8);
      start = nuMs() - doel * 1000;
    }

    function opnieuw() {
      if (!scene) return;
      audio.stopAlles();
      actiesEl.classList.remove('aan');
      fase = 'reeks';
      pauzeIdx = 0;
      wachtOpKlik = false;
      scene.reset();
      start = nuMs();
      laatst = 0;
      audio.knop();
    }

    function opslaan() {
      if (!lagen) return;
      const off = SPO.art.maakAfbeelding(d, lagen);
      const naam = `pakket-${d.vak.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${d.cijferTekst.replace(',', '-')}.png`;
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
      audio.knop();
    }

    // Delen: een plaatje met je kaart en je naam. Op telefoons opent dit het deelmenu, anders wordt het gedownload.
    function deel() {
      if (!lagen) return;
      const off = SPO.art.maakDeelplaat(d, lagen);
      const naam = `cijfer-${d.vak.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${d.cijferTekst.replace(',', '-')}.png`;
      off.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const bestand = new File([blob], naam, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [bestand] })) {
            await navigator.share({ files: [bestand], title: 'Mijn cijfer', text: 'Mijn cijfer, geopend met Pack Opener (somereveal.nl)' });
            return;
          }
        } catch (e) {
          if (e && e.name === 'AbortError') return; // je sloot het deelmenu zelf
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = naam;
        root.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, 'image/png');
      audio.knop();
    }

    function sluit() {
      if (gesloten) return;
      gesloten = true;
      cancelAnimationFrame(raf);
      removeEventListener('keydown', toets, true);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', zichtbaar);
      document.documentElement.style.overflow = oudeOverflow;
      audio.stopAlles();
      audio.sluit();
      try {
        if (scene) scene.verwijder();
      } catch (e) {
        /* al weg */
      }
      // De motor blijft staan voor het volgende pakket, met alle programma's al gecompileerd.
      if (motor && !motor.gl.isContextLost() && motor.gelukt && !debug) {
        try {
          canvas.remove();
          motor.zetGrootte(64, 64);
          if (warmStaat) ontwarm();
          warmStaat = { canvas, motor, klaar: true, timer: setTimeout(ontwarm, 15 * 60 * 1000) };
        } catch (e) {
          /* dan maar niet */
        }
      } else if (motor) {
        motor.verwijder();
      }
      host.remove();
      roep('opGesloten');
      if (location.protocol === 'chrome-extension:' || /stage\.html$/.test(location.pathname)) {
        if (document.body) {
          const p = document.createElement('p');
          p.style.cssText = 'font:15px system-ui;color:#aab;text-align:center;margin-top:40vh';
          p.textContent = 'Je kunt dit tabblad sluiten.';
          document.body.replaceChildren(p);
        }
        try {
          window.close();
        } catch (e) {
          /* niet toegestaan */
        }
      }
    }
    host.__spoSluit = sluit;

    function zichtbaar() {
      actief = !document.hidden;
      if (!actief) audio.stopAlles();
      else laatst = 0;
    }
    document.addEventListener('visibilitychange', zichtbaar);

    function toets(e) {
      if (gesloten) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        sluit();
        return;
      }
      const opKnop = e.composedPath && e.composedPath().some((n) => n.tagName === 'BUTTON');
      const io = wachtOpKlik && fase === 'reeks' && !opKnop && scene && scene.opening && scene.opening.invoer;
      if (io && io.toets && io.toets(e.key, e)) {
        e.preventDefault();
        e.stopPropagation();
        pauzeSinds = nuMs();
        return;
      }
      if ((e.key === ' ' || e.key === 'Enter') && !opKnop) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (fase === 'intro') begin();
        else if (fase === 'reeks') (wachtOpKlik ? hervat : overslaan)();
      }
    }
    addEventListener('keydown', toets, true);
    addEventListener('resize', resize);

    root.addEventListener('click', (e) => {
      const knop = e.target.closest && e.target.closest('[data-a]');
      if (knop) {
        const a = knop.dataset.a;
        if (a === 'sluit') sluit();
        else if (a === 'start') begin();
        else if (a === 'opnieuw') opnieuw();
        else if (a === 'opslaan') opslaan();
        else if (a === 'deel') deel();
        else if (a === 'geluid') {
          stil = !stil;
          audio.start();
          audio.stil(stil);
          zetGeluidKnop();
        }
        return;
      }
      if (e.target === canvas || e.target === introEl) {
        if (fase === 'intro') begin();
        else if (fase === 'reeks') {
          if (nuMs() < negeerKlikTot) return; // de klik die een sleepbeweging afsluit telt niet als 'verder'
          if (wachtOpKlik) {
            if (!(scene && scene.opening && scene.opening.invoer)) hervat();
          } else if (tHuidig > 0.7) overslaan();
        }
      }
    });
    // Tijdens een pauze van een opening met invoer gaan down/move/up (genormeerd 0…1 over het canvas) naar opInst.invoer.aanwijzer.
    const geefDoor = (soort) => (e) => {
      const io = fase === 'reeks' && wachtOpKlik && scene && scene.opening && scene.opening.invoer;
      if (soort === 'down') {
        if (!io || !io.aanwijzer || e.target !== canvas || aanwijzerId !== -1) return;
        aanwijzerId = e.pointerId;
        negeerKlikTot = nuMs() + 60000; // tot de up/cancel
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (x) {
          /* zonder capture werkt slepen binnen het canvas nog steeds */
        }
      } else if (e.pointerId !== aanwijzerId) return;
      if (soort === 'up' || soort === 'cancel') {
        aanwijzerId = -1;
        negeerKlikTot = nuMs() + 400;
      }
      if (!io || !io.aanwijzer) return;
      const r = canvas.getBoundingClientRect();
      pauzeSinds = nuMs();
      const res = io.aanwijzer(soort, (e.clientX - r.left) / Math.max(1, r.width), (e.clientY - r.top) / Math.max(1, r.height), e);
      if (res) hervat(res);
    };
    root.addEventListener('pointerdown', geefDoor('down'));
    root.addEventListener('pointermove', geefDoor('move'));
    root.addEventListener('pointerup', geefDoor('up'));
    root.addEventListener('pointercancel', geefDoor('cancel'));
    const wijs = (e) => {
      laatsteBeweging = nuMs();
      tiltDoel[0] = klem((e.clientX / Math.max(1, innerWidth) - 0.5) * 2, -1, 1);
      tiltDoel[1] = klem((e.clientY / Math.max(1, innerHeight) - 0.5) * 2, -1, 1);
    };
    root.addEventListener('pointermove', wijs);
    root.addEventListener('pointerleave', () => {
      tiltDoel[0] = 0;
      tiltDoel[1] = 0;
    });

    // Na de onthulling maken we (als de kaart even rustig ligt) een miniatuur voor de galerij.
    function bewaarKaart() {
      if (kaartBewaard || !lagen) return;
      kaartBewaard = true;
      const doe = () => {
        try {
          if (gesloten) return;
          const kaart = SPO.art.maakMiniatuur(d, lagen);
          roep('opKaartKlaar', { vak: d.vak, cijfer: d.g, onderwerp: d.onder, weging: d.weging, opening: d.opening, tier: d.tier, zeldzaam: d.zeldzaam, kaart });
        } catch (e) {
          /* de galerij is een extraatje */
        }
      };
      setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(doe, { timeout: 1500 }) : doe()), 1800);
    }

    // ───── reserve: zonder WebGL tonen we de kaart gewoon, zonder tunnel ─────
    function reserve(lagenIn) {
      fase = 'klaar';
      introEl.classList.add('weg');
      const af = SPO.art.maakAfbeelding(d, lagenIn);
      const img = new Image();
      img.alt = `Je cijfer voor ${d.vak}: ${d.cijferTekst}`;
      img.src = af.toDataURL('image/png');
      reserveEl.appendChild(img);
      reserveEl.classList.add('aan');
      actiesEl.classList.add('aan');
      audio.start();
      audio.onthulling(1);
      roep('opOnthuld');
      bewaarKaart();
      lagen = lagenIn;
    }

    // ───── alles klaarzetten en starten ─────
    (async () => {
      try {
        await SPO.art.laadLettertypes();
        await Promise.race([geluidKlaar, new Promise((r) => setTimeout(r, 1500))]);
        if (gesloten) return;
        log('lettertypes en eerste geluiden klaar');

        // de motor: bij voorkeur eentje die al is opgewarmd
        if (warmStaat && !warmStaat.motor.gl.isContextLost() && warmStaat.motor.gelukt) {
          motor = warmStaat.motor;
          canvas = warmStaat.canvas;
          clearTimeout(warmStaat.timer);
          warmStaat = null;
        } else {
          if (warmStaat) ontwarm();
          canvas = document.createElement('canvas');
          motor = dRuw.geenGL ? null : SPO.Motor.maak(canvas, { debug });
        }
        if (!motor) throw new Error('geen webgl');
        motor.debug = debug;
        kwaliteit = d.laag ? 3 : 0; // lage grafische kwaliteit: meteen de zuinigste stand
        motor.kwaliteit = kwaliteit;
        const opMod = d.opening !== 'pak' ? SPO.openingen[d.opening] : null;
        if (opMod) motor.voegToe(opMod);
        const mythMod = mythModule(d);
        if (mythMod) motor.voegToe(mythMod);

        // de afbeeldingen: uit de voorraad als je er al boven hing, anders nu maken
        const sleutel = sleutelVan(d);
        const belofte = artCache && artCache.sleutel === sleutel ? artCache.belofte : SPO.art.maakAllesAsync(d, pauzeSnel);
        artCache = null;
        let art = await belofte;
        lagen = art.lagen;
        log('afbeeldingen klaar');
        let wacht = 0;
        while (!motor.alleKlaar() && wacht++ < 200) await new Promise((r) => setTimeout(r, 20));
        if (!motor.gelukt) throw new Error('shaders mislukt: ' + motor.fouten.join(' | '));
        if (opMod && !motor.openingGelukt(opMod.naam)) {
          // Deze opening werkt niet op deze videokaart: dan maar het pakje.
          if (debug) console.error('[pakket] opening ' + opMod.naam + ' mislukt, terug naar het pakje: ' + motor.fouten.join(' | '));
          d.opening = 'pak';
          d.seizoen = SPO.seizoenNu(dRuw.seizoen);
          art = await SPO.art.maakAllesAsync(d, pauzeSnel);
          lagen = art.lagen;
          const kt = root.querySelector('.m-knoptekst');
          const vr = root.querySelector('.m-vraag');
          if (kt) kt.textContent = SPO.openingTekst(d).knop;
          if (vr) vr.textContent = SPO.openingTekst(d).tekst;
        }
        if (gesloten) return;
        await volgendBeeld();
        canvas.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          cancelAnimationFrame(raf);
          if (!gesloten && fase !== 'klaar') {
            try {
              reserve(lagen);
            } catch (x) {
              /* dan maar sluiten */
            }
          }
        });
        plek.appendChild(canvas);
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;cursor:pointer;touch-action:none';
        canvas.tabIndex = -1;
        resize();
        await volgendBeeld();
        scene = SPO.maakScene(motor, d, art, { audio, trillen, minderBeweging, onthul: () => {
            roep('opOnthuld');
            bewaarKaart();
          } });
        log('teksturen opgeladen');
        scene.lod = [1, 0.7, 0.45, 0.25][kwaliteit];
        motor.opwarmen();
        resize();
        log('opgewarmd');
        fase = 'intro';
        if (debug) {
          window.__somPackDebug = {
            scene,
            motor,
            d,
            tl: scene.tl,
            opening: d.opening,
            seek(t, tx = 0, ty = 0) {
              fase = 'reeks';
              actief = false;
              introEl.classList.add('weg');
              inv.tilt[0] = tx;
              inv.tilt[1] = ty;
              inv.afspelen = false;
              const draw = () => scene.teken(t, 0.016, inv);
              draw();
              return motor.gl.getError();
            },
            status: () => ({ draws: motor.teken.draws, beelden: beeldTeller, kwaliteit, fouten: motor.fouten, formaat: motor.formaat.naam, breedte: motor.breedte, hoogte: motor.hoogte }),
          };
        }
        raf = requestAnimationFrame(lus);
        log('eerste beeld gevraagd');
        const startKnop = root.querySelector('[data-a="start"]');
        if (d.direct) begin();
        else if (startKnop) startKnop.focus({ preventScroll: true });
      } catch (e) {
        if (debug) console.error('[pakket]', e);
        // Zonder WebGL tonen we de kaart in elk geval.
        try {
          const l = lagen || SPO.art.maakKaartLagen(d);
          reserve(l);
        } catch (x) {
          sluit();
        }
      }
    })();
  }

  function voorlaad(opening, seizoen) {
    SPO.art.laadLettertypes();
    SPO.audio.voorlaad(opening, opening === 'pak' ? SPO.seizoenNu(seizoen) : null);
  }

  window.__somPackRun = run;
  window.__somPackWarm = warm;
  window.__somPackVoorlaad = voorlaad;
  if (window.__somPack) run();
})();
