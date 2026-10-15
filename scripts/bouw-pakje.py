#!/usr/bin/env python3
# Maakt de extra geluiden van de gewone pakje-animatie, volledig procedureel (geen opnames, geen netwerk):
#   extension/sounds/pakje-folie.mp3      knisperend folie terwijl het pakje oplaadt   (~2,6 s)
#   extension/sounds/pakje-scheur.mp3     de scheur: rits van folie, luchtstoot, klap en glans (~1,6 s)
#   extension/sounds/pakje-tunnel.mp3     stadiontunnel: zwellend publiek, galm         (~5,0 s)
#   extension/sounds/pakje-onthul-0..3    de onthulling per niveau: brons sober, zilver helder,
#                                         goud groot (koperakkoord), speciaal synth-zwel met glinster
#
# Gebruik (vanuit de hoofdmap; Python 3 + numpy en ffmpeg met libmp3lame):
#   python3 scripts/bouw-pakje.py            # alles
#   python3 scripts/bouw-pakje.py scheur     # alleen de genoemde
#
# De bouwstenen (filters, galm, codering op een vaste piek) komen uit bouw-halloween.py.
import importlib.util
import sys
from pathlib import Path

import numpy as np

_spec = importlib.util.spec_from_file_location('hw', Path(__file__).resolve().parent / 'bouw-halloween.py')
hw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hw)
SR = hw.SR
tijdas, smoothstep, fft_filter, lp, hp, bp, piek = hw.tijdas, hw.smoothstep, hw.fft_filter, hw.lp, hw.hp, hw.bp, hw.piek
stereo_ruis, trage_ruis, galm, zaagtand, aanzet_uitsterf = hw.stereo_ruis, hw.trage_ruis, hw.galm, hw.zaagtand, hw.aanzet_uitsterf


def stoot(t, t0, amp, tau, aanzet=0.0008):
    d = np.maximum(t - t0, 0.0)
    return amp * np.where(t >= t0, np.exp(-d / tau), 0.0) * smoothstep(d / aanzet)


def knisper(rng, t, dichtheid, amp=1.0):
    """Korte, droge klikjes (folie die kreukt) met een dichtheid die met de tijd verandert."""
    n = len(t)
    env = np.zeros(n)
    p = dichtheid / SR
    plekken = np.nonzero(rng.random(n) < p)[0]
    for i in plekken:
        lengte = int(SR * rng.uniform(0.002, 0.012))
        j = min(n, i + lengte)
        env[i:j] += rng.uniform(0.2, 1.0) * np.exp(-np.arange(j - i) / (lengte * 0.3))
    ruis = stereo_ruis(rng, n, 0.5)
    return fft_filter(ruis * env, hp(1800), lp(11000), piek(4500, 1.0, 5)) * amp


def folie():
    rng = np.random.default_rng(2101)
    dur = 2.6
    n = int(dur * SR)
    t = tijdas(n)
    q = t / dur
    dicht = 25 + 260 * q ** 1.6
    uit = knisper(rng, t, dicht) * (0.35 + 0.65 * q)[None]
    # een zacht ruisbed dat aanzwelt: de lucht in het zakje
    bed = fft_filter(stereo_ruis(rng, n, 0.6), bp(1500, 7000)) * (0.04 + 0.12 * q ** 2)[None]
    uit = uit + bed
    uit = galm(aanzet_uitsterf(uit, 0.0005, 0.25), rng, 0.35, 0.12, 0.01, 6000)
    return aanzet_uitsterf(uit, 0.05, 0.08)


