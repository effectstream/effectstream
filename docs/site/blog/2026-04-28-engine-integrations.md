---
slug: engine-integrations
title: "Engine Integrations: From Local Development to Mobile"
authors: [effectstream]
tags: [game-engines, developer-tools, mobile, farcaster, evm, cardano]
---

EffectStream is designed to integrate with any game engine or platform. This article covers four distinct integrations, each showing a different technology combination: modern multi-chain local development tooling, a traditional game engine, social platform frames, and a mobile app.

<!-- truncate -->

## EVM-Cardano local development environment

One of the biggest friction points for multi-chain developers is setting up a local dev environment. Syncing a Cardano indexer like Carp can take days on testnet and even longer on mainnet, which makes rapid iteration pretty much impossible. We built a template that replaces this entire workflow with an instant localhost setup.

The EVM-Cardano template, [available in the monorepo](https://github.com/effectstream/effectstream/tree/v-next/templates/evm-cardano), combines:

- [**Hardhat v3**](https://hardhat.org/) for EVM smart contract development and a local EVM chain
- [**YACI DevKit**](https://github.com/bloxbean/yaci-devkit) for a local Cardano devnet
- [**Dolos**](https://github.com/txpipe/dolos) with UTxORPC for Cardano indexing via gRPC

The result: spin up a full multi-chain dev environment (EVM + Cardano) in minutes, not days.

![Local development orchestrator showing Hardhat, YACI DevKit, and Dolos running together](/img/blog/evm-cardano-1.png)

The template includes an explorer UI for interacting with the local environment. You can mint NFTs on EVM, send ADA on Cardano, and see cross-chain events in a unified feed:

![EVM-Cardano Explorer: mint NFTs, send ADA, cross-chain event feed](/img/blog/evm-cardano-2.png)

This is a complete local dev environment for building cross-chain applications. Write smart contracts on both chains, test interactions between them, iterate fast. No testnet, no waiting for chain sync.

### Controlling the stack: the orchestrator

A multi-chain dev environment is not one process — it's six or seven, with dependencies between them: PGLite has to come up before the sync node, Dolos needs cardano-node, the contracts have to be deployed before the frontend can talk to them. We built `bunx orchestrator` as the master controller for this. It launches every process in dependency order, restarts individual ones, follows their logs, and silences the noisy ones, all from a single CLI.

```text
$ bunx orchestrator --help

orchestrator — Bun-based process orchestration CLI

Usage:
  orchestrator <command> [options]

Commands:
  start   [config|name...]    Start all processes, or specific ones by name
  status                      Show status of running processes
  restart <name>              Restart a specific process by name
  stop    [name]              Stop a specific process (or all if no name given)
  list    [config]            List processes in config without starting them
  silence [name...]           Suppress terminal output for processes
  unsilence <name...>         Resume terminal output for processes
  logs    [name...]           Follow background daemon log files (like tail -f)

Global options:
  -c, --config  <path>        Config file (default: auto-detected)
  -h, --help                  Print help

Options for `start`:
  -b, --background            Run as a detached background daemon
  -p, --port    <n>           Orchestrator API port (default: 4747)
  -o, --only    <p1,p2,...>   Run only these processes (+ dependencies)
  -e, --except  <p1,p2,...>   Skip these processes
  -s, --serial                Launch one at a time instead of in parallel waves
  --no-deps                   Launch only named processes, skip dependency resolution
  --log-dir     <path>        Log directory when using -b (default: .orchestrator-logs)
  --no-api                    Disable the HTTP API server
  --silence     <p1,p2,...>   Suppress terminal output for these processes

Options for `status`:
  -f, --follow                Continuously refresh the status table (1s interval)
```

In practice, the developer workflow is just:

```bash
bunx orchestrator start              # bring up the whole stack
bunx orchestrator status             # see what's running and what failed
bunx orchestrator restart midnight-node   # bounce a single process
bunx orchestrator logs sync-node     # tail the logs of one process
bunx orchestrator stop               # tear everything down
```

The `--only` and `--except` flags let you run partial stacks — useful when you're iterating on the sync node and don't need the frontend rebuilding, or when you're testing the batcher in isolation. `--background` runs the whole orchestrator as a detached daemon with logs going to files, which is how the e2e test suite runs the same stack on CI.

The point is that the same `bun run dev` command that boots the EVM-Cardano template also boots the cardano-delegation template, the zk-cardano template, and every other template in the monorepo — they all share the orchestrator and just declare a different process graph in their config.

<iframe src="https://drive.google.com/file/d/1dmXshwpqeXi9sez5ekfqfrlXBdjVVABW/preview" width="100%" height="480" allow="autoplay"></iframe>

## Game Maker integration

Not every on-chain game needs to be built from scratch. We created a template that integrates EffectStream with [Game Maker](https://gamemaker.io/), one of the most popular 2D game engines. Game designers use familiar visual tools for gameplay while EffectStream handles the blockchain backend: on-chain state, wallet interactions, and multi-chain settlement.

The point here is that EffectStream isn't limited to web-based games. Any engine that can make HTTP calls can talk to an EffectStream backend, and Game Maker's event-driven architecture maps naturally to EffectStream's state machine model.

<iframe src="https://drive.google.com/file/d/1NhXGPajMx79w-odUkY8vzbhfGt2BZPg9/preview" width="100%" height="480" allow="autoplay"></iframe>

## Farcaster Frame integration

[Farcaster Frames](https://docs.farcaster.xyz/developers/frames/) are mini-applications that run directly inside Farcaster's social feed. We built a template that turns an EffectStream game into a Frame, playable without leaving the feed. No app install required.

This is a completely different distribution model. Instead of "download our app and connect your wallet," it's "play this game right here in your feed." Every share is a playable instance. The social feed becomes the game platform.

- [Template code](https://github.com/PaimaStudios/paima-game-templates/tree/main/farcaster-frame)

The integration handles the constraints of the Frame environment (limited UI real estate, server-side rendering requirements, Farcaster's auth model) while keeping full EffectStream backend functionality.

<iframe src="https://drive.google.com/file/d/1XFpNegn8fcYIKAgp999I8i4FwGkB7JdJ/preview" width="100%" height="480" allow="autoplay"></iframe>

## Mobile with GPS

The most ambitious integration: a game template combining GPS location data for iOS and Android. Location-based gameplay where the assets you find, collect, and trade are real on-chain tokens.

The mobile app communicates with an EffectStream backend that manages on-chain state, while the mobile layer renders game objects at GPS-determined positions. It shows that EffectStream works well beyond the browser.

- [Template code (`paima-game-templates` repository)](https://github.com/PaimaStudios/paima-game-templates)

<iframe src="https://drive.google.com/file/d/16IH6do2cyxigKaxL996TtGqMFwHZR3Xs/preview" width="100%" height="480" allow="autoplay"></iframe>

## The common thread

| Integration | Platform | What's new |
|------------|----------|-----------|
| EVM-Cardano | Local dev | Instant multi-chain dev environment, replacing days-long Carp sync |
| Game Maker | Desktop engine | Traditional game engine + blockchain backend |
| Farcaster Frame | Social feed | Play on-chain games without leaving the social platform |
| Mobile GPS | iOS/Android | Location-based on-chain gameplay |

All templates are open-source in the [game templates repository](https://github.com/PaimaStudios/paima-game-templates). The EVM-Cardano template with its Dolos-based local development stack is probably the most impactful: it removes the biggest barrier to Cardano development by getting rid of the sync time that's historically made local testing impractical.

- [EVM-Cardano template code (Dolos + YACI DevKit)](https://github.com/effectstream/effectstream/tree/v-next/templates/evm-cardano)
- [Cardano Primitives documentation](/docs/home/chains/cardano#primitives)
