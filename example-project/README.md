# Quick Start


```sh
# Install Dependencies
deno install --allow-scripts && ./patch.sh

# Compile Contracts
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