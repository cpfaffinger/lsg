# LSG – Lane Shooting Game
## Spielkonzept (Game Design Document, v0.1)

Stand: 2026-10-30

---

## 1. Vision in einem Satz

LSG ist ein werbefreies, kostenloses 3D-Lane-Shooter-Spiel in High-Polish-Qualität für den Browser: Der Spieler steuert eine automatisch feuernde Truppe am unteren Bildschirmrand nur nach links und rechts, sammelt Upgrade-Tore ein, wehrt Gegnerwellen ab und wird mit jedem Lauf stärker – ohne App-Store, ohne Werbung, ohne Tracking, ohne Bezahlschranken.

## 2. Genre-Referenz

Das Konzept ist das aus den bekannten Social-Media-Werbungen (Beispiele aus dem Genre: *Gun Gang*, *Bullet Rush*, *Mob Control*, *Hunter Assassin: Lane Shooter*, *Merge Master*):

- Die Kamera blickt von schräg hinten/oben auf eine lange Bahn ("Lane").
- Die eigene Truppe steht unten, Gegner kommen von oben (aus der Tiefe) entgegen.
- Die Truppe schießt **automatisch** nach vorne, der Spieler bewegt sie nur **horizontal**.
- Auf der Bahn tauchen **Tore (Gates)** auf: grün/blau = Bonus (`x2`, `+5 Einheiten`, `+Schaden`, `+Feuerrate`), rot = Malus (`-3`, `÷2`). Tore müssen **angeschossen** werden, damit ihr Wert steigt, und dann **durchfahren** werden.
- Es gibt Hindernisse, Gegnerwellen, Mini-Bosse und am Ende eines Levels einen Boss.

Das Spielgefühl in den Werbungen ist oft stark übertrieben oder gar nicht im eigentlichen Spiel enthalten. **LSG soll genau das Spiel sein, das die Werbung verspricht**: eskalierende Zahlen, sichtbares Wachstum der Truppe, befriedigende Upgrades, kurze Sessions.

## 3. Säulen des Designs

1. **Sofort verständlich** – keine Anleitung nötig, nach 5 Sekunden spielt man.
2. **Sichtbare Eskalation** – Truppe, Schaden und Zahlen wachsen fühlbar innerhalb eines Laufs.
3. **Fair und ehrlich** – kein Pay-to-win, keine Werbung, keine künstlichen Wartezeiten, keine Dark Patterns.
4. **High Polish, trotzdem schnell** – Premium-Optik mit hochwertigen Modellen, Partikeln und Post-Processing; Kern lädt in Sekunden, Welt-Assets werden nachgeladen; läuft auf Handy und Desktop im Browser, auch offline (PWA).

## 4. Core Loop

```
Level starten → Truppe nach links/rechts steuern
   → Tore anschießen & durchfahren (Truppe wächst, Schaden steigt)
   → Gegnerwellen abwehren, Hindernissen ausweichen
   → Boss besiegen → Belohnung (Münzen, Freischaltungen)
→ Meta-Upgrades kaufen → nächstes Level (schwerer, neue Gegner/Tore)
```

Ein Level dauert ca. 60–120 Sekunden. Ein "Run" ist ein Level; Scheitern bedeutet, das Level neu zu starten (ohne Verlust des Meta-Fortschritts).

## 5. Spielmechaniken

### 5.1 Truppe (Squad)
- Die Truppe besteht aus **N Einheiten**, dargestellt als **stilisierte Soldaten** (Entscheidung 2026-10-30; Art-Style siehe Abschnitt 8), die in einer kompakten Formation stehen (Reihen, max. Breite begrenzt).
- Die Formation wird als Ganzes horizontal bewegt. Über der Truppe steht die sichtbare Zahl `N`.
- Jede Einheit feuert automatisch gerade nach vorne mit **Feuerrate R** und **Schaden D**.
- Einheiten werden durch Gegnerkontakt oder Treffer entfernt. Bei `N = 0` ist der Lauf verloren.

