// Debug hook for automated browser tests only. When the page URL has a `debug` query flag, Game exposes the
// tools below on window.__diwali so Playwright can place crackers, light them and read the game state. A normal
// visit never sets the flag, so nothing here runs for players.
import type { CrackerKind } from './crackers/catalog';
import type { PlayerState } from './player/PlayerState';

/** The tools the debug hook exposes to automated tests. */
export interface DiwaliDebug {
  /** Puts a cracker of this kind on the ground 3 m ahead of the player, in the direction they face. */
  place(kind: CrackerKind): void;
  /** Lights every cracker on the ground that has not been lit yet. */
  lightAll(): void;
  /** Releases a sky lantern in front of the player, as F would with one selected (no stock needed). */
  releaseLantern(): void;
  /** Lights the first n diyas of the verandah row (all twelve when n is omitted). */
  lightDiyas(n?: number): void;
  /** Force-starts the drone show at once, skipping the diyas and the countdown. */
  droneShow(): void;
  /** Where the drone show is: 'waiting', 'countdown', 'live' or 'done'. */
  droneState(): 'waiting' | 'countdown' | 'live' | 'done';
  /** Moves the player to (x, z) on the ground, turns them to `yaw` radians and tilts the view to `pitch` radians. */
  teleport(x: number, z: number, yaw: number, pitch?: number): void;
  /** A copy of the gameplay state the prompts use, including the finale burst count. */
  state(): PlayerState;
  /** Places a phuljhadi in the left hand (the lit agarbatti is already in the right), for a held-state capture. */
  heldShot(): void;
  /** Fires a salvo of six neighbour shells at once, a mix of peony, willow and ring, aimed around the yaw (radians). */
  skyShow(yaw: number): void;
  /** How many shells are bursting right now; a capture polls this to catch the bright window. */
  skyBursting(): number;
  /** Each cracker on the ground with its fuse phase, oldest first, so a test can see a click lit it. */
  crackers(): { kind: string; phase: string }[];
  /**
   * Runs the left-click action exactly as a mouse click does in play. Headless browsers grant pointer lock unreliably,
   * and play ignores clicks without it, so tests click through here.
   */
  click(): void;
  /** Id of the aim target under the crosshair this frame (e.g. `cracker-chakri`), or null when nothing is aimed at. */
  focusId(): string | null;
  /** Fast-forwards every system by this many game seconds without rendering, so a capture lands on a later moment. */
  advance(seconds: number): void;
}

declare global {
  interface Window {
    /** Set only when the page URL has `?debug`; see installDebugHook. */
    __diwali?: DiwaliDebug;
  }
}

/** True when the page's query string asks for the debug hook, that is, it contains a `debug` parameter. */
export function debugRequested(search: string): boolean {
  return new URLSearchParams(search).has('debug');
}

/** Publishes the debug tools on window.__diwali. Call only when debugRequested() is true. */
export function installDebugHook(api: DiwaliDebug): void {
  window.__diwali = api;
}
