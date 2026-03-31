'use strict';

class Player {
  constructor(socketId, name, color) {
    this.id = socketId;
    this.socketId = socketId;
    this.name = name.substring(0, 16).trim() || 'Player';
    this.color = color || '#ff0000';
    this.role = null; // 'antivirus' | 'virus'
    this.x = 1500;
    this.y = 1000;
    this.alive = true;
    this.tasksAssigned = []; // array of task ids
    this.tasksCompleted = []; // array of completed task ids
    this.isHost = false;
    this.killCooldownEnd = 0; // timestamp
    this.hasVoted = false;
    this.votedFor = null; // playerId or null for skip
    this.reportedBodies = [];
  }

  assignRole(role) {
    this.role = role;
  }

  kill() {
    this.alive = false;
  }

  resetVote() {
    this.hasVoted = false;
    this.votedFor = null;
  }

  canKill(now = Date.now()) {
    return this.role === 'virus' && this.alive && now >= this.killCooldownEnd;
  }

  startKillCooldown(seconds) {
    this.killCooldownEnd = Date.now() + seconds * 1000;
  }

  completeTask(taskId) {
    if (!this.tasksCompleted.includes(taskId) && this.tasksAssigned.includes(taskId)) {
      this.tasksCompleted.push(taskId);
      return true;
    }
    return false;
  }

  // Returns data safe to broadcast to ALL players (no role reveal)
  getPublicData() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      x: this.x,
      y: this.y,
      alive: this.alive,
      isHost: this.isHost,
      tasksCompleted: this.tasksCompleted.length,
      tasksAssigned: this.tasksAssigned.length,
    };
  }

  // Returns data for this player only (includes role and tasks)
  getPrivateData() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      role: this.role,
      x: this.x,
      y: this.y,
      alive: this.alive,
      isHost: this.isHost,
      tasksAssigned: this.tasksAssigned,
      tasksCompleted: this.tasksCompleted,
      killCooldownEnd: this.killCooldownEnd,
    };
  }
}

module.exports = Player;
