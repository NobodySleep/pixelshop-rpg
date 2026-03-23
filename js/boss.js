// ===== BOSS: "THE CREATIVE DIRECTOR" =====
import { TILE_SIZE } from './player.js';

const GRAVITY = 600;

export class Boss {
  constructor(x, y, levelPixelWidth) {
    this.x = x; this.y = y;
    this.startX = x;
    this.w = 80; this.h = 100;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.levelW = levelPixelWidth;

    // FIXED stats (not randomized)
    this.maxHp = 800;
    this.hp = this.maxHp;
    this.damage = 32;
    this.phase = 1;

    // Phase thresholds
    this.phase2HP = this.maxHp * 0.6;
    this.phase3HP = this.maxHp * 0.3;

    this.dead = false;
    this.deathTimer = 0;
    this.animTimer = 0;
    this.animState = 'idle'; // idle|move|attack|hurt|death

    // Attack system
    this.attackTimer = 0;
    this.attackCooldown = 2.2;
    this.hurtTimer = 0;
    this.iframes = 0;

    // Phase 2 shield
    this.shielded = false;
    this.shieldHP = 200;
    this.shieldMaxHP = 200;
    this.shieldActivated = false;

    // Active attacks
    this.beams = [];
    this.minions = [];
    this.stomping = false;
    this.stompTimer = 0;
    this.floorLava = false;
    this.lavaTimer = 0;

    // Direction
    this.facing = -1;

    this.grappled = false;
    this.grappleTimer = 0;

    // Entry animation
    this.entering = true;
    this.entryTimer = 2.0;
  }

  get alive() { return !this.dead; }
  get hpPercent() { return Math.max(0, this.hp / this.maxHp); }

  takeDamage(dmg, isUltimate = false) {
    if (this.dead || this.entering) return 0;
    if (this.iframes > 0) return 0;

    if (this.shielded) {
      // Only eraser special (armorShred) or ultimate can break shield
      this.shieldHP -= dmg * 0.5;
      if (this.shieldHP <= 0) {
        this.shielded = false;
        this.iframes = 0.5;
      }
      return Math.round(dmg * 0.5);
    }

    let actual = dmg;
    // Ultimate cap: 5-30% of CURRENT phase HP (calculated by caller using build)
    this.hp -= actual;
    this.hurtTimer = 0.2;
    this.iframes = 0.1;

    if (this.hp <= this.phase2HP && this.phase === 1) {
      this.phase = 2;
      this._enterPhase2();
    }
    if (this.hp <= this.phase3HP && this.phase === 2) {
      this.phase = 3;
      this._enterPhase3();
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.animState = 'death';
    }
    return actual;
  }

  _enterPhase2() {
    this.shielded = true;
    this.shieldHP = this.shieldMaxHP;
    this.shieldActivated = true;
    this.attackCooldown = 1.8;
  }

  _enterPhase3() {
    this.attackCooldown = 1.2;
    this.shielded = false;
    this.floorLava = true;
    this.lavaTimer = 5;
  }

  update(dt, level, player, particles) {
    this.animTimer += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);

    if (this.entering) {
      this.entryTimer -= dt;
      // Float down from above
      this.y = Math.max(this.startX, this.y - 60 * dt);
      if (this.entryTimer <= 0) {
        this.entering = false;
        particles.deathBurst(this.x + this.w/2, this.y + this.h/2, '#f7c948');
      }
      return;
    }

    if (this.dead) {
      this.deathTimer += dt;
      if (this.deathTimer < 1.5) {
        particles.deathBurst(
          this.x + Math.random()*this.w,
          this.y + Math.random()*this.h,
          ['#f7c948','#4a9eff','#fa7b17'][Math.floor(Math.random()*3)]
        );
      }
      return;
    }

    // Floor lava timer (phase 3)
    if (this.floorLava) {
      this.lavaTimer -= dt;
      if (this.lavaTimer <= 0) {
        this.floorLava = false;
        this.lavaTimer = 6; // next cycle
      }
    } else if (this.phase === 3) {
      this.lavaTimer -= dt;
      if (this.lavaTimer <= 0) {
        this.floorLava = true;
        this.lavaTimer = 4;
      }
    }

    // Physics
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    if (level) {
      const tiles = level.getSolidTilesNear(this.x, this.y, this.w, this.h);
      for (const t of tiles) {
        if (this.vy >= 0 && this.y + this.h > t.y && this.y < t.y) {
          this.y = t.y - this.h;
          this.vy = 0;
          this.onGround = true;
        }
      }
    }
    this.x += this.vx * dt;
    this.x = Math.max(level.pixelWidth * 0.7, Math.min(this.x, level.pixelWidth - this.w - TILE_SIZE));

