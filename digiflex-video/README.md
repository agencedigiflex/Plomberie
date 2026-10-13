# Digiflex — l'agence au Canard (motion design)

Vidéo de présentation de l'agence Digiflex : 1920×1080, 30 i/s, ~60 s,
voix off du Canard, musique et bruitages. Rendu final : `out/digiflex-canard.mp4`.

Charte reprise de la bannière et du logo : rose `#D2117A`, jaune `#FFD84D`,
encre `#131017`, Poppins ExtraBold Italique en capitales, surlignage jaune,
canard du logo redessiné en vectoriel (bec qui parle au rythme de la voix,
clignement d'œil, aile pour le vol, flottaison sur les vagues).

## Déroulé

| Temps | Voix off | Image |
|---|---|---|
| 0–9 s | Salut, moi c'est le Canard… pas « coin-coin » en réunion | Le canard plonge, logo, bulle « coin-coin » barrée |
| 9–15 s | Vous êtes pro… ça patauge | Étiquettes métiers, site qui prend l'eau |
| 15–25 s | TPE et PME… pas du bricolage | Le site se construit, validé « Pro » |
| 25–36 s | One page, vitrine, boutique… WordPress, WooCommerce, Shopify | Trois maquettes de sites, pastilles techno |
| 36–43 s | Des pros qui font confiance à des pros… | Écran partagé : votre métier / le web |
| 43–54 s | Pourquoi un canard ? Il nage, il vole, il flotte… | Le canard sur l'eau, le « site bricolé » coule, courbe de croissance |
| 54–60 s | Digiflex, l'agence au Canard. | Logo, confettis, « On code · on stylise · on déploie » |

## Fichiers

```
index.html          Composition (scène 1920×1080) — ouvrir dans un navigateur pour
                    un aperçu avec le son (bouton Lecture + curseur)
motion.js           Animation : timeline GSAP calée sur les mots de la voix off
timeline.js         Timings générés (phrases, mots, enveloppe de la voix)
audio/vo/           Voix off, une phrase par fichier + segments.json
audio/ref_voice.wav Timbre de référence de la voix (synthèse Piper « tom »)
audio/mix.m4a       Bande son finale (aperçu)
tools/voice.py      Voix off : Chatterbox Multilingual + contrôle par Whisper
tools/timeline.py   Place les phrases, écrit timeline.js + audio/vo_track.wav
tools/render.mjs    Rendu image par image (Playwright/Chromium) -> out/video.mp4
tools/music.py      Musique (~111 BPM, Fa majeur) et bruitages synthétisés
tools/mix.py        Mixage : ducking sous la voix, passages « sous l'eau », limiteur
tools/build.sh      Toute la chaîne
```

## Refaire le rendu

Prérequis : Node 18+, ffmpeg, Python 3 avec `numpy scipy soundfile`.

```bash
npm install                       # gsap, polices, playwright
PY=python3 ./tools/build.sh       # timeline -> images -> musique -> mix -> out/digiflex-canard.mp4
```

Pour régénérer la voix (CPU, ~10 min) : un environnement Python avec
`chatterbox-tts` et `faster-whisper`, puis
`PY_TTS=/chemin/python PY=python3 ./tools/build.sh --voice`.
Une seule phrase : `python tools/voice.py audio/ref_voice.wav 5`.

Modifier un texte affiché ou un timing : `motion.js` (les apparitions sont
calées sur les mots via `Wd(phrase, "mot")`). Aperçu d'une image précise :
`node tools/render.mjs --stills 12.5,30`.

## Licences

- Voix : Chatterbox Multilingual (Resemble AI, MIT), timbre de référence
  généré avec Piper `fr_FR-tom-medium`. Chatterbox ajoute un filigrane audio
  inaudible (Perth).
- GSAP 3 : licence standard GreenSock (gratuite, y compris usage commercial).
- Poppins : SIL Open Font License.
- Musique et bruitages : synthétisés par `tools/music.py`, aucun échantillon externe.
- WordPress, WooCommerce et Shopify sont cités en texte uniquement (pas de logos).
