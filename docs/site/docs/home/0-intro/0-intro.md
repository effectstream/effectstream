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

First, clone the repository and use the `templates/evm-midnight/` folder as a working template:

```sh
# Clone and move to evm-midnight template
git clone git@github.com:PaimaStudios/paima-engine.git --branch v-next
cd paima-engine/templates/evm-midnight

# Check for external dependencies
../check.sh

# Install packages
deno install --allow-scripts && ./patch.sh

# Compile contracts
deno task build:evm
deno task build:midnight

# Launch EffectStream Node
deno task dev
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
