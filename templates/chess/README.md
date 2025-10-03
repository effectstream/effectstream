# Quick Start


```sh
# Check for external Dependencies
./../check.sh

# Install Dependencies
deno install --allow-scripts && ./patch.sh

# Compile Contracts
deno task build:evm

# Launch Paima Engine Node & Frontend
deno task dev
```

## Development Mode
```sh
# Launch Frontend
deno task -f @chess/frontend dev

```

Open [http://localhost:10599](http://localhost:10599)

## Update TS/Database Schema
```sh
# Update Database
deno task -f @chess/db pgtyped:update
```