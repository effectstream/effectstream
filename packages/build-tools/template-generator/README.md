# Template Generator

This tool generates a new Effectstream project based on the selected options.

## Usage

```sh
TEMPLATE_PATH=`pwd` deno task -f @effectstream/template-generator start
cd my-project
chmod +x patch.sh
deno install --allow-scripts && ./patch.sh
deno task build:evm  
deno task build:midnight 
# deno task -f @[project-name]/database pgtyped:update
# deno task -f @[project-name]/midnight-contracts midnight-contract:deploy


# deno task build:cardano
# deno task build:avail
# deno task build:bitcoin
deno task dev
```

## Test 
```sh
TEMPLATE_CONFIG_FILE_ALL=true
or 
TEMPLATE_CONFIG_FILE_ALL_FAST=true
```
To skip the interactive prompt and generate the project with all options.

## Packages (& Roadmap)

### General
- [ ] Config Parameters
- [ ] Add links to documentation in each step
- [ ] Maybe this could also scaffold the templates?
- [ ] How do we test this? (We need a non-interactive cli, and ci-cd pipeline)
- [ ] Make this work in the /template folder
- [ ] Documentation

### Contracts/Avail
- [ ] Create base project structure
- [ ] Add empty contract

### Contracts/Bitcoin
- [ ] Pending on implementation.

### Contracts/Cardano
- [ ] Pending on implementation.

### Contracts/EVM
- [ ] Create Contract Management System
- [ ] Add Empty Contract
- [ ] Add ERC20/721/1155 contract
- [ ] Add Effectstream L2 contract
- [ ] Add Inverse* contract

### Contracts/Midnight
Including Contracts/Midnight-Contracts

- [ ] Create Contact Management System

### Shared/Data-Types

### Client/API
- [ ] Add Generic API Endpoint Reading from database 

### Client/Database
- [ ] Add Generic Example Tables

### Client/Batcher
- [ ] Add Generic EVM Batcher Adapter
- [ ] Enable disable code depending on selected chains

### Client/Node
- [ ] LocalhostConfig Enable Sections depending on selected chains
- [ ] LocalhostConfig Enable Dynamic code depending on selected contracts
- [ ] StateMachine create state for grammar
- [ ] Grammar create sections depending on selected contracts

### Frontend/Standalone
- [ ] Working example frontend reading from API
- [ ] Working example including @effectstream/wallets

### Frontend/Integrated Vite-Deno
- [ ] Working example frontend reading from API
- [ ] Working example including @effectstream/wallets

### Root files
- [ ] Readme should contain instructions per chain/contract selected
 