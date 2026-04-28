# Wallets

> NOTE THIS IS A PREVIEW DOCUMENTATION. NYI.


In any decentralized application, the user's wallet is their identity, their key, and their signature. It's the fundamental tool that allows them to interact with the blockchain and prove ownership of their assets and actions.

A major challenge in building multi-chain dApps is that every blockchain ecosystem has its own wallet standards and connection methods. EffectStream solves this problem by providing a single, unified interface that handles the complexity for you.

## The `@effectstream/wallet` Package

The `@effectstream/wallet` package is the core frontend library for managing user identity. It provides a single, easy-to-use API for connecting to and interacting with a wide variety of blockchain wallets, abstracting away the chain-specific implementation details.

## AddressType

This table is a EffectStream numeric representation of wallet address type. Normally addresses will be used with it's corresponding address type, so the correct cryptographic signer/verifiers can be selected.

| Address Type | Number |
| ------------ | ------ |
| EVM          | 0 
| Cardano      | 1  
| Substrate    | 2
| Algorand     | 3 
| Mina         | 4
| Midnight     | 5
| Avail        | 6
| Polkadot     | 7

## Connecting a Wallet in Your Frontend

Integrating wallet connectivity into your dApp is streamlined with a single `login` function. You simply specify which type of wallet you want to connect to using the `WalletMode` enum, and the library handles the rest.

```ts
import { WalletMode, login } from '@effectstream/wallet';

const effectstreamConfig = new EffectStreamConfig(...); // see EffectStreamConfig in the @effectstream/wallets package

async function connectWallet() {
  try {
    // The login function prompts the user with their chosen wallet extension.
    const loginInfo = await login(WalletMode.EvmInjected);

    // The result contains the wallet client, address, and other info.
    console.log('Connected Wallet:', loginInfo.walletAddress);

    // Now you can use loginInfo.walletClient to sign messages or transactions.
    // Example: const signature = await loginInfo.walletClient.signMessage(...);
  } catch (error) {
    console.error('Failed to connect wallet:', error);
  }
}
```

The `WalletMode` enum allows you to support a broad range of ecosystems, enabling a truly multi-chain experience:

| `WalletMode` | Ecosystem | Description |
| :--- | :--- | :--- |
| **`EvmInjected`** | EVM | Standard EVM injected browser wallets. e.g., MetaMask, Phantom, etc. |
| **`EvmEthers`** | EVM | Connect using an EVM Compatible provider instance. e.g., Viem, Ethers, thirdweb Local Wallet, etc. |
| **`Cardano`** | Cardano | Connects to Cardano wallets. e.g., Nami, Eternl, etc. |
| **`Polkadot`** | Polkadot | Connects to wallets in the Polkadot ecosystem. |
| **`Algorand`** | Algorand | Connects to Algorand wallets. e.g., Exodus, etc. |
| **`Mina`** | Mina | Connects to the Auro wallet for the Mina Protocol. |
| **`AvailJs`** | Avail | Connects to wallets for the Avail network. |
| **`Midnight`** | Midnight | Connects to Lace Wallet |

## EffectStreamConfig

The `EffectStreamConfig` is used to configure the EffectStream.

Settings:
* **App Name**: The name of the app, used to internally sign messages.
* **EffectStream L2 Sync Protocol Name**: The name of the effectstream l2 sync protocol defined in your config.
* **EffectStream L2 Contract Address**: The address of the effectstream l2 contract to target.
* **EffectStream L2 Chain**: The chain of the effectstream l2 contract.
* **EffectStream L2 ABI**: (Optional) The abi of the effectstream l2 contract.
* **Batcher URL**: The url of the batcher to use.
* **Prefer Batched Mode**: If true use batcher by default, otherwise use self-sequenced transaction.

See the `EffectStreamConfig` in the `@effectstream/wallets` package for more details.

```ts
const effectstreamConfig = new EffectStreamConfig(
  "my-app",                       // app name
  "effectstream-l2-sync-protocol-name",  // effectstream l2 sync protocol name
  "0x1234567890abcdef",           // effectstream l2 contract address
  hardhat,                        // effectstream l2 chain
  undefined,                      // if undefined, use default effectstream l2 abi
  "http://localhost:3334",        // batcher url
  true,                           // if true use batcher by default
);
```

## Primary Uses of a Connected Wallet

Once a user has connected their wallet, your frontend can use the returned `walletClient` for different uses.

### 1. Sending Concise Inputs to EffectStream L2 Contract

Send a transaction to the EffectStream L2 contract.
This will automatically decide whether to use the batcher or the self-sequenced transaction based on the `preferBatchedMode` flag.

```ts
const conciseInput = ["my-action", "0x1", "0x2"]; // Your grammar-formatted input
const result = await sendTransaction(walletClient, conciseInput, effectstreamConfig);
```

See the `sendTransaction` function in the `@effectstream/wallets` package for more details.

### 2. Manually Signing Messages for the Batcher

To provide a gasless, cross-chain experience, the user's wallet is used to **sign a message** containing their game input. This signed message is then sent to the [Batcher](./108-batcher/1200-overview.md), which handles the on-chain submission. This is the core mechanism that allows a Cardano user to play a game on an EVM chain without needing an EVM wallet or gas.

```ts
const conciseInput = ["my-action", "0x3", "0x4"]; // Your grammar-formatted input
const result = await sendBatcherTransaction(walletClient, conciseInput, effectstreamConfig);
```

### 3. Sending On-Chain Transactions

For specific, high-stakes actions, or if your dApp doesn't use a Batcher, you can use the wallet to send traditional on-chain transactions.

*   **Direct EffectStream L2 Contract Interaction**: Call the `submitInput` function on the `EffectStreamL2Contract` to send a game move directly.
This can be done using the `sendSelfSequencedTransaction` function.
```ts
const result = await sendSelfSequencedTransaction(walletClient, conciseInput, effectstreamConfig);
```

*   **Other Contract Interactions**: Call any function on any other smart contract, such as minting an NFT or transferring an ERC20 token.

### 4. User Identification

The user's `walletAddress` is their primary identifier within the EffectStream. When your State Machine receives an input, it knows which user performed the action based on the `signerAddress`. This address is used to query the database for the user's state, inventory, and other relevant information.

### 4. Signing Messages

You can sign custom messages with the wallet.
```ts
const message = "my-message";
const signature = await walletClient.signMessage({ message });
```

## Wallets and the EffectStream Account System

A wallet address is not just an identifier; it's also the key to EffectStream's flexible L2 **Account System**. While a wallet can act as a standalone identity, it can also be linked to a higher-level EffectStream Account.

This allows for an "account abstraction" experience where:
*   A single EffectStream Account can be controlled by multiple wallet addresses.
*   The primary (controlling) wallet of an account can be changed.

A user manages their account by sending built-in system commands (like `&linkAddress`) to the `EffectStreamL2Contract`, using their connected wallet to authorize the action with a signature.

**[Learn more about the EffectStream Account System](./116-accounts.md)**