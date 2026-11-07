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
  /** Moves the player to (x, z) on the ground, turns them to `yaw` radians and tilts the view to `pitch` radians. */
  teleport(x: number, z: number, yaw: number, pitch?: number): void;
  /** A copy of the gameplay state the prompts use, including the finale burst count. */
  state(): PlayerState;
  /** Picks up the thaali with four crackers on it, and holds the agarbatti already lit in the right hand. */
  pickupAll(): void;
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
