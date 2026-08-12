import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { createScheduledData } from "@effectstream/db";
import {
  getLobbyLean,
  getLobbyGameState,
  getLobbyMap,
  getLobbyPlayers,
  getLobbyRounds,
  getPlayerByWallet,
  createLobby,
  addPlayerToLobby,
  createPlayer,
  createRound,
  updateLobbyToActive,
  updateLobbyToClosed,
  updateLobbyWinner,
  updateLobbyGameState,
  updatePlayerWin,
  updatePlayerLoss,
  updatePlayerDraw,
} from "@hex-battle/database";
import { grammar } from "./grammar.ts";
import {
  validateUnits,
  validateBuildings,
  parseMap,
  mapToStored,
  parseMove,
  startGame,
  applyMove,
  applySkip,
  Game,
} from "./game-helpers.ts";

// Local block time (s). The orchestrator NTP block time is 1000ms, so 1 block
// ≈ 1s; a 120s zombie timeout therefore schedules ~120 blocks out. The exact
// number doesn't affect correctness — zombie inputs that arrive after the
// player already moved are discarded (round-number mismatch).
const BLOCK_TIME = 1;
const ZOMBIE_TIMEOUT_BLOCKS = Math.ceil(120 / BLOCK_TIME);
const MAX_ZOMBIE_SKIPS = 5;

const stm = new Stm<typeof grammar, {}>(grammar);

// All scheduled zombie inputs originate from the engine itself, so we tag them
// with the precompile source.
const PRECOMPILE_SOURCE = { precompile: "0x0" as any };

function* scheduleZombie(
  lobbyId: string,
  turn: number,
  count: number,
  blockHeight: number,
) {
  yield* createScheduledData(
    JSON.stringify(["zombieScheduledData", lobbyId, turn, count]),
    { blockHeight: blockHeight + ZOMBIE_TIMEOUT_BLOCKS },
    PRECOMPILE_SOURCE,
  );
}

// ---------------------------------------------------------------------------
// createLobby — validate the complex composite fields (units / buildings / map)
// that the v1 PaimaParser validated, persist the lobby, join the creator and
// register them on the leaderboard.
// ---------------------------------------------------------------------------
stm.addStateTransition("createLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress, randomGenerator } = data;
  const user = signerAddress.toLowerCase();

  // Port of the v1 field-validators: reject the input as a whole if any of the
  // composite fields are malformed.
  if (!validateUnits(parsedInput.units)) return;
  if (!validateBuildings(parsedInput.buildings)) return;
  const coords = parseMap(parsedInput.map);
  if (!coords) return;

  const lobby_id = randomGenerator.nextString(12);

  yield* World.resolve(createLobby, {
    lobby_id,
    num_of_players: parsedInput.numOfPlayers,
    created_at: new Date(),
    creation_block_height: blockHeight,
    lobby_creator: user,
    map: mapToStored(coords),
    units: parsedInput.units,
    buildings: parsedInput.buildings,
    gold: parsedInput.gold,
    init_tiles: parsedInput.initTiles,
    time_limit: parsedInput.timeLimit,
    round_limit: parsedInput.roundLimit,
  });

  yield* World.resolve(addPlayerToLobby, {
    lobby_id,
    player_wallet: user,
  });

  // Leaderboard row (idempotent).
  yield* World.resolve(createPlayer, { wallet: user, block_height: blockHeight });
});

