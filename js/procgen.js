// ===== PROCEDURAL LEVEL GENERATOR =====
import { TILE_SIZE } from './player.js';
import { createEnemy, LEVEL_ENEMIES } from './enemies.js';
import { rollChestLoot } from './gear.js';
import { createWeapon, WEAPON_TYPES } from './weapons.js';

// Tile IDs
export const T = {
  EMPTY: 0,
  SOLID: 1,
  PLATFORM: 2,
  SPIKE: 3,
  DOOR: 4,
  CHEST: 5,
  PLANT: 6,
};

const ROOM_H = 18;
const ROOM_W = 22;

function makeRoom(type, lvl) {
  const grid = [];
  for (let row = 0; row < ROOM_H; row++) {
    grid.push(new Array(ROOM_W).fill(T.EMPTY));
  }
  for (let col = 0; col < ROOM_W; col++) {
    grid[ROOM_H - 1][col] = T.SOLID;
    grid[ROOM_H - 2][col] = T.SOLID;
  }
  for (let row = 0; row < ROOM_H; row++) {
    grid[row][0] = T.SOLID;
    grid[row][ROOM_W - 1] = T.SOLID;
  }
  for (let col = 0; col < ROOM_W; col++) {
    grid[0][col] = T.SOLID;
  }
  for (let row = 9; row <= 13; row++) {
    grid[row][0] = T.EMPTY;
    grid[row][ROOM_W - 1] = T.EMPTY;
  }

  if (type === 'combat') {
    addPlatforms(grid, 2 + Math.floor(Math.random() * 2), lvl);
  } else if (type === 'platform') {
    addPlatforms(grid, 4 + Math.floor(Math.random() * 3), lvl);
    addSpikes(grid, Math.floor(Math.random() * 4));
  } else if (type === 'chest') {
    addPlatforms(grid, 1 + Math.floor(Math.random() * 2), lvl);
    placeChest(grid);
    if (Math.random() < 0.3) placeHealPlant(grid);
  } else if (type === 'start') {
    addPlatforms(grid, 1, lvl);
  } else if (type === 'boss') {
    for (let col = 0; col < ROOM_W; col++) {
      grid[ROOM_H - 3][col] = T.SOLID;
    }
  }

  return grid;
}

function addPlatforms(grid, count, lvl) {
  for (let i = 0; i < count; i++) {
    const col = 2 + Math.floor(Math.random() * (ROOM_W - 8));
    const row = 5 + Math.floor(Math.random() * 8);
    const len = 3 + Math.floor(Math.random() * 6);
    for (let c = col; c < Math.min(col + len, ROOM_W - 1); c++) {
      if (grid[row][c] === T.EMPTY) grid[row][c] = T.PLATFORM;
    }
    // Much rarer chest/plant on platforms
    if (Math.random() < 0.07 && row < ROOM_H - 3) {
      const cx = col + Math.floor(len / 2);
      if (grid[row - 1][cx] === T.EMPTY) grid[row - 1][cx] = T.CHEST;
    }
    if (Math.random() < 0.05 && row < ROOM_H - 3) {
      if (Math.random() < 0.5) grid[row - 1][col] = T.PLANT;
    }
  }
}

function addSpikes(grid, count) {
  for (let i = 0; i < count; i++) {
    const col = 2 + Math.floor(Math.random() * (ROOM_W - 4));
    const len = 1 + Math.floor(Math.random() * 4);
    for (let c = col; c < Math.min(col + len, ROOM_W - 2); c++) {
      if (grid[ROOM_H - 3][c] === T.EMPTY) grid[ROOM_H - 3][c] = T.SPIKE;
    }
  }
}

function placeChest(grid) {
  const col = 5 + Math.floor(Math.random() * (ROOM_W - 10));
  grid[ROOM_H - 3][col] = T.CHEST;
}

function placeHealPlant(grid) {
  const col = 3 + Math.floor(Math.random() * (ROOM_W - 6));
  grid[ROOM_H - 3][col] = T.PLANT;
}

export class Level {
  constructor(levelIndex) {
    this.levelIndex = levelIndex;
    this.rooms = [];
    this.enemies = [];
    this.interactables = [];
    this.weaponDrops = [];
    this.vignetteAlpha = 0;
    this._generate();
  }

