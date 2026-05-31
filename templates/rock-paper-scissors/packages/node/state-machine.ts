import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  getLobbyById,
  getRoundData,
  getCachedMoves,
  getUserStats,
  createLobby,
  createRound,
  createMove,
  createUserStats,
  createFinalMatchState,
  updateLobbyPlayerTwo,
  updateMatchState,
  updateRoundExecution,
  updateUserStats as updateUserStatsQuery,
  closeLobby,
  finishLobby,
} from "@rock-paper-scissors/database";
import { grammar } from "./grammar.ts";
import {
  RockPaperScissors,
  GameResult,
  type RPSActions,
  type RPSSummary,
  type MatchResult,
  toConciseResult,
} from "./game-helpers.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

// ---------------------------------------------------------------------------
// Helpers (inlined round resolution — replaces the old executeRound /
// processTick / round-executor abstraction).
// ---------------------------------------------------------------------------

// Resolve the current round of a match: feed the cached moves into the RPS
// engine, mark any missing moves as DID_NOT_PLAY, persist the new match state,
// finish the lobby (and tally stats) if the game ended, or open the next round.
function* resolveRound(
  blockHeight: number,
  lobby: any,
  round: any,
  moves: Array<{ wallet: string; move_rps: string }>,
) {
  const rps = new RockPaperScissors(lobby.latest_match_state as RPSSummary);

  // Input every submitted move for this round.
  for (const move of moves) {
    const isPlayerOne = move.wallet === lobby.lobby_creator;
    rps.inputMove(
      isPlayerOne,
      move.move_rps as RPSActions,
      round.round_within_match,
    );
  }

  // Convert any PENDING entries for this round into DID_NOT_PLAY.
  rps.endRound(round.round_within_match);

  // Append a per-round winner marker ("1" | "2" | "T") to round_winner.
  const roundResult = rps.roundWinner(round.round_within_match);
  const roundInfo =
    roundResult[0] === GameResult.TIE
      ? "T"
      : roundResult[0] === GameResult.WIN
        ? "1"
        : "2";
  const roundState = (lobby.round_winner ?? "") + roundInfo;

  yield* World.resolve(updateMatchState, {
    latest_match_state: rps.state,
    round_winner: roundState,
    lobby_id: lobby.lobby_id,
  });

  yield* World.resolve(updateRoundExecution, {
    execution_block_height: blockHeight,
    lobby_id: lobby.lobby_id,
    round_within_match: round.round_within_match,
  });

  // best-of-N early termination: the engine flags didGameEnd() as soon as a
  // player has an unbeatable lead (> floor(non-tie-rounds / 2)).
  if (rps.didGameEnd()) {
    yield* World.resolve(finishLobby, { lobby_id: lobby.lobby_id });

    const gameResults: MatchResult = rps.endGameResults();

    // Persist the archived final match state (skip for practice games).
    if (!lobby.practice) {
      yield* World.resolve(createFinalMatchState, {
        lobby_id: lobby.lobby_id,
        player_one_wallet: lobby.lobby_creator,
        player_one_result: toMatchResultEnum(gameResults[0]),
        player_two_wallet: lobby.player_two!,
        player_two_result: toMatchResultEnum(gameResults[1]),
        total_time: 0,
        game_moves: rps.state,
      });
    }

    // Tally win/loss/tie into global_user_state for both players.
    yield* applyStatResult(lobby.lobby_creator, toConciseResult(gameResults[0]));
    if (lobby.player_two) {
      yield* applyStatResult(lobby.player_two, toConciseResult(gameResults[1]));
    }
    return;
  }

  // Not over — open the next round. The DB trigger advances lobbies.current_round.
  yield* World.resolve(createRound, {
    lobby_id: lobby.lobby_id,
    round_within_match: round.round_within_match + 1,
    starting_block_height: blockHeight,
  });
}

function toMatchResultEnum(result: GameResult): "win" | "tie" | "loss" {
  if (result === GameResult.WIN) return "win";
  if (result === GameResult.TIE) return "tie";
  return "loss";
}

// Update (or initialize) a player's win/loss/tie tally in global_user_state.
function* applyStatResult(wallet: string, outcome: "w" | "t" | "l") {
  // Ensure a row exists (no-op on conflict).
  yield* World.resolve(createUserStats, { wallet });
  yield* World.resolve(updateUserStatsQuery, {
    wins: outcome === "w" ? 1 : 0,
    losses: outcome === "l" ? 1 : 0,
    ties: outcome === "t" ? 1 : 0,
    wallet,
  });
}

// ---------------------------------------------------------------------------
// createdLobby — create a fresh open lobby with the creator as player one.
// ---------------------------------------------------------------------------
stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator, signerAddress: player } =
    data;

  const lobby_id = randomGenerator.nextString(12);
  const initialMatchState = RockPaperScissors.buildInitialState(
    parsedInput.numOfRounds,
  );

  yield* World.resolve(createLobby, {
    lobby_id,
    num_of_rounds: parsedInput.numOfRounds,
    round_length: parsedInput.roundLength,
    round_winner: "",
    created_at: new Date(),
    creation_block_height: blockHeight,
    hidden: parsedInput.isHidden ?? false,
    practice: parsedInput.isPractice ?? false,
    lobby_creator: player!,
    lobby_state: "open",
    latest_match_state: initialMatchState,
  });
});

