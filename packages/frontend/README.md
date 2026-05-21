# @effectstream/frontend-sdk

Umbrella name for EffectStream's frontend code. Currently re-exports
everything from `@effectstream/wallets`. Depend on this if you want a
stable frontend namespace; import `@effectstream/wallets` directly if
you prefer.

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

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

Real-world: every frontend in
[`templates/`](https://github.com/effectstream/effectstream/tree/main/templates)
demonstrates the same surface.

## Links

- Docs: https://effectstream.github.io/docs/packages/tools/frontend-sdk
- Source: https://github.com/effectstream/effectstream/tree/main/packages/frontend
