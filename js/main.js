// ===== MAIN GAME LOOP =====
import { state, SCREENS, setScreen } from './state.js';
import { clearFrame, mouse, isMovingLeft, isMovingRight, isJumping, isInteract, isUltimate, isAttacking, wasPressed } from './input.js';
import { Camera } from './camera.js';
import { ParticleSystem } from './particles.js';
import { Player, TILE_SIZE } from './player.js';
import { createWeapon, upgradeWeapon, WEAPON_TYPES } from './weapons.js';
import { GEAR_TYPES, ACCESSORY_TYPES, rollChestLoot, applyGearToPlayer, getLootById } from './gear.js';
import { Level, drawBackground, LEVEL_THEMES } from './procgen.js';
import { Boss } from './boss.js';
import { UI } from './ui.js';
import { createEnemy, LEVEL_ENEMIES } from './enemies.js';

// ===== CANVAS SETUP =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ui = new UI(canvas);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ui.resize(canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// ===== GAME STATE VARS =====
let particles = new ParticleSystem();
let camera = new Camera(canvas.width, canvas.height);
let level = null;
let boss = null;
let player = null;
let time = 0;
let transitioning = false;
let transitionAlpha = 0;
let transitionDir = 1; // 1=fade to black, -1=fade to game
let nextLevelIndex = 0;

// Starting weapon select state
let startWeapons = [];
let startGear = [];
let startAccessory = [];

// Volume drag
let draggingVolume = false;

// ===== AUDIO =====
function initAudio() {
  if (state.audioContext) return;
  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.value = state.volume;
    state.masterGain.connect(state.audioContext.destination);
  } catch(e) { /* audio not available */ }
}

function playTone(freq, type = 'square', dur = 0.08, vol = 0.15) {
  if (!state.audioContext || !state.masterGain) return;
  try {
    const osc = state.audioContext.createOscillator();
    const g = state.audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, state.audioContext.currentTime);
    g.gain.setValueAtTime(vol, state.audioContext.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, state.audioContext.currentTime + dur);
    osc.connect(g); g.connect(state.masterGain);
    osc.start(); osc.stop(state.audioContext.currentTime + dur);
  } catch(e) {}
}

function sfxAttack(weapon) {
  if (!weapon) return;
  const freqs = { brush: [220,180], eraser: [440,200], transform: [880,440] };
  const [f1,f2] = freqs[weapon.type] || [300,200];
  playTone(f1, 'sawtooth', 0.06, 0.1);
  setTimeout(() => playTone(f2, 'square', 0.04, 0.08), 40);
}

function sfxHit() { playTone(150, 'square', 0.1, 0.2); }
function sfxChest() { [440,550,660,880].forEach((f,i) => setTimeout(() => playTone(f,'sine',0.12,0.1), i*60)); }
function sfxUltimate() { [200,300,400,600,800,1200].forEach((f,i) => setTimeout(() => playTone(f,'sawtooth',0.15,0.2), i*50)); }
function sfxPlayerHurt() { playTone(100,'sawtooth',0.18,0.3); }
function sfxDeath() { [300,250,200,150].forEach((f,i) => setTimeout(() => playTone(f,'sawtooth',0.2,0.25), i*100)); }
function sfxLevelUp() { [440,550,660].forEach((f,i) => setTimeout(() => playTone(f,'sine',0.2,0.15), i*100)); }

// ===== RESET GAME =====
function resetGame() {
  particles = new ParticleSystem();
  camera = new Camera(canvas.width, canvas.height);
  level = null; boss = null; player = null;
  state.chestsOpened = 0;
  state.levelIndex = 0;
  state.persistedPlayerHP = null;
  transitioning = false; transitionAlpha = 0;
  startWeapons = [];
  startWeapons.push(createWeapon(WEAPON_TYPES.BRUSH));
  startWeapons.push(createWeapon(WEAPON_TYPES.ERASER));
  // Starting gear: 1 gear + 1 accessory
  const gearPool = [...GEAR_TYPES];
  const accPool = [...ACCESSORY_TYPES];
  startGear = [gearPool[Math.floor(Math.random()*gearPool.length)]];
  startAccessory = [accPool[Math.floor(Math.random()*accPool.length)]];
}

