import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

// Lobby IDs are server-generated 12-character strings.
const LobbyID = Type.String({ minLength: 12, maxLength: 12 });

// An account/trade NFT token id.
const NftID = Type.Number({ minimum: 0 });

// Match results (win, tie, loss).
const MatchResult = Type.Union([
  Type.Literal("w"),
  Type.Literal("t"),
  Type.Literal("l"),
]);

// A commitment blob (base64) for the commit/reveal card play. Empty allowed
// for the practice bot.
const Commitments = Type.String({ maxLength: 1000 });

// A serialized move string. Two kinds (see game-helpers.ts):
//   "end"                         — end turn
//   "play+<handPosition>+<registryId>" — play a card from hand onto the board
const MoveString = Type.String({ maxLength: 1000 });

export const grammar = {
  // -----------------------------------------------------------------------
  // NFT mints (L2 actions).
  //
  // DEVIATION FROM v1: the original game minted NFTs on-chain and watched the
  // ERC721 mint via a CDE that read the mint annotation. The modern built-in
  // ERC721 primitive only emits {to, from, tokenId, isBurn} from Transfer — it
  // does not surface the original `address` arg. So the mint is delivered as an
  // L2 action carrying the token id (the signer is the owner); on-chain
  // ownership is tracked independently by the ERC721 primitive (config.dev.ts).
  // This is the same pattern nft-lvlup uses.
  // -----------------------------------------------------------------------

  // Register a freshly-minted account NFT into the game state.
  //   accountMint|<tokenId>
  accountMint: [
    ["tokenId", NftID],
  ],

  // Register a freshly-minted trade NFT into the game state.
  //   tradeNftMint|<tokenId>
  tradeNftMint: [
    ["tokenId", NftID],
  ],

  // -----------------------------------------------------------------------
  // Buy a card pack (L2 action).
  //
  // DEVIATION FROM v1: the original game watched a GenericPayment `Pay` event
  // (Pay(uint256,address,string)). The modern engine has NO generic custom-event
  // primitive (`PrimitiveTypeEVMGeneric` is commented out), so a purchase is an
  // L2 action signed by the buyer. The buyer's account NFT is resolved from
  // nft_ownership; the pack contents are rolled with deterministic randomness.
  //   buyCardPack
  // -----------------------------------------------------------------------
  buyCardPack: [],

  // -----------------------------------------------------------------------
  // Lobby / match (commitment-based card play). Same surface as the v1 game.
  // -----------------------------------------------------------------------

  // Create a new lobby:
  //   createdLobby|<creatorNftId>|<creatorCommitments>|<numOfRounds>|<turnLength>|<isHidden?>|<isPractice?>
  createdLobby: [
    ["creatorNftId", NftID],
    ["creatorCommitments", Commitments],
    ["numOfRounds", Type.Number({ minimum: 1, maximum: 1000 })],
    ["turnLength", Type.Number({ minimum: 1, maximum: 10000 })],
    ["isHidden", Type.Optional(Type.Boolean())],
    ["isPractice", Type.Optional(Type.Boolean())],
  ],

  // Join an existing lobby:
  //   joinedLobby|<nftId>|<lobbyID>|<commitments>
  joinedLobby: [
    ["nftId", NftID],
    ["lobbyID", LobbyID],
    ["commitments", Commitments],
  ],

  // Close a lobby:
  //   closedLobby|<lobbyID>
  closedLobby: [
    ["lobbyID", LobbyID],
  ],

  // Submit a card-play move:
  //   submittedMoves|<nftId>|<lobbyID>|<matchWithinLobby>|<roundWithinMatch>|<move>
  submittedMoves: [
    ["nftId", NftID],
    ["lobbyID", LobbyID],
    ["matchWithinLobby", Type.Number({ minimum: 0 })],
    ["roundWithinMatch", Type.Number({ minimum: 0 })],
    ["move", MoveString],
  ],

  // Practice/AI move — the practice bot auto-plays:
  //   practiceMoves|<lobbyID>|<matchWithinLobby>|<roundWithinMatch>
  practiceMoves: [
    ["lobbyID", LobbyID],
    ["matchWithinLobby", Type.Number({ minimum: 0 })],
    ["roundWithinMatch", Type.Number({ minimum: 0 })],
  ],

  // Scheduled data for zombie rounds (turn timeouts):
  //   zombieScheduledData|<lobbyID>
  zombieScheduledData: [
    ["lobbyID", LobbyID],
  ],

  // Scheduled data for user-stat updates:
  //   userScheduledData|<nftId>|<result>
  userScheduledData: [
    ["nftId", NftID],
    ["result", MatchResult],
  ],

  // Assign cards you own to an (empty) trade NFT:
  //   setTradeNftCards|<tradeNftId>|<cards[]>
  setTradeNftCards: [
    ["tradeNftId", NftID],
    ["cards", Type.Array(Type.Number())],
  ],
} as const satisfies GrammarDefinition;
