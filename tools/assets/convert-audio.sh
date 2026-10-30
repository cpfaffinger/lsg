#!/bin/sh
# Converts the downloaded CC0 audio packs into the files the game ships.
# Run inside a container with ffmpeg, from the project root (see docs/ASSETS.md):
#
#   docker run --rm -v "$PWD:/w" -w /w alpine:3 sh -c 'apk add -q ffmpeg && sh tools/assets/convert-audio.sh'
set -eu

SRC=assets-src/downloads
OUT=apps/game/src/media/audio
rm -rf "$OUT"
mkdir -p "$OUT/sfx" "$OUT/music"

# Short, mono, uncompressed: starts instantly and decodes in every browser.
sfx() {
  id=$1
  max=$2
  shift 2
  n=0
  for file in "$@"; do
    ffmpeg -nostdin -loglevel error -y -i "$file" -t "$max" \
      -af "silenceremove=start_periods=1:start_threshold=-50dB,afade=t=out:st=$(echo "$max" | awk '{print $1 * 0.8}'):d=$(echo "$max" | awk '{print $1 * 0.2}')" \
      -ac 1 -ar 32000 -c:a pcm_s16le "$OUT/sfx/$id-$n.wav"
    n=$((n + 1))
  done
}

SCI=$SRC/sci-fi-sounds/x/Audio
IMP=$SRC/impact-sounds/x/Audio
UI=$SRC/interface-sounds/x/Audio
JIN=$SRC/music-jingles/x/Audio/Hit\ jingles

sfx shot 0.25 "$SCI/laserSmall_000.ogg" "$SCI/laserSmall_001.ogg" "$SCI/laserSmall_002.ogg"
sfx shotSpread 0.3 "$SCI/laserRetro_000.ogg" "$SCI/laserRetro_001.ogg"
sfx shotLaser 0.4 "$SCI/laserLarge_000.ogg" "$SCI/laserLarge_001.ogg"
sfx shotRocket 0.7 "$SCI/thrusterFire_000.ogg" "$SCI/thrusterFire_001.ogg"
sfx hit 0.25 "$IMP/impactMetal_light_000.ogg" "$IMP/impactMetal_light_001.ogg" "$IMP/impactMetal_light_002.ogg"
sfx kill 0.3 "$IMP/impactPunch_medium_000.ogg" "$IMP/impactPunch_medium_001.ogg" "$IMP/impactPunch_medium_002.ogg"
sfx killBig 1.2 "$SCI/explosionCrunch_000.ogg" "$SCI/explosionCrunch_001.ogg"
sfx gateHit 0.2 "$IMP/impactGlass_light_000.ogg" "$IMP/impactGlass_light_001.ogg"
sfx gateStep 0.4 "$UI/glass_001.ogg" "$UI/glass_002.ogg"
sfx gateGood 0.8 "$UI/confirmation_001.ogg" "$UI/confirmation_002.ogg"
sfx gateBad 0.8 "$UI/error_004.ogg" "$UI/error_006.ogg"
sfx unitsLost 0.35 "$IMP/impactPunch_heavy_000.ogg" "$IMP/impactPunch_heavy_001.ogg" "$IMP/impactPunch_heavy_002.ogg"
sfx explosion 1.4 "$SCI/explosionCrunch_002.ogg" "$SCI/explosionCrunch_003.ogg" "$SCI/explosionCrunch_004.ogg"
sfx enemyShot 0.35 "$SCI/laserRetro_003.ogg" "$SCI/laserRetro_004.ogg"
sfx bossRoar 2 "$SCI/lowFrequency_explosion_000.ogg" "$SCI/lowFrequency_explosion_001.ogg"
sfx click 0.2 "$UI/click_002.ogg"
sfx coin 0.3 "$UI/select_003.ogg" "$UI/select_004.ogg"
sfx win 3 "$JIN/jingles_HIT15.ogg"
sfx lose 3 "$JIN/jingles_HIT05.ogg"

# AAC plays in every browser, including Safari, which cannot decode Ogg.
music() {
  ffmpeg -nostdin -loglevel error -y -i "$1" -vn -ac 2 -ar 44100 -c:a aac -b:a 96k "$OUT/music/$2.m4a"
}

music "$SRC/music/menu.wav" menu
music "$SRC/music/desert.wav" desert
music "$SRC/music/city.wav" city
music "$SRC/music/station.wav" station
music "$SRC/music/boss.mp3" boss