// ===== START A LEVEL =====
function startLevel(lvlIndex) {
  state.levelIndex = lvlIndex;
  level = new Level(lvlIndex);
  camera = new Camera(canvas.width, canvas.height);

  const spawnX = TILE_SIZE * 2, spawnY = (level.pixelHeight - TILE_SIZE * 5);

  if (!player) {
    player = new Player(spawnX, spawnY, state.avatar);
    // Apply chosen gear
    for (const g of state._startGear || []) player.addGear(g);
    for (const a of state._startAcc || []) player.addGear(a);
    applyGearToPlayer(player);
  } else {
    // Carry over player, heal 10% on level start
    player.x = spawnX; player.y = spawnY;
    player.vx = 0; player.vy = 0;
    player.dead = false; player.deathTimer = 0;
    // Restore perissted HP
    if (state.persistedPlayerHP !== null) {
      player.hp = state.persistedPlayerHP;
    }
  }

  // Boss on level 2
  boss = null;
  if (lvlIndex === 2) {
    const bossRoomX = (level.rooms.length - 1) * 22 * TILE_SIZE;
    boss = new Boss(bossRoomX + 200, (level.pixelHeight - TILE_SIZE * 8), level.pixelWidth);
    // Spawn some poster minions alongside boss
    for (let i = 0; i < 3; i++) {
      const ex = bossRoomX + 60 + i * 100;
      const ey = (level.pixelHeight - TILE_SIZE * 4);
      level.enemies.push(createEnemy('boldtype', ex, ey, lvlIndex));
    }
  }

  transitioning = false; transitionAlpha = 0;
  ui.notify(`Entering ${['Collage','Photo Composite','Poster Making'][lvlIndex]}...`, 2);
}

// ===== HANDLE WEAPON ATTACK =====
let attackHeld = false;
function doAttack() {
  if (!player || player.dead || !player.weapon) return;
  if (player.attackTimer > 0) return;
  const w = player.weapon;
  player.attackTimer = w.cooldown;
  player.attackAnim = 1.0;

  sfxAttack(w);

  // Calc damage
  const crit = player.rollCrit();
  let dmg = Math.round(player.effectiveDamage * (crit ? 2 : 1));

  // Apply armor shred for eraser
  const armorShred = w.armorShred || 0;

  const hb = player.getAttackHitbox();
  if (!hb) return;

  // Particles
  if (w.type === 'brush') {
    particles.paintSplash(hb.x + hb.w/2, hb.y + hb.h/2, '#4a9eff', 8);
  } else if (w.type === 'eraser') {
    particles.erasePuff(hb.x + hb.w/2, hb.y + hb.h/2);
  } else {
    particles.transformFlash(hb.x + hb.w/2, hb.y + hb.h/2);
  }

  // Hit enemies
  const targets = [];
  for (const e of level.enemies) {
    if (!e.alive) continue;
    if (rectsOverlap(hb, { x: e.x, y: e.y, w: e.w, h: e.h })) targets.push(e);
  }
  // Hit boss
  if (boss && boss.alive && rectsOverlap(hb, { x: boss.x, y: boss.y, w: boss.w, h: boss.h })) {
    targets.push(boss);
  }

  let hitAny = false;
  for (const t of targets) {
    // Double hit (clone stamp)
    const hitCount = (player._doubleHitChance > 0 && Math.random() < player._doubleHitChance) ? 2 : 1;
    let totalDmg = dmg * hitCount;
    // Boss armor shred
    if (t === boss && armorShred > 0 && boss.shielded) {
      boss.shieldHP -= totalDmg * armorShred * 3;
      if (boss.shieldHP <= 0) boss.shielded = false;
    }
    const actual = t.takeDamage ? t.takeDamage(totalDmg, w.knockback || 0, player.facing) : 0;
    particles.damageNumber(t.x + t.w/2, t.y, Math.round(actual || totalDmg), crit);
    sfxHit();
    hitAny = true;

    // Status via blend mode gear
    if (player._blendProc > 0 && Math.random() < player._blendProc) {
      const statuses = ['burn','freeze','shock'];
      const st = statuses[Math.floor(Math.random()*statuses.length)];
      if (t.applyStatus) t.applyStatus(st, 2, st === 'burn' ? 5 : 0);
    }

    // On-kill effects
    if (t.hp !== undefined && t.hp <= 0 && player._lifeOnKill > 0) {
      player.heal(player._lifeOnKill);
      particles.healNumber(player.x + player.w/2, player.y, player._lifeOnKill);
    }
  }

  if (hitAny) {
    // Charge ultimate
    player.chargeUltimate(8 * (crit ? 1.5 : 1));
    // Gradient gloves combo
    player.comboCount++;
    player.comboResetTimer = 2.5;
  }
}

