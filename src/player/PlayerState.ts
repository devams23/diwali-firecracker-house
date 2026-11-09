// Snapshot of what the player is carrying and has done, used to choose the one onboarding hint shown
// when nothing is focused. Pure logic so the hint order can be tested under Node.

/** Facts about the player's progress that decide which hint to show. */
export interface PlayerState {
  /** True once the player has taken a pack from the stall, which retires the "go to the stall" hint. */
  visitedStall: boolean;
  /** English name of the cracker selected on the hotbar. */
  selectedName: string;
  /** Crackers of the selected kind still carried. */
  selectedCount: number;
  /** Crackers of every kind still carried. */
  totalCount: number;
  /** Crackers placed on the ground that have not been lit yet. */
  placedUnlit: number;
  /** Crackers fired so far this session. */
  burstCount: number;
  /** Lamps of the verandah diya row lit so far; while it is zero the first hint invites the player to light them. */
  diyasLit: number;
  /** Devanagari name of the selected cracker, shown beside the English one in the place prompt. */
  selectedHindi: string;
  /** True when the selected kind is held in the left hand (phuljhadi, pencil) rather than set on the ground. */
  selectedHandheld: boolean;
  /** True when the selected kind is the Akash Kandil sky lantern, which is released rather than placed. */
  selectedLantern: boolean;
  /** English name of the cracker in the left hand, or '' when the hand is empty. */
  heldName: string;
  /** True while the cracker in the left hand has not been lit yet. */
  heldUnlit: boolean;
}

/** One contextual action prompt: an optional key shown as a keycap and the text after it. */
export interface ActionPrompt {
  /** Keycap label ("F", "E", "Click"), or null for a prompt with no key. */
  key: string | null;
  /** The words after the keycap. */
  text: string;
}

/**
 * The prompt for the pill above the hotbar when nothing is aimed at: the next action and the key that does it.
 * `stepBack` is true for the few seconds after a light. Pure, so every branch can be tested.
 */
export function contextPrompt(s: PlayerState, stepBack: boolean): ActionPrompt {
  if (stepBack) return { key: null, text: 'Step back!' };
  if (s.placedUnlit > 0) return { key: 'Click', text: 'Light the fuse' };
  if (s.heldUnlit) return { key: 'Click', text: `Light the ${s.heldName.toLowerCase()}` };
  if (s.diyasLit === 0) return { key: null, text: 'Light the diyas on the verandah — aim and click · दीप जलाइए' };
  if (s.selectedCount === 0) return { key: null, text: 'Restock at the stall' };
  if (s.selectedLantern) return { key: 'F', text: 'Release a sky lantern' };
  if (s.selectedHandheld) {
    return s.heldName
      ? { key: null, text: `Enjoy the ${s.heldName.toLowerCase()}` }
      : { key: 'F', text: `Hold ${s.selectedName}` };
  }
  return { key: 'F', text: `Place ${s.selectedName} · ${s.selectedHindi}` };
}

/**
 * Returns the single hint for the current state, checked in priority order so the next useful step
 * is always the one shown.
 */
export function nextHint(s: PlayerState): string {
  if (s.placedUnlit > 0) return 'Aim at the fuse and click to light it';
  // Lighting the lamps comes first, as at home: a newcomer is told the verandah diyas are waiting for their agarbatti.
  if (s.diyasLit === 0) return 'Light the diyas on the verandah — aim and click · दीप जलाइए';
  if (s.selectedCount === 0) {
    return s.totalCount > 0
      ? `Out of ${s.selectedName} — restock at the stall`
      : 'Out of crackers — restock at the stall';
  }
  if (!s.visitedStall) return 'Pick crackers at the stall · E';
  return 'F — place · aim at the fuse and click';
}
