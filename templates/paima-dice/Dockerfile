# For macos build & run:
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t dice-sample -f Dockerfile .
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run dice-sample

# Use Ubuntu as base image
FROM oven/bun:1-ubuntu

# # Update package list and install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    # We have some scripts that use lsof
    lsof \
    # iproute2 is required for ss command - for fkill.
    iproute2 \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
# node-gyp is required for the postinstall script to run.
# Initialize core-js running 'postinstall' script requires node, or fails.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Bun installation
RUN bun --version

# Verify Node.js installation
RUN node --version && npm --version

# Install Foundry
RUN curl -L https://github.com/foundry-rs/foundry/releases/download/v1.3.0-rc1/foundry_v1.3.0-rc1_alpine_amd64.tar.gz -o foundry.tar.gz \
    && tar -xzf foundry.tar.gz \
    && mv anvil cast chisel forge /usr/local/bin/ \
    && rm -rf foundry.tar.gz

# Verify Foundry installation
RUN forge --version && cast --version && anvil --version

# # Create working directory
WORKDIR /app

# # Copy the patch script (if exists)
# COPY ./patch.sh /app/patch.sh
# RUN chmod +x /app/patch.sh || true

# Clone the repository
COPY . .

RUN bun install
# RUN /app/patch.sh || true
RUN bun run --filter @paima-dice/contracts-evm build:mod

RUN cd packages/frontend && node esbuild.js

# Frontend / Hardhat / API
EXPOSE 10599
EXPOSE 8545
EXPOSE 9999

ENV RUN_IN_DOCKER=true
ENV EFFECTSTREAM_STDOUT=true
CMD ["bun", "run", "dev"]
