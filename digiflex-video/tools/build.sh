#!/usr/bin/env bash
# Chaîne complète : voix off -> timeline -> rendu image par image -> musique -> mixage -> MP4.
# PY_TTS : Python avec chatterbox-tts + faster-whisper (étape voix, facultative si audio/vo existe)
# PY     : Python avec numpy, scipy, soundfile
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-python3}

if [[ "${1:-}" == "--voice" ]]; then
  "${PY_TTS:-python3}" tools/voice.py audio/ref_voice.wav
fi
"$PY" tools/timeline.py
node tools/render.mjs                                   # out/video.mp4 + audio/cues.json
HIT=$("$PY" -c "import json; print(json.load(open('audio/cues.json'))['music_hit'])")
"$PY" tools/music.py "$HIT"
"$PY" tools/mix.py

# multiplexage (le mix sort déjà autour de -15 LUFS, crêtes limitées)
ffmpeg -y -v error -i out/video.mp4 -i audio/mix.wav -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 192k -shortest -movflags +faststart out/digiflex-canard.mp4
# bande son compressée pour l'aperçu dans le navigateur (index.html)
ffmpeg -y -v error -i audio/mix.wav -c:a aac -b:a 160k audio/mix.m4a
echo "OK : out/digiflex-canard.mp4"
