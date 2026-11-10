// Entry point. On a laptop or desktop it hands the two page containers to the Game, which builds the village and
// starts the loop. On a phone or small screen it shows the "Happy Diwali, play on a bigger screen" card instead; the
// game is imported lazily, so small screens never download three.js or the music.
import { isSmallScreen, showSmallScreenCard } from './ui/SmallScreen';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;

// The static "about" text in index.html is for search engines, AI crawlers and no-script visitors; once the script
// runs, the game or the phone card takes the whole page, so remove it.
document.getElementById('about')?.remove();

if (isSmallScreen()) {
  showSmallScreenCard(app);
} else {
  void import('./Game').then(({ Game }) => new Game(app, ui).start());
}