def scheur():
    rng = np.random.default_rng(2102)
    dur = 1.6
    n = int(dur * SR)
    t = tijdas(n)
    # 1. de rits: korrels die steeds sneller komen (0..0,18 s), daarna één lange scheur tot 0,32 s
    korrel_t = np.cumsum(np.geomspace(0.03, 0.004, 26))
    env = sum(stoot(t, k, 0.4 + 0.6 * i / 26, 0.006) for i, k in enumerate(korrel_t))
    rits_len = smoothstep((t - 0.10) / 0.02) * (1 - smoothstep((t - 0.30) / 0.07))
    am = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * (120 + 300 * t) * t))
    rits = fft_filter(stereo_ruis(rng, n, 0.4), hp(900), lp(12000), piek(3200, 1.2, 6)) * (env + rits_len * am * 0.9)
    # 2. de luchtstoot en de klap op het moment van openen (0,10 s)
    lucht = fft_filter(stereo_ruis(rng, n, 0.7), bp(200, 2500)) * stoot(t, 0.10, 1.0, 0.16, 0.01)
    f = 90 * np.exp(-np.maximum(t - 0.1, 0) / 0.12) + 45
    klap = np.sin(2 * np.pi * np.cumsum(f) / SR) * stoot(t, 0.10, 1.0, 0.22, 0.002)
    klap_h = fft_filter(np.tanh(4 * klap), bp(150, 1800)) * 0.5
    klap = np.stack([klap, klap]) + np.stack([klap_h, klap_h])
    # 3. een glans van licht: hoge, zachte belletonen die wegsterven
    glans = np.zeros(n)
    for k, fq in enumerate([2093, 2637, 3136, 4186]):
        glans += np.sin(2 * np.pi * fq * t + k) * stoot(t, 0.12 + 0.025 * k, 0.25, 0.6, 0.02)
    glans = np.stack([glans, np.roll(glans, 300)])
    uit = rits * 1.1 + lucht * 0.7 + klap * 0.9 + glans * 0.25
    uit = galm(aanzet_uitsterf(uit, 0.0005, 0.25), rng, 0.9, 0.18, 0.015, 5000)
    uit = np.tanh(1.8 * uit / np.max(np.abs(uit)))
    return aanzet_uitsterf(uit, 0.001, 0.25)


def tunnel():
    rng = np.random.default_rng(2103)
    dur = 5.0
    n = int(dur * SR)
    t = tijdas(n)
    q = t / dur
    # publiek: veel stemmen = bandruis met formant-pieken en trage golven, steeds luider en helderder
    basis = stereo_ruis(rng, n, 0.3)
    stem = fft_filter(basis, bp(180, 3500), piek(500, 1.0, 6), piek(1100, 0.8, 4), piek(2600, 0.8, 3))
    golf = np.clip(1 + 0.35 * trage_ruis(rng, n, 1.5) + 0.2 * trage_ruis(rng, n, 6.0), 0.3, None)
    zwel = 0.25 + 0.75 * smoothstep(q) ** 1.2
    stem = stem * (golf * zwel)[None]
    # de tunnel: dof gerommel dat op het eind opengaat
    rommel = fft_filter(stereo_ruis(rng, n, 0.8), bp(60, 400)) * (0.6 - 0.3 * q)[None]
    # losse kreten en fluitjes in de verte
    kreet = np.zeros(n)
    for _ in range(9):
        t0 = rng.uniform(0.6, dur - 0.5)
        f0 = rng.uniform(500, 900)
        d = np.maximum(t - t0, 0)
        kreet += np.sin(2 * np.pi * np.cumsum(f0 * (1 + 0.1 * np.sin(d * 9))) / SR) * stoot(t, t0, 0.3, 0.25, 0.05)
    kreet = fft_filter(kreet, bp(400, 3000))
    uit = stem + rommel * 0.5 + np.stack([kreet, np.roll(kreet, 900)]) * 0.15
    uit = galm(aanzet_uitsterf(uit, 0.0005, 0.25), rng, 1.6, 0.35, 0.03, 3500)
    return aanzet_uitsterf(uit, 0.3, 0.6)


def akkoord(t, freqs, t0, tau, helder, rng, vibrato=0.0):
    s = np.zeros(len(t))
    for i, f in enumerate(freqs):
        ft = f * (1 + vibrato * np.sin(2 * np.pi * 5.2 * t + i)) * np.ones(len(t))
        s += zaagtand(ft, hoogste=helder) * (0.8 ** i)
    return s * stoot(t, t0, 1.0, tau, 0.02)


