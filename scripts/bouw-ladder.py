#!/usr/bin/env python3
# Maakt de geluiden van de zeldzaamheidsladder boven ZELDZAAM (glim, kosmisch, mythisch en de ultieme reeks voor een 10),
# volledig procedureel (numpy + ffmpeg met libmp3lame):
#   glim-glinster      kristalachtig glinsteren (~1,8 s)
#   glim-shiny         het 'SHINY!'-moment: belletjes die omhoog klimmen (~1,6 s)
#   kosmisch-bas       diepe ruimte-drone met een trage zwelling (~5,5 s)
#   kosmisch-zwaai     een planeet die langs je heen scheert (~2,6 s)
#   kosmisch-gat       het zwarte gat: dalende spiraal, zuiging en een doffe klap (~4,2 s)
#   mythisch-brul      een brul van een groot wezen (~3,4 s)
#   mythisch-vleugel   twee zware vleugelslagen (~1,3 s)
#   mythisch-adem      ademvuur: sissend, knetterend (~3 s)
#   mythisch-smeed     een slag op een aambeeld met lang nazingend metaal (~2,4 s)
#   mythisch-grom      een laag, dreigend gegrom dat aanzwelt (~3,2 s)
#   ultiem-akkoord     een majestueus koor- en orkestakkoord in lagen (~9,5 s)
#   ultiem-barst       de werkelijkheid breekt: glas, omgekeerde zwelling, zuiging en dan stilte (~4 s)
#   ultiem-bang        de BIG BANG: een knal, een uitdijend heelal en een glanzend akkoord (~7 s)
#
# Gebruik (vanuit de hoofdmap):
#   python3 scripts/bouw-ladder.py              # alles
#   python3 scripts/bouw-ladder.py brul bang    # alleen de genoemde (de naam zonder voorvoegsel mag ook, bv. 'brul')
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


def paneer(x, p):
    """Mono naar stereo met positie p (-1 links ... 1 rechts); p mag een reeks zijn."""
    p = np.broadcast_to(np.asarray(p, dtype=float), x.shape)
    return np.stack([np.cos((p + 1) * np.pi / 4) * x, np.sin((p + 1) * np.pi / 4) * x])


def klok_tik(t, t0, f, uitsterf, a=1.0):
    """Een belletje: sinus met een paar onharmonische boventonen die uitsterft, vanaf t0."""
    d = np.maximum(t - t0, 0)
    env = np.exp(-d / uitsterf) * (t >= t0) * smoothstep((t - t0) / 0.002)
    uit = np.sin(2 * np.pi * f * d) + 0.45 * np.sin(2 * np.pi * f * 2.76 * d) * np.exp(-d / (uitsterf * 0.5)) + 0.25 * np.sin(2 * np.pi * f * 5.4 * d) * np.exp(-d / (uitsterf * 0.25))
    return a * env * uit


def glinster():
    rng = np.random.default_rng(4101)
    dur = 1.8
    n = int(dur * SR)
    t = tijdas(n)
    uit = np.zeros((2, n))
    # een regen van kleine belletjes in hoge pentatonische tonen, steeds dichter op elkaar en dan uitdovend
    noten = [88, 91, 93, 96, 98, 100, 103]
    tt = 0.02
    while tt < 1.3:
        m = noten[rng.integers(0, len(noten))]
        k = klok_tik(t, tt, midi(m), rng.uniform(0.12, 0.3), rng.uniform(0.25, 0.6) * (1 - 0.5 * tt / 1.3))
        uit += paneer(k, rng.uniform(-0.9, 0.9))
        tt += rng.uniform(0.025, 0.11)
    # een zachte, hoge zweving eronder
    zacht = fft_filter(stereo_ruis(rng, n, 0.3), bp(5000, 12000)) * (smoothstep(t / 0.1) * np.exp(-t / 0.5)) * 0.06
    uit = uit + zacht
    uit = galm(uit, rng, rt60=1.4, nat=0.35, voorvertraging=0.012, demping_hz=10000)[:, :n]
    return aanzet_uitsterf(uit, 0.002, 0.25)


