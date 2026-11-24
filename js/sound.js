// ---------------------------------------------------------------------------
//  Sound layer - deliberately silent until Dorian delivers.
//
//  Every id below is a line of TONPAKET_DORIAN.md (Block A, 14 Sounds), so the
//  emulator calls exactly the names his homework uses (snd_<name>.json / .ino).
//  Block B-D are skipped since 24.11. (Dorian: not needed).
//  Nothing plays audio yet: play() only records the event, blinks the device LED
//  and writes a log line.  When a file arrives, drop it into sounds/<id>.wav or
//  sounds/<id>.json (beep-lab format) and set Sound.files[id] - play() then
//  really plays it, no other module has to change.
// ---------------------------------------------------------------------------

const SOUNDS = [
  // Block A - Pflicht (14). Block B-D sind am 24.11. übersprungen worden
  // (Dorian: "unnötig"), das Tonpaket bleibt bei Block A.
  { id: 'boot_up',        block: 'A', when: 'Einschalten (Knopf 2 s)' },
  { id: 'shutdown',       block: 'A', when: 'Ausschalten' },
  { id: 'btn_click',      block: 'A', when: 'jeder Knopfdruck (A-01)' },
  { id: 'mode_next',      block: 'A', when: 'Modus weiterblättern' },
  { id: 'mode_select',    block: 'A', when: 'Modus bestätigt' },
  { id: 'error',          block: 'A', when: 'Aktion geht nicht' },
  { id: 'ping_tick',      block: 'A', when: 'Grund-Tick des Piepton-Gesetzes' },
  { id: 'ping_dry',       block: 'A', when: 'Leerlauf-Tick bei 8 m' },
  { id: 'link_found',     block: 'A', when: 'anderes Gerät gefunden' },
  { id: 'link_lost',      block: 'A', when: 'ausser Reichweite' },
  { id: 'capture',        block: 'A', when: 'Fang (3-Sekunden-Regel, beide Geräte)' },
  { id: 'captured_me',    block: 'A', when: 'ich bin gefangen, Gerät sperrt' },
  { id: 'win',            block: 'A', when: 'Sieg' },
  { id: 'lose',           block: 'A', when: 'Niederlage' },
];

const Sound = {
  muted: true,
  files: {},          // id -> HTMLAudioElement, filled by loadFiles()
  counts: {},         // id -> number of triggers (shown in the Tonpaket drawer)
  recent: [],         // last 60 events {id, dev, t}
  audioReady: 0,

  init() {
    SOUNDS.forEach(s => { this.counts[s.id] = 0; });
  },

  // A delivered file wins over silence.  Missing file -> silent, as required.
  loadFiles() {
    SOUNDS.forEach(s => {
      for (const ext of ['wav', 'mp3', 'ogg']) {
        const url = `sounds/${s.id}.${ext}`;
        const a = new Audio(url);
        a.addEventListener('canplaythrough', () => {
          this.files[s.id] = a;
          this.audioReady++;
          this.muted = false;
        }, { once: true });
        a.addEventListener('error', () => {}, { once: true });
        break; // only the first candidate extension is tried per id
      }
    });
  },

  get total() { return SOUNDS.length; },
  get delivered() { return Object.keys(this.files).length; },

  play(dev, id) {
    if (!this.counts.hasOwnProperty(id)) return;
    this.counts[id]++;
    this.recent.unshift({ id, dev: dev ? dev.id : '-', t: Date.now() });
    if (this.recent.length > 60) this.recent.pop();
    const f = this.files[id];
    if (f && !this.muted) {
      try { f.currentTime = 0; f.play().catch(() => {}); } catch (e) { /* silent */ }
    }
    if (dev) dev.soundPulse(id);          // LED + display tick, the visual stand-in
    if (typeof Log !== 'undefined') Log.sound(dev, id);
  },
};

Sound.init();
