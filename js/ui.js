// ===== UI SYSTEM =====
// Handles HUD, menus, chest overlay, all screens

export class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = canvas.width;
    this.H = canvas.height;
    this.chestOpen = null;     // null | {loot: [], onSelect: fn}
    this.notification = null;  // {msg, timer}
    this.hoveredBtn = null;
  }

  resize(w, h) { this.W = w; this.H = h; }

  notify(msg, duration = 2.5) {
    this.notification = { msg, timer: duration };
  }

  updateNotification(dt) {
    if (this.notification) {
      this.notification.timer -= dt;
      if (this.notification.timer <= 0) this.notification = null;
    }
  }

  // ===== HUD =====
  drawHUD(ctx, player, levelIndex, boss) {
    const W = this.W, H = this.H;
    const LEVEL_NAMES = ['Level 1: Collage', 'Level 2: Photo Composite', 'Level 3: Poster Making'];
    const LEVEL_COLORS = ['#d4a857', '#16a085', '#e74c3c'];
    const lcolor = LEVEL_COLORS[levelIndex] || '#fff';

    // Background panel
    ctx.save();
    ctx.fillStyle = 'rgba(20,20,25,0.85)';
    roundRect(ctx, 10, 10, 300, 80, 8);
    ctx.fill();
    ctx.strokeStyle = lcolor;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 10, 10, 300, 80, 8);
    ctx.stroke();

    // HP Bar
    ctx.fillStyle = '#3a3a3a';
    roundRect(ctx, 22, 20, 200, 16, 4);
    ctx.fill();
    const hpFrac = Math.max(0, player.hp / player.maxHp);
    const hpColor = hpFrac > 0.5 ? '#2dc937' : hpFrac > 0.25 ? '#f7c948' : '#e34850';
    ctx.fillStyle = hpColor;
    roundRect(ctx, 22, 20, 200 * hpFrac, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp} HP`, 122, 28);

    // HP icon
    ctx.font = '12px Arial';
    ctx.fillText('❤️', 12, 28);

    // Ultimate Bar
    ctx.fillStyle = '#3a3a3a';
    roundRect(ctx, 22, 42, 200, 10, 3);
    ctx.fill();
    const ultFrac = player.ultimateCharge / player.ultimateMax;
    const ultGrd = ctx.createLinearGradient(22, 0, 222, 0);
    ultGrd.addColorStop(0, '#4a9eff');
    ultGrd.addColorStop(1, '#fa7b17');
    ctx.fillStyle = ultFrac >= 1 ? ultGrd : '#4a9eff77';
    roundRect(ctx, 22, 42, 200 * ultFrac, 10, 3);
    ctx.fill();
    if (ultFrac >= 1) {
      ctx.shadowColor = '#4a9eff';
      ctx.shadowBlur = 8;
      roundRect(ctx, 22, 42, 200, 10, 3);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = ultFrac >= 1 ? '#f7c948' : '#8a8a8a';
    ctx.font = 'bold 9px Inter';
    ctx.textAlign = 'left';
    ctx.fillText(ultFrac >= 1 ? '[E] EXPORT ALL — READY!' : `[E] Export All ${Math.floor(ultFrac*100)}%`, 22, 60);

    // Weapon icon
    if (player.weapon) {
      const w = player.weapon;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.arc(260, 32, 18, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(w.icon, 260, 32);
      // Bonus count dots
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = b < w.bonuses.length ? w.color : '#3a3a3a';
        ctx.beginPath();
        ctx.arc(244 + b*12, 56, 4, 0, Math.PI*2);
        ctx.fill();
      }
    }

    // Gear & Accessory slot icons
    const slots = [...(player.gear || []), ...(player.accessories || [])];
    const GEAR_ICONS = { layer_mask:'🛡️', smart_object:'⚡', blend_mode:'🌀', hue_shift:'🎨',
                         magic_wand:'💍', clone_stamp:'📿', gradient_gloves:'🧤', eyedropper:'💧' };
    slots.forEach((item, i) => {
      const gx = W - 60 - i * 38, gy = 14;
      ctx.fillStyle = 'rgba(20,20,25,0.85)';
      roundRect(ctx, gx, gy, 32, 32, 6);
      ctx.fill();
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 1;
      roundRect(ctx, gx, gy, 32, 32, 6);
      ctx.stroke();
      ctx.font = '18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GEAR_ICONS[item.id] || '?', gx+16, gy+16);
      if (item.stacks > 1) {
        ctx.fillStyle = '#f7c948';
        ctx.font = 'bold 9px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(`×${item.stacks}`, gx+30, gy+28);
      }
    });

    // Level name (top center)
    ctx.fillStyle = 'rgba(20,20,25,0.7)';
    ctx.textAlign = 'center';
    roundRect(ctx, W/2-80, 10, 160, 24, 6);
    ctx.fill();
    ctx.fillStyle = lcolor;
    ctx.font = 'bold 11px "Space Grotesk"';
    ctx.textBaseline = 'middle';
    ctx.fillText(LEVEL_NAMES[levelIndex] || 'Unknown', W/2, 22);

    // Controls hint (small)
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '9px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('WASD/↑↓←→ Move  Space Jump  F Interact  E Ultimate  Click Attack', 10, H-10);

    // Boss HP bar
    if (boss && boss.alive) {
      this.drawBossHPBar(ctx, boss, W, H);
    }

    // Notification
    if (this.notification) {
      const alpha = Math.min(1, this.notification.timer * 2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(20,20,25,0.9)';
      roundRect(ctx, W/2 - 200, H * 0.35, 400, 40, 8);
      ctx.fill();
      ctx.fillStyle = '#f7c948';
      ctx.font = 'bold 14px "Space Grotesk"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.notification.msg, W/2, H*0.35 + 20);
      ctx.restore();
    }

    ctx.restore();
  }

  drawBossHPBar(ctx, boss, W, H) {
    ctx.save();
    const bw = W * 0.55, bh = 20;
    const bx = W/2 - bw/2, by = H - 45;

    ctx.fillStyle = 'rgba(20,20,25,0.9)';
    roundRect(ctx, bx-10, by-8, bw+20, bh+30, 8);
    ctx.fill();
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx-10, by-8, bw+20, bh+30, 8);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 10px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.fillText('⚠  THE CREATIVE DIRECTOR', W/2, by-1);

    // Phase indicator
    const phases = ['■ PHASE 1','■ PHASE 2','■■ ENRAGE'];
    ctx.fillStyle = ['#f7c948','#fa7b17','#e34850'][boss.phase - 1];
    ctx.font = 'bold 9px Inter';
    ctx.fillText(phases[boss.phase-1], W/2 + bw/2 - 30, by-1);

    // HP bar BG
    ctx.fillStyle = '#3a3a3a';
    roundRect(ctx, bx, by+4, bw, bh, 4);
    ctx.fill();
    // HP fill
    const hpFrac = boss.hpPercent;
    const bossGrd = ctx.createLinearGradient(bx, 0, bx+bw, 0);
    bossGrd.addColorStop(0, '#9b59b6');
    bossGrd.addColorStop(0.4, '#e74c3c');
    bossGrd.addColorStop(1, '#fa7b17');
    ctx.fillStyle = bossGrd;
    roundRect(ctx, bx, by+4, bw * hpFrac, bh, 4);
    ctx.fill();
    // Phase markers
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    [0.6, 0.3].forEach(pct => {
      const px = bx + bw * pct;
      ctx.beginPath(); ctx.moveTo(px, by+2); ctx.lineTo(px, by+bh+4); ctx.stroke();
    });
    // Shield bar
    if (boss.shielded) {
      ctx.fillStyle = '#4a9eff55';
      roundRect(ctx, bx, by+4, bw * (boss.shieldHP / boss.shieldMaxHP), bh, 4);
      ctx.fill();
      ctx.fillStyle = '#4a9eff';
      ctx.font = 'bold 9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('🛡 SHIELD', W/2, by + bh*0.5 + 8);
    }
    ctx.restore();
  }

  // ===== CHEST SELECTION UI =====
  openChest(lootOptions, onSelect) {
    this.chestOpen = { loot: lootOptions, onSelect };
  }

  closeChest() { this.chestOpen = null; }

  drawChestUI(ctx, W, H, mouse) {
    if (!this.chestOpen) return false;
    const loot = this.chestOpen.loot;
    // Backdrop
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);

    // Panel
    const panelW = Math.min(W - 40, 700);
    const panelH = 420;
    const px = W/2 - panelW/2, py = H/2 - panelH/2;
    ctx.fillStyle = '#1a1a22';
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.fill();
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth = 2;
    roundRect(ctx, px, py, panelW, panelH, 16);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#f7c948';
    ctx.font = 'bold 20px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('📦 Chest Opened — Choose One', W/2, py + 18);

    ctx.fillStyle = '#8a8a8a';
    ctx.font = '11px Inter';
    ctx.fillText('(F or Click to select)', W/2, py + 46);

    // Loot cards
    const cardW = (panelW - 60) / loot.length;
    const cardH = 280;
    const cardY = py + 70;
    const RARITY_COLORS = { common: '#8a8a8a', uncommon: '#2dc937', rare: '#4a9eff', epic: '#c678dd' };

    for (let i = 0; i < loot.length; i++) {
      const item = loot[i];
      const cx = px + 20 + i * (cardW + 10);
      const isHovered = mouse.x > cx && mouse.x < cx + cardW - 10 &&
                        mouse.y > cardY && mouse.y < cardY + cardH;
      const rarityColor = RARITY_COLORS[item.rarity] || '#fff';

      // Card BG
      ctx.fillStyle = isHovered ? '#252530' : '#1e1e2a';
      roundRect(ctx, cx, cardY, cardW-10, cardH, 12);
      ctx.fill();
      ctx.strokeStyle = isHovered ? item.color : '#3a3a52';
      ctx.lineWidth = isHovered ? 2.5 : 1.5;
      roundRect(ctx, cx, cardY, cardW-10, cardH, 12);
      ctx.stroke();

      // Rarity bar
      ctx.fillStyle = rarityColor;
      roundRect(ctx, cx, cardY, cardW-10, 4, [12, 12, 0, 0]);
      ctx.fill();

      // Icon circle
      ctx.fillStyle = item.color + '33';
      ctx.beginPath();
      ctx.arc(cx + (cardW-10)/2, cardY + 60, 38, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + (cardW-10)/2, cardY + 60, 38, 0, Math.PI*2);
      ctx.stroke();
      ctx.font = '36px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(item.icon, cx + (cardW-10)/2, cardY + 60);

      // Name
      ctx.fillStyle = '#fff';
      ctx.font = `bold 13px "Space Grotesk"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(item.name, cx + (cardW-10)/2, cardY + 108);

      // Rarity label
      ctx.fillStyle = rarityColor;
      ctx.font = '10px Inter';
      ctx.fillText((item.rarity || 'common').toUpperCase(), cx + (cardW-10)/2, cardY + 128);

      // Slot
      ctx.fillStyle = '#8a8a8a';
      ctx.font = '10px Inter';
      ctx.fillText(item.slot.toUpperCase(), cx + (cardW-10)/2, cardY + 142);

      // Description
      ctx.fillStyle = '#c0c0c0';
      ctx.font = '11px Inter';
      const words = item.desc.split(' ');
      let line = '', lineY = cardY + 160;
      for (const word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > cardW - 30 && line !== '') {
          ctx.fillText(line.trim(), cx + (cardW-10)/2, lineY);
          line = word + ' '; lineY += 15;
        } else { line = test; }
      }
      if (line) ctx.fillText(line.trim(), cx + (cardW-10)/2, lineY);

      // Select button
      ctx.fillStyle = isHovered ? item.color : '#2a2a35';
      roundRect(ctx, cx+10, cardY + cardH - 44, cardW-30, 34, 8);
      ctx.fill();
      ctx.fillStyle = isHovered ? '#fff' : '#8a8a8a';
      ctx.font = 'bold 12px "Space Grotesk"';
      ctx.textBaseline = 'middle';
      ctx.fillText('SELECT', cx + (cardW-10)/2, cardY + cardH - 27);

      // Click to select
      if (mouse.clicked && isHovered) {
        this.chestOpen.onSelect(item);
        this.closeChest();
      }
    }
    ctx.restore();
    return true;
  }

  // ===== START SCREEN =====
  drawStartScreen(ctx, W, H, state, mouse, time) {
    ctx.save();

    // Animated background
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#0d0d14');
    grd.addColorStop(0.5, '#1a1a2e');
    grd.addColorStop(1, '#0d0d14');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Floating PS toolbar icons in background
    const iconData = [
      { x: 0.1, y: 0.2, icon: '🖌️', size: 40, speed: 0.7 },
      { x: 0.85, y: 0.35, icon: '⬜', size: 35, speed: 0.9 },
      { x: 0.2, y: 0.75, icon: '⬛', size: 30, speed: 0.6 },
      { x: 0.75, y: 0.15, icon: '🔍', size: 28, speed: 1.1 },
      { x: 0.5, y: 0.85, icon: '✂️', size: 32, speed: 0.8 },
      { x: 0.35, y: 0.45, icon: '🎨', size: 24, speed: 1.3 },
      { x: 0.65, y: 0.65, icon: '💧', size: 26, speed: 0.75 },
    ];
    for (const ic of iconData) {
      const iy = (ic.y + Math.sin(time * ic.speed) * 0.04) * H;
      ctx.globalAlpha = 0.08 + Math.abs(Math.sin(time * ic.speed * 0.5)) * 0.05;
      ctx.font = `${ic.size}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ic.icon, ic.x * W, iy);
    }
    ctx.globalAlpha = 1;

    // Grid overlay
    ctx.strokeStyle = 'rgba(74,158,255,0.04)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 60) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 60) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // Title area
    const titleY = H * 0.22;

    // Glow behind title
    ctx.save();
    ctx.globalAlpha = 0.15 + 0.05 * Math.sin(time * 2);
    ctx.shadowColor = '#4a9eff';
    ctx.shadowBlur = 80;
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.arc(W/2, titleY, 120, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // "Ps" logo emblem
    ctx.fillStyle = '#1473e6';
    roundRect(ctx, W/2 - 32, titleY - 46, 64, 64, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Ps', W/2, titleY - 14);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.min(72, W/10)}px "Space Grotesk"`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('PixelShop', W/2, titleY + 65);

    // Tagline
    ctx.fillStyle = '#4a9eff';
    ctx.font = `500 ${Math.min(18, W/40)}px "Space Grotesk"`;
    ctx.fillText('A Rogue-like RPG  ·  Three Levels  ·  Infinite Builds', W/2, titleY + 92);

    // Subtitle breadcrumb
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '12px Inter';
    ctx.fillText('Ctrl+Z is not available here.', W/2, titleY + 112);

    // Buttons
    const btnW = Math.min(220, W * 0.35), btnH = 52;
    const btnX = W/2 - btnW/2;
    const buttons = [
      { id: 'start', label: '▶  Start Game', y: H * 0.56, primary: true },
      { id: 'avatar', label: '👤  Customize Avatar', y: H * 0.56 + 66 },
    ];

    for (const btn of buttons) {
      const hov = mouse.x > btnX && mouse.x < btnX + btnW &&
                  mouse.y > btn.y && mouse.y < btn.y + btnH;
      ctx.save();
      if (btn.primary) {
        const g = ctx.createLinearGradient(btnX, btn.y, btnX+btnW, btn.y+btnH);
        g.addColorStop(0, hov ? '#1473e6' : '#1060c0');
        g.addColorStop(1, hov ? '#4a9eff' : '#1473e6');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = hov ? '#252530' : '#1a1a22';
      }
      roundRect(ctx, btnX, btn.y, btnW, btnH, 12);
      ctx.fill();
      ctx.strokeStyle = btn.primary ? (hov ? '#fff' : '#4a9eff') : '#3a3a52';
      ctx.lineWidth = hov ? 2 : 1.5;
      roundRect(ctx, btnX, btn.y, btnW, btnH, 12);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold 15px "Space Grotesk"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, W/2, btn.y + btnH/2);
      ctx.restore();
      if (mouse.clicked && hov) btn._pressed = true;
    }

    // Volume control
    const volY = H * 0.56 + 66 + 66;
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(`🔊 Volume`, W/2, volY - 2);
    const volBarX = W/2 - 80, volBarW = 160, volBarH = 8, volBarY = volY + 10;
    ctx.fillStyle = '#2a2a35';
    roundRect(ctx, volBarX, volBarY, volBarW, volBarH, 4);
    ctx.fill();
    ctx.fillStyle = '#4a9eff';
    roundRect(ctx, volBarX, volBarY, volBarW * state.volume, volBarH, 4);
    ctx.fill();
    // Knob
    const knobX = volBarX + volBarW * state.volume;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(knobX, volBarY + volBarH/2, 9, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 2;
    ctx.stroke();

    // Version / footer
    ctx.fillStyle = '#3a3a52';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('v1.0 · Built with ♥ and Layer Masks', W/2, H - 14);

    ctx.restore();

    return {
      startBtn: buttons[0],
      avatarBtn: buttons[1],
      volBar: { x: volBarX, y: volBarY, w: volBarW, h: volBarH },
      btnW, btnH, btnX,
    };
  }

  // ===== CHARACTER CUSTOMIZER =====
  drawCharacterScreen(ctx, W, H, avatar, mouse) {
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#0d0d14');
    grd.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Panel
    const panelW = Math.min(720, W - 40), panelH = Math.min(540, H - 40);
    const px = W/2 - panelW/2, py = H/2 - panelH/2;
    ctx.fillStyle = '#1a1a22';
    roundRect(ctx, px, py, panelW, panelH, 16); ctx.fill();
    ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 2;
    roundRect(ctx, px, py, panelW, panelH, 16); ctx.stroke();

    // Title
    ctx.fillStyle = '#4a9eff';
    ctx.font = 'bold 20px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('👤 Customize Avatar', W/2, py + 18);

    // Sections
    const SKIN_TONES = ['#FDDBB4','#F5CBA7','#E8A87C','#C68642','#8D5524','#3B1F0E','#7FFFD4','#98FB98','#DDA0DD','#87CEEB'];
    const HAIR_NAMES = ['Short','Spiky','Long','Bob','Bun'];
    const CLOTHES_NAMES = ['Blue','Red','Green','Yellow','Purple'];
    const SPECIES_NAMES = ['human','dog','cat'];

    const sections = [
      { label: 'Species', key: 'species', items: SPECIES_NAMES, isText: true },
      { label: 'Skin Tone', key: 'skinTone', items: SKIN_TONES, isColor: true },
      { label: 'Hair Style', key: 'hair', items: HAIR_NAMES, isText: true },
      { label: 'Clothes', key: 'clothes', items: CLOTHES_NAMES, isText: true },
    ];

    const sectionY = py + 60;
    const sectionH = (panelH - 120) / sections.length;

    const clicks = [];

    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const sy = sectionY + si * sectionH;
      ctx.fillStyle = '#8a8a8a';
      ctx.font = 'bold 11px "Space Grotesk"';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(sec.label, px + 20, sy + 8);

      const currentVal = sec.key === 'species'
        ? SPECIES_NAMES.indexOf(avatar.species) : avatar[sec.key];

      const itemW = sec.isColor ? 32 : Math.min(80, (panelW - 60) / sec.items.length);
      const itemH = 32;
      const startX = px + 130;

      for (let ii = 0; ii < sec.items.length; ii++) {
        const item = sec.items[ii];
        const ix = startX + ii * (itemW + 6);
        const iy = sy + 4;
        const isSelected = ii === currentVal;
        const hov = mouse.x > ix && mouse.x < ix + itemW && mouse.y > iy && mouse.y < iy + itemH;

        if (sec.isColor) {
          ctx.fillStyle = isSelected ? '#fff' : (hov ? '#ccc' : '#555');
          roundRect(ctx, ix-2, iy-2, itemW+4, itemH+4, 8); ctx.fill();
          ctx.fillStyle = item;
          roundRect(ctx, ix, iy, itemW, itemH, 6); ctx.fill();
          if (isSelected) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('✓', ix+itemW/2, iy+itemH/2);
          }
        } else {
          ctx.fillStyle = isSelected ? '#4a9eff' : (hov ? '#252530' : '#1e1e2a');
          roundRect(ctx, ix, iy, itemW, itemH, 8); ctx.fill();
          ctx.strokeStyle = isSelected ? '#4a9eff' : '#3a3a52';
          ctx.lineWidth = isSelected ? 2 : 1;
          roundRect(ctx, ix, iy, itemW, itemH, 8); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `${isSelected ? 'bold' : '400'} 11px Inter`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(typeof item === 'string' ? item.charAt(0).toUpperCase() + item.slice(1) : item,
                       ix + itemW/2, iy + itemH/2);
        }

        if (mouse.clicked && hov) {
          clicks.push({ key: sec.key, value: ii, species: sec.items[ii] });
        }
      }
    }

    // Back button
    const backW = 120, backH = 44;
    const backX = px + 20, backY = py + panelH - 60;
    const backHov = mouse.x > backX && mouse.x < backX+backW && mouse.y > backY && mouse.y < backY+backH;
    ctx.fillStyle = backHov ? '#252530' : '#1a1a22';
    roundRect(ctx, backX, backY, backW, backH, 10); ctx.fill();
    ctx.strokeStyle = '#3a3a52'; ctx.lineWidth = 1.5;
    roundRect(ctx, backX, backY, backW, backH, 10); ctx.stroke();
    ctx.fillStyle = '#8a8a8a';
    ctx.font = 'bold 13px "Space Grotesk"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('← Back', backX + backW/2, backY + backH/2);

    // Confirm button
    const confW = 160, confH = 44;
    const confX = px + panelW - confW - 20, confY = py + panelH - 60;
    const confHov = mouse.x > confX && mouse.x < confX+confW && mouse.y > confY && mouse.y < confY+confH;
    const cg = ctx.createLinearGradient(confX, confY, confX+confW, confY);
    cg.addColorStop(0, confHov ? '#1473e6' : '#1060c0');
    cg.addColorStop(1, confHov ? '#4a9eff' : '#1473e6');
    ctx.fillStyle = cg;
    roundRect(ctx, confX, confY, confW, confH, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Space Grotesk"';
    ctx.fillText('✓ Confirm', confX + confW/2, confY + confH/2);

    ctx.restore();
    return { clicks, backPressed: mouse.clicked && backHov, confirmPressed: mouse.clicked && confHov };
  }

  // ===== WEAPON SELECT SCREEN =====
  drawWeaponSelectScreen(ctx, W, H, weapons, gear, accessories, mouse) {
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#0d0d14');
    grd.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#f7c948';
    ctx.font = 'bold 22px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.fillText('⚔  Choose Your Starting Weapon', W/2, 60);
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '12px Inter';
    ctx.fillText('You also receive 1 gear and 1 accessory automatically.', W/2, 84);

    const cardW = 200, cardH = 320, gap = 40;
    const totalW = weapons.length * cardW + (weapons.length-1)*gap;
    const startX = W/2 - totalW/2;
    const cardY = 110;

    const selected = [];

    for (let i = 0; i < weapons.length; i++) {
      const w = weapons[i];
      const cx = startX + i*(cardW+gap);
      const hov = mouse.x > cx && mouse.x < cx+cardW && mouse.y > cardY && mouse.y < cardY+cardH;
      const isSelected = w._selected;

      ctx.fillStyle = isSelected ? '#1e2a3d' : (hov ? '#1d1d28' : '#141420');
      roundRect(ctx, cx, cardY, cardW, cardH, 14); ctx.fill();
      ctx.strokeStyle = isSelected ? '#4a9eff' : (hov ? '#555' : '#2a2a35');
      ctx.lineWidth = isSelected ? 3 : 1.5;
      roundRect(ctx, cx, cardY, cardW, cardH, 14); ctx.stroke();

      // Weapon color top bar
      ctx.fillStyle = w.color;
      roundRect(ctx, cx, cardY, cardW, 5, [14,14,0,0]); ctx.fill();

      // Icon
      ctx.fillStyle = w.color + '33';
      ctx.beginPath(); ctx.arc(cx+cardW/2, cardY+65, 42, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = w.color; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '40px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(w.icon, cx+cardW/2, cardY+65);

      // Name
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px "Space Grotesk"';
      ctx.textBaseline = 'top';
      ctx.fillText(w.name, cx+cardW/2, cardY+118);

      // Bonus stars
      ctx.fillStyle = '#f7c948';
      ctx.font = '11px Inter';
      ctx.fillText('★'.repeat(w.bonuses.length) + '☆'.repeat(4-w.bonuses.length), cx+cardW/2, cardY+140);

      // Bonus labels
      ctx.fillStyle = '#8a8a8a';
      ctx.font = '10px Inter';
      w.bonusLabels.forEach((bl, bi) => {
        ctx.fillText(bl, cx+cardW/2, cardY + 158 + bi*14);
      });

      // Desc
      const descLines = w.type === 'brush' ? ['Wide paint arc. Leaves DoT trails.','Special: Splatter Burst AoE'] :
                        w.type === 'eraser' ? ['Short cone + knockback.','Special: Wipe — dash through foes'] :
                        ['Ranged cage. Resizes enemies.','Special: Free Transform grapple'];
      ctx.fillStyle = '#c0c0c0';
      ctx.font = '10px Inter';
      descLines.forEach((dl, di) => {
        ctx.fillText(dl, cx+cardW/2, cardY+220+di*14);
      });

      // Select btn
      ctx.fillStyle = isSelected ? '#4a9eff' : (hov ? '#252530' : '#1a1a22');
      roundRect(ctx, cx+20, cardY+cardH-48, cardW-40, 36, 8); ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : '#3a3a52';
      ctx.lineWidth = 1.5;
      roundRect(ctx, cx+20, cardY+cardH-48, cardW-40, 36, 8); ctx.stroke();
      ctx.fillStyle = isSelected ? '#fff' : '#8a8a8a';
      ctx.font = 'bold 12px "Space Grotesk"';
      ctx.textBaseline = 'middle';
      ctx.fillText(isSelected ? '✓ SELECTED' : 'SELECT', cx+cardW/2, cardY+cardH-30);

      if (mouse.clicked && hov) selected.push(i);
    }

    // Starting gear/accessory display
    const bonusY = cardY + cardH + 40;
    ctx.fillStyle = '#8a8a8a';
    ctx.font = 'bold 12px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.fillText('Your Starting Gear & Accessory:', W/2, bonusY);

    const bonusItems = [...gear, ...accessories];
    bonusItems.forEach((item, bi) => {
      const bx = W/2 - 110 + bi*120, by = bonusY + 18;
      ctx.fillStyle = '#1a1a22';
      roundRect(ctx, bx, by, 100, 70, 10); ctx.fill();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx, by, 100, 70, 10); ctx.stroke();
      ctx.font = '28px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(item.icon, bx+50, by+25);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Inter';
      ctx.textBaseline = 'top';
      ctx.fillText(item.name, bx+50, by+46);
    });

    // Confirm btn (only if weapon selected)
    const weaponSelected = weapons.some(w => w._selected);
    const confW = 200, confH = 48;
    const confX = W/2-confW/2, confY = H-80;
    const confHov = weaponSelected && mouse.x > confX && mouse.x < confX+confW &&
                    mouse.y > confY && mouse.y < confY+confH;
    ctx.globalAlpha = weaponSelected ? 1 : 0.4;
    const cg = ctx.createLinearGradient(confX, confY, confX+confW, confY);
    cg.addColorStop(0, confHov ? '#2dc937' : '#1a7a22');
    cg.addColorStop(1, confHov ? '#1abc9c' : '#0e5c2e');
    ctx.fillStyle = weaponSelected ? cg : '#1a1a22';
    roundRect(ctx, confX, confY, confW, confH, 12); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Space Grotesk"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(weaponSelected ? '▶ Begin Adventure' : 'Select a weapon first', W/2, confY+confH/2);
    ctx.globalAlpha = 1;

    ctx.restore();
    return {
      selectedWeaponIdx: selected.length ? selected[0] : -1,
      confirmPressed: weaponSelected && mouse.clicked && confHov,
    };
  }

  // ===== WIN SCREEN =====
  drawWinScreen(ctx, W, H, player, mouse, time) {
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#0a1a0a');
    grd.addColorStop(0.5, '#0d2010');
    grd.addColorStop(1, '#0a1a0a');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Confetti
    const seed = time * 50;
    for (let i = 0; i < 40; i++) {
      const cx = (Math.sin(i * 2.3 + seed * 0.3) * 0.5 + 0.5) * W;
      const cy = ((i * 73 + time * 80 * ((i%3)+0.5)) % H);
      ctx.fillStyle = ['#4a9eff','#2dc937','#f7c948','#fa7b17','#c678dd'][i%5];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(i * 0.8 + time);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }

    // Panel
    const panelW = Math.min(680, W-40), panelH = Math.min(500, H-40);
    const px = W/2-panelW/2, py = H/2-panelH/2;
    ctx.fillStyle = 'rgba(10,26,10,0.95)';
    roundRect(ctx, px, py, panelW, panelH, 18); ctx.fill();
    ctx.strokeStyle = '#2dc937'; ctx.lineWidth = 2.5;
    roundRect(ctx, px, py, panelW, panelH, 18); ctx.stroke();

    // Header
    ctx.fillStyle = '#2dc937';
    ctx.font = `bold ${Math.min(32, panelW/14)}px "Space Grotesk"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('✅  Export Successful!', W/2, py+20);
    ctx.fillStyle = '#98FB98';
    ctx.font = '14px Inter';
    ctx.fillText('You defeated The Creative Director. The file has been saved.', W/2, py+60);

    // Build summary
    this._drawBuildSummary(ctx, player, px, py+90, panelW, panelH-180);

    // Buttons
    const btnW = 160, btnH = 46;
    const btn1X = W/2-btnW-20, btn2X = W/2+20, btnY = py+panelH-70;
    [
      { x: btn1X, label: '↩ Main Menu', id: 'quit' },
      { x: btn2X, label: '▶ Play Again', id: 'replay', primary: true },
    ].forEach(btn => {
      const hov = mouse.x>btn.x && mouse.x<btn.x+btnW && mouse.y>btnY && mouse.y<btnY+btnH;
      ctx.fillStyle = btn.primary ? (hov ? '#1473e6' : '#1060c0') : (hov ? '#1a3a1a' : '#0d200d');
      roundRect(ctx, btn.x, btnY, btnW, btnH, 10); ctx.fill();
      ctx.strokeStyle = btn.primary ? '#4a9eff' : '#2dc937'; ctx.lineWidth = 1.5;
      roundRect(ctx, btn.x, btnY, btnW, btnH, 10); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px "Space Grotesk"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x+btnW/2, btnY+btnH/2);
      btn._hov = hov;
      btn._clicked = mouse.clicked && hov;
    });
    ctx.restore();
    return {
      quit: mouse.clicked && mouse.x>btn1X && mouse.x<btn1X+btnW && mouse.y>btnY && mouse.y<btnY+btnH,
      replay: mouse.clicked && mouse.x>btn2X && mouse.x<btn2X+btnW && mouse.y>btnY && mouse.y<btnY+btnH,
      btn1X, btn2X, btnW, btnH, btnY,
    };
  }

  // ===== DEATH SCREEN =====
  drawDeathScreen(ctx, W, H, player, mouse, time) {
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#1a0000');
    grd.addColorStop(0.5, '#200808');
    grd.addColorStop(1, '#1a0000');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // Glitch scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let sy = 0; sy < H; sy += 4) {
      ctx.fillRect(0, sy, W, 2);
    }
    // Random glitch bars
    const glitchN = Math.floor(Math.sin(time * 4) * 3 + 3);
    for (let gi = 0; gi < glitchN; gi++) {
      const gy = (Math.sin(gi * 5.3 + time * 7) * 0.5 + 0.5) * H;
      const gw = (Math.sin(gi * 2.1 + time * 3) * 0.5 + 0.5) * W * 0.6;
      ctx.fillStyle = `rgba(255,0,0,${0.03 + gi*0.01})`;
      ctx.fillRect((W - gw) * 0.3, gy, gw, 4);
    }

    const panelW = Math.min(680, W-40), panelH = Math.min(500, H-40);
    const px = W/2-panelW/2, py = H/2-panelH/2;
    ctx.fillStyle = 'rgba(20,0,0,0.95)';
    roundRect(ctx, px, py, panelW, panelH, 18); ctx.fill();
    ctx.strokeStyle = '#e34850'; ctx.lineWidth = 2.5;
    roundRect(ctx, px, py, panelW, panelH, 18); ctx.stroke();

    // Error header strip
    ctx.fillStyle = '#e34850';
    roundRect(ctx, px, py, panelW, 50, [18,18,0,0]); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Space Grotesk"';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('❌  Error   File Corrupted — Unrecoverable', px+20, py+25);
    ctx.fillStyle = '#fff8';
    ctx.font = '11px Inter';
    ctx.textAlign = 'right';
    ctx.fillText(`0x${Math.floor(time*100).toString(16).toUpperCase().padStart(8,'0')}`, px+panelW-20, py+25);

    // Main title
    ctx.fillStyle = '#e34850';
    ctx.font = `bold ${Math.min(30, panelW/16)}px "Space Grotesk"`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('File Not Found: You', W/2, py+62);
    ctx.fillStyle = '#ff8a8a';
    ctx.font = '13px Inter';
    ctx.fillText('The canvas has been cleared. Your work did not survive.', W/2, py+98);

    // Build summary
    this._drawBuildSummary(ctx, player, px, py+120, panelW, panelH-200);

    // Buttons
    const btnW = 160, btnH = 46;
    const btn1X = W/2-btnW-20, btn2X = W/2+20, btnY = py+panelH-70;
    [
      { x: btn1X, label: '↩ Main Menu', id: 'quit' },
      { x: btn2X, label: '↺ Try Again', id: 'replay', primary: true },
    ].forEach(btn => {
      const hov = mouse.x>btn.x && mouse.x<btn.x+btnW && mouse.y>btnY && mouse.y<btnY+btnH;
      ctx.fillStyle = btn.primary ? (hov ? '#8a0000' : '#600000') : (hov ? '#2a1010' : '#1a0808');
      roundRect(ctx, btn.x, btnY, btnW, btnH, 10); ctx.fill();
      ctx.strokeStyle = btn.primary ? '#e34850' : '#5a2020'; ctx.lineWidth = 1.5;
      roundRect(ctx, btn.x, btnY, btnW, btnH, 10); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px "Space Grotesk"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x+btnW/2, btnY+btnH/2);
    });
    ctx.restore();
    return {
      quit: mouse.clicked && mouse.x>btn1X && mouse.x<btn1X+btnW && mouse.y>btnY && mouse.y<btnY+btnH,
      replay: mouse.clicked && mouse.x>btn2X && mouse.x<btn2X+btnW && mouse.y>btnY && mouse.y<btnY+btnH,
      btn1X, btn2X, btnW, btnH, btnY,
    };
  }

  _drawBuildSummary(ctx, player, px, py, pw, ph) {
    if (!player) return;
    ctx.fillStyle = '#3a3a52';
    ctx.strokeStyle = '#3a3a52';
    roundRect(ctx, px+20, py, pw-40, ph, 10);
    ctx.fill();

    ctx.fillStyle = '#8a8a8a';
    ctx.font = 'bold 11px "Space Grotesk"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('YOUR BUILD', px+30, py+10);

    // Weapon
    const w = player.weapon;
    if (w) {
      ctx.fillStyle = w.color;
      ctx.font = 'bold 13px "Space Grotesk"';
      ctx.fillText(`${w.icon} ${w.name}`, px+30, py+30);
      ctx.fillStyle = '#c0c0c0';
      ctx.font = '11px Inter';
      w.bonusLabels.forEach((bl, bi) => ctx.fillText(`  · ${bl}`, px+30, py+48+bi*14));
    }

    // Gear & accessories
    const allItems = [...(player.gear||[]), ...(player.accessories||[])];
    const GEAR_ICONS = { layer_mask:'🛡️ Layer Mask Vest', smart_object:'⚡ Smart Object Charm',
                         blend_mode:'🌀 Blend Mode Belt', hue_shift:'🎨 Hue-Shift Cloak',
                         magic_wand:'💍 Magic Wand Ring', clone_stamp:'📿 Clone Stamp Locket',
                         gradient_gloves:'🧤 Gradient Gloves', eyedropper:'💧 Eyedropper Earring' };
    allItems.forEach((item, i) => {
      ctx.fillStyle = '#c0c0c0';
      ctx.font = '11px Inter';
      ctx.fillText(`${GEAR_ICONS[item.id]||item.id} ×${item.stacks}`, px+30, py+120+i*16);
    });

    // Stats
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '10px Inter';
    ctx.fillText(`Armor: ${Math.round(((player.armor||0)*0.02 + player._gearArmorBonus)*100)}% · ` +
                 `Crit: ${Math.round((player.effectiveCrit||0)*100)}%`, px+pw/2, py+30);
  }

  // ===== LEVEL TRANSITION =====
  drawLevelTransition(ctx, W, H, alpha, levelIndex) {
    const LEVEL_NAMES = ['Level 1: Collage', 'Level 2: Photo Composite', 'Level 3: Poster Making'];
    const LEVEL_SUBS  = ['Cut, paste, and conquer.', 'Blend through the layers.', 'The Director awaits.'];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Space Grotesk"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LEVEL_NAMES[levelIndex] || '', W/2, H/2 - 20);
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '16px Inter';
    ctx.fillText(LEVEL_SUBS[levelIndex] || '', W/2, H/2 + 20);
    ctx.restore();
  }
}

// Helper
function roundRect(ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = [r,r,r,r];
  const [tl,tr,br,bl] = r;
  ctx.beginPath();
  ctx.moveTo(x+tl, y);
  ctx.lineTo(x+w-tr, y); ctx.arcTo(x+w,y, x+w,y+tr, tr);
  ctx.lineTo(x+w, y+h-br); ctx.arcTo(x+w,y+h, x+w-br,y+h, br);
  ctx.lineTo(x+bl, y+h); ctx.arcTo(x,y+h, x,y+h-bl, bl);
  ctx.lineTo(x, y+tl); ctx.arcTo(x,y, x+tl,y, tl);
  ctx.closePath();
}