// ---------------------------------------------------------------------------
// joinLobby — add the player; when the lobby fills, build the hex game and
// start the match (active state + first zombie timeout).
// ---------------------------------------------------------------------------
stm.addStateTransition("joinLobby", function* (data) {
  const { blockHeight, parsedInput, signerAddress, randomGenerator } = data;
  const user = signerAddress.toLowerCase();
  const lobbyID = parsedInput.lobbyID;

  const [lobby] = yield* World.resolve(getLobbyLean, { lobby_id: lobbyID });
  if (!lobby) return;
  if (lobby.lobby_state !== "open") return;

  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: lobbyID });
  if (players.find((p: any) => p.player_wallet === user)) return; // already joined
  if (players.length >= lobby.num_of_players) return; // full

  const [lobbyMap] = yield* World.resolve(getLobbyMap, { lobby_id: lobbyID });
  if (!lobbyMap || !lobbyMap.map) return;

  yield* World.resolve(addPlayerToLobby, { lobby_id: lobbyID, player_wallet: user });

  // Last player joined → start the game.
  if (players.length + 1 === lobby.num_of_players) {
    const wallets = [...players.map((p: any) => p.player_wallet), user];
    const game = startGame(
      lobby.lobby_id,
      lobbyMap.map,
      lobby.units!,
      lobby.buildings!,
      lobby.init_tiles!,
      wallets,
      lobby.gold,
      blockHeight,
      randomGenerator as any,
    );

    yield* World.resolve(updateLobbyGameState, {
      lobby_id: lobbyID,
      game_state: Game.export(game),
      current_round: 0,
    });
    yield* World.resolve(updateLobbyToActive, {
      lobby_id: lobbyID,
      started_block_height: blockHeight,
      seed: String((randomGenerator as any)._seed ?? ""),
    });

    yield* scheduleZombie(lobbyID, 0, 0, blockHeight);
  }

  // Leaderboard row (idempotent).
  yield* World.resolve(createPlayer, { wallet: user, block_height: blockHeight });
});

// ---------------------------------------------------------------------------
// submitMoves — parse the move mini-language, apply it through the hex engine,
// persist the new game state, advance the round, and end/close the game on a
// winner.
// ---------------------------------------------------------------------------
stm.addStateTransition("submitMoves", function* (data) {
  const { blockHeight, parsedInput, signerAddress, randomGenerator } = data;
  const user = signerAddress.toLowerCase();
  const lobbyID = parsedInput.lobbyID;

  const [lobby] = yield* World.resolve(getLobbyLean, { lobby_id: lobbyID });
  if (!lobby) return;
  if (lobby.lobby_state !== "active") return;

  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: lobbyID });
  if (!players.find((p: any) => p.player_wallet === user)) return; // not in game

  const rounds = yield* World.resolve(getLobbyRounds, { lobby_id: lobbyID });
  if (rounds.length !== parsedInput.roundNumber) return; // wrong round

  const [state] = yield* World.resolve(getLobbyGameState, { lobby_id: lobbyID });
  if (!state || !state.game_state) return;

  const moveActions = parseMove(parsedInput.move);
  if (!moveActions) return; // malformed move mini-language

  const game = applyMove(state.game_state, user, moveActions, parsedInput.roundNumber);
  if (!game) return; // illegal move — rejected as a whole

  yield* World.resolve(createRound, {
    lobby_id: lobbyID,
    wallet: user,
    move: JSON.stringify(moveActions),
    round: parsedInput.roundNumber,
    block_height: blockHeight,
    seed: String((randomGenerator as any)._seed ?? ""),
  });

  yield* World.resolve(updateLobbyGameState, {
    lobby_id: lobbyID,
    game_state: Game.export(game),
    current_round: game.turn,
  });

  if (game.winner) {
    yield* World.resolve(updateLobbyToClosed, { lobby_id: lobbyID });
    for (const player of game.players) {
      if (player.wallet === game.winner.wallet) {
        yield* World.resolve(updateLobbyWinner, {
          game_winner: game.winner.wallet,
          lobby_id: lobbyID,
        });
        yield* World.resolve(updatePlayerWin, {
          wallet: player.wallet,
          last_block_height: blockHeight,
        });
      } else {
        yield* World.resolve(updatePlayerLoss, {
          wallet: player.wallet,
          last_block_height: blockHeight,
        });
      }
    }
  } else {
    yield* scheduleZombie(lobbyID, game.turn, 0, blockHeight);
  }
});

