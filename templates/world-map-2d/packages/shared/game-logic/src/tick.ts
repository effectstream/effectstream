import type Prando from '@paima/sdk/prando';
import type { MatchState, MatchEnvironment, TickEvent } from './types';

// Executes a round executor tick and generates a tick event as a result
export function processTick(
  matchEnvironment: MatchEnvironment,
  matchState: MatchState,
  moves: never[],
  currentTick: number,
  __: Prando
): TickEvent[] | null {
  if (currentTick != 1) return null;
  const event: TickEvent = {};
  applyEvents(matchState, event);
  return [event];
}

// Apply events to match state for the roundExecutor.
// eslint-disable-next-line @typescript-eslint/no-empty-function
function applyEvents(matchState: MatchState, event: TickEvent): void {}