// ===== WEAPON SPECIAL ATTACK =====
let specialDown = false;
function doSpecial() {
  if (!player || player.dead || !player.weapon) return;
  const w = player.weapon;
  if (w.specialCharge < w.specialCooldown) return;
  w.specialCharge = 0;

  if (w.type === 'brush') {
    // Splatter Burst: AoE paint explosion
    const cx = player.x + player.w/2, cy = player.y + player.h/2;
    particles.paintSplash(cx, cy, '#4a9eff', 30);
    const burst = w.range * 2;
    let dmg = player.effectiveDamage * 2.2;
    for (const e of level.enemies) {
      if (!e.alive) continue;
      const dx = (e.x+e.w/2)-cx, dy = (e.y+e.h/2)-cy;
      if (Math.sqrt(dx*dx+dy*dy) < burst) { e.takeDamage(dmg, 200, Math.sign(dx)); }
    }
    if (boss && boss.alive) {
      const dx = (boss.x+boss.w/2)-cx;
      if (Math.abs(dx) < burst + boss.w) boss.takeDamage(dmg);
    }
    camera.addShake(1.2);
    playTone(150, 'sawtooth', 0.3, 0.3);
  } else if (w.type === 'eraser') {
    // Wipe: dash through, dealing damage
    player.isDashing = true;
    player.dashTimer = 0.35;
    player.dashDir = player.facing;
    player.iframes = 0.35;
    particles.erasePuff(player.x + player.w/2, player.y + player.h/2);
    playTone(350, 'square', 0.2, 0.2);
  } else if (w.type === 'transform') {
    // Free Transform: grapple nearest enemies
    const cx = player.x + player.w/2, cy = player.y + player.h/2;
    const grappleTargets = [...level.enemies.filter(e=>e.alive)];
    if (boss && boss.alive) grappleTargets.push(boss);
    grappleTargets.sort((a,b) => {
      const da = Math.hypot((a.x+a.w/2)-cx, (a.y+a.h/2)-cy);
      const db = Math.hypot((b.x+b.w/2)-cx, (b.y+b.h/2)-cy);
      return da - db;
    });
    const count = Math.min(w.grappleCount, grappleTargets.length);
    for (let i = 0; i < count; i++) {
      const t = grappleTargets[i];
      // Slam toward player
      const dx = cx - (t.x + t.w/2), dy = cy - (t.y + t.h/2);
      const len = Math.sqrt(dx*dx+dy*dy) || 1;
      t.vx = (dx/len) * 500;
      t.vy = (dy/len) * 500 - 200;
      t.takeDamage(player.effectiveDamage * 1.5, 0, 0);
      particles.transformFlash(t.x+t.w/2, t.y+t.h/2);
      if (t.applyGrapple) t.applyGrapple(w.resizeDuration);
    }
    camera.addShake(0.8);
    playTone(660, 'triangle', 0.25, 0.25);
  }
}

