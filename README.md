# Firmware-Emulator — Versteckspiel Gruppe 22

Vier virtuelle Geräte und ein virtuelles Handy im Browser. Der Emulator spielt die
Firmware durch, die auf dem ESP32 laufen soll: **Einschalten → Menü → WLAN des Geräts →
Handy-Einstellungen → gemeinsamer Start → Runde in einem der vier Modi → Ausschalten.**

**Ton ist absichtlich stumm.** Von Dorian ist noch kein Sound geliefert (`TONPAKET_DORIAN.md`,
38 Sounds, Block A–D). Der Emulator ruft jeden Sound mit dem Namen aus dieser Liste auf,
zählt die Aufrufe und zeigt sie im Tonpaket-Fenster — man sieht also, *wo* welcher Ton
gebraucht wird. Kommt eine Datei, spielt sie ohne Codeänderung (siehe unten).

## Im Netz

**https://lagzy.github.io/versteckspiel-emulator/** (Repo `lagzy/versteckspiel-emulator`,
GitHub Pages aus `main`). Jeder Push auf `main` baut die Seite in etwa einer Minute neu.

## Starten

Doppelklick auf `index.html` — es gibt keinen Build, kein npm, keine Fremdbibliothek und
keine Netzverbindung. Wenn der Browser `localStorage` unter `file://` blockiert (dann
vergisst ein Gerät seine Einstellungen), lokal servieren:

```
py -3 -m http.server 8791 --directory 03_Firmware/emulator
# dann http://localhost:8791/index.html öffnen
```

## Bedienung

| Was | Wie |
|---|---|
| Gerät einschalten | Knopf am Gerät **2 s halten** (Ring zeigt den Fortschritt) |
| Modus wählen | Knopf **einmal** drücken — jeder Druck schaltet weiter |
| Runde starten | Knopf **zweimal schnell** drücken (Doppeldruck startet den Modus, der angezeigt ist) |
| Alle Spieler starten | jedes Gerät drückt innerhalb von **10 s** (Regeln 2.3) |
| Spieler bewegen | farbige Marke auf dem Spielfeld ziehen; 1 Kästchen = 1 m |
| Handy | „WLAN einschalten“ → Gerät antippen → Seite `http://192.168.4.1` |
| Einstellungen | Handy-Reiter **Einstellungen**: Modus, Dauer, Wartezeit, Sucher — „Für alle Geräte speichern“ verteilt sie per ESP-NOW an alle Geräte im Raum |
| Gerät ausschalten | Knopf **2 s halten** |
| Zeitraffer | Rundenuhr 1× / 5× / 20× — Knopfdrücke bleiben Echtzeit, der Piepton-Rhythmus auch |

Die vier Geräte starten **aus**. Das ist Absicht: der Ablauf „einschalten, Modus wählen,
losspielen“ (A-15, unter fünf Minuten) soll im Emulator wirklich durchlaufen werden.
Wer nur schnell spielen will: **Alle einschalten**.

### Gehäuse: 1:1 zum CAD

Das Gehäuse ist **ein SVG in den CAD-Koordinaten** (`viewBox 0 0 1072 808`), also
Pixel für Pixel aus Vlads Front-Rendering übernommen — nicht mehr mit CSS-Kästen
nachgebaut. Alle Teile liegen an den ausgemessenen Werten:

| Teil | CAD (gemessen) | im Emulator |
|---|---|---|
| Schale | 1072 × 808, Eckenradius 105 | `rect rx=105` + Randnaht bei 15 px |
| dunkle Platte | x 140–932 · y 121–327 · r 28 | derselbe Pfad |
| Summer-Tab | x 249–519 · ab y 327 · elliptischer Boden 135/112 | derselbe Pfad + Ring bei (384, 455) |
| LCD-Fenster | x 246–525 · y 192–256 (4,36 : 1) | HTML-LCD exakt in diesem Fenster |
| Pulslinie | Basis y 606 · Spitze x 500 (y 514) · Senke x 532 (y 690) | derselbe Pfad, 4 px |
| PULSE | x 536–922 · y 150–300 | Konturschrift, Bounding-Box 538–919 / 169–283 |
| Eck-Riffelung | Randstreifen, Striche im 45°-Winkel | 14 Linien je Ecke, 3,4 px, 38 % Deckkraft |

