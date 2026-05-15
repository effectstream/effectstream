---
title: "@effectstream/wallets"
description: "Wallet connector integrations for EffectStream"
sidebar_label: "wallets"
---

<!-- Generated from packages/effectstream-sdk/wallets/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/wallets)

Browser wallet connectors for EffectStream apps. One uniform API spans
MetaMask (and any EVM-injected wallet), Cardano (CIP-30), Midnight, Mina,
Polkadot, Algorand, and Avail. Each returns an `IProvider` that can sign
messages and report the user's address + chain type.

## Install

```bash
bun add @effectstream/wallets
# or
npm install @effectstream/wallets
```

## Standalone usage

You don't need the rest of EffectStream to use this package — drop it into
any web app that wants multi-chain wallet sign-in.

```typescript
import {
  allInjectedWallets,
  connectInjectedWallet,
  WalletMode,
  WalletModeMap,
} from "@effectstream/wallets";

// 1. Discover what's installed in the user's browser.
const available = await allInjectedWallets({
  signatureSupport: true,
  transactionSupport: true,
});

// 2. Pick a wallet — e.g. the first EVM extension the user has.
const evmOptions = available[WalletMode.EvmInjected];
const choice = evmOptions[0];

// 3. Connect. Returns an IProvider with getAddress() / signMessage().
const provider = await connectInjectedWallet(
  "EVM",
  { name: choice.metadata.name },
  WalletModeMap[WalletMode.EvmInjected],
);

const { type, address } = provider.getAddress();
const signature = await provider.signMessage("Sign in 2026-05-14");
```

For a one-shot "log in and produce a signed message ready for the batcher",
use the higher-level `walletLogin` helper from the same package.

> **Browser only.** This package depends on `window.ethereum`, the Cardano
> CIP-30 API, etc. It will not load in plain Node — pair it with a Node
> verifier (`@effectstream/crypto`) on the server side.

## Inside EffectStream

`@effectstream/wallets` is the client-side counterpart to `@effectstream/crypto`.
The frontend connects a wallet and signs a batcher message; the node verifies
that signature with `CryptoManager`. The `accountPayload_` and `accountMessages`
re-exports tie wallet output to the on-chain `concise` schema, so messages can
flow straight into `@effectstream/batcher-sdk`.

## Key exports

- `WalletMode` — enum: `EvmInjected`, `EvmEthers`, `Midnight`, `Cardano`, `Polkadot`, `Algorand`, `Mina`, `AvailJs`.
- `WalletNameMap` — `Record<WalletMode, string>` for display.
- `WalletModeMap` — `Record<WalletMode, IConnector>`, ready-to-use connector singletons.
- `allInjectedWallets(config)` — discovers which wallets the user has installed.
- `connectInjectedWallet(label, preference, connector)` — connects to a specific wallet.
- `walletLogin(...)` — one-call helper that connects + signs a batcher login message.
- `IProvider` — uniform connection handle: `getAddress()`, `signMessage()`, `getConnection()`.
- `getAddressType(walletMode)` — maps a `WalletMode` to its `@effectstream/utils` `AddressType`.

## Examples

Runnable examples that exercise the connector API with a mock wallet:
[`src/utils.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/effectstream-sdk/wallets/src/utils.test.ts) and
[`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/effectstream-sdk/wallets/test/examples.test.ts). Both run as part of
`bun test ./packages`.

Real-world integration in the templates: the EVM frontend uses
`WalletMode.EvmInjected` directly. See
[`templates/dice/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/dice)
for a full game wired up with `@effectstream/wallets`.

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/wallets
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/wallets
