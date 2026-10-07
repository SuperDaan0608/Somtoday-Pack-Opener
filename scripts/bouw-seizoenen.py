#!/usr/bin/env python3
# Maakt de geluidseffecten van de seizoensthema's Kerst en Zomer, volledig procedureel (geen opnames, geen netwerk),
# met dezelfde bouwstenen en dezelfde uitvoereisen als scripts/bouw-halloween.py (dat bestand wordt hier gewoon geladen):
#   extension/sounds/kerst-bel.mp3      sleebellen die schudden tijdens het opladen   (~2,2 s)
#   extension/sounds/kerst-wind.mp3     koud windgeruis met sneeuw                    (~3,4 s)
#   extension/sounds/kerst-ding.mp3     heldere belslag met een glinsterende regen    (~2,2 s)
#   extension/sounds/kerst-klokje.mp3   speeldoos-arpeggio met een akkoord van klokjes (~3,6 s)
#   extension/sounds/zomer-golf.mp3     brekende golven op het strand                 (~3,6 s)
#   extension/sounds/zomer-meeuw.mp3    een meeuw die drie keer roept                 (~1,8 s)
#   extension/sounds/zomer-plons.mp3    een plons met opstijgende luchtbelletjes      (~1,6 s)
#   extension/sounds/zomer-pan.mp3      steelpan-arpeggio                             (~3,2 s)
#
# Gebruik (vanuit de hoofdmap; Python 3 + numpy 2.x en ffmpeg met libmp3lame):
#   python3 scripts/bouw-seizoenen.py               # alle acht
#   python3 scripts/bouw-seizoenen.py bel meeuw     # alleen de genoemde (korte namen: bel wind ding klokje golf meeuw plons pan)
# Reproduceerbaar: vaste seeds, dus dezelfde numpy-versie geeft dezelfde mp3's.

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
fft_filter, lp_zwaai, galm = H.fft_filter, H.lp_zwaai, H.galm
stereo_ruis, trage_ruis, aanzet_uitsterf, zaagtand = H.stereo_ruis, H.trage_ruis, H.aanzet_uitsterf, H.zaagtand


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pan_gewichten(p):
    """p in -1..1 naar (links, rechts) met gelijk vermogen."""
    return np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)


def plaats(uit, t0, geluid, pan=0.0, amp=1.0):
    """Telt een mono-geluid op tijd t0 (s) in een (2, n)-reeks."""
    i = int(round(t0 * SR))
    if i >= uit.shape[1] or i < 0:
        return
    j = min(uit.shape[1], i + len(geluid))
    gl, gr = pan_gewichten(pan)
    uit[0, i:j] += amp * gl * geluid[:j - i]
    uit[1, i:j] += amp * gr * geluid[:j - i]


def klokje(f, dur, rng, deeltonen=((1.0, 1.0, 1.0), (2.76, 0.45, 0.55), (5.4, 0.22, 0.30), (8.93, 0.10, 0.18))):
    """Klokje/handbel: inharmonische deeltonen (verhouding, amplitude, relatieve uitsterftijd)."""
    t = tijdas(int(dur * SR))
    uit = np.zeros(len(t))
    for r, a, tau in deeltonen:
        if f * r > 12000:
            continue
        uit += a * np.exp(-t / (dur * 0.28 * tau)) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6.28))
    return uit * smoothstep(t / 0.0012)


# --------------------------------------------------------------------------------------------------
# Kerst
# --------------------------------------------------------------------------------------------------

def kerst_bel():
    """Sleebellen: een rij schuddingen (kleine gebundelde belletjes: veel hoge, snel uitstervende metaalachtige
    deeltonen plus een tikje bandruis), eerst zacht en traag, dan steeds sneller en luider, daarna uitstervend."""
    rng = np.random.default_rng(2041)
    dur = 2.2
    n = int(round(dur * SR))
    uit = np.zeros((2, n))
    t = 0.05
    while t < 1.75:
        q = t / 1.75
        gap = 0.17 - 0.095 * q + rng.uniform(-0.012, 0.012)
        # een schudding = 3-5 belletjes die vlak na elkaar klinken
        for k in range(rng.integers(3, 6)):
            f = rng.choice([2350, 2780, 3150, 3620, 4100, 4700]) * rng.uniform(0.985, 1.015)
            dl = int(0.16 * SR)
            tt = tijdas(dl)
            bel = klokje(f, 0.16, rng, deeltonen=((1.0, 1.0, 1.0), (1.51, 0.5, 0.7), (2.33, 0.45, 0.55), (3.17, 0.3, 0.4)))
            ruis = fft_filter(rng.standard_normal(dl), bp(4500, 9500)) * np.exp(-tt / 0.012) * 0.25
            plaats(uit, t + k * rng.uniform(0.006, 0.02), bel + ruis, pan=rng.uniform(-0.6, 0.6),
                   amp=(0.25 + 0.75 * q ** 1.2) * rng.uniform(0.6, 1.0))
        t += max(0.06, gap)
    uit = fft_filter(uit, hp(1200, 2), piek(4200, 0.6, 3.0))
    uit = galm(uit, rng, rt60=0.6, nat=0.12, voorvertraging=0.01, demping_hz=9000)[:, :n]
    return aanzet_uitsterf(uit, 0.01, 0.35)


