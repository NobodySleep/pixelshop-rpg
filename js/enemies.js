// ===== ENEMY SYSTEM =====
import { TILE_SIZE } from './player.js';

const GRAVITY = 1000;
const MAX_FALL = 600;

// ===== ENEMY PROJECTILE =====
export class EnemyProjectile {
  constructor(x, y, dx, dy, opts = {}) {
    this.x = x; this.y = y;
    this.dx = dx; this.dy = dy;
    this.damage = opts.damage || 10;
    this.radius = opts.radius || 6;
    this.color = opts.color || '#ff4444';
    this.glowColor = opts.glowColor || opts.color || '#ff4444';
    this.life = opts.life || 1.5;
    this.maxLife = this.life;
    this.gravity = opts.gravity || 0;
    this.dead = false;
    this.trail = []; // [{x,y}]
  }

  update(dt, player) {
    this.dy += this.gravity * dt;
    this.x += this.dx * dt;
    this.y += this.dy * dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }

    // Store trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    // Player collision
    if (player && !player.dead && player.iframes <= 0) {
      const px = player.x, py = player.y, pw = player.w, ph = player.h;
      if (this.x > px && this.x < px + pw && this.y > py && this.y < py + ph) {
        player.takeDamage(this.damage);
        this.dead = true;
      }
    }
  }

  draw(ctx) {
    const alpha = Math.min(1, this.life / this.maxLife * 2);
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const ta = (i / this.trail.length) * 0.5;
      ctx.fillStyle = this.glowColor;
      ctx.globalAlpha = ta * alpha;
      ctx.beginPath();
      ctx.arc(t.x, t.y, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Core
    ctx.save();
    ctx.shadowColor = this.glowColor;
    ctx.shadowBlur = 14;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.glowColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ===== DIFFICULTY SCALE =====
// Returns {hpMult, dmgMult, spdMult, projMult}
function diffScale(lvl) {
  const scales = [
    { hpMult: 1.0, dmgMult: 1.0, spdMult: 1.0, projMult: 1.0 },
    { hpMult: 1.35, dmgMult: 1.25, spdMult: 1.15, projMult: 1.2 },
    { hpMult: 1.75, dmgMult: 1.55, spdMult: 1.3, projMult: 1.5 },
  ];
  return scales[Math.min(lvl, 2)] || scales[0];
}

// ===== BASE ENEMY =====
export class EnemyBase {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    this.w = opts.w || 32; this.h = opts.h || 40;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.facing = -1;

    this.maxHp = opts.hp || 78;
    this.hp = this.maxHp;
    this.damage = opts.damage || 15;
    this.speed = opts.speed || 80;
    this.aggroRange = opts.aggroRange || 300;
    this.attackRange = opts.attackRange || 50;
    this.attackCooldown = opts.attackCooldown || 1.2;
    this.attackTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;
    this.iframes = 0;

    this.resizeTimer = 0;
    this.dead = false;
    this.deathTimer = 0;
    this.animState = 'idle';
    this.animTimer = 0;
    this.animFrame = 0;
    this.hurtTimer = 0;
    this.aggroed = false;

    this.patrolDir = -1;
    this.patrolTimer = 0;

    this.statusEffects = [];
    this.attackHitActive = false;
    this.attackHitTimer = 0;

    this.loot = opts.loot || null;

    // XP reward on death
    this.xpReward = opts.xpReward || 20;

    // Projectiles managed per-enemy
    this.projectiles = [];

    // Glitch state (visual effect before aggro)
    this.glitchTimer = 0;
    this.glitchInterval = 0.4 + Math.random() * 0.6;
    this.glitchOffset = { x: 0, y: 0 };
    this.glitchActive = false;
  }

  get alive() { return !this.dead; }
  get scaleMult() { return this.resizeTimer > 0 ? 0.6 : 1; }
  get speedMult() { return this.resizeTimer > 0 ? 0.4 : 1; }

  takeDamage(dmg, kb = 0, kbDir = 1) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtTimer = 0.15;
    this.knockbackX = kbDir * kb;
    if (kb > 100) this.knockbackY = -150;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.animState = 'death';
    }
  }

  applyStatus(type, duration, dps = 0) {
    const ex = this.statusEffects.find(s => s.type === type);
    if (ex) { ex.timer = Math.max(ex.timer, duration); ex.dps = Math.max(ex.dps, dps); }
    else this.statusEffects.push({ type, timer: duration, dps });
  }

  _updateProjectiles(dt, player) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update(dt, player);
      if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    }
  }

  update(dt, level, player) {
    if (this.dead) {
      this.deathTimer += dt;
      return;
    }

    this.iframes = Math.max(0, this.iframes - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.resizeTimer = Math.max(0, this.resizeTimer - dt);
    this.animTimer += dt;
    if (this.attackHitActive) {
      this.attackHitTimer -= dt;
      if (this.attackHitTimer <= 0) this.attackHitActive = false;
    }

    // Status effects
    for (let i = this.statusEffects.length - 1; i >= 0; i--) {
      const s = this.statusEffects[i];
      s.timer -= dt;
      if (s.dps) this.hp -= s.dps * dt;
      if (this.hp <= 0) { this.hp = 0; this.dead = true; this.animState = 'death'; }
      if (s.timer <= 0) this.statusEffects.splice(i, 1);
    }

    // Knockback decay
    this.knockbackX *= Math.pow(0.05, dt);
    if (Math.abs(this.knockbackX) < 2) this.knockbackX = 0;

    this._ai(dt, player);
    this._updateProjectiles(dt, player);

    // Physics
    this.vy += GRAVITY * dt;
    this.vy = Math.min(this.vy, MAX_FALL);
    this.x += (this.vx * this.speedMult + this.knockbackX) * dt;
    this.y += this.vy * dt;

    this.onGround = false;
    this._resolveCollisions(level);
  }

  _ai(dt, player) {
    if (!player || player.dead) { this._patrol(dt); return; }
    const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
    const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.aggroRange) this.aggroed = true;
    if (this.aggroed) {
      if (dist > this.attackRange + 20) {
        this.facing = dx > 0 ? 1 : -1;
        this.vx = this.facing * this.speed;
        this.animState = 'walk';
      } else {
        this.vx = 0;
        this.animState = 'idle';
        if (this.attackTimer <= 0) this._attack(player, dx, dy, dist);
      }
    } else {
      this._patrol(dt);
    }
  }

  _patrol(dt) {
    // Enemies stand still and glitch before being aggroed
    this.vx = 0;
    this.animState = 'idle';

    // Glitch interval
    this.glitchTimer += dt;
    if (this.glitchTimer >= this.glitchInterval) {
      this.glitchTimer = 0;
      this.glitchInterval = 0.3 + Math.random() * 0.7;
      this.glitchActive = true;
      this.glitchOffset = {
        x: (Math.random() - 0.5) * 8,
        y: (Math.random() - 0.5) * 4,
      };
      // Auto-clear glitch after short time
      setTimeout(() => { this.glitchActive = false; this.glitchOffset = { x: 0, y: 0 }; }, 80);
    }
  }

  _attack(player, dx, dy, dist) {
    this.attackTimer = this.attackCooldown;
    this.animState = 'attack';
    this.attackHitActive = true;
    this.attackHitTimer = 0.25;
    if (player && dist < this.attackRange + 16) {
      player.takeDamage(this.damage);
    }
  }

  _resolveCollisions(level) {
    if (!level) return;
    const tiles = level.getSolidTilesNear(this.x, this.y, this.w, this.h);
    for (const t of tiles) {
      if (this.vy >= 0 && this.y + this.h > t.y && this.y < t.y) {
        this.y = t.y - this.h; this.vy = 0; this.onGround = true;
      }
      if (this.vy < 0 && this.y < t.y + TILE_SIZE && this.y + this.h > t.y + TILE_SIZE) {
        this.y = t.y + TILE_SIZE; this.vy = 0;
      }
    }
    for (const t of tiles) {
      if (this.vx > 0 && this.x + this.w > t.x && this.x < t.x) {
        this.x = t.x - this.w; this.vx = 0; this.patrolDir *= -1;
      }
      if (this.vx < 0 && this.x < t.x + TILE_SIZE && this.x + this.w > t.x + TILE_SIZE) {
        this.x = t.x + TILE_SIZE; this.vx = 0; this.patrolDir *= -1;
      }
    }
    if (this.onGround && level) {
      const checkX = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
      const hasFloor = level.hasTileAt(Math.floor(checkX / TILE_SIZE), Math.floor((this.y + this.h + 2) / TILE_SIZE));
      if (!hasFloor) { this.vx = 0; this.patrolDir *= -1; }
    }
  }

  draw(ctx) {
    // Draw projectiles first (world space)
    for (const p of this.projectiles) p.draw(ctx);

    if (this.dead && this.deathTimer > 0.6) return;
    const sm = this.scaleMult;
    const w = this.w * sm, h = this.h * sm;

    // Glitch offset when not yet aggroed
    const gx = this.glitchActive ? this.glitchOffset.x : 0;
    const gy = this.glitchActive ? this.glitchOffset.y : 0;

    const cx = this.x + this.w / 2 + gx, cy = this.y + this.h - h + gy;
    ctx.save();
    ctx.translate(cx, cy);
    if (this.facing === 1) ctx.scale(-1, 1);
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / 0.6);
    if (this.hurtTimer > 0) ctx.globalAlpha = 0.5;

    // Glitch scanline slice effect before aggro
    if (this.glitchActive && !this.aggroed) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(-w / 2 + (Math.random() - 0.5) * 6, (Math.random() * h) | 0, w, 2 + (Math.random() * 3 | 0));
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(-w / 2 + (Math.random() - 0.5) * 6, (Math.random() * h) | 0, w, 2);
      ctx.restore();
    }

    this._drawStatusGlow(ctx, w, h);
    this._drawBody(ctx, w, h);
    ctx.restore();
    if (this.aggroed && !this.dead) this._drawHPBar(ctx);
  }

  _drawStatusGlow(ctx, w, h) {
    for (const s of this.statusEffects) {
      const colors = { burn: '#ff6b00', freeze: '#4af', shock: '#ff0' };
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = colors[s.type] || '#fff';
      ctx.beginPath(); ctx.ellipse(0, h / 2, w / 2 + 4, h / 2 + 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  _drawBody(ctx, w, h) {
    ctx.fillStyle = '#888';
    ctx.fillRect(-w / 2, 0, w, h);
  }

  _drawHPBar(ctx) {
    const bw = this.w + 10, bh = 5;
    const bx = this.x + this.w / 2 - bw / 2;
    const by = this.y - 12;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#e34850';
    ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
    ctx.strokeStyle = '#ff2244';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, by, bw, bh);
  }
}

// ===== LEVEL 1: CIRCUIT BOARD ENEMIES =====

export class ScissorsSprite extends EnemyBase {
  constructor(x, y, lvl = 0) {
    const s = diffScale(lvl);
    super(x, y, {
      hp: Math.round(72 * s.hpMult),
      damage: Math.round(15 * s.dmgMult),
      speed: Math.round(110 * s.spdMult),
      attackRange: 55,
      attackCooldown: Math.max(0.5, 0.85 / s.projMult),
      xpReward: Math.round(25 * (1 + lvl * 0.5)),
    });
    this.lvl = lvl;
    this.diffScale = s;
    this.lunging = false;
    this.lungeTimer = 0;
    this.color = '#39ff14'; // neon green
    this.projSpeed = 320 * s.projMult;
  }

  _attack(player, dx, dy, dist) {
    super._attack(player, dx, dy, dist);
    this.lunging = true;
    this.lungeTimer = 0.22;
    this.vx = this.facing * 380;
    this.vy = -120;
    // Fire a thrown scissor blade toward player
    if (player) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      this.projectiles.push(new EnemyProjectile(
        this.x + this.w / 2, this.y + this.h / 2,
        (dx / len) * this.projSpeed, (dy / len) * this.projSpeed,
        { damage: Math.round(this.damage * 0.6), radius: 5, color: '#c8ff00', glowColor: '#39ff14', life: 1.0 }
      ));
    }
  }

  update(dt, level, player) {
    if (this.lunging) {
      this.lungeTimer -= dt;
      if (this.lungeTimer <= 0) { this.lunging = false; this.vx = 0; }
    }
    super.update(dt, level, player);
  }

  _drawBody(ctx, w, h) {
    // Neon circuit-styled scissors
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(-w / 2, h);
    ctx.lineTo(0, 0);
    ctx.lineTo(w / 4, h);
    ctx.fill();
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.lineTo(0, 0);
    ctx.lineTo(-w / 4, h);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    if (this.lunging) {
      ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2;
      ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 12;
      ctx.strokeRect(-w / 2, 0, w, h);
    }
  }
}

