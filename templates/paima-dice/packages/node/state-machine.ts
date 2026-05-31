import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  getLobbyById,
  getLobbyPlayers,
  getRound,
  getRoundMoves,
  getUserStats,
  createLobby,
  joinPlayerToLobby,
  newMatch,
  newRound,
  newMove,
  newStats,
  updateLobbyState,
  updateLobbyCurrentMatch,
  updateLobbyCurrentRound,
  updateLobbyMatchState,
  updateLobbyPlayer,
  executedRound,
  addWin,
  addLoss,
  addTie,
  insertNftOwnership,
} from "@paima-dice/database";
import { grammar } from "./grammar.ts";
import {
  applyMove,
  forkGenerator,
  isValidMove,
  type LobbyPlayer,
  type MatchState,
  NUM_PLAYERS,
  PRACTICE_BOT_NFT_ID,
  type ConciseResult,
} from "./game-helpers.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const stm = new Stm<typeof grammar, {}>(grammar);

// Lobby rows are "ready to play" once their match-state columns are populated.
function hasMatchState(lobby: any): boolean {
  return (
    lobby != null &&
    lobby.current_match != null &&
    lobby.current_round != null &&
    lobby.current_turn != null &&
    lobby.current_proper_round != null
  );
}

// Rebuild the in-memory match state from the lobby row + its players.
function buildMatchState(lobby: any, rawPlayers: any[]): MatchState {
  const players: LobbyPlayer[] = rawPlayers.map((p) => ({
    nftId: p.nft_id,
    turn: p.turn ?? undefined,
    points: p.points,
    score: p.score,
  }));
  return {
    players,
    properRound: lobby.current_proper_round,
    turn: lobby.current_turn,
    result: undefined,
  };
}

// Persist match state after a move.
//
// A dice "round" (`current_round` / a `match_round` row) spans many moves: each
// player rolls any number of times then passes; the round resolves only once
// both players have passed (tracked by `properRound` inside `applyMove`).
// Players therefore submit every move of a round at the SAME `current_round`
// value — `current_round` advances only when the dice round actually resolves.
//
// `roundBefore` is `matchState.properRound` captured BEFORE `applyMove` ran, so
// `matchState.properRound > roundBefore` tells us this move closed a dice round.
function* persistMatchAfterMove(
  lobbyID: string,
  blockHeight: number,
  lobby: any,
  matchState: MatchState,
  roundBefore: number,
) {
  yield* World.resolve(updateLobbyMatchState, {
    lobby_id: lobbyID,
    current_turn: matchState.turn,
    current_proper_round: matchState.properRound,
  });

  for (const player of matchState.players) {
    yield* World.resolve(updateLobbyPlayer, {
      lobby_id: lobbyID,
      nft_id: player.nftId,
      turn: player.turn,
      points: player.points,
      score: player.score,
    });
  }

  const roundResolved = matchState.properRound > roundBefore;
  const matchEnded = matchState.result !== undefined;

  // Mid-round move (a roll, or a pass that didn't close the round): nothing
  // else to persist — the move row is already recorded and the turn/score
  // updates above are enough. Stay at the same `current_round`.
  if (!roundResolved) return;

  // The dice round resolved: mark its match_round row executed.
  yield* World.resolve(executedRound, {
    lobby_id: lobbyID,
    match_within_lobby: lobby.current_match,
    round_within_match: lobby.current_round,
    execution_block_height: blockHeight,
  });

  if (!matchEnded) {
    // Open the next dice round and advance the lobby's current round pointer.
    yield* World.resolve(newRound, {
      lobby_id: lobbyID,
      match_within_lobby: lobby.current_match,
      round_within_match: lobby.current_round + 1,
      starting_block_height: blockHeight,
      execution_block_height: null,
    });
    yield* World.resolve(updateLobbyCurrentRound, {
      lobby_id: lobbyID,
      current_round: lobby.current_round + 1,
    });
    return;
  }

  // Match ended: finalize the lobby and tally stats for each player.
  yield* World.resolve(updateLobbyState, {
    lobby_id: lobbyID,
    lobby_state: "finished",
  });

  const result = matchState.result!;
  for (let i = 0; i < matchState.players.length; i++) {
    const player = matchState.players[i];
    // The practice bot has no global stats row.
    if (player.nftId === PRACTICE_BOT_NFT_ID) continue;
    yield* applyStatResult(player.nftId, result[i]);
  }
}

// Update (or initialize) a player's win/loss/tie tally.
function* applyStatResult(nftId: number, outcome: ConciseResult) {
  const stats = yield* World.resolve(getUserStats, { nft_id: nftId });
  if (!stats || stats.length === 0) {
    yield* World.resolve(newStats, {
      stats: {
        nft_id: nftId,
        wins: outcome === "w" ? 1 : 0,
        losses: outcome === "l" ? 1 : 0,
        ties: outcome === "t" ? 1 : 0,
      },
    });
    return;
  }
  if (outcome === "w") yield* World.resolve(addWin, { nft_id: nftId });
  else if (outcome === "l") yield* World.resolve(addLoss, { nft_id: nftId });
  else yield* World.resolve(addTie, { nft_id: nftId });
}

