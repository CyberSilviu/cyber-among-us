/**
 * main.js — Phaser 3 game configuration and bootstrap.
 * Connects to server then launches the game.
 */
window.addEventListener('DOMContentLoaded', () => {
  // Connect to Socket.IO server first
  SocketManager.connect();

  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0a0a1a',
    parent: 'game-container',
    scene: [LobbyScene, GameScene, MiniGameScene, VotingScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    dom: { createContainer: false },
  };

  window.game = new Phaser.Game(config);
});
