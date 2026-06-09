# ══════════════════════════════════════════════════════════════════════════════
# Stage 1: base — OS packages, bun, node, foundry
# ══════════════════════════════════════════════════════════════════════════════
# Use Debian 13 (trixie) — celestia-appd requires glibc 2.38+.
# Avail-node uses ubuntu-2404 binary on trixie (compatible glibc).
FROM debian:trixie-slim AS base

ENV DEBIAN_FRONTEND=noninteractive

# Install bun
RUN apt-get update && apt-get install -y curl unzip && \
    curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.10" && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx && \
    rm -rf /var/lib/apt/lists/*

# Install required system dependencies
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
    # procps provides kill - required by orchestrator port cleanup between suites.
    procps \
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

RUN bun --version && node --version && npm --version

# Install Foundry
# RUN curl -L https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_arm64.tar.gz -o foundry.tar.gz \
RUN curl -L https://github.com/foundry-rs/foundry/releases/download/v1.3.0-rc1/foundry_v1.3.0-rc1_alpine_amd64.tar.gz -o foundry.tar.gz \
    && tar -xzf foundry.tar.gz \
    && mv anvil cast chisel forge /usr/local/bin/ \
    && rm -rf foundry.tar.gz

RUN forge --version && cast --version && anvil --version

# ══════════════════════════════════════════════════════════════════════════════
# Stage 2: compact — Midnight compact compiler (hits GitHub API)
# ══════════════════════════════════════════════════════════════════════════════
FROM base AS compact

WORKDIR /app

RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN which compact
RUN compact update 0.30.0
RUN compact --version
RUN compact compile --version

# ══════════════════════════════════════════════════════════════════════════════
# Stage 3: solc — Pre-download Hardhat solc compiler
# ══════════════════════════════════════════════════════════════════════════════
FROM base AS solc

# Pre-download solc 0.8.30 (native + WASM + list indexes) into Hardhat's
# cache so it never triggers Bun's broken webstreams polyfill during download.
# Hardhat downloads list.json (compiler index) first, then the binary/wasm.
# The webstreams crash can happen on ANY of these downloads.
RUN mkdir -p /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64 \
             /root/.cache/hardhat-nodejs/compilers-v3/wasm && \
    curl -fsSL "https://binaries.soliditylang.org/linux-amd64/list.json" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/list.json && \
    curl -fsSL "https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01 && \
    chmod +x /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01 && \
    curl -fsSL "https://binaries.soliditylang.org/wasm/list.json" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/wasm/list.json && \
    curl -fsSL "https://binaries.soliditylang.org/wasm/soljson-v0.8.30+commit.73712a01.js" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/wasm/soljson-v0.8.30+commit.73712a01.js

# ══════════════════════════════════════════════════════════════════════════════
# Stage 4: final — merge toolchains, install deps, run tests
# ══════════════════════════════════════════════════════════════════════════════
FROM base AS final

WORKDIR /app

# Copy compact compiler from stage 2
COPY --from=compact /root/.local/bin/ /root/.local/bin/
COPY --from=compact /root/.compact/ /root/.compact/
ENV PATH="/root/.local/bin:$PATH"

# Copy solc cache from stage 3
COPY --from=solc /root/.cache/hardhat-nodejs/ /root/.cache/hardhat-nodejs/

# Copy the patch script
COPY ./patch.sh /app/patch.sh
RUN chmod +x /app/patch.sh

# Copy the repository
COPY . .

# Set environment variables for better script execution
ENV NODE_ENV=development

RUN bun install
RUN /app/patch.sh

# `bun install` doesn't fetch browsers; the wallets-ui suite drives Chromium via
# Playwright. Run from the package dir so bunx uses the pinned playwright (a
# floating version could fetch a mismatched browser revision).
RUN cd /app/e2e/wallets-ui && bunx playwright install --with-deps chromium

# Make the Chromium installed above discoverable to the template Phase C frontend
# tests. Those tests launch Chromium via playwright-core through findChrome(),
# which probes CHROME_PATH first; without this it fell through to a non-existent
# /usr/bin/google-chrome and the template-tests job threw at chromium.launch().
# Pointing CHROME_PATH at the Playwright browser keeps it version-matched to the
# playwright-core the templates launch it with.
RUN CHROME_BIN="$(find /root/.cache/ms-playwright -type f -name chrome -path '*chrome-linux*' | head -1)" \
 && test -n "$CHROME_BIN" \
 && ln -sf "$CHROME_BIN" /usr/local/bin/chromium-test \
 && /usr/local/bin/chromium-test --version
ENV CHROME_PATH=/usr/local/bin/chromium-test

# ── Common environment ──────────────────────────────────────────────────────
ENV EFFECTSTREAM_STDOUT=true
ENV POLKADOTJS_DISABLE_ESM_CJS_WARNING=1
ENV CELESTIA_FORCE_NO_BBR=1
ENV E2E_MAX_RETRIES=3

# ── Run e2e tests ─────────────────────────────────────────────────────────
# Each suite manages its own infrastructure via orchestrator (start/stop).
# Suites run serially because they share ports (PGLite 5432, API 9999, etc).
CMD ["/bin/bash", "/app/.github/run-e2e.sh"]
