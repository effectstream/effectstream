import type { LobbyState } from "@chess/utils";
// import type { FailedResult } from "@paimaexample/sdk/mw-core";
// import * as Paima from "../../paima/middleware.js";
import type { Color } from "chess.js";
import { Chess } from "chess.js";

type FailedResult = any;
import * as Paima from "../../middleware/mod.ts";
import type { Wallet } from "@paimaexample/wallets";

export class ChessService {
  // Get Lobby State
  static async getLobbyState(
    lobbyId: string,
  ): Promise<LobbyState | null> {
    const result = await Paima.default.getLobbyState(lobbyId);

    if (!result.success) {
      console.error(result);
      return null;
    }

    console.log("Lobby state: ", result.lobby);
    return result.lobby;
  }

  // Submit Moves
  static async submitMove(
    wallet: Wallet,
    lobbyId: string,
    roundNumber: number,
    move: string,
  ): Promise<
    | FailedResult
    | {
      success: true;
      lobby: LobbyState;
    }
  > {
    const result = await Paima.default.submitMoves(
      wallet!,
      lobbyId,
      roundNumber,
      move,
    );
    console.log("Submit move result: ", result);
    return result;
  }
}

export class ChessLogic {
  userAddress: string;

  constructor(userAddress: string) {
    this.userAddress = userAddress;
  }

  async handleMove(
    wallet: Wallet,
    lobbyState: LobbyState,
    move: string,
  ): Promise<LobbyState | undefined> {
    if (this.isThisPlayersTurnRaw(lobbyState) == false) {
      console.log("It's the other player's turn");
      return;
    }

    const moveResult = await ChessService.submitMove(
      wallet,
      lobbyState.lobby_id,
      lobbyState.current_round,
      move,
    );
    if (!moveResult.success) {
      console.log("Move failed");
      return;
    }
    return moveResult.lobby;
  }

  isThisPlayersTurnRaw(lobbyState: LobbyState): boolean {
    const chess = new Chess();
    chess.load(lobbyState.latest_match_state);
    const playerColor = this.thisPlayerColor(lobbyState);
    return chess.turn() === playerColor;
  }

  isThisPlayersTurn(lobbyState: LobbyState, chess: Chess): boolean {
    const playerColor = this.thisPlayerColor(lobbyState);
    return chess.turn() === playerColor;
  }

  thisPlayerColor(lobbyState: LobbyState): Color {
    // c|100|100|false|||T
    const isCreator = lobbyState.lobby_creator === this.userAddress;
    if (isCreator) {
      return lobbyState.player_one_iswhite ? "w" : "b";
    }
    return lobbyState.player_one_iswhite ? "b" : "w";
  }

  gameStateText(lobbyState: LobbyState, chess: Chess): string {
    if (!lobbyState.player_two) {
      return "Waiting for opponent to join...";
    }

    const thisPlayersTurn = this.isThisPlayersTurn(lobbyState, chess);
    if (chess.isCheckmate()) {
      return `Checkmate! You ${thisPlayersTurn ? "lost" : "won"}.`;
    }
    if (chess.isDraw()) {
      return `${chess.isStalemate() ? "Stalemate! " : ""}It's a draw.`;
    }

    const blocksLeft = lobbyState.remaining_blocks;
    if (blocksLeft.w === 0 || blocksLeft.b === 0) {
      const yourTimeout = blocksLeft[this.thisPlayerColor(lobbyState)] === 0;
      return yourTimeout
        ? "You lose by timeout."
        : "You win due to opponent's timeout.";
    }

    if (lobbyState.lobby_state === "finished") {
      return "Match finished.";
    }

    const playerColor = this.thisPlayerColor(lobbyState) === "w"
      ? "White"
      : "Black";
    const turn = thisPlayersTurn ? "Your turn" : "Opponent's turn";

    if (chess.isCheck()) {
      const playerCheck = thisPlayersTurn ? "You're" : "Opponent is";
      return `You're playing as ${playerColor}. ${turn}. ${playerCheck} in check!`;
    }
    return `You're playing as ${playerColor}. ${turn}.`;
  }
}
