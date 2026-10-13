"""Place les phrases de la voix off sur la ligne de temps.

Lit audio/vo/segments.json, ajoute les respirations entre phrases, écrit :
  - audio/vo_track.wav : la voix off complète, calée
  - timeline.js        : timings (phrases, mots) + enveloppe de la voix
                         (pour faire parler le bec du canard)
"""
import json, os

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
FPS = 30
INTRO = 1.5          # le canard plonge avant de parler
OUTRO = 3.4          # carte de fin après la dernière phrase
GAP = 0.32           # respiration par défaut
# respirations plus longues aux changements de scène (indice de la phrase suivante)
SCENE_GAPS = {3: 0.75, 5: 0.8, 7: 0.75, 9: 0.8, 11: 0.85, 15: 0.9}


def load(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    x = x.mean(1)
    if sr != SR:
        g = np.gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g).astype(np.float32)
    return x


def main():
    meta = json.load(open(os.path.join(ROOT, "audio", "vo", "segments.json")))
    segs, clips, t = [], [], INTRO
    for s in meta["segments"]:
        if segs:
            t += SCENE_GAPS.get(s["i"], GAP)
        x = load(os.path.join(ROOT, "audio", "vo", s["file"]))
        dur = len(x) / SR
        segs.append({"i": s["i"], "text": s["text"], "start": round(t, 3), "dur": round(dur, 3),
                     "words": [{"w": w["w"], "t": round(t + w["t"], 3), "e": round(t + w["e"], 3)} for w in s["words"]]})
        clips.append((t, x))
        t += dur
    total = t + OUTRO

    track = np.zeros(int(total * SR) + 1, np.float32)
    for start, x in clips:
        i = int(start * SR)
        track[i:i + len(x)] += x
    peak = np.max(np.abs(track))
    track = track / peak * 0.95
    sf.write(os.path.join(ROOT, "audio", "vo_track.wav"), track, SR, subtype="PCM_16")

    # enveloppe RMS par image, lissée et normalisée -> ouverture du bec
    hop = SR // FPS
    n = int(total * FPS) + 1
    env = np.array([np.sqrt(np.mean(track[k * hop:(k + 1) * hop] ** 2)) if k * hop < len(track) else 0 for k in range(n)])
    env = env / (np.percentile(env[env > 0.01], 95) if np.any(env > 0.01) else 1)
    env = np.clip(env, 0, 1)
    env = np.where(env < 0.08, 0, env)

    data = {"fps": FPS, "total": round(total, 3), "segs": segs, "env": [round(float(v), 2) for v in env]}
    with open(os.path.join(ROOT, "timeline.js"), "w") as f:
        f.write("// Généré par tools/timeline.py — ne pas modifier à la main.\n")
        f.write("window.TL = " + json.dumps(data, ensure_ascii=False) + ";\n")
    print(f"total {total:.2f}s, {len(segs)} phrases")
    for s in segs:
        print(f"  {s['start']:6.2f} +{s['dur']:.2f}  {s['text']}")


if __name__ == "__main__":
    main()