export class GlueBlob extends EnemyBase {
  constructor(x, y, lvl = 0) {
    const s = diffScale(lvl);
    super(x, y, {
      hp: Math.round(117 * s.hpMult),
      damage: Math.round(13 * s.dmgMult),
      speed: Math.round(45 * s.spdMult),
      aggroRange: 250,
      attackRange: 200, // ranged attacker
      attackCooldown: Math.max(0.8, 1.6 / s.projMult),
      w: 38, h: 38,
      xpReward: Math.round(30 * (1 + lvl * 0.5)),
    });
    this.lvl = lvl;
    this.diffScale = s;
    this.stickyZones = [];
    this.color = '#aaff55';
    this.projSpeed = 180 * s.projMult;
  }

  _attack(player, dx, dy, dist) {
    this.attackTimer = this.attackCooldown;
    this.animState = 'attack';
    this.attackHitActive = true;
    this.attackHitTimer = 0.3;

    // Only melee damage if very close
    if (player && dist < 65) {
      player.takeDamage(this.damage);
      player.vx *= 0.3;
    }

    // Always fire a glue glob with arc gravity
    if (player) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // 2 sprays at slight angle spread
      for (let i = -1; i <= 1; i += 2) {
        const spread = i * 0.2;
        this.projectiles.push(new EnemyProjectile(
          this.x + this.w / 2, this.y + this.h / 2,
          (dx / len + spread) * this.projSpeed, (dy / len - 120) * this.projSpeed / 180,
          {
            damage: Math.round(this.damage * 0.5),
            radius: 7,
            color: '#aaff55',
            glowColor: '#aaff55',
            life: 1.4,
            gravity: 400,
          }
        ));
      }
      // Leave a sticky zone
      this.stickyZones.push({ x: this.x + this.w / 2, y: this.y + this.h - 8, life: 4 });
    }
  }

  update(dt, level, player) {
    super.update(dt, level, player);
    for (let i = this.stickyZones.length - 1; i >= 0; i--) {
      this.stickyZones[i].life -= dt;
      if (this.stickyZones[i].life <= 0) this.stickyZones.splice(i, 1);
      else if (player) {
        const z = this.stickyZones[i];
        const px = player.x + player.w / 2, py = player.y + player.h;
        if (Math.abs(px - z.x) < 30 && Math.abs(py - z.y) < 20) {
          player.vx *= 0.7;
        }
      }
    }
  }

  _drawBody(ctx, w, h) {
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Eyes
    ctx.fillStyle = '#0d1f12';
    ctx.beginPath(); ctx.arc(-w / 5, h / 3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w / 5, h / 3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39ff14';
    ctx.beginPath(); ctx.arc(-w / 5 + 1, h / 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w / 5 + 1, h / 3, 3, 0, Math.PI * 2); ctx.fill();
    // Drips
    ctx.fillStyle = this.color + 'aa';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(-w / 3 + i * (w / 3), h - 2, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ===== LEVEL 2: CYBER MATRIX ENEMIES =====

export class LayerGhost extends EnemyBase {
  constructor(x, y, lvl = 0) {
    const s = diffScale(lvl);
    super(x, y, {
      hp: Math.round(85 * s.hpMult),
      damage: Math.round(20 * s.dmgMult),
      speed: Math.round(95 * s.spdMult),
      aggroRange: 360,
      attackRange: 280,
      attackCooldown: Math.max(0.6, 1.8 / s.projMult),
      xpReward: Math.round(40 * (1 + lvl * 0.5)),
    });
    this.lvl = lvl;
    this.diffScale = s;
    this.phaseTimer = 0;
    this.phased = false;
    this.phaseInterval = 2.5;
    this.beams = [];
    this.projSpeed = 340 * s.projMult;
  }

  takeDamage(dmg, kb, kbDir) {
    if (this.phased) return;
    super.takeDamage(dmg, kb, kbDir);
  }

  _attack(player, dx, dy, dist) {
    super._attack(player, dx, dy, dist);
    if (!player) return;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Main beam projectile
    this.projectiles.push(new EnemyProjectile(
      this.x + this.w / 2, this.y + this.h / 2,
      dx / len * this.projSpeed, dy / len * this.projSpeed,
      { damage: Math.round(this.damage * 0.75), radius: 7, color: '#00eaff', glowColor: '#00eaff', life: 1.6 }
    ));
    // Secondary spread shots on higher levels
    if (this.lvl >= 1) {
      for (const angle of [-0.25, 0.25]) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const nx = dx / len * cos - dy / len * sin;
        const ny = dx / len * sin + dy / len * cos;
        this.projectiles.push(new EnemyProjectile(
          this.x + this.w / 2, this.y + this.h / 2,
          nx * this.projSpeed * 0.8, ny * this.projSpeed * 0.8,
          { damage: Math.round(this.damage * 0.4), radius: 5, color: '#0099cc', glowColor: '#00eaff', life: 1.2 }
        ));
      }
    }
    // Keep legacy beam for visual
    this.beams.push({ x: this.x + this.w / 2, y: this.y + this.h / 2, dx: dx / len * 320, dy: dy / len * 320, life: 0.4 });
  }

  update(dt, level, player) {
    this.phaseTimer += dt;
    if (this.phaseTimer > this.phaseInterval) {
      this.phaseTimer = 0;
      this.phased = !this.phased;
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.x += b.dx * dt; b.y += b.dy * dt; b.life -= dt;
      if (b.life <= 0) this.beams.splice(i, 1);
    }
    super.update(dt, level, player);
  }

  _drawBody(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = this.phased ? 0.25 : 0.85;
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#00eaff88');
    grd.addColorStop(1, '#0a0d1a88');
    ctx.fillStyle = grd;
    ctx.shadowColor = '#00eaff';
    ctx.shadowBlur = this.phased ? 20 : 10;
    ctx.beginPath();
    ctx.arc(0, h / 3, w / 2, Math.PI, 0);
    ctx.lineTo(w / 2, h);
    for (let i = 0; i <= 3; i++) {
      ctx.quadraticCurveTo(w / 2 - (i + 0.5) * (w / 3) / 2, h + (i % 2 === 0 ? 8 : -4),
        w / 2 - (i + 1) * (w / 3) / 2, h);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#00eaff';
    ctx.beginPath(); ctx.arc(-w / 5, h / 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w / 5, h / 5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    super.draw(ctx);
    // Legacy beam line visuals
    for (const b of this.beams) {
      ctx.save();
      ctx.strokeStyle = '#00eaff';
      ctx.lineWidth = 4;
      ctx.globalAlpha = Math.max(0, b.life * 2);
      ctx.shadowColor = '#00eaff'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(this.x + this.w / 2, this.y + this.h / 2);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class VignetteShade extends EnemyBase {
  constructor(x, y, lvl = 0) {
    const s = diffScale(lvl);
    super(x, y, {
      hp: Math.round(104 * s.hpMult),
      damage: Math.round(28 * s.dmgMult),
      speed: Math.round(70 * s.spdMult),
      aggroRange: 320,
      attackRange: 240,
      attackCooldown: Math.max(0.7, 1.4 / s.projMult),
      w: 36, h: 46,
      xpReward: Math.round(50 * (1 + lvl * 0.5)),
    });
    this.lvl = lvl;
    this.diffScale = s;
    this.vignetteActive = false;
    this.vignetteTimer = 0;
    this.projSpeed = 260 * s.projMult;
  }

  _attack(player, dx, dy, dist) {
    this.attackTimer = this.attackCooldown;
    this.animState = 'attack';
    this.attackHitActive = true;
    this.attackHitTimer = 0.3;

    if (player && dist < 65) player.takeDamage(this.damage);
    this.vignetteActive = true;
    this.vignetteTimer = 2;

    // Fire 2-3 dark orbs in spread
    if (player) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const count = this.lvl >= 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const angle = (i / (count - 1) - 0.5) * 0.5;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const nx = dx / len * cos - dy / len * sin;
        const ny = dx / len * sin + dy / len * cos;
        this.projectiles.push(new EnemyProjectile(
          this.x + this.w / 2, this.y + this.h / 2,
          nx * this.projSpeed, ny * this.projSpeed,
          { damage: Math.round(this.damage * 0.55), radius: 8, color: '#1a0030', glowColor: '#aa00ff', life: 1.5 }
        ));
      }
    }
  }

  update(dt, level, player) {
    super.update(dt, level, player);
    this.vignetteTimer = Math.max(0, this.vignetteTimer - dt);
    if (this.vignetteTimer <= 0) this.vignetteActive = false;
  }

  _drawBody(ctx, w, h) {
    ctx.shadowColor = '#aa00ff';
    ctx.shadowBlur = 18;
    const grd = ctx.createRadialGradient(0, h / 2, 5, 0, h / 2, w);
    grd.addColorStop(0, '#1a0030');
    grd.addColorStop(0.5, '#2C0050');
    grd.addColorStop(1, '#00000000');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, h / 2, w / 2 + 4, h / 2 + 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d0020';
    ctx.beginPath();
    ctx.ellipse(0, h / 3, w / 2 - 4, h / 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff00ff';
    ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(-w / 5, h / 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w / 5, h / 4, 5, 0, Math.PI * 2); ctx.fill();
  }
}

// ===== LEVEL 3: NEON VOID ENEMIES =====

export class BoldTypeTitan extends EnemyBase {
  constructor(x, y, lvl = 0) {
    const s = diffScale(lvl);
    super(x, y, {
      hp: Math.round(182 * s.hpMult),
      damage: Math.round(36 * s.dmgMult),
      speed: Math.round(55 * s.spdMult),
      aggroRange: 300,
      attackRange: 280,
      attackCooldown: Math.max(0.7, 1.3 / s.projMult),
      w: 44, h: 55,
      xpReward: Math.round(70 * (1 + lvl * 0.5)),
    });
    this.lvl = lvl;
    this.diffScale = s;
    this.stompActive = false;
    this.stompTimer = 0;
    this.stompRadius = 130;
    this.projSpeed = 240 * s.projMult;
  }

  _attack(player, dx, dy, dist) {
    this.attackTimer = this.attackCooldown;
    this.animState = 'attack';
    this.attackHitActive = true;
    this.attackHitTimer = 0.35;
    this.stompActive = true;
    this.stompTimer = 0.5;
    this.vy = -180;

    if (player && dist < this.attackRange) {
      // Fire expanding shockwave ring (4 directions + aimed)
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.atan2(dy, dx)];
      for (const a of angles) {
        this.projectiles.push(new EnemyProjectile(
          this.x + this.w / 2, this.y + this.h / 2,
          Math.cos(a) * this.projSpeed, Math.sin(a) * this.projSpeed,
          { damage: Math.round(this.damage * 0.45), radius: 9, color: '#ff2200', glowColor: '#ff6600', life: 0.9 }
        ));
      }
      // Melee hits if in range
      const pdist = Math.abs(player.x + player.w / 2 - (this.x + this.w / 2));
      if (dist < 70) player.takeDamage(this.damage);
      if (pdist < this.stompRadius && player.onGround) player.takeDamage(this.damage * 0.4);
    }
  }

  _drawBody(ctx, w, h) {
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff2200';
    ctx.font = `bold ${h}px "Space Grotesk", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('A', 0, h);
    ctx.shadowBlur = 0;
    // Neon eye overlay
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-w / 4, h * 0.3, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w / 4, h * 0.3, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath(); ctx.arc(-w / 4 + 1, h * 0.3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w / 4 + 1, h * 0.3, 3, 0, Math.PI * 2); ctx.fill();
    if (this.stompActive) {
      ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 3;
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 20;
      ctx.strokeRect(-w / 2, 0, w, h);
    }
  }
}

export class CMYKDrone extends EnemyBase {
  constructor(x, y, lvl = 0) {
    const s = diffScale(lvl);
    super(x, y, {
      hp: Math.round(59 * s.hpMult),
      damage: Math.round(13 * s.dmgMult),
      speed: Math.round(130 * s.spdMult),
      aggroRange: 420,
      attackRange: 320,
      attackCooldown: Math.max(0.5, 0.9 / s.projMult),
      xpReward: Math.round(35 * (1 + lvl * 0.5)),
    });
    this.lvl = lvl;
    this.diffScale = s;
    this.hovering = true;
    this.hoverY = y;
    this.hoverTimer = 0;
    this.projSpeed = 370 * s.projMult;
  }

  _ai(dt, player) {
    if (!player || player.dead) return;
    const dx = (player.x + player.w / 2) - (this.x + this.w / 2);
    const dy = (player.y + player.h / 2) - (this.y + this.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < this.aggroRange) this.aggroed = true;
    if (this.aggroed) {
      this.hoverTimer += dt;
      const targetY = player.y - 80;
      this.y += (targetY - this.y) * dt * 3;
      if (Math.abs(dx) > this.attackRange) {
        this.facing = dx > 0 ? 1 : -1;
        this.vx = this.facing * this.speed;
      } else {
        this.vx = 0;
      }
      if (this.attackTimer <= 0 && dist < this.aggroRange) {
        this._attack(player, dx, dy, dist);
      }
    }
  }

  _attack(player, dx, dy, dist) {
    this.attackTimer = this.attackCooldown;
    const COLORS = ['#00FFFF', '#FF00FF', '#FFFF00', '#ffffff'];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const burstCount = this.lvl >= 2 ? 5 : 3;
    for (let i = 0; i < burstCount; i++) {
      const spread = (i - Math.floor(burstCount / 2)) * 0.18;
      const color = COLORS[i % COLORS.length];
      this.projectiles.push(new EnemyProjectile(
        this.x + this.w / 2, this.y + this.h / 2,
        (dx / len + spread) * this.projSpeed, dy / len * this.projSpeed,
        { damage: this.damage, radius: 6, color, glowColor: color, life: 1.1 }
      ));
    }
  }

  update(dt, level, player) {
    this.vy = 0;
    this._updateProjectiles(dt, player);
    this.iframes = Math.max(0, this.iframes - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.resizeTimer = Math.max(0, this.resizeTimer - dt);
    this.animTimer += dt;
    this.knockbackX *= Math.pow(0.05, dt);
    this._ai(dt, player);
    this.x += (this.vx + this.knockbackX) * dt;
    if (level) this.x = Math.max(0, Math.min(this.x, level.pixelWidth - this.w));
  }

  _drawBody(ctx, w, h) {
    const CMYK = ['#00FFFF', '#FF00FF', '#FFFF00', '#ffffff'];
    ctx.save();
    ctx.rotate(this.animTimer * 1.8);
    ctx.shadowColor = '#00FFFF'; ctx.shadowBlur = 16;
    for (let q = 0; q < 4; q++) {
      ctx.fillStyle = CMYK[q];
      ctx.beginPath();
      ctx.moveTo(0, -w / 2 - 4);
      ctx.lineTo(w / 4, 0);
      ctx.lineTo(0, w / 2 - 8);
      ctx.lineTo(-w / 4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(Math.PI / 2);
    }
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  }
}

// ===== FACTORY =====
export function createEnemy(type, x, y, lvlIndex = 0) {
  switch (type) {
    case 'scissors':     return new ScissorsSprite(x, y, lvlIndex);
    case 'glueblob':     return new GlueBlob(x, y, lvlIndex);
    case 'layerghost':   return new LayerGhost(x, y, lvlIndex);
    case 'vignetteshade':return new VignetteShade(x, y, lvlIndex);
    case 'boldtype':     return new BoldTypeTitan(x, y, lvlIndex);
    case 'cmykdrone':    return new CMYKDrone(x, y, lvlIndex);
    default:             return new EnemyBase(x, y);
  }
}

export const LEVEL_ENEMIES = [
  ['scissors', 'glueblob'],
  ['layerghost', 'vignetteshade'],
  ['boldtype', 'cmykdrone'],
];
