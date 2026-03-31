'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameManager = require('./game/GameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;

// Serve static client files
app.use(express.static(path.join(__dirname, '..', 'client')));

const gameManager = new GameManager(io);

// ─── Socket.IO Event Handlers ────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Lobby ──────────────────────────────────────────────────────────────────

  socket.on('create-room', ({ playerName, playerColor }) => {
    const roomCode = gameManager.createRoom(socket, playerName, playerColor);
    socket.emit('room-created', { roomCode });
    console.log(`[Room] Created ${roomCode} by ${playerName}`);
  });

  socket.on('join-room', ({ roomCode, playerName, playerColor }) => {
    const result = gameManager.joinRoom(socket, roomCode, playerName, playerColor);
    if (result.error) {
      socket.emit('join-error', { message: result.error });
    } else {
      socket.emit('room-joined', { roomCode: roomCode.toUpperCase() });
    }
  });

  socket.on('start-game', () => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return socket.emit('error', { message: 'Not in a room' });
    const result = room.startGame(socket.id);
    if (result.error) socket.emit('error', { message: result.error });
  });

  socket.on('update-settings', (settings) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || !player.isHost) return;
    if (room.gameState !== 'lobby') return;

    // Only allow valid numeric settings
    const allowed = ['numViruses', 'taskCount', 'killCooldown'];
    allowed.forEach(key => {
      if (settings[key] !== undefined && typeof settings[key] === 'number') {
        room.settings[key] = settings[key];
      }
    });
    io.to(room.roomCode).emit('settings-updated', room.settings);
  });

  // ── Gameplay ───────────────────────────────────────────────────────────────

  socket.on('player-move', ({ x, y }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    room.handleMovement(socket.id, x, y);
  });

  socket.on('kill-player', ({ targetId }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const result = room.handleKill(socket.id, targetId);
    if (result.error) socket.emit('action-error', { message: result.error });
  });

  socket.on('report-body', ({ bodyId }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const result = room.handleReportBody(socket.id, bodyId);
    if (result.error) socket.emit('action-error', { message: result.error });
  });

  socket.on('call-meeting', () => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const result = room.handleCallMeeting(socket.id);
    if (result.error) socket.emit('action-error', { message: result.error });
  });

  socket.on('task-complete', ({ taskId }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const result = room.handleTaskComplete(socket.id, taskId);
    if (result.error) socket.emit('action-error', { message: result.error });
  });

  socket.on('sabotage', ({ sabotageId }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const result = room.handleSabotage(socket.id, sabotageId);
    if (result.error) socket.emit('action-error', { message: result.error });
  });

  socket.on('use-vent', ({ ventId, targetVentId }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const result = room.handleVentUse(socket.id, ventId, targetVentId);
    if (result.error) socket.emit('action-error', { message: result.error });
  });

  // ── Voting ─────────────────────────────────────────────────────────────────

  socket.on('cast-vote', ({ targetId }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const ok = room.castVote(socket.id, targetId || null);
    if (!ok) socket.emit('action-error', { message: 'Cannot vote now' });
  });

  socket.on('chat-message', ({ text }) => {
    const room = gameManager.getRoomBySocketId(socket.id);
    if (!room) return;
    if (room.gameState !== 'meeting') return;

    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;

    const safeText = String(text).substring(0, 200).trim();
    if (!safeText) return;

    io.to(room.roomCode).emit('chat-message', {
      senderId: socket.id,
      senderName: player.name,
      senderColor: player.color,
      text: safeText,
    });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    gameManager.handleDisconnect(socket);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`CyberPurge server running at http://localhost:${PORT}`);
});
