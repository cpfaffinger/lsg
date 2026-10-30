# Assets und Lizenzen

Jedes Asset, das nicht im Projekt selbst erzeugt wird, steht hier mit Quelle, Autor, Lizenz und Änderungen.
CC-BY-Assets erscheinen zusätzlich im Spiel unter "Credits".

## Selbst erzeugt (keine Fremdlizenz)

| Bereich | Erzeugung | Ort im Code |
|---------|-----------|-------------|
| Soundeffekte | Prozedural synthetisiert beim Start (Oszillatoren, Rauschen, Filter) | `apps/game/src/audio/sfx-synth.ts` |
| Musik | Prozeduraler Step-Sequencer mit Oszillator-Instrumenten | `apps/game/src/audio/music.ts` |
| Partikel, Trümmer, schwebende Zahlen | Shader und Geometrie-Primitive | `apps/game/src/render/fx/` |
| Tor-Beschriftung, Fahrbahntextur | Canvas-2D zur Laufzeit | `apps/game/src/render/` |
| Platzhalter-Modelle (Soldaten, Gegner) | Three.js-Primitive | `apps/game/src/render/views/` |

## Fremd-Assets

| Asset | Quelle | Autor | Lizenz | Änderungen |
|-------|--------|-------|--------|------------|
| – | – | – | – | – |
