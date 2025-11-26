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


## Docker Build

### Build the image
```
# If running in macos add env variable:
# DOCKER_DEFAULT_PLATFORM=linux/amd64 
docker build -t night-bitcoin-template -f ./Dockerfile .

# Run the container
# DOCKER_DEFAULT_PLATFORM=linux/amd64 
docker run \
  -p 10599:10599 \
  -p 10590:10590 \
  -p 3334:3334 \
  -p 9944:9944 \
  -p 8088:8088 \
  -p 6300:6300 \
  -p 8080:8080 \
  -p 9999:9999 \
  -p 18443:18443 \
  -p 18334:18334 \
  -p 16101-16110:16101-16110 \
  night-bitcoin-template
```