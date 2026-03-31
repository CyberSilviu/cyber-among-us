'use strict';

const Player = require('./Player');
const TaskManager = require('./TaskManager');
const VoteManager = require('./VoteManager');
const mapData = require('../maps/mainMap.json');

const KILL_RADIUS = 80;       // pixels, server-side kill distance
const INTERACTION_RADIUS = 90; // pixels, task/body interaction distance
const PLAYER_SPEED_MAX = 8;    // max pixels per tick movement (anti-cheat)
const POSITION_UPDATE_RATE = 50; // ms between broadcast ticks

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

class GameRoom {
  constructor(io, hostSocket, hostName, hostColor) {
    this.io = io;
    this.roomCode = generateRoomCode();
    this.players = new Map(); // socketId -> Player
    this.deadBodies = [];     // { id, playerId, x, y }
    this.gameState = 'lobby'; // 'lobby'|'playing'|'meeting'|'ended'
    this.settings = {
      maxPlayers: 10,
      numViruses: 2,
      taskCount: 5,
      killCooldown: 30,
      meetingCooldown: 20,
      votingTime: 60,
      discussionTime: 30,
    };
    this.taskManager = new TaskManager(this.settings.taskCount);
    this.voteManager = new VoteManager(io, this.roomCode);
    this.meetingCooldownEnd = 0;
    this.sabotageActive = null;
    this.sabotageTimeout = null;
    this._broadcastInterval = null;

    // Add host
    const host = this.addPlayer(hostSocket, hostName, hostColor);
    host.isHost = true;
  }

  addPlayer(socket, name, color) {
    const player = new Player(socket.id, name, color);
    this.players.set(socket.id, player);
    socket.join(this.roomCode);

    // Notify others
    socket.to(this.roomCode).emit('player-joined', { player: player.getPublicData() });

    // Send existing room state to new player
    const existingPlayers = [];
    this.players.forEach(p => {
      if (p.id !== socket.id) existingPlayers.push(p.getPublicData());
    });
    socket.emit('room-state', {
      roomCode: this.roomCode,
      players: existingPlayers,
      gameState: this.gameState,
      settings: this.settings,
    });
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;

    this.players.delete(socketId);
    this.io.to(this.roomCode).emit('player-left', { playerId: socketId });

    if (this.gameState === 'playing' || this.gameState === 'meeting') {
      this.checkWinConditions();
    }

    // Reassign host if needed
    if (player.isHost && this.players.size > 0) {
      const next = this.players.values().next().value;
      next.isHost = true;
      this.io.to(this.roomCode).emit('host-changed', { newHostId: next.id });
    }
  }

  getAlivePlayers() {
    return [...this.players.values()].filter(p => p.alive);
  }

  getAliveViruseCount() {
    return this.getAlivePlayers().filter(p => p.role === 'virus').length;
  }

  getAliveAntivirusCount() {
    return this.getAlivePlayers().filter(p => p.role === 'antivirus').length;
  }

  startGame(requesterId) {
    if (this.gameState !== 'lobby') return { error: 'Game already started' };
    const requester = this.players.get(requesterId);
    if (!requester || !requester.isHost) return { error: 'Only host can start' };
    if (this.players.size < 2) return { error: 'Need at least 2 players' };

    this.gameState = 'playing';
    this.deadBodies = [];
    this.sabotageActive = null;

    const playerList = [...this.players.values()];

    // Assign roles randomly
    const shuffled = [...playerList].sort(() => Math.random() - 0.5);
    const numViruses = Math.min(this.settings.numViruses, Math.floor(playerList.length / 2));

    shuffled.forEach((player, idx) => {
      player.assignRole(idx < numViruses ? 'virus' : 'antivirus');
      player.alive = true;
      player.x = mapData.spawnPoint.x + (Math.random() - 0.5) * 120;
      player.y = mapData.spawnPoint.y + (Math.random() - 0.5) * 120;
      player.killCooldownEnd = Date.now() + this.settings.killCooldown * 1000;
    });

    // Assign tasks
    this.taskManager = new TaskManager(this.settings.taskCount);
    this.taskManager.assignTasks(playerList);

    // Send each player their private role + tasks
    playerList.forEach(player => {
      const socket = this.io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('game-started', {
          ...player.getPrivateData(),
          mapData,
          allPlayers: playerList.map(p => p.getPublicData()),
        });
      }
    });

