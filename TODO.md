# TODO

---
## Chain Support

### Chain: EVM
- [ ] **Generic EVM Primitive** (A basic implementation is partially written, but it not been tested or connected to the codebase) packages/node-sdk/sm/primitives/src/evm-generic/evm-generic-primitive.ts
- [ ] **Generic EVM Batcher Adapter**. There is a ERC1155 Adapter in the templates.
- [ ] **Merge Hardhat Config into Config Builder**. We currently have configs in Hardhat for the block time and other options, this could be read from the config builder to not require to duplicate the configs in both places.

### Chain: Avail
- [ ] **Avail Generic Batcher Adapter**. There are some scripts in the E2E that could be used as base for the implementation.

### Chain: Cardano
- [ ] **Update Dolos** Support UTXORPC to listen to events (and be able to notify if no events for specific block) Required to sync the chain events.
- [ ] **Dolos (1.0.0-rc) Crash** Simple transactions makes Dolos crash - reported to txpipe.
- [ ] **Yaci Devkit issue with macos** (Manual patch for apple silicon)
- [ ] **Yaci Devkit issue with linux** (Not working, crashes with error: Text file busy (os error 26))
- [ ] **Review on TX3 Integration** How we could integrate tx3.
- [ ] **Cardano Sync Protocol** Sync protocol for Cardano though Dolos.
- [ ] **Cardano Generic Primitive** Capture generic events.
- [ ] **Cardano Generic Batcher Adapter** Send generic events to the batcher.
- [ ] **Carp Support** (For primitives?)

### Chain: Bitcoin
- [ ] **Bitcoin Sync Multiple Wallets** Dynamically allow to add/remove wallets address, start and end block-heights to sync. Reject if start is in past.
- [ ] **Bitcoin core random rpc crash** The node randomly crashes, with no error, after some time. The RPC stops responding.

### Chain: Midnight
- [ ] **Update Midnight Node** Testnet version
- [ ] **Update Midnight Indexer** Testnet version
- [ ] **Update Midnight Proof Server** Testnet version
- [ ] **Auto-install Compact Compiler**
- [ ] **Move convert-js.ts into shared package** so all midnight contracts use the same code.
- [ ] **Random Midnight Indexer Crash** Block height error after some random blocks.
- [ ] **Random Midnight Proofs Stop Working** Invalid length error after some random transactions.
- [ ] **Dust & Undeployed Network** Figure out how get Dust on undeployed network (Non-transferable in ledger)

---
## Core Features

### Sync Process Orchestration
- [ ] **Restart Sync** Test that process can continue if interrupted.
- [ ] **TUI Restart Sync** Restarting Sync process not working (Pressing R)
- [ ] **Dev Sync Crash Recovery** If the Sync process crashes in dev mode, we should not kill all the processes, and allow the developer to fix the issue and continue the execution. 

### Main Loop
- [ ] **Scheduled blocks sort** Should be sorted by id before running.
- [ ] **STF Crash handling** Main Loop should crash/stop on logic exceptions, but DB errors should roll back (?)
- [ ] **STF coroutine pausable processes** Allow to run long processes on STF, multi-block processes, that pause/resume. (Proposal)

### Engine
- [ ] **RPC EIP1193** Implement missing RPC EIP1193 methods.
- [ ] **Fix NTP Client** Library is Deno incompatible, reported by project moves slow.
- [ ] **WASM Primitives**  Allow Primitives to be programmed in any language (proposal)
- [ ] **Pub/Sub @ STF Support** We need to allow to create custom pub/sub types and use these in the state machine, and expose them to the frontend types.
- [ ] **Sync Protocol Debugging** Add table with blocks, hashes, timestamps and other information that would allow to check the sync process, and if it's deterministic as expected.
- [ ] **Verification Depth** Make sure that verification depth is working on all sync protocols.
- [ ] **Versioning** How to handle code or package versioning to get reproducible builds?

