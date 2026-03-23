// ===== PLAYER CLASS =====
import { applyGearToPlayer } from './gear.js';
import { upgradeWeapon, createWeapon, WEAPON_TYPES } from './weapons.js';

export const TILE_SIZE = 32;
const GRAVITY = 1400;
const MAX_FALL = 800;
const JUMP_FORCE = -580;
const DOUBLE_JUMP_FORCE = -480;
const SPEED = 200;
const MAX_HP = 120;

export class Player {
  constructor(x, y, avatar) {
    this.x = x; this.y = y;
    this.w = 28; this.h = 44;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.canDoubleJump = false;
    this.hasDoubleJumped = false;
    this.facing = 1; // 1=right, -1=left
    this.avatar = avatar;

    // HP
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;

    // XP & Player Level
    this.playerLevel = 1;
    this.xp = 0;
    this.xpToNext = 100;          // XP needed for next level
    this.levelUpPending = false;  // flash flag for UI
    this.levelUpTimer = 0;

    // Stats
    this.attackPower = 1.0; // multiplier
    this.critChance = 0.05;
    this.armor = 0;

    // Weapon
    this.weapon = null;
    this.attackTimer = 0;
    this.attackAnim = 0;
    this.isAttacking = false;
    this.attackHits = []; // active hitboxes

    // Special
    this.specialTimer = 0;
    this.specialActive = false;
    this.isDashing = false;
    this.dashTimer = 0;
    this.dashDir = 1;

    // Trail (brush)
    this.paintTrails = []; // {x,y,life,maxLife,color}

    // Ultimate
    this.ultimateCharge = 0;       // 0–100
    this.ultimateMax = 100;

    // Combo (gradient gloves)
    this.comboCount = 0;
    this.comboResetTimer = 0;

    // Gear / accessories
    this.gear = [];        // [{id, stacks}]
    this.accessories = []; // [{id, stacks}]

    // Gear derived stats (re-calc on gear change)
    this._gearArmorBonus = 0;
    this._ultimateChargeBonus = 1;
    this._blendProc = 0;
    this._hueSpeedBoost = 1;
    this._doubleHitChance = 0;
    this._gradientMax = 0;
    this._gradientStep = 0;
    this._lifeOnKill = 0;
    this._pullRadius = 0;
    this._pullForce = 0;

    // Hue-shift timer
    this._hueBoostTimer = 0;

    // Status effects
    this.statusEffects = []; // {type, duration}

    // Animation
    this.animState = 'idle'; // 'idle'|'run'|'jump'|'attack'|'death'
    this.animTimer = 0;
    this.animFrame = 0;
    this.dead = false;
    this.deathTimer = 0;

    // Interaction range
    this.interactTarget = null;

    // Invincibility frames after hit
    this.iframes = 0;
  }

  equipWeapon(weapon) {
    this.weapon = weapon;
    this.attackTimer = 0;
  }

  addGear(item) {
    const slot = item.slot; // 'gear' or 'accessory'
    const arr = slot === 'gear' ? this.gear : this.accessories;
    const max = slot === 'gear' ? 2 : 2;
    const existing = arr.find(g => g.id === item.id);
    if (existing) {
      existing.stacks = (existing.stacks || 1) + 1;
    } else if (arr.length < max) {
      arr.push({ id: item.id, stacks: 1 });
    } else {
      return false; // full
    }
    applyGearToPlayer(this);
    return true;
  }

  heal(amt) {
    this.hp = Math.min(this.maxHp, this.hp + amt);
  }

