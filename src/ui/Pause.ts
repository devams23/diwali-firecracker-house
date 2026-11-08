// Pause overlay, shown when pointer lock is lost after the intro: a dim layer with a small panel at bottom-left
// holding Resume, a sound toggle and the list of controls. It only reports button presses; the game acts on them.

/** What the pause panel asks the game to do. */
export interface PauseActions {
  /** Called when Resume is pressed; the game re-requests the pointer lock. */
  onResume(): void;
  /** Called when the sound button is pressed; the game flips the mute state. */
  onToggleSound(): void;
  /** Read each time the panel is shown, to label the sound button On or Off. */
  isSoundOn(): boolean;
}

/** Pause panel with Resume, a sound toggle and the controls list. */
export class Pause {
  private readonly el: HTMLDivElement;
  private readonly soundBtn: HTMLButtonElement;
  private readonly actions: PauseActions;

  /** Builds the overlay inside `parent`, hidden until setOpen(true). */
  constructor(parent: HTMLElement, actions: PauseActions) {
    this.actions = actions;
    this.el = document.createElement('div');
    this.el.className = 'pause';
    this.el.hidden = true;
    this.el.innerHTML =
      '<div class="pause-panel">' +
      '<h2 class="pause-title">Paused</h2>' +
      '<button type="button" class="pause-resume">Resume</button>' +
      '<button type="button" class="pause-sound"></button>' +
      '<ul class="controls">' +
      '<li>WASD walk, mouse look</li>' +
      '<li>E pick up, take or act</li>' +
      '<li>F set the selected cracker down</li>' +
      '<li>Q or scroll choose a cracker</li>' +
      '<li>1–0 or wheel pick a slot on the hotbar</li>' +
      '<li>Click touch the flame to a fuse</li>' +
      '<li>M sound on or off</li>' +
      '</ul></div>';
    this.soundBtn = this.el.querySelector<HTMLButtonElement>('.pause-sound') as HTMLButtonElement;
    this.el.querySelector('.pause-resume')?.addEventListener('click', () => this.actions.onResume());
    this.soundBtn.addEventListener('click', () => this.actions.onToggleSound());
    parent.appendChild(this.el);
  }

  /** Shows or hides the overlay; showing it also refreshes the sound label. */
  setOpen(open: boolean): void {
    this.el.hidden = !open;
    if (open) this.refresh();
  }

  /** Updates the sound button's label to the current mute state. */
  refresh(): void {
    this.soundBtn.textContent = `Sound: ${this.actions.isSoundOn() ? 'On' : 'Off'}`;
  }
}
