import type { SQLUpdate } from '@paima/node-sdk/db';
import { createScheduledData, deleteScheduledData } from '@paima/node-sdk/db';

// Schedule a zombie round to be executed in the future
export function scheduleZombieRound(lobbyId: string, block_height: number): SQLUpdate {
  return createScheduledData(createZombieInput(lobbyId), block_height);
}

// Delete a scheduled zombie round to be executed in the future
export function deleteZombieRound(lobbyId: string, block_height: number): SQLUpdate {
  return deleteScheduledData(createZombieInput(lobbyId), block_height);
}

// Create the zombie round input
function createZombieInput(lobbyId: string): string {
  return `z|*${lobbyId}`;
}
