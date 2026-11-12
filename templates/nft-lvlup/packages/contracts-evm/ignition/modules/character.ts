import { buildModule } from "@nomicfoundation/ignition-core";
import type {
  IgnitionModuleBuilder,
  NamedArtifactContractDeploymentFuture,
} from "@nomicfoundation/ignition-core";

// Deploys the full character-NFT suite for the level-up game:
//
//   - CharacterNft (the AnnotatedMintNft ERC721 the sync node watches)
//   - TypedNativeCharacterSale + NativeNftSaleProxy (buy a character with the
//     chain's native currency)
//   - CharacterPaymentToken (ERC20) + TypedErc20CharacterSale +
//     Erc20NftSaleProxy (buy a character with an ERC20)
//
// Both sale proxies are registered as minters on CharacterNft so a purchase
// mints a token whose `initialData` annotation encodes the character "type".
// The deployer (account #0) is also an implicit minter (contract owner), which
// is what the test suite uses to mint directly.

function createNft(m: IgnitionModuleBuilder) {
  // https://github.com/NomicFoundation/hardhat-ignition/issues/673
  const owner = m.getAccount(0);
  const name = m.getParameter("name", "Player Character");
  const ticker = m.getParameter("ticker", "PC");

  const nftContract = m.contract("CharacterNft", [
    name,
    ticker,
    1_000_000_000,
    owner,
  ]);

  return { nftContract };
}

function createNativeSale(
  m: IgnitionModuleBuilder,
  nftContract: NamedArtifactContractDeploymentFuture<"CharacterNft">,
) {
  const owner = m.getAccount(0);
  const price = m.getParameter("price", 1);

  // The implementation is deployed bare (constructor disables initializers), so
  // we don't call onlyOwner functions like `updatePrice` on it directly — the
  // proxy's constructor initializes the price below.
  const saleImpl = m.contract("TypedNativeCharacterSale", []);

  const nativeSaleProxy = m.contract("NativeCharacterSaleProxy", [
    saleImpl,
    owner,
    nftContract,
    price,
  ]);

  // Allow the sale proxy (and only it, plus the owner) to mint.
  m.call(nftContract, "setMinter", [nativeSaleProxy], {
    id: "CharacterNft_NativeSaleProxy_setMinter",
  });

  return { saleImpl, nativeSaleProxy };
}

function createErc20Sale(
  m: IgnitionModuleBuilder,
  nftContract: NamedArtifactContractDeploymentFuture<"CharacterNft">,
) {
  const owner = m.getAccount(0);
  const price = m.getParameter("price", 1);

  const erc20SaleImpl = m.contract("TypedErc20CharacterSale", []);

  const paymentToken = m.contract("CharacterPaymentToken", [owner]);
  m.call(paymentToken, "mint", [owner, 1_000_000_000_000_000n], {
    id: "CharacterPaymentToken_mint",
  });

  const erc20SaleProxy = m.contract("Erc20CharacterSaleProxy", [
    erc20SaleImpl,
    [paymentToken],
    owner,
    nftContract,
    price,
  ]);

  m.call(nftContract, "setMinter", [erc20SaleProxy], {
    id: "CharacterNft_Erc20SaleProxy_setMinter",
  });

  return { erc20SaleImpl, paymentToken, erc20SaleProxy };
}

export default buildModule("Character", (m) => {
  const { nftContract } = createNft(m);
  return {
    nftContract,
    ...createNativeSale(m, nftContract),
    ...createErc20Sale(m, nftContract),
  };
});