### 5.2 Bewegung
- Nur X-Achse. Die Bahn hat Begrenzungen; die Formation kann nicht über den Rand.
- Eingabe: Finger-/Maus-Drag (relativ, 1:1 Bewegung), Tastatur `A/D` bzw. Pfeiltasten, optional Gamepad-Stick.
- Es gibt **keine** Vorwärts-Steuerung: Die Welt scrollt automatisch auf die Truppe zu (konstante, pro Level steigende Geschwindigkeit).

### 5.3 Tore (Gates) – das Herzstück
Tore erscheinen paarweise (oder zu dritt) nebeneinander, der Spieler kann nur eines durchfahren.

| Tor-Typ          | Startwert | Wirkung beim Durchfahren                   | Anschießbar?             |
|------------------|-----------|--------------------------------------------|--------------------------|
| `+N Einheiten`   | +1        | Fügt N Einheiten hinzu                      | ja, jeder Treffer +1     |
| `xM Einheiten`   | x1        | Multipliziert Einheitenzahl                 | ja, steigt bis x2…x3     |
| `+Schaden`       | +10 %     | Erhöht Schaden pro Einheit (für den Lauf)   | ja                       |
| `+Feuerrate`     | +10 %     | Erhöht Feuerrate                            | ja                       |
| `Waffe wechseln` | –         | Neue Waffe (Streuschuss, Laser, Raketen)    | nein (Entscheidung)      |
| `-N Einheiten`   | -5        | Entfernt N Einheiten                        | ja, Treffer schwächen ab |
| `÷M Einheiten`   | ÷2        | Halbiert die Truppe                         | ja, bis zu ÷1            |

Kernregel: **Beschuss verbessert Tore.** Ein rotes Tor kann durch genügend Treffer neutral oder sogar positiv werden. Das schafft die zentrale Entscheidung: *schieße ich auf das Tor oder auf die Gegner dahinter?*

### 5.4 Gegner
| Typ           | Verhalten                                          | Rolle                   |
|---------------|----------------------------------------------------|-------------------------|
| Läufer        | rennt gerade auf die Truppe zu, stirbt bei Kontakt  | Masse, "Zahlen-Futter"  |
| Panzer        | langsam, viele HP, schiebt die Truppe zurück        | Schadens-Check          |
| Schütze       | bleibt auf Distanz, feuert Projektile               | zwingt zum Ausweichen   |
| Spalter       | zerfällt beim Tod in 2–3 Läufer                     | Chaos                   |
| Schild-Träger | Front-Schild, nur von der Seite verwundbar          | Positionsspiel          |
| Mini-Boss     | Ende jeder zweiten Welle, Spezialangriff            | Zwischenhöhepunkt       |
| Boss          | Level-Ende, Phasen, beschwört Gegnerwellen          | Finale                  |

Gegner tragen eine HP-Zahl über dem Kopf (die Werbe-Ästhetik: "Gegner mit 2 500 HP gegen meine 180 Soldaten").

### 5.5 Hindernisse
- Barrieren (blocken Schüsse, müssen umfahren werden)
- Zerstörbare Fässer (explodieren, Flächenschaden)
- Lane-Teiler (Bahn teilt sich kurzzeitig, Entscheidung links/rechts)

### 5.6 Waffen (pro Lauf wählbar über Tore)
- **Standard**: Einzelschuss, gute Reichweite
- **Streuschuss**: 3 Projektile, kurze Reichweite, hoher Nahschaden
- **Laser**: durchdringt Gegner, konstanter Schaden
- **Raketen**: langsam, Flächenschaden

### 5.7 Scoring & Belohnung
- Münzen: pro Gegner, Bonus für Boss, Bonus für "kein Verlust".
- Sterne (1–3) pro Level nach verbleibender Truppengröße.
- Highscore pro Level (Endgröße der Truppe) und Endlos-Modus-Bestleistung.

## 6. Progression

### 6.1 Im Lauf (temporär, Reset bei Level-Ende)
Alles aus den Toren: Einheiten, Schaden, Feuerrate, Waffe.