    // Movement: oscillate
    if (!this.stomping) {
      const targetX = player ? player.x - 100 : this.startX;
      const dx = targetX - this.x;
      const speed = this.phase >= 3 ? 140 : this.phase >= 2 ? 110 : 80;
      this.vx += (dx * speed * dt * 0.05) - this.vx * dt * 3;
      this.facing = this.vx > 0 ? 1 : -1;
    }

    // Face player
    if (player) this.facing = player.x < this.x ? -1 : 1;

    // Attack AI
    if (this.attackTimer <= 0 && player && !player.dead) {
      this._chooseAttack(dt, player, level, particles);
    }

    // Stomp update
    if (this.stomping) {
      this.stompTimer -= dt;
      if (this.stompTimer <= 0) {
        this.stomping = false;
        if (player && this.onGround) {
          // Shockwave damage if player is on ground nearby
          const dx = Math.abs(player.x - this.x);
          if (dx < 200 && player.onGround) player.takeDamage(this.damage * 0.6);
          particles.paintSplash(this.x + this.w/2, this.y + this.h, '#e74c3c', 20);
        }
      }
    }

    // Update beams
    for (let i = this.beams.length-1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      if (b.life <= 0) { this.beams.splice(i,1); continue; }
      if (player && !player.dead && !player.iframes) {
        // Beam is a horizontal laser line
        const py = player.y + player.h - 10;
        if (Math.abs(py - b.y) < 20) {
          const px = player.x + player.w/2;
          if (px > b.startX - 10 && px < level.pixelWidth) {
            player.takeDamage(this.damage * 0.8);
          }
        }
      }
    }

    // Lava floor damage
    if (this.floorLava && player && !player.dead && !player.iframes) {
      if (player.onGround) player.takeDamage(this.damage * 0.3 * dt);
    }

    // Minion update
    for (let i = this.minions.length-1; i >= 0; i--) {
      this.minions[i].update(dt, level, player);
      if (!this.minions[i].alive && this.minions[i].deathTimer > 0.6) {
        this.minions.splice(i,1);
      }
    }

