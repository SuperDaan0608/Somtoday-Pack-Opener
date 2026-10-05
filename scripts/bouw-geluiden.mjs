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
  console.log(`${g.naam.padEnd(9)} ${(statSync(uit).size / 1024).toFixed(0).padStart(4)} kB  (${winst >= 0 ? '+' : ''}${winst.toFixed(1)} dB)`);
}