// ---------------------------------------------------------------------------
// joinedLobby — a second player joins, the match becomes active, round 1 opens.
// ---------------------------------------------------------------------------
stm.addStateTransition("joinedLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player } = data;
  const [lobby] = yield* World.resolve(getLobbyById, {
    lobby_id: parsedInput.lobbyID,
  });

  if (!lobby) return;
  // Can only join an open lobby that has no player two and isn't your own.
  if (
    lobby.player_two ||
    lobby.lobby_state !== "open" ||
    lobby.lobby_creator === player
  ) {
    return;
  }

  // Set player two and flip the lobby to active.
  yield* World.resolve(updateLobbyPlayerTwo, {
    player_two: player!,
    lobby_id: parsedInput.lobbyID,
  });

  // Open round 1 (the DB trigger sets lobbies.current_round = 1).
  yield* World.resolve(createRound, {
    lobby_id: parsedInput.lobbyID,
    round_within_match: 1,
    starting_block_height: blockHeight,
  });

  // Initialize stat rows for both players.
  yield* World.resolve(createUserStats, { wallet: lobby.lobby_creator });
  yield* World.resolve(createUserStats, { wallet: player! });
});

// ---------------------------------------------------------------------------
// closedLobby — the creator closes an open lobby before anyone joins.
// ---------------------------------------------------------------------------
stm.addStateTransition("closedLobby", function* (data) {
  const { parsedInput, signerAddress: player } = data;
  const [lobby] = yield* World.resolve(getLobbyById, {
    lobby_id: parsedInput.lobbyID,
  });

  if (!lobby) return;
  if (
    lobby.player_two ||
    lobby.lobby_state !== "open" ||
    lobby.lobby_creator !== player
  ) {
    return;
  }

  yield* World.resolve(closeLobby, { lobby_id: parsedInput.lobbyID });
});

// ---------------------------------------------------------------------------
// submittedMoves — a player submits R | P | S for the current round. Once both
// players have moved, the round resolves inline.
// ---------------------------------------------------------------------------
stm.addStateTransition("submittedMoves", function* (data) {
  const { blockHeight, parsedInput, signerAddress: player } = data;

  const [lobby] = yield* World.resolve(getLobbyById, {
    lobby_id: parsedInput.lobbyID,
  });
  if (!lobby || lobby.lobby_state !== "active") return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: parsedInput.lobbyID,
    round: parsedInput.roundNumber,
  });
  if (!round) return;

  // The player must belong to the lobby and the round must be the current one.
  const players = [lobby.lobby_creator, lobby.player_two];
  if (!players.includes(player)) return;
  if (parsedInput.roundNumber !== round.round_within_match) return;

  // Validate the move against the engine (rejects already-played / future rounds).
  const isPlayerOne = lobby.lobby_creator === player;
  const rps = new RockPaperScissors(lobby.latest_match_state as RPSSummary);
  if (
    !rps.isValidMove(
      isPlayerOne,
      parsedInput.move_rps as RPSActions,
      round.round_within_match,
    )
  ) {
    return;
  }

  // Record the move.
  yield* World.resolve(createMove, {
    lobby_id: parsedInput.lobbyID,
    wallet: player!,
    round: parsedInput.roundNumber,
    move_rps: parsedInput.move_rps,
  });

  // getCachedMoves runs AFTER the insert above, so it already includes this
  // move. Once both players have moved (>= 2 rows for the round), resolve it.
  const moves = yield* World.resolve(getCachedMoves, {
    lobby_id: parsedInput.lobbyID,
    round: parsedInput.roundNumber,
  });
  if (moves.length >= 2) {
    yield* resolveRound(blockHeight, lobby, round, moves);
  }
});

// ---------------------------------------------------------------------------
// zombieScheduledData — a round timed out. Resolve it with whatever moves were
// submitted; the missing player(s) get DID_NOT_PLAY (auto-loss).
// ---------------------------------------------------------------------------
stm.addStateTransition("zombieScheduledData", function* (data) {
  const { blockHeight, parsedInput } = data;

  const [lobby] = yield* World.resolve(getLobbyById, {
    lobby_id: parsedInput.lobbyID,
  });
  if (!lobby || lobby.lobby_state !== "active") return;

  const [round] = yield* World.resolve(getRoundData, {
    lobby_id: parsedInput.lobbyID,
    round: lobby.current_round,
  });
  if (!round) return;

  const moves = yield* World.resolve(getCachedMoves, {
    lobby_id: parsedInput.lobbyID,
    round: lobby.current_round,
  });

  // Both already submitted → round already resolved, nothing to do.
  if (moves.length >= 2) return;

  yield* resolveRound(blockHeight, lobby, round, moves);
});

// ---------------------------------------------------------------------------
// userScheduledData — direct win/loss/tie tally update (scheduled / external).
// ---------------------------------------------------------------------------
stm.addStateTransition("userScheduledData", function* (data) {
  const { parsedInput } = data;
  yield* applyStatResult(
    parsedInput.user,
    parsedInput.result as "w" | "t" | "l",
  );
});

/**
 * Route inputs through the RPS state machine. This router lets the node keep
 * backwards compatibility with old history if new logic is introduced at a
 * future block height.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
