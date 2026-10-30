# LSG Art-Bible

Verbindliche Regeln für den Look von LSG. Neue Modelle, Effekte und Welten richten sich danach.

## Stil

- **Stilisiert-realistisch:** klare, leicht übertriebene Formen, abgerundete Kanten, echte PBR-Materialien
  (Metall, Rauheit, Leuchtflächen). Keine Fotorealistik, kein Flat-Shading.
- **Lesbarkeit vor Detail:** Jede Figur muss bei 40 Pixel Bildschirmhöhe an Silhouette und Farbe erkennbar sein.
- **Leuchtflächen tragen Information:** Visiere, Augen, Mündungen, Kerne und Torfelder leuchten; Bloom (M6)
  verstärkt genau diese Stellen.

## Farbsprache

| Rolle | Farbe | Hinweis |
|-------|-------|---------|
| Eigene Truppe | Skin-Farbe (Standard `#2f8cff`), Visier `#5ff3ff` | Team-Teile übernehmen die Skin-Farbe per Uniform |
| Gegner allgemein | Rot `#b3262e`, Violett `#7d3fbf`, Blau-Violett `#4a54a8` | Augen/Kanonen leuchten warm (Orange/Magenta) |
| Spalter | Orange `#ff7a2a` mit gelbem Kern | Organisch, wabbelnd |
| Mini-Boss | Violett `#5a1f7a` mit Gold `#d9a520` | Vierbeiner |
| Boss | Dunkelrot `#3a0f2a`, Glut `#ff2050` | Reaktorkern in der Brust |
| Gute Tore | Grün `#27d17c` | |
| Schlechte Tore | Rot `#ff3b55` | |
| Waffen-Tore | Orange `#ffb020` | |
| Gefahr (Barrieren, Fässer) | Gelb `#ffc21a` / Schwarz, Rot `#c2342a` | Warnlichter leuchten rot |

### Welten

| Welt | Stimmung | Himmel | Licht | Akzent |
|------|----------|--------|-------|--------|
| Dust Valley | Heißer Wüstentag | Blau → Sandgelb | Warme Sonne, HDRI „Goegap“ | Orange Kanten |
| Neon City | Nacht, Regen-Neon | Schwarz → Violett, Sterne | Schwaches Mondlicht, beleuchtete Fenster, Neon | Magenta Kanten |
| Orbit Station | Weltraum, kühl | Schwarz, viele Sterne | Kühles Studiolicht | Cyan Kanten und Leuchtstreifen |

## Formensprache

- **Truppe:** freundlich-heroisch, runde Helme, kompakte Proportionen (Kopf ≈ 1/5 der Höhe).
- **Gegner:** kantige Roboterfraktion, nach vorn geneigt, Stacheln und Zyklopenaugen; Größe steigt mit Gefahr.
- **Tore:** sechseckige Tech-Säulen, Querträger, animiertes Energiefeld mit Wabenmuster.

## Technische Budgets

| Objekt | Dreiecke (Detail) | Dreiecke (fern/niedrig) | Draw Calls |
|--------|-------------------|-------------------------|------------|
| Soldat | ≤ 1.500 | ≤ 600 | 1 für die ganze Truppe |
| Normale Gegner | ≤ 1.100 | ≤ 300 | 1 pro Typ und Detailstufe |
| Mini-Boss / Boss | ≤ 2.500 | ≤ 1.000 | 1 |
| Kulissen-Streifen | beliebig, aber 1 Geometrie | – | 2 pro Welt (+2 Fassaden in der Stadt) |
| Texturen | 1k, nur Fahrbahn und HDRI | – | – |

Regeln:
- Figuren entstehen aus `ModelBuilder` (eine Geometrie pro Figur, Vertex-Farben, keine Texturen).
- Animation ausschließlich im Vertex-Shader über Teil-IDs (`PART.*`); keine Skelette.
- Kleine Rundungen (< 0,05) werden als normale Boxen gebaut; sie sind im Spiel unsichtbar.
- Jede Leuchtfläche nutzt `emissive` im Material, nie zusätzliche Lichtquellen.
- Neue Fremd-Assets nur CC0/CC-BY, eingetragen in `docs/ASSETS.md`.

## Werkzeuge

- Modell-Betrachter (nur Entwicklung): `http://localhost:5173/?viewer`, Fokus mit `&focus=soldier|runner|…|boss`,
  Fernmodelle mit `?viewer=far`.
- Asset-Download: `node tools/assets/fetch-assets.ts`.