// ---------------------------------------------------------------------------
// NFT Mint — driven by the built-in ERC721 primitive (Transfer events).
// parsedInput = { to, from, tokenId, isBurn }
// ---------------------------------------------------------------------------
stm.addStateTransition("nftMint", function* (data) {
  const { parsedInput } = data;
  const { to, from, tokenId, isBurn } = parsedInput;

  // Skip burns.
  if (isBurn) return;

  const id = parseInt(String(tokenId), 10);

  // Fresh mint (from the zero address): initialize the player's stats row.
  if (String(from).toLowerCase() === ZERO_ADDRESS) {
    yield* World.resolve(newStats, {
      stats: { nft_id: id, wins: 0, losses: 0, ties: 0 },
    });
  }

  // Always record current ownership (mint or transfer).
  yield* World.resolve(insertNftOwnership, {
    nft_id: id,
    wallet_address: String(to).toLowerCase(),
  });
});

// ---------------------------------------------------------------------------
// Create lobby
// ---------------------------------------------------------------------------
stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const lobby_id = randomGenerator.nextString(12);

  yield* World.resolve(createLobby, {
    lobby_id,
    max_players: NUM_PLAYERS,
    num_of_rounds: parsedInput.numOfRounds,
    round_length: parsedInput.roundLength,
    play_time_per_player: parsedInput.playTimePerPlayer,
    creation_block_height: blockHeight,
    created_at: new Date(),
    hidden: parsedInput.isHidden ?? false,
    practice: parsedInput.isPractice ?? false,
    lobby_creator: parsedInput.creatorNftId,
    lobby_state: "open",
  });

  yield* World.resolve(joinPlayerToLobby, {
    lobby_id,
    nft_id: parsedInput.creatorNftId,
  });
});

// ---------------------------------------------------------------------------
// Join lobby — when the lobby fills, start the match.
// ---------------------------------------------------------------------------
stm.addStateTransition("joinedLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const { lobbyID, nftId } = parsedInput;

  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: lobbyID });
  if (!lobby || lobby.lobby_state !== "open") return;

  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: lobbyID });
  if (players.length >= lobby.max_players) return;
  // Prevent the same NFT from joining twice.
  if (players.some((p: any) => p.nft_id === nftId)) return;

  yield* World.resolve(joinPlayerToLobby, { lobby_id: lobbyID, nft_id: nftId });

  const isFull = players.length + 1 >= lobby.max_players;
  if (!isFull) return;

  // All players present → start the match.
  const allNftIds = [...players.map((p: any) => p.nft_id), nftId];

  // Randomly assign who goes first.
  const firstPlayerIndex = randomGenerator.next() < 0.5 ? 0 : 1;
  const turns = [0, 0];
  turns[firstPlayerIndex] = 0;
  turns[1 - firstPlayerIndex] = 1;

  yield* World.resolve(newMatch, {
    lobby_id: lobbyID,
    match_within_lobby: 0,
    starting_block_height: blockHeight,
  });

  yield* World.resolve(updateLobbyState, {
    lobby_id: lobbyID,
    lobby_state: "active",
  });
  yield* World.resolve(updateLobbyCurrentMatch, {
    lobby_id: lobbyID,
    current_match: 0,
  });
  yield* World.resolve(updateLobbyCurrentRound, {
    lobby_id: lobbyID,
    current_round: 0,
  });
  yield* World.resolve(updateLobbyMatchState, {
    lobby_id: lobbyID,
    current_turn: 0,
    current_proper_round: 0,
  });

  for (let i = 0; i < allNftIds.length; i++) {
    yield* World.resolve(updateLobbyPlayer, {
      lobby_id: lobbyID,
      nft_id: allNftIds[i],
      turn: turns[i],
      points: 0,
      score: 0,
    });
  }

  // Open the first round.
  yield* World.resolve(newRound, {
    lobby_id: lobbyID,
    match_within_lobby: 0,
    round_within_match: 0,
    starting_block_height: blockHeight,
    execution_block_height: null,
  });
});

// ---------------------------------------------------------------------------
// Close lobby
// ---------------------------------------------------------------------------
stm.addStateTransition("closedLobby", function* (data) {
  const { parsedInput } = data;
  const [lobby] = yield* World.resolve(getLobbyById, {
    lobby_id: parsedInput.lobbyID,
  });
  if (!lobby) return;

  yield* World.resolve(updateLobbyState, {
    lobby_id: parsedInput.lobbyID,
    lobby_state: "closed",
  });
});