// ===== ULTIMATE ATTACK =====
function doUltimate() {
  if (!player || player.dead) return;
  if (player.ultimateCharge < player.ultimateMax) return;
  player.ultimateCharge = 0;
  sfxUltimate();
  camera.addShake(2);

  const cx = player.x + player.w/2, cy = player.y + player.h/2;
  particles.ultimateEffect(cx, cy, 200);

  // Compute build power (for damage scaling 5-30%)
  const gearCount = (player.gear?.length || 0) + (player.accessories?.length || 0);
  const weaponBonuses = player.weapon?.bonuses.length || 0;
  const buildScore = gearCount + weaponBonuses; // 0-8
  // Scales 5% to 30%
  const dmgPct = 0.05 + (buildScore / 8) * 0.25;

  // AoE damage to all enemies
  for (const e of level.enemies) {
    if (!e.alive) continue;
    e.takeDamage(player.effectiveDamage * 6);
  }
  // Boss: capped damage
  if (boss && boss.alive) {
    const bossCapDmg = boss.hp * dmgPct;
    boss.takeDamage(Math.round(bossCapDmg), true);
    particles.damageNumber(boss.x + boss.w/2, boss.y - 20, Math.round(bossCapDmg), true);
  }
}

// ===== SPECIAL ATTACK TRIGGER (right click or separate key Q) =====
window.addEventListener('contextmenu', (e) => { e.preventDefault(); doSpecial(); });

// ===== WEAPON PICKUP =====
function tryPickupWeapons() {
  if (!player || !level) return;
  for (const drop of level.weaponDrops) {
    if (drop.used) continue;
    const dist = Math.hypot((player.x+player.w/2) - (drop.x+16), (player.y+player.h/2) - (drop.y+16));
    if (dist < 36) {
      drop.used = true;
      const w = player.weapon;
      if (w && w.type === drop.type) {
        // Duplicate: upgrade
        const upgraded = upgradeWeapon(w);
        ui.notify(upgraded ? `🖌️ ${w.name} upgraded! New bonus: ${w.bonusLabels[w.bonusLabels.length-1]}` : `${w.name} already at max bonuses!`);
      } else {
        // New weapon
        const newW = createWeapon(drop.type);
        player.equipWeapon(newW);
        ui.notify(`⚔️ Picked up ${newW.name}!`);
      }
      playTone(660, 'sine', 0.2, 0.15);
      particles.paintSplash(drop.x+16, drop.y+16, '#f7c948', 8);
    }
  }
}

// ===== INTERACT WITH INTERACTABLES =====
function tryInteract() {
  if (!player || !level) return;
  for (const item of level.interactables) {
    if (item.used) continue;
    const dist = Math.hypot((player.x+player.w/2) - (item.x+16), (player.y+player.h/2) - (item.y+16));
    if (dist < 48) {
      if (item.type === 'chest') {
        item.used = true;
        state.chestsOpened++;
        applyGearToPlayer(player);
        sfxChest();
        ui.openChest(item.loot, (selected) => {
          const added = player.addGear(selected);
          if (!added) {
            ui.notify(`${selected.slot === 'gear' ? 'Gear' : 'Accessory'} slots full! Could not equip ${selected.name}.`, 3);
          } else {
            ui.notify(`Equipped: ${selected.icon} ${selected.name}!`);
          }
          applyGearToPlayer(player);
        });
        particles.paintSplash(item.x+16, item.y+16, '#f7c948', 10);
      } else if (item.type === 'plant') {
        item.used = true;
        const healAmt = 15;
        player.heal(healAmt);
        particles.healNumber(player.x+player.w/2, player.y, healAmt);
        ui.notify('🌿 Spot Healing: +15 HP!');
        playTone(550, 'sine', 0.25, 0.12);
      }
      break;
    }
  }
}

// ===== CHECK LEVEL COMPLETE =====
function checkLevelComplete() {
  if (!level || !player || player.dead) return false;
  const lvl = state.levelIndex;
  if (lvl < 2) {
    // Levels 0 and 1: reach far right door
    const rightEdge = level.pixelWidth - TILE_SIZE * 2;
    if (player.x + player.w > rightEdge) return true;
  } else {
    // Level 2: boss dead
    if (boss && boss.dead && boss.deathTimer > 2.0) return true;
  }
  return false;
}

