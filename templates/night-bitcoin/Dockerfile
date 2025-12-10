# For macos build & run: 
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t night-bitcoin-sample -f Dockerfile . 
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run night-bitcoin-sample

# Use Ubuntu as base image
FROM denoland/deno:ubuntu-2.5.4

# Update package list and install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    # We have some scripts that use lsof
    lsof \
    # iproute2 is required for ss command - for dkill.
    iproute2 \
    # xz is required for compactc
    xz-utils \
    unzip \
    # Python3 is required for patch.sh
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
# node-gyp is required for the postinstall script to run.
# Initialize core-js running 'postinstall' script requires node, or fails.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Deno installation
RUN deno --version

# Verify Node.js installation
RUN node --version && npm --version

# Install Compact
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN which compact
RUN compact update
RUN compact --version
RUN compact compile --version

# Create working directory
WORKDIR /app

# Copy the patch script
COPY ./patch.sh /app/patch.sh
RUN chmod +x /app/patch.sh

# Clone the repository
COPY . .

RUN deno install --allow-scripts
RUN /app/patch.sh
RUN deno task build:midnight
RUN deno task build:bitcoin

# Frontend dApp
EXPOSE 10599
# Explorer
EXPOSE 10590
# Batcher
EXPOSE 3334
# Midnight Node RPC
EXPOSE 9944
# Midnight Indexer
EXPOSE 8088
# Midnight Proof Server
EXPOSE 6300
# Bitcoin Core RPC
EXPOSE 18443
# Bitcoin Core P2P
EXPOSE 18334
EXPOSE 18433
# Node WS
EXPOSE 8883
# Midnight 
EXPOSE 8080
# Effectstream Node API
EXPOSE 9999
# Fillers
EXPOSE 16101
EXPOSE 16102
EXPOSE 16103
EXPOSE 16104
EXPOSE 16105
EXPOSE 16106
EXPOSE 16107
EXPOSE 16108
EXPOSE 16109
EXPOSE 16110

ENV RUN_IN_DOCKER=true
ENV EFFECTSTREAM_STDOUT=true
CMD ["deno", "task", "dev"]