def shiny():
    rng = np.random.default_rng(4102)
    dur = 1.7
    n = int(dur * SR)
    t = tijdas(n)
    uit = np.zeros((2, n))
    # een klim van vier belletjes (E - G# - B - E) en een groot belletje bovenop
    for i, (m, a) in enumerate([(76, 0.5), (80, 0.55), (83, 0.6), (88, 0.9)]):
        uit += paneer(klok_tik(t, 0.0 + 0.085 * i, midi(m), 0.5, a), -0.4 + 0.27 * i)
    uit += paneer(klok_tik(t, 0.34, midi(95), 0.9, 0.55), 0.2)
    # een opwaartse sprankel-veeg
    u = np.clip(t / 0.4, 0, 1)
    f = 1200 * (6000 / 1200) ** u
    veeg = np.sin(2 * np.pi * np.cumsum(f) / SR) * smoothstep(t / 0.02) * (1 - smoothstep((t - 0.3) / 0.12)) * 0.2
    uit += paneer(veeg, 0.0)
    uit += fft_filter(stereo_ruis(rng, n, 0.2), bp(6000, 14000)) * np.exp(-t / 0.12) * 0.1
    uit = galm(uit, rng, rt60=1.6, nat=0.4, voorvertraging=0.012, demping_hz=9000)[:, :n]
    return aanzet_uitsterf(uit, 0.001, 0.3)


def kosmisch_bas():
    rng = np.random.default_rng(4103)
    dur = 5.5
    n = int(dur * SR)
    t = tijdas(n)
    zwel = smoothstep(t / 2.4) * (1 - smoothstep((t - 4.2) / 1.2))
    f = kontour(t, [(0.0, 38.0), (2.4, 46.0), (5.5, 33.0)])
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * zwel
    hoger = np.zeros(n)
    for fr, a in [(55.0, 0.5), (82.5, 0.35), (110.0, 0.3), (165.0, 0.18)]:
        hoger += a * np.sin(2 * np.pi * fr * t * (1 + 0.003 * np.sin(2 * np.pi * 0.2 * t)) + rng.uniform(0, 6.28))
    hoger = np.tanh(2.0 * hoger) * zwel * (0.7 + 0.3 * np.sin(2 * np.pi * 0.35 * t))
    rommel = fft_filter(stereo_ruis(rng, n, 0.6), lp(160, 2), hp(30, 2)) * zwel
    rommel = rommel / np.std(rommel) * 0.4
    zucht = fft_filter(stereo_ruis(rng, n, 0.2), bp(300, 2400), piek(900, 0.5, 6)) * smoothstep((t - 1.2) / 2.0) * (1 - smoothstep((t - 4.0) / 1.4)) * 0.12
    uit = np.stack([sub, sub]) * 1.2 + np.stack([hoger, hoger]) * 0.35 + rommel + zucht
    uit = galm(uit, rng, rt60=3.2, nat=0.35, voorvertraging=0.03, demping_hz=4500)[:, :n]
    return aanzet_uitsterf(uit, 0.4, 0.9)


def kosmisch_zwaai():
    rng = np.random.default_rng(4104)
    dur = 2.6
    n = int(dur * SR)
    t = tijdas(n)
    ruis = stereo_ruis(rng, n, 0.1)
    # bandfilters die meebewegen: eerst bundelen we een paar banden en mengen op de tijd
    banden = [(150, 500), (400, 1400), (1200, 3600), (3000, 8000)]
    midden = 1.15
    breedte = 0.55
    env_b = lambda c: np.exp(-0.5 * ((t - (midden - 0.45 + 0.3 * c)) / (breedte * (1.0 - 0.1 * c))) ** 2)
    uit = np.zeros((2, n))
    for i, (lo, hi) in enumerate(banden):
        uit += fft_filter(ruis, bp(lo, hi)) * env_b(i) * (0.9 - 0.15 * i)
    # van links naar rechts
    p = np.cos(np.clip((t - 0.2) / 2.1, 0, 1) * np.pi / 2 * 1.0) * 0 + (np.clip((t - 0.3) / 1.9, 0, 1) * 2 - 1)
    mono = uit.mean(axis=0)
    uit = paneer(mono, p * 0.9) + uit * 0.3
    # doppler-toon: een zachte sinus die zakt
    f = kontour(t, [(0.0, 420.0), (1.15, 420.0), (2.6, 190.0)])
    f = np.where(t < 1.15, 420 + 120 * (t / 1.15), f)
    toon = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-0.5 * ((t - 1.15) / 0.55) ** 2) * 0.15
    uit += paneer(toon, p * 0.9)
    uit = galm(uit, rng, rt60=1.8, nat=0.25, voorvertraging=0.02, demping_hz=6000)[:, :n]
    return aanzet_uitsterf(uit, 0.15, 0.5)