Prüfbar: `tools/check_emulator.py` vergleicht diese Zahlen mit `js/app.js` und
`style.css`. Das LCD zeigt echten Inhalt (weiss auf schwarz, 128 × 32) statt der
leeren Fläche im Rendering.

## Display: was wirklich verbaut wird

| | Wert | Quelle |
|---|---|---|
| Bauteil | 0,91-Zoll-OLED-Modul, 5 Stück, 6.73 CHF | `05_Abrechnung.xlsx` A-02, Bestellung 10.11.2026 |
| Auflösung | **128 × 32 px** (Variante WEISS) | Beleg-Screenshot `01_Dokumente/belege/AliExpress_2026-11-10/03_Summer_OLED_1.44_6.73.png` |
| Seitenverhältnis | **4 : 1** (quer) | 128 / 32 |
| Aktive Fläche | ≈ 2,2 × 0,6 cm (aus 0,91" Diagonale und 4:1 gerechnet) | Rechnung, keine Herstellerangabe |

Der Emulator zeichnet das LCD deshalb **4:1** und **weiss auf schwarz** (so sieht ein
monochromes OLED aus), nicht cyan wie im CAD-Rendering. Der Boot-Log schreibt
«Display 0,91" OLED 128x32 ok». Drei Textzeilen passen auf 32 px Höhe: Modus + Zone,
Status + Restzeit, Nähe-Balken; alles Weitere steht unter dem Gehäuse.

**Zwei Punkte fürs Team, nicht vom Emulator erfunden:**

1. `P U2_Projektwissen.txt`, `STATUS.md` und `AGENTS.md` nennen «Display 1,5 × 2,5 cm».
   Das passt nicht zum bestellten Modul (128 × 32 px, 0,91 Zoll, ≈ 2,2 × 0,6 cm).
   Eine der beiden Angaben ist falsch — bitte am Bauteil nachmessen.
2. Das Maskottchen ist als **64 × 64 px** Sprite für ein **128 × 64**-Display gezeichnet
   (`04_Maskottchen/README.md` sagt das selbst). Auf 32 px Höhe passt es nicht; es
   braucht eine Neuaustellung in 32 px, bevor es in die Firmware geht.

## Handyseite: ein Raum, alle Geräte

Die Seite `http://192.168.4.1` gehört dem Gerät, dessen WLAN das Handy gerade nutzt
(z. B. A), zeigt aber den **ganzen Raum**:

- Reiter **Raum**: kleines Feld mit allen Geräten an ihrer Position (grau = aus,
  gestrichelt = ausser Reichweite), darunter je Gerät Modus, Status, Akku und Abstand.
- Reiter **Einstellungen**: ein Formular. „Für alle Geräte speichern“ schickt die
  Einstellung per ESP-NOW vom verbundenen Gerät an alle anderen — **kein Knopfdrücken
  an jedem Gerät**. Geräte ausser Reichweite werden im Ergebnis genannt und behalten
  ihre alte Einstellung.
- Reiter **Regeln**: die Kurzfassung der Spielregeln (A-07).

Am Gerät selbst braucht man den Knopf dann nur noch zum Ein-/Ausschalten und für den
gemeinsamen Start (Doppeldruck) — der Modus kommt vom Handy.

## Aussehen

Die Geräte sind dem CAD nachempfunden (Foto von Vlad, 16.11.): orange Schale mit
Randnaht, dunkle Platte mit blauem LCD und «PULSE», darunter der geriffelte Summer,
darunter die dünne Pulslinie. Das Display ist wie im CAD **quer**; der Inhalt passt
sich an (Modus + Zone oben, Status + Restzeit in der Mitte, Nähe-Balken unten) und
wird automatisch verkleinert, statt abgeschnitten. Der Knopf sitzt unter dem Gehäuse,
weil im CAD-Frontbild keiner zu sehen ist.

## Was der Emulator abbildet

| Anforderung | Im Emulator |
|---|---|
| A-01 Ton beim Drücken | jeder Knopfdruck ruft `snd_btn_click` (stumm, LED + Log) |
| A-02 Geräte erkennen sich, Abstand | ESP-NOW-Modell: Abstand aus Position, Reichweite 12 m, Rauschen ±0,25 m |
| A-03 vier Spielmodi | Klassisch, Zeitdruck, Rollentausch, Zombie — alle spielbar |
| A-04 2 bis 4 Spieler | Startprüfung: zu wenige / zu viele Geräte werden abgelehnt (mit `error`-Ton) |
| A-05 Display: Modus, Restzeit, Status | 0,91"-OLED 128 × 32 (4:1) je Gerät, weiss auf schwarz, Zonen-Balken, Fang-Ring |
| A-06 ein Knopf | alles über kurz / 2 s halten |
| A-07 Regeln auf der Geräte-Webseite | Reiter „Regeln“ auf der Handyseite |
| A-08 Modus/Dauer/Wartezeit über Handy | Formular schreibt in „nvs“ (localStorage) aller Geräte im Raum, überlebt Neustart |
| A-09 Töne blockieren nicht | alle Töne sind Ereignisse, die Runde läuft weiter |
| A-10 zwei Stunden Akku | Akku sinkt 0,80 %/min (≈ 2 h), Warnung bei 20 % |
| A-11 Schutz vor Tiefentladung | Abschaltung bei 0,4 % = 3,00 V, `snd_battery_empty` |

Alle Zahlen stehen in `js/config.js` und stammen aus `Spielregeln/spielregeln.md`
(Kap. 2–6 und Kap. 10 „Geräteparameter“) sowie aus `01_Dokumente/01_Anforderungsliste.docx`.

## Dateien

```
index.html          Aufbau der Seite (Feld, 4 Geräte, Handy, zwei Fenster)
style.css           Aussehen
js/config.js        alle Parameter: Piepton-Gesetz, Zonen, Runden, Stufen, Akku, Funk
js/sound.js         die 38 Sound-IDs aus TONPAKET_DORIAN.md + stumme Wiedergabe
js/device.js        ein Gerät: Start, Menü, Knopf, Akku, Display-Inhalt
js/game.js          Rundenlogik der vier Modi (Rollen, Fang, Stufen, Infektion)
js/app.js           Oberfläche: Feld, Gerätekarten, Handy, Log, Auto-Demo
tools/check_emulator.py   Prüfskript (stdlib): Zahlen, Sound-IDs, verdrahtete IDs
```

## Wenn Dorian Sounds liefert

1. Datei als `sounds/<name>.wav` (oder `.mp3`) ablegen, `name` = ID aus `sound.js`
   (`boot_up`, `ping_tick`, `capture`, …).
2. Seite neu laden. `Sound.loadFiles()` findet die Datei, `Sound.muted` fällt weg,
   der Knopf oben rechts zeigt `Ton: n/38`.
3. Kein Code wird geändert. Fehlt eine Datei, bleibt nur dieser eine Ton stumm.

Was noch fehlt, ist die **Klangform selbst** (Piezo-Mono, Ticks ≤ 60 ms, Grollen
150–220 Hz): der Emulator prüft keine Frequenzen, er spielt ab, was kommt.

## Grenzen (bewusst)

- **Kein echter Funk.** Der Abstand ist die gerade Linie im Spielfeld; Wände, Körper und
  Metall, die die Schätzung ungenau machen (Regeln 1), gibt es nicht.
- **Keine echten Töne**, siehe oben.
- **Kein Gehäuse, kein 3D-Druck, keine Platine** — A-12 bis A-14 sind nicht Teil des Emulators.
- Die Positionen sind frei ziehbar, es gibt keine Kollision und keine Geschwindigkeit.
- Das Geräte-WLAN ist offen und hat kein Passwort — wie im Projekt vorgesehen.

## Wenn etwas nicht stimmt

| Symptom | Ursache |
|---|---|
| Gerät reagiert nicht auf den Knopf | es ist aus — 2 s halten |
| „Start abgebrochen — verschiedene Modi“ | alle Geräte müssen denselben Modus haben (Regeln §8) |
| „Start abgebrochen — nicht alle Geräte innerhalb von 10 s“ | zu langsam gedrückt; alle nochmal |
| Handy findet kein Netzwerk | das Gerät ist aus (WLAN geht mit dem Gerät an und aus) |
| Einstellungen weg | `file://` blockiert localStorage → über `http.server` öffnen |
| Alles zurücksetzen | Browserseite neu laden, dann „Alles aus“ |
