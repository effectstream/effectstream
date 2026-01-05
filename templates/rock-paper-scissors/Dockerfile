# For macos build & run:
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t rock-paper-scissors-sample -f Dockerfile .
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run rock-paper-scissors-sample

# Use Ubuntu as base image
FROM denoland/deno:ubuntu-2.5.4

# # Update package list and install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    # We have some scripts that use lsof
    lsof \
    # iproute2 is required for ss command - for dkill.
    iproute2 \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
# node-gyp is required for the postinstall script to run.
# Initialize core-js running 'postinstall' script requires node, or fails.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# # Verify Deno installation
RUN deno --version

# # Verify Node.js installation
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

# # Copy the patch script
COPY ./patch.sh /app/patch.sh
RUN chmod +x /app/patch.sh

# Clone the repository
COPY . .

RUN deno install --allow-scripts
RUN deno install npm:wait-on
RUN /app/patch.sh
RUN deno task -f @rock-paper-scissors/evm-contracts build:mod

RUN deno task -f @rock-paper-scissors/frontend install
RUN deno task -f @rock-paper-scissors/frontend build

# Frontend / Explorer / Hardhat 1&2 / API / Batcher
EXPOSE 8080
EXPOSE 8545
EXPOSE 9999
EXPOSE 10590

ENV RUN_IN_DOCKER=true
ENV EFFECTSTREAM_STDOUT=true
CMD ["deno", "task", "dev"]
