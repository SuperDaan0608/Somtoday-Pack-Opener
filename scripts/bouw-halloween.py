#!/usr/bin/env python3
# Maakt de vier geluidseffecten van het Halloween-thema, volledig procedureel (geen opnames, geen netwerk):
#   extension/sounds/halloween-donder.mp3   donderslag      (~2,8 s)
#   extension/sounds/halloween-kraak.mp3    krakende deur   (~1,6 s)
#   extension/sounds/halloween-klok.mp3     kerkklokslag    (~4,0 s)
#   extension/sounds/halloween-huil.mp3     spookachtig gehuil (~2,6 s)
#
# Gebruik (vanuit de hoofdmap; Python 3 + numpy 2.x en ffmpeg met libmp3lame zijn nodig, scipy niet):
#   python3 scripts/bouw-halloween.py            # alle vier
#   python3 scripts/bouw-halloween.py klok huil  # alleen de genoemde
#
# Reproduceerbaar: elk geluid heeft een vaste seed (numpy Generator/PCG64), ffmpeg draait met bitexact-vlaggen
# zonder metadata, dus dezelfde numpy-versie levert byte-voor-byte dezelfde mp3's.
#
# Alle filters zijn zelf geïmplementeerd: nulfase-filters in het frequentiedomein (FFT, Butterworth-achtige
# amplitudekrommen), een tijdvariërende laagdoorlaat (bank van vaste filters waartussen wordt doorgemengd) en
# galm als convolutie (via FFT) met een exponentieel uitstervende ruis-impulsresponsie.
#
# Uitvoer: 44,1 kHz stereo, mp3 128 kbit/s, piek op -1 dBFS (gemeten NA het coderen: de mp3-encoder kan een
# fractie boven de invoerpiek uitkomen, dus de winst wordt zo bijgesteld dat de gedecodeerde piek op -1 dB landt).
# Alle geluiden beginnen en eindigen op nul (korte fades), zonder DC-offset.

import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
DOEL_PIEK_DB = -1.0
ROOT = Path(__file__).resolve().parent.parent
UIT = ROOT / 'extension' / 'sounds'


# --------------------------------------------------------------------------------------------------
# Bouwstenen
# --------------------------------------------------------------------------------------------------

def tijdas(n):
    return np.arange(n) / SR


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def kontour(t, punten):
    """Vloeiende lijn door (tijd, waarde)-punten: smoothstep tussen opeenvolgende punten (helling nul op elk punt;
    gebruik dus alleen punten bij keerpunten)."""
    tp = np.array([p[0] for p in punten], dtype=float)
    vp = np.array([p[1] for p in punten], dtype=float)
    i = np.clip(np.searchsorted(tp, t, side='right') - 1, 0, len(tp) - 2)
    u = smoothstep((t - tp[i]) / (tp[i + 1] - tp[i]))
    return vp[i] * (1 - u) + vp[i + 1] * u


# Versterkingskrommen als functie van de frequentie (Hz), te combineren in fft_filter().
def lp(fc, orde=2):
    return lambda f: 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * orde))


def hp(fc, orde=2):
    def g(f):
        r = (f / fc) ** orde
        return r / np.sqrt(1.0 + r * r)
    return g


def bp(lo, hi, orde=2):
    a, b = hp(lo, orde), lp(hi, orde)
    return lambda f: a(f) * b(f)


def piek(fc, breedte_oct, winst_db):
    """Klokvormige verhoging/verlaging rond fc (gauss op een logaritmische frequentie-as)."""
    g = 10 ** (winst_db / 20) - 1
    return lambda f: 1 + g * np.exp(-0.5 * (np.log2(np.maximum(f, 1e-3) / fc) / breedte_oct) ** 2)


