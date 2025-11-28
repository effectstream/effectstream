# Effectstream 

## Project Structure

This project is a `deno` monorepo.
There are 4 main parts:
1. `/packages/*`        # Contains the core source code for the project.
2. `/e2e/*`             # That the end-to-end tests for the project.
3. `/templates/**/*`    # Contains template and real example implementations. 
4. `/docs/site/docs/*`  # Holds the documentation for the project.

## Effectstream Packages
```
/
├── docs/
│   └── site/                                               # "@effectstream/docs"
├── packages/
│   ├── batcher/                                            # "@effectstream/batcher"
│   ├── build-tools/
│   │   ├── explorer/                                       # "@effectstream/explorer"
│   │   ├── orchestrator/                                   # "@effectstream/orchestrator"
│   │   └── tui/                                            # "@effectstream/tui"
│   ├── chains/
│   │   ├── evm-contracts/                                  # "@effectstream/evm-contracts"
│   │   ├── evm-hardhat/                                    # "@effectstream/evm-hardhat"
│   │   └── midnight/                                       # "@effectstream/midnight-contracts"
│   ├── effectstream-sdk/
│   │   ├── chain-types/                                    # "@effectstream/chain-types"
│   │   ├── concise/                                        # "@effectstream/concise"
│   │   ├── config/                                         # "@effectstream/config"
│   │   ├── coroutine/                                      # "@effectstream/coroutine"
│   │   ├── crypto/                                         # "@effectstream/crypto"
│   │   ├── events/                                         # "@effectstream/event-client"
│   │   ├── log/                                            # "@effectstream/log"
│   │   ├── precompile/                                     # "@effectstream/precompile"
│   │   ├── utils/                                          # "@effectstream/utils"
│   │   └── wallets/                                        # "@effectstream/wallets"
│   └── node-sdk/
│       ├── batcher/                                        # "@effectstream/batcher-old"
│       ├── db/                                             # "@effectstream/db"
│       ├── db-emulator/                                    # "@effectstream/db-emulator"
│       ├── events/                                         # "@effectstream/event-server"
│       ├── runtime/                                        # "@effectstream/runtime"
│       ├── sm/                                             # "@effectstream/sm"
│       └── sync/                                           # "@effectstream/sync"
```

## Tests
1. Running all tests:
```sh
./run-tests.sh
```
2. Each *.ts file should have a test file in the same folder with the same name but with the .test.ts extension.
3. We are using Deno.test() as test engine. 


## Documentation
Documentation .md files are located in: `/docs/site/docs/home/**/*.md`