  get pixelWidth() { return this.rooms.length * ROOM_W * TILE_SIZE; }
  get pixelHeight() { return ROOM_H * TILE_SIZE; }

  _generate() {
    const lvl = this.levelIndex;
    const isBoss = lvl === 2;
    const enemyTypes = LEVEL_ENEMIES[lvl];

    const roomTypes = ['start', 'combat', 'platform', 'combat', 'chest',
                       'platform', 'combat', 'chest', 'combat'];
    if (isBoss) roomTypes.push('boss');
    const mid = roomTypes.slice(1, isBoss ? -1 : roomTypes.length);
    for (let i = mid.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mid[i], mid[j]] = [mid[j], mid[i]];
    }
    const finalTypes = ['start', ...mid, ...(isBoss ? ['boss'] : [])];

    for (let ri = 0; ri < finalTypes.length; ri++) {
      const rtype = finalTypes[ri];
      const grid = makeRoom(rtype, lvl);
      this.rooms.push({ type: rtype, grid });
      const offsetX = ri * ROOM_W * TILE_SIZE;

      // More enemies per combat room: 3-5 on ground
      if (rtype === 'combat' || rtype === 'boss') {
        const count = rtype === 'boss' ? 0 : (3 + Math.floor(Math.random() * 3));
        for (let e = 0; e < count; e++) {
          const etype = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
          const ex = offsetX + (3 + Math.floor(Math.random() * (ROOM_W - 6))) * TILE_SIZE;
          const ey = (ROOM_H - 4) * TILE_SIZE;
          const enemy = createEnemy(etype, ex, ey, lvl);
          this.enemies.push(enemy);
        }

        // Also spawn 1-2 enemies ON platform tiles in this room
        if (rtype === 'combat') {
          const platformSpots = [];
          for (let row = 3; row < ROOM_H - 3; row++) {
            for (let col = 2; col < ROOM_W - 2; col++) {
              if (grid[row][col] === T.PLATFORM && grid[row - 1]?.[col] === T.EMPTY) {
                platformSpots.push({ col, row });
              }
            }
          }
          const platformCount = Math.min(platformSpots.length, 1 + Math.floor(Math.random() * 2));
          // Shuffle and pick
          for (let i = platformSpots.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [platformSpots[i], platformSpots[j]] = [platformSpots[j], platformSpots[i]];
          }
          for (let p = 0; p < platformCount; p++) {
            const spot = platformSpots[p];
            const etype = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
            const ex = offsetX + spot.col * TILE_SIZE;
            const ey = (spot.row - 1) * TILE_SIZE; // one tile above the platform
            const enemy = createEnemy(etype, ex, ey, lvl);
            this.enemies.push(enemy);
          }
        }
      }

      for (let row = 0; row < ROOM_H; row++) {
        for (let col = 0; col < ROOM_W; col++) {
          const tile = grid[row][col];
          const wx = offsetX + col * TILE_SIZE;
          const wy = row * TILE_SIZE;
          if (tile === T.CHEST) {
            this.interactables.push({
              type: 'chest', x: wx, y: wy, id: `chest_${ri}_${row}_${col}`,
              used: false, loot: rollChestLoot(3),
            });
          } else if (tile === T.PLANT) {
            this.interactables.push({
              type: 'plant', x: wx, y: wy, id: `plant_${ri}_${row}_${col}`,
              used: false,
            });
          }
        }
      }

      if (rtype === 'chest') {
        const wtype = WEAPON_TYPE_FOR_LEVEL[lvl][Math.floor(Math.random() * WEAPON_TYPE_FOR_LEVEL[lvl].length)];
        const wx = offsetX + (5 + Math.floor(Math.random() * (ROOM_W - 10))) * TILE_SIZE;
        const wy = (ROOM_H - 4) * TILE_SIZE;
        this.weaponDrops.push({ type: wtype, x: wx, y: wy, id: `wdrop_${ri}`, used: false });
      }
    }

