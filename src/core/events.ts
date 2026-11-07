// Typed publish/subscribe bus so gameplay systems (fireworks, lighting, finale) can
// react to each other without importing one another directly.
/** Typed event emitter: each key maps to a payload type and listeners get that payload. */
export class Emitter<T extends Record<string, unknown>> {
  private handlers: { [K in keyof T]?: Set<(p: T[K]) => void> } = {};

  /** Subscribe to an event; returns an unsubscribe function. */
  on<K extends keyof T>(k: K, fn: (p: T[K]) => void): () => void {
    let set = this.handlers[k];
    if (!set) {
      set = new Set();
      this.handlers[k] = set;
    }
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  /** Deliver a payload to every current listener of the event. */
  emit<K extends keyof T>(k: K, p: T[K]): void {
    const set = this.handlers[k];
    if (!set) return;
    // Copy first so listeners that unsubscribe during dispatch do not skip others.
    for (const fn of [...set]) fn(p);
  }
}

/** Cross-system game events. Payloads are in metres (x, y, z) where spatial. */
export type GameEvents = {
  burst: { x: number; y: number; z: number; power: number };
  lit: { kind: string };
  finale: {};
};

/** Shared singleton bus used by all game systems. */
export const events = new Emitter<GameEvents>();
