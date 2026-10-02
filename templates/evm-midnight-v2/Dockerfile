# Build & run:
# docker build -t evm-midnight -f Dockerfile .
# docker run evm-midnight

FROM oven/bun:1

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    lsof \
    iproute2 \
    xz-utils \
    unzip \
    procps \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN bun --version
RUN node --version && npm --version

# Install Foundry (arch-aware)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then FOUNDRY_ARCH="arm64"; else FOUNDRY_ARCH="amd64"; fi && \
    curl -L "https://github.com/foundry-rs/foundry/releases/download/v1.3.0-rc1/foundry_v1.3.0-rc1_alpine_${FOUNDRY_ARCH}.tar.gz" -o foundry.tar.gz \
    && tar -xzf foundry.tar.gz \
    && mv anvil cast chisel forge /usr/local/bin/ \
    && rm -rf foundry.tar.gz

RUN forge --version && cast --version && anvil --version

# Install Compact
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN which compact
COPY toolchain.json /tmp/toolchain.json
COPY toolchain /tmp/toolchain
RUN bun /tmp/toolchain/compact.ts install \
    && compact --version \
    && bun /tmp/toolchain/compact.ts check

# Pre-download solc 0.8.30 into Hardhat's cache to avoid Bun's broken
# webstreams polyfill triggering during download (known Bun bug in Docker).
# Native binary only exists for linux-amd64; arm64 uses WASM fallback.
RUN mkdir -p /root/.cache/hardhat-nodejs/compilers-v3/wasm && \
    curl -fsSL "https://binaries.soliditylang.org/wasm/list.json" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/wasm/list.json && \
    curl -fsSL "https://binaries.soliditylang.org/wasm/soljson-v0.8.30+commit.73712a01.js" \
      -o /root/.cache/hardhat-nodejs/compilers-v3/wasm/soljson-v0.8.30+commit.73712a01.js && \
    if [ "$(uname -m)" != "aarch64" ]; then \
      mkdir -p /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64 && \
      curl -fsSL "https://binaries.soliditylang.org/linux-amd64/list.json" \
        -o /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/list.json && \
      curl -fsSL "https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01" \
        -o /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01 && \
      chmod +x /root/.cache/hardhat-nodejs/compilers-v3/linux-amd64/solc-linux-amd64-v0.8.30+commit.73712a01; \
    fi

WORKDIR /app

COPY . .

RUN bun install
# Bun on Linux doesn't create workspace symlinks — create them manually
RUN bun -e " \
  const fs = require('fs'); const path = require('path'); \
  const pkg = JSON.parse(fs.readFileSync('package.json','utf8')); \
  for (const pattern of pkg.workspaces || []) { \
    const glob = new Bun.Glob(pattern); \
    for (const dir of glob.scanSync({onlyFiles:false})) { \
      const p = path.join(dir,'package.json'); \
      if (!fs.existsSync(p)) continue; \
      const wp = JSON.parse(fs.readFileSync(p,'utf8')); \
      if (!wp.name) continue; \
      const [scope,name] = wp.name.startsWith('@') ? wp.name.split('/') : [null,wp.name]; \
      const target = path.resolve(dir); \
      const linkDir = scope ? path.join('node_modules',scope) : 'node_modules'; \
      fs.mkdirSync(linkDir,{recursive:true}); \
      const link = path.join(linkDir,name); \
      if (!fs.existsSync(link)) { fs.symlinkSync(target,link); console.log(link+' -> '+target); } \
    } \
  }"
RUN bun run build:evm
RUN bun run build:midnight

# Frontend / Sync API / Midnight node / Midnight indexer /
# Hardhat EVM (parallel) / Hardhat EVM (main) / Midnight proof server
EXPOSE 10599
EXPOSE 9999
EXPOSE 9944
EXPOSE 8088
EXPOSE 8546
EXPOSE 8545
EXPOSE 6300
EXPOSE 4747

ENV NODE_ENV=development
CMD ["bunx", "orchestrator", "start", "--config", "start.dev.ts"]
