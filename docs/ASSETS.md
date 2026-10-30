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
