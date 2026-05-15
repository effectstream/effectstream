---
title: "@effectstream/frontend-sdk"
description: "React frontend SDK for EffectStream"
sidebar_label: "frontend-sdk"
---

{/* Generated from packages/frontend/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/frontend-sdk`](https://www.npmjs.com/package/@effectstream/frontend-sdk)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/frontend)

The frontend entry point for EffectStream apps. Today this re-exports
`@effectstream/wallets` under a stable name so app code can depend on
`@effectstream/frontend-sdk` and not worry about the underlying split.
Future frontend-only helpers (event subscriptions, batcher submission
hooks, React-specific glue) will land in this package.

## Install

```bash
bun add @effectstream/frontend-sdk
# or
npm install @effectstream/frontend-sdk
```

## Standalone usage

Anything you'd get from
[`@effectstream/wallets`](https://www.npmjs.com/package/@effectstream/wallets)
— multi-chain browser wallet connectors, `walletLogin`,
`allInjectedWallets`, `WalletMode`, `IProvider` — is available here too.

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

// One call: connect the wallet + produce a signed batcher login message.
const { provider, signedLogin } = await walletLogin({
  preference: { name: evmOption.metadata.name },
  mode: WalletMode.EvmInjected,
});
```

> **Browser only.** Like `@effectstream/wallets`, this package depends
> on injected wallet APIs and will not load in plain Node.

## Inside EffectStream

`@effectstream/frontend-sdk` is the seam apps reach for. Today it points
to `@effectstream/wallets`; if/when frontend-only helpers (event
subscribers, batcher submission hooks, React context providers) ship,
they'll be added here without breaking app code.

## Key exports

Everything `@effectstream/wallets` exports — including:

- `walletLogin(...)` — one-call wallet connection + signed batcher message.
- `allInjectedWallets(config)` — discover installed wallets.
- `sendTransaction`, `sendBatcherTransaction`, `sendSelfSequencedTransaction`, `signMessage`, `waitForEffectstreamBlockProcessed` — runtime helpers for the frontend's send/wait loop.
- `WalletMode`, `WalletNameMap` — connector identifiers.
- `getAddressType(walletMode)` — map a `WalletMode` to `AddressType`.
- `EffectstreamConfig` — the config shape the frontend reads at boot.
- `accountMessages`, `accountPayload_` — re-exported from `@effectstream/concise` for account-delegation flows.

For lower-level connector machinery (`connectInjectedWallet`, `WalletModeMap`, `IProvider`, `IConnector`, `IInjectedConnector`), import from `@effectstream/wallets` directly.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/frontend/test/examples.test.ts).

The frontends in
[`templates/dice/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/dice)
and [`templates/minimal/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/minimal)
import directly from this package.

## Links

- Docs: https://effectstream.github.io/docs/packages/tools/frontend-sdk
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/frontend
