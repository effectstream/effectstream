# @effectstream/midnight

Utilities for working with Midnight contracts in Paima Engine.

## read-contract

Provides a context-aware function to read Midnight contract information from JSON files.

### Usage

```typescript
import { readMidnightContract } from "@effectstream/midnight/read-contract";

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

