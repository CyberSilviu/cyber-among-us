'use strict';

const mapData = require('../maps/mainMap.json');

// Task definitions with coordinates derived from map room positions
const TASK_DEFINITIONS = mapData.tasks.map(t => {
  const room = mapData.rooms.find(r => r.id === t.room);
  return {
    id: t.id,
    name: t.name,
    room: t.room,
    type: t.type,
    x: room ? room.x + room.w / 2 : 1500,
    y: room ? room.y + room.h / 2 : 1000,
  };
});

class TaskManager {
  constructor(taskCount = 5) {
    this.taskCount = taskCount;
    this.taskDefinitions = TASK_DEFINITIONS;
    this.completedTasks = new Set(); // global set of task ids completed by anyone
    this.playerTasks = new Map(); // playerId -> [taskIds]
    this.totalAntivirusTasks = 0; // computed on game start
  }

  assignTasks(players) {
    this.completedTasks.clear();
    this.playerTasks.clear();
    this.totalAntivirusTasks = 0;

    const antivirusPlayers = players.filter(p => p.role === 'antivirus');
    const shuffled = [...this.taskDefinitions].sort(() => Math.random() - 0.5);

    antivirusPlayers.forEach(player => {
      const assigned = shuffled.slice(0, this.taskCount).map(t => t.id);
      player.tasksAssigned = assigned;
      player.tasksCompleted = [];
      this.playerTasks.set(player.id, assigned);
      this.totalAntivirusTasks += assigned.length;
    });

    // Viruses get no real tasks
    players.filter(p => p.role === 'virus').forEach(player => {
      player.tasksAssigned = [];
      player.tasksCompleted = [];
    });
  }

  completeTask(player, taskId) {
    if (player.role !== 'antivirus') return false;
    if (!player.tasksAssigned.includes(taskId)) return false;
    if (player.tasksCompleted.includes(taskId)) return false;

    player.tasksCompleted.push(taskId);
    this.completedTasks.add(`${player.id}:${taskId}`);
    return true;
  }

  getProgress(players) {
    const antivirusPlayers = players.filter(p => p.role === 'antivirus');
    let completed = 0;
    let total = 0;
    antivirusPlayers.forEach(p => {
      completed += p.tasksCompleted.length;
      total += p.tasksAssigned.length;
    });
    return {
      completedTasks: completed,
      totalTasks: total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  allTasksComplete(players) {
    const progress = this.getProgress(players);
    return progress.totalTasks > 0 && progress.completedTasks >= progress.totalTasks;
  }

  getTaskDefinition(taskId) {
    return this.taskDefinitions.find(t => t.id === taskId);
  }

  getAllTaskDefinitions() {
    return this.taskDefinitions;
  }
}

module.exports = TaskManager;
