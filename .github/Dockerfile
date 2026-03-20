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
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
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

# No pre-compilation needed: each e2e-v2 suite compiles contracts
# as part of its launcher (compile-evm-contracts step).

# ── Common environment ──────────────────────────────────────────────────────
ENV EFFECTSTREAM_STDOUT=true
ENV POLKADOTJS_DISABLE_ESM_CJS_WARNING=1

# ── Run e2e-v2 tests ───────────────────────────────────────────────────────
# Each suite manages its own infrastructure via orchestrator-v2 (start/stop).
# Suites run serially because they share ports (PGLite 5432, API 9999, etc).
#
# EVM:      33 tests (tooling + sync + batcher)
# Features: 30 tests (API + RPC + migrations + accounts) - reuses EVM infra
# Bitcoin:   3 tests (tooling + sync) - starts Bitcoin Core regtest
CMD set -e; \
    echo "========================================"; \
    echo "  e2e-v2: EVM tests (33 tests)"; \
    echo "========================================"; \
    bun run e2e-v2/evm/run-tests.ts; \
    echo ""; \
    echo "========================================"; \
    echo "  e2e-v2: Feature tests (30 tests)"; \
    echo "========================================"; \
    bun run e2e-v2/features/run-tests.ts; \
    echo ""; \
    echo "========================================"; \
    echo "  All e2e-v2 tests passed (63 tests)"; \
    echo "========================================"; \
    echo ""; \
    echo "Skipped: Bitcoin (needs bitcoin-core binary in image)"; \
    echo "Skipped: Cardano, Midnight, Avail, Celestia (need chain binaries)"