// ===== RECT OVERLAP =====
function rectsOverlap(a, b) {
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

// ===== VOLUME BAR INTERACTION =====
function handleVolumeBar(volBar) {
  if (!volBar) return;
  const { x, y, w, h } = volBar;
  if (mouse.held && mouse.y > y-10 && mouse.y < y+h+10 && mouse.x > x-10 && mouse.x < x+w+10) {
    draggingVolume = true;
  }
  if (draggingVolume && mouse.held) {
    state.volume = Math.max(0, Math.min(1, (mouse.x - x) / w));
    if (state.masterGain) state.masterGain.gain.value = state.volume;
  }
  if (!mouse.held) draggingVolume = false;
}

// ===== MAIN UPDATE =====
let lastTime = 0;
function gameLoop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  time += dt;

  // Resize if needed
  if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
    resize();
    camera.width = canvas.width;
    camera.height = canvas.height;
  }

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ui.updateNotification(dt);

  switch (state.screen) {
    case SCREENS.START:      updateStart(dt, W, H); break;
    case SCREENS.CHARACTER:  updateCharacter(dt, W, H); break;
    case SCREENS.WEAPON_SELECT: updateWeaponSelect(dt, W, H); break;
    case SCREENS.GAME:       updateGame(dt, W, H); break;
    case SCREENS.WIN:        updateWin(dt, W, H); break;
    case SCREENS.DEATH:      updateDeath(dt, W, H); break;
  }

  clearFrame();
  requestAnimationFrame(gameLoop);
}

// ===== SCREEN: START =====
function updateStart(dt, W, H) {
  const result = ui.drawStartScreen(ctx, W, H, state, mouse, time);
  handleVolumeBar(result?.volBar);

  if (!result) return;
  const { startBtn, avatarBtn, btnW, btnH, btnX } = result;

  if (mouse.clicked) {
    if (mouse.x > btnX && mouse.x < btnX+btnW) {
      if (mouse.y > startBtn.y && mouse.y < startBtn.y+btnH) {
        initAudio();
        resetGame();
        setScreen(SCREENS.WEAPON_SELECT);
        sfxLevelUp();
      }
      if (mouse.y > avatarBtn.y && mouse.y < avatarBtn.y+btnH) {
        setScreen(SCREENS.CHARACTER);
      }
    }
  }
}

// ===== SCREEN: CHARACTER =====
function updateCharacter(dt, W, H) {
  const result = ui.drawCharacterScreen(ctx, W, H, state.avatar, mouse);
  if (!result) return;

  for (const click of result.clicks) {
    if (click.key === 'species') {
      state.avatar.species = click.species;
    } else {
      state.avatar[click.key] = click.value;
    }
  }
  if (result.backPressed || result.confirmPressed) {
    setScreen(SCREENS.START);
  }
}

// ===== SCREEN: WEAPON SELECT =====
function updateWeaponSelect(dt, W, H) {
  const result = ui.drawWeaponSelectScreen(ctx, W, H, startWeapons, startGear, startAccessory, mouse);
  if (!result) return;

  if (result.selectedWeaponIdx >= 0) {
    startWeapons.forEach((w, i) => { w._selected = (i === result.selectedWeaponIdx); });
  }

  if (result.confirmPressed) {
    const chosen = startWeapons.find(w => w._selected);
    if (chosen) {
      // Build player
      state._startGear = startGear;
      state._startAcc = startAccessory;
      player = new Player(0, 0, state.avatar);
      player.equipWeapon(chosen);
      for (const g of startGear) player.addGear(g);
      for (const a of startAccessory) player.addGear(a);
      applyGearToPlayer(player);
      startLevel(0);
      setScreen(SCREENS.GAME);
      sfxLevelUp();
    }
  }
}

