import type { RPSActions } from '@game/game-logic';
import type { SQLUpdate } from '@paima/node-sdk/db';
import { createScheduledData } from '@paima/node-sdk/db';

// Schedule a practive move update to be executed in the future
export function schedulePracticeMove(
  lobbyId: string,
  round: number,
  move: RPSActions,
  block_height: number
): SQLUpdate {
  return createScheduledData(createPracticeInput(lobbyId, round, move), block_height);
}

function createPracticeInput(lobbyId: string, round: number, move: RPSActions) {
  return `s|*${lobbyId}|${round}|${move}`;
}
