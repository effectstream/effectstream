import { buildModule } from "@nomicfoundation/ignition-core";

// Deploys the "account" NFT ERC721 used by the Trading Cards game.
//
// Owning an account NFT is what lets a wallet create/join lobbies, buy card
// packs, and own cards (its token id is the player's `nft_id` everywhere in the
// game state). The sync node watches this contract's Transfer events via the
// built-in ERC721 primitive (see packages/node/config.dev.ts → "TC_AccountNFT")
// so on-chain ownership is tracked into primitives.erc721_ownership_view_*.
//
// The contract owner (deployer / account #0) can mint directly. A NativeNftSale
// + proxy could be layered on top to let users buy NFTs with native currency,
// but it is intentionally omitted to keep the deployment minimal and
// deterministic — players obtain account NFTs by minting.
export default buildModule("AccountNft", (m) => {
  const owner = m.getAccount(0);
  const name = m.getParameter("name", "Trading Cards Account");
  const ticker = m.getParameter("ticker", "TCA");

  const contract = m.contract("AnnotatedMintNft", [
    name,
    ticker,
    1_000_000_000,
    owner,
  ]);

  return { contract };
});
