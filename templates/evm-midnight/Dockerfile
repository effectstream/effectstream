# For macos build & run: 
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker build -t evm-midnight-sample -f Dockerfile . 
# DOCKER_DEFAULT_PLATFORM=linux/amd64 docker run evm-midnight-sample

# Use Ubuntu as base image
FROM denoland/deno:ubuntu-2.4.1

# # Update package list and install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    # We have some scripts that use lsof
    lsof \
    # iproute2 is required for ss command - for dkill.
    iproute2 \
    # xz is required for compactc
    xz-utils \
    unzip \
    nginx \
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

# Install Compact
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN which compact
RUN compact update
RUN compact --version
RUN compact compile --version

# # Create working directory
WORKDIR /app

# # Copy the patch script
COPY ./patch.sh /app/patch.sh
RUN chmod +x /app/patch.sh

# Clone the repository
COPY . .

COPY ./docker-scripts/nginx.conf /etc/nginx/nginx.conf
COPY ./docker-scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN deno install --allow-scripts
RUN /app/patch.sh
RUN deno task build:evm
RUN deno task build:midnight

# Frontend / Explorer / API / Hardhat 1&2 / Midnight Proof
EXPOSE 10599
EXPOSE 10590
EXPOSE 9999
EXPOSE 9944
EXPOSE 8088
EXPOSE 8546
EXPOSE 8545
EXPOSE 6300
EXPOSE 8080


ENV PAIMA_STDOUT=true
ENTRYPOINT ["/entrypoint.sh"]