#!/usr/bin/env python3
# Maakt de geluiden van de STRAFSCHOP (extension/motor/strafschop.js), volledig procedureel (numpy + ffmpeg):
#   strafschop-trap        de wreef tegen de bal: een doffe, korte dreun met een leren klets (~0,7 s)
#   strafschop-net         de bal in het net: een zachte plof en het ruisen/zwiepen van touw (~1,4 s)
#   strafschop-paal        bal tegen aluminium: een metalen TONK met lang nazingen (~2,2 s)
#   strafschop-fluit       het fluitje van de scheidsrechter: een triller met erwtje (~0,9 s)
#   strafschop-zucht       een stadion dat 'ooohh' zucht (dalende klinkers van duizenden stemmen) (~2,8 s)
#   strafschop-zwel        het publiek dat opzwelt van spanning naar een brul (~3,5 s)
#   strafschop-duik        de keeper die neerkomt op nat gras (~0,8 s)
#   strafschop-handschoen  de bal die op de handschoenen klapt (~0,5 s)
#
# Gebruik (vanuit de hoofdmap):
#   python3 scripts/bouw-strafschop.py            # alles
#   python3 scripts/bouw-strafschop.py paal fluit # alleen de genoemde
# Gebruikt de bouwstenen van scripts/bouw-halloween.py en bouw-ladder.py; vaste seeds, dus reproduceerbaar.

import importlib.util
import sys
from pathlib import Path

import numpy as np

_hier = Path(__file__).resolve().parent


def _laad(naam, bestand):
    spec = importlib.util.spec_from_file_location(naam, _hier / bestand)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


H = _laad('bouw_halloween', 'bouw-halloween.py')
L = _laad('bouw_ladder', 'bouw-ladder.py')

SR = H.SR
UIT = H.UIT
tijdas, smoothstep, kontour = H.tijdas, H.smoothstep, H.kontour
lp, hp, bp, piek = H.lp, H.hp, H.bp, H.piek
fft_filter, galm = H.fft_filter, H.galm
stereo_ruis, trage_ruis, aanzet_uitsterf, zaagtand = H.stereo_ruis, H.trage_ruis, H.aanzet_uitsterf, H.zaagtand
paneer = L.paneer


def trap():
    """Leer tegen leer: een klets (kort, middenhoog) bovenop een doffe dreun van ~70 Hz die snel wegsterft."""
    rng = np.random.default_rng(7101)
    dur = 0.7
    n = int(dur * SR)
    t = tijdas(n)
    klets = fft_filter(stereo_ruis(rng, n, 0.8), bp(500, 4200, 2), piek(1400, 0.6, 6.0)) * np.exp(-t / 0.018)
    f = 62 + 70 * np.exp(-t / 0.03)
    dreun = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.11) * smoothstep(t / 0.002)
    tok = np.sin(2 * np.pi * 240 * t) * np.exp(-t / 0.03)
    mono = 1.0 * dreun + 0.35 * tok
    uit = np.stack([mono, mono]) + klets * 2.2
    uit = galm(uit, rng, rt60=1.0, nat=0.18, voorvertraging=0.03, demping_hz=4000)[:, :n]
    return aanzet_uitsterf(uit, 0.0005, 0.25)


def net():
    """Een plof van de bal in het touw en daarna het zwiepen en ruisen van het net dat uitdeint en terugveert."""
    rng = np.random.default_rng(7202)
    dur = 1.4
    n = int(dur * SR)
    t = tijdas(n)
    plof = np.sin(2 * np.pi * np.cumsum(90 + 60 * np.exp(-t / 0.04)) / SR) * np.exp(-t / 0.09) * smoothstep(t / 0.003)
    env = kontour(t, [(0, 0), (0.02, 1.0), (0.25, 0.55), (0.45, 0.8), (0.75, 0.3), (1.4, 0)])
    zwiep = fft_filter(stereo_ruis(rng, n, 0.4), bp(700, 6500, 2), piek(2500, 0.8, 5.0)) * env
    # touwtjes: korte tikjes van knopen die tegen elkaar slaan
    tikjes = np.zeros((2, n))
    for _ in range(26):
        t0 = rng.uniform(0.01, 0.8)
        d = np.maximum(t - t0, 0)
        tikjes[rng.integers(0, 2)] += (t >= t0) * np.exp(-d / 0.004) * np.sin(2 * np.pi * rng.uniform(1800, 4200) * d) * rng.uniform(0.2, 0.6) * np.exp(-t0 / 0.5)
    uit = np.stack([plof, plof]) * 0.9 + zwiep * 0.5 + tikjes * 0.5
    uit = galm(uit, rng, rt60=1.4, nat=0.25, voorvertraging=0.025, demping_hz=6000)[:, :n]
    return aanzet_uitsterf(uit, 0.001, 0.4)


