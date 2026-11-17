// ---------------------------------------------------------------------------
//  app.js - the shell around the firmware: field, four device cards, the
//  virtual smartphone and the two drawers.  No framework, no build, no network.
// ---------------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ logging
const T0 = performance.now();
const Log = {
  lines: [],
  dirty: true,
  stuck: null,
  t() { return ((performance.now() - T0) / 1000).toFixed(1).padStart(5, ' '); },
  push(text, cls) {
    this.lines.push({ text, cls: cls || '' });
    if (this.lines.length > 400) this.lines.shift();
    this.dirty = true;
  },
  dev(d, msg, cls) { this.push(`[${d.id}] ${this.t()}s ${msg}`, cls); },
  sys(msg, cls) { this.push(`[·] ${this.t()}s ${msg}`, cls); },
  sound(d, id) {
    // the beep tick repeats ~8x/s: log it, but do not drown the other lines
    const key = `${d ? d.id : '-'}:${id}`;
    const now = performance.now();
    if (this.stuck && this.stuck.key === key && now - this.stuck.at < 700) return;
    this.stuck = { key, at: now };
    this.push(`[${d ? d.id : '-'}] ${this.t()}s ♪ ${id}`, 'l-snd');
  },
  render() {
    if (!this.dirty) return;
    const box = $('#loglines');
    if (!box) return;
    box.innerHTML = this.lines.map(l => `<span class="${l.cls}">${l.text}</span>`).join('\n');
    box.scrollTop = box.scrollHeight;
    this.dirty = false;
  },
};