### 6.2 Meta (permanent gespeichert)
Im **Shop** ausschließlich mit **Ingame-Münzen** kaufbar – nie mit Echtgeld. Kleine Prozentschritte, bewusst flach (kein Grind-Zwang):
- Start-Einheiten (3 → 10)
- Basis-Schaden
- Basis-Feuerrate
- Bewegungsgeschwindigkeit
- Münz-Multiplikator
- Kosmetik (Farben/Skins der Truppe, Projektil-Farben) – rein optisch, auch durch Erfolge freischaltbar

### 6.3 Level-Struktur
- **Kampagne**: 30 handgebaute Level in 3 Welten (Wüste, Stadt, Raumstation), jedes mit festem Tor-/Gegner-Script; Boss alle 10 Level.
- **Endlos-Modus**: prozedural generierte Abschnitte mit steigender Schwierigkeit, Bestenliste lokal.
- **Tägliche Herausforderung** (optional, später): seed-basiert, gleich für alle (Seed = Datum).

### 6.4 Speichern & Konten
- **Gast-Modus (Standard)**: Spielen ohne Konto, Fortschritt liegt lokal im Browser (IndexedDB). Kein Login-Zwang, kein Hinweis-Spam.
- **Optionales Konto**: Anmeldung mit **Google** (OpenID Connect). Der Fortschritt (Münzen, Upgrades, Sterne, Bestleistungen, Kosmetik) wird auf dem Server gespeichert und auf allen Geräten synchronisiert. Beim ersten Login wird der lokale Gast-Fortschritt übernommen (Zusammenführen: Maximum pro Wert, Münzen addiert).
- **Konto löschen** ist jederzeit in den Einstellungen möglich und entfernt alle Serverdaten sofort.
- Gespeichert werden nur: Google-Nutzer-ID, E-Mail, Anzeigename, Spielstand, Zeitstempel. Keine Werbe-IDs, kein Tracking.

## 7. Spielgefühl ("Juice")

Das ist der Unterschied zwischen "funktioniert" und "macht Spaß":
- Treffer-Zahlen (Floating Damage Numbers), bei kritischen Treffern größer und farbig
- Screen-Shake bei Explosionen und Boss-Treffern
- Partikel: Mündungsfeuer, Einschläge, Gegner zerplatzen in Low-Poly-Splitter
- Tor-Wert "ploppt" bei jedem Treffer
- Truppe wächst sichtbar mit Pop-Animation neuer Einheiten
- Zeitlupe (0,3 s) beim Boss-Kill
- Combo-Zähler bei schnellen Kills
- Kamera zoomt leicht heraus, wenn die Truppe wächst

## 8. Art-Direction

**Qualitätsanspruch: High Polish.** LSG soll nicht wie ein Hyper-Casual-Wegwerfspiel aussehen, sondern wie ein hochwertiges, stilisiertes 3D-Spiel. Die Entwicklung beginnt mit Platzhaltern (Greybox), aber die Ziel-Qualität ist von Anfang an definiert und hat eigene Meilensteine im Plan.

### 8.1 Stil
- **Stilisiert-realistisch** ("Stylized PBR"): klare Formen und satte Farben wie bei *Overwatch*, *Fortnite* oder *Valorant*, aber mit echten Materialien (Metall, Rauheit, Emissive-Leuchtflächen), nicht Flat-Shaded.
- Konsistente Formensprache: Truppe kantig-heroisch, Gegner organisch-bedrohlich, Tore leuchtend-technisch. Jede Silhouette ist auf einen Blick lesbar.
- Farbdramaturgie pro Welt: Wüste (warm, Sand/Orange/Türkis), Stadt bei Nacht (Neon, Regen, Reflexionen), Raumstation (kalt, Blau/Weiß, Hologramme).

