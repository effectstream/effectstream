import type { RPSSummary } from '@game/game-logic';
import { RockPaperScissors } from '@game/game-logic';
import type Prando from '@paima/sdk/prando';

//
// PracticeAI generates a move based on the current game state and prando.
//
// NOTE: RockPaperScissors generates a totally random next move
//
export class PracticeAI {
  rps: RockPaperScissors;
  randomnessGenerator: Prando;

  constructor(gameState: RPSSummary, randomnessGenerator: Prando) {
    this.rps = new RockPaperScissors(gameState);
    this.randomnessGenerator = randomnessGenerator;
  }

  public getNextMove() {
    return this.rps.genrateRandomMove(this.randomnessGenerator);
  }
}
