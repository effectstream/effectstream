# Quick Start

```sh
# Check for external dependencies
./check.sh

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
docker run evm-midnight
```