// ---------------------------------------------------------------------------
//  One virtual device: the firmware inside the ESP32.
//
//  Phases:  off -> boot -> menu -> ready -> countdown -> grace -> round -> ended
//  Long press (2 s) powers on / off (Regeln 2.3).  Short press depends on phase.
//  The game rules live in game.js; this file only holds the device and what its
//  1.5 x 2.5 cm display shows.
// ---------------------------------------------------------------------------

const DEV_W = 1.5;   // cm, from AGENTS.md ("Display 1,5 x 2,5 cm")

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function fmtTime(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '--:--';
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Piepton-Gesetz: distance (m) -> interval (s) or null for silence.
function beepInterval(d) {
  if (d === null || d === undefined || !isFinite(d)) return null;
  if (d >= FW.silentFromM) return null;
  const t = FW.beepLaw;
  if (d <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (d <= t[i][0]) {
      const [d0, i0] = t[i - 1];
      const [d1, i1] = t[i];
      return i0 + (i1 - i0) * ((d - d0) / (d1 - d0));
    }
  }
  // 8..10 m: keeps stretching towards silence at 10 m
  return 3.0 + (d - 8.0) * 1.5;
}

// Wie viele Striche zeigt der Nähe-Balken? (Zonen: nah < 2 m, mittel 2-5, weit > 5)
function barsForDistance(d) {
  if (d === null || d === undefined || !isFinite(d)) return 0;
  if (d < FW.zones.near) return 5;
  if (d < 3.0) return 4;
  if (d < FW.zones.mid) return 3;
  if (d < 8.0) return 2;
  if (d < FW.silentFromM) return 1;
  return 0;
}

function zoneName(d) {
  if (d === null || d === undefined || d >= FW.silentFromM) return 'weg';
  if (d < FW.zones.near) return 'nah';
  if (d < FW.zones.mid) return 'mittel';
  return 'weit';
}

class Device {
  constructor(spec, index) {
    this.id = spec.id;
    this.color = spec.color;
    this.index = index;
    this.name = `${FW.deviceName} ${spec.id}`;

    // board position on the emulated field, in metres
    this.pos = { x: 3 + (index % 2) * 5, y: 3 + Math.floor(index / 2) * 4 };

    this.phase = 'off';
    this.phaseT = 0;
    this.bootStep = 0;

    this.batteryPct = 62 + index * 9;      // not full, so the bars differ
    this.charging = false;
    this.lowWarned = false;

    this.modeIndex = index % FW.modes.length;
    this.menuIdle = 99;
    this.readyAt = null;
    this.readyOrder = 0;

    this.peers = new Map();                // id -> {d, seen}
    this.linkUp = false;

    this.role = null;                      // seeker | hider | zombie | survivor
    this.disp = null;                      // what the screen shows (built below)
    this.capturePct = 0;                   // 0..1 towards the 3-second rule
    this.captureTarget = null;
    this.beepTimer = 0;
    this.soundPulseT = 0;
    this.lastSound = null;
    this.beepCount = 0;
    this.apClients = 0;

    this.loadSettings();
  }

  // --- persistence: A-08 "Einstellung wirkt nach dem Neustart" ------------
  storageKey() { return `fw-emu:${this.id}`; }

  loadSettings() {
    const base = {
      mode: FW.modes[this.modeIndex].id,
      roundSec: null,
      graceSec: null,
      seeker: 'A',
      plays: 0,
    };
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(this.storageKey()) || 'null'); } catch (e) { stored = null; }
    this.settings = Object.assign(base, stored || {});
    const mi = FW.modes.findIndex(m => m.id === this.settings.mode);
    if (mi >= 0) this.modeIndex = mi;
  }

  saveSettings(patch) {
    Object.assign(this.settings, patch);
    try { localStorage.setItem(this.storageKey(), JSON.stringify(this.settings)); } catch (e) { /* file:// may block */ }
  }

  get mode() { return FW.modes[this.modeIndex]; }
  get roundSec() { return this.settings.roundSec || this.mode.round; }
  get graceSec() { return this.settings.graceSec === null || this.settings.graceSec === undefined ? this.mode.grace : this.settings.graceSec; }
  get voltage() {
    return FW.battery.emptyV + (clamp(this.batteryPct, 0, 100) / 100) * (FW.battery.fullV - FW.battery.emptyV);
  }
  get on() { return this.phase !== 'off'; }

  log(msg, cls) { if (typeof Log !== 'undefined') Log.dev(this, msg, cls); }

  // ------------------------------------------------------------------ power
  powerOn() {
    if (this.phase !== 'off') return;
    if (this.batteryPct <= 1) {
      Sound.play(this, 'error');
      this.log('batt: %.2f V - Abschaltung, Laden nötig'.replace('%.2f', this.voltage.toFixed(2)), 'err');
      if (typeof UI !== 'undefined') UI.flashBattery(this);
      return;
    }
    this.phase = 'boot';
    this.phaseT = 0;
    this.bootStep = 0;
    this.role = null;
    this.menuIdle = 99;
    this.peers.clear();
    Sound.play(this, 'boot_up');
    this.log(`boot: ESP32 reset, fw ${FW.version}`, 'ok');
    this.log(`nvs: Modus ${this.mode.name}, Runde ${fmtTime(this.roundSec)}, Schonzeit ${this.graceSec} s`);
    this.log(`batt: ${this.voltage.toFixed(2)} V (${Math.round(this.batteryPct)} %)`);
    this.pushBootDisplay();
  }

  powerOff(reason) {
    if (this.phase === 'off') return;
    const why = reason || 'ausgeschaltet';
    this.log(`shutdown: ${why}`, why === 'akku leer' ? 'err' : 'dim');
    Sound.play(this, why === 'akku leer' ? 'battery_empty' : 'shutdown');
    this.phase = 'off';
    this.role = null;
    this.apUp(false);
    this.peers.clear();
    if (typeof Game !== 'undefined') Game.onDeviceOff(this);
    if (typeof UI !== 'undefined') UI.renderDevices();
  }

  apUp(on) {
    const was = this.apOn;
    this.apOn = !!on && this.phase !== 'off';
    if (this.apOn && !was) {
      this.log(`wifi: AP "${FW.wifi.ssidPrefix}${this.id}" offen, http://${FW.wifi.ip}`, 'ok');
      Sound.play(this, 'wifi_ap_on');
    }
    if (!this.apOn && was) this.log('wifi: AP aus', 'dim');
  }
  get ssid() { return FW.wifi.ssidPrefix + this.id; }

  // ----------------------------------------------------------------- button
  holdStart() {
    this.holdT = 0;
    this.holding = true;
  }

  holdRelease() {
    this.holding = false;
    const held = this.holdT || 0;
    this.holdT = 0;
    if (this.phase === 'off') {
      if (held >= FW.holdToPowerMs) this.powerOn();
      else this.log('Knopf gedrückt, Gerät ist aus - 2 s halten zum Einschalten', 'dim');
      return;
    }
    if (held >= FW.holdToPowerMs) { this.powerOff('Knopf 2 s gehalten'); return; }
    this.pressShort();
  }

  pressShort() {
    Sound.play(this, 'btn_click');                     // A-01: jeder Druck macht einen Ton
    if (this.phase === 'off') return;

    if (this.phase === 'menu') {
      // Ein Knopf, zwei Gesten (Regeln 2.3): einmal = nächster Modus,
      // zweimal schnell = Runde starten. Der Weiterschalten wird um 320 ms
      // verzögert, damit ein Doppeldruck den angezeigten Modus nicht verändert.
      const now = performance.now() / 1000;
      if (this._pendingCycle && now - this._pendingCycle <= 0.36) {
        clearTimeout(this._cycleTimer);
        this._pendingCycle = 0;
        this.enterReady();
        return;
      }
      this._pendingCycle = now;
      clearTimeout(this._cycleTimer);
      this._cycleTimer = setTimeout(() => {
        this._pendingCycle = 0;
        if (this.phase === 'menu') this.cycleMode();
      }, 320);
      return;
    }
    if (this.phase === 'ready') {
      this.readyAt = Game.now();
      this.log('start: bereit (erneut gedrückt)', 'dim');
      return;
    }
    if (this.phase === 'ended') {
      Sound.play(this, 'mode_select');
      this.toMenu();
      return;
    }
    // countdown / grace / round: the button only confirms, the game runs on (A-09)
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % FW.modes.length;
    Sound.play(this, 'mode_next');
    this.saveSettings({ mode: this.mode.id });
    this.log(`menu: Modus ${this.mode.name} - 2x drücken = Start`);
  }

  toMenu() {
    this.phase = 'menu';
    this.phaseT = 0;
    this.menuIdle = 99;
    this._menuPressAt = 0;
    this._pendingCycle = 0;
    clearTimeout(this._cycleTimer);
    this.role = null;
    this.capturePct = 0;
    if (typeof Game !== 'undefined') Game.onDeviceToMenu(this);
  }

  enterReady() {
    Sound.play(this, 'mode_select');
    Sound.play(this, 'sync_start');
    this.phase = 'ready';
    this.phaseT = 0;
    this.readyAt = Game.now();
    this.readyOrder = ++Game.readyCounter;
    this.log(`start: bereit für ${this.mode.name} (${this.mode.minPlayers}-${this.mode.maxPlayers} Spieler)`);
    Game.checkStart();                                  // all pressed within 10 s?
  }

  // ------------------------------------------------------------------ ticking
  tick(dtReal) {
    // the button hold is measured in real time, also while the device is off
    if (this.holding) this.holdT = (this.holdT || 0) + dtReal * 1000;
    if (this.phase === 'off') return;

    // battery: real time, ~2 h from full (A-10)
    if (!this.charging) {
      this.batteryPct = clamp(this.batteryPct - FW.battery.drainPctPerMin * (dtReal / 60), 0, 100);
      if (!this.lowWarned && this.batteryPct <= FW.battery.warnPct) {
        this.lowWarned = true;
        Sound.play(this, 'battery_low');
        this.log(`batt: ${Math.round(this.batteryPct)} % - schwach`, 'warn');
      }
      if (this.batteryPct <= 0.4) { this.powerOff('akku leer'); return; }   // A-11: 3,0 V
    }

    this.phaseT += dtReal;
    this.soundPulseT = Math.max(0, this.soundPulseT - dtReal);

    if (this.phase === 'boot') {
      const steps = [0.25, 0.55, 0.9, 1.15, 1.35];
      while (this.bootStep < steps.length && this.phaseT >= steps[this.bootStep]) {
        this.bootStep++;
        this.bootLog(this.bootStep);
        if (this.bootStep === 1) this.apUp(true);
      }
      if (this.phaseT >= 1.6) {
        this.toMenu();
        this.saveSettings({ mode: this.mode.id });
        this.log('ready - kurz drücken: Modus wählen', 'ok');
      }
    }

    if (this.phase === 'menu') this.menuIdle += dtReal;
  }

  bootLog(n) {
    if (n === 1) this.log(`wifi: AP "${this.ssid}" startet, ip ${FW.wifi.ip}`);
    if (n === 2) this.log('espnow: init, Kanal 1, Broadcast-Peer');
    if (n === 3) this.log('selftest: Summer - kein Sound geliefert (Dorian), bleibt stumm');
    if (n === 4) this.log('selftest: Display 128x64 ok, Knopf GPIO14 ok');
    if (n === 5) this.log('selftest: Akku-Schutz 3,0 V aktiv (A-11)', 'ok');
  }

  soundPulse(id) {
    this.lastSound = id;
    this.soundPulseT = 0.14;
    if (id === 'ping_tick' || id === 'ping_dry' || id === 'heart_loop' || id === 'growl_loop') this.beepCount++;
  }

  // ------------------------------------------------------------------ display
  pushBootDisplay() {
    this.disp = { top: 'BOOT', big: 'ESP32', sub: `${FW.version}`, time: null, bars: 0, capture: 0, hint: '' };
  }

  // The screen content, derived from the phase (game.js sets this.disp while a
  // round runs).  Kept separate so the same markup is reused by the phone only
  // for the settings page.
  screenModel() {
    if (this.phase === 'off') return null;
    if (this.disp && (this.phase === 'round' || this.phase === 'grace' || this.phase === 'ended')) {
      return Object.assign({ top: this.mode.short, time: null, bars: 0, capture: 0, hint: '' }, this.disp);
    }
    const d = { top: this.mode.short, time: null, bars: 0, capture: 0, hint: '' };
    if (this.phase === 'boot') {
      d.big = 'BOOT';
      d.sub = `fw ${FW.version}`;
      d.hint = ['', 'wifi', 'espnow', 'ton?', 'display', 'akku'][this.bootStep] || '';
    } else if (this.phase === 'menu') {
      d.big = this.mode.name;
      d.sub = `${fmtTime(this.roundSec)} · ${this.mode.minPlayers}-${this.mode.maxPlayers}`;
      d.hint = 'drücken = Modus';
      d.hintTick = '2× schnell = Start';
    } else if (this.phase === 'ready') {
      d.big = 'BEREIT';
      d.sub = `${Game.readyDevices().length}/${Game.activeDevices().length}`;
      d.hint = 'alle drücken <10 s';
    } else if (this.phase === 'countdown') {
      d.big = String(Math.ceil(Game.countdownLeft));
      d.sub = 'los in';
      d.hint = '3-2-1';
    }
    return d;
  }

  aura() {   // status chip next to the device card / role label
    if (this.phase === 'off') return { cls: 'off', text: 'aus' };
    if (this.phase === 'boot') return { cls: 'boot', text: 'bootet' };
    if (this.phase === 'menu') return { cls: 'menu', text: 'Menü' };
    if (this.phase === 'ready') return { cls: 'ready', text: 'bereit' };
    if (this.phase === 'countdown') return { cls: 'ready', text: '3-2-1' };
    if (this.phase === 'grace') return { cls: 'grace', text: 'Schonzeit' };
    if (this.phase === 'round') return { cls: 'round', text: 'Runde' };
    if (this.phase === 'ended') return { cls: 'ended', text: 'Runde vorbei' };
    return { cls: 'off', text: this.phase };
  }
}