// ---------------------------------------------------------------------------
// Submit moves — the core dice gameplay, resolved inline (no executors).
// ---------------------------------------------------------------------------
function* doSubmitMove(
  lobbyID: string,
  nftId: number,
  matchWithinLobby: number,
  roundWithinMatch: number,
  rollAgain: boolean,
  blockHeight: number,
  randomGenerator: any,
) {
  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: lobbyID });
  if (!lobby || !hasMatchState(lobby) || lobby.lobby_state !== "active") return;

  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: lobbyID });
  if (players.length !== NUM_PLAYERS) return;

  // Must reference the lobby's current match/round.
  if (matchWithinLobby !== lobby.current_match) return;
  if (roundWithinMatch !== lobby.current_round) return;

  const [round] = yield* World.resolve(getRound, {
    lobby_id: lobbyID,
    match_within_lobby: matchWithinLobby,
    round_within_match: roundWithinMatch,
  });
  if (!round) return;

  // It must be this player's turn.
  const turnPlayer = players.find((p: any) => p.turn === lobby.current_turn);
  if (!turnPlayer || turnPlayer.nft_id !== nftId) return;

  const matchState = buildMatchState(lobby, players);
  // v1 `isValidMove` consumes randomness (it must simulate the would-be roll to
  // reject a busting *choice*). Validate against a fresh generator forked from
  // the input's seed so the validation roll matches the one `applyMove` draws,
  // and the move resolution below still starts from the same point.
  if (!isValidMove(forkGenerator(randomGenerator), matchState, rollAgain)) return;

  // Record the move (move index within the round).
  const moves = yield* World.resolve(getRoundMoves, {
    lobby_id: lobbyID,
    match_within_lobby: matchWithinLobby,
    round_within_match: roundWithinMatch,
  });
  yield* World.resolve(newMove, {
    lobby_id: lobbyID,
    match_within_lobby: matchWithinLobby,
    round_within_match: roundWithinMatch,
    move_within_round: moves.length,
    nft_id: nftId,
    roll_again: rollAgain,
  });

  // Resolve the move (roll or pass + round/match end) directly on the state.
  const roundBefore = matchState.properRound;
  applyMove(matchState, rollAgain, lobby.num_of_rounds, randomGenerator);

  yield* persistMatchAfterMove(
    lobbyID,
    blockHeight,
    lobby,
    matchState,
    roundBefore,
  );
}

stm.addStateTransition("submittedMoves", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  yield* doSubmitMove(
    parsedInput.lobbyID,
    parsedInput.nftId,
    parsedInput.matchWithinLobby,
    parsedInput.roundWithinMatch,
    parsedInput.rollAgain,
    blockHeight,
    randomGenerator,
  );
});

// ---------------------------------------------------------------------------
// Practice moves — the practice bot auto-plays a move.
// ---------------------------------------------------------------------------
stm.addStateTransition("practiceMoves", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;

  const [lobby] = yield* World.resolve(getLobbyById, {
    lobby_id: parsedInput.lobbyID,
  });
  if (!lobby || !hasMatchState(lobby) || !lobby.practice) return;

  const players = yield* World.resolve(getLobbyPlayers, {
    lobby_id: parsedInput.lobbyID,
  });
  const matchState = buildMatchState(lobby, players);

  // Simple AI (ported from v1 PracticeAI): roll again only while it's a safe,
  // valid choice — i.e. drawing more would not bust. `isValidMove` simulates the
  // would-be roll, so fork the generator to peek without advancing the real one
  // (which `doSubmitMove` / `applyMove` then consume for the actual roll).
  const rollAgain = isValidMove(forkGenerator(randomGenerator), matchState, true);
  yield* doSubmitMove(
    parsedInput.lobbyID,
    PRACTICE_BOT_NFT_ID,
    parsedInput.matchWithinLobby,
    parsedInput.roundWithinMatch,
    rollAgain,
    blockHeight,
    randomGenerator,
  );
});

// ---------------------------------------------------------------------------
// Zombie round (timeout) — force the stalled player's turn to end.
// ---------------------------------------------------------------------------
stm.addStateTransition("zombieScheduledData", function* (data) {
  const { parsedInput } = data;
  const [lobby] = yield* World.resolve(getLobbyById, {
    lobby_id: parsedInput.lobbyID,
  });
  if (!lobby || !hasMatchState(lobby) || lobby.lobby_state !== "active") return;

  const nextTurn = (lobby.current_turn + 1) % NUM_PLAYERS;
  yield* World.resolve(updateLobbyMatchState, {
    lobby_id: parsedInput.lobbyID,
    current_turn: nextTurn,
    current_proper_round: lobby.current_proper_round,
  });
});

// ---------------------------------------------------------------------------
// User stats update (scheduled / external result).
// ---------------------------------------------------------------------------
stm.addStateTransition("userScheduledData", function* (data) {
  const { parsedInput } = data;
  yield* applyStatResult(parsedInput.nftId, parsedInput.result as ConciseResult);
});

/**
 * Route inputs through the dice state machine. This router lets the node keep
 * backwards compatibility with old history if new logic is introduced at a
 * future block height.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