// ===== SCREEN: GAME =====
function updateGame(dt, W, H) {
  // --- Transition overlay ---
  if (transitioning) {
    transitionAlpha += transitionDir * dt * 1.5;
    if (transitionAlpha >= 1 && transitionDir === 1) {
      // Fade complete — start next level
      startLevel(nextLevelIndex);
      transitionDir = -1;
    }
    if (transitionAlpha <= 0 && transitionDir === -1) {
      transitioning = false;
      transitionAlpha = 0;
    }
  }

  if (!player || !level) return;

  // --- Player input ---
  if (!player.dead && !ui.chestOpen) {
    player.setInput({
      left: isMovingLeft(),
      right: isMovingRight(),
      jump: isJumping(),
      attack: isAttacking(),
    });
    if (isJumping()) { /* handled in player.update */ }
    if (isUltimate()) doUltimate();
    if (isAttacking() && !attackHeld) doAttack();
    attackHeld = isAttacking();

    // Charge special
    if (player.weapon) {
      player.weapon.specialCharge = Math.min(player.weapon.specialCooldown,
        (player.weapon.specialCharge || 0) + dt);
    }

    if (isInteract()) {
      tryInteract();
      tryPickupWeapons();
    }
  } else {
    player.setInput({});
    attackHeld = false;
  }

  // --- Update player ---
  if (!ui.chestOpen) {
    player.update(dt, level, particles, level.enemies);

    // Spike collision
    const spikes = level.getSpikesNear(player.x, player.y, player.w, player.h);
    for (const sp of spikes) {
      if (rectsOverlap({ x: sp.x+2, y: sp.y+2, w: 28, h: 26 }, player)) {
        const dmg = player.takeDamage(20);
        if (dmg) {
          sfxPlayerHurt();
          camera.addShake(0.6);
          particles.deathBurst(player.x+player.w/2, player.y+player.h, '#e34850');
        }
      }
    }
  }

  // --- Update enemies ---
  let enemiesAlive = 0;
  for (let i = level.enemies.length - 1; i >= 0; i--) {
    const e = level.enemies[i];
    e.update(dt, level, player);
    if (e.alive) enemiesAlive++;
    // Enemy->player hit detection (melee)
    if (e.alive && !player.dead && player.iframes <= 0) {
      if (e.animState === 'attack' && rectsOverlap({ x: e.x, y: e.y, w: e.w, h: e.h }, player)) {
        const dmg = player.takeDamage(e.damage);
        if (dmg) {
          sfxPlayerHurt();
          camera.addShake(0.8);
        }
      }
    }
    // Remove fully dead enemies & grant XP
    if (!e.alive && e.deathTimer > 1.0) {
      particles.deathBurst(e.x + e.w / 2, e.y, '#fa7b17', 12);
      // Grant XP
      if (e.xpReward && player) {
        const leveled = player.gainXP(e.xpReward);
        if (leveled) {
          playTone(660, 'sine', 0.3, 0.2);
          setTimeout(() => playTone(880, 'sine', 0.25, 0.2), 120);
          setTimeout(() => playTone(1100, 'sine', 0.2, 0.2), 240);
          const isWeaponLevel = player.playerLevel % 5 === 0;
          ui.notify(isWeaponLevel
            ? `⬆️ LEVEL ${player.playerLevel}! +Weapon Dmg! HP: ${player.maxHp}`
            : `⬆️ Level ${player.playerLevel}! ATK +4% | HP +8`, 3.0);
          camera.addShake(0.5);
        }
      }
      level.enemies.splice(i, 1);
    }
  }

  // --- Boss update ---
  if (boss && boss.alive) {
    boss.update(dt, level, player, particles);
    // Boss pending minions
    if (boss._pendingMinions > 0) {
      boss._pendingMinions--;
      const bx = boss.x + boss.w/2 + (Math.random()-0.5)*200;
      const by = boss.y;
      level.enemies.push(createEnemy('cmykdrone', bx, by, state.levelIndex));
    }
    // Boss direct melee collision
    if (!player.dead && player.iframes <= 0) {
      if (rectsOverlap({ x: boss.x, y: boss.y, w: boss.w, h: boss.h }, player)) {
        const dmg = player.takeDamage(boss.damage * 0.5 * dt);
        if (dmg > 1) {
          sfxPlayerHurt();
          camera.addShake(0.5);
        }
      }
    }
    // VignetteShade vignette effect
    boss._vignetteActive = level.enemies.some(e => e.vignetteActive);
    level.vignetteAlpha = boss._vignetteActive ? 0.5 : 0;
  }

  // Pass vignette to enemies
  for (const e of level.enemies) {
    if (e.vignetteActive) level.vignetteAlpha = Math.max(level.vignetteAlpha, 0.5);
    else level.vignetteAlpha = Math.max(0, level.vignetteAlpha - dt * 0.5);
  }

  // --- Update particles ---
  particles.update(dt);

  // --- Camera ---
  camera.follow(player, level.pixelWidth, level.pixelHeight);
  camera.update(dt);

  // --- RENDER ---
  // Background (screen space)
  drawBackground(ctx, camera, state.levelIndex);

  // World space
  camera.apply(ctx);
  level.draw(ctx, camera, state.levelIndex);
  particles.draw(ctx);
  for (const e of level.enemies) e.draw(ctx);
  if (boss) boss.draw(ctx, particles);
  player.draw(ctx, particles);

  // Proximity interact hints
  if (!ui.chestOpen) {
    for (const item of level.interactables) {
      if (item.used) continue;
      const dist = Math.hypot((player.x+player.w/2)-(item.x+16), (player.y+player.h/2)-(item.y+16));
      if (dist < 60) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('[F] ' + (item.type === 'chest' ? 'Open Chest' : 'Heal'),
                     item.x + 16, item.y - 6);
        ctx.restore();
      }
    }
    for (const drop of level.weaponDrops) {
      if (drop.used) continue;
      const dist = Math.hypot((player.x+player.w/2)-(drop.x+16), (player.y+player.h/2)-(drop.y+16));
      if (dist < 50) {
        ctx.save();
        ctx.fillStyle = '#f7c948';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('[F] Pick Up Weapon', drop.x+16, drop.y-6);
        ctx.restore();
      }
    }
  }

  camera.restore(ctx);

  // HUD
  ui.drawHUD(ctx, player, state.levelIndex, boss);

  // Chest UI
  if (ui.chestOpen) {
    ui.drawChestUI(ctx, W, H, mouse);
  }

  // Level transition overlay
  if (transitioning) {
    ui.drawLevelTransition(ctx, W, H, transitionAlpha, nextLevelIndex);
  }

  // --- Check states ---
  // Player death
  if (player.dead && player.deathTimer > 1.2) {
    sfxDeath();
    state.persistedPlayerHP = null;
    setScreen(SCREENS.DEATH);
    return;
  }

  // Level complete
  if (!transitioning && checkLevelComplete()) {
    if (state.levelIndex === 2) {
      // Win!
      sfxLevelUp();
      setScreen(SCREENS.WIN);
    } else {
      // Next level
      sfxLevelUp();
      state.persistedPlayerHP = player.hp;
      nextLevelIndex = state.levelIndex + 1;
      transitioning = true;
      transitionDir = 1;
      transitionAlpha = 0;
    }
  }
}

// ===== SCREEN: WIN =====
function updateWin(dt, W, H) {
  const result = ui.drawWinScreen(ctx, W, H, player, mouse, time);
  if (!result) return;
  if (result.quit) {
    setScreen(SCREENS.START);
    player = null; level = null; boss = null;
  }
  if (result.replay) {
    resetGame();
    setScreen(SCREENS.WEAPON_SELECT);
  }
}

// ===== SCREEN: DEATH =====
function updateDeath(dt, W, H) {
  const result = ui.drawDeathScreen(ctx, W, H, player, mouse, time);
  if (!result) return;
  if (result.quit) {
    setScreen(SCREENS.START);
    player = null; level = null; boss = null;
  }
  if (result.replay) {
    resetGame();
    setScreen(SCREENS.WEAPON_SELECT);
  }
}

// ===== INIT =====
resetGame();
requestAnimationFrame(gameLoop);
