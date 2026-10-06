#!/usr/bin/env node
// Maakt de geluiden voor de extensie: geluiden/bron/*.mp3 (ruwe ElevenLabs-opnames)
// -> extension/sounds/*.mp3 (ingekort, opgeschoond en op gelijk niveau gebracht).
//
// Gebruik (vanuit de hoofdmap, ffmpeg moet geïnstalleerd zijn):
//   node scripts/bouw-geluiden.mjs
//
// Elk geluid heeft hieronder een filterketen. Daarna gaat alles naar een vaste piek (`piek`, in dB),
// zodat pack.js het volume van elk geluid los kan regelen.

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BRON = join(ROOT, 'geluiden', 'bron');
const UIT = join(ROOT, 'extension', 'sounds');
mkdirSync(UIT, { recursive: true });

// De opnames van de boem, hartslag en voetstap bestaan helemaal uit tonen onder 120 Hz, en die geven
// laptopspeakers en gewone oordopjes niet weer. Deze keten voegt er harmonischen aan toe (verzadiging)
// plus een hoger gestemde kopie, zodat je ze ook zonder subwoofer hoort.
const bas = ({ drive = 16, omhoog = 3, wegingen = '1 1.1 0.8' }) =>
  '[0:a]aresample=44100,highpass=f=30,asplit=3[d][h][u];' +
  `[h]lowpass=f=190,volume=${drive}dB,asoftclip=type=tanh,highpass=f=100,lowpass=f=1500,volume=-2dB[harm];` +
  `[u]asetrate=${44100 * omhoog},aresample=44100,highpass=f=70,lowpass=f=1800,volume=-3dB[up];` +
  `[d][harm][up]amix=inputs=3:weights='${wegingen}':normalize=0`;

// De nieuwe openingen (kluis, plinko, ster, raket) gebruiken twee kleine hulpjes.
// MARGE: volumedetect meet na een omzetting naar 16 bit die bij 0 dB afkapt. Door de keten eerst 12 dB zachter
//   te maken kan er tijdens het meten niets afkappen (ook niet als meerdere paden bij elkaar worden opgeteld); de
//   winst die daaruit volgt telt die 12 dB er weer bij op, dus de uitvoer komt precies op `piek` uit.
// MONO: een echt gemiddelde van links en rechts. De standaard omzetting van ffmpeg (-ac 1) telt de kanalen met
//   0,707 op en klinkt bij gelijke kanalen 3 dB harder dan gemeten.
const MARGE = ',volume=-12dB';
const MONO = 'pan=mono|c0=0.5*c0+0.5*c1';

// Aanhoudend, diep gebrul (raketmotor). Anders dan bas() geen opgetilde kopie: die zou bij een lang geluid veel te
// vroeg ophouden. Het droge pad gaat door een steile hoogdoorlaat bij 100 Hz (de tonen daaronder hoor je op een laptop
// toch niet, maar ze nemen wel de hele piek in beslag); het laagste stuk wordt daarnaast verzadigd tot harmonischen
// boven 200 Hz die je wél hoort. Zo blijft de opname even zwaar maar komt er ongeveer 3 dB meer hoorbaar geluid uit.
const rommel = ({ drive = 12, harm = 1 }) =>
  '[0:a]aresample=44100,asplit=2[d][h];' +
  '[d]highpass=f=100,highpass=f=100[dry];' +
  `[h]lowpass=f=190,lowpass=f=190,volume=${drive}dB,asoftclip=type=tanh,highpass=f=200,highpass=f=200,lowpass=f=1500,volume=-2dB[harm];` +
  `[dry][harm]amix=inputs=2:weights='1 ${harm}':normalize=0`;

