'use strict';

const GameRoom = require('./GameRoom');

class GameManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomCode -> GameRoom
  }

  createRoom(socket, playerName, playerColor) {
    const room = new GameRoom(this.io, socket, playerName, playerColor);
    this.rooms.set(room.roomCode, room);
    socket.data.roomCode = room.roomCode;
    socket.data.playerName = playerName;
    return room.roomCode;
  }

  joinRoom(socket, roomCode, playerName, playerColor) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'Room not found' };
    if (room.gameState !== 'lobby') return { error: 'Game already in progress' };
    if (room.players.size >= room.settings.maxPlayers) return { error: 'Room is full' };
    if ([...room.players.values()].find(p => p.name === playerName)) {
      return { error: 'Name already taken' };
    }

    room.addPlayer(socket, playerName, playerColor);
    socket.data.roomCode = roomCode.toUpperCase();
    socket.data.playerName = playerName;
    return { ok: true };
  }

  handleDisconnect(socket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.removePlayer(socket.id);

    if (room.isEmpty()) {
      this.rooms.delete(roomCode);
    }
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  getRoomBySocketId(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return null;
  }
}

module.exports = GameManager;
