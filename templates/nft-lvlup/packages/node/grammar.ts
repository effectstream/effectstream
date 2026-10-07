import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

// The five character "types". Mirrors the Solidity `CharacterType` enum and the
// `nft_type` Postgres enum.
const CharacterType = Type.Union([
  Type.Literal("air"),
  Type.Literal("earth"),
  Type.Literal("fire"),
  Type.Literal("water"),
  Type.Literal("ether"),
]);

// Token id of a character NFT (the on-chain ERC721 token id).
const TokenId = Type.Number({ minimum: 0 });

export const grammar = {
  // Mint a character into the game state.
  //
  // In the original @paima game the character "type" was read from the ERC721
  // mint annotation by the ERC721 CDE. The modern built-in ERC721 primitive
  // only emits {to, from, tokenId, isBurn} from the Transfer event — it does
  // NOT read the `Minted(tokenId, initialData)` annotation. So the type is
  // delivered to the node out-of-band as an L2 action carrying both the token
  // id and the type:  nftMint|<tokenId>|<type>
  //
  // Ownership is still tracked independently by the ERC721 primitive (see
  // config.dev.ts) into primitives.erc721_ownership_view_*.
  nftMint: [
    ["tokenId", TokenId],
    ["type", CharacterType],
  ],

  // Level up a character you own:  lvlUp|<tokenId>
  lvlUp: [
    ["tokenId", TokenId],
  ],
} as const satisfies GrammarDefinition;
