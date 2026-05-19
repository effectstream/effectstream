# @effectstream/wallets

Browser wallet connectors and the runtime client an EffectStream
frontend uses to log in, sign batcher messages, send transactions, and
wait for them to be processed. Spans MetaMask (and any EVM-injected
wallet), Cardano (CIP-30), Midnight, Mina, Polkadot, Algorand, and
Avail.

- Browser wallet connectors plus the runtime client a frontend uses to log in, sign, and submit.
- Spans MetaMask + injected EVM, Cardano (CIP-30), Midnight, Mina, Polkadot, Algorand, Avail.
- Used together with `@effectstream/crypto` (server-side verification).
- High-level helpers `walletLogin` and `sendTransaction` hide the polling loop.

## Install

```bash
bun add @effectstream/wallets
# or
npm install @effectstream/wallets
```

## Standalone usage

The high-level path most apps use: log in with a wallet, then send a
transaction through the batcher and wait until it lands in a block.

```typescript
import {
  walletLogin,
  WalletMode,
  EffectstreamConfig,
  sendTransaction,
} from "@effectstream/wallets";

const config = new EffectstreamConfig({ /* …chain/batcher URLs… */ });

const wallet = await walletLogin({
  config,
  preference: { name: "MetaMask" },
  mode: WalletMode.EvmInjected,
});

const result = await sendTransaction(wallet, "join|alice");
// result.blockHeight === number once the batcher's submission landed
```

If you just want to discover available wallets:

```typescript
import { allInjectedWallets, WalletMode } from "@effectstream/wallets";

const available = await allInjectedWallets({
  signatureSupport: true,
  transactionSupport: true,
});
const evmOptions = available[WalletMode.EvmInjected]; // [{ metadata, ... }, …]
```

> **Browser only.** This package depends on `window.ethereum`, the
> Cardano CIP-30 API, etc. — it won't load in plain Node. Server-side
> signature verification is `@effectstream/crypto`.

## Inside EffectStream

The client-side counterpart to `@effectstream/crypto`. Frontends
connect a wallet, sign a batcher login or transaction, and POST it to
the batcher HTTP endpoint (`@effectstream/batcher-sdk`). The node's
state machine then verifies the signature with
`CryptoManager.getCryptoManager(addressType)`. The runtime helpers
exported here (`sendTransaction`, `waitForEffectstreamBlockProcessed`)
hide the polling loop.

## Key exports

Login + signing:

- `walletLogin(args)`: top-level helper that discovers, connects, and produces a signed batcher login.
- `EffectstreamConfig`: runtime config (chain URLs, batcher URL, ...) the helpers consume.
- `signMessage(wallet, message)` — sign an arbitrary message with the connected wallet.

Sending transactions:

- `sendTransaction(wallet, conciseInput, opts?)`: submit through the batcher and (by default) wait for processing.
- `sendBatcherTransaction(...)`: explicit batcher submission.
- `sendSelfSequencedTransaction(...)` bypasses the batcher.
- `waitForEffectstreamBlockProcessed(...)` — block-height poller used by the above.

Wallet discovery / identification:

- `WalletMode`: enum of `EvmInjected`, `EvmEthers`, `Midnight`, `Cardano`, `Polkadot`, `Algorand`, `Mina`, `AvailJs`.
- `WalletNameMap`: `Record<WalletMode, string>` for display.
- `allInjectedWallets(config)` lists installed wallets in the browser.
- `getAddressType(walletMode)` maps a `WalletMode` to its `@effectstream/utils` `AddressType`.

Types:

- `Wallet`: handle returned by `walletLogin`, used by send/sign helpers.
- `UserSignature`, `Hash`, `BatcherPostResponse`, `BatcherTrackResponse`, `PostDataResponse`, `PostDataResponseAsync`, `SignFunction`.

Lower-level connector machinery (used internally; export surface is
stable but rarely needed in app code): `connectInjectedWallet`,
`WalletModeMap`, `IProvider`, `IConnector`, `IInjectedConnector`,
`InjectionPreference`.

## Examples

Runnable: [`src/utils.test.ts`](./src/utils.test.ts) and
[`test/examples.test.ts`](./test/examples.test.ts).

Real-world usage in templates (each imports `walletLogin`, `WalletMode`,
`EffectstreamConfig`, `sendTransaction`):

- [`templates/chess-v2/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/chess-v2)
- [`templates/evm-midnight-v2/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/evm-midnight-v2)
- [`templates/shinkai-v2/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates/shinkai-v2)

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/wallets
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/wallets
