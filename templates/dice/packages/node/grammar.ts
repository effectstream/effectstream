import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

// Helper type for lobby ID validation (12 characters)
const LobbyID = Type.String({ minLength: 12, maxLength: 12 });

// Helper type for NFT ID
const NftID = Type.Number({ minimum: 0 });

// Helper type for match results (win, tie, loss)
const MatchResult = Type.Union([
  Type.Literal("w"),
  Type.Literal("t"),
  Type.Literal("l"),
]);

export const grammar = {
  // NFT mint event - uses built-in ERC721 grammar for Transfer events
  // Receives: to, from, tokenId, isBurn from the ERC721 Transfer event
  nftMint: builtinGrammars.evmErc721,

  // Create a new lobby: createdLobby|creatorNftId|numOfRounds|roundLength|playTimePerPlayer|isHidden?|isPractice?
  createdLobby: [
    ["creatorNftId", NftID],
    ["numOfRounds", Type.Number({ minimum: 1, maximum: 1000 })],
    ["roundLength", Type.Number({ minimum: 1, maximum: 10000 })],
    ["playTimePerPlayer", Type.Number({ minimum: 1, maximum: 10000 })],
    ["isHidden", Type.Optional(Type.Boolean())],
    ["isPractice", Type.Optional(Type.Boolean())],
  ],

  // Join an existing lobby: joinedLobby|nftId|lobbyID
  joinedLobby: [
    ["nftId", NftID],
    ["lobbyID", LobbyID],
  ],

  // Close a lobby: closedLobby|lobbyID
  closedLobby: [
    ["lobbyID", LobbyID],
  ],

  // Submit moves: submittedMoves|nftId|lobbyID|matchWithinLobby|roundWithinMatch|rollAgain
  submittedMoves: [
    ["nftId", NftID],
    ["lobbyID", LobbyID],
    ["matchWithinLobby", Type.Number({ minimum: 0 })],
    ["roundWithinMatch", Type.Number({ minimum: 0 })],
    ["rollAgain", Type.Boolean()],
  ],

  // Practice/AI moves: practiceMoves|lobbyID|matchWithinLobby|roundWithinMatch
  practiceMoves: [
    ["lobbyID", LobbyID],
    ["matchWithinLobby", Type.Number({ minimum: 0 })],
    ["roundWithinMatch", Type.Number({ minimum: 0 })],
  ],

  // Scheduled data for zombie rounds (timeouts): zombieScheduledData|lobbyID
  zombieScheduledData: [
    ["lobbyID", LobbyID],
  ],

  // Scheduled data for user stats updates: userScheduledData|nftId|result
  userScheduledData: [
    ["nftId", NftID],
    ["result", MatchResult],
  ],
} as const satisfies GrammarDefinition;