def kerst_wind():
    """Koude wind: bruinige ruis door een bandfilter dat in vlagen op- en neergaat, met twee dunne fluittoontjes
    (rond 700 en 1100 Hz) die zacht meezweven en fijn, hoog sneeuwgeruis erbovenop. De vlagen zwellen tot ~2 s."""
    rng = np.random.default_rng(2042)
    dur = 3.4
    n = int(round(dur * SR))
    t = tijdas(n)
    basis = stereo_ruis(rng, n, 0.25)
    fc_t = kontour(t, [(0.0, 380.0), (1.1, 1100.0), (2.2, 1600.0), (3.4, 420.0)])
    fc_t = fc_t * (1 + 0.15 * trage_ruis(rng, n, 1.5))
    wind = lp_zwaai(fft_filter(basis, hp(120, 2)), np.clip(fc_t, 200, 2600))
    wind /= np.std(wind)
    vlaag = 0.35 + 0.65 * smoothstep(t / 1.9) * (1 - smoothstep((t - 2.3) / 1.0))
    vlaag = vlaag * np.clip(1 + 0.35 * trage_ruis(rng, n, 2.2), 0.3, None)
    wind = wind * vlaag * 0.5
    # fluittoon
    fluit = np.zeros(n)
    for f0, a in [(720.0, 0.05), (1130.0, 0.035)]:
        f = f0 * (1 + 0.09 * trage_ruis(rng, n, 0.8))
        fluit += a * np.sin(2 * np.pi * np.cumsum(f) / SR)
    fluit *= vlaag ** 2
    sneeuw = fft_filter(stereo_ruis(rng, n, 0.1), bp(5000, 11000)) * 0.03 * np.clip(vlaag, 0.2, None)
    uit = wind + np.stack([fluit, np.roll(fluit, 700)]) + sneeuw
    uit = galm(uit, rng, rt60=1.1, nat=0.18, voorvertraging=0.02, demping_hz=3500)[:, :n]
    return aanzet_uitsterf(uit, 0.3, 0.8)


def kerst_ding():
    """Een heldere belslag (C6 met inharmonische deeltonen) gevolgd door een glinsterende regen van hoge klokjes
    uit de pentatonische schaal, die steeds zachter en ijler wordt, in een grote, heldere ruimte."""
    rng = np.random.default_rng(2043)
    dur = 2.2
    n = int(round(dur * SR))
    uit = np.zeros((2, n))
    plaats(uit, 0.0, klokje(midi(84), 1.8, rng), amp=1.0)
    plaats(uit, 0.0, klokje(midi(72), 1.8, rng), amp=0.6)
    plaats(uit, 0.0, fft_filter(rng.standard_normal(int(0.02 * SR)), bp(2000, 9000)) * 0.5)
    schaal = [79, 81, 84, 86, 88, 91, 93, 96]
    t = 0.07
    k = 0
    while t < 1.5:
        q = t / 1.5
        plaats(uit, t, klokje(midi(rng.choice(schaal)), 0.7, rng), pan=rng.uniform(-0.8, 0.8), amp=0.55 * (1 - q) ** 1.3 + 0.03)
        t += rng.uniform(0.035, 0.075) * (1 + 1.5 * q)
        k += 1
    uit = galm(uit, rng, rt60=1.6, nat=0.30, voorvertraging=0.012, demping_hz=9000)[:, :n]
    return aanzet_uitsterf(uit, 0.0005, 0.45)


def speeldoos_noot(f, dur, rng):
    t = tijdas(int(dur * SR))
    uit = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.0 * t + 0.4) * np.exp(-t / 0.08)
           + 0.2 * np.sin(2 * np.pi * f * 5.04 * t) * np.exp(-t / 0.05)) * np.exp(-t / (dur * 0.30))
    return uit * smoothstep(t / 0.001)


