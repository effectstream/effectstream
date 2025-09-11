# Build Contracts

`deno task -f @example-evm-midnight/evm-contracts build`

# Deploy Contracts

`deno task -f @my-project deploy:standalone`

# Setup

## Setup your EVM Chains

`hardhat.config.ts` has a section with networks, you can edit to match your requirements.

```js
  networks: {
    myNetworkName: {
      type: "edr",
      chainType: "l1",
      chainId: 31337,
      mining: {
        auto: true,
        interval: 250,
      },
      allowBlocksWithSameTimestamp: true,
    },
    myNetworkNameHttp: {
      type: "http",
      chainType: "l1",
      url: "http://0.0.0.0:8547",
    },
  },

```

Important:

- You must add two entries for each network. myNetworkName and myNetworkNameHttp.
- The first network will automatically start at port 8545, 8546 for the second and so forward.

## Create and deploy new Contracts

To add your contracts you will need 3 steps:

### 1. Add new Contract

Add your Solidity Contracts in `/src/contracts/my-contract.ts`  
and run `deno task -f @example-evm-midnight/evm-contracts build`

Your contract is compiled and ready to be used.

### 2. Create Ignition Module

First create a ignition module at:
`./ignition/module/my-contract-module.ts`

With a Hardhat-Ignition Module, for example:

```ts
export { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("MyModuleName", (m) => {
  const contract = m.contract("MyContractName", []);
  return { contract };
});
```

Then in `./deploy.ts` import your created module.

```ts
const myDeployments: Deployment[] = [
  ...,
  {
    module: MyModuleName,
    network: "evmMainHttp",
  }
];
```

### 3. Redeploy Contracts

Run `deno task -f @my-project deploy:standalone`
