// ===== PARTICLE SYSTEM =====

export class ParticleSystem {
  constructor() { this.particles = []; }

  spawn(opts) {
    // opts: x, y, vx, vy, color, size, life, gravity, fade, grow
    this.particles.push({
      x: opts.x, y: opts.y,
      vx: opts.vx ?? 0, vy: opts.vy ?? -2,
      color: opts.color ?? '#fff',
      size: opts.size ?? 4,
      life: opts.life ?? 0.8,
      maxLife: opts.life ?? 0.8,
      gravity: opts.gravity ?? 200,
      fade: opts.fade ?? true,
      grow: opts.grow ?? false,
      shape: opts.shape ?? 'circle', // 'circle' | 'square' | 'text'
      text: opts.text ?? '',
      rotation: opts.rotation ?? 0,
      rotSpeed: opts.rotSpeed ?? 0,
    });
  }

  paintSplash(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 180;
      this.spawn({
        x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd - 50,
        color, size: 3 + Math.random()*5, life: 0.5 + Math.random()*0.4,
        gravity: 300, shape: 'circle',
      });
    }
  }

  erasePuff(x, y) {
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 100;
      this.spawn({
        x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
        color: `rgba(255,255,255,${0.3+Math.random()*0.5})`,
        size: 6 + Math.random()*10, life: 0.4 + Math.random()*0.3,
        gravity: 0, shape: 'square', rotation: Math.random()*Math.PI,
        rotSpeed: (Math.random()-0.5)*4,
      });
    }
  }

  transformFlash(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 120;
      this.spawn({
        x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
        color: '#4a9eff', size: 4 + Math.random()*6, life: 0.3 + Math.random()*0.3,
        gravity: 0, shape: 'square', rotation: Math.random()*Math.PI,
        rotSpeed: (Math.random()-0.5)*6,
      });
    }
  }

  damageNumber(x, y, dmg, crit = false) {
    this.spawn({
      x, y, vx: (Math.random()-0.5)*30, vy: -120 - Math.random()*40,
      color: crit ? '#f7c948' : '#ff6b6b',
      size: crit ? 20 : 14,
      life: 1.0, gravity: 60, shape: 'text',
      text: crit ? `${dmg}!` : `${dmg}`, fade: true,
    });
  }

  healNumber(x, y, amt) {
    this.spawn({
      x, y, vx: (Math.random()-0.5)*20, vy: -100,
      color: '#2dc937', size: 14, life: 1.0, gravity: 40,
      shape: 'text', text: `+${amt}`, fade: true,
    });
  }

  deathBurst(x, y, color) {
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 220;
      this.spawn({
        x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd - 80,
        color, size: 4 + Math.random()*8, life: 0.7 + Math.random()*0.5,
        gravity: 400, shape: Math.random()>0.5?'circle':'square',
        rotation: Math.random()*Math.PI, rotSpeed: (Math.random()-0.5)*5,
      });
    }
  }

  ultimateEffect(cx, cy, radius) {
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);
      const spd = 50 + Math.random() * 100;
      this.spawn({
        x: cx + Math.cos(angle)*r*0.3, y: cy + Math.sin(angle)*r*0.3,
        vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
        color: i%3===0 ? '#4a9eff' : i%3===1 ? '#fa7b17' : '#fff',
        size: 5 + Math.random()*8, life: 0.8 + Math.random()*0.5,
        gravity: 80, shape: 'circle',
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length-1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= (1 - dt * 2);
      p.life -= dt;
      p.rotation += p.rotSpeed * dt;
      if (p.life <= 0) { this.particles.splice(i, 1); }
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = p.fade ? Math.max(0, p.life / p.maxLife) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.shape === 'text') {
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px "Space Grotesk"`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.shape === 'square') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size/2, 0, Math.PI*2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
