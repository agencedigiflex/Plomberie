"""Synthétise la musique de fond et les bruitages (aucun sample externe).

Usage : python tools/music.py <instant_du_final_s>
Le tempo (~112 BPM) est ajusté pour que l'accord final tombe pile sur
l'apparition du logo.
Sortie : audio/music.wav et audio/sfx/*.wav
"""
import os, sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
BPM = 112
BEAT = 60 / BPM
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(7)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env(n, a=0.005, d=0.2, curve=1.0):
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    return att * np.exp(-t / d) ** curve


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def saw(f, t):
    # dents de scie adoucies (somme d'harmoniques limitée)
    out = np.zeros_like(t)
    for k in range(1, 12):
        if f * k > SR / 2.5:
            break
        out += ((-1) ** (k + 1)) * np.sin(2 * np.pi * f * k * t) / k
    return out * 0.6


def add(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig)] += sig


# --- instruments ---------------------------------------------------------

def kick():
    t = t_axis(0.35)
    f = 48 + 90 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env(len(t), 0.001, 0.16)
    s += 0.25 * hp(rng.standard_normal(len(t)), 3000) * env(len(t), 0.0005, 0.004)
    return s * 0.7


def clap():
    n = int(0.25 * SR)
    noise = bp(rng.standard_normal(n), 900, 2600)
    e = np.zeros(n)
    for k, o in enumerate([0, 0.011, 0.022]):
        i = int(o * SR)
        e[i:] += env(n - i, 0.0005, 0.012 if k < 2 else 0.09)
    return noise * e * 0.5


def hat(open_=False):
    n = int((0.2 if open_ else 0.06) * SR)
    s = hp(rng.standard_normal(n), 7000, 4)
    return s * env(n, 0.0005, 0.05 if open_ else 0.014) * 0.22


def shaker():
    n = int(0.09 * SR)
    s = bp(rng.standard_normal(n), 5000, 11000)
    return s * env(n, 0.012, 0.025) * 0.1


def bass(note, dur):
    t = t_axis(dur)
    f = midi(note)
    s = saw(f, t) + 0.5 * np.sin(2 * np.pi * f / 2 * t)
    cutoff = 300 + 1400 * np.exp(-t / 0.06)
    # filtre « wah » par blocs pour l'enveloppe de cutoff
    out = np.zeros_like(s)
    blk = 256
    for i in range(0, len(s), blk):
        out[i:i + blk] = lp(s[max(0, i - 2048):i + blk], float(np.clip(cutoff[i], 80, 8000)))[-len(s[i:i + blk]):]
    return out * env(len(t), 0.004, 0.18) * 0.4


def marimba(note, dur=0.6, vol=0.25):
    t = t_axis(dur)
    f = midi(note)
    s = np.sin(2 * np.pi * f * t) * env(len(t), 0.001, 0.35)
    s += 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * env(len(t), 0.001, 0.05)
    s += 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * env(len(t), 0.0005, 0.012)
    return s * vol


def pad(notes, dur):
    t = t_axis(dur)
    s = sum(saw(midi(n), t) + saw(midi(n) * 1.004, t) for n in notes)
    s = lp(s, 1100)
    a = np.clip(t / 0.25, 0, 1) * np.clip((dur - t) / 0.3, 0, 1)
    return s * a * 0.035


# --- arrangement ---------------------------------------------------------

# I – V – vi – IV en Fa majeur : F C Dm Bb
PROG = [
    (53, [65, 69, 72]),   # F
    (48, [64, 67, 72]),   # C
    (50, [62, 65, 69]),   # Dm
    (46, [62, 65, 70]),   # Bb
]
HOOK = [77, None, 76, 77, None, 72, None, 74, 72, None, 69, None, 72, None, None, None]


def music(hit):
    global BEAT
    nbars = max(1, round(hit / (BEAT * 4)))
    bar = hit / nbars
    BEAT = bar / 4
    buf = np.zeros(int((hit + 6) * SR))
    K, C = kick(), clap()
    for b in range(nbars):
        t0 = b * bar
        root, chord = PROG[b % 4]
        intro = b < 1
        outro = b >= nbars - 1
        # batterie (roulement de caisse claire sur la dernière mesure)
        if outro:
            for k in range(8):
                add(buf, C * (0.35 + 0.08 * k), t0 + 2 * BEAT + k * BEAT / 4)
        for beat in range(4):
            tb = t0 + beat * BEAT
            if not intro and not (outro and beat >= 2):
                add(buf, K, tb)
                if beat in (1, 3):
                    add(buf, C, tb)
            for h in range(2):
                sw = 0.035 if h else 0
                add(buf, hat(open_=(h == 1 and beat == 3)), tb + h * BEAT / 2 + sw)
            add(buf, shaker(), tb + BEAT * 0.75)
        # basse bondissante (croches, octave sur le contretemps)
        if not intro:
            for e in range(8):
                n = root + (12 if e % 2 else 0)
                if e in (3, 7):
                    n = root + 7
                add(buf, bass(n - 12, BEAT / 2 * 0.9), t0 + e * BEAT / 2 + (0.03 if e % 2 else 0))
        # accords marimba en contretemps
        for beat in range(4):
            for n in chord:
                add(buf, marimba(n, 0.4, 0.07), t0 + beat * BEAT + BEAT / 2 + 0.03)
        add(buf, pad(chord, bar), t0)
        # petite mélodie toutes les deux mesures (hors intro et fin)
        if b % 4 in (0, 2) and not intro and not outro and b > 2:
            for s, n in enumerate(HOOK):
                if n:
                    add(buf, marimba(n + 12 * (b % 8 == 4), 0.5, 0.11), t0 + s * BEAT / 2 + (0.03 if s % 2 else 0))
    # fin : accord final + crash
    end = hit
    for n in [53 - 12, 65, 69, 72, 77]:
        add(buf, marimba(n, 2.5, 0.16), end)
    tail = pad([53, 65, 69, 72], 5.5) * 1.6 * np.exp(-t_axis(5.5) / 2.2)
    add(buf, tail, end)
    add(buf, K, end)
    crash = hp(rng.standard_normal(int(2.5 * SR)), 5000) * env(int(2.5 * SR), 0.001, 0.6) * 0.15
    add(buf, crash, end)
    buf = buf[: int((end + 5.5) * SR)]
    return buf