def paal():
    """Een holle aluminium paal: een harde tik, een 'tonk' rond 300 Hz en onharmonische boventonen die lang nazingen."""
    rng = np.random.default_rng(7303)
    dur = 2.2
    n = int(dur * SR)
    t = tijdas(n)
    tik = fft_filter(stereo_ruis(rng, n, 0.7), hp(1500, 2), piek(3600, 0.5, 6.0)) * np.exp(-t / 0.008)
    ring = np.zeros(n)
    for f, a, d in [(312.0, 1.0, 0.55), (731.0, 0.6, 0.45), (1289.0, 0.42, 0.38), (1987.0, 0.28, 0.3), (2853.0, 0.18, 0.22), (4110.0, 0.1, 0.12)]:
        ring += a * np.sin(2 * np.pi * f * t * (1 + 0.0008 * np.sin(2 * np.pi * 6 * t))) * np.exp(-t / d)
    ring *= smoothstep(t / 0.0015)
    tonk = np.sin(2 * np.pi * np.cumsum(150 + 80 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.08)
    mono = 0.7 * ring / np.max(np.abs(ring)) + 0.55 * tonk
    uit = np.stack([mono, np.roll(mono, 30)]) + tik * 0.9
    uit = galm(uit, rng, rt60=2.4, nat=0.35, voorvertraging=0.03, demping_hz=6000)[:, :n]
    return aanzet_uitsterf(uit, 0.0005, 0.6)


def fluit():
    """Een scheidsrechtersfluit: een hoge toon (~2,9 kHz) met de snelle triller van het erwtje, kort-lang."""
    rng = np.random.default_rng(7404)
    dur = 0.95
    n = int(dur * SR)
    t = tijdas(n)
    env = kontour(t, [(0, 0), (0.02, 1), (0.14, 1), (0.17, 0.15), (0.22, 0.15), (0.25, 1), (0.78, 0.9), (0.86, 0)])
    triller = 1 + 0.045 * np.sin(2 * np.pi * 34 * t) + 0.01 * trage_ruis(rng, n, 30)
    f = 2900 * triller
    fase = 2 * np.pi * np.cumsum(f) / SR
    toon = np.sin(fase) + 0.18 * np.sin(2 * fase) + 0.06 * np.sin(3 * fase)
    am = 1 - 0.35 * (0.5 + 0.5 * np.sin(2 * np.pi * 34 * t))
    lucht = fft_filter(rng.standard_normal(n), bp(2000, 7000, 2)) * 0.15
    mono = (toon * am + lucht) * env
    uit = np.stack([mono, mono])
    uit = galm(uit, rng, rt60=1.8, nat=0.45, voorvertraging=0.04, demping_hz=5000)[:, :n]
    return aanzet_uitsterf(uit, 0.002, 0.08)


def publiek(rng, n, t, toonhoogte, klinker, env, stemmen=34):
    """Een menigte die één klinker zingt: veel stemmen (zaagtand met eigen toonhoogte en vibrato) door formanten,
    plus ruis voor het geroezemoes. toonhoogte: (n,)-reeks met de gemiddelde grondtoon in Hz."""
    som = np.zeros((2, n))
    for _ in range(stemmen):
        f = toonhoogte * rng.uniform(0.7, 1.45) * (1 + 0.012 * trage_ruis(rng, n, 4))
        stem = zaagtand(np.maximum(f, 60), hoogste=5000.0)
        som += paneer(stem * (0.6 + 0.4 * rng.random()), rng.uniform(-1, 1))
    f1, f2 = klinker
    som = fft_filter(som, hp(120, 2), lp(4500, 2), piek(f1, 0.35, 12.0), piek(f2, 0.3, 8.0))
    som /= np.std(som)
    ruis = fft_filter(stereo_ruis(rng, n, 0.2), bp(300, 5000, 2), piek(f1, 0.5, 6.0))
    ruis /= np.std(ruis)
    return (som + 0.6 * ruis) * env


def zucht():
    """'Ooohh': een stadion dat de adem inhoudt en zucht; de toon zakt en het geluid ebt weg."""
    rng = np.random.default_rng(7505)
    dur = 2.8
    n = int(dur * SR)
    t = tijdas(n)
    toon = kontour(t, [(0, 260), (0.35, 300), (2.8, 160)])
    env = kontour(t, [(0, 0), (0.18, 1.0), (0.7, 0.85), (2.0, 0.3), (2.8, 0)])
    uit = publiek(rng, n, t, toon, (520, 900), env)
    uit = galm(uit, rng, rt60=2.6, nat=0.4, voorvertraging=0.05, demping_hz=5000)[:, :n]
    return aanzet_uitsterf(uit, 0.02, 0.5)


def zwel():
    """Spanning die opzwelt: geroezemoes dat aanzwelt, hoger wordt en overgaat in een brul ('aaah')."""
    rng = np.random.default_rng(7606)
    dur = 3.5
    n = int(dur * SR)
    t = tijdas(n)
    toon = kontour(t, [(0, 180), (2.6, 300), (3.5, 330)])
    env = kontour(t, [(0, 0), (0.6, 0.25), (2.4, 0.75), (2.9, 1.0), (3.5, 0.0)])
    uit = publiek(rng, n, t, toon, (750, 1200), env)
    uit = galm(uit, rng, rt60=2.4, nat=0.35, voorvertraging=0.05, demping_hz=5500)[:, :n]
    return aanzet_uitsterf(uit, 0.3, 0.4)


def duik():
    """De keeper komt neer: een zware plof van een lichaam op nat gras, met wat gespetter en geschuif."""
    rng = np.random.default_rng(7707)
    dur = 0.8
    n = int(dur * SR)
    t = tijdas(n)
    plof = np.sin(2 * np.pi * np.cumsum(55 + 50 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.13) * smoothstep(t / 0.004)
    schuif = fft_filter(stereo_ruis(rng, n, 0.5), bp(400, 5000, 2)) * kontour(t, [(0, 0), (0.02, 0.6), (0.35, 0.3), (0.7, 0)])
    spat = np.zeros((2, n))
    for _ in range(18):
        t0 = rng.uniform(0.0, 0.25)
        d = np.maximum(t - t0, 0)
        spat[rng.integers(0, 2)] += (t >= t0) * np.exp(-d / 0.006) * fft_filter(rng.standard_normal(n), bp(2500, 8000, 1)) * 0.3
    uit = np.stack([plof, plof]) + schuif * 0.35 + spat * 0.4
    uit = galm(uit, rng, rt60=0.9, nat=0.15, voorvertraging=0.02, demping_hz=4000)[:, :n]
    return aanzet_uitsterf(uit, 0.001, 0.25)


def handschoen():
    """De bal klapt op de handschoenen: een droge, hoge klap van latex met een kleine dreun."""
    rng = np.random.default_rng(7808)
    dur = 0.5
    n = int(dur * SR)
    t = tijdas(n)
    klap = fft_filter(stereo_ruis(rng, n, 0.85), bp(900, 7000, 2), piek(2200, 0.6, 7.0)) * np.exp(-t / 0.012)
    dreun = np.sin(2 * np.pi * np.cumsum(110 + 90 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.06)
    uit = klap * 2.0 + np.stack([dreun, dreun]) * 0.8
    uit = galm(uit, rng, rt60=1.0, nat=0.2, voorvertraging=0.025, demping_hz=5000)[:, :n]
    return aanzet_uitsterf(uit, 0.0005, 0.2)


GELUIDEN = {
    'strafschop-trap': trap,
    'strafschop-net': net,
    'strafschop-paal': paal,
    'strafschop-fluit': fluit,
    'strafschop-zucht': zucht,
    'strafschop-zwel': zwel,
    'strafschop-duik': duik,
    'strafschop-handschoen': handschoen,
}


def main(argv):
    if not argv:
        gekozen = list(GELUIDEN)
    else:
        gekozen = []
        for a in argv:
            m = [k for k in GELUIDEN if k == a or k.split('-', 1)[1] == a]
            if not m:
                sys.exit(f'Onbekend geluid: {a}. Kies uit: {", ".join(GELUIDEN)}.')
            gekozen += m
    UIT.mkdir(parents=True, exist_ok=True)
    for naam in gekozen:
        stereo = GELUIDEN[naam]()
        pad = UIT / (naam + '.mp3')
        piek_db = H.afronden(naam, stereo, pad)
        print(f'{naam}.mp3: {stereo.shape[1] / SR:.2f} s, piek {piek_db:.2f} dBFS, {pad.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
