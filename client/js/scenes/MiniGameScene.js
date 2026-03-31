/**
 * MiniGameScene — overlay scene for task mini-games.
 * Runs on top of GameScene (paused).  On completion, fires 'taskCompleted'
 * event back to GameScene and stops itself.
 */
class MiniGameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MiniGameScene' });
  }

  init(data) {
    this._taskDef = data.taskDef;
    this._callerScene = data.callerScene || 'GameScene';
  }

  create() {
    const overlay = document.getElementById('minigame-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('minigame-title').textContent = this._taskDef.name.toUpperCase();
    document.getElementById('minigame-content').innerHTML = '';
    document.getElementById('minigame-status').textContent = '';

    // ESC closes
    this.input.keyboard.once('keydown-ESC', () => this._close(false));
    document.getElementById('btn-close-task').onclick = () => this._close(false);

    // Launch the right mini-game
    switch (this._taskDef.type) {
      case 'download':   this._buildDownload();   break;
      case 'wires':      this._buildWires();      break;
      case 'simon':      this._buildSimon();      break;
      case 'code':       this._buildCode();       break;
      case 'calibrate':  this._buildCalibrate();  break;
      default:           this._buildDownload();   break;
    }
  }

  _close(success) {
    document.getElementById('minigame-overlay').classList.add('hidden');
    document.getElementById('minigame-content').innerHTML = '';
    this.input.keyboard.removeAllKeys();

    if (success) {
      // Notify GameScene
      const gameScene = this.scene.get(this._callerScene);
      gameScene.events.emit('taskCompleted', this._taskDef.id);
    }

    this.scene.stop();
    this.scene.resume(this._callerScene);
  }

  _setStatus(text, color = '#5566aa') {
    const el = document.getElementById('minigame-status');
    el.textContent = text;
    el.style.color = color;
  }

  // ── Download ──────────────────────────────────────────────────────────────
  _buildDownload() {
    const content = document.getElementById('minigame-content');
    content.innerHTML = `
      <div class="download-wrap">
        <div class="download-bar-bg"><div class="download-bar-fill" id="dl-fill"></div></div>
        <div class="download-hint">Hold [SPACE] to download</div>
      </div>
    `;
    let progress = 0;
    const fill = document.getElementById('dl-fill');

    const onKey = (e) => {
      if (e.code === 'Space') e.preventDefault();
    };
    document.addEventListener('keydown', onKey);

    const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    const update = this.time.addEvent({
      delay: 50,
      repeat: -1,
      callback: () => {
        if (spaceKey.isDown) {
          progress = Math.min(100, progress + 1.5);
        } else {
          progress = Math.max(0, progress - 0.8);
        }
        fill.style.width = `${progress}%`;
        if (progress >= 100) {
          update.remove();
          document.removeEventListener('keydown', onKey);
          this._setStatus('DOWNLOAD COMPLETE', '#00ff88');
          setTimeout(() => this._close(true), 600);
        }
      },
    });
  }

  // ── Wires ─────────────────────────────────────────────────────────────────
  _buildWires() {
    const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];
    const content = document.getElementById('minigame-content');

    content.innerHTML = `
      <div class="wires-wrap">
        <div class="wire-col" id="wires-left"></div>
        <canvas class="wires-canvas" id="wires-canvas" width="160" height="160"></canvas>
        <div class="wire-col" id="wires-right"></div>
      </div>
    `;

    const leftCol  = document.getElementById('wires-left');
    const rightCol = document.getElementById('wires-right');
    const canvas   = document.getElementById('wires-canvas');
    const ctx      = canvas.getContext('2d');

    // Shuffle right side
    const rightOrder = [...COLORS].sort(() => Math.random() - 0.5);
    const connections = {}; // leftIndex -> rightIndex
    let selectedLeft = null;

    const leftDots = [], rightDots = [];

    COLORS.forEach((c, i) => {
      const ld = document.createElement('div');
      ld.className = 'wire-endpoint';
      ld.style.background = c;
      ld.style.color = c;
      ld.dataset.idx = i;
      leftCol.appendChild(ld);
      leftDots.push(ld);

      const rd = document.createElement('div');
      rd.className = 'wire-endpoint';
      rd.style.background = rightOrder[i];
      rd.style.color = rightOrder[i];
      rd.dataset.idx = rightOrder.indexOf(rightOrder[i]);
      rightCol.appendChild(rd);
      rightDots.push(rd);
    });

    const drawLines = () => {
      ctx.clearRect(0, 0, 160, 160);
      const lRect = leftCol.getBoundingClientRect();
      const rRect = rightCol.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();

      Object.entries(connections).forEach(([li, ri]) => {
        const ld = leftDots[li];
        const rd = rightDots[ri];
        const ldR = ld.getBoundingClientRect();
        const rdR = rd.getBoundingClientRect();
        const lx = 0;
        const ly = ldR.top + ldR.height / 2 - cRect.top;
        const rx = 160;
        const ry = rdR.top + rdR.height / 2 - cRect.top;

        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.bezierCurveTo(60, ly, 100, ry, rx, ry);
        ctx.strokeStyle = COLORS[li];
        ctx.lineWidth = 3;
        ctx.stroke();
      });
    };

    leftDots.forEach((dot, li) => {
      dot.addEventListener('click', () => {
        if (connections[li] !== undefined) return; // already connected
        leftDots.forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        selectedLeft = li;
      });
    });

    rightDots.forEach((dot, ri) => {
      dot.addEventListener('click', () => {
        if (selectedLeft === null) return;
        const targetColorIdx = rightOrder.indexOf(rightOrder[ri]);
        connections[selectedLeft] = ri;
        leftDots[selectedLeft].classList.remove('selected');
        leftDots[selectedLeft].classList.add('connected');
        dot.classList.add('connected');
        selectedLeft = null;

        setTimeout(drawLines, 20);

        if (Object.keys(connections).length === COLORS.length) {
          // Validate: left i should connect to right dot whose color matches COLORS[i]
          let correct = true;
          Object.entries(connections).forEach(([li, ri]) => {
            if (rightOrder[ri] !== COLORS[li]) correct = false;
          });
          if (correct) {
            this._setStatus('WIRES CONNECTED', '#00ff88');
            setTimeout(() => this._close(true), 600);
          } else {
            this._setStatus('WRONG CONNECTIONS — RESETTING', '#ff3355');
            setTimeout(() => {
              Object.keys(connections).forEach(k => delete connections[k]);
              leftDots.forEach(d => d.classList.remove('connected', 'selected'));
              rightDots.forEach(d => d.classList.remove('connected', 'selected'));
              ctx.clearRect(0, 0, 160, 160);
              this._setStatus('');
            }, 1200);
          }
        }
      });
    });
  }

  // ── Simon Says ────────────────────────────────────────────────────────────
  _buildSimon() {
    const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
    const content = document.getElementById('minigame-content');

    content.innerHTML = `
      <div class="simon-wrap">
        <div class="simon-grid" id="simon-grid"></div>
        <div class="simon-hint" id="simon-hint">Watch the sequence...</div>
        <div class="simon-hint" id="simon-round">Round 1 / 4</div>
      </div>
    `;

    const grid = document.getElementById('simon-grid');
    const buttons = [];

    COLORS.forEach((c, i) => {
      const btn = document.createElement('div');
      btn.className = 'simon-btn';
      btn.style.background = c;
      btn.style.color = c;
      btn.dataset.idx = i;
      grid.appendChild(btn);
      buttons.push(btn);
    });

    const SEQUENCE_LEN = 4;
    const sequence = Array.from({ length: SEQUENCE_LEN }, () => Math.floor(Math.random() * COLORS.length));
    let playerSeq = [];
    let inputEnabled = false;
    let currentRound = 1;

    const flash = (idx, cb) => {
      buttons[idx].classList.add('lit');
      setTimeout(() => { buttons[idx].classList.remove('lit'); if (cb) setTimeout(cb, 150); }, 400);
    };

    const playSequence = (len) => {
      inputEnabled = false;
      document.getElementById('simon-hint').textContent = 'Watch the sequence...';
      let i = 0;
      const next = () => {
        if (i >= len) {
          inputEnabled = true;
          document.getElementById('simon-hint').textContent = 'Repeat the sequence!';
          return;
        }
        flash(sequence[i++], next);
      };
      setTimeout(next, 600);
    };

    const checkInput = (idx) => {
      if (!inputEnabled) return;
      flash(idx);
      playerSeq.push(idx);
      const pos = playerSeq.length - 1;

      if (playerSeq[pos] !== sequence[pos]) {
        this._setStatus('WRONG SEQUENCE — RETRY', '#ff3355');
        playerSeq = [];
        inputEnabled = false;
        setTimeout(() => { this._setStatus(''); playSequence(currentRound); }, 1200);
        return;
      }

      if (playerSeq.length >= currentRound) {
        if (currentRound >= SEQUENCE_LEN) {
          this._setStatus('SEQUENCE VERIFIED', '#00ff88');
          setTimeout(() => this._close(true), 700);
        } else {
          currentRound++;
          playerSeq = [];
          document.getElementById('simon-round').textContent = `Round ${currentRound} / ${SEQUENCE_LEN}`;
          setTimeout(() => playSequence(currentRound), 600);
        }
      }
    };

    buttons.forEach((btn, i) => {
      btn.addEventListener('click', () => checkInput(i));
    });

    playSequence(currentRound);
  }

  // ── Code Input ────────────────────────────────────────────────────────────
  _buildCode() {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const content = document.getElementById('minigame-content');

    content.innerHTML = `
      <div class="code-wrap">
        <div style="font-size:0.7rem;letter-spacing:3px;color:#5566aa;margin-bottom:4px">ENTER ACCESS CODE</div>
        <div class="code-display" id="code-display">${code}</div>
        <input class="code-input" id="code-input" type="text" maxlength="6"
               inputmode="numeric" placeholder="______" autocomplete="off" />
        <div style="font-size:0.7rem;color:#5566aa">Type the 6-digit code above</div>
      </div>
    `;

    const input = document.getElementById('code-input');
    input.focus();

    input.addEventListener('input', () => {
      const val = input.value.replace(/\D/g, '');
      input.value = val;
      if (val === code) {
        this._setStatus('ACCESS GRANTED', '#00ff88');
        setTimeout(() => this._close(true), 500);
      } else if (val.length === 6) {
        this._setStatus('INCORRECT CODE — RETRY', '#ff3355');
        setTimeout(() => { input.value = ''; this._setStatus(''); }, 900);
      }
    });
  }

  // ── Calibration ───────────────────────────────────────────────────────────
  _buildCalibrate() {
    const content = document.getElementById('minigame-content');
    const TOTAL_ROUNDS = 3;

    content.innerHTML = `
      <div class="calibrate-wrap">
        <div class="calibrate-rounds" id="cal-rounds">Hit ${TOTAL_ROUNDS} times</div>
        <div class="calibrate-bar-wrap">
          <div class="calibrate-track"></div>
          <div class="calibrate-zone" id="cal-zone"></div>
          <div class="calibrate-needle" id="cal-needle"></div>
        </div>
        <div class="calibrate-hint">Press [SPACE] when needle is in the green zone</div>
      </div>
    `;

    // Zone: 30-55% of bar width
    const ZONE_LEFT  = 0.30;
    const ZONE_RIGHT = 0.55;
    const zone = document.getElementById('cal-zone');
    zone.style.left  = `${ZONE_LEFT  * 100}%`;
    zone.style.width = `${(ZONE_RIGHT - ZONE_LEFT) * 100}%`;

    const needle = document.getElementById('cal-needle');
    let pos = 0;       // 0..1
    let dir = 1;
    let speed = 0.012;
    let hits = 0;

    const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    let cooldown = false;

    const tick = this.time.addEvent({
      delay: 16,
      repeat: -1,
      callback: () => {
        pos += dir * speed;
        if (pos >= 1) { pos = 1; dir = -1; }
        if (pos <= 0) { pos = 0; dir =  1; }
        needle.style.left = `${pos * 96}%`;

        if (spaceKey.isDown && !cooldown) {
          cooldown = true;
          setTimeout(() => { cooldown = false; }, 300);

          if (pos >= ZONE_LEFT && pos <= ZONE_RIGHT) {
            hits++;
            speed = Math.min(0.03, speed + 0.003);
            document.getElementById('cal-rounds').textContent =
              hits >= TOTAL_ROUNDS ? 'CALIBRATED!' : `${TOTAL_ROUNDS - hits} more hits`;
            needle.style.background = '#00ff88';
            setTimeout(() => { needle.style.background = '#ff3355'; }, 200);

            if (hits >= TOTAL_ROUNDS) {
              tick.remove();
              this._setStatus('CALIBRATION COMPLETE', '#00ff88');
              setTimeout(() => this._close(true), 700);
            }
          } else {
            needle.style.background = '#ffffff';
            setTimeout(() => { needle.style.background = '#ff3355'; }, 150);
          }
        }
      },
    });
  }
}
