// Pure slot allocator for pooled effects (sparks, smoke, flashes). It has no three.js dependency, hands out
// free indices in O(1), and when every slot is busy recycles a slot in ring order so emitting never fails.
// Keeping it free of rendering code lets the allocation rules be unit-tested directly.

/** Fixed-capacity index pool: free indices come from a stack, and a full pool recycles in ring order. */
export class SparkPool {
  /** Number of slots; every returned index is in [0, capacity). */
  readonly capacity: number;

  private readonly free: Int32Array;
  private freeCount: number;
  private readonly inUse: Uint8Array;
  private ring = 0;
  private used = 0;

  /** Creates a pool of `capacity` slots, all initially free. */
  constructor(capacity: number) {
    this.capacity = capacity;
    this.free = new Int32Array(capacity);
    // Stack is filled high-to-low so the first alloc returns index 0.
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
    this.freeCount = capacity;
    this.inUse = new Uint8Array(capacity);
  }

  /** Number of slots currently in use. */
  get alive(): number {
    return this.used;
  }

  /**
   * Returns a slot index. While free slots remain, the most recently released one is reused first.
   * When full, the slot at the ring cursor is taken over (it is the one that has been alive longest
   * in ring order), so the caller overwrites the oldest effect instead of dropping the new one.
   */
  alloc(): number {
    if (this.freeCount > 0) {
      const idx = this.free[--this.freeCount];
      this.inUse[idx] = 1;
      this.used++;
      return idx;
    }
    const idx = this.ring;
    this.ring = (this.ring + 1) % this.capacity;
    return idx;
  }

  /** True while the slot is held by a live effect. */
  isInUse(i: number): boolean {
    return this.inUse[i] === 1;
  }

  /** Marks a slot free again; releasing a slot that is not in use is ignored. */
  release(i: number): void {
    if (i < 0 || i >= this.capacity || this.inUse[i] === 0) return;
    this.inUse[i] = 0;
    this.used--;
    this.free[this.freeCount++] = i;
  }
}