### Typesafety
- [ ] **Types not working** Some types broke on refactoring update for config.ts
- [ ] **Runtime checks** Some runtime checks should be implemented to ensure consistency.
- [ ] **JSR Package cleanup** when "import with { type: text }" is available

### Database
- [ ] **Database Migrations** This is working, but might need improvements on definition, it might be confusing.
- [ ] **Simplify DB Package** DB package is currently complex, as it requires to emulate the migrations + dynamic tables to get to the same state to run pgtyped.
- [ ] **Dynamic Tables over time** How to handle the creation of dynamic tables if new primitives are added; now we just create these table on the first run, but this might not always be the case.

### Cryptography Functionality
- [ ] **Unify Crypto Functionality** Some crypto functionality is currently spread across multiple packages, we should unify it to a single package (@package/crypto)
- [ ] **Signature Verification** Signature verification in many places is not delegated to the specific verifier as we assume it's a EVM signature. We added the wallet type to all addresses so we can determine the correct verifier to use.

---
## Wallets

### Wallet Package
- [ ] **sendTransaction grammar** sendTransaction() inputs should match Grammar for type safety & dev support.
- [ ] **Dynamic Imports** Dynamic loading of wallet dependencies, most where changed to static loading.
- [ ] **Clean up "Deno" usage** Remove Deno usage from frontend code (loaded through shared packages)
- [ ] **Custom Batchers** Clear support for custom/alternative batchers
- [ ] **Polkadot/Algorand/Other Wallets** No polkadot, algorand and other wallets where disabled. 
- [ ] **Local Wallet** Implement local wallet support
- [ ] **Replace ethers with viem** Replace ethers with viem
- [ ] **Namespace/App Name** Add support for namespace/app name in signatures
- [ ] **NPM Type Safe** Add support for js/ts npm type safe dependencies
- [ ] **Deno Vite** Better support for Deno Vite
- [ ] **E2E Wallet Example** Update E2E wallet example with all wallets supported.

---
## Explorer

- [ ] **UI Responsive** Explorer should be responsive
- [ ] **Pub/Sub Events** Support for events
- [ ] **UI Clean up** Empty tables should not use so much space, and other minor UI improvements.

---
## Batcher

- [ ] **x402** Implement x402 (proposal)

---
## Templates

### Migrations:
- [ ] **Migrate Farcaster Frame**
- [ ] **Migrate Gamemaker**
- [ ] **Migrate Generic (unity)**
- [ ] **Migrate Hex Battle**
- [ ] **Migrate Mina** (?) Probably not needed.
- [ ] **Migrate NFT LvLUP**
- [ ] **Migrate Open World**
- [ ] **Migrate Paima Dice**
- [ ] **Migrate Rock Paper Scissors**
- [ ] **Migrate Trading Cards**
- [ ] **Migrate Web 2.5**

### Template Issues
- [ ] **Midnight/EVM Localwallet stopped working** In EVM-Midnight template, the local wallet stopped working "Details: Unknown account 0xF83C3d894bD0c250a466bE599d46104fe11919AB"
- [ ] **Package @wallet for Lace Wallet** Midnight templates should use @wallet package for lace.

### Missing Examples
- [ ] **Address Delegation Example** Add Example Template for Address Delegation.

---
## Projects

### Airdrop
- [ ] **Airdrop Project Proposal** Write proposal for airdrop project.

### [Cardano NFTS](https://milestones.projectcatalyst.io/projects/1000009)
- [ ] **M4** Write the full dApp to easily project NFTs and manage which NFTs you have projected 
- [ ] **M5** Leverage work done in the “Powering onchain game functionality using Cardano stakepools” Catalyst proposal to connect the Carp task to Paima (Done/no-report)
- [ ] **MF** Project Close Report: pdf/video (?)

