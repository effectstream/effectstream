---
title: "@effectstream/npm-midnight-indexer"
description: "Downloads and runs the Midnight Indexer. It needs a running Midnight Node"
sidebar_label: "midnight-indexer"
---

{/* Generated from packages/binaries/midnight-indexer/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/npm-midnight-indexer`](https://www.npmjs.com/package/@effectstream/npm-midnight-indexer)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/binaries/midnight-indexer)

A Node.js package that downloads and runs the
[Midnight](https://midnight.network) Indexer. The indexer requires a running
Midnight Node (see `@effectstream/npm-midnight-node`) to function properly.

## Overview

This package provides flexible execution options for the Midnight Indexer:

- **Docker mode**: Runs the indexer in a Docker container (recommended)
- **Binary mode**: Downloads and runs the native binary locally (Linux, Windows,
  macOS arm64)

### Platform Support

| Platform | Docker | Binary |
| -------- | ------ | ------ |
| macOS    | ✅ Yes | ✅ Yes |
| Linux    | ✅ Yes | ✅ Yes |
| Windows  | ❌ No  | ✅ Yes |

## Installation

```bash
bun add @effectstream/npm-midnight-indexer
# or
npm install @effectstream/npm-midnight-indexer
```

## Prerequisites

### For Docker Mode

- Docker installed and running
- `APP__INFRA__SECRET` environment variable (required)

### For Binary Mode

- Supported platform (Linux/macOS ARM64)
- Local Midnight Node and Proof Server running on standard ports. But they can
  be set using env variables
- `APP__INFRA__SECRET` environment variable (required)

## Usage

### Command Line Options

```bash
node index.js [options] [args...]
```

**Options:**

- `--docker` - Force Docker execution
- `--binary` - Force binary execution (available on Linux, Windows, macOS arm64)
- `--help` - Show help information

**Examples:**

```bash
# Force Docker usage
APP__INFRA__SECRET=mysecret node index.js --docker

# Force binary usage (Linux/Windows/macOS arm64)
APP__INFRA__SECRET=mysecret node index.js --binary

# Interactive mode - prompts for Docker vs binary choice
APP__INFRA__SECRET=mysecret node index.js

# Show help
node index.js --help
```

## Environment Variables

The indexer supports several environment variables with different defaults based
on execution mode:

| Variable                        | Required | Docker Default             | Binary Default          | Description                    |
| ------------------------------- | -------- | -------------------------- | ----------------------- | ------------------------------ |
| `APP__INFRA__SECRET`            | Yes      | -                          | -                       | Secret key for the application |
| `LEDGER_NETWORK_ID`             | No       | `Undeployed`               | `Undeployed`            | Ledger network identifier      |
| `SUBSTRATE_NODE_WS_URL`         | No       | `ws://node:9944`           | `ws://localhost:9944`   | Substrate node WebSocket URL   |
| `FEATURES_WALLET_ENABLED`       | No       | `true`                     | `true`                  | Enable wallet features         |
| `APP__INFRA__PROOF_SERVER__URL` | No       | `http://proof-server:6300` | `http://localhost:6300` | Proof server URL               |
| `APP__INFRA__NODE__URL`         | No       | `ws://node:9944`           | `ws://localhost:9944`   | Node WebSocket URL             |

### Environment Variable Examples

```bash
# Minimal Docker setup
APP__INFRA__SECRET=A5F07FCAC914A181EC0998CCCA68312DA5F07FCAC914A181EC0998CCCA68312D \
node index.js --docker

# Custom configuration
APP__INFRA__SECRET=mysecret \
LEDGER_NETWORK_ID=CustomNetwork \
SUBSTRATE_NODE_WS_URL=ws://localhost:9944 \
APP__INFRA__PROOF_SERVER__URL=http://localhost:6300 \
node index.js --docker

# Binary mode (uses localhost defaults automatically)
APP__INFRA__SECRET=mysecret node index.js --binary
```

## Docker Mode Details

When using Docker mode, the indexer:

1. **Pulls the latest image**: `midnightntwrk/indexer-standalone`
2. **Maps port 8088**: Container port 8088 → Host port 8088
3. **Uses container networking**: Defaults work with Docker Compose setups
4. **Auto-cleanup**: Removes existing containers before starting new ones

### Docker Command Generated

The package generates Docker commands similar to:

```bash
docker run --rm --name midnight-local-indexer \
  -p 8088:8088 \
  -e LEDGER_NETWORK_ID=Undeployed \
  -e SUBSTRATE_NODE_WS_URL=ws://node:9944 \
  -e APP__INFRA__SECRET=A5F07FCAC914A181EC0998CCCA68312DA5F07FCAC914A181EC0998CCCA68312D \
  -e FEATURES_WALLET_ENABLED=true \
  -e APP__INFRA__PROOF_SERVER__URL=http://proof-server:6300 \
  -e APP__INFRA__NODE__URL=ws://node:9944 \
  midnightntwrk/indexer-standalone
```

## Binary Mode Details

When using binary mode, the indexer:

1. **Downloads platform-specific binary** if not already present
2. **Uses localhost URLs** for all service connections
3. **Runs natively** on the host system

## Path Resolution

The indexer relies on two user-supplied file paths and **both are interpreted
relative to the process’s current working directory (CWD)** when they are not
absolute:

| Configuration location             | Purpose                                      | If relative, resolved against                                             |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| `CONFIG_FILE` environment variable | Location of the YAML config file             | The directory you launch `node index.js …` from (or the Docker `WORKDIR`) |
| `infra.storage.cnn_url` in YAML    | SQLite database used by the standalone build | The CWD at runtime of the indexer process                                 |

### Practical tips

1. Prefer absolute paths when you need to be explicit.
2. In **binary mode** this package sets the CWD to the bundled
   `indexer-standalone` folder, so a default `cnn_url: "./indexer.sqlite"` ends
   up next to the binary.
3. In **Docker mode** the image’s `WORKDIR` is `/opt/indexer-standalone`.
   Bind-mount volumes accordingly if you want the database file somewhere else.

---

### Supported Binary Platforms

- Linux ARM64 (`linux-arm64`)
- Linux AMD64 (`linux-amd64`)
- macOS ARM64 (`macos-arm64`)

## Troubleshooting

### Common Issues

**"Docker is not installed or not available"**

- Install Docker Desktop or Docker Engine
- Ensure Docker is running
- Check Docker is accessible from command line: `docker --version`

**"APP__INFRA__SECRET environment variable is required"**

- Set the secret: `export APP__INFRA__SECRET=your_secret_here`
- Or pass inline: `APP__INFRA__SECRET=your_secret node index.js --docker`
- Required for both Docker and binary execution modes

**"Binary execution is only supported on macOS ARM64"**

- Use `--docker` flag or run without flags to use Docker automatically
- Install Docker if not already installed

**"Failed to start midnight-indexer"**

- Check if ports 8088, 6300, 9944 are available
- Verify Midnight Node is running and accessible
- Check environment variables are correctly set

### Logs and Debugging

The indexer outputs detailed logs including:

- Download progress for binaries
- Docker pull progress
- Process IDs and status
- Error messages with suggestions

## Development

### Package Structure

```
npm-midnight-indexer/
├── index.js              # Main entry point
├── binary.js             # Binary download logic
├── docker.js             # Docker execution logic
├── run_midnight_indexer.js # Binary execution logic
├── package.json          # Package configuration
└── README.md            # This file
```

### Testing

```bash
# Test Docker detection
node -e "const { checkIfDockerExists } = require('./docker.js'); checkIfDockerExists().then(console.log)"

# Test help
node index.js --help

# Test platform detection
node -e "console.log('Platform:', require('os').platform())"
```

## License

ISC

## Support

For issues related to:

- **This package**: Open an issue in the repository
- **Midnight Protocol**: Visit [midnight.network](https://midnight.network)
- **Docker**: Check [Docker documentation](https://docs.docker.com/)

## Related Links

- [Midnight Network](https://midnight.network)
- [Docker Hub - Midnight Indexer](https://hub.docker.com/r/midnightntwrk/indexer-standalone)
- [Node.js](https://nodejs.org/)
