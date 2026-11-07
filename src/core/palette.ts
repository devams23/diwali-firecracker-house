// Single source of truth for the game's colours: Diwali night, clay, brass and flame tones
// for 3D materials (hex numbers for three.js) and UI chrome (CSS strings).
/** Scene colours as three.js hex numbers. */
export const PALETTE = {
  night: 0x0b1020,
  moon: 0x6f80a8,
  plaster: 0xe8dcc4,
  geru: 0x9c3b22,
  earth: 0x7a5a3c,
  wood: 0x5a3b22,
  brass: 0xc9a24a,
  flame: 0xffb347,
  marigold: 0xf2a01f,
} as const;

/** HUD colours as CSS strings. */
export const UI = {
  bg: 'rgba(28,18,10,0.72)',
  gold: '#d9b46a',
  text: '#f3e7cf',
} as const;
