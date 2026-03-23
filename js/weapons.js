// ===== WEAPON DEFINITIONS =====
// Weapons: Brush, Eraser, Transform Tool

export const WEAPON_TYPES = {
  BRUSH: 'brush',
  ERASER: 'eraser',
  TRANSFORM: 'transform',
};

// Stat bonus pools per weapon
const BONUS_POOLS = {
  [WEAPON_TYPES.BRUSH]: [
    { id: 'dmg',      label: '+Damage',        apply: (w) => { w.damage += 4 + rng(4); } },
    { id: 'dot',      label: '+DoT Damage',     apply: (w) => { w.dotDmg += 2 + rng(2); } },
    { id: 'trailDur', label: '+Trail Duration', apply: (w) => { w.trailDuration += 0.3 + rng(0.3); } },
    { id: 'arc',      label: '+Splash Arc',     apply: (w) => { w.arcAngle += 0.2 + rng(0.1); } },
    { id: 'crit',     label: '+Crit Chance',    apply: (w) => { w.critChance += 0.05 + rng(0.05); } },
    { id: 'speed',    label: '+Attack Speed',   apply: (w) => { w.cooldown = Math.max(0.1, w.cooldown - 0.05); } },
  ],
  [WEAPON_TYPES.ERASER]: [
    { id: 'dmg',      label: '+Damage',         apply: (w) => { w.damage += 5 + rng(4); } },
    { id: 'kb',       label: '+Knockback',      apply: (w) => { w.knockback += 80 + rng(60); } },
    { id: 'dashDist', label: '+Dash Distance',  apply: (w) => { w.dashDist += 40 + rng(30); } },
    { id: 'range',    label: '+Range',          apply: (w) => { w.range += 20 + rng(15); } },
    { id: 'armor',    label: '+Armor Shred',    apply: (w) => { w.armorShred += 0.04 + rng(0.04); } },
    { id: 'speed',    label: '+Attack Speed',   apply: (w) => { w.cooldown = Math.max(0.1, w.cooldown - 0.04); } },
  ],
  [WEAPON_TYPES.TRANSFORM]: [
    { id: 'projSpd',  label: '+Proj Speed',     apply: (w) => { w.projSpeed += 60 + rng(40); } },
    { id: 'resize',   label: '+Resize Duration',apply: (w) => { w.resizeDuration += 0.5 + rng(0.4); } },
    { id: 'dmg',      label: '+Damage',         apply: (w) => { w.damage += 3 + rng(5); } },
    { id: 'grapple',  label: '+Grapple Count',  apply: (w) => { w.grappleCount = Math.min(5, w.grappleCount+1); } },
    { id: 'crit',     label: '+Crit Chance',    apply: (w) => { w.critChance += 0.04 + rng(0.05); } },
    { id: 'speed',    label: '+Attack Speed',   apply: (w) => { w.cooldown = Math.max(0.12, w.cooldown - 0.04); } },
  ],
};

function rng(max) { return Math.random() * max; }

function createBase(type) {
  switch (type) {
    case WEAPON_TYPES.BRUSH:
      return {
        type, name: 'Brush',
        damage: 18, dotDmg: 4, trailDuration: 1.2, arcAngle: 1.0,
        critChance: 0.08, cooldown: 0.35, range: 80,
        bonuses: [], bonusLabels: [],
        color: '#4a9eff', icon: '🖌️',
        specialCooldown: 5, specialCharge: 0,
      };
    case WEAPON_TYPES.ERASER:
      return {
        type, name: 'Eraser',
        damage: 22, knockback: 280, dashDist: 140, range: 90,
        armorShred: 0.06, critChance: 0.05, cooldown: 0.4,
        bonuses: [], bonusLabels: [],
        color: '#fa7b17', icon: '⬜',
        specialCooldown: 4, specialCharge: 0,
      };
    case WEAPON_TYPES.TRANSFORM:
      return {
        type, name: 'Transform',
        damage: 14, projSpeed: 400, resizeDuration: 2.0, grappleCount: 2,
        critChance: 0.1, cooldown: 0.3,
        bonuses: [], bonusLabels: [],
        color: '#00c8b4', icon: '⬛',
        specialCooldown: 6, specialCharge: 0,
      };
  }
}

function addRandomBonus(weapon) {
  if (weapon.bonuses.length >= 4) return false;
  const pool = BONUS_POOLS[weapon.type];
  // Avoid duplicate bonus IDs
  const available = pool.filter(b => !weapon.bonuses.includes(b.id));
  if (available.length === 0) return false;
  const bonus = available[Math.floor(Math.random() * available.length)];
  bonus.apply(weapon);
  weapon.bonuses.push(bonus.id);
  weapon.bonusLabels.push(bonus.label);
  return true;
}

export function createWeapon(type) {
  const w = createBase(type);
  addRandomBonus(w); // starts with 1 random bonus
  return w;
}

export function upgradeWeapon(weapon) {
  // Called when player picks up duplicate weapon
  return addRandomBonus(weapon);
}

export const WEAPON_NAMES = {
  [WEAPON_TYPES.BRUSH]: 'Brush',
  [WEAPON_TYPES.ERASER]: 'Eraser',
  [WEAPON_TYPES.TRANSFORM]: 'Transform Tool',
};

export const WEAPON_DESCS = {
  [WEAPON_TYPES.BRUSH]: 'Wide paint arc. Leaves DoT trails.\nSpecial: Splatter Burst — circular AoE explosion.',
  [WEAPON_TYPES.ERASER]: 'Short cone blast with massive knockback.\nSpecial: Wipe — dash through enemies.',
  [WEAPON_TYPES.TRANSFORM]: 'Ranged bounding-box projectile. Resizes enemies.\nSpecial: Free Transform — grapple & slam up to 3 foes.',
};