    // Grapple update
    if (this.grappled) {
      this.grappleTimer -= dt;
      this.vx = 0; this.vy = 0;
      if (this.grappleTimer <= 0) {
        this.grappled = false;
      }
    }
  }

  _chooseAttack(dt, player, level, particles) {
    this.attackTimer = this.attackCooldown;
    const r = Math.random();

    if (this.phase === 1) {
      if (r < 0.4) this._spawnMinions(level);
      else this._fireBeam(player, level);
    } else if (this.phase === 2) {
      if (r < 0.3) this._spawnMinions(level);
      else if (r < 0.6) this._fireBeam(player, level);
      else this._stomp(player);
    } else { // phase 3 enrage
      if (r < 0.2) this._spawnMinions(level);
      else if (r < 0.6) this._fireBeam(player, level);
      else this._stomp(player);
      // Extra beam volley
      if (Math.random() < 0.4) setTimeout(() => this._fireBeam(player, level), 600);
    }
  }

  _spawnMinions(level) {
    if (this.minions.length >= 4) return;
    const { createEnemy } = require ? null : null; // dynamic import handled in game
    this._pendingMinions = (this._pendingMinions || 0) + 2;
  }

  _fireBeam(player, level) {
    const y = player ? player.y + player.h - 5 : this.y + this.h - 10;
    this.beams.push({ startX: TILE_SIZE, y, life: 2.5, phase: this.phase });
    if (this.phase >= 3 && Math.random() < 0.5) {
      this.beams.push({ startX: TILE_SIZE, y: y - 60, life: 2.5, phase: this.phase });
    }
  }

  _stomp(player) {
    this.stomping = true;
    this.stompTimer = 0.6;
    this.vy = -400; // jump up
    this.vx = (player ? player.x - this.x : 0) * 0.5;
  }

  applyGrapple(duration) {
    this.grappled = true;
    this.grappleTimer = duration;
    this.vx = 0; this.vy = 0;
  }

  draw(ctx, particles) {
    if (this.dead && this.deathTimer > 2.0) return;

    // Draw beams first (world space, no transform)
    for (const b of this.beams) {
      const waveMag = b.phase >= 3 ? 12 : 6;
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life * 0.8);
      ctx.strokeStyle = b.phase >= 3 ? '#e74c3c' : '#fa7b17';
      ctx.lineWidth = b.phase >= 3 ? 8 : 5;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(b.startX, b.y);
      // Wavy beam
      for (let gx = b.startX; gx < 10000; gx += 20) {
        ctx.lineTo(gx, b.y + Math.sin(gx * 0.05 + this.animTimer * 3) * waveMag);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw lava floor
    if (this.floorLava) {
      ctx.save();
      const lavaAlpha = 0.4 + 0.2 * Math.sin(this.animTimer * 4);
      ctx.fillStyle = `rgba(231,76,60,${lavaAlpha})`;
      ctx.fillRect(0, 500, 20000, 200);
      ctx.restore();
    }

    // Draw minions
    for (const m of this.minions) m.draw(ctx);

    const cx = this.x + this.w/2;
    const cy = this.y + this.h/2;

    ctx.save();
    ctx.translate(cx, cy);
    if (this.facing === -1) ctx.scale(-1,1);

    if (this.dead) {
      const t = Math.min(1, this.deathTimer / 2.0);
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.rotate(t * Math.PI * 2);
      ctx.scale(1 + t, 1 + t);
    }
    if (this.hurtTimer > 0) ctx.globalAlpha = 0.5;

    const bob = Math.sin(this.animTimer * 2) * 5;

    // === BOSS BODY: Giant Photoshop Toolbar Creature ===
    // Main toolbar body
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(-this.w/2, -this.h/2 + bob, this.w, this.h);
    // Toolbar strip
    ctx.fillStyle = '#1473e6';
    ctx.fillRect(-this.w/2, -this.h/2 + bob, this.w, 18);
    // PS logo
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.fillText('Ps', 0, -this.h/2 + bob + 13);

    // Tool icons on body
    const tools = ['⬛','🖌️','⚡','🔍','✂️','🔲'];
    ctx.font = '12px Arial';
    tools.forEach((tool, i) => {
      const tx = -this.w/2 + 10 + (i%2)*20;
      const ty = -this.h/2 + 25 + Math.floor(i/2)*20 + bob;
      ctx.fillStyle = i===0 ? '#4a9eff' : '#3a3a3a';
      ctx.fillRect(tx, ty, 16, 16);
      ctx.fillText(tool, tx+8, ty+12);
    });

    // Arms (layer panels)
    const armSwing = Math.sin(this.animTimer * 1.5) * 0.3;
    ctx.fillStyle = '#3a3a3a';
    // Left arm
    ctx.save();
    ctx.translate(-this.w/2 - 5, bob);
    ctx.rotate(armSwing);
    ctx.fillRect(-20, -8, 20, 10);
    ctx.fillRect(-28, 2, 12, 28);
    ctx.restore();
    // Right arm
    ctx.save();
    ctx.translate(this.w/2 + 5, bob);
    ctx.rotate(-armSwing);
    ctx.fillRect(0, -8, 20, 10);
    ctx.fillRect(16, 2, 12, 28);
    ctx.restore();

    // Legs
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(-this.w/2 + 8, this.h/2 - 20 + bob, 14, 22);
    ctx.fillRect(this.w/2 - 22, this.h/2 - 20 + bob, 14, 22);

    // Eyes (layer thumbnails)
    ctx.fillStyle = '#fff';
    ctx.fillRect(-18, bob - 4, 14, 14);
    ctx.fillRect(4, bob - 4, 14, 14);
    // Pupils (angry slant)
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-16, bob + 1, 10, 8);
    ctx.fillRect(6, bob + 1, 10, 8);

    // Phase 2 shield
    if (this.shielded) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#4a9eff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, bob, this.w * 0.75, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
      // Shield HP indicator dots
      const dots = Math.ceil((this.shieldHP / this.shieldMaxHP) * 8);
      for (let d = 0; d < 8; d++) {
        const angle = (d/8) * Math.PI*2 - Math.PI/2;
        const r = this.w * 0.75;
        ctx.fillStyle = d < dots ? '#4a9eff' : '#333';
        ctx.beginPath();
        ctx.arc(Math.cos(angle)*r, bob + Math.sin(angle)*r, 5, 0, Math.PI*2);
        ctx.fill();
      }
    }

    // Phase 3 rage effect
    if (this.phase >= 3) {
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.1 * Math.sin(this.animTimer * 10);
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(0, bob, this.w * 0.6, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // HP bar (prominent at top of screen rendered in UI)
  }
}
