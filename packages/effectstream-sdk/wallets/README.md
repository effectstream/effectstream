# @effectstream/wallets

Browser wallet connectors and the runtime client an EffectStream
frontend uses to log in, sign batcher messages, send transactions, and
wait for them to be processed. Spans MetaMask (and any EVM-injected
wallet), Cardano (CIP-30), Midnight, Mina, Polkadot, Algorand, Avail,
and Solana.

- Browser wallet connectors plus the runtime client a frontend uses to log in, sign, and submit.
- Spans MetaMask + injected EVM, Cardano (CIP-30), Midnight, Mina, Polkadot, Algorand, Avail, Solana.
- Used together with `@effectstream/crypto` (server-side verification).
- High-level helpers `walletLogin` and `sendTransaction` hide the polling loop.
- Also supports **local (in-browser) wallets** that need no extension: `CardanoLocal`, `EvmViem`, `MidnightLocal`.

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
import { hardhat } from "viem/chains";

// The constructor takes positional arguments, not an options object.
const config = new EffectstreamConfig(
  "my-app",                     // securityNamespace — must match the node's
  "parallelEvmRPC",             // effectstreamL2SyncProtocolName
  "0x5FbDB2315678afecb367f032d93F642f64180aa3", // L2 contract address
  hardhat,                      // viem Chain
  undefined,                    // L2 ABI (undefined → built-in fallback ABI)
  "http://localhost:3334",      // batcherURL (required when batching)
  true,                         // preferBatchedMode
);

const result = await walletLogin({
  mode: WalletMode.EvmInjected,
  preference: { name: "MetaMask" },
  preferBatchedMode: true,
});
if (!result.success) throw new Error("login failed");
const wallet = result.result;

// conciseData is the grammar tuple as an array; config is a required argument.
const tx = await sendTransaction(wallet, ["join", "alice"], config);
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
> Cardano CIP-30 API, etc. - it won't load in plain Node. Server-side
> signature verification is `@effectstream/crypto`.

## Local wallets (no extension required)

Besides connecting an injected/extension wallet, `@effectstream/wallets`
can generate and manage a key-pair **locally, in the browser**. The local
modes return the same `Wallet` handle as the injected ones, so `signMessage`
and `sendTransaction` work identically:

- `WalletMode.CardanoLocal` - BIP-39 seed generated in-browser (via Lucid).
- `WalletMode.EvmViem` - viem account from a `0x` private key.
- `WalletMode.MidnightLocal` - hex seed generated in-browser.

Solana ships its connector on two dedicated subpaths rather than through the
package root: `@effectstream/wallets/solana` (`SolanaConnector`,
`SolanaProvider`, `SolanaWalletApi` — for injected wallets such as Phantom)
and `@effectstream/wallets/solana-local` (`SolanaLocalConnector`,
`SolanaLocalProvider` — the in-browser local wallet).

```typescript
import { walletLogin, WalletMode, signMessage } from "@effectstream/wallets";

// A fresh BIP-39 seed is generated in the browser when `seedPhrase` is omitted.
const wallet = await walletLogin({
  mode: WalletMode.CardanoLocal,
  network: "Preview", // "Mainnet" | "Preprod" | "Preview" | "Custom"
});
if (!wallet.success) throw new Error(wallet.errorMessage);

wallet.result.walletAddress; // addr_test1...
const signature = await signMessage(wallet.result, "hello effectstream");
```

These modes need no browser extension (no `window.ethereum`, no CIP-30) -
the key material is created client-side and never touches a server. Pair a
local key with the account-linking delegation (`&linkAddress`) so a real
wallet (Cardano CIP-30, MetaMask, ...) can authorise it to sign
non-financial inputs: this is the basis of the device-key / frictionless
signing flow. Source: [`src/cardano/local.ts`](https://github.com/effectstream/effectstream/blob/main/packages/effectstream-sdk/wallets/src/cardano/local.ts)
and the runnable [`src/cardano/local.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/effectstream-sdk/wallets/src/cardano/local.test.ts)
(generate -> sign -> verify with `@effectstream/crypto`).

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
- `signMessage(wallet, message)` - sign an arbitrary message with the connected wallet.

Sending transactions:

- `sendTransaction(wallet, conciseData, config, waitForConfirmation?, batcherTarget?)`: submit through the batcher (or self-sequence, depending on `config.preferBatchedMode`) and, by default, wait for processing. `conciseData` is the grammar tuple as an array; `config` is a required `EffectstreamConfig`.
- `sendBatcherTransaction(...)`: explicit batcher submission.
- `sendSelfSequencedTransaction(...)` bypasses the batcher.
- `waitForEffectstreamBlockProcessed(...)` - block-height poller used by the above.

Wallet discovery / identification:

- `WalletMode`: enum of `EvmInjected`, `EvmEthers`, `EvmViem`, `Midnight`, `MidnightLocal`, `Cardano`, `CardanoLocal`, `Polkadot`, `Algorand`, `Mina`, `AvailJs`, `Solana`. The `*Local` and `EvmViem` modes are in-browser wallets that need no extension.
- `WalletNameMap`: `Record<WalletMode, string>` for display.
- `allInjectedWallets(config)` lists installed wallets in the browser.
- `getAddressType(walletMode)` maps a `WalletMode` to its `@effectstream/utils` `AddressType`.

Types:

- `Wallet`: handle returned by `walletLogin`, used by send/sign helpers.
- `UserSignature`, `AddressAndType`, `WalletOption`, `IProvider`, `LoginInfo`, `LoginInfoMap`.

> **Not re-exported from the package root.** These exist in the source but are
> not part of the entry point, so they cannot be imported from
> `@effectstream/wallets` today: `Hash`, `BatcherPostResponse`,
> `BatcherTrackResponse`, `PostDataResponse`, `PostDataResponseAsync`,
> `SignFunction` (all in `src/types.ts`); `connectInjectedWallet`,
> `WalletModeMap`, `InjectionPreference` (`src/utils.ts`); and `IConnector`,
> `IInjectedConnector` (`src/IProvider.ts`).

## Examples

Runnable: [`src/utils.test.ts`](./src/utils.test.ts) and
[`test/examples.test.ts`](./test/examples.test.ts).

Real-world usage in templates (each imports `walletLogin`, `WalletMode`,
`EffectstreamConfig`, `sendTransaction`):

- [`templates/chess-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/chess-v2)
- [`templates/evm-midnight-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/evm-midnight-v2)
- [`templates/shinkai-v2/`](https://github.com/effectstream/effectstream/tree/main/templates/shinkai-v2)

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/wallets
- Source: https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/wallets
