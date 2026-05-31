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
  getOwnedNft,
  getTradeNft,
  checkOwnedCard,
  createLobby,
  joinPlayerToLobby,
  newMatch,
  newRound,
  newMove,
  newStats,
  newTradeNft,
  newCard,
  newCardPack,
  updateLobbyState,
  updateLobbyCurrentMatch,
  updateLobbyCurrentRound,
  updateLobbyMatchState,
  updateLobbyPlayer,
  executedRound,
  addWin,
  addLoss,
  addTie,
  transferCard,
  setTradeNftCards as setTradeNftCardsQuery,
  insertNftOwnership,
} from "@trading-cards/database";
import { grammar } from "./grammar.ts";
import {
  applyMove,
  deserializeMove,
  genBotMove,
  genCardPack,
  genStartingDeck,
  INITIAL_HIT_POINTS,
  isValidMove,
  serializeMove,
  type LobbyPlayer,
  type MatchState,
  type Move,
  NUM_PLAYERS,
  PRACTICE_BOT_NFT_ID,
  type ConciseResult,
} from "./game-helpers.ts";

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
    hitPoints: p.hit_points,
    currentDeck: [...(p.current_deck ?? [])],
    currentHand: [...(p.current_hand ?? [])],
    currentBoard: [...(p.current_board ?? [])],
    currentDraw: p.current_draw,
    currentResult: p.current_result ?? undefined,
    turn: p.turn ?? undefined,
  }));
  return {
    players,
    properRound: lobby.current_proper_round,
    turn: lobby.current_turn,
    result: undefined,
  };
}

