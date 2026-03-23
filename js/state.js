// ===== STATE MANAGER =====
// Global mutable game state shared across all modules

export const SCREENS = {
  START: 'start',
  CHARACTER: 'character',
  WEAPON_SELECT: 'weapon_select',
  GAME: 'game',
  WIN: 'win',
  DEATH: 'death',
};

export const state = {
  screen: SCREENS.START,
  volume: 0.6,

  // Character customization
  avatar: {
    species: 'human',   // 'human' | 'dog' | 'cat'
    skinTone: 0,        // index into skin tone palette
    hair: 0,            // hair style index
    clothes: 0,         // clothes style index
  },

  // Current run data
  player: null,
  levelIndex: 0,        // 0=Collage, 1=PhotoComposite, 2=Poster(Boss)
  chestsOpened: 0,
  currentLevel: null,
  camera: null,

  // Between-level persistence
  persistedPlayerHP: null,

  // Settings
  audioContext: null,
  masterGain: null,
};

export function setScreen(s) {
  state.screen = s;
}