### [Core integrations](https://milestones.projectcatalyst.io/projects/1000055)
- [ ] **M2** An open-source game template built with Paima Engine that leverages Shinkai Visor
- [ ] **M3** Implement ability for wallets to delegate non-financial txs to be creatable by a local key-pair for their device (Done/no-report)
- [ ] **M4** Implement ability for wallets to delegate non-financial txs to be created by a key-pair generated from social login credentials
- [ ] **M5** Implement ability for wallets to delegate non-financial txs to be created by a key-pair generated from user biometric data
- [ ] **MF** Closeout report and closout video, Google chrome extension, Game Templates for Shinkai Visor, Code for the creation of private key pairs in the browser, Biometrics login.

### [Enable apps in Cardano ecosystem](https://milestones.projectcatalyst.io/projects/1000075)
- [ ] **M3** Cardano <> Mina Template (Done/no-report)
- [ ] **M4** ZK Proofs (Done/no-report)
- [ ] **M5** Template Implementation (Done/no-report)
- [ ] **MF** pdf report, video report, Public release of the Template

### [Enable apps that require large amounts of data](https://milestones.projectcatalyst.io/projects/1000076)
- [ ] **M2** Avail wallet support (Done/no-report)
- [ ] **M3** Layer Selection Flexibility for dApp Developers (Done/no-report)	
- [ ] **M4** Documentation
- [ ] **MF** Avail Template - combines Cardano and Avail state (Done/no-report)

### [Enable use-cases that require frequent message signing](https://milestones.projectcatalyst.io/projects/1000078)
- [ ] **M4** Game - implementation (Done/no-report)
- [ ] **MF** Report pdf, video, game implementation, wallet implementation.

### [Extend NFT sale & drop tools to support](https://milestones.projectcatalyst.io/projects/1000085)
- [ ] **M1** Develop the core smart contract for the pre-order NFT with clear steps on how to deploy it and a simple UI (Done/no-report)
- [ ] **M2** Paima app that interacts with the contract integrating core stateful functionality like creating and ending campaigns
- [ ] **M3** Implement a fuller UI/UX for an MVP (Done/no-report)
- [ ] **M4** wrapped smart contract support. verify you own an NFT.
- [ ] **M5** Integration with an existing marketplace (Done/no-report)
- [ ] **MF** Video, PDF Report, simple UI, ..., Open source code for all components

### [Game Engine & Novel integration](https://milestones.projectcatalyst.io/projects/1000145)
- [ ] **M2** A game template (Not Gamemaker) (Done/no-report)
- [ ] **M3** Game Template #2 (Done/no-report)
- [ ] **M4** Game Template #3 (Done/no-report)
- [ ] **M5** Game Template #4 with GPS and Augmented Reality for iOS or Android
- [ ] **MF** Video, PDF Report, 5 Game Templates 

### [Powering onchain game + Cardano stakepools](https://milestones.projectcatalyst.io/projects/1000153)
- [ ] **M2** Connecting Carp stake delegation task (Done/no-report)
- [ ] **M3** Allow games to easily react to delegation updates
- [ ] **M4** Paima Batchers pools checks
- [ ] **M5** Game Integration
- [ ] **MF** PDF + Video Report

### [Provide multiple templates on how to write apps](https://milestones.projectcatalyst.io/projects/1000155)
- [ ] **M1** Game Template #1 (Done/no-report)
- [ ] **M2** Game Template #2 (Done/no-report)
- [ ] **M3** Game Template #3 (Done/no-report)
- [ ] **M4** Game Template #4 (Done/no-report)
- [ ] **M5** Game Template #5 (Done/no-report)	
- [ ] **MF** PDF + Video Report + 5 game templates shared

### [Open standard for cross-game achievement system](https://milestones.projectcatalyst.io/projects/1000138)
- [ ] **M2** Proof of Concept (Done/no-report)
- [ ] **M5** Full release of the achievement system (integrate 3+ games and publicly available) (Done/no-report)
- [ ] **MF** Reports + Spec + Code (Done/no-report)

---
## Infrastructure

### Remove Patch.sh
- [ ] **Hardhat + Deno** Hardhat needs to be compatible with deno. There is an open issue in Hardhat, but it might not be fixed in the near future.
- [ ] **cjs Packages** Frontend sub-dependency: node_modules/fetch-blob/from.js and node_modules/fetch-blob/streams.cjs have issues with deno's module system. 

