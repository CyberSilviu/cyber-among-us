/**
 * LobbyScene — Phaser scene that handles pre-game UI.
 * The actual UI is HTML overlays; this scene just initialises socket listeners
 * and bridges them to the DOM.
 */
class LobbyScene extends Phaser.Scene {
  constructor() { super({ key: 'LobbyScene' }); }

  create() {
    this._setupColorPicker();
    this._setupSocketListeners();
    this._setupDOMListeners();
    this._showLobby();
  }

  // ── Color picker ──────────────────────────────────────────────────────────

  _setupColorPicker() {
    const COLORS = [
      '#e74c3c', // Red
      '#3498db', // Blue
      '#2ecc71', // Green
      '#f1c40f', // Yellow
      '#9b59b6', // Purple
      '#e67e22', // Orange
      '#00d4ff', // Cyan
      '#ff69b4', // Pink
      '#ecf0f1', // White
      '#a8ff00', // Lime
    ];

    const picker = document.getElementById('color-picker');
    this._selectedColor = COLORS[0];

    COLORS.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (color === COLORS[0] ? ' active' : '');
      swatch.style.background = color;
      swatch.style.color = color;
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this._selectedColor = color;
      });
      picker.appendChild(swatch);
    });
  }

  // ── DOM event listeners ───────────────────────────────────────────────────

  _setupDOMListeners() {
    document.getElementById('btn-create').addEventListener('click', () => {
      const name = this._getPlayerName();
      if (!name) return;
      SocketManager.createRoom(name, this._selectedColor);
    });

    document.getElementById('btn-join-show').addEventListener('click', () => {
      document.getElementById('join-form').classList.remove('hidden');
      document.getElementById('lobby-buttons').classList.add('hidden');
      document.getElementById('room-code-input').focus();
    });

    document.getElementById('btn-join-cancel').addEventListener('click', () => {
      document.getElementById('join-form').classList.add('hidden');
      document.getElementById('lobby-buttons').classList.remove('hidden');
    });

    document.getElementById('btn-join-confirm').addEventListener('click', () => {
      const name = this._getPlayerName();
      if (!name) return;
      const code = document.getElementById('room-code-input').value.trim().toUpperCase();
      if (code.length !== 6) { alert('Enter a valid 6-character room code.'); return; }
      SocketManager.joinRoom(code, name, this._selectedColor);
    });

    document.getElementById('room-code-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-join-confirm').click();
    });

    document.getElementById('btn-copy-code').addEventListener('click', () => {
      const code = document.getElementById('display-room-code').textContent;
      navigator.clipboard.writeText(code).then(() => {
        document.getElementById('btn-copy-code').textContent = 'Copied!';
        setTimeout(() => { document.getElementById('btn-copy-code').textContent = 'Copy'; }, 1500);
      });
    });

    document.getElementById('btn-start').addEventListener('click', () => {
      SocketManager.startGame();
    });

    // Settings sliders
    ['viruses', 'tasks', 'cooldown'].forEach(key => {
      const el = document.getElementById(`set-${key}`);
      if (!el) return;
      el.addEventListener('input', () => {
        document.getElementById(`val-${key}`).textContent = el.value;
        const settings = {};
        settings.numViruses  = parseInt(document.getElementById('set-viruses').value);
        settings.taskCount   = parseInt(document.getElementById('set-tasks').value);
        settings.killCooldown= parseInt(document.getElementById('set-cooldown').value);
        SocketManager.updateSettings(settings);
      });
    });
  }

  // ── Socket listeners ──────────────────────────────────────────────────────

  _setupSocketListeners() {
    const socket = SocketManager.get();

    socket.on('room-created', ({ roomCode }) => {
      this._myRoomCode = roomCode;
      this._isHost = true;
      this._playerName = this._getPlayerName();
      this._showWaiting(roomCode, true);
    });

    socket.on('room-joined', ({ roomCode }) => {
      this._myRoomCode = roomCode;
      this._isHost = false;
      this._playerName = this._getPlayerName();
      this._showWaiting(roomCode, false);
    });

    socket.on('room-state', ({ players }) => {
      // Add existing players to waiting room
      players.forEach(p => this._addWaitingPlayer(p));
    });

    socket.on('player-joined', ({ player }) => {
      this._addWaitingPlayer(player);
    });

    socket.on('player-left', ({ playerId }) => {
      const card = document.getElementById(`wcard-${playerId}`);
      if (card) card.remove();
    });

    socket.on('host-changed', ({ newHostId }) => {
      // Re-render host badge
      document.querySelectorAll('.waiting-player-host').forEach(el => {
        el.textContent = el.closest('[data-pid]')?.dataset.pid === newHostId ? 'HOST' : '';
      });
    });

    socket.on('settings-updated', (settings) => {
      document.getElementById('set-viruses').value = settings.numViruses;
      document.getElementById('val-viruses').textContent = settings.numViruses;
      document.getElementById('set-tasks').value = settings.taskCount;
      document.getElementById('val-tasks').textContent = settings.taskCount;
      document.getElementById('set-cooldown').value = settings.killCooldown;
      document.getElementById('val-cooldown').textContent = settings.killCooldown;
    });

    socket.on('join-error', ({ message }) => {
      alert(`Cannot join: ${message}`);
    });

    socket.on('game-started', (data) => {
      // Transition to GameScene, passing all game data
      this._hideAllOverlays();
      this.scene.start('GameScene', { gameData: data });
    });
  }

  // ── Waiting room helpers ──────────────────────────────────────────────────

  _showWaiting(roomCode, isHost) {
    document.getElementById('lobby-overlay').classList.add('hidden');
    document.getElementById('waiting-overlay').classList.remove('hidden');
    document.getElementById('display-room-code').textContent = roomCode;

    // Show my own card
    const myData = {
      id: SocketManager.get().id,
      name: this._playerName,
      color: this._selectedColor,
      isHost,
    };
    this._addWaitingPlayer(myData);

    if (isHost) {
      document.getElementById('host-controls').classList.remove('hidden');
      document.getElementById('waiting-msg').classList.add('hidden');
    }
  }

  _addWaitingPlayer(player) {
    // Avoid duplicates
    if (document.getElementById(`wcard-${player.id}`)) return;

    const card = document.createElement('div');
    card.className = 'waiting-player-card';
    card.id = `wcard-${player.id}`;
    card.dataset.pid = player.id;
    card.innerHTML = `
      <div class="waiting-player-circle" style="background:${player.color}"></div>
      <div class="waiting-player-name">${escapeHtml(player.name)}</div>
      <div class="waiting-player-host">${player.isHost ? 'HOST' : ''}</div>
    `;
    document.getElementById('waiting-players').appendChild(card);
  }

  _showLobby() {
    document.getElementById('lobby-overlay').classList.remove('hidden');
    document.getElementById('lobby-overlay').classList.add('active');
  }

  _hideAllOverlays() {
    document.querySelectorAll('.overlay').forEach(el => {
      el.classList.add('hidden');
      el.classList.remove('active');
    });
  }

  _getPlayerName() {
    const val = document.getElementById('player-name').value.trim();
    if (!val) { alert('Please enter a player name.'); return null; }
    return val;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
