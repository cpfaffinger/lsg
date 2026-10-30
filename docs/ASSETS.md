# Assets und Lizenzen

Jedes Asset, das nicht im Projekt selbst erzeugt wird, steht hier mit Quelle, Autor, Lizenz und Änderungen.
CC-BY-Assets erscheinen zusätzlich im Spiel unter "Credits". Die maschinenlesbare Liste liegt in
`apps/game/public/media/credits.json` und wird von `tools/assets/fetch-assets.ts` erzeugt.

## Selbst erzeugt (keine Fremdlizenz)

| Bereich | Erzeugung | Ort im Code |
|---------|-----------|-------------|
| Soundeffekte | Prozedural synthetisiert beim Start (Oszillatoren, Rauschen, Filter) | `apps/game/src/audio/sfx-synth.ts` |
| Musik | Prozeduraler Step-Sequencer mit Oszillator-Instrumenten | `apps/game/src/audio/music.ts` |
| Soldaten, Gegner, Bosse | Prozedural aus Grundformen, Animation im Vertex-Shader | `apps/game/src/render/models/` |
| Kulissen der drei Welten | Prozedural erzeugte Module | `apps/game/src/render/environment/` |
| Partikel, Trümmer, schwebende Zahlen | Shader und Geometrie-Primitive | `apps/game/src/render/fx/` |
| Tor-Beschriftung, Glyphenatlas | Canvas-2D zur Laufzeit | `apps/game/src/render/` |

## Fremd-Assets

Alle Fremd-Assets stammen von [Poly Haven](https://polyhaven.com) und stehen unter **CC0 1.0** (gemeinfrei,
keine Namensnennung erforderlich). Sie werden unverändert in 1k-Auflösung verwendet.

| Asset | Art | Autor | Quelle | Verwendung | Dateien |
|-------|-----|-------|--------|------------|---------|
| Goegap | HDRI | Greg Zaal | https://polyhaven.com/a/goegap | Licht und Reflexionen „Dust Valley“ | `media/hdri/goegap_1k.hdr` |
| Shanghai Bund | HDRI | Greg Zaal | https://polyhaven.com/a/shanghai_bund | Licht und Reflexionen „Neon City“ | `media/hdri/shanghai_bund_1k.hdr` |
| Studio Small 08 | HDRI | Sergej Majboroda | https://polyhaven.com/a/studio_small_08 | Licht und Reflexionen „Orbit Station“ | `media/hdri/studio_small_08_1k.hdr` |
| Aerial Beach 01 | PBR-Textur | Rob Tuytel | https://polyhaven.com/a/aerial_beach_01 | Fahrbahn „Dust Valley“ | `media/textures/aerial_beach_01/*` |
| Asphalt 02 | PBR-Textur | Rob Tuytel | https://polyhaven.com/a/asphalt_02 | Fahrbahn „Neon City“ | `media/textures/asphalt_02/*` |
| Blue Metal Plate | PBR-Textur | Rob Tuytel | https://polyhaven.com/a/blue_metal_plate | Fahrbahn „Orbit Station“ | `media/textures/blue_metal_plate/*` |

Die Autorennamen stammen aus der Poly-Haven-API (`credits.json`); bei Abweichungen gilt `credits.json`.

## Audio (CC0)

Alle Dateien liegen konvertiert in `apps/game/src/media/audio/`. `tools/assets/convert-audio.sh` erzeugt sie aus den Downloads in `assets-src/downloads/`.

| Asset | Urheber | Verwendung | Quelle | Lizenz |
|-------|---------|------------|--------|--------|
| Sci-Fi Sounds, Impact Sounds, Interface Sounds, Music Jingles | Kenney | Soundeffekte | https://kenney.nl/assets/category:Audio | CC0 |
| Determined Pursuit | Emma_MA | Musik Menü | https://opengameart.org/content/determined-pursuit-epic-orchestra-loop | CC0 |
| Action Music Loop | AppPro | Musik Dust Valley | https://opengameart.org/content/action-music-loop | CC0 |
| Fast fight / battle music | Ville Nousiainen, Xythe, mutkanto | Musik Neon City | https://opengameart.org/content/fast-fight-battle-music | CC0 |
| Friendly Talk On a Robotic Battlefield | illin | Musik Orbit Station | https://opengameart.org/content/friendly-talk-on-a-robotic-battlefield-looped | CC0 |
| Heavy battle music | Davieplier | Musik Boss | https://opengameart.org/content/heavy-battle-music | CC0 |

## 3D-Figuren (CC0)

`tools/assets/bake-characters.ts` erzeugt aus den GLB-Dateien die kompakten Dateien in `apps/game/src/media/models/`.

| Asset | Urheber | Verwendung | Quelle | Lizenz |
|-------|---------|------------|--------|--------|
| Character Soldier (Toon Shooter Game Kit) | Quaternius | Trupp mit allen Waffen | https://poly.pizza/m/PpLF4rt4ah | CC0 |
| Character Enemy (Toon Shooter Game Kit) | Quaternius | Läufer | https://poly.pizza/m/mdGe4IN31v | CC0 |
| Character Hazmat (Toon Shooter Game Kit) | Quaternius | Schützen | https://poly.pizza/m/z3TSQYx1Kn | CC0 |
