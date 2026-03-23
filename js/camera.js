// ===== CAMERA =====
export class Camera {
  constructor(w, h) {
    this.x = 0; this.y = 0;
    this.width = w; this.height = h;
    this.targetX = 0; this.targetY = 0;
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
  }

  follow(entity, levelW, levelH) {
    this.targetX = entity.x + entity.w / 2 - this.width / 2;
    this.targetY = entity.y + entity.h / 2 - this.height / 2;
    // clamp
    this.targetX = Math.max(0, Math.min(this.targetX, levelW - this.width));
    this.targetY = Math.max(0, Math.min(this.targetY, levelH - this.height));
  }

  update(dt) {
    this.x += (this.targetX - this.x) * Math.min(1, 8 * dt);
    this.y += (this.targetY - this.y) * Math.min(1, 8 * dt);
    if (this.shake > 0) {
      const mag = this.shake * 8;
      this.shakeX = (Math.random() - 0.5) * mag;
      this.shakeY = (Math.random() - 0.5) * mag;
      this.shake -= dt * 3;
      if (this.shake < 0) { this.shake = 0; this.shakeX = 0; this.shakeY = 0; }
    }
  }

  addShake(amount) { this.shake = Math.min(this.shake + amount, 2); }

  apply(ctx) {
    ctx.save();
    ctx.translate(
      Math.round(-this.x + this.shakeX),
      Math.round(-this.y + this.shakeY)
    );
  }

  restore(ctx) { ctx.restore(); }

  toWorld(sx, sy) {
    return { x: sx + this.x - this.shakeX, y: sy + this.y - this.shakeY };
  }
}
