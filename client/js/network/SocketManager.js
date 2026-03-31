/**
 * SocketManager — singleton wrapper around Socket.IO client.
 * All server communication is routed through this object.
 */
const SocketManager = (() => {
  let socket = null;

  function connect() {
    if (socket && socket.connected) return socket;
    socket = io(window.location.origin);
    return socket;
  }

  function get() { return socket; }

  // ── Emit helpers ───────────────────────────────────────────────────────────

  function createRoom(playerName, playerColor) {
    socket.emit('create-room', { playerName, playerColor });
  }

  function joinRoom(roomCode, playerName, playerColor) {
    socket.emit('join-room', { roomCode, playerName, playerColor });
  }

  function startGame() {
    socket.emit('start-game');
  }

  function updateSettings(settings) {
    socket.emit('update-settings', settings);
  }

  function sendMove(x, y) {
    socket.emit('player-move', { x, y });
  }

  function killPlayer(targetId) {
    socket.emit('kill-player', { targetId });
  }

  function reportBody(bodyId) {
    socket.emit('report-body', { bodyId });
  }

  function callMeeting() {
    socket.emit('call-meeting');
  }

  function taskComplete(taskId) {
    socket.emit('task-complete', { taskId });
  }

  function sabotage(sabotageId) {
    socket.emit('sabotage', { sabotageId });
  }

  function useVent(ventId, targetVentId) {
    socket.emit('use-vent', { ventId, targetVentId });
  }

  function castVote(targetId) {
    socket.emit('cast-vote', { targetId });
  }

  function sendChatMessage(text) {
    socket.emit('chat-message', { text });
  }

  // ── On helper ─────────────────────────────────────────────────────────────

  function on(event, cb) {
    if (!socket) return;
    socket.on(event, cb);
  }

  function off(event, cb) {
    if (!socket) return;
    socket.off(event, cb);
  }

  return {
    connect, get,
    createRoom, joinRoom, startGame, updateSettings,
    sendMove, killPlayer, reportBody, callMeeting,
    taskComplete, sabotage, useVent,
    castVote, sendChatMessage,
    on, off,
  };
})();