def kosmisch_gat():
    rng = np.random.default_rng(4105)
    dur = 4.2
    n = int(dur * SR)
    t = tijdas(n)
    # een dalende spiraal: de toon zakt van 1400 naar 30 Hz en versnelt zijn zwevingen
    u = np.clip(t / 3.2, 0, 1)
    f = 1400 * (30 / 1400) ** (u ** 0.8)
    fase = 2 * np.pi * np.cumsum(f) / SR
    toon = np.sin(fase + 2.5 * np.sin(fase * 0.5)) * smoothstep(t / 0.4) * (1 - smoothstep((t - 3.3) / 0.3))
    toon2 = np.sin(fase * 1.5) * 0.4 * smoothstep(t / 0.4) * (1 - smoothstep((t - 3.2) / 0.3))
    # zuiging: ruis met een filter dat naar beneden zakt
    ruis = stereo_ruis(rng, n, 0.4)
    zuig = np.zeros((2, n))
    for i, fc in enumerate([6000, 3000, 1500, 700, 300, 120]):
        c = 0.4 * (i + 1) / 6
        env = np.exp(-0.5 * ((t - (0.4 + 0.5 * i)) / 0.5) ** 2)
        zuig += fft_filter(ruis, bp(fc / 1.5, fc * 1.5)) * env
    zuig *= 0.35
    # de klap aan het einde: dof, laag
    ft = kontour(t, [(0.0, 90.0), (3.3, 90.0), (3.55, 34.0), (4.2, 34.0)])
    klap = np.sin(2 * np.pi * np.cumsum(ft) / SR) * np.exp(-np.maximum(t - 3.3, 0) / 0.35) * (t >= 3.3) * smoothstep((t - 3.3) / 0.004)
    uit = np.stack([toon * 0.5 + toon2 * 0.3, toon * 0.5 + toon2 * 0.3]) + zuig + np.stack([klap, klap]) * 1.2
    uit = galm(uit, rng, rt60=2.4, nat=0.3, voorvertraging=0.02, demping_hz=4000)[:, :n]
    return aanzet_uitsterf(uit, 0.02, 0.5)


def brul():
    rng = np.random.default_rng(4106)
    dur = 3.4
    n = int(dur * SR)
    t = tijdas(n)
    env = smoothstep(t / 0.28) * np.exp(-np.maximum(t - 1.2, 0) / 1.1) * (1 - smoothstep((t - 3.0) / 0.4))
    f0 = kontour(t, [(0.0, 90.0), (0.45, 175.0), (1.3, 150.0), (3.4, 62.0)])
    f0 = f0 * (1 + 0.03 * np.sin(2 * np.pi * 6.5 * t))
    bron = zaagtand(f0, hoogste=5000.0)
    # grom: snelle amplitudemodulatie (30-45 Hz) en veel vervorming
    grom = 0.55 + 0.45 * np.sin(2 * np.pi * (28 + 12 * np.sin(2 * np.pi * 0.7 * t)) * t)
    bron = bron * grom
    adem = fft_filter(rng.standard_normal(n), bp(500, 4500)) * (0.35 + 0.65 * smoothstep(t / 0.2))
    bron = bron / np.std(bron) + 0.8 * adem / np.std(adem)
    # keel: twee formanten die tijdens de brul openzwaaien ('aaa-oooo')
    keel = fft_filter(bron, hp(60, 2), lp(4200, 2), piek(650, 0.3, 12.0), piek(1100, 0.3, 8.0), piek(2600, 0.3, 5.0), piek(120, 0.5, 6.0))
    keel = np.tanh(2.6 * keel / np.std(keel)) * env
    stereo = np.stack([keel, np.roll(keel, 40)])
    laag = np.sin(2 * np.pi * np.cumsum(f0 * 0.5) / SR) * env * 0.5
    stereo += np.stack([laag, laag])
    stereo = galm(stereo, rng, rt60=2.4, nat=0.3, voorvertraging=0.02, demping_hz=5000)[:, :n]
    return aanzet_uitsterf(stereo, 0.01, 0.5)


