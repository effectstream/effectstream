# EVM Contracts

## Build & Deploy

```bash
bun run --filter @evm-midnight/contracts-evm build:mod
```

## Setup

### EVM Chain Configuration

`hardhat.config.ts` uses default networks (evmMain, evmParallel). Edit to match your requirements.

### Adding New Contracts

1. Add Solidity contracts in `src/contracts/`
2. Create an Ignition module in `ignition/modules/`
3. Import the module in `deploy.ts`
4. Run `bun run --filter @evm-midnight/contracts-evm build:mod`
