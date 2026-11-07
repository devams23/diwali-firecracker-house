// Entry point: hands the two page containers to the Game, which builds the village and starts the loop.
import { Game } from './Game';

new Game(document.getElementById('app')!, document.getElementById('ui')!).start();