def onthul(niveau):
    rng = np.random.default_rng(2110 + niveau)
    dur = [1.6, 2.2, 3.0, 3.4][niveau]
    n = int(dur * SR)
    t = tijdas(n)
    # de klap: lager en zwaarder bij een hoger niveau
    f = (70 + 60 * np.exp(-t / 0.08))
    klap = np.sin(2 * np.pi * np.cumsum(f) / SR) * stoot(t, 0.0, 1.0, [0.12, 0.2, 0.32, 0.3][niveau], 0.002)
    klap = klap + fft_filter(np.tanh(5 * klap), bp(150, 1500)) * 0.5
    hit = fft_filter(rng.standard_normal(n), bp(800, 9000)) * stoot(t, 0.0, 1.0, 0.03, 0.0005)
    if niveau == 0:
        # brons: dof houtblok en een kleine, matte bel (mineur)
        bel = sum(np.sin(2 * np.pi * fq * t) * stoot(t, 0.02, a, 0.35) for fq, a in [(392, 1), (466, 0.5), (784, 0.25)])
        mono = klap * 0.7 + hit * 0.2 + bel * 0.35
    elif niveau == 1:
        # zilver: heldere glockenspiel-drieklank, licht gespreid
        bel = sum(np.sin(2 * np.pi * fq * t) * stoot(t, 0.03 + 0.07 * k, 1.0, 0.7) + 0.3 * np.sin(2 * np.pi * 2.76 * fq * t) * stoot(t, 0.03 + 0.07 * k, 1.0, 0.2)
                  for k, fq in enumerate([1047, 1319, 1568]))
        mono = klap * 0.7 + hit * 0.35 + bel * 0.35
    elif niveau == 2:
        # goud: grote klap, koperakkoord (C-majeur, zaagtanden door een laagdoorlaat) en een glans erboven
        koper = akkoord(t, [130.8, 196, 261.6, 329.6, 392], 0.04, 1.4, 4000, rng, 0.004)
        koper = fft_filter(koper, lp(2600, 2), hp(90)) * 0.18
        glans = sum(np.sin(2 * np.pi * fq * t) * stoot(t, 0.15 + 0.06 * k, 0.4, 1.0) for k, fq in enumerate([2093, 2637, 3136, 4186]))
        mono = klap * 0.9 + hit * 0.45 + koper + glans * 0.12
    else:
        # speciaal: synth-zwel (gestemde, zwevende pad) met een snel glinsterend arpeggio
        pad = akkoord(t, [146.8, 220, 293.7, 370, 440], 0.0, 2.4, 6000, rng, 0.008)
        pad = fft_filter(pad, lp(3000, 2), hp(100)) * 0.16
        arp = np.zeros(n)
        for k, fq in enumerate([1175, 1480, 1760, 2349, 2960, 3520, 4699]):
            arp += np.sin(2 * np.pi * fq * t) * stoot(t, 0.08 + 0.055 * k, 0.5, 0.45)
        mono = klap * 0.8 + hit * 0.4 + pad + arp * 0.14
    uit = np.stack([mono, np.roll(mono, 220)])
    uit = galm(aanzet_uitsterf(uit, 0.0005, 0.25), rng, [0.6, 1.0, 1.6, 2.0][niveau], 0.25, 0.02, 5000)
    uit = np.tanh(1.5 * uit / np.max(np.abs(uit)))
    return aanzet_uitsterf(uit, 0.0008, 0.4)


GELUIDEN = {
    'folie': ('pakje-folie.mp3', folie),
    'scheur': ('pakje-scheur.mp3', scheur),
    'tunnel': ('pakje-tunnel.mp3', tunnel),
    **{f'onthul-{i}': (f'pakje-onthul-{i}.mp3', (lambda i=i: onthul(i))) for i in range(4)},
}


def main(argv):
    gekozen = argv or list(GELUIDEN)
    for naam in gekozen:
        bestand, maak = GELUIDEN[naam]
        stereo = maak()
        pad = hw.UIT / bestand
        p = hw.afronden(naam, stereo, pad)
        print(f'{bestand}: {stereo.shape[1] / SR:.2f} s, piek {p:.2f} dBFS, {pad.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