// ----------------------------------------------------------------------- UI
// Gehäuse als SVG in den CAD-Koordinaten (Vlads Front-Rendering, 1072 x 808 px).
// Alle Zahlen sind am Bild ausgemessen: Platte 140..932 / 121..327, Tab 249..519
// mit elliptischem Boden (rx 135, ry 112), LCD-Fenster 246..525 / 192..256,
// Pulslinie y 606 mit Spitze bei x 500/532, Ring bei (384, 455).
// Riffelung in den vier Ecken: kurze Striche quer durch den Randstreifen,
// am CAD-Bild abgeschaut (R ~105 px, Streifen ~18 px breit).
function cornerRibs() {
  const R = 105, cx = 105, cy = 105, out = [];
  for (let a = 178; a <= 272; a += 7) {
    const r1 = (a) * Math.PI / 180, r2 = (a + 6) * Math.PI / 180;
    const x1 = cx + (R - 20) * Math.cos(r1), y1 = cy + (R - 20) * Math.sin(r1);
    const x2 = cx + (R + 3) * Math.cos(r2), y2 = cy + (R + 3) * Math.sin(r2);
    out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  return out.join('');
}
const RIBS = cornerRibs();

const CASE_SVG = `
<svg class="caseart" viewBox="0 0 1072 808" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="cbody" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0" stop-color="#f4a76c"/>
      <stop offset="0.42" stop-color="#e98a45"/>
      <stop offset="0.78" stop-color="#dd7430"/>
      <stop offset="1" stop-color="#cf6827"/>
    </linearGradient>
    <linearGradient id="cplate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4d5054"/>
      <stop offset="0.45" stop-color="#3c3f43"/>
      <stop offset="1" stop-color="#2e3134"/>
    </linearGradient>
    <linearGradient id="cbezel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b3e42"/><stop offset="1" stop-color="#2a2d30"/>
    </linearGradient>
    <radialGradient id="cgloss" cx="0.5" cy="0" r="0.85">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.10"/>
    </radialGradient>
  </defs>

  <!-- orange Schale mit Randnaht -->
  <rect x="0" y="0" width="1072" height="808" rx="105" fill="url(#cbody)"/>
  <rect x="0" y="0" width="1072" height="808" rx="105" fill="url(#cgloss)"/>
  <rect x="15" y="15" width="1042" height="778" rx="93" fill="none" stroke="#fbe2cc" stroke-opacity="0.30" stroke-width="2.5"/>

  <!-- Eck-Riffelung (vier Ecken, am CAD ausgemessen) -->
  <g stroke="#7d3410" stroke-opacity="0.38" stroke-width="3.4" stroke-linecap="round">
    ${RIBS}
    <g transform="translate(1072,0) scale(-1,1)">${RIBS}</g>
    <g transform="translate(0,808) scale(1,-1)">${RIBS}</g>
    <g transform="translate(1072,808) scale(-1,-1)">${RIBS}</g>
  </g>

  <!-- Pulslinie (liegt hinter dem Summer-Tab, wie im CAD) -->
  <path d="M51 606 H548 L592 676 L640 552 L700 606 H1021" fill="none"
        stroke="#8d3a12" stroke-opacity="0.58" stroke-width="5"
        stroke-linejoin="round" stroke-linecap="round"/>

  <!-- Summer-Tab (hängt an der Platte, elliptischer Boden) -->
  <path d="M249 300 H519 V466 A135 112 0 0 1 249 466 Z" fill="url(#cplate)"/>
  <ellipse cx="384" cy="455" rx="78" ry="78" fill="#3a3d41"/>
  <circle cx="384" cy="455" r="70" fill="none" stroke="#6e7378" stroke-width="13"
          stroke-dasharray="5 9" stroke-linecap="butt"/>
  <circle cx="384" cy="455" r="57" fill="#313438"/>
  <circle cx="384" cy="455" r="57" fill="none" stroke="#2a2d30" stroke-width="3"/>
  <circle cx="384" cy="455" r="42" fill="#2b2e32"/>

  <!-- dunkle Platte -->
  <path d="M168 121 H904 A28 28 0 0 1 932 149 V299 A28 28 0 0 1 904 327 H168
           A28 28 0 0 1 140 299 V149 A28 28 0 0 1 168 121 Z" fill="url(#cplate)"/>
  <path d="M168 128 H904 A22 22 0 0 1 926 150 V298 A22 22 0 0 1 904 320 H168
           A22 22 0 0 1 146 298 V150 A22 22 0 0 1 168 128 Z" fill="none"
        stroke="#ffffff" stroke-opacity="0.07" stroke-width="2"/>

  <!-- LCD-Fenster: Fassung + schwarzer Innenrahmen -->
  <rect x="220" y="166" width="331" height="116" rx="12" fill="url(#cbezel)"/>
  <rect x="232" y="178" width="307" height="92" rx="8" fill="#16191b"/>
  <rect x="238" y="184" width="295" height="80" rx="6" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="4"/>

  <!-- PULSE als Konturschrift -->
  <!-- PULSE: im CAD x 618..910, y 152..225 (gemessen) -->
  <text x="618" y="227" text-anchor="start" textLength="285" lengthAdjust="spacingAndGlyphs"
        font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="700"
        fill="none" stroke="#f0c39c" stroke-opacity="0.30" stroke-width="8"
        stroke-linejoin="round">PULSE</text>
  <text x="618" y="228" text-anchor="start" textLength="285" lengthAdjust="spacingAndGlyphs"
        font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="700"
        fill="none" stroke="#2c2f33" stroke-width="6" stroke-linejoin="round">PULSE</text>

</svg>`;

const UI = {
  devices: [],
  cards: {},

  init() {
    $('#fwver').textContent = `fw ${FW.version}`;
    this.devices = FW.devices.map((spec, i) => new Device(spec, i));
    Game.devices = this.devices;
    this.buildField();
    this.buildDevices();
    Phone.render();
    Sound.loadFiles();
    this.renderSoundList();
    this.bindChrome();
    Log.sys(`Emulator gestartet, fw ${FW.version}, ${this.devices.length} Geräte aus`, 'l-dim');
    Log.sys(`Ton: stumm - ${Sound.total} Sounds aus TONPAKET_DORIAN.md noch nicht geliefert`, 'l-warn');
    // fester Takt statt requestAnimationFrame: rAF pausiert im Hintergrund-Tab,
    // dann würde die Firmware einfrieren (Boot bliebe hängen).
    this._last = performance.now();
    setInterval(() => this.loop(), 80);
  },

  // ------------------------------------------------------------- bind chrome
  bindChrome() {
    $('#btnAllOn').onclick = () => {
      this.devices.forEach(d => { if (!d.on) d.powerOn(); });
      UI.toast('Alle vier Geräte starten - Boot-Sequenz läuft');
    };
    $('#btnAllOff').onclick = () => {
      this.devices.forEach(d => { if (d.on) d.powerOff('Knopf 2 s gehalten'); });
      Game.reset();
      UI.toast('Alle Geräte aus, Runde zurückgesetzt');
    };
    $('#btnDemo').onclick = () => Demo.start();
    $('#speed').onchange = (e) => {
      Game.speed = parseFloat(e.target.value) || 1;
      Log.sys(`Zeitraffer ${Game.speed}× (Rundenuhr, Knopfdrücke bleiben echt)`, 'l-dim');
    };
    $('#btnLog').onclick = () => this.toggleDrawer('#logDrawer');
    $('#btnSound').onclick = () => {
      this.renderSoundList();
      this.toggleDrawer('#soundDrawer');
    };
    document.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'closeDrawers') this.closeDrawers();
      if (act.dataset.act === 'clearLog') { Log.lines = []; Log.dirty = true; }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeDrawers();
    });
  },

  toggleDrawer(sel) {
    const d = $(sel);
    const open = d.hidden;
    this.closeDrawers();
    d.hidden = !open;
    if (open && sel === '#logDrawer') Log.render();
    if (open && sel === '#soundDrawer') this.renderSoundList();
  },
  closeDrawers() {
    $$('.drawer').forEach(d => { d.hidden = true; });
  },

  // ------------------------------------------------------------------ field
  buildField() {
    const f = $('#field');
    this.devices.forEach(d => {
      const p = document.createElement('div');
      p.className = 'puck';
      p.dataset.id = d.id;
      p.style.setProperty('--c', d.color);
      p.style.left = (d.pos.x / FW.field.w * 100) + '%';
      p.style.top = (d.pos.y / FW.field.h * 100) + '%';
      p.innerHTML = `<span class="ptag"></span>${d.id}<span class="pdist"></span>`;
      p.title = `Gerät ${d.id} - ziehen, um den Spieler zu bewegen`;
      f.appendChild(p);
      this.makeDraggable(p, d);
    });
  },

  makeDraggable(el, d) {
    const f = $('#field');
    let dragging = false;
    const move = (ev) => {
      const r = f.getBoundingClientRect();
      d.pos.x = Math.min(FW.field.w - 0.4, Math.max(0.4, (ev.clientX - r.left) / r.width * FW.field.w));
      d.pos.y = Math.min(FW.field.h - 0.4, Math.max(0.4, (ev.clientY - r.top) / r.height * FW.field.h));
    };
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      dragging = true;
      el.setPointerCapture(ev.pointerId);
      move(ev);
    });
    el.addEventListener('pointermove', (ev) => { if (dragging) move(ev); });
    const end = (ev) => {
      if (!dragging) return;
      dragging = false;
      try { el.releasePointerCapture(ev.pointerId); } catch (e) {}
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // click on a puck in the menu also presses its button (convenience)
    el.addEventListener('dblclick', () => d.on && d.pressShort());
  },

  roleLabel(d) {
    if (!d.on) return 'aus';
    switch (d.role) {
      case 'seeker': return 'Sucher';
      case 'hider': return Game.captured.has(d.id) ? 'gefangen' : 'versteckt';
      case 'zombie': return 'Zombie';
      case 'survivor': return 'frei';
      case 'infected': return 'infiziert';
      case 'hunter': return 'jagt';
      case 'prey': return 'versteckt';
    }
    return { boot: 'bootet', menu: 'Menü', ready: 'bereit', countdown: '3-2-1', ended: 'Ende', grace: 'Schonzeit', round: 'Runde' }[d.phase] || d.phase;
  },

  renderField() {
    this.devices.forEach(d => {
      const p = $(`.puck[data-id="${d.id}"]`);
      if (!p) return;
      p.style.left = (d.pos.x / FW.field.w * 100) + '%';
      p.style.top = (d.pos.y / FW.field.h * 100) + '%';
      p.classList.toggle('off', !d.on);
      p.style.setProperty('--cap', Math.min(1, d.capturePct || 0).toFixed(3));
      p.classList.toggle('beeping', d.soundPulseT > 0.02);
      const tag = p.querySelector('.ptag');
      if (tag) tag.textContent = this.roleLabel(d);
      const dist = p.querySelector('.pdist');
      if (dist) {
        let best = null;
        for (const [, v] of d.peers) if (best === null || v < best) best = v;
        dist.textContent = d.on ? (best === null ? 'kein Kontakt' : best.toFixed(1) + ' m') : '';
      }
    });
    const act = Game.activeDevices().length;
    const meta = Game.phase === 'idle'
      ? `${act} Geräte an · keine Runde`
      : `${Game.mode ? Game.mode.name : ''} · ${({ countdown: 'Start', grace: 'Schonzeit', round: 'Runde', pause: 'Wechsel', ended: 'Ende' })[Game.phase] || Game.phase}`;
    $('#fieldmeta').textContent = meta;
  },

  // ---------------------------------------------------------------- devices

  buildDevices() {
    const wrap = $('#devices');
    wrap.innerHTML = '';
    this.devices.forEach(d => {
      const card = document.createElement('article');
      card.className = 'dev';
      card.dataset.id = d.id;
      card.style.setProperty('--c', d.color);
      card.innerHTML = `
        <div class="devhead">
          <span class="did">${d.id}</span>
          <span class="dname">Gerät ${d.id}</span>
          <span class="chip" data-chip>aus</span>
        </div>
        <div class="case">
          ${CASE_SVG}
          <div class="lcd" data-screen></div>
        </div>
        <div class="devfoot">
          <button class="knopf" data-btn title="kurz drücken / 2 s halten">KNOPF</button>
          <div class="fk">
            <div class="mini"><span>Akku</span><b data-bat>--</b></div>
            <div class="bat" data-batbar></div>
          </div>
          <div class="fk right">
            <div class="mini"><span>WLAN</span><b data-wifi>aus</b></div>
            <div class="ledrow"><i class="led" data-led title="Summer (stumm)"></i><i class="led ap" data-ap title="WLAN AP"></i></div>
          </div>
        </div>
        <div class="devhint" data-hint></div>`;
      wrap.appendChild(card);
      this.cards[d.id] = card;
      this.bindKnopf(card.querySelector('[data-btn]'), d);
    });
  },

  bindKnopf(btn, d) {
    let down = false;
    const start = (ev) => {
      ev.preventDefault();
      if (down) return;
      down = true;
      btn.classList.add('holding');
      if (btn.setPointerCapture && ev.pointerId !== undefined) {
        try { btn.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      d.holdStart();
    };
    const end = (ev) => {
      if (!down) return;
      down = false;
      btn.classList.remove('holding');
      btn.style.setProperty('--hold', 0);
      d.holdRelease();
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', (ev) => { if (down && ev.buttons === 0) end(ev); });
    btn.addEventListener('keydown', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') start(ev); });
    btn.addEventListener('keyup', (ev) => { if (ev.key === ' ' || ev.key === 'Enter') end(ev); });
  },

  // LCD-Inhalt: zwei Zeilen wie auf einem 128x32-OLED
  screenHTML(d) {
    const m = d.screenModel();
    const pct = Math.round(d.batteryPct);
    const cells = [1, 2, 3, 4].map(i => `<i class="${pct > (i - 1) * 25 ? 'on' : ''}"></i>`).join('');
    if (!m) {
      return `<div class="lrow"><span class="lmode">AUS</span><span class="lbat">${cells}</span></div>
        <div class="lrow"><span class="lbig" style="opacity:.45">—</span></div>`;
    }
    const bars = Array.from({ length: FW.bars }, (_, i) => `<i class="${i < (m.bars || 0) ? 'on' : ''}"></i>`).join('');
    const time = (m.time !== null && m.time !== undefined) ? fmtTime(m.time) : '';
    const big = String(m.big || '');
    return `<div class="lrow">
        <span class="lmode">${m.top || ''}</span>
        <span class="lsub">${m.sub || ''}</span>
        <span class="ltime">${time}</span>
      </div>
      <div class="lrow">
        <span class="lbig ${big.length > 9 ? 'mini' : ''}">${big}</span>
        <span class="lbars">${bars}</span>
      </div>
      <span class="lcap"><i style="width:${Math.round((m.capture || 0) * 100)}%"></i></span>`;
  },

  renderDevices() {
    this.devices.forEach(d => {
      const card = this.cards[d.id];
      if (!card) return;
      const a = d.aura();
      const chip = card.querySelector('[data-chip]');
      chip.className = 'chip ' + a.cls;
      chip.textContent = a.text;
      card.classList.toggle('off', !d.on);

      const scr = card.querySelector('[data-screen]');
      const m2 = d.screenModel();
      const key = [d.on, d.phase, m2 ? m2.top : '', m2 ? m2.big : '', m2 ? m2.sub : '',
        m2 ? m2.time : '', m2 ? m2.bars : 0, Math.round((m2 && m2.capture || 0) * 12),
        d.soundPulseT > 0.02, Math.round(d.batteryPct / 4)].join('|');
      if (scr.dataset.key !== key) {          // nur neu zeichnen, wenn sich etwas ändert
        scr.dataset.key = key;
        scr.className = 'lcd' + (d.on ? '' : ' dark') + (d.soundPulseT > 0.02 ? ' snd' : '');
        scr.innerHTML = this.screenHTML(d);
        // Text im LCD passend verkleinern, statt ihn abzuschneiden
        ['.lbig', '.lsub'].forEach(sel => {
          const el = scr.querySelector(sel);
          if (!el) return;
          let fs = parseFloat(getComputedStyle(el).fontSize) || 12;
          let guard = 0;
          while (el.scrollWidth > el.clientWidth + 1 && fs > 4.5 && guard++ < 12) {
            fs -= 0.6;
            el.style.fontSize = fs + 'px';
          }
        });
      }

      const pct = Math.round(d.batteryPct);
      card.querySelector('[data-bat]').textContent = d.on ? `${d.voltage.toFixed(2)} V` : '--';
      const lvl = pct <= 10 ? 'crit' : pct <= FW.battery.warnPct ? 'low' : '';
      card.querySelector('[data-batbar]').innerHTML = [1, 2, 3, 4]
        .map(i => `<i class="${pct > (i - 1) * 25 ? 'on ' + lvl : ''}"></i>`).join('');
      const wifiEl = card.querySelector('[data-wifi]');
      wifiEl.textContent = d.apOn ? (d.apClients ? 'Handy' : 'AP an') : 'aus';
      wifiEl.title = d.apOn ? `${FW.wifi.ssidPrefix}${d.id} · http://${FW.wifi.ip}` : 'WLAN aus';
      card.querySelector('[data-led]').classList.toggle('on', d.soundPulseT > 0.02);
      card.querySelector('[data-ap]').classList.toggle('on', !!d.apOn);
      const btn = card.querySelector('[data-btn]');
      btn.style.setProperty('--hold', Math.min(1, (d.holding ? d.holdT : 0) / FW.holdToPowerMs).toFixed(3));
      btn.classList.toggle('holding', !!d.holding);
    });
  },

  // ----------------------------------------------------------------- status
  renderStatus() {
    const devs = Game.activeDevices();
    const phase = {
      idle: devs.some(d => d.phase === 'ready') ? 'Warte auf gemeinsamen Start' : 'Bereit - Geräte einschalten',
      countdown: 'Start in 3-2-1',
      grace: 'Schonzeit läuft',
      round: 'Runde läuft',
      pause: 'Rollenwechsel',
      ended: 'Runde vorbei',
    }[Game.phase] || Game.phase;
    $('#statPhase').textContent = phase;
    $('#statDev').textContent = `${devs.length} von 4 Geräten an`;
    $('#statBeeps').textContent = `${Game.beeps} Piepser`;
    $('#statNote').textContent = Sound.delivered
      ? `Ton: ${Sound.delivered}/${Sound.total} Sounds aktiv`
      : 'Ton: noch stumm — die 38 Sounds fehlen (Dorian)';
  },

  renderAll() {
    this.renderField();
    this.renderDevices();
    this.renderStatus();
    Phone.refreshLive();
    Log.render();
  },

  // ------------------------------------------------------------------ toast
  toast(text, cls) {
    const t = $('#toast');
    t.textContent = text;
    t.className = 'toast show' + (cls === 'err' ? ' err' : '');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.className = 'toast'; }, 2800);
  },

  flashBattery(d) { this.toast(`Gerät ${d.id}: Akku leer - bitte laden (A-11)`, 'err'); },

  // ------------------------------------------------------------- sound list
  renderSoundList() {
    const box = $('#soundlist');
    if (!box) return;
    box.innerHTML = SOUNDS.map(s => {
      const n = Sound.counts[s.id] || 0;
      return `<div class="s ${n ? '' : 'none'}" title="${s.when}">
        <span class="b">${s.block}</span><span class="id">${s.id}</span><span class="n">${n}</span></div>`;
    }).join('');
    $('#btnSound').textContent = Sound.delivered
      ? `Ton: ${Sound.delivered}/${Sound.total}`
      : `Ton: stumm (0/${Sound.total})`;
    $('#btnSound').classList.toggle('on', Sound.delivered > 0);
  },

  // ------------------------------------------------------------------- loop
  loop() {
    const now = performance.now();
    // im Hintergrund-Tab drosselt der Browser den Takt auf ~1/s: dann grösserer
    // Zeitschritt, damit Runden nicht in Zeitlupe laufen
    const cap = document.hidden ? 1.5 : 0.25;
    const dt = Math.min(cap, (now - (this._last || now)) / 1000) || 0.1;
    this._last = now;
    this.devices.forEach(d => d.tick(dt));
    Game.tick(dt);
    this.renderAll();
  },
};

// -------------------------------------------------------------------- phone
const Phone = {
  state: 'lock',         // lock | wifi | connecting | web
  devId: null,
  tab: 'raum',
  banner: '',
  savedMsg: '',
  timer: null,

  clock() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  bar() {
    const on = this.state === 'web' ? 4 : this.state === 'wifi' || this.state === 'connecting' ? 2 : 0;
    return `<div class="pbar">
      <span>${this.clock()}</span>
      <span class="pright"><span style="font-size:9px;color:#5d6d73">${this.state === 'lock' ? 'WLAN aus' : this.state === 'web' ? 'Versteck-' + this.devId : 'WLAN an'}</span>
      <span class="sig">${[1, 2, 3, 4].map(i => `<i class="${i <= on ? 'on' : ''}"></i>`).join('')}</span></span>
    </div>`;
  },

  render() {
    const sc = $('#phoneScreen');
    if (!sc) return;
    let body = '';
    if (this.state === 'lock') {
      body = `<div class="plock">
        <div class="clock">${this.clock()}</div>
        <div class="hint">WLAN ist aus. Um Modus und Spieldauer einzustellen,<br>muss das Handy im WLAN des Geräts sein (A-08).</div>
        <button class="btn primary" data-act="wifiOn">WLAN einschalten</button>
      </div>`;
    } else if (this.state === 'wifi' || this.state === 'connecting') {
      const nets = Game.devices.filter(d => d.apOn);
      const rows = nets.length ? nets.map(d => `
        <button class="row" data-act="connect" data-id="${d.id}">
          <span class="ssid">${FW.wifi.ssidPrefix}${d.id}</span>
          <span class="state">offen</span>
          <span class="sig">${[1, 2, 3, 4].map(i => `<i class="on"></i>`).join('')}</span>
        </button>`).join('')
        : `<p class="dim small" style="padding:10px 4px">Kein Netzwerk in Reichweite. Gerät zuerst einschalten (Knopf 2 s halten).</p>`;
      body = `<div class="pbody">
        <div>
          <h4 style="margin:0 0 2px;font-size:14px">WLAN</h4>
          <p class="dim small">Netzwerke in der Nähe</p>
        </div>
        <div class="wifilist">${rows}</div>
        <p class="dim small">Die Geräte haben ein offenes Netz ohne Passwort. Reichweite ca. 10 m.</p>
      </div>`;
      if (this.state === 'connecting') {
        body += `<div class="toast show" style="position:static;transform:none;opacity:1;background:#16342c;border:1px solid #2d6d5b;margin:0 14px">Verbinde mit Versteck-${this.devId} …</div>`;
      }
    } else if (this.state === 'web') {
      const d = Game.byId(this.devId);
      if (!d || !d.on) { this.state = 'wifi'; this.render(); return; }
      const tabBtn = (id, label) => `<button data-act="tab" data-tab="${id}" class="${this.tab === id ? 'on' : ''}">${label}</button>`;
      const room = Game.roomFrom(d);
      const inRoom = room.filter(r => r.state === 'range').length;
      let inner = '';
      if (this.tab === 'raum') {
        inner = `<div class="roomcard">
            <div class="roomhead">
              <b>Raum</b>
              <span class="dim small">${inRoom} von ${room.length} Geräten in Reichweite</span>
            </div>
            <div id="roombox">${this.roomHTML(d)}</div>
            <p class="note" style="margin-top:8px">Alle Geräte hängen im selben Funknetz (ESP-NOW).
              Einstellungen, die hier gespeichert werden, gelten für alle Geräte im Raum.</p>
          </div>`;
      } else if (this.tab === 'einstellungen') {
        inner = `<form class="form" id="settings">
            <label>Modus
              <select name="mode">
                ${FW.modes.map(m => `<option value="${m.id}" ${m.id === d.mode.id ? 'selected' : ''}>${m.name}</option>`).join('')}
              </select>
            </label>
            <label>Spieldauer (min)
              <input name="minutes" type="number" min="0.5" max="10" step="0.5" value="${(d.roundSec / 60).toFixed(1)}">
            </label>
            <label>Wartezeit (s)
              <input name="grace" type="number" min="0" max="60" step="5" value="${d.graceSec}">
            </label>
            <label>Sucher
              <select name="seeker">
                ${Game.devices.map(x => `<option value="${x.id}" ${x.id === d.settings.seeker ? 'selected' : ''}>Gerät ${x.id}</option>`).join('')}
              </select>
            </label>
            <button class="btn primary" type="submit">Für alle Geräte speichern</button>
            <div class="savedmsg ${Phone.savedMsgErr ? 'err' : ''}" id="savedmsg">${Phone.savedMsg}</div>
            <p class="note">Gerät ${d.id} schickt die Einstellung per ESP-NOW an alle Geräte im Raum
              (${inRoom} von ${room.length}). Kein Knopfdrücken an den anderen Geräten nötig -
              A-08. Gespeichert wird im jeweiligen Gerät (nvs), eine laufende Runde bleibt unberührt.</p>
          </form>`;
      } else {
        inner = `<div class="rules">
          <div class="mode">
            <h4>Klassisch (2-4 Spieler, 5 min)</h4>
            <p>Ein Sucher, die anderen verstecken sich. Das Suchergerät piepst schneller, je näher
            der nächste Verstecker ist. 3 Sekunden innerhalb von 2 m = gefangen.</p>
          </div>
          <div class="mode">
            <h4>Zeitdruck (2-4 Spieler, 3 min)</h4>
            <p>Wie Klassisch, aber die Fangdistanz wächst: Stufe 1 2 m, Stufe 2 3 m, Stufe 3 4 m,
            Endspurt 6 m. Wer stehen bleibt, verliert.</p>
          </div>
          <div class="mode">
            <h4>Rollentausch (2 Spieler, 4 × 5 min)</h4>
            <p>Beide Geräte piepsen. Nach jeder Runde tauschen Jäger und Gejagter.
            Jeder Fang gibt einen Punkt, bei Gleichstand entscheidet ein Stechen.</p>
          </div>
          <div class="mode">
            <h4>Zombie (3-4 Spieler, 5 min)</h4>
            <p>Der zuletzt gedrückte Knopf wird Zombie. Wer infiziert wird, jagt mit.
            Überlebende gewinnen, wenn nach 5 Minuten noch einer frei ist.</p>
          </div>
          <div>
            <h4>Die drei Grundregeln</h4>
            <ul>
              <li>Schnell heisst nah, langsam heisst weit, still heisst weg.</li>
              <li>3 Sekunden innerhalb der Fangdistanz = gefangen (Doppelton).</li>
              <li>Ein Knopf: kurz = drücken, 2 s halten = ein/aus.</li>
            </ul>
          </div>
          <p class="dim" style="font-size:10.5px">Vollständige Fassung: Spielregeln v2 (A5-Karte liegt bei jedem Gerät).</p>
        </div>`;
      }
      body = `
        <div class="webhead">
          <button class="back" data-act="disconnect" title="trennen">←</button>
          <span class="url">http://${FW.wifi.ip}/</span>
          <span class="dim small">AP ${FW.wifi.ssidPrefix}${d.id}</span>
        </div>
        <div class="pbody">
          <div class="tabs">${tabBtn('raum', 'Raum')}${tabBtn('einstellungen', 'Einstellungen')}${tabBtn('regeln', 'Regeln')}</div>
          ${inner}
        </div>`;
    }

    sc.innerHTML = this.bar() + body;
    this.bind(sc);
    this.refreshLive();
  },

  // Alle Geräte des Raums: kleines Feld + Liste (was das Gerät per ESP-NOW sieht)
  roomHTML(origin) {
    const room = Game.roomFrom(origin);
    const map = room.map(r => {
      const d = r.dev;
      const cls = r.state === 'range' ? '' : r.state === 'out' ? 'out' : 'gone';
      // in den Rahmen einpassen, damit der Punkt am Rand nicht abgeschnitten wird
      const lx = 6 + (d.pos.x / FW.field.w) * 88;
      const ly = 8 + (d.pos.y / FW.field.h) * 84;
      return `<i class="rdot ${cls}" style="--c:${d.color};left:${lx.toFixed(2)}%;top:${ly.toFixed(2)}%">${d.id}</i>`;
    }).join('');
    const rows = room.map(r => {
      const dev = r.dev;
      let where, mode, state, bat;
      if (r.state === 'range') {
        where = dev.id === origin.id ? 'verbunden' : (r.dist !== null ? `${r.dist.toFixed(1)} m` : 'im Raum');
        mode = dev.mode.name;
        state = dev.aura().text;
        bat = `${Math.round(dev.batteryPct)} %`;
      } else if (r.state === 'out') {
        where = 'ausser Reichweite'; mode = '—'; state = 'Funk weg'; bat = '—';
      } else {
        where = 'aus'; mode = '—'; state = 'aus'; bat = '—';
      }
      return `<div class="rrow ${r.state}">
        <span class="did" style="--c:${dev.color}">${dev.id}</span>
        <span class="rmain"><b>${mode}</b><span>${state}</span></span>
        <span class="rbat">${bat}</span>
        <span class="rdist">${where}</span>
      </div>`;
    }).join('');
    return `<div class="roommap">${map}</div><div class="roomlist">${rows}</div>`;
  },

  bind(root) {
    $$('[data-act]', root).forEach(el => {
      const act = el.dataset.act;
      if (act === 'wifiOn') el.onclick = () => { this.state = 'wifi'; this.render(); };
      if (act === 'connect') el.onclick = () => this.connect(el.dataset.id);
      if (act === 'disconnect') el.onclick = () => this.disconnect();
      if (act === 'tab') el.onclick = () => { this.tab = el.dataset.tab; this.savedMsg = ''; this.render(); };
    });
    const form = $('#settings', root);
    if (form) form.onsubmit = (e) => { e.preventDefault(); this.save(form); };
  },

  connect(id) {
    const d = Game.byId(id);
    if (!d || !d.apOn) return;
    this.devId = id;
    this.state = 'connecting';
    this.render();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const dev = Game.byId(id);
      if (!dev || !dev.apOn) { this.state = 'wifi'; this.render(); return; }
      dev.apClients = (dev.apClients || 0) + 1;
      Sound.play(dev, 'phone_connected');
      dev.log(`wifi: Handy verbunden (192.168.4.2), Seite http://${FW.wifi.ip} geöffnet`, 'ok');
      this.state = 'web';
      this.tab = 'raum';
      this.savedMsg = '';
      this.savedMsgErr = false;
      this.render();
      UI.toast(`Handy im WLAN von Gerät ${id}`);
    }, 900);
  },

  disconnect() {
    const d = Game.byId(this.devId);
    if (d) {
      d.apClients = Math.max(0, (d.apClients || 0) - 1);
      d.log('wifi: Handy getrennt', 'l-dim');
    }
    this.state = 'wifi';
    this.devId = null;
    this.render();
  },

  save(form) {
    const d = Game.byId(this.devId);
    this.savedMsg = '';
    this.savedMsgErr = false;
    if (!d || !d.on) { this.savedMsg = 'Gerät ist aus.'; this.savedMsgErr = true; this.render(); return; }
    const modeId = form.mode.value;
    const minutes = parseFloat(form.minutes.value);
    const grace = parseInt(form.grace.value, 10);
    if (!(minutes > 0) || !isFinite(minutes) || isNaN(grace) || grace < 0) {
      this.savedMsg = 'Bitte Zahlen eingeben (Dauer > 0, Wartezeit ≥ 0).';
      this.savedMsgErr = true;
      Sound.play(d, 'error');
      return;
    }
    const patch = {
      mode: modeId,
      roundSec: Math.round(minutes * 60),
      graceSec: grace,
      seeker: form.seeker.value,
    };
    // Ein Gerät nimmt die Einstellung an und verteilt sie per ESP-NOW an alle im Raum
    const res = Game.applySettingsToRoom(d, patch);
    Sound.play(d, 'saved');
    const modeName = (FW.modes.find(m => m.id === modeId) || d.mode).name;
    const parts = [`${modeName}, ${fmtTime(patch.roundSec)}, ${grace} s Schonzeit`];
    parts.push(res.ok.length ? `an ${res.ok.length} Geräte verteilt (${res.ok.join(', ')})` : 'an kein Gerät verteilt');
    if (res.out.length) parts.push(`ausser Reichweite: ${res.out.join(', ')}`);
    if (res.off.length) parts.push(`aus: ${res.off.join(', ')}`);
    this.savedMsg = parts.join(' · ');
    this.savedMsgErr = res.ok.length === 0;
    this.render();
    UI.toast(res.out.length
      ? `Gespeichert auf ${res.ok.length} Geräten - ${res.out.join(', ')} ausser Reichweite`
      : `Gespeichert auf allen ${res.ok.length} Geräten`);
  },

  refreshLive() {
    if (this.state !== 'web') return;
    const d = Game.byId(this.devId);
    if (!d) return;
    if (this.tab === 'raum') {
      const box = document.getElementById('roombox');
      if (box) box.innerHTML = this.roomHTML(d);      // kein Eingabefeld darin, Neuaufbau ist safe
    }
  },
};

