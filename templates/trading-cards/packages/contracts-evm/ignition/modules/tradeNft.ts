import { buildModule } from "@nomicfoundation/ignition-core";

// Deploys the "trade" NFT ERC721. A trade NFT is a tradeable bundle of cards:
// a player assigns cards they own to an (empty) trade NFT via `setTradeNftCards`
// and the holder of the trade NFT can later claim those cards. The sync node
// watches this contract's Transfer events via a second built-in ERC721
// primitive (see packages/node/config.dev.ts → "TC_TradeNFT").
//
// This is the SAME `AnnotatedMintNft` contract as the account NFT, deployed a
// second time so the two NFT collections get distinct on-chain addresses (and
// distinct ownership-tracking primitives).
export default buildModule("TradeNft", (m) => {
  const owner = m.getAccount(0);
  const name = m.getParameter("name", "Trading Cards Trade NFT");
  const ticker = m.getParameter("ticker", "TCT");

  const contract = m.contract("AnnotatedMintNft", [
    name,
    ticker,
    1_000_000_000,
    owner,
  ]);

  return { contract };
});
