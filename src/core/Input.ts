// Keyboard, mouse and pointer-lock state gathered once per frame. Systems read held keys,
// single presses, clicks, wheel ticks and mouse deltas; endFrame() clears the per-frame parts.
// Keys are read by KeyboardEvent.code so they follow physical position on any layout.

/** Frame-based input snapshot shared by the player controller and HUD interactions. */
export class Input {
  private readonly dom: HTMLElement;
  private readonly held = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private clickedThisFrame = false;
  private wheelThisFrame = 0;
  private mouseX = 0;
  private mouseY = 0;

  /** Attaches listeners: keys on the window, clicks and wheel on the given canvas element. */
  constructor(dom: HTMLElement) {
    this.dom = dom;
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressedThisFrame.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    dom.addEventListener('mousedown', () => {
      this.clickedThisFrame = true;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY !== 0) this.wheelThisFrame += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    });
  }

  /** True while the physical key with this code is held down. */
  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True once per physical press; the flag is cleared by endFrame(). */
  pressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  /** True if the canvas was clicked this frame. */
  clicked(): boolean {
    return this.clickedThisFrame;
  }

  /** Net wheel direction this frame: -1 (scroll up), 0, or 1 (scroll down). */
  wheel(): number {
    return Math.max(-1, Math.min(1, this.wheelThisFrame));
  }

  /** Mouse movement accumulated this frame while the pointer is locked. */
  mouseDelta(): { x: number; y: number } {
    return { x: this.mouseX, y: this.mouseY };
  }

  /** Whether the pointer is captured by the canvas (first-person mode is active). */
  get locked(): boolean {
    return document.pointerLockElement === this.dom;
  }

  /** Asks the browser to capture the pointer on the canvas; must follow a user gesture. */
  requestLock(): void {
    // Some browsers return a promise that rejects when the lock is refused; a refusal is harmless here.
    (this.dom.requestPointerLock() as unknown as Promise<void> | undefined)?.catch(() => {});
  }

  /** Clears per-frame state (presses, clicks, wheel, mouse delta); call once at frame end. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.clickedThisFrame = false;
    this.wheelThisFrame = 0;
    this.mouseX = 0;
    this.mouseY = 0;
  }
}
