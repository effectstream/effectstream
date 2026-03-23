# Use Debian 12 (bookworm) — avail-node binary doesn't support Debian 13 yet.
# Install bun manually since oven/bun:1-debian moved to Debian 13.
FROM debian:bookworm-slim

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Install bun
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.10" && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx && \
    rm -rf /var/lib/apt/lists/*

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
RUN compact update 0.30.0
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

# NOTE: EVM contract pre-compilation moved to runtime (run-e2e.sh)
# to avoid solc WASM download failures during Docker build.

# ── Common environment ──────────────────────────────────────────────────────
ENV EFFECTSTREAM_STDOUT=true
ENV POLKADOTJS_DISABLE_ESM_CJS_WARNING=1

# ── Run e2e-v2 tests ───────────────────────────────────────────────────────
# Each suite manages its own infrastructure via orchestrator-v2 (start/stop).
# Suites run serially because they share ports (PGLite 5432, API 9999, etc).
CMD ["/bin/bash", "/app/.github/run-e2e.sh"]
