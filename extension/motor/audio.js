/*
 * Somtoday Pack Opener — audio.js
 * Alle geluiden zijn echte opnames (gemaakt met ElevenLabs, zie geluiden/README.md) die hier met
 * Web Audio worden afgespeeld. Ze staan als mp3 in sounds/ en zijn gelijkgetrokken op een piek van
 * ongeveer -1 dB; NIVEAU zet elk geluid op het goede volume ten opzichte van de rest.
 *
 * Tegen haperingen: de bestanden worden al opgehaald zodra er een afgedekt cijfer op de pagina staat
 * (voorlaad), en pas gedecodeerd als je op een cijfer klikt. Zo hoeft er bij de klik niets meer van
 * het netwerk of de schijf te komen en start de animatie meteen.
 */
(function () {
  'use strict';
  const SPO = (window.__SPO = window.__SPO || {});
  const { klem, rnd } = SPO;

  const VOLUME = 0.8; // hoofdvolume; laat wat ruimte vóór de compressor
  const GELUIDEN = ['whoosh', 'riser', 'tear', 'boem', 'hartslag', 'stap', 'menigte', 'gejuich', 'tik', 'sluiter', 'vuurwerk', 'brons', 'zilver', 'goud', 'speciaal', 'icoon', 'klik'];
  const EERST = ['whoosh', 'riser', 'tear', 'boem', 'klik']; // nodig in de eerste seconden
  const NIVEAU = {
    tear: -3, whoosh: -7, riser: -8, boem: 0, hartslag: -4, stap: -4, menigte: -13, gejuich: -8,
    tik: -14, sluiter: -12, vuurwerk: -7, brons: -4, zilver: -5, goud: -4, speciaal: -4, icoon: -4, klik: -14,
  };
  const TIER_GELUID = ['brons', 'zilver', 'goud', 'speciaal', 'icoon'];

  // Geluiden die alleen bij één opening horen: die worden pas opgehaald en gedecodeerd als die opening aan de beurt is.
  const GROEPEN = {
    kluis: ['kluis-klik', 'kluis-slot', 'kluis-wiel', 'kluis-deur'],
    plinko: ['plinko-tok', 'plinko-vak', 'plinko-bel'],
    ster: ['ster-vlucht', 'ster-inslag', 'ster-nacht'],
    raket: ['raket-piep', 'raket-start', 'raket-motor', 'raket-trap', 'raket-knal'],
    dans: ['dans-beat', 'dans-scratch', 'dans-dab'],
    schiet: ['schiet-knal', 'schiet-scherf', 'schiet-spin', 'schiet-laatste'],
  };
  // Het volume van de nieuwe opnames is afgestemd op de oude (gemeten in het gedeelte boven 200 Hz, dat laptopspeakers wel weergeven).
  Object.assign(NIVEAU, {
    'kluis-klik': -11, 'kluis-slot': -6, 'kluis-wiel': -5, 'kluis-deur': -5,
    'plinko-tok': -13, 'plinko-vak': -5, 'plinko-bel': -2,
    'ster-vlucht': -5, 'ster-inslag': -1, 'ster-nacht': -12,
    'raket-piep': -12, 'raket-start': -2, 'raket-motor': -6, 'raket-trap': -5, 'raket-knal': -1,
    'dans-beat': -8, 'dans-scratch': -6, 'dans-dab': -4,
    'schiet-knal': -6, 'schiet-scherf': -8, 'schiet-spin': -9, 'schiet-laatste': -5,
  });


  const dB = (x) => Math.pow(10, x / 20);
  const basis = window.chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('sounds/') : 'sounds/';

  let AC = null;
  let master = null;
  let galm = null;
  const ruw = {}; // naam → belofte van een ArrayBuffer (of null)
  const gedecodeerd = {}; // naam → belofte
  const buffers = {};
  const actief = new Set();

  function haal(naam) {
    if (!ruw[naam]) {
      ruw[naam] = fetch(basis + naam + '.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
    }
    return ruw[naam];
  }

  // Haalt de bestanden op zonder iets af te spelen of een AudioContext te maken (dat mag pas na een klik).
  // opening: ook de geluiden van die opening (zie GROEPEN).
  function voorlaad(opening) {
    for (const naam of GELUIDEN) haal(naam);
    for (const naam of GROEPEN[opening] || []) haal(naam);
  }

  function init(stil) {
    if (!AC) {
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
    }
    master.gain.cancelScheduledValues(0);
    master.gain.value = stil ? 0 : VOLUME;
    return AC;
  }

  function decodeer(naam) {
    if (!gedecodeerd[naam]) {
      gedecodeerd[naam] = haal(naam)
        .then((ab) => (ab ? AC.decodeAudioData(ab) : null))
        .then((b) => {
          if (b) buffers[naam] = b;
        })
        .catch(() => {
          /* zonder dit geluid gaat de animatie gewoon door */
        });
    }
    return gedecodeerd[naam];
  }

  // Speelt één opname af. offset en duur in seconden van de opname; rate verandert snelheid en toonhoogte.
  // delay: laat het geluid pas over zoveel seconden beginnen. Geeft een handvat terug: h.stop(fade) laat het wegsterven.
  function speel(naam, { gain = 1, rate = 1, offset = 0, duur, fadeIn = 0.004, fadeOut = 0.06, galmen = 0, pan = 0, delay = 0 } = {}) {
    const buf = buffers[naam];
    if (!AC || !master || !buf) return null;
    const nu = AC.currentTime + Math.max(0, delay);
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
    return {
      stop(fade = 0.08) {
        const t = AC.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0, t, Math.max(0.005, fade / 3));
      },
    };
  }

  // Maakt de geluiden voor één pakket. tier: 0 (brons) tot 4 (icoon).
  function maak({ tier, stil, opening }) {
    init(stil);
    const eigen = GROEPEN[opening] || [];
    let eerste = Promise.resolve();
    let alles = Promise.resolve();
    return {
      // Decodeert alles. De belofte gaat open zodra de eerste geluiden klaar zijn; de rest volgt.
      laad() {
        if (!AC) return Promise.resolve();
        eerste = Promise.all(EERST.concat(eigen).map(decodeer));
        alles = Promise.all(GELUIDEN.concat(eigen).map(decodeer));
        return eerste;
      },
      get klaar() {
        return alles;
      },
      start() {
        init(stil);
        if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
      },
      stil(aan) {
        stil = aan;
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
      // De context blijft bestaan (met alle opnames erin), maar staat stil tot het volgende pakket.
      sluit() {
        try {
          if (AC && AC.state === 'running') AC.suspend().catch(() => {});
        } catch (e) {
          /* al dicht */
        }
      },
      whoosh(vol = 1) {
        speel('whoosh', { gain: vol, rate: rnd(0.95, 1.05), fadeOut: 0.3 });
      },
      // Een korter, hoger zwiepje voor de plaatjes en de kaart.
      zwiep(vol = 1, rate = 1.3) {
        speel('whoosh', { gain: vol, rate: rate * rnd(0.97, 1.04), duur: 0.55, fadeOut: 0.3 });
      },
      // De opbouw moet precies op het scheurmoment pieken: we spelen het laatste stuk van de opname.
      riser(dur, vol = 1) {
        const b = buffers.riser;
        if (!b) return;
        let rate = 1;
        let offset = Math.max(0, b.duration - dur);
        if (dur > b.duration) {
          rate = klem(b.duration / dur, 0.75, 1);
          offset = Math.max(0, b.duration - dur * rate);
        }
        speel('riser', { gain: vol, rate, offset, fadeIn: 0.15, fadeOut: 0.02 });
      },
      scheur(vol = 1) {
        speel('tear', { gain: vol, galmen: 0.15 });
      },
      boem(vol = 1, rate = 1) {
        speel('boem', { gain: vol, rate, galmen: 0.3 });
      },
      hartslag(vol = 1) {
        speel('hartslag', { gain: vol, fadeOut: 0.12 });
      },
      publiek(dur, vol = 1) {
        const b = buffers.menigte;
        if (!b) return;
        const rate = dur > b.duration - 0.2 ? klem((b.duration - 0.2) / dur, 0.8, 1) : 1;
        speel('menigte', { gain: vol, rate, duur: dur, fadeIn: 0.5, fadeOut: 0.8, galmen: 0.1 });
      },
      gejuich(dur, vol = 1) {
        speel('gejuich', { gain: vol, duur: dur, fadeIn: 0.05, fadeOut: 0.8, galmen: 0.15 });
      },
      // Een voetstap in de tunnel.
      stap(vol = 1, pan = 0) {
        speel('stap', { gain: vol, pan: pan || rnd(-0.2, 0.2), rate: rnd(0.94, 1.06), galmen: 0.35 });
      },
      // voortgang: 0 (begin van het optellen) tot 1 (het eindcijfer): de tikken worden steeds hoger
      tik(voortgang) {
        speel('tik', { rate: 0.85 + 0.75 * klem(voortgang, 0, 1) });
      },
      sluiter() {
        speel('sluiter', { gain: rnd(0.7, 1), rate: rnd(0.92, 1.08), pan: rnd(-0.7, 0.7) });
      },
      vuurwerk() {
        speel('vuurwerk', { gain: rnd(0.7, 1), rate: rnd(0.9, 1.12), pan: rnd(-0.8, 0.8), galmen: 0.4 });
      },
      onthulling(vol = 1) {
        speel(TIER_GELUID[tier], { gain: vol, galmen: 0.2 });
      },
      knop() {
        speel('klik');
      },
      // Voor de openingen: elk geluid bij naam, met alle opties van speel().
      speel,
      get tier() {
        return tier;
      },
    };
  }

  SPO.audio = { maak, voorlaad, GELUIDEN, GROEPEN, NIVEAU };
})();
