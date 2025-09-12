# Quick Start

```sh
# Check for external dependencies
./../check.sh

# Install packages
deno install --allow-scripts && ./patch.sh

# Compile contracts
deno task build:evm
deno task build:midnight

# Launch Paima Engine Node
deno task dev
```

Open [http://localhost:10599](http://localhost:10599)


# Docker

```
# If running in MacOS Apple Silicon set platform
DOCKER_DEFAULT_PLATFORM=linux/amd64

# Build Docker Image
docker build -f ./Dockerfile . -t evm-midnight 

# Run Docker Image
docker run -p 10599:10599 -p 10590:10590 -p 9999:9999 -p 8545:8545 -p 8546:8546 -p 8088:8088 -p 6300:6300 -p 9944:9944 evm-midnight

# Open in your host:
# EVM-Midnight dApp http://localhost:10599/
# Explorer: http://localhost:10590/

```