# Effectstream: Chess Template

## Project Structure

```
/
└── templates/
    ├── chess/
    │   └── packages/
    │       ├── client/
    │       │   ├── batcher/                                # "@chess/batcher"
    │       │   ├── database/                               # "@chess/db"
    │       │   └── node/                                   # "@chess/node"
    │       ├── frontend/                                   # "@chess/frontend"
    │       └── shared/
    │           ├── api/                                    # "@chess/api-contract"
    │           ├── contracts/
    │           │   └── evm/                                # "@chess/evm-contracts"
    │           ├── data-types/                             # "@chess/data-types"
    │           ├── game-logic/                             # "@chess/game-logic"
    │           └── utils/                                  # "@chess/utils"
```