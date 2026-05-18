# PRC-3 — Paima Inverse Projection Interface (ERC-721)

## Use case

List your in-game ERC-721 assets on any L1 marketplace, with live metadata served straight from your game.

## Summary

Games that need significant compute typically run on sidechains, L2s, or appchains. That keeps execution affordable but fragments liquidity — buyers and sellers congregate on popular L1 NFT marketplaces, which don't know about the game's home chain.

PRC-3 lets the game **inverse-project** its state outward: a smart contract on an L1 mints ERC-721 tokens whose `tokenURI` resolves *back to the game node* over HTTP. When the L1 NFT is sold, the buyer's claim on the in-game state transfers with it. When it is burned, the asset is returned (or transferred) in-game. No traditional bridge — the L1 is just a tradeable surface on top of the game's own state.

## Specification

Every PRC-3 compliant contract MUST implement `IInverseProjectedNft`, which extends ERC-721 and [ERC-4906](https://eips.ethereum.org/EIPS/eip-4906) (metadata-update events):

- A public `burn()` callable by the token owner.
- A configurable `baseURI` and `baseExtension`.
- Multiple `tokenURI(...)` variants — the default uses the game's RPC, but callers can pass either a custom RPC base URL or a contract implementing `IUri` for fully on-chain metadata.

### Base URI shape

```
https://{rpcBase}/inverseProjection/{standard}/{purpose}/{chainIdentifier}/{identifier}
```

- `rpcBase` — the URL of an RPC for the game (defaults to the project's hosted node).
- `standard` — the PRC version, e.g. `prc3`.
- `purpose` — app-specific (e.g. `cards`, `weapons`).
- `chainIdentifier` — CAIP-2 chain id (e.g. `eip155:1` for Ethereum mainnet).
- `identifier` — depends on initialisation mode (see below).

A concrete URI looks like `https://rpc.mygame.com/inverseProjection/prc3/cards/eip155:1/0xabc.../42`.

## Initialisation modes

PRC-3 supports two ways of starting a projection, each with its own trade-offs.

### 1. App-Layer Initiated

The game first issues a `userTokenId` for `<chainId, address, ...>`. The user then mints the corresponding NFT on the L1 referencing that id.

- **Pros**: no finality wait on the L1, the game state is verifiable, supports batch minting.
- **Cons**: requires coordinated signing on two chains; gas ≈ 130–175 k.

`userTokenId` is `<minter,counter>`-unique. The Solidity contract enforces uniqueness so two mints with the same pair are impossible.

### 2. Base-Layer Initiated

The user mints directly on the L1, passing `initialData` to describe what they're projecting. The contract's own monotonically-increasing `tokenId` is the identifier.

- **Pros**: no app-layer transaction, lower gas (≈ 75–100 k).
- **Cons**: must wait for L1 finality before the game can react; the game may need to reject the mint if `initialData` is no longer valid in current game state.

A typical resulting URI for app-initiated mode:

```
https://rpc.mygame.com/inverseProjection/prc3/cards/eip155:1/0x1946a1DD…/1
```

## Mint validity

Marketplace features like collection offers and "floor sweeping" need a way to distinguish well-formed mints from broken ones. PRC-3 requires every token's metadata to carry a `validity` attribute:

```json
{ "attributes": [{ "trait_type": "validity", "value": "valid" }] }
```

- `valid` — game-state matches the mint claim.
- `invalid` — mint exists but is not honoured by *this version* of the game.

Critically, **invalid mints still increment the counter**. A mint that's invalid in one game variant may be valid in another (forks, mods, parallel deployments). Failing to increment would cause the same valid mint to map to a different `userTokenId` across variants and break interoperability.

### Endpoint error cases

- A `userTokenId` (or `tokenId`) the game hasn't seen yet → return **HTTP 404** (don't return dummy data — NFT marketplaces aggressively cache).
- A token marked invalid for this game variant → return **HTTP 404** (same reason).

## Rationale

Instead of pinning metadata to IPFS or other immutable storage, the `tokenURI` *is* the RPC call. The marketplace fetches live state. The contract MUST enforce `chainIdentifier` on-chain (not just in the base URI) so a deployment on chain A can't pretend to be tokens from chain B.

`tokenURI` overloads exist so neither the user nor the marketplace is locked into trusting the original game's RPC:

1. `tokenURI(id, customBaseUri)` — pass any RPC you trust.
2. `tokenURI(id, IUri customSource)` — use any on-chain source implementing `IUri`.

The contract emits ERC-4906 metadata-update events so marketplaces invalidate their caches when the game advances. ERC-4906 in PRC-3 is callable by **anyone**, not just the admin — if the game updates and marketplaces are stale, any user can trigger a refresh.

## Security model

PRC-3 relies on **honest RPC operation**, which is the standard assumption for nearly every existing dApp (e.g. trusting OpenSea to render the right metadata). A user who wants stronger guarantees can run their own full node and serve their own RPC.

Marketplaces' caches are kept honest by ERC-4906 metadata-update events; the game forces refreshes when state advances or when a token's validity flips.

