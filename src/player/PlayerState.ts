// Snapshot of what the player is carrying and has done, used to choose the one onboarding hint shown
// when nothing is focused. Pure logic so the hint order can be tested under Node.
/** Facts about the player's progress that decide which hint to show. */
export interface PlayerState {
  /** Where the thaali currently is. */
  thaali: 'charpai' | 'hand' | 'ground';
  /** True once the agarbatti has been picked up from the tulsi chaura. */
  hasAgarbatti: boolean;
  /** True once the agarbatti tip has been lit at a diya. */
  agarbattiLit: boolean;
  /** What the left hand holds: the thaali itself, a cracker taken from it, or nothing. */
  leftHand: 'thaali' | 'cracker' | 'empty';
  /** Crackers still on the thaali. */
  thaaliCount: number;
  /** Crackers placed on the ground that have not been lit yet. */
  placedUnlit: number;
  /** Crackers fired so far this session. */
  burstCount: number;
}

/**
 * Returns the single hint for the current state, checked in priority order so the next useful step
 * is always the one shown.
 */
export function nextHint(s: PlayerState): string {
  if (s.thaali === 'charpai') return 'Your thaali is on the charpai — go pick it up';
  if (s.thaali === 'hand' && s.thaaliCount === 0) return 'Fill your thaali at the takht by the verandah';
  if (!s.hasAgarbatti) return 'Take the agarbatti from the tulsi chaura';
  if (!s.agarbattiLit) return 'Light the agarbatti at the diya first';
  if (s.placedUnlit > 0) return 'Touch the agarbatti to the fuse — click';
  if (s.thaaliCount > 0) return 'Q / scroll to choose · F to place it on the ground';
  return 'Shubh Deepavali — the takht has more';
}