# --- bruitages -----------------------------------------------------------

def sfx_pop():
    t = t_axis(0.12)
    f = 900 * np.exp(-t / 0.03) + 300
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.001, 0.035) * 0.6


def sfx_whoosh(dur=0.45, up=True):
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    blk = 512
    for i in range(0, n, blk):
        p = i / n
        fc = 400 + 5000 * (p if up else 1 - p) ** 1.5
        seg = bp(noise[max(0, i - 2048):i + blk], fc * 0.6, fc * 1.4)
        out[i:i + blk] = seg[-len(noise[i:i + blk]):]
    shape = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return out * shape * 0.35


def sfx_splash():
    n = int(0.7 * SR)
    noise = rng.standard_normal(n)
    s = lp(noise, 2500) * env(n, 0.002, 0.18)
    t = t_axis(0.7)
    for k in range(10):
        at = rng.uniform(0.02, 0.35)
        f0 = rng.uniform(500, 1400)
        tt = t - at
        m = tt > 0
        bub = np.zeros(n)
        bub[m] = np.sin(2 * np.pi * (f0 * tt[m] + 900 * tt[m] ** 2)) * np.exp(-tt[m] / 0.03)
        s += bub * 0.18
    return s * 0.5


def sfx_quack():
    t = t_axis(0.32)
    f = 520 - 160 * t / 0.32
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sign(np.sin(ph)) * 0.4 + saw(1, t) * 0
    s = bp(s, 900, 2600) + 0.4 * bp(s, 2800, 4200)
    a = np.clip(t / 0.02, 0, 1) * np.clip((0.32 - t) / 0.08, 0, 1)
    return s * a * 0.55


def sfx_ding():
    return marimba(96, 1.0, 0.35) + marimba(103, 1.0, 0.2)


def sfx_stamp():
    t = t_axis(0.3)
    s = np.sin(2 * np.pi * (70 + 120 * np.exp(-t / 0.02)) * t) * env(len(t), 0.001, 0.08)
    s += lp(rng.standard_normal(len(t)), 1800) * env(len(t), 0.001, 0.03) * 0.5
    return s * 0.8


def sfx_buzz():
    t = t_axis(0.35)
    s = np.sign(np.sin(2 * np.pi * 140 * t)) * 0.3
    return lp(s, 1800) * np.clip((0.35 - t) / 0.05, 0, 1) * 0.35


def sfx_click():
    n = int(0.03 * SR)
    return hp(rng.standard_normal(n), 2500) * env(n, 0.0003, 0.004) * 0.4


def sfx_rise(dur=1.2):
    t = t_axis(dur)
    f = 300 * 2 ** (2.5 * t / dur)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15 + sfx_whoosh(dur)[: len(t)] * 0.6
    return s * np.clip(t / dur, 0, 1) ** 2


def sfx_bloop(up=True):
    t = t_axis(0.18)
    f = (300 + 900 * t / 0.18) if up else (1100 - 800 * t / 0.18)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.002, 0.07) * 0.45


def write(path, x):
    peak = np.max(np.abs(x)) or 1
    if peak > 0.98:
        x = x / peak * 0.98
    sf.write(path, np.stack([x, x], 1).astype(np.float32), SR, subtype="PCM_16")


if __name__ == "__main__":
    hit = float(sys.argv[1]) if len(sys.argv) > 1 else 60
    os.makedirs(os.path.join(ROOT, "audio", "sfx"), exist_ok=True)
    m = music(hit)
    m = m / np.max(np.abs(m)) * 0.9
    write(os.path.join(ROOT, "audio", "music.wav"), m)
    for name, fn in {
        "pop": sfx_pop, "whoosh": sfx_whoosh, "splash": sfx_splash, "quack": sfx_quack,
        "ding": sfx_ding, "stamp": sfx_stamp, "buzz": sfx_buzz, "click": sfx_click,
        "rise": sfx_rise, "bloop": sfx_bloop,
        "whoosh_down": lambda: sfx_whoosh(0.4, up=False),
    }.items():
        write(os.path.join(ROOT, "audio", "sfx", f"{name}.wav"), fn())
    print(f"music {len(m) / SR:.1f}s, bpm {60 / BEAT:.2f}")
