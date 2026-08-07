# Docker / Containerization

Some templates ship a `Dockerfile` that runs the full dev stack (orchestrator → chain nodes → sync → frontend) or the e2e test suite when CMD is overridden. Currently 5 of 21 do: `evm-midnight-v2` and `world-map-2d` (current-gen, the models to copy), plus legacy `dice`, `rock-paper-scissors`, and `multi-chain-token-transfer`. Add one to a new template only if containerized dev/CI is in scope.

## Base image and system deps

Use `oven/bun:1` (Debian trixie with latest Bun). **Do not use `oven/bun:1-ubuntu` — it does not exist.**

```dockerfile
FROM oven/bun:1

RUN apt-get update && apt-get install -y \
    curl \
    lsof \
    iproute2 \
    unzip \
    procps \
    && rm -rf /var/lib/apt/lists/*
```

- `procps` is required — the orchestrator uses `kill` for process shutdown; not in the base image
- `lsof` and `iproute2` are used by orchestrator health checks
- For Midnight templates, also add `xz-utils`

Node.js is needed for postinstall scripts and Hardhat:

```dockerfile
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
```

## Chain-specific deps

### EVM (Foundry + pre-cached solc)

```dockerfile
# Foundry (arch-aware)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then FOUNDRY_ARCH="arm64"; else FOUNDRY_ARCH="amd64"; fi && \
    curl -L "https://github.com/foundry-rs/foundry/releases/download/v1.3.0-rc1/foundry_v1.3.0-rc1_alpine_${FOUNDRY_ARCH}.tar.gz" -o foundry.tar.gz \
    && tar -xzf foundry.tar.gz \
    && mv anvil cast chisel forge /usr/local/bin/ \
    && rm -rf foundry.tar.gz

# Pre-download solc 0.8.30 — Bun's broken webstreams polyfill prevents runtime download
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
```

### Midnight (Compact compiler + xz-utils)

```dockerfile
# Add xz-utils to the system deps
RUN apt-get update && apt-get install -y \
    curl lsof iproute2 xz-utils unzip procps \
    && rm -rf /var/lib/apt/lists/*

# Compact compiler
RUN curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
ENV PATH="/root/.local/bin:$PATH"
RUN compact update 0.31.0
```

## Workspace symlinks (CRITICAL — do not skip)

**Bun does NOT create workspace symlinks in `node_modules/`** — neither on Mac nor on Linux. Sibling packages (`@my-template/database`, `@my-template/contracts-evm`) won't be resolvable. Local dev uses `./link.sh` to materialize them; the Dockerfile does the same operation inline after `bun install`:

```dockerfile
RUN bun install

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
```

Verified still required with Bun 1.3.13. Without it, imports of `@my-template/database` fail with `Cannot find module`.

## Build steps + CMD

```dockerfile
# EVM
RUN bun run build:evm

# Midnight
RUN bun run build:midnight

ENV NODE_ENV=development
CMD ["bunx", "orchestrator", "start", "--config", "start.dev.ts"]
```

To run tests in the container, override CMD: `docker run <image> bun run test`.

## Port exposure

What the current-gen Dockerfiles actually `EXPOSE`:

| Service | Port | EXPOSEd by |
|---|---|---|
| Frontend | 10599 | evm-midnight-v2, world-map-2d |
| Sync API | 9999 | evm-midnight-v2, world-map-2d |
| Hardhat EVM | 8545 | evm-midnight-v2, world-map-2d |
| Hardhat EVM (parallel) | 8546 | evm-midnight-v2, world-map-2d |
| Orchestrator API | 4747 | evm-midnight-v2 only |
| Midnight node | 9944 | evm-midnight-v2 |
| Midnight indexer | 8088 | evm-midnight-v2 |
| Midnight proof server | 6300 | evm-midnight-v2 |

The batcher port (3334) is not EXPOSEd by any shipped Dockerfile — add `EXPOSE 3334` (and 4747 for the daemon API) yourself if the container serves them.

## `.dockerignore`

```
node_modules
.orchestrator-logs
batcher-data
*.log
CLAUDE.md
.git
```

Add chain-specific exclusions:
- EVM: `packages/contracts-evm/build`, `packages/contracts-evm/ignition/deployments`, `packages/contracts-evm/mod.ts`
- Midnight: compiled contract artifacts in `packages/contracts-midnight/`

## Orchestrator config: ALWAYS `cwd`, NEVER `resolveFrom`

In both `start.dev.ts` and `start.test.ts`:

```typescript
// WRONG — breaks in Docker
...launchEvm("@my-template/contracts-evm", { resolveFrom: root }),

// CORRECT
...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
```

`resolveFrom` uses `require.resolve` which goes through Bun's `.bun/` cache; it fails in Docker because workspace packages aren't in `node_modules/`.

## `bunx` cannot resolve subpath exports from symlinked packages

When using `link.sh` or in Docker, `bunx @effectstream/evm-hardhat/remappings-hardhat` fails with a "git clone" error because Bun interprets the subpath as a git URL. Use direct file paths in `package.json` scripts:

```json
"swap:remappings:hardhat": "bun ./node_modules/@effectstream/evm-hardhat/src/remappings/remappings-hardhat.ts --depth=0"
```

Applies to any `bunx` call with a `/` subpath when the package is symlinked.

## README Docker Section

Append to the README of any template that ships a Dockerfile:

````markdown
## Docker

```sh
# If running on macOS Apple Silicon
export DOCKER_DEFAULT_PLATFORM=linux/amd64

# Build
docker build -f ./Dockerfile . -t <template-name>

# Run (dev mode — starts full stack)
docker run -p <port-mappings> <template-name>

# Run tests inside container
docker run <template-name> bun run test
```
````
