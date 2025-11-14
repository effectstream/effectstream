# night-bitcoin Quick Start

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

Open [http://localhost:10599](http://localhost:10599)