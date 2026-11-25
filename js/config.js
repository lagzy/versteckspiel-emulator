// ---------------------------------------------------------------------------
//  Firmware emulator - configuration
//
//  Every timing here comes from a project file, not from guesswork:
//    Spielregeln/spielregeln.md, Kap. 10 "Geräteparameter"  -> beep law, grace,
//      round length, capture distance/duration, start condition
//    Spielregeln/spielregeln.md, Kap. 4                     -> Zeitdruck stages
//    01_Dokumente/01_Anforderungsliste.docx                 -> A-01..A-11
//
//  Change a number here, not in the firmware modules: device.js and game.js
//  read FW only.  Nothing in this file is a display string for the UI chrome.
// ---------------------------------------------------------------------------

const FW = {
  version: '0.9.0-emu',

  // --- Piepton-Gesetz (Regeln 2.1 / Kap. 10) ------------------------------
  // distance (m) -> interval between two ticks (s)
  beepLaw: [
    [1.0, 0.12],
    [2.0, 0.25],
    [3.0, 0.50],
    [5.0, 1.00],
    [6.0, 1.40],
    [8.0, 3.00],
    [10.0, 4.00],
    [12.0, 6.00],
  ],
  silentFromM: 15.0,     // over 15 m: no tone at all ("ausser Reichweite")

  // --- Zonen für die Anzeige (Regeln 1 / Kap. 10) ------------------------
  zones: { near: 2.0, mid: 5.0 },
  bars: 5,               // fünf Striche im Nähe-Balken

  // --- Fang (Regeln 2.2) -------------------------------------------------
  capture: { seconds: 3, distanceM: 2.0 },

  // --- Runden, Schonzeit, Stufen -----------------------------------------
  modes: [
    { id: 'klassisch',   name: 'Klassisch',   short: 'KLASS',  round: 300, grace: 30, minPlayers: 2, maxPlayers: 4, seeker: true },
    { id: 'zeitdruck',   name: 'Zeitdruck',   short: 'ZEIT',   round: 180, grace: 20, minPlayers: 2, maxPlayers: 4, seeker: true },
    { id: 'rollentausch', name: 'Rollentausch', short: 'TAUSCH', round: 300, grace: 0,  minPlayers: 2, maxPlayers: 2, seeker: false },
    { id: 'zombie',      name: 'Zombie',      short: 'ZOMBIE', round: 300, grace: 20, minPlayers: 3, maxPlayers: 4, seeker: false },
  ],
  // Zeitdruck: Fangdistanz wächst (Regeln Kap. 4)
  stages: [
    { from: 0,   dist: 2.0, label: 'STUFE 1'  },
    { from: 60,  dist: 3.0, label: 'STUFE 2'  },
    { from: 120, dist: 4.0, label: 'STUFE 3'  },
    { from: 150, dist: 6.0, label: 'ENDSPURT' },
  ],
  // Rollentausch (Regeln Kap. 5)
  swap: { rounds: 4, warnFromSec: 290, pauseSec: 15, stechenSec: 60 },
  zombie: { infected: true },

  // --- gemeinsamer Start (Regeln 2.3 / Kap. 10) --------------------------
  start: { windowSec: 10, countdownSec: 3, modeIdleMs: 1200 },

  // --- Akku (A-10, A-11) -------------------------------------------------
  battery: { fullV: 4.20, emptyV: 3.00, warnPct: 20, drainPctPerMin: 0.80, chargePctPerMin: 8 },
  holdToPowerMs: 2000,   // Knopf zwei Sekunden halten

  // --- Funk --------------------------------------------------------------
  radio: { rangeM: 12.0, timeoutMs: 4000, jitterM: 0.25 },

  // --- Spielfeld (nur Emulator) -----------------------------------------
  field: { w: 24, h: 14 },

  // --- Geräte (4 Stück, A-04) -------------------------------------------
  devices: [
    { id: 'A', color: '#f2b53a' },
    { id: 'B', color: '#4ec2a0' },
    { id: 'C', color: '#7d9bf5' },
    { id: 'D', color: '#e0708c' },
  ],
  deviceName: 'Versteckspiel',

  // --- WLAN des Geräts (A-07, A-08) -------------------------------------
  wifi: { ssidPrefix: 'Versteck-', ip: '192.168.4.1', channel: 1 },
};
