/**
 * GameScene — main gameplay scene.
 * Handles map rendering, player movement, interactions, and vision fog.
 */
class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._players = new Map();   // id -> PlayerSprite
    this._bodies  = new Map();   // bodyId -> Phaser.GameObjects
    this._tasks   = new Map();   // taskId -> TaskStation
    this._me = null;             // local player data
    this._mapData = null;
    this._keys = null;
    this._moveTimer = 0;
    this._visionMask = null;
    this._visionCircle = null;
    this._darkOverlay = null;
    this._moveInterval = null;
    this._pendingTaskId = null;
    this._nearbyKillTarget = null;
    this._nearbyBodyId = null;
    this._nearbyVentId = null;
  }

  init(data) {
    this._gameData = data.gameData;
  }

  create() {
    // Wrap everything so a JS error shows on screen instead of a silent blue canvas.
    try {
      this._createGame();
    } catch (err) {
      console.error('[GameScene] create() threw:', err);
      this.add.text(20, 20, 'ERROR: ' + err.message, {
        fontSize: '14px', fontFamily: 'monospace', color: '#ff3355',
        wordWrap: { width: this.scale.width - 40 },
      }).setScrollFactor(0).setDepth(999);
    }
  }

  _createGame() {
    const data = this._gameData;
    if (!data)      throw new Error('gameData is null — game-started event not received');
    if (!data.id)   throw new Error('data.id missing — private player data not received');
    if (!data.mapData) throw new Error('data.mapData missing');

    this._me = {
      id: data.id,
      name: data.name,
      color: data.color,
      role: data.role,
      x: data.x,
      y: data.y,
      alive: data.alive,
      tasksAssigned: data.tasksAssigned || [],
      tasksCompleted: data.tasksCompleted || [],
      killCooldownEnd: data.killCooldownEnd || 0,
    };
    this._mapData = data.mapData;

    // Setup camera
    this.cameras.main.setBounds(0, 0, this._mapData.width, this._mapData.height);
    this.cameras.main.setZoom(1);

    // Draw map layers
    this._drawBackground();
    this._drawCorridors();
    this._drawRooms();
    this._drawVents();
    this._drawSabotagePoints();
    this._drawTaskStations(data.tasksAssigned || []);

    // Spawn LOCAL player first from private data — this is guaranteed to have the
    // correct ID and position regardless of what allPlayers contains.
    this._spawnPlayer({
      id: this._me.id,
      name: this._me.name,
      color: this._me.color,
      x: this._me.x || this._mapData.spawnPoint.x,
      y: this._me.y || this._mapData.spawnPoint.y,
      alive: true,
    });

    // Spawn all other players from allPlayers (skip self — already added above).
    (data.allPlayers || []).forEach(p => {
      if (p.id !== this._me.id) this._spawnPlayer(p);
    });

    // Camera — mySprite is guaranteed to exist since we spawned it above.
    const mySprite = this._players.get(this._me.id);
    if (mySprite) {
      this.cameras.main.centerOn(mySprite.x, mySprite.y);
      this.cameras.main.startFollow(mySprite.container, true, 0.1, 0.1);
    } else {
      // Should never reach here, but log it and centre on spawn point.
      console.error('[GameScene] mySprite still null after explicit spawn — id:', this._me.id);
      this.cameras.main.centerOn(this._mapData.spawnPoint.x, this._mapData.spawnPoint.y);
    }

    // Input
    this._keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s_key: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      f: Phaser.Input.Keyboard.KeyCodes.F,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    // Key-down for interactions
    this.input.keyboard.on('keydown-E', () => this._tryOpenTask());
    this.input.keyboard.on('keydown-Q', () => this._tryKill());
    this.input.keyboard.on('keydown-R', () => this._tryReport());
    this.input.keyboard.on('keydown-F', () => this._tryVent());

    // Clickable task button
    document.getElementById('btn-do-task').onclick = () => this._tryOpenTask();
    // Vent cancel button
    document.getElementById('btn-vent-cancel').onclick = () => this._hideVentMenu();

    // Position broadcast interval
    this._moveInterval = setInterval(() => {
      if (this._me.alive) {
        const sprite = this._players.get(this._me.id);
        if (sprite) SocketManager.sendMove(sprite.x, sprite.y);
      }
    }, 50);

    // HUD setup
    HUD.show(this._me.role);
    HUD.setKillCooldown(this._me.killCooldownEnd);
    HUD.onMeetingButton(() => SocketManager.callMeeting());
    HUD.onSabotage((id) => SocketManager.sabotage(id));

    // Show virus vent button only to virus
    if (this._me.role !== 'virus') {
      document.getElementById('hud-sabotage-btns').classList.add('hidden');
    }

    // Minimap
    this._drawMinimap();

    // Socket listeners
    this._setupSocketListeners();
  }

  // ── Map Drawing ─────────────────────────────────────────────────────────

  _drawBackground() {
    const { width, height } = this._mapData;
    const bg = this.add.graphics();

    // Base fill
    bg.fillStyle(0x07071a, 1);
    bg.fillRect(0, 0, width, height);

    // Circuit grid lines
    bg.lineStyle(1, 0x0d1a3a, 0.6);
    const GRID = 80;
    for (let x = 0; x <= width; x += GRID) {
      bg.beginPath(); bg.moveTo(x, 0); bg.lineTo(x, height); bg.strokePath();
    }
    for (let y = 0; y <= height; y += GRID) {
      bg.beginPath(); bg.moveTo(0, y); bg.lineTo(width, y); bg.strokePath();
    }

    // Dot intersections
    bg.fillStyle(0x0d2244, 0.8);
    for (let x = 0; x <= width; x += GRID) {
      for (let y = 0; y <= height; y += GRID) {
        bg.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    bg.setDepth(0);
  }

  _drawCorridors() {
    const gfx = this.add.graphics();
    gfx.setDepth(1);
    const rooms = {};
    this._mapData.rooms.forEach(r => { rooms[r.id] = r; });

    this._mapData.corridors.forEach(c => {
      const from = rooms[c.from];
      const to   = rooms[c.to];
      if (!from || !to) return;

      const fx = from.x + from.w / 2;
      const fy = from.y + from.h / 2;
      const tx = to.x + to.w / 2;
      const ty = to.y + to.h / 2;
      const hw = c.width / 2;

      // Corridor as filled polygon — 4 corner points (Phaser Graphics has no canvas transform API)
      const angle = Math.atan2(ty - fy, tx - fx);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corners = [
        { x: fx - sin * hw, y: fy + cos * hw },
        { x: tx - sin * hw, y: ty + cos * hw },
        { x: tx + sin * hw, y: ty - cos * hw },
        { x: fx + sin * hw, y: fy - cos * hw },
      ];

      gfx.fillStyle(0x0e1530, 1);
      gfx.fillPoints(corners, true);

      // Corridor border lines
      gfx.lineStyle(1, 0x1a3060, 0.6);
      gfx.beginPath();
      gfx.moveTo(corners[0].x, corners[0].y);
      gfx.lineTo(corners[1].x, corners[1].y);
      gfx.strokePath();
      gfx.beginPath();
      gfx.moveTo(corners[3].x, corners[3].y);
      gfx.lineTo(corners[2].x, corners[2].y);
      gfx.strokePath();
    });
  }

  _drawRooms() {
    const BORDER_COLORS = [0x00d4ff, 0x00ff88, 0xbf00ff, 0xff8800, 0x00d4ff];
    this._mapData.rooms.forEach((room, i) => {
      const gfx = this.add.graphics();
      gfx.setDepth(2);

      // Fill
      gfx.fillStyle(parseInt(room.color.replace('#', ''), 16), 1);
      gfx.fillRoundedRect(room.x, room.y, room.w, room.h, 8);

      // Border
      const border = BORDER_COLORS[i % BORDER_COLORS.length];
      gfx.lineStyle(2, border, 0.8);
      gfx.strokeRoundedRect(room.x, room.y, room.w, room.h, 8);

      // Inner glow line
      gfx.lineStyle(1, border, 0.2);
      gfx.strokeRoundedRect(room.x + 4, room.y + 4, room.w - 8, room.h - 8, 6);

      // Room label
      this.add.text(room.x + room.w / 2, room.y + 14, room.name, {
        fontSize: '11px',
        fontFamily: 'Courier New, monospace',
        color: '#' + border.toString(16).padStart(6, '0'),
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
      }).setOrigin(0.5, 0).setDepth(3);
    });
  }

  _drawVents() {
    const rooms = {};
    this._mapData.rooms.forEach(r => { rooms[r.id] = r; });
    this._ventGraphics = this.add.graphics().setDepth(3);
    this._mapData.vents.forEach(v => {
      const room = rooms[v.room];
      if (!room) return;
      const vx = room.x + 20;
      const vy = room.y + room.h - 20;
      this._ventGraphics.fillStyle(0x334466, 1);
      this._ventGraphics.fillRect(vx - 10, vy - 10, 20, 20);
      this._ventGraphics.lineStyle(2, 0x00aaff, 0.7);
      this._ventGraphics.strokeRect(vx - 10, vy - 10, 20, 20);
      // Grid lines inside vent
      this._ventGraphics.lineStyle(1, 0x00aaff, 0.4);
      for (let dx = -6; dx <= 6; dx += 6) {
        this._ventGraphics.beginPath();
        this._ventGraphics.moveTo(vx + dx, vy - 8);
        this._ventGraphics.lineTo(vx + dx, vy + 8);
        this._ventGraphics.strokePath();
      }
      // Store vent position for interaction
      v._px = vx; v._py = vy;
    });
  }

  _drawSabotagePoints() {
    const rooms = {};
    this._mapData.rooms.forEach(r => { rooms[r.id] = r; });
    const gfx = this.add.graphics().setDepth(3);

    this._mapData.sabotagePoints.forEach(s => {
      const room = rooms[s.room];
      if (!room) return;
      const sx = room.x + room.w - 20;
      const sy = room.y + 20;
      gfx.fillStyle(0xff3355, 0.3);
      gfx.fillTriangle(sx, sy - 12, sx - 10, sy + 8, sx + 10, sy + 8);
      gfx.lineStyle(1, 0xff3355, 0.8);
      gfx.strokeTriangle(sx, sy - 12, sx - 10, sy + 8, sx + 10, sy + 8);
      this.add.text(sx, sy + 14, s.name, {
        fontSize: '8px', fontFamily: 'Courier New', color: '#ff3355',
      }).setOrigin(0.5, 0).setDepth(4);
      s._px = sx; s._py = sy;
    });
  }

  _drawTaskStations(assignedTaskIds) {
    const taskDefs = this._mapData.tasks;
    const rooms = {};
    this._mapData.rooms.forEach(r => { rooms[r.id] = r; });

    taskDefs.forEach(t => {
      const room = rooms[t.room];
      if (!room) return;
      const td = {
        id: t.id,
        name: t.name,
        type: t.type,
        x: room.x + room.w / 2,
        y: room.y + room.h * 0.7,
      };
      const isAssigned = this._me.role === 'antivirus' && assignedTaskIds.includes(t.id);
      const station = new TaskStation(this, td, isAssigned);
      station.gfx.setDepth(4);
      station.label.setDepth(5);
      this._tasks.set(t.id, station);
    });
  }

  // Fog of war removed — full map visible to all players.

  // ── Spawning ──────────────────────────────────────────────────────────────

  _spawnPlayer(pData) {
    if (this._players.has(pData.id)) return;
    const isLocal = pData.id === this._me.id;
    const sprite = new PlayerSprite(this, pData.id, pData.name, pData.color, isLocal);
    sprite.setPosition(pData.x ?? this._mapData.spawnPoint.x, pData.y ?? this._mapData.spawnPoint.y, true);
    sprite.setDepth(10);
    if (!pData.alive) sprite.kill();
    this._players.set(pData.id, sprite);
  }

  _spawnBody(bodyData) {
    if (this._bodies.has(bodyData.bodyId)) return;
    const gfx = this.add.graphics().setDepth(8);
    const { bodyX, bodyY } = bodyData;
    const player = this._players.get(bodyData.playerId);
    const color = player ? parseInt(player.color.replace('#', ''), 16) : 0xff0000;

    gfx.lineStyle(4, color, 0.8);
    gfx.beginPath();
    gfx.moveTo(bodyX - 12, bodyY - 12); gfx.lineTo(bodyX + 12, bodyY + 12);
    gfx.moveTo(bodyX + 12, bodyY - 12); gfx.lineTo(bodyX - 12, bodyY + 12);
    gfx.strokePath();
    // Body outline circle
    gfx.lineStyle(1, color, 0.4);
    gfx.strokeCircle(bodyX, bodyY, 20);

    const label = this.add.text(bodyX, bodyY - 24, '⚠ BODY', {
      fontSize: '9px', fontFamily: 'Courier New', color: '#ff3355',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(9);

    this.tweens.add({
      targets: label, y: bodyY - 28, yoyo: true, repeat: -1, duration: 600,
    });

    this._bodies.set(bodyData.bodyId, { gfx, label, data: bodyData });
  }

  _clearBodies() {
    this._bodies.forEach(({ gfx, label }) => { gfx.destroy(); label.destroy(); });
    this._bodies.clear();
  }

  // ── Interaction checks ────────────────────────────────────────────────────

  _checkProximity() {
    const sprite = this._players.get(this._me.id);
    if (!sprite || !this._me.alive) return;

    const px = sprite.x, py = sprite.y;
    const INTER_R = 80;
    let hints = [];

    this._nearbyTaskId = null;
    this._nearbyKillTarget = null;
    this._nearbyBodyId = null;
    this._nearbyVentId = null;

    // Task stations (antivirus only)
    if (this._me.role === 'antivirus') {
      let foundTask = false;
      this._tasks.forEach((station, taskId) => {
        if (station.isAssigned && !station.completed && station.isNearby(px, py, INTER_R)) {
          this._nearbyTaskId = taskId;
          foundTask = true;
          const task = this._mapData.tasks.find(t => t.id === taskId);
          this._showTaskPrompt(task ? task.name : 'Task');
          hints.push('[E] Do Task');
        }
      });
      if (!foundTask) this._hideTaskPrompt();
    }

    // Kill target (virus only)
    if (this._me.role === 'virus') {
      let closestDist = INTER_R;
      this._players.forEach((otherSprite, id) => {
        if (id === this._me.id) return;
        const other = this._serverPlayers?.[id];
        if (!other || !other.alive) return;
        const d = Math.sqrt((px - otherSprite.x) ** 2 + (py - otherSprite.y) ** 2);
        if (d < closestDist) {
          closestDist = d;
          this._nearbyKillTarget = id;
        }
      });
      if (this._nearbyKillTarget) hints.push('[Q] Kill');

      // Vents
      this._mapData.vents.forEach(v => {
        if (v._px === undefined) return;
        const d = Math.sqrt((px - v._px) ** 2 + (py - v._py) ** 2);
        if (d < 50) {
          this._nearbyVentId = v.id;
          hints.push('[F] Use Vent');
        }
      });
    }

    // Bodies
    this._bodies.forEach((bodyObj, bodyId) => {
      const { bodyX, bodyY } = bodyObj.data;
      const d = Math.sqrt((px - bodyX) ** 2 + (py - bodyY) ** 2);
      if (d < INTER_R) {
        this._nearbyBodyId = bodyId;
        hints.push('[R] Report Body');
      }
    });

    HUD.setActionHint(hints.slice(0, 2).join('  '));
  }

  _tryOpenTask() {
    if (!this._nearbyTaskId || this._me.role !== 'antivirus') return;
    const task = this._mapData.tasks.find(t => t.id === this._nearbyTaskId);
    if (!task) return;
    // Find room for coordinates
    const room = this._mapData.rooms.find(r => r.id === task.room);
    const td = {
      id: task.id,
      name: task.name,
      type: task.type,
      x: room ? room.x + room.w / 2 : 0,
      y: room ? room.y + room.h * 0.7 : 0,
    };
    this.scene.launch('MiniGameScene', { taskDef: td, callerScene: 'GameScene' });
    this.scene.pause();
  }

  _tryKill() {
    if (this._me.role !== 'virus' || !this._nearbyKillTarget) return;
    SocketManager.killPlayer(this._nearbyKillTarget);
  }

  _tryReport() {
    if (!this._nearbyBodyId) return;
    SocketManager.reportBody(this._nearbyBodyId);
  }

  _tryVent() {
    if (this._me.role !== 'virus' || !this._nearbyVentId) return;
    const vent = this._mapData.vents.find(v => v.id === this._nearbyVentId);
    if (!vent || !vent.connections.length) return;

    // If vent menu is already open, close it (toggle)
    const menu = document.getElementById('vent-menu');
    if (!menu.classList.contains('hidden')) {
      this._hideVentMenu();
      return;
    }

    this._showVentMenu(vent);
  }

  _showVentMenu(vent) {
    const menu = document.getElementById('vent-menu');
    const optContainer = document.getElementById('vent-menu-options');
    optContainer.innerHTML = '';

    vent.connections.forEach(targetId => {
      const targetVent = this._mapData.vents.find(v => v.id === targetId);
      const room = targetVent ? this._mapData.rooms.find(r => r.id === targetVent.room) : null;
      const label = room ? room.name : targetId;

      const btn = document.createElement('button');
      btn.className = 'vent-option-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._hideVentMenu();
        SocketManager.useVent(vent.id, targetId);
      });
      optContainer.appendChild(btn);
    });

    menu.classList.remove('hidden');
  }

  _hideVentMenu() {
    document.getElementById('vent-menu').classList.add('hidden');
  }

  _showTaskPrompt(taskName) {
    document.getElementById('task-prompt-name').textContent = taskName;
    document.getElementById('task-prompt').classList.remove('hidden');
  }

  _hideTaskPrompt() {
    document.getElementById('task-prompt').classList.add('hidden');
  }

  // ── Socket Listeners ──────────────────────────────────────────────────────

  _setupSocketListeners() {
    const socket = SocketManager.get();
    this._serverPlayers = {};

    socket.on('players-update', ({ players }) => {
      players.forEach(p => {
        this._serverPlayers[p.id] = p;
        if (p.id === this._me.id) return; // local player moved by input
        const sprite = this._players.get(p.id);
        if (sprite) {
          sprite.setPosition(p.x, p.y);
          if (!p.alive && sprite._alive) sprite.kill();
        }
      });
    });

    socket.on('player-joined', ({ player }) => {
      this._spawnPlayer(player);
    });

    socket.on('player-left', ({ playerId }) => {
      const sprite = this._players.get(playerId);
      if (sprite) { sprite.destroy(); this._players.delete(playerId); }
    });

    socket.on('player-killed', (data) => {
      const sprite = this._players.get(data.playerId);
      if (sprite) sprite.kill();
      if (data.playerId === this._me.id) {
        this._me.alive = false;
        HUD.setDead();
      }
      this._spawnBody(data);
    });

    socket.on('player-vented', (data) => {
      if (data.playerId === this._me.id) {
        const sprite = this._players.get(this._me.id);
        if (sprite) sprite.setPosition(data.x, data.y, true);
      }
    });

    socket.on('meeting-start', (data) => {
      this._hideVentMenu();
      this._hideTaskPrompt();
      this._clearBodies();
      this.scene.pause();
      this.scene.launch('VotingScene', { meetingData: data, myId: this._me.id, myRole: this._me.role, myAlive: this._me.alive });
    });

    socket.on('meeting-ended', () => {
      // Resume will be triggered from VotingScene
    });

    socket.on('player-ejected', ({ playerId }) => {
      const sprite = this._players.get(playerId);
      if (sprite) sprite.kill();
      if (playerId === this._me.id) {
        this._me.alive = false;
        HUD.setDead();
      }
    });

    socket.on('task-progress', ({ percentage, completedTasks, totalTasks }) => {
      HUD.updateTaskProgress(percentage);
    });

    socket.on('task-complete', ({ taskId }) => {
      const station = this._tasks.get(taskId);
      if (station) station.markComplete();
      if (this._me.tasksCompleted) {
        if (!this._me.tasksCompleted.includes(taskId)) this._me.tasksCompleted.push(taskId);
      }
    });

    socket.on('sabotage-event', ({ type, duration }) => {
      this._activateSabotage(type, duration);
    });

    socket.on('sabotage-resolved', () => {
      this._deactivateSabotage();
    });

    socket.on('game-over', (data) => {
      clearInterval(this._moveInterval);
      this._hideVentMenu();
      this._hideTaskPrompt();
      this._showGameOver(data);
    });

    // When MiniGameScene completes a task
    this.events.on('taskCompleted', (taskId) => {
      SocketManager.taskComplete(taskId);
      const station = this._tasks.get(taskId);
      if (station) station.markComplete();
    });
  }

  // ── Sabotage Effects ──────────────────────────────────────────────────────

  _activateSabotage(type, duration) {
    HUD.showSabotageAlert(`⚠ SABOTAGE: ${type.toUpperCase()} — ${duration}s`);
  }

  _deactivateSabotage() {
    HUD.hideSabotageAlert();
  }

  // ── Minimap ───────────────────────────────────────────────────────────────

  _drawMinimap() {
    const mm = document.getElementById('minimap');
    const canvas = document.createElement('canvas');
    canvas.width = 150; canvas.height = 100;
    canvas.className = 'minimap-canvas';
    mm.appendChild(canvas);
    this._minimapCanvas = canvas;
    this._minimapCtx = canvas.getContext('2d');
    this._updateMinimap();
  }

  _updateMinimap() {
    const ctx = this._minimapCtx;
    if (!ctx) return;
    const { width, height } = this._mapData;
    const scaleX = 150 / width;
    const scaleY = 100 / height;

    ctx.fillStyle = '#07071a';
    ctx.fillRect(0, 0, 150, 100);

    // Rooms
    this._mapData.rooms.forEach(r => {
      ctx.fillStyle = '#0d2244';
      ctx.fillRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);
    });

    // Players
    this._players.forEach((sprite, id) => {
      const isMe = id === this._me.id;
      ctx.beginPath();
      ctx.arc(sprite.x * scaleX, sprite.y * scaleY, isMe ? 3 : 2, 0, Math.PI * 2);
      const pData = this._serverPlayers?.[id];
      if (pData && !pData.alive) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
      } else if (isMe) {
        ctx.fillStyle = '#ffffff';
      } else {
        // Show virus players (to other viruses) in red, otherwise player color
        const sprite2 = this._players.get(id);
        ctx.fillStyle = sprite2?.color || '#aaaaaa';
      }
      ctx.fill();
    });
  }

  // ── Game Over ─────────────────────────────────────────────────────────────

  _showGameOver(data) {
    HUD.hide();
    document.getElementById('waiting-overlay').classList.add('hidden');

    const title = document.getElementById('gameover-title');
    const won = (data.winner === 'antivirus' && this._me.role === 'antivirus') ||
                (data.winner === 'virus'     && this._me.role === 'virus');

    title.textContent = won ? 'VICTORY' : 'DEFEAT';
    title.className = won ? 'win' : 'lose';

    const reasons = {
      viruses_outnumber: 'Viruses have overrun the system.',
      all_viruses_eliminated: 'All malware has been purged.',
      tasks_complete: 'System integrity restored.',
    };
    document.getElementById('gameover-reason').textContent = reasons[data.reason] || data.reason;

    const rolesEl = document.getElementById('gameover-roles');
    rolesEl.innerHTML = '';
    Object.entries(data.playerRoles).forEach(([pid, info]) => {
      const chip = document.createElement('div');
      chip.className = 'go-player-chip';
      chip.innerHTML = `
        <div class="go-player-dot" style="background:${this._players.get(pid)?.color || '#fff'}"></div>
        <span>${escapeHtml(info.name)}</span>
        <span class="go-role-badge ${info.role}">${info.role === 'virus' ? 'VIRUS' : 'AV'}</span>
      `;
      rolesEl.appendChild(chip);
    });

    document.getElementById('gameover-overlay').classList.remove('hidden');

    document.getElementById('btn-play-again').onclick = () => {
      location.reload();
    };
  }

  // ── Update loop ───────────────────────────────────────────────────────────

  update(time, delta) {
    this._handleMovement(delta);
    this._players.forEach(s => s.update());
    this._checkProximity();
    if (time - this._moveTimer > 200) {
      this._updateMinimap();
      this._moveTimer = time;
    }
  }

  _handleMovement(delta) {
    if (!this._me.alive) return;
    const sprite = this._players.get(this._me.id);
    if (!sprite) return;

    const SPEED = 3;
    let dx = 0, dy = 0;

    if (this._keys.left.isDown  || this._keys.a.isDown)  dx -= SPEED;
    if (this._keys.right.isDown || this._keys.d.isDown)  dx += SPEED;
    if (this._keys.up.isDown    || this._keys.w.isDown)  dy -= SPEED;
    if (this._keys.down.isDown  || this._keys.s_key.isDown) dy += SPEED;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707; dy *= 0.707;
    }

    if (dx !== 0 || dy !== 0) {
      const nx = Math.max(0, Math.min(this._mapData.width,  sprite.x + dx));
      const ny = Math.max(0, Math.min(this._mapData.height, sprite.y + dy));
      sprite.setPosition(nx, ny, true);
    }
  }

  shutdown() {
    clearInterval(this._moveInterval);
    this._hideVentMenu();
    this._hideTaskPrompt();
    const socket = SocketManager.get();
    if (socket) {
      socket.off('players-update');
      socket.off('player-joined');
      socket.off('player-left');
      socket.off('player-killed');
      socket.off('player-vented');
      socket.off('meeting-start');
      socket.off('meeting-ended');
      socket.off('player-ejected');
      socket.off('task-progress');
      socket.off('task-complete');
      socket.off('sabotage-event');
      socket.off('sabotage-resolved');
      socket.off('game-over');
    }
  }
}