    this.totalRooms = finalTypes.length;
  }

  getTile(col, row) {
    if (row < 0 || row >= ROOM_H) return T.SOLID;
    const ri = Math.floor(col / ROOM_W);
    const lc = col % ROOM_W;
    if (ri < 0 || ri >= this.rooms.length) return T.SOLID;
    return this.rooms[ri].grid[row]?.[lc] ?? T.EMPTY;
  }

  hasTileAt(col, row) {
    const t = this.getTile(col, row);
    return t === T.SOLID || t === T.PLATFORM;
  }

  getSolidTilesNear(x, y, w, h) {
    const result = [];
    const c0 = Math.floor(x / TILE_SIZE) - 1;
    const c1 = Math.floor((x + w) / TILE_SIZE) + 1;
    const r0 = Math.floor(y / TILE_SIZE) - 1;
    const r1 = Math.floor((y + h) / TILE_SIZE) + 2;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.getTile(c, r);
        if (t === T.SOLID || t === T.PLATFORM) {
          result.push({ x: c * TILE_SIZE, y: r * TILE_SIZE, type: t });
        }
      }
    }
    return result;
  }

  getSpikesNear(x, y, w, h) {
    const result = [];
    const c0 = Math.floor(x / TILE_SIZE);
    const c1 = Math.floor((x + w) / TILE_SIZE);
    const r0 = Math.floor(y / TILE_SIZE);
    const r1 = Math.floor((y + h) / TILE_SIZE) + 1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.getTile(c, r) === T.SPIKE) {
          result.push({ x: c * TILE_SIZE, y: r * TILE_SIZE });
        }
      }
    }
    return result;
  }

  draw(ctx, cam, levelIndex) {
    const THEMES = [CIRCUIT_THEME, CYBER_THEME, NEON_VOID_THEME];
    const theme = THEMES[levelIndex] || CIRCUIT_THEME;

    const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE) - 1);
    const endCol = Math.min(Math.floor(this.pixelWidth / TILE_SIZE), Math.ceil((cam.x + cam.width) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(cam.y / TILE_SIZE) - 1);
    const endRow = Math.min(ROOM_H, Math.ceil((cam.y + cam.height) / TILE_SIZE) + 1);

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const t = this.getTile(col, row);
        if (t === T.EMPTY) continue;
        const px = col * TILE_SIZE, py = row * TILE_SIZE;
        this._drawTile(ctx, t, px, py, theme, col, row);
      }
    }

    for (const item of this.interactables) {
      if (item.used) continue;
      this._drawInteractable(ctx, item, theme);
    }
    for (const drop of this.weaponDrops) {
      if (drop.used) continue;
      this._drawWeaponDrop(ctx, drop);
    }

    // Vignette effect
    if (this.vignetteAlpha > 0) {
      const grd = ctx.createRadialGradient(cam.x + cam.width / 2, cam.y + cam.height / 2, 100,
                                            cam.x + cam.width / 2, cam.y + cam.height / 2, cam.width * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, `rgba(50,0,100,${this.vignetteAlpha})`);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, cam.width, cam.height);
      ctx.restore();
    }
  }

  _drawTile(ctx, type, px, py, theme, col, row) {
    const ts = TILE_SIZE;
    ctx.save();
    if (type === T.SOLID) {
      // Base
      ctx.fillStyle = theme.solid;
      ctx.fillRect(px, py, ts, ts);
      // Inner grid detail
      ctx.strokeStyle = theme.solidGrid;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
      // Horizontal trace line in middle
      ctx.strokeStyle = theme.solidTrace;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + ts / 2);
      ctx.lineTo(px + ts - 4, py + ts / 2);
      ctx.stroke();
      // Glowing top edge
      ctx.fillStyle = theme.solidTop;
      ctx.shadowColor = theme.solidTop;
      ctx.shadowBlur = 6;
      ctx.fillRect(px, py, ts, 3);
      ctx.shadowBlur = 0;
      // Corner dots (circuit node style)
      ctx.fillStyle = theme.solidTop;
      ctx.beginPath(); ctx.arc(px + 3, py + 3, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + ts - 3, py + 3, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === T.PLATFORM) {
      // Platform: pill-shaped with glowing top
      ctx.fillStyle = theme.platform;
      ctx.beginPath();
      ctx.roundRect(px, py, ts, 8, 3);
      ctx.fill();
      // Glowing top line
      ctx.strokeStyle = theme.platformTop;
      ctx.lineWidth = 2;
      ctx.shadowColor = theme.platformTop;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 1);
      ctx.lineTo(px + ts - 2, py + 1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (type === T.SPIKE) {
      // Neon spike
      ctx.shadowColor = theme.spike;
      ctx.shadowBlur = 10;
      ctx.fillStyle = theme.spike;
      ctx.beginPath();
      ctx.moveTo(px + 2, py + ts);
      ctx.lineTo(px + ts / 2, py + 2);
      ctx.lineTo(px + ts - 2, py + ts);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  _drawInteractable(ctx, item, theme) {
    const ts = TILE_SIZE;
    ctx.save();
    if (item.type === 'chest') {
      // Tech-styled chest (dark with neon trim)
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(item.x, item.y, ts, ts);
      // Neon border
      ctx.strokeStyle = theme.solidTop;
      ctx.lineWidth = 2;
      ctx.shadowColor = theme.solidTop;
      ctx.shadowBlur = 12;
      ctx.strokeRect(item.x + 2, item.y + 2, ts - 4, ts - 4);
      // Circuit line decoration
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(item.x + 6, item.y + ts / 2);
      ctx.lineTo(item.x + ts - 6, item.y + ts / 2);
      ctx.stroke();
      // Lock dot
      ctx.fillStyle = theme.solidTop;
      ctx.beginPath();
      ctx.arc(item.x + ts / 2, item.y + ts / 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (item.type === 'plant') {
      // Neon plant (bioluminescent style)
      ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#00cc66';
      ctx.beginPath();
      ctx.ellipse(item.x + ts / 2, item.y + ts * 0.7, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(item.x + ts / 2 - 8, item.y + ts * 0.75, 6, 9, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(item.x + ts / 2 + 8, item.y + ts * 0.75, 6, 9, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#88ffcc';
      ctx.beginPath();
      ctx.ellipse(item.x + ts / 2, item.y + ts * 0.6, 4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  _drawWeaponDrop(ctx, drop) {
    const ts = TILE_SIZE;
    const colors = { brush: '#4a9eff', eraser: '#fa7b17', transform: '#00c8b4' };
    const col = colors[drop.type] || '#fff';
    const bob = Math.sin(Date.now() / 400) * 3;
    ctx.save();
    ctx.fillStyle = col + '33';
    ctx.beginPath();
    ctx.ellipse(drop.x + ts / 2, drop.y + ts * 0.85, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = col; ctx.shadowBlur = 20;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(drop.x + ts / 2, drop.y + ts / 2 + bob, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labels = { brush: 'B', eraser: 'E', transform: 'T' };
    ctx.fillText(labels[drop.type] || '?', drop.x + ts / 2, drop.y + ts / 2 + bob);
    ctx.restore();
  }
}

// ===== TECH LEVEL THEMES =====

// Level 0: Circuit Board — deep green PCB
const CIRCUIT_THEME = {
  solid:       '#0b1a0e',
  solidGrid:   '#1a3020',
  solidTrace:  '#00ff88',
  solidTop:    '#00ff88',
  platform:    '#0d2a18',
  platformTop: '#39ff14',
  spike:       '#39ff14',
  bg1:         '#040d06',
  bg2:         '#081408',
};

// Level 1: Cyber Matrix — deep navy/blue
const CYBER_THEME = {
  solid:       '#060d1a',
  solidGrid:   '#0d1f3a',
  solidTrace:  '#00aaff',
  solidTop:    '#00eaff',
  platform:    '#081428',
  platformTop: '#00aaff',
  spike:       '#00eaff',
  bg1:         '#020810',
  bg2:         '#040d1a',
};

// Level 2: Neon Void — deep purple/void
const NEON_VOID_THEME = {
  solid:       '#100018',
  solidGrid:   '#200030',
  solidTrace:  '#ff00ff',
  solidTop:    '#ff00ff',
  platform:    '#1a0028',
  platformTop: '#cc00ff',
  spike:       '#ff2d55',
  bg1:         '#060010',
  bg2:         '#0a0018',
};

export const LEVEL_THEMES = [CIRCUIT_THEME, CYBER_THEME, NEON_VOID_THEME];

const WEAPON_TYPE_FOR_LEVEL = [
  [WEAPON_TYPES.BRUSH, WEAPON_TYPES.ERASER],
  [WEAPON_TYPES.ERASER, WEAPON_TYPES.TRANSFORM],
  [WEAPON_TYPES.BRUSH, WEAPON_TYPES.TRANSFORM],
];

// ===== BACKGROUND DRAWING =====
export function drawBackground(ctx, cam, levelIndex) {
  const W = cam.width, H = cam.height;
  const t = Date.now() / 1000;

  if (levelIndex === 0) {
    // ─── CIRCUIT BOARD ───────────────────────────────────────────────
    // Deep PCB green base
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#040d06');
    grd.addColorStop(1, '#020805');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Horizontal scanlines
    ctx.strokeStyle = 'rgba(0,255,136,0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Circuit grid traces
    ctx.strokeStyle = 'rgba(0,255,136,0.07)';
    ctx.lineWidth = 1;
    const gridStep = 40;
    for (let x = (cam.x % gridStep); x < W; x += gridStep) {
      ctx.beginPath(); ctx.moveTo(x - (cam.x % gridStep), 0); ctx.lineTo(x - (cam.x % gridStep), H); ctx.stroke();
    }
    for (let y = 0; y < H; y += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Glowing circuit nodes at intersections (sparse)
    ctx.fillStyle = 'rgba(57,255,20,0.5)';
    ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 6;
    for (let x = -cam.x % (gridStep * 3) + gridStep; x < W; x += gridStep * 3) {
      for (let y = gridStep; y < H; y += gridStep * 3) {
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

  } else if (levelIndex === 1) {
    // ─── CYBER MATRIX ────────────────────────────────────────────────
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#020810');
    grd.addColorStop(0.5, '#030c18');
    grd.addColorStop(1, '#020810');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Fine dot grid
    const dot = 48;
    const pulse = 0.25 + 0.15 * Math.sin(t * 1.5);
    ctx.fillStyle = `rgba(0,170,255,${pulse})`;
    ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 4;
    for (let gx = (-cam.x % dot + dot) % dot; gx < W; gx += dot) {
      for (let gy = 0; gy < H; gy += dot) {
        ctx.beginPath(); ctx.arc(gx, gy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    // Moving vertical scanlines
    ctx.strokeStyle = 'rgba(0,234,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // Horizontal raster lines
    for (let y = 0; y < H; y += 3) {
      ctx.strokeStyle = `rgba(0,170,255,${0.02 + 0.01 * Math.sin(y / 20 + t)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

  } else {
    // ─── NEON VOID ───────────────────────────────────────────────────
    const grd = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H / 2, W * 0.8);
    grd.addColorStop(0, '#0f002a');
    grd.addColorStop(0.5, '#080012');
    grd.addColorStop(1, '#030008');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Star field
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    // Use a seeded pattern based on cam.x to simulate parallax
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 137 + Math.floor(cam.x * 0.1)) % W + W) % W;
      const sy = ((i * 97) % H + H) % H;
      const sz = 1 + (i % 3) * 0.5;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 0.8 + i);
      ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Magenta edge bloom
    const edgeGrd = ctx.createLinearGradient(0, 0, 0, H);
    edgeGrd.addColorStop(0, 'rgba(170,0,255,0.15)');
    edgeGrd.addColorStop(0.5, 'rgba(0,0,0,0)');
    edgeGrd.addColorStop(1, 'rgba(255,0,128,0.12)');
    ctx.fillStyle = edgeGrd;
    ctx.fillRect(0, 0, W, H);

    // Moving neon grid lines
    const ng = 80;
    const scroll = (t * 30) % ng;
    ctx.strokeStyle = 'rgba(255,0,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = (-cam.x % ng + ng) % ng; x < W; x += ng) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = scroll; y < H; y += ng) {
      ctx.strokeStyle = `rgba(180,0,255,${0.04 + 0.03 * Math.sin(y / 40 + t)})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }
}