def fft_filter(x, *krommen):
    """Nulfase-filter over de laatste as, met nullen aangevuld zodat de staart niet om de rand heen slaat."""
    n = x.shape[-1]
    nfft = 1 << int(np.ceil(np.log2(n + SR // 2)))
    f = np.fft.rfftfreq(nfft, 1 / SR)
    g = np.ones_like(f)
    for k in krommen:
        g = g * k(f)
    return np.fft.irfft(np.fft.rfft(x, nfft) * g, nfft)[..., :n]


def lp_zwaai(x, fc_t, nb=9, orde=2):
    """Tijdvariërende laagdoorlaat: nb vaste laagdoorlaten (geometrisch verdeeld tussen de laagste en hoogste
    grensfrequentie in fc_t), waartussen per monster lineair wordt doorgemengd. x: (kanalen, n)."""
    lo, hi = float(fc_t.min()), float(fc_t.max())
    grenzen = np.geomspace(lo, hi, nb)
    bank = np.stack([fft_filter(x, lp(c, orde)) for c in grenzen])
    pos = np.log(fc_t / lo) / np.log(hi / lo) * (nb - 1)
    i0 = np.clip(np.floor(pos).astype(int), 0, nb - 2)
    w = pos - i0
    idx = np.arange(x.shape[-1])
    uit = np.empty_like(x)
    for c in range(x.shape[0]):
        uit[c] = bank[i0, c, idx] * (1 - w) + bank[i0 + 1, c, idx] * w
    return uit


def convolutie(x, h):
    n = len(x) + len(h) - 1
    nfft = 1 << int(np.ceil(np.log2(n)))
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(h, nfft), nfft)[:n]


def witte_ruis(rng, n):
    return rng.standard_normal(n)


def stereo_ruis(rng, n, corr):
    """Twee ruiskanalen met (ongeveer) correlatie corr: een gemeenschappelijk deel plus een eigen deel per kant."""
    gem = rng.standard_normal(n)
    return np.stack([np.sqrt(corr) * gem + np.sqrt(1 - corr) * rng.standard_normal(n) for _ in range(2)])


def trage_ruis(rng, n, fc):
    """Ruis met een bandbreedte van ~fc Hz, genormaliseerd naar standaardafwijking 1."""
    x = fft_filter(rng.standard_normal(n), lp(fc, 2))
    return x / np.std(x)


def galm(stereo, rng, rt60, nat, voorvertraging, demping_hz):
    """Voegt galm toe: de uitvoer is droog + nat * (convolutie met een eigen, exponentieel uitstervende ruis-
    impulsresponsie per kanaal). De twee verschillende responsies geven vanzelf stereobreedte. De responsie krijgt
    energie 1, dus `nat` is de verhouding in energie tussen galm en droog signaal. Geeft een langere reeks terug
    (met staart); knip die zelf op lengte."""
    n = stereo.shape[1]
    lengte = int((rt60 * 1.1 + voorvertraging) * SR)
    t = tijdas(lengte)
    tau = rt60 / np.log(1000.0)  # amplitude -60 dB na rt60
    uit = np.zeros((2, n + lengte))
    uit[:, :n] += stereo
    for c in range(2):
        ir = rng.standard_normal(lengte) * np.exp(-np.maximum(t - voorvertraging, 0) / tau)
        ir = fft_filter(ir, lp(demping_hz, 1), hp(60, 1))
        ir[t < voorvertraging] = 0.0
        ir *= smoothstep((t - voorvertraging) / 0.004)  # geen klik aan het begin van de responsie
        ir /= np.sqrt(np.sum(ir ** 2))
        uit[c, :n + lengte - 1] += nat * convolutie(stereo[c], ir)
    return uit


def zaagtand(f_t, hoogste=9000.0):
    """Bandbegrensde zaagtand met een tijdvariërende frequentie f_t (Hz per monster), via optelling van
    harmonischen (1/k) tot ~9 kHz; zo geen aliasing en geen kliks bij het glijden."""
    fase = 2 * np.pi * np.cumsum(f_t) / SR
    uit = np.zeros_like(f_t)
    for k in range(1, int(hoogste / f_t.min()) + 1):
        masker = np.clip((hoogste - k * f_t) / 600.0, 0.0, 1.0)
        uit += masker * np.sin(k * fase) / k
    return uit


def aanzet_uitsterf(x, aanzet, uitsterf):
    """Cosinusfade aan begin (aanzet s) en einde (uitsterf s); x: (..., n)."""
    n = x.shape[-1]
    t = tijdas(n)
    env = np.ones(n)
    if aanzet > 0:
        env *= np.sin(0.5 * np.pi * np.clip(t / aanzet, 0, 1)) ** 2
    if uitsterf > 0:
        env *= np.cos(0.5 * np.pi * np.clip((t - (n / SR - uitsterf)) / uitsterf, 0, 1)) ** 2
    return x * env


# --------------------------------------------------------------------------------------------------
# De vier geluiden. Elk geeft een (2, n)-array terug (links/rechts), nog niet genormaliseerd.
# --------------------------------------------------------------------------------------------------

def donder():
    """Donderslag: een krak van een paar kletterende pieken, direct gevolgd door een lang wegrommelend
    breedbandig gerommel (donkerder wordend) met vier secundaire rommelingen. Een deel van de laagste band wordt
    verzadigd en terug naar boven gefilterd, zodat er ook energie tussen 200 en 2000 Hz zit voor laptopspeakers."""
    rng = np.random.default_rng(1031)
    dur = 2.8
    n = int(round(dur * SR))
    t = tijdas(n)

    def stoot(t0, amp, tau, aanzet=0.0007):
        d = np.maximum(t - t0, 0.0)
        return amp * np.where(t >= t0, np.exp(-d / tau), 0.0) * smoothstep(d / aanzet)

    # 1. Het krak: een kletterende reeks korte, steeds zwakkere ruisstoten (de bochtige bliksemlijn) + een mid-klap.
    krak_env = sum(stoot(*p) for p in [(0.000, 1.00, 0.010), (0.012, 0.65, 0.008), (0.026, 0.50, 0.012),
                                       (0.047, 0.35, 0.015), (0.075, 0.22, 0.020), (0.120, 0.12, 0.030)])
    krak_hi = fft_filter(stereo_ruis(rng, n, 0.7), hp(900), lp(9000)) * krak_env
    klap = fft_filter(stereo_ruis(rng, n, 0.7), bp(250, 2500)) * stoot(0.0, 1.0, 0.09, 0.001)

    # 2. De rommel: bruinige ruis (-6 dB/octaaf boven ~200 Hz) die tijdens het wegsterven donkerder wordt.
    basis = stereo_ruis(rng, n, 0.45)
    basis = fft_filter(basis, lp(260, 1), hp(55, 3))
    fc_t = 1900.0 * (0.14 ** (np.clip(t / 2.5, 0, 1) ** 0.8))
    rommel = lp_zwaai(basis, fc_t)
    rommel /= np.std(rommel)

    def bult(t0, amp, aanzet, tau):
        d = np.maximum(t - t0, 0.0)
        return amp * np.where(t >= t0, (1 - np.exp(-d / aanzet)) * np.exp(-d / tau), 0.0)

    env = bult(0.02, 1.00, 0.045, 0.62)
    for t0, amp, tau in [(0.46, 0.55, 0.30), (0.93, 0.50, 0.32), (1.42, 0.38, 0.36), (1.92, 0.26, 0.38)]:
        env = env + bult(t0, amp, 0.08, tau)
    env *= np.clip(1.0 + 0.45 * trage_ruis(rng, n, 7.0), 0.15, None)  # rollende, golvende structuur
    rommel = rommel * env * 0.34

    # 3. Verzadigde laagste band -> harmonischen tussen 200 en 1600 Hz (hoorbaar op kleine speakers).
    laag = fft_filter(rommel, lp(220, 2))
    zacht = np.tanh(5.0 * laag / np.max(np.abs(laag)))
    harm = fft_filter(zacht, bp(220, 1600)) * 0.26 * (np.std(rommel) / np.std(zacht))

    # 4. Aparte mid-laag (200-2000 Hz) die iets sneller uitsterft dan de rest.
    mid = fft_filter(stereo_ruis(rng, n, 0.4), bp(200, 2000)) * (env ** 1.4) * 0.13

    uit = krak_hi * 1.9 + klap * 1.2 + rommel + harm + mid
    # trage links-rechts-beweging van het onweer (gelijkmatig, +-2,5 dB)
    pan = 0.15 * trage_ruis(rng, n, 1.2)
    uit = uit * np.stack([np.clip(1 - pan, 0.5, 1.5), np.clip(1 + pan, 0.5, 1.5)])
    uit = fft_filter(uit, hp(50, 2))
    # zachte begrenzer: drukt de kraktoppen in zodat de rommel (waar het volume in zit) harder kan
    uit = np.tanh(2.6 * uit / np.max(np.abs(uit)))
    return aanzet_uitsterf(uit, 0.0005, 0.5)


def kraak():
    """Krakende deur/ketel: twee langzaam glijdende, schurende zaagtandtonen (300-900 Hz) met FM-jitter en
    stick-slip (korte, scherpe pulsjes + kleine toonhoogtesprongen bij elke 'slip'), een kort klikspoor en een
    zacht ruisbed, door een lichte resonantie en een kleine ruimte."""
    rng = np.random.default_rng(1032)
    dur = 1.6
    n = int(round(dur * SR))
    t = tijdas(n)

    def stem(f_punten, rate0, t_aan, t_uit, aanzet, uitsterf, amp):
        f0 = kontour(t, f_punten)
        pn = (f0 - 300) / 600  # 0..1, hoe hoog de toon zit
        # stick-slip: fase loopt door met een wisselende snelheid; elke hele eenheid is een 'slip'
        rate = rate0 * (0.75 + 0.7 * pn) * (1 + 0.30 * trage_ruis(rng, n, 5.0))
        sfase = np.cumsum(rate) / SR + rng.random()
        k = np.floor(sfase).astype(int)
        frac = sfase - k
        amp_k = 0.5 + 0.5 * rng.random(k.max() + 2)
        a_k = amp_k[k]
        puls = (0.32 + 0.68 * np.exp(-frac * 4.5)) * a_k
        puls = fft_filter(puls, lp(2500, 1))  # de sprong in de amplitude blijft scherp maar knalt niet
        kick = 1 + 0.045 * np.exp(-frac * 9.0) * a_k  # toon schiet bij elke slip even omhoog
        jitter = 1 + 0.012 * trage_ruis(rng, n, 28.0) + 0.004 * trage_ruis(rng, n, 180.0)
        f_t = f0 * kick * jitter
        toon = zaagtand(f_t)
        # schurend: de amplitude wordt door bandruis (100-600 Hz) ruw gemaakt
        ruwheid = fft_filter(rng.standard_normal(n), bp(100, 600))
        schuur = np.clip(0.85 + 0.30 * ruwheid / np.std(ruwheid), 0.25, 1.8)
        venster = smoothstep((t - t_aan) / aanzet) * (1 - smoothstep((t - (t_uit - uitsterf)) / uitsterf))
        venster *= 0.75 + 0.25 * pn
        slips = np.nonzero(np.diff(k) > 0)[0] + 1
        return amp * toon * puls * schuur * venster / 1.7, slips, a_k, venster

    s1, slips1, a1, v1 = stem([(0.0, 310), (0.78, 850), (1.6, 520)], 20.0, 0.0, 1.5, 0.04, 0.22, 1.0)
    s2, slips2, a2, v2 = stem([(0.0, 470), (0.55, 520), (1.6, 900)], 27.0, 0.22, 1.45, 0.09, 0.22, 0.6)

    # zacht stereobeeld: stem 1 iets naar links, stem 2 iets naar rechts
    L = 0.80 * s1 + 0.45 * s2
    R = 0.45 * s1 + 0.80 * s2
    toonmix = np.stack([L, R])
    toonmix = fft_filter(toonmix, hp(150, 2), piek(1500, 0.7, 5.0))

    # korte stick-slip-pulsjes: kleine klikjes bij een deel van de slips
    kernen = []
    for _ in range(3):
        kt = tijdas(int(0.008 * SR))
        kern = fft_filter(rng.standard_normal(len(kt)), bp(1300, 6000)) * np.exp(-kt / 0.0013)
        kernen.append(kern / np.sqrt(np.sum(kern ** 2)))
    klik = np.zeros((2, n))
    for slips, a_k, v in [(slips1, a1, v1), (slips2, a2, v2)]:
        for s in slips:
            if rng.random() < 0.55 and v[s] > 0.05:
                kern = kernen[rng.integers(3)]
                sterkte = (0.25 + 0.75 * rng.random() ** 2) * a_k[s] * v[s]
                kant = rng.random()
                for c, g in enumerate((1 - 0.4 * kant, 0.6 + 0.4 * kant)):
                    end = min(n, s + len(kern))
                    klik[c, s:end] += 0.30 * g * sterkte * kern[:end - s]

    # ruisbed die de stemmen volgt
    volg = fft_filter(0.5 * (v1 + v2), lp(12, 1)) * 0.9 + 0.1 * smoothstep(t / 0.1) * (1 - smoothstep((t - 1.4) / 0.2))
    bed = fft_filter(stereo_ruis(rng, n, 0.3), bp(500, 5000)) * np.clip(volg, 0, None) * 0.045

    droog = toonmix + klik + bed
    uit = galm(droog, rng, rt60=0.30, nat=0.10, voorvertraging=0.004, demping_hz=4500)[:, :n]
    return aanzet_uitsterf(uit, 0.012, 0.10)


def klok():
    """Eén lage kerkklokslag: additieve synthese met inharmonische deeltonen rond 196 Hz (elk met een eigen
    exponentiële uitdoving en een iets afgestemde tweeling voor het zweven), een harmerje-tikje bij de aanslag en
    galm uit een zelfgemaakte ruis-impulsresponsie."""
    rng = np.random.default_rng(1033)
    dur = 4.0
    n = int(round(dur * SR))
    t = tijdas(n)
    f0 = 196.0

    # (verhouding, amplitude, tijdconstante van de uitdoving in s): hoge deeltonen sterven sneller
    deeltonen = [(0.5, 0.50, 2.7), (1.0, 1.00, 2.3), (1.2, 0.75, 1.8), (1.5, 0.45, 1.5),
                 (2.0, 0.55, 1.25), (2.5, 0.28, 0.95), (3.0, 0.26, 0.70), (4.1, 0.14, 0.42)]
    L = np.zeros(n)
    R = np.zeros(n)
    for ratio, amp, tau in deeltonen:
        ratio *= 1 + rng.uniform(-0.003, 0.003)
        pan = rng.uniform(-0.22, 0.22)
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        aanzet = smoothstep(t / 0.0015)
        # hoofdtoon + licht verstemde tweeling (zweving van 0,4-1,3 Hz) die iets sneller uitsterft
        for f_off, a_rel, tau_rel in [(0.0, 1.0, 1.0), (rng.choice([-1, 1]) * rng.uniform(0.4, 1.3) * max(ratio, 1), 0.6, 0.9)]:
            s = amp * a_rel * np.exp(-t / (tau * tau_rel)) * np.sin(2 * np.pi * (f0 * ratio + f_off) * t + rng.uniform(0, 2 * np.pi))
            s *= aanzet
            L += gl * s
            R += gr * s

    # harmerje: korte, heldere ruistik + een paar hoge, snel uitstervende metaalachtige deeltonen + doffe plof
    tik = fft_filter(stereo_ruis(rng, n, 0.6), bp(1500, 7000)) * 0.30 * np.exp(-t / 0.0035)
    for fh, ah, th in [(1930.0, 0.060, 0.030), (2760.0, 0.050, 0.022), (3930.0, 0.040, 0.015)]:
        tik = tik + ah * np.exp(-t / th) * np.sin(2 * np.pi * fh * t + rng.uniform(0, 6.28))
    tik = tik + 0.25 * np.exp(-t / 0.05) * np.sin(2 * np.pi * 110.0 * t)
    tik = tik * smoothstep(t / 0.0004)
    droog = np.stack([L, R]) + tik

    uit = galm(droog, rng, rt60=1.9, nat=0.35, voorvertraging=0.014, demping_hz=6000)[:, :n]
    return aanzet_uitsterf(uit, 0.0003, 0.7)


def huil():
    """Spookachtig/wolfsachtig huilen: een bijna zuivere toon die van ~300 naar ~620 Hz glijdt en weer zakt, met
    groeiend vibrato (5 -> 6 Hz), een paar boventonen waarvan de sterkte door een formant rond 1 kHz wordt
    bepaald (dus de klankkleur verandert tijdens de glijbaan), wat ademruis in dezelfde band, zachte aanzet,
    uitsterven en lichte galm. Twee licht verstemde stemmen links/rechts."""
    rng = np.random.default_rng(1034)
    dur = 2.6
    n = int(round(dur * SR))
    t = tijdas(n)

    f_basis = kontour(t, [(0.0, 300.0), (1.05, 620.0), (2.3, 320.0)])
    f_basis *= 1 + 0.010 * trage_ruis(rng, n, 2.0)  # trage drift
    vib_diepte = 0.004 + 0.034 * smoothstep((t - 0.2) / 1.4)  # tot ~ +-60 cent
    vib_snelheid = 5.0 + 1.0 * smoothstep(t / 1.8)

    aanzet_env = smoothstep(t / 0.45)
    uitsterf_env = 1 - smoothstep((t - 1.45) / 0.75)
    pn = (f_basis - 300) / 320
    env = aanzet_env * uitsterf_env * (0.78 + 0.22 * pn)

    def stem(detune, vib_fase, snelheid_fac):
        vfase = 2 * np.pi * np.cumsum(vib_snelheid * snelheid_fac) / SR + vib_fase
        f = f_basis * detune * (1 + vib_diepte * np.sin(vfase) + 0.0015 * trage_ruis(rng, n, 40.0))
        fase = 2 * np.pi * np.cumsum(f) / SR
        uit = np.zeros(n)
        for k, a in enumerate([1.0, 0.38, 0.16, 0.07, 0.03, 0.015], start=1):
            fk = k * f
            formant = 1 + 1.6 * np.exp(-0.5 * (np.log2(fk / 1000.0) / 0.40) ** 2)  # ~ +8 dB rond 1 kHz
            uit += a * formant * np.clip((9000 - fk) / 600, 0, 1) * np.sin(k * fase)
        return uit * (1 + 0.06 * np.sin(vfase + 0.6)), vfase

    s1, vf1 = stem(1.0, 0.0, 1.0)
    s2, vf2 = stem(1.0025, 1.1, 1.03)  # +4 cent: een langzaam zweven, geen duidelijk tremolo in mono
    L = (0.95 * s1 + 0.20 * s2) * env
    R = (0.60 * s1 + 0.40 * s2) * env

    # ademruis: bandruis rond het formant, meer aan het begin en einde, meebewegend met het vibrato
    adem = fft_filter(stereo_ruis(rng, n, 0.25), bp(450, 3000), piek(1000, 0.45, 8.0))
    adem_env = (aanzet_env * uitsterf_env) ** 0.7 * (0.55 + 0.45 * (1 - smoothstep((t - 0.1) / 0.5)) + 0.6 * smoothstep((t - 1.5) / 0.6) * uitsterf_env)
    adem = adem / np.std(adem) * adem_env * (1 + 0.3 * np.sin(vf1))

    toon = np.stack([L, R])
    droog = toon + 0.10 * np.std(toon[:, n // 5: n * 3 // 4]) * adem  # ademruis ongeveer -20 dB onder de toon
    uit = galm(droog, rng, rt60=0.9, nat=0.30, voorvertraging=0.020, demping_hz=4000)[:, :n]
    return aanzet_uitsterf(uit, 0.004, 0.35)


# --------------------------------------------------------------------------------------------------
# Normaliseren, coderen en controleren
# --------------------------------------------------------------------------------------------------

def db(v):
    return 20 * np.log10(max(float(v), 1e-12))


def coderen(stereo, pad):
    data = stereo.T.astype('<f4').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
                    '-c:a', 'libmp3lame', '-b:a', '128k', str(pad)], input=data, check=True)


def decoderen(pad):
    ruw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(pad), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(ruw, dtype='<f4').reshape(-1, 2).T.astype(np.float64)


def afronden(naam, stereo, pad):
    """Haalt de DC-offset eruit, schaalt op een piek van DOEL_PIEK_DB en codeert naar mp3. Bij korte, scherpe
    aanslagen (donder, klok) schiet de mp3-encoder bij een enkel monster een stukje over of onder de invoerpiek,
    en dat gedrag is niet lineair in de winst. Daarom wordt de winst bijgesteld tot de GEDECODEERDE piek binnen
    -1,2...-0,95 dB valt (nooit boven -0,9 dB, dus geen clipping); lukt dat niet, dan wint de beste poging."""
    stereo = stereo - stereo.mean(axis=1, keepdims=True)  # geen DC-offset
    winst = 10 ** (DOEL_PIEK_DB / 20) / np.max(np.abs(stereo))
    beste = None  # (afstand tot het doel, winst, gemeten piek)
    laatste = None
    for poging in range(20):
        coderen(stereo * winst, pad)
        gemeten = db(np.max(np.abs(decoderen(pad))))
        laatste = winst
        if gemeten <= -0.9 and (beste is None or abs(gemeten - DOEL_PIEK_DB) < beste[0]):
            beste = (abs(gemeten - DOEL_PIEK_DB), winst, gemeten)
        if -1.2 <= gemeten <= -0.95:
            return gemeten
        winst *= 10 ** ((DOEL_PIEK_DB - gemeten - 0.03 * poging) / 20)
    if beste is None:
        raise RuntimeError(f'{naam}: geen codering zonder clipping gevonden')
    if beste[1] != laatste:
        coderen(stereo * beste[1], pad)
    return beste[2]


GELUIDEN = {
    'donder': ('halloween-donder.mp3', donder),
    'kraak': ('halloween-kraak.mp3', kraak),
    'klok': ('halloween-klok.mp3', klok),
    'huil': ('halloween-huil.mp3', huil),
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
        piek_db = afronden(naam, stereo, pad)
        print(f'{bestand}: {stereo.shape[1] / SR:.2f} s, piek {piek_db:.2f} dBFS, {pad.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
