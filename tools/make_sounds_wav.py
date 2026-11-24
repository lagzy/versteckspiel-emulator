# -*- coding: utf-8 -*-
"""Erzeugt emulator/sounds/<id>.wav aus dem Tonpaket (03_Firmware/sounds).

Quelle sind dieselben beep-lab-Exporte wie in der Firmware (snd_<name>.ino,
Dorian, 24.11.2026). Jede Note wird als Rechteck (Mono-Summer) synthetisiert:
22 050 Hz, 16 Bit, amplitude 0.7. Der Emulator lädt sounds/<id>.wav ohne
Codeänderung (js/sound.js).

Lauf:  py -3 tools/make_sounds_wav.py   (im Ordner 03_Firmware/emulator)
"""
import glob
import os
import re
import struct
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
SOUNDS_SRC = os.path.normpath(os.path.join(HERE, "..", "..", "sounds"))
OUT_DIR = os.path.join(HERE, "..", "sounds")
RATE = 22050
AMP = 0.7  # 70 %, damit Summen mehrerer Laeufe nicht clippen


def parse(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//.*", "", text)

    def define(name):
        return int(re.search(r"#define\s+%s\s+(\d+)" % name, text).group(1))

    tempo, steps, count = define("TEMPO_BPM"), define("SONG_STEPS"), define("NOTE_COUNT")
    gate = define("GATE_PCT")
    step_ms = 60000.0 / (tempo * 4.0)

    def array(name):
        m = re.search(r"const\s+uint\d+_t\s+%s\s*\[[^\]]*\]\s*=\s*\{(.*?)\};"
                      % name, text, re.S)
        return [int(x) for x in re.findall(r"-?\d+", m.group(1))]

    n_step, n_len, n_f = array("N_STEP"), array("N_LEN"), array("N_F")
    if not (len(n_step) == len(n_len) == len(n_f) == count):
        raise ValueError(path)
    notes = [[n_step[i] * step_ms,
              n_step[i] * step_ms + n_len[i] * step_ms * gate / 100.0,
              n_f[i]] for i in range(count)]
    notes.sort(key=lambda n: n[0])
    for i in range(len(notes) - 1):  # mono: Ueberlappung kuerzen
        if notes[i][1] > notes[i + 1][0]:
            notes[i][1] = notes[i + 1][0]
        if notes[i][1] <= notes[i][0]:
            notes[i][1] = notes[i][0] + 10.0
    total = steps * step_ms
    for n in notes:
        n[1] = min(n[1], total)
    notes = [n for n in notes if n[1] > n[0] + 0.5]
    return notes, total


def synth(notes, total):
    n_samples = int(round(total * RATE / 1000.0))
    buf = bytearray(n_samples * 2)
    active = sorted(notes, key=lambda n: n[0])
    idx = 0
    cur = None
    for i in range(n_samples):
        t_ms = i * 1000.0 / RATE
        while idx < len(active) and active[idx][0] <= t_ms:
            cur = active[idx]
            idx += 1
        if cur and t_ms >= cur[1]:
            cur = None
        hz = cur[2] if cur else 0
        if hz > 0:
            phase = (t_ms / 1000.0) * hz
            v = AMP if (phase % 1.0) < 0.5 else -AMP
        else:
            v = 0.0
        struct.pack_into("<h", buf, i * 2, int(v * 32767))
    return bytes(buf)


def main():
    files = sorted(glob.glob(os.path.join(SOUNDS_SRC, "snd_*.ino")))
    if not files:
        print("keine snd_*.ino in %s" % SOUNDS_SRC)
        sys.exit(1)
    os.makedirs(OUT_DIR, exist_ok=True)
    for path in files:
        sid = os.path.basename(path)[:-4].replace("snd_", "")
        notes, total = parse(path)
        data = synth(notes, total)
        out = os.path.join(OUT_DIR, sid + ".wav")
        with wave.open(out, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(data)
        print("%s.wav  %.2f s  %d Noten" % (sid, total / 1000.0, len(notes)))
    print("OK: %d Dateien in %s" % (len(files), os.path.normpath(OUT_DIR)))


if __name__ == "__main__":
    main()