    this.startBroadcastLoop();
    return { ok: true };
  }

  startBroadcastLoop() {
    if (this._broadcastInterval) clearInterval(this._broadcastInterval);
    this._broadcastInterval = setInterval(() => {
      if (this.gameState !== 'playing') return;
      const playerData = [];
      this.players.forEach(p => playerData.push(p.getPublicData()));
      this.io.to(this.roomCode).emit('players-update', { players: playerData });
    }, POSITION_UPDATE_RATE);
  }

  stopBroadcastLoop() {
    if (this._broadcastInterval) {
      clearInterval(this._broadcastInterval);
      this._broadcastInterval = null;
    }
  }

  handleMovement(socketId, x, y) {
    if (this.gameState !== 'playing') return;
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;

    // Clamp to map bounds
    const clampedX = Math.max(0, Math.min(mapData.width, x));
    const clampedY = Math.max(0, Math.min(mapData.height, y));

    player.x = clampedX;
    player.y = clampedY;
  }

  handleKill(killerSocketId, targetSocketId) {
    if (this.gameState !== 'playing') return { error: 'Not in game' };

    const killer = this.players.get(killerSocketId);
    const target = this.players.get(targetSocketId);

    if (!killer) return { error: 'Killer not found' };
    if (!target) return { error: 'Target not found' };
    if (killer.role !== 'virus') return { error: 'You are not a virus' };
    if (!killer.alive) return { error: 'You are dead' };
    if (!target.alive) return { error: 'Target already dead' };
    if (!killer.canKill()) return { error: 'Kill on cooldown' };

    const distance = dist(killer, target);
    if (distance > KILL_RADIUS) return { error: 'Too far away' };

    target.kill();
    killer.startKillCooldown(this.settings.killCooldown);

    const body = { id: `body_${Date.now()}`, playerId: target.id, x: target.x, y: target.y };
    this.deadBodies.push(body);

    this.io.to(this.roomCode).emit('player-killed', {
      playerId: target.id,
      killerId: killer.id,
      bodyX: target.x,
      bodyY: target.y,
      bodyId: body.id,
    });

    this.checkWinConditions();
    return { ok: true };
  }

  handleReportBody(reporterSocketId, bodyId) {
    if (this.gameState !== 'playing') return { error: 'Not in game' };
    const reporter = this.players.get(reporterSocketId);
    if (!reporter || !reporter.alive) return { error: 'Reporter invalid' };

    const body = this.deadBodies.find(b => b.id === bodyId);
    if (!body) return { error: 'Body not found' };

    const distance = dist(reporter, body);
    if (distance > INTERACTION_RADIUS) return { error: 'Too far from body' };

    this.startMeeting(reporterSocketId, 'body');
    return { ok: true };
  }

  handleCallMeeting(socketId) {
    if (this.gameState !== 'playing') return { error: 'Not in game' };
    const player = this.players.get(socketId);
    if (!player || !player.alive) return { error: 'Player invalid' };

    const now = Date.now();
    if (now < this.meetingCooldownEnd) return { error: 'Meeting on cooldown' };

    this.startMeeting(socketId, 'meeting');
    return { ok: true };
  }

  startMeeting(reporterId, reason) {
    this.gameState = 'meeting';
    this.meetingCooldownEnd = Date.now() + this.settings.meetingCooldown * 1000;

    // Reset all votes
    this.players.forEach(p => p.resetVote());

    const alivePlayers = this.getAlivePlayers();
    this.voteManager.startMeeting(alivePlayers, reporterId, reason, (ejectedId) => {
      this.onMeetingEnd(ejectedId);
    });
  }

  onMeetingEnd(ejectedId) {
    if (ejectedId) {
      const ejected = this.players.get(ejectedId);
      if (ejected) {
        ejected.kill();
        this.io.to(this.roomCode).emit('player-ejected', {
          playerId: ejectedId,
          playerName: ejected.name,
          playerRole: ejected.role,
        });
      }
    }

    this.deadBodies = []; // clear bodies after meeting

    // Check win before resuming
    const won = this.checkWinConditions();
    if (!won) {
      this.gameState = 'playing';
      this.io.to(this.roomCode).emit('meeting-ended', {});
    }
  }

  handleTaskComplete(socketId, taskId) {
    if (this.gameState !== 'playing') return { error: 'Not in game' };
    const player = this.players.get(socketId);
    if (!player || !player.alive || player.role !== 'antivirus') return { error: 'Invalid' };

    const completed = this.taskManager.completeTask(player, taskId);
    if (!completed) return { error: 'Task not valid' };

    const progress = this.taskManager.getProgress([...this.players.values()]);
    this.io.to(this.roomCode).emit('task-progress', progress);
    this.io.to(this.roomCode).emit('task-complete', { taskId }); // mark station on all clients

    this.checkWinConditions();
    return { ok: true, progress };
  }

  handleSabotage(socketId, sabotageId) {
    if (this.gameState !== 'playing') return { error: 'Not in game' };
    const player = this.players.get(socketId);
    if (!player || player.role !== 'virus' || !player.alive) return { error: 'Invalid' };
    if (this.sabotageActive) return { error: 'Sabotage already active' };

    const sabotage = mapData.sabotagePoints.find(s => s.id === sabotageId);
    if (!sabotage) return { error: 'Invalid sabotage' };

    this.sabotageActive = sabotage;
    this.io.to(this.roomCode).emit('sabotage-event', {
      type: sabotage.effect,
      sabotageId: sabotage.id,
      duration: 30,
    });

    this.sabotageTimeout = setTimeout(() => {
      this.sabotageActive = null;
      this.io.to(this.roomCode).emit('sabotage-resolved', { sabotageId: sabotage.id });
    }, 30000);

    return { ok: true };
  }

  handleVentUse(socketId, ventId, targetVentId) {
    if (this.gameState !== 'playing') return { error: 'Not in game' };
    const player = this.players.get(socketId);
    if (!player || player.role !== 'virus' || !player.alive) return { error: 'Not a virus' };

    const vent = mapData.vents.find(v => v.id === ventId);
    if (!vent || !vent.connections.includes(targetVentId)) return { error: 'Invalid vent' };

    const targetVent = mapData.vents.find(v => v.id === targetVentId);
    const targetRoom = mapData.rooms.find(r => r.id === targetVent.room);
    if (!targetRoom) return { error: 'Room not found' };

    player.x = targetRoom.x + targetRoom.w / 2;
    player.y = targetRoom.y + targetRoom.h / 2;

    this.io.to(this.roomCode).emit('player-vented', {
      playerId: player.id,
      fromVent: ventId,
      toVent: targetVentId,
      x: player.x,
      y: player.y,
    });

    return { ok: true };
  }

  castVote(voterId, targetId) {
    if (this.gameState !== 'meeting') return { error: 'Not in meeting' };
    return this.voteManager.castVote(voterId, targetId);
  }

  checkWinConditions() {
    if (this.gameState === 'ended') return true;

    const aliveViruses = this.getAliveViruseCount();
    const aliveAntivirus = this.getAliveAntivirusCount();

    // Virus win: viruses >= antivirus alive
    if (aliveViruses >= aliveAntivirus && aliveViruses > 0) {
      this.endGame('virus', 'viruses_outnumber');
      return true;
    }

    // Antivirus win: all viruses ejected/killed
    if (aliveViruses === 0) {
      this.endGame('antivirus', 'all_viruses_eliminated');
      return true;
    }

    // Antivirus win: all tasks complete
    const playerList = [...this.players.values()];
    if (this.taskManager.allTasksComplete(playerList)) {
      this.endGame('antivirus', 'tasks_complete');
      return true;
    }

    return false;
  }

  endGame(winner, reason) {
    this.gameState = 'ended';
    this.stopBroadcastLoop();
    this.voteManager.abort();

    if (this.sabotageTimeout) clearTimeout(this.sabotageTimeout);

    const playerRoles = {};
    this.players.forEach(p => { playerRoles[p.id] = { role: p.role, name: p.name }; });

    this.io.to(this.roomCode).emit('game-over', { winner, reason, playerRoles });
  }

  isEmpty() {
    return this.players.size === 0;
  }
}

module.exports = GameRoom;
