# Use Debian as base image (oven/bun no longer publishes ubuntu tags)
FROM oven/bun:1-debian

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Update package list and install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    gnupg \
    lsb-release \
    unzip \
    sed \
    # We have some scripts that use lsof
    lsof \
    # iproute2 is required for ss command - for fkill.
    iproute2 \
    # xz is required for compactc
    xz-utils \
    clang \
    build-essential \
    llvm \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
# Initialize core-js running 'postinstall' script requires node, or fails.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Bun installation
RUN bun --version

# Verify Node.js installation
RUN node --version && npm --version

# Install Foundry
# RUN curl -L https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_arm64.tar.gz -o foundry.tar.gz \
RUN curl -L https://github.com/foundry-rs/foundry/releases/download/v1.3.0-rc1/foundry_v1.3.0-rc1_alpine_amd64.tar.gz -o foundry.tar.gz \
    && tar -xzf foundry.tar.gz \
    && mv anvil cast chisel forge /usr/local/bin/ \
    && rm -rf foundry.tar.gz

# Verify Foundry installation
RUN forge --version && cast --version && anvil --version

# Create working directory
WORKDIR /app

# Install Compact
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN which compact
RUN compact update 0.28.0
RUN compact update 0.29.0
RUN compact --version
RUN compact compile --version

# # Install compactc prerelease binary
# RUN mkdir -p /root/.compact/versions/0.27.0/x86_64-unknown-linux-musl \
#     && curl -L https://raw.githubusercontent.com/midnightntwrk/compact/main/prerelease/compactc-0.27/compactc_v0.27.0-rc.1_x86_64-unknown-linux-musl.zip -o /tmp/compactc.zip \
#     && unzip -q /tmp/compactc.zip -d /root/.compact/versions/0.27.0/x86_64-unknown-linux-musl \
#     && rm -f /tmp/compactc.zip

# Copy the patch script
COPY ./patch.sh /app/patch.sh
RUN chmod +x /app/patch.sh

# Clone the repository
COPY . .

# Set environment variables for better script execution
ENV NODE_ENV=development

RUN bun install
RUN /app/patch.sh

# Compile contracts needed for imports (uses orchestrator's --only + --no-deps to skip chain dependencies)
RUN bun packages/build-tools/orchestrator-v2/src/cli.ts start \
    --only=build-evm-contracts,compile-evm,compile-midnight-eip20,compile-midnight-counter \
    --no-deps --no-api

# START E2E TESTS
ENV DISABLE_CARDANO=true
ENV DISABLE_BITCOIN=true
ENV DISABLE_AVAIL=true
ENV DISABLE_MIDNIGHT=true
ENV EFFECTSTREAM_ENV=e2e
ENV EFFECTSTREAM_STDOUT=true
ENV POLKADOTJS_DISABLE_ESM_CJS_WARNING=1

CMD bun packages/build-tools/orchestrator-v2/src/cli.ts start --serial --background \
    && bun --elide-lines=0 e2e/client/node/scripts/run-e2e.ts; \
    EXIT=$?; \
    cat .orchestrator-logs/*.log 2>/dev/null; \
    exit $EXIT