def kerst_klokje():
    """Een speeldoos die een stijgend arpeggio speelt (C-dur met grote septiem), daarna een uitrinkelend akkoord van
    klokjes (C6, E6, G6), met een stuk lichte galm."""
    rng = np.random.default_rng(2044)
    dur = 3.6
    n = int(round(dur * SR))
    uit = np.zeros((2, n))
    noten = [72, 76, 79, 83, 84, 88, 91, 95, 96]
    for i, m in enumerate(noten):
        plaats(uit, 0.02 + i * 0.115, speeldoos_noot(midi(m), 0.9, rng), pan=-0.5 + 1.0 * i / (len(noten) - 1), amp=0.6 + 0.04 * i)
    t0 = 0.02 + len(noten) * 0.115 + 0.02
    for m, p in [(84, -0.3), (88, 0.0), (91, 0.3), (96, 0.1)]:
        plaats(uit, t0, klokje(midi(m), 2.4, rng), pan=p, amp=0.55)
    uit = galm(uit, rng, rt60=1.8, nat=0.28, voorvertraging=0.012, demping_hz=8000)[:, :n]
    return aanzet_uitsterf(uit, 0.0005, 0.7)


# --------------------------------------------------------------------------------------------------
# Zomer
# --------------------------------------------------------------------------------------------------

def zomer_golf():
    """Golven op het strand: een golf rolt aan (ruis die opzwelt en helderder wordt), breekt (piek met schuim: hoge
    ruis) en trekt zich terug (dofer, sissend). Twee golven over elkaar, in stereo verschoven."""
    rng = np.random.default_rng(2051)
    dur = 3.6
    n = int(round(dur * SR))
    t = tijdas(n)

    def golf(t0, lengte, amp, pan):
        u = np.clip((t - t0) / lengte, 0, 1)
        env = (smoothstep(u / 0.42) ** 1.5) * (1 - smoothstep((u - 0.42) / 0.58)) ** 1.2
        helder = 500 + 5500 * np.exp(-0.5 * ((u - 0.45) / 0.18) ** 2)
        ruis = stereo_ruis(rng, n, 0.2)
        ruis = lp_zwaai(ruis, np.clip(helder, 300, 7000))
        ruis /= np.std(ruis)
        schuim = fft_filter(stereo_ruis(rng, n, 0.2), hp(3500, 2), lp(10000, 1)) * (smoothstep((u - 0.38) / 0.1) * (1 - smoothstep((u - 0.5) / 0.5))) * 0.35
        gl, gr = pan_gewichten(pan)
        return amp * env * (ruis + schuim * 1.2) * np.array([[gl], [gr]])

    uit = golf(0.0, 2.3, 0.5, -0.3) + golf(1.3, 2.3, 0.6, 0.3)
    uit = fft_filter(uit, hp(90, 2))
    uit = galm(uit, rng, rt60=0.7, nat=0.12, voorvertraging=0.02, demping_hz=5000)[:, :n]
    return aanzet_uitsterf(uit, 0.15, 0.9)


def zomer_meeuw():
    """Een meeuw: drie roepen ('kjaa-kjaa-kjaaaa'), elk een neuzige toon met een snelle stijging en dalende afloop
    (1,3-2,3 kHz), rijk aan boventonen met formanten rond 1,9 en 3,6 kHz, wat ruis en vibrato, buiten in de open lucht."""
    rng = np.random.default_rng(2052)
    dur = 1.8
    n = int(round(dur * SR))
    t = tijdas(n)
    uit = np.zeros(n)
    for t0, len_, top in [(0.05, 0.30, 2200), (0.50, 0.34, 2350), (0.98, 0.70, 2300)]:
        u = np.clip((t - t0) / len_, 0, 1)
        env = smoothstep(u / 0.12) * (1 - smoothstep((u - 0.55) / 0.45)) * ((t >= t0) & (t <= t0 + len_))
        f = kontour(u, [(0.0, 1300.0), (0.30, top), (1.0, 1350.0)])
        f = f * (1 + 0.025 * np.sin(2 * np.pi * 26 * t) * u + 0.01 * trage_ruis(rng, n, 30))  # ruw trillend
        fase = 2 * np.pi * np.cumsum(f) / SR
        toon = np.zeros(n)
        for k in range(1, 12):
            fk = k * f
            form = 1 + 2.2 * np.exp(-0.5 * (np.log2(fk / 1900) / 0.45) ** 2) + 1.4 * np.exp(-0.5 * (np.log2(fk / 3600) / 0.4) ** 2)
            toon += np.clip((10000 - fk) / 800, 0, 1) * form * np.sin(k * fase) / k ** 0.8
        toon += 0.6 * np.sin(fase * 0.5) * (1 - u)
        adem = fft_filter(rng.standard_normal(n), bp(1500, 6000)) * 0.08
        uit += env * (toon + adem * (toon != 0))
    uit = np.stack([uit * 0.9, np.roll(uit, 40) * 0.8])
    uit = galm(uit, rng, rt60=0.9, nat=0.16, voorvertraging=0.035, demping_hz=7000)[:, :n]
    return aanzet_uitsterf(uit, 0.004, 0.4)