def vleugel():
    rng = np.random.default_rng(4107)
    dur = 1.3
    n = int(dur * SR)
    t = tijdas(n)
    uit = np.zeros((2, n))
    for i, t0 in enumerate([0.02, 0.6]):
        env = smoothstep((t - t0) / 0.06) * np.exp(-np.maximum(t - t0 - 0.06, 0) / 0.16) * (t >= t0)
        wind = fft_filter(stereo_ruis(rng, n, 0.3), bp(120, 1600), piek(350, 0.5, 6.0)) * env
        # de vleugel 'klapt' kort op de top
        f = kontour(t, [(0.0, 90.0), (1.3, 90.0)]) * 0 + 70.0
        dreun = np.sin(2 * np.pi * f * (t - t0)) * np.exp(-np.maximum(t - t0, 0) / 0.09) * (t >= t0) * smoothstep((t - t0) / 0.005)
        uit += wind * (1.0 - 0.1 * i) + np.stack([dreun, dreun]) * 0.9
    uit = galm(uit, rng, rt60=1.2, nat=0.2, voorvertraging=0.015, demping_hz=4500)[:, :n]
    return aanzet_uitsterf(uit, 0.003, 0.3)


def adem():
    rng = np.random.default_rng(4108)
    dur = 3.0
    n = int(dur * SR)
    t = tijdas(n)
    env = smoothstep(t / 0.35) * (1 - smoothstep((t - 2.2) / 0.8))
    ruis = stereo_ruis(rng, n, 0.3)
    sis = fft_filter(ruis, bp(800, 6000), piek(2200, 0.6, 5.0)) * env
    brul = fft_filter(ruis, bp(100, 700)) * env * 1.3
    # knetteren: korte klikjes
    knet = np.zeros((2, n))
    for _ in range(140):
        i = int(rng.uniform(0.1, 2.7) * SR)
        a = rng.uniform(0.2, 1.0) * env[min(i, n - 1)]
        l = int(rng.uniform(0.0008, 0.004) * SR)
        if i + l < n:
            knet[rng.integers(0, 2), i:i + l] += a * rng.standard_normal(l) * np.hanning(l)
    uit = sis * 0.8 + brul * 0.5 + knet * 1.5
    uit = galm(uit, rng, rt60=1.5, nat=0.2, voorvertraging=0.015, demping_hz=7000)[:, :n]
    return aanzet_uitsterf(uit, 0.05, 0.5)


def smeed():
    """Een slag op een aambeeld: een harde tik, metalen boventonen die lang nazingen en een doffe dreun."""
    rng = np.random.default_rng(4111)
    dur = 2.4
    n = int(dur * SR)
    t = tijdas(n)
    tik = fft_filter(stereo_ruis(rng, n, 0.6), hp(1800, 2), piek(4200, 0.5, 6.0)) * np.exp(-t / 0.012)
    ring = np.zeros(n)
    for f, a, d in [(812.0, 1.0, 1.1), (1957.0, 0.7, 0.8), (3121.0, 0.45, 0.55), (4430.0, 0.3, 0.35), (2510.0, 0.35, 0.9), (6020.0, 0.15, 0.2)]:
        ring += a * np.sin(2 * np.pi * f * t * (1 + 0.0006 * np.sin(2 * np.pi * 5 * t))) * np.exp(-t / d)
    ring *= smoothstep(t / 0.002)
    dreun = np.sin(2 * np.pi * 85 * t) * np.exp(-t / 0.18) * smoothstep(t / 0.003)
    mono = 0.55 * ring / np.max(np.abs(ring)) + 0.6 * dreun
    uit = np.stack([mono, np.roll(mono, 25)]) + tik * 1.2
    uit = galm(uit, rng, rt60=2.2, nat=0.35, voorvertraging=0.02, demping_hz=7000)[:, :n]
    return aanzet_uitsterf(uit, 0.001, 0.6)


