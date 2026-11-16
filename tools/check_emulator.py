#!/usr/bin/env python3
"""Prüfskript für den Firmware-Emulator (nur Standardbibliothek).

Prüft, was das Auge übersieht: dass die Zahlen im Emulator noch zu den
Projektdateien passen, dass jede Sound-ID aus Dorians Tonpaket wirklich
aufgerufen wird und dass die Seite ihre Skripte in der richtigen Reihenfolge lädt.

Aufruf:  py -3 tools/check_emulator.py
Letzte Zeile: "ALL CHECKS PASSED" oder "FAILURES: n"  (Exit-Code immer 0)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 03_Firmware/emulator
PROJECT = ROOT.parent.parent                           # Projektordner

fails = []
checks = 0


def ok(cond, msg):
    global checks
    checks += 1
    if not cond:
        fails.append(msg)


def read(p):
    return p.read_text(encoding="utf-8", errors="replace")


cfg = read(ROOT / "js" / "config.js")
snd = read(ROOT / "js" / "sound.js")
dev = read(ROOT / "js" / "device.js")
game = read(ROOT / "js" / "game.js")
app = read(ROOT / "js" / "app.js")
html = read(ROOT / "index.html")

# --------------------------------------------------------------------------- 1
# Piepton-Gesetz: Abstand aufsteigend, Intervall aufsteigend
law = c = None
block = re.search(r"beepLaw:\s*\[(.*?)\],\s*silentFromM", cfg, re.S)
ok(block is not None, "config.js: beepLaw fehlt")
if block:
    pairs = re.findall(r"\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]", block.group(1))
    ok(len(pairs) >= 6, f"config.js: beepLaw hat nur {len(pairs)} Stützpunkte (erwartet 6)")
    dists = [float(a) for a, _ in pairs]
    ints = [float(b) for _, b in pairs]
    ok(dists == sorted(dists), f"config.js: beepLaw-Abstände nicht aufsteigend: {dists}")
    ok(ints == sorted(ints), f"config.js: beepLaw-Intervalle nicht aufsteigend: {ints}")
    ok(dists[:3] == [1.0, 2.0, 3.0] and ints[:3] == [0.12, 0.25, 0.50],
       "config.js: beepLaw weicht von Regeln Kap. 10 ab (1 m 0,12 s / 2 m 0,25 s / 3 m 0,50 s)")

ok(re.search(r"silentFromM:\s*10", cfg) is not None, "config.js: Stille erst ab 10 m (Regeln 2.1)")
ok(re.search(r"capture:\s*\{\s*seconds:\s*3,\s*distanceM:\s*2", cfg) is not None,
   "config.js: Fang = 3 s innerhalb von 2 m (Regeln 2.2)")
ok(re.search(r"windowSec:\s*10", cfg) is not None, "config.js: Startfenster 10 s (Regeln 2.3)")
ok(re.search(r"holdToPowerMs:\s*2000", cfg) is not None, "config.js: Knopf 2 s = ein/aus (Regeln 2.3)")
ok(re.search(r"emptyV:\s*3\.00", cfg) is not None, "config.js: Abschaltung bei 3,0 V (A-11)")
ok(re.search(r"warnPct:\s*20", cfg) is not None, "config.js: Akku-Warnung bei 20 %")

# --------------------------------------------------------------------------- 2
# Runden und Schonzeiten gegen Spielregeln Kap. 10
modes = {}
for m in re.finditer(r"\{\s*id:\s*'([a-z]+)'(.*?)\}", cfg, re.S):
    body = m.group(2)
    round_ = re.search(r"round:\s*(\d+)", body)
    grace = re.search(r"grace:\s*(\d+)", body)
    modes[m.group(1)] = (int(round_.group(1)) if round_ else None,
                         int(grace.group(1)) if grace else None)
expected = {
    "klassisch": (300, 30),
    "zeitdruck": (180, 20),
    "rollentausch": (300, 0),
    "zombie": (300, 20),
}
ok(set(modes) == set(expected), f"config.js: Modi {sorted(modes)} statt {sorted(expected)}")
for k, (r, g) in expected.items():
    ok(modes.get(k) == (r, g),
       f"config.js: {k} hat Runde/Schonzeit {modes.get(k)}, Regeln Kap. 10 sagen {(r, g)}")

stages = re.findall(r"\{\s*from:\s*(\d+),\s*dist:\s*([\d.]+),\s*label:\s*'([^']+)'", cfg)
ok([(int(a), float(b)) for a, b, _ in stages] == [(0, 2.0), (60, 3.0), (120, 4.0), (150, 6.0)],
   f"config.js: Zeitdruck-Stufen {[(a, b) for a, b, _ in stages]} statt 0/60/120/150 s mit 2/3/4/6 m")
ok([c for _, _, c in stages] == ["STUFE 1", "STUFE 2", "STUFE 3", "ENDSPURT"],
   "config.js: Stufen-Beschriftung weicht von den Regeln ab")

ok(re.search(r"rounds:\s*4", cfg) is not None, "config.js: Rollentausch = 4 Runden (Regeln Kap. 5)")
ok(re.search(r"warnFromSec:\s*290", cfg) is not None, "config.js: Warnung ab 290 s (Regeln Kap. 5)")
ok(re.search(r"pauseSec:\s*15", cfg) is not None, "config.js: 15 s Pause beim Rollenwechsel")

# --------------------------------------------------------------------------- 3
# Sound-IDs: jede Zeile aus TONPAKET_DORIAN.md muss im Emulator vorkommen
tonpaket = PROJECT / "TONPAKET_DORIAN.md"
if tonpaket.exists():
    rows = re.findall(r"^\|\s*\d+\s*\|\s*`([a-z0-9_]+)`", read(tonpaket), re.M)
    ok(len(rows) == 38, f"TONPAKET_DORIAN.md: {len(rows)} Sounds erwartet, 38 gefunden")
    listed = re.findall(r"\{\s*id:\s*'([a-z0-9_]+)'", snd)
    missing = [r for r in rows if r not in listed]
    ok(not missing, f"js/sound.js: unbekannte IDs aus dem Tonpaket fehlen: {missing}")
    extra = [s for s in listed if s not in rows]
    ok(not extra, f"js/sound.js: IDs, die im Tonpaket nicht vorkommen: {extra}")
    called = set(re.findall(r"Sound\.play\([^,]+,\s*'([a-z0-9_]+)'\)", dev + game + app))
    ok(len(called) >= 20, f"nur {len(called)} Sound-IDs werden wirklich aufgerufen")
    stray = sorted(c for c in called if c not in rows)
    ok(not stray, f"Sound.play() mit unbekannter ID: {stray}")
else:
    ok(False, "TONPAKET_DORIAN.md nicht gefunden (Sound-Liste kann nicht geprüft werden)")

# --------------------------------------------------------------------------- 4
# Seite lädt die Skripte in der Reihenfolge, in der sie einander brauchen
order = re.findall(r'<script src="js/([a-z]+)\.js"', html)
ok(order == ["config", "sound", "device", "game", "app"],
   f"index.html: Skript-Reihenfolge {order} statt config, sound, device, game, app")

# --------------------------------------------------------------------------- 5
# Jede in app.js benutzte Element-ID muss im HTML existieren
ids_used = set(re.findall(r"""\$\(['"]#([A-Za-z0-9_-]+)['"]""", app))
ids_used |= set(re.findall(r"getElementById\(['\"]([A-Za-z0-9_-]+)['\"]\)", app))
ids_html = set(re.findall(r'id="([A-Za-z0-9_-]+)"', html))
ids_html |= set(re.findall(r'id="([A-Za-z0-9_-]+)"', app))   # Handy-Vorlagen in app.js
missing_ids = sorted(i for i in ids_used if i not in ids_html)
ok(not missing_ids, f"index.html: IDs fehlen, die app.js anspricht: {missing_ids}")

# --------------------------------------------------------------------------- 6
# Keine Baustellen im Code
for name, src in [("config.js", cfg), ("sound.js", snd), ("device.js", dev),
                  ("game.js", game), ("app.js", app), ("index.html", html)]:
    ok("TODO" not in src and "FIXME" not in src, f"{name}: offener TODO/FIXME-Marker")

# --------------------------------------------------------------------------- 7
# Vier Geräte, wie in der Aufgabe verlangt
ok(len(re.findall(r"\{\s*id:\s*'[A-D]',\s*color:", cfg)) == 4, "config.js: es müssen vier Geräte sein")

# --------------------------------------------------------------------------- out
print(f"Prüfungen: {checks}, Fehler: {len(fails)}")
for f in fails:
    print("  - " + f)
print("ALL CHECKS PASSED" if not fails else f"FAILURES: {len(fails)}")
sys.exit(0)