  takeDamage(dmg, source) {
    if (this.iframes > 0 || this.dead) return;
    const reduction = Math.min(0.8, (this.armor * 0.02) + this._gearArmorBonus);
    const actual = Math.max(1, Math.round(dmg * (1 - reduction)));
    this.hp -= actual;
    this.iframes = 0.5;
    // Hue-shift cloak trigger
    this._hueBoostTimer = 1.5;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.animState = 'death';
      this.animTimer = 0;
    }
    return actual;
  }

  chargeUltimate(amt) {
    this.ultimateCharge = Math.min(this.ultimateMax,
      this.ultimateCharge + amt * this._ultimateChargeBonus);
  }

  // ===== XP & LEVELING =====
  gainXP(amount) {
    this.xp += amount;
    let leveled = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this._levelUp();
      leveled = true;
    }
    return leveled;
  }

  _levelUp() {
    this.playerLevel++;
    // XP curve: each level needs ~18% more XP than previous
    this.xpToNext = Math.round(this.xpToNext * 1.18);

    // Stat bonuses per level
    this.maxHp += 8;
    this.hp = Math.min(this.hp + 15, this.maxHp); // partial heal on level up
    this.critChance = Math.min(0.4, this.critChance + 0.005);
    this.attackPower += 0.04;
    this.armor = Math.min(20, this.armor + 0.5);

    // Every 5 levels: weapon damage bonus
    if (this.playerLevel % 5 === 0 && this.weapon) {
      this.weapon.damage = Math.round(this.weapon.damage * 1.15);
    }

    this.levelUpTimer = 2.5; // used by HUD for flash effect
  }

  get effectiveSpeed() {
    let spd = SPEED;
    if (this._hueBoostTimer > 0) spd *= this._hueSpeedBoost;
    return spd;
  }

  get effectiveDamage() {
    let dmg = this.weapon ? this.weapon.damage : 10;
    dmg *= this.attackPower;
    // Gradient gloves combo
    if (this._gradientMax > 0) {
      dmg *= (1 + Math.min(this._gradientMax, this.comboCount * this._gradientStep));
    }
    return dmg;
  }

  get effectiveCrit() {
    return Math.min(0.9, this.critChance + (this.weapon ? this.weapon.critChance : 0));
  }

  rollCrit() { return Math.random() < this.effectiveCrit; }

  update(dt, level, particles, enemies) {
    if (this.dead) {
      this.deathTimer += dt;
      return;
    }

    this.iframes = Math.max(0, this.iframes - dt);
    this.levelUpTimer = Math.max(0, this.levelUpTimer - dt);
    this._hueBoostTimer = Math.max(0, this._hueBoostTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.specialTimer = Math.max(0, this.specialTimer - dt);
    this.comboResetTimer -= dt;
    if (this.comboResetTimer <= 0) { this.comboCount = 0; this.comboResetTimer = 0; }
    this.animTimer += dt;

    // Physics
    if (!this.isDashing) {
      this.vy += GRAVITY * dt;
      this.vy = Math.min(this.vy, MAX_FALL);
    }

    // Horizontal movement
    let moveX = 0;

    if (this._input) {
      if (this._input.left) { moveX = -1; this.facing = -1; }
      if (this._input.right) { moveX = 1; this.facing = 1; }
    }
    if (!this.isDashing) {
      this.vx = moveX * this.effectiveSpeed;
    }

    // Dash update
    if (this.isDashing) {
      this.dashTimer -= dt;
      this.vx = this.dashDir * 600;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
        this.vx = 0;
      }
    }

    // Move & collide horizontally
    this.x += this.vx * dt;
    this._resolveH(level);

    // Move & collide vertically
    this.y += this.vy * dt;
    this.onGround = false;
    this._resolveV(level);

    // Jump
    if (this._input && this._input.jump) {
      if (this.onGround) {
        this.vy = JUMP_FORCE;
        this.hasDoubleJumped = false;
      } else if (!this.hasDoubleJumped) {
        this.vy = DOUBLE_JUMP_FORCE;
        this.hasDoubleJumped = true;
        particles.paintSplash(this.x + this.w/2, this.y + this.h, '#4a9eff', 6);
      }
    }

    // Paint trails (brush weapon)
    if (this.weapon && this.weapon.type === 'brush' && (moveX !== 0 || this.isDashing)) {
      this.paintTrails.push({
        x: this.x + this.w/2, y: this.y + this.h,
        life: this.weapon.trailDuration, maxLife: this.weapon.trailDuration,
        color: '#4a9eff55',
      });
    }
    for (let i = this.paintTrails.length-1; i >= 0; i--) {
      this.paintTrails[i].life -= dt;
      if (this.paintTrails[i].life <= 0) this.paintTrails.splice(i, 1);
    }

    // Attack animation
    if (this.attackAnim > 0) {
      this.attackAnim -= dt * 6;
      if (this.attackAnim < 0) this.attackAnim = 0;
    }

    // Animation state
    if (!this.isDashing) {
      if (Math.abs(this.vx) > 10 && this.onGround) this.animState = 'run';
      else if (!this.onGround) this.animState = 'jump';
      else this.animState = 'idle';
    }
    if (this.attackAnim > 0.5) this.animState = 'attack';

    // pull with magic wand accessory
    if (this._input && this._input.attack && this._pullRadius > 0 && enemies) {
      for (const e of enemies) {
        const dx = (this.x+this.w/2) - (e.x+e.w/2);
        const dy = (this.y+this.h/2) - (e.y+e.h/2);
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < this._pullRadius && dist > 0) {
          e.vx += (dx/dist) * this._pullForce * dt;
          e.vy += (dy/dist) * this._pullForce * dt;
        }
      }
    }

    // Level bounds
    if (level) {
      this.x = Math.max(0, Math.min(this.x, level.pixelWidth - this.w));
      if (this.y > level.pixelHeight + 200) {
        this.takeDamage(999);
      }
    }
  }

  setInput(inp) { this._input = inp; }

  getAttackHitbox() {
    if (!this.weapon) return null;
    const cx = this.x + this.w/2;
    const cy = this.y + this.h/2;
    const r = this.weapon.range || 80;
    return {
      x: this.facing === 1 ? cx - 8 : cx - r,
      y: cy - r/2,
      w: r, h: r,
    };
  }

  _resolveH(level) {
    if (!level) return;
    const tiles = level.getSolidTilesNear(this.x, this.y, this.w, this.h);
    for (const t of tiles) {
      // Must overlap vertically to block horizontal movement
      const overlapY = this.y + this.h > t.y + 2 && this.y < t.y + TILE_SIZE - 2;
      if (!overlapY) continue;
      // Moving right — hit tile's left face
      if (this.vx > 0 && this.x + this.w > t.x && this.x < t.x) {
        this.x = t.x - this.w;
        this.vx = 0;
      }
      // Moving left — hit tile's right face
      if (this.vx < 0 && this.x < t.x + TILE_SIZE && this.x + this.w > t.x + TILE_SIZE) {
        this.x = t.x + TILE_SIZE;
        this.vx = 0;
      }
    }
  }

  _resolveV(level) {
    if (!level) return;
    const tiles = level.getSolidTilesNear(this.x, this.y, this.w, this.h);
    for (const t of tiles) {
      // Must overlap horizontally to resolve vertical collision
      const overlapX = this.x + this.w > t.x + 2 && this.x < t.x + TILE_SIZE - 2;
      if (!overlapX) continue;
      const bottom = this.y + this.h;
      const top = this.y;
      // Falling onto tile top surface
      if (this.vy >= 0 && bottom > t.y && bottom < t.y + TILE_SIZE * 0.6) {
        this.y = t.y - this.h;
        this.vy = 0;
        this.onGround = true;
        this.hasDoubleJumped = false;
      }
      // Hitting ceiling
      if (this.vy < 0 && top < t.y + TILE_SIZE && top > t.y + TILE_SIZE * 0.5) {
        this.y = t.y + TILE_SIZE;
        this.vy = 0;
      }
    }
  }

  draw(ctx, particles) {
    // Draw paint trails
    for (const trail of this.paintTrails) {
      const alpha = trail.life / trail.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = trail.color;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, 10, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Invincibility flicker
    if (this.iframes > 0 && Math.floor(this.iframes * 12) % 2 === 0) return;

    const cx = this.x + this.w/2;
    const cy = this.y + this.h/2;

    ctx.save();
    ctx.translate(cx, cy);
    if (this.facing === -1) ctx.scale(-1, 1);

    // Draw player based on species & avatar
    this._drawBody(ctx, particles);
    ctx.restore();

    // Attack hitbox flash
    if (this.attackAnim > 0.3) {
      const hb = this.getAttackHitbox();
      if (hb && this.weapon) {
        ctx.save();
        ctx.globalAlpha = this.attackAnim * 0.25;
        ctx.fillStyle = this.weapon.color;
        ctx.beginPath();
        if (this.weapon.type === WEAPON_TYPES.BRUSH) {
          ctx.arc(hb.x + hb.w/2, hb.y + hb.h/2, hb.w/2, 0, Math.PI*2);
        } else if (this.weapon.type === WEAPON_TYPES.ERASER) {
          ctx.roundRect(hb.x, hb.y, hb.w, hb.h, 4);
        } else {
          ctx.strokeStyle = this.weapon.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
        }
        ctx.fill();
        ctx.restore();
      }
    }
  }

  _drawBody(ctx, particles) {
    const s = this.avatar.species;
    // Skin tone colors
    const SKIN_TONES = [
      '#FDDBB4','#F5CBA7','#E8A87C','#C68642','#8D5524','#3B1F0E',
      '#7FFFD4','#98FB98','#DDA0DD','#87CEEB'
    ];
    const skin = SKIN_TONES[this.avatar.skinTone % SKIN_TONES.length];

    // Hair colors (from hair index)
    const HAIR_COLORS = ['#2C1B0E','#8B4513','#F4D03F','#FF6B6B','#9B59B6','#1ABC9C'];
    const hairColor = HAIR_COLORS[this.avatar.hair % HAIR_COLORS.length];

    // Clothes colors
    const CLOTHES_COLORS = ['#3498DB','#E74C3C','#2ECC71','#F39C12','#9B59B6'];
    const clothesColor = CLOTHES_COLORS[this.avatar.clothes % CLOTHES_COLORS.length];

    // Bob & squash based on state
    let scaleY = 1, scaleX = 1, bobY = 0;
    if (this.animState === 'run') {
      const t = this.animTimer * 10;
      bobY = Math.sin(t) * 3;
      scaleX = 1 + Math.abs(Math.sin(t)) * 0.05;
    }
    if (this.animState === 'jump') {
      scaleY = 1.15; scaleX = 0.88;
    }
    if (this.animState === 'attack') {
      scaleX = 1.2; scaleY = 0.9;
    }
    if (this.animState === 'death') {
      const t = Math.min(1, this.deathTimer / 0.6);
      scaleX = 1 + t * 0.5; scaleY = 1 - t * 0.8;
      bobY = t * 20;
      ctx.globalAlpha = Math.max(0, 1 - t);
    }

    ctx.scale(scaleX, scaleY);

    const hw = this.w/2, hh = this.h/2;
    const y0 = bobY;

    if (s === 'human') {
      // Body
      ctx.fillStyle = clothesColor;
      ctx.beginPath();
      ctx.roundRect(-hw+2, y0-hh+12, this.w-4, this.h-16, 4);
      ctx.fill();
      // Head
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, y0-hh+8, 11, 0, Math.PI*2);
      ctx.fill();
      // Hair
      ctx.fillStyle = hairColor;
      this._drawHair(ctx, y0-hh+8, this.avatar.hair);
      // Eyes
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(3, y0-hh+5, 3, 4);
      // Arms
      ctx.fillStyle = skin;
      ctx.fillRect(-hw-2, y0-hh+14, 5, 14);
      ctx.fillRect(hw-3, y0-hh+14, 5, 14);
      // Legs
      ctx.fillStyle = clothesColor;
      ctx.fillRect(-hw+4, y0+hh-12, 9, 12);
      ctx.fillRect(hw-13, y0+hh-12, 9, 12);
    } else if (s === 'dog') {
      // Body
      ctx.fillStyle = clothesColor;
      ctx.beginPath();
      ctx.roundRect(-hw+2, y0-hh+14, this.w-4, this.h-18, 4);
      ctx.fill();
      // Head (round dog face)
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, y0-hh+10, 13, 0, Math.PI*2);
      ctx.fill();
      // Ears
      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.ellipse(-9, y0-hh+2, 5, 8, -0.3, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(9, y0-hh+2, 5, 8, 0.3, 0, Math.PI*2);
      ctx.fill();
      // Snout
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(0, y0-hh+14, 6, 4, 0, 0, Math.PI*2);
      ctx.fill();
      // Nose
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, y0-hh+11, 2, 1.5, 0, 0, Math.PI*2);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-5, y0-hh+7, 3, 3);
      ctx.fillRect(2, y0-hh+7, 3, 3);
      // Legs
      ctx.fillStyle = skin;
      ctx.fillRect(-hw+4, y0+hh-12, 9, 12);
      ctx.fillRect(hw-13, y0+hh-12, 9, 12);
      // Tail
      ctx.strokeStyle = skin; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-hw, y0+hh-16);
      ctx.quadraticCurveTo(-hw-12, y0+hh-30, -hw-8, y0+hh-36);
      ctx.stroke();
    } else if (s === 'cat') {
      // Body
      ctx.fillStyle = clothesColor;
      ctx.beginPath();
      ctx.roundRect(-hw+2, y0-hh+14, this.w-4, this.h-18, 4);
      ctx.fill();
      // Head
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, y0-hh+10, 11, 0, Math.PI*2);
      ctx.fill();
      // Cat ears (triangles)
      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.moveTo(-10, y0-hh+2);
      ctx.lineTo(-6, y0-hh-8);
      ctx.lineTo(-2, y0-hh+2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(2, y0-hh+2);
      ctx.lineTo(6, y0-hh-8);
      ctx.lineTo(10, y0-hh+2);
      ctx.fill();
      // Eyes (cat - slanted)
      ctx.fillStyle = '#4a9eff';
      ctx.beginPath(); ctx.ellipse(-4, y0-hh+8, 3, 4, -0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, y0-hh+8, 3, 4, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.ellipse(-4, y0-hh+8, 1, 3, -0.3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, y0-hh+8, 1, 3, 0.3, 0, Math.PI*2); ctx.fill();
      // Whiskers
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2, y0-hh+13); ctx.lineTo(-14, y0-hh+11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, y0-hh+15); ctx.lineTo(-14, y0-hh+15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, y0-hh+13); ctx.lineTo(14, y0-hh+11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, y0-hh+15); ctx.lineTo(14, y0-hh+15); ctx.stroke();
      // Legs
      ctx.fillStyle = skin;
      ctx.fillRect(-hw+4, y0+hh-12, 9, 12);
      ctx.fillRect(hw-13, y0+hh-12, 9, 12);
      // Tail (curvy)
      ctx.strokeStyle = skin; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-hw+2, y0+hh-10);
      ctx.quadraticCurveTo(-hw-18, y0+hh-5, -hw-14, y0+hh-20);
      ctx.stroke();
    }

    // Weapon visual
    if (this.weapon) {
      this._drawWeapon(ctx, y0);
    }
  }

  _drawHair(ctx, headY, style) {
    ctx.save();
    ctx.translate(0, headY);
    switch (style % 5) {
      case 0: // Short
        ctx.beginPath(); ctx.arc(0, -4, 11, Math.PI, 0); ctx.fill(); break;
      case 1: // Spiky
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(i*4-2, 0);
          ctx.lineTo(i*4, -16 + Math.abs(i)*2);
          ctx.lineTo(i*4+2, 0);
          ctx.fill();
        }
        break;
      case 2: // Long
        ctx.beginPath();
        ctx.arc(0, -4, 11, Math.PI, 0); ctx.fill();
        ctx.fillRect(-11, -4, 5, 22);
        ctx.fillRect(6, -4, 5, 22);
        break;
      case 3: // Bob
        ctx.beginPath(); ctx.arc(0, -2, 11, Math.PI, 0); ctx.fill();
        ctx.fillRect(-11, -2, 22, 8);
        break;
      case 4: // Bun
        ctx.beginPath(); ctx.arc(0, -4, 10, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -15, 6, 0, Math.PI*2); ctx.fill();
        break;
    }
    ctx.restore();
  }

  _drawWeapon(ctx, y0) {
    const w = this.weapon;
    const armX = this.w/2 - 2, armY = y0 - this.h/2 + 16;
    const swing = this.attackAnim * (Math.PI / 1.5);
    ctx.save();
    ctx.translate(armX, armY);
    ctx.rotate(swing);

    if (w.type === 'brush') {
      // Brush handle
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, -3, 28, 6);
      // Bristles
      ctx.fillStyle = w.color;
      ctx.fillRect(24, -6, 10, 12);
      // Paint drop
      if (this.attackAnim > 0.4) {
        ctx.beginPath();
        ctx.arc(34, 6, 4, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (w.type === 'eraser') {
      // Eraser block
      ctx.fillStyle = '#F5A0B5';
      ctx.fillRect(0, -5, 28, 10);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(0, -5, 8, 10);
      // white eraser crumb
      if (this.attackAnim > 0.3) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(20 + i*3, -2 + i*1, 3, 2);
        }
      }
    } else if (w.type === 'transform') {
      // Transform cage handle
      ctx.strokeStyle = w.color; ctx.lineWidth = 2;
      ctx.strokeRect(0, -8, 16, 16);
      // corner handles
      ctx.fillStyle = w.color;
      [[-2,-2],[14,-2],[-2,14],[14,14]].forEach(([px,py]) => {
        ctx.fillRect(px, py, 4, 4);
      });
    }
    ctx.restore();
  }
}
