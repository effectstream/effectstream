/**
 * Offline-practice AI smoke test — pure game logic, NO backend and NO browser.
 *
 * Guards the regression where the practice AI threw
 *   "playerCopy.minMaxScore is not a function"
 * because Game.import() rehydrates every player as a base `Player` (not an
 * `AIPlayer`), so the `as AIPlayer` cast in AIPlayer.minMaxMove was a lie at
 * runtime. The fix scores via the real AIPlayer (`this`) instead of the imported
 * copy. This test sets up the same 0-human / 5-AI practice game that index.ts
 * launches in PRACTICE mode and runs one AI turn end-to-end.
 *
 * Run standalone:  bun run packages/frontend/practice-ai.test.ts   (or: bun run test:practice)
 */
import { AIPlayer, BuildingType, UnitType } from "@hex-battle/engine";
import { RandomGame } from "./src/random-game.ts";

const game = new RandomGame(
  "PRACTICE",
  "OFFLINE",
  0, // humans
  5, // AIs
  "large",
  [UnitType.UNIT_1],
  [BuildingType.BASE],
  4,
  100,
  0.24,
);

const player = game.getCurrentPlayer();
if (!(player instanceof AIPlayer)) {
  console.error(
    "[TEST] offline practice — FAIL: expected the first player to be an AIPlayer",
  );
  process.exit(1);
}

try {
  // minMaxMove -> Game.import(copy) -> minMaxScore (the path that used to throw).
  player.randomMove(game);
  console.log(
    "[TEST] offline practice: AI takes a full turn without crashing... PASS",
  );
  process.exit(0);
} catch (e) {
  console.error(
    "[TEST] offline practice: AI turn FAILED:",
    (e as Error)?.message ?? e,
  );
  process.exit(1);
}
