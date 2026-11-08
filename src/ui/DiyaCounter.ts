// Diya counter: a small plaque near the top centre that reads "दीप 3 / 11" while the row of diyas is being lit. It stays
// subtle until the first lamp is lit, then holds at full strength, with a gold glow once all are lit.
import './diyaCounter.css';

/** The "diya n / total" plaque. */
export class DiyaCounter {
  private readonly root: HTMLDivElement;
  private readonly count: HTMLSpanElement;
  /** One line under the plaque telling a newcomer what the count is for; it goes once every lamp is lit. */
  private readonly caption: HTMLDivElement;

  /** Builds the plaque inside `parent`, hidden until show(true) is called. */
  constructor(parent: HTMLElement, total: number) {
    this.root = document.createElement('div');
    this.root.className = 'diya-counter';
    this.root.hidden = true;
    const word = document.createElement('span');
    word.className = 'diya-counter-word';
    word.textContent = 'दीप';
    this.count = document.createElement('span');
    this.count.className = 'diya-counter-count';
    this.caption = document.createElement('div');
    this.caption.className = 'diya-counter-caption';
    this.caption.textContent = 'Light the verandah lamps with your agarbatti';
    this.root.append(word, this.count, this.caption);
    parent.appendChild(this.root);
    this.set(0, total);
  }

  /** Shows the plaque while play is live, and hides it on the intro card and in the pause panel. */
  show(on: boolean): void {
    this.root.hidden = !on;
  }

  /** Writes "lit / total" and lights the plaque in gold once every lamp is lit. */
  set(lit: number, total: number): void {
    this.count.textContent = `${lit} / ${total}`;
    this.root.classList.toggle('is-started', lit > 0);
    this.root.classList.toggle('is-done', lit >= total);
    this.caption.hidden = lit >= total;
  }
}