// ---------------------------------------------------------------- auto demo
const Demo = {
  running: false,

  async wait(ms) { return new Promise(r => setTimeout(r, ms)); },

  async press(d, ms = 40) {
    d.holdStart();
    await this.wait(ms);
    d.holdRelease();
  },

  async start() {
    if (this.running) { UI.toast('Demo läuft schon'); return; }
    this.running = true;
    UI.toast('Auto-Demo: einschalten → Start → Runde → ausschalten');
    Log.sys('--- Auto-Demo startet ---', 'l-ok');
    try {
      // 1. power on everything that is off
      for (const d of Game.devices) if (!d.on) d.powerOn();
      await this.wait(2300);

      // 2. the phone sets mode and duration (A-08), device A as seeker
      for (const d of Game.devices) {
        d.saveSettings({ mode: 'klassisch', roundSec: 300, graceSec: 30, seeker: 'A' });
      }
      $('#speed').value = '5';
      Game.speed = 5;
      Log.sys('Handy: Klassisch, 5 min, Sucher A (Zeitraffer 5×)', 'l-dim');

      // 3. every player starts with a double press (10 s window)
      for (const d of Game.devices) {
        d.modeIndex = FW.modes.findIndex(m => m.id === 'klassisch');
        d.saveSettings({ mode: 'klassisch' });
        await this.press(d);
        await this.wait(120);
        await this.press(d);
        await this.wait(150);
      }

      // 4. shorten the grace time so the demo does not idle
      let guard = 0;
      while (this.running && Game.phase !== 'round' && guard++ < 120) {
        if (Game.phase === 'grace') Game.graceLeft = Math.min(Game.graceLeft, 0.8);
        await this.wait(150);
      }

      // 5. walk the seeker to the hiders
      guard = 0;
      while (this.running && Game.phase === 'round' && guard++ < 900) {
        const seeker = Game.devices.find(d => d.role === 'seeker');
        const hiders = Game.devices.filter(d => d.role === 'hider' && !Game.captured.has(d.id));
        if (!seeker || !hiders.length) break;
        let tgt = hiders[0], best = Infinity;
        for (const h of hiders) {
          const dv = seeker.peers.get(h.id);
          const dist = dv === undefined ? Math.hypot(h.pos.x - seeker.pos.x, h.pos.y - seeker.pos.y) + 12 : dv;
          if (dist < best) { best = dist; tgt = h; }
        }
        const dx = tgt.pos.x - seeker.pos.x, dy = tgt.pos.y - seeker.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        if (len > 1.1) {
          seeker.pos.x += (dx / len) * 0.32;
          seeker.pos.y += (dy / len) * 0.32;
        }
        await this.wait(110);
      }

      // 6. let the result stand, then power everything off (Knopf 2 s)
      await this.wait(2500);
      for (const d of Game.devices) {
        if (!d.on) continue;
        d.holdStart();
        d.holdT = FW.holdToPowerMs + 100;
        d.holdRelease();
        await this.wait(200);
      }
      Log.sys('--- Auto-Demo fertig: 4 Geräte aus ---', 'l-ok');
      UI.toast('Demo fertig - 4 Geräte aus');
      $('#speed').value = '1';
      Game.speed = 1;
    } catch (err) {
      Log.sys('Demo-Fehler: ' + err.message, 'l-err');
      UI.toast('Demo abgebrochen: ' + err.message, 'err');
    }
    this.running = false;
  },
};

// -------------------------------------------------------------------- start
window.addEventListener('DOMContentLoaded', () => UI.init());
