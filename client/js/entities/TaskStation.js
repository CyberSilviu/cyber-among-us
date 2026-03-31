/**
 * TaskStation — visual task interaction point in the game world.
 * Drawn as a pulsing golden square with a "!" marker.
 */
class TaskStation {
  constructor(scene, taskDef, isAssigned = false) {
    this.scene = scene;
    this.taskDef = taskDef;
    this.isAssigned = isAssigned;
    this.completed = false;

    const SIZE = 18;
    this.gfx = scene.add.graphics();
    this.label = scene.add.text(taskDef.x, taskDef.y - SIZE - 6, taskDef.name, {
      fontSize: '9px',
      fontFamily: 'Courier New, monospace',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 1);

    this._SIZE = SIZE;
    this._draw();

    // Pulse tween for assigned tasks
    if (isAssigned && !this.completed) {
      scene.tweens.add({
        targets: this.gfx,
        alpha: { from: 1, to: 0.5 },
        yoyo: true,
        repeat: -1,
        duration: 800,
        ease: 'Sine.easeInOut',
      });
    }
  }

  _draw() {
    this.gfx.clear();
    const { x, y } = this.taskDef;
    const S = this._SIZE;

    if (this.completed) {
      // Green checkmark-ish box
      this.gfx.fillStyle(0x00ff88, 0.25);
      this.gfx.fillRect(x - S, y - S, S * 2, S * 2);
      this.gfx.lineStyle(1, 0x00ff88, 0.7);
      this.gfx.strokeRect(x - S, y - S, S * 2, S * 2);
    } else if (this.isAssigned) {
      // Bright gold pulsing
      this.gfx.fillStyle(0xffd700, 0.3);
      this.gfx.fillRect(x - S, y - S, S * 2, S * 2);
      this.gfx.lineStyle(2, 0xffd700, 1);
      this.gfx.strokeRect(x - S, y - S, S * 2, S * 2);
      // "!" text drawn on label
      this.label.setText(`! ${this.taskDef.name}`);
    } else {
      // Dim unassigned
      this.gfx.fillStyle(0x334466, 0.2);
      this.gfx.fillRect(x - S, y - S, S * 2, S * 2);
      this.gfx.lineStyle(1, 0x334466, 0.5);
      this.gfx.strokeRect(x - S, y - S, S * 2, S * 2);
      this.label.setText(this.taskDef.name);
      this.label.setAlpha(0.4);
    }
  }

  markComplete() {
    this.completed = true;
    this.scene.tweens.killTweensOf(this.gfx);
    this.gfx.setAlpha(1);
    this._draw();
    this.label.setStyle({ color: '#00ff88' });
    this.label.setText(`✓ ${this.taskDef.name}`);
  }

  isNearby(px, py, radius = 80) {
    const { x, y } = this.taskDef;
    return Math.sqrt((px - x) ** 2 + (py - y) ** 2) <= radius;
  }

  destroy() {
    this.gfx.destroy();
    this.label.destroy();
  }
}