### 8.2 Modelle & Animation
- Alle Spielobjekte als **glTF-Modelle** mit PBR-Materialien (Base Color, Metallic/Roughness, Normal, Emissive), gebaut in Blender.
- **Riggen und Animieren**: Einheiten (Laufen, Schießen, Jubeln, Tod), Gegner (Laufen, Angriff, Tod, Spawn), Bosse (Phasen-Wechsel, Spezialangriffe). Animationen laufen auf GPU-Instanzen (Skinning + Instancing), damit hunderte animierte Einheiten performant bleiben.
- Level-of-Detail (LOD): 2–3 Stufen pro Modell für Tiefe und Mobile.
- Umgebung: modulare Set-Pieces pro Welt (Gebäude, Felsen, Brücken, Lampen, Fahrzeuge), Dekoration außerhalb der Bahn (Parallax-Tiefe), animierte Elemente (Fahnen, Ventilatoren, Hologramme, Verkehr).

### 8.3 Beleuchtung & Rendering
- Physikalisch basiertes Rendering, HDR-Umgebungsbeleuchtung (Image Based Lighting) pro Welt, Tone Mapping (ACES).
- Dynamische Schatten (Cascaded Shadow Maps) für Truppe, Gegner und Umgebung.
- **Post-Processing-Stack**: Bloom (Leuchteffekte für Tore, Projektile, Emissive), SSAO/GTAO, Tiefenschärfe (leicht, Tiefe der Bahn), Vignette, Farbkorrektur/LUT pro Welt, Chromatic Aberration bei Treffern, Motion Blur optional, FXAA/SMAA.
- Weltspezifische Effekte: Hitzeflimmern (Wüste), Regen + nasse Reflexionen (Stadt), Sternenfeld + Planeten (Raumstation).
- Qualitätsstufen (Niedrig/Mittel/Hoch/Ultra) mit automatischer Erkennung, damit Mobile stabil 60 FPS hält und Desktop das volle Bild zeigt.

### 8.4 Partikel & VFX
- GPU-Partikelsystem (zehntausende Partikel) mit Texturatlas, Soft Particles, additivem und Alpha-Blending.
- Mündungsfeuer mit Lichtblitz, Patronenhülsen, Rauchfahnen; Projektil-Trails (Ribbons); Einschläge mit Funken, Decals und Lichtimpuls.
- Gegner-Tod: materialspezifische Zerstörung (Metall-Splitter, organische Fragmente, Explosionen mit Druckwelle und Rauch).
- Tore: animierte Shader (Energiefeld, Scanlines, Pulsieren beim Treffer), Zahl mit 3D-Pop.
- Bosse: große Set-Piece-Effekte (Laser-Sweeps, Schockwellen, Raketenhagel mit Rauchspuren).
- Shader-Effekte: Dissolve beim Spawn/Tod, Hit-Flash, Schild-Hex-Shader, Fresnel-Umrandung.

### 8.5 UI/UX-Polish
- Eigenes UI-Design-System: Typografie, Icons, animierte Übergänge (Menüs gleiten/faden, Zahlen zählen hoch), Partikel bei Sternen-Vergabe.
- 3D-Elemente im Menü (Truppe steht im Hauptmenü in Szene, Shop zeigt Skins live).
- Haptik auf Mobile (Vibration API) bei Treffern und Toren.

### 8.6 Asset-Strategie (Entscheidung 2026-10-30: keine gekauften Assets)
Alle Assets entstehen auf zwei Wegen, ohne Budget:
1. **Automatisch erzeugt**: Modelle, Texturen und Animationen werden per Code generiert – prozedurale Geometrie in Three.js, Blender-Python-Skripte (headless im Tools-Container), prozedurale Shader-Texturen, Partikel und VFX komplett in Shadern. Das deckt Tore, Projektile, Effekte, Umgebungs-Module, Hindernisse und viele Props ab.
2. **Offene, frei verfügbare Assets aus dem Internet** (CC0 oder CC-BY mit Namensnennung): z. B. Kenney.nl, Quaternius, Poly Haven (HDRIs, PBR-Texturen), OpenGameArt, Sketchfab (nur CC0/CC-BY-Filter), Mixamo (Charakter-Animationen, Adobe-Lizenz erlaubt Spielnutzung), freesound.org und Kenney für Audio. Das deckt Soldaten-Charaktere, Gegner-Basismodelle, Animationen, HDRIs, Texturen und Sounds ab.