def grom():
    """Een laag, dreigend gegrom dat aanzwelt: het wezen wordt wakker."""
    rng = np.random.default_rng(4112)
    dur = 3.2
    n = int(dur * SR)
    t = tijdas(n)
    env = smoothstep(t / 1.1) * (1 - smoothstep((t - 2.4) / 0.8))
    f0 = kontour(t, [(0.0, 42.0), (1.6, 58.0), (3.2, 46.0)])
    bron = zaagtand(f0, hoogste=1800.0)
    am = 0.5 + 0.5 * np.sin(2 * np.pi * (17 + 6 * np.sin(2 * np.pi * 0.4 * t)) * t)
    bron = bron * am
    lucht = fft_filter(rng.standard_normal(n), bp(150, 1200)) * 0.5
    bron = bron / np.std(bron) + lucht / np.std(lucht) * 0.6
    keel = fft_filter(bron, hp(30, 2), lp(1400, 2), piek(320, 0.4, 9.0), piek(700, 0.4, 5.0))
    keel = np.tanh(1.8 * keel / np.std(keel)) * env
    sub = np.sin(2 * np.pi * np.cumsum(f0) / SR) * env * 0.7
    mono = keel + sub
    uit = np.stack([mono, np.roll(mono, 60)])
    uit = galm(uit, rng, rt60=2.6, nat=0.3, voorvertraging=0.03, demping_hz=3000)[:, :n]
    return aanzet_uitsterf(uit, 0.05, 0.6)


def koor_laag(rng, n, t, noten, t_aan, t_uit, aanzet, uitsterf, amp, stemmen=5, formanten=True):
    env = smoothstep((t - t_aan) / aanzet) * (1 - smoothstep((t - t_uit) / uitsterf))
    som = np.zeros((2, n))
    for m in noten:
        for v in range(stemmen):
            detune = 1 + rng.uniform(-0.007, 0.007)
            vib = 1 + (0.004 + 0.006 * smoothstep((t - t_aan) / 1.5)) * np.sin(2 * np.pi * rng.uniform(4.6, 6.0) * t + rng.uniform(0, 6.28))
            stem = zaagtand(np.full(n, midi(m)) * detune * vib, hoogste=6000.0)
            som += paneer(stem, rng.uniform(-0.95, 0.95))
    if formanten:
        som = fft_filter(som, hp(80, 2), lp(5200, 2), piek(800, 0.3, 9.0), piek(1150, 0.25, 7.0), piek(2800, 0.25, 4.0))
    return som / np.std(som) * env * amp


