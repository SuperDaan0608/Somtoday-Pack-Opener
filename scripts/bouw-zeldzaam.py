#!/usr/bin/env python3
# Maakt de drie geluiden van de ZELDZAAM-reeks (de lange onthulling van een zeldzame kaart), volledig procedureel:
#   extension/sounds/zeldzaam-tease.mp3   de spanning voor de onthulling: donkere drone, hartslag, digitale stoten (~2,6 s)
#   extension/sounds/zeldzaam-koor.mp3    koorachtig 'aah' dat omhoog klimt (~4,6 s)
#   extension/sounds/zeldzaam-boem.mp3    diepe bas-boem met kraak en rommelende staart (~3,2 s)
#
# Gebruik (vanuit de hoofdmap; Python 3 + numpy 2.x en ffmpeg met libmp3lame):
#   python3 scripts/bouw-zeldzaam.py            # alle drie
#   python3 scripts/bouw-zeldzaam.py koor       # alleen de genoemde (tease, koor, boem)
# Gebruikt de bouwstenen van scripts/bouw-halloween.py; vaste seeds, dus reproduceerbaar.

import importlib.util
import sys
from pathlib import Path

import numpy as np

_hier = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('bouw_halloween', _hier / 'bouw-halloween.py')
H = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(H)

SR = H.SR
UIT = H.UIT
tijdas, smoothstep, kontour = H.tijdas, H.smoothstep, H.kontour
lp, hp, bp, piek = H.lp, H.hp, H.bp, H.piek
fft_filter, galm = H.fft_filter, H.galm
stereo_ruis, trage_ruis, aanzet_uitsterf, zaagtand = H.stereo_ruis, H.trage_ruis, H.aanzet_uitsterf, H.zaagtand


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tease():
    """Spanning: een donkere zaagtand-drone (55 Hz) die langzaam omhoog schuift en steeds heftiger trilt, een
    hartslag (dof, twee klappen per slag) die versnelt, korte digitale stoten (bitgecrushte ruis die stottert), een
    omgekeerde-bekken-zwelling, en vlak voor het einde een snelle stijgende veeg die abrupt afbreekt (de flits)."""
    rng = np.random.default_rng(3061)
    dur = 2.6
    n = int(round(dur * SR))
    t = tijdas(n)

    # drone
    f = kontour(t, [(0.0, 52.0), (2.2, 70.0), (2.6, 70.0)])
    drone = zaagtand(f, hoogste=2500.0)
    drone = fft_filter(drone, lp(260, 2))
    drone = np.tanh(2.2 * drone / np.max(np.abs(drone))) * (0.35 + 0.65 * smoothstep(t / 1.6)) * (1 + 0.35 * np.sin(2 * np.pi * (3 + 9 * t / dur) * t))
    drone_hi = fft_filter(drone, bp(180, 1400)) * 0.5  # harmonischen voor kleine speakers

    # hartslag: slagen steeds sneller (afstand 0,62 -> 0,30 s)
    hart = np.zeros(n)
    tb = 0.05
    k = 0
    while tb < 2.2:
        q = tb / 2.2
        for dl, a in [(0.0, 1.0), (0.17 - 0.06 * q, 0.7)]:
            i = int((tb + dl) * SR)
            d = int(0.35 * SR)
            if i + d >= n:
                continue
            tt = tijdas(d)
            slag = np.sin(2 * np.pi * kontour(tt, [(0.0, 110.0), (0.2, 48.0), (0.35, 48.0)]) * tt) * np.exp(-tt / 0.07)
            slag += 0.4 * np.sin(2 * np.pi * 220 * tt) * np.exp(-tt / 0.02)
            hart[i:i + d] += a * (0.55 + 0.45 * q) * slag
        tb += 0.62 - 0.32 * q
        k += 1

    # digitale stoten: korte stukjes ruis, bitgecrusht en herhaald (stotter), in een ritme dat toeneemt
    glitch = np.zeros((2, n))
    tg = 0.25
    while tg < 2.3:
        q = tg / 2.3
        lengte = int(rng.uniform(0.02, 0.06) * SR)
        stuk = fft_filter(rng.standard_normal(lengte), bp(800, 7000))
        stuk = np.round(stuk / np.max(np.abs(stuk)) * 6) / 6  # bitcrush
        herhaal = rng.integers(2, 5)
        for r in range(herhaal):
            i = int(tg * SR) + r * lengte
            if i + lengte >= n:
                break
            p = rng.uniform(-0.8, 0.8)
            glitch[0, i:i + lengte] += (0.3 + 0.5 * q) * np.cos((p + 1) * np.pi / 4) * stuk
            glitch[1, i:i + lengte] += (0.3 + 0.5 * q) * np.sin((p + 1) * np.pi / 4) * stuk
        tg += rng.uniform(0.18, 0.38) * (1 - 0.65 * q)

    # omgekeerde bekken
    ruis = fft_filter(stereo_ruis(rng, n, 0.2), hp(3000, 2))
    zwel = ruis * (smoothstep((t - 0.2) / 2.0) ** 2.5) * 0.25

    # de stijgende veeg aan het einde (de flits): zuivere toon 300 -> 3800 Hz in de laatste 0,35 s
    u = np.clip((t - 2.25) / 0.35, 0, 1)
    vf = 300 * (3800 / 300) ** u
    veeg = np.sin(2 * np.pi * np.cumsum(vf) / SR) * smoothstep((t - 2.25) / 0.05) * ((t >= 2.25) & (t <= 2.58)) * 0.35

    uit = np.stack([drone * 0.7 + drone_hi + hart * 1.2, drone * 0.7 + drone_hi + hart * 1.2]) + glitch * 0.6 + zwel + np.stack([veeg, veeg])
    uit = galm(uit, rng, rt60=0.9, nat=0.12, voorvertraging=0.02, demping_hz=5000)[:, :n]
    return aanzet_uitsterf(uit, 0.02, 0.012)