const GELUIDEN = [
  { naam: 'tear', ketting: '[0:a]aresample=44100,highpass=f=300,afade=t=in:d=0.002,afade=t=out:st=0.55:d=0.1', piek: -1 },
  { naam: 'whoosh', ketting: '[0:a]aresample=44100,highpass=f=120,afade=t=in:d=0.04,afade=t=out:st=1.05:d=0.4', piek: -1.5 },
  {
    // Het begin van de opname is stil; dat knippen we weg zodat de opbouw direct begint.
    naam: 'riser',
    ketting: '[0:a]aresample=44100,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,highpass=f=150,afade=t=in:d=0.12',
    piek: -1.5,
  },
  { naam: 'boem', ketting: `${bas({ drive: 22, omhoog: 5, wegingen: '0.3 1.5 1.6' })},afade=t=in:d=0.002,afade=t=out:st=2.0:d=0.48`, piek: -2.5 },
  { naam: 'hartslag', ketting: `${bas({ drive: 26, omhoog: 3.5, wegingen: '0.25 1.4 1.6' })},afade=t=in:d=0.003,afade=t=out:st=0.7:d=0.3`, piek: -3 },
  { naam: 'stap', ketting: `${bas({ drive: 24, omhoog: 4, wegingen: '0.25 1.4 1.6' })},afade=t=in:d=0.002,afade=t=out:st=0.7:d=0.3`, piek: -3 },
  { naam: 'menigte', ketting: '[0:a]aresample=44100,highpass=f=90,afade=t=in:d=0.06,afade=t=out:st=5.2:d=0.78', piek: -2 },
  { naam: 'gejuich', ketting: '[0:a]aresample=44100,highpass=f=90,afade=t=in:d=0.02,afade=t=out:st=3.3:d=0.65', piek: -1.5 },
  { naam: 'tik', ketting: '[0:a]aresample=44100,atrim=0:0.085,highpass=f=500,afade=t=in:d=0.001,afade=t=out:st=0.05:d=0.035', piek: -1, kanalen: 1 },
  { naam: 'sluiter', ketting: '[0:a]aresample=44100,atrim=0:0.28,highpass=f=300,afade=t=in:d=0.001,afade=t=out:st=0.2:d=0.08', piek: -1, kanalen: 1 },
  { naam: 'vuurwerk', ketting: '[0:a]aresample=44100,highpass=f=80,afade=t=in:d=0.002,afade=t=out:st=1.4:d=0.6', piek: -3 },
  { naam: 'brons', ketting: '[0:a]aresample=44100,highpass=f=100,afade=t=in:d=0.01,afade=t=out:st=2.6:d=0.4', piek: -3 },
  { naam: 'zilver', ketting: '[0:a]aresample=44100,highpass=f=100,afade=t=in:d=0.005,afade=t=out:st=1.5:d=0.5', piek: -3 },
  { naam: 'goud', ketting: '[0:a]aresample=44100,highpass=f=100,afade=t=in:d=0.01,afade=t=out:st=2.4:d=0.6', piek: -3 },
  { naam: 'speciaal', ketting: '[0:a]aresample=44100,highpass=f=70,afade=t=in:d=0.004,afade=t=out:st=3.2:d=0.8', piek: -3 },
  { naam: 'icoon', ketting: '[0:a]aresample=44100,highpass=f=70,afade=t=in:d=0.01,afade=t=out:st=4.0:d=1.0', piek: -3 },
  { naam: 'klik', ketting: '[0:a]aresample=44100,atrim=0:0.2,highpass=f=200,afade=t=in:d=0.001,afade=t=out:st=0.12:d=0.08', piek: -1, kanalen: 1 },

  // ---- Nieuwe openingen ----
  // Kluis kraken
  {
    // Het tikje zit helemaal in het begin van de opname (0,05 tot 0,09 s) en wordt tientallen keren afgespeeld: alleen dat stukje.
    naam: 'kluis-klik',
    ketting: `[0:a]aresample=44100,${MONO},atrim=start=0.046:end=0.166,asetpts=PTS-STARTPTS,highpass=f=400,afade=t=in:d=0.001,afade=t=out:st=0.07:d=0.05${MARGE}`,
    piek: -1,
    kanalen: 1,
  },
  { naam: 'kluis-slot', ketting: `[0:a]aresample=44100,highpass=f=40,atrim=0:0.95,afade=t=in:d=0.002,afade=t=out:st=0.7:d=0.25${MARGE}`, piek: -2 },
  { naam: 'kluis-wiel', ketting: `[0:a]aresample=44100,highpass=f=40,atrim=0:2.3,afade=t=in:d=0.004,afade=t=out:st=1.7:d=0.6${MARGE}`, piek: -2 },
  { naam: 'kluis-deur', ketting: `[0:a]aresample=44100,highpass=f=40,atrim=0:3.5,afade=t=in:d=0.01,afade=t=out:st=2.5:d=1.0${MARGE}`, piek: -3 },

  // Plinko
  {
    // De eerste opname was bijna stil (piek -35 dB) en bestond uit drie doffe bonzen; deze tweede heeft één scherpe tok (bij 0,03 s).
    naam: 'plinko-tok',
    ketting: `[0:a]aresample=44100,${MONO},atrim=start=0.022:end=0.22,asetpts=PTS-STARTPTS,highpass=f=500,afade=t=in:d=0.001,afade=t=out:st=0.11:d=0.088${MARGE}`,
    piek: -1,
    kanalen: 1,
  },
  {
    // De opname begint met een zwakke bons en 0,2 s stilte; de klak waar het om gaat begint bij 0,28 s en na 0,8 s is het stil.
    naam: 'plinko-vak',
    ketting: `[0:a]aresample=44100,atrim=start=0.268:end=0.86,asetpts=PTS-STARTPTS,highpass=f=100,afade=t=in:d=0.003,afade=t=out:st=0.44:d=0.15${MARGE}`,
    piek: -2,
  },
  { naam: 'plinko-bel', ketting: `[0:a]aresample=44100,highpass=f=150,atrim=0:1.9,afade=t=in:d=0.002,afade=t=out:st=1.3:d=0.6${MARGE}`, piek: -2 },

  // Wensster
  { naam: 'ster-vlucht', ketting: `[0:a]aresample=44100,highpass=f=150,atrim=0:3.3,afade=t=in:d=0.02,afade=t=out:st=2.5:d=0.8${MARGE}`, piek: -2 },
  { naam: 'ster-inslag', ketting: `[0:a]aresample=44100,highpass=f=40,atrim=0:3.2,afade=t=in:d=0.003,afade=t=out:st=2.4:d=0.8${MARGE}`, piek: -3 },
  {
    // Een rustig bed: zacht erin en eruit. De opname valt na 5,4 s abrupt stil, daar zijn we dan al uit.
    naam: 'ster-nacht',
    ketting: `[0:a]aresample=44100,highpass=f=100,atrim=0:5.5,afade=t=in:d=0.8,afade=t=out:st=4.0:d=1.5${MARGE}`,
    piek: -3,
  },

  // Raket
  {
    // De opname bevat drie pieptonen achter elkaar; de derde (de langste, 0,25 tot 0,36 s) knippen we eruit als één piep.
    naam: 'raket-piep',
    ketting: `[0:a]aresample=44100,${MONO},atrim=start=0.243:end=0.382,asetpts=PTS-STARTPTS,highpass=f=300,afade=t=in:d=0.002,afade=t=out:st=0.12:d=0.019${MARGE}`,
    piek: -1,
    kanalen: 1,
  },
  { naam: 'raket-start', ketting: `${rommel({ drive: 14 })},atrim=0:3.9,afade=t=in:d=0.02,afade=t=out:st=3.2:d=0.7${MARGE}`, piek: -3 },
  {
    // De app herhaalt dit geluid en laat het in elkaar overlopen: daarom maar een korte in- en uitfade, en precies 5 s lang.
    naam: 'raket-motor',
    ketting: `${rommel({ drive: 16 })},atrim=0:5.0,afade=t=in:d=0.15,afade=t=out:st=4.6:d=0.4${MARGE}`,
    piek: -3,
  },
  // Het sissen na de klap is erg zacht; de hoogdoorlaat haalt ook het brommen onder 100 Hz weg dat de hele opname doorloopt.
  { naam: 'raket-trap', ketting: `[0:a]aresample=44100,highpass=f=150,atrim=0:0.8,afade=t=in:d=0.002,afade=t=out:st=0.4:d=0.4${MARGE}`, piek: -2 },
  { naam: 'raket-knal', ketting: `[0:a]aresample=44100,highpass=f=45,atrim=0:1.4,afade=t=in:d=0.002,afade=t=out:st=1.0:d=0.4${MARGE}`, piek: -3 },
  // Schietkraam
  // De knal zit in de eerste 0,23 s; daarna volgt een stilte en een tweede, zwakkere plof bij 0,56 s die we eraf laten.
  { naam: 'schiet-knal', ketting: `[0:a]aresample=44100,highpass=f=80,atrim=0:0.5,afade=t=in:d=0.001,afade=t=out:st=0.32:d=0.18${MARGE}`, piek: -2 },
  // Na 0,43 s is het bijna stil (alleen nog zacht gerinkel).
  { naam: 'schiet-scherf', ketting: `[0:a]aresample=44100,highpass=f=150,atrim=0:0.9,afade=t=in:d=0.002,afade=t=out:st=0.55:d=0.35${MARGE}`, piek: -2 },
  // De opname begint met 0,07 s stilte; het ratelen duurt tot 0,5 s.
  { naam: 'schiet-spin', ketting: `[0:a]aresample=44100,highpass=f=200,atrim=start=0.055:end=0.65,asetpts=PTS-STARTPTS,afade=t=in:d=0.002,afade=t=out:st=0.45:d=0.14${MARGE}`, piek: -2 },
  { naam: 'schiet-laatste', ketting: `[0:a]aresample=44100,highpass=f=150,atrim=0:1.3,afade=t=in:d=0.003,afade=t=out:st=0.95:d=0.35${MARGE}`, piek: -3 },

  // Dansje
  // 120 BPM (kicks op 0,5 s, 1,0 s, ...); wordt één keer afgespeeld onder een animatie van ongeveer 12 s, dus alleen een korte in- en uitfade.
  { naam: 'dans-beat', ketting: `[0:a]aresample=44100,highpass=f=40,atrim=0:12,afade=t=in:d=0.05,afade=t=out:st=11.4:d=0.6${MARGE}`, piek: -2 },
  // Het wicka-wicka duurt 0,35 s; daarna is de opname stil.
  { naam: 'dans-scratch', ketting: `[0:a]aresample=44100,highpass=f=120,atrim=0:0.42,afade=t=in:d=0.001,afade=t=out:st=0.38:d=0.04${MARGE}`, piek: -2 },
  // Na 1,26 s is het stil.
  { naam: 'dans-dab', ketting: `[0:a]aresample=44100,highpass=f=60,atrim=0:1.4,afade=t=in:d=0.002,afade=t=out:st=1.05:d=0.35${MARGE}`, piek: -3 },
];