def akkoord():
    rng = np.random.default_rng(4109)
    dur = 9.5
    n = int(dur * SR)
    t = tijdas(n)
    # drie lagen: koor (hoog), koper (midden, zaagtanden door een openzwaaiend filter), strijkers (breed, tremolo)
    koor = koor_laag(rng, n, t, [50, 57, 62, 66, 69, 74], 0.1, 4.0, 2.0, 1.2, 0.5)
    koor += koor_laag(rng, n, t, [52, 59, 62, 67, 71, 76, 79], 3.6, 8.2, 1.0, 1.6, 0.62)
    koper = np.zeros((2, n))
    for m, a in [(38, 1.0), (45, 0.8), (50, 0.7), (54, 0.6), (57, 0.6)]:
        env = smoothstep((t - 2.8) / 1.8) * (1 - smoothstep((t - 8.0) / 1.4))
        for v in range(2):
            f = np.full(n, midi(m)) * (1 + rng.uniform(-0.003, 0.003)) * (1 + 0.002 * np.sin(2 * np.pi * 5.2 * t))
            z = zaagtand(f, hoogste=3500.0)
            koper += paneer(z * env * a, rng.uniform(-0.5, 0.5))
    koper = fft_filter(koper, lp(2400, 2), hp(70, 2)) / np.std(koper) * 0.28
    strijk = np.zeros((2, n))
    for m in [62, 66, 69, 74, 78, 81]:
        env = smoothstep((t - 0.6) / 3.0) * (1 - smoothstep((t - 8.2) / 1.2))
        for v in range(3):
            f = np.full(n, midi(m)) * (1 + rng.uniform(-0.005, 0.005)) * (1 + 0.003 * np.sin(2 * np.pi * rng.uniform(5, 6.5) * t))
            strijk += paneer(zaagtand(f, hoogste=7000.0) * env * (1 + 0.15 * np.sin(2 * np.pi * 6.5 * t)), rng.uniform(-1, 1))
    strijk = fft_filter(strijk, lp(6500, 2), hp(150, 2)) / np.std(strijk) * 0.22
    # pauken: een rollende ruk onder in het begin van het slotakkoord
    pauk = np.zeros(n)
    for t0, a in [(3.5, 0.7), (3.7, 0.5), (3.86, 0.6), (4.0, 0.8), (4.1, 0.9), (4.2, 1.0)]:
        d = np.maximum(t - t0, 0)
        fp = 75 * (1 + 0.5 * np.exp(-d / 0.05))
        pauk += a * np.sin(2 * np.pi * np.cumsum(np.where(t >= t0, fp, 0.0)) / SR) * np.exp(-d / 0.45) * (t >= t0)
    pauk = np.stack([pauk, pauk]) * 0.9
    # sprankels van de hoge sinussen
    glans = np.zeros((2, n))
    for m in [86, 90, 93, 98, 102]:
        g = np.sin(2 * np.pi * midi(m) * t + rng.uniform(0, 6.28)) * smoothstep((t - 4.0) / 1.2) * (1 - smoothstep((t - 8.2) / 1.0)) * 0.03
        glans += paneer(g * (1 + 0.5 * np.sin(2 * np.pi * rng.uniform(0.3, 1.1) * t)), rng.uniform(-0.8, 0.8))
    uit = koor + koper + strijk + pauk + glans
    uit = galm(uit, rng, rt60=4.2, nat=0.5, voorvertraging=0.035, demping_hz=7500)[:, :n]
    return aanzet_uitsterf(uit, 0.4, 1.4)


def barst():
    rng = np.random.default_rng(4110)
    dur = 4.0
    n = int(dur * SR)
    t = tijdas(n)
    uit = np.zeros((2, n))
    # omgekeerde zwelling en daarna een zuiging die naar nul toe valt
    ruis = stereo_ruis(rng, n, 0.2)
    zwel = fft_filter(ruis, hp(1500, 2)) * (smoothstep(t / 1.6) ** 2.5) * (t < 1.6) * 0.5
    # glasbarsten: scherpe klikjes en een gebroken pinggeluid
    glas = np.zeros((2, n))
    tt = 0.1
    while tt < 1.9:
        i = int(tt * SR)
        l = int(rng.uniform(0.003, 0.02) * SR)
        if i + l < n:
            stuk = fft_filter(rng.standard_normal(l), bp(2500, 12000)) * np.exp(-np.arange(l) / (l * 0.3))
            glas[rng.integers(0, 2), i:i + l] += stuk / (np.max(np.abs(stuk)) + 1e-9) * rng.uniform(0.3, 1.0)
        tt += rng.uniform(0.05, 0.25) * (1.15 - 0.6 * tt / 1.9)
    glas = glas * 0.8
    pings = np.zeros((2, n))
    for t0, m in [(0.15, 100), (0.7, 96), (1.2, 103), (1.6, 99)]:
        pings += paneer(klok_tik(t, t0, midi(m), 0.4, 0.25), rng.uniform(-0.6, 0.6))
    # de grote breuk op 1,9 s: harde klap, dan een daling in toonhoogte en alles wordt naar binnen gezogen
    breuk = np.zeros(n)
    kn = fft_filter(rng.standard_normal(n), bp(200, 9000)) * np.exp(-np.maximum(t - 1.9, 0) / 0.05) * (t >= 1.9)
    f = kontour(t, [(0.0, 1500.0), (1.9, 1500.0), (3.7, 40.0), (4.0, 40.0)])
    spiraal = np.sin(2 * np.pi * np.cumsum(f) / SR) * smoothstep((t - 1.9) / 0.05) * (1 - smoothstep((t - 3.4) / 0.4)) * (t >= 1.9) * 0.5
    zuig = fft_filter(ruis, bp(200, 4000)) * smoothstep((t - 1.95) / 0.3) * (1 - smoothstep((t - 3.4) / 0.4)) * 0.3
    uit = np.stack([zwel, zwel[::-1]]) if False else zwel
    uit = uit + glas + pings + np.stack([kn, kn]) * 1.3 + np.stack([spiraal, spiraal]) + zuig
    uit = galm(uit, rng, rt60=1.4, nat=0.25, voorvertraging=0.012, demping_hz=8000)[:, :n]
    # alles hierna is stilte (de scène gaat zwart)
    uit = uit * (1 - smoothstep((t - 3.55) / 0.35))
    return aanzet_uitsterf(uit, 0.01, 0.02)