Regeln:
- Jedes heruntergeladene Asset wird in `docs/ASSETS.md` mit Quelle, Autor, Lizenz und Änderungen protokolliert; CC-BY-Nennungen erscheinen im Spiel unter "Credits".
- Heruntergeladene Assets werden in Blender vereinheitlicht (Maßstab, Pivot, Material-Setup, Polycount-Budget), damit der Look konsistent bleibt.
- Charaktere werden nach Möglichkeit aus wenigen Basismodellen mit Varianten (Farben, Ausrüstung) gebaut, damit Truppe und Gegner zusammenpassen.
- Eine Art-Bible (Meilenstein "Art-Pipeline") fixiert Palette, Material-Regeln und Budgets vor der Massenproduktion.

## 9. Audio

- **Web Audio API** direkt. Ein `AudioManager` mit Pooling und Lautstärke-Gruppen (Master/SFX/Musik).
- SFX zunächst **synthetisch erzeugt** (jsfxr-artige Generierung zur Laufzeit – null Assets, null Ladezeit), später optional durch kleine `.ogg`/`.webm`-Dateien ersetzt.
- Musik: kurze Loops pro Welt (CC0 oder selbst produziert), Boss-Track, dynamisches Anheben der Intensität mit Truppengröße.
- Autoplay-Regel der Browser beachten: Der Audio-Kontext wird beim ersten Tap/Klick entsperrt.

## 10. Plattform & Steuerung

- **Ziel**: aktuelle Chrome/Edge/Firefox/Safari auf Desktop, Android, iOS – reine Web-App, kein Store.
- **Handy hat den Fokus, Desktop ist gleichwertig**: Jedes Feature wird zuerst auf Touch/Hochformat entworfen und muss am Desktop (Maus/Tastatur, Querformat, große Auflösung, Stufe "Ultra") genauso gut funktionieren. Keine Plattform bekommt eine abgespeckte Version.
- Hochformat auf dem Handy, Querformat/Fenster am Desktop; die Bahn skaliert mit dem Seitenverhältnis.
- **PWA**: installierbar auf dem Homescreen, offline spielbar im Gast-Modus, Synchronisation bei Konto sobald online.
- **Sprachen**: Englisch ist Hauptsprache und wird zuerst umgesetzt; Deutsch folgt als zweite Sprache. Die Mehrsprachigkeit (alle Texte in Sprachdateien, keine Texte im Code, Pluralregeln, Zahlenformate) ist ab dem ersten Meilenstein Pflicht, damit weitere Sprachen nur neue Dateien brauchen.
- Performance-Ziel: 60 FPS auf einem 4 Jahre alten Mittelklasse-Handy bei 200 Einheiten + 100 Gegnern + 500 Projektilen auf dem Bildschirm.

## 11. Was LSG bewusst NICHT ist

- Keine Werbung, kein Tracking, keine Analytics von Dritten.
- Keine Echtgeld-Käufe, keine Energie-Systeme, keine Timer. Der Shop nimmt nur Ingame-Münzen.
- Kein Login-Zwang: Das komplette Spiel ist als Gast spielbar; ein Konto bringt nur Synchronisation.
- Kein Multiplayer. Ein Online-Leaderboard ist für später denkbar, da die Konten-Infrastruktur dann vorhanden ist.
- Keine gekauften Assets.

## 12. Konten, Backend & Admin-Bereich

Das Spiel selbst läuft vollständig im Browser. Für optionale Konten gibt es einen kleinen Server (Teil des Docker-Compose-Stacks, siehe PLAN.md).

### 12.1 Spielerkonten
- Login nur über **Google** (OpenID Connect). Kein eigenes Passwort-System für Spieler – weniger Angriffsfläche, kein Passwort-Reset nötig.
- Funktionen: Fortschritt synchronisieren, Gerät wechseln, Konto löschen, Daten exportieren (JSON).
- Server-Zustand ist die Quelle der Wahrheit bei Konflikten; der Client cached lokal und spielt offline weiter.