// ---------------------------------------------------------------------------
// surrender — the current player resigns; the engine resolves them out, which
// may end the game (last player standing wins).
// ---------------------------------------------------------------------------
stm.addStateTransition("surrender", function* (data) {
  const { blockHeight, parsedInput, signerAddress, randomGenerator } = data;
  const user = signerAddress.toLowerCase();
  const lobbyID = parsedInput.lobbyID;

  const [lobby] = yield* World.resolve(getLobbyLean, { lobby_id: lobbyID });
  if (!lobby || lobby.lobby_state !== "active") return;

  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: lobbyID });
  if (!players.find((p: any) => p.player_wallet === user)) return;

  const [state] = yield* World.resolve(getLobbyGameState, { lobby_id: lobbyID });
  if (!state || !state.game_state) return;

  const game = applyMove(state.game_state, user, [JSON.stringify({ surrender: true })], lobby.current_round);
  if (!game) return;

  yield* World.resolve(createRound, {
    lobby_id: lobbyID,
    wallet: user,
    move: JSON.stringify(["surrender"]),
    round: lobby.current_round,
    block_height: blockHeight,
    seed: String((randomGenerator as any)._seed ?? ""),
  });

  yield* World.resolve(updateLobbyGameState, {
    lobby_id: lobbyID,
    game_state: Game.export(game),
    current_round: game.turn,
  });

  if (game.winner) {
    yield* World.resolve(updateLobbyToClosed, { lobby_id: lobbyID });
    for (const player of game.players) {
      if (player.wallet === game.winner.wallet) {
        yield* World.resolve(updateLobbyWinner, {
          game_winner: game.winner.wallet,
          lobby_id: lobbyID,
        });
        yield* World.resolve(updatePlayerWin, {
          wallet: player.wallet,
          last_block_height: blockHeight,
        });
      } else {
        yield* World.resolve(updatePlayerLoss, {
          wallet: player.wallet,
          last_block_height: blockHeight,
        });
      }
    }
  } else {
    yield* scheduleZombie(lobbyID, game.turn, 0, blockHeight);
  }
});

// ---------------------------------------------------------------------------
// zombieScheduledData — engine-scheduled turn timeout. If the player already
// moved (round advanced) the zombie is discarded; otherwise the stalled turn is
// skipped, and after too many consecutive skips the game ends in a draw.
// ---------------------------------------------------------------------------
stm.addStateTransition("zombieScheduledData", function* (data) {
  const { blockHeight, parsedInput } = data;
  const lobbyID = parsedInput.lobbyID;
  const count = parsedInput.count ?? 0;

  const [lobby] = yield* World.resolve(getLobbyLean, { lobby_id: lobbyID });
  if (!lobby) return;

  const [state] = yield* World.resolve(getLobbyGameState, { lobby_id: lobbyID });
  if (!state || !state.game_state) return;

  // Player already played this round → discard the stale zombie.
  if (lobby.current_round !== parsedInput.roundNumber) return;
  if (lobby.lobby_state !== "active") return;

  if (count > MAX_ZOMBIE_SKIPS) {
    // Too many skips → end the game in a draw.
    const game = Game.import(state.game_state);
    yield* World.resolve(updateLobbyToClosed, { lobby_id: lobbyID });
    for (const player of game.players) {
      yield* World.resolve(updatePlayerDraw, {
        wallet: player.wallet,
        last_block_height: blockHeight,
      });
    }
    return;
  }

  // Skip the stalled player's turn.
  const game = applySkip(state.game_state, parsedInput.roundNumber);

  yield* World.resolve(createRound, {
    lobby_id: lobbyID,
    wallet: lobby.lobby_creator,
    move: JSON.stringify([]),
    round: parsedInput.roundNumber,
    block_height: blockHeight,
    seed: null,
  });

  yield* World.resolve(updateLobbyGameState, {
    lobby_id: lobbyID,
    game_state: Game.export(game),
    current_round: game.turn,
  });

  yield* scheduleZombie(lobbyID, game.turn, count + 1, blockHeight);
});

/**
 * Route inputs through the hex-battle state machine.
 */
export const appStateTransitions: StartConfigAppStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