def bang():
    rng = np.random.default_rng(4111)
    dur = 7.0
    n = int(dur * SR)
    t = tijdas(n)
    # de knal: sub die in 0,6 s van 120 naar 28 Hz zakt, breedband-ruisfront en een vervormde laag
    f = kontour(t, [(0.0, 120.0), (0.6, 28.0), (7.0, 26.0)])
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.4) * smoothstep(t / 0.003)
    front = fft_filter(stereo_ruis(rng, n, 0.7), bp(60, 9000)) * np.exp(-t / 0.22) * smoothstep(t / 0.0008)
    hoger = np.tanh(5.0 * sub) * 0.5
    hoger = fft_filter(hoger, bp(160, 1600))
    uit = np.stack([sub, sub]) * 1.2 + front * 1.4 + np.stack([hoger, hoger])
    # het heelal dijt uit: een stijgende, breder wordende veeg en glinsterende belletjes
    veeg = fft_filter(stereo_ruis(rng, n, 0.1), bp(500, 9000)) * smoothstep((t - 0.1) / 1.0) * np.exp(-np.maximum(t - 1.0, 0) / 1.4) * 0.35
    uit += veeg
    for _ in range(46):
        t0 = rng.uniform(0.3, 5.0)
        uit += paneer(klok_tik(t, t0, midi(rng.choice([86, 88, 91, 93, 96, 98, 100])), rng.uniform(0.2, 0.6), rng.uniform(0.04, 0.16)), rng.uniform(-0.9, 0.9))
    # een groot glanzend akkoord (D-groot, open) dat uit de knal oprijst
    for m in [38, 50, 57, 62, 66, 69, 74, 78]:
        env = smoothstep((t - 0.2) / 1.0) * np.exp(-np.maximum(t - 3.0, 0) / 1.6) * (t < 6.8)
        for v in range(3):
            ff = np.full(n, midi(m)) * (1 + rng.uniform(-0.004, 0.004)) * (1 + 0.003 * np.sin(2 * np.pi * rng.uniform(4.6, 6) * t))
            uit += paneer(zaagtand(ff, hoogste=4500.0) * env * 0.045, rng.uniform(-0.9, 0.9))
    uit = galm(uit, rng, rt60=4.0, nat=0.45, voorvertraging=0.03, demping_hz=7000)[:, :n]
    uit = np.tanh(1.3 * uit / np.max(np.abs(uit)))
    return aanzet_uitsterf(uit, 0.0004, 0.9)


GELUIDEN = {
    'glim-glinster': glinster,
    'glim-shiny': shiny,
    'kosmisch-bas': kosmisch_bas,
    'kosmisch-zwaai': kosmisch_zwaai,
    'kosmisch-gat': kosmisch_gat,
    'mythisch-brul': brul,
    'mythisch-vleugel': vleugel,
    'mythisch-adem': adem,
    'mythisch-smeed': smeed,
    'mythisch-grom': grom,
    'ultiem-akkoord': akkoord,
    'ultiem-barst': barst,
    'ultiem-bang': bang,
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
