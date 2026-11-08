// Cracker catalogue: the eleven kinds (ten crackers and the Akash Kandil sky lantern) in fixed order with their English and Hindi names,
// fuse times, hand-held flag, box tint and pack size. Shared by the stall boxes, the inventory and the firing systems.

/** Identifier for every cracker the game knows about. */
export type CrackerKind =
  | 'phuljhadi'
  | 'pencil'
  | 'anar'
  | 'chakri'
  | 'rocket'
  | 'laxmi'
  | 'sutli'
  | 'ladi'
  | 'saanp'
  | 'skyshot'
  | 'kandil';

/** Display metadata for one cracker kind. */
export interface CrackerInfo {
  /** English name printed on the box. */
  label: string;
  /** Devanagari name printed under the English one. */
  hindi: string;
  /** True for crackers lit and held in the left hand rather than placed on the ground. */
  handheld: boolean;
  /** Seconds between lighting the fuse and the effect. */
  fuse: number;
  /** Muted box band colour as a hex number. */
  tint: number;
  /** Crackers in one pack, added to the inventory each time a stall box is bought from. */
  pack: number;
}

/** Stable order used for the takht row and the Q/scroll cycle. */
export const CRACKER_ORDER: CrackerKind[] = [
  'phuljhadi',
  'pencil',
  'anar',
  'chakri',
  'rocket',
  'laxmi',
  'sutli',
  'ladi',
  'saanp',
  'skyshot',
  'kandil',
];

/** Metadata per kind; fuse times and placements follow the design spec's cracker table. */
export const CRACKERS: Record<CrackerKind, CrackerInfo> = {
  phuljhadi: { label: 'Phuljhadi', hindi: 'फुलझड़ी', handheld: true, fuse: 0, tint: 0xc9a24a, pack: 10 },
  pencil: { label: 'Pencil', hindi: 'पेंसिल', handheld: true, fuse: 0, tint: 0x5f8a6a, pack: 10 },
  anar: { label: 'Anar', hindi: 'अनार', handheld: false, fuse: 2.5, tint: 0xa8583a, pack: 5 },
  chakri: { label: 'Chakri', hindi: 'चकरी', handheld: false, fuse: 2, tint: 0x7a8a9a, pack: 5 },
  rocket: { label: 'Rocket', hindi: 'रॉकेट', handheld: false, fuse: 2, tint: 0x6a7f8f, pack: 5 },
  laxmi: { label: 'Laxmi Bomb', hindi: 'लक्ष्मी बम', handheld: false, fuse: 2.5, tint: 0x9c3b22, pack: 10 },
  sutli: { label: 'Sutli Bomb', hindi: 'सुतली बम', handheld: false, fuse: 4, tint: 0x8a6e4a, pack: 3 },
  ladi: { label: 'Ladi', hindi: 'लड़ी', handheld: false, fuse: 2, tint: 0xb0603a, pack: 1 },
  saanp: { label: 'Saanp Goli', hindi: 'साँप गोली', handheld: false, fuse: 1.5, tint: 0x4f6a5a, pack: 10 },
  skyshot: { label: 'Sky Shot', hindi: 'स्काई शॉट', handheld: false, fuse: 3, tint: 0x3f5a7a, pack: 1 },
  // The sky lantern is not a cracker: F lights it in hand and lets it go (see features/SkyLanterns).
  kandil: { label: 'Akash Kandil', hindi: 'आकाश कंदील', handheld: false, fuse: 0, tint: 0xb5652a, pack: 3 },
};
