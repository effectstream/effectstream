import { buildModule } from "@nomicfoundation/ignition-core";

// Deploys the account-NFT ERC721 used by the Dice game.
//
// The sync node watches this contract's Transfer events via the built-in
// ERC721 primitive (see packages/node/config.dev.ts → "Dice_AccountNFT"),
// mapping mints/transfers to the `nftMint` state transition.
//
// The contract owner (deployer / account #0) can mint directly. A
// NativeNftSale + proxy could be layered on top to let users buy NFTs with
// native currency, but it is intentionally omitted here to keep the deployment
// minimal and deterministic — players obtain account NFTs by minting.
export default buildModule("AccountNft", (m) => {
  const owner = m.getAccount(0);
  const name = m.getParameter("name", "Dice Account");
  const ticker = m.getParameter("ticker", "DICE");

  const contract = m.contract("AnnotatedMintNft", [
    name,
    ticker,
    1_000_000_000,
    owner,
  ]);

  return { contract };
});
