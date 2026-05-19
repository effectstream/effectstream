# Contracts

EffectStream ships first-party on-chain contracts that templates and applications can extend or use directly. EVM contracts are published as `@effectstream/evm-contracts`; Cardano validators ship as Aiken sources alongside their compiled `plutus.json` inside the templates that use them.

## EVM (Solidity)

Source: [`packages/chains/evm-contracts/src/contracts`](https://github.com/effectstream/effectstream/tree/v-next/packages/chains/evm-contracts/src/contracts).

### Core

- **`EffectstreamL2Contract`** — the canonical L2 batch poster. Calling `effectstreamSubmitGameInput(bytes)` emits an `EffectstreamGameInteraction` event that the sync node picks up to advance the state machine. Most dApps extend this directly; see [`MyEffectstreamL2.sol`](https://github.com/effectstream/effectstream/blob/v-next/templates/chess-v2/packages/contracts-evm/src/contracts/MyEffectstreamL2.sol) in the templates.
- **`GenericPayment`** + **`Proxy/GenericPaymentProxy`** — UUPS-upgradeable payment receiver with a referrer-reward mechanism, used as a base by sale and launchpad contracts.
- **`State`** + **`BaseState`** — minimal on-chain state primitives.

### NFT sales & launchpad

- **`PaimaLaunchpad`** + **`PaimaLaunchpadFactory`** — pre-order launchpad with reward tiers, package bundles, and cart checkout. Each campaign is its own deployment. See the [NFT Launchpad blog post](/docs/blog/nft-launchpad) and the [`preorder` template](https://github.com/effectstream/effectstream/tree/v-next/templates/preorder).
- **`NativeNftSale`** + **`Proxy/NativeNftSaleProxy`** — NFT sale paid in the chain's native token (ETH/MATIC/…). UUPS-upgradeable.
- **`Erc20NftSale`** + **`Proxy/Erc20NftSaleProxy`** — NFT sale paid in an ERC-20 token. UUPS-upgradeable.
- **`AnnotatedMintNft`** — ERC-721 mint that takes calldata at mint time, used to associate on-chain mints with off-chain state machine context.

### Inverse-projected tokens

These implement the EffectStream "inverse projection" pattern — the EVM contract holds the canonical token, and the metadata is served by the application via the PRC HTTP API. See [PRC-3](/docs/home/paima-standards/prc3) (ERC-721) and [PRC-5](/docs/home/paima-standards/prc5) (ERC-1155).

- **`InverseAppProjectedNft`** / **`InverseBaseProjectedNft`** — ERC-721, app-mint vs. base-mint variants (`+` interfaces `IInverseAppProjectedNft` / `IInverseBaseProjectedNft`).
- **`InverseAppProjected1155`** / **`InverseBaseProjected1155`** — ERC-1155 stackables, app-mint vs. base-mint variants.

### Orderbook

- **`OrderbookDex`** + **`Proxy/OrderbookDexProxy`** — base-chain order book for assets that live on an app-chain. ERC-1155-aware, UUPS-upgradeable.

### Dev / fixtures

Local-development and integration-test helpers (not intended for production deployments):

- **`ERC721Dev`** — mintable ERC-721 for local fixtures.
- **`dev/Erc20Dev`** / **`dev/Token`** — ERC-20 fixtures.
- **`dev/UpgradeDev`** / **`dev/NftSaleUpgradeDev`** / **`dev/NativeNftSaleUpgradeDev`** — minimal upgrade targets for proxy regression tests.

## Cardano (Aiken)

Aiken validators ship pre-compiled as `plutus.json` inside the Cardano-side template packages, with the corresponding `.ak` sources available in the monorepo.

### Projected NFT

- **`hololocker`** — locks an L1 Cardano NFT into a script address so it can be "projected" into an EffectStream L2 game state, then released back on a cooldown. Exposes both spend and mint validators. Source: [`hololocker.ak`](https://github.com/effectstream/effectstream/blob/v-next/e2e/shared/contracts/cardano/hololocker-demo/validators/hololocker.ak). Used by the [`projected-nft-preorder` template](https://github.com/effectstream/effectstream/tree/v-next/templates/projected-nft-preorder).

### Examples

- **`hello`** — minimal Aiken validator used by the e2e test suite. Reference for the shape of a custom validator inside an EffectStream template. Source: [`hello.ak`](https://github.com/effectstream/effectstream/blob/v-next/e2e/shared/contracts/cardano/hello/validators/hello.ak).

---

> Stake-pool delegation, ZSwap, and other chain-side integrations that don't require their own deployed validator are exposed as **primitives** rather than contracts — see the relevant chain page (e.g. [Cardano](./203-cardano.md)) and the [paima-standards](/docs/home/paima-standards) section.
