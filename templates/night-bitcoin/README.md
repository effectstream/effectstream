# Night-Bitcoin Quick Start


## Prerequisites

* Run `./../check.sh` to check for external dependencies
* Midnight Wallet that supports undeployed networks (e.g., Lace MidnightPreview Wallet)
* Bitcoin Wallet that supports regtest (e.g., Sparrow) 

```sh
# Check for external dependencies
./../check.sh

# Install packages
deno install --allow-scripts && ./patch.sh

# Compile contracts
deno task build:midnight
deno task build:bitcoin

# Launch Paima Engine Node
deno task dev
```

Once the `sync` process is running, open [http://localhost:10599](http://localhost:10599)`