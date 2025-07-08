# Deploy

Deploy contracts described in `deploy.ts`

`deno task deploy`

# Create and deploy new Contracts
To add your contracts you will need 3 steps:

## 1. Add new Contract

Add your Solidity Contracts in `/src/contracts/my-contract.ts`  
and run `deno task build:contracts` 

Your contract is compiled and ready to be used.

## 2. Create Ignition Module

First create a ignition module at:
`./ignition/module/my-contract-module.ts`

With a Hardhat-Ignition Module, for example:
```ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MyModuleName", (m) => {
  const contract = m.contract("MyContractName", []);
  return { contract };
});
```

Then in `./deploy.ts` import your created module and call it with `deploy(...)` as follows:
```ts
import myModuleName from './ignition/module/my-contract-module.ts'
...
const myModuleDeployment = await network.ignition.deploy(myModuleName);
console.log(`Contract deployed`, (myModuleDeployment.contract as any).address);
```

## 3. Redeploy Contracts
Run `deno task deploy`