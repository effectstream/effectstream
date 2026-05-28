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
  // Receives: from, to, tokenId from the ERC721 Transfer event
  nftMint: builtinGrammars.evmErc721,

  // Create a new lobby: c|creatorNftId|numOfRounds|roundLength|playTimePerPlayer|isHidden?|isPractice?
  createdLobby: [
    ["creatorNftId", NftID],
    ["numOfRounds", Type.Number({ minimum: 1, maximum: 1000 })],
    ["roundLength", Type.Number({ minimum: 1, maximum: 10000 })],
    ["playTimePerPlayer", Type.Number({ minimum: 1, maximum: 10000 })],
    ["isHidden", Type.Optional(Type.Boolean())],
    ["isPractice", Type.Optional(Type.Boolean())],
  ],

  // Join an existing lobby: j|nftId|lobbyID
  joinedLobby: [
    ["nftId", NftID],
    ["lobbyID", LobbyID],
  ],

  // Close a lobby: cs|lobbyID
  closedLobby: [
    ["lobbyID", LobbyID],
  ],

  // Submit moves: s|nftId|lobbyID|matchWithinLobby|roundWithinMatch|rollAgain
  submittedMoves: [
    ["nftId", NftID],
    ["lobbyID", LobbyID],
    ["matchWithinLobby", Type.Number({ minimum: 0 })],
    ["roundWithinMatch", Type.Number({ minimum: 0 })],
    ["rollAgain", Type.Boolean()],
  ],

  // Practice/AI moves: p|lobbyID|matchWithinLobby|roundWithinMatch
  practiceMoves: [
    ["lobbyID", LobbyID],
    ["matchWithinLobby", Type.Number({ minimum: 0 })],
    ["roundWithinMatch", Type.Number({ minimum: 0 })],
  ],

  // Scheduled data for zombie rounds (timeouts): z|lobbyID
  zombieScheduledData: [
    ["lobbyID", LobbyID],
  ],

  // Scheduled data for user stats updates: u|nftId|result
  userScheduledData: [
    ["nftId", NftID],
    ["result", MatchResult],
  ],
} as const satisfies GrammarDefinition;
