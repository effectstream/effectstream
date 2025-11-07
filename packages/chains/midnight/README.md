# @effectstream/midnight

Utilities for working with Midnight contracts in EffectStream.

## read-contract

Provides a context-aware function to read Midnight contract information from JSON files.

### Usage

```typescript
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";

// Read contract with default contract.json filename
const contractInfo = readMidnightContract("contract-counter");

// Read contract with custom filename
const contractInfo = readMidnightContract("contract-eip-20", "contract-eip-20.json");

// With explicit base directory
const contractInfo = readMidnightContract("contract-counter", "contract.json", "/path/to/contracts");
```

### Features

- **Context-aware**: Automatically finds contract files by recursively searching from the current working directory upward through the directory tree
- **Flexible directory structure**: Works with any directory structure - no hardcoded paths required
- **Multiple contracts**: Supports reading multiple contracts with different filenames
- **Caching**: Results are cached per contract location, name, and filename combination
- **Dynamic compiler detection**: Automatically finds the compiler subdirectory in `src/managed/`

### Function Signature

```typescript
function readMidnightContract(
  contractName: string,
  contractFileName?: string,
  baseDir?: string
): MidnightContractInfo
```

### Parameters

- `contractName`: The name of the contract directory (e.g., 'contract-counter', 'contract-eip-20')
- `contractFileName`: Optional. The name of the contract address file (default: 'contract.json')
- `baseDir`: Optional. Explicit base directory override. If not provided, recursively searches from `Deno.cwd()` upward through parent directories, searching up to 5 levels deep in each directory

### Returns

`MidnightContractInfo` object containing:
- `contractAddress`: The deployed contract address
- `contractInfo`: Compiler-generated contract information (circuits, certificates, contracts)
- `zkConfigPath`: Path to the zk configuration directory

## deploy

Deploys a Midnight contract using the provided configuration. This function is context-aware and automatically finds the contract directory and zkConfigPath.

### Usage

```typescript
import { deployMidnightContract, type DeployConfig, type NetworkUrls } from "@effectstream/midnight-contracts/deploy";

// Deploy with default network URLs (local undeployed endpoints)
const config: DeployConfig = {
  contractName: "contract-counter",
  contractFileName: "contract-counter.json",
  contractClass: Counter.Contract,
  witnesses,
  privateStateId: "counterPrivateState",
  initialPrivateState: { privateCounter: 0 },
};

const contractAddress = await deployMidnightContract(config);

// Deploy with custom network URLs
const networkUrls: NetworkUrls = {
  indexer: "http://localhost:8088/api/v1/graphql",
  indexerWS: "ws://localhost:8088/api/v1/graphql/ws",
  node: "http://localhost:9944",
  proofServer: "http://localhost:6300",
};

const contractAddress = await deployMidnightContract(config, networkUrls);
```

### Function Signature

```typescript
function deployMidnightContract(
  config: DeployConfig,
  networkUrls?: NetworkUrls
): Promise<string>
```

### Parameters

- `config`: Deployment configuration object containing:
  - `contractName`: Name of the contract directory (e.g., "contract-counter", "contract-eip-20")
  - `contractFileName`: Output filename for contract address (e.g., "contract-counter.json")
  - `contractClass`: The Contract class to deploy
  - `witnesses`: Witness definitions
  - `privateStateId`: On-chain private state ID
  - `initialPrivateState`: Initial private state object
  - `deployArgs`: Optional deployment arguments array
  - `privateStateStoreName`: Optional private state store name (defaults to contractName-based value)
  - `baseDir`: Optional base directory override for finding contracts
  - `logDir`: Optional log directory path
  - `extractWalletAddress`: Optional flag to extract wallet address info (for contracts that need initialOwner)

- `networkUrls`: Optional network endpoint URLs. If not provided, defaults to local undeployed endpoints:
  - `indexer`: GraphQL indexer HTTP endpoint (default: "http://127.0.0.1:8088/api/v1/graphql")
  - `indexerWS`: GraphQL indexer WebSocket endpoint (default: "ws://127.0.0.1:8088/api/v1/graphql/ws")
  - `node`: Midnight node RPC endpoint (default: "http://127.0.0.1:9944")
  - `proofServer`: Proof server HTTP endpoint (default: "http://127.0.0.1:6300")

### Returns

A Promise that resolves to the deployed contract address as a string.

### Features

- **Context-aware**: Automatically finds contract directory by recursively searching from the current working directory
- **Flexible network configuration**: Use default local endpoints or provide custom network URLs
- **Automatic wallet setup**: Creates and funds a wallet automatically using the genesis mint seed
- **Dynamic compiler detection**: Automatically finds the compiler subdirectory in `src/managed/`
- **Contract address persistence**: Saves the deployed contract address to a JSON file