### Remove Check.sh
- [ ] **Auto Install Dependencies** Dependencies should be auto installed if required: deno, node, compact, forge, tmux, dkill, curl, ss/lsof ...

### Orchestrator Crash Management
- [ ] **Crash Management** If a process crashes, the Orchestrator does not terminate all the processes. It looks like we are not correctly keeping track of sub-processes created by some commands (e.g., deno task X may spawn a subprocess - but we keep track of the main process)

### DB Snapshots
- [ ] **DB Snapshots** DB Snapshots should be taken automatically.
- [ ] **DB Snapshot Request** Manually request a DB Snapshot (& possible shutdown)
- [ ] **DB Snapshot Restore** DB Snapshots can be used to restore the state. 

### Orchestrator Logs 
- [ ] **Log Files** System logs are stored relative to the @package/node that launches the orchestrator. System logs should be generated by the otel.

### OS Support
- [ ] **Midnight Dockerfiles not working on macos (Apple Silicon)** due tu zkir (Compiling 7 circuits: Exception: zkir returned a non-zero exit status -4)

### Code & Dependencies
- [ ] **ENV Variables** Connect ENV variables or configuration of urls/ports across code & scrips (replacing hardcoded values)
- [ ] **Minimal Deno Version** Minimal version of deno 2.5.4 is required [This check is required for remoteAddr].
- [ ] **Dependency Updates** Check if dependencies can be updated. 
- [ ] **Default Task Scripts Names** Allow to override Orchestrator default expected task scripts names
- [ ] **Multiple Packages** Issue with multiple packages with the same name get imported multiple times (e.g., @polkadot at startup)
- [ ] **Hardhat 3 Update** Update HARDHAT to latest version 3.x.x

---
## Project Generator / Scaffolding

### @scaffolding package 
- [ ] **General Infrastructure** Generate root files + packages/{client,shared}
- [ ] **Frontend Options** Generate either Deno Vite or Standalone NPM esbuild & Integration with Wallets
- [ ] **EVM Specific Code** Generate packages/shared/chain/evm specific code & support for contracts.
- [ ] **Cardano Specific Code** Generate packages/shared/chain/cardano specific code
- [ ] **Bitcoin Specific Code** Generate package/shared/chain/bitcoin specific code
- [ ] **Avail Specific Code** Generate package/shared/chain/avail specific code
- [ ] **Midnight Specific Code** Generate package/shared/chain/midnight specific code & support for contracts.
- [ ] **Batcher Code** Generate batcher code for selected chains with generic adapters.
- [ ] **API Generation** Generate API endpoints based on requests.
- [ ] **State Machine Generation** Generate a STF per grammar prefix rule.
- [ ] **Test Generated Code** Generated code should be tested with different configurations..

---
## CICD 

### Infra
- [ ] **Docs Deployment** Docs should be deployed on updates
- [ ] **Landing Page Deployment** Landing page should be deployed on updates (Should landing be in same repo?)

### Tests
- [ ] **Determinism Test** Check if multiple instances of Effectstream nodes generate the same exact state.
- [ ] **E2E Test for Templates** Add E2E Test for Templates.

---
## Non functional requirements

- [ ] **New Name** Update Name to TBD (paima/effectstream)

---
## Documentation

### General Docs
- [ ] **Logs** Missing section about how Logs work. OTel vs TUI vs STDOUT.
- [ ] **Testing** Missing section about how to `test` your dApp (E2E) tests.
- [ ] **Versioning** Missing section about how versioning works (code updates, database, engine updates) 
- [ ] **Deployments** Missing section on how to deploy locally vs production.
- [ ] **What is Effectstream** what-is-effectstream.md is outdated.

---
## Landing
- [ ] **Code** Do we move landing page source to monorepo?
- [ ] **Landing Responsive** Landing responsive is working incorrectly on physical mobile devices.
- [ ] **Documentation Links** Connect "color" boxes with corresponding section in the documentation.