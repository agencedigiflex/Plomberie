"""Mixe voix off + musique + bruitages.

Entrées : audio/vo_track.wav, audio/music.wav, audio/sfx/*.wav,
          audio/cues.json (bruitages et automations exportés par l'animation)
Sortie  : audio/mix.wav
"""
import json, os

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000

MUSIC_GAIN = 0.24       # musique seule (intro, respirations)
DUCK_DEPTH = 0.6        # atténuation de la musique sous la voix
SFX_GAIN = 0.5


def read(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    assert sr == SR, (path, sr)
    return x.mean(1)


def follower(x, attack=0.02, release=0.35):
    """Suiveur d'enveloppe (pour le ducking de la musique sous la voix)."""
    hop = 240
    rms = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, "same"))[::hop]
    out = np.zeros_like(rms)
    a = np.exp(-hop / (attack * SR))
    r = np.exp(-hop / (release * SR))
    v = 0.0
    for i, s in enumerate(rms):
        v = a * v + (1 - a) * s if s > v else r * v + (1 - r) * s
        out[i] = v
    out = out / (np.percentile(out, 98) or 1)
    return np.interp(np.arange(len(x)), np.arange(len(out)) * hop, np.clip(out, 0, 1))


def limiter(x, thr, release=0.08, hop=48):
    """Limiteur crête simple : attaque instantanée (1 ms d'anticipation), relâchement exponentiel."""
    m = len(x) // hop
    pk = np.abs(x[: m * hop]).reshape(m, hop).max(1)
    g = np.minimum(1, thr / np.maximum(pk, 1e-9))
    g = np.minimum(g, np.append(g[1:], 1))
    r = np.exp(-hop / (release * SR))
    out, v = np.empty_like(g), 1.0
    for i, gi in enumerate(g):
        v = gi if gi < v else r * v + (1 - r) * gi
        out[i] = v
    return x * np.interp(np.arange(len(x)), np.arange(m) * hop + hop / 2, out)


def main():
    vo = read(os.path.join(ROOT, "audio", "vo_track.wav"))
    cues = json.load(open(os.path.join(ROOT, "audio", "cues.json")))
    n = int(cues["total"] * SR)
    vo = np.pad(vo, (0, max(0, n - len(vo))))[:n]

    music = read(os.path.join(ROOT, "audio", "music.wav"))
    music = np.pad(music, (0, max(0, n - len(music))))[:n]

    # passages « sous l'eau » : la musique est étouffée (passe-bas)
    sos = butter(2, 500, "low", fs=SR, output="sos")
    muffled = sosfilt(sos, music)
    wet = np.zeros(n)
    t = np.arange(n) / SR
    for a, b in cues.get("muffle", []):
        wet = np.maximum(wet, np.clip(np.minimum((t - a) / 0.25, (b - t) / 0.4), 0, 1))
    music = music * (1 - wet) + muffled * wet * 1.6

    duck = 1 - DUCK_DEPTH * np.clip(follower(vo) * 1.6, 0, 1)
    # la musique remonte franchement avant la première et après la dernière phrase
    t = np.arange(n) / SR
    a, b = cues.get("vo_start", 0), cues.get("vo_end", cues["total"])
    duck *= np.interp(t, [0, a - 0.3, a, b, b + 0.5], [2.0, 2.0, 1, 1, 2.0])
    fade = np.clip(np.arange(n) / (0.3 * SR), 0, 1) * np.clip((n - np.arange(n)) / (0.8 * SR), 0, 1)
    out = vo * 1.0 + music * MUSIC_GAIN * duck * fade

    cache = {}
    for c in cues["sfx"]:
        name = c["name"]
        if name not in cache:
            cache[name] = read(os.path.join(ROOT, "audio", "sfx", f"{name}.wav"))
        s = cache[name] * SFX_GAIN * c.get("gain", 1)
        i = int(c["t"] * SR)
        if i >= n:
            continue
        s = s[: n - i]
        out[i:i + len(s)] += s

    # les transitoires (bruitages) passent dans un limiteur : plus de marge pour le volume
    out = out / np.percentile(np.abs(out), 99.7) * 0.89
    out = limiter(out, 0.89)
    out = out / np.max(np.abs(out)) * 0.8   # marge pour les crêtes inter-échantillons
    sf.write(os.path.join(ROOT, "audio", "mix.wav"), np.stack([out, out], 1), SR, subtype="PCM_16")
    print(f"mix {n / SR:.2f}s, {len(cues['sfx'])} bruitages")


if __name__ == "__main__":
    main()
