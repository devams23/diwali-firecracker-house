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
