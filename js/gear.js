// ===== GEAR & ACCESSORY SYSTEM =====
import { state } from './state.js';

export const GEAR_TYPES = [
  {
    id: 'layer_mask',
    name: 'Layer Mask Vest',
    slot: 'gear',
    icon: '🛡️',
    color: '#4a9eff',
    desc: 'Reduce damage by 1.5% per chest opened (cap 45%)',
    rarity: 'common',
    baseScale: 0.015,
    capScale: 0.45,
    apply(player, stacks) {
      const reduction = Math.min(this.capScale, this.baseScale * state.chestsOpened * (1 + stacks * 0.3));
      player._gearArmorBonus = (player._gearArmorBonus || 0) + reduction;
    }
  },
  {
    id: 'smart_object',
    name: 'Smart Object Charm',
    slot: 'gear',
    icon: '⚡',
    color: '#f7c948',
    desc: 'Ultimate charges 30% faster per stack',
    rarity: 'rare',
    apply(player, stacks) {
      player._ultimateChargeBonus = (player._ultimateChargeBonus || 1) * (1 + 0.3 * stacks);
    }
  },
  {
    id: 'blend_mode',
    name: 'Blend Mode Belt',
    slot: 'gear',
    icon: '🌀',
    color: '#fa7b17',
    desc: '20% chance to apply element on hit (+5% per chest opened)',
    rarity: 'uncommon',
    apply(player, stacks) {
      player._blendProc = Math.min(0.7, 0.2 + 0.05 * state.chestsOpened * (1 + stacks * 0.2));
    }
  },
  {
    id: 'hue_shift',
    name: 'Hue-Shift Cloak',
    slot: 'gear',
    icon: '🎨',
    color: '#00c8b4',
    desc: 'Speed boost after taking damage (scales with chests opened)',
    rarity: 'uncommon',
    apply(player, stacks) {
      player._hueSpeedBoost = 1.5 + 0.05 * state.chestsOpened * stacks;
    }
  },
];

export const ACCESSORY_TYPES = [
  {
    id: 'magic_wand',
    name: 'Magic Wand Ring',
    slot: 'accessory',
    icon: '💍',
    color: '#c678dd',
    desc: 'Clicking near enemies pulls them toward you',
    rarity: 'uncommon',
    pullRadius: 120, pullForce: 350,
  },
  {
    id: 'clone_stamp',
    name: 'Clone Stamp Locket',
    slot: 'accessory',
    icon: '📿',
    color: '#56b6c2',
    desc: '15% + 5%/stack chance to hit twice',
    rarity: 'rare',
    apply(player, stacks) {
      player._doubleHitChance = Math.min(0.6, 0.15 + 0.05 * stacks);
    }
  },
  {
    id: 'gradient_gloves',
    name: 'Gradient Gloves',
    slot: 'accessory',
    icon: '🧤',
    color: '#e5c07b',
    desc: 'Each consecutive hit +3% dmg (max 45%): scales with stacks',
    rarity: 'common',
    apply(player, stacks) {
      player._gradientMax = 0.45 + 0.1 * stacks;
      player._gradientStep = 0.03;
    }
  },
  {
    id: 'eyedropper',
    name: 'Eyedropper Earring',
    slot: 'accessory',
    icon: '💧',
    color: '#98c379',
    desc: 'Restore 2HP per kill (+ 1HP per stack)',
    rarity: 'common',
    apply(player, stacks) {
      player._lifeOnKill = 2 + stacks;
    }
  },
];

const ALL_LOOT = [...GEAR_TYPES, ...ACCESSORY_TYPES];

export function rollChestLoot(count = 3) {
  // Return 3 random unique loot items
  const pool = [...ALL_LOOT];
  const result = [];
  while (result.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

export function applyGearToPlayer(player) {
  // Reset gear bonuses
  player._gearArmorBonus = 0;
  player._ultimateChargeBonus = 1;
  player._blendProc = 0;
  player._hueSpeedBoost = 1;
  player._doubleHitChance = 0;
  player._gradientMax = 0;
  player._gradientStep = 0;
  player._lifeOnKill = 0;
  player._pullRadius = 0;
  player._pullForce = 0;

  const allEquipped = [
    ...(player.gear || []),
    ...(player.accessories || []),
  ];

  for (const item of allEquipped) {
    const def = ALL_LOOT.find(l => l.id === item.id);
    if (!def) continue;
    const stacks = item.stacks || 1;
    if (def.apply) def.apply(player, stacks);
    if (def.id === 'magic_wand') {
      player._pullRadius = def.pullRadius;
      player._pullForce = def.pullForce;
    }
  }
}

export function getLootById(id) {
  return ALL_LOOT.find(l => l.id === id);
}
