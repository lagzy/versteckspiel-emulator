// ---------------------------------------------------------------------------
//  The round engine - the part of the firmware that only exists once several
//  devices see each other.  All numbers come from config.js, which quotes
//  Spielregeln/spielregeln.md (Kap. 2-6 and Kap. 10).
//
//  Game.phase: idle | countdown | grace | round | pause | ended
// ---------------------------------------------------------------------------

const Game = {
  devices: [],
  speed: 1,                 // Zeitraffer for the round clock (not for presses)
  phase: 'idle',
  modeId: null,
  mode: null,
  readyCounter: 0,
  countdownLeft: 0,
  roundLeft: 0,
  graceLeft: 0,
  elapsed: 0,               // seconds into the round (after grace)
  roundNo: 1,
  points: {},
  zombieId: null,
  infected: new Set(),
  captured: new Set(),
  stageIdx: 0,
  winner: null,
  paused: 0,
  beeps: 0,
  aborted: false,

  now() { return performance.now() / 1000; },

  activeDevices() { return this.devices.filter(d => d.on); },
  readyDevices() { return this.devices.filter(d => d.phase === 'ready'); },
  inRound() { return this.phase === 'round' || this.phase === 'grace'; },

  byId(id) { return this.devices.find(d => d.id === id) || null; },

  log(msg, cls) { if (typeof Log !== 'undefined') Log.sys(msg, cls); },

  // ------------------------------------------------------------ radio model
  // Distance is straight-line in the emulated room; RSSI ranging is rough, so
  // the emulator adds a little noise - the game must not depend on exact metres.
  updateRadio() {
    const on = this.activeDevices();
    for (const d of on) d._peers = new Map();
    for (const d of on) {
      for (const o of on) {
        if (o === d) continue;
        const raw = Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y);
        if (raw > FW.radio.rangeM) continue;
        const noise = (Math.random() * 2 - 1) * FW.radio.jitterM;
        d._peers.set(o.id, Math.max(0.2, raw + noise));
      }
    }
    for (const d of on) {
      const before = d.peers;
      d.peers = d._peers;
      const had = before.size, has = d.peers.size;
      if (has > had) Sound.play(d, 'link_found');
      if (has < had && has === 0) Sound.play(d, 'link_lost');
    }
  },

  nearest(d, filter) {
    let best = null;
    for (const [id, dist] of d.peers) {
      if (filter && !filter(this.byId(id))) continue;
      if (!best || dist < best.d) best = { id, d: dist };
    }
    return best;
  },

  // --------------------------------------------------------------- starting
  checkStart() {
    if (this.phase !== 'idle') return;
    const on = this.activeDevices();
    const ready = this.readyDevices();
    if (on.length < 2 || ready.length === 0) return;

    // 10-second window, measured from the first press (Regeln 2.3 / Kap. 10)
    const first = ready.reduce((a, b) => (a.readyAt <= b.readyAt ? a : b));
    const late = ready.filter(d => d.readyAt - first.readyAt > FW.start.windowSec);
    if (late.length) { this.abortStart('Startfenster 10 s überschritten'); return; }

    if (ready.length < on.length) return;   // others still choosing a mode
    this.tryStart();
  },

  tryStart() {
    const ready = this.readyDevices();
    const modeIds = [...new Set(ready.map(d => d.mode.id))];
    if (modeIds.length > 1) {
      this.abortStart(`verschiedene Modi (${ready.map(d => d.mode.name).join(', ')}) - Regeln §8: allen dasselbe Gerät`);
      return;
    }
    const mode = ready[0].mode;
    if (ready.length < mode.minPlayers) {
      this.abortStart(`${mode.name} braucht mindestens ${mode.minPlayers} Geräte, es sind ${ready.length}`);
      return;
    }
    if (ready.length > mode.maxPlayers) {
      this.abortStart(`${mode.name} geht mit höchstens ${mode.maxPlayers} Geräten, es sind ${ready.length}`);
      return;
    }

    this.mode = mode;
    this.modeId = mode.id;
    this.roundNo = 1;
    this.points = {};
    this.infected = new Set();
    this.captured = new Set();
    this.winner = null;
    this.aborted = false;
    this.elapsed = 0;
    this.stageIdx = 0;
    this.beeps = 0;
    ready.forEach(d => { this.points[d.id] = 0; });

    // roles
    const ordered = [...ready].sort((a, b) => a.readyOrder - b.readyOrder);
    if (mode.id === 'zombie') {
      this.zombieId = ordered[ordered.length - 1].id;      // zuletzt gedrückt (Kap. 6)
      this.log(`Runde ${mode.name}: Zombie = ${this.zombieId} (zuletzt gedrückt)`, 'ok');
      ordered.forEach(d => { d.role = d.id === this.zombieId ? 'zombie' : 'survivor'; });
      Sound.play(this.devices.find(d => d.id === this.zombieId), 'zombie_drawn');
    } else if (mode.id === 'rollentausch') {
      ordered[0].role = 'hunter';
      ordered[1].role = 'prey';
      this.log(`Runde 1 Rollentausch: ${ordered[0].id} jagt (zuerst gedrückt)`, 'ok');
    } else {
      let seekerId = ready[0].settings.seeker;
      if (!ready.some(d => d.id === seekerId)) seekerId = ordered[0].id;
      ready.forEach(d => { d.role = d.id === seekerId ? 'seeker' : 'hider'; });
      this.log(`${mode.name}: Sucher = ${seekerId} (Handy-Einstellung)`, 'ok');
    }

    this.phase = 'countdown';
    this.countdownLeft = FW.start.countdownSec;
    this._lastPip = FW.start.countdownSec + 1;
    ready.forEach(d => { d.phase = 'countdown'; d.phaseT = 0; d.capturePct = 0; d.disp = null; });
    Sound.play(ready[0], 'sync_start');
    this.log('gemeinsamer Start: 3 - 2 - 1', 'ok');
    if (typeof UI !== 'undefined') UI.toast(`Start: ${mode.name} · ${ready.length} Geräte`);
  },

  abortStart(reason) {
    Sound.play(this.devices.find(d => d.on), 'error');
    this.log(`Start abgebrochen: ${reason}`, 'err');
    if (typeof UI !== 'undefined') UI.toast(`Start abgebrochen - ${reason}`, 'err');
    this.phase = 'idle';
    this.devices.forEach(d => {
      if (d.phase === 'ready' || d.phase === 'countdown') d.toMenu();
    });
    Sound.play(this.devices.find(d => d.on), 'menu_cancel');
  },

  onDeviceOff(d) {
    if (this.activeDevices().length === 0 && this.phase !== 'idle') { this.reset(); return; }
    if (!this.inRound() && this.phase !== 'countdown' && this.phase !== 'pause') return;
    if (d.role) {
      this.log(`Gerät ${d.id} aus - Rolle ${d.role} verlässt die Runde`, 'warn');
      d.role = null;
      if (this.activeDevices().length < 2) this.finish('Runde abgebrochen - zu wenige Geräte');
    }
  },

  onDeviceToMenu(d) {
    if (this.inRound()) return;    // during a round the button does not leave the round
    if (this.phase === 'ended' && !this.devices.some(x => x.phase === 'ended')) this.reset();
  },

  // ------------------------------------------------------------------ tick
  tick(dtReal) {
    this.updateRadio();

    if (this.phase === 'idle') {
      // a ready device that waits too long while another still decides -> abort
      const ready = this.readyDevices();
      if (ready.length) {
        const on = this.activeDevices();
        const first = ready.reduce((a, b) => (a.readyAt <= b.readyAt ? a : b));
        if (on.length > ready.length && this.now() - first.readyAt > FW.start.windowSec) {
          this.abortStart('nicht alle Geräte innerhalb von 10 s gedrückt');
        }
      }
      return;
    }

    const dt = dtReal * this.speed;

    if (this.phase === 'countdown') {
      this.countdownLeft -= dt;
      const pip = Math.ceil(this.countdownLeft);
      if (pip < this._lastPip && pip > 0) {
        this._lastPip = pip;
        const dev = this.devices.find(d => d.role);
        Sound.play(dev, 'countdown_pip');
      }
      if (this.countdownLeft <= 0) this.beginPlay();
      return;
    }

    if (this.phase === 'grace') {
      this.graceLeft -= dt;
      this.showGrace();
      if (this.graceLeft <= 0) this.startRoundClock();
      return;
    }

    if (this.phase === 'pause') {          // Rollentausch: 15 s zwischen den Runden
      this.paused -= dt;
      if (this.paused <= 0) this.nextSwapRound();
      return;
    }

    if (this.phase === 'round') {
      this.elapsed += dt;
      this.roundLeft -= dt;
      if (this.modeId === 'zeitdruck') this.updateStage();
      if (this.modeId === 'rollentausch' && this.roundNo < FW.swap.rounds
          && this.roundLeft <= 10 && !this._swapWarned) {
        this._swapWarned = true;
        Sound.play(this.devices.find(d => d.role), 'swap_warning');
        this.log('Rollentausch: 10 s bis zum Rollenwechsel - Ton verdoppelt', 'warn');
      }
      this.beepAndCapture(dt, dtReal);
      if (this.phase === 'round') this.renderRound();   // capture may end the round
      if (this.phase === 'round' && this.roundLeft <= 0) this.onTimeUp();
    }
  },

  beginPlay() {
    const ready = this.devices.filter(d => d.role);
    this.roundLeft = this.modeId === 'rollentausch'
      ? FW.modes.find(m => m.id === 'rollentausch').round
      : (ready[0] ? ready[0].roundSec : this.mode.round);
    this.graceLeft = this.modeId === 'rollentausch' ? 0 : (ready[0] ? ready[0].graceSec : this.mode.grace);
    this.phase = this.graceLeft > 0 ? 'grace' : 'round';
    ready.forEach(d => { d.phase = this.graceLeft > 0 ? 'grace' : 'round'; d.phaseT = 0; d.capturePct = 0; });
    this.log(`Schonzeit ${Math.round(this.graceLeft)} s, Runde ${fmtTime(this.roundLeft)}`, 'ok');
    if (this.phase === 'grace') {
      Sound.play(ready[0], 'grace_idle');
      this.showGrace();
    } else {
      Sound.play(ready[0], 'round_go');
    }
  },

  startRoundClock() {
    const ready = this.devices.filter(d => d.role);
    this.phase = 'round';
    ready.forEach(d => { d.phase = 'round'; d.phaseT = 0; });
    Sound.play(ready[0], 'round_go');
    this.log('Runde läuft', 'ok');
  },

  showGrace() {
    const ready = this.devices.filter(d => d.role);
    const mode = this.modeId;
    ready.forEach(d => {
      let big = 'SCHONZEIT', sub = '';
      if (mode === 'klassisch' || mode === 'zeitdruck') {
        sub = d.role === 'seeker' ? 'Verstecker laufen los' : 'verstecken!';
        if (d.role === 'seeker') big = 'WARTEN';
      }
      if (mode === 'zombie') {
        big = d.role === 'zombie' ? 'ZOMBIE' : 'FREI';
        sub = d.role === 'zombie' ? 'Grollen gleich' : '20 s Vorsprung';
      }
      d.disp = {
        top: this.mode.short, big,
        sub, time: Math.ceil(this.graceLeft), bars: 0, capture: 0,
        hint: 'Schonzeit',
      };
    });
    // leiser Tick während der Schonzeit, höchstens alle 2,5 s
    const now = performance.now() / 1000;
    if (!this._graceSoundAt || now - this._graceSoundAt > 2.5) {
      this._graceSoundAt = now;
      Sound.play(ready[0], 'grace_idle');
    }
  },

  // ------------------------------------------------------------- Zeitdruck
  updateStage() {
    const el = this.elapsed;
    let idx = 0;
    FW.stages.forEach((s, i) => { if (el >= s.from) idx = i; });
    if (idx !== this.stageIdx) {
      this.stageIdx = idx;
      const s = FW.stages[idx];
      const dev = this.devices.find(d => d.role);
      Sound.play(dev, ['stage_2', 'stage_3', 'endspurt'][Math.min(2, idx - 1)] || 'stage_2');
      this.log(`Zeitdruck: ${s.label} - Fangdistanz ${s.dist.toFixed(1)} m bei ${Math.round(el)} s`, 'ok');
      if (typeof UI !== 'undefined') UI.toast(`Zeitdruck ${s.label} · Fangdistanz ${s.dist.toFixed(1)} m`);
    }
  },

  captureDistance() {
    if (this.modeId === 'zeitdruck') return FW.stages[this.stageIdx].dist;
    if (this.modeId === 'rollentausch' && this.stechenActive) return FW.capture.distanceM;
    return FW.capture.distanceM;
  },

  // ------------------------------------------------------- beep + capture
  beepAndCapture(dt, dtReal) {
    const ready = this.devices.filter(d => d.role);
    const captureD = this.captureDistance();
    const mode = this.modeId;

    // --- what does each device hear? (visual stand-in: LED + screen tick)
    ready.forEach(d => {
      let target = null, factor = 1, id = 'ping_tick';
      if (mode === 'klassisch' || mode === 'zeitdruck') {
        if (d.role === 'hunter' || d.role === 'prey') { /* not used */ }
        if (d.role !== 'seeker') { d.beepTimer = 0; return; }      // Verstecker sind stumm
        target = this.nearest(d, (o) => o.role === 'hider' && !this.captured.has(o.id));
      } else if (mode === 'rollentausch') {
        target = this.nearest(d);                                    // beide piepsen
        if (this.roundLeft <= 10 && this.roundNo < FW.swap.rounds) factor = 0.5;
      } else if (mode === 'zombie') {
        if (d.role === 'zombie' || this.infected.has(d.id)) {
          target = this.nearest(d, (o) => o.role === 'survivor' && !this.infected.has(o.id));
          id = this.infected.has(d.id) ? 'infected_loop' : 'growl_loop';
          factor = 1.6;
        } else {
          target = this.nearest(d, (o) => o.role === 'zombie' || this.infected.has(o.id));
          id = 'heart_loop';
          factor = 0.85;
        }
      }
      if (!target) { d.beepTimer = 0; return; }
      const interval = beepInterval(target.d);
      if (interval === null) { d.beepTimer = 0; return; }
      const period = Math.max(0.09, interval * factor);
      d.beepTimer -= dtReal;      // Tick-Rhythmus bleibt Echtzeit (Kap. 10)
      if (d.beepTimer <= 0) {
        d.beepTimer = period;
        this.beeps++;
        Sound.play(d, interval >= 2.5 ? 'ping_dry' : id);
        d._lastDistance = target.d;
      }
    });

    // --- capture: 3 s inside the capture distance (Regeln 2.2)
    if (mode === 'klassisch' || mode === 'zeitdruck') {
      const seeker = ready.find(d => d.role === 'seeker');
      if (!seeker) return;
      ready.filter(d => d.role === 'hider').forEach(h => {
        const dv = seeker.peers.get(h.id);
        if (this.captured.has(h.id)) { h.capturePct = 1; return; }
        if (dv !== undefined && dv <= captureD) {
          h.capturePct = Math.min(1, h.capturePct + dt / FW.capture.seconds);
          seeker.capturePct = h.capturePct;
          if (h.capturePct >= 1) this.captureHider(seeker, h);
        } else {
          h.capturePct = Math.max(0, h.capturePct - dt * 2);
          seeker.capturePct = 0;
        }
      });
    } else if (mode === 'rollentausch') {
      const a = ready[0], b = ready[1];
      const dv = a.peers.get(b.id);
      if (dv !== undefined && dv <= captureD) {
        this._swapProg = (this._swapProg || 0) + dt / FW.capture.seconds;
        a.capturePct = b.capturePct = Math.min(1, this._swapProg);
        if (this._swapProg >= 1) this.swapCapture();
      } else {
        this._swapProg = 0;
        a.capturePct = b.capturePct = 0;
      }
    } else if (mode === 'zombie') {
      const hunters = ready.filter(d => d.role === 'zombie' || this.infected.has(d.id));
      const survivors = ready.filter(d => d.role === 'survivor' && !this.infected.has(d.id));
      survivors.forEach(s => {
        let best = null;
        hunters.forEach(z => {
          const dv = s.peers.get(z.id);
          if (dv !== undefined && dv <= FW.capture.distanceM && (!best || dv < best.d)) best = { z, d: dv };
        });
        if (best) {
          this._infProg = this._infProg || new Map();
          const p = (this._infProg.get(s.id) || 0) + dt / FW.capture.seconds;
          this._infProg.set(s.id, p);
          s.capturePct = Math.min(1, p);
          best.z.capturePct = Math.min(1, p);
          if (p >= 1) this.infect(s, best.z);
        } else {
          s.capturePct = 0;
          if (this._infProg) this._infProg.delete(s.id);
        }
      });
    }
  },

  captureHider(seeker, hider) {
    this.captured.add(hider.id);
    const n = this.captured.size;
    const total = this.devices.filter(d => d.role === 'hider').length;
    Sound.play(seeker, 'capture');
    Sound.play(hider, 'capture');
    Sound.play(hider, 'captured_me');
    this.log(`Fang: ${seeker.id} hat ${hider.id} (${n}/${total})`, 'ok');
    if (typeof UI !== 'undefined') UI.toast(`Fang: ${seeker.id} → ${hider.id} (${n}/${total})`);
    if (n >= total) {
      this.finish(`Sucher ${seeker.id} gewinnt - alle gefangen`);
    }
  },

  swapCapture() {
    const ready = this.devices.filter(d => d.role);
    const a = ready[0], b = ready[1];
    const hunter = a.role === 'hunter' ? a : b;
    const prey = hunter === a ? b : a;
    this.points[hunter.id] = (this.points[hunter.id] || 0) + 1;
    Sound.play(hunter, 'capture');
    Sound.play(prey, 'capture');
    Sound.play(hunter, 'point');
    this.log(`Fang in Runde ${this.roundNo}: ${hunter.id} holt den Punkt (${this.points[hunter.id]}:${this.points[prey.id]})`, 'ok');
    if (typeof UI !== 'undefined') UI.toast(`Punkt für ${hunter.id} · ${this.points[hunter.id]}:${this.points[prey.id]}`);
    this._swapProg = 0;
    a.capturePct = b.capturePct = 0;
    if (this.stechenActive) { this.finish(`Stechen: ${hunter.id} gewinnt`); return; }
    if (this.roundNo >= FW.swap.rounds) { this.finishSwap(); return; }
    this.phase = 'pause';
    this.paused = FW.swap.pauseSec;
    this.roundNo++;
    ready.forEach(d => { d.disp = { top: 'TAUSCH', big: 'WECHSEL', sub: `${Math.ceil(this.paused)} s`, time: null, bars: 0, capture: 0, hint: 'Rollen tauschen' }; });
    Sound.play(a, 'role_swap');
    this.log(`15 s Pause, dann Runde ${this.roundNo}`, 'ok');
  },

  nextSwapRound() {
    const ready = this.devices.filter(d => d.role);
    if (ready.length < 2) { this.finish('Runde abgebrochen - zu wenig Geräte'); return; }
    this._swapProg = 0;
    ready.forEach(d => {
      d.role = d.role === 'hunter' ? 'prey' : 'hunter';
      d.capturePct = 0;
      d.phase = 'round';
    });
    this.phase = 'round';
    this.roundLeft = FW.modes.find(m => m.id === 'rollentausch').round;
    this.stechenActive = false;
    this._swapWarned = false;
    Sound.play(ready[0], 'role_swap');
    this.log(`Runde ${this.roundNo}: ${ready.find(d => d.role === 'hunter').id} jagt`, 'ok');
    this.renderRound();
  },

  finishSwap() {
    const ready = this.devices.filter(d => d.role);
    const a = ready[0], b = ready[1];
    const pa = this.points[a.id] || 0, pb = this.points[b.id] || 0;
    if (pa === pb) {
      this.stechenActive = true;
      this.roundLeft = FW.swap.stechenSec;
      this.phase = 'round';
      Sound.play(a, 'stechen');
      this.log(`Gleichstand ${pa}:${pb} - Stechen, längstens 60 s`, 'ok');
      if (typeof UI !== 'undefined') UI.toast(`Gleichstand ${pa}:${pb} - Stechen`);
      return;
    }
    const winner = pa > pb ? a : b;
    this.finish(`${winner.id} gewinnt ${Math.max(pa, pb)}:${Math.min(pa, pb)}`);
  },

  infect(survivor, zombie) {
    this.infected.add(survivor.id);
    survivor.role = 'infected';
    survivor.capturePct = 0;
    Sound.play(survivor, 'infected');
    Sound.play(zombie, 'capture');
    this.log(`Infektion: ${survivor.id} jagt jetzt mit (${this.infected.size} infiziert)`, 'warn');
    if (typeof UI !== 'undefined') UI.toast(`Infiziert: ${survivor.id}`);
    const free = this.devices.filter(d => d.role === 'survivor' && !this.infected.has(d.id));
    if (free.length === 0) this.finish('Zombies gewinnen - alle infiziert');
  },

  // --------------------------------------------------------------- display
  renderRound() {
    const ready = this.devices.filter(d => d.role);
    const time = Math.ceil(this.roundLeft);
    const mode = this.modeId;
    ready.forEach(d => {
      const nearest = this.peersFor(d);
      let big = 'FREI', sub = '', bars = barsForDistance(nearest);
      if (mode === 'klassisch' || mode === 'zeitdruck') {
        if (d.role === 'seeker') {
          const total = ready.filter(o => o.role === 'hider').length;
          const done = this.captured.size;
          big = done ? `GEFANGEN ${done}/${total}` : 'JAGEN';
          sub = this.nearest(d, o => o.role === 'hider' && !this.captured.has(o.id)) ? zoneName(this.peersFor(d)) : 'niemand in Reichweite';
          if (this.modeId === 'zeitdruck') big = FW.stages[this.stageIdx].label;
        } else {
          const cap = this.captured.has(d.id);
          big = cap ? 'GEFANGEN' : 'GEJAGT';
          sub = cap ? 'gesperrt' : zoneName(nearest);
          bars = cap ? 0 : bars;
        }
      } else if (mode === 'rollentausch') {
        big = d.role === 'hunter' ? 'JAGEN' : 'VERSTECKEN';
        sub = `R${this.roundNo}/${FW.swap.rounds} · ${this.points[d.id] || 0} P`;
        if (this.stechenActive) sub = `Stechen · ${this.points[d.id] || 0} P`;
      } else if (mode === 'zombie') {
        if (d.role === 'zombie') big = 'ZOMBIE';
        else if (d.role === 'infected' || this.infected.has(d.id)) big = 'INFIZIERT';
        else big = 'FREI';
        sub = d.role === 'zombie' || d.role === 'infected' ? `${this.infected.size + 1} Jäger` : 'überlebt';
      }
      // ohne Ton: der Tick-Rhythmus steht als Zahl auf dem Display
      let tick = null;
      if (!(mode === 'klassisch' || mode === 'zeitdruck') || d.role === 'seeker') {
        const t = nearest === null ? null : beepInterval(nearest);
        if (t !== null) tick = t;
      }
      const capTxt = `Fang ${this.captureDistance().toFixed(0)} m`;
      d.disp = {
        top: this.mode.short,
        big, sub,
        time,
        bars,
        capture: d.capturePct,
        hint: capTxt,
        hintTick: tick !== null ? `Tick ${tick.toFixed(2)} s` : '',
      };
      // the device that hears nothing shows a still bar
      if (mode === 'klassisch' || mode === 'zeitdruck') {
        if (d.role !== 'seeker') d.disp.bars = bars;
      }
    });
  },

  peersFor(d) {
    let best = null;
    for (const [, dist] of d.peers) if (best === null || dist < best) best = dist;
    return best;
  },

  // -------------------------------------------------------------------- end
  onTimeUp() {
    if (this.modeId === 'rollentausch') { this.rumSwapTimeUp(); return; }
    const ready = this.devices.filter(d => d.role);
    const seeker = ready.find(d => d.role === 'seeker');
    if (this.modeId === 'zombie') {
      const free = ready.filter(d => d.role === 'survivor' && !this.infected.has(d.id));
      this.finish(free.length ? `Überlebende gewinnen - ${free.map(d => d.id).join(', ')} frei` : 'Zombies gewinnen - alle infiziert');
      return;
    }
    const free = ready.filter(d => d.role === 'hider' && !this.captured.has(d.id));
    this.finish(free.length ? `Zeit um - ${free.map(d => d.id).join(', ')} frei, gewinnen` : `Zeit um - Sucher ${seeker ? seeker.id : ''} hatte alle`);
  },

  rumSwapTimeUp() {
    // Runde ohne Fang vorbei: niemand bekommt einen Punkt, Rollen wechseln
    Sound.play(this.devices.find(d => d.role), 'round_end');
    this.log(`Runde ${this.roundNo}: Zeit um, kein Fang`, 'dim');
    if (this.stechenActive) { this.finishSwap(); return; }
    if (this.roundNo >= FW.swap.rounds) { this.finishSwap(); return; }
    this.phase = 'pause';
    this.paused = FW.swap.pauseSec;
    this.roundNo++;
    const ready = this.devices.filter(d => d.role);
    ready.forEach(d => { d.disp = { top: 'TAUSCH', big: 'WECHSEL', sub: `${Math.ceil(this.paused)} s`, time: null, bars: 0, capture: 0, hint: 'Rollen tauschen' }; });
  },

  finish(reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.winner = reason;
    const ready = this.devices.filter(d => d.role || this.points.hasOwnProperty(d.id));
    Sound.play(ready[0], 'round_end');
    this.log(`Runde vorbei: ${reason}`, 'ok');
    const mode = this.modeId;
    ready.forEach(d => {
      let big = 'ENDE', sub = '', win = false;
      if (mode === 'zombie') {
        const zombieSide = /Zombies/.test(reason) || (this.infected.size > 0 && !/Überlebende/.test(reason));
        win = d.role === 'zombie' || d.role === 'infected' ? zombieSide : !zombieSide;
        big = win ? 'GEWONNEN' : 'VERLOREN';
      } else if (mode === 'rollentausch') {
        const top = Math.max(...Object.values(this.points));
        win = (this.points[d.id] || 0) === top;
        big = win ? 'GEWONNEN' : 'VERLOREN';
        sub = `${this.points[d.id] || 0} P`;
      } else {
        if (d.role === 'seeker') win = /Sucher .* gewinnt/.test(reason);
        else win = this.captured.has(d.id) ? false : true;
        big = win ? 'GEWONNEN' : 'VERLOREN';
        sub = this.captured.has(d.id) ? 'gefangen' : '';
      }
      d.phase = 'ended';
      d.disp = {
        top: this.mode ? this.mode.short : '', big, sub,
        time: null, bars: 0, capture: 0,
        hint: win ? 'Knopf: Menü' : 'Knopf: Menü',
      };
      Sound.play(d, win ? 'win' : 'lose');
      d.saveSettings({ plays: (d.settings.plays || 0) + 1 });
    });
    if (typeof UI !== 'undefined') UI.toast(reason);
  },

  reset() {
    this.phase = 'idle';
    this.modeId = null;
    this.mode = null;
    this.winner = null;
    this.captured = new Set();
    this.infected = new Set();
    this.points = {};
    this._swapProg = 0;
    this._infProg = new Map();
    this.stechenActive = false;
    this.readyCounter = 0;
    this.beeps = 0;
    this.roundLeft = 0;
    this.graceLeft = 0;
    this.elapsed = 0;
  },
};
