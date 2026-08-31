# NFT Level-Up — Effectstream Template

A "stateful NFT" game built on the Effectstream framework (Bun monorepo, EVM L2
+ a real custom ERC721 character-sale contract suite). Players **mint** an
elemental character NFT (air / earth / fire / water / ether) and **level it up**;
each character's level is stored in the sync node's database.

Ported from the paima-engine-v1 `nft-lvlup` game (`@paima/*`) to the current
`@effectstream/*` 0.100.18 flat layout.

## Gameplay

- **Mint a character** (`nftMint|<tokenId>|<type>`) — creates a character row at
  level 1 with the chosen elemental type, owned by the signer.
- **Level up** (`lvlUp|<tokenId>`) — increments the character's level. Only the
  owner may level up their own character.

## How actions reach the node (mint vs lvlUp)

Both `nftMint` and `lvlUp` are submitted as **L2 actions** through the
`EffectstreamL2Contract` (`effectstreamSubmitGameInput`).

The original game read the character "type" from the ERC721 mint annotation via
a CDE. The modern built-in ERC721 primitive only emits `{to, from, tokenId,
isBurn}` from the `Transfer` event — it does **not** read the
`Minted(tokenId, initialData)` annotation. So the type is delivered to the node
out-of-band as the `nftMint` L2 action carrying both the token id and the type.

The character ERC721 is still watched by the built-in **ERC721 primitive** so
on-chain ownership is tracked into
`primitives.erc721_ownership_view_nftlvlup_characternft` (no `stateMachinePrefix`
— Transfer events are not routed to a transition).

## Contract suite

`packages/contracts-evm/` ships the full character-sale suite (ported from the
v1 Solidity), built with Foundry + Hardhat and deployed via Hardhat Ignition:

| Contract | Role |
|---|---|
| `CharacterNft` | The `AnnotatedMintNft` ERC721 the sync node watches |
| `CharacterTypeMapper` | Maps the `CharacterType` enum → its string ("air"…"ether") |
| `TypedNativeCharacterSale` + `NativeNftSaleProxy` | Buy a character with native currency |
| `CharacterPaymentToken` (ERC20) + `TypedErc20CharacterSale` + `Erc20NftSaleProxy` | Buy a character with an ERC20 |
| `MyEffectstreamL2` | The L2 contract that carries `nftMint` / `lvlUp` actions |

The base `NativeNftSale` / `Erc20NftSale` / proxies / `AnnotatedMintNft` come
from `@effectstream/evm-contracts` (the modern equivalent of the v1
`@paima/evm-contracts`); the template only ports the game-specific extensions.
Both sale proxies are registered as minters on `CharacterNft`, so a purchase
mints a token whose `initialData` annotation encodes the character type.

> No contracts were dropped from the v1 suite. The v1 `ERC20PresetMinterPauser`
> was updated to OpenZeppelin v5 (`Ownable(initialOwner)`) and renamed
> `CharacterPaymentToken`; `NftTypeMapper`/`TypedNativeNftSale`/`TypedErc20NftSale`
> were renamed (`Character*`) to avoid colliding with the demo contracts shipped
> in `@effectstream/evm-contracts/src/contracts/dev/`.

## Architecture

Flat Bun monorepo (`packages/*`):

| Package | Name | Purpose |
|---------|------|---------|
| `packages/node/` | `@nft-lvlup/node` | Sync node, grammar, state machine, API |
| `packages/database/` | `@nft-lvlup/database` | SQL migrations + pgtyped queries (`characters` table) |
| `packages/contracts-evm/` | `@nft-lvlup/contracts-evm` | EffectstreamL2 + character ERC721 sale suite |
| `packages/frontend/` | `@nft-lvlup/frontend` | Vanilla-JS dual-wallet UI + Fastify static server |
| `packages/tests/` | `@nft-lvlup/tests` | E2E suite (Phase A infra, B STM/DB/API, C frontend) |

## Frontend

The frontend is a single vanilla-JS Fastify-served web app. The original v1
project had two React+Vite apps — a `frontend` (game) and a `frontend-nft-sale`
(marketplace). Both imported the removed `@paima/sdk` middleware and wagmi. The
marketplace's core action (buy a character of a chosen type) is **folded into a
"Mint a Character" panel** in the primary frontend, so the whole template ships
as one served app that exercises mint + level-up end-to-end. The standalone
React marketplace is not preserved (it was a thin wrapper over the sale contract
that the folded panel replaces).

It exposes **both** wallet modes per the template invariant:
- `Connect Browser Wallet` → `WalletMode.EvmInjected` (MetaMask, …)
- `Connect Local Wallet (dev)` → `WalletMode.EvmViem` (in-process, drives headless e2e)

## Commands

```bash
bun install            # install deps
bun run dev            # full stack: PGLite + Hardhat + sync + frontend
bun run build:evm      # compile Solidity + generate TS bindings
bun run build:pgtypes  # regenerate pgtyped .queries.ts
bun run test           # E2E tests (packages/tests/run-tests.ts)
```

## API routes

- `GET /characters?wallet=` — characters owned by a wallet (with level + type)
- `GET /owned_characters?wallet=` — v1-compatible alias of the above
- `GET /character/:nftId` — a single character by token id (level + type + owner)

## Ports

| Service | Port |
|---------|------|
| Sync node API | 9999 |
| Frontend | 10599 |
| PGLite | 5432 |
| Hardhat EVM | 8545 |