// ffmpeg schrijft zijn uitvoer (ook de meting) naar stderr.
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg faalde:\n${r.stderr}`);
  return r.stderr;
}

for (const g of GELUIDEN) {
  const bron = join(BRON, `${g.naam}.mp3`);
  if (!existsSync(bron)) throw new Error(`Ontbreekt: ${bron}`);

  // Ronde 1: wat is de hoogste piek na de filterketen?
  const meting = ffmpeg(['-i', bron, '-filter_complex', `${g.ketting},volumedetect[m]`, '-map', '[m]', '-f', 'null', '-']);
  const m = meting.match(/max_volume:\s*(-?[\d.]+) dB/);
  if (!m) throw new Error(`Kon de piek van ${g.naam} niet meten:\n${meting}`);
  const winst = g.piek - parseFloat(m[1]);

  // Ronde 2: versterken tot de doelpiek, begrenzen en als mp3 opslaan.
  const uit = join(UIT, `${g.naam}.mp3`);
  ffmpeg([
    '-i', bron,
    '-filter_complex', `${g.ketting},volume=${winst.toFixed(2)}dB,alimiter=limit=0.95:level=disabled[o]`,
    '-map', '[o]',
    '-ac', String(g.kanalen || 2),
    '-ar', '44100',
    '-c:a', 'libmp3lame',
    '-q:a', '2',
    uit,
  ]);
  console.log(`${g.naam.padEnd(12)} ${(statSync(uit).size / 1024).toFixed(0).padStart(4)} kB  (${winst >= 0 ? '+' : ''}${winst.toFixed(1)} dB)`);
}