// Persist every player's match state back to lobby_player.
function* persistPlayers(lobbyID: string, matchState: MatchState) {
  for (const player of matchState.players) {
    yield* World.resolve(updateLobbyPlayer, {
      lobby_id: lobbyID,
      nft_id: player.nftId,
      hit_points: player.hitPoints,
      current_deck: player.currentDeck,
      current_hand: player.currentHand,
      current_board: player.currentBoard,
      current_draw: player.currentDraw,
      current_result: player.currentResult ?? null,
      turn: player.turn ?? null,
    });
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
// accountMint — register a freshly-minted account NFT (L2 action).
// parsedInput = { tokenId }; the signer is the owner.
// ---------------------------------------------------------------------------
stm.addStateTransition("accountMint", function* (data) {
  const { parsedInput, signerAddress } = data;
  const id = parsedInput.tokenId;

  // Initialize the player's global stats row.
  yield* World.resolve(newStats, {
    stats: { nft_id: id, wins: 0, losses: 0, ties: 0 },
  });
  // Record ownership.
  yield* World.resolve(insertNftOwnership, {
    nft_id: id,
    wallet_address: signerAddress.toLowerCase(),
  });
});

// ---------------------------------------------------------------------------
// tradeNftMint — register a freshly-minted trade NFT (L2 action).
// parsedInput = { tokenId }.
// ---------------------------------------------------------------------------
stm.addStateTransition("tradeNftMint", function* (data) {
  const { parsedInput } = data;
  yield* World.resolve(newTradeNft, { nft_id: parsedInput.tokenId });
});

// ---------------------------------------------------------------------------
// buyCardPack — buy a pack of cards (L2 action; replaces v1 GenericPayment).
// The buyer's account NFT is resolved from nft_ownership. Pack contents are
// rolled deterministically and each card is inserted owned by the buyer's NFT.
// ---------------------------------------------------------------------------
stm.addStateTransition("buyCardPack", function* (data) {
  const { signerAddress, randomGenerator } = data;

  const owned = yield* World.resolve(getOwnedNft, {
    wallet_address: signerAddress.toLowerCase(),
  });
  if (!owned || owned.length === 0) return; // buyer owns no account NFT
  const buyerNftId = owned[0].nft_id;

  const cardRegistryIds = genCardPack(randomGenerator);

  yield* World.resolve(newCardPack, {
    pack: { buyer_nft_id: buyerNftId, card_registry_ids: cardRegistryIds },
  });
  for (const registryId of cardRegistryIds) {
    yield* World.resolve(newCard, {
      owner_nft_id: buyerNftId,
      registry_id: registryId,
    });
  }
});

// ---------------------------------------------------------------------------
// createdLobby — create a new (open) lobby and join the creator into it.
// ---------------------------------------------------------------------------
stm.addStateTransition("createdLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const lobby_id = randomGenerator.nextString(12);

  yield* World.resolve(createLobby, {
    lobby_id,
    max_players: NUM_PLAYERS,
    num_of_rounds: parsedInput.numOfRounds,
    turn_length: parsedInput.turnLength,
    creation_block_height: blockHeight,
    created_at: new Date(),
    hidden: parsedInput.isHidden ?? false,
    practice: parsedInput.isPractice ?? false,
    lobby_creator: parsedInput.creatorNftId,
    lobby_state: "open",
  });

  // The creator joins with their committed deck (commitments stored as-is).
  yield* World.resolve(joinPlayerToLobby, {
    lobby_id,
    nft_id: parsedInput.creatorNftId,
    starting_commitments: parsedInput.creatorCommitments,
    hit_points: INITIAL_HIT_POINTS,
    current_deck: genStartingDeck(randomGenerator),
    turn: null,
  });
});

// ---------------------------------------------------------------------------
// joinedLobby — when the lobby fills, start the match.
// ---------------------------------------------------------------------------
stm.addStateTransition("joinedLobby", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const { lobbyID, nftId, commitments } = parsedInput;

  const [lobby] = yield* World.resolve(getLobbyById, { lobby_id: lobbyID });
  if (!lobby || lobby.lobby_state !== "open") return;

  const players = yield* World.resolve(getLobbyPlayers, { lobby_id: lobbyID });
  if (players.length >= lobby.max_players) return;
  if (players.some((p: any) => p.nft_id === nftId)) return; // no double-join

  yield* World.resolve(joinPlayerToLobby, {
    lobby_id: lobbyID,
    nft_id: nftId,
    starting_commitments: commitments,
    hit_points: INITIAL_HIT_POINTS,
    current_deck: genStartingDeck(randomGenerator),
    turn: null,
  });

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
  yield* World.resolve(updateLobbyCurrentMatch, { lobby_id: lobbyID, current_match: 0 });
  yield* World.resolve(updateLobbyCurrentRound, { lobby_id: lobbyID, current_round: 0 });
  yield* World.resolve(updateLobbyMatchState, {
    lobby_id: lobbyID,
    current_turn: 0,
    current_proper_round: 0,
  });

  for (let i = 0; i < allNftIds.length; i++) {
    yield* World.resolve(updateLobbyPlayer, {
      lobby_id: lobbyID,
      nft_id: allNftIds[i],
      hit_points: INITIAL_HIT_POINTS,
      current_deck: genStartingDeck(randomGenerator),
      current_hand: [],
      current_board: [],
      current_draw: 0,
      current_result: null,
      turn: turns[i],
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
// closedLobby
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
// Submit a card-play move — the core gameplay, resolved inline (no executors).
// ---------------------------------------------------------------------------
function* doSubmitMove(
  lobbyID: string,
  nftId: number,
  matchWithinLobby: number,
  roundWithinMatch: number,
  move: Move,
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
  if (!isValidMove(matchState, move)) return;

  // Record the move (index within the round).
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
    serialized_move: serializeMove(move),
  });

  // Resolve the move on the in-memory state.
  const properRoundBefore = matchState.properRound;
  const turnEnded = applyMove(matchState, move, lobby.num_of_rounds, randomGenerator);

  // Persist player state regardless of move kind.
  yield* persistPlayers(lobbyID, matchState);

  yield* World.resolve(updateLobbyMatchState, {
    lobby_id: lobbyID,
    current_turn: matchState.turn,
    current_proper_round: matchState.properRound,
  });

  if (!turnEnded) return; // a "play" move keeps the turn

  const roundResolved = matchState.properRound > properRoundBefore;
  const matchEnded = matchState.result !== undefined;

  if (roundResolved) {
    // Mark the round executed and open the next one (unless the match ended).
    yield* World.resolve(executedRound, {
      lobby_id: lobbyID,
      match_within_lobby: lobby.current_match,
      round_within_match: lobby.current_round,
      execution_block_height: blockHeight,
    });

    if (!matchEnded) {
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
    }
  }

  if (matchEnded) {
    yield* World.resolve(updateLobbyState, {
      lobby_id: lobbyID,
      lobby_state: "finished",
    });
    const result = matchState.result!;
    for (let i = 0; i < matchState.players.length; i++) {
      const player = matchState.players[i];
      if (player.nftId === PRACTICE_BOT_NFT_ID) continue; // bot has no stats row
      yield* applyStatResult(player.nftId, result[i]);
    }
  }
}

stm.addStateTransition("submittedMoves", function* (data) {
  const { blockHeight, parsedInput, randomGenerator } = data;
  const move = deserializeMove(parsedInput.move);
  if (!move) return; // unparseable move — discard
  yield* doSubmitMove(
    parsedInput.lobbyID,
    parsedInput.nftId,
    parsedInput.matchWithinLobby,
    parsedInput.roundWithinMatch,
    move,
    blockHeight,
    randomGenerator,
  );
});

// ---------------------------------------------------------------------------
// Practice moves — the practice bot auto-plays a move on its turn.
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
  if (players.length !== NUM_PLAYERS) return;

  const matchState = buildMatchState(lobby, players);
  const move = genBotMove(matchState);

  yield* doSubmitMove(
    parsedInput.lobbyID,
    PRACTICE_BOT_NFT_ID,
    parsedInput.matchWithinLobby,
    parsedInput.roundWithinMatch,
    move,
    blockHeight,
    randomGenerator,
  );
});

// ---------------------------------------------------------------------------
// Zombie round (turn timeout) — force the stalled player's turn to end.
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

// ---------------------------------------------------------------------------
// setTradeNftCards — assign cards you own to an (empty) trade NFT.
// The signer's account NFT is resolved; we verify it owns all the cards and the
// target trade NFT is empty, then unassign the cards from the owner and stamp
// them onto the trade NFT.
// ---------------------------------------------------------------------------
stm.addStateTransition("setTradeNftCards", function* (data) {
  const { parsedInput, signerAddress } = data;
  const { tradeNftId, cards } = parsedInput;

  const owned = yield* World.resolve(getOwnedNft, {
    wallet_address: signerAddress.toLowerCase(),
  });
  if (!owned || owned.length === 0) return; // signer owns no account NFT
  const ownerNftId = owned[0].nft_id;

  const [tradeNft] = yield* World.resolve(getTradeNft, { nft_id: tradeNftId });
  if (!tradeNft) return; // trade NFT not minted
  if (tradeNft.cards != null) return; // trade NFT not empty

  // Verify the owner owns every card.
  for (const cardId of cards) {
    const owns = yield* World.resolve(checkOwnedCard, {
      owner_nft_id: ownerNftId,
      id: cardId,
    });
    if (!owns || owns.length === 0) return; // does not own all cards
  }

  // Unassign each card from the owner (owner_nft_id = NULL while in a trade NFT).
  for (const cardId of cards) {
    yield* World.resolve(transferCard, { id: cardId, owner_nft_id: null });
  }
  yield* World.resolve(setTradeNftCardsQuery, { nft_id: tradeNftId, cards });
});

/**
 * Route inputs through the trading-cards state machine.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
