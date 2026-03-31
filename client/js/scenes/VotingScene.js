/**
 * VotingScene — full-screen overlay for emergency meetings and voting.
 * Runs while GameScene is paused.
 */
class VotingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VotingScene' });
  }

  init(data) {
    this._meetingData = data.meetingData;
    this._myId = data.myId;
    this._myRole = data.myRole;
    this._myAlive = data.myAlive;
  }

  create() {
    ChatPanel.init();
    ChatPanel.clear();
    ChatPanel.setEnabled(this._myAlive);

    this._phase = 'discussion';
    this._hasVoted = false;
    this._alivePlayers = this._meetingData.alivePlayers || [];
    this._voteCounts = {};
    this._ejectedId = null;

    this._showVotingOverlay();
    this._startDiscussionTimer(this._meetingData.discussionTime || 30);

    this._setupSocketListeners();
  }

  // ── Overlay construction ──────────────────────────────────────────────────

  _showVotingOverlay() {
    document.getElementById('voting-overlay').classList.remove('hidden');
    document.getElementById('vote-result-banner').classList.add('hidden');

    const { reporterId, reason } = this._meetingData;
    const reporter = this._alivePlayers.find(p => p.id === reporterId);
    document.getElementById('voting-title').textContent =
      reason === 'body' ? `${reporter?.name || 'Someone'} FOUND A BODY` : 'EMERGENCY MEETING';

    this._renderPlayers();
  }

  _renderPlayers() {
    const container = document.getElementById('voting-players');
    container.innerHTML = '';

    this._alivePlayers.forEach(player => {
      const card = document.createElement('div');
      card.className = 'voter-card' + (player.alive === false ? ' dead' : '');
      card.id = `vcard-${player.id}`;

      const isMe = player.id === this._myId;
      const canVote = this._myAlive && !this._hasVoted && this._phase === 'voting';

      card.innerHTML = `
        <div class="pv-circle" style="background:${player.color}"></div>
        <div class="pv-name">${escapeHtml(player.name)}${isMe ? ' (you)' : ''}</div>
        <div class="pv-votes" id="pvotes-${player.id}"></div>
        ${!isMe && canVote ? `<button class="vote-btn" data-target="${player.id}">VOTE</button>` : ''}
      `;
      container.appendChild(card);
    });

    // Skip button
    const skip = document.createElement('div');
    skip.style.gridColumn = '1 / -1';
    skip.innerHTML = this._myAlive && !this._hasVoted && this._phase === 'voting'
      ? `<button id="btn-skip-vote" style="margin-top:8px;padding:8px 24px;background:transparent;border:1px solid #5566aa;color:#5566aa;border-radius:4px;cursor:pointer;font-family:var(--font);font-size:0.8rem;letter-spacing:2px;width:100%">SKIP VOTE</button>`
      : '';
    container.appendChild(skip);

    // Attach vote handlers
    if (this._myAlive && !this._hasVoted && this._phase === 'voting') {
      container.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', () => this._castVote(btn.dataset.target));
      });
      const skipBtn = document.getElementById('btn-skip-vote');
      if (skipBtn) skipBtn.addEventListener('click', () => this._castVote(null));
    }
  }

  _castVote(targetId) {
    if (this._hasVoted) return;
    this._hasVoted = true;
    SocketManager.castVote(targetId);

    // Grey out all vote buttons
    document.querySelectorAll('.vote-btn').forEach(b => b.classList.add('voted'));
    const skipBtn = document.getElementById('btn-skip-vote');
    if (skipBtn) skipBtn.disabled = true;
  }

  // ── Timers ────────────────────────────────────────────────────────────────

  _startDiscussionTimer(seconds) {
    document.getElementById('voting-phase-label').textContent = 'DISCUSSION';
    document.getElementById('voting-timer').textContent = seconds;
    let remaining = seconds;

    this._timerInterval = setInterval(() => {
      remaining--;
      document.getElementById('voting-timer').textContent = remaining;
      if (remaining <= 0) {
        clearInterval(this._timerInterval);
        // Server will send 'voting-phase-start'
      }
    }, 1000);
  }

  _startVotingTimer(seconds) {
    document.getElementById('voting-phase-label').textContent = 'VOTING';
    document.getElementById('voting-timer').textContent = seconds;
    let remaining = seconds;
    this._phase = 'voting';
    this._renderPlayers(); // re-render with vote buttons

    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      remaining--;
      document.getElementById('voting-timer').textContent = remaining;
      if (remaining <= 0) clearInterval(this._timerInterval);
    }, 1000);
  }

  // ── Socket listeners ──────────────────────────────────────────────────────

  _setupSocketListeners() {
    const socket = SocketManager.get();

    socket.on('voting-phase-start', ({ votingTime }) => {
      this._startVotingTimer(votingTime || 60);
    });

    socket.on('vote-cast', ({ voterId, votesIn, totalVoters }) => {
      const card = document.getElementById(`vcard-${voterId}`);
      if (card) {
        const voteEl = card.querySelector('.pv-votes');
        if (voteEl) voteEl.textContent = '✓ voted';
      }
      ChatPanel.addSystem(`${votesIn}/${totalVoters} players voted`);
    });

    socket.on('vote-result', ({ votes, ejectedId, tally }) => {
      clearInterval(this._timerInterval);
      this._ejectedId = ejectedId;

      // Show who voted for whom
      Object.entries(votes).forEach(([voterId, targetId]) => {
        const voteEl = document.getElementById(`pvotes-${voterId}`);
        if (!voteEl) return;
        if (targetId === null) {
          voteEl.textContent = '→ Skip';
        } else {
          const target = this._alivePlayers.find(p => p.id === targetId);
          voteEl.textContent = `→ ${target?.name || '?'}`;
        }
      });

      // Show result banner
      const banner = document.getElementById('vote-result-banner');
      banner.classList.remove('hidden');

      if (ejectedId) {
        const ejected = this._alivePlayers.find(p => p.id === ejectedId);
        banner.textContent = ejected
          ? `${ejected.name} has been ejected from the system.`
          : 'A player has been ejected.';
      } else {
        banner.textContent = 'No one was ejected. (Tie or skip majority)';
      }
    });

    socket.on('player-ejected', ({ playerId, playerName, playerRole }) => {
      const card = document.getElementById(`vcard-${playerId}`);
      if (card) card.classList.add('voted-out');

      const roleLabel = playerRole === 'virus' ? '— was VIRUS 🔴' : '— was ANTIVIRUS 🟢';
      ChatPanel.addSystem(`${playerName} was ejected ${roleLabel}`);
    });

    socket.on('meeting-ended', () => {
      setTimeout(() => this._closeVoting(), 1500);
    });

    socket.on('game-over', () => {
      this._closeVoting();
    });

    socket.on('chat-message', ({ senderId, senderName, senderColor, text }) => {
      ChatPanel.addMessage(senderId, senderName, senderColor, text);
    });
  }

  _closeVoting() {
    clearInterval(this._timerInterval);
    document.getElementById('voting-overlay').classList.add('hidden');

    const socket = SocketManager.get();
    socket.off('voting-phase-start');
    socket.off('vote-cast');
    socket.off('vote-result');
    socket.off('player-ejected');
    socket.off('meeting-ended');
    socket.off('chat-message');

    this.scene.stop();
    this.scene.resume('GameScene');
  }

  shutdown() {
    clearInterval(this._timerInterval);
  }
}