### 12.2 Admin-Bereich
- Eigener Bereich unter `/admin`, **nicht** über Google, sondern mit **lokalem Admin-Konto** (Benutzername + starkes Passwort, Argon2-Hash, optional TOTP-Zweitfaktor). Erstes Admin-Konto wird beim ersten Start aus Umgebungsvariablen bzw. per CLI-Befehl angelegt.
- Der Admin konfiguriert im Admin-Bereich:
  - **Öffentliche Domain/Adresse** des Spiels (z. B. `https://lsg.example.com`). Sie ist nicht fest im Code oder in der Compose-Datei, sondern wird im Admin-Bereich gesetzt. Vorschlag beim ersten Aufruf: die Adresse, über die der Admin-Bereich gerade geöffnet ist. Daraus leitet die App Google-Rücksprung-Adressen, Secure-Cookies und Links ab.
  - **Google-Login mit Einrichtungsassistent**: Der Assistent zeigt Schritt für Schritt, was in der Google Cloud Console einzustellen ist, mit exakten, kopierbaren Werten aus der eingestellten Domain: Autorisierte JavaScript-Quellen, Autorisierte Weiterleitungs-URI, benötigte Scopes (`openid`, `email`, `profile`), Autorisierte Domain für den OAuth-Zustimmungsbildschirm, Hinweise zu Test-/Produktionsstatus. Danach trägt der Admin Client-ID und Client-Secret ein (verschlüsselt in der Datenbank gespeichert) und kann die Konfiguration testen. Der Login-Button im Spiel erscheint erst, wenn Google aktiviert und erfolgreich getestet ist.
  - Datenbank-/Server-Status (Verbindung, Migrationen, Versionen) – die Datenbank-Verbindung selbst kommt aus der Umgebung, weil sie vor jedem Login existieren muss.
  - Spielerverwaltung: Suche, Spielstand ansehen, Konto sperren/löschen (DSGVO-Auskunft und -Löschung).
  - Spiel-Konfiguration: Balancing-Werte, Feature-Schalter (z. B. Daily Challenge an/aus), Wartungsmodus, Ankündigungstext.
  - Kennzahlen ohne Tracking: Anzahl Konten, aktive Spieler pro Tag (serverseitig gezählt), Level-Abschlussraten – aggregiert, ohne Drittanbieter.
- Audit-Log aller Admin-Aktionen.

### 12.3 Datenschutz
- Datensparsamkeit: nur die in 6.4 genannten Felder.
- Datenschutzerklärung und Impressum im Spiel (Pflicht beim Betrieb in der EU, Google-Login verarbeitet personenbezogene Daten).
- Alle Daten liegen auf dem eigenen Server des Betreibers; keine Weitergabe an Dritte außer dem Google-Login selbst.

## 13. Erfolgskriterien für Version 1.0

- 30 Kampagnen-Level + Endlos-Modus, 3 Bosse, 4 Waffen, 7 Gegnertypen.
- Alle Spielobjekte als finale, animierte PBR-Modelle; keine Platzhalter mehr sichtbar.
- Post-Processing-Stack und GPU-Partikel aktiv; Qualitätsstufen funktionieren auf Mobile und Desktop.
- Durchschnittliche Session ≥ 5 Minuten im Selbsttest mit 5 Testpersonen; Testpersonen bewerten die Optik als "hochwertig".
- Erster Start < 5 s bei 4G (Kern-Bundle < 3 MB, Welten-Assets werden nachgeladen und gecacht).
- Stabil 60 FPS auf Mittelklasse-Handy (Stufe "Mittel") und auf Desktop (Stufe "Ultra").
- Spielbar auf Handy per Touch und auf Desktop per Maus/Tastatur, ohne Erklärung.
- Gast-Modus vollständig offline spielbar; Google-Login synchronisiert den Fortschritt zwischen zwei Geräten; Konto-Löschung funktioniert.
- Admin-Bereich: lokaler Login, Google-OAuth-Konfiguration, Spielerverwaltung, Audit-Log.
- UI vollständig auf Englisch, Deutsch als zweite Sprache umschaltbar; keine Texte im Code.
- Alle Assets dokumentiert in `docs/ASSETS.md` mit Lizenz; Credits im Spiel.
- Gesamter Stack startet mit `docker compose up` auf dem eigenen Server.