def koor():
    """Koor: acht stemmen per toon-sectie, elk een zaagtand-glottispuls met een klein vibrato (5-6 Hz, willekeurige
    fase en afwijking), samen door de drie formanten van een open 'aah' (800, 1150, 2800 Hz) gehaald. Eerst een
    C-groot akkoord dat 2 s aanzwelt, daarna een glijdende lift (een hele toon omhoog) naar D-groot dat tot de
    staart blijft staan, met een grote galm en een stille octaaf-sinus erbovenop voor glans."""
    rng = np.random.default_rng(3062)
    dur = 4.6
    n = int(round(dur * SR))
    t = tijdas(n)

    def akkoord(noten, t_aan, t_uit, aanzet, uitsterf, amp):
        env = smoothstep((t - t_aan) / aanzet) * (1 - smoothstep((t - t_uit) / uitsterf))
        som = np.zeros((2, n))
        for m in noten:
            for v in range(4):
                detune = 1 + rng.uniform(-0.006, 0.006)
                vib = 1 + (0.004 + 0.006 * smoothstep((t - t_aan) / 1.2)) * np.sin(2 * np.pi * rng.uniform(4.8, 6.0) * t + rng.uniform(0, 6.28))
                f = midi(m) * detune * vib
                stem = zaagtand(f, hoogste=6000.0)
                p = rng.uniform(-0.9, 0.9)
                gl, gr = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
                som[0] += gl * stem
                som[1] += gr * stem
        return som * env * amp

    a = akkoord([48, 55, 60, 64, 67, 72], 0.05, 2.0, 1.4, 0.7, 1.0)
    b = akkoord([50, 57, 62, 66, 69, 74], 1.9, 3.6, 0.5, 1.0, 1.15)
    koor_ = a + b
    # open 'aah': drie formanten
    koor_ = fft_filter(koor_, hp(90, 2), lp(5000, 2), piek(800, 0.30, 9.0), piek(1150, 0.25, 7.0), piek(2800, 0.25, 4.0))
    # luchtigheid in de formantband
    adem = fft_filter(stereo_ruis(rng, n, 0.2), bp(600, 3500), piek(1100, 0.4, 6.0)) * (smoothstep((t - 0.05) / 1.2) * (1 - smoothstep((t - 3.4) / 1.0)))
    koor_ = koor_ / np.std(koor_) + 0.12 * adem / np.std(adem)
    # glans: stille octaaf-sinussen van het slotakkoord
    glans = np.zeros(n)
    for m in [86, 90, 93]:
        glans += 0.05 * np.sin(2 * np.pi * midi(m) * t + rng.uniform(0, 6.28)) * smoothstep((t - 2.2) / 0.8) * (1 - smoothstep((t - 3.5) / 1.0))
    uit = koor_ * 0.5 + np.stack([glans, np.roll(glans, 90)])
    uit = galm(uit, rng, rt60=2.6, nat=0.40, voorvertraging=0.03, demping_hz=7000)[:, :n]
    return aanzet_uitsterf(uit, 0.05, 0.8)


def boem():
    """Bas-boem: een sinus die in 0,45 s van 95 naar 34 Hz zakt en ~1,8 s uitsterft, een kort kraakje, een verzadigde
    harmonische laag (200-1500 Hz) zodat kleine speakers het ook geven, en een rommelende staart die door een galm loopt."""
    rng = np.random.default_rng(3063)
    dur = 3.2
    n = int(round(dur * SR))
    t = tijdas(n)
    f = kontour(t, [(0.0, 95.0), (0.45, 34.0), (3.2, 34.0)])
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9) * smoothstep(t / 0.004)
    harm = np.tanh(6.0 * sub) * 0.5
    harm = fft_filter(harm, bp(180, 1500)) * 1.4
    kraak = fft_filter(stereo_ruis(rng, n, 0.7), bp(500, 7000)) * np.exp(-t / 0.018) * smoothstep(t / 0.0006) * 1.2
    rommel = fft_filter(stereo_ruis(rng, n, 0.5), lp(220, 2), hp(40, 2)) * np.exp(-t / 0.9) * smoothstep(t / 0.03)
    rommel = rommel / np.std(rommel) * 0.25
    uit = np.stack([sub, sub]) * 1.1 + np.stack([harm, harm]) + kraak + rommel
    uit = galm(uit, rng, rt60=1.8, nat=0.22, voorvertraging=0.015, demping_hz=3500)[:, :n]
    uit = np.tanh(1.6 * uit / np.max(np.abs(uit)))
    return aanzet_uitsterf(uit, 0.0004, 0.7)


GELUIDEN = {
    'tease': ('zeldzaam-tease.mp3', tease),
    'koor': ('zeldzaam-koor.mp3', koor),
    'boem': ('zeldzaam-boem.mp3', boem),
}


def main(argv):
    gekozen = argv or list(GELUIDEN)
    onbekend = [g for g in gekozen if g not in GELUIDEN]
    if onbekend:
        sys.exit(f'Onbekend geluid: {", ".join(onbekend)}. Kies uit: {", ".join(GELUIDEN)}.')
    UIT.mkdir(parents=True, exist_ok=True)
    for naam in gekozen:
        bestand, maak = GELUIDEN[naam]
        stereo = maak()
        pad = UIT / bestand
        piek_db = H.afronden(naam, stereo, pad)
        print(f'{bestand}: {stereo.shape[1] / SR:.2f} s, piek {piek_db:.2f} dBFS, {pad.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
