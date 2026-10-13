"""Voix off du Canard : Chatterbox Multilingual (licence MIT), en local, CPU.

Chaque phrase est générée séparément, contrôlée par reconnaissance vocale
(faster-whisper) et régénérée avec une autre graine si le texte entendu
s'éloigne trop du texte attendu. Les timings des mots servent à caler
l'animation.

Usage : python tools/voice.py <voix_de_référence.wav> [indices à régénérer…]
Sortie : audio/vo/NN.wav + audio/vo/segments.json
"""
import difflib, json, os, re, subprocess, sys, unicodedata

import numpy as np
import torch
import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from faster_whisper import WhisperModel

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "audio", "vo")
EXAGGERATION = 0.6
TRIES = 4
# mots qui doivent impérativement être entendus (sinon on retente)
MUST = {5: ["chez", "tpe", "pme"]}

# (texte affiché, texte prononcé si différent)
LINES = [
    ("Salut, moi c'est le Canard.", None),
    ("Oui, le canard de Digiflex.", None),
    ("Et non, je ne fais pas « coin-coin » en réunion.", None),
    ("Vous êtes pro. Vous assurez sur le terrain.", None),
    ("Mais en ligne ? Parfois, ça patauge.", None),
    ("Chez Digiflex, on aide les TPE et PME à avoir une vraie présence en ligne.",
     "Chez Digiflex, on aide les té-pé-e et pé-ème-e à avoir une vraie présence en ligne."),
    ("Qualitative. Pas du bricolage.", None),
    ("Un site one page ? Un site vitrine ? Une boutique en ligne ?", None),
    ("On construit tout ça sur WordPress, WooCommerce et Shopify.", None),
    ("Notre philosophie : des pros qui font confiance à des pros.", None),
    ("Vous gardez votre métier, on s'occupe du web.", None),
    ("Et pourquoi un canard ?", None),
    ("Parce que le canard ne coule jamais.", None),
    ("Il nage. Il vole. Il flotte.", None),
    ("Exactement ce qu'on veut pour votre business.", None),
    ("Digiflex, l'agence au Canard.", None),
]


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("té-pé-e", "tpe").replace("pé-ème-e", "pme")
    return re.sub(r"[^a-z0-9 ]+", " ", s).split()


def score(expected, heard):
    return difflib.SequenceMatcher(None, norm(expected), norm(heard)).ratio()


def trim(wav, sr, pad=0.06, thr=0.012):
    x = wav[0].numpy()
    win = int(0.02 * sr)
    e = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, "same"))
    idx = np.where(e > thr)[0]
    if len(idx) == 0:
        return wav
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(x), idx[-1] + int(pad * sr * 2))
    return wav[:, a:b]


def main():
    ref = sys.argv[1]
    only = {int(a) for a in sys.argv[2:]}
    os.makedirs(OUT, exist_ok=True)
    torch.set_num_threads(os.cpu_count() or 4)
    tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    tts.prepare_conditionals(ref, exaggeration=EXAGGERATION)
    asr = WhisperModel("small", device="cpu", compute_type="int8")

    def listen(wav, sr):
        audio16 = torchaudio.functional.resample(wav, sr, 16000)[0].numpy().astype(np.float32)
        res = list(asr.transcribe(audio16, language="fr", word_timestamps=True, beam_size=5)[0])
        heard = " ".join(s.text.strip() for s in res)
        words = [{"w": w.word.strip(), "t": round(w.start, 3), "e": round(w.end, 3)} for s in res for w in s.words]
        return heard, words

    def entry(i, text, wav, sr, heard, words, sc):
        return {"i": i, "text": text, "heard": heard, "score": round(sc, 3),
                "file": f"{i:02d}.wav", "dur": round(wav.shape[-1] / sr, 3), "words": words}

    seg_path = os.path.join(OUT, "segments.json")
    old = {s["i"]: s for s in json.load(open(seg_path))["segments"]} if only and os.path.exists(seg_path) else {}
    segs = []
    for i, (text, say) in enumerate(LINES):
        path = os.path.join(OUT, f"{i:02d}.wav")
        if only and i not in only:
            if i in old:
                segs.append(old[i])
                continue
            if os.path.exists(path):
                # phrase déjà générée : on se contente de la réécouter
                wav, sr = torchaudio.load(path)
                heard, words = listen(wav, sr)
                segs.append(entry(i, text, wav, sr, heard, words, score(text, heard)))
                continue
        best = None
        tries = TRIES * 3 if i in MUST else TRIES
        for k in range(tries):
            torch.manual_seed(1000 * i + k)
            wav = tts.generate(say or text, language_id="fr", exaggeration=EXAGGERATION, cfg_weight=0.5)
            wav = trim(wav, tts.sr)
            heard, words = listen(wav, tts.sr)
            sc = score(text, heard)
            if any(m not in norm(heard) for m in MUST.get(i, [])):
                sc -= 0.2
            print(f"{i:02d} try{k} score={sc:.2f}  {heard}", flush=True)
            if best is None or sc > best[0]:
                best = (sc, wav, heard, words)
            if sc >= 0.9:
                break
        sc, wav, heard, words = best
        torchaudio.save(path, wav, tts.sr)
        segs.append(entry(i, text, wav, tts.sr, heard, words, sc))
    with open(seg_path, "w") as f:
        json.dump({"engine": "chatterbox-multilingual", "segments": segs}, f, ensure_ascii=False, indent=1)
    for s in segs:
        print(f"{s['i']:02d} {s['dur']:5.2f}s  {s['score']:.2f}  {s['text']}")


if __name__ == "__main__":
    main()
