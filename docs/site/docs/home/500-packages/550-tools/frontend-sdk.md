---
title: "@effectstream/frontend-sdk"
description: "React frontend SDK for EffectStream"
sidebar_label: "frontend-sdk"
---

<!-- Generated from packages/frontend/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/frontend-sdk`](https://www.npmjs.com/package/@effectstream/frontend-sdk)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/frontend)

Umbrella name for EffectStream's frontend code. Currently re-exports
everything from `@effectstream/wallets`.

> **Heads up — adoption status:** as of v0.100.x, no template in this
> monorepo imports from `@effectstream/frontend-sdk`. The templates'
> frontends (chess-v2, evm-midnight-v2, shinkai-v2, …) import directly
> from `@effectstream/wallets`. This package exists so app authors can
> depend on a single name, but the templates haven't migrated yet.

## Install

```bash
bun add @effectstream/frontend-sdk
# or
npm install @effectstream/frontend-sdk
```

## Usage

The export surface is exactly `@effectstream/wallets`:

```typescript
import {
  allInjectedWallets,
  walletLogin,
  WalletMode,
} from "@effectstream/frontend-sdk";

const available = await allInjectedWallets({
  signatureSupport: true,
  transactionSupport: true,
});
const evmOption = available[WalletMode.EvmInjected][0];

const { provider, signedLogin } = await walletLogin({
  preference: { name: evmOption.metadata.name },
  mode: WalletMode.EvmInjected,
});
```

> **Browser only.** Like `@effectstream/wallets`, this package depends
> on injected wallet APIs (`window.ethereum`, CIP-30, …) and won't load
> in plain Node.

## Inside EffectStream

A thin re-export of `@effectstream/wallets`. If/when frontend-only
helpers (React context providers, batcher submission hooks, event
subscribers wired to React) ship, they'll live here without breaking
app code that depended on the umbrella name.

## Key exports

Everything `@effectstream/wallets` exports. The most-imported symbols
across templates are:

- `walletLogin(...)` — one-call wallet connection + signed batcher message.
- `WalletMode` — enum of supported wallet types.
- `Wallet` — type for a connected wallet.
- `EffectstreamConfig` — runtime config the wallet helpers consume.
- `sendTransaction`, `sendBatcherTransaction`, `signMessage`, `waitForEffectstreamBlockProcessed` — send/wait helpers.
- `allInjectedWallets`, `getAddressType`, `WalletNameMap` — discovery + identification helpers.

For lower-level connector machinery (`connectInjectedWallet`,
`WalletModeMap`, `IProvider`, `IConnector`, `IInjectedConnector`), import
from `@effectstream/wallets` directly.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/frontend/test/examples.test.ts).

Real-world: every frontend in
[`templates/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates)
demonstrates the same surface — though they currently import it from
`@effectstream/wallets` rather than `@effectstream/frontend-sdk`.

## Links

- Docs: https://effectstream.github.io/docs/packages/tools/frontend-sdk
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/frontend
