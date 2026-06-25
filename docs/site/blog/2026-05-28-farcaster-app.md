---
slug: farcaster-app
title: "Inside farcaster-canvas: A Farcaster Mini App as an EffectStream Indexer"
authors: [effectstream]
tags: [farcaster, mini-apps, game-templates, social, cardano, evm]
---

<iframe width="100%" height="415" src="https://www.youtube.com/embed/NYjVmRQBbcU" title="Farcaster Canvas Mini App demo" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>

[Farcaster Canvas](https://github.com/effectstream/farcaster-app) is a collaborative pixel-painting game that ships as a [Farcaster Mini App](https://miniapps.farcaster.xyz). Two users on Warpcast can sit on the same canvas, pick colors from a palette, and watch each other's paints land in near real time. When a canvas runs out of slots, anyone can fork it to their own timeline as the next canvas to paint on.

The app is built on EffectStream, which is multi-chain by design: the game logic is chain-neutral, so while this build settles on an EVM chain inside Warpcast, the same state machine retargets to the Cardano ecosystem with a configuration change - the social surface (Farcaster) and the settlement chain are independent choices.

The interesting thing about this implementation isn't the canvas itself — it's that the entire game is wired through an Effectstream node sitting between a near-empty Solidity contract and a React UI rendered inside Warpcast's iframe. There's no game logic on chain. There's no game logic in the frontend. Everything that decides "is this paint valid, does this canvas get filled, who owns the fork" runs inside a state machine that consumes JSON inputs from a single L2 event.

This post walks through what each piece does, why the contract is one line of meaningful Solidity, and how the node turns chain events into the canvas grid the user sees.

<!-- truncate -->

## The five moving pieces

Concretely, the running system is:

1. **`CanvasGame`**, a Solidity contract at [packages/contracts-evm/src/contracts/CanvasGame.sol](https://github.com/effectstream/farcaster-app/tree/main/packages/contracts-evm/src/contracts/CanvasGame.sol). It extends `EffectstreamL2Contract` and adds *zero* custom logic — no canvas mapping, no paint counter, no ownership tracking. It's the base contract with a different name, deployed to Base in production and to a local Hardhat anvil in dev.
2. **The batcher** at [packages/batcher/batcher.dev.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/batcher/batcher.dev.ts), using `@effectstream/batcher-sdk`. It collects signed inputs from wallet-connected Mini App users and submits them on a 1-second cadence as a single bundled transaction.
3. **The effectstream node** in [packages/node/](https://github.com/effectstream/farcaster-app/tree/main/packages/node/) — the focus of this post.
4. **Postgres**, with a single migration at [packages/database/migrations/000-init.sql](https://github.com/effectstream/farcaster-app/tree/main/packages/database/migrations/000-init.sql) defining three tables: `canvases`, `paints`, `rewards`. The frontend only ever reads from these.
5. **A Vite + React Mini App** in [packages/frontend/](https://github.com/effectstream/farcaster-app/tree/main/packages/frontend/) that talks to the node's REST API and to the wallet provider Warpcast injects, but never directly to the chain or to Postgres.

Two environments share the same code:

| Env | EVM | Database | Entry point |
| --- | --- | --- | --- |
| `dev` | Hardhat anvil | PGLite (in-process) | [packages/node/main.dev.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/node/main.dev.ts) |
| `mainnet` | Base | Managed Postgres | [packages/node/main.mainnet.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/node/main.mainnet.ts) |

A top-level orchestrator (`start.dev.ts`, `start.mainnet.ts`) boots the right combination of services for each env. Locally that means PGLite + anvil + node + batcher + Vite in one process group; in production only the node, the batcher, and the static frontend server need to run — Postgres and the chain are managed elsewhere.

## One input path, two transports

The stack supports two ways to reach `CanvasGame.effectstreamSubmitGameInput(bytes)`:

- **Self-sequenced (direct).** The user signs and broadcasts a full transaction through the Mini App's injected EIP-1193 provider (Warpcast injects one inside the iframe). Calldata is `utf8ToHex(JSON.stringify(conciseData))` — one user action, one tx, one event. `userAddress` in the log is the painter (`msg.sender`). Use this when `preferBatchedMode` is false and the user has gas on Base.
- **Batched (default here).** The user signs only the game input (an off-chain message for the batcher), not a chain transaction. The batcher in [packages/batcher/batcher.dev.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/batcher/batcher.dev.ts) (1s window) or [packages/batcher/batcher.mainnet.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/batcher/batcher.mainnet.ts) (2s window) bundles signed inputs and submits one tx per window; the batcher's hot wallet pays gas. **This deployment sets `preferBatchedMode: true` in [packages/frontend/client/src/effectstream-config.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/frontend/client/src/effectstream-config.ts), so `useWallet.submit()` always takes the batcher path.**

On chain, batched calldata is not the same bytes as a direct submit: the batcher wraps inputs as `["&B", [ per-user envelopes … ]]`, where each envelope carries address, signature, timestamp, and the concise JSON string. The node's `PrimitiveTypeEVMEffectstreamL2` unwraps both shapes into the same grammar before the state machine runs.

Each contract call emits one `EffectstreamGameInteraction(userAddress, data, value)`. For a direct paint, `data` decodes to the grammar; for a batch, `data` is the `&B` wrapper and `userAddress` is the batcher — painter identity comes from the payload (`signerAddress` in the STM). Valid *game* inputs look like:

```
["fork", 0]               # mint a seed canvas
["fork", 12]              # fork canvas 12 to the signer's timeline
["paint", 12, "#ff924c"]  # paint a pixel on canvas 12
```

The contract has no idea what those strings mean. The indexer does: same transitions whether the input arrived self-sequenced or inside a batch.

## What the node actually contains

If you open `packages/node/` you'll find four files doing nearly all of the work. None of them is large.

### `grammar.ts` — the app's vocabulary

[packages/node/grammar.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/node/grammar.ts) defines the entire set of valid inputs this app understands. There are two:

```
fork(copyFromCanvasId: Integer >= 0)
paint(canvasId: Integer >= 1, color: /^#[0-9a-fA-F]{6}$/)
```

`copyFromCanvasId === 0` is the conventional "seed" sentinel: it tells the state machine to mint a brand-new canvas seeded with three random colors. Any value >= 1 is interpreted as an existing canvas id to clone paints from. The TypeBox schemas bound numbers and enforce the `#rrggbb` shape on colors, so by the time a parsed input reaches a state transition the values are already trusted.

The grammar is exported in two flavors: `effectstreamL2Grammar` is the subset the L2 sync-protocol primitive uses to parse incoming events, and `grammar` is the union that the runtime advertises to the rest of the system. Today they're the same — `effectstreamL2Grammar` exists as a separate symbol so that adding non-L2 inputs later (a webhook from Warpcast, an admin command, etc.) doesn't require restructuring.

### `config.dev.ts` and `config.mainnet.ts` — wiring the chain to the state machine

This is the part that the payment-app post glosses over and that's worth being explicit about, because it's where the L2 contract gets turned into a typed event stream that the STM can consume.

[packages/node/config.dev.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/node/config.dev.ts) builds an `EffectstreamConfig` with four sections:

```ts
new ConfigBuilder()
  .setNamespace(b => b.setSecurityNamespace("farcaster-canvas"))
  .buildNetworks(b => b
    .addNetwork({ name: "ntp", type: NTP, blockTimeMS: 1000, startTime })
    .addViemNetwork({ ...hardhat, name: "evmMain" }))
  .buildDeployments(b => b)
  .buildSyncProtocols(b => b
    .addMain(  networks => networks.ntp,      ()  => ({ name: "mainNtp",  type: NTP_MAIN,        ... }))
    .addParallel(networks => networks.evmMain, n  => ({ name: "canvas-l2", type: EVM_RPC_PARALLEL, chainUri: n.rpcUrls...., ... })))
  .buildPrimitives(b => b
    .addPrimitive(
      syncProtocols => syncProtocols["canvas-l2"],
      () => ({
        name: "CanvasL2",
        type: PrimitiveTypeEVMEffectstreamL2,
        contractAddress: contractAddressesEvmMain().chain31337["CanvasGameModule#CanvasGame"],
        effectstreamL2Grammar,
      })))
  .build();
```

A few things matter here:

1. **The NTP main protocol** drives the state machine's logical clock — it's what gives transitions their `blockTimestamp` and PRNG seed, independent of any single chain's block production. The L2 contract attaches to it as a *parallel* protocol, which means events get folded into the main clock's stream rather than driving it.
2. **`launchStartTime`** is recovered from the DB if a previous run wrote one. Without this, restarting the node would reset the NTP clock and replay every event with new timestamps. The lookup is a small `SELECT … FROM effectstream.sync_protocol_pagination` at module load time.
3. **`PrimitiveTypeEVMEffectstreamL2`** is the magic glue. It tells the runtime: "for this sync protocol, watch this contract address for `EffectstreamGameInteraction` events, and parse the `data` field as JSON against this grammar." The output of that parsing is what shows up in the state transition's `data.parsedInput`. No event ABI decoding, no JSON parsing, no field validation in user code — the primitive handles it.
4. **`contractAddressesEvmMain()`** comes from [packages/contracts-evm/mod.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/contracts-evm/mod.ts), which is auto-generated during `bun run build:evm`. It reads `ignition/deployments/chain-<chainId>/deployed_addresses.json` so the config picks up whatever address Ignition assigned on the last deploy. In production, `config.mainnet.ts` instead reads `CANVAS_GAME_ADDRESS` from the environment and fails fast if it's missing.

The mainnet config in [packages/node/config.mainnet.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/node/config.mainnet.ts) is the same shape with `base` instead of `hardhat`, longer polling intervals, `confirmationDepth: 3`, and the env-var fail-fast block at the top.

### `state-machine.ts` — the entire game logic

[packages/node/state-machine.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/node/state-machine.ts) is the only place where game rules live. There are two transitions; both write to Postgres via [pgtyped](https://pgtyped.dev) prepared queries from [packages/database/sql/queries.sql](https://github.com/effectstream/farcaster-app/tree/main/packages/database/sql/queries.sql).

**`fork`** has two modes. If `copyFromCanvasId` is `0`, the transition pulls three colors out of `data.randomGenerator` (the deterministic PRNG seeded by the NTP block) and inserts both a new canvas row and three paint rows in one transition. If `copyFromCanvasId` is non-zero, it loads the parent canvas, copies all its paints into a new canvas with `parent_id` set, and emits `CanvasCreated` so subscribed clients refresh:

```ts
stm.addStateTransition("fork", function* (data) {
  const { copyFromCanvasId } = data.parsedInput;
  const owner = data.signerAddress ?? "0x0";
  if (copyFromCanvasId === 0) { /* seed: insert canvas + 3 random paints */ }
  else { /* clone: insert canvas with parent_id, copy all paint rows */ }
  data.emit(AppEvents.CanvasCreated, { canvasId, owner, parentId });
});
```

**`paint`** does the predictable thing: look up the target canvas, refuse if it's already filled, insert a paint row at the next index, increment the canvas's `paint_count`, and emit `PaintApplied` (and `CanvasFilled` if the row that just landed brought the count to `max_paints`).

The interesting property of both transitions is what they *don't* contain. There's no signature check — the runtime has already verified the input came from the signed address it's attached to. There's no balance check — fees aren't an onchain concept in this version (see "Why the contract is empty," below). There's no replay protection — the runtime guarantees each input is processed exactly once. The transition is purely a deterministic function of `(parsedInput, current DB state, randomGenerator)`, and that's the entire contract between the runtime and the app.

### `api.ts` — what the Mini App talks to

[packages/node/api.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/node/api.ts) is a Fastify router with four endpoints, all of them read-only:

- `GET /api/health` — liveness probe used by the orchestrator and any uptime checks.
- `GET /api/canvases?limit=N` — open canvases (`filled = FALSE`), most recent first. The home page renders this as a gallery.
- `GET /api/canvases?owner=0x…` — the user's own canvases for the "my forks" view.
- `GET /api/canvas/:id` — a canvas plus its ordered paints. The canvas-detail page renders the 5×5 grid from this response.
- `GET /api/rewards/:addr` — the off-chain reward ledger entry for an address. Returns `{ owner, balanceWei: "0" }` by default; populated only once the rewards extension is enabled.

Notably absent: any write endpoint. The frontend submits inputs to the batcher or to the chain — never to the node. The node is a read-side service for everything that isn't an event log.

## Custom events: how the UI feels live

When the state machine emits `data.emit(AppEvents.PaintApplied, …)`, the runtime publishes it to MQTT *after* the database write has committed for that transition. The frontend's `useCanvas` hook in [packages/frontend/client/src/hooks/useCanvas.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/frontend/client/src/hooks/useCanvas.ts) holds an `EventManager.Instance.subscribe(…)` to the canvas it's currently viewing and refetches `/api/canvas/:id` on every matching event:

```ts
EventManager.Instance.subscribe(
  { topic: AppEvents.PaintApplied,
    filter: { canvasId: id, painter: undefined, blockHeight: undefined } },
  () => refresh(),
);
```

The two guarantees that matter for UX:

- **Post-commit delivery.** Subscribers don't see an event until the DB row that backs it is queryable. The next `GET /api/canvas/:id` after the event will see the new paint.
- **Drop on rollback.** If the state transition is rolled back (replay during a chain reorg, for example), the event is never published. The frontend won't optimistically render a paint that doesn't exist.

That's enough to make the canvas feel real-time without any websocket-to-the-chain plumbing on the frontend.

## Mini App integration: making it feel native to Warpcast

The Farcaster-specific surface area is small and lives in [packages/frontend/client/src/miniapp.ts](https://github.com/effectstream/farcaster-app/tree/main/packages/frontend/client/src/miniapp.ts). Three calls do all of the work:

- `await sdk.actions.ready()`, called once from `App.tsx` on first mount. Without this the Warpcast splash screen never dismisses and the user sees an infinite loader. This is the single most common Mini App bug; we keep it on a `useEffect` at the top of the router so it always fires.
- `sdk.wallet.ethProvider`, which exposes a [EIP-1193 provider](https://eips.ethereum.org/EIPS/eip-1193) backed by whatever wallet the user has set up in Warpcast. We pass it into `@effectstream/wallets`' `walletLogin(config, WalletMode.EvmInjected)`, which from that point on looks like any other injected-wallet flow. The user never has to "connect" anything explicitly.
- ``sdk.actions.composeCast({ text, embeds: [`${appUrl}/canvas/${id}`] })``, called from the Share button after a fork. The cast renders our `<meta name="fc:miniapp">` embed inside Warpcast, so anyone scrolling past sees the canvas as a launch tile rather than a generic link card.

The `fc:miniapp` embed metadata in [packages/frontend/client/index.html](https://github.com/effectstream/farcaster-app/tree/main/packages/frontend/client/index.html) is what makes the cast renderable as a Mini App tile in the first place. The manifest itself is published two ways: a static fallback at [packages/frontend/client/public/.well-known/farcaster.json](https://github.com/effectstream/farcaster-app/tree/main/packages/frontend/client/public/.well-known/farcaster.json) and, in production, a signed hosted manifest URL registered with Warpcast (the recommended path so the `accountAssociation` block can be re-signed without redeploys).

## Why the contract is empty

`CanvasGame.sol` is literally:

```solidity
contract CanvasGame is EffectstreamL2Contract {
    constructor(address _owner, uint256 _fee)
      EffectstreamL2Contract(_owner, _fee) {}
}
```

There's no `paint` function, no canvas mapping, no fee split, no withdrawal logic. The original Paima-template version of this game *did* implement fee economics onchain (~25,610 gwei per paint, 90% to forkers, 10% to the contract owner) and that's still on the roadmap as a separate "treasury" contract that mints rewards based on the indexed event stream. But the canvas game itself doesn't need any of that to be a complete app.

Keeping the contract empty means:

- **No contract upgrades for new game rules.** Want a "wipe" action that lets the canvas owner clear paints? Add it to `effectstreamL2Grammar`, add a transition in `state-machine.ts`, ship a frontend update. The contract is untouched.
- **No game-state migrations.** Postgres is a projection of the event log. If you blew it away and synced from block 0 again, you'd get the same canvases and paints back. New columns are migrations on the indexer schema, not on chain.
- **No security review on every release.** Solidity changes are rare; TypeScript changes are continuous. Separating them this way keeps the audit surface tiny.

The grammar is intentionally narrow — two inputs, one of which has a two-mode branch — and the schema is intentionally rebuildable. Both are characteristic of Effectstream apps that age well.

## End-to-end: one paint

A user opens the Mini App from a cast, taps a swatch, hits Paint:

1. The Mini App calls `useWallet.submit(["paint", 12, "#ff924c"])`. `@effectstream/wallets` signs the input with the wallet that Warpcast injected, then posts it to the local batcher's HTTP submit endpoint.
2. About a second later, the batcher bundles this input with any others it accumulated and submits a single transaction to `CanvasGame.effectstreamSubmitGameInput(bytes)` on Base. The contract emits `EffectstreamGameInteraction(painter, data, value)`.
3. The node, polling Base every 2 seconds with `confirmationDepth: 3`, picks up the log entry once it's six seconds deep. The `PrimitiveTypeEVMEffectstreamL2` primitive parses `data` as JSON, validates it against `effectstreamL2Grammar`, and hands the typed `{canvasId, color}` to the state machine.
4. The `paint` transition runs: insert a paint row, increment `canvases.paint_count`, emit `PaintApplied`.
5. After the transaction commits, MQTT publishes the event. The `useCanvas` hook on every browser currently viewing canvas 12 re-fetches `/api/canvas/12`. The new pixel appears in the grid.

Same loop, fork variant: ` ["fork", 12]` → batcher → contract → primitive parse → STM clones all paints into a new canvas with `parent_id = 12` → `CanvasCreated` fires → the user's `composeCast` follow-up share renders the new canvas as a launch embed in their feed.

That's the whole app. One smart contract that does the minimum work needed to produce an ordered event log, one state machine of about 70 lines, one indexer config that wires them together, and a Mini App in front. The interesting code, where almost all of your effort goes when you build something like this, is the seven files in `packages/node/`.
