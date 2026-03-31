/**
 * PlayerSprite — visual representation of a player in the GameScene.
 * Drawn using Phaser Graphics: colored circle + name label + death X.
 */
class PlayerSprite {
  static RADIUS = 16;

  constructor(scene, id, name, color, isLocalPlayer = false) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = color;
    this.isLocalPlayer = isLocalPlayer;

    // Target position for lerp
    this.targetX = 0;
    this.targetY = 0;

    // Container holds circle + label
    this.container = scene.add.container(0, 0);

    // Circle
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);

    // Name label
    this.label = scene.add.text(0, -PlayerSprite.RADIUS - 8, name, {
      fontSize: '11px',
      fontFamily: 'Courier New, monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 1);
    this.container.add(this.label);

    // Kill flash overlay
    this.flashGfx = scene.add.graphics();
    this.container.add(this.flashGfx);

    this._alive = true;
    this._draw();

    // Local player highlight ring
    if (isLocalPlayer) {
      this.ring = scene.add.graphics();
      this.container.add(this.ring);
      this._drawRing();
    }
  }

  _hexToNumber(hex) {
    return parseInt(hex.replace('#', ''), 16);
  }

  _draw() {
    this.gfx.clear();
    const r = PlayerSprite.RADIUS;
    const colorNum = this._hexToNumber(this.color);

    if (this._alive) {
      // Shadow
      this.gfx.fillStyle(0x000000, 0.4);
      this.gfx.fillCircle(2, 2, r);
      // Fill
      this.gfx.fillStyle(colorNum, 1);
      this.gfx.fillCircle(0, 0, r);
      // Outline
      this.gfx.lineStyle(2, 0xffffff, 0.3);
      this.gfx.strokeCircle(0, 0, r);
      // Visor
      this.gfx.fillStyle(0xffffff, 0.2);
      this.gfx.fillEllipse(-2, -4, r * 0.9, r * 0.6);

      this.label.setAlpha(1);
    } else {
      // Dead: X shape
      const size = r * 0.9;
      const lineWidth = 5;
      this.gfx.lineStyle(lineWidth, colorNum, 0.7);
      this.gfx.beginPath();
      this.gfx.moveTo(-size, -size); this.gfx.lineTo(size, size);
      this.gfx.moveTo(size, -size);  this.gfx.lineTo(-size, size);
      this.gfx.strokePath();

      this.label.setAlpha(0.4);
    }
  }

  _drawRing() {
    if (!this.ring) return;
    this.ring.clear();
    this.ring.lineStyle(2, 0xffffff, 0.6);
    this.ring.strokeCircle(0, 0, PlayerSprite.RADIUS + 4);
  }

  setPosition(x, y, instant = false) {
    this.targetX = x;
    this.targetY = y;
    if (instant) {
      this.container.setPosition(x, y);
    }
  }

  update() {
    // Smooth lerp towards target
    const cx = this.container.x;
    const cy = this.container.y;
    const LERP = 0.2;
    this.container.setPosition(
      cx + (this.targetX - cx) * LERP,
      cy + (this.targetY - cy) * LERP,
    );
  }

  kill() {
    if (!this._alive) return;
    this._alive = false;
    this._draw();
    this._playKillFlash();
  }

  _playKillFlash() {
    this.flashGfx.clear();
    this.flashGfx.fillStyle(0xff0000, 0.7);
    this.flashGfx.fillCircle(0, 0, PlayerSprite.RADIUS * 2);

    this.scene.tweens.add({
      targets: this.flashGfx,
      alpha: 0,
      duration: 600,
      ease: 'Power2',
      onComplete: () => this.flashGfx.clear(),
    });
  }

  setDepth(d) {
    this.container.setDepth(d);
    return this;
  }

  destroy() {
    this.container.destroy();
  }

  get x() { return this.container.x; }
  get y() { return this.container.y; }
}
