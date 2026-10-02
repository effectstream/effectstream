---
sidebar_position: 1
slug: /
---

# EffectStream

## What is EffectStream

EffectStream is a Web3 Engine optimized for dApps, games, gamification and autonomous worlds that allows quickly building web3 apps.

- Connect multiple chains, leveraging their tech as tokens, and existing markets.
- Build on-chain dApps without blockchain specific knowledge.
- Secure: all interactions go into the chains and not your EffectStream Node.
- Iterate quickly as tools are developer centered.

<iframe src="https://drive.google.com/file/d/1Cb7XAVprCIwwhr0xC3xQeWHftfPCTVob/preview?vq=hd720" width="640" height="480" allow="autoplay"></iframe>

[Learn more about EffectStream](./1-what-is-effectstream.md)


## App Quick Start

> Linux and macOS are supported. Windows WSL is experimental.

> This is a preview of the EffectStream V2 documentation. We welcome any feedback you have on errors, missing information, or parts that aren't clear.

Install [Bun](https://bun.sh), [Foundry](https://www.getfoundry.sh/), and the
EVM/Midnight template's selected Compact compiler (`0.33.0-rc.2`) before
starting:

```sh
curl -L https://foundry.paradigm.xyz | bash && foundryup
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

First, clone the repository and use the `templates/evm-midnight-v2/` folder as a working template:

```sh
# Clone and move to evm-midnight-v2 template
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/evm-midnight-v2

# Install the checksummed Compact selection declared by this template
bun toolchain/compact.ts install

# Install packages
bun i

# Launch EffectStream Node (compiles contracts and starts the full local stack)
bun run dev
```

Now you should see the dApp running in your browser!
Continue at the [Quick Start Guide](../10-quickstart/10-quickstart.md).

## Main Components

- [Chain Sync](../100-components/101-sync-service.md)
- [State Machine](../100-components/102-state-machine.md)
- [API](../100-components/103-api.md)

[See All Components](../100-components//100-components.md)

## Guide for EffectStream Contributor

- [EffectStream Architecture](../1000-effectstream-engine/1000-effectstream-engine.md)
- [Contribution Guide](../1000-effectstream-engine/1100-contributions.md)
