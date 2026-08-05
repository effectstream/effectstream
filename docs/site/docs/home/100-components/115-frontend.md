# Frontend (dApp)

The frontend is the user-facing part of your decentralized application, such as a web-based game or a user dashboard. Its primary role is to provide an interface for users to interact with your dApp's state.

## Getting Started

The `/templates/evm-midnight-v2/` template includes a `/packages/frontend/` folder containing a complete, working web application to serve as a starting point.

A frontend's interaction with EffectStream can be broken down into two main activities:
*   **Writes**: Submitting new actions (transactions or signed messages) to the blockchain to change the application's state.
*   **Reads**: Querying the EffectStream's API to fetch and display the current, aggregated state of the application.

## Universal JavaScript Compatibility
A core design principle of EffectStream's frontend libraries is that they are **framework-agnostic**. They are written in standard TypeScript and compile to JavaScript, meaning they are not tied to any specific UI framework like React or Vue.

This universality allows you to build your dApp with a wide range of tools.

#### Standard Web Frameworks
You can seamlessly integrate EffectStream's frontend packages into any modern web framework:
*   React & Next.js
*   Vue & Nuxt.js
*   Svelte & SvelteKit
*   And more...

#### Game Engines
This JavaScript-first approach is especially powerful for game developers. You can build your application using dedicated game engines and still connect to the EffectStream backend. If your engine can compile to a web target (WebGL/HTML5) and interface with browser JavaScript, it can be a EffectStream-powered game.

Integration is possible with many popular game engines:
*   **Unity**: Use `*.jslib` files to bridge C# game logic with EffectStream's JavaScript libraries.
*   **GameMaker**: Use the native extension system to call JavaScript functions from GML.
*   **Godot**: Use the `JavaScriptBridge` singleton for seamless communication between GDScript and JavaScript.
*   **Phaser.js & PixiJS**: As native JavaScript frameworks, integration is direct and straightforward.

## Writing Data to the Blockchain (Writes)
To change the state of the application, the frontend must initiate a transaction or a signed message.

### Connecting a Wallet
All write operations begin with connecting a user's wallet. The `@effectstream/wallets` package provides a unified interface for connecting to various blockchain ecosystems.

```ts
import { WalletMode, walletLogin } from '@effectstream/wallets';

// Example for an injected EVM wallet like MetaMask
const result = await walletLogin({
  mode: WalletMode.EvmInjected,
  preferBatchedMode: true,
});

if (result.success) {
  const { walletAddress, provider } = result.result;
}
```
Supported wallet modes include `EvmInjected`, `Cardano`, `Mina`, `AvailJs`, `Solana`, and more, enabling truly cross-chain applications. See the [wallets package reference](../500-packages/510-sdk/wallets.md) for the exact login options each mode takes.

### Submission Methods
1.  **Direct Contract Interaction**: The standard Web3 approach where your frontend calls a function on a smart contract directly (e.g., minting an NFT).
2.  **Direct EffectStream L2 Contract Interaction**: A specific direct interaction where your frontend calls the `effectstreamSubmitGameInput` method on your game's `EffectstreamL2Contract` with a grammar-formatted payload. The user pays the gas for this transaction.
3.  **Batcher Interaction**: The recommended approach for the best UX. The user signs a message, and the frontend sends it to a **Batcher** service via an HTTP request. The Batcher then submits the input on-chain, often covering the gas fee and allowing users from different chains to interact.

Here is an example of a frontend submitting an input to the batcher:
```ts
import { createMessageForBatcher } from '@effectstream/concise';
import { getWriteNamespace } from '@effectstream/config';
import { AddressType } from '@effectstream/utils';

// The signing namespace must match the one your node is configured with,
// otherwise the batcher rejects the signature.
const namespace = getWriteNamespace(config.securityNamespace);

// Both values are strings: the timestamp is sent as a string, and the input is
// the JSON-encoded grammar tuple.
const timestamp = Date.now().toString();
const conciseInput = JSON.stringify(["my-action", "0x1", "0x2"]);

// The user signs a message, not a transaction
const signature = await walletClient.signMessage({
  message: createMessageForBatcher(
    namespace,
    timestamp,
    account.address,
    AddressType.EVM,
    conciseInput,
  ),
});

// Send the signed payload to the Batcher via HTTP
await fetch(`${ENV.BATCHER_URL}/send-input`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    data: {
      address: account.address,
      addressType: AddressType.EVM,
      input: conciseInput,
      signature,
      timestamp,
    },
    confirmationLevel: "wait-effectstream-processed",
  }),
});
```

The `data` object is the batcher's input schema; `confirmationLevel` is one of `"no-wait"`, `"wait-receipt"` (the default), or `"wait-effectstream-processed"`. An optional `timeoutMs` controls the receipt-confirmation timeout. See the [batcher documentation](./108-batcher/1200-overview.md) for the full API.

## Reading Data from the EffectStream (Reads)
While you can read data directly from the blockchain, it is often slow, inefficient, and doesn't provide the rich, aggregated state of your EffectStream application.

The recommended way for a frontend to read data is by querying the powerful **API** exposed by the EffectStream Node. This API provides access to both built-in system data and your own custom application state.

**[Learn more about the EffectStream API](./103-api.md)**
