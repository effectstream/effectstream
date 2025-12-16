import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@paimaexample/concise";

// Helper type for lobby ID validation (12 characters)
const LobbyID = Type.String({ minLength: 12, maxLength: 12 });

// Helper type for RPS moves (Rock, Paper, Scissors)
const RPSMove = Type.Union([
  Type.Literal("R"),
  Type.Literal("P"),
  Type.Literal("S"),
]);

// Helper type for match results (win, tie, loss)
const MatchResult = Type.Union([
  Type.Literal("w"),
  Type.Literal("t"),
  Type.Literal("l"),
]);

export const grammar = {
  // Create a new lobby: c|numOfRounds|roundLength|isHidden?|isPractice?
  createdLobby: [
    ["numOfRounds", Type.Number({ minimum: 3, maximum: 1000 })],
    ["roundLength", Type.Number({ minimum: 1, maximum: 10000 })],
    ["isHidden", Type.Optional(Type.Boolean())],
    ["isPractice", Type.Optional(Type.Boolean())],
  ],

  // Join an existing lobby: j|lobbyID
  joinedLobby: [
    ["lobbyID", LobbyID],
  ],

  // Close a lobby (before anyone joins): cs|lobbyID
  closedLobby: [
    ["lobbyID", LobbyID],
  ],

  // Submit a move for a round: s|lobbyID|roundNumber|move
  submittedMoves: [
    ["lobbyID", LobbyID],
    ["roundNumber", Type.Number({ minimum: 1, maximum: 1000 })],
    ["move_rps", RPSMove],
  ],

  // Scheduled data for zombie rounds (timeouts): z|lobbyID
  zombieScheduledData: [
    ["lobbyID", LobbyID],
  ],

  // Scheduled data for user stats updates: u|user|result
  userScheduledData: [
    ["user", Type.String()], // Wallet address
    ["result", MatchResult],
  ],
} as const satisfies GrammarDefinition;
