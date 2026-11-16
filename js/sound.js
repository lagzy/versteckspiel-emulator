// ---------------------------------------------------------------------------
//  Sound layer - deliberately silent until Dorian delivers.
//
//  Every id below is a line of TONPAKET_DORIAN.md (38 Sounds, Block A-D), so the
//  emulator calls exactly the names his homework uses (snd_<name>.json / .ino).
//  Nothing plays audio yet: play() only records the event, blinks the device LED
//  and writes a log line.  When a file arrives, drop it into sounds/<id>.wav or
//  sounds/<id>.json (beep-lab format) and set Sound.files[id] - play() then
//  really plays it, no other module has to change.
// ---------------------------------------------------------------------------

const SOUNDS = [
  // Block A - Pflicht (14)
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
  // Block B - Spielablauf (6)
  { id: 'sync_start',     block: 'B', when: 'gemeinsamer Start, alle gleich' },
  { id: 'countdown_pip',  block: 'B', when: '3-2-1 vor der Runde' },
  { id: 'round_go',       block: 'B', when: 'Schonzeit vorbei' },
  { id: 'grace_idle',     block: 'B', when: 'Schonzeit läuft' },
  { id: 'round_end',      block: 'B', when: 'Zeit um' },
  { id: 'stechen',        block: 'B', when: 'Stechen beginnt' },
  // Block C - Menü, Handy, Akku (7)
  { id: 'menu_ok',        block: 'C', when: 'Einstellung übernommen' },
  { id: 'menu_cancel',    block: 'C', when: 'zurück / abgebrochen' },
  { id: 'saved',          block: 'C', when: 'Einstellung gespeichert' },
  { id: 'wifi_ap_on',     block: 'C', when: 'Geräte-WLAN ist an' },
  { id: 'phone_connected', block: 'C', when: 'Handy verbunden' },
  { id: 'battery_low',    block: 'C', when: 'Akku schwach (< 20 %)' },
  { id: 'battery_empty',  block: 'C', when: 'Akku leer, Abschaltung' },
  // Block D - die vier Modi (11)
  { id: 'stage_2',        block: 'D', when: 'Zeitdruck: 60 s, 3 m' },
  { id: 'stage_3',        block: 'D', when: 'Zeitdruck: 120 s, 4 m' },
  { id: 'endspurt',       block: 'D', when: 'Zeitdruck: 150 s, 6 m' },
  { id: 'swap_warning',   block: 'D', when: 'Rollentausch: 10 s vor dem Wechsel' },
  { id: 'role_swap',      block: 'D', when: 'Rollentausch: Rollenwechsel' },
  { id: 'point',          block: 'D', when: 'Fang = Punkt für den Fänger' },
  { id: 'zombie_drawn',   block: 'D', when: 'Zombie ausgelost' },
  { id: 'growl_loop',     block: 'D', when: 'Zombiegerät: Grollen (Loop)' },
  { id: 'heart_loop',     block: 'D', when: 'Überlebender: Herzschlag (Loop)' },
  { id: 'infected',       block: 'D', when: 'Überlebender wird infiziert' },
  { id: 'infected_loop',  block: 'D', when: 'nach der Infektion' },
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
