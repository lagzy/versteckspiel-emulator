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
    requestAnimationFrame(() => this.loop());
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
        <div class="devbody">
          <div class="screen dark" data-screen></div>
          <div class="side">
            <button class="knopf" data-btn title="kurz drücken / 2 s halten">K</button>
            <div class="mini"><span>Akku</span><b data-bat>--</b></div>
            <div class="bat" data-batbar></div>
            <div class="mini"><span>WLAN</span><b data-wifi>aus</b></div>
            <div class="ledrow"><i class="led" data-led title="Summer (stumm)"></i><i class="led ap" data-ap title="WLAN AP"></i></div>
          </div>
        </div>`;
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

  screenHTML(d) {
    const m = d.screenModel();
    if (!m) {
      return `<div class="st"><span>AUS</span></div>
        <div class="sbig" style="color:#2c4550">—</div>
        <div class="ssub" style="color:#2c4550">2 s halten</div>
        <div class="stime" style="color:#1d323a">--:--</div>
        <div class="sndot"></div>`;
    }
    const pct = Math.round(d.batteryPct);
    const cells = [1, 2, 3, 4].map(i => `<i class="${pct > (i - 1) * 25 ? 'on' : ''}"></i>`).join('');
    const bars = Array.from({ length: FW.bars }, (_, i) => `<i class="${i < (m.bars || 0) ? 'on' : ''}"></i>`).join('');
    return `
      <div class="st"><span>${m.top || ''}</span><span class="batmini">${cells}</span></div>
      <div class="sbig">${m.big || ''}</div>
      <div class="ssub">${m.sub || ''}</div>
      <div class="stime">${m.time !== null && m.time !== undefined ? fmtTime(m.time) : ''}</div>
      <div class="sbars">${bars}</div>
      <div class="scap"><i style="width:${Math.round((m.capture || 0) * 100)}%"></i></div>
      <div class="shint">${[m.hintTick, m.hint].filter(Boolean).map(h => `<span>${h}</span>`).join('')}</div>
      <div class="sndot"></div>`;
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
      scr.className = 'screen' + (d.on ? '' : ' dark') + (d.soundPulseT > 0.02 ? ' snd' : '');
      scr.innerHTML = this.screenHTML(d);

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
    const dt = Math.min(0.25, (now - (this._last || now)) / 1000) || 0.1;
    this._last = now;
    this.devices.forEach(d => d.tick(dt));
    Game.tick(dt);
    this.renderAll();
    requestAnimationFrame(() => this.loop());
  },
};

// -------------------------------------------------------------------- phone
const Phone = {
  state: 'lock',         // lock | wifi | connecting | web
  devId: null,
  tab: 'steuerung',
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
      let inner = '';
      if (this.tab === 'steuerung') {
        inner = `
          <div class="devcard" style="--c:${d.color}">
            <h4><span class="did">${d.id}</span> ${FW.deviceName} ${d.id}</h4>
            <dl class="kv">
              <dt>Firmware</dt><dd>${FW.version}</dd>
              <dt>Akku</dt><dd id="liveBat">--</dd>
              <dt>Status</dt><dd id="liveState">--</dd>
              <dt>Modus</dt><dd id="liveMode">--</dd>
              <dt>Runde</dt><dd id="liveRound">--</dd>
              <dt>Schonzeit</dt><dd id="liveGrace">--</dd>
              <dt>Funk</dt><dd id="livePeers">--</dd>
            </dl>
          </div>
          <form class="form" id="settings">
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
            <button class="btn primary" type="submit">Speichern</button>
            <div class="savedmsg ${Phone.savedMsgErr ? 'err' : ''}" id="savedmsg">${Phone.savedMsg}</div>
            <p class="note">Gespeichert wird im Gerät (nvs) und gilt nach dem Neustart -
              A-08. Während einer laufenden Runde wirkt eine Änderung ab der nächsten.</p>
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
          <span class="dim small">${d.batteryPct ? Math.round(d.batteryPct) + '%' : ''}</span>
        </div>
        <div class="pbody">
          <div class="tabs">${tabBtn('steuerung', 'Steuerung')}${tabBtn('regeln', 'Regeln')}</div>
          ${inner}
        </div>`;
    }
    sc.innerHTML = this.bar() + body;
    this.bind(sc);
    this.refreshLive();
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
      this.tab = 'steuerung';
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
    const modeIdx = FW.modes.findIndex(m => m.id === modeId);
    d.modeIndex = modeIdx >= 0 ? modeIdx : d.modeIndex;
    d.saveSettings({
      mode: modeId,
      roundSec: Math.round(minutes * 60),
      graceSec: grace,
      seeker: form.seeker.value,
    });
    Sound.play(d, 'menu_ok');
    Sound.play(d, 'saved');
    d.log(`web: Modus ${d.mode.name}, Runde ${fmtTime(d.roundSec)}, Schonzeit ${grace} s, Sucher ${d.settings.seeker} -> nvs`, 'ok');
    this.savedMsg = `Gespeichert: ${d.mode.name}, ${fmtTime(d.roundSec)}, ${grace} s Schonzeit.`;
    this.savedMsgErr = false;
    this.render();
    UI.toast(`Gerät ${d.id}: Einstellung gespeichert`);
  },

  refreshLive() {
    if (this.state !== 'web') return;
    const d = Game.byId(this.devId);
    if (!d) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
    set('liveBat', `${Math.round(d.batteryPct)} % · ${d.voltage.toFixed(2)} V`);
    set('liveState', d.aura().text);
    set('liveMode', d.mode.name);
    set('liveRound', fmtTime(d.roundSec));
    set('liveGrace', `${d.graceSec} s`);
    set('livePeers', `${d.peers.size} in Reichweite`);
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