def zomer_plons():
    """Een plons in het water: een dof klapje, een brede ruisstoot (opspattend water) en een wolkje luchtbelletjes
    (korte sinussen waarvan de toon snel stijgt, steeds minder), kort en helder."""
    rng = np.random.default_rng(2053)
    dur = 1.6
    n = int(round(dur * SR))
    t = tijdas(n)
    plof = np.sin(2 * np.pi * kontour(t, [(0.0, 200.0), (0.25, 70.0)]) * t) * np.exp(-t / 0.07) * 0.9
    spat = fft_filter(stereo_ruis(rng, n, 0.3), bp(600, 9000)) * (smoothstep(t / 0.004) * np.exp(-t / 0.16))
    uit = np.stack([plof, plof]) + spat * 0.6
    for i in range(34):
        t0 = 0.03 + rng.exponential(0.18) * (1 + i * 0.03)
        if t0 > 1.3:
            continue
        r = rng.uniform(0.6, 2.2)
        f0 = 3200 / r * rng.uniform(0.8, 1.2)
        d = int(0.09 * SR)
        tt = tijdas(d)
        f = f0 * (1 + 2.2 * tt / 0.09 * 0.4)
        bel = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.03) * smoothstep(tt / 0.002)
        plaats(uit, t0, bel, pan=rng.uniform(-0.7, 0.7), amp=0.35 * np.exp(-t0 / 0.6))
    uit = galm(uit, rng, rt60=0.5, nat=0.12, voorvertraging=0.01, demping_hz=7000)[:, :n]
    return aanzet_uitsterf(uit, 0.0005, 0.4)


def pan_noot(f, dur, rng):
    """Steelpan: een korte pitch-dip bij de aanslag, grondtoon met octaaf en twaalfde (de typische obertonen
    1 : 2 : 3), uitdoving ~0,7 s, een tik van het stokje."""
    t = tijdas(int(dur * SR))
    fz = f * (1 + 0.012 * np.exp(-t / 0.02))
    fase = 2 * np.pi * np.cumsum(fz) / SR
    toon = (np.sin(fase) * 1.0 * np.exp(-t / 0.55) + np.sin(2 * fase + 0.3) * 0.55 * np.exp(-t / 0.35)
            + np.sin(3 * fase + 0.7) * 0.28 * np.exp(-t / 0.22) + np.sin(4.02 * fase) * 0.10 * np.exp(-t / 0.10))
    tik = fft_filter(rng.standard_normal(len(t)), bp(1500, 6000)) * np.exp(-t / 0.006) * 0.35
    return (toon + tik) * smoothstep(t / 0.0008) * (1 + 0.04 * np.sin(2 * np.pi * 5.5 * t))


def zomer_pan():
    """Steelpan-arpeggio in C-dur-pentatoniek met een syncope (zomers en luchtig) en een slotakkoord."""
    rng = np.random.default_rng(2054)
    dur = 3.2
    n = int(round(dur * SR))
    uit = np.zeros((2, n))
    stap = 60 / 140 / 2  # achtste noten bij 140 bpm
    patroon = [(0, 76), (1, 79), (2, 81), (3, 84), (4.5, 81), (5, 79), (6, 76), (7, 79), (8, 84)]
    for i, (k, m) in enumerate(patroon):
        plaats(uit, 0.02 + k * stap, pan_noot(midi(m), 1.1, rng), pan=-0.4 + 0.8 * (i % 3) / 2, amp=0.8)
    t0 = 0.02 + 8 * stap
    for m, p in [(72, -0.3), (79, 0.0), (84, 0.3), (88, 0.1)]:
        plaats(uit, t0, pan_noot(midi(m), 1.9, rng), pan=p, amp=0.55)
    uit = galm(uit, rng, rt60=1.2, nat=0.18, voorvertraging=0.012, demping_hz=7500)[:, :n]
    return aanzet_uitsterf(uit, 0.0005, 0.6)


GELUIDEN = {
    'bel': ('kerst-bel.mp3', kerst_bel),
    'wind': ('kerst-wind.mp3', kerst_wind),
    'ding': ('kerst-ding.mp3', kerst_ding),
    'klokje': ('kerst-klokje.mp3', kerst_klokje),
    'golf': ('zomer-golf.mp3', zomer_golf),
    'meeuw': ('zomer-meeuw.mp3', zomer_meeuw),
    'plons': ('zomer-plons.mp3', zomer_plons),
    'pan': ('zomer-pan.mp3', zomer_pan),
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
